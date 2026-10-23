// src/components/VoiceListenButton.tsx
//
// Small speaker button, bottom-left of every page. Voice fades as learners advance (lib/voicePolicy.ts): once
// replies stop being read aloud on their own, the latest one waits here and is read only when the learner taps
// "Listen". The menu also lets them pick Automatic / Tap to play / Off. Hidden while voice is automatic and
// there is nothing waiting, so new learners see no extra clutter.

import React, { useState, useSyncExternalStore } from 'react';
import { Volume2 } from 'lucide-react';
import { useVoiceStage } from '../hooks/useVoiceStage';
import { getPendingSpeech, setPendingSpeech, subscribePendingSpeech } from '../lib/voiceQueue';
import { speakEnglish } from '../lib/speechCoordination';
import type { VoicePref } from '../lib/voicePolicy';

const CHOICES: { value: VoicePref; label: string }[] = [
  { value: 'auto', label: 'Read replies aloud automatically' },
  { value: 'tap', label: 'Tap to play' },
  { value: 'off', label: 'Voice off' },
];

const VoiceListenButton: React.FC = () => {
  const { stage, pref, setPref } = useVoiceStage();
  const pending = useSyncExternalStore(subscribePendingSpeech, getPendingSpeech, () => null);
  const [open, setOpen] = useState(false);

  if (stage === 'auto' && !pending && !open) return null;

  const listen = () => {
    if (!pending) return;
    const text = pending;
    setPendingSpeech(null);
    void speakEnglish(text);
  };

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {open && (
        <div className="mb-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg text-sm">
          {pending && (
            <button onClick={listen} className="w-full mb-2 px-3 py-2 rounded-lg bg-amber-600 text-white font-semibold">
              Listen to the last reply
            </button>
          )}
          <div className="font-semibold text-gray-800 mb-1">Voice</div>
          {CHOICES.map(c => (
            <label key={c.label} className="flex items-center gap-2 py-0.5 text-gray-700">
              <input type="radio" name="voice-pref" checked={(pref ?? stage) === c.value} onChange={() => setPref(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
      <button
        onClick={() => (pending && !open ? listen() : setOpen(o => !o))}
        aria-label={pending ? 'Listen to the last reply' : 'Voice settings'}
        title={pending ? 'Listen to the last reply' : 'Voice settings'}
        className={`h-10 w-10 rounded-full shadow-md flex items-center justify-center border ${pending ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-gray-600 border-gray-300'}`}
      >
        <Volume2 size={18} />
      </button>
      {pending && !open && (
        <button onClick={() => setOpen(true)} className="ml-2 text-xs text-gray-600 underline">Voice settings</button>
      )}
    </div>
  );
};

export default VoiceListenButton;
