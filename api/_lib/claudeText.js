// api/_lib/claudeText.js
//
// One plain-text Claude call. Defaults to Haiku 5.5; pass { model, effort } for Sonnet 5.5 (graders use
// medium effort). Haiku rejects `effort` and Sonnet 5.5 rejects `temperature`, so effort is sent only
// when asked for and no temperature is ever sent.

export async function claudeText({ system, user, maxTokens = 1000, model = 'claude-haiku-5-5', effort, fetchImpl = fetch }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(effort ? { output_config: { effort } } : {}),
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`Anthropic API error (${r.status}): ${err?.error?.message || 'Unknown'}`);
  }
  const data = await r.json();
  return (data?.content ?? []).find((b) => b?.type === 'text')?.text ?? '';
}

export const NOT_AVAILABLE_FOR_AGE = {
  error: 'This feature is not available for your age group yet.',
  code: 'not_available_for_age',
};
