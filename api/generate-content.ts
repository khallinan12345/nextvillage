// api/generate-content.ts
// Takes the learner's raw answer to a content-creation sub-task and returns:
//   - response: short coaching feedback shown in the chat panel
//   - content: the actual content-piece body (blog post, social post, email,
//     etc.), present only for tasks that should actually produce or revise
//     prose — see TASK_META.producesContent, mirrored from the same map in
//     content-task-instruction.ts.
//
// Also handles action: 'improve_english' (the canvas's standalone "Improve
// English" button in AIContentCreationPage.tsx), which always rewrites
// `existingContent` for clarity and returns the full revision as `content`.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

function logCost(inputTokens: number, outputTokens: number, cacheHitTokens = 0, cacheWriteTokens = 0) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || (!inputTokens && !outputTokens)) return;

  const MTok = 1_000_000;
  const standardInput = Math.max(0, inputTokens - cacheHitTokens - cacheWriteTokens);
  const estimatedCost =
    (standardInput    / MTok) * 3.00  +
    (cacheWriteTokens / MTok) * 3.75  +
    (cacheHitTokens   / MTok) * 0.30  +
    (outputTokens     / MTok) * 15.00;

  fetch(`${supabaseUrl}/rest/v1/api_cost_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      page:               'AIContentCreationPage',
      provider:           'anthropic',
      model:              ANTHROPIC_MODEL,
      action:             'generate',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_hit_tokens:   cacheHitTokens,
      cache_write_tokens: cacheWriteTokens,
      estimated_cost_usd: estimatedCost,
      logged_at:          new Date().toISOString(),
    }),
  }).catch(() => {});
}

const COMM_LEVEL_LINE: Record<number, string> = {
  0: 'The learner is at a very basic communication level. Use very simple words and short sentences. Be extra encouraging.',
  1: 'The learner is at an emerging communication level. Use clear, simple language with short sentences.',
  2: 'The learner is at a developing communication level. You can use everyday professional language.',
  3: 'The learner is at a proficient communication level. Use clear, professional language — treat them as a capable adult writer.',
};

// Which tasks should actually produce/revise real content-piece prose, vs.
// tasks that are purely planning/clarifying (Understand phase) and should
// only get short coaching. Kept in sync with TASK_SEEDS in
// content-task-instruction.ts.
const PRODUCES_CONTENT: Record<string, boolean> = {
  choose_type: false, define_audience: false, define_purpose: false, research_topic: false,
  write_draft: true, add_voice: true, structure_refine: true,
  edit_clarity: true, platform_adapt: true, final_review: false,
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  blog_post: 'Blog Post', social_media: 'Social Media post', email: 'Email / Newsletter',
  video_script: 'Video Script', grant_proposal: 'Grant / Proposal',
  product_description: 'Product Description', press_release: 'Press Release', story: 'Short Story',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    action, prompt, taskId, taskLabel, contentType,
    sessionContext, communicationStrategy, learningStrategy, communicationLevel, existingContent,
  } = req.body;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const commStr  = communicationStrategy ? JSON.stringify(communicationStrategy) : null;
  const learnStr = learningStrategy      ? JSON.stringify(learningStrategy)      : null;
  const levelStr = communicationLevel != null && COMM_LEVEL_LINE[communicationLevel] ? COMM_LEVEL_LINE[communicationLevel] : null;
  const persona = (commStr || learnStr || levelStr)
    ? '\n\nLEARNER PROFILE — adapt vocabulary and tone to match:\n'
      + (commStr  ? `Communication strategy: ${commStr}\n` : '')
      + (learnStr ? `Learning strategy: ${learnStr}\n`     : '')
      + (levelStr ? `Communication level: ${levelStr}\n`   : '')
    : '';

  const typeLabel = CONTENT_TYPE_LABELS[contentType] || 'content';
  const ctx: any = sessionContext || {};
  const ctxLines = [
    ctx.audience && `Audience: ${ctx.audience}`,
    ctx.purpose  && `Purpose: ${ctx.purpose}`,
  ].filter(Boolean).join('\n');

  const isImproveEnglish = action === 'improve_english';
  const producesContent  = isImproveEnglish || PRODUCES_CONTENT[taskId] === true;

  let system: string;
  let user: string;

  // Long-form prose routinely contains quoted dialogue, apostrophes, and
  // line breaks that break naive JSON.parse when crammed into a JSON string
  // value (confirmed live: a real draft response failed to parse because it
  // quoted an example WhatsApp message). Content-producing responses use a
  // plain delimiter format instead of JSON, so the model never has to
  // escape anything. Coaching-only responses stay short enough that JSON is
  // fine — same as content-task-instruction.ts and evaluate-content-session.ts.
  const DELIM = '===CONTENT===';

  if (isImproveEnglish) {
    system = `You are an expert editor improving the English of a piece of ${typeLabel}, without changing its meaning, facts, or voice.${persona}

YOUR JOB — respond in exactly this format, nothing before or after:

<1-2 sentences summarising what kind of changes you made, e.g. "Tightened a few long sentences and fixed some verb tense issues.">
${DELIM}
<the full piece, rewritten for clearer grammar, flow, and word choice. Keep the same length and structure unless a sentence is genuinely broken. Preserve the writer's own voice and every fact and detail — do not invent anything new. Do not wrap this in quotes.>`;
    user = `Here is the content to improve:\n\n${prompt}\n\nRewrite it for clearer English.`;
  } else if (producesContent) {
    system = `You are a skilled ${typeLabel} writer helping a learner create real content in the "AI Content Creation" workshop.${persona}

The learner just answered a question for this step: "${taskLabel}".
${action === 'iterate' ? 'They are refining an earlier answer or draft based on feedback — build on the existing content, do not start over from nothing.' : ''}

YOUR JOB — respond in exactly this format, nothing before or after:

<2-3 sentences of direct, encouraging coaching on what you changed or added and why>
${DELIM}
<the full, updated ${typeLabel} body — write or revise real, finished prose a reader could actually read, incorporating what they just told you. Use their own facts, ideas, and words where they gave them; do not invent details they never mentioned. Do not wrap this in quotes.>

${ctxLines ? `WHAT THEY'VE ALREADY TOLD YOU:\n${ctxLines}` : ''}
${existingContent ? `\nTHEIR CONTENT SO FAR (revise/extend this, do not discard it):\n${String(existingContent).slice(0, 3000)}` : '\n(No content written yet — this is the first draft.)'}`;
    user = `Their answer:\n${prompt}\n\nWrite or revise the ${typeLabel} using this.`;
  } else {
    system = `You are a warm, practical writing coach helping a learner plan a real ${typeLabel} in the "AI Content Creation" workshop.${persona}

The learner just answered a planning question for this step: "${taskLabel}". This step is about planning and clarifying direction — it does not produce finished content yet, just coach them.

YOUR JOB:
Return "response": 2-3 sentences of direct, encouraging coaching on their answer. Affirm what's strong, and if something is vague, name it plainly. No filler.

${ctxLines ? `WHAT THEY'VE ALREADY TOLD YOU:\n${ctxLines}` : ''}

Return JSON only — no markdown fences:
{ "response": "..." }`;
    user = `Their answer:\n"${prompt}"\n\nCoach it.`;
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       ANTHROPIC_MODEL,
        max_tokens:  producesContent ? 2000 : 400,
        temperature: 0.5,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error (${response.status}): ${(err as any)?.error?.message || 'Unknown'}`);
    }

    const completion = await response.json();
    logCost(
      completion.usage?.input_tokens                ?? 0,
      completion.usage?.output_tokens               ?? 0,
      completion.usage?.cache_read_input_tokens     ?? 0,
      completion.usage?.cache_creation_input_tokens ?? 0,
    );
    const raw     = completion.content?.[0]?.text || '';
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    if (producesContent) {
      const idx = cleaned.indexOf(DELIM);
      if (idx === -1) {
        console.error('[generate-content] delimiter missing from response, RAW (first 500 chars):', cleaned.slice(0, 500));
        return res.status(200).json({ content: prompt.trim(), response: 'Good progress — keep going.' });
      }
      const response = cleaned.slice(0, idx).trim();
      const content  = cleaned.slice(idx + DELIM.length).trim();
      return res.status(200).json({
        content:  content  || prompt.trim(),
        response: response || 'Good progress — keep going.',
      });
    }

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[generate-content] JSON parse failed:', parseErr, '\nRAW (first 500 chars):', cleaned.slice(0, 500));
      return res.status(200).json({ response: 'Good thinking. Click Next Step when you are ready to continue.' });
    }

    return res.status(200).json({ response: result.response || 'Good progress — keep going.' });
  } catch (err: any) {
    console.error('[generate-content]', err);
    // Non-blocking fallback — the learner's own text still lands somewhere useful.
    return res.status(200).json(
      producesContent
        ? { content: prompt.trim(), response: 'Good progress. Click Next Step when you are ready to continue.' }
        : { response: 'Good thinking. Click Next Step when you are ready to continue.' },
    );
  }
}
