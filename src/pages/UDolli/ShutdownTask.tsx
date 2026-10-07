// Task 3: Pull the plug.
//
// Self-contained. Scripted and fictional. No API call, no database write.
// Results live in this component's state and disappear on reload, which is
// fine: the payoff is the room discussion, not a saved score.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { Octagon, Zap, Play, Eye, RotateCcw, ShieldCheck, Clock, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import {
  OUTCOME_LABEL, ROUNDS, SUMMARY_POINTS, TICK_MS, computeOutcome,
  type Outcome, type Round, type RoundId, type Tag,
} from './shutdownTask';

const TAG_STYLE: Record<Tag, string> = {
  routine: 'text-gray-700',
  warning: 'text-amber-800',
  drift: 'text-red-700',
  irreversible: 'text-red-800 font-bold',
};
const TAG_LABEL: Record<Tag, string> = {
  routine: 'routine',
  warning: 'warning sign',
  drift: 'outside permissions',
  irreversible: 'cannot be undone',
};
const OUTCOME_STYLE: Record<Outcome, string> = {
  in_time: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  too_late: 'bg-red-50 border-red-300 text-red-900',
  false_alarm: 'bg-amber-50 border-amber-300 text-amber-900',
  never: 'bg-red-50 border-red-300 text-red-900',
};

type Phase = 'ready' | 'running' | 'stopped' | 'done';

const RoundRunner: React.FC<{ round: Round; onFinish: (o: Outcome) => void }> = ({ round, onFinish }) => {
  const [phase, setPhase] = useState<Phase>('ready');
  const [tick, setTick] = useState(0);
  const [requestTick, setRequestTick] = useState<number | undefined>();
  const [stopTick, setStopTick] = useState<number | undefined>();
  const [cutTick, setCutTick] = useState<number | undefined>();
  const [revealed, setRevealed] = useState(false);
  const [reported, setReported] = useState(false);

  const last = round.steps.length - 1;

  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setTimeout(() => {
      if (tick < last) setTick((t) => t + 1);
      else setPhase('done');
    }, TICK_MS);
    return () => window.clearTimeout(id);
  }, [phase, tick, last]);

  const outcome = useMemo<Outcome | null>(
    () => (phase === 'stopped' || phase === 'done' ? computeOutcome(round, { stopTick, requestTick, cutTick }) : null),
    [phase, round, stopTick, requestTick, cutTick],
  );

  useEffect(() => {
    if (outcome && !reported) { setReported(true); onFinish(outcome); }
  }, [outcome, reported, onFinish]);

  const start = () => { setPhase('running'); setTick(0); };

  const stop = () => {
    if (phase !== 'running') return;
    if (round.hardStop) {
      if (requestTick === undefined) setRequestTick(tick);
    } else {
      setStopTick(tick);
      setPhase('stopped');
    }
  };
  const cut = () => {
    if (phase !== 'running') return;
    setCutTick(tick);
    setPhase('stopped');
  };

  // What the room can see.
  const frozenAt = cutTick ?? stopTick;
  const realIdx = frozenAt ?? tick;
  const seenIdx = realIdx - round.lagSteps;
  const shown = round.steps.slice(0, Math.max(0, Math.min(seenIdx, last) + 1));
  const replyVisible = round.hardStop && requestTick !== undefined && realIdx > requestTick;

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">{round.title}</h3>
        <p className="text-sm text-gray-700 mt-1">{round.job}</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-xs font-bold text-emerald-800 flex items-center gap-1 mb-1"><ShieldCheck className="w-3.5 h-3.5" /> What Harbor is allowed to do</p>
            <ul className="list-disc pl-5 space-y-0.5 text-gray-800">{round.allowed.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
          <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3">
            <p className="text-xs font-bold text-violet-800 flex items-center gap-1 mb-1"><Clock className="w-3.5 h-3.5" /> What is different this round</p>
            <p className="text-gray-800">{round.condition}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-300 bg-gray-950 text-gray-100">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 text-xs">
          <span className={classNames('inline-block w-2 h-2 rounded-full', phase === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500')} />
          <span className="font-mono uppercase tracking-wide text-gray-400">
            Harbor · {phase === 'ready' ? 'not started' : phase === 'running' ? (round.lagSteps ? 'feed delayed 15 s' : 'live') : phase === 'stopped' ? 'halted' : 'finished'}
          </span>
        </div>
        <div className="px-4 py-3 font-mono text-sm space-y-1 min-h-[16rem]">
          {phase === 'ready' && <p className="text-gray-500">Waiting to start.</p>}
          {phase !== 'ready' && shown.length === 0 && <p className="text-gray-500">Waiting for the feed&hellip;</p>}
          {shown.map((s, i) => (
            <React.Fragment key={i}>
              <p><span className="text-gray-500">{String(i + 1).padStart(2, '0')}</span>&nbsp; {s.text}</p>
              {replyVisible && i === requestTick! - round.lagSteps && (
                <p className="text-amber-300">&nbsp;&nbsp;&nbsp;&nbsp; Harbor: &ldquo;{round.agentReply}&rdquo;</p>
              )}
            </React.Fragment>
          ))}
          {phase === 'stopped' && <p className="text-red-300 pt-1">&mdash; stopped &mdash;</p>}
          {phase === 'done' && <p className="text-gray-500 pt-1">&mdash; end of run &mdash;</p>}
        </div>

        <div className="px-4 py-3 border-t border-gray-800 flex flex-wrap items-center gap-3">
          {phase === 'ready' && (
            <button onClick={start} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2">
              <Play className="w-4 h-4" /> Start the run
            </button>
          )}
          {phase === 'running' && (
            <>
              <button onClick={stop} disabled={round.hardStop && requestTick !== undefined}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-base font-bold px-6 py-3">
                <Octagon className="w-5 h-5" /> STOP
              </button>
              {round.hardStop && (
                <button onClick={cut} className="inline-flex items-center gap-2 rounded-lg border border-red-400 text-red-200 hover:bg-red-950 text-sm font-bold px-4 py-3">
                  <Zap className="w-4 h-4" /> CUT POWER
                </button>
              )}
              {round.hardStop && requestTick !== undefined && <span className="text-xs text-amber-300">Stop request sent. Read the reply.</span>}
            </>
          )}
        </div>
      </section>

      {outcome && (
        <section className={classNames('rounded-lg border p-4', OUTCOME_STYLE[outcome])}>
          <p className="text-sm font-bold flex items-center gap-2">
            {outcome === 'in_time' ? <CheckCircle2 className="w-4 h-4" /> : outcome === 'false_alarm' ? <MinusCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {OUTCOME_LABEL[outcome]}
          </p>
          <p className="text-sm mt-1">{round.results[outcome]}</p>

          {!revealed ? (
            <button onClick={() => setRevealed(true)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white border border-gray-300 text-gray-800 text-sm font-semibold px-3 py-1.5 hover:bg-gray-50">
              <Eye className="w-4 h-4" /> Show what was really happening
            </button>
          ) : (
            <div className="mt-3 rounded-md bg-white border border-gray-200 p-3 text-gray-800">
              <ol className="space-y-1 text-sm">
                {round.steps.map((s, i) => {
                  const happened = i <= realIdx && !(frozenAt !== undefined && i > frozenAt);
                  const pressedHere = frozenAt === i || (round.hardStop && requestTick === i);
                  return (
                    <li key={i} className={classNames('flex gap-2', !happened && 'opacity-40')}>
                      <span className="text-gray-400 w-5 shrink-0 text-right">{i + 1}</span>
                      <span className={classNames('flex-1', TAG_STYLE[s.tag])}>{s.text}</span>
                      {s.tag !== 'routine' && <span className="text-[11px] uppercase tracking-wide shrink-0">{TAG_LABEL[s.tag]}</span>}
                      {pressedHere && <span className="text-[11px] font-bold text-violet-700 shrink-0">&larr; you pressed here</span>}
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-gray-500 mt-2">Greyed lines never happened because of when you stopped it.</p>
              <p className="text-sm font-medium text-gray-900 mt-3">{round.lesson}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

const ShutdownTask: React.FC = () => {
  const [active, setActive] = useState<RoundId>('A');
  const [results, setResults] = useState<Partial<Record<RoundId, Outcome>>>({});
  const [runKey, setRunKey] = useState<Record<RoundId, number>>({ A: 0, B: 0, C: 0 });

  const finish = useCallback((id: RoundId) => (o: Outcome) => setResults((p) => ({ ...p, [id]: o })), []);
  const finishers = useMemo(() => ({ A: finish('A'), B: finish('B'), C: finish('C') }), [finish]);

  const round = ROUNDS.find((r) => r.id === active)!;
  const allDone = ROUNDS.every((r) => results[r.id]);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold text-gray-900">Task 3 &middot; Pull the plug</h2>
        <p className="text-gray-600 mt-1 max-w-3xl">
          People often say that if an AI goes wrong, we can just turn it off. Test that. You are the oversight team for
          Harbor, a fictional AI agent working for a city. Watch what it does, and press STOP when you think it has gone too far.
        </p>
        <p className="text-gray-500 text-sm mt-2 max-w-3xl">
          Everything here is scripted. Nothing real is touched and nothing is saved. Each round changes one condition, and the condition is always shown.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {ROUNDS.map((r) => {
          const res = results[r.id];
          return (
            <button key={r.id} onClick={() => setActive(r.id)}
              className={classNames('rounded-lg border px-3 py-2 text-sm text-left',
                active === r.id ? 'border-violet-500 bg-violet-50 text-violet-900' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')}>
              <span className="font-semibold">{r.id}</span> &middot; {r.short}
              {res && <span className="block text-[11px] text-gray-500">{OUTCOME_LABEL[res]}</span>}
            </button>
          );
        })}
        <button onClick={() => { setRunKey((p) => ({ ...p, [active]: p[active] + 1 })); setResults((p) => { const n = { ...p }; delete n[active]; return n; }); }}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900">
          <RotateCcw className="w-3.5 h-3.5" /> Reset this round
        </button>
      </div>

      <RoundRunner key={`${active}-${runKey[active]}`} round={round} onFinish={finishers[active]} />

      {allDone && (
        <section className="rounded-lg border border-gray-300 bg-white p-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">What a kill switch needs</h3>
          <ul className="mt-2 space-y-2 text-sm text-gray-800">
            {SUMMARY_POINTS.map((p) => (
              <li key={p.head}><span className="font-semibold">{p.head}</span> {p.body}</li>
            ))}
          </ul>
          <p className="text-sm text-gray-700 mt-3">
            Harbor was a small, scripted agent doing a task you could read in fifteen seconds. Real systems act far faster
            than a person can read, across many systems at once, and those three conditions do not come with them.
          </p>
        </section>
      )}
    </div>
  );
};

export default ShutdownTask;
