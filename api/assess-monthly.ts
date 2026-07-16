function sanitize(t: string): string {
  if (!t) return "";
  let o = "";
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      const n = t.charCodeAt(i + 1);
      if (n >= 0xDC00 && n <= 0xDFFF) { o += t[i] + t[i+1]; i++; }
    } else if (c >= 0xDC00 && c <= 0xDFFF) {
      // lone low surrogate — drop
    } else { o += t[i]; }
  }
  return o;
}

/**
 * MONTHLY SKILLS ASSESSMENT v2.0 — Vercel Cron Handler
 *
 * Runs on the 1st of every month at 02:00 UTC (via vercel.json cron).
 * Assesses the PREVIOUS month's activity for all African users.
 *
 * Captures:
 *   • 5 core skill dimensions (cognitive, CT, PS, creativity, PUE score)
 *   • Site access count (sessions + engaged sessions)
 *   • PUE linkage — 7 domain metrics + learner-vs-AI source split
 *   • Scaffolding convergence — clarification, decomposition, correction trends
 *   • Reasoning level distribution (Levels 0–3)
 *   • Metacognitive markers (verification, reactive, strategic)
 *   • Role readiness & peer diffusion signals
 *   • Enterprise planning artifact rubric (6 dimensions, 0–18)
 *   • Narrative summaries for PUE, scaffolding, metacognition, role readiness
 *
 * Sends a rich longitudinal email report to khallinan1@udayton.edu.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
 *   RESEND_API_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logApiCost } from "../lib/api-cost-logger.js";

// ─── Excluded Users (admins / facilitators — never assessed or reported) ─────
// All Kevin Hallinan and Bennywhite Davidson accounts — never assessed or shown in reports
const EXCLUDED_USER_IDS = new Set([
  "0e738663-a70e-4fd3-9ba6-718c02e116c2", // Kevin Hallinan (kevin.hallinan@udayton.edu)
  "8b3f70dc-e5d0-4eb0-af7d-ec6181968213", // Kevin Hallinan (khallinan1@udayton.edu)
  "5d5e0486-e768-4c5d-ba63-d1e4570a352d", // Kevin Hallinan (kevin.hallinan.ud@gmail.com)
  "40e9daa6-7ec1-49a9-9be7-814a3d607d86", // Bennywhite Davidson (benny090davidson@gmail.com)
  "73da14c1-e49a-4410-9390-6fe069fd7528", // Bennywhite Davidson (benny090davidson — duplicate)
  "f6157a9d-5ffd-4058-b0b3-af3ea897d876", // Bennywhite Davidson (bennywhite090d@gmail.com)
]);

// ─── Clients ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Anthropic Helpers ────────────────────────────────────────────────────────
//
// Three helpers implement all four cost optimisations:
//
//  1. callClaude        — Sonnet 4.6 + prompt caching (cache_control on system
//                         prompt). Saves ~90% on repeated input tokens across
//                         learners who share the same static schema block.
//
//  2. callClaudeHaiku   — Haiku 4.5 for cheap structured tasks (cert summary,
//                         playground summary). 3x cheaper than Sonnet.
//
//  3. Batch API path    — submitBatchRequests / pollBatchResults implement the
//                         Anthropic Batch API (50% off all tokens). Used by
//                         MODE 1 orchestrate to submit all learners at once
//                         then MODE 3 report polls for results.
//                         Falls back to callClaude if batch is unavailable.

// Sonnet + prompt caching — main assessment call
async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4000,
  timeoutMs = 240_000,  // 4 min — leaves 1 min buffer inside Vercel's 5 min limit
  userId?: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      temperature: 0.2,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  clearTimeout(timer);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Anthropic API Error: ${JSON.stringify(err.error)}`);
  }

  const data = await response.json();

  // Log cost — tagged as monthly_assessment so it's never "unknown" in the dashboard
  logApiCost({
    source:  "monthly_assessment",
    model:   "claude-sonnet-4-6",
    action:  "assess",
    usage:   data.usage,
    user_id: userId ?? null,
  });

  return data.content[0].text;
}

// Haiku — cheap helper for short structured tasks
async function callClaudeHaiku(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 400,
  userId?: string,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Anthropic Haiku API Error: ${JSON.stringify(err.error)}`);
  }

  const data = await response.json();

  // Log cost — tagged as monthly_assessment
  logApiCost({
    source:  "monthly_assessment",
    model:   "claude-haiku-4-5-20251001",
    action:  "assess_haiku",
    usage:   data.usage,
    user_id: userId ?? null,
  });

  return data.content[0].text;
}

// ── Batch API helpers (Optimisation 3: 50% off all tokens) ───────────────────

interface BatchRequest {
  custom_id: string;   // userId
  params: {
    model: string;
    max_tokens: number;
    temperature: number;
    system: object[];
    messages: object[];
  };
}

// Submit a batch of assessment requests. Returns the Anthropic batch ID.
async function submitBatchRequests(requests: BatchRequest[]): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "message-batches-2024-09-24,prompt-caching-2024-07-31",
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Batch submit error: ${JSON.stringify(err.error)}`);
  }

  const data = await response.json();
  console.log(`   Batch submitted: ${data.id} (${requests.length} requests)`);
  return data.id;
}

// Poll until batch completes (up to maxWaitMs). Returns results map: userId → text.
async function pollBatchResults(
  batchId: string,
  maxWaitMs = 300_000  // 5 minutes max — monthly cron has plenty of time
): Promise<Map<string, string>> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 10_000)); // poll every 10s

    const statusRes = await fetch(
      `https://api.anthropic.com/v1/messages/batches/${batchId}`,
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "message-batches-2024-09-24",
        },
      }
    );

    const status = await statusRes.json();
    console.log(`   Batch ${batchId}: ${status.processing_status} (${status.request_counts?.succeeded || 0}/${status.request_counts?.processing || 0} done)`);

    if (status.processing_status === "ended") {
      // Fetch results JSONL
      const resultsRes = await fetch(status.results_url, {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "message-batches-2024-09-24",
        },
      });

      const text = await resultsRes.text();
      const results = new Map<string, string>();
      for (const line of text.trim().split("\n")) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (r.result?.type === "succeeded") {
            results.set(r.custom_id, r.result.message.content[0].text);
          } else {
            console.warn(`   Batch result failed for ${r.custom_id}:`, r.result?.error);
          }
        } catch { /* skip malformed line */ }
      }
      return results;
    }
  }
  throw new Error(`Batch ${batchId} did not complete within ${maxWaitMs / 1000}s`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlySkillsResult {
  cognitive_score: number;
  cognitive_evidence: string[];
  critical_thinking_score: number;
  critical_thinking_evidence: string[];
  problem_solving_score: number;
  problem_solving_evidence: string[];
  creativity_score: number;
  creativity_evidence: string[];
  pue_score: number;
  pue_evidence: string[];

  pue_energy_constraint_pct: number;
  pue_market_pricing_pct: number;
  pue_battery_load_pct: number;
  pue_enterprise_planning_pct: number;
  pue_learner_initiated_pct: number;
  pue_ai_introduced_pct: number;
  pue_multi_domain_pct: number;
  pue_local_context_pct: number;
  pue_summary: string;
  pue_evidence_quotes: string[];

  scaffold_clarification_per_session: number;
  scaffold_decomposition_per_session: number;
  scaffold_correction_total_per_session: number;
  scaffold_explicit_correction_per_session: number;
  scaffold_gentle_redirect_per_session: number;
  scaffold_consecutive_correction_runs: number;
  scaffold_convergence_trend: "converging" | "stable" | "diverging" | "insufficient_data";
  scaffold_convergence_narrative: string;

  reasoning_definitional_pct: number;
  reasoning_responsive_pct: number;
  reasoning_elaborative_pct: number;
  reasoning_structured_pct: number;
  reasoning_chain_count: number;

  metacog_verification_rate: number;
  metacog_reactive_rate: number;
  metacog_strategic_rate: number;
  metacog_narrative: string;

  role_teaching_intent_count: number;
  role_community_application_count: number;
  role_enterprise_orientation_count: number;
  role_intergenerational_count: number;
  role_readiness_narrative: string;
  role_readiness_signals: string[];

  enterprise_artifact_score: number;
  enterprise_artifact_goal_score: number;
  enterprise_artifact_resource_score: number;
  enterprise_artifact_plan_score: number;
  enterprise_artifact_constraint_score: number;
  enterprise_artifact_quant_score: number;
  enterprise_artifact_risk_score: number;
  enterprise_artifact_evidence: string[];

  // AI Playground
  ai_playground_session_count: number;
  ai_playground_word_count: number;
  ai_playground_summary: string;

  // AI Proficiency — GPT-inferred from transcripts (0–100)
  ai_prof_application_gpt: number;
  ai_prof_ethics_gpt: number;
  ai_prof_understanding_gpt: number;
  ai_prof_verification_gpt: number;
  ai_prof_gpt_narrative: string;

  // AI Proficiency — formal cert scores (from dashboard, filled post-GPT)
  ai_prof_application_score: number | null;
  ai_prof_ethics_score: number | null;
  ai_prof_understanding_score: number | null;
  ai_prof_verification_score: number | null;
  ai_prof_cert_level: string;

  // Certification summary
  cert_attempted_count: number;
  cert_passed_count: number;
  cert_names_attempted: string[];
  cert_names_passed: string[];
  cert_avg_score: number | null;
  cert_summary: string;
}

interface AssessmentSummary {
  userId: string;
  name: string;
  sessionCount: number;
  engagedSessionCount: number;
  scores: MonthlySkillsResult | null;
  status: "success" | "skipped" | "no_activity" | "error";
  error?: string;
}

interface PlaygroundSummary {
  sessionCount: number;
  totalWords: number;
  pueSessionCount: number;       // sessions containing PUE / energy / enterprise language
  entrepreneurshipCount: number; // sessions focused on business / enterprise building
  topTopics: string[];           // 3–5 dominant themes the learner explored
  pueHighlights: string[];       // up to 3 direct learner quotes showing PUE/entrepreneurship thinking
  narrative: string;             // 3–4 sentence synthesis
  hasMeaningfulActivity: boolean;
}

interface HistoricalRecord {
  user_id: string;
  measured_at: string;
  cognitive_score: number;
  critical_thinking_score: number;
  problem_solving_score: number;
  creativity_score: number;
  pue_score: number;
  pue_energy_constraint_pct: number | null;
  pue_market_pricing_pct: number | null;
  pue_learner_initiated_pct: number | null;
  pue_summary: string | null;
  scaffold_convergence_trend: string | null;
  reasoning_structured_pct: number | null;
  metacog_verification_rate: number | null;
  role_teaching_intent_count: number | null;
  role_enterprise_orientation_count: number | null;
  enterprise_artifact_score: number | null;
  session_count: number | null;
  // AI Proficiency
  ai_prof_application_score: number | null;
  ai_prof_ethics_score: number | null;
  ai_prof_understanding_score: number | null;
  ai_prof_verification_score: number | null;
  ai_prof_cert_level: string | null;
  ai_prof_application_gpt: number | null;
  ai_prof_ethics_gpt: number | null;
  ai_prof_understanding_gpt: number | null;
  ai_prof_verification_gpt: number | null;
  // Certifications
  cert_attempted_count: number | null;
  cert_passed_count: number | null;
  cert_names_passed: string[] | null;
  cert_avg_score: number | null;
}

// ─── Assessment Prompt ────────────────────────────────────────────────────────

function buildAssessmentPrompt(transcript: string, sessionCount: number, playgroundTranscript: string, playgroundSessionCount: number): string {
  return `You are an expert educational assessment analyst with deep knowledge of the Oloibiri, Nigeria AI learning lab — a rural community with a new solar mini-grid where young learners (ages 12–24) are developing AI and digital skills for the first time. The central research framework tests whether AI-facilitated capability formation can prime Productive Use of Energy (PUE) demand ahead of infrastructure expansion.

Analyze these ${sessionCount} structured curriculum sessions${playgroundSessionCount > 0 ? ` AND ${playgroundSessionCount} AI Playground sessions` : ""}. Return a SINGLE valid JSON object with NO markdown, NO preamble.

Your scores should reflect the WHOLE learner — both structured curriculum activity and any free-form Playground use. Playground conversations reveal self-directed interests, PUE reasoning, and enterprise thinking that may not surface in the curriculum.

STRUCTURED CURRICULUM CONVERSATIONS:
${transcript}
${playgroundTranscript ? `
AI PLAYGROUND CONVERSATIONS (free-form, unconstrained — no curriculum scaffolding):
Note: scaffolding convergence metrics apply to curriculum sessions only. Playground sessions show purely learner-initiated behaviour.
${playgroundTranscript}
` : ""}
Return JSON with EXACTLY these fields. Use 0 for any metric where evidence is insufficient.

{
  "cognitive_score": <0-100>,
  "cognitive_evidence": ["<specific observation>"],
  "critical_thinking_score": <0-100>,
  "critical_thinking_evidence": ["..."],
  "problem_solving_score": <0-100>,
  "problem_solving_evidence": ["..."],
  "creativity_score": <0-100>,
  "creativity_evidence": ["..."],
  "pue_score": <0-100, overall productive use of energy capability>,
  "pue_evidence": ["..."],

  "pue_energy_constraint_pct": <0-100, % of sessions where solar/battery/kVA/electricity/power was discussed>,
  "pue_market_pricing_pct": <0-100, % of sessions involving naira/cost/profit/selling/customers/business>,
  "pue_battery_load_pct": <0-100, % of sessions involving load management/energy-efficient appliances/solar charging>,
  "pue_enterprise_planning_pct": <0-100, % of sessions with step-by-step business plans or 'I want to build/start' with energy context>,
  "pue_learner_initiated_pct": <0-100, % of sessions where LEARNER introduced PUE topics BEFORE AI did>,
  "pue_ai_introduced_pct": <0-100, % of sessions where AI scaffolded PUE scenarios first>,
  "pue_multi_domain_pct": <0-100, % of sessions where 3 or more PUE domains appeared simultaneously>,
  "pue_local_context_pct": <0-100, % of sessions with explicit local refs: village/Nigeria/community/Oloibiri/Bayelsa/naira>,
  "pue_summary": "<2-3 sentences: how broadly and deeply is this learner connecting AI skills to productive energy use? What domains dominate? What does the learner-vs-AI source split reveal?>",
  "pue_evidence_quotes": ["<direct quote from LEARNER showing PUE reasoning>"],

  "scaffold_clarification_per_session": <mean AI clarification prompts per session>,
  "scaffold_decomposition_per_session": <mean AI decomposition scaffolds per session: 'let's break this down', 'step by step'>,
  "scaffold_correction_total_per_session": <mean total corrections per session>,
  "scaffold_explicit_correction_per_session": <mean explicit corrections: 'not quite', 'that's incorrect'>,
  "scaffold_gentle_redirect_per_session": <mean gentle redirects: 'actually', 'remember that', 'have you considered'>,
  "scaffold_consecutive_correction_runs": <mean consecutive correction runs where learner revision was itself insufficient>,
  "scaffold_convergence_trend": <"converging" if AI scaffolding clearly decreased over sessions | "stable" | "diverging" | "insufficient_data">,
  "scaffold_convergence_narrative": "<2-3 sentences: Is AI doing less scaffolding over time? Are corrections shifting from explicit toward gentle? What does this suggest about internalization?>",

  "reasoning_definitional_pct": <0-100, % sessions dominated by 'What is X?' queries>,
  "reasoning_responsive_pct": <0-100, % sessions with short phrase answers to AI prompts>,
  "reasoning_elaborative_pct": <0-100, % sessions with extended single-point responses ≥30 words but no multi-step chains>,
  "reasoning_structured_pct": <0-100, % sessions with multi-step chains, numbered sequences, or arithmetic reasoning>,
  "reasoning_chain_count": <integer: total multi-step reasoning chains across all sessions>,

  "metacog_verification_rate": <per 1000 learner words: 'this means', 'therefore', 'if X then Y', 'let me check', 'which means'>,
  "metacog_reactive_rate": <per 1000 learner words: 'I don't understand', 'please explain again', 'I'm confused'>,
  "metacog_strategic_rate": <per 1000 learner words: 'maybe I should', 'the problem is', 'on the other hand', 'my plan is'>,
  "metacog_narrative": "<2-3 sentences: Is the learner moving from reactive toward active verification? Any self-monitoring or constraint-aware reasoning? What does the metacognitive profile suggest?>",

  "role_teaching_intent_count": <integer: utterances expressing plans to teach/guide/share skills>,
  "role_community_application_count": <integer: references to applying skills in/for community>,
  "role_enterprise_orientation_count": <integer: utterances linking skills to business/market/solar/farming with collective referent>,
  "role_intergenerational_count": <integer: references to teaching or helping parents/elders/adults>,
  "role_readiness_narrative": "<2-3 sentences: Is this learner showing capability externalization — helping others, teaching, connecting to community enterprise? Does evidence suggest movement from individual acquisition toward social diffusion?>",
  "role_readiness_signals": ["<specific quote or observed behavior>"],

  "enterprise_artifact_goal_score": <0=no goal | 1=vague aspiration | 2=named service/product | 3=specific with target market>,
  "enterprise_artifact_resource_score": <0=none | 1=generic mention | 2=named components (solar panels, inverter) | 3=quantified specs (kVA ratings)>,
  "enterprise_artifact_plan_score": <0=none | 1=single action | 2=ordered steps | 3=detailed multi-step with dependencies>,
  "enterprise_artifact_constraint_score": <0=none | 1=single constraint mentioned | 2=specific constraint with relevance | 3=trade-off reasoning or mitigation>,
  "enterprise_artifact_quant_score": <0=no numbers | 1=vague numbers | 2=calculations present | 3=multi-step analysis with derived conclusions>,
  "enterprise_artifact_risk_score": <0=none | 1=general awareness | 2=specific risks named | 3=mitigation strategies proposed>,
  "enterprise_artifact_score": <SUM of the 6 scores above, 0-18>,
  "enterprise_artifact_evidence": ["<specific planning artifact quote from learner>"],

  "ai_playground_session_count": <integer: number of Playground sessions in this period, 0 if none>,
  "ai_playground_word_count": <integer: total learner words across Playground sessions, 0 if none>,
  "ai_playground_summary": "<3-4 sentences specifically about AI Playground use: What topics did the learner choose to explore with unconstrained AI access? Is there evidence of self-directed PUE reasoning, enterprise planning, or community problem-solving that goes beyond the structured curriculum? How does the learner's free-form use compare to their curriculum interactions — more confident? More creative? Different domains? If no Playground activity, write 'No AI Playground activity recorded this period.'>",

  "ai_prof_application_gpt": <0-100, learner's demonstrated ability to apply AI tools to real problems — prompt crafting, using AI outputs to accomplish tasks, integrating AI into workflows>,
  "ai_prof_ethics_gpt": <0-100, learner's engagement with ethical dimensions of AI — fairness, privacy, impact on community, responsible use, awareness of harms>,
  "ai_prof_understanding_gpt": <0-100, learner's conceptual grasp of how AI works — what AI can and cannot do, model limitations, training data, AI vs human reasoning>,
  "ai_prof_verification_gpt": <0-100, learner's ability to verify AI outputs — fact-checking, identifying bias or hallucination, questioning AI responses, not accepting outputs uncritically>,
  "ai_prof_gpt_narrative": "<2-3 sentences: What does the transcript evidence say about this learner's overall AI proficiency — their practical application, ethical awareness, conceptual understanding, and critical verification? Which dimension is strongest and which needs most development?>"
}`;
}

// ─── AI Proficiency Cert Data ─────────────────────────────────────────────────

interface CertData {
  // Formal AI Proficiency scores from dashboard (0–3 scale, null = not attempted)
  ai_prof_application_score: number | null;
  ai_prof_ethics_score: number | null;
  ai_prof_understanding_score: number | null;
  ai_prof_verification_score: number | null;
  ai_prof_min_score: number | null;
  ai_prof_cert_level: string;
  // All-cert summary
  cert_attempted_count: number;
  cert_passed_count: number;
  cert_names_attempted: string[];
  cert_names_passed: string[];
  cert_avg_score: number | null;
}

async function fetchUserCertData(userId: string): Promise<CertData> {
  const empty: CertData = {
    ai_prof_application_score: null, ai_prof_ethics_score: null,
    ai_prof_understanding_score: null, ai_prof_verification_score: null,
    ai_prof_min_score: null, ai_prof_cert_level: "Not Attempted",
    cert_attempted_count: 0, cert_passed_count: 0,
    cert_names_attempted: [], cert_names_passed: [], cert_avg_score: null,
  };
  try {
    // Fetch all dashboard rows that have a certification score for this user
    const { data: certRows } = await supabase
      .from("dashboard")
      .select(`
        title, activity, progress, certification_evaluation_score,
        certification_ai_proficiency_application_of_ai_score,
        certification_ai_proficiency_ethics_responsibility_score,
        certification_ai_proficiency_understanding_ai_score,
        certification_ai_proficiency_verification_bias_score
      `)
      .eq("user_id", userId)
      .not("certification_evaluation_score", "is", null);

    if (!certRows?.length) return empty;

    // Gather all-cert summary
    const names: string[] = [];
    const passed: string[] = [];
    let scoreSum = 0;
    let scoreCount = 0;

    for (const row of certRows) {
      const title = row.title || row.activity || "Unknown";
      names.push(title);
      const score = Number(row.certification_evaluation_score);
      if (!isNaN(score)) { scoreSum += score; scoreCount++; }
      if (score >= 2.25) passed.push(title);
    }

    // Find the AI Proficiency cert row specifically
    const aiProfRow = certRows.find(
      (r) => (r.activity || "").toLowerCase().includes("ai proficiency") ||
              (r.title || "").toLowerCase().includes("ai proficiency")
    );

    let appScore: number | null = null;
    let ethScore: number | null = null;
    let undScore: number | null = null;
    let verScore: number | null = null;

    if (aiProfRow) {
      appScore = aiProfRow.certification_ai_proficiency_application_of_ai_score ?? null;
      ethScore = aiProfRow.certification_ai_proficiency_ethics_responsibility_score ?? null;
      undScore = aiProfRow.certification_ai_proficiency_understanding_ai_score ?? null;
      verScore = aiProfRow.certification_ai_proficiency_verification_bias_score ?? null;
    }

    const dimScores = [appScore, ethScore, undScore, verScore].filter((s): s is number => s !== null);
    const minScore = dimScores.length === 4 ? Math.min(...dimScores) : null;
    const certLevel = minScore === null ? "Not Attempted"
      : minScore === 3 ? "Advanced"
      : minScore >= 2 ? "Proficient"
      : minScore >= 1 ? "Emerging"
      : "Not Attempted";

    return {
      ai_prof_application_score: appScore,
      ai_prof_ethics_score: ethScore,
      ai_prof_understanding_score: undScore,
      ai_prof_verification_score: verScore,
      ai_prof_min_score: minScore,
      ai_prof_cert_level: certLevel,
      cert_attempted_count: names.length,
      cert_passed_count: passed.length,
      cert_names_attempted: [...new Set(names)],
      cert_names_passed: [...new Set(passed)],
      cert_avg_score: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null,
    };
  } catch (err: any) {
    console.warn(`   fetchUserCertData error: ${err.message}`);
    return empty;
  }
}

// ─── Core Assessment ──────────────────────────────────────────────────────────

async function assessMonthlySkills(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  result: MonthlySkillsResult | null;
  sessionCount: number;
  engagedSessionCount: number;
  status: AssessmentSummary["status"];
  error?: string;
}> {
  const { data: existing } = await supabase
    .from("user_monthly_assessments")
    .select("id")
    .eq("user_id", userId)
    .gte("measured_at", startDate.toISOString())
    .lte("measured_at", endDate.toISOString())
    .single();

  if (existing) return { result: null, sessionCount: 0, engagedSessionCount: 0, status: "skipped" };

  const { data: activities, error } = await supabase
    .from("dashboard")
    .select("chat_history, created_at")
    .eq("user_id", userId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: true });

  if (error || !activities?.length) {
    return { result: null, sessionCount: 0, engagedSessionCount: 0, status: "no_activity" };
  }

  const sessionCount = activities.length;

  type ChatMsg = { role: string; content: string };
  type ParsedSession = { messages: ChatMsg[] };

  const parsedSessions: ParsedSession[] = activities.map((a) => {
    try {
      const h = typeof a.chat_history === "string" ? JSON.parse(a.chat_history) : (a.chat_history || []);
      return { messages: Array.isArray(h) ? h : [] };
    } catch { return { messages: [] }; }
  });

  // Cap to most recent 30 sessions — a learner with 200 sessions doesn't need
  // all 200 analysed. Recent activity best reflects current capability level.
  const cappedSessions = parsedSessions.slice(-30);

  const engagedSessionCount = cappedSessions.filter(
    (s) => s.messages.filter((m) => m.role === "user").length >= 1
  ).length;

  if (engagedSessionCount === 0) {
    return { result: null, sessionCount, engagedSessionCount: 0, status: "no_activity" };
  }

  // PATCH 2026-05-07: budgets tightened — previous values (40k/20k) were
  // producing 150k+ token calls. New values target ~20k tokens per assessment.
  //
  // scaffoldTranscript — AI+user turns for scaffolding analysis only.
  // learnerTranscript  — learner turns only for all other metrics.

  const scaffoldTranscript = cappedSessions
    .map((s, i) => {
      const msgs = s.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => `[${m.role.toUpperCase()}]: ${(m.content || "").slice(0, 400)}`)
        .join("\n");
      return msgs ? `--- SESSION ${i + 1} ---\n${msgs}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  const learnerOnlyTranscript = cappedSessions
    .map((s, i) => {
      const msgs = s.messages
        .filter((m) => m.role === "user")
        .map((m) => `[LEARNER]: ${(m.content || "").slice(0, 400)}`)
        .join("\n");
      return msgs ? `--- SESSION ${i + 1} ---\n${msgs}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  if (!learnerOnlyTranscript.trim()) {
    return { result: null, sessionCount, engagedSessionCount: 0, status: "no_activity" };
  }

  // Tightened budgets — targets ~20k tokens per assessment (was 150k+)
  // 15k learner chars ≈ 3,750 tokens; 6k scaffold chars ≈ 1,500 tokens
  const LEARNER_BUDGET  = 15000;
  const SCAFFOLD_BUDGET = 6000;

  const truncatedLearner = learnerOnlyTranscript.length > LEARNER_BUDGET
    ? "[OLDER SESSIONS TRUNCATED — SHOWING MOST RECENT]\n\n" + learnerOnlyTranscript.slice(-LEARNER_BUDGET)
    : learnerOnlyTranscript;

  const truncatedScaffold = scaffoldTranscript.length > SCAFFOLD_BUDGET
    ? "[OLDER SESSIONS TRUNCATED — SHOWING MOST RECENT]\n\n" + scaffoldTranscript.slice(-SCAFFOLD_BUDGET)
    : scaffoldTranscript;

  // Combined transcript passed to Claude: learner-first, scaffold appended
  const truncated = `${truncatedLearner}\n\n=== FULL DIALOGUE (AI+LEARNER) FOR SCAFFOLDING ANALYSIS ONLY ===\n${truncatedScaffold}`;

  // Fetch AI Playground chats for this period (free-form, unconstrained access)
  type PlayMsg = { role: string; content: string };
  let playgroundTranscript = "";
  let playgroundSessionCount = 0;
  let playgroundWordCount = 0;

  try {
    const { data: pgRows } = await supabase
      .from("ai_playground_chats")
      .select("id, title, messages, updated_at")
      .eq("user_id", userId)
      .gte("updated_at", startDate.toISOString())
      .lte("updated_at", endDate.toISOString())
      .order("updated_at", { ascending: true });

    if (pgRows?.length) {
      playgroundSessionCount = pgRows.length;
      const pgSections: string[] = [];
      for (const row of pgRows) {
        const msgs: PlayMsg[] = Array.isArray(row.messages) ? row.messages : [];
        const userMsgs = msgs.filter((m) => m.role === "user");
        playgroundWordCount += userMsgs.reduce((acc, m) => acc + (m.content || "").split(/\s+/).length, 0);
        const section = msgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => `[${m.role.toUpperCase()}]: ${(m.content || "").slice(0, 800)}`)
          .join("\n");
        if (section) pgSections.push(`--- PLAYGROUND: ${(row.title || "Chat").slice(0, 60)} ---\n${section}`);
      }
      // Tightened from 10k to 4k — playground is supplementary context
      playgroundTranscript = pgSections.join("\n\n").slice(0, 4000);
      if (pgSections.join("\n\n").length > 4000) playgroundTranscript += "\n[PLAYGROUND TRANSCRIPT TRUNCATED]";
    }
  } catch (pgErr: any) {
    console.warn(`   Playground fetch skipped: ${pgErr.message}`);
  }

  try {
    // Sanitize the entire assembled prompt — bad chars can come from
    // any interpolated DB value (name, message content, playground title)
    const rawPrompt = buildAssessmentPrompt(truncated, engagedSessionCount, playgroundTranscript, playgroundSessionCount);
    // Strip lone surrogates inline — sanitize() is defined later in the file
    let safePrompt = "";
    for (let i = 0; i < rawPrompt.length; i++) {
      const code = rawPrompt.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF) {
        const next = rawPrompt.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) { safePrompt += rawPrompt[i] + rawPrompt[i + 1]; i++; }
      } else if (code >= 0xDC00 && code <= 0xDFFF) {
        // lone low surrogate — drop
      } else { safePrompt += rawPrompt[i]; }
    }
    const content = await callClaude(
      "Expert educational assessment analyst. Respond ONLY with valid JSON, no markdown.",
      safePrompt,
      4000,
      240_000,
      userId,
    );

    if (!content) throw new Error("Empty Claude response");

    const clean = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/,"").trim();
    const raw = JSON.parse(clean);
    const artifactScore =
      (raw.enterprise_artifact_goal_score || 0) +
      (raw.enterprise_artifact_resource_score || 0) +
      (raw.enterprise_artifact_plan_score || 0) +
      (raw.enterprise_artifact_constraint_score || 0) +
      (raw.enterprise_artifact_quant_score || 0) +
      (raw.enterprise_artifact_risk_score || 0);

    const result: MonthlySkillsResult = {
      ...raw,
      enterprise_artifact_score: artifactScore,
      // Prefer our directly-counted values over GPT estimates for accuracy
      ai_playground_session_count: playgroundSessionCount,
      ai_playground_word_count: playgroundWordCount,
      ai_playground_summary: raw.ai_playground_summary || "No AI Playground activity recorded this period.",
      // GPT AI Proficiency scores (defaults to 0 if GPT didn't return them)
      ai_prof_application_gpt: raw.ai_prof_application_gpt || 0,
      ai_prof_ethics_gpt: raw.ai_prof_ethics_gpt || 0,
      ai_prof_understanding_gpt: raw.ai_prof_understanding_gpt || 0,
      ai_prof_verification_gpt: raw.ai_prof_verification_gpt || 0,
      ai_prof_gpt_narrative: raw.ai_prof_gpt_narrative || "",
      // Formal cert scores — filled below from fetchUserCertData
      ai_prof_application_score: null,
      ai_prof_ethics_score: null,
      ai_prof_understanding_score: null,
      ai_prof_verification_score: null,
      ai_prof_cert_level: "Not Attempted",
      // Cert summary — filled in below from fetchUserCertData
      cert_attempted_count: 0,
      cert_passed_count: 0,
      cert_names_attempted: [],
      cert_names_passed: [],
      cert_avg_score: null,
      cert_summary: "",
    };

    // Fetch formal cert data (not time-bounded — shows all-time cert status)
    const certData = await fetchUserCertData(userId);

    // Generate cert narrative using GPT if there's cert activity
    let certSummary = "No certifications attempted yet.";
    if (certData.cert_attempted_count > 0) {
      try {
        // Optimisation 1: cert summary uses Haiku — 2 sentences from structured
        // data requires no reasoning depth; Haiku is 3x cheaper than Sonnet.
        certSummary = await callClaudeHaiku(
          "You write concise, encouraging educational progress summaries.",
          `Write a 2-sentence summary for a monthly report about a learner's certification activity at an AI learning lab in rural Nigeria.
Certifications attempted: ${certData.cert_names_attempted.join(", ")}
Certifications passed (score ≥ 2.25/3): ${certData.cert_names_passed.length > 0 ? certData.cert_names_passed.join(", ") : "None yet"}
Average cert score: ${certData.cert_avg_score ?? "N/A"}/3
AI Proficiency cert level: ${certData.ai_prof_cert_level}
AI Proficiency dimension scores (0-3): Application=${certData.ai_prof_application_score ?? "N/A"}, Ethics=${certData.ai_prof_ethics_score ?? "N/A"}, Understanding=${certData.ai_prof_understanding_score ?? "N/A"}, Verification=${certData.ai_prof_verification_score ?? "N/A"}
Be encouraging and specific. Note strongest and weakest dimensions if AI Proficiency scores exist.`,
          150,
          userId,
        );
      } catch { /* non-fatal */ }
    }

    result.cert_attempted_count = certData.cert_attempted_count;
    result.cert_passed_count = certData.cert_passed_count;
    result.cert_names_attempted = certData.cert_names_attempted;
    result.cert_names_passed = certData.cert_names_passed;
    result.cert_avg_score = certData.cert_avg_score;
    result.cert_summary = certSummary;
    result.ai_prof_application_score = certData.ai_prof_application_score;
    result.ai_prof_ethics_score = certData.ai_prof_ethics_score;
    result.ai_prof_understanding_score = certData.ai_prof_understanding_score;
    result.ai_prof_verification_score = certData.ai_prof_verification_score;
    result.ai_prof_cert_level = certData.ai_prof_cert_level;

    const { error: insertError } = await supabase
      .from("user_monthly_assessments")
      .insert({
        user_id: userId,
        measured_at: endDate.toISOString(),
        assessment_model: "claude-sonnet-4-6",
        assessment_version: "v2.0",
        cognitive_score: result.cognitive_score,
        cognitive_evidence: result.cognitive_evidence,
        critical_thinking_score: result.critical_thinking_score,
        critical_thinking_evidence: result.critical_thinking_evidence,
        problem_solving_score: result.problem_solving_score,
        problem_solving_evidence: result.problem_solving_evidence,
        creativity_score: result.creativity_score,
        creativity_evidence: result.creativity_evidence,
        pue_score: result.pue_score,
        session_count: sessionCount,
        engaged_session_count: engagedSessionCount,
        pue_energy_constraint_pct: result.pue_energy_constraint_pct,
        pue_market_pricing_pct: result.pue_market_pricing_pct,
        pue_battery_load_pct: result.pue_battery_load_pct,
        pue_enterprise_planning_pct: result.pue_enterprise_planning_pct,
        pue_learner_initiated_pct: result.pue_learner_initiated_pct,
        pue_ai_introduced_pct: result.pue_ai_introduced_pct,
        pue_multi_domain_pct: result.pue_multi_domain_pct,
        pue_local_context_pct: result.pue_local_context_pct,
        pue_summary: result.pue_summary,
        pue_evidence: result.pue_evidence_quotes,
        scaffold_clarification_per_session: result.scaffold_clarification_per_session,
        scaffold_decomposition_per_session: result.scaffold_decomposition_per_session,
        scaffold_correction_total_per_session: result.scaffold_correction_total_per_session,
        scaffold_explicit_correction_per_session: result.scaffold_explicit_correction_per_session,
        scaffold_gentle_redirect_per_session: result.scaffold_gentle_redirect_per_session,
        scaffold_consecutive_correction_runs: result.scaffold_consecutive_correction_runs,
        scaffold_convergence_trend: result.scaffold_convergence_trend,
        scaffold_convergence_narrative: result.scaffold_convergence_narrative,
        reasoning_definitional_pct: result.reasoning_definitional_pct,
        reasoning_responsive_pct: result.reasoning_responsive_pct,
        reasoning_elaborative_pct: result.reasoning_elaborative_pct,
        reasoning_structured_pct: result.reasoning_structured_pct,
        reasoning_chain_count: result.reasoning_chain_count,
        metacog_verification_rate: result.metacog_verification_rate,
        metacog_reactive_rate: result.metacog_reactive_rate,
        metacog_strategic_rate: result.metacog_strategic_rate,
        metacog_narrative: result.metacog_narrative,
        role_teaching_intent_count: result.role_teaching_intent_count,
        role_community_application_count: result.role_community_application_count,
        role_enterprise_orientation_count: result.role_enterprise_orientation_count,
        role_intergenerational_count: result.role_intergenerational_count,
        role_readiness_narrative: result.role_readiness_narrative,
        role_readiness_signals: result.role_readiness_signals,
        enterprise_artifact_score: result.enterprise_artifact_score,
        enterprise_artifact_goal_score: result.enterprise_artifact_goal_score,
        enterprise_artifact_resource_score: result.enterprise_artifact_resource_score,
        enterprise_artifact_plan_score: result.enterprise_artifact_plan_score,
        enterprise_artifact_constraint_score: result.enterprise_artifact_constraint_score,
        enterprise_artifact_quant_score: result.enterprise_artifact_quant_score,
        enterprise_artifact_risk_score: result.enterprise_artifact_risk_score,
        enterprise_artifact_evidence: result.enterprise_artifact_evidence,
        ai_playground_session_count: result.ai_playground_session_count,
        ai_playground_word_count: result.ai_playground_word_count,
        ai_playground_summary: result.ai_playground_summary,
        // AI Proficiency formal cert scores
        ai_prof_application_score: certData.ai_prof_application_score,
        ai_prof_ethics_score: certData.ai_prof_ethics_score,
        ai_prof_understanding_score: certData.ai_prof_understanding_score,
        ai_prof_verification_score: certData.ai_prof_verification_score,
        ai_prof_min_score: certData.ai_prof_min_score,
        ai_prof_cert_level: certData.ai_prof_cert_level,
        // AI Proficiency GPT scores
        ai_prof_application_gpt: result.ai_prof_application_gpt,
        ai_prof_ethics_gpt: result.ai_prof_ethics_gpt,
        ai_prof_understanding_gpt: result.ai_prof_understanding_gpt,
        ai_prof_verification_gpt: result.ai_prof_verification_gpt,
        ai_prof_gpt_narrative: result.ai_prof_gpt_narrative,
        // Certification summary
        cert_attempted_count: result.cert_attempted_count,
        cert_passed_count: result.cert_passed_count,
        cert_names_attempted: result.cert_names_attempted,
        cert_names_passed: result.cert_names_passed,
        cert_avg_score: result.cert_avg_score,
        cert_summary: result.cert_summary,
      });

    if (insertError) throw insertError;
    return { result, sessionCount, engagedSessionCount, status: "success" };
  } catch (err: any) {
    return { result: null, sessionCount, engagedSessionCount: 0, status: "error", error: err.message };
  }
}

// ─── Cohort History ──────────────────────────────────────────────────────────

interface CohortMonthRecord {
  monthLabel: string;
  measured_at: string;
  learnerCount: number;
  cognitive_score: number;
  critical_thinking_score: number;
  problem_solving_score: number;
  creativity_score: number;
  pue_score: number;
  pue_energy_constraint_pct: number;
  pue_market_pricing_pct: number;
  pue_learner_initiated_pct: number;
  reasoning_structured_pct: number;
  session_count: number;
  // AI Proficiency GPT averages (0–100)
  ai_prof_application_gpt: number;
  ai_prof_ethics_gpt: number;
  ai_prof_understanding_gpt: number;
  ai_prof_verification_gpt: number;
  // Certification averages
  cert_passed_pct: number; // total certs passed across cohort this month
}

async function fetchCohortHistory(excludeIds: Set<string>): Promise<CohortMonthRecord[]> {
  try {
    // Try full v2.0 column set first (requires alter_user_monthly_assessments.sql migration)
    const { data: allRows, error } = await supabase
      .from("user_monthly_assessments")
      .select(`
        user_id, measured_at,
        cognitive_score, critical_thinking_score,
        problem_solving_score, creativity_score, pue_score,
        pue_energy_constraint_pct, pue_market_pricing_pct,
        pue_learner_initiated_pct, reasoning_structured_pct,
        session_count,
        ai_prof_application_gpt, ai_prof_ethics_gpt,
        ai_prof_understanding_gpt, ai_prof_verification_gpt,
        cert_passed_count
      `)
      .order("measured_at", { ascending: true });

    // If the v2.0 columns don't exist yet, fall back to base columns only
    if (error) {
      console.warn("fetchCohortHistory: v2.0 columns not found, falling back to base columns:", error.message);
      return fetchCohortHistoryBase(excludeIds);
    }

    if (!allRows?.length) return [];

    // Group by calendar month, exclude facilitators
    const byMonth = new Map<string, typeof allRows>();
    for (const row of allRows) {
      if (excludeIds.has(row.user_id)) continue;
      const d = new Date(row.measured_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(row);
    }

    const records: CohortMonthRecord[] = [];
    for (const [key, rows] of byMonth.entries()) {
      const n = rows.length;
      const sum = (field: string) =>
        rows.reduce((acc, r) => acc + (Number((r as any)[field]) || 0), 0);
      const avg = (field: string) => Math.round(sum(field) / n);
      const certPassedCount = rows.filter((r) => (Number((r as any)["cert_passed_count"]) || 0) > 0).length;

      const d = new Date(key + "-01");
      records.push({
        monthLabel: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        measured_at: key,
        learnerCount: n,
        cognitive_score: avg("cognitive_score"),
        critical_thinking_score: avg("critical_thinking_score"),
        problem_solving_score: avg("problem_solving_score"),
        creativity_score: avg("creativity_score"),
        pue_score: avg("pue_score"),
        pue_energy_constraint_pct: avg("pue_energy_constraint_pct"),
        pue_market_pricing_pct: avg("pue_market_pricing_pct"),
        pue_learner_initiated_pct: avg("pue_learner_initiated_pct"),
        reasoning_structured_pct: avg("reasoning_structured_pct"),
        session_count: sum("session_count"),
        ai_prof_application_gpt: avg("ai_prof_application_gpt"),
        ai_prof_ethics_gpt: avg("ai_prof_ethics_gpt"),
        ai_prof_understanding_gpt: avg("ai_prof_understanding_gpt"),
        ai_prof_verification_gpt: avg("ai_prof_verification_gpt"),
        cert_passed_pct: rows.reduce((acc, r) => acc + (Number((r as any)["cert_passed_count"]) || 0), 0),
      });
    }

    return records.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  } catch (err: any) {
    console.error("fetchCohortHistory error:", err.message);
    return [];
  }
}

// Fallback: base columns only (pre-migration) ─────────────────────────────────
async function fetchCohortHistoryBase(excludeIds: Set<string>): Promise<CohortMonthRecord[]> {
  try {
    const { data: allRows } = await supabase
      .from("user_monthly_assessments")
      .select(`
        user_id, measured_at,
        cognitive_score, critical_thinking_score,
        problem_solving_score, creativity_score, pue_score
      `)
      .order("measured_at", { ascending: true });

    if (!allRows?.length) return [];

    const byMonth = new Map<string, typeof allRows>();
    for (const row of allRows) {
      if (excludeIds.has(row.user_id)) continue;
      const d = new Date(row.measured_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(row);
    }

    const records: CohortMonthRecord[] = [];
    for (const [key, rows] of byMonth.entries()) {
      const n = rows.length;
      const avg = (field: string) =>
        Math.round(rows.reduce((acc, r) => acc + (Number((r as any)[field]) || 0), 0) / n);

      const d = new Date(key + "-01");
      records.push({
        monthLabel: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        measured_at: key,
        learnerCount: n,
        cognitive_score: avg("cognitive_score"),
        critical_thinking_score: avg("critical_thinking_score"),
        problem_solving_score: avg("problem_solving_score"),
        creativity_score: avg("creativity_score"),
        pue_score: avg("pue_score"),
        pue_energy_constraint_pct: 0,
        pue_market_pricing_pct: 0,
        pue_learner_initiated_pct: 0,
        reasoning_structured_pct: 0,
        session_count: 0,
        ai_prof_application_gpt: 0,
        ai_prof_ethics_gpt: 0,
        ai_prof_understanding_gpt: 0,
        ai_prof_verification_gpt: 0,
        cert_passed_pct: 0,
      });
    }

    return records.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  } catch (err: any) {
    console.error("fetchCohortHistoryBase error:", err.message);
    return [];
  }
}

// ─── AI Playground Summary ────────────────────────────────────────────────────

async function fetchPlaygroundSummary(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<PlaygroundSummary | null> {
  // Playground chats live in ai_playground_chats — separate from dashboard.
  // messages is stored as a native JSON array: [{role, content, timestamp}]
  const { data: rows, error } = await supabase
    .from("ai_playground_chats")
    .select("id, title, messages, created_at, updated_at")
    .eq("user_id", userId)
    .gte("updated_at", startDate.toISOString())
    .lte("updated_at", endDate.toISOString())
    .order("updated_at", { ascending: true });

  if (error || !rows?.length) return null;

  // messages is already a parsed JSON array — no string-parsing needed
  type Msg = { role: string; content: string };
  const allMessages: Msg[] = [];
  for (const row of rows) {
    const msgs = Array.isArray(row.messages) ? row.messages : [];
    allMessages.push(...msgs);
  }

  const userMessages = allMessages.filter((m) => m.role === "user");
  if (userMessages.length < 2) return null; // too thin to summarise

  // Build a compact transcript — user messages only to keep tokens low
  const transcript = userMessages
    .map((m) => m.content?.slice(0, 600) || "")
    .filter(Boolean)
    .join("\n---\n")
    .slice(0, 40000);

  const totalWords = userMessages
    .reduce((acc, m) => acc + (m.content || "").split(/\s+/).length, 0);

  try {
    // Optimisation 1: playground summary uses Haiku — topic classification
    // from short user messages needs no deep reasoning; Haiku is 3x cheaper.
    const pgContent = await callClaudeHaiku(
      "You are an educational analyst reviewing free-form AI Playground conversations from youth learners (ages 12–24) at the Davidson AI Innovation Center in Oloibiri, Nigeria. " +
        "The AI Playground gives learners unrestricted access to Claude — no curriculum scaffolding, no activity structure. " +
        "Your job is to characterise how this learner is using free-form AI access and flag anything connected to Productive Use of Energy (PUE), entrepreneurship, or community enterprise. " +
        "Respond ONLY with valid JSON, no markdown.",
      `Analyse these ${rows.length} AI Playground sessions (${totalWords} learner words total).

TRANSCRIPT (user messages only):
${transcript}

Return this exact JSON:
{
  "pueSessionCount": <integer: how many sessions contained energy/solar/battery/business/enterprise/market/farming language>,
  "entrepreneurshipCount": <integer: sessions focused on building a business, starting a venture, or enterprise planning>,
  "topTopics": ["<3-5 dominant themes this learner explored in free-form AI use — be specific, e.g. 'solar system sizing', 'football tactics', 'coding help', 'business planning'>"],
  "pueHighlights": ["<up to 3 direct learner quotes that show PUE or entrepreneurship thinking — use exact words from the transcript, max 120 chars each>"],
  "narrative": "<3-4 sentences: What is this learner actually doing with unconstrained AI access? Are they using it for personal curiosity, practical community/energy problems, entrepreneurship, or social conversation? Specifically call out any PUE or enterprise-relevant use. How does their free-form usage compare to what you'd expect from a structured curriculum?>",
  "hasMeaningfulActivity": <true if there are at least 2 substantive exchanges, false otherwise>
}`,
      1000
    );

    const raw = JSON.parse(pgContent || "{}");
    return {
      sessionCount: rows.length,
      totalWords,
      pueSessionCount: raw.pueSessionCount || 0,
      entrepreneurshipCount: raw.entrepreneurshipCount || 0,
      topTopics: raw.topTopics || [],
      pueHighlights: raw.pueHighlights || [],
      narrative: raw.narrative || "",
      hasMeaningfulActivity: raw.hasMeaningfulActivity ?? true,
    };
  } catch (err: any) {
    console.error(`   Playground summary error for ${userId.slice(0, 8)}: ${err.message}`);
    return null;
  }
}

// ─── User Discovery ───────────────────────────────────────────────────────────

async function getAfricanUsersNeedingAssessment(startDate: Date, endDate: Date): Promise<string[]> {
  // Broadened: Africa continent OR vAI org OR Solardero org OR Oloibiri org
  const VAI_ORG_ID       = 'c0b48eae-67af-449d-8c04-cc6950bf0982';
  const SOLARDERO_ORG_ID = 'a1b2c3d4-0002-0002-0002-000000000002';
  const OLOIBIRI_ORG_ID  = 'a1b2c3d4-0001-0001-0001-000000000001';
  const { data: profiles } = await supabase
    .from("profiles").select("id")
    .or(`continent.eq.Africa,organization_id.eq.${VAI_ORG_ID},organization_id.eq.${SOLARDERO_ORG_ID},organization_id.eq.${OLOIBIRI_ORG_ID}`);
  if (!profiles?.length) return [];
  const ids = profiles.map((p) => p.id).filter((id) => !EXCLUDED_USER_IDS.has(id));

  // Any dashboard activity in window — not gated on chat_history
  const { data: activities } = await supabase
    .from("dashboard").select("user_id").in("user_id", ids)
    .gte("updated_at", startDate.toISOString()).lte("updated_at", endDate.toISOString());
  if (!activities?.length) return [];

  const activeIds = [...new Set(activities.map((a) => a.user_id).filter(Boolean))] as string[];

  const { data: assessed } = await supabase
    .from("user_monthly_assessments").select("user_id").in("user_id", activeIds)
    .gte("measured_at", startDate.toISOString()).lte("measured_at", endDate.toISOString());

  const doneSet = new Set((assessed || []).map((a) => a.user_id));
  return activeIds.filter((id) => !doneSet.has(id) && !EXCLUDED_USER_IDS.has(id));
}

// ─── Historical Data ──────────────────────────────────────────────────────────

async function fetchAllHistoricalData(userIds: string[]): Promise<Map<string, HistoricalRecord[]>> {
  if (!userIds.length) return new Map();
  const { data } = await supabase
    .from("user_monthly_assessments")
    .select(`user_id, measured_at, cognitive_score, critical_thinking_score,
      problem_solving_score, creativity_score, pue_score,
      pue_energy_constraint_pct, pue_market_pricing_pct, pue_learner_initiated_pct,
      pue_summary, scaffold_convergence_trend, reasoning_structured_pct,
      metacog_verification_rate, role_teaching_intent_count,
      role_enterprise_orientation_count, enterprise_artifact_score, session_count,
      ai_prof_application_score, ai_prof_ethics_score, ai_prof_understanding_score,
      ai_prof_verification_score, ai_prof_cert_level,
      ai_prof_application_gpt, ai_prof_ethics_gpt, ai_prof_understanding_gpt, ai_prof_verification_gpt,
      cert_attempted_count, cert_passed_count, cert_names_passed, cert_avg_score`)
    .in("user_id", userIds)
    .order("measured_at", { ascending: true });

  const map = new Map<string, HistoricalRecord[]>();
  for (const row of data || []) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id)!.push(row as HistoricalRecord);
  }
  return map;
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

function sc(n: number | null | undefined): string {
  if (n == null) return "—";
  const v = Math.round(n);
  if (v >= 75) return `<span style="background:#bbf7d0;color:#14532d;padding:2px 7px;border-radius:4px;font-family:monospace;font-size:12px;font-weight:700;">${v}</span>`;
  if (v >= 55) return `<span style="background:#bfdbfe;color:#1e40af;padding:2px 7px;border-radius:4px;font-family:monospace;font-size:12px;font-weight:700;">${v}</span>`;
  if (v >= 35) return `<span style="background:#fef08a;color:#713f12;padding:2px 7px;border-radius:4px;font-family:monospace;font-size:12px;font-weight:700;">${v}</span>`;
  return `<span style="background:#fecaca;color:#7f1d1d;padding:2px 7px;border-radius:4px;font-family:monospace;font-size:12px;font-weight:700;">${v}</span>`;
}

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}
function fmt(n: number | null | undefined, dec = 1): string {
  return n == null ? "—" : n.toFixed(dec);
}

function trendChip(trend: string | null | undefined): string {
  if (!trend) return "";
  const cfg: Record<string, [string, string]> = {
    converging: ["#dcfce7", "#166534"],
    stable: ["#f1f5f9", "#475569"],
    diverging: ["#fee2e2", "#991b1b"],
    insufficient_data: ["#fef9c3", "#854d0e"],
  };
  const [bg, color] = cfg[trend] || ["#f1f5f9", "#475569"];
  return `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">${trend.replace(/_/g, " ")}</span>`;
}

function trendArrow(history: HistoricalRecord[]): string {
  if (history.length < 2) return "";
  const avg5 = (r: HistoricalRecord) =>
    (r.cognitive_score + r.critical_thinking_score + r.problem_solving_score + r.creativity_score + r.pue_score) / 5;
  const diff = Math.round(avg5(history[history.length - 1]) - avg5(history[history.length - 2]));
  if (diff > 0) return `<span style="color:#166534;font-size:12px;"> ▲ +${diff}</span>`;
  if (diff < 0) return `<span style="color:#991b1b;font-size:12px;"> ▼ ${diff}</span>`;
  return `<span style="color:#6b7280;font-size:12px;"> → 0</span>`;
}

function pueDomainBar(label: string, val: number | null): string {
  const w = Math.round(Math.min((val || 0) * 1.2, 120));
  return `<div style="margin-bottom:5px;display:flex;align-items:center;gap:6px;">
    <span style="font-size:11px;color:#374151;width:150px;flex-shrink:0;">${label}</span>
    <span style="display:inline-block;background:#e5e7eb;border-radius:3px;width:120px;height:7px;">
      <span style="display:inline-block;background:#2d6a4f;border-radius:3px;height:7px;width:${w}px;"></span>
    </span>
    <span style="font-size:11px;color:#374151;">${pct(val)}</span>
  </div>`;
}

function buildUserCard(
  summary: AssessmentSummary,
  history: HistoricalRecord[],
  playground: PlaygroundSummary | null
): string {
  if (summary.status !== "success" || !summary.scores) return "";
  const { name, sessionCount, engagedSessionCount, scores: s } = summary;
  const initials = name.split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

  const historyRows = history.map((h, i) => {
    const isLatest = i === history.length - 1;
    const dot = isLatest ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#52b788;margin-right:4px;vertical-align:middle;"></span>` : "";
    const mo = new Date(h.measured_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return `<tr style="${isLatest ? "background:rgba(82,183,136,0.06);" : ""}border-top:1px solid #e5e7eb;">
      <td style="padding:7px 10px;font-family:monospace;font-size:11px;color:#6b7280;">${dot}${mo}</td>
      <td style="padding:7px 10px;text-align:center;">${sc(h.cognitive_score)}</td>
      <td style="padding:7px 10px;text-align:center;">${sc(h.critical_thinking_score)}</td>
      <td style="padding:7px 10px;text-align:center;">${sc(h.problem_solving_score)}</td>
      <td style="padding:7px 10px;text-align:center;">${sc(h.creativity_score)}</td>
      <td style="padding:7px 10px;text-align:center;">${sc(h.pue_score)}</td>
      <td style="padding:7px 10px;text-align:center;">${h.ai_prof_application_gpt != null ? sc(h.ai_prof_application_gpt) : "<span style='color:#d1d5db;font-size:10px;'>—</span>"}</td>
      <td style="padding:7px 10px;text-align:center;">${h.ai_prof_ethics_gpt != null ? sc(h.ai_prof_ethics_gpt) : "<span style='color:#d1d5db;font-size:10px;'>—</span>"}</td>
      <td style="padding:7px 10px;text-align:center;">${h.ai_prof_understanding_gpt != null ? sc(h.ai_prof_understanding_gpt) : "<span style='color:#d1d5db;font-size:10px;'>—</span>"}</td>
      <td style="padding:7px 10px;text-align:center;">${h.ai_prof_verification_gpt != null ? sc(h.ai_prof_verification_gpt) : "<span style='color:#d1d5db;font-size:10px;'>—</span>"}</td>
      <td style="padding:7px 10px;text-align:center;font-family:monospace;font-size:11px;color:${(h.cert_passed_count ?? 0) > 0 ? "#166534" : "#9ca3af"};">${h.cert_passed_count ?? "—"}</td>
      <td style="padding:7px 10px;text-align:center;font-family:monospace;font-size:11px;color:#1a3d2b;">${h.session_count ?? "—"}</td>
    </tr>`;
  }).join("");

  // ── Build kudos from actual data ──
  const firstName = name.split(" ")[0] || "Learner";
  const kudosList: string[] = [];
  if (engagedSessionCount >= 10) {
    kudosList.push("You completed <strong>" + engagedSessionCount + " engaged sessions</strong> this month \u2014 that\u2019s outstanding dedication! \ud83d\udcaa");
  } else if (engagedSessionCount >= 5) {
    kudosList.push("You showed up for <strong>" + engagedSessionCount + " engaged sessions</strong> this month \u2014 great consistency!");
  } else if (engagedSessionCount >= 1) {
    kudosList.push("You participated in <strong>" + engagedSessionCount + " session" + (engagedSessionCount > 1 ? "s" : "") + "</strong> this month \u2014 every session counts!");
  }
  const kudosSkills: Array<[string, number]> = [
    ["Cognitive Skills", s.cognitive_score], ["Critical Thinking", s.critical_thinking_score],
    ["Problem Solving", s.problem_solving_score], ["Creativity", s.creativity_score],
    ["Productive Use of Energy", s.pue_score],
  ];
  const kudosSorted = [...kudosSkills].sort((a, b) => b[1] - a[1]);
  const topSkill = kudosSorted[0];
  if (topSkill[1] >= 75) {
    kudosList.push("Your strongest area is <strong>" + topSkill[0] + "</strong> \u2014 scoring " + topSkill[1] + "/100 puts you at a strong level! \ud83c\udf1f");
  } else if (topSkill[1] >= 55) {
    kudosList.push("Your strongest area is <strong>" + topSkill[0] + "</strong> at " + topSkill[1] + "/100 \u2014 you\u2019re developing real skill here!");
  } else if (topSkill[1] >= 35) {
    kudosList.push("You\u2019re building your <strong>" + topSkill[0] + "</strong> skills (" + topSkill[1] + "/100) \u2014 keep going!");
  }
  if (history.length >= 2) {
    const prevRec = history[history.length - 2];
    const currRec = history[history.length - 1];
    const prevA = (prevRec.cognitive_score + prevRec.critical_thinking_score + prevRec.problem_solving_score + prevRec.creativity_score + prevRec.pue_score) / 5;
    const currA = (currRec.cognitive_score + currRec.critical_thinking_score + currRec.problem_solving_score + currRec.creativity_score + currRec.pue_score) / 5;
    const deltaA = Math.round(currA - prevA);
    if (deltaA > 0) { kudosList.push("Your overall scores went <strong>up by " + deltaA + " points</strong> compared to last month \u2014 real growth! \ud83d\udcc8"); }
  }
  if (s.pue_learner_initiated_pct >= 30) {
    kudosList.push("You brought up energy and business topics on your own <strong>" + Math.round(s.pue_learner_initiated_pct) + "%</strong> of the time \u2014 real initiative! \u26a1");
  }
  if (s.enterprise_artifact_score >= 12) {
    kudosList.push("Your enterprise planning scored <strong>" + s.enterprise_artifact_score + "/18</strong> \u2014 you\u2019re thinking like a business planner! \ud83c\udfea");
  } else if (s.enterprise_artifact_score >= 6) {
    kudosList.push("You\u2019re developing enterprise planning skills (" + s.enterprise_artifact_score + "/18) \u2014 keep building!");
  }
  if (s.scaffold_convergence_trend === "converging") {
    kudosList.push("The AI needed to help you less and less over time \u2014 you\u2019re becoming more independent! \ud83e\udde0");
  }
  if (s.cert_passed_count >= 1) {
    kudosList.push("You passed <strong>" + s.cert_passed_count + " certification" + (s.cert_passed_count > 1 ? "s" : "") + "</strong> \u2014 a real achievement! \ud83c\udfc6");
  }
  if (playground && playground.hasMeaningfulActivity) {
    kudosList.push("You explored the AI Playground with <strong>" + playground.sessionCount + " free-form session" + (playground.sessionCount > 1 ? "s" : "") + "</strong> \u2014 that curiosity is what innovators do! \ud83c\udfae");
  }
  if (kudosList.length === 0) {
    kudosList.push("You showed up and engaged with the learning \u2014 that takes commitment!");
    kudosList.push("Every session builds your skills for the future. Keep going, " + firstName + "!");
  } else if (kudosList.length === 1) {
    kudosList.push("Keep up the effort, " + firstName + " \u2014 you\u2019re building skills that will make a real difference!");
  }
  const showKudos = kudosList.slice(0, 5);
  const kudosHtml = '<div style="background:linear-gradient(135deg,#fef9c3,#fff7ed);border:2px solid #f59e0b;border-radius:10px;padding:16px 18px;margin:12px 16px 4px 16px;">'
    + '<div style="font-size:14px;font-weight:700;color:#92400e;margin-bottom:10px;">\ud83c\udf1f Great Work This Month, ' + firstName + '!</div>'
    + '<ul style="margin:0;padding-left:18px;font-size:12px;color:#374151;line-height:2;">'
    + showKudos.map((k) => '<li style="margin-bottom:4px;">' + k + '</li>').join("")
    + '</ul>'
    + '<div style="margin-top:10px;font-size:11px;color:#92400e;font-style:italic;">Keep learning, keep growing \u2014 your future is bright! \u2600\ufe0f</div>'
    + '</div>';


  return `
<div style="margin-bottom:24px;border:1px solid #d0e8d8;border-radius:12px;overflow:hidden;page-break-before:always;">

  <div style="background:linear-gradient(135deg,#f4fbf6,#fff);padding:13px 16px;display:flex;align-items:center;gap:11px;border-bottom:1px solid #d0e8d8;">
    <div style="width:38px;height:38px;border-radius:50%;background:#1a3d2b;display:flex;align-items:center;justify-content:center;color:#52b788;font-weight:700;font-size:14px;flex-shrink:0;">${initials}</div>
    <div style="flex:1;">
      <strong style="font-size:14px;color:#0d1b14;">${name}</strong>${trendArrow(history)}
      <div style="font-size:11px;color:#5a7060;margin-top:1px;">${history.length} assessment${history.length !== 1 ? "s" : ""} · ${sessionCount} sessions (${engagedSessionCount} engaged) this period</div>
    </div>
  </div>

  ${kudosHtml}

  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <tr style="background:#f5faf6;">
      <th style="padding:6px 10px;text-align:left;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Period</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Cog</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">CT</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">PS</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Cre</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">PUE</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#6b21a8;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">App</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#6b21a8;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Eth</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#6b21a8;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Und</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#6b21a8;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Ver</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Certs</th>
      <th style="padding:6px 10px;text-align:center;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Sessions</th>
    </tr>
    ${historyRows}
  </table>

  <!-- ── Score Evidence ──────────────────────────────────────── -->
  <div style="border-top:1px solid #d0e8d8;background:#f8fbf9;padding:13px 16px;">
    <div style="font-size:11px;font-weight:600;color:#1a3d2b;margin-bottom:10px;">📝 Score Evidence</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      ${([
        ["🧠 Cognitive", s.cognitive_score, s.cognitive_evidence],
        ["🔍 Critical Thinking", s.critical_thinking_score, s.critical_thinking_evidence],
        ["⚙️ Problem Solving", s.problem_solving_score, s.problem_solving_evidence],
        ["🎨 Creativity", s.creativity_score, s.creativity_evidence],
        ["⚡ PUE", s.pue_score, s.pue_evidence],
      ] as [string, number, string[]][]).map(([label, score, evidence]) => `
      <div style="flex:1;min-width:180px;background:#fff;border:1px solid #d0e8d8;border-radius:8px;padding:8px 10px;">
        <div style="font-size:10px;font-weight:700;color:#1a3d2b;margin-bottom:5px;display:flex;align-items:center;gap:5px;">
          ${label} ${sc(score)}
        </div>
        <ul style="margin:0;padding-left:14px;font-size:10px;color:#374151;line-height:1.7;">
          ${(evidence || []).map((e) => `<li style="margin-bottom:2px;">${e}</li>`).join("") || `<li style="color:#9ca3af;">No evidence recorded.</li>`}
        </ul>
      </div>`).join("")}
    </div>
  </div>

  <div style="padding:13px 16px;border-top:1px solid #d0e8d8;background:#fafffe;">
    <div style="font-size:11px;font-weight:600;color:#1a3d2b;margin-bottom:8px;">⚡ PUE Domain Coverage</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;">
      <div>
        ${pueDomainBar("🔋 Energy Constraint", s.pue_energy_constraint_pct)}
        ${pueDomainBar("📈 Market Pricing", s.pue_market_pricing_pct)}
        ${pueDomainBar("⚙️ Battery/Load", s.pue_battery_load_pct)}
        ${pueDomainBar("🏪 Enterprise Planning", s.pue_enterprise_planning_pct)}
      </div>
      <div>
        ${pueDomainBar("🗣 Learner-Initiated", s.pue_learner_initiated_pct)}
        ${pueDomainBar("🤖 AI-Introduced", s.pue_ai_introduced_pct)}
        ${pueDomainBar("🌐 Multi-Domain (3+)", s.pue_multi_domain_pct)}
        ${pueDomainBar("📍 Local Context", s.pue_local_context_pct)}
      </div>
    </div>
    ${s.pue_summary ? `<div style="margin-top:8px;font-size:11px;color:#374151;line-height:1.5;font-style:italic;">${s.pue_summary}</div>` : ""}
    ${s.pue_evidence_quotes?.[0] ? `<div style="margin-top:6px;padding-left:8px;border-left:2px solid #52b788;font-size:11px;color:#5a7060;font-style:italic;">"${s.pue_evidence_quotes[0].slice(0, 200)}"</div>` : ""}
  </div>

  <div style="display:flex;border-top:1px solid #d0e8d8;">
    <div style="flex:1;padding:11px 14px;border-right:1px solid #d0e8d8;">
      <div style="font-size:10px;font-weight:600;color:#1a3d2b;margin-bottom:6px;">🔧 Scaffolding ${trendChip(s.scaffold_convergence_trend)}</div>
      <div style="font-size:10px;color:#374151;line-height:1.8;">
        <div>Clarification: <strong>${fmt(s.scaffold_clarification_per_session)}/session</strong></div>
        <div>Decomposition: <strong>${fmt(s.scaffold_decomposition_per_session)}/session</strong></div>
        <div>Explicit corrections: <strong>${fmt(s.scaffold_explicit_correction_per_session)}/session</strong></div>
        <div>Gentle redirects: <strong>${fmt(s.scaffold_gentle_redirect_per_session)}/session</strong></div>
      </div>
      ${s.scaffold_convergence_narrative ? `<div style="margin-top:6px;font-size:10px;color:#5a7060;font-style:italic;line-height:1.4;">${s.scaffold_convergence_narrative.slice(0, 180)}…</div>` : ""}
    </div>
    <div style="flex:1;padding:11px 14px;border-right:1px solid #d0e8d8;">
      <div style="font-size:10px;font-weight:600;color:#1a3d2b;margin-bottom:6px;">🧩 Reasoning Levels</div>
      <div style="font-size:10px;color:#374151;line-height:1.8;">
        <div>L0 Definitional: <strong>${pct(s.reasoning_definitional_pct)}</strong></div>
        <div>L1 Responsive: <strong>${pct(s.reasoning_responsive_pct)}</strong></div>
        <div>L2 Elaborative: <strong>${pct(s.reasoning_elaborative_pct)}</strong></div>
        <div>L3 Structured: <strong style="color:${(s.reasoning_structured_pct||0)>=20?"#166534":"inherit"};">${pct(s.reasoning_structured_pct)}</strong></div>
        <div>Chains: <strong>${s.reasoning_chain_count || 0}</strong></div>
      </div>
    </div>
    <div style="flex:1;padding:11px 14px;">
      <div style="font-size:10px;font-weight:600;color:#1a3d2b;margin-bottom:6px;">🧠 Metacognition</div>
      <div style="font-size:10px;color:#374151;line-height:1.8;">
        <div>Verification: <strong>${fmt(s.metacog_verification_rate)}/1k words</strong></div>
        <div>Reactive: <strong>${fmt(s.metacog_reactive_rate)}/1k words</strong></div>
        <div>Strategic: <strong>${fmt(s.metacog_strategic_rate)}/1k words</strong></div>
      </div>
      ${s.metacog_narrative ? `<div style="margin-top:6px;font-size:10px;color:#5a7060;font-style:italic;line-height:1.4;">${s.metacog_narrative.slice(0, 180)}…</div>` : ""}
    </div>
  </div>

  <div style="display:flex;border-top:1px solid #d0e8d8;">
    <div style="flex:1;padding:11px 14px;border-right:1px solid #d0e8d8;">
      <div style="font-size:10px;font-weight:600;color:#1a3d2b;margin-bottom:6px;">🌍 Role Readiness</div>
      <div style="font-size:10px;color:#374151;line-height:1.8;">
        <div>Teaching intent: <strong>${s.role_teaching_intent_count || 0}</strong></div>
        <div>Community application: <strong>${s.role_community_application_count || 0}</strong></div>
        <div>Enterprise orientation: <strong>${s.role_enterprise_orientation_count || 0}</strong></div>
        <div>Intergenerational: <strong>${s.role_intergenerational_count || 0}</strong></div>
      </div>
      ${s.role_readiness_narrative ? `<div style="margin-top:6px;font-size:10px;color:#5a7060;font-style:italic;line-height:1.4;">${s.role_readiness_narrative.slice(0, 200)}…</div>` : ""}
    </div>
    <div style="flex:1;padding:11px 14px;">
      <div style="font-size:10px;font-weight:600;color:#1a3d2b;margin-bottom:6px;">📋 Enterprise Artifact <span style="font-weight:400;color:#5a7060;">(${s.enterprise_artifact_score || 0}/18)</span></div>
      <div style="font-size:10px;color:#374151;line-height:1.8;">
        <div>Goal: ${s.enterprise_artifact_goal_score}/3 &nbsp;·&nbsp; Resources: ${s.enterprise_artifact_resource_score}/3 &nbsp;·&nbsp; Plan: ${s.enterprise_artifact_plan_score}/3</div>
        <div>Constraints: ${s.enterprise_artifact_constraint_score}/3 &nbsp;·&nbsp; Quant: ${s.enterprise_artifact_quant_score}/3 &nbsp;·&nbsp; Risk: ${s.enterprise_artifact_risk_score}/3</div>
      </div>
      ${s.enterprise_artifact_evidence?.[0] ? `<div style="margin-top:6px;padding-left:6px;border-left:2px solid #52b788;font-size:10px;color:#5a7060;font-style:italic;">"${s.enterprise_artifact_evidence[0].slice(0, 160)}…"</div>` : ""}
    </div>
  </div>

  <!-- AI Proficiency Panel -->
  <div style="border-top:1px solid #d0e8d8;background:#f5f0ff;padding:13px 16px;">
    <div style="font-size:11px;font-weight:600;color:#4c1d95;margin-bottom:8px;">🤖 AI Proficiency</div>
    <div style="display:flex;gap:0;flex-wrap:wrap;margin-bottom:8px;">
      <!-- Formal cert scores from AIProficiencyPage -->
      <div style="flex:1;min-width:200px;padding-right:16px;">
        <div style="font-size:9px;font-weight:700;color:#6b21a8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:5px;">Formal Cert Scores (0–3)</div>
        <div style="font-size:10px;color:#374151;line-height:1.8;">
          <div>Application: <strong>${s.ai_prof_application_score != null ? `${s.ai_prof_application_score}/3` : "—"}</strong> &nbsp; Ethics: <strong>${s.ai_prof_ethics_score != null ? `${s.ai_prof_ethics_score}/3` : "—"}</strong></div>
          <div>Understanding: <strong>${s.ai_prof_understanding_score != null ? `${s.ai_prof_understanding_score}/3` : "—"}</strong> &nbsp; Verification: <strong>${s.ai_prof_verification_score != null ? `${s.ai_prof_verification_score}/3` : "—"}</strong></div>
          <div>Cert level: <strong style="color:${s.ai_prof_cert_level === "Advanced" ? "#166534" : s.ai_prof_cert_level === "Proficient" ? "#1e40af" : s.ai_prof_cert_level === "Emerging" ? "#713f12" : "#6b7280"};">${s.ai_prof_cert_level || "Not Attempted"}</strong></div>
        </div>
      </div>
      <!-- GPT-inferred scores from transcript analysis -->
      <div style="flex:1;min-width:200px;">
        <div style="font-size:9px;font-weight:700;color:#6b21a8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:5px;">GPT-Assessed from Transcripts (0–100)</div>
        <div style="font-size:10px;color:#374151;line-height:1.8;">
          <div>Application: ${sc(s.ai_prof_application_gpt)} &nbsp; Ethics: ${sc(s.ai_prof_ethics_gpt)}</div>
          <div>Understanding: ${sc(s.ai_prof_understanding_gpt)} &nbsp; Verification: ${sc(s.ai_prof_verification_gpt)}</div>
        </div>
      </div>
    </div>
    ${s.ai_prof_gpt_narrative ? `<div style="font-size:10px;color:#5a7060;font-style:italic;line-height:1.4;">${s.ai_prof_gpt_narrative}</div>` : ""}
  </div>

  <!-- Certification Summary Panel -->
  <div style="border-top:1px solid #d0e8d8;background:#fffef5;padding:13px 16px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:13px;">🏆</span>
      <div style="font-size:11px;font-weight:600;color:#1a3d2b;">Certifications</div>
      <span style="margin-left:auto;font-size:10px;color:#6b7280;">${s.cert_attempted_count || 0} attempted · ${s.cert_passed_count || 0} passed${s.cert_avg_score != null ? ` · avg ${s.cert_avg_score}/3` : ""}</span>
    </div>
    ${(s.cert_names_passed?.length ?? 0) > 0 ? `
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">
      ${(s.cert_names_passed || []).map((n) =>
        `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">✅ ${n}</span>`
      ).join("")}
    </div>` : `<div style="font-size:10px;color:#9ca3af;margin-bottom:4px;">No certifications passed yet</div>`}
    ${(s.cert_names_attempted?.length ?? 0) > 0 && (s.cert_passed_count || 0) < (s.cert_attempted_count || 0) ? `
    <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Also attempted: ${(s.cert_names_attempted || []).filter((n) => !(s.cert_names_passed || []).includes(n)).join(", ")}</div>` : ""}
    ${s.cert_summary && s.cert_summary !== "No certifications attempted yet." ? `<div style="font-size:10px;color:#374151;font-style:italic;line-height:1.4;">${s.cert_summary}</div>` : ""}
  </div>

  ${playground && playground.hasMeaningfulActivity ? `
  <div style="border-top:2px solid #fde68a;background:#fffdf0;padding:13px 16px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:14px;">🎮</span>
      <div style="font-size:11px;font-weight:700;color:#92400e;">AI Playground — Free-Form Usage</div>
      <span style="margin-left:auto;font-size:10px;color:#92400e;opacity:0.7;">${playground.sessionCount} session${playground.sessionCount !== 1 ? "s" : ""} · ${playground.totalWords.toLocaleString()} learner words</span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="background:#fff;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;text-align:center;min-width:80px;">
        <div style="font-size:20px;font-weight:700;color:${playground.pueSessionCount > 0 ? "#065f46" : "#9ca3af"};">${playground.pueSessionCount}</div>
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">PUE Sessions</div>
      </div>
      <div style="background:#fff;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;text-align:center;min-width:80px;">
        <div style="font-size:20px;font-weight:700;color:${playground.entrepreneurshipCount > 0 ? "#7c3aed" : "#9ca3af"};">${playground.entrepreneurshipCount}</div>
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Enterprise Sessions</div>
      </div>
      <div style="flex:1;min-width:160px;">
        <div style="font-size:10px;font-weight:600;color:#374151;margin-bottom:5px;">Topics Explored</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${playground.topTopics.map((t) => `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:500;">${t}</span>`).join("")}
        </div>
      </div>
    </div>
    ${(s.ai_playground_summary && s.ai_playground_summary !== "No AI Playground activity recorded this period.") ? `<div style="font-size:11px;color:#374151;line-height:1.6;margin-bottom:8px;font-style:italic;background:#fffbeb;padding:8px 10px;border-radius:6px;">${s.ai_playground_summary}</div>` : playground.narrative ? `<div style="font-size:11px;color:#374151;line-height:1.6;margin-bottom:8px;">${playground.narrative}</div>` : ""}
    ${playground.pueHighlights?.length ? `
    <div style="font-size:10px;font-weight:700;color:#065f46;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.8px;">PUE &amp; Entrepreneurship Highlights</div>
    ${playground.pueHighlights.map((q) =>
      `<div style="padding:5px 10px;border-left:3px solid #f0c040;background:#fffbeb;border-radius:0 6px 6px 0;font-size:11px;color:#374151;font-style:italic;margin-bottom:4px;">"${q}"</div>`
    ).join("")}` : ""}
  </div>` : `
  <div style="border-top:1px solid #e5e7eb;background:#fafafa;padding:9px 16px;">
    <span style="font-size:10px;color:#9ca3af;">🎮 AI Playground: ${playground ? `${playground.sessionCount} session${playground.sessionCount !== 1 ? "s" : ""} recorded — too brief to summarise.` : "No sessions this period."}</span>
  </div>`}

</div>`;
}

function buildEmailHtml(
  monthLabel: string,
  summaries: AssessmentSummary[],
  historyMap: Map<string, HistoricalRecord[]>,
  playgroundMap: Map<string, PlaygroundSummary | null>,
  cohortHistory: CohortMonthRecord[],
  durationMs: number
): string {
  const successes = summaries.filter((s) => s.status === "success");
  const totalSessions = summaries.reduce((a, s) => a + (s.sessionCount || 0), 0);
  const cohortAvg = (key: keyof MonthlySkillsResult) =>
    successes.length ? Math.round(successes.reduce((a, s) => a + ((s.scores?.[key] as number) || 0), 0) / successes.length) : 0;

  const converging = successes.filter((s) => s.scores?.scaffold_convergence_trend === "converging").length;
  const roleReady = successes.filter((s) => (s.scores?.role_teaching_intent_count || 0) + (s.scores?.role_enterprise_orientation_count || 0) > 0).length;
  const playgroundActive = [...playgroundMap.values()].filter((p) => p && p.hasMeaningfulActivity).length;

  const userCards = summaries
    .filter((s) => s.status === "success")
    .sort((a, b) => (historyMap.get(b.userId) || []).length - (historyMap.get(a.userId) || []).length)
    .map((s) => buildUserCard(s, historyMap.get(s.userId) || [], playgroundMap.get(s.userId) || null))
    .join("");

  // ── Cohort Playground Summary ─────────────────────────────────────────────
  const pgEntries = [...playgroundMap.values()].filter((p): p is PlaygroundSummary => p !== null && p.hasMeaningfulActivity);

  // Aggregate top topics across all learners
  const topicFreq: Record<string, number> = {};
  for (const pg of pgEntries) {
    for (const t of pg.topTopics) {
      const key = t.toLowerCase().trim();
      topicFreq[key] = (topicFreq[key] || 0) + 1;
    }
  }
  const sortedTopics = Object.entries(topicFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const totalPgSessions = pgEntries.reduce((a, p) => a + p.sessionCount, 0);
  const totalPgWords    = pgEntries.reduce((a, p) => a + p.totalWords, 0);
  const totalPueSessions = pgEntries.reduce((a, p) => a + p.pueSessionCount, 0);
  const totalEntSessions = pgEntries.reduce((a, p) => a + p.entrepreneurshipCount, 0);

  // Collect the best PUE highlight quotes across the cohort (up to 4)
  const allPueHighlights: Array<{ name: string; quote: string }> = [];
  for (const s of summaries.filter((x) => x.status === "success")) {
    const pg = playgroundMap.get(s.userId);
    if (pg?.pueHighlights?.length) {
      allPueHighlights.push({ name: s.name, quote: pg.pueHighlights[0] });
    }
  }
  const featuredHighlights = allPueHighlights.slice(0, 4);

  const cohortPlaygroundHtml = pgEntries.length === 0 ? "" : `
    <div style="background:#fffdf0;border:2px solid #fde68a;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
        <span style="font-size:16px;">🎮</span>
        <div style="font-size:13px;font-weight:700;color:#92400e;">Cohort AI Playground Summary — ${monthLabel}</div>
        <span style="margin-left:auto;font-size:11px;color:#92400e;opacity:0.7;">${pgEntries.length} active learner${pgEntries.length !== 1 ? "s" : ""} · ${totalPgSessions} sessions · ${totalPgWords.toLocaleString()} words</span>
      </div>

      <!-- Stats row -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <div style="background:#fff;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;text-align:center;min-width:90px;">
          <div style="font-size:22px;font-weight:700;color:${totalPueSessions > 0 ? "#065f46" : "#9ca3af"};">${totalPueSessions}</div>
          <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">PUE Sessions</div>
        </div>
        <div style="background:#fff;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;text-align:center;min-width:90px;">
          <div style="font-size:22px;font-weight:700;color:${totalEntSessions > 0 ? "#7c3aed" : "#9ca3af"};">${totalEntSessions}</div>
          <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Enterprise Sessions</div>
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="font-size:10px;font-weight:600;color:#374151;margin-bottom:6px;">Most Common Topics Across Cohort</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${sortedTopics.map(([topic, count]) =>
              `<span style="background:#fef3c7;color:#92400e;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:500;">${topic} <span style="opacity:0.6;">(${count})</span></span>`
            ).join("")}
          </div>
        </div>
      </div>

      ${featuredHighlights.length ? `
      <div style="font-size:10px;font-weight:700;color:#065f46;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.8px;">PUE &amp; Entrepreneurship Highlights from Free-Form Use</div>
      ${featuredHighlights.map(({ name, quote }) =>
        `<div style="display:flex;gap:8px;margin-bottom:5px;align-items:flex-start;">
          <span style="font-size:10px;font-weight:600;color:#92400e;white-space:nowrap;padding-top:1px;">${name.split(" ")[0]}:</span>
          <div style="padding:4px 10px;border-left:3px solid #f0c040;background:#fffbeb;border-radius:0 6px 6px 0;font-size:11px;color:#374151;font-style:italic;flex:1;">"${quote}"</div>
        </div>`
      ).join("")}` : ""}

      <div style="margin-top:10px;font-size:10px;color:#92400e;opacity:0.7;">
        The AI Playground gives learners unconstrained access to Claude beyond structured curriculum activities. PUE and enterprise use here is learner-initiated — not scaffolded by the curriculum.
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f8f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:760px;margin:20px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <div style="background:linear-gradient(135deg,#1a3d2b 0%,#2d6a4f 100%);padding:32px 36px;">
    <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#52b788;margin-bottom:8px;font-weight:600;">Girls AIing &amp; Vibing · Oloibiri · Davidson AI Innovation Center</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;">Monthly Assessment Report</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.55);">${monthLabel} · PUE Linkage + Longitudinal Analysis · v2.0</div>
  </div>

  <div style="padding:24px 36px;">

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;">
      ${[
        ["✅", "Assessed", successes.length, "#dcfce7", "#166534"],
        ["📊", "Sessions", totalSessions, "#dbeafe", "#1e40af"],
        ["⚡", "PUE Learner %", `${cohortAvg("pue_learner_initiated_pct")}%`, "#fef3c7", "#92400e"],
        ["🔧", "Converging", converging, "#e0f2fe", "#0369a1"],
        ["🌍", "Role-Ready", roleReady, "#f3e8ff", "#6b21a8"],
        ["🧩", "Structured L3", `${cohortAvg("reasoning_structured_pct")}%`, "#dcfce7", "#166534"],
        ["🎮", "Playground Active", playgroundActive, "#fef9c3", "#92400e"],
      ].map(([icon, label, val, bg, color]) => `
      <div style="flex:1;min-width:100px;background:${bg};border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:16px;margin-bottom:3px;">${icon}</div>
        <div style="font-size:20px;font-weight:700;color:${color};">${val}</div>
        <div style="font-size:9px;color:${color};font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">${label}</div>
      </div>`).join("")}
    </div>

    <!-- ── Column Key (above aggregate table) ───────────────────────── -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
      <div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Column Key</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px 20px;font-size:11px;color:#374151;">
        <div><strong style="color:#1a3d2b;">COG</strong> — Cognitive (comprehension, recall, conceptual grasp)</div>
        <div><strong style="color:#1a3d2b;">CT</strong> — Critical Thinking (analysis, evaluation, reasoning)</div>
        <div><strong style="color:#1a3d2b;">PS</strong> — Problem Solving (definition, iteration, solutions)</div>
        <div><strong style="color:#1a3d2b;">CRE</strong> — Creativity (originality, exploration, creative risk)</div>
        <div><strong style="color:#1a3d2b;">PUE</strong> — Productive Use of Energy (energy-enterprise reasoning)</div>
        <div><strong style="color:#1a3d2b;">AVG</strong> — Simple average of all 5 dimensions</div>
        <div><strong style="color:#1a3d2b;">Sessions</strong> — Total dashboard sessions recorded in that period</div>
        <div><strong style="color:#6b21a8;">App / Eth / Und / Ver</strong> — AI Proficiency GPT scores: Application, Ethics, Understanding, Verification (0–100)</div>
        <div><strong style="color:#92400e;">Certs</strong> — Total certifications passed by the learner (all time)</div>
      </div>
      <div style="margin-top:10px;font-size:10px;color:#6b7280;">
        Score key: &nbsp;
        <span style="background:#bbf7d0;color:#14532d;padding:1px 6px;border-radius:3px;font-weight:600;">≥75 Strong</span> &nbsp;
        <span style="background:#bfdbfe;color:#1e40af;padding:1px 6px;border-radius:3px;font-weight:600;">55–74 Developing</span> &nbsp;
        <span style="background:#fef08a;color:#713f12;padding:1px 6px;border-radius:3px;font-weight:600;">35–54 Emerging</span> &nbsp;
        <span style="background:#fecaca;color:#7f1d1d;padding:1px 6px;border-radius:3px;font-weight:600;">&lt;35 Needs Support</span> &nbsp;
        <span style="color:#52b788;font-weight:700;">●</span> = most recent assessment &nbsp;·&nbsp; ▲▼ = trend vs prior period
      </div>
    </div>

    <!-- ── Longitudinal Cohort Averages ─────────────────────────────── -->
    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:600;color:#1a3d2b;margin-bottom:4px;">Cohort Skill Averages — Longitudinal</div>
      <div style="font-size:10px;color:#6b7280;margin-bottom:12px;">All months · cohort mean · ● = ${monthLabel} (most recent)</div>
      <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:560px;">
        <thead>
          <tr style="background:#1a3d2b;">
            <th style="padding:8px 10px;text-align:left;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;white-space:nowrap;">Period</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">N</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">Cog</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">CT</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">PS</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">Cre</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">PUE</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">Avg</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">PUE%</th>
            <th style="padding:8px 10px;text-align:center;color:#a7f3d0;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">L-Init%</th>
            <th style="padding:8px 10px;text-align:center;color:#c4b5fd;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">App</th>
            <th style="padding:8px 10px;text-align:center;color:#c4b5fd;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">Eth</th>
            <th style="padding:8px 10px;text-align:center;color:#c4b5fd;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">Und</th>
            <th style="padding:8px 10px;text-align:center;color:#c4b5fd;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">Ver</th>
            <th style="padding:8px 10px;text-align:center;color:#fde68a;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;">Certs</th>
          </tr>
        </thead>
        <tbody>
          ${cohortHistory.map((row, i) => {
            const isLatest = i === cohortHistory.length - 1;
            const rowAvg = Math.round((row.cognitive_score + row.critical_thinking_score + row.problem_solving_score + row.creativity_score + row.pue_score) / 5);
            // Trend arrow vs previous month
            let trend = "";
            if (i > 0) {
              const prev = cohortHistory[i - 1];
              const prevAvg = Math.round((prev.cognitive_score + prev.critical_thinking_score + prev.problem_solving_score + prev.creativity_score + prev.pue_score) / 5);
              const diff = rowAvg - prevAvg;
              if (diff > 0) trend = `<span style="color:#166534;font-size:9px;"> ▲${diff}</span>`;
              else if (diff < 0) trend = `<span style="color:#991b1b;font-size:9px;"> ▼${Math.abs(diff)}</span>`;
            }
            return `<tr style="${isLatest ? "background:rgba(82,183,136,0.08);font-weight:600;" : i % 2 === 0 ? "background:#fff;" : "background:#f8fafc;"}border-top:1px solid #e5e7eb;">
              <td style="padding:8px 10px;font-family:monospace;font-size:11px;color:${isLatest ? "#1a3d2b" : "#6b7280"};white-space:nowrap;">${isLatest ? "● " : ""}${row.monthLabel}</td>
              <td style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;">${row.learnerCount}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.cognitive_score)}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.critical_thinking_score)}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.problem_solving_score)}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.creativity_score)}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.pue_score)}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(rowAvg)}${trend}</td>
              <td style="padding:8px 10px;text-align:center;font-family:monospace;font-size:11px;color:#374151;">${row.pue_energy_constraint_pct}%</td>
              <td style="padding:8px 10px;text-align:center;font-family:monospace;font-size:11px;color:${row.pue_learner_initiated_pct >= 20 ? "#065f46" : "#374151"};">${row.pue_learner_initiated_pct}%</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.ai_prof_application_gpt)}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.ai_prof_ethics_gpt)}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.ai_prof_understanding_gpt)}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(row.ai_prof_verification_gpt)}</td>
              <td style="padding:8px 10px;text-align:center;font-family:monospace;font-size:11px;color:${row.cert_passed_pct > 0 ? "#166534" : "#9ca3af"};">${row.cert_passed_pct}%</td>
            </tr>`;
          }).join("")}
          ${cohortHistory.length > 1 ? (() => {
            // All-time aggregate row
            const n = cohortHistory.length;
            const allAvg = (field: keyof CohortMonthRecord) =>
              Math.round(cohortHistory.reduce((a, r) => a + (Number(r[field]) || 0), 0) / n);
            const overallAvg = Math.round((allAvg("cognitive_score") + allAvg("critical_thinking_score") + allAvg("problem_solving_score") + allAvg("creativity_score") + allAvg("pue_score")) / 5);
            const totalLearners = Math.max(...cohortHistory.map(r => r.learnerCount));
            return `<tr style="background:#1a3d2b;border-top:2px solid #2d6a4f;">
              <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#a7f3d0;white-space:nowrap;">All-Time Avg</td>
              <td style="padding:8px 10px;text-align:center;font-size:11px;color:#52b788;">${totalLearners}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("cognitive_score"))}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("critical_thinking_score"))}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("problem_solving_score"))}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("creativity_score"))}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("pue_score"))}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(overallAvg)}</td>
              <td style="padding:8px 10px;text-align:center;font-family:monospace;font-size:11px;color:#52b788;">${allAvg("pue_energy_constraint_pct")}%</td>
              <td style="padding:8px 10px;text-align:center;font-family:monospace;font-size:11px;color:#52b788;">${allAvg("pue_learner_initiated_pct")}%</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("ai_prof_application_gpt"))}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("ai_prof_ethics_gpt"))}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("ai_prof_understanding_gpt"))}</td>
              <td style="padding:8px 10px;text-align:center;">${sc(allAvg("ai_prof_verification_gpt"))}</td>
              <td style="padding:8px 10px;text-align:center;font-family:monospace;font-size:11px;color:#fde68a;font-weight:700;">${cohortHistory.reduce((a, r) => a + (r.cert_passed_pct || 0), 0)}</td>
            </tr>`;
          })() : ""}
        </tbody>
      </table>
      </div>
    </div>

    <div style="background:#f0fff4;border:1px solid #a7f3d0;border-radius:10px;padding:16px;margin-bottom:24px;">
      <div style="font-size:12px;font-weight:600;color:#065f46;margin-bottom:8px;">⚡ Cohort PUE Linkage — ${monthLabel}</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:11px;color:#374151;line-height:1.8;">
        <div>🔋 Energy Constraint: <strong>${cohortAvg("pue_energy_constraint_pct")}%</strong></div>
        <div>📈 Market Pricing: <strong>${cohortAvg("pue_market_pricing_pct")}%</strong></div>
        <div>🏪 Enterprise Planning: <strong>${cohortAvg("pue_enterprise_planning_pct")}%</strong></div>
        <div>🗣 Learner-Initiated: <strong>${cohortAvg("pue_learner_initiated_pct")}%</strong></div>
        <div>🤖 AI-Introduced: <strong>${cohortAvg("pue_ai_introduced_pct")}%</strong></div>
        <div>🌐 Multi-Domain: <strong>${cohortAvg("pue_multi_domain_pct")}%</strong></div>
        <div>📍 Local Context: <strong>${cohortAvg("pue_local_context_pct")}%</strong></div>
      </div>
    </div>

    <!-- ── Cohort Playground Summary ───────────────────────────────── -->
    ${cohortPlaygroundHtml}

    <!-- ── Individual Learner section heading ──────────────────────── -->
    <div style="margin-bottom:16px;">
      <div style="font-size:13px;font-weight:600;color:#1a3d2b;">Individual Learner Progress — Longitudinal View</div>
    </div>

    ${userCards || `<div style="background:#fef9c3;border-radius:8px;padding:16px;color:#854d0e;font-size:13px;">No new assessments this period.</div>`}

    <div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:11px;">
      <div>⏱️ ${(durationMs/1000).toFixed(1)}s &nbsp;·&nbsp; 🤖 Claude Sonnet 4.6 &nbsp;·&nbsp; 🌍 Africa cohort &nbsp;·&nbsp;
        <a href="https://girls-aiing-and-vibing.vercel.app" style="color:#2d6a4f;text-decoration:none;">Open App ↗</a></div>
      <div style="margin-top:3px;">v2.1 captures PUE domain linkage, scaffolding convergence, reasoning levels, metacognition, role readiness, enterprise artifacts, AI Proficiency scores (formal + GPT), and certification summaries.</div>
    </div>
  </div>
</div>
</body></html>`;
}

// ─── Email Sender ─────────────────────────────────────────────────────────────

async function sendEmailReport(
  monthLabel: string,
  summaries: AssessmentSummary[],
  startDate: Date,
  endDate: Date,
  durationMs: number
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) { console.warn("⚠️  RESEND_API_KEY not set"); return; }

  // Broadened: Africa continent OR vAI org OR Solardero org OR Oloibiri org
  const VAI_ORG_ID_SEND       = 'c0b48eae-67af-449d-8c04-cc6950bf0982';
  const SOLARDERO_ORG_ID_SEND = 'a1b2c3d4-0002-0002-0002-000000000002';
  const OLOIBIRI_ORG_ID_SEND  = 'a1b2c3d4-0001-0001-0001-000000000001';
  const { data: africanProfiles } = await supabase
    .from("profiles").select("id, name")
    .or(`continent.eq.Africa,organization_id.eq.${VAI_ORG_ID_SEND},organization_id.eq.${SOLARDERO_ORG_ID_SEND},organization_id.eq.${OLOIBIRI_ORG_ID_SEND}`);

  const nameMap: Record<string, string> = {};
  for (const p of africanProfiles || []) nameMap[p.id] = p.name || "Unknown";
  const allIds = (africanProfiles || []).map((p) => p.id);

  const { data: anyAssessments } = await supabase
    .from("user_monthly_assessments").select("user_id").in("user_id", allIds);
  const idsWithHistory = [...new Set((anyAssessments || []).map((a) => a.user_id))]
    .filter((id): id is string => !EXCLUDED_USER_IDS.has(id as string));
  const historyMap = await fetchAllHistoricalData(idsWithHistory);

  const summaryMap = new Map(summaries.map((s) => [s.userId, s]));
  const allSummaries: AssessmentSummary[] = idsWithHistory.map((id) => {
    if (summaryMap.has(id)) { const s = summaryMap.get(id)!; s.name = nameMap[id] || "Unknown"; return s; }
    return { userId: id, name: nameMap[id] || "Unknown", sessionCount: 0, engagedSessionCount: 0, scores: null, status: "skipped" };
  });

  const newCount = summaries.filter((s) => s.status === "success").length;
  // Fetch playground summaries for all assessed users
  const playgroundMap = new Map<string, PlaygroundSummary | null>();
  const assessedIds = allSummaries.filter((s) => s.status === "success").map((s) => s.userId);
  await Promise.all(
    assessedIds.map(async (id) => {
      const pg = await fetchPlaygroundSummary(id, startDate, endDate);
      playgroundMap.set(id, pg);
    })
  );

  // Fetch all-time cohort history for the longitudinal averages table
  let cohortHistory: CohortMonthRecord[] = [];
  try {
    cohortHistory = await fetchCohortHistory(EXCLUDED_USER_IDS);
    console.log(`   Cohort history: ${cohortHistory.length} months loaded`);
  } catch (err: any) {
    console.warn("   Cohort history fetch failed (non-fatal):", err.message);
  }

  const html = buildEmailHtml(monthLabel, allSummaries, historyMap, playgroundMap, cohortHistory, durationMs);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Girls AIing & Vibing <onboarding@resend.dev>",
      to: ["khallinan1@udayton.edu"],
      subject: `📊 Monthly Report — ${monthLabel} · ${newCount} assessed · ${idsWithHistory.length} learners total`,
      html,
    }),
  });

  if (!res.ok) console.error("❌ Resend error:", await res.text());
  else console.log("✉️  Email sent to khallinan1@udayton.edu");
}

// ─── Global Summary Rollup ────────────────────────────────────────────────────
//
// Reads per-user rows already written to user_monthly_assessments and rolls
// them up into assessments_monthly_global — one row per org + one NULL-org
// platform-wide row. Called automatically after the email sends in orchestrate
// mode. RLS is bypassed because we run with SUPABASE_SERVICE_ROLE_KEY.

async function generateGlobalSummary(
  startDate:  Date,
  endDate:    Date,
  monthLabel: string
): Promise<void> {
  console.log(`\n📊 [globalSummary] Building summary for ${monthLabel}...`);

  // 1. All assessed rows for this period
  const { data: rows, error: rowErr } = await supabase
    .from("user_monthly_assessments")
    .select(`
      user_id,
      cognitive_score, critical_thinking_score,
      problem_solving_score, creativity_score, pue_score,
      pue_learner_initiated_pct,
      pue_energy_constraint_pct, pue_market_pricing_pct,
      pue_battery_load_pct, pue_enterprise_planning_pct,
      pue_ai_introduced_pct, pue_multi_domain_pct, pue_local_context_pct,
      scaffold_convergence_trend,
      reasoning_structured_pct,
      role_teaching_intent_count, role_community_application_count,
      role_enterprise_orientation_count, role_intergenerational_count,
      ai_prof_application_score, ai_prof_ethics_score,
      ai_prof_understanding_score, ai_prof_verification_score,
      cert_passed_count
    `)
    .gte("measured_at", startDate.toISOString())
    .lte("measured_at", endDate.toISOString());

  if (rowErr || !rows?.length) {
    console.warn(`⚠️  [globalSummary] No rows for ${monthLabel} — skipping`);
    return;
  }

  const userIds = rows.map(r => r.user_id);

  // 2. Org + continent per user
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, organization_id, continent")
    .in("id", userIds);

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  // 3. Session count for period
  const { data: sessionRows } = await supabase
    .from("dashboard")
    .select("user_id", { count: "exact", head: false })
    .in("user_id", userIds)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  const totalSessions = sessionRows?.length ?? 0;

  // 4. All-time certifications per user
  // These are distinct from AI-tutored sessions — no AI scaffolding involved.
  // cert_passed_count on user_monthly_assessments is the authoritative source
  // (populated by the cert pipeline inside assessMonthlySkills).
  // We sum it here rather than re-querying dashboard to avoid double-counting.
  const certsByOrg = new Map<string | null, number>();
  for (const r of rows) {
    const orgId = profileMap.get(r.user_id)?.organization_id ?? null;
    const n = r.cert_passed_count ?? 0;
    certsByOrg.set(null,  (certsByOrg.get(null)  ?? 0) + n); // platform total
    if (orgId) certsByOrg.set(orgId, (certsByOrg.get(orgId) ?? 0) + n);
  }

  // 5. Total enrolled learners
  const { data: allAfrica } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("continent", "Africa");

  const enrolledByOrg = new Map<string | null, number>();
  let totalEnrolled = 0;
  for (const p of allAfrica || []) {
    totalEnrolled++;
    const orgId = p.organization_id ?? null;
    enrolledByOrg.set(orgId, (enrolledByOrg.get(orgId) ?? 0) + 1);
  }

  // 6. Prior month avg_mean for delta
  const priorEnd   = new Date(startDate.getTime() - 1);
  const priorStart = new Date(priorEnd.getFullYear(), priorEnd.getMonth(), 1);
  const { data: priorRows } = await supabase
    .from("assessments_monthly_global")
    .select("organization_id, avg_mean")
    .gte("period_start", priorStart.toISOString().split("T")[0])
    .lte("period_end",   priorEnd.toISOString().split("T")[0]);

  const priorByOrg = new Map(
    (priorRows || []).map(r => [r.organization_id ?? "null", r.avg_mean as number | null])
  );

  // 7. Group: one entry per org + NULL for platform-wide
  type Row = typeof rows[0];
  const groups = new Map<string | null, Row[]>();
  groups.set(null, rows);
  for (const r of rows) {
    const orgId = profileMap.get(r.user_id)?.organization_id ?? null;
    if (orgId) {
      if (!groups.has(orgId)) groups.set(orgId, []);
      groups.get(orgId)!.push(r);
    }
  }

  // Helpers
  const avg = (vals: (number | null)[]): number | null => {
    const clean = vals.filter((v): v is number => v !== null);
    return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
  };
  const fmt = (n: number | null) => n !== null ? parseFloat(n.toFixed(2)) : null;
  const bandDist = (vals: (number | null)[]) => ({
    needs_support: vals.filter(v => v !== null && v <  35).length,
    emerging:      vals.filter(v => v !== null && v >= 35 && v < 55).length,
    developing:    vals.filter(v => v !== null && v >= 55 && v < 75).length,
    strong:        vals.filter(v => v !== null && v >= 75).length,
  });

  // 8. Upsert one row per group
  for (const [orgId, grp] of groups.entries()) {
    const cogMean = avg(grp.map(r => r.cognitive_score));
    const ctMean  = avg(grp.map(r => r.critical_thinking_score));
    const psMean  = avg(grp.map(r => r.problem_solving_score));
    const creMean = avg(grp.map(r => r.creativity_score));
    const pueMean = avg(grp.map(r => r.pue_score));
    const avgMean = (cogMean !== null && ctMean !== null && psMean !== null &&
                     creMean !== null && pueMean !== null)
      ? (cogMean + ctMean + psMean + creMean + pueMean) / 5 : null;

    const priorAvg = priorByOrg.get(orgId ?? "null") ?? null;
    const avgDelta = (avgMean !== null && priorAvg !== null) ? avgMean - priorAvg : null;

    // PUE linkage — learner touched a PUE domain this period
    const pueLinked   = grp.filter(r => (r.pue_learner_initiated_pct ?? 0) > 0).length;
    const pueLearnerPct = grp.length ? (pueLinked / grp.length) * 100 : 0;

    // Role-readiness — any non-zero role signal
    const roleReadyCount = grp.filter(r =>
      (r.role_teaching_intent_count        ?? 0) > 0 ||
      (r.role_community_application_count  ?? 0) > 0 ||
      (r.role_enterprise_orientation_count ?? 0) > 0 ||
      (r.role_intergenerational_count      ?? 0) > 0
    ).length;

    const continent = orgId
      ? ([...new Set(grp.map(r => profileMap.get(r.user_id)?.continent).filter(Boolean))][0] ?? null)
      : "Africa";

    const record = {
      period_start:    startDate.toISOString().split("T")[0],
      period_end:      endDate.toISOString().split("T")[0],
      period_label:    monthLabel,
      organization_id: orgId,
      continent,
      learner_count:   orgId ? (enrolledByOrg.get(orgId) ?? grp.length) : totalEnrolled,
      assessed_count:  grp.length,
      sessions_count:  totalSessions,

      cognitive_mean:           fmt(cogMean),
      critical_thinking_mean:   fmt(ctMean),
      problem_solving_mean:     fmt(psMean),
      creativity_mean:          fmt(creMean),
      pue_mean:                 fmt(pueMean),
      avg_mean:                 fmt(avgMean),
      avg_delta:                fmt(avgDelta),

      ai_prof_application_mean:   fmt(avg(grp.map(r => r.ai_prof_application_score))),
      ai_prof_ethics_mean:        fmt(avg(grp.map(r => r.ai_prof_ethics_score))),
      ai_prof_understanding_mean: fmt(avg(grp.map(r => r.ai_prof_understanding_score))),
      ai_prof_verification_mean:  fmt(avg(grp.map(r => r.ai_prof_verification_score))),

      pue_learner_pct:            fmt(pueLearnerPct),
      learner_initiated_pct:      fmt(avg(grp.map(r => r.pue_learner_initiated_pct))),
      energy_constraint_pct:      fmt(avg(grp.map(r => r.pue_energy_constraint_pct))),
      market_pricing_pct:         fmt(avg(grp.map(r => r.pue_market_pricing_pct))),
      enterprise_planning_pct:    fmt(avg(grp.map(r => r.pue_enterprise_planning_pct))),
      multi_domain_pct:           fmt(avg(grp.map(r => r.pue_multi_domain_pct))),
      local_context_pct:          fmt(avg(grp.map(r => r.pue_local_context_pct))),
      ai_introduced_pct:          fmt(avg(grp.map(r => r.pue_ai_introduced_pct))),

      role_ready_count:   roleReadyCount,
      converging_count:   grp.filter(r => r.scaffold_convergence_trend === "converging").length,
      structured_l3_pct:  fmt(avg(grp.map(r => r.reasoning_structured_pct))),

      // Certifications — no AI scaffolding, sourced from cert pipeline
      certs_total: certsByOrg.get(orgId) ?? 0,

      cognitive_dist:         bandDist(grp.map(r => r.cognitive_score)),
      critical_thinking_dist: bandDist(grp.map(r => r.critical_thinking_score)),
      problem_solving_dist:   bandDist(grp.map(r => r.problem_solving_score)),
      creativity_dist:        bandDist(grp.map(r => r.creativity_score)),
      pue_dist:               bandDist(grp.map(r => r.pue_score)),

      assessment_model: "claude-sonnet-4-6",
      notes: null,
    };

    const { error: upsertErr } = await supabase
      .from("assessments_monthly_global")
      .upsert(record, { onConflict: "period_start,organization_id" });

    if (upsertErr) {
      console.error(`❌ [globalSummary] org=${orgId ?? "ALL"}: ${upsertErr.message}`);
    } else {
      console.log(
        `✅ [globalSummary] org=${orgId ?? "ALL"} | n=${grp.length} | ` +
        `avg=${fmt(avgMean) ?? "—"} | delta=${avgDelta !== null ? (avgDelta >= 0 ? "+" : "") + avgDelta.toFixed(1) : "—"} | ` +
        `role_ready=${roleReadyCount} | converging=${grp.filter(r => r.scaffold_convergence_trend === "converging").length} | ` +
        `certs=${certsByOrg.get(orgId) ?? 0}`
      );
    }
  }

  console.log(`📊 [globalSummary] Complete — ${groups.size} group(s) written\n`);
}

// ─── Handler ─────────────────────────────────────────────────────────────────
//
//  Five modes, controlled by query params:
//
//  1. ORCHESTRATE (default) — cron: 0 2 1 * *
//     curl /api/assess-monthly?start=YYYY-MM-DD&end=YYYY-MM-DD
//     → Builds transcripts for all users, submits ONE Anthropic batch request,
//       returns batchId immediately (no polling — avoids Vercel timeout).
//
//  2. SINGLE USER
//     curl /api/assess-monthly?start=...&end=...&userId=UUID
//     → Assesses one user directly (no batch). Used for small/test runs.
//
//  3. POLL
//     curl /api/assess-monthly?start=...&end=...&mode=poll&batchId=msgbatch_xxx
//     → Checks if batch is done. If ended, fetches results and saves to DB.
//       Returns 200 with processing_status if still running — call again in 30s.
//
//  4. REPORT
//     curl /api/assess-monthly?start=...&end=...&mode=report
//     → Reads saved DB rows for the period and sends the email report.
//
//  5. POLL-AND-REPORT (automated) — cron: 0 4 1 * *
//     curl /api/assess-monthly?mode=poll-and-report
//     → Finds the most recent Anthropic batch, waits for it to be ended,
//       saves all results to DB, then sends the email report automatically.
//       Designed to run 2 hours after ORCHESTRATE — batch will always be done.
//       No batchId required — looks up the latest batch from Anthropic API.
//
//  Automatic monthly sequence (via vercel.json crons):
//    02:00 UTC on 1st → ORCHESTRATE  (submits batch)
//    04:00 UTC on 1st → POLL-AND-REPORT (saves results + sends email)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManualTrigger = req.headers["x-cron-secret"] === cronSecret && !!cronSecret;
  if (!isVercelCron && !isManualTrigger) return res.status(401).json({ error: "Unauthorized" });

  const qStart = req.query.start as string | undefined;
  const qEnd   = req.query.end   as string | undefined;
  const qUser  = req.query.userId as string | undefined;
  const qMode  = req.query.mode  as string | undefined;

  let startDate: Date, endDate: Date;
  if (qStart && qEnd) {
    startDate = new Date(`${qStart}T00:00:00.000Z`);
    endDate   = new Date(`${qEnd}T23:59:59.999Z`);
  } else {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  }

  const startStr  = startDate.toISOString().split("T")[0];
  const endStr    = endDate.toISOString().split("T")[0];
  const monthLabel = startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const baseUrl   = `https://${req.headers.host}/api/assess-monthly`;
  const authHeader = { "x-cron-secret": cronSecret! };

  // ── MODE 2: Single-user assessment ────────────────────────────────────────
  if (qUser) {
    console.log(`[single-user] Assessing ${qUser}`);
    try {
      const { result, sessionCount, engagedSessionCount, status, error } =
        await assessMonthlySkills(qUser, startDate, endDate);
      console.log(`[single-user] → ${status} | sessions: ${sessionCount}`);
      return res.status(200).json({ userId: qUser, status, sessionCount, engagedSessionCount, error });
    } catch (err: any) {
      console.error(`[single-user] Fatal for ${qUser}:`, err.message);
      return res.status(500).json({ userId: qUser, status: "error", error: err.message });
    }
  }

  // ── MODE 3: Report only ────────────────────────────────────────────────────
  if (qMode === "report") {
    console.log(`[report] Building email for ${monthLabel}`);
    const startTime = Date.now();
    try {
      // Broadened: Africa continent OR vAI org OR Solardero org OR Oloibiri org
      const VAI_ORG_ID_RPT       = 'c0b48eae-67af-449d-8c04-cc6950bf0982';
      const SOLARDERO_ORG_ID_RPT = 'a1b2c3d4-0002-0002-0002-000000000002';
      const OLOIBIRI_ORG_ID_RPT  = 'a1b2c3d4-0001-0001-0001-000000000001';
      const { data: africanProfiles } = await supabase
        .from("profiles").select("id, name")
        .or(`continent.eq.Africa,organization_id.eq.${VAI_ORG_ID_RPT},organization_id.eq.${SOLARDERO_ORG_ID_RPT},organization_id.eq.${OLOIBIRI_ORG_ID_RPT}`);
      const nameMap: Record<string, string> = {};
      for (const p of africanProfiles || []) nameMap[p.id] = p.name || "Unknown";
      const allIds = (africanProfiles || []).map((p) => p.id)
        .filter((id) => !EXCLUDED_USER_IDS.has(id));

      // Load assessments saved for this period
      const { data: periodRows } = await supabase
        .from("user_monthly_assessments")
        .select("*")
        .in("user_id", allIds)
        .gte("measured_at", startDate.toISOString())
        .lte("measured_at", endDate.toISOString());

      const reportSummaries: AssessmentSummary[] = (periodRows || []).map((row) => ({
        userId: row.user_id,
        name: nameMap[row.user_id] || "Unknown",
        sessionCount: row.session_count || 0,
        engagedSessionCount: row.engaged_session_count || 0,
        scores: row as unknown as MonthlySkillsResult,
        status: "success" as const,
      }));

      const idsWithHistory = [...new Set((periodRows || []).map((r) => r.user_id))] as string[];
      const reportHistoryMap = await fetchAllHistoricalData(idsWithHistory);

      const reportPlaygroundMap = new Map<string, PlaygroundSummary | null>();
      await Promise.all(
        idsWithHistory.map(async (id) => {
          reportPlaygroundMap.set(id, await fetchPlaygroundSummary(id, startDate, endDate));
        })
      );

      let cohortHistory: CohortMonthRecord[] = [];
      try { cohortHistory = await fetchCohortHistory(EXCLUDED_USER_IDS); } catch { /* non-fatal */ }

      const durationMs = Date.now() - startTime;
      await sendEmailReport(monthLabel, reportSummaries, startDate, endDate, durationMs);

      return res.status(200).json({
        mode: "report",
        month: monthLabel,
        assessed: reportSummaries.length,
        durationMs,
      });
    } catch (err: any) {
      console.error("[report] Fatal:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── MODE 5: Poll-and-Report (automated cron at 4 AM on 1st) ────────────────
  // Finds the most recent Anthropic batch, checks it is ended, saves all
  // results to DB, then sends the email report. No batchId needed — looks up
  // the latest batch automatically. Runs 2 hours after ORCHESTRATE so the
  // batch is guaranteed to be complete.
  if (qMode === "poll-and-report") {
    console.log(`[poll-and-report] Auto mode for ${monthLabel}`);
    const startTime = Date.now();

    try {
      // Step A: Find the most recently submitted batch from Anthropic
      const listRes = await fetch("https://api.anthropic.com/v1/messages/batches?limit=5", {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "message-batches-2024-09-24",
        },
      });

      if (!listRes.ok) {
        const err = await listRes.json();
        throw new Error(`Failed to list batches: ${JSON.stringify(err)}`);
      }

      const listData = await listRes.json();
      const batches = listData.data || [];

      // Find the most recent batch that is ended (or still processing)
      const latestBatch = batches[0];
      if (!latestBatch) throw new Error("No batches found in Anthropic account");

      console.log(`[poll-and-report] Latest batch: ${latestBatch.id} status: ${latestBatch.processing_status}`);

      // If still processing (shouldn't happen at 4 AM but handle gracefully)
      if (latestBatch.processing_status !== "ended") {
        console.warn(`[poll-and-report] Batch ${latestBatch.id} still processing — this is unexpected at 4 AM`);
        return res.status(200).json({
          mode: "poll-and-report",
          batchId: latestBatch.id,
          processing_status: latestBatch.processing_status,
          message: "Batch not yet ended — try again in 10 minutes",
        });
      }

      // Step B: Fetch batch results JSONL
      const resultsRes = await fetch(latestBatch.results_url, {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "message-batches-2024-09-24",
        },
      });

      const resultsText = await resultsRes.text();
      const batchResults = new Map<string, string>();
      for (const line of resultsText.trim().split("\n")) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (r.result?.type === "succeeded") {
            batchResults.set(r.custom_id, r.result.message.content[0].text);
          } else {
            console.warn(`[poll-and-report] Failed result for ${r.custom_id}:`, r.result?.error);
          }
        } catch { /* skip malformed line */ }
      }

      console.log(`[poll-and-report] ${batchResults.size} results fetched from batch ${latestBatch.id}`);

      // Step C: Load batch job metadata from DB
      let userIds: string[] = [];
      let sessionCounts: Record<string, number> = {};
      let engagedCounts: Record<string, number> = {};
      let pgCounts: Record<string, number> = {};
      try {
        const { data: jobRow } = await supabase
          .from("batch_jobs").select("*").eq("batch_id", latestBatch.id).single();
        if (jobRow) {
          userIds = (jobRow.user_ids || []) as string[];
          sessionCounts = jobRow.session_counts || {};
          engagedCounts = jobRow.engaged_counts || {};
          pgCounts = jobRow.pg_counts || {};
        }
      } catch { /* batch_jobs table may not exist — fall back to batchResults keys */ }

      if (!userIds.length) userIds = [...batchResults.keys()] as string[];

      // Step D: Process and save each result to DB
      let succeeded = 0; let failed = 0;
      await Promise.allSettled(
        userIds.map(async (userId) => {
          const content = batchResults.get(userId);
          if (!content) {
            failed++;
            console.warn(`[poll-and-report] No result for ${userId.slice(0, 8)}`);
            return;
          }
          try {
            const clean = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
            const raw = JSON.parse(clean);
            const artifactScore =
              (raw.enterprise_artifact_goal_score || 0) + (raw.enterprise_artifact_resource_score || 0) +
              (raw.enterprise_artifact_plan_score || 0) + (raw.enterprise_artifact_constraint_score || 0) +
              (raw.enterprise_artifact_quant_score || 0) + (raw.enterprise_artifact_risk_score || 0);

            const result: MonthlySkillsResult = {
              ...raw, enterprise_artifact_score: artifactScore,
              ai_playground_session_count: pgCounts[userId] || 0,
              ai_playground_word_count: raw.ai_playground_word_count || 0,
              ai_playground_summary: raw.ai_playground_summary || "No AI Playground activity recorded this period.",
              ai_prof_application_gpt: raw.ai_prof_application_gpt || 0,
              ai_prof_ethics_gpt: raw.ai_prof_ethics_gpt || 0,
              ai_prof_understanding_gpt: raw.ai_prof_understanding_gpt || 0,
              ai_prof_verification_gpt: raw.ai_prof_verification_gpt || 0,
              ai_prof_gpt_narrative: raw.ai_prof_gpt_narrative || "",
              ai_prof_application_score: null, ai_prof_ethics_score: null,
              ai_prof_understanding_score: null, ai_prof_verification_score: null,
              ai_prof_cert_level: "Not Attempted",
              cert_attempted_count: 0, cert_passed_count: 0,
              cert_names_attempted: [], cert_names_passed: [], cert_avg_score: null, cert_summary: "",
            };

            const certData = await fetchUserCertData(userId);
            let certSummary = "No certifications attempted yet.";
            if (certData.cert_attempted_count > 0) {
              try {
                certSummary = await callClaudeHaiku(
                  "You write concise, encouraging educational progress summaries.",
                  `Write a 2-sentence summary for a monthly report about a learner certification activity at an AI learning lab in rural Nigeria.
Certifications attempted: ${certData.cert_names_attempted.join(", ")}
Certifications passed (score >= 2.25/3): ${certData.cert_names_passed.length > 0 ? certData.cert_names_passed.join(", ") : "None yet"}
Average cert score: ${certData.cert_avg_score ?? "N/A"}/3
AI Proficiency cert level: ${certData.ai_prof_cert_level}
AI Proficiency dimension scores (0-3): Application=${certData.ai_prof_application_score ?? "N/A"}, Ethics=${certData.ai_prof_ethics_score ?? "N/A"}, Understanding=${certData.ai_prof_understanding_score ?? "N/A"}, Verification=${certData.ai_prof_verification_score ?? "N/A"}
Be encouraging and specific. Note strongest and weakest dimensions if AI Proficiency scores exist.`,
                  150
                );
              } catch { /* non-fatal */ }
            }

            result.cert_attempted_count = certData.cert_attempted_count;
            result.cert_passed_count = certData.cert_passed_count;
            result.cert_names_attempted = certData.cert_names_attempted;
            result.cert_names_passed = certData.cert_names_passed;
            result.cert_avg_score = certData.cert_avg_score;
            result.cert_summary = certSummary;
            result.ai_prof_application_score = certData.ai_prof_application_score;
            result.ai_prof_ethics_score = certData.ai_prof_ethics_score;
            result.ai_prof_understanding_score = certData.ai_prof_understanding_score;
            result.ai_prof_verification_score = certData.ai_prof_verification_score;
            result.ai_prof_cert_level = certData.ai_prof_cert_level;

            const { error: insertError } = await supabase.from("user_monthly_assessments").insert({
              user_id: userId, measured_at: endDate.toISOString(),
              assessment_model: "claude-sonnet-4-6-batch", assessment_version: "v2.1",
              session_count: sessionCounts[userId] || 0,
              engaged_session_count: engagedCounts[userId] || 0,
              cognitive_score: result.cognitive_score, cognitive_evidence: result.cognitive_evidence,
              critical_thinking_score: result.critical_thinking_score, critical_thinking_evidence: result.critical_thinking_evidence,
              problem_solving_score: result.problem_solving_score, problem_solving_evidence: result.problem_solving_evidence,
              creativity_score: result.creativity_score, creativity_evidence: result.creativity_evidence,
              pue_score: result.pue_score, pue_evidence: result.pue_evidence_quotes,
              pue_energy_constraint_pct: result.pue_energy_constraint_pct, pue_market_pricing_pct: result.pue_market_pricing_pct,
              pue_battery_load_pct: result.pue_battery_load_pct, pue_enterprise_planning_pct: result.pue_enterprise_planning_pct,
              pue_learner_initiated_pct: result.pue_learner_initiated_pct, pue_ai_introduced_pct: result.pue_ai_introduced_pct,
              pue_multi_domain_pct: result.pue_multi_domain_pct, pue_local_context_pct: result.pue_local_context_pct,
              pue_summary: result.pue_summary,
              scaffold_clarification_per_session: result.scaffold_clarification_per_session,
              scaffold_decomposition_per_session: result.scaffold_decomposition_per_session,
              scaffold_correction_total_per_session: result.scaffold_correction_total_per_session,
              scaffold_explicit_correction_per_session: result.scaffold_explicit_correction_per_session,
              scaffold_gentle_redirect_per_session: result.scaffold_gentle_redirect_per_session,
              scaffold_consecutive_correction_runs: result.scaffold_consecutive_correction_runs,
              scaffold_convergence_trend: result.scaffold_convergence_trend,
              scaffold_convergence_narrative: result.scaffold_convergence_narrative,
              reasoning_definitional_pct: result.reasoning_definitional_pct,
              reasoning_responsive_pct: result.reasoning_responsive_pct,
              reasoning_elaborative_pct: result.reasoning_elaborative_pct,
              reasoning_structured_pct: result.reasoning_structured_pct,
              reasoning_chain_count: result.reasoning_chain_count,
              metacog_verification_rate: result.metacog_verification_rate,
              metacog_reactive_rate: result.metacog_reactive_rate,
              metacog_strategic_rate: result.metacog_strategic_rate,
              metacog_narrative: result.metacog_narrative,
              role_teaching_intent_count: result.role_teaching_intent_count,
              role_community_application_count: result.role_community_application_count,
              role_enterprise_orientation_count: result.role_enterprise_orientation_count,
              role_intergenerational_count: result.role_intergenerational_count,
              role_readiness_narrative: result.role_readiness_narrative,
              role_readiness_signals: result.role_readiness_signals,
              enterprise_artifact_score: result.enterprise_artifact_score,
              enterprise_artifact_goal_score: result.enterprise_artifact_goal_score,
              enterprise_artifact_resource_score: result.enterprise_artifact_resource_score,
              enterprise_artifact_plan_score: result.enterprise_artifact_plan_score,
              enterprise_artifact_constraint_score: result.enterprise_artifact_constraint_score,
              enterprise_artifact_quant_score: result.enterprise_artifact_quant_score,
              enterprise_artifact_risk_score: result.enterprise_artifact_risk_score,
              enterprise_artifact_evidence: result.enterprise_artifact_evidence,
              ai_playground_session_count: result.ai_playground_session_count,
              ai_playground_word_count: result.ai_playground_word_count,
              ai_playground_summary: result.ai_playground_summary,
              ai_prof_application_score: certData.ai_prof_application_score,
              ai_prof_ethics_score: certData.ai_prof_ethics_score,
              ai_prof_understanding_score: certData.ai_prof_understanding_score,
              ai_prof_verification_score: certData.ai_prof_verification_score,
              ai_prof_min_score: certData.ai_prof_min_score,
              ai_prof_cert_level: certData.ai_prof_cert_level,
              ai_prof_application_gpt: result.ai_prof_application_gpt,
              ai_prof_ethics_gpt: result.ai_prof_ethics_gpt,
              ai_prof_understanding_gpt: result.ai_prof_understanding_gpt,
              ai_prof_verification_gpt: result.ai_prof_verification_gpt,
              ai_prof_gpt_narrative: result.ai_prof_gpt_narrative,
              cert_attempted_count: result.cert_attempted_count,
              cert_passed_count: result.cert_passed_count,
              cert_names_attempted: result.cert_names_attempted,
              cert_names_passed: result.cert_names_passed,
              cert_avg_score: result.cert_avg_score,
              cert_summary: result.cert_summary,
            });

            if (insertError) throw insertError;
            succeeded++;
            console.log(`[poll-and-report] ✓ ${userId.slice(0, 8)} saved`);
          } catch (err: any) {
            failed++;
            console.error(`[poll-and-report] ✗ ${userId.slice(0, 8)}: ${err.message}`);
          }
        })
      );

      console.log(`[poll-and-report] DB save complete: ${succeeded} succeeded, ${failed} failed`);

      // Step E: Send the email report
      // sendEmailReport reads from DB directly — pass succeeded count as synthetic summaries
      // so the email subject shows the correct new assessment count
      const syntheticSummaries: AssessmentSummary[] = Array(succeeded).fill({
        userId: '', name: '', sessionCount: 0, engagedSessionCount: 0,
        scores: null, status: 'success' as const,
      });
      await sendEmailReport(monthLabel, syntheticSummaries, startDate, endDate, Date.now() - startTime);

      return res.status(200).json({
        mode: "poll-and-report",
        month: monthLabel,
        batchId: latestBatch.id,
        succeeded,
        failed,
        durationMs: Date.now() - startTime,
        message: `${succeeded} learners saved and email report sent for ${monthLabel}.`,
      });
    } catch (err: any) {
      console.error("[poll-and-report] Fatal:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── MODE 4: Poll batch results + save to DB ──────────────────────────────
  // Call after orchestrate returns a batchId. Checks Anthropic batch status,
  // fetches results when done, saves each learner to DB.
  // Usage: ?mode=poll&batchId=msgbatch_xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
  if (qMode === "poll") {
    const batchId = req.query.batchId as string | undefined;
    if (!batchId) return res.status(400).json({ error: "batchId query param required" });

    console.log(`[poll] Checking batch ${batchId}`);

    // Check batch status
    const statusRes = await fetch(
      `https://api.anthropic.com/v1/messages/batches/${batchId}`,
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "message-batches-2024-09-24",
        },
      }
    );
    const status = await statusRes.json();
    console.log(`[poll] Status: ${status.processing_status}`, status.request_counts);

    if (status.processing_status !== "ended") {
      return res.status(200).json({
        mode: "poll",
        batchId,
        processing_status: status.processing_status,
        request_counts: status.request_counts,
        message: `Batch still processing. Try again in 30s.`,
      });
    }

    // Batch is done — fetch results JSONL
    const resultsRes = await fetch(status.results_url, {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "message-batches-2024-09-24",
      },
    });
    const resultsText = await resultsRes.text();
    const batchResults = new Map<string, string>();
    for (const line of resultsText.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.result?.type === "succeeded") {
          batchResults.set(r.custom_id, r.result.message.content[0].text);
        } else {
          console.warn(`[poll] Failed result for ${r.custom_id}:`, r.result?.error);
        }
      } catch { /* skip malformed line */ }
    }

    console.log(`[poll] ${batchResults.size} results fetched`);

    // Load batch job metadata from DB to get userIds + counts
    let userIds: string[] = [];
    let sessionCounts: Record<string, number> = {};
    let engagedCounts: Record<string, number> = {};
    let pgCounts: Record<string, number> = {};
    try {
      const { data: jobRow } = await supabase
        .from("batch_jobs").select("*").eq("batch_id", batchId).single();
      if (jobRow) {
        userIds = (jobRow.user_ids || []) as string[];
        sessionCounts = jobRow.session_counts || {};
        engagedCounts = jobRow.engaged_counts || {};
        pgCounts = jobRow.pg_counts || {};
      }
    } catch { /* if batch_jobs table doesn't exist, userIds stay empty */ }

    // If no DB metadata, derive userIds from batch results keys
    if (!userIds.length) userIds = [...batchResults.keys()] as string[];

    // Process and save each result
    let succeeded = 0; let failed = 0;
    await Promise.allSettled(
      userIds.map(async (userId) => {
        const content = batchResults.get(userId);
        if (!content) {
          failed++;
          console.warn(`[poll] No result for ${userId.slice(0, 8)}`);
          return;
        }
        try {
          const clean = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
          const raw = JSON.parse(clean);
          const artifactScore =
            (raw.enterprise_artifact_goal_score || 0) + (raw.enterprise_artifact_resource_score || 0) +
            (raw.enterprise_artifact_plan_score || 0) + (raw.enterprise_artifact_constraint_score || 0) +
            (raw.enterprise_artifact_quant_score || 0) + (raw.enterprise_artifact_risk_score || 0);

          const result: MonthlySkillsResult = {
            ...raw, enterprise_artifact_score: artifactScore,
            ai_playground_session_count: pgCounts[userId] || 0,
            ai_playground_word_count: raw.ai_playground_word_count || 0,
            ai_playground_summary: raw.ai_playground_summary || "No AI Playground activity recorded this period.",
            ai_prof_application_gpt: raw.ai_prof_application_gpt || 0,
            ai_prof_ethics_gpt: raw.ai_prof_ethics_gpt || 0,
            ai_prof_understanding_gpt: raw.ai_prof_understanding_gpt || 0,
            ai_prof_verification_gpt: raw.ai_prof_verification_gpt || 0,
            ai_prof_gpt_narrative: raw.ai_prof_gpt_narrative || "",
            ai_prof_application_score: null, ai_prof_ethics_score: null,
            ai_prof_understanding_score: null, ai_prof_verification_score: null,
            ai_prof_cert_level: "Not Attempted",
            cert_attempted_count: 0, cert_passed_count: 0,
            cert_names_attempted: [], cert_names_passed: [], cert_avg_score: null, cert_summary: "",
          };

          const certData = await fetchUserCertData(userId);
          let certSummary = "No certifications attempted yet.";
          if (certData.cert_attempted_count > 0) {
            try {
              certSummary = await callClaudeHaiku(
                "You write concise, encouraging educational progress summaries.",
                `Write a 2-sentence summary for a monthly report about a learner certification activity at an AI learning lab in rural Nigeria.
Certifications attempted: ${certData.cert_names_attempted.join(", ")}
Certifications passed (score >= 2.25/3): ${certData.cert_names_passed.length > 0 ? certData.cert_names_passed.join(", ") : "None yet"}
Average cert score: ${certData.cert_avg_score ?? "N/A"}/3
AI Proficiency cert level: ${certData.ai_prof_cert_level}
AI Proficiency dimension scores (0-3): Application=${certData.ai_prof_application_score ?? "N/A"}, Ethics=${certData.ai_prof_ethics_score ?? "N/A"}, Understanding=${certData.ai_prof_understanding_score ?? "N/A"}, Verification=${certData.ai_prof_verification_score ?? "N/A"}
Be encouraging and specific. Note strongest and weakest dimensions if AI Proficiency scores exist.`,
                150
              );
            } catch { /* non-fatal */ }
          }

          result.cert_attempted_count = certData.cert_attempted_count;
          result.cert_passed_count = certData.cert_passed_count;
          result.cert_names_attempted = certData.cert_names_attempted;
          result.cert_names_passed = certData.cert_names_passed;
          result.cert_avg_score = certData.cert_avg_score;
          result.cert_summary = certSummary;
          result.ai_prof_application_score = certData.ai_prof_application_score;
          result.ai_prof_ethics_score = certData.ai_prof_ethics_score;
          result.ai_prof_understanding_score = certData.ai_prof_understanding_score;
          result.ai_prof_verification_score = certData.ai_prof_verification_score;
          result.ai_prof_cert_level = certData.ai_prof_cert_level;

          const { error: insertError } = await supabase.from("user_monthly_assessments").insert({
            user_id: userId, measured_at: endDate.toISOString(),
            assessment_model: "claude-sonnet-4-6-batch", assessment_version: "v2.1",
            session_count: sessionCounts[userId] || 0,
            engaged_session_count: engagedCounts[userId] || 0,
            cognitive_score: result.cognitive_score, cognitive_evidence: result.cognitive_evidence,
            critical_thinking_score: result.critical_thinking_score, critical_thinking_evidence: result.critical_thinking_evidence,
            problem_solving_score: result.problem_solving_score, problem_solving_evidence: result.problem_solving_evidence,
            creativity_score: result.creativity_score, creativity_evidence: result.creativity_evidence,
            pue_score: result.pue_score, pue_evidence: result.pue_evidence_quotes,
            pue_energy_constraint_pct: result.pue_energy_constraint_pct, pue_market_pricing_pct: result.pue_market_pricing_pct,
            pue_battery_load_pct: result.pue_battery_load_pct, pue_enterprise_planning_pct: result.pue_enterprise_planning_pct,
            pue_learner_initiated_pct: result.pue_learner_initiated_pct, pue_ai_introduced_pct: result.pue_ai_introduced_pct,
            pue_multi_domain_pct: result.pue_multi_domain_pct, pue_local_context_pct: result.pue_local_context_pct,
            pue_summary: result.pue_summary,
            scaffold_clarification_per_session: result.scaffold_clarification_per_session,
            scaffold_decomposition_per_session: result.scaffold_decomposition_per_session,
            scaffold_correction_total_per_session: result.scaffold_correction_total_per_session,
            scaffold_explicit_correction_per_session: result.scaffold_explicit_correction_per_session,
            scaffold_gentle_redirect_per_session: result.scaffold_gentle_redirect_per_session,
            scaffold_consecutive_correction_runs: result.scaffold_consecutive_correction_runs,
            scaffold_convergence_trend: result.scaffold_convergence_trend,
            scaffold_convergence_narrative: result.scaffold_convergence_narrative,
            reasoning_definitional_pct: result.reasoning_definitional_pct,
            reasoning_responsive_pct: result.reasoning_responsive_pct,
            reasoning_elaborative_pct: result.reasoning_elaborative_pct,
            reasoning_structured_pct: result.reasoning_structured_pct,
            reasoning_chain_count: result.reasoning_chain_count,
            metacog_verification_rate: result.metacog_verification_rate,
            metacog_reactive_rate: result.metacog_reactive_rate,
            metacog_strategic_rate: result.metacog_strategic_rate,
            metacog_narrative: result.metacog_narrative,
            role_teaching_intent_count: result.role_teaching_intent_count,
            role_community_application_count: result.role_community_application_count,
            role_enterprise_orientation_count: result.role_enterprise_orientation_count,
            role_intergenerational_count: result.role_intergenerational_count,
            role_readiness_narrative: result.role_readiness_narrative,
            role_readiness_signals: result.role_readiness_signals,
            enterprise_artifact_score: result.enterprise_artifact_score,
            enterprise_artifact_goal_score: result.enterprise_artifact_goal_score,
            enterprise_artifact_resource_score: result.enterprise_artifact_resource_score,
            enterprise_artifact_plan_score: result.enterprise_artifact_plan_score,
            enterprise_artifact_constraint_score: result.enterprise_artifact_constraint_score,
            enterprise_artifact_quant_score: result.enterprise_artifact_quant_score,
            enterprise_artifact_risk_score: result.enterprise_artifact_risk_score,
            enterprise_artifact_evidence: result.enterprise_artifact_evidence,
            ai_playground_session_count: result.ai_playground_session_count,
            ai_playground_word_count: result.ai_playground_word_count,
            ai_playground_summary: result.ai_playground_summary,
            ai_prof_application_score: certData.ai_prof_application_score,
            ai_prof_ethics_score: certData.ai_prof_ethics_score,
            ai_prof_understanding_score: certData.ai_prof_understanding_score,
            ai_prof_verification_score: certData.ai_prof_verification_score,
            ai_prof_min_score: certData.ai_prof_min_score,
            ai_prof_cert_level: certData.ai_prof_cert_level,
            ai_prof_application_gpt: result.ai_prof_application_gpt,
            ai_prof_ethics_gpt: result.ai_prof_ethics_gpt,
            ai_prof_understanding_gpt: result.ai_prof_understanding_gpt,
            ai_prof_verification_gpt: result.ai_prof_verification_gpt,
            ai_prof_gpt_narrative: result.ai_prof_gpt_narrative,
            cert_attempted_count: result.cert_attempted_count,
            cert_passed_count: result.cert_passed_count,
            cert_names_attempted: result.cert_names_attempted,
            cert_names_passed: result.cert_names_passed,
            cert_avg_score: result.cert_avg_score,
            cert_summary: result.cert_summary,
          });

          if (insertError) throw insertError;
          succeeded++;
          console.log(`[poll] ✓ ${userId.slice(0, 8)} saved`);
        } catch (err: any) {
          failed++;
          console.error(`[poll] ✗ ${userId.slice(0, 8)}: ${err.message}`);
        }
      })
    );

    // Mark batch job complete in DB
    try {
      await supabase.from("batch_jobs")
        .update({ status: "complete", succeeded, failed, completed_at: new Date().toISOString() })
        .eq("batch_id", batchId);
    } catch { /* non-fatal */ }

    return res.status(200).json({
      mode: "poll",
      batchId,
      succeeded,
      failed,
      message: `${succeeded} learners saved. Now call ?mode=report&start=${startStr}&end=${endStr} to send email.`,
      nextStep: `?mode=report&start=${startStr}&end=${endStr}`,
    });
  }

  // ── MODE 1: Orchestrate ────────────────────────────────────────────────────
  // Replaces the Anthropic Batch API path with parallel per-user assessments.
  // Reasons:
  //   • Batch API serialises ALL transcripts into one JSON body — a single
  //     lone-surrogate character anywhere in the cohort kills the entire run.
  //   • For 112 learners, parallel single-user calls complete in ~60–90s,
  //     well within Vercel's 5-min function limit.
  //   • assessMonthlySkills() already sanitises transcripts and handles errors
  //     per-user, so one bad record never affects the others.
  //   • Simpler: no batchId, no poll step, no batch_jobs table.
  //     One call → results saved → email sent.
  const startTime = Date.now();
  console.log(`\n${"═".repeat(60)}\nORCHESTRATE — ${monthLabel}\n${"═".repeat(60)}`);
  try {
    const rawUserIds = await getAfricanUsersNeedingAssessment(startDate, endDate);
    // Deduplicate — prevents double-assessment if a userId appears twice in the query result
    const userIds = [...new Set(rawUserIds)];
    console.log(`📋 ${userIds.length} users need assessment`);

    if (userIds.length === 0) {
      return res.status(200).json({
        mode: "orchestrate", month: monthLabel, total: 0,
        succeeded: 0, skipped: 0, failed: 0,
        message: "No users need assessment this period.",
      });
    }

    // Run all users in parallel — each calls assessMonthlySkills() which
    // handles its own DB write, error catching, and transcript sanitisation.
    // Concurrency cap at 10 to avoid overwhelming Supabase connection pool.
    const CONCURRENCY = 10;
    const results: Array<{ userId: string; status: string; error?: string }> = [];

    for (let i = 0; i < userIds.length; i += CONCURRENCY) {
      const batch = userIds.slice(i, i + CONCURRENCY);
      console.log(`   Processing users ${i + 1}–${Math.min(i + CONCURRENCY, userIds.length)} of ${userIds.length}...`);
      const settled = await Promise.allSettled(
        batch.map(async (userId) => {
          const { status, error } = await assessMonthlySkills(userId, startDate, endDate);
          return { userId, status, error };
        })
      );
      for (const r of settled) {
        if (r.status === "fulfilled") {
          results.push(r.value);
          console.log(`   ${r.value.userId.slice(0, 8)} → ${r.value.status}${r.value.error ? ` (${r.value.error})` : ""}`);
        } else {
          results.push({ userId: "unknown", status: "error", error: String(r.reason) });
          console.error(`   ❌ Promise rejected:`, r.reason);
        }
      }
    }

    const succeeded = results.filter((r) => r.status === "success").length;
    const skipped   = results.filter((r) => r.status === "skipped" || r.status === "no_activity").length;
    const failed    = results.filter((r) => r.status === "error").length;

    console.log(`\n✅ Done — ${succeeded} assessed, ${skipped} skipped, ${failed} errors`);

    // Build summaries for the email from results that succeeded
    const successIds = results.filter((r) => r.status === "success").map((r) => r.userId);

    // Auto-send the email report immediately after assessment
    // (no separate mode=report call needed for the monthly cron)
    let emailSent = false;
    try {
      const { data: periodRows } = await supabase
        .from("user_monthly_assessments")
        .select("*")
        .in("user_id", successIds)
        .gte("measured_at", startDate.toISOString())
        .lte("measured_at", endDate.toISOString());

      if (periodRows?.length) {
        // Fetch names for the report
        const VAI_ORG_ID_ORC       = "c0b48eae-67af-449d-8c04-cc6950bf0982";
        const SOLARDERO_ORG_ID_ORC = "a1b2c3d4-0002-0002-0002-000000000002";
        const OLOIBIRI_ORG_ID_ORC  = "a1b2c3d4-0001-0001-0001-000000000001";
        const { data: profilesForReport } = await supabase
          .from("profiles").select("id, name")
          .or(`continent.eq.Africa,organization_id.eq.${VAI_ORG_ID_ORC},organization_id.eq.${SOLARDERO_ORG_ID_ORC},organization_id.eq.${OLOIBIRI_ORG_ID_ORC}`);
        const nameMap: Record<string, string> = {};
        for (const p of profilesForReport || []) nameMap[p.id] = p.name || "Unknown";

        const reportSummaries: AssessmentSummary[] = periodRows.map((row) => ({
          userId: row.user_id,
          name: nameMap[row.user_id] || "Unknown",
          sessionCount: row.session_count || 0,
          engagedSessionCount: row.engaged_session_count || 0,
          scores: row as unknown as MonthlySkillsResult,
          status: "success" as const,
        }));

        const durationMs = Date.now() - startTime;
        await sendEmailReport(monthLabel, reportSummaries, startDate, endDate, durationMs);
        emailSent = true;
        console.log("✉️  Email report sent automatically after orchestrate");

        // Roll up into assessments_monthly_global (non-fatal if it fails)
        try {
          await generateGlobalSummary(startDate, endDate, monthLabel);
        } catch (summaryErr: any) {
          console.warn("⚠️  generateGlobalSummary failed (non-fatal):", summaryErr.message);
        }
      }
    } catch (emailErr: any) {
      console.warn("⚠️  Auto-email failed (non-fatal):", emailErr.message);
      console.warn("    Run ?mode=report manually to send the email.");
    }

    return res.status(200).json({
      mode: "orchestrate",
      month: monthLabel,
      period: `${startStr} to ${endStr}`,
      total: userIds.length,
      succeeded,
      skipped,
      failed,
      emailSent,
      message: emailSent
        ? `${succeeded} assessed and email sent to khallinan1@udayton.edu.`
        : `${succeeded} assessed. Run ?mode=report&start=${startStr}&end=${endStr} to send email.`,
    });
  } catch (err: any) {
    console.error("❌ Orchestrate fatal:", err.message);
    return res.status(500).json({ error: err.message });
  }
}