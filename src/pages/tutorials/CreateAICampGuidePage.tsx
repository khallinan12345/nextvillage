// src/pages/tutorials/CreateAICampGuidePage.tsx
//
// A focused version of AddNewGuidePage.tsx, narrowed to one recurring job:
// turning a facilitator's own curriculum plan (a PDF or Word document) into
// a real, published, student-facing guide page on nextVillage — from first
// draft to a merged Pull Request.
//
// Differences from AddNewGuidePage.tsx, deliberately:
//  - Content generation happens FIRST (steps 1-2), git setup SECOND (steps
//    3-4) — the opposite order from AddNewGuidePage — because a facilitator
//    typically wants to see the draft before deciding to formally contribute
//    it.
//  - Git is done from the command line (git clone/pull/checkout/commit/push),
//    not GitHub Desktop — this track assumes slightly more comfort with
//    typed commands, and keeps everything in the same window as npm.
//  - The SAME AI chat is reused for the initial draft (step 2) and every
//    revision afterward (step 6) — the whole point is that the AI still
//    remembers both the curriculum plan and the file it already wrote, so
//    a facilitator only has to describe what's wrong, never re-explain
//    everything from scratch.
//  - This track ends at "merged", not "PR opened" — once a reviewer
//    approves, the facilitator merges it herself.
//
// Same step/checkbox/cumulative-unlock/progress pattern as AddNewGuidePage.tsx.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, Lock, Loader2, Copy, CheckCheck,
} from 'lucide-react';

const TRACK = 'create-ai-camp';

interface CopyBlock {
  label: string;
  text: string;
}

interface GuideStep {
  id: string;
  title: string;
  blurb: string;
  body: string[];
  copyBlocks?: CopyBlock[];
  checkpoint: string;
}

const STEPS: GuideStep[] = [
  {
    id: 'bring-plan',
    title: 'Bring your curriculum plan',
    blurb: 'A PDF or Word document — whatever you already have.',
    body: [
      "Start with whatever plan you already have for the camp — a PDF or Word document laying out each session: what's taught, in what order, and what students do or make along the way. You don't need to reformat it first.",
      'Go to nextVillage\'s own Use Claude page (in the top navigation) and start a new chat, or go to Gemini\'s free version at gemini.google.com and sign in free if you don\'t have an account — either works for this track.',
      'Attach your PDF or Word file with the paperclip/attachment icon. Use Claude now reads real text out of PDF, Word, and Excel files directly — no need to open and copy-paste it yourself.',
      "Ask it to summarize your plan back to you in a sentence or two, just to confirm it read the whole thing correctly before you go further.",
      "Important: keep this exact chat open for the rest of this track. You'll come back to it in the next step, and again in Step 6 to make revisions — starting a new chat there means re-explaining everything from scratch.",
    ],
    checkpoint: "The AI has summarized your curriculum plan back to you accurately, in the chat you'll keep reusing.",
  },
  {
    id: 'draft-guide',
    title: 'Turn it into a student-facing guide',
    blurb: 'Ask the AI to draft the actual page students will use — same chat as Step 1.',
    body: [
      "Same rule as always on this site: give the AI a similar existing file as a mirror before asking it to build anything. For a narrated, step-by-step student guide like this one, that's src/pages/tutorials/FishMarketTutorialPage.tsx — nextVillage's own richest example of exactly this pattern (numbered steps, checkboxes, progress tracking, narration).",
      'Open that file in VS Code, select all, copy it.',
      "In the same chat from Step 1 — your curriculum plan is already there — paste the mirror file and the prompt below, filling in your camp's name and picking which section of the site the finished guide belongs in (not this section — Managing the Platform is only for tracks like this one, about maintaining the site itself; your camp guide belongs wherever its actual subject fits: Foundations, Learning, Skill Development, Creative AI, Tech Skills, or Community Impact).",
      "Read what comes back and ask follow-ups freely. If a session in your plan doesn't translate cleanly into a step, say so and ask it to restructure just that part.",
    ],
    copyBlocks: [{
      label: 'Prompt to send (same chat as Step 1)',
      text: `Using the curriculum plan I attached above, and mirroring the structure, styling, and progress-tracking pattern of the file I just pasted (src/pages/tutorials/FishMarketTutorialPage.tsx), write a complete new nextVillage guide page for a camp called "[YOUR CAMP NAME]".

One step per session in my plan, in the same order. Each step should include what students do or make, not just what they're told.

This guide belongs in this section of the site: [PICK ONE — Foundations / Learning / Skill Development / Creative AI / Tech Skills / Community Impact]

Please tell me:
- The exact filename to save it as in src/pages/tutorials (following the same naming convention as the mirror file)
- The exact small changes needed in src/App.tsx (the route) and src/pages/tutorials/TutorialsPage.tsx (the guide card, in the section I picked above), shown as "find this line, add this line," explained the way you'd explain it to someone who has never edited code before

Write everything out in full — I'll be copying your code directly into files, so don't skip anything or say "add the rest of the steps here."`,
    }],
    checkpoint: 'The AI has given you a complete new page (with a filename), plus the exact small edits needed in App.tsx and TutorialsPage.tsx to make it reachable — all written out in full.',
  },
  {
    id: 'setup',
    title: 'Get your project ready',
    blurb: 'One Terminal window — works whether this is your first time or your hundredth.',
    body: [
      "Open Terminal (Mac) or Command Prompt/PowerShell (Windows). You'll need a GitHub account with access to the nextvillage repository — ask a platform admin first if you don't have this yet.",
      "First time only, if you don't already have the project on your computer: clone it, then move into the folder.",
      "Already have the project? Just make sure you're inside its folder and it's caught up with the latest version of the site before you start.",
      "Either way, finish by creating a new branch for this camp guide — nothing you do on it touches the live site until it's reviewed and merged.",
    ],
    copyBlocks: [
      { label: 'First time only — clone', text: 'git clone https://github.com/khallinan12345/nextvillage.git\ncd nextvillage' },
      { label: 'Already have it — get the latest', text: 'git checkout main\ngit pull origin main' },
      { label: 'Everyone — make your branch', text: 'git checkout -b yourname/camp-name-guide' },
    ],
    checkpoint: 'Running "git branch" in Terminal shows a star next to your new branch name, not main.',
  },
  {
    id: 'apply',
    title: 'Save the new page into the project',
    blurb: "Put the AI's file where it belongs, and wire it in.",
    body: [
      'Save (or move) the file the AI wrote into src/pages/tutorials, using the exact filename it gave you. If it downloaded somewhere like your Downloads folder, move it from Terminal.',
      'Open the project folder in VS Code (type "code ." in Terminal, or use File → Open), then make the other small edits the AI described — the route in src/App.tsx and the guide card in src/pages/tutorials/TutorialsPage.tsx. Save both.',
      'Back in Terminal, stage and commit everything.',
    ],
    copyBlocks: [
      { label: 'If the file needs moving (example)', text: 'mv ~/Downloads/YourCampNameGuidePage.tsx src/pages/tutorials/' },
      { label: 'Commit your changes', text: 'git add .\ngit commit -m "Add [Camp Name] guide"' },
    ],
    checkpoint: 'Running "git status" says nothing to commit, and "git log -1" shows your commit message at the top.',
  },
  {
    id: 'test',
    title: 'Test it for real, on your own computer',
    blurb: 'Walk through it exactly as a camp student would.',
    body: [
      "First time only, run npm install and wait — five to ten minutes is normal. Then run the dev server.",
      'A web address will appear, something like http://localhost:5173 — open it in your browser, sign in, and find your new guide (navigate to the URL the AI gave you if it\'s not showing in the menu yet).',
      "Click through every step the way a student actually would. Check the sessions are in the right order, the content matches your plan, and nothing else on the site looks different than before.",
      'When you\'re done, click back in Terminal and press Ctrl+C to stop the site.',
    ],
    copyBlocks: [
      { label: 'First time only', text: 'npm install' },
      { label: 'Every time', text: 'npm run dev:frontend' },
    ],
    checkpoint: 'Your new guide loads end to end, matches your curriculum plan, and the rest of the site still looks the way it did before.',
  },
  {
    id: 'revise',
    title: 'Review it, and make edits — in the same chat',
    blurb: 'Go back to Step 1\'s chat, not a new one.',
    body: [
      "This is the whole reason you kept that chat open: the AI still remembers your curriculum plan and the exact file it already wrote, so you only need to describe what's wrong — not re-explain the whole camp again.",
      "In that same chat, describe what needs to change: a session out of order, something missing, the tone not landing right for your students — be as specific as you can.",
      'Copy what comes back into the file in VS Code (the changed part, or the whole file if that\'s what it gave you), save, and re-run Step 5 to check it again before moving on.',
      "Repeat this as many times as you need — there's no limit on how many rounds of revision happen here.",
    ],
    checkpoint: "You've gone back and forth at least once, and the page now matches your plan the way you want it to.",
  },
  {
    id: 'pr',
    title: 'Send it in for review, then take it live',
    blurb: 'Pull Request, then merge it yourself once approved.',
    body: [
      'Push your branch, then open a Pull Request — either click the link Terminal prints after pushing, or go to github.com/khallinan12345/nextvillage and click "Compare & pull request" next to your branch. Write a one-line summary of the camp guide you built, and click Create Pull Request.',
      "Ask your reviewer (a platform admin) to take a look. They may ask for changes — if so, go back to Step 6, make them, then push again with the same git push command; it updates the same Pull Request automatically.",
      'Once it\'s approved: you merge it yourself. On the Pull Request page, click the green "Merge pull request" button, then confirm. That brings your camp guide onto the live site.',
    ],
    copyBlocks: [{ label: 'Push your branch', text: 'git push -u origin HEAD' }],
    checkpoint: 'Your Pull Request page shows "Merged" — your camp guide is live on nextVillage.',
  },
];

const TOTAL_STEPS = STEPS.length;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
    >
      {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const CreateAICampGuidePage: React.FC = () => {
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
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">For Team Members</p>
          <h1 className="mt-1 text-3xl font-extrabold">Create an AI Camp</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            You already have a curriculum plan — this walks you through turning it into a real,
            published guide students can use, start to finish. Seven steps: draft it with AI first,
            then get it onto the live site, with the same chat backing you up the whole way through.
          </p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {TOTAL_STEPS} steps complete</span>
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

        {/* steps */}
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
                  isDone ? 'bg-green-600 text-white' : unlocked ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}>
                  {isDone ? <Check className="h-6 w-6" /> : unlocked ? idx + 1 : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-gray-900">{step.title}</h2>
                  <p className="truncate text-sm text-gray-500">{step.blurb}</p>
                  {!unlocked && <p className="mt-1 text-xs font-semibold text-gray-400">Finish the previous step to unlock</p>}
                </div>
                {unlocked && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 p-5">
                  <div className="mb-4 space-y-2.5 text-sm leading-relaxed text-gray-700">
                    {step.body.map((p, i) => <p key={i}>{p}</p>)}
                  </div>

                  {step.copyBlocks?.map((cb, i) => (
                    <div key={i} className="mb-4 overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{cb.label}</span>
                        <CopyButton text={cb.text} />
                      </div>
                      <pre className="whitespace-pre-wrap break-words px-3 pb-3 font-mono text-[13px] leading-relaxed text-gray-800">{cb.text}</pre>
                    </div>
                  ))}

                  <div className="flex items-start gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                    <span><b className="font-bold">You'll know it worked when</b> — {step.checkpoint}</span>
                  </div>

                  {!isDone && (
                    <button
                      onClick={() => markDone(step.id)}
                      className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                    >
                      Mark this step done
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {doneCount === TOTAL_STEPS && (
          <div className="mt-2 rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <p className="font-bold text-green-800">Your camp guide is live — nice work.</p>
            <p className="mt-1 text-sm text-green-700">
              Building another camp? Start this track again — the same steps work whether it's your first camp guide or your fifth.
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

export default CreateAICampGuidePage;
