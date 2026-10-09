// lib/api-cost-logger.ts
// Shared cost logger for all Anthropic API calls across the platform.
// Fire-and-forget — never throws, never blocks a response.
//
// Usage in any API handler:
//
//   import { logApiCost } from '../lib/api-cost-logger';
//
//   const data = await response.json();
//   logApiCost({
//     source: 'WebDevelopmentPage',   // page or route name
//     model:  data.model,             // from Anthropic response
//     action: 'generate',             // generate | iterate | critique | evaluate | hint | etc.
//     usage:  data.usage,             // { input_tokens, output_tokens }
//     user_id, cohort,                // pass through from request body if available
//   });

// ─── Token prices per million (update if Anthropic changes rates) ─────────────
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':        { input: 3.0,  output: 15.0 },
  'claude-haiku-5-5': { input: 0.10,  output: 0.50 },  // $/MTok, prompts up to 100k
  'claude-haiku-4-5': { input: 1.0,  output:  5.0 },
  'claude-opus-4-6':          { input: 5.0,  output: 25.0 },
  // fallback for unknown models — assume Sonnet pricing
  default:                    { input: 3.0,  output: 15.0 },
};

function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const prices = PRICES[model] ?? PRICES.default;
  return (inputTokens / 1_000_000) * prices.input
       + (outputTokens / 1_000_000) * prices.output;
}

export interface LogApiCostParams {
  source:       string;          // page/route label — shown in Admin Dashboard
  model:        string;          // model string from Anthropic response
  action:       string;          // generate | iterate | critique | evaluate | hint | etc.
  usage:        { input_tokens: number; output_tokens: number } | undefined | null;
  user_id?:     string | null;
  cohort?:      string | null;
}

export function logApiCost(params: LogApiCostParams): void {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  if (!params.usage) return;

  const inputTokens  = params.usage.input_tokens  ?? 0;
  const outputTokens = params.usage.output_tokens ?? 0;
  const cost         = costUsd(params.model, inputTokens, outputTokens);

  // Fire-and-forget — swallow all errors so logging never crashes a handler
  fetch(`${supabaseUrl}/rest/v1/api_cost_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      page:          params.source,
      provider:      'anthropic',
      model:         params.model,
      input_tokens:  inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      user_id:       params.user_id  ?? null,
      logged_at:     new Date().toISOString(),
    }),
  }).catch(() => {});
}
