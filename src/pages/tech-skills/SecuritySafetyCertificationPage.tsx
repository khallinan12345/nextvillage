// src/pages/tech-skills/SecuritySafetyCertificationPage.tsx
// Security & Safety Certification — one fixed practice repo for every learner, no hints, graded on the server.
//
// The learner fixes the "Riverside Clinic" repo and writes a short security review. /api/security-certification
// re-checks the submitted files (checks never reach the browser), has the AI coach score the written review, saves
// the result to the learner's dashboard row, and returns it. The certificate unlocks only from that server result.
//
// Practice first: the Security & Safety Lab (/tech-skills/security-safety) teaches every topic step by step.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useBranding } from '../../lib/useBranding';
import { generateCertificatePdf } from '../../lib/certificatePdf';
import Editor from '@monaco-editor/react';
import {
  ShieldCheck, Award, Trophy, XCircle, Loader2, Download, AlertCircle, FileCode,
  ChevronDown, ChevronRight, RefreshCw, Send,
} from 'lucide-react';
import { CERT_REPO, CERT_CRITERIA, type ProjectFile } from './securityCert/certRepo';

// ─── Types & constants ───────────────────────────────────────────────────────

interface Score { assessment_name: string; score: number | null; evidence: string | null; }
type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

const CERT_ACTIVITY = 'Security & Safety Certification';
const draftKey = (uid: string | null | undefined) => `sec_cert_draft_v1_${uid ?? 'anon'}`;
const MIN_REVIEW_WORDS = 40;

const getLanguage = (path: string) => {
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.sql')) return 'sql';
  if (path.endsWith('.yml')) return 'yaml';
  return 'plaintext';
};

const scoreLabel = (s: number | null) =>
  s === 3 ? { text: 'Advanced', color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30' }
  : s === 2 ? { text: 'Proficient', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' }
  : s === 1 ? { text: 'Emerging', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' }
  : s === 0 ? { text: 'No Evidence', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' }
  : { text: 'Not yet scored', color: 'text-muted', bg: 'bg-card', border: 'border-hair' };

const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  const r = 18; const circ = 2 * Math.PI * r; const dash = ((score ?? 0) / 3) * circ;
  const color = score === null ? '#A8A29E' : score >= 2 ? '#16a34a' : score === 1 ? '#d97706' : '#dc2626';
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" role="img" aria-label={score === null ? 'Not scored' : `${score} out of 3`}>
      <circle cx={22} cy={22} r={r} fill="none" stroke="#E7E5E0" strokeWidth={4} />
      <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4} />
      <text x={22} y={26} textAnchor="middle" fontSize={12} fontWeight="bold" fill={color}>{score !== null ? `${score}/3` : '—'}</text>
    </svg>
  );
};

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

// ─── Page ────────────────────────────────────────────────────────────────────

const SecuritySafetyCertificationPage: React.FC = () => {
  const { user } = useAuth();
  const branding = useBranding();

  const [view, setView] = useState<ViewMode>('overview');
  const [files, setFiles] = useState<ProjectFile[]>(CERT_REPO);
  const [reflection, setReflection] = useState('');
  const [activeFilePath, setActiveFilePath] = useState('README.md');
  const [scores, setScores] = useState<Score[]>([]);
  const [certified, setCertified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [certName, setCertName] = useState('');
  const [genCert, setGenCert] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const restored = useRef(false);

  // ── Load: saved draft, else the last submitted files; and the last server result ──
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      let draft: { files?: ProjectFile[]; reflection?: string } | null = null;
      try { const raw = localStorage.getItem(draftKey(user.id)); if (raw) draft = JSON.parse(raw); } catch { /* ignore */ }

      const { data } = await supabase.from('dashboard')
        .select('sec_cert_pages, sec_cert_evaluation')
        .eq('user_id', user.id).eq('activity', CERT_ACTIVITY)
        .order('updated_at', { ascending: false }).limit(1);
      if (cancelled) return;

      const row = data?.[0] as { sec_cert_pages?: ProjectFile[]; sec_cert_evaluation?: { scores?: Record<string, { score: number; evidence: string }>; passedAt?: string | null } } | undefined;
      const source = draft?.files?.length ? draft.files : row?.sec_cert_pages;
      if (source?.length) {
        // Keep any shipped file a saved copy predates, so the repo is never missing a file.
        const saved = new Map(source.map(f => [f.path, f.content]));
        setFiles(CERT_REPO.map(f => ({ path: f.path, content: saved.get(f.path) ?? f.content })));
      }
      if (draft?.reflection) setReflection(draft.reflection);

      const ev = row?.sec_cert_evaluation;
      if (ev?.scores) {
        setScores(CERT_CRITERIA.map(c => ({
          assessment_name: c.name, score: ev.scores?.[c.name]?.score ?? null, evidence: ev.scores?.[c.name]?.evidence ?? null,
        })));
        setCertified(!!ev.passedAt);
      }
      restored.current = true;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Draft is kept on this device while the learner works.
  useEffect(() => {
    if (!restored.current || !user?.id) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(user.id), JSON.stringify({ files, reflection })); } catch { /* ignore */ }
    }, 800);
    return () => clearTimeout(t);
  }, [files, reflection, user?.id]);

  const changedCount = useMemo(
    () => files.filter(f => f.content !== (CERT_REPO.find(s => s.path === f.path)?.content ?? '')).length,
    [files],
  );
  const words = wordCount(reflection);
  const anyScored = scores.some(s => s.score !== null);
  const allProficient = anyScored && scores.every(s => (s.score ?? 0) >= 2);
  const overallAvg = anyScored ? scores.reduce((n, s) => n + (s.score ?? 0), 0) / scores.length : null;
  const activeFile = files.find(f => f.path === activeFilePath) ?? files[0];

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true); setError(null); setNotice(null);
    try {
      const res = await fetch('/api/security-certification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, reflection }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Something went wrong (${res.status}). Please try again.`);
      setScores(body.scores as Score[]);
      setCertified(!!body.certified);
      if (body.saved === false) setNotice('Your result is shown below, but it could not be saved to your profile yet. Keep this page open, or submit again later.');
      setView('results');
      if (body.passed) {
        try { const c = await import('canvas-confetti').catch(() => null); c?.default?.({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); } catch { /* ignore */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally { setSubmitting(false); }
  }, [files, reflection, submitting]);

  const handleReset = () => {
    setFiles(CERT_REPO); setReflection(''); setActiveFilePath('README.md'); setConfirmReset(false);
    try { localStorage.removeItem(draftKey(user?.id)); } catch { /* ignore */ }
  };

  const generateCertificate = useCallback(async () => {
    if (!certName.trim()) return;
    setGenCert(true); setError(null);
    try {
      await generateCertificatePdf({
        recipientName: certName,
        title: 'Security & Safety Certification',
        description: [
          'For successfully completing the Security & Safety Certification,',
          'demonstrating the ability to find and fix common security mistakes in a web project:',
          'secrets, logins, untrusted input, database access rules, GitHub defences, and safe AI use.',
        ],
        scoreSuffix: '· Secure web development',
        assessmentScores: scores,
        branding, theme: 'indigo', idPrefix: 'SEC', filenameSuffix: 'SecuritySafety',
      });
    } catch { setError('The certificate PDF could not be created. Please try again.'); }
    finally { setGenCert(false); }
  }, [certName, scores, branding]);

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-paper">
        <Navbar />
        <div className="flex-1 flex items-center justify-center"><Loader2 size={36} className="animate-spin text-accent" /></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-paper text-body overflow-hidden">
      <Navbar />
      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-hair flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck size={18} className="text-accent flex-shrink-0" />
            <span className="text-sm font-bold text-ink whitespace-nowrap">Security &amp; Safety Certification</span>
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors
                    ${view === v ? 'bg-accent/10 text-accent border-accent/40' : 'text-muted border-hair hover:text-body hover:border-accent/30'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '🛠️ Repo' : v === 'results' ? '📊 Results' : '📋 Overview'}
                </button>
              ))}
            </div>
          </div>
          {view === 'build' && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setConfirmReset(true)}
                className="px-2.5 py-1.5 text-xs text-muted hover:text-ink hover:bg-hair rounded-lg transition-colors">Start over</button>
              <button onClick={handleSubmit} disabled={submitting || changedCount === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-lg shadow-sm disabled:opacity-50 transition-colors">
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {submitting ? 'Grading…' : 'Submit for grading'}
              </button>
            </div>
          )}
        </div>

        {confirmReset && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center gap-3 text-xs flex-shrink-0">
            <AlertCircle size={14} className="text-red-700" />
            <span className="text-red-800">Start over? Your edits and written review will be erased.</span>
            <button onClick={handleReset} className="px-2 py-1 bg-red-600 text-white rounded-sm font-bold">Yes, start over</button>
            <button onClick={() => setConfirmReset(false)} className="px-2 py-1 text-body">Cancel</button>
          </div>
        )}

        {error && (
          <div role="alert" className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-start gap-2 text-xs text-red-800 flex-shrink-0">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}

        {/* ═══ OVERVIEW ═══ */}
        {view === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            <div className="p-6 bg-surface border border-hair rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-accent/10 rounded-xl"><ShieldCheck size={24} className="text-accent" /></div>
                <div>
                  <h1 className="text-xl font-bold text-ink">Security &amp; Safety Certification</h1>
                  <p className="text-accent text-sm">Find it · Fix it · Explain it</p>
                </div>
              </div>
              <p className="text-body text-sm leading-relaxed">
                You get one practice repo, <strong>Riverside Clinic</strong>, with security mistakes in it. Fix what you find, write a short
                security review, and submit. There are <strong>no hints</strong> and the grading rules are not shown, so this tests what you
                can do on your own.
              </p>
            </div>

            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-3">📋 How it works</p>
              <ol className="list-decimal pl-5 text-sm text-body flex flex-col gap-1.5">
                <li>Open the <strong>Repo</strong> tab and read through every file. Nothing is labelled for you.</li>
                <li>Edit the files to fix every security problem you can find. Your work is saved on this device as you go.</li>
                <li>Write your security review: what you found, what you fixed first and why, and which GitHub protections you would switch on.</li>
                <li>Submit. Your repo is checked by the server and your review is scored by an AI coach. You see a score for each area, not the checklist.</li>
                <li>You need <strong>Proficient (2 of 3)</strong> in every area to earn the certificate. You can try again; submissions are limited to a few per hour.</li>
              </ol>
            </div>

            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-3">🎯 What you are scored on</p>
              <div className="flex flex-col gap-3">
                {CERT_CRITERIA.map(c => {
                  const sc = scores.find(s => s.assessment_name === c.name);
                  const sl = scoreLabel(sc?.score ?? null);
                  return (
                    <div key={c.name} className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5"><ScoreRing score={sc?.score ?? null} /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-ink">{c.name}</p>
                          {sc?.score != null && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sl.bg} ${sl.color} ${sl.border}`}>{sl.text}</span>}
                        </div>
                        <p className="text-xs text-muted leading-relaxed">{c.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl mb-5 text-sm text-body">
              <strong>Not sure yet?</strong> Practise first in the{' '}
              <Link to="/tech-skills/security-safety" className="text-accent underline font-semibold">Security &amp; Safety Lab</Link>, which teaches each topic step by step with hints.
            </div>

            {anyScored && overallAvg !== null && (
              <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl mb-5 flex items-center gap-4">
                <Trophy size={28} className="text-yellow-700 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted uppercase font-bold">Your latest score</p>
                  <p className="text-2xl font-black text-ink">{overallAvg.toFixed(1)}<span className="text-base font-normal text-muted">/3.0</span></p>
                </div>
                {certified && <span className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-accent/10 text-accent border border-accent/30">🏆 Certified</span>}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl shadow-lg">
                {changedCount > 0 ? <><RefreshCw size={16} /> Continue your repo</> : <><ShieldCheck size={16} /> Open the repo</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-accent border border-accent/30 bg-accent/10 rounded-xl">View results →</button>
              )}
            </div>
          </div>
        )}

        {/* ═══ BUILD ═══ */}
        {view === 'build' && (
          <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
            <div className="flex-1 flex overflow-hidden min-h-[45vh]">
              <div className="w-48 flex-shrink-0 border-r border-hair overflow-y-auto py-2 bg-surface">
                <p className="px-3 pb-1 text-[9px] font-bold text-muted uppercase tracking-wide">riverside-clinic</p>
                {files.map(f => {
                  const edited = f.content !== (CERT_REPO.find(s => s.path === f.path)?.content ?? '');
                  return (
                    <button key={f.path} onClick={() => setActiveFilePath(f.path)}
                      className={`w-full text-left px-3 py-1 text-[11px] flex items-center gap-1.5 transition-colors
                        ${f.path === activeFilePath ? 'bg-hair text-ink' : 'text-body hover:bg-card'}`}>
                      <FileCode size={11} className={edited ? 'text-accent' : 'text-muted'} />
                      <span className="truncate flex-1">{f.path}</span>
                      {edited && <span className="text-[9px] text-accent font-bold">edited</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 min-w-0">
                <Editor height="100%" language={getLanguage(activeFilePath)} path={activeFilePath}
                  value={activeFile?.content || ''} theme="vs-dark"
                  onChange={val => { if (val !== undefined) setFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: val } : f)); }}
                  options={{ fontSize: 13, minimap: { enabled: false }, padding: { top: 12 }, wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} />
              </div>
            </div>

            <div className="lg:w-96 w-full flex-shrink-0 border-t lg:border-t-0 lg:border-l border-hair bg-card flex flex-col p-4 gap-2 overflow-y-auto">
              <label htmlFor="sec-review" className="text-xs font-bold text-muted uppercase">Your security review</label>
              <p className="text-xs text-muted leading-relaxed">
                In your own words: which risks did you find, what did you fix first and why, and which GitHub protections would you switch on?
              </p>
              <textarea id="sec-review" value={reflection} onChange={e => setReflection(e.target.value)} style={{ minHeight: '200px' }}
                placeholder="Write your review here…"
                className="w-full bg-paper border border-hair rounded-xl px-3 py-2.5 text-sm text-ink placeholder-gray-500 resize-y outline-hidden focus:border-accent leading-relaxed" />
              <p className={`text-[11px] ${words >= MIN_REVIEW_WORDS ? 'text-accent' : 'text-muted'}`}>
                {words} words{words < MIN_REVIEW_WORDS ? ` · aim for at least ${MIN_REVIEW_WORDS}` : ''}
              </p>
              <button onClick={handleSubmit} disabled={submitting || changedCount === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Award size={14} />}
                {submitting ? 'Grading…' : 'Submit for grading'}
              </button>
              {changedCount === 0 && <p className="text-[11px] text-muted">Edit at least one file before submitting.</p>}
            </div>
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {view === 'results' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {!anyScored ? (
              <div className="text-center py-16 flex flex-col gap-4 items-center">
                <p className="text-muted text-sm">You have not submitted yet.</p>
                <button onClick={() => setView('build')} className="px-6 py-2.5 bg-accent text-white font-bold rounded-xl">Open the repo</button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {notice && <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800">{notice}</div>}
                <div className="flex items-center gap-4 p-5 bg-surface border border-hair rounded-2xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted uppercase font-bold">Overall</p>
                    <p className="text-4xl font-black text-ink">{overallAvg?.toFixed(1)}<span className="text-lg font-normal text-muted">/3.0</span></p>
                    <p className={`text-sm font-bold mt-0.5 ${allProficient ? 'text-accent' : 'text-yellow-700'}`}>
                      {allProficient ? '🏆 Proficient in every area' : `${scores.filter(s => (s.score ?? 0) >= 2).length}/${scores.length} areas at Proficient or above — you need all of them`}
                    </p>
                  </div>
                  {certified && (
                    <button onClick={() => setView('certificate')} className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white font-bold rounded-xl text-sm">
                      <Award size={16} /> Get certificate
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {scores.map(sc => {
                    const sl = scoreLabel(sc.score);
                    const open = expanded === sc.assessment_name;
                    return (
                      <div key={sc.assessment_name} className={`rounded-xl border overflow-hidden ${sl.border} ${sl.bg}`}>
                        <button onClick={() => setExpanded(open ? null : sc.assessment_name)}
                          className="w-full flex items-center gap-4 px-4 py-3 text-left">
                          <ScoreRing score={sc.score} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-ink">{sc.assessment_name}</p>
                            <span className={`text-xs font-bold ${sl.color}`}>{sl.text}</span>
                          </div>
                          {open ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
                        </button>
                        {open && sc.evidence && (
                          <div className="px-4 pb-4 pt-3 border-t border-hair">
                            <p className="text-[10px] font-bold text-muted uppercase mb-1">Result</p>
                            <p className="text-xs text-body leading-relaxed">{sc.evidence}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!allProficient && (
                  <p className="text-xs text-muted">
                    The checklist stays hidden on purpose. Re-read the repo with the area names above in mind, fix more, and submit again.
                    Stuck? The <Link to="/tech-skills/security-safety" className="text-accent underline">Security &amp; Safety Lab</Link> teaches each area.
                  </p>
                )}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setView('build')} className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-accent border border-accent/30 bg-accent/10 rounded-xl">
                    <ShieldCheck size={15} /> Back to the repo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ CERTIFICATE ═══ */}
        {view === 'certificate' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
            {!certified ? (
              <div className="text-center py-16 flex flex-col gap-4 items-center">
                <XCircle size={48} className="text-yellow-700" />
                <h2 className="text-lg font-bold text-ink">Certificate not yet available</h2>
                <p className="text-muted text-sm max-w-sm">You need Proficient (2 of 3) in every area. Keep improving the repo and submit again.</p>
                <button onClick={() => setView('build')} className="px-6 py-2.5 bg-accent text-white font-bold rounded-xl">Back to the repo</button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="p-6 bg-surface border border-hair rounded-2xl text-center">
                  <div className="flex justify-center mb-3"><Trophy size={44} className="text-yellow-700" /></div>
                  <p className="text-xs font-bold text-accent uppercase tracking-widest">Certificate of Achievement</p>
                  <p className="text-lg font-bold text-ink mt-1">Security &amp; Safety Certification</p>
                  <div className="my-4 h-px bg-hair" />
                  <p className="text-muted text-xs">Awarded to</p>
                  <p className="text-2xl font-bold text-ink mt-1">{certName || '[ Your Name ]'}</p>
                  <p className="text-muted text-xs mt-1">{branding.institutionName}</p>
                  <div className="my-4 h-px bg-hair" />
                  <div className="grid grid-cols-2 gap-2 text-left">
                    {scores.map(sc => {
                      const sl = scoreLabel(sc.score);
                      return (
                        <div key={sc.assessment_name} className={`px-2.5 py-1.5 rounded-lg border text-xs ${sl.bg} ${sl.border}`}>
                          <p className={`font-bold ${sl.color}`}>{sc.assessment_name}</p>
                          <p className="text-muted">{sc.score}/3 — {sl.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label htmlFor="sec-cert-name" className="text-xs font-bold text-muted uppercase block mb-1.5">Full name for the certificate:</label>
                  <input id="sec-cert-name" type="text" value={certName} onChange={e => setCertName(e.target.value)} placeholder="e.g. Amara Okoye"
                    className="w-full bg-card border border-hair rounded-xl px-4 py-3 text-ink placeholder-gray-500 text-sm outline-hidden focus:border-accent" />
                </div>
                <button onClick={generateCertificate} disabled={!certName.trim() || genCert}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl disabled:opacity-50">
                  {genCert ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {genCert ? 'Generating PDF…' : 'Download certificate (PDF)'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default SecuritySafetyCertificationPage;
