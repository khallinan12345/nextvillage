// src/hooks/useVoiceStage.ts
//
// The learner's current voice stage (auto / tap / off). Asks the database how many days they have used voice
// (once per page load), combines that with any choice they made themselves (voicePolicy.ts), and keeps a
// module-level copy so non-React code (useVoice.speak) can read it. Until the answer arrives, or if it fails,
// the stage is "auto", so a slow lookup never silences a new learner.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { effectiveStage, readPref, writePref, type VoicePref, type VoiceStage } from '../lib/voicePolicy';

let days = 0;
let pref: VoicePref = readPref();
let loaded = false;
const listeners = new Set<() => void>();

export const getVoiceStage = (): VoiceStage => effectiveStage(days, pref);
const notify = () => listeners.forEach(l => l());

export async function ensureVoiceStageLoaded() {
  if (loaded) return;
  loaded = true;
  const { data, error } = await supabase.rpc('my_voice_days');
  if (!error && typeof data === 'number') { days = data; notify(); } else { loaded = false; }
}

export function setVoicePref(next: VoicePref): void {
  pref = next;
  writePref(next);
  notify();
}

export function useVoiceStage(): { stage: VoiceStage; pref: VoicePref; setPref: (p: VoicePref) => void } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    void ensureVoiceStageLoaded();
    return () => { listeners.delete(l); };
  }, []);
  return { stage: getVoiceStage(), pref, setPref: setVoicePref };
}
