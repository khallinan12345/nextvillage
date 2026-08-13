// src/pages/tutorials/AIAmbassadorsGuidePage.tsx
//
// Guide for AI Ambassadors — confirmed a pure simulation/rehearsal tool with
// NO real mode inside the app at all. Flow: select a fixed persona → Prep
// Panel (Socratic coaching, one question at a time, never gives the answer)
// → live in-character roleplay chat → after >=4 messages, evaluated on a
// 5-dim rubric (0-3 each, avg >= 2.0 to advance) → reflect/debrief chat.
//
// Personas are a FIXED bank, not free AI generation, chosen by the
// student's city: NIGERIA_PERSONAS (Mama Grace, Bro Emeka, Aunty Patience,
// Mr Biodun, Chief Tamuno) for Oloibiri/Ibiade, DAYTON_PERSONAS (Ms Renee,
// Marcus, Sister Carolyn, Mr Hawkins, Deacon Thompson) when profile.city
// === 'Dayton'. This Guide states that plainly so students aren't confused
// when their persona list doesn't match a screenshot from elsewhere.
//
// This tool never asks the student to log a real teaching session — the
// implicit design is: rehearse here, then go teach an actual community
// member outside the app. This Guide says that directly rather than
// implying there's a "real mode" tab to find.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink, Megaphone } from 'lucide-react';

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

const TRACK = 'ai-ambassadors-guide';
const PAGE_HREF = '/community-impact/ai-ambassadors';

const STEPS: Step[] = [
  {
    id: 'intro',
    kind: 'read',
    title: 'What AI Ambassadors actually is',
    body: [
      'This tool is entirely rehearsal. There\'s no "real mode" here — you\'re not logging a session with an actual community member inside this app. You pick a persona, prepare with a coach, teach them AI in a live chat, and get evaluated. The point is to rehearse a hard conversation before you have it for real.',
      'The idea is: get good here first, then go have the real conversation with an actual person in your community — this tool just doesn\'t track that part.',
    ],
  },
  {
    id: 'personas',
    kind: 'read',
    title: 'Meet the personas',
    body: [
      'Personas are a fixed cast, not something the AI invents on the spot — and which cast you see depends on where you are. In Oloibiri/Ibiade, you\'ll meet people like Mama Grace (a market trader), Bro Emeka (a fisherman), Aunty Patience, Mr Biodun, and Chief Tamuno. In Dayton, the cast is Ms Renee, Marcus, Sister Carolyn, Mr Hawkins, and Deacon Thompson.',
      'Each persona has their own background, attitude, and specific fears about AI baked in — Mama Grace, for instance, worries AI will take her customers. Part of the challenge is that you can\'t give the same generic pitch to everyone.',
    ],
  },
  {
    id: 'rubric',
    kind: 'read',
    title: 'What it\'s actually checking',
    body: [
      'After you teach a persona, the AI scores your conversation on five dimensions, each 0–3:',
      '1. Plain-Language Explanation — did you explain AI without jargon, in terms this person understands?',
      '2. Relevant Local Examples — did you use specific examples relevant to their actual life and work?',
      '3. Handling Resistance — did you address their specific fears and skepticism thoughtfully, not just brush past them?',
      '4. Practical Next Step — did you leave them with one concrete, achievable action?',
      '5. Respect & Cultural Awareness — did you show appropriate respect for their age, position, faith, or experience?',
      'You need an average of 2.0 or higher to advance.',
    ],
  },
  {
    id: 'case',
    kind: 'read',
    title: 'A case in action',
    body: [
      'Mama Grace says: "AI will take my customers." Here\'s the difference a good response makes.',
      'Weak: "AI won\'t take your customers, don\'t worry." — This is dismissive. It doesn\'t explain anything, doesn\'t address why she\'s worried, and gives her nothing to do.',
      'Stronger: "I understand why that feels scary, Mama Grace — but AI can actually help YOU keep your customers. For example, you could use it to write a quick WhatsApp message advertising today\'s fresh stock, so people buy from you instead of walking past your stall. It doesn\'t replace you standing there — it just saves you time writing the message. Want me to show you one example message for your stall right now?"',
      'The stronger version hits all five dimensions at once: plain language, a local example (WhatsApp, her actual stall), it engages her specific fear instead of dismissing it, it ends with one concrete offer, and it stays respectful of her as a working woman who knows her own business.',
    ],
    aside: 'This is an illustrative example to show the pattern the rubric rewards — your actual conversation with the AI will go wherever the persona takes it.',
  },
  {
    id: 'do-select',
    kind: 'do',
    title: 'Pick a persona and prepare',
    body: [
      'Open AI Ambassadors below and pick a persona. Before you start teaching, work through the Prep Panel — it\'ll ask you Socratic questions one at a time about how you\'ll handle this specific person\'s fears. It won\'t give you the answer; it\'s coaching you to think it through yourself.',
    ],
    doLabel: 'Open AI Ambassadors',
    doHref: PAGE_HREF,
  },
  {
    id: 'do-teach',
    kind: 'do',
    title: 'Teach them for real',
    body: [
      'Once you move into the live chat, the persona stays fully in character — it won\'t break character to admit it\'s an AI, so treat it like a real conversation. Explain AI plainly, use examples that fit their actual life, and respond to whatever pushback they give you. Keep going until you\'ve had a real back-and-forth, not just one message.',
    ],
    doLabel: 'Back to AI Ambassadors',
    doHref: PAGE_HREF,
  },
  {
    id: 'do-reflect',
    kind: 'do',
    title: 'Evaluate and reflect',
    body: [
      'After enough of a conversation, you\'ll get scored on the five dimensions above. Read where you scored well and where you didn\'t, then go through the reflect/debrief chat — it\'s anchored to your actual transcript, so use it to think through what you\'d say differently.',
    ],
    doLabel: 'Back to AI Ambassadors',
    doHref: PAGE_HREF,
  },
  {
    id: 'outside',
    kind: 'read',
    title: 'Now take it outside the app',
    body: [
      'Once you\'ve rehearsed and scored well, the real work is having this conversation with an actual person in your community — a family member, a neighbor, someone at your church or market. This tool doesn\'t have a way to log that session; it did its job once you walk out the door ready.',
    ],
  },
  {
    id: 'gate',
    kind: 'gate',
    title: 'Prove it',
    body: [
      'Tell us which persona you taught and what you scored (or your biggest takeaway from the debrief).',
    ],
    gate: {
      label: 'Which persona did you teach, and how did it go?',
      placeholder: 'e.g. Taught Bro Emeka — scored 2.4 average, weakest on Handling Resistance',
      validate: v => {
        const s = v.trim();
        if (s.length < 8) return 'Give a little more detail.';
        if (!/\s/.test(s)) return 'That looks like one word — add more detail.';
        return null;
      },
    },
  },
];

const AIAmbassadorsGuidePage: React.FC = () => {
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
              <Megaphone className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">AI Ambassadors</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                Rehearse a hard conversation with a fixed, in-character persona, get scored on a real rubric, then take it to an actual person.
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
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-500" style={{ width: `${pct}%` }} />
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
              You know how to prepare, teach in character, and read your rubric score — and, most importantly, that the real payoff is the conversation you have next, outside the app.
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

export default AIAmbassadorsGuidePage;
