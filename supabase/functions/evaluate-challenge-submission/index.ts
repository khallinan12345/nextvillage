// supabase/functions/evaluate-challenge-submission/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

interface EvaluationResult {
  tier: 'seed' | 'scout' | 'bridge' | 'builder' | 'multiplier';
  tier_label: string;
  summary: string;
  tier_reasoning: string;
  follow_up_instruction: string;
  next_tier_hint: string;
}

const TIER_LABELS: Record<string, string> = {
  seed:       'Community Teacher',
  scout:      'Problem Finder',
  bridge:     'Community Connector',
  builder:    'AI for Good',
  multiplier: 'Village Leader',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Structured error logging ─────────────────────────────────────────────────

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'evaluate-challenge-submission',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block evaluation for logging */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

  let body: { enrollment_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  if (!body.enrollment_id) {
    return new Response(JSON.stringify({ error: 'enrollment_id required' }), {
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

  try {
    const result = await evaluateSubmission(supabase, anthropic, body.enrollment_id);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = String(err);
    // Surface rejection reasons cleanly to the frontend
    if (message.startsWith('TEMPLATE_SUBMISSION:') || message.startsWith('SHORT_SUBMISSION:') || message.startsWith('AI_GENERATED_SUBMISSION:')) {
      return new Response(JSON.stringify({ ok: false, rejection: true, error: message }), {
        status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    // Log unexpected errors only — rejections are expected flow
    console.error('evaluate-challenge-submission error:', err);
    await logEvent(supabase, {
      event_type: 'evaluation_error',
      severity:   'error',
      details: {
        enrollment_id: body.enrollment_id,
        error:         message,
      },
    });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Submission quality pre-check ─────────────────────────────────────────────

const TEMPLATE_PATTERNS = [
  /\[Name\]/i,
  /\[Your (Name|Title|Region|Country|Date)\]/i,
  /\[Region\/Country Name\]/i,
  /\[mention specific/i,
  /Dear \[/i,
  /Sincerely,\s*\[/i,
  /\[insert/i,
  /\[add /i,
  /\[your/i,
];

const AI_GENERATED_PATTERNS = [
  /as an ai,?\s+i (do not|don't) have a physical/i,
  /as an ai,?\s+i (do not|don't) have a body/i,
  /i am an ai/i,
  /since i am an ai/i,
  /i don'?t have a physical (body|presence|form)/i,
  /i cannot (physically|actually) visit/i,
  /i have not (physically|actually|personally) visited/i,
  /i simulated a field (visit|survey|tracking)/i,
  /would you like (me to|to) (analyze|explore|look at|discuss)/i,
  /here is a (foundational )?framework you can use/i,
  /if you (are|were) (planning|looking) to conduct your own/i,
];

const MINIMUM_WORDS = 30;

type RejectionReason = 'template' | 'too_short' | 'ai_generated';

function checkSubmissionQuality(
  actionTaken: string | null,
  impactObserved: string | null,
  extraDetail: string | null,
): { valid: boolean; reason?: RejectionReason; wordCount?: number } {
  const combined = [actionTaken, impactObserved, extraDetail].filter(Boolean).join(' ');
  const wordCount = combined.trim().split(/\s+/).filter(Boolean).length;

  if (TEMPLATE_PATTERNS.some(p => p.test(combined))) {
    return { valid: false, reason: 'template', wordCount };
  }
  if (AI_GENERATED_PATTERNS.some(p => p.test(combined))) {
    return { valid: false, reason: 'ai_generated', wordCount };
  }
  if (wordCount < MINIMUM_WORDS) {
    return { valid: false, reason: 'too_short', wordCount };
  }
  return { valid: true, wordCount };
}

// ─── Core evaluation ──────────────────────────────────────────────────────────

async function evaluateSubmission(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  enrollmentId: string,
) {
  const { data: enrollment, error: enrollErr } = await supabase
    .from('challenge_enrollments')
    .select(`
      *,
      community_challenges (
        title, description, community_impact_slug, tier_target,
        challenge_instruction, return_question_1, return_question_2,
        return_question_3, community_role, org_id
      )
    `)
    .eq('id', enrollmentId)
    .single();

  if (enrollErr || !enrollment) {
    throw new Error(`Enrollment not found: ${enrollErr?.message}`);
  }

  if (enrollment.status === 'awarded') {
    return {
      already_awarded: true,
      tier: enrollment.tier_awarded,
      tier_label: TIER_LABELS[enrollment.tier_awarded],
      impact_evaluation: enrollment.impact_evaluation,
    };
  }

  if (enrollment.status !== 'submitted') {
    throw new Error(`Enrollment status is '${enrollment.status}' — must be 'submitted' to evaluate`);
  }

  const challenge = enrollment.community_challenges;

  const quality = checkSubmissionQuality(
    enrollment.action_taken,
    enrollment.impact_observed,
    enrollment.extra_detail,
  );

  if (!quality.valid) {
    const isTemplate    = quality.reason === 'template';
    const isAiGenerated = quality.reason === 'ai_generated';

    let summary: string;
    let tier_reasoning: string;
    let follow_up_instruction: string;
    let errorPrefix: string;

    if (isAiGenerated) {
      errorPrefix = 'AI_GENERATED_SUBMISSION';
      summary = 'Submission appears to be AI-generated rather than a personal community account.';
      tier_reasoning = 'It looks like you may have asked an AI to answer this challenge for you. The Community AI Challenge has two steps: first you go into the community and talk to real people, then you come back to the hub and use AI to help deepen your impact. We cannot award a tier for an AI-written response — we need to hear what YOU actually did and saw.';
      follow_up_instruction = 'Go out into your community this week. Talk to a real farmer, fisher, trader, or family member. Write down what they told you in your own words. Then come back to the hub — that is when you use AI to help make sense of it.';
    } else if (isTemplate) {
      errorPrefix = 'TEMPLATE_SUBMISSION';
      summary = 'Submission contained template placeholder text and was not evaluated.';
      tier_reasoning = 'Your submission appears to contain unfilled template text (e.g. [Name], [Your Title]). Please describe in your own words what you actually did in the community this week.';
      follow_up_instruction = 'Rewrite your submission in your own words — describe exactly who you talked to, what you said, and what happened.';
    } else {
      errorPrefix = 'SHORT_SUBMISSION';
      summary = `Submission was too short (${quality.wordCount} words) to evaluate.`;
      tier_reasoning = `Your submission was only ${quality.wordCount} words. We need at least a few sentences describing who you talked to, what you said, and what happened.`;
      follow_up_instruction = 'Add more detail about your community action and resubmit.';
    }

    const rejectionEval = {
      tier: null,
      rejection_reason: quality.reason,
      summary,
      tier_reasoning,
      follow_up_instruction,
      next_tier_hint: 'Every learner who goes into the community and writes what they personally saw and heard earns at least a Seed (Community Teacher) tier.',
    };

    await supabase
      .from('challenge_enrollments')
      .update({ impact_evaluation: rejectionEval })
      .eq('id', enrollmentId);

    throw new Error(`${errorPrefix}: ${tier_reasoning}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, city, age')
    .eq('id', enrollment.learner_id)
    .single();

  const learnerName = profile?.name ?? 'the learner';

  const evaluation = await callClaude(anthropic, { learnerName, challenge, enrollment });

  const { error: updateErr } = await supabase
    .from('challenge_enrollments')
    .update({
      status:            'awarded',
      awarded_at:        new Date().toISOString(),
      tier_awarded:      evaluation.tier,
      impact_evaluation: evaluation,
    })
    .eq('id', enrollmentId);

  if (updateErr) throw new Error(`Update enrollment: ${updateErr.message}`);

  const { error: tierErr } = await supabase
    .from('community_impact_tiers')
    .insert({
      learner_id:       enrollment.learner_id,
      org_id:           challenge.org_id,
      tier:             evaluation.tier,
      tier_label:       TIER_LABELS[evaluation.tier],
      challenge_id:     enrollment.challenge_id,
      enrollment_id:    enrollmentId,
      evidence_summary: evaluation.summary,
    });

  if (tierErr) throw new Error(`Insert tier: ${tierErr.message}`);

  return {
    tier:              evaluation.tier,
    tier_label:        TIER_LABELS[evaluation.tier],
    impact_evaluation: evaluation,
  };
}

// ─── Claude evaluation call ───────────────────────────────────────────────────

async function callClaude(
  anthropic: Anthropic,
  ctx: {
    learnerName: string;
    challenge: Record<string, string>;
    enrollment: Record<string, string>;
  },
): Promise<EvaluationResult> {

  const { learnerName, challenge, enrollment } = ctx;

  const reflectionPairs = [
    { q: challenge.return_question_1, a: enrollment.action_taken },
    { q: challenge.return_question_2, a: enrollment.impact_observed },
    challenge.return_question_3
      ? { q: challenge.return_question_3, a: enrollment.extra_detail }
      : null,
  ]
    .filter(Boolean)
    .map(pair => `Q: ${pair!.q}\nA: ${pair!.a || '(no answer provided)'}`)
    .join('\n\n');

  const systemPrompt = `You are evaluating a Community AI Challenge submission from a youth learner at the Davidson AI Innovation Center in Nigeria (nextvillage.community).

The Community AI Challenge is a TWO-PHASE process:
  Phase 1 - Go into the community: talk to real farmers, fishers, traders, healthcare workers, or family members. Observe real problems. Write what you personally saw and heard.
  Phase 2 - Come back to the hub: use AI to analyze, deepen, and act on what you found.

The submission you are evaluating is the learner's account of Phase 1. It must describe real personal community action to earn scout tier or above.

IMPACT TIERS (in ascending order):
- seed (Community Teacher): Made some genuine attempt at community contact, even if vague or minimal
- scout (Problem Finder): Went out and found and documented a real community problem with specific people and details
- bridge (Community Connector): Physically brought a community member to the hub for an AI session
- builder (AI for Good): Co-solved a real problem with a community member using AI and describes the outcome
- multiplier (Village Leader): Recruited and began mentoring a new learner

AWARDING RULES:
- To earn scout or above, the submission must name or describe specific real people, places, or conversations - not generic descriptions
- A generic or vague account with no specific community details earns seed only, with encouragement to go deeper
- Award the tier that best matches what they actually DID, not what was targeted
- If their action exceeds the target tier, award the higher tier
- Bridge and multiplier are awarded by database triggers. Only award bridge if the learner clearly describes bringing someone to the hub
- Be warm and encouraging - every genuine step into the community matters
- The follow_up_instruction should tell them exactly what to do next to deepen their impact

You MUST respond with ONLY valid JSON. No markdown, no preamble.`;

  const userPrompt = `Evaluate this Community AI Challenge submission.

CHALLENGE: ${challenge.title}
PAGE: ${challenge.community_impact_slug}
TARGET TIER: ${challenge.tier_target}
CHALLENGE INSTRUCTION: ${challenge.challenge_instruction}
COMMUNITY ROLE TARGETED: ${challenge.community_role}

LEARNER: ${learnerName}
COMMUNITY MEMBER ROLE REPORTED: ${enrollment.community_member_role || 'not specified'}
BROUGHT PERSON TO HUB: ${enrollment.brought_person ? 'Yes' : 'No'}

LEARNER'S REFLECTION:
${reflectionPairs}

Return a JSON object with exactly these fields:

{
  "tier": "one of: seed | scout | bridge | builder | multiplier",
  "tier_label": "the label for that tier",
  "summary": "1-2 sentences describing what ${learnerName} did — written for the public leaderboard and news banner. Third person, specific, celebratory.",
  "tier_reasoning": "2-3 sentences explaining to ${learnerName} why they earned this tier. Reference what they specifically wrote. Warm and direct.",
  "follow_up_instruction": "1-2 sentences telling ${learnerName} exactly what to do next to go deeper with this community member or problem. Specific and actionable.",
  "next_tier_hint": "1 sentence describing what would earn a higher tier next time."
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: EvaluationResult;
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