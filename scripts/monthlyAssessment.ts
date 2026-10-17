/**
 * MONTHLY SKILLS ASSESSMENT - Africa users only
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const deepseekKey = process.env.DEEPSEEK_API_KEY!;

if (!supabaseUrl || !supabaseKey || !deepseekKey) {
  console.error("❌ Missing required environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
// DeepSeek is OpenAI API-compatible — same SDK, different baseURL + key
const openai = new OpenAI({ apiKey: deepseekKey, baseURL: "https://api.deepseek.com" });



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
}

async function assessMonthlySkills(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<MonthlySkillsResult | null> {
  console.log(`\n📊 Assessing skills for user ${userId}...`);

  // Check if already assessed for this period
  const { data: existing } = await supabase
    .from("user_monthly_assessments")
    .select("id, measured_at")
    .eq("user_id", userId)
    .gte("measured_at", startDate.toISOString())
    .lte("measured_at", endDate.toISOString())
    .single();

  if (existing) {
    console.log(`⚠️  Already assessed. Skipping.`);
    return null;
  }

  // Fetch conversation history for the specified period
  const { data: activities, error } = await supabase
    .from("dashboard")
    .select("chat_history, created_at")
    .eq("user_id", userId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false });

  if (error || !activities || activities.length === 0) {
    console.log(`❌ No activity for this period.`);
    return null;
  }

  // Extract user messages from chat_history (stored as TEXT, needs parsing)
// Extract user messages from chat_history (stored as TEXT, needs parsing)
const userMessages = activities
.flatMap((a) => {
  try {
    // Parse the JSON string into an array
    const chatHistory = typeof a.chat_history === 'string' 
      ? JSON.parse(a.chat_history) 
      : (a.chat_history || []);
    return chatHistory;
  } catch (err) {
    console.log(`   ⚠️  Failed to parse chat_history for activity ${a.created_at}`);
    return [];
  }
})
.filter((m: any) => m.role === "user")
.map((m: any) => m.content)
.join("\n\n");

  if (!userMessages.trim()) {
    console.log(`❌ No user messages found`);
    return null;
  }

  console.log(`   Found ${activities.length} activities`);

  const prompt = `Assess learner development based on these conversations:

${userMessages}

Provide JSON with scores (0-100) and evidence arrays for: cognitive_score, cognitive_evidence, critical_thinking_score, critical_thinking_evidence, problem_solving_score, problem_solving_evidence, creativity_score, creativity_evidence, pue_score, pue_evidence`;

  try {
    console.log(`   Calling DeepSeek R1...`);
    const completion = await openai.chat.completions.create({
      model: "deepseek-reasoner",  // R1 chain-of-thought, ~96% cheaper than Sonnet
      messages: [
        { role: "system", content: "Assessment expert. Respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response");

    const result: MonthlySkillsResult = JSON.parse(content);

    console.log(`   Saving...`);
    const { error: insertError } = await supabase
      .from("user_monthly_assessments")
      .insert({
        user_id: userId,
        measured_at: endDate.toISOString(),
        ...result,
        assessment_model: "deepseek-reasoner",
        assessment_version: "v1.0",
      });

    if (insertError) throw insertError;

    console.log(`✅ Saved - Cog: ${result.cognitive_score}, CT: ${result.critical_thinking_score}, PS: ${result.problem_solving_score}`);
    return result;
  } catch (err: any) {
    console.error(`❌ Error:`, err.message);
    return null;
  }
}

async function getAfricanUsersNeedingAssessment(
  startDate: Date,
  endDate: Date
): Promise<string[]> {
  console.log(`\n🔍 DEBUG: Searching for African users with activities between:`);
  console.log(`   Start: ${startDate.toISOString()}`);
  console.log(`   End: ${endDate.toISOString()}`);

  // STEP 1: Get all African user IDs from profiles
  const { data: africanProfiles, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("continent", "Africa");

  if (profileError) {
    console.error(`❌ Error fetching African profiles:`, profileError.message);
    return [];
  }

  const africanUserIds = africanProfiles?.map((p) => p.id) || [];
  console.log(`   Found ${africanUserIds.length} African users in profiles`);

  if (africanUserIds.length === 0) {
    console.log(`   No African users found!`);
    return [];
  }

  // TEST 1: Can we query dashboard at all?
  console.log(`\n   🔍 TEST 1: Can we access dashboard table?`);
  const { data: anyActivities, error: anyError } = await supabase
    .from("dashboard")
    .select("id, user_id, created_at")
    .limit(5);
  
  console.log(`   Any activities in dashboard: ${anyActivities?.length || 0}`);
  if (anyActivities && anyActivities.length > 0) {
    console.log(`   Sample:`, anyActivities[0]);
  }
  if (anyError) {
    console.log(`   Error:`, anyError.message);
  }

  // TEST 2: Query without date filter
  console.log(`\n   🔍 TEST 2: African users' activities (no date filter)...`);
  const { data: noDateFilter, error: noDateError } = await supabase
    .from("dashboard")
    .select("user_id, created_at")
    .in("user_id", africanUserIds.slice(0, 3))
    .limit(10);
  
  console.log(`   Activities found: ${noDateFilter?.length || 0}`);
  if (noDateFilter && noDateFilter.length > 0) {
    console.log(`   Date range in results: ${noDateFilter[0]?.created_at} to ${noDateFilter[noDateFilter.length - 1]?.created_at}`);
  }

  // TEST 3: Query with one specific user we know has data
  const knownUserId = "aaa8269b-28f3-40b5-a66f-7d4cc21c5657"; // From your SQL results
  console.log(`\n   🔍 TEST 3: Query known active user ${knownUserId}...`);
  const { data: knownUserData, error: knownUserError } = await supabase
    .from("dashboard")
    .select("created_at, title")
    .eq("user_id", knownUserId)
    .gte("created_at", "2026-02-01")
    .lte("created_at", "2026-02-28")
    .limit(5);
  
  console.log(`   Found: ${knownUserData?.length || 0} activities`);
  if (knownUserData && knownUserData.length > 0) {
    console.log(`   Sample:`, knownUserData[0]);
  }

  // TEST 4: Full date range query
  console.log(`\n   🔍 TEST 4: Query with ISO date strings...`);
  const { data: isoDateTest, error: isoError } = await supabase
    .from("dashboard")
    .select("user_id, created_at, title")
    .eq("user_id", knownUserId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .limit(5);
  
  console.log(`   Found with ISO dates: ${isoDateTest?.length || 0} activities`);

  // STEP 2: Get activities for ALL African users during the period
  const { data: activities, error: activityError } = await supabase
    .from("dashboard")
    .select("user_id, created_at, title")
    .in("user_id", africanUserIds)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  if (activityError) {
    console.error(`❌ Error fetching activities:`, activityError.message);
    return [];
  }

  console.log(`\n   Found ${activities?.length || 0} activities from all African users`);

  const activeUserIds = [...new Set(activities?.map((a) => a.user_id).filter((id) => id !== null))] as string[];
  console.log(`   Unique African users with activity: ${activeUserIds.length}`);

  // STEP 3: Check which ones already have assessment for this period
  if (activeUserIds.length === 0) {
    console.log(`   No active users found!`);
    return [];
  }

  const { data: assessments, error: assessmentError } = await supabase
    .from("user_monthly_assessments")
    .select("user_id, measured_at")
    .in("user_id", activeUserIds)
    .gte("measured_at", startDate.toISOString())
    .lte("measured_at", endDate.toISOString());

  if (assessmentError) {
    console.error(`❌ Error fetching assessments:`, assessmentError.message);
    return activeUserIds;
  }

  console.log(`   Found ${assessments?.length || 0} existing assessments`);

  const assessed = new Set(assessments?.map((a) => a.user_id) || []);
  const usersNeedingAssessment = activeUserIds.filter((id) => !assessed.has(id));
  
  console.log(`   Users already assessed: ${assessed.size}`);
  console.log(`   Users needing assessment: ${usersNeedingAssessment.length}`);

  return usersNeedingAssessment;
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("MONTHLY SKILLS ASSESSMENT - AFRICA USERS ONLY");
  console.log("═══════════════════════════════════════════════════════════════════");

  // DEBUG: Print what env vars the script sees
  console.log(`\n🔍 ENVIRONMENT CHECK:`);
  console.log(`   SUPABASE_URL: ${supabaseUrl?.substring(0, 40)}...`);
  console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? 'set' : 'MISSING'}`);
  console.log(`   DEEPSEEK_API_KEY: ${deepseekKey ? 'set' : 'MISSING'}`);
  
  // Test direct Supabase connection
  console.log(`\n🔍 TESTING SUPABASE CONNECTION:`);
  try {
    const { data, error } = await supabase
      .from("dashboard")
      .select("id")
      .limit(1);
    console.log(`   Dashboard query result: ${data?.length || 0} rows`);
    if (error) {
      console.log(`   Error: ${error.message}`);
      console.log(`   Error details:`, error);
    }
  } catch (err: any) {
    console.log(`   Connection error:`, err.message);
  }

  const args = process.argv.slice(2);
  
  let specificUserId: string | null = null;
  let startDate: Date;
  let endDate: Date;

  // Default to current month
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  if (args.length === 0) {
    startDate = defaultStart;
    endDate = defaultEnd;
  } else if (args.length === 1) {
    specificUserId = args[0];
    startDate = defaultStart;
    endDate = defaultEnd;
  } else if (args.length === 2) {
    startDate = new Date(args[0] + "T00:00:00.000Z");
    endDate = new Date(args[1] + "T23:59:59.999Z");
  } else if (args.length === 3) {
    specificUserId = args[0];
    startDate = new Date(args[1] + "T00:00:00.000Z");
    endDate = new Date(args[2] + "T23:59:59.999Z");
  } else {
    console.log(`
Usage:
  npm run assess:monthly                              # Current month, all African users
  npm run assess:monthly 2026-02-01 2026-02-28        # Date range, all African users  
  npm run assess:monthly <user_id>                    # Current month, one user
  npm run assess:monthly <user_id> 2026-02-01 2026-02-28  # Date range, one user
`);
    process.exit(0);
  }

  console.log(`\n📅 Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  if (specificUserId) {
    console.log(`🎯 User: ${specificUserId}`);
    await assessMonthlySkills(specificUserId, startDate, endDate);
    return;
  }

  const userIds = await getAfricanUsersNeedingAssessment(startDate, endDate);

  if (userIds.length === 0) {
    console.log("\n✅ All African users already assessed for this period!");
    return;
  }

  console.log(`\n📋 Processing ${userIds.length} users...`);

  let successCount = 0;
  for (const userId of userIds) {
    const result = await assessMonthlySkills(userId, startDate, endDate);
    if (result) successCount++;
    if (userIds.indexOf(userId) < userIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log(`✅ Successful: ${successCount} / ${userIds.length}`);
  console.log("═══════════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});