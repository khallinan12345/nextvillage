// src/pages/tech-skills/AIVoiceCertificationPage.tsx
//
// AI Voice Creation Certification
// Framework: mirrors AIImageCertificationPage
// Build environment: MiniMax Speech-02-Turbo via Replicate (generate-voice edge function)
//                   — same blocking call (~3-5s) as VoiceCreationPage
//
// Dashboard columns used:
//   voice_cert_session_id (text)  — new
//   voice_cert_evaluation (jsonb) — new (scores per criterion)
//   voice_cert_portfolio  (jsonb) — new (array of VoiceEntry records)
// Activity stored as: 'AI Voice Creation Certification'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { chatJSON } from '../../lib/chatClient';
import { saveEvaluation } from '../../lib/evaluations';
import { useAuth } from '../../hooks/useAuth';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import { useBranding, addBrandingToPDF } from '../../lib/useBranding';
import {
  Mic, Award, Trophy, XCircle, Loader2,
  Download, AlertCircle, Volume2, VolumeX,
  ChevronDown, ChevronUp, ClipboardList,
  RefreshCw, Trash2, Sparkles, BarChart3,
  Play, Pause, Wand2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assessment {
  certification_id: string;
  assessment_name: string;
  description: string;
  certification_prompt: string;
  certification_level0_metric: string;
  certification_level1_metric: string;
  certification_level2_metric: string;
  certification_level3_metric: string;
  assessment_order: number;
  phase?: number;
}

interface AssessmentScore {
  assessment_name: string;
  score: number | null;
  evidence: string | null;
}

type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'fearful';

interface VoiceEntry {
  id: string;
  script: string;
  purpose: string;
  voiceId: string;
  voiceLabel: string;
  emotion: Emotion;
  speed: number;
  audioUrl: string | null;
  status: 'generating' | 'succeeded' | 'failed';
  iteration: number;
  wordCount: number;
  createdAt: string;
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'AI Voice Creation';
const CERT_ACTIVITY = 'AI Voice Creation Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const VOICE_PRESETS = [
  { id: 'female-sharonlee', label: 'Sharon',  gender: 'female', style: 'Clear & Warm',     emoji: '👩'   },
  { id: 'female-sarah',     label: 'Sarah',   gender: 'female', style: 'Professional',     emoji: '👩‍💼' },
  { id: 'female-luna',      label: 'Luna',    gender: 'female', style: 'Calm & Gentle',    emoji: '🌙'   },
  { id: 'female-aria',      label: 'Aria',    gender: 'female', style: 'Energetic',        emoji: '⚡'   },
  { id: 'male-adam',        label: 'Adam',    gender: 'male',   style: 'Deep & Confident', emoji: '👨'   },
  { id: 'male-charlie',     label: 'Charlie', gender: 'male',   style: 'Friendly',         emoji: '😊'   },
  { id: 'male-liam',        label: 'Liam',    gender: 'male',   style: 'Authoritative',    emoji: '🎙️'  },
  { id: 'male-oliver',      label: 'Oliver',  gender: 'male',   style: 'Storyteller',      emoji: '📖'   },
];

const EMOTIONS: { id: Emotion; label: string; emoji: string }[] = [
  { id: 'neutral',   label: 'Neutral',   emoji: '😐' },
  { id: 'happy',     label: 'Happy',     emoji: '😊' },
  { id: 'sad',       label: 'Sad',       emoji: '😔' },
  { id: 'surprised', label: 'Surprised', emoji: '😮' },
  { id: 'angry',     label: 'Angry',     emoji: '😠' },
  { id: 'fearful',   label: 'Fearful',   emoji: '😨' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-muted',      bg: 'bg-gray-100',   border: 'border-gray-300'   };
  if (s === 3)    return { text: 'Advanced',     color: 'text-green-800',  bg: 'bg-green-100',  border: 'border-green-300'  };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-800',   bg: 'bg-blue-100',   border: 'border-blue-300'   };
  if (s === 1)    return { text: 'Emerging',     color: 'text-yellow-800', bg: 'bg-yellow-100', border: 'border-yellow-300' };
  return               { text: 'No Evidence',  color: 'text-red-800',    bg: 'bg-red-100',    border: 'border-red-300'    };
};

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

// ─── Score Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  const pct = score !== null ? (score / 3) * 100 : 0;
  const r = 18; const circ = 2 * Math.PI * r; const dash = (pct / 100) * circ;
  const color = score === null ? '#A8A29E' : score === 3 ? '#16A34A' : score === 2 ? '#2563EB' : score === 1 ? '#D97706' : '#DC2626';
  return (
    <svg width={44} height={44} viewBox="0 0 44 44">
      <circle cx={22} cy={22} r={r} fill="none" stroke="#E7E5E0" strokeWidth={4} />
      <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeLinecap="round" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
        style={{ transition: 'all 0.6s ease' }} />
      <text x={22} y={26} textAnchor="middle" fontSize={12} fontWeight="bold" fill={color}>
        {score !== null ? `${score}/3` : '—'}
      </text>
    </svg>
  );
};

// ─── Inline Audio Player ──────────────────────────────────────────────────────

const MiniAudioPlayer: React.FC<{ src: string }> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur,      setDur]      = useState(0);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2 bg-card rounded-lg px-2.5 py-1.5">
      <audio ref={audioRef} src={src}
        onTimeUpdate={e => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDur(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); }} />
      <button onClick={toggle}
        className="w-6 h-6 flex items-center justify-center bg-accent hover:bg-accent/90 rounded-full text-white flex-shrink-0 transition-colors">
        {playing ? <Pause size={10} /> : <Play size={10} />}
      </button>
      <div className="flex-1 h-1.5 bg-hair rounded-full overflow-hidden cursor-pointer"
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct  = (e.clientX - rect.left) / rect.width;
          const a    = audioRef.current;
          if (a && dur) { a.currentTime = pct * dur; setProgress(pct * dur); }
        }}>
        <div className="h-full bg-accent rounded-full"
          style={{ width: dur ? `${(progress / dur) * 100}%` : '0%' }} />
      </div>
      <span className="text-[9px] text-muted font-mono flex-shrink-0">
        {fmt(progress)}/{dur ? fmt(dur) : '--:--'}
      </span>
    </div>
  );
};

// ─── Voice Entry Card ─────────────────────────────────────────────────────────

const VoiceCard: React.FC<{ entry: VoiceEntry; onDelete: (id: string) => void }> = ({ entry, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const preset = VOICE_PRESETS.find(p => p.id === entry.voiceId);
  const emotion = EMOTIONS.find(e => e.id === entry.emotion);

  return (
    <div className="border border-hair rounded-xl overflow-hidden bg-card">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${entry.status === 'succeeded' ? 'bg-accent' : entry.status === 'generating' ? 'bg-accent animate-pulse' : 'bg-red-400'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-body truncate font-medium">{entry.script}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {entry.purpose && <span className="text-[10px] text-muted truncate max-w-[120px]">📌 {entry.purpose}</span>}
            <span className="text-[10px] text-accent">{preset?.emoji} {preset?.label}</span>
            <span className="text-[10px] text-muted">{emotion?.emoji} {entry.emotion}</span>
            <span className="text-[10px] text-muted">{entry.speed}× · #{entry.iteration}</span>
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-muted hover:text-body flex-shrink-0">
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-hair pt-2 space-y-2">
          {entry.status === 'generating' && (
            <div className="flex items-center gap-2 text-xs text-accent py-1">
              <Loader2 size={13} className="animate-spin" /> Generating audio…
            </div>
          )}
          {entry.status === 'succeeded' && entry.audioUrl && (
            <MiniAudioPlayer src={entry.audioUrl} />
          )}
          {entry.status === 'failed' && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1.5">Generation failed.</p>
          )}
          <div className="space-y-0.5 text-[10px] text-muted">
            <p><span className="text-muted">Script:</span> {entry.script}</p>
            <p><span className="text-muted">Voice:</span> {preset?.label} ({preset?.style}) · {entry.emotion} · {entry.speed}× speed</p>
            <p><span className="text-muted">Words:</span> {entry.wordCount}</p>
          </div>
          <div className="flex gap-2">
            {entry.audioUrl && (
              <a href={entry.audioUrl} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] bg-accent hover:bg-accent/90 text-white rounded px-2 py-1 transition-colors">
                <Download size={10} /> Download
              </a>
            )}
            <button onClick={() => onDelete(entry.id)}
              className="flex items-center gap-1 text-[10px] bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded px-2 py-1 transition-colors">
              <Trash2 size={10} /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const AIVoiceCertificationPage: React.FC = () => {
  const { user } = useAuth();

  const [view, setView] = useState<ViewMode>('overview');

  // ── Assessments ───────────────────────────────────────────────────────
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [loadingData,      setLoadingData]      = useState(true);
  const [dataError,        setDataError]        = useState<string | null>(null);

  // ── Personality ───────────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState(1);

  // ── Page narration voice ──────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');

  // Pidgin only for learners whose profile country is Nigeria.
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('country').eq('id', user.id).single()
      .then(({ data }) => setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english'));
  }, [user?.id]);
  const branding = useBranding();

  useEffect(() => {
    if (!branding.isReady) return;
    setVoiceMode(branding.variant === 'vai' ? 'pidgin' : 'english');
  }, [branding.isReady, branding.variant]);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  // ── Session ───────────────────────────────────────────────────────────
  const [sessionId,   setSessionId]   = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('My Voice Portfolio');
  const sessionIdRef = useRef<string | null>(null);
  const dashboardRowIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Portfolio ─────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<VoiceEntry[]>([]);

  // ── Generation form ───────────────────────────────────────────────────
  const [script,       setScript]       = useState('');
  const [purpose,      setPurpose]      = useState('');
  const [voiceId,      setVoiceId]      = useState('female-sharonlee');
  const [emotion,      setEmotion]      = useState<Emotion>('neutral');
  const [speed,        setSpeed]        = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);

  // ── Iteration tracking ────────────────────────────────────────────────
  const [scriptGroupCount, setScriptGroupCount] = useState<Record<string, number>>({});

  // ── Evaluation ────────────────────────────────────────────────────────
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError,    setEvalError]    = useState<string | null>(null);
  const [evalProgress, setEvalProgress] = useState('');

  // ── Certificate ───────────────────────────────────────────────────────
  const [certName,    setCertName]    = useState('');
  const [isGenCert,   setIsGenCert]   = useState(false);
  const [expandedCrit, setExpandedCrit] = useState<string | null>(null);

  const lvl              = communicationLevel;
  const succeededEntries = entries.filter(e => e.status === 'succeeded');
  const generatingCount  = entries.filter(e => e.status === 'generating').length;
  const allProficient    = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored        = assessmentScores.some(s => s.score !== null);
  const overallAvg       = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;

  // ── Page narration ────────────────────────────────────────────────────
  const speak = (text: string) => hookSpeak(text.slice(0, 400));
  const stopSpeaking = () => cancelSpeech();

  const renderVoiceBar = (textToRead: string) => (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-card border border-hair rounded-xl mb-4">
      <span className="text-xs font-semibold text-muted flex items-center gap-1"><Volume2 size={13} className="text-accent" /> Voice:</span>
      <div className="flex rounded-lg overflow-hidden border border-hair">
        {(['english', 'pidgin'] as const).map(m => (
          <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all border-r border-hair last:border-0 ${voiceMode === m ? 'bg-accent text-white' : 'bg-card text-muted hover:bg-hair hover:text-ink'}`}>
            {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
          </button>
        ))}
      </div>
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${isSpeaking ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20'}`}>
        {isSpeaking ? <><VolumeX size={12} /> Stop</> : <><Volume2 size={12} /> Read aloud</>}
      </button>
    </div>
  );

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoadingData(true); setDataError(null);
    try {
      const { data: pb } = await supabase.from('user_personality_baseline')
        .select('communication_level').eq('user_id', user.id).maybeSingle();
      if (pb?.communication_level != null) setCommunicationLevel(pb.communication_level);

      const { data: aData, error: aErr } = await supabase
        .from('certification_assessments').select('*')
        .eq('certification_name', CERT_NAME).order('assessment_order');
      if (aErr) throw aErr;
      setAssessments(aData || []);

      const { data: dash } = await supabase.from('dashboard').select('*')
        .eq('user_id', user.id).eq('activity', CERT_ACTIVITY).maybeSingle();

      if (dash?.id) dashboardRowIdRef.current = dash.id;

      const evalData = dash?.voice_cert_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score:    evalData?.scores?.[a.assessment_name]?.score ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      if (dash?.voice_cert_portfolio) {
        try {
          const saved = typeof dash.voice_cert_portfolio === 'string'
            ? JSON.parse(dash.voice_cert_portfolio) : dash.voice_cert_portfolio;
          if (Array.isArray(saved)) setEntries(saved);
        } catch {}
      }
      if (dash?.voice_cert_session_id) { setSessionId(dash.voice_cert_session_id); sessionIdRef.current = dash.voice_cert_session_id; }
      if (dash?.voice_script) setSessionName(dash.voice_script);

    } catch (err: any) { setDataError(err.message || 'Failed to load certification data'); }
    finally { setLoadingData(false); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Ensure record ─────────────────────────────────────────────────────
  const ensureRecord = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (user?.id) {
      const { data: inserted } = await supabase.from('dashboard').insert({
        user_id: user.id, activity: CERT_ACTIVITY,
        category_activity: 'Certification', progress: 'started',
        voice_cert_session_id: sid, voice_script: sessionName,
        voice_cert_portfolio: [], voice_cert_evaluation: {},
      }).select('id').single();
      if (inserted?.id) dashboardRowIdRef.current = inserted.id;
    }
    return sid;
  }, [user?.id, sessionName]);

  // ── Persist portfolio ─────────────────────────────────────────────────
  const persistPortfolio = useCallback(async (ents: VoiceEntry[]) => {
    const sid = sessionIdRef.current; if (!user?.id || !sid) return;
    await supabase.from('dashboard').update({
      voice_cert_portfolio: ents,
      voice_script: sessionName,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('voice_cert_session_id', sid);
  }, [user?.id, sessionName]);

  // ── Generate voice (blocking ~3-5s) ───────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!script.trim() || isGenerating) return;
    setIsGenerating(true); setGenError(null);
    await ensureRecord();

    const scriptKey = script.trim().toLowerCase().slice(0, 30);
    const iter = (scriptGroupCount[scriptKey] ?? 0) + 1;
    setScriptGroupCount(prev => ({ ...prev, [scriptKey]: iter }));

    const preset = VOICE_PRESETS.find(p => p.id === voiceId) ?? VOICE_PRESETS[0];
    const entryId = makeId();
    const newEntry: VoiceEntry = {
      id: entryId, script: script.trim(), purpose: purpose.trim(),
      voiceId, voiceLabel: preset.label, emotion, speed,
      audioUrl: null, status: 'generating', iteration: iter,
      wordCount: script.trim().split(/\s+/).length,
      createdAt: new Date().toISOString(),
    };
    const updated = [...entries, newEntry];
    setEntries(updated);
    setScript('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { ok, data } = await callEdgeFunction('generate-voice', 'POST', session.access_token, {
        script: newEntry.script, voice_id: voiceId, emotion, speed,
      });

      const audioUrl = ok ? (data.audioUrl || null) : null;
      const status   = ok && audioUrl ? 'succeeded' : 'failed';

      setEntries(prev => {
        const next = prev.map(e => e.id === entryId ? { ...e, status: status as any, audioUrl } : e);
        persistPortfolio(next);
        return next;
      });
    } catch (err: any) {
      setGenError(err.message || 'Generation failed');
      setEntries(prev => {
        const next = prev.map(e => e.id === entryId ? { ...e, status: 'failed' as const } : e);
        persistPortfolio(next);
        return next;
      });
    } finally { setIsGenerating(false); }
  }, [script, purpose, voiceId, emotion, speed, isGenerating, entries,
      scriptGroupCount, ensureRecord, persistPortfolio]);

  // ── Delete entry ──────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    const next = entries.filter(e => e.id !== id);
    setEntries(next);
    await persistPortfolio(next);
  }, [entries, persistPortfolio]);

  // ── Evaluate ──────────────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (!user?.id || isEvaluating || succeededEntries.length === 0) return;
    setIsEvaluating(true); setEvalError(null);
    await ensureRecord();

    const uniqueVoices  = [...new Set(entries.map(e => e.voiceLabel))];
    const uniqueEmotions = [...new Set(entries.map(e => e.emotion))];

    const portfolioSummary = entries.map((e, i) => [
      `Entry ${i + 1} (${e.status}) — Voice: ${e.voiceLabel} — Emotion: ${e.emotion} — Speed: ${e.speed}× — Iteration #${e.iteration}`,
      `Purpose: ${e.purpose || 'Not stated'}`,
      `Script (${e.wordCount} words): ${e.script}`,
    ].join('\n')).join('\n\n');

    const evidence = [
      `Total entries generated: ${entries.length}`,
      `Successfully generated: ${succeededEntries.length}`,
      `Unique voices used: ${uniqueVoices.join(', ')}`,
      `Unique emotions used: ${uniqueEmotions.join(', ')}`,
      `Entries with stated purpose: ${entries.filter(e => e.purpose.trim()).length}`,
      `Multi-iteration scripts: ${Object.values(scriptGroupCount).filter(c => c > 1).length} themes with 2+ attempts`,
      `Speed variations: ${[...new Set(entries.map(e => e.speed))].sort().join('×, ')}×`,
      `Word count range: ${Math.min(...entries.map(e => e.wordCount))}–${Math.max(...entries.map(e => e.wordCount))} words`,
    ].join('\n');

    const scores: Record<string, { score: number; evidence: string }> = {};
    const newScores: AssessmentScore[] = [];

    try {
      for (const assessment of assessments) {
        setEvalProgress(`Evaluating: ${assessment.assessment_name}…`);

        const evalPrompt = `You are evaluating a student's AI voice creation work for the "${assessment.assessment_name}" criterion.

CRITERION: ${assessment.assessment_name}
DESCRIPTION: ${assessment.description}
ASSESSMENT QUESTION: ${assessment.certification_prompt}

RUBRIC:
- Level 0 (No Evidence): ${assessment.certification_level0_metric}
- Level 1 (Emerging): ${assessment.certification_level1_metric}
- Level 2 (Proficient): ${assessment.certification_level2_metric}
- Level 3 (Advanced): ${assessment.certification_level3_metric}

STUDENT'S VOICE PORTFOLIO:
${portfolioSummary}

PORTFOLIO STATISTICS:
${evidence}

NOTE: You are evaluating the SCRIPTS, CREATIVE CHOICES, and PROCESS the student demonstrated (voice selection, emotion, speed, purpose, iteration). You cannot hear the audio but can judge the quality of their decision-making and scriptwriting through the written evidence above.

Respond ONLY in this JSON format:
{
  "score": <0, 1, 2, or 3>,
  "evidence": "<2-4 sentences explaining the score with specific references to the student's scripts and choices>"
}`;

        const result = await chatJSON({ page: 'AIVoiceCertificationPage',
          messages: [{ role: 'user', content: evalPrompt }],
          system: 'You are an expert AI voice production educator. Evaluate student work fairly based on their script quality, creative voice direction, and iterative process.',
          max_tokens: 400, temperature: 0.3,
        });

        const score    = result.score ?? 0;
        const evidence_text = result.evidence ?? 'Unable to evaluate.';
        scores[assessment.assessment_name] = { score, evidence: evidence_text };
        newScores.push({ assessment_name: assessment.assessment_name, score, evidence: evidence_text });
      }

      setEvalProgress('');
      setAssessmentScores(newScores);

      const avgCalc = newScores.reduce((s, a) => s + (a.score ?? 0), 0) / newScores.length;
      const allPass = newScores.every(s => (s.score ?? 0) >= 2);

      await supabase.from('dashboard').update({
        voice_cert_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg: avgCalc },
        progress: allPass ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('voice_cert_session_id', sessionIdRef.current!);

      // Dual-write to the shared evaluations table alongside the legacy
      // voice_cert_evaluation jsonb column above — see src/lib/evaluations.ts.
      // The legacy column stays authoritative for this page's own read path.
      if (dashboardRowIdRef.current) {
        saveEvaluation(user.id, {
          dashboardId: dashboardRowIdRef.current,
          activityType: 'ai_voice_certification',
          overallScore: avgCalc,
          maxScore: 3,
          criteria: newScores.map((s, i) => ({
            key: `${s.assessment_name}-${i}`,
            label: s.assessment_name,
            score: s.score ?? 0,
            evidence: s.evidence ?? undefined,
          })),
        }).catch(err => console.warn('[Evaluation] Dual-write to evaluations table failed:', err));
      }

      if (newScores.some(s => (s.score ?? 0) >= 2)) {
        try {
          const confetti = await import('canvas-confetti').catch(() => null);
          confetti?.default?.({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        } catch {}
      }

      setView('results');
    } catch (err: any) {
      setEvalError(err.message || 'Evaluation failed'); setEvalProgress('');
    } finally { setIsEvaluating(false); }
  }, [user?.id, isEvaluating, entries, assessments, succeededEntries,
      scriptGroupCount, ensureRecord]);

  // ── Certificate ───────────────────────────────────────────────────────
  const generateCertificate = useCallback(async () => {
    if (!certName.trim()) return;
    setIsGenCert(true);
    try {
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) { alert('PDF generation not available.'); return; }
      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      const minScore  = Math.min(...assessmentScores.map(s => s.score ?? 0));
      const certLevel = minScore === 3 ? 'Advanced' : minScore >= 2 ? 'Proficient' : 'Emerging';
      const avg       = assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length;

      // Borders — emerald/teal theme for voice
      doc.setLineWidth(3); doc.setDrawColor(16, 185, 129); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(20, 184, 166);  doc.rect(15, 15, W - 30, H - 30);

      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(16, 185, 129);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });
      doc.setFontSize(20); doc.setTextColor(20, 184, 166);
      doc.text(`AI Voice Creation Certification — ${certLevel}`, W / 2, 43, { align: 'center' });
      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the AI Voice Creation Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to write, direct, and produce AI-generated voice content', W / 2, 95, { align: 'center' });
      doc.text('using script writing, vocal direction, emotion control, and iterative refinement.', W / 2, 102, { align: 'center' });

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(16, 185, 129);
      doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel} · ${succeededEntries.length} voice${succeededEntries.length !== 1 ? 's' : ''} produced`, W / 2, 112, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
      doc.text('Assessment Competencies:', 20, 122);

      const cols = assessmentScores.length <= 4 ? 2 : 3;
      const colW = (W - 40) / cols;
      let yPos = 128; let col = 0;

      assessmentScores.forEach(sc => {
        const xPos = 20 + col * colW;
        const levelText = sc.score === 3 ? 'Advanced' : sc.score === 2 ? 'Proficient' : sc.score === 1 ? 'Emerging' : 'No Evidence';
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
        doc.text(`${sc.assessment_name}: ${sc.score ?? 0}/3 — ${levelText}`, xPos, yPos);
        if (sc.evidence) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
          const lines = doc.splitTextToSize(sc.evidence, colW - 5);
          lines.slice(0, 3).forEach((line: string, li: number) => { doc.text(line, xPos, yPos + 4 + li * 3.5); });
        }
        col++;
        if (col >= cols) { col = 0; yPos += 22; }
      });

      const footerY = H - 22;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130);
      doc.text(`Awarded: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 20, footerY);
      doc.text(`${branding.institutionName} Programme`, W / 2, footerY, { align: 'center' });
      doc.text(`Certification ID: VOI-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-VoiceCreation-Certificate.pdf`);
    } catch (err) { console.error('Certificate error:', err); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, succeededEntries.length, branding]);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex flex-col h-screen bg-paper">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={36} className="animate-spin text-accent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-paper text-ink overflow-hidden">
      <Navbar />

      {/* Voice fallback — fixed overlay when TTS unavailable (e.g. no network voice in Nigeria) */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>

        {/* ── Toolbar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-hair flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Mic size={18} className="text-accent" />
              <span className="text-sm font-bold text-ink">AI Voice Creation Certification</span>
            </div>
            {view !== 'overview' && (
              <>
                <div className="w-px h-5 bg-hair" />
                <input className="text-sm text-body bg-transparent border-b border-transparent hover:border-hair focus:border-accent outline-none px-1 py-0.5 w-44"
                  value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Portfolio name…" />
              </>
            )}
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors
                    ${view === v ? 'bg-accent/20 text-accent border-accent/40' : 'text-muted border-hair hover:text-body hover:border-accent/40'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '🎙️ Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex rounded-lg overflow-hidden border border-hair">
              {(['english', 'pidgin'] as const).map(m => (
                <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
                  className={`px-2 py-1.5 text-xs font-bold transition-all border-r border-hair last:border-0 ${voiceMode === m ? 'bg-accent text-white' : 'bg-card text-muted hover:bg-hair hover:text-ink'}`}>
                  {m === 'english' ? '🇬🇧' : '🇳🇬'}
                </button>
              ))}
            </div>
            {view === 'build' && (
              <button onClick={handleEvaluate} disabled={isEvaluating || succeededEntries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-lg shadow disabled:opacity-50 transition-colors">
                {isEvaluating ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />}
                {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit for Evaluation'}
              </button>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            OVERVIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {dataError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-2 text-sm text-red-300">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{dataError}
              </div>
            )}

            {renderVoiceBar(lvl <= 1
              ? 'Welcome to the AI Voice Creation Certification. You will write scripts and create AI voices, then be evaluated on your skill.'
              : 'Welcome to the AI Voice Creation Certification. Build a portfolio of MiniMax AI-generated voices demonstrating script writing, vocal direction, emotion control, and iterative refinement.')}

            <div className="p-6 bg-surface border border-accent/30 rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-accent/30 rounded-xl"><Mic size={24} className="text-accent" /></div>
                <div>
                  <h1 className="text-xl font-bold text-ink">AI Voice Creation Certification</h1>
                  <p className="text-accent text-sm">MiniMax Speech-02-Turbo · Script Writing · Vocal Direction</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="MiniMax Speech-02-Turbo · Script Writing · Vocal Direction"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-body text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you write scripts and create AI voices by choosing a speaker, emotion, and speed. You will be judged on how well you write your scripts, whether they have a clear purpose, how you choose voices and emotions, and how much you improve by trying again.'
                  : 'Demonstrate your AI voice creation skills by building a portfolio of MiniMax-generated audio clips. Evaluation covers script quality, vocal direction (voice choice, emotion, speed), creative purpose, iteration and refinement, and the breadth of your portfolio.'}
              </p>
            </div>

            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-1">💡 How the evaluation works</p>
              <p className="text-sm text-body leading-relaxed">
                {lvl <= 1
                  ? 'The evaluator reads your scripts and looks at your voice, emotion, and speed choices — not the audio itself. The better and more specific your scripts and choices, the higher your score. Always say why you are making each voice, and try the same script again to show improvement.'
                  : 'Evaluation analyses your written scripts, stated purposes, voice and emotion choices, speed settings, and iteration patterns. The evaluator examines the quality of your script writing, the deliberateness of your vocal direction decisions, and the range of your portfolio.'}
              </p>
            </div>

            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-3">📋 Certification Guidelines</p>
              <div className="space-y-2">
                {[
                  { icon: '✅', text: lvl <= 1 ? 'Always say WHY you are making each voice — for an ad, a story, a news report.' : 'State a clear purpose for every voice entry. Purpose is a scored criterion.' },
                  { icon: '✅', text: lvl <= 1 ? 'Choose an emotion that fits what you want the voice to feel like.' : 'Choose emotion and voice deliberately to match the script content and purpose — not randomly.' },
                  { icon: '✅', text: lvl <= 1 ? 'Try the same script again with a better version to improve it.' : 'Iterate — revisit the same script with a refined version, different voice, or adjusted emotion.' },
                  { icon: '✅', text: lvl <= 1 ? 'Write clear sentences. Short sentences spoken aloud sound best.' : 'Write scripts designed for spoken delivery: clear sentences, natural pauses, appropriate length.' },
                  { icon: '❌', text: lvl <= 1 ? 'Do not write very short scripts with only 1–2 sentences.' : 'Very short scripts (under 20 words) or scripts with no stated purpose score as No Evidence.' },
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">{rule.icon}</span>
                    <span className="text-body">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Script tip */}
            <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl mb-5">
              <p className="text-xs font-bold text-accent uppercase mb-2">🎙️ What makes a great voice script?</p>
              <div className="space-y-1.5 text-xs text-muted">
                <div className="flex items-start gap-2"><span className="text-red-400 flex-shrink-0 font-bold">✗ Weak:</span><span className="italic">"Hello. I like school."</span></div>
                <div className="flex items-start gap-2"><span className="text-accent flex-shrink-0 font-bold">✓ Strong:</span><span className="italic">"Good morning, everyone. My name is Amara, and I am here today to tell you something important. Every girl in our community deserves access to technology. At the Davidson AI Center, that is exactly what we are building — together, one skill at a time."</span></div>
                <p className="text-muted mt-2">Strong scripts have: <span className="text-body">a clear opening · a message · natural pacing · an audience in mind · an emotional tone</span></p>
              </div>
            </div>

            {/* Assessment criteria */}
            <div className="p-4 bg-card border border-hair rounded-xl mb-6">
              <p className="text-xs font-bold text-muted uppercase mb-3">🎯 What You Will Be Evaluated On</p>
              {assessments.length === 0 ? (
                <p className="text-sm text-muted italic">Loading criteria…</p>
              ) : (
                <div className="space-y-2">
                  {assessments.map(a => {
                    const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                    const sl = scoreLabel(sc?.score ?? null);
                    return (
                      <div key={a.certification_id} className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5"><ScoreRing score={sc?.score ?? null} /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-ink">{a.assessment_name}</p>
                            {sc?.score !== null && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sl.bg} ${sl.color} ${sl.border}`}>{sl.text}</span>}
                          </div>
                          <p className="text-xs text-muted leading-relaxed">{a.description || a.certification_prompt.slice(0, 120) + '…'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {anyScored && overallAvg !== null && (
              <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl mb-5 flex items-center gap-4">
                <Trophy size={28} className="text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted uppercase font-bold">Your current score</p>
                  <p className="text-2xl font-black text-ink">{overallAvg.toFixed(1)}<span className="text-base font-normal text-muted">/3.0</span></p>
                </div>
                {allProficient && <span className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-accent/20 text-accent border border-accent/30">🏆 Eligible for Certificate</span>}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-all hover:scale-[1.01] shadow-lg">
                {succeededEntries.length > 0 ? <><RefreshCw size={16} /> Continue Building</> : <><Mic size={16} /> Start Creating Voices</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-accent border border-accent/30 bg-accent/10 hover:bg-accent/20 rounded-xl transition-colors">
                  View Results →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            BUILD VIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'build' && (
          <div className="flex-1 flex overflow-hidden">

            {/* ── Left: Form + criteria ─────────────────────────────── */}
            <div className="w-80 flex-shrink-0 flex flex-col bg-surface border-r border-hair overflow-hidden">
              <div className="flex-shrink-0 px-4 py-3 border-b border-accent/30 bg-accent/10">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-accent" />
                  <p className="text-sm font-bold text-accent">Voice Script</p>
                </div>
                <p className="text-[10px] text-muted mt-0.5">
                  {lvl <= 1 ? 'Write what you want the voice to say.' : 'Write a script for spoken delivery — clear sentences, natural pacing.'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {genError && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" />
                    <p className="text-xs text-red-300">{genError}</p>
                  </div>
                )}
                {evalError && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" />
                    <p className="text-xs text-red-300">{evalError}</p>
                  </div>
                )}

                {/* Purpose */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Why are you making this voice? *' : 'Purpose / Use case *'}
                  </label>
                  <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
                    placeholder={lvl <= 1 ? 'e.g. A radio ad for solar energy' : 'e.g. Narration for a community solar energy documentary'}
                    className="w-full bg-paper border border-hair rounded-lg px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-accent transition-colors" />
                  <p className="text-[9px] text-muted mt-0.5">Stating a purpose is part of your evaluation.</p>
                </div>

                {/* Script */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Your script *' : 'Script *'}
                  </label>
                  <textarea value={script} onChange={e => setScript(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    rows={5} maxLength={2000}
                    placeholder={lvl <= 1
                      ? 'e.g. Hello! My name is Amara. Today I want to tell you about solar energy in our village…'
                      : 'e.g. Good morning. I am speaking to you today about a change that is coming to our community. Solar energy is not just about electricity — it is about opportunity, about education, about the future we are building together.'}
                    className="w-full bg-paper border border-hair rounded-xl px-3 py-2.5 text-sm text-ink placeholder-muted resize-y outline-none focus:border-accent transition-colors leading-relaxed" />
                  <div className="flex justify-between mt-0.5">
                    <p className="text-[9px] text-muted">Ctrl+Enter to generate · {script.trim().split(/\s+/).filter(Boolean).length} words</p>
                    <span className={`text-[9px] ${script.length > 1800 ? 'text-amber-400' : 'text-muted'}`}>{script.length}/2000</span>
                  </div>
                </div>

                {/* Voice preset */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Choose a voice' : 'Voice'}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {VOICE_PRESETS.map(p => (
                      <button key={p.id} onClick={() => setVoiceId(p.id)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition-all ${voiceId === p.id ? 'bg-accent/20 border-accent/50 text-accent' : 'border-hair text-muted hover:border-accent/40 hover:text-body'}`}>
                        <span className="text-base flex-shrink-0">{p.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold truncate">{p.label}</p>
                          <p className="text-[9px] text-muted truncate">{p.style}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Emotion */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Emotion' : 'Vocal emotion'}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOTIONS.map(e => (
                      <button key={e.id} onClick={() => setEmotion(e.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors ${emotion === e.id ? 'bg-accent/20 border-accent/50 text-accent' : 'border-hair text-muted hover:border-accent/40 hover:text-body'}`}>
                        {e.emoji} {e.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speed */}
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-[10px] text-muted uppercase font-bold">
                      {lvl <= 1 ? 'Speed' : 'Speaking speed'}
                    </label>
                    <span className="text-[10px] text-accent font-mono">{speed.toFixed(1)}×</span>
                  </div>
                  <input type="range" min={0.5} max={2.0} step={0.1} value={speed}
                    onChange={e => setSpeed(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-hair rounded-full appearance-none cursor-pointer accent-accent" />
                  <div className="flex justify-between text-[9px] text-muted mt-0.5">
                    <span>Slow</span><span>Normal</span><span>Fast</span>
                  </div>
                </div>

                {/* Stats if entries exist */}
                {entries.length > 1 && (
                  <div className="p-2.5 bg-card border border-hair rounded-lg text-[10px] text-muted space-y-0.5">
                    <p><span className="text-accent font-bold">{succeededEntries.length}</span> complete · <span className="text-muted">{generatingCount > 0 ? `${generatingCount} generating` : ''}</span></p>
                    <p>Voices used: {[...new Set(entries.map(e => e.voiceLabel))].join(', ')}</p>
                    <p>Emotions used: {[...new Set(entries.map(e => e.emotion))].join(', ')}</p>
                  </div>
                )}

                {/* Criteria accordion */}
                <div>
                  <p className="text-[10px] font-bold text-muted uppercase mb-2 flex items-center gap-1.5">
                    <ClipboardList size={11} /> Rubric Criteria
                  </p>
                  <div className="space-y-1.5">
                    {assessments.map(a => {
                      const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                      const isOpen = expandedCrit === a.certification_id;
                      const sl = scoreLabel(sc?.score ?? null);
                      return (
                        <div key={a.certification_id} className={`rounded-lg border overflow-hidden ${isOpen ? 'border-accent/40' : 'border-hair'}`}>
                          <button onClick={() => setExpandedCrit(isOpen ? null : a.certification_id)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-card hover:bg-hair text-left transition-colors">
                            <ScoreRing score={sc?.score ?? null} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-ink truncate">{a.assessment_name}</p>
                              {sc?.score !== null && <span className={`text-[9px] font-bold ${sl.color}`}>{sl.text}</span>}
                            </div>
                            {isOpen ? <ChevronUp size={12} className="text-muted flex-shrink-0" /> : <ChevronDown size={12} className="text-muted flex-shrink-0" />}
                          </button>
                          {isOpen && (
                            <div className="px-3 py-2.5 bg-paper border-t border-hair space-y-2">
                              <p className="text-[10px] text-muted leading-relaxed">{a.description}</p>
                              <div className="space-y-1">
                                {[
                                  { level: 0, text: a.certification_level0_metric, color: 'text-red-400' },
                                  { level: 1, text: a.certification_level1_metric, color: 'text-amber-400' },
                                  { level: 2, text: a.certification_level2_metric, color: 'text-blue-400' },
                                  { level: 3, text: a.certification_level3_metric, color: 'text-green-400' },
                                ].map(({ level, text, color }) => (
                                  <div key={level} className={`flex items-start gap-1.5 text-[10px] ${color}`}>
                                    <span className="font-bold flex-shrink-0">L{level}:</span>
                                    <span className="text-muted">{text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 px-4 pb-4 pt-2">
                <button onClick={handleGenerate} disabled={isGenerating || !script.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl disabled:opacity-40 transition-colors">
                  {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
                  {isGenerating ? 'Generating…' : (lvl <= 1 ? 'Create My Voice 🎙️' : 'Generate Voice')}
                </button>
              </div>
            </div>

            {/* ── Right: Portfolio ──────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-hair flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Mic size={13} className="text-accent" />
                  <span className="text-xs font-semibold text-body">Voice Portfolio</span>
                  <span className="text-[10px] text-muted">{succeededEntries.length} complete · {generatingCount > 0 ? `${generatingCount} generating · ` : ''}{entries.length} total</span>
                </div>
                <button onClick={handleEvaluate} disabled={isEvaluating || succeededEntries.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-lg disabled:opacity-40 transition-colors">
                  {isEvaluating ? <Loader2 size={11} className="animate-spin" /> : <Award size={11} />}
                  {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-3">
                    <Mic size={48} className="text-muted" />
                    <p className="text-muted text-sm font-medium">
                      {lvl <= 1 ? 'Your voice recordings will appear here.' : 'Your voice portfolio builds up here as you generate.'}
                    </p>
                    <div className="max-w-xs space-y-1 text-xs text-muted">
                      <p>💡 {lvl <= 1 ? 'Write a script, choose a voice, then click Create.' : 'Write a purposeful script, direct the voice and emotion, then generate.'}</p>
                      <p>🔄 {lvl <= 1 ? 'Try the same script again with a better version.' : 'Iterate — try the same content with a different voice or emotion.'}</p>
                      <p>⚡ {lvl <= 1 ? 'Voices take 3–5 seconds to make.' : 'MiniMax Speech generates in ~3–5 seconds.'}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {entries.length > 1 && (
                      <div className="flex items-center gap-3 p-2.5 bg-card border border-hair rounded-lg text-xs text-muted">
                        <span className="text-accent font-bold">{succeededEntries.length}</span> complete ·
                        <span className="text-accent font-bold">{Object.values(scriptGroupCount).filter(c => c > 1).length}</span> iterated ·
                        <span className="text-accent font-bold">{entries.filter(e => e.purpose.trim()).length}</span> with purpose ·
                        <span className="text-blue-400 font-bold">{[...new Set(entries.map(e => e.emotion))].length}</span> emotions used
                      </div>
                    )}
                    {entries.map(entry => (
                      <VoiceCard key={entry.id} entry={entry} onDelete={handleDelete} />
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            RESULTS VIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'results' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {renderVoiceBar(anyScored
              ? `Your AI Voice Creation results. Overall average: ${overallAvg?.toFixed(1)} out of 3.`
              : 'Submit your voice portfolio for evaluation to see results.')}

            {!anyScored ? (
              <div className="text-center py-16 space-y-4">
                <ClipboardList size={48} className="text-muted mx-auto" />
                <p className="text-muted">{lvl <= 1 ? 'You have not been evaluated yet. Go to Build and create some voices first.' : 'No evaluation data yet. Generate voices and submit for evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl">
                  <Mic size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-5 p-5 bg-surface border border-accent/30 rounded-2xl">
                  <Trophy size={40} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted uppercase font-bold">Overall Score</p>
                    <p className="text-4xl font-black text-ink">{overallAvg?.toFixed(1)}<span className="text-lg font-normal text-muted">/3.0</span></p>
                    <p className={`text-sm font-bold mt-0.5 ${allProficient ? 'text-accent' : 'text-amber-400'}`}>
                      {allProficient ? '🏆 Proficiency Achieved — Certificate Eligible' : `${assessmentScores.filter(s => (s.score ?? 0) >= 2).length}/${assessmentScores.length} criteria at Proficient or above`}
                    </p>
                  </div>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl text-sm transition-colors">
                      <Award size={16} /> Get Certificate
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {assessmentScores.map(sc => {
                    const assessment = assessments.find(a => a.assessment_name === sc.assessment_name);
                    const sl = scoreLabel(sc.score);
                    const isOpen = expandedCrit === sc.assessment_name;
                    return (
                      <div key={sc.assessment_name} className={`rounded-xl border overflow-hidden ${sl.border} ${sl.bg}`}>
                        <button onClick={() => setExpandedCrit(isOpen ? null : sc.assessment_name)}
                          className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-paper transition-colors">
                          <ScoreRing score={sc.score} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-ink">{sc.assessment_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs font-bold ${sl.color}`}>{sl.text}</span>
                              <div className="h-1.5 w-24 bg-hair rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${sc.score === 3 ? 'bg-green-500' : sc.score === 2 ? 'bg-blue-500' : sc.score === 1 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${((sc.score ?? 0) / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={14} className="text-muted flex-shrink-0" /> : <ChevronDown size={14} className="text-muted flex-shrink-0" />}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-hair pt-3 space-y-3">
                            {sc.evidence && (
                              <div>
                                <p className="text-[10px] font-bold text-muted uppercase mb-1">Evidence</p>
                                <p className="text-xs text-body leading-relaxed">{sc.evidence}</p>
                              </div>
                            )}
                            {assessment && (
                              <div>
                                <p className="text-[10px] font-bold text-muted uppercase mb-1">Rubric</p>
                                <div className="space-y-1">
                                  {[
                                    { level: 0, text: assessment.certification_level0_metric, color: 'text-red-400' },
                                    { level: 1, text: assessment.certification_level1_metric, color: 'text-amber-400' },
                                    { level: 2, text: assessment.certification_level2_metric, color: 'text-blue-400' },
                                    { level: 3, text: assessment.certification_level3_metric, color: 'text-green-400' },
                                  ].map(({ level, text, color }) => (
                                    <div key={level} className={`flex gap-1.5 text-[10px] ${sc.score === level ? color : 'text-muted'}`}>
                                      <span className="font-bold flex-shrink-0">{sc.score === level ? '▶' : ' '} L{level}:</span>
                                      <span>{text}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setView('build')}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-accent border border-accent/30 bg-accent/10 hover:bg-accent/20 rounded-xl transition-colors">
                    <Mic size={15} /> Keep Creating
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || succeededEntries.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl disabled:opacity-50 transition-colors">
                    {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isEvaluating ? 'Re-evaluating…' : 'Re-evaluate'}
                  </button>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors ml-auto">
                      <Award size={15} /> Get Certificate →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            CERTIFICATE VIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'certificate' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
            {!allProficient ? (
              <div className="text-center py-16 space-y-4">
                <XCircle size={48} className="text-amber-400 mx-auto" />
                <h2 className="text-lg font-bold text-ink">{lvl <= 1 ? 'Not ready yet.' : 'Certificate Not Yet Available'}</h2>
                <p className="text-muted text-sm max-w-sm mx-auto">
                  {lvl <= 1 ? 'You need Proficient (2/3) in all criteria. Keep creating and improving.' : 'A Proficient score (2+) on all criteria is required. Generate more voices and re-evaluate.'}
                </p>
                <button onClick={() => setView('results')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl">
                  <BarChart3 size={16} /> View Results
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {renderVoiceBar(lvl <= 1
                  ? 'Congratulations! You passed the AI Voice Creation Certification.'
                  : 'Congratulations on passing the AI Voice Creation Certification.')}

                {/* Preview */}
                <div className="p-6 bg-surface border-2 border-accent/40 rounded-2xl text-center space-y-4 relative overflow-hidden">
                  <div className="relative">
                    <div className="flex justify-center mb-3"><Trophy size={44} className="text-amber-400" /></div>
                    <p className="text-xs font-bold text-accent uppercase tracking-widest">Certificate of Achievement</p>
                    <p className="text-lg font-bold text-ink mt-1">AI Voice Creation Certification</p>
                    <p className="text-accent text-sm">MiniMax Speech · {scoreLabel(Math.min(...assessmentScores.map(s => s.score ?? 0))).text} Level · {succeededEntries.length} voice{succeededEntries.length !== 1 ? 's' : ''} produced</p>
                    <div className="my-4 h-px bg-accent/30" />
                    <p className="text-muted text-xs">Awarded to</p>
                    <p className="text-2xl font-bold text-ink mt-1">{certName || '[ Your Name ]'}</p>
                    <p className="text-muted text-xs mt-1">{branding.institutionName}</p>
                    <div className="my-4 h-px bg-accent/30" />
                    <div className="grid grid-cols-2 gap-2 text-left">
                      {assessmentScores.map(sc => {
                        const sl = scoreLabel(sc.score);
                        return (
                          <div key={sc.assessment_name} className={`px-2.5 py-1.5 rounded-lg border text-xs ${sl.bg} ${sl.border}`}>
                            <p className={`font-bold ${sl.color}`}>{sc.assessment_name}</p>
                            <p className="text-muted">{sc.score}/3 — {sl.text}</p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted mt-3">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-muted uppercase block mb-1.5">Full name for the certificate:</label>
                    <input type="text" value={certName} onChange={e => setCertName(e.target.value)}
                      placeholder="e.g. Amara Okoye"
                      className="w-full bg-card border border-hair rounded-xl px-4 py-3 text-ink placeholder-muted text-sm outline-none focus:border-accent transition-colors" />
                  </div>
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl disabled:opacity-50 transition-all hover:scale-[1.01]">
                    {isGenCert ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {isGenCert ? 'Generating PDF…' : 'Download Certificate (PDF)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
};

export default AIVoiceCertificationPage;