// src/pages/tutorials/FoundationsCategoryGuidePage.tsx
//
// One Guide per Foundations subject — English Skills, Math Skills, Science
// Skills. "Foundations" is already this platform's own name for this trio
// (Sidebar.tsx, Navbar.tsx, and AboutPage.tsx all group them under that
// label) — not a name invented for this Guide.
//
// Same dynamic-route/config pattern as AILearningCategoryGuidePage.tsx and
// SkillDevelopmentCategoryGuidePage.tsx, but three real differences worth
// noting:
//
// 1. No deep-link contract exists on these three pages today (no
//    ?activity=/?create= query-param handling, confirmed by grep — that
//    contract is AI Learning/Skill Development-specific). "Do" steps here
//    just open the plain page URL and tell the student which stage to open,
//    since Stage 1 of each subject is already the default first stage a new
//    visitor sees.
//
// 2. Levels are named directly by the AI (Emerging / Developing /
//    Proficient / Advanced — a 4-tier scale, not the 0–3 numeric rubric AI
//    Learning/Skill Development use), and "can_advance" requires every
//    listed sub-category to individually read Proficient or better — not a
//    single computed minimum the way Skill Development's overall score is.
//
// 3. Despite AboutPage.tsx's copy still saying stages "unlock" sequentially,
//    the actual code (see each page's own comment: "All Foundations stages
//    are open to everyone — no prerequisite gating") no longer enforces
//    that. This Guide demonstrates Stage 1 of each subject because it's the
//    natural starting point, not because anything is actually locked.
//
// "Basic level" (from the user's request) is interpreted as Stage 1 of each
// subject — the real, visible, distinct-rubric entry stage — rather than
// the separate, invisible, non-user-selectable communication_level (0–3)
// that only adjusts the AI coach's vocabulary register under the hood.
//
// Progress: localStorage first, mirrored to `tutorial_progress` when signed
// in — same as every other Guide. Track id is per-subject
// (`foundations-guide-<categoryId>`).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink,
  BookOpen, Calculator, Atom,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'gate';

interface Gate {
  label: string;
  placeholder: string;
  validate: (value: string) => string | null;
}

interface CriterionDef {
  name: string;
}

interface Attempt {
  label: string;
  answer: string;
  critique: string;
  /** Plain-language reason this attempt is better than the last — absent on the first attempt. */
  whyBetter?: string;
}

interface CaseStudy {
  scenario: string;
  question: string;
  attempts: Attempt[];
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  aside?: string;
  criteriaList?: CriterionDef[];
  caseStudy?: CaseStudy;
  doLabel?: string;
  doHref?: string;
  gate?: Gate;
  narration?: string;
}

interface CategoryGuideContent {
  id: string;
  title: string;
  hook: string;
  Icon: React.ComponentType<{ className?: string }>;
  stageName: string;
  stageSubtitle: string;
  levelScale: string;
  whyAI: string;
  criteria: CriterionDef[];
  caseStudy: CaseStudy;
  pageHref: string;
}

/* ───────────────────────────── content ───────────────────────────── */

const CATEGORY_GUIDES: Record<string, CategoryGuideContent> = {
  'english-skills': {
    id: 'english-skills',
    title: 'English Skills',
    hook: 'AI-coached conversation practice through staged difficulty — starting with Stage 1: Oral Expression, "Find Your Voice."',
    Icon: BookOpen,
    stageName: 'Stage 1: Oral Expression',
    stageSubtitle: 'Find Your Voice',
    levelScale: 'Emerging (0–39) → Developing (40–64) → Proficient (65–84) → Advanced (85–100)',
    whyAI: 'AI can write and speak fluently for you in seconds — but it can’t have your voice, your story, or think out loud with you in a real conversation. Being able to express yourself clearly, in your own words, is what lets you actually use AI as a tool instead of leaning on it completely — and it’s the skill every real conversation, interview, and presentation still needs, AI or not.',
    criteria: [
      { name: 'Fluency & Flow' },
      { name: 'Vocabulary Range' },
      { name: 'Coherence' },
      { name: 'Confidence & Initiative' },
      { name: 'Comprehensibility' },
    ],
    caseStudy: {
      scenario: 'Stage 1 opens with a simple prompt: talk about something that actually happened to you, out loud, like you’re telling a friend.',
      question: 'Tell me about something you did yesterday. Just talk to me like you’re telling a friend.',
      attempts: [
        {
          label: 'First attempt',
          answer: 'I go market. Buy things. Come home.',
          critique: 'Evaluation (Oral Expression)\nFluency & Flow: Emerging — Evidence: short disconnected phrases, no connecting words — Improve: Try linking your ideas with words like "then," "after that," or "because."\nCoherence: Emerging — Evidence: no detail connecting the actions — Improve: Add one small detail about what happened at each step.\nVocabulary Range: Developing — Evidence: basic words used correctly — Improve: Try a more specific word than "things."\nNext: What did you actually buy at the market, and why did you need it?',
        },
        {
          label: 'Second attempt',
          answer: 'Yesterday I went to the market to buy rice and pepper for dinner. Then I came home and started cooking before my sister got back from school.',
          whyBetter: 'The sentences now connect using "then" and give real detail — what was bought, why, what happened next — instead of three disconnected fragments. That’s what actually makes speech flow like a story instead of a list.',
          critique: 'Evaluation (Oral Expression)\nFluency & Flow: Developing — Evidence: "Then I came home and started cooking" — Improve: Try adding a reaction or feeling, not just the sequence of events.\nCoherence: Proficient — Evidence: clear cause (buying rice/pepper for dinner) and sequence — Improve: Nothing major.\nVocabulary Range: Proficient — Evidence: specific words used ("rice," "pepper," "dinner") — Improve: Nothing major.\nNext: How did you feel when your sister got home and saw dinner was already started?',
        },
        {
          label: 'Third attempt',
          answer: 'Yesterday I went to the market to buy rice and pepper for dinner, since it was my turn to cook. The market was really crowded so it took longer than I expected, but I made it home just in time and started cooking before my sister got back from school. She was surprised and happy the food was already going!',
          whyBetter: 'This version adds a real obstacle (the crowded market), a feeling (surprised and happy), and a natural close — the details that make spoken storytelling actually engaging, not just a longer list of facts.',
          critique: 'Evaluation (Oral Expression)\nFluency & Flow: Proficient — Evidence: natural narrative flow with cause, obstacle, and resolution — Improve: Nothing major.\nCoherence: Advanced — Evidence: full story arc — reason, obstacle, outcome, reaction — Improve: Nothing major.\nConfidence & Initiative: Advanced — Evidence: volunteers extra detail (sister’s reaction) without being asked — Improve: Nothing major.',
        },
      ],
    },
    pageHref: '/english-skills',
  },

  'math-skills': {
    id: 'math-skills',
    title: 'Math Skills',
    hook: 'Seven staged modules from number sense through algebra — starting with Stage 1: Counting & Number Sense, "Numbers Are Everywhere."',
    Icon: Calculator,
    stageName: 'Stage 1: Counting & Number Sense',
    stageSubtitle: 'Numbers Are Everywhere',
    levelScale: 'Emerging (0–49) → Developing (50–69) → Proficient (70–84) → Advanced (85–100)',
    whyAI: 'AI can solve almost any equation instantly — but it can’t tell you whether an answer actually makes sense, and it can quietly get something wrong with total confidence. Number sense is what lets you sanity-check an AI’s math instead of trusting it blindly, and it’s the foundation every later math skill on this site builds directly on top of.',
    criteria: [
      { name: 'Number Recognition' },
      { name: 'Counting Accuracy' },
      { name: 'Comparison & Ordering' },
      { name: 'Place Value' },
      { name: 'Skip Counting' },
    ],
    caseStudy: {
      scenario: 'The coach never just gives the answer here — it’s built to guide you to it with questions, one step at a time, even when you get stuck.',
      question: 'Here are two baskets — one has oranges you count as 1, 2, 3, 4, 5, 6, 7, and the other has 9. Which basket has more oranges, and how do you know?',
      attempts: [
        {
          label: 'First attempt',
          answer: 'The second one has more because it’s bigger.',
          critique: 'Evaluation (Counting & Number Sense)\nComparison & Ordering: Emerging — Evidence: "because it’s bigger" — Improve: Compare using the actual counted numbers (7 and 9), not the basket’s size.\nCounting Accuracy: Developing — Evidence: counted the first basket correctly (7) — Improve: State both numbers together before comparing them.\nNext: If you line up 7 oranges next to 9 oranges, one at a time, what happens at the end?',
        },
        {
          label: 'Second attempt',
          answer: 'The first basket has 7 and the second has 9. 9 is more than 7, so the second basket has more.',
          whyBetter: 'Instead of judging by the basket’s appearance, the answer now compares the actual counted numbers — that’s the real skill, not guessing from size.',
          critique: 'Evaluation (Counting & Number Sense)\nComparison & Ordering: Proficient — Evidence: "9 is more than 7" — Improve: Explain how you know 9 is more than 7, not just that it is.\nNumber Recognition: Proficient — Evidence: correctly identified both quantities — Improve: Nothing major.\nNext: How many more oranges does the second basket have than the first?',
        },
        {
          label: 'Third attempt',
          answer: 'The first basket has 7 and the second has 9. 9 is more than 7 because if I count up from 7 — 8, 9 — I reach 9, so 9 comes after 7. That means the second basket has 2 more oranges than the first.',
          whyBetter: 'Now the reasoning explains HOW it knows 9 is greater — counting up from 7 — instead of just stating it, and adds the exact difference. That’s the gap between knowing an answer and understanding the number relationship behind it.',
          critique: 'Evaluation (Counting & Number Sense)\nComparison & Ordering: Advanced — Evidence: explains reasoning by counting up from 7 to 9 — Improve: Nothing major.\nSkip Counting: Proficient — Evidence: counts on by ones accurately (8, 9) — Improve: Nothing major.\nPlace Value: Proficient — Evidence: correctly finds the difference (2 more) — Improve: Nothing major.',
        },
      ],
    },
    pageHref: '/math-skills',
  },

  'science-skills': {
    id: 'science-skills',
    title: 'Science Skills',
    hook: 'Five Scientific Reasoning stages open the door to Life Sciences and Physical Sciences pathways — starting with Stage 1: Observation & Questioning, "See the World Like a Scientist."',
    Icon: Atom,
    stageName: 'Stage 1: Observation & Questioning',
    stageSubtitle: 'See the World Like a Scientist',
    levelScale: 'Emerging → Developing → Proficient → Advanced',
    whyAI: 'AI can generate a confident-sounding scientific explanation for almost anything, right or wrong, in seconds. The habit of turning a real observation into a real, testable question is what separates actually understanding the world from just accepting whatever an AI says about it.',
    criteria: [
      { name: 'Observation Precision' },
      { name: 'Question Formation' },
      { name: 'Scientific vs Non-Scientific Questions' },
      { name: 'Detail & Specificity' },
    ],
    caseStudy: {
      scenario: 'Stage 1 starts with the most basic scientific habit there is: actually noticing something specific, then turning it into a question worth investigating.',
      question: 'Look around you right now — or think back to today. What’s one thing you noticed that made you curious?',
      attempts: [
        {
          label: 'First attempt',
          answer: 'I noticed the sky.',
          critique: 'Evaluation (Observation & Questioning)\nObservation Precision: Emerging — Evidence: "I noticed the sky" — Improve: What specifically about the sky — color, clouds, something changing?\nDetail & Specificity: Emerging — Evidence: no specific detail given — Improve: Describe exactly what you saw, not the general category.\nNext: What did you notice about the sky that was different from a normal day?',
        },
        {
          label: 'Second attempt',
          answer: 'I noticed the sky got really dark and cloudy in the afternoon, even though it was sunny in the morning.',
          whyBetter: 'This is now a specific, observable change — sunny morning to dark, cloudy afternoon — instead of a vague category like "the sky." That’s an actual observation, something you could point to and describe to someone else.',
          critique: 'Evaluation (Observation & Questioning)\nObservation Precision: Proficient — Evidence: "sunny in the morning" vs "dark and cloudy in the afternoon" — Improve: Turn this observation into a real question you could investigate.\nQuestion Formation: Emerging — Evidence: no question asked yet, only a description — Improve: Ask "why" or "what caused" something about this change.\nNext: What question could you ask about why the sky changed so quickly?',
        },
        {
          label: 'Third attempt',
          answer: 'I noticed the sky went from sunny to dark and cloudy really fast in the afternoon. That makes me wonder: does the sky usually change that fast before it rains, or was today unusual? I could check by watching the sky at the same time for the next few days and writing down what I see.',
          whyBetter: 'The observation now turns into an actual testable question — does this happen before rain, and was today typical — plus a real way to find out. That’s the difference between just noticing something and doing the beginning of real science.',
          critique: 'Evaluation (Observation & Questioning)\nQuestion Formation: Advanced — Evidence: "does the sky usually change that fast before it rains" — Improve: Nothing major.\nScientific vs Non-Scientific Questions: Proficient — Evidence: proposes a way to check it, watching over several days — Improve: Nothing major.\nDetail & Specificity: Advanced — Evidence: specific, testable, time-bound observation — Improve: Nothing major.',
        },
      ],
    },
    pageHref: '/science-skills',
  },
};

/* ─────────────────────────── step builder ────────────────────────── */

function buildSteps(c: CategoryGuideContent): Step[] {
  return [
    {
      id: 'intro',
      kind: 'read',
      title: `What "${c.title}" actually means`,
      body: [
        c.hook,
        `This Guide walks through ${c.stageName} ("${c.stageSubtitle}") — the real first stage every student sees, not a simplified version made just for this Guide. This isn’t a video to watch — it’s a live, one-on-one conversation with an AI coach that asks a question, evaluates your answer, and pushes you to improve before moving on.`,
      ],
    },
    {
      id: 'why-ai',
      kind: 'read',
      title: 'Why this matters, especially with AI',
      body: [c.whyAI],
    },
    {
      id: 'rubric',
      kind: 'read',
      title: 'The exact things it’s checking for',
      body: [
        `Every response gets weighed against these sub-categories, each landing on one of four levels: ${c.levelScale}. You can only move to the next stage once every single one of these reads Proficient or better — a strong overall impression with one weak sub-category still won’t unlock the next stage.`,
      ],
      criteriaList: c.criteria,
    },
    {
      id: 'case',
      kind: 'read',
      title: 'A case in action',
      body: [c.caseStudy.scenario, 'Watch the same question answered three times, each one better than the last — and read why each improvement actually counts, not just why it’s longer.'],
      caseStudy: c.caseStudy,
    },
    {
      id: 'do-start',
      kind: 'do',
      title: `Try ${c.stageName} yourself`,
      body: [
        `Open the real page below. Every stage is actually open to you from the start — nothing needs "unlocking" — but go to ${c.stageName} first since it’s the natural starting point and matches the example you just read.`,
        'Answer honestly, in your own words. After each response, read the evaluation the same way it’s shown above, and keep refining a weak sub-category before moving on — that weak spot is what actually decides whether you can advance.',
      ],
      doLabel: `Open ${c.title}`,
      doHref: c.pageHref,
    },
    {
      id: 'scoring',
      kind: 'read',
      title: 'How it decides you’re ready to advance',
      body: [
        'Two buttons matter here: "Evaluate" checks your current level without ending the session — it needs at least a couple of real responses first — and "Save Session" saves your progress and evaluation any time, including mid-conversation.',
        'You advance to the next stage only once every sub-category above individually reads Proficient or better. A stage is fully complete once every sub-category reads Advanced.',
      ],
    },
    {
      id: 'do-finish',
      kind: 'do',
      title: 'Finish and see your level',
      body: [
        'Back in your session: once your sub-categories are looking strong, click "Evaluate" to check your level, or "Save Session" to lock in your progress.',
      ],
      doLabel: 'Back to your session',
      doHref: c.pageHref,
    },
    {
      id: 'gate',
      kind: 'gate',
      title: 'Prove it',
      body: [
        'You’ve seen three attempts get gradually better, know the exact sub-categories being checked, and know how advancing actually works. Tell us how your own session went.',
      ],
      gate: {
        label: 'What did you try, and what level did you reach?',
        placeholder: `e.g. ${c.stageName} — Proficient`,
        validate: v => {
          const s = v.trim();
          if (s.length < 10) return 'Give a little more detail — what you tried and the level you reached.';
          if (!/\s/.test(s)) return 'That looks like one word — add the level you reached.';
          return null;
        },
      },
    },
  ];
}

/* ──────────────────────────── main page ──────────────────────────── */

const FoundationsCategoryGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const content = categoryId ? CATEGORY_GUIDES[categoryId] : undefined;
  const steps = useMemo(() => (content ? buildSteps(content) : []), [content]);
  const track = content ? `foundations-guide-${content.id}` : '';

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lsKey = `tutorial:${track}`;

  useEffect(() => {
    if (!track) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const p = JSON.parse(raw);
        setDone(new Set<string>(p.completed ?? []));
        setArtifacts(p.artifacts ?? {});
      }
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey, track]);

  useEffect(() => {
    if (!userId || !track) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tutorial_progress')
        .select('completed_steps, artifacts')
        .eq('user_id', userId)
        .eq('track', track)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
      setArtifacts(prev => ({ ...(data.artifacts ?? {}), ...prev }));
    })();
    return () => { cancelled = true; };
  }, [userId, track]);

  const persist = useCallback((nextDone: Set<string>, nextArtifacts: Record<string, string>) => {
    if (!track) return;
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
        track,
        completed_steps: [...nextDone],
        artifacts: nextArtifacts,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, track, userId]);

  const firstIncompleteIndex = useMemo(() => {
    const idx = steps.findIndex(s => !done.has(s.id));
    return idx === -1 ? steps.length : idx;
  }, [steps, done]);

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

  const totalSteps = steps.length;
  const doneCount = steps.filter(s => done.has(s.id)).length;
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;
  const allDone = totalSteps > 0 && doneCount === totalSteps;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read: { badge: 'bg-slate-100 text-slate-600', label: 'Read', ring: 'border-gray-200' },
    do:   { badge: 'bg-orange-100 text-orange-800', label: 'Do', ring: 'border-orange-200' },
    gate: { badge: 'bg-cyan-100 text-cyan-800', label: 'Prove it', ring: 'border-cyan-300' },
  };

  if (!categoryId || !content) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 pb-24 pt-6 text-center">
          <p className="text-lg font-bold text-gray-900">We don’t have a Guide for that subject.</p>
          <button onClick={() => navigate('/tutorials')} className="mt-4 text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </AppLayout>
    );
  }

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
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-300">
              <content.Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">{content.title}</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                {content.stageName} — three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how you advance.
              </p>
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
              <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {!userId && (
              <p className="mt-2 text-xs text-slate-400">
                Your progress is saved on this device. Sign in to keep it across devices.
              </p>
            )}
          </div>
        </div>

        {/* steps */}
        {steps.map((step, i) => {
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

                  {step.criteriaList && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {step.criteriaList.map(cr => (
                        <span key={cr.name} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-semibold text-gray-700">
                          {cr.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {step.caseStudy && (
                    <div className="mb-3 overflow-hidden rounded-xl border border-gray-200">
                      <div className="border-b border-gray-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        Coach asks: “{step.caseStudy.question}”
                      </div>
                      <div className="space-y-3 p-4">
                        {step.caseStudy.attempts.map((a, idx) => {
                          const tone = idx === 0 ? 'red' : idx === step.caseStudy!.attempts.length - 1 ? 'green' : 'amber';
                          const toneClasses = tone === 'red'
                            ? 'border-red-200 bg-red-50 text-red-700 [&_pre]:text-red-900'
                            : tone === 'amber'
                            ? 'border-amber-200 bg-amber-50 text-amber-700 [&_pre]:text-amber-900'
                            : 'border-green-200 bg-green-50 text-green-700 [&_pre]:text-green-900';
                          return (
                            <div key={a.label}>
                              {a.whyBetter && (
                                <div className="mb-2 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                                  <span className="font-bold text-cyan-800">Why this is better: </span>{a.whyBetter}
                                </div>
                              )}
                              <div className={`rounded-lg border p-3 ${toneClasses}`}>
                                <p className="mb-1 text-xs font-bold uppercase tracking-wide">{a.label}</p>
                                <p className="mb-2 text-sm italic text-gray-800">“{a.answer}”</p>
                                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">{a.critique}</pre>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {step.aside && (
                    <div className="mb-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                      {step.aside}
                    </div>
                  )}

                  {step.kind === 'do' && step.doHref && (
                    <button
                      onClick={() => window.open(step.doHref!, '_blank', 'noopener')}
                      className="mb-3 flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-800 hover:bg-orange-100"
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
              You’ve seen gradual improvement broken down step by step, know the sub-categories being checked, and know how advancing actually works. Every later stage in {content.title} works exactly the same way.
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

export default FoundationsCategoryGuidePage;
