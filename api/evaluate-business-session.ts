// api/evaluate-business-session.ts
// Evaluates a learner's completed (or in-progress) Business Canvas and prompt
// history from the AI for Business workshop, and returns a score + coaching
// advice. Response shape is consumed directly by AIForBusinessPage.tsx.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

function logCost(inputTokens: number, outputTokens: number, cacheHitTokens = 0, cacheWriteTokens = 0) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || (!inputTokens && !outputTokens)) return;

  const MTok = 1_000_000;
  const standardInput = Math.max(0, inputTokens - cacheHitTokens - cacheWriteTokens);
  const estimatedCost =
    (standardInput    / MTok) * 3.00  +
    (cacheWriteTokens / MTok) * 3.75  +
    (cacheHitTokens   / MTok) * 0.30  +
    (outputTokens     / MTok) * 15.00;

  fetch(`${supabaseUrl}/rest/v1/api_cost_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      page:               'AIForBusinessPage',
      provider:           'anthropic',
      model:              ANTHROPIC_MODEL,
      action:             'evaluate',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_hit_tokens:   cacheHitTokens,
      cache_write_tokens: cacheWriteTokens,
      estimated_cost_usd: estimatedCost,
      logged_at:          new Date().toISOString(),
    }),
  }).catch(() => {});
}

// Grade level scale: 1=Elementary, 2=Middle School, 3=High School, 4=Adult Learner (18+)
const GRADE_LINE: Record<number, string> = {
  1: 'The learner is in elementary school (grades 3-5, ages 8-11). Use very simple words and short sentences. Be extra encouraging.',
  2: 'The learner is in middle school (grades 6-8, ages 11-14). Use clear, age-appropriate language.',
  3: 'The learner is in high school (grades 9-12, ages 14-18). You can use more sophisticated language.',
  4: 'The learner is an adult (18+). Use clear, professional language — treat them as a capable adult, not a classroom student.',
};

const EVALUATION_SYSTEM = `You are an expert small-business mentor evaluating a first-generation digital learner's Business Canvas from the "AI for Business" workshop — a programme that helps learners turn an AI skill (image generation, voice creation, content writing, website building, workflow automation) into a real local income-generating service.

You will evaluate 8 skills based on their prompt history (their working-through of each planning step) and their final Business Canvas.

SCORING SCALE (apply to every skill):
0 — No Evidence: missing or no meaningful attempt.
1 — Developing: present but vague, generic, or not specific to a real person/situation.
2 — Proficient: clear, specific, grounded in a real local context.
3 — Advanced: specific, grounded, AND shows refinement — they clearly revised or sharpened their thinking across the session.

SKILLS TO SCORE:
1. opportunity_clarity — Is the problem specific and real, tied to an actual community gap?
2. customer_specificity — Is the first customer a specific, describable person (not "everyone")?
3. offer_definition — Is the offer a specific result for a specific person, not just a skill?
4. business_model_viability — Is there a clear, realistic way this makes money?
5. validation_thinking — Do they have a concrete, low-cost plan to test the idea with a real person first?
6. pricing_confidence — Did they name a specific number with reasoning, not "it depends"?
7. offer_message_quality — Is the outreach message short, specific, and opens with the customer's problem rather than "I do..."?
8. action_plan_concreteness — Are there named people, a real timeline, and concrete next steps (not vague intentions)?

For each skill, give a 0-3 score and a 1-2 sentence justification grounded in what they actually wrote.

Return JSON only — no markdown fences:
{
  "overall_score_average": 0.0,
  "business_readiness": "Early Stage" | "Building Momentum" | "Ready to Pitch",
  "detailed_scores": {
    "opportunity_clarity": { "score": 0, "justification": "" },
    "customer_specificity": { "score": 0, "justification": "" },
    "offer_definition": { "score": 0, "justification": "" },
    "business_model_viability": { "score": 0, "justification": "" },
    "validation_thinking": { "score": 0, "justification": "" },
    "pricing_confidence": { "score": 0, "justification": "" },
    "offer_message_quality": { "score": 0, "justification": "" },
    "action_plan_concreteness": { "score": 0, "justification": "" }
  },
  "strengths_summary": "2-4 sentences naming what is genuinely strong, with specifics.",
  "highest_leverage_improvements": "2-4 sentences on the 1-3 changes that would most improve their odds of landing a real first customer.",
  "next_action": "One concrete sentence: the single next thing they should do this week.",
  "advice": "4-8 sentences of direct, practical coaching advice — reference their actual offer, customer, and plan by name/specifics where possible. End with encouragement grounded in what they've built so far, not generic praise."
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { promptHistory, canvas, sessionContext, gradeLevel } = req.body;

  const hasCanvas = canvas && Object.values(canvas).some((v: any) => typeof v === 'string' && v.trim().length > 0);
  if (!promptHistory?.length && !hasCanvas) {
    return res.status(400).json({ error: 'No business plan content to evaluate' });
  }

  const promptLog = (promptHistory || [])
    .map((p: any, i: number) => `[${i + 1}] (${p.action}) ${p.prompt}${p.response ? `\n    → coach: ${p.response}` : ''}`)
    .join('\n');

  const canvasSummary = canvas
    ? Object.entries(canvas)
        .filter(([, v]) => typeof v === 'string' && (v as string).trim().length > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '(canvas not yet filled in)';

  const gradeStr = gradeLevel && GRADE_LINE[gradeLevel] ? `\n\nLEARNER PROFILE: ${GRADE_LINE[gradeLevel]}\nWrite "advice" in language matching this level.` : '';

  const ctx: any = sessionContext || {};
  const ctxLines = [
    ctx.opportunity && `Opportunity (as first described): ${ctx.opportunity}`,
    ctx.customer    && `Customer (as first described): ${ctx.customer}`,
    ctx.offer       && `Offer (as first described): ${ctx.offer}`,
  ].filter(Boolean).join('\n');

  const userContext = `FINAL BUSINESS CANVAS:\n${canvasSummary}\n${ctxLines ? `\nEARLY-SESSION CONTEXT (compare against the final canvas to see how their thinking evolved):\n${ctxLines}\n` : ''}\nPROMPT HISTORY (their working-through of each step):\n${promptLog || '(no prompt history yet)'}${gradeStr}`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       ANTHROPIC_MODEL,
        max_tokens:  2500,
        temperature: 0.4,
        system:      EVALUATION_SYSTEM,
        messages:    [{ role: 'user', content: userContext }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error (${response.status}): ${(err as any)?.error?.message || 'Unknown'}`);
    }

    const completion = await response.json();
    logCost(
      completion.usage?.input_tokens                ?? 0,
      completion.usage?.output_tokens               ?? 0,
      completion.usage?.cache_read_input_tokens     ?? 0,
      completion.usage?.cache_creation_input_tokens ?? 0,
    );
    const raw     = completion.content?.[0]?.text || '{}';
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Evaluation returned invalid JSON', raw: raw.substring(0, 500) });
    }

    const { advice, ...evaluation } = result;
    return res.status(200).json({ success: true, evaluation, advice: advice || '' });
  } catch (err: any) {
    console.error('[evaluate-business-session]', err);
    return res.status(500).json({ error: err.message || 'Internal server error', success: false });
  }
}
