// src/pages/tech-skills/FullStackCertificationPage.tsx
//
// Full-Stack Development Certification — React + Supabase
// Framework: mirrors WebDevCertificationPage + adds full-stack features from
//            FullStackDevelopmentPage (credentials panel, table viewer, SQL runner)
// No guided task system — student builds freely; rubric criteria shown throughout.
//
// API routes needed:
//   /api/generate-fullstack-code   (reuses the FullStackDevelopmentPage code-gen route)
//
// Dashboard columns (all new — see SQL file):
//   fs_cert_session_id  (text)
//   fs_cert_pages       (jsonb) — project files
//   fs_cert_evaluation  (jsonb) — per-criterion scores
// Activity stored as: 'Full Stack Development Certification'

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
  Database, Layers, Award, Trophy, CheckCircle, XCircle,
  Loader2, Download, ExternalLink, Star, Table2,
  ChevronDown, ChevronRight, FileCode, Volume2, VolumeX,
  Wand2, AlertCircle, Copy, Check, ClipboardList,
  RefreshCw, X, Key, EyeOff, Eye,
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
interface SupaCreds { url: string; anonKey: string; }
type RightTab = 'code' | 'tables' | 'sql';
type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'Full Stack Development';
const CERT_ACTIVITY = 'Full Stack Development Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const LS_CREDS_KEY  = 'fs_cert_supabase_creds';

const STARTER_FILES: ProjectFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'my-fullstack-app', private: true, version: '0.0.0', type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: {
        'react': '^18.2.0', 'react-dom': '^18.2.0',
        'react-router-dom': '^6.21.0',
        '@supabase/supabase-js': '^2.39.0',
      },
      devDependencies: { '@vitejs/plugin-react': '^4.2.1', 'vite': '^5.0.8' },
    }, null, 2),
  },
  {
    path: 'vite.config.js',
    content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n`,
  },
  {
    path: '.env.example',
    content: `# Copy to .env and fill in your Supabase project values\n# Settings → API in your Supabase dashboard\n\nVITE_SUPABASE_URL=https://xxxx.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key-here\n`,
  },
  {
    path: 'index.html',
    content: `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>My Full-Stack App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
  },
  {
    path: 'src/main.jsx',
    content: `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App.jsx'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode><App /></React.StrictMode>,\n)\n`,
  },
  {
    path: 'src/lib/supabase.js',
    content: `import { createClient } from '@supabase/supabase-js'\n\nconst supabaseUrl = import.meta.env.VITE_SUPABASE_URL\nconst supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY\n\nexport const supabase = createClient(supabaseUrl, supabaseAnonKey)\n`,
  },
  {
    path: 'src/App.jsx',
    content: `import React from 'react'\n\nfunction App() {\n  return (\n    <div className="app">\n      <h1>My Full-Stack App</h1>\n      <p>Describe your app in the prompt box to start building!</p>\n    </div>\n  )\n}\n\nexport default App\n`,
  },
  {
    path: 'src/index.css',
    content: `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; }\n.app { max-width: 1200px; margin: 0 auto; padding: 2rem; }\n`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getLanguage = (path: string) => {
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.sql')) return 'sql';
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
  const [open, setOpen] = useState<Set<string>>(new Set(['src', 'src/lib', 'src/components', 'src/pages']));
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
            {open.has(node.path) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="text-amber-400 text-[10px]">📁</span>
            <span className="font-medium text-[11px]">{node.name}</span>
          </button>
        ) : (
          <button onClick={() => onSelect(node.path)}
            className={`w-full flex items-center gap-1.5 py-0.5 text-[11px] rounded transition-colors
              ${activeFile === node.path ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'}`}
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

// ─── Table Viewer ─────────────────────────────────────────────────────────────

const TableViewerPanel: React.FC<{ creds: SupaCreds | null }> = ({ creds }) => {
  const [tables, setTables]         = useState<string[]>([]);
  const [selected, setSelected]     = useState<string | null>(null);
  const [rows, setRows]             = useState<any[]>([]);
  const [cols, setCols]             = useState<string[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const fetchTables = useCallback(async () => {
    if (!creds?.url || !creds?.anonKey) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${creds.url}/rest/v1/`, { headers: { 'apikey': creds.anonKey, 'Authorization': `Bearer ${creds.anonKey}` } });
      if (!res.ok) throw new Error(`Connection failed (${res.status})`);
      const spec = await res.json();
      const names = Object.keys(spec?.definitions || spec?.paths || {}).filter(k => !k.startsWith('/') && !k.includes('{')).sort();
      setTables(names);
      if (!names.length) setError('No tables found yet. Create your tables first using the SQL tab.');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [creds]);

  const fetchRows = useCallback(async (t: string) => {
    if (!creds?.url || !creds?.anonKey) return;
    setLoading(true); setError(null); setRows([]); setCols([]);
    try {
      const res = await fetch(`${creds.url}/rest/v1/${t}?limit=50`, {
        headers: { 'apikey': creds.anonKey, 'Authorization': `Bearer ${creds.anonKey}`, 'Accept': 'application/json' },
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.message || `Failed (${res.status})`); }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setCols(data.length > 0 ? Object.keys(data[0]) : []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [creds]);

  useEffect(() => { if (creds?.url && creds?.anonKey) fetchTables(); }, [creds, fetchTables]);
  useEffect(() => { if (selected) fetchRows(selected); }, [selected, fetchRows]);

  if (!creds?.url) return (
    <div className="flex-1 flex items-center justify-center text-center p-6">
      <div><Database size={32} className="text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Enter your Supabase credentials to connect</p></div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-40 flex-shrink-0 border-r border-gray-700 flex flex-col" style={{ background: '#161820' }}>
        <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-gray-700 flex-shrink-0">
          <p className="text-[9px] font-bold text-gray-600 uppercase">Tables</p>
          <button onClick={fetchTables} disabled={loading} className="text-gray-600 hover:text-emerald-400 disabled:opacity-40 transition-colors">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {loading && !tables.length && <div className="flex items-center gap-1.5 px-3 py-2"><Loader2 size={11} className="animate-spin text-emerald-400" /><span className="text-[10px] text-gray-500">Loading…</span></div>}
          {tables.map(t => (
            <button key={t} onClick={() => setSelected(t)}
              className={`w-full text-left flex items-center gap-1.5 px-3 py-1 text-[11px] rounded transition-colors ${selected === t ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'}`}>
              <Table2 size={10} className="flex-shrink-0" /><span className="truncate">{t}</span>
            </button>
          ))}
          {!loading && !tables.length && !error && <p className="text-[10px] text-gray-600 px-3 py-2">No tables yet</p>}
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {error && <div className="m-3 p-3 bg-red-500/10 border border-red-500/25 rounded-lg flex gap-2"><AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-red-300">{error}</p></div>}
        {!selected && !error && <div className="flex-1 flex items-center justify-center"><div className="text-center"><Table2 size={28} className="text-gray-600 mx-auto mb-2" /><p className="text-xs text-gray-500">Select a table to view rows</p></div></div>}
        {selected && !error && (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0 bg-gray-800/50">
              <div className="flex items-center gap-2"><Table2 size={13} className="text-emerald-400" /><span className="text-xs font-semibold text-white">{selected}</span>{rows.length > 0 && <span className="text-[10px] text-gray-500">{rows.length} rows</span>}</div>
              <button onClick={() => fetchRows(selected)} disabled={loading} className="text-gray-600 hover:text-emerald-400 disabled:opacity-40 transition-colors"><RefreshCw size={11} className={loading ? 'animate-spin' : ''} /></button>
            </div>
            {loading ? <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-emerald-400" /></div>
              : rows.length === 0 ? <div className="flex-1 flex items-center justify-center"><div className="text-center"><Table2 size={24} className="text-gray-600 mx-auto mb-2" /><p className="text-xs text-gray-500">Table is empty</p></div></div>
              : (
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-gray-800 sticky top-0 z-10">
                      <tr>{cols.map(c => <th key={c} className="text-left px-3 py-1.5 text-gray-400 font-semibold border-b border-gray-700 whitespace-nowrap">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-800/20'}>
                          {cols.map(c => <td key={c} className="px-3 py-1.5 text-gray-300 border-b border-gray-800/60 whitespace-nowrap max-w-[180px] truncate">{row[c] === null ? <span className="text-gray-600 italic">null</span> : typeof row[c] === 'object' ? <span className="text-blue-400">{JSON.stringify(row[c]).slice(0, 40)}</span> : String(row[c]).slice(0, 60)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── SQL Runner ───────────────────────────────────────────────────────────────

const SqlRunnerPanel: React.FC<{ creds: SupaCreds | null; generatedSql: string }> = ({ creds, generatedSql }) => {
  const [sql, setSql]       = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [cols, setCols]     = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (generatedSql) { setSql(generatedSql); setResults(null); setError(null); } }, [generatedSql]);

  const handleCopy = () => { navigator.clipboard.writeText(sql).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };

  const openDashboard = () => {
    if (!creds?.url) return;
    const ref = creds.url.replace('https://', '').split('.')[0];
    window.open(`https://supabase.com/dashboard/project/${ref}/sql/new`, '_blank');
  };

  const handleRunSelect = useCallback(async () => {
    if (!creds?.url || !creds?.anonKey) { setError('Connect Supabase first'); return; }
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) { setError('Direct execution only works for SELECT. For CREATE TABLE, INSERT etc — copy the SQL and paste it into your Supabase Dashboard SQL Editor.'); return; }
    const match = sql.match(/FROM\s+["']?(\w+)["']?/i);
    if (!match) { setError('Could not determine table name from SELECT.'); return; }
    setLoading(true); setError(null); setResults(null);
    try {
      const res = await fetch(`${creds.url}/rest/v1/${match[1]}?limit=100`, { headers: { 'apikey': creds.anonKey, 'Authorization': `Bearer ${creds.anonKey}`, 'Accept': 'application/json' } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.message || `Failed (${res.status})`); }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setCols(data.length ? Object.keys(data[0]) : []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [sql, creds]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0 bg-gray-800/50">
        <span className="text-[10px] font-bold text-gray-500 uppercase">SQL</span>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors px-1.5 py-0.5 rounded">
            {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
          </button>
          {creds?.url && <button onClick={openDashboard} className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors px-1.5 py-0.5 rounded"><ExternalLink size={10} /> Open Dashboard</button>}
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-2">
        <textarea value={sql} onChange={e => setSql(e.target.value)} rows={8}
          placeholder="-- SQL will appear here as the AI generates it.\n-- Copy and paste into your Supabase Dashboard SQL Editor."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono resize-none outline-none focus:border-emerald-500 leading-relaxed flex-shrink-0" />
        <div className="flex gap-2">
          <button onClick={handleRunSelect} disabled={loading || !sql.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-40 transition-colors">
            {loading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />} Run SELECT
          </button>
          {creds?.url && <button onClick={openDashboard} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 border border-gray-600 hover:border-emerald-500 rounded-lg transition-colors">
            <ExternalLink size={11} /> Dashboard Editor
          </button>}
        </div>
        <p className="text-[9px] text-gray-600">SELECT queries run directly. For CREATE TABLE / INSERT / UPDATE — copy SQL → Supabase Dashboard → SQL Editor.</p>
        {error && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2"><AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-red-300">{error}</p></div>}
        {results && (
          <div className="flex-1 overflow-auto border border-gray-700 rounded-lg">
            {results.length === 0 ? <p className="text-xs text-gray-500 p-3 text-center">No results</p> : (
              <table className="w-full text-[10px] border-collapse">
                <thead className="bg-gray-800 sticky top-0"><tr>{cols.map(c => <th key={c} className="text-left px-2 py-1 text-gray-400 font-semibold border-b border-gray-700 whitespace-nowrap">{c}</th>)}</tr></thead>
                <tbody>{results.map((row, i) => <tr key={i} className={i % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-800/20'}>{cols.map(c => <td key={c} className="px-2 py-1 text-gray-300 border-b border-gray-800/50 whitespace-nowrap max-w-[150px] truncate">{row[c] === null ? <span className="text-gray-600 italic">null</span> : String(row[c]).slice(0, 60)}</td>)}</tr>)}</tbody>
              </table>
            )}
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

const FullStackCertificationPage: React.FC = () => {
  const { user } = useAuth();

  const [view, setView] = useState<ViewMode>('overview');

  // ── Assessments ───────────────────────────────────────────────────────
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [loadingData,      setLoadingData]      = useState(true);
  const [dataError,        setDataError]        = useState<string | null>(null);

  // ── Personality ───────────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState(1);

  // ── Voice narration + Branding ───────────────────────────────────────────
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
  const [sessionName,    setSessionName]    = useState('My Full-Stack App');
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Project files ─────────────────────────────────────────────────────
  const [projectFiles,   setProjectFiles]   = useState<ProjectFile[]>(STARTER_FILES);
  const [activeFilePath, setActiveFilePath] = useState('src/App.jsx');
  const activeFile = projectFiles.find(f => f.path === activeFilePath) ?? projectFiles[0];

  // ── Supabase credentials ──────────────────────────────────────────────
  const [creds, setCreds] = useState<SupaCreds>(() => {
    try { const s = localStorage.getItem(LS_CREDS_KEY); return s ? JSON.parse(s) : { url: '', anonKey: '' }; }
    catch { return { url: '', anonKey: '' }; }
  });
  const [showKey,    setShowKey]    = useState(false);
  const [credStatus, setCredStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [credMsg,    setCredMsg]    = useState('');
  const [showCredPanel, setShowCredPanel] = useState(false);

  const updateCreds = (c: SupaCreds) => {
    setCreds(c); setCredStatus('idle');
    try { localStorage.setItem(LS_CREDS_KEY, JSON.stringify(c)); } catch {}
  };

  const testCreds = async () => {
    if (!creds.url || !creds.anonKey) return;
    setCredStatus('testing');
    try {
      const res = await fetch(`${creds.url}/rest/v1/`, { headers: { 'apikey': creds.anonKey, 'Authorization': `Bearer ${creds.anonKey}` } });
      if (res.ok) { setCredStatus('ok'); setCredMsg('Connected!'); }
      else { setCredStatus('fail'); setCredMsg(`Error ${res.status}`); }
    } catch { setCredStatus('fail'); setCredMsg('Network error'); }
  };

  // ── Right tab ─────────────────────────────────────────────────────────
  const [rightTab, setRightTab]   = useState<RightTab>('code');
  const [generatedSql, setGeneratedSql] = useState('');

  // ── Vibe coding ───────────────────────────────────────────────────────
  const [prompt,        setPrompt]        = useState('');
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [genError,      setGenError]      = useState<string | null>(null);
  const [explanation,   setExplanation]   = useState<string | null>(null);
  const [copied,        setCopied]        = useState(false);
  const [expandedCrit,  setExpandedCrit]  = useState<string | null>(null);

  // ── Evaluation ────────────────────────────────────────────────────────
  const [isEvaluating,  setIsEvaluating]  = useState(false);
  const [evalError,     setEvalError]     = useState<string | null>(null);
  const [evalProgress,  setEvalProgress]  = useState('');
  const [downloading,   setDownloading]   = useState(false);

  // ── Certificate ───────────────────────────────────────────────────────
  const [certName,      setCertName]      = useState('');
  const [isGenCert,     setIsGenCert]     = useState(false);
  const [showSBModal,   setShowSBModal]   = useState(false);

  const lvl            = communicationLevel;
  const allProficient  = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored      = assessmentScores.some(s => s.score !== null);
  const overallAvg     = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;
  const hasSubstantialCode = projectFiles.some(f => f.path.startsWith('src/') && f.content.length > 100 && f.path !== 'src/index.css');

  const speak = (text: string) => hookSpeak(text.slice(0, 400));
  const stopSpeaking = () => cancelSpeech();

  const renderVoiceBar = (textToRead: string) => (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-800/40 border border-gray-700 rounded-xl mb-4">
      <span className="text-xs font-semibold text-gray-400 flex items-center gap-1"><Volume2 size={13} className="text-emerald-400" /> Voice:</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-600">
        {(['english', 'pidgin'] as const).map(m => (
          <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all border-r border-gray-600 last:border-0 ${voiceMode === m ? (m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}>
            {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
          </button>
        ))}
      </div>
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${isSpeaking ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'}`}>
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

      const evalData = dash?.fs_cert_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score:    evalData?.scores?.[a.assessment_name]?.score ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      if (dash?.fs_cert_pages?.length) {
        const files = (dash.fs_cert_pages as any[]).map((p: any) => ({ path: p.path || p.name, content: p.content || '' }));
        if (files.length) setProjectFiles(files);
      }
      if (dash?.fs_cert_session_id) { setSessionId(dash.fs_cert_session_id); sessionIdRef.current = dash.fs_cert_session_id; }

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
        fs_cert_session_id: sid,
        fs_cert_pages: STARTER_FILES.map(f => ({ path: f.path, content: f.content })),
        fs_cert_evaluation: {},
      });
    }
    return sid;
  }, [user?.id]);

  // ── Persist project ───────────────────────────────────────────────────
  const persistProject = useCallback(async (files: ProjectFile[]) => {
    const sid = sessionIdRef.current; if (!user?.id || !sid) return;
    await supabase.from('dashboard').update({
      fs_cert_pages: files.map(f => ({ path: f.path, content: f.content })),
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('fs_cert_session_id', sid);
  }, [user?.id]);

  // ── Generate code ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setGenError(null); setExplanation(null);
    await ensureRecord();
    const hasCode = projectFiles.some(f => f.path.startsWith('src/') && f.content.length > 100 && f.path !== 'src/index.css');
    try {
      const res = await fetch('/api/generate-fullstack-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          action: hasCode ? 'iterate' : 'generate',
          prompt: prompt.trim(),
          projectFiles: projectFiles.map(f => ({ path: f.path, content: f.content })),
          sessionContext: { appName: sessionName, supabaseUrl: creds.url || '' },
          communicationLevel,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const result = await res.json();
      const updatedFiles = result.files ? mergeFiles(projectFiles, result.files) : projectFiles;
      setProjectFiles(updatedFiles);
      if (result.sql) { setGeneratedSql(result.sql); setRightTab('sql'); }
      else if (result.files?.length) {
        const main = result.files.find((f: any) => f.path === 'src/App.jsx' || f.path.includes('App'));
        if (main) setActiveFilePath(main.path);
        setRightTab('code');
      }
      setExplanation(result.explanation || null);
      setPrompt('');
      await persistProject(updatedFiles);
    } catch (err: any) { setGenError(err.message || 'Something went wrong'); }
    finally { setIsGenerating(false); }
  }, [prompt, isGenerating, projectFiles, sessionName, creds.url, communicationLevel, ensureRecord, persistProject]);

  // ── Evaluate against rubric ───────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (!user?.id || isEvaluating) return;
    setIsEvaluating(true); setEvalError(null);
    await ensureRecord();

    const codeBundle = projectFiles
      .filter(f => f.content.trim().length > 10)
      .map(f => `// === ${f.path} ===\n${f.content}`)
      .join('\n\n');

    const hasAuth = codeBundle.includes('auth') || codeBundle.includes('signIn') || codeBundle.includes('signUp');
    const hasRLS  = codeBundle.includes('RLS') || codeBundle.includes('row level') || codeBundle.includes('policy') || codeBundle.toLowerCase().includes('rls');
    const hasCRUD = (codeBundle.includes('.from(') && (codeBundle.includes('.insert(') || codeBundle.includes('.update(') || codeBundle.includes('.delete(')));
    const hasSelect = codeBundle.includes('.select(');
    const hasSupabaseClient = codeBundle.includes('createClient') || codeBundle.includes('supabase');

    const contextNote = [
      hasSupabaseClient ? '✓ Supabase client present' : '✗ No Supabase client detected',
      hasSelect ? '✓ SELECT (read) operations present' : '✗ No SELECT operations',
      hasCRUD ? '✓ Write operations (INSERT/UPDATE/DELETE) present' : '✗ No write operations',
      hasAuth ? '✓ Authentication code present' : '✗ No authentication code',
      hasRLS ? '✓ RLS-related code or comments present' : '✗ No RLS evidence',
      creds.url ? `✓ Supabase project URL configured: ${creds.url}` : '✗ No Supabase URL configured',
    ].join('\n');

    const scores: Record<string, { score: number; evidence: string }> = {};
    const newScores: AssessmentScore[] = [];

    try {
      for (const assessment of assessments) {
        setEvalProgress(`Evaluating: ${assessment.assessment_name}…`);

        const evalPrompt = `You are evaluating a student's React + Supabase full-stack app for the "${assessment.assessment_name}" criterion.

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

Evaluate the code against this specific criterion. Score holistically — consider intent, structure, and execution. Note that some criteria (auth, RLS) may score at Level 1 even if partially implemented.

Respond ONLY in this JSON format:
{
  "score": <0, 1, 2, or 3>,
  "evidence": "<2-4 sentences with specific references to the code>"
}`;

        const result = await chatJSON({ page: 'FullStackCertificationPage',
          messages: [{ role: 'user', content: evalPrompt }],
          system: 'You are an expert full-stack web development educator evaluating student code. Be fair, specific, and constructive.',
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
        fs_cert_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg: avgCalc },
        progress: allPass ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('fs_cert_session_id', sessionIdRef.current!);

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
  }, [user?.id, isEvaluating, projectFiles, assessments, creds.url, ensureRecord]);

  // ── Download ZIP ──────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const { default: JSZip } = await import('jszip' as any);
      const zip = new JSZip();
      for (const f of projectFiles) zip.file(f.path, f.content);
      zip.file('README.md', `# ${sessionName}\n\nReact + Supabase full-stack app — Davidson AI Innovation Center.\n\n## Setup\n\n1. \`cp .env.example .env\` and fill in your Supabase credentials\n2. \`npm install\`\n3. \`npm run dev\`\n`);
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

      // Borders — teal/database theme
      doc.setLineWidth(3); doc.setDrawColor(20, 184, 166); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(16, 185, 129); doc.rect(15, 15, W - 30, H - 30);

      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 184, 166);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });
      doc.setFontSize(20); doc.setTextColor(16, 185, 129);
      doc.text(`Full-Stack Development Certification — ${certLevel}`, W / 2, 43, { align: 'center' });
      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });
      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });
      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the Full-Stack Development Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to build a database-connected React application', W / 2, 95, { align: 'center' });
      doc.text('using Supabase (PostgreSQL), authentication, and Row Level Security.', W / 2, 102, { align: 'center' });
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 184, 166);
      doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel} · React + Supabase`, W / 2, 112, { align: 'center' });

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
      doc.text(`Certification ID: FS-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-FullStack-Certificate.pdf`);
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
          <Loader2 size={36} className="animate-spin text-teal-400" />
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
              <h2 className="text-base font-bold text-white flex items-center gap-2"><ExternalLink size={16} className="text-teal-400" /> Open in StackBlitz</h2>
              <button onClick={() => setShowSBModal(false)} className="p-1 text-gray-400 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-300">Your project will open in StackBlitz for live preview. Note: Supabase integration requires adding your env variables there too.</p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">⚠️ Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in StackBlitz settings for the DB connection to work.</div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => { handleOpenStackBlitz(); setShowSBModal(false); }}
                className="flex-1 py-2.5 text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl transition-colors">Open in StackBlitz →</button>
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
              <Database size={18} className="text-teal-400" />
              <span className="text-sm font-bold text-white">Full-Stack Certification</span>
            </div>
            {view !== 'overview' && (
              <>
                <div className="w-px h-5 bg-gray-600" />
                <input className="text-sm text-gray-300 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-teal-500 outline-none px-1 py-0.5 w-44"
                  value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="App name…" />
              </>
            )}
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors
                    ${view === v ? 'bg-teal-500/20 text-teal-300 border-teal-500/40' : 'text-gray-600 border-gray-700 hover:text-gray-300 hover:border-gray-500'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '🗄️ Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
                </button>
              ))}
            </div>
            {/* Supabase connection badge */}
            {creds.url && credStatus === 'ok' && (
              <div className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/25 rounded-full flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-medium">Supabase connected</span>
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
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${creds.url ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' : 'text-gray-400 border-gray-600 hover:text-gray-200 hover:bg-gray-700'}`}>
                  <Key size={12} /> {creds.url ? 'Supabase ✓' : 'Add Supabase'}
                </button>
                <button onClick={() => setShowSBModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-teal-300 border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 rounded-lg transition-colors">
                  <ExternalLink size={12} /> Preview
                </button>
                <button onClick={handleDownload} disabled={downloading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                  {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} .zip
                </button>
                <button onClick={handleEvaluate} disabled={isEvaluating || !hasSubstantialCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-lg shadow disabled:opacity-50 transition-colors">
                  {isEvaluating ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />}
                  {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit for Evaluation'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Supabase credentials panel ─────────────────────────────── */}
        {showCredPanel && view === 'build' && (
          <div className="flex-shrink-0 px-4 py-3 bg-gray-800/80 border-b border-gray-700">
            <div className="max-w-2xl flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Supabase Project URL</label>
                <input type="text" value={creds.url} onChange={e => updateCreds({ ...creds, url: e.target.value })}
                  placeholder="https://xxxx.supabase.co"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-teal-500 font-mono" />
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Anon Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={creds.anonKey} onChange={e => updateCreds({ ...creds, anonKey: e.target.value })}
                    placeholder="eyJhbGciOiJ…"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 pr-8 text-xs text-white placeholder-gray-600 outline-none focus:border-teal-500 font-mono" />
                  <button onClick={() => setShowKey(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 text-[10px]">
                    {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={testCreds} disabled={!creds.url || !creds.anonKey || credStatus === 'testing'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                  {credStatus === 'testing' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />} Test
                </button>
                {credStatus === 'ok'   && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> {credMsg}</span>}
                {credStatus === 'fail' && <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={11} /> {credMsg}</span>}
                <button onClick={() => setShowCredPanel(false)} className="text-gray-500 hover:text-gray-300 ml-1"><X size={14} /></button>
              </div>
            </div>
            <p className="text-[9px] text-gray-600 mt-1.5">Settings → API in your Supabase dashboard · Stored in your browser only · Required to use the Tables and SQL tabs</p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            OVERVIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {dataError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-2 text-sm text-red-300">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{dataError}
              </div>
            )}

            {renderVoiceBar(lvl <= 1
              ? 'Welcome to the Full-Stack Development Certification. You will build a real app connected to a database, then be evaluated.'
              : 'Welcome to the Full-Stack Development Certification. Build a React + Supabase application demonstrating schema design, CRUD operations, authentication, and Row Level Security.')}

            {/* Hero */}
            <div className="p-6 bg-gradient-to-br from-teal-600/20 via-emerald-600/15 to-green-600/10 border border-teal-500/30 rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-teal-600/30 rounded-xl"><Database size={24} className="text-teal-300" /></div>
                <div>
                  <h1 className="text-xl font-bold text-white">Full-Stack Development Certification</h1>
                  <p className="text-teal-300 text-sm">React + Supabase · PostgreSQL · Authentication · RLS</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="React + Supabase · PostgreSQL · Authentication · RLS"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you build a real app that stores data in a database. You will connect React to Supabase, create tables, read and write data, and protect it with user logins and security rules. You are judged on how well your app works, how your database is designed, and how secure it is.'
                  : 'Demonstrate full-stack development skills by building a production-ready React + Supabase application. Evaluation covers database schema design, Supabase integration, CRUD operations, user authentication, Row Level Security policies, and overall code quality.'}
              </p>
            </div>

            {/* Architecture diagram */}
            <div className="bg-gray-900 rounded-xl p-4 mb-5 border border-gray-700 font-mono text-xs leading-relaxed">
              <p className="text-teal-400 font-bold mb-2 text-[10px] uppercase">Your Full-Stack Architecture</p>
              <div className="text-sky-300">🌐 React + Vite (frontend)</div>
              <div className="ml-3 text-gray-400">├── src/App.jsx <span className="text-gray-600">← UI components</span></div>
              <div className="ml-3 text-gray-400">└── src/lib/supabase.js <span className="text-gray-600">← database client</span></div>
              <div className="ml-3 text-gray-500 my-0.5">↕ REST API</div>
              <div className="text-purple-300">🗄️ Supabase (backend)</div>
              <div className="ml-3 text-gray-400">├── <span className="text-emerald-300">Tables</span> <span className="text-gray-600">← PostgreSQL data</span></div>
              <div className="ml-3 text-gray-400">├── <span className="text-emerald-300">Auth</span> <span className="text-gray-600">← login / signup</span></div>
              <div className="ml-3 text-gray-400">└── <span className="text-emerald-300">RLS Policies</span> <span className="text-gray-600">← security rules</span></div>
            </div>

            {/* Rules */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">📋 Certification Requirements</p>
              <div className="space-y-2">
                {[
                  { icon: '✅', text: lvl <= 1 ? 'Create a free Supabase account and a new project.' : 'Create a Supabase project and connect it using your URL and Anon Key in the Credentials panel.' },
                  { icon: '✅', text: lvl <= 1 ? 'Design and create at least one database table.' : 'Design a meaningful database schema with at least one table. SQL for table creation will appear in the SQL tab.' },
                  { icon: '✅', text: lvl <= 1 ? 'Make your React app read data from the database.' : 'Implement at least SELECT (read) operations — fetching data from Supabase and displaying it in React.' },
                  { icon: '✅', text: lvl <= 1 ? 'Let users add or change data.' : 'Implement write operations — INSERT, UPDATE, or DELETE via forms or UI actions.' },
                  { icon: '✅', text: lvl <= 1 ? 'Add a login system so users can sign in.' : 'Implement Supabase Auth — email/password or social login, session handling.' },
                  { icon: '⭐', text: lvl <= 1 ? 'Bonus: Add security rules (RLS) to protect the data.' : 'RLS policies are expected at Advanced level. Even partial implementation scores above No Evidence.' },
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">{rule.icon}</span>
                    <span className="text-gray-300">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Assessment criteria */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">🎯 What You Will Be Evaluated On</p>
              {assessments.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Loading criteria…</p>
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
              <div className="p-4 bg-teal-500/10 border border-teal-500/30 rounded-xl mb-5 flex items-center gap-4">
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
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl transition-all hover:scale-[1.01] shadow-lg">
                {hasSubstantialCode ? <><RefreshCw size={16} /> Continue Building</> : <><Database size={16} /> Start Building</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-teal-300 border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 rounded-xl transition-colors">
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
              <div className="flex-shrink-0 px-4 py-3 border-b border-teal-500/30 bg-teal-500/10">
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className="text-teal-400" />
                  <p className="text-sm font-bold text-teal-300">Vibe Coding</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {lvl <= 1 ? 'Describe what you want to build or change.' : 'Describe your app, schema, or features — AI generates React + SQL code.'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {genError && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2"><AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" /><p className="text-xs text-red-300">{genError}</p></div>}
                {evalError && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2"><AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" /><p className="text-xs text-red-300">{evalError}</p></div>}

                {explanation && (
                  <div className="p-2.5 bg-teal-500/10 border border-teal-500/20 rounded-lg">
                    <p className="text-[9px] font-bold text-teal-400 uppercase mb-1">What was built</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{explanation}</p>
                  </div>
                )}

                <div>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    placeholder={lvl <= 1
                      ? 'e.g. Create a table to store student names and scores. Show them in a list.'
                      : 'e.g. Create a posts table with id, user_id, title, content, created_at. Add RLS so users can only see their own posts. Show posts in a React component with an insert form.'}
                    rows={7}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-teal-500 transition-colors leading-relaxed" />
                  <p className="text-[9px] text-gray-700 mt-0.5">Ctrl+Enter to generate · SQL appears in SQL tab · Code appears in Code tab</p>
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
                        <div key={a.certification_id} className={`rounded-lg border overflow-hidden ${isOpen ? 'border-teal-500/40' : 'border-gray-700'}`}>
                          <button onClick={() => setExpandedCrit(isOpen ? null : a.certification_id)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800/60 hover:bg-gray-700/60 text-left transition-colors">
                            <ScoreRing score={sc?.score ?? null} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{a.assessment_name}</p>
                              {sc?.score !== null && <span className={`text-[9px] font-bold ${sl.color}`}>{sl.text}</span>}
                            </div>
                            {isOpen ? <ChevronDown size={12} className="text-gray-500 flex-shrink-0" /> : <ChevronRight size={12} className="text-gray-500 flex-shrink-0" />}
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
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl disabled:opacity-40 transition-colors">
                  {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                  {isGenerating ? (lvl <= 1 ? 'Building…' : 'Generating…') : (lvl <= 1 ? 'Build It!' : 'Generate Code + SQL')}
                </button>
              </div>
            </div>

            {/* ── Right: Code / Tables / SQL ────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center gap-1 px-3 py-2 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
                {[
                  { id: 'code' as RightTab,   label: 'Code',   icon: <FileCode size={12} /> },
                  { id: 'tables' as RightTab, label: 'Tables', icon: <Table2 size={12} /> },
                  { id: 'sql' as RightTab,    label: 'SQL',    icon: <Database size={12} /> },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setRightTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all
                      ${rightTab === tab.id ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/40'}`}>
                    {tab.icon} {tab.label}
                    {tab.id === 'sql' && generatedSql && rightTab !== 'sql' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" />}
                  </button>
                ))}
                {rightTab === 'code' && (
                  <div className="ml-auto flex items-center gap-2">
                    <FileCode size={12} className="text-teal-400" />
                    <span className="text-xs text-gray-400 truncate max-w-36">{activeFilePath}</span>
                    <button onClick={() => navigator.clipboard.writeText(activeFile?.content || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-700 rounded">
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
                {rightTab === 'tables' && (
                  <div className="flex-1 overflow-hidden">
                    <TableViewerPanel creds={creds.url && creds.anonKey ? creds : null} />
                  </div>
                )}
                {rightTab === 'sql' && (
                  <div className="flex-1 overflow-hidden">
                    <SqlRunnerPanel creds={creds.url && creds.anonKey ? creds : null} generatedSql={generatedSql} />
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
              ? `Your Full-Stack Certification results. Overall average: ${overallAvg?.toFixed(1)} out of 3.`
              : 'Submit your project for evaluation to see results.')}

            {!anyScored ? (
              <div className="text-center py-16 space-y-4">
                <Database size={48} className="text-gray-600 mx-auto" />
                <p className="text-gray-400">{lvl <= 1 ? 'You have not been evaluated yet. Go to Build and create your app first.' : 'No evaluation data yet. Build your app and submit for evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl">
                  <Database size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-5 p-5 bg-gradient-to-br from-teal-600/20 to-emerald-600/10 border border-teal-500/30 rounded-2xl">
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
                          {isOpen ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
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
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-teal-300 border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 rounded-xl">
                    <Database size={15} /> Continue Building
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || !hasSubstantialCode}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl disabled:opacity-50">
                    {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isEvaluating ? 'Re-evaluating…' : 'Re-evaluate'}
                  </button>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl ml-auto">
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
                  {lvl <= 1 ? 'You need Proficient (2/3) in all criteria. Keep building and improving.' : 'A Proficient score (2+) on all criteria is required. Build more features and re-evaluate.'}
                </p>
                <button onClick={() => setView('results')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl">
                  <Database size={16} /> View Results
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {renderVoiceBar(lvl <= 1
                  ? 'Congratulations! You passed the Full-Stack Development Certification.'
                  : 'Congratulations on passing the Full-Stack Development Certification.')}

                {/* Preview */}
                <div className="p-6 bg-gradient-to-br from-teal-900/40 via-emerald-900/30 to-green-900/20 border-2 border-teal-500/40 rounded-2xl text-center space-y-4 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #14b8a6 0, #14b8a6 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
                  <div className="relative">
                    <div className="flex justify-center mb-3"><Trophy size={44} className="text-amber-400" /></div>
                    <p className="text-xs font-bold text-teal-400 uppercase tracking-widest">Certificate of Achievement</p>
                    <p className="text-lg font-bold text-white mt-1">Full-Stack Development Certification</p>
                    <p className="text-teal-300 text-sm">React + Supabase · {scoreLabel(Math.min(...assessmentScores.map(s => s.score ?? 0))).text} Level</p>
                    <div className="my-4 h-px bg-teal-500/30" />
                    <p className="text-gray-400 text-xs">Awarded to</p>
                    <p className="text-2xl font-bold text-white mt-1">{certName || '[ Your Name ]'}</p>
                    <p className="text-gray-400 text-xs mt-1">{branding.institutionName}</p>
                    <div className="my-4 h-px bg-teal-500/30" />
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
                    <input type="text" value={certName} onChange={e => setCertName(e.target.value)}
                      placeholder="e.g. Amara Okoye"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm outline-none focus:border-teal-500" />
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

export default FullStackCertificationPage;