// supabase/functions/generate-weekly-challenges/index.ts
//
// Bi-Weekly Community AI Challenge Generator
// ─────────────────────────────────────────
// pg_cron fires this every Sunday at 20:15 UTC (see cron.job id 14) — but
// the function only actually generates a new challenge every OTHER Sunday.
// This is deliberate: pg_cron has no native "every 2 weeks" schedule, so
// rather than fight its syntax (and lose the "always starts on a Monday"
// guarantee), the function checks the most recent challenge's week_start
// on every run and skips generation if fewer than 14 days have passed.
// This self-corrects even if a run is missed or someone triggers it
// manually — it reads real history instead of counting invocations.
//
// For each active org it:
//   1. Checks whether 14 days have passed since the last challenge started
//      — if not, skips (unless dry_run or force is set)
//   2. Expires any stale enrollments from the previous cycle
//   3. Deactivates the previous challenge
//   4. Selects a challenge template (rotating, never repeating
//      the same page two cycles in a row)
//   5. Calls Claude to generate rich, localised challenge content
//   6. Inserts the new challenge row, spanning a 14-day window
//
// Invoke manually for testing:
//   supabase functions invoke generate-weekly-challenges \
//     --body '{"org_id":"oloibiri","dry_run":true}'
//
// Invoke manually to FORCE a real generation outside the normal cycle
// (bypasses the 14-day gate, still writes to the database):
//   supabase functions invoke generate-weekly-challenges \
//     --body '{"org_id":"oloibiri","force":true}'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

// ─── Structured error logging ─────────────────────────────────────────────────

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'generate-weekly-challenges',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block generation for logging */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChallengeTemplate {
  slug: string;
  label: string;
  community_roles: string[];
  tier_options: Array<'seed' | 'scout' | 'bridge' | 'builder' | 'multiplier'>;
  domain_context: string;        // injected into AI prompt
  example_actions: string[];     // helps AI generate concrete challenges
}

interface OrgConfig {
  id: string;
  display_name: string;
  location: string;              // injected for localisation
  dominant_livelihoods: string;  // shapes which challenges are most relevant
  excluded_slugs?: string[];     // challenge template slugs never shown at this org
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
  tier_target: string;
}

// ─── Org configurations ───────────────────────────────────────────────────────

const ORG_CONFIGS: OrgConfig[] = [
  {
    id: 'oloibiri',
    display_name: 'Davidson AI Innovation Center — Oloibiri',
    location: 'Oloibiri, Ogbia LGA, Bayelsa State, Niger Delta, Nigeria',
    dominant_livelihoods:
      'fishing (Kolo Creek, River Nun), cassava farming, plantain, petty trade, ' +
      'healthcare access challenges, oil contamination effects on livelihoods',
    // Animal husbandry is uncommon in Oloibiri — exclude to keep challenges relevant
    excluded_slugs: ['animal-husbandry'],
  },
  {
    id: 'ibiade',
    display_name: 'vAI Hub — Ibiade',
    location: 'Ibiade, Ogun State, Nigeria',
    dominant_livelihoods:
      'cassava farming, maize, cowpea, cocoa, oil palm, Lagos market access ' +
      'via Sagamu road, small business and trade, animal keeping',
    // No exclusions — all challenge types are relevant here
    excluded_slugs: [],
  },
];

// ─── Challenge templates ──────────────────────────────────────────────────────
// One per Community Impact page. The generator rotates through these,
// never repeating the same slug two weeks in a row.

const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    slug: 'ai-ambassadors',
    label: 'AI Ambassadors',
    community_roles: ['family', 'general'],
    tier_options: ['seed', 'scout'],
    domain_context:
      'The AI Ambassadors page trains learners to explain AI concepts to ' +
      'community members — especially older adults, farmers, and parents — ' +
      'who are unfamiliar with technology. Learners practice using simple ' +
      'language, local analogies, and handling scepticism.',
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
    domain_context:
      'The Agriculture Consultant page trains learners to advise farmers on ' +
      'crop disease, pest damage, soil and water problems, post-harvest loss, ' +
      'and market access. Key crops: cassava, maize, yam, plantain, vegetables. ' +
      'Key threats: Fall Armyworm, Cassava Mosaic Disease, flooding, post-harvest loss.',
    example_actions: [
      'Find a farmer with a crop problem and document the symptoms',
      'Ask a farmer what their biggest post-harvest loss problem is',
      'Help a farmer use AI to identify a pest affecting their crop',
      'Bring a farmer with a cassava disease problem to the hub for an AI consultation',
      'Find out what market price a farmer gets and compare with the AI market reference',
    ],
  },
  {
    slug: 'fishing',
    label: 'Fishing Consultant',
    community_roles: ['fisher'],
    tier_options: ['scout', 'bridge', 'builder'],
    domain_context:
      'The Fishing Consultant page helps learners advise fishers on catch problems, ' +
      'aquaculture pond management, fish processing and market access, oil contamination ' +
      'reporting, and climate/safety concerns. Key context: Niger Delta, Kolo Creek, ' +
      'River Nun, catfish, tilapia, bonga, shrimp, oil spill documentation.',
    example_actions: [
      'Talk to a fisher about how their catches have changed in the last year',
      'Find a fisher dealing with an oil contamination problem and document it',
      'Help a fisher understand what smoked fish is worth vs fresh fish prices',
      'Bring a fisher to the hub to get AI advice on a pond disease problem',
      'Document GPS location and visual signs of a suspected oil spill',
    ],
  },
  {
    slug: 'healthcare',
    label: 'Healthcare Navigator',
    community_roles: ['health', 'family'],
    tier_options: ['seed', 'scout', 'bridge', 'builder'],
    domain_context:
      'The Healthcare Navigator page trains learners to triage community health ' +
      'problems using WHO IMCI protocols — assessing vital signs, identifying danger ' +
      'signs, and preparing referral notes. Key diseases: malaria (#1 killer in Bayelsa), ' +
      'pneumonia, typhoid, diarrhoea, malnutrition, hypertension. Role: triage and refer, not diagnose.',
    example_actions: [
      'Talk to a family about a sick child and learn what symptoms they noticed',
      'Teach a mother the WHO danger signs for malaria in children under 5',
      'Help a family member understand when to go to the clinic vs treat at home',
      'Bring a community member with a health concern to the hub for an AI-assisted triage',
      'Find out what health problem is most common in a household and document it',
    ],
  },
  {
    slug: 'entrepreneurship',
    label: 'Entrepreneurship Consultant',
    community_roles: ['entrepreneur'],
    tier_options: ['seed', 'scout', 'bridge', 'builder'],
    domain_context:
      'The Entrepreneurship Consultant page trains learners to advise small business ' +
      'owners on starting up, pricing, marketing (especially WhatsApp Business), ' +
      'record-keeping, and solving business problems. Key tools: WhatsApp Business, ' +
      'Kuda/Opay, CAC registration, Ajo savings groups, Tony Elumelu Foundation grants.',
    example_actions: [
      'Find a local trader and ask them how they currently find customers',
      'Help a small business owner set up WhatsApp Business on their phone',
      'Talk to an entrepreneur about their pricing — do they know their real costs?',
      'Bring a trader with a business problem to the hub for an AI consultation',
      'Find out if a local business owner knows about available grants or microfinance',
    ],
  },
  {
    slug: 'animal-husbandry',
    label: 'Animal Husbandry',
    community_roles: ['animal-keeper'],
    tier_options: ['scout', 'bridge', 'builder'],
    domain_context:
      'The Animal Husbandry page trains learners to advise on poultry, goat/sheep, ' +
      'cattle, and pig health. Key diseases: Newcastle (poultry), PPR (goats/sheep — emergency), ' +
      'African Swine Fever (pigs — catastrophic emergency), internal parasites (most common). ' +
      'Core principle: isolate sick animals, check vaccination history, never sell sick animals.',
    example_actions: [
      'Talk to someone who keeps chickens and find out when they last vaccinated',
      'Find out if anyone in the community has seen sudden animal deaths recently',
      'Help a goat keeper understand the signs of PPR and when to call for help',
      'Bring someone with sick animals to the hub for an AI-assisted diagnosis',
      'Document an animal health problem in the community with enough detail for an AI consultation',
    ],
  },
];

// ─── Tier rotation schedule ───────────────────────────────────────────────────
// Rotates predictably so learners progress through difficulty over time.
// Week 1: seed, Week 2: scout, Week 3: bridge, Week 4: builder,
// then back to scout to give bridge another chance before multiplier.

const TIER_ROTATION: Array<'seed' | 'scout' | 'bridge' | 'builder' | 'multiplier'> = [
  'seed', 'scout', 'bridge', 'scout', 'builder', 'scout', 'bridge', 'builder',
];

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Allow manual POST for testing, cron sends GET
  let body: { org_id?: string; dry_run?: boolean; force_slug?: string; force?: boolean } = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { /* empty body ok */ }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  const results: Record<string, unknown> = {};
  const targetOrgs = body.org_id
    ? ORG_CONFIGS.filter(o => o.id === body.org_id)
    : ORG_CONFIGS;

  for (const org of targetOrgs) {
    try {
      results[org.id] = await generateForOrg(supabase, anthropic, org, body.dry_run ?? false, body.force_slug, body.force ?? false);
    } catch (err) {
      const msg = String(err);
      results[org.id] = { error: msg };
      await logEvent(supabase, {
        event_type: 'challenge_generation_failed',
        severity:   'error',
        details: { org_id: org.id, error: msg },
      });
    }
  }

  const failures = Object.values(results).filter((r: any) => r?.error).length;
  if (failures > 0) {
    await logEvent(supabase, {
      event_type: 'weekly_generation_summary',
      severity:   failures === targetOrgs.length ? 'critical' : 'warning',
      details: {
        orgs_attempted: targetOrgs.length,
        orgs_failed:    failures,
        orgs_succeeded: targetOrgs.length - failures,
      },
    });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// ─── Per-org generation ───────────────────────────────────────────────────────

async function generateForOrg(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  org: OrgConfig,
  dryRun: boolean,
  forceSlug?: string,
  force = false,
): Promise<unknown> {

  // Compute the next Monday–Sunday+7 (14-day) window
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon…
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  const cycleEnd = new Date(nextMonday);
  cycleEnd.setUTCDate(nextMonday.getUTCDate() + 13); // 14-day span, not 7

  const weekStart = nextMonday.toISOString().slice(0, 10);
  const weekEnd   = cycleEnd.toISOString().slice(0, 10);

  // Step 0: Find the most recent challenge for this org — used both for
  // the 14-day gate below AND for slug-rotation exclusion further down.
  const { data: lastChallenge } = await supabase
    .from('community_challenges')
    .select('community_impact_slug, week_start')
    .eq('org_id', org.id)
    .order('week_start', { ascending: false })
    .limit(1)
    .single();

  const lastSlug = lastChallenge?.community_impact_slug ?? null;

  // Step 0b: Bi-weekly gate. pg_cron fires this every Sunday, but a new
  // challenge should only actually be generated every OTHER Sunday. Rather
  // than trust an invocation counter (which drifts if a run is missed),
  // check real history: has a full 14 days passed since the last challenge
  // started? If not, skip — unless this is a dry run (safe, writes
  // nothing) or an explicit force (manual override for testing).
  if (!dryRun && !force && lastChallenge?.week_start) {
    const daysSinceLast = Math.floor(
      (nextMonday.getTime() - new Date(lastChallenge.week_start).getTime()) /
      (24 * 60 * 60 * 1000),
    );
    if (daysSinceLast < 14) {
      return {
        skipped: true,
        reason: `Only ${daysSinceLast} day(s) since the last challenge started ` +
          `(${lastChallenge.week_start}) — waiting for the full 14-day cycle.`,
        last_challenge_week_start: lastChallenge.week_start,
      };
    }
  }

  // Step 1: Expire stale enrollments from the previous cycle
  if (!dryRun) {
    const { error: expireErr } = await supabase.rpc('expire_old_enrollments');
    if (expireErr) throw new Error(`expire_old_enrollments: ${expireErr.message}`);
  }

  // Step 3: Choose template — rotate, skip last week's slug, and respect
  //         this org's excluded_slugs list so irrelevant challenges never surface.
  const excluded = new Set([lastSlug, ...(org.excluded_slugs ?? [])]);
  const candidateTemplates = CHALLENGE_TEMPLATES.filter(t => !excluded.has(t.slug));

  if (candidateTemplates.length === 0) {
    throw new Error(
      `No eligible challenge templates for org "${org.id}". ` +
      `Check excluded_slugs — all templates may be filtered out.`,
    );
  }

  // Counts 14-day cycles since the epoch, not calendar weeks — if this
  // still divided by 7 days, a cadence that only runs every OTHER week
  // would silently skip every other index in the rotation arrays below,
  // quietly cutting the visible variety of challenge templates and tiers
  // in half. Dividing by 14 keeps the rotation stepping by exactly 1 each
  // time this function actually generates something.
  const cycleNumber = Math.floor(
    (nextMonday.getTime() - new Date('2025-01-06').getTime()) /
    (14 * 24 * 60 * 60 * 1000),
  );
  const template = candidateTemplates[cycleNumber % candidateTemplates.length];

  // Step 4: Choose tier for this cycle
  const tier = chooseTier(org.id, cycleNumber, template);

  // Step 5: Generate challenge content with Claude
  const generated = await generateChallengeContent(anthropic, org, template, tier, weekStart);

  if (dryRun) {
    return { dry_run: true, weekStart, weekEnd, template: template.slug, tier, generated };
  }

  // Step 6: Deactivate previous active challenge for this org
  await supabase
    .from('community_challenges')
    .update({ active: false })
    .eq('org_id', org.id)
    .eq('active', true);

  // Step 7: Insert new challenge
  const { data: inserted, error: insertErr } = await supabase
    .from('community_challenges')
    .insert({
      org_id:                 org.id,
      week_start:             weekStart,
      week_end:               weekEnd,
      title:                  generated.title,
      description:            generated.description,
      community_impact_slug:  template.slug,
      tier_target:            tier,
      challenge_mode_intro:   generated.challenge_mode_intro,
      challenge_instruction:  generated.challenge_instruction,
      return_question_1:      generated.return_question_1,
      return_question_2:      generated.return_question_2,
      return_question_3:      generated.return_question_3,
      community_role:         generated.community_role,
      active:                 true,
    })
    .select()
    .single();

  if (insertErr) throw new Error(`insert challenge: ${insertErr.message}`);

  return {
    inserted: true,
    challenge_id: inserted.id,
    weekStart,
    weekEnd,
    slug: template.slug,
    tier,
    title: generated.title,
  };
}

// ─── Tier selection ───────────────────────────────────────────────────────────

function chooseTier(
  orgId: string,
  cycleNumber: number,
  template: ChallengeTemplate,
): 'seed' | 'scout' | 'bridge' | 'builder' | 'multiplier' {
  const rotation = TIER_ROTATION[cycleNumber % TIER_ROTATION.length];
  // If the rotation tier isn't available for this page, pick the highest
  // available that doesn't exceed it
  if (template.tier_options.includes(rotation)) return rotation;
  const tierOrder = ['seed', 'scout', 'bridge', 'builder', 'multiplier'] as const;
  const rotationRank = tierOrder.indexOf(rotation);
  const available = template.tier_options
    .filter(t => tierOrder.indexOf(t) <= rotationRank)
    .sort((a, b) => tierOrder.indexOf(b) - tierOrder.indexOf(a));
  return available[0] ?? template.tier_options[0];
}

// ─── AI content generation ────────────────────────────────────────────────────

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

  const systemPrompt = `You are generating a weekly Community AI Challenge for youth learners aged 12–22 at ${org.display_name} in ${org.location}.

These learners are using an AI learning platform (nextvillage.community) to develop AI skills. The Community AI Challenge sends them OUT into their community to apply what they've learned — talking to farmers, fishers, traders, animal keepers, or family members.

The challenge must be:
- Concrete and completable in one week
- Appropriate for the tier level (${tier} = ${tierDescriptions[tier]})
- Grounded in the real livelihoods and problems of ${org.location}
- Phrased in simple, direct language a 14-year-old can follow
- Connected to the ${template.label} topic area

Dominant livelihoods in this community: ${org.dominant_livelihoods}

${template.label} page context:
${template.domain_context}

Example actions on this page:
${template.example_actions.map(a => `- ${a}`).join('\n')}

You MUST respond with ONLY a valid JSON object. No markdown, no preamble, no explanation.`;

  const userPrompt = `Generate a Community AI Challenge for week of ${weekStart}.

Page: ${template.label} (slug: ${template.slug})
Tier target: ${tier} (${tierLabels[tier]})
Tier action: ${tierDescriptions[tier]}
Community roles this page serves: ${template.community_roles.join(', ')}

Return a JSON object with exactly these fields:

{
  "title": "4-8 word challenge title — action-oriented, e.g. 'Find a Farming Problem This Week'",
  "description": "2-3 sentences for the dashboard banner. What will the learner do? Why does it matter to the community?",
  "challenge_mode_intro": "2-3 sentences shown at the top of the ${template.label} page when challenge mode is active. Should feel like a mission briefing — specific, motivating, localised.",
  "challenge_instruction": "1-2 sentences of specific instruction. Exactly what should the learner do before coming back? Be concrete — name the type of person to talk to, the type of problem to find, or the action to take.",
  "return_question_1": "Question asking what they DID. Start with 'What did you do?' or similar. e.g. 'What did you do — who did you talk to, and what did you say to them?'",
  "return_question_2": "Question asking what HAPPENED or what they OBSERVED. e.g. 'What did the farmer say? What problem did they describe?'",
  "return_question_3": "Optional third question (null if not needed) — only include if there's a third meaningful dimension to capture. e.g. for builder tier: 'What changed for the community member after the AI session?'",
  "community_role": "one of: farmer | fisher | entrepreneur | family | health | animal-keeper | general"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  // Strip any accidental markdown fences
  const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: GeneratedChallenge;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e}\n\nRaw: ${raw.slice(0, 500)}`);
  }

  // Validate required fields
  const required: Array<keyof GeneratedChallenge> = [
    'title', 'description', 'challenge_mode_intro', 'challenge_instruction',
    'return_question_1', 'return_question_2', 'community_role',
  ];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Missing required field: ${field}`);
  }

  return parsed;
}