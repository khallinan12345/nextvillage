// api/_lib/piiScrubbing.js
//
// Removes personal information from student messages before they reach any
// AI model. The learner's own first name is the only personal detail
// allowed through by default — last names, other people's names, addresses,
// phone numbers, emails, school names, specific neighborhoods, and exact
// ages/birthdates are replaced with a neutral placeholder first.
//
// ── Ordering invariant: moderate on raw, scrub before generation ──────────
// safetyGuardrails.js's checkAndEscalate() classifies the ORIGINAL,
// unscrubbed message — deliberately, not by accident of call order. A
// harm_to_others flag reading "I'm going to hurt [name removed]" is close
// to useless to the community leader who receives it; a self-harm flag
// survives scrubbing fine, but a threat doesn't. Every call site in this
// codebase must call checkAndEscalate() with the raw messages BEFORE
// calling scrubMessagesPII() — never the other way around. This module
// only ever scrubs the copy that continues on to the actual completion
// model, never the copy used for moderation or the leader-alert excerpt.
//
// ── What this module's guarantee actually is ───────────────────────────────
// The rewrite pass below sends the (regex-scrubbed) text to Anthropic to be
// rewritten — that's unavoidable, since removing a name from a sentence
// without breaking the sentence is itself a language task. So the real
// guarantee is "everyone except Anthropic sees only scrubbed text" — not
// "personal information never leaves the platform." Anthropic's API terms
// govern that hop; this module's job is everyone downstream of it (the
// completion model whose reply might get logged, shared, or shown to
// someone else, other students in a shared session, etc.).
//
// Two layers:
//   1. A deterministic regex pass — catches phone numbers (any common
//      grouping, not just US 3-3-4), emails, @handles, and some structured
//      local address patterns. Zero cost, always runs, can't fail.
//   2. An LLM rewrite pass (Haiku) — catches what regex can't: full names
//      (keeping the learner's own first name if known), school names,
//      specific neighborhoods, family members' names, and other free-form
//      identifying detail. Batched and chunked (see rewriteBatch) so it
//      doesn't silently degrade on long conversations; on a failure or a
//      truncated/malformed response it logs the failure (via an injected
//      logEvent) and falls back no further than the regex-scrubbed text —
//      never back to the original raw text.
//
// ── Tiers ────────────────────────────────────────────────────────────────
// Blanket location/other-person scrubbing breaks the pages where locality
// and a real person's situation *are* the point — a Healthcare Navigator
// that can't know the learner is in Mathare can't point at a clinic in
// Mathare, and an Agriculture/Fishing/Entrepreneurship consultant exists to
// give advice about a specific community member's actual crop, catch, or
// business. A county or neighborhood name alone isn't identifying; an
// estate plus a school plus a first name is. So:
//   - 'strict' (default — Use Claude, Create Game, AI Image Creation, and
//     anywhere else): removes other people's names and narrows locations
//     down to nothing more specific than necessary.
//   - 'community_helper' (the consultant/navigator pages, where the
//     conversation is fundamentally about a real community member's
//     situation): keeps other people's names and neighborhood/estate/county
//     level location detail; still removes phone numbers, emails, exact
//     street addresses, and the STUDENT's own last name.
// The caller passes the tier in (see COMMUNITY_HELPER_PAGES in api/chat.js)
// — this module has no idea what page a request came from.
//
// IMPORTANT — every user-role message in the conversation is re-scrubbed on
// every request, not just the newest one. The frontend is stateless here:
// it resends its own stored copy of the *original* text for every earlier
// turn on every subsequent request (it never learns the server rewrote
// anything), so scrubbing only the latest message would still send earlier
// turns' raw PII upstream on the next turn. Re-scrubbing already-scrubbed
// text is a no-op (nothing left to remove), so this is safe — the cost is
// that the rewrite pass's input grows with conversation length, not that
// anything leaks. A cheaper future version would have the server hand the
// scrubbed text back to the frontend to store in place of the original, so
// only genuinely new messages ever need the LLM pass again.

import { extractMessageText } from './safetyGuardrails.js';

const EMAIL_RE  = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HANDLE_RE = /(?<![\w@])@[A-Za-z0-9_]{2,}/g;

// Any run of digits and phone-punctuation (space, dot, dash, parens) whose
// digit count falls in a plausible phone-number range (7-15, per ITU
// E.164), regardless of internal grouping — 3-3-4 (US: 555-123-4567),
// 4-3-3 (common in Kenya/East Africa: 0712 345 678), or no grouping at all
// (0712345678, +254712345678, 08031234567 — Nigeria). The old version only
// matched a rigid 3-3-4 shape and let every one of those formats through
// unscrubbed. Digit-counting (rather than a shape match) is what makes this
// format-agnostic; it will occasionally catch an 8-10 digit date or ID
// number too (labeled generically as "[number removed]", not claimed to be
// a phone number) — an acceptable false positive given the alternative is
// missing the single most common identifier a student types.
const PHONE_CANDIDATE_RE = /\+?\(?\d[\d\s().-]{5,14}\d\)?/g;

// Structured local address patterns regex can reliably catch. This does
// NOT attempt to recognize arbitrary global address formats — an address
// like "24 Kileleshwar Close" with no P.O./Plot/House-No/suffix keyword
// will slip past regex and depends on the LLM rewrite pass below. Regex is
// a floor, not the address solution.
const US_STREET_RE   = /\b\d{1,6}\s+([A-Z][a-z]+\s){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Estate)\.?\b/g;
const LOCAL_ADDR_RE  = /\b(?:P\.?O\.?\s*Box\s*\d+|Plot\s+\d+[A-Za-z]?|House\s+(?:No\.?|Number)\s*\d+)\b/gi;

export function regexScrub(text) {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, '[email removed]')
    .replace(HANDLE_RE, '[handle removed]')
    .replace(US_STREET_RE, '[address removed]')
    .replace(LOCAL_ADDR_RE, '[address removed]')
    .replace(PHONE_CANDIDATE_RE, (match) => {
      const digits = match.replace(/\D/g, '');
      return (digits.length >= 7 && digits.length <= 15) ? '[number removed]' : match;
    });
}

function buildRewriteSystemPrompt(firstName, tier) {
  const nameRule = firstName
    ? `The student's own first name is "${firstName}" — you may keep that one word if it appears.`
    : 'Remove any first name too, since none is confirmed for this student.';

  const otherPeopleRule = tier === 'community_helper'
    ? 'Other people\'s names may stay — this conversation is about a real community member\'s situation (a farmer, a patient, a customer), and their name is part of what makes the advice useful.'
    : 'Remove any other person\'s name (friends, family members, teachers, anyone else).';

  const locationRule = tier === 'community_helper'
    ? 'Neighborhood, estate, town, county, and region names may stay — local specificity is the point of this conversation. Still remove a full street address (house/plot number plus street), a school name, or a P.O. Box if not already replaced with a placeholder.'
    : 'Remove school names, exact addresses, specific neighborhoods/estates, and other narrow location detail. A broad place name on its own (a city, county, or region) is not identifying by itself and does not need to be removed.';

  return `You rewrite messages from a student to remove personal information before the message reaches an AI model. You will receive a JSON array of strings — each one a message from the student (some personal info may already be replaced with [placeholders]; leave those as-is). Return a JSON array of the same length, in the same order, with each string rewritten so that:

- Any last name / family name is removed. ${nameRule}
- ${otherPeopleRule}
- ${locationRule}
- Exact birthdates and ages given as personal identifying detail are removed.
- Everything else — meaning, tone, the rest of the content — stays exactly as written.

Replace anything removed with a short neutral placeholder like [name removed], [school removed], [location removed] — keep each message readable. Reply with ONLY the JSON array of rewritten strings, nothing else — no markdown fences, no explanation.`;
}

// Chunk boundary for the batched rewrite call — bounds both the request
// size and, more importantly, the output size the model has to produce in
// one response. A single unbounded batch over a long conversation is
// exactly how this pass silently degrades: max_tokens gets hit, the
// response truncates mid-JSON-array, JSON.parse throws, and the catch
// quietly falls back to regex-only with nothing logged. Chunking keeps
// each call's expected output well under any reasonable cap regardless of
// how long the conversation has grown, and chunks run in parallel so this
// doesn't add latency proportional to chunk count.
const MAX_CHUNK_CHARS    = 2000;
const MAX_CHUNK_MESSAGES = 6;

function chunkTexts(texts) {
  const chunks = [];
  let current = [];
  let currentChars = 0;
  for (const t of texts) {
    const len = (t || '').length;
    if (current.length && (current.length >= MAX_CHUNK_MESSAGES || currentChars + len > MAX_CHUNK_CHARS)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(t);
    currentChars += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// Token budget for a chunk: JSON-stringifying the output re-adds quote and
// escape characters the input's raw length doesn't account for, and
// placeholder substitutions ([name removed], etc.) can make the output
// longer than the input in short messages — so this is deliberately
// generous (divide by 2.5, not the "2 chars per token" that was optimistic
// even before JSON escaping) with a fixed floor, rather than tightly
// estimated. A too-tight cap is exactly the failure mode being fixed here.
function estimateMaxTokens(texts) {
  const totalChars = texts.reduce((sum, t) => sum + (t || '').length, 0);
  return Math.min(4000, Math.max(500, Math.ceil((totalChars * 1.6) / 2.5) + 200));
}

async function rewriteChunk(texts, firstName, tier, logEvent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || texts.every(t => !t || !t.trim())) return texts;
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: estimateMaxTokens(texts),
        temperature: 0,
        system: buildRewriteSystemPrompt(firstName, tier),
        messages: [{ role: 'user', content: JSON.stringify(texts.map(t => (t || '').slice(0, 4000))) }],
      }),
    });
    if (!upstream.ok) {
      logEvent?.({ event_type: 'pii_scrub_upstream_error', severity: 'warning', payload: { status: upstream.status } });
      return texts;
    }
    const data = await upstream.json();
    const stopReason = data?.stop_reason;
    const raw = (data?.content || []).find(b => b?.type === 'text')?.text ?? '';
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      logEvent?.({
        event_type: 'pii_scrub_parse_failed',
        severity:   'warning',
        payload:    { stop_reason: stopReason, response_length: raw.length, error: String(parseErr) },
      });
      return texts; // fall back to the regex-scrubbed texts already applied by the caller
    }
    if (!Array.isArray(parsed) || parsed.length !== texts.length) {
      logEvent?.({
        event_type: 'pii_scrub_shape_mismatch',
        severity:   'warning',
        payload:    { stop_reason: stopReason, expected: texts.length, got: Array.isArray(parsed) ? parsed.length : typeof parsed },
      });
      return texts;
    }
    return parsed.map((s, i) => (typeof s === 'string' && s.trim()) ? s : texts[i]);
  } catch (err) {
    logEvent?.({ event_type: 'pii_scrub_exception', severity: 'warning', payload: { error: String(err) } });
    return texts; // never fall back further than the regex pass — not to the original raw text
  }
}

async function rewriteBatch(texts, firstName, tier, logEvent) {
  const chunks = chunkTexts(texts);
  const results = await Promise.all(chunks.map(chunk => rewriteChunk(chunk, firstName, tier, logEvent)));
  return results.flat();
}

// Look up the learner's first name — the one piece of personal info allowed
// through by default. Best-effort: a failed or empty lookup just means no
// name is preserved (the rewrite pass then strips first names too, playing
// it safe).
export async function fetchFirstName(userId, supabaseUrl, supabaseKey) {
  if (!userId || !supabaseUrl || !supabaseKey) return null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=name`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const rows = await res.json();
    const name = Array.isArray(rows) ? rows[0]?.name : null;
    if (!name) return null;
    return String(name).trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

// Scrubs every user-role message in `messages` and returns a new array —
// does not mutate the input. Non-user messages (assistant turns) pass
// through unchanged. Must be awaited before the scrubbed messages are sent
// to any model — this is a blocking privacy gate, not a fire-and-forget
// side check like the safety-flag moderation.
//
// `tier`: 'strict' (default) or 'community_helper' — see the module doc
// comment above. `logEvent`: optional callback (same shape as the host
// file's own triage logger) called when the LLM rewrite pass fails or
// degrades, so that's visible rather than silent.
export async function scrubMessagesPII(messages, firstName, tier = 'strict', logEvent = null) {
  const userIdxs = [];
  const regexScrubbed = messages.map((m, i) => {
    if (m.role !== 'user') return m;
    userIdxs.push(i);
    if (typeof m.content === 'string') return { ...m, content: regexScrub(m.content) };
    if (Array.isArray(m.content)) {
      return { ...m, content: m.content.map(b => (b && typeof b.text === 'string') ? { ...b, text: regexScrub(b.text) } : b) };
    }
    return m;
  });

  if (!userIdxs.length) return regexScrubbed;

  const texts = userIdxs.map(i => extractMessageText(regexScrubbed[i].content));
  const rewritten = await rewriteBatch(texts, firstName, tier, logEvent);

  const result = [...regexScrubbed];
  userIdxs.forEach((msgIdx, k) => {
    const original = regexScrubbed[msgIdx];
    if (typeof original.content === 'string') {
      result[msgIdx] = { ...original, content: rewritten[k] };
      return;
    }
    if (Array.isArray(original.content)) {
      // Multi-block content (e.g. text + an image attachment) — replace only
      // the first text block with the full rewritten text and leave other
      // blocks (attachments) untouched; these pages mostly send a single
      // text block per user turn, so this covers the common case.
      let replaced = false;
      result[msgIdx] = {
        ...original,
        content: original.content.map(b => {
          if (!replaced && b && typeof b.text === 'string') { replaced = true; return { ...b, text: rewritten[k] }; }
          return b;
        }),
      };
    }
  });
  return result;
}
