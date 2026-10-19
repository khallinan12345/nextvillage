// src/components/dashboard/UngroupedMembersCard.tsx
//
// Administrators only. People who signed up without a join code belong to no organization, so
// no leader sees them or receives safety alerts about them. This lists them (children first) and
// places each in an organization. See 20261015220000_admin_assign_org.sql.

import React, { useCallback, useEffect, useState } from 'react';
import { UsersRound, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface Person {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  country: string | null;
  birth_year: number | null;
  is_young: boolean;
  created_at: string;
}
interface Org { id: string; name: string }

const UngroupedMembersCard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'platform_administrator';
  const [people, setPeople] = useState<Person[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    const [{ data: list, error: listError }, { data: orgList }] = await Promise.all([
      supabase.rpc('list_members_without_org'),
      supabase.from('organizations').select('id, name').eq('is_listed', true).order('name'),
    ]);
    if (listError) { console.warn('[UngroupedMembersCard] load failed:', listError.message); return; }
    setPeople((list ?? []) as Person[]);
    setOrgs((orgList ?? []) as Org[]);
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const assign = async (p: Person) => {
    const org = pick[p.id];
    if (!org) return;
    setBusyId(p.id); setError(null);
    const { error: rpcError } = await supabase.rpc('admin_assign_member_org', { target_user: p.id, target_org: org });
    setBusyId(null);
    if (rpcError) { setError(rpcError.message); return; }
    setPeople(prev => prev.filter(x => x.id !== p.id));
  };

  if (!isAdmin || people.length === 0) return null;
  const youngCount = people.filter(p => p.is_young).length;

  return (
    <div className="bg-white rounded-xl border border-amber-300 shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="w-full px-5 py-3 flex items-center gap-2 text-left">
        <UsersRound size={18} className="text-amber-600" />
        <span className="flex-1">
          <span className="font-medium text-gray-900">
            {people.length} {people.length === 1 ? 'person has' : 'people have'} no group
            {youngCount > 0 ? ` (${youngCount} under 13)` : ''}
          </span>
          <span className="block text-xs text-gray-500">
            No leader sees them or gets safety alerts about them. Place each in an organization.
          </span>
        </span>
      </button>
      {open && (
        <>
          {error && <p className="px-5 pb-2 text-sm text-red-600">{error}</p>}
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {people.map(p => (
              <li key={p.id} className="px-5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.name || 'No name'}
                    {p.is_young && <span className="ml-2 text-xs font-normal text-amber-700">younger learner</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {p.email || 'No email'} · {p.role === 'teacher' ? 'Teacher' : 'Learner'}
                    {p.country ? ` · ${p.country}` : ''}
                    {p.birth_year ? ` · born ${p.birth_year}` : ' · birth year not given'}
                    {` · joined ${new Date(p.created_at).toLocaleDateString()}`}
                  </p>
                </div>
                <select
                  value={pick[p.id] ?? ''} onChange={e => setPick(prev => ({ ...prev, [p.id]: e.target.value }))}
                  aria-label="Organization" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm max-w-[14rem]">
                  <option value="">Choose group…</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button onClick={() => assign(p)} disabled={!pick[p.id] || busyId === p.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
                  {busyId === p.id && <Loader2 size={14} className="animate-spin" />} Place
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default UngroupedMembersCard;
