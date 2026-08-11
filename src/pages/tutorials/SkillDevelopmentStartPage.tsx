// src/pages/tutorials/SkillDevelopmentStartPage.tsx
//
// Orientation track for the Skill Development page, mirroring
// AILearningStartPage.tsx's locked-map pattern but for `/learning/skills`
// instead of `/learning/ai`. Walks a new learner through five skills —
// Digital Fluency, Critical Thinking, Problem-Solving, Creativity, and
// Communication — five activities each, locked in order.
//
// Unlike AI Learning's curated titles (which are generic and get the same
// title cloned per city), Skills content is hand-localized per city with
// entirely different titles from one city to the next — there's no shared
// title list to hardcode. So instead of a fixed `suggestions: string[]`,
// this page fetches the signed-in student's city_town's own `learning_modules`
// catalog for `category = 'Skills'`, groups by sub_category, and takes the
// first five per skill (alphabetical, for a stable order) as the suggested
// activities. A skill with no rows in the student's city is treated as
// automatically complete — nothing to block on — so it doesn't dead-end the
// sequence, same non-blocking philosophy as an individual unavailable title
// on the AI Learning track.
//
// Progression is gated by real proficiency, not self-reporting: activity N+1
// in a skill stays locked until activity N has been scored Proficient or
// better on the Skill Development page, and skill N+1 stays locked until
// every activity in skill N is Proficient.
//
// Doesn't use the AI Playground — the actual practice and evaluation happens
// on the Skill Development page; this is the locked map plus the deep links
// into it (see SkillsDevelopmentPage.tsx's ?activity=/?create= handling).

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, Lock, Loader2, PlayCircle, Sparkles,
} from 'lucide-react';

const TUTORIAL_VIDEO_URL = 'https://www.youtube.com/watch?v=4arYya6dZWM&t=84s';

const TRACK = 'skill-development-start';
const ACTIVITIES_PER_SKILL = 5;

interface Skill {
  id: string;
  label: string;
  hook: string;
  subCategory: string;
}

const SKILLS: Skill[] = [
  {
    id: 'digital-fluency',
    label: 'Digital Fluency',
    hook: 'Navigating digital tools and AI systems confidently — the everyday tech skills everything else builds on.',
    subCategory: 'Digital Fluency',
  },
  {
    id: 'critical-thinking',
    label: 'Critical Thinking',
    hook: 'Evaluating claims, weighing evidence, and building a sound argument instead of taking things at face value.',
    subCategory: 'Critical Thinking',
  },
  {
    id: 'problem-solving',
    label: 'Problem-Solving',
    hook: 'Designing, testing, and refining a solution to a real, messy problem — not just the textbook version.',
    subCategory: 'Problem-Solving',
  },
  {
    id: 'creativity',
    label: 'Creativity',
    hook: 'Generating original ideas and inventive solutions, not just the first answer that comes to mind.',
    subCategory: 'Creativity',
  },
  {
    id: 'communication',
    label: 'Communication',
    hook: 'Explaining ideas clearly and persuasively so they land with a real audience.',
    subCategory: 'Communication',
  },
];

const TOTAL_STEPS = SKILLS.length;

// dashboard.certification_evaluation_score is usually 0–3, occasionally an
// older 0–100 percentage — same normalization AILearningStartPage uses.
// 2 = Proficient, 3 = Advanced; both count as "passed" for gating.
function isProficient(score: number | null | undefined): boolean {
  if (score == null) return false;
  let n = score;
  if (n > 3) n = n <= 25 ? 0 : n <= 50 ? 1 : n <= 75 ? 2 : 3;
  return n >= 2;
}

interface SkillActivity {
  learning_module_id: string;
  title: string;
}

type ActivityStatus = 'proficient' | 'available' | 'locked';

const SkillDevelopmentStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const [openSkill, setOpenSkill] = useState<string>(SKILLS[0].id);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // sub_category -> first five learning_modules rows for this student's city
  const [activitiesBySkill, setActivitiesBySkill] = useState<Record<string, SkillActivity[]>>({});
  // learning_module_id -> certification_evaluation_score
  const [scoreMap, setScoreMap] = useState<Record<string, number | null>>({});

  /* ── resolve this student's city, then load each skill's first five activities and this student's scores on them ── */

  useEffect(() => {
    if (!userId) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase.from('profiles').select('city').eq('id', userId).single();
      const city = profile?.city ?? null;
      const cityTown = city === 'Ibiade' ? 'Ibiade' : city === 'Dayton' ? 'Dayton' : 'Oloibiri';

      const { data: modules } = await supabase
        .from('learning_modules')
        .select('learning_module_id, title, sub_category')
        .eq('category', 'Skills')
        .eq('city_town', cityTown)
        .eq('public', 1)
        .in('sub_category', SKILLS.map(s => s.subCategory))
        .order('sub_category', { ascending: true })
        .order('title', { ascending: true });
      if (cancelled) return;

      const bySkill: Record<string, SkillActivity[]> = {};
      (modules ?? []).forEach(m => {
        if (!m.sub_category) return;
        const list = bySkill[m.sub_category] ?? (bySkill[m.sub_category] = []);
        if (list.length < ACTIVITIES_PER_SKILL) {
          list.push({ learning_module_id: m.learning_module_id, title: m.title });
        }
      });
      setActivitiesBySkill(bySkill);

      const moduleIds = Object.values(bySkill).flat().map(a => a.learning_module_id);
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

  const activitiesFor = useCallback((skill: Skill): SkillActivity[] =>
    activitiesBySkill[skill.subCategory] ?? [], [activitiesBySkill]);

  const scoreFor = useCallback((skill: Skill, idx: number): number | null =>
    scoreMap[activitiesFor(skill)[idx]?.learning_module_id] ?? null, [activitiesFor, scoreMap]);

  // A skill with no activities catalogued for this student's city has
  // nothing to block on — treated as complete, same as an individual
  // unavailable title on the AI Learning track.
  const skillComplete = useCallback((skill: Skill): boolean => {
    const activities = activitiesFor(skill);
    return activities.length === 0 || activities.every((_, i) => isProficient(scoreFor(skill, i)));
  }, [activitiesFor, scoreFor]);

  const skillUnlocked = (skillIndex: number): boolean =>
    skillIndex === 0 || skillComplete(SKILLS[skillIndex - 1]);

  // Index of the first activity that isn't proficient. Same cumulative
  // pattern AILearningStartPage and FishMarketTutorialPage use for locking:
  // everything up through this index is reachable, nothing after it is.
  const firstIncompleteIndex = useCallback((skill: Skill): number => {
    const activities = activitiesFor(skill);
    const idx = activities.findIndex((_, i) => !isProficient(scoreFor(skill, i)));
    return idx === -1 ? activities.length : idx;
  }, [activitiesFor, scoreFor]);

  const activityStatus = (skill: Skill, idx: number): ActivityStatus => {
    const score = scoreFor(skill, idx);
    if (isProficient(score)) return 'proficient';
    return idx <= firstIncompleteIndex(skill) ? 'available' : 'locked';
  };

  /* ── mirror skill-complete set into tutorial_progress, same as every other track ── */

  useEffect(() => {
    if (!loaded || !userId) return;
    const completed = SKILLS.filter(skillComplete).map(s => s.id);
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
  }, [loaded, userId, skillComplete]);

  const doneCount = SKILLS.filter(skillComplete).length;
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
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-purple-900 to-slate-800 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Orientation</p>
          <h1 className="mt-1 text-3xl font-extrabold">Start Here: Skill Development</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            Five skills, five activities each. Score Proficient or better on an activity to unlock
            the next one — finish all five in a skill to unlock the next skill.
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
              <span>{doneCount} of {TOTAL_STEPS} skills complete</span>
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

        {/* skills */}
        {SKILLS.map((skill, skillIdx) => {
          const unlocked = skillUnlocked(skillIdx);
          const complete = skillComplete(skill);
          const activities = activitiesFor(skill);
          const open = unlocked && openSkill === skill.id;

          return (
            <div key={skill.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => unlocked && setOpenSkill(open ? '' : skill.id)}
                disabled={!unlocked}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${unlocked ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  complete ? 'bg-green-600 text-white' : unlocked ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}>
                  {complete ? <Check className="h-6 w-6" /> : unlocked ? skillIdx + 1 : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-gray-900">{skill.label}</h2>
                  <p className="truncate text-sm text-gray-500">{skill.hook}</p>
                  {!unlocked && <p className="mt-1 text-xs font-semibold text-gray-400">Finish the previous skill to unlock</p>}
                </div>
                {unlocked && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 p-5">
                  <p className="mb-3 text-sm text-gray-600">{skill.hook}</p>

                  {activities.length === 0 ? (
                    <p className="mb-2 text-sm text-gray-400">No activities are catalogued for your region yet — this skill is skipped for now.</p>
                  ) : (
                    <>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Score Proficient to unlock the next one</p>
                      <ul className="mb-4 space-y-1.5">
                        {activities.map((a, i) => {
                          const status = activityStatus(skill, i);

                          if (status === 'proficient' || status === 'available') {
                            return (
                              <li key={a.learning_module_id}>
                                <Link
                                  to={`/learning/skills?activity=${encodeURIComponent(a.title)}&subCategory=${encodeURIComponent(skill.subCategory)}`}
                                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-amber-700 hover:underline"
                                >
                                  {status === 'proficient'
                                    ? <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                                    : <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                                  {a.title}
                                </Link>
                              </li>
                            );
                          }

                          return (
                            <li key={a.learning_module_id} className="flex items-center gap-2 text-sm text-gray-400">
                              <Lock className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                              {a.title} <span className="text-xs">— score Proficient on "{activities[firstIncompleteIndex(skill)]?.title}" first</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}

                  {complete ? (
                    <Link
                      to={`/learning/skills?create=1&category=${skill.id}`}
                      className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-cyan-700 hover:underline"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                      Or design your own activity in this skill
                    </Link>
                  ) : activities.length > 0 && (
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-400">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                      Design your own — unlocks once the five above are Proficient
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {doneCount === TOTAL_STEPS && (
          <div className="mt-2 rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <p className="font-bold text-green-800">You've completed all five skills.</p>
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

export default SkillDevelopmentStartPage;
