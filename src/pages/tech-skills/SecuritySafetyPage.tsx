// src/pages/tech-skills/SecuritySafetyPage.tsx
// Security & Safety Lab — a hands-on, scaffolded security trainer.
//
// The learner works through a practice repo with planted security mistakes, one step at a time:
// decide → fix → explain, with automatic checks, escalating hints and an AI coach. GitHub security is part of
// the path (secret scanning, push protection, branch protection, CODEOWNERS, Actions permissions).
//
// Lesson content and checks: ./securityLab/content.ts (unit-tested). AI coaching: /api/security-task-instruction.
// Progress is saved to the learner's dashboard row (columns sec_*), with localStorage as a fallback so the
// lab still works before the migration is applied or when offline.

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import Editor from '@monaco-editor/react';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import {
  ShieldCheck, CheckCircle, ArrowRight, FileCode, Loader2, Lightbulb, BarChart3,
  X, Volume2, VolumeX, AlertCircle, Github, Code2, ListChecks, RotateCcw, Eye, Circle,
} from 'lucide-react';
import {
  TASKS, STARTER_FILES, PHASE_META, toMap, runChecks, hintFor, sameSet, keywordReview, totalSteps,
  type ProjectFile, type Step, type Phase,
} from './securityLab/content';

// ─── Types & constants ───────────────────────────────────────────────────────

const SEC_ACTIVITY = 'security_safety_lab';
const SEC_SESSION_ID = 'security-lab';
const lsKey = (uid: string | null) => `sec_lab_v1_${uid ?? 'anon'}`;

interface StepRecord {
  /** Failed tries before it was right (checks run, wrong picks, or answers not accepted). */
  misses: number;
  /** True when the learner used "show me" instead of getting there themselves. */
  assisted: boolean;
}

interface Progress { done: Record<string, StepRecord>; }

type RightTab = 'code' | 'findings' | 'github';

const getLanguage = (path: string) => {
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.sql')) return 'sql';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
  return 'plaintext';
};

async function callCoach(body: Record<string, unknown>) {
  const res = await fetch('/api/security-task-instruction', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const isTaskDone = (taskIdx: number, done: Progress['done']) => {
  const t = TASKS[taskIdx];
  return t.isOnboarding ? !!done[t.id] : t.steps.every(s => !!done[s.id]);
};

/** First task/step the learner has not finished — where they should be dropped in. */
function frontier(done: Progress['done']): { task: number; step: number } {
  for (let ti = 0; ti < TASKS.length; ti++) {
    const t = TASKS[ti];
    if (t.isOnboarding) { if (!done[t.id]) return { task: ti, step: 0 }; continue; }
    const si = t.steps.findIndex(s => !done[s.id]);
    if (si >= 0) return { task: ti, step: si };
  }
  return { task: TASKS.length - 1, step: TASKS[TASKS.length - 1].steps.length - 1 };
}

const allDone = (done: Progress['done']) => TASKS.every((_, i) => isTaskDone(i, done));

// 0–3 per phase from how much help the learner needed. Mirrors the 0–3 scale used by the other labs.
function phaseScore(phase: Phase, done: Progress['done']): number | null {
  const steps = TASKS.filter(t => t.phase === phase).flatMap(t => t.steps);
  const recs = steps.map(s => done[s.id]).filter(Boolean) as StepRecord[];
  if (!steps.length || recs.length < steps.length) return null;
  const assisted = recs.filter(r => r.assisted).length / recs.length;
  const avgMisses = recs.reduce((n, r) => n + r.misses, 0) / recs.length;
  if (assisted === 0 && avgMisses <= 0.75) return 3;
  if (assisted <= 0.25 && avgMisses <= 2) return 2;
  if (assisted <= 0.5) return 1;
  return 0;
}

// ─── Small pieces ────────────────────────────────────────────────────────────

const Welcome: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div className="flex flex-col gap-4 p-4">
    <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl">
      <p className="text-xs font-bold text-red-400 uppercase mb-3">🛡️ Welcome to the Security &amp; Safety Lab</p>
      <p className="text-sm text-gray-300 leading-relaxed">
        Most hacked websites are not hacked by clever geniuses. They are hacked by automatic bots that try the same
        old mistakes on millions of sites: a password left in the code, a database anyone can read, a fake package.
      </p>
      <div className="mt-3">
        <AIPidginCoachWrapper englishText="Most hacked websites are not hacked by clever geniuses. They are hacked by automatic bots that try the same old mistakes on millions of sites: a password left in the code, a database anyone can read, a fake package." />
      </div>
    </div>

    <div className="p-3 bg-gray-800/60 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">🏪 Your practice repo: Village Market</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        It is a small shop site with security mistakes planted on purpose. The <strong className="text-white">Code</strong> tab
        holds its files. You will find the problems and fix them yourself — nothing here touches a real site or your GitHub account.
      </p>
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">🪜 Every step works the same way</p>
      <ol className="text-xs text-gray-400 leading-relaxed list-decimal pl-4 space-y-0.5">
        <li><strong className="text-white">Learn</strong> a short idea.</li>
        <li><strong className="text-white">Decide</strong> what is right, or <strong className="text-white">fix</strong> a file.</li>
        <li>Get <strong className="text-white">hints</strong> that start small. The answer is always last, never first.</li>
        <li><strong className="text-white">Explain</strong> it in your own words.</li>
      </ol>
    </div>

    <div className="grid grid-cols-3 gap-2 text-center">
      {([1, 2, 3] as Phase[]).map(p => (
        <div key={p} className={`p-2 rounded-lg border ${PHASE_META[p].bg} ${PHASE_META[p].border}`}>
          <p className={`text-[10px] font-bold ${PHASE_META[p].color}`}>{PHASE_META[p].label}</p>
        </div>
      ))}
    </div>

    <button onClick={onStart}
      className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors">
      Start the lab <ArrowRight size={16} />
    </button>
  </div>
);

const TaskStepper: React.FC<{
  taskIndex: number; done: Progress['done']; onJump: (i: number) => void;
}> = ({ taskIndex, done, onJump }) => (
  <div className="px-3 py-3 border-b border-gray-700 flex flex-col gap-2 overflow-y-auto max-h-56 flex-shrink-0">
    {([1, 2, 3] as Phase[]).map(phase => {
      const pm = PHASE_META[phase];
      return (
        <div key={phase}>
          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${pm.color}`}>{pm.label}</p>
          <div className="flex flex-col gap-0.5">
            {TASKS.map((task, i) => {
              if (task.phase !== phase) return null;
              const finished = isTaskDone(i, done);
              const unlocked = i === 0 || isTaskDone(i - 1, done);
              const current = i === taskIndex;
              return (
                <button key={task.id} onClick={() => unlocked && onJump(i)} disabled={!unlocked}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                    ${current ? `${pm.bg} ${pm.border} border font-bold ${pm.color}` : ''}
                    ${!current && finished ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
                    ${!current && !finished && unlocked ? 'text-gray-300 hover:bg-gray-700/50 cursor-pointer' : ''}
                    ${!unlocked ? 'text-gray-600 cursor-default' : ''}`}>
                  <span className="flex-shrink-0 text-sm">{finished ? '✅' : unlocked ? task.icon : '🔒'}</span>
                  <span className="truncate flex-1">{task.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
);

const FeedbackBox: React.FC<{ tone: 'good' | 'warn' | 'info' | 'bad'; title?: string; children: React.ReactNode }> = ({ tone, title, children }) => {
  const cls = {
    good: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
    warn: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    info: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
    bad: 'border-red-500/30 bg-red-500/5 text-red-400',
  }[tone];
  return (
    <div className={`rounded-xl border ${cls.split(' ').slice(0, 2).join(' ')}`}>
      {title && <p className={`px-3 pt-2.5 text-[9px] font-bold uppercase tracking-wide ${cls.split(' ')[2]}`}>{title}</p>}
      <div className="px-3 py-2.5 text-xs text-gray-200 leading-relaxed whitespace-pre-line">{children}</div>
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

const SecuritySafetyPage: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUserId(data?.user?.id || null); setAuthChecked(true); });
  }, []);

  // ── Learner profile: grade level (coach tone) and voice default ─────────
  const [gradeLevel, setGradeLevel] = useState<number | null>(null);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('grade_level, country').eq('id', userId).single().then(({ data }) => {
      if (data?.grade_level) setGradeLevel(data.grade_level);
      setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english');
    });
  }, [userId]);
  const { speak, cancel: cancelSpeech, fallbackText, clearFallback } = useVoice(voiceMode === 'pidgin');
  const speakRef = useRef<(t: string) => void>(() => {});
  useEffect(() => { speakRef.current = (t: string) => { if (voiceOutputEnabled && t.trim()) speak(t); }; }, [voiceOutputEnabled, speak]);

  // ── Project + progress (restored from the database, else localStorage) ──
  const [files, setFiles] = useState<ProjectFile[]>(STARTER_FILES);
  const [progress, setProgress] = useState<Progress>({ done: {} });
  const [loaded, setLoaded] = useState(false);
  const rowIdRef = useRef<number | null>(null);
  const dbOkRef = useRef(true);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    (async () => {
      let restored: { files?: ProjectFile[]; progress?: Progress } | null = null;
      if (userId) {
        const { data, error } = await supabase.from('dashboard')
          .select('id, sec_pages, sec_progress')
          .eq('user_id', userId).eq('activity', SEC_ACTIVITY).eq('sec_session_id', SEC_SESSION_ID)
          .order('updated_at', { ascending: false }).limit(1);
        if (error) dbOkRef.current = false;
        else if (data?.[0]) {
          rowIdRef.current = data[0].id;
          restored = { files: data[0].sec_pages as ProjectFile[], progress: data[0].sec_progress as Progress };
        }
      }
      if (!restored?.progress) {
        try { const raw = localStorage.getItem(lsKey(userId)); if (raw) restored = JSON.parse(raw); } catch { /* ignore */ }
      }
      if (cancelled) return;
      if (restored?.files?.length) {
        // Keep any starter file the saved copy predates, so new lab content never leaves a missing file.
        const saved = new Map(restored.files.map(f => [f.path, f.content]));
        setFiles(STARTER_FILES.map(f => ({ path: f.path, content: saved.get(f.path) ?? f.content })));
      }
      if (restored?.progress?.done) setProgress({ done: restored.progress.done });
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [authChecked, userId]);

  // Debounced save after any change.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      const payload = { files, progress };
      try { localStorage.setItem(lsKey(userId), JSON.stringify(payload)); } catch { /* ignore */ }
      if (!userId || !dbOkRef.current) { setSaveState('local'); return; }
      setSaveState('saving');
      const cols = {
        sec_session_id: SEC_SESSION_ID, sec_session_name: 'Security & Safety Lab',
        sec_pages: files, sec_progress: progress, updated_at: new Date().toISOString(),
      };
      const q = rowIdRef.current
        ? await supabase.from('dashboard').update(cols).eq('id', rowIdRef.current).eq('user_id', userId)
        : await supabase.from('dashboard').insert({ user_id: userId, activity: SEC_ACTIVITY, ...cols }).select('id').single();
      if (q.error) { dbOkRef.current = false; setSaveState('local'); return; }
      const inserted = 'data' in q ? (q.data as { id?: number } | null)?.id : undefined;
      if (inserted) rowIdRef.current = inserted;
      setSaveState('saved');
    }, 1200);
    return () => clearTimeout(t);
  }, [files, progress, loaded, userId]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const [taskIndex, setTaskIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const placedRef = useRef(false);
  useEffect(() => {
    if (!loaded || placedRef.current) return;
    placedRef.current = true;
    const f = frontier(progress.done);
    setTaskIndex(f.task); setStepIndex(f.step);
  }, [loaded, progress.done]);

  const task = TASKS[taskIndex];
  const step: Step | undefined = task.steps[stepIndex];
  const stepDone = step ? progress.done[step.id] : undefined;
  const pm = PHASE_META[task.phase];
  const finishedCount = useMemo(() => TASKS.flatMap(t => t.steps).filter(s => progress.done[s.id]).length, [progress.done]);
  const labComplete = allDone(progress.done);

  // ── Per-step UI state (reset whenever the step changes) ─────────────────
  const [picked, setPicked] = useState<string[]>([]);
  const [misses, setMisses] = useState(0);
  const [message, setMessage] = useState<{ tone: 'good' | 'warn' | 'info' | 'bad'; title?: string; text: string } | null>(null);
  const [checkResults, setCheckResults] = useState<{ id: string; label: string; pass: boolean }[] | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  const [activeFilePath, setActiveFilePath] = useState('README.md');
  const [rightTab, setRightTab] = useState<RightTab>('code');

  useEffect(() => {
    setPicked([]); setMisses(0); setMessage(null); setCheckResults(null); setTicked([]); setAnswer(''); setBusy(false);
    if (step?.kind === 'fix') { setActiveFilePath(step.openFile); setRightTab('code'); }
    if (step) speakRef.current(`${step.teaching} ${'question' in step ? step.question : 'instruction' in step ? step.instruction : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIndex, stepIndex]);

  const markDone = useCallback((id: string, missCount: number, assisted: boolean) => {
    setProgress(p => p.done[id] ? p : { done: { ...p.done, [id]: { misses: missCount, assisted } } });
  }, []);

  const goNext = useCallback(() => {
    if (stepIndex < task.steps.length - 1) { setStepIndex(stepIndex + 1); return; }
    if (taskIndex < TASKS.length - 1) { setTaskIndex(taskIndex + 1); setStepIndex(0); }
  }, [stepIndex, task, taskIndex]);

  const jumpToTask = (i: number) => {
    const t = TASKS[i];
    const first = t.steps.findIndex(s => !progress.done[s.id]);
    setTaskIndex(i); setStepIndex(first >= 0 ? first : 0);
  };

  // ── Step actions ────────────────────────────────────────────────────────
  const fileMap = useMemo(() => toMap(files), [files]);

  const checkDecision = () => {
    if (step?.kind !== 'decide' || !picked.length) return;
    if (sameSet(picked, step.correct)) {
      markDone(step.id, misses, false);
      setMessage({ tone: 'good', title: '✅ Correct', text: step.options.filter(o => step.correct.includes(o.id)).map(o => o.feedback).join('\n') });
    } else {
      setMisses(m => m + 1);
      const wrongPicked = step.options.filter(o => picked.includes(o.id) && !step.correct.includes(o.id));
      const missing = step.multi && picked.every(p => step.correct.includes(p));
      const lines = wrongPicked.map(o => `“${o.label}” — ${o.feedback}`);
      if (missing) lines.push(`Good so far, but there are ${step.correct.length} right answers. Keep looking.`);
      setMessage({ tone: 'warn', title: '💡 Not quite', text: lines.join('\n\n') || 'Not quite. Re-read the idea above and try again.' });
    }
  };

  const revealDecision = () => {
    if (step?.kind !== 'decide') return;
    markDone(step.id, misses, true);
    setPicked(step.correct);
    setMessage({ tone: 'info', title: 'The answer', text: step.options.filter(o => step.correct.includes(o.id)).map(o => `“${o.label}” — ${o.feedback}`).join('\n\n') });
  };

  const runFixChecks = () => {
    if (step?.kind !== 'fix') return;
    const results = runChecks(step.checks, fileMap);
    setCheckResults(results);
    const failing = results.filter(r => !r.pass);
    if (!failing.length) {
      markDone(step.id, misses, false);
      setMessage({ tone: 'good', title: '✅ Fixed', text: 'Every check passes. ' + step.solutionNote });
      return;
    }
    const nextMisses = misses + 1;
    setMisses(nextMisses);
    const firstFailing = step.checks.find(c => c.id === failing[0].id)!;
    setMessage({ tone: 'warn', title: `💡 ${failing.length} thing${failing.length > 1 ? 's' : ''} left`, text: hintFor(firstFailing, nextMisses) ?? 'Keep going.' });
  };

  const askCoachOnFix = async () => {
    if (step?.kind !== 'fix' || busy) return;
    const results = runChecks(step.checks, fileMap);
    const failing = results.filter(r => !r.pass).map(r => r.label);
    setCheckResults(results);
    if (!failing.length) { runFixChecks(); return; }
    setBusy(true);
    try {
      const r = await callCoach({
        mode: 'coach', instruction: step.instruction, path: step.openFile,
        fileContent: fileMap[step.openFile] ?? '', failing, gradeLevel,
      });
      setMessage({ tone: 'info', title: '🧑‍🏫 Coach', text: r.feedback });
      speakRef.current(String(r.feedback).slice(0, 220));
    } catch {
      const firstFailing = step.checks.find(c => c.id === results.find(x => !x.pass)!.id)!;
      setMessage({ tone: 'info', title: '🧑‍🏫 Coach is offline — here is a hint', text: hintFor(firstFailing, Math.max(1, misses)) ?? 'Re-read the idea above.' });
    } finally { setBusy(false); }
  };

  const revealFix = () => {
    if (step?.kind !== 'fix') return;
    setFiles(prev => prev.map(f => step.solution.find(s => s.path === f.path) ?? f));
    setActiveFilePath(step.solution[0].path);
    setCheckResults(runChecks(step.checks, { ...fileMap, ...toMap(step.solution) }));
    markDone(step.id, misses, true);
    setMessage({ tone: 'info', title: 'Reference fix applied', text: `${step.solutionNote}\n\nRead the changed file and make sure you could explain every change.` });
  };

  const toggleTick = (id: string) => {
    if (step?.kind !== 'checklist') return;
    const next = ticked.includes(id) ? ticked.filter(t => t !== id) : [...ticked, id];
    setTicked(next);
    if (next.length === step.items.length) {
      markDone(step.id, 0, false);
      setMessage({ tone: 'good', title: '✅ Complete', text: 'Every protection ticked. Remember: knowing where a setting lives is half the job — turn them on for your own repos.' });
    }
  };

  const submitExplain = async () => {
    if (step?.kind !== 'explain' || busy || !answer.trim()) return;
    setBusy(true);
    let pass: boolean; let feedback: string;
    try {
      const r = await callCoach({
        mode: 'critique', question: step.question, teaching: step.teaching, answer, modelAnswer: step.modelAnswer, gradeLevel,
      });
      pass = r.pass === true; feedback = r.feedback;
    } catch {
      pass = keywordReview(answer, step.keywords);
      feedback = pass
        ? 'Great job. You covered the key idea — let’s move on.'
        : 'The coach is offline, so this was a quick check: it did not mention the key idea yet. Re-read the idea above and add what you think is the most important part.';
    }
    if (pass) markDone(step.id, misses, false); else setMisses(m => m + 1);
    setMessage({ tone: pass ? 'good' : 'warn', title: pass ? '✅ Step complete' : '💡 Feedback', text: feedback });
    speakRef.current(feedback.slice(0, 200));
    setBusy(false);
  };

  const revealExplain = () => {
    if (step?.kind !== 'explain') return;
    markDone(step.id, misses, true);
    setMessage({ tone: 'info', title: 'A strong answer', text: step.modelAnswer });
  };

  // ── Evaluation ──────────────────────────────────────────────────────────
  const [showEval, setShowEval] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalNote, setEvalNote] = useState<{ strengths: string; improvements: string; nextSteps: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const phaseScores = useMemo(() => ([1, 2, 3] as Phase[]).map(p => ({ phase: p, score: phaseScore(p, progress.done) })), [progress.done]);

  const handleEvaluate = async () => {
    setShowEval(true); setEvalNote(null); setEvalLoading(true);
    const summary = TASKS.filter(t => !t.isOnboarding).map(t => ({
      topic: t.label,
      steps: t.steps.map(s => {
        const r = progress.done[s.id];
        return { kind: s.kind, status: r ? (r.assisted ? 'needed the answer shown' : 'done') : 'not finished', misses: r?.misses ?? null };
      }),
    }));
    try { setEvalNote(await callCoach({ mode: 'evaluate', summary, gradeLevel })); }
    catch { setEvalNote(null); }
    finally { setEvalLoading(false); }
  };

  const handleReset = () => {
    setFiles(STARTER_FILES); setProgress({ done: {} }); setTaskIndex(0); setStepIndex(0);
    setConfirmReset(false); setShowEval(false); setEvalNote(null);
  };

  const resetActiveFile = () => {
    const orig = STARTER_FILES.find(f => f.path === activeFilePath);
    if (orig) setFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: orig.content } : f));
  };

  const activeFile = files.find(f => f.path === activeFilePath) ?? files[0];
  const stepFiles = step?.kind === 'fix' ? new Set([step.openFile, ...step.solution.map(s => s.path)]) : new Set<string>();
  const liveResults = step?.kind === 'fix' ? runChecks(step.checks, fileMap) : null;

  const isLastStepOfLab = taskIndex === TASKS.length - 1 && stepIndex === task.steps.length - 1;

  // ── Render ──────────────────────────────────────────────────────────────

  const scoreColor = (s: number) => s >= 2.5 ? 'text-emerald-400' : s >= 1.5 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <Navbar />

      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm"><VoiceFallback text={fallbackText} onDismiss={clearFallback} /></div>
      )}

      {/* Evaluation modal */}
      {showEval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 size={20} className="text-purple-400" /> Your Security Progress</h2>
              <button onClick={() => setShowEval(false)} className="p-1 text-gray-400 hover:text-white" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2">
                {phaseScores.map(({ phase, score }) => (
                  <div key={phase} className={`p-3 rounded-xl border text-center ${PHASE_META[phase].bg} ${PHASE_META[phase].border}`}>
                    <p className={`text-[10px] font-bold uppercase ${PHASE_META[phase].color}`}>{PHASE_META[phase].label}</p>
                    <p className={`text-2xl font-black mt-1 ${score === null ? 'text-gray-500' : scoreColor(score)}`}>
                      {score === null ? '—' : score}<span className="text-xs font-normal text-gray-500"> / 3</span>
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">Scores reflect how much help you needed: 3 means you got it on your own, with few tries.</p>
              {evalLoading && <div className="flex items-center gap-2 text-sm text-gray-300"><Loader2 size={16} className="animate-spin text-purple-400" /> Your coach is writing a note…</div>}
              {evalNote && (
                <>
                  <FeedbackBox tone="good" title="💪 Strengths">{evalNote.strengths}</FeedbackBox>
                  <FeedbackBox tone="warn" title="🎯 To work on">{evalNote.improvements}</FeedbackBox>
                  <FeedbackBox tone="info" title="➡️ Next steps">{evalNote.nextSteps}</FeedbackBox>
                </>
              )}
              {labComplete && (
                <a href="/certifications/security-safety"
                  className="block text-center px-4 py-2.5 text-sm font-bold bg-red-600 hover:bg-red-700 rounded-xl transition-colors">
                  🏆 Ready for the certification? Take the Security &amp; Safety Certification →
                </a>
              )}
              {!evalLoading && !evalNote && <p className="text-xs text-gray-400">The coach note is unavailable right now, but your scores above are saved with your progress.</p>}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck size={18} className="text-red-400 flex-shrink-0" />
            <span className="text-sm font-bold whitespace-nowrap">Security &amp; Safety Lab</span>
            <div className="w-px h-5 bg-gray-600 flex-shrink-0" />
            <span className="text-[11px] text-gray-400 whitespace-nowrap">{finishedCount}/{totalSteps()} steps</span>
            <div className="hidden sm:block w-28 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(finishedCount / totalSteps()) * 100}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-gray-500 hidden md:block">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'local' ? 'Saved on this device' : ''}
            </span>
            <button onClick={() => setVoiceOutputEnabled(v => { if (v) cancelSpeech(); return !v; })}
              aria-label={voiceOutputEnabled ? 'Turn voice off' : 'Turn voice on'}
              className={`p-1.5 rounded-lg border transition-colors ${voiceOutputEnabled ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-gray-600 border-gray-700 hover:text-gray-400'}`}>
              {voiceOutputEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <button onClick={() => setConfirmReset(true)} title="Start over"
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors" aria-label="Start over">
              <RotateCcw size={15} />
            </button>
            <button onClick={handleEvaluate} disabled={evalLoading || finishedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-colors disabled:opacity-50">
              {evalLoading ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />} Progress
            </button>
          </div>
        </div>

        {confirmReset && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 flex items-center gap-3 text-xs flex-shrink-0">
            <AlertCircle size={14} className="text-red-400" />
            <span className="text-red-200">Start over? Your edits and progress will be erased.</span>
            <button onClick={handleReset} className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded-sm font-bold">Yes, start over</button>
            <button onClick={() => setConfirmReset(false)} className="px-2 py-1 text-gray-300 hover:text-white">Cancel</button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
          {/* ═══ LEFT: guided step ═══ */}
          <div className="md:w-96 w-full flex-shrink-0 flex flex-col bg-[#1a1d23] border-r border-gray-700 overflow-hidden md:max-h-none max-h-[55vh]">
            {!loaded ? (
              <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-gray-500" /></div>
            ) : task.isOnboarding ? (
              <div className="flex-1 overflow-y-auto">
                <Welcome onStart={() => { markDone(task.id, 0, false); setTaskIndex(1); setStepIndex(0); }} />
              </div>
            ) : (
              <>
                <div className={`flex-shrink-0 flex items-center gap-2.5 px-4 py-3 border-b ${pm.border} ${pm.bg}`}>
                  <span className="text-lg">{task.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-[9px] font-bold uppercase tracking-wider ${pm.color}`}>{pm.label}</p>
                    <p className="text-sm font-bold truncate">{task.label}</p>
                  </div>
                  <div className="flex gap-1 ml-auto flex-shrink-0">
                    {task.steps.map((s, i) => (
                      <button key={s.id} onClick={() => (progress.done[s.id] || i === 0 || progress.done[task.steps[i - 1].id]) && setStepIndex(i)}
                        aria-label={`Step ${i + 1}`}
                        className={`w-2 h-2 rounded-full transition-colors ${progress.done[s.id] ? 'bg-emerald-400' : i === stepIndex ? 'bg-blue-400' : 'bg-gray-700'}`} />
                    ))}
                  </div>
                </div>

                <TaskStepper taskIndex={taskIndex} done={progress.done} onJump={jumpToTask} />

                <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0">
                  {step && (
                    <>
                      <div className="rounded-xl border border-gray-700 overflow-hidden">
                        <div className="px-3 pt-2.5 pb-2 bg-gray-800/80 border-b border-gray-700">
                          <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${pm.color}`}>Learn — step {stepIndex + 1} of {task.steps.length}</p>
                          <p className="text-xs text-gray-300 leading-relaxed">{step.teaching}</p>
                        </div>
                        <div className={`px-3 py-2.5 ${pm.bg}`}>
                          <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${pm.color}`}>
                            {step.kind === 'decide' ? 'Decide' : step.kind === 'fix' ? 'Fix it' : step.kind === 'checklist' ? 'Protect it' : 'Explain it'}
                          </p>
                          <p className="text-sm font-medium leading-relaxed">
                            {step.kind === 'decide' || step.kind === 'explain' ? step.question : step.instruction}
                          </p>
                        </div>
                      </div>

                      {/* decide */}
                      {step.kind === 'decide' && (
                        <fieldset className="flex flex-col gap-1.5" disabled={!!stepDone}>
                          <legend className="sr-only">{step.question}</legend>
                          {step.multi && <p className="text-[10px] text-gray-500">Pick all that apply.</p>}
                          {step.options.map(o => {
                            const on = picked.includes(o.id);
                            const revealed = !!stepDone && step.correct.includes(o.id);
                            return (
                              <label key={o.id}
                                className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors
                                  ${revealed ? 'border-emerald-500/50 bg-emerald-500/10' : on ? 'border-blue-500/50 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'}`}>
                                <input type={step.multi ? 'checkbox' : 'radio'} name={step.id} checked={on} className="mt-0.5"
                                  onChange={() => setPicked(p => step.multi ? (on ? p.filter(x => x !== o.id) : [...p, o.id]) : [o.id])} />
                                <span className="leading-relaxed">{o.label}</span>
                              </label>
                            );
                          })}
                        </fieldset>
                      )}

                      {/* fix */}
                      {step.kind === 'fix' && liveResults && (
                        <div className="flex flex-col gap-1.5">
                          <button onClick={() => { setActiveFilePath(step.openFile); setRightTab('code'); }}
                            className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200 self-start">
                            <FileCode size={13} /> Open {step.openFile}
                          </button>
                          <ul className="flex flex-col gap-1">
                            {(checkResults ?? liveResults).map(r => (
                              <li key={r.id} className="flex items-start gap-2 text-xs">
                                {checkResults
                                  ? (r.pass ? <CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> : <Circle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />)
                                  : <Circle size={14} className="text-gray-600 mt-0.5 flex-shrink-0" />}
                                <span className={checkResults && r.pass ? 'text-emerald-300' : 'text-gray-400'}>{r.label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* checklist */}
                      {step.kind === 'checklist' && (
                        <ul className="flex flex-col gap-1.5">
                          {step.items.map(it => {
                            const on = ticked.includes(it.id) || !!stepDone;
                            return (
                              <li key={it.id} className={`rounded-lg border p-2.5 ${on ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-gray-700'}`}>
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <input type="checkbox" className="mt-0.5" checked={on} disabled={!!stepDone} onChange={() => toggleTick(it.id)} />
                                  <span className="text-xs font-semibold">{it.label}</span>
                                </label>
                                <p className="text-[11px] text-gray-400 mt-1 ml-5"><span className="text-gray-500">Where:</span> {it.where}</p>
                                <p className="text-[11px] text-gray-400 ml-5"><span className="text-gray-500">Stops:</span> {it.stops}</p>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* explain */}
                      {step.kind === 'explain' && (
                        <div>
                          <textarea value={answer} onChange={e => setAnswer(e.target.value)} disabled={!!stepDone}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitExplain(); }}
                            placeholder="Write it in your own words…" aria-label="Your answer" style={{ minHeight: '110px' }}
                            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-hidden focus:border-red-500 transition-colors leading-relaxed disabled:opacity-60" />
                          <p className="text-[9px] text-gray-600 mt-1">Ctrl+Enter to submit</p>
                        </div>
                      )}

                      {message && <FeedbackBox tone={message.tone} title={message.title}>{message.text}</FeedbackBox>}
                    </>
                  )}
                </div>

                {/* Fixed action bar */}
                {step && (
                  <div className="flex-shrink-0 px-4 pb-4 pt-2 flex flex-col gap-2 border-t border-gray-800">
                    {!stepDone && step.kind === 'decide' && (
                      <>
                        <button onClick={checkDecision} disabled={!picked.length}
                          className="w-full py-2.5 text-sm font-bold bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-40">Check my answer</button>
                        {misses >= 2 && (
                          <button onClick={revealDecision} className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400">
                            <Eye size={13} /> Show me the answer
                          </button>
                        )}
                      </>
                    )}
                    {!stepDone && step.kind === 'fix' && (
                      <>
                        <div className="flex gap-2">
                          <button onClick={runFixChecks}
                            className="flex-1 py-2.5 text-sm font-bold bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Check my fix</button>
                          <button onClick={askCoachOnFix} disabled={busy} aria-label="Ask the coach"
                            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors disabled:opacity-40">
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />} Coach
                          </button>
                        </div>
                        {misses >= 3 && (
                          <button onClick={revealFix} className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400">
                            <Eye size={13} /> Show me the fix
                          </button>
                        )}
                      </>
                    )}
                    {!stepDone && step.kind === 'explain' && (
                      <>
                        <button onClick={submitExplain} disabled={busy || !answer.trim()}
                          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-40">
                          {busy && <Loader2 size={14} className="animate-spin" />} Submit
                        </button>
                        {misses >= 3 && (
                          <button onClick={revealExplain} className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400">
                            <Eye size={13} /> Show me a strong answer
                          </button>
                        )}
                      </>
                    )}
                    {stepDone && !isLastStepOfLab && (
                      <button onClick={goNext}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl border transition-all ${pm.bg} ${pm.color} ${pm.border} hover:opacity-90`}>
                        <CheckCircle size={14} /> {stepIndex < task.steps.length - 1 ? 'Next step' : 'Finish topic & continue'} <ArrowRight size={14} />
                      </button>
                    )}
                    {stepDone && isLastStepOfLab && labComplete && (
                      <button onClick={handleEvaluate}
                        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-linear-to-r from-purple-600 to-pink-600 rounded-xl">
                        🏁 Lab complete — see my progress
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ═══ RIGHT: Code / Findings / GitHub map ═══ */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-[40vh]">
            <div className="flex items-center gap-1 px-3 py-2 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
              {([
                { id: 'code', label: 'Code', icon: <Code2 size={12} /> },
                { id: 'findings', label: 'Checks', icon: <ListChecks size={12} /> },
                { id: 'github', label: 'GitHub map', icon: <Github size={12} /> },
              ] as { id: RightTab; label: string; icon: React.ReactNode }[]).map(t => (
                <button key={t.id} onClick={() => setRightTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all
                    ${rightTab === t.id ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/40'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
              {rightTab === 'code' && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-gray-400 truncate max-w-40">{activeFilePath}</span>
                  <button onClick={resetActiveFile} className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 hover:bg-gray-700 rounded-sm">Reset file</button>
                </div>
              )}
            </div>

            <div className="flex-1 flex overflow-hidden">
              {rightTab === 'code' && (
                <>
                  <div className="w-48 flex-shrink-0 border-r border-gray-700 overflow-y-auto py-2" style={{ background: '#161820' }}>
                    <p className="px-3 pb-1 text-[9px] font-bold text-gray-600 uppercase tracking-wide">village-market</p>
                    {files.map(f => (
                      <button key={f.path} onClick={() => setActiveFilePath(f.path)}
                        className={`w-full text-left px-3 py-1 text-[11px] truncate flex items-center gap-1.5 transition-colors
                          ${f.path === activeFilePath ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                        <FileCode size={11} className={stepFiles.has(f.path) ? 'text-amber-400' : 'text-gray-600'} />
                        <span className="truncate">{f.path}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Editor
                      height="100%" language={getLanguage(activeFilePath)} path={activeFilePath}
                      value={activeFile?.content || ''}
                      onChange={val => { if (val !== undefined) setFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: val } : f)); }}
                      theme="vs-dark"
                      options={{ fontSize: 13, minimap: { enabled: false }, padding: { top: 12 }, wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
                    />
                  </div>
                </>
              )}

              {rightTab === 'findings' && (
                <div className="flex-1 overflow-y-auto p-5">
                  {liveResults && step?.kind === 'fix' ? (
                    <>
                      <p className="text-xs font-bold text-gray-300 mb-3">What this fix must achieve</p>
                      <ul className="flex flex-col gap-2">
                        {liveResults.map(r => (
                          <li key={r.id} className="flex items-start gap-2 text-sm">
                            {r.pass ? <CheckCircle size={16} className="text-emerald-400 mt-0.5" /> : <Circle size={16} className="text-gray-500 mt-0.5" />}
                            <span className={r.pass ? 'text-emerald-300' : 'text-gray-300'}>{r.label}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-gray-500 mt-4">This list updates as you edit. Press “Check my fix” to get a hint for what is left.</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">Checks appear here on steps where you fix a file.</p>
                  )}
                </div>
              )}

              {rightTab === 'github' && <GitHubMap />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ─── GitHub security map (always-available reference) ────────────────────────

const GITHUB_MAP: { group: string; rows: { name: string; where: string; stops: string }[] }[] = [
  {
    group: 'Keep secrets out',
    rows: [
      { name: '.gitignore lists .env', where: 'A file in your repo', stops: 'Secret files being saved to Git in the first place.' },
      { name: 'Secret scanning', where: 'Settings → Code security', stops: 'Leaks that already happened go unnoticed.' },
      { name: 'Push protection', where: 'Settings → Code security', stops: 'A secret reaching GitHub at all — it blocks the push.' },
    ],
  },
  {
    group: 'Trust your code',
    rows: [
      { name: 'Dependabot alerts + updates', where: 'Settings → Code security, plus .github/dependabot.yml', stops: 'Running packages with known security holes.' },
      { name: 'Pinned actions + read-only permissions', where: '.github/workflows/*.yml', stops: 'A hijacked action or over-powered workflow changing your repo.' },
    ],
  },
  {
    group: 'Guard the gate',
    rows: [
      { name: 'Branch protection', where: 'Settings → Branches', stops: 'Pushing straight to main with no review or passing build.' },
      { name: 'CODEOWNERS', where: '.github/CODEOWNERS', stops: 'Sensitive files changing with no responsible reviewer.' },
      { name: 'Two-factor authentication', where: 'Profile → Settings → Password and authentication', stops: 'Account takeover from a stolen or guessed password.' },
      { name: 'Fine-grained tokens with expiry', where: 'Profile → Settings → Developer settings', stops: 'A stolen token that can do everything, forever.' },
      { name: 'SECURITY.md', where: 'A file in your repo', stops: 'Honest finders posting problems publicly because they had no private way to report.' },
    ],
  },
];

const PLAYBOOK = [
  'Rotate: revoke the leaked secret with its provider and make a new one.',
  'Replace the secret everywhere it is used, from an environment variable.',
  'Check the provider’s logs for use you do not recognise.',
  'Remove it from the repo and turn on push protection so it cannot happen again.',
  'Write down what happened and what you changed.',
];

const GitHubMap: React.FC = () => (
  <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5" style={{ background: '#f9f6ef', color: '#2a2a1a' }}>
    <div>
      <h3 className="text-base font-bold mb-1">GitHub security map</h3>
      <p className="text-xs" style={{ color: '#6b5c45' }}>A quick reference for every GitHub protection in this lab. Nothing here changes your account — it only tells you where to look.</p>
    </div>
    {GITHUB_MAP.map(g => (
      <div key={g.group}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#8a6d3b' }}>{g.group}</p>
        <div className="flex flex-col gap-2">
          {g.rows.map(r => (
            <div key={r.name} className="rounded-lg border p-3" style={{ background: '#fffdf8', borderColor: '#e8e0d0' }}>
              <p className="text-sm font-semibold">{r.name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#6b5c45' }}><strong>Where:</strong> {r.where}</p>
              <p className="text-xs" style={{ color: '#6b5c45' }}><strong>Stops:</strong> {r.stops}</p>
            </div>
          ))}
        </div>
      </div>
    ))}
    <div className="rounded-xl border p-4" style={{ background: '#fff4f2', borderColor: '#e8a090' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#a03020' }}>🚨 If a secret leaks</p>
      <ol className="text-sm list-decimal pl-5 flex flex-col gap-1">{PLAYBOOK.map(p => <li key={p}>{p}</li>)}</ol>
    </div>
  </div>
);

export default SecuritySafetyPage;
