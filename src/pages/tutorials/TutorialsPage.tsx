// src/pages/tutorials/TutorialsPage.tsx
//
// Hub for the Tutorials tab. Tracks are step-by-step, narrated walkthroughs
// that sit *alongside* the build pages rather than replacing them — each one
// sends the student back and forth between a focused platform page and the AI
// Playground. Progress comes from `tutorial_progress` so a returning student
// lands on "continue" rather than "start".
//
// Add a track by appending to TRACKS and creating its page component.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { Fish, ArrowRight, Clock, Lock, Compass, Puzzle } from 'lucide-react';

interface Track {
  id: string;
  path: string;
  title: string;
  blurb: string;
  duration: string;
  totalSteps: number;
  tags: string[];
  available: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}

const TRACKS: Track[] = [
  {
    id: 'ai-learning-start',
    path: '/tutorials/ai-learning-start',
    title: 'Start Here: AI Learning',
    blurb:
      'New to nextVillage? Start with a guided tour of AI Learning\'s five categories — Understanding AI, Prompt Engineering, AI Ethics, Evaluating AI Outputs, and Real-World Applications. Each one comes with a few well-chosen activities to try, or you can design your own. No AI Playground needed — everything happens right on the AI Learning page.',
    duration: 'about an hour',
    totalSteps: 5,
    tags: ['AI Learning', 'Orientation'],
    available: true,
    Icon: Compass,
  },
  {
    id: 'skill-development-start',
    path: '/tutorials/skill-development-start',
    title: 'Start Here: Skill Development',
    blurb:
      'A guided tour of Skill Development\'s five skills — Digital Fluency, Critical Thinking, Problem-Solving, Creativity, and Communication. Each one comes with five activities to work through in order, or you can design your own once you\'ve finished the five. Everything happens right on the Skill Development page.',
    duration: 'about an hour',
    totalSteps: 5,
    tags: ['Skill Development', 'Orientation'],
    available: true,
    Icon: Puzzle,
  },
  {
    id: 'fish-market',
    path: '/tutorials/fish-market',
    title: 'Build a Platform',
    blurb:
      'The Fish Market Build — a pricing and sales helper for a family selling fish in the Oloibiri market, built using both nextVillage\'s own tools and Claude in the AI Playground. You build it three times: first with the no-code Website Builder, without ever seeing the code; then as a real website in Vite + React, the same format most professional sites are built on; then with a database added so it remembers prices and sales instead of forgetting them.',
    duration: 'about four weeks',
    totalSteps: 24,
    tags: ['Website Builder', 'Vite + React', 'Supabase', 'AI Playground'],
    available: true,
    Icon: Fish,
  },
];

const TutorialsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    // Local progress first so the page is useful offline and when signed out.
    const local: Record<string, number> = {};
    TRACKS.forEach(t => {
      try {
        const raw = localStorage.getItem(`tutorial:${t.id}`);
        if (raw) local[t.id] = (JSON.parse(raw).completed ?? []).length;
      } catch { /* ignore */ }
    });
    setProgress(local);

    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tutorial_progress')
        .select('track, completed_steps')
        .eq('user_id', user.id);
      if (cancelled || !data) return;
      setProgress(prev => {
        const next = { ...prev };
        data.forEach((r: { track: string; completed_steps: string[] | null }) => {
          next[r.track] = Math.max(next[r.track] ?? 0, (r.completed_steps ?? []).length);
        });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Guides</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Guided tracks that walk you through a real build, step by step. Each one moves you between
          a build page and the AI Playground — because that back-and-forth is where the skill comes from.
        </p>

        <div className="mt-8 space-y-4">
          {TRACKS.map(t => {
            const doneSteps = progress[t.id] ?? 0;
            const pct = Math.min(100, Math.round((doneSteps / t.totalSteps) * 100));
            const started = doneSteps > 0;

            return (
              <button
                key={t.id}
                onClick={() => t.available && navigate(t.path)}
                disabled={!t.available}
                className={`w-full rounded-2xl border border-gray-200 bg-white p-6 text-left transition-all ${
                  t.available ? 'hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md' : 'cursor-not-allowed opacity-60'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white">
                    {t.available ? <t.Icon className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-xl font-bold text-gray-900">{t.title}</h2>
                      <ArrowRight className="h-5 w-5 shrink-0 text-gray-300" />
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{t.blurb}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {t.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">{tag}</span>
                      ))}
                      <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3.5 w-3.5" />{t.duration}
                      </span>
                    </div>

                    {started && (
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-xs font-semibold text-gray-500">
                          <span>Continue — {doneSteps} of {t.totalSteps} steps</span><span>{pct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default TutorialsPage;
