import React, { useId, useState } from 'react';
import { MessageCircle, Volume2, X } from 'lucide-react';
import { usePidginSpeech } from '../hooks/usePidginSpeech';
import { AutoPidginTooltip } from './AutoPidginTooltip';

interface BasePidginTooltipProps {
  hintText?: string;
  label?: string;
  className?: string;
}

interface ManualPidginTooltipProps extends BasePidginTooltipProps {
  pidginText: string;
}

export interface PidginTooltipProps extends BasePidginTooltipProps {
  pidginText?: string;
  originalText?: string;
}

const ManualPidginTooltip: React.FC<ManualPidginTooltipProps> = ({
  pidginText,
  hintText,
  label = 'Pidgin',
  className = '',
}: ManualPidginTooltipProps) => {
  const [open, setOpen] = useState<boolean>(false);
  const id = useId();
  const { speakPidginText, speaking, loading, error, cancelSpeech } = usePidginSpeech();

  const toggleOpen = (): void => {
    if (open) {
      cancelSpeech();
    }
    setOpen((current: boolean) => !current);
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`pidgin-tooltip-${id}`}
        onClick={toggleOpen}
        className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <MessageCircle className="h-4 w-4 text-slate-700" />
        <span>{label}</span>
      </button>

      {open && (
        <div
          id={`pidgin-tooltip-${id}`}
          role="dialog"
          aria-label="Pidgin translation explanation"
          className="absolute right-0 z-20 mt-2 w-[min(360px,100vw)] min-w-[260px] rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label} explanation</p>
              {hintText ? (
                <p className="mt-1 text-sm text-slate-600">{hintText}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={toggleOpen}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close Pidgin explanation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">
            {pidginText.split('\n').map((line, index) => (
              <p key={index} className="mt-1 first:mt-0">
                {line}
              </p>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => speakPidginText(pidginText)}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Volume2 className="h-4 w-4" />
              {speaking ? 'Playing' : loading ? 'Preparing...' : 'Listen'}
            </button>
            <div className="text-xs text-slate-500">
              {speaking ? 'Audio is playing.' : 'Tap listen to hear the Pidgin text.'}
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export const PidginTooltip: React.FC<PidginTooltipProps> = ({
  pidginText,
  originalText,
  hintText,
  label = 'Pidgin',
  className = '',
}: PidginTooltipProps) => {
  if (pidginText) {
    return (
      <ManualPidginTooltip
        pidginText={pidginText}
        hintText={hintText}
        label={label}
        className={className}
      />
    );
  }

  if (!originalText) {
    return (
      <div className={`relative inline-flex ${className}`}>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm"
          title="Provide pidginText or originalText to enable Pidgin translation"
        >
          <MessageCircle className="h-4 w-4 text-slate-400" />
          <span>{label}</span>
        </button>
      </div>
    );
  }

  return (
    <AutoPidginTooltip
      originalText={originalText}
      hintText={hintText}
      label={label}
      className={className}
    />
  );
};
