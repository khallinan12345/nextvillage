// src/pages/tutorials/PublishWebsiteGuidePage.tsx
//
// A Guide for students who've been building in the Website Builder
// (WebDevelopmentPage, /tech-skills/web-development) and are ready to turn
// that project into a real, live website — with an optional AI chatbot,
// hosted on GitHub, deployed on Vercel.
//
// The Website Builder runs in its own tab throughout this Guide; this page
// is the instructions, not the build surface. Every GitHub/Vercel step here
// maps directly onto the "GitHub" tab already built into the Website
// Builder (src/components/GitHubPanel.tsx) — no separate git tooling, no
// branches, no Pull Requests. A solo builder pushes straight to main every
// time, and Vercel redeploys automatically on every push.
//
// Same step/checkbox/cumulative-unlock pattern as AddNewGuidePage.tsx —
// reference material meant to be read and acted on, not a narrated
// walkthrough.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, Lock, Loader2, Copy, CheckCheck,
  ExternalLink,
} from 'lucide-react';

const TRACK = 'publish-website';
const BUILDER_PATH = '/tech-skills/web-development';

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
  showOpenBuilder?: boolean;
  checkpoint: string;
}

const STEPS: GuideStep[] = [
  {
    id: 'open-builder',
    title: 'Open the Website Builder in its own tab',
    blurb: 'Two tabs, one project — keep this Guide open here the whole time.',
    body: [
      "The Website Builder (Vite + React) walks you through building a real, multi-page website across three phases — Plan, Build, and Polish — while an AI writes the actual code from what you describe. This Guide doesn't replace that; it picks up once you have something worth publishing.",
      'Click the button below to open the Website Builder in a new tab. Leave this Guide open in this tab and switch back and forth as you go — you\'ll come back here each time you\'re ready for the next publishing step.',
      "Work through at least Phase 1 (Plan) and the App Shell + Home Page tasks in Phase 2 (Build) before continuing — you need an actual project with real files before there's anything to push to GitHub.",
    ],
    showOpenBuilder: true,
    checkpoint: 'You have the Website Builder open in a second tab, and you\'ve defined your site\'s purpose and built at least a home page.',
  },
  {
    id: 'chatbot',
    title: 'Add an AI chatbot to your site (optional)',
    blurb: 'If you want visitors to be able to chat with an AI on your site, this is the step where you\'ll need a key.',
    body: [
      "A lot of students get to the Interactivity & State task in Phase 2 and realize what they actually want is a chatbot visitors can talk to. That's a great feature — but it needs a real Anthropic API key for the Claude Sonnet 5 model, and that's not something you sign up for yourself. It costs real money to use, so a facilitator hands it out.",
      "When you reach that point and decide you want a chatbot, message your facilitator and ask for an Anthropic API key for the Claude Sonnet 5 model — mention what you're building so they know it's for a real project, not a test.",
      "Once you have the key, save it somewhere private — a notes app, not a chat message you'll lose. You'll use it twice: once now to test the chatbot live in the Website Builder's preview, and again later as a Vercel environment variable named VITE_ANTHROPIC_API_KEY when you deploy the finished site in Step 6.",
      "Treat it like a password. Never paste it into a prompt you send the Website Builder's own AI, and never type it directly into a file that gets pushed to GitHub — it always goes in as an environment variable, never as text in your code.",
      "Back in the Website Builder, describe the chatbot you want when you get to the Interactivity & State task, the same way you'd describe any other feature.",
      "If you don't want a chatbot, that's completely fine — mark this step done and move on to creating your accounts.",
    ],
    copyBlocks: [
      {
        label: 'Message to send your facilitator',
        text: "Hi — I'm building [your site name] in the Website Builder and I'd like to add an AI chatbot for visitors. Could you send me an Anthropic API key for the Claude Sonnet 5 model?",
      },
      {
        label: 'Prompt for the Website Builder',
        text: "Add a chatbot to my site that visitors can open from a button in the corner of every page. It should greet them, answer questions about [what your site is about], and stay open while they browse.",
      },
    ],
    checkpoint: 'Either you have an Anthropic API key saved somewhere private and a working chatbot in your preview, or you\'ve decided to skip it for now — both are fine.',
  },
  {
    id: 'github-account',
    title: 'Create a free GitHub account',
    blurb: 'This is where your project\'s code lives permanently — required before you can deploy.',
    body: [
      "GitHub stores your project's code online, in something called a repository, so it exists independently of your browser tab and can be handed to a hosting service like Vercel.",
      'Go to github.com and sign up for a free account if you don\'t already have one. Verify your email when it asks — Vercel won\'t be able to see your repositories until you do.',
      'Already have a GitHub account from another project? Skip ahead to the next step.',
    ],
    copyBlocks: [{ label: 'GitHub signup', text: 'https://github.com/signup' }],
    checkpoint: 'You can sign in at github.com and see your own username in the top-right corner.',
  },
  {
    id: 'vercel-account',
    title: 'Create a free Vercel account, linked to GitHub',
    blurb: 'Vercel is what turns your project into a real web address anyone can visit.',
    body: [
      'Go to vercel.com and click sign up. Choose "Continue with GitHub" — not a separate email and password. Signing up this way is what lets Vercel see and import your repositories in the next steps.',
      'Approve the authorization screen GitHub shows you. This only grants Vercel access to your repositories — it doesn\'t give Vercel your password.',
    ],
    copyBlocks: [{ label: 'Vercel signup', text: 'https://vercel.com/signup' }],
    checkpoint: 'You\'re signed into a Vercel dashboard, and it shows your GitHub username as the connected account.',
  },
  {
    id: 'push-to-github',
    title: 'Push your project to GitHub',
    blurb: 'Straight onto main — no branches, no Pull Requests, because it\'s just you.',
    body: [
      'Switch to your Website Builder tab. In the right-hand panel, click the GitHub tab (next to Teaching and Code).',
      'You\'ll need a Personal Access Token (PAT) — a password-like key that lets the Website Builder push files to your GitHub account on your behalf. The panel has its own "How to get a GitHub token" guide built in: your profile photo → Settings → Developer settings → Personal access tokens (classic) → Generate new token (classic), with the "repo" scope checked.',
      'Paste the token into Step 1 of the panel and click Connect to GitHub.',
      'In Step 2, give your repository a name and click Create Repository.',
      'In Step 3, click Push to GitHub and wait for every file to upload.',
      "Because you're the only person working on this project, every push goes straight onto main. That's different from a team project — there's no branch to create first and no Pull Request for someone else to review before it counts. Whatever you push is immediately the real thing.",
    ],
    checkpoint: 'Clicking your new repository\'s link opens a real GitHub repo containing your project files, on the main branch.',
  },
  {
    id: 'deploy-vercel',
    title: 'Deploy on Vercel',
    blurb: 'Turn that GitHub repo into a real, live website address.',
    body: [
      "Right after your push finishes, the same GitHub tab shows a \"Deploy to Vercel\" section with a one-click import link. Click it — or go to vercel.com/new yourself and import the repository you just created.",
      'Vercel detects it\'s a Vite project automatically, so you don\'t need to configure a build command.',
      "Before you click Deploy, add any environment variables your site actually needs, using the exact names your project expects: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY if your site uses a database, and VITE_ANTHROPIC_API_KEY (the key from Step 2) if you added a chatbot. Leave out whichever you didn't use.",
      'Click Deploy and wait — Vercel gives you a live address ending in .vercel.app when it finishes.',
    ],
    checkpoint: 'Opening your .vercel.app address in a fresh browser tab shows your actual site, live on the internet.',
  },
  {
    id: 'keep-shipping',
    title: 'Keep building, then redeploy',
    blurb: 'Vercel republishes automatically every time you push more changes.',
    body: [
      "Publishing once isn't the end — go back to the Website Builder tab and keep working through Phase 2 and Phase 3 (Polish).",
      'Whenever you\'re ready to publish what you\'ve added, return to the GitHub tab in the Website Builder and click Push to GitHub again. It commits straight to main, same as the first time.',
      "Vercel watches your GitHub repository and automatically rebuilds and republishes your site within a minute or two of any push to main — you never have to click Deploy again by hand.",
      "If you added a chatbot and it stops responding once live, the most common cause is that VITE_ANTHROPIC_API_KEY was set for your local preview but never added to your Vercel project's environment variables — check Project Settings → Environment Variables on Vercel.",
    ],
    checkpoint: 'You\'ve pushed at least one round of new changes after your first deploy, and your live site updated to match without you touching Vercel directly.',
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

const PublishWebsiteGuidePage: React.FC = () => {
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
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Tech-Skills</p>
          <h1 className="mt-1 text-3xl font-extrabold">Publish Your Website: GitHub &amp; Vercel</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            Runs alongside the Website Builder, open in a second tab. Seven steps — add an AI chatbot if you
            want one, then create your accounts, push your project straight to your GitHub repo's main branch,
            and deploy it live on Vercel.
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

                  {step.showOpenBuilder && (
                    <button
                      onClick={() => window.open(BUILDER_PATH, '_blank', 'noopener')}
                      className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open the Website Builder
                    </button>
                  )}

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
            <p className="font-bold text-green-800">Your site is live, on your own GitHub and Vercel accounts.</p>
            <p className="mt-1 text-sm text-green-700">
              Every future push to your repo's main branch republishes it automatically — no extra steps needed.
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

export default PublishWebsiteGuidePage;
