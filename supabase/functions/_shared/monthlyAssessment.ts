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

  const { data: activities, error } = await supabase
    .from("dashboard")
    .select("chat_history, created_at")
    .eq("user_id", userId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching dashboard activity: ${error.message}`);
  }

  if (!activities || activities.length === 0) {
    console.log(`No activity found for this period.`);
    return null;
  }

  const userMessages = activities
    .flatMap((activity) => {
      try {
        const chatHistory =
          typeof activity.chat_history === "string"
            ? JSON.parse(activity.chat_history)
            : (activity.chat_history ?? []);

        return Array.isArray(chatHistory) ? chatHistory : [];
      } catch {
        console.log(
          `Failed to parse chat_history for activity ${activity.created_at}`
        );
        return [];
      }
    })
    .filter((message: any) => message?.role === "user" && typeof message?.content === "string")
    .map((message: any) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!userMessages.trim()) {
    console.log(`No user messages found.`);
    return null;
  }

  const prompt = `Assess learner development based on these conversations:

${userMessages}

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

  const { data: activities, error: activityError } = await supabase
    .from("dashboard")
    .select("user_id, created_at")
    .in("user_id", africanUserIds)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  if (activityError) {
    throw new Error(`Error fetching dashboard activity: ${activityError.message}`);
  }

  const activeUserIds = [
    ...new Set(
      (activities ?? [])
        .map((activity) => activity.user_id)
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