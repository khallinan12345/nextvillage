// api/chat.js - Vercel serverless function with model routing + prompt caching + multi-provider fallback
//
// ROUTING LOGIC:
//   page = 'AILearningPage' | 'EnglishSkillsPage' |
//          'SkillsDevelopmentPage' | consultant pages
//     → Groq (primary) → Gemini → Cloudflare → OpenRouter → Mistral → DeepSeek → Anthropic Haiku (final)
//
//   page = 'VibeCodingPage' | 'WebDevelopmentPage' |
//          'FullStackDevelopmentPage' | 'AIWorkflowDevPage'
//     → taskType === 'coding'  (code generation, debugging, refactoring)
//         → Anthropic claude-haiku-4-5-20251001 (cost-efficient for code tasks)
//     → taskType !== 'coding'  (evaluation, planning, help popup, critique, task instructions, Q&A)
//         → Groq (primary) → Gemini → Cloudflare → OpenRouter → Mistral → DeepSeek → Anthropic Haiku (final)
//         NOTE: This now applies to WebDevelopmentPage too — evaluation, help, and
//         task-instruction calls from WebDevelopmentPage all go through the free-tier
//         chain with Haiku as the final fallback, not Haiku as the primary.
//
//   page = 'AIPlaygroundPage'
//     → Anthropic claude-haiku-4-5-20251001 (default)
//        OR claude-sonnet-4-6 if playgroundModel === 'claude-sonnet-4-6'
//
//   all other pages / no page supplied
//     → Anthropic claude-haiku-4-5-20251001 (default)
//
// TASK TYPE (for coding pages):
//   The frontend should send taskType = 'coding' | 'non-coding' in the request body.
//   'coding' tasks include: code generation, debugging, refactoring, code review,
//     writing tests, implementing features, fixing errors.
//   'non-coding' tasks include: concept explanations, project planning, tool comparisons,
//     career advice, general Q&A, resource recommendations.
//   If taskType is omitted on a coding page, it defaults to 'coding' (uses Haiku).
//
// FALLBACK CHAIN (for free-tier-routed pages):
//   Groq → Cerebras → Cloudflare Workers AI → OpenRouter (free) → Mistral → DeepSeek V3 → Anthropic Haiku
//   NOTE: Gemini removed — free tier quota permanently exhausted (limit: 0)
//
// PROMPT CACHING: applied automatically on all Anthropic calls.
//   The system prompt is marked with cache_control so repeated calls within
//   the 5-minute TTL are charged at ~10% of normal input cost.

// NOTE: do not import optional provider SDKs at module top-level.
// Some deployment environments may not have optional SDKs installed
// which would cause the entire serverless function to crash on load.
// The Gemini client (@google/generative-ai) is lazily imported inside
// `callGemini` below to avoid top-level import failures.

// ── Constants ──────────────────────────────────────────────────────────────────

// Pages that always use the free-tier fallback chain (no task-type distinction)
const FREE_TIER_PAGES = new Set([
  'AILearningPage',
  'EnglishSkillsPage',
  'MathSkillsPage',
  'ScienceSkillsPage',
  'SkillsDevelopmentPage',
  'AgricultureConsultantPage',
  'FishingConsultantPage',
  'HealthcareNavigatorPage',
  'EntrepreneurshipConsultantPage',
  'AIAmbassadorsPage',
]);

// Pages that use Sonnet for coding tasks, free-tier for non-coding tasks
const HYBRID_CODING_PAGES = new Set([
  'VibeCodingPage',
  'WebDevelopmentPage',
  'FullStackDevelopmentPage',
  'AIWorkflowDevPage',
]);

// Certification pages — always Haiku; structured JSON eval must be reliable
const CERT_PAGES = new Set([
  'AIReadySkillsPage',
  'AIProficiencyPage',
  'FullStackCertificationPage',
  'AIVideoProductionCertificationPage',
  'AIImageCertificationPage',
  'AIVoiceCertificationPage',
  'AIContentCreationCertificationPage',
  'AIAmbassadorsCertificationPage',
  'AgricultureConsultantCertificationPage',
  'FishingConsultantCertificationPage',
  'HealthcareNavigatorCertificationPage',
  'EntrepreneurshipConsultantCertificationPage',
]);

const ANTHROPIC_HAIKU  = 'claude-haiku-4-5-20251001';
const ANTHROPIC_SONNET = 'claude-sonnet-4-6';
const GROQ_MODEL       = 'llama-3.3-70b-versatile';
const CEREBRAS_MODEL   = 'gpt-oss-120b';             // Cerebras — llama3.1-8b was deprecated/removed (confirmed via /v1/models, Jul 2026); chose 120B for quality over gemma-4-31b's speed/quota headroom
const DEEPSEEK_MODEL   = 'deepseek-chat';          // DeepSeek V3 — assessment pipeline + final paid fallback before Haiku

// ── Fallback provider models ───────────────────────────────────────────────────

const GEMINI_MODEL      = 'gemini-2.0-flash';
const CLOUDFLARE_MODEL  = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const OPENROUTER_MODEL  = 'meta-llama/llama-3.3-70b-instruct:free';
const MISTRAL_MODEL     = 'mistral-small-latest';

// ── Pricing table (per million tokens, USD) ───────────────────────────────────

const PRICING = {
  'claude-sonnet-4-6':           { input: 3.00,  output: 15.00, cacheWrite: 3.75,  cacheRead: 0.30  },
  'claude-haiku-4-5-20251001':   { input: 1.00,  output: 5.00,  cacheWrite: 1.25,  cacheRead: 0.10  },
  'llama-3.3-70b-versatile':     { input: 0.00,  output: 0.00,  cacheWrite: 0.00,  cacheRead: 0.00  },
  'gemini-2.0-flash':            { input: 0.00,  output: 0.00,  cacheWrite: 0.00,  cacheRead: 0.00  },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { input: 0.00, output: 0.00, cacheWrite: 0.00, cacheRead: 0.00 },
  'meta-llama/Llama-3.3-70B-Instruct': { input: 0.00, output: 0.00, cacheWrite: 0.00, cacheRead: 0.00 },
  'meta-llama/llama-3.3-70b-instruct:free': { input: 0.00, output: 0.00, cacheWrite: 0.00, cacheRead: 0.00 },
  'mistral-small-latest':        { input: 0.00,  output: 0.00,  cacheWrite: 0.00,  cacheRead: 0.00  },
  'gpt-oss-120b':                { input: 0.00,  output: 0.00,  cacheWrite: 0.00,  cacheRead: 0.00  }, // Cerebras free tier
  'deepseek-chat':               { input: 0.28,  output: 0.42,  cacheWrite: 0.00,  cacheRead: 0.028 }, // V3.2 — ~71% cheaper than Haiku
};

function estimateCost(model, inputTokens, outputTokens, cacheHitTokens = 0, cacheWriteTokens = 0) {
  const p = PRICING[model] || { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  const MTok = 1_000_000;
  const standardInput = Math.max(0, inputTokens - cacheHitTokens - cacheWriteTokens);
  return (
    (standardInput    / MTok) * p.input      +
    (cacheWriteTokens / MTok) * p.cacheWrite  +
    (cacheHitTokens   / MTok) * p.cacheRead   +
    (outputTokens     / MTok) * p.output
  );
}

// ── Request size estimation (Groq TPM guard) ───────────────────────────────────
// Groq's on-demand tier caps llama-3.3-70b-versatile at 12,000 tokens/minute
// PER REQUEST — this is a hard ceiling, not a transient rate condition, so
// retrying an oversized request against Groq is guaranteed to fail every time.
// Pre-estimate size and skip Groq outright for payloads that would exceed it,
// rather than eating a doomed round-trip on every call.

const GROQ_TPM_LIMIT      = 12000;
const TOKEN_SAFETY_MARGIN = 1500; // headroom for estimation error + max_tokens completion

function estimateRequestTokens(messages, system, max_tokens) {
  const text =
    (system || '') +
    messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('');
  // Rough heuristic: ~4 characters per token for English text.
  // This is an estimate, not exact — the safety margin absorbs the error.
  return Math.ceil(text.length / 4) + (max_tokens || 0);
}

// ── Cooldown tracker ──────────────────────────────────────────────────────────

const providerCooldowns = new Map();
const COOLDOWN_DURATION        = 60 * 1000;
const MISSING_KEY_COOLDOWN     = 10 * 60 * 1000;

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

// ── Error classification ──────────────────────────────────────────────────────

function isRateLimitOrQuotaError(error) {
  const status = error?.status || error?.statusCode;
  const message = error?.message?.toLowerCase() || '';
  return (
    status === 429 ||
    status === 403 ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('exceeded') ||
    message.includes('insufficient_quota') ||
    message.includes('resource_exhausted')
  );
}

function isMissingKeyError(error) {
  const message = error?.message?.toLowerCase() || '';
  return (
    error?.status === 401 ||
    message.includes('api key') ||
    message.includes('unauthorized') ||
    message.includes('authentication')
  );
}

// 404 = model not found; daily quota exhausted = effectively permanent until reset.
// Put the provider on a 6-hour cooldown so the chain skips it rather than
// hammering it on every request.
const PERMANENT_ERROR_COOLDOWN = 6 * 60 * 60 * 1000; // 6 hours

function isPermanentError(error) {
  const status = error?.status || error?.statusCode;
  const message = error?.message?.toLowerCase() || '';
  return (
    status === 404 ||
    message.includes('does not exist') ||
    message.includes('model not found') ||
    message.includes('daily free allocation') ||
    message.includes('neurons')
  );
}

// ── Cost logger ───────────────────────────────────────────────────────────────

async function logCost({ page, provider, model, inputTokens, outputTokens,
                          cacheHitTokens, cacheWriteTokens, userId, city, taskType }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const estimatedCost = estimateCost(model, inputTokens, outputTokens, cacheHitTokens, cacheWriteTokens);

  try {
    await fetch(`${supabaseUrl}/rest/v1/api_cost_log`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        page:               page || 'unknown',
        provider,
        model,
        input_tokens:       inputTokens,
        output_tokens:      outputTokens,
        cache_hit_tokens:   cacheHitTokens,
        cache_write_tokens: cacheWriteTokens,
        estimated_cost_usd: estimatedCost,
        user_id:            userId || null,
        city:               city   || null,
        logged_at:          new Date().toISOString(),
      }),
    });
  } catch { /* never block the response for logging */ }
}

// ── Triage alert constants ─────────────────────────────────────────────────────

const TRIAGE_SUPABASE_URL = process.env.SUPABASE_URL || '';
const TRIAGE_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TRIAGE_RESEND_KEY   = process.env.RESEND_API_KEY || '';
const TRIAGE_ALERT_EMAIL  = process.env.TRIAGE_ALERT_EMAIL || '';

// ── Triage event logger (mirrors chat-stream.js logEvent) ─────────────────────
// Writes to system_events and emails on error/critical severity.
// Fire-and-forget — never blocks the response.

async function logEvent({ function_name, event_type, severity, payload }) {
  if (TRIAGE_SUPABASE_URL && TRIAGE_SUPABASE_KEY) {
    fetch(`${TRIAGE_SUPABASE_URL}/rest/v1/system_events`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        TRIAGE_SUPABASE_KEY,
        'Authorization': `Bearer ${TRIAGE_SUPABASE_KEY}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        function_name,
        event_type,
        severity,
        payload,
        created_at: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  if ((severity === 'error' || severity === 'critical') && TRIAGE_RESEND_KEY && TRIAGE_ALERT_EMAIL) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${TRIAGE_RESEND_KEY}`,
      },
      body: JSON.stringify({
        from:    'triage@nextvillage.community',
        to:      TRIAGE_ALERT_EMAIL,
        subject: `[vAI ERROR] ${event_type} in ${function_name}`,
        html:    `<h2>${event_type}</h2><p><strong>Function:</strong> ${function_name}</p><pre>${JSON.stringify(payload, null, 2)}</pre>`,
      }),
    }).catch(() => {});
  }
}

// ── Route resolver ─────────────────────────────────────────────────────────────

function resolveRoute(page, playgroundModel, taskType) {
  // Free-tier pages (including SkillsDevelopmentPage) → fallback chain
  if (FREE_TIER_PAGES.has(page)) {
    return { provider: 'groq', model: GROQ_MODEL };
  }

  // Hybrid coding pages:
  //   taskType === 'coding'     → Haiku (code generation needs reliability)
  //   taskType === 'non-coding' → free-tier chain, Haiku as final fallback
  //   taskType omitted          → 'non-coding' for WebDevelopmentPage
  //                               (evaluation, help popup, task instructions omit taskType)
  //                             → 'coding' for all other hybrid pages (safe default)
  if (HYBRID_CODING_PAGES.has(page)) {
    const isCoding = taskType === 'coding'
      || (taskType == null && page !== 'WebDevelopmentPage');
    if (isCoding) {
      return { provider: 'anthropic', model: ANTHROPIC_HAIKU };
    }
    // non-coding (or WebDevelopmentPage with no taskType) → free-tier chain
    return { provider: 'groq', model: GROQ_MODEL };
  }

  // AIPlaygroundPage → Sonnet if profile set, otherwise free-tier chain
  if (page === 'AIPlaygroundPage') {
    if (playgroundModel === ANTHROPIC_SONNET) return { provider: 'anthropic', model: ANTHROPIC_SONNET };
    return { provider: 'groq', model: GROQ_MODEL };
  }

  // Certification pages → Haiku directly; reliable JSON eval, no free-tier risk
  if (CERT_PAGES.has(page)) {
    return { provider: 'anthropic', model: ANTHROPIC_HAIKU };
  }

  // Default → Haiku
  return { provider: 'anthropic', model: ANTHROPIC_HAIKU };
}


// Cache the last assistant message in a conversation so the growing history
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

// ── Anthropic call (with prompt caching on system prompt) ──────────────────────

async function callAnthropic(model, messages, system, max_tokens, temperature) {
  const systemPayload = system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : undefined;

  const cachedMessages = applyCacheToLastAssistant(messages);

  const requestBody = {
    model,
    max_tokens,
    temperature,
    messages: cachedMessages,
    ...(systemPayload ? { system: systemPayload } : {}),
  };

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':          process.env.ANTHROPIC_API_KEY,
      'anthropic-version':  '2023-06-01',
      'anthropic-beta':     'prompt-caching-2024-07-31',
      'Content-Type':       'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    const err = new Error(data.error?.message || 'Anthropic API error');
    err.status = upstream.status;
    err.anthropic_error = data;
    throw err;
  }

  const text = data?.content?.[0]?.text ?? '';
  return {
    id:     data.id,
    object: 'chat.completion',
    model:  data.model,
    choices: [{
      index:         0,
      message:       { role: 'assistant', content: text },
      finish_reason: data.stop_reason ?? 'stop',
    }],
    usage: {
      prompt_tokens:     data.usage?.input_tokens  ?? 0,
      completion_tokens: data.usage?.output_tokens ?? 0,
      total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      cache_creation_input_tokens: data.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:     data.usage?.cache_read_input_tokens     ?? 0,
    },
    _route: { provider: 'anthropic', model: data.model },
  };
}

// ── Groq call ──────────────────────────────────────────────────────────────────

async function callGroq(model, messages, system, max_tokens, temperature) {
  const groqMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages,
  ];

  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model, messages: groqMessages, max_tokens, temperature }),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    const err = new Error(data.error?.message || 'Groq API error');
    err.status = upstream.status;
    err.groq_error = data;
    throw err;
  }

  return { ...data, _route: { provider: 'groq', model } };
}

// ── Gemini call ────────────────────────────────────────────────────────────────

async function callGemini(model, messages, system, max_tokens, temperature) {
  // Lazy import the Gemini SDK to avoid top-level module load failures
  let GoogleGenerativeAI;
  try {
    const mod = await import('@google/generative-ai');
    GoogleGenerativeAI = mod.GoogleGenerativeAI || mod.default || mod;
  } catch (err) {
    const e = new Error(`Gemini SDK not available: ${err.message}`);
    e.status = 501;
    throw e;
  }

  const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const geminiModel = geminiClient.getGenerativeModel({ model });

  let prompt = '';
  if (system) prompt += `System instructions: ${system}\n\n`;
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'Assistant' : 'User';
    prompt += `${role}: ${msg.content}\n`;
  }
  prompt += 'Assistant:';

  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: max_tokens, temperature },
    });

    const text = result.response.text();

    return {
      id:     `gemini-${Date.now()}`,
      object: 'chat.completion',
      model,
      choices: [{
        index:         0,
        message:       { role: 'assistant', content: text },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens:     result.response.usageMetadata?.promptTokenCount     ?? 0,
        completion_tokens: result.response.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens:      result.response.usageMetadata?.totalTokenCount      ?? 0,
      },
      _route: { provider: 'gemini', model },
    };
  } catch (err) {
    const e = new Error(err?.message || 'Gemini API error');
    e.status = err?.status || 502;
    e.gemini_error = err;
    throw e;
  }
}



// ── Cloudflare Workers AI call ────────────────────────────────────────────────

async function callCloudflare(model, messages, system, max_tokens, temperature) {
  const cfMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages,
  ];

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const upstream = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type':  'application/json',
      },
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


// ── OpenRouter call ────────────────────────────────────────────────────────────

async function callOpenRouter(model, messages, system, max_tokens, temperature) {
  const orMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages,
  ];

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
    },
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

// ── Mistral call ───────────────────────────────────────────────────────────────

async function callMistral(model, messages, system, max_tokens, temperature) {
  const mistralMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages,
  ];

  const upstream = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model, messages: mistralMessages, max_tokens, temperature }),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    const err = new Error(data.error?.message || 'Mistral API error');
    err.status = upstream.status;
    throw err;
  }

  return { ...data, _route: { provider: 'mistral', model } };
}

// ── DeepSeek call (OpenAI-compatible) ────────────────────────────────────────
// Used as the assessment pipeline model and the final paid fallback
// before Anthropic Haiku. Error code 402 = insufficient balance (free credits exhausted).

async function callDeepSeek(model, messages, system, max_tokens, temperature) {
  const dsMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages,
  ];

  const upstream = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model, messages: dsMessages, max_tokens, temperature }),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    const err = new Error(data.error?.message || 'DeepSeek API error');
    err.status = upstream.status;
    // 402 = account balance exhausted — triggers fallback to Haiku
    throw err;
  }

  const text = data?.choices?.[0]?.message?.content ?? '';
  return {
    id:     data.id || `deepseek-${Date.now()}`,
    object: 'chat.completion',
    model,
    choices: [{
      index:         0,
      message:       { role: 'assistant', content: text },
      finish_reason: data.choices?.[0]?.finish_reason ?? 'stop',
    }],
    usage: {
      prompt_tokens:     data.usage?.prompt_tokens     ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens:      data.usage?.total_tokens      ?? 0,
      cache_read_input_tokens: data.usage?.prompt_cache_hit_tokens ?? 0,
    },
    _route: { provider: 'deepseek', model },
  };
}

// ── Cerebras call (OpenAI-compatible, wafer-scale inference) ─────────────────
// gpt-oss-120b — OpenAI open-weight model on Cerebras, free tier, no credit card required.
// Free tier: 30 RPM, 1M tokens/day, no credit card required.

async function callCerebras(model, messages, system, max_tokens, temperature) {
  const csMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages,
  ];

  const upstream = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model, messages: csMessages, max_tokens, temperature }),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    const err = new Error(data.message || data.error?.message || 'Cerebras API error');
    err.status = upstream.status;
    throw err;
  }

  const text = data?.choices?.[0]?.message?.content ?? '';
  return {
    id:     data.id || `cerebras-${Date.now()}`,
    object: 'chat.completion',
    model,
    choices: [{
      index:         0,
      message:       { role: 'assistant', content: text },
      finish_reason: data.choices?.[0]?.finish_reason ?? 'stop',
    }],
    usage: {
      prompt_tokens:     data.usage?.prompt_tokens     ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens:      data.usage?.total_tokens      ?? 0,
    },
    _route: { provider: 'cerebras', model },
  };
}

// ── Free-tier fallback chain ───────────────────────────────────────────────────

async function callWithFallbackChain(messages, system, max_tokens, temperature, page = '') {
  const estTokens = estimateRequestTokens(messages, system, max_tokens);
  console.log(`[chat.js] fallback chain start page="${page}" estTokens=${estTokens} messageCount=${messages.length}`);

  const chain = [
    {
      name:     'groq',
      model:    GROQ_MODEL,
      keyEnv:   'GROQ_API_KEY',
      skipIf:   () => estimateRequestTokens(messages, system, max_tokens) > (GROQ_TPM_LIMIT - TOKEN_SAFETY_MARGIN),
      skipReason: 'estimated request size exceeds Groq TPM limit (12000)',
      fn:       () => callGroq(GROQ_MODEL, messages, system, max_tokens, temperature),
    },
    {
      name:     'cerebras',
      model:    CEREBRAS_MODEL,
      keyEnv:   'CEREBRAS_API_KEY',
      fn:       () => callCerebras(CEREBRAS_MODEL, messages, system, max_tokens, temperature),
    },
    {
      name:     'cloudflare',
      model:    CLOUDFLARE_MODEL,
      keyEnv:   'CLOUDFLARE_API_TOKEN',
      fn:       () => callCloudflare(CLOUDFLARE_MODEL, messages, system, max_tokens, temperature),
    },
    {
      name:     'openrouter',
      model:    OPENROUTER_MODEL,
      keyEnv:   'OPENROUTER_API_KEY',
      fn:       () => callOpenRouter(OPENROUTER_MODEL, messages, system, max_tokens, temperature),
    },
    {
      name:     'mistral',
      model:    MISTRAL_MODEL,
      keyEnv:   'MISTRAL_API_KEY',
      fn:       () => callMistral(MISTRAL_MODEL, messages, system, max_tokens, temperature),
    },
    {
      name:     'deepseek',
      model:    DEEPSEEK_MODEL,
      keyEnv:   'DEEPSEEK_API_KEY',
      fn:       () => callDeepSeek(DEEPSEEK_MODEL, messages, system, max_tokens, temperature),
    },
    {
      name:     'anthropic',
      model:    ANTHROPIC_HAIKU,
      keyEnv:   'ANTHROPIC_API_KEY',
      fn:       () => callAnthropic(ANTHROPIC_HAIKU, messages, system, max_tokens, temperature),
    },
  ];

  const errors = [];

  for (const provider of chain) {
    if (!process.env[provider.keyEnv]) {
      console.log(`[chat.js] ⏭️  Skipping ${provider.name} (no ${provider.keyEnv})`);
      errors.push({ provider: provider.name, error: `${provider.keyEnv} not set` });
      continue;
    }

    if (isOnCooldown(provider.name)) {
      console.log(`[chat.js] ⏭️  Skipping ${provider.name} (on cooldown)`);
      errors.push({ provider: provider.name, error: 'on cooldown' });
      continue;
    }

    if (provider.skipIf && provider.skipIf()) {
      console.log(`[chat.js] ⏭️  Skipping ${provider.name} (${provider.skipReason})`);
      errors.push({ provider: provider.name, error: provider.skipReason });
      continue;
    }

    try {
      console.log(`[chat.js] Trying ${provider.name} (${provider.model})...`);
      const result = await provider.fn();
      console.log(`[chat.js] ✅ Success via ${provider.name}`);
      return {
        result,
        actualProvider: provider.name,
        actualModel:    provider.model,
        wasFallback:    provider.name !== 'groq',
      };
    } catch (error) {
      console.warn(`[chat.js] ⚠️ ${provider.name} failed:`, error?.message || String(error));
      console.error(`[chat.js] ${provider.name} error details:`, error);
      errors.push({ provider: provider.name, error: error?.message || String(error) });

      if (isRateLimitOrQuotaError(error)) {
        setCooldown(provider.name, COOLDOWN_DURATION);
      } else if (isMissingKeyError(error)) {
        setCooldown(provider.name, MISSING_KEY_COOLDOWN);
      } else if (isPermanentError(error)) {
        console.warn(`[chat.js] 🚫 ${provider.name} permanent error — cooldown 6h`);
        setCooldown(provider.name, PERMANENT_ERROR_COOLDOWN);
      }

      continue;
    }
  }

  // If every provider was skipped because its key is not set, return a 400
  const allKeysMissing = errors.length > 0 && errors.every(e => typeof e.error === 'string' && e.error.includes('not set'));
  if (allKeysMissing) {
    const e = new Error('No AI provider keys are configured on the server. Please set at least one provider API key.');
    e.status = 400;
    e.details = errors;
    throw e;
  }

  const err = new Error(
    `All AI providers failed:\n${errors.map(e => `  ${e.provider}: ${e.error}`).join('\n')}`
  );
  err.status = 503;
  err.provider_errors = errors;
  throw err;
}

// ── Streaming Anthropic call (for AIPlaygroundPage) ───────────────────────────

async function callAnthropicStreaming(model, messages, system, max_tokens, temperature, res) {
  const systemPayload = system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : undefined;

  const cachedMessages = applyCacheToLastAssistant(messages);

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':          process.env.ANTHROPIC_API_KEY,
      'anthropic-version':  '2023-06-01',
      'anthropic-beta':     'prompt-caching-2024-07-31',
      'Content-Type':       'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      messages: cachedMessages,
      stream: true,
      ...(systemPayload ? { system: systemPayload } : {}),
    }),
  });

  if (!upstream.ok) {
    const errData = await upstream.json();
    throw Object.assign(
      new Error(errData.error?.message || 'Anthropic API error'),
      { status: upstream.status, anthropic_error: errData }
    );
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let inputTokens = 0, outputTokens = 0, cacheHitTokens = 0, cacheWriteTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const evt = JSON.parse(raw);

        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          const chunk = evt.delta.text;
          fullText += chunk;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }

        if (evt.type === 'message_delta' && evt.usage) {
          outputTokens = evt.usage.output_tokens ?? 0;
        }

        if (evt.type === 'message_start' && evt.message?.usage) {
          inputTokens      = evt.message.usage.input_tokens                ?? 0;
          cacheHitTokens   = evt.message.usage.cache_read_input_tokens     ?? 0;
          cacheWriteTokens = evt.message.usage.cache_creation_input_tokens ?? 0;
        }
      } catch { /* skip malformed SSE lines */ }
    }
  }

  res.write(`data: ${JSON.stringify({ done: true, fullText, usage: { inputTokens, outputTokens, cacheHitTokens, cacheWriteTokens } })}\n\n`);
  res.end();

  return { inputTokens, outputTokens, cacheHitTokens, cacheWriteTokens };
}

// ── Main handler ───────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      message:   'Chat API is working (multi-provider fallback enabled)',
      providers: [
        'groq/llama-3.3-70b (primary free)',
        'gemini/2.0-flash (free fallback)',
        'cloudflare/llama-3.3-70b-fp8 (free fallback)',
        'openrouter/llama-3.3-70b:free (free fallback)',
        'mistral/small (free fallback)',
        'deepseek/deepseek-chat (paid fallback, ~71% cheaper than Haiku)',
        'anthropic/haiku (final paid fallback + coding tasks)',
      ],
      method:    'GET',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      messages,
      system,
      max_tokens      = 1000,
      temperature     = 0.7,
      page            = '',
      playgroundModel = null,
      taskType        = null,
      userId          = null,
      city            = null,
      stream          = false,
    } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (messages.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'Messages array must contain at least one message' });
    }

    const invalidMsg = messages.find(m => !m || typeof m.role !== 'string' || (typeof m.content !== 'string' && !Array.isArray(m.content)));
    if (invalidMsg) {
      console.error('[chat.js] Invalid message payload detected:', JSON.stringify(invalidMsg));
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'Each message must have a string `role` and a `content` string or array' });
    }

    const { provider, model } = resolveRoute(page, playgroundModel, taskType);

    console.log(`[chat.js] page="${page}" taskType="${taskType}" stream=${stream} → provider=${provider} model=${model}`);

    // ── Streaming path (AIPlaygroundPage opts in) ──────────────────────────────
    if (stream && provider === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(400).json({ error: 'Anthropic API key not configured' });
      }
      const usage = await callAnthropicStreaming(model, messages, system, max_tokens, temperature, res);
      logCost({
        page, provider: 'anthropic', model,
        inputTokens:       usage.inputTokens,
        outputTokens:      usage.outputTokens,
        cacheHitTokens:    usage.cacheHitTokens,
        cacheWriteTokens:  usage.cacheWriteTokens,
        userId, city, taskType,
      });
      return;
    }

    // ── Non-streaming path ─────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/json');

    // FREE-TIER-ROUTED → use full fallback chain
    if (provider === 'groq') {
      const { result, actualProvider, actualModel, wasFallback } =
        await callWithFallbackChain(messages, system, max_tokens, temperature, page);

      logCost({
        page,
        provider:          actualProvider,
        model:             actualModel,
        inputTokens:       result.usage?.prompt_tokens               ?? 0,
        outputTokens:      result.usage?.completion_tokens           ?? 0,
        cacheHitTokens:    result.usage?.cache_read_input_tokens     ?? 0,
        cacheWriteTokens:  result.usage?.cache_creation_input_tokens ?? 0,
        userId, city, taskType,
      });

      if (wasFallback) {
        console.log(`[chat.js] 📋 Fallback used: ${actualProvider}/${actualModel} for page="${page}"`);
      }

      return res.status(200).json(result);
    }

    // ANTHROPIC-ROUTED (Sonnet for coding, Haiku for default/playground)
    if (!process.env.ANTHROPIC_API_KEY) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'Anthropic API key not configured' });
    }

    const result = await callAnthropic(model, messages, system, max_tokens, temperature);
    logCost({
      page, provider: 'anthropic', model,
      inputTokens:       result.usage?.prompt_tokens     ?? 0,
      outputTokens:      result.usage?.completion_tokens ?? 0,
      cacheHitTokens:    result.usage?.cache_read_input_tokens    ?? 0,
      cacheWriteTokens:  result.usage?.cache_creation_input_tokens ?? 0,
      userId, city, taskType,
    });
    return res.status(200).json(result);

  } catch (error) {
    console.error('[chat.js] Error:', error);
    try { console.error('[chat.js] Error (stringified):', JSON.stringify(error)); } catch (e) { /* ignore */ }

    // Log to system_events and send triage alert email
    logEvent({
      function_name: 'chat.js',
      event_type:    error.status === 429 ? 'rate_limit'
                   : error.status === 401 ? 'auth_error'
                   : error.status === 503 ? 'all_providers_failed'
                   : 'unhandled_exception',
      severity:      error.status >= 500 || !error.status ? 'error' : 'warning',
      payload: {
        message:         error.message,
        status:          error.status || 500,
        type:            error.constructor?.name,
        provider_errors: error.provider_errors || undefined,
      },
    });

    const status = error.status || 500;
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(status).json({
        error:           `Server error: ${error.message}`,
        anthropic_error: error.anthropic_error,
        groq_error:      error.groq_error,
        type:            error.constructor?.name,
        stack:           process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
    res.end();
  }
}