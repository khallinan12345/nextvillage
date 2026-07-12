// supabase/functions/evaluate-grand-challenge/index.ts
//
// Evaluates a quarterly Grand Challenge submission.
// Called when a learner submits their impact arc for the quarter.
//
// The Grand Challenge is a sustained quarterly journey — unlike the weekly
// Community AI Challenge which captures a single action, the Grand Challenge
// documents a learner's relationship with one community member over multiple
// weeks, using AI to deepen real impact across time.
//
// Flow:
//   1. Load submission + active quarter from DB
//   2. Load learner profile for context
//   3. Call Claude to evaluate the impact arc
//   4. Write evaluation back to grand_challenge_submissions
//   5. Upsert to grand_challenge_leaderboard

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIER_LABELS: Record<string, string> = {
  seed:       'Community Teacher',
  scout:      'Problem Finder',
  bridge:     'Community Connector',
  builder:    'AI for Good',
  multiplier: 'Village Leader',
};

// Tier rank for leaderboard ordering (higher = better)
const TIER_RANK: Record<string, number> = {
  multiplier: 5,
  builder:    4,
  bridge:     3,
  scout:      2,
  seed:       1,
};

// ─── Evidence linking ──────────────────────────────────────────────────────────
// Learners can attach their own resolved consultations as verified evidence
// instead of (or alongside) writing the same story into impact_arc prose. See
// consultation_evidence_links + community_impact_resolutions (migrations).

const DOMAIN_TABLES: Record<string, string> = {
  agriculture:       'agriculture_consultations',
  fishing:           'fishing_consultations',
  healthcare:        'health_assessments',
  entrepreneurship:  'entrepreneurship_consultations',
  animal_husbandry:  'animal_husbandry_consultations',
};

const DOMAIN_SUMMARY_FIELD: Record<string, string> = {
  agriculture:       'problem_summary',
  fishing:           'problem_summary',
  healthcare:        'ai_triage_summary',
  entrepreneurship:  'problem_summary',
  animal_husbandry:  'symptom_summary',
};

interface LinkedEvidence {
  domain: string;
  summary: string | null;
  resolution_outcome: string | null;
  resolution_narrative: string | null;
  resolution_value_amount: number | null;
  resolution_value_unit: string | null;
  resolution_value_label: string | null;
  created_at: string;
}

async function fetchLinkedEvidence(
  supabase: ReturnType<typeof createClient>,
  sourceType: 'challenge_enrollment' | 'grand_challenge_submission',
  sourceId: string,
): Promise<LinkedEvidence[]> {
  const { data: links } = await supabase
    .from('consultation_evidence_links')
    .select('consultation_domain, consultation_id')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);

  if (!links || links.length === 0) return [];

  const evidence: LinkedEvidence[] = [];
  for (const link of links) {
    const table = DOMAIN_TABLES[link.consultation_domain];
    const summaryField = DOMAIN_SUMMARY_FIELD[link.consultation_domain];
    if (!table) continue;

    const { data: row } = await supabase
      .from(table)
      .select(`${summaryField}, resolution_outcome, resolution_narrative, resolution_value_amount, resolution_value_unit, resolution_value_label, created_at`)
      .eq('id', link.consultation_id)
      .single();

    if (row) {
      evidence.push({
        domain: link.consultation_domain,
        summary: row[summaryField] ?? null,
        resolution_outcome: row.resolution_outcome,
        resolution_narrative: row.resolution_narrative,
        resolution_value_amount: row.resolution_value_amount,
        resolution_value_unit: row.resolution_value_unit,
        resolution_value_label: row.resolution_value_label,
        created_at: row.created_at,
      });
    }
  }
  return evidence;
}

function formatEvidenceForPrompt(evidence: LinkedEvidence[]): string {
  if (evidence.length === 0) return '';
  const items = evidence.map((e, i) => {
    const date = new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const outcome = e.resolution_outcome === 'applied' ? 'advice applied fully'
      : e.resolution_outcome === 'partially_applied' ? 'partially applied'
      : e.resolution_outcome === 'not_applied' ? 'not applied'
      : 'outcome not recorded';
    const value = e.resolution_value_amount != null
      ? ` Estimated value: ${e.resolution_value_unit === 'NGN' ? '₦' : ''}${e.resolution_value_amount}${e.resolution_value_unit && e.resolution_value_unit !== 'NGN' ? ` ${e.resolution_value_unit}` : ''} (${e.resolution_value_label}).`
      : '';
    return `${i + 1}. [${e.domain}] Resolved ${date} — ${outcome}. "${e.resolution_narrative || e.summary || 'No narrative recorded.'}"${value}`;
  }).join('\n');

  return `\n\nVERIFIED EVIDENCE ATTACHED across the quarter (from the learner's own dated consultation records — not self-reported prose):\n${items}\n\nTreat this as credible, verified proof of sustained real community impact and weight it heavily — especially for community_depth_score and the overall tier. Multiple resolved consultations with captured outcomes across different weeks are strong evidence of "sustained_engagement"; a captured before/after change is strong evidence for "builder" tier.`;
}

interface GrandChallengeEvaluation {
  tier: 'seed' | 'scout' | 'bridge' | 'builder' | 'multiplier';
  tier_label: string;
  summary: string;
  impact_reasoning: string;
  sustained_engagement_score: number; // 0-100
  community_depth_score: number;      // 0-100
  ai_integration_score: number;       // 0-100
  follow_up_instruction: string;
  prize_description: string;
}

// ─── Structured error logging ─────────────────────────────────────────────────

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'evaluate-grand-challenge',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block evaluation for logging */ }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body: { submission_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!body.submission_id) {
    return new Response(JSON.stringify({ error: 'submission_id required' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  try {
    const result = await evaluateSubmission(supabase, anthropic, body.submission_id);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[evaluate-grand-challenge] Error:', message);
    await logEvent(supabase, {
      event_type: 'evaluation_error',
      severity:   'error',
      details: { submission_id: body.submission_id, error: message },
    });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Core evaluation ──────────────────────────────────────────────────────────

async function evaluateSubmission(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  submissionId: string,
) {
  // ── 1. Load submission ────────────────────────────────────────────────────
  const { data: submission, error: subErr } = await supabase
    .from('grand_challenge_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) {
    throw new Error(`Submission not found: ${subErr?.message}`);
  }

  if (submission.status === 'awarded') {
    return {
      already_awarded: true,
      tier:            submission.tier_awarded,
      tier_label:      TIER_LABELS[submission.tier_awarded],
      evaluation:      submission.evaluation_json,
    };
  }

  if (submission.status !== 'submitted') {
    throw new Error(`Submission status is '${submission.status}' — must be 'submitted' to evaluate`);
  }

  // ── 2. Load active quarter ────────────────────────────────────────────────
  const { data: quarter, error: quarterErr } = await supabase
    .from('grand_challenge_quarters')
    .select('*')
    .eq('quarter', submission.quarter)
    .eq('org_id', submission.org_id)
    .single();

  if (quarterErr || !quarter) {
    throw new Error(`Quarter not found: ${quarterErr?.message}`);
  }

  // ── 3. Load learner profile ───────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, city, age')
    .eq('id', submission.learner_id)
    .single();

  const learnerName = submission.learner_name ?? profile?.name ?? 'the learner';

  // ── 4. Validate minimum engagement ───────────────────────────────────────
  if (submission.journal_entry_count < 1) {
    throw new Error('Submission has no journal entries — cannot evaluate');
  }

  // ── 5. Call Claude ────────────────────────────────────────────────────────
  const evidence = await fetchLinkedEvidence(supabase, 'grand_challenge_submission', submissionId);
  const evaluation = await callClaude(anthropic, { learnerName, submission, quarter, evidence });

  // ── 6. Write evaluation back to submission ────────────────────────────────
  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('grand_challenge_submissions')
    .update({
      status:          'awarded',
      evaluated_at:    now,
      awarded_at:      now,
      tier_awarded:    evaluation.tier,
      evaluation_json: evaluation,
      prize_description: evaluation.prize_description,
      updated_at:      now,
    })
    .eq('id', submissionId);

  if (updateErr) throw new Error(`Update submission: ${updateErr.message}`);

  // ── 7. Upsert to leaderboard ──────────────────────────────────────────────
  const { error: leaderboardErr } = await supabase
    .from('grand_challenge_leaderboard')
    .upsert({
      learner_id:           submission.learner_id,
      org_id:               submission.org_id,
      quarter:              submission.quarter,
      title:                submission.title,
      community_member_name: submission.community_member_name,
      community_impact_slug: submission.community_impact_slug,
      journal_entry_count:  submission.journal_entry_count,
      weeks_documented:     submission.weeks_documented,
      tier_awarded:         evaluation.tier,
      tier_rank:            TIER_RANK[evaluation.tier] ?? 1,
      is_quarter_winner:    false, // set by select-grand-challenge-winner
      status:               'awarded',
      submitted_at:         submission.submitted_at,
      learner_name:         learnerName,
      avatar_url:           profile?.city ?? null,
    }, { onConflict: 'learner_id,quarter,org_id' });

  if (leaderboardErr) throw new Error(`Upsert leaderboard: ${leaderboardErr.message}`);

  console.log(`[evaluate-grand-challenge] Submission ${submissionId} awarded ${evaluation.tier}`);

  return {
    tier:       evaluation.tier,
    tier_label: TIER_LABELS[evaluation.tier],
    evaluation,
  };
}

// ─── Claude evaluation call ───────────────────────────────────────────────────

async function callClaude(
  anthropic: Anthropic,
  ctx: {
    learnerName: string;
    submission:  Record<string, any>;
    quarter:     Record<string, any>;
    evidence:    LinkedEvidence[];
  },
): Promise<GrandChallengeEvaluation> {
  const { learnerName, submission, quarter, evidence } = ctx;

  const systemPrompt = `You are evaluating a Quarterly Grand Challenge submission from a youth learner at the Davidson AI Innovation Center in Oloibiri, Nigeria (nextvillage.community).

The Grand Challenge is a SUSTAINED QUARTERLY JOURNEY — very different from a single weekly action. The learner has documented their relationship with one real community member over multiple weeks, using AI to deepen understanding and drive real change.

What you are evaluating:
- Did they sustain engagement with a real person over multiple weeks?
- Did they use AI thoughtfully to understand and address a real problem?
- Did their impact grow over time?
- Is there evidence of genuine community transformation, however small?

IMPACT TIERS (in ascending order):
- seed (Community Teacher): Some sustained engagement, documented at least a few weeks, basic AI use
- scout (Problem Finder): Clearly documented a real problem with a specific person across multiple weeks
- bridge (Community Connector): Brought the community member into the platform or connected them to resources
- builder (AI for Good): Co-solved a real problem with measurable outcome using AI across the quarter
- multiplier (Village Leader): Their work inspired others — the community member became a peer educator or advocate

SCORING GUIDELINES (0-100 each):
- sustained_engagement_score: How consistently did they document across weeks? (weeks_documented / 12 weeks × 100, adjusted for quality)
- community_depth_score: How specific, personal, and real is their account of the community member and their situation?
- ai_integration_score: How thoughtfully did they use AI — not just for answers, but to deepen understanding and action?

PRIZE DESCRIPTION: Write a warm 1-sentence description of what prize or recognition this tier earns at the quarterly ceremony. Be specific and celebratory.

You MUST respond with ONLY valid JSON. No markdown, no preamble.`;

  const userPrompt = `Evaluate this Quarterly Grand Challenge submission.

QUARTER: ${quarter.quarter} (${quarter.start_date} to ${quarter.submission_deadline})
ORG: ${submission.org_id}
PAGE: ${submission.community_impact_slug}

LEARNER: ${learnerName}
COMMUNITY MEMBER: ${submission.community_member_name ?? 'not named'} (${submission.community_member_role ?? 'role not specified'})
JOURNAL ENTRIES: ${submission.journal_entry_count}
WEEKS DOCUMENTED: ${submission.weeks_documented}

IMPACT ARC (learner's summary of their quarterly journey):
${submission.impact_arc ?? '(no impact arc provided)'}
${formatEvidenceForPrompt(evidence)}

Return a JSON object with exactly these fields:
{
  "tier": "one of: seed | scout | bridge | builder | multiplier",
  "tier_label": "the label for that tier",
  "summary": "2-3 sentences describing ${learnerName}'s quarterly journey — written for the public leaderboard and ceremony. Third person, specific, celebratory.",
  "impact_reasoning": "3-4 sentences explaining to ${learnerName} why they earned this tier. Reference specific details from their submission. Warm, honest, and direct.",
  "sustained_engagement_score": 0,
  "community_depth_score": 0,
  "ai_integration_score": 0,
  "follow_up_instruction": "1-2 sentences telling ${learnerName} what to focus on next quarter to go deeper. Specific and actionable.",
  "prize_description": "1 sentence describing what this tier earns at the quarterly ceremony."
}`;

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1000,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: GrandChallengeEvaluation;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e}\n\nRaw: ${raw.slice(0, 500)}`);
  }

  const validTiers = ['seed', 'scout', 'bridge', 'builder', 'multiplier'];
  if (!validTiers.includes(parsed.tier)) {
    throw new Error(`Invalid tier returned: ${parsed.tier}`);
  }

  parsed.tier_label = TIER_LABELS[parsed.tier];
  return parsed;
}