import { useCallback, useEffect, useRef, useState } from 'react';

const PIDGIN_TTS_API_PATH = '/api/pidgin-tts';

type PhoneticReplacementMap = Record<string, string>;

const PHONETIC_REPLACEMENTS: PhoneticReplacementMap = {
  dey: 'day',
  no: 'noh',
  waka: 'wah-kah',
  wey: 'way',
  abi: 'ah-bee',
  una: 'oo-nah',
  na: 'nah',
  dem: 'dehm',
  pikin: 'pee-kin',
  boku: 'boh-koo',
  egbon: 'egg-bon',
  abeg: 'ah-beg',
};

function cleanPidginTextForVoice(text: string): string {
  const normalized: string = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([,!?;])+/g, '$1')
    .replace(/\s+([,!?;.])/g, '$1');

  const phonetic: string = normalized.replace(
    /\b(dey|no|waka|wey|abi|una|na|dem|pikin|boku|egbon|abeg)\b/gi,
    (match: string) => {
      const replacement: string | undefined = PHONETIC_REPLACEMENTS[match.toLowerCase()];
      return replacement || match;
    }
  );

  const paced: string = phonetic
    .replace(/\b(abeg|anyway|so|then|but|because|when|if|na|nah)\b/gi, '$1,')
    .replace(/\.\s*(?=[A-Za-z])/g, '. ')
    .replace(/([^.?!,])\s+(?=[A-Z][a-z]+)/g, '$1. ')
    .trim();

  return paced.endsWith('.') || paced.endsWith('!') || paced.endsWith('?')
    ? paced
    : `${paced}.`;
}

export interface UsePidginSpeechReturn {
  speakPidginText: (textToSpeak: string) => Promise<void>;
  speaking: boolean;
  loading: boolean;
  error: string | null;
  cancelSpeech: () => void;
}

export function usePidginSpeech(): UsePidginSpeechReturn {
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const cleanupAudio = useCallback((): void => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const cancelSpeech = useCallback((): void => {
    cleanupAudio();
    setSpeaking(false);
  }, [cleanupAudio]);

  useEffect((): (() => void) => {
    return (): void => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const speakPidginText = useCallback(async (textToSpeak: string): Promise<void> => {
    if (!textToSpeak?.trim()) {
      return;
    }

    setError(null);
    setLoading(true);
    setSpeaking(false);
    cancelSpeech();

    const cleanedText: string = cleanPidginTextForVoice(textToSpeak);

    try {
      const response: Response = await fetch(PIDGIN_TTS_API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: cleanedText }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Pidgin TTS request failed.');
      }

      const audioBlob: Blob = await response.blob();
      const objectUrl: string = URL.createObjectURL(audioBlob);

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      audioUrlRef.current = objectUrl;

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      audioRef.current.src = objectUrl;
      audioRef.current.onended = (): void => {
        setSpeaking(false);
      };
      audioRef.current.onerror = (): void => {
        setError('Audio playback failed. Try again later.');
        setSpeaking(false);
      };

      await audioRef.current.play();
      setSpeaking(true);
    } catch (err: unknown) {
      const message: string = err instanceof Error ? err.message : String(err);
      setError(message || 'Unable to play Pidgin audio.');
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(
          v =>
            v.lang.includes('en-NG') ||
            v.name.toLowerCase().includes('nigerian') ||
            v.lang.includes('en-GB') ||
            v.lang.includes('en-US')
        );
        if (preferredVoice) utterance.voice = preferredVoice;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        setSpeaking(true);
      }
    } finally {
      setLoading(false);
    }
  }, [cancelSpeech]);

  return {
    speakPidginText,
    speaking,
    loading,
    error,
    cancelSpeech,
  };
}
