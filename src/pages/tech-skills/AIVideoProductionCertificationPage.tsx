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
import { useAuth } from '../../hooks/useAuth';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import { useBranding, addBrandingToPDF } from '../../lib/useBranding';
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
  if (s === null) return { text: 'Not assessed', color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' };
  if (s === 3)    return { text: 'Advanced',     color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'    };
  if (s === 1)    return { text: 'Emerging',     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   };
  return             { text: 'No Evidence',  color: 'text-red-400',    bg: 'bg-red-500/10',     border: 'border-red-500/30'     };
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
  const color = score === null ? '#4b5563' : score >= 2 ? '#10b981' : score === 1 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={44} height={44} viewBox="0 0 44 44">
      <circle cx={22} cy={22} r={r} fill="none" stroke="#1f2937" strokeWidth={4} />
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
  const statusColor = entry.status === 'succeeded' ? 'text-emerald-400' : entry.status === 'failed' ? 'text-red-400' : 'text-cyan-400';
  const statusIcon  = entry.status === 'succeeded' ? '✅' : entry.status === 'failed' ? '❌' : '⚡';
  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden bg-gray-800/40">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors">
        <span className={`text-sm flex-shrink-0 ${statusColor}`}>{statusIcon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-200 truncate font-medium">{entry.prompt}</p>
          {entry.purpose && <p className="text-[10px] text-gray-500 truncate">Purpose: {entry.purpose}</p>}
        </div>
        <span className="text-[10px] text-gray-600 flex-shrink-0">{entry.duration}s · #{entry.iteration}</span>
        {expanded ? <ChevronUp size={12} className="text-gray-500 flex-shrink-0" /> : <ChevronDown size={12} className="text-gray-500 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-700 pt-2">
          {entry.status === 'succeeded' && entry.videoUrl && (
            <video src={entry.videoUrl} controls className="w-full rounded-lg max-h-44 bg-black" />
          )}
          {entry.status === 'processing' && (
            <div className="flex items-center gap-2 text-xs text-cyan-400 py-2">
              <Loader2 size={13} className="animate-spin" /> Generating video… please wait
            </div>
          )}
          {entry.status === 'failed' && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1.5">Generation failed.</p>
          )}
          <div className="space-y-1 text-[10px] text-gray-400">
            <p><span className="text-gray-600">Full prompt:</span> {entry.prompt}</p>
            {entry.negativePrompt && <p><span className="text-gray-600">Negative:</span> {entry.negativePrompt}</p>}
          </div>
          <div className="flex gap-2">
            {entry.videoUrl && (
              <a href={entry.videoUrl} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white rounded px-2 py-1 transition-colors">
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
    <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-800/40 border border-gray-700 rounded-xl mb-4">
      <span className="text-xs font-semibold text-gray-400 flex items-center gap-1"><Volume2 size={13} className="text-cyan-400" /> Voice:</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-600">
        {(['english', 'pidgin'] as const).map(m => (
          <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all border-r border-gray-600 last:border-0 ${voiceMode === m ? (m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}>
            {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
          </button>
        ))}
      </div>
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${isSpeaking ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20'}`}>
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
      await supabase.from('dashboard').insert({
        user_id: user.id, activity: CERT_ACTIVITY,
        category_activity: 'Certification', progress: 'started',
        web_dev_session_id: sid, video_prompt: sessionName,
        video_chat_history: [], web_dev_evaluation: {},
      });
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
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) { alert('PDF generation not available.'); return; }
      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      const minScore  = Math.min(...assessmentScores.map(s => s.score ?? 0));
      const certLevel = minScore === 3 ? 'Advanced' : minScore >= 2 ? 'Proficient' : 'Emerging';
      const avg       = assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length;

      // Borders — cyan/teal theme for video
      doc.setLineWidth(3); doc.setDrawColor(6, 182, 212); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(20, 184, 166); doc.rect(15, 15, W - 30, H - 30);

      // Header
      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(6, 182, 212);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });
      doc.setFontSize(20); doc.setTextColor(20, 184, 166);
      doc.text(`AI Video Production Certification — ${certLevel}`, W / 2, 43, { align: 'center' });
      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

      // Name
      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the AI Video Production Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to design, generate, and iterate on AI-powered video content', W / 2, 95, { align: 'center' });
      doc.text('using text-to-video prompt engineering and creative direction.', W / 2, 102, { align: 'center' });

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(6, 182, 212);
      doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel} · ${succeededVideos.length} video${succeededVideos.length !== 1 ? 's' : ''} produced`, W / 2, 112, { align: 'center' });

      // Criteria
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
      doc.text('Assessment Competencies:', 20, 122);

      const cols = assessmentScores.length <= 4 ? 2 : 3;
      const colW = (W - 40) / cols;
      let yPos = 128; let col = 0;

      assessmentScores.forEach((sc, i) => {
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

      // Footer
      const footerY = H - 22;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130);
      doc.text(`Awarded: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 20, footerY);
      doc.text(`${branding.institutionName} Programme`, W / 2, footerY, { align: 'center' });
      doc.text(`Certification ID: VID-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-VideoProduction-Certificate.pdf`);
    } catch (err) { console.error('Certificate error:', err); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, succeededVideos.length, branding]);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex flex-col h-screen bg-gray-900">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={36} className="animate-spin text-cyan-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <Navbar />

      {/* Voice fallback — fixed overlay when TTS unavailable (e.g. no network voice in Nigeria) */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>

        {/* ── Toolbar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Film size={18} className="text-cyan-400" />
              <span className="text-sm font-bold text-white">AI Video Production Certification</span>
            </div>
            {view !== 'overview' && (
              <>
                <div className="w-px h-5 bg-gray-600" />
                <input className="text-sm text-gray-300 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-cyan-500 outline-none px-1 py-0.5 w-44"
                  value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Project name…" />
              </>
            )}
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors
                    ${view === v ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'text-gray-600 border-gray-700 hover:text-gray-300 hover:border-gray-500'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '🎬 Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex rounded-lg overflow-hidden border border-gray-600">
              {(['english', 'pidgin'] as const).map(m => (
                <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
                  className={`px-2 py-1.5 text-xs font-bold transition-all border-r border-gray-600 last:border-0 ${voiceMode === m ? (m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}>
                  {m === 'english' ? '🇬🇧' : '🇳🇬'}
                </button>
              ))}
            </div>
            {view === 'build' && (
              <button onClick={handleEvaluate}
                disabled={isEvaluating || succeededVideos.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white rounded-lg transition-colors shadow disabled:opacity-50">
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
              ? 'Welcome to the AI Video Production Certification. You will create AI videos using prompts, then be evaluated on how well you did it.'
              : 'Welcome to the AI Video Production Certification. You will generate a portfolio of AI videos using Wan 2.1, demonstrating prompt engineering skill, creative direction, and iterative refinement.')}

            {/* Hero */}
            <div className="p-6 bg-gradient-to-br from-cyan-600/20 via-teal-600/15 to-blue-600/10 border border-cyan-500/30 rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-cyan-600/30 rounded-xl"><Film size={24} className="text-cyan-300" /></div>
                <div>
                  <h1 className="text-xl font-bold text-white">AI Video Production Certification</h1>
                  <p className="text-cyan-300 text-sm">Wan 2.1 · Text-to-Video · Prompt Engineering</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="Wan 2.1 · Text-to-Video · Prompt Engineering"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you create AI videos by writing descriptions of what you want to see. You will be judged on how well you describe your videos, whether they have a clear purpose, and how much you improved them by trying again.'
                  : 'Demonstrate your AI video production skills by building a portfolio of Wan 2.1 generated clips. Your work is evaluated on prompt quality, visual storytelling, iteration, technical understanding of cinematography concepts, and creative direction.'}
              </p>
            </div>

            {/* What is evaluated */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">💡 How the evaluation works</p>
              <p className="text-sm text-gray-300 leading-relaxed">
                {lvl <= 1
                  ? "Your AI prompts and your video portfolio are evaluated — not the video itself, which AI creates. The better and more specific your descriptions, the higher your score. Try the same idea more than once to show improvement."
                  : "Evaluation is based on your written prompts and creative process — not the raw video output, which is AI-generated. The evaluator analyses: how precise your prompts are, whether you state a clear purpose for each video, how you iterate and improve across attempts, and whether your prompts demonstrate understanding of cinematography (camera angles, lighting, movement, composition)."}
              </p>
            </div>

            {/* Rules */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">📋 Certification Guidelines</p>
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
                    <span className="text-gray-300">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Prompt tips */}
            <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl mb-5">
              <p className="text-xs font-bold text-cyan-400 uppercase mb-2">🎬 Prompt tip — what makes a great video prompt?</p>
              <div className="space-y-1.5 text-xs text-gray-400">
                <div className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0 font-bold">✗ Weak:</span>
                  <span className="italic">"A girl walking."</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 flex-shrink-0 font-bold">✓ Strong:</span>
                  <span className="italic">"A young girl in a blue school uniform walking through a sunlit Nigerian market at golden hour, slow tracking shot, colourful fabric stalls in the background, warm cinematic light, joyful expression."</span>
                </div>
                <p className="text-gray-500 mt-2">Strong prompts include: <span className="text-gray-300">subject · setting · lighting · camera movement · mood · time of day</span></p>
              </div>
            </div>

            {/* Assessment criteria */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">🎯 What You Will Be Evaluated On</p>
              {assessments.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Loading criteria…</p>
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
                            <p className="text-sm font-semibold text-white">{a.assessment_name}</p>
                            {sc?.score !== null && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sl.bg} ${sl.color} ${sl.border}`}>{sl.text}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">{a.description || a.certification_prompt.slice(0, 120) + '…'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {anyScored && overallAvg !== null && (
              <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl mb-5 flex items-center gap-4">
                <Trophy size={28} className="text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold">Your current score</p>
                  <p className="text-2xl font-black text-white">{overallAvg.toFixed(1)}<span className="text-base font-normal text-gray-500">/3.0</span></p>
                </div>
                {allProficient && (
                  <span className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    🏆 Eligible for Certificate
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white rounded-xl transition-all hover:scale-[1.01] shadow-lg">
                {succeededVideos.length > 0 ? <><RefreshCw size={16} /> Continue Making Videos</> : <><Film size={16} /> Start Making Videos</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-xl transition-colors">
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
            <div className="w-80 flex-shrink-0 flex flex-col bg-[#1a1d23] border-r border-gray-700 overflow-hidden">

              {/* Prompt header */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-cyan-500/30 bg-cyan-500/10">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-cyan-400" />
                  <p className="text-sm font-bold text-cyan-300">Video Prompt</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {lvl <= 1 ? 'Describe the video you want to make.' : 'Write a detailed text-to-video prompt. Include subject, setting, lighting, camera, mood.'}
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

                {/* Purpose input */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Why are you making this video? *' : 'Purpose / Creative brief *'}
                  </label>
                  <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
                    placeholder={lvl <= 1 ? 'e.g. To show solar energy helping our village' : 'e.g. Documentary segment on solar energy in Oloibiri'}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500 transition-colors" />
                  <p className="text-[9px] text-gray-600 mt-0.5">{lvl <= 1 ? 'This helps show your creative thinking.' : 'Stating a clear purpose is part of your evaluation.'}</p>
                </div>

                {/* Main prompt */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Describe your video *' : 'Video prompt *'}
                  </label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    rows={5}
                    placeholder={lvl <= 1
                      ? 'e.g. A young girl in a school uniform walking through a sunny market, colourful cloth stalls, warm light, happy feeling'
                      : 'e.g. A young girl in a blue school uniform walking through a sunlit Nigerian market at golden hour, slow tracking shot, colourful fabric stalls in the background, warm cinematic light, joyful expression'}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-cyan-500 transition-colors leading-relaxed" />
                  <p className="text-[9px] text-gray-700 mt-0.5">Ctrl+Enter to generate</p>
                </div>

                {/* Duration */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'How long?' : 'Duration'}
                  </label>
                  <div className="flex gap-2">
                    {([5, 8, 10] as const).map(d => (
                      <button key={d} onClick={() => setDuration(d)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${duration === d ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'}`}>
                        {d}s
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-600 mt-0.5">{lvl <= 1 ? 'Longer takes more time (30–90 sec).' : 'Longer generation takes more time (~30–90s).'}</p>
                </div>

                {/* Advanced */}
                <div>
                  <button onClick={() => setShowAdvanced(a => !a)} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                    {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {lvl <= 1 ? 'Show negative words' : 'Advanced: negative prompt'}
                  </button>
                  {showAdvanced && (
                    <textarea value={negPrompt} onChange={e => setNegPrompt(e.target.value)} rows={2}
                      className="mt-1.5 w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-300 placeholder-gray-600 resize-none outline-none focus:border-cyan-500"
                      placeholder="low quality, blurry, distorted…" />
                  )}
                </div>

                {/* Processing indicator */}
                {processingVideos.length > 0 && (
                  <div className="flex items-center gap-2 p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <Loader2 size={12} className="animate-spin text-cyan-400 flex-shrink-0" />
                    <p className="text-xs text-cyan-300">{processingVideos.length} video{processingVideos.length > 1 ? 's' : ''} generating… please wait</p>
                  </div>
                )}

                {/* Assessment criteria accordion */}
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
                    <ClipboardList size={11} /> Rubric Criteria
                  </p>
                  <div className="space-y-1.5">
                    {assessments.map(a => {
                      const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                      const isOpen = expandedCrit === a.certification_id;
                      const sl = scoreLabel(sc?.score ?? null);
                      return (
                        <div key={a.certification_id} className={`rounded-lg border overflow-hidden ${isOpen ? 'border-cyan-500/40' : 'border-gray-700'}`}>
                          <button onClick={() => setExpandedCrit(isOpen ? null : a.certification_id)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800/60 hover:bg-gray-700/60 text-left transition-colors">
                            <ScoreRing score={sc?.score ?? null} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{a.assessment_name}</p>
                              {sc?.score !== null && <span className={`text-[9px] font-bold ${sl.color}`}>{sl.text}</span>}
                            </div>
                            {isOpen ? <ChevronUp size={12} className="text-gray-500 flex-shrink-0" /> : <ChevronDown size={12} className="text-gray-500 flex-shrink-0" />}
                          </button>
                          {isOpen && (
                            <div className="px-3 py-2.5 bg-gray-900/60 border-t border-gray-700 space-y-2">
                              <p className="text-[10px] text-gray-400 leading-relaxed">{a.description}</p>
                              <div className="space-y-1">
                                {[
                                  { level: 0, text: a.certification_level0_metric, color: 'text-red-400' },
                                  { level: 1, text: a.certification_level1_metric, color: 'text-amber-400' },
                                  { level: 2, text: a.certification_level2_metric, color: 'text-blue-400' },
                                  { level: 3, text: a.certification_level3_metric, color: 'text-emerald-400' },
                                ].map(({ level, text, color }) => (
                                  <div key={level} className={`flex items-start gap-1.5 text-[10px] ${color}`}>
                                    <span className="font-bold flex-shrink-0">L{level}:</span>
                                    <span className="text-gray-400">{text}</span>
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
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white rounded-xl transition-colors disabled:opacity-40">
                  {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />}
                  {isGenerating ? (lvl <= 1 ? 'Starting…' : 'Starting generation…') : (lvl <= 1 ? 'Make My Video 🎬' : 'Generate Video')}
                </button>
              </div>
            </div>

            {/* ── Right: Video portfolio ────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Portfolio header */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Film size={13} className="text-cyan-400" />
                  <span className="text-xs font-semibold text-gray-300">Video Portfolio</span>
                  <span className="text-[10px] text-gray-600">{succeededVideos.length} complete · {processingVideos.length} generating · {videos.length} total</span>
                </div>
                <div className="flex items-center gap-2">
                  {succeededVideos.length > 0 && (
                    <span className="text-[10px] text-gray-500">
                      {lvl <= 1 ? 'Add more videos to improve your score.' : 'Generate more to demonstrate iteration.'}
                    </span>
                  )}
                  <button onClick={handleEvaluate} disabled={isEvaluating || succeededVideos.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                    {isEvaluating ? <Loader2 size={11} className="animate-spin" /> : <Award size={11} />}
                    {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit'}
                  </button>
                </div>
              </div>

              {/* Portfolio body */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {videos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-3">
                    <Film size={48} className="text-gray-700" />
                    <p className="text-gray-500 text-sm font-medium">
                      {lvl <= 1 ? 'Your videos will appear here.' : 'Your video portfolio will build up here as you generate.'}
                    </p>
                    <div className="max-w-xs space-y-1 text-xs text-gray-600">
                      <p>💡 {lvl <= 1 ? 'Write a description and click Make My Video.' : 'Write a detailed prompt with purpose, then generate.'}</p>
                      <p>🔄 {lvl <= 1 ? 'Try the same idea again with more words to improve it.' : 'Iterate on prompts — multiple attempts on a theme demonstrate refinement.'}</p>
                      <p>🎬 {lvl <= 1 ? 'Videos take about 2–5 minutes to make.' : 'Generation takes 2–5 minutes via Wan 2.1.'}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Quick stats bar */}
                    {videos.length > 1 && (
                      <div className="flex items-center gap-3 p-2.5 bg-gray-800/40 border border-gray-700 rounded-lg text-xs text-gray-400">
                        <span className="text-cyan-400 font-bold">{succeededVideos.length}</span> complete
                        <span className="text-gray-600">·</span>
                        <span className="text-amber-400 font-bold">{Object.values(promptGroupCount).filter(c => c > 1).length}</span> iterated themes
                        <span className="text-gray-600">·</span>
                        <span className="text-violet-400 font-bold">{videos.filter(v => v.purpose.trim()).length}</span> with purpose stated
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
                <ClipboardList size={48} className="text-gray-600 mx-auto" />
                <p className="text-gray-400">{lvl <= 1 ? 'You have not been evaluated yet. Go to the Build view and make some videos first.' : 'No evaluation data yet. Generate videos and submit for evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition-colors">
                  <Film size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Overall */}
                <div className="flex items-center gap-5 p-5 bg-gradient-to-br from-cyan-600/20 to-teal-600/10 border border-cyan-500/30 rounded-2xl">
                  <Trophy size={40} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 uppercase font-bold">Overall Score</p>
                    <p className="text-4xl font-black text-white">{overallAvg?.toFixed(1)}<span className="text-lg font-normal text-gray-500">/3.0</span></p>
                    <p className={`text-sm font-bold mt-0.5 ${allProficient ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {allProficient ? '🏆 Proficiency Achieved — Certificate Eligible' : `${assessmentScores.filter(s => (s.score ?? 0) >= 2).length}/${assessmentScores.length} criteria at Proficient or above`}
                    </p>
                  </div>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors text-sm">
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
                          className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors">
                          <ScoreRing score={sc.score} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white">{sc.assessment_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs font-bold ${sl.color}`}>{sl.text}</span>
                              <div className="h-1.5 w-24 bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${sc.score === 3 ? 'bg-emerald-500' : sc.score === 2 ? 'bg-blue-500' : sc.score === 1 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${((sc.score ?? 0) / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-white/10 pt-3 space-y-3">
                            {sc.evidence && (
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Evidence</p>
                                <p className="text-xs text-gray-300 leading-relaxed">{sc.evidence}</p>
                              </div>
                            )}
                            {assessment && (
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Rubric</p>
                                <div className="space-y-1">
                                  {[
                                    { level: 0, text: assessment.certification_level0_metric, color: 'text-red-400' },
                                    { level: 1, text: assessment.certification_level1_metric, color: 'text-amber-400' },
                                    { level: 2, text: assessment.certification_level2_metric, color: 'text-blue-400' },
                                    { level: 3, text: assessment.certification_level3_metric, color: 'text-emerald-400' },
                                  ].map(({ level, text, color }) => (
                                    <div key={level} className={`flex gap-1.5 text-[10px] ${sc.score === level ? color : 'text-gray-600'}`}>
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
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-xl transition-colors">
                    <Film size={15} /> Keep Building
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || succeededVideos.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl transition-colors disabled:opacity-50">
                    {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isEvaluating ? 'Re-evaluating…' : 'Re-evaluate'}
                  </button>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors ml-auto">
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
                <h2 className="text-lg font-bold text-white">{lvl <= 1 ? 'Not ready for the certificate yet.' : 'Certificate Not Yet Available'}</h2>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                  {lvl <= 1 ? 'You need Proficient (2/3) in all criteria. Keep making videos and improving your prompts.' : 'A Proficient score (2+) on all criteria is required. Generate more videos, iterate on prompts, and re-evaluate.'}
                </p>
                <button onClick={() => setView('results')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition-colors">
                  <BarChart3 size={16} /> View Results
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {renderVoiceBar(lvl <= 1
                  ? 'Congratulations! You passed the AI Video Production Certification. Enter your name to download your certificate.'
                  : 'Congratulations on passing the AI Video Production Certification.')}

                {/* Certificate preview */}
                <div className="p-6 bg-gradient-to-br from-cyan-900/40 via-teal-900/30 to-blue-900/20 border-2 border-cyan-500/40 rounded-2xl text-center space-y-4 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #06b6d4 0, #06b6d4 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
                  <div className="relative">
                    <div className="flex justify-center mb-3"><Trophy size={44} className="text-amber-400" /></div>
                    <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Certificate of Achievement</p>
                    <p className="text-lg font-bold text-white mt-1">AI Video Production Certification</p>
                    <p className="text-cyan-300 text-sm">Wan 2.1 · {scoreLabel(Math.min(...assessmentScores.map(s => s.score ?? 0))).text} Level · {succeededVideos.length} video{succeededVideos.length !== 1 ? 's' : ''} produced</p>
                    <div className="my-4 h-px bg-cyan-500/30" />
                    <p className="text-gray-400 text-xs">Awarded to</p>
                    <p className="text-2xl font-bold text-white mt-1">{certName || '[ Your Name ]'}</p>
                    <p className="text-gray-400 text-xs mt-1">{branding.institutionName}</p>
                    <div className="my-4 h-px bg-cyan-500/30" />
                    <div className="grid grid-cols-2 gap-2 text-left">
                      {assessmentScores.map(sc => {
                        const sl = scoreLabel(sc.score);
                        return (
                          <div key={sc.assessment_name} className={`px-2.5 py-1.5 rounded-lg border text-xs ${sl.bg} ${sl.border}`}>
                            <p className={`font-bold ${sl.color}`}>{sc.assessment_name}</p>
                            <p className="text-gray-400">{sc.score}/3 — {sl.text}</p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-3">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">
                      {lvl <= 1 ? 'Your full name (for the certificate):' : 'Full name for the certificate:'}
                    </label>
                    <input type="text" value={certName} onChange={e => setCertName(e.target.value)}
                      placeholder="e.g. Amara Okoye"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl transition-all hover:scale-[1.01] shadow-lg disabled:opacity-50 disabled:scale-100">
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