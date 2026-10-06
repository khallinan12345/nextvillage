import React, { useEffect } from 'react';
import { X, ShieldCheck, ShieldAlert, Scale, Loader2 } from 'lucide-react';
import classNames from 'classnames';
import type { Comparison } from './types';

const VERDICTS: Record<string, { label: string; className: string }> = {
  guardrail_helped: { label: 'Guardrail helped', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  no_difference:    { label: 'No difference',    className: 'bg-gray-100 text-gray-700 border-gray-300' },
  guardrail_failed: { label: 'Guardrail failed', className: 'bg-red-100 text-red-800 border-red-300' },
  unclear:          { label: 'Unclear',          className: 'bg-amber-100 text-amber-800 border-amber-300' },
};

const List: React.FC<{ title: string; items?: string[]; icon?: React.ReactNode; tone: string }> = ({ title, items, icon, tone }) => {
  if (!items || items.length === 0) return null;
  return (
    <section className={classNames('rounded-lg border p-4', tone)}>
      <h3 className="flex items-center gap-2 text-sm font-bold mb-2">{icon}{title}</h3>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </section>
  );
};

interface Props {
  open: boolean;
  loading: boolean;
  error: string;
  comparison: Comparison | null;
  onClose: () => void;
}

const ComparisonModal: React.FC<Props> = ({ open, loading, error, comparison, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const r = comparison?.result;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Guarded versus unguarded comparison" onClick={onClose}>
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900"><Scale className="w-5 h-5 text-violet-600" /> Guarded vs. unguarded</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-gray-600">
              <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
              <p className="text-sm">The comparison agent is reading everything both agents did&hellip;</p>
            </div>
          )}

          {!loading && error && <p className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">{error}</p>}

          {!loading && !error && r && (
            <>
              {r.headline && <p className="text-base font-semibold text-gray-900 leading-snug">{r.headline}</p>}

              {r.raw_text && <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 rounded-lg p-4">{r.raw_text}</pre>}

              {(r.rounds ?? []).map((rd, i) => {
                const v = VERDICTS[rd.verdict] ?? VERDICTS.unclear;
                return (
                  <section key={i} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-sm font-bold text-gray-900">Round {rd.round ?? i + 1}: {rd.what_was_tested}</h3>
                      <span className={classNames('shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border', v.className)}>{v.label}</span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3"><p className="text-xs font-bold text-emerald-800 mb-1">Anchor (guarded)</p>{rd.anchor}</div>
                      <div className="rounded-md bg-amber-50 border border-amber-200 p-3"><p className="text-xs font-bold text-amber-800 mb-1">Driftwood (unguarded)</p>{rd.driftwood}</div>
                    </div>
                    {rd.why_it_matters && <p className="mt-2 text-sm text-gray-600 italic">{rd.why_it_matters}</p>}
                  </section>
                );
              })}

              <List title="What the guardrails changed" items={r.what_the_guardrails_changed} icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />} tone="border-emerald-200 bg-emerald-50/50" />
              <List title="Risks seen without guardrails" items={r.risks_seen_without_guardrails} icon={<ShieldAlert className="w-4 h-4 text-red-600" />} tone="border-red-200 bg-red-50/50" />
              <List title="Where guardrails fell short or cost something" items={r.where_guardrails_fell_short_or_cost_something} tone="border-amber-200 bg-amber-50/50" />
              <List title="Takeaways" items={r.takeaways} tone="border-violet-200 bg-violet-50/50" />

              <p className="text-xs text-gray-500">Written by a third AI agent that read both transcripts. It can be wrong, so check it against the answers above it. Saved to this session.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComparisonModal;
