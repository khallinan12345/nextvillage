// supabase/functions/generate-champion-community-challenge-weekly/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

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

// ─── Structured error logging ─────────────────────────────────────────────────

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'generate-champion-community-challenge-weekly',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block champion selection for logging */ }
}

const TIER_ORDER: Record<string, number> = {
  multiplier: 5,
  builder: 4,
  bridge: 3,
  scout: 2,
  seed: 1,
};

const TIER_LABELS: Record<string, string> = {
  multiplier: 'Village Leader',
  builder: 'AI for Good',
  bridge: 'Community Connector',
  scout: 'Problem Finder',
  seed: 'Community Teacher',
};

const ORG_SLUGS = ['oloibiri', 'ibiade'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  const results: Array<{ org: string; status: string; champion?: string; tiebreak?: boolean; challenge?: string }> = [];

  for (const orgSlug of ORG_SLUGS) {
    try {
      // 1. Find the most recently active challenge for this org
      //    (active=true first, then fall back to most recently ended)
      const { data: recentChallenges } = await supabase
        .from('community_challenges')
        .select('id, title, description, week_start, week_end, active')
        .eq('org_id', orgSlug)
        .order('week_start', { ascending: false })
        .limit(2);

      const challenge = recentChallenges?.find(c => c.active) ?? recentChallenges?.[0] ?? null;

      if (!challenge) {
        results.push({ org: orgSlug, status: 'no_challenge' });
        continue;
      }

      const weekStartStr = challenge.week_start;
      const weekEndStr   = challenge.week_end;

      // 2. Check if champion already declared for this challenge
      const { data: existing } = await supabase
        .from('weekly_champions')
        .select('id')
        .eq('org_id', orgSlug)
        .eq('week_start', weekStartStr)
        .limit(1);

      if (existing && existing.length > 0) {
        results.push({ org: orgSlug, status: 'already_declared', challenge: challenge.title });
        continue;
      }

      // 3. Fetch ALL awarded enrollments for this challenge (no date window)
      const { data: enrollments, error: enrollErr } = await supabase
        .from('challenge_enrollments')
        .select('id, learner_id, action_taken, impact_observed, extra_detail, impact_evaluation, tier_awarded, awarded_at')
        .eq('challenge_id', challenge.id)
        .eq('status', 'awarded');

      if (enrollErr) throw new Error(`Enrollment query failed: ${enrollErr.message}`);
      if (!enrollments || enrollments.length === 0) {
        results.push({ org: orgSlug, status: 'no_submissions', challenge: challenge.title });
        continue;
      }

      // 4. Fetch display names — profiles first, fall back to auth.users metadata
      const learnerIds = [...new Set(enrollments.map((e) => e.learner_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', learnerIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));

      const missingIds = learnerIds.filter((id) => !profileMap.has(id));
      if (missingIds.length > 0) {
        const { data: authUsers } = await supabase
          .from('users')
          .select('id, raw_user_meta_data')
          .in('id', missingIds)
          .schema('auth');
        for (const u of authUsers ?? []) {
          const name =
            u.raw_user_meta_data?.username ||
            u.raw_user_meta_data?.full_name ||
            u.raw_user_meta_data?.name ||
            u.raw_user_meta_data?.email ||
            'Unknown';
          profileMap.set(u.id, name);
        }
      }

      // 5. Find the highest tier reached
      const highestRank = Math.max(
        ...enrollments.map((e) => TIER_ORDER[e.tier_awarded] ?? 0),
      );

      if (highestRank === 0) {
        results.push({ org: orgSlug, status: 'no_valid_tiers', challenge: challenge.title });
        continue;
      }

      const highestTier = Object.entries(TIER_ORDER).find(
        ([, rank]) => rank === highestRank,
      )![0];

      // 6. Collect learners at the highest tier
      const topLearners: TiedLearner[] = enrollments
        .filter((e) => e.tier_awarded === highestTier)
        .map((e) => {
          const parts = [e.action_taken, e.impact_observed, e.extra_detail].filter(Boolean);
          return {
            enrollment_id: e.id,
            user_id: e.learner_id,
            display_name: profileMap.get(e.learner_id) ?? 'Unknown',
            tier: e.tier_awarded,
            tier_label: TIER_LABELS[e.tier_awarded] ?? e.tier_awarded,
            reflection_text: parts.join('\n\n'),
            impact_evaluation: e.impact_evaluation ?? {},
            challenge_title: challenge.title,
            challenge_description: challenge.description ?? '',
          };
        });

      // 7. Clear winner or tiebreak
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
        championName = topLearners.find((l) => l.user_id === championUserId)?.display_name ?? 'Unknown';
      }

      // 8. Write champion to DB
      const championRecord = topLearners.find((l) => l.user_id === championUserId)!;
      const championStory = championRecord?.reflection_text ?? null;

      const { error: insertErr } = await supabase.from('weekly_champions').insert({
        org_id:             orgSlug,
        week_start:         weekStartStr,
        week_end:           weekEndStr,
        champion_user_id:   championUserId,
        champion_name:      championName,
        winning_tier:       highestTier,
        winning_tier_label: TIER_LABELS[highestTier],
        was_tiebreak:       wasTiebreak,
        tiebreak_reasoning: tiebreakReasoning ?? null,
        tied_learner_count: wasTiebreak ? topLearners.length : null,
        champion_story:     championStory,
      });

      if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

      // 9. Announce via platform-news
      const tierLabel = TIER_LABELS[highestTier];
      const storySnippet = championRecord?.reflection_text
        ? ` Here is what made their work stand out: "${championRecord.reflection_text.slice(0, 300).trim()}${championRecord.reflection_text.length > 300 ? '…' : ''}"`
        : '';

      const orgName = orgSlug === 'oloibiri' ? 'Oloibiri' : 'Ibiade';
      const announcementBody = wasTiebreak
        ? `This week's Community Champion is ${championName}, earning the ${tierLabel} tier!${storySnippet} ${tiebreakReasoning ?? ''} Congratulations — and to everyone who participated, your work matters to ${orgName}.`
        : `This week's Community Champion is ${championName}, earning the ${tierLabel} tier!${storySnippet} Congratulations ${championName} — and thank you to every learner who took their skills into the community.`;

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
            title:            `🏆 ${championName} is this week's Community Champion`,
            body:             announcementBody,
            link:             '/dashboard',
            link_label:       'View the Leaderboard',
            emoji:            '🏆',
            organization_ids: [orgSlug],
          }),
        });
      } catch (newsErr) {
        console.error(`platform-news announcement failed for ${orgSlug}:`, newsErr);
      }

      results.push({
        org:       orgSlug,
        status:    'champion_declared',
        champion:  championName,
        tiebreak:  wasTiebreak,
        challenge: challenge.title,
      });

    } catch (err) {
      const msg = (err as Error).message;
      results.push({ org: orgSlug, status: `error: ${msg}` });
      await logEvent(supabase, {
        event_type: 'champion_selection_failed',
        severity:   'error',
        details: { org_id: orgSlug, error: msg },
      });
    }
  }

  const failures = results.filter(r => r.status.startsWith('error')).length;
  if (failures > 0) {
    await logEvent(supabase, {
      event_type: 'champion_generation_summary',
      severity:   failures === ORG_SLUGS.length ? 'critical' : 'warning',
      details: { orgs_attempted: ORG_SLUGS.length, orgs_failed: failures },
    });
  }

  return new Response(
    JSON.stringify({ results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

// ─── Tiebreak via Claude ──────────────────────────────────────────────────────

async function runTiebreak(
  anthropic: Anthropic,
  learners: TiedLearner[],
  orgSlug: string,
): Promise<TiebreakResult> {
  const learnersText = learners
    .map((l, i) => {
      const evalSummary  = (l.impact_evaluation as any)?.summary        ? `AI evaluation summary: "${(l.impact_evaluation as any).summary}"` : '';
      const reasoning    = (l.impact_evaluation as any)?.tier_reasoning ? `Tier reasoning: "${(l.impact_evaluation as any).tier_reasoning}"` : '';
      return [
        `LEARNER ${i + 1}: ${l.display_name}`,
        `Challenge: ${l.challenge_title}`,
        l.challenge_description ? `Challenge description: ${l.challenge_description}` : '',
        `Tier earned: ${l.tier_label} (${l.tier})`,
        '',
        'Their submission:',
        `"${l.reflection_text}"`,
        '',
        evalSummary,
        reasoning,
      ].filter(Boolean).join('\n');
    })
    .join('\n\n---\n\n');

  const location = orgSlug === 'oloibiri' ? 'Oloibiri, Bayelsa State, Nigeria' : 'Ibiade, Nigeria';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `You are a fair and thoughtful judge for a youth AI learning competition in ${location}. ${learners.length} learners tied at the highest tier. Choose ONE weekly champion based on: depth of community impact, quality of AI use, specificity, initiative, community ripple. Respond ONLY with valid JSON: {"winner_user_id":"<id>","reasoning":"<2-3 encouraging sentences>"}`,
    messages: [{ role: 'user', content: `Choose the weekly champion.\n\n${learnersText}\n\nUser IDs:\n${learners.map(l => `${l.display_name}: ${l.user_id}`).join('\n')}` }],
  });

  const raw   = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed: TiebreakResult;
  try { parsed = JSON.parse(clean); }
  catch { throw new Error(`Claude tiebreak response was not valid JSON: ${clean}`); }

  const validIds = new Set(learners.map(l => l.user_id));
  if (!validIds.has(parsed.winner_user_id)) {
    const fallback = learners.reduce((a, b) => a.reflection_text.length >= b.reflection_text.length ? a : b);
    return { winner_user_id: fallback.user_id, reasoning: `[Tiebreak fallback] ${parsed.reasoning ?? ''}`.trim() };
  }

  return parsed;
}