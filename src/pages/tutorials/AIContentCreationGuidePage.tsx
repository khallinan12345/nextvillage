// src/pages/tutorials/AIContentCreationGuidePage.tsx
//
// A Guide for AI Content Creation (/tech-skills/ai-content-creation) — a
// 3-phase, 11-task guided workshop (Understand → Create → Polish), closer in
// shape to the AI Learning / Skill Development task-stepper pages than to
// the Creative AI generator pages, so this Guide gets its own standalone
// structure rather than joining an existing dynamic-route family.
//
// Built the same session this Guide's own backend was fixed: the page's
// three API routes (/api/content-task-instruction, /api/generate-content,
// /api/evaluate-content-session) didn't exist anywhere in the codebase
// before this — every Generate/Critique/Evaluate action on the live page
// would have failed. All three routes now exist (mirroring the working
// api/business-*.ts triad) and were verified end-to-end with real API
// calls before this Guide was written, including a real bug found and
// fixed live: long-form drafts routinely contain quoted dialogue that
// breaks naive JSON.parse, so generate-content.ts uses a plain delimiter
// format for content-producing responses instead of JSON.
//
// Two distinct feedback mechanisms exist here, and this Guide is careful to
// keep them separate rather than conflating them:
//   1. In-chat critique ("💡 Critique my response" or automatic after any
//      answer over 15 characters) — advisory, per sub-task, free-form
//      feedback with no numeric score.
//   2. Session-end Evaluate — scores 6 named skills 0-3 each, averaged into
//      an overall_score_average and a content_readiness label (Early Draft
//      / Needs Polish / Ready to Publish). Never blocks Save or Download.
//
// No on-page "Use Claude" button and no deep-link contract (confirmed via
// grep) — same swivel mechanic as every other Guide: copy a prompt, open
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

const TRACK = 'ai-content-creation-guide';
const PAGE_HREF = '/tech-skills/ai-content-creation';

/* ───────────────────────────── content ───────────────────────────── */

const STEPS: Step[] = [
  {
    id: 'intro',
    kind: 'read',
    title: 'What AI Content Creation actually does',
    body: [
      'This isn\'t a "type a prompt, get a blog post" tool — it\'s a guided workshop with 11 tasks across three phases: Understand (choose your content type, audience, and purpose), Create (gather ideas, write a draft, add your voice, structure it), and Polish (tighten the language, adapt it for its platform, final review). You pick from 8 content types: blog post, social media, email/newsletter, video script, grant proposal, product description, press release, or short story.',
      'Most tasks in the Understand phase are pure planning — they coach you, but don\'t write anything yet. The actual content only starts getting written once you reach the Create phase, built from what you established earlier.',
    ],
  },
  {
    id: 'feedback',
    kind: 'read',
    title: 'Two kinds of feedback — don\'t confuse them',
    body: [
      'Every answer you give gets an optional in-chat critique — click "💡 Critique my response," or one runs automatically if your answer is longer than 15 characters. This is free-form, advisory feedback on that one specific answer: honest if it\'s vague, encouraging if it\'s specific. There\'s no number attached to it, and it never blocks you from moving on.',
      'Separately, whenever you click "Evaluate" (or save your project), your whole session gets scored: 6 named skills — audience clarity, purpose focus, idea quality, draft craft, clarity/editing, and platform fit — each 0-3, averaged into an overall level: Early Draft, Needs Polish, or Ready to Publish. This is the real signal for "is this actually good," not the in-chat critique.',
    ],
    aside: 'Neither one blocks anything. You can save, download, or keep writing at any score.',
  },
  {
    id: 'swivel',
    kind: 'swivel',
    title: 'Swivel — pick a topic you can describe in one sentence',
    body: [
      'Before you open the workshop, use this swivel to land on a real topic and content type. A topic you can\'t describe in one sentence is one you haven\'t thought through yet, and this workshop asks you to commit to a content type before anything else.',
    ],
    prompt:
      "I'm about to write a real piece of content — a blog post, social media post, email, video script, grant proposal, product description, press release, or short story — using an AI-assisted writing workshop. Give me 3 small content ideas I could realistically finish in one sitting, each paired with the content type that fits it best. For each one, give me the one-sentence version and who the specific reader would be.",
    promptNote: 'Pick one. If none of them fit, ask for three more — better to swap ideas now than halfway through a draft.',
  },
  {
    id: 'do-understand',
    kind: 'do',
    title: 'Work through the Understand phase',
    body: [
      'Open AI Content Creation, choose your content type, and answer the audience and purpose questions honestly and specifically — name a real person, not "everyone," and one real goal, not several.',
    ],
    doLabel: 'Open AI Content Creation',
    doHref: PAGE_HREF,
  },
  {
    id: 'case',
    kind: 'read',
    title: 'A case in action',
    body: [
      'Here\'s a real round of the in-chat critique, on the "Know Your Audience" question.',
      'Weak answer: "My readers are people who like things." Real critique: "This is too broad to guide your writing — \'people who like things\' could describe almost anyone. Try to picture one specific person: for example, \'a 30-year-old working mom who wants quick, healthy dinner ideas but has no time to meal prep.\' The more clearly you can describe your reader\'s situation and what they need, the easier it will be to write content that actually connects with them. Refine your response if you\'d like, or move on when ready."',
      'Stronger answer: "My readers are small shop owners in Lagos who sell products over WhatsApp but struggle to write ads that get responses. They\'re busy, not very technical, and want something they can use right away." Real critique: "Great job. You\'ve named a specific person, their actual daily frustration, and what they need from your content — that\'s exactly what makes writing easier from here. You\'ve completed this step — let\'s move on."',
      'Notice the difference isn\'t length — it\'s specificity. "People who like things" could be anyone; "small shop owners in Lagos who sell over WhatsApp" is someone you could actually picture.',
    ],
  },
  {
    id: 'do-create',
    kind: 'do',
    title: 'Work through the Create phase',
    body: [
      'Gather your key ideas, then write your first draft — this is the first task that actually produces real content in your canvas on the right. Keep going through Add Voice and Structure & Flow, using "Critique my response" whenever you want a second opinion before moving on.',
    ],
    doLabel: 'Back to AI Content Creation',
    doHref: PAGE_HREF,
  },
  {
    id: 'do-polish',
    kind: 'do',
    title: 'Work through the Polish phase, then Evaluate',
    body: [
      'Tighten the language in Clarity & Language — try the "Improve English" button right on the content canvas if you want a full pass. Adapt it for your platform, do a final review, then click "Evaluate" and actually read all 6 skill scores and the advice, not just the overall level.',
    ],
    doLabel: 'Back to AI Content Creation',
    doHref: PAGE_HREF,
  },
  {
    id: 'do-finish',
    kind: 'do',
    title: 'Save or download your content',
    body: [
      'Once you\'re happy with it — or ready to keep working on it later — save your project so it shows up next time you open the page, or download/copy the finished piece to actually use it.',
    ],
    doLabel: 'Back to AI Content Creation',
    doHref: PAGE_HREF,
  },
  {
    id: 'gate',
    kind: 'gate',
    title: 'Prove it',
    body: [
      'You\'ve worked through all three phases, used the in-chat critique, and gotten a real Evaluate score. Tell us what you made.',
    ],
    gate: {
      label: 'What did you write, and what level did you reach?',
      placeholder: 'e.g. A blog post for small shop owners about AI WhatsApp ads — Needs Polish',
      validate: v => {
        const s = v.trim();
        if (s.length < 10) return 'Give a little more detail — what you wrote and the level you reached.';
        if (!/\s/.test(s)) return 'That looks like one word — add a bit more detail.';
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

const AIContentCreationGuidePage: React.FC = () => {
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
          <h1 className="mt-1 text-3xl font-extrabold">AI Content Creation</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            The 3-phase workshop, the two kinds of feedback it gives you, and a real weak-vs-strong answer to the first question you'll actually be asked.
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
              You've worked through all three phases, used both kinds of feedback, and produced something real. That workflow works for every piece you write here.
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

export default AIContentCreationGuidePage;
