// src/pages/tutorials/TutorialsPage.tsx
//
// Hub for the Tutorials tab. Tracks are step-by-step, narrated walkthroughs
// that sit *alongside* the build pages rather than replacing them — each one
// sends the student back and forth between a focused platform page and the AI
// Playground. Progress comes from `tutorial_progress` so a returning student
// lands on "continue" rather than "start".
//
// Guides are grouped into CATEGORIES (below) and shown as a collapsible
// accordion, since the number of guides keeps growing. Add a track by
// appending to TRACKS with a `category` and creating its page component;
// add a whole new category by appending to CATEGORIES.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Fish, ArrowRight, Clock, Lock, Compass, Puzzle, GitBranch,
  Search, ChevronDown, ChevronUp, BookOpen, Code2, Users, Settings, X, Wand2, Database,
  Brain, Edit, Eye, Shield, Monitor, Lightbulb, MessageSquare, GraduationCap, Calculator, Atom,
  Palette, Image, Mic, Video as VideoIcon, Clapperboard, FileText, Gamepad2, PenLine,
  Wheat, PawPrint, Megaphone, Stethoscope, Briefcase,
} from 'lucide-react';

type CategoryId =
  | 'onboarding'
  | 'learning'
  | 'skills'
  | 'foundations'
  | 'tech-skills'
  | 'creative-ai'
  | 'community-impact'
  | 'managing-platform';

interface Category {
  id: CategoryId;
  label: string;
  blurb: string;
  Icon: React.ComponentType<{ className?: string }>;
}

// Order here is the display order.
const CATEGORIES: Category[] = [
  {
    id: 'onboarding',
    label: 'Onboarding',
    blurb: 'Camp activities — start here on day one.',
    Icon: Compass,
  },
  {
    id: 'learning',
    label: 'Learning',
    blurb: 'Deeper guides for the AI Learning track.',
    Icon: BookOpen,
  },
  {
    id: 'skills',
    label: 'Skills',
    blurb: 'Deeper guides for Skill Development.',
    Icon: Puzzle,
  },
  {
    id: 'foundations',
    label: 'Foundations',
    blurb: 'Deeper guides for English, Math, and Science Skills.',
    Icon: GraduationCap,
  },
  {
    id: 'tech-skills',
    label: 'Tech-Skills',
    blurb: 'Guides for building real projects — Website Builder, Vite + React, and beyond.',
    Icon: Code2,
  },
  {
    id: 'creative-ai',
    label: 'Creative AI',
    blurb: 'Guides for AI image, voice, video, and written content creation, and putting it all together in Video Studio or Document Studio.',
    Icon: Palette,
  },
  {
    id: 'community-impact',
    label: 'Community-Impact',
    blurb: 'Guides for the AI Ambassador and consultant tools.',
    Icon: Users,
  },
  {
    id: 'managing-platform',
    label: 'Managing the Platform',
    blurb: 'For team members maintaining nextVillage itself.',
    Icon: Settings,
  },
];

interface Track {
  id: string;
  path: string;
  title: string;
  blurb: string;
  duration: string;
  totalSteps: number;
  tags: string[];
  available: boolean;
  category: CategoryId;
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
    category: 'onboarding',
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
    category: 'onboarding',
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
    category: 'tech-skills',
    Icon: Fish,
  },
  {
    id: 'vibe-coding-guide',
    path: '/tutorials/vibe-coding',
    title: 'Vibe Code Something Real',
    blurb:
      'Describe an app in plain language and let AI write it — but with a twist: before any code exists, an AI critique tells you exactly what you left vague. One real pass through all four phases of the Vibe Coding page: write instructions, get critiqued, generate and run the code, then debug it together.',
    duration: 'about 90 minutes',
    totalSteps: 14,
    tags: ['Vibe Coding', 'AI Playground'],
    available: true,
    category: 'tech-skills',
    Icon: Wand2,
  },
  {
    id: 'supabase-database-guide',
    path: '/tutorials/supabase-database',
    title: 'Building a Real Database in Supabase',
    blurb:
      'Create a free Supabase account, then build a real Postgres database entirely by hand — create a table, explore and change it with SQL, load real sales data from a downloadable CSV file, and lock it down with Row Level Security, learning what RLS actually does along the way.',
    duration: 'about 2 hours',
    totalSteps: 21,
    tags: ['Supabase', 'SQL', 'AI Playground'],
    available: true,
    category: 'tech-skills',
    Icon: Database,
  },
  {
    id: 'create-game-guide',
    path: '/tutorials/create-game',
    title: 'Create Game',
    blurb:
      'Describe a game idea in chat, read the AI\'s verdict, ask for one specific change, and publish — the same iterative loop that makes vibe coding actually work, applied to a game only you play with clicks.',
    duration: 'about an hour',
    totalSteps: 8,
    tags: ['Create Game', 'AI Playground'],
    available: true,
    category: 'tech-skills',
    Icon: Gamepad2,
  },
  {
    id: 'ai-learning-guide-understanding-ai',
    path: '/tutorials/ai-learning/understanding-ai',
    title: 'Understanding AI',
    blurb:
      'A worked example showing a weak answer and a strong one graded side by side, the exact rubric this category checks, and how the two scoring layers actually work — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['AI Learning', 'Understanding AI'],
    available: true,
    category: 'learning',
    Icon: Brain,
  },
  {
    id: 'ai-learning-guide-prompt-engineering',
    path: '/tutorials/ai-learning/prompt-engineering',
    title: 'Prompt Engineering',
    blurb:
      'A worked example showing a weak prompt and a strong one graded side by side, the exact rubric this category checks, and how the two scoring layers actually work — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['AI Learning', 'Prompt Engineering'],
    available: true,
    category: 'learning',
    Icon: Edit,
  },
  {
    id: 'ai-learning-guide-evaluating-outputs',
    path: '/tutorials/ai-learning/evaluating-outputs',
    title: 'Evaluating AI Outputs',
    blurb:
      'A worked example showing a weak answer and a strong one graded side by side, the exact rubric this category checks, and how the two scoring layers actually work — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['AI Learning', 'Evaluating Outputs'],
    available: true,
    category: 'learning',
    Icon: Eye,
  },
  {
    id: 'ai-learning-guide-ai-ethics',
    path: '/tutorials/ai-learning/ai-ethics',
    title: 'AI Ethics & Responsible Use',
    blurb:
      'A worked example showing a weak answer and a strong one graded side by side, the exact rubric this category checks, and how the two scoring layers actually work — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['AI Learning', 'AI Ethics'],
    available: true,
    category: 'learning',
    Icon: Shield,
  },
  {
    id: 'ai-learning-guide-applications',
    path: '/tutorials/ai-learning/applications',
    title: 'AI Applications',
    blurb:
      'A worked example showing a weak answer and a strong one graded side by side, the exact rubric this category checks, and how the two scoring layers actually work — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['AI Learning', 'Applications'],
    available: true,
    category: 'learning',
    Icon: BookOpen,
  },
  {
    id: 'skill-development-guide-digital-fluency',
    path: '/tutorials/skill-development/digital-fluency',
    title: 'Digital Fluency',
    blurb:
      'Three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how your score gets calculated — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['Skill Development', 'Digital Fluency'],
    available: true,
    category: 'skills',
    Icon: Monitor,
  },
  {
    id: 'skill-development-guide-critical-thinking',
    path: '/tutorials/skill-development/critical-thinking',
    title: 'Critical Thinking',
    blurb:
      'Three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how your score gets calculated — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['Skill Development', 'Critical Thinking'],
    available: true,
    category: 'skills',
    Icon: Brain,
  },
  {
    id: 'skill-development-guide-problem-solving',
    path: '/tutorials/skill-development/problem-solving',
    title: 'Problem-Solving',
    blurb:
      'Three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how your score gets calculated — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['Skill Development', 'Problem-Solving'],
    available: true,
    category: 'skills',
    Icon: Puzzle,
  },
  {
    id: 'skill-development-guide-creativity',
    path: '/tutorials/skill-development/creativity',
    title: 'Creativity',
    blurb:
      'Three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how your score gets calculated — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['Skill Development', 'Creativity'],
    available: true,
    category: 'skills',
    Icon: Lightbulb,
  },
  {
    id: 'skill-development-guide-communication',
    path: '/tutorials/skill-development/communication',
    title: 'Communication',
    blurb:
      'Three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how your score gets calculated — before your first real session.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['Skill Development', 'Communication'],
    available: true,
    category: 'skills',
    Icon: MessageSquare,
  },
  {
    id: 'foundations-guide-english-skills',
    path: '/tutorials/foundations/english-skills',
    title: 'English Skills',
    blurb:
      'Stage 1: Oral Expression, three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how you advance to the next stage.',
    duration: 'about 25 minutes',
    totalSteps: 8,
    tags: ['Foundations', 'English Skills'],
    available: true,
    category: 'foundations',
    Icon: BookOpen,
  },
  {
    id: 'foundations-guide-math-skills',
    path: '/tutorials/foundations/math-skills',
    title: 'Math Skills',
    blurb:
      'Stage 1: Counting & Number Sense, three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how you advance to the next stage.',
    duration: 'about 25 minutes',
    totalSteps: 8,
    tags: ['Foundations', 'Math Skills'],
    available: true,
    category: 'foundations',
    Icon: Calculator,
  },
  {
    id: 'foundations-guide-science-skills',
    path: '/tutorials/foundations/science-skills',
    title: 'Science Skills',
    blurb:
      'Stage 1: Observation & Questioning, three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how you advance to the next stage.',
    duration: 'about 25 minutes',
    totalSteps: 8,
    tags: ['Foundations', 'Science Skills'],
    available: true,
    category: 'foundations',
    Icon: Atom,
  },
  {
    id: 'creative-ai-guide-ai-image-creation',
    path: '/tutorials/creative-ai/ai-image-creation',
    title: 'AI Image Creation',
    blurb:
      'A weak prompt becoming a strong one, why each change matters, and how to use the page\'s own critique tools together with Claude in the AI Playground — not instead of each other.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['Creative AI', 'AI Image Creation', 'AI Playground'],
    available: true,
    category: 'creative-ai',
    Icon: Image,
  },
  {
    id: 'creative-ai-guide-ai-voice-creation',
    path: '/tutorials/creative-ai/ai-voice-creation',
    title: 'AI Voice Creation',
    blurb:
      'A weak script becoming a strong one, why each change matters, and how to use the page\'s own critique tools together with Claude in the AI Playground — not instead of each other.',
    duration: 'about 30 minutes',
    totalSteps: 9,
    tags: ['Creative AI', 'AI Voice Creation', 'AI Playground'],
    available: true,
    category: 'creative-ai',
    Icon: Mic,
  },
  {
    id: 'creative-ai-guide-ai-video-creation',
    path: '/tutorials/creative-ai/ai-video-creation',
    title: 'AI Video Creation',
    blurb:
      'The real 6/10 bar you have to clear to generate, how to anchor a clip to a real start or end image, and how to use the page\'s own tools together with Claude.',
    duration: 'about 35 minutes',
    totalSteps: 9,
    tags: ['Creative AI', 'AI Video Creation', 'AI Playground'],
    available: true,
    category: 'creative-ai',
    Icon: VideoIcon,
  },
  {
    id: 'creative-ai-guide-video-studio',
    path: '/tutorials/creative-ai/video-studio',
    title: 'Video Studio',
    blurb:
      'What you can actually bring in and from where, a typical assembly session, how to control the length of everything on the timeline, and what to know before you export.',
    duration: 'about 30 minutes',
    totalSteps: 9,
    tags: ['Creative AI', 'Video Studio'],
    available: true,
    category: 'creative-ai',
    Icon: Clapperboard,
  },
  {
    id: 'creative-ai-guide-document-studio',
    path: '/tutorials/creative-ai/document-studio',
    title: 'Document Studio',
    blurb:
      'What you\'re actually building, a typical layout session, real book trim sizes and formatting controls, and what to know before you export.',
    duration: 'about 30 minutes',
    totalSteps: 9,
    tags: ['Creative AI', 'Document Studio'],
    available: true,
    category: 'creative-ai',
    Icon: FileText,
  },
  {
    id: 'ai-content-creation-guide',
    path: '/tutorials/ai-content-creation',
    title: 'AI Content Creation',
    blurb:
      'The 3-phase workshop, the two kinds of feedback it gives you, and a real weak-vs-strong answer to the first question you\'ll actually be asked.',
    duration: 'about an hour',
    totalSteps: 9,
    tags: ['Creative AI', 'AI Content Creation', 'AI Playground'],
    available: true,
    category: 'creative-ai',
    Icon: PenLine,
  },
  {
    id: 'advisor-casebook-guide-agriculture',
    path: '/tutorials/community-impact/agriculture',
    title: 'Agriculture Consultant',
    blurb:
      'Why there\'s no practice mode here, a real cassava-disease case worked start to finish, and how to interview, advise, and follow up well.',
    duration: 'about 30 minutes',
    totalSteps: 9,
    tags: ['Community Impact', 'Agriculture Consultant'],
    available: true,
    category: 'community-impact',
    Icon: Wheat,
  },
  {
    id: 'advisor-casebook-guide-fishing',
    path: '/tutorials/community-impact/fishing',
    title: 'Fishing Consultant',
    blurb:
      'Why there\'s no practice mode here, a real oil-contamination case worked start to finish, and how to interview, advise, and follow up well.',
    duration: 'about 30 minutes',
    totalSteps: 9,
    tags: ['Community Impact', 'Fishing Consultant'],
    available: true,
    category: 'community-impact',
    Icon: Fish,
  },
  {
    id: 'advisor-casebook-guide-animal-husbandry',
    path: '/tutorials/community-impact/animal-husbandry',
    title: 'Animal Husbandry Consultant',
    blurb:
      'Why there\'s no practice mode here, a real livestock-emergency case worked start to finish, and how to interview, advise, and follow up well.',
    duration: 'about 30 minutes',
    totalSteps: 9,
    tags: ['Community Impact', 'Animal Husbandry'],
    available: true,
    category: 'community-impact',
    Icon: PawPrint,
  },
  {
    id: 'healthcare-navigator-guide',
    path: '/tutorials/healthcare-navigator',
    title: 'Healthcare Navigator',
    blurb:
      'A real RED/YELLOW/GREEN triage case worked start to finish, and knowing which of the two follow-up tools to reach for.',
    duration: 'about 30 minutes',
    totalSteps: 8,
    tags: ['Community Impact', 'Healthcare Navigator'],
    available: true,
    category: 'community-impact',
    Icon: Stethoscope,
  },
  {
    id: 'ai-ambassadors-guide',
    path: '/tutorials/ai-ambassadors',
    title: 'AI Ambassadors',
    blurb:
      'Rehearse a hard conversation with a fixed, in-character persona, get scored on a real 5-part rubric, then take it to an actual person.',
    duration: 'about 30 minutes',
    totalSteps: 9,
    tags: ['Community Impact', 'AI Ambassadors'],
    available: true,
    category: 'community-impact',
    Icon: Megaphone,
  },
  {
    id: 'entrepreneurship-consultant-guide',
    path: '/tutorials/entrepreneurship-consultant',
    title: 'Entrepreneurship Consultant',
    blurb:
      'Practice with a graded persona in Practice Mode, then run the same advice for a real entrepreneur in Casebook — a real garri-processing case worked both ways.',
    duration: 'about 40 minutes',
    totalSteps: 8,
    tags: ['Community Impact', 'Entrepreneurship Consultant'],
    available: true,
    category: 'community-impact',
    Icon: Briefcase,
  },
  {
    id: 'add-new-guide',
    path: '/tutorials/add-new-guide',
    title: 'Add or Improve a Page',
    blurb:
      'For team members: how to build a brand new page for this site, or fix and improve one that already exists — from a blank branch to an open Pull Request. No prior coding experience needed — the only real prerequisite is a GitHub account and an invite to the team. The one habit that makes it work: always give Claude a similar existing file as a mirror before asking it to build or fix anything.',
    duration: 'about an hour',
    totalSteps: 6,
    tags: ['GitHub', 'Claude', 'Contributing'],
    available: true,
    category: 'managing-platform',
    Icon: GitBranch,
  },
  {
    id: 'create-ai-camp',
    path: '/tutorials/create-ai-camp',
    title: 'Create an AI Camp',
    blurb:
      'A focused version of "Add or Improve a Page" for one specific job: turning a curriculum plan you already have — a PDF or Word document — into a real, published, student-facing guide. Draft it with Use Claude or Gemini\'s free version, save it into the project, test it locally, then take it through review to merged. Same AI chat carries you from first draft through every revision.',
    duration: 'about 90 minutes',
    totalSteps: 7,
    tags: ['GitHub', 'Claude', 'Curriculum', 'Contributing'],
    available: true,
    category: 'managing-platform',
    Icon: GraduationCap,
  },
];

// ── Search: rough-description matching ──────────────────────────────────────
// No AI call needed — the guide count is small enough that scored word
// overlap across title/tags/blurb finds the closest guide instantly and for
// free. Title and tag words count more than blurb words since they're the
// more deliberate, descriptive words for what a guide is about.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'how', 'what',
  'are', 'can', 'from', 'into', 'about', 'using', 'use', 'want', 'need',
  'like', 'just', 'some', 'have', 'has', 'need', 'help', 'guide', 'find',
]);

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function scoreTrack(queryWords: string[], t: Track): number {
  const titleWords = normalizeWords(t.title);
  const tagWords = normalizeWords(t.tags.join(' '));
  const blurbWords = normalizeWords(t.blurb);

  let score = 0;
  for (const qw of queryWords) {
    if (titleWords.includes(qw)) score += 3;
    if (tagWords.includes(qw)) score += 2;
    if (blurbWords.includes(qw)) score += 1;
    // Loose credit for close variants — "fishing" should still hit "fish".
    if (titleWords.some(w => w.includes(qw) || qw.includes(w))) score += 1;
    if (blurbWords.some(w => w.includes(qw) || qw.includes(w))) score += 0.5;
  }
  return score;
}

const TutorialsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<CategoryId, boolean>>(() => {
    const state = {} as Record<CategoryId, boolean>;
    CATEGORIES.forEach(c => {
      state[c.id] = TRACKS.some(t => t.category === c.id); // open by default only if it has guides
    });
    return state;
  });

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

  const bestMatch = useMemo(() => {
    const queryWords = normalizeWords(query);
    if (queryWords.length === 0) return null;

    let best: Track | null = null;
    let bestScore = 0;
    for (const t of TRACKS) {
      const score = scoreTrack(queryWords, t);
      if (score > bestScore) {
        best = t;
        bestScore = score;
      }
    }
    return best;
  }, [query]);

  const toggleCategory = (id: CategoryId) =>
    setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }));

  const renderTrackCard = (t: Track, highlighted = false) => {
    const doneSteps = progress[t.id] ?? 0;
    const pct = Math.min(100, Math.round((doneSteps / t.totalSteps) * 100));
    const started = doneSteps > 0;

    return (
      <button
        key={t.id}
        onClick={() => t.available && navigate(t.path)}
        disabled={!t.available}
        className={`w-full rounded-2xl border bg-white p-6 text-left transition-all ${
          t.available ? 'hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md' : 'cursor-not-allowed opacity-60'
        } ${highlighted ? 'border-amber-400 shadow-md ring-2 ring-amber-200' : 'border-gray-200'}`}
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
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Guides</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Guided tracks that walk you through a real build, step by step. Each one moves you between
          a build page and the AI Playground — because that back-and-forth is where the skill comes from.
        </p>

        {/* Search */}
        <div className="mt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Not sure which Guide you need? Describe what you're trying to do…"
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-10 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {query.trim().length > 0 && (
            <div className="mt-3">
              {bestMatch ? (
                <>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">Closest match</div>
                  {renderTrackCard(bestMatch, true)}
                </>
              ) : (
                <p className="text-sm text-gray-500">No close match yet — try different words, or browse the categories below.</p>
              )}
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="mt-8 space-y-3">
          {CATEGORIES.map(c => {
            const tracksInCategory = TRACKS.filter(t => t.category === c.id);
            const isOpen = openCategories[c.id] ?? false;

            return (
              <div key={c.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <button
                  onClick={() => toggleCategory(c.id)}
                  className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <c.Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-gray-900">{c.label}</h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                        {tracksInCategory.length}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500">{c.blurb}</p>
                  </div>
                  {isOpen
                    ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 p-4">
                    {tracksInCategory.length > 0
                      ? tracksInCategory.map(t => renderTrackCard(t))
                      : <p className="px-2 py-3 text-sm text-gray-400">No Guides here yet — more are on the way.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default TutorialsPage;
