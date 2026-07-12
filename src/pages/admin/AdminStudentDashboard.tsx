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
  Server, Building2, Search, Globe, Sparkles, Send, Eye, Sprout,
} from 'lucide-react';
import classNames from 'classnames';
import { useImpersonation } from '../../contexts/ImpersonationContext';

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

interface CommunityImpactRow {
  domain: string;
  id: string;
  youth_user_id: string;
  organization_id: string | null;
  city: string | null;
  resolved: boolean;
  resolution_outcome: 'applied' | 'partially_applied' | 'not_applied' | null;
  resolution_value_amount: number | null;
  resolution_value_unit: 'NGN' | 'kg' | 'days_averted' | 'animals_saved' | 'other' | null;
  resolution_value_label: string | null;
  created_at: string;
  resolved_at: string | null;
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
   PlatformGlobalPanel
   ═══════════════════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════════════
// CREATE CHALLENGE PANEL — platform_administrator override for
// generate-weekly-challenges. Two-step flow: Preview (dry_run, writes
// nothing) then Publish (the real insert). The 14-day timing gate is
// respected by default — checking "override normal timing" sends force:true
// and bypasses it, for when an admin genuinely wants an out-of-cycle
// challenge rather than just steering the next scheduled one.
// ═══════════════════════════════════════════════════════════════════════════

const CHALLENGE_TEMPLATE_OPTIONS = [
  { slug: 'ai-ambassadors',    label: 'AI Ambassadors' },
  { slug: 'agriculture',       label: 'Agriculture Consultant' },
  { slug: 'fishing',           label: 'Fishing Consultant' },
  { slug: 'healthcare',        label: 'Healthcare Navigator' },
  { slug: 'entrepreneurship',  label: 'Entrepreneurship Consultant' },
  { slug: 'animal-husbandry',  label: 'Animal Husbandry' },
];

const CHALLENGE_TIER_OPTIONS = [
  { value: 'seed',       label: 'Seed — Community Teacher' },
  { value: 'scout',      label: 'Scout — Problem Finder' },
  { value: 'bridge',     label: 'Bridge — Community Connector' },
  { value: 'builder',    label: 'Builder — AI for Good' },
  { value: 'multiplier', label: 'Multiplier — Village Leader' },
];

type GeneratedPreview = {
  title: string;
  description: string;
  challenge_mode_intro: string;
  challenge_instruction: string;
  return_question_1: string;
  return_question_2: string;
  return_question_3: string | null;
  community_role: string;
};

const CreateChallengePanel: React.FC = () => {
  const [orgId, setOrgId] = useState<'oloibiri' | 'ibiade'>('oloibiri');
  const [templateSlug, setTemplateSlug] = useState<string>('');
  const [tier, setTier] = useState<string>('');
  const [adminTopic, setAdminTopic] = useState('');
  const [overrideTiming, setOverrideTiming] = useState(false);

  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ weekStart: string; weekEnd: string; slug: string; tier: string } | null>(null);
  const [skipped, setSkipped] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (dryRun: boolean) => ({
    org_id: orgId,
    dry_run: dryRun,
    force: overrideTiming,
    ...(templateSlug ? { force_slug: templateSlug } : {}),
    ...(tier ? { force_tier: tier } : {}),
    ...(adminTopic.trim() ? { admin_topic: adminTopic.trim() } : {}),
  });

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);
    setSkipped(null);
    setPreview(null);
    setPublishResult(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('generate-weekly-challenges', {
        body: buildPayload(true),
      });
      if (invokeErr) throw invokeErr;
      const orgResult = data?.results?.[orgId];
      if (orgResult?.skipped) {
        setSkipped(orgResult.reason ?? 'Skipped — too soon since the last challenge.');
      } else if (orgResult?.generated) {
        setPreview(orgResult.generated);
        setPreviewMeta({
          weekStart: orgResult.weekStart, weekEnd: orgResult.weekEnd,
          slug: orgResult.template, tier: orgResult.tier,
        });
      } else if (orgResult?.error) {
        setError(orgResult.error);
      } else {
        setError('Unexpected response — check the function logs.');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setPreviewing(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('generate-weekly-challenges', {
        body: buildPayload(false),
      });
      if (invokeErr) throw invokeErr;
      const orgResult = data?.results?.[orgId];
      if (orgResult?.skipped) {
        setSkipped(orgResult.reason ?? 'Skipped — too soon since the last challenge.');
      } else if (orgResult?.inserted) {
        setPublishResult({ ok: true, message: `Published: "${orgResult.title}" (${orgResult.weekStart} → runs 14 days)` });
        setPreview(null);
      } else if (orgResult?.error) {
        setError(orgResult.error);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Create Community Challenge
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Steer or fully override the next generated challenge. Leave a field blank to let the normal rotation decide it.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Org */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Organization</label>
            <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5">
              {(['oloibiri', 'ibiade'] as const).map(o => (
                <button key={o} onClick={() => setOrgId(o)}
                  className={classNames(
                    'px-4 py-1.5 rounded-full text-sm font-semibold transition-colors capitalize',
                    orgId === o ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  )}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Template slug */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">
              Challenge topic <span className="font-normal normal-case text-gray-400">(optional — blank lets rotation choose)</span>
            </label>
            <select value={templateSlug} onChange={e => setTemplateSlug(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="">— Let rotation decide —</option>
              {CHALLENGE_TEMPLATE_OPTIONS.map(t => (
                <option key={t.slug} value={t.slug}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Tier */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">
              Tier <span className="font-normal normal-case text-gray-400">(optional — blank lets rotation choose)</span>
            </label>
            <select value={tier} onChange={e => setTier(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="">— Let rotation decide —</option>
              {CHALLENGE_TIER_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Admin topic / direction */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">
              Direction for this challenge <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <textarea value={adminTopic} onChange={e => setAdminTopic(e.target.value)}
              rows={3} placeholder="e.g. There's a cholera risk after the recent flooding — focus the challenge on that."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none" />
            <p className="text-xs text-gray-400 mt-1">
              Claude still writes the actual challenge — same voice and grounding as every other challenge — but will prioritize this over the generic examples.
            </p>
          </div>

          {/* Override timing */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={overrideTiming} onChange={e => setOverrideTiming(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-purple-600 focus:ring-purple-400" />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">Override normal 14-day timing.</span>{' '}
              <span className="text-gray-400">Off by default — leave unchecked to create what would be the next scheduled challenge, just with your inputs. Check this only if you want a challenge outside the normal cycle.</span>
            </span>
          </label>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button onClick={handlePreview} disabled={previewing || publishing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition-colors">
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview
            </button>
            <button onClick={handlePublish} disabled={publishing || previewing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors">
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publish
            </button>
            {(preview || previewMeta) && (
              <span className="text-xs text-gray-400">Preview shown below — nothing published yet.</span>
            )}
          </div>
        </div>
      </div>

      {/* Skipped */}
      {skipped && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Skipped — timing gate</p>
            <p className="text-xs text-amber-700 mt-0.5">{skipped}</p>
            <p className="text-xs text-amber-600 mt-1">Check "Override normal 14-day timing" above if you want to publish anyway.</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Publish confirmation */}
      {publishResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-700 font-semibold">{publishResult.message}</p>
        </div>
      )}

      {/* Preview content */}
      {preview && previewMeta && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Preview — {previewMeta.slug} · {previewMeta.tier}
            </span>
            <span className="text-xs text-gray-400">{previewMeta.weekStart} → {previewMeta.weekEnd}</span>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1">Title</p>
              <p className="text-sm font-bold text-gray-900">{preview.title}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1">Dashboard description</p>
              <p className="text-sm text-gray-700">{preview.description}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1">Mission briefing</p>
              <p className="text-sm text-gray-700">{preview.challenge_mode_intro}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1">Instruction</p>
              <p className="text-sm text-gray-700">{preview.challenge_instruction}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1">Return questions</p>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>{preview.return_question_1}</li>
                <li>{preview.return_question_2}</li>
                {preview.return_question_3 && <li>{preview.return_question_3}</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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

  const [activeTab, setActiveTab] = useState<'student' | 'platform-global' | 'create-challenge' | 'model-overview' | 'cost-overview' | 'cost-learner' | 'community-impact'>(
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

  // (adminOrgJoinCodes removed - unused)

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
  }, [authChecked, isLeader, isPlatformAdmin, leaderJoinCodes.join(','), selectedOrgId, userOrgId, effectiveOrgId, effectiveOrgJoinCodes.join(',')]);

  // ── Community Impact rollup ("47 consultations this quarter, ~₦380,000...") ─
  const [communityImpactRows, setCommunityImpactRows] = useState<CommunityImpactRow[]>([]);
  const [loadingCommunityImpact, setLoadingCommunityImpact] = useState(false);
  const [communityImpactError, setCommunityImpactError] = useState<string | null>(null);

  const communityImpactOrgId = isPlatformAdmin ? effectiveOrgId : (selectedOrgId || userOrgId);

  useEffect(() => {
    if (activeTab !== 'community-impact' || !authChecked) return;
    if (isPlatformAdmin && !communityImpactOrgId) { setCommunityImpactRows([]); return; }

    (async () => {
      setLoadingCommunityImpact(true);
      setCommunityImpactError(null);
      try {
        let query = supabase.from('community_impact_resolutions').select('*');
        if (communityImpactOrgId && communityImpactOrgId !== '__all__') {
          query = query.eq('organization_id', communityImpactOrgId);
        }
        const { data, error } = await query;
        if (error) throw error;
        setCommunityImpactRows((data || []) as CommunityImpactRow[]);
      } catch (err: any) {
        setCommunityImpactError(err.message || 'Failed to load community impact data');
      } finally {
        setLoadingCommunityImpact(false);
      }
    })();
  }, [activeTab, authChecked, isPlatformAdmin, communityImpactOrgId]);

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
          </div>
          <p className="text-sm text-gray-500 ml-9">Student activity, certification scores, and API cost analytics.</p>
        </div>

        <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
          {([
            { id: 'platform-global' as const, label: 'Global Overview', icon: <Globe size={14} />, show: isPlatformAdmin },
            { id: 'create-challenge' as const, label: 'Create Challenge', icon: <Sparkles size={14} />, show: isPlatformAdmin },
            { id: 'student' as const, label: 'Student Activity', icon: <BookOpen size={14} />, show: true },
            { id: 'community-impact' as const, label: 'Community Impact', icon: <Sprout size={14} />, show: isPlatformAdmin || isLeader },
            { id: 'model-overview' as const, label: 'Model Overview', icon: <Server size={14} />, show: isPlatformAdmin },
            { id: 'cost-overview' as const, label: 'Cost Overview', icon: <DollarSign size={14} />, show: isPlatformAdmin },
            { id: 'cost-learner' as const, label: 'Per-Learner Cost', icon: <Activity size={14} />, show: isPlatformAdmin },
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

        {activeTab === 'community-impact' && (
          <div>
            {isPlatformAdmin && !adminSelectedOrgId && (
              <OrgSelectorGrid
                orgs={allOrgs}
                onSelectOrg={(orgId) => setAdminSelectedOrgId(orgId)}
                onSelectAll={() => setAdminSelectedOrgId('__all__')}
                loading={loadingOrgs}
              />
            )}

            {(!isPlatformAdmin || adminSelectedOrgId) && (() => {
              const rows = communityImpactRows;
              const total = rows.length;
              const resolvedRows = rows.filter(r => r.resolved);
              const resolvedCount = resolvedRows.length;
              const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

              const unitLabels: Record<string, string> = {
                NGN: '₦ estimated value', kg: 'kg', days_averted: 'days of illness avoided',
                animals_saved: 'animals saved', other: 'other value',
              };
              const unitSums: Record<string, number> = {};
              resolvedRows.forEach(r => {
                if (r.resolution_value_unit && r.resolution_value_amount != null) {
                  unitSums[r.resolution_value_unit] = (unitSums[r.resolution_value_unit] || 0) + r.resolution_value_amount;
                }
              });

              const domains = ['agriculture', 'fishing', 'healthcare', 'entrepreneurship', 'animal_husbandry'];
              const domainStats = domains.map(d => {
                const domainRows = rows.filter(r => r.domain === d);
                const domainResolved = domainRows.filter(r => r.resolved).length;
                return { domain: d, total: domainRows.length, resolved: domainResolved };
              }).filter(d => d.total > 0);

              return (
                <>
                  {isPlatformAdmin && (
                    <OrgBanner orgName={adminSelectedOrgName} onBack={() => setAdminSelectedOrgId('')} />
                  )}

                  {loadingCommunityImpact ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                      <Loader2 size={24} className="animate-spin" />
                    </div>
                  ) : communityImpactError ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                      {communityImpactError} — make sure the community_impact_resolutions view was created.
                    </div>
                  ) : total === 0 ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
                      No consultations recorded yet for this org.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                          <p className="text-2xl font-black text-gray-900">{total}</p>
                          <p className="text-xs font-semibold text-gray-500 mt-0.5">Total consultations</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                          <p className="text-2xl font-black text-emerald-600">{resolvedCount}</p>
                          <p className="text-xs font-semibold text-gray-500 mt-0.5">Resolved</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                          <p className="text-2xl font-black text-indigo-600">{resolutionRate}%</p>
                          <p className="text-xs font-semibold text-gray-500 mt-0.5">Resolution rate</p>
                        </div>
                        {Object.entries(unitSums).map(([unit, sum]) => (
                          <div key={unit} className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-2xl font-black text-amber-600">
                              {unit === 'NGN' ? `₦${sum.toLocaleString()}` : sum.toLocaleString()}
                            </p>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">{unitLabels[unit] || unit}</p>
                          </div>
                        ))}
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Domain</th>
                              <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Total</th>
                              <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Resolved</th>
                              <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {domainStats.map(d => (
                              <tr key={d.domain} className="border-b border-gray-100 last:border-0">
                                <td className="px-4 py-2.5 capitalize text-gray-800">{d.domain.replace('_', ' ')}</td>
                                <td className="px-4 py-2.5 text-right text-gray-800">{d.total}</td>
                                <td className="px-4 py-2.5 text-right text-gray-800">{d.resolved}</td>
                                <td className="px-4 py-2.5 text-right text-gray-800">{d.total > 0 ? Math.round((d.resolved / d.total) * 100) : 0}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {activeTab === 'create-challenge' && <CreateChallengePanel />}

        {activeTab === 'platform-global' && (
          <PlatformGlobalPanel
            onSelectOrg={(orgId) => {
              setAdminSelectedOrgId(orgId);
              setActiveTab('student');
            }}
          />
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

      </div>
    </AppLayout>
  );
};

export default AdminStudentDashboard;