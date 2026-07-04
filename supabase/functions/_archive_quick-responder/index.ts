// supabase/functions/weekly-champion-and-challenge/index.ts
//
// Combined Weekly Runner
// ──────────────────────
// Fires every Sunday at 20:00 UTC via pg_cron.
//
// For each active org, in sequence:
//   1. Declare the weekly champion (from this week's awarded enrollments)
//   2. Generate next week's community AI challenge
//   3. Post ONE combined platform-news announcement:
//      "[Champion name] wins this week + here's next week's challenge"
//
// Can be invoked manually:
//   curl -X POST .../weekly-champion-and-challenge \
//     -H 'Authorization: Bearer <service_role_key>' \
//     -d '{"org_id":"oloibiri","dry_run":true}'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TiedLearner {
  enrollment_id: string;
  user_id: string;
  display_name: string;
  tier: string;
  tier_label: string;
  reflection_text: string;
  impact_evaluation: Record<string, unknown>;
  challenge_title: string;
  challenge_description: string;
}

interface TiebreakResult {
  winner_user_id: string;
  reasoning: string;
}

interface ChampionResult {
  status: 'declared' | 'already_declared' | 'no_submissions' | 'no_valid_tiers';
  champion_name?: string;
  champion_user_id?: string;
  winning_tier?: string;
  winning_tier_label?: string;
  champion_story?: string;
  was_tiebreak?: boolean;
  tiebreak_reasoning?: string;
}

interface ChallengeTemplate {
  slug: string;
  label: string;
  community_roles: string[];
  tier_options: Array<'seed' | 'scout' | 'bridge' | 'builder' | 'multiplier'>;
  domain_context: string;
  example_actions: string[];
}

interface OrgConfig {
  id: string;
  display_name: string;
  location: string;
  dominant_livelihoods: string;
}

interface GeneratedChallenge {
  title: string;
  description: string;
  challenge_mode_intro: string;
  challenge_instruction: string;
  return_question_1: string;
  return_question_2: string;
  return_question_3: string | null;
  community_role: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_ORDER: Record<string, number> = {
  multiplier: 5, builder: 4, bridge: 3, scout: 2, seed: 1,
};

const TIER_LABELS: Record<string, string> = {
  multiplier: 'Village Leader',
  builder:    'AI for Good',
  bridge:     'Community Connector',
  scout:      'Problem Finder',
  seed:       'Community Teacher',
};

const ORG_CONFIGS: OrgConfig[] = [
  {
    id: 'oloibiri',
    display_name: 'Davidson AI Innovation Center — Oloibiri',
    location: 'Oloibiri, Ogbia LGA, Bayelsa State, Niger Delta, Nigeria',
    dominant_livelihoods:
      'fishing (Kolo Creek, River Nun), cassava farming, plantain, petty trade, ' +
      'animal keeping (goats, poultry), healthcare access challenges, oil contamination effects on livelihoods',
  },
  {
    id: 'ibiade',
    display_name: 'vAI Hub — Ibiade',
    location: 'Ibiade, Ogun State, Nigeria',
    dominant_livelihoods:
      'cassava farming, maize, cowpea, cocoa, oil palm, Lagos market access ' +
      'via Sagamu road, small business and trade, animal keeping',
  },
];

const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    slug: 'ai-ambassadors',
    label: 'AI Ambassadors',
    community_roles: ['family', 'general'],
    tier_options: ['seed', 'scout'],
    domain_context: 'Trains learners to explain AI concepts to community members — especially older adults, farmers, and parents — using simple language, local analogies, and handling scepticism.',
    example_actions: [
      'Explain what AI is to a grandparent using a farming analogy',
      'Demonstrate one AI tool to a family member and answer their questions',
      'Find out what a community elder thinks AI might change in the village',
      'Teach a younger sibling one thing AI can help with in school',
    ],
  },
  {
    slug: 'agriculture',
    label: 'Agriculture Consultant',
    community_roles: ['farmer'],
    tier_options: ['scout', 'bridge', 'builder'],
    domain_context: 'Trains learners to advise farmers on crop disease, pest damage, soil and water problems, post-harvest loss, and market access. Key crops: cassava, maize, yam, plantain. Key threats: Fall Armyworm, Cassava Mosaic Disease, flooding.',
    example_actions: [
      'Find a farmer with a crop problem and document the symptoms',
      'Help a farmer use AI to identify a pest affecting their crop',
      'Bring a farmer with a cassava disease problem to the hub for an AI consultation',
    ],
  },
  {
    slug: 'fishing',
    label: 'Fishing Consultant',
    community_roles: ['fisher'],
    tier_options: ['scout', 'bridge', 'builder'],
    domain_context: 'Helps learners advise fishers on catch problems, aquaculture pond management, fish processing and market access, oil contamination reporting. Key context: Niger Delta, Kolo Creek, River Nun.',
    example_actions: [
      'Talk to a fisher about how their catches have changed in the last year',
      'Find a fisher dealing with an oil contamination problem and document it',
      'Bring a fisher to the hub to get AI advice on a pond disease problem',
    ],
  },
  {
    slug: 'healthcare',
    label: 'Healthcare Navigator',
    community_roles: ['health', 'family'],
    tier_options: ['seed', 'scout', 'bridge', 'builder'],
    domain_context: 'Trains learners to triage community health problems using WHO IMCI protocols. Key diseases: malaria, pneumonia, typhoid, diarrhoea, malnutrition. Role: triage and refer, not diagnose.',
    example_actions: [
      'Teach a mother the WHO danger signs for malaria in children under 5',
      'Help a family member understand when to go to the clinic vs treat at home',
      'Bring a community member with a health concern to the hub for AI-assisted triage',
    ],
  },
  {
    slug: 'entrepreneurship',
    label: 'Entrepreneurship Consultant',
    community_roles: ['entrepreneur'],
    tier_options: ['seed', 'scout', 'bridge', 'builder'],
    domain_context: 'Trains learners to advise small business owners on starting up, pricing, marketing (especially WhatsApp Business), record-keeping, and solving business problems.',
    example_actions: [
      'Find a local trader and ask them how they currently find customers',
      'Help a small business owner set up WhatsApp Business on their phone',
      'Bring a trader with a business problem to the hub for an AI consultation',
    ],
  },
  {
    slug: 'animal-husbandry',
    label: 'Animal Husbandry',
    community_roles: ['animal-keeper'],
    tier_options: ['scout', 'bridge', 'builder'],
    domain_context: 'Trains learners to advise on poultry, goat/sheep, cattle, and pig health. Key diseases: Newcastle (poultry), PPR (goats/sheep), African Swine Fever (pigs). Core principle: isolate sick animals, check vaccination history.',
    example_actions: [
      'Talk to someone who keeps chickens and find out when they last vaccinated',
      'Help a goat keeper understand the signs of PPR and when to call for help',
      'Bring someone with sick animals to the hub for an AI-assisted diagnosis',
    ],
  },
];

const TIER_ROTATION: Array<'seed' | 'scout' | 'bridge' | 'builder' | 'multiplier'> = [
  'seed', 'scout', 'bridge', 'scout', 'builder', 'scout', 'bridge', 'builder',
];

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405 });
  }

  let body: { org_id?: string; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  const targetOrgs = body.org_id
    ? ORG_CONFIGS.filter(o => o.id === body.org_id)
    : ORG_CONFIGS;

  const dryRun = body.dry_run ?? false;
  const results: Record<string, unknown> = {};

  // Week bounds for champion declaration (closing week)
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(weekEnd);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  for (const org of targetOrgs) {
    try {
      // ── Step 1: Declare champion ───────────────────────────────────────────
      const champion = await declareChampion(
        supabase, anthropic, org.id, weekStartStr, weekEndStr, dryRun,
      );

      // ── Step 2: Generate next week's challenge ─────────────────────────────
      const challenge = await generateChallenge(supabase, anthropic, org, dryRun);

      // ── Step 3: Post combined news announcement ────────────────────────────
      if (!dryRun) {
        await postCombinedNews(supabase, org, champion, challenge);
      }

      results[org.id] = { champion, challenge: dryRun ? challenge : { title: (challenge as any).title, slug: (challenge as any).slug } };
    } catch (err) {
      results[org.id] = { error: String(err) };
    }
  }

  return new Response(JSON.stringify({ ok: true, dry_run: dryRun, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// ─── Step 1: Declare champion ─────────────────────────────────────────────────

async function declareChampion(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  orgSlug: string,
  weekStartStr: string,
  weekEndStr: string,
  dryRun: boolean,
): Promise<ChampionResult> {

  // Check if already declared
  const { data: existing } = await supabase
    .from('weekly_champions')
    .select('id, champion_name, winning_tier, winning_tier_label, champion_story, was_tiebreak, tiebreak_reasoning')
    .eq('org_id', orgSlug)
    .eq('week_start', weekStartStr)
    .limit(1);

  if (existing && existing.length > 0) {
    const e = existing[0];
    return {
      status: 'already_declared',
      champion_name: e.champion_name,
      winning_tier: e.winning_tier,
      winning_tier_label: e.winning_tier_label,
      champion_story: e.champion_story,
      was_tiebreak: e.was_tiebreak,
      tiebreak_reasoning: e.tiebreak_reasoning,
    };
  }

  const weekEnd = new Date(weekEndStr);

  // Fetch awarded enrollments
  const { data: enrollments, error: enrollErr } = await supabase
    .from('challenge_enrollments')
    .select(`
      id, learner_id, action_taken, impact_observed, extra_detail,
      impact_evaluation, tier_awarded, awarded_at,
      community_challenges!inner ( title, description, org_id, week_start )
    `)
    .eq('community_challenges.org_id', orgSlug)
    .eq('status', 'awarded')
    .gte('awarded_at', new Date(weekEnd.getTime() - 6 * 86400000).toISOString())
    .lt('awarded_at', new Date(weekEnd.getTime() + 86400000).toISOString());

  if (enrollErr) throw new Error(`Enrollment query failed: ${enrollErr.message}`);
  if (!enrollments || enrollments.length === 0) return { status: 'no_submissions' };

  // Fetch display names
  const learnerIds = [...new Set(enrollments.map(e => e.learner_id))];
  const { data: profiles } = await supabase
    .from('profiles').select('id, name').in('id', learnerIds);
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p.name]));

  // Fill missing from auth.users
  const missingIds = learnerIds.filter(id => !profileMap.has(id));
  if (missingIds.length > 0) {
    const { data: authUsers } = await supabase
      .from('users').select('id, raw_user_meta_data').in('id', missingIds).schema('auth');
    for (const u of authUsers ?? []) {
      const name = u.raw_user_meta_data?.username || u.raw_user_meta_data?.full_name
        || u.raw_user_meta_data?.name || u.raw_user_meta_data?.email || 'Unknown';
      profileMap.set(u.id, name);
    }
  }

  // Find highest tier
  const highestRank = Math.max(...enrollments.map(e => TIER_ORDER[e.tier_awarded] ?? 0));
  if (highestRank === 0) return { status: 'no_valid_tiers' };

  const highestTier = Object.entries(TIER_ORDER).find(([, rank]) => rank === highestRank)![0];

  const topLearners: TiedLearner[] = enrollments
    .filter(e => e.tier_awarded === highestTier)
    .map(e => ({
      enrollment_id: e.id,
      user_id: e.learner_id,
      display_name: profileMap.get(e.learner_id) ?? 'Unknown',
      tier: e.tier_awarded,
      tier_label: TIER_LABELS[e.tier_awarded] ?? e.tier_awarded,
      reflection_text: [e.action_taken, e.impact_observed, e.extra_detail].filter(Boolean).join('\n\n'),
      impact_evaluation: e.impact_evaluation ?? {},
      challenge_title: (e.community_challenges as any)?.title ?? '',
      challenge_description: (e.community_challenges as any)?.description ?? '',
    }));

  let championUserId: string;
  let championName: string;
  let wasTiebreak = false;
  let tiebreakReasoning: string | undefined;

  if (topLearners.length === 1) {
    championUserId = topLearners[0].user_id;
    championName = topLearners[0].display_name;
  } else {
    wasTiebreak = true;
    const result = await runTiebreak(anthropic, topLearners, orgSlug);
    championUserId = result.winner_user_id;
    tiebreakReasoning = result.reasoning;
    championName = topLearners.find(l => l.user_id === championUserId)?.display_name ?? 'Unknown';
  }

  const championRecord = topLearners.find(l => l.user_id === championUserId)!;
  const championStory = championRecord?.reflection_text ?? null;

  if (!dryRun) {
    const { error: insertErr } = await supabase.from('weekly_champions').insert({
      org_id: orgSlug,
      week_start: weekStartStr,
      week_end: weekEndStr,
      champion_user_id: championUserId,
      champion_name: championName,
      winning_tier: highestTier,
      winning_tier_label: TIER_LABELS[highestTier],
      was_tiebreak: wasTiebreak,
      tiebreak_reasoning: tiebreakReasoning ?? null,
      tied_learner_count: wasTiebreak ? topLearners.length : null,
      champion_story: championStory,
    });
    if (insertErr) throw new Error(`Insert champion failed: ${insertErr.message}`);
  }

  return {
    status: 'declared',
    champion_name: championName,
    champion_user_id: championUserId,
    winning_tier: highestTier,
    winning_tier_label: TIER_LABELS[highestTier],
    champion_story: championStory ?? undefined,
    was_tiebreak: wasTiebreak,
    tiebreak_reasoning: tiebreakReasoning,
  };
}

// ─── Step 2: Generate next week's challenge ───────────────────────────────────

async function generateChallenge(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  org: OrgConfig,
  dryRun: boolean,
): Promise<unknown> {

  // Next week's Monday–Sunday window
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  const nextSunday = new Date(nextMonday);
  nextSunday.setUTCDate(nextMonday.getUTCDate() + 6);

  const weekStart = nextMonday.toISOString().slice(0, 10);
  const weekEnd   = nextSunday.toISOString().slice(0, 10);

  if (!dryRun) {
    const { error: expireErr } = await supabase.rpc('expire_old_enrollments');
    if (expireErr) console.error('expire_old_enrollments:', expireErr.message);
  }

  // Avoid repeating last week's slug
  const { data: lastChallenge } = await supabase
    .from('community_challenges').select('community_impact_slug')
    .eq('org_id', org.id).order('week_start', { ascending: false }).limit(1).single();

  const lastSlug = lastChallenge?.community_impact_slug ?? null;
  const weekNumber = Math.floor(
    (nextMonday.getTime() - new Date('2025-01-06').getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  const candidateTemplates = CHALLENGE_TEMPLATES.filter(t => t.slug !== lastSlug);
  const template = candidateTemplates[weekNumber % candidateTemplates.length];
  const tier = chooseTier(org.id, weekNumber, template);
  const generated = await generateChallengeContent(anthropic, org, template, tier, weekStart);

  if (dryRun) {
    return { dry_run: true, weekStart, weekEnd, slug: template.slug, tier, title: generated.title };
  }

  // Deactivate previous challenge
  await supabase.from('community_challenges')
    .update({ active: false }).eq('org_id', org.id).eq('active', true);

  const { data: inserted, error: insertErr } = await supabase
    .from('community_challenges').insert({
      org_id:                org.id,
      week_start:            weekStart,
      week_end:              weekEnd,
      title:                 generated.title,
      description:           generated.description,
      community_impact_slug: template.slug,
      tier_target:           tier,
      challenge_mode_intro:  generated.challenge_mode_intro,
      challenge_instruction: generated.challenge_instruction,
      return_question_1:     generated.return_question_1,
      return_question_2:     generated.return_question_2,
      return_question_3:     generated.return_question_3,
      community_role:        generated.community_role,
      active:                true,
    }).select().single();

  if (insertErr) throw new Error(`Insert challenge: ${insertErr.message}`);

  return {
    challenge_id: inserted.id,
    weekStart,
    weekEnd,
    slug: template.slug,
    tier,
    title: generated.title,
    description: generated.description,
    challenge_instruction: generated.challenge_instruction,
  };
}

// ─── Step 3: Post combined news announcement ──────────────────────────────────

async function postCombinedNews(
  supabase: ReturnType<typeof createClient>,
  org: OrgConfig,
  champion: ChampionResult,
  challenge: unknown,
) {
  const ch = challenge as any;
  const orgName = org.id === 'oloibiri' ? 'Oloibiri' : 'Ibiade';

  // ── Champion section ──
  let championSection = '';
  if (champion.status === 'declared' || champion.status === 'already_declared') {
    const name = champion.champion_name!;
    const tierLabel = champion.winning_tier_label!;
    const storySnippet = champion.champion_story
      ? ` Here is what made their work stand out: "${champion.champion_story.slice(0, 400).trim()}${champion.champion_story.length > 400 ? '…' : ''}"`
      : '';

    championSection = champion.was_tiebreak
      ? `🏆 This week's Community Champion is ${name} (${tierLabel})!${storySnippet} ${champion.tiebreak_reasoning ?? ''} Congratulations ${name}!`
      : `🏆 This week's Community Champion is ${name}, earning the ${tierLabel} tier!${storySnippet} Congratulations ${name}!`;
  } else {
    championSection = `No champion was declared this week — no qualifying submissions were received. Go out into the community and make it count next week, ${orgName}!`;
  }

  // ── New challenge section ──
  const challengeSection = ch?.title
    ? `\n\n🌍 Next Week's Challenge: "${ch.title}"\n${ch.description ?? ''}\n\nGo to your dashboard to take the challenge and get started.`
    : '\n\nNext week\'s challenge is now live on your dashboard. Go check it out!';

  const body = `${championSection}${challengeSection}`;

  const title = champion.champion_name
    ? `🏆 ${champion.champion_name} is this week's Champion + New Challenge Inside`
    : `🌍 New Community Challenge for ${orgName}`;

  try {
    const newsUrl = Deno.env.get('SUPABASE_URL')!
      .replace('supabase.co', 'vercel.app')
      .replace('https://wohmsbeygxrbwogrggkq.', 'https://girls-aiing-and-vibing.');

    await fetch(`${newsUrl}/api/platform-news`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-news-secret': Deno.env.get('NEWS_API_SECRET')!,
      },
      body: JSON.stringify({
        title,
        body,
        link: '/dashboard',
        link_label: 'Go to Dashboard',
        emoji: '🏆',
        organization_ids: [org.id],
      }),
    });
  } catch (err) {
    console.error(`platform-news post failed for ${org.id}:`, err);
  }
}

// ─── Tier selection ───────────────────────────────────────────────────────────

function chooseTier(
  _orgId: string,
  weekNumber: number,
  template: ChallengeTemplate,
): 'seed' | 'scout' | 'bridge' | 'builder' | 'multiplier' {
  const rotation = TIER_ROTATION[weekNumber % TIER_ROTATION.length];
  if (template.tier_options.includes(rotation)) return rotation;
  const tierOrder = ['seed', 'scout', 'bridge', 'builder', 'multiplier'] as const;
  const rotationRank = tierOrder.indexOf(rotation);
  const available = template.tier_options
    .filter(t => tierOrder.indexOf(t) <= rotationRank)
    .sort((a, b) => tierOrder.indexOf(b) - tierOrder.indexOf(a));
  return available[0] ?? template.tier_options[0];
}

// ─── Challenge content generation ────────────────────────────────────────────

async function generateChallengeContent(
  anthropic: Anthropic,
  org: OrgConfig,
  template: ChallengeTemplate,
  tier: string,
  weekStart: string,
): Promise<GeneratedChallenge> {

  const tierDescriptions: Record<string, string> = {
    seed:       'Teach a family member or neighbour one AI concept. Return and tell us what they asked you.',
    scout:      'Find a real community problem that AI could help with. Return with a written description.',
    bridge:     'Bring a community member with a real problem to the hub. Return together for an AI session.',
    builder:    'Co-solve a real problem with a community member using AI. Return and describe what changed.',
    multiplier: 'Recruit and begin mentoring a new learner. Return when they enroll.',
  };

  const tierLabels: Record<string, string> = {
    seed: 'Community Teacher', scout: 'Problem Finder', bridge: 'Community Connector',
    builder: 'AI for Good', multiplier: 'Village Leader',
  };

  const systemPrompt = `You are generating a weekly Community AI Challenge for youth learners aged 12-22 at ${org.display_name} in ${org.location}.

These learners use AI to help their community. The challenge sends them OUT into the community to talk to real people, then come BACK to the hub to use AI.

The challenge must be concrete, completable in one week, and grounded in real livelihoods: ${org.dominant_livelihoods}

Page context: ${template.domain_context}

You MUST respond with ONLY a valid JSON object. No markdown, no preamble.`;

  const userPrompt = `Generate a Community AI Challenge for week of ${weekStart}.
Page: ${template.label} (slug: ${template.slug})
Tier target: ${tier} (${tierLabels[tier]})
Tier action: ${tierDescriptions[tier]}

Return JSON with exactly these fields:
{
  "title": "4-8 word action-oriented challenge title",
  "description": "2-3 sentences for the dashboard banner",
  "challenge_mode_intro": "2-3 sentences shown at top of the page — mission briefing style",
  "challenge_instruction": "1-2 sentences of specific instruction — exactly what to do before returning",
  "return_question_1": "Question about what they DID",
  "return_question_2": "Question about what they OBSERVED or what happened",
  "return_question_3": "Optional third question or null",
  "community_role": "one of: farmer | fisher | entrepreneur | family | health | animal-keeper | general"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content.filter(b => b.type === 'text')
    .map(b => (b as any).text).join('');
  const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: GeneratedChallenge;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e}\n\nRaw: ${raw.slice(0, 500)}`);
  }

  const required = ['title', 'description', 'challenge_mode_intro', 'challenge_instruction', 'return_question_1', 'return_question_2', 'community_role'];
  for (const field of required) {
    if (!(parsed as any)[field]) throw new Error(`Missing required field: ${field}`);
  }

  return parsed;
}

// ─── Tiebreak via Claude ───────────────────────────────────────────────────────

async function runTiebreak(
  anthropic: Anthropic,
  learners: TiedLearner[],
  orgSlug: string,
): Promise<TiebreakResult> {

  const location = orgSlug === 'oloibiri' ? 'Oloibiri, Bayelsa State, Nigeria' : 'Ibiade, Nigeria';

  const learnersText = learners.map((l, i) => [
    `LEARNER ${i + 1}: ${l.display_name}`,
    `Challenge: ${l.challenge_title}`,
    `Tier earned: ${l.tier_label} (${l.tier})`,
    '',
    'Their submission:',
    `"${l.reflection_text}"`,
    l.impact_evaluation?.tier_reasoning ? `AI evaluation: "${l.impact_evaluation.tier_reasoning}"` : '',
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `You are a fair judge for a youth AI learning competition in ${location}. ${learners.length} learners tied at the highest tier. Choose ONE weekly champion based on: depth of community impact, quality of AI use, specificity, initiative, community ripple. Respond ONLY with valid JSON: {"winner_user_id":"<id>","reasoning":"<2-3 encouraging sentences>"}`,
    messages: [{ role: 'user', content: `Choose the weekly champion.\n\n${learnersText}\n\nUser IDs:\n${learners.map(l => `${l.display_name}: ${l.user_id}`).join('\n')}` }],
  });

  const raw = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed: TiebreakResult;
  try { parsed = JSON.parse(clean); }
  catch { throw new Error(`Claude tiebreak response not valid JSON: ${clean}`); }

  const validIds = new Set(learners.map(l => l.user_id));
  if (!validIds.has(parsed.winner_user_id)) {
    const fallback = learners.reduce((a, b) =>
      a.reflection_text.length >= b.reflection_text.length ? a : b);
    return { winner_user_id: fallback.user_id, reasoning: `[Tiebreak fallback] ${parsed.reasoning ?? ''}`.trim() };
  }

  return parsed;
}