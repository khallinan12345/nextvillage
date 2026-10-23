// src/lib/voiceQueue.ts
//
// When voice is on tap-to-play, the latest AI reply is held here instead of being read aloud. The Listen
// button (components/VoiceListenButton.tsx) reads it when the learner taps, so each clip is paid for only
// if it is wanted.

type Listener = () => void;
let pending: string | null = null;
const listeners = new Set<Listener>();

export function setPendingSpeech(text: string | null): void {
  pending = text && text.trim() ? text : null;
  listeners.forEach(l => l());
}
export const getPendingSpeech = (): string | null => pending;
export function subscribePendingSpeech(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
