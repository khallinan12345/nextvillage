// src/pages/tutorials/CreateGameGuidePage.tsx
//
// A Guide for Create Game (/tech-skills/create-game) — a Vibe-Coding-style
// tool, not a fixed-rubric generator like the Creative AI pages. A student
// describes a game idea in chat, Claude generates a complete, self-contained
// HTML/canvas game, and the code stays genuinely hidden — the student only
// ever sees the running game and the chat. Confirmed via the page's own
// system prompt: mouse/trackpad input only (keyboard events are explicitly
// forbidden), one self-contained HTML file, no alert/confirm/prompt, no
// localStorage/cookies.
//
// There's no Subject/Setting-style named rubric here the way Image/Voice/
// Video Creation have. Instead, every generation runs an automated smoke
// test inside a sandboxed iframe (src/lib/gameTestHarness.ts) — does a
// <canvas> exist, does it visibly change after simulated input, did any JS
// error get thrown — and that result plus the actual code gets turned into
// a plain-language verdict ("looks good" / "needs work") and suggestions.
// This is advisory only: nothing blocks Save or Publish on a "needs work"
// verdict. This Guide teaches the real loop that verdict is part of —
// describe, generate, read the verdict, ask for one specific change, repeat
// — the same iterative habit VibeCodingGuidePage.tsx teaches for its page,
// which is why this Guide mirrors that one's read/do/swivel/gate structure
// rather than the Creative AI pages' weak/strong-prompt case study.
//
// No region-gating, no certification page, no on-page "Use Claude" button —
// same swivel mechanic as every other Guide: copy a prompt, open
// /playground in a new tab, paste it in yourself.
//
// Progress: localStorage first, mirrored to `tutorial_progress` in Supabase
// when signed in — same as every other Guide on this site.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, Lock, Copy, CheckCheck, ExternalLink, RotateCw, ChevronDown, ChevronRight, Link2, Loader2,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'swivel' | 'gate';

interface Gate {
  label: string;
  placeholder: string;
  validate: (value: string) => string | null;
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  prompt?: string;
  promptNote?: string;
  aside?: string;
  gate?: Gate;
  doLabel?: string;
  doHref?: string;
}

const TRACK = 'create-game-guide';
const PAGE_HREF = '/tech-skills/create-game';

/* ───────────────────────────── content ───────────────────────────── */

const STEPS: Step[] = [
  {
    id: 'intro',
    kind: 'read',
    title: 'What Create Game actually does',
    body: [
      'You describe a game idea in chat, and Claude generates a complete, self-contained game — you never see the code, only the running game on the right and the conversation on the left. Every game here works with mouse or trackpad clicks only; there\'s no keyboard support, so an idea like "use arrow keys to move" won\'t translate the way you\'re picturing it.',
      'When you ask for a change, the whole game gets rebuilt from your description plus whatever you\'re asking for — not a small patch. That means a request like "make the ball faster" works better than a vague "make it more fun," the same lesson Vibe Coding teaches: precision in what you ask for is the whole job.',
    ],
  },
  {
    id: 'verdict',
    kind: 'read',
    title: 'How it checks your game — and what it doesn\'t',
    body: [
      'After every generation, the game runs automatically inside a sandbox that checks three purely mechanical things: does a game canvas actually exist, does it visibly respond when clicked, and did anything throw an error. That result, plus the actual code, gets turned into a plain-language verdict — "looks good" or "needs work" — with a few suggestions.',
      'This is advice, not a gate. A "needs work" verdict won\'t stop you from saving or publishing, and a "looks good" verdict doesn\'t mean the game is actually fun — it means nothing is mechanically broken. Reading the suggestions is still worth doing every time; that\'s where the real feedback lives.',
    ],
    aside: 'There is no scored rubric here like Image or Voice Creation have — no Subject, no Setting, no numeric score. Just a working/broken check and a few sentences of advice.',
  },
  {
    id: 'swivel',
    kind: 'swivel',
    title: 'Swivel — pick something you can describe in one sentence',
    body: [
      'Before you start typing, use this swivel to land on an idea you can actually explain clearly. A game you can\'t describe in one sentence is a game you haven\'t thought through yet — and remember, every request rebuilds the whole thing from your description, so a vague starting idea costs you more here than in most tools.',
    ],
    prompt:
      "I'm about to build a browser game using AI, where I describe it in chat and the AI generates the whole thing — mouse or trackpad clicks only, no keyboard. Give me 3 small game ideas a beginner could realistically finish in one sitting, each using only clicking or dragging. For each one, give me the one-sentence version, and tell me the single trickiest thing I'd need to describe clearly for the AI to get it right.",
    promptNote: 'Pick one. If none of them fit a click-only game, ask for three more.',
  },
  {
    id: 'do-first',
    kind: 'do',
    title: 'Describe your first version',
    body: [
      'Open Create Game and describe your idea in two or three sentences — what the player clicks or drags, what happens when they do, and what the goal is. Give it a moment to generate, then actually play it on the right before reading the verdict.',
    ],
    doLabel: 'Open Create Game',
    doHref: PAGE_HREF,
  },
  {
    id: 'case',
    kind: 'read',
    title: 'A case in action',
    body: [
      'Here\'s a real round of this loop, start to finish.',
      'First message: "Make a game where you click bubbles to pop them." The AI generates a working canvas — bubbles appear, clicking one makes it disappear, nothing errors out. The verdict comes back: "Looks good — the canvas responds correctly to clicks, no errors. Suggestion: there\'s no way to know how you\'re doing — consider adding a score counter so clicking feels rewarding instead of just clicking into a void."',
      'That suggestion is specific and actionable, so the next message names exactly that: "Add a score counter in the top corner that goes up by 1 each time I pop a bubble, and make the bubble disappear with a small shrink animation when I click it." The whole game regenerates. New verdict: "Looks good — canvas responds correctly, no errors, and the score counter updates as expected."',
      'Notice what changed between rounds: not a vague "make it better," but one specific, checkable request pulled straight from the suggestion. That\'s the entire skill this page is teaching.',
    ],
  },
  {
    id: 'do-iterate',
    kind: 'do',
    title: 'Ask for one specific change',
    body: [
      'Read your own verdict\'s suggestions, and pick the one that would actually improve the game the most. Turn it into one specific, concrete request — not "make it better," but the exact thing you want changed — and send it. Play the result before deciding whether to iterate again.',
    ],
    doLabel: 'Back to Create Game',
    doHref: PAGE_HREF,
  },
  {
    id: 'do-publish',
    kind: 'do',
    title: 'Name it and publish',
    body: [
      'Once you\'re happy with it, give your game a real name and click Publish. You\'ll get a shareable link at /tech-skills/games/ — anyone with that link can play it, and it\'ll show up under your own games so you can reopen and keep editing it later.',
    ],
    doLabel: 'Back to Create Game',
    doHref: PAGE_HREF,
  },
  {
    id: 'gate',
    kind: 'gate',
    title: 'Prove it',
    body: [
      'You\'ve been through the real loop — describe, generate, read the verdict, ask for one specific change — at least once. Tell us what you built.',
    ],
    gate: {
      label: 'What game did you build? (name + one sentence of what it does)',
      placeholder: 'e.g. Bubble Pop — click bubbles to pop them and rack up a score',
      validate: v => {
        const s = v.trim();
        if (s.length < 10) return 'Give a little more detail — a name and what it actually does.';
        if (!/\s/.test(s)) return 'That looks like one word — add what it does.';
        return null;
      },
    },
  },
];

const ALL_STEP_IDS = STEPS.map(s => s.id);

/* ──────────────────────────── small parts ─────────────────────────── */

const CopyBlock: React.FC<{ text: string; tone?: 'amber' | 'purple' }> = ({ text, tone = 'amber' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more we can do */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  const ring = tone === 'purple' ? 'border-purple-300 bg-purple-50' : 'border-amber-300 bg-amber-50';
  const btn = tone === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-amber-600 hover:bg-amber-700';
  return (
    <div className={`relative rounded-xl border ${ring} p-4 pr-32`}>
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-gray-800">{text}</pre>
      <button
        onClick={copy}
        className={`absolute right-3 top-3 flex items-center gap-1.5 rounded-lg ${btn} px-3 py-2 text-xs font-bold text-white transition-colors`}
      >
        {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

/* ──────────────────────────── main page ──────────────────────────── */

const CreateGameGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lsKey = `tutorial:${TRACK}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const p = JSON.parse(raw);
        setDone(new Set<string>(p.completed ?? []));
        setArtifacts(p.artifacts ?? {});
      }
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tutorial_progress')
        .select('completed_steps, artifacts')
        .eq('user_id', userId)
        .eq('track', TRACK)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
      setArtifacts(prev => ({ ...(data.artifacts ?? {}), ...prev }));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback((nextDone: Set<string>, nextArtifacts: Record<string, string>) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({
        completed: [...nextDone], artifacts: nextArtifacts, updated: Date.now(),
      }));
    } catch { /* private browsing, quota — progress still works in memory */ }
    if (!userId) return;
    setSyncing(true);
    supabase
      .from('tutorial_progress')
      .upsert({
        user_id: userId,
        track: TRACK,
        completed_steps: [...nextDone],
        artifacts: nextArtifacts,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, userId]);

  const firstIncompleteIndex = useMemo(() => {
    const idx = STEPS.findIndex(s => !done.has(s.id));
    return idx === -1 ? STEPS.length : idx;
  }, [done]);

  const isUnlocked = (index: number) => index <= firstIncompleteIndex;

  const complete = (step: Step, value?: string) => {
    const nextDone = new Set(done); nextDone.add(step.id);
    const nextArt = value !== undefined ? { ...artifacts, [step.id]: value } : artifacts;
    setDone(nextDone); setArtifacts(nextArt); persist(nextDone, nextArt);
    setExpanded(prev => { const n = new Set(prev); n.delete(step.id); return n; });
  };

  const uncomplete = (step: Step) => {
    const nextDone = new Set(done); nextDone.delete(step.id);
    setDone(nextDone); persist(nextDone, artifacts);
  };

  const submitGate = (step: Step) => {
    const v = (gateDraft[step.id] ?? '').trim();
    const err = step.gate!.validate(v);
    if (err) { setGateError(p => ({ ...p, [step.id]: err })); return; }
    setGateError(p => ({ ...p, [step.id]: '' }));
    complete(step, v);
  };

  const swivel = async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); } catch { /* copy button is still there */ }
    window.open('/playground', '_blank', 'noopener');
  };

  const totalSteps = ALL_STEP_IDS.length;
  const doneCount = useMemo(() => ALL_STEP_IDS.filter(id => done.has(id)).length, [done]);
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;
  const allDone = doneCount === totalSteps;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read:   { badge: 'bg-slate-100 text-slate-600',   label: 'Read',   ring: 'border-gray-200' },
    do:     { badge: 'bg-amber-100 text-amber-800',   label: 'Do',     ring: 'border-amber-200' },
    swivel: { badge: 'bg-purple-100 text-purple-800', label: 'Swivel', ring: 'border-purple-300' },
    gate:   { badge: 'bg-cyan-100 text-cyan-800',     label: 'Prove it', ring: 'border-cyan-300' },
  };

  if (!loaded) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">

        {/* header */}
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Guide</p>
          <h1 className="mt-1 text-3xl font-extrabold">Create Game</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            Describe a game idea, read the AI's verdict, ask for one specific change, and publish — the same iterative loop that makes vibe coding actually work.
          </p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {totalSteps} steps</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {!userId && (
              <p className="mt-2 text-xs text-slate-400">
                Your progress is saved on this device. Sign in to keep it across devices.
              </p>
            )}
          </div>
        </div>

        {/* steps */}
        {STEPS.map((step, i) => {
          const unlocked = isUnlocked(i);
          const isDone = done.has(step.id);
          const isOpen = unlocked && (!isDone || expanded.has(step.id));
          const st = KIND_STYLE[step.kind];

          return (
            <div
              key={step.id}
              className={`mb-3 overflow-hidden rounded-xl border bg-white transition-all ${isDone ? 'border-green-200' : st.ring} ${!unlocked ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => {
                  if (!unlocked) return;
                  setExpanded(prev => {
                    const n = new Set(prev);
                    if (n.has(step.id)) n.delete(step.id); else n.add(step.id);
                    return n;
                  });
                }}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isDone ? 'bg-green-600 text-white' : unlocked ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>
                  {isDone ? <Check className="h-4 w-4" /> : unlocked ? i + 1 : <Lock className="h-3 w-3" />}
                </div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${st.badge}`}>{st.label}</span>
                <span className={`flex-1 text-sm font-semibold ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.title}</span>
                {unlocked && (isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />)}
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-4 sm:px-6">
                  {step.body.map((p, k) => (
                    <p key={k} className="mb-3 text-[15px] leading-relaxed text-gray-700">{p}</p>
                  ))}

                  {step.prompt && (
                    <div className="mb-3">
                      <CopyBlock text={step.prompt} tone={step.kind === 'swivel' ? 'purple' : 'amber'} />
                      {step.promptNote && <p className="mt-2 text-sm italic text-gray-500">{step.promptNote}</p>}
                    </div>
                  )}

                  {step.aside && (
                    <div className="mb-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                      {step.aside}
                    </div>
                  )}

                  {step.kind === 'swivel' && step.prompt && (
                    <button
                      onClick={() => swivel(step.prompt!)}
                      className="mb-3 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700"
                    >
                      <RotateCw className="h-4 w-4" />
                      Copy and open the AI Playground
                      <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                    </button>
                  )}

                  {step.kind === 'do' && step.doHref && (
                    <button
                      onClick={() => window.open(step.doHref!, '_blank', 'noopener')}
                      className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {step.doLabel ?? 'Open the page'}
                    </button>
                  )}

                  {step.gate ? (
                    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                      <label className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-900">
                        <Link2 className="h-4 w-4" />{step.gate.label}
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={gateDraft[step.id] ?? artifacts[step.id] ?? ''}
                          onChange={e => setGateDraft(p => ({ ...p, [step.id]: e.target.value }))}
                          placeholder={step.gate.placeholder}
                          className="flex-1 rounded-lg border border-cyan-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                        />
                        <button
                          onClick={() => submitGate(step)}
                          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700"
                        >
                          {isDone ? 'Update' : 'Submit'}
                        </button>
                      </div>
                      {gateError[step.id] && <p className="mt-2 text-sm font-semibold text-red-600">{gateError[step.id]}</p>}
                      {isDone && artifacts[step.id] && (
                        <p className="mt-2 break-all text-xs text-cyan-800">Saved: {artifacts[step.id]}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {!isDone ? (
                        <button
                          onClick={() => complete(step)}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
                        >
                          Mark done
                        </button>
                      ) : (
                        <button
                          onClick={() => uncomplete(step)}
                          className="text-sm font-semibold text-gray-400 hover:text-gray-600"
                        >
                          Not done yet
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {allDone && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="font-bold text-green-900">Guide complete.</p>
            <p className="mt-1 text-sm text-green-800">
              You built something from a description, iterated on it based on real feedback, and published it. That loop works for every game you make here.
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <button onClick={() => navigate('/tutorials')} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default CreateGameGuidePage;
