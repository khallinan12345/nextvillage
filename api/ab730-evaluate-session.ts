// api/ab730-evaluate-session.ts
// Generates an end-of-session exam readiness report for AB-730.
// Called once when the learner clicks "Get Exam Readiness Report".
//
// AB-730 is organised around 3 skills rather than domains:
//   Skill 1: Generative AI Fundamentals     (~30%)
//   Skill 2: Manage Prompts & Conversations (~35%)
//   Skill 3: Draft & Analyse Business Content (~35%)

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
    console.error('[ab730-evaluate-session] Anthropic error:', res.status, err);
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  logCost('evaluate', data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
  return data.content?.[0]?.text ?? '';
}

// ── Topic label map ───────────────────────────────────────────────────────────

const TOPIC_LABELS: Record<string, string> = {
  // Skill 1 — Generative AI Fundamentals
  genai_how_works:   'How Generative AI Works',
  copilot_overview:  'Microsoft 365 Copilot Overview',
  responsible_ai:    'Responsible AI & Data Privacy',
  grounding_context: 'Grounding & Context in Copilot',
  // Skill 2 — Manage Prompts & Conversations
  prompt_principles: 'Prompt Engineering Principles',
  prompt_techniques: 'Advanced Prompt Techniques',
  agents_copilot:    'Copilot Agents & Automation',
  managing_convos:   'Managing Conversations & Output',
  // Skill 3 — Draft & Analyse Business Content
  copilot_word:      'Copilot in Word & Documents',
  copilot_excel:     'Copilot in Excel & Data',
  copilot_ppt:       'Copilot in PowerPoint',
  copilot_outlook:   'Copilot in Outlook & Email',
  copilot_teams:     'Copilot in Teams & Meetings',
  evaluating_output: 'Evaluating & Refining AI Output',
  practice_exam:     'Practice Exam Simulation',
};

const SKILL_FOR_TOPIC: Record<string, string> = {
  genai_how_works:   'Skill 1: Generative AI Fundamentals (~30%)',
  copilot_overview:  'Skill 1: Generative AI Fundamentals (~30%)',
  responsible_ai:    'Skill 1: Generative AI Fundamentals (~30%)',
  grounding_context: 'Skill 1: Generative AI Fundamentals (~30%)',
  prompt_principles: 'Skill 2: Manage Prompts & Conversations (~35%)',
  prompt_techniques: 'Skill 2: Manage Prompts & Conversations (~35%)',
  agents_copilot:    'Skill 2: Manage Prompts & Conversations (~35%)',
  managing_convos:   'Skill 2: Manage Prompts & Conversations (~35%)',
  copilot_word:      'Skill 3: Draft & Analyse Business Content (~35%)',
  copilot_excel:     'Skill 3: Draft & Analyse Business Content (~35%)',
  copilot_ppt:       'Skill 3: Draft & Analyse Business Content (~35%)',
  copilot_outlook:   'Skill 3: Draft & Analyse Business Content (~35%)',
  copilot_teams:     'Skill 3: Draft & Analyse Business Content (~35%)',
  evaluating_output: 'Skill 3: Draft & Analyse Business Content (~35%)',
  practice_exam:     'Practice Exam',
};

// ── Main evaluation function ─────────────────────────────────────────────────

async function evaluateSession(answerHistory: any[], topicsCompleted: string[]): Promise<object> {
  const system = `You are an AB-730 (Microsoft Certified: AI Business Professional) exam readiness evaluator. You will receive a learner's complete session answers and produce an honest, actionable readiness report.

The AB-730 exam tests practical business use of Microsoft 365 Copilot — scenario-based questions about choosing the right feature, writing effective prompts, and applying Responsible AI principles in workplace contexts. No coding is required.

Score each topic on a 0–3 scale:
  0 = no meaningful attempt or completely off-topic
  1 = partial understanding — knows something about Copilot but misidentifies features or lacks business reasoning
  2 = solid understanding — correctly identifies Copilot features and gives reasonable business justification
  3 = strong, exam-ready — accurately describes the feature, explains the business why, and would choose correctly in an exam scenario

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "overall_score_average": <number to 1 decimal place>,
  "exam_readiness": "<2–3 sentence overall assessment — is this learner ready to sit AB-730? What is the single most important area to strengthen before booking the exam?>",
  "strengths_summary": "<2–3 sentences on what the learner demonstrated well — be specific about which Copilot skills or concepts they understood>",
  "highest_leverage_improvements": "<3–5 specific topics or Copilot features to study before the exam, each with one sentence explaining the gap and why it matters for the exam>",
  "detailed_scores": {
    "<topicId>": {
      "score": <0-3>,
      "justification": "<1 sentence: what the learner got right or wrong — be specific about the Copilot concept>"
    }
  }
}

Be honest — a learner who scores 1.5 should not be told they are ready. Focus feedback on practical Copilot skills and business reasoning, not abstract AI theory.`;

  const answersBlock = answerHistory.length > 0
    ? answerHistory.map((e: any) => {
        const topicLabel = TOPIC_LABELS[e.topicId] ?? e.topicId;
        const skillLabel = SKILL_FOR_TOPIC[e.topicId] ?? '';
        return `Topic: ${topicLabel} (${skillLabel})\nQuestion: ${e.subTaskQuestion ?? '—'}\nAnswer: ${e.userAnswer}`;
      }).join('\n\n---\n\n')
    : 'No answers recorded in this session.';

  const completedBlock = topicsCompleted.length > 0
    ? `Topics completed: ${topicsCompleted.map(id => TOPIC_LABELS[id] ?? id).join(', ')}`
    : 'No topics completed.';

  const user = `AB-730 Session Evaluation\n\n${completedBlock}\n\nLearner answers:\n\n${answersBlock}`;

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

    console.log(`[ab730-evaluate-session] answers=${answerHistory.length}, topics=${topicsCompleted.length}`);

    const result = await evaluateSession(answerHistory, topicsCompleted);
    return res.status(200).json(result);

  } catch (err: any) {
    console.error('[ab730-evaluate-session] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
