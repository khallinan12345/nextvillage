// src/components/dashboard/PendingMembersCard.tsx
//
// Join requests waiting on a leader, shown at the top of DashboardPage and
// AdminStudentDashboard for leaders and platform administrators. Renders
// nothing when there are none. Re-checks every 30 seconds so that on a day
// when a whole group of trainees signs up in the lab, new requests appear
// without a page reload, and "Approve all" clears the list in one go.
//
// RLS (profiles_select) already limits the query to the leader's own
// organization; approving/declining goes through the review_membership()
// RPC, which re-checks that the caller leads the member's organization.
// See 20261004163910_member_approval_and_role_guard.sql.

import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Check, CheckCheck, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface PendingMember {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  membership_requested_at: string | null;
  organizations: { name: string } | null;
}

const REFRESH_MS = 30_000;

const PendingMembersCard: React.FC = () => {
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Approve all" needs a second click to confirm — no browser dialog.
  const [confirmAll, setConfirmAll] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, name, email, role, membership_requested_at, organizations(name)')
      .eq('membership_status', 'pending')
      .order('membership_requested_at', { ascending: true });
    if (loadError) {
      console.warn('[PendingMembersCard] load failed:', loadError.message);
      return;
    }
    setMembers((data ?? []) as unknown as PendingMember[]);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const review = async (member: PendingMember, decision: 'approved' | 'declined') => {
    setBusyId(member.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('review_membership', {
      target_user: member.id,
      decision,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMembers(prev => prev.filter(m => m.id !== member.id));
  };

  const approveAll = async () => {
    setApprovingAll(true);
    setError(null);
    const failed: string[] = [];
    for (const m of members) {
      const { error: rpcError } = await supabase.rpc('review_membership', {
        target_user: m.id,
        decision: 'approved',
      });
      if (rpcError) failed.push(m.name || m.email || m.id);
    }
    setApprovingAll(false);
    setConfirmAll(false);
    if (failed.length) setError(`Could not approve: ${failed.join(', ')}`);
    await load();
  };

  if (members.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
      <div className="px-5 py-4 border-b bg-gradient-to-r from-amber-50 to-yellow-50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <UserPlus size={20} className="text-amber-600" />
            Join requests ({members.length})
          </h2>
          {members.length > 1 && (
            <div className="flex items-center gap-2">
              {confirmAll && !approvingAll && (
                <button onClick={() => setConfirmAll(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
                  Cancel
                </button>
              )}
              <button
                onClick={() => (confirmAll ? approveAll() : setConfirmAll(true))}
                disabled={approvingAll || busyId !== null}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {approvingAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                {confirmAll ? `Yes, approve all ${members.length}` : 'Approve all'}
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Only approve people you know. Until you approve them, they can’t see your rooms, members or leaderboard.
          {confirmAll && ' Approve all only if every name below is someone in the room with you.'}
        </p>
      </div>

      {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-100">
        {members.map(m => (
          <li key={m.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{m.name || 'No name given'}</p>
              <p className="text-xs text-gray-500 truncate">
                {m.email || 'No email'} · {m.role === 'site_leader' ? 'Co-leader' : 'Learner'}
                {m.organizations?.name ? ` · ${m.organizations.name}` : ''}
                {m.membership_requested_at
                  ? ` · requested ${new Date(m.membership_requested_at).toLocaleDateString()}`
                  : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => review(m, 'approved')}
                disabled={busyId === m.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {busyId === m.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Approve
              </button>
              <button
                onClick={() => review(m, 'declined')}
                disabled={busyId === m.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                <X size={14} /> Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PendingMembersCard;
