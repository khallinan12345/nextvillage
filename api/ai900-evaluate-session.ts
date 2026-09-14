// api/ai900-evaluate-session.ts
// Generates an end-of-session exam readiness report for AI-900.
// Called once when the learner clicks "Get Exam Readiness Report".

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
      page:               'AI900Page',
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

async function callClaude(system: string, user: string, maxTokens = 1800): Promise<string> {
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
    console.error('[ai900-evaluate-session] Anthropic error:', res.status, err);
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  logCost('evaluate', data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
  return data.content?.[0]?.text ?? '';
}

// ── Domain label map ─────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  // Domain 1
  ai_workloads:     'AI Workload Types',
  responsible_ai:   'Responsible AI Principles',
  // Domain 2
  ml_types:         'Machine Learning Techniques',
  ml_concepts:      'Core ML Concepts',
  azure_ml:         'Azure ML Services',
  // Domain 3
  cv_solutions:     'Computer Vision Types',
  azure_cv:         'Azure Vision Services',
  // Domain 4
  nlp_workloads:    'NLP Workload Types',
  azure_nlp:        'Azure NLP Services',
  // Domain 5
  genai_concepts:   'Generative AI Concepts',
  prompt_engineering: 'Prompt Engineering',
  azure_genai:      'Azure Generative AI Services',
  practice_exam:    'Practice Exam Simulation',
};

// ── Main evaluation function ─────────────────────────────────────────────────

async function evaluateSession(answerHistory: any[], topicsCompleted: string[]): Promise<object> {
  const system = `You are an AI-900 exam readiness evaluator. You will receive a learner's complete session answers and produce an honest, actionable readiness report.

Score each topic on a 0–3 scale:
  0 = no meaningful attempt
  1 = partial understanding, key gaps
  2 = solid understanding, minor gaps
  3 = strong, exam-ready understanding

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "overall_score_average": <number to 1 decimal place>,
  "exam_readiness": "<2–3 sentence overall assessment — is this learner ready to sit the AI-900? What is the single most important thing to do before booking the exam?>",
  "strengths_summary": "<2–3 sentences on what the learner demonstrated well across the session>",
  "highest_leverage_improvements": "<3–5 specific topics or concepts to study before the exam, with one sentence each explaining why>",
  "detailed_scores": {
    "<topicId>": {
      "score": <0-3>,
      "justification": "<1 sentence: what the learner got right or wrong in this topic>"
    }
  }
}

Be honest — a learner who scores 1.5 overall should not be told they are ready. Be encouraging but truthful.`;

  const answersBlock = answerHistory.length > 0
    ? answerHistory.map((e: any) =>
        `Topic: ${DOMAIN_LABELS[e.topicId] ?? e.topicId}\nQuestion: ${e.subTaskQuestion ?? '—'}\nAnswer: ${e.userAnswer}`
      ).join('\n\n---\n\n')
    : 'No answers recorded in this session.';

  const completedBlock = topicsCompleted.length > 0
    ? `Topics completed: ${topicsCompleted.map(id => DOMAIN_LABELS[id] ?? id).join(', ')}`
    : 'No topics completed.';

  const user = `AI-900 Session Evaluation\n\n${completedBlock}\n\nLearner answers:\n\n${answersBlock}`;

  const raw  = await callClaude(system, user, 1800);
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
    const { answerHistory = [], topicsCompleted = [] } = req.body ?? {};

    console.log(`[ai900-evaluate-session] answers=${answerHistory.length}, topics=${topicsCompleted.length}`);

    const result = await evaluateSession(answerHistory, topicsCompleted);
    return res.status(200).json(result);

  } catch (err: any) {
    console.error('[ai900-evaluate-session] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
