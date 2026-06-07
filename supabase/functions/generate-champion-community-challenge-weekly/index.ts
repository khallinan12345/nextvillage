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

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date(weekEnd);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const results: Array<{ org: string; status: string; champion?: string; tiebreak?: boolean }> = [];

  for (const orgSlug of ORG_SLUGS) {
    try {
      // 1. Fetch awarded enrollments for this org this week
      const { data: enrollments, error: enrollErr } = await supabase
        .from('challenge_enrollments')
        .select(`
          id,
          learner_id,
          action_taken,
          impact_observed,
          extra_detail,
          impact_evaluation,
          tier_awarded,
          awarded_at,
          community_challenges!inner (
            title,
            description,
            org_id,
            week_start
          )
        `)
        .eq('community_challenges.org_id', orgSlug)
        .eq('status', 'awarded')
        .gte('awarded_at', weekStart.toISOString())
        .lt('awarded_at', new Date(weekEnd.getTime() + 86400000).toISOString());

      if (enrollErr) throw new Error(`Enrollment query failed: ${enrollErr.message}`);
      if (!enrollments || enrollments.length === 0) {
        results.push({ org: orgSlug, status: 'no_submissions' });
        continue;
      }

      // 2. Fetch display names — profiles first, fall back to auth.users metadata
      const learnerIds = [...new Set(enrollments.map((e) => e.learner_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', learnerIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));

      // For any learner missing a profile row, pull name from auth.users metadata
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

      // 3. Find the highest tier reached
      const highestRank = Math.max(
        ...enrollments.map((e) => TIER_ORDER[e.tier_awarded] ?? 0),
      );

      if (highestRank === 0) {
        results.push({ org: orgSlug, status: 'no_valid_tiers' });
        continue;
      }

      const highestTier = Object.entries(TIER_ORDER).find(
        ([, rank]) => rank === highestRank,
      )![0];

      // 4. Collect learners at the highest tier
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
            challenge_title: (e.community_challenges as any)?.title ?? '',
            challenge_description: (e.community_challenges as any)?.description ?? '',
          };
        });

      // 5. Clear winner or tiebreak
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

      // 6. Skip if already declared this week
      const { data: existing } = await supabase
        .from('weekly_champions')
        .select('id')
        .eq('org_id', orgSlug)
        .eq('week_start', weekStartStr)
        .limit(1);

      if (existing && existing.length > 0) {
        results.push({ org: orgSlug, status: 'already_declared' });
        continue;
      }

      // 7. Write champion to DB
      // Build champion story before insert so it's available in the DB too
      const championRecord = topLearners.find((l) => l.user_id === championUserId)!;
      const championStory = championRecord?.reflection_text ?? null;

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

      if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

      // 8. Announce via platform-news
      const tierLabel = TIER_LABELS[highestTier];
      const champion = topLearners.find((l) => l.user_id === championUserId)!;

      // Build a human-readable account of what the champion actually did
      const whatTheyDid: string[] = [];
      if ((champion.impact_evaluation as any)?.action_taken) {
        whatTheyDid.push(`What they did: ${(champion.impact_evaluation as any).action_taken}`);
      } else if (champion.reflection_text) {
        // reflection_text is the concatenation of action_taken + impact_observed + extra_detail
        whatTheyDid.push(champion.reflection_text);
      }

      const storyLine = whatTheyDid.length > 0
        ? ` Here is what made their work stand out this week: "${whatTheyDid.join(' ')}"`
        : '';

      const announcementBody = wasTiebreak
        ? `This week's Community Champion is ${championName}, earning the ${tierLabel} tier!${storyLine} ${tiebreakReasoning ?? ''} Congratulations — and to everyone who participated, your work matters to ${orgSlug === 'oloibiri' ? 'Oloibiri' : 'Ibiade'}.`
        : `This week's Community Champion is ${championName}, earning the ${tierLabel} tier!${storyLine} Congratulations ${championName} — and thank you to every learner who took their skills into the community.`;

      try {
        await fetch(
          `${Deno.env.get('SUPABASE_URL')!.replace('supabase.co', 'vercel.app').replace('https://wohmsbeygxrbwogrggkq.', 'https://girls-aiing-and-vibing.')}/api/platform-news`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-news-secret': Deno.env.get('NEWS_API_SECRET')!,
            },
            body: JSON.stringify({
              title: `Weekly Champion: ${championName}`,
              body: announcementBody,
              link: '/dashboard',
              link_label: 'View the Leaderboard',
              emoji: '🏆',
              organization_ids: [orgSlug],
            }),
          },
        );
      } catch (newsErr) {
        console.error(`platform-news announcement failed for ${orgSlug}:`, newsErr);
      }

      results.push({
        org: orgSlug,
        status: 'champion_declared',
        champion: championName,
        tiebreak: wasTiebreak,
      });
    } catch (err) {
      results.push({ org: orgSlug, status: `error: ${(err as Error).message}` });
    }
  }

  return new Response(
    JSON.stringify({ week_start: weekStartStr, week_end: weekEndStr, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

// Tiebreak via Claude
async function runTiebreak(
  anthropic: Anthropic,
  learners: TiedLearner[],
  orgSlug: string,
): Promise<TiebreakResult> {
  const learnersText = learners
    .map((l, i) => {
      const evalSummary = l.impact_evaluation?.summary
        ? `AI evaluation summary: "${l.impact_evaluation.summary}"`
        : '';
      const reasoning = l.impact_evaluation?.tier_reasoning
        ? `Tier reasoning: "${l.impact_evaluation.tier_reasoning}"`
        : '';

      return [
        `LEARNER ${i + 1}: ${l.display_name}`,
        `Challenge: ${l.challenge_title}`,
        l.challenge_description ? `Challenge description: ${l.challenge_description}` : '',
        `Tier earned: ${l.tier_label} (${l.tier})`,
        '',
        'Their submission (action taken, impact observed, extra detail):',
        `"${l.reflection_text}"`,
        '',
        evalSummary,
        reasoning,
      ].filter(Boolean).join('\n');
    })
    .join('\n\n---\n\n');

  const location = orgSlug === 'oloibiri' ? 'Oloibiri, Bayelsa State, Nigeria' : 'Ibiade, Nigeria';

  const systemPrompt = `You are a fair and thoughtful judge for a youth AI learning competition in ${location}.

Each week, learners go into their community and use AI to help real people — farmers, fishers, traders, healthcare workers, and families. They earn impact tiers based on the depth and quality of their community action.

This week, ${learners.length} learners have tied at the highest tier. Choose ONE weekly champion.

Judging criteria (in order of priority):
1. Depth of community impact — did they actually help someone solve a real problem?
2. Quality of AI use — did they use AI thoughtfully, not just as a gimmick?
3. Specificity — concrete details about who they helped and how, not vague generalities
4. Initiative — did they go beyond the minimum?
5. Community ripple — did their action benefit more than just the immediate person?

Respond with ONLY a valid JSON object, no preamble, no markdown:
{
  "winner_user_id": "<user_id of the winner>",
  "reasoning": "<2-3 sentences explaining why, in an encouraging tone that respects all participants>"
}`;

  const userMessage = `Here are the ${learners.length} tied learners. Choose the weekly champion.\n\n${learnersText}\n\nUser IDs for reference:\n${learners.map((l) => `${l.display_name}: ${l.user_id}`).join('\n')}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed: TiebreakResult;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Claude tiebreak response was not valid JSON: ${clean}`);
  }

  const validIds = new Set(learners.map((l) => l.user_id));
  if (!validIds.has(parsed.winner_user_id)) {
    const fallback = learners.reduce((a, b) =>
      a.reflection_text.length >= b.reflection_text.length ? a : b,
    );
    return {
      winner_user_id: fallback.user_id,
      reasoning: `[Tiebreak fallback] ${parsed.reasoning ?? ''}`.trim(),
    };
  }

  return parsed;
}