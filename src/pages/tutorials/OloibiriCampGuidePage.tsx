


//
// A child-friendly guide for the Oloibiri AI Camp (ages 8–10).
// Walks children through five camp days of AI creation:
// Robot design → Character creation → Storytelling → Game design → Choice project.
//
// Same progress-tracking and step-unlock pattern as AddNewGuidePage,
// but written for children with simple language, celebrations, and a guide character.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, Lock, Loader2, Sparkles, Zap, Heart,
} from 'lucide-react';

const TRACK = 'oloibiri-ai-camp';

interface CampStep {
  id: string;
  day: string;
  title: string;
  emoji: string;
  blurb: string;
  body: string[];
  checkpoint: string;
}

const STEPS: CampStep[] = [
  {
    id: 'day1',
    day: 'Day 1',
    title: 'I Can Talk to AI 🤖',
    emoji: '🤖',
    blurb: 'Design a robot and teach AI to draw it.',
    body: [
      "Today you're going to invent a robot. Think about what it looks like, what it can do, and who it helps.",
      "Here's how it works: You describe your robot to AI. AI makes a picture. You look at it and say, 'That's close, but I want the arms to be bigger.' AI fixes it. You keep checking and fixing until it's just right.",
      "Then you draw your robot on paper and label all its cool parts — the laser eyes, the spinning arms, whatever makes it special.",
      "Remember: YOU are the boss. AI helps, but you decide what's good.",
    ],
    checkpoint: 'You have a robot picture from AI and a paper drawing with labels. You changed the description at least once to make it better.',
  },
  {
    id: 'day2',
    day: 'Day 2',
    title: 'I Can Create With AI ✨',
    emoji: '✨',
    blurb: 'Make a character and build a webpage.',
    body: [
      "Today you're creating a character — someone totally new that you invented.",
      "First, draw them on paper. Give them a name, decide what they look like, what their superpower is, and what they love most.",
      "Then you tell AI about your character: 'Her name is Luna. She has silver hair and can talk to animals. She loves starlight.' AI helps you turn that into a real webpage that shows your character.",
      "You check it. If something's wrong, you fix it. If the colors are weird or the name is spelled funny, you tell AI and it fixes it.",
      "By the end, you have a real webpage on the internet that shows off your character.",
    ],
    checkpoint: 'You have a paper character card and a live webpage that shows your character. You made at least one change to make it better.',
  },
  {
    id: 'day3',
    day: 'Day 3',
    title: 'I Can Tell Stories With AI 🎬',
    emoji: '🎬',
    blurb: 'Write a story and make it into a movie.',
    body: [
      "Today you're a storyteller. You're going to write a story and turn it into a real video.",
      "Your story needs four parts: a beginning (where we are), a problem (what goes wrong), a solution (how we fix it), and an ending (what happens next).",
      "Example: 'Luna finds a lost baby dragon. The dragon is scared. Luna sings to calm it down. The dragon becomes her friend.'",
      "Draw your story as a storyboard — like a comic book with four boxes, one for each part.",
      "Then AI helps you make a real video or movie with your story. You watch it, check if it matches your idea, and fix anything that's wrong.",
      "You're the director — you decide if the story is told the right way.",
    ],
    checkpoint: 'You have a storyboard drawing and a video or movie that tells your story. You watched it and made sure it matches what you wanted.',
  },
  {
    id: 'day4',
    day: 'Day 4',
    title: 'I Can Solve Problems With AI 🎮',
    emoji: '🎮',
    blurb: 'Design a game and test it.',
    body: [
      "Today you're a game designer. You're going to make a game, test it, and make it better.",
      "First, decide: What's the goal? (Win by collecting stars? Reach the end? Beat the timer?) What are the rules? What makes it hard? How do you win?",
      "Draw your game on paper first. Test it with friends. Ask them: 'Is this fun? Is it too easy? Too hard? What would make it better?'",
      "Then AI helps you build it on the computer. You play it. You notice what doesn't work — maybe it's too easy, or the rules are confusing.",
      "You tell AI what to change. AI fixes it. You play again. You keep testing and fixing until it's fun.",
      "At the end, everyone votes on their favorite game. That's how you know if your idea worked.",
    ],
    checkpoint: 'You have a paper game design, a playable game on the computer, and you tested it at least twice. You made at least one change based on testing.',
  },
  {
    id: 'day5',
    day: 'Day 5',
    title: 'I Am an AI Creator 🌟',
    emoji: '🌟',
    blurb: 'Pick your favorite and finish it.',
    body: [
      "Today is your choice. You pick one thing you made this week — a robot, a character, a story, a movie, or a game — and you make it perfect.",
      "You finish it. You test it. You fix anything that's not quite right. You make it something you're really proud of.",
      "Then you make a showcase card that tells the story: What did I make? Why did I pick it? What did AI help me do? What did I change or fix? What would I do next?",
      "At the end, you show your creation to someone who matters to you — your family, a friend, or the whole camp. You tell them your story.",
      "You're not just showing what AI made. You're showing what YOU created, what YOU decided, and what YOU learned.",
    ],
    checkpoint: "You have a finished creation, a showcase card, and you've practiced explaining it to someone.",
  },
];

const TOTAL_STEPS = STEPS.length;

const OloibiriAICampGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [openStep, setOpenStep] = useState<string>(STEPS[0].id);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lsKey = `tutorial:${TRACK}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) setDone(new Set<string>(JSON.parse(raw).completed ?? []));
    } catch { /* corrupt cache */ }
    setLoaded(true);
  }, [lsKey]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tutorial_progress')
        .select('completed_steps')
        .eq('user_id', userId)
        .eq('track', TRACK)
        .maybeSingle();
      if (cancelled || !data) return;
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback((nextDone: Set<string>) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({ completed: [...nextDone], updated: Date.now() }));
    } catch { /* private browsing */ }
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

  const firstIncompleteIndex = useCallback((): number => {
    const idx = STEPS.findIndex(s => !done.has(s.id));
    return idx === -1 ? STEPS.length : idx;
  }, [done]);

  const isUnlocked = (index: number) => index <= firstIncompleteIndex();

  const markDone = (stepId: string) => {
    const next = new Set(done);
    next.add(stepId);
    setDone(next);
    persist(next);
  };

  const doneCount = STEPS.filter(s => done.has(s.id)).length;
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
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-200">Oloibiri AI Camp</p>
          <h1 className="mt-2 text-4xl font-extrabold">Five Days, Infinite Futures 🚀</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-purple-100">
            Welcome, creator! Over five days, you're going to build amazing things with AI. You'll design robots, create characters, tell stories, make games, and show the world what you made.
          </p>
          <p className="mt-2 text-sm text-purple-200">
            <b>Remember:</b> You describe → AI makes → You check → You decide. You're always in charge.
          </p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-purple-200">
              <span>Days complete: {doneCount} of {TOTAL_STEPS}</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-purple-800">
              <div className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-pink-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* steps */}
        {STEPS.map((step, idx) => {
          const unlocked = isUnlocked(idx);
          const isDone = done.has(step.id);
          const open = unlocked && openStep === step.id;

          return (
            <div key={step.id} className="mb-4 overflow-hidden rounded-2xl border-2 border-purple-200 bg-white shadow-sm">
              <button
                onClick={() => unlocked && setOpenStep(open ? '' : step.id)}
                disabled={!unlocked}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${unlocked ? 'hover:bg-purple-50' : 'cursor-not-allowed opacity-50'}`}
              >
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-extrabold ${
                  isDone ? 'bg-green-500 text-white' : unlocked ? 'bg-purple-200 text-purple-700' : 'bg-gray-200 text-gray-400'}`}>
                  {isDone ? <Check className="h-7 w-7" /> : unlocked ? idx + 1 : <Lock className="h-6 w-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-purple-600">{step.day}</span>
                    <span className="text-2xl">{step.emoji}</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">{step.title}</h2>
                  <p className="truncate text-sm text-gray-600">{step.blurb}</p>
                  {!unlocked && <p className="mt-1 text-xs font-semibold text-purple-600">Finish the last day first!</p>}
                </div>
                {unlocked && (open ? <ChevronDown className="h-5 w-5 text-purple-400" /> : <ChevronRight className="h-5 w-5 text-purple-400" />)}
              </button>

              {open && (
                <div className="border-t-2 border-purple-100 bg-purple-50 p-5">
                  <div className="mb-5 space-y-3 text-sm leading-relaxed text-gray-800">
                    {step.body.map((p, i) => (
                      <p key={i} className="text-base">
                        {i === 0 && <span className="text-lg">👉 </span>}
                        {p}
                      </p>
                    ))}
                  </div>

                  <div className="flex items-start gap-3 rounded-lg bg-green-100 p-4 text-sm text-green-900">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                    <div>
                      <p className="font-bold">You'll know it worked when:</p>
                      <p className="mt-1">{step.checkpoint}</p>
                    </div>
                  </div>

                  {!isDone && (
                    <button
                      onClick={() => markDone(step.id)}
                      className="mt-5 w-full rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-base font-bold text-white hover:from-purple-700 hover:to-blue-700 transition-all"
                    >
                      ✅ I finished this day!
                    </button>
                  )}

                  {isDone && (
                    <div className="mt-4 rounded-lg bg-green-200 p-3 text-center font-bold text-green-800">
                      🎉 Amazing work! You finished this day.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {doneCount === TOTAL_STEPS && (
          <div className="mt-6 rounded-2xl border-2 border-yellow-300 bg-gradient-to-r from-yellow-100 to-pink-100 p-6 text-center">
            <p className="text-3xl">🌟🚀🎉</p>
            <p className="mt-2 text-xl font-extrabold text-gray-900">You're an AI Creator!</p>
            <p className="mt-2 text-base text-gray-800">
              You learned to describe, check, fix, and decide. You built robots, characters, stories, games, and more. You showed the world what you can create.
            </p>
            <p className="mt-3 text-sm font-semibold text-gray-700">
              What will you create next?
            </p>
          </div>
        )}

        <div className="mt-8">
          <button onClick={() => navigate('/tutorials')} className="flex items-center gap-2 text-sm font-semibold text-purple-600 hover:text-purple-800">
            <Compass className="h-4 w-4" /> Back to all guides
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default OloibiriAICampGuidePage;
 