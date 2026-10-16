// src/components/dashboard/DuplicateAccountsCard.tsx
//
// Administrators only. Lists pairs of learner accounts that look like the same person (same name or a
// very similar email). The newest account stays; "Preview" shows what would move from the older one,
// and "Merge" moves it. Nothing happens without a click. See 20261016180000_merge_duplicate_accounts.sql.

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface Pair {
  old_id: string; old_name: string | null; old_email: string | null; old_created: string; old_last_seen: string | null;
  new_id: string; new_name: string | null; new_email: string | null; new_created: string; new_last_seen: string | null;
  reason: string;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : 'never');

const DuplicateAccountsCard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'platform_administrator';
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [preview, setPreview] = useState<Record<string, Record<string, number>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    const { data, error: rpcError } = await supabase.rpc('find_duplicate_accounts');
    if (rpcError) { console.warn('[DuplicateAccountsCard] load failed:', rpcError.message); return; }
    setPairs((data ?? []) as Pair[]);
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const run = async (p: Pair, dry: boolean) => {
    setBusyId(p.old_id); setError(null);
    const { data, error: rpcError } = await supabase.rpc('merge_accounts', { p_old: p.old_id, p_new: p.new_id, p_dry_run: dry });
    setBusyId(null);
    if (rpcError) { setError(rpcError.message); return; }
    if (dry) setPreview(prev => ({ ...prev, [p.old_id]: (data ?? {}) as Record<string, number> }));
    else setPairs(prev => prev.filter(x => x.old_id !== p.old_id));
  };

  if (!isAdmin || pairs.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-amber-300 shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="w-full px-5 py-3 flex items-center gap-2 text-left">
        <Copy size={18} className="text-amber-600" />
        <span className="flex-1">
          <span className="font-medium text-gray-900">{pairs.length} possible duplicate {pairs.length === 1 ? 'account' : 'accounts'}</span>
          <span className="block text-xs text-gray-500">
            Same name or a very similar email. The newest account stays; the older one's work is moved onto it.
          </span>
        </span>
      </button>
      {open && (
        <>
          {error && <p className="px-5 pb-2 text-sm text-red-600">{error}</p>}
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {pairs.map(p => {
              const pv = preview[p.old_id];
              const rows = pv ? Object.values(pv).reduce((a, b) => a + b, 0) : null;
              return (
                <li key={p.old_id} className="px-5 py-3 space-y-2">
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Older (will be retired) · {p.reason}</p>
                      <p className="font-medium text-gray-900">{p.old_name || 'No name'}</p>
                      <p className="text-xs text-gray-500">{p.old_email} · joined {fmt(p.old_created)} · last seen {fmt(p.old_last_seen)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-emerald-700">Newest (stays active)</p>
                      <p className="font-medium text-gray-900">{p.new_name || 'No name'}</p>
                      <p className="text-xs text-gray-500">{p.new_email} · joined {fmt(p.new_created)} · last seen {fmt(p.new_last_seen)}</p>
                    </div>
                  </div>
                  {pv && (
                    <p className="text-xs text-gray-600">
                      {rows === 0
                        ? 'The older account has no activity to move.'
                        : `Will move ${rows} records: ${Object.entries(pv).map(([k, v]) => `${k.split('.')[0].replace(/_/g, ' ')} ${v}`).join(', ')}.`}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => run(p, true)} disabled={busyId === p.old_id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50">
                      {busyId === p.old_id && <Loader2 size={14} className="animate-spin" />} Preview
                    </button>
                    <button onClick={() => run(p, false)} disabled={!pv || busyId === p.old_id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
                      Merge into newest
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default DuplicateAccountsCard;
