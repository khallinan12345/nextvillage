// src/pages/tutorials/AdvisorCasebookGuidePage.tsx
//
// One Guide per "advisor casebook" tool — Agriculture, Fishing, and Animal
// Husbandry Consultant. All three are confirmed thin wrappers around the
// same shared component, src/components/community-impact/AdvisorCasebookPage.tsx,
// config-driven per domain (src/pages/community-impact/*ConsultantPage.tsx),
// so this Guide is one dynamic route rather than three near-duplicate files.
//
// The most important thing this Guide gets right, because it's easy to get
// wrong: these three tools have NO simulation or practice mode at all. Every
// consultation is written assuming a real person is sitting in front of the
// student right now — the system prompts say so explicitly ("They are
// sitting with a smallholder farmer RIGHT NOW"). The "🔍 Probe" buttons open
// an Interview Coach that helps the STUDENT ask better questions of the real
// person — it does not roleplay as the farmer/fisher/client. Simulation-based
// practice (AI playing the community member) only exists later, as part of
// certification — day-to-day tool use is always real. This Guide states that
// distinction directly rather than implying a practice mode exists here.
//
// There is no grading/evaluation on these three pages either — the AI gives
// advice, never a score. Grading only happens on the separate certification
// pages, which were not investigated for verbatim rubric reuse here.
//
// Real, verified mechanics reused across the flow: register a real person →
// pick a consultation category → structured intake with per-field Probe →
// Generate AI Advice (with an auto-detected urgency signal parsed from the
// AI's own text) → Save Case Record with what the student actually advised →
// later, AI Follow-up or Mark Resolved with a real outcome. Animal Husbandry
// intake additionally flags certain fields as emergency indicators, showing
// a red pulsing banner when filled in.
//
// Each domain also has a genuinely-offline static HTML tool (linked, not
// rebuilt) for true no-network field use — confirmed working links for all
// three domains, including a real one-line bug found and fixed in this same
// batch: FishingConsultantPage.tsx pointed at a filename
// (offline-fishing-advisor.html) that didn't exist; the real file on disk is
// offline-fishing-consultant.html.
//
// Progress: localStorage first, mirrored to `tutorial_progress` in Supabase
// when signed in — same as every other Guide. Track id is per-domain
// (`advisor-casebook-guide-<categoryId>`).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink,
  Wheat, Fish, PawPrint,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'gate';

interface Gate {
  label: string;
  placeholder: string;
  validate: (value: string) => string | null;
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  aside?: string;
  doLabel?: string;
  doHref?: string;
  gate?: Gate;
}

interface CategoryGuideContent {
  id: string;
  title: string;
  personLabel: string;      // "Farmer" / "Fisher" / "Client"
  hook: string;
  Icon: React.ComponentType<{ className?: string }>;
  pageHref: string;
  offlineHref: string;
  categories: string[];     // real consultation category list for this domain
  caseScenario: string;
  caseIntake: string[];
  caseAdvice: string;
  caseUrgency: string;
}

/* ───────────────────────────── content ───────────────────────────── */

const CATEGORY_GUIDES: Record<string, CategoryGuideContent> = {
  agriculture: {
    id: 'agriculture',
    title: 'Agriculture Consultant',
    personLabel: 'Farmer',
    hook: 'A real casebook for advising real farmers — register who you\'re helping, interview them well, and get grounded AI advice you can actually relay.',
    Icon: Wheat,
    pageHref: '/community-impact/agriculture',
    offlineHref: '/offline-agriculture-advisor.html',
    categories: ['Crop Disease', 'Pest Damage', 'Soil & Water', 'Post-Harvest', 'Market & Inputs'],
    caseScenario: 'A farmer tells you their cassava leaves have started turning yellow and curling over the past two weeks, affecting roughly half the field.',
    caseIntake: [
      'Category: Crop Disease',
      'Crop: Cassava',
      'Symptom: Yellowing and curling leaves',
      'Onset: About 2 weeks ago',
      'Affected area: Roughly half the field',
    ],
    caseAdvice: 'This pattern — yellowing, curling leaves spreading across part of a cassava field — is consistent with Cassava Mosaic Disease, spread by whiteflies. Recommend: (1) uproot and burn the worst-affected plants to slow the spread, (2) source certified disease-resistant cuttings for replanting rather than reusing cuttings from this field, (3) contact the nearest ADP extension officer to confirm the diagnosis before taking large-scale action.',
    caseUrgency: 'Medium — not an immediate danger to the farmer, but time-sensitive before the disease spreads further through the field.',
  },

  fishing: {
    id: 'fishing',
    title: 'Fishing Consultant',
    personLabel: 'Fisher',
    hook: 'A real casebook for advising real fishers — register who you\'re helping, interview them well, and get grounded AI advice you can actually relay.',
    Icon: Fish,
    pageHref: '/community-impact/fishing',
    offlineHref: '/offline-fishing-consultant.html',
    categories: ['Catch Problems', 'Pond & Aquaculture', 'Processing & Market', 'Oil Contamination', 'Climate & Safety'],
    caseScenario: 'A fisher reports a sudden drop in their catch near a specific waterway, and mentions the water has an unusual oily sheen on the surface.',
    caseIntake: [
      'Category: Oil Contamination',
      'Waterway: (named creek/river)',
      'Observation: Oily sheen visible on the water surface',
      'Catch decline: Significant, over the past few days',
      'Fish health: Some fish caught appear discoloured',
    ],
    caseAdvice: 'These signs point to possible oil contamination. Advise the fisher: do not sell or eat any visibly contaminated fish, document the sheen and location with photos and GPS coordinates if possible, avoid fishing in the affected stretch until it\'s cleared, and report the contamination to NOSDRA immediately — this is exactly the kind of case that needs a real regulatory body involved, not just advice from this tool.',
    caseUrgency: 'High — oil contamination is flagged as an urgent case, both for the fisher\'s income and for food safety.',
  },

  'animal-husbandry': {
    id: 'animal-husbandry',
    title: 'Animal Husbandry Consultant',
    personLabel: 'Client',
    hook: 'A real casebook for advising real livestock owners — register who you\'re helping, interview them well, and get grounded AI advice you can actually relay.',
    Icon: PawPrint,
    pageHref: '/community-impact/animal-husbandry',
    offlineHref: '/offline-animal-advisor.html',
    categories: ['Illness & Disease', 'Nutrition & Feeding', 'Breeding', 'Housing & Welfare', 'Market & Sale'],
    caseScenario: 'A client\'s goats have become suddenly lethargic and are refusing feed — and one goat died overnight.',
    caseIntake: [
      'Species: Goats',
      'Symptom: Sudden lethargy, refusing feed',
      'Sudden death: Yes — one animal died overnight (this field is emergency-flagged)',
      'Herd size affected: Multiple animals showing symptoms',
    ],
    caseAdvice: 'A sudden death alongside lethargy and feed refusal in the rest of the herd is a real emergency signal — this could be an infectious outbreak. Advise the client to isolate the remaining animals from the rest of the herd immediately, not to sell or consume the animal that died, and to contact veterinary services urgently rather than waiting to see if the others recover on their own.',
    caseUrgency: 'High — the sudden death trips the tool\'s own emergency indicator and shows a red pulsing banner.',
  },
};

/* ─────────────────────────── step builder ────────────────────────── */

function buildSteps(c: CategoryGuideContent): Step[] {
  return [
    {
      id: 'intro',
      kind: 'read',
      title: `What ${c.title} actually does`,
      body: [
        c.hook,
        `This is a real casebook, not a simulator — there's no practice mode here. Every consultation assumes an actual ${c.personLabel.toLowerCase()} is with you right now. You register them by name and village, pick a category (${c.categories.join(', ')}), and work through a structured intake.`,
      ],
    },
    {
      id: 'no-simulation',
      kind: 'read',
      title: 'Why there\'s no "practice mode" here',
      body: [
        'The "🔍 Probe" button on each intake field opens an Interview Coach — but it coaches you, the student, on what to ask. It doesn\'t roleplay as the person you\'re helping. This tool is built for the moment you\'re actually sitting with someone, not for rehearsing beforehand.',
        'If you want to practice the conversation itself before doing it for real, that kind of AI-plays-the-community-member simulation exists later, as part of certification — not in this day-to-day tool. Think of this Guide as teaching you the real thing directly.',
      ],
    },
    {
      id: 'case',
      kind: 'read',
      title: 'A case in action',
      body: [
        c.caseScenario,
        `Intake: ${c.caseIntake.join(' · ')}`,
        `AI advice: "${c.caseAdvice}"`,
        `Urgency: ${c.caseUrgency}`,
      ],
      aside: 'The AI\'s advice is a starting point for you to relay and discuss — not a replacement for real expertise when a case is serious. Use your own judgement, especially on anything flagged urgent.',
    },
    {
      id: 'do-register',
      kind: 'do',
      title: `Register a ${c.personLabel.toLowerCase()} and start a consultation`,
      body: [
        `Open ${c.title} below. Add a real ${c.personLabel.toLowerCase()} — or, if you\'re just learning the tool, a placeholder person you\'ll delete later — with their name, village, and any domain details it asks for. Then pick the category that best matches their situation.`,
      ],
      doLabel: `Open ${c.title}`,
      doHref: c.pageHref,
    },
    {
      id: 'do-interview',
      kind: 'do',
      title: 'Interview them and get AI advice',
      body: [
        'Work through the intake form. Whenever a question feels hard to ask well, click "🔍 Probe" — it\'ll coach you through it one question at a time. Read each coached question aloud to the real person, then type or speak their actual answer back in. Once the required fields are filled, click Generate AI Advice.',
      ],
      doLabel: `Back to ${c.title}`,
      doHref: c.pageHref,
    },
    {
      id: 'do-save',
      kind: 'do',
      title: 'Save the case record',
      body: [
        'Read the advice, note the urgency it flagged, and record what you actually told the person — not just what the AI suggested, but what you decided to relay. Save the case record so it\'s there if you need to follow up later.',
      ],
      doLabel: `Back to ${c.title}`,
      doHref: c.pageHref,
    },
    {
      id: 'do-followup',
      kind: 'do',
      title: 'Follow up later',
      body: [
        'When you check back in with them, reopen the saved case. Use "Ask AI Follow-up" if their situation has changed, or mark the case Resolved with a real outcome — whether the advice was applied, partially applied, or not applied, and any real value it made (money saved, yield recovered, animals treated).',
      ],
      doLabel: `Back to ${c.title}`,
      doHref: c.pageHref,
    },
    {
      id: 'offline',
      kind: 'read',
      title: 'When you have no internet at all',
      body: [
        `There's a fully offline version of this tool for true field use — no AI, no network required, just a static checklist-style advisor covering the same categories. Open it once while you have signal so it\'s cached, and it\'ll keep working without one.`,
      ],
      aside: `Offline tool: ${c.offlineHref}`,
    },
    {
      id: 'gate',
      kind: 'gate',
      title: 'Prove it',
      body: [
        'You\'ve registered a real case, interviewed with the Probe coach, gotten AI advice, and saved a record. Tell us what you worked through.',
      ],
      gate: {
        label: `What case did you work on, and what did you advise?`,
        placeholder: 'e.g. Cassava with yellowing leaves — advised isolating affected plants and contacting ADP',
        validate: v => {
          const s = v.trim();
          if (s.length < 10) return 'Give a little more detail about the case and what you advised.';
          if (!/\s/.test(s)) return 'That looks like one word — add more detail.';
          return null;
        },
      },
    },
  ];
}

/* ──────────────────────────── main page ──────────────────────────── */

const AdvisorCasebookGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const content = categoryId ? CATEGORY_GUIDES[categoryId] : undefined;
  const steps = useMemo(() => (content ? buildSteps(content) : []), [content]);
  const track = content ? `advisor-casebook-guide-${content.id}` : '';

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

  const totalSteps = steps.length;
  const doneCount = steps.filter(s => done.has(s.id)).length;
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;
  const allDone = totalSteps > 0 && doneCount === totalSteps;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read: { badge: 'bg-slate-100 text-slate-600', label: 'Read', ring: 'border-gray-200' },
    do:   { badge: 'bg-emerald-100 text-emerald-800', label: 'Do', ring: 'border-emerald-200' },
    gate: { badge: 'bg-cyan-100 text-cyan-800', label: 'Prove it', ring: 'border-cyan-300' },
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
              <content.Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">{content.title}</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                A real case worked start to finish, why there's no practice mode here, and how to interview, advise, and follow up well.
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
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
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

                  {step.aside && (
                    <div className="mb-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                      {step.aside}
                    </div>
                  )}

                  {step.kind === 'do' && step.doHref && (
                    <button
                      onClick={() => window.open(step.doHref!, '_blank', 'noopener')}
                      className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
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
              You know why this tool is real-only, how to interview well with Probe, and how to advise, save, and follow up on a case. That workflow works for every real consultation you run here.
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

export default AdvisorCasebookGuidePage;
