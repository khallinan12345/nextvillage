// api/site-response-critique.ts
// Evaluates the student's response to a sub-task question against the
// teaching concept that preceded it.
//
// Request:
//   studentResponse  — what the student typed and submitted
//   subTaskQuestion  — the question they were answering
//   subTaskTeaching  — the teaching commentary they read before the question
//   taskId           — current task ID (for context)
//   sessionContext   — known site context (name, purpose, audience, etc.)
//   communicationStrategy?, learningStrategy?
//
// Response:
//   { hasSuggestions: boolean, feedback: string }
//
// If the response is good → hasSuggestions: false,
//   feedback: "Great job…" + brief specific praise
// If the response needs improvement → hasSuggestions: true,
//   feedback: specific, encouraging suggestions tied to the teaching concept

import type { VercelRequest, VercelResponse } from '@vercel/node';
// Migrated from OpenAI → Anthropic direct fetch
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// ─── Cost logger (fire-and-forget, mirrors chat.js pattern) ──────────────────
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
      page:               'WebDevelopmentPage',
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
  }).catch(() => {}); // never block the response for logging
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    studentResponse, subTaskQuestion, subTaskTeaching,
    taskId, sessionContext,
    communicationStrategy, learningStrategy,
  } = req.body;

  if (!studentResponse?.trim()) {
    return res.status(400).json({ error: 'studentResponse is required' });
  }

  const ctx: any = sessionContext || {};
  const ctxLines = [
    ctx.siteName    && `Site name: "${ctx.siteName}"`,
    ctx.sitePurpose && `Purpose: ${ctx.sitePurpose}`,
    ctx.audience    && `Audience: ${ctx.audience}`,
  ].filter(Boolean).join('\n');

  const commStr  = communicationStrategy ? JSON.stringify(communicationStrategy) : null;
  const learnStr = learningStrategy      ? JSON.stringify(learningStrategy)      : null;
  const personalitySection = (commStr || learnStr)
    ? '\n\nLEARNER PROFILE — match this tone in your feedback:\n'
      + (commStr  ? `Communication strategy: ${commStr}\n` : '')
      + (learnStr ? `Learning strategy: ${learnStr}\n`     : '')
    : '';

  const system = `You are a supportive but honest web development educator reviewing a student's response to a planning question.${personalitySection}

YOUR JOB:
Evaluate whether the student's response genuinely engages with the concept the teaching introduced.
Be specific, encouraging, and brief — 2–4 sentences maximum.

EVALUATION CRITERIA:
- Does the response directly address what the question asked?
- Does it show they understood the concept in the teaching (not just gave a generic answer)?
- Is it specific enough to actually guide a developer building their site?
- Are there important gaps — things the teaching mentioned that they didn't address?

RESPONSE RULES:
- If the response is good (addresses the concept, is specific, no important gaps):
  Set hasSuggestions: false.
  Start with "Great job." then add ONE sentence of specific praise naming what they did well.
  End with "You've completed this step — let's move on."

- If the response needs improvement (too vague, misses key concepts, or doesn't answer the question):
  Set hasSuggestions: true.
  Do NOT say "great job" — be honest but kind.
  Give 1–2 specific, concrete suggestions directly tied to what the teaching explained.
  Name the concept from the teaching they should address more fully.
  End with: "Refine your response if you'd like, or move on when ready."

TONE: Warm, direct, professional. Like a mentor who respects the student's time.
Never lecture — you've already taught the concept. Just reflect on whether they applied it.

Return JSON only:
{ "hasSuggestions": boolean, "feedback": "2-4 sentence response" }`;

  const user = `The teaching the student read:
"${subTaskTeaching || '(no teaching provided)'}"

The question they were answering:
"${subTaskQuestion || '(no question provided)'}"

The student's response:
"${studentResponse}"

${ctxLines ? `Site context:\n${ctxLines}` : ''}

Evaluate their response.`;

  try {
    const _apiKey = process.env.ANTHROPIC_API_KEY;
    if (!_apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    const _response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         _apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       ANTHROPIC_MODEL,
        max_tokens:  200,
        temperature: 0.3,
        system:      system,
        messages:    [{ role: 'user', content: user }],
      }),
    });
    if (!_response.ok) {
      const _err = await _response.json().catch(() => ({}));
      throw new Error(`Anthropic API error (${_response.status}): ${(_err as any)?.error?.message || 'Unknown'}`);
    }
    const _completion = await _response.json();
    logCost(
      _completion.usage?.input_tokens                ?? 0,
      _completion.usage?.output_tokens               ?? 0,
      _completion.usage?.cache_read_input_tokens     ?? 0,
      _completion.usage?.cache_creation_input_tokens ?? 0,
    );
    const raw     = _completion.content?.[0]?.text || '{}';
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      // If JSON parse fails, return a safe fallback
      return res.status(200).json({
        hasSuggestions: false,
        feedback: "Great job. You've completed this step — let's move on.",
      });
    }

    return res.status(200).json({
      hasSuggestions: result.hasSuggestions === true,
      feedback:       result.feedback || "Great job. You've completed this step — let's move on.",
    });

  } catch (err: any) {
    console.error('[site-response-critique]', err);
    // Non-blocking fallback — don't error the whole flow
    return res.status(200).json({
      hasSuggestions: false,
      feedback: "Great job. You've completed this step — let's move on.",
    });
  }
}
