// src/components/profile/PrivacyDataCard.tsx
//
// "Privacy and my data": a learner (or a parent or guardian helping them) can ask to have their
// data deleted, withdraw consent, or ask for a copy. The request goes to the leaders of the
// learner's organization and to administrators (see 20261015160000_data_requests.sql). Deleting
// is done by an administrator within 30 days.

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type Kind = 'delete_account' | 'withdraw_consent' | 'copy_of_data';

interface RequestRow {
  id: string;
  kind: Kind;
  status: 'open' | 'done' | 'declined';
  created_at: string;
  handled_note: string | null;
}

const OPTIONS: { kind: Kind; label: string; help: string }[] = [
  { kind: 'delete_account', label: 'Delete my account and my data',
    help: 'Removes your account, your work and your files. This cannot be undone.' },
  { kind: 'withdraw_consent', label: 'Parent or guardian: withdraw permission',
    help: 'Your leader will stop this learner’s access straight away and ask what should happen to their data.' },
  { kind: 'copy_of_data', label: 'Send me a copy of my data',
    help: 'Your leader or an administrator will get you a copy of what we hold about you.' },
];

const STATUS_TEXT: Record<RequestRow['status'], string> = {
  open: 'Received. We will reply within 14 days.',
  done: 'Done.',
  declined: 'Could not be done',
};

const PrivacyDataCard: React.FC = () => {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [choice, setChoice] = useState<Kind | null>(null);
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('data_requests')
      .select('id, kind, status, created_at, handled_note')
      .order('created_at', { ascending: false })
      .limit(10);
    setRows((data ?? []) as RequestRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('request_data_action', { p_kind: choice, p_note: note.trim() || null });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    setChoice(null); setNote(''); setSure(false);
    load();
  };

  const openKinds = new Set(rows.filter(r => r.status === 'open').map(r => r.kind));

  return (
    <div className="mt-8 bg-white rounded-lg shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-gray-500" />
        <h2 className="text-xl font-semibold text-gray-900">Privacy and my data</h2>
      </div>
      <div className="p-6 stack-y-4">
        <p className="text-sm text-gray-600">
          You decide what happens to your information. Choose one of these and your leader will be told.
        </p>
        {OPTIONS.map(o => (
          <div key={o.kind} className="border border-gray-200 rounded-lg p-3">
            <p className="font-medium text-gray-900 text-sm">{o.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{o.help}</p>
            {openKinds.has(o.kind) ? (
              <p className="text-xs text-emerald-700 mt-2">You have already asked for this. {STATUS_TEXT.open}</p>
            ) : choice === o.kind ? (
              <div className="mt-2 stack-y-2">
                <input
                  type="text" maxLength={1000} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Anything you want us to know (optional)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="mt-0.5" checked={sure} onChange={e => setSure(e.target.checked)} />
                  Yes, I want to send this request.
                </label>
                <div className="flex gap-2">
                  <button onClick={send} disabled={busy || !sure}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60">
                    {busy && <Loader2 size={14} className="animate-spin" />} Send request
                  </button>
                  <button onClick={() => { setChoice(null); setSure(false); }}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setChoice(o.kind); setError(null); }}
                className="mt-2 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
                Start
              </button>
            )}
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {rows.some(r => r.status !== 'open') && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Earlier requests</p>
            <ul className="text-xs text-gray-600 stack-y-1">
              {rows.filter(r => r.status !== 'open').map(r => (
                <li key={r.id}>
                  {OPTIONS.find(o => o.kind === r.kind)?.label} · {new Date(r.created_at).toLocaleDateString()} · {STATUS_TEXT[r.status]}
                  {r.handled_note ? ` ${r.handled_note}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivacyDataCard;
