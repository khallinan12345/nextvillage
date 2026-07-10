// src/pages/VideoGenerationPage.tsx
//
// AI Video Generation — LTX-Video via Replicate.
// Features:
//   • Voice output toggle (UK English 🇬🇧 / Nigerian Pidgin 🇳🇬)
//   • communication_level adaptive UI text (fetched from user_personality_baseline)
//   • "Improve my English" button — polishes the prompt while keeping the idea
//   • "Critique my Prompt" panel — step-by-step coaching on T2V prompt quality
//   • Full generation + polling + history
//   • WEEKLY LIMIT: per-user (profiles.videos_per_week); default 5, elevated to 50 for privileged users

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { chatText } from '../../lib/chatClient';
import {
  Film, Sparkles, Clock, CheckCircle, XCircle,
  Download, RotateCcw, ChevronDown, ChevronUp,
  Volume2, VolumeX, Wand2, MessageSquare, Lightbulb, Save,
  AlertTriangle, ImagePlus, X as XIcon, ArrowRight, Mail,
} from 'lucide-react';
import classNames from 'classnames';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoJob {
  id: string;
  prompt: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  video_url: string | null;
  error_message: string | null;
  created_at: string;
}

type ViewMode = 'generate' | 'history';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const STATUS_LABEL: Record<string, string> = {
  pending:    'Queued',
  processing: 'Generating…',
  succeeded:  'Complete',
  failed:     'Failed',
};

const STATUS_CONFIG: Record<string, { color: string; border: string; icon: string }> = {
  pending:    { color: 'text-yellow-300', border: 'border-yellow-500/30', icon: '⏳' },
  processing: { color: 'text-cyan-300',   border: 'border-cyan-500/30',   icon: '⚡' },
  succeeded:  { color: 'text-green-300',  border: 'border-green-500/30',  icon: '✅' },
  failed:     { color: 'text-red-400',    border: 'border-red-500/30',    icon: '❌' },
};

const PROMPT_SUGGESTIONS = [
  'A young girl in a school uniform walking through a sunlit Nigerian market, colourful fabrics, warm golden hour light',
  'A solar panel array on the rooftop of a village school, time-lapse clouds, children arriving in the morning',
  'Hands typing on a laptop in a dim room, screen glowing blue, code scrolling, close-up cinematic shot',
  'A farmer in green fields inspecting crops at sunrise, misty morning, peaceful and hopeful',
];

// ─── Edge Function helper ─────────────────────────────────────────────────────

async function callEdgeFunction(
  path: string,
  method: 'GET' | 'POST',
  token: string,
  body?: object,
  params?: Record<string, string>,
): Promise<{ ok: boolean; data: any }> {
  let url = `${FUNCTIONS_URL}/${path}`;
  if (params) url += `?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// ─── Progress ring ────────────────────────────────────────────────────────────

const ProgressRing: React.FC<{ size?: number }> = ({ size = 52 }) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ animation: 'spin 2s linear infinite' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#0f172a" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#vg-ring)" strokeWidth={4}
        strokeLinecap="round" strokeDasharray={`${circ * 0.7} ${circ * 0.3}`} />
      <defs>
        <linearGradient id="vg-ring" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" /><stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
  );
};

// ─── History card ─────────────────────────────────────────────────────────────

const VideoCard: React.FC<{ job: VideoJob; onReuse: (p: string) => void }> = ({ job, onReuse }) => {
  const [expanded, setExpanded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const cfg = STATUS_CONFIG[job.status];
  const playUrl = (job as any).saved_video_url || job.video_url;
  return (
    <div className={classNames('rounded-xl border backdrop-blur-sm overflow-hidden', cfg.border, 'bg-slate-900/60')}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors">
        <span className={classNames('text-sm font-semibold shrink-0', cfg.color)}>{cfg.icon} {STATUS_LABEL[job.status]}</span>
        <p className="text-sm text-slate-300 truncate flex-1 min-w-0">{job.prompt}</p>
        <span className="text-xs text-slate-500 shrink-0">{new Date(job.created_at).toLocaleDateString()}</span>
        {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          {job.status === 'succeeded' && playUrl && !videoError && (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
                <video
                  src={playUrl}
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover cursor-pointer"
                  muted playsInline preload="metadata"
                  onError={() => setVideoError(true)}
                  onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                  onClick={e => {
                    const v = e.currentTarget as HTMLVideoElement;
                    if (v.paused) { v.muted = false; v.play().catch(() => {}); } else v.pause();
                  }}
                />
                <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                  hover to preview · click to play with sound
                </div>
              </div>
            </div>
          )}
          {job.status === 'succeeded' && playUrl && videoError && (
            <div className="rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-xs text-slate-400 text-center">
              Video URL has expired — re-save to restore permanent access.
            </div>
          )}
          {job.status === 'failed' && (
            <p className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{job.error_message ?? 'Generation failed.'}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onReuse(job.prompt)}
              className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full px-3 py-1.5 transition-colors">
              <RotateCcw size={12} /> Reuse prompt
            </button>
            {playUrl && !videoError && (
              <button onClick={async () => {
                const safeName = (job.prompt ?? 'video').slice(0, 40).replace(/[^a-zA-Z0-9_\-]/g, '_');
                try {
                  const resp = await fetch(playUrl);
                  const blob = await resp.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl; a.download = `${safeName}.mp4`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                } catch {
                  const a = document.createElement('a');
                  a.href = playUrl; a.download = `${safeName}.mp4`; a.click();
                }
              }}
                className="flex items-center gap-1.5 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded-full px-3 py-1.5 transition-colors">
                <Download size={12} /> Download.mp4
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const VideoGenerationPage: React.FC = () => {
  const { user } = useAuth();

  // ── View / generation state ───────────────────────────────────────────────
  const [view,        setView]        = useState<ViewMode>('generate');
  const [prompt,      setPrompt]      = useState('');
  const [negPrompt,   setNegPrompt]   = useState('low quality, blurry, distorted, watermark');
  const duration = 5 as const; // locked to 5 s — cost control
  const [isStarting,  setIsStarting]  = useState(false);
  const [activeJob,   setActiveJob]   = useState<VideoJob | null>(null);
  const [videoUrl,    setVideoUrl]    = useState<string | null>(null);
  const [history,     setHistory]     = useState<VideoJob[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Communication level ───────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);
  const [continent,          setContinent]          = useState<string | null>(null);
  const [loadingContinent,   setLoadingContinent]   = useState(true);

  // ── Voice state ───────────────────────────────────────────────────────────
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice,   setSelectedVoice]   = useState<SpeechSynthesisVoice | null>(null);
  const [voiceMode,       setVoiceMode]       = useState<'english' | 'pidgin'>('pidgin');
  const [voiceEnabled,    setVoiceEnabled]    = useState(true);
  const [isSpeaking,      setIsSpeaking]      = useState(false);

  // ── Improve English state ─────────────────────────────────────────────────
  const [isImproving, setIsImproving] = useState(false);

  // ── Save to bucket state ──────────────────────────────────────────────────
  const [isSaving,       setIsSaving]       = useState(false);
  const [savedUrl,       setSavedUrl]       = useState<string | null>(null);
  const [videoName,      setVideoName]      = useState<string>('');
  const generatedVideoRef = useRef<HTMLVideoElement>(null);
  const [savedThumbnails, setSavedThumbnails] = useState<{id:string; thumbnailUrl:string; savedVideoUrl:string; prompt:string; savedAt:string}[]>([]);
  const [saveError,      setSaveError]      = useState<string | null>(null);

  // ── Dashboard save state ──────────────────────────────────────────────────
  const [isSavingDash,   setIsSavingDash]   = useState(false);
  const [dashSaved,      setDashSaved]      = useState(false);

  // ── Weekly usage limit (per-user; loaded from profiles.videos_per_week) ───
  const [weeklyCount,    setWeeklyCount]    = useState<number>(0);
  const [weeklyLimit,    setWeeklyLimit]    = useState<number>(5); // default until loaded

  // ── Critique state ────────────────────────────────────────────────────────
  const [showCritique,   setShowCritique]   = useState(false);
  const [critiqueText,   setCritiqueText]   = useState('');
  const [isCritiquing,   setIsCritiquing]   = useState(false);
  const [critiqueStep,   setCritiqueStep]   = useState<'idle' | 'full' | 'step'>('idle');
  const [stepMessages,   setStepMessages]   = useState<{ role: 'coach' | 'user'; text: string }[]>([]);
  const [stepInput,      setStepInput]      = useState('');
  const [isStepSending,  setIsStepSending]  = useState(false);
  const [isImprovingStep, setIsImprovingStep] = useState(false);

  // ── Prompt quality gate ───────────────────────────────────────────────────
  const PROMPT_SCORE_THRESHOLD = 6;
  const [promptScore,      setPromptScore]      = useState<number | null>(null);
  const [promptEvaluated,  setPromptEvaluated]  = useState(false);
  const [improvedPromptSuggestion, setImprovedPromptSuggestion] = useState<string | null>(null);

  // ── Simple transition mode (start → end frame, no prompt evaluation needed) ─
  const [isSimpleTransition, setIsSimpleTransition] = useState(false);

  // ── Confirmation dialog ───────────────────────────────────────────────────
  const [showConfirm,    setShowConfirm]    = useState(false);

  // ── Image anchoring state ─────────────────────────────────────────────────
  const [startImage,        setStartImage]        = useState<File | null>(null);
  const [startImagePreview, setStartImagePreview] = useState<string | null>(null);
  const [endImage,          setEndImage]          = useState<File | null>(null);
  const [endImagePreview,   setEndImagePreview]   = useState<string | null>(null);

  // ── Recent frame images ─────────────────────────────────────────────────────
  interface FrameImageOption {
    id: string;
    url: string;
    label: string;
    source: 'generated' | 'last_frame';
  }
  const [recentFrameImages, setRecentFrameImages] = useState<FrameImageOption[]>([]);

  const FRAMES: Record<number, number> = { 5: 121, 8: 193, 10: 241 };

  // ── Fetch communication_level, continent, weekly limit + usage on mount ───
  useEffect(() => {
    if (!user?.id) return;

    supabase.from('user_personality_baseline').select('communication_level').eq('user_id', user.id).single().then(({ data }) => {
        if (data?.communication_level != null) setCommunicationLevel(data.communication_level);
      });

    supabase.from('profiles').select('continent, videos_per_week').eq('id', user.id).single().then(({ data }) => {
        setContinent(data?.continent ?? null);
        setLoadingContinent(false);
        if (data?.videos_per_week != null) setWeeklyLimit(data.videos_per_week);
      });

    // Weekly usage count (Mon 00:00 local time → now, non-failed jobs)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sun … 6 = Sat
    const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMon);
    weekStart.setHours(0, 0, 0, 0);
    supabase.from('video_generations').select('id', { count: 'exact', head: true }).eq('user_id', user.id).neq('status', 'failed').gte('created_at', weekStart.toISOString()).then(({ count }) => setWeeklyCount(count ?? 0));
  }, [user?.id]);

  // ── Fetch recent generated images for frame picker ───────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('image_generations').select('id, image_url, saved_image_url, prompt').eq('user_id', user.id).not('image_url', 'is', null).order('created_at', { ascending: false }).limit(12).then(({ data }) => {
        if (!data) return;
        const opts = data.map((row: any) => {
            const url = row.saved_image_url ?? row.image_url;
            if (!url) return null;
            return {
              id: row.id,
              url,
              label: (row.prompt ?? 'Generated image').slice(0, 40),
              source: 'generated' as const,
            };
          }).filter(Boolean) as any[];
        setRecentFrameImages(opts);
      });
  }, [user?.id]);

  // ── Communication-level UI text ───────────────────────────────────────────
  const lvl = communicationLevel;

  const uiText = {
    pageTitle:      lvl <= 1 ? 'Make a Video with AI'    : 'AI Video Generation',
    pageSubtitle:   lvl <= 1 ? 'Type what you want to see. AI will make the video.'
                             : 'Create short videos from text descriptions using LTX-Video',
    promptLabel:    lvl <= 1 ? 'What do you want the video to show? *'
                             : 'Describe your video *',
    promptHint:     lvl <= 1 ? 'Describe the people, place, and light. More detail = better video.'
                             : 'Be specific: describe camera motion, lighting, and mood for best results',
    promptPlaceholder: lvl <= 1
      ? 'e.g. A girl walking to school in the morning, bright sunshine, green trees'
      : 'e.g. A young student in Nigeria working on a laptop in a sunlit classroom, cinematic warm light, slow pan…',
    durationLabel:  lvl <= 1 ? 'How long?'        : 'Duration',
    durationHint:   lvl <= 1 ? 'This can take 2–5 minutes. Please be patient!'
                             : 'Wan 2.1 720p typically takes 2–5 minutes to generate.',
    improveBtnLabel: lvl <= 1 ? '✏️ Improve my English' : '✏️ Improve my English',
    critiqueBtnLabel: lvl <= 1 ? '💡 Help me write a better prompt' : '💡 Critique my Prompt',
    generateBtn:    lvl <= 1 ? 'Make My Video 🎬'  : 'Generate Video',
    footerText:     lvl <= 1
      ? 'Your video is made by Wan 2.1. It can take 2–5 minutes. Please wait — do not close the page!'
      : 'Powered by Wan 2.1 I2V 720p (WaveSpeed/Alibaba) via Replicate. Generation typically takes 2–5 minutes.',
  };

  // ── Load voices ───────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => setAvailableVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── Resolve selected voice ────────────────────────────────────────────────
  useEffect(() => {
    if (availableVoices.length === 0) return;
    let voice: SpeechSynthesisVoice | undefined;
    if (voiceMode === 'pidgin') {
      voice =
        availableVoices.find(v => v.lang === 'en-NG') ||
        availableVoices.find(v => v.name.toLowerCase().includes('nigeria')) ||
        availableVoices.find(v => v.lang === 'en-ZA') ||
        availableVoices.find(v => v.name === 'Google UK English Female') ||
        availableVoices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
        availableVoices.find(v => v.lang.startsWith('en')) ||
        availableVoices[0];
    } else {
      voice =
        availableVoices.find(v => v.name === 'Google UK English Female') ||
        availableVoices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female')) ||
        availableVoices.find(v => v.lang === 'en-GB') ||
        availableVoices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
        availableVoices.find(v => v.lang.startsWith('en')) ||
        availableVoices[0];
    }
    setSelectedVoice(voice || null);
  }, [availableVoices, voiceMode]);

  // ── Speak text ────────────────────────────────────────────────────────────
  const speakText = useCallback((text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const stripped = text.replace(/\*\*/g, '').replace(/#{1,3} /g, '').slice(0, 600);
    const utterance = new SpeechSynthesisUtterance(stripped);
    if (selectedVoice) { utterance.voice = selectedVoice; utterance.lang = selectedVoice.lang; }
    else { utterance.lang = 'en-GB'; }
    utterance.rate  = voiceMode === 'pidgin' ? 0.80 : 0.88;
    utterance.pitch = voiceMode === 'pidgin' ? 1.0  : 1.05;
    utterance.volume = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled, selectedVoice, voiceMode]);

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // ── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    setLoadingHist(true);
    const { data } = await supabase.from('video_generations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    setHistory((data ?? []) as VideoJob[]);
    const saved = (data ?? []).filter((d: any) => d.thumbnail_url && d.saved_video_url);
    setSavedThumbnails(saved.map((d: any) => ({
      id: d.id,
      thumbnailUrl: d.thumbnail_url,
      savedVideoUrl: d.saved_video_url,
      prompt: d.prompt ?? '',
      savedAt: d.saved_at ?? d.created_at,
    })));
    setLoadingHist(false);
  }, [user?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Poll for status ───────────────────────────────────────────────────────
  const startPolling = useCallback((jobId: string, token: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { ok, data } = await callEdgeFunction('video-status', 'GET', token, undefined, { jobId });
      if (!ok) return;
      if (data.status === 'succeeded') {
        clearInterval(pollRef.current!);
        setVideoUrl(data.videoUrl);
        setActiveJob(prev => prev ? {...prev, status: 'succeeded', video_url: data.videoUrl } : null);
        loadHistory();
        speakText(lvl <= 1
          ? 'Your video is ready! You can watch it now.'
          : 'Your video has been generated successfully!');
      } else if (data.status === 'failed') {
        clearInterval(pollRef.current!);
        setError(data.error ?? 'Generation failed. Please try again.');
        setActiveJob(prev => prev ? {...prev, status: 'failed' } : null);
        loadHistory();
      } else {
        setActiveJob(prev => prev ? {...prev, status: data.status } : null);
      }
    }, 3000);
  }, [loadHistory, speakText, lvl]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Image helpers ─────────────────────────────────────────────────────────
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });

  const handleStartImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStartImage(file);
    setStartImagePreview(URL.createObjectURL(file));
  };

  const handleEndImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEndImage(file);
    setEndImagePreview(URL.createObjectURL(file));
  };

  const clearStartImage = () => {
    setStartImage(null);
    if (startImagePreview) URL.revokeObjectURL(startImagePreview);
    setStartImagePreview(null);
    setEndImage(null);
    if (endImagePreview) URL.revokeObjectURL(endImagePreview);
    setEndImagePreview(null);
    setIsSimpleTransition(false);
  };

  const applyUrlAsStartImage = useCallback(async (url: string, label: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], `${label.replace(/[^a-z0-9]/gi, '_')}.png`, { type: blob.type || 'image/png' });
      setStartImage(file);
      setStartImagePreview(URL.createObjectURL(blob));
    } catch (err) {
      console.error('[FramePicker] could not load image as File:', err);
    }
  }, []);

  const applyUrlAsEndImage = useCallback(async (url: string, label: string) => {
    if (!startImage) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], `${label.replace(/[^a-z0-9]/gi, '_')}.png`, { type: blob.type || 'image/png' });
      setEndImage(file);
      setEndImagePreview(URL.createObjectURL(blob));
    } catch (err) {
      console.error('[FramePicker] could not load image as File:', err);
    }
  }, [startImage]);

  const clearEndImage = () => {
    setEndImage(null);
    if (endImagePreview) URL.revokeObjectURL(endImagePreview);
    setEndImagePreview(null);
    setIsSimpleTransition(false);
  };

  // ── Simple transition — auto-prompt for a plain start→end frame morph ────
  const handleSimpleTransition = () => {
    if (!startImage || !endImage || isGenerating) return;
    const autoPrompt =
      'A smooth, natural cinematic transition that begins exactly at the start image and gradually ' +
      'transforms into the end image. Steady camera, continuous soft motion, and consistent lighting ' +
      'throughout — no new subjects or scene changes, just a clean transition between the two frames.';
    setPrompt(autoPrompt);
    setIsSimpleTransition(true);
    setPromptScore(null);
    setPromptEvaluated(false);
    setImprovedPromptSuggestion(null);
    setShowCritique(false);
  };

  const imageMode: 'text' | 'start' | 'start-end' =
    startImage && endImage ? 'start-end' : startImage ? 'start' : 'text';

  // ── Start generation ──────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim() || isStarting || !user) return;

    // Weekly limit check
    if (weeklyCount >= weeklyLimit) {
      setError(lvl <= 1
        ? 'You have used all your videos for this week. Come back next Monday!'
        : `Weekly limit reached (${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'}/week). Resets every Monday.`);
      return;
    }

    setIsStarting(true); setError(null); setVideoUrl(null); setActiveJob(null);
    setSavedUrl(null); setSaveError(null); setDashSaved(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const imagePayload: Record<string, string> = {};
      if (startImage) {
        imagePayload.image = await fileToBase64(startImage);
      }
      if (endImage) {
        imagePayload.last_image = await fileToBase64(endImage);
      }

      let anchoredPrompt = prompt.trim();
      if (startImage && endImage) {
        anchoredPrompt =
          `The video begins exactly with this precise scene: ${anchoredPrompt}. ` +
          `The first frame matches the start image exactly, with identical composition, subjects, lighting, and colours. ` +
          `The video transitions naturally and ends exactly with the final image, ` +
          `with the last frame matching the end image precisely in composition, subjects, lighting, and colours. ` +
          `No deviation from either anchor frame.`;
      } else if (startImage) {
        anchoredPrompt =
          `The video begins exactly with this precise scene: ${anchoredPrompt}. ` +
          `The first frame matches the start image exactly, with identical composition, subjects, lighting, and colours. ` +
          `Maintain strict fidelity to the starting image.`;
      }

      const anchoredNegPrompt = startImage
        ? `${negPrompt.trim()}, inconsistent first frame, mismatched starting scene, different opening composition, frame mismatch, scene change at start${endImage ? ', inconsistent last frame, mismatched ending scene, different closing composition, frame mismatch at end' : ''}`
        : negPrompt.trim();

      const { ok, data } = await callEdgeFunction('generate-video', 'POST', session.access_token, {
        prompt: anchoredPrompt, negative_prompt: anchoredNegPrompt, num_frames: FRAMES[duration],...imagePayload,
      });
      if (!ok || !data.jobId) throw new Error(data.error ?? 'Failed to start video generation');
      const newJob: VideoJob = {
        id: data.jobId, prompt: prompt.trim(), status: 'processing',
        video_url: null, error_message: null, created_at: new Date().toISOString(),
      };
      setActiveJob(newJob);
      setWeeklyCount(c => c + 1);
      startPolling(data.jobId, session.access_token);
      speakText(lvl <= 1
        ? 'OK! Your video is being made. This can take 2 to 5 minutes. Please wait and keep the page open.'
        : 'Your video generation has started. This usually takes 2 to 5 minutes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsStarting(false);
    }
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setActiveJob(null); setVideoUrl(null); setError(null);
    setSavedUrl(null); setSaveError(null); setDashSaved(false);
    clearStartImage();
    setIsSimpleTransition(false);
    setPromptScore(null); setPromptEvaluated(false); setImprovedPromptSuggestion(null);
    stopSpeaking();
  };

  // ── Save video to Supabase Storage bucket ────────────────────────────────
  const getSafeName = () => {
    const base = videoName.trim() || prompt.trim().slice(0, 40) || 'My_Video';
    return base.replace(/[^a-zA-Z0-9_\-]/g, '_');
  };

  const handleDownloadVideo = async () => {
    const url = savedUrl ?? videoUrl;
    if (!url) return;
    const safeName = getSafeName();
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${safeName}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.mp4`;
      a.click();
    }
  };

  const handleDownloadLastFrame = async () => {
    const srcUrl = savedUrl ?? videoUrl;
    if (!srcUrl) { alert('No video available yet.'); return; }
    const safeName = getSafeName();

    try {
      const resp = await fetch(srcUrl);
      if (!resp.ok) throw new Error('Could not fetch video');
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);

      const tempVideo = document.createElement('video');
      tempVideo.src = blobUrl;
      tempVideo.muted = true;
      tempVideo.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        tempVideo.onloadedmetadata = () => {
          const target = Math.max(0, tempVideo.duration - 0.1);
          tempVideo.currentTime = target;
        };
        tempVideo.onseeked = () => resolve();
        tempVideo.onerror  = () => reject(new Error('Video load error'));
        tempVideo.load();
      });

      const canvas = document.createElement('canvas');
      canvas.width  = tempVideo.videoWidth  || 640;
      canvas.height = tempVideo.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);

      canvas.toBlob(imgBlob => {
        if (!imgBlob) return;
        const imgUrl = URL.createObjectURL(imgBlob);
        const frameId = `last_frame_${Date.now()}`;
        setRecentFrameImages(prev => [{
          id: frameId,
          url: imgUrl,
          label: `Last frame: ${safeName.slice(0, 30)}`,
          source: 'last_frame',
        },...prev.filter(f => f.source !== 'last_frame' || f.id !== frameId)].slice(0, 16));
        const a = document.createElement('a');
        a.href = imgUrl;
        a.download = `${safeName}_last_frame.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, 'image/png');

    } catch (err) {
      console.error('[LastFrame]', err);
      alert('Could not capture last frame. Try saving the video to your account first, then try again.');
    }
  };

  const captureThumbnailBlob = async (): Promise<Blob | null> => {
    const srcUrl = videoUrl;
    if (!srcUrl) return null;
    try {
      const resp = await fetch(srcUrl);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const tempVideo = document.createElement('video');
      tempVideo.src = blobUrl;
      tempVideo.muted = true;
      await new Promise<void>((resolve, reject) => {
        tempVideo.onloadedmetadata = () => { tempVideo.currentTime = 0.5; };
        tempVideo.onseeked = () => resolve();
        tempVideo.onerror  = () => reject();
        tempVideo.load();
      });
      const canvas = document.createElement('canvas');
      canvas.width  = tempVideo.videoWidth  || 640;
      canvas.height = tempVideo.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(blobUrl); return null; }
      ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);
      return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    } catch {
      return null;
    }
  };

  const handleSaveVideo = async () => {
    if (!videoUrl || !user?.id || !activeJob || isSaving) return;
    setIsSaving(true); setSaveError(null);
    try {
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error('Could not fetch video from source');
      const blob = await res.blob();

      const path = `${user.id}/${activeJob.id}.mp4`;
      const { error: uploadError } = await supabase.storage.from('ai-videos').upload(path, blob, { contentType: 'video/mp4', upsert: true });

      if (uploadError) throw uploadError;

      let thumbnailUrl: string | null = null;
      const thumbBlob = await captureThumbnailBlob();
      if (thumbBlob) {
        const thumbPath = `${user.id}/${activeJob.id}_thumb.jpg`;
        const { error: thumbErr } = await supabase.storage.from('ai-videos').upload(thumbPath, thumbBlob, { contentType: 'image/jpeg', upsert: true });
        if (!thumbErr) {
          const { data: thumbSigned } = await supabase.storage.from('ai-videos').createSignedUrl(thumbPath, 60 * 60 * 24 * 365);
          thumbnailUrl = thumbSigned?.signedUrl ?? null;
        }
      }

      const { data: signed } = await supabase.storage.from('ai-videos').createSignedUrl(path, 60 * 60 * 24 * 365);

      const permanentUrl = signed?.signedUrl ?? null;

      await supabase.from('video_generations').update({
          saved_video_url: permanentUrl,
          thumbnail_url:   thumbnailUrl,
          saved_at:        new Date().toISOString(),
        }).eq('id', activeJob.id);

      setSavedUrl(permanentUrl);
      speakText(lvl <= 1
        ? 'Your video is saved! You can find it in your history.'
        : 'Video saved to your account successfully.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Save session to dashboard ─────────────────────────────────────────────
  const handleSaveToDashboard = async () => {
    if (!user?.id || isSavingDash) return;
    setIsSavingDash(true);
    try {
      const critiqueToSave = critiqueStep === 'full'
        ? critiqueText
        : stepMessages.length > 0
          ? stepMessages.map(m => `${m.role === 'coach' ? 'Coach' : 'You'}: ${m.text}`).join('\n\n')
          : null;

      await supabase.from('dashboard').insert({
        user_id:            user.id,
        activity:           'AI Video Creation',
        category_activity:  'Video Generation',
        sub_category:       'Text to Video',
        title:              `Video: ${prompt.trim().slice(0, 80)}`,
        progress:           videoUrl || savedUrl ? 'completed' : 'started',
        video_prompt:       prompt.trim(),
        video_url:          savedUrl ?? videoUrl,
        video_critique:     critiqueToSave,
        video_chat_history: stepMessages.length > 0 ? stepMessages : null,
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      });

      setDashSaved(true);
      speakText(lvl <= 1 ? 'Your session is saved!' : 'Session saved to your dashboard.');
    } catch (err) {
      console.error('Dashboard save error:', err);
    } finally {
      setIsSavingDash(false);
    }
  };

  // ── Improve my English ────────────────────────────────────────────────────
  const handleImproveEnglish = async () => {
    if (!prompt.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const improved = await chatText({
        messages: [{
          role: 'user',
          content: `You are an English language coach helping a student in Nigeria improve their AI video prompt.

The student wrote: "${prompt.trim()}"

Your job:
1. Carefully understand what the student wants to see in their video — even if the grammar is poor.
2. Rewrite it as a clear, vivid, well-formed video description in natural English.
3. Keep their core idea completely unchanged — do not add new scenes or change the subject.
4. Add specific visual details that help AI video models (lighting, camera angle, mood, movement).
5. Fix all grammar errors while preserving their voice and meaning.
6. Keep the result under 120 words.

Return ONLY the improved prompt text. No explanation, no preamble.`
        }],
        system: 'You are a helpful English writing coach. Return only the improved prompt, nothing else.',
        max_tokens: 200,
        temperature: 0.4,
      });
      if (improved.trim()) {
        setPrompt(improved.trim());
        speakText(lvl <= 1
          ? 'I improved your English. Please read it and check if it is correct.'
          : 'Your prompt has been improved. Check the changes and edit further if needed.');
      }
    } catch (err) {
      console.error('Improve error:', err);
    } finally {
      setIsImproving(false);
    }
  };

  // ── Critique my prompt ────────────────────────────────────────────────────
  const handleFullCritique = async () => {
    if (!prompt.trim() || isCritiquing) return;
    setIsCritiquing(true); setCritiqueStep('full'); setShowCritique(true);
    setPromptScore(null); setPromptEvaluated(false); setImprovedPromptSuggestion(null);

    const commGuidance = lvl <= 1
      ? 'Write in short, simple sentences. One idea per sentence. Use familiar examples. Max 80 words.'
      : lvl === 2
      ? 'Write clearly and directly. 2–3 short paragraphs maximum.'
      : 'Write in well-structured English with appropriate detail.';

    try {
      const critique = await chatText({
        messages: [{
          role: 'user',
          content: `You are an expert at writing AI text-to-video prompts. A student has written this prompt:

"${prompt.trim()}"

Evaluate this prompt for AI video generation quality. Assess each of the following 6 elements:
1. SUBJECT — Is it clear who or what is in the video?
2. SETTING — Is the place/environment described?
3. LIGHTING — Is light mentioned (golden, dim, sunlit, etc.)?
4. CAMERA — Is there any camera direction (close-up, slow pan, aerial, etc.)?
5. MOOD/ATMOSPHERE — Does it have emotional tone or atmosphere?
6. MOVEMENT — Is there any action or motion described?

For each area: say what is good, what is missing, and give a one-line example of how to improve it.

Then give an overall SCORE out of 10. The score must appear on its own line in this exact format:
SCORE: X/10

A score of ${PROMPT_SCORE_THRESHOLD} or higher means the prompt is strong enough to generate a video.
A score below ${PROMPT_SCORE_THRESHOLD} means the student must improve their prompt before generating.

If the score is below ${PROMPT_SCORE_THRESHOLD}, end your entire response with an improved version of the
prompt, introduced on its own line by exactly this marker (all caps, nothing else on that line):
IMPROVED PROMPT:

Strict rules for the improved prompt:
- Preserve the student's original subject, setting, and idea EXACTLY — never invent a new scene, change
  who or what is in it, or change the setting.
- Only ADD the missing visual details you identified above (lighting, camera, mood, movement) and fix
  grammar/clarity. Never replace or remove the original concept.
- If the student's idea is simple, keep it simple — enrich it, don't rewrite it into something else.
- Keep it under 120 words.

${commGuidance}`
        }],
        system: 'You are a helpful AI video prompt coach. Give honest, specific feedback. Always include SCORE: X/10 on its own line.',
        max_tokens: 1200,
        temperature: 0.5,
      });

      const scoreMatch = critique.match(/SCORE:\s*(\d+)\s*\/\s*10/i);
      const parsedScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

      const improvedMatch = critique.match(/IMPROVED PROMPT:\s*([\s\S]*)/i);
      const suggestion = improvedMatch ? improvedMatch[1].trim() : null;
      const critiqueDisplay = improvedMatch ? critique.slice(0, improvedMatch.index).trim() : critique;

      setCritiqueText(critiqueDisplay);
      setImprovedPromptSuggestion(suggestion);
      setPromptScore(parsedScore);
      setPromptEvaluated(true);

      if (parsedScore !== null && parsedScore >= PROMPT_SCORE_THRESHOLD) {
        speakText(lvl <= 1
          ? `Great prompt! You scored ${parsedScore} out of 10. You can now make your video.`
          : `Your prompt scored ${parsedScore}/10 — strong enough to generate. Click Generate when ready.`);
      } else if (parsedScore !== null) {
        speakText(lvl <= 1
          ? `Your prompt scored ${parsedScore} out of 10. Please improve it before making your video. Read the feedback and try again.`
          : `Your prompt scored ${parsedScore}/10. Please revise it using the feedback below, then re-evaluate before generating.`);
      } else {
        speakText(lvl <= 1 ? 'Here is my feedback on your prompt.' : 'Here is your prompt critique.');
      }
    } catch {
      setCritiqueText('Sorry, I could not critique your prompt right now. Please try again.');
    } finally {
      setIsCritiquing(false);
    }
  };

  const handleStartStepByStep = async () => {
    setCritiqueStep('step'); setShowCritique(true); setStepMessages([]);
    const opening = lvl <= 1
      ? "Let's build your video prompt together, step by step. First — what do you want to see in the video? Who is in it, or what is happening? Tell me in a few words."
      : "Let's build your video prompt step by step. First, tell me: what is the main subject of your video? Who or what should be in the frame?";
    setStepMessages([{ role: 'coach', text: opening }]);
    speakText(opening);
  };

  const handleStepSend = async () => {
    if (!stepInput.trim() || isStepSending) return;
    const userMsg = stepInput.trim();
    setStepInput('');
    const updatedMsgs = [...stepMessages, { role: 'user' as const, text: userMsg }];
    setStepMessages(updatedMsgs);
    setIsStepSending(true);

    const commGuidance = lvl <= 1
      ? 'Use very short sentences. One idea each. Ask only one question. Max 40 words.'
      : lvl === 2
      ? 'Be clear and direct. One guiding question per turn. Max 80 words.'
      : 'Be concise and specific. One guiding question per turn.';

    const history = updatedMsgs.map(m => `${m.role === 'coach' ? 'Coach' : 'Student'}: ${m.text}`).join('\n');

    try {
      const reply = await chatText({
        messages: [{
          role: 'user',
          content: `You are a friendly AI video prompt coach helping a student in Nigeria build a great text-to-video prompt, one step at a time.

Conversation so far:
${history}

You are guiding the student through these elements in order:
1. Subject (who/what)
2. Setting (where)  
3. Lighting (what kind of light)
4. Camera angle or movement
5. Mood or atmosphere
6. Any action or motion

Check the conversation. Acknowledge what the student just said warmly. Then guide them to the NEXT element they have not yet described. Ask ONE clear question only.

When all 6 elements have been covered, synthesise everything into a final polished prompt and congratulate the student.

${commGuidance}`
        }],
        system: 'You are a patient, encouraging video prompt coach. One question at a time.',
        max_tokens: 200,
        temperature: 0.5,
      });
      setStepMessages(prev => [...prev, { role: 'coach', text: reply }]);
      speakText(reply);
    } catch {
      const fallback = 'Sorry, I had a small problem. Can you try again?';
      setStepMessages(prev => [...prev, { role: 'coach', text: fallback }]);
    } finally {
      setIsStepSending(false);
    }
  };

  const handleImproveStep = async () => {
    if (!stepInput.trim() || isImprovingStep) return;
    setIsImprovingStep(true);
    try {
      const improved = await chatText({
        messages: [{
          role: 'user',
          content: `You are an English language coach helping a student in Nigeria improve their writing.

The student wrote: "${stepInput.trim()}"

Rewrite it as a clear, grammatically correct English sentence that expresses their intended meaning.
Preserve their voice, ideas, and personality — do not change WHAT they are saying, only HOW it is said.
Keep it natural and conversational — this is a chat message, not a formal essay.
Fix all grammar errors while keeping it brief.

Return ONLY the improved text. No explanation, no preamble.`
        }],
        system: 'You are a helpful English writing coach. Return only the improved text.',
        max_tokens: 150,
        temperature: 0.3,
      });
      if (improved.trim()) setStepInput(improved.trim());
    } catch (err) {
      console.error('Step improve error:', err);
    } finally {
      setIsImprovingStep(false);
    }
  };

  const isGenerating = activeJob?.status === 'processing' || activeJob?.status === 'pending';
  const charCount    = prompt.length;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loadingContinent) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Cinematic background */}
      <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat', backgroundSize: '200px 200px',
        }} />
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-cyan-600/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-violet-600/10 blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* ══════════════════════════════════════════════════════════════════
            COST WARNING BANNER — always visible at top of page
            ══════════════════════════════════════════════════════════════════ */}
        <div className="mb-6 rounded-2xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-950/80 via-red-950/60 to-amber-950/80 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 flex items-start gap-4">
            <div className="shrink-0 mt-0.5">
              <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
                <AlertTriangle size={24} className="text-amber-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-amber-200 mb-1.5">
                {lvl <= 1
                  ? '⚠️ Important: Video making is limited right now'
                  : '⚠️ Cost Notice: Video Generation Temporarily Limited'}
              </h2>
              <p className="text-sm text-amber-100/90 leading-relaxed mb-3">
                {lvl <= 1
                  ? `Making videos costs a lot of money for our platform. Right now, you can make up to ${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'} per week, and videos are only 5 seconds long. We are working to make this better!`
                  : `AI video generation incurs significant compute costs that currently exceed what we can sustainably support. To keep this feature available for everyone, usage is limited to ${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'} per week per user, with a maximum duration of 5 seconds.`}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-amber-900/40 border border-amber-500/30 rounded-lg px-3 py-1.5">
                  <Film size={14} className="text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-amber-200">
                    {lvl <= 1 ? `${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'} per week` : `Limit: ${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'} / week`}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-amber-900/40 border border-amber-500/30 rounded-lg px-3 py-1.5">
                  <Clock size={14} className="text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-amber-200">
                    {lvl <= 1 ? '5 seconds only' : 'Max duration: 5 seconds'}
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-amber-500/20">
                <p className="text-xs text-amber-200/70 leading-relaxed">
                  {lvl <= 1
                    ? '📧 Do you have a special project and need more videos? Send an email to '
                    : '📧 Have a special project that requires additional video generations? Email '}
                  <a
                    href="mailto:khallinan1@udayton.edu?subject=Video%20Generation%20Request%20-%20Girls%20AIing&body=Hi%20Kevin%2C%0A%0AI%20would%20like%20to%20request%20additional%20video%20generation%20access%20for%20a%20special%20project.%0A%0AProject%20description%3A%20%0A%0ANumber%20of%20videos%20needed%3A%20%0A%0AThank%20you!"
                    className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 underline underline-offset-2 font-medium transition-colors"
                  >
                    <Mail size={12} />
                    khallinan1@udayton.edu
                  </a>
                  {lvl <= 1
                    ? ' and tell us about your project. We will try to help!'
                    : ' to request additional access. Please describe your project and the number of videos needed.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="inline-flex flex-col items-start gap-1 rounded-xl bg-slate-900/80 border border-slate-700/60 backdrop-blur-sm p-5 mb-4 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600">
                  <Film className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">{uiText.pageTitle}</h1>
                  <p className="text-slate-400 text-sm">{uiText.pageSubtitle}</p>
                </div>
              </div>

              {/* Voice controls */}
              <div className="flex items-center gap-2">
                <button onClick={() => { if (isSpeaking) stopSpeaking(); else setVoiceEnabled(e => !e); }}
                  className={classNames(
                    'p-2 rounded-lg border transition-all',
                    voiceEnabled ? 'bg-slate-700 border-slate-600 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                  )}
                  title={voiceEnabled ? 'Voice on — click to toggle' : 'Voice off'}>
                  {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                {voiceEnabled && (
                  <div className="flex rounded-lg overflow-hidden border border-slate-600">
                    <button onClick={() => setVoiceMode('english')}
                      className={classNames('px-3 py-1.5 text-xs font-bold transition-all',
                        voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
                      🇬🇧 {lvl <= 1 ? 'English' : 'British English'}
                    </button>
                    <button onClick={() => setVoiceMode('pidgin')}
                      className={classNames('px-3 py-1.5 text-xs font-bold transition-all',
                        voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
                      🇳🇬 {lvl <= 1 ? 'Pidgin' : 'Nigerian Pidgin'}
                    </button>
                  </div>
                )}
                {voiceEnabled && selectedVoice && (
                  <span className="text-xs text-slate-500 hidden sm:inline">{selectedVoice.name}</span>
                )}
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex gap-1 bg-slate-900/60 border border-slate-700/40 rounded-lg p-1 w-fit">
            {(['generate', 'history'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => { setView(v); if (v === 'history') loadHistory(); }}
                className={classNames('px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize',
                  view === v ? 'bg-gradient-to-r from-cyan-600 to-violet-600 text-white shadow'
                             : 'text-slate-400 hover:text-slate-200')}>
                {v === 'history' ? `${lvl <= 1 ? 'My Videos' : 'History'} (${history.length})` : (lvl <= 1 ? 'Make Video' : v)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Generate view ───────────────────────────────────────────────── */}
        {view === 'generate' && (
          <div className="space-y-4">

            {/* Weekly usage indicator */}
            <div className={classNames(
              'flex items-center gap-3 rounded-xl px-4 py-3 text-sm border',
              weeklyCount >= weeklyLimit
                ? 'bg-red-900/20 border-red-500/30 text-red-300'
                : weeklyCount >= weeklyLimit - 1
                ? 'bg-amber-900/20 border-amber-500/30 text-amber-300'
                : 'bg-slate-800/60 border-slate-700/40 text-slate-400'
            )}>
              {weeklyCount >= weeklyLimit
                ? <AlertTriangle size={16} className="shrink-0" />
                : <Film size={16} className="shrink-0" />}
              <span>
                {weeklyCount >= weeklyLimit
                  ? (lvl <= 1
                      ? 'You have used all your videos this week. Come back next Monday!'
                      : `Weekly limit reached (${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'}/week). Resets Monday.`)
                  : (lvl <= 1
                      ? `You can make ${weeklyLimit - weeklyCount} more video${weeklyLimit - weeklyCount === 1 ? '' : 's'} this week.`
                      : `${weeklyCount} / ${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'} used this week.`)}
              </span>
            </div>

            {/* Prompt card */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                {uiText.promptLabel}
              </label>
              <textarea
                value={prompt}
                onChange={e => {
                  setPrompt(e.target.value);
                  setPromptScore(null); setPromptEvaluated(false);
                  setImprovedPromptSuggestion(null); setIsSimpleTransition(false);
                }}
                rows={4} maxLength={1000} disabled={isGenerating}
                placeholder={uiText.promptPlaceholder}
                className="w-full bg-slate-800/80 border border-slate-600/50 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 text-sm resize-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-1 mb-3">
                <p className="text-xs text-slate-500">{uiText.promptHint}</p>
                <span className={classNames('text-xs', charCount > 900 ? 'text-amber-400' : 'text-slate-500')}>{charCount}/1000</span>
              </div>

              {/* Action buttons row */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={handleImproveEnglish}
                  disabled={!prompt.trim() || isImproving || isGenerating}
                  className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                  {isImproving
                    ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Improving…' : 'Improving…'}</>
                    : <><Wand2 size={14} /> {uiText.improveBtnLabel}</>}
                </button>

                <button onClick={handleFullCritique}
                  disabled={!prompt.trim() || isCritiquing || isGenerating}
                  className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-5 py-2 text-sm font-semibold transition-colors ring-2 ring-amber-400/30">
                  {isCritiquing && critiqueStep === 'full'
                    ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Checking…' : 'Evaluating…'}</>
                    : <><Lightbulb size={14} /> {lvl <= 1 ? '📊 Check My Prompt' : '📊 Evaluate Prompt'}</>}
                </button>

                <button onClick={handleStartStepByStep}
                  disabled={isGenerating}
                  className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                  <MessageSquare size={14} />
                  {lvl <= 1 ? 'Build step by step' : 'Build prompt step-by-step'}
                </button>
              </div>

              {/* Suggestion chips */}
              <div>
                <p className="text-xs text-slate-500 mb-2">{lvl <= 1 ? 'Try one of these:' : 'Try a suggestion:'}</p>
                <div className="flex flex-wrap gap-2">
                  {PROMPT_SUGGESTIONS.slice(0, 3).map((s, i) => (
                    <button key={i} onClick={() => setPrompt(s)} disabled={isGenerating}
                      className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600/50 text-slate-300 rounded-full px-3 py-1.5 transition-colors truncate max-w-xs disabled:opacity-40">
                      {s.slice(0, 55)}…
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Image anchoring ───────────────────────────────────────── */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-300">
                    {lvl <= 1 ? '🖼️ Add Images (optional)' : '🖼️ Image Anchoring (optional)'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {lvl <= 1
                      ? 'Add a start image so the video begins with your picture. Add an end image to finish there too.'
                      : 'Anchor the first and/or last frame of the video to uploaded images.'}
                  </p>
                </div>
                <span className={classNames(
                  'text-xs font-semibold rounded-full px-3 py-1 border shrink-0',
                  imageMode === 'start-end'
                    ? 'bg-violet-900/40 border-violet-500/40 text-violet-300'
                    : imageMode === 'start'
                    ? 'bg-cyan-900/40 border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-800 border-slate-600/50 text-slate-500'
                )}>
                  {imageMode === 'start-end'
                    ? (lvl <= 1 ? 'Text + Start + End' : 'Mode 3 — Text + Start + End')
                    : imageMode === 'start'
                    ? (lvl <= 1 ? 'Text + Start image' : 'Mode 2 — Text + Start Image')
                    : (lvl <= 1 ? 'Text only' : 'Mode 1 — Text Only')}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {/* Start image */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-400 mb-2">
                    {lvl <= 1 ? '▶ Start image' : '▶ Start frame'}
                  </p>
                  {startImagePreview ? (
                    <div className="relative group rounded-xl overflow-hidden border border-cyan-500/40 bg-black">
                      <img src={startImagePreview} alt="Start frame" className="w-full h-32 object-cover" />
                      <button onClick={clearStartImage} disabled={isGenerating}
                        className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                        title="Remove start image">
                        <XIcon size={12} />
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                        <p className="text-xs text-cyan-300 truncate">{startImage?.name}</p>
                      </div>
                    </div>
                  ) : (
                    <label className={classNames(
                      'flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed cursor-pointer transition-all',
                      isGenerating
                        ? 'border-slate-700 opacity-40 cursor-not-allowed'
                        : 'border-slate-600 hover:border-cyan-500/60 hover:bg-cyan-950/20'
                    )}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={e => {
                      e.preventDefault();
                      const url = e.dataTransfer.getData('text/plain');
                      const label = e.dataTransfer.getData('text/label') || 'frame';
                      if (url) applyUrlAsStartImage(url, label);
                    }}
                    >
                      <ImagePlus size={20} className="text-slate-500" />
                      <span className="text-xs text-slate-500 text-center px-2">
                        {lvl <= 1 ? 'Upload or drag image here' : 'Upload or drag start frame'}
                      </span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={handleStartImageChange} disabled={isGenerating} />
                    </label>
                  )}
                </div>

                <div className="flex items-center justify-center sm:pt-8">
                  <ArrowRight size={20} className={classNames(
                    'transition-colors',
                    startImage ? 'text-cyan-400' : 'text-slate-700'
                  )} />
                </div>

                {/* End image */}
                <div className="flex-1 min-w-0">
                  <p className={classNames('text-xs font-medium mb-2', startImage ? 'text-slate-400' : 'text-slate-600')}>
                    {lvl <= 1 ? '⏹ End image' : '⏹ End frame'}
                  </p>
                  {endImagePreview ? (
                    <div className="relative group rounded-xl overflow-hidden border border-violet-500/40 bg-black">
                      <img src={endImagePreview} alt="End frame" className="w-full h-32 object-cover" />
                      <button onClick={clearEndImage} disabled={isGenerating}
                        className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                        title="Remove end image">
                        <XIcon size={12} />
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                        <p className="text-xs text-violet-300 truncate">{endImage?.name}</p>
                      </div>
                    </div>
                  ) : (
                    <label className={classNames(
                      'flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed transition-all',
                      !startImage || isGenerating
                        ? 'border-slate-700 opacity-40 cursor-not-allowed'
                        : 'border-slate-600 hover:border-violet-500/60 hover:bg-violet-950/20 cursor-pointer'
                    )}
                    onDragOver={e => { if (!startImage || isGenerating) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={e => {
                      e.preventDefault();
                      if (!startImage || isGenerating) return;
                      const url = e.dataTransfer.getData('text/plain');
                      const label = e.dataTransfer.getData('text/label') || 'frame';
                      if (url) applyUrlAsEndImage(url, label);
                    }}
                    >
                      <ImagePlus size={20} className="text-slate-500" />
                      <span className="text-xs text-slate-500 text-center px-2">
                        {!startImage
                          ? (lvl <= 1 ? 'Add start image first' : 'Requires start frame')
                          : (lvl <= 1 ? 'Upload or drag end image' : 'Upload or drag end frame')}
                      </span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={handleEndImageChange} disabled={!startImage || isGenerating} />
                    </label>
                  )}
                </div>
              </div>

              {imageMode !== 'text' && (
                <p className="text-xs text-slate-500 bg-slate-800/50 rounded-lg px-3 py-2">
                  💡 {lvl <= 1
                    ? (imageMode === 'start-end'
                        ? 'The video will start with your first image and end with your second image.'
                        : 'The video will start with your image. The prompt controls what happens next.')
                    : (imageMode === 'start-end'
                        ? 'LTX-Video will align the first and last frames to your uploaded images. The prompt guides the motion between them.'
                        : 'LTX-Video will use your image as the first frame. The text prompt guides the visual development.')}
                </p>
              )}

              {imageMode === 'start-end' && (
                <div className="border-t border-slate-700/40 pt-4 space-y-1.5">
                  <button
                    onClick={handleSimpleTransition}
                    disabled={isGenerating}
                    className={classNames(
                      'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                      isSimpleTransition
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 border border-slate-600/60 hover:bg-slate-700'
                    )}>
                    <Sparkles size={14} />
                    {lvl <= 1 ? '✨ Just move from picture 1 to picture 2' : '✨ Simple Transition (Start → End)'}
                  </button>
                  <p className="text-xs text-slate-500">
                    {lvl <= 1
                      ? 'Skip writing a prompt — this makes a simple video that moves from your first picture to your second picture.'
                      : 'Auto-generates a minimal transition prompt and skips prompt evaluation — ideal for a quick morph between two exact frames.'}
                  </p>
                  {isSimpleTransition && (
                    <p className="text-xs text-cyan-400 flex items-center gap-1">
                      <CheckCircle size={12} />
                      {lvl <= 1 ? 'Simple transition ready — you can make your video now!' : 'Simple transition mode active — prompt evaluation bypassed.'}
                    </p>
                  )}
                </div>
              )}

              {/* Recent images from AI Image Generation */}
              {recentFrameImages.length > 0 && (
                <div className="border-t border-slate-700/40 pt-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                    <ImagePlus size={12} />
                    {lvl <= 1 ? 'Your recent images — click or drag to use as start/end frame:' : 'Recent generated images — click or drag onto a frame slot:'}
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {recentFrameImages.map(img => (
                      <div
                        key={img.id}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('text/plain', img.url);
                          e.dataTransfer.setData('text/label', img.label);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className="group relative rounded-lg overflow-hidden border border-slate-700/50 bg-slate-800 cursor-grab active:cursor-grabbing aspect-square"
                        title={img.label}
                      >
                        <img
                          src={img.url}
                          alt={img.label}
                          className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        {img.source === 'last_frame' && (
                          <div className="absolute top-1 left-1 bg-violet-600/80 text-white text-[9px] px-1 rounded leading-tight">
                            last frame
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => applyUrlAsStartImage(img.url, img.label)}
                            disabled={isGenerating}
                            className="text-[10px] font-semibold bg-cyan-600 hover:bg-cyan-500 text-white px-2 py-0.5 rounded w-14 text-center disabled:opacity-40 transition-colors"
                            title="Use as start frame"
                          >
                            ▶ Start
                          </button>
                          <button
                            onClick={() => applyUrlAsEndImage(img.url, img.label)}
                            disabled={isGenerating || !startImage}
                            className="text-[10px] font-semibold bg-violet-600 hover:bg-violet-500 text-white px-2 py-0.5 rounded w-14 text-center disabled:opacity-40 transition-colors"
                            title={!startImage ? 'Set a start frame first' : 'Use as end frame'}
                          >
                            ⏹ End
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1.5">
                    {lvl <= 1 ? 'Drag an image to the start or end box above.' : 'Drag thumbnails onto the start/end frame slots above, or hover and click ▶ Start / ⏹ End.'}
                  </p>
                </div>
              )}
            </div>

            {showCritique && (
              <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                    <Lightbulb size={16} />
                    {critiqueStep === 'step'
                      ? (lvl <= 1 ? '💬 Prompt Builder' : '💬 Step-by-Step Prompt Builder')
                      : (lvl <= 1 ? '💡 Prompt Feedback' : '💡 Prompt Critique')}
                  </h3>
                  <button onClick={() => { setShowCritique(false); setCritiqueText(''); setStepMessages([]); setCritiqueStep('idle'); stopSpeaking(); }}
                    className="text-slate-400 hover:text-slate-200 text-xs">✕ Close</button>
                </div>

                {critiqueStep === 'full' && (
                  isCritiquing
                    ? <div className="flex items-center gap-3 text-slate-400 text-sm">
                        <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                        {lvl <= 1 ? 'Checking your prompt…' : 'Analysing your prompt…'}
                      </div>
                    : <>
                        <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {critiqueText}
                        </div>
                        {improvedPromptSuggestion && (
                          <div className="mt-4 pt-4 border-t border-amber-500/20 space-y-2">
                            <p className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                              <Sparkles size={12} />
                              {lvl <= 1 ? 'Suggested better prompt (keeps your idea)' : 'AI-suggested improved prompt — keeps your original intent'}
                            </p>
                            <p className="text-sm text-slate-200 bg-slate-800/60 rounded-lg px-3 py-2 leading-relaxed">
                              {improvedPromptSuggestion}
                            </p>
                            <button
                              onClick={() => {
                                setPrompt(improvedPromptSuggestion);
                                setPromptScore(null);
                                setPromptEvaluated(false);
                                setImprovedPromptSuggestion(null);
                                setIsSimpleTransition(false);
                              }}
                              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-full px-3 py-1.5 text-xs font-semibold transition-colors">
                              <Wand2 size={12} /> {lvl <= 1 ? 'Use this prompt' : 'Use this improved prompt'}
                            </button>
                          </div>
                        )}
                      </>
                )}

                {critiqueStep === 'step' && (
                  <div className="space-y-3">
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {stepMessages.map((m, i) => (
                        <div key={i} className={classNames('rounded-lg px-3 py-2 text-sm',
                          m.role === 'coach'
                            ? 'bg-teal-900/40 border border-teal-500/30 text-teal-100'
                            : 'bg-slate-700/60 text-slate-200 ml-6')}>
                          {m.role === 'coach' && <span className="text-xs text-teal-400 font-semibold block mb-0.5">Coach</span>}
                          {m.text}
                        </div>
                      ))}
                      {isStepSending && (
                        <div className="bg-teal-900/40 border border-teal-500/30 rounded-lg px-3 py-2 text-sm text-teal-300">
                          <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={stepInput} onChange={e => setStepInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStepSend(); } }}
                        placeholder={lvl <= 1 ? 'Type your answer…' : 'Type your response…'}
                        className="flex-1 bg-slate-800 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-teal-500/50" />
                      <button onClick={handleImproveStep}
                        disabled={!stepInput.trim() || isImprovingStep || isStepSending}
                        title="Improve my English"
                        className="flex items-center gap-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap">
                        {isImprovingStep
                          ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <><Wand2 size={12} /> {lvl <= 1 ? 'Fix English' : 'Improve'}</>}
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

            {/* Duration — locked to 5 s for cost control */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-semibold text-slate-300">{uiText.durationLabel}</span>
                <span className="px-3 py-1 rounded-lg text-sm font-semibold bg-gradient-to-r from-cyan-600 to-violet-600 text-white">5s</span>
                <span className="text-xs text-slate-500">
                  {lvl <= 1 ? 'All videos are 5 seconds long.' : 'Fixed at 5 seconds — generation typically takes 2–5 minutes.'}
                </span>
              </div>
              <button onClick={() => setShowAdvanced(a => !a)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {lvl <= 1 ? 'More options' : 'Advanced options'}
              </button>
              {showAdvanced && (
                <div className="mt-3 pt-3 border-t border-slate-700/40">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {lvl <= 1 ? 'Things to avoid in the video' : 'Negative prompt — things to avoid'}
                  </label>
                  <input type="text" value={negPrompt} onChange={e => setNegPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="w-full bg-slate-800/80 border border-slate-600/50 rounded-lg px-3 py-2 text-slate-200 text-xs outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50" />
                  <p className="text-xs text-slate-600 mt-1">704 × 480 px · 24 fps</p>
                </div>
              )}
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

            {/* Active job status */}
            {activeJob && (
              <div className={classNames('rounded-2xl border backdrop-blur-sm p-5 space-y-4',
                activeJob.status === 'succeeded' ? 'bg-green-950/30 border-green-500/30' :
                activeJob.status === 'failed'    ? 'bg-red-950/30 border-red-500/30'     :
                'bg-cyan-950/30 border-cyan-500/30')}>
                <div className="flex items-center gap-4">
                  {isGenerating ? <ProgressRing size={52} />
                    : activeJob.status === 'succeeded' ? <CheckCircle size={40} className="text-green-400" />
                    : <XCircle size={40} className="text-red-400" />}
                  <div className="flex-1 min-w-0">
                    <p className={classNames('text-base font-semibold',
                      activeJob.status === 'succeeded' ? 'text-green-300' :
                      activeJob.status === 'failed'    ? 'text-red-300'   : 'text-cyan-300')}>
                      {lvl <= 1
                        ? (isGenerating ? 'Making your video… please wait' : activeJob.status === 'succeeded' ? '🎉 Your video is ready!' : 'Something went wrong')
                        : STATUS_LABEL[activeJob.status]}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {activeJob.prompt}
                      {imageMode !== 'text' && (
                        <span className="ml-2 text-cyan-400/70">
                          [{imageMode === 'start-end' ? '🖼️→🖼️' : '🖼️→'}]
                        </span>
                      )}
                    </p>
                    {isGenerating && (
                      <p className="text-xs text-slate-500 mt-1">
                        {lvl <= 1 ? 'This can take 2–5 minutes. Please keep this page open and wait…'
                                  : 'Wan 2.1 720p typically takes 2–5 minutes. Please keep this page open.'}
                      </p>
                    )}
                  </div>
                </div>
                {videoUrl && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Video Title
                      </label>
                      <input
                        type="text"
                        value={videoName}
                        onChange={e => setVideoName(e.target.value)}
                        placeholder={prompt.trim().slice(0, 50) || 'Enter a title for your video…'}
                        className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 placeholder-slate-500"
                      />
                    </div>
                    <div className="rounded-xl overflow-hidden bg-black border border-green-500/20">
                      <video ref={generatedVideoRef} src={savedUrl ?? videoUrl} controls autoPlay loop crossOrigin="anonymous" className="generated-video w-full max-h-80" />
                    </div>

                    {!savedUrl ? (
                      <div className="flex flex-col gap-1.5">
                        <button onClick={handleSaveVideo} disabled={isSaving}
                          className="flex items-center justify-center gap-2 w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
                          {isSaving
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {lvl <= 1 ? 'Saving video…' : 'Saving to your account…'}</>
                            : <><Save size={15} /> {lvl <= 1 ? '💾 Save My Video' : 'Save Video to Account'}</>}
                        </button>
                        {saveError && <p className="text-xs text-red-400 text-center">{saveError}</p>}
                        <p className="text-xs text-slate-500 text-center">
                          {lvl <= 1
                            ? 'Save it so you can watch it later.'
                            : 'Saves a permanent copy — Replicate URLs expire after a few days.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-green-900/20 border border-green-500/30 rounded-xl px-4 py-2.5">
                        <CheckCircle size={16} className="text-green-400 shrink-0" />
                        <p className="text-sm text-green-300">
                          {lvl <= 1 ? 'Video saved! ✅' : 'Video saved to your account permanently.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {(activeJob.status === 'succeeded' || activeJob.status === 'failed') && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    <button onClick={handleReset}
                      className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full px-4 py-2 text-sm font-medium transition-colors">
                      <Sparkles size={14} /> {lvl <= 1 ? 'Make another video' : 'Generate another'}
                    </button>
                    {(videoUrl || savedUrl) && (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={handleDownloadVideo}
                          className="flex items-center gap-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                          <Download size={14} /> {lvl <= 1 ? 'Download.mp4' : 'Download video (.mp4)'}
                        </button>
                        <button onClick={handleDownloadLastFrame}
                          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full px-4 py-2 text-sm font-medium transition-colors">
                          <Download size={14} /> Download Last Frame
                        </button>
                      </div>
                    )}
                    {!dashSaved ? (
                      <button onClick={handleSaveToDashboard} disabled={isSavingDash}
                        className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                        {isSavingDash
                          ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <Save size={14} />}
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
            {!activeJob && (() => {
              const scorePassed    = promptScore !== null && promptScore >= PROMPT_SCORE_THRESHOLD;
              const needsEval      = !promptEvaluated || promptScore === null;
              const scoreFailed    = promptEvaluated && promptScore !== null && promptScore < PROMPT_SCORE_THRESHOLD;
              const limitReached   = weeklyCount >= weeklyLimit;
              const readyToGenerate = scorePassed || isSimpleTransition;

              return (
                <div className="space-y-2">
                  {!limitReached && isSimpleTransition && (
                    <div className="rounded-xl px-4 py-3 text-sm border flex items-start gap-3 bg-cyan-900/20 border-cyan-500/30 text-cyan-300">
                      <span className="shrink-0 mt-0.5">✨</span>
                      <div>
                        <p className="font-semibold">
                          {lvl <= 1 ? 'Simple transition ready!' : 'Simple transition mode — ready to generate'}
                        </p>
                        <p className="text-xs opacity-80 mt-0.5">
                          {lvl <= 1
                            ? 'You do not need to check this prompt. Click below to make your video.'
                            : 'Auto-generated transition prompt — prompt evaluation is not required for this mode.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {!limitReached && !isSimpleTransition && (
                    <div className={classNames(
                      'rounded-xl px-4 py-3 text-sm border flex items-start gap-3',
                      scorePassed
                        ? 'bg-green-900/20 border-green-500/30 text-green-300'
                        : scoreFailed
                        ? 'bg-red-900/20 border-red-500/30 text-red-300'
                        : 'bg-amber-900/20 border-amber-500/30 text-amber-300'
                    )}>
                      <span className="shrink-0 mt-0.5">
                        {scorePassed ? '✅' : scoreFailed ? '❌' : '⚠️'}
                      </span>
                      <div>
                        {scorePassed && (
                          <>
                            <p className="font-semibold">
                              {lvl <= 1 ? `Great prompt! Score: ${promptScore}/10` : `Prompt quality: ${promptScore}/10 — ready to generate`}
                            </p>
                            <p className="text-xs opacity-80 mt-0.5">
                              {lvl <= 1
                                ? 'Your prompt is good enough. You can now make your video.'
                                : 'Your prompt meets the quality threshold. Click Generate when ready.'}
                            </p>
                          </>
                        )}
                        {scoreFailed && (
                          <>
                            <p className="font-semibold">
                              {lvl <= 1 ? `Score: ${promptScore}/10 — not ready yet` : `Prompt score: ${promptScore}/10 — below threshold (need ${PROMPT_SCORE_THRESHOLD}+)`}
                            </p>
                            <p className="text-xs opacity-80 mt-0.5">
                              {lvl <= 1
                                ? 'Please read the feedback and improve your prompt. Then click "Check My Prompt" again.'
                                : `Revise your prompt using the critique feedback, then re-run the evaluation. A score of ${PROMPT_SCORE_THRESHOLD}+ is required.`}
                            </p>
                          </>
                        )}
                        {needsEval && !scoreFailed && (
                          <>
                            <p className="font-semibold">
                              {lvl <= 1 ? 'Check your prompt before making a video' : 'Prompt evaluation required before generating'}
                            </p>
                            <p className="text-xs opacity-80 mt-0.5">
                              {lvl <= 1
                                ? `Click "Check My Prompt" first. You need a score of ${PROMPT_SCORE_THRESHOLD}/10 or more to make a video.`
                                : `Click "Evaluate Prompt" to score your prompt. A score of ${PROMPT_SCORE_THRESHOLD}/10 or higher is required to generate.`}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={!prompt.trim() || isStarting || !readyToGenerate || limitReached}
                    className={classNames(
                      'w-full flex items-center justify-center gap-3 rounded-xl py-3.5 font-semibold text-base transition-all',
                      prompt.trim() && !isStarting && readyToGenerate && !limitReached
                        ? 'bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white shadow-lg hover:shadow-cyan-500/25 hover:scale-[1.01]'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    )}>
                    {isStarting
                      ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Starting…' : 'Starting generation…'}</>
                      : <><Film size={20} /> {uiText.generateBtn}</>}
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Saved video thumbnails ────────────────────────────────────────── */}
        {view === 'generate' && savedThumbnails.length > 0 && (
          <div className="space-y-3 mt-2">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Film size={14} /> My Saved Videos
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {savedThumbnails.map(t => (
                <div key={t.id} className="group relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700/50 cursor-pointer"
                  onClick={() => window.open(t.savedVideoUrl, '_blank')}
                  title={t.prompt}>
                  <div className="relative" style={{ aspectRatio: '16/9' }}>
                    <img
                      src={t.thumbnailUrl}
                      alt={t.prompt}
                      className="w-full h-full object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/0 group-hover:bg-white/20 flex items-center justify-center transition-all">
                        <svg className="text-white opacity-0 group-hover:opacity-100 transition-opacity" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-[11px] text-slate-300 truncate">{t.prompt.slice(0, 50)}</p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(t.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── History view ─────────────────────────────────────────────────── */}
        {view === 'history' && (
          <div className="space-y-3">
            {loadingHist ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-16">
                <Film size={48} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">
                  {lvl <= 1 ? 'No videos yet. Make your first one!' : 'No videos yet. Generate your first one!'}
                </p>
                <button onClick={() => setView('generate')} className="mt-4 text-cyan-400 hover:text-cyan-300 text-sm underline">
                  {lvl <= 1 ? 'Make a video →' : 'Start generating →'}
                </button>
              </div>
            ) : (
              history.map(job => (
                <VideoCard key={job.id} job={job}
                  onReuse={(p) => { setPrompt(p); setView('generate'); handleReset(); }} />
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 bg-slate-900/50 border border-slate-700/30 rounded-xl px-4 py-3 text-xs text-slate-500">
          <p className="flex items-center gap-2"><Clock size={12} />{uiText.footerText}</p>
        </div>
      </div>

      {/* ── Confirmation dialog ────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 shrink-0">
                <AlertTriangle size={22} className="text-amber-400" />
              </div>
              <h2 className="text-base font-bold text-white">
                {lvl <= 1 ? 'Ready to make your video?' : 'Confirm video generation'}
              </h2>
            </div>

            <div className="bg-slate-800/80 rounded-xl px-4 py-3 text-sm text-slate-300 space-y-1">
              <p className="font-semibold text-slate-200 truncate">"{prompt.trim().slice(0, 80)}{prompt.length > 80 ? '…' : ''}"</p>
              {promptScore !== null && (
                <p className="text-xs text-green-400">
                  ✅ {lvl <= 1 ? `Prompt score: ${promptScore}/10` : `Evaluated prompt score: ${promptScore}/10`}
                </p>
              )}
            </div>

            <p className="text-sm text-amber-200 bg-amber-900/20 border border-amber-500/20 rounded-xl px-4 py-3">
              {lvl <= 1
                ? `Making a video uses AI computer power and costs real money. You have ${weeklyLimit - weeklyCount} video${weeklyLimit - weeklyCount === 1 ? '' : 's'} left this week. Please make sure your prompt is exactly what you want!`
                : `Video generation consumes AI compute and has a real cost. You have ${weeklyLimit - weeklyCount} of ${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'} remaining this week. Generation cannot be cancelled once started. Please confirm your prompt is final.`}
            </p>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl py-2.5 text-sm font-semibold transition-colors">
                {lvl <= 1 ? '← Go back' : 'Cancel'}
              </button>
              <button
                onClick={() => { setShowConfirm(false); handleGenerate(); }}
                className="flex-1 bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors shadow-lg">
                {lvl <= 1 ? '🎬 Yes, make my video!' : 'Confirm — Generate Video'}
              </button>
            </div>

            <p className="text-xs text-slate-500 text-center">
              {lvl <= 1
                ? `${weeklyCount} of ${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'} used this week. Limit resets every Monday.`
                : `Weekly usage: ${weeklyCount} / ${weeklyLimit} video${weeklyLimit === 1 ? '' : 's'}. Resets Monday.`}
            </p>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default VideoGenerationPage;