// src/pages/tutorials/AddNewGuidePage.tsx
//
// A Guide about adding Guides — walks a team member with no prior coding
// experience through building a new page for /tutorials themselves: clone,
// branch, hand the work to Claude (claude.ai, not this platform's own AI
// features), test locally, open a PR. Kevin (or whoever reviews) merges by
// hand from there — this track stops at "PR opened."
//
// The only real gate before starting is a GitHub account plus an invite to
// the team as a collaborator — everything else (GitHub Desktop, VS Code,
// Node.js, a claude.ai account) is introduced inline, at the step that
// actually needs it, rather than a big up-front prerequisite list.
//
// Same step/checkbox/cumulative-unlock pattern as FishMarketTutorialPage.tsx,
// without that page's voice narration and slide deck — this is reference
// material meant to be read and acted on, not a narrated walkthrough.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, Lock, Loader2, Copy, CheckCheck,
} from 'lucide-react';

const TRACK = 'add-new-guide';

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
    id: 'clone',
    title: 'Get the project onto your computer',
    blurb: 'Called "cloning" — your own local copy of the whole site.',
    body: [
      "You'll need a GitHub account with access to the nextvillage repository — ask a platform admin to add you as a collaborator if you don't have this yet. That's the only real prerequisite; everything below you install as you go.",
      'Install GitHub Desktop (free, at desktop.github.com) — it does the git parts of this track with buttons instead of typed commands. Sign in with your GitHub account.',
      'In GitHub Desktop: File → Clone Repository. Find khallinan12345/nextvillage in the list, or paste the URL below if it doesn\'t show up. Pick a folder on your computer and click Clone.',
      "Ask an admin for the project's .env.local file — a small file of private keys that lets your copy talk to the real database. Save it directly inside the new nextvillage folder, next to package.json. Never share this file or upload it anywhere; git already ignores it.",
    ],
    copyBlocks: [{ label: 'Repository URL', text: 'https://github.com/khallinan12345/nextvillage' }],
    checkpoint: 'A folder named nextvillage exists on your computer, GitHub Desktop shows it as your Current Repository, and it contains a file called .env.local.',
  },
  {
    id: 'branch',
    title: 'Make your own safe workspace',
    blurb: 'Called a "branch" — nothing you do here can break the live site.',
    body: [
      "A branch is your own copy of the project to work in. Nothing you do on it touches the real site, or anyone else's work, until someone with review rights specifically decides to bring your changes in — so there's no way to break anything from here on.",
      'In GitHub Desktop: Current Branch → New Branch. Name it after what you\'re building, e.g. yourname/camp-name-guide.',
      'Click Create Branch, and confirm the "Current Branch" button at the top now shows your new branch name instead of main.',
    ],
    checkpoint: 'GitHub Desktop\'s "Current Branch" button shows your branch name, not main.',
  },
  {
    id: 'ask-claude',
    title: 'Ask Claude to write the page',
    blurb: 'The one place you\'ll actually "write code" — except Claude writes it, you paste it.',
    body: [
      'Existing Guides come in two shapes. If yours is a facilitator run-sheet or a build-it-once reference (like this one), point Claude at src/pages/tutorials/FishMarketTutorialPage.tsx as the pattern. If yours is a locked, scored practice track a learner works through activity by activity, point it at src/pages/tutorials/SkillDevelopmentStartPage.tsx instead. Open whichever fits in VS Code, select all, copy.',
      'Go to claude.ai and start a new chat — this is a separate site from nextVillage itself, sign up free if you don\'t have an account. Attach any source material (a PDF, a doc, whatever your Guide is based on) with the paperclip icon.',
      'Paste the prompt below, swapping in your own example file where it says [PASTE THE FILE HERE], and describing your own Guide where marked.',
      'Read what comes back. It should hand you three things: the full code for one new file, and small find-this-line/add-this-line edits for two other files. If anything is confusing, just ask — "explain this like I\'ve never edited code before" works.',
    ],
    copyBlocks: [{
      label: 'Prompt to send Claude',
      text: `I'm working on a React + TypeScript website called nextVillage (also known as "Girls AIing & Vibing"). It's built with Vite, React Router, Tailwind CSS, and Supabase. I need you to write a new page for it, called a "Guide."

Here is the full code of an existing Guide page on the site, so you can see exactly how Guides are normally built — styling, layout, imports, structure:

[PASTE THE FILE HERE]

Here's what my new Guide needs to teach or walk through:
[DESCRIBE YOUR GUIDE HERE — who it's for, what it covers, and attach any source material]

Please keep the visual style consistent with the example page above — same header treatment, same Tailwind classes and color approach, same AppLayout wrapper, same general structure — so it looks like it belongs on the same site.

Please also tell me:
- The exact filename and folder to save this new file as, following the same convention as the example file
- The exact small changes needed in two OTHER existing files to make this new page show up in the site's Guides list and be reachable by URL — show me exactly what line to find and what line to add in each, explained the way you'd explain it to someone who has never edited code before

Write everything out in full — I'll be copying your code directly into files, so please don't skip anything or say "add your styling here."`,
    }],
    checkpoint: 'Claude has given you one complete new file, plus two "find this line, add this line" edits for two other files.',
  },
  {
    id: 'apply',
    title: "Put Claude's code into the project",
    blurb: 'Three files change: one brand new, two with a couple of lines added.',
    body: [
      "Install VS Code (free, at code.visualstudio.com) if you haven't already, and open the nextvillage folder in it.",
      'Right-click the folder Claude told you to use (likely src/pages/tutorials) → New File → the exact filename Claude gave you. Paste in its code. Save.',
      'Open the first of the two other files Claude mentioned. Find the exact line it told you to find, add the line it told you to add. Save. Do the same for the second file.',
    ],
    checkpoint: "All three files are saved, and GitHub Desktop's Changes tab lists all three as changed.",
  },
  {
    id: 'test',
    title: 'Test it for real, on your own computer',
    blurb: 'Run the actual site on your machine and click through your new page.',
    body: [
      "Install Node.js (the LTS version, free at nodejs.org) if you haven't already — it's what lets your computer run the site.",
      'Open Terminal. Type "cd " (with a trailing space, don\'t press Enter yet), drag the nextvillage folder in from Finder to fill in the path, then press Enter.',
      'First time only, run npm install and wait — it can take five to ten minutes, that\'s normal. Then run npm run dev:frontend.',
      'A web address will appear, something like http://localhost:5173 — open it in your browser. Sign in, click Guides in the navigation, find your new page, click through it.',
      'When you\'re done, click back in Terminal and press Ctrl+C to stop the site.',
    ],
    copyBlocks: [
      { label: 'First time only', text: 'npm install' },
      { label: 'Every time', text: 'npm run dev:frontend' },
    ],
    checkpoint: 'Your new Guide appears in the Guides list, opens without a blank or broken page, and every link on it goes somewhere real.',
  },
  {
    id: 'pr',
    title: 'Send your work in for review',
    blurb: 'Called a Pull Request — a request for someone to review and merge your work.',
    body: [
      'Open GitHub Desktop — your changed files are listed on the left. Write a one-line summary of what you built, then click Commit.',
      'Click Push origin at the top of the window.',
      'Click Create Pull Request — this opens GitHub in your browser with everything already filled in. Click the green Create Pull Request button there too.',
      "That's the end of this track. Whoever reviews will test it themselves and merge it in when it's ready — that part isn't on you.",
    ],
    checkpoint: 'You have a Pull Request page open on GitHub with your branch name on it.',
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

const AddNewGuidePage: React.FC = () => {
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
          <h1 className="mt-1 text-3xl font-extrabold">Adding a New Guide</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            You don't need to know how to code already. Six steps, in order — at each one you'll either
            click buttons in an app or copy-paste text Claude wrote for you.
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
            <p className="font-bold text-green-800">You've opened your Pull Request — nice work.</p>
            <p className="mt-1 text-sm text-green-700">
              If you ever get stuck on any step, paste the exact error text into your Claude chat and ask what it means.
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

export default AddNewGuidePage;
