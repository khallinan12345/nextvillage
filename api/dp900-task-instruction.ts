// api/dp900-task-instruction.ts
// Handles three modes for DP-900 cert prep:
//   mode unset  → generate TaskInstruction (headline, subTasks, subTaskTeaching)
//   mode=evaluate → evaluate a learner's answer and return feedback
//   mode=hint   → give a nudge without revealing the full answer

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL             = 'claude-sonnet-5';

// ─── Cost logger (fire-and-forget) ───────────────────────────────────────────
function logCost(action: string, inputTokens: number, outputTokens: number) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || (!inputTokens && !outputTokens)) return;
  const MTok = 1_000_000;
  const estimatedCost = (inputTokens / MTok) * 2.00 + (outputTokens / MTok) * 10.00;
  fetch(`${supabaseUrl}/rest/v1/api_cost_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      page:               'DP900Page',
      provider:           'anthropic',
      model:              MODEL,
      action,
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_hit_tokens:   0,
      cache_write_tokens: 0,
      estimated_cost_usd: estimatedCost,
      logged_at:          new Date().toISOString(),
    }),
  }).catch(() => {});
}


async function callClaude(system: string, user: string, maxTokens = 1200, action = 'generate'): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[dp900-task-instruction] Anthropic error:', res.status, err);
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  logCost(action, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
  return data.content?.[0]?.text ?? '';
}

// ── Mode: generate TaskInstruction ──────────────────────────────────────────

async function generateInstruction(body: any): Promise<object> {
  const { topicId, topicLabel, domain, completedTopics = [], communicationStrategy, learningStrategy } = body;

  const personalityHint = [
    communicationStrategy ? `Communication style: ${JSON.stringify(communicationStrategy)}` : '',
    learningStrategy      ? `Learning approach: ${JSON.stringify(learningStrategy)}`          : '',
  ].filter(Boolean).join('\n');

  const system = `You are a DP-900 certification coach for young women in Oloibiri, Bayelsa State, Nigeria, learning through the Girls AIing & Vibing platform at the Davidson AI Innovation Center.

Your role: generate Socratic teaching questions — not explanations. Make the learner think and articulate understanding in their own words. Every example must connect to their lived context: fish catch data, water quality sensor readings from Nun River, OWFA fishing records, oil contamination history, cassava farming, the Girls AIing learner platform itself, and community health and energy data.

The DP-900 is about data: how it is stored, structured, and analysed. Ground every data concept in real data the community generates or uses.

${personalityHint}

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "headline": "short topic title",
  "context": "Domain X: short domain label",
  "subTasks": ["question 1", "question 2", "question 3"],
  "subTaskTeaching": ["concept behind Q1", "concept behind Q2", "concept behind Q3"],
  "examplePrompt": "copy of subTasks[0]"
}

Rules:
- 3 subTasks and 3 matching subTaskTeaching entries always
- subTaskTeaching: 2–3 sentences of exam concept — the "Concept" panel the learner reads before answering
- subTasks: Socratic questions grounded in Oloibiri / Girls AIing / Nigerian data context — never generic
- Escalate difficulty: Q1 foundational, Q2 applied, Q3 exam-style scenario
- No bullet lists inside JSON string values — use plain prose`;

  const user = `Generate a TaskInstruction for DP-900 topic: "${topicLabel}" (Domain ${domain}, id: ${topicId}).
Already completed topics: ${completedTopics.join(', ') || 'none — this is the first topic'}.`;

  const raw  = await callClaude(system, user, 1200, 'generate');
  const json = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(json);
}

// ── Mode: evaluate answer ────────────────────────────────────────────────────

async function evaluateAnswer(body: any): Promise<object> {
  const { topicId, domain, subTaskQuestion, subTaskTeaching, userAnswer, communicationStrategy, learningStrategy } = body;

  const personalityHint = communicationStrategy
    ? `Adapt feedback tone to: ${JSON.stringify(communicationStrategy)}`
    : '';

  const system = `You are a DP-900 certification coach evaluating a learner's answer. Be warm, precise, and honest.

${personalityHint}

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "feedback": "2–4 sentence coaching response — acknowledge what is correct, correct what is wrong, ask a follow-up thought",
  "hasSuggestions": true or false,
  "explanation": "optional: 1–2 sentences of deeper exam insight if the answer was strong"
}

hasSuggestions: true if the answer is missing key concepts or contains errors.
hasSuggestions: false if the answer demonstrates solid understanding.
Never give away the full answer — coach toward understanding.`;

  const user = `DP-900 topic: "${topicId}" (Domain ${domain})
Concept taught: "${subTaskTeaching}"
Question asked: "${subTaskQuestion}"
Learner's answer: "${userAnswer}"`;

  const raw  = await callClaude(system, user, 600, 'evaluate');
  const json = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(json);
}

// ── Mode: hint ───────────────────────────────────────────────────────────────

async function generateHint(body: any): Promise<object> {
  const { topicId, domain, subTaskQuestion, userAnswer } = body;

  const system = `You are a DP-900 certification coach giving a learner a nudge — not the answer.

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "hint": "1–2 sentence nudge that redirects thinking without revealing the answer"
}

Rules: do not confirm or deny specific parts of their answer. Point toward a data concept or ask a guiding question. Keep it brief.`;

  const user = `Topic: "${topicId}" (Domain ${domain})
Question: "${subTaskQuestion}"
Draft answer so far: "${userAnswer}"`;

  const raw  = await callClaude(system, user, 300, 'hint');
  const json = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(json);
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body ?? {};
    const { mode } = body;

    console.log(`[dp900-task-instruction] mode=${mode ?? 'generate'}, topic=${body.topicId}`);

    switch (mode) {
      case 'evaluate': {
        const result = await evaluateAnswer(body);
        return res.status(200).json(result);
      }
      case 'hint': {
        const result = await generateHint(body);
        return res.status(200).json(result);
      }
      default: {
        const result = await generateInstruction(body);
        return res.status(200).json(result);
      }
    }
  } catch (err: any) {
    console.error('[dp900-task-instruction] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
