// src/pages/TeamPage.tsx
//
// Team workspace at /team, for leaders and the platform team only. One place for: the documentation
// library, change proposals (docs/CHANGE-PROCESS.md), open tasks, and the review schedule that shows
// what is due. Access is enforced by the database (see migration 20261017120000_team_workspace.sql);
// the checks here only decide what to show.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, ExternalLink, CheckCircle2, Clock, AlertTriangle, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { DOC_GROUPS, PRIVATE_DOCS, docUrl, REPO_URL } from '../lib/teamDocs';
import { dueInfo, describeDue, sortByUrgency, type ReviewItem } from '../lib/teamReviews';

const TEAM_ROLES = new Set(['leader', 'site_leader', 'research_lead', 'platform_administrator']);
const PLATFORM_ROLES = new Set(['research_lead', 'platform_administrator']);

type Tab = 'overview' | 'documents' | 'changes' | 'tasks' | 'reviews';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'changes', label: 'Changes' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reviews', label: 'Reviews' },
];

interface Proposal {
  id: string; title: string; problem: string; who_affected: string | null; evidence: string | null;
  smallest_change: string | null; cost_effort: string | null; success_measure: string | null;
  touches_children: boolean; tier: 'A' | 'B' | 'C';
  status: 'proposed' | 'candidate' | 'not_now' | 'approved' | 'building' | 'released' | 'checked';
  decision_note: string | null; audience: 'all_leaders' | 'platform_team'; created_by: string | null; created_at: string;
}
interface Task {
  id: string; title: string; details: string | null; area: string; status: 'open' | 'doing' | 'done';
  owner_id: string | null; due_date: string | null; doc_path: string | null;
  audience: 'all_leaders' | 'platform_team'; created_by: string | null; created_at: string;
}

const STATUS_LABEL: Record<Proposal['status'], string> = {
  proposed: 'Proposed', candidate: 'Candidate', not_now: 'Not now', approved: 'Approved',
  building: 'Building', released: 'Released', checked: 'Checked',
};
const STATUS_ORDER = Object.keys(STATUS_LABEL) as Proposal['status'][];
const TIER_HELP: Record<Proposal['tier'], string> = {
  A: 'Routine: a fix or small improvement',
  B: 'Significant: new feature, new AI vendor, or new data',
  C: 'High impact: consent, children shown publicly, data across borders, retention, new country',
};
const AREAS = ['general', 'safeguarding', 'privacy', 'security', 'learning', 'partners', 'oloibiri', 'funding'];

const card = 'bg-white border border-gray-200 rounded-xl p-5';
const input = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm';
const btn = 'px-3 py-1.5 rounded-md text-sm font-medium';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';

const DueBadge: React.FC<{ item: ReviewItem }> = ({ item }) => {
  const info = dueInfo(item);
  const tone = info.state === 'never' || info.state === 'overdue'
    ? 'bg-red-50 text-red-700 border-red-200'
    : info.state === 'soon' ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${tone}`}>{describeDue(info)}</span>;
};

const TeamPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role as string | undefined;
  const isTeam = !!role && TEAM_ROLES.has(role);
  const isPlatform = !!role && PLATFORM_ROLES.has(role);

  const [tab, setTab] = useState<Tab>('overview');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [p, t, r] = await Promise.all([
      supabase.from('change_proposals').select('*').order('created_at', { ascending: false }),
      supabase.from('team_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('review_items').select('*').order('title'),
    ]);
    if (p.error || t.error || r.error) {
      setError('We could not load the team workspace just now. Please try again in a moment.');
    } else {
      setProposals((p.data ?? []) as Proposal[]);
      setTasks((t.data ?? []) as Task[]);
      setReviews((r.data ?? []) as ReviewItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isTeam) void load(); else setLoading(false); }, [isTeam, load]);

  const urgent = useMemo(
    () => sortByUrgency(reviews).filter(r => ['never', 'overdue', 'soon'].includes(dueInfo(r).state)),
    [reviews],
  );
  const openTasks = tasks.filter(t => t.status !== 'done');
  const toTriage = proposals.filter(p => p.status === 'proposed');

  if (!user) return null;
  if (!isTeam) {
    return (
      <div className="max-w-xl mx-auto p-8 text-gray-700" role="alert">
        This page is for group leaders and the platform team. If you think you should have access, ask the platform team.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Team workspace</h1>
      <p className="text-sm text-gray-600 mt-1">
        Documents, change proposals, open tasks and reviews that are due. Only leaders and the platform team can see this page.
      </p>

      <div className="flex gap-1 mt-6 border-b border-gray-200 overflow-x-auto" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            {t.label}
            {t.id === 'reviews' && urgent.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">{urgent.length}</span>}
            {t.id === 'tasks' && openTasks.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">{openTasks.length}</span>}
            {t.id === 'changes' && isPlatform && toTriage.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">{toTriage.length}</span>}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 p-3 rounded-md bg-red-50 text-red-700 text-sm" role="alert">{error}</div>}
      {loading && <div className="mt-6 text-gray-500 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>}

      {!loading && tab === 'overview' && (
        <Overview urgent={urgent} openTasks={openTasks} toTriage={toTriage} isPlatform={isPlatform} go={setTab} />
      )}
      {!loading && tab === 'documents' && <Documents />}
      {!loading && tab === 'changes' && <Changes proposals={proposals} isPlatform={isPlatform} userId={user.id} reload={load} />}
      {!loading && tab === 'tasks' && <Tasks tasks={tasks} isPlatform={isPlatform} userId={user.id} reload={load} />}
      {!loading && tab === 'reviews' && <Reviews reviews={reviews} isPlatform={isPlatform} userId={user.id} reload={load} />}
    </div>
  );
};

// ── Overview ─────────────────────────────────────────────────────────────────────────────────
const Overview: React.FC<{
  urgent: ReviewItem[]; openTasks: Task[]; toTriage: Proposal[]; isPlatform: boolean; go: (t: Tab) => void;
}> = ({ urgent, openTasks, toTriage, isPlatform, go }) => (
  <div className="mt-6 grid gap-4 md:grid-cols-3">
    <div className={card}>
      <div className="flex items-center gap-2 font-semibold text-gray-900"><AlertTriangle size={18} className="text-red-500" /> Reviews needed</div>
      {urgent.length === 0 ? <p className="text-sm text-gray-500 mt-3">Nothing is due. </p> : (
        <ul className="mt-3 stack-y-2">
          {urgent.slice(0, 5).map(r => (
            <li key={r.id} className="text-sm"><span className="text-gray-800">{r.title}</span> <DueBadge item={r} /></li>
          ))}
        </ul>
      )}
      <button className="mt-3 text-sm text-blue-700 hover:underline" onClick={() => go('reviews')}>All reviews</button>
    </div>
    <div className={card}>
      <div className="flex items-center gap-2 font-semibold text-gray-900"><Clock size={18} className="text-amber-500" /> Open tasks</div>
      {openTasks.length === 0 ? <p className="text-sm text-gray-500 mt-3">No open tasks.</p> : (
        <ul className="mt-3 stack-y-2">
          {openTasks.slice(0, 5).map(t => (
            <li key={t.id} className="text-sm text-gray-800">{t.title}{t.due_date && <span className="text-gray-500"> · due {fmtDate(t.due_date)}</span>}</li>
          ))}
        </ul>
      )}
      <button className="mt-3 text-sm text-blue-700 hover:underline" onClick={() => go('tasks')}>All tasks</button>
    </div>
    <div className={card}>
      <div className="flex items-center gap-2 font-semibold text-gray-900"><FileText size={18} className="text-blue-500" /> Change proposals</div>
      <p className="text-sm text-gray-700 mt-3">
        {toTriage.length === 0 ? 'No proposals waiting.' : `${toTriage.length} waiting for triage${isPlatform ? '' : ' by the platform team'}.`}
      </p>
      <button className="mt-3 text-sm text-blue-700 hover:underline" onClick={() => go('changes')}>Propose or review changes</button>
    </div>
    <div className={`${card} md:col-span-3`}>
      <div className="font-semibold text-gray-900">How we work</div>
      <p className="text-sm text-gray-700 mt-2">
        Anyone on the team can propose a change. The platform team triages proposals weekly and plans monthly. Anything that touches
        children's information, consent or safety gets a privacy and safety check and a second reviewer. Read the full process in the{' '}
        <a className="text-blue-700 underline" href={docUrl('docs/CHANGE-PROCESS.md')} target="_blank" rel="noopener noreferrer">change process</a>.
      </p>
    </div>
  </div>
);

// ── Documents ────────────────────────────────────────────────────────────────────────────────
const Documents: React.FC = () => (
  <div className="mt-6 stack-y-6">
    {DOC_GROUPS.map(g => (
      <section key={g.id}>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{g.label}</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {g.docs.map(d => (
            <li key={d.path} className={card}>
              <a href={docUrl(d.path)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline inline-flex items-center gap-1.5">
                {d.title} <ExternalLink size={14} />
              </a>
              <p className="text-sm text-gray-600 mt-1">{d.about}</p>
              {d.word && (
                <a href={docUrl(d.word)} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:underline mt-2 inline-block">Word copy</a>
              )}
            </li>
          ))}
        </ul>
      </section>
    ))}
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Held privately</h2>
      <ul className="stack-y-2">
        {PRIVATE_DOCS.map(d => (
          <li key={d.title} className="text-sm text-gray-700"><strong>{d.title}.</strong> {d.where}</li>
        ))}
      </ul>
      <p className="text-xs text-gray-500 mt-4">
        The documents above are kept in the project's repository ({REPO_URL.replace('https://', '')}) and open in a new tab.
      </p>
    </section>
  </div>
);

// ── Changes ──────────────────────────────────────────────────────────────────────────────────
const emptyProposal = {
  title: '', problem: '', who_affected: '', evidence: '', smallest_change: '', cost_effort: '',
  success_measure: '', touches_children: false, tier: 'A' as Proposal['tier'],
};

const Changes: React.FC<{ proposals: Proposal[]; isPlatform: boolean; userId: string; reload: () => Promise<void> }> = ({ proposals, isPlatform, userId, reload }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyProposal);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const { error } = await supabase.from('change_proposals').insert({
      ...form,
      tier: form.touches_children && form.tier === 'A' ? 'B' : form.tier,
      created_by: userId,
    });
    setSaving(false);
    if (error) { setMsg('We could not save the proposal. Please try again.'); return; }
    setForm(emptyProposal); setAdding(false); await reload();
  };

  const update = async (id: string, patch: Partial<Proposal>) => {
    const { error } = await supabase.from('change_proposals').update(patch).eq('id', id);
    if (error) setMsg('That change was not saved.'); else await reload();
  };

  const shown = proposals.filter(p => filter === 'all' || !['checked', 'not_now'].includes(p.status));

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 text-sm">
          <button className={`${btn} ${filter === 'open' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`} onClick={() => setFilter('open')}>Active</button>
          <button className={`${btn} ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`} onClick={() => setFilter('all')}>All</button>
        </div>
        <button className={`${btn} bg-blue-600 text-white inline-flex items-center gap-1`} onClick={() => setAdding(a => !a)}>
          <Plus size={16} /> Propose a change
        </button>
      </div>
      {msg && <div className="mt-3 p-3 rounded-md bg-red-50 text-red-700 text-sm" role="alert">{msg}</div>}

      {adding && (
        <form onSubmit={submit} className={`${card} mt-4 stack-y-3`}>
          <p className="text-sm text-gray-600">Keep it short. A good proposal says what problem it solves, for whom, and how we will know it worked.</p>
          <label className="block text-sm font-medium">Title
            <input required minLength={3} className={input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">What problem does this solve?
            <textarea required rows={3} className={input} value={form.problem} onChange={e => setForm({ ...form, problem: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">Who is affected?
            <input className={input} value={form.who_affected} onChange={e => setForm({ ...form, who_affected: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">How do we know? (what you saw or heard)
            <textarea rows={2} className={input} value={form.evidence} onChange={e => setForm({ ...form, evidence: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">Smallest change that would help
            <textarea rows={2} className={input} value={form.smallest_change} onChange={e => setForm({ ...form, smallest_change: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">Cost and effort (roughly)
            <input className={input} value={form.cost_effort} onChange={e => setForm({ ...form, cost_effort: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">How will we know it worked?
            <input className={input} value={form.success_measure} onChange={e => setForm({ ...form, success_measure: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.touches_children} onChange={e => setForm({ ...form, touches_children: e.target.checked })} />
            This touches children's information, consent, safety or how children are judged
          </label>
          <label className="block text-sm font-medium">Size of change
            <select className={input} value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value as Proposal['tier'] })}>
              {(['A', 'B', 'C'] as const).map(t => <option key={t} value={t}>{t}: {TIER_HELP[t]}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button disabled={saving} className={`${btn} bg-blue-600 text-white`} type="submit">{saving ? 'Saving…' : 'Submit proposal'}</button>
            <button type="button" className={`${btn} bg-gray-100`} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}

      <ul className="mt-4 stack-y-3">
        {shown.length === 0 && <li className="text-sm text-gray-500">No proposals here yet.</li>}
        {shown.map(p => (
          <li key={p.id} className={card}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-gray-900">{p.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {fmtDate(p.created_at)} · Size {p.tier}{p.touches_children ? ' · touches children' : ''}{p.created_by === userId ? ' · yours' : ''}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{STATUS_LABEL[p.status]}</span>
            </div>
            <p className="text-sm text-gray-700 mt-2"><strong>Problem:</strong> {p.problem}</p>
            {p.smallest_change && <p className="text-sm text-gray-700 mt-1"><strong>Smallest change:</strong> {p.smallest_change}</p>}
            {p.success_measure && <p className="text-sm text-gray-700 mt-1"><strong>Success measure:</strong> {p.success_measure}</p>}
            {p.decision_note && <p className="text-sm text-gray-700 mt-1"><strong>Decision:</strong> {p.decision_note}</p>}
            {p.tier !== 'A' && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                {p.tier === 'C'
                  ? 'High impact: needs sign-off from the security advisor and the child-protection lead, and the privacy documents change first.'
                  : 'Significant: needs a privacy and safety check and a reviewer who did not propose it.'}
              </p>
            )}
            {isPlatform && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <select aria-label="Status" className="border border-gray-300 rounded-md px-2 py-1 text-sm" value={p.status}
                  onChange={e => void update(p.id, { status: e.target.value as Proposal['status'] })}>
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <select aria-label="Size" className="border border-gray-300 rounded-md px-2 py-1 text-sm" value={p.tier}
                  onChange={e => void update(p.id, { tier: e.target.value as Proposal['tier'] })}>
                  {(['A', 'B', 'C'] as const).map(t => <option key={t} value={t}>Size {t}</option>)}
                </select>
                <DecisionNote value={p.decision_note ?? ''} onSave={v => update(p.id, { decision_note: v })} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const DecisionNote: React.FC<{ value: string; onSave: (v: string) => Promise<void> }> = ({ value, onSave }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <span className="flex gap-1 flex-1 min-w-[200px]">
      <input aria-label="Decision note" placeholder="Decision note (why)" className="border border-gray-300 rounded-md px-2 py-1 text-sm flex-1" value={v} onChange={e => setV(e.target.value)} />
      <button className={`${btn} bg-gray-100`} disabled={v === value} onClick={() => void onSave(v)}>Save</button>
    </span>
  );
};

// ── Tasks ────────────────────────────────────────────────────────────────────────────────────
const Tasks: React.FC<{ tasks: Task[]; isPlatform: boolean; userId: string; reload: () => Promise<void> }> = ({ tasks, isPlatform, userId, reload }) => {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('general');
  const [due, setDue] = useState('');
  const [platformOnly, setPlatformOnly] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('team_tasks').insert({
      title, area, due_date: due || null, created_by: userId, owner_id: userId,
      audience: platformOnly && isPlatform ? 'platform_team' : 'all_leaders',
    });
    if (error) { setMsg('The task was not saved.'); return; }
    setTitle(''); setDue(''); setMsg(null); await reload();
  };
  const set = async (t: Task, patch: Partial<Task>) => {
    const { error } = await supabase.from('team_tasks').update(patch).eq('id', t.id);
    if (error) setMsg('That change was not saved.'); else await reload();
  };

  const shown = tasks.filter(t => showDone || t.status !== 'done');

  return (
    <div className="mt-6">
      <form onSubmit={add} className={`${card} flex gap-2 flex-wrap items-end`}>
        <label className="flex-1 min-w-[200px] text-sm font-medium">New task
          <input required minLength={3} className={input} value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="text-sm font-medium">Area
          <select className={input} value={area} onChange={e => setArea(e.target.value)}>
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Due
          <input type="date" className={input} value={due} onChange={e => setDue(e.target.value)} />
        </label>
        {isPlatform && (
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={platformOnly} onChange={e => setPlatformOnly(e.target.checked)} /> Platform team only</label>
        )}
        <button className={`${btn} bg-blue-600 text-white`} type="submit">Add</button>
      </form>
      {msg && <div className="mt-3 p-3 rounded-md bg-red-50 text-red-700 text-sm" role="alert">{msg}</div>}
      <label className="flex items-center gap-2 text-sm mt-4"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show finished tasks</label>
      <ul className="mt-3 stack-y-2">
        {shown.length === 0 && <li className="text-sm text-gray-500">No tasks.</li>}
        {shown.map(t => {
          const overdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date(new Date().toDateString());
          return (
            <li key={t.id} className={`${card} flex items-start gap-3`}>
              <button aria-label={t.status === 'done' ? 'Reopen task' : 'Mark done'} className="mt-0.5"
                onClick={() => void set(t, { status: t.status === 'done' ? 'open' : 'done', done_at: t.status === 'done' ? null : new Date().toISOString() } as Partial<Task>)}>
                <CheckCircle2 size={20} className={t.status === 'done' ? 'text-emerald-600' : 'text-gray-300'} />
              </button>
              <div className="flex-1">
                <div className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {t.area}{t.owner_id === userId ? ' · yours' : ''}{t.audience === 'platform_team' ? ' · platform team only' : ''}
                  {t.due_date && <span className={overdue ? 'text-red-600 font-semibold' : ''}> · due {fmtDate(t.due_date)}</span>}
                </div>
                {t.doc_path && <a className="text-xs text-blue-700 hover:underline" href={docUrl(t.doc_path)} target="_blank" rel="noopener noreferrer">Related document</a>}
              </div>
              {t.status !== 'done' && (
                <select aria-label="Status" className="border border-gray-300 rounded-md px-2 py-1 text-xs" value={t.status}
                  onChange={e => void set(t, { status: e.target.value as Task['status'] })}>
                  <option value="open">Open</option>
                  <option value="doing">In progress</option>
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ── Reviews ──────────────────────────────────────────────────────────────────────────────────
const Reviews: React.FC<{ reviews: ReviewItem[]; isPlatform: boolean; userId: string; reload: () => Promise<void> }> = ({ reviews, isPlatform, userId, reload }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const sorted = useMemo(() => sortByUrgency(reviews), [reviews]);

  const done = async (r: ReviewItem) => {
    const note = window.prompt(`Reviewed "${r.title}". Add a short note (optional):`) ?? undefined;
    setBusy(r.id); setMsg(null);
    const { error } = await supabase.rpc('mark_reviewed', { p_id: r.id, p_note: note || null });
    setBusy(null);
    if (error) setMsg('That review was not recorded.'); else await reload();
  };

  return (
    <div className="mt-6">
      <p className="text-sm text-gray-600">Each item comes round on its own schedule. Mark it reviewed once you have looked at the document and fixed what needed fixing.</p>
      {msg && <div className="mt-3 p-3 rounded-md bg-red-50 text-red-700 text-sm" role="alert">{msg}</div>}
      <ul className="mt-4 stack-y-3">
        {sorted.map(r => {
          const info = dueInfo(r);
          return (
            <li key={r.id} className={card}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-gray-900">{r.title}</div>
                  {r.description && <p className="text-sm text-gray-600 mt-1">{r.description}</p>}
                  <div className="text-xs text-gray-500 mt-1">
                    Every {r.cadence_days} days · last reviewed {fmtDate(r.last_reviewed_at)}{info.dueAt ? ` · next ${fmtDate(info.dueAt.toISOString())}` : ''}
                    {r.audience === 'platform_team' ? ' · platform team only' : ''}
                  </div>
                  {r.doc_path && <a className="text-xs text-blue-700 hover:underline" href={docUrl(r.doc_path)} target="_blank" rel="noopener noreferrer">Open the document</a>}
                </div>
                <div className="flex items-center gap-2">
                  <DueBadge item={r} />
                  {(isPlatform || r.audience === 'all_leaders') && (
                    <button disabled={busy === r.id} className={`${btn} bg-gray-900 text-white`} onClick={() => void done(r)}>
                      {busy === r.id ? 'Saving…' : 'Mark reviewed'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default TeamPage;
