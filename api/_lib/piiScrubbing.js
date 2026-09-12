// api/_lib/piiScrubbing.js
//
// Removes personal information from student messages before they reach any
// AI model. The learner's own first name is the only personal detail
// allowed through — everything else (last names, other people's names,
// addresses, phone numbers, emails, school names, specific locations,
// exact ages/birthdates, social handles) gets replaced with a neutral
// placeholder before the message is ever sent upstream.
//
// Two layers, same philosophy as safetyGuardrails.js — a prompt-only
// approach is a soft constraint, so there's a deterministic layer under it:
//   1. A regex pass — catches emails, phone numbers, @handles, and
//      street-address-shaped text. Zero cost, always runs, can't fail.
//   2. An LLM rewrite pass (Haiku, one batched call for the whole request)
//      — catches what regex can't: full names (keeping the learner's own
//      first name if known), school names, neighborhoods/towns, family
//      members' names, and other free-form identifying detail. If this
//      pass fails or returns something malformed, the regex-scrubbed text
//      is used as-is — never fall back to the original raw text.
//
// IMPORTANT — every user-role message in the conversation is re-scrubbed on
// every request, not just the newest one. The frontend is stateless here:
// it resends its own stored copy of the *original* text for every earlier
// turn on every subsequent request (it never learns the server rewrote
// anything), so scrubbing only the latest message would still send earlier
// turns' raw PII upstream on the next turn. Re-scrubbing already-scrubbed
// text is a no-op (nothing left to remove), so this is safe — the cost is
// that the batched rewrite call's input grows with conversation length,
// not that anything leaks. A cheaper future version would have the server
// hand the scrubbed text back to the frontend to store in place of the
// original, so only genuinely new messages ever need the LLM pass again.

import { extractMessageText } from './safetyGuardrails.js';

const EMAIL_RE  = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE  = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const HANDLE_RE = /(?<![\w@])@[A-Za-z0-9_]{2,}/g;
const STREET_RE = /\b\d{1,6}\s+([A-Z][a-z]+\s){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\.?\b/g;

export function regexScrub(text) {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, '[email removed]')
    .replace(PHONE_RE, '[phone number removed]')
    .replace(HANDLE_RE, '[handle removed]')
    .replace(STREET_RE, '[address removed]');
}

function buildRewriteSystemPrompt(firstName) {
  return `You rewrite messages from a student to remove personal information before the message reaches an AI model. You will receive a JSON array of strings — each one a message from the student (some pieces of personal info may already be replaced with [placeholders]; leave those as-is). Return a JSON array of the same length, in the same order, with each string rewritten so that:

- Any last name / family name is removed.
${firstName ? `- The student's own first name is "${firstName}" — you may keep that one word if it appears.` : '- Any first name is also removed, since none is confirmed for this student.'}
- Any other person's name (friends, family members, teachers, anyone else) is removed.
- School names, exact addresses, towns/neighborhoods, and other specific location details are removed.
- Exact birthdates and ages given as personal identifying detail are removed.
- Everything else — meaning, tone, the rest of the content — stays exactly as written.

Replace anything removed with a short neutral placeholder like [name removed], [school removed], [location removed] — keep each message readable. Reply with ONLY the JSON array of rewritten strings, nothing else — no markdown fences, no explanation.`;
}

async function rewriteBatch(texts, firstName) {
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
        max_tokens: Math.min(4000, Math.ceil(texts.reduce((sum, t) => sum + (t?.length ?? 0), 0) / 2) + 200),
        temperature: 0,
        system: buildRewriteSystemPrompt(firstName),
        messages: [{ role: 'user', content: JSON.stringify(texts.map(t => (t || '').slice(0, 4000))) }],
      }),
    });
    if (!upstream.ok) return texts; // fall back to the regex-scrubbed texts already applied by the caller
    const data = await upstream.json();
    const raw = (data?.content || []).find(b => b?.type === 'text')?.text ?? '';
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length !== texts.length) return texts;
    return parsed.map((s, i) => (typeof s === 'string' && s.trim()) ? s : texts[i]);
  } catch {
    return texts; // never fall back further than the regex pass — not to the original raw text
  }
}

// Look up the learner's first name — the one piece of personal info allowed
// through. Best-effort: a failed or empty lookup just means no name is
// preserved (the rewrite pass then strips first names too, playing it safe).
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
export async function scrubMessagesPII(messages, firstName) {
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
  const rewritten = await rewriteBatch(texts, firstName);

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
