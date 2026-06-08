// supabase/functions/log-playground-costs/index.ts
//
// Hourly cron function — runs every hour at :00.
// Scans ai_playground_chats updated in the last hour, estimates token usage
// from message content (4 chars per token), and writes rows to api_cost_log.
//
// Each run covers only the last hour — no overlap, no skip logic needed.
//
// Deploy:
//   supabase functions deploy log-playground-costs
//
// Schedule (in Supabase dashboard → Edge Functions → log-playground-costs → Schedule):
//   Cron: 0 * * * *   (every hour at :00)
//
// Or trigger manually:
//   supabase functions invoke log-playground-costs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Pricing (per million tokens) ─────────────────────────────────────────────
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':         { input: 3.0,  output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 1.0,  output:  5.0 },
  default:                     { input: 1.0,  output:  5.0 }, // assume Haiku if unknown
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? PRICES.default;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  tokensIn?: number;
  tokensOut?: number;
}

interface PlaygroundChat {
  id: string;
  user_id: string;
  messages: ChatMessage[];
  model: string | null;
  updated_at: string;
}

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'log-playground-costs',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block cost logging for logging */ }
}

Deno.serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    const now        = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    console.log(`[log-playground-costs] Running at ${now.toISOString()} — window: last 1 hour`);

    const { data: chats, error: chatsError } = await supabase
      .from('ai_playground_chats')
      .select('id, user_id, messages, model, updated_at')
      .gte('updated_at', oneHourAgo);

    if (chatsError) throw new Error(`Failed to fetch chats: ${chatsError.message}`);
    if (!chats || chats.length === 0) {
      console.log('[log-playground-costs] No chats updated in last hour — nothing to log');
      return new Response(JSON.stringify({ logged: 0, skipped: 0 }), { status: 200 });
    }

    console.log(`[log-playground-costs] Found ${chats.length} chats updated in last hour`);

    let logged  = 0;
    let skipped = 0;
    const rowsToInsert = [];

    for (const chat of chats as PlaygroundChat[]) {
      if (!chat.user_id) { skipped++; continue; }

      const messages: ChatMessage[] = Array.isArray(chat.messages) ? chat.messages : [];
      if (messages.length === 0) { skipped++; continue; }

      const model = chat.model ?? 'claude-haiku-4-5-20251001';

      // Only count messages from the last hour
      const recentMessages = messages.filter(m => {
        if (!m.timestamp) return true;
        return new Date(m.timestamp).getTime() >= new Date(oneHourAgo).getTime();
      });

      if (recentMessages.length === 0) { skipped++; continue; }

      let totalInputTokens  = 0;
      let totalOutputTokens = 0;

      for (const msg of recentMessages) {
        const contentLen = estimateTokens(msg.content ?? '');
        if (msg.role === 'user') {
          totalInputTokens += contentLen;
        } else if (msg.role === 'assistant') {
          if (msg.tokensOut && msg.tokensOut > 0) {
            totalOutputTokens += msg.tokensOut;
            if (msg.tokensIn && msg.tokensIn > 0) {
              totalInputTokens = Math.max(totalInputTokens, msg.tokensIn);
            }
          } else {
            totalOutputTokens += contentLen;
          }
        }
      }

      if (totalInputTokens === 0 && totalOutputTokens === 0) { skipped++; continue; }

      const estimatedCost = estimateCost(model, totalInputTokens, totalOutputTokens);

      rowsToInsert.push({
        page:               'AIPlaygroundPage',
        provider:           'anthropic',
        model,
        action:             'hourly_estimate',
        input_tokens:       totalInputTokens,
        output_tokens:      totalOutputTokens,
        cache_hit_tokens:   0,
        cache_write_tokens: 0,
        estimated_cost_usd: estimatedCost,
        user_id:            chat.user_id,
        cohort:             null,
        logged_at:          now.toISOString(),
      });

      logged++;
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('api_cost_log')
        .insert(rowsToInsert);

      if (insertError) throw new Error(`Failed to insert rows: ${insertError.message}`);
    }

    const summary = {
      window:    `${oneHourAgo} → ${now.toISOString()}`,
      logged,
      skipped,
      totalRows: rowsToInsert.length,
    };

    console.log('[log-playground-costs] Done:', summary);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[log-playground-costs] Error:', err.message);
    try {
      const sb = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      await logEvent(sb, {
        event_type: 'unhandled_exception',
        severity:   'error',
        details:    { error: err.message },
      });
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});