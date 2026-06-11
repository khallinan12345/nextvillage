// src/hooks/usePageTracking.ts
//
// Tracks page_view, page_engaged (30s), and page_exit for every route.
// Writes to system_events. Single insertion point: AppContent in App.tsx.
//
// Usage in AppContent:
//   usePageTracking(user?.id ?? null, user ? 'authenticated' : 'anon');

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

// ─── Path → human-readable page name ─────────────────────────────────────────
const PAGE_NAMES: Record<string, string> = {
  '/':                                              'public_landing',
  '/home':                                          'home',
  '/dashboard':                                     'dashboard',
  '/profile':                                       'profile',
  '/about':                                         'about',

  // Priority 1 — entry pages
  '/english-skills':                                'english_skills',
  '/learning/ai':                                   'ai_learning',

  // Priority 2
  '/tech-skills/vibe-coding':                       'vibe_coding',
  '/tech-skills/web-development':                   'web_development',
  '/tech-skills/full-stack-development':            'full_stack_development',
  '/tech-skills/ai-image-creation':                 'ai_image_creation',
  '/tech-skills/ai-voice-creation':                 'ai_voice_creation',
  '/tech-skills/ai-video-creation':                 'ai_video_creation',
  '/tech-skills/ai-video-studio':                   'ai_video_studio',
  '/tech-skills/ai-content-creation':               'ai_content_creation',
  '/tech-skills/ai-workflow-development':           'ai_workflow_dev',
  '/tech-skills/ai-for-business':                   'ai_for_business',
  '/tech-skills':                                   'tech_skills_hub',

  // Priority 3 — community impact
  '/community-impact/ai-ambassadors':               'ci_ai_ambassadors',
  '/community-impact/agriculture':                  'ci_agriculture',
  '/community-impact/fishing':                      'ci_fishing',
  '/community-impact/healthcare':                   'ci_healthcare',
  '/community-impact/entrepreneurship':             'ci_entrepreneurship',
  '/community-impact/animal-husbandry':             'ci_animal_husbandry',
  '/community-impact/ai-ambassadors/certification': 'ci_ai_ambassadors_cert',
  '/community-impact/agriculture/certification':    'ci_agriculture_cert',
  '/community-impact/fishing/certification':        'ci_fishing_cert',
  '/community-impact/healthcare/certification':     'ci_healthcare_cert',
  '/community-impact/entrepreneurship/certification':'ci_entrepreneurship_cert',

  // Challenges (high engagement)
  '/certifications/ai-proficiency':                 'cert_ai_proficiency',
  '/certifications/vibe-coding':                    'cert_vibe_coding',
  '/certifications/web-dev-certification':          'cert_web_dev',
  '/certifications/ai-ready-skills':                'cert_ai_ready_skills',

  // Research
  '/research/ai-learning-lab':                      'research_ai_lab',
  '/research/igitree':                              'research_igitree',

  // Other skills
  '/math-skills':                                   'math_skills',
  '/science-skills':                                'science_skills',
  '/learning/skills':                               'skills_development',
  '/playground':                                    'ai_playground',
};

const pageName = (pathname: string): string =>
  PAGE_NAMES[pathname] ?? `other:${pathname}`;

// ─── Supabase insert (fire-and-forget, never throws) ──────────────────────────
const logEvent = async (
  eventType: 'page_view' | 'page_exit' | 'page_engaged',
  page: string,
  userId: string | null,
  payload: Record<string, unknown>
) => {
  try {
    await supabase.from('system_events').insert({
      function_name: page,
      event_type:    eventType,
      severity:      'info',
      user_id:       userId,
      payload,
      created_at:    new Date().toISOString(),
    });
  } catch {
    // Non-critical — never surface to user
  }
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const usePageTracking = (
  userId: string | null,
  cohort?: string | null
) => {
  const location   = useLocation();
  const enteredAt  = useRef<number>(Date.now());
  const engageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPage   = useRef<string | null>(null);

  useEffect(() => {
    const page = pageName(location.pathname);
    const now  = Date.now();

    // Fire page_exit for the previous page before logging the new page_view
    if (prevPage.current) {
      const secondsOnPage = Math.round((now - enteredAt.current) / 1000);
      logEvent('page_exit', prevPage.current, userId, {
        seconds_on_page: secondsOnPage,
        next_page: page,
        cohort: cohort ?? null,
      });
    }

    // Clear any pending engagement timer from the previous page
    if (engageTimer.current) {
      clearTimeout(engageTimer.current);
      engageTimer.current = null;
    }

    // Reset entry time
    enteredAt.current = now;
    prevPage.current  = page;

    // Log page_view immediately
    logEvent('page_view', page, userId, {
      path:   location.pathname,
      cohort: cohort ?? null,
    });

    // Log page_engaged after 30 seconds (they didn't bounce)
    engageTimer.current = setTimeout(() => {
      logEvent('page_engaged', page, userId, {
        cohort: cohort ?? null,
      });
    }, 30_000);

    // On true unmount (tab close / navigate away from app entirely)
    return () => {
      if (engageTimer.current) clearTimeout(engageTimer.current);
    };
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // userId intentionally excluded — don't re-fire if auth state refreshes mid-session
};
