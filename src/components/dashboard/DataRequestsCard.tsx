// src/components/dashboard/DataRequestsCard.tsx
//
// Privacy requests (delete my data, withdraw permission, send me a copy) from learners in the
// leader's organization. Administrators see every organization's. Renders nothing when there are
// none. Locking an account uses review_membership('declined'), which a leader can already do;
// the erasure itself is run by an administrator (see docs/runbooks/incident-response.md and
// `npm run user:delete`).

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Lock, Check, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface OpenRequest {
  id: string;
  user_id: string;
  kind: 'delete_account' | 'withdraw_consent' | 'copy_of_data';
  note: string | null;
  created_at: string;
  learner_name: string | null;
  learner_email: string | null;
  organization_name: string | null;
  birth_year: number | null;
}

const KIND_TEXT: Record<OpenRequest['kind'], string> = {
  delete_account: 'wants their account and data deleted',
  withdraw_consent: 'parent or guardian is withdrawing permission',
  copy_of_data: 'asked for a copy of their data',
};

const DataRequestsCard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'platform_administrator';
  const [rows, setRows] = useState<OpenRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('list_open_data_requests');
    if (loadError) { console.warn('[DataRequestsCard] load failed:', loadError.message); return; }
    setRows((data ?? []) as OpenRequest[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const lockAccount = async (r: OpenRequest) => {
    setBusyId(r.id); setError(null);
    const { error: rpcError } = await supabase.rpc('review_membership', { target_user: r.user_id, decision: 'declined' });
    setBusyId(null);
    if (rpcError) { setError(rpcError.message); return; }
    setLocked(prev => ({ ...prev, [r.id]: true }));
  };

  const resolve = async (r: OpenRequest, status: 'done' | 'declined') => {
    setBusyId(r.id); setError(null);
    const { error: rpcError } = await supabase.rpc('resolve_data_request', {
      p_id: r.id, p_status: status, p_note: notes[r.id]?.trim() || null,
    });
    setBusyId(null);
    if (rpcError) { setError(rpcError.message); return; }
    setRows(prev => prev.filter(x => x.id !== r.id));
  };

  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-amber-300 shadow-sm">
      <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-2">
        <ShieldAlert size={18} className="text-amber-600" />
        <div>
          <p className="font-medium text-gray-900">
            {rows.length} privacy request{rows.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-gray-500">
            Reply within 14 days (7 days for a copy of data). Lock the account first if it is a deletion or withdrawal.
            {isAdmin ? ' To erase: npm run user:delete -- <email> (dry run first).' : ' An administrator carries out deletions.'}
          </p>
        </div>
      </div>
      {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {rows.map(r => (
          <li key={r.id} className="px-5 py-3 stack-y-2">
            <div>
              <p className="font-medium text-gray-900 text-sm">
                {r.learner_name || 'No name'} <span className="font-normal text-gray-600">{KIND_TEXT[r.kind]}</span>
              </p>
              <p className="text-xs text-gray-500">
                {r.learner_email || 'No email'}
                {r.organization_name ? ` · ${r.organization_name}` : ''}
                {r.birth_year ? ` · born ${r.birth_year}` : ''}
                {` · asked ${new Date(r.created_at).toLocaleDateString()}`}
              </p>
              {r.note && <p className="text-xs text-gray-700 mt-1">“{r.note}”</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {r.kind !== 'copy_of_data' && (
                <button onClick={() => lockAccount(r)} disabled={busyId === r.id || locked[r.id]}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-60">
                  <Lock size={14} /> {locked[r.id] ? 'Account locked' : 'Lock account now'}
                </button>
              )}
              <input
                type="text" maxLength={1000} value={notes[r.id] ?? ''}
                onChange={e => setNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                placeholder="Note (optional)" aria-label="Note"
                className="flex-1 min-w-[10rem] border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
              <button onClick={() => resolve(r, 'done')} disabled={busyId === r.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60">
                {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Mark done
              </button>
              <button onClick={() => resolve(r, 'declined')} disabled={busyId === r.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-60">
                <X size={14} /> Can’t do this
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DataRequestsCard;
