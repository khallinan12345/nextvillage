// api/ab730-task-instruction.ts
// Handles three modes for AB-730: AI Business Professional cert prep:
//   mode unset    → generate TaskInstruction (headline, subTasks, subTaskTeaching)
//   mode=evaluate → evaluate a learner's answer and return feedback
//   mode=hint     → give a nudge without revealing the full answer
//
// AB-730 focuses on using Microsoft 365 Copilot in real business workflows —
// no coding required. Questions should be practical and scenario-based.

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
      page:               'AB730Page',
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
    console.error('[ab730-task-instruction] Anthropic error:', res.status, err);
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  logCost(action, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
  return data.content?.[0]?.text ?? '';
}

// ── Skill label map ───────────────────────────────────────────────────────────

const SKILL_LABELS: Record<number, string> = {
  1: 'Skill 1: Generative AI Fundamentals (~30%)',
  2: 'Skill 2: Manage Prompts & Conversations (~35%)',
  3: 'Skill 3: Draft & Analyse Business Content (~35%)',
};

// ── Mode: generate TaskInstruction ──────────────────────────────────────────

async function generateInstruction(body: any): Promise<object> {
  const {
    topicId, topicLabel, skill,
    completedTopics = [],
    communicationStrategy, learningStrategy,
  } = body;

  const personalityHint = [
    communicationStrategy ? `Communication style: ${JSON.stringify(communicationStrategy)}` : '',
    learningStrategy      ? `Learning approach: ${JSON.stringify(learningStrategy)}`          : '',
  ].filter(Boolean).join('\n');

  const system = `You are an AB-730 (Microsoft Certified: AI Business Professional) certification coach for young women in Oloibiri, Bayelsa State, Nigeria, learning through the Girls AIing & Vibing platform at the Davidson AI Innovation Center.

The AB-730 exam tests practical use of Microsoft 365 Copilot in real business workflows — Word, Excel, PowerPoint, Outlook, Teams, and Copilot Chat. It requires NO coding. Questions are scenario-based: given a business situation, choose the best Copilot action, prompt, or workflow.

Your role: generate Socratic teaching questions that make the learner think through real business decisions. Ground every example in contexts they know: the Girls AIing platform, Davidson AI Innovation Center operations, Oloibiri community organisations, Nigerian NGOs, small agriculture or fishing businesses, and community health work. Never use generic Western corporate examples when a Nigerian community context works.

${personalityHint}

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "headline": "short topic title",
  "context": "Skill X: short skill label",
  "subTasks": ["question 1", "question 2", "question 3"],
  "subTaskTeaching": ["concept behind Q1", "concept behind Q2", "concept behind Q3"],
  "examplePrompt": "copy of subTasks[0]"
}

Rules:
- Always 3 subTasks and 3 matching subTaskTeaching entries
- subTaskTeaching: 2–3 sentences explaining the exam concept — the "Concept" card the learner reads before answering
- subTasks: Socratic scenario questions — practical, business-focused, grounded in Nigerian / Oloibiri context
- Escalate difficulty: Q1 foundational understanding, Q2 applied scenario, Q3 exam-style decision or comparison
- No bullet lists inside JSON string values — use plain prose
- For Skill 3 topics (Copilot in specific apps), include at least one question that asks the learner to write an actual Copilot prompt`;

  const user = `Generate a TaskInstruction for AB-730 topic: "${topicLabel}" (${SKILL_LABELS[skill] ?? `Skill ${skill}`}, id: ${topicId}).
Already completed topics: ${completedTopics.join(', ') || 'none — this is the first topic'}.`;

  const raw  = await callClaude(system, user, 1200, 'generate');
  const json = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(json);
}

// ── Mode: evaluate answer ────────────────────────────────────────────────────

async function evaluateAnswer(body: any): Promise<object> {
  const {
    topicId, skill,
    subTaskQuestion, subTaskTeaching, userAnswer,
    communicationStrategy, learningStrategy,
  } = body;

  const personalityHint = communicationStrategy
    ? `Adapt feedback tone to: ${JSON.stringify(communicationStrategy)}`
    : '';

  const system = `You are an AB-730 certification coach evaluating a learner's answer about Microsoft 365 Copilot. Be warm, precise, and practical.

${personalityHint}

The AB-730 is a business exam — answers should reflect practical, scenario-based thinking. A strong answer names the correct Copilot feature, app, or prompt technique AND explains why it is appropriate for the business scenario.

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "feedback": "2–4 sentence coaching response — acknowledge what is correct, correct any errors, and if appropriate ask a follow-up practical question",
  "hasSuggestions": true or false,
  "explanation": "optional: 1–2 sentences of deeper exam insight or a real-world tip if the answer was strong"
}

hasSuggestions: true if the answer misidentifies a Copilot feature, skips a key exam concept, or lacks business reasoning.
hasSuggestions: false if the answer correctly identifies the relevant Copilot capability and gives sound business justification.
Never reveal the full answer — coach the learner toward it.`;

  const user = `AB-730 topic: "${topicId}" (${SKILL_LABELS[skill] ?? `Skill ${skill}`})
Concept taught: "${subTaskTeaching}"
Question asked: "${subTaskQuestion}"
Learner's answer: "${userAnswer}"`;

  const raw  = await callClaude(system, user, 600, 'evaluate');
  const json = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(json);
}

// ── Mode: hint ───────────────────────────────────────────────────────────────

async function generateHint(body: any): Promise<object> {
  const { topicId, skill, subTaskQuestion, userAnswer } = body;

  const system = `You are an AB-730 certification coach giving a learner a gentle nudge — not the answer.

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "hint": "1–2 sentence nudge that redirects thinking without revealing the answer"
}

Rules:
- Do not confirm or deny specific parts of their answer
- Point toward the relevant Copilot feature, app, or prompt principle
- Keep it brief and encouraging
- If their answer is on the right track, push them to be more specific about which Copilot feature or why`;

  const user = `Topic: "${topicId}" (${SKILL_LABELS[skill] ?? `Skill ${skill}`})
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

    console.log(`[ab730-task-instruction] mode=${mode ?? 'generate'}, topic=${body.topicId}`);

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
    console.error('[ab730-task-instruction] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
