import React, { useState } from 'react';
import { X } from 'lucide-react';
import classNames from 'classnames';

export type ResolutionOutcome = 'applied' | 'partially_applied' | 'not_applied';
export type ResolutionValueUnit = 'NGN' | 'kg' | 'days_averted' | 'animals_saved' | 'other';

export interface ResolutionSubmitData {
  outcome: ResolutionOutcome;
  narrative: string;
  valueAmount: number | null;
  valueUnit: ResolutionValueUnit | null;
  valueLabel: string | null;
}

export type ResolutionAccent = 'green' | 'cyan' | 'blue' | 'amber' | 'teal' | 'violet';

export const ACCENT_CLASSES: Record<ResolutionAccent, { ring: string; button: string; activeOption: string }> = {
  green: { ring: 'focus:ring-green-400', button: 'bg-green-600 hover:bg-green-700', activeOption: 'bg-green-50 border-green-400 text-green-800' },
  cyan:  { ring: 'focus:ring-cyan-400',  button: 'bg-cyan-600 hover:bg-cyan-700',   activeOption: 'bg-cyan-50 border-cyan-400 text-cyan-800' },
  blue:  { ring: 'focus:ring-blue-400',  button: 'bg-blue-600 hover:bg-blue-700',   activeOption: 'bg-blue-50 border-blue-400 text-blue-800' },
  amber: { ring: 'focus:ring-amber-400', button: 'bg-amber-600 hover:bg-amber-700', activeOption: 'bg-amber-50 border-amber-400 text-amber-800' },
  teal:  { ring: 'focus:ring-teal-400',  button: 'bg-teal-600 hover:bg-teal-700',   activeOption: 'bg-teal-50 border-teal-400 text-teal-800' },
  violet: { ring: 'focus:ring-accent/40', button: 'bg-accent hover:bg-accent/90', activeOption: 'bg-surface border-accent text-ink' },
};

const UNIT_LABELS: Record<ResolutionValueUnit, string> = {
  NGN: '₦ (Naira)',
  kg: 'kg',
  days_averted: 'days averted',
  animals_saved: 'animals saved',
  other: 'other',
};

const OUTCOME_OPTIONS: { value: ResolutionOutcome; label: string }[] = [
  { value: 'applied', label: 'Advice applied fully' },
  { value: 'partially_applied', label: 'Partially applied' },
  { value: 'not_applied', label: 'Not applied' },
];

interface ResolutionModalProps {
  isOpen: boolean;
  consultationSummary?: string;
  defaultUnit: ResolutionValueUnit;
  defaultValueLabel: string;
  accent?: ResolutionAccent;
  onClose: () => void;
  onSubmit: (data: ResolutionSubmitData) => Promise<void>;
}

export const ResolutionModal: React.FC<ResolutionModalProps> = ({
  isOpen,
  consultationSummary,
  defaultUnit,
  defaultValueLabel,
  accent = 'green',
  onClose,
  onSubmit,
}) => {
  const [outcome, setOutcome] = useState<ResolutionOutcome | null>(null);
  const [narrative, setNarrative] = useState('');
  const [valueAmount, setValueAmount] = useState('');
  const [valueUnit, setValueUnit] = useState<ResolutionValueUnit>(defaultUnit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = ACCENT_CLASSES[accent];

  if (!isOpen) return null;

  const reset = () => {
    setOutcome(null);
    setNarrative('');
    setValueAmount('');
    setValueUnit(defaultUnit);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!outcome) {
      setError('Please select what happened.');
      return;
    }
    if (!narrative.trim()) {
      setError('Please briefly describe what happened.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const amount = valueAmount.trim() ? parseFloat(valueAmount) : null;
      await onSubmit({
        outcome,
        narrative: narrative.trim(),
        valueAmount: amount !== null && !isNaN(amount) ? amount : null,
        valueUnit: amount !== null && !isNaN(amount) ? valueUnit : null,
        valueLabel: amount !== null && !isNaN(amount) ? defaultValueLabel : null,
      });
      reset();
    } catch (err) {
      console.error('[ResolutionModal] submit failed:', err);
      setError('Could not save this resolution. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-gray-900">Mark Resolved</h2>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          {consultationSummary && (
            <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mb-5 line-clamp-2">
              {consultationSummary}
            </p>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">What happened? *</label>
              <div className="space-y-2">
                {OUTCOME_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={classNames(
                      'flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors text-sm font-medium',
                      outcome === opt.value ? colors.activeOption : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    )}
                  >
                    <input
                      type="radio"
                      name="resolution-outcome"
                      checked={outcome === opt.value}
                      onChange={() => setOutcome(opt.value)}
                      className="accent-current"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tell us what happened *</label>
              <textarea
                value={narrative}
                onChange={e => setNarrative(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="e.g. The farmer applied the recommended spray and the outbreak stopped spreading within a week."
                className={classNames('w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 text-sm resize-none', colors.ring)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {defaultValueLabel} <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={valueAmount}
                  onChange={e => setValueAmount(e.target.value)}
                  placeholder="e.g. 15000"
                  className={classNames('flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 text-sm', colors.ring)}
                />
                <select
                  value={valueUnit}
                  onChange={e => setValueUnit(e.target.value as ResolutionValueUnit)}
                  className={classNames('px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 text-sm bg-white', colors.ring)}
                >
                  {(Object.keys(UNIT_LABELS) as ResolutionValueUnit[]).map(u => (
                    <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={classNames('flex-1 py-3 rounded-xl font-bold text-white transition-colors disabled:opacity-50', colors.button)}
              >
                {submitting ? 'Saving…' : 'Save & Resolve'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
