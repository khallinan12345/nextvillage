// src/components/dashboard/SafetyOfficerCard.tsx
//
// Every organization must name a child safety officer (a person families can go to with a worry).
// Until one is named this card is prominent and the database refuses to let a leader approve new
// learners (see 20261018100000_child_safety_officer.sql). Once named, it shows who it is and lets a
// leader change them. The details also appear on the organization's printable "My path" card.

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface Officer { org_name: string | null; officer_name: string | null; officer_email: string | null; officer_phone: string | null }

const SafetyOfficerCard: React.FC = () => {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data: me } = await supabase.from('profiles').select('organization_id').eq('id', user.id).maybeSingle();
    const org = (me?.organization_id as string | null) ?? null;
    setOrgId(org);
    if (org) {
      const { data: o } = await supabase.from('organizations').select('join_code').eq('id', org).maybeSingle();
      setJoinCode((o?.join_code as string | null) ?? null);
    }
    const { data } = await supabase.rpc('my_safety_officer');
    const row = (Array.isArray(data) ? data[0] : data) as Officer | undefined;
    setOfficer(row?.officer_name ? row : null);
    setLoaded(true);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !orgId) return null;

  const startEdit = () => {
    setName(officer?.officer_name ?? '');
    setEmail(officer?.officer_email ?? '');
    setPhone(officer?.officer_phone ?? '');
    setError(null);
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: rpcError } = await supabase.rpc('set_child_safety_officer', {
      p_org: orgId, p_name: name, p_email: email || null, p_phone: phone || null,
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    setEditing(false);
    await load();
  };

  const missing = !officer;
  const form = (
    <form onSubmit={save} className="mt-3 grid gap-3 md:grid-cols-3">
      <label className="text-sm font-medium text-gray-800">Name
        <input required className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-gray-800">Email
        <input type="email" className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-gray-800">Phone or WhatsApp
        <input className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 …" />
      </label>
      <div className="md:col-span-3 flex items-center gap-2 flex-wrap">
        <button disabled={busy} type="submit" className="px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-700 text-white">
          {busy ? <Loader2 className="animate-spin inline" size={14} /> : 'Save'}
        </button>
        {!missing && <button type="button" className="px-3 py-1.5 rounded-md text-sm bg-gray-100" onClick={() => setEditing(false)}>Cancel</button>}
        <span className="text-xs text-gray-600">An email or a phone/WhatsApp number is required.</span>
      </div>
      {error && <p className="md:col-span-3 text-sm text-red-700" role="alert">{error}</p>}
    </form>
  );

  return (
    <div className={`rounded-xl border p-5 ${missing ? 'border-red-300 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <div className="flex items-center gap-2 font-semibold text-gray-900">
        {missing ? <AlertTriangle size={18} className="text-red-600" /> : <ShieldCheck size={18} className="text-emerald-700" />}
        {missing ? 'Name your child safety officer' : 'Child safety officer'}
      </div>
      {missing ? (
        <>
          <p className="text-sm text-gray-800 mt-2">
            Every organization needs a named adult whom families and children can go to with a worry, and who follows up on safety alerts.
            <strong> You cannot approve new learners until this is filled in.</strong> It can be you.
          </p>
          {form}
        </>
      ) : editing ? form : (
        <>
          <p className="text-sm text-gray-800 mt-2">
            <strong>{officer?.officer_name}</strong>
            {officer?.officer_phone ? ` · ${officer.officer_phone}` : ''}
            {officer?.officer_email ? ` · ${officer.officer_email}` : ''}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            This person appears on your families' <em>My path</em> card.
            {joinCode && <> Print it from <a className="text-blue-700 underline" href={`/my-path?code=${encodeURIComponent(joinCode)}`} target="_blank" rel="noopener noreferrer">nextvillage.community/my-path?code={joinCode}</a>.</>}
          </p>
          <button className="mt-2 text-sm text-blue-700 hover:underline" onClick={startEdit}>Change</button>
        </>
      )}
    </div>
  );
};

export default SafetyOfficerCard;
