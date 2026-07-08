/**
 * Cross-hook speech coordination so Pidgin SpeechGen audio and browser
 * speechSynthesis never play at the same time.
 */

let activePidginCancel: (() => void) | null = null;
let englishSpeak: ((text: string) => void) | null = null;

export function registerEnglishSpeak(fn: (text: string) => void): () => void {
  englishSpeak = fn;
  return () => {
    if (englishSpeak === fn) {
      englishSpeak = null;
    }
  };
}

export function stopBrowserSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function stopPidginSpeech(): void {
  if (!activePidginCancel) return;
  const cancel = activePidginCancel;
  activePidginCancel = null;
  cancel();
}

export function clearActivePidginCancel(cancel: () => void): void {
  if (activePidginCancel === cancel) {
    activePidginCancel = null;
  }
}

/** Stop all audio, then mark the given cancel fn as the active Pidgin playback. */
export function prepareForPidginSpeech(onCancel: () => void): void {
  stopBrowserSpeech();
  stopPidginSpeech();
  activePidginCancel = onCancel;
}

/** Stop all audio before browser TTS starts. */
export function prepareForBrowserSpeech(): void {
  stopPidginSpeech();
  stopBrowserSpeech();
}

export function speakEnglish(text: string): void {
  if (!text.trim()) return;
  prepareForBrowserSpeech();
  if (englishSpeak) {
    englishSpeak(text);
  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}
