// src/components/dashboard/ConsentRecordsCard.tsx
//
// Learners under 18 (or who may be: no birth year yet in a group that includes minors) with no
// parent or guardian consent recorded on the platform. Leaders hold the signed forms; this card
// lets them record that, for several learners at once, so the platform keeps the evidence. No
// learner is switched off for lacking a record. See 20261016100000_guardian_consent_all_minors.sql.

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface Learner {
  id: string;
  name: string | null;
  email: string | null;
  birth_year: number | null;
  organization_name: string | null;
}
type Method = 'signed_form' | 'in_person' | 'other';
const METHODS: { value: Method; label: string }[] = [
  { value: 'signed_form', label: 'A signed consent form covering use of the platform is on file' },
  { value: 'in_person',   label: 'A parent or guardian agreed in person' },
  { value: 'other',       label: 'Another way (add a note)' },
];

const ConsentRecordsCard: React.FC = () => {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<Method>('signed_form');
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('list_learners_missing_consent');
    if (loadError) { console.warn('[ConsentRecordsCard] load failed:', loadError.message); return; }
    setLearners((data ?? []) as Learner[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) =>
    setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = learners.length > 0 && picked.size === learners.length;

  const record = async () => {
    setBusy(true); setError(null); setDone(null);
    const { data, error: rpcError } = await supabase.rpc('record_guardian_consents', {
      p_users: Array.from(picked), p_method: method, p_note: note.trim() || null,
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    setDone(`Recorded for ${data ?? 0} learner${data === 1 ? '' : 's'}.`);
    setPicked(new Set()); setSure(false); setNote('');
    load();
  };

  if (learners.length === 0 && !done) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="w-full px-5 py-3 flex items-center gap-2 text-left">
        <ShieldCheck size={18} className="text-gray-500" />
        <span className="flex-1">
          <span className="font-medium text-gray-900">
            {learners.length} learner{learners.length === 1 ? '' : 's'} under 18 without a recorded parent or guardian consent
          </span>
          <span className="block text-xs text-gray-500">
            If you hold signed forms that cover using the platform (a media release alone is not enough), record them here. Nobody loses access.
          </span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {done && <p className="px-5 pb-2 text-sm text-emerald-700">{done}</p>}
      {open && learners.length > 0 && (
        <div className="border-t border-gray-100">
          <label className="px-5 py-2 flex items-center gap-2 text-sm text-gray-700 bg-gray-50">
            <input type="checkbox" checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(learners.map(l => l.id)))} />
            Select all {learners.length}
          </label>
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {learners.map(l => (
              <li key={l.id}>
                <label className="px-5 py-2 flex items-center gap-3 text-sm cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900">{l.name || 'No name'}</span>
                    <span className="text-xs text-gray-500">
                      {l.organization_name ? ` · ${l.organization_name}` : ''}
                      {l.birth_year ? ` · born ${l.birth_year}` : ' · birth year not given'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="px-5 py-3 border-t border-gray-100 stack-y-2">
            {METHODS.map(m => (
              <label key={m.value} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" name="consent-records-method" checked={method === m.value} onChange={() => setMethod(m.value)} />
                {m.label}
              </label>
            ))}
            <input
              type="text" maxLength={500} value={note} onChange={e => setNote(e.target.value)}
              placeholder={method === 'other' ? 'Add a short note (required)' : 'Optional note, for example the form batch or date'}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-0.5" checked={sure} onChange={e => setSure(e.target.checked)} />
              I confirm that a parent or guardian has agreed, on a form that covers using nextVillage and sending information abroad, for each of the {picked.size} learner{picked.size === 1 ? '' : 's'} I selected.
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={record}
              disabled={busy || picked.size === 0 || !sure || (method === 'other' && !note.trim())}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />} Record consent for {picked.size}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsentRecordsCard;
