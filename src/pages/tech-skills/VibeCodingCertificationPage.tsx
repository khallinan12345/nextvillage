// src/pages/tech-skills/VibeCodingCertificationPage.tsx
//
// Vibe Coding Certification
// Layout:
//   LEFT  — VibeCodingWorkflow (4-phase: Write Instructions → Critique → Generate Code → Debug)
//   RIGHT — Generated code viewer + execution output + AI coach chat for prompt iteration
//
// The student uses the workflow to build something that works.
// When they are satisfied, they click "Submit for Evaluation".
// The AI evaluates their generated code + prompt quality against rubric criteria.
//
// Dashboard columns used:
//   vibe_cert_session_id   (text)
//   vibe_cert_code         (text)   — latest generated code
//   vibe_cert_language     (text)   — python | javascript | html
//   vibe_cert_evaluation   (jsonb)  — per-criterion scores
// Activity stored as: 'Vibe Coding Certification'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { chatJSON, chatText, ChatMessage as ClientChatMessage } from '../../lib/chatClient';
import { saveEvaluation } from '../../lib/evaluations';
import { useAuth } from '../../hooks/useAuth';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { useBranding, addBrandingToPDF } from '../../lib/useBranding';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { PidginTooltip } from '../../components/PidginTooltip';
import { VibeCodingWorkflow } from '../../components/learning/VibeCodingWorkflow';
import {
  Code, Award, Trophy, Loader2, Download, Globe,
  ChevronDown, ChevronUp, Volume2, VolumeX,
  Wand2, AlertCircle, ClipboardList, RefreshCw,
  ArrowRight, Play, CheckCircle, Bot, User, Send,
  ExternalLink,
} from 'lucide-react';

// ─── Markdown components (dark theme) ────────────────────────────────────────

const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-sm font-bold text-ink mb-2 mt-3">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-xs font-bold text-ink mb-1.5 mt-3">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-xs font-semibold text-body mb-1 mt-2">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="text-xs text-body mb-2 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-muted">{children}</em>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside space-y-1 mb-2 text-body ml-2 text-xs">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside space-y-1 mb-2 text-body ml-2 text-xs">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-relaxed">{children}</li>
  ),
  hr: () => <hr className="my-3 border-hair" />,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-accent pl-3 italic text-muted my-2 text-xs">{children}</blockquote>
  ),
  a: ({ href, children }: any) => (
    <a href={href || '#'} target="_blank" rel="noopener noreferrer"
      className="text-accent hover:underline font-medium">
      {children}
    </a>
  ),
  code: ({ children }: any) => (
    <code className="bg-paper text-accent px-1 py-0.5 rounded text-[10px] font-mono border border-hair">{children}</code>
  ),
  pre: ({ children }: any) => (
    <pre className="bg-surface text-ink p-2 rounded text-[10px] font-mono overflow-x-auto mb-2 border border-hair">{children}</pre>
  ),
};

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
}

interface AssessmentScore {
  assessment_name: string;
  score: number | null;
  evidence: string | null;
}

interface CoachMessage {
  role: 'assistant' | 'user';
  content: string;
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'Vibe Coding';
const CERT_ACTIVITY = 'Vibe Coding Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-gray-500',  bg: 'bg-gray-100',   border: 'border-gray-300'   };
  if (s === 3)    return { text: 'Advanced',     color: 'text-green-800', bg: 'bg-green-100',  border: 'border-green-300'  };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-800',  bg: 'bg-blue-100',   border: 'border-blue-300'   };
  if (s === 1)    return { text: 'Emerging',     color: 'text-yellow-800',bg: 'bg-yellow-100', border: 'border-yellow-300' };
  return               { text: 'No Evidence',  color: 'text-red-800',   bg: 'bg-red-100',    border: 'border-red-300'    };
};

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

// ─── Code execution service ───────────────────────────────────────────────────

class CodeExecutionService {
  private static apiUrl = '/api/execute-code';

  static async executeCode(code: string, language: 'python' | 'javascript' | 'html'): Promise<{
    output?: string; error?: string; executionTime?: number;
  }> {
    if (language === 'html') {
      return { output: '✅ HTML ready — click "Open as Web Page" to view it.', executionTime: 0 };
    }
    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return await res.json();
    } catch (err: any) {
      return { error: `Execution failed: ${err.message}` };
    }
  }

  static codeContainsHTML(code: string) {
    return /<(!DOCTYPE|html|head|body|div|script|style)\b/i.test(code);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const VibeCodingCertificationPage: React.FC = () => {
  const { user } = useAuth();
  const [view, setView] = useState<ViewMode>('overview');

  // ── Assessments ──────────────────────────────────────────────────────────
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [loadingData,      setLoadingData]      = useState(true);
  const [dataError,        setDataError]        = useState<string | null>(null);

  // ── Personality ───────────────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState(1);

  // ── Voice + Branding ─────────────────────────────────────────────────────
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
    speak: hookSpeak, cancel: cancelSpeech, speaking: isSpeaking,
    fallbackText, clearFallback, selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  const speak        = (text: string) => hookSpeak(text.slice(0, 400));
  const stopSpeaking = () => cancelSpeech();

  // ── Session ───────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const dashboardRowIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Generated code ────────────────────────────────────────────────────────
  const [certCode,     setCertCode]     = useState('');
  const [certLanguage, setCertLanguage] = useState<'python' | 'javascript' | 'html'>('python');
  const [execResult,   setExecResult]   = useState<{ output?: string; error?: string } | null>(null);
  const [isExecuting,  setIsExecuting]  = useState(false);
  const [injectedInstructions, setInjectedInstructions] = useState<string | null>(null);

  // ── AI Coach chat ─────────────────────────────────────────────────────────
  const [coachHistory,    setCoachHistory]    = useState<CoachMessage[]>([
    { role: 'assistant', content: 'Hi! I\'m your coding coach. Ask me anything to help improve your prompt or fix your code.' },
  ]);
  const [coachInput,      setCoachInput]      = useState('');
  const [coachSubmitting, setCoachSubmitting] = useState(false);
  const coachRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (coachRef.current) coachRef.current.scrollTop = coachRef.current.scrollHeight; }, [coachHistory]);

  // ── Evaluation ────────────────────────────────────────────────────────────
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError,    setEvalError]    = useState<string | null>(null);
  const [evalProgress, setEvalProgress] = useState('');
  const [expandedCrit, setExpandedCrit] = useState<string | null>(null);

  // ── Certificate ───────────────────────────────────────────────────────────
  const [certName,  setCertName]  = useState('');
  const [isGenCert, setIsGenCert] = useState(false);

  // ── Computed ──────────────────────────────────────────────────────────────
  const allProficient = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored     = assessmentScores.some(s => s.score !== null);
  const overallAvg    = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;
  const lvl           = communicationLevel;
  const isWebViewable = certLanguage !== 'python' || CodeExecutionService.codeContainsHTML(certCode);

  // ── Fetch data ────────────────────────────────────────────────────────────
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

      const evalData = dash?.vibe_cert_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score:    evalData?.scores?.[a.assessment_name]?.score    ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      if (dash?.vibe_cert_code)       setCertCode(dash.vibe_cert_code);
      if (dash?.vibe_cert_language)   setCertLanguage(dash.vibe_cert_language);
      if (dash?.vibe_cert_session_id) { setSessionId(dash.vibe_cert_session_id); sessionIdRef.current = dash.vibe_cert_session_id; }

    } catch (err: any) { setDataError(err.message || 'Failed to load certification data'); }
    finally { setLoadingData(false); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Ensure record ─────────────────────────────────────────────────────────
  const ensureRecord = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (user?.id) {
      const { data: inserted } = await supabase.from('dashboard').insert({
        user_id: user.id, activity: CERT_ACTIVITY,
        category_activity: 'Certification', progress: 'started',
        vibe_cert_session_id: sid, vibe_cert_code: '', vibe_cert_language: 'python',
        vibe_cert_evaluation: {},
      }).select('id').single();
      if (inserted?.id) dashboardRowIdRef.current = inserted.id;
    }
    return sid;
  }, [user?.id]);

  // ── VibeCodingWorkflow handlers ───────────────────────────────────────────
  const handleExecuteCode = useCallback(async (code: string, language: 'python' | 'javascript' | 'html') => {
    setCertCode(code);
    setCertLanguage(language);
    setIsExecuting(true);
    setExecResult(null);
    const result = await CodeExecutionService.executeCode(code, language);
    setExecResult(result);
    setIsExecuting(false);
    await ensureRecord();
    if (sessionIdRef.current && user?.id) {
      await supabase.from('dashboard').update({
        vibe_cert_code: code, vibe_cert_language: language,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('vibe_cert_session_id', sessionIdRef.current);
    }
    return result;
  }, [ensureRecord, user?.id]);

  const handleGetInstructionCritique = useCallback(async (instructions: string) => {
    const result = await chatJSON({ page: 'VibeCodingCertificationPage',
      messages: [{ role: 'user', content: `Evaluate these vibe coding instructions:\n\n${instructions}\n\nRubric:\n1. Problem Decomposition (0-3): breakdown into steps, inputs, outputs\n2. Prompt Engineering (0-3): specificity, constraints, success criteria\n\nRespond ONLY with JSON: {"problemDecomposition":{"score":0-3,"evidence":"...","improvement":"..."},"promptEngineering":{"score":0-3,"evidence":"...","improvement":"..."},"recommendation":"..."}` }],
      system: 'Evaluate coding instructions. Respond only with valid JSON.',
      max_tokens: 600, temperature: 0.3,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  }, []);

  const handleGenerateCodeFromInstructions = useCallback(async (instructions: string, language: 'python' | 'javascript' | 'html') => {
    const isHTML = language === 'html';
    const prompt = isHTML
      ? `Generate a complete, self-contained HTML file:\n\n${instructions}\n\nSingle file, embedded CSS+JS, mobile-friendly. Respond with ONLY the HTML file.`
      : `Generate ${language} code:\n\n${instructions}\n\nClean, well-commented, executable. Respond with ONLY the code.`;
    const code = await chatText({ page: 'VibeCodingCertificationPage',
      messages: [{ role: 'user', content: prompt }],
      system: isHTML ? 'Generate ONLY a complete HTML file, no markdown.' : `Generate ONLY executable ${language} code, no markdown.`,
      max_tokens: 2500, temperature: 0.5,
    });
    const clean = code.trim().replace(/^```(?:html|python|javascript|js)?\n/i, '').replace(/\n```$/i, '');
    setCertCode(clean);
    setCertLanguage(language);
    return clean;
  }, []);

  const handleGetDebuggingHelp = useCallback(async (code: string, error: string, instructions: string) => {
    return await chatText({ page: 'VibeCodingCertificationPage',
      messages: [{ role: 'user', content: `Student's code error:\n\nINSTRUCTIONS:\n${instructions}\n\nCODE:\n\`\`\`\n${code}\n\`\`\`\n\nERROR:\n${error}\n\nExplain the error simply, suggest one fix, and advise how to improve the instructions.` }],
      system: "You are a patient coding tutor. Help students learn from errors.",
      max_tokens: 500, temperature: 0.7,
    });
  }, []);

  // ── Open as Web Page ──────────────────────────────────────────────────────
  const handleOpenAsWebPage = useCallback(() => {
    if (!certCode.trim()) return;
    const html = (certLanguage === 'html' || CodeExecutionService.codeContainsHTML(certCode))
      ? certCode
      : `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Vibe Coding Output</title></head><body><script>try{${certCode}}catch(e){document.body.innerHTML='<p style="color:red">'+e.message+'</p>';}</script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [certCode, certLanguage]);

  // ── AI Coach chat ─────────────────────────────────────────────────────────
  const handleCoachSubmit = useCallback(async () => {
    if (!coachInput.trim() || coachSubmitting) return;
    const userMsg: CoachMessage = { role: 'user', content: coachInput.trim() };
    const updated = [...coachHistory, userMsg];
    setCoachHistory(updated);
    setCoachInput('');
    setCoachSubmitting(true);
    try {
      const messages: ClientChatMessage[] = updated.map(m => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));
      const response = await chatText({ page: 'VibeCodingCertificationPage',
        messages,
        system: `You are a vibe coding coach helping a student during their certification. The student is working on code that uses ${certLanguage}. Help them improve their prompts, understand errors, and iterate on their code. Be concise and encouraging.${certCode ? `\n\nTheir current code:\n\`\`\`${certLanguage}\n${certCode.slice(0, 1000)}\n\`\`\`` : ''}`,
        max_tokens: 300, temperature: 0.7,
      });
      setCoachHistory([...updated, { role: 'assistant', content: response }]);
    } catch {
      setCoachHistory([...updated, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally { setCoachSubmitting(false); }
  }, [coachInput, coachSubmitting, coachHistory, certCode, certLanguage]);

  // ── Evaluate ──────────────────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (!user?.id || isEvaluating || !certCode.trim()) return;
    setIsEvaluating(true); setEvalError(null);
    await ensureRecord();

    const scores: Record<string, { score: number; evidence: string }> = {};
    const newScores: AssessmentScore[] = [];

    try {
      for (const assessment of assessments) {
        setEvalProgress(`Evaluating: ${assessment.assessment_name}…`);

        const evalPrompt = `You are evaluating a student's Vibe Coding certification submission for the "${assessment.assessment_name}" criterion.

CRITERION: ${assessment.assessment_name}
DESCRIPTION: ${assessment.description}
ASSESSMENT QUESTION: ${assessment.certification_prompt}

RUBRIC:
- Level 0 (No Evidence): ${assessment.certification_level0_metric}
- Level 1 (Emerging): ${assessment.certification_level1_metric}
- Level 2 (Proficient): ${assessment.certification_level2_metric}
- Level 3 (Advanced): ${assessment.certification_level3_metric}

STUDENT'S CODE (${certLanguage}):
${certCode.slice(0, 5000)}

COACH CONVERSATION (prompt iteration history):
${coachHistory.map(m => `${m.role === 'assistant' ? 'Coach' : 'Student'}: ${m.content}`).join('\n').slice(0, 2000)}

Evaluate the code and prompt iteration evidence against this criterion. Be fair, specific, and constructive.

Respond ONLY in this JSON format:
{
  "score": <0, 1, 2, or 3>,
  "evidence": "<2-4 sentences referencing specific aspects of the code or prompt work>"
}`;

        const result = await chatJSON({ page: 'VibeCodingCertificationPage',
          messages: [{ role: 'user', content: evalPrompt }],
          system: 'You are an expert vibe coding educator evaluating a student submission. Be fair, specific, and constructive. Respond only with valid JSON.',
          max_tokens: 400, temperature: 0.3,
        });

        const score    = result.score    ?? 0;
        const evidence = result.evidence ?? 'Unable to evaluate.';
        scores[assessment.assessment_name] = { score, evidence };
        newScores.push({ assessment_name: assessment.assessment_name, score, evidence });
      }

      setEvalProgress('');
      setAssessmentScores(newScores);

      const avgCalc = newScores.reduce((s, a) => s + (a.score ?? 0), 0) / newScores.length;
      const allPass = newScores.every(s => (s.score ?? 0) >= 2);

      await supabase.from('dashboard').update({
        vibe_cert_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg: avgCalc },
        progress: allPass ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('vibe_cert_session_id', sessionIdRef.current!);

      // Dual-write to the shared evaluations table alongside the legacy
      // vibe_cert_evaluation jsonb column above — see src/lib/evaluations.ts.
      // The legacy column stays authoritative for this page's own read path.
      if (dashboardRowIdRef.current) {
        saveEvaluation(user.id, {
          dashboardId: dashboardRowIdRef.current,
          activityType: 'vibe_coding_certification',
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
  }, [user?.id, isEvaluating, certCode, certLanguage, assessments, coachHistory, ensureRecord]);

  // ── Certificate ───────────────────────────────────────────────────────────
  const generateCertificate = useCallback(async () => {
    if (!certName.trim()) return;
    setIsGenCert(true);
    try {
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) { alert('PDF not available.'); return; }
      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W   = doc.internal.pageSize.getWidth();
      const H   = doc.internal.pageSize.getHeight();

      const minScore  = Math.min(...assessmentScores.map(s => s.score ?? 0));
      const certLevel = minScore === 3 ? 'Advanced' : minScore >= 2 ? 'Proficient' : 'Emerging';
      const avg       = assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length;

      doc.setLineWidth(3); doc.setDrawColor(219, 39, 119);  doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(236, 72, 153);  doc.rect(15, 15, W - 30, H - 30);

      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(219, 39, 119);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });

      doc.setFontSize(20); doc.setTextColor(168, 85, 247);
      doc.text(`Vibe Coding Certification — ${certLevel}`, W / 2, 43, { align: 'center' });

      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the Vibe Coding Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to communicate intent clearly to AI, critique and refine prompts,', W / 2, 95, { align: 'center' });
      doc.text('generate working code, and iterate based on execution results.', W / 2, 102, { align: 'center' });

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(219, 39, 119);
      doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel} · Language: ${certLanguage.toUpperCase()}`, W / 2, 112, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
      doc.text('Assessment Competencies:', 20, 122);

      const cols = assessmentScores.length <= 4 ? 2 : 3;
      const colW = (W - 40) / cols;
      let yPos = 128; let col = 0;

      assessmentScores.forEach(sc => {
        const xPos      = 20 + col * colW;
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
      doc.text(`Certification ID: VIBE-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-VibeCoding-Certificate.pdf`);
    } catch (err) { console.error(err); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, certLanguage, branding]);

  // ── Voice bar ─────────────────────────────────────────────────────────────
  const renderVoiceBar = (textToRead: string) => (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-surface border border-hair rounded-xl mb-4">
      <span className="text-xs font-semibold text-muted flex items-center gap-1">
        <Volume2 size={13} className="text-accent" /> Voice:
      </span>
      <div className="flex rounded-full overflow-hidden border border-hair">
        {(['english', 'pidgin'] as const).map(m => (
          <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all border-r border-hair last:border-0 ${voiceMode === m ? 'bg-accent text-white' : 'bg-card text-muted hover:text-ink'}`}>
            {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
          </button>
        ))}
      </div>
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${isSpeaking ? 'bg-red-50 text-red-700 border-red-300' : 'bg-card text-accent border-hair hover:border-accent/40'}`}>
        {isSpeaking ? <><VolumeX size={12} /> Stop</> : <><Volume2 size={12} /> Read aloud</>}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex flex-col h-screen bg-paper">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-accent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-paper text-body overflow-hidden">
      <Navbar />

      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-hair flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Wand2 size={18} className="text-accent" />
              <span className="text-sm font-bold text-ink">Vibe Coding Certification</span>
            </div>
            <div className="flex items-center gap-1 ml-2">
              {(['overview', 'build', 'results', 'certificate'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors capitalize
                    ${view === v ? 'bg-accent/10 text-accent border-accent/40' : 'text-muted border-hair hover:text-ink hover:border-accent/30'}`}>
                  {v === 'certificate' ? '🏆 Cert' : v === 'build' ? '🛠️ Build' : v === 'results' ? '📊 Results' : '📋 Overview'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex rounded-full overflow-hidden border border-hair">
              {(['english', 'pidgin'] as const).map(m => (
                <button key={m} onClick={() => setVoiceMode(m)}
                  className={`flex items-center gap-1 px-2 py-1.5 text-xs font-bold transition-all border-r border-hair last:border-0 ${voiceMode === m ? 'bg-accent text-white' : 'bg-card text-muted hover:text-ink'}`}>
                  {m === 'english' ? '🇬🇧' : '🇳🇬'}
                </button>
              ))}
            </div>
            {view === 'build' && (
              <button onClick={handleEvaluate}
                disabled={isEvaluating || !certCode.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-full transition-colors disabled:opacity-50">
                {isEvaluating ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />}
                {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit for Evaluation'}
              </button>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            OVERVIEW
        ═══════════════════════════════════════════════════════════════ */}
        {view === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {dataError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-xl flex gap-2 text-sm text-red-800">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{dataError}
              </div>
            )}

            {renderVoiceBar(lvl <= 1
              ? 'Welcome to the Vibe Coding Certification. You will write instructions, critique them, generate code, and run it.'
              : 'Welcome to the Vibe Coding Certification. Use the 4-phase workflow to build working code, then submit it for evaluation.')}

            {/* Hero */}
            <div className="p-6 bg-surface border border-hair rounded-2xl mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-accent/10 rounded-xl"><Wand2 size={24} className="text-accent" /></div>
                <div>
                  <h1 className="text-xl font-bold text-ink">Vibe Coding Certification</h1>
                  <p className="text-muted text-sm">Prompt Engineering · AI-Assisted Code Generation · Iterative Development</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="Prompt Engineering · AI-Assisted Code Generation · Iterative Development"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <p className="text-body text-sm leading-relaxed">
                {lvl <= 1
                  ? 'In this certification, you write instructions in plain English, let AI critique and improve them, then generate and run real code. You will be judged on how clearly you communicated what you wanted and how well you iterated to make it work.'
                  : 'Demonstrate your vibe coding skills by writing precise instructions, critiquing and refining them through AI feedback, generating working code, and iterating based on execution results. Your work is evaluated against professional rubric criteria covering prompt quality, code correctness, and iterative improvement.'}
              </p>
            </div>

            {/* How it works */}
            <div className="p-4 bg-card border border-hair rounded-xl mb-5">
              <p className="text-xs font-bold text-muted uppercase mb-3">🗺️ How the Certification Works</p>
              <div className="space-y-2.5">
                {[
                  { step: '1', icon: '✍️', label: 'Write Your Instructions', desc: lvl <= 1 ? 'Describe what you want the code to do in plain English.' : 'Write clear, specific instructions describing the program you want to build.' },
                  { step: '2', icon: '🔍', label: 'Get a Critique', desc: lvl <= 1 ? 'AI will score your instructions and tell you how to improve them.' : 'AI evaluates your instructions against a rubric and gives targeted improvement suggestions.' },
                  { step: '3', icon: '⚡', label: 'Generate & Run Code', desc: lvl <= 1 ? 'AI builds your code. You run it to see if it works.' : 'AI generates code from your instructions. Run it to verify it works as expected.' },
                  { step: '4', icon: '🔁', label: 'Iterate', desc: lvl <= 1 ? 'If something is wrong, fix your instructions and try again.' : 'Debug errors, refine your prompt, and regenerate until the output is correct.' },
                  { step: '5', icon: '🏆', label: 'Submit for Evaluation', desc: lvl <= 1 ? 'When your code works, click "Submit for Evaluation" to get your score.' : 'Submit when your code runs successfully. AI evaluates your full submission against the rubric.' },
                ].map(({ step, icon, label, desc }) => (
                  <div key={step} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center mt-0.5">{step}</span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{icon} {label}</p>
                      <p className="text-xs text-muted leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
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

            {/* Score summary if any */}
            {anyScored && overallAvg !== null && (
              <div className="p-4 bg-surface border border-hair rounded-xl mb-5 flex items-center gap-4">
                <Trophy size={28} className="text-accent flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted uppercase font-bold">Your current score</p>
                  <p className="text-2xl font-black text-ink">{overallAvg.toFixed(1)}<span className="text-base font-normal text-muted">/3.0</span></p>
                </div>
                {allProficient && (
                  <div className="ml-auto">
                    <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">
                      🏆 Eligible for Certificate
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white rounded-xl transition-colors">
                {anyScored ? <><RefreshCw size={16} /> Continue Building</> : <><Wand2 size={16} /> Start Building</>}
              </button>
              {anyScored && (
                <button onClick={() => setView('results')}
                  className="px-4 py-3 text-sm font-bold text-accent border border-hair bg-card hover:border-accent/40 rounded-xl transition-colors">
                  View Results →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            BUILD
        ═══════════════════════════════════════════════════════════════ */}
        {view === 'build' && (
          <div className="flex-1 flex overflow-hidden">

            {/* LEFT: VibeCodingWorkflow */}
            <div className="w-1/2 flex-shrink-0 overflow-y-auto p-4 border-r border-hair bg-surface">
              <VibeCodingWorkflow
                onExecuteCode={handleExecuteCode}
                onGetAICritique={handleGetInstructionCritique}
                onGenerateCode={handleGenerateCodeFromInstructions}
                onGetDebuggingHelp={handleGetDebuggingHelp}
                injectedInstructions={injectedInstructions}
                onInstructionsInjected={() => setInjectedInstructions(null)}
              />
            </div>

            {/* RIGHT: Code output + Run button + AI coach */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Code output panel */}
              <div className="flex-shrink-0 border-b border-hair">
                <div className="flex items-center justify-between px-4 py-2 bg-surface">
                  <div className="flex items-center gap-2">
                    <Code size={13} className="text-accent" />
                    <span className="text-xs font-bold text-body">Generated Code</span>
                    {certLanguage && (
                      <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full font-bold">{certLanguage.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isWebViewable && certCode && (
                      <button onClick={handleOpenAsWebPage}
                        className="flex items-center gap-1 px-2.5 py-1 bg-card border border-hair hover:border-accent/40 text-ink text-xs font-semibold rounded transition-colors">
                        <Globe size={11} /> Open as Web Page
                      </button>
                    )}
                    <button onClick={handleEvaluate}
                      disabled={isEvaluating || !certCode.trim()}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-full transition-colors disabled:opacity-50">
                      {isEvaluating ? <Loader2 size={11} className="animate-spin" /> : <Award size={11} />}
                      {isEvaluating ? evalProgress || 'Evaluating…' : 'Submit for Evaluation'}
                    </button>
                  </div>
                </div>

                {certCode ? (
                  <pre className="bg-ink text-green-400 px-4 py-3 text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
                    {certCode.slice(0, 2000)}{certCode.length > 2000 ? '\n… (truncated)' : ''}
                  </pre>
                ) : (
                  <div className="px-4 py-6 text-center text-muted text-xs">
                    Generated code will appear here after Phase 3 in the workflow →
                  </div>
                )}

                {/* Execution result */}
                {(isExecuting || execResult) && (
                  <div className={`px-4 py-3 border-t border-hair ${execResult?.error ? 'bg-red-50' : 'bg-green-50'}`}>
                    <p className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1">
                      {isExecuting
                        ? <><Loader2 size={10} className="animate-spin text-muted" /><span className="text-muted">Running…</span></>
                        : execResult?.error
                          ? <><AlertCircle size={10} className="text-red-700" /><span className="text-red-700">Error</span></>
                          : <><CheckCircle size={10} className="text-green-700" /><span className="text-green-700">Output</span></>}
                    </p>
                    {execResult && (
                      <pre className="text-xs font-mono whitespace-pre-wrap text-body max-h-24 overflow-y-auto">
                        {execResult.error || execResult.output || '(no output)'}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              {/* AI Coach chat */}
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-4 py-2 bg-surface border-b border-hair flex-shrink-0">
                  <p className="text-xs font-bold text-body flex items-center gap-1.5">
                    <Bot size={13} className="text-accent" /> AI Coach
                  </p>
                  <p className="text-[10px] text-muted">Ask anything to improve your prompt or fix your code</p>
                </div>

                <div ref={coachRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                  {coachHistory.map((msg, i) => (
                    <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      {msg.role === 'assistant' && (
                        <div className="flex-shrink-0 h-6 w-6 rounded-full bg-accent/10 flex items-center justify-center">
                          <Bot size={12} className="text-accent" />
                        </div>
                      )}
                      <div className={`max-w-xs rounded-lg px-3 py-2 text-xs leading-relaxed ${msg.role === 'assistant' ? 'text-body' : 'bg-card border border-hair text-body'}`}>
                        {msg.role === 'assistant' ? (
                          <>
                            <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                            <AIPidginCoachWrapper englishText={msg.content} />
                          </>
                        ) : (
                          msg.content
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="flex-shrink-0 h-6 w-6 rounded-full bg-accent flex items-center justify-center">
                          <User size={12} className="text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                  {coachSubmitting && (
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-accent/10 flex items-center justify-center">
                        <Bot size={12} className="text-accent" />
                      </div>
                      <div className="bg-card border border-hair rounded-lg px-3 py-2 flex gap-1">
                        {[0,1,2].map(d => <div key={d} className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0 px-3 py-2 border-t border-hair flex gap-2">
                  <input
                    value={coachInput}
                    onChange={e => setCoachInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCoachSubmit(); } }}
                    placeholder="Ask the coach…"
                    disabled={coachSubmitting}
                    className="flex-1 bg-paper border border-hair rounded-full px-3 py-1.5 text-xs text-ink placeholder-muted outline-none focus:border-accent transition-colors"
                  />
                  <button onClick={handleCoachSubmit} disabled={!coachInput.trim() || coachSubmitting}
                    className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-xs font-semibold rounded-full transition-colors">
                    <Send size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            RESULTS
        ═══════════════════════════════════════════════════════════════ */}
        {view === 'results' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
            {renderVoiceBar(anyScored
              ? `Your Vibe Coding Certification results. Overall average: ${overallAvg?.toFixed(1)} out of 3.`
              : 'Submit your project for evaluation to see your results here.')}

            {!anyScored ? (
              <div className="text-center py-16 space-y-4">
                <ClipboardList size={48} className="text-muted mx-auto" />
                <p className="text-muted">{lvl <= 1
                  ? 'You have not been evaluated yet. Go to Build and submit your code.'
                  : 'No evaluation data yet. Build your project and click Submit for Evaluation.'}</p>
                <button onClick={() => setView('build')} className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-colors">
                  <Wand2 size={16} /> Go to Build
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-5 p-5 bg-surface border border-hair rounded-2xl">
                  <Trophy size={40} className="text-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted uppercase font-bold">Overall Score</p>
                    <p className="text-4xl font-black text-ink">{overallAvg?.toFixed(1)}<span className="text-lg font-normal text-muted">/3.0</span></p>
                    <p className={`text-sm font-bold mt-0.5 ${allProficient ? 'text-green-700' : 'text-yellow-700'}`}>
                      {allProficient
                        ? '🏆 Proficiency Achieved — Certificate Eligible'
                        : `${assessmentScores.filter(s => (s.score ?? 0) >= 2).length}/${assessmentScores.length} criteria at Proficient or above`}
                    </p>
                  </div>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-colors text-sm">
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
                                <div className={`h-full rounded-full transition-all ${sc.score === 3 ? 'bg-green-600' : sc.score === 2 ? 'bg-blue-600' : sc.score === 1 ? 'bg-yellow-600' : 'bg-red-600'}`}
                                  style={{ width: `${((sc.score ?? 0) / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={14} className="text-muted flex-shrink-0" /> : <ChevronDown size={14} className="text-muted flex-shrink-0" />}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-hair pt-3 space-y-2">
                            {sc.evidence && (
                              <ReactMarkdown components={markdownComponents}>{sc.evidence}</ReactMarkdown>
                            )}
                            {assessment && sc.score !== null && sc.score < 2 && (
                              <div className="p-2 bg-blue-50 rounded-lg">
                                <p className="text-[10px] font-bold text-blue-700 uppercase mb-1">To reach Proficient:</p>
                                <ReactMarkdown components={markdownComponents}>{assessment.certification_level2_metric}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {evalError && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded-xl flex gap-2 text-sm text-red-800">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setView('build')}
                    className="flex items-center gap-2 px-5 py-2.5 border border-hair bg-card hover:border-accent/40 text-ink font-bold rounded-xl transition-colors text-sm">
                    <Wand2 size={15} /> Continue Building
                  </button>
                  <button onClick={handleEvaluate} disabled={isEvaluating || !certCode.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-sm">
                    {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    Re-evaluate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            CERTIFICATE
        ═══════════════════════════════════════════════════════════════ */}
        {view === 'certificate' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-5">
            {renderVoiceBar('Enter your name to generate your Vibe Coding Certificate.')}

            {!allProficient && (
              <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl text-yellow-800 text-sm flex gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                {lvl <= 1
                  ? 'You need a score of 2 or more on all criteria to get your certificate. Keep building and re-submit!'
                  : 'Proficient (2/3) on all criteria is required for certification. Continue iterating and re-evaluate.'}
              </div>
            )}

            {allProficient && (
              <>
                <div className="p-6 bg-surface border border-hair rounded-2xl text-center space-y-4">
                  <Trophy size={48} className="text-accent mx-auto" />
                  <div>
                    <h2 className="text-xl font-bold text-ink">🎓 Certification Achieved!</h2>
                    <p className="text-sm text-body mt-1">
                      {lvl <= 1
                        ? 'Well done! You showed you can describe code clearly, improve your instructions, and build something that works. Enter your name to download your certificate.'
                        : 'You have demonstrated Proficient or Advanced performance across all Vibe Coding criteria. Enter your name to generate your certificate.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {assessmentScores.map(sc => {
                      const { text, color } = scoreLabel(sc.score);
                      return (
                        <div key={sc.assessment_name} className="flex items-center justify-between px-3 py-1.5 bg-card border border-hair rounded-lg">
                          <span className="text-body truncate">{sc.assessment_name}</span>
                          <span className={`font-bold flex-shrink-0 ml-2 ${color}`}>{text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1.5">
                      {lvl <= 1 ? 'Your full name (for the certificate):' : 'Full name as it should appear on the certificate:'}
                    </label>
                    <input
                      type="text" value={certName} onChange={e => setCertName(e.target.value)}
                      placeholder="e.g. Amara Johnson"
                      className="w-full bg-paper border border-hair rounded-xl px-4 py-3 text-ink placeholder-muted outline-none focus:border-accent text-base"
                    />
                  </div>
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-bold rounded-xl transition-colors">
                    {isGenCert ? <><Loader2 size={18} className="animate-spin" /> Generating PDF…</> : <><Download size={18} /> Download Certificate</>}
                  </button>
                  <p className="text-center text-xs text-muted">
                    {`${branding.institutionName} Programme`}
                  </p>
                </div>
              </>
            )}

            <button onClick={() => setView('overview')}
              className="w-full py-2 text-xs text-muted hover:text-ink transition-colors">
              ← Back to Overview
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default VibeCodingCertificationPage;
