// src/pages/tech-skills/AIForBusinessCertificationPage.tsx
//
// AI for Business Certification
// Framework: mirrors the other tech-skills certifications
// Build environment: the 8-section Business Canvas from AIForBusinessPage,
//   filled with AI assistance using /api/generate-business-content
// Tagline: "Turn your AI skills into income."
//
// Dashboard columns (all new — see SQL file):
//   biz_cert_session_id  (text)
//   biz_cert_canvas      (jsonb)  — the 8-section BusinessCanvas
//   biz_cert_evaluation  (jsonb)  — per-criterion scores
// Activity stored as: 'AI for Business Certification'

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
  Briefcase, Award, Trophy, XCircle, Loader2,
  Download, AlertCircle, Volume2, VolumeX,
  ChevronDown, ChevronUp, ClipboardList,
  RefreshCw, Wand2, Lightbulb, Users, Star,
  TrendingUp, DollarSign, Megaphone, CheckCircle,
  Target, BarChart3, ArrowRight,
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

interface BusinessCanvas {
  opportunity:   string;
  customer:      string;
  offer:         string;
  businessModel: string;
  validation:    string;
  pricing:       string;
  offerMessage:  string;
  actionPlan:    string;
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'AI for Business';
const CERT_ACTIVITY = 'AI for Business Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);

const EMPTY_CANVAS: BusinessCanvas = {
  opportunity: '', customer: '', offer: '', businessModel: '',
  validation: '', pricing: '', offerMessage: '', actionPlan: '',
};

const CANVAS_SECTIONS: {
  key: keyof BusinessCanvas; label: string; icon: React.ReactNode;
  colour: string; placeholder: string; tip: string;
}[] = [
  { key: 'opportunity',   label: '1. The Opportunity',   icon: <Lightbulb size={13} />,    colour: 'border-blue-500/40 bg-blue-500/5',    placeholder: 'What problem does your AI service solve? Who has this problem in your community?',  tip: 'Be specific — "local tailors need WhatsApp product photos" beats "people need help"' },
  { key: 'customer',      label: '2. Your Customer',     icon: <Users size={13} />,         colour: 'border-cyan-500/40 bg-cyan-500/5',    placeholder: 'Describe one specific person who will pay for this. Their job, age, daily challenge…', tip: 'The more specific the customer, the easier it is to find and pitch them' },
  { key: 'offer',         label: '3. Your Offer',        icon: <Star size={13} />,          colour: 'border-violet-500/40 bg-violet-500/5', placeholder: 'Exactly what do you provide? What does the customer receive when they pay you?',     tip: 'List the deliverables clearly — "5 WhatsApp posts per week" not just "social media"' },
  { key: 'businessModel', label: '4. Business Model',    icon: <TrendingUp size={13} />,    colour: 'border-emerald-500/40 bg-emerald-500/5', placeholder: 'How do you make money? Per job, monthly retainer, one-time project?',             tip: 'Monthly retainers give stable income; per-job is easier to start' },
  { key: 'validation',    label: '5. Test First',        icon: <CheckCircle size={13} />,   colour: 'border-amber-500/40 bg-amber-500/5',  placeholder: 'How will you test this with a real person BEFORE building anything big?',           tip: 'Send a WhatsApp message to 3 people before writing a single line of code' },
  { key: 'pricing',       label: '6. Price & Payment',   icon: <DollarSign size={13} />,    colour: 'border-orange-500/40 bg-orange-500/5', placeholder: 'What is your price? How will customers pay you? (₦, mobile money, bank transfer?)', tip: 'Research 2–3 competitors. Price slightly below them to start.' },
  { key: 'offerMessage',  label: '7. Your Offer Message',icon: <Megaphone size={13} />,     colour: 'border-pink-500/40 bg-pink-500/5',    placeholder: 'Write the actual WhatsApp or social media message you will send to your first customer…', tip: 'Short, clear, one sentence on what you do + one on what they get + your price' },
  { key: 'actionPlan',    label: '8. First 30 Days',     icon: <Target size={13} />,        colour: 'border-rose-500/40 bg-rose-500/5',    placeholder: '3 people to contact. 1 service to start with. 1 AI tool to use. Week-by-week.',     tip: 'Don\'t plan everything — plan the first call, the first delivery, the first invoice' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20'    };
  if (s === 3)    return { text: 'Advanced',     color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'    };
  if (s === 1)    return { text: 'Emerging',     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   };
  return               { text: 'No Evidence',  color: 'text-red-400',    bg: 'bg-red-500/10',     border: 'border-red-500/30'     };
};

const canvasFilled = (c: BusinessCanvas) => Object.values(c).filter(v => v.trim().length > 20).length;

// ─── Score Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  const pct = score !== null ? (score / 3) * 100 : 0;
  const r = 18; const circ = 2 * Math.PI * r; const dash = (pct / 100) * circ;
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

// ─── Business Canvas Panel ────────────────────────────────────────────────────

const BusinessCanvasPanel: React.FC<{
  canvas: BusinessCanvas;
  onChange: (key: keyof BusinessCanvas, value: string) => void;
  activeSection: keyof BusinessCanvas | null;
  showTips: boolean;
}> = ({ canvas, onChange, activeSection, showTips }) => (
  <div className="h-full overflow-y-auto p-3 space-y-2.5">
    <div className="flex items-center justify-between mb-1 sticky top-0 bg-gray-900/90 backdrop-blur-sm py-1 z-10">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Business Canvas</p>
      <p className="text-[10px] text-gray-600">
        {canvasFilled(canvas)}/{CANVAS_SECTIONS.length} sections filled
      </p>
    </div>
    {CANVAS_SECTIONS.map(section => {
      const isActive = activeSection === section.key;
      const isFilled = canvas[section.key].trim().length > 20;
      return (
        <div key={section.key}
          className={`rounded-xl border p-3 transition-all ${section.colour} ${isActive ? 'ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/10' : ''}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={isFilled ? 'text-emerald-400' : 'text-gray-500'}>{section.icon}</span>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${isFilled ? 'text-gray-300' : 'text-gray-500'}`}>
              {section.label}
            </p>
            {isActive && <span className="ml-auto text-[9px] text-amber-400 font-bold animate-pulse">● Active</span>}
            {isFilled && !isActive && <span className="ml-auto text-[9px] text-emerald-400">✓</span>}
          </div>
          {showTips && !isFilled && (
            <p className="text-[9px] text-gray-600 italic mb-1.5">💡 {section.tip}</p>
          )}
          <textarea
            value={canvas[section.key]}
            onChange={e => onChange(section.key, e.target.value)}
            rows={3}
            placeholder={section.placeholder}
            className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 resize-none outline-none leading-relaxed" />
        </div>
      );
    })}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const AIForBusinessCertificationPage: React.FC = () => {
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
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin'); // Africa default
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
  const [sessionName, setSessionName] = useState('My AI Business');
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Business canvas ───────────────────────────────────────────────────
  const [canvas,         setCanvas]         = useState<BusinessCanvas>(EMPTY_CANVAS);
  const [activeSection,  setActiveSection]  = useState<keyof BusinessCanvas | null>(null);
  const [showTips,       setShowTips]       = useState(true);

  // ── AI assistance ─────────────────────────────────────────────────────
  const [activeKey,      setActiveKey]      = useState<keyof BusinessCanvas>('opportunity');
  const [prompt,         setPrompt]         = useState('');
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [genError,       setGenError]       = useState<string | null>(null);
  const [aiSuggestion,   setAiSuggestion]   = useState<string | null>(null);
  const [expandedCrit,   setExpandedCrit]   = useState<string | null>(null);

  // ── Evaluation ────────────────────────────────────────────────────────
  const [isEvaluating,   setIsEvaluating]   = useState(false);
  const [evalError,      setEvalError]      = useState<string | null>(null);
  const [evalProgress,   setEvalProgress]   = useState('');

  // ── Certificate ───────────────────────────────────────────────────────
  const [certName,    setCertName]    = useState('');
  const [isGenCert,   setIsGenCert]   = useState(false);

  const lvl            = communicationLevel;
  const filledCount    = canvasFilled(canvas);
  const allProficient  = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored      = assessmentScores.some(s => s.score !== null);
  const overallAvg     = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;
  const canvasReady    = filledCount >= 5;

  const speak = (text: string) => hookSpeak(text.slice(0, 400));
  const stopSpeaking = () => cancelSpeech();

  const renderVoiceBar = (textToRead: string) => (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-800/40 border border-gray-700 rounded-xl mb-4">
      <span className="text-xs font-semibold text-gray-400 flex items-center gap-1"><Volume2 size={13} className="text-amber-400" /> Voice:</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-600">
        {(['english', 'pidgin'] as const).map(m => (
          <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all border-r border-gray-600 last:border-0 ${voiceMode === m ? (m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}>
            {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
          </button>
        ))}
      </div>
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${isSpeaking ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'}`}>
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

      const evalData = dash?.biz_cert_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score:    evalData?.scores?.[a.assessment_name]?.score ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      if (dash?.biz_cert_canvas) {
        try {
          const saved = typeof dash.biz_cert_canvas === 'string'
            ? JSON.parse(dash.biz_cert_canvas) : dash.biz_cert_canvas;
          if (saved && typeof saved === 'object') setCanvas({ ...EMPTY_CANVAS, ...saved });
        } catch {}
      }
      if (dash?.biz_cert_session_id) { setSessionId(dash.biz_cert_session_id); sessionIdRef.current = dash.biz_cert_session_id; }

    } catch (err: any) { setDataError(err.message || 'Failed to load certification data'); }
    finally { setLoadingData(false); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Ensure record ─────────────────────────────────────────────────────
  const ensureRecord = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (user?.id) {
      const { error } = await supabase.from('dashboard').insert({
        user_id: user.id, activity: CERT_ACTIVITY,
        category_activity: 'Certification', progress: 'started',
        biz_cert_session_id: sid,
        biz_cert_canvas: EMPTY_CANVAS,
        biz_cert_evaluation: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('[Certifications] ensureRecord insert error:', error);
      else console.log('[Certifications] Saved to dashboard:', { sid });
    }
    return sid;
  }, [user?.id]);

  // ── Persist canvas ────────────────────────────────────────────────────
  const persistCanvas = useCallback(async (c: BusinessCanvas) => {
    if (!user?.id) return;
    const { error } = await supabase.from('dashboard').update({
      biz_cert_canvas: c,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('activity', CERT_ACTIVITY);
    if (error) console.error('[Certifications] persistCanvas error:', error);
  }, [user?.id]);

  const handleCanvasChange = useCallback((key: keyof BusinessCanvas, value: string) => {
    setCanvas(prev => {
      const next = { ...prev, [key]: value };
      // Debounce persist handled via the save button; auto-save on blur would be better
      return next;
    });
  }, []);

  // ── Save canvas ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    await ensureRecord();
    await persistCanvas(canvas);
  }, [canvas, ensureRecord, persistCanvas]);

  // ── AI assistance for a canvas section ───────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setGenError(null); setAiSuggestion(null);
    await ensureRecord();

    const sectionMeta = CANVAS_SECTIONS.find(s => s.key === activeKey);
    try {
      const res = await fetch('/api/generate-business-content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          action: 'fill_canvas_section',
          section: activeKey,
          sectionLabel: sectionMeta?.label,
          prompt: prompt.trim(),
          canvasSoFar: canvas,
          communicationLevel,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const result = await res.json();
      const suggestion = result.content || result.text || result.suggestion || '';
      if (suggestion) {
        setAiSuggestion(suggestion);
      }
      setPrompt('');
    } catch (err: any) { setGenError(err.message || 'Something went wrong'); }
    finally { setIsGenerating(false); }
  }, [prompt, isGenerating, activeKey, canvas, communicationLevel, ensureRecord]);

  const applySuggestion = () => {
    if (!aiSuggestion) return;
    const next = { ...canvas, [activeKey]: aiSuggestion };
    setCanvas(next);
    setAiSuggestion(null);
    persistCanvas(next);
  };

  // ── Download canvas as text ───────────────────────────────────────────
  const handleDownloadCanvas = useCallback(() => {
    const lines = CANVAS_SECTIONS.map(s => `${s.label}\n${'─'.repeat(40)}\n${canvas[s.key] || '(not filled)'}\n`);
    const text = `${sessionName} — Business Canvas\n${'═'.repeat(50)}\n\n${lines.join('\n')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `${sessionName.replace(/\s+/g, '-').toLowerCase()}-business-canvas.txt`;
    a.click();
  }, [canvas, sessionName]);

  // ── Evaluate ──────────────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (!user?.id || isEvaluating) return;
    setIsEvaluating(true); setEvalError(null);
    await ensureRecord();

    // Build a rich canvas summary for evaluation
    const canvasSummary = CANVAS_SECTIONS.map(s =>
      `${s.label}:\n${canvas[s.key] || '(not filled)'}`
    ).join('\n\n');

    const filledSections = CANVAS_SECTIONS.filter(s => canvas[s.key].trim().length > 20);
    const totalWords = Object.values(canvas).join(' ').split(/\s+/).filter(Boolean).length;

    const contextNote = [
      `Sections filled (>20 chars): ${filledSections.length}/${CANVAS_SECTIONS.length}`,
      `Total words across canvas: ${totalWords}`,
      `Pricing present: ${canvas.pricing.trim().length > 10 ? '✓' : '✗'}`,
      `Offer message written: ${canvas.offerMessage.trim().length > 20 ? '✓' : '✗'}`,
      `Action plan present: ${canvas.actionPlan.trim().length > 20 ? '✓' : '✗'}`,
      `Validation strategy present: ${canvas.validation.trim().length > 20 ? '✓' : '✗'}`,
    ].join('\n');

    const scores: Record<string, { score: number; evidence: string }> = {};
    const newScores: AssessmentScore[] = [];

    try {
      for (const assessment of assessments) {
        setEvalProgress(`Evaluating: ${assessment.assessment_name}…`);

        const evalPrompt = `You are evaluating a student's AI for Business certification work for the "${assessment.assessment_name}" criterion.

The student has completed a Business Canvas — a one-page business plan for a service that uses AI skills to earn income.

CRITERION: ${assessment.assessment_name}
DESCRIPTION: ${assessment.description}
ASSESSMENT QUESTION: ${assessment.certification_prompt}

RUBRIC:
- Level 0 (No Evidence): ${assessment.certification_level0_metric}
- Level 1 (Emerging): ${assessment.certification_level1_metric}
- Level 2 (Proficient): ${assessment.certification_level2_metric}
- Level 3 (Advanced): ${assessment.certification_level3_metric}

CANVAS STATISTICS:
${contextNote}

STUDENT'S FULL BUSINESS CANVAS:
${canvasSummary}

Evaluate the canvas content against this specific criterion. Be fair, specific, and constructive. Reference actual content from the canvas in your evidence.

Respond ONLY in this JSON format:
{
  "score": <0, 1, 2, or 3>,
  "evidence": "<2-4 sentences referencing specific content from the canvas>"
}`;

        const result = await chatJSON({ page: 'AIForBusinessCertificationPage',
          messages: [{ role: 'user', content: evalPrompt }],
          system: 'You are an expert entrepreneurship educator evaluating a student\'s business canvas. Be fair, specific, and constructive. Reward clarity, specificity, and realistic thinking.',
          max_tokens: 400, temperature: 0.3,
        });

        const score    = result.score ?? 0;
        const evidence = result.evidence ?? 'Unable to evaluate.';
        scores[assessment.assessment_name] = { score, evidence };
        newScores.push({ assessment_name: assessment.assessment_name, score, evidence });
      }

      setEvalProgress('');
      setAssessmentScores(newScores);

      const avgCalc = newScores.reduce((s, a) => s + (a.score ?? 0), 0) / newScores.length;
      const allPass = newScores.every(s => (s.score ?? 0) >= 2);

      const { error: updateErr } = await supabase.from('dashboard').update({
        biz_cert_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg: avgCalc },
        progress: allPass ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('activity', CERT_ACTIVITY);
      if (updateErr) console.error('[Certifications] evaluation update error:', updateErr);

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
  }, [user?.id, isEvaluating, canvas, assessments, ensureRecord]);

  // ── Certificate ───────────────────────────────────────────────────────
  const generateCertificate = useCallback(async () => {
    if (!certName.trim()) return;
    setIsGenCert(true);
    try {
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) { alert('PDF not available.'); return; }
      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const minScore  = Math.min(...assessmentScores.map(s => s.score ?? 0));
      const certLevel = minScore === 3 ? 'Advanced' : minScore >= 2 ? 'Proficient' : 'Emerging';
      const avg       = assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length;

      // Amber/orange theme for business
      doc.setLineWidth(3); doc.setDrawColor(217, 119, 6); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(245, 158, 11); doc.rect(15, 15, W - 30, H - 30);

      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(217, 119, 6);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });
      doc.setFontSize(20); doc.setTextColor(245, 158, 11);
      doc.text(`AI for Business Certification — ${certLevel}`, W / 2, 43, { align: 'center' });
      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the AI for Business Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to identify a market opportunity, design an AI-powered service,', W / 2, 95, { align: 'center' });
      doc.text('price it, validate it, and build a complete 30-day launch plan.', W / 2, 102, { align: 'center' });

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(217, 119, 6);
      doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel} · Business Canvas: ${filledCount}/8 sections`, W / 2, 112, { align: 'center' });

      // Business idea summary
      if (canvas.offer.trim()) {
        doc.setFontSize(11); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
        const offerText = `Business Idea: "${canvas.offer.trim().slice(0, 120)}${canvas.offer.length > 120 ? '…' : ''}"`;
        doc.text(offerText, W / 2, 120, { align: 'center', maxWidth: W - 40 });
      }

      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
      doc.text('Assessment Competencies:', 20, 128);

      const cols = assessmentScores.length <= 4 ? 2 : 3;
      const colW = (W - 40) / cols;
      let yPos = 134; let col = 0;
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
        col++; if (col >= cols) { col = 0; yPos += 22; }
      });

      const footerY = H - 22;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130);
      doc.text(`Awarded: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 20, footerY);
      doc.text(`${branding.institutionName} Programme`, W / 2, footerY, { align: 'center' });
      doc.text(`Certification ID: BIZ-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-AIBusiness-Certificate.pdf`);
    } catch (err) { console.error(err); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, filledCount, canvas.offer, branding]);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex flex-col h-screen bg-gray-900">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={36} className="animate-spin text-amber-400" />
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
              <Briefcase size={18} className="text-amber-400" />
              <span className="text-sm font-bold text-white">AI for Business Certification</span>
            </div>
            {view !== 'overview' && (
              <>
                <div className="w-px h-5 bg-gray-600" />
                <input className="text-sm text-gray-300 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-amber-500 outline-none px-1 py-0.5 w-44"
                  value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Business name…" />
              </>
            )}
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors
                    ${view === v ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'text-gray-600 border-gray-700 hover:text-gray-300 hover:border-gray-500'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '💡 Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
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
              <>
                <button onClick={() => setShowTips(t => !t)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${showTips ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-gray-500 border-gray-600 hover:text-gray-300'}`}>
                  <Lightbulb size={12} /> Tips {showTips ? 'on' : 'off'}
                </button>
                <button onClick={handleDownloadCanvas}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                  <Download size={12} /> Canvas
                </button>
                <button onClick={handleSave}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-300 border border-gray-600 hover:border-amber-500/50 hover:text-amber-300 rounded-lg transition-colors">
                  💾 Save
                </button>
                <button onClick={handleEvaluate} disabled={isEvaluating || !canvasReady}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg shadow disabled:opacity-50 transition-colors">
                  {isEvaluating ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />}
                  {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit for Evaluation'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            OVERVIEW
        ══════════════════════════════════════════════════════════════ */}
        {view === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {dataError && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-2 text-sm text-red-300"><AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{dataError}</div>}

            {renderVoiceBar(lvl <= 1
              ? 'Welcome to the AI for Business Certification. You will design a business using your AI skills, then be evaluated.'
              : 'Welcome to the AI for Business Certification. Build a complete Business Canvas — a one-page plan for an AI-powered service — covering your opportunity, customer, offer, pricing, validation, and launch plan.')}

            {/* Hero */}
            <div className="p-6 bg-gradient-to-br from-amber-600/20 via-orange-600/15 to-yellow-600/10 border border-amber-500/30 rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-amber-600/30 rounded-xl"><Briefcase size={24} className="text-amber-300" /></div>
                <div>
                  <h1 className="text-xl font-bold text-white">AI for Business Certification</h1>
                  <p className="text-amber-300 text-sm font-semibold">Turn your AI skills into income.</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="Turn your AI skills into income."
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you design a real service using your AI skills. You will find a problem people have, build an offer to solve it, set a price, write the message to send to your first customer, and make a plan for the first 30 days. You are judged on how clear, specific, and realistic your plan is.'
                  : 'Demonstrate entrepreneurial and AI literacy by completing an 8-section Business Canvas for an AI-powered service. Evaluation covers opportunity identification, customer specificity, offer design, business model clarity, validation strategy, pricing, offer messaging, and action planning.'}
              </p>
            </div>

            {/* Nigerian context panel */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-5">
              <p className="text-xs font-bold text-amber-400 uppercase mb-2">🌍 What people in your community are already paying for</p>
              <div className="space-y-1.5">
                {[
                  { service: 'WhatsApp product descriptions',  tool: 'AI Content Creation', naira: '₦500–₦2,000 per business' },
                  { service: 'Social media posts for a shop',  tool: 'AI Content Creation', naira: '₦3,000–₦10,000/month'     },
                  { service: 'Voice ads for radio/WhatsApp',   tool: 'AI Voice Creation',   naira: '₦2,000–₦8,000 per ad'     },
                  { service: 'Website for a small business',   tool: 'Web Development',     naira: '₦15,000–₦50,000 one-time' },
                  { service: 'AI images for flyers/posters',   tool: 'AI Image Creation',   naira: '₦1,000–₦5,000 per design' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-emerald-400 font-bold flex-shrink-0">✓</span>
                    <div><span className="text-white font-medium">{item.service}</span><span className="text-gray-500"> · {item.tool} · </span><span className="text-amber-400 font-semibold">{item.naira}</span></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rules */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">📋 Certification Requirements</p>
              <div className="space-y-2">
                {[
                  { icon: '✅', text: lvl <= 1 ? 'Fill at least 5 of the 8 Business Canvas sections before submitting.' : 'Complete a minimum of 5/8 Business Canvas sections with substantive content (>20 words each) before evaluation.' },
                  { icon: '✅', text: lvl <= 1 ? 'Be specific — write real names, real places, real prices in Naira.' : 'Specificity is scored — use real customer descriptions, realistic Nigerian pricing (₦), and concrete action steps.' },
                  { icon: '✅', text: lvl <= 1 ? 'You can use AI to help you write each section.' : 'AI assistance is encouraged. Use the prompt panel to generate suggestions for any section, then refine them.' },
                  { icon: '✅', text: lvl <= 1 ? 'Your plan should be something you could really do — not a big company idea.' : 'Plans must be realistic and actionable for a student in Oloibiri, not a hypothetical startup.' },
                  { icon: '❌', text: lvl <= 1 ? 'Do not copy example answers. Write your own real idea.' : 'Generic, vague, or placeholder content (e.g. "My customer is everyone") scores as No Evidence.' },
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">{rule.icon}</span>
                    <span className="text-gray-300">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Criteria */}
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">🎯 What You Will Be Evaluated On</p>
              {assessments.length === 0 ? <p className="text-sm text-gray-500 italic">Loading criteria…</p> : (
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
                            {sc?.score !== null && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sl.bg} ${sl.color} ${sl.border}`}>{sl.text}</span>}
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
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-5 flex items-center gap-4">
                <Trophy size={28} className="text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold">Your current score</p>
                  <p className="text-2xl font-black text-white">{overallAvg.toFixed(1)}<span className="text-base font-normal text-gray-500">/3.0</span></p>
                </div>
                {allProficient && <span className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🏆 Eligible for Certificate</span>}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl hover:scale-[1.01] transition-all shadow-lg">
                {filledCount > 0 ? <><RefreshCw size={16} /> Continue Building</> : <><Briefcase size={16} /> Start My Business Canvas</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-amber-300 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-colors">
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

            {/* ── Left: AI prompt + criteria ────────────────────────── */}
            <div className="w-80 flex-shrink-0 flex flex-col bg-[#1a1d23] border-r border-gray-700 overflow-hidden">
              <div className="flex-shrink-0 px-4 py-3 border-b border-amber-500/30 bg-amber-500/10">
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className="text-amber-400" />
                  <p className="text-sm font-bold text-amber-300">AI Assistance</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {lvl <= 1 ? 'Choose a section and describe your idea — AI will suggest what to write.' : 'Select a canvas section, describe your thinking, and AI will draft a suggestion you can refine.'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {genError && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2"><AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" /><p className="text-xs text-red-300">{genError}</p></div>}
                {evalError && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2"><AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" /><p className="text-xs text-red-300">{evalError}</p></div>}

                {/* Section selector */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Which section are you working on?</label>
                  <select value={activeKey}
                    onChange={e => { setActiveKey(e.target.value as keyof BusinessCanvas); setActiveSection(e.target.value as keyof BusinessCanvas); setAiSuggestion(null); }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 transition-colors">
                    {CANVAS_SECTIONS.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Prompt */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">
                    {lvl <= 1 ? 'Describe your idea for this section:' : 'Your brief (AI will expand it):'}
                  </label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    rows={4}
                    placeholder={lvl <= 1
                      ? 'e.g. I want to help market traders make better WhatsApp posts for their products'
                      : 'e.g. My customer is a market trader, 30s–40s, sells cloth in Oloibiri market, needs help writing product descriptions for WhatsApp that will attract buyers'}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-amber-500 transition-colors leading-relaxed" />
                  <p className="text-[9px] text-gray-700 mt-0.5">Ctrl+Enter to generate</p>
                </div>

                {/* AI suggestion */}
                {aiSuggestion && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                    <p className="text-[9px] font-bold text-amber-400 uppercase">AI suggestion for {CANVAS_SECTIONS.find(s => s.key === activeKey)?.label}</p>
                    <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{aiSuggestion}</p>
                    <div className="flex gap-2">
                      <button onClick={applySuggestion}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black rounded-lg transition-colors">
                        <CheckCircle size={11} /> Use this
                      </button>
                      <button onClick={() => setAiSuggestion(null)}
                        className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors">
                        Discard
                      </button>
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                    <span>Canvas progress</span>
                    <span className={filledCount >= 5 ? 'text-emerald-400 font-bold' : 'text-gray-500'}>{filledCount}/8 sections{filledCount >= 5 ? ' ✓ Ready to submit' : ''}</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
                      style={{ width: `${(filledCount / 8) * 100}%` }} />
                  </div>
                </div>

                {/* Criteria accordion */}
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5"><ClipboardList size={11} /> Rubric Criteria</p>
                  <div className="space-y-1.5">
                    {assessments.map(a => {
                      const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                      const isOpen = expandedCrit === a.certification_id;
                      const sl = scoreLabel(sc?.score ?? null);
                      return (
                        <div key={a.certification_id} className={`rounded-lg border overflow-hidden ${isOpen ? 'border-amber-500/40' : 'border-gray-700'}`}>
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

              <div className="flex-shrink-0 px-4 pb-4 pt-2">
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl disabled:opacity-40 transition-colors">
                  {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                  {isGenerating ? (lvl <= 1 ? 'Writing…' : 'Generating…') : (lvl <= 1 ? 'Get AI Suggestion' : 'Generate Suggestion')}
                </button>
              </div>
            </div>

            {/* ── Right: Business Canvas ────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Briefcase size={13} className="text-amber-400" />
                  <span className="text-xs font-semibold text-gray-300">Business Canvas — {sessionName}</span>
                  <span className="text-[10px] text-gray-600">{filledCount}/8 filled</span>
                </div>
                <div className="flex items-center gap-2">
                  {!canvasReady && (
                    <span className="text-[10px] text-gray-500">Fill {5 - filledCount} more section{5 - filledCount !== 1 ? 's' : ''} to submit</span>
                  )}
                  <button onClick={handleEvaluate} disabled={isEvaluating || !canvasReady}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg disabled:opacity-40 transition-colors">
                    {isEvaluating ? <Loader2 size={11} className="animate-spin" /> : <Award size={11} />}
                    {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit'}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden bg-gray-900">
                <BusinessCanvasPanel canvas={canvas} onChange={handleCanvasChange} activeSection={activeSection} showTips={showTips} />
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
              ? `Your AI for Business results. Overall average: ${overallAvg?.toFixed(1)} out of 3.`
              : 'Submit your Business Canvas for evaluation to see results.')}

            {!anyScored ? (
              <div className="text-center py-16 space-y-4">
                <Briefcase size={48} className="text-gray-600 mx-auto" />
                <p className="text-gray-400">{lvl <= 1 ? 'You have not been evaluated yet. Go to Build and fill your Business Canvas.' : 'No evaluation data yet. Complete your Business Canvas and submit for evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl">
                  <Briefcase size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-5 p-5 bg-gradient-to-br from-amber-600/20 to-orange-600/10 border border-amber-500/30 rounded-2xl">
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
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm">
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
                            {sc.evidence && <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Evidence</p><p className="text-xs text-gray-300 leading-relaxed">{sc.evidence}</p></div>}
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
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-amber-300 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-colors">
                    <Briefcase size={15} /> Refine Canvas
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || !canvasReady}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl disabled:opacity-50 transition-colors">
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
                <h2 className="text-lg font-bold text-white">{lvl <= 1 ? 'Not ready yet.' : 'Certificate Not Yet Available'}</h2>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                  {lvl <= 1 ? 'You need Proficient (2/3) in all criteria. Keep refining your canvas.' : 'A Proficient score (2+) on all criteria is required. Improve your canvas sections and re-evaluate.'}
                </p>
                <button onClick={() => setView('results')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl">
                  <BarChart3 size={16} /> View Results
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {renderVoiceBar(lvl <= 1
                  ? 'Congratulations! You passed the AI for Business Certification.'
                  : 'Congratulations on passing the AI for Business Certification.')}

                {/* Preview */}
                <div className="p-6 bg-gradient-to-br from-amber-900/40 via-orange-900/30 to-yellow-900/20 border-2 border-amber-500/40 rounded-2xl text-center space-y-4 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #d97706 0, #d97706 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
                  <div className="relative">
                    <div className="flex justify-center mb-3"><Trophy size={44} className="text-amber-400" /></div>
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Certificate of Achievement</p>
                    <p className="text-lg font-bold text-white mt-1">AI for Business Certification</p>
                    <p className="text-amber-300 text-sm">Turn Your AI Skills Into Income · {scoreLabel(Math.min(...assessmentScores.map(s => s.score ?? 0))).text} Level</p>
                    <div className="my-4 h-px bg-amber-500/30" />
                    <p className="text-gray-400 text-xs">Awarded to</p>
                    <p className="text-2xl font-bold text-white mt-1">{certName || '[ Your Name ]'}</p>
                    <p className="text-gray-400 text-xs mt-1">{branding.institutionName}</p>
                    {canvas.offer.trim() && (
                      <p className="text-amber-200/70 text-xs mt-1 italic">"{canvas.offer.trim().slice(0, 80)}{canvas.offer.length > 80 ? '…' : ''}"</p>
                    )}
                    <div className="my-4 h-px bg-amber-500/30" />
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
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">Full name for the certificate:</label>
                    <input type="text" value={certName} onChange={e => setCertName(e.target.value)} placeholder="e.g. Amara Okoye"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm outline-none focus:border-amber-500 transition-colors" />
                  </div>
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl disabled:opacity-50 hover:scale-[1.01] transition-all">
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

export default AIForBusinessCertificationPage;