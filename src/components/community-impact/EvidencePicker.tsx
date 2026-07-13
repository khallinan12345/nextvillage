import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, Circle, Sprout } from 'lucide-react';
import classNames from 'classnames';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { ResolutionAccent, ACCENT_CLASSES } from './ResolutionModal';

interface ResolutionRow {
  domain: string;
  id: string;
  summary_text: string | null;
  resolution_outcome: 'applied' | 'partially_applied' | 'not_applied' | null;
  resolution_value_amount: number | null;
  resolution_value_unit: string | null;
  created_at: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  agriculture: 'Agriculture',
  fishing: 'Fishing',
  healthcare: 'Healthcare',
  entrepreneurship: 'Entrepreneurship',
  animal_husbandry: 'Animal Husbandry',
  enterprise: 'My Enterprise',
};

const OUTCOME_LABELS: Record<string, string> = {
  applied: 'Applied',
  partially_applied: 'Partially applied',
  not_applied: 'Not applied',
};

export type EvidenceSourceType = 'challenge_enrollment' | 'grand_challenge_submission';

interface EvidencePickerProps {
  sourceType: EvidenceSourceType;
  sourceId: string | null | undefined;
  accent?: ResolutionAccent;
}

export const EvidencePicker: React.FC<EvidencePickerProps> = ({ sourceType, sourceId, accent = 'green' }) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<ResolutionRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const colors = ACCENT_CLASSES[accent];

  const load = useCallback(async () => {
    if (!user?.id || !sourceId) return;
    setLoading(true);
    try {
      const [{ data: resolved }, { data: enterprise }, { data: links }] = await Promise.all([
        supabase
          .from('community_impact_resolutions')
          .select('*')
          .eq('youth_user_id', user.id)
          .eq('resolved', true)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('enterprise_ledger_entries')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('consultation_evidence_links')
          .select('consultation_domain, consultation_id')
          .eq('source_type', sourceType)
          .eq('source_id', sourceId),
      ]);
      const enterpriseRows: ResolutionRow[] = (enterprise || []).map((e: any) => ({
        domain: 'enterprise',
        id: e.id,
        summary_text: e.buyer_description ? `${e.item_or_service} — ${e.buyer_description}` : e.item_or_service,
        resolution_outcome: null,
        resolution_value_amount: e.amount,
        resolution_value_unit: e.unit,
        created_at: e.created_at,
      }));
      const merged = [...(resolved || []) as ResolutionRow[], ...enterpriseRows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRows(merged);
      setSelectedIds(new Set((links || []).map(l => `${l.consultation_domain}:${l.consultation_id}`)));
    } finally {
      setLoading(false);
    }
  }, [user?.id, sourceId, sourceType]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (row: ResolutionRow) => {
    if (!user?.id || !sourceId) return;
    const key = `${row.domain}:${row.id}`;
    const isSelected = selectedIds.has(key);
    setPendingId(key);
    try {
      if (isSelected) {
        await supabase.from('consultation_evidence_links')
          .delete()
          .eq('source_type', sourceType)
          .eq('source_id', sourceId)
          .eq('consultation_domain', row.domain)
          .eq('consultation_id', row.id);
        setSelectedIds(prev => { const next = new Set(prev); next.delete(key); return next; });
      } else {
        await supabase.from('consultation_evidence_links').insert({
          learner_id: user.id,
          source_type: sourceType,
          source_id: sourceId,
          consultation_domain: row.domain,
          consultation_id: row.id,
        });
        setSelectedIds(prev => new Set(prev).add(key));
      }
    } catch (err) {
      console.error('[EvidencePicker] toggle failed:', err);
    } finally {
      setPendingId(null);
    }
  };

  if (!sourceId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
        <Sprout size={14} /> Attach evidence from your consultations
        <span className="font-normal text-gray-400 text-xs">(optional)</span>
      </label>
      {loading ? (
        <p className="text-xs text-gray-400">Loading your consultation history…</p>
      ) : (
        <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-56 overflow-y-auto">
          {rows.map(row => {
            const key = `${row.domain}:${row.id}`;
            const isSelected = selectedIds.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(row)}
                disabled={pendingId === key}
                className={classNames(
                  'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors disabled:opacity-50',
                  isSelected ? colors.activeOption : 'hover:bg-gray-50'
                )}
              >
                {isSelected
                  ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
                  : <Circle size={16} className="mt-0.5 flex-shrink-0 text-gray-300" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wide opacity-70">
                      {DOMAIN_LABELS[row.domain] || row.domain}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(row.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {row.resolution_outcome && (
                      <span className="text-xs font-semibold">{OUTCOME_LABELS[row.resolution_outcome]}</span>
                    )}
                  </div>
                  {row.summary_text && (
                    <p className="text-sm text-gray-700 truncate">{row.summary_text}</p>
                  )}
                  {row.resolution_value_amount != null && (
                    <p className="text-xs font-semibold opacity-80">
                      {row.resolution_value_unit === 'NGN' ? '₦' : ''}{row.resolution_value_amount}{row.resolution_value_unit && row.resolution_value_unit !== 'NGN' ? ` ${row.resolution_value_unit}` : ''}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
