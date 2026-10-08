/**
 * api/score-anchor.ts
 *
 * Scores completed anchor-task attempts on the four-score rubric
 * (cognitive, critical thinking, problem solving, creativity; 0-100 with
 * evidence) and stores the result in anchor_scores. Learners never see or
 * trigger this: it runs on a schedule (vercel.json) or by hand with the cron
 * secret.
 *
 * What gets scored:
 *   - every completed attempt's own transcript          (subject = 'attempt')
 *   - for a revisit, the learner's original first session (subject = 'original')
 *
 * Each transcript is scored in its own request with the same prompt and no
 * mention of kind, date or the existence of another transcript, so the scorer
 * cannot tell an original from a redo (see api/_lib/anchorScoring.js).
 *
 * Idempotent: a transcript that already has a score row is skipped. A
 * transcript with too little learner input gets an empty row (all scores null,
 * reason in evidence) so it is not retried forever.
 *
 * Auth: "Authorization: Bearer $CRON_SECRET" (Vercel cron) or
 *       "x-cron-secret: $CRON_SECRET" (manual).
 * Query: ?limit=N   transcripts to score this run (default 10, max 25)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logApiCost } from "../lib/api-cost-logger.js";
import {
  SCORE_KEYS,
  SYSTEM_PROMPT,
  buildScoringPrompt,
  buildTranscriptText,
  hasEnoughContent,
  parseScores,
  parseTranscript,
} from "./_lib/anchorScoring.js";

const MODEL = "claude-sonnet-5-5";
const TIME_BUDGET_MS = 240_000; // inside Vercel's 5 minute limit

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Subject = "attempt" | "original";

interface AttemptRow {
  id: string;
  user_id: string;
  kind: "checkpoint" | "revisit";
  transcript: unknown;
  original_transcript: unknown;
}

async function callModel(userPrompt: string, userId: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    // Sonnet 5.5 rejects a non-default temperature, so none is sent.
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${response.status}: ${JSON.stringify(err.error ?? err)}`);
  }

  const data = await response.json();
  logApiCost({ source: "anchor_scoring", model: MODEL, action: "score", usage: data.usage, user_id: userId });
  return data.content[0].text;
}

async function saveRow(
  attemptId: string,
  subject: Subject,
  scores: Record<string, number | null>,
  evidence: Record<string, unknown>
) {
  const { error } = await supabase.from("anchor_scores").upsert(
    {
      attempt_id: attemptId,
      subject,
      cognitive_score: scores.cognitive,
      critical_thinking_score: scores.critical_thinking,
      problem_solving_score: scores.problem_solving,
      creativity_score: scores.creativity,
      evidence,
      scorer_model: MODEL,
      scored_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,subject" }
  );
  if (error) throw new Error(`Saving score failed: ${error.message}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = !!cronSecret && req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManual = !!cronSecret && req.headers["x-cron-secret"] === cronSecret;
  if (!isVercelCron && !isManual) return res.status(401).json({ error: "Unauthorized" });

  const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));
  const started = Date.now();

  const { data: attempts, error: attemptsErr } = await supabase
    .from("anchor_attempts")
    .select("id, user_id, kind, transcript, original_transcript")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: true })
    .limit(500);
  if (attemptsErr) return res.status(500).json({ error: attemptsErr.message });

  const { data: done, error: doneErr } = await supabase
    .from("anchor_scores")
    .select("attempt_id, subject")
    .limit(5000);
  if (doneErr) return res.status(500).json({ error: doneErr.message });

  const scored = new Set((done ?? []).map((d) => `${d.attempt_id}:${d.subject}`));
  const jobs: { attempt: AttemptRow; subject: Subject }[] = [];
  for (const a of (attempts ?? []) as AttemptRow[]) {
    const subjects: Subject[] = a.kind === "revisit" ? ["attempt", "original"] : ["attempt"];
    for (const subject of subjects) {
      if (!scored.has(`${a.id}:${subject}`)) jobs.push({ attempt: a, subject });
    }
  }

  let scoredCount = 0;
  let insufficient = 0;
  const errors: string[] = [];

  for (const { attempt, subject } of jobs.slice(0, limit)) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const messages = parseTranscript(subject === "attempt" ? attempt.transcript : attempt.original_transcript);

      if (!hasEnoughContent(messages)) {
        const empty: Record<string, number | null> = Object.fromEntries(
          (SCORE_KEYS as string[]).map((k) => [k, null])
        );
        await saveRow(attempt.id, subject, empty, {
          reason: "insufficient_transcript",
          learner_messages: messages.filter((m) => m.role === "user").length,
        });
        insufficient++;
        continue;
      }

      const reply = await callModel(buildScoringPrompt(buildTranscriptText(messages)), attempt.user_id);
      const { scores, evidence } = parseScores(reply) as {
        scores: Record<string, number | null>;
        evidence: Record<string, string[]>;
      };
      await saveRow(attempt.id, subject, scores, evidence);
      scoredCount++;
    } catch (err) {
      errors.push(`${attempt.id}:${subject} ${(err as Error).message}`);
    }
  }

  return res.status(200).json({
    scored: scoredCount,
    insufficient_transcript: insufficient,
    errors,
    remaining: Math.max(0, jobs.length - Math.min(jobs.length, limit)),
  });
}
