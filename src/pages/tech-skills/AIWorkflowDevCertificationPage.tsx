// src/pages/tech-skills/AIWorkflowDevCertificationPage.tsx
//
// AI Workflow Development Certification — React + Anthropic API
// Framework: mirrors WebDevCertificationPage + adds AI-workflow features from
//            AIWorkflowDevPage (API credentials panel, live Test Workflow tab)
// No guided task system — student builds freely; rubric criteria visible throughout.
//
// API routes needed:
//   /api/generate-workflow-code   (reuses AIWorkflowDevPage route)
//
// Dashboard columns (all new — see SQL file):
//   wf_cert_session_id  (text)
//   wf_cert_pages       (jsonb) — project files
//   wf_cert_evaluation  (jsonb) — per-criterion scores
// Activity stored as: 'AI Workflow Dev Certification'

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Cpu, Award, Trophy, XCircle, Loader2,
  Download, ExternalLink, AlertCircle, Volume2, VolumeX,
  ChevronDown, ChevronUp, FileCode, ClipboardList,
  RefreshCw, X, Copy, Check, Key, Eye, EyeOff,
  Wand2, Play, Terminal, GitBranch, Zap, CheckCircle,
  BarChart3,
} from 'lucide-react';

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
interface ApiCreds { anthropicKey: string; }
type RightTab = 'code' | 'test';
type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'AI Workflow Development';
const CERT_ACTIVITY = 'AI Workflow Dev Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const LS_CREDS_KEY  = 'workflow_dev_api_creds';

const STARTER_FILES: ProjectFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'my-ai-workflow', private: true, version: '0.0.0', type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: { 'react': '^18.2.0', 'react-dom': '^18.2.0', 'react-router-dom': '^6.21.0' },
      devDependencies: { '@vitejs/plugin-react': '^4.2.1', 'vite': '^5.0.8' },
    }, null, 2),
  },
  {
    path: 'vite.config.js',
    content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n`,
  },
  {
    path: '.env.example',
    content: `# Copy to .env — never commit .env to git\n# Get your key from: https://console.anthropic.com/\n\nVITE_ANTHROPIC_API_KEY=sk-ant-your-key-here\n`,
  },
  {
    path: 'index.html',
    content: `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>My AI Workflow App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
  },
  {
    path: 'src/main.jsx',
    content: `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App.jsx'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode><App /></React.StrictMode>,\n)\n`,
  },
  {
    path: 'src/lib/aiClient.js',
    content: `// AI Client — handles all communication with the Anthropic API.
// Your API key lives ONLY here (or in a .env variable).

const AI_API_URL = 'https://api.anthropic.com/v1/messages';
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

/**
 * Send a single prompt to Claude and get a text response.
 * @param {string} userPrompt   - The user's input / workflow step prompt
 * @param {string} systemPrompt - Instructions shaping how Claude responds
 * @param {number} maxTokens    - Max length of response
 */
export async function callAI(userPrompt, systemPrompt = 'You are a helpful assistant.', maxTokens = 500) {
  const response = await fetch(AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || \`API error: \${response.status}\`);
  }
  const data = await response.json();
  return data.content[0].text;
}

/**
 * Chain multiple AI calls — output of each step feeds the next.
 * @param {Array<{prompt: string, system?: string}>} steps
 */
export async function chainAICalls(steps) {
  let previousOutput = '';
  const results = [];
  for (const step of steps) {
    const fullPrompt = previousOutput
      ? \`Previous step output: \${previousOutput}\\n\\n\${step.prompt}\`
      : step.prompt;
    const output = await callAI(fullPrompt, step.system);
    results.push(output);
    previousOutput = output;
  }
  return results;
}
`,
  },
  {
    path: 'src/App.jsx',
    content: `import React, { useState } from 'react'
import { callAI } from './lib/aiClient.js'
import './index.css'

function App() {
  const [input,   setInput]   = useState('')
  const [output,  setOutput]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const handleRun = async () => {
    if (!input.trim()) return
    setLoading(true); setError(null)
    try {
      const result = await callAI(input)
      setOutput(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <h1>My AI Workflow</h1>
      <p>Use the prompt panel to start building your workflow!</p>
      <div className="test-box">
        <textarea value={input} onChange={e => setInput(e.target.value)}
          placeholder="Type something for the AI to respond to…" rows={4} />
        <button onClick={handleRun} disabled={loading}>
          {loading ? 'Thinking…' : 'Run AI'}
        </button>
        {error  && <p className="error">{error}</p>}
        {output && <div className="output"><strong>AI Response:</strong><p>{output}</p></div>}
      </div>
    </div>
  )
}

export default App
`,
  },
  {
    path: 'src/index.css',
    content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; }
.app { max-width: 800px; margin: 0 auto; padding: 2rem; }
h1 { font-size: 1.75rem; font-weight: bold; margin-bottom: 0.5rem; }
.test-box { margin-top: 2rem; display: flex; flex-direction: column; gap: 0.75rem; }
textarea { width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.95rem; resize: vertical; font-family: inherit; }
button { padding: 0.6rem 1.5rem; background: #6d28d9; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; align-self: flex-start; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.output { background: #f1f5f9; padding: 1rem; border-radius: 8px; border-left: 3px solid #6d28d9; }
.output p { margin-top: 0.5rem; line-height: 1.6; white-space: pre-wrap; }
.error { color: #ef4444; font-size: 0.875rem; }
`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getLanguage = (path: string) => {
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md') || path.endsWith('.example')) return 'markdown';
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
  if (s === null) return { text: 'Not assessed', color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20'    };
  if (s === 3)    return { text: 'Advanced',     color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'    };
  if (s === 1)    return { text: 'Emerging',     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   };
  return               { text: 'No Evidence',  color: 'text-red-400',    bg: 'bg-red-500/10',     border: 'border-red-500/30'     };
};

// ─── File Tree ────────────────────────────────────────────────────────────────

const FileTreePanel: React.FC<{ files: ProjectFile[]; activeFile: string; onSelect: (p: string) => void }> = ({ files, activeFile, onSelect }) => {
  const [open, setOpen] = useState<Set<string>>(new Set(['src', 'src/lib', 'src/components']));
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
          <button onClick={() => toggle(node.path)}
            className="w-full flex items-center gap-1 py-0.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 rounded"
            style={{ paddingLeft: `${8 + depth * 10}px` }}>
            {open.has(node.path) ? <ChevronDown size={10} /> : <ChevronDown size={10} style={{ transform: 'rotate(-90deg)' }} />}
            <span className="text-amber-400 text-[10px]">📁</span>
            <span className="font-medium text-[11px]">{node.name}</span>
          </button>
        ) : (
          <button onClick={() => onSelect(node.path)}
            className={`w-full flex items-center gap-1.5 py-0.5 text-[11px] rounded transition-colors
              ${activeFile === node.path ? 'bg-violet-500/20 text-violet-300 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'}`}
            style={{ paddingLeft: `${8 + depth * 10}px` }}>
            <FileCode size={10} className="flex-shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
        )}
        {node.isFolder && open.has(node.path) && renderTree(node.children, depth + 1)}
      </React.Fragment>
    ));
  return <div className="space-y-0">{renderTree(buildTree(files))}</div>;
};

// ─── Test Workflow Panel ──────────────────────────────────────────────────────

const TestWorkflowPanel: React.FC<{ apiKey: string }> = ({ apiKey }) => {
  const [userPrompt,    setUserPrompt]   = useState('');
  const [systemPrompt,  setSystemPrompt] = useState('You are a helpful assistant.');
  const [model,         setModel]        = useState('claude-sonnet-4-6');
  const [maxTokens,     setMaxTokens]    = useState(300);
  const [response,      setResponse]     = useState('');
  const [loading,       setLoading]      = useState(false);
  const [error,         setError]        = useState('');
  const [showAdvanced,  setShowAdvanced] = useState(false);

  const handleTest = async () => {
    if (!userPrompt.trim()) return;
    if (!apiKey) { setError('Enter your Anthropic API key in the Credentials panel first'); return; }
    setLoading(true); setError(''); setResponse('');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error?.message || `API error ${res.status}`); }
      const data = await res.json();
      setResponse(data.content?.[0]?.text ?? '(empty response)');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
        <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5"><Terminal size={11} /> Live AI Test Runner</span>
        <button onClick={() => setShowAdvanced(a => !a)} className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1">
          {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />} Advanced
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">System Prompt (how the AI behaves)</label>
          <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-200 resize-y outline-none focus:border-violet-500 font-mono leading-relaxed" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">User Prompt (your workflow input)</label>
          <textarea value={userPrompt} onChange={e => setUserPrompt(e.target.value)} rows={4}
            placeholder="What should the AI do? e.g. Summarise this text: [paste text here]"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-200 resize-y outline-none focus:border-violet-500 leading-relaxed" />
        </div>
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Model</label>
              <select value={model} onChange={e => setModel(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500">
                <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (fast)</option>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6 (smart)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Max Tokens</label>
              <input type="number" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} min={50} max={2000} step={50}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500" />
            </div>
          </div>
        )}
        <button onClick={handleTest} disabled={loading || !userPrompt.trim()}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-40 transition-colors">
          {loading ? <><Loader2 size={12} className="animate-spin" /> Running…</> : <><Play size={12} /> Run Workflow</>}
        </button>
        {!apiKey && (
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
            ⚠️ Add your Anthropic API key using the Credentials button in the toolbar.
          </div>
        )}
        {error && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2"><AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-red-300">{error}</p></div>}
        {response && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-gray-500 uppercase">AI Response</p>
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
              <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{response}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Score Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  const pct = score !== null ? (score / 3) * 100 : 0;
  const r = 18; const circ = 2 * Math.PI * r; const dash = (pct / 100) * circ;
  const color = score === null ? '#4b5563' : score >= 2 ? '#10b981' : score === 1 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={44} height={44} viewBox="0 0 44 44">
      <circle cx={22} cy={22} r={r} fill="none" stroke="#1f2937" strokeWidth={4} />
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

const AIWorkflowDevCertificationPage: React.FC = () => {
  const { user } = useAuth();

  const [view, setView] = useState<ViewMode>('overview');

  // ── Assessments ───────────────────────────────────────────────────────
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [loadingData,      setLoadingData]      = useState(true);
  const [dataError,        setDataError]        = useState<string | null>(null);

  // ── Personality ───────────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState(1);

  // ── Page narration voice + Branding ─────────────────────────────────
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin'); // Africa default
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

  // ── Session ───────────────────────────────────────────────────────────
  const [sessionId,      setSessionId]      = useState<string | null>(null);
  const [sessionName,    setSessionName]    = useState('My AI Workflow App');
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Project files ─────────────────────────────────────────────────────
  const [projectFiles,   setProjectFiles]   = useState<ProjectFile[]>(STARTER_FILES);
  const [activeFilePath, setActiveFilePath] = useState('src/App.jsx');
  const activeFile = projectFiles.find(f => f.path === activeFilePath) ?? projectFiles[0];

  // ── API Credentials ───────────────────────────────────────────────────
  const [creds, setCreds] = useState<ApiCreds>(() => {
    try { const s = localStorage.getItem(LS_CREDS_KEY); return s ? JSON.parse(s) : { anthropicKey: '' }; }
    catch { return { anthropicKey: '' }; }
  });
  const [showKey,      setShowKey]      = useState(false);
  const [credStatus,   setCredStatus]   = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [credMsg,      setCredMsg]      = useState('');
  const [showCredPanel, setShowCredPanel] = useState(false);

  const updateCreds = (c: ApiCreds) => {
    setCreds(c); setCredStatus('idle');
    try { localStorage.setItem(LS_CREDS_KEY, JSON.stringify(c)); } catch {}
  };

  const testApiKey = async () => {
    if (!creds.anthropicKey) return;
    setCredStatus('testing');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': creds.anthropicKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
      });
      if (res.ok || res.status === 400) { setCredStatus('ok'); setCredMsg('Key works!'); }
      else if (res.status === 401) { setCredStatus('fail'); setCredMsg('Invalid key'); }
      else { setCredStatus('fail'); setCredMsg(`Error ${res.status}`); }
    } catch { setCredStatus('fail'); setCredMsg('Network error'); }
  };

  // ── Right tab ─────────────────────────────────────────────────────────
  const [rightTab, setRightTab] = useState<RightTab>('code');

  // ── Vibe coding ───────────────────────────────────────────────────────
  const [prompt,        setPrompt]        = useState('');
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [genError,      setGenError]      = useState<string | null>(null);
  const [explanation,   setExplanation]   = useState<string | null>(null);
  const [copied,        setCopied]        = useState(false);
  const [expandedCrit,  setExpandedCrit]  = useState<string | null>(null);
  const [showSBModal,   setShowSBModal]   = useState(false);
  const [downloading,   setDownloading]   = useState(false);

  // ── Evaluation ────────────────────────────────────────────────────────
  const [isEvaluating,  setIsEvaluating]  = useState(false);
  const [evalError,     setEvalError]     = useState<string | null>(null);
  const [evalProgress,  setEvalProgress]  = useState('');

  // ── Certificate ───────────────────────────────────────────────────────
  const [certName,  setCertName]  = useState('');
  const [isGenCert, setIsGenCert] = useState(false);

  const lvl            = communicationLevel;
  const allProficient  = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored      = assessmentScores.some(s => s.score !== null);
  const overallAvg     = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;
  const hasCode        = projectFiles.some(f => f.path.startsWith('src/') && f.content.length > 100 && f.path !== 'src/index.css');

  const speak = (text: string) => hookSpeak(text.slice(0, 400));
  const stopSpeaking = () => cancelSpeech();

  const renderVoiceBar = (textToRead: string) => (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-800/40 border border-gray-700 rounded-xl mb-4">
      <span className="text-xs font-semibold text-gray-400 flex items-center gap-1"><Volume2 size={13} className="text-violet-400" /> Voice:</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-600">
        {(['english', 'pidgin'] as const).map(m => (
          <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all border-r border-gray-600 last:border-0 ${voiceMode === m ? (m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}>
            {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
          </button>
        ))}
      </div>
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${isSpeaking ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20'}`}>
        {isSpeaking ? <><VolumeX size={12} /> Stop</> : <><Volume2 size={12} /> Read aloud</>}
      </button>
    </div>
  );

  // ── Fetch data ────────────────────────────────────────────────────────
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

      const evalData = dash?.wf_cert_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score:    evalData?.scores?.[a.assessment_name]?.score ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      if (dash?.wf_cert_pages?.length) {
        const files = (dash.wf_cert_pages as any[]).map((p: any) => ({ path: p.path || p.name, content: p.content || '' }));
        if (files.length) setProjectFiles(files);
      }
      if (dash?.wf_cert_session_id) { setSessionId(dash.wf_cert_session_id); sessionIdRef.current = dash.wf_cert_session_id; }

    } catch (err: any) { setDataError(err.message || 'Failed to load certification data'); }
    finally { setLoadingData(false); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Ensure record ─────────────────────────────────────────────────────
  const ensureRecord = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (user?.id) {
      await supabase.from('dashboard').insert({
        user_id: user.id, activity: CERT_ACTIVITY,
        category_activity: 'Certification', progress: 'started',
        wf_cert_session_id: sid,
        wf_cert_pages: STARTER_FILES.map(f => ({ path: f.path, content: f.content })),
        wf_cert_evaluation: {},
      });
    }
    return sid;
  }, [user?.id]);

  // ── Persist project ───────────────────────────────────────────────────
  const persistProject = useCallback(async (files: ProjectFile[]) => {
    const sid = sessionIdRef.current; if (!user?.id || !sid) return;
    await supabase.from('dashboard').update({
      wf_cert_pages: files.map(f => ({ path: f.path, content: f.content })),
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('wf_cert_session_id', sid);
  }, [user?.id]);

  // ── Generate code ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setGenError(null); setExplanation(null);
    await ensureRecord();
    try {
      const res = await fetch('/api/generate-workflow-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          action: hasCode ? 'iterate' : 'generate',
          prompt: prompt.trim(),
          projectFiles: projectFiles.map(f => ({ path: f.path, content: f.content })),
          sessionContext: { appName: sessionName },
          communicationLevel,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const result = await res.json();
      const updatedFiles = result.files ? mergeFiles(projectFiles, result.files) : projectFiles;
      setProjectFiles(updatedFiles);
      if (result.files?.length) {
        const main = result.files.find((f: any) => f.path === 'src/App.jsx' || f.path.includes('App'));
        if (main) setActiveFilePath(main.path);
      }
      setExplanation(result.explanation || null);
      setPrompt('');
      setRightTab('code');
      await persistProject(updatedFiles);
    } catch (err: any) { setGenError(err.message || 'Something went wrong'); }
    finally { setIsGenerating(false); }
  }, [prompt, isGenerating, projectFiles, sessionName, communicationLevel, hasCode, ensureRecord, persistProject]);

  // ── Evaluate against rubric ───────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (!user?.id || isEvaluating) return;
    setIsEvaluating(true); setEvalError(null);
    await ensureRecord();

    const codeBundle = projectFiles
      .filter(f => f.content.trim().length > 10)
      .map(f => `// === ${f.path} ===\n${f.content}`)
      .join('\n\n');

    // Pre-analyse for scoring context
    const hasCallAI      = codeBundle.includes('callAI') || codeBundle.includes('callAi');
    const hasChain       = codeBundle.includes('chainAICalls') || codeBundle.includes('chainAI') || (codeBundle.match(/callAI/g) || []).length > 1;
    const hasSystemPr    = codeBundle.includes('systemPrompt') || codeBundle.includes('system:') || codeBundle.includes("system: '") || codeBundle.includes('system_prompt');
    const hasErrorHandle = codeBundle.includes('try') && codeBundle.includes('catch');
    const hasLoading     = codeBundle.includes('loading') || codeBundle.includes('isLoading') || codeBundle.includes('Thinking') || codeBundle.includes('disabled');
    const hasAiClient    = codeBundle.includes('aiClient') || codeBundle.includes('import.meta.env.VITE_ANTHROPIC');
    const hasStateUpdate = codeBundle.includes('useState') && (codeBundle.includes('setOutput') || codeBundle.includes('setResult') || codeBundle.includes('setResponse'));

    const contextNote = [
      hasCallAI      ? '✓ callAI() function present' : '✗ No callAI() detected',
      hasChain       ? '✓ Chained / multi-step AI calls present' : '✗ No evidence of chained calls',
      hasSystemPr    ? '✓ System prompt present in code' : '✗ No system prompt detected',
      hasErrorHandle ? '✓ try/catch error handling present' : '✗ No error handling',
      hasLoading     ? '✓ Loading/disabled states present' : '✗ No loading state detected',
      hasAiClient    ? '✓ AI client / env key reference present' : '✗ No AI client setup detected',
      hasStateUpdate ? '✓ AI response stored in React state' : '✗ AI response not wired to state',
    ].join('\n');

    const scores: Record<string, { score: number; evidence: string }> = {};
    const newScores: AssessmentScore[] = [];

    try {
      for (const assessment of assessments) {
        setEvalProgress(`Evaluating: ${assessment.assessment_name}…`);

        const evalPrompt = `You are evaluating a student's AI workflow app (React + Anthropic API) for the "${assessment.assessment_name}" criterion.

CRITERION: ${assessment.assessment_name}
DESCRIPTION: ${assessment.description}
ASSESSMENT QUESTION: ${assessment.certification_prompt}

RUBRIC:
- Level 0 (No Evidence): ${assessment.certification_level0_metric}
- Level 1 (Emerging): ${assessment.certification_level1_metric}
- Level 2 (Proficient): ${assessment.certification_level2_metric}
- Level 3 (Advanced): ${assessment.certification_level3_metric}

CONTEXT ANALYSIS:
${contextNote}

STUDENT'S PROJECT CODE:
${codeBundle.slice(0, 7000)}

Evaluate the code against this specific criterion. Consider intent, structure, and execution.

Respond ONLY in this JSON format:
{
  "score": <0, 1, 2, or 3>,
  "evidence": "<2-4 sentences with specific references to the code>"
}`;

        const result = await chatJSON({ page: 'AIWorkflowDevCertificationPage',
          messages: [{ role: 'user', content: evalPrompt }],
          system: 'You are an expert AI workflow development educator evaluating student code. Be fair, specific, and constructive.',
          max_tokens: 400, temperature: 0.3,
        });

        const score    = result.score ?? 0;
        const evidence = result.evidence ?? 'Unable to evaluate.';
        scores[assessment.assessment_name] = { score, evidence };
        newScores.push({ assessment_name: assessment.assessment_name, score, evidence });
      }

      setEvalProgress('');
      setAssessmentScores(newScores);

      const avgCalc = newScores.reduce((s, a) => s + (a.score ?? 0), 0) / newScores.length;
      const allPass = newScores.every(s => (s.score ?? 0) >= 2);

      await supabase.from('dashboard').update({
        wf_cert_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg: avgCalc },
        progress: allPass ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('wf_cert_session_id', sessionIdRef.current!);

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
    const add = (n: string, v: string) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; form.appendChild(i); };
    add('project[title]', sessionName); add('project[template]', 'node');
    for (const f of projectFiles) add(`project[files][${f.path}]`, f.content);
    document.body.appendChild(form); form.submit(); document.body.removeChild(form);
  }, [projectFiles, sessionName]);

  // ── Certificate ───────────────────────────────────────────────────────
  const generateCertificate = useCallback(async () => {
    if (!certName.trim()) return;
    setIsGenCert(true);
    try {
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) { alert('PDF not available.'); return; }
      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const minScore  = Math.min(...assessmentScores.map(s => s.score ?? 0));
      const certLevel = minScore === 3 ? 'Advanced' : minScore >= 2 ? 'Proficient' : 'Emerging';
      const avg       = assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length;

      // Violet/purple theme
      doc.setLineWidth(3); doc.setDrawColor(109, 40, 217); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(139, 92, 246); doc.rect(15, 15, W - 30, H - 30);

      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(109, 40, 217);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });
      doc.setFontSize(20); doc.setTextColor(139, 92, 246);
      doc.text(`AI Workflow Development Certification — ${certLevel}`, W / 2, 43, { align: 'center' });
      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the AI Workflow Development Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to design, build, and deploy AI-powered workflow applications', W / 2, 95, { align: 'center' });
      doc.text('using the Anthropic API, prompt engineering, and chained AI calls in React.', W / 2, 102, { align: 'center' });

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(109, 40, 217);
      doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel} · React + Anthropic API`, W / 2, 112, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
      doc.text('Assessment Competencies:', 20, 122);

      const cols = assessmentScores.length <= 4 ? 2 : 3;
      const colW = (W - 40) / cols;
      let yPos = 128; let col = 0;
      assessmentScores.forEach(sc => {
        const xPos = 20 + col * colW;
        const levelText = sc.score === 3 ? 'Advanced' : sc.score === 2 ? 'Proficient' : sc.score === 1 ? 'Emerging' : 'No Evidence';
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
        doc.text(`${sc.assessment_name}: ${sc.score ?? 0}/3 — ${levelText}`, xPos, yPos);
        if (sc.evidence) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
          const lines = doc.splitTextToSize(sc.evidence, colW - 5);
          lines.slice(0, 3).forEach((line: string, li: number) => { doc.text(line, xPos, yPos + 4 + li * 3.5); });
        }
        col++; if (col >= cols) { col = 0; yPos += 22; }
      });

      const footerY = H - 22;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130);
      doc.text(`Awarded: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 20, footerY);
      doc.text(`${branding.institutionName} Programme`, W / 2, footerY, { align: 'center' });
      doc.text(`Certification ID: WF-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-AIWorkflow-Certificate.pdf`);
    } catch (err) { console.error(err); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, branding]);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex flex-col h-screen bg-gray-900">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={36} className="animate-spin text-violet-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <Navbar />

      {/* Voice fallback — fixed overlay when TTS unavailable (e.g. no network voice in Nigeria) */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      {/* ── StackBlitz modal ──────────────────────────────────────────── */}
      {showSBModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-[460px] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-base font-bold text-white flex items-center gap-2"><ExternalLink size={16} className="text-violet-400" /> Open in StackBlitz</h2>
              <button onClick={() => setShowSBModal(false)} className="p-1 text-gray-400 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-300">Your project opens in StackBlitz for live preview. Add VITE_ANTHROPIC_API_KEY in StackBlitz environment settings for AI calls to work.</p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">⚠️ Never paste your API key directly into code — use environment variables.</div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => { handleOpenStackBlitz(); setShowSBModal(false); }}
                className="flex-1 py-2.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl">Open in StackBlitz →</button>
              <button onClick={() => setShowSBModal(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-xl">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>

        {/* ── Toolbar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Cpu size={18} className="text-violet-400" />
              <span className="text-sm font-bold text-white">AI Workflow Dev Certification</span>
            </div>
            {view !== 'overview' && (
              <>
                <div className="w-px h-5 bg-gray-600" />
                <input className="text-sm text-gray-300 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-violet-500 outline-none px-1 py-0.5 w-44"
                  value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="App name…" />
              </>
            )}
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors
                    ${view === v ? 'bg-violet-500/20 text-violet-300 border-violet-500/40' : 'text-gray-600 border-gray-700 hover:text-gray-300 hover:border-gray-500'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '⚡ Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
                </button>
              ))}
            </div>
            {creds.anthropicKey && credStatus === 'ok' && (
              <div className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/25 rounded-full flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-medium">API key active</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex rounded-lg overflow-hidden border border-gray-600">
              {(['english', 'pidgin'] as const).map(m => (
                <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
                  className={`px-2 py-1.5 text-xs font-bold transition-all border-r border-gray-600 last:border-0 ${voiceMode === m ? (m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}>
                  {m === 'english' ? '🇬🇧' : '🇳🇬'}
                </button>
              ))}
            </div>
            {view === 'build' && (
              <>
                <button onClick={() => setShowCredPanel(p => !p)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${creds.anthropicKey ? 'text-violet-300 border-violet-500/40 bg-violet-500/10' : 'text-gray-400 border-gray-600 hover:text-gray-200 hover:bg-gray-700'}`}>
                  <Key size={12} /> {creds.anthropicKey ? 'API Key ✓' : 'Add API Key'}
                </button>
                <button onClick={() => setShowSBModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-violet-300 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 rounded-lg transition-colors">
                  <ExternalLink size={12} /> Preview
                </button>
                <button onClick={handleDownload} disabled={downloading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                  {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} .zip
                </button>
                <button onClick={handleEvaluate} disabled={isEvaluating || !hasCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg shadow disabled:opacity-50 transition-colors">
                  {isEvaluating ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />}
                  {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit for Evaluation'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── API credentials panel ──────────────────────────────────── */}
        {showCredPanel && view === 'build' && (
          <div className="flex-shrink-0 px-4 py-3 bg-gray-800/80 border-b border-gray-700">
            <div className="max-w-xl flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[260px]">
                <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Anthropic API Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={creds.anthropicKey}
                    onChange={e => updateCreds({ anthropicKey: e.target.value })}
                    placeholder="sk-ant-…"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 pr-8 text-xs text-white placeholder-gray-600 outline-none focus:border-violet-500 font-mono" />
                  <button onClick={() => setShowKey(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300">
                    {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={testApiKey} disabled={!creds.anthropicKey || credStatus === 'testing'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                  {credStatus === 'testing' ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />} Test Key
                </button>
                {credStatus === 'ok'   && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> {credMsg}</span>}
                {credStatus === 'fail' && <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={11} /> {credMsg}</span>}
                <button onClick={() => setShowCredPanel(false)} className="text-gray-500 hover:text-gray-300 ml-1"><X size={14} /></button>
              </div>
            </div>
            <p className="text-[9px] text-gray-600 mt-1.5">Get a free key at console.anthropic.com · Stored in your browser only · Never sent to this platform</p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            OVERVIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {dataError && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-2 text-sm text-red-300"><AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{dataError}</div>}

            {renderVoiceBar(lvl <= 1
              ? 'Welcome to the AI Workflow Development Certification. You will build a real app that uses AI inside it, then be evaluated.'
              : 'Welcome to the AI Workflow Development Certification. Build a React application that integrates the Anthropic API, demonstrating prompt engineering, chained AI calls, error handling, and a polished user experience.')}

            {/* Hero */}
            <div className="p-6 bg-gradient-to-br from-violet-600/20 via-purple-600/15 to-indigo-600/10 border border-violet-500/30 rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-violet-600/30 rounded-xl"><Cpu size={24} className="text-violet-300" /></div>
                <div>
                  <h1 className="text-xl font-bold text-white">AI Workflow Development Certification</h1>
                  <p className="text-violet-300 text-sm">React + Anthropic API · Prompt Engineering · Chained AI Calls</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="React + Anthropic API · Prompt Engineering · Chained AI Calls"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you build a real app where AI does a job automatically — summarising, translating, generating, or deciding. You are judged on how well your app calls the AI, how you write instructions (prompts) for it, and whether your app handles errors properly.'
                  : 'Demonstrate AI workflow development skills by building a React application that uses the Anthropic API as a working component. Evaluation covers AI client integration, system prompt design, chained multi-step calls, error and loading state handling, and overall React code quality.'}
              </p>
            </div>

            {/* Architecture callout */}
            <div className="bg-gray-900 rounded-xl p-4 mb-5 border border-gray-700 font-mono text-xs leading-relaxed">
              <p className="text-violet-400 font-bold mb-2 text-[10px] uppercase">⚡ An AI Workflow in Code</p>
              <div className="text-sky-300">User Input</div>
              <div className="ml-3 text-gray-500 my-0.5">↓</div>
              <div className="text-violet-300">callAI(userPrompt, systemPrompt) <span className="text-gray-600">← your prompt engineering</span></div>
              <div className="ml-3 text-gray-500 my-0.5">↓</div>
              <div className="text-emerald-300">Claude Response <span className="text-gray-600">← parse and display</span></div>
              <div className="ml-3 text-gray-500 my-0.5">↓ (chained)</div>
              <div className="text-violet-300">chainAICalls([step1, step2]) <span className="text-gray-600">← output of one feeds next</span></div>
              <div className="ml-3 text-gray-500 my-0.5">↓</div>
              <div className="text-sky-300">React UI <span className="text-gray-600">← useState, loading, error states</span></div>
            </div>

            {/* Rules */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">📋 Certification Requirements</p>
              <div className="space-y-2">
                {[
                  { icon: '✅', text: lvl <= 1 ? 'Your app must call the AI using callAI() or a similar function.' : 'Implement at least one callAI() call that sends a user input to the Anthropic API and displays the response.' },
                  { icon: '✅', text: lvl <= 1 ? 'Write instructions for the AI (a system prompt) that shape how it responds.' : 'Use a system prompt that shapes the AI\'s behaviour for your specific workflow use case.' },
                  { icon: '✅', text: lvl <= 1 ? 'Add an API key in the Credentials panel so the Test tab works.' : 'Configure your Anthropic API key in the Credentials panel. Use the Test Workflow tab to verify live calls.' },
                  { icon: '✅', text: lvl <= 1 ? 'Show a loading message while the AI is thinking.' : 'Show loading state while awaiting the AI response, and catch errors gracefully.' },
                  { icon: '⭐', text: lvl <= 1 ? 'Bonus: Chain two AI steps so the first answer feeds into the second.' : 'Chain multiple AI calls using chainAICalls() for Advanced-level scoring.' },
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">{rule.icon}</span>
                    <span className="text-gray-300">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Criteria */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">🎯 What You Will Be Evaluated On</p>
              {assessments.length === 0 ? <p className="text-sm text-gray-500 italic">Loading criteria…</p> : (
                <div className="space-y-2">
                  {assessments.map(a => {
                    const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                    const sl = scoreLabel(sc?.score ?? null);
                    return (
                      <div key={a.certification_id} className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5"><ScoreRing score={sc?.score ?? null} /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white">{a.assessment_name}</p>
                            {sc?.score !== null && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sl.bg} ${sl.color} ${sl.border}`}>{sl.text}</span>}
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">{a.description || a.certification_prompt.slice(0, 120) + '…'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {anyScored && overallAvg !== null && (
              <div className="p-4 bg-violet-500/10 border border-violet-500/30 rounded-xl mb-5 flex items-center gap-4">
                <Trophy size={28} className="text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold">Your current score</p>
                  <p className="text-2xl font-black text-white">{overallAvg.toFixed(1)}<span className="text-base font-normal text-gray-500">/3.0</span></p>
                </div>
                {allProficient && <span className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🏆 Eligible for Certificate</span>}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl hover:scale-[1.01] transition-all shadow-lg">
                {hasCode ? <><RefreshCw size={16} /> Continue Building</> : <><Cpu size={16} /> Start Building</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-violet-300 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 rounded-xl transition-colors">
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
            <div className="w-80 flex-shrink-0 flex flex-col bg-[#1a1d23] border-r border-gray-700 overflow-hidden">
              <div className="flex-shrink-0 px-4 py-3 border-b border-violet-500/30 bg-violet-500/10">
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className="text-violet-400" />
                  <p className="text-sm font-bold text-violet-300">Vibe Coding</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {lvl <= 1 ? 'Describe what you want your AI workflow app to do.' : 'Describe your workflow, AI calls, or UI — AI generates the code.'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {genError && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2"><AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" /><p className="text-xs text-red-300">{genError}</p></div>}
                {evalError && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2"><AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" /><p className="text-xs text-red-300">{evalError}</p></div>}

                {explanation && (
                  <div className="p-2.5 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                    <p className="text-[9px] font-bold text-violet-400 uppercase mb-1">What was built</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{explanation}</p>
                  </div>
                )}

                <div>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    placeholder={lvl <= 1
                      ? 'e.g. Make an app where someone types a short story idea and the AI writes the full first paragraph for them'
                      : 'e.g. Build a document summariser: user pastes text, callAI() sends it with a system prompt "You are a summariser — return 3 bullet points", display the bullets in a styled card with a copy button'}
                    rows={7}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-violet-500 transition-colors leading-relaxed" />
                  <p className="text-[9px] text-gray-700 mt-0.5">Ctrl+Enter to generate</p>
                </div>

                {/* Criteria accordion */}
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5"><ClipboardList size={11} /> Rubric Criteria</p>
                  <div className="space-y-1.5">
                    {assessments.map(a => {
                      const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                      const isOpen = expandedCrit === a.certification_id;
                      const sl = scoreLabel(sc?.score ?? null);
                      return (
                        <div key={a.certification_id} className={`rounded-lg border overflow-hidden ${isOpen ? 'border-violet-500/40' : 'border-gray-700'}`}>
                          <button onClick={() => setExpandedCrit(isOpen ? null : a.certification_id)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800/60 hover:bg-gray-700/60 text-left transition-colors">
                            <ScoreRing score={sc?.score ?? null} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{a.assessment_name}</p>
                              {sc?.score !== null && <span className={`text-[9px] font-bold ${sl.color}`}>{sl.text}</span>}
                            </div>
                            {isOpen ? <ChevronUp size={12} className="text-gray-500 flex-shrink-0" /> : <ChevronDown size={12} className="text-gray-500 flex-shrink-0" />}
                          </button>
                          {isOpen && (
                            <div className="px-3 py-2.5 bg-gray-900/60 border-t border-gray-700 space-y-2">
                              <p className="text-[10px] text-gray-400 leading-relaxed">{a.description}</p>
                              <div className="space-y-1">
                                {[
                                  { level: 0, text: a.certification_level0_metric, color: 'text-red-400' },
                                  { level: 1, text: a.certification_level1_metric, color: 'text-amber-400' },
                                  { level: 2, text: a.certification_level2_metric, color: 'text-blue-400' },
                                  { level: 3, text: a.certification_level3_metric, color: 'text-emerald-400' },
                                ].map(({ level, text, color }) => (
                                  <div key={level} className={`flex items-start gap-1.5 text-[10px] ${color}`}>
                                    <span className="font-bold flex-shrink-0">L{level}:</span>
                                    <span className="text-gray-400">{text}</span>
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

              <div className="flex-shrink-0 px-4 pb-4 pt-2">
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl disabled:opacity-40 transition-colors">
                  {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                  {isGenerating ? (lvl <= 1 ? 'Building…' : 'Generating…') : (lvl <= 1 ? 'Build It!' : 'Generate Code')}
                </button>
              </div>
            </div>

            {/* ── Right: Code / Test tabs ───────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center gap-1 px-3 py-2 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
                {[
                  { id: 'code' as RightTab, label: 'Code',         icon: <FileCode size={12} /> },
                  { id: 'test' as RightTab, label: 'Test Workflow', icon: <Terminal size={12} /> },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setRightTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all
                      ${rightTab === tab.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/40'}`}>
                    {tab.icon} {tab.label}
                  </button>
                ))}
                {rightTab === 'code' && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-gray-400 truncate max-w-36">{activeFilePath}</span>
                    <button onClick={() => navigator.clipboard.writeText(activeFile?.content || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
                      {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 flex overflow-hidden">
                {rightTab === 'code' && (
                  <>
                    <div className="w-44 flex-shrink-0 border-r border-gray-700 overflow-y-auto" style={{ background: '#161820' }}>
                      <div className="px-3 pt-2 pb-1"><p className="text-[9px] font-bold text-gray-700 uppercase tracking-wide">Files</p></div>
                      <FileTreePanel files={projectFiles} activeFile={activeFilePath} onSelect={setActiveFilePath} />
                    </div>
                    <div className="flex-1">
                      <Editor height="100%" language={getLanguage(activeFilePath)} value={activeFile?.content || ''} theme="vs-dark"
                        onChange={val => setProjectFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: val || '' } : f))}
                        options={{ fontSize: 13, minimap: { enabled: false }, padding: { top: 12 }, wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} />
                    </div>
                  </>
                )}
                {rightTab === 'test' && (
                  <div className="flex-1 overflow-hidden">
                    <TestWorkflowPanel apiKey={creds.anthropicKey} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            RESULTS VIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'results' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {renderVoiceBar(anyScored
              ? `Your AI Workflow Development results. Overall average: ${overallAvg?.toFixed(1)} out of 3.`
              : 'Submit your project for evaluation to see results.')}

            {!anyScored ? (
              <div className="text-center py-16 space-y-4">
                <Cpu size={48} className="text-gray-600 mx-auto" />
                <p className="text-gray-400">{lvl <= 1 ? 'You have not been evaluated yet. Go to Build and create your workflow app first.' : 'No evaluation data yet. Build your app and submit for evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl">
                  <Cpu size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-5 p-5 bg-gradient-to-br from-violet-600/20 to-purple-600/10 border border-violet-500/30 rounded-2xl">
                  <Trophy size={40} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 uppercase font-bold">Overall Score</p>
                    <p className="text-4xl font-black text-white">{overallAvg?.toFixed(1)}<span className="text-lg font-normal text-gray-500">/3.0</span></p>
                    <p className={`text-sm font-bold mt-0.5 ${allProficient ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {allProficient ? '🏆 Proficiency Achieved — Certificate Eligible' : `${assessmentScores.filter(s => (s.score ?? 0) >= 2).length}/${assessmentScores.length} criteria at Proficient or above`}
                    </p>
                  </div>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm">
                      <Award size={16} /> Get Certificate
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {assessmentScores.map(sc => {
                    const assessment = assessments.find(a => a.assessment_name === sc.assessment_name);
                    const sl = scoreLabel(sc.score);
                    const isOpen = expandedCrit === sc.assessment_name;
                    return (
                      <div key={sc.assessment_name} className={`rounded-xl border overflow-hidden ${sl.border} ${sl.bg}`}>
                        <button onClick={() => setExpandedCrit(isOpen ? null : sc.assessment_name)}
                          className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors">
                          <ScoreRing score={sc.score} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white">{sc.assessment_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs font-bold ${sl.color}`}>{sl.text}</span>
                              <div className="h-1.5 w-24 bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${sc.score === 3 ? 'bg-emerald-500' : sc.score === 2 ? 'bg-blue-500' : sc.score === 1 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${((sc.score ?? 0) / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-white/10 pt-3 space-y-3">
                            {sc.evidence && <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Evidence</p><p className="text-xs text-gray-300 leading-relaxed">{sc.evidence}</p></div>}
                            {assessment && (
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Rubric</p>
                                <div className="space-y-1">
                                  {[
                                    { level: 0, text: assessment.certification_level0_metric, color: 'text-red-400' },
                                    { level: 1, text: assessment.certification_level1_metric, color: 'text-amber-400' },
                                    { level: 2, text: assessment.certification_level2_metric, color: 'text-blue-400' },
                                    { level: 3, text: assessment.certification_level3_metric, color: 'text-emerald-400' },
                                  ].map(({ level, text, color }) => (
                                    <div key={level} className={`flex gap-1.5 text-[10px] ${sc.score === level ? color : 'text-gray-600'}`}>
                                      <span className="font-bold flex-shrink-0">{sc.score === level ? '▶' : ' '} L{level}:</span>
                                      <span>{text}</span>
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

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setView('build')}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-violet-300 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 rounded-xl transition-colors">
                    <Cpu size={15} /> Continue Building
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || !hasCode}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl disabled:opacity-50 transition-colors">
                    {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isEvaluating ? 'Re-evaluating…' : 'Re-evaluate'}
                  </button>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors ml-auto">
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
                <XCircle size={48} className="text-amber-400 mx-auto" />
                <h2 className="text-lg font-bold text-white">{lvl <= 1 ? 'Not ready yet.' : 'Certificate Not Yet Available'}</h2>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                  {lvl <= 1 ? 'You need Proficient (2/3) in all criteria. Keep building and improving.' : 'A Proficient score (2+) on all criteria required. Build more and re-evaluate.'}
                </p>
                <button onClick={() => setView('results')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl">
                  <BarChart3 size={16} /> View Results
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {renderVoiceBar(lvl <= 1
                  ? 'Congratulations! You passed the AI Workflow Development Certification.'
                  : 'Congratulations on passing the AI Workflow Development Certification.')}

                {/* Preview */}
                <div className="p-6 bg-gradient-to-br from-violet-900/40 via-purple-900/30 to-indigo-900/20 border-2 border-violet-500/40 rounded-2xl text-center space-y-4 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #7c3aed 0, #7c3aed 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
                  <div className="relative">
                    <div className="flex justify-center mb-3"><Trophy size={44} className="text-amber-400" /></div>
                    <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">Certificate of Achievement</p>
                    <p className="text-lg font-bold text-white mt-1">AI Workflow Development Certification</p>
                    <p className="text-violet-300 text-sm">React + Anthropic API · {scoreLabel(Math.min(...assessmentScores.map(s => s.score ?? 0))).text} Level</p>
                    <div className="my-4 h-px bg-violet-500/30" />
                    <p className="text-gray-400 text-xs">Awarded to</p>
                    <p className="text-2xl font-bold text-white mt-1">{certName || '[ Your Name ]'}</p>
                    <p className="text-gray-400 text-xs mt-1">{branding.institutionName}</p>
                    <div className="my-4 h-px bg-violet-500/30" />
                    <div className="grid grid-cols-2 gap-2 text-left">
                      {assessmentScores.map(sc => {
                        const sl = scoreLabel(sc.score);
                        return (
                          <div key={sc.assessment_name} className={`px-2.5 py-1.5 rounded-lg border text-xs ${sl.bg} ${sl.border}`}>
                            <p className={`font-bold ${sl.color}`}>{sc.assessment_name}</p>
                            <p className="text-gray-400">{sc.score}/3 — {sl.text}</p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-3">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">Full name for the certificate:</label>
                    <input type="text" value={certName} onChange={e => setCertName(e.target.value)} placeholder="e.g. Amara Okoye"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm outline-none focus:border-violet-500 transition-colors" />
                  </div>
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl disabled:opacity-50 hover:scale-[1.01] transition-all">
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

export default AIWorkflowDevCertificationPage;