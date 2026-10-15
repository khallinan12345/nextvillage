// api/_lib/claudeText.js
//
// One plain-text Claude call (Haiku 5.5), used where a route would otherwise send a young
// learner's work to OpenAI. Haiku 5.5 rejects `temperature`, so none is sent.

export async function claudeText({ system, user, maxTokens = 1000, fetchImpl = fetch }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: maxTokens,
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
