// src/pages/tech-skills/AIVideoProductionCertificationPage.tsx
//
// AI Video Production Certification
// Framework: mirrors WebDevCertificationPage (loads rubrics from certification_assessments,
//            evaluates against each criterion, saves to dashboard, generates PDF cert)
// Build environment: video generation interface (Wan 2.1 I2V 720p via Replicate edge function)
//                   — same generate-video + video-status functions as VideoGenerationPage
// No guided task system — student generates freely; rubric criteria shown throughout.
//
// Dashboard columns used (all pre-existing in schema):
//   video_chat_history (jsonb) — stores the array of video generation records
//   web_dev_evaluation (jsonb) — stores per-criterion scores (reused as jsonb cert store)
//   video_prompt (text)        — stores session name / purpose note
// Activity stored as: 'AI Video Production Certification'

import React, { useState, useEffect, useCallback, useRef } from 'react';

import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { chatJSON } from '../../lib/chatClient';
import { saveEvaluation } from '../../lib/evaluations';
import { useAuth } from '../../hooks/useAuth';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import { useBranding } from '../../lib/useBranding';
import { generateCertificatePdf } from '../../lib/certificatePdf';
import {
  Film, Award, Trophy, CheckCircle, XCircle, Loader2,
  Download, Play, Pause, StopCircle, RotateCcw, AlertCircle,
  Volume2, VolumeX, ChevronDown, ChevronUp, ClipboardList,
  ArrowRight, RefreshCw, Plus, Trash2, Clock, Star,
  Sparkles, Lightbulb, BarChart3,
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

interface VideoEntry {
  id: string;
  prompt: string;
  negativePrompt: string;
  duration: 5 | 8 | 10;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  videoUrl: string | null;
  jobId: string | null;
  createdAt: string;
  purpose: string;      // student's stated purpose for this video
  iteration: number;    // which iteration of this prompt is this?
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'AI Video Production';
const CERT_ACTIVITY = 'AI Video Production Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const FRAMES: Record<number, number> = { 5: 121, 8: 193, 10: 241 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-muted', bg: 'bg-gray-100', border: 'border-gray-300' };
  if (s === 3)    return { text: 'Advanced',     color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30' };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-700',    bg: 'bg-blue-100',    border: 'border-blue-300'    };
  if (s === 1)    return { text: 'Emerging',     color: 'text-yellow-700',   bg: 'bg-yellow-100',   border: 'border-yellow-300'   };
  return             { text: 'No Evidence',  color: 'text-red-700',    bg: 'bg-red-100',     border: 'border-red-300'     };
};

async function callEdgeFunction(
  path: string, method: 'GET' | 'POST', token: string,
  body?: object, params?: Record<string, string>,
): Promise<{ ok: boolean; data: any }> {
  let url = `${FUNCTIONS_URL}/${path}`;
  if (params) url += `?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  const pct = score !== null ? (score / 3) * 100 : 0;
  const r = 18; const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = score === null ? '#A8A29E' : score >= 2 ? '#16a34a' : score === 1 ? '#d97706' : '#dc2626';
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

// ─── Audio Player (page narration) ───────────────────────────────────────────
// Reusable inline audio player for generated video audio previews replaced by
// native <video> element — kept as a minimal helper.

// ─── Video Card ───────────────────────────────────────────────────────────────

const VideoCard: React.FC<{
  entry: VideoEntry;
  onDelete: (id: string) => void;
}> = ({ entry, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const statusColor = entry.status === 'succeeded' ? 'text-accent' : entry.status === 'failed' ? 'text-red-700' : 'text-accent';
  const statusIcon  = entry.status === 'succeeded' ? '✅' : entry.status === 'failed' ? '❌' : '⚡';
  return (
    <div className="border border-hair rounded-xl overflow-hidden bg-surface">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-black/[0.02] transition-colors">
        <span className={`text-sm flex-shrink-0 ${statusColor}`}>{statusIcon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-body truncate font-medium">{entry.prompt}</p>
          {entry.purpose && <p className="text-[10px] text-muted truncate">Purpose: {entry.purpose}</p>}
        </div>
        <span className="text-[10px] text-muted flex-shrink-0">{entry.duration}s · #{entry.iteration}</span>
        {expanded ? <ChevronUp size={12} className="text-muted flex-shrink-0" /> : <ChevronDown size={12} className="text-muted flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-hair pt-2">
          {entry.status === 'succeeded' && entry.videoUrl && (
            <video src={entry.videoUrl} controls className="w-full rounded-lg max-h-44 bg-black" />
          )}
          {entry.status === 'processing' && (
            <div className="flex items-center gap-2 text-xs text-accent py-2">
              <Loader2 size={13} className="animate-spin" /> Generating video… please wait
            </div>
          )}
          {entry.status === 'failed' && (
            <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">Generation failed.</p>
          )}
          <div className="space-y-1 text-[10px] text-muted">
            <p><span className="text-muted">Full prompt:</span> {entry.prompt}</p>
            {entry.negativePrompt && <p><span className="text-muted">Negative:</span> {entry.negativePrompt}</p>}
          </div>
          <div className="flex gap-2">
            {entry.videoUrl && (
              <a href={entry.videoUrl} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] bg-accent hover:bg-accent/90 text-white rounded px-2 py-1 transition-colors">
                <Download size={10} /> Download
              </a>
            )}
            <button onClick={() => onDelete(entry.id)}
              className="flex items-center gap-1 text-[10px] bg-red-50 hover:bg-red-100 text-red-700 rounded px-2 py-1 transition-colors">
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

const AIVideoProductionCertificationPage: React.FC = () => {
  const { user } = useAuth();

  // ── View ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>('overview');

  // ── Assessments ───────────────────────────────────────────────────────
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [loadingData,      setLoadingData]      = useState(true);
  const [dataError,        setDataError]        = useState<string | null>(null);

  // ── Personality ───────────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState(1);

  // ── Voice narration ───────────────────────────────────────────────────
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
  const [sessionId,      setSessionId]      = useState<string | null>(null);
  const [sessionName,    setSessionName]    = useState('My Video Project');
  const sessionIdRef = useRef<string | null>(null);
  const dashboardRowIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Videos portfolio ──────────────────────────────────────────────────
  const [videos,         setVideos]         = useState<VideoEntry[]>([]);

  // ── Current generation form ───────────────────────────────────────────
  const [prompt,         setPrompt]         = useState('');
  const [negPrompt,      setNegPrompt]      = useState('low quality, blurry, distorted, watermark');
  const [duration,       setDuration]       = useState<5 | 8 | 10>(5);
  const [purpose,        setPurpose]        = useState('');
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [genError,       setGenError]       = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Iteration tracking ────────────────────────────────────────────────
  // Tracks how many times the student has generated from a similar prompt base
  const [promptGroupCount, setPromptGroupCount] = useState<Record<string, number>>({});

  // ── Evaluation ────────────────────────────────────────────────────────
  const [isEvaluating,   setIsEvaluating]   = useState(false);
  const [evalError,      setEvalError]      = useState<string | null>(null);
  const [evalProgress,   setEvalProgress]   = useState('');

  // ── Certificate ───────────────────────────────────────────────────────
  const [certName,       setCertName]       = useState('');
  const [isGenCert,      setIsGenCert]      = useState(false);
  const [expandedCrit,   setExpandedCrit]   = useState<string | null>(null);

  // ── Show advanced options ─────────────────────────────────────────────
  const [showAdvanced,   setShowAdvanced]   = useState(false);

  const lvl = communicationLevel;
  const allProficient  = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored      = assessmentScores.some(s => s.score !== null);
  const overallAvg     = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;
  const succeededVideos = videos.filter(v => v.status === 'succeeded');
  const processingVideos = videos.filter(v => v.status === 'processing' || v.status === 'pending');

  const speak = (text: string) => hookSpeak(text.slice(0, 400));
  const stopSpeaking = () => cancelSpeech();

  // ── Voice bar ─────────────────────────────────────────────────────────
  const renderVoiceBar = (textToRead: string) => (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-surface border border-hair rounded-xl mb-4">
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
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${isSpeaking ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/10'}`}>
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

      const evalData = dash?.web_dev_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score: evalData?.scores?.[a.assessment_name]?.score ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      // Restore saved videos
      if (dash?.video_chat_history) {
        try {
          const saved = typeof dash.video_chat_history === 'string'
            ? JSON.parse(dash.video_chat_history) : dash.video_chat_history;
          if (Array.isArray(saved)) setVideos(saved);
        } catch {}
      }
      if (dash?.video_prompt) setSessionName(dash.video_prompt);
      if (dash?.web_dev_session_id) { setSessionId(dash.web_dev_session_id); sessionIdRef.current = dash.web_dev_session_id; }

    } catch (err: any) { setDataError(err.message || 'Failed to load certification data'); }
    finally { setLoadingData(false); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Cleanup polling on unmount ────────────────────────────────────────
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Ensure dashboard record ───────────────────────────────────────────
  const ensureRecord = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (user?.id) {
      const { data: inserted } = await supabase.from('dashboard').insert({
        user_id: user.id, activity: CERT_ACTIVITY,
        category_activity: 'Certification', progress: 'started',
        web_dev_session_id: sid, video_prompt: sessionName,
        video_chat_history: [], web_dev_evaluation: {},
      }).select('id').single();
      if (inserted?.id) dashboardRowIdRef.current = inserted.id;
    }
    return sid;
  }, [user?.id, sessionName]);

  // ── Persist videos ────────────────────────────────────────────────────
  const persistVideos = useCallback(async (vids: VideoEntry[]) => {
    const sid = sessionIdRef.current; if (!user?.id || !sid) return;
    await supabase.from('dashboard').update({
      video_chat_history: vids,
      video_prompt: sessionName,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('web_dev_session_id', sid);
  }, [user?.id, sessionName]);

  // ── Generate video ────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setGenError(null);
    await ensureRecord();

    // Track iteration count for this prompt theme
    const promptKey = prompt.trim().toLowerCase().slice(0, 30);
    const iter = (promptGroupCount[promptKey] ?? 0) + 1;
    setPromptGroupCount(prev => ({ ...prev, [promptKey]: iter }));

    const entryId = makeId();
    const newEntry: VideoEntry = {
      id: entryId, prompt: prompt.trim(), negativePrompt: negPrompt.trim(),
      duration, purpose: purpose.trim(), status: 'pending',
      videoUrl: null, jobId: null, iteration: iter,
      createdAt: new Date().toISOString(),
    };
    const updatedVideos = [...videos, newEntry];
    setVideos(updatedVideos);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { ok, data } = await callEdgeFunction('generate-video', 'POST', session.access_token, {
        prompt: prompt.trim(),
        negative_prompt: negPrompt.trim(),
        num_frames: FRAMES[duration],
      });

      if (!ok || !data.jobId) throw new Error(data.error ?? 'Failed to start video generation');

      const withJob = updatedVideos.map(v => v.id === entryId ? { ...v, jobId: data.jobId, status: 'processing' as const } : v);
      setVideos(withJob);
      setPrompt('');
      await persistVideos(withJob);

      // Poll for completion
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const { data: s } = await callEdgeFunction('video-status', 'GET', session.access_token, undefined, { jobId: data.jobId });
        if (s?.status === 'succeeded') {
          clearInterval(pollRef.current!);
          setVideos(prev => {
            const updated = prev.map(v => v.id === entryId ? { ...v, status: 'succeeded' as const, videoUrl: s.videoUrl } : v);
            persistVideos(updated);
            return updated;
          });
        } else if (s?.status === 'failed') {
          clearInterval(pollRef.current!);
          setVideos(prev => {
            const updated = prev.map(v => v.id === entryId ? { ...v, status: 'failed' as const } : v);
            persistVideos(updated);
            return updated;
          });
        }
      }, 3000);

    } catch (err: any) {
      setGenError(err.message || 'Something went wrong');
      setVideos(prev => prev.map(v => v.id === entryId ? { ...v, status: 'failed' as const } : v));
    } finally { setIsGenerating(false); }
  }, [prompt, negPrompt, duration, purpose, isGenerating, videos, promptGroupCount, ensureRecord, persistVideos]);

  // ── Delete video entry ────────────────────────────────────────────────
  const handleDeleteVideo = useCallback(async (id: string) => {
    const updated = videos.filter(v => v.id !== id);
    setVideos(updated);
    await persistVideos(updated);
  }, [videos, persistVideos]);

  // ── Evaluate against rubric ───────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (!user?.id || isEvaluating || videos.length === 0) return;
    setIsEvaluating(true); setEvalError(null);
    await ensureRecord();

    // Build a textual summary of the student's video portfolio for evaluation
    const portfolioSummary = videos.map((v, i) => [
      `Video ${i + 1} (${v.status}) — ${v.duration}s — Iteration #${v.iteration}`,
      `Purpose stated: ${v.purpose || 'Not stated'}`,
      `Prompt: ${v.prompt}`,
      v.negativePrompt ? `Negative prompt: ${v.negativePrompt}` : '',
      v.status === 'succeeded' ? '→ Video generated successfully' : `→ Status: ${v.status}`,
    ].filter(Boolean).join('\n')).join('\n\n');

    const iterationEvidence = [
      `Total videos generated: ${videos.length}`,
      `Successfully generated: ${succeededVideos.length}`,
      `Unique prompt themes (approx): ${Object.keys(promptGroupCount).length}`,
      `Videos with stated purpose: ${videos.filter(v => v.purpose.trim()).length}`,
      `Multi-iteration prompts: ${Object.values(promptGroupCount).filter(c => c > 1).length} themes with 2+ iterations`,
    ].join('\n');

    const scores: Record<string, { score: number; evidence: string }> = {};
    const newScores: AssessmentScore[] = [];

    try {
      for (const assessment of assessments) {
        setEvalProgress(`Evaluating: ${assessment.assessment_name}…`);

        const evalPrompt = `You are evaluating a student's AI video production work for the "${assessment.assessment_name}" criterion.

CRITERION: ${assessment.assessment_name}
DESCRIPTION: ${assessment.description}
ASSESSMENT QUESTION: ${assessment.certification_prompt}

RUBRIC:
- Level 0 (No Evidence): ${assessment.certification_level0_metric}
- Level 1 (Emerging): ${assessment.certification_level1_metric}
- Level 2 (Proficient): ${assessment.certification_level2_metric}
- Level 3 (Advanced): ${assessment.certification_level3_metric}

STUDENT'S VIDEO PORTFOLIO SUMMARY:
${portfolioSummary}

PORTFOLIO STATISTICS:
${iterationEvidence}

NOTE: You are evaluating based on the PROMPTS and PROCESS the student demonstrated, not the actual video content (which you cannot see). Evaluate prompt quality, creative direction, iteration, and technical understanding as demonstrated through their written prompts.

Evaluate the student's work against this specific criterion and rubric. Be fair and constructive.

Respond ONLY in this JSON format:
{
  "score": <0, 1, 2, or 3>,
  "evidence": "<2-4 sentences explaining the score with specific references to the student's prompts and process>"
}`;

        const result = await chatJSON({ page: 'AIVideoProductionCertificationPage',
          messages: [{ role: 'user', content: evalPrompt }],
          system: 'You are an expert AI video production educator. Evaluate student work fairly and provide specific, constructive feedback based on their demonstrated prompt engineering skills and creative process.',
          max_tokens: 400, temperature: 0.3,
        });

        const score  = result.score ?? 0;
        const evidence = result.evidence ?? 'Unable to evaluate.';
        scores[assessment.assessment_name] = { score, evidence };
        newScores.push({ assessment_name: assessment.assessment_name, score, evidence });
      }

      setEvalProgress('');
      setAssessmentScores(newScores);

      const overallAvgCalc = newScores.reduce((s, a) => s + (a.score ?? 0), 0) / newScores.length;
      const allPass = newScores.every(s => (s.score ?? 0) >= 2);

      await supabase.from('dashboard').update({
        web_dev_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg: overallAvgCalc },
        progress: allPass ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('web_dev_session_id', sessionIdRef.current!);

      // Dual-write to the shared evaluations table alongside the legacy
      // web_dev_evaluation jsonb column above (this page's legacy column is
      // misnamed — a copy-paste leftover from WebDevCertificationPage, left
      // as-is here) — see src/lib/evaluations.ts. The legacy column stays
      // authoritative for this page's own read path.
      if (dashboardRowIdRef.current) {
        saveEvaluation(user.id, {
          dashboardId: dashboardRowIdRef.current,
          activityType: 'ai_video_production_certification',
          overallScore: overallAvgCalc,
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
  }, [user?.id, isEvaluating, videos, assessments, succeededVideos, promptGroupCount, ensureRecord]);

  // ── Certificate generation ────────────────────────────────────────────
  const generateCertificate = useCallback(async () => {
    if (!certName.trim()) return;
    setIsGenCert(true);
    try {
      await generateCertificatePdf({
        recipientName: certName,
        title: 'AI Video Production Certification',
        description: [
          'For successfully completing the AI Video Production Certification,',
          'demonstrating the ability to design, generate, and iterate on AI-powered video content',
          'using text-to-video prompt engineering and creative direction.',
        ],
        scoreSuffix: `· ${succeededVideos.length} video${succeededVideos.length !== 1 ? 's' : ''} produced`,
        assessmentScores,
        branding,
        theme: 'cyan',
        idPrefix: 'VID',
        filenameSuffix: 'VideoProduction',
      });
    } catch (err) { console.error('Certificate error:', err); alert('PDF generation not available.'); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, succeededVideos.length, branding]);

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
    <div className="flex flex-col h-screen bg-paper text-body overflow-hidden">
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
              <Film size={18} className="text-accent" />
              <span className="text-sm font-bold text-ink">AI Video Production Certification</span>
            </div>
            {view !== 'overview' && (
              <>
                <div className="w-px h-5 bg-hair" />
                <input className="text-sm text-body bg-transparent border-b border-transparent hover:border-hair focus:border-accent outline-none px-1 py-0.5 w-44"
                  value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Project name…" />
              </>
            )}
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors
                    ${view === v ? 'bg-accent/10 text-accent border-accent/40' : 'text-muted border-hair hover:text-body hover:border-accent/30'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '🎬 Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
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
              <button onClick={handleEvaluate}
                disabled={isEvaluating || succeededVideos.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors shadow disabled:opacity-50">
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
              <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-xl flex gap-2 text-sm text-red-300">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{dataError}
              </div>
            )}

            {renderVoiceBar(lvl <= 1
              ? 'Welcome to the AI Video Production Certification. You will create AI videos using prompts, then be evaluated on how well you did it.'
              : 'Welcome to the AI Video Production Certification. You will generate a portfolio of AI videos using Wan 2.1, demonstrating prompt engineering skill, creative direction, and iterative refinement.')}

            {/* Hero */}
            <div className="p-6 bg-surface border border-hair rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-accent/10 rounded-xl"><Film size={24} className="text-accent" /></div>
                <div>
                  <h1 className="text-xl font-bold text-ink">AI Video Production Certification</h1>
                  <p className="text-accent text-sm">Wan 2.1 · Text-to-Video · Prompt Engineering</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="Wan 2.1 · Text-to-Video · Prompt Engineering"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-body text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you create AI videos by writing descriptions of what you want to see. You will be judged on how well you describe your videos, whether they have a clear purpose, and how much you improved them by trying again.'
                  : 'Demonstrate your AI video production skills by building a portfolio of Wan 2.1 generated clips. Your work is evaluated on prompt quality, visual storytelling, iteration, technical understanding of cinematography concepts, and creative direction.'}
              </p>
            </div>

            {/* What is evaluated */}
            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-1">💡 How the evaluation works</p>
              <p className="text-sm text-body leading-relaxed">
                {lvl <= 1
                  ? "Your AI prompts and your video portfolio are evaluated — not the video itself, which AI creates. The better and more specific your descriptions, the higher your score. Try the same idea more than once to show improvement."
                  : "Evaluation is based on your written prompts and creative process — not the raw video output, which is AI-generated. The evaluator analyses: how precise your prompts are, whether you state a clear purpose for each video, how you iterate and improve across attempts, and whether your prompts demonstrate understanding of cinematography (camera angles, lighting, movement, composition)."}
              </p>
            </div>

            {/* Rules */}
            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-3">📋 Certification Guidelines</p>
              <div className="space-y-2">
                {[
                  { icon: '✅', text: lvl <= 1 ? 'Generate as many videos as you want — more attempts show your progress.' : 'Generate as many videos as needed. Each prompt is evaluated — quantity shows iteration and improvement.' },
                  { icon: '✅', text: lvl <= 1 ? 'Always say WHY you are making each video (for a news story, for a school project, etc.).' : 'State a clear purpose for each video using the Purpose field. This is evaluated as part of your creative direction.' },
                  { icon: '✅', text: lvl <= 1 ? 'Try the same idea more than once with a better description each time.' : 'Iterate — revisit the same scene or concept with improved prompts to demonstrate refinement.' },
                  { icon: '✅', text: lvl <= 1 ? 'Use camera words like "close-up", "slow zoom", "aerial view", "golden light".' : 'Use cinematography vocabulary in prompts: shot types, camera movement, lighting conditions, mood descriptors.' },
                  { icon: '❌', text: lvl <= 1 ? 'Do not use very short prompts like "a dog walking". Add more detail.' : 'Very short or vague prompts (under 15 words) demonstrate minimal effort and will score as No Evidence.' },
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">{rule.icon}</span>
                    <span className="text-body">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Prompt tips */}
            <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl mb-5">
              <p className="text-xs font-bold text-accent uppercase mb-2">🎬 Prompt tip — what makes a great video prompt?</p>
              <div className="space-y-1.5 text-xs text-muted">
                <div className="flex items-start gap-2">
                  <span className="text-red-700 flex-shrink-0 font-bold">✗ Weak:</span>
                  <span className="italic">"A girl walking."</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-accent flex-shrink-0 font-bold">✓ Strong:</span>
                  <span className="italic">"A young girl in a blue school uniform walking through a sunlit Nigerian market at golden hour, slow tracking shot, colourful fabric stalls in the background, warm cinematic light, joyful expression."</span>
                </div>
                <p className="text-muted mt-2">Strong prompts include: <span className="text-body">subject · setting · lighting · camera movement · mood · time of day</span></p>
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
                            {sc?.score !== null && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sl.bg} ${sl.color} ${sl.border}`}>{sl.text}</span>
                            )}
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
                <Trophy size={28} className="text-yellow-700 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted uppercase font-bold">Your current score</p>
                  <p className="text-2xl font-black text-ink">{overallAvg.toFixed(1)}<span className="text-base font-normal text-muted">/3.0</span></p>
                </div>
                {allProficient && (
                  <span className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-accent/10 text-accent border border-accent/30">
                    🏆 Eligible for Certificate
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-all hover:scale-[1.01] shadow-lg">
                {succeededVideos.length > 0 ? <><RefreshCw size={16} /> Continue Making Videos</> : <><Film size={16} /> Start Making Videos</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-accent border border-accent/30 bg-accent/10 hover:bg-accent/10 rounded-xl transition-colors">
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

            {/* ── Left: Prompt form + criteria ─────────────────────── */}
            <div className="w-80 flex-shrink-0 flex flex-col bg-[#1a1d23] border-r border-hair overflow-hidden">

              {/* Prompt header */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-accent/30 bg-accent/10">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-accent" />
                  <p className="text-sm font-bold text-accent">Video Prompt</p>
                </div>
                <p className="text-[10px] text-muted mt-0.5">
                  {lvl <= 1 ? 'Describe the video you want to make.' : 'Write a detailed text-to-video prompt. Include subject, setting, lighting, camera, mood.'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">

                {genError && (
                  <div className="p-2.5 bg-red-100 border border-red-200 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-700 mt-0.5" />
                    <p className="text-xs text-red-300">{genError}</p>
                  </div>
                )}

                {evalError && (
                  <div className="p-2.5 bg-red-100 border border-red-200 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-700 mt-0.5" />
                    <p className="text-xs text-red-300">{evalError}</p>
                  </div>
                )}

                {/* Purpose input */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Why are you making this video? *' : 'Purpose / Creative brief *'}
                  </label>
                  <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
                    placeholder={lvl <= 1 ? 'e.g. To show solar energy helping our village' : 'e.g. Documentary segment on solar energy in Oloibiri'}
                    className="w-full bg-paper border border-hair rounded-lg px-3 py-2 text-sm text-ink placeholder-gray-600 outline-none focus:border-accent transition-colors" />
                  <p className="text-[9px] text-muted mt-0.5">{lvl <= 1 ? 'This helps show your creative thinking.' : 'Stating a clear purpose is part of your evaluation.'}</p>
                </div>

                {/* Main prompt */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Describe your video *' : 'Video prompt *'}
                  </label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    rows={5}
                    placeholder={lvl <= 1
                      ? 'e.g. A young girl in a school uniform walking through a sunny market, colourful cloth stalls, warm light, happy feeling'
                      : 'e.g. A young girl in a blue school uniform walking through a sunlit Nigerian market at golden hour, slow tracking shot, colourful fabric stalls in the background, warm cinematic light, joyful expression'}
                    className="w-full bg-paper border border-hair rounded-xl px-3 py-2.5 text-sm text-ink placeholder-gray-600 resize-y outline-none focus:border-accent transition-colors leading-relaxed" />
                  <p className="text-[9px] text-muted mt-0.5">Ctrl+Enter to generate</p>
                </div>

                {/* Duration */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'How long?' : 'Duration'}
                  </label>
                  <div className="flex gap-2">
                    {([5, 8, 10] as const).map(d => (
                      <button key={d} onClick={() => setDuration(d)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${duration === d ? 'bg-accent/10 border-accent/40 text-accent' : 'border-hair text-muted hover:border-accent/30 hover:text-body'}`}>
                        {d}s
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-muted mt-0.5">{lvl <= 1 ? 'Longer takes more time (30–90 sec).' : 'Longer generation takes more time (~30–90s).'}</p>
                </div>

                {/* Advanced */}
                <div>
                  <button onClick={() => setShowAdvanced(a => !a)} className="flex items-center gap-1 text-[10px] text-muted hover:text-body transition-colors">
                    {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {lvl <= 1 ? 'Show negative words' : 'Advanced: negative prompt'}
                  </button>
                  {showAdvanced && (
                    <textarea value={negPrompt} onChange={e => setNegPrompt(e.target.value)} rows={2}
                      className="mt-1.5 w-full bg-paper border border-hair rounded-lg px-2.5 py-2 text-xs text-body placeholder-gray-600 resize-none outline-none focus:border-accent"
                      placeholder="low quality, blurry, distorted…" />
                  )}
                </div>

                {/* Processing indicator */}
                {processingVideos.length > 0 && (
                  <div className="flex items-center gap-2 p-2.5 bg-accent/10 border border-accent/20 rounded-lg">
                    <Loader2 size={12} className="animate-spin text-accent flex-shrink-0" />
                    <p className="text-xs text-accent">{processingVideos.length} video{processingVideos.length > 1 ? 's' : ''} generating… please wait</p>
                  </div>
                )}

                {/* Assessment criteria accordion */}
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
                            className="w-full flex items-center gap-2 px-3 py-2 bg-card hover:bg-paper text-left transition-colors">
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
                                  { level: 0, text: a.certification_level0_metric, color: 'text-red-700' },
                                  { level: 1, text: a.certification_level1_metric, color: 'text-yellow-700' },
                                  { level: 2, text: a.certification_level2_metric, color: 'text-blue-700' },
                                  { level: 3, text: a.certification_level3_metric, color: 'text-accent' },
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

              {/* Generate button */}
              <div className="flex-shrink-0 px-4 pb-4 pt-2">
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors disabled:opacity-40">
                  {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />}
                  {isGenerating ? (lvl <= 1 ? 'Starting…' : 'Starting generation…') : (lvl <= 1 ? 'Make My Video 🎬' : 'Generate Video')}
                </button>
              </div>
            </div>

            {/* ── Right: Video portfolio ────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Portfolio header */}
              <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-hair flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Film size={13} className="text-accent" />
                  <span className="text-xs font-semibold text-body">Video Portfolio</span>
                  <span className="text-[10px] text-muted">{succeededVideos.length} complete · {processingVideos.length} generating · {videos.length} total</span>
                </div>
                <div className="flex items-center gap-2">
                  {succeededVideos.length > 0 && (
                    <span className="text-[10px] text-muted">
                      {lvl <= 1 ? 'Add more videos to improve your score.' : 'Generate more to demonstrate iteration.'}
                    </span>
                  )}
                  <button onClick={handleEvaluate} disabled={isEvaluating || succeededVideos.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-lg disabled:opacity-40 transition-colors">
                    {isEvaluating ? <Loader2 size={11} className="animate-spin" /> : <Award size={11} />}
                    {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit'}
                  </button>
                </div>
              </div>

              {/* Portfolio body */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {videos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-3">
                    <Film size={48} className="text-muted" />
                    <p className="text-muted text-sm font-medium">
                      {lvl <= 1 ? 'Your videos will appear here.' : 'Your video portfolio will build up here as you generate.'}
                    </p>
                    <div className="max-w-xs space-y-1 text-xs text-muted">
                      <p>💡 {lvl <= 1 ? 'Write a description and click Make My Video.' : 'Write a detailed prompt with purpose, then generate.'}</p>
                      <p>🔄 {lvl <= 1 ? 'Try the same idea again with more words to improve it.' : 'Iterate on prompts — multiple attempts on a theme demonstrate refinement.'}</p>
                      <p>🎬 {lvl <= 1 ? 'Videos take about 2–5 minutes to make.' : 'Generation takes 2–5 minutes via Wan 2.1.'}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Quick stats bar */}
                    {videos.length > 1 && (
                      <div className="flex items-center gap-3 p-2.5 bg-surface border border-hair rounded-lg text-xs text-muted">
                        <span className="text-accent font-bold">{succeededVideos.length}</span> complete
                        <span className="text-muted">·</span>
                        <span className="text-yellow-700 font-bold">{Object.values(promptGroupCount).filter(c => c > 1).length}</span> iterated themes
                        <span className="text-muted">·</span>
                        <span className="text-accent font-bold">{videos.filter(v => v.purpose.trim()).length}</span> with purpose stated
                      </div>
                    )}
                    {videos.map(v => (
                      <VideoCard key={v.id} entry={v} onDelete={handleDeleteVideo} />
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
            {renderVoiceBar(
              anyScored
                ? `Your AI Video Production results. Overall average: ${overallAvg?.toFixed(1)} out of 3.`
                : 'Submit your video portfolio for evaluation to see results.'
            )}

            {!anyScored ? (
              <div className="text-center py-16 space-y-4">
                <ClipboardList size={48} className="text-muted mx-auto" />
                <p className="text-muted">{lvl <= 1 ? 'You have not been evaluated yet. Go to the Build view and make some videos first.' : 'No evaluation data yet. Generate videos and submit for evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-ink font-bold rounded-xl transition-colors">
                  <Film size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Overall */}
                <div className="flex items-center gap-5 p-5 bg-surface border border-hair rounded-2xl">
                  <Trophy size={40} className="text-yellow-700 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted uppercase font-bold">Overall Score</p>
                    <p className="text-4xl font-black text-ink">{overallAvg?.toFixed(1)}<span className="text-lg font-normal text-muted">/3.0</span></p>
                    <p className={`text-sm font-bold mt-0.5 ${allProficient ? 'text-accent' : 'text-yellow-700'}`}>
                      {allProficient ? '🏆 Proficiency Achieved — Certificate Eligible' : `${assessmentScores.filter(s => (s.score ?? 0) >= 2).length}/${assessmentScores.length} criteria at Proficient or above`}
                    </p>
                  </div>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-ink font-bold rounded-xl transition-colors text-sm">
                      <Award size={16} /> Get Certificate
                    </button>
                  )}
                </div>

                {/* Per-criterion */}
                <div className="space-y-3">
                  {assessmentScores.map(sc => {
                    const assessment = assessments.find(a => a.assessment_name === sc.assessment_name);
                    const sl = scoreLabel(sc.score);
                    const isOpen = expandedCrit === sc.assessment_name;
                    return (
                      <div key={sc.assessment_name} className={`rounded-xl border overflow-hidden ${sl.border} ${sl.bg}`}>
                        <button onClick={() => setExpandedCrit(isOpen ? null : sc.assessment_name)}
                          className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-black/[0.02] transition-colors">
                          <ScoreRing score={sc.score} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-ink">{sc.assessment_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs font-bold ${sl.color}`}>{sl.text}</span>
                              <div className="h-1.5 w-24 bg-hair rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${sc.score === 3 ? 'bg-green-600' : sc.score === 2 ? 'bg-blue-500' : sc.score === 1 ? 'bg-amber-500' : 'bg-red-500'}`}
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
                                    { level: 0, text: assessment.certification_level0_metric, color: 'text-red-700' },
                                    { level: 1, text: assessment.certification_level1_metric, color: 'text-yellow-700' },
                                    { level: 2, text: assessment.certification_level2_metric, color: 'text-blue-700' },
                                    { level: 3, text: assessment.certification_level3_metric, color: 'text-accent' },
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
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-accent border border-accent/30 bg-accent/10 hover:bg-accent/10 rounded-xl transition-colors">
                    <Film size={15} /> Keep Building
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || succeededVideos.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-ink rounded-xl transition-colors disabled:opacity-50">
                    {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isEvaluating ? 'Re-evaluating…' : 'Re-evaluate'}
                  </button>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-ink rounded-xl transition-colors ml-auto">
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
                <XCircle size={48} className="text-yellow-700 mx-auto" />
                <h2 className="text-lg font-bold text-ink">{lvl <= 1 ? 'Not ready for the certificate yet.' : 'Certificate Not Yet Available'}</h2>
                <p className="text-muted text-sm max-w-sm mx-auto">
                  {lvl <= 1 ? 'You need Proficient (2/3) in all criteria. Keep making videos and improving your prompts.' : 'A Proficient score (2+) on all criteria is required. Generate more videos, iterate on prompts, and re-evaluate.'}
                </p>
                <button onClick={() => setView('results')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-ink font-bold rounded-xl transition-colors">
                  <BarChart3 size={16} /> View Results
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {renderVoiceBar(lvl <= 1
                  ? 'Congratulations! You passed the AI Video Production Certification. Enter your name to download your certificate.'
                  : 'Congratulations on passing the AI Video Production Certification.')}

                {/* Certificate preview */}
                <div className="p-6 bg-surface border border-hair rounded-2xl text-center space-y-4 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #06b6d4 0, #06b6d4 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
                  <div className="relative">
                    <div className="flex justify-center mb-3"><Trophy size={44} className="text-yellow-700" /></div>
                    <p className="text-xs font-bold text-accent uppercase tracking-widest">Certificate of Achievement</p>
                    <p className="text-lg font-bold text-ink mt-1">AI Video Production Certification</p>
                    <p className="text-accent text-sm">Wan 2.1 · {scoreLabel(Math.min(...assessmentScores.map(s => s.score ?? 0))).text} Level · {succeededVideos.length} video{succeededVideos.length !== 1 ? 's' : ''} produced</p>
                    <div className="my-4 h-px bg-hair" />
                    <p className="text-muted text-xs">Awarded to</p>
                    <p className="text-2xl font-bold text-ink mt-1">{certName || '[ Your Name ]'}</p>
                    <p className="text-muted text-xs mt-1">{branding.institutionName}</p>
                    <div className="my-4 h-px bg-hair" />
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
                    <label className="text-xs font-bold text-muted uppercase block mb-1.5">
                      {lvl <= 1 ? 'Your full name (for the certificate):' : 'Full name for the certificate:'}
                    </label>
                    <input type="text" value={certName} onChange={e => setCertName(e.target.value)}
                      placeholder="e.g. Amara Okoye"
                      className="w-full bg-card border border-hair rounded-xl px-4 py-3 text-ink placeholder-gray-600 text-sm outline-none focus:border-accent transition-colors" />
                  </div>
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-all hover:scale-[1.01] shadow-lg disabled:opacity-50 disabled:scale-100">
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

export default AIVideoProductionCertificationPage;