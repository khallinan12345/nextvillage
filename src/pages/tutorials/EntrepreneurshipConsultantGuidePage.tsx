// src/pages/tutorials/EntrepreneurshipConsultantGuidePage.tsx
//
// Guide for Entrepreneurship Consultant — confirmed the one Community Impact
// tool with both a real simulation mode AND a real casebook mode in the
// same place, via an explicit 4-tile picker: Learn Mode, Casebook, My
// Enterprise, Practice Mode (verbatim tile copy/pills confirmed by direct
// read of EntrepreneurshipConsultantPage.tsx).
//
// Practice Mode uses a fixed persona bank (Fatima, Emeka, Blessing, Tunde),
// each with real backstory + specific Naira numbers baked into their system
// prompt — confirmed by direct read, not paraphrase. Graded on CONSULT_RUBRIC,
// 5 dims 0-3 each (verbatim labels/desc pulled straight from source).
//
// Casebook is the real-client version of the same shared casebook mechanics
// used by Agriculture/Fishing/Animal Husbandry (see AdvisorCasebookGuidePage),
// but implemented natively here rather than through the shared component —
// still real people, real Supabase tables, no grading.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink, Briefcase } from 'lucide-react';

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

const TRACK = 'entrepreneurship-consultant-guide';
const PAGE_HREF = '/community-impact/entrepreneurship';

const STEPS: Step[] = [
  {
    id: 'intro',
    kind: 'read',
    title: 'What Entrepreneurship Consultant actually does',
    body: [
      'This tool has four modes, picked from a tile screen: Learn Mode ("Study 6 business topics including how to use AI to grow a Nigerian business" — Study first), Casebook ("Register real entrepreneurs, run structured consultations, save case records and follow-ups" — Real clients), My Enterprise ("Log your own sales week by week — a business you\'re building for yourself" — Build your own), and Practice Mode ("AI plays a young Nigerian entrepreneur. Practise advising and get evaluated." — Practice advising).',
      'Of everything in Community Impact, this is the one tool where both simulation and real-client work live in the same place — Practice Mode is the rehearsal, Casebook is the real thing.',
    ],
  },
  {
    id: 'why-practice-first',
    kind: 'read',
    title: 'Why start with Practice Mode',
    body: [
      'Practice Mode is safe to get wrong — you\'re advising a fixed AI persona, not a real person\'s actual business. You get evaluated afterward, so you find out what you missed before it matters. Once you\'re comfortable, Casebook is where you do this for real, with an actual entrepreneur, no grading involved.',
    ],
  },
  {
    id: 'rubric',
    kind: 'read',
    title: 'What Practice Mode checks',
    body: [
      'After a consultation, you\'re scored on five dimensions, each 0–3:',
      '1. Problem Diagnosis — did you correctly identify the real barrier, not just the surface question?',
      '2. Business Knowledge — was the advice accurate and specific to Nigerian business realities (CAC registration, Ajo savings, pricing, WhatsApp Business)?',
      '3. Practical & Affordable — was the advice actionable within the entrepreneur\'s actual budget?',
      '4. Action Planning — did you leave them with a clear, specific first step?',
      '5. Communication — was the advice encouraging, clear, and adapted to their situation?',
    ],
  },
  {
    id: 'case',
    kind: 'read',
    title: 'A case in action',
    body: [
      'Blessing is a 28-year-old garri processor from Oloibiri. She processes cassava from her family farm — the cassava itself is free, and processing costs her about ₦1,500 a bag. She sells 5–8 bags a month to middlemen at ₦4,500 a bag. She has ₦25,000 saved, no social media presence, and keeps no written records.',
      'Weak advice: "You should sell online to make more money." — Vague, doesn\'t diagnose why she\'s underpriced, gives her nothing specific to do.',
      'Stronger advice: "The middlemen are paying you ₦4,500 a bag, but the same garri is going for ₦7,000–9,000 in Yenagoa — that gap is your biggest opportunity, not a new product. Since transport is a real cost for you, start small: join a WhatsApp food trader group serving Yenagoa and offer delivery for a minimum order of 3 bags, so one trip covers the transport cost. Try that with your next batch and see what price you actually get."',
      'The stronger version diagnoses the real problem (she\'s selling below market, not that she needs a new venture), gives Nigeria-specific, budget-aware advice, and ends with one concrete next step she can try immediately.',
    ],
    aside: 'This is an illustrative example built from Blessing\'s real profile in the tool — your actual conversation will go wherever she takes it.',
  },
  {
    id: 'do-practice',
    kind: 'do',
    title: 'Try Practice Mode',
    body: [
      'Open Entrepreneurship Consultant below and pick Practice Mode. Choose a persona — Fatima (event food seller), Emeka (phone repair), Blessing (garri processor), or Tunde (fashion designer weighing a risky loan) — work through the prep questions, then consult with them. Read your rubric score afterward.',
    ],
    doLabel: 'Open Entrepreneurship Consultant',
    doHref: PAGE_HREF,
  },
  {
    id: 'do-casebook',
    kind: 'do',
    title: 'Use Casebook with a real entrepreneur',
    body: [
      'Back on the tile screen, open Casebook. Register a real entrepreneur — or a placeholder while you\'re learning — with their name and village. Use Probe to interview them well, get AI advice, and save the case record with what you actually told them. There\'s no grading here; it\'s advice-only, same as Agriculture and Fishing.',
    ],
    doLabel: 'Back to Entrepreneurship Consultant',
    doHref: PAGE_HREF,
  },
  {
    id: 'bonus',
    kind: 'read',
    title: 'My Enterprise and Learn Mode',
    body: [
      'Two more modes worth knowing about. My Enterprise is a real ledger — not for a community member, but for a business you\'re building yourself, logged week by week. Learn Mode is a set of six business topic tutorials, including how to use AI to grow a Nigerian business — no persona, no grading, just study material for when you want the background before you consult.',
    ],
  },
  {
    id: 'gate',
    kind: 'gate',
    title: 'Prove it',
    body: [
      'Tell us which persona you practiced with and your score, or what real case you logged in Casebook.',
    ],
    gate: {
      label: 'What did you do — Practice Mode or Casebook — and how did it go?',
      placeholder: 'e.g. Practiced with Blessing — scored 2.6 average, then logged a real case in Casebook',
      validate: v => {
        const s = v.trim();
        if (s.length < 10) return 'Give a little more detail.';
        if (!/\s/.test(s)) return 'That looks like one word — add more detail.';
        return null;
      },
    },
  },
];

const EntrepreneurshipConsultantGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  const firstIncompleteIndex = useMemo(() => {
    const idx = STEPS.findIndex(s => !done.has(s.id));
    return idx === -1 ? STEPS.length : idx;
  }, [done]);

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

  const totalSteps = STEPS.length;
  const doneCount = STEPS.filter(s => done.has(s.id)).length;
  const pct = Math.round((doneCount / totalSteps) * 100);
  const allDone = doneCount === totalSteps;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read: { badge: 'bg-slate-100 text-slate-600', label: 'Read', ring: 'border-gray-200' },
    do:   { badge: 'bg-emerald-100 text-emerald-800', label: 'Do', ring: 'border-emerald-200' },
    gate: { badge: 'bg-cyan-100 text-cyan-800', label: 'Prove it', ring: 'border-cyan-300' },
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

        <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-300">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">Entrepreneurship Consultant</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                Practice with a persona and get graded, then run the same advice for a real entrepreneur in Casebook.
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
              <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {!userId && (
              <p className="mt-2 text-xs text-slate-400">
                Your progress is saved on this device. Sign in to keep it across devices.
              </p>
            )}
          </div>
        </div>

        {STEPS.map((step, i) => {
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
              You've rehearsed with a graded persona and run the same advice for a real entrepreneur — the two halves of this tool working the way they're meant to.
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

export default EntrepreneurshipConsultantGuidePage;
