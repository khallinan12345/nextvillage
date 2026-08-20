// src/lib/learnerMemory.ts
//
// Persistent, cross-session memory about a student — who they are, what
// they care about, what they've worked on — shared between "Use Claude"
// and "Systems Think". Generalizes the proven pattern already used for
// user_personality_baseline (src/pages/learning/AIReadySkillsPage.tsx): a
// single capped-length summary, nudged by a cheap Haiku call after a
// session (never rewritten wholesale), read once per session and folded
// into the system prompt — never touched per turn, so steady-state token
// cost after the first turn of a session is zero.
//
// Cross-session relevance ("did any of this student's past chats relate
// to what they're asking now") is deliberately NOT vector search: real
// scale here is a handful of sessions per student (confirmed against
// production data), so a second cheap Haiku call that reads the list of
// past session titles a page already has loaded for its own sidebar and
// picks 0-3 relevant ones is simpler, cheaper, and good enough. Revisit if
// session counts ever grow into the hundreds.

import { supabase } from './supabaseClient';
import { chatJSON } from './chatClient';

export interface CandidateSession {
  id: string;
  title: string;
  surface: 'Use Claude' | 'Systems Think';
  updatedAt: string;
}

const MAX_SUMMARY_WORDS = 150;

/** Fetches the student's current memory summary. Empty string if none yet
 * (their first-ever session on either surface). Never throws. */
export async function fetchLearnerMemory(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('learner_ai_memory')
      .select('summary')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data?.summary ?? '';
  } catch (err) {
    console.warn('[learnerMemory] fetch failed:', err);
    return '';
  }
}

/**
 * Merges new facts from this session into the student's memory summary.
 * The caller decides WHEN to invoke this (e.g. only after >=4 new user
 * messages in a session, to bound cost) — this function always does the
 * work when called. Never throws; failures are logged and skipped so a
 * memory-update hiccup can never affect the visible conversation.
 */
export async function updateLearnerMemory(
  userId: string,
  currentSummary: string,
  recentUserMessages: string[],
): Promise<void> {
  if (recentUserMessages.length === 0) return;

  const excerpt = recentUserMessages.slice(-12).map((m, i) => `[${i + 1}] ${m}`).join('\n');

  const prompt = `You maintain a short running memory of a student, built up across many separate conversations on different tools. Merge anything new and genuinely worth remembering from this session into the existing memory below — interests, goals, recurring themes, notable facts about their life or work. Do NOT record anything sensitive (health, family conflict, legal/financial trouble, anything that reads like a disclosure rather than an interest) — skip it entirely rather than flag it.

EXISTING MEMORY (may be empty — this could be the first session):
"${currentSummary || '(nothing yet)'}"

THIS SESSION — STUDENT'S OWN MESSAGES:
${excerpt}

Write the UPDATED memory as a single flowing paragraph, under ${MAX_SUMMARY_WORDS} words. If it would otherwise exceed that, drop whichever existing detail is least useful to know before a future conversation — keep the most durable, distinguishing facts (genuine interests, ongoing projects, goals) over one-off mentions. If nothing new and worth keeping came up this session, return the existing memory unchanged.

Respond with ONLY valid JSON: {"summary": "..."}`;

  try {
    const result = await chatJSON({
      page: 'LearnerMemoryAgent',
      messages: [{ role: 'user', content: prompt }],
      system: 'You maintain a concise, respectful running memory of a student for their AI tutor. Return only valid JSON.',
      max_tokens: 400,
      temperature: 0.3,
    });

    const summary = typeof result?.summary === 'string' ? result.summary.trim() : '';
    if (!summary) return;

    const { error } = await supabase
      .from('learner_ai_memory')
      .upsert({ user_id: userId, summary, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) console.warn('[learnerMemory] save failed:', error);
  } catch (err) {
    console.warn('[learnerMemory] update call failed, skipping:', err);
  }
}

/**
 * Picks the 0-3 of `candidates` genuinely relevant to `currentMessage`.
 * Never throws — returns [] on any failure so callers proceed without
 * cross-session context rather than blocking.
 */
export async function findRelevantSessions(
  currentMessage: string,
  candidates: CandidateSession[],
): Promise<CandidateSession[]> {
  if (candidates.length === 0 || !currentMessage.trim()) return [];

  const list = candidates
    .map((c, i) => `${i}. "${c.title}" (${c.surface}, ${new Date(c.updatedAt).toLocaleDateString()})`)
    .join('\n');

  const prompt = `A student just wrote this to their AI tutor:
"${currentMessage.slice(0, 500)}"

Here are their past conversations (index, title, tool, date):
${list}

Which of these, if any, are genuinely relevant to what they just wrote — the same topic, a continuation, or something that would help the tutor connect the dots? Most of the time the answer is none of them; only pick ones with a real, specific connection, not just vague topical overlap.

Respond with ONLY valid JSON: {"relevant_indices": [<integers, 0-3 of them, empty array if none>]}`;

  try {
    const result = await chatJSON({
      page: 'LearnerMemoryAgent',
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a careful relevance filter. Most candidates are not relevant — only select genuine matches. Return only valid JSON.',
      max_tokens: 150,
      temperature: 0.1,
    });

    const indices: unknown[] = Array.isArray(result?.relevant_indices) ? result.relevant_indices : [];
    return indices
      .filter((i): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < candidates.length)
      .slice(0, 3)
      .map((i) => candidates[i]);
  } catch (err) {
    console.warn('[learnerMemory] relevance call failed, skipping:', err);
    return [];
  }
}

/** Formats the compact block to fold into a system prompt. Empty string
 * when there's nothing at all to say yet (a brand-new student's very
 * first message), so a pointless "you're talking with this student"
 * boilerplate never gets appended. */
export function buildMemoryBlock(name: string | null, summary: string, relevant: CandidateSession[]): string {
  if (!name && !summary.trim() && relevant.length === 0) return '';

  const lines: string[] = [`LEARNER CONTEXT: You're talking with ${name || 'this student'}.`];
  if (summary.trim()) {
    lines.push(`What you know about them: ${summary.trim()}`);
  }
  if (relevant.length > 0) {
    const refs = relevant
      .map(r => `"${r.title}" (${r.surface}, ${new Date(r.updatedAt).toLocaleDateString()})`)
      .join('; ');
    lines.push(`Potentially relevant earlier conversation(s): ${refs}. Only bring these up if they're actually useful — don't force a callback.`);
  }
  return lines.join('\n');
}
