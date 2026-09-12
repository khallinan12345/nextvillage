// api/_lib/piiScrubbing.js
//
// Removes personal information from a conversation before it reaches any AI
// model. The learner's own first name is the only personal detail allowed
// through unchanged — everything else is either stripped (phone numbers,
// emails, handles, exact addresses, school names, exact ages/birthdates) or
// replaced with a relationship term (other people's names — "my brother",
// "my neighbour" — never removed to a blank, since the relationship is
// exactly the context a consultant page needs and a name never was).
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
// The extraction pass below sends the (regex-scrubbed) text to Anthropic to
// find what needs removing — that's unavoidable, since recognizing a name
// or inferring "my brother" from context is itself a language task. So the
// real guarantee is "everyone except Anthropic sees only scrubbed text" —
// not "personal information never leaves the platform." Anthropic's API
// terms govern that hop; this module's job is everyone downstream of it
// (the completion model whose reply might get logged or shown to someone
// else, other students in a shared session, etc.).
//
// ── Design: extract spans, don't rewrite text ──────────────────────────────
// An earlier version of this module asked the model to rewrite each message
// in full. That had four compounding problems: output scaled with
// conversation length and could get truncated mid-JSON; long conversations
// had to be chunked into parallel calls, and two chunks could disagree on
// how to label the same recurring person (turn 9 reading differently than
// turn 3); nothing distinguished two different people who'd get the same
// generic replacement; and scrubbing the model's own prior replies (which
// get resent upstream every turn same as the student's own messages) wasn't
// worth the extra rewrite cost, so old assistant turns kept carrying
// whatever raw names they'd already produced.
//
// Extracting a list of {message, span, replacement} entries instead of
// rewriting retires all four at once: output is a handful of short strings
// regardless of how long the conversation has gotten, so it doesn't
// truncate; substitution happens in this file, deterministically, not by
// the model regenerating prose it could phrase two different ways in two
// different calls; a single call sees the whole conversation at once, so
// the same real person gets the same replacement everywhere and two
// different people who'd share a label get disambiguated ("my brother",
// "my brother 2"); and scrubbing assistant turns costs nothing extra, since
// they're just more entries in the same one call's input.
//
// ── Tiers — location only, not names ────────────────────────────────────────
// Other people's names are converted to a relationship term in every tier,
// always — a name never added anything a relationship term doesn't already
// give the model, so there was never a real tradeoff there. Location
// granularity is the only thing that varies:
//   - 'strict' (default — Use Claude, Create Game, AI Image Creation, and
//     anywhere else): narrows locations down to nothing more specific than
//     a broad place name (a city, county, or region is left alone; a school
//     or exact address is not).
//   - 'community_helper' (the consultant/navigator pages, where the
//     conversation is fundamentally about a real community member's
//     situation): additionally keeps neighborhood/estate-level detail — a
//     Healthcare Navigator that can't know the learner is in Mathare can't
//     point at a clinic in Mathare. Still removes a full street address, a
//     school name, or a P.O. Box.
// The caller passes the tier in (see COMMUNITY_HELPER_PAGES in api/chat.js)
// — this module has no idea what page a request came from.
//
// IMPORTANT — every message in the conversation (user AND assistant) is
// re-scrubbed on every request, not just the newest one. The frontend is
// stateless here: it resends its own stored copy of the *original* text for
// every earlier turn on every subsequent request (it never learns the
// server rewrote anything), so scrubbing only the latest message would
// still send earlier turns' raw PII upstream on the next turn — and any
// conversation older than this module still carries raw names in its
// stored assistant replies. Re-scrubbing already-scrubbed text is a no-op
// (nothing left to find), so this is safe. A cross-request cache keyed by a
// stable conversation id — so only genuinely new messages need the
// extraction call at all — would cut the remaining cost further; it isn't
// implemented here, since it needs a persistent store and a stable
// conversation id threaded from the frontend, neither of which exist yet.

import { extractMessageText } from './safetyGuardrails.js';

const EMAIL_RE  = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HANDLE_RE = /(?<![\w@])@[A-Za-z0-9_]{2,}/g;

// Phone numbers, in any common grouping — this needs to distinguish a real
// phone number from a bare multi-digit number in a math or science
// question, which the first version of this regex didn't: it flagged any
// 7-15 digit run regardless of context, which meant a homework question
// like "what is 1234567 divided by 7" got its operand redacted.
//
// Two candidate shapes, both digit-count-bounded (7-15 digits) as a final
// sanity check:
//   - FORMATTED: at least two separators (space/dot/dash/parens) among the
//     digits — genuinely phone-shaped (0712 345 678, 555-123-4567,
//     (555) 123-4567). Requiring *two* separators (not one) is what keeps
//     a plain decimal like "3.14159265" out of this net — a decimal has
//     exactly one separator, a formatted phone number has at least two
//     grouped segments.
//   - BARE: no separators at all, but starts with "+" (international) or a
//     single leading "0" (the trunk-prefix convention actual local phone
//     numbers use across Kenya, Nigeria, and elsewhere) — 0712345678,
//     +254712345678, 08031234567. A bare number that *doesn't* start with
//     0 or + (a population figure, an ID, a big arithmetic answer) is left
//     alone specifically so this doesn't eat non-phone numbers out of
//     math/science content.
const FORMATTED_PHONE_RE = /\+?\(?\d{1,4}\)?(?:[\s.-]\(?\d{1,4}\)?){2,}/g;
const BARE_PHONE_RE      = /(?:\+\d{9,14}|0\d{8,12})\b/g;

function scrubPhoneCandidates(text, re) {
  return text.replace(re, (match) => {
    const digits = match.replace(/\D/g, '');
    return (digits.length >= 7 && digits.length <= 15) ? '[number removed]' : match;
  });
}

// Structured local address patterns regex can reliably catch. This does
// NOT attempt to recognize arbitrary global address formats — an address
// like "24 Kileleshwa Close" with no P.O./Plot/House-No/suffix keyword
// will slip past regex and depends on the extraction pass below. Regex is
// a floor, not the address solution.
const US_STREET_RE  = /\b\d{1,6}\s+([A-Z][a-z]+\s){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Estate)\.?\b/g;
const LOCAL_ADDR_RE = /\b(?:P\.?O\.?\s*Box\s*\d+|Plot\s+\d+[A-Za-z]?|House\s+(?:No\.?|Number)\s*\d+)\b/gi;

export function regexScrub(text) {
  if (!text) return text;
  let out = text
    .replace(EMAIL_RE, '[email removed]')
    .replace(HANDLE_RE, '[handle removed]')
    .replace(US_STREET_RE, '[address removed]')
    .replace(LOCAL_ADDR_RE, '[address removed]');
  out = scrubPhoneCandidates(out, FORMATTED_PHONE_RE);
  out = scrubPhoneCandidates(out, BARE_PHONE_RE);
  return out;
}

function buildExtractionSystemPrompt(firstName, tier) {
  const ownNameRule = firstName
    ? `other than the student's own first name ("${firstName}")`
    : 'including a first name, since none is confirmed for this student';

  const locationRule = tier === 'community_helper'
    ? 'Only extract a full street address (house/plot number plus street), a school name, or a P.O. Box — neighborhood, estate, town, county, and region names are fine to leave alone, since local specificity is the point of this conversation.'
    : 'Extract school names, exact addresses, specific neighborhoods/estates, and other narrow location detail. A broad place name alone (a city, county, or region) is not identifying by itself — leave those alone.';

  return `You read a conversation between a student and an AI assistant and list every piece of personal information that should be removed before the conversation reaches an AI model. You do not rewrite anything — you only list what to find and what to replace it with; the substitution happens elsewhere.

You will receive a JSON array of messages: [{"index": number, "role": "user"|"assistant", "text": string}]. Some personal info may already be replaced with [placeholder] text in these — skip those, they're already handled. Find every remaining occurrence of:

- A person's name, ${ownNameRule}. Replace it with the relationship if the text states or implies one ("my brother", "my neighbour", "my teacher", "my patient", "my customer") — never leave a real name in the replacement, and never invent a relationship the text doesn't support (use "someone I know" if none is given). If the relationship is already stated right next to the name (e.g. "my brother Emeka"), make the span just the name itself with an empty-string replacement, so you don't produce "my brother my brother" — only add the relationship word when the name appears without one nearby. If the same real person is named more than once anywhere in the conversation, always use the identical replacement text for them. If two different people would otherwise get the same replacement (two brothers, two neighbours), number the second one onward: "my brother", "my brother 2".
- ${locationRule}
- Exact birthdates and ages given as personal identifying detail.

Reply with ONLY a JSON array, nothing else — no markdown fences, no explanation. Each entry: {"index": <message index from the input>, "span": "<the exact substring to replace, copied character-for-character from that message's text>", "replacement": "<what to replace it with>"}. "span" must be an exact substring — do not paraphrase or alter it, or the substitution will fail to find it. Return an empty array [] if nothing needs removing.`;
}

// Output here is a short list of {index, span, replacement} triples, not
// rewritten prose — small and bounded regardless of conversation length,
// so 2000 tokens is generous rather than tight the way the old rewrite
// pass's budget had to scale with input size.
const EXTRACTION_MAX_TOKENS = 2000;

async function extractSpans(indexedTexts, firstName, tier, logEvent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !indexedTexts.length) return [];
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
        max_tokens: EXTRACTION_MAX_TOKENS,
        temperature: 0,
        system: buildExtractionSystemPrompt(firstName, tier),
        messages: [{
          role: 'user',
          content: JSON.stringify(indexedTexts.map(t => ({ index: t.index, role: t.role, text: t.text.slice(0, 4000) }))),
        }],
      }),
    });
    if (!upstream.ok) {
      logEvent?.({ event_type: 'pii_scrub_upstream_error', severity: 'warning', payload: { status: upstream.status } });
      return [];
    }
    const data = await upstream.json();
    const raw = (data?.content || []).find(b => b?.type === 'text')?.text ?? '';
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      logEvent?.({ event_type: 'pii_scrub_parse_failed', severity: 'warning', payload: { stop_reason: data?.stop_reason ?? null, response_length: raw.length, error: String(parseErr) } });
      return [];
    }
    if (!Array.isArray(parsed)) {
      logEvent?.({ event_type: 'pii_scrub_shape_mismatch', severity: 'warning', payload: { got: typeof parsed } });
      return [];
    }
    return parsed.filter(e => e && typeof e.index === 'number' && typeof e.span === 'string' && e.span && typeof e.replacement === 'string');
  } catch (err) {
    logEvent?.({ event_type: 'pii_scrub_exception', severity: 'warning', payload: { error: String(err) } });
    return [];
  }
}

// Applies extracted spans deterministically — literal substring replacement
// per message, longest span first (so a span that contains a shorter one,
// e.g. "Mrs Achieng next door" containing "Achieng", is applied before the
// shorter one could partially clobber it). A span the model hallucinated
// (not actually present in that message's text) is silently skipped rather
// than corrupting the text.
function applySpans(textByIndex, spans) {
  const byIndex = new Map();
  for (const s of spans) {
    if (!byIndex.has(s.index)) byIndex.set(s.index, []);
    byIndex.get(s.index).push(s);
  }
  const out = new Map(textByIndex);
  for (const [idx, entries] of byIndex) {
    let text = out.get(idx);
    if (text == null) continue;
    entries.sort((a, b) => b.span.length - a.span.length);
    for (const e of entries) {
      if (text.includes(e.span)) text = text.split(e.span).join(e.replacement);
    }
    // An empty-string replacement (name removed, relationship already
    // stated elsewhere in the sentence) can leave a doubled space or a
    // stray space before punctuation — cosmetic only, cheap to clean up.
    text = text.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?;:])/g, '$1').trim();
    out.set(idx, text);
  }
  return out;
}

// Look up the learner's first name — the one piece of personal info allowed
// through unchanged. Best-effort: a failed or empty lookup just means no
// name is preserved (the extraction pass then strips first names too,
// playing it safe).
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

// Scrubs every message in `messages` (user AND assistant) and returns a new
// array — does not mutate the input. Must be awaited before the scrubbed
// messages are sent to any model — this is a blocking privacy gate, not a
// fire-and-forget side check like the safety-flag moderation.
//
// `tier`: 'strict' (default) or 'community_helper' — governs location
// granularity only; see the module doc comment above. `logEvent`: optional
// callback (same shape as the host file's own triage logger) called when
// the extraction pass fails or degrades, so that's visible rather than
// silent.
export async function scrubMessagesPII(messages, firstName, tier = 'strict', logEvent = null) {
  const regexScrubbed = messages.map(m => {
    if (typeof m.content === 'string') return { ...m, content: regexScrub(m.content) };
    if (Array.isArray(m.content)) {
      return { ...m, content: m.content.map(b => (b && typeof b.text === 'string') ? { ...b, text: regexScrub(b.text) } : b) };
    }
    return m;
  });

  const indexed = regexScrubbed
    .map((m, i) => ({ index: i, role: m.role, text: extractMessageText(m.content) }))
    .filter(e => e.text && e.text.trim());
  if (!indexed.length) return regexScrubbed;

  const spans = await extractSpans(indexed, firstName, tier, logEvent);
  if (!spans.length) return regexScrubbed;

  const textByIndex = new Map(indexed.map(e => [e.index, e.text]));
  const rewritten = applySpans(textByIndex, spans);

  const result = [...regexScrubbed];
  for (const [idx, newText] of rewritten) {
    const original = result[idx];
    if (typeof original.content === 'string') {
      result[idx] = { ...original, content: newText };
    } else if (Array.isArray(original.content)) {
      // Multi-block content (e.g. text + an image attachment) — replace only
      // the first text block; other blocks (attachments) are untouched.
      let replaced = false;
      result[idx] = {
        ...original,
        content: original.content.map(b => {
          if (!replaced && b && typeof b.text === 'string') { replaced = true; return { ...b, text: newText }; }
          return b;
        }),
      };
    }
  }
  return result;
}
