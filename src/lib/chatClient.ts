// src/lib/chatClient.ts
export type Role = 'user' | 'assistant' | 'system';
export type ChatMessage = { role: Role; content: string };

// ── Identity store ────────────────────────────────────────────────────────────
// Call setChatIdentity once after login (in App.tsx).
// Every subsequent chatText/chatJSON call automatically forwards userId + city
// to chat.js for per-learner cost attribution in api_cost_log.
let _chatUserId: string | null = null;
let _chatCity:   string | null = null;

export function setChatIdentity(userId: string | null, city: string | null): void {
  _chatUserId = userId;
  _chatCity   = city;
}

type BaseArgs = {
  messages: ChatMessage[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
  page?: string;             // routes to correct model in chat.js
  playgroundModel?: string | null;
};

// Returns plain text from /api/chat
export async function chatText({
  messages,
  system,
  max_tokens = 800,
  temperature = 0.7,
  page,
  playgroundModel,
}: BaseArgs): Promise<string> {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages, system, max_tokens, temperature,
      page:            page            ?? '',
      playgroundModel: playgroundModel ?? null,
      userId:          _chatUserId,
      city:            _chatCity,
    }),
  });
  let data: any;
  try {
    data = await r.json();
  } catch (err) {
    // If the proxy returned non-JSON (HTML error page), try to extract a helpful message
    const text = await r.text().catch(() => '');
    const lowered = (text || '').toLowerCase();
    if (lowered.includes('api key') || lowered.includes('no ai provider') || lowered.includes('not configured')) {
      throw new Error('Missing API Key');
    }
    throw new Error(`Chat proxy returned non-JSON response (status ${r.status})`);
  }

  if (!r.ok) {
    const errMsg = data?.error || data?.message || `Chat proxy error ${r.status}`;
    const lowered = String(errMsg).toLowerCase();
    if (lowered.includes('api key') || lowered.includes('no ai provider') || lowered.includes('not configured')) {
      throw new Error('Missing API Key');
    }
    throw new Error(errMsg || `Chat proxy error ${r.status}`);
  }

  // OpenAI-like response passthrough; return the assistant text
  return data?.choices?.[0]?.message?.content ?? '';
}

// Returns a parsed JSON object (for rubric/evaluation responses)
export async function chatJSON({
  messages,
  system,
  max_tokens = 800,
  temperature = 0.2,
  page,
  playgroundModel,
}: BaseArgs): Promise<any> {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages, system, max_tokens, temperature,
      page:            page            ?? '',
      playgroundModel: playgroundModel ?? null,
      userId:          _chatUserId,
      city:            _chatCity,
    }),
  });
  let data: any;
  try {
    data = await r.json();
  } catch (err) {
    const text = await r.text().catch(() => '');
    const lowered = (text || '').toLowerCase();
    if (lowered.includes('api key') || lowered.includes('no ai provider') || lowered.includes('not configured')) {
      throw new Error('Missing API Key');
    }
    throw new Error(`Chat proxy returned non-JSON response (status ${r.status})`);
  }

  if (!r.ok) {
    const errMsg = data?.error || data?.message || `Chat proxy error ${r.status}`;
    const lowered = String(errMsg).toLowerCase();
    if (lowered.includes('api key') || lowered.includes('no ai provider') || lowered.includes('not configured')) {
      throw new Error('Missing API Key');
    }
    throw new Error(errMsg || `Chat proxy error ${r.status}`);
  }

  if (!data?.choices?.[0]?.message?.content) {
    console.warn('[chatJSON] /api/chat returned no assistant content:', data);
    throw new Error('API returned empty response');
  }

  const rawContent = data.choices[0].message.content;
  console.log('[chatJSON] Raw API response length:', rawContent.length);
  console.log('[chatJSON] Raw API response first 500 chars:', rawContent.slice(0, 500));

  let raw = rawContent.trim();

  // ── Aggressive markdown code fence stripping ────────────────────────────────
  // Match and remove code fences at start: ```json, ```JSON, ```, etc.
  raw = raw.replace(/^```(?:json|JSON|js|javascript)?\s*[\r\n]+/, '');
  
  // Match and remove code fences at end: ``` with optional whitespace
  raw = raw.replace(/[\r\n]+```\s*$/, '');
  raw = raw.replace(/```\s*$/, '');

  raw = raw.trim();
  
  console.log('[chatJSON] After fence stripping, first 500 chars:', raw.slice(0, 500));

  // ── Extract JSON if it's buried in other text ────────────────────────────────
  if (!raw.startsWith('{') && !raw.startsWith('[')) {
    console.log('[chatJSON] Response does not start with { or [ — attempting extraction...');
    
    // Try to find JSON object or array within the text
    const jsonMatch = raw.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      raw = jsonMatch[1].trim();
      console.log('[chatJSON] Extracted JSON object from text');
    } else {
      const arrayMatch = raw.match(/(\[[\s\S]*\])/);
      if (arrayMatch) {
        raw = arrayMatch[1].trim();
        console.log('[chatJSON] Extracted JSON array from text');
      } else {
        console.error('[chatJSON] Could not find JSON in response');
        console.error('[chatJSON] Full raw content:', raw);
        throw new Error('Response does not contain valid JSON');
      }
    }
  }

  // ── Parse JSON with detailed error handling ────────────────────────────────
  try {
    const parsed = JSON.parse(raw);
    console.log('[chatJSON] Successfully parsed JSON. Keys:', Object.keys(parsed).join(', '));
    return parsed;
  } catch (parseError) {
    console.error('[chatJSON] JSON.parse() failed:', parseError);
    console.error('[chatJSON] Attempted to parse:', raw.slice(0, 1000));
    console.error('[chatJSON] Full raw content (last 1000 chars):', raw.slice(-1000));
    console.error('[chatJSON] Full API response object:', JSON.stringify(data, null, 2));
    
    // Do NOT return raw string — throw error so caller can handle it properly
    throw new Error(`Failed to parse JSON response: ${(parseError as Error).message}\nContent preview: ${raw.slice(0, 200)}`);
  }
}

// Optional image generation helper (if your page needs it)
export async function generateImageViaServer({
  prompt,
  size = '1024x1024',
}: {
  prompt: string;
  size?: '512x512' | '1024x1024' | '2048x2048';
}) {
  const r = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, size }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || `Image proxy error ${r.status}`);
  return data; // { b64: string }
}