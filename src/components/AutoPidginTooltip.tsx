import React, { useCallback, useEffect, useId, useState } from 'react';
import { Loader2, MessageCircle, Volume2, X } from 'lucide-react';
import { usePidginSpeech } from '../hooks/usePidginSpeech';

export interface AutoPidginTooltipProps {
  originalText: string;
  hintText?: string;
  label?: string;
  className?: string;
}

export const AutoPidginTooltip: React.FC<AutoPidginTooltipProps> = ({
  originalText,
  hintText,
  label = 'Pidgin',
  className = '',
}: AutoPidginTooltipProps) => {
  const [open, setOpen] = useState<boolean>(false);
  const [pidginText, setPidginText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const id = useId();
  const { speakPidginText, speaking, cancelSpeech } = usePidginSpeech();

  useEffect(() => {
    setPidginText(null);
    setTranslationError(null);
  }, [originalText]);

  const fetchTranslation = useCallback(async () => {
    setTranslationError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/pidgin-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: originalText }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Translation request failed.');
      }

      const data = (await response.json().catch(() => null)) as { translation?: string } | null;
      const translation = data?.translation?.trim();

      if (!translation) {
        throw new Error('No translation was returned from the server.');
      }

      setPidginText(translation);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTranslationError(message || 'Unable to translate text.');
    } finally {
      setLoading(false);
    }
  }, [originalText]);

  const toggleOpen = useCallback(() => {
    if (open) {
      cancelSpeech();
      setOpen(false);
      return;
    }

    setOpen(true);
    if (!pidginText && !loading) {
      void fetchTranslation();
    }
  }, [cancelSpeech, fetchTranslation, loading, open, pidginText]);

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`auto-pidgin-tooltip-${id}`}
        onClick={toggleOpen}
        className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <MessageCircle className="h-4 w-4 text-slate-700" />
        <span>{label}</span>
      </button>

      {open && (
        <div
          id={`auto-pidgin-tooltip-${id}`}
          role="dialog"
          aria-label="Auto-generated Pidgin translation"
          className="absolute right-0 z-20 mt-2 w-[min(360px,100vw)] min-w-[260px] rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label} translation</p>
              {hintText ? (
                <p className="mt-1 text-sm text-slate-600">{hintText}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={toggleOpen}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close Pidgin translation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">
            {loading ? (
              <div className="flex items-center gap-2 text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Translating to Pidgin...</span>
              </div>
            ) : translationError ? (
              <p className="text-rose-700">{translationError}</p>
            ) : pidginText ? (
              pidginText.split('\n').map((line, index) => (
                <p key={index} className="mt-1 first:mt-0">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-slate-600">Tap Listen to translate the English text into Nigerian Pidgin.</p>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => pidginText && speakPidginText(pidginText)}
              disabled={loading || !pidginText}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Volume2 className="h-4 w-4" />
              {speaking ? 'Playing' : pidginText ? 'Listen' : 'Waiting'}
            </button>
            <div className="text-xs text-slate-500">
              {speaking ? 'Audio is playing.' : 'The translation is cached after the first request.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
