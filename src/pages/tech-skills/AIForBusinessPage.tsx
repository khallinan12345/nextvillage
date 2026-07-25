// src/pages/AIForBusinessPage.tsx
//
// AI for Business Workshop
// Tagline: "Turn your AI skills into income."
// Three-phase curriculum: Discover → Design → Launch
// API routes needed:
//   /api/business-task-instruction
//   /api/generate-business-content
//   /api/evaluate-business-session

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import {
  Briefcase, Sparkles, Loader2, Save, FolderOpen, Download,
  CheckCircle, ArrowRight, ArrowUpCircle, SkipForward,
  Lightbulb, BarChart3, Award, X, Copy, Check,
  Volume2, VolumeX, AlertCircle, Star, ChevronDown, ChevronUp,
  Trash2, Plus, FileText, Users, Target, DollarSign,
  MessageSquare, TrendingUp, Megaphone, ClipboardList,
  Wand2, Heart, MapPin,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskDef {
  id: string; label: string; phase: 1 | 2 | 3; icon: string; isOnboarding?: boolean;
}

interface TaskInstruction {
  headline: string; context: string;
  subTasks: string[]; subTaskTeaching: string[]; examplePrompt: string;
}

interface PromptEntry {
  id: string; taskId: string; subTaskIndex: number;
  subTaskQuestion?: string; subTaskTeaching?: string;
  prompt: string; aiResponse?: string; aiCritique?: string;
  hasSuggestions?: boolean;
  timestamp: string; action: 'generate' | 'iterate' | 'critique';
}

interface SessionRecord {
  id: number; business_session_id: string; business_session_name: string;
  business_canvas: BusinessCanvas; business_prompts: any[];
  business_evaluation: any | null; updated_at?: string;
}

interface BusinessCanvas {
  opportunity: string;
  customer: string;
  offer: string;
  businessModel: string;
  validation: string;
  pricing: string;
  actionPlan: string;
  offerMessage: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const makeId = () => Math.random().toString(36).substring(2, 9);
const BUSINESS_ACTIVITY = 'ai_for_business';

const EMPTY_CANVAS: BusinessCanvas = {
  opportunity: '',
  customer: '',
  offer: '',
  businessModel: '',
  validation: '',
  pricing: '',
  actionPlan: '',
  offerMessage: '',
};

const CANVAS_SECTIONS: {
  key: keyof BusinessCanvas; label: string; icon: React.ReactNode;
  colour: string; placeholder: string;
}[] = [
  { key: 'opportunity',    label: '1. The Opportunity',      icon: <Lightbulb size={13} />,     colour: 'border-blue-500/40 bg-blue-500/5',    placeholder: 'What problem does your AI service solve? Who has this problem?' },
  { key: 'customer',       label: '2. Your Customer',        icon: <Users size={13} />,          colour: 'border-cyan-500/40 bg-cyan-500/5',    placeholder: 'Describe one specific person who will pay for this...' },
  { key: 'offer',          label: '3. Your Offer',           icon: <Star size={13} />,           colour: 'border-violet-500/40 bg-violet-500/5', placeholder: 'Exactly what do you provide? What does the customer receive?' },
  { key: 'businessModel',  label: '4. Business Model',       icon: <TrendingUp size={13} />,     colour: 'border-emerald-500/40 bg-emerald-500/5', placeholder: 'How do you make money? Per job, monthly, subscription?' },
  { key: 'validation',     label: '5. Test First',           icon: <CheckCircle size={13} />,    colour: 'border-amber-500/40 bg-amber-500/5',  placeholder: 'How will you test this with a real person before building anything?' },
  { key: 'pricing',        label: '6. Price & Payment',      icon: <DollarSign size={13} />,     colour: 'border-orange-500/40 bg-orange-500/5', placeholder: 'What is your price? How will customers pay you?' },
  { key: 'offerMessage',   label: '7. Your Offer Message',   icon: <Megaphone size={13} />,      colour: 'border-pink-500/40 bg-pink-500/5',    placeholder: 'The WhatsApp message or post you will send to your first customer...' },
  { key: 'actionPlan',     label: '8. First 30 Days',        icon: <ClipboardList size={13} />,  colour: 'border-rose-500/40 bg-rose-500/5',    placeholder: 'Three customers to contact. One service to offer. One AI tool to use.' },
];

const TASKS: TaskDef[] = [
  // Phase 1 — Discover
  { id: 'intro_business',  label: 'AI for Business Overview',  phase: 1, icon: '💡', isOnboarding: true },
  { id: 'spot_opportunity',label: 'Spot the Opportunity',       phase: 1, icon: '🔍' },
  { id: 'know_customer',   label: 'Know Your Customer',         phase: 1, icon: '👤' },
  // Phase 2 — Design
  { id: 'design_offer',    label: 'Design Your AI Offer',       phase: 2, icon: '🎁' },
  { id: 'business_model',  label: 'Choose a Business Model',    phase: 2, icon: '💰' },
  { id: 'build_offer',     label: 'Write Your Offer',           phase: 2, icon: '✍️' },
  { id: 'price_payment',   label: 'Price & Get Paid',           phase: 2, icon: '🤝' },
  // Phase 3 — Launch
  { id: 'test_validate',   label: 'Test Before You Build',      phase: 3, icon: '🧪' },
  { id: 'first_30_days',   label: 'Your First 30 Days',         phase: 3, icon: '🚀' },
];

const PHASE_META: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Phase 1: Discover', color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30'   },
  2: { label: 'Phase 2: Design',   color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30'  },
  3: { label: 'Phase 3: Launch',   color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
};

// Task → canvas section mapping (which section gets updated by which task)
const TASK_CANVAS_MAP: Partial<Record<string, keyof BusinessCanvas>> = {
  spot_opportunity: 'opportunity',
  know_customer:    'customer',
  design_offer:     'offer',
  business_model:   'businessModel',
  build_offer:      'offerMessage',
  price_payment:    'pricing',
  test_validate:    'validation',
  first_30_days:    'actionPlan',
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function callInstructionAPI(body: Record<string, unknown>) {
  const res = await fetch('/api/business-task-instruction', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', ...body }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

async function callGenerateAPI(body: Record<string, unknown>) {
  const res = await fetch('/api/generate-business-content', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', ...body }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

async function callEvaluateAPI(body: Record<string, unknown>) {
  const res = await fetch('/api/evaluate-business-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', ...body }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

// ─── Score badge ──────────────────────────────────────────────────────────────

const ScoreBadge: React.FC<{ score: number; max?: number }> = ({ score, max = 3 }) => {
  const pct = score / max;
  const color = pct >= 0.8 ? 'from-emerald-400 to-green-500 text-green-950'
    : pct >= 0.5 ? 'from-amber-400 to-yellow-500 text-yellow-950'
    : 'from-red-400 to-rose-500 text-rose-950';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${color}`}>
      <Star size={12} />{score}/{max}
    </span>
  );
};

// ─── Onboarding ───────────────────────────────────────────────────────────────

const BusinessOnboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
      <p className="text-xs font-bold text-amber-400 uppercase mb-2">💡 Turn your AI skills into income.</p>
      <p className="text-sm text-white font-semibold leading-relaxed mb-2">
        Every tool you've learned in this programme is a service someone will pay for. This workshop shows you how.
      </p>
      <p className="text-sm text-gray-300 leading-relaxed">
        You can already create AI images, videos, and voices. You can build websites and apps. You can write professional content with AI.
        These are not just skills — they are <strong className="text-white">products</strong>. Businesses, schools, NGOs, and individuals in your
        community need them and do not know how to do them. You do.
      </p>
      <div className="mt-3">
        <PidginTooltip
          originalText="Every tool you've learned in this programme is a service someone will pay for. You can already create AI images, videos, and voices. You can build websites and apps. You can write professional content with AI. These are not just skills — they are products."
          hintText="Tap here to translate this introduction into Nigerian Pidgin."
        />
      </div>
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-2">🌍 What people in your community are already paying for:</p>
      <div className="space-y-1.5">
        {[
          { service: 'WhatsApp product descriptions',  tool: 'AI Content Creation', naira: '₦500–₦2,000 per business' },
          { service: 'Social media posts for a shop',  tool: 'AI Content Creation', naira: '₦3,000–₦10,000/month' },
          { service: 'Voice ads for radio/WhatsApp',   tool: 'AI Voice Creation',   naira: '₦2,000–₦8,000 per ad' },
          { service: 'Website for a small business',   tool: 'Web Development',     naira: '₦15,000–₦50,000 one-time' },
          { service: 'AI images for flyers/posters',   tool: 'AI Image Creation',   naira: '₦1,000–₦5,000 per design' },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="text-emerald-400 font-bold flex-shrink-0 mt-0.5">✓</span>
            <div>
              <span className="text-white font-medium">{item.service}</span>
              <span className="text-gray-500"> · {item.tool} · </span>
              <span className="text-amber-400 font-semibold">{item.naira}</span>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      {[
        { icon: '🔍', title: 'Find the gap',     desc: 'Spot a real problem in your community that AI can solve' },
        { icon: '🎁', title: 'Design the offer', desc: 'Turn your AI skill into a clear, specific service' },
        { icon: '🤝', title: 'Get paid',          desc: 'Price it, write the pitch, land the first customer'     },
        { icon: '🚀', title: 'Start small',       desc: 'Test with one customer before building anything big'    },
      ].map((item, i) => (
        <div key={i} className="p-3 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className="text-xl mb-1">{item.icon}</div>
          <p className="text-xs font-bold text-white mb-0.5">{item.title}</p>
          <p className="text-[11px] text-gray-400">{item.desc}</p>
        </div>
      ))}
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">📋 Your Business Canvas</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        As you work through each task, your responses fill a <strong className="text-white">Business Canvas</strong> on the right —
        a one-page summary of your business idea that you can save, download, and share. By the end, you will have a real plan with a real offer ready to send.
      </p>
    </div>

    <button onClick={onComplete}
      className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl transition-all hover:scale-[1.01]">
      Let's build my business! <ArrowRight size={16} />
    </button>
  </div>
);

// ─── Task stepper ─────────────────────────────────────────────────────────────

const TaskStepper: React.FC<{ tasks: TaskDef[]; taskIndex: number; onJump: (i: number) => void }> = ({ tasks, taskIndex, onJump }) => (
  <div className="px-3 py-3 border-b border-gray-700 space-y-2">
    {([1, 2, 3] as const).map(phase => {
      const pm = PHASE_META[phase];
      const phaseTasks = tasks.filter(t => t.phase === phase);
      const firstIdx = tasks.findIndex(t => t.phase === phase);
      return (
        <div key={phase}>
          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${pm.color}`}>{pm.label}</p>
          <div className="space-y-0.5">
            {phaseTasks.map((task, i) => {
              const gi = firstIdx + i;
              const isDone = gi < taskIndex; const isCur = gi === taskIndex; const isFut = gi > taskIndex;
              return (
                <button key={task.id} onClick={() => isDone && onJump(gi)} disabled={isFut}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                    ${isCur ? `${pm.bg} ${pm.border} border font-bold ${pm.color}` : ''}
                    ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
                    ${isFut ? 'text-gray-600 cursor-default' : ''}`}>
                  <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCur ? task.icon : '⬜'}</span>
                  <span className="truncate">{task.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
);

// ─── Business Canvas panel ────────────────────────────────────────────────────

const BusinessCanvasPanel: React.FC<{
  canvas: BusinessCanvas;
  onChange: (key: keyof BusinessCanvas, value: string) => void;
  activeSection: keyof BusinessCanvas | null;
}> = ({ canvas, onChange, activeSection }) => (
  <div className="h-full overflow-y-auto p-3 space-y-2.5">
    <div className="flex items-center justify-between mb-1">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Business Canvas</p>
      <p className="text-[10px] text-gray-600">
        {Object.values(canvas).filter(v => v.trim().length > 0).length}/{CANVAS_SECTIONS.length} sections filled
      </p>
    </div>
    {CANVAS_SECTIONS.map(section => {
      const isActive = activeSection === section.key;
      const isFilled = canvas[section.key].trim().length > 0;
      return (
        <div key={section.key}
          className={`rounded-xl border p-3 transition-all ${section.colour} ${isActive ? 'ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/10' : ''}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`${isFilled ? 'text-emerald-400' : 'text-gray-500'}`}>{section.icon}</span>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${isFilled ? 'text-gray-300' : 'text-gray-500'}`}>
              {section.label}
            </p>
            {isActive && <span className="ml-auto text-[9px] text-amber-400 font-bold animate-pulse">● Active</span>}
            {isFilled && !isActive && <span className="ml-auto text-[9px] text-emerald-400">✓</span>}
          </div>
          <textarea
            value={canvas[section.key]}
            onChange={e => onChange(section.key, e.target.value)}
            rows={3}
            placeholder={section.placeholder}
            className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 resize-none outline-none leading-relaxed"
          />
        </div>
      );
    })}
  </div>
);

// ─── Voice helper ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const AIForBusinessPage: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null)); }, []);

  // ── Personality baseline ─────────────────────────────────────────────
  const [communicationStrategy, setCommunicationStrategy] = useState<any>(null);
  const [learningStrategy, setLearningStrategy]           = useState<any>(null);
  const [communicationLevel, setCommunicationLevel]       = useState(1);

  useEffect(() => {
    if (!userId) return;
    supabase.from('user_personality_baseline')
      .select('communication_strategy, learning_strategy, communication_level')
      .eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data?.communication_strategy) setCommunicationStrategy(data.communication_strategy);
        if (data?.learning_strategy)       setLearningStrategy(data.learning_strategy);
        if (data?.communication_level != null) setCommunicationLevel(data.communication_level);
      });
  }, [userId]);

  const lvl = communicationLevel;

  // ── Voice ────────────────────────────────────────────────────────────
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [voiceMode, setVoiceMode]                   = useState<'english' | 'pidgin'>('english'); // corrected once profile loads
  const [userGradeLevel, setUserGradeLevel]         = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('grade_level, continent, country').eq('id', userId).single()
      .then(({ data }) => {
        if (data?.grade_level) setUserGradeLevel(data.grade_level);
        setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english');
      });
  }, [userId]);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  const speakTextRef = useRef<(t: string) => void>(() => {});
  const speakText = useCallback((text: string) => {
    if (!voiceOutputEnabled || !text.trim()) return;
    hookSpeak(text.slice(0, 400));
  }, [voiceOutputEnabled, hookSpeak]);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  // ── Session ──────────────────────────────────────────────────────────
  const [sessionId, setSessionId]               = useState<string | null>(null);
  const [sessionName, setSessionName]           = useState('My Business Idea');
  const [sessions, setSessions]                 = useState<SessionRecord[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Business Canvas ──────────────────────────────────────────────────
  const [canvas, setCanvas]           = useState<BusinessCanvas>(EMPTY_CANVAS);
  const [activeSection, setActiveSection] = useState<keyof BusinessCanvas | null>(null);

  const updateCanvas = (key: keyof BusinessCanvas, value: string) => {
    setCanvas(prev => ({ ...prev, [key]: value }));
  };

  // ── Task ─────────────────────────────────────────────────────────────
  const [taskIndex, setTaskIndex]               = useState(0);
  const [taskInstruction, setTaskInstruction]   = useState<TaskInstruction | null>(null);
  const [loadingInstruction, setLoadingInstruction] = useState(false);
  const [taskHasGeneration, setTaskHasGeneration] = useState(false);
  const [subTaskIndex, setSubTaskIndex]         = useState(0);
  const [subTaskCritique, setSubTaskCritique]   = useState<{ hasSuggestions: boolean; feedback: string } | null>(null);
  const [isCritiquingResponse, setIsCritiquingResponse] = useState(false);
  const [sessionContext, setSessionContext]     = useState<Record<string, any>>({});

  // ── Prompt ───────────────────────────────────────────────────────────
  const [prompt, setPrompt]               = useState('');
  const [promptHistory, setPromptHistory] = useState<PromptEntry[]>([]);
  const [isGenerating, setIsGenerating]   = useState(false);
  const [isCritiquing, setIsCritiquing]   = useState(false);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);
  const [aiResponse, setAiResponse]       = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // ── Evaluation ───────────────────────────────────────────────────────
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [isEvaluating, setIsEvaluating]     = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [lastSaved, setLastSaved]           = useState<Date | null>(null);
  const [saveError, setSaveError]           = useState<string | null>(null);
  const [evaluation, setEvaluation]         = useState<any>(null);
  const [evalAdvice, setEvalAdvice]         = useState<string | null>(null);
  const [evalError, setEvalError]           = useState<string | null>(null);
  const [downloading, setDownloading]       = useState(false);
  const [copied, setCopied]                 = useState(false);

  const currentTask  = TASKS[taskIndex];
  const currentPhase = currentTask?.phase ?? 1;
  const pm           = PHASE_META[currentPhase];

  // Set active canvas section when task changes
  useEffect(() => {
    const section = TASK_CANVAS_MAP[currentTask?.id ?? ''];
    setActiveSection(section ?? null);
  }, [currentTask?.id]);

  // ── Session management ───────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('dashboard')
      .select('id, business_session_id, business_session_name, business_canvas, business_prompts, business_evaluation, updated_at')
      .eq('user_id', userId).eq('activity', BUSINESS_ACTIVITY)
      .not('business_session_id', 'is', null).order('updated_at', { ascending: false });
    if (data?.length) { setSessions(data as SessionRecord[]); if (!sessionId) setShowSessionPicker(true); }
  }, [userId, sessionId]);
  useEffect(() => { if (userId) loadSessions(); }, [userId, loadSessions]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (userId) {
      await supabase.from('dashboard').insert({
        user_id: userId, activity: BUSINESS_ACTIVITY,
        business_session_id: sid, business_session_name: sessionName,
        business_canvas: EMPTY_CANVAS, business_prompts: [],
        business_evaluation: { taskIndex: 0 },
      });
    }
    return sid;
  }, [userId, sessionName]);

  const persistSession = useCallback(async (
    c: BusinessCanvas, prompts: PromptEntry[], tIdx: number, ctx: Record<string, any>,
  ) => {
    const sid = sessionIdRef.current; if (!userId || !sid) return;
    await supabase.from('dashboard').update({
      business_canvas: c, business_prompts: prompts,
      business_evaluation: { taskIndex: tIdx, sessionContext: ctx },
      business_session_name: sessionName, updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('business_session_id', sid);
  }, [userId, sessionName]);

  const createNewSession = useCallback(async () => {
    if (!userId) return;
    const sid = makeId();
    await supabase.from('dashboard').insert({
      user_id: userId, activity: BUSINESS_ACTIVITY,
      business_session_id: sid, business_session_name: 'My Business Idea',
      business_canvas: EMPTY_CANVAS, business_prompts: [],
      business_evaluation: { taskIndex: 0 },
    });
    setSessionId(sid); sessionIdRef.current = sid;
    setSessionName('My Business Idea'); setCanvas(EMPTY_CANVAS); setTaskIndex(0);
    setPromptHistory([]); setEvaluation(null); setSessionContext({});
    setTaskHasGeneration(false); setShowSessionPicker(false);
    setTaskInstruction(null); setPrompt(''); setAiResponse(null); setErrorMsg(null);
  }, [userId]);

  const loadSession = useCallback((s: SessionRecord) => {
    setSessionId(s.business_session_id); sessionIdRef.current = s.business_session_id;
    setSessionName(s.business_session_name);
    setCanvas(s.business_canvas || EMPTY_CANVAS);
    const ev = s.business_evaluation || {};
    setTaskIndex(ev.taskIndex ?? 0); setSessionContext(ev.sessionContext ?? {});
    setEvaluation(ev.scores || null); setPromptHistory(s.business_prompts || []);
    setTaskHasGeneration(false); setShowSessionPicker(false);
    setTaskInstruction(null); setPrompt(''); setAiResponse(null); setErrorMsg(null); setSubTaskCritique(null);
  }, []);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation(); if (!userId) return;
    setDeletingSessionId(sid);
    try {
      await supabase.from('dashboard').update({
        business_session_id: null, business_session_name: null,
        business_canvas: null, business_prompts: null, business_evaluation: null,
      }).eq('user_id', userId).eq('business_session_id', sid);
      setSessions(prev => prev.filter(s => s.business_session_id !== sid));
    } finally { setDeletingSessionId(null); }
  }, [userId]);

  // ── Fetch task instruction ────────────────────────────────────────────
  const fetchTaskInstruction = useCallback(async (idx: number, ctx: Record<string, any>) => {
    const task = TASKS[idx]; if (!task || task.isOnboarding) return;
    setLoadingInstruction(true); setTaskInstruction(null);
    try {
      const result = await callInstructionAPI({
        taskId: task.id, taskLabel: task.label, phase: task.phase,
        sessionContext: ctx, completedTasks: TASKS.slice(0, idx).map(t => t.id),
        communicationStrategy, learningStrategy, communicationLevel: lvl,
        gradeLevel: userGradeLevel,
        canvas,
      });
      setTaskInstruction(result as TaskInstruction);
      if (result?.subTaskTeaching?.[0] && result?.subTasks?.[0]) {
        speakTextRef.current(result.subTaskTeaching[0] + ' ' + result.subTasks[0]);
      } else if (result?.subTasks?.[0]) {
        speakTextRef.current(result.subTasks[0]);
      }
    } catch {
      // ── Rich fallback instructions ──────────────────────────────────
      const fallbacks: Record<string, { teaching: string; question: string }[]> = {
        spot_opportunity: [
          { teaching: 'The best businesses do not start with a product — they start with a problem. Walk around your community and ask: what takes too long, costs too much, or does not exist yet? That gap is where your business lives.',
            question: 'What problem have you noticed in your community, your school, or among the people around you that AI could help solve? Describe it in 2–3 sentences. Be specific — name the people and the situation.' },
          { teaching: 'Your AI skills are not just technical abilities — they are tools that solve real problems. A student who can build an AI image generator can save a market trader hours of design work. That is a business.',
            question: 'Which AI skill you have learned (image creation, voice creation, content writing, website building, workflows) best matches the problem you described? How does it solve the problem specifically?' },
        ],
        know_customer: [
          { teaching: 'The biggest mistake new business owners make is trying to sell to "everyone." The most successful first businesses sell to one specific person — someone you can name, find, and speak to this week.',
            question: 'Describe your first customer as if they were a real person you know. Give them a name. How old are they? What do they do for work? What does their typical day look like? What frustrates them that your service could fix?' },
          { teaching: 'Knowing what your customer already spends money on is the fastest way to find out if they will pay for your service. If they spend on similar things, they will likely spend on yours.',
            question: 'Does your customer already pay for anything similar to your service — a graphic designer, a typist, a social media person? How much do they currently pay, or what do they do without? This tells you your market price.' },
        ],
        design_offer: [
          { teaching: 'An offer is not a skill — it is a specific result for a specific person. "I do AI content writing" is a skill. "I write 10 WhatsApp product descriptions for your clothing business in 24 hours" is an offer. The second one is something a customer can say yes to.',
            question: 'Write your offer as one clear sentence: "I help [type of customer] to [specific result] in [timeframe] using [AI tool]." Try writing 2–3 versions and we will improve the best one.' },
          { teaching: 'The best offers solve a pain that the customer already feels every day. If your customer has to explain why they need it, the offer is not specific enough yet.',
            question: 'What is the single biggest pain your offer removes for the customer? Describe the "before" (without your service) and the "after" (with your service) in concrete terms.' },
        ],
        business_model: [
          { teaching: 'There are four simple ways to make money from an AI service: charge per job (one payment each time), charge a monthly retainer (regular monthly fee), charge per piece (per post, per image, per article), or charge a setup fee plus maintenance. Each suits a different service and customer.',
            question: 'Which payment model fits your offer best — and why? Think about what is easiest for your customer to pay and what gives you the most predictable income. Describe your choice and reasoning.' },
          { teaching: 'In most Nigerian communities, trust is built before money changes hands. Many first customers start as free trials or a deeply discounted first job. This is not weakness — it is strategy. A happy first customer becomes a reference that brings five more.',
            question: 'How will you handle your first customer? Will you offer a free sample, a discounted first job, or full price? What would you need to see from the relationship before asking for full payment?' },
        ],
        build_offer: [
          { teaching: 'Your offer message is what you actually send to a potential customer — on WhatsApp, in person, or on social media. It should be short enough to read in 30 seconds, clear enough that they understand immediately, and compelling enough that they ask a follow-up question.',
            question: 'Write the WhatsApp message or post you would send to your first customer TODAY. Imagine you are sending it to the specific person you described earlier. Include: what you do, what they get, and how to contact you. Keep it under 100 words.' },
          { teaching: 'The first line is the most important. If it does not make the customer curious, they will not read the rest. Start with their problem, not your service.',
            question: 'Look at the first line of your offer message. Does it name a problem the customer has, or does it start with "I do…"? Rewrite the first line to open with their problem or a surprising result.' },
        ],
        price_payment: [
          { teaching: 'Underpricing is the most common mistake first-time service providers make. If you charge too little, customers assume the quality is low. Pricing sends a signal. The right price is not the lowest price — it is the price that reflects the value you deliver.',
            question: 'Name a specific price for your service. Do not say "it depends" — name a number. How did you arrive at that number? What would you charge for a basic version and what would you charge for a premium version?' },
          { teaching: 'In Nigeria, popular payment methods include Opay, Palmpay, bank transfer, and cash. Your customer needs to be able to pay you easily. Friction at payment kills deals that are already won.',
            question: 'How will your customer pay you? Name the exact method — bank transfer to which bank, which mobile money app, cash on delivery? Walk through the payment process step by step as if explaining it to the customer.' },
        ],
        test_validate: [
          { teaching: 'Testing before building is the most important business lesson there is. Every successful company in the world tested their idea with one customer before spending money on technology, marketing, or staff. This is called the "manual first" approach — do the work yourself for one customer, then automate it if it works.',
            question: 'How can you test your business idea THIS WEEK without building any new technology? Describe the simplest possible experiment: one customer, one request, one result. What would success look like?' },
          { teaching: 'The goal of a test is not to make money — it is to learn. If the customer says yes, you learn the offer works. If they say no, you learn why and can change it. Both results are valuable. A test that fails is not a failure — it is information.',
            question: 'Name one specific person you could approach this week to test your offer. How would you contact them? What would you offer to do for them? What would you ask them afterwards to understand if your service was valuable?' },
        ],
        first_30_days: [
          { teaching: 'A business plan that lives on paper never starts. A to-do list with three names and a deadline is a business that might. The goal of the first 30 days is not to make a lot of money — it is to have your first real customer conversation and learn from it.',
            question: 'Name 3 specific people you will contact in the next 7 days about your service. For each one: their name (or description), how you know them, and how you will reach out. Make this real — not hypothetical.' },
          { teaching: 'Your AI tools are already paid for (this platform). Your knowledge is already built. The only thing between you and your first income is a message sent to the right person. You have everything you need to start today.',
            question: 'Write your 30-day plan: Week 1 (contact 3 people), Week 2 (follow up and deliver for first customer), Week 3 (improve based on feedback), Week 4 (ask for a referral or testimonial). Be specific about what you will actually do each week.' },
        ],
      };
      const seeds = fallbacks[task.id] ?? [
        { teaching: `This step — ${task.label} — is essential to turning your AI skills into a real income.`,
          question: `Share your current thinking on: ${task.label}` },
      ];
      setTaskInstruction({
        headline: task.label, context: `Working on: ${task.label}`,
        subTasks: seeds.map(s => s.question), subTaskTeaching: seeds.map(s => s.teaching),
        examplePrompt: seeds[0].question,
      });
    } finally { setLoadingInstruction(false); }
  }, [communicationStrategy, learningStrategy, lvl, userGradeLevel, canvas]);

  useEffect(() => {
    if (taskIndex > 0) fetchTaskInstruction(taskIndex, sessionContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIndex]);

  // ── Generate ──────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setErrorMsg(null); setAiResponse(null); setSubTaskCritique(null);
    await ensureSession();

    const entry: PromptEntry = {
      id: makeId(), taskId: currentTask?.id ?? '', subTaskIndex,
      subTaskQuestion: taskInstruction?.subTasks[subTaskIndex] ?? '',
      subTaskTeaching: taskInstruction?.subTaskTeaching?.[subTaskIndex] ?? '',
      prompt: prompt.trim(), timestamp: new Date().toISOString(),
      action: taskHasGeneration ? 'iterate' : 'generate',
    };

    try {
      const result = await callGenerateAPI({
        action: entry.action, prompt: prompt.trim(),
        taskId: currentTask?.id, taskLabel: currentTask?.label, phase: currentTask?.phase,
        sessionContext, communicationStrategy, learningStrategy, communicationLevel: lvl,
        gradeLevel: userGradeLevel,
        canvas,
      });

      entry.aiResponse = result.response || result.coaching;
      setAiResponse(result.response || result.coaching || null);

      // Update canvas section if AI returned content for it
      const canvasKey = TASK_CANVAS_MAP[currentTask?.id ?? ''];
      if (canvasKey && result.canvasContent) {
        const newCanvas = { ...canvas, [canvasKey]: result.canvasContent };
        setCanvas(newCanvas);
        await persistSession(newCanvas, [...promptHistory, entry], taskIndex, sessionContext);
      }

      // Update session context
      const newCtx = { ...sessionContext };
      if (currentTask?.id === 'spot_opportunity') newCtx.opportunity = prompt;
      if (currentTask?.id === 'know_customer')    newCtx.customer    = prompt;
      if (currentTask?.id === 'design_offer')     newCtx.offer       = prompt;
      setSessionContext(newCtx);

      // Fire-and-forget critique
      if (prompt.trim().length > 20) {
        setIsCritiquingResponse(true);
        fetch('/api/business-task-instruction', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            mode: 'critique', prompt: prompt.trim(),
            subTaskQuestion: taskInstruction?.subTasks[subTaskIndex] || '',
            taskId: currentTask?.id, communicationStrategy, learningStrategy, communicationLevel: lvl,
            gradeLevel: userGradeLevel,
          }),
        }).then(r => r.ok ? r.json() : null).then(d => {
          if (d?.feedback) {
            entry.aiCritique = d.feedback; entry.hasSuggestions = d.hasSuggestions;
            setSubTaskCritique({ hasSuggestions: !!d.hasSuggestions, feedback: d.feedback });
            if (!d.hasSuggestions) speakTextRef.current(d.feedback.slice(0, 200));
          }
        }).catch(() => {}).finally(() => setIsCritiquingResponse(false));
      }

      const newHistory = [...promptHistory, entry];
      setPromptHistory(newHistory); setTaskHasGeneration(true); setPrompt('');
      await persistSession(canvas, newHistory, taskIndex, newCtx);
      if (voiceOutputEnabled && result.response) speakTextRef.current(result.response.slice(0, 200));

    } catch (err: any) { setErrorMsg(err.message || 'Something went wrong'); }
    finally { setIsGenerating(false); }
  }, [prompt, isGenerating, currentTask, taskInstruction, subTaskIndex,
      canvas, sessionContext, promptHistory, taskHasGeneration,
      communicationStrategy, learningStrategy, lvl, userGradeLevel,
      ensureSession, persistSession, voiceOutputEnabled]);

  const handleCritique = useCallback(async () => {
    if (!prompt.trim() || isCritiquing) return;
    setIsCritiquing(true); setSubTaskCritique(null);
    try {
      const res = await fetch('/api/business-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          mode: 'critique', prompt: prompt.trim(),
          subTaskQuestion: taskInstruction?.subTasks[subTaskIndex] || '',
          taskId: currentTask?.id, communicationStrategy, learningStrategy, communicationLevel: lvl,
          gradeLevel: userGradeLevel,
        }),
      });
      if (res.ok) { const d = await res.json(); if (d?.feedback) setSubTaskCritique({ hasSuggestions: !!d.hasSuggestions, feedback: d.feedback }); }
    } catch {} finally { setIsCritiquing(false); }
  }, [prompt, isCritiquing, currentTask, taskInstruction, subTaskIndex, communicationStrategy, learningStrategy, lvl, userGradeLevel]);

  const handleMoveToNextStep = () => {
    const next = subTaskIndex + 1;
    if (next < (taskInstruction?.subTasks?.length ?? 1)) {
      setSubTaskIndex(next); setSubTaskCritique(null); setPrompt(''); setAiResponse(null);
      if (taskInstruction?.subTaskTeaching?.[next]) speakTextRef.current(taskInstruction.subTaskTeaching[next] + ' ' + taskInstruction.subTasks[next]);
    }
  };

  const handleCompleteTask = useCallback(async () => {
    if (taskIndex >= TASKS.length - 1) return;
    const nextIdx = taskIndex + 1;
    setTaskIndex(nextIdx); setTaskHasGeneration(false);
    setSubTaskIndex(0); setSubTaskCritique(null); setPrompt(''); setAiResponse(null); setErrorMsg(null);
    await persistSession(canvas, promptHistory, nextIdx, sessionContext);
  }, [taskIndex, canvas, promptHistory, sessionContext, persistSession]);

  const handleOnboardingComplete = useCallback(async () => {
    await ensureSession();
    setTaskIndex(1); setTaskHasGeneration(false); setSubTaskIndex(0); setSubTaskCritique(null);
    speakText('Welcome! Let\'s start by spotting the right opportunity for your business.');
    await fetchTaskInstruction(1, sessionContext);
    setTimeout(() => persistSession(canvas, promptHistory, 1, sessionContext), 100);
  }, [ensureSession, canvas, promptHistory, sessionContext, persistSession, fetchTaskInstruction, speakText]);

  // ── Evaluate ──────────────────────────────────────────────────────────
  const handleEvaluate = async () => {
    setShowEvaluation(true); setIsEvaluating(true); setEvalError(null);
    try {
      const r = await callEvaluateAPI({
        promptHistory: promptHistory.map(e => ({ action: e.action, prompt: e.prompt, response: e.aiResponse })),
        canvas, sessionContext, gradeLevel: userGradeLevel,
      });
      setEvaluation(r.evaluation ?? null); setEvalAdvice(r.advice ?? null);
    } catch (err: any) { setEvalError(err.message || 'Evaluation failed'); }
    finally { setIsEvaluating(false); }
  };

  const handleSaveProject = useCallback(async () => {
    if (!userId || !sessionIdRef.current) return;
    setIsSaving(true); setSaveError(null); await ensureSession();
    try {
      let evalScores: any = null; let advice: string | null = null;
      try {
        const r = await callEvaluateAPI({ promptHistory: promptHistory.map(e => ({ action: e.action, prompt: e.prompt, response: e.aiResponse })), canvas, sessionContext, gradeLevel: userGradeLevel });
        evalScores = r.evaluation ?? null; advice = r.advice ?? null;
      } catch {}
      await supabase.from('dashboard').update({
        business_canvas: canvas, business_prompts: promptHistory,
        business_evaluation: { taskIndex, sessionContext, scores: evalScores, savedAt: new Date().toISOString() },
        business_session_name: sessionName, updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('business_session_id', sessionIdRef.current);
      if (evalScores) { setEvaluation(evalScores); setEvalAdvice(advice); setShowEvaluation(true); }
      setLastSaved(new Date());
    } catch (err: any) { setSaveError(err.message || 'Save failed'); }
    finally { setIsSaving(false); }
  }, [userId, canvas, promptHistory, taskIndex, sessionContext, sessionName, userGradeLevel, ensureSession]);

  // ── Download canvas as text ───────────────────────────────────────────
  const handleDownload = () => {
    setDownloading(true);
    const lines = [
      `BUSINESS CANVAS — ${sessionName}`,
      `Generated: ${new Date().toLocaleDateString()}`,
      '='.repeat(50),
      '',
      ...CANVAS_SECTIONS.map(s => [
        s.label.toUpperCase(),
        canvas[s.key] || '(not yet completed)',
        '',
      ]).flat(),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${sessionName.replace(/\s+/g, '-').toLowerCase()}-canvas.txt`; a.click();
    setTimeout(() => setDownloading(false), 500);
  };

  const handleCopy = () => {
    const text = CANVAS_SECTIONS.map(s => `${s.label}\n${canvas[s.key] || '(empty)'}`).join('\n\n');
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const scoreColor = (s: number) => s >= 2.5 ? 'text-emerald-400' : s >= 1.5 ? 'text-amber-400' : 'text-red-400';
  const skillLabel = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const canvasFilled = Object.values(canvas).filter(v => v.trim().length > 0).length;

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <Navbar />

      {/* Voice fallback — fixed overlay when TTS unavailable (e.g. no network voice in Nigeria) */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      {/* ── Session picker ──────────────────────────────────────────── */}
      {showSessionPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderOpen size={18} className="text-amber-400" /> Your Business Projects
              </h2>
              <button onClick={() => setShowSessionPicker(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {sessions.map(s => (
                <button key={s.business_session_id} onClick={() => loadSession(s)}
                  className="w-full text-left p-3 bg-gray-700/40 hover:bg-gray-700 border border-gray-600 hover:border-amber-500/40 rounded-xl transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.business_session_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Task {(s.business_evaluation as any)?.taskIndex ?? 0}/{TASKS.length - 1} ·{' '}
                        {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <button onClick={e => handleDeleteSession(e, s.business_session_id)} disabled={deletingSessionId === s.business_session_id}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded transition-colors flex-shrink-0">
                      {deletingSessionId === s.business_session_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 pb-4 flex-shrink-0">
              <button onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl transition-colors">
                <Plus size={15} /> Start New Business Idea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Evaluation modal ─────────────────────────────────────────── */}
      {showEvaluation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 size={20} className="text-amber-400" /> Business Evaluation
              </h2>
              <button onClick={() => setShowEvaluation(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isEvaluating && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 size={36} className="animate-spin text-amber-400 mb-3" />
                  <p className="text-gray-300 font-medium">Evaluating your business plan…</p>
                  <p className="text-xs text-gray-500 mt-1">Reviewing opportunity, customer insight, offer clarity, business model, and action plan</p>
                </div>
              )}
              {evalError && !isEvaluating && (
                <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}
                </div>
              )}
              {evaluation && !isEvaluating && (
                <>
                  {evaluation.overall_score_average !== undefined && (
                    <div className="flex items-center gap-4 p-4 bg-gray-700/60 rounded-xl border border-gray-600">
                      <Award size={32} className="text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400 uppercase font-bold">Overall Score</p>
                        <p className={`text-3xl font-black ${scoreColor(evaluation.overall_score_average)}`}>
                          {Number(evaluation.overall_score_average).toFixed(1)}<span className="text-base font-normal text-gray-500"> / 3.0</span>
                        </p>
                      </div>
                      {evaluation.business_readiness && (
                        <div className="ml-auto text-right">
                          <p className="text-xs text-gray-400 uppercase font-bold">Business Readiness</p>
                          <p className="text-sm font-bold text-amber-300">{evaluation.business_readiness}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {evaluation.strengths_summary && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase mb-2">💪 Strengths</p>
                      <p className="text-xs text-gray-300 leading-relaxed">{evaluation.strengths_summary}</p>
                    </div>
                  )}
                  {evaluation.highest_leverage_improvements && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                      <p className="text-[10px] font-bold text-amber-400 uppercase mb-2">🎯 Key Improvements</p>
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">{evaluation.highest_leverage_improvements}</p>
                    </div>
                  )}
                  {evaluation.next_action && (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl">
                      <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">🚀 Your Next Action</p>
                      <p className="text-xs text-gray-300 leading-relaxed font-medium">{evaluation.next_action}</p>
                    </div>
                  )}
                  {evalAdvice && (
                    <div className="p-4 bg-violet-500/10 border border-violet-500/25 rounded-xl">
                      <p className="text-[10px] font-bold text-violet-400 uppercase mb-2">📋 Coaching Advice</p>
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">{evalAdvice}</p>
                    </div>
                  )}
                  {evaluation.detailed_scores && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Skill Breakdown</p>
                      {Object.entries(evaluation.detailed_scores as Record<string, { score: number; justification: string }>).map(([skill, data]) => (
                        <details key={skill} className="border border-gray-700 rounded-lg overflow-hidden">
                          <summary className="flex items-center gap-3 px-3 py-2 bg-gray-700/30 hover:bg-gray-700/50 cursor-pointer list-none">
                            <span className={`text-sm font-black w-5 text-right flex-shrink-0 ${scoreColor(data.score)}`}>{data.score}</span>
                            <span className="text-[11px] text-gray-300 flex-1">{skillLabel(skill)}</span>
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
                              <div className={`h-full rounded-full ${data.score >= 2 ? 'bg-emerald-500' : data.score >= 1 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${(data.score / 3) * 100}%` }} />
                            </div>
                          </summary>
                          {data.justification && (
                            <div className="px-4 py-2 bg-gray-900/40 border-t border-gray-700">
                              <p className="text-xs text-gray-400 leading-relaxed">{data.justification}</p>
                            </div>
                          )}
                        </details>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Layout ───────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '64px' }}>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Briefcase size={18} className="text-amber-400" />
              <span className="text-sm font-bold text-white">AI for Business</span>
            </div>
            <div className="w-px h-5 bg-gray-600 flex-shrink-0" />
            <input
              className="text-sm text-gray-300 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-amber-500 outline-none px-1 py-0.5 w-44"
              value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Business name…" />
            <div className="w-px h-5 bg-gray-600 flex-shrink-0" />
            <div className="flex items-center gap-1 flex-shrink-0">
              {[1, 2, 3].map(p => {
                const meta = PHASE_META[p]; const isActive = currentPhase === p; const isDone = currentPhase > p;
                return (
                  <span key={p} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors
                    ${isDone ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : isActive ? `${meta.bg} ${meta.color} ${meta.border}` : 'text-gray-600 border-gray-700'}`}>
                    {isDone ? `✓ P${p}` : `P${p}`}
                  </span>
                );
              })}
              <span className="text-[10px] text-gray-500 ml-1">{taskIndex + 1}/{TASKS.length}</span>
            </div>
            {/* Canvas progress */}
            <div className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/25 rounded-full flex-shrink-0">
              <span className="text-[10px] text-amber-400 font-medium">{canvasFilled}/{CANVAS_SECTIONS.length} canvas sections</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Voice toggle */}
            <div className="flex items-center gap-1">
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                <button onClick={() => setVoiceMode('english')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold transition-all border-r border-gray-600
                    ${voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}>
                  🇬🇧 <span className="hidden lg:inline">English</span>
                </button>
                <button onClick={() => setVoiceMode('pidgin')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold transition-all
                    ${voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}>
                  🇳🇬 <span className="hidden lg:inline">Pidgin</span>
                </button>
              </div>
              <button onClick={() => { setVoiceOutputEnabled(prev => { if (prev) cancelSpeech(); return !prev; }); }}
                className={`p-1.5 rounded-lg transition-colors border ${voiceOutputEnabled ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' : 'text-gray-600 border-gray-700'}`}>
                {voiceOutputEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </div>
            <button onClick={handleDownload} disabled={downloading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
              {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Canvas
            </button>
            <button onClick={() => { loadSessions(); setShowSessionPicker(true); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"><FolderOpen size={15} /></button>
            {lastSaved && !isSaving && <span className="text-[10px] text-gray-600 hidden sm:block">Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            {saveError && <span className="text-[10px] text-red-500">Save failed</span>}
            <button onClick={handleSaveProject} disabled={isSaving || !taskHasGeneration}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors disabled:opacity-40">
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={handleEvaluate} disabled={isEvaluating || promptHistory.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg transition-colors shadow disabled:opacity-50">
              {isEvaluating ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />} Evaluate
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">

          {/* ═══ LEFT: Task + Prompt ═══ */}
          <div className="w-80 flex-shrink-0 flex flex-col bg-[#1a1d23] border-r border-gray-700 overflow-hidden">
            {currentTask?.isOnboarding ? (
              <div className="flex-1 overflow-y-auto">
                <BusinessOnboarding onComplete={handleOnboardingComplete} />
              </div>
            ) : (
              <>
                {/* Task header */}
                <div className={`flex-shrink-0 flex items-center gap-2.5 px-4 py-3 border-b ${pm.border} ${pm.bg}`}>
                  <span className="text-lg">{currentTask?.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-[9px] font-bold uppercase tracking-wider ${pm.color}`}>{pm.label}</p>
                    <p className="text-sm font-bold text-white truncate">{currentTask?.label}</p>
                  </div>
                  {taskInstruction?.subTasks && taskInstruction.subTasks.length > 1 && (
                    <div className="flex gap-1 ml-auto flex-shrink-0">
                      {taskInstruction.subTasks.map((_, i) => (
                        <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i < subTaskIndex ? 'bg-emerald-400' : i === subTaskIndex ? 'bg-amber-400' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  )}
                </div>

                <TaskStepper tasks={TASKS} taskIndex={taskIndex} onJump={idx => { setTaskIndex(idx); setSubTaskIndex(0); setSubTaskCritique(null); setPrompt(''); setAiResponse(null); setErrorMsg(null); }} />

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">

                  {/* Instruction card */}
                  {loadingInstruction ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 size={14} className="animate-spin text-amber-400" />
                      <span className="text-xs text-gray-400">Preparing instruction…</span>
                    </div>
                  ) : taskInstruction ? (
                    <div className="rounded-xl border border-gray-700 overflow-hidden">
                      {taskInstruction.subTaskTeaching?.[subTaskIndex] && (
                        <div className="px-3 pt-2.5 pb-2 bg-gray-800/80 border-b border-gray-700">
                          <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${pm.color}`}>
                            Why this matters — Step {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                          </p>
                          <p className="text-xs text-gray-300 leading-relaxed italic">{taskInstruction.subTaskTeaching[subTaskIndex]}</p>
                        </div>
                      )}
                      <div className={`px-3 py-2.5 ${pm.bg}`}>
                        {!taskInstruction.subTaskTeaching?.[subTaskIndex] && (
                          <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${pm.color}`}>Step {subTaskIndex + 1} of {taskInstruction.subTasks.length}</p>
                        )}
                        <p className="text-sm text-white leading-relaxed font-medium">{taskInstruction.subTasks[subTaskIndex]}</p>
                        {subTaskIndex === 0 && taskInstruction.examplePrompt && (
                          <button onClick={() => { setPrompt(taskInstruction!.examplePrompt); promptRef.current?.focus(); }}
                            className={`mt-2 text-[10px] font-bold ${pm.color} hover:opacity-70 transition-opacity`}>
                            See example →
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* AI coaching response */}
                  {aiResponse && (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-[9px] font-bold text-amber-400 uppercase mb-1">Coach feedback</p>
                      <p className="text-xs text-gray-300 leading-relaxed">{aiResponse}</p>
                    </div>
                  )}

                  {/* Critique */}
                  {isCritiquingResponse && (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 size={12} className="animate-spin text-amber-400 flex-shrink-0" />
                      <span className="text-xs text-gray-400">Reviewing your response…</span>
                    </div>
                  )}
                  {subTaskCritique && (
                    <div className={`rounded-xl border overflow-hidden ${subTaskCritique.hasSuggestions ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
                      <div className="px-3 pt-2.5 pb-1 border-b border-inherit">
                        <p className={`text-[9px] font-bold uppercase tracking-wide ${subTaskCritique.hasSuggestions ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {subTaskCritique.hasSuggestions ? '💡 Feedback on your response' : '✅ Step complete'}
                        </p>
                      </div>
                      <p className="px-3 py-2.5 text-xs text-gray-200 leading-relaxed">{subTaskCritique.feedback}</p>
                      {subTaskCritique.hasSuggestions && <div className="px-3 pb-2.5 text-[10px] text-gray-500 italic">Refine your response, or move on when ready.</div>}
                    </div>
                  )}

                  {errorMsg && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                      <AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" />
                      <p className="text-xs text-red-300">{errorMsg}</p>
                    </div>
                  )}

                  <div>
                    <textarea ref={promptRef} value={prompt} onChange={e => setPrompt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                      placeholder={taskInstruction?.subTasks[subTaskIndex]?.substring(0, 80) + '…' || 'Share your thinking here…'}
                      style={{ minHeight: '140px' }}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-amber-500 transition-colors leading-relaxed" />
                    <p className="text-[9px] text-gray-700 mt-1">Ctrl+Enter to submit</p>
                  </div>
                </div>

                <div className="flex-shrink-0 px-4 pb-4 space-y-2">
                  <div className="flex gap-2">
                    <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl transition-colors disabled:opacity-40">
                      {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpCircle size={18} />}
                      {isGenerating && <span className="text-sm">Working…</span>}
                    </button>
                    <button onClick={handleCritique} disabled={isCritiquing || !prompt.trim()}
                      title="Get feedback on my response"
                      className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors disabled:opacity-40">
                      {isCritiquing ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                    </button>
                  </div>

                  {subTaskCritique?.hasSuggestions && subTaskIndex < (taskInstruction?.subTasks?.length ?? 1) - 1 && (
                    <button onClick={handleMoveToNextStep}
                      className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition-all">
                      <SkipForward size={13} /> Move to next step
                    </button>
                  )}

                  {taskIndex < TASKS.length - 1 && taskHasGeneration && subTaskIndex >= (taskInstruction?.subTasks?.length ?? 1) - 1 && (!subTaskCritique || !subTaskCritique.hasSuggestions) && (
                    <button onClick={handleCompleteTask}
                      className={`w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border transition-all ${pm.bg} ${pm.color} ${pm.border} hover:opacity-90`}>
                      <CheckCircle size={13} /> Complete & Continue <ArrowRight size={13} />
                    </button>
                  )}

                  {taskIndex < TASKS.length - 1 && taskHasGeneration && subTaskIndex >= (taskInstruction?.subTasks?.length ?? 1) - 1 && subTaskCritique?.hasSuggestions && (
                    <button onClick={handleCompleteTask}
                      className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-all">
                      <CheckCircle size={13} /> Complete anyway <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ═══ RIGHT: Business Canvas ═══ */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Canvas header */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={13} className="text-amber-400" />
                <span className="text-xs font-semibold text-gray-300">{sessionName} — Business Canvas</span>
                <div className="flex items-center gap-1 ml-1">
                  <div className="h-1.5 w-20 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
                      style={{ width: `${(canvasFilled / CANVAS_SECTIONS.length) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500">{canvasFilled}/{CANVAS_SECTIONS.length}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
                  {copied ? <Check size={11} /> : <Copy size={11} />}{copied ? 'Copied' : 'Copy all'}
                </button>
                <button onClick={handleDownload} disabled={downloading}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-amber-400 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded transition-colors">
                  <Download size={10} /> Download
                </button>
              </div>
            </div>

            {/* Canvas body */}
            <div className="flex-1 overflow-hidden bg-gray-900/50">
              <BusinessCanvasPanel
                canvas={canvas}
                onChange={updateCanvas}
                activeSection={activeSection}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AIForBusinessPage;