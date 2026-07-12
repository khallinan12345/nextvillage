// src/pages/AIContentCreationPage.tsx
//
// AI-Assisted Content Creation Workshop
// Three-phase curriculum: Understand → Create → Polish
// API routes needed:
//   /api/content-task-instruction
//   /api/generate-content
//   /api/evaluate-content-session

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Navbar from '../components/layout/Navbar';
import { PidginTooltip } from '../components/PidginTooltip';
import { playPidginVoice, stopPidginSpeech } from '../lib/speechCoordination';
import { supabase } from '../lib/supabaseClient';
import {
  PenLine, Sparkles, Loader2, Save, FolderOpen, Download,
  CheckCircle, ArrowRight, ArrowUpCircle, SkipForward,
  Lightbulb, BarChart3, Award, X, Copy, Check,
  Volume2, VolumeX, AlertCircle, Star, ChevronDown, ChevronUp,
  Trash2, Plus, RefreshCw, Eye, FileText, Mail, Globe,
  Video, Gift, Megaphone, MessageSquare, Wand2,
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
  id: number; content_session_id: string; content_session_name: string;
  content_type: string; content_pieces: ContentPiece[]; content_prompts: any[];
  content_evaluation: any | null; updated_at?: string;
}

interface ContentPiece {
  id: string; type: ContentType; title: string; body: string; createdAt: string;
}

type ContentType =
  | 'blog_post' | 'social_media' | 'email' | 'video_script'
  | 'grant_proposal' | 'product_description' | 'press_release' | 'story';

// ─── Constants ────────────────────────────────────────────────────────────────

const makeId = () => Math.random().toString(36).substring(2, 9);
const CONTENT_ACTIVITY = 'ai_content_creation';

const CONTENT_TYPES: { id: ContentType; label: string; icon: React.ReactNode; desc: string; colour: string }[] = [
  { id: 'blog_post',          label: 'Blog Post',           icon: <Globe size={16} />,       desc: 'Long-form article for a website or newsletter',  colour: 'text-blue-400'   },
  { id: 'social_media',       label: 'Social Media',        icon: <MessageSquare size={16} />, desc: 'Posts for Facebook, Instagram, X, or LinkedIn',   colour: 'text-pink-400'   },
  { id: 'email',              label: 'Email / Newsletter',  icon: <Mail size={16} />,         desc: 'Email to a community, customers, or donors',     colour: 'text-amber-400'  },
  { id: 'video_script',       label: 'Video Script',        icon: <Video size={16} />,        desc: 'Script for a YouTube video, reel, or presentation', colour: 'text-red-400'  },
  { id: 'grant_proposal',     label: 'Grant / Proposal',    icon: <Gift size={16} />,         desc: 'Funding proposal for NGOs or community projects',  colour: 'text-emerald-400'},
  { id: 'product_description',label: 'Product Description', icon: <Star size={16} />,         desc: 'Describe a product or service to attract buyers',  colour: 'text-violet-400' },
  { id: 'press_release',      label: 'Press Release',       icon: <Megaphone size={16} />,    desc: 'Announce news to media and the public',           colour: 'text-cyan-400'   },
  { id: 'story',              label: 'Short Story',         icon: <PenLine size={16} />,      desc: 'Creative fiction or narrative content',           colour: 'text-orange-400' },
];

const TASKS: TaskDef[] = [
  // Phase 1 — Understand
  { id: 'intro_content',    label: 'What is AI Content Creation?', phase: 1, icon: '💡', isOnboarding: true },
  { id: 'choose_type',      label: 'Choose Content Type',          phase: 1, icon: '📋' },
  { id: 'define_audience',  label: 'Know Your Audience',           phase: 1, icon: '🎯' },
  { id: 'define_purpose',   label: 'Define Your Purpose',          phase: 1, icon: '🧭' },
  // Phase 2 — Create
  { id: 'research_topic',   label: 'Gather Key Ideas',             phase: 2, icon: '🔍' },
  { id: 'write_draft',      label: 'Write Your First Draft',       phase: 2, icon: '✍️' },
  { id: 'add_voice',        label: 'Add Voice & Personality',      phase: 2, icon: '🎙️' },
  { id: 'structure_refine', label: 'Structure & Flow',             phase: 2, icon: '🏗️' },
  // Phase 3 — Polish
  { id: 'edit_clarity',     label: 'Clarity & Language',           phase: 3, icon: '✨' },
  { id: 'platform_adapt',   label: 'Adapt for Platform',           phase: 3, icon: '📱' },
  { id: 'final_review',     label: 'Final Review & Publish',       phase: 3, icon: '🚀' },
];

const PHASE_META: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Phase 1: Understand', color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30'   },
  2: { label: 'Phase 2: Create',     color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30' },
  3: { label: 'Phase 3: Polish',     color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30'  },
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function callInstructionAPI(body: Record<string, unknown>) {
  const res = await fetch('/api/content-task-instruction', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

async function callGenerateAPI(body: Record<string, unknown>) {
  const res = await fetch('/api/generate-content', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

async function callEvaluateAPI(body: Record<string, unknown>) {
  const res = await fetch('/api/evaluate-content-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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

const ContentOnboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    <div className="p-4 bg-violet-500/10 border border-violet-500/25 rounded-xl">
      <p className="text-xs font-bold text-violet-400 uppercase mb-3">💡 Welcome to AI-Assisted Content Creation</p>
      <p className="text-sm text-gray-300 leading-relaxed mb-3">
        Content is everywhere — blog posts, social media, emails, video scripts, grant proposals, stories.
        The ability to write clear, compelling content using AI is one of the most <strong className="text-white">in-demand and immediately employable</strong> skills in the world right now.
      </p>
      <p className="text-sm text-gray-300 leading-relaxed">
        In this workshop you will learn to think like a professional content creator — choosing the right type,
        understanding your audience, and using AI to draft, refine, and polish real content you can publish, send, or submit.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2">
      {[
        { icon: '🎯', title: 'Audience first',  desc: 'Great content starts with knowing who will read it' },
        { icon: '🤖', title: 'AI drafts fast',  desc: 'AI writes a first draft — you shape and refine it'  },
        { icon: '✨', title: 'You add the voice', desc: 'Your ideas and personality make it unique'         },
        { icon: '💼', title: 'Real-world ready', desc: 'Every piece you make here can be used today'        },
      ].map((item, i) => (
        <div key={i} className="p-3 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className="text-lg mb-1">{item.icon}</div>
          <p className="text-xs font-bold text-white mb-0.5">{item.title}</p>
          <p className="text-[11px] text-gray-400">{item.desc}</p>
        </div>
      ))}
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-2">📋 Content types you will master</p>
      <div className="grid grid-cols-2 gap-1">
        {CONTENT_TYPES.map(t => (
          <div key={t.id} className={`flex items-center gap-1.5 text-[11px] ${t.colour}`}>
            {t.icon} <span className="text-gray-300">{t.label}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">🗺️ Your learning path</p>
      <div className="space-y-1 text-xs text-gray-400">
        <div className="flex items-center gap-2"><span className="text-blue-400 font-bold">Phase 1 — Understand</span>Choose type · Know your audience · Define purpose</div>
        <div className="flex items-center gap-2"><span className="text-violet-400 font-bold">Phase 2 — Create</span>Research · Draft · Voice · Structure</div>
        <div className="flex items-center gap-2"><span className="text-amber-400 font-bold">Phase 3 — Polish</span>Clarity · Platform adapt · Publish-ready</div>
      </div>
    </div>

    <button onClick={onComplete}
      className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition-colors">
      Let's create something! <ArrowRight size={16} />
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

// ─── Content type selector ────────────────────────────────────────────────────

const ContentTypeSelector: React.FC<{ selected: ContentType | null; onSelect: (t: ContentType) => void }> = ({ selected, onSelect }) => (
  <div className="grid grid-cols-2 gap-2">
    {CONTENT_TYPES.map(t => (
      <button key={t.id} onClick={() => onSelect(t.id)}
        className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all
          ${selected === t.id
            ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
            : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'}`}>
        <span className={`mt-0.5 flex-shrink-0 ${t.colour}`}>{t.icon}</span>
        <div>
          <p className="text-xs font-bold leading-tight">{t.label}</p>
          <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{t.desc}</p>
        </div>
      </button>
    ))}
  </div>
);

// ─── Voice helper ─────────────────────────────────────────────────────────────

function resolveVoice(voices: SpeechSynthesisVoice[], mode: 'english' | 'pidgin'): SpeechSynthesisVoice | undefined {
  if (mode === 'pidgin') {
    return voices.find(v => v.lang === 'en-NG') || voices.find(v => v.name.toLowerCase().includes('nigeria'))
      || voices.find(v => v.lang === 'en-ZA') || voices.find(v => v.name === 'Google UK English Female')
      || voices.find(v => v.lang.startsWith('en'));
  }
  return voices.find(v => v.name === 'Google UK English Female')
    || voices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female'))
    || voices.find(v => v.lang === 'en-GB')
    || voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
    || voices.find(v => v.lang.startsWith('en'));
}

// ─── Word / char counter ──────────────────────────────────────────────────────

const ContentStats: React.FC<{ text: string }> = ({ text }) => {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const readMins = Math.max(1, Math.round(words / 200));
  return (
    <div className="flex items-center gap-3 text-[10px] text-gray-500">
      <span>{words} words</span>
      <span>{chars} chars</span>
      <span>~{readMins} min read</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const AIContentCreationPage: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null)); }, []);

  // ── Personality baseline ─────────────────────────────────────────────
  const [communicationStrategy, setCommunicationStrategy] = useState<any>(null);
  const [learningStrategy, setLearningStrategy]           = useState<any>(null);
  useEffect(() => {
    if (!userId) return;
    supabase.from('user_personality_baseline').select('communication_strategy, learning_strategy, communication_level')
      .eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data?.communication_strategy) setCommunicationStrategy(data.communication_strategy);
        if (data?.learning_strategy)       setLearningStrategy(data.learning_strategy);
        if (data?.communication_level != null) setCommunicationLevel(data.communication_level);
      });
  }, [userId]);

  const [communicationLevel, setCommunicationLevel] = useState(1);
  const lvl = communicationLevel;

  // ── Voice narration ──────────────────────────────────────────────────
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [availableVoices, setAvailableVoices]       = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice]           = useState<SpeechSynthesisVoice | null>(null);
  const [voiceMode, setVoiceMode]                   = useState<'english' | 'pidgin'>('english');
  const [userGradeLevel, setUserGradeLevel]         = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('grade_level').eq('id', userId).single()
      .then(({ data }) => { if (data?.grade_level) setUserGradeLevel(data.grade_level); });
  }, [userId]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => { const v = window.speechSynthesis.getVoices(); if (v.length) setAvailableVoices(v); };
    load(); window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
    if (!availableVoices.length) return;
    setSelectedVoice(resolveVoice(availableVoices, voiceMode) || null);
  }, [availableVoices, voiceMode]);

  const speakTextRef = useRef<(t: string) => void>(() => {});
  const speakBrowser = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 400));
    if (selectedVoice) { u.voice = selectedVoice; u.lang = selectedVoice.lang; } else u.lang = 'en-GB';
    u.rate   = voiceMode === 'pidgin' ? 0.80 : 0.88;
    u.pitch  = voiceMode === 'pidgin' ? 1.0  : 1.05;
    u.volume = 0.9;
    if      (userGradeLevel === 1) { u.rate = Math.min(u.rate, 0.75); u.pitch = 1.2; }
    else if (userGradeLevel === 2) { u.rate = Math.min(u.rate, 0.80); }
    window.speechSynthesis.speak(u);
  }, [selectedVoice, voiceMode, userGradeLevel]);
  const speakText = useCallback((text: string) => {
    if (!voiceOutputEnabled || !text.trim()) return;
    void playPidginVoice(text.slice(0, 400), 'english', {
      onError: (err) => {
        console.warn('[AIContentCreationPage] SpeechGen TTS failed, falling back to browser voice:', err);
        speakBrowser(text);
      },
    });
  }, [voiceOutputEnabled, voiceMode, speakBrowser]);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  // ── Session ──────────────────────────────────────────────────────────
  const [sessionId, setSessionId]               = useState<string | null>(null);
  const [sessionName, setSessionName]           = useState('Untitled Content');
  const [sessions, setSessions]                 = useState<SessionRecord[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Content state ────────────────────────────────────────────────────
  const [contentType,    setContentType]    = useState<ContentType | null>(null);
  const [contentPieces,  setContentPieces]  = useState<ContentPiece[]>([]);
  const [activeContentId, setActiveContentId] = useState<string | null>(null);
  const [previewMode,    setPreviewMode]    = useState(false);

  const activeContent = contentPieces.find(p => p.id === activeContentId) ?? null;

  const updateActiveContent = (body: string) => {
    setContentPieces(prev => prev.map(p => p.id === activeContentId ? { ...p, body } : p));
  };

  // ── Task ─────────────────────────────────────────────────────────────
  const [taskIndex, setTaskIndex]             = useState(0);
  const [taskInstruction, setTaskInstruction] = useState<TaskInstruction | null>(null);
  const [loadingInstruction, setLoadingInstruction] = useState(false);
  const [taskHasGeneration, setTaskHasGeneration] = useState(false);
  const [subTaskIndex, setSubTaskIndex]       = useState(0);
  const [subTaskCritique, setSubTaskCritique] = useState<{ hasSuggestions: boolean; feedback: string } | null>(null);
  const [isCritiquingResponse, setIsCritiquingResponse] = useState(false);
  const [sessionContext, setSessionContext]   = useState<Record<string, any>>({});

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

  // ── Misc ─────────────────────────────────────────────────────────────
  const [copied, setCopied]         = useState(false);
  const [downloading, setDownloading] = useState(false);

  const currentTask  = TASKS[taskIndex];
  const currentPhase = currentTask?.phase ?? 1;
  const pm           = PHASE_META[currentPhase];

  // ── Session management ───────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('dashboard')
      .select('id, content_session_id, content_session_name, content_type, content_pieces, content_prompts, content_evaluation, updated_at')
      .eq('user_id', userId).eq('activity', CONTENT_ACTIVITY)
      .not('content_session_id', 'is', null).order('updated_at', { ascending: false });
    if (data?.length) { setSessions(data as SessionRecord[]); if (!sessionId) setShowSessionPicker(true); }
  }, [userId, sessionId]);
  useEffect(() => { if (userId) loadSessions(); }, [userId, loadSessions]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (userId) {
      await supabase.from('dashboard').insert({
        user_id: userId, activity: CONTENT_ACTIVITY,
        content_session_id: sid, content_session_name: sessionName,
        content_type: contentType ?? '', content_pieces: [],
        content_prompts: [], content_evaluation: { taskIndex: 0 },
      });
    }
    return sid;
  }, [userId, sessionName, contentType]);

  const persistSession = useCallback(async (
    pieces: ContentPiece[], prompts: PromptEntry[], tIdx: number, ctx: Record<string, any>,
  ) => {
    const sid = sessionIdRef.current; if (!userId || !sid) return;
    await supabase.from('dashboard').update({
      content_pieces: pieces, content_prompts: prompts,
      content_type: contentType ?? ctx.contentType ?? '',
      content_evaluation: { taskIndex: tIdx, sessionContext: ctx },
      content_session_name: sessionName, updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('content_session_id', sid);
  }, [userId, sessionName, contentType]);

  const createNewSession = useCallback(async () => {
    if (!userId) return;
    const sid = makeId();
    await supabase.from('dashboard').insert({
      user_id: userId, activity: CONTENT_ACTIVITY,
      content_session_id: sid, content_session_name: 'Untitled Content',
      content_type: '', content_pieces: [], content_prompts: [],
      content_evaluation: { taskIndex: 0 },
    });
    setSessionId(sid); sessionIdRef.current = sid;
    setSessionName('Untitled Content'); setContentPieces([]); setActiveContentId(null);
    setContentType(null); setTaskIndex(0); setPromptHistory([]); setEvaluation(null);
    setSessionContext({}); setTaskHasGeneration(false); setShowSessionPicker(false);
    setTaskInstruction(null); setPrompt(''); setAiResponse(null); setErrorMsg(null);
  }, [userId]);

  const loadSession = useCallback((s: SessionRecord) => {
    setSessionId(s.content_session_id); sessionIdRef.current = s.content_session_id;
    setSessionName(s.content_session_name);
    setContentType((s.content_type as ContentType) || null);
    setContentPieces(s.content_pieces || []);
    setActiveContentId(s.content_pieces?.[0]?.id ?? null);
    const ev = s.content_evaluation || {};
    setTaskIndex(ev.taskIndex ?? 0); setSessionContext(ev.sessionContext ?? {});
    setEvaluation(ev.scores || null); setPromptHistory(s.content_prompts || []);
    setTaskHasGeneration(false); setShowSessionPicker(false);
    setTaskInstruction(null); setPrompt(''); setAiResponse(null); setErrorMsg(null); setSubTaskCritique(null);
  }, []);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation(); if (!userId) return;
    setDeletingSessionId(sid);
    try {
      await supabase.from('dashboard').update({
        content_session_id: null, content_session_name: null, content_type: null,
        content_pieces: null, content_prompts: null, content_evaluation: null,
      }).eq('user_id', userId).eq('content_session_id', sid);
      setSessions(prev => prev.filter(s => s.content_session_id !== sid));
    } finally { setDeletingSessionId(null); }
  }, [userId]);

  // ── Fetch task instruction ────────────────────────────────────────────
  const fetchTaskInstruction = useCallback(async (idx: number, ctx: Record<string, any>) => {
    const task = TASKS[idx]; if (!task || task.isOnboarding) return;
    setLoadingInstruction(true); setTaskInstruction(null);
    try {
      const result = await callInstructionAPI({
        taskId: task.id, taskLabel: task.label, phase: task.phase,
        contentType: contentType || ctx.contentType,
        sessionContext: ctx, completedTasks: TASKS.slice(0, idx).map(t => t.id),
        communicationStrategy, learningStrategy, communicationLevel: lvl,
        existingContent: activeContent?.body?.slice(0, 600) || '',
      });
      setTaskInstruction(result as TaskInstruction);
      if (result?.subTaskTeaching?.[0] && result?.subTasks?.[0]) {
        speakTextRef.current(result.subTaskTeaching[0] + ' ' + result.subTasks[0]);
      } else if (result?.subTasks?.[0]) {
        speakTextRef.current(result.subTasks[0]);
      }
    } catch {
      // ── Fallback instructions per task ──────────────────────────────
      const fallbacks: Record<string, { teaching: string; question: string }[]> = {
        choose_type: [
          { teaching: 'Choosing the right content type shapes everything — the length, tone, structure, and platform. A blog post reads very differently from a social media post or a grant proposal.',
            question: 'What type of content do you want to create? Select one from the panel on the right. Then tell me: what topic or subject will this content be about?' },
        ],
        define_audience: [
          { teaching: 'The most common mistake in content creation is writing for yourself instead of your reader. Every word, every sentence should serve the person who will read it.',
            question: 'Who is the person reading or watching this content? Describe them: their age, where they live, what they care about, and what problem they have that your content solves.' },
          { teaching: 'Knowing where your audience comes from changes the language you use. A local community in Oloibiri reads differently from a donor in London or a customer in Lagos.',
            question: 'What platform or channel will you publish this on? Where will your audience find it — Facebook, a website, email, YouTube, WhatsApp?' },
        ],
        define_purpose: [
          { teaching: 'Every piece of great content has one clear goal. Not two. Not five. One. If you cannot say in one sentence what you want the reader to do or feel after reading, the content will feel unfocused.',
            question: 'Complete this sentence: "After reading this, I want my audience to ___." What is the single most important action or feeling you want to create?' },
          { teaching: 'A hook is the first line that makes someone decide to keep reading. You have about 3 seconds to earn their attention.',
            question: 'What is the most interesting or surprising thing about your topic? This will become the hook — the first thing your audience sees.' },
        ],
        research_topic: [
          { teaching: 'Before writing, gather your raw material. Good content is built from specific facts, stories, examples, and insights — not vague generalities.',
            question: 'Tell me 3–5 key points, facts, or ideas you want to include. These do not need to be perfectly written — just list what you know or want to say.' },
          { teaching: 'A real story or specific example is always more powerful than a general statement. Readers connect with specifics.',
            question: 'Is there a story, personal experience, or example from your community that illustrates your main point? Describe it briefly.' },
        ],
        write_draft: [
          { teaching: 'The first draft does not need to be perfect. Its only job is to exist. You cannot edit a blank page. Write first, fix later.',
            question: 'Based on your audience, purpose, and key ideas — describe what your content should say from beginning to end. Use your own words and do not worry about grammar yet.' },
          { teaching: 'Structure is invisible when it works well. The reader flows naturally from beginning to middle to end without noticing the scaffolding.',
            question: 'How should this content be structured? For example: problem → solution → call to action, or story → lesson → takeaway. Describe the shape of your content.' },
        ],
        add_voice: [
          { teaching: 'Voice is what makes your content sound like YOU — not like every other AI-generated piece on the internet. Tone, rhythm, word choice, and personality all contribute.',
            question: 'Describe the tone and personality of this content in 3–5 words. For example: warm and encouraging, direct and urgent, formal and professional, playful and surprising.' },
          { teaching: 'Your audience should feel like you are speaking directly to them — not broadcasting to a crowd. The words "you" and "your" do this instantly.',
            question: 'Read through your current draft. Find one place where the language feels too formal or generic. How would you say that sentence if you were speaking to one person face-to-face?' },
        ],
        structure_refine: [
          { teaching: 'Headings, paragraphs, and white space are not decoration — they are navigation tools. Readers scan before they read. Clear structure invites them in.',
            question: 'Does your current draft have a clear opening, middle, and ending? Describe what each section is doing and whether you feel anything is missing or in the wrong order.' },
          { teaching: 'A call to action (CTA) tells the reader exactly what to do next. Without it, even great content produces no result.',
            question: 'What should the reader do after finishing your content? Click a link, reply to an email, share it, donate, buy something? Write your call to action.' },
        ],
        edit_clarity: [
          { teaching: 'The most powerful edit you can make is cutting. Every word that does not add meaning should be removed. Short sentences are almost always better than long ones.',
            question: 'Read your draft aloud. Find the three most complicated or wordy sentences. Paste them here and I will help you simplify them.' },
          { teaching: 'Passive voice weakens writing. "The project was completed by our team" becomes "Our team completed the project." Active voice is stronger and clearer.',
            question: 'Are there any places in your draft where you are using passive voice or indirect language? Share them here, or ask me to scan your draft for these patterns.' },
        ],
        platform_adapt: [
          { teaching: 'The same content works differently on different platforms. A blog post is too long for Instagram. A tweet is too short for email. Platform adaptation is not a shortcut — it is a skill.',
            question: 'Besides the main platform, which other channel could this content be adapted for? Describe how the format, length, or tone would need to change.' },
          { teaching: 'Hashtags, subject lines, meta descriptions, and captions are each a separate skill. The right ones dramatically increase how many people see your content.',
            question: 'What is the subject line for this email, the caption for this post, or the headline for this article? Write 2–3 options and I will help you pick the strongest one.' },
        ],
        final_review: [
          { teaching: 'Before publishing, every professional content creator runs through a checklist. Typos, broken links, missing CTAs, wrong dates — small errors damage credibility.',
            question: 'Read your final draft one more time. List any remaining concerns, things that feel incomplete, or details you want to double-check before publishing.' },
          { teaching: 'Publishing is not the end — it is the beginning. Planning how to promote and distribute content multiplies its impact dramatically.',
            question: 'How will you share this content? Describe your distribution plan: who will you send it to, when will you post it, and how will you know if it worked?' },
        ],
      };
      const seeds = fallbacks[task.id] ?? [
        { teaching: `This step — ${task.label} — is essential to creating professional content that achieves results.`,
          question: `What are your thoughts on this step: ${task.label}? Describe where you are and what you want to achieve.` },
      ];
      setTaskInstruction({
        headline: task.label, context: `Working on: ${task.label}`,
        subTasks: seeds.map(s => s.question), subTaskTeaching: seeds.map(s => s.teaching),
        examplePrompt: seeds[0].question,
      });
    } finally { setLoadingInstruction(false); }
  }, [communicationStrategy, learningStrategy, lvl, contentType, activeContent]);

  useEffect(() => {
    if (taskIndex > 0) fetchTaskInstruction(taskIndex, sessionContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIndex]);

  // ── Generate content ──────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true); setErrorMsg(null); setAiResponse(null); setSubTaskCritique(null);
    await ensureSession();

    const entry: PromptEntry = {
      id: makeId(), taskId: currentTask?.id, subTaskIndex,
      subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
      subTaskTeaching: taskInstruction?.subTaskTeaching?.[subTaskIndex],
      prompt, timestamp: new Date().toISOString(),
      action: taskHasGeneration ? 'iterate' : 'generate',
    };

    try {
      const result = await callGenerateAPI({
        action: entry.action, prompt,
        taskId: currentTask?.id, taskLabel: currentTask?.label, phase: currentTask?.phase,
        contentType: contentType || sessionContext.contentType,
        sessionContext, communicationStrategy, learningStrategy, communicationLevel: lvl,
        existingContent: activeContent?.body || '',
      });

      entry.aiResponse = result.content || result.response;

      // If the AI generated/updated content, update the content canvas
      if (result.content) {
        if (activeContent) {
          updateActiveContent(result.content);
        } else {
          // Create a new content piece
          const typeInfo = CONTENT_TYPES.find(t => t.id === (contentType || sessionContext.contentType));
          const newPiece: ContentPiece = {
            id: makeId(),
            type: (contentType || sessionContext.contentType || 'blog_post') as ContentType,
            title: sessionName,
            body: result.content,
            createdAt: new Date().toISOString(),
          };
          setContentPieces(prev => [...prev, newPiece]);
          setActiveContentId(newPiece.id);
        }
      }

      setAiResponse(result.response || result.coaching || null);

      // Update session context from AI
      const newCtx = { ...sessionContext, ...result.contextUpdates };
      if (currentTask?.id === 'choose_type' && contentType) newCtx.contentType = contentType;
      if (currentTask?.id === 'define_audience') newCtx.audience = prompt;
      if (currentTask?.id === 'define_purpose')  newCtx.purpose  = prompt;
      setSessionContext(newCtx);

      // Critique the student response
      if (prompt.trim().length > 15 && currentTask?.id !== 'choose_type') {
        setIsCritiquingResponse(true);
        fetch('/api/content-task-instruction', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'critique', prompt, subTaskQuestion: taskInstruction?.subTasks[subTaskIndex] || '',
            taskId: currentTask?.id, contentType, communicationStrategy, learningStrategy, communicationLevel: lvl,
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
      const finalPieces = activeContent
        ? contentPieces.map(p => p.id === activeContentId ? { ...p, body: result.content || p.body } : p)
        : contentPieces;
      await persistSession(finalPieces, newHistory, taskIndex, newCtx);

      if (voiceOutputEnabled && result.response) speakTextRef.current(result.response.slice(0, 200));

    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
    } finally { setIsGenerating(false); }
  }, [prompt, isGenerating, currentTask, taskInstruction, subTaskIndex, contentType,
      sessionContext, promptHistory, taskHasGeneration, activeContent, contentPieces,
      activeContentId, communicationStrategy, learningStrategy, lvl,
      ensureSession, persistSession, voiceOutputEnabled]);

  const handleCritique = useCallback(async () => {
    if (!prompt.trim() || isCritiquing) return;
    setIsCritiquing(true); setSubTaskCritique(null);
    try {
      const res = await fetch('/api/content-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'critique', prompt, subTaskQuestion: taskInstruction?.subTasks[subTaskIndex] || '',
          taskId: currentTask?.id, contentType, communicationStrategy, learningStrategy, communicationLevel: lvl,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.feedback) setSubTaskCritique({ hasSuggestions: !!d.hasSuggestions, feedback: d.feedback });
      }
    } catch {} finally { setIsCritiquing(false); }
  }, [prompt, isCritiquing, currentTask, taskInstruction, subTaskIndex, contentType, communicationStrategy, learningStrategy, lvl]);

  const handleMoveToNextStep = () => {
    const next = subTaskIndex + 1;
    if (next < (taskInstruction?.subTasks?.length ?? 1)) {
      setSubTaskIndex(next); setSubTaskCritique(null); setPrompt(''); setAiResponse(null);
      if (taskInstruction?.subTaskTeaching?.[next] && taskInstruction?.subTasks?.[next]) {
        speakTextRef.current(taskInstruction.subTaskTeaching[next] + ' ' + taskInstruction.subTasks[next]);
      }
    }
  };

  const handleCompleteTask = useCallback(async () => {
    if (taskIndex >= TASKS.length - 1) return;
    const nextIdx = taskIndex + 1;
    setTaskIndex(nextIdx); setTaskHasGeneration(false);
    setSubTaskIndex(0); setSubTaskCritique(null);
    setPrompt(''); setAiResponse(null); setErrorMsg(null);
    await persistSession(contentPieces, promptHistory, nextIdx, sessionContext);
  }, [taskIndex, contentPieces, promptHistory, sessionContext, persistSession]);

  const handleOnboardingComplete = useCallback(async () => {
    await ensureSession();
    setTaskIndex(1); setTaskHasGeneration(false); setSubTaskIndex(0); setSubTaskCritique(null);
    speakText('Welcome! Let\'s start by choosing what type of content you want to create.');
    await fetchTaskInstruction(1, sessionContext);
    setTimeout(() => persistSession(contentPieces, promptHistory, 1, sessionContext), 100);
  }, [ensureSession, contentPieces, promptHistory, sessionContext, persistSession, fetchTaskInstruction, speakText]);

  // ── Content type selection handler ────────────────────────────────────
  const handleContentTypeSelect = useCallback((type: ContentType) => {
    setContentType(type);
    const newCtx = { ...sessionContext, contentType: type };
    setSessionContext(newCtx);
    const typeInfo = CONTENT_TYPES.find(t => t.id === type)!;
    speakText(lvl <= 1
      ? `Good choice! You selected ${typeInfo.label}. Now tell me what this content will be about.`
      : `Great. You've selected ${typeInfo.label}. Describe your topic in the prompt box.`);
  }, [sessionContext, speakText, lvl]);

  // ── Evaluate ─────────────────────────────────────────────────────────
  const handleEvaluate = async () => {
    setShowEvaluation(true); setIsEvaluating(true); setEvalError(null);
    try {
      const r = await callEvaluateAPI({
        promptHistory: promptHistory.map(e => ({ action: e.action, prompt: e.prompt, response: e.aiResponse })),
        contentPieces: contentPieces.map(p => ({ type: p.type, title: p.title, body: p.body })),
        contentType, sessionContext,
      });
      setEvaluation(r.evaluation ?? null); setEvalAdvice(r.advice ?? null);
    } catch (err: any) { setEvalError(err.message || 'Evaluation failed'); }
    finally { setIsEvaluating(false); }
  };

  // ── Save project ──────────────────────────────────────────────────────
  const handleSaveProject = useCallback(async () => {
    if (!userId || !sessionIdRef.current) return;
    setIsSaving(true); setSaveError(null); await ensureSession();
    try {
      let evalScores: any = null; let advice: string | null = null;
      try {
        const r = await callEvaluateAPI({
          promptHistory: promptHistory.map(e => ({ action: e.action, prompt: e.prompt, response: e.aiResponse })),
          contentPieces: contentPieces.map(p => ({ type: p.type, title: p.title, body: p.body })),
          contentType, sessionContext,
        });
        evalScores = r.evaluation ?? null; advice = r.advice ?? null;
      } catch {}
      await supabase.from('dashboard').update({
        content_pieces: contentPieces, content_prompts: promptHistory,
        content_type: contentType ?? '',
        content_evaluation: { taskIndex, sessionContext, scores: evalScores, savedAt: new Date().toISOString() },
        content_session_name: sessionName, updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('content_session_id', sessionIdRef.current);
      if (evalScores) { setEvaluation(evalScores); setEvalAdvice(advice); setShowEvaluation(true); }
      setLastSaved(new Date());
    } catch (err: any) { setSaveError(err.message || 'Save failed'); }
    finally { setIsSaving(false); }
  }, [userId, contentPieces, promptHistory, taskIndex, sessionContext, sessionName, contentType, ensureSession]);

  // ── Download as text file ─────────────────────────────────────────────
  const handleDownload = () => {
    if (!activeContent?.body) return;
    setDownloading(true);
    const blob = new Blob([activeContent.body], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${sessionName.replace(/\s+/g, '-').toLowerCase()}.txt`; a.click();
    setTimeout(() => setDownloading(false), 500);
  };

  const handleCopy = () => {
    if (!activeContent?.body) return;
    navigator.clipboard.writeText(activeContent.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  const scoreColor = (s: number) => s >= 2.5 ? 'text-emerald-400' : s >= 1.5 ? 'text-amber-400' : 'text-red-400';
  const skillLabel = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <Navbar />

      {/* ── Session picker ──────────────────────────────────────────── */}
      {showSessionPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderOpen size={18} className="text-violet-400" /> Your Content Projects
              </h2>
              <button onClick={() => setShowSessionPicker(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {sessions.map(s => (
                <button key={s.content_session_id} onClick={() => loadSession(s)}
                  className="w-full text-left p-3 bg-gray-700/40 hover:bg-gray-700 border border-gray-600 hover:border-violet-500/40 rounded-xl transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.content_session_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.content_type && (
                          <span className="text-[10px] text-violet-400 font-medium">
                            {CONTENT_TYPES.find(t => t.id === s.content_type)?.label ?? s.content_type}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          Task {(s.content_evaluation as any)?.taskIndex ?? 0}/{TASKS.length - 1} ·{' '}
                          {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
                        </span>
                      </div>
                    </div>
                    <button onClick={e => handleDeleteSession(e, s.content_session_id)}
                      disabled={deletingSessionId === s.content_session_id}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded transition-colors flex-shrink-0">
                      {deletingSessionId === s.content_session_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 pb-4 flex-shrink-0">
              <button onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors">
                <Plus size={15} /> Start New Project
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
                <BarChart3 size={20} className="text-violet-400" /> Content Evaluation
              </h2>
              <button onClick={() => setShowEvaluation(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isEvaluating && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 size={36} className="animate-spin text-violet-400 mb-3" />
                  <p className="text-gray-300 font-medium">Evaluating your content…</p>
                  <p className="text-xs text-gray-500 mt-1">Reviewing audience awareness, clarity, structure, voice, and impact</p>
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
                      {evaluation.certification_readiness && (
                        <div className="ml-auto text-right">
                          <p className="text-xs text-gray-400 uppercase font-bold">Certification</p>
                          <p className="text-sm font-bold text-violet-300">{evaluation.certification_readiness}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Phase averages */}
                  {evaluation.phase_averages && (
                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(evaluation.phase_averages as Record<string, number>).map(([k, v]) => {
                        const labels: Record<string, string> = { understand: 'Understand', create: 'Create', polish: 'Polish' };
                        const colors: Record<string, string> = { understand: 'text-blue-400 bg-blue-500/10 border-blue-500/25', create: 'text-violet-400 bg-violet-500/10 border-violet-500/25', polish: 'text-amber-400 bg-amber-500/10 border-amber-500/25' };
                        return (
                          <div key={k} className={`flex flex-col items-center p-3 rounded-xl border ${colors[k] || 'text-gray-400 bg-gray-700/30 border-gray-600'}`}>
                            <p className="text-[9px] font-bold uppercase mb-0.5">{labels[k] || k}</p>
                            <p className={`text-xl font-black ${scoreColor(Number(v))}`}>{Number(v).toFixed(1)}</p>
                            <p className="text-[9px] text-gray-500">/ 3.0</p>
                          </div>
                        );
                      })}
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
                  {evalAdvice && (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl">
                      <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">📋 Coaching Advice</p>
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">{evalAdvice}</p>
                    </div>
                  )}

                  {evaluation.detailed_scores && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Skill-by-Skill Breakdown</p>
                      {Object.entries(evaluation.detailed_scores as Record<string, { score: number; justification: string }>).map(([skill, data]) => (
                        <details key={skill} className="group border border-gray-700 rounded-lg overflow-hidden">
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

        {/* Top toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <PenLine size={18} className="text-violet-400" />
              <span className="text-sm font-bold text-white">Content Creator</span>
            </div>
            <div className="w-px h-5 bg-gray-600 flex-shrink-0" />
            <input
              className="text-sm text-gray-300 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-violet-500 outline-none px-1 py-0.5 w-44"
              value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Project name…"
            />
            <div className="w-px h-5 bg-gray-600 flex-shrink-0" />
            {/* Phase pills */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {[1, 2, 3].map(p => {
                const meta = PHASE_META[p]; const isActive = currentPhase === p; const isDone = currentPhase > p;
                return (
                  <span key={p} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors
                    ${isDone ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : isActive ? `${meta.bg} ${meta.color} ${meta.border}`
                    : 'text-gray-600 border-gray-700'}`}>
                    {isDone ? `✓ P${p}` : `P${p}`}
                  </span>
                );
              })}
              <span className="text-[10px] text-gray-500 ml-1">{taskIndex + 1}/{TASKS.length}</span>
            </div>
            {/* Active content type badge */}
            {contentType && (
              <div className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 border border-violet-500/25 rounded-full flex-shrink-0">
                <span className={`text-[10px] font-bold ${CONTENT_TYPES.find(t => t.id === contentType)?.colour ?? 'text-violet-400'}`}>
                  {CONTENT_TYPES.find(t => t.id === contentType)?.label}
                </span>
              </div>
            )}
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
              <button onClick={() => { setVoiceOutputEnabled(prev => { if (prev) window.speechSynthesis?.cancel(); return !prev; }); }}
                className={`p-1.5 rounded-lg transition-colors border ${voiceOutputEnabled ? 'text-violet-400 border-violet-500/40 bg-violet-500/10' : 'text-gray-600 border-gray-700 hover:text-gray-400'}`}>
                {voiceOutputEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </div>

            {/* Preview toggle */}
            {activeContent && (
              <button onClick={() => setPreviewMode(p => !p)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors border
                  ${previewMode ? 'text-violet-300 border-violet-500/40 bg-violet-500/10' : 'text-gray-400 border-gray-600 hover:text-gray-200 hover:bg-gray-700'}`}>
                <Eye size={12} /> {previewMode ? 'Edit' : 'Preview'}
              </button>
            )}
            <button onClick={handleDownload} disabled={!activeContent?.body || downloading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40">
              {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} .txt
            </button>
            <button onClick={() => { loadSessions(); setShowSessionPicker(true); }}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
              <FolderOpen size={15} />
            </button>
            {lastSaved && !isSaving && <span className="text-[10px] text-gray-600 hidden sm:block">Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            {saveError && <span className="text-[10px] text-red-500">Save failed</span>}
            <button onClick={handleSaveProject} disabled={isSaving || !taskHasGeneration}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-lg transition-colors disabled:opacity-40">
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={handleEvaluate} disabled={isEvaluating || promptHistory.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white rounded-lg transition-colors shadow disabled:opacity-50">
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
                <ContentOnboarding onComplete={handleOnboardingComplete} />
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
                        <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i < subTaskIndex ? 'bg-emerald-400' : i === subTaskIndex ? 'bg-violet-400' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Task stepper */}
                <TaskStepper tasks={TASKS} taskIndex={taskIndex} onJump={idx => { setTaskIndex(idx); setSubTaskIndex(0); setSubTaskCritique(null); setPrompt(''); setAiResponse(null); setErrorMsg(null); }} />

                {/* Scrollable middle */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">

                  {/* Content type selector on choose_type task */}
                  {currentTask?.id === 'choose_type' && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Select your content type</p>
                      <ContentTypeSelector selected={contentType} onSelect={handleContentTypeSelect} />
                      {contentType && (
                        <div className="p-2 bg-violet-500/10 border border-violet-500/30 rounded-lg flex items-center gap-2">
                          <CheckCircle size={12} className="text-violet-400 flex-shrink-0" />
                          <p className="text-xs text-violet-300">
                            {CONTENT_TYPES.find(t => t.id === contentType)?.label} selected. Now describe your topic below.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Instruction card */}
                  {loadingInstruction ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 size={14} className="animate-spin text-violet-400" />
                      <span className="text-xs text-gray-400">Preparing instruction…</span>
                    </div>
                  ) : taskInstruction ? (
                    <div className="rounded-xl border border-gray-700 overflow-hidden">
                      {taskInstruction.subTaskTeaching?.[subTaskIndex] && (
                        <div className="px-3 pt-2.5 pb-2 bg-gray-800/80 border-b border-gray-700">
                          <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${pm.color}`}>
                            Why this matters — Step {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                          </p>
                          <p className="text-xs text-gray-300 leading-relaxed italic">
                            {taskInstruction.subTaskTeaching[subTaskIndex]}
                          </p>
                        </div>
                      )}
                      <div className={`px-3 py-2.5 ${pm.bg}`}>
                        {!taskInstruction.subTaskTeaching?.[subTaskIndex] && (
                          <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${pm.color}`}>
                            Step {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                          </p>
                        )}
                        <p className="text-sm text-white leading-relaxed font-medium">
                          {taskInstruction.subTasks[subTaskIndex]}
                        </p>
                        {subTaskIndex === 0 && taskInstruction.examplePrompt && (
                          <button onClick={() => { setPrompt(taskInstruction!.examplePrompt); promptRef.current?.focus(); }}
                            className={`mt-2 text-[10px] font-bold ${pm.color} hover:opacity-70 transition-opacity`}>
                            See example →
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* AI response / coaching */}
                  {aiResponse && (
                    <div className="p-2.5 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                      <p className="text-[9px] font-bold text-violet-400 uppercase mb-1">Coach feedback</p>
                      <p className="text-xs text-gray-300 leading-relaxed">{aiResponse}</p>
                    </div>
                  )}

                  {/* Response critique */}
                  {isCritiquingResponse && (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 size={12} className="animate-spin text-violet-400 flex-shrink-0" />
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

                  {/* Error */}
                  {errorMsg && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                      <AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" />
                      <p className="text-xs text-red-300">{errorMsg}</p>
                    </div>
                  )}

                  {/* Prompt textarea */}
                  <div>
                    <textarea ref={promptRef} value={prompt} onChange={e => setPrompt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                      placeholder={taskInstruction?.subTasks[subTaskIndex]?.replace(/^[^:]+:\s*/, '').substring(0, 80) + '…' || 'Type your response here…'}
                      style={{ minHeight: '140px' }}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-violet-500 transition-colors leading-relaxed" />
                    <p className="text-[9px] text-gray-700 mt-1">Ctrl+Enter to submit</p>
                  </div>
                </div>

                {/* Fixed bottom buttons */}
                <div className="flex-shrink-0 px-4 pb-4 space-y-2">
                  <div className="flex gap-2">
                    <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors disabled:opacity-40">
                      {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpCircle size={18} />}
                      {isGenerating && <span className="text-sm">Working…</span>}
                    </button>
                    <button onClick={handleCritique} disabled={isCritiquing || !prompt.trim()}
                      title="Critique my response"
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

          {/* ═══ RIGHT: Content Canvas ═══ */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Content canvas header */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={13} className="text-violet-400" />
                <span className="text-xs font-semibold text-gray-300">
                  {activeContent ? activeContent.title : lvl <= 1 ? 'Your content will appear here' : 'Content Canvas'}
                </span>
                {activeContent && <ContentStats text={activeContent.body} />}
              </div>
              <div className="flex items-center gap-2">
                {activeContent && (
                  <>
                    <button onClick={handleCopy}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
                      {copied ? <Check size={11} /> : <Copy size={11} />}{copied ? 'Copied' : 'Copy'}
                    </button>
                    {/* Improve English button on the canvas */}
                    <button
                      onClick={async () => {
                        if (!activeContent?.body.trim() || isGenerating) return;
                        setIsGenerating(true);
                        try {
                          const r = await callGenerateAPI({
                            action: 'improve_english', prompt: activeContent.body,
                            taskId: 'edit_clarity', contentType, sessionContext,
                            communicationStrategy, learningStrategy, communicationLevel: lvl,
                            existingContent: activeContent.body,
                          });
                          if (r.content) updateActiveContent(r.content);
                          if (r.response) setAiResponse(r.response);
                        } catch {} finally { setIsGenerating(false); }
                      }}
                      disabled={isGenerating || !activeContent?.body}
                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-violet-300 hover:text-white bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded transition-colors disabled:opacity-40">
                      <Wand2 size={10} /> Improve English
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Canvas body */}
            <div className="flex-1 overflow-hidden">
              {!activeContent ? (
                <div className="h-full flex items-center justify-center text-center p-8">
                  <div>
                    <PenLine size={48} className="text-gray-700 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 font-medium">
                      {lvl <= 1 ? 'Your writing will appear here as you work through the tasks.'
                               : 'Your content will appear here as you progress through the workshop.'}
                    </p>
                    <p className="text-xs text-gray-600 mt-2">
                      {lvl <= 1 ? 'Start by choosing what type of content you want to make.'
                               : 'Begin by choosing a content type and defining your audience.'}
                    </p>
                  </div>
                </div>
              ) : previewMode ? (
                // Preview mode — rendered with basic formatting
                <div className="h-full overflow-y-auto p-6 bg-white text-gray-900">
                  <div className="max-w-2xl mx-auto">
                    <h1 className="text-2xl font-bold mb-4 text-gray-900">{activeContent.title}</h1>
                    <div className="prose prose-sm max-w-none">
                      {activeContent.body.split('\n').map((line, i) => (
                        line.trim() === '' ? <br key={i} /> :
                        line.startsWith('# ') ? <h1 key={i} className="text-xl font-bold mt-4 mb-2">{line.slice(2)}</h1> :
                        line.startsWith('## ') ? <h2 key={i} className="text-lg font-bold mt-3 mb-1">{line.slice(3)}</h2> :
                        line.startsWith('### ') ? <h3 key={i} className="text-base font-bold mt-2 mb-1">{line.slice(4)}</h3> :
                        line.startsWith('- ') || line.startsWith('* ') ? <li key={i} className="ml-4 list-disc">{line.slice(2)}</li> :
                        <p key={i} className="mb-2 leading-relaxed">{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                // Edit mode — rich textarea
                <textarea
                  value={activeContent.body}
                  onChange={e => updateActiveContent(e.target.value)}
                  spellCheck
                  placeholder={lvl <= 1
                    ? 'Your content will appear here. You can also type directly…'
                    : 'Your content will be generated here as you progress. You can edit it directly at any time…'}
                  className="w-full h-full bg-gray-900 text-gray-100 px-6 py-5 text-sm leading-relaxed resize-none outline-none placeholder-gray-700 font-mono"
                  style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '14px', lineHeight: '1.8' }}
                />
              )}
            </div>

            {/* Canvas footer — content piece tabs if multiple */}
            {contentPieces.length > 1 && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-800/60 border-t border-gray-700 flex-shrink-0 overflow-x-auto">
                {contentPieces.map(p => (
                  <button key={p.id} onClick={() => setActiveContentId(p.id)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0
                      ${activeContentId === p.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/40'}`}>
                    {CONTENT_TYPES.find(t => t.id === p.type)?.icon}
                    <span className="ml-1">{p.title.slice(0, 30)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AIContentCreationPage;
