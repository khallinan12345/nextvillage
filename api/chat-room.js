// api/chat-room.js
//
// Generates Claude's reply for a "Use Claude Together" room, after the
// triggering user message has already been inserted by the client (via the
// normal Supabase client, RLS-enforced). This endpoint's only job is to
// build context from the room's history, call Anthropic, and insert the
// assistant's reply — using the service-role key, since there's no
// authenticated principal for Claude to write as.
//
// Available to every organization, each scoped to its own rooms. Because
// this endpoint uses the service-role key (bypassing RLS) to read/write, it
// re-derives authorization itself on every call rather than trusting the
// caller — it resolves the calling user's effective organization (mirroring
// get_my_effective_profile() in the DB) and checks it matches the room's
// organization_id.

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// Back to Basics Youth Education stays exempt from the token quota below —
// keep in sync with src/lib/backToBasicsScope.ts.
const BACK_TO_BASICS_ORG_ID = 'bf573bfa-c57a-4476-be26-508991bb4d76';

const QUOTA_TOKENS    = 25000;
const QUOTA_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Claude Sonnet 5 (and the Opus 4.7+/Fable 5 family) reject a non-default
// `temperature` with a 400 — keep this in sync with the identical check in
// api/chat-stream.js.
function modelAllowsCustomTemperature(model) {
  return !/^claude-(sonnet-5|opus-4-[7-9]|fable-5|mythos)/.test(model);
}

// ─── Cost logging (fire-and-forget) ───────────────────────────────────────
const PRICES = {
  'claude-sonnet-5':            { input: 2.0, output: 10.0 }, // intro pricing through 2026-08-31
  'claude-sonnet-4-6':          { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001':  { input: 1.0, output:  5.0 },
  default:                      { input: 3.0, output: 15.0 },
};

function estimateCost(model, inputTokens, outputTokens) {
  const p = PRICES[model] ?? PRICES.default;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

async function logCost({ model, inputTokens, outputTokens, userId }) {
  if (!inputTokens && !outputTokens) return;
  try {
    await supabase.from('api_cost_log').insert({
      page:               'PlaygroundTogetherPage',
      provider:           'anthropic',
      model,
      action:             'generate',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_hit_tokens:   0,
      cache_write_tokens: 0,
      estimated_cost_usd: estimateCost(model, inputTokens, outputTokens),
      user_id:            userId ?? null,
      logged_at:          new Date().toISOString(),
    });
  } catch { /* logging must never fail the request */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'method_not_allowed' });
  }

  const { room_id, user_id } = req.body || {};
  if (!room_id || !user_id) {
    return res.status(400).json({ success: false, error: 'room_id and user_id are required' });
  }

  try {
    // ── Room must exist and be active ──────────────────────────────────────
    const { data: room, error: roomErr } = await supabase
      .from('together_rooms')
      .select('id, name, status, model, organization_id, book_content, organizations(name)')
      .eq('id', room_id)
      .single();

    if (roomErr || !room || room.status !== 'active') {
      return res.status(403).json({ success: false, error: 'room_not_available' });
    }

    // ── Re-derive authorization — never trust the caller, since this
    // endpoint bypasses RLS via the service-role key. Resolve the caller's
    // effective organization (organization_id, falling back to a
    // join_code/join_codes lookup) and require it match the room's org —
    // mirrors get_my_effective_profile() in the DB. ─────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('organization_id, join_code_used')
      .eq('id', user_id)
      .single();

    if (profileErr || !profile) {
      return res.status(403).json({ success: false, error: 'not_authorized' });
    }

    let effectiveOrgId = profile.organization_id;
    if (!effectiveOrgId && profile.join_code_used?.trim()) {
      const joinCode = profile.join_code_used.trim();
      const { data: byCode } = await supabase
        .from('organizations')
        .select('id')
        .eq('join_code', joinCode)
        .maybeSingle();
      let org = byCode;
      if (!org) {
        const { data: byCodes } = await supabase
          .from('organizations')
          .select('id')
          .contains('join_codes', [joinCode])
          .maybeSingle();
        org = byCodes;
      }
      effectiveOrgId = org?.id ?? null;
    }

    if (!effectiveOrgId || effectiveOrgId !== room.organization_id) {
      return res.status(403).json({ success: false, error: 'not_authorized' });
    }

    const isBackToBasics = effectiveOrgId === BACK_TO_BASICS_ORG_ID;

    // ── Quota: 25k tokens / 3h, everyone except Back to Basics ──────────────
    if (!isBackToBasics) {
      const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();
      const { data: usage, error: usageErr } = await supabase
        .from('api_cost_log')
        .select('input_tokens, output_tokens')
        .eq('user_id', user_id)
        .eq('page', 'PlaygroundTogetherPage')
        .gte('logged_at', windowStart);

      if (!usageErr) {
        const totalTokens = (usage || []).reduce(
          (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0
        );
        if (totalTokens >= QUOTA_TOKENS) {
          return res.status(429).json({ success: false, error: 'quota_exceeded' });
        }
      }
    }

    // ── Build context from recent non-deleted messages ─────────────────────
    // Fetch newest-first so `.limit()` keeps the most recent messages (not
    // the oldest), then reverse back to chronological order for Anthropic.
    const { data: recentHistory, error: historyErr } = await supabase
      .from('together_messages')
      .select('sender_name, role, content, image_url')
      .eq('room_id', room_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(40);

    if (historyErr) throw historyErr;
    const history = (recentHistory || []).reverse();

    const anthropicMessages = (history || []).map(m => {
      // Images are visual-only for now — Claude never sees the picture
      // itself, only that one was shared (and any caption), so it stays
      // aware of the moment without receiving image content.
      const body = m.image_url
        ? (m.content?.trim() ? `${m.content} (shared an image)` : '(shared an image)')
        : m.content;
      return {
        role: m.role,
        // Anthropic has no concept of "which of several humans is speaking" —
        // prefix each user turn with the sender's name at request-build time
        // only (never stored this way in the DB) so Claude can track speakers.
        content: m.role === 'user' ? `[${m.sender_name}]: ${body}` : body,
      };
    });

    if (!anthropicMessages.length || anthropicMessages[anthropicMessages.length - 1].role !== 'user') {
      // Nothing new to respond to (e.g. the triggering message was itself
      // deleted between insert and this call) — no-op, not an error.
      return res.status(200).json({ success: true, message: null });
    }

    const model = room.model || 'claude-sonnet-5';
    const orgName = room.organizations?.name || 'this organization';
    const currentBook = (room.book_content || '').trim();
    const systemPrompt = `You are Claude, participating as a collaborative co-writer in a shared group chat room called "${room.name}" for students and leaders at ${orgName}. Multiple people speak in this room — each message is prefixed with the sender's name in brackets so you can track who said what, but never use that bracket format in your own replies. Contribute naturally to whatever the group is building (for example, a community story) — build on what's already been said, don't repeat yourself, and prioritize direction from a leader. Keep replies focused and not overly long — this is a live group conversation, not a report.

Respond to whoever sent the most recent message — don't address, praise, or ask a follow-up question of some other named participant instead (e.g. the person who started the room) just because they spoke earlier or more often. If you want the group's input, ask an open question to everyone rather than singling out one person by name.

This room also maintains ONE canonical "book" document, shown to the group separately from this chat, as a clean document with no chat commentary in it — just the story/document text itself.

CURRENT BOOK CONTENT:
"""
${currentBook || '(empty — nothing written yet)'}
"""

When your reply adds new text to, edits, expands, lengthens, or continues the book/story, call the update_book tool with the FULL updated book text — never a diff, snippet, or just the new part; include everything previously written plus this change. Never call it for a purely conversational reply that doesn't change the book (answering a question about direction, asking the group something, discussing logistics). Your normal text reply should stay conversational and short — don't paste the book content into it too, since it already lives in the book document; a brief acknowledgement is enough (e.g. "Here's the expanded chapter!").`;

    const UPDATE_BOOK_TOOL = {
      name: 'update_book',
      description: 'Call this when your reply adds new text to, or edits, the shared book/story document. Do NOT call this for purely conversational replies (questions, feedback, logistics) that don\'t change the book.',
      input_schema: {
        type: 'object',
        properties: {
          bookContent: {
            type: 'string',
            description: 'The FULL, complete, updated text of the book after this turn — never a diff or just the new part. Include everything previously written plus whatever is being added, edited, or expanded now. Contains ONLY the actual story/document text — no questions, no meta-commentary, no chat framing.',
          },
        },
        required: ['bookContent'],
      },
    };

    const createParams = {
      model,
      max_tokens: 8000,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: [UPDATE_BOOK_TOOL],
    };
    if (modelAllowsCustomTemperature(model)) {
      createParams.temperature = 0.7;
    }

    const msg = await anthropic.messages.create(createParams);
    // Structured via a real tool call (not free-text JSON) — the API itself
    // guarantees a well-formed object when the model invokes it, unlike
    // asking the model to emit raw JSON in its text response, which proved
    // unreliable across long, iterative editing sessions (the model would
    // sometimes preface the JSON with prose, or drift into plain text
    // entirely after many turns).
    const replyText = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const toolUse = msg.content.find(b => b.type === 'tool_use' && b.name === 'update_book');
    const bookContent = toolUse?.input?.bookContent && typeof toolUse.input.bookContent === 'string' && toolUse.input.bookContent.trim()
      ? toolUse.input.bookContent.trim()
      : null;

    if (!replyText && !bookContent) {
      return res.status(200).json({ success: true, message: null });
    }

    let inserted = null;
    if (replyText) {
      const { data, error: insertErr } = await supabase
        .from('together_messages')
        .insert({
          room_id,
          sender_id:   null,
          sender_name: 'Claude',
          role:        'assistant',
          content:     replyText,
        })
        .select('id, content, created_at')
        .single();
      if (insertErr) throw insertErr;
      inserted = data;
    }

    if (bookContent && bookContent !== currentBook) {
      const { error: bookErr } = await supabase
        .from('together_rooms')
        .update({ book_content: bookContent, book_updated_at: new Date().toISOString() })
        .eq('id', room_id);
      if (bookErr) console.error('[chat-room] Failed to update book_content:', bookErr);
    }

    logCost({
      model,
      inputTokens:  msg.usage?.input_tokens,
      outputTokens: msg.usage?.output_tokens,
      userId:       user_id,
    });

    return res.status(200).json({ success: true, message: inserted });
  } catch (err) {
    console.error('[chat-room] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'internal_error' });
  }
}
