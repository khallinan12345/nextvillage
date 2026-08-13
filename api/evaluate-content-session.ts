// api/evaluate-content-session.ts
// Evaluates a learner's completed (or in-progress) content pieces and prompt
// history from the AI Content Creation workshop, and returns a score +
// coaching advice. Response shape is consumed directly by
// AIContentCreationPage.tsx's handleEvaluate/handleSaveProject.

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
      action:             'evaluate',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_hit_tokens:   cacheHitTokens,
      cache_write_tokens: cacheWriteTokens,
      estimated_cost_usd: estimatedCost,
      logged_at:          new Date().toISOString(),
    }),
  }).catch(() => {});
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  blog_post: 'Blog Post', social_media: 'Social Media post', email: 'Email / Newsletter',
  video_script: 'Video Script', grant_proposal: 'Grant / Proposal',
  product_description: 'Product Description', press_release: 'Press Release', story: 'Short Story',
};

const EVALUATION_SYSTEM = `You are an expert content strategist and writing coach evaluating a learner's work from the "AI Content Creation" workshop — a programme that teaches learners to plan, draft, and polish real content (blog posts, social media, emails, scripts, proposals, product descriptions, press releases, or short stories) using AI as a writing partner, not a replacement for their own thinking.

You will evaluate 6 skills based on their prompt history (their working-through of each step) and their final content piece(s).

SCORING SCALE (apply to every skill):
0 — No Evidence: missing or no meaningful attempt.
1 — Developing: present but vague, generic, or not specific to their actual content.
2 — Proficient: clear, specific, and genuinely usable in real content.
3 — Advanced: specific and usable, AND shows refinement — they clearly revised or sharpened their thinking or writing across the session.

SKILLS TO SCORE:
1. audience_clarity — Is the intended reader a specific, describable person, not "everyone"?
2. purpose_focus — Is there one clear goal for what the content should make the reader think, feel, or do?
3. idea_quality — Are the key ideas/facts/stories specific and concrete, not generic statements?
4. draft_craft — Does the draft actually read well: clear structure, real voice, active language?
5. clarity_editing — Is the final piece clear and tight, free of unnecessary words and passive voice?
6. platform_fit — Is the content adapted for where it will actually be published (length, tone, headline/caption/subject line)?

For each skill, give a 0-3 score and a 1-2 sentence justification grounded in what they actually wrote.

Return JSON only — no markdown fences:
{
  "overall_score_average": 0.0,
  "content_readiness": "Early Draft" | "Needs Polish" | "Ready to Publish",
  "detailed_scores": {
    "audience_clarity": { "score": 0, "justification": "" },
    "purpose_focus": { "score": 0, "justification": "" },
    "idea_quality": { "score": 0, "justification": "" },
    "draft_craft": { "score": 0, "justification": "" },
    "clarity_editing": { "score": 0, "justification": "" },
    "platform_fit": { "score": 0, "justification": "" }
  },
  "strengths_summary": "2-4 sentences naming what is genuinely strong, with specifics.",
  "highest_leverage_improvements": "2-4 sentences on the 1-3 changes that would most improve this content before publishing.",
  "next_action": "One concrete sentence: the single next thing they should do with this piece.",
  "advice": "4-8 sentences of direct, practical coaching advice — reference their actual content, audience, and purpose by name/specifics where possible. End with encouragement grounded in what they've built so far, not generic praise."
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { promptHistory, contentPieces, contentType, sessionContext } = req.body;

  const hasContent = Array.isArray(contentPieces) && contentPieces.some((p: any) => typeof p?.body === 'string' && p.body.trim().length > 0);
  if (!promptHistory?.length && !hasContent) {
    return res.status(400).json({ error: 'No content to evaluate' });
  }

  const promptLog = (promptHistory || [])
    .map((p: any, i: number) => `[${i + 1}] (${p.action}) ${p.prompt}${p.response ? `\n    → coach: ${p.response}` : ''}`)
    .join('\n');

  const piecesSummary = Array.isArray(contentPieces) && contentPieces.length > 0
    ? contentPieces
        .map((p: any) => `--- ${p.title || 'Untitled'} (${CONTENT_TYPE_LABELS[p.type] || p.type || 'content'}) ---\n${(p.body || '').slice(0, 3000)}`)
        .join('\n\n')
    : '(no content piece written yet)';

  const ctx: any = sessionContext || {};
  const ctxLines = [
    ctx.audience && `Audience (as first described): ${ctx.audience}`,
    ctx.purpose  && `Purpose (as first described): ${ctx.purpose}`,
  ].filter(Boolean).join('\n');

  const typeLabel = CONTENT_TYPE_LABELS[contentType] || 'content';

  const userContext = `CONTENT TYPE: ${typeLabel}\n\nFINAL CONTENT PIECE(S):\n${piecesSummary}\n${ctxLines ? `\nEARLY-SESSION CONTEXT (compare against the final content to see how their thinking evolved):\n${ctxLines}\n` : ''}\nPROMPT HISTORY (their working-through of each step):\n${promptLog || '(no prompt history yet)'}`;

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
        max_tokens:  2500,
        temperature: 0.4,
        system:      EVALUATION_SYSTEM,
        messages:    [{ role: 'user', content: userContext }],
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
    const raw     = completion.content?.[0]?.text || '{}';
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Evaluation returned invalid JSON', raw: raw.substring(0, 500) });
    }

    const { advice, ...evaluation } = result;
    return res.status(200).json({ success: true, evaluation, advice: advice || '' });
  } catch (err: any) {
    console.error('[evaluate-content-session]', err);
    return res.status(500).json({ error: err.message || 'Internal server error', success: false });
  }
}
