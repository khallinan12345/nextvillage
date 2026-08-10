// src/pages/tutorials/FishMarketTutorialPage.tsx
//
// "The Fish Market Build" — a step-by-step, narrated tutorial track that walks a
// student from the no-code Website Builder through Vite/React and on to a
// full-stack app with Supabase, all against one real problem: a family selling
// fish in the Oloibiri market.
//
// This replaces what would otherwise have been a video series. Steps carry
// copy-to-clipboard prompts (students must run these EXACTLY, so transcribing
// them by ear from a video was the wrong format), and "swivel" steps open the
// AI Playground in a second tab with the prompt already copied — the two-tab
// habit is the pedagogical core of the track, so the interface performs it
// rather than merely recommending it.
//
// Narration uses the platform's existing useVoice hook, so every step is
// speakable in English or Nigerian Pidgin with no audio files to maintain.
// Steps may optionally set `audioUrl` to play a real recording instead — used
// for the two places where a peer's own voice matters more than TTS.
//
// Progress is written to localStorage immediately (works offline, works logged
// out) and mirrored to `tutorial_progress` in Supabase when a user is signed in.
// Gate steps require a real artifact — a published site URL, a GitHub Pages
// address — before the episode will close. A checkbox can be clicked without
// doing the work; a URL that loads cannot.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import {
  Check, Lock, Copy, CheckCheck, ExternalLink, Volume2, VolumeX,
  RotateCw, ChevronDown, ChevronRight, Link2, PlayCircle, Loader2,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'swivel' | 'gate' | 'watch';

interface Gate {
  label: string;
  placeholder: string;
  /** Return null when valid, or a short message explaining what's wrong. */
  validate: (value: string) => string | null;
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  /** Prompt text with a copy button. For swivels this is what gets copied. */
  prompt?: string;
  promptNote?: string;
  /** Slide image shown above the step, from public/tutorials/slides/. */
  slide?: string;
  /** Short aside rendered in a tinted box. */
  aside?: string;
  gate?: Gate;
  /** Optional recorded narration; falls back to TTS when absent. */
  audioUrl?: string;
  /** Overrides the spoken text (defaults to title + body). */
  narration?: string;
}

interface Episode {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  duration: string;
  slide?: string;
  available: boolean;
  steps: Step[];
}

const TRACK = 'fish-market';
const SLIDES = '/tutorials/slides/';

/* ───────────────────────────── content ───────────────────────────── */

const EPISODES: Episode[] = [
  {
    id: 'ep0',
    number: '0',
    title: 'Start Here',
    subtitle: 'The whole journey, and the one habit that matters',
    duration: 'about 30 minutes',
    slide: '00-title-ep0.png',
    available: true,
    steps: [
      {
        id: 'ep0-welcome',
        kind: 'watch',
        title: 'The family and the fish',
        audioUrl: '/tutorials/audio/divinegift-intro.mp3',
        body: [
          'Somewhere in Oloibiri there is a family. They go out, they come back with fish, they sell it in the market. They have done this for years and they are good at it.',
          'Here is what they do not have. A record. When a buyer asks the price of catfish today, they answer from memory. When they wonder whether Saturday is really better than Tuesday, they answer from memory. When last month was worse than the month before, they feel it — but they cannot see it.',
          'Over the next four episodes you are going to build them something. Not a school exercise. A tool a real family could use tomorrow.',
        ],
      },
      {
        id: 'ep0-journey',
        kind: 'read',
        slide: '05-journey-4.png',
        title: 'The same problem, four times',
        body: [
          'You are going to build the same thing three times. Same family, same market, same problem — each time deeper than the last. That repetition is not laziness. It is the design. Each time round you will understand more of what is underneath.',
          'Then a fourth episode that is not about code at all.',
        ],
      },
      {
        id: 'ep0-outcome1',
        kind: 'read',
        slide: '06-outcome-ep1.png',
        title: 'Episode 1 — what you get',
        body: [
          'You describe a website and Claude writes every line of it. You never see the code.',
          'By the end of one evening you will have a four-page website with your own photographs from the market, published at a real address you can send to somebody on WhatsApp.',
          'What you will not have: anything that works. It is a poster. It cannot calculate a price and it cannot remember a sale.',
        ],
      },
      {
        id: 'ep0-outcome2',
        kind: 'read',
        slide: '07-outcome-ep2.png',
        title: 'Episode 2 — what you get',
        body: [
          'You own the code. Every file is in front of you. Claude still writes it, but you direct it, you read it, and the platform scores how well you asked.',
          'You will finish with an app that actually calculates — pick a fish, type the weight and the price, watch the total appear, record the sale.',
          'What you will not have: memory. Press refresh and every sale disappears. We are telling you now so you are not confused when it happens. It is supposed to.',
        ],
      },
      {
        id: 'ep0-outcome3',
        kind: 'read',
        slide: '08-outcome-ep3.png',
        title: 'Episode 3 — what you get',
        body: [
          'The app remembers. You will make your own free Supabase account, design database tables from the family\u2019s real problem, and connect them to the app you already built.',
          'Then the payoff — a screen that reads months of sales back and tells the family something they could not see before. Which species really pays. Which day is best. How much of each catch went unsold.',
          'By the end it will be live at your own address, running from your own GitHub repository.',
        ],
      },
      {
        id: 'ep0-outcome4',
        kind: 'read',
        slide: '09-outcome-ep4.png',
        title: 'Episode 4 — what you get',
        body: [
          'You give it to a family and you watch. No code. You sit with people who sell fish, you show them, and you watch their hands.',
          'That last one is the one that turns you into a developer. The three before it are practice.',
        ],
      },
      {
        id: 'ep0-three-things',
        kind: 'read',
        slide: '10-three-things.png',
        title: 'You finish with three things',
        body: [
          'A live application at a public address. A GitHub repository with your name on it, which is the closest thing our field has to a certificate. And one habit, which is next, and which honestly matters more than the other two.',
        ],
        aside: 'Episode 1 is an evening. Episode 2 is about a week. Episode 3 is two weeks and you should not rush it. Nobody is racing you.',
      },
      {
        id: 'ep0-two-tabs',
        kind: 'read',
        slide: '12-two-tabs.png',
        title: 'Your workshop: the AI Playground',
        body: [
          'The most important tool in this track is not any of the three build pages. It is the AI Playground. No tasks, no phases, nothing graded — just you and Claude. A prompt you are unsure about, an error you do not understand, a concept that did not land, code you want explained back in plain words.',
          'The build pages will teach you web development. The Playground is where you become someone who does not need the build pages.',
          'So here is the rule for everything that follows. Two tabs. The build page asks you questions. The Playground is where you work out what to answer, and where you go when something breaks.',
        ],
        aside: 'Every purple step in this track is a swivel — it copies a prompt and opens the Playground in a second tab. Do them. They are not optional extras; they are where the learning happens.',
      },
      {
        id: 'ep0-ladder',
        kind: 'read',
        slide: '13-thinning-ladder.png',
        title: 'The help thins on purpose',
        body: [
          'In Episode 1 you get the exact words to type. Copy them.',
          'In Episode 2 you get the goal only, and you write the prompt yourself.',
          'In Episode 3 you get a marker that says swivel here, and nothing else.',
          'In Episode 4 you get nothing. That is not us getting lazy. It is the whole point of the track.',
        ],
      },
      {
        id: 'ep0-playground-tour',
        kind: 'do',
        title: 'Open the Playground and set it up',
        body: [
          'Open the AI Playground now and do three things.',
          'Pick your model at the top. Sonnet 5 for anything needing real thinking — design decisions, hard bugs, code you want reasoned about. Haiku for quick lookups; it is faster and cheaper.',
          'Find the paperclip and the pin. The paperclip attaches a file to one message only — good for an error screenshot. The pin keeps a file available for the whole conversation without pasting it again. When you work on one file for an hour, pin it once and then just talk.',
          'Notice your token budget. Roughly 25,000 tokens every three hours, in and out. Paste a 500-line file five times and you have spent your afternoon. That is not the platform being mean — every message costs real money, and asking for exactly what you need is a professional skill.',
        ],
        aside: 'When the Playground gives you code it ends by asking what you think the change does. Answer it, in your own words. Nobody is marking it — but a person who can explain the code they were given is a developer, and a person who cannot is somebody holding a file they do not own.',
      },
      {
        id: 'ep0-swivel-1',
        kind: 'swivel',
        title: 'Swivel 1 — what pages does this need?',
        body: [
          'Your first swivel. Copy this exactly, open the Playground, and paste it. Answer whatever it asks you back.',
        ],
        prompt:
          "I'm building a website for a fish-selling family in Oloibiri. I think it needs a home page and a page showing today's catch and prices.\n\nWhat pages am I missing that a buyer walking past — looking at a phone, in the market, with thirty seconds — would actually want? Keep it short.",
        promptNote: 'Come back with your page list written down on paper.',
      },
      {
        id: 'ep0-checklist',
        kind: 'gate',
        slide: '14-checklist.png',
        title: 'Before Episode 1',
        body: [
          'Four things. Two take five minutes and one takes a walk.',
          'One — your nextvillage login. You have it or you would not be reading this.',
          'Two — photographs. Go to the market this week and take pictures. Your stall. Fish on ice. A boat. Real Oloibiri photographs, not pictures off the internet: a website about this market showing somebody else\u2019s fish is a website nobody here will trust. Three good pictures is enough.',
          'Three — a free GitHub account. You will not need it until Episode 2, but make it now while you are thinking about it. Use a username you would be happy showing an employer, because one day you will.',
          'Four — the swivel above, actually done.',
        ],
        gate: {
          label: 'Your GitHub username',
          placeholder: 'e.g. divinegift-m',
          validate: v =>
            /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(v.trim())
              ? null
              : 'That does not look like a GitHub username yet. Letters, numbers and hyphens only.',
        },
        aside: 'You will make a free Supabase account in Episode 3 — and when you do, sign in with GitHub. One login for everything.',
      },
    ],
  },

  {
    id: 'ep1',
    number: '1',
    title: 'Make It Real by Tonight',
    subtitle: 'Website Builder — multiple pages, real photographs, published',
    duration: 'about one evening',
    slide: '01-title-ep1.png',
    available: true,
    steps: [
      {
        id: 'ep1-rule',
        kind: 'read',
        title: 'The rule for this episode',
        body: [
          'On the Website Builder you describe a website and Claude builds every page. You never see the code. Today that is on purpose.',
          'Two requirements. Multiple pages — one page does not count. And real photographs. A page with no picture of a fish is a page nobody in the market will trust.',
        ],
      },
      {
        id: 'ep1-images',
        kind: 'do',
        title: 'Upload your photographs first',
        body: [
          'Open the Website Builder. Before you type anything, click the image button at the bottom left and upload your three market photographs.',
          'Upload them first, before you describe the site. Claude can only use images it already has. Upload them afterwards and you spend a turn asking again.',
        ],
        aside: 'Name them something you will recognise in a prompt — market.jpg, catfish.jpg, boat.jpg.',
      },
      {
        id: 'ep1-first-prompt',
        kind: 'do',
        title: 'Describe the whole site',
        body: [
          'Paste this into the Website Builder chat. Change the family name and the details to match your own market if you like — but keep the shape.',
        ],
        prompt:
          "A website for the Okoro family, who catch and sell fish at the Oloibiri market. Four pages: Home, Today's Catch, About Our Family, and Contact.\n\nHome: use market.jpg as the header background, a short welcome, and the three fish we sell most.\n\nToday's Catch: a table of fish species with price per kilo, and catfish.jpg beside it.\n\nAbout Our Family: boat.jpg, a few sentences about fishing in Oloibiri.\n\nContact: phone number, where our stall is in the market, and our hours.\n\nColors: deep blue and white, like water. Large text — most people will open this on a phone.",
        aside: 'Notice what that prompt does. It does not say "make a nice fish website." It names every page, says what goes on each, says which photo goes where, and says who is looking and on what device. That specificity is the skill.',
      },
      {
        id: 'ep1-truncation',
        kind: 'read',
        title: 'It probably just failed. Good.',
        body: [
          'Most people get an error here: the site was too complex to finish in one go. Four detailed pages is a lot to write in one response and it ran out of room.',
          'Nothing is broken. But before you fix it — swivel. Get the habit on an easy one.',
        ],
      },
      {
        id: 'ep1-swivel-2',
        kind: 'swivel',
        title: 'Swivel 2 — what actually happened?',
        body: ['Copy, open the Playground, paste. Two sentences back, and now you understand a limit that applies to every AI tool you will ever use.'],
        prompt:
          'A no-code website builder gave me this error: "That site was too complex to finish in one go — try describing fewer pages, or ask for one page at a time." I asked for four pages with detailed content for each.\n\nIn one or two sentences — what actually happened, and what is the general rule for next time?',
      },
      {
        id: 'ep1-two-pages',
        kind: 'do',
        title: 'Build two pages first',
        body: ['Back on the Website Builder. Smaller ask.'],
        prompt:
          "Build just two pages first: Home and Today's Catch.\n\nHome: market.jpg as the header background, a short welcome for the Okoro family who sell fish at the Oloibiri market, and the three fish we sell most.\n\nToday's Catch: a table of fish species and price per kilo, with catfish.jpg beside it.\n\nDeep blue and white. Large text for phone screens.",
      },
      {
        id: 'ep1-add-pages',
        kind: 'do',
        title: 'Add the other two, one at a time',
        body: [
          'Same chat — it keeps everything you already have. Send these one after the other, checking the preview between them.',
        ],
        prompt:
          'Add an "About Our Family" page using boat.jpg, with a few sentences about fishing in Oloibiri. Keep the other two pages exactly as they are.',
        aside: '"Keep the other two pages exactly as they are." One clause, and it prevents most of the damage students do to their own working sites. Then send the Contact page request the same way, and ask for the same navigation bar on all four pages.',
      },
      {
        id: 'ep1-swivel-3',
        kind: 'swivel',
        title: 'Swivel 3 — improve it properly',
        body: [
          'Do not ask Claude to "make it better." That is not a prompt, it is a shrug. Work out a real question first — and notice that this one brings your own answer and asks to be checked.',
        ],
        prompt:
          "I built a four-page site for a fish-selling family in Oloibiri: Home, Today's Catch, About Our Family, Contact. A buyer opens it on a phone, standing in the market, weak connection, maybe thirty seconds of attention.\n\nI think the prices need to be higher up the page. Tell me if I'm right, and give me two other specific changes — not general advice.",
        promptNote: 'Then go back to the Website Builder and ask for the specific changes that came out of it.',
      },
      {
        id: 'ep1-publish',
        kind: 'gate',
        title: 'Name it and publish',
        body: [
          'Type a name in the box at the top of the Website Builder and press Publish.',
          'That gives you a real public address. Copy it, send it to somebody on WhatsApp, and watch it open on their phone. Under an hour, and you have never written a line of code.',
          'Paste the address below to finish Episode 1.',
        ],
        gate: {
          label: 'Your published site address',
          placeholder: 'https://…/tech-skills/sites/…',
          validate: v => {
            const s = v.trim();
            if (!/^https?:\/\//i.test(s)) return 'Paste the full address, starting with https://';
            if (!/\/sites\//.test(s)) return 'That does not look like your published site address. Publish first, then copy the address from your browser.';
            return null;
          },
        },
      },
      {
        id: 'ep1-honest',
        kind: 'read',
        title: 'Now the honest part',
        body: [
          'This site is a poster. It is beautiful and it does nothing. It cannot calculate a price. It cannot remember a sale. Tomorrow the prices change and somebody has to come back here and ask Claude to edit them by hand.',
          'To fix that you need to own the code.',
        ],
      },
      {
        id: 'ep1-swivel-4',
        kind: 'swivel',
        title: 'Swivel 4 — homework for Episode 2',
        body: ['Do this one before you start the next episode.'],
        prompt:
          'My fish website looks good but it only displays information — the family still prices from memory. What would the tool need to actually DO, not show, for them to stop guessing? Give me a short list, then ask me which one matters most.',
      },
    ],
  },

  {
    id: 'ep2',
    number: '2',
    title: 'When You Own the Code',
    subtitle: 'Vite + React — an app that calculates',
    duration: 'about one week',
    slide: '02-title-ep2.png',
    available: false,
    steps: [],
  },
  {
    id: 'ep3',
    number: '3',
    title: 'Make It Remember',
    subtitle: 'React + Supabase, published from GitHub Pages',
    duration: 'about two weeks',
    slide: '03-title-ep3.png',
    available: false,
    steps: [],
  },
  {
    id: 'ep4',
    number: '4',
    title: 'Hand It Over',
    subtitle: 'One hour with a real family. No screen.',
    duration: 'one hour',
    slide: '04-title-ep4.png',
    available: false,
    steps: [],
  },
];

const ALL_STEP_IDS = EPISODES.flatMap(e => e.steps.map(s => s.id));

/* ──────────────────────────── small parts ─────────────────────────── */

const CopyBlock: React.FC<{ text: string; tone?: 'amber' | 'purple' }> = ({ text, tone = 'amber' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older mobile browsers: fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more we can do */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  const ring = tone === 'purple' ? 'border-purple-300 bg-purple-50' : 'border-amber-300 bg-amber-50';
  const btn = tone === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-amber-600 hover:bg-amber-700';
  return (
    <div className={`relative rounded-xl border ${ring} p-4 pr-32`}>
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-gray-800">{text}</pre>
      <button
        onClick={copy}
        className={`absolute right-3 top-3 flex items-center gap-1.5 rounded-lg ${btn} px-3 py-2 text-xs font-bold text-white transition-colors`}
      >
        {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

/* ──────────────────────────── main page ──────────────────────────── */

const FishMarketTutorialPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [openEpisode, setOpenEpisode] = useState('ep0');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');
  const [speakingStep, setSpeakingStep] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
  } = useVoice(voiceMode === 'pidgin');

  useEffect(() => { if (!isSpeaking) setSpeakingStep(null); }, [isSpeaking]);

  /* ── load progress: localStorage first (instant, offline), then Supabase ── */

  const lsKey = `tutorial:${TRACK}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const p = JSON.parse(raw);
        setDone(new Set<string>(p.completed ?? []));
        setArtifacts(p.artifacts ?? {});
      }
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tutorial_progress')
        .select('completed_steps, artifacts')
        .eq('user_id', userId)
        .eq('track', TRACK)
        .maybeSingle();
      if (cancelled || error || !data) return;
      // Union with anything done offline — the cloud copy never deletes local work.
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
      setArtifacts(prev => ({ ...(data.artifacts ?? {}), ...prev }));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback((nextDone: Set<string>, nextArtifacts: Record<string, string>) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({
        completed: [...nextDone], artifacts: nextArtifacts, updated: Date.now(),
      }));
    } catch { /* private browsing, quota — progress still works in memory */ }
    if (!userId) return;
    setSyncing(true);
    supabase
      .from('tutorial_progress')
      .upsert({
        user_id: userId,
        track: TRACK,
        completed_steps: [...nextDone],
        artifacts: nextArtifacts,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, userId]);

  /* ── progression ── */

  const stepsOf = (ep: Episode) => ep.steps;

  const firstIncompleteIndex = useCallback((ep: Episode) => {
    const idx = ep.steps.findIndex(s => !done.has(s.id));
    return idx === -1 ? ep.steps.length : idx;
  }, [done]);

  const isUnlocked = useCallback((ep: Episode, index: number) => index <= firstIncompleteIndex(ep), [firstIncompleteIndex]);

  const complete = (step: Step, value?: string) => {
    const nextDone = new Set(done); nextDone.add(step.id);
    const nextArt = value !== undefined ? { ...artifacts, [step.id]: value } : artifacts;
    setDone(nextDone); setArtifacts(nextArt); persist(nextDone, nextArt);
    setExpanded(prev => { const n = new Set(prev); n.delete(step.id); return n; });
  };

  const uncomplete = (step: Step) => {
    const nextDone = new Set(done); nextDone.delete(step.id);
    setDone(nextDone); persist(nextDone, artifacts);
  };

  const submitGate = (step: Step) => {
    const v = (gateDraft[step.id] ?? '').trim();
    const err = step.gate!.validate(v);
    if (err) { setGateError(p => ({ ...p, [step.id]: err })); return; }
    setGateError(p => ({ ...p, [step.id]: '' }));
    complete(step, v);
  };

  /* ── narration ── */

  const narrationFor = (s: Step) => s.narration ?? [s.title, ...s.body, s.aside ?? ''].filter(Boolean).join('. ');

  const speakStep = (s: Step) => {
    if (speakingStep === s.id) {
      cancelSpeech(); audioRef.current?.pause(); setSpeakingStep(null); return;
    }
    cancelSpeech(); audioRef.current?.pause();
    setSpeakingStep(s.id);
    if (s.audioUrl) {
      const a = new Audio(s.audioUrl);
      audioRef.current = a;
      a.onended = () => setSpeakingStep(null);
      a.onerror = () => { hookSpeak(narrationFor(s)); };   // recording missing → TTS
      void a.play().catch(() => hookSpeak(narrationFor(s)));
      return;
    }
    hookSpeak(narrationFor(s));
  };

  useEffect(() => () => { cancelSpeech(); audioRef.current?.pause(); }, [cancelSpeech]);

  /* ── swivel ── */

  const swivel = async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); } catch { /* copy button is still there */ }
    window.open('/ai-playground', '_blank', 'noopener');
  };

  /* ── derived ── */

  const totalSteps = ALL_STEP_IDS.length;
  const doneCount = useMemo(() => ALL_STEP_IDS.filter(id => done.has(id)).length, [done]);
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read:   { badge: 'bg-slate-100 text-slate-600',   label: 'Read',   ring: 'border-gray-200' },
    do:     { badge: 'bg-amber-100 text-amber-800',   label: 'Do',     ring: 'border-amber-200' },
    swivel: { badge: 'bg-purple-100 text-purple-800', label: 'Swivel', ring: 'border-purple-300' },
    gate:   { badge: 'bg-cyan-100 text-cyan-800',     label: 'Prove it', ring: 'border-cyan-300' },
    watch:  { badge: 'bg-cyan-100 text-cyan-800',     label: 'Watch',  ring: 'border-cyan-200' },
  };

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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">The Fish Market Build</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                Build one real tool three times — a poster, then a calculator, then a system that remembers.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-slate-600">
                <button
                  onClick={() => setVoiceMode('english')}
                  className={`px-2.5 py-1.5 text-xs font-bold ${voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >🇬🇧 <span className="hidden sm:inline">English</span></button>
                <button
                  onClick={() => setVoiceMode('pidgin')}
                  title="Nigerian English / Pidgin voice"
                  className={`px-2.5 py-1.5 text-xs font-bold ${voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >🇳🇬 <span className="hidden sm:inline">Pidgin</span></button>
              </div>
              <button
                onClick={() => { setVoiceOn(v => { if (v) { cancelSpeech(); audioRef.current?.pause(); setSpeakingStep(null); } return !v; }); }}
                title={voiceOn ? 'Turn narration off' : 'Turn narration on'}
                className={`rounded-lg p-2 ${voiceOn ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {totalSteps} steps</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {!userId && (
              <p className="mt-2 text-xs text-slate-400">
                Your progress is saved on this device. Sign in to keep it across devices.
              </p>
            )}
          </div>
        </div>

        {/* episodes */}
        {EPISODES.map(ep => {
          const open = openEpisode === ep.id;
          const epDone = ep.steps.filter(s => done.has(s.id)).length;
          const epComplete = ep.steps.length > 0 && epDone === ep.steps.length;

          return (
            <div key={ep.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => setOpenEpisode(open ? '' : ep.id)}
                disabled={!ep.available}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${ep.available ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  epComplete ? 'bg-green-600 text-white' : ep.available ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}>
                  {epComplete ? <Check className="h-6 w-6" /> : ep.available ? ep.number : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h2 className="text-lg font-bold text-gray-900">Episode {ep.number} · {ep.title}</h2>
                    <span className="text-xs text-gray-400">{ep.duration}</span>
                  </div>
                  <p className="truncate text-sm text-gray-500">{ep.subtitle}</p>
                  {ep.available && ep.steps.length > 0 && (
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${(epDone / ep.steps.length) * 100}%` }} />
                    </div>
                  )}
                  {!ep.available && <p className="mt-1 text-xs font-semibold text-gray-400">Coming next</p>}
                </div>
                {ep.available && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 sm:p-6">
                  {ep.slide && (
                    <img src={SLIDES + ep.slide} alt="" className="mb-6 w-full rounded-xl shadow-sm" loading="lazy" />
                  )}

                  {stepsOf(ep).map((step, i) => {
                    const unlocked = isUnlocked(ep, i);
                    const isDone = done.has(step.id);
                    const isOpen = unlocked && (!isDone || expanded.has(step.id));
                    const st = KIND_STYLE[step.kind];

                    return (
                      <div
                        key={step.id}
                        className={`mb-3 rounded-xl border bg-white transition-all ${isDone ? 'border-green-200' : st.ring} ${!unlocked ? 'opacity-50' : ''}`}
                      >
                        <button
                          onClick={() => {
                            if (!unlocked) return;
                            setExpanded(prev => {
                              const n = new Set(prev);
                              n.has(step.id) ? n.delete(step.id) : n.add(step.id);
                              return n;
                            });
                          }}
                          className="flex w-full items-center gap-3 p-4 text-left"
                        >
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isDone ? 'bg-green-600 text-white' : unlocked ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>
                            {isDone ? <Check className="h-4 w-4" /> : unlocked ? i + 1 : <Lock className="h-3 w-3" />}
                          </div>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${st.badge}`}>{st.label}</span>
                          <span className={`flex-1 text-sm font-semibold ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.title}</span>
                          {voiceOn && unlocked && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={e => { e.stopPropagation(); speakStep(step); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); speakStep(step); } }}
                              className={`rounded p-1.5 ${speakingStep === step.id ? 'bg-cyan-100 text-cyan-700' : 'text-gray-400 hover:bg-gray-100'}`}
                            >
                              {step.audioUrl ? <PlayCircle className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                            </span>
                          )}
                        </button>

                        {isOpen && (
                          <div className="border-t border-gray-100 px-4 pb-4 pt-4 sm:px-6">
                            {step.slide && (
                              <img src={SLIDES + step.slide} alt="" className="mb-4 w-full rounded-lg" loading="lazy" />
                            )}

                            {step.body.map((p, k) => (
                              <p key={k} className="mb-3 text-[15px] leading-relaxed text-gray-700">{p}</p>
                            ))}

                            {step.prompt && (
                              <div className="mb-3">
                                <CopyBlock text={step.prompt} tone={step.kind === 'swivel' ? 'purple' : 'amber'} />
                                {step.promptNote && <p className="mt-2 text-sm italic text-gray-500">{step.promptNote}</p>}
                              </div>
                            )}

                            {step.aside && (
                              <div className="mb-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                                {step.aside}
                              </div>
                            )}

                            {step.kind === 'swivel' && step.prompt && (
                              <button
                                onClick={() => swivel(step.prompt!)}
                                className="mb-3 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700"
                              >
                                <RotateCw className="h-4 w-4" />
                                Copy and open the AI Playground
                                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                              </button>
                            )}

                            {step.kind === 'do' && (
                              <button
                                onClick={() => window.open('/website-builder', '_blank', 'noopener')}
                                className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Open the Website Builder
                              </button>
                            )}

                            {step.gate ? (
                              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                                <label className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-900">
                                  <Link2 className="h-4 w-4" />{step.gate.label}
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <input
                                    value={gateDraft[step.id] ?? artifacts[step.id] ?? ''}
                                    onChange={e => setGateDraft(p => ({ ...p, [step.id]: e.target.value }))}
                                    placeholder={step.gate.placeholder}
                                    className="flex-1 rounded-lg border border-cyan-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                                  />
                                  <button
                                    onClick={() => submitGate(step)}
                                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700"
                                  >
                                    {isDone ? 'Update' : 'Submit'}
                                  </button>
                                </div>
                                {gateError[step.id] && <p className="mt-2 text-sm font-semibold text-red-600">{gateError[step.id]}</p>}
                                {isDone && artifacts[step.id] && (
                                  <p className="mt-2 break-all text-xs text-cyan-800">Saved: {artifacts[step.id]}</p>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                {!isDone ? (
                                  <button
                                    onClick={() => complete(step)}
                                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
                                  >
                                    Mark done
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => uncomplete(step)}
                                    className="text-sm font-semibold text-gray-400 hover:text-gray-600"
                                  >
                                    Not done yet
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {epComplete && (
                    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
                      <p className="font-bold text-green-900">Episode {ep.number} complete.</p>
                      <p className="mt-1 text-sm text-green-800">
                        {ep.id === 'ep1'
                          ? 'You have a published site with your own photographs. Next you take the code off Claude and put it in your own hands.'
                          : 'Move on when you are ready.'}
                      </p>
                    </div>
                  )}

                  {ep.steps.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-500">
                      This episode is being written. Finish the one before it — there is plenty in there.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-8 text-center">
          <button onClick={() => navigate('/tutorials')} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </div>

      {fallbackText && <VoiceFallback text={fallbackText} onDismiss={clearFallback} />}
    </AppLayout>
  );
};

export default FishMarketTutorialPage;
