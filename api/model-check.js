// api/model-check.js — Tier 2 proactive deprecation check.
//
// Runs on a Vercel cron (see vercel.json). For each provider in model_config,
// fetches the provider's live model list and confirms the configured model is
// still offered. If a model has vanished, logs a `model_deprecated` event to
// system_events (severity: warning) — your triage-webhook then emails you,
// with the provider's current model list in the payload so the replacement
// candidates are right there in the alert.
//
// Setup:
//   1. Add `model_deprecated` and `model_check_failed` to ACTIONABLE_EVENTS
//      in api/triage-webhook.ts.
//   2. Add to vercel.json:
//        { "crons": [{ "path": "/api/model-check", "schedule": "0 11 * * *" }] }
//      (11:00 UTC = 7:00 AM ET, daily)
//   3. Set CRON_SECRET in Vercel env vars (any random string). Vercel sends it
//      automatically as `Authorization: Bearer <CRON_SECRET>` on cron calls.
//
// Uses the same env vars chat.js already has — nothing new to configure
// beyond CRON_SECRET.

const DEFAULT_MODELS = {
  anthropic_haiku:  'claude-haiku-4-5-20251001',
  anthropic_sonnet: 'claude-sonnet-4-6',
  groq:             'llama-3.3-70b-versatile',
  cerebras:         'gpt-oss-120b',
  deepseek:         'deepseek-chat',
  gemini:           'gemini-2.0-flash',
  cloudflare:       '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  openrouter:       'meta-llama/llama-3.3-70b-instruct:free',
  mistral:          'mistral-small-latest',
};

// ── Load current models from model_config (falls back to defaults) ────────────

async function loadModels() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const models = { ...DEFAULT_MODELS };
  if (!url || !key) return models;

  try {
    const resp = await fetch(`${url}/rest/v1/model_config?select=provider,model`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    });
    if (resp.ok) {
      for (const row of await resp.json()) {
        if (row?.provider in models && row.model) models[row.provider] = row.model;
      }
    }
  } catch { /* defaults are fine */ }
  return models;
}

// ── Per-provider model-list fetchers ──────────────────────────────────────────
// Each returns an array of model ID strings, or null if the check couldn't run
// (missing key, network error) — null means "unknown", never "deprecated".

async function listOpenAICompatible(baseUrl, apiKey) {
  if (!apiKey) return null;
  const resp = await fetch(`${baseUrl}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.data ?? []).map(m => m.id);
}

async function listAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const ids = [];
  let url = 'https://api.anthropic.com/v1/models?limit=100';
  // Paginate — Anthropic caps at 100 per page
  for (let page = 0; page < 5 && url; page++) {
    const resp = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    ids.push(...(data.data ?? []).map(m => m.id));
    url = data.has_more && data.last_id
      ? `https://api.anthropic.com/v1/models?limit=100&after_id=${data.last_id}`
      : null;
  }
  return ids;
}

async function listCloudflare() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token     = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=250&task=Text%20Generation`,
    { headers: { 'Authorization': `Bearer ${token}` } },
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.result ?? []).map(m => m.name);
}

async function listGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${apiKey}`,
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  // Gemini names come back as "models/gemini-2.0-flash" — strip the prefix
  return (data.models ?? []).map(m => (m.name || '').replace(/^models\//, ''));
}

// Which fetcher covers which model_config rows
const CHECKS = [
  { providers: ['groq'],
    label: 'Groq',
    list:  () => listOpenAICompatible('https://api.groq.com/openai/v1', process.env.GROQ_API_KEY) },
  { providers: ['cerebras'],
    label: 'Cerebras',
    list:  () => listOpenAICompatible('https://api.cerebras.ai/v1', process.env.CEREBRAS_API_KEY) },
  { providers: ['deepseek'],
    label: 'DeepSeek',
    list:  () => listOpenAICompatible('https://api.deepseek.com', process.env.DEEPSEEK_API_KEY) },
  { providers: ['mistral'],
    label: 'Mistral',
    list:  () => listOpenAICompatible('https://api.mistral.ai/v1', process.env.MISTRAL_API_KEY) },
  { providers: ['openrouter'],
    label: 'OpenRouter',
    list:  () => listOpenAICompatible('https://openrouter.ai/api/v1', process.env.OPENROUTER_API_KEY) },
  { providers: ['anthropic_haiku', 'anthropic_sonnet'],
    label: 'Anthropic',
    list:  listAnthropic },
  { providers: ['cloudflare'],
    label: 'Cloudflare',
    list:  listCloudflare },
  { providers: ['gemini'],
    label: 'Gemini',
    list:  listGemini },
];

// A model "matches" if the list contains it exactly, or contains it with an
// OpenRouter variant suffix stripped (":free", ":nitro", etc.).
function modelInList(model, list) {
  if (list.includes(model)) return true;
  const base = model.split(':')[0];
  return base !== model && list.includes(base);
}

// ── Event logger (same system_events table triage-webhook watches) ────────────

async function logEvent(event_type, severity, payload) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/system_events`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        function_name: 'model-check',
        event_type,
        severity,
        payload,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('[model-check] logEvent failed:', err?.message);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Vercel cron sends: Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const models = await loadModels();
  const results = [];

  for (const check of CHECKS) {
    let list;
    try {
      list = await check.list();
    } catch (err) {
      // Couldn't verify — report it, but never claim deprecation on a fetch error
      console.warn(`[model-check] ${check.label} list fetch failed:`, err?.message);
      await logEvent('model_check_failed', 'warning', {
        provider: check.label,
        error:    err?.message,
        note:     'Could not fetch model list — configured models NOT verified this run.',
      });
      results.push({ provider: check.label, status: 'check_failed', error: err?.message });
      continue;
    }

    if (list === null) {
      results.push({ provider: check.label, status: 'skipped (no API key)' });
      continue;
    }

    for (const providerKey of check.providers) {
      const model = models[providerKey];
      if (modelInList(model, list)) {
        results.push({ provider: providerKey, model, status: 'ok' });
      } else {
        console.warn(`[model-check] ⚠️ ${providerKey}: "${model}" not in ${check.label}'s model list`);
        await logEvent('model_deprecated', 'warning', {
          provider:         providerKey,
          missing_model:    model,
          fix:              `update model_config set model = '<replacement>' where provider = '${providerKey}';`,
          available_models: list.slice(0, 40), // replacement candidates, right in the alert email
        });
        results.push({ provider: providerKey, model, status: 'MISSING' });
      }
    }
  }

  const missing = results.filter(r => r.status === 'MISSING').length;
  console.log(`[model-check] Done — ${results.length} checks, ${missing} missing`);
  return res.status(200).json({ checked_at: new Date().toISOString(), missing, results });
}
