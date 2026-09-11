// src/pages/tutorials/AIDiscoveryCampGuidePage.tsx
//
// AI Discovery Camp — a five-day, student-facing guide for campers roughly
// 8-10 years old. Each day is one step: an unplugged "Aha!" warm-up, two AI
// activities (build something, then improve it), and a paper hands-on
// activity that closes the loop back to the camper's own idea.
//
// Same step/checkbox/cumulative-unlock/progress pattern as
// CreateAICampGuidePage.tsx and AddNewGuidePage.tsx, but without copyBlocks —
// campers aren't pasting commands, they're clicking around the platform.
// Every page a step points to is real and live today:
//   - Day 1, Day 2 pictures  -> /tech-skills/ai-image-creation (AI Image Creation)
//   - Day 3 story text       -> /playground (Use Claude)
//   - Day 3 scene pictures   -> /tech-skills/ai-image-creation
//   - Day 4 game             -> /tech-skills/create-game (Create Game)
//   - Day 5                  -> whichever of the above matches the camper's
//     favorite project from the week

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, Lock, Loader2, Sparkles,
} from 'lucide-react';

const TRACK = 'ai-discovery-camp';

interface GuideStep {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  body: string[];
  checkpoint: string;
}

const STEPS: GuideStep[] = [
  {
    id: 'day-1',
    emoji: '🤖',
    title: 'Day 1 — I Can Give AI Good Instructions',
    blurb: 'Give AI instructions, create a robot, and make it better.',
    body: [
      '👉 ⭐ Aha! Activity — Can AI Guess Your Robot? (15 minutes). Think of a robot in your head. What does it look like? What can it do? What does it help people with? Tell a partner your ideas. Now imagine what would happen if you gave those instructions to AI. The more details you give, the better AI can understand your idea.',
      '🤖 AI Activity 1 — Describe Your Robot. Invent your own robot. Give it a name, choose its colors and shape, decide what special powers it has, and think about who it helps.',
      'Now turn your robot into a picture with AI: in the sidebar, click 🛠️ Tech Workshop → Creative AI → AI Image Creation. You\'ll see a box that says "Describe your image." Type a sentence about your robot — its name, colors, shape, and special power. Click Make My Image 🎨 and wait a few seconds for your robot to appear.',
      '🤖 AI Activity 2 — Make Your Robot Better. Look carefully at the picture AI created. Is anything different from your idea? Stay on the same AI Image Creation page — in the same description box, add the change you want: "Make the arms bigger," "Give it three eyes," "Change the color to blue," or "Add wheels." Click Make My Image 🎨 again to see the new version. Ask AI to improve your robot at least once.',
      '✏️ Hands-on Activity — Draw Your Robot. Now draw your robot on paper. Give it a name and label its special parts. Show what makes your robot different from every other robot.',
      'Remember: YOU are the boss. AI is your helper. You give the instructions, you check the result, and you decide what should change.',
    ],
    checkpoint: 'You have an AI picture of your robot, an improved version, and a paper drawing with labels. You gave AI instructions, checked its picture, and asked AI to make at least one change.',
  },
  {
    id: 'day-2',
    emoji: '✨',
    title: 'Day 2 — I Can Create With AI',
    blurb: 'Invent a character, create with AI, and make it better.',
    body: [
      '👉 ⭐ Aha! Activity — Who Is This Character? (15 minutes). Think of a character without telling anyone who it is. Give three clues about the character — what they look like, something they can do, and something they love. Let a partner guess your character. Now think: if three clues can help a person imagine your character, what happens when we give AI lots of good details?',
      '🤖 AI Activity 1 — Create Your Character. Invent a brand-new character. Give your character a name, choose their appearance, decide their special power or talent, and think about what they love. Draw your character on paper first.',
      'Now let\'s turn your drawing into a picture with AI: in the sidebar, click 🛠️ Tech Workshop → Creative AI → AI Image Creation. Type a describing sentence about your character — their name, how they look (hair, clothes, colors), their power, and what they\'re doing — into the box that says "Describe your image." Not sure your sentence is good enough? Click 💡 Help me write a better prompt first. When you\'re happy with it, click Make My Image 🎨 and wait a few seconds.',
      '🤖 AI Activity 2 — Make Your Character Better. Look at the picture AI created and compare it with your paper drawing. Did AI get everything right? Stay on the same page — in the same description box, add the change you want: "Give my character curly hair," "Change the shirt to yellow," or "Add a backpack." Click Make My Image 🎨 again to see the new version. Ask AI to improve your character at least once.',
      '✏️ Hands-on Activity — Create a Character Card. On paper, draw your character and write their name, special power, favorite thing, and one interesting fact about them. Compare your paper character with the AI picture and decide what you like best.',
      'Remember: YOU are the creator. AI can help bring your idea to life, but you decide what your character looks like and what makes them special.',
    ],
    checkpoint: 'You have a character card, an AI-created picture of your character, and an improved version. You checked the picture against your drawing and asked AI to change at least one thing.',
  },
  {
    id: 'day-3',
    emoji: '🎬',
    title: 'Day 3 — I Can Tell Stories With AI',
    blurb: 'Create a story, bring it to life with AI, and make it better.',
    body: [
      '👉 ⭐ Aha! Activity — What Happens Next? (15 minutes). Start a story with one sentence: "Mia opened the mysterious box and…" Take turns with a partner adding one sentence at a time. Keep going until you have a fun ending. Now think: if people can build a story one idea at a time, how can we give AI the right instructions to help us tell a story?',
      '🤖 AI Activity 1 — Create Your Story. Invent a short story with a beginning, a problem, a solution, and an ending. Choose your main character, where the story happens, and what exciting thing happens.',
      'Click Use Claude near the top of the site (look for the ✨ sparkle icon), then click + New chat. Type your story idea into the box that says "Message Claude…" — tell it your main character, where the story happens, and what exciting thing happens. Press Enter and read what Claude writes back. Keep chatting back and forth: ask Claude to change the problem, add a funny part, or fix the ending.',
      '🤖 AI Activity 2 — Bring Your Story to Life. Pick 4 key moments from your story — beginning, problem, solution, ending. Go to 🛠️ Tech Workshop → Creative AI → AI Image Creation (same page as Day 1 and 2). For each of the 4 moments, describe that scene — who\'s there, where they are, what\'s happening — and click Make My Image 🎨. If a picture doesn\'t match your story, type the fix into the description box and click Make My Image 🎨 again. Do this for at least one scene.',
      '✏️ Hands-on Activity — Make a Storyboard. Draw four boxes on paper. In each box, draw one part of your story: beginning, problem, solution, and ending. Add a few words under each picture to explain what is happening.',
      'Remember: YOU are the director. AI can help create your story, but you choose the characters, the ideas, and what happens next.',
    ],
    checkpoint: 'You have a four-part storyboard and AI-created pictures or scenes for your story. You checked the result and asked AI to improve at least one part.',
  },
  {
    id: 'day-4',
    emoji: '🎮',
    title: 'Day 4 — I Can Solve Problems With AI',
    blurb: 'Design a game, build it with AI, and make it better.',
    body: [
      '👉 ⭐ Aha! Activity — How Does a Game Work? (15 minutes). Think about a game you enjoy playing. What is the goal? What are the rules? How does a player win? Share your ideas with a partner. Now think: if you can explain a game to a person, how can you give AI clear instructions to help you build one?',
      '🤖 AI Activity 1 — Design Your Game. Invent a simple game. Decide the goal, the rules, the characters or objects, and how the player wins. Draw your game on paper first.',
      'In the sidebar, click 🛠️ Tech Workshop → Creative AI → Create Game. At the bottom of the screen, type what your game is about — the goal, the characters or objects, and how you win — into the box that says "Describe your game idea…". Click the send button and wait — AI will build a real, playable game for you right on the screen.',
      '🤖 AI Activity 2 — Test and Improve Your Game. Play the game AI created. Look for anything that does not work or could be more fun. In the same box (it now says "Ask for a change, e.g. \'make the ball faster\'…"), type what you want different: "Make the game easier," "Add more stars," or "Give the player more time." Send it, then play the new version. Test the game again after AI makes the change.',
      '✏️ Hands-on Activity — Game Designer Challenge. Draw your game board or game screen on paper. Show the goal, rules, characters, and how the player wins. Test your paper game with a partner and ask them what they would change.',
      'Remember: YOU are the game designer. AI can help build your idea, but you decide the rules, test the game, and choose what should change.',
    ],
    checkpoint: 'You have a paper game design and an AI-created game. You played and tested the game, then asked AI to improve at least one part.',
  },
  {
    id: 'day-5',
    emoji: '🌟',
    title: 'Day 5 — I Am an AI Creator',
    blurb: 'Choose your favorite project, improve it, and show what you can create.',
    body: [
      '👉 ⭐ Aha! Activity — Show and Tell (15 minutes). Pick something you made this week and tell a partner about it without showing them the project. Give three clues: what you made, what it does, and why you like it. Let your partner guess. Then think: what makes your creation special to YOU?',
      '🤖 AI Activity 1 — Choose and Improve. Pick your favorite project from this week — your robot, character, story, or game. Look at it carefully and decide what you would like to make better.',
      'Go back to whichever page made your favorite project: pictures (robot, character, or story scenes) → 🛠️ Tech Workshop → Creative AI → AI Image Creation. Story text → Use Claude (✨ near the top) — open the same chat if it\'s still in your list on the left. Game → 🛠️ Tech Workshop → Creative AI → Create Game. Type what you want to improve into the same box you used before.',
      '🤖 AI Activity 2 — Create Your Final Version. Make your final version with AI. Check your project carefully. Does it match your idea? Ask AI to make one more improvement if needed, then choose the version you are most proud of.',
      '✏️ Hands-on Activity — Make a Showcase Card. On paper, make a card for your project. Write: What did I make? Why did I choose it? What did AI help me do? What did I change or fix? What would I like to create next?',
      'Remember: YOU are the AI creator. AI can help you create and improve your idea, but you make the choices. Be proud of what YOU created and what YOU learned this week.',
    ],
    checkpoint: 'You have a finished project, a showcase card, and a final version that you checked and improved with AI.',
  },
];

const TOTAL_STEPS = STEPS.length;

const AIDiscoveryCampGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [openStep, setOpenStep] = useState<string>(STEPS[0].id);
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
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-purple-900 to-indigo-800 p-6 text-white">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" /> AI Discovery Camp
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Five Days of Creating With AI</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-200">
            Every day you'll play a quick game with a partner, build something with AI, ask AI to make it
            better, and then draw or write about it on paper. You're always the boss — AI is your helper.
          </p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-300">
              <span>{doneCount} of {TOTAL_STEPS} days complete</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* days */}
        {STEPS.map((step, idx) => {
          const unlocked = isUnlocked(idx);
          const isDone = done.has(step.id);
          const open = unlocked && openStep === step.id;

          return (
            <div key={step.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => unlocked && setOpenStep(open ? '' : step.id)}
                disabled={!unlocked}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${unlocked ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  isDone ? 'bg-green-600 text-white' : unlocked ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-400'}`}>
                  {isDone ? <Check className="h-6 w-6" /> : unlocked ? <span>{step.emoji}</span> : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-gray-900">{step.title}</h2>
                  <p className="truncate text-sm text-gray-500">{step.blurb}</p>
                  {!unlocked && <p className="mt-1 text-xs font-semibold text-gray-400">Finish the previous day to unlock</p>}
                </div>
                {unlocked && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 p-5">
                  <div className="mb-4 space-y-3 text-sm leading-relaxed text-gray-700">
                    {step.body.map((p, i) => <p key={i}>{p}</p>)}
                  </div>

                  <div className="flex items-start gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                    <span><b className="font-bold">You'll know it worked when</b> — {step.checkpoint}</span>
                  </div>

                  {!isDone && (
                    <button
                      onClick={() => markDone(step.id)}
                      className="mt-4 rounded-lg bg-purple-900 px-4 py-2 text-sm font-bold text-white hover:bg-purple-800"
                    >
                      Mark this day done
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {doneCount === TOTAL_STEPS && (
          <div className="mt-2 rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <p className="font-bold text-green-800">You finished AI Discovery Camp — great work!</p>
            <p className="mt-1 text-sm text-green-700">
              Keep exploring — go back to any day's pages any time to keep improving your robot, character, story, or game.
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

export default AIDiscoveryCampGuidePage;
