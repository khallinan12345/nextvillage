// src/pages/admin/AdminStudentDashboard.tsx
//
// Admin view — platform admins select an org then view learners;
// org leaders see only their own org's learners.
//
// Tabs: Student Activity | Global Overview | Model Overview | Cost Overview | Per-Learner Cost
//
// ZERO useMemo calls — all computed inline to avoid React #310 errors.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import {
  Users, ChevronDown, Loader2, AlertCircle, RefreshCw,
  Award, BookOpen, CheckCircle, Clock, Circle,
  ChevronUp, Trophy, User, BarChart2, Code, Brain,
  Target, Lightbulb, MessageSquare, Cpu,
  DollarSign, TrendingUp, Zap, Activity,
  Server, Building2, Search, Globe, TrendingDown,
} from 'lucide-react';
import classNames from 'classnames';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import NewsManager from '../../components/news/NewsManager';

/* ═══════════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════════ */

interface Learner {
  id: string;
  name: string | null;
  email: string | null;
  grade_level: number | null;
  continent: string | null;
  country: string | null;
  organization_id?: string | null;
  join_code_used?: string | null;
}

interface ActivityRow {
  id: string;
  activity: string;
  category_activity: string;
  sub_category?: string | null;
  progress: string;
  updated_at: string;
  certificate_pdf_url?: string | null;
  web_dev_evaluation?: any;
  vibe_cert_evaluation?: any;
  [key: string]: any;
}

interface StudentSessionRow {
  user_id: string;
  category_activity: string | null;
  progress: string | null;
  activity: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CostRow {
  id: string;
  logged_at: string;
  page: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_hit_tokens: number;
  cache_write_tokens: number;
  estimated_cost_usd: number;
  user_id: string | null;
  city: string | null;
}

interface OrgOption {
  id: string;
  name: string;
  join_code: string;
  join_codes: string[] | null;
  continent: string | null;
  country: string | null;
  city: string | null;
  leader_id: string | null;
  learner_count?: number;
}

interface OrgSummaryRow {
  id: string;
  name: string;
  join_code: string;
  continent: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  leader_name: string | null;
  leader_email: string | null;
  learner_count: number;
  active_7d: number;
  active_30d: number;
}

type StudentSummary = {
  id: string;
  name: string;
  email: string;
  totalEngaged: number;
  currentMonthEngaged: number;
  byCategory: Record<string, number>;
  certAttempted: number;
  certAchieved: number;
  completionRate: number;
  lastActiveAt: string | null;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════════════════════════════════ */

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string; bar: string; light: string }> = {
  anthropic:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    bar: 'bg-blue-500',    light: 'bg-blue-100' },
  groq:       { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', light: 'bg-emerald-100' },
  gemini:     { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    bar: 'bg-cyan-500',    light: 'bg-cyan-100' },
  cerebras:   { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  bar: 'bg-orange-500',  light: 'bg-orange-100' },
  openrouter: { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200',    bar: 'bg-pink-500',    light: 'bg-pink-100' },
  mistral:    { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  bar: 'bg-violet-500',  light: 'bg-violet-100' },
};

const getProviderColor = (provider: string) =>
  PROVIDER_COLORS[provider] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', bar: 'bg-gray-500', light: 'bg-gray-100' };

const PRICING: Record<string, { input: number; output: number; label: string }> = {
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00, label: 'Sonnet 4.6' },
  'claude-haiku-4-5-20251001': { input: 1.00,  output: 5.00,  label: 'Haiku 4.5' },
  'llama-3.3-70b-versatile':   { input: 0.00,  output: 0.00,  label: 'Groq Llama 70B' },
  'gemini-2.0-flash':          { input: 0.00,  output: 0.00,  label: 'Gemini 2.0 Flash' },
  'llama-3.3-70b':             { input: 0.00,  output: 0.00,  label: 'Cerebras Llama 70B' },
  'meta-llama/llama-3.3-70b-instruct:free': { input: 0.00, output: 0.00, label: 'OpenRouter Llama 70B' },
  'mistral-small-latest':      { input: 0.00,  output: 0.00,  label: 'Mistral Small' },
};

const modelLabel = (m: string) => PRICING[m]?.label || m;

const fmtCost = (n: number) => n < 0.001 ? '<$0.001' : `$${n.toFixed(3)}`;

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`;

// Safety coercion: Supabase may return numeric(10,6) as a string in some environments
const numCost = (v: number | string): number => typeof v === 'number' ? v : parseFloat(String(v)) || 0;

const progressColor = (p: string) => {
  if (p === 'completed') return 'bg-green-100 text-green-800 border-green-200';
  if (p === 'started')   return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const progressIcon = (p: string) => {
  if (p === 'completed') return <CheckCircle size={13} className="text-green-600" />;
  if (p === 'started')   return <Clock size={13} className="text-yellow-600" />;
  return <Circle size={13} className="text-gray-400" />;
};

const scoreLabel = (s: number | null) => {
  if (s === null) return '—';
  return ['No Evidence', 'Emerging', 'Proficient ✓', 'Advanced ✓'][s] ?? `${s}`;
};

const categoryIcon = (cat: string) => {
  switch ((cat || '').toLowerCase()) {
    case 'certification':     return <Trophy size={15} className="text-purple-600" />;
    case 'ai learning':       return <Brain size={15} className="text-blue-600" />;
    case 'tech workshop':
    case 'vibe coding':       return <Code size={15} className="text-pink-600" />;
    case 'skills':            return <BookOpen size={15} className="text-indigo-600" />;
    case 'critical thinking': return <Target size={15} className="text-red-600" />;
    case 'creativity':        return <Lightbulb size={15} className="text-orange-500" />;
    case 'communication':     return <MessageSquare size={15} className="text-purple-500" />;
    case 'digital fluency':   return <Cpu size={15} className="text-cyan-600" />;
    default:                  return <BarChart2 size={15} className="text-gray-500" />;
  }
};

const extractCertScores = (row: ActivityRow): { label: string; score: number }[] =>
  Object.entries(row)
    .filter(([k, v]) =>
      k.startsWith('certification_') &&
      k.endsWith('_score') &&
      !k.startsWith('certification_evaluation_') &&
      v !== null && v !== undefined
    )
    .map(([k, v]) => ({
      label: k.replace('certification_', '').replace('_score', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      score: v as number,
    }));

const extractEvalScores = (row: ActivityRow): { label: string; score: number }[] =>
  Object.entries(row)
    .filter(([k, v]) =>
      k.startsWith('certification_evaluation_') &&
      k.endsWith('_score') &&
      v !== null && v !== undefined
    )
    .map(([k, v]) => ({
      label: k.replace('certification_evaluation_', '').replace('_score', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      score: v as number,
    }));

const normalizeCategory = (category: string | null | undefined): string => {
  const c = (category || '').trim();
  return c.length ? c : 'Uncategorized';
};

const isEngagedSession = (progress: string | null | undefined): boolean =>
  progress === 'started' || progress === 'completed';

function groupCostRows(rows: CostRow[], by: 'page' | 'model' | 'provider') {
  const map = new Map<string, { cost: number; calls: number; inTok: number; outTok: number; cacheHit: number; provider: string }>();
  rows.forEach(r => {
    const key = by === 'page' ? r.page : by === 'model' ? modelLabel(r.model) : r.provider;
    const existing = map.get(key) || { cost: 0, calls: 0, inTok: 0, outTok: 0, cacheHit: 0, provider: r.provider };
    map.set(key, {
      cost:     existing.cost + numCost(r.estimated_cost_usd),
      calls:    existing.calls + 1,
      inTok:    existing.inTok + r.input_tokens,
      outTok:   existing.outTok + r.output_tokens,
      cacheHit: existing.cacheHit + r.cache_hit_tokens,
      provider: r.provider,
    });
  });
  return [...map.entries()].sort((a, b) => b[1].cost - a[1].cost);
}

function getJoinCodesForOrg(orgs: OrgOption[], orgId: string): string[] {
  if (!orgId) return [];
  const org = orgs.find(o => o.id === orgId);
  if (!org) return [];
  if (Array.isArray(org.join_codes) && org.join_codes.length > 0) return org.join_codes;
  if (org.join_code) return [org.join_code];
  return [];
}

const ADMIN_IDS = new Set([
  '0e738663-a70e-4fd3-9ba6-718c02e116c2',
  '5d5e0486-e768-4c5d-ba63-d1e4570a352d',
  '8b3f70dc-e5d0-4eb0-af7d-ec6181968213',
]);

const DASHBOARD_ROLES = new Set(['leader', 'platform_administrator']);

const EXCLUDED_IDS = new Set([
  '0e738663-a70e-4fd3-9ba6-718c02e116c2',
  '8b3f70dc-e5d0-4eb0-af7d-ec6181968213',
  '5d5e0486-e768-4c5d-ba63-d1e4570a352d',
  '40e9daa6-7ec1-49a9-9be7-814a3d607d86',
  '73da14c1-e49a-4410-9390-6fe069fd7528',
  'f6157a9d-5ffd-4058-b0b3-af3ea897d876',
]);

/* ═══════════════════════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════════ */

const ScorePill: React.FC<{ score: number | null }> = ({ score }) => (
  <span className={classNames('text-xs px-2 py-0.5 rounded-full border font-medium', {
    'bg-emerald-50 text-emerald-700 border-emerald-200': score !== null && score >= 3,
    'bg-blue-50 text-blue-700 border-blue-200':           score !== null && score === 2,
    'bg-amber-50 text-amber-700 border-amber-200':        score !== null && score === 1,
    'bg-red-50 text-red-600 border-red-200':              score !== null && score === 0,
    'bg-gray-50 text-gray-400 border-gray-200':           score === null,
  })}>
    {scoreLabel(score)}
  </span>
);

const ProviderBadge: React.FC<{ provider: string }> = ({ provider }) => {
  const c = getProviderColor(provider);
  return (
    <span className={classNames('text-[10px] px-1.5 py-0.5 rounded border font-semibold', c.bg, c.text, c.border)}>
      {provider.charAt(0).toUpperCase() + provider.slice(1)}
    </span>
  );
};

/* ── OrgSelectorGrid ─────────────────────────────────────────────────────────── */

const OrgSelectorGrid: React.FC<{
  orgs: OrgOption[];
  onSelectOrg: (orgId: string) => void;
  onSelectAll: () => void;
  loading: boolean;
}> = ({ orgs, onSelectOrg, onSelectAll, loading }) => {
  const [search, setSearch] = useState('');

  const filtered = orgs.filter(o =>
    search === '' ||
    (o.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.country || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.city || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
        <Loader2 size={20} className="animate-spin" /> Loading organizations…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-bold text-gray-800">Select an Organization</h2>
        <button
          onClick={onSelectAll}
          className="ml-auto px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
        >
          All Organizations
        </button>
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by org name, country, or city…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(org => (
          <button
            key={org.id}
            onClick={() => onSelectOrg(org.id)}
            className="text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-purple-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} className="text-purple-500" />
              <span className="font-semibold text-gray-900 group-hover:text-purple-700 truncate">{org.name}</span>
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              {(org.country || org.city) && (
                <div className="flex items-center gap-1">
                  <Globe size={11} className="text-gray-400" />
                  {[org.city, org.country].filter(Boolean).join(', ')}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Users size={11} className="text-gray-400" />
                {org.learner_count ?? 0} learners
              </div>
              <div className="font-mono text-[10px] text-indigo-600 tracking-wider">{org.join_code}</div>
            </div>
          </button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">No organizations match your search.</div>
      )}
    </div>
  );
};

/* ── OrgBanner ───────────────────────────────────────────────────────────────── */

const OrgBanner: React.FC<{
  orgName: string;
  onBack: () => void;
  backLabel?: string;
}> = ({ orgName, onBack, backLabel = '← All Organizations' }) => (
  <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
    <Building2 size={16} className="text-indigo-600" />
    <span className="text-sm font-semibold text-indigo-800">Viewing: {orgName}</span>
    <button
      onClick={onBack}
      className="ml-auto text-xs text-indigo-600 hover:text-indigo-900 border border-indigo-300 rounded px-2.5 py-1 font-semibold"
    >
      {backLabel}
    </button>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   ActivityCard
   ═══════════════════════════════════════════════════════════════════════════════ */

const ActivityCard: React.FC<{ row: ActivityRow }> = ({ row }) => {
  const [open, setOpen] = useState(false);
  const isCert      = row.category_activity === 'Certification';
  const certScores  = isCert ? extractCertScores(row) : [];
  const evalScores  = !isCert ? extractEvalScores(row) : [];

  const webDevScores = row.web_dev_evaluation?.scores
    ? Object.entries(row.web_dev_evaluation.scores as Record<string, { score: number; evidence?: string }>)
    : [];
  const vibeCertScores = row.vibe_cert_evaluation?.scores
    ? Object.entries(row.vibe_cert_evaluation.scores as Record<string, { score: number; evidence?: string }>)
    : [];

  const hasDetail = certScores.length > 0 || evalScores.length > 0 || webDevScores.length > 0 || vibeCertScores.length > 0;
  const dateStr = row.updated_at
    ? new Date(row.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className={classNames('border rounded-lg overflow-hidden', isCert ? 'border-purple-200' : 'border-gray-200')}>
      <div
        className={classNames(
          'flex items-center gap-3 px-4 py-3',
          isCert ? 'bg-purple-50' : 'bg-white',
          hasDetail ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''
        )}
        onClick={() => hasDetail && setOpen(o => !o)}
      >
        <div className="flex-shrink-0">{categoryIcon(row.category_activity)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{row.activity}</p>
          <p className="text-xs text-gray-500">
            {row.category_activity}
            {row.sub_category && ` · ${row.sub_category}`}
            {dateStr && <span className="ml-2 text-gray-400">{dateStr}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {progressIcon(row.progress)}
          <span className={classNames('text-xs px-2 py-0.5 rounded-full border font-medium', progressColor(row.progress))}>
            {row.progress}
          </span>
          {row.certificate_pdf_url && (
            <a
              href={row.certificate_pdf_url} target="_blank" rel="noopener noreferrer"
              className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full hover:bg-amber-100 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              🏆 PDF
            </a>
          )}
          {hasDetail && (open
            ? <ChevronUp size={14} className="text-gray-400" />
            : <ChevronDown size={14} className="text-gray-400" />
          )}
        </div>
      </div>

      {open && hasDetail && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50 space-y-3">
          {certScores.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Certification Scores</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {certScores.map(({ label, score }) => (
                  <div key={label} className="flex items-center justify-between bg-white rounded px-3 py-1.5 border border-gray-100">
                    <span className="text-xs text-gray-700 truncate pr-2">{label}</span>
                    <ScorePill score={score} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {webDevScores.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Web Dev Cert Scores</p>
              <div className="space-y-1.5">
                {webDevScores.map(([name, val]) => (
                  <div key={name} className="bg-white rounded px-3 py-2 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">{name}</span>
                      <ScorePill score={val.score ?? null} />
                    </div>
                    {val.evidence && <p className="text-[11px] text-gray-500 leading-relaxed">{val.evidence}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {vibeCertScores.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Vibe Coding Cert Scores</p>
              <div className="space-y-1.5">
                {vibeCertScores.map(([name, val]) => (
                  <div key={name} className="bg-white rounded px-3 py-2 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">{name}</span>
                      <ScorePill score={val.score ?? null} />
                    </div>
                    {val.evidence && <p className="text-[11px] text-gray-500 leading-relaxed">{val.evidence}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {evalScores.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Learning Scores</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {evalScores.map(({ label, score }) => (
                  <div key={label} className="flex items-center justify-between bg-white rounded px-3 py-1.5 border border-gray-100">
                    <span className="text-xs text-gray-700 truncate pr-2">{label}</span>
                    <ScorePill score={score} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   StudentLearnerTable
   ═══════════════════════════════════════════════════════════════════════════════ */

const StudentLearnerTable: React.FC<{
  learners: Learner[];
  sessionRows: StudentSessionRow[];
  loading: boolean;
  error: string | null;
  onSelectLearner: (id: string) => void;
  selectedId: string;
  isPlatformAdmin?: boolean;
  canViewStudentDashboard?: boolean;
}> = ({ learners, sessionRows, loading, error, onSelectLearner, selectedId, isPlatformAdmin, canViewStudentDashboard }) => {
  const [search, setSearch] = useState('');
  const { startImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<'name' | 'total' | 'monthTotal' | 'certAttempted' | 'certAchieved' | 'completionRate' | 'lastActive'>('total');
  const [sortAsc, setSortAsc] = useState(false);

  // Time frame filter: 7d = last week, 30d = last month, 0 = all time (since beginning)
  const [timeFrame, setTimeFrame] = useState<7 | 30 | 0>(0);

  const handleActAs = async (learnerId: string) => {
    try {
      await startImpersonation(learnerId);
      navigate('/home');
    } catch (err: any) {
      alert('Could not load learner profile: ' + err.message);
    }
  };

  const handleViewDashboard = (learnerId: string) => {
    onSelectLearner(learnerId);
    setTimeout(() => {
      document.getElementById('student-dashboard-detail')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const _now = new Date();
  const monthStartMs = Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), 1);

  // Compute time frame cutoff ms (0 = beginning = April 1, 2025 as platform start)
  const PLATFORM_START_MS = Date.UTC(2025, 3, 1); // April 1 2025
  const timeFrameCutoffMs = timeFrame === 0
    ? PLATFORM_START_MS
    : Date.now() - timeFrame * 86400000;

  // Filter sessionRows by timeFrame using updated_at
  const timeFilteredRows = sessionRows.filter(r => {
    const ts = Date.parse(r.updated_at || '');
    return !isNaN(ts) && ts >= timeFrameCutoffMs;
  });

  const summaries: StudentSummary[] = learners.map((l) => {
    const rows = timeFilteredRows.filter((r) => r.user_id === l.id);
    const engaged = rows.filter((r) => isEngagedSession(r.progress));
    const currentMonthEngaged = engaged.filter((r) => {
      const ts = Date.parse(r.created_at || '');
      return !isNaN(ts) && ts >= monthStartMs;
    }).length;
    const byCategory: Record<string, number> = {};
    for (const row of engaged) {
      const key = normalizeCategory(row.category_activity);
      byCategory[key] = (byCategory[key] || 0) + 1;
    }
    const cRows = rows.filter((r) => (r.category_activity || '') === 'Certification');
    const certAttempted = cRows.filter((r) => isEngagedSession(r.progress)).length;
    const certAchieved = cRows.filter((r) => r.progress === 'completed').length;
    const completed = rows.filter((r) => r.progress === 'completed').length;
    const completionRate = rows.length > 0 ? (completed / rows.length) * 100 : 0;
    const lastActiveAt = rows.reduce<string | null>((acc, r) => {
      if (!r.updated_at) return acc;
      if (!acc) return r.updated_at;
      return r.updated_at > acc ? r.updated_at : acc;
    }, null);
    return {
      id: l.id,
      name: l.name || '(no name)',
      email: l.email || '',
      totalEngaged: engaged.length,
      currentMonthEngaged,
      byCategory,
      certAttempted,
      certAchieved,
      completionRate,
      lastActiveAt,
    };
  });

  const allCategoryNames = [...new Set(summaries.flatMap((s) => Object.keys(s.byCategory)))].sort();

  const filtered = summaries.filter((s) =>
    search === '' ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = '';
    let bv: string | number = '';
    if (sortKey === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    else if (sortKey === 'total') { av = a.totalEngaged; bv = b.totalEngaged; }
    else if (sortKey === 'monthTotal') { av = a.currentMonthEngaged; bv = b.currentMonthEngaged; }
    else if (sortKey === 'certAttempted') { av = a.certAttempted; bv = b.certAttempted; }
    else if (sortKey === 'certAchieved') { av = a.certAchieved; bv = b.certAchieved; }
    else if (sortKey === 'completionRate') { av = a.completionRate; bv = b.completionRate; }
    else { av = a.lastActiveAt || ''; bv = b.lastActiveAt || ''; }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortMark: React.FC<{ keyName: typeof sortKey }> = ({ keyName }) => {
    if (sortKey !== keyName) return null;
    return sortAsc ? <ChevronUp size={11} className="inline ml-1 text-purple-500" /> : <ChevronDown size={11} className="inline ml-1 text-purple-500" />;
  };

  // Cohort-level aggregates for summary banner
  const cohortUsers = summaries.length;
  const cohortActivities = summaries.reduce((s, r) => s + r.totalEngaged + r.certAttempted, 0);
  const cohortCompleted = summaries.reduce((s, r) => s + (r.byCategory['Certification'] ?? 0), 0);
  const cohortCertsCompleted = summaries.reduce((s, r) => s + r.certAchieved, 0);
  const cohortCertsAttempted = summaries.reduce((s, r) => s + r.certAttempted, 0);

  const timeFrameLabel = timeFrame === 7 ? 'Last Week' : timeFrame === 30 ? 'Last Month' : 'Since Beginning';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-gray-800">Student Learner Overview</h2>
          <span className="text-xs text-gray-400">{filtered.length} learners</span>
          {/* Time frame selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 ml-2">
            {([
              { val: 7 as const, label: 'Last Week' },
              { val: 30 as const, label: 'Last Month' },
              { val: 0 as const, label: 'Since Beginning' },
            ]).map(({ val, label }) => (
              <button key={val} onClick={() => setTimeFrame(val)}
                className={classNames('px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap',
                  timeFrame === val ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="ml-auto w-full sm:w-60 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
      </div>

      {/* Cohort summary banner — shown after time frame selection (always visible) */}
      {!loading && summaries.length > 0 && (
        <div className="px-5 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100 flex flex-wrap gap-5">
          <div className="text-xs text-gray-600 font-semibold uppercase tracking-wide self-center">{timeFrameLabel}</div>
          {[
            { label: 'Learners', value: cohortUsers, icon: <Users size={13} className="text-purple-500" /> },
            { label: 'Learning Activities', value: cohortActivities, icon: <BookOpen size={13} className="text-blue-500" /> },
            { label: 'Activities Completed', value: cohortCompleted, icon: <CheckCircle size={13} className="text-green-500" /> },
            { label: 'Certs Attempted', value: cohortCertsAttempted, icon: <Trophy size={13} className="text-amber-500" /> },
            { label: 'Certs Achieved', value: cohortCertsCompleted, icon: <Award size={13} className="text-purple-600" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-1.5">
              {icon}
              <span className="text-lg font-black text-gray-900">{value}</span>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading learner session summary...
        </div>
      )}

      {!loading && error && (
        <div className="p-4 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th onClick={() => toggleSort('name')} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700">Student<SortMark keyName="name" /></th>
                <th onClick={() => toggleSort('total')} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700">Sessions (All-Time)<SortMark keyName="total" /></th>
                <th onClick={() => toggleSort('monthTotal')} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700">Sessions (Current Month)<SortMark keyName="monthTotal" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sessions by Category</th>
                <th onClick={() => toggleSort('certAttempted')} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700">Cert Attempted<SortMark keyName="certAttempted" /></th>
                <th onClick={() => toggleSort('certAchieved')} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700">Cert Achieved<SortMark keyName="certAchieved" /></th>
                <th onClick={() => toggleSort('completionRate')} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700">Completion Rate<SortMark keyName="completionRate" /></th>
                <th onClick={() => toggleSort('lastActive')} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700">Last Active<SortMark keyName="lastActive" /></th>
                {canViewStudentDashboard && <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Dashboard</th>}
                {isPlatformAdmin && <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Act As</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((s) => (
                <tr key={s.id} className={classNames('hover:bg-purple-50 transition-colors', selectedId === s.id ? 'bg-purple-50/70' : '')}>
                  <td className="px-4 py-3">
                    {canViewStudentDashboard ? (
                      <button type="button" onClick={() => handleViewDashboard(s.id)} className="font-semibold text-purple-700 hover:underline text-left">{s.name}</button>
                    ) : (
                      <span className="font-semibold text-gray-800">{s.name}</span>
                    )}
                    <div className="text-[11px] text-gray-400">{s.email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.totalEngaged}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.currentMonthEngaged}</td>
                  <td className="px-4 py-3">
                    {allCategoryNames.length === 0 ? (
                      <span className="text-gray-300">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {allCategoryNames.map((cat) => (
                          <span key={`${s.id}-${cat}`} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                            {cat}: {s.byCategory[cat] || 0}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.certAttempted}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.certAchieved}</td>
                  <td className="px-4 py-3">
                    <span className={classNames(
                      'px-2 py-0.5 rounded-full border text-[11px] font-semibold',
                      s.completionRate >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      s.completionRate >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-gray-50 text-gray-600 border-gray-200'
                    )}>
                      {s.completionRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                  </td>
                  {canViewStudentDashboard && (
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => handleViewDashboard(s.id)} title={`View ${s.name}'s dashboard`}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors whitespace-nowrap">
                        <User size={12} /> View
                      </button>
                    </td>
                  )}
                  {isPlatformAdmin && (
                    <td className="px-4 py-3">
                      <button onClick={() => handleActAs(s.id)} title={`Browse the platform as ${s.name}`}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap">
                        👁 Act as
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={isPlatformAdmin ? (canViewStudentDashboard ? 10 : 9) : (canViewStudentDashboard ? 9 : 8)} className="px-4 py-10 text-center text-sm text-gray-400">
                    {search ? 'No learners match that search.' : 'No student sessions found yet.'}
                  </td>
                </tr>
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-700">Totals ({sorted.length})</td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-800 font-mono">{sorted.reduce((sum, row) => sum + row.totalEngaged, 0)}</td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-800 font-mono">{sorted.reduce((sum, row) => sum + row.currentMonthEngaged, 0)}</td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-500">Aggregate across categories</td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-800 font-mono">{sorted.reduce((sum, row) => sum + row.certAttempted, 0)}</td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-800 font-mono">{sorted.reduce((sum, row) => sum + row.certAchieved, 0)}</td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-800">{sorted.length > 0 ? `${(sorted.reduce((sum, row) => sum + row.completionRate, 0) / sorted.length).toFixed(0)}%` : '—'}</td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-500">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CostOverviewPanel
   ═══════════════════════════════════════════════════════════════════════════════ */

interface CostOverviewProps {
  rows: CostRow[];
  loading: boolean;
  error: string | null;
  days: number;
  setDays: (d: number) => void;
  groupBy: 'page' | 'model' | 'provider';
  setGroupBy: (g: 'page' | 'model' | 'provider') => void;
  onRefresh: () => void;
}

const CostOverviewPanel: React.FC<CostOverviewProps> = ({
  rows, loading, error, days, setDays, groupBy, setGroupBy, onRefresh
}) => {
  // Community selector state — all rows until user picks a community
  const [selectedCommunity, setSelectedCommunity] = useState<string>('__all__');

  // Derive list of communities (cities) from rows
  const communities = ['__all__', ...Array.from(new Set(rows.map(r => r.city).filter(Boolean) as string[])).sort()];

  const filteredRows = selectedCommunity === '__all__'
    ? rows
    : rows.filter(r => r.city === selectedCommunity);

  const paidCost       = filteredRows.filter(r => (PRICING[r.model]?.input ?? 0) > 0 || (PRICING[r.model]?.output ?? 0) > 0).reduce((s, r) => s + numCost(r.estimated_cost_usd), 0);
  const totalInTok     = filteredRows.reduce((s, r) => s + r.input_tokens, 0);
  const totalCacheHit  = filteredRows.reduce((s, r) => s + r.cache_hit_tokens, 0);
  const cacheRate      = totalInTok > 0 ? (totalCacheHit / totalInTok * 100) : 0;
  const freeCalls      = filteredRows.filter(r => (PRICING[r.model]?.input ?? 0) === 0 && (PRICING[r.model]?.output ?? 0) === 0).length;
  const paidCalls      = filteredRows.filter(r => (PRICING[r.model]?.input ?? 0) > 0 || (PRICING[r.model]?.output ?? 0) > 0).length;
  const cacheSaved     = (totalCacheHit / 1_000_000) * 1.00 * 0.90;

  // Daily cost breakdown by model — from April 1, 2025 onward (all data range regardless of days filter)
  const COST_CHART_START = '2025-04-01';
  const byDayModel = new Map<string, Map<string, number>>();
  rows.forEach(r => {  // use unfiltered `rows` for the daily chart (April 1 start)
    const day = r.logged_at.slice(0, 10);
    if (day < COST_CHART_START) return;
    if (!byDayModel.has(day)) byDayModel.set(day, new Map());
    const dayMap = byDayModel.get(day)!;
    dayMap.set(r.model, (dayMap.get(r.model) || 0) + numCost(r.estimated_cost_usd));
  });
  const dayEntries = [...byDayModel.entries()].sort();
  const allModelsInChart = [...new Set(rows.map(r => r.model))];
  const MODEL_BAR_COLORS = ['bg-blue-400', 'bg-emerald-400', 'bg-cyan-400', 'bg-orange-400', 'bg-pink-400', 'bg-violet-400', 'bg-amber-400'];

  const grouped = groupCostRows(filteredRows, groupBy);
  const maxCost = grouped[0]?.[1].cost || 1;

  const allProviders = [...new Set(filteredRows.map(r => r.provider))].sort();

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
      <Loader2 size={20} className="animate-spin" /> Loading cost data…
    </div>
  );

  if (error) return (
    <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
      <p className="font-semibold mb-1">Cost data unavailable</p>
      <p>{error}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Community selector */}
        <div className="relative">
          <select
            value={selectedCommunity}
            onChange={e => setSelectedCommunity(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="__all__">All Communities</option>
            {communities.filter(c => c !== '__all__').map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        {/* Time frame */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([1, 7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => { console.log(`[CostOverview] setDays(${d}) called`); setDays(d); }}
              className={classNames('px-3 py-1.5 rounded text-xs font-semibold transition-colors',
                days === d ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {d === 1 ? '1d' : d === 7 ? 'Week' : d === 30 ? 'Month' : '3 Month'}
            </button>
          ))}
        </div>
        {/* Group by */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['page', 'model', 'provider'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={classNames('px-3 py-1.5 rounded text-xs font-semibold transition-colors capitalize',
                groupBy === g ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {g}
            </button>
          ))}
        </div>
        <button onClick={onRefresh} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors ml-auto">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Paid API cost', value: `$${paidCost.toFixed(2)}`, sub: `last ${days === 1 ? '24h' : days + ' days'}`, icon: <DollarSign size={16} className="text-blue-500" />, bg: 'bg-blue-50' },
          { label: 'Cache savings',  value: `$${cacheSaved.toFixed(2)}`, sub: `${cacheRate.toFixed(0)}% hit rate`, icon: <Zap size={16} className="text-amber-500" />, bg: 'bg-amber-50' },
          { label: 'Free-tier reqs', value: freeCalls.toLocaleString(), sub: '$0 — free providers', icon: <TrendingUp size={16} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Paid reqs', value: paidCalls.toLocaleString(), sub: `${fmtTokens(totalInTok)} tokens in`, icon: <Activity size={16} className="text-purple-500" />, bg: 'bg-purple-50' },
        ].map(({ label, value, sub, icon, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 flex items-center gap-3 border border-white shadow-sm`}>
            {icon}
            <div>
              <p className="text-xl font-black text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 leading-tight">{label}</p>
              <p className="text-[10px] text-gray-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <DollarSign size={14} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-700">Cost by {groupBy}</span>
          <span className="text-xs text-gray-400 ml-auto">{filteredRows.length} requests</span>
        </div>
        {grouped.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No cost data yet</div>
        ) : (
          <div className="p-5 space-y-3">
            {grouped.map(([key, val]) => {
              const pc = getProviderColor(val.provider);
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-40 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-700 truncate">{key}</span>
                      <ProviderBadge provider={val.provider} />
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{val.calls.toLocaleString()} calls · {fmtTokens(val.inTok + val.outTok)} tokens</div>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className={classNames('h-2 rounded-full transition-all', pc.bar)}
                      style={{ width: `${(val.cost / maxCost * 100).toFixed(1)}%` }} />
                  </div>
                  <div className="w-16 text-right text-xs font-semibold text-gray-700 flex-shrink-0">{fmtCost(val.cost)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Daily cost plot — all models, from April 1, 2025 */}
      {dayEntries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-bold text-gray-700">Daily cost — all models (from Apr 1)</span>
            <div className="flex flex-wrap gap-2">
              {allModelsInChart.map((m, i) => (
                <span key={m} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className={classNames('w-2.5 h-2.5 rounded-sm', MODEL_BAR_COLORS[i % MODEL_BAR_COLORS.length])} />
                  {modelLabel(m)}
                </span>
              ))}
            </div>
          </div>
          <div className="p-5 overflow-x-auto">
            <div className="flex items-end gap-1 h-28" style={{ minWidth: `${dayEntries.length * 22}px` }}>
              {dayEntries.map(([day, dayMap]) => {
                const dayTotal = [...dayMap.values()].reduce((s, n) => s + n, 0);
                const maxDayTotal = Math.max(...dayEntries.map(([, dm]) => [...dm.values()].reduce((s, n) => s + n, 0)), 0.0001);
                return (
                  <div key={day} className="flex-shrink-0 w-5 flex flex-col items-center gap-1 group relative">
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                      {day}: {fmtCost(dayTotal)}
                    </div>
                    <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${Math.max((dayTotal / maxDayTotal) * 100, 2)}%` }}>
                      {allModelsInChart.map((m, i) => {
                        const cost = dayMap.get(m) || 0;
                        if (cost === 0) return null;
                        const segPct = dayTotal > 0 ? (cost / dayTotal * 100) : 0;
                        return <div key={m} className={MODEL_BAR_COLORS[i % MODEL_BAR_COLORS.length]} style={{ height: `${segPct}%` }} />;
                      })}
                    </div>
                    <div className="text-[8px] text-gray-400 rotate-45 origin-left mt-1 whitespace-nowrap">{day.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {allProviders.map(provider => {
          const pRows = filteredRows.filter(r => r.provider === provider);
          const pCost = pRows.reduce((s, r) => s + numCost(r.estimated_cost_usd), 0);
          const pInTok = pRows.reduce((s, r) => s + r.input_tokens, 0);
          const pOutTok = pRows.reduce((s, r) => s + r.output_tokens, 0);
          const pCache = pRows.reduce((s, r) => s + r.cache_hit_tokens, 0);
          const pc = getProviderColor(provider);
          const isFree = (PRICING[pRows[0]?.model]?.input ?? 0) === 0;
          return (
            <div key={provider} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className={classNames('text-[11px] px-2 py-0.5 rounded-full border font-bold', pc.bg, pc.text, pc.border)}>
                  {provider.charAt(0).toUpperCase() + provider.slice(1)} · {isFree ? 'Free' : 'Paid'}
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Total cost</span><span className="font-semibold text-gray-800">{fmtCost(pCost)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Requests</span><span className="font-semibold text-gray-800">{pRows.length.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Input tokens</span><span className="font-semibold text-gray-800">{fmtTokens(pInTok)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Output tokens</span><span className="font-semibold text-gray-800">{fmtTokens(pOutTok)}</span></div>
                {pCache > 0 && <div className="flex justify-between"><span className="text-gray-500">Cache hits</span><span className="font-semibold text-emerald-700">{fmtTokens(pCache)}</span></div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   ModelOverviewPanel
   ═══════════════════════════════════════════════════════════════════════════════ */

const ModelOverviewPanel: React.FC<{
  rows: CostRow[];
  loading: boolean;
  error: string | null;
  days: number;
  setDays: (d: number) => void;
  onRefresh: () => void;
}> = ({ rows, loading, error, days, setDays, onRefresh }) => {
  const [sortKey, setSortKey] = useState<'model' | 'provider' | 'requests' | 'users' | 'inTok' | 'outTok' | 'cost'>('requests');
  const [sortAsc, setSortAsc] = useState(false);

  type ModelStat = {
    model: string; label: string; provider: string;
    requests: number; users: number; inTok: number; outTok: number; cacheHit: number; cost: number;
    topPages: string[];
  };

  const modelMap = new Map<string, { provider: string; requests: number; userSet: Set<string>; inTok: number; outTok: number; cacheHit: number; cost: number; pageCounts: Record<string, number> }>();
  for (const r of rows) {
    const existing = modelMap.get(r.model);
    if (existing) {
      existing.requests += 1;
      if (r.user_id) existing.userSet.add(r.user_id);
      existing.inTok += r.input_tokens;
      existing.outTok += r.output_tokens;
      existing.cacheHit += r.cache_hit_tokens;
      existing.cost += numCost(r.estimated_cost_usd);
      existing.pageCounts[r.page] = (existing.pageCounts[r.page] || 0) + 1;
    } else {
      const userSet = new Set<string>();
      if (r.user_id) userSet.add(r.user_id);
      modelMap.set(r.model, {
        provider: r.provider, requests: 1, userSet,
        inTok: r.input_tokens, outTok: r.output_tokens, cacheHit: r.cache_hit_tokens,
        cost: numCost(r.estimated_cost_usd), pageCounts: { [r.page]: 1 },
      });
    }
  }

  const modelStats: ModelStat[] = [];
  modelMap.forEach((val, model) => {
    const topPages = Object.entries(val.pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p);
    modelStats.push({ model, label: modelLabel(model), provider: val.provider, requests: val.requests, users: val.userSet.size, inTok: val.inTok, outTok: val.outTok, cacheHit: val.cacheHit, cost: val.cost, topPages });
  });

  const sortedModels = [...modelStats].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === 'model') { av = a.label.toLowerCase(); bv = b.label.toLowerCase(); }
    else if (sortKey === 'provider') { av = a.provider; bv = b.provider; }
    else if (sortKey === 'requests') { av = a.requests; bv = b.requests; }
    else if (sortKey === 'users') { av = a.users; bv = b.users; }
    else if (sortKey === 'inTok') { av = a.inTok; bv = b.inTok; }
    else if (sortKey === 'outTok') { av = a.outTok; bv = b.outTok; }
    else { av = a.cost; bv = b.cost; }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) => sortKey !== k ? null : sortAsc
    ? <ChevronUp size={11} className="inline ml-0.5 text-purple-500" />
    : <ChevronDown size={11} className="inline ml-0.5 text-purple-500" />;

  const totalRequests = rows.length;
  const totalCost = rows.reduce((s, r) => s + numCost(r.estimated_cost_usd), 0);
  const freeRequests = rows.filter(r => (PRICING[r.model]?.input ?? 0) === 0 && (PRICING[r.model]?.output ?? 0) === 0).length;
  const freePct = totalRequests > 0 ? (freeRequests / totalRequests * 100) : 0;
  const maxReqs = Math.max(...modelStats.map(m => m.requests), 1);

  const providerMap = new Map<string, { requests: number; cost: number }>();
  rows.forEach(r => {
    const existing = providerMap.get(r.provider) || { requests: 0, cost: 0 };
    providerMap.set(r.provider, { requests: existing.requests + 1, cost: existing.cost + numCost(r.estimated_cost_usd) });
  });
  const providerStats = [...providerMap.entries()].sort((a, b) => b[1].requests - a[1].requests);
  const maxProvReqs = providerStats[0]?.[1].requests || 1;

  const dailyModelMap = new Map<string, Map<string, number>>();
  rows.forEach(r => {
    const day = r.logged_at.slice(0, 10);
    if (!dailyModelMap.has(day)) dailyModelMap.set(day, new Map());
    const dayMap = dailyModelMap.get(day)!;
    dayMap.set(r.model, (dayMap.get(r.model) || 0) + 1);
  });
  const dailyEntries = [...dailyModelMap.entries()].sort().slice(-14);
  const allModelsInDaily = [...new Set(rows.map(r => r.model))];
  const MODEL_BAR_COLORS = ['bg-blue-400', 'bg-emerald-400', 'bg-cyan-400', 'bg-orange-400', 'bg-pink-400', 'bg-violet-400', 'bg-amber-400'];

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
      <Loader2 size={20} className="animate-spin" /> Loading model data…
    </div>
  );

  if (error) return (
    <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
      <p className="font-semibold mb-1">Model data unavailable</p><p>{error}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([1, 7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => { console.log(`[ModelOverview] setDays(${d}) called`); setDays(d); }}
              className={classNames('px-3 py-1.5 rounded text-xs font-semibold transition-colors',
                days === d ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {d === 1 ? '1d' : d === 7 ? 'Week' : d === 30 ? 'Month' : '3 Month'}
            </button>
          ))}
        </div>
        <button onClick={onRefresh} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors ml-auto">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total sessions', value: totalRequests.toLocaleString(), sub: `last ${days === 1 ? '24h' : days + ' days'}`, icon: <Activity size={16} className="text-purple-500" />, bg: 'bg-purple-50' },
          { label: 'Active models', value: modelStats.length, sub: 'unique models', icon: <Server size={16} className="text-blue-500" />, bg: 'bg-blue-50' },
          { label: 'Free-tier %', value: `${freePct.toFixed(0)}%`, sub: `${freeRequests.toLocaleString()} free reqs`, icon: <TrendingUp size={16} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Total cost', value: `$${totalCost.toFixed(2)}`, sub: 'all providers', icon: <DollarSign size={16} className="text-amber-500" />, bg: 'bg-amber-50' },
        ].map(({ label, value, sub, icon, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 flex items-center gap-3 border border-white shadow-sm`}>
            {icon}
            <div>
              <p className="text-xl font-black text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 leading-tight">{label}</p>
              <p className="text-[10px] text-gray-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Server size={14} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-700">Requests by Model</span>
          <span className="text-xs text-gray-400 ml-auto">{modelStats.length} models</span>
        </div>
        {modelStats.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No model data yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {([
                    { key: 'model' as const, label: 'Model' },
                    { key: 'provider' as const, label: 'Provider' },
                    { key: 'requests' as const, label: 'Sessions' },
                    { key: 'users' as const, label: 'Users' },
                    { key: 'inTok' as const, label: 'Input Tokens' },
                    { key: 'outTok' as const, label: 'Output Tokens' },
                    { key: 'cost' as const, label: 'Est. Cost' },
                  ]).map(({ key, label }) => (
                    <th key={key} onClick={() => toggleSort(key)}
                      className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700 select-none">
                      {label}<SortIcon k={key} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Top Pages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedModels.map(m => {
                  const pc = getProviderColor(m.provider);
                  return (
                    <tr key={m.model} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{m.label}</div>
                        <div className="text-[10px] text-gray-400 font-mono truncate max-w-[180px]">{m.model}</div>
                      </td>
                      <td className="px-4 py-3"><ProviderBadge provider={m.provider} /></td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-800 font-mono">{m.requests.toLocaleString()}</div>
                        <div className="mt-1 bg-gray-100 rounded-full h-1.5 w-20">
                          <div className={classNames('h-1.5 rounded-full', pc.bar)} style={{ width: `${(m.requests / maxReqs * 100).toFixed(1)}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-600">{m.users}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{fmtTokens(m.inTok)}{m.cacheHit > 0 && <span className="text-emerald-600 ml-1">({fmtTokens(m.cacheHit)} cached)</span>}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{fmtTokens(m.outTok)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{fmtCost(m.cost)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {m.topPages.map(p => (
                            <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 truncate max-w-[100px]">{p}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-600">Total</td>
                  <td></td>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-800 font-mono">{totalRequests.toLocaleString()}</td>
                  <td></td>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-800 font-mono">{fmtTokens(rows.reduce((s, r) => s + r.input_tokens, 0))}</td>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-800 font-mono">{fmtTokens(rows.reduce((s, r) => s + r.output_tokens, 0))}</td>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-800">{fmtCost(totalCost)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {providerStats.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <span className="text-sm font-bold text-gray-700">Provider Distribution</span>
          </div>
          <div className="p-5 space-y-3">
            {providerStats.map(([provider, val]) => {
              const pc = getProviderColor(provider);
              const pct = totalRequests > 0 ? (val.requests / totalRequests * 100) : 0;
              return (
                <div key={provider} className="flex items-center gap-3">
                  <div className="w-28 flex-shrink-0">
                    <ProviderBadge provider={provider} />
                    <div className="text-[10px] text-gray-400 mt-0.5">{fmtCost(val.cost)}</div>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div className={classNames('h-3 rounded-full transition-all', pc.bar)} style={{ width: `${(val.requests / maxProvReqs * 100).toFixed(1)}%` }} />
                  </div>
                  <div className="w-24 text-right flex-shrink-0">
                    <span className="text-xs font-semibold text-gray-700">{val.requests.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-400 ml-1">({pct.toFixed(0)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dailyEntries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">Daily Model Usage</span>
            <div className="flex flex-wrap gap-2">
              {allModelsInDaily.map((m, i) => (
                <span key={m} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className={classNames('w-2.5 h-2.5 rounded-sm', MODEL_BAR_COLORS[i % MODEL_BAR_COLORS.length])} />
                  {modelLabel(m)}
                </span>
              ))}
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-end gap-1.5 h-28">
              {dailyEntries.map(([day, dayMap]) => {
                const dayTotal = [...dayMap.values()].reduce((s, n) => s + n, 0);
                const maxDayTotal = Math.max(...dailyEntries.map(([, dm]) => [...dm.values()].reduce((s, n) => s + n, 0)), 1);
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                      {day}: {dayTotal} reqs
                    </div>
                    <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${Math.max(dayTotal / maxDayTotal * 100, 3)}%` }}>
                      {allModelsInDaily.map((m, i) => {
                        const count = dayMap.get(m) || 0;
                        if (count === 0) return null;
                        const segPct = dayTotal > 0 ? (count / dayTotal * 100) : 0;
                        return <div key={m} className={MODEL_BAR_COLORS[i % MODEL_BAR_COLORS.length]} style={{ height: `${segPct}%` }} />;
                      })}
                    </div>
                    <div className="text-[9px] text-gray-400 rotate-45 origin-left mt-1 whitespace-nowrap">{day.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <Zap size={14} className="text-amber-500" /> Fallback Chain (for AI Learning / Skills pages)
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { name: 'Groq', model: 'Llama 70B', color: getProviderColor('groq'), free: true },
            { name: 'Gemini', model: '2.0 Flash', color: getProviderColor('gemini'), free: true },
            { name: 'Cerebras', model: 'Llama 70B', color: getProviderColor('cerebras'), free: true },
            { name: 'OpenRouter', model: 'Llama 70B', color: getProviderColor('openrouter'), free: true },
            { name: 'Mistral', model: 'Small', color: getProviderColor('mistral'), free: true },
            { name: 'Anthropic', model: 'Haiku 4.5', color: getProviderColor('anthropic'), free: false },
          ].map((p, i, arr) => (
            <React.Fragment key={p.name}>
              <div className={classNames('px-3 py-2 rounded-lg border text-xs', p.color.bg, p.color.border)}>
                <div className={classNames('font-bold', p.color.text)}>{p.name}</div>
                <div className="text-gray-500 text-[10px]">{p.model}</div>
                {p.free && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold mt-1 inline-block">FREE</span>}
              </div>
              {i < arr.length - 1 && <span className="text-gray-300 text-lg">→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   LearnerCostPanel
   ═══════════════════════════════════════════════════════════════════════════════ */

interface LearnerCostProps {
  learners: Learner[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  allCostRows: CostRow[];
  learnerRows: CostRow[];
  loading: boolean;
  loadingDetail: boolean;
  onRefresh: () => void;
  isPlatformAdmin: boolean;
  allOrgs: OrgOption[];
  costOrgId: string;
  setCostOrgId: (id: string) => void;
  loadingOrgs: boolean;
  days: number;
  setDays: (d: number) => void;
}

type LearnerCostSortKey = 'name' | 'cost' | 'requests' | 'free' | 'paid' | 'city';

const LearnerCostPanel: React.FC<LearnerCostProps> = ({
  learners, selectedId, setSelectedId, allCostRows, learnerRows,
  loading, loadingDetail, onRefresh,
  isPlatformAdmin, allOrgs, costOrgId, setCostOrgId, loadingOrgs,
  days, setDays,
}) => {
  const [sortKey, setSortKey] = useState<LearnerCostSortKey>('cost');
  const [sortAsc, setSortAsc] = useState(false);
  const [groupBy, setGroupBy] = useState<'page' | 'model' | 'provider'>('page');
  const [search, setSearch] = useState('');

  const costOrgJoinCodes: string[] = costOrgId && costOrgId !== '__all__'
    ? getJoinCodesForOrg(allOrgs, costOrgId)
    : [];

  const filteredLearners = (costOrgId === '__all__' || !costOrgId)
    ? learners
    : learners.filter(l => {
        if (!l.join_code_used) return false;
        return costOrgJoinCodes.includes(l.join_code_used);
      });

  // allCostRows is already fetched for the selected `days` window by the parent
  // No secondary local filter needed — just use allCostRows directly

  // Show org selector if platform admin hasn't picked an org yet
  if (isPlatformAdmin && !costOrgId) {
    return (
      <OrgSelectorGrid
        orgs={allOrgs}
        onSelectOrg={(orgId) => setCostOrgId(orgId)}
        onSelectAll={() => setCostOrgId('__all__')}
        loading={loadingOrgs}
      />
    );
  }

  const selectedOrgName = costOrgId === '__all__' ? 'All Organizations' : (allOrgs.find(o => o.id === costOrgId)?.name || '');

  // Build a lookup from learners prop (may be empty if Student Activity tab hasn't loaded)
  const learnerLookup = new Map(learners.map(l => [l.id, l]));

  // Filter allCostRows by org if one is selected
  const orgFilteredCostRows = (costOrgId === '__all__' || !costOrgId)
    ? allCostRows
    : (() => {
        // If we have learners loaded, filter by their ids
        if (filteredLearners.length > 0) {
          const ids = new Set(filteredLearners.map(l => l.id));
          return allCostRows.filter(r => r.user_id && ids.has(r.user_id));
        }
        // Otherwise filter by city from the org (best effort)
        const org = allOrgs.find(o => o.id === costOrgId);
        if (org?.city) return allCostRows.filter(r => r.city === org.city);
        return allCostRows;
      })();

  type LearnerSummary = {
    id: string; name: string; email: string; city: string;
    totalCost: number; requests: number; freeReqs: number; paidReqs: number;
    topPage: string;
  };

  // Group by user_id directly from cost rows — no dependency on learners being loaded
  const userCostMap = new Map<string, CostRow[]>();
  orgFilteredCostRows.forEach(r => {
    if (!r.user_id) return;
    if (!userCostMap.has(r.user_id)) userCostMap.set(r.user_id, []);
    userCostMap.get(r.user_id)!.push(r);
  });

  const summaries: LearnerSummary[] = [...userCostMap.entries()]
    .map(([userId, lRows]) => {
      const learner = learnerLookup.get(userId);
      const freeReqs = lRows.filter(r => (PRICING[r.model]?.input ?? 0) === 0).length;
      const paidReqs = lRows.filter(r => (PRICING[r.model]?.input ?? 0) > 0).length;
      const pageCounts: Record<string, number> = {};
      lRows.forEach(r => { pageCounts[r.page] = (pageCounts[r.page] || 0) + 1; });
      const topPage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      return {
        id: userId,
        name: learner?.name || '(no name)',
        email: learner?.email || '',
        city: lRows[0]?.city || (learner as any)?.city || '—',
        totalCost: lRows.reduce((s, r) => s + numCost(r.estimated_cost_usd), 0),
        requests: lRows.length,
        freeReqs,
        paidReqs,
        topPage,
      };
    })
    .filter(s => !EXCLUDED_IDS.has(s.id));

  const searchFiltered = summaries.filter(s =>
    search === '' ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...searchFiltered].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === 'name') { av = a.name; bv = b.name; }
    else if (sortKey === 'cost') { av = a.totalCost; bv = b.totalCost; }
    else if (sortKey === 'requests') { av = a.requests; bv = b.requests; }
    else if (sortKey === 'free') { av = a.freeReqs; bv = b.freeReqs; }
    else if (sortKey === 'paid') { av = a.paidReqs; bv = b.paidReqs; }
    else { av = a.city; bv = b.city; }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: LearnerCostSortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: LearnerCostSortKey }) => sortKey !== k ? null : sortAsc
    ? <ChevronUp size={11} className="inline ml-0.5 text-purple-500" />
    : <ChevronDown size={11} className="inline ml-0.5 text-purple-500" />;

  const maxCost = Math.max(...summaries.map(s => s.totalCost), 0.001);

  const selectedLearner = learnerLookup.get(selectedId) || null;
  const totalCost = learnerRows.reduce((s, r) => s + numCost(r.estimated_cost_usd), 0);
  const totalInTok = learnerRows.reduce((s, r) => s + r.input_tokens, 0);
  const totalOutTok = learnerRows.reduce((s, r) => s + r.output_tokens, 0);
  const freeRows = learnerRows.filter(r => (PRICING[r.model]?.input ?? 0) === 0);
  const paidRows = learnerRows.filter(r => (PRICING[r.model]?.input ?? 0) > 0);
  const grouped = groupCostRows(learnerRows, groupBy);
  const maxGroupCost = grouped[0]?.[1].cost || 1;

  // VIEW 2: Individual detail
  if (selectedId) {
    return (
      <div className="space-y-5">
        {isPlatformAdmin && selectedOrgName && (
          <OrgBanner orgName={selectedOrgName} onBack={() => { setCostOrgId(''); setSelectedId(''); }} backLabel="← Change Org" />
        )}

        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedId('')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <ChevronUp size={14} className="rotate-[-90deg]" /> All students
          </button>
          <div>
            <span className="text-base font-bold text-gray-900">{selectedLearner?.name || '(no name)'}</span>
            <span className="text-xs text-gray-400 ml-2">{selectedLearner?.email}</span>
          </div>
          <button onClick={onRefresh} className="ml-auto flex items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {loadingDetail && (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
            <Loader2 size={18} className="animate-spin" /> Loading…
          </div>
        )}

        {!loadingDetail && learnerRows.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <DollarSign size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No cost data for this learner yet.</p>
          </div>
        )}

        {!loadingDetail && learnerRows.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total cost', value: fmtCost(totalCost), bg: 'bg-blue-50', icon: <DollarSign size={16} className="text-blue-500" /> },
                { label: 'Total requests', value: learnerRows.length.toLocaleString(), bg: 'bg-purple-50', icon: <Activity size={16} className="text-purple-500" /> },
                { label: 'Free-tier reqs', value: freeRows.length.toLocaleString(), bg: 'bg-emerald-50', icon: <Zap size={16} className="text-emerald-500" /> },
                { label: 'Paid reqs', value: paidRows.length.toLocaleString(), bg: 'bg-amber-50', icon: <TrendingUp size={16} className="text-amber-500" /> },
              ].map(({ label, value, bg, icon }) => (
                <div key={label} className={`${bg} rounded-xl p-4 flex items-center gap-3 border border-white shadow-sm`}>
                  {icon}<div><p className="text-xl font-black text-gray-900">{value}</p><p className="text-xs text-gray-500">{label}</p></div>
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                <DollarSign size={14} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-700">Cost breakdown</span>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 ml-auto">
                  {(['page', 'model', 'provider'] as const).map(g => (
                    <button key={g} onClick={() => setGroupBy(g)}
                      className={classNames('px-2.5 py-1 rounded text-xs font-semibold transition-colors capitalize',
                        groupBy === g ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                      {g}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-400">{fmtTokens(totalInTok + totalOutTok)} tokens</span>
              </div>
              <div className="p-5 space-y-3">
                {grouped.map(([key, val]) => {
                  const pc = getProviderColor(val.provider);
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-48 flex-shrink-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-700 truncate">{key}</span>
                          <ProviderBadge provider={val.provider} />
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{val.calls} calls</div>
                      </div>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className={classNames('h-2 rounded-full', pc.bar)} style={{ width: `${(val.cost / maxGroupCost * 100).toFixed(1)}%` }} />
                      </div>
                      <div className="w-16 text-right text-xs font-semibold text-gray-700 flex-shrink-0">{fmtCost(val.cost)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-700">Recent requests</span>
                <span className="text-xs text-gray-400 ml-2">(last 50)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>{['Time', 'Page', 'Provider', 'Model', 'In tok', 'Out tok', 'Cost'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {learnerRows.slice(0, 50).map(r => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(r.logged_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-3 py-2 text-gray-700 font-medium max-w-[120px] truncate">{r.page}</td>
                        <td className="px-3 py-2"><ProviderBadge provider={r.provider} /></td>
                        <td className="px-3 py-2 text-gray-600 text-[10px]">{modelLabel(r.model)}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono">{r.input_tokens.toLocaleString()}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono">{r.output_tokens.toLocaleString()}</td>
                        <td className="px-3 py-2 font-semibold text-gray-800">{fmtCost(numCost(r.estimated_cost_usd))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {learnerRows.length > 50 && (
                  <div className="px-5 py-3 text-xs text-gray-400 border-t border-gray-100">Showing 50 of {learnerRows.length}</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // VIEW 1: Summary table
  return (
    <div className="space-y-4">
      {isPlatformAdmin && selectedOrgName && (
        <OrgBanner orgName={selectedOrgName} onBack={() => setCostOrgId('')} backLabel="← Change Org" />
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {/* Time frame selector */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {([1, 7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={classNames('px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap',
                days === d ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {d === 1 ? '1d' : d === 7 ? 'Week' : d === 30 ? 'Month' : '3 Month'}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
        <span className="text-xs text-gray-400">{sorted.length} learners</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 size={18} className="animate-spin" /> Loading cost data…
        </div>
      )}

      {!loading && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {([
                    { key: 'name' as LearnerCostSortKey, label: 'Student' },
                    { key: 'city' as LearnerCostSortKey, label: 'City' },
                    { key: 'cost' as LearnerCostSortKey, label: 'Total cost' },
                    { key: 'requests' as LearnerCostSortKey, label: 'Requests' },
                    { key: 'free' as LearnerCostSortKey, label: 'Free' },
                    { key: 'paid' as LearnerCostSortKey, label: 'Paid' },
                    { key: null, label: 'Top page' },
                  ] as { key: LearnerCostSortKey | null; label: string }[]).map(({ key, label }) => (
                    <th key={label} onClick={() => key && toggleSort(key)}
                      className={classNames('px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider',
                        key ? 'cursor-pointer hover:text-purple-700 select-none' : '')}>
                      {label}{key && <SortIcon k={key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(s => (
                  <tr key={s.id} className="hover:bg-purple-50 transition-colors cursor-pointer group" onClick={() => setSelectedId(s.id)}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-purple-700 group-hover:underline truncate">{s.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{s.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{s.city}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800 text-xs">{fmtCost(s.totalCost)}</div>
                      <div className="mt-1 bg-gray-100 rounded-full h-1.5 w-full">
                        <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${(s.totalCost / maxCost * 100).toFixed(1)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 font-mono">{s.requests.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-emerald-700">{s.freeReqs.toLocaleString()}</span>
                      {s.requests > 0 && <div className="text-[10px] text-gray-400">{(s.freeReqs / s.requests * 100).toFixed(0)}%</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-blue-700">{s.paidReqs.toLocaleString()}</span>
                      {s.requests > 0 && <div className="text-[10px] text-gray-400">{(s.paidReqs / s.requests * 100).toFixed(0)}%</div>}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-500 truncate">{s.topPage}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    {search ? 'No learners match that search.' : 'No cost data yet.'}
                  </td></tr>
                )}
              </tbody>
              {sorted.length > 0 && (
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-600">Total ({sorted.length})</td>
                    <td></td>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-800">{fmtCost(sorted.reduce((s, r) => s + r.totalCost, 0))}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-800 font-mono">{sorted.reduce((s, r) => s + r.requests, 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-emerald-700 font-mono">{sorted.reduce((s, r) => s + r.freeReqs, 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-blue-700 font-mono">{sorted.reduce((s, r) => s + r.paidReqs, 0).toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   LongitudinalGlobalPanel
   ═══════════════════════════════════════════════════════════════════════════════ */

interface LongRow {
  learner_token: string;
  cohort_month: string;
  snapshot_date: string;
  site: string;
  session_count: number;
  is_persistent_learner: boolean;
  reasoning_level_0: number | null;
  reasoning_level_1: number | null;
  reasoning_level_2: number | null;
  reasoning_level_3: number | null;
  scaffold_clarification_per_session: number;
  scaffold_convergence_trend: string;
  role_teaching_intent_count: number;
  role_community_application_count: number;
  role_enterprise_orientation_count: number;
  role_intergenerational_count: number;
  certifications_earned_total: number;
  cognitive_score: number | null;
  critical_thinking_score: number | null;
  problem_solving_score: number | null;
  creativity_score: number | null;
  pue_score: number | null;
}

// Mentor presence calendar (mirrors site_mentor_presence table)
const MENTOR_CALENDAR = [
  { start: '2025-07-01', end: '2025-10-31', present: true  },
  { start: '2025-11-01', end: '2026-02-28', present: false },
  { start: '2026-03-01', end: '2099-12-31', present: true  },
];

function mentorPresentForMonth(cohortMonth: string): boolean {
  const d = new Date(cohortMonth);
  for (const p of MENTOR_CALENDAR) {
    if (d >= new Date(p.start) && d <= new Date(p.end)) return p.present;
  }
  return true;
}

const LongitudinalGlobalPanel: React.FC = () => {
  const [rows, setRows]       = useState<LongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Paginate — Supabase caps at 1000 rows per request
        const FIELDS = [
          'learner_token', 'cohort_month', 'site', 'session_count',
          'snapshot_date', 'is_persistent_learner',
          'reasoning_level_0', 'reasoning_level_1', 'reasoning_level_2', 'reasoning_level_3',
          'scaffold_clarification_per_session', 'scaffold_convergence_trend',
          'role_teaching_intent_count', 'role_community_application_count',
          'role_enterprise_orientation_count', 'role_intergenerational_count',
          'certifications_earned_total',
          'cognitive_score', 'critical_thinking_score', 'problem_solving_score',
          'creativity_score', 'pue_score',
        ].join(',');

        const PAGE = 1000;
        let allData: LongRow[] = [];
        let from = 0;
        let keepGoing = true;

        while (keepGoing) {
          const { data, error } = await supabase
            .from('dashboard_stats')
            .select(FIELDS)
            .order('cohort_month', { ascending: true })
            .range(from, from + PAGE - 1);

          if (error) throw error;
          const batch = (data || []) as LongRow[];
          allData = allData.concat(batch);
          if (batch.length < PAGE) {
            keepGoing = false;
          } else {
            from += PAGE;
            if (allData.length >= 20000) keepGoing = false; // safety cap
          }
        }

        console.log(`[LongitudinalPanel] fetched ${allData.length} rows, months:`,
          [...new Set(allData.map(r => r.cohort_month))].sort());

        setRows(allData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center gap-2 py-6 text-gray-400 text-sm">
      <Loader2 size={16} className="animate-spin" /> Loading longitudinal data…
    </div>
  );
  if (error) return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 mb-4">
      Longitudinal data unavailable: {error}
    </div>
  );
  if (rows.length === 0) return null;

  // ── Deduplicate to one row per learner per cohort_month ─────────────────
  // dashboard_stats has one row per learner per activity_date (daily), but all
  // scored fields (session_count, cognitive scores, certs, etc.) are monthly
  // aggregates that repeat identically on every daily row within a cohort_month.
  // First-seen wins — any row within a learner+month is representative.
  const seenKeys = new Set<string>();
  const dedupedRows: LongRow[] = [];
  rows.forEach(r => {
    const key = `${r.learner_token}|${r.cohort_month}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedRows.push(r);
    }
  });

  // ── Compute assessment_cycle client-side ───────────────────────────────────
  // Rank each learner's unique months chronologically → cycle number
  const monthsByLearner: Record<string, string[]> = {};
  dedupedRows.forEach(r => {
    if (!monthsByLearner[r.learner_token]) monthsByLearner[r.learner_token] = [];
    if (!monthsByLearner[r.learner_token].includes(r.cohort_month))
      monthsByLearner[r.learner_token].push(r.cohort_month);
  });
  Object.values(monthsByLearner).forEach(months => months.sort());

  const rowsWithCycle = dedupedRows.map(r => ({
    ...r,
    assessment_cycle: (monthsByLearner[r.learner_token]?.indexOf(r.cohort_month) ?? 0) + 1,
    mentor_present:   mentorPresentForMonth(r.cohort_month),
  }));

  // ── Persistent = learner has >= 2 months ───────────────────────────────────
  const persistent = rowsWithCycle.filter(r =>
    (monthsByLearner[r.learner_token]?.length ?? 0) >= 2
  );

  // All rows for hero stats (not just persistent)
  const allRows = rowsWithCycle;

  // ── Group persistent rows by assessment cycle ──────────────────────────────
  const byCycle: Record<number, typeof rowsWithCycle> = {};
  persistent.forEach(r => {
    const c = r.assessment_cycle;
    if (!byCycle[c]) byCycle[c] = [];
    byCycle[c].push(r);
  });
  const maxCycle = Math.max(...persistent.map(r => r.assessment_cycle), 0);
  const cycles = Array.from({ length: maxCycle }, (_, i) => i + 1).filter(c => byCycle[c]?.length > 0);

  const avg = (arr: typeof rowsWithCycle, key: keyof typeof rowsWithCycle[0]) => {
    const vals = arr.map(r => Number(r[key])).filter(v => !isNaN(v) && v !== 0);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };
  const pct = (n: number, total: number) => total ? Math.round((n / total) * 100) : 0;

  // ── Reasoning — only show when data exists ─────────────────────────────────
  const hasReasoningData = persistent.some(r =>
    r.reasoning_level_3 !== null && r.reasoning_level_3 !== undefined && Number(r.reasoning_level_3) > 0
  );
  const totalSessions = (arr: typeof rowsWithCycle) =>
    arr.reduce((s, r) => s + (Number(r.session_count) || 0), 0);

  const reasoning = hasReasoningData ? cycles.map(c => ({
    cycle: c, n: byCycle[c].length,
    sessions: totalSessions(byCycle[c]),
    l0: avg(byCycle[c], 'reasoning_level_0'),
    l1: avg(byCycle[c], 'reasoning_level_1'),
    l2: avg(byCycle[c], 'reasoning_level_2'),
    l3: avg(byCycle[c], 'reasoning_level_3'),
  })) : [];

  // ── Scaffolding by cycle ───────────────────────────────────────────────────
  // convergingPct excludes 'insufficient_data' rows from denominator
  const scaffolding = cycles.map(c => {
    const rows = byCycle[c];
    const validTrend = rows.filter(r => r.scaffold_convergence_trend !== 'insufficient_data');
    return {
      cycle: c, n: rows.length,
      sessions: totalSessions(rows),
      clarf: avg(rows, 'scaffold_clarification_per_session'),
      convergingPct: validTrend.length
        ? pct(validTrend.filter(r => r.scaffold_convergence_trend === 'converging').length, validTrend.length)
        : null,  // null = all insufficient_data
    };
  });
  const maxClarf = Math.max(...scaffolding.map(s => s.clarf), 1);

  // ── Role readiness by cycle ────────────────────────────────────────────────
  const hasSig = (arr: typeof rowsWithCycle, key: keyof typeof rowsWithCycle[0]) =>
    pct(arr.filter(r => (Number(r[key]) || 0) > 0).length, arr.length);
  const roleReadiness = cycles.map(c => ({
    cycle: c,
    sessions: totalSessions(byCycle[c]),
    teaching:          hasSig(byCycle[c], 'role_teaching_intent_count'),
    community:         hasSig(byCycle[c], 'role_community_application_count'),
    enterprise:        hasSig(byCycle[c], 'role_enterprise_orientation_count'),
    intergenerational: hasSig(byCycle[c], 'role_intergenerational_count'),
  }));

  // ── Natural experiment ─────────────────────────────────────────────────────
  // Absent = Nov 2025–Feb 2026 rows; treat session_count=0 as valid data point
  const mentorAbsent  = allRows.filter(r => !r.mentor_present);
  const mentorPresent = allRows.filter(r => r.mentor_present);
  // Use sum/count directly so zero sessions count (not avg() which skips zeros)
  const sumSessions = (arr: typeof allRows) =>
    arr.reduce((s, r) => s + (Number(r.session_count) || 0), 0);
  const avgAbsent  = mentorAbsent.length  ? sumSessions(mentorAbsent)  / mentorAbsent.length  : 0;
  const avgPresent = mentorPresent.length ? sumSessions(mentorPresent) / mentorPresent.length : 0;
  // Show ratio even when absent avg is 0 — that IS the finding
  const ratio = mentorAbsent.length > 0
    ? avgAbsent > 0
      ? (avgPresent / avgAbsent).toFixed(1)
      : `${avgPresent.toFixed(1)} vs 0`
    : null;

  // ── Hero stats ─────────────────────────────────────────────────────────────
  const cycle1L3    = reasoning.find(r => r.cycle === 1)?.l3 ?? 0;
  const lastCycleL3 = reasoning[reasoning.length - 1]?.l3 ?? 0;
  const l3Growth    = cycle1L3 > 0 ? (lastCycleL3 / cycle1L3).toFixed(1) : null;

  // Scaffolding: only compare cycles with meaningful n (>=5 rows)
  const validScafCycles = scaffolding.filter(s => s.n >= 5);
  const cycle1Clarf  = validScafCycles[0]?.clarf ?? 0;
  const lastValidClarf = validScafCycles[validScafCycles.length - 1]?.clarf ?? 0;
  const clarfDecline = cycle1Clarf > 0 && validScafCycles.length > 1
    ? Math.round((1 - lastValidClarf / cycle1Clarf) * 100)
    : null;

  // Certifications: Supabase returns numbers but coerce defensively
  const totalCerts = allRows.reduce((s, r) => {
    const v = r.certifications_earned_total;
    return s + (v !== null && v !== undefined ? Number(v) : 0);
  }, 0);

  const uniqueMonths   = new Set(allRows.map(r => r.cohort_month)).size;
  const uniqueLearners = new Set(allRows.map(r => r.learner_token)).size;

  // Converging: exclude 'insufficient_data' from denominator
  const validScafRows = (arr: typeof rowsWithCycle) =>
    arr.filter(r => r.scaffold_convergence_trend !== 'insufficient_data');
  const convergingPctValid = (arr: typeof rowsWithCycle) => {
    const valid = validScafRows(arr);
    return valid.length
      ? pct(valid.filter(r => r.scaffold_convergence_trend === 'converging').length, valid.length)
      : 0;
  };

  const roleColors = ['#ddd6fe', '#a78bfa', '#7c3aed'];
  const roleKeys = [
    { key: 'teaching'          as const, label: 'Teaching intent'        },
    { key: 'community'         as const, label: 'Community application'  },
    { key: 'enterprise'        as const, label: 'Enterprise orientation' },
    { key: 'intergenerational' as const, label: 'Intergenerational'      },
  ];

  return (
    <div className="mb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <TrendingUp size={15} className="text-teal-600" />
            <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
              Longitudinal evidence · persistent learners
            </span>
          </div>
          <p className="text-[11px] text-gray-400">
            Hallinan, Hao, Davidson &amp; Clergy (2026) · World Development ·{' '}
            {uniqueLearners} learners · {persistent.length} with 2+ months · {uniqueMonths} month{uniqueMonths !== 1 ? 's' : ''}
          </p>
          <p className="text-[10px] text-gray-300 mt-0.5">
            Cycle = one monthly assessment period. Learners appear in multiple cycles as they return month after month.
          </p>
        </div>
        <span className="text-[10px] text-gray-400 italic">Jul 2025 – present · zero prior computer access</span>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: l3Growth ? 'L3 reasoning growth' : 'Learners tracked',
            value: l3Growth ? `${l3Growth}×` : uniqueLearners,
            sub:   l3Growth ? `cycle 1 → ${cycles.length}` : `across ${uniqueMonths} month${uniqueMonths !== 1 ? 's' : ''}`,
            color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-100',
          },
          {
            label: clarfDecline !== null && clarfDecline > 0 ? 'Less AI scaffolding' : 'Avg clarifications/session',
            value: clarfDecline !== null && clarfDecline > 0 ? `${clarfDecline}%` : cycle1Clarf > 0 ? cycle1Clarf.toFixed(1) : '—',
            sub:   'clarifications/session',
            color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100',
          },
          {
            label: 'Certifications earned',
            value: totalCerts > 0 ? totalCerts : '—',
            sub:   `${uniqueLearners} learners`,
            color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-100',
          },
          {
            label: 'Mentor effect',
            value: ratio ? (ratio.includes('vs') ? ratio : `${ratio}×`) : '—',
            sub:   ratio ? 'avg sessions: present vs absent' : 'no absence period rows yet',
            color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100',
          },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3.5`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[11px] font-semibold text-gray-600 mt-0.5">{s.label}</p>
            <p className="text-[10px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Three-column panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* Reasoning OR cognitive scores fallback */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          {hasReasoningData ? (
            <>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Reasoning level composition</p>
              {reasoning.map(r => (
                <div key={r.cycle} className="mb-2">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-gray-400">Cycle {r.cycle} · {r.n} learner{r.n !== 1 ? 's' : ''}</span>
                    <span className="text-[10px] font-mono text-gray-400">{r.sessions} sessions</span>
                  </div>
                  <div className="flex h-5 rounded overflow-hidden w-full mt-1">
                    <div style={{ width: `${r.l0}%`, background: '#e5e7eb' }} title={`L0: ${r.l0.toFixed(0)}%`} />
                    <div style={{ width: `${r.l1}%`, background: '#1a4a6e' }} title={`L1: ${r.l1.toFixed(0)}%`} className="flex items-center justify-center">
                      {r.l1 > 10 && <span className="text-[8px] text-blue-200 font-bold">L1 {r.l1.toFixed(0)}%</span>}
                    </div>
                    <div style={{ width: `${r.l2}%`, background: '#1a5c5c' }} title={`L2: ${r.l2.toFixed(0)}%`} className="flex items-center justify-center">
                      {r.l2 > 10 && <span className="text-[8px] text-teal-200 font-bold">{r.l2.toFixed(0)}%</span>}
                    </div>
                    <div style={{ width: `${r.l3}%`, background: r.cycle === cycles[cycles.length - 1] ? '#1D9E75' : '#0F6E56' }} title={`L3: ${r.l3.toFixed(0)}%`} className="flex items-center justify-center">
                      {r.l3 > 8 && <span className="text-[8px] text-green-100 font-bold">L3 {r.l3.toFixed(0)}%</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 mt-2 flex-wrap">
                {[{ bg: '#e5e7eb', label: 'L0' }, { bg: '#1a4a6e', label: 'L1' }, { bg: '#1a5c5c', label: 'L2' }, { bg: '#1D9E75', label: 'L3 ↑' }].map(l => (
                  <span key={l.label} className="flex items-center gap-1 text-[10px] text-gray-400">
                    <span style={{ background: l.bg, width: 8, height: 8, borderRadius: 2, display: 'inline-block' }} />{l.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Cognitive skill scores (0–100)</p>
              <p className="text-[10px] text-gray-400 mb-3 italic">Reasoning level data not yet available — showing cognitive scores. Score shifts across cycles reflect changing cohort composition (new learners joining), not individual decline.</p>
              {cycles.map(c => {
                const scores = [
                  { label: 'Cognitive',        val: avg(byCycle[c], 'cognitive_score')         },
                  { label: 'Critical thinking', val: avg(byCycle[c], 'critical_thinking_score') },
                  { label: 'Problem solving',   val: avg(byCycle[c], 'problem_solving_score')   },
                  { label: 'Creativity',        val: avg(byCycle[c], 'creativity_score')        },
                ];
                return (
                  <div key={c} className="mb-3">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[10px] text-gray-400">Cycle {c} · {byCycle[c].length} learner{byCycle[c].length !== 1 ? 's' : ''}</span>
                      <span className="text-[10px] font-mono text-gray-400">{totalSessions(byCycle[c])} sessions</span>
                    </div>
                    {scores.map(s => (
                      <div key={s.label} className="mb-1.5">
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-gray-500">{s.label}</span>
                          <span className="font-mono text-teal-700 font-bold">{s.val.toFixed(0)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-400 rounded-full" style={{ width: `${Math.min(s.val, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Scaffolding + role readiness */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">AI scaffolding demand</p>
            <p className="text-[10px] text-gray-400 mb-2 italic"><strong className="text-gray-500">Clarif/session</strong> = avg number of times per session the AI needed to re-prompt, simplify, or redirect the learner. High values indicate dependence on AI guidance; falling values indicate the learner is forming their own questions and directing the conversation.</p>
            {scaffolding.map(s => (
              <div key={s.cycle} className="mb-2">
                <div className="flex justify-between mb-1 text-[10px]">
                  <span className="text-gray-400">Cycle {s.cycle} · {s.n} learner{s.n !== 1 ? 's' : ''} · <span className="font-mono">{s.sessions} sessions</span></span>
                  <span className="font-mono text-teal-700 font-bold">
                    {s.clarf.toFixed(1)}{s.convergingPct !== null
                      ? <span className="text-green-600"> · {s.convergingPct}% converging</span>
                      : <span className="text-gray-300"> · insufficient data</span>
                    }
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(s.clarf / maxClarf) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Role readiness signals</p>
            <p className="text-[10px] text-gray-400 mb-1 italic">% of learners per cycle whose AI conversations contain evidence of applying learning beyond the platform. Detected automatically via transcript analysis — the AI counts unprompted mentions of each behaviour.</p>
            <p className="text-[10px] text-gray-400 mb-2 italic"><strong className="text-gray-500">Teaching intent</strong> = mentioned plans or actions to teach peers, family, or neighbours. <strong className="text-gray-500">Community application</strong> = applied AI to a real local problem. <strong className="text-gray-500">Enterprise orientation</strong> = referenced a business or income plan. <strong className="text-gray-500">Intergenerational</strong> = knowledge shared across age groups.</p>
            {roleKeys.map(item => (
              <div key={item.key} className="mb-2">
                <p className="text-[10px] text-gray-400 mb-1">{item.label}</p>
                <div className="flex gap-1 items-end h-6">
                  {roleReadiness.map((r, i) => (
                    <div key={r.cycle} className="flex-1 rounded-sm"
                      style={{ height: `${Math.max(4, r[item.key])}%`, background: roleColors[Math.min(i, 2)] }}
                      title={`Cycle ${r.cycle}: ${r[item.key]}% (${r.sessions} sessions, n=${r.n})`} />
                  ))}
                </div>
                <div className="flex mt-0.5">
                  {roleReadiness.map((r, i) => (
                    <span key={r.cycle} className="flex-1 text-center text-[9px]"
                      style={{ color: i === roleReadiness.length - 1 ? '#7c3aed' : '#9ca3af', fontWeight: i === roleReadiness.length - 1 ? 700 : 400 }}>
                      {r[item.key]}%
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Natural experiment */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Natural experiment · mentor presence</p>
          <p className="text-[10px] text-gray-400 mb-3 italic">Nov 2025–Feb 2026: Davidson's daily presence was interrupted. Technology, Starlink, curriculum, and join codes were unchanged. Session counts tracked engagement against a single variable: the facilitator.</p>
          {ratio ? (
            <div className="text-center mb-4">
              <p className="text-4xl font-black text-gray-900">
                {ratio.includes('vs') ? ratio : `${ratio}×`}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {ratio.includes('vs')
                  ? <>avg sessions/learner/month<br/>present vs. absent period</>
                  : <>sessions/learner/month<br/>present vs. absent period</>}
              </p>
              <p className="text-[10px] text-gray-400 mt-1 italic">
                Note: associative finding — no formal significance test. Single site, single absence event. Directionally strong.
              </p>
            </div>
          ) : (
            <div className="text-center mb-4 py-2">
              <p className="text-[11px] text-gray-400 italic">No absence period rows in dataset yet</p>
            </div>
          )}
          <div className="space-y-2">
            {[
              { dot: '#2A7B88', strong: 'Jul–Oct 2025',      text: 'Launch. Davidson present daily.' },
              { dot: '#E65100', strong: 'Nov 2025–Feb 2026', text: 'Davidson absent. Engagement near-zero despite live technology.' },
              { dot: '#2E7D32', strong: 'Mar 2026+',              text: 'Davidson returns. Record session month.' },
            ].map(e => (
              <div key={e.strong} className="flex gap-2 items-start">
                <div style={{ background: e.dot, width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 4 }} />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  <strong className="text-gray-700">{e.strong}:</strong> {e.text}
                </p>
              </div>
            ))}
          </div>
          {mentorAbsent.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-center">
                <p className="text-xs font-bold text-red-700">{avgAbsent.toFixed(1)}</p>
                <p className="text-[10px] text-red-400">sessions/learner<br/>absent</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-lg p-2.5 text-center">
                <p className="text-xs font-bold text-green-700">{avgPresent.toFixed(1)}</p>
                <p className="text-[10px] text-green-400">sessions/learner<br/>present</p>
              </div>
            </div>
          )}
          <p className="text-[10px] text-gray-400 mt-3 italic">
            Technology, connectivity, and curriculum unchanged. The facilitator is the mechanism.
          </p>
        </div>

      </div>
      <div className="border-t border-gray-100 pt-1" />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   PlatformGlobalPanel
   ═══════════════════════════════════════════════════════════════════════════════ */

const PlatformGlobalPanel: React.FC<{
  onSelectOrg: (orgId: string, orgName: string) => void;
}> = ({ onSelectOrg }) => {
  const [orgs, setOrgs] = useState<OrgSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof OrgSummaryRow>('learner_count');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('org_summary').select('*');
        if (error) throw error;
        setOrgs(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleSort = (key: keyof OrgSummaryRow) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const filtered = orgs.filter(o =>
    search === '' ||
    (o.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.country || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.city || '').toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const SortMark = ({ k }: { k: keyof OrgSummaryRow }) =>
    sortKey !== k ? null : sortAsc
      ? <ChevronUp size={11} className="inline ml-0.5 text-purple-500" />
      : <ChevronDown size={11} className="inline ml-0.5 text-purple-500" />;

  const totalLearners = sorted.reduce((s, o) => s + (o.learner_count || 0), 0);
  const totalActive30 = sorted.reduce((s, o) => s + (o.active_30d || 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
      <Loader2 size={20} className="animate-spin" /> Loading organizations…
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
      {error} — make sure the org_summary view was created.
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Organizations', value: orgs.length, bg: 'bg-purple-50', icon: <BarChart2 size={16} className="text-purple-500" /> },
          { label: 'Total learners', value: totalLearners, bg: 'bg-blue-50', icon: <Users size={16} className="text-blue-500" /> },
          { label: 'Active (30d)', value: totalActive30, bg: 'bg-green-50', icon: <TrendingUp size={16} className="text-green-500" /> },
          { label: 'Countries', value: new Set(orgs.map(o => o.country).filter(Boolean)).size, bg: 'bg-amber-50', icon: <BarChart2 size={16} className="text-amber-500" /> },
        ].map(({ label, value, bg, icon }) => (
          <div key={label} className={`${bg} rounded-xl p-4 flex items-center gap-3 border border-white shadow-sm`}>
            {icon}
            <div>
              <p className="text-xl font-black text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <input type="text" placeholder="Search by org, country, or city…"
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {([
                  { key: 'name' as keyof OrgSummaryRow, label: 'Organization' },
                  { key: 'continent' as keyof OrgSummaryRow, label: 'Continent' },
                  { key: 'country' as keyof OrgSummaryRow, label: 'Country' },
                  { key: 'city' as keyof OrgSummaryRow, label: 'City' },
                  { key: 'leader_name' as keyof OrgSummaryRow, label: 'Leader' },
                  { key: 'learner_count' as keyof OrgSummaryRow, label: 'Learners' },
                  { key: 'active_30d' as keyof OrgSummaryRow, label: 'Active 30d' },
                  { key: 'join_code' as keyof OrgSummaryRow, label: 'Join Code' },
                ]).map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)}
                    className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-700 select-none">
                    {label}<SortMark k={key} />
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(org => (
                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900">{org.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{org.continent}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{org.country}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{org.city}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-700">{org.leader_name || '—'}</div>
                    <div className="text-[10px] text-gray-400">{org.leader_email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-800">{org.learner_count}</td>
                  <td className="px-4 py-3 font-mono text-gray-800">{org.active_30d}</td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-700 font-bold tracking-widest">{org.join_code}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onSelectOrg(org.id, org.name)}
                      className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
                      View →
                    </button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">No organizations yet.</td></tr>
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-600" colSpan={5}>Total ({sorted.length} orgs)</td>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-800 font-mono">{totalLearners}</td>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-800 font-mono">{totalActive30}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};


/* ═══════════════════════════════════════════════════════════════════════════════
   PAGE ANALYTICS PANEL
   — Drop-off visibility: page views, engagement rate, exit destinations
   ═══════════════════════════════════════════════════════════════════════════════ */

interface PageStat {
  page: string;
  views: number;
  engaged: number;
  exits: number;
  engagement_pct: number;
}

interface ExitDestination {
  went_to: string;
  count: number;
}

const PAGE_LABELS: Record<string, string> = {
  english_skills:         'English Skills',
  ai_learning:            'AI Learning',
  vibe_coding:            'Vibe Coding',
  web_development:        'Web Development',
  full_stack_development: 'Full Stack Dev',
  ai_image_creation:      'AI Image Creation',
  ai_voice_creation:      'AI Voice Creation',
  ai_video_creation:      'AI Video Creation',
  ai_video_studio:        'AI Video Studio',
  ai_content_creation:    'AI Content Creation',
  ai_workflow_dev:        'AI Workflow Dev',
  ai_for_business:        'AI for Business',
  tech_skills_hub:        'Tech Skills Hub',
  ci_ai_ambassadors:      'CI · AI Ambassadors',
  ci_agriculture:         'CI · Agriculture',
  ci_fishing:             'CI · Fishing',
  ci_healthcare:          'CI · Healthcare',
  ci_entrepreneurship:    'CI · Entrepreneurship',
  ci_animal_husbandry:    'CI · Animal Husbandry',
  home:                   'Home',
  dashboard:              'Dashboard',
  public_landing:         'Landing Page',
  ai_playground:          'AI Playground',
  math_skills:            'Math Skills',
  science_skills:         'Science Skills',
};

const friendlyPage = (p: string) =>
  PAGE_LABELS[p] ?? p.replace(/^other:/, '').replace(/_/g, ' ');

const engagementColor = (pct: number) => {
  if (pct >= 60) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (pct >= 35) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
};

const PageAnalyticsPanel: React.FC = () => {
  const [days, setDays] = useState<7 | 14 | 30 | 90>(30);
  const [stats, setStats] = useState<PageStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [exits, setExits] = useState<ExitDestination[]>([]);
  const [loadingExits, setLoadingExits] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchStats = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    setSelectedPage(null);
    setExits([]);
    try {
      const { data, error: err } = await supabase.rpc('page_engagement_stats', { days_back: d });
      if (err) throw err;
      setStats((data as PageStat[]) ?? []);
      setLastFetched(new Date());
    } catch (e: any) {
      // Fallback: query system_events directly if RPC doesn't exist yet
      try {
        const since = new Date(Date.now() - d * 86400_000).toISOString();
        const { data: raw, error: rawErr } = await supabase
          .from('system_events')
          .select('function_name, event_type')
          .in('event_type', ['page_view', 'page_engaged', 'page_exit'])
          .gte('created_at', since);
        if (rawErr) throw rawErr;

        const map = new Map<string, PageStat>();
        (raw ?? []).forEach(r => {
          const page = r.function_name;
          if (!page) return;
          const s = map.get(page) ?? { page, views: 0, engaged: 0, exits: 0, engagement_pct: 0 };
          if (r.event_type === 'page_view')    s.views++;
          if (r.event_type === 'page_engaged') s.engaged++;
          if (r.event_type === 'page_exit')    s.exits++;
          map.set(page, s);
        });
        const result = [...map.values()].map(s => ({
          ...s,
          engagement_pct: s.views > 0 ? Math.round((s.engaged / s.views) * 100) : 0,
        })).sort((a, b) => b.views - a.views);
        setStats(result);
        setLastFetched(new Date());
      } catch (fallbackErr: any) {
        setError(fallbackErr?.message ?? 'Failed to load page analytics.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExits = useCallback(async (page: string) => {
    setLoadingExits(true);
    setExits([]);
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { data, error: err } = await supabase
      .from('system_events')
      .select('payload')
      .eq('event_type', 'page_exit')
      .eq('function_name', page)
      .gte('created_at', since);
    if (!err && data) {
      const counts = new Map<string, number>();
      data.forEach(r => {
        const dest = (r.payload as any)?.next_page;
        if (dest) counts.set(dest, (counts.get(dest) ?? 0) + 1);
      });
      setExits([...counts.entries()]
        .map(([went_to, count]) => ({ went_to, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8));
    }
    setLoadingExits(false);
  }, [days]);

  // Load on mount
  useEffect(() => { fetchStats(days); }, []);

  const handleSelectPage = (page: string) => {
    if (selectedPage === page) {
      setSelectedPage(null);
      setExits([]);
    } else {
      setSelectedPage(page);
      fetchExits(page);
    }
  };

  const totalViews    = stats.reduce((s, r) => s + r.views, 0);
  const totalEngaged  = stats.reduce((s, r) => s + r.engaged, 0);
  const overallPct    = totalViews > 0 ? Math.round((totalEngaged / totalViews) * 100) : 0;
  const worstPages    = [...stats].sort((a, b) => a.engagement_pct - b.engagement_pct).slice(0, 3);

  return (
    <div className="space-y-5">

      {/* Header + controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingDown size={16} className="text-purple-600" />
          <span className="text-sm font-bold text-gray-700">Page Drop-off Analytics</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {([7, 14, 30, 90] as const).map(d => (
            <button
              key={d}
              onClick={() => { setDays(d); fetchStats(d); }}
              className={classNames(
                'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                days === d
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
              )}
            >{d}d</button>
          ))}
          <button
            onClick={() => fetchStats(days)}
            className="ml-1 p-1.5 text-gray-400 hover:text-purple-600 border border-gray-200 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {lastFetched && (
        <p className="text-[11px] text-gray-400 -mt-3">
          Last fetched {lastFetched.toLocaleTimeString()} · click a row to see where learners went next
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin" /> Loading page analytics…
        </div>
      )}

      {!loading && !error && stats.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">
          No page tracking data yet. Deploy the tracking code and visit some pages first.
        </div>
      )}

      {!loading && stats.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Total Page Views</p>
              <p className="text-2xl font-bold text-gray-900">{totalViews.toLocaleString()}</p>
              <p className="text-xs text-gray-400">last {days} days</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Overall Engagement</p>
              <p className={classNames('text-2xl font-bold', overallPct >= 50 ? 'text-emerald-700' : overallPct >= 30 ? 'text-amber-700' : 'text-red-700')}>
                {overallPct}%
              </p>
              <p className="text-xs text-gray-400">stayed 30+ seconds</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Pages Tracked</p>
              <p className="text-2xl font-bold text-gray-900">{stats.length}</p>
              <p className="text-xs text-gray-400">unique pages visited</p>
            </div>
          </div>

          {/* Lowest engagement callout */}
          {worstPages.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
                <TrendingDown size={13} /> Highest drop-off pages (lowest engagement)
              </p>
              <div className="flex flex-wrap gap-2">
                {worstPages.map(p => (
                  <button
                    key={p.page}
                    onClick={() => handleSelectPage(p.page)}
                    className="text-xs px-2.5 py-1 bg-white border border-amber-200 rounded-lg text-amber-800 font-medium hover:border-amber-400 transition-colors"
                  >
                    {friendlyPage(p.page)} — {p.engagement_pct}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Page</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Views</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Engaged</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Exits</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Engagement</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase w-32">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.map(row => (
                  <React.Fragment key={row.page}>
                    <tr
                      onClick={() => handleSelectPage(row.page)}
                      className={classNames(
                        'cursor-pointer transition-colors',
                        selectedPage === row.page
                          ? 'bg-purple-50'
                          : 'hover:bg-gray-50'
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {friendlyPage(row.page)}
                        {selectedPage === row.page && (
                          <span className="ml-2 text-[10px] text-purple-500 font-normal">▲ exit destinations below</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 font-mono text-xs">{row.views}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 font-mono text-xs">{row.engaged}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 font-mono text-xs">{row.exits}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={classNames(
                          'text-xs px-2 py-0.5 rounded-full border font-semibold',
                          engagementColor(row.engagement_pct)
                        )}>
                          {row.engagement_pct}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={classNames(
                              'h-1.5 rounded-full transition-all',
                              row.engagement_pct >= 60 ? 'bg-emerald-500' :
                              row.engagement_pct >= 35 ? 'bg-amber-500' : 'bg-red-400'
                            )}
                            style={{ width: `${Math.min(row.engagement_pct, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>

                    {/* Exit destinations inline */}
                    {selectedPage === row.page && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 bg-purple-50 border-t border-purple-100">
                          {loadingExits ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <Loader2 size={12} className="animate-spin" /> Loading exit destinations…
                            </div>
                          ) : exits.length === 0 ? (
                            <p className="text-xs text-gray-400">No exit data for this page yet.</p>
                          ) : (
                            <div>
                              <p className="text-[10px] font-bold text-purple-600 uppercase mb-2">
                                Where learners went after {friendlyPage(row.page)}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {exits.map(e => (
                                  <div key={e.went_to} className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-purple-200 rounded-lg text-xs">
                                    <span className="font-medium text-gray-700">{friendlyPage(e.went_to)}</span>
                                    <span className="text-purple-600 font-bold">{e.count}×</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */

const AdminStudentDashboard: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [userRole, setUserRole] = useState<string | null>(null);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/home', { replace: true }); return; }
    supabase.from('profiles').select('role, organization_id')
      .eq('id', user.id).single()
      .then(({ data }) => {
        const role = data?.role ?? '';
        setUserRole(role);
        setUserOrgId(data?.organization_id ?? null);
        setAuthChecked(true);
        if (!ADMIN_IDS.has(user.id) && !DASHBOARD_ROLES.has(role)) {
          navigate('/home', { replace: true });
        }
      });
  }, [user, authLoading, navigate]);

  const isPlatformAdmin = ADMIN_IDS.has(user?.id ?? '') || userRole === 'platform_administrator';
  const isLeader = userRole === 'leader' && !isPlatformAdmin;

  const [activeTab, setActiveTab] = useState<'student' | 'platform-global' | 'model-overview' | 'cost-overview' | 'cost-learner' | 'page-analytics'>(
    ADMIN_IDS.has(user?.id ?? '') ? 'platform-global' : 'student'
  );

  const [learners, setLearners] = useState<Learner[]>([]);
  const [loadingLearners, setLoadingLearners] = useState(true);
  const [learnersError, setLearnersError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');

  const [studentSessionRows, setStudentSessionRows] = useState<StudentSessionRow[]>([]);
  const [loadingStudentSummary, setLoadingStudentSummary] = useState(false);
  const [studentSummaryError, setStudentSummaryError] = useState<string | null>(null);

  const [leaderOrgs, setLeaderOrgs] = useState<{ id: string; name: string; join_code: string; city: string | null }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [leaderJoinCodes, setLeaderJoinCodes] = useState<string[]>([]);

  const [allOrgs, setAllOrgs] = useState<OrgOption[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [adminSelectedOrgId, setAdminSelectedOrgId] = useState<string>('');
  const [costOrgId, setCostOrgId] = useState<string>('');

  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [loadingCost, setLoadingCost] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [costDays, setCostDays] = useState<number>(30);
  const [costGroupBy, setCostGroupBy] = useState<'page' | 'model' | 'provider'>('page');
  const [learnerCostRows, setLearnerCostRows] = useState<CostRow[]>([]);
  const [loadingLearnerCost, setLoadingLearnerCost] = useState(false);

  // Fetch all orgs for platform admin
  useEffect(() => {
    if (!isPlatformAdmin || !authChecked) return;
    (async () => {
      setLoadingOrgs(true);
      try {
        const { data: orgData, error: orgErr } = await supabase
          .from('organizations')
          .select('id, name, join_code, join_codes, continent, country, city, leader_id')
          .order('name');
        if (orgErr) throw orgErr;

        const { data: profileData } = await supabase
          .from('profiles')
          .select('organization_id')
          .not('organization_id', 'is', null);

        const countMap: Record<string, number> = {};
        (profileData || []).forEach(p => {
          if (p.organization_id) countMap[p.organization_id] = (countMap[p.organization_id] || 0) + 1;
        });

        const orgsWithCounts: OrgOption[] = (orgData || []).map(o => ({
          ...o,
          join_codes: o.join_codes || null,
          learner_count: countMap[o.id] || 0,
        }));
        setAllOrgs(orgsWithCounts);
      } catch (err: any) {
        console.error('Failed to load orgs:', err.message);
      } finally {
        setLoadingOrgs(false);
      }
    })();
  }, [isPlatformAdmin, authChecked]);

  // Fetch leader orgs
  useEffect(() => {
    if (!isLeader || !user?.id) return;
    (async () => {
      const { data: ownedOrgs } = await supabase
        .from('organizations')
        .select('id, name, join_code, join_codes, city')
        .eq('leader_id', user.id);

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('join_code_used, organization_id')
        .eq('id', user.id)
        .single();

      const codes: string[] = [];
      const orgs: typeof leaderOrgs = [];

      if (ownedOrgs?.length) {
        for (const org of ownedOrgs) {
          orgs.push({ id: org.id, name: org.name, join_code: org.join_code, city: org.city });
          const orgCodes: string[] = Array.isArray(org.join_codes) && org.join_codes.length
            ? org.join_codes
            : org.join_code ? [org.join_code] : [];
          codes.push(...orgCodes);
        }
      } else if (myProfile?.join_code_used) {
        codes.push(myProfile.join_code_used);
        if (myProfile.organization_id) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id, name, join_code, city')
            .eq('id', myProfile.organization_id)
            .single();
          if (orgData) orgs.push(orgData);
        }
      }

      setLeaderOrgs(orgs);
      setLeaderJoinCodes([...new Set(codes)]);
      setSelectedOrgId(orgs[0]?.id ?? myProfile?.organization_id ?? null);
    })();
  }, [isLeader, user?.id]);

  // Compute admin org join codes inline
  const adminOrgJoinCodes: string[] = adminSelectedOrgId && adminSelectedOrgId !== '__all__'
    ? getJoinCodesForOrg(allOrgs, adminSelectedOrgId)
    : [];

  // Effective org for learner fetch — either Student Activity selection or Per-Learner Cost selection
  const effectiveOrgId = adminSelectedOrgId || costOrgId;
  const effectiveOrgJoinCodes: string[] = effectiveOrgId && effectiveOrgId !== '__all__'
    ? getJoinCodesForOrg(allOrgs, effectiveOrgId)
    : [];

  // Fetch learners
  useEffect(() => {
    if (!authChecked) return;
    if (isPlatformAdmin && !effectiveOrgId) {
      setLearners([]);
      setLoadingLearners(false);
      return;
    }

    (async () => {
      setLoadingLearners(true);
      try {
        let query = supabase
          .from('profiles')
          .select('id, name, email, grade_level, continent, country, organization_id, join_code_used')
          .order('name', { ascending: true });

        if (isLeader) {
          if (leaderJoinCodes.length > 0) {
            query = query.in('join_code_used', leaderJoinCodes);
          } else {
            const orgId = selectedOrgId || userOrgId;
            if (orgId) query = query.eq('organization_id', orgId);
          }
        } else if (isPlatformAdmin) {
          if (effectiveOrgId === '__all__') {
            // No filter
          } else if (effectiveOrgJoinCodes.length > 0) {
            query = query.in('join_code_used', effectiveOrgJoinCodes);
          } else {
            query = query.eq('organization_id', effectiveOrgId);
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        setLearners((data || []).filter(l => !EXCLUDED_IDS.has(l.id)));
      } catch (err: any) {
        setLearnersError(err.message || 'Failed to load learners');
      } finally {
        setLoadingLearners(false);
      }
    })();
  }, [authChecked, isLeader, isPlatformAdmin, leaderJoinCodes, selectedOrgId, userOrgId, effectiveOrgId, effectiveOrgJoinCodes.join(',')]);

  const fetchStudentSummary = useCallback(async () => {
    if (!learners.length) { setStudentSessionRows([]); return; }
    setLoadingStudentSummary(true);
    setStudentSummaryError(null);
    try {
      const learnerIds = learners.map((l) => l.id);
      const { data, error } = await supabase
        .from('dashboard')
        .select('user_id, category_activity, progress, activity, created_at, updated_at')
        .in('user_id', learnerIds)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setStudentSessionRows((data || []) as StudentSessionRow[]);
    } catch (err: any) {
      setStudentSummaryError(err.message || 'Failed to load student session summary');
      setStudentSessionRows([]);
    } finally {
      setLoadingStudentSummary(false);
    }
  }, [learners]);

  useEffect(() => {
    if (activeTab !== 'student') return;
    fetchStudentSummary();
  }, [activeTab, fetchStudentSummary]);

  const fetchCostData = useCallback(async (days: number) => {
    setLoadingCost(true);
    setCostError(null);
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      console.log(`[fetchCostData] fetching ${days} days since ${since}`);

      // Supabase server caps at 1000 rows per request — paginate to get all rows
      const PAGE = 1000;
      let allRows: CostRow[] = [];
      let from = 0;
      let keepGoing = true;

      while (keepGoing) {
        const { data, error } = await supabase
          .from('api_cost_log')
          .select('id, logged_at, page, provider, model, input_tokens, output_tokens, cache_hit_tokens, cache_write_tokens, estimated_cost_usd, user_id, city')
          .gte('logged_at', since)
          .order('logged_at', { ascending: false })
          .range(from, from + PAGE - 1);

        if (error) throw error;
        const batch = data || [];
        allRows = allRows.concat(batch);
        console.log(`[fetchCostData] page from=${from} got ${batch.length} rows, total=${allRows.length}`);
        if (batch.length < PAGE) {
          keepGoing = false;
        } else {
          from += PAGE;
          // Safety cap: don't fetch more than 10k rows for the admin dashboard
          if (allRows.length >= 10000) keepGoing = false;
        }
      }

      console.log(`[fetchCostData] final: ${allRows.length} rows for ${days}d window`);
      setCostRows(allRows);
    } catch (err: any) {
      setCostError(err.message || 'Failed to load cost data');
    } finally {
      setLoadingCost(false);
    }
  }, []);

  const fetchLearnerCost = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoadingLearnerCost(true);
    try {
      const { data } = await supabase
        .from('api_cost_log')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(1000);
      setLearnerCostRows(data || []);
    } catch { setLearnerCostRows([]); }
    finally { setLoadingLearnerCost(false); }
  }, []);

  // Initial load on mount — buttons now call fetchCostData(d) directly so this
  // only needs to run once on mount, not on every costDays change.
  useEffect(() => { fetchCostData(costDays); }, []);

  useEffect(() => {
    if (selectedId && activeTab === 'cost-learner') fetchLearnerCost(selectedId);
    if (!selectedId) setLearnerCostRows([]);
  }, [selectedId, activeTab, fetchLearnerCost]);

  const fetchData = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoadingData(true);
    setDataError(null);
    setActivities([]);
    setFilterCat('all');
    try {
      const { data, error } = await supabase
        .from('dashboard')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setActivities(data || []);
    } catch (err: any) {
      setDataError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchData(selectedId); }, [selectedId, fetchData]);

  if (authLoading || !user || !authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-purple-500" />
      </div>
    );
  }

  const selectedLearner = learners.find(l => l.id === selectedId) || null;
  const certRows = activities.filter(a => a.category_activity === 'Certification');
  const learningRows = activities.filter(a => a.category_activity !== 'Certification' && a.activity !== 'english_skills');
  const uniqueCategories = [...new Set(learningRows.map(a => a.category_activity).filter(Boolean))].sort();
  const filteredLearning = filterCat === 'all' ? learningRows : learningRows.filter(a => a.category_activity === filterCat);
  const completedLearning = learningRows.filter(a => a.progress === 'completed').length;
  const completedCerts = certRows.filter(a => a.progress === 'completed').length;

  const adminSelectedOrgName = adminSelectedOrgId === '__all__'
    ? 'All Organizations'
    : (allOrgs.find(o => o.id === adminSelectedOrgId)?.name || '');

  // Shared learner detail renderer
  const renderLearnerDetail = () => (
    <div id="student-dashboard-detail">
      {loadingData && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 size={20} className="animate-spin" /> Loading dashboard…
        </div>
      )}
      {dataError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">
          <AlertCircle size={16} /> {dataError}
        </div>
      )}
      {!loadingData && selectedId && activities.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Learning Activities', value: learningRows.length, icon: <BookOpen size={18} className="text-blue-500" />, bg: 'bg-blue-50' },
              { label: 'Completed', value: completedLearning, icon: <CheckCircle size={18} className="text-green-500" />, bg: 'bg-green-50' },
              { label: 'Certifications', value: certRows.length, icon: <Trophy size={18} className="text-purple-500" />, bg: 'bg-purple-50' },
              { label: 'Certs Completed', value: completedCerts, icon: <Award size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
            ].map(({ label, value, icon, bg }) => (
              <div key={label} className={`${bg} rounded-xl p-4 flex items-center gap-3 border border-white shadow-sm`}>
                {icon}
                <div>
                  <p className="text-xl font-black text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 leading-tight">{label}</p>
                </div>
              </div>
            ))}
          </div>
          {certRows.length > 0 && (
            <section>
              <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Trophy size={16} className="text-purple-600" /> Certifications
                <span className="text-xs font-normal text-gray-400">({certRows.length})</span>
              </h2>
              <div className="space-y-2">
                {certRows.map(row => <ActivityCard key={row.id} row={row} />)}
              </div>
            </section>
          )}
          {learningRows.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <BookOpen size={16} className="text-blue-600" /> Learning Activities
                  <span className="text-xs font-normal text-gray-400">({filteredLearning.length}/{learningRows.length})</span>
                </h2>
                {uniqueCategories.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {['all', ...uniqueCategories].map(cat => (
                      <button key={cat} onClick={() => setFilterCat(cat)}
                        className={classNames(
                          'px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                          filterCat === cat
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-700'
                        )}>
                        {cat === 'all' ? `All (${learningRows.length})` : cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {filteredLearning.map(row => <ActivityCard key={row.id} row={row} />)}
              </div>
            </section>
          )}
        </div>
      )}
      {!loadingData && selectedId && activities.length === 0 && !dataError && (
        <div className="text-center py-16 text-gray-400">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No dashboard rows found for this learner.</p>
        </div>
      )}
      {!selectedId && !loadingLearners && (
        <div className="text-center py-20 text-gray-400">
          <Users size={44} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm">Select a learner above to view their dashboard.</p>
        </div>
      )}
    </div>
  );

  // Shared learner selector
  const renderLearnerSelector = () => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
      <label className="block text-sm font-semibold text-gray-700 mb-2">Select Learner</label>
      {loadingLearners ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" /> Loading learners…
        </div>
      ) : learnersError ? (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle size={16} /> {learnersError}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="">— Choose a learner ({learners.length} total) —</option>
              {learners.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name || '(no name)'} — {l.email || l.id.slice(0, 8)}
                  {l.grade_level ? ` · Grade ${l.grade_level}` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {selectedId && (
            <button onClick={() => fetchData(selectedId)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
              <RefreshCw size={14} /> Refresh
            </button>
          )}
        </div>
      )}
      {selectedLearner && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-100">
          <span className="flex items-center gap-1"><User size={11} className="text-gray-400" />{selectedLearner.name || '—'}</span>
          <span className="text-gray-300">|</span>
          <span>{selectedLearner.email || '—'}</span>
          {selectedLearner.grade_level && <><span className="text-gray-300">|</span><span>Grade {selectedLearner.grade_level}</span></>}
          {selectedLearner.country && <><span className="text-gray-300">|</span><span>{selectedLearner.country}</span></>}
          <span className="text-gray-300">|</span>
          <span className="font-mono text-gray-400 text-[10px]">{selectedLearner.id}</span>
        </div>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <Users size={22} className="text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            {authChecked && (isPlatformAdmin || isLeader) && (
              <div className="ml-auto">
                <NewsManager
                  isPlatformAdmin={isPlatformAdmin}
                  userOrgId={userOrgId}
                  userOrgName={
                    isPlatformAdmin
                      ? null
                      : (allOrgs.find(o => o.id === userOrgId)?.name
                          ?? leaderOrgs.find(o => o.id === userOrgId)?.name
                          ?? null)
                  }
                  allOrgs={allOrgs}
                />
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 ml-9">Student activity, certification scores, and API cost analytics.</p>
        </div>

        <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
          {([
            { id: 'platform-global' as const, label: 'Global Overview', icon: <Globe size={14} />, show: isPlatformAdmin },
            { id: 'student' as const, label: 'Student Activity', icon: <BookOpen size={14} />, show: true },
            { id: 'model-overview' as const, label: 'Model Overview', icon: <Server size={14} />, show: isPlatformAdmin },
            { id: 'cost-overview' as const, label: 'Cost Overview', icon: <DollarSign size={14} />, show: isPlatformAdmin },
            { id: 'cost-learner' as const, label: 'Per-Learner Cost', icon: <Activity size={14} />, show: isPlatformAdmin },
            { id: 'page-analytics' as const, label: 'Page Dropoffs', icon: <TrendingDown size={14} />, show: isPlatformAdmin },
          ]).filter(t => t.show).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={classNames(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                activeTab === tab.id
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── STUDENT ACTIVITY TAB ────────────────────────────────────── */}
        {activeTab === 'student' && (
          <div>
            {isPlatformAdmin && !adminSelectedOrgId && (
              <OrgSelectorGrid
                orgs={allOrgs}
                onSelectOrg={(orgId) => { setAdminSelectedOrgId(orgId); setSelectedId(''); }}
                onSelectAll={() => { setAdminSelectedOrgId('__all__'); setSelectedId(''); }}
                loading={loadingOrgs}
              />
            )}

            {isPlatformAdmin && adminSelectedOrgId && (
              <>
                <OrgBanner orgName={adminSelectedOrgName} onBack={() => { setAdminSelectedOrgId(''); setSelectedId(''); }} />
                <StudentLearnerTable
                  learners={learners} sessionRows={studentSessionRows}
                  loading={loadingStudentSummary || loadingLearners}
                  error={studentSummaryError || learnersError}
                  onSelectLearner={(id) => setSelectedId(id)} selectedId={selectedId}
                  isPlatformAdmin={isPlatformAdmin} canViewStudentDashboard={true}
                />
                {renderLearnerSelector()}
                {renderLearnerDetail()}
              </>
            )}

            {isLeader && (
              <>
                {leaderOrgs.length > 1 && (
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <span className="text-sm font-semibold text-gray-600">Viewing org:</span>
                    <div className="flex gap-2 flex-wrap">
                      {leaderOrgs.map(org => (
                        <button key={org.id} onClick={() => setSelectedOrgId(org.id)}
                          className={classNames(
                            'px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors',
                            selectedOrgId === org.id
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                          )}>
                          {org.name}
                          {org.city && <span className="text-xs opacity-70 ml-1">· {org.city}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {leaderJoinCodes.length > 0 && (
                  <div className="mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-700">Showing learners who joined with your code{leaderJoinCodes.length > 1 ? 's' : ''}:</span>
                    {leaderJoinCodes.map(code => (
                      <span key={code} className="font-mono text-xs font-black text-indigo-900 bg-white border border-indigo-200 rounded px-2 py-0.5">{code}</span>
                    ))}
                  </div>
                )}
                <StudentLearnerTable
                  learners={learners} sessionRows={studentSessionRows}
                  loading={loadingStudentSummary || loadingLearners}
                  error={studentSummaryError || learnersError}
                  onSelectLearner={(id) => setSelectedId(id)} selectedId={selectedId}
                  isPlatformAdmin={false} canViewStudentDashboard={true}
                />
                {renderLearnerSelector()}
                {renderLearnerDetail()}
              </>
            )}
          </div>
        )}

        {activeTab === 'platform-global' && (
          <>
            <LongitudinalGlobalPanel />
            <PlatformGlobalPanel
              onSelectOrg={(orgId, orgName) => {
                setAdminSelectedOrgId(orgId);
                setActiveTab('student');
              }}
            />
          </>
        )}

        {activeTab === 'model-overview' && (
          <ModelOverviewPanel
            rows={costRows} loading={loadingCost} error={costError}
            days={costDays} setDays={(d) => { console.log(`[parent] model setDays(${d}), costRows=${costRows.length}`); setCostDays(d); fetchCostData(d); }}
            onRefresh={() => fetchCostData(costDays)}
          />
        )}

        {activeTab === 'cost-overview' && (
          <CostOverviewPanel
            rows={costRows} loading={loadingCost} error={costError}
            days={costDays} setDays={(d) => { console.log(`[parent] cost setDays(${d}), costRows=${costRows.length}`); setCostDays(d); fetchCostData(d); }}
            groupBy={costGroupBy} setGroupBy={setCostGroupBy}
            onRefresh={() => fetchCostData(costDays)}
          />
        )}

        {activeTab === 'cost-learner' && (
          <LearnerCostPanel
            learners={learners} selectedId={selectedId}
            setSelectedId={(id) => { setSelectedId(id); if (id) fetchLearnerCost(id); }}
            allCostRows={costRows} learnerRows={learnerCostRows}
            loading={loadingCost} loadingDetail={loadingLearnerCost}
            onRefresh={() => selectedId ? fetchLearnerCost(selectedId) : fetchCostData(costDays)}
            isPlatformAdmin={isPlatformAdmin} allOrgs={allOrgs}
            costOrgId={costOrgId} setCostOrgId={setCostOrgId} loadingOrgs={loadingOrgs}
            days={costDays} setDays={(d) => { console.log(`[parent] learner setDays(${d}), costRows=${costRows.length}`); setCostDays(d); fetchCostData(d); }}
          />
        )}

        {activeTab === 'page-analytics' && (
          <PageAnalyticsPanel />
        )}

      </div>
    </AppLayout>
  );
};

export default AdminStudentDashboard;