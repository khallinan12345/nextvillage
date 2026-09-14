// api/_lib/freeTierChain.js
//
// Standalone free-tier fallback chain — Groq → Cerebras → Cloudflare
// Workers AI → OpenRouter (free) → Mistral — for callers that want to try
// free-tier providers before ever spending on Anthropic. DeepSeek is
// deliberately not in this chain: its pricing is no longer meaningfully
// cheaper than Anthropic Haiku, so it no longer earns a hop before the
// real thing (same reasoning as api/chat.js's own chain).
//
// This module owns only the free-tier leg. The caller is responsible for
// its own Anthropic call as the final fallback once tryFreeTierChain()
// throws (every provider in the chain failed or was skipped) — that keeps
// this module usable by callers with very different Anthropic-calling
// conventions (api/chat.js's raw fetch vs. api/chat-room.js's SDK client).
//
// Mirrors api/chat.js's callWithFallbackChain() in behavior (same
// providers, same cooldown/error-classification logic) but is intentionally
// a separate copy rather than an import from chat.js: chat.js is the
// platform's highest-traffic endpoint, and duplicating ~150 lines here
// keeps a change to one from ever risking the other.

const DEFAULT_FREE_TIER_MODELS = {
  groq:       'openai/gpt-oss-120b',
  cerebras:   'gpt-oss-120b',
  cloudflare: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  mistral:    'mistral-small-latest',
};

// ── Groq TPM guard ───────────────────────────────────────────────────────
// Groq's on-demand tier caps this model at 12,000 tokens/minute PER
// REQUEST — a hard ceiling, not a transient condition, so retrying an
// oversized request is guaranteed to fail every time. Pre-estimate size and
// skip Groq outright for payloads that would exceed it.
const GROQ_TPM_LIMIT      = 12000;
const TOKEN_SAFETY_MARGIN = 1500;

function estimateRequestTokens(messages, system, max_tokens) {
  const text =
    (system || '') +
    messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('');
  return Math.ceil(text.length / 4) + (max_tokens || 0);
}

// ── Cooldown tracker (module-local — separate from api/chat.js's own) ────
const providerCooldowns = new Map();
const COOLDOWN_DURATION    = 60 * 1000;
const MISSING_KEY_COOLDOWN = 10 * 60 * 1000;
const PERMANENT_ERROR_COOLDOWN = 6 * 60 * 60 * 1000;

function isOnCooldown(providerName) {
  const until = providerCooldowns.get(providerName);
  if (!until) return false;
  if (Date.now() > until) {
    providerCooldowns.delete(providerName);
    return false;
  }
  return true;
}

function setCooldown(providerName, duration = COOLDOWN_DURATION) {
  providerCooldowns.set(providerName, Date.now() + duration);
}

// ── Error classification ──────────────────────────────────────────────────
function isRateLimitOrQuotaError(error) {
  const status = error?.status || error?.statusCode;
  const message = error?.message?.toLowerCase() || '';
  return (
    status === 429 || status === 403 ||
    message.includes('rate limit') || message.includes('quota') ||
    message.includes('exceeded') || message.includes('insufficient_quota') ||
    message.includes('resource_exhausted')
  );
}

function isMissingKeyError(error) {
  const message = error?.message?.toLowerCase() || '';
  return (
    error?.status === 401 ||
    message.includes('api key') || message.includes('unauthorized') || message.includes('authentication')
  );
}

function isPermanentError(error) {
  const status = error?.status || error?.statusCode;
  const message = error?.message?.toLowerCase() || '';
  return (
    status === 404 ||
    message.includes('does not exist') || message.includes('model not found') ||
    message.includes('daily free allocation') || message.includes('neurons')
  );
}

// ── Provider callers (OpenAI-compatible chat-completions shape) ──────────

async function callGroq(model, messages, system, max_tokens, temperature) {
  const groqMessages = [...(system ? [{ role: 'system', content: system }] : []), ...messages];
  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    // reasoning_effort: 'low' — gpt-oss-120b can spend its whole max_tokens
    // budget on hidden reasoning and return an empty content field otherwise.
    body: JSON.stringify({ model, messages: groqMessages, max_tokens, temperature, reasoning_effort: 'low' }),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const err = new Error(data.error?.message || 'Groq API error');
    err.status = upstream.status;
    throw err;
  }
  return { ...data, _route: { provider: 'groq', model } };
}

async function callCerebras(model, messages, system, max_tokens, temperature) {
  const csMessages = [...(system ? [{ role: 'system', content: system }] : []), ...messages];
  const upstream = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: csMessages, max_tokens, temperature, reasoning_effort: 'low' }),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const err = new Error(data.message || data.error?.message || 'Cerebras API error');
    err.status = upstream.status;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content ?? '';
  return {
    id: data.id || `cerebras-${Date.now()}`, object: 'chat.completion', model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: data.choices?.[0]?.finish_reason ?? 'stop' }],
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0,
    },
    _route: { provider: 'cerebras', model },
  };
}

async function callCloudflare(model, messages, system, max_tokens, temperature) {
  const cfMessages = [...(system ? [{ role: 'system', content: system }] : []), ...messages];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const upstream = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: cfMessages, max_tokens, temperature }),
    }
  );
  const data = await upstream.json();
  if (!upstream.ok) {
    const err = new Error(data.errors?.[0]?.message || data.error?.message || 'Cloudflare AI error');
    err.status = upstream.status;
    throw err;
  }
  return { ...data, _route: { provider: 'cloudflare', model } };
}

async function callOpenRouter(model, messages, system, max_tokens, temperature) {
  const orMessages = [...(system ? [{ role: 'system', content: system }] : []), ...messages];
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: orMessages, max_tokens, temperature }),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const err = new Error(data.error?.message || 'OpenRouter API error');
    err.status = upstream.status;
    throw err;
  }
  return { ...data, _route: { provider: 'openrouter', model } };
}

async function callMistral(model, messages, system, max_tokens, temperature) {
  const mistralMessages = [...(system ? [{ role: 'system', content: system }] : []), ...messages];
  const upstream = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: mistralMessages, max_tokens, temperature }),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const message = data.error?.message
      || (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      || 'Mistral API error';
    const err = new Error(message);
    err.status = upstream.status;
    throw err;
  }
  return { ...data, _route: { provider: 'mistral', model } };
}

// ── Chain runner ───────────────────────────────────────────────────────────
// Throws (with `.provider_errors`) if every provider fails or is skipped —
// the caller is expected to catch that and fall through to its own
// Anthropic call. Returns { result, actualProvider, actualModel } on
// success, where `result.choices[0].message.content` is the reply text.
export async function tryFreeTierChain(messages, system, max_tokens, temperature, { page = '', models = {} } = {}) {
  const m = { ...DEFAULT_FREE_TIER_MODELS, ...models };
  const estTokens = estimateRequestTokens(messages, system, max_tokens);

  const chain = [
    {
      name: 'groq', model: m.groq, keyEnv: 'GROQ_API_KEY',
      skipIf: () => estTokens > (GROQ_TPM_LIMIT - TOKEN_SAFETY_MARGIN),
      skipReason: 'estimated request size exceeds Groq TPM limit (12000)',
      fn: () => callGroq(m.groq, messages, system, max_tokens, temperature),
    },
    { name: 'cerebras',   model: m.cerebras,   keyEnv: 'CEREBRAS_API_KEY',   fn: () => callCerebras(m.cerebras, messages, system, max_tokens, temperature) },
    { name: 'cloudflare', model: m.cloudflare, keyEnv: 'CLOUDFLARE_API_TOKEN', fn: () => callCloudflare(m.cloudflare, messages, system, max_tokens, temperature) },
    { name: 'openrouter', model: m.openrouter, keyEnv: 'OPENROUTER_API_KEY', fn: () => callOpenRouter(m.openrouter, messages, system, max_tokens, temperature) },
    { name: 'mistral',    model: m.mistral,    keyEnv: 'MISTRAL_API_KEY',    fn: () => callMistral(m.mistral, messages, system, max_tokens, temperature) },
  ];

  const errors = [];

  for (const provider of chain) {
    if (!process.env[provider.keyEnv]) {
      errors.push({ provider: provider.name, error: `${provider.keyEnv} not set` });
      continue;
    }
    if (isOnCooldown(provider.name)) {
      errors.push({ provider: provider.name, error: 'on cooldown' });
      continue;
    }
    if (provider.skipIf && provider.skipIf()) {
      errors.push({ provider: provider.name, error: provider.skipReason });
      continue;
    }

    try {
      console.log(`[freeTierChain] page="${page}" trying ${provider.name} (${provider.model})...`);
      const result = await provider.fn();

      // A reasoning model can return a successful 200 with empty content if
      // it spent its whole max_tokens budget on hidden reasoning — treat
      // that as a failure so the chain moves on.
      const contentText = result?.choices?.[0]?.message?.content;
      if (!contentText || !contentText.trim()) {
        throw new Error(`${provider.name} returned empty content (likely a reasoning model exhausting its token budget before answering)`);
      }

      console.log(`[freeTierChain] ✅ success via ${provider.name}`);
      return { result, actualProvider: provider.name, actualModel: provider.model };
    } catch (error) {
      console.warn(`[freeTierChain] ⚠️ ${provider.name} failed:`, error?.message || String(error));
      errors.push({ provider: provider.name, error: error?.message || String(error) });

      if (isRateLimitOrQuotaError(error)) setCooldown(provider.name, COOLDOWN_DURATION);
      else if (isMissingKeyError(error)) setCooldown(provider.name, MISSING_KEY_COOLDOWN);
      else if (isPermanentError(error)) setCooldown(provider.name, PERMANENT_ERROR_COOLDOWN);
    }
  }

  const err = new Error(`Free-tier chain exhausted:\n${errors.map(e => `  ${e.provider}: ${e.error}`).join('\n')}`);
  err.provider_errors = errors;
  throw err;
}
