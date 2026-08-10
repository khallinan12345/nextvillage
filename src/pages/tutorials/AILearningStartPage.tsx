// src/pages/tutorials/AILearningStartPage.tsx
//
// Orientation track for students who are new to the platform. Before this,
// a first-time student landed with no guidance on where to begin — this walks
// them through all five AI Learning categories in order, with a handful of
// well-chosen activities suggested for each plus room to design their own.
//
// Unlike the Fish Market Build, this track doesn't use the AI Playground and
// doesn't narrate or gate steps — the actual learning happens on the AI
// Learning page itself. This is just the map: five categories, five
// suggestions each, "explore this category" to open AI Learning, and a
// checkbox to mark it done. Progress uses the same tutorial_progress table
// and localStorage-first pattern as every other track (see
// FishMarketTutorialPage.tsx), just with one step per category instead of
// per fine-grained action.

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, ExternalLink, Loader2, Sparkles,
} from 'lucide-react';

const TRACK = 'ai-learning-start';

interface Category {
  id: string;
  label: string;
  hook: string;
  suggestions: string[];
}

const CATEGORIES: Category[] = [
  {
    id: 'understanding-ai',
    label: 'Understanding AI: Core Concepts & Capabilities',
    hook: 'What AI actually is, and isn’t — how it "thinks", what it gets wrong, and where it’s genuinely useful.',
    suggestions: [
      'Human or AI?',
      'AI Mythbusters',
      'AI Story Starter',
      'AI in My Community',
      'Doodle with AI (Quick, Draw!)',
    ],
  },
  {
    id: 'prompt-engineering',
    label: 'Prompt Engineering: Effective AI Communication',
    hook: 'How to ask AI for what you actually want — clear instructions get better answers, every time.',
    suggestions: [
      'Prompt Design Showcase',
      'Debug the Prompt',
      'Prompt Improvement Challenge',
      'Step-by-Step Prompting',
      'Prompt the Elder',
    ],
  },
  {
    id: 'ai-ethics',
    label: 'AI Ethics & Responsible Use',
    hook: 'Where AI can go wrong — bias, fairness, and who’s responsible when it does.',
    suggestions: [
      'Bias Busters',
      'AI Dilemmas Discussion',
      'Create an AI Code of Ethics',
      'AI Ethics Stakeholder Debate',
      'The Unfair Robot',
    ],
  },
  {
    id: 'evaluating-outputs',
    label: 'Evaluating AI Outputs: Critical Analysis',
    hook: 'AI sounds confident even when it’s wrong — how to check its work before you trust it.',
    suggestions: [
      'AI Fact-Checker',
      'AI Fact-Checking Investigation',
      'Critique and Improve Challenge',
      'AI vs Expert Comparison',
      'AI Response Quality Check',
    ],
  },
  {
    id: 'applications',
    label: 'Real-World Applications & Problem Solving',
    hook: 'Putting it together — using AI to build something that solves a real problem in your community.',
    suggestions: [
      'AI Platform for Community Impact',
      'Community Garden Planner',
      'Mental Health Tracker',
      'AI-Powered Study Helper',
      'Code Learning Game',
    ],
  },
];

const TOTAL_STEPS = CATEGORIES.length;

const AILearningStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [openCategory, setOpenCategory] = useState<string>(CATEGORIES[0].id);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lsKey = `tutorial:${TRACK}`;

  /* ── load progress: localStorage first (instant, offline), then Supabase ── */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) setDone(new Set<string>(JSON.parse(raw).completed ?? []));
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tutorial_progress')
        .select('completed_steps')
        .eq('user_id', userId)
        .eq('track', TRACK)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback((nextDone: Set<string>) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({ completed: [...nextDone], updated: Date.now() }));
    } catch { /* private browsing, quota — progress still works in memory */ }
    if (!userId) return;
    setSyncing(true);
    supabase
      .from('tutorial_progress')
      .upsert({
        user_id: userId,
        track: TRACK,
        completed_steps: [...nextDone],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, userId]);

  const toggleDone = (categoryId: string) => {
    const next = new Set(done);
    if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
    setDone(next);
    persist(next);
  };

  const openAILearning = (categoryId: string) => {
    const next = new Set(done);
    next.add(categoryId);
    setDone(next);
    persist(next);
    navigate('/learning/ai');
  };

  const doneCount = done.size;
  const pct = Math.min(100, Math.round((doneCount / TOTAL_STEPS) * 100));

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
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Orientation</p>
          <h1 className="mt-1 text-3xl font-extrabold">Start Here: AI Learning</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            A map of AI Learning's five categories, with a few good activities suggested in each —
            or design your own. No AI Playground needed; everything here happens on the AI Learning page.
          </p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {TOTAL_STEPS} categories explored</span>
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

        {/* categories */}
        {CATEGORIES.map((cat, i) => {
          const open = openCategory === cat.id;
          const isDone = done.has(cat.id);

          return (
            <div key={cat.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => setOpenCategory(open ? '' : cat.id)}
                className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-gray-50"
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  isDone ? 'bg-green-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  {isDone ? <Check className="h-6 w-6" /> : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-gray-900">{cat.label}</h2>
                  <p className="truncate text-sm text-gray-500">{cat.hook}</p>
                </div>
                {open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
              </button>

              {open && (
                <div className="border-t border-gray-100 p-5">
                  <p className="mb-3 text-sm text-gray-600">{cat.hook}</p>

                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">A few good places to start</p>
                  <ul className="mb-4 space-y-1.5">
                    {cat.suggestions.map(s => (
                      <li key={s} className="flex items-center gap-2 text-sm text-gray-700">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        {s}
                      </li>
                    ))}
                    <li className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                      Or design your own activity in this category
                    </li>
                  </ul>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => openAILearning(cat.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-600"
                    >
                      Open AI Learning <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleDone(cat.id)}
                      className="text-sm font-semibold text-gray-500 hover:text-gray-800"
                    >
                      {isDone ? 'Mark as not yet explored' : 'Mark this category explored'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {doneCount === TOTAL_STEPS && (
          <div className="mt-2 rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <p className="font-bold text-green-800">You've explored all five categories.</p>
            <p className="mt-1 text-sm text-green-700">
              Ready to build something real? Try the Fish Market Build next.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button onClick={() => navigate('/tutorials')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800">
            <Compass className="h-4 w-4" /> All tutorials
          </button>
          <Link to="/learning/ai" className="text-sm font-semibold text-amber-600 hover:text-amber-700">
            Go straight to AI Learning →
          </Link>
        </div>
      </div>
    </AppLayout>
  );
};

export default AILearningStartPage;
