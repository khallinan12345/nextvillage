// src/pages/tutorials/AILearningStartPage.tsx
//
// Orientation track for students who are new to the platform. Before this,
// a first-time student landed with no guidance on where to begin — this walks
// them through all five AI Learning categories in order, with five
// well-chosen activities suggested per category plus room to design their
// own.
//
// Progression is gated by real proficiency, not self-reporting: activity N+1
// in a category stays locked until activity N has been scored Proficient or
// better on the AI Learning page, and category N+1 stays locked until every
// suggested activity in category N is Proficient. "Design your own" is a
// bonus once a category's five are done — it doesn't gate anything itself,
// since a student can create any number of these and there's no single
// canonical one to check.
//
// Doesn't use the AI Playground — the actual learning and evaluation happens
// on the AI Learning page; this is the locked map plus the deep links into it
// (see AILearningPage.tsx's ?activity=/?create= handling).
//
// Scores come from `dashboard.certification_evaluation_score`, keyed by
// learning_module_id — and that id is different per city_town (Oloibiri /
// Dayton / Ibiade both have their own row for the same activity title). So
// on load this resolves the signed-in student's city, looks up the matching
// learning_modules rows for our curated titles, then fetches this student's
// dashboard scores for exactly those rows. A title with no row in the
// student's city is treated as unavailable — it doesn't block the sequence.

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, Lock, Loader2, PlayCircle, Sparkles,
} from 'lucide-react';

const TUTORIAL_VIDEO_URL = 'https://www.youtube.com/watch?v=LwxDIOKXdjI&list=PLfJ-ns8nm2_IPEt1QpUc8zL4es8zbGvYF&index=4';

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

// dashboard.certification_evaluation_score is usually 0–3, occasionally an
// older 0–100 percentage — same normalization AILearningPage uses.
// 2 = Proficient, 3 = Advanced; both count as "passed" for gating.
function isProficient(score: number | null | undefined): boolean {
  if (score == null) return false;
  let n = score;
  if (n > 3) n = n <= 25 ? 0 : n <= 50 ? 1 : n <= 75 ? 2 : 3;
  return n >= 2;
}

const moduleKey = (subCategory: string, title: string) => `${subCategory}::${title}`;

type ActivityStatus = 'proficient' | 'available' | 'locked' | 'unavailable';

const AILearningStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const [openCategory, setOpenCategory] = useState<string>(CATEGORIES[0].id);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // "subCategory::title" -> learning_module_id, resolved to this student's city
  const [moduleMap, setModuleMap] = useState<Record<string, string>>({});
  // learning_module_id -> certification_evaluation_score
  const [scoreMap, setScoreMap] = useState<Record<string, number | null>>({});

  /* ── resolve this student's city, then their score on each suggested activity ── */

  useEffect(() => {
    if (!userId) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase.from('profiles').select('city').eq('id', userId).single();
      const city = profile?.city ?? null;
      const cityTown = city === 'Ibiade' ? 'Ibiade' : city === 'Dayton' ? 'Dayton' : 'Oloibiri';

      const allTitles = CATEGORIES.flatMap(c => c.suggestions);
      const { data: modules } = await supabase
        .from('learning_modules')
        .select('learning_module_id, title, sub_category')
        .eq('category', 'AI Proficiency')
        .eq('city_town', cityTown)
        .in('title', allTitles);
      if (cancelled) return;

      const mMap: Record<string, string> = {};
      (modules ?? []).forEach(m => { mMap[moduleKey(m.sub_category, m.title)] = m.learning_module_id; });
      setModuleMap(mMap);

      const moduleIds = Object.values(mMap);
      if (moduleIds.length > 0) {
        const { data: dash } = await supabase
          .from('dashboard')
          .select('learning_module_id, certification_evaluation_score')
          .eq('user_id', userId)
          .in('learning_module_id', moduleIds);
        if (cancelled) return;
        const sMap: Record<string, number | null> = {};
        // certification_evaluation_score is Postgres `numeric`, which
        // supabase-js returns as a string (e.g. "3.00") to preserve
        // precision — coerce explicitly rather than relying on JS's
        // implicit string/number comparison coercion.
        (dash ?? []).forEach(d => {
          const raw = d.certification_evaluation_score;
          sMap[d.learning_module_id] = raw == null ? null : Number(raw);
        });
        setScoreMap(sMap);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const scoreFor = useCallback((cat: Category, title: string): number | null | undefined => {
    const moduleId = moduleMap[moduleKey(cat.label, title)];
    if (!moduleId) return undefined; // not offered for this student's city — doesn't block the sequence
    return scoreMap[moduleId] ?? null;
  }, [moduleMap, scoreMap]);

  const categoryComplete = useCallback((cat: Category): boolean =>
    cat.suggestions.every(title => {
      const score = scoreFor(cat, title);
      return score === undefined || isProficient(score);
    }), [scoreFor]);

  const categoryUnlocked = (catIndex: number): boolean =>
    catIndex === 0 || categoryComplete(CATEGORIES[catIndex - 1]);

  // Index of the first suggestion that isn't proficient (or unavailable —
  // unavailable doesn't block). Same cumulative pattern FishMarketTutorialPage
  // uses for episode locking: everything up through this index is reachable,
  // nothing after it is — regardless of whether a later item happens to
  // already be proficient from something the student did independently
  // before reaching this page.
  const firstIncompleteIndex = useCallback((cat: Category): number => {
    const idx = cat.suggestions.findIndex(title => {
      const score = scoreFor(cat, title);
      return !(score === undefined || isProficient(score));
    });
    return idx === -1 ? cat.suggestions.length : idx;
  }, [scoreFor]);

  const activityStatus = (cat: Category, idx: number): ActivityStatus => {
    const title = cat.suggestions[idx];
    const score = scoreFor(cat, title);
    if (score !== undefined && isProficient(score)) return 'proficient';
    if (score === undefined) return 'unavailable';
    return idx <= firstIncompleteIndex(cat) ? 'available' : 'locked';
  };

  /* ── mirror category-complete set into tutorial_progress, same as every other track ── */

  useEffect(() => {
    if (!loaded || !userId) return;
    const completed = CATEGORIES.filter(categoryComplete).map(c => c.id);
    try {
      localStorage.setItem(`tutorial:${TRACK}`, JSON.stringify({ completed, updated: Date.now() }));
    } catch { /* private browsing, quota — not worth failing over */ }
    setSyncing(true);
    supabase
      .from('tutorial_progress')
      .upsert({
        user_id: userId,
        track: TRACK,
        completed_steps: completed,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [loaded, userId, categoryComplete]);

  const doneCount = CATEGORIES.filter(categoryComplete).length;
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
            Five categories, five activities each. Score Proficient or better on an activity to unlock
            the next one — finish all five in a category to unlock the next category.
          </p>

          <a
            href={TUTORIAL_VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700"
          >
            <PlayCircle className="h-4 w-4" /> How to Do a Session
          </a>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {TOTAL_STEPS} categories complete</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* categories */}
        {CATEGORIES.map((cat, catIdx) => {
          const unlocked = categoryUnlocked(catIdx);
          const complete = categoryComplete(cat);
          const open = unlocked && openCategory === cat.id;

          return (
            <div key={cat.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => unlocked && setOpenCategory(open ? '' : cat.id)}
                disabled={!unlocked}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${unlocked ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  complete ? 'bg-green-600 text-white' : unlocked ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}>
                  {complete ? <Check className="h-6 w-6" /> : unlocked ? catIdx + 1 : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-gray-900">{cat.label}</h2>
                  <p className="truncate text-sm text-gray-500">{cat.hook}</p>
                  {!unlocked && <p className="mt-1 text-xs font-semibold text-gray-400">Finish the previous category to unlock</p>}
                </div>
                {unlocked && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 p-5">
                  <p className="mb-3 text-sm text-gray-600">{cat.hook}</p>

                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Score Proficient to unlock the next one</p>
                  <ul className="mb-4 space-y-1.5">
                    {cat.suggestions.map((s, i) => {
                      const status = activityStatus(cat, i);

                      if (status === 'proficient' || status === 'available') {
                        return (
                          <li key={s}>
                            <Link
                              to={`/learning/ai?activity=${encodeURIComponent(s)}&subCategory=${encodeURIComponent(cat.label)}`}
                              className="flex items-center gap-2 text-sm text-gray-700 hover:text-amber-700 hover:underline"
                            >
                              {status === 'proficient'
                                ? <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                                : <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                              {s}
                            </Link>
                          </li>
                        );
                      }

                      if (status === 'unavailable') {
                        return (
                          <li key={s} className="flex items-center gap-2 text-sm text-gray-400">
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                            {s} <span className="text-xs">(not offered in your region)</span>
                          </li>
                        );
                      }

                      return (
                        <li key={s} className="flex items-center gap-2 text-sm text-gray-400">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                          {s} <span className="text-xs">— score Proficient on "{cat.suggestions[firstIncompleteIndex(cat)]}" first</span>
                        </li>
                      );
                    })}
                    <li>
                      {complete ? (
                        <Link
                          to={`/learning/ai?create=1&category=${cat.id}`}
                          className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-cyan-700 hover:underline"
                        >
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                          Or design your own activity in this category
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-400">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                          Design your own — unlocks once the five above are Proficient
                        </div>
                      )}
                    </li>
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        {doneCount === TOTAL_STEPS && (
          <div className="mt-2 rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <p className="font-bold text-green-800">You've completed all five categories.</p>
            <p className="mt-1 text-sm text-green-700">
              Ready to build something real? Try the Fish Market Build next.
            </p>
          </div>
        )}

        <div className="mt-6">
          <button onClick={() => navigate('/tutorials')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800">
            <Compass className="h-4 w-4" /> All guides
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default AILearningStartPage;
