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
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || `Chat proxy error ${r.status}`);

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
  try {
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

    // ── DEBUG: Log response status and headers ──
    console.log('[chatJSON] Response status:', r.status);
    console.log('[chatJSON] Content-type:', r.headers.get('content-type'));

    const data = await r.json();

    // ── DEBUG: Log full response structure ──
    console.log('[chatJSON] Full API response:', {
      ok: r.ok,
      status: r.status,
      dataStructure: Object.keys(data),
      choices: data?.choices ? `${data.choices.length} choices` : 'none',
      firstChoiceKeys: data?.choices?.[0] ? Object.keys(data.choices[0]) : 'N/A',
    });

    if (!r.ok) {
      const errorMsg = data?.error || `Chat proxy error ${r.status}`;
      console.error('[chatJSON] API error:', { errorMsg, data });
      throw new Error(errorMsg);
    }

    // ── DEBUG: Log content extraction ──
    const content = data?.choices?.[0]?.message?.content;
    console.log('[chatJSON] Extracted content length:', content?.length || 0);
    console.log('[chatJSON] Extracted content preview:', content?.substring(0, 200));

    let raw = content || '{}';
    
    // Strip markdown code fences if present (e.g., ```json ... ``` or ``` ... ```)
    raw = raw.trim();
    
    // ── DEBUG: Check for markdown fences ──
    if (raw.startsWith('```')) {
      console.log('[chatJSON] Detected markdown code fence, stripping...');
      // Remove opening fence (```json or ```)
      raw = raw.replace(/^```(?:json)?\s*\n?/, '');
      // Remove closing fence (```)
      raw = raw.replace(/\n?```\s*$/, '');
      raw = raw.trim();
      console.log('[chatJSON] After stripping fences:', raw.substring(0, 200));
    }
    
    // ── DEBUG: Attempt parse ──
    try {
      const parsed = JSON.parse(raw);
      console.log('[chatJSON] ✅ Successfully parsed JSON');
      console.log('[chatJSON] Parsed keys:', Object.keys(parsed));
      return parsed;
    } catch (parseError) {
      console.error('[chatJSON] ❌ JSON parse error:', {
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
        rawContent: raw.substring(0, 500),
        rawLength: raw.length,
      });
      
      // ── FALLBACK: Try to extract JSON object if wrapped in text ──
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('[chatJSON] Found JSON object in response, attempting parse...');
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log('[chatJSON] ✅ Successfully parsed extracted JSON');
          return extracted;
        } catch (e) {
          console.error('[chatJSON] Failed to parse extracted JSON:', e);
        }
      }

      // Return raw if all parsing attempts fail
      console.error('[chatJSON] All parsing attempts failed, returning raw content as fallback');
      return raw;
    }
  } catch (error) {
    console.error('[chatJSON] Network or other error:', error);
    throw error;
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