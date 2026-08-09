// api/generate-business-content.ts
// Takes the learner's raw answer to a business-planning sub-task and returns:
//   - response: short coaching feedback shown in the chat panel
//   - canvasContent: a clean, canvas-ready version of their answer for the
//     Business Canvas section tied to the current task

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
      action:             'generate',
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

// Which canvas section each task's answer should be distilled into.
const TASK_CANVAS_LABEL: Record<string, string> = {
  spot_opportunity: 'The Opportunity — the problem their AI service solves and who has it',
  know_customer:    'Your Customer — a specific description of their first customer',
  design_offer:     'Your Offer — exactly what they provide and what the customer receives',
  business_model:   'Business Model — how they make money',
  build_offer:      'Your Offer Message — the WhatsApp message or post sent to a first customer',
  price_payment:    'Price & Payment — their price and how customers pay',
  test_validate:    'Test First — how they will test the idea before building anything',
  first_30_days:    'First 30 Days — three customers to contact and the plan to reach them',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    action, prompt, taskId, taskLabel,
    sessionContext, communicationStrategy, learningStrategy, gradeLevel, canvas,
  } = req.body;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const commStr  = communicationStrategy ? JSON.stringify(communicationStrategy) : null;
  const learnStr = learningStrategy      ? JSON.stringify(learningStrategy)      : null;
  const gradeStr = gradeLevel && GRADE_LINE[gradeLevel] ? GRADE_LINE[gradeLevel] : null;
  const persona = (commStr || learnStr || gradeStr)
    ? '\n\nLEARNER PROFILE — adapt vocabulary and tone to match:\n'
      + (commStr  ? `Communication strategy: ${commStr}\n` : '')
      + (learnStr ? `Learning strategy: ${learnStr}\n`     : '')
      + (gradeStr ? `Grade level: ${gradeStr}\n`           : '')
    : '';

  const canvasSectionLabel = TASK_CANVAS_LABEL[taskId] || taskLabel || 'this part of their business plan';

  const ctx: any = sessionContext || {};
  const ctxLines = [
    ctx.opportunity && `Opportunity: ${ctx.opportunity}`,
    ctx.customer    && `Customer: ${ctx.customer}`,
    ctx.offer       && `Offer: ${ctx.offer}`,
  ].filter(Boolean).join('\n');

  const canvasLines = canvas
    ? Object.entries(canvas)
        .filter(([, v]) => typeof v === 'string' && (v as string).trim().length > 0)
        .map(([k, v]) => `${k}: ${(v as string).substring(0, 200)}`)
        .join('\n')
    : '';

  const system = `You are a warm, practical business coach helping a first-generation digital learner build a real, small local business around an AI skill they already have.${persona}

The learner just answered a planning question for this part of their Business Canvas: "${canvasSectionLabel}".
${action === 'iterate' ? 'They are refining an earlier answer based on feedback — build on it, do not start over.' : ''}

YOUR JOB — return two things:
1. "response": 2-3 sentences of direct, encouraging coaching. Affirm what's strong, and if something is vague, name it plainly. No filler.
2. "canvasContent": a clean, concise, canvas-ready rewrite of THEIR answer for the "${canvasSectionLabel}" section — 1-3 sentences, specific, written as a finished statement (not a question, not advice to them). Use their own facts and words; do not invent new details they didn't give.

${ctxLines ? `WHAT THEY'VE ALREADY TOLD YOU:\n${ctxLines}` : ''}
${canvasLines ? `\nTHEIR BUSINESS CANVAS SO FAR (stay consistent with it):\n${canvasLines}` : ''}

Return JSON only — no markdown fences:
{ "response": "...", "canvasContent": "..." }`;

  const user = `Their answer:\n"${prompt}"\n\nCoach it and distill it for the canvas.`;

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
        max_tokens:  500,
        temperature: 0.5,
        system,
        messages: [{ role: 'user', content: user }],
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
    const raw     = completion.content?.[0]?.text || '';
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(200).json({ response: 'Good thinking — that gives your plan a solid foundation.', canvasContent: prompt.trim() });
    }

    return res.status(200).json({
      response:      result.response      || 'Good thinking — that gives your plan a solid foundation.',
      canvasContent: result.canvasContent || prompt.trim(),
    });
  } catch (err: any) {
    console.error('[generate-business-content]', err);
    // Non-blocking fallback — the learner's own text still lands on the canvas.
    return res.status(200).json({ response: 'Good thinking. Click Next Step when you are ready to continue.', canvasContent: prompt.trim() });
  }
}
