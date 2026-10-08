// api/_lib/anchorScoring.js
//
// Scoring of anchor-task transcripts on the platform's four-score rubric
// (cognitive, critical thinking, problem solving, creativity; 0-100 each, with
// evidence). Pure functions only; the route (api/score-anchor.ts) does the I/O.
//
// Blind by construction: every transcript is scored in its own request, with
// the same prompt, and nothing in the prompt says what kind of attempt it is,
// when it happened, or that another transcript exists. A revisit's original
// and new transcripts therefore cannot be told apart by the scorer.

export const SCORE_KEYS = ['cognitive', 'critical_thinking', 'problem_solving', 'creativity'];

const MAX_CHARS = { user: 1500, assistant: 400 };
const MAX_TOTAL_CHARS = 24000;
const MAX_EVIDENCE_ITEMS = 3;
const MAX_EVIDENCE_CHARS = 300;

export const SYSTEM_PROMPT = `You are an expert educational assessment analyst for an AI learning lab in Oloibiri, Nigeria, a rural community with a new solar mini-grid. Learners are aged 12 to 24 and are developing AI and digital skills, often for the first time.

You will read one conversation between a learner and an AI facilitator during a prompt-writing activity. Score only what the learner's own messages show. Score the thinking, not the polish: learners may write in Nigerian English or Pidgin, and spelling and grammar must not lower a score. Do not reward length for its own sake.

Score four dimensions from 0 to 100:
- cognitive: understanding of the task and the ideas in it, and applying them accurately (for example, knowing what makes a request to an AI clear, specific and useful).
- critical_thinking: judging the AI's answers, noticing what is missing, vague or wrong, and deciding what to change and why.
- problem_solving: breaking the task into steps, improving an attempt over several tries, and adapting when something does not work.
- creativity: ideas of the learner's own, local and personal detail, and different approaches rather than copying the example.

Use the whole range. About 10 means almost no evidence of the skill, 30 means beginning, 50 means developing, 70 means strong, and 90 or above means exceptional for the learner's age. If a dimension has no evidence at all in the conversation, give it null instead of a number.

For each dimension give up to three short pieces of evidence taken from the learner's messages.

Return a single JSON object and nothing else, with exactly these fields:
{
  "cognitive_score": <0-100 or null>, "cognitive_evidence": ["..."],
  "critical_thinking_score": <0-100 or null>, "critical_thinking_evidence": ["..."],
  "problem_solving_score": <0-100 or null>, "problem_solving_evidence": ["..."],
  "creativity_score": <0-100 or null>, "creativity_evidence": ["..."]
}`;

/** Accepts an array or a JSON string; returns [{role, content}] with text content only. */
export function parseTranscript(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((m) => m && typeof m === 'object' && typeof m.content === 'string' && m.content.trim() !== '')
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content.trim() }));
}

/** Enough learner input to score: at least `min` learner messages. */
export function hasEnoughContent(messages, min = 2) {
  return messages.filter((m) => m.role === 'user').length >= min;
}

/** Plain dialogue text: learner turns in full, facilitator turns shortened. No timestamps or metadata. */
export function buildTranscriptText(messages) {
  const parts = [];
  let total = 0;
  for (const m of messages) {
    const label = m.role === 'user' ? 'LEARNER' : 'FACILITATOR';
    const text = m.content.slice(0, MAX_CHARS[m.role]);
    const line = `[${label}]: ${text}`;
    if (total + line.length > MAX_TOTAL_CHARS) {
      parts.push('[conversation continues]');
      break;
    }
    parts.push(line);
    total += line.length;
  }
  return parts.join('\n');
}

export function buildScoringPrompt(transcriptText) {
  return `Here is the conversation.\n\n${transcriptText}\n\nReturn the JSON object now.`;
}

function toScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

function toEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === 'string' && v.trim() !== '')
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map((v) => v.trim().slice(0, MAX_EVIDENCE_CHARS));
}

/**
 * Parse the model's reply. Tolerates code fences and surrounding text; clamps
 * scores to 0-100; throws if there is no JSON object at all.
 */
export function parseScores(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model reply');
  const obj = JSON.parse(text.slice(start, end + 1));
  const scores = {};
  const evidence = {};
  for (const key of SCORE_KEYS) {
    scores[key] = toScore(obj[`${key}_score`]);
    evidence[key] = toEvidence(obj[`${key}_evidence`]);
  }
  return { scores, evidence };
}
