// src/pages/admin/DonationsPage.tsx
//
// Donations to vAI (/admin/donations). Every donation comes from Impact Mining, Inc. through Sendwave and is
// entered by hand here (Sendwave has no API). vAI leaders and platform administrators can read the list;
// only platform administrators can add, edit or delete. The database enforces this (migration
// 20261118160000_donations.sql); this page just hides what the person cannot use.
// "Show on the public donor wall" is opt-in and is off until the donor has agreed to be named.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface Donation {
  id: string; received_on: string; donor_name: string; donor_email: string | null; amount_usd: number;
  amount_received: number | null; received_currency: string | null; sendwave_reference: string | null;
  purpose: string | null; notes: string | null; show_on_wall: boolean; wall_name: string | null;
  needs_donor: boolean; channel: string | null;
}

const CHANNELS: [string, string][] = [
  ['bank_transfer', 'Bank transfer'], ['check', 'Check'], ['venmo', 'Venmo'],
  ['substack', 'Substack'], ['gofundme', 'GoFundMe'], ['other', 'Other'],
];
const channelLabel = (c: string | null) => CHANNELS.find(([k]) => k === c)?.[1] ?? null;

const box = 'bg-white border border-gray-200 rounded-xl p-5';
const field = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm';
const primary = 'px-4 py-2 rounded-md text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50';
const quiet = 'px-3 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const usd = (v: number) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const friendly = (msg?: string) => (msg || 'Something went wrong. Please try again.').replace(/^.*?(?:ERROR:\s*)/, '');
const today = () => new Date().toISOString().slice(0, 10);

const blank = {
  received_on: today(), donor_name: '', donor_email: '', amount_usd: '', amount_received: '', received_currency: 'NGN',
  sendwave_reference: '', purpose: '', notes: '', show_on_wall: false, wall_name: '', channel: '',
};

const Label: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <label className="block mb-3">
    <span className="block text-sm font-semibold text-gray-800">{title}</span>
    {hint && <span className="block text-xs text-gray-500 mb-1">{hint}</span>}
    {children}
  </label>
);

const fromRow = (r: Donation) => ({
  received_on: r.received_on, donor_name: r.needs_donor ? '' : r.donor_name, donor_email: r.donor_email ?? '',
  amount_usd: String(r.amount_usd), amount_received: r.amount_received == null ? '' : String(r.amount_received),
  received_currency: r.received_currency ?? 'NGN', sendwave_reference: r.sendwave_reference ?? '', purpose: r.purpose ?? '',
  notes: r.notes ?? '', show_on_wall: r.show_on_wall, wall_name: r.wall_name ?? '', channel: r.channel ?? '',
});

const DonationForm: React.FC<{ existing?: Donation; onSaved: () => void; onCancel: () => void }> = ({ existing, onSaved, onCancel }) => {
  const [f, setF] = useState(existing ? fromRow(existing) : blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const payload = {
      received_on: f.received_on, donor_name: f.donor_name.trim(), donor_email: orNull(f.donor_email),
      amount_usd: Number(f.amount_usd),
      amount_received: f.amount_received.trim() === '' ? null : Number(f.amount_received),
      received_currency: f.amount_received.trim() === '' ? null : f.received_currency.trim().toUpperCase(),
      sendwave_reference: orNull(f.sendwave_reference), purpose: orNull(f.purpose), notes: orNull(f.notes),
      show_on_wall: f.show_on_wall, wall_name: orNull(f.wall_name), needs_donor: false, channel: orNull(f.channel),
    };
    const { error } = existing
      ? await supabase.from('donations').update(payload).eq('id', existing.id)
      : await supabase.from('donations').insert(payload);
    setBusy(false);
    if (error) {
      setErr(error.code === '23505' ? 'That Sendwave reference is already recorded.' : friendly(error.message));
      return;
    }
    onSaved();
  };

  return (
    <form onSubmit={submit} className={`${box} mb-6`}>
      <h2 className="text-lg font-bold text-gray-900 mb-1">{existing?.needs_donor ? 'Who gave this?' : existing ? 'Edit donation' : 'Record a donation'}</h2>
      {existing?.needs_donor && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">This transfer was picked up automatically from the Sendwave receipt. Add the donor who is being thanked, then save.</p>}
      <p className="text-sm text-gray-600 mb-4">
        Sent by Impact Mining, Inc. through Sendwave. Enter the donor who is being thanked, the USD amount sent, and (once it
        has landed) what vAI actually received after Sendwave&rsquo;s fees and conversion.
      </p>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Label title="Date received"><input type="date" className={field} required value={f.received_on} max={today()} onChange={set('received_on')} /></Label>
        <Label title="Amount sent (USD)"><input type="number" className={field} required min="0.01" step="0.01" value={f.amount_usd} onChange={set('amount_usd')} /></Label>
        <Label title="Donor name" hint="Who is being thanked. Use “Anonymous” if they asked for no name.">
          <input className={field} required maxLength={200} value={f.donor_name} onChange={set('donor_name')} /></Label>
        <Label title="Donor email (optional)" hint="For thank-you notes. Never shown publicly.">
          <input type="email" className={field} maxLength={200} value={f.donor_email} onChange={set('donor_email')} /></Label>
        <Label title="Amount received by vAI (optional)" hint="After fees and conversion.">
          <input type="number" className={field} min="0.01" step="0.01" value={f.amount_received} onChange={set('amount_received')} /></Label>
        <Label title="Currency received" hint="Three letters, e.g. NGN.">
          <input className={field} maxLength={3} pattern="[A-Za-z]{3}" value={f.received_currency} onChange={set('received_currency')} /></Label>
        <Label title="Sendwave reference (optional)" hint="Transaction ID from the receipt. Stops the same transfer being entered twice.">
          <input className={field} maxLength={100} value={f.sendwave_reference} onChange={set('sendwave_reference')} /></Label>
        <Label title="How it reached Impact Mining (optional)" hint="Before Impact Mining sent it to vAI by Sendwave.">
          <select className={field} value={f.channel} onChange={set('channel')}>
            <option value="">Not recorded</option>
            {CHANNELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select></Label>
        <Label title="Purpose (optional)" hint="General, a program, an organization…">
          <input className={field} maxLength={200} value={f.purpose} onChange={set('purpose')} /></Label>
      </div>
      <Label title="Notes (optional)"><textarea className={field} rows={2} value={f.notes} onChange={set('notes')} /></Label>
      <div className="border border-amber-200 bg-amber-50 rounded-md p-3 mb-4">
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" className="mt-1" checked={f.show_on_wall} onChange={set('show_on_wall')} />
          <span><b>Show on the public donor wall.</b> Only tick this once the donor has agreed to be named publicly. Only the name and month are shown, never the amount.</span>
        </label>
        {f.show_on_wall && (
          <div className="mt-2"><Label title="Name as it should read on the wall (optional)" hint="For example “The Smith Family”. Leave blank to use the donor name.">
            <input className={field} maxLength={200} value={f.wall_name} onChange={set('wall_name')} /></Label></div>
        )}
      </div>
      {err && <p className="text-sm text-red-700 mb-3">{err}</p>}
      <div className="flex gap-2">
        <button className={primary} disabled={busy}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Save donation'}</button>
        <button type="button" className={quiet} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
};

const DonationsPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const completeId = params.get('complete');
  const canRead = user?.role === 'leader' || user?.role === 'platform_administrator';
  const canWrite = user?.role === 'platform_administrator';

  const [rows, setRows] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('donations').select('*').order('received_on', { ascending: false }).order('created_at', { ascending: false });
    if (error) setLoadError(friendly(error.message)); else { setLoadError(null); setRows((data ?? []) as Donation[]); }
    setLoading(false);
  }, []);

  useEffect(() => { if (canRead) void load(); }, [canRead, load]);

  // The link in the "Who gave this?" email opens that entry's form straight away.
  const editing = rows.find(r => r.id === (editingId ?? completeId)) ?? null;
  const closeEdit = () => { setEditingId(null); if (completeId) setParams({}, { replace: true }); };
  const waiting = rows.filter(r => r.needs_donor);

  const totals = useMemo(() => {
    const thisYear = String(new Date().getUTCFullYear());
    const sum = (list: Donation[]) => list.reduce((a, r) => a + Number(r.amount_usd), 0);
    const received: Record<string, number> = {};
    for (const r of rows) if (r.amount_received && r.received_currency) received[r.received_currency] = (received[r.received_currency] ?? 0) + Number(r.amount_received);
    return { all: sum(rows), year: sum(rows.filter(r => r.received_on.startsWith(thisYear))), received, wall: rows.filter(r => r.show_on_wall).length };
  }, [rows]);

  const toggleWall = async (r: Donation) => {
    setActionError(null);
    const { error } = await supabase.from('donations').update({ show_on_wall: !r.show_on_wall }).eq('id', r.id);
    if (error) setActionError(friendly(error.message)); else await load();
  };
  const remove = async (r: Donation) => {
    if (!window.confirm(`Delete the ${usd(r.amount_usd)} donation from ${r.donor_name}? This cannot be undone.`)) return;
    setActionError(null);
    const { error } = await supabase.from('donations').delete().eq('id', r.id);
    if (error) setActionError(friendly(error.message)); else await load();
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button className="text-sm text-gray-600 flex items-center gap-1 mb-4" type="button" onClick={() => navigate('/admin/student-dashboard')}>
          <ArrowLeft size={14} /> Admin dashboard</button>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Donations</h1>
          {canWrite && !adding && <button className={primary} onClick={() => setAdding(true)}><Plus size={14} className="inline mr-1" />Record a donation</button>}
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Donations to vAI, all sent by Impact Mining, Inc. through Sendwave. Visible to vAI leaders and platform administrators only.
          They also appear in the monthly board report.
        </p>

        {authLoading && <Loader2 className="animate-spin text-gray-400" />}
        {!authLoading && !canRead && <p className="text-sm text-red-700">This page is for vAI leaders and platform administrators.</p>}

        {canRead && (
          <>
            {canWrite && adding && <DonationForm onCancel={() => setAdding(false)} onSaved={async () => { setAdding(false); await load(); }} />}
            {canWrite && editing && !adding && (
              <DonationForm key={editing.id} existing={editing} onCancel={closeEdit} onSaved={async () => { closeEdit(); await load(); }} />
            )}
            {canWrite && !loading && waiting.length > 0 && !editing && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                {waiting.length === 1 ? '1 donation is' : `${waiting.length} donations are`} waiting for a donor name. Use “Add donor” in the list below.
              </p>
            )}
            {loading && <Loader2 className="animate-spin text-gray-400" />}
            {loadError && <p className="text-sm text-red-700">{loadError}</p>}
            {actionError && <p className="text-sm text-red-700 mb-3">{actionError}</p>}

            {!loading && !loadError && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    ['All time', usd(totals.all)],
                    [`${new Date().getUTCFullYear()} so far`, usd(totals.year)],
                    ['Donations recorded', String(rows.length)],
                    ['Named on the wall', String(totals.wall)],
                  ].map(([label, value]) => (
                    <div key={label} className={box}><div className="text-xl font-bold text-gray-900">{value}</div><div className="text-xs text-gray-500">{label}</div></div>
                  ))}
                </div>
                {Object.keys(totals.received).length > 0 && (
                  <p className="text-sm text-gray-600 mb-4">
                    Received by vAI after fees and conversion: {Object.entries(totals.received).map(([c, a]) => `${a.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${c}`).join(', ')}
                  </p>
                )}

                {rows.length === 0 ? (
                  <p className="text-sm text-gray-600">No donations recorded yet.</p>
                ) : (
                  <div className={`${box} overflow-x-auto p-0`}>
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                        <tr><th className="p-3">Date</th><th className="p-3">Donor</th><th className="p-3">Sent</th><th className="p-3">Received</th>
                          <th className="p-3">Via / purpose / reference</th><th className="p-3">On wall</th>{canWrite && <th className="p-3"><span className="sr-only">Delete</span></th>}</tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className={`border-b border-gray-100 align-top ${r.needs_donor ? 'bg-amber-50' : ''}`}>
                            <td className="p-3 whitespace-nowrap">{day(r.received_on)}</td>
                            <td className="p-3">{r.needs_donor ? <span className="font-semibold text-amber-700">Donor not yet recorded</span> : r.donor_name}{r.donor_email && <div className="text-xs text-gray-500">{r.donor_email}</div>}
                              {r.notes && <div className="text-xs text-gray-500 whitespace-pre-wrap">{r.notes}</div>}</td>
                            <td className="p-3 whitespace-nowrap">{usd(r.amount_usd)}</td>
                            <td className="p-3 whitespace-nowrap">{r.amount_received ? `${Number(r.amount_received).toLocaleString('en-US')} ${r.received_currency ?? ''}` : '–'}</td>
                            <td className="p-3">{channelLabel(r.channel) && <div className="text-xs font-semibold text-gray-700">via {channelLabel(r.channel)}</div>}{r.purpose ?? '–'}{r.sendwave_reference && <div className="text-xs text-gray-500">Ref {r.sendwave_reference}</div>}</td>
                            <td className="p-3">
                              {canWrite
                                ? <button className={quiet} disabled={r.needs_donor} onClick={() => toggleWall(r)} aria-label={`Toggle donor wall for ${r.donor_name}`}>{r.show_on_wall ? 'Yes' : 'No'}</button>
                                : (r.show_on_wall ? 'Yes' : 'No')}
                              {r.show_on_wall && r.wall_name && <div className="text-xs text-gray-500">as “{r.wall_name}”</div>}
                            </td>
                            {canWrite && (
                              <td className="p-3 whitespace-nowrap">
                                {r.needs_donor
                                  ? <button className={primary} onClick={() => setEditingId(r.id)}>Add donor</button>
                                  : <button className="text-gray-400 hover:text-gray-700 mr-3" onClick={() => setEditingId(r.id)} aria-label={`Edit donation from ${r.donor_name}`}><Pencil size={16} /></button>}
                                <button className="text-gray-400 hover:text-red-700 ml-2" onClick={() => remove(r)} aria-label={`Delete donation from ${r.donor_name}`}><Trash2 size={16} /></button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default DonationsPage;
