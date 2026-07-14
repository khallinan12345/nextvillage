// api/generate-site-code.ts
// Generates / iterates Vite + React static website code (no database).
//
// PATCH 2026-05-07:
//   1. communicationStrategy / learningStrategy removed from system prompt —
//      they add 200–400 tokens per call (×N chunks) with no effect on code quality.
//   2. callAnthropic() now returns usage tokens for cost logging.
//   3. logApiCost() writes to api_cost_log after every Anthropic call.
//
// Request body:
//   action: 'generate' | 'iterate' | 'critique'
//   prompt: string
//   taskId: string
//   projectFiles: { path: string; content: string }[]
//   sessionContext: { siteName?, sitePurpose?, audience?, pages?, components? }
//   source?:   string   — page label for cost attribution (default: 'WebDevelopmentPage')
//   user_id?:  string
//   cohort?:   string
//
// Response (generate/iterate):
//   { files: { path, content }[], explanation: string, sessionContext? }
// Response (critique):
//   { critique: string, feedback: string }
//
// ─── Multi-page splitting ──────────────────────────────────────────────────────
//
// Some tasks (home_page step 3, content_pages, interactivity step 3) accept a
// student prompt that describes MULTIPLE pages or features in one message.
// Sending all of them to Claude in a single API call causes the JSON response to
// exceed max_tokens and truncate — producing a parse failure on the frontend.
//
// The fix is splitAndGenerate(): detect multi-chunk prompts, call Claude once per
// chunk, then merge the resulting file arrays before returning. This is handled
// entirely in the API route so the frontend never needs to know.
//
// Tasks that can receive multi-chunk prompts are declared in SPLITTABLE_TASKS.
// The splitter uses labelled-section detection (lines starting with a known label
// followed by ":" or "—") so it handles the natural free-text format learners use.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logApiCost } from '../lib/api-cost-logger.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_SONNET      = 'claude-sonnet-4-6'
const MODEL_HAIKU       = 'claude-haiku-4-5-20251001'; // used for critique

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectFile {
  path: string;
  content: string;
}

interface GenerateResult {
  files: ProjectFile[];
  explanation: string;
  sessionContext?: Record<string, string>;
}

// ─── Per-task guidance ────────────────────────────────────────────────────────

const TASK_GUIDANCE: Record<string, string> = {
  define_site: `
The student is defining their website's purpose, audience, and goals.
Do NOT write any component code yet.
Return a single file: README.md documenting:
- Site name and purpose (1–2 sentences)
- Target audience
- Key goals / what visitors will find (3–5 bullet points)
Also return sessionContext: { siteName, sitePurpose, audience }`,

  plan_pages: `
The student is planning the pages and component structure of their site.
Do NOT write full components yet.
Return a single file: src/PLAN.md listing:
- Which pages exist (e.g. Home, About, Projects, Contact) and their purpose
- Which reusable components are needed (Navbar, Footer, Card, etc.)
- The planned react-router-dom routes
Also return sessionContext: { pages: "comma-separated page names", components: "comma-separated component names" }`,

  app_shell: `
Build the application shell with react-router-dom v6 routing.
Return EXACTLY these four files — no more, no fewer:
1. src/App.jsx — BrowserRouter + Routes. One Route per planned page. Import each page component.
2. src/components/Navbar.jsx — navigation links using react-router-dom <Link>. Keep it concise.
3. src/components/Footer.jsx — site name, tagline, copyright year. Keep it concise.
4. src/index.css — CSS reset, font stack, 2–3 colour variables, minimal layout utilities only.

For pages not yet built, stub them inline in App.jsx as arrow-function placeholders — do NOT create separate placeholder files.
Keep every file SHORT. This is scaffolding only — detailed content and styling come in later tasks.
Return at most 4 files total.`,

  home_page: `
Build EXACTLY ONE section or page component based on the student's instruction.
Do NOT generate multiple pages or sections in a single response.
If the instruction mentions multiple pages (About, People, Impact, etc.), build only the
preview/link section on the home page that points to those pages — do NOT build the pages themselves.
Return at most 2 files:
1. src/pages/HomePage.jsx — updated with the new section. Keep JSX concise — use CSS classes, not inline styles.
2. src/index.css — append only the new CSS classes used. Do not rewrite existing rules.

Do NOT modify App.jsx, Navbar, Footer, or any other file.
Return at most 2 files total.`,

  content_pages: `
Build EXACTLY ONE content page based on the student's instruction.
Do NOT generate multiple pages in a single response — create only the page described in this prompt.
The page should:
- Have real, relevant content drawn from what the student wrote (not Lorem ipsum)
- Use consistent styling from index.css
- Import and use Navbar and Footer from src/components/
- Live at src/pages/<PageName>.jsx
Also return ONLY the updated src/App.jsx if and only if a new route needs to be added for this page.
Return at most 2 files total: the new page + App.jsx (if needed). Nothing else.`,

  interactivity: `
Add ONE interactive feature based on the student's instruction. Return at most 2 files:
1. The component or page file that contains the interactive feature (e.g. src/pages/ContactPage.jsx for a form, or src/components/FAQ.jsx for an accordion).
2. src/index.css — append only the new CSS classes needed. Do not rewrite existing rules.

Use useState and useEffect only — no external APIs, no Supabase.
Do NOT modify App.jsx, Navbar, Footer, or any other existing file unless a new route is strictly required.
One feature. Two files maximum.`,

  styling: `
Polish the site's visual design. Return ONLY src/index.css — no other files.
Update index.css to add or refine:
- CSS custom properties (--color-primary, --color-accent, --font-heading, --font-body, etc.)
- Typography scale (h1–h4, body, caption sizes)
- Spacing utilities (consistent margin/padding classes)
- Button and card styles
- Hover transitions (keep under 300ms)
Do NOT return any .jsx files. Components already use CSS classes — updating index.css is sufficient.
Return exactly 1 file: src/index.css.`,

  responsive: `
Make the site mobile-responsive. Return at most 2 files:
1. src/index.css — add media queries (mobile-first: 480px, 768px, 1024px). Cover layout, font sizes, touch targets. Do not rewrite existing rules — append the @media blocks.
2. src/components/Navbar.jsx — add a hamburger menu toggle (useState boolean) for screens under 768px.

Do NOT modify any page files. CSS media queries applied to existing classes are sufficient for page layouts.
Return at most 2 files total.`,

  deploy_prep: `
Prepare the project for deployment.
Return:
- README.md — full setup and deployment instructions:
  1. Clone / unzip
  2. npm install
  3. npm run dev  (local preview)
  4. npm run build  (production build)
  5. Deploy dist/ folder to Netlify, Vercel, or GitHub Pages
- vite.config.js — ensure base path is configurable for subdirectory hosting
- src/components/Navbar.jsx — verify all links use react-router-dom <Link>, not <a href>
Add a brief comment at the top of App.jsx explaining the project structure.`,
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  action: string,
  taskId: string,
  sessionContext: any,
  freeFormInstruction?: string,
): string {
  // communicationStrategy / learningStrategy removed — they add ~200–400 tokens
  // per call (and per chunk in splitAndGenerate) without affecting code quality.
  // Claude's job here is to write correct JSX, not adapt its conversational tone.

  const taskGuidance = freeFormInstruction || TASK_GUIDANCE[taskId] || '';

  if (action === 'critique') {
    return `You are an expert React developer reviewing a student's vibe coding prompt for a Vite + React static website.

Evaluate the prompt on:
1. Clarity — is it clear what they want?
2. Specificity — do they name components, pages, or styles?
3. React-appropriateness — is it thinking in components, props, and state?
4. Completeness — does it cover edge cases (empty states, mobile, etc.)?

Return JSON only:
{ "critique": "what's missing or unclear", "improvedPrompt": "a better version of their prompt", "score": 1-3, "feedback": "encouraging summary" }`;
  }

  const ctx = sessionContext || {};
  const ctxStr = [
    ctx.siteName    && `Site name: ${ctx.siteName}`,
    ctx.sitePurpose && `Purpose: ${ctx.sitePurpose}`,
    ctx.audience    && `Audience: ${ctx.audience}`,
    ctx.pages       && `Planned pages: ${ctx.pages}`,
    ctx.components  && `Planned components: ${ctx.components}`,
  ].filter(Boolean).join('\n');

  return `You are an expert Vite + React developer helping a student build a static informational website (no database).

${ctxStr ? `PROJECT CONTEXT:\n${ctxStr}\n` : ''}
TASK GUIDANCE:\n${taskGuidance}

RULES FOR ALL CODE:
- React 18 functional components with hooks
- react-router-dom v6 for routing (<BrowserRouter>, <Routes>, <Route>, <Link>)
- NO Supabase, NO database, NO external API calls
- Plain CSS (no Tailwind) — styles in index.css or component-level <style> in same file
- .jsx files only (no TypeScript)
- Production-quality code with meaningful comments
- Real content appropriate to the site's purpose — not Lorem Ipsum

RESPONSE FORMAT (JSON only — no markdown fences):
{
  "files": [
    { "path": "src/pages/HomePage.jsx", "content": "full file content here" }
  ],
  "explanation": "2–3 sentences explaining what was built, written directly to the student",
  "sessionContext": { "siteName": "...", "sitePurpose": "...", "audience": "..." }
}
Only include sessionContext fields you learned from this prompt.
Return only the JSON object — no extra text, no backticks.`;
}

// ─── Anthropic call helper ────────────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userContent: any,
  maxTokens: number,
  model = MODEL_SONNET,
): Promise<{ raw: string; stopReason: string; inputTokens: number; outputTokens: number }> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error (${response.status}): ${(err as any)?.error?.message || 'Unknown'}`);
  }

  const completion = await response.json();
  return {
    raw:          completion.content?.[0]?.text || '{}',
    stopReason:   completion.stop_reason        || 'end_turn',
    inputTokens:  completion.usage?.input_tokens  ?? 0,
    outputTokens: completion.usage?.output_tokens ?? 0,
  };
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
// Robustly extract the JSON object even when Claude adds preamble or closing text.

function extractJSON(text: string): string {
  const stripped = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

// ─── Single-call generate ─────────────────────────────────────────────────────
// Makes one Anthropic call, validates stop_reason, parses JSON, returns result.

async function generateOnce(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  imageData?: string,
  imageMediaType?: string,
  imageName?: string,
  maxTokens = 16000,
  model = MODEL_SONNET,
  source = 'WebDevelopmentPage',
  action = 'generate',
  user_id?: string,
  cohort?: string,
): Promise<GenerateResult> {
  const userContent: any = imageData
    ? [
        { type: 'image', source: { type: 'base64', media_type: imageMediaType || 'image/jpeg', data: imageData } },
        { type: 'text',  text: `${imageName ? `[Screenshot: ${imageName}]\n` : ''}${userMessage}` },
      ]
    : userMessage;

  const { raw, stopReason, inputTokens, outputTokens } = await callAnthropic(apiKey, systemPrompt, userContent, maxTokens, model);

  // Log cost — fire-and-forget
  logApiCost({ source, model, action, usage: { input_tokens: inputTokens, output_tokens: outputTokens }, user_id, cohort });

  console.log(`[generate-site-code] stop_reason=${stopReason} raw_len=${raw.length} max_tokens=${maxTokens} in=${inputTokens} out=${outputTokens}`);

  if (stopReason === 'max_tokens') {
    console.error('[generate-site-code] Response truncated — JSON will be malformed.');
    return {
      files:       [],
      explanation: 'The AI ran out of space generating this page. Try describing one page at a time.',
    };
  }

  function sanitizeJSX(s: string): string {
    let out = '', i = 0;
    while (i < s.length) {
      if (s[i] === '"' && s.slice(i, i + 9) === '"content"') {
        out += s.slice(i, i + 9); i += 9;
        while (i < s.length && /[ \t\n\r:]/.test(s[i])) { out += s[i++]; }
        if (i >= s.length || s[i] !== '"') continue;
        i++; let v = '';
        while (i < s.length) {
          const c = s[i];
          if (c === '\\' && i + 1 < s.length) { v += c + s[i+1]; i += 2; continue; }
          if (c === '"') { i++; break; }
          if (c === '\n') { v += '\\n'; i++; continue; }
          if (c === '\r') { v += '\\r'; i++; continue; }
          if (c === '\t') { v += '\\t'; i++; continue; }
          v += c; i++;
        }
        out += '"' + v + '"';
        continue;
      }
      out += s[i++];
    }
    return out;
  }

  let result: any;
  try {
    result = JSON.parse(extractJSON(raw));
  } catch {
    console.warn('[generate-site-code] Initial parse failed — trying JSX sanitizer');
    try {
      result = JSON.parse(sanitizeJSX(extractJSON(raw)));
      console.log('[generate-site-code] Parse succeeded after sanitization');
    } catch {
      console.error('[generate-site-code] JSON parse failed. stop_reason:', stopReason, 'raw (first 500):', raw.slice(0, 500));
      throw new Error(`AI response could not be parsed. Raw output (first 200 chars): ${raw.slice(0, 200)}`);
    }
  }

  return {
    files:          result.files          || [],
    explanation:    result.explanation    || '',
    sessionContext: result.sessionContext,
  };
}

// ─── Multi-page splitter ──────────────────────────────────────────────────────
//
// Splits a freeform student prompt that describes multiple pages/features into
// individual chunks, each of which will be sent in a separate Claude call.
//
// Detection strategy: look for labelled sections — lines (or inline segments)
// that begin with a capitalised word followed by ":" or " —" (em-dash or double-
// hyphen). This matches the natural format learners use, e.g.:
//
//   About: The story of how Bennywhite Davidson decided...
//   People: Meet Silas, Gabriel, Godwill...
//   Impact: 35 learners assessed this April...
//   Join Us: A community leader, a join code...
//
// If the prompt does NOT contain multiple labelled sections it is returned as-is
// (a single-element array), so the caller loop still works without branching.

// Labels that, when found as section headers, trigger splitting.
// Extend this list as new task types arise.
const KNOWN_SECTION_LABELS = new Set([
  // Page-level labels
  'about', 'about us', 'people', 'team', 'impact', 'results',
  'join us', 'join', 'contact', 'contact us', 'gallery', 'portfolio',
  'services', 'projects', 'blog', 'news', 'faq', 'resources',
  'mission', 'vision', 'history', 'partners', 'sponsors',
  // home_page sub-sections (step 3 "page preview" sub-task)
  'home', 'hero',
  // interactivity step 3 features
  'form', 'search', 'filter', 'accordion', 'modal', 'carousel',
  'counter', 'toggle', 'tab', 'tabs', 'map',
]);

// Regex: line starts with one or more capitalised words (the label),
// then ":" or " —" or " --" or just "—".
const SECTION_HEADER_RE = /^([A-Z][A-Za-z]*(?: [A-Za-z]+){0,3})\s*(?::|—|--)\s*/;

export function splitPromptIntoChunks(prompt: string): string[] {
  const lines = prompt.split(/\n/);

  // Collect positions of section-header lines
  const headerPositions: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_HEADER_RE);
    if (match) {
      const label = match[1].toLowerCase();
      if (KNOWN_SECTION_LABELS.has(label)) {
        headerPositions.push(i);
      }
    }
  }

  // Need at least 2 sections to bother splitting
  if (headerPositions.length < 2) {
    // Try inline splitting: "Label: ... Label: ..." on a single line
    // This handles the common case where learners put everything on one line.
    return splitInlinePrompt(prompt);
  }

  // Split into chunks by header position
  const chunks: string[] = [];
  for (let h = 0; h < headerPositions.length; h++) {
    const start = headerPositions[h];
    const end   = h + 1 < headerPositions.length ? headerPositions[h + 1] : lines.length;
    chunks.push(lines.slice(start, end).join('\n').trim());
  }
  return chunks.filter(c => c.length > 0);
}

// Inline splitter: handles single-line prompts like
// "About: ... People: ... Impact: ..."
// Splits at boundaries where a known label follows a sentence boundary.
function splitInlinePrompt(prompt: string): string[] {
  // Build a pattern matching "Label:" or "Label —" at word boundaries
  const labelPattern = Array.from(KNOWN_SECTION_LABELS)
    .map(l => l.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '))
    .sort((a, b) => b.length - a.length)   // longest first to avoid partial matches
    .map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  // Match "SomeLabel:" or "SomeLabel —" that is preceded by end-of-sentence punctuation
  // or the start of the string
  const splitRe = new RegExp(
    `(?<=[.!?]\\s{0,3}|^)(?=(${labelPattern})\\s*(?::|—|--)\\s*)`,
    'g',
  );

  const parts = prompt.split(splitRe).filter(p => p.trim().length > 0);

  // split() with a lookahead leaves the delimiter in the NEXT part — good, that's the label.
  // But the regex group captures also appear in the array. Filter them out: keep only
  // chunks that start with a known label (or the whole string if no split occurred).
  const cleaned = parts.filter((p, i) => {
    // Every other capture-group artefact is a single label word — skip it
    const trimmed = p.trim();
    if (!trimmed) return false;
    // Skip pure-label fragments (would be tiny, < 20 chars, and contain no period/colon body)
    if (trimmed.length < 20 && KNOWN_SECTION_LABELS.has(trimmed.toLowerCase())) return false;
    return true;
  });

  return cleaned.length >= 2 ? cleaned : [prompt];
}

// ─── Tasks that may contain multi-page / multi-feature prompts ────────────────
//
// These are the tasks where a learner's single text response legitimately describes
// multiple pages or features. The splitter is only invoked for these tasks.
// All other tasks receive a single-call generate (existing behaviour).

const SPLITTABLE_TASKS = new Set([
  'home_page',       // step 3: "write a one-sentence preview for each inner page"
  'content_pages',   // steps 1–3: each step may describe 1–4 pages
  'interactivity',   // step 3: may describe multiple interactive features
]);

// ─── Split-and-generate: the shared workhorse ─────────────────────────────────
//
// Called when taskId is in SPLITTABLE_TASKS.
// Splits the prompt, runs one Claude call per chunk, merges results.
// Returns a single GenerateResult with all files merged and explanations joined.
//
// File merging strategy:
//   - Later calls win on path collisions (same as the frontend mergeFiles()).
//   - src/App.jsx is special: we only keep the last version since each call may
//     add a new route, and the last call sees all prior routes via projectFiles.
//   - src/index.css is accumulated additively — we keep all versions and join them.
//     (Each call appends only the CSS it needs, so concatenation is safe.)

async function splitAndGenerate(
  apiKey: string,
  systemPrompt: string,
  prompt: string,
  projectFiles: ProjectFile[],
  action: string,
  taskId: string,
  sessionContext: any,
  imageData?: string,
  imageMediaType?: string,
  imageName?: string,
  contentCap = 250,
  maxTokens = 16000,
  source = 'WebDevelopmentPage',
  user_id?: string,
  cohort?: string,
): Promise<GenerateResult> {
  const chunks = splitPromptIntoChunks(prompt);

  // If the splitter couldn't find multiple sections, fall back to a single call.
  // (This is the normal path for tasks in SPLITTABLE_TASKS that happen to have
  //  a simple one-page prompt.)
  if (chunks.length <= 1) {
    console.log(`[generate-site-code] splitAndGenerate: no split detected for taskId=${taskId}, using single call`);
    const relevantFiles = buildRelevantFiles(projectFiles, taskId, contentCap);
    const userMessage = buildUserMessage(action, taskId, prompt, relevantFiles);
    return generateOnce(apiKey, systemPrompt, userMessage, imageData, imageMediaType, imageName, maxTokens, MODEL_SONNET, source, action, user_id, cohort);
  }

  console.log(`[generate-site-code] splitAndGenerate: ${chunks.length} chunks for taskId=${taskId}`);

  // Accumulate files across calls.
  // Use a Map keyed by path so later calls overwrite earlier ones (last-wins).
  const fileMap = new Map<string, string>();
  // CSS is special — we accumulate rather than overwrite so each call's additions survive.
  const cssAccumulator: string[] = [];
  const explanations: string[] = [];
  let mergedSessionContext: Record<string, string> | undefined;

  // Carry the current projectFiles forward so each iteration sees the prior output.
  let currentFiles = [...projectFiles];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[generate-site-code] chunk ${i + 1}/${chunks.length}: "${chunk.slice(0, 80)}..."`);

    const relevantFiles = buildRelevantFiles(currentFiles, taskId, contentCap);
    const userMessage   = buildUserMessage(action, taskId, chunk, relevantFiles);

    let result: GenerateResult;
    try {
      // Only attach the image to the first chunk — it's a context image, not per-page.
      result = await generateOnce(
        apiKey,
        systemPrompt,
        userMessage,
        i === 0 ? imageData       : undefined,
        i === 0 ? imageMediaType  : undefined,
        i === 0 ? imageName       : undefined,
        maxTokens,
        MODEL_SONNET,
        source,
        action,
        user_id,
        cohort,
      );
    } catch (err: any) {
      // A single chunk failing should not abort all subsequent chunks.
      // Log and continue — the user gets partial results plus an explanation.
      console.error(`[generate-site-code] chunk ${i + 1} failed:`, err.message);
      explanations.push(`(Page ${i + 1} could not be generated: ${err.message})`);
      continue;
    }

    // Merge files from this chunk into the accumulator.
    for (const file of result.files) {
      if (file.path === 'src/index.css') {
        // Accumulate CSS — we'll merge it after all chunks complete.
        cssAccumulator.push(file.content);
      } else {
        // Last-wins for all other files (including App.jsx — last call has all routes).
        fileMap.set(file.path, file.content);
      }
    }

    if (result.explanation) explanations.push(result.explanation);
    if (result.sessionContext) mergedSessionContext = { ...mergedSessionContext, ...result.sessionContext };

    // Update currentFiles so the next chunk sees what we just built.
    // This is critical for App.jsx: each call adds a route, and the next call
    // needs to see the updated App.jsx to avoid clobbering earlier routes.
    for (const file of result.files) {
      const idx = currentFiles.findIndex(f => f.path === file.path);
      if (idx >= 0) currentFiles[idx] = file;
      else currentFiles = [...currentFiles, file];
    }
  }

  // Merge accumulated CSS: take the base (first chunk's version, which is already
  // the full file) and append additions from subsequent chunks.
  if (cssAccumulator.length > 0) {
    // First entry is the complete CSS file as of chunk 1.
    // Subsequent entries are append-only additions from later chunks.
    const [base, ...additions] = cssAccumulator;
    const existingCss = base || '';
    const newRules = additions.join('\n\n/* --- next page additions --- */\n\n');
    fileMap.set('src/index.css', newRules ? `${existingCss}\n\n${newRules}` : existingCss);
  }

  const mergedFiles: ProjectFile[] = Array.from(fileMap.entries()).map(([path, content]) => ({
    path,
    content,
  }));

  return {
    files:          mergedFiles,
    explanation:    explanations.join(' '),
    sessionContext: mergedSessionContext,
  };
}

// ─── Shared message builders ──────────────────────────────────────────────────

function buildRelevantFiles(
  projectFiles: ProjectFile[],
  taskId: string,
  contentCap: number,
): string {
  return (projectFiles || [])
    .filter((f: any) => f.content?.length > 10)
    .slice(0, 8)
    .map((f: any) => `=== ${f.path} ===\n${f.content.substring(0, contentCap)}`)
    .join('\n\n');
}

function buildUserMessage(
  action: string,
  taskId: string,
  prompt: string,
  relevantFiles: string,
): string {
  return action === 'critique'
    ? `Review this prompt for a Vite + React static website:\n\n"${prompt}"`
    : `Task: ${taskId || 'general'}\n\nStudent instruction:\n${prompt}\n\n${
        relevantFiles ? `Current project files:\n${relevantFiles}` : ''
      }`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    action, prompt, taskId, projectFiles, sessionContext,
    imageData, imageMediaType, imageName,
    freeFormFeedback, freeFormInstruction,
    source  = 'WebDevelopmentPage',
    user_id,
    cohort,
  } = req.body;
  // communicationStrategy / learningStrategy intentionally not destructured —
  // they are no longer passed to the system prompt for code generation tasks.

  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });

  try {
    // For content_pages, existing files can already be 150+ lines each.
    // Truncate more aggressively so the input payload doesn't crowd out the output budget.
    // Phase 3 tasks (styling, responsive) operate on a fully-built project — cap tightly.
    const INPUT_CAPS: Record<string, number> = {
      define_site:   600,
      plan_pages:    600,
      app_shell:     300,
      home_page:     300,
      content_pages: 250,
      interactivity: 250,
      styling:       200,
      responsive:    200,
      deploy_prep:   400,
    };
    const contentCap = INPUT_CAPS[taskId] ?? 400;

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    // Phase 1 planning tasks return a single markdown file — 4000 tokens is enough.
    // Phase 2+ tasks generate JSX files. With per-chunk splitting each call stays
    // well under 8000 tokens, but we keep 8000 as the per-call budget.
    const SINGLE_FILE_TASKS = new Set(['define_site', 'plan_pages']);
    const maxTokens = action === 'critique'           ? 4000
                    : SINGLE_FILE_TASKS.has(taskId)   ? 4000
                    : taskId === 'content_pages'      ? 12000
                    : 16000;

    const systemPrompt = buildSystemPrompt(
      action,
      taskId,
      sessionContext,
      freeFormFeedback ? freeFormInstruction : undefined,
    );

    // ── Critique: no splitting needed ─────────────────────────────────────────
    if (action === 'critique') {
      const relevantFiles = buildRelevantFiles(projectFiles || [], taskId, contentCap);
      const userMessage   = buildUserMessage(action, taskId, prompt.trim(), relevantFiles);
      const { raw, stopReason, inputTokens, outputTokens } = await callAnthropic(apiKey, systemPrompt, userMessage, maxTokens, MODEL_HAIKU);

      // Critique uses Haiku — adequate for prompt feedback, ~3× cheaper than Sonnet
      logApiCost({ source, model: MODEL_HAIKU, action: 'critique', usage: { input_tokens: inputTokens, output_tokens: outputTokens }, user_id, cohort });

      console.log(`[generate-site-code] critique stop_reason=${stopReason} raw_len=${raw.length}`);

      let result: any;
      try { result = JSON.parse(extractJSON(raw)); }
      catch { return res.status(200).json({ critique: raw, feedback: raw }); }

      return res.status(200).json({
        critique:        result.critique  || result.feedback || raw,
        feedback:        result.feedback  || result.critique || raw,
        improvedPrompt:  result.improvedPrompt,
        score:           result.score,
      });
    }

    // ── Generate / iterate ────────────────────────────────────────────────────
    let result: GenerateResult;

    if (SPLITTABLE_TASKS.has(taskId)) {
      // Multi-page path: split prompt into per-page chunks and call Claude once per chunk.
      result = await splitAndGenerate(
        apiKey,
        systemPrompt,
        prompt.trim(),
        projectFiles || [],
        action,
        taskId,
        sessionContext,
        imageData,
        imageMediaType,
        imageName,
        contentCap,
        maxTokens,
        source,
        user_id,
        cohort,
      );
    } else {
      // Standard path: single call (all non-splittable tasks).
      const relevantFiles = buildRelevantFiles(projectFiles || [], taskId, contentCap);
      const userMessage   = buildUserMessage(action, taskId, prompt.trim(), relevantFiles);

      try {
        result = await generateOnce(
          apiKey,
          systemPrompt,
          userMessage,
          imageData,
          imageMediaType,
          imageName,
          maxTokens,
          MODEL_SONNET,
          source,
          action,
          user_id,
          cohort,
        );
      } catch (parseErr: any) {
        return res.status(500).json({ error: parseErr.message });
      }
    }

    return res.status(200).json({
      files:          result.files          || [],
      explanation:    result.explanation    || '',
      sessionContext: result.sessionContext,
    });

  } catch (err: any) {
    console.error('[generate-site-code]', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}