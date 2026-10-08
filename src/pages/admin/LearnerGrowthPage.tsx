import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  AREA_LABELS,
  areaShares,
  composite,
  describeChange,
  change,
  fetchLearnerGrowth,
  hasProgression,
  skillChanges,
  type Area,
  type LearnerGrowth,
} from '../../lib/learnerGrowth';

// For facilitators and researchers: how each learner is doing now compared with
// when they started. Never a ranking of learners against each other. The data
// function refuses anyone who is not staff, and limits site leaders to their own site.

const AREAS: Area[] = ['learning', 'foundational', 'tech_skills', 'community_impact', 'ai_playground'];
const AREA_COLORS: Record<Area, string> = {
  learning: 'bg-blue-500',
  foundational: 'bg-amber-500',
  tech_skills: 'bg-emerald-600',
  community_impact: 'bg-rose-500',
  ai_playground: 'bg-violet-500',
  unmapped: 'bg-gray-400',
};

type SortKey = 'sessions' | 'name' | 'started';

const monthLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '–';

function MixBar({ by }: { by: LearnerGrowth['by_area'] }) {
  const total = AREAS.reduce((s, a) => s + (by[a] ?? 0), 0);
  if (total === 0) return <span className="text-gray-400">–</span>;
  return (
    <div>
      <div className="flex h-2.5 w-36 overflow-hidden rounded bg-gray-100" aria-hidden="true">
        {AREAS.filter((a) => (by[a] ?? 0) > 0).map((a) => (
          <div key={a} className={AREA_COLORS[a]} style={{ width: `${((by[a] ?? 0) / total) * 100}%` }} />
        ))}
      </div>
      <p className="sr-only">
        {AREAS.filter((a) => (by[a] ?? 0) > 0).map((a) => `${AREA_LABELS[a]} ${by[a]}`).join(', ')}
      </p>
    </div>
  );
}

function MixShift({ l }: { l: LearnerGrowth }) {
  const early = areaShares(l.early_mix);
  const recent = areaShares(l.recent_mix);
  if (!early || !recent) {
    return <span className="text-gray-400">{l.total_sessions < 50 ? 'Needs 50 sessions' : '–'}</span>;
  }
  const shown: Area[] = ['learning', 'tech_skills', 'community_impact'];
  return (
    <ul className="space-y-0.5">
      {shown.map((a) => (
        <li key={a} className="whitespace-nowrap">
          {AREA_LABELS[a]} {early[a] ?? 0}% → {recent[a] ?? 0}%
        </li>
      ))}
    </ul>
  );
}

export default function LearnerGrowthPage() {
  const [rows, setRows] = useState<LearnerGrowth[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'refused' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [minSessions, setMinSessions] = useState(0);
  const [org, setOrg] = useState('all');
  const [sort, setSort] = useState<SortKey>('sessions');

  useEffect(() => {
    let cancelled = false;
    fetchLearnerGrowth(supabase)
      .then((data) => { if (!cancelled) { setRows(data); setState('ready'); } })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setState(String(err?.message ?? '').includes('not authorized') ? 'refused' : 'error');
      });
    return () => { cancelled = true; };
  }, []);

  const orgs = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.organization).filter((o): o is string => !!o))].sort(),
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (rows ?? []).filter(
      (r) =>
        r.total_sessions >= minSessions &&
        (org === 'all' || r.organization === org) &&
        (q === '' || (r.name ?? '').toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => {
      if (sort === 'name') return (a.name ?? '').localeCompare(b.name ?? '');
      if (sort === 'started') return (a.first_session_at ?? '9').localeCompare(b.first_session_at ?? '9');
      return b.total_sessions - a.total_sessions;
    });
  }, [rows, query, minSessions, org, sort]);

  if (state === 'loading') return <div className="p-6 text-gray-600">Loading learner growth…</div>;
  if (state === 'refused') {
    return (
      <div className="max-w-xl p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">This page is for facilitators and researchers</h1>
        <p className="text-gray-600">Ask a site leader or administrator if you need access.</p>
      </div>
    );
  }
  if (state === 'error') {
    return <div className="p-6 text-red-700" role="alert">We could not load this page just now. Please try again in a moment.</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900">Learner growth</h1>
      <p className="mt-1 text-sm text-gray-600 max-w-3xl">
        How each learner is doing now compared with when they started. Sessions are real sessions only. Skill
        scores come from the monthly assessment and are compared between a learner's first and latest assessed
        month, so they need at least two. Prompt Challenge results appear here once learners have taken it.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="g-search" className="block text-xs font-medium text-gray-700">Find a learner</label>
          <input id="g-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name"
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor="g-min" className="block text-xs font-medium text-gray-700">Sessions</label>
          <select id="g-min" value={minSessions} onChange={(e) => setMinSessions(Number(e.target.value))}
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            <option value={0}>All learners</option>
            <option value={25}>25 or more</option>
            <option value={50}>50 or more</option>
            <option value={100}>100 or more</option>
          </select>
        </div>
        {orgs.length > 1 && (
          <div>
            <label htmlFor="g-org" className="block text-xs font-medium text-gray-700">Organization</label>
            <select id="g-org" value={org} onChange={(e) => setOrg(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm">
              <option value="all">All</option>
              {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="g-sort" className="block text-xs font-medium text-gray-700">Order by</label>
          <select id="g-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            <option value="sessions">Most sessions</option>
            <option value="started">Earliest start</option>
            <option value="name">Name</option>
          </select>
        </div>
        <p className="text-sm text-gray-600 pb-1.5" aria-live="polite">{shown.length} learners</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {AREAS.map((a) => (
          <span key={a} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${AREA_COLORS[a]}`} aria-hidden="true" />{AREA_LABELS[a]}
          </span>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th scope="col" className="px-3 py-2">Learner</th>
              <th scope="col" className="px-3 py-2">Started</th>
              <th scope="col" className="px-3 py-2">Sessions by area</th>
              <th scope="col" className="px-3 py-2">First 25 → latest 25</th>
              <th scope="col" className="px-3 py-2">Skills, first → latest</th>
              <th scope="col" className="px-3 py-2">Clarifications per session</th>
              <th scope="col" className="px-3 py-2">Certs</th>
              <th scope="col" className="px-3 py-2">Prompt Challenge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 align-top">
            {shown.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">No learners match.</td></tr>
            )}
            {shown.map((l) => {
              const skills = skillChanges(l);
              const clar = l.first_assessment && l.latest_assessment ? change(l.first_assessment.clarifications, l.latest_assessment.clarifications) : null;
              const revisitOrig = composite(l.revisit?.original);
              const revisitNew = composite(l.revisit?.new);
              const cps = l.checkpoints ? Object.entries(l.checkpoints).sort((a, b) => Number(a[0]) - Number(b[0])) : [];
              return (
                <tr key={l.learner_id}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-gray-900">
                    {l.name ?? 'Unnamed'}
                    {l.organization && <div className="text-xs font-normal text-gray-500">{l.organization}</div>}
                  </th>
                  <td className="px-3 py-2 whitespace-nowrap">{monthLabel(l.first_session_at)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.total_sessions}</div>
                    <MixBar by={l.by_area} />
                  </td>
                  <td className="px-3 py-2 text-xs"><MixShift l={l} /></td>
                  <td className="px-3 py-2 text-xs">
                    {hasProgression(l) ? (
                      <ul className="space-y-0.5">
                        {skills.map((s) => (
                          <li key={s.key} className="whitespace-nowrap">
                            {s.label}: {s.first ?? '–'} → {s.latest ?? '–'} <span className="text-gray-600">({describeChange(s.delta)})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-400">
                        {l.assessed_months === 1 ? 'One assessed month so far' : 'Not assessed yet'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {hasProgression(l) && l.first_assessment && l.latest_assessment
                      ? <>{l.first_assessment.clarifications ?? '–'} → {l.latest_assessment.clarifications ?? '–'} <span className="text-gray-600">({describeChange(clar)})</span></>
                      : <span className="text-gray-400">–</span>}
                  </td>
                  <td className="px-3 py-2">{l.certifications}</td>
                  <td className="px-3 py-2 text-xs">
                    {revisitOrig != null && revisitNew != null && (
                      <div className="whitespace-nowrap">First session → redo: {revisitOrig} → {revisitNew} <span className="text-gray-600">({describeChange(change(revisitOrig, revisitNew))})</span></div>
                    )}
                    {cps.length > 0 && (
                      <div className="whitespace-nowrap">{cps.map(([cp, score]) => `${cp} sessions: ${score}`).join(' · ')}</div>
                    )}
                    {revisitOrig == null && cps.length === 0 && <span className="text-gray-400">None yet</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
