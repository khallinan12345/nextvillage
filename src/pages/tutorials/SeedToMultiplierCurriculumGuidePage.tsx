// src/pages/tutorials/SeedToMultiplierCurriculumGuidePage.tsx
// Displayed to learners as "The Core Path".
//
// The platform's first structured Curriculum: a single ordered path from
// AI Foundations through a Full-Stack capstone, based on the "Seed to
// Multiplier" program-strategy document (Track A: publish the path before
// building the engineering behind it — see /docs for the source plan). This
// is the curriculum every learner is meant to follow right after onboarding.
//
// Unlike the AI Learning / Skill Development "Start Here" tracks (which gate
// on individual activity scores), each step here is gated on an actual
// PASSED CERTIFICATION EXAM — read from the shared `evaluations` table that
// every certification page already dual-writes to (src/lib/evaluations.ts).
// A step is "passed" once its certification's overall_score reaches
// Proficient (>= 2 out of a 3-point rubric), the same threshold used
// platform-wide. No new schema, no new certification mechanism — this reuses
// the five certification exams that already exist, in a fixed order.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Award, Check, ChevronDown, ChevronRight, GraduationCap, Loader2, Lock, Map, Sparkles,
} from 'lucide-react';

const TRACK = 'seed-to-multiplier-curriculum';

interface Phase {
  id: string;
  activityType: string;   // evaluations.activity_type this phase's certification writes to
  title: string;
  weeks: string;
  hook: string;
  certPath: string;
  certLabel: string;
}

const PHASES: Phase[] = [
  {
    id: 'ai-foundations',
    activityType: 'ai_learning_certification',
    title: 'AI Foundations',
    weeks: 'Weeks 1–2',
    hook: 'What AI actually is, how to prompt it well, and where it goes wrong — the AI Proficiency certification.',
    certPath: '/certifications/ai-proficiency',
    certLabel: 'Take the AI Proficiency Certification',
  },
  {
    id: 'ai-ready-skills',
    activityType: 'ai_ready_skills_certification',
    title: 'AI-Ready Skills',
    weeks: 'Weeks 3–4',
    hook: 'Critical thinking, creativity, communication, problem-solving, and digital fluency with AI as a working partner.',
    certPath: '/certifications/ai-ready-skills',
    certLabel: 'Take the AI Ready Skills Certification',
  },
  {
    id: 'vibe-coding',
    activityType: 'vibe_coding_certification',
    title: 'Vibe Coding',
    weeks: 'Weeks 5–7',
    hook: 'Design → Generate → Test → Refine — building real software with AI as a coding partner, not a shortcut.',
    certPath: '/certifications/vibe-coding',
    certLabel: 'Take the Vibe Coding Certification',
  },
  {
    id: 'web-development',
    activityType: 'web_dev_certification',
    title: 'Web Development',
    weeks: 'Weeks 8–9',
    hook: 'A real React + Supabase site, built and evaluated against professional rubric criteria.',
    certPath: '/certifications/web-dev-certification',
    certLabel: 'Take the Web Development Certification',
  },
  {
    id: 'capstone',
    activityType: 'full_stack_certification',
    title: 'Full-Stack Capstone — the Exam Gate',
    weeks: 'Week 10',
    hook: 'A complete full-stack build, evaluated closed-book — the gate into Builder on the Community Impact tier ladder.',
    certPath: '/certifications/full-stack-certification',
    certLabel: 'Take the Full-Stack Certification',
  },
];

const PROFICIENT = 2; // same threshold as isProficient() elsewhere: 2 out of a 3-point rubric

const SeedToMultiplierCurriculumGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const [openPhase, setOpenPhase] = useState<string>(PHASES[0].id);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // activity_type -> { overallScore, maxScore }
  const [scoreMap, setScoreMap] = useState<Record<string, { score: number; max: number }>>({});

  useEffect(() => {
    if (!userId) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('evaluations')
        .select('activity_type, overall_score, max_score')
        .eq('user_id', userId)
        .in('activity_type', PHASES.map(p => p.activityType));
      if (cancelled) return;

      const sMap: Record<string, { score: number; max: number }> = {};
      (data ?? []).forEach(row => {
        sMap[row.activity_type] = { score: Number(row.overall_score), max: Number(row.max_score) || 3 };
      });
      setScoreMap(sMap);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const passed = useCallback((phase: Phase): boolean => {
    const s = scoreMap[phase.activityType];
    return !!s && s.score >= PROFICIENT;
  }, [scoreMap]);

  const unlocked = (idx: number): boolean => idx === 0 || passed(PHASES[idx - 1]);

  /* ── mirror progress into tutorial_progress, same as every other guide track ── */

  useEffect(() => {
    if (!loaded || !userId) return;
    const completed = PHASES.filter(passed).map(p => p.id);
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
  }, [loaded, userId, passed]);

  const doneCount = PHASES.filter(passed).length;
  const pct = Math.min(100, Math.round((doneCount / PHASES.length) * 100));

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
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-emerald-950 to-emerald-800 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Curriculum</p>
          <h1 className="mt-1 text-3xl font-extrabold">The Core Path</h1>
          <p className="mt-1 max-w-xl text-sm text-emerald-100">
            This is the path every learner follows after onboarding — one ordered curriculum, five
            certification exams. Pass each one — score Proficient or better — to unlock the next step.
            No exam, no advancement.
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-sm text-emerald-50">
            <Map className="h-4 w-4 shrink-0" />
            <span>10 weeks, enrollment to certification — the pilot schedule this path is built from.</span>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-emerald-200">
              <span>{doneCount} of {PHASES.length} certifications passed</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-emerald-950/60">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-300 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* phases */}
        {PHASES.map((phase, idx) => {
          const isUnlocked = unlocked(idx);
          const isPassed = passed(phase);
          const open = isUnlocked && openPhase === phase.id;
          const isCapstone = phase.id === 'capstone';

          return (
            <div key={phase.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => isUnlocked && setOpenPhase(open ? '' : phase.id)}
                disabled={!isUnlocked}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${isUnlocked ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  isPassed ? 'bg-emerald-600 text-white' : isUnlocked ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}>
                  {isPassed ? <Check className="h-6 w-6" /> : isUnlocked ? idx + 1 : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900">{phase.title}</h2>
                    {isCapstone && <Award className="h-4 w-4 text-amber-500" />}
                  </div>
                  <p className="truncate text-sm text-gray-500">{phase.hook}</p>
                  {!isUnlocked && (
                    <p className="mt-1 text-xs font-semibold text-gray-400">
                      Pass {PHASES[idx - 1].title}'s certification to unlock
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-semibold text-gray-400">{phase.weeks}</span>
                {isUnlocked && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                  <p className="mb-4 text-sm text-gray-600">{phase.hook}</p>

                  {isPassed ? (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                      <span className="font-semibold">Certification passed.</span>{' '}
                      {isCapstone
                        ? "You've cleared the exam gate — the path is complete."
                        : `On to ${PHASES[idx + 1].title}.`}
                    </div>
                  ) : (
                    <button
                      onClick={() => navigate(phase.certPath)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-800"
                    >
                      <GraduationCap className="h-4 w-4" /> {phase.certLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* capstone note */}
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-900">
            Passing the Full-Stack capstone is this path's exam gate — the same role the Community Impact
            programs' <span className="font-semibold">Builder</span> tier plays on the Seed → Scout → Bridge
            → Builder → Multiplier ladder. This path doesn't invent a second badge system; it climbs the one
            that already exists.
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default SeedToMultiplierCurriculumGuidePage;
