// lib/api-logger.ts
// Shared error/event logger for all API routes.
// Writes to Supabase `system_events` table and sends email alerts on critical failures.
// Drop-in for any edge or serverless function.
//
// Supports all providers in the fallback chain:
//   Anthropic, Groq, Gemini, Cerebras, OpenRouter, Mistral

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || process.env.SUPABASE_URL  || '';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_KEY    = process.env.RESEND_API_KEY            || '';
const ALERT_EMAIL   = process.env.TRIAGE_ALERT_EMAIL        || 'khallinan1@udayton.edu';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export type AIProvider =
  | 'anthropic'
  | 'groq'
  | 'gemini'
  | 'cerebras'
  | 'openrouter'
  | 'mistral';

export interface SystemEvent {
  function_name: string;       // e.g. 'chat-stream', 'generate-site-code'
  event_type: string;          // e.g. 'max_tokens_hit', 'auth_error', 'rate_limit'
  severity: EventSeverity;
  payload: Record<string, unknown>;
  user_id?: string;
  cohort?: string;
  provider?: AIProvider;       // which AI provider triggered the event
}

// ─── Supabase insert (works in both Edge and Node runtimes) ──────────────────

async function insertEvent(event: SystemEvent): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/system_events`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        function_name: event.function_name,
        event_type:    event.event_type,
        severity:      event.severity,
        payload:       event.payload,
        user_id:       event.user_id   ?? null,
        cohort:        event.cohort    ?? null,
        provider:      event.provider  ?? null,
        created_at:    new Date().toISOString(),
      }),
    });
  } catch {
    // Never let logging crash the actual request
  }
}

// ─── Email alert via Resend ───────────────────────────────────────────────────

async function sendAlert(event: SystemEvent): Promise<void> {
  if (!RESEND_KEY || !ALERT_EMAIL) return;

  const providerLabel = event.provider ? ` [${event.provider.toUpperCase()}]` : '';
  const subject = `[nextVillage]${providerLabel} ${event.severity.toUpperCase()}: ${event.event_type} in ${event.function_name}`;
  const body = `
<h2 style="color:#c0392b">${event.severity.toUpperCase()}: ${event.event_type}</h2>
<p><strong>Function:</strong> ${event.function_name}</p>
${event.provider ? `<p><strong>Provider:</strong> ${event.provider}</p>` : ''}
<p><strong>Time:</strong> ${new Date().toISOString()}</p>
${event.cohort  ? `<p><strong>Cohort:</strong> ${event.cohort}</p>`  : ''}
${event.user_id ? `<p><strong>User:</strong> ${event.user_id}</p>`   : ''}
<h3>Details</h3>
<pre style="background:#f4f4f4;padding:12px;border-radius:4px">${JSON.stringify(event.payload, null, 2)}</pre>
<hr/>
<p style="color:#888;font-size:12px">nextVillage Triage Agent</p>
  `.trim();

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from:    'triage@girlsaiing.com',
        to:      ALERT_EMAIL,
        subject,
        html:    body,
      }),
    });
  } catch {
    // Never let alerting crash the actual request
  }
}

// ─── Main logger ──────────────────────────────────────────────────────────────

export async function logEvent(event: SystemEvent): Promise<void> {
  // Always write to Supabase
  await insertEvent(event);

  // Email only on error or critical
  if (event.severity === 'error' || event.severity === 'critical') {
    await sendAlert(event);
  }
}

// ─── Universal error classifier ──────────────────────────────────────────────
// Works for all providers. Maps HTTP status codes to structured events.
// Provider-specific nuances handled by the optional overrides.

export function classifyProviderError(
  provider: AIProvider,
  status: number,
  body: Record<string, unknown>
): {
  event_type: string;
  severity: EventSeverity;
  message: string;
} {
  // Extract error message — each provider nests it slightly differently
  const msg =
    (body?.error as any)?.message ??          // Anthropic, Groq, OpenRouter, Mistral, Cerebras
    (body?.error as any)?.status ??           // Gemini sometimes
    (body as any)?.message ??                 // Gemini fallback
    String(body);

  // Universal HTTP status mapping
  if (status === 401) return { event_type: 'auth_error',      severity: 'critical', message: msg };
  if (status === 403) return { event_type: 'forbidden',       severity: 'error',    message: msg };
  if (status === 429) return { event_type: 'rate_limit',      severity: 'error',    message: msg };
  if (status === 400) return { event_type: 'invalid_request', severity: 'error',    message: msg };

  // Provider-specific status codes
  if (status === 529 && provider === 'anthropic') {
    return { event_type: 'api_overloaded', severity: 'warning', message: msg };
  }
  if (status === 503) {
    return { event_type: 'service_unavailable', severity: 'error', message: msg };
  }

  if (status >= 500) return { event_type: `${provider}_server_error`, severity: 'error', message: msg };

  return { event_type: `http_${status}`, severity: 'error', message: msg };
}

// Keep backward compatibility — existing code calls classifyAnthropicError
export function classifyAnthropicError(status: number, body: Record<string, unknown>) {
  return classifyProviderError('anthropic', status, body);
}

// ─── Provider config ──────────────────────────────────────────────────────────

interface ProviderConfig {
  name: AIProvider;
  baseURL: string;
  apiKeyEnv: string;
  authHeader: (key: string) => Record<string, string>;
  extraHeaders?: Record<string, string>;
}

const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  anthropic: {
    name: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1/messages',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    authHeader: (key) => ({
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
    }),
  },
  groq: {
    name: 'groq',
    baseURL: 'https://api.groq.com/openai/v1/chat/completions',
    apiKeyEnv: 'GROQ_API_KEY',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
  gemini: {
    name: 'gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnv: 'GEMINI_API_KEY',
    authHeader: () => ({}), // Gemini uses query param ?key=...
  },
  cerebras: {
    name: 'cerebras',
    baseURL: 'https://api.cerebras.ai/v1/chat/completions',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
  openrouter: {
    name: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
  mistral: {
    name: 'mistral',
    baseURL: 'https://api.mistral.ai/v1/chat/completions',
    apiKeyEnv: 'MISTRAL_API_KEY',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
};

// ─── Universal provider fetch ─────────────────────────────────────────────────
// Drop-in for any OpenAI-compatible provider (Groq, Cerebras, OpenRouter, Mistral).
// For Anthropic, use anthropicFetch() which handles its unique request format.
// For Gemini, use geminiFetch() which handles its unique SDK/REST format.

export async function providerFetch(
  provider: AIProvider,
  payload: Record<string, unknown>,
  callerName: string,
  meta?: { user_id?: string; cohort?: string },
): Promise<Response> {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    await logEvent({
      function_name: callerName,
      event_type:    'missing_api_key',
      severity:      'critical',
      payload:       { message: `${config.apiKeyEnv} is not set`, provider },
      provider,...meta,
    });
    throw new Error(`${config.apiKeyEnv} is not configured`);
  }

  const response = await fetch(config.baseURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',...config.authHeader(apiKey),...(config.extraHeaders || {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const cloned = response.clone();
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch { /* ignore */ }

    const { event_type, severity, message } = classifyProviderError(provider, response.status, body);

    await logEvent({
      function_name: callerName,
      event_type,
      severity,
      payload: {
        status:     response.status,
        message,
        model:      payload.model,
        max_tokens: payload.max_tokens,
        provider,
      },
      provider,...meta,
    });
  }

  return response;
}

// ─── Wrapped Anthropic fetch (backward compatible) ───────────────────────────
// Existing code calls this directly — preserved with same signature.

export async function anthropicFetch(
  payload: Record<string, unknown>,
  callerName: string,
  meta?: { user_id?: string; cohort?: string },
): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await logEvent({
      function_name: callerName,
      event_type:    'missing_api_key',
      severity:      'critical',
      payload:       { message: 'ANTHROPIC_API_KEY is not set', provider: 'anthropic' },
      provider:      'anthropic',...meta,
    });
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const cloned = response.clone();
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch { /* ignore */ }

    const { event_type, severity, message } = classifyAnthropicError(response.status, body);

    await logEvent({
      function_name: callerName,
      event_type,
      severity,
      payload: {
        status:     response.status,
        message,
        model:      payload.model,
        max_tokens: payload.max_tokens,
        provider:   'anthropic',
      },
      provider: 'anthropic',...meta,
    });
  }

  return response;
}

// ─── Wrapped Gemini fetch ─────────────────────────────────────────────────────
// Gemini REST API uses a different URL pattern and auth (query param, not header).

export async function geminiFetch(
  model: string,
  payload: Record<string, unknown>,
  callerName: string,
  meta?: { user_id?: string; cohort?: string },
): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await logEvent({
      function_name: callerName,
      event_type:    'missing_api_key',
      severity:      'critical',
      payload:       { message: 'GEMINI_API_KEY is not set', provider: 'gemini' },
      provider:      'gemini',...meta,
    });
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const cloned = response.clone();
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch { /* ignore */ }

    const { event_type, severity, message } = classifyProviderError('gemini', response.status, body);

    await logEvent({
      function_name: callerName,
      event_type,
      severity,
      payload: {
        status:  response.status,
        message,
        model,
        provider: 'gemini',
      },
      provider: 'gemini',...meta,
    });
  }

  return response;
}

// ─── Usage token tracker ──────────────────────────────────────────────────────
// Call after a successful response to catch silent max_tokens truncations.
// Works for all providers — stop reason field varies by provider.

export async function checkUsage(
  completion: {
    stop_reason?: string;        // Anthropic
    finish_reason?: string;      // OpenAI-compatible (Groq, Cerebras, OpenRouter, Mistral)
    usage?: {
      input_tokens?: number;     // Anthropic
      output_tokens?: number;    // Anthropic
      prompt_tokens?: number;    // OpenAI-compatible
      completion_tokens?: number; // OpenAI-compatible
      total_tokens?: number;
    };
  },
  callerName: string,
  model: string,
  provider?: AIProvider,
  meta?: { user_id?: string; cohort?: string },
): Promise<void> {
  // Normalize stop reason across providers
  const stopReason = completion.stop_reason || completion.finish_reason;
  const isMaxTokens = stopReason === 'max_tokens' || stopReason === 'length';

  if (isMaxTokens) {
    await logEvent({
      function_name: callerName,
      event_type:    'max_tokens_hit',
      severity:      'warning',
      payload: {
        stop_reason:       stopReason,
        input_tokens:      completion.usage?.input_tokens  ?? completion.usage?.prompt_tokens,
        output_tokens:     completion.usage?.output_tokens ?? completion.usage?.completion_tokens,
        total_tokens:      completion.usage?.total_tokens,
        model,
        provider:          provider ?? 'unknown',
        note: 'Response was truncated — JSON may be malformed or content incomplete',
      },
      provider,...meta,
    });
  }
}

// ─── Fallback chain logger ────────────────────────────────────────────────────
// Logs when the fallback chain activates — useful for monitoring which
// providers are failing and how often fallbacks are triggered.

export async function logFallback(
  callerName: string,
  failedProvider: AIProvider,
  succeededProvider: AIProvider,
  failReason: string,
  meta?: { user_id?: string; cohort?: string; page?: string },
): Promise<void> {
  await logEvent({
    function_name: callerName,
    event_type:    'provider_fallback',
    severity:      'warning',
    payload: {
      failed_provider:    failedProvider,
      succeeded_provider: succeededProvider,
      fail_reason:        failReason,
      page:               meta?.page,
    },
    provider: succeededProvider,...meta,
  });
}

// ─── All-providers-failed logger ──────────────────────────────────────────────
// Logs when every provider in the chain has failed — this is critical.

export async function logAllProvidersFailed(
  callerName: string,
  errors: Array<{ provider: string; error: string }>,
  meta?: { user_id?: string; cohort?: string; page?: string },
): Promise<void> {
  await logEvent({
    function_name: callerName,
    event_type:    'all_providers_failed',
    severity:      'critical',
    payload: {
      errors,
      page: meta?.page,
      note: 'Every AI provider in the fallback chain failed — user received an error',
    },...meta,
  });
}