// src/lib/voicePolicy.ts
//
// How much voice a learner gets. Text-to-speech is billed per character and is most valuable to new learners,
// so voice fades as they grow past it:
//   auto  – every AI reply is read aloud on its own (a learner's first few days of using voice)
//   tap   – replies are not read until the learner taps Listen (next stretch)
//   off   – no voice unless the learner turns it on (after that)
// A learner can always choose a setting themselves; their choice wins. Buttons that read one specific message
// aloud always work, whatever the setting.

export type VoiceStage = 'auto' | 'tap' | 'off';
export type VoicePref = VoiceStage | null;

export const AUTO_DAYS = 5;   // days of voice use with automatic reading
export const TAP_DAYS = 15;   // days of voice use before the default becomes off
const PREF_KEY = 'nv_voice_pref';

export function stageForDays(days: number): VoiceStage {
  if (days <= AUTO_DAYS) return 'auto';
  if (days <= TAP_DAYS) return 'tap';
  return 'off';
}

export function effectiveStage(days: number, pref: VoicePref): VoiceStage {
  return pref ?? stageForDays(days);
}

export function readPref(): VoicePref {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'auto' || v === 'tap' || v === 'off' ? v : null;
  } catch { return null; }
}

export function writePref(pref: VoicePref): void {
  try {
    if (pref) localStorage.setItem(PREF_KEY, pref); else localStorage.removeItem(PREF_KEY);
  } catch { /* storage blocked: the setting just won't stick */ }
}

// True when the call comes straight from a click (the learner pressed a speaker button), as opposed to a reply
// arriving later. window.event is the event being dispatched right now and is empty in async callbacks.
export function isUserGesture(): boolean {
  if (typeof window === 'undefined') return false;
  const type = (window as unknown as { event?: Event }).event?.type;
  return type === 'click' || type === 'keydown' || type === 'keyup' || type === 'pointerup' || type === 'touchend';
}
