/**
 * useVoice — Nigeria-aware text-to-speech hook
 *
 * Voice priority chain (Africa / Nigeria users):
 *   1. en-NG  — Nigerian English (local, installed on Chromebook)
 *   2. en-ZA  — South African English (closest available local accent)
 *   3. Any local en-* voice  (localService = true — works offline / low bandwidth)
 *   4. en-GB  female  (clear, relatively slow)
 *   5. Any en-* voice
 *   6. Silent text-fallback  — displays spoken text on screen instead
 *
 * Voice priority chain (non-Africa users):
 *   1. en-GB  female
 *   2. en-GB
 *   3. Google en-* (network, clearest quality)
 *   4. en-US
 *   5. Any local en-*
 *   6. Any en-*
 *   7. Silent text-fallback
 *
 * Speech recognition language:
 *   Africa → en-NG   (understands Nigerian-accented English far better than en-US)
 *   Others → en-US
 *
 * Usage:
 *   const { speak, cancel, speaking, fallbackText, voiceReady, recognitionLang } = useVoice(isAfrica);
 *
 *   // Speak something
 *   speak("Hello! Let's learn together.");
 *
 *   // If voice failed, show fallbackText in your UI
 *   {fallbackText && <div className="voice-fallback">{fallbackText}</div>}
 *
 *   // Use recognitionLang for SpeechRecognition
 *   recognition.lang = recognitionLang;
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { prepareForBrowserSpeech, registerEnglishSpeak } from '../lib/speechCoordination';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseVoiceReturn {
  /** Speak the given text. If TTS unavailable, sets fallbackText instead. */
  speak: (text: string) => void;
  /** Cancel any current speech. */
  cancel: () => void;
  /** True while the browser is actively speaking. */
  speaking: boolean;
  /** Set when TTS is unavailable — display this text in your UI as a fallback. */
  fallbackText: string | null;
  /** Clear the fallback text (e.g. when user dismisses it). */
  clearFallback: () => void;
  /** True once voices have loaded and the selected voice is confirmed. */
  voiceReady: boolean;
  /** The BCP-47 language tag to pass to SpeechRecognition.lang */
  recognitionLang: string;
  /** The voice that was selected (null if none available / still loading). */
  selectedVoice: SpeechSynthesisVoice | null;
  /** Whether TTS is available at all in this browser. */
  ttsAvailable: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TTS_TIMEOUT_MS = 3000; // If speech hasn't started in 3s, treat as failed

// ─── Voice selection ──────────────────────────────────────────────────────────

function pickVoice(
  voices: SpeechSynthesisVoice[],
  isAfrica: boolean
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const local = (v: SpeechSynthesisVoice) => v.localService === true;
  const en = (v: SpeechSynthesisVoice) => v.lang.startsWith('en');

  if (isAfrica) {
    return (
      // 1. Nigerian English — local preferred, network acceptable
      voices.find(v => v.lang === 'en-NG' && local(v)) ||
      voices.find(v => v.lang === 'en-NG') ||
      // 2. South African English — next closest regional accent
      voices.find(v => v.lang === 'en-ZA' && local(v)) ||
      voices.find(v => v.lang === 'en-ZA') ||
      // 3. Any local English — works even when offline / bandwidth is poor
      voices.find(v => local(v) && en(v)) ||
      // 4. British English female — clear, relatively slow speech rate
      voices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female')) ||
      voices.find(v => v.lang === 'en-GB') ||
      // 5. Any English at all
      voices.find(v => en(v)) ||
      null
    );
  }

  // Non-Africa priority chain
  return (
    voices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female')) ||
    voices.find(v => v.lang === 'en-GB') ||
    voices.find(v => v.name.toLowerCase().includes('google') && en(v)) ||
    voices.find(v => v.lang === 'en-US') ||
    voices.find(v => local(v) && en(v)) ||
    voices.find(v => en(v)) ||
    null
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoice(isAfrica: boolean = false): UseVoiceReturn {
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recognition language — Nigerian English understands Nigerian-accented speech
  // far better than en-US
  const recognitionLang = isAfrica ? 'en-NG' : 'en-US';

  // ── Load and select voice ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setTtsAvailable(false);
      setVoiceReady(true); // "ready" in the sense that we know it won't work
      return;
    }

    setTtsAvailable(true);

    const tryLoad = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return; // Not ready yet

      const chosen = pickVoice(voices, isAfrica);
      setSelectedVoice(chosen);
      setVoiceReady(true);

      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoice] selected:', chosen?.name, chosen?.lang, '| local:', chosen?.localService);
        console.log('[useVoice] all voices:', voices.map(v => `${v.name} (${v.lang}) local=${v.localService}`));
      }
    };

    tryLoad();

    // Chrome fires onvoiceschanged asynchronously
    window.speechSynthesis.onvoiceschanged = tryLoad;

    // Safety: if voices never load (e.g. browser bug), mark ready anyway after 2s
    const safetyTimer = setTimeout(() => {
      if (!voiceReady) {
        setVoiceReady(true);
      }
    }, 2000);

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      clearTimeout(safetyTimer);
    };
  }, [isAfrica]); // Re-run if user's continent changes

  // ── Re-pick voice when continent changes but voices are already loaded ─────
  useEffect(() => {
    if (!voiceReady || !ttsAvailable) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      setSelectedVoice(pickVoice(voices, isAfrica));
    }
  }, [isAfrica, voiceReady, ttsAvailable]);

  // ── speak() ───────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!text.trim()) return;

    // Clear any previous fallback
    setFallbackText(null);

    // If TTS not available at all → show text immediately
    if (!ttsAvailable || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setFallbackText(text);
      return;
    }

    // Stop Pidgin SpeechGen audio and any browser speech before starting
    prepareForBrowserSpeech();

    const utterance = new SpeechSynthesisUtterance(text);

    // Apply the selected voice
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      // No voice found — default to en-NG for Africa, en-US otherwise
      utterance.lang = isAfrica ? 'en-NG' : 'en-US';
    }

    // Slightly slower rate for Nigerian learners — easier to follow
    utterance.rate = isAfrica ? 0.88 : 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Track speaking state
    let started = false;

    utterance.onstart = () => {
      started = true;
      setSpeaking(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    utterance.onend = () => {
      setSpeaking(false);
      setFallbackText(null);
    };

    utterance.onerror = (e) => {
      // 'interrupted' fires when cancel() is called — not a real error
      if (e.error === 'interrupted' || e.error === 'canceled') {
        setSpeaking(false);
        return;
      }
      console.warn('[useVoice] TTS error:', e.error);
      setSpeaking(false);
      setFallbackText(text); // Show text as fallback
    };

    // Timeout fallback — if speech hasn't started within 3s (e.g. voice failed
    // to download over slow connection), show the text instead
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!started) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
        setFallbackText(text);
        console.warn('[useVoice] TTS timeout — showing text fallback');
      }
    }, TTS_TIMEOUT_MS);

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[useVoice] speak() threw:', err);
      setSpeaking(false);
      setFallbackText(text);
    }
  }, [ttsAvailable, selectedVoice, isAfrica]);

  // ── cancel() ──────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    prepareForBrowserSpeech();
    setSpeaking(false);
  }, []);

  // Register so AIPidginCoachWrapper can route English playback through this hook
  useEffect(() => {
    return registerEnglishSpeak(speak);
  }, [speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      prepareForBrowserSpeech();
    };
  }, []);

  return {
    speak,
    cancel,
    speaking,
    fallbackText,
    clearFallback: () => setFallbackText(null),
    voiceReady,
    recognitionLang,
    selectedVoice,
    ttsAvailable,
  };
}
