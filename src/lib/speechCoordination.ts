/**
 * Cross-hook speech coordination so Pidgin SpeechGen audio and browser
 * speechSynthesis never play at the same time.
 */

const PIDGIN_TTS_API_PATH = '/api/pidgin-tts';

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

/**
 * Plays Pidgin narration through SpeechGen (Ezinne voice) via /api/pidgin-tts.
 * Returns false (without throwing) on any failure, so callers can fall back
 * to browser speechSynthesis. This is the one place that talks to SpeechGen
 * for pages that don't use the useVoice/usePidginSpeech hooks.
 */
export async function playPidginVoice(
  text: string,
  callbacks: { onStart?: () => void; onEnd?: () => void; onError?: (err: unknown) => void } = {}
): Promise<boolean> {
  if (!text.trim()) return false;

  try {
    const response = await fetch(PIDGIN_TTS_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const data = (await response.json().catch(() => null)) as
      | { audioUrl?: string; error?: string }
      | null;

    if (!response.ok || !data?.audioUrl) {
      throw new Error(data?.error || 'Pidgin TTS request failed.');
    }

    const audio = new Audio(data.audioUrl);
    const cancel = () => { audio.pause(); audio.src = ''; };
    audio.onended = () => { clearActivePidginCancel(cancel); callbacks.onEnd?.(); };
    audio.onerror = (e) => { clearActivePidginCancel(cancel); callbacks.onError?.(e); callbacks.onEnd?.(); };

    prepareForPidginSpeech(cancel);
    await audio.play();
    callbacks.onStart?.();
    return true;
  } catch (err) {
    callbacks.onError?.(err);
    return false;
  }
}
