// supabase/functions/select-grand-challenge-winner/index.ts
//
// Grand Challenge — Automated Winner Selection
// ─────────────────────────────────────────────
// Runs automatically after each quarter's submission deadline
// via pg_cron. Can also be invoked manually for testing.
//
// Process:
//   1. Loads all submitted entries for the quarter
//   2. Evaluates any that haven't been evaluated yet
//   3. Passes all evaluated summaries to Claude for comparative
//      ranking and winner selection
//   4. Marks the winner, writes the announcement, fires news headline
//
// Invoke manually:
//   supabase functions invoke select-grand-challenge-winner \
//     --body '{"quarter":"2026-Q3","org_id":"oloibiri","dry_run":true}'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmissionSummary {
  id: string;
  learner_id: string;
  learner_name: string;
  title: string;
  community_member_name: string | null;
  community_impact_slug: string;
  journal_entry_count: number;
  weeks_documented: number;
  tier_awarded: string;
  tier_rank: number;
  evaluation_summary: string;
  community_benefit: string;
  evidence_strength: string;
}

interface WinnerSelection {
  winner_submission_id: string;
  winner_learner_name: string;
  winner_title: string;
  selection_reasoning: string;       // why this submission won
  announcement_headline: string;     // 1 sentence for the news banner title
  announcement_body: string;         // 2-3 sentences for the news banner body
  honourable_mentions: Array<{
    submission_id: string;
    learner_name: string;
    commendation: string;            // 1 sentence praising them specifically
  }>;
}

// ─── CORS headers ─────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIER_LABELS: Record<string, string> = {
  seed: 'Community Teacher', scout: 'Problem Finder',
  bridge: 'Community Connector', builder: 'AI for Good',
  multiplier: 'Village Leader',
};

const TIER_RANKS: Record<string, number> = {
  seed: 1, scout: 2, bridge: 3, builder: 4, multiplier: 5,
};

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

  let body: { quarter?: string; org_id?: string; dry_run?: boolean };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  // If no quarter specified, find the most recently closed active quarter
  let quarter = body.quarter;
  if (!quarter) {
    const { data: q } = await supabase
      .from('grand_challenge_quarters')
      .select('quarter')
      .lte('submission_deadline', new Date().toISOString().slice(0, 10))
      .order('submission_deadline', { ascending: false })
      .limit(1)
      .single();
    if (!q) {
      return new Response(JSON.stringify({ error: 'No closed quarter found' }), {
        status: 400, headers: CORS_HEADERS,
      });
    }
    quarter = q.quarter;
  }

  const orgs = body.org_id ? [body.org_id] : ['oloibiri', 'ibiade'];
  const results: Record<string, unknown> = {};

  for (const orgId of orgs) {
    try {
      results[orgId] = await processQuarterForOrg(
        supabase, anthropic, quarter, orgId, body.dry_run ?? false
      );
    } catch (err) {
      results[orgId] = { error: String(err) };
    }
  }

  return new Response(JSON.stringify({ ok: true, quarter, results }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});

// ─── Per-org processing ───────────────────────────────────────────────────────

async function processQuarterForOrg(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  quarter: string,
  orgId: string,
  dryRun: boolean,
): Promise<unknown> {

  // 1. Load all submitted entries for this quarter + org
  const { data: submissions, error } = await supabase
    .from('grand_challenge_submissions')
    .select(`
      id, learner_id, title, community_member_name,
      community_impact_slug, journal_entry_count, weeks_documented,
      tier_awarded, evaluation_json, status, impact_arc
    `)
    .eq('quarter', quarter)
    .eq('org_id', orgId)
    .in('status', ['submitted', 'evaluated', 'awarded']);

  if (error) throw new Error(`Load submissions: ${error.message}`);
  if (!submissions || submissions.length === 0) {
    return { skipped: true, reason: 'No submissions found for this quarter' };
  }

  // 2. Load learner names
  const learnerIds = [...new Set(submissions.map(s => s.learner_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', learnerIds);
  const nameMap: Record<string, string> = {};
  (profiles ?? []).forEach(p => { nameMap[p.id] = p.name ?? 'Learner'; });

  // 3. Evaluate any unevaluated submissions first
  for (const sub of submissions) {
    if (sub.status === 'submitted' && !sub.evaluation_json) {
      console.log(`Evaluating submission ${sub.id} before winner selection`);
      try {
        await evaluateSubmissionInline(supabase, anthropic, sub, nameMap[sub.learner_id] ?? 'Learner');
        // Reload the updated evaluation
        const { data: updated } = await supabase
          .from('grand_challenge_submissions')
          .select('tier_awarded, evaluation_json')
          .eq('id', sub.id)
          .single();
        if (updated) {
          sub.tier_awarded = updated.tier_awarded;
          sub.evaluation_json = updated.evaluation_json;
        }
      } catch (e) {
        console.error(`Failed to evaluate ${sub.id}:`, e);
      }
    }
  }

  // 4. Build submission summaries for comparative ranking
  const summaries: SubmissionSummary[] = submissions
    .filter(s => s.tier_awarded && s.evaluation_json)
    .map(s => ({
      id:                    s.id,
      learner_id:            s.learner_id,
      learner_name:          nameMap[s.learner_id] ?? 'Learner',
      title:                 s.title,
      community_member_name: s.community_member_name,
      community_impact_slug: s.community_impact_slug,
      journal_entry_count:   s.journal_entry_count,
      weeks_documented:      s.weeks_documented,
      tier_awarded:          s.tier_awarded,
      tier_rank:             TIER_RANKS[s.tier_awarded] ?? 0,
      evaluation_summary:    s.evaluation_json?.summary ?? '',
      community_benefit:     s.evaluation_json?.community_benefit ?? '',
      evidence_strength:     s.evaluation_json?.evidence_strength ?? '',
    }));

  if (summaries.length === 0) {
    return { skipped: true, reason: 'No evaluated submissions to compare' };
  }

  // 5. Already have a winner? Don't re-select
  const existingWinner = submissions.find(s => s.status === 'awarded');
  if (existingWinner) {
    return {
      skipped: true,
      reason: 'Winner already selected',
      winner_id: existingWinner.id,
    };
  }

  if (dryRun) {
    return {
      dry_run: true,
      submissions_evaluated: summaries.length,
      summaries: summaries.map(s => ({
        learner: s.learner_name,
        title: s.title,
        tier: s.tier_awarded,
        entries: s.journal_entry_count,
      })),
    };
  }

  // 6. Call Claude to select the winner
  const selection = await selectWinner(anthropic, quarter, orgId, summaries);

  // 7. Mark the winner and honourable mentions
  await supabase
    .from('grand_challenge_submissions')
    .update({
      status:            'awarded',
      awarded_at:        new Date().toISOString(),
      is_quarter_winner: true,
    })
    .eq('id', selection.winner_submission_id);

  // 8. Post the news headline
  await supabase
    .from('platform_news')
    .insert({
      title:      selection.announcement_headline,
      body:       selection.announcement_body,
      link:       '/community-impact/grand-challenge',
      link_label: 'See the full story',
      emoji:      '🏆',
      active:     true,
    });

  // 9. Insert winner tier record
  const winnerSub = summaries.find(s => s.id === selection.winner_submission_id);
  if (winnerSub) {
    await supabase
      .from('community_impact_tiers')
      .insert({
        learner_id:       winnerSub.learner_id,
        org_id:           orgId,
        tier:             winnerSub.tier_awarded,
        tier_label:       `${TIER_LABELS[winnerSub.tier_awarded]} — Grand Challenge Winner ${quarter}`,
        evidence_summary: selection.announcement_body,
      });
  }

  return {
    winner_selected:       true,
    winner_submission_id:  selection.winner_submission_id,
    winner_learner:        selection.winner_learner_name,
    winner_title:          selection.winner_title,
    selection_reasoning:   selection.selection_reasoning,
    announcement_headline: selection.announcement_headline,
    honourable_mentions:   selection.honourable_mentions.length,
    total_submissions:     summaries.length,
  };
}

// ─── Inline evaluation (for unevaluated submissions) ─────────────────────────

async function evaluateSubmissionInline(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  submission: Record<string, any>,
  learnerName: string,
) {
  const { data: entries } = await supabase
    .from('community_impact_journal')
    .select('visit_date, community_member_name, community_member_role, situation_before, action_taken, change_observed')
    .eq('learner_id', submission.learner_id)
    .in('id', submission.journal_entry_ids ?? [])
    .order('visit_date', { ascending: true });

  const journalText = (entries ?? []).map((e: any, i: number) => `
Entry ${i + 1} — ${e.visit_date}
Member: ${e.community_member_name ?? 'unnamed'} (${e.community_member_role})
Before: ${e.situation_before}
Action: ${e.action_taken}
Change: ${e.change_observed}`.trim()).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: `You are evaluating a Grand Challenge submission. Respond ONLY with valid JSON. No markdown.`,
    messages: [{
      role: 'user',
      content: `Evaluate this submission from ${learnerName}.

TITLE: ${submission.title}
DOMAIN: ${submission.community_impact_slug}
JOURNAL ENTRIES: ${(entries ?? []).length}
IMPACT ARC: ${submission.impact_arc}
JOURNAL: ${journalText}

Return JSON: { "tier": "seed|scout|bridge|builder|multiplier", "tier_label": "...",
"summary": "2-3 sentences", "narrative_quality": "2 sentences",
"evidence_strength": "2 sentences", "community_benefit": "2 sentences",
"overall_reasoning": "3 sentences", "commendation": "1 sentence", "next_steps": "1 sentence" }`,
    }],
  });

  const raw = response.content.filter(b => b.type === 'text')
    .map(b => (b as any).text).join('');
  const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  const parsed = JSON.parse(clean);

  await supabase
    .from('grand_challenge_submissions')
    .update({
      status:          'evaluated',
      evaluated_at:    new Date().toISOString(),
      tier_awarded:    parsed.tier,
      evaluation_json: parsed,
    })
    .eq('id', submission.id);
}

// ─── Winner selection ─────────────────────────────────────────────────────────

async function selectWinner(
  anthropic: Anthropic,
  quarter: string,
  orgId: string,
  summaries: SubmissionSummary[],
): Promise<WinnerSelection> {

  const submissionsList = summaries
    .sort((a, b) => b.tier_rank - a.tier_rank || b.journal_entry_count - a.journal_entry_count)
    .map((s, i) => `
SUBMISSION ${i + 1}
ID: ${s.id}
Learner: ${s.learner_name}
Title: "${s.title}"
Domain: ${s.community_impact_slug}
Person helped: ${s.community_member_name ?? 'not named'}
Tier awarded: ${s.tier_awarded} (${TIER_LABELS[s.tier_awarded]})
Journal entries: ${s.journal_entry_count} over ${s.weeks_documented} weeks
Summary: ${s.evaluation_summary}
Community benefit: ${s.community_benefit}
Evidence strength: ${s.evidence_strength}
`.trim()).join('\n\n---\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system: `You are selecting the winner of the ${quarter} Grand Challenge at the Davidson AI Innovation Center in ${orgId}, Nigeria (nextvillage.community).

Youth learners have spent 3 months taking AI out into their community — helping farmers, fishers, traders, families — and documenting what changed. You are choosing the submission that best demonstrates sustained, documented, real-world community impact.

SELECTION CRITERIA (in order of importance):
1. Real documented change — something measurably improved for a community member
2. Sustained engagement — multiple visits over multiple weeks, genuine relationship
3. Quality of evidence — specific, honest, detailed field notes
4. Use of AI as a tool — AI was genuinely useful, not just consulted once
5. Tier awarded — higher tier breaks ties, but a deeply documented scout beats a thin builder

Be GENEROUS but HONEST. The winner should be a story worth telling to funders, researchers, and the community. If no submission meets a minimum standard of genuine impact, say so clearly.

Respond ONLY with valid JSON. No markdown, no preamble.`,
    messages: [{
      role: 'user',
      content: `Select the winner of the ${quarter} Grand Challenge for ${orgId}.

${summaries.length} submission${summaries.length !== 1 ? 's' : ''} to evaluate:

${submissionsList}

Return a JSON object with exactly these fields:
{
  "winner_submission_id": "the id of the winning submission",
  "winner_learner_name": "their name",
  "winner_title": "their submission title",
  "selection_reasoning": "3-4 sentences explaining why this submission won over the others. Be specific — reference what actually changed in the community.",
  "announcement_headline": "1 sentence for the news banner. Start with the learner's name. e.g. 'Adaeze wins the Q3 Grand Challenge — she helped a Kolo Creek fisher document an oil spill and file a NOSDRA claim'",
  "announcement_body": "2-3 sentences expanding the headline. What did they do, who did it help, what changed? Written for the whole community to read.",
  "honourable_mentions": [
    {
      "submission_id": "id",
      "learner_name": "name",
      "commendation": "1 sentence praising something specific about their submission"
    }
  ]
}`,
    }],
  });

  const raw = response.content.filter(b => b.type === 'text')
    .map(b => (b as any).text).join('');
  const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  return JSON.parse(clean) as WinnerSelection;
}