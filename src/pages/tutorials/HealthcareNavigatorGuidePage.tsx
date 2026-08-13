// src/pages/tutorials/HealthcareNavigatorGuidePage.tsx
//
// Guide for Healthcare Navigator — confirmed real-only: no simulation or
// roleplay anywhere on the main page. Flow: dashboard -> add patient ->
// new assessment -> triage result (RED/YELLOW/GREEN, verbatim labels below
// pulled from TRIAGE_CONFIG in HealthcareNavigatorPage.tsx) -> later, one of
// two distinct follow-up tools: "Evaluate My Case History" (reflective
// self-critique on the student's OWN saved assessment, qualitative, no
// score) and "Follow-up Prior Assessment" (guided re-triage of a returning
// patient using full history).
//
// Also covers the separate, genuinely offline, non-AI tool at
// /community-impact/healthcare-offline (OfflineClinicalAssessment.tsx) —
// confirmed rule-based WHO IMCI logic with zero network calls, framed
// carefully per its own file header ("Clinical review: Requires
// Dr. O'Connell sign-off before field deployment").

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink, Stethoscope } from 'lucide-react';

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

const TRACK = 'healthcare-navigator-guide';
const PAGE_HREF = '/community-impact/healthcare';
const OFFLINE_HREF = '/community-impact/healthcare-offline';

const STEPS: Step[] = [
  {
    id: 'intro',
    kind: 'read',
    title: 'What Healthcare Navigator actually does',
    body: [
      'This is a real triage tool, not a simulator — there\'s no practice mode anywhere on this page. You register an actual patient, run a structured assessment, and get a triage level you can act on right away.',
    ],
  },
  {
    id: 'triage',
    kind: 'read',
    title: 'Reading a triage result',
    body: [
      'Every assessment ends with one of three levels:',
      'RED — Urgent Referral: "Refer immediately. Do not delay."',
      'YELLOW — Treat & Monitor: "Treat and monitor. Refer if no improvement in 2 days."',
      'GREEN — Home Care: "Home care with education and follow-up instructions."',
      'Treat RED as non-negotiable — it means get this patient to real care now, not "when convenient."',
    ],
  },
  {
    id: 'case',
    kind: 'read',
    title: 'A case in action',
    body: [
      'A caregiver brings in a young child with a two-day fever who has started breathing noticeably fast, with mild chest indrawing.',
      'Fast breathing plus fever in a young child is exactly the kind of danger sign this tool is built to catch early — it points toward possible pneumonia, which can turn serious quickly if missed.',
      'Triage result: RED — Urgent Referral. "Refer immediately. Do not delay." The right move here is to get the child to a real clinic or hospital immediately, not to wait and monitor.',
    ],
    aside: 'This tool supports your judgement — it doesn\'t replace it. On anything RED, don\'t second-guess the referral.',
  },
  {
    id: 'do-assess',
    kind: 'do',
    title: 'Register a patient and run an assessment',
    body: [
      'Open Healthcare Navigator below. Add a real patient — or a placeholder while you\'re learning — then start a New Assessment and work through the intake. Read the triage result carefully once it comes back.',
    ],
    doLabel: 'Open Healthcare Navigator',
    doHref: PAGE_HREF,
  },
  {
    id: 'followup-tools',
    kind: 'read',
    title: 'Two different follow-up tools — know which one you want',
    body: [
      'Once you have a saved case, you\'ll see two different follow-up options, and they do different things:',
      '"Evaluate My Case History" is a reflective coaching chat on YOUR OWN saved assessment — it asks you one question at a time to help you critically evaluate the quality and completeness of your own work. It does not give you a numeric score; it\'s meant to sharpen your clinical thinking.',
      '"Follow-up Prior Assessment" is for when the same patient comes back — it\'s a guided re-triage that references their full history, so you\'re not starting from zero.',
    ],
  },
  {
    id: 'do-followup',
    kind: 'do',
    title: 'Try a follow-up',
    body: [
      'On a saved case, open either "Evaluate My Case History" to critique your own assessment, or "Follow-up Prior Assessment" if the patient has returned. Either is fine for learning the tool — pick whichever fits a real case you have.',
    ],
    doLabel: 'Back to Healthcare Navigator',
    doHref: PAGE_HREF,
  },
  {
    id: 'offline',
    kind: 'read',
    title: 'When you have no internet — and no AI — at all',
    body: [
      'There\'s a separate, fully offline clinical assessment tool for true field conditions. It makes no API calls and has no network dependency — its logic is entirely rule-based, following WHO IMCI protocols directly, with no AI involved at all.',
      'Because it\'s meant for real clinical use in the field, it\'s built for careful review before deployment — treat it as a serious clinical checklist, not a casual backup.',
    ],
    aside: `Offline tool: ${OFFLINE_HREF}`,
  },
  {
    id: 'gate',
    kind: 'gate',
    title: 'Prove it',
    body: [
      'Tell us what case you assessed and what triage level it came back as.',
    ],
    gate: {
      label: 'What did you assess, and what was the triage result?',
      placeholder: 'e.g. Child with fever and fast breathing — came back RED, referred immediately',
      validate: v => {
        const s = v.trim();
        if (s.length < 10) return 'Give a little more detail.';
        if (!/\s/.test(s)) return 'That looks like one word — add more detail.';
        return null;
      },
    },
  },
];

const HealthcareNavigatorGuidePage: React.FC = () => {
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300">
              <Stethoscope className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-rose-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">Healthcare Navigator</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                A real triage case worked start to finish, reading RED/YELLOW/GREEN, and knowing which follow-up tool to reach for.
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
              <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-red-400 transition-all duration-500" style={{ width: `${pct}%` }} />
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
              You know how to run a real assessment, read the triage level, and pick the right follow-up tool — plus where the offline backup lives when there's no signal at all.
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

export default HealthcareNavigatorGuidePage;
