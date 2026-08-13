// src/pages/tutorials/CreativeAICategoryGuidePage.tsx
//
// One Guide per Creative AI tool — starting with AI Image Creation. Built as
// a dynamic route (like AILearningCategoryGuidePage.tsx and its siblings)
// rather than a single-purpose file, because AI Voice Creation and AI Video
// Creation (src/pages/tech-skills/VoiceCreationPage.tsx,
// VideoGenerationPage.tsx) are structurally identical clones of
// ImageGenerationPage.tsx per their own header comments — same inline
// "Improve my English" / "Critique my Prompt" / "Build step-by-step" tools,
// same lack of an on-page "Use Claude" button. Adding Guides for those later
// is just two more CATEGORY_GUIDES entries.
//
// Two things worth being precise about, both confirmed by reading the real
// page rather than assumed:
//
// 1. There is no "Use Claude" button anywhere on ImageGenerationPage.tsx.
//    "Use Claude" is only the Sidebar/Navbar's own label for the
//    `/playground` nav link. What actually bridges a build page to Claude
//    is the "swivel" mechanic already established in VibeCodingGuidePage.tsx
//    and SupabaseDatabaseGuidePage.tsx: copy a prompt to the clipboard, open
//    `/playground` in a new tab, paste it in yourself. This Guide reuses
//    that exact mechanic rather than inventing a new one.
//
// 2. The page already has its own inline prompt critique ("💡 Critique my
//    Prompt", scores Subject/Setting/Lighting/Colour/Composition/Style
//    informally out of 10) and a step-by-step prompt-builder coach — both
//    running in place, no navigation. So "use both" means: the page's own
//    tool for the mechanical checklist, then Claude in the Playground for
//    judgment calls the checklist can't make (creative direction, cultural
//    accuracy, a second opinion) — not two competing ways to do the same
//    thing.
//
// The case-study weak/strong prompt pair is the platform's own real example
// from AIImageCertificationPage.tsx's "What makes a great image prompt?"
// guidance, not invented — reused here so the Guide stays consistent with
// what the certification actually rewards.
//
// Progress: localStorage first, mirrored to `tutorial_progress` when signed
// in — same as every other Guide. Track id is per-tool
// (`creative-ai-guide-<categoryId>`).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink,
  Image as ImageIcon, RotateCw, Copy, CheckCheck,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'swivel' | 'gate';

interface Gate {
  label: string;
  placeholder: string;
  validate: (value: string) => string | null;
}

interface CriterionDef {
  name: string;
  detail: string;
}

interface Attempt {
  label: string;
  answer: string;
  critique: string;
  whyBetter?: string;
}

interface CaseStudy {
  scenario: string;
  attempts: Attempt[];
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  aside?: string;
  criteriaList?: CriterionDef[];
  caseStudy?: CaseStudy;
  prompt?: string;
  promptNote?: string;
  doLabel?: string;
  doHref?: string;
  gate?: Gate;
}

interface CategoryGuideContent {
  id: string;
  title: string;
  hook: string;
  Icon: React.ComponentType<{ className?: string }>;
  pageHref: string;
  criteria: CriterionDef[];
  caseStudy: CaseStudy;
  swivelPrompt: string;
}

/* ───────────────────────────── content ───────────────────────────── */

const CATEGORY_GUIDES: Record<string, CategoryGuideContent> = {
  'ai-image-creation': {
    id: 'ai-image-creation',
    title: 'AI Image Creation',
    hook: 'Turning a text prompt into a real image — and the habit that separates a vague prompt from one that actually gets you what you pictured.',
    Icon: ImageIcon,
    pageHref: '/tech-skills/ai-image-creation',
    criteria: [
      { name: 'Subject', detail: 'Who or what is actually in the image — specific, not generic.' },
      { name: 'Setting', detail: 'Where this is happening, specific enough that it couldn’t be anywhere.' },
      { name: 'Perspective', detail: 'The camera angle or framing — close-up, low angle, wide shot.' },
      { name: 'Lighting', detail: 'What kind of light, and where it’s coming from — golden hour, harsh midday sun, soft overcast.' },
      { name: 'Colour', detail: 'A dominant colour or palette, named directly.' },
      { name: 'Mood & Style', detail: 'The feeling you want, and a named visual style — photorealistic, watercolor, editorial.' },
    ],
    caseStudy: {
      scenario: 'This is the platform’s own real example of what separates a weak prompt from a strong one — the same pair used on the AI Image Creation certification.',
      attempts: [
        {
          label: 'First attempt',
          answer: 'A woman in a market.',
          critique: 'Prompt critique\nSubject: vague — "a woman" has no distinguishing detail\nSetting: vague — "a market" could be anywhere in the world\nLighting: missing\nColour: missing\nPerspective: missing\nMood & Style: missing\nScore: 2/10\nSuggested improvement: Add who she is, what she’s doing, and where — subject and setting come before anything else.',
        },
        {
          label: 'Second attempt',
          answer: 'A Nigerian market woman selling produce at a colorful outdoor stall during the day.',
          whyBetter: 'Now there’s a specific place (a Nigerian market), an action (selling produce), and a setting detail (colorful outdoor stall, daytime) — instead of a generic scene that could be anywhere in the world.',
          critique: 'Prompt critique\nSubject: improved — "market woman selling produce" — Improve: add age, clothing, or expression for more specificity\nSetting: improved — "Nigerian market...outdoor stall" — Improve: nothing major\nLighting: weak — "during the day" is vague — Improve: name a specific light quality, like golden hour or harsh midday sun\nColour: missing — Improve: name a dominant colour or palette\nPerspective: missing — Improve: add a camera angle or framing\nScore: 5/10\nSuggested improvement: Lighting and camera angle are the two changes that would move this furthest — from "described" to "visualized."',
        },
        {
          label: 'Third attempt',
          answer: 'A Nigerian market woman in her 40s wearing a vibrant yellow ankara dress, photographed from a low angle, surrounded by colourful produce, golden afternoon light streaming through the stalls, shallow depth of field, photorealistic.',
          whyBetter: 'Every dimension the tool checks is covered now: a specific subject (age, clothing), a detailed setting, a real camera angle, real lighting, a named colour, and a named style. This is the difference between describing a scene and directing one.',
          critique: 'Prompt critique\nSubject: strong — "woman in her 40s wearing a vibrant yellow ankara dress"\nSetting: strong — "surrounded by colourful produce"\nLighting: strong — "golden afternoon light streaming through the stalls"\nColour: strong — "vibrant yellow," golden light\nPerspective: strong — "low angle," "shallow depth of field"\nMood & Style: strong — "photorealistic"\nScore: 9/10\nSuggested improvement: Nothing major — this prompt gives the model everything it needs.',
        },
      ],
    },
    swivelPrompt:
      "I'm about to generate an AI image using a text-to-image tool. Here's my current prompt:\n\n[PASTE YOUR PROMPT]\n\nHelp me strengthen it — check whether I've covered subject, setting, camera angle, lighting, colour, and mood, and suggest the one change that would make the biggest difference. Also flag anything that might read as a stereotype or feel inauthentic to the real place or culture I'm depicting.",
  },
};

/* ─────────────────────────── step builder ────────────────────────── */

function buildSteps(c: CategoryGuideContent): Step[] {
  return [
    {
      id: 'intro',
      kind: 'read',
      title: `What "${c.title}" actually does`,
      body: [
        c.hook,
        'You type a prompt (up to 750 characters), pick an aspect ratio, and click Generate — the image itself comes from FLUX Schnell, a real text-to-image model, not a mockup. There’s no formal score on this page the way some other Guides have — it’s generate-and-view. The skill this Guide actually teaches is writing a prompt specific enough to get what you pictured on the first or second try, instead of regenerating ten times and hoping.',
      ],
      aside: 'This tool is currently available to students in Africa and North America. If you don’t see it in your Tech Skills menu, that’s why — not a bug.',
    },
    {
      id: 'rubric',
      kind: 'read',
      title: 'What makes a strong prompt',
      body: [
        'The page’s own "Critique my Prompt" tool checks your prompt against these dimensions and gives it an informal score out of 10. The platform’s certification page is blunt about the biggest failure mode: a prompt under 10 words reads as having no real creative intent behind it, no matter how good the resulting image happens to look.',
      ],
      criteriaList: c.criteria,
    },
    {
      id: 'case',
      kind: 'read',
      title: 'A case in action',
      body: [c.caseStudy.scenario, 'Watch the same idea written three times, each one better than the last — and read why each change actually matters, not just why it’s longer.'],
      caseStudy: c.caseStudy,
    },
    {
      id: 'do-builtin',
      kind: 'do',
      title: 'Try the page’s own tools first',
      body: [
        'Open the real page below and write a first-draft prompt for something you actually want to see. Before generating, click "💡 Critique my Prompt" and read what it flags — or click "Build prompt step-by-step" if you’d rather be walked through subject, setting, lighting, colour, and mood one question at a time. Either one works; they’re two doors into the same rubric.',
      ],
      doLabel: 'Open AI Image Creation',
      doHref: c.pageHref,
    },
    {
      id: 'swivel',
      kind: 'swivel',
      title: 'Then get a second opinion from Claude',
      body: [
        'The on-page tool is fast and tuned exactly to this checklist — but it can’t brainstorm a genuinely different creative direction with you, and it won’t always catch something that reads as a stereotype or feels inauthentic to the real place you’re depicting. That’s where Claude in the AI Playground earns its place in the workflow.',
      ],
      prompt: c.swivelPrompt,
      promptNote: 'Paste your own prompt in where it says [PASTE YOUR PROMPT] before sending it.',
    },
    {
      id: 'why-both',
      kind: 'read',
      title: 'Why it’s worth using both',
      body: [
        'This isn’t redundant — the two tools are good at different things. The on-page critique is instant, free, and checks the mechanical rubric every time. Claude can reason more deeply: weigh two different creative directions against each other, push back on an idea that sounds fine but doesn’t quite work, or flag a cultural detail the checklist has no way to check for. Use the on-page tool for the checklist, and Claude for the judgment call.',
      ],
    },
    {
      id: 'do-generate',
      kind: 'do',
      title: 'Generate your image',
      body: [
        'Take whatever came out of either tool — the on-page critique, the step-by-step coach, or Claude’s suggestions — and fold the best of it into one final prompt. Generate the image, and if you want to keep it, use "Save Image to Account" and "Save Session to Dashboard" so it’s not lost when you navigate away.',
      ],
      doLabel: 'Back to AI Image Creation',
      doHref: '/tech-skills/ai-image-creation',
    },
    {
      id: 'gate',
      kind: 'gate',
      title: 'Prove it',
      body: [
        'You’ve seen a weak prompt turn into a strong one, know the exact dimensions being checked, and used both the on-page tool and Claude to get there. Tell us what you made.',
      ],
      gate: {
        label: 'What did you generate, and what was your final prompt about?',
        placeholder: 'e.g. A sunset over a fishing village — after adding lighting and a camera angle',
        validate: v => {
          const s = v.trim();
          if (s.length < 10) return 'Give a little more detail about what you generated.';
          if (!/\s/.test(s)) return 'That looks like one word — add a bit more detail.';
          return null;
        },
      },
    },
  ];
}

/* ──────────────────────────── small parts ─────────────────────────── */

const CopyBlock: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
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
  return (
    <div className="relative rounded-xl border border-purple-300 bg-purple-50 p-4 pr-32">
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-gray-800">{text}</pre>
      <button
        onClick={copy}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-purple-700"
      >
        {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

/* ──────────────────────────── main page ──────────────────────────── */

const CreativeAICategoryGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const content = categoryId ? CATEGORY_GUIDES[categoryId] : undefined;
  const steps = useMemo(() => (content ? buildSteps(content) : []), [content]);
  const track = content ? `creative-ai-guide-${content.id}` : '';

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lsKey = `tutorial:${track}`;

  useEffect(() => {
    if (!track) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const p = JSON.parse(raw);
        setDone(new Set<string>(p.completed ?? []));
        setArtifacts(p.artifacts ?? {});
      }
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey, track]);

  useEffect(() => {
    if (!userId || !track) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tutorial_progress')
        .select('completed_steps, artifacts')
        .eq('user_id', userId)
        .eq('track', track)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
      setArtifacts(prev => ({ ...(data.artifacts ?? {}), ...prev }));
    })();
    return () => { cancelled = true; };
  }, [userId, track]);

  const persist = useCallback((nextDone: Set<string>, nextArtifacts: Record<string, string>) => {
    if (!track) return;
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
        track,
        completed_steps: [...nextDone],
        artifacts: nextArtifacts,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, track, userId]);

  const firstIncompleteIndex = useMemo(() => {
    const idx = steps.findIndex(s => !done.has(s.id));
    return idx === -1 ? steps.length : idx;
  }, [steps, done]);

  const isUnlocked = (index: number) => index <= firstIncompleteIndex;

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

  const swivel = async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); } catch { /* copy button is still there */ }
    window.open('/playground', '_blank', 'noopener');
  };

  const totalSteps = steps.length;
  const doneCount = steps.filter(s => done.has(s.id)).length;
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;
  const allDone = totalSteps > 0 && doneCount === totalSteps;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read:   { badge: 'bg-slate-100 text-slate-600',   label: 'Read',   ring: 'border-gray-200' },
    do:     { badge: 'bg-pink-100 text-pink-800',     label: 'Do',     ring: 'border-pink-200' },
    swivel: { badge: 'bg-purple-100 text-purple-800', label: 'Swivel', ring: 'border-purple-300' },
    gate:   { badge: 'bg-cyan-100 text-cyan-800',     label: 'Prove it', ring: 'border-cyan-300' },
  };

  if (!categoryId || !content) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 pb-24 pt-6 text-center">
          <p className="text-lg font-bold text-gray-900">We don’t have a Guide for that tool.</p>
          <button onClick={() => navigate('/tutorials')} className="mt-4 text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </AppLayout>
    );
  }

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
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pink-500/20 text-pink-300">
              <content.Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">{content.title}</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                A weak prompt becoming a strong one, why each change matters, and how to use the page’s own tools together with Claude — not instead of each other.
              </p>
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
              <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-purple-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {!userId && (
              <p className="mt-2 text-xs text-slate-400">
                Your progress is saved on this device. Sign in to keep it across devices.
              </p>
            )}
          </div>
        </div>

        {/* steps */}
        {steps.map((step, i) => {
          const unlocked = isUnlocked(i);
          const isDone = done.has(step.id);
          const isOpen = unlocked && (!isDone || expanded.has(step.id));
          const st = KIND_STYLE[step.kind];

          return (
            <div
              key={step.id}
              className={`mb-3 overflow-hidden rounded-xl border bg-white transition-all ${isDone ? 'border-green-200' : st.ring} ${!unlocked ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => {
                  if (!unlocked) return;
                  setExpanded(prev => {
                    const n = new Set(prev);
                    if (n.has(step.id)) n.delete(step.id); else n.add(step.id);
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
                {unlocked && (isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />)}
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-4 sm:px-6">
                  {step.body.map((p, k) => (
                    <p key={k} className="mb-3 text-[15px] leading-relaxed text-gray-700">{p}</p>
                  ))}

                  {step.criteriaList && (
                    <dl className="mb-3 space-y-2">
                      {step.criteriaList.map(cr => (
                        <div key={cr.name} className="rounded-lg border border-gray-200 p-3">
                          <dt className="text-sm font-bold text-gray-900">{cr.name}</dt>
                          <dd className="mt-1 text-sm text-gray-600">{cr.detail}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {step.caseStudy && (
                    <div className="mb-3 space-y-3">
                      {step.caseStudy.attempts.map((a, idx) => {
                        const tone = idx === 0 ? 'red' : idx === step.caseStudy!.attempts.length - 1 ? 'green' : 'amber';
                        const toneClasses = tone === 'red'
                          ? 'border-red-200 bg-red-50 text-red-700 [&_pre]:text-red-900'
                          : tone === 'amber'
                          ? 'border-amber-200 bg-amber-50 text-amber-700 [&_pre]:text-amber-900'
                          : 'border-green-200 bg-green-50 text-green-700 [&_pre]:text-green-900';
                        return (
                          <div key={a.label}>
                            {a.whyBetter && (
                              <div className="mb-2 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                                <span className="font-bold text-cyan-800">Why this is better: </span>{a.whyBetter}
                              </div>
                            )}
                            <div className={`rounded-lg border p-3 ${toneClasses}`}>
                              <p className="mb-1 text-xs font-bold uppercase tracking-wide">{a.label}</p>
                              <p className="mb-2 text-sm italic text-gray-800">“{a.answer}”</p>
                              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">{a.critique}</pre>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {step.aside && (
                    <div className="mb-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                      {step.aside}
                    </div>
                  )}

                  {step.kind === 'swivel' && step.prompt && (
                    <>
                      <div className="mb-3">
                        <CopyBlock text={step.prompt} />
                        {step.promptNote && <p className="mt-2 text-sm italic text-gray-500">{step.promptNote}</p>}
                      </div>
                      <button
                        onClick={() => swivel(step.prompt!)}
                        className="mb-3 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700"
                      >
                        <RotateCw className="h-4 w-4" />
                        Copy and open the AI Playground
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                      </button>
                    </>
                  )}

                  {step.kind === 'do' && step.doHref && (
                    <button
                      onClick={() => window.open(step.doHref!, '_blank', 'noopener')}
                      className="mb-3 flex items-center gap-2 rounded-lg border border-pink-300 bg-pink-50 px-4 py-2.5 text-sm font-bold text-pink-800 hover:bg-pink-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {step.doLabel ?? 'Open the page'}
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

        {allDone && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="font-bold text-green-900">Guide complete.</p>
            <p className="mt-1 text-sm text-green-800">
              You’ve seen a weak prompt become a strong one, know the exact dimensions being checked, and practiced using the page’s own tools together with Claude. That workflow works for every image you make here.
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <button onClick={() => navigate('/tutorials')} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default CreativeAICategoryGuidePage;
