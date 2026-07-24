// api/generate-community-profile.ts
// Vercel Serverless Function
// Usage: POST /api/generate-community-profile
// Body: { city_town, state, country }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ─── Clients ────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // service role needed for storage + inserts
);

// Vercel exposes ALL env vars to serverless functions regardless of prefix,
// so this works whether the key is stored as ANTHROPIC_API_KEY or VITE_ANTHROPIC_API_KEY
const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? process.env.VITE_ANTHROPIC_API_KEY;
if (!anthropicApiKey) {
  throw new Error('No Anthropic API key found in Vercel env. Set ANTHROPIC_API_KEY or VITE_ANTHROPIC_API_KEY.');
}
const anthropic = new Anthropic({ apiKey: anthropicApiKey });

// ─── Types ───────────────────────────────────────────────────────────────────

interface RequestBody {
  city_town: string;
  state: string;
  country: string;
}

interface CategoryGroup {
  category: string;
  sub_category: string;
  count: number;
  samples: { title: string; description: string; outcomes: string; grade_level: number }[];
  learning_or_certification: string;
  assessment_category: string | null;
}

interface GeneratedModule {
  title: string;
  description: string;
  category: string;
  sub_category: string;
  outcomes: string;
  metrics_for_success: string;
  grade_level: number;
  ai_facilitator_instructions: string;
  ai_assessment_instructions: string;
  learning_or_certification: string;
  assessment_category?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getContinent(country: string): string {
  const map: Record<string, string> = {
    'Nigeria': 'Africa', 'Kenya': 'Africa', 'Ghana': 'Africa',
    'Ethiopia': 'Africa', 'Tanzania': 'Africa', 'Uganda': 'Africa',
    'Rwanda': 'Africa', 'Senegal': 'Africa', 'Cameroon': 'Africa',
    'South Africa': 'Africa', 'Mozambique': 'Africa', 'Zambia': 'Africa',
    'Zimbabwe': 'Africa', 'Malawi': 'Africa', 'Niger': 'Africa',
    'Mali': 'Africa', 'Burkina Faso': 'Africa', 'Ivory Coast': 'Africa',
    "Côte d'Ivoire": 'Africa', 'Sierra Leone': 'Africa', 'Liberia': 'Africa',
    'USA': 'North America', 'United States': 'North America',
    'Canada': 'North America', 'Mexico': 'North America',
    'India': 'Asia', 'Bangladesh': 'Asia', 'Pakistan': 'Asia',
    'Indonesia': 'Asia', 'Philippines': 'Asia', 'Vietnam': 'Asia',
    'UK': 'Europe', 'United Kingdom': 'Europe', 'France': 'Europe',
    'Germany': 'Europe', 'Spain': 'Europe', 'Italy': 'Europe',
    'Brazil': 'South America', 'Colombia': 'South America',
    'Argentina': 'South America', 'Peru': 'South America',
    'Australia': 'Oceania', 'New Zealand': 'Oceania',
  };
  return map[country] ?? 'Africa';
}

function sanitizeFilePath(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/_{2,}/g, '_');
}

function extractJSON(raw: string): string {
  // Strip markdown fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Find first [ to last ]
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
  return raw.trim();
}

// LLM output occasionally contains a literal newline/carriage-return inside a
// JSON string value (e.g. a multi-sentence instructions field), which is
// invalid per the JSON spec and makes JSON.parse throw. Walk the string
// tracking whether we're inside a quoted value and escape any raw control
// character we find there before parsing.
function repairEmbeddedNewlines(json: string): string {
  let inString = false;
  let escaped = false;
  let out = '';
  for (const ch of json) {
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { inString = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { continue; }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

function parseModulesJSON(raw: string): unknown {
  const extracted = extractJSON(raw);
  try {
    return JSON.parse(extracted);
  } catch {
    return JSON.parse(repairEmbeddedNewlines(extracted));
  }
}

// ─── Step 1: Research community profile with web search ───────────────────

async function researchCommunity(
  city_town: string,
  state: string,
  country: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content: `Research and write a comprehensive community profile for **${city_town}, ${state}, ${country}**.

Cover ALL of the following sections in detail:

## 1. Main Livelihoods
What are the primary economic activities, industries, and employment patterns? What do most people do to earn income?

## 2. Key Challenges
What are the major social, economic, infrastructure, health, and environmental challenges facing this community?

## 3. Key Assets
What natural resources, community strengths, cultural assets, infrastructure, and human capital does this community possess?

## 4. Climate Crisis Impact
How is climate change specifically affecting farming, food security, water availability, and daily life in this community?

## 5. Key Needs
What are the most critical unmet needs across education, health, economic opportunity, and infrastructure?

## 6. Key Aspirations
What are the community's development priorities, and what do youth and community leaders aspire toward?

## 7. Digital & AI Readiness
What is the current state of internet access, mobile usage, digital literacy, and openness to technology-based learning?

Write this as a detailed, well-structured Markdown report suitable for informing educational curriculum design. Be specific to this actual community — use real data where available.`,
      },
    ],
  });

  // Collect all text blocks (web search may produce multiple turns)
  const textBlocks = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n');

  if (!textBlocks.trim()) {
    throw new Error('Claude returned no text for the community profile.');
  }

  return `# Community Profile: ${city_town}, ${state}, ${country}\n\n_Generated: ${new Date().toISOString()}_\n\n${textBlocks}`;
}

// ─── Step 2: Upload profile to Supabase Storage ───────────────────────────

async function uploadProfile(
  city_town: string,
  state: string,
  country: string,
  content: string
): Promise<string> {
  const filePath = `${sanitizeFilePath(country)}/${sanitizeFilePath(state)}/${sanitizeFilePath(city_town)}_profile.md`;

  const { error } = await supabase.storage
    .from('city_town_profile')
    .upload(filePath, content, {
      contentType: 'text/markdown; charset=utf-8',
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return filePath;
}

// ─── Step 3: Fetch existing module structure from Supabase ────────────────

async function fetchModuleStructure(): Promise<Map<string, CategoryGroup>> {
  // Use Oloibiri, Nigeria as the canonical reference — new communities get
  // the same number of modules per group as Oloibiri, not the global total.
  const { data, error } = await supabase
    .from('learning_modules')
    .select(
      'category, sub_category, title, description, outcomes, grade_level, learning_or_certification, assessment_category'
    )
    .in('category', ['AI Proficiency', 'Skills'])
    .eq('city_town', 'Oloibiri')
    .order('category')
    .order('sub_category');

  if (error) throw new Error(`Failed to query learning_modules: ${error.message}`);
  if (!data || data.length === 0) throw new Error('No existing AI Proficiency or Skills modules found.');

  const groups = new Map<string, CategoryGroup>();

  for (const row of data) {
    const key = `${row.category}|||${row.sub_category ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        category: row.category,
        sub_category: row.sub_category ?? '',
        count: 0,
        samples: [],
        learning_or_certification: row.learning_or_certification ?? 'learning',
        assessment_category: row.assessment_category ?? null,
      });
    }
    const group = groups.get(key)!;
    group.count++;
    if (group.samples.length < 4) {
      group.samples.push({
        title: row.title ?? '',
        description: row.description ?? '',
        outcomes: row.outcomes ?? '',
        grade_level: row.grade_level ?? 1,
      });
    }
  }

  return groups;
}

// ─── Step 4: Generate contextually aligned modules via Claude ──────────────
// Strategy: one API call per group, large groups chunked into batches of 12,
// all batches run concurrently via Promise.all.
// (Batch size kept small and max_tokens raised because full module rows —
// title/description/outcomes/facilitator+assessment instructions — are verbose;
// a batch of 25 reliably exceeded the previous 8000-token output limit and
// produced truncated, unparseable JSON.)

const BATCH_SIZE = 12;

async function generateBatch(
  city_town: string,
  state: string,
  country: string,
  profileSnippet: string,
  group: CategoryGroup,
  batchIndex: number,
  totalBatches: number
): Promise<GeneratedModule[]> {
  const sampleTitles = group.samples.map((s) => `"${s.title}"`).join(', ');
  const sampleDesc = group.samples[0]?.description ?? '';
  const rowCount = batchIndex < totalBatches - 1
    ? BATCH_SIZE
    : group.count - batchIndex * BATCH_SIZE;

  const batchNote = totalBatches > 1
    ? `This is batch ${batchIndex + 1} of ${totalBatches}. Generate exactly ${rowCount} rows.`
    : `Generate exactly ${rowCount} rows.`;

  const prompt = [
    'You are an expert curriculum designer creating hyper-local learning modules for an AI literacy platform.',
    '',
    'COMMUNITY PROFILE (context):',
    profileSnippet,
    '',
    'TASK:',
    `Generate new learning_modules rows for this category/sub_category:`,
    `  CATEGORY: "${group.category}"`,
    `  SUB_CATEGORY: "${group.sub_category}"`,
    `  LEARNING_OR_CERT: "${group.learning_or_certification}"`,
    `  ASSESSMENT_CATEGORY: "${group.assessment_category ?? 'null'}"`,
    `  SAMPLE_TITLES: [${sampleTitles}]`,
    `  SAMPLE_DESC_EXAMPLE: "${sampleDesc.substring(0, 200)}..."`,
    '',
    batchNote,
    '',
    'Each module must be:',
    `- 100% contextually aligned with ${city_town}, ${state}, ${country}`,
    '- Following the same thematic style as the sample titles',
    '- Distinct from others in this batch',
    '',
    'REQUIRED JSON FIELDS per object:',
    '- title: string',
    '- description: string (2-3 sentences, locally grounded)',
    `- category: "${group.category}"`,
    `- sub_category: "${group.sub_category}"`,
    '- outcomes: string (3-5 measurable outcomes)',
    '- metrics_for_success: string',
    '- grade_level: number (1-5)',
    '- ai_facilitator_instructions: string (reference local context)',
    '- ai_assessment_instructions: string',
    `- learning_or_certification: "${group.learning_or_certification}"`,
    `- assessment_category: ${group.assessment_category ? '"' + group.assessment_category + '"' : 'null'}`,
    '',
    'JSON FORMATTING RULES (strict — output will be parsed with JSON.parse):',
    '- Return ONLY a raw JSON array. No preamble, no markdown fences, no trailing commas.',
    '- Every string value must be a single JSON-escaped line: use \\n for any line break inside a string, never a literal newline character.',
    '- Keep ai_facilitator_instructions and ai_assessment_instructions concise (2-4 sentences each) — do not write multi-paragraph instructions.',
    '- Escape any double quotes or apostrophes-with-special-formatting inside string values correctly per JSON string rules.',
  ].join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  try {
    const parsed = parseModulesJSON(raw);
    if (!Array.isArray(parsed)) throw new Error('Response was not a JSON array');
    return parsed as GeneratedModule[];
  } catch {
    throw new Error(
      `Parse error: ${group.category}/${group.sub_category} batch ${batchIndex + 1}/${totalBatches}. ` +
      `Preview: ${raw.substring(0, 200)}`
    );
  }
}

async function generateModules(
  city_town: string,
  state: string,
  country: string,
  profile: string,
  groups: Map<string, CategoryGroup>
): Promise<GeneratedModule[]> {
  // Trim profile to avoid bloating each prompt
  const profileSnippet = profile.substring(0, 3000);

  // Build one task per batch across all groups
  const tasks: Array<() => Promise<GeneratedModule[]>> = [];

  for (const group of groups.values()) {
    const totalBatches = Math.ceil(group.count / BATCH_SIZE);
    for (let i = 0; i < totalBatches; i++) {
      const g = group;
      const idx = i;
      const total = totalBatches;
      tasks.push(() => generateBatch(city_town, state, country, profileSnippet, g, idx, total));
    }
  }

  // Run all batches in parallel
  const results = await Promise.all(tasks.map((t) => t()));
  return results.flat();
}

// ─── Step 5: Insert modules into Supabase ─────────────────────────────────

async function insertModules(
  modules: GeneratedModule[],
  city_town: string,
  state: string,
  country: string
): Promise<{ learning_module_id: string; title: string; category: string; sub_category: string }[]> {

  const now = new Date().toISOString();
  const continent = getContinent(country);

  const rows = modules.map((m) => ({
    title: m.title ?? null,
    description: m.description ?? null,
    category: m.category ?? null,
    sub_category: m.sub_category ?? null,
    outcomes: m.outcomes ?? null,
    metrics_for_success: m.metrics_for_success ?? null,
    grade_level: m.grade_level ?? 1,
    ai_facilitator_instructions: m.ai_facilitator_instructions ?? null,
    ai_assessment_instructions: m.ai_assessment_instructions ?? null,
    learning_or_certification: m.learning_or_certification ?? 'learning',
    assessment_category: m.assessment_category ?? null,
    city_town,
    state,
    country,
    continent,
    user_id: null,
    public: 0,
    application: 0,
    created_at: now,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from('learning_modules')
    .insert(rows)
    .select('learning_module_id, title, category, sub_category');

  if (error) throw new Error(`Module insert failed: ${error.message}`);
  return data ?? [];
}

// ─── Main Handler ─────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Auth check (optional bearer token guard)
  const authHeader = req.headers.authorization;
  if (process.env.API_SECRET && authHeader !== `Bearer ${process.env.API_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const { city_town, state, country } = (req.body ?? {}) as RequestBody;

  if (!city_town?.trim() || !state?.trim() || !country?.trim()) {
    return res.status(400).json({
      error: 'Missing required fields.',
      required: ['city_town', 'state', 'country'],
    });
  }

  const log: string[] = [];
  const startTime = Date.now();

  try {
    log.push(`▶ Starting profile generation for ${city_town}, ${state}, ${country}`);

    // 1. Research
    log.push('🔍 Researching community with web search...');
    const profile = await researchCommunity(city_town.trim(), state.trim(), country.trim());
    log.push(`✅ Profile generated (${profile.length} chars)`);

    // 2. Upload
    log.push('📤 Uploading profile to Supabase storage...');
    const profilePath = await uploadProfile(city_town.trim(), state.trim(), country.trim(), profile);
    log.push(`✅ Uploaded to: ${profilePath}`);

    // 3. Fetch structure
    log.push('📋 Fetching existing module structure...');
    const groups = await fetchModuleStructure();
    const groupSummary = Array.from(groups.values()).map(
      (g) => `  • ${g.category} / ${g.sub_category}: ${g.count} rows`
    );
    log.push(`✅ Found ${groups.size} category/sub_category groups:\n${groupSummary.join('\n')}`);

    // 4. Generate modules
    log.push('🤖 Generating contextually aligned modules...');
    const generated = await generateModules(city_town.trim(), state.trim(), country.trim(), profile, groups);
    log.push(`✅ Generated ${generated.length} modules`);

    // 5. Insert
    log.push('💾 Inserting modules into learning_modules...');
    const inserted = await insertModules(generated, city_town.trim(), state.trim(), country.trim());
    log.push(`✅ Inserted ${inserted.length} rows`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log.push(`🏁 Completed in ${duration}s`);

    return res.status(200).json({
      success: true,
      community: { city_town: city_town.trim(), state: state.trim(), country: country.trim() },
      profile_storage_path: profilePath,
      groups_processed: groups.size,
      modules_generated: generated.length,
      modules_inserted: inserted.length,
      modules: inserted,
      log,
      duration_seconds: parseFloat(duration),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`❌ Error: ${message}`);
    console.error('[generate-community-profile] Error:', message);
    return res.status(500).json({ success: false, error: message, log });
  }
}