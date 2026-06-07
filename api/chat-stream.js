// api/chat-stream.js — Edge function for AIPlaygroundPage streaming
// No timeout limit. Pipes Anthropic SSE directly to the browser.
// Used exclusively by AIPlaygroundPage; all other pages use /api/chat.
//
// PATCH 2026-05-07: Rolling compression
//   When messages.length > COMPRESSION_THRESHOLD (20), the oldest messages
//   are compressed into a single summary pair using Haiku before the main
//   Anthropic call. The compressed history is returned in the done event
//   so the frontend can update its local state and Supabase.
//
// PATCH 2026-05-08: Cost logging
//   All Anthropic token usage is now logged to api_cost_log:
//   - Main Sonnet/Haiku stream: logged in finally block from SSE usage events
//   - Haiku compression call:   logged immediately after each compression
//   Both are fire-and-forget and never block the stream or response.
//
// TRIAGE PATCH: errors now logged to Supabase system_events + email alert.

export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// How many messages trigger compression, and how many recent ones to keep verbatim.
// Frontend sends up to MAX_API_MESSAGES=40. We compress when we receive >30,
// keeping the last 20 verbatim. This means long conversations always stay under
// ~22 messages (summaryPair + 20 recent) going to Anthropic.
const COMPRESSION_THRESHOLD = 18;
const KEEP_RECENT           = 10;

// ─── Token prices per million (USD) ──────────────────────────────────────────
const PRICES = {
  'claude-sonnet-4-6':         { input: 3.0,  output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 1.0,  output:  5.0 },
  default:                     { input: 3.0,  output: 15.0 },
};

function estimateCost(model, inputTokens, outputTokens) {
  const p = PRICES[model] ?? PRICES.default;
  return (inputTokens / 1_000_000) * p.input
       + (outputTokens / 1_000_000) * p.output;
}

// ─── Inline logger (Edge-safe — no Node imports) ─────────────────────────────
// Mirrors api-logger.ts but inline because Edge runtime can't import Node modules.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_KEY   = process.env.RESEND_API_KEY || '';
const ALERT_EMAIL  = process.env.TRIAGE_ALERT_EMAIL || '';
// TEMP DIAGNOSTIC — remove after confirming
async function logEvent({ function_name, event_type, severity, payload, user_id, cohort }) {
  // Write to Supabase (fire-and-forget — never blocks the stream)
  if (SUPABASE_URL && SUPABASE_KEY) {
    fetch(`${SUPABASE_URL}/rest/v1/system_events`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        function_name,
        event_type,
        severity,
        payload,
        user_id:    user_id  ?? null,
        cohort:     cohort   ?? null,
        created_at: new Date().toISOString(),
      }),
    }).catch(() => {}); // swallow — logging must never crash the stream
  }

  // Email on error/critical
  if ((severity === 'error' || severity === 'critical') && RESEND_KEY && ALERT_EMAIL) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from:    'triage@nextvillage.community',
        to:      ALERT_EMAIL,
        subject: `[Girls AIing] ${severity.toUpperCase()}: ${event_type} in ${function_name}`,
        html: `<h2>${event_type}</h2><p><strong>Function:</strong> ${function_name}</p>
               <pre>${JSON.stringify(payload, null, 2)}</pre>`,
      }),
    }).catch(() => {});
  }
}

// ─── Cost logger (fire-and-forget, Edge-safe) ─────────────────────────────────
// Writes one row to api_cost_log per Anthropic call.
// action: 'generate' for the main stream, 'compress' for Haiku compression calls.

function logCost({ model, action, inputTokens, outputTokens, cacheHitTokens = 0, cacheWriteTokens = 0, user_id, cohort }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  if (!inputTokens && !outputTokens) return;

  const cost = estimateCost(model, inputTokens, outputTokens);

  fetch(`${SUPABASE_URL}/rest/v1/api_cost_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      page:               'AIPlaygroundPage',
      provider:           'anthropic',
      model,
      action:             action ?? 'generate',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_hit_tokens:   cacheHitTokens,
      cache_write_tokens: cacheWriteTokens,
      estimated_cost_usd: cost,
      user_id:            user_id  ?? null,
      cohort:             cohort   ?? null,
      logged_at:          new Date().toISOString(),
    }),
  }).catch(() => {}); // swallow — logging must never crash the stream
}

// ─── Rolling compression ──────────────────────────────────────────────────────
//
// When a conversation exceeds COMPRESSION_THRESHOLD messages, compress the
// oldest (messages.length - KEEP_RECENT) messages into a single summary pair
// using Haiku (cheap, fast). The last KEEP_RECENT messages remain verbatim.
//
// Returns:
//   { compressed: true,  messages: [...summaryPair, ...recentMessages] }  — compression happened
//   { compressed: false, messages: originalMessages }                      — no compression needed

async function compressOldMessages(messages, apiKey, user_id, cohort) {
  if (messages.length <= COMPRESSION_THRESHOLD) {
    return { compressed: false, messages };
  }

  const splitAt        = messages.length - KEEP_RECENT;
  const toCompress     = messages.slice(0, splitAt);
  const recentMessages = messages.slice(splitAt);

  // Build a compact transcript of the messages to compress
  const transcript = toCompress
    .map(m => `[${m.role.toUpperCase()}]: ${(m.content || '').slice(0, 800)}`)
    .join('\n');

  const compressionModel = 'claude-haiku-4-5-20251001';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:       compressionModel,
        max_tokens:  600,
        temperature: 0.1,
        system: [{ type: 'text', text: 'You are a conversation summariser. Write a concise factual summary of a chat history for use as context in an ongoing conversation. Include: key topics discussed, decisions made, important facts the user shared, and any code or artifacts produced. Write in third person. Be specific and dense — this replaces the full history.', cache_control: { type: 'ephemeral' } }],
        messages: [{
          role:    'user',
          content: `Summarise this conversation history (${toCompress.length} messages) into a compact context summary:\n\n${transcript}`,
        }],
      }),
    });

    if (!res.ok) {
      // Compression failed — fall back to keeping all messages (safe default)
      console.warn('[chat-stream] Compression Haiku call failed:', res.status);
      return { compressed: false, messages };
    }

    const data    = await res.json();
    const summary = data.content?.[0]?.text ?? '';

    if (!summary) return { compressed: false, messages };

    // ── Log Haiku compression cost ─────────────────────────────────────────
    // data.usage is present on non-streaming calls
    if (data.usage) {
      logCost({
        model:       compressionModel,
        action:      'compress',
        inputTokens:  data.usage.input_tokens  ?? 0,
        outputTokens: data.usage.output_tokens ?? 0,
        user_id,
        cohort,
      });
    }

    // Inject as a synthetic user/assistant pair that looks natural in history
    const summaryPair = [
      {
        role:    'user',
        content: `[Earlier conversation summary — ${toCompress.length} messages compressed]`,
      },
      {
        role:    'assistant',
        content: `[SUMMARY OF EARLIER CONVERSATION]\n${summary}`,
      },
    ];

    return {
      compressed: true,
      messages:   [...summaryPair, ...recentMessages],
    };

  } catch (err) {
    // Never let compression crash the stream
    console.warn('[chat-stream] Compression error:', err.message);
    return { compressed: false, messages };
  }
}


// Cache the last assistant message so the growing conversation history
// is served from cache on subsequent turns (~90% input cost savings on repeats).
function applyCacheToLastAssistant(messages) {
  if (messages.length < 4) return messages;
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') { lastAssistantIdx = i; break; }
  }
  if (lastAssistantIdx === -1) return messages;
  return messages.map((msg, idx) => {
    if (idx !== lastAssistantIdx) return msg;
    const content = typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]
      : Array.isArray(msg.content)
        ? msg.content.map((c, ci) =>
            ci === msg.content.length - 1 ? { ...c, cache_control: { type: 'ephemeral' } } : c
          )
        : msg.content;
    return { ...msg, content };
  });
}


// ─── Task classifier ──────────────────────────────────────────────────────────
//
// Sends the last user message to Haiku with a tight binary prompt.
// Returns 'coding' or 'non-coding'. Falls back to 'coding' on any error
// so we never accidentally deny Sonnet when the user needs it.
//
// Cost: ~$0.001 per call (tiny prompt, 1-token output).

async function classifyTask(messages, apiKey) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return 'coding'; // safe default

  const userText = typeof lastUserMsg.content === 'string'
    ? lastUserMsg.content
    : lastUserMsg.content?.[0]?.text ?? '';

  // Fast heuristic: if the message contains code fences or technical keywords,
  // skip the API call and classify immediately.
  const codingSignals = /```|<code|function |const |let |var |def |class |import |<html|SELECT |FROM |CREATE TABLE/i;
  if (codingSignals.test(userText)) return 'coding';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 5,
        temperature: 0,
        system: [{ type: 'text', text: 'You classify user messages. Reply with exactly one word: "coding" if the message is about writing, debugging, reviewing, or explaining code or technical implementation. Reply "non-coding" for everything else (concepts, learning, questions, advice, language help, general chat).', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userText.slice(0, 500) }],
      }),
    });

    if (!res.ok) return 'coding'; // safe default on API error
    const data = await res.json();
    const label = (data.content?.[0]?.text ?? '').trim().toLowerCase();

    // Log classifier cost (fire-and-forget)
    if (data.usage) {
      logCost({
        model:       'claude-haiku-4-5-20251001',
        action:      'classify',
        inputTokens:  data.usage.input_tokens  ?? 0,
        outputTokens: data.usage.output_tokens ?? 0,
      });
    }

    return label.startsWith('non') ? 'non-coding' : 'coding';
  } catch {
    return 'coding'; // safe default on network error
  }
}

// ─── Free-tier non-streaming call (with Haiku backup) ─────────────────────────
//
// For non-coding Playground turns. Tries Groq first, falls back to Haiku.
// Returns the full response as a single SSE done event (no streaming chunks)
// so the frontend handles it identically to a finished Sonnet stream.

async function callFreeTierWithHaikuBackup({ messages, system, max_tokens, temperature, apiKey, user_id, cohort }) {
  const groqKey = process.env.GROQ_API_KEY;

  // ── Try Groq first ──────────────────────────────────────────────────────────
  if (groqKey) {
    try {
      const groqMessages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ];
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:      'llama-3.3-70b-versatile',
          messages:   groqMessages,
          max_tokens: Math.min(max_tokens, 8000), // Groq limit
          temperature,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        logCost({
          model:       'llama-3.3-70b-versatile',
          action:      'generate',
          inputTokens:  data.usage?.prompt_tokens     ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          user_id, cohort,
        });
        return { text, model: 'llama-3.3-70b-versatile', provider: 'groq' };
      }
    } catch { /* fall through to Haiku */ }
  }

  // ── Haiku backup ────────────────────────────────────────────────────────────
  const systemPayload = system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : undefined;

  const cachedMessages = applyCacheToLastAssistant(messages);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: Math.min(max_tokens, 8192),
      temperature,
      messages:   cachedMessages,
      ...(systemPayload ? { system: systemPayload } : {}),
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Haiku API error');

  const text = data.content?.[0]?.text ?? '';
  logCost({
    model:           'claude-haiku-4-5-20251001',
    action:          'generate',
    inputTokens:      data.usage?.input_tokens                ?? 0,
    outputTokens:     data.usage?.output_tokens               ?? 0,
    cacheHitTokens:   data.usage?.cache_read_input_tokens     ?? 0,
    cacheWriteTokens: data.usage?.cache_creation_input_tokens ?? 0,
    user_id, cohort,
  });
  return { text, model: 'claude-haiku-4-5-20251001', provider: 'anthropic' };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const {
    messages,
    system,
    model       = 'claude-haiku-4-5-20251001',
    max_tokens  = 16000,
    temperature = 0.3,
    user_id,    // pass through from AIPlaygroundPage if available
    cohort,
  } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'messages array required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // TRIAGE: missing key is critical — platform is down
    await logEvent({
      function_name: 'chat-stream',
      event_type:    'missing_api_key',
      severity:      'critical',
      payload:       { message: 'ANTHROPIC_API_KEY is not set' },
      user_id, cohort,
    });
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const systemPayload = system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : undefined;

  // ── Rolling compression ────────────────────────────────────────────────────
  // If the conversation is long, compress old messages before sending to Anthropic.
  // The frontend receives compressedMessages in the done event and updates Supabase.
  // user_id and cohort are forwarded so compression cost is attributed correctly.
  const { compressed, messages: messagesForApi } = await compressOldMessages(messages, apiKey, user_id, cohort);

  // ── Task classification: only use Sonnet for coding tasks ─────────────────
  // Classify the latest user message. Non-coding turns go to Groq → Haiku
  // instead of Sonnet, cutting cost by ~95% for general conversation.
  const taskType = await classifyTask(messagesForApi, apiKey);

  if (taskType === 'non-coding') {
    // ── Non-coding path: Groq → Haiku (no streaming, single SSE done event) ─
    const { readable: ncReadable, writable: ncWritable } = new TransformStream();
    const ncWriter  = ncWritable.getWriter();
    const ncEncoder = new TextEncoder();

    (async () => {
      try {
        const { text, model: usedModel, provider } = await callFreeTierWithHaikuBackup({
          messages:    messagesForApi,
          system,
          max_tokens,
          temperature,
          apiKey,
          user_id,
          cohort,
        });

        // Send as a single chunk so the frontend renders it the same way
        await ncWriter.write(ncEncoder.encode(`data: ${JSON.stringify({ chunk: text })}

`));
        await ncWriter.write(
          ncEncoder.encode(
            `data: ${JSON.stringify({
              done: true,
              fullText: text,
              taskType: 'non-coding',
              usedModel,
              provider,
              ...(compressed ? { compressedMessages: messagesForApi } : {}),
            })}

`
          )
        );
      } catch (err) {
        await ncWriter.write(
          ncEncoder.encode(`data: ${JSON.stringify({ done: true, fullText: '', error: err.message })}

`)
        );
      } finally {
        await ncWriter.close();
      }
    })();

    return new Response(ncReadable, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // ── Coding path: Sonnet with streaming ────────────────────────────────────
  // Cache the last assistant message so repeated context is served from cache
  const cachedMessagesForApi = applyCacheToLastAssistant(messagesForApi);

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      stream: true,
      messages: cachedMessagesForApi,
      ...(systemPayload ? { system: systemPayload } : {}),
    }),
  });

  // TRIAGE: catch upstream errors (401, 429, 500, etc.) before opening a stream
  if (!upstream.ok) {
    let errBody = {};
    try { errBody = await upstream.json(); } catch { /* ignore */ }

    // Classify severity
    const severity =
      upstream.status === 401 ? 'critical' :
      upstream.status === 429 ? 'error'    :
      upstream.status >= 500  ? 'error'    : 'warning';

    const event_type =
      upstream.status === 401 ? 'auth_error'       :
      upstream.status === 429 ? 'rate_limit'       :
      upstream.status === 400 ? 'invalid_request'  :
      upstream.status === 529 ? 'api_overloaded'   : `http_${upstream.status}`;

    await logEvent({
      function_name: 'chat-stream',
      event_type,
      severity,
      payload: {
        status:     upstream.status,
        message:    errBody?.error?.message ?? 'Anthropic error',
        model,
        max_tokens,
        user_id,
        cohort,
      },
      user_id, cohort,
    });

    return new Response(
      JSON.stringify({ error: errBody?.error?.message ?? 'Anthropic error' }),
      {
        status: upstream.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  // ── Stream transform ────────────────────────────────────────────────────────

  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader    = upstream.body.getReader();
    const decoder   = new TextDecoder();
    let sseBuffer   = '';
    let fullText    = '';
    let chunkCount  = 0;
    let parseErrors = 0;
    let streamError = null;

    // ── Token accumulators (populated from SSE usage events) ────────────────
    let inputTokens      = 0;
    let outputTokens     = 0;
    let cacheHitTokens   = 0;
    let cacheWriteTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;

          try {
            const evt = JSON.parse(raw);

            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              const chunk = evt.delta.text;
              fullText += chunk;
              chunkCount++;
              await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
            }

            // Capture input token counts (including cache) from message_start
            if (evt.type === 'message_start' && evt.message?.usage) {
              inputTokens      = evt.message.usage.input_tokens                ?? 0;
              cacheHitTokens   = evt.message.usage.cache_read_input_tokens     ?? 0;
              cacheWriteTokens = evt.message.usage.cache_creation_input_tokens ?? 0;
            }

            // Capture output token count + TRIAGE max_tokens warning
            if (evt.type === 'message_delta' && evt.usage) {
              outputTokens = evt.usage.output_tokens ?? 0;

              // TRIAGE: catch max_tokens at the stream level
              if (evt.delta?.stop_reason === 'max_tokens') {
                logEvent({                           // fire-and-forget
                  function_name: 'chat-stream',
                  event_type:    'max_tokens_hit',
                  severity:      'warning',
                  payload: {
                    stop_reason:          'max_tokens',
                    output_tokens:        outputTokens,
                    model,
                    max_tokens_requested: max_tokens,
                    full_text_length:     fullText.length,
                    note: 'Stream ended early — learner saw truncated response',
                  },
                  user_id, cohort,
                });
              }
            }

          } catch (parseErr) {
            // TRIAGE: count parse errors; log if excessive
            parseErrors++;
            if (parseErrors >= 5) {
              logEvent({
                function_name: 'chat-stream',
                event_type:    'sse_parse_errors',
                severity:      'warning',
                payload: { parseErrors, raw_sample: raw.slice(0, 200), model },
                user_id, cohort,
              });
              parseErrors = 0; // reset counter to avoid spam
            }
          }
        }
      }
    } catch (err) {
      streamError = err;
      // TRIAGE: mid-stream read failure (network drop, upstream hang)
      logEvent({
        function_name: 'chat-stream',
        event_type:    'stream_read_error',
        severity:      'error',
        payload: {
          message:          err.message,
          chunkCount,
          full_text_length: fullText.length,
          model,
          note: 'Stream interrupted mid-response',
        },
        user_id, cohort,
      });
    } finally {
      // ── Log main stream cost (Sonnet or Haiku) ─────────────────────────────
      // Always fires — even on partial streams, partial cost is real cost.
      logCost({
        model,
        action:           'generate',
        inputTokens,
        outputTokens,
        cacheHitTokens,
        cacheWriteTokens,
        user_id,
        cohort,
      });

      // Always close cleanly — send what we have.
      // If compression happened, include the new compressed history so the
      // frontend can update its local state and write it back to Supabase.
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            done: true,
            fullText,
            ...(streamError ? { error: 'Stream interrupted' }       : {}),
            ...(compressed  ? { compressedMessages: messagesForApi } : {}),
          })}\n\n`
        )
      );
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}