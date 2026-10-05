// src/components/dashboard/SafetyFlagsCard.tsx
//
// Open "Use Claude Together" safety flags, shown at the top of DashboardPage
// and AdminStudentDashboard for leaders and platform administrators, next to
// PendingMembersCard. Renders nothing when there are none. A flag is either
// automatic (the database spotted a phone number, "WhatsApp me", an offer
// abroad, a money request, secrecy…) or a member pressed Report. Leaders get
// an email for each one too (api/notify-safety-flags.js).
//
// RLS (together_safety_flags_select) limits the query to organizations the
// caller leads; "Mark reviewed" goes through review_together_safety_flag(),
// and "Remove message" uses the same soft-delete leaders already have in the
// room itself. See 20261005021247_together_room_safety_flags.sql.

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Check, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface SafetyFlag {
  id: string;
  room_name: string | null;
  message_id: string | null;
  sender_name: string | null;
  excerpt: string;
  source: 'auto' | 'report';
  categories: string[];
  report_reason: string | null;
  created_at: string;
  reporter: { name: string | null } | null;
  organizations: { name: string } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  contact_off_platform: 'Contact details / off-platform',
  job_or_travel_offer:  'Job or travel abroad',
  money_request:        'Money or bank details',
  secrecy_or_meeting:   'Secrecy, meeting or photos',
};

const REFRESH_MS = 60_000;

const SafetyFlagsCard: React.FC = () => {
  const { user } = useAuth();
  const [flags, setFlags] = useState<SafetyFlag[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('together_safety_flags')
      .select('id, room_name, message_id, sender_name, excerpt, source, categories, report_reason, created_at, reporter:profiles!together_safety_flags_reported_by_fkey(name), organizations(name)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    if (loadError) {
      console.warn('[SafetyFlagsCard] load failed:', loadError.message);
      return;
    }
    setFlags((data ?? []) as unknown as SafetyFlag[]);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const markReviewed = async (flag: SafetyFlag) => {
    setBusyId(flag.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('review_together_safety_flag', { p_flag_id: flag.id });
    setBusyId(null);
    if (rpcError) { setError(rpcError.message); return; }
    setFlags(prev => prev.filter(f => f.id !== flag.id));
  };

  const removeMessage = async (flag: SafetyFlag) => {
    if (!flag.message_id || !user?.id) return;
    setBusyId(flag.id);
    setError(null);
    const { data, error: updateError } = await supabase
      .from('together_messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', flag.message_id)
      .select('id');
    setBusyId(null);
    if (updateError || !data?.length) {
      setError('Could not remove that message — you can also remove it from inside the room.');
      return;
    }
    setRemovedIds(prev => new Set(prev).add(flag.id));
  };

  if (flags.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
      <div className="px-5 py-4 border-b bg-gradient-to-r from-red-50 to-orange-50">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <ShieldAlert size={20} className="text-red-600" />
          Safety flags in Together rooms ({flags.length})
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Automatic flags can be wrong — read the message and talk to the young people involved before assuming anything.
          If someone is asking for a number, money, photos or a meeting, or offering travel or work abroad, remove the message and contact the young person’s parent or guardian.
        </p>
      </div>

      {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-100">
        {flags.map(f => (
          <li key={f.id} className="px-5 py-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {f.source === 'report' ? (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
                  Reported by {f.reporter?.name || 'a member'}
                </span>
              ) : (
                f.categories.map(c => (
                  <span key={c} className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-medium">
                    {CATEGORY_LABELS[c] || c}
                  </span>
                ))
              )}
              <span className="text-gray-500">
                {f.sender_name || 'Unknown'} · room “{f.room_name || 'deleted'}”
                {f.organizations?.name ? ` · ${f.organizations.name}` : ''}
                {` · ${new Date(f.created_at).toLocaleString()}`}
              </span>
            </div>
            {f.report_reason && <p className="text-sm text-gray-700">Reason: “{f.report_reason}”</p>}
            <blockquote className="border-l-2 border-gray-300 pl-3 text-sm text-gray-800 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {f.excerpt}
            </blockquote>
            <div className="flex flex-wrap gap-2">
              {f.message_id && !removedIds.has(f.id) && (
                <button
                  onClick={() => removeMessage(f)}
                  disabled={busyId === f.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50 disabled:opacity-60"
                >
                  <Trash2 size={14} /> Remove message
                </button>
              )}
              {removedIds.has(f.id) && <span className="text-sm text-gray-500 self-center">Message removed from the room.</span>}
              <button
                onClick={() => markReviewed(f)}
                disabled={busyId === f.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {busyId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Mark reviewed
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SafetyFlagsCard;
