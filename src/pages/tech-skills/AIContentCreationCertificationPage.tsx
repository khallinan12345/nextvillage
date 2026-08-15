// src/pages/tech-skills/AIContentCreationCertificationPage.tsx
//
// AI Content Creation Certification
// Framework: mirrors the other tech-skills certifications
// Build environment: a 7-section Content Portfolio covering the full
//   Understand → Create → Polish journey from AIContentCreationPage.
// Tagline: "Create content that informs, persuades, and connects."
//
// Dashboard columns (new):
//   content_cert_session_id  (text)
//   content_cert_portfolio   (jsonb) — the 7-section ContentPortfolio
//   content_cert_evaluation  (jsonb) — per-criterion scores
// Activity stored as: 'AI Content Creation Certification'

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
  PenLine, Award, Trophy, Loader2, Download,
  AlertCircle, Volume2, VolumeX, ChevronDown, ChevronUp,
  Wand2, Star, CheckCircle, BarChart3, ArrowRight,
  Globe, MessageSquare, Mail, Video, Gift, Megaphone,
  Target, Users, Eye, FileText, RefreshCw,
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
}

interface AssessmentScore {
  assessment_name: string;
  score: number | null;
  evidence: string | null;
}

type ContentType =
  | 'blog_post' | 'social_media' | 'email' | 'video_script'
  | 'grant_proposal' | 'product_description' | 'press_release' | 'story';

interface ContentPortfolio {
  contentType:       ContentType | '';
  audience:          string;
  purpose:           string;
  keyIdeas:          string;
  draft:             string;
  refinedDraft:      string;
  platformPlan:      string;
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'AI Content Creation';
const CERT_ACTIVITY = 'AI Content Creation Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);

const EMPTY_PORTFOLIO: ContentPortfolio = {
  contentType: '', audience: '', purpose: '',
  keyIdeas: '', draft: '', refinedDraft: '', platformPlan: '',
};

const CONTENT_TYPES: { id: ContentType; label: string; icon: React.ReactNode; colour: string }[] = [
  { id: 'blog_post',           label: 'Blog Post',           icon: <Globe size={14} />,         colour: 'text-blue-400'    },
  { id: 'social_media',        label: 'Social Media',        icon: <MessageSquare size={14} />, colour: 'text-accent'    },
  { id: 'email',               label: 'Email / Newsletter',  icon: <Mail size={14} />,          colour: 'text-amber-400'   },
  { id: 'video_script',        label: 'Video Script',        icon: <Video size={14} />,         colour: 'text-red-400'     },
  { id: 'grant_proposal',      label: 'Grant / Proposal',    icon: <Gift size={14} />,          colour: 'text-accent' },
  { id: 'product_description', label: 'Product Description', icon: <Star size={14} />,          colour: 'text-accent'  },
  { id: 'press_release',       label: 'Press Release',       icon: <Megaphone size={14} />,     colour: 'text-accent'    },
  { id: 'story',               label: 'Short Story',         icon: <PenLine size={14} />,       colour: 'text-accent'  },
];

const PORTFOLIO_SECTIONS: {
  key: keyof ContentPortfolio; label: string; icon: React.ReactNode;
  colour: string; placeholder: string; tip: string; rows: number;
}[] = [
  {
    key: 'audience', label: '1. Your Audience', icon: <Users size={13} />,
    colour: 'border-blue-500/40 bg-blue-500/5',
    placeholder: 'Describe your ideal reader in detail — their age, location, daily challenges, what they care about, and where they consume content.',
    tip: 'The more specific your audience, the more powerful your content becomes. Avoid "everyone".',
    rows: 3,
  },
  {
    key: 'purpose', label: '2. Your Purpose & Hook', icon: <Target size={13} />,
    colour: 'border-accent/40 bg-accent/5',
    placeholder: 'Complete this sentence: "After reading this, I want my audience to ___." Then write your opening hook — the first 1–2 lines that earn their attention.',
    tip: 'A single clear goal and a strong hook are the two most important elements of effective content.',
    rows: 3,
  },
  {
    key: 'keyIdeas', label: '3. Key Ideas & Research', icon: <FileText size={13} />,
    colour: 'border-accent/40 bg-accent/5',
    placeholder: 'List 4–6 key points, facts, stories, or examples you will include. One real story or specific example is worth ten general statements.',
    tip: 'Raw material first — ideas, facts, stories. Structure comes after.',
    rows: 4,
  },
  {
    key: 'draft', label: '4. First Draft', icon: <PenLine size={13} />,
    colour: 'border-amber-500/40 bg-amber-500/5',
    placeholder: 'Write your full first draft here. Beginning, middle, end. Include a clear call to action. Do not edit as you write — just get it out.',
    tip: 'The first draft\'s only job is to exist. You cannot edit a blank page.',
    rows: 8,
  },
  {
    key: 'refinedDraft', label: '5. Refined Draft', icon: <Eye size={13} />,
    colour: 'border-accent/40 bg-accent/5',
    placeholder: 'Paste your improved version here. Cut unnecessary words, activate passive voice, sharpen your voice and personality, strengthen your call to action.',
    tip: 'Read it aloud. If you stumble, the sentence needs editing. Short, active sentences always win.',
    rows: 8,
  },
  {
    key: 'platformPlan', label: '6. Platform & Distribution Plan', icon: <Globe size={13} />,
    colour: 'border-accent/40 bg-accent/5',
    placeholder: 'Where will you publish this? Adapt it: what changes for a different platform? Write your subject line / caption / headline. Describe your distribution plan.',
    tip: 'The same content needs different packaging for each platform. Headlines, captions, and hashtags are skills.',
    rows: 4,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-muted',      bg: 'bg-gray-100',   border: 'border-gray-300'   };
  if (s === 3)    return { text: 'Advanced',     color: 'text-green-800',  bg: 'bg-green-100',  border: 'border-green-300'  };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-800',   bg: 'bg-blue-100',   border: 'border-blue-300'   };
  if (s === 1)    return { text: 'Emerging',     color: 'text-yellow-800', bg: 'bg-yellow-100', border: 'border-yellow-300' };
  return               { text: 'No Evidence',  color: 'text-red-800',    bg: 'bg-red-100',    border: 'border-red-300'    };
};

const portfolioFilled = (p: ContentPortfolio) =>
  Object.entries(p).filter(([k, v]) => k !== 'contentType' && (v as string).trim().length > 20).length;

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

// ─── Content Portfolio Panel ──────────────────────────────────────────────────

const ContentPortfolioPanel: React.FC<{
  portfolio: ContentPortfolio;
  onChange: (key: keyof ContentPortfolio, value: string) => void;
  activeSection: keyof ContentPortfolio | null;
  showTips: boolean;
}> = ({ portfolio, onChange, activeSection, showTips }) => (
  <div className="h-full overflow-y-auto p-3 space-y-2.5">
    <div className="flex items-center justify-between mb-1 sticky top-0 bg-paper backdrop-blur-sm py-1 z-10">
      <p className="text-[10px] font-bold text-muted uppercase tracking-wide">Content Portfolio</p>
      <p className="text-[10px] text-muted">
        {portfolioFilled(portfolio)}/{PORTFOLIO_SECTIONS.length} sections filled
      </p>
    </div>

    {/* Content type selector */}
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
      <p className="text-[10px] font-bold text-accent uppercase tracking-wide mb-2 flex items-center gap-1">
        <PenLine size={11} /> Content Type
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {CONTENT_TYPES.map(t => (
          <button key={t.id} onClick={() => onChange('contentType', t.id)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all border
              ${portfolio.contentType === t.id
                ? 'bg-accent/30 border-accent/60 text-accent font-bold'
                : 'bg-card border-hair text-muted hover:text-body hover:border-accent/40'}`}>
            <span className={portfolio.contentType === t.id ? 'text-accent' : t.colour}>{t.icon}</span>
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>
      {portfolio.contentType && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-accent">
          <CheckCircle size={10} className="text-accent" />
          {CONTENT_TYPES.find(t => t.id === portfolio.contentType)?.label} selected ✓
        </div>
      )}
    </div>

    {PORTFOLIO_SECTIONS.map(section => {
      const isActive = activeSection === section.key;
      const isFilled = (portfolio[section.key] as string).trim().length > 20;
      return (
        <div key={section.key}
          className={`rounded-xl border p-3 transition-all ${section.colour} ${isActive ? 'ring-2 ring-accent/60 shadow-lg shadow-violet-500/10' : ''}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={isFilled ? 'text-accent' : 'text-muted'}>{section.icon}</span>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${isFilled ? 'text-body' : 'text-muted'}`}>
              {section.label}
            </p>
            {isActive && <span className="ml-auto text-[9px] text-accent font-bold animate-pulse">● Active</span>}
            {isFilled && !isActive && <span className="ml-auto text-[9px] text-accent">✓</span>}
          </div>
          {showTips && !isFilled && (
            <p className="text-[9px] text-muted italic mb-1.5">💡 {section.tip}</p>
          )}
          <textarea
            value={portfolio[section.key] as string}
            onChange={e => onChange(section.key, e.target.value)}
            rows={section.rows}
            placeholder={section.placeholder}
            className="w-full bg-transparent text-xs text-body placeholder-muted resize-none outline-none leading-relaxed" />
        </div>
      );
    })}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const AIContentCreationCertificationPage: React.FC = () => {
  const { user } = useAuth();

  const [view, setView] = useState<ViewMode>('overview');

  // ── Assessments ───────────────────────────────────────────────────────
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [loadingData,      setLoadingData]      = useState(true);
  const [dataError,        setDataError]        = useState<string | null>(null);

  // ── Personality ───────────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState(1);

  // ── Voice ─────────────────────────────────────────────────────────────
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
  const [sessionId,  setSessionId]  = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const dashboardRowIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Portfolio ─────────────────────────────────────────────────────────
  const [portfolio,      setPortfolio]      = useState<ContentPortfolio>(EMPTY_PORTFOLIO);
  const [activeSection,  setActiveSection]  = useState<keyof ContentPortfolio | null>(null);
  const [showTips,       setShowTips]       = useState(true);

  // ── AI assistance ─────────────────────────────────────────────────────
  const [activeKey,    setActiveKey]    = useState<keyof ContentPortfolio>('audience');
  const [prompt,       setPrompt]       = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [expandedCrit, setExpandedCrit] = useState<string | null>(null);

  // ── Evaluation ────────────────────────────────────────────────────────
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError,    setEvalError]    = useState<string | null>(null);
  const [evalProgress, setEvalProgress] = useState('');

  // ── Certificate ───────────────────────────────────────────────────────
  const [certName,  setCertName]  = useState('');
  const [isGenCert, setIsGenCert] = useState(false);

  const lvl           = communicationLevel;
  const filledCount   = portfolioFilled(portfolio);
  const allProficient = assessmentScores.length > 0 && assessmentScores.every(s => (s.score ?? 0) >= 2);
  const anyScored     = assessmentScores.some(s => s.score !== null);
  const overallAvg    = anyScored ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length : null;
  const portfolioReady = filledCount >= 4 && !!portfolio.contentType;

  const speak      = (text: string) => hookSpeak(text.slice(0, 400));
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

      const evalData = dash?.content_cert_evaluation as any;
      const scores: AssessmentScore[] = (aData || []).map(a => ({
        assessment_name: a.assessment_name,
        score:    evalData?.scores?.[a.assessment_name]?.score ?? null,
        evidence: evalData?.scores?.[a.assessment_name]?.evidence ?? null,
      }));
      setAssessmentScores(scores);

      if (dash?.content_cert_portfolio) {
        try {
          const saved = typeof dash.content_cert_portfolio === 'string'
            ? JSON.parse(dash.content_cert_portfolio) : dash.content_cert_portfolio;
          if (saved && typeof saved === 'object') setPortfolio({ ...EMPTY_PORTFOLIO, ...saved });
        } catch {}
      }
      if (dash?.content_cert_session_id) { setSessionId(dash.content_cert_session_id); sessionIdRef.current = dash.content_cert_session_id; }

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
        content_cert_session_id: sid,
        content_cert_portfolio: EMPTY_PORTFOLIO,
        content_cert_evaluation: {},
      }).select('id').single();
      if (inserted?.id) dashboardRowIdRef.current = inserted.id;
    }
    return sid;
  }, [user?.id]);

  // ── Persist portfolio ─────────────────────────────────────────────────
  const persistPortfolio = useCallback(async (p: ContentPortfolio) => {
    const sid = sessionIdRef.current; if (!user?.id || !sid) return;
    await supabase.from('dashboard').update({
      content_cert_portfolio: p,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('content_cert_session_id', sid);
  }, [user?.id]);

  const handlePortfolioChange = useCallback((key: keyof ContentPortfolio, value: string) => {
    setPortfolio(prev => ({ ...prev, [key]: value }));
    setActiveSection(key);
  }, []);

  // ── Save portfolio ────────────────────────────────────────────────────
  const handleSavePortfolio = useCallback(async () => {
    await ensureRecord();
    await persistPortfolio(portfolio);
  }, [ensureRecord, persistPortfolio, portfolio]);

  // ── AI assist ─────────────────────────────────────────────────────────
  const handleAIAssist = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setGenError(null); setAiSuggestion(null);
    await ensureRecord();

    const sectionMeta = PORTFOLIO_SECTIONS.find(s => s.key === activeKey);
    const contentTypeMeta = CONTENT_TYPES.find(t => t.id === portfolio.contentType);
    const currentValue = portfolio[activeKey] as string;

    const systemPrompt = `You are an expert content creation coach at the ${branding.institutionName}.
You help students create professional, audience-centred content using AI. Your feedback is specific, encouraging, and actionable.
Respond in clear, simple English suitable for a learner with communication level ${lvl} out of 3.`;

    const userPrompt = `A student is working on their AI Content Creation Certification.

CONTENT TYPE: ${contentTypeMeta?.label || 'Not yet selected'}
SECTION: ${sectionMeta?.label || activeKey}
SECTION GUIDANCE: ${sectionMeta?.tip || ''}

WHAT THEY CURRENTLY HAVE IN THIS SECTION:
${currentValue.trim() ? `"${currentValue.trim().slice(0, 500)}"` : '(Empty — nothing written yet)'}

AUDIENCE CONTEXT: ${portfolio.audience.trim() ? portfolio.audience.trim().slice(0, 200) : 'Not yet defined'}
PURPOSE CONTEXT: ${portfolio.purpose.trim() ? portfolio.purpose.trim().slice(0, 200) : 'Not yet defined'}

STUDENT'S PROMPT: ${prompt.trim()}

Provide specific, actionable help for this section. If they have content, improve or build on it.
If the section is empty, give them a strong starting example they can adapt.
Keep your response focused on this one section. Max 200 words.`;

    try {
      const result = await chatJSON({ page: 'AIContentCreationCertificationPage',
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt + '\n\nRespond ONLY in this JSON format: { "suggestion": "...", "tip": "...", "applyDirectly": true/false }',
        max_tokens: 500, temperature: 0.5,
      });

      const suggestion = result.suggestion || result.content || result.response || '';
      setAiSuggestion(suggestion);

      if (result.applyDirectly && suggestion) {
        setPortfolio(prev => ({ ...prev, [activeKey]: suggestion }));
        setActiveSection(activeKey);
      }
    } catch (err: any) {
      setGenError(err.message || 'AI assistance failed. Please try again.');
    } finally {
      setIsGenerating(false);
      setPrompt('');
    }
  }, [prompt, isGenerating, activeKey, portfolio, lvl, ensureRecord]);

  // ── Evaluate ──────────────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    if (isEvaluating || !user?.id) return;
    setIsEvaluating(true); setEvalError(null); setEvalProgress('Preparing evaluation…');
    await ensureRecord();

    const contentTypeMeta = CONTENT_TYPES.find(t => t.id === portfolio.contentType);
    const portfolioSummary = [
      `CONTENT TYPE: ${contentTypeMeta?.label || 'Not selected'}`,
      `SECTIONS COMPLETED: ${filledCount}/${PORTFOLIO_SECTIONS.length}`,
      '',
      `1. AUDIENCE:\n${portfolio.audience || '(empty)'}`,
      `2. PURPOSE & HOOK:\n${portfolio.purpose || '(empty)'}`,
      `3. KEY IDEAS:\n${portfolio.keyIdeas || '(empty)'}`,
      `4. FIRST DRAFT:\n${portfolio.draft || '(empty)'}`,
      `5. REFINED DRAFT:\n${portfolio.refinedDraft || '(empty)'}`,
      `6. PLATFORM PLAN:\n${portfolio.platformPlan || '(empty)'}`,
    ].join('\n');

    const scores: Record<string, any> = {};
    const newScores: AssessmentScore[] = [];

    try {
      for (const assessment of assessments) {
        setEvalProgress(`Evaluating: ${assessment.assessment_name}…`);

        const evalPrompt = `You are evaluating a student's AI Content Creation certification portfolio for the "${assessment.assessment_name}" criterion.

The student has built a content portfolio — a structured piece of content following the Understand → Create → Polish framework.

CRITERION: ${assessment.assessment_name}
DESCRIPTION: ${assessment.description}
ASSESSMENT QUESTION: ${assessment.certification_prompt}

RUBRIC:
- Level 0 (No Evidence): ${assessment.certification_level0_metric}
- Level 1 (Emerging): ${assessment.certification_level1_metric}
- Level 2 (Proficient): ${assessment.certification_level2_metric}
- Level 3 (Advanced): ${assessment.certification_level3_metric}

STUDENT'S FULL CONTENT PORTFOLIO:
${portfolioSummary}

Evaluate the portfolio against this specific criterion. Reference actual content from the portfolio in your evidence. Be fair, specific, and constructive.

Respond ONLY in this JSON format:
{
  "score": <0, 1, 2, or 3>,
  "evidence": "<2-4 sentences referencing specific content from the portfolio>"
}`;

        const result = await chatJSON({ page: 'AIContentCreationCertificationPage',
          messages: [{ role: 'user', content: evalPrompt }],
          system: 'You are an expert content creation educator evaluating a student\'s content portfolio. Be fair, specific, and constructive. Reward clarity, audience awareness, and purposeful writing.',
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

      await supabase.from('dashboard').update({
        content_cert_evaluation: { scores, evaluatedAt: new Date().toISOString(), overallAvg: avgCalc },
        progress: allPass ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id).eq('content_cert_session_id', sessionIdRef.current!);

      // Dual-write to the shared evaluations table alongside the legacy
      // content_cert_evaluation jsonb column above — see src/lib/evaluations.ts.
      // The legacy column stays authoritative for this page's own read path.
      if (dashboardRowIdRef.current) {
        saveEvaluation(user.id, {
          dashboardId: dashboardRowIdRef.current,
          activityType: 'ai_content_creation_certification',
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
  }, [user?.id, isEvaluating, portfolio, assessments, filledCount, ensureRecord]);

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
      const contentTypeMeta = CONTENT_TYPES.find(t => t.id === portfolio.contentType);

      // Violet theme for content creation
      doc.setLineWidth(3); doc.setDrawColor(124, 58, 237); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(167, 139, 250); doc.rect(15, 15, W - 30, H - 30);

      doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(124, 58, 237);
      doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });
      doc.setFontSize(20); doc.setTextColor(167, 139, 250);
      doc.text(`AI Content Creation Certification — ${certLevel}`, W / 2, 43, { align: 'center' });
      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });
      doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

      doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      doc.text(certName.trim(), W / 2, 78, { align: 'center' });

      doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text('For successfully completing the AI Content Creation Certification,', W / 2, 88, { align: 'center' });
      doc.text('demonstrating the ability to understand an audience, define a clear purpose, research and draft', W / 2, 95, { align: 'center' });
      doc.text('compelling content, refine it with AI, and adapt it across platforms.', W / 2, 102, { align: 'center' });

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(124, 58, 237);
      doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel} · Content Type: ${contentTypeMeta?.label || 'Mixed'} · Portfolio: ${filledCount}/6 sections`, W / 2, 112, { align: 'center' });

      // Purpose excerpt
      if (portfolio.purpose.trim()) {
        doc.setFontSize(11); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
        const purposeText = `Purpose: "${portfolio.purpose.trim().slice(0, 120)}${portfolio.purpose.length > 120 ? '…' : ''}"`;
        doc.text(purposeText, W / 2, 120, { align: 'center', maxWidth: W - 40 });
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
      doc.text(`Certification ID: CONTENT-${makeId().toUpperCase()}`, W - 20, footerY, { align: 'right' });

      doc.save(`${certName.trim().replace(/\s+/g, '-')}-AIContent-Certificate.pdf`);
    } catch (err) { console.error(err); }
    finally { setIsGenCert(false); }
  }, [certName, assessmentScores, filledCount, portfolio, branding]);

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

      {/* Voice fallback */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-hair flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <PenLine size={18} className="text-accent" />
              <span className="text-sm font-bold text-ink">AI Content Creation</span>
              <span className="text-xs text-accent font-semibold border border-accent/30 px-2 py-0.5 rounded-full">Certification</span>
            </div>
            <div className="w-px h-5 bg-hair flex-shrink-0" />
            {portfolio.contentType && (
              <div className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-accent/10 border border-accent/25 rounded-full flex-shrink-0">
                <span className={`text-[10px] font-bold ${CONTENT_TYPES.find(t => t.id === portfolio.contentType)?.colour ?? 'text-accent'}`}>
                  {CONTENT_TYPES.find(t => t.id === portfolio.contentType)?.label}
                </span>
              </div>
            )}
            {anyScored && overallAvg !== null && (
              <div className={`hidden sm:flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border
                ${allProficient ? 'text-accent border-accent/30 bg-accent/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}>
                {allProficient ? '🎓 Certified' : `Avg ${overallAvg.toFixed(1)}/3`}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Voice toggle */}
            <div className="flex rounded-lg overflow-hidden border border-hair">
              {(['english', 'pidgin'] as const).map(m => (
                <button key={m} onClick={() => setVoiceMode(m)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold transition-all border-r border-hair last:border-0
                    ${voiceMode === m ? 'bg-accent text-white' : 'bg-card text-muted hover:bg-hair hover:text-ink'}`}>
                  {m === 'english' ? '🇬🇧' : '🇳🇬'} <span className="hidden lg:inline">{m === 'english' ? 'English' : 'Pidgin'}</span>
                </button>
              ))}
            </div>

            {/* Nav tabs */}
            {(['overview', 'build', 'results'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors capitalize
                  ${view === v ? 'bg-accent text-ink' : 'text-muted hover:text-ink hover:bg-hair'}`}>
                {v === 'build' ? '📝 Build' : v === 'results' ? '📊 Results' : '🏠 Overview'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Overview ────────────────────────────────────────────────── */}
        {view === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">

              {renderVoiceBar(lvl <= 1
                ? 'Welcome to the AI Content Creation Certification! You will create a real piece of content and be assessed on your skills.'
                : 'Welcome to the AI Content Creation Certification. Build a complete content portfolio demonstrating audience awareness, purposeful writing, and polished execution.')}

              {dataError && (
                <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{dataError}
                </div>
              )}

              {/* Hero */}
              <div className="p-6 bg-surface border border-accent/25 rounded-2xl">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-accent/30 rounded-xl flex-shrink-0">
                    <PenLine size={28} className="text-accent" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-ink mb-1">AI Content Creation Certification</h1>
                    <p className="text-sm text-body leading-relaxed">
                      {lvl <= 1
                        ? 'Show that you can create real content that people want to read. You will choose a type of content, write it step by step, improve it with AI, and plan how to share it.'
                        : 'Demonstrate mastery of the full content creation workflow: audience research, purposeful writing, AI-assisted drafting, editorial refinement, and platform-aware distribution.'}
                    </p>
                    <div className="mt-2">
                      <PidginTooltip
                        originalText={lvl <= 1
                          ? 'Show that you can create real content that people want to read. You will choose a type of content, write it step by step, improve it with AI, and plan how to share it.'
                          : 'Demonstrate mastery of the full content creation workflow: audience research, purposeful writing, AI-assisted drafting, editorial refinement, and platform-aware distribution.'}
                        hintText="Tap here to translate this description into Nigerian Pidgin."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {['Audience-Centred Writing', 'AI-Assisted Drafting', 'Editorial Refinement', 'Platform Adaptation'].map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 bg-accent/15 border border-accent/25 text-accent rounded-full font-medium">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Content Type',     value: portfolio.contentType ? CONTENT_TYPES.find(t => t.id === portfolio.contentType)?.label ?? '—' : 'Not chosen', color: 'text-accent' },
                  { label: 'Sections Filled',  value: `${filledCount} / ${PORTFOLIO_SECTIONS.length}`,  color: filledCount >= 4 ? 'text-accent' : 'text-amber-400' },
                  { label: 'Overall Score',    value: overallAvg !== null ? `${overallAvg.toFixed(1)} / 3.0` : '—', color: overallAvg !== null && overallAvg >= 2 ? 'text-accent' : 'text-amber-400' },
                  { label: 'Status',           value: allProficient ? '🎓 Certified' : anyScored ? 'In Progress' : 'Not Started', color: allProficient ? 'text-accent' : 'text-muted' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-4 bg-card border border-hair rounded-xl text-center">
                    <p className="text-[10px] text-muted uppercase font-bold mb-1">{label}</p>
                    <p className={`text-sm font-bold ${color} truncate`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Assessments list */}
              {assessments.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-sm font-bold text-body">Certification Criteria</h2>
                  {assessments.map(a => {
                    const sc = assessmentScores.find(s => s.assessment_name === a.assessment_name);
                    const { text, color, bg, border } = scoreLabel(sc?.score ?? null);
                    const isExpanded = expandedCrit === a.assessment_name;
                    return (
                      <div key={a.assessment_name} className={`rounded-xl border ${border} ${bg} overflow-hidden`}>
                        <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
                          onClick={() => setExpandedCrit(isExpanded ? null : a.assessment_name)}>
                          <ScoreRing score={sc?.score ?? null} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">{a.assessment_name}</p>
                            <p className="text-xs text-muted truncate">{a.description}</p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color} ${bg} ${border} flex-shrink-0`}>{text}</span>
                          {isExpanded ? <ChevronUp size={14} className="text-muted flex-shrink-0" /> : <ChevronDown size={14} className="text-muted flex-shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-2 border-t border-hair pt-3">
                            <p className="text-xs text-body leading-relaxed">{a.certification_prompt}</p>
                            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                              {[
                                { label: 'No Evidence (0)', text: a.certification_level0_metric, color: 'text-red-400' },
                                { label: 'Emerging (1)',    text: a.certification_level1_metric, color: 'text-amber-400' },
                                { label: 'Proficient (2)', text: a.certification_level2_metric, color: 'text-blue-400' },
                                { label: 'Advanced (3)',   text: a.certification_level3_metric, color: 'text-green-400' },
                              ].map(({ label, text, color }) => (
                                <div key={label} className="p-2 bg-paper rounded-lg">
                                  <p className={`font-bold mb-0.5 ${color}`}>{label}</p>
                                  <p className="text-muted leading-relaxed">{text}</p>
                                </div>
                              ))}
                            </div>
                            {sc?.evidence && (
                              <div className="p-2 bg-paper rounded-lg border border-hair">
                                <p className="text-[10px] font-bold text-muted mb-1">Your Evidence:</p>
                                <p className="text-xs text-body leading-relaxed">{sc.evidence}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* CTA */}
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setView('build')}
                  className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-colors">
                  <PenLine size={16} /> {filledCount > 0 ? 'Continue Building' : 'Start Building'} <ArrowRight size={16} />
                </button>
                {portfolioReady && (
                  <button onClick={handleEvaluate} disabled={isEvaluating}
                    className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-colors disabled:opacity-50">
                    {isEvaluating ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                    {isEvaluating ? (evalProgress || 'Evaluating…') : 'Evaluate My Portfolio'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Build ───────────────────────────────────────────────────── */}
        {view === 'build' && (
          <div className="flex-1 flex overflow-hidden">

            {/* Left: AI coaching panel */}
            <div className="w-80 flex-shrink-0 flex flex-col bg-surface border-r border-hair overflow-hidden">
              <div className="flex-shrink-0 px-4 py-3 border-b border-hair bg-accent/10">
                <p className="text-xs font-bold text-accent flex items-center gap-2">
                  <Wand2 size={14} /> AI Content Coach
                </p>
                <p className="text-[10px] text-muted mt-0.5">
                  {lvl <= 1 ? 'Tell me what you need help with and I will help you write it.' : 'Select a section, describe your needs, and get AI-powered writing guidance.'}
                </p>
              </div>

              {/* Section selector */}
              <div className="flex-shrink-0 px-3 py-2 border-b border-hair">
                <p className="text-[9px] font-bold text-muted uppercase mb-1.5">Active section</p>
                <select
                  value={activeKey}
                  onChange={e => setActiveKey(e.target.value as keyof ContentPortfolio)}
                  className="w-full bg-card border border-hair rounded-lg px-2 py-1.5 text-xs text-body outline-none focus:border-accent">
                  {PORTFOLIO_SECTIONS.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Prompt input */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted uppercase">Your prompt</p>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) { e.preventDefault(); handleAIAssist(); } }}
                    rows={4}
                    placeholder={lvl <= 1
                      ? 'Tell me what you want to write or what help you need…'
                      : 'Describe what you need for this section, or paste content to improve…'}
                    className="w-full bg-card border border-hair rounded-lg px-3 py-2 text-xs text-body placeholder-muted resize-none outline-none focus:border-accent leading-relaxed"
                  />
                  <button onClick={handleAIAssist} disabled={!prompt.trim() || isGenerating}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-accent hover:bg-accent disabled:opacity-40 text-ink text-xs font-bold rounded-lg transition-colors">
                    {isGenerating
                      ? <><Loader2 size={13} className="animate-spin" /> {lvl <= 1 ? 'Writing…' : 'Generating…'}</>
                      : <><Wand2 size={13} /> {lvl <= 1 ? 'Help me write this' : 'Get AI assistance'}</>}
                  </button>
                  {genError && <p className="text-[10px] text-red-400">{genError}</p>}
                </div>

                {/* AI suggestion */}
                {aiSuggestion && (
                  <div className="p-3 bg-accent/10 border border-accent/30 rounded-xl space-y-2">
                    <p className="text-[9px] font-bold text-accent uppercase">AI Suggestion</p>
                    <p className="text-xs text-body leading-relaxed whitespace-pre-wrap">{aiSuggestion}</p>
                    <button
                      onClick={() => { setPortfolio(prev => ({ ...prev, [activeKey]: aiSuggestion })); setActiveSection(activeKey); setAiSuggestion(null); }}
                      className="text-[10px] text-accent hover:text-accent font-semibold flex items-center gap-1">
                      <CheckCircle size={11} /> Apply to section
                    </button>
                  </div>
                )}

                {/* Section tips */}
                {showTips && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-muted uppercase">Section guidance</p>
                    {(() => {
                      const s = PORTFOLIO_SECTIONS.find(s => s.key === activeKey);
                      return s ? (
                        <div className="p-2.5 bg-card rounded-lg border border-hair">
                          <p className="text-[10px] text-muted leading-relaxed italic">💡 {s.tip}</p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Quick tips */}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-muted uppercase">Content creation tips</p>
                  {[
                    'Know your audience before writing a single word.',
                    'One clear purpose beats ten vague ones.',
                    'Active voice: "We solved it" beats "It was solved."',
                    'Your hook is the most important sentence you write.',
                    'Read it aloud — if you stumble, edit it.',
                  ].map((tip, i) => (
                    <div key={i} className="text-[10px] text-muted leading-relaxed pl-2 border-l border-hair">
                      {tip}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom actions */}
              <div className="flex-shrink-0 px-3 py-3 border-t border-hair space-y-2">
                <button onClick={handleSavePortfolio}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-accent bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-lg transition-colors">
                  💾 Save Portfolio
                </button>
                {portfolioReady && (
                  <button onClick={handleEvaluate} disabled={isEvaluating}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors disabled:opacity-50">
                    {isEvaluating
                      ? <><Loader2 size={12} className="animate-spin" /> {evalProgress || 'Evaluating…'}</>
                      : <><BarChart3 size={12} /> Evaluate Portfolio</>}
                  </button>
                )}
                {!portfolioReady && (
                  <p className="text-[10px] text-center text-muted">
                    {!portfolio.contentType ? 'Select a content type to start' : `Fill ${Math.max(0, 4 - filledCount)} more section${4 - filledCount !== 1 ? 's' : ''} to evaluate`}
                  </p>
                )}
              </div>
            </div>

            {/* Right: Content portfolio */}
            <div className="flex-1 overflow-hidden">
              <ContentPortfolioPanel
                portfolio={portfolio}
                onChange={handlePortfolioChange}
                activeSection={activeSection}
                showTips={showTips}
              />
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────── */}
        {view === 'results' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-5">

              {renderVoiceBar(allProficient
                ? 'Congratulations! You have achieved certification level in AI Content Creation.'
                : 'Here are your evaluation results. Review the feedback and continue building your portfolio.')}

              {/* Score summary */}
              {anyScored && overallAvg !== null && (
                <div className={`p-5 rounded-2xl border flex items-center gap-4
                  ${allProficient ? 'bg-accent/10 border-accent/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                  <Award size={40} className={allProficient ? 'text-accent' : 'text-amber-400'} />
                  <div className="flex-1">
                    <p className="text-xs text-muted uppercase font-bold mb-0.5">Overall Score</p>
                    <p className={`text-3xl font-black ${allProficient ? 'text-accent' : 'text-amber-400'}`}>
                      {overallAvg.toFixed(1)}<span className="text-base font-normal text-muted"> / 3.0</span>
                    </p>
                    <p className="text-sm text-body mt-0.5">
                      {allProficient ? '🎓 Certification level achieved on all criteria!' : 'Keep building your portfolio — Proficient (2/3) required on all criteria.'}
                    </p>
                  </div>
                  {allProficient && (
                    <button onClick={() => setView('certificate')}
                      className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
                      <Trophy size={16} /> Get Certificate
                    </button>
                  )}
                </div>
              )}

              {/* Per-criterion scores */}
              {assessmentScores.length > 0 && (
                <div className="space-y-2">
                  {assessmentScores.map(sc => {
                    const assessment = assessments.find(a => a.assessment_name === sc.assessment_name);
                    const { text, color, bg, border } = scoreLabel(sc.score);
                    return (
                      <div key={sc.assessment_name} className={`rounded-xl border ${border} ${bg} p-4`}>
                        <div className="flex items-center gap-3 mb-2">
                          <ScoreRing score={sc.score} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-ink">{sc.assessment_name}</p>
                            <p className={`text-xs font-semibold ${color}`}>{text}</p>
                          </div>
                        </div>
                        {sc.evidence && (
                          <p className="text-xs text-body leading-relaxed pl-14">{sc.evidence}</p>
                        )}
                        {assessment && sc.score !== null && sc.score < 2 && (
                          <div className="mt-2 pl-14">
                            <p className="text-[10px] text-muted">To reach Proficient:</p>
                            <p className="text-[10px] text-blue-300 leading-relaxed">{assessment.certification_level2_metric}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {evalError && (
                <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button onClick={() => setView('build')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-hair hover:bg-hair text-ink text-sm font-bold rounded-xl transition-colors">
                  <PenLine size={15} /> Continue Building
                </button>
                <button onClick={handleEvaluate} disabled={isEvaluating}
                  className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent disabled:opacity-50 text-ink text-sm font-bold rounded-xl transition-colors">
                  {isEvaluating ? <><Loader2 size={15} className="animate-spin" /> {evalProgress || 'Evaluating…'}</> : <><RefreshCw size={15} /> Re-evaluate</>}
                </button>
                {allProficient && (
                  <button onClick={() => setView('certificate')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl transition-colors">
                    <Trophy size={15} /> Get Certificate
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Certificate ──────────────────────────────────────────────── */}
        {view === 'certificate' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-5">

              {renderVoiceBar('Enter your name to generate your AI Content Creation Certificate.')}

              {!allProficient && (
                <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 flex gap-2 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  {lvl <= 1
                    ? 'You need a score of 2 or more on all criteria to get your certificate. Keep building your content!'
                    : 'Proficient (2/3) on all criteria is required for certification. Continue refining your portfolio and re-evaluate.'}
                </div>
              )}

              {allProficient && (
                <>
                  <div className="p-6 bg-surface border border-accent/25 rounded-2xl text-center space-y-4">
                    <Trophy size={48} className="text-accent mx-auto" />
                    <div>
                      <h2 className="text-xl font-bold text-ink">🎓 Certification Achieved!</h2>
                      <p className="text-sm text-body mt-1">
                        {lvl <= 1
                          ? 'Well done! You showed you can create real content that connects with an audience. Enter your name to download your certificate.'
                          : 'You have demonstrated Proficient or Advanced performance across all AI Content Creation criteria. Enter your name to generate your certificate.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {assessmentScores.map(sc => {
                        const { text, color } = scoreLabel(sc.score);
                        return (
                          <div key={sc.assessment_name} className="flex items-center justify-between px-3 py-1.5 bg-card rounded-lg">
                            <span className="text-body truncate">{sc.assessment_name}</span>
                            <span className={`font-bold flex-shrink-0 ml-2 ${color}`}>{text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-body mb-1.5">
                        {lvl <= 1 ? 'Your full name (for the certificate):' : 'Full name as it should appear on the certificate:'}
                      </label>
                      <input
                        type="text"
                        value={certName}
                        onChange={e => setCertName(e.target.value)}
                        placeholder="e.g. Amara Johnson"
                        className="w-full bg-card border border-hair rounded-xl px-4 py-3 text-ink placeholder-muted outline-none focus:border-accent text-base"
                      />
                    </div>
                    <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                      className="w-full flex items-center justify-center gap-3 py-3.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-ink font-bold rounded-xl transition-all">
                      {isGenCert
                        ? <><Loader2 size={18} className="animate-spin" /> Generating PDF…</>
                        : <><Download size={18} /> Download Certificate</>}
                    </button>
                    <p className="text-center text-xs text-muted">
                      {`Violet-themed PDF · ${branding.institutionName}`}
                    </p>
                  </div>
                </>
              )}

              <button onClick={() => setView('overview')}
                className="w-full py-2 text-xs text-muted hover:text-body transition-colors">
                ← Back to Overview
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AIContentCreationCertificationPage;