// api/udolli.js
//
// Backend for the UD-OLLI guardrail lab (src/pages/UDolli/UDolliPage.tsx).
//
//   GET  ?action=souls                         → the two instruction files
//   POST { action: 'run', ... }                → send one message to Anchor
//                                                and/or Driftwood
//   POST { action: 'compare', session_id }     → the comparison agent
//
// One file on purpose (fewer deployed functions). Every action requires a
// signed-in UD-OLLI member (or that org's leader / a platform administrator).
// All database writes happen here with the service role; students can only
// read their own rows (see the migration), so analyses can't be forged.
//
// Email is SIMULATED. The agents write a [SENDMAIL] block, which is parsed
// into an outbox record. Nothing is ever delivered and nothing is fetched
// from the web — pages are supplied by the student as text.

import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from './_lib/requireUser.js';
import { ANCHOR_SOUL, DRIFTWOOD_SOUL } from './_lib/udolliSouls.js';
import {
  MODEL, MAX_MESSAGE_CHARS, MAX_SOURCE_CHARS,
  hasUdolliAccess, buildSystem, buildUserContent, buildHistory,
  parseOutbox, computeSignals, COMPARE_SYSTEM, buildCompareInput,
  groupRounds, parseJsonLoose,
} from './_lib/udolli.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SOULS = { anchor: ANCHOR_SOUL, driftwood: DRIFTWOOD_SOUL };
const AGENT_NAMES = ['anchor', 'driftwood'];

const RUN_LIMIT = 24;      // agent answers per user per 10 minutes (12 rounds with both agents)
const COMPARE_LIMIT = 6;   // comparisons per user per 10 minutes
const WINDOW_MS = 10 * 60 * 1000;

// Estimate only, per million tokens (same rates api/systems-think.js uses for Sonnet 5; update if Sonnet 5.5 is priced differently).
const PRICES = { input: 2.0, output: 10.0 };

async function logCost(usage, userId, action) {
  try {
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    if (!inputTokens && !outputTokens) return;
    await supabase.from('api_cost_log').insert({
      page: 'UDolliPage',
      provider: 'anthropic',
      model: MODEL,
      action,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_hit_tokens: 0,
      cache_write_tokens: 0,
      estimated_cost_usd: (inputTokens / 1_000_000) * PRICES.input + (outputTokens / 1_000_000) * PRICES.output,
      user_id: userId ?? null,
      logged_at: new Date().toISOString(),
    });
  } catch { /* logging must never fail the request */ }
}

const textOf = (response) =>
  (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

async function recentCount(table, userId) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  return count ?? 0;
}

// ─── run ────────────────────────────────────────────────────────────────────
async function runAgents(req, res, user) {
  const body = req.body || {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const sourceText = typeof body.source_text === 'string' ? body.source_text : '';
  const sourceTitle = typeof body.source_title === 'string' ? body.source_title.slice(0, 200) : '';
  const agents = Array.isArray(body.agents) ? [...new Set(body.agents.filter((a) => AGENT_NAMES.includes(a)))] : [];

  if (!message) return res.status(400).json({ error: 'Type a message first.' });
  if (message.length > MAX_MESSAGE_CHARS) return res.status(400).json({ error: `Messages can be up to ${MAX_MESSAGE_CHARS} characters.` });
  if (sourceText.length > MAX_SOURCE_CHARS) return res.status(400).json({ error: `Pasted pages can be up to ${MAX_SOURCE_CHARS} characters.` });
  if (agents.length === 0) return res.status(400).json({ error: 'Choose at least one agent.' });

  if ((await recentCount('udolli_analyses', user.id)) + agents.length > RUN_LIMIT) {
    return res.status(429).json({ error: 'That is a lot of questions in a short time. Please wait a few minutes and try again.' });
  }

  // Session: continue one the caller owns, or start a new one.
  let sessionId = typeof body.session_id === 'string' ? body.session_id : null;
  if (sessionId) {
    const { data: s } = await supabase.from('udolli_sessions').select('id').eq('id', sessionId).eq('user_id', user.id).single();
    if (!s) return res.status(404).json({ error: 'Session not found.' });
  } else {
    const title = message.length > 60 ? `${message.slice(0, 57)}...` : message;
    const { data: s, error } = await supabase.from('udolli_sessions').insert({ user_id: user.id, title }).select('id').single();
    if (error) return res.status(500).json({ error: 'Could not start a session.' });
    sessionId = s.id;
  }

  const { data: prior } = await supabase
    .from('udolli_analyses')
    .select('agent, prompt, source_title, source_text, result, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const roundId = randomUUID();

  const settled = await Promise.allSettled(agents.map(async (agent) => {
    const history = buildHistory((prior || []).filter((r) => r.agent === agent));
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: buildSystem(SOULS[agent]),
      messages: [...history, { role: 'user', content: buildUserContent({ prompt: message, sourceTitle, sourceText }) }],
    });
    await logCost(response.usage, user.id, `agent_${agent}`);
    const result = textOf(response);
    const outbox = parseOutbox(result);
    return {
      session_id: sessionId,
      user_id: user.id,
      round_id: roundId,
      agent,
      prompt: message,
      source_title: sourceTitle || null,
      source_text: sourceText || null,
      result: result || '(no reply)',
      outbox,
      signals: computeSignals(result, outbox),
      model: MODEL,
    };
  }));

  const rows = [];
  const errors = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') rows.push(s.value);
    else {
      console.error(`[udolli] ${agents[i]} failed:`, s.reason?.message || s.reason);
      errors.push({ agent: agents[i], error: 'This agent could not answer right now. Please try again.' });
    }
  });

  let saved = [];
  if (rows.length > 0) {
    const { data, error } = await supabase.from('udolli_analyses').insert(rows).select('*');
    if (error) {
      console.error('[udolli] save failed:', error.message);
      return res.status(500).json({ error: 'The answers were produced but could not be saved.' });
    }
    saved = data;
    await supabase.from('udolli_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
  }

  return res.status(200).json({ session_id: sessionId, round_id: roundId, analyses: saved, errors });
}

// ─── compare ────────────────────────────────────────────────────────────────
async function compareSession(req, res, user) {
  const sessionId = req.body?.session_id;
  if (typeof sessionId !== 'string') return res.status(400).json({ error: 'session_id is required.' });

  if ((await recentCount('udolli_comparisons', user.id)) >= COMPARE_LIMIT) {
    return res.status(429).json({ error: 'Please wait a few minutes before comparing again.' });
  }

  const { data: s } = await supabase.from('udolli_sessions').select('id').eq('id', sessionId).eq('user_id', user.id).single();
  if (!s) return res.status(404).json({ error: 'Session not found.' });

  const { data: rows } = await supabase
    .from('udolli_analyses')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const rounds = groupRounds(rows || []);
  const complete = rounds.filter((r) => r.anchor && r.driftwood);
  if (complete.length === 0) {
    return res.status(400).json({ error: 'Send at least one message to both agents first, so there is something to compare.' });
  }

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: COMPARE_SYSTEM,
      messages: [{ role: 'user', content: `Here is the session.\n\n${buildCompareInput(rounds)}` }],
    });
  } catch (err) {
    console.error('[udolli] compare failed:', err?.message || err);
    return res.status(502).json({ error: 'The comparison agent could not answer right now. Please try again.' });
  }
  await logCost(response.usage, user.id, 'compare');

  const raw = textOf(response);
  const parsed = parseJsonLoose(raw);
  // If the evaluator didn't return clean JSON, keep its words rather than lose them.
  const result = parsed ?? { headline: 'Comparison', raw_text: raw };

  const { data: saved, error } = await supabase
    .from('udolli_comparisons')
    .insert({ session_id: sessionId, user_id: user.id, result, round_count: rounds.length, model: MODEL })
    .select('*')
    .single();
  if (error) {
    console.error('[udolli] save comparison failed:', error.message);
    return res.status(500).json({ error: 'The comparison was produced but could not be saved.' });
  }
  return res.status(200).json({ comparison: saved });
}

// ─── handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  if (!(await hasUdolliAccess(supabase, user.id))) {
    return res.status(403).json({ error: 'This page is for UD-OLLI members.' });
  }

  try {
    if (req.method === 'GET') {
      if (req.query?.action === 'souls') {
        return res.status(200).json({ anchor: ANCHOR_SOUL, driftwood: DRIFTWOOD_SOUL });
      }
      return res.status(400).json({ error: 'Unknown action.' });
    }

    const action = req.body?.action;
    if (action === 'run') return await runAgents(req, res, user);
    if (action === 'compare') return await compareSession(req, res, user);
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('[udolli] error:', err?.message || err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
