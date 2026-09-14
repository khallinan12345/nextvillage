// api/generate-web-code.ts — AI code generation & prompt critique using Anthropic Claude
//
// PATCH 2026-05-07:
//   1. callClaude() now returns full API response so we can read usage tokens
//   2. logCost() writes input/output tokens + estimated cost to api_cost_log
//   3. Context caps: pageContext snippets 200 chars, existingCode 3000 chars in generate, 4000 in iterate
//   4. critique uses claude-haiku-4-5-20251001 (Sonnet is overkill for prompt feedback)

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ImageMeta {
  id: string;
  label: string;
  role: 'background' | 'icon' | 'logo' | 'hero' | 'photo' | 'other';
  width: number;
  height: number;
}

interface GenerateRequest {
  action: 'generate' | 'critique' | 'iterate';
  prompt: string;
  existingCode?: string;
  pageContext?: { name: string; code: string }[];
  images?: ImageMeta[];
  // Optional — passed from the calling page so cost rows are attributed correctly
  source?: string;   // e.g. 'VibeCodingPage' | 'WebDevPage' | 'FullstackPage'
  user_id?: string;
  cohort?: string;
}

const ANTHROPIC_API_URL  = 'https://api.anthropic.com/v1/messages';
const MODEL_SONNET       = 'claude-sonnet-5';
const MODEL_HAIKU        = 'claude-haiku-4-5-20251001'; // critique only

// Token prices per million (update if Anthropic changes rates)
const PRICES: Record<string, { input: number; output: number }> = {
  [MODEL_SONNET]: { input: 3.0,  output: 15.0  },
  [MODEL_HAIKU]:  { input: 1.0,  output:  5.0  },
};

// ─── Cost logger ─────────────────────────────────────────────────────────────

async function logCost({
  source,
  model,
  action,
  inputTokens,
  outputTokens,
  user_id,
  cohort,
}: {
  source: string;
  model: string;
  action: string;
  inputTokens: number;
  outputTokens: number;
  user_id?: string;
  cohort?: string;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return; // silently skip if env not set

  const prices  = PRICES[model] ?? PRICES[MODEL_SONNET];
  const cost_usd =
    (inputTokens  / 1_000_000) * prices.input +
    (outputTokens / 1_000_000) * prices.output;

  // Fire-and-forget — never block the response
  fetch(`${supabaseUrl}/rest/v1/api_cost_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      page:          source,
      action,
      model,
      input_tokens:  inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost_usd,
      user_id:       user_id  ?? null,
      cohort:        cohort   ?? null,
      logged_at:     new Date().toISOString(),
    }),
  }).catch(() => {}); // swallow — logging must never crash the handler
}

// ─── Claude caller — now returns usage alongside text ────────────────────────

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  model = MODEL_SONNET,
  maxTokens = 8000,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

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
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Anthropic API error:', response.status, errorBody);
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text:         data.content?.[0]?.text ?? '',
    inputTokens:  data.usage?.input_tokens  ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ── Generate HTML/CSS/JS from a prompt ──────────────────────────────────────

async function generateCode(
  prompt: string,
  source: string,
  user_id?: string,
  cohort?: string,
  existingCode?: string,
  pageContext?: { name: string; code: string }[],
  images?: ImageMeta[],
): Promise<{ code: string; explanation: string }> {

  // CAP: pageContext snippets to 200 chars each (was 500)
  const contextBlock = pageContext?.length
    ? `\n\nThe learner's project already has these pages (maintain visual consistency):\n${pageContext
        .map((p) => `--- ${p.name} ---\n${p.code.substring(0, 200)}...`)
        .join('\n\n')}`
    : '';

  // CAP: existingCode to 3000 chars in generate (was unlimited)
  const existingBlock = existingCode
    ? `\n\nThe current code in the editor is:\n\`\`\`html\n${existingCode.substring(0, 3000)}\n\`\`\``
    : '';

  const imageBlock = images?.length
    ? `\n\nAVAILABLE UPLOADED IMAGES:\n${images
        .map((img) => `- ID: "${img.id}" | Label: "${img.label}" | Role: ${img.role} | Size: ${img.width}×${img.height}`)
        .join('\n')}\n\nTo use an uploaded image, set the src to exactly: %%IMAGE_${'{id}'}%% (replacing {id} with the actual image ID).`
    : '';

  const imageRule = images?.length
    ? `\n- Use %%IMAGE_{id}%% placeholder for uploaded images. NEVER use placeholder.com URLs.`
    : '';

  const systemPrompt = `You are an expert web developer and teacher helping students learn to build web pages through "vibe coding" — turning natural language descriptions into working code.

RULES:
- Generate a COMPLETE, self-contained HTML file with embedded CSS and JavaScript.
- The code must be production-quality, well-structured, and visually polished.
- Use modern CSS (flexbox, grid, custom properties, gradients, transitions).
- Include helpful HTML comments explaining key sections so the learner can study the code.
- Make it responsive and visually impressive — students should feel proud of what they built.
- If the prompt is vague, make creative decisions and note them in your explanation.
- Do NOT use external frameworks or CDNs unless specifically asked.${imageRule}

RESPONSE FORMAT — you MUST follow this exactly:
===CODE===
(the complete HTML file here)
===END_CODE===

===EXPLANATION===
(2-3 sentences explaining what you built and any creative decisions you made)
===END_EXPLANATION===`;

  const userMessage = `${prompt}${contextBlock}${existingBlock}${imageBlock}`;

  const { text: raw, inputTokens, outputTokens } = await callClaude(systemPrompt, userMessage, MODEL_SONNET, 8000);

  // Log cost (fire-and-forget)
  logCost({ source, model: MODEL_SONNET, action: 'generate', inputTokens, outputTokens, user_id, cohort });

  const codeMatch    = raw.match(/===CODE===\s*([\s\S]*?)\s*===END_CODE===/);
  const explainMatch = raw.match(/===EXPLANATION===\s*([\s\S]*?)\s*===END_EXPLANATION===/);

  return {
    code:        codeMatch?.[1]?.trim()    ?? raw,
    explanation: explainMatch?.[1]?.trim() ?? 'Code generated from your prompt.',
  };
}

// ── Iterate on existing code with a new prompt ──────────────────────────────

async function iterateCode(
  prompt: string,
  existingCode: string,
  source: string,
  user_id?: string,
  cohort?: string,
  pageContext?: { name: string; code: string }[],
  images?: ImageMeta[],
): Promise<{ code: string; explanation: string }> {

  // CAP: pageContext snippets to 200 chars each (was 300)
  const contextBlock = pageContext?.length
    ? `\n\nOther pages in the project:\n${pageContext
        .map((p) => `--- ${p.name} ---\n${p.code.substring(0, 200)}...`)
        .join('\n\n')}`
    : '';

  const imageBlock = images?.length
    ? `\n\nAVAILABLE UPLOADED IMAGES:\n${images
        .map((img) => `- ID: "${img.id}" | Label: "${img.label}" | Role: ${img.role} | Size: ${img.width}×${img.height}`)
        .join('\n')}\n\nTo use an uploaded image, set the src to exactly: %%IMAGE_${'{id}'}%% (replacing {id} with the actual image ID).`
    : '';

  const imageRule = images?.length
    ? `\n- Use %%IMAGE_{id}%% placeholder for uploaded images. NEVER use placeholder.com URLs.`
    : '';

  const systemPrompt = `You are an expert web developer and teacher. The learner has existing code and wants to modify or improve it based on a new prompt. This is an ITERATIVE process.

RULES:
- Modify the existing code to incorporate the learner's request.
- Preserve existing functionality unless the learner asks to change it.
- Keep the same overall structure and style unless told otherwise.
- Add helpful HTML comments for any NEW sections you add.
- Return a COMPLETE updated HTML file (not just a diff).${imageRule}

RESPONSE FORMAT — you MUST follow this exactly:
===CODE===
(the complete updated HTML file)
===END_CODE===

===EXPLANATION===
(2-3 sentences about what you changed and why)
===END_EXPLANATION===`;

  // CAP: existingCode to 4000 chars in iterate (was unlimited — this is the main cost driver)
  const truncatedCode = existingCode.substring(0, 4000);
  const wasTruncated  = existingCode.length > 4000;
  const truncNote     = wasTruncated ? '\n\n[Note: code was truncated to fit context limits — preserve all sections you can infer from structure]' : '';

  const userMessage = `Here is my current code:\n\`\`\`html\n${truncatedCode}${truncNote}\n\`\`\`\n\nPlease make these changes: ${prompt}${contextBlock}${imageBlock}`;

  const { text: raw, inputTokens, outputTokens } = await callClaude(systemPrompt, userMessage, MODEL_SONNET, 8000);

  // Log cost (fire-and-forget)
  logCost({ source, model: MODEL_SONNET, action: 'iterate', inputTokens, outputTokens, user_id, cohort });

  const codeMatch    = raw.match(/===CODE===\s*([\s\S]*?)\s*===END_CODE===/);
  const explainMatch = raw.match(/===EXPLANATION===\s*([\s\S]*?)\s*===END_EXPLANATION===/);

  return {
    code:        codeMatch?.[1]?.trim()    ?? raw,
    explanation: explainMatch?.[1]?.trim() ?? 'Code updated based on your prompt.',
  };
}

// ── Critique a prompt — uses Haiku (Sonnet is overkill here) ────────────────

async function critiquePrompt(
  prompt: string,
  source: string,
  user_id?: string,
  cohort?: string,
  existingCode?: string,
): Promise<{ critique: string; improvedPrompt: string; score: number }> {

  // CAP: existingCode snippet to 500 chars for critique (was 1000)
  const codeBlock = existingCode
    ? `\n\nTheir current code in the editor:\n\`\`\`html\n${existingCode.substring(0, 500)}\n\`\`\``
    : '';

  const systemPrompt = `You are a prompt engineering coach helping students learn to write better prompts for AI code generation (a skill called "vibe coding").

Evaluate their prompt on these dimensions:
1. SPECIFICITY — Did they describe what they want clearly?
2. VISUAL DETAIL — Did they mention colors, layout, spacing, fonts, or visual style?
3. CONTENT — Did they specify what text, images, or data to include?
4. INTERACTIVITY — Did they describe any user interactions or behaviors?
5. STRUCTURE — Did they mention sections, components, or page organization?

Be encouraging but specific. Students are learning — celebrate what they did well and give concrete suggestions.

RESPONSE FORMAT — you MUST follow this exactly:
===CRITIQUE===
(your friendly, constructive feedback in 3-5 bullet points — use emoji for visual flair)
===END_CRITIQUE===

===IMPROVED_PROMPT===
(rewrite their prompt as a stronger version they can learn from)
===END_IMPROVED_PROMPT===

===SCORE===
(a number from 1-10 rating the prompt quality)
===END_SCORE===`;

  const userMessage = `Here is the student's prompt:\n"${prompt}"${codeBlock}`;

  // Use Haiku for critique — much cheaper, fully adequate for this task
  const { text: raw, inputTokens, outputTokens } = await callClaude(systemPrompt, userMessage, MODEL_HAIKU, 1000);

  // Log cost (fire-and-forget)
  logCost({ source, model: MODEL_HAIKU, action: 'critique', inputTokens, outputTokens, user_id, cohort });

  const critiqueMatch = raw.match(/===CRITIQUE===\s*([\s\S]*?)\s*===END_CRITIQUE===/);
  const improvedMatch = raw.match(/===IMPROVED_PROMPT===\s*([\s\S]*?)\s*===END_IMPROVED_PROMPT===/);
  const scoreMatch    = raw.match(/===SCORE===\s*(\d+)\s*===END_SCORE===/);

  return {
    critique:       critiqueMatch?.[1]?.trim() ?? 'Could not generate critique.',
    improvedPrompt: improvedMatch?.[1]?.trim() ?? prompt,
    score:          parseInt(scoreMatch?.[1]   ?? '5', 10),
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      action,
      prompt,
      existingCode,
      pageContext,
      images,
      source  = 'generate-web-code', // fallback so rows are never "unknown"
      user_id,
      cohort,
    }: GenerateRequest = req.body;

    if (!action || !prompt)
      return res.status(400).json({ error: 'Missing action or prompt' });

    if (prompt.length > 5000)
      return res.status(400).json({ error: 'Prompt too long (max 5,000 chars)' });

    console.log(`[generate-web-code] action=${action}, source=${source}, prompt="${prompt.substring(0, 80)}...", images=${images?.length || 0}`);

    switch (action) {
      case 'generate': {
        const result = await generateCode(prompt, source, user_id, cohort, existingCode, pageContext, images);
        return res.status(200).json({ success: true, ...result });
      }
      case 'iterate': {
        if (!existingCode)
          return res.status(400).json({ error: 'Existing code required for iterate' });
        const result = await iterateCode(prompt, existingCode, source, user_id, cohort, pageContext, images);
        return res.status(200).json({ success: true, ...result });
      }
      case 'critique': {
        const result = await critiquePrompt(prompt, source, user_id, cohort, existingCode);
        return res.status(200).json({ success: true, ...result });
      }
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error: any) {
    console.error('[generate-web-code] Error:', error);
    return res.status(500).json({
      error:   error.message || 'Internal server error',
      success: false,
    });
  }
}