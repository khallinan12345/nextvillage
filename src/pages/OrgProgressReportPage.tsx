import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import {
  DIMENSIONS,
  STEADY_BAND,
  hasScores,
  showScore,
  trend,
  type OrgProgressReport,
  type Trend,
} from '../lib/orgProgress';

// Monthly progress report for an organization's own learners. Site leaders, teachers and facilitators see
// their own organization; platform administrators choose one. The database function refuses everyone else
// and limits each person to their own organization, so this page cannot show another organization's learners.
// Scores only: nothing the learners wrote, no AI comments about them.

const ARROW: Record<Exclude<Trend, null>, string> = { up: '↑', down: '↓', steady: '→' };
const ARROW_LABEL: Record<Exclude<Trend, null>, string> = { up: 'up', down: 'down', steady: 'steady' };

/** The last six full months, newest first, as the first day of each month. */
function recentMonths(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      value: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    });
  }
  return out;
}

export default function OrgProgressReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'platform_administrator';
  const months = useMemo(recentMonths, []);
  const [month, setMonth] = useState(months[0].value);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [orgId, setOrgId] = useState('');
  const [report, setReport] = useState<OrgProgressReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('organizations').select('id, name').eq('is_listed', true).order('name')
      .then(({ data }) => {
        setOrgs((data ?? []) as { id: string; name: string }[]);
        if (data && data.length && !orgId) setOrgId((data as { id: string }[])[0].id);
      });
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user?.id) return;
    if (isAdmin && !orgId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const { data, error: rpcError } = await supabase.rpc('get_org_progress_report', {
        p_month: month,
        p_org: isAdmin ? orgId : null,
      });
      if (cancelled) return;
      setLoading(false);
      if (rpcError) {
        setReport(null);
        setError(rpcError.message.includes('not authorized')
          ? 'This report is for site leaders, teachers and facilitators of an organization.'
          : rpcError.message);
        return;
      }
      setReport(data as OrgProgressReport);
    })();
    return () => { cancelled = true; };
  }, [user?.id, isAdmin, orgId, month]);

  const learners = report?.learners ?? [];
  const scored = learners.filter(l => hasScores(l.current));
  const quiet = learners.filter(l => !hasScores(l.current));
  const avg = (key: typeof DIMENSIONS[number][0]) => {
    const vals = scored.map(l => l.current?.[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null;
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900">Monthly progress report</h1>
      <p className="text-sm text-gray-600 mt-1 max-w-3xl">
        How your learners are doing, from the monthly assessment. The scores are AI estimates from 0 to 100 of how a learner thought
        and worked in their sessions. They are not school grades. Spelling, grammar and English level are not scored, and a low number
        does not mean a child is failing: shared devices, power cuts and a hard month all show up. Use the report to decide who to
        talk to and who to encourage, and look at the direction over several months. You see only your own organization.
      </p>

      <div className="flex flex-wrap items-end gap-4 mt-4">
        {isAdmin && (
          <label className="text-sm font-medium text-gray-800">Organization
            <select className="mt-1 block border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" value={orgId} onChange={e => setOrgId(e.target.value)}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm font-medium text-gray-800">Month
          <select className="mt-1 block border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" value={month} onChange={e => setMonth(e.target.value)}>
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="mt-6 text-sm text-gray-500">Loading…</p>}
      {error && <p className="mt-6 text-sm text-red-700" role="alert">{error}</p>}

      {report && !loading && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">{report.org}</h2>
          <p className="text-sm text-gray-700 mt-1">
            {scored.length} of {learners.length} enrolled learners have a score for this month; {quiet.length} had too little activity to score.
          </p>
          {scored.length > 0 && (
            <p className="text-sm text-gray-700 mt-1">
              <strong>Group average:</strong>{' '}
              {DIMENSIONS.map(([k, label]) => `${label} ${showScore(avg(k))}`).join(' · ')}
            </p>
          )}

          {scored.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-300 text-left">
                    <th className="py-2 pr-4">Learner</th>
                    {DIMENSIONS.map(([k, label]) => <th key={k} className="py-2 px-3 text-center">{label}</th>)}
                    <th className="py-2 px-3 text-center">Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map((l, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-2 pr-4 font-medium text-gray-900">{l.name ?? 'Unnamed learner'}</td>
                      {DIMENSIONS.map(([k]) => {
                        const now = l.current?.[k] ?? null;
                        const t = trend(now, l.previous?.[k]);
                        return (
                          <td key={k} className="py-2 px-3 text-center tabular-nums">
                            {showScore(now)}{t && <span className="ml-1" title={ARROW_LABEL[t]} aria-label={ARROW_LABEL[t]}>{ARROW[t]}</span>}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-center tabular-nums">{l.current?.sessions ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 mt-2">
                ↑ up, ↓ down, → steady (within {STEADY_BAND} points) compared with the month before. A dash means no score. Below 10 shows as "&lt;10".
              </p>
            </div>
          )}

          {quiet.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700">Too little activity to score ({quiet.length})</h3>
              <p className="text-sm text-gray-600 mt-1">{quiet.map(l => l.name ?? 'Unnamed learner').join(', ')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
