import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.27.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

if (!supabaseUrl || !supabaseKey || !anthropicKey) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

export interface MonthlySkillsResult {
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
}

export interface MonthlyAssessmentRunResult {
  period_start: string;
  period_end: string;
  total_users: number;
  successful: number;
  failed: number;
  failed_user_ids: string[];
}

export function getPreviousMonthDateRange(now = new Date()) {
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)
  );

  const endDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)
  );

  return { startDate, endDate };
}

export async function assessMonthlySkills(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<MonthlySkillsResult | null> {
  console.log(`Assessing skills for user ${userId}...`);

  const { data: existing, error: existingError } = await supabase
    .from("user_monthly_assessments")
    .select("id, measured_at")
    .eq("user_id", userId)
    .gte("measured_at", startDate.toISOString())
    .lte("measured_at", endDate.toISOString())
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    throw new Error(`Error checking existing assessment: ${existingError.message}`);
  }

  if (existing) {
    console.log(`Already assessed for this period. Skipping.`);
    return null;
  }

  // Structured lessons (AI Proficiency / AI Ready Skills / tech skills) log
  // to dashboard.chat_history. Free-form use — AI Playground and Systems
  // Think — logs to its own tables with the same {role, content} message
  // shape, so learners who never touch the structured pages were producing
  // zero assessment signal even though they were actively using AI. Pull
  // all three sources into one pool.
  const [{ data: activities, error }, { data: playgroundChats, error: pgError }, { data: thinkSessions, error: stError }] = await Promise.all([
    supabase
      .from("dashboard")
      .select("chat_history, created_at")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_playground_chats")
      .select("title, messages, updated_at")
      .eq("user_id", userId)
      .gte("updated_at", startDate.toISOString())
      .lte("updated_at", endDate.toISOString()),
    supabase
      .from("systems_think_sessions")
      .select("title, messages, updated_at")
      .eq("user_id", userId)
      .gte("updated_at", startDate.toISOString())
      .lte("updated_at", endDate.toISOString()),
  ]);

  if (error) {
    throw new Error(`Error fetching dashboard activity: ${error.message}`);
  }
  if (pgError) {
    throw new Error(`Error fetching AI Playground activity: ${pgError.message}`);
  }
  if (stError) {
    throw new Error(`Error fetching Systems Think activity: ${stError.message}`);
  }

  if (
    (!activities || activities.length === 0) &&
    (!playgroundChats || playgroundChats.length === 0) &&
    (!thinkSessions || thinkSessions.length === 0)
  ) {
    console.log(`No activity found for this period.`);
    return null;
  }

  const extractUserMessages = (messages: unknown): string[] => {
    const parsed = typeof messages === "string" ? JSON.parse(messages) : (messages ?? []);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((message: any) => message?.role === "user" && !message?.hidden && typeof message?.content === "string")
      .map((message: any) => message.content.trim())
      .filter(Boolean);
  };

  const structuredLessonText = (activities ?? [])
    .flatMap((activity) => {
      try {
        return extractUserMessages(activity.chat_history);
      } catch {
        console.log(`Failed to parse chat_history for activity ${activity.created_at}`);
        return [];
      }
    })
    .join("\n\n");

  const freeformSections: string[] = [];
  for (const chat of playgroundChats ?? []) {
    const msgs = extractUserMessages(chat.messages);
    if (msgs.length > 0) {
      freeformSections.push(`[AI Playground — "${chat.title}"]\n${msgs.join("\n\n")}`);
    }
  }
  for (const session of thinkSessions ?? []) {
    const msgs = extractUserMessages(session.messages);
    if (msgs.length > 0) {
      freeformSections.push(`[Systems Think — "${session.title}"]\n${msgs.join("\n\n")}`);
    }
  }

  const combinedText = [
    structuredLessonText ? `[Structured lesson conversations]\n${structuredLessonText}` : "",
    ...freeformSections,
  ].filter(Boolean).join("\n\n---\n\n");

  if (!combinedText.trim()) {
    console.log(`No user messages found.`);
    return null;
  }

  const prompt = `Assess learner development based on these conversations. Some are from structured lessons; others are free-form AI Playground or Systems Think sessions where the learner picks their own topic:

${combinedText}

When scoring, weigh not just how the learner communicates but WHAT they are working on: the real-world complexity and sophistication of the topics, questions, and systems they choose to engage with. A learner reasoning through a multi-variable system, a technical architecture, an economic trade-off, or an open-ended real-world problem is stronger evidence of cognitive/critical-thinking/problem-solving ability than one who only discusses simple, single-step topics — even if the simple topics are phrased fluently. Judge each section (structured lesson vs. Playground vs. Systems Think) on its own content; do not penalize a section just because it's free-form.

Provide JSON with scores (0-100) and evidence arrays for:
- cognitive_score
- cognitive_evidence
- critical_thinking_score
- critical_thinking_evidence
- problem_solving_score
- problem_solving_evidence
- creativity_score
- creativity_evidence
- pue_score
- pue_evidence`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: 'You are an assessment expert. Respond with valid JSON only. No preamble, no markdown.',
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  if (!content) {
    throw new Error("Empty response from Anthropic");
  }

  const clean = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  const result: MonthlySkillsResult = JSON.parse(clean);

  const { error: insertError } = await supabase
    .from("user_monthly_assessments")
    .insert({
      user_id: userId,
      measured_at: endDate.toISOString(),
      ...result,
      assessment_model: "claude-haiku-4-5",
      assessment_version: "v2.0",
    });

  if (insertError) {
    throw new Error(`Error saving monthly assessment: ${insertError.message}`);
  }

  console.log(
    `Saved assessment for ${userId} - Cog: ${result.cognitive_score}, CT: ${result.critical_thinking_score}, PS: ${result.problem_solving_score}`
  );

  return result;
}

export async function getAfricanUsersNeedingAssessment(
  startDate: Date,
  endDate: Date
): Promise<string[]> {
  console.log(`Searching for African users with activity between:`);
  console.log(`Start: ${startDate.toISOString()}`);
  console.log(`End: ${endDate.toISOString()}`);

  const { data: africanProfiles, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("continent", "Africa");

  if (profileError) {
    throw new Error(`Error fetching African profiles: ${profileError.message}`);
  }

  const africanUserIds = africanProfiles?.map((profile) => profile.id) ?? [];

  if (africanUserIds.length === 0) {
    console.log(`No African users found in profiles.`);
    return [];
  }

  // A learner who only uses AI Playground / Systems Think and never touches
  // a structured lesson never shows up in "dashboard" activity — check all
  // three activity sources so free-form-only users still get assessed.
  const [{ data: activities, error: activityError }, { data: playgroundChats, error: pgError }, { data: thinkSessions, error: stError }] = await Promise.all([
    supabase
      .from("dashboard")
      .select("user_id, created_at")
      .in("user_id", africanUserIds)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString()),
    supabase
      .from("ai_playground_chats")
      .select("user_id, updated_at")
      .in("user_id", africanUserIds)
      .gte("updated_at", startDate.toISOString())
      .lte("updated_at", endDate.toISOString()),
    supabase
      .from("systems_think_sessions")
      .select("user_id, updated_at")
      .in("user_id", africanUserIds)
      .gte("updated_at", startDate.toISOString())
      .lte("updated_at", endDate.toISOString()),
  ]);

  if (activityError) {
    throw new Error(`Error fetching dashboard activity: ${activityError.message}`);
  }
  if (pgError) {
    throw new Error(`Error fetching AI Playground activity: ${pgError.message}`);
  }
  if (stError) {
    throw new Error(`Error fetching Systems Think activity: ${stError.message}`);
  }

  const activeUserIds = [
    ...new Set(
      [...(activities ?? []), ...(playgroundChats ?? []), ...(thinkSessions ?? [])]
        .map((row) => row.user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  if (activeUserIds.length === 0) {
    console.log(`No African users had activity in this period.`);
    return [];
  }

  const { data: assessments, error: assessmentError } = await supabase
    .from("user_monthly_assessments")
    .select("user_id, measured_at")
    .in("user_id", activeUserIds)
    .gte("measured_at", startDate.toISOString())
    .lte("measured_at", endDate.toISOString());

  if (assessmentError) {
    throw new Error(`Error fetching existing assessments: ${assessmentError.message}`);
  }

  const assessedUserIds = new Set(
    (assessments ?? [])
      .map((assessment) => assessment.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );

  const usersNeedingAssessment = activeUserIds.filter(
    (userId) => !assessedUserIds.has(userId)
  );

  console.log(`African users with activity: ${activeUserIds.length}`);
  console.log(`Already assessed: ${assessedUserIds.size}`);
  console.log(`Need assessment: ${usersNeedingAssessment.length}`);

  return usersNeedingAssessment;
}

export async function runMonthlyAssessments(): Promise<MonthlyAssessmentRunResult> {
  const { startDate, endDate } = getPreviousMonthDateRange();

  console.log("Running monthly skills assessment");
  console.log(`Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);

  const userIds = await getAfricanUsersNeedingAssessment(startDate, endDate);

  if (userIds.length === 0) {
    return {
      period_start: startDate.toISOString(),
      period_end: endDate.toISOString(),
      total_users: 0,
      successful: 0,
      failed: 0,
      failed_user_ids: [],
    };
  }

  let successCount = 0;
  const failedUserIds: string[] = [];

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];

    try {
      const result = await assessMonthlySkills(userId, startDate, endDate);
      if (result) {
        successCount++;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed assessment for ${userId}: ${message}`);
      failedUserIds.push(userId);
    }

    if (i < userIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (failedUserIds.length > 0) {
    await supabase.from('system_events').insert({
      function_name: 'monthly-assessment',
      event_type:    'assessment_partial_failure',
      severity:      failedUserIds.length === userIds.length ? 'error' : 'warning',
      payload: {
        period_start:    startDate.toISOString(),
        period_end:      endDate.toISOString(),
        total_users:     userIds.length,
        successful:      successCount,
        failed:          failedUserIds.length,
        failed_user_ids: failedUserIds,
      },
      created_at: new Date().toISOString(),
    }).catch(() => {});
  }

  return {
    period_start: startDate.toISOString(),
    period_end: endDate.toISOString(),
    total_users: userIds.length,
    successful: successCount,
    failed: failedUserIds.length,
    failed_user_ids: failedUserIds,
  };
}