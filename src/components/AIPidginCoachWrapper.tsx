import React, { useState, useEffect } from 'react';
import { Volume2, RefreshCw, Languages, AlertCircle } from 'lucide-react';
import { chatText } from '../lib/chatClient';
import { usePidginSpeech } from '../hooks/usePidginSpeech';
import { speakEnglish, stopBrowserSpeech } from '../lib/speechCoordination';

interface AIPidginCoachWrapperProps {
  englishText: string;
}

export const AIPidginCoachWrapper: React.FC<AIPidginCoachWrapperProps> = ({ englishText }) => {
  const [pidginText, setPidginText] = useState<string>('');
  const [showPidgin, setShowPidgin] = useState<boolean>(false);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const { speakPidginText, speaking, loading: isAudioLoading, error: audioError, cancelSpeech } = usePidginSpeech();
  const displayError = errorMessage || audioError;

  useEffect(() => {
    return () => {
      cancelSpeech();
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [cancelSpeech, englishText]);

  const handleTranslate = async () => {
    if (pidginText) {
      setShowPidgin(!showPidgin);
      setErrorMessage('');
      return;
    }

    setIsTranslating(true);
    setErrorMessage('');
    try {
      // Direct, clean processing constraints payload
      const systemPrompt = 
        "You are a professional educational translator. Your task is to fulfill these structural processing rules:\n" +
        "1. COMPLETE DYNAMIC TRANSLATION: Translate the entire input text block fully into natural, fluent, and conversational Nigerian Pidgin English.\n" +
        "2. CONTEXT PRESERVATION: Retain all mathematical values, numbers, fractions, percentages, variables, data points, formulas, and scenario conditions exactly as they are so the educational context is completely preserved.\n" +
        "3. CLEAN STRING OUTPUT: Return ONLY the clean, successfully translated Pidgin text string. Do not append system debug tags, bracketed commentary, boilerplate text, notes, or placeholder hints. Output the raw translation directly.";
      
      let response = "";
      const requestPayload = {
        url: '/api/chat',
        page: 'PidginTranslationModule',
        system: systemPrompt,
        messages: [
          { role: 'user', content: englishText }
        ],
      };

      console.debug('[AIPidginCoachWrapper] translation request payload:', requestPayload);

      try {
        // Primary format matching system-wide backend requirements (includes page and separate system string)
        response = await chatText(requestPayload as any);
      } catch (innerErr) {
        console.warn('[AIPidginCoachWrapper] primary translation call failed, retrying with explicit system message', innerErr);
        // Safe standard message array fallback
        response = await chatText({
          page: 'PidginTranslationModule',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: englishText }
          ]
        } as any);
      }
      
      if (response && response.trim()) {
        setPidginText(response.trim());
        setShowPidgin(true);
      } else {
        throw new Error("Received empty text string from translation client.");
      }
    } catch (err) {
      console.error("Pidgin translation failed:", {
        error: err,
        request: {
          url: '/api/chat',
          page: 'PidginTranslationModule',
          englishText,
        },
      });
      setErrorMessage("Translation connection error. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleListen = async () => {
    if (speaking) {
      cancelSpeech();
      return;
    }

    setErrorMessage('');
    stopBrowserSpeech();

    if (showPidgin && pidginText.trim()) {
      try {
        await speakPidginText(pidginText);
      } catch (err) {
        console.error('[AIPidginCoachWrapper] speakPidginText failed', err);
      }
      return;
    }

    if (englishText.trim()) {
      speakEnglish(englishText);
    }
  };

  return (
    <div className="mt-2 space-y-2 border-t border-slate-700/30 pt-2 text-left">
      {showPidgin && pidginText && (
        <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-2.5 text-xs text-emerald-200 italic leading-relaxed">
          {pidginText}
        </div>
      )}

      {displayError && (
        <div className="text-[10px] text-amber-400 flex items-center gap-1 bg-amber-500/10 p-1 rounded border border-amber-500/20">
          <AlertCircle size={10} />
          {displayError}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
            showPidgin 
              ? 'bg-emerald-600 text-white shadow-sm' 
              : 'bg-slate-800 text-slate-300 border border-slate-700/60 hover:bg-slate-700'
          }`}
        >
          {isTranslating ? <RefreshCw size={12} className="animate-spin" /> : <Languages size={12} />}
          {showPidgin ? 'Show English' : 'Translate to Pidgin'}
        </button>

        <button
          onClick={handleListen}
          disabled={isAudioLoading}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all bg-slate-800 text-slate-300 border border-slate-700/60 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Volume2 size={12} />
          {isAudioLoading ? 'Generating audio...' : speaking ? 'Stop audio' : 'Listen in Pidgin'}
        </button>
      </div>
    </div>
  );
};
