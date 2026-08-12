// src/pages/tutorials/VibeCodingGuidePage.tsx
//
// "Vibe Code Something Real" — a step-by-step Guide for the Vibe Coding build
// page (/tech-skills/vibe-coding), which already walks a student through 4
// phases: write instructions, get an AI critique of those instructions
// *before* any code exists, generate + run the code, then debug/iterate.
// This Guide doesn't reinvent that page — it wraps it in the same
// read/do/swivel/gate pattern as FishMarketTutorialPage.tsx, so the habit of
// swiveling to the AI Playground to think something through carries over
// from that track rather than being taught twice, differently.
//
// Episode 1 reframes the AI Camp Day 1 reading ("The machine that notices
// everything" — patterns, training data, bias, algorithm) as the reason
// vibe coding is a real skill and not just typing English instead of code:
// the AI has no judgment of its own, so precision in what you ask for is
// the whole job. Episode 2 is the hands-on build, one step per phase.
//
// No slide images or recorded audio for this Guide (Fish Market has its own
// asset set) — narration falls back to on-device text-to-speech via
// useVoice, which needs no files to maintain.
//
// Progress: localStorage first (instant, offline), mirrored to
// `tutorial_progress` in Supabase when signed in — same as every other
// Guide on this site.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import {
  Check, Lock, Copy, CheckCheck, ExternalLink, Volume2, VolumeX,
  RotateCw, ChevronDown, ChevronRight, Link2, Loader2,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'swivel' | 'gate';

interface Gate {
  label: string;
  placeholder: string;
  /** Return null when valid, or a short message explaining what's wrong. */
  validate: (value: string) => string | null;
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  /** Prompt text with a copy button. For swivels this is what gets copied. */
  prompt?: string;
  promptNote?: string;
  /** Short aside rendered in a tinted box. */
  aside?: string;
  gate?: Gate;
  /** Overrides the spoken text (defaults to title + body). */
  narration?: string;
}

interface Episode {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  duration: string;
  available: boolean;
  steps: Step[];
}

const TRACK = 'vibe-coding-guide';

/* ───────────────────────────── content ───────────────────────────── */

const EPISODES: Episode[] = [
  {
    id: 'ep0',
    number: '0',
    title: 'Before You Touch the Keyboard',
    subtitle: 'What you\'re actually pairing with, and the habit that makes it work',
    duration: 'about 20 minutes',
    available: true,
    steps: [
      {
        id: 'ep0-machine',
        kind: 'read',
        title: 'The machine that notices everything',
        body: [
          'Remember your Day 1 reading? AI is software that has studied an enormous pile of human-written code, and found the patterns in it — which words tend to follow other words, which lines of code tend to follow other lines. It builds an algorithm from those patterns and uses it to predict what comes next.',
          'Here is what that means for you today: the AI you are about to work with has never felt frustrated by a bug, never cared whether your app looks good, and has no idea who it is for unless you tell it. It is not being lazy or careless when it guesses wrong — it is doing exactly what it was built to do, which is complete the pattern you started. If you leave something out, it fills the gap with whatever is most common in everything it has read. That might not be what you pictured.',
          'That is the whole game of vibe coding. Not "typing English instead of code" — specifying the pattern precisely enough that what comes back matches what is in your head.',
        ],
      },
      {
        id: 'ep0-what-it-is',
        kind: 'read',
        title: 'What "vibe coding" means on this page',
        body: [
          'The Vibe Coding page has four phases, in order, and you cannot skip ahead.',
          'Phase 1 — you write instructions describing what you want built, in plain language.',
          'Phase 2 — before a single line of code exists, the AI critiques your instructions and tells you what is missing or ambiguous.',
          'Phase 3 — it generates the code and runs it right there in your browser.',
          'Phase 4 — if something breaks, you debug it together instead of starting over.',
          'That order is deliberate. Most beginners want to jump straight to code. The critique step exists because catching a vague instruction is far cheaper than catching a vague app after it is built.',
        ],
      },
      {
        id: 'ep0-two-tabs',
        kind: 'read',
        title: 'The habit: two tabs',
        body: [
          'The Vibe Coding page is where you build. The AI Playground is where you step back — a second tab, no phases, nothing graded, just you and Claude working out what to answer or what went wrong.',
          'Every purple step below is a swivel: it copies a prompt and opens the Playground in a second tab. Do them, even when you feel like you already know the answer. That pause is where the actual learning happens, not the phase you were just in.',
        ],
      },
      {
        id: 'ep0-open',
        kind: 'do',
        title: 'Open Vibe Coding and start a session',
        body: [
          'Open the Vibe Coding page. You will see two halves: on the left, an AI design coach you can talk to if you want help figuring out what to build — it is optional, use it if you are stuck for an idea. On the right, the 4-phase workflow you just read about.',
          'Give your session a short name — a real one, like "Weather App" or "Quiz Game," not "test." You will want to find it again later.',
        ],
        aside: 'You do not have to use the design coach on the left. Some students go straight to Phase 1 with an idea already in mind — both are fine.',
      },
      {
        id: 'ep0-swivel-1',
        kind: 'swivel',
        title: 'Swivel — pick something you can explain in one sentence',
        body: [
          'Before you write real instructions, use this swivel to land on an idea you can actually describe clearly. A project you cannot explain in one sentence is a project you have not thought through yet — and that shows up later as a bad Phase 1.',
        ],
        prompt:
          "I'm about to try vibe coding for the first time — describing an app in plain language and having AI write the code from my instructions. Give me 3 small project ideas a beginner could realistically finish in one sitting (a small game, a tool, or a simple site). For each one, give me the one-sentence version, and tell me the single trickiest thing I'd need to describe clearly for the AI to get it right.",
        promptNote: 'Pick one. If none of them fit, ask for three more — better to swap ideas now than halfway through Phase 1.',
      },
    ],
  },

  {
    id: 'ep1',
    number: '1',
    title: 'Say It, Check It, Build It, Fix It',
    subtitle: 'One pass through all four phases, start to finish',
    duration: 'about an hour',
    available: true,
    steps: [
      {
        id: 'ep1-phase1',
        kind: 'do',
        title: 'Phase 1 — write your instructions',
        body: [
          'In the instructions box, describe what you want built. Two or three sentences is plenty for a first draft — say what it does, who it is for, and any one detail that matters to you (a color, a name, a rule the game follows).',
          "Do not aim for perfect. Vague spots are exactly what the next phase is for.",
        ],
      },
      {
        id: 'ep1-why-critique',
        kind: 'read',
        title: 'Why Phase 2 exists',
        body: [
          'This is the training-data problem from Episode 0, showing up for real. Anywhere your instructions were vague, the AI is about to fill the gap with whatever is most common in everything it has read — not necessarily what you meant.',
          'The critique step catches that before it costs you a rewrite. Read it as a list of exactly where you were vague, not as a judgment on your idea.',
        ],
      },
      {
        id: 'ep1-phase2',
        kind: 'do',
        title: 'Phase 2 — get your critique',
        body: [
          'Click through to get the critique of your Phase 1 instructions. Read every point — most students skim this and pay for it in Phase 4.',
          'Improve your instructions based on whatever actually matters to what you are building, then continue.',
        ],
      },
      {
        id: 'ep1-swivel-2',
        kind: 'swivel',
        title: 'Swivel — weigh the critique yourself',
        body: [
          'Do not accept every critique point automatically. Some are genuinely important; some are the AI defaulting to "the usual version of an app like this" instead of the specific thing you asked for. Use this swivel to decide which is which.',
        ],
        prompt:
          "I wrote instructions for an app I want vibe-coded, and got a critique back before any code was written.\n\nMy instructions: [PASTE YOUR INSTRUCTIONS]\n\nThe critique: [PASTE THE CRITIQUE]\n\nWhich points in this critique actually matter for what I'm building, and which ones look like the AI defaulting to a generic version instead of what I specifically asked for?",
        promptNote: 'Come back and only fold in the critique points you actually agree with.',
      },
      {
        id: 'ep1-phase3',
        kind: 'do',
        title: 'Phase 3 — generate and run the code',
        body: [
          'Generate the code and run it right there on the page. Try it the way an actual user would — click the buttons, play the game, break it a little on purpose.',
        ],
      },
      {
        id: 'ep1-breaks',
        kind: 'read',
        title: 'When it breaks, that is on schedule',
        body: [
          'Something will probably not work exactly right the first time. That is not a sign you did something wrong — it is a normal part of the pattern-matching this AI does. Bugs are just one more gap you have not described yet.',
        ],
      },
      {
        id: 'ep1-phase4',
        kind: 'do',
        title: 'Phase 4 — debug it with the AI',
        body: [
          'Describe exactly what happened versus what you expected — "I clicked Start and nothing happened" is more useful than "it is broken." Let the debugging phase take another pass, and test again.',
          'Repeat Phases 3 and 4 as many times as you need. This loop, not a single perfect generation, is what vibe coding actually looks like day to day.',
        ],
      },
      {
        id: 'ep1-swivel-3',
        kind: 'swivel',
        title: 'Swivel — explain it back',
        body: [
          'Once it works, this is the step that turns "I have some code" into "I understand what I built." A person who can explain the code they were given owns it. A person who cannot is just holding a file.',
        ],
        prompt:
          "Here is code that was generated for me from my instructions in a vibe-coding tool:\n\n[PASTE THE CODE]\n\nExplain what it does in plain language, section by section, like I have never read code before. Then ask me one question to check I actually understand it.",
        promptNote: 'Answer the question it asks you, in your own words, before moving on.',
      },
      {
        id: 'ep1-gate',
        kind: 'gate',
        title: 'Save it and prove it',
        body: [
          'Save your session if you have not already. To finish this Guide, tell us what you built.',
        ],
        gate: {
          label: 'What did you build? (project name + one sentence of what it does)',
          placeholder: 'e.g. Weather App — shows a 3-day forecast for any city you type in',
          validate: v => {
            const s = v.trim();
            if (s.length < 10) return 'Give a little more detail — a name and what it actually does.';
            if (!/\s/.test(s)) return 'That looks like one word — add what it does.';
            return null;
          },
        },
      },
    ],
  },
];

const ALL_STEP_IDS = EPISODES.flatMap(e => e.steps.map(s => s.id));

/* ──────────────────────────── small parts ─────────────────────────── */

const CopyBlock: React.FC<{ text: string; tone?: 'amber' | 'purple' }> = ({ text, tone = 'amber' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older mobile browsers: fall back to a hidden textarea.
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

const VibeCodingGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [openEpisode, setOpenEpisode] = useState('ep0');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');
  const [speakingStep, setSpeakingStep] = useState<string | null>(null);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
  } = useVoice(voiceMode === 'pidgin');

  useEffect(() => { if (!isSpeaking) setSpeakingStep(null); }, [isSpeaking]);

  /* ── load progress: localStorage first (instant, offline), then Supabase ── */

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
      // Union with anything done offline — the cloud copy never deletes local work.
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

  /* ── progression ── */

  const stepsOf = (ep: Episode) => ep.steps;

  const firstIncompleteIndex = useCallback((ep: Episode) => {
    const idx = ep.steps.findIndex(s => !done.has(s.id));
    return idx === -1 ? ep.steps.length : idx;
  }, [done]);

  const isUnlocked = useCallback((ep: Episode, index: number) => index <= firstIncompleteIndex(ep), [firstIncompleteIndex]);

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

  /* ── narration ── */

  const narrationFor = (s: Step) => s.narration ?? [s.title, ...s.body, s.aside ?? ''].filter(Boolean).join('. ');

  const speakStep = (s: Step) => {
    if (speakingStep === s.id) { cancelSpeech(); setSpeakingStep(null); return; }
    cancelSpeech();
    setSpeakingStep(s.id);
    hookSpeak(narrationFor(s));
  };

  useEffect(() => () => { cancelSpeech(); }, [cancelSpeech]);

  /* ── swivel ── */

  const swivel = async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); } catch { /* copy button is still there */ }
    window.open('/playground', '_blank', 'noopener');
  };

  /* ── derived ── */

  const totalSteps = ALL_STEP_IDS.length;
  const doneCount = useMemo(() => ALL_STEP_IDS.filter(id => done.has(id)).length, [done]);
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;

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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">Vibe Code Something Real</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                Describe an app in plain language, get an AI critique before any code exists, then build and debug it — one real pass through all four phases.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-slate-600">
                <button
                  onClick={() => setVoiceMode('english')}
                  className={`px-2.5 py-1.5 text-xs font-bold ${voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >🇬🇧 <span className="hidden sm:inline">English</span></button>
                <button
                  onClick={() => setVoiceMode('pidgin')}
                  title="Nigerian English / Pidgin voice"
                  className={`px-2.5 py-1.5 text-xs font-bold ${voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >🇳🇬 <span className="hidden sm:inline">Pidgin</span></button>
              </div>
              <button
                onClick={() => { setVoiceOn(v => { if (v) { cancelSpeech(); setSpeakingStep(null); } return !v; }); }}
                title={voiceOn ? 'Turn narration off' : 'Turn narration on'}
                className={`rounded-lg p-2 ${voiceOn ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            </div>
          </div>

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

        {/* episodes */}
        {EPISODES.map(ep => {
          const open = openEpisode === ep.id;
          const epDone = ep.steps.filter(s => done.has(s.id)).length;
          const epComplete = ep.steps.length > 0 && epDone === ep.steps.length;

          return (
            <div key={ep.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => setOpenEpisode(open ? '' : ep.id)}
                disabled={!ep.available}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${ep.available ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  epComplete ? 'bg-green-600 text-white' : ep.available ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}>
                  {epComplete ? <Check className="h-6 w-6" /> : ep.available ? ep.number : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h2 className="text-lg font-bold text-gray-900">Episode {ep.number} · {ep.title}</h2>
                    <span className="text-xs text-gray-400">{ep.duration}</span>
                  </div>
                  <p className="truncate text-sm text-gray-500">{ep.subtitle}</p>
                  {ep.available && ep.steps.length > 0 && (
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${(epDone / ep.steps.length) * 100}%` }} />
                    </div>
                  )}
                </div>
                {ep.available && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 sm:p-6">
                  {stepsOf(ep).map((step, i) => {
                    const unlocked = isUnlocked(ep, i);
                    const isDone = done.has(step.id);
                    const isOpen = unlocked && (!isDone || expanded.has(step.id));
                    const st = KIND_STYLE[step.kind];

                    return (
                      <div
                        key={step.id}
                        className={`mb-3 rounded-xl border bg-white transition-all ${isDone ? 'border-green-200' : st.ring} ${!unlocked ? 'opacity-50' : ''}`}
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
                          {voiceOn && unlocked && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={e => { e.stopPropagation(); speakStep(step); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); speakStep(step); } }}
                              className={`rounded p-1.5 ${speakingStep === step.id ? 'bg-cyan-100 text-cyan-700' : 'text-gray-400 hover:bg-gray-100'}`}
                            >
                              <Volume2 className="h-4 w-4" />
                            </span>
                          )}
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

                            {step.kind === 'do' && (
                              <button
                                onClick={() => window.open('/tech-skills/vibe-coding', '_blank', 'noopener')}
                                className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Open Vibe Coding
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

                  {epComplete && (
                    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
                      <p className="font-bold text-green-900">Episode {ep.number} complete.</p>
                      <p className="mt-1 text-sm text-green-800">
                        {ep.id === 'ep1'
                          ? "You built something from a sentence and can explain how it works. When you're ready, the Vibe Coding certification is the next step."
                          : 'Move on when you are ready.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-8 text-center">
          <button onClick={() => navigate('/tutorials')} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </div>

      {fallbackText && <VoiceFallback text={fallbackText} onDismiss={clearFallback} />}
    </AppLayout>
  );
};

export default VibeCodingGuidePage;
