// src/components/dashboard/InactiveAccountsCard.tsx
//
// Accounts with no activity for 12 months. A leader decides for each: keep it, or schedule it
// for removal in 90 days (anyone who comes back before then is taken off the list
// automatically). Nothing is removed without a decision. See
// 20261015180000_inactive_account_review.sql. Renders nothing when there is nothing to review.

import React, { useCallback, useEffect, useState } from 'react';
import { UserX, Check, Trash2, Undo2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface Row {
  user_id: string;
  learner_name: string | null;
  learner_email: string | null;
  role: string;
  organization_name: string | null;
  last_active: string;
  decision: 'keep' | 'remove' | null;
  remove_after: string | null;
}

const ROLE_TEXT: Record<string, string> = {
  student: 'Learner', learner: 'Learner', teacher: 'Teacher', site_leader: 'Co-leader', site_administrator: 'Site administrator', leader: 'Leader',
};

const InactiveAccountsCard: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('list_inactive_account_reviews');
    if (loadError) { console.warn('[InactiveAccountsCard] load failed:', loadError.message); return; }
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (r: Row, decision: 'keep' | 'remove') => {
    setBusyId(r.user_id); setError(null);
    const { error: rpcError } = await supabase.rpc('decide_inactive_account', { p_user: r.user_id, p_decision: decision });
    setBusyId(null);
    if (rpcError) { setError(rpcError.message); return; }
    load();
  };

  const undecided = rows.filter(r => !r.decision);
  const scheduled = rows.filter(r => r.decision === 'remove');
  if (rows.length === 0) return null;

  const person = (r: Row) => (
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 text-sm truncate">{r.learner_name || 'No name'}</p>
      <p className="text-xs text-gray-500 truncate">
        {r.learner_email || 'No email'} · {ROLE_TEXT[r.role] ?? r.role}
        {r.organization_name ? ` · ${r.organization_name}` : ''}
        {` · last active ${new Date(r.last_active).toLocaleDateString()}`}
      </p>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <UserX size={18} className="text-gray-500" />
        <div>
          <p className="font-medium text-gray-900">
            {undecided.length} account{undecided.length === 1 ? '' : 's'} not used for over a year
          </p>
          <p className="text-xs text-gray-500">
            We keep personal data only as long as it is needed. Keep an account, or schedule it for removal
            (it is deleted 90 days later, and not if the person returns before then).
          </p>
        </div>
      </div>
      {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {undecided.map(r => (
          <li key={r.user_id} className="px-5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
            {person(r)}
            <div className="flex gap-2">
              <button onClick={() => decide(r, 'keep')} disabled={busyId === r.user_id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-60">
                {busyId === r.user_id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Keep
              </button>
              <button onClick={() => decide(r, 'remove')} disabled={busyId === r.user_id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50 disabled:opacity-60">
                <Trash2 size={14} /> Remove in 90 days
              </button>
            </div>
          </li>
        ))}
        {scheduled.map(r => (
          <li key={r.user_id} className="px-5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 bg-gray-50">
            {person(r)}
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700">
                Removal on {r.remove_after ? new Date(r.remove_after).toLocaleDateString() : '—'}
              </span>
              <button onClick={() => decide(r, 'keep')} disabled={busyId === r.user_id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-white disabled:opacity-60">
                <Undo2 size={14} /> Keep after all
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default InactiveAccountsCard;
