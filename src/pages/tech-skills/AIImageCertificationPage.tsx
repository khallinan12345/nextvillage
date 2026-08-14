// src/pages/tech-skills/AIImageCertificationPage.tsx
//
// AI Image Creation Certification
// Framework: mirrors AIVideoProductionCertificationPage
// Build environment: FLUX Schnell via Replicate (blocking, ~2-4s, no polling)
//                   — reuses the generate-image Supabase Edge Function
//
// Dashboard columns used:
//   image_cert_session_id (text)  — new
//   image_cert_evaluation (jsonb) — new (scores per criterion)
//   image_chat_history (jsonb)    — stores the image portfolio array
//   image_prompt (text)           — stores session name
// Activity stored as: 'AI Image Creation Certification'

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
  ImagePlus, Award, Trophy, XCircle, Loader2,
  Download, AlertCircle, Volume2, VolumeX,
  ChevronDown, ChevronUp, ClipboardList,
  RefreshCw, Trash2, Star, Sparkles,
  BarChart3, Wand2, LayoutGrid, Maximize2,
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

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

interface ImageEntry {
  id: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  style: string;
  purpose: string;
  imageUrl: string | null;
  status: 'generating' | 'succeeded' | 'failed';
  iteration: number;
  createdAt: string;
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'AI Image Creation';
const CERT_ACTIVITY = 'AI Image Creation Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const ASPECT_RATIOS: { id: AspectRatio; label: string; w: number; h: number }[] = [
  { id: '1:1',  label: '1:1 Square',    w: 1024, h: 1024 },
  { id: '16:9', label: '16:9 Wide',     w: 1344, h: 768  },
  { id: '9:16', label: '9:16 Portrait', w: 768,  h: 1344 },
  { id: '4:3',  label: '4:3 Landscape', w: 1152, h: 896  },
  { id: '3:4',  label: '3:4 Portrait',  w: 896,  h: 1152 },
];

const IMAGE_STYLES = [
  'Photorealistic', 'Cinematic', 'Digital art', 'Watercolour',
  'Oil painting', 'Sketch', 'Anime', 'Minimalist', 'Abstract',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-muted', bg: 'bg-gray-100', border: 'border-gray-300' };
  if (s === 3)    return { text: 'Advanced',     color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-300' };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-700',    bg: 'bg-blue-100',    border: 'border-blue-300'    };
  if (s === 1)    return { text: 'Emerging',     color: 'text-yellow-700',   bg: 'bg-yellow-100',   border: 'border-yellow-300'   };
  return               { text: 'No Evidence',  color: 'text-red-700',    bg: 'bg-red-100',     border: 'border-red-300'     };
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

// ─── Image Card ───────────────────────────────────────────────────────────────

const ImageCard: React.FC<{ entry: ImageEntry; onDelete: (id: string) => void }> = ({ entry, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      {lightbox && entry.imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(false)}>
          <img src={entry.imageUrl} alt={entry.prompt} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
        </div>
      )}
      <div className="border border-hair rounded-xl overflow-hidden bg-surface">
        <div className="flex items-center gap-3 px-3 py-2.5">
          {/* Thumbnail */}
          <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-hair">
            {entry.status === 'generating' && (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={16} className="animate-spin text-accent" />
              </div>
            )}
            {entry.status === 'succeeded' && entry.imageUrl && (
              <img src={entry.imageUrl} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setLightbox(true)} />
            )}
            {entry.status === 'failed' && (
              <div className="w-full h-full flex items-center justify-center text-red-700 text-xs">✗</div>
            )}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-body truncate font-medium">{entry.prompt}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {entry.purpose && <p className="text-[10px] text-muted truncate">Purpose: {entry.purpose}</p>}
              <span className="text-[10px] text-muted flex-shrink-0">{entry.aspectRatio} · #{entry.iteration}</span>
              {entry.style && <span className="text-[10px] text-accent flex-shrink-0">{entry.style}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {entry.imageUrl && (
              <button onClick={() => setLightbox(true)} className="p-1.5 text-muted hover:text-body transition-colors">
                <Maximize2 size={11} />
              </button>
            )}
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-muted hover:text-body">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>
        {expanded && (
          <div className="px-3 pb-3 space-y-2 border-t border-hair pt-2">
            {entry.status === 'succeeded' && entry.imageUrl && (
              <img src={entry.imageUrl} alt={entry.prompt} className="w-full rounded-lg object-cover max-h-48 cursor-pointer" onClick={() => setLightbox(true)} />
            )}
            {entry.status === 'generating' && (
              <div className="flex items-center gap-2 text-xs text-accent py-2">
                <Loader2 size={13} className="animate-spin" /> Generating image…
              </div>
            )}
            {entry.status === 'failed' && (
              <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">Generation failed.</p>
            )}
            <div className="space-y-0.5 text-[10px] text-muted">
              <p><span className="text-muted">Prompt:</span> {entry.prompt}</p>
              {entry.negativePrompt && <p><span className="text-muted">Negative:</span> {entry.negativePrompt}</p>}
              {entry.style && <p><span className="text-muted">Style:</span> {entry.style}</p>}
            </div>
            <div className="flex gap-2">
              {entry.imageUrl && (
                <a href={entry.imageUrl} download target="_blank" rel="noopener noreferrer"
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
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const AIImageCertificationPage: React.FC = () => {
  const { user } = useAuth();

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
  const [sessionName,    setSessionName]    = useState('My Image Portfolio');
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Image portfolio ───────────────────────────────────────────────────
  const [images,         setImages]         = useState<ImageEntry[]>([]);

  // ── Generation form ───────────────────────────────────────────────────
  const [prompt,         setPrompt]         = useState('');
  const [negPrompt,      setNegPrompt]      = useState('blurry, distorted, low quality, watermark, text');
  const [aspectRatio,    setAspectRatio]    = useState<AspectRatio>('1:1');
  const [style,          setStyle]          = useState('');
  const [purpose,        setPurpose]        = useState('');
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [genError,       setGenError]       = useState<string | null>(null);
  const [showAdvanced,   setShowAdvanced]   = useState(false);

  // ── Iteration tracking ────────────────────────────────────────────────
  const [promptGroupCount, setPromptGroupCount] = useState<Record<string, number>>({});

  // ── Evaluation ────────────────────────────────────────────────────────
  const [isEvaluating,   setIsEvaluating]   = useState(false);
  const [evalError,      setEvalError]      = useState<string | null>(null);
  const [evalProgress,   setEvalProgress]   = useState('');

  // ── Certificate ───────────────────────────────────────────────────────
  const [certName,       setCertName]       = useState('');
  const [isGenCert,      setIsGenCert]      = useState(false);
  const [expandedCrit,   setExpandedCrit]   = useState<string | null>(null);

  // ── Gallery view ──────────────────────────────────────────────────────
  const [gridView,       setGridView]       = useState(false);

  const lvl             = communicationLevel;
  const succeededImages = images.filter(i => i.status === 'succeeded');
  const generatingImages = images.filter(i => i.status === 'generating');
  const allProficient   = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored       = assessmentScores.some(s => s.score !== null);
  const overallAvg      = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;

  // ── Load voices ───────────────────────────────────────────────────────
  const speak = (text: string) => hookSpeak(text.slice(0, 400));
  const stopSpeaking = () => cancelSpeech();

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

      const evalData = dash?.image_cert_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score:    evalData?.scores?.[a.assessment_name]?.score ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      if (dash?.image_chat_history) {
        try {
          const saved = typeof dash.image_chat_history === 'string'
            ? JSON.parse(dash.image_chat_history) : dash.image_chat_history;
          if (Array.isArray(saved)) setImages(saved);
        } catch {}
      }
      if (dash?.image_prompt) setSessionName(dash.image_prompt);
      if (dash?.image_cert_session_id) { setSessionId(dash.image_cert_session_id); sessionIdRef.current = dash.image_cert_session_id; }

    } catch (err: any) { setDataError(err.message || 'Failed to load certification data'); }
    finally { setLoadingData(false); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Ensure record ─────────────────────────────────────────────────────
  const ensureRecord = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (user?.id) {
      await supabase.from('dashboard').insert({
        user_id: user.id, activity: CERT_ACTIVITY,
        category_activity: 'Certification', progress: 'started',
        image_cert_session_id: sid, image_prompt: sessionName,
        image_chat_history: [], image_cert_evaluation: {},
      });
    }
    return sid;
  }, [user?.id, sessionName]);

  // ── Persist images ────────────────────────────────────────────────────
  const persistImages = useCallback(async (imgs: ImageEntry[]) => {
    const sid = sessionIdRef.current; if (!user?.id || !sid) return;
    // Strip imageUrl before persisting — base64 or CDN URLs can be 50K+ chars each
    // and inflate token counts if chatClient ever reads stored history as context.
    const imgsForStorage = imgs.map(({ imageUrl: _url, ...rest }) => rest);
    await supabase.from('dashboard').update({
      image_chat_history: imgsForStorage,
      image_prompt: sessionName,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('image_cert_session_id', sid);
  }, [user?.id, sessionName]);

  // ── Generate image (blocking) ─────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setGenError(null);
    await ensureRecord();

    const promptKey = prompt.trim().toLowerCase().slice(0, 30);
    const iter = (promptGroupCount[promptKey] ?? 0) + 1;
    setPromptGroupCount(prev => ({ ...prev, [promptKey]: iter }));

    const ar = ASPECT_RATIOS.find(a => a.id === aspectRatio) ?? ASPECT_RATIOS[0];
    const entryId = makeId();
    const newEntry: ImageEntry = {
      id: entryId, prompt: prompt.trim(), negativePrompt: negPrompt.trim(),
      aspectRatio, style: style.trim(), purpose: purpose.trim(),
      imageUrl: null, status: 'generating', iteration: iter,
      createdAt: new Date().toISOString(),
    };
    const updatedImages = [...images, newEntry];
    setImages(updatedImages);
    setPrompt('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const fullPrompt = style ? `${style} style: ${newEntry.prompt}` : newEntry.prompt;

      const { ok, data } = await callEdgeFunction('generate-image', 'POST', session.access_token, {
        prompt: fullPrompt,
        negative_prompt: negPrompt.trim(),
        width: ar.w, height: ar.h,
      });

      const imageUrl = ok ? (data.imageUrl || data.url || null) : null;
      const status   = ok && imageUrl ? 'succeeded' : 'failed';

      setImages(prev => {
        const updated = prev.map(i => i.id === entryId ? { ...i, status: status as any, imageUrl } : i);
        persistImages(updated);
        return updated;
      });

    } catch (err: any) {
      setGenError(err.message || 'Generation failed');
      setImages(prev => {
        const updated = prev.map(i => i.id === entryId ? { ...i, status: 'failed' as const } : i);
        persistImages(updated);
        return updated;
      });
    } finally { setIsGenerating(false); }
  }, [prompt, negPrompt, aspectRatio, style, purpose, isGenerating, images,
      promptGroupCount, ensureRecord, persistImages]);

  // ── Delete image ──────────────────────────────────────────────────────
  const handleDeleteImage = useCallback(async (id: string) => {
    const updated = images.filter(i => i.id !== id);
    setImages(updated);
    await persistImages(updated);
  }, [images, persistImages]);

  // ── Evaluate ──────────────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (!user?.id || isEvaluating || succeededImages.length === 0) return;
    setIsEvaluating(true); setEvalError(null);
    await ensureRecord();

    // portfolioSummary now built inside handleEvaluate with MAX_EVAL_IMAGES cap

    const iterationEvidence = [
      `Total images generated: ${images.length}`,
      `Successfully generated: ${succeededImages.length}`,
      `Unique prompt themes: ${Object.keys(promptGroupCount).length}`,
      `Images with stated purpose: ${images.filter(i => i.purpose.trim()).length}`,
      `Images with explicit style: ${images.filter(i => i.style.trim()).length}`,
      `Multi-iteration prompts: ${Object.values(promptGroupCount).filter(c => c > 1).length} themes with 2+ attempts`,
      `Aspect ratios used: ${[...new Set(images.map(i => i.aspectRatio))].join(', ')}`,
    ].join('\n');

    const scores: Record<string, { score: number; evidence: string }> = {};
    const newScores: AssessmentScore[] = [];

    try {
      // ── Single call evaluating all criteria at once ──────────────────────────
      // Previously: N calls × ~33K tokens = ~165K tokens per evaluation session.
      // Now: 1 call with all criteria in one prompt = ~8K tokens total (~95% reduction).
      setEvalProgress('Evaluating your portfolio…');

      // Cap portfolio at 30 images for evaluation — beyond that, quality signals
      // are well-established and extra images just inflate tokens without changing scores.
      const MAX_EVAL_IMAGES = 30;
      const evalImages = images.length > MAX_EVAL_IMAGES
        ? [
            ...images.filter(i => i.status === 'succeeded').slice(0, MAX_EVAL_IMAGES - 5),
            ...images.filter(i => i.status === 'succeeded').slice(-5),   // always include latest 5
          ].slice(0, MAX_EVAL_IMAGES)
        : images;

      const portfolioSummary = evalImages.map((img, i) => [
        `Image ${i + 1} (${img.status}) — ${img.aspectRatio} — Iteration #${img.iteration}`,
        `Purpose: ${img.purpose || 'Not stated'}`,
        `Style: ${img.style || 'Not specified'}`,
        `Prompt: ${img.prompt}`,
        img.negativePrompt ? `Negative: ${img.negativePrompt}` : '',
      ].filter(Boolean).join('\n')).join('\n\n');

      const criteriaBlock = assessments.map(a => [
        'CRITERION: ' + a.assessment_name,
        'DESCRIPTION: ' + a.description,
        'QUESTION: ' + a.certification_prompt,
        'RUBRIC:',
        '  0 (No Evidence): ' + a.certification_level0_metric,
        '  1 (Emerging): '   + a.certification_level1_metric,
        '  2 (Proficient): ' + a.certification_level2_metric,
        '  3 (Advanced): '   + a.certification_level3_metric,
      ].join('\n')).join('\n\n---\n\n');

      const totalImages = images.length;
      const evalPrompt = `You are evaluating a student's AI image creation portfolio across ${assessments.length} criteria. The student generated ${totalImages} images total; this summary shows a representative sample of up to ${MAX_EVAL_IMAGES}.

STUDENT'S IMAGE PORTFOLIO SUMMARY:
${portfolioSummary}

PORTFOLIO STATISTICS:
${iterationEvidence}

NOTE: Evaluate based on the PROMPTS and PROCESS the student demonstrated, not the actual images (which you cannot see). Judge prompt quality, creative direction, stylistic awareness, iteration, and compositional thinking through their written prompts.

${criteriaBlock}

Respond ONLY with a JSON object where each key is the exact criterion name and the value has "score" (0-3) and "evidence" (2-4 sentences). Example:
{
  "Criterion Name": { "score": 2, "evidence": "..." },
  "Another Criterion": { "score": 1, "evidence": "..." }
}`;

      const result = await chatJSON({
        page: 'AIImageCertificationPage',
        messages: [{ role: 'user', content: evalPrompt }],
        system: 'You are an expert AI image creation educator. Evaluate student work fairly based on their demonstrated prompt engineering skills, creative choices, and iterative process. Respond ONLY with valid JSON.',
        max_tokens: assessments.length * 200 + 200,
        temperature: 0.3,
      });

      for (const assessment of assessments) {
        const r        = result?.[assessment.assessment_name] ?? {};
        const score    = typeof r.score === 'number' ? r.score : 0;
        const evidence = r.evidence ?? 'Unable to evaluate.';
        scores[assessment.assessment_name] = { score, evidence };
        newScores.push({ assessment_name: assessment.assessment_name, score, evidence });
      }

      setEvalProgress('');
      setAssessmentScores(newScores);

      const avgCalc = newScores.reduce((s, a) => s + (a.score ?? 0), 0) / newScores.length;
      const allPass = newScores.every(s => (s.score ?? 0) >= 2);

      await supabase.from('dashboard').update({
        image_cert_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg: avgCalc },
        progress: allPass ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('image_cert_session_id', sessionIdRef.current!);

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
  }, [user?.id, isEvaluating, images, assessments, succeededImages, promptGroupCount, ensureRecord]);

  // ── Certificate PDF ───────────────────────────────────────────────────
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

      // Borders — fuchsia/pink theme for images
      doc.setLineWidth(3); doc.setDrawColor(217, 70, 239); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(236, 72, 153); doc.rect(15, 15, W - 30, H - 30);

      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(217, 70, 239);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });
      doc.setFontSize(20); doc.setTextColor(236, 72, 153);
      doc.text(`AI Image Creation Certification — ${certLevel}`, W / 2, 43, { align: 'center' });
      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the AI Image Creation Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to craft, refine, and direct AI-generated images', W / 2, 95, { align: 'center' });
      doc.text('using text-to-image prompt engineering, style direction, and creative iteration.', W / 2, 102, { align: 'center' });

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(217, 70, 239);
      doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel} · ${succeededImages.length} image${succeededImages.length !== 1 ? 's' : ''} created`, W / 2, 112, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
      doc.text('Assessment Competencies:', 20, 122);

      const cols = assessmentScores.length <= 4 ? 2 : 3;
      const colW = (W - 40) / cols;
      let yPos = 128; let col = 0;

      assessmentScores.forEach((sc) => {
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
      doc.text(`Certification ID: IMG-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-ImageCreation-Certificate.pdf`);
    } catch (err) { console.error('Certificate error:', err); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, succeededImages.length, branding]);

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
              <ImagePlus size={18} className="text-accent" />
              <span className="text-sm font-bold text-ink">AI Image Creation Certification</span>
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
                    ${view === v ? 'bg-accent/10 text-accent border-accent/40' : 'text-muted border-hair hover:text-body hover:border-accent/30'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '🎨 Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
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
              <button onClick={handleEvaluate} disabled={isEvaluating || succeededImages.length === 0}
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
              ? 'Welcome to the AI Image Creation Certification. You will create AI images using prompts, then be evaluated on your skill.'
              : 'Welcome to the AI Image Creation Certification. Build a portfolio of FLUX-generated images demonstrating prompt engineering, style direction, and creative iteration.')}

            <div className="p-6 bg-surface border border-hair rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-accent/10 rounded-xl"><ImagePlus size={24} className="text-accent" /></div>
                <div>
                  <h1 className="text-xl font-bold text-ink">AI Image Creation Certification</h1>
                  <p className="text-accent text-sm">FLUX Schnell · Text-to-Image · Prompt Engineering</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="FLUX Schnell · Text-to-Image · Prompt Engineering"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-body text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you create AI images by writing descriptions of what you want to see. You will be judged on how well you describe your images, whether they have a clear purpose, how you use styles, and how much you improve by trying again.'
                  : 'Demonstrate your AI image creation skills by building a portfolio of FLUX Schnell generated images. Evaluation covers prompt quality, compositional thinking, style and aesthetic awareness, iterative refinement, and the breadth and independence of your creative portfolio.'}
              </p>
            </div>

            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-1">💡 How the evaluation works</p>
              <p className="text-sm text-body leading-relaxed">
                {lvl <= 1
                  ? 'The evaluator looks at your written prompts and your choices — not the image itself, which AI creates. The more detail and thought in your prompts, the higher your score. State why you are making each image and try the same idea more than once to show improvement.'
                  : 'Evaluation analyses your written prompts, stated purposes, style choices, aspect ratio decisions, and iteration patterns. The evaluator cannot see the generated images but can judge the quality of your creative process through your prompts and decisions.'}
              </p>
            </div>

            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-3">📋 Certification Guidelines</p>
              <div className="space-y-2">
                {[
                  { icon: '✅', text: lvl <= 1 ? 'Always say WHY you are making each image — for a poster, a story, a project.' : 'State a clear purpose for every image using the Purpose field — this is a scored criterion.' },
                  { icon: '✅', text: lvl <= 1 ? 'Choose a style (like "watercolour" or "photograph") to make your image better.' : 'Select and name a style for each image. Stylistic awareness is evaluated.' },
                  { icon: '✅', text: lvl <= 1 ? 'Try the same idea more than once with more detail to improve it.' : 'Iterate — revisit subjects with refined prompts to demonstrate creative growth.' },
                  { icon: '✅', text: lvl <= 1 ? 'Use words like "close-up", "wide view", "bright colours", "dark shadow".' : 'Use compositional language: perspective, framing, depth, lighting, colour palette, mood.' },
                  { icon: '❌', text: lvl <= 1 ? 'Do not write very short prompts like "a cat". Add much more detail.' : 'Short vague prompts (under 10 words) score as No Evidence regardless of output quality.' },
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">{rule.icon}</span>
                    <span className="text-body">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Prompt tip */}
            <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl mb-5">
              <p className="text-xs font-bold text-accent uppercase mb-2">🎨 What makes a great image prompt?</p>
              <div className="space-y-1.5 text-xs text-muted">
                <div className="flex items-start gap-2"><span className="text-red-700 flex-shrink-0 font-bold">✗ Weak:</span><span className="italic">"A woman in a market."</span></div>
                <div className="flex items-start gap-2"><span className="text-green-700 flex-shrink-0 font-bold">✓ Strong:</span><span className="italic">"A Nigerian market woman in her 40s wearing a vibrant yellow ankara dress, photographed from a low angle, surrounded by colourful produce, golden afternoon light streaming through the stalls, shallow depth of field, photorealistic."</span></div>
                <p className="text-muted mt-2">Strong prompts include: <span className="text-body">subject · setting · perspective · lighting · colour · mood · style</span></p>
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
                <Trophy size={28} className="text-yellow-700 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted uppercase font-bold">Your current score</p>
                  <p className="text-2xl font-black text-ink">{overallAvg.toFixed(1)}<span className="text-base font-normal text-muted">/3.0</span></p>
                </div>
                {allProficient && (
                  <span className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">🏆 Eligible for Certificate</span>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-all hover:scale-[1.01] shadow-lg">
                {succeededImages.length > 0 ? <><RefreshCw size={16} /> Continue Building</> : <><ImagePlus size={16} /> Start Creating</>}
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
              <div className="flex-shrink-0 px-4 py-3 border-b border-accent/30 bg-accent/10">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-accent" />
                  <p className="text-sm font-bold text-accent">Image Prompt</p>
                </div>
                <p className="text-[10px] text-muted mt-0.5">
                  {lvl <= 1 ? 'Describe the image you want to create.' : 'Write a detailed prompt. Include subject, setting, lighting, style, mood.'}
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

                {/* Purpose */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Why are you making this image? *' : 'Purpose / Creative brief *'}
                  </label>
                  <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
                    placeholder={lvl <= 1 ? 'e.g. A poster for our school event' : 'e.g. Cover art for a community newsletter about solar energy'}
                    className="w-full bg-paper border border-hair rounded-lg px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-accent transition-colors" />
                  <p className="text-[9px] text-muted mt-0.5">Stating a purpose is part of your evaluation.</p>
                </div>

                {/* Main prompt */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Describe your image *' : 'Image prompt *'}
                  </label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    rows={5}
                    placeholder={lvl <= 1
                      ? 'e.g. A young girl in school uniform reading a book under a mango tree, sunshine, happy, bright colours'
                      : 'e.g. A Nigerian schoolgirl in blue uniform reading under a mango tree, dappled afternoon sunlight, bokeh background, warm colour palette, shallow depth of field, photorealistic'}
                    className="w-full bg-paper border border-hair rounded-xl px-3 py-2.5 text-sm text-ink placeholder-muted resize-y outline-none focus:border-accent transition-colors leading-relaxed" />
                  <p className="text-[9px] text-muted mt-0.5">Ctrl+Enter to generate</p>
                </div>

                {/* Style selector */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Style (how should it look?)' : 'Visual style'}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {IMAGE_STYLES.map(s => (
                      <button key={s} onClick={() => setStyle(style === s ? '' : s)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${style === s ? 'bg-accent/10 border-accent/40 text-accent' : 'border-hair text-muted hover:border-accent/30 hover:text-body'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect ratio */}
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Shape' : 'Aspect ratio'}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ASPECT_RATIOS.map(ar => (
                      <button key={ar.id} onClick={() => setAspectRatio(ar.id)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${aspectRatio === ar.id ? 'bg-accent/10 border-accent/40 text-accent' : 'border-hair text-muted hover:border-accent/30 hover:text-body'}`}>
                        {ar.label.split(' ')[0]}
                        <span className="block text-[9px] opacity-60">{ar.label.split(' ').slice(1).join(' ')}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced */}
                <div>
                  <button onClick={() => setShowAdvanced(a => !a)} className="flex items-center gap-1 text-[10px] text-muted hover:text-body transition-colors">
                    {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {lvl <= 1 ? 'Things to avoid' : 'Advanced: negative prompt'}
                  </button>
                  {showAdvanced && (
                    <textarea value={negPrompt} onChange={e => setNegPrompt(e.target.value)} rows={2}
                      className="mt-1.5 w-full bg-paper border border-hair rounded-lg px-2.5 py-2 text-xs text-body placeholder-muted resize-none outline-none focus:border-accent"
                      placeholder="blurry, distorted, watermark…" />
                  )}
                </div>

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
                                  { level: 3, text: a.certification_level3_metric, color: 'text-green-700' },
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
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors disabled:opacity-40">
                  {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                  {isGenerating ? 'Generating…' : (lvl <= 1 ? 'Create My Image ✨' : 'Generate Image')}
                </button>
              </div>
            </div>

            {/* ── Right: Image portfolio ────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-hair flex-shrink-0">
                <div className="flex items-center gap-2">
                  <LayoutGrid size={13} className="text-accent" />
                  <span className="text-xs font-semibold text-body">Image Portfolio</span>
                  <span className="text-[10px] text-muted">{succeededImages.length} complete · {generatingImages.length} generating · {images.length} total</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setGridView(g => !g)}
                    className={`p-1.5 rounded-lg border transition-colors text-xs ${gridView ? 'bg-accent/10 text-accent border-accent/30' : 'border-hair text-muted hover:text-body'}`}>
                    <LayoutGrid size={13} />
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || succeededImages.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-lg disabled:opacity-40 transition-colors">
                    {isEvaluating ? <Loader2 size={11} className="animate-spin" /> : <Award size={11} />}
                    {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit'}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {images.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-3">
                    <ImagePlus size={48} className="text-muted" />
                    <p className="text-muted text-sm font-medium">
                      {lvl <= 1 ? 'Your images will appear here.' : 'Your image portfolio will build up here as you generate.'}
                    </p>
                    <div className="max-w-xs space-y-1 text-xs text-muted">
                      <p>💡 {lvl <= 1 ? 'Write a description and choose a style, then click Create.' : 'Write a detailed prompt with purpose and style, then generate.'}</p>
                      <p>🔄 {lvl <= 1 ? 'Try the same idea again with more detail.' : 'Iterate — multiple attempts on a theme demonstrate refinement.'}</p>
                      <p>⚡ {lvl <= 1 ? 'Images take 2–5 seconds to make.' : 'FLUX Schnell generates in ~2–5 seconds.'}</p>
                    </div>
                  </div>
                ) : gridView ? (
                  // Grid view — thumbnail gallery
                  <div className="space-y-2">
                    {images.length > 1 && (
                      <div className="flex items-center gap-3 p-2.5 bg-surface border border-hair rounded-lg text-xs text-muted">
                        <span className="text-accent font-bold">{succeededImages.length}</span> complete ·
                        <span className="text-accent font-bold">{Object.values(promptGroupCount).filter(c => c > 1).length}</span> iterated ·
                        <span className="text-accent font-bold">{images.filter(i => i.purpose.trim()).length}</span> with purpose ·
                        <span className="text-yellow-700 font-bold">{images.filter(i => i.style.trim()).length}</span> with style
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {images.map(img => (
                        <div key={img.id} className="aspect-square rounded-lg overflow-hidden bg-hair relative group">
                          {img.status === 'generating' && (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 size={20} className="animate-spin text-accent" />
                            </div>
                          )}
                          {img.status === 'succeeded' && img.imageUrl && (
                            <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                          )}
                          {img.status === 'failed' && (
                            <div className="w-full h-full flex items-center justify-center text-red-700 text-xs">Failed</div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-[9px] text-ink truncate">{img.prompt}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // List view
                  <div className="space-y-2">
                    {images.length > 1 && (
                      <div className="flex items-center gap-3 p-2.5 bg-surface border border-hair rounded-lg text-xs text-muted">
                        <span className="text-accent font-bold">{succeededImages.length}</span> complete ·
                        <span className="text-accent font-bold">{Object.values(promptGroupCount).filter(c => c > 1).length}</span> iterated themes ·
                        <span className="text-accent font-bold">{images.filter(i => i.purpose.trim()).length}</span> with purpose ·
                        <span className="text-yellow-700 font-bold">{images.filter(i => i.style.trim()).length}</span> with style
                      </div>
                    )}
                    {images.map(img => (
                      <ImageCard key={img.id} entry={img} onDelete={handleDeleteImage} />
                    ))}
                  </div>
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
              ? `Your AI Image Creation results. Overall average: ${overallAvg?.toFixed(1)} out of 3.`
              : 'Submit your image portfolio for evaluation to see results.')}

            {!anyScored ? (
              <div className="text-center py-16 space-y-4">
                <ClipboardList size={48} className="text-muted mx-auto" />
                <p className="text-muted">{lvl <= 1 ? 'You have not been evaluated yet. Go to the Build view and create some images first.' : 'No evaluation data yet. Generate images and submit for evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl">
                  <ImagePlus size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-5 p-5 bg-surface border border-hair rounded-2xl">
                  <Trophy size={40} className="text-yellow-700 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted uppercase font-bold">Overall Score</p>
                    <p className="text-4xl font-black text-ink">{overallAvg?.toFixed(1)}<span className="text-lg font-normal text-muted">/3.0</span></p>
                    <p className={`text-sm font-bold mt-0.5 ${allProficient ? 'text-green-700' : 'text-yellow-700'}`}>
                      {allProficient ? '🏆 Proficiency Achieved — Certificate Eligible' : `${assessmentScores.filter(s => (s.score ?? 0) >= 2).length}/${assessmentScores.length} criteria at Proficient or above`}
                    </p>
                  </div>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm">
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
                                    { level: 3, text: assessment.certification_level3_metric, color: 'text-green-700' },
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
                    <ImagePlus size={15} /> Keep Creating
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || succeededImages.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl disabled:opacity-50 transition-colors">
                    {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isEvaluating ? 'Re-evaluating…' : 'Re-evaluate'}
                  </button>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors ml-auto">
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
                <h2 className="text-lg font-bold text-ink">{lvl <= 1 ? 'Not ready yet.' : 'Certificate Not Yet Available'}</h2>
                <p className="text-muted text-sm max-w-sm mx-auto">
                  {lvl <= 1 ? 'You need Proficient (2/3) in all criteria. Keep creating and improving your prompts.' : 'A Proficient score (2+) on all criteria is required. Create more images, refine prompts, and re-evaluate.'}
                </p>
                <button onClick={() => setView('results')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl">
                  <BarChart3 size={16} /> View Results
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {renderVoiceBar(lvl <= 1
                  ? 'Congratulations! You passed the AI Image Creation Certification. Enter your name to download your certificate.'
                  : 'Congratulations on passing the AI Image Creation Certification.')}

                {/* Preview */}
                <div className="p-6 bg-surface border border-hair rounded-2xl text-center space-y-4 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #d946ef 0, #d946ef 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
                  <div className="relative">
                    <div className="flex justify-center mb-3"><Trophy size={44} className="text-yellow-700" /></div>
                    <p className="text-xs font-bold text-accent uppercase tracking-widest">Certificate of Achievement</p>
                    <p className="text-lg font-bold text-ink mt-1">AI Image Creation Certification</p>
                    <p className="text-accent text-sm">FLUX Schnell · {scoreLabel(Math.min(...assessmentScores.map(s => s.score ?? 0))).text} Level · {succeededImages.length} image{succeededImages.length !== 1 ? 's' : ''} created</p>
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
                    <label className="text-xs font-bold text-muted uppercase block mb-1.5">Full name for the certificate:</label>
                    <input type="text" value={certName} onChange={e => setCertName(e.target.value)}
                      placeholder="e.g. Amara Okoye"
                      className="w-full bg-card border border-hair rounded-xl px-4 py-3 text-ink placeholder-muted text-sm outline-none focus:border-accent transition-colors" />
                  </div>
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl disabled:opacity-50">
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

export default AIImageCertificationPage;