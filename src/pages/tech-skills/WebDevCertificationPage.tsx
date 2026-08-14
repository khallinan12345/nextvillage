// src/pages/tech-skills/WebDevCertificationPage.tsx
//
// Web Development Certification — React / Vite
// Framework: mirrors AIProficiencyPage (loads rubrics from certification_assessments,
//            evaluates project against each criterion, saves to dashboard, generates PDF cert)
// Build environment: same Monaco editor + file tree + StackBlitz as WebDevelopmentPage
// No guided task system — student builds freely using vibe coding only.
//
// API routes needed:
//   /api/generate-site-code   (reuses the WebDevelopmentPage code-gen route)
//
// Dashboard columns used (all pre-existing in schema):
//   web_dev_session_id, web_dev_session_name, web_dev_pages, web_dev_evaluation
// Activity stored as: 'Web Development Certification'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { chatJSON } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import Editor from '@monaco-editor/react';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import { useBranding, addBrandingToPDF } from '../../lib/useBranding';
import {
  Code, Award, GraduationCap, CheckCircle, XCircle,
  Loader2, Download, ExternalLink, Star, Trophy,
  ChevronDown, ChevronUp, FileCode, Volume2, VolumeX,
  Wand2, Play, AlertCircle, Copy, Check, ClipboardList,
  ArrowRight, RefreshCw, X, Sparkles,
} from 'lucide-react';

// ─── Markdown components (dark theme, indigo/violet accents) ─────────────────

const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-sm font-bold text-ink mb-2 mt-3">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-xs font-bold text-ink mb-1.5 mt-3">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-xs font-semibold text-body mb-1 mt-2">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="text-xs text-body mb-2 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-muted">{children}</em>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside space-y-1 mb-2 text-body ml-2 text-xs">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside space-y-1 mb-2 text-body ml-2 text-xs">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-relaxed">{children}</li>
  ),
  hr: () => <hr className="my-3 border-hair" />,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-accent pl-3 italic text-muted my-2 text-xs">{children}</blockquote>
  ),
  a: ({ href, children }: any) => (
    <a href={href || '#'} target="_blank" rel="noopener noreferrer"
      className="text-accent hover:underline font-medium">
      {children}
    </a>
  ),
  code: ({ children }: any) => (
    <code className="bg-paper text-accent px-1 py-0.5 rounded text-[10px] font-mono border border-hair">{children}</code>
  ),
  pre: ({ children }: any) => (
    <pre className="bg-surface text-ink p-2 rounded text-[10px] font-mono overflow-x-auto mb-2 border border-hair">{children}</pre>
  ),
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assessment {
  certification_id: string;
  assessment_name: string;
  description: string;
  certification_prompt: string;
  certification_level0_metric: string;
  certification_level1_metric: string;
  certification_level2_metric: string;
  certification_level3_metric: string;
  assessment_order: number;
  phase?: number;
}

interface AssessmentScore {
  assessment_name: string;
  score: number | null;
  evidence: string | null;
}

interface ProjectFile { path: string; content: string; }

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'Web Development';
const CERT_ACTIVITY = 'Web Development Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);

const STARTER_FILES: ProjectFile[] = [
  {
    path: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Website</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
  },
  {
    path: 'style.css',
    content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; }
.app { max-width: 1200px; margin: 0 auto; padding: 2rem; }
h1 { font-size: 2rem; font-weight: bold; margin-bottom: 1rem; }
`,
  },
  {
    path: 'src/main.jsx',
    content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import '../style.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
  },
  {
    path: 'src/App.jsx',
    content: `import React from 'react'

function App() {
  return (
    <div className="app">
      <h1>My Website</h1>
      <p>Describe your website in the prompt box to start building!</p>
    </div>
  )
}

export default App`,
  },
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'my-website', private: true, version: '0.0.0', type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'react-router-dom': '^6.21.0' },
      devDependencies: { '@vitejs/plugin-react': '^4.2.1', vite: '^5.0.8' },
    }, null, 2),
  },
  {
    path: 'vite.config.js',
    content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getLanguage = (path: string) => {
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.json')) return 'json';
  return 'plaintext';
};

const mergeFiles = (existing: ProjectFile[], updates: ProjectFile[]): ProjectFile[] => {
  const result = [...existing];
  for (const u of updates) {
    const idx = result.findIndex(f => f.path === u.path);
    if (idx >= 0) result[idx] = u; else result.push(u);
  }
  return result;
};

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-gray-500',   bg: 'bg-gray-100',   border: 'border-gray-300'   };
  if (s === 3)    return { text: 'Advanced',     color: 'text-green-800',  bg: 'bg-green-100',  border: 'border-green-300'  };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-800',   bg: 'bg-blue-100',   border: 'border-blue-300'   };
  if (s === 1)    return { text: 'Emerging',     color: 'text-yellow-800', bg: 'bg-yellow-100', border: 'border-yellow-300' };
  return             { text: 'No Evidence',  color: 'text-red-800',    bg: 'bg-red-100',    border: 'border-red-300'    };
};

// ─── File Tree ────────────────────────────────────────────────────────────────

const FileTreePanel: React.FC<{ files: ProjectFile[]; activeFile: string; onSelect: (p: string) => void }> = ({ files, activeFile, onSelect }) => {
  const [open, setOpen] = useState<Set<string>>(new Set(['src']));
  const toggle = (f: string) => setOpen(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });
  type TNode = { name: string; path: string; isFolder: boolean; children: TNode[] };
  const buildTree = (files: ProjectFile[]): TNode[] => {
    const root: TNode[] = [];
    for (const file of files) {
      const parts = file.path.split('/'); let cur = root;
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i]; const isLast = i === parts.length - 1;
        let node = cur.find(n => n.name === name);
        if (!node) { node = { name, path: parts.slice(0, i + 1).join('/'), isFolder: !isLast, children: [] }; cur.push(node); }
        if (!isLast) cur = node.children;
      }
    }
    const sort = (nodes: TNode[]) => { nodes.sort((a, b) => (a.isFolder && !b.isFolder ? -1 : !a.isFolder && b.isFolder ? 1 : a.name.localeCompare(b.name))); nodes.forEach(n => sort(n.children)); };
    sort(root); return root;
  };
  const renderTree = (nodes: TNode[], depth = 0): React.ReactNode =>
    nodes.map(node => (
      <React.Fragment key={node.path}>
        {node.isFolder ? (
          <button onClick={() => toggle(node.path)} className="w-full flex items-center gap-1 py-0.5 text-xs text-muted hover:text-ink hover:bg-paper rounded" style={{ paddingLeft: `${8 + depth * 10}px` }}>
            {open.has(node.path) ? <ChevronDown size={10} /> : <ChevronDown size={10} style={{ transform: 'rotate(-90deg)' }} />}
            <span className="text-yellow-600 text-[10px]">📁</span>
            <span className="font-medium text-[11px]">{node.name}</span>
          </button>
        ) : (
          <button onClick={() => onSelect(node.path)} className={`w-full flex items-center gap-1.5 py-0.5 text-[11px] rounded transition-colors ${activeFile === node.path ? 'bg-accent/10 text-accent font-semibold' : 'text-muted hover:text-ink hover:bg-paper'}`} style={{ paddingLeft: `${8 + depth * 10}px` }}>
            <FileCode size={10} className="flex-shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
        )}
        {node.isFolder && open.has(node.path) && renderTree(node.children, depth + 1)}
      </React.Fragment>
    ));
  return <div className="space-y-0">{renderTree(buildTree(files))}</div>;
};

// ─── Score ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  const pct = score !== null ? (score / 3) * 100 : 0;
  const r = 18; const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = score === null ? '#A8A29E' : score >= 2 ? '#16a34a' : score === 1 ? '#d97706' : '#dc2626';
  return (
    <svg width={44} height={44} viewBox="0 0 44 44">
      <circle cx={22} cy={22} r={r} fill="none" stroke="#E7E5E0" strokeWidth={4} />
      <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeLinecap="round" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
        style={{ transition: 'all 0.6s ease' }} />
      <text x={22} y={26} textAnchor="middle" fontSize={12} fontWeight="bold" fill={color}>
        {score !== null ? `${score}/3` : '—'}
      </text>
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const WebDevCertificationPage: React.FC = () => {
  const { user } = useAuth();

  // ── View ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>('overview');

  // ── Assessments ───────────────────────────────────────────────────────
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [loadingData,      setLoadingData]      = useState(true);
  const [dataError,        setDataError]        = useState<string | null>(null);

  // ── Personality ───────────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState(1);

  // ── Voice + Branding ────────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');

  // Pidgin only for learners whose profile country is Nigeria.
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('country').eq('id', user.id).single()
      .then(({ data }) => setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english'));
  }, [user?.id]);
  const branding = useBranding();

  useEffect(() => {
    if (!branding.isReady) return;
    setVoiceMode(branding.variant === 'vai' ? 'pidgin' : 'english');
  }, [branding.isReady, branding.variant]);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  // ── Project ───────────────────────────────────────────────────────────
  const [projectFiles,   setProjectFiles]   = useState<ProjectFile[]>(STARTER_FILES);
  const [activeFilePath, setActiveFilePath] = useState('src/App.jsx');
  const [sessionId,      setSessionId]      = useState<string | null>(null);
  const [sessionName,    setSessionName]    = useState('My Web Project');
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Vibe coding ───────────────────────────────────────────────────────
  const [prompt,        setPrompt]        = useState('');
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [genError,      setGenError]      = useState<string | null>(null);
  const [explanation,   setExplanation]   = useState<string | null>(null);
  const [copied,        setCopied]        = useState(false);

  // ── Evaluation ────────────────────────────────────────────────────────
  const [isEvaluating,  setIsEvaluating]  = useState(false);
  const [evalError,     setEvalError]     = useState<string | null>(null);
  const [evalProgress,  setEvalProgress]  = useState('');

  // ── Certificate ───────────────────────────────────────────────────────
  const [certName,      setCertName]      = useState('');
  const [isGenCert,     setIsGenCert]     = useState(false);
  const [expandedCrit,  setExpandedCrit]  = useState<string | null>(null);
  const [downloading,   setDownloading]   = useState(false);

  // ── StackBlitz ────────────────────────────────────────────────────────
  const [showSBModal,   setShowSBModal]   = useState(false);

  const activeFile = projectFiles.find(f => f.path === activeFilePath) ?? projectFiles[0];

  // ── Voice helpers ─────────────────────────────────────────────────────
  const speak = (text: string) => hookSpeak(text.slice(0, 400));
  const stopSpeaking = () => cancelSpeech();

  // ── Load assessments + existing scores ───────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoadingData(true); setDataError(null);
    try {
      const { data: pb } = await supabase.from('user_personality_baseline')
        .select('communication_level').eq('user_id', user.id).maybeSingle();
      if (pb?.communication_level != null) setCommunicationLevel(pb.communication_level);

      const { data: aData, error: aErr } = await supabase
        .from('certification_assessments').select('*')
        .eq('certification_name', CERT_NAME).order('assessment_order');
      if (aErr) throw aErr;
      setAssessments(aData || []);

      const { data: dash } = await supabase.from('dashboard').select('*')
        .eq('user_id', user.id).eq('activity', CERT_ACTIVITY).maybeSingle();

      const evalData = dash?.web_dev_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score: evalData?.scores?.[a.assessment_name]?.score ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      if (dash?.web_dev_pages?.length) {
        const files = (dash.web_dev_pages as any[]).map(p => ({ path: p.path || p.name, content: p.content || '' }));
        if (files.length) { setProjectFiles(files); }
      }
      if (dash?.web_dev_session_id) { setSessionId(dash.web_dev_session_id); sessionIdRef.current = dash.web_dev_session_id; }
      if (dash?.web_dev_session_name) setSessionName(dash.web_dev_session_name);

    } catch (err: any) { setDataError(err.message || 'Failed to load certification data'); }
    finally { setLoadingData(false); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Ensure dashboard record ───────────────────────────────────────────
  const ensureRecord = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (user?.id) {
      await supabase.from('dashboard').insert({
        user_id: user.id, activity: CERT_ACTIVITY,
        category_activity: 'Certification', progress: 'started',
        web_dev_session_id: sid, web_dev_session_name: sessionName,
        web_dev_pages: STARTER_FILES.map(f => ({ path: f.path, content: f.content })),
        web_dev_evaluation: {},
      });
    }
    return sid;
  }, [user?.id, sessionName]);

  // ── Persist project ───────────────────────────────────────────────────
  const persistProject = useCallback(async (files: ProjectFile[]) => {
    const sid = sessionIdRef.current; if (!user?.id || !sid) return;
    await supabase.from('dashboard').update({
      web_dev_pages: files.map(f => ({ path: f.path, content: f.content })),
      web_dev_session_name: sessionName, updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('web_dev_session_id', sid);
  }, [user?.id, sessionName]);

  // ── Generate code ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setGenError(null); setExplanation(null);
    await ensureRecord();
    const hasCode = projectFiles.some(f => f.path.startsWith('src/') && f.content.length > 100 && f.path !== 'src/index.css');
    try {
      const res = await fetch('/api/generate-site-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          action: hasCode ? 'iterate' : 'generate',
          prompt: prompt.trim(),
          projectFiles: projectFiles.map(f => ({ path: f.path, content: f.content })),
          sessionContext: { siteName: sessionName },
          communicationLevel,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const result = await res.json();
      const updatedFiles = result.files ? mergeFiles(projectFiles, result.files) : projectFiles;
      setProjectFiles(updatedFiles);
      if (result.files?.length === 1) setActiveFilePath(result.files[0].path);
      else if (result.files?.length > 1) {
        const main = result.files.find((f: any) => f.path === 'src/App.jsx' || f.path.includes('App'));
        if (main) setActiveFilePath(main.path);
      }
      setExplanation(result.explanation || null);
      setPrompt('');
      await persistProject(updatedFiles);
    } catch (err: any) { setGenError(err.message || 'Something went wrong'); }
    finally { setIsGenerating(false); }
  }, [prompt, isGenerating, projectFiles, sessionName, communicationLevel, ensureRecord, persistProject]);

  // ── Evaluate against rubric ───────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (!user?.id || isEvaluating) return;
    setIsEvaluating(true); setEvalError(null);
    await ensureRecord();

    const codeBundle = projectFiles
      .filter(f => f.content.trim().length > 10)
      .map(f => `// === ${f.path} ===\n${f.content}`)
      .join('\n\n');

    const scores: Record<string, { score: number; evidence: string }> = {};
    const newScores: AssessmentScore[] = [];

    try {
      for (const assessment of assessments) {
        setEvalProgress(`Evaluating: ${assessment.assessment_name}…`);

        const evalPrompt = `You are evaluating a student's React/Vite website for the "${assessment.assessment_name}" criterion.

CRITERION: ${assessment.assessment_name}
DESCRIPTION: ${assessment.description}
ASSESSMENT QUESTION: ${assessment.certification_prompt}

RUBRIC:
- Level 0 (No Evidence): ${assessment.certification_level0_metric}
- Level 1 (Emerging): ${assessment.certification_level1_metric}
- Level 2 (Proficient): ${assessment.certification_level2_metric}
- Level 3 (Advanced): ${assessment.certification_level3_metric}

STUDENT'S PROJECT CODE:
${codeBundle.slice(0, 6000)}

Evaluate the code against this specific criterion and rubric. Score holistically — consider intent, structure, and execution.

Respond ONLY in this JSON format:
{
  "score": <0, 1, 2, or 3>,
  "evidence": "<2-4 sentences explaining the score with specific references to the code>"
}`;

        const result = await chatJSON({
          messages: [{ role: 'user', content: evalPrompt }],
          system: 'You are an expert web development educator evaluating student code. Be fair, specific, and constructive.',
          max_tokens: 400, temperature: 0.3,
        });

        const score = result.score ?? 0;
        const evidence = result.evidence ?? 'Unable to evaluate.';
        scores[assessment.assessment_name] = { score, evidence };
        newScores.push({ assessment_name: assessment.assessment_name, score, evidence });
      }

      setEvalProgress('');
      setAssessmentScores(newScores);

      const overallAvg = newScores.reduce((s, a) => s + (a.score ?? 0), 0) / newScores.length;
      const allProficient = newScores.every(s => (s.score ?? 0) >= 2);

      await supabase.from('dashboard').update({
        web_dev_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg },
        progress: allProficient ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('web_dev_session_id', sessionIdRef.current!);

      if (newScores.some(s => (s.score ?? 0) >= 2)) {
        try {
          const confetti = await import('canvas-confetti').catch(() => null);
          confetti?.default?.({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        } catch {}
      }

      setView('results');
    } catch (err: any) {
      setEvalError(err.message || 'Evaluation failed'); setEvalProgress('');
    } finally { setIsEvaluating(false); }
  }, [user?.id, isEvaluating, projectFiles, assessments, ensureRecord]);

  // ── Download ZIP ──────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const { default: JSZip } = await import('jszip' as any);
      const zip = new JSZip();
      for (const f of projectFiles) zip.file(f.path, f.content);
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${sessionName.replace(/\s+/g, '-').toLowerCase()}.zip`; a.click();
    } catch {} finally { setDownloading(false); }
  }, [projectFiles, sessionName]);

  // ── StackBlitz ────────────────────────────────────────────────────────
  const handleOpenStackBlitz = useCallback(() => {
    const form = document.createElement('form');
    form.method = 'POST'; form.action = 'https://stackblitz.com/run'; form.target = '_blank';
    const add = (name: string, value: string) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = name; i.value = value; form.appendChild(i); };
    add('project[title]', sessionName); add('project[template]', 'node');
    for (const f of projectFiles) add(`project[files][${f.path}]`, f.content);
    document.body.appendChild(form); form.submit(); document.body.removeChild(form);
  }, [projectFiles, sessionName]);

  // ── Certificate generation ────────────────────────────────────────────
  const generateCertificate = useCallback(async () => {
    if (!certName.trim()) return;
    setIsGenCert(true);
    try {
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) { alert('PDF generation not available.'); return; }
      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      const minScore = Math.min(...assessmentScores.map(s => s.score ?? 0));
      const certLevel = minScore === 3 ? 'Advanced' : minScore >= 2 ? 'Proficient' : 'Emerging';
      const overallAvg = assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length;

      doc.setLineWidth(3); doc.setDrawColor(99, 102, 241); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(129, 140, 248); doc.rect(15, 15, W - 30, H - 30);

      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(99, 102, 241);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });

      doc.setFontSize(20); doc.setTextColor(79, 70, 229);
      doc.text(`Web Development Certification — ${certLevel}`, W / 2, 43, { align: 'center' });

      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 14, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the React / Vite Web Development Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to design, build, and deploy a responsive web application using AI-assisted vibe coding.', W / 2, 95, { align: 'center' });

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(99, 102, 241);
      doc.text(`Overall Score: ${overallAvg.toFixed(1)}/3.0 — ${certLevel}`, W / 2, 106, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
      doc.text('Assessment Competencies:', 20, 116);

      const cols = assessmentScores.length <= 4 ? 2 : 3;
      const colW = (W - 40) / cols;
      let yPos = 122; let col = 0;

      assessmentScores.forEach((sc, i) => {
        const xPos = 20 + col * colW;
        const levelText = sc.score === 3 ? 'Advanced' : sc.score === 2 ? 'Proficient' : sc.score === 1 ? 'Emerging' : 'No Evidence';

        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
        doc.text(`${sc.assessment_name}: ${sc.score ?? 0}/3 — ${levelText}`, xPos, yPos);

        if (sc.evidence) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
          const lines = doc.splitTextToSize(sc.evidence, colW - 5);
          lines.slice(0, 3).forEach((line: string, li: number) => { doc.text(line, xPos, yPos + 4 + li * 3.5); });
        }

        col++;
        if (col >= cols) { col = 0; yPos += 22; }
      });

      const footerY = H - 22;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130);
      doc.text(`Awarded: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 20, footerY);
      doc.text(`${branding.institutionName} Programme`, W / 2, footerY, { align: 'center' });
      doc.text(`Certification ID: WD-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-WebDev-Certificate.pdf`);

    } catch (err) { console.error('Certificate error:', err); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, branding]);

  // ── Computed ──────────────────────────────────────────────────────────
  const allProficient  = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored      = assessmentScores.some(s => s.score !== null);
  const overallAvg     = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;
  const lvl            = communicationLevel;

  const renderVoiceBar = (textToRead: string) => (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-surface border border-hair rounded-xl mb-4">
      <span className="text-xs font-semibold text-muted flex items-center gap-1"><Volume2 size={13} className="text-accent" /> Voice:</span>
      <div className="flex rounded-full overflow-hidden border border-hair">
        {(['english', 'pidgin'] as const).map(m => (
          <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all border-r border-hair last:border-0 ${voiceMode === m ? 'bg-accent text-white' : 'bg-card text-muted hover:text-ink'}`}>
            {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
          </button>
        ))}
      </div>
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${isSpeaking ? 'bg-red-50 text-red-700 border-red-300' : 'bg-card text-accent border-hair hover:border-accent/40'}`}>
        {isSpeaking ? <><VolumeX size={12} /> Stop</> : <><Volume2 size={12} /> Read aloud</>}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex flex-col h-screen bg-paper">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 size={32} className="animate-spin text-accent mx-auto" />
            <p className="text-muted text-sm">Loading certification…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-paper text-body overflow-hidden">
      <Navbar />

      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      {/* ── StackBlitz modal ──────────────────────────────────────────── */}
      {showSBModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <div className="bg-card border border-hair rounded-2xl w-[460px] shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-hair flex justify-between items-center">
              <h2 className="text-base font-bold text-ink flex items-center gap-2"><ExternalLink size={16} className="text-accent" /> Preview in StackBlitz</h2>
              <button onClick={() => setShowSBModal(false)} className="p-1 text-muted hover:text-ink"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-body">Your project will open in StackBlitz as a live preview. All {projectFiles.length} files will be transferred as a one-time snapshot.</p>
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                ⚠️ This is for preview only. Your progress and evaluation live here — keep this tab open.
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => { handleOpenStackBlitz(); setShowSBModal(false); }}
                className="flex-1 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors">
                Open in StackBlitz →
              </button>
              <button onClick={() => setShowSBModal(false)} className="px-4 py-2.5 text-sm text-muted hover:text-ink border border-hair rounded-xl">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>

        {/* ── Global toolbar ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-hair flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Code size={18} className="text-accent" />
              <span className="text-sm font-bold text-ink">Web Dev Certification</span>
            </div>
            {view !== 'overview' && (
              <>
                <div className="w-px h-5 bg-hair flex-shrink-0" />
                <input className="text-sm text-body bg-transparent border-b border-transparent hover:border-hair focus:border-accent outline-none px-1 py-0.5 w-44"
                  value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Project name…" />
              </>
            )}
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors capitalize
                    ${view === v ? 'bg-accent/10 text-accent border-accent/40' : 'text-muted border-hair hover:text-ink hover:border-accent/30'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '🛠️ Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex rounded-full overflow-hidden border border-hair">
              {(['english', 'pidgin'] as const).map(m => (
                <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
                  className={`flex items-center gap-1 px-2 py-1.5 text-xs font-bold transition-all border-r border-hair last:border-0 ${voiceMode === m ? 'bg-accent text-white' : 'bg-card text-muted hover:text-ink'}`}>
                  {m === 'english' ? '🇬🇧' : '🇳🇬'}
                </button>
              ))}
            </div>
            {view === 'build' && (
              <>
                <button onClick={() => setShowSBModal(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-accent border border-hair bg-card hover:border-accent/40 rounded-full transition-colors">
                  <ExternalLink size={12} /> Preview
                </button>
                <button onClick={handleDownload} disabled={downloading} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-body hover:text-ink hover:bg-surface rounded-full transition-colors">
                  {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} .zip
                </button>
                <button onClick={handleEvaluate} disabled={isEvaluating || projectFiles.every(f => f.content.length < 50)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-full transition-colors disabled:opacity-50">
                  {isEvaluating ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />}
                  {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit for Evaluation'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            OVERVIEW VIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {dataError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-xl flex gap-2 text-sm text-red-800">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{dataError}
              </div>
            )}

            {renderVoiceBar(lvl <= 1
              ? 'Welcome to the Web Development Certification. You will build a website using vibe coding, then get evaluated.'
              : 'Welcome to the Web Development Certification. Build a React/Vite website using vibe coding, then submit it for evaluation against a set of professional rubric criteria.')}

            {/* Hero */}
            <div className="p-6 bg-surface border border-hair rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-accent/10 rounded-xl"><Code size={24} className="text-accent" /></div>
                <div>
                  <h1 className="text-xl font-bold text-ink">Web Development Certification</h1>
                  <p className="text-muted text-sm">React / Vite · Vibe Coding · No AI Assistance</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="React / Vite · Vibe Coding · No AI Assistance"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-body text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you build a real website using vibe coding — describing what you want in plain English and letting AI write the code. You will be judged on how well your website works, how it looks, and how well you controlled the AI to build it.'
                  : 'Demonstrate your React/Vite web development skills by building a complete, functional website using vibe coding (AI-assisted code generation). Your project is then evaluated against professional rubric criteria covering functionality, design, code quality, and independent problem-solving.'}
              </p>
            </div>

            {/* Rules */}
            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-3">📋 Certification Rules</p>
              <div className="space-y-2">
                {[
                  { icon: '✅', text: lvl <= 1 ? 'You CAN use vibe coding — describe what you want and let AI build it.' : 'Vibe coding is permitted — prompt AI to generate, modify, and extend code.' },
                  { icon: '✅', text: lvl <= 1 ? 'You CAN test and fix your website in the preview.' : 'You may iterate freely: preview, identify issues, and prompt improvements.' },
                  { icon: '✅', text: lvl <= 1 ? 'You CAN save and come back to your work.' : 'Your project auto-saves. You may return and continue at any time.' },
                  { icon: '❌', text: lvl <= 1 ? 'You CANNOT copy-paste code from outside this page.' : 'External code sources (GitHub, tutorials) are not permitted. All code must be generated through the vibe coding interface here.' },
                  { icon: '❌', text: lvl <= 1 ? 'You cannot use the AI coach from the Learning section.' : 'AI coaching tools from the Learning section are not available during this certification.' },
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">{rule.icon}</span>
                    <span className="text-body">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Assessment criteria */}
            <div className="p-4 bg-card border border-hair rounded-xl mb-6">
              <p className="text-xs font-bold text-muted uppercase mb-3">🎯 What You Will Be Evaluated On</p>
              {assessments.length === 0 ? (
                <p className="text-sm text-muted italic">Loading criteria…</p>
              ) : (
                <div className="space-y-2">
                  {assessments.map(a => {
                    const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                    const sl = scoreLabel(sc?.score ?? null);
                    return (
                      <div key={a.certification_id} className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5"><ScoreRing score={sc?.score ?? null} /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-ink">{a.assessment_name}</p>
                            {sc?.score !== null && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sl.bg} ${sl.color} ${sl.border}`}>{sl.text}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted leading-relaxed">{a.description || a.certification_prompt.slice(0, 120) + '…'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Score summary if any */}
            {anyScored && overallAvg !== null && (
              <div className="p-4 bg-surface border border-hair rounded-xl mb-5 flex items-center gap-4">
                <Trophy size={28} className="text-accent flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted uppercase font-bold">Your current score</p>
                  <p className="text-2xl font-black text-ink">{overallAvg.toFixed(1)}<span className="text-base font-normal text-muted">/3.0</span></p>
                </div>
                {allProficient && (
                  <div className="ml-auto">
                    <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">
                      🏆 Eligible for Certificate
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors">
                {anyScored ? <><RefreshCw size={16} /> Continue Building</> : <><Code size={16} /> Start Building</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-accent border border-hair bg-card hover:border-accent/40 rounded-xl transition-colors">
                  View Results →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            BUILD VIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'build' && (
          <div className="flex-1 flex overflow-hidden">

            {/* ── Left: Vibe coding + criteria ─────────────────────── */}
            <div className="w-80 flex-shrink-0 flex flex-col bg-surface border-r border-hair overflow-hidden">

              <div className="flex-shrink-0 px-4 py-3 border-b border-hair bg-accent/5">
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className="text-accent" />
                  <p className="text-sm font-bold text-accent">Vibe Coding</p>
                </div>
                <p className="text-[10px] text-muted mt-0.5">
                  {lvl <= 1 ? 'Describe what you want. AI will build it.' : 'Describe changes or features — AI generates the code.'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">

                {explanation && (
                  <div className="p-2.5 bg-accent/5 border border-accent/20 rounded-lg">
                    <p className="text-[9px] font-bold text-accent uppercase mb-1">What was built</p>
                    <p className="text-xs text-body leading-relaxed">{explanation}</p>
                  </div>
                )}

                {genError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-700 mt-0.5" />
                    <p className="text-xs text-red-800">{genError}</p>
                  </div>
                )}

                {evalError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-700 mt-0.5" />
                    <p className="text-xs text-red-800">{evalError}</p>
                  </div>
                )}

                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Describe what you want to build or change:' : 'Your vibe coding prompt:'}
                  </label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    placeholder={lvl <= 1
                      ? 'e.g. Make the background blue and add a welcome message with my name'
                      : 'e.g. Add a responsive navbar with links to Home, About, and Contact. Use a purple gradient background.'}
                    rows={6}
                    className="w-full bg-paper border border-hair rounded-xl px-3 py-2.5 text-sm text-ink placeholder-muted resize-y outline-none focus:border-accent transition-colors leading-relaxed" />
                  <p className="text-[9px] text-muted mt-0.5">Ctrl+Enter to generate</p>
                </div>

                {/* Assessment criteria accordion */}
                <div>
                  <p className="text-[10px] font-bold text-muted uppercase mb-2 flex items-center gap-1.5">
                    <ClipboardList size={11} /> Rubric Criteria
                  </p>
                  <div className="space-y-1.5">
                    {assessments.map(a => {
                      const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                      const isOpen = expandedCrit === a.certification_id;
                      const sl = scoreLabel(sc?.score ?? null);
                      return (
                        <div key={a.certification_id} className={`rounded-lg border overflow-hidden ${isOpen ? 'border-accent/40' : 'border-hair'}`}>
                          <button onClick={() => setExpandedCrit(isOpen ? null : a.certification_id)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-card hover:bg-paper text-left transition-colors">
                            <ScoreRing score={sc?.score ?? null} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-ink truncate">{a.assessment_name}</p>
                              {sc?.score !== null && (
                                <span className={`text-[9px] font-bold ${sl.color}`}>{sl.text}</span>
                              )}
                            </div>
                            {isOpen ? <ChevronUp size={12} className="text-muted flex-shrink-0" /> : <ChevronDown size={12} className="text-muted flex-shrink-0" />}
                          </button>
                          {isOpen && (
                            <div className="px-3 py-2.5 bg-paper border-t border-hair space-y-2">
                              <p className="text-[10px] text-muted leading-relaxed">{a.description}</p>
                              <div className="space-y-1">
                                {[
                                  { level: 0, text: a.certification_level0_metric, color: 'text-red-700' },
                                  { level: 1, text: a.certification_level1_metric, color: 'text-yellow-700' },
                                  { level: 2, text: a.certification_level2_metric, color: 'text-blue-700' },
                                  { level: 3, text: a.certification_level3_metric, color: 'text-green-700' },
                                ].map(({ level, text, color }) => (
                                  <div key={level} className={`flex items-start gap-1.5 text-[10px] ${color}`}>
                                    <span className="font-bold flex-shrink-0">L{level}:</span>
                                    <span className="text-muted">{text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Generate button */}
              <div className="flex-shrink-0 px-4 pb-4 pt-2">
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors disabled:opacity-40">
                  {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {isGenerating ? (lvl <= 1 ? 'Building…' : 'Generating code…') : (lvl <= 1 ? 'Build It!' : 'Generate Code')}
                </button>
              </div>
            </div>

            {/* ── Right: Monaco editor ─────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-hair flex-shrink-0">
                <FileCode size={13} className="text-accent" />
                <span className="text-xs text-muted truncate flex-1">{activeFilePath}</span>
                <span className="text-[10px] text-muted">{activeFile?.content.split('\n').length}L</span>
                <button onClick={() => navigator.clipboard.writeText(activeFile?.content || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted hover:text-ink hover:bg-paper rounded transition-colors">
                  {copied ? <Check size={11} /> : <Copy size={11} />}{copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="flex flex-1 overflow-hidden">
                <div className="w-44 flex-shrink-0 border-r border-hair overflow-y-auto bg-surface">
                  <div className="px-3 pt-2 pb-1"><p className="text-[9px] font-bold text-muted uppercase tracking-wide">Files</p></div>
                  <FileTreePanel files={projectFiles} activeFile={activeFilePath} onSelect={setActiveFilePath} />
                </div>

                <div className="flex-1">
                  <Editor height="100%"
                    language={getLanguage(activeFilePath)}
                    value={activeFile?.content || ''} theme="vs-dark"
                    onChange={val => setProjectFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: val || '' } : f))}
                    options={{ fontSize: 13, minimap: { enabled: false }, padding: { top: 12 }, wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            RESULTS VIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'results' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">

            {renderVoiceBar(
              anyScored
                ? `Your Web Development Certification results. Overall average: ${overallAvg?.toFixed(1)} out of 3.`
                : 'Submit your project for evaluation to see your results here.'
            )}

            {!anyScored ? (
              <div className="text-center py-16 space-y-4">
                <ClipboardList size={48} className="text-muted mx-auto" />
                <p className="text-muted">{lvl <= 1 ? 'You have not been evaluated yet. Go to the Build view and submit your project.' : 'No evaluation data yet. Build your project and click Submit for Evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-colors">
                  <Code size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Overall score card */}
                <div className="flex items-center gap-5 p-5 bg-surface border border-hair rounded-2xl">
                  <Trophy size={40} className="text-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted uppercase font-bold">Overall Score</p>
                    <p className="text-4xl font-black text-ink">{overallAvg?.toFixed(1)}<span className="text-lg font-normal text-muted">/3.0</span></p>
                    <p className={`text-sm font-bold mt-0.5 ${allProficient ? 'text-green-700' : 'text-yellow-700'}`}>
                      {allProficient ? '🏆 Proficiency Achieved — Certificate Eligible' : `${assessmentScores.filter(s => (s.score ?? 0) >= 2).length}/${assessmentScores.length} criteria at Proficient or above`}
                    </p>
                  </div>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-colors text-sm">
                      <Award size={16} /> Get Certificate
                    </button>
                  )}
                </div>

                {/* Per-criterion results */}
                <div className="space-y-3">
                  {assessmentScores.map(sc => {
                    const assessment = assessments.find(a => a.assessment_name === sc.assessment_name);
                    const sl = scoreLabel(sc.score);
                    const isOpen = expandedCrit === sc.assessment_name;
                    return (
                      <div key={sc.assessment_name} className={`rounded-xl border overflow-hidden ${sl.border} ${sl.bg}`}>
                        <button onClick={() => setExpandedCrit(isOpen ? null : sc.assessment_name)}
                          className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-black/[0.02] transition-colors">
                          <ScoreRing score={sc.score} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-ink">{sc.assessment_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs font-bold ${sl.color}`}>{sl.text}</span>
                              <div className="h-1.5 w-24 bg-hair rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${sc.score === 3 ? 'bg-green-600' : sc.score === 2 ? 'bg-blue-600' : sc.score === 1 ? 'bg-yellow-600' : 'bg-red-600'}`}
                                  style={{ width: `${((sc.score ?? 0) / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={14} className="text-muted flex-shrink-0" /> : <ChevronDown size={14} className="text-muted flex-shrink-0" />}
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-hair pt-3 space-y-3">
                            {/* ── Evidence — rendered as markdown ── */}
                            {sc.evidence && (
                              <div>
                                <p className="text-[10px] font-bold text-muted uppercase mb-1">Evidence</p>
                                <ReactMarkdown components={markdownComponents}>
                                  {sc.evidence}
                                </ReactMarkdown>
                              </div>
                            )}

                            {/* ── Rubric levels — metric text rendered as markdown ── */}
                            {assessment && (
                              <div>
                                <p className="text-[10px] font-bold text-muted uppercase mb-1">Rubric</p>
                                <div className="space-y-1.5">
                                  {[
                                    { level: 0, text: assessment.certification_level0_metric, color: 'text-red-700',    activeColor: 'bg-red-50 border border-red-200'    },
                                    { level: 1, text: assessment.certification_level1_metric, color: 'text-yellow-700', activeColor: 'bg-yellow-50 border border-yellow-200' },
                                    { level: 2, text: assessment.certification_level2_metric, color: 'text-blue-700',   activeColor: 'bg-blue-50 border border-blue-200'   },
                                    { level: 3, text: assessment.certification_level3_metric, color: 'text-green-700',  activeColor: 'bg-green-50 border border-green-200'  },
                                  ].map(({ level, text, color, activeColor }) => (
                                    <div key={level}
                                      className={`rounded-lg px-2.5 py-1.5 ${sc.score === level ? activeColor : ''}`}>
                                      <span className={`text-[10px] font-bold ${color} block mb-0.5`}>
                                        {sc.score === level ? '▶ ' : ''}L{level}:
                                      </span>
                                      <div className={sc.score === level ? color : 'text-muted'}>
                                        <ReactMarkdown components={{
                                          ...markdownComponents,
                                          p: ({ children }: any) => (
                                            <p className={`text-[10px] leading-relaxed ${sc.score === level ? '' : 'text-muted'}`}>{children}</p>
                                          ),
                                        }}>
                                          {text}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setView('build')}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-accent border border-hair bg-card hover:border-accent/40 rounded-xl transition-colors">
                    <Code size={15} /> Continue Building
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors disabled:opacity-50">
                    {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isEvaluating ? 'Re-evaluating…' : 'Re-evaluate'}
                  </button>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors ml-auto">
                      <Award size={15} /> Get Certificate →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            CERTIFICATE VIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'certificate' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">

            {!allProficient ? (
              <div className="text-center py-16 space-y-4">
                <XCircle size={48} className="text-yellow-600 mx-auto" />
                <h2 className="text-lg font-bold text-ink">
                  {lvl <= 1 ? 'Not ready for the certificate yet.' : 'Certificate Not Yet Available'}
                </h2>
                <p className="text-muted text-sm max-w-sm mx-auto">
                  {lvl <= 1
                    ? 'You need to score at least Proficient (2/3) in all criteria. Check your results, keep building, and try again.'
                    : 'A Proficient score (2+) on all assessment criteria is required. Review your results, improve your project, and re-evaluate.'}
                </p>
                <button onClick={() => setView('results')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-colors">
                  📊 View Results
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {renderVoiceBar(lvl <= 1
                  ? 'Congratulations! You passed the Web Development Certification. Enter your name to download your certificate.'
                  : 'Congratulations on passing the Web Development Certification. Enter your full name to generate and download your certificate.')}

                {/* Certificate preview */}
                <div className="p-6 bg-surface border border-hair rounded-2xl text-center space-y-4 relative overflow-hidden">
                  <div className="relative">
                    <div className="flex justify-center mb-3"><Trophy size={44} className="text-accent" /></div>
                    <p className="text-xs font-bold text-accent uppercase tracking-widest">Certificate of Achievement</p>
                    <p className="text-lg font-bold text-ink mt-1">Web Development Certification</p>
                    <p className="text-muted text-sm">React / Vite · {scoreLabel(Math.min(...assessmentScores.map(s => s.score ?? 0))).text} Level</p>
                    <div className="my-4 h-px bg-hair" />
                    <p className="text-muted text-xs">Awarded to</p>
                    <p className="text-2xl font-bold text-ink mt-1">{certName || '[ Your Name ]'}</p>
                    <p className="text-muted text-xs mt-1">{branding.institutionName}</p>
                    <div className="my-4 h-px bg-hair" />
                    <div className="grid grid-cols-2 gap-2 text-left">
                      {assessmentScores.map(sc => {
                        const sl = scoreLabel(sc.score);
                        return (
                          <div key={sc.assessment_name} className={`px-2.5 py-1.5 rounded-lg border text-xs ${sl.bg} ${sl.border}`}>
                            <p className={`font-bold ${sl.color}`}>{sc.assessment_name}</p>
                            <p className="text-muted">{sc.score}/3 — {sl.text}</p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted mt-3">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                {/* Name input + download */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-muted uppercase block mb-1.5">
                      {lvl <= 1 ? 'Your full name (will appear on the certificate):' : 'Full name for the certificate:'}
                    </label>
                    <input type="text" value={certName} onChange={e => setCertName(e.target.value)}
                      placeholder="e.g. Amara Okoye"
                      className="w-full bg-paper border border-hair rounded-xl px-4 py-3 text-ink placeholder-muted text-sm outline-none focus:border-accent transition-colors" />
                  </div>
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {isGenCert ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {isGenCert ? 'Generating PDF…' : 'Download Certificate (PDF)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
};

export default WebDevCertificationPage;
