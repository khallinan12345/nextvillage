// src/pages/VoiceCreationPage.tsx
//
// AI Voice Creation — MiniMax Speech-02-Turbo via Replicate.
// Features:
//   • Access gate: Africa + North America (profiles.continent)
//   • UI voice toggle (UK English 🇬🇧 / Nigerian Pidgin 🇳🇬) for page narration
//   • communication_level adaptive UI text
//   • Voice preset selector (female / male, multiple styles)
//   • Emotion control (neutral, happy, sad, surprised, angry)
//   • Speed control
//   • "Improve my English" — polishes the script
//   • "Critique my Script" — coaching on spoken content quality
//   • Step-by-step script builder with Improve English in chat box
//   • 30/week usage limit
//   • In-browser audio player with waveform colour
//   • Save audio to Supabase Storage (ai-voices bucket)
//   • Save session to dashboard
//   *Note: The first voice creation could take 1-2 minutes.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { chatText } from '../../lib/chatClient';
import { playPidginVoice, stopPidginSpeech } from '../../lib/speechCoordination';
import {
  Mic, Sparkles, Clock, CheckCircle, XCircle,
  Download, RotateCcw, ChevronDown, ChevronUp,
  Volume2, VolumeX, Wand2, MessageSquare, Lightbulb,
  Save, AlertTriangle, Play, Pause, StopCircle,
} from 'lucide-react';
import classNames from 'classnames';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoiceJob {
  id: string;
  script: string;
  voice_id: string;
  emotion: string;
  status: 'pending' | 'generating' | 'succeeded' | 'failed';
  audio_url: string | null;
  saved_audio_url: string | null;
  error_message: string | null;
  created_at: string;
}

type ViewMode = 'generate' | 'history';
type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'fearful';

// ─── Voice presets ────────────────────────────────────────────────────────────

interface VoicePreset {
  id: string;
  label: string;
  gender: 'female' | 'male';
  style: string;
  emoji: string;
}

const VOICE_PRESETS: VoicePreset[] = [
  { id: 'female-sharonlee',   label: 'Sharon',    gender: 'female', style: 'Clear & Warm',     emoji: '👩' },
  { id: 'female-sarah',       label: 'Sarah',     gender: 'female', style: 'Professional',     emoji: '👩‍💼' },
  { id: 'female-luna',        label: 'Luna',      gender: 'female', style: 'Calm & Gentle',    emoji: '🌙' },
  { id: 'female-aria',        label: 'Aria',      gender: 'female', style: 'Energetic',        emoji: '⚡' },
  { id: 'male-adam',          label: 'Adam',      gender: 'male',   style: 'Deep & Confident', emoji: '👨' },
  { id: 'male-charlie',       label: 'Charlie',   gender: 'male',   style: 'Friendly',         emoji: '😊' },
  { id: 'male-liam',          label: 'Liam',      gender: 'male',   style: 'Authoritative',    emoji: '🎙️' },
  { id: 'male-oliver',        label: 'Oliver',    gender: 'male',   style: 'Storyteller',      emoji: '📖' },
];

const EMOTIONS: { id: Emotion; label: string; emoji: string }[] = [
  { id: 'neutral',   label: 'Neutral',   emoji: '😐' },
  { id: 'happy',     label: 'Happy',     emoji: '😊' },
  { id: 'sad',       label: 'Sad',       emoji: '😔' },
  { id: 'surprised', label: 'Surprised', emoji: '😮' },
  { id: 'angry',     label: 'Angry',     emoji: '😠' },
  { id: 'fearful',   label: 'Fearful',   emoji: '😨' },
];

const SCRIPT_SUGGESTIONS = [
  'My name is Amara and I am learning how to use artificial intelligence at the Davidson AI Innovation Center in Oloibiri, Nigeria.',
  'Today I want to tell you about solar energy and how it is changing life in our community.',
  'Good morning! Welcome to our school. We are excited to show you what we have been learning about technology and the future.',
  'I believe that every young person in Africa deserves access to the best education and technology in the world.',
];

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const WEEKLY_LIMIT  = 30;

const STATUS_CONFIG: Record<string, { color: string; border: string; icon: string }> = {
  generating: { color: 'text-emerald-300', border: 'border-emerald-500/30', icon: '🎙️' },
  succeeded:  { color: 'text-green-300',   border: 'border-green-500/30',   icon: '✅' },
  failed:     { color: 'text-red-400',     border: 'border-red-500/30',     icon: '❌' },
};

// ─── Edge Function helper ─────────────────────────────────────────────────────

async function callEdgeFunction(
  path: string, method: 'POST', token: string, body: object,
): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${FUNCTIONS_URL}/${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// ─── Audio Player component ───────────────────────────────────────────────────

const AudioPlayer: React.FC<{ src: string; label?: string }> = ({ src, label }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing,   setPlaying]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [duration,  setDuration]  = useState(0);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 space-y-2">
      {label && <p className="text-xs text-slate-400 truncate">{label}</p>}
      <audio ref={audioRef}
        src={src}
        onTimeUpdate={e => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <div className="flex items-center gap-3">
        <button onClick={toggle}
          className="w-9 h-9 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 rounded-full text-white transition-colors flex-shrink-0">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div className="flex-1">
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden cursor-pointer"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const a = audioRef.current;
              if (a && duration) { a.currentTime = pct * duration; setProgress(pct * duration); }
            }}>
            <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
              style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }} />
          </div>
        </div>
        <span className="text-xs text-slate-500 flex-shrink-0 font-mono">
          {fmt(progress)} / {duration ? fmt(duration) : '--:--'}
        </span>
      </div>
    </div>
  );
};

// ─── History card ─────────────────────────────────────────────────────────────

const VoiceCard: React.FC<{ job: VoiceJob; onReuse: (s: string) => void }> = ({ job, onReuse }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.succeeded;
  const preset = VOICE_PRESETS.find(v => v.id === job.voice_id);
  const displayUrl = job.saved_audio_url ?? job.audio_url;
  return (
    <div className={classNames('rounded-xl border backdrop-blur-sm overflow-hidden', cfg.border, 'bg-slate-900/60')}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors">
        <span className={classNames('text-sm font-semibold shrink-0', cfg.color)}>{cfg.icon}</span>
        <p className="text-sm text-slate-300 truncate flex-1 min-w-0">{job.script}</p>
        <span className="text-xs text-slate-500 shrink-0">{preset?.label ?? job.voice_id}</span>
        <span className="text-xs text-slate-500 shrink-0">{new Date(job.created_at).toLocaleDateString()}</span>
        {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          {displayUrl && <AudioPlayer src={displayUrl} label={job.script.slice(0, 60) + '…'} />}
          {job.status === 'failed' && (
            <p className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{job.error_message ?? 'Generation failed.'}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onReuse(job.script)}
              className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full px-3 py-1.5 transition-colors">
              <RotateCcw size={12} /> Reuse script
            </button>
            {displayUrl && (
              <button onClick={async () => {
                try {
                  const resp = await fetch(displayUrl);
                  const blob = await resp.blob();
                  const ext = blob.type.includes('wav') ? 'wav' : 'mp3';
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `voice.${ext}`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 5000);
                } catch { window.open(displayUrl, '_blank'); }
              }} className="flex items-center gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-full px-3 py-1.5 transition-colors">
                <Download size={12} /> Download
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const VoiceCreationPage: React.FC = () => {
  const { user } = useAuth();

  // ── View / generation state ───────────────────────────────────────────────
  const [view,        setView]        = useState<ViewMode>('generate');
  const [script,      setScript]      = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('female-sharonlee');
  const [emotion,     setEmotion]     = useState<Emotion>('neutral');
  const [speed,       setSpeed]       = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeJob,   setActiveJob]   = useState<VoiceJob | null>(null);
  const [audioUrl,    setAudioUrl]    = useState<string | null>(null);
  const [history,     setHistory]     = useState<VoiceJob[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // ── Access gate + communication level ────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);
  const [continent,          setContinent]          = useState<string | null>(null);
  const [loadingContinent,   setLoadingContinent]   = useState(true);

  // ── UI narration voice (browser TTS) ─────────────────────────────────────
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice,   setSelectedVoice]   = useState<SpeechSynthesisVoice | null>(null);
  const [voiceMode,       setVoiceMode]       = useState<'english' | 'pidgin'>('pidgin');
  const [voiceEnabled,    setVoiceEnabled]    = useState(true);
  const [isSpeaking,      setIsSpeaking]      = useState(false);

  // ── English improvement ───────────────────────────────────────────────────
  const [isImproving,    setIsImproving]    = useState(false);

  // ── Save state ────────────────────────────────────────────────────────────
  const [isSaving,       setIsSaving]       = useState(false);
  const [savedUrl,       setSavedUrl]       = useState<string | null>(null);
  const [saveError,      setSaveError]      = useState<string | null>(null);
  const [isSavingDash,   setIsSavingDash]   = useState(false);
  const [dashSaved,      setDashSaved]      = useState(false);

  // ── Weekly usage ──────────────────────────────────────────────────────────
  const [weeklyCount,    setWeeklyCount]    = useState<number>(0);

  // ── Critique state ────────────────────────────────────────────────────────
  const [showCritique,   setShowCritique]   = useState(false);
  const [critiqueText,   setCritiqueText]   = useState('');
  const [isCritiquing,   setIsCritiquing]   = useState(false);
  const [critiqueStep,   setCritiqueStep]   = useState<'idle' | 'full' | 'step'>('idle');
  const [stepMessages,   setStepMessages]   = useState<{ role: 'coach' | 'user'; text: string }[]>([]);
  const [stepInput,      setStepInput]      = useState('');
  const [isStepSending,  setIsStepSending]  = useState(false);
  const [isImprovingStep, setIsImprovingStep] = useState(false);

  // ── Fetch data on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    supabase.from('user_personality_baseline').select('communication_level')
      .eq('user_id', user.id).single()
      .then(({ data }) => { if (data?.communication_level != null) setCommunicationLevel(data.communication_level); });

    supabase.from('profiles').select('continent')
      .eq('id', user.id).single()
      .then(({ data }) => { setContinent(data?.continent ?? null); setLoadingContinent(false); });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('voice_generations').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).neq('status', 'failed').gte('created_at', since)
      .then(({ count }) => setWeeklyCount(count ?? 0));
  }, [user?.id]);

  const lvl = communicationLevel;

  // ── UI text tiers ─────────────────────────────────────────────────────────
  const uiText = {
    pageTitle:    lvl <= 1 ? 'Make a Voice with AI'     : 'AI Voice Creation',
    pageSubtitle: lvl <= 1 ? 'Type what you want to say. AI will speak it for you.'
                           : 'Generate natural speech from text using MiniMax AI',
    scriptLabel:  lvl <= 1 ? 'What do you want to say? *' : 'Your script *',
    scriptHint:   lvl <= 1 ? 'Write clearly. Short sentences sound best.'
                           : 'Write naturally — punctuation controls pacing. Short sentences work best.',
    scriptPlaceholder: lvl <= 1
      ? 'e.g. Hello! My name is Amara. I am learning AI at the Davidson Center.'
      : 'e.g. Welcome to our community. Today we explore how artificial intelligence can transform education in Nigeria…',
    voiceLabel:   lvl <= 1 ? 'Choose a voice'   : 'Voice',
    emotionLabel: lvl <= 1 ? 'How does it feel?' : 'Emotion',
    speedLabel:   lvl <= 1 ? 'Speed'             : 'Speaking speed',
    generateBtn:  lvl <= 1 ? 'Make My Voice 🎙️'  : 'Generate Voice',
    improveBtnLabel: '✏️ Improve my English',
    critiqueBtnLabel: lvl <= 1 ? '💡 Help me write a better script' : '💡 Critique my Script',
    footerText: lvl <= 1
      ? 'Your voice is made by MiniMax AI. It takes about 2-5 seconds. But your first voice creation could take a few minutes. Your voices are saved in your history.'
      : 'Powered by MiniMax Speech-02-Turbo via Replicate. ~2–5s generation time.',
  };

  // ── Browser TTS voice (page narration) ───────────────────────────────────
  useEffect(() => {
    const load = () => setAvailableVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
    if (!availableVoices.length) return;
    let voice: SpeechSynthesisVoice | undefined;
    if (voiceMode === 'pidgin') {
      voice = availableVoices.find(v => v.lang === 'en-NG')
           || availableVoices.find(v => v.name.toLowerCase().includes('nigeria'))
           || availableVoices.find(v => v.lang === 'en-ZA')
           || availableVoices.find(v => v.name === 'Google UK English Female')
           || availableVoices.find(v => v.lang.startsWith('en'))
           || availableVoices[0];
    } else {
      voice = availableVoices.find(v => v.name === 'Google UK English Female')
           || availableVoices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female'))
           || availableVoices.find(v => v.lang === 'en-GB')
           || availableVoices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
           || availableVoices.find(v => v.lang.startsWith('en'))
           || availableVoices[0];
    }
    setSelectedVoice(voice || null);
  }, [availableVoices, voiceMode]);

  const speakBrowser = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const stripped = text.replace(/\*\*/g, '').slice(0, 500);
    const u = new SpeechSynthesisUtterance(stripped);
    if (selectedVoice) { u.voice = selectedVoice; u.lang = selectedVoice.lang; }
    else u.lang = 'en-GB';
    u.rate = voiceMode === 'pidgin' ? 0.80 : 0.88;
    u.pitch = voiceMode === 'pidgin' ? 1.0 : 1.05;
    u.volume = 0.9;
    u.onstart = () => setIsSpeaking(true);
    u.onend   = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [selectedVoice, voiceMode]);

  const speakText = useCallback((text: string) => {
    if (!voiceEnabled) return;
    if (voiceMode === 'pidgin') {
      setIsSpeaking(true);
      void playPidginVoice(text.replace(/\*\*/g, '').slice(0, 500), {
        onEnd: () => setIsSpeaking(false),
        onError: (err) => {
          console.warn('[VoiceCreationPage] SpeechGen TTS failed, falling back to browser voice:', err);
          speakBrowser(text);
        },
      });
      return;
    }
    speakBrowser(text);
  }, [voiceEnabled, voiceMode, speakBrowser]);

  const stopSpeaking = () => { window.speechSynthesis.cancel(); stopPidginSpeech(); setIsSpeaking(false); };

  // ── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    setLoadingHist(true);
    const { data } = await supabase
      .from('voice_generations').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
    setHistory((data ?? []) as VoiceJob[]);
    setLoadingHist(false);
  }, [user?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const daysUntilReset = () => 7 - new Date().getDay();

  // ── Generate voice ────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!script.trim() || isGenerating || !user) return;

    if (weeklyCount >= WEEKLY_LIMIT) {
      setError(lvl <= 1
        ? `You have made ${WEEKLY_LIMIT} voices this week. Please come back next week!`
        : `Weekly limit reached (${WEEKLY_LIMIT} voices/week). Resets in ${daysUntilReset()} day(s).`);
      return;
    }

    setIsGenerating(true); setError(null); setAudioUrl(null); setActiveJob(null);
    setSavedUrl(null); setSaveError(null); setDashSaved(false);

    const tempJob: VoiceJob = {
      id: 'temp', script: script.trim(), voice_id: selectedVoiceId, emotion,
      status: 'generating', audio_url: null, saved_audio_url: null,
      error_message: null, created_at: new Date().toISOString(),
    };
    setActiveJob(tempJob);

    speakText(lvl <= 1
      ? 'Making your voice. Please wait a few seconds.'
      : 'Generating your voice. This usually takes 3 to 5 seconds.');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      // Submit — returns immediately with jobId
      const { ok, data } = await callEdgeFunction('generate-voice', 'POST', session.access_token, {
        script: script.trim(), voice_id: selectedVoiceId, emotion, speed,
      });

      if (!ok || data.error) throw new Error(data.error ?? 'Failed to submit voice job');

      const { jobId } = data;
      setActiveJob({ ...tempJob, id: jobId, status: 'generating' });

      // Poll voice-status every 3s until done
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `${FUNCTIONS_URL}/voice-status?jobId=${jobId}`,
            { headers: { 'Authorization': `Bearer ${session.access_token}` } }
          );
          const pollData = await pollRes.json();

          if (pollData.status === 'succeeded') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setAudioUrl(pollData.audioUrl);
            setActiveJob(prev => prev ? { ...prev, status: 'succeeded', audio_url: pollData.audioUrl } : null);
            setWeeklyCount(c => c + 1);
            setIsGenerating(false);
            speakText(lvl <= 1 ? '🎉 Your voice is ready! Press play to listen.' : 'Your voice has been generated.');
            loadHistory();
          } else if (pollData.status === 'failed') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setError(pollData.error ?? 'Voice generation failed');
            setActiveJob(prev => prev ? { ...prev, status: 'failed' } : null);
            setIsGenerating(false);
          }
        } catch { /* ignore transient poll errors */ }
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setActiveJob({ ...tempJob, status: 'failed' });
      setIsGenerating(false);
    }
  };

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleReset = () => {
    setActiveJob(null); setAudioUrl(null); setError(null);
    setSavedUrl(null); setSaveError(null); setDashSaved(false); stopSpeaking();
  };

  // ── Save audio to Storage ─────────────────────────────────────────────────
  // The voice-status edge function already uploads the audio to the ai-voices
  // bucket and returns a signed URL as audioUrl. We should NOT try to re-fetch
  // that signed URL from the browser (Supabase Storage returns 400 for signed
  // URL fetches without the correct auth context).
  //
  // Strategy:
  //   1. If audioUrl is already a Supabase signed/storage URL → it's already
  //      saved. Just record it in the DB and set savedUrl.
  //   2. If audioUrl is a raw Replicate URL → fetch it (Replicate URLs are
  //      public), upload to Storage, create signed URL, update DB.
  const handleSaveAudio = async () => {
    if (!audioUrl || !user?.id || !activeJob || isSaving) return;
    setIsSaving(true); setSaveError(null);
    try {
      const isAlreadyInStorage =
        audioUrl.includes('supabase.co/storage') ||
        audioUrl.includes('supabase.co/object') ||
        audioUrl.includes('/sign/');

      let permanentUrl: string | null = null;

      if (isAlreadyInStorage) {
        // Already uploaded by the edge function — use as-is
        permanentUrl = audioUrl;
      } else {
        // Raw Replicate URL — fetch and upload ourselves
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error('Could not fetch audio from source');
        const blob = await res.blob();
        const ext  = blob.type.includes('wav') ? 'wav' : 'mp3';
        const path = `${user.id}/${activeJob.id}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('ai-voices').upload(path, blob, { contentType: blob.type, upsert: true });
        if (uploadError) throw uploadError;

        const { data: signed } = await supabase.storage
          .from('ai-voices').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        permanentUrl = signed?.signedUrl ?? null;
      }

      if (activeJob.id !== 'temp') {
        await supabase.from('voice_generations')
          .update({ saved_audio_url: permanentUrl, saved_at: new Date().toISOString() })
          .eq('id', activeJob.id);
      }

      setSavedUrl(permanentUrl);
      speakText(lvl <= 1 ? 'Your voice is saved!' : 'Audio saved to your account successfully.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally { setIsSaving(false); }
  };

  // ── Save session to dashboard ─────────────────────────────────────────────
  const handleSaveToDashboard = async () => {
    if (!user?.id || isSavingDash) return;
    setIsSavingDash(true);
    try {
      const critiqueToSave = critiqueStep === 'full' ? critiqueText
        : stepMessages.length > 0
          ? stepMessages.map(m => `${m.role === 'coach' ? 'Coach' : 'You'}: ${m.text}`).join('\n\n')
          : null;

      await supabase.from('dashboard').insert({
        user_id:           user.id,
        activity:          'AI Voice Creation',
        category_activity: 'Voice Generation',
        sub_category:      'Text to Speech',
        title:             `Voice: ${script.trim().slice(0, 80)}`,
        progress:          audioUrl || savedUrl ? 'completed' : 'started',
        voice_script:      script.trim(),
        voice_audio_url:   savedUrl ?? audioUrl,
        voice_critique:    critiqueToSave,
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      });
      setDashSaved(true);
      speakText(lvl <= 1 ? 'Your session is saved!' : 'Session saved to your dashboard.');
    } catch (err) {
      console.error('Dashboard save error:', err);
    } finally { setIsSavingDash(false); }
  };

  // ── Improve English (script) ──────────────────────────────────────────────
  const handleImproveEnglish = async () => {
    if (!script.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const improved = await chatText({
        messages: [{ role: 'user', content:
          `You are an English language coach helping a student in Nigeria improve their spoken script for AI voice generation.\n\nThe student wrote: "${script.trim()}"\n\nRewrite it as clear, natural, well-spoken English:\n1. Fix grammar and spelling errors.\n2. Make sentences flow naturally when read aloud — short, clear sentences work best.\n3. Keep the student's voice, message, and meaning completely intact.\n4. Do not add new ideas or change the subject.\n5. Keep the result under 200 words.\n\nReturn ONLY the improved script. No explanation.` }],
        system: 'Return only the improved script, nothing else.',
        max_tokens: 300, temperature: 0.4,
      });
      if (improved.trim()) {
        setScript(improved.trim());
        speakText(lvl <= 1 ? 'I improved your English. Please read it and check.' : 'Your script has been improved. Review the changes.');
      }
    } catch (err) { console.error('Improve error:', err); }
    finally { setIsImproving(false); }
  };

  // ── Improve English (step input) ──────────────────────────────────────────
  const handleImproveStep = async () => {
    if (!stepInput.trim() || isImprovingStep) return;
    setIsImprovingStep(true);
    try {
      const improved = await chatText({
        messages: [{ role: 'user', content:
          `You are an English coach. The student wrote: "${stepInput.trim()}"\nRewrite as clear, natural English preserving their exact meaning. Keep it brief and conversational.\nReturn ONLY the improved text.` }],
        system: 'Return only the improved text.',
        max_tokens: 150, temperature: 0.3,
      });
      if (improved.trim()) setStepInput(improved.trim());
    } catch (err) { console.error('Step improve error:', err); }
    finally { setIsImprovingStep(false); }
  };

  // ── Full script critique ──────────────────────────────────────────────────
  const handleFullCritique = async () => {
    if (!script.trim() || isCritiquing) return;
    setIsCritiquing(true); setCritiqueStep('full'); setShowCritique(true);
    const commGuidance = lvl <= 1 ? 'Short simple sentences. Max 60 words.'
      : lvl === 2 ? 'Clear and direct. Max 3 short paragraphs.'
      : 'Well-structured English with appropriate detail.';
    try {
      const critique = await chatText({
        messages: [{ role: 'user', content:
          `You are an expert at writing scripts for AI text-to-speech. A student has written this script:\n\n"${script.trim()}"\n\nEvaluate this script for spoken audio quality across:\n1. CLARITY — Are the sentences short and easy to follow when heard?\n2. FLOW — Does it sound natural when spoken aloud?\n3. GRAMMAR — Are there any errors?\n4. ENGAGEMENT — Is it interesting and clear to listen to?\n5. PACING — Are there natural pauses? Is it too fast or too slow to read?\n6. PURPOSE — Does it say what it is trying to say?\n\nFor each: say what is good, what could improve, and give a one-line example fix.\nEnd with a score out of 10 and one improved version of the full script.\n\n${commGuidance}` }],
        system: 'You are a helpful voice script coach. Give honest, encouraging, specific feedback.',
        max_tokens: 500, temperature: 0.5,
      });
      setCritiqueText(critique);
      speakText(lvl <= 1 ? 'Here is my feedback on your script.' : 'Here is your script critique.');
    } catch { setCritiqueText('Sorry, I could not critique your script right now. Please try again.'); }
    finally { setIsCritiquing(false); }
  };

  // ── Step-by-step script builder ───────────────────────────────────────────
  const handleStartStepByStep = () => {
    setCritiqueStep('step'); setShowCritique(true); setStepMessages([]);
    const opening = lvl <= 1
      ? "Let's build your voice script together. First — who is this voice for? Is it a character, a person, a narrator, or someone else? Describe who will be speaking."
      : "Let's build your voice script step by step. First — who is the voice? Describe the speaker: their name, role, or character. For example: a teacher, a news presenter, a story narrator, a fictional character, or a community leader.";
    setStepMessages([{ role: 'coach', text: opening }]);
    speakText(opening);
  };

  const handleStepSend = async () => {
    if (!stepInput.trim() || isStepSending) return;
    const userMsg = stepInput.trim(); setStepInput('');
    const updated = [...stepMessages, { role: 'user' as const, text: userMsg }];
    setStepMessages(updated); setIsStepSending(true);
    const commGuidance = lvl <= 1 ? 'Short sentences. One question only. Max 40 words.'
      : lvl === 2 ? 'Clear, direct. One guiding question. Max 80 words.' : 'Concise. One guiding question.';
    const history = updated.map(m => `${m.role === 'coach' ? 'Coach' : 'Student'}: ${m.text}`).join('\n');
    try {
      const reply = await chatText({
        messages: [{ role: 'user', content:
          `You are a friendly voice script coach helping a student in Nigeria design and write a spoken script for AI voice generation, one step at a time.\n\nThe student is creating a voice — this could be a character, a narrator, a public figure, a fictional person, or any speaker they choose. It is NOT necessarily the student speaking about themselves.\n\nConversation:\n${history}\n\nGuide through these elements in order:\n1. The Speaker — who is the voice? (character, role, name, personality)\n2. The Audience — who is listening? (children, community, customers, etc.)\n3. The Purpose — what should the listener feel or do after hearing this?\n4. The Opening line — how does the speaker introduce themselves or begin?\n5. The Core message — the 1–2 key things the speaker says\n6. The Closing line — how does the speaker end memorably?\n\nAcknowledge what the student said warmly. Guide them to the NEXT uncovered element. ONE question only.\n\nWhen all elements are covered, synthesise everything into a final polished script written in the voice of the speaker, and congratulate the student.\n\n${commGuidance}` }],
        system: 'You are a patient, encouraging voice script coach. Help students create compelling voices and scripts.',
        max_tokens: 200, temperature: 0.5,
      });
      setStepMessages(prev => [...prev, { role: 'coach', text: reply }]);
      speakText(reply);
    } catch {
      const fallback = 'Sorry, I had a small problem. Can you try again?';
      setStepMessages(prev => [...prev, { role: 'coach', text: fallback }]);
    } finally { setIsStepSending(false); }
  };

  const charCount = script.length;

  // ── Access gate ───────────────────────────────────────────────────────────
  if (loadingContinent) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const allowedContinents = ['Africa', 'North America'];
  if (continent !== null && !allowedContinents.includes(continent)) {
    return (
      <AppLayout>
        <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 bg-slate-950 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-6">
            <div className="text-6xl">🌍</div>
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white mb-3">
                Region Not Yet Available
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                AI Voice Creation is currently available to learners in Africa and North America. Check back soon as we expand to more regions.
              </p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Background */}
      <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat', backgroundSize: '200px 200px',
        }} />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-teal-600/10 blur-3xl animate-pulse" style={{ animationDelay: '1.8s' }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="bg-slate-900/80 border border-slate-700/60 backdrop-blur-sm rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                  <Mic className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">{uiText.pageTitle}</h1>
                  <p className="text-slate-400 text-sm">{uiText.pageSubtitle}</p>
                </div>
              </div>

              {/* UI narration voice controls */}
              <div className="flex items-center gap-2">
                <button onClick={() => { if (isSpeaking) stopSpeaking(); else setVoiceEnabled(e => !e); }}
                  className={classNames('p-2 rounded-lg border transition-all',
                    voiceEnabled ? 'bg-slate-700 border-slate-600 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-500')}>
                  {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                {voiceEnabled && (
                  <div className="flex rounded-lg overflow-hidden border border-slate-600">
                    <button onClick={() => setVoiceMode('english')}
                      className={classNames('px-3 py-1.5 text-xs font-bold transition-all',
                        voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white hover:bg-slate-700')}>
                      🇬🇧 {lvl <= 1 ? 'English' : 'British English'}
                    </button>
                    <button onClick={() => setVoiceMode('pidgin')}
                      className={classNames('px-3 py-1.5 text-xs font-bold transition-all',
                        voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-slate-800 text-white hover:bg-slate-700')}>
                      🇳🇬 {lvl <= 1 ? 'Pidgin' : 'Nigerian Pidgin'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-900/60 border border-slate-700/40 rounded-lg p-1 w-fit">
            {(['generate', 'history'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => { setView(v); if (v === 'history') loadHistory(); }}
                className={classNames('px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize',
                  view === v ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow'
                             : 'text-slate-400 hover:text-slate-200')}>
                {v === 'history' ? `${lvl <= 1 ? 'My Voices' : 'History'} (${history.length})` : (lvl <= 1 ? 'Make Voice' : v)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Generate view ───────────────────────────────────────────────── */}
        {view === 'generate' && (
          <div className="space-y-4">

            {/* Weekly usage */}
            {weeklyCount > 0 && (
              <div className={classNames('flex items-center gap-3 rounded-xl px-4 py-3 text-sm border',
                weeklyCount >= WEEKLY_LIMIT ? 'bg-red-900/20 border-red-500/30 text-red-300'
                : weeklyCount >= WEEKLY_LIMIT - 5 ? 'bg-amber-900/20 border-amber-500/30 text-amber-300'
                : 'bg-slate-800/60 border-slate-700/40 text-slate-400')}>
                {weeklyCount >= WEEKLY_LIMIT ? <AlertTriangle size={16} className="shrink-0" /> : <Mic size={16} className="shrink-0" />}
                <span>
                  {weeklyCount >= WEEKLY_LIMIT
                    ? (lvl <= 1 ? `You made ${WEEKLY_LIMIT} voices this week. Come back next week!` : `Weekly limit reached (${WEEKLY_LIMIT}/week). Resets in ${daysUntilReset()} day(s).`)
                    : (lvl <= 1 ? `You made ${weeklyCount} of ${WEEKLY_LIMIT} voices this week.` : `${weeklyCount} / ${WEEKLY_LIMIT} voices used this week.`)}
                </span>
              </div>
            )}

            {/* Script card */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm">
              <label className="block text-sm font-semibold text-slate-300 mb-2">{uiText.scriptLabel}</label>
              <textarea
                value={script} onChange={e => setScript(e.target.value)}
                rows={5} maxLength={2000} disabled={isGenerating}
                placeholder={uiText.scriptPlaceholder}
                className="w-full bg-slate-800/80 border border-slate-600/50 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 text-sm resize-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-1 mb-3">
                <p className="text-xs text-slate-500">{uiText.scriptHint}</p>
                <span className={classNames('text-xs', charCount > 1800 ? 'text-amber-400' : 'text-slate-500')}>{charCount}/2000</span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={handleImproveEnglish} disabled={!script.trim() || isImproving || isGenerating}
                  className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                  {isImproving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Improving…</>
                    : <><Wand2 size={14} /> {uiText.improveBtnLabel}</>}
                </button>
                <button onClick={handleFullCritique} disabled={!script.trim() || isCritiquing || isGenerating}
                  className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                  {isCritiquing && critiqueStep === 'full' ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Checking…' : 'Analysing…'}</>
                    : <><Lightbulb size={14} /> {uiText.critiqueBtnLabel}</>}
                </button>
                <button onClick={handleStartStepByStep} disabled={isGenerating}
                  className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                  <MessageSquare size={14} /> {lvl <= 1 ? 'Build step by step' : 'Build script step-by-step'}
                </button>
              </div>

              {/* Suggestions */}
              <div>
                <p className="text-xs text-slate-500 mb-2">{lvl <= 1 ? 'Try one of these:' : 'Try a suggestion:'}</p>
                <div className="flex flex-wrap gap-2">
                  {SCRIPT_SUGGESTIONS.slice(0, 3).map((s, i) => (
                    <button key={i} onClick={() => setScript(s)} disabled={isGenerating}
                      className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600/50 text-slate-300 rounded-full px-3 py-1.5 transition-colors truncate max-w-xs disabled:opacity-40">
                      {s.slice(0, 55)}…
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Critique / Step panel */}
            {showCritique && (
              <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                    <Lightbulb size={16} />
                    {critiqueStep === 'step' ? (lvl <= 1 ? '💬 Script Builder' : '💬 Step-by-Step Builder')
                      : (lvl <= 1 ? '💡 Script Feedback' : '💡 Script Critique')}
                  </h3>
                  <button onClick={() => { setShowCritique(false); setCritiqueText(''); setStepMessages([]); setCritiqueStep('idle'); stopSpeaking(); }}
                    className="text-slate-400 hover:text-slate-200 text-xs">✕ Close</button>
                </div>
                {critiqueStep === 'full' && (
                  isCritiquing
                    ? <div className="flex items-center gap-3 text-slate-400 text-sm"><div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> {lvl <= 1 ? 'Checking your script…' : 'Analysing your script…'}</div>
                    : <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{critiqueText}</div>
                )}
                {critiqueStep === 'step' && (
                  <div className="space-y-3">
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {stepMessages.map((m, i) => (
                        <div key={i} className={classNames('rounded-lg px-3 py-2 text-sm',
                          m.role === 'coach' ? 'bg-teal-900/40 border border-teal-500/30 text-teal-100' : 'bg-slate-700/60 text-slate-200 ml-6')}>
                          {m.role === 'coach' && <span className="text-xs text-teal-400 font-semibold block mb-0.5">Coach</span>}
                          {m.text}
                        </div>
                      ))}
                      {isStepSending && <div className="bg-teal-900/40 border border-teal-500/30 rounded-lg px-3 py-2"><div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={stepInput} onChange={e => setStepInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStepSend(); } }}
                        placeholder={lvl <= 1 ? 'Type your answer…' : 'Type your response…'}
                        className="flex-1 bg-slate-800 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-teal-500/50" />
                      <button onClick={handleImproveStep} disabled={!stepInput.trim() || isImprovingStep || isStepSending}
                        className="flex items-center gap-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                        {isImprovingStep ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <><Wand2 size={12} /> {lvl <= 1 ? 'Fix' : 'Improve'}</>}
                      </button>
                      <button onClick={handleStepSend} disabled={!stepInput.trim() || isStepSending}
                        className="bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Voice + Emotion + Speed */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm space-y-5">

              {/* Voice preset selector */}
              <div>
                <p className="text-sm font-semibold text-slate-300 mb-3">{uiText.voiceLabel}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {VOICE_PRESETS.map(v => (
                    <button key={v.id} onClick={() => setSelectedVoiceId(v.id)} disabled={isGenerating}
                      className={classNames('flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all disabled:opacity-40',
                        selectedVoiceId === v.id
                          ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-200'
                          : 'bg-slate-800/60 border-slate-600/40 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200')}>
                      <span className="text-xl">{v.emoji}</span>
                      <span className="font-bold">{v.label}</span>
                      <span className={classNames('text-[10px]', selectedVoiceId === v.id ? 'text-emerald-400' : 'text-slate-600')}>{v.style}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Emotion selector */}
              <div>
                <p className="text-sm font-semibold text-slate-300 mb-2">{uiText.emotionLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {EMOTIONS.map(e => (
                    <button key={e.id} onClick={() => setEmotion(e.id)} disabled={isGenerating}
                      className={classNames('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all disabled:opacity-40',
                        emotion === e.id
                          ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-200'
                          : 'bg-slate-800 border-slate-600/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200')}>
                      {e.emoji} {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-300">{uiText.speedLabel}</p>
                  <span className="text-xs text-emerald-400 font-mono">{speed.toFixed(1)}×</span>
                </div>
                <input type="range" min="0.5" max="2.0" step="0.1" value={speed}
                  onChange={e => setSpeed(parseFloat(e.target.value))} disabled={isGenerating}
                  className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500 disabled:opacity-40" />
                <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                  <span>0.5× Slow</span><span>1.0× Normal</span><span>2.0× Fast</span>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3">
                <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-300 font-medium">{lvl <= 1 ? 'Something went wrong' : 'Generation failed'}</p>
                  <p className="text-xs text-red-400 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Active job result */}
            {activeJob && (
              <div className={classNames('rounded-2xl border backdrop-blur-sm p-5 space-y-4',
                activeJob.status === 'succeeded' ? 'bg-green-950/30 border-green-500/30'
                : activeJob.status === 'failed'  ? 'bg-red-950/30 border-red-500/30'
                : 'bg-emerald-950/30 border-emerald-500/30')}>
                <div className="flex items-center gap-4">
                  {isGenerating
                    ? <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                    : activeJob.status === 'succeeded' ? <CheckCircle size={40} className="text-green-400" />
                    : <XCircle size={40} className="text-red-400" />}
                  <div className="flex-1 min-w-0">
                    <p className={classNames('text-base font-semibold',
                      activeJob.status === 'succeeded' ? 'text-green-300'
                      : activeJob.status === 'failed' ? 'text-red-300' : 'text-emerald-300')}>
                      {lvl <= 1
                        ? (isGenerating ? 'Making your voice… please wait' : activeJob.status === 'succeeded' ? '🎉 Your voice is ready!' : 'Something went wrong')
                        : (isGenerating ? 'Generating…' : activeJob.status === 'succeeded' ? 'Complete' : 'Failed')}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{activeJob.script.slice(0, 80)}</p>
                    {isGenerating && (
                      <p className="text-xs text-slate-500 mt-1">
                        {lvl <= 1 ? 'MiniMax AI makes voices in about 3–5 seconds.' : 'MiniMax Speech-02-Turbo typically completes in 3–5 seconds. But, the first voice creation could take 1-2 minutes.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Audio player */}
                {(audioUrl || savedUrl) && (
                  <div className="space-y-3">
                    <AudioPlayer src={savedUrl ?? audioUrl ?? ''} label={activeJob.script.slice(0, 80) + '…'} />

                    {/* Save to bucket */}
                    {!savedUrl ? (
                      <div className="flex flex-col gap-1.5">
                        <button onClick={handleSaveAudio} disabled={isSaving}
                          className="flex items-center justify-center gap-2 w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
                          {isSaving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Saving…' : 'Saving to your account…'}</>
                            : <><Save size={15} /> {lvl <= 1 ? '💾 Save My Voice' : 'Save Audio to Account'}</>}
                        </button>
                        {saveError && <p className="text-xs text-red-400 text-center">{saveError}</p>}
                        <p className="text-xs text-slate-500 text-center">
                          {lvl <= 1 ? 'Save it so you can listen later.' : 'Saves a permanent copy — Replicate URLs expire after a few days.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-green-900/20 border border-green-500/30 rounded-xl px-4 py-2.5">
                        <CheckCircle size={16} className="text-green-400 shrink-0" />
                        <p className="text-sm text-green-300">{lvl <= 1 ? 'Voice saved! ✅' : 'Audio saved to your account permanently.'}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom actions */}
                {(activeJob.status === 'succeeded' || activeJob.status === 'failed') && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    <button onClick={handleReset}
                      className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full px-4 py-2 text-sm font-medium transition-colors">
                      <Sparkles size={14} /> {lvl <= 1 ? 'Make another voice' : 'Generate another'}
                    </button>
                    {(audioUrl || savedUrl) && (
                      <button onClick={async () => {
                        const src = savedUrl ?? audioUrl ?? '';
                        try {
                          const resp = await fetch(src);
                          const blob = await resp.blob();
                          const ext = blob.type.includes('wav') ? 'wav' : 'mp3';
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `voice_${new Date().toISOString().slice(0,10)}.${ext}`;
                          document.body.appendChild(a); a.click(); document.body.removeChild(a);
                          setTimeout(() => URL.revokeObjectURL(url), 5000);
                        } catch { window.open(src, '_blank'); }
                      }} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                        <Download size={14} /> {lvl <= 1 ? 'Download' : 'Download audio'}
                      </button>
                    )}
                    {!dashSaved ? (
                      <button onClick={handleSaveToDashboard} disabled={isSavingDash}
                        className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                        {isSavingDash ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                        {lvl <= 1 ? 'Save to My Dashboard' : 'Save Session to Dashboard'}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-green-400 px-2">
                        <CheckCircle size={14} /> {lvl <= 1 ? 'Saved!' : 'Session saved'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Generate button */}
            {!activeJob && (
              <button onClick={handleGenerate} disabled={!script.trim() || isGenerating || weeklyCount >= WEEKLY_LIMIT}
                className={classNames('w-full flex items-center justify-center gap-3 rounded-xl py-3.5 font-semibold text-base transition-all',
                  script.trim() && !isGenerating && weeklyCount < WEEKLY_LIMIT
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg hover:scale-[1.01]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed')}>
                {isGenerating
                  ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Making your voice…' : 'Generating…'}</>
                  : <><Mic size={20} /> {uiText.generateBtn}</>}
              </button>
            )}
          </div>
        )}

        {/* ── History view ─────────────────────────────────────────────────── */}
        {view === 'history' && (
          <div className="space-y-3">
            {loadingHist ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-16">
                <Mic size={48} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">{lvl <= 1 ? 'No voices yet. Make your first one!' : 'No voices generated yet.'}</p>
                <button onClick={() => setView('generate')} className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm underline">
                  {lvl <= 1 ? 'Make a voice →' : 'Start generating →'}
                </button>
              </div>
            ) : (
              history.map(job => (
                <VoiceCard key={job.id} job={job} onReuse={(s) => { setScript(s); setView('generate'); handleReset(); }} />
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 bg-slate-900/50 border border-slate-700/30 rounded-xl px-4 py-3 text-xs text-slate-500">
          <p className="flex items-center gap-2"><Clock size={12} />{uiText.footerText}</p>
        </div>
      </div>
    </AppLayout>
  );
};


export default VoiceCreationPage;