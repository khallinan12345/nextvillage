// api/ai-proxy.ts
// Thin proxy that forwards Anthropic API calls from the browser to Claude.
// The ANTHROPIC_API_KEY environment variable lives only on the server —
// it is never exposed in the browser bundle.
//
// Request body: standard Anthropic /v1/messages payload
//   { model, max_tokens, system?, messages, tools? }
//
// Response: raw Anthropic /v1/messages response
//   { content: [{ type, text }], ... }

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ─── Cost logger (fire-and-forget) ───────────────────────────────────────────
function logCost(page: string, model: string, usage: { input_tokens?: number; output_tokens?: number } | undefined, userId?: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || !usage) return;
  const inputTokens  = usage.input_tokens  ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  if (!inputTokens && !outputTokens) return;
  const MTok = 1_000_000;
  const prices: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
    'claude-haiku-4-5-20251001': { input: 1.00, output:  5.00 },
  };
  const p = prices[model] ?? prices['claude-sonnet-4-6'];
  const estimatedCost = (inputTokens / MTok) * p.input + (outputTokens / MTok) * p.output;
  fetch(`${supabaseUrl}/rest/v1/api_cost_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      page:               page || 'ai-proxy',
      provider:           'anthropic',
      model,
      action:             'generate',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_hit_tokens:   0,
      cache_write_tokens: 0,
      estimated_cost_usd: estimatedCost,
      user_id:            userId ?? null,
      logged_at:          new Date().toISOString(),
    }),
  }).catch(() => {});
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
  }

  try {
    const { model, max_tokens, system, messages, tools, page, user_id } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const resolvedModel = model || 'claude-sonnet-4-6';
    const payload: Record<string, any> = {
      model: resolvedModel,
      max_tokens: max_tokens || 1000,
      messages,
    };
    if (system)   payload.system = system;
    if (tools)    payload.tools  = tools;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || `Anthropic API error ${response.status}`,
      });
    }

    logCost(page, resolvedModel, data.usage, user_id);
    return res.status(200).json(data);

  } catch (err: any) {
    console.error('[ai-proxy] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
