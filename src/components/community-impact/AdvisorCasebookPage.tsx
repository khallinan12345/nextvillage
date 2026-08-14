// src/components/community-impact/AdvisorCasebookPage.tsx
//
// Shared "advisor casebook" page — a youth advisor registers entity
// records (farmers/clients), runs structured-intake AI consultations
// against a category taxonomy, and follows up. This is the merged
// implementation shared by Agriculture, Fishing, and Animal Husbandry
// (AgricultureConsultantPage.tsx / FishingConsultantPage.tsx /
// AnimalHusbandryPage.tsx are now thin wrappers passing a DomainConfig).
//
// Flow: dashboard -> add-entity -> entity-detail -> new-consultation
// (structured intake + AI-coached Probe Panel + AI advice) -> follow-up
// chat -> case-detail. Plus Community AI Challenge enrollment/submission,
// evidence linking, and resolution tracking — identical across all three
// source pages.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../layout/AppLayout';
import { useLocation, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { resolveChallengeOrgSlug } from '../../lib/communityChallengeScope';
import { chatText } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import { PidginTooltip } from '../PidginTooltip';
import { AIPidginCoachWrapper } from '../AIPidginCoachWrapper';
import { playPidginVoice, stopPidginSpeech } from '../../lib/speechCoordination';
import { ResolutionModal, ResolutionSubmitData } from './ResolutionModal';
import { EvidencePicker } from './EvidencePicker';
import {
  ArrowLeft, Send, Loader2, Plus, User,
  AlertTriangle, CheckCircle, Clock, ChevronRight, X,
  ClipboardList, Calendar,
  Mic, MicOff, Volume2, VolumeX, Lightbulb, ShieldCheck, RefreshCw, Award, BookOpen,
} from 'lucide-react';
import classNames from 'classnames';
import { DomainConfig, IntakeField, AdvisorEntity, AdvisorConsultation } from '../../data/community-impact/domainConfig';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type AppMode =
  | 'dashboard'
  | 'add-entity'
  | 'entity-detail'
  | 'new-consultation'
  | 'followup-chat'
  | 'case-detail';

interface ActiveChallenge {
  enrollmentId: string;
  challengeId: string;
  title: string;
  description: string;
  challenge_mode_intro: string;
  challenge_instruction: string;
  return_question_1: string;
  return_question_2: string;
  return_question_3: string | null;
  tier_target: string;
}

interface ChallengeEvalResult {
  tier: string;
  tier_label: string;
  summary: string;
  tier_reasoning: string;
  follow_up_instruction: string;
  next_tier_hint: string;
}

// ─── Background ─────────────────────────────────────────────────────────────

const AdvisorBackground: React.FC<{ image: string; overlayGradient: string }> = ({ image, overlayGradient }) => {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      setMouse({ x: Math.max(0, e.clientX - 256), y: Math.max(0, e.clientY - 64) });
      setMoving(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMoving(false), 120);
    };
    window.addEventListener('mousemove', h);
    return () => { window.removeEventListener('mousemove', h); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
  const img = `url('${image}')`;
  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="advisor-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.007" numOctaves="3" seed="31" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="55" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
        <div className={`absolute inset-0 bg-gradient-to-br ${overlayGradient}`} />
        <div className="absolute inset-0 bg-black/10" />
      </div>
      {moving && (
        <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 pointer-events-none" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1, filter: 'url(#advisor-distortion)', WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`, maskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)` }}>
          <div className={`absolute inset-0 bg-gradient-to-br ${overlayGradient}`} />
        </div>
      )}
    </>
  );
};

// ─── Markdown renderer ──────────────────────────────────────────────────────

const MarkdownText: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1.5">
    {text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-1.5" />;
      const html = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
    })}
  </div>
);

// ─── Info Tooltip ───────────────────────────────────────────────────────────

const InfoTooltip: React.FC<{ text: string; open: boolean; onToggle: () => void; accent: string }> = ({ text, open, onToggle, accent }) => (
  <div className="relative inline-block">
    <button onClick={onToggle} className={`ml-1.5 ${accent} hover:opacity-70 focus:outline-none`} aria-label="More info">
      <Lightbulb size={13}/>
    </button>
    {open && (
      <div className="absolute z-50 left-0 top-6 w-64 bg-gray-900 text-gray-50 text-xs rounded-xl px-3 py-2.5 shadow-xl leading-relaxed">
        {text}
        <button onClick={onToggle} className="absolute top-1.5 right-2 text-gray-300 hover:text-white"><X size={11}/></button>
      </div>
    )}
  </div>
);

// ─── Probe Panel ────────────────────────────────────────────────────────────

interface ProbePanelProps {
  config: DomainConfig;
  field: IntakeField;
  categoryValue: string;
  messages: ChatMessage[];
  loading: boolean;
  done: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

const ProbePanel: React.FC<ProbePanelProps> = ({
  config, field, categoryValue, messages, loading, done, input, onInputChange, onSend, onClose, chatEndRef
}) => {
  const cc = config.categoryConfig[categoryValue];
  const pa = config.probeAccent;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-2 pb-2">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className={classNames('flex items-center justify-between px-4 py-3 border-b rounded-t-2xl', pa.headerBg)}>
          <div>
            <p className={classNames('text-xs font-bold uppercase tracking-wide', pa.labelText)}>Interview Coach</p>
            <p className={classNames('text-sm font-bold', pa.titleText)}>Exploring: {field.label}</p>
          </div>
          <button onClick={onClose} className={classNames('p-2 rounded-xl hover:bg-black/5', pa.labelText)}>
            <X size={18}/>
          </button>
        </div>

        <div className={classNames('px-4 py-2 text-xs flex items-start gap-2', pa.bannerBg, pa.bannerText)}>
          <span className="text-base">💬</span>
          <span>Read each question aloud. Type or speak the answer, then tap Send. The AI will keep asking until this topic is fully characterised.</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${cc.colour} flex items-center justify-center text-xs flex-shrink-0`}>{cc.emoji}</div>
              )}
              <div className={classNames('max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed',
                msg.role === 'user' ? `${pa.userBubbleBg} text-white rounded-tr-sm` : `${pa.assistantBubbleBg} text-gray-900 rounded-tl-sm border ${pa.assistantBubbleBorder}`)}>
                {msg.role === 'assistant' && <p className={classNames('text-xs font-bold mb-1', pa.assistantLabelText)}>AI Interview Coach</p>}
                {msg.role === 'user' && <p className={classNames('text-xs font-bold mb-1', pa.userLabelText)}>Your answer</p>}
                <MarkdownText text={msg.content}/>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-start gap-2">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${cc.colour} flex items-center justify-center text-xs`}>{cc.emoji}</div>
              <div className={classNames('rounded-2xl rounded-tl-sm px-3 py-2.5', pa.assistantBubbleBg)}>
                <div className="flex gap-1 items-center h-4">{[0,150,300].map(d => <div key={d} className={classNames('w-2 h-2 rounded-full animate-bounce', pa.dotColor)} style={{ animationDelay: `${d}ms` }}/>)}</div>
              </div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>

        {done && (
          <div className="mx-4 mb-2 bg-green-50 border border-green-300 rounded-xl px-3 py-2.5 flex items-center gap-2 text-green-800 text-sm font-semibold">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0"/>
            Topic fully explored. Tap "Move On" when ready.
          </div>
        )}

        <div className="border-t px-3 py-3 rounded-b-2xl">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSend(); } }}
              placeholder="Type the answer…"
              disabled={loading}
              className={classNames('flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 disabled:opacity-50', config.focusRingClass)}
            />
            <button onClick={onSend} disabled={!input.trim() || loading}
              className={classNames('px-3 py-2.5 rounded-xl text-white disabled:opacity-40', pa.sendBg, pa.sendHoverBg)}>
              <Send size={15}/>
            </button>
            <button onClick={onClose}
              className={classNames('px-4 py-2.5 rounded-xl text-white text-sm font-bold whitespace-nowrap', pa.moveOnBg, pa.moveOnHoverBg)}>
              Move On ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export const AdvisorCasebookPage: React.FC<{ config: DomainConfig }> = ({ config }) => {
  const { user } = useAuth();
  const location = useLocation();

  const [mode, setMode] = useState<AppMode>('dashboard');
  const [selectedEntity, setSelectedEntity] = useState<AdvisorEntity | null>(null);
  const [selectedConsultation, setSelectedConsultation] = useState<AdvisorConsultation | null>(null);
  const [consultationCategory, setConsultationCategory] = useState<string | null>(null);

  const [entities, setEntities] = useState<AdvisorEntity[]>([]);
  const [consultations, setConsultations] = useState<AdvisorConsultation[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [loadingConsults, setLoadingConsults] = useState(false);

  // ── Add-entity form
  const [newName, setNewName] = useState('');
  const [newVillage, setNewVillage] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newExtra, setNewExtra] = useState<any>(config.extraFieldsInitial);
  const [savingEntity, setSavingEntity] = useState(false);

  // ── Structured intake
  const [intake, setIntake] = useState<Record<string, string>>({});
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [adviceResult, setAdviceResult] = useState<{ urgency: string; text: string } | null>(null);
  const [youthActionsTaken, setYouthActionsTaken] = useState('');
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [savingConsult, setSavingConsult] = useState(false);
  const [consultSaved, setConsultSaved] = useState(false);
  const [savedConsultId, setSavedConsultId] = useState<string | null>(null);

  // ── Probe Panel
  const [probeField, setProbeField] = useState<IntakeField | null>(null);
  const [probeMessages, setProbeMessages] = useState<ChatMessage[]>([]);
  const [probeInput, setProbeInput] = useState('');
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeDone, setProbeDone] = useState(false);
  const probeChatEndRef = useRef<HTMLDivElement>(null);

  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  // ── Follow-up chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [speechOn, setSpeechOn] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');

  // Pidgin only for learners whose profile country is Nigeria.
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('country').eq('id', user.id).single()
      .then(({ data }) => setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english'));
  }, [user?.id]);

  // ── Community AI Challenge state
  const [availableChallenge, setAvailableChallenge] = useState<ActiveChallenge | null>(null);
  const [activeChallenge, setActiveChallenge]           = useState<ActiveChallenge | null>(null);
  const [challengeLoading, setChallengeLoading]         = useState(false);
  const [showChallengeReflect, setShowChallengeReflect] = useState(false);
  const [challengeReflect1, setChallengeReflect1]       = useState('');
  const [challengeReflect2, setChallengeReflect2]       = useState('');
  const [challengeReflect3, setChallengeReflect3]       = useState('');
  const [challengeSubmitting, setChallengeSubmitting]   = useState(false);
  const [challengeResult, setChallengeResult]           = useState<ChallengeEvalResult | null>(null);
  const [enrolling, setEnrolling]                       = useState(false);
  const [showOfflineModal, setShowOfflineModal]         = useState(false);
  const [showResolutionModal, setShowResolutionModal]   = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isSending]);
  useEffect(() => { probeChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [probeMessages, probeLoading]);

  // ─── Voice setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const speakBrowser = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 400));
    const voice = voiceMode === 'pidgin'
      ? (voices.find(v => v.lang === 'en-NG') || voices.find(v => v.lang === 'en-ZA') || voices.find(v => v.lang.startsWith('en')))
      : (voices.find(v => v.name === 'Google UK English Female') || voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en')));
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    utt.rate = 0.87; utt.pitch = 1.0;
    window.speechSynthesis.speak(utt);
  }, [voices, voiceMode]);

  const speak = useCallback((text: string) => {
    if (!speechOn) return;
    void playPidginVoice(text.slice(0, 400), 'english', {
      onError: (err) => {
        console.warn(`[${config.pageName}] SpeechGen TTS failed, falling back to browser voice:`, err);
        speakBrowser(text);
      },
    });
  }, [speechOn, voiceMode, speakBrowser, config.pageName]);

  // ── Load active challenge for this page ─────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const navEnrollment = (location.state as any)?.challengeEnrollment;
    if (navEnrollment?.enrollmentId) {
      setActiveChallenge(navEnrollment);
      return;
    }

    (async () => {
      setChallengeLoading(true);
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        const orgSlug = resolveChallengeOrgSlug(profile?.organization_id);
        if (!orgSlug) return;

        const { data: challenges } = await supabase
          .from('community_challenges')
          .select('id, title, description, challenge_mode_intro, challenge_instruction, return_question_1, return_question_2, return_question_3, tier_target, org_id')
          .eq('community_impact_slug', config.communityImpactSlug)
          .eq('active', true)
          .eq('org_id', orgSlug)
          .order('week_start', { ascending: false })
          .limit(1);
        const challenge = challenges?.[0] ?? null;
        if (!challenge) return;

        const { data: enrollment } = await supabase
          .from('challenge_enrollments')
          .select('id, status')
          .eq('learner_id', user.id)
          .eq('challenge_id', challenge.id)
          .in('status', ['active', 'submitted'])
          .maybeSingle();

        const mapped: ActiveChallenge = {
          enrollmentId:          enrollment?.id ?? '',
          challengeId:           challenge.id,
          title:                 challenge.title,
          description:           challenge.description,
          challenge_mode_intro:  challenge.challenge_mode_intro,
          challenge_instruction: challenge.challenge_instruction,
          return_question_1:     challenge.return_question_1,
          return_question_2:     challenge.return_question_2,
          return_question_3:     challenge.return_question_3,
          tier_target:           challenge.tier_target,
        };

        if (enrollment) setActiveChallenge(mapped);
        else setAvailableChallenge(mapped);
      } finally {
        setChallengeLoading(false);
      }
    })();
  }, [user?.id, config.communityImpactSlug]);

  const handleEnrollChallenge = async (ch: ActiveChallenge) => {
    if (!user?.id || enrolling) return;
    setEnrolling(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      const { data: enrollment } = await supabase
        .from('challenge_enrollments')
        .insert({
          learner_id:   user.id,
          challenge_id: ch.challengeId,
          org_id:       resolveChallengeOrgSlug(profile?.organization_id) ?? 'oloibiri',
          status:       'active',
        })
        .select('id')
        .single();

      if (enrollment) {
        setActiveChallenge({ ...ch, enrollmentId: enrollment.id });
        setAvailableChallenge(null);
      }
    } finally { setEnrolling(false); }
  };

  const handleSubmitChallengeReflection = async () => {
    if (!activeChallenge || !challengeReflect1.trim() || !challengeReflect2.trim()) return;
    setChallengeSubmitting(true);
    try {
      await supabase
        .from('challenge_enrollments')
        .update({
          status:                'submitted',
          submitted_at:          new Date().toISOString(),
          action_taken:          challengeReflect1.trim(),
          impact_observed:       challengeReflect2.trim(),
          extra_detail:          challengeReflect3.trim() || null,
          community_member_role: config.communityMemberRole,
        })
        .eq('id', activeChallenge.enrollmentId);

      const { data, error } = await supabase.functions.invoke('evaluate-challenge-submission', {
        body: { enrollment_id: activeChallenge.enrollmentId },
      });

      if (error) throw error;
      if (data?.impact_evaluation) setChallengeResult(data.impact_evaluation);
    } catch (err) {
      console.error(`[${config.pageName}] challenge submit error:`, err);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  // ─── Load entities ────────────────────────────────────────────────────────
  const loadEntities = useCallback(async () => {
    if (!user) return;
    setLoadingEntities(true);
    try {
      const { data, error } = await supabase
        .from(config.entitySummaryView)
        .select('*')
        .eq('youth_user_id', user.id);
      if (!error && data) {
        const mapped = (data as any[]).map(config.mapEntityFromRow).sort((a, b) => a.name.localeCompare(b.name));
        setEntities(mapped);
      }
    } finally { setLoadingEntities(false); }
  }, [user, config]);

  useEffect(() => { loadEntities(); }, [loadEntities]);

  const loadConsultations = useCallback(async (entityId: string) => {
    setLoadingConsults(true);
    try {
      const { data, error } = await supabase
        .from(config.consultationTable)
        .select('*')
        .eq(config.entityIdField, entityId)
        .order('created_at', { ascending: false });
      if (!error && data) setConsultations((data as any[]).map(config.mapConsultationFromRow));
    } finally { setLoadingConsults(false); }
  }, [config]);

  // ─── Open Probe Panel ─────────────────────────────────────────────────────
  const openProbe = useCallback(async (field: IntakeField) => {
    if (!selectedEntity || !consultationCategory) return;
    setProbeField(field);
    setProbeMessages([]);
    setProbeInput('');
    setProbeDone(false);
    setProbeLoading(true);
    try {
      const systemPrompt = config.buildProbePrompt(field, consultationCategory, selectedEntity, intake);
      const reply = await chatText({
        page: config.pageName,
        messages: [{ role: 'user', content: `Start probing: ${field.label}` }],
        system: systemPrompt,
        max_tokens: 600,
      });
      const isDone = reply.includes('✅ This topic is well characterised');
      setProbeDone(isDone);
      setProbeMessages([{ id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setProbeLoading(false); }
  }, [selectedEntity, consultationCategory, intake, config]);

  const sendProbeMessage = useCallback(async () => {
    if (!probeInput.trim() || probeLoading || !selectedEntity || !probeField || !consultationCategory) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: probeInput.trim(), timestamp: new Date() };
    const updated = [...probeMessages, userMsg];
    setProbeMessages(updated);
    setProbeInput('');
    setProbeLoading(true);
    try {
      const systemPrompt = config.buildProbePrompt(probeField, consultationCategory, selectedEntity, intake);
      const reply = await chatText({
        page: config.pageName,
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 600,
      });
      const isDone = reply.includes('✅ This topic is well characterised');
      setProbeDone(isDone);
      setProbeMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setProbeLoading(false); }
  }, [probeInput, probeLoading, probeMessages, selectedEntity, probeField, consultationCategory, intake, config]);

  const closeProbe = useCallback(() => {
    if (probeField && probeMessages.length > 0) {
      const summary = probeMessages
        .slice(-8)
        .map(m => `${m.role === 'assistant' ? 'AI' : 'Advisor'}: ${m.content.slice(0, 400)}`)
        .join('\n');
      setIntake(prev => ({
        ...prev,
        [probeField.key]: prev[probeField.key]
          ? `${prev[probeField.key]}\n\n[Probe notes]\n${summary}`
          : `[Probe notes]\n${summary}`,
      }));
    }
    setProbeField(null);
    setProbeMessages([]);
    setProbeDone(false);
  }, [probeField, probeMessages]);

  // ─── Generate AI advice ───────────────────────────────────────────────────
  const runAdvice = async () => {
    if (!selectedEntity || !consultationCategory || isGeneratingAdvice) return;
    setIsGeneratingAdvice(true);
    try {
      const systemPrompt = config.buildAdvicePrompt(consultationCategory, selectedEntity, intake);
      const reply = await chatText({
        page: config.pageName,
        messages: [{ role: 'user', content: 'Please analyse this intake and provide your advisory recommendation.' }],
        system: systemPrompt,
        max_tokens: 1500,
      });
      const urgency = config.detectUrgency(reply);
      setAdviceResult({ urgency, text: reply });
      speak(reply.slice(0, 300));
    } catch {
      setAdviceResult({ urgency: 'medium', text: 'Unable to generate advice. Check intake data and try again.' });
    } finally { setIsGeneratingAdvice(false); }
  };

  // ─── Save consultation ────────────────────────────────────────────────────
  const saveConsultation = async () => {
    if (!user || !selectedEntity || !consultationCategory || !adviceResult) return;
    setSavingConsult(true);
    try {
      const fields = config.intakeFields[consultationCategory];
      const summary = fields
        .filter(f => intake[f.key]?.trim())
        .map(f => `${f.label}: ${intake[f.key].trim()}`)
        .join(' | ');

      const payload = config.mapConsultationToInsertPayload({
        youthUserId: user.id,
        entity: selectedEntity,
        categoryValue: consultationCategory,
        summary: summary || 'Structured intake consultation',
        aiResponse: adviceResult.text,
        urgency: adviceResult.urgency,
        youthActionsTaken: youthActionsTaken || null,
        followUpNeeded,
        followUpDate: followUpDate || null,
        followUpNotes: followUpNotes || null,
      });

      const { data, error } = await supabase
        .from(config.consultationTable)
        .insert(payload)
        .select('id')
        .single();

      if (!error && data) {
        setConsultSaved(true);
        setSavedConsultId(data.id);
        await loadEntities();
        await loadConsultations(selectedEntity.id);
      } else if (error) {
        console.error(`[${config.pageName}] saveConsultation error:`, error);
      }
    } finally { setSavingConsult(false); }
  };

  // ─── Follow-up chat send ──────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isSending || !selectedEntity || !selectedConsultation) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: inputText.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);
    try {
      const history = [...messages, userMsg];
      const systemPrompt = config.buildFollowupPrompt(selectedEntity, selectedConsultation);
      const reply = await chatText({
        page: config.pageName,
        messages: history.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 1200,
      });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const updated = [...history, aiMsg];
      setMessages(updated);
      speak(reply);
      await supabase.from(config.consultationTable).update({ conversation_history: updated }).eq('id', selectedConsultation.id);
    } catch {
      setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', content: 'Technical issue — please try again.', timestamp: new Date() }]);
    } finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [inputText, isSending, messages, selectedEntity, selectedConsultation, speak, config]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const toggleListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR(); recognitionRef.current = rec;
    rec.lang = 'en-NG'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => setInputText(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
    rec.onend = () => setIsListening(false); rec.onerror = () => setIsListening(false);
    rec.start(); setIsListening(true);
  };

  // ─── Start consultation ───────────────────────────────────────────────────
  const startConsultation = (entity: AdvisorEntity, categoryValue: string) => {
    setSelectedEntity(entity);
    setConsultationCategory(categoryValue);
    setIntake({});
    setAdviceResult(null);
    setYouthActionsTaken('');
    setFollowUpNeeded(false);
    setFollowUpDate('');
    setFollowUpNotes('');
    setConsultSaved(false);
    setSavedConsultId(null);
    setMode('new-consultation');
  };

  // ─── Open follow-up chat ──────────────────────────────────────────────────
  const openFollowupChat = (entity: AdvisorEntity, consultation: AdvisorConsultation) => {
    setSelectedEntity(entity);
    setSelectedConsultation(consultation);
    setMessages(consultation.conversation_history || []);
    setInputText('');
    setMode('followup-chat');
    if ((consultation.conversation_history || []).length === 0) {
      const cc = config.categoryConfig[consultation.categoryValue];
      const uc = consultation.urgency_level ? config.urgencyConfig[consultation.urgency_level] : null;
      const opener: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `Ready to help with follow-up questions for **${entity.name}** (${cc.emoji} ${cc.label}${uc ? ` · **${uc.label}** urgency` : ''}).\n\nYou can ask about the advice, how to explain it, what to observe on follow-up, or any practical question for this case.`,
        timestamp: new Date(),
      };
      setMessages([opener]);
    }
  };

  // ─── Save entity ──────────────────────────────────────────────────────────
  const saveEntity = async () => {
    if (!user || !newName.trim() || !newVillage) return;
    setSavingEntity(true);
    try {
      const payload = config.mapEntityToInsertPayload(
        { name: newName.trim(), village: newVillage, phone: newPhone, notes: newNotes, extra: newExtra },
        user.id
      );
      const { error } = await supabase.from(config.entityTable).insert(payload);
      if (!error) { await loadEntities(); resetAddEntity(); setMode('dashboard'); }
    } finally { setSavingEntity(false); }
  };

  const resetAddEntity = () => {
    setNewName(''); setNewVillage(''); setNewPhone(''); setNewNotes('');
    setNewExtra(config.extraFieldsInitial);
  };

  const handleResolutionSubmit = async (consultId: string, data: ResolutionSubmitData) => {
    await supabase.from(config.consultationTable).update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_outcome: data.outcome,
      resolution_narrative: data.narrative,
      resolution_value_amount: data.valueAmount,
      resolution_value_unit: data.valueUnit,
      resolution_value_label: data.valueLabel,
    }).eq('id', consultId);
    setSelectedConsultation(prev => prev ? { ...prev, resolved: true } : prev);
    if (selectedEntity) loadConsultations(selectedEntity.id);
    await loadEntities();
    setShowResolutionModal(false);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  const intakeComplete = consultationCategory
    ? config.intakeFields[consultationCategory].filter(f => f.required).every(f => intake[f.key]?.trim())
    : false;

  const hasDangerSignal = consultationCategory
    ? config.intakeFields[consultationCategory].filter(f => f.danger).some(f => intake[f.key]?.trim().length > 0)
    : false;

  const UrgencyBadge: React.FC<{ level: string }> = ({ level }) => {
    const cfg = config.urgencyConfig[level];
    if (!cfg) return null;
    return (
      <span className={classNames('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border', cfg.colour, cfg.bg, cfg.border)}>
        {cfg.icon} {cfg.label}
      </span>
    );
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: DASHBOARD
  // ════════════════════════════════════════════════════════════════════════

  if (mode === 'dashboard') {
    return (
      <AppLayout>
        <AdvisorBackground image={config.backgroundImage} overlayGradient={config.bgOverlayGradient} />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.headerIconGradient} flex items-center justify-center text-2xl`}>{config.headerEmoji}</div>
                <div>
                  <h1 className="text-xl font-bold text-white">{config.dashboardTitle}</h1>
                  <p className="text-sm text-white/80">{config.dashboardSubtitle}</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText={config.dashboardSubtitle}
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {config.guideUrl && (
                  <Link
                    to={config.guideUrl}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold text-sm transition-colors border border-white/30"
                    title="Read the written guide"
                  >
                    <BookOpen size={16} /> Guide
                  </Link>
                )}
                <button
                  onClick={() => setShowOfflineModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold text-sm transition-colors border border-white/30"
                  title="Use offline version"
                >
                  📴 Offline
                </button>
                <button onClick={() => { resetAddEntity(); setMode('add-entity'); }}
                  className={`flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r ${config.addButtonGradient} text-white rounded-xl font-semibold text-sm hover:opacity-90`}>
                  <Plus size={16}/> Add {config.entityNounSingular}
                </button>
              </div>
            </div>
          </div>

          {entities.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: `${config.entityNounSingular}s`, value: entities.length, icon: config.entityCardEmoji },
                { label: 'Open Cases', value: entities.reduce((s, e) => s + (e.open_cases ?? 0), 0), icon: '📋' },
                { label: config.thirdStatCard.label, value: config.thirdStatCard.compute(entities), icon: config.thirdStatCard.icon },
              ].map(stat => (
                <div key={stat.label} className="bg-white/90 backdrop-blur-sm rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Challenge Banner — available (not enrolled) ── */}
          {!challengeLoading && availableChallenge && !activeChallenge && (
            <div className={classNames('backdrop-blur-sm border rounded-2xl p-5 mb-4 shadow-lg', config.challengeAccent.available.bg, config.challengeAccent.available.border)}>
              <div className="flex items-start gap-3">
                <div className={classNames('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', config.challengeAccent.available.iconBg)}>
                  <Award size={20} className={config.challengeAccent.available.iconText} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={classNames('text-xs font-bold uppercase tracking-wide', config.challengeAccent.available.labelText)}>Community AI Challenge — This Week</span>
                    <span className={classNames('text-xs px-2 py-0.5 rounded-full', config.challengeAccent.available.pillBg, config.challengeAccent.available.pillText)}>{availableChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{availableChallenge.title}</p>
                  <p className={classNames('text-sm leading-relaxed mb-3', config.challengeAccent.available.bodyText)}>{availableChallenge.description}</p>
                  <button
                    onClick={() => handleEnrollChallenge(availableChallenge)}
                    disabled={enrolling}
                    className={classNames('w-full py-2.5 rounded-xl disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2', config.challengeAccent.available.buttonBg, config.challengeAccent.available.buttonHoverBg)}
                  >
                    {enrolling
                      ? <><Loader2 size={14} className="animate-spin" /> Checking out…</>
                      : <><ChevronRight size={16} /> Check out this challenge</>
                    }
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Challenge Banner — enrolled ── */}
          {activeChallenge && (
            <div className={classNames('backdrop-blur-sm border rounded-2xl p-5 mb-4 shadow-lg', config.challengeAccent.active.bg, config.challengeAccent.active.border)}>
              <div className="flex items-start gap-3">
                <div className={classNames('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', config.challengeAccent.active.iconBg)}>
                  <Award size={20} className={config.challengeAccent.active.iconText} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={classNames('text-xs font-bold uppercase tracking-wide', config.challengeAccent.active.labelText)}>Community AI Challenge — Active</span>
                    <span className={classNames('text-xs px-2 py-0.5 rounded-full', config.challengeAccent.active.pillBg, config.challengeAccent.active.pillText)}>{activeChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{activeChallenge.title}</p>
                  <p className={classNames('text-sm leading-relaxed mb-2', config.challengeAccent.active.bodyText)}>{activeChallenge.challenge_mode_intro}</p>
                  <div className={classNames('rounded-xl p-3 mb-3', config.challengeAccent.active.missionBg)}>
                    <p className={classNames('text-xs font-bold mb-1', config.challengeAccent.active.missionLabelText)}>Your mission:</p>
                    <p className={classNames('text-sm', config.challengeAccent.active.missionText)}>{activeChallenge.challenge_instruction}</p>
                  </div>
                  <button
                    onClick={() => setShowChallengeReflect(true)}
                    className={classNames('w-full py-2.5 rounded-xl text-white font-bold text-sm transition-colors flex items-center justify-center gap-2', config.challengeAccent.active.buttonBg, config.challengeAccent.active.buttonHoverBg)}
                  >
                    <CheckCircle size={16} /> I've done it — submit my reflection
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Challenge Reflection Modal ── */}
          {showChallengeReflect && activeChallenge && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                {challengeResult ? (
                  <div className="p-6">
                    <div className="text-center mb-6">
                      <div className={classNames('w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3', config.challengeAccent.active.missionBg)}>
                        <Award size={32} className={config.challengeAccent.active.iconText} />
                      </div>
                      <h2 className="text-2xl font-black text-gray-900">{challengeResult.tier_label}</h2>
                      <p className={classNames('text-sm font-bold uppercase tracking-wide mt-1', config.challengeAccent.active.labelText)}>{challengeResult.tier} tier earned</p>
                    </div>
                    <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-teal-800 mb-1">What you achieved</p>
                      <p className="text-sm text-teal-700 leading-relaxed">{challengeResult.summary}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-blue-800 mb-1">Why you earned this tier</p>
                      <p className="text-sm text-blue-700 leading-relaxed">{challengeResult.tier_reasoning}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-amber-800 mb-1">What to do next</p>
                      <p className="text-sm text-amber-700 leading-relaxed">{challengeResult.follow_up_instruction}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 mb-5">
                      <p className="text-xs text-gray-500">{challengeResult.next_tier_hint}</p>
                    </div>
                    <button
                      onClick={() => { setShowChallengeReflect(false); setChallengeResult(null); setActiveChallenge(null); }}
                      className="w-full py-3 rounded-xl bg-gray-800 text-white font-bold hover:bg-gray-900 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className={classNames('text-xs font-bold uppercase tracking-wide mb-0.5', config.challengeAccent.active.labelText)}>Challenge Reflection</p>
                        <h2 className="text-xl font-black text-gray-900">{activeChallenge.title}</h2>
                      </div>
                      <button onClick={() => setShowChallengeReflect(false)} className="text-gray-400 hover:text-gray-600 p-1">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_1}</label>
                        <textarea value={challengeReflect1} onChange={e => setChallengeReflect1(e.target.value)} rows={3}
                          placeholder="Describe what you did…"
                          className={classNames('w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 resize-none leading-relaxed', config.focusRingClass)}/>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_2}</label>
                        <textarea value={challengeReflect2} onChange={e => setChallengeReflect2(e.target.value)} rows={3}
                          placeholder="What happened…"
                          className={classNames('w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 resize-none leading-relaxed', config.focusRingClass)}/>
                      </div>
                      {activeChallenge.return_question_3 && (
                        <div>
                          <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_3}</label>
                          <textarea value={challengeReflect3} onChange={e => setChallengeReflect3(e.target.value)} rows={2}
                            placeholder="Additional details…"
                            className={classNames('w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 resize-none leading-relaxed', config.focusRingClass)}/>
                        </div>
                      )}
                      <EvidencePicker sourceType="challenge_enrollment" sourceId={activeChallenge.enrollmentId} accent={config.challengeAccent.resultAccent} />
                    </div>
                    <button
                      onClick={handleSubmitChallengeReflection}
                      disabled={!challengeReflect1.trim() || !challengeReflect2.trim() || challengeSubmitting}
                      className={classNames('w-full mt-6 py-3.5 rounded-xl font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2', config.challengeAccent.active.buttonBg, config.challengeAccent.active.buttonHoverBg)}
                    >
                      {challengeSubmitting
                        ? <><Loader2 size={16} className="animate-spin" /> Evaluating your impact…</>
                        : <><CheckCircle size={16} /> Submit reflection</>
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Offline Mode Modal ── */}
          {showOfflineModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50 rounded-t-2xl">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Offline Mode</p>
                    <h2 className="text-lg font-bold text-gray-900">{config.offlineModalTitle}</h2>
                  </div>
                  <button onClick={() => setShowOfflineModal(false)} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <X size={18}/>
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className={classNames('border rounded-xl p-4', config.accentBgClass, 'border-gray-200')}>
                    <p className="text-sm font-bold text-gray-800 mb-2">📴 Use the offline advisor now</p>
                    <p className="text-sm text-gray-700 mb-3 leading-relaxed">{config.offlineToolDescription}</p>
                    <a
                      href={config.offlineToolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r ${config.addButtonGradient} text-white font-bold text-sm hover:opacity-90 transition-opacity`}
                    >
                      <span>📴</span> Open Offline Advisor
                    </a>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-2">💡 Tips for field use</p>
                    <ul className="space-y-1.5 text-xs text-amber-700">
                      {config.offlineTips.map((tip, i) => <li key={i}>• {tip}</li>)}
                    </ul>
                  </div>

                  <button
                    onClick={() => setShowOfflineModal(false)}
                    className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingEntities ? (
            <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-white/70"/></div>
          ) : entities.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-10 text-center">
              <div className="text-5xl mb-4">{config.headerEmoji}</div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">No {config.entityNounSingular.toLowerCase()}s registered yet</h2>
              <p className="text-sm text-gray-500 mb-5">Add your first {config.entityNounSingular.toLowerCase()} to start your casebook.</p>
              <button onClick={() => { resetAddEntity(); setMode('add-entity'); }}
                className={`inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r ${config.addButtonGradient} text-white rounded-xl font-semibold hover:opacity-90`}>
                <Plus size={16}/> Register First {config.entityNounSingular}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {entities.map(entity => (
                <button key={entity.id}
                  onClick={() => { setSelectedEntity(entity); loadConsultations(entity.id); setMode('entity-detail'); }}
                  className="w-full bg-white/90 backdrop-blur-sm rounded-2xl p-4 text-left hover:bg-white transition-colors border border-transparent hover:border-gray-300">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg">{config.entityCardEmoji}</div>
                      <div>
                        <p className="font-bold text-gray-900">{entity.name}</p>
                        <p className="text-sm text-gray-500">{entity.village}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {config.renderCategorySummary(entity.extra)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <ChevronRight size={17} className="text-gray-400"/>
                      {(entity.open_cases ?? 0) > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">{entity.open_cases} open</span>
                      )}
                      {(entity.dangerCount ?? 0) > 0 && (
                        <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-bold">⚠️ Urgent</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>{entity.total_consultations ?? 0} consultation{entity.total_consultations !== 1 ? 's' : ''}</span>
                    {entity.last_consultation_at && <span>Last: {formatDate(entity.last_consultation_at)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: ADD ENTITY
  // ════════════════════════════════════════════════════════════════════════

  if (mode === 'add-entity') {
    return (
      <AppLayout>
        <AdvisorBackground image={config.backgroundImage} overlayGradient={config.bgOverlayGradient} />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div><h2 className="text-xl font-bold text-gray-900">Register {config.entityNounSingular}</h2><p className="text-sm text-gray-500">Add to your casebook</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{config.entityNounSingular} Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={config.registerNamePlaceholder}
                  className={classNames('w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 text-base', config.focusRingClass)}/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Village *</label>
                <select value={newVillage} onChange={e => setNewVillage(e.target.value)}
                  className={classNames('w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 text-base bg-white', config.focusRingClass)}>
                  <option value="">Select village…</option>
                  {config.villages.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone (optional)</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+234 801 234 5678"
                  className={classNames('w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 text-base', config.focusRingClass)}/>
              </div>

              {config.renderExtraFields(newExtra, setNewExtra)}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
                  placeholder="Past problems, special concerns…"
                  className={classNames('w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 text-sm resize-none', config.focusRingClass)}/>
              </div>
              <button onClick={saveEntity} disabled={!newName.trim() || !newVillage || savingEntity}
                className={classNames('w-full py-3.5 rounded-xl font-bold text-white text-base transition-opacity',
                  newName.trim() && newVillage && !savingEntity ? `bg-gradient-to-r ${config.addButtonGradient} hover:opacity-90` : 'bg-gray-300 cursor-not-allowed')}>
                {savingEntity ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>Saving…</span> : `Register ${config.entityNounSingular}`}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: ENTITY DETAIL
  // ════════════════════════════════════════════════════════════════════════

  if (mode === 'entity-detail' && selectedEntity) {
    const entity = selectedEntity;
    const consultOptions = config.getConsultationOptions(entity);
    return (
      <AppLayout>
        <AdvisorBackground image={config.backgroundImage} overlayGradient={config.bgOverlayGradient} />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">{config.entityCardEmoji}</div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{entity.name}</h2>
                <p className="text-sm text-gray-500">{entity.village}{entity.phone ? ` · ${entity.phone}` : ''}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {config.renderCategorySummary(entity.extra)}
            </div>

            {entity.notes && <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg px-3 py-2 mb-4">{entity.notes}</p>}

            <p className="text-sm font-semibold text-gray-700 mb-2">Start new consultation for:</p>
            <div className="grid grid-cols-1 gap-2">
              {consultOptions.map(value => {
                const cc = config.categoryConfig[value];
                if (!cc) return null;
                return (
                  <button key={value} onClick={() => startConsultation(entity, value)}
                    className={classNames('flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-white text-sm bg-gradient-to-r hover:opacity-90 transition-opacity text-left', cc.colour)}>
                    <span className="text-xl flex-shrink-0">{cc.emoji}</span>
                    <div>
                      <div>{cc.label}</div>
                      {cc.description && <div className="text-xs font-normal opacity-80">{cc.description}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Case history */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList size={16} className={config.accentTextClass}/> Case History
              </h3>
              <button onClick={() => loadConsultations(entity.id)} className="text-gray-400 hover:text-gray-700"><RefreshCw size={14}/></button>
            </div>
            {loadingConsults ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className={classNames('animate-spin', config.accentTextClass)}/></div>
            ) : consultations.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">No consultations yet.</p>
            ) : (
              <div className="space-y-3">
                {consultations.map(c => {
                  const cc = config.categoryConfig[c.categoryValue];
                  return (
                    <div key={c.id} className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{cc?.emoji}</span>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{cc?.label}</p>
                            <p className="text-xs text-gray-500">{formatDate(c.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {c.urgency_level && <UrgencyBadge level={c.urgency_level}/>}
                          {c.resolved
                            ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Resolved</span>
                            : <span className="text-xs text-orange-600 font-semibold">Open</span>}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{c.summary}</p>
                      {c.follow_up_needed && !c.resolved && c.follow_up_date && (
                        <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                          <Calendar size={11}/> Follow-up: {formatDate(c.follow_up_date)}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setSelectedConsultation(c); setMode('case-detail'); }}
                          className="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:border-gray-300">
                          View Case
                        </button>
                        <button onClick={() => openFollowupChat(entity, c)}
                          className={classNames('flex-1 py-2 text-xs font-semibold rounded-lg', config.accentBgClass, config.accentTextClass)}>
                          Ask AI Follow-up
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: NEW CONSULTATION
  // ════════════════════════════════════════════════════════════════════════

  if (mode === 'new-consultation' && selectedEntity && consultationCategory) {
    const cc = config.categoryConfig[consultationCategory];
    const fields = config.intakeFields[consultationCategory];

    return (
      <AppLayout>
        <AdvisorBackground image={config.backgroundImage} overlayGradient={config.bgOverlayGradient} />

        {probeField && (
          <ProbePanel
            config={config}
            field={probeField}
            categoryValue={consultationCategory}
            messages={probeMessages}
            loading={probeLoading}
            done={probeDone}
            input={probeInput}
            onInputChange={setProbeInput}
            onSend={sendProbeMessage}
            onClose={closeProbe}
            chatEndRef={probeChatEndRef}
          />
        )}

        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">

          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setMode('entity-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cc.colour} flex items-center justify-center text-xl`}>{cc.emoji}</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{cc.label} Consultation</h2>
                <p className="text-xs text-gray-500">{selectedEntity.name} · {selectedEntity.village}</p>
              </div>
            </div>
          </div>

          {hasDangerSignal && (
            <div className="bg-red-600 text-white rounded-xl p-4 flex items-start gap-3 animate-pulse">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold">⚠️ POTENTIAL EMERGENCY INDICATOR</p>
                <p className="text-sm opacity-90">You have noted a high-risk factor. Complete the intake and run AI advice — if urgent signs are confirmed, act immediately.</p>
              </div>
            </div>
          )}

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <Lightbulb size={14} className={classNames('flex-shrink-0 mt-0.5', config.accentTextClass)}/>
            <p className="text-xs text-gray-700">
              Fill in each field with what you learn. Tap <strong>🔍 Probe</strong> to get AI-coached interview questions for that topic — the AI will ask one question at a time until it fully understands. Then run AI Advice.
            </p>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
              <ClipboardList size={15} className={config.accentTextClass}/> Intake — {cc.label}
            </h3>
            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
              <span className={classNames('font-bold', config.accentTextClass)}>🔍 Probe</span> — tap after a field to explore it deeper with AI interview coaching
            </p>
            <div className="space-y-4">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                    {field.required && <span className="text-red-500 mr-1">*</span>}
                    {field.danger && <span className="text-red-500 mr-1">⚠️</span>}
                    {field.label}
                    <InfoTooltip
                      text={field.tooltip}
                      open={openTooltip === field.key}
                      onToggle={() => setOpenTooltip(openTooltip === field.key ? null : field.key)}
                      accent={config.accentTextClass}
                    />
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      value={intake[field.key] || ''}
                      onChange={e => setIntake(prev => ({ ...prev, [field.key]: e.target.value }))}
                      rows={2}
                      placeholder={field.placeholder}
                      className={classNames(
                        'flex-1 px-3 py-2.5 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2',
                        field.danger && intake[field.key]?.trim()
                          ? 'border-red-300 focus:ring-red-400 bg-red-50'
                          : `border-gray-300 ${config.focusRingClass}`
                      )}
                    />
                    <button
                      onClick={() => openProbe(field)}
                      className={classNames(
                        'px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex-shrink-0 self-start mt-0.5',
                        probeField?.key === field.key
                          ? `text-white ${config.probeAccent.sendBg} border-transparent`
                          : `${config.accentBgClass} ${config.accentTextClass} border-gray-300 hover:opacity-80`
                      )}
                    >
                      {probeField?.key === field.key ? '🔍 Probing…' : '🔍 Probe'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!adviceResult ? (
            <button
              onClick={runAdvice}
              disabled={isGeneratingAdvice || !intakeComplete}
              className={classNames(
                'w-full py-4 rounded-xl font-bold text-white text-base transition-opacity flex items-center justify-center gap-2',
                !isGeneratingAdvice && intakeComplete
                  ? `bg-gradient-to-r ${cc.colour} hover:opacity-90`
                  : 'bg-gray-300 cursor-not-allowed'
              )}
            >
              {isGeneratingAdvice
                ? <><Loader2 size={18} className="animate-spin"/>Generating AI Advice…</>
                : <><ClipboardList size={18}/>Generate AI Advice{!intakeComplete && ' (fill required fields first)'}</>}
            </button>
          ) : (
            <div className={classNames('bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5 border-2', config.urgencyConfig[adviceResult.urgency]?.border)}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Advisory Result</p>
                  <UrgencyBadge level={adviceResult.urgency}/>
                  <p className="text-xs text-gray-500 mt-1">{config.urgencyConfig[adviceResult.urgency]?.description}</p>
                </div>
                <button onClick={() => { setAdviceResult(null); runAdvice(); }}
                  className={classNames('text-xs hover:underline flex items-center gap-1', config.accentTextClass)}>
                  <RefreshCw size={12}/> Re-run
                </button>
              </div>

              {config.criticalUrgencyValue && adviceResult.urgency === config.criticalUrgencyValue && (
                <div className="bg-red-600 text-white rounded-xl p-3 mb-4 flex items-start gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>
                  <p className="text-sm font-bold">{config.criticalBannerText}</p>
                </div>
              )}

              <div className="text-sm text-gray-800 bg-gray-50 rounded-xl px-4 py-3 max-h-72 overflow-y-auto">
                <MarkdownText text={adviceResult.text}/>
              </div>

              <div className="mt-4 space-y-3 border-t pt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">What did you advise / do?</label>
                  <textarea value={youthActionsTaken} onChange={e => setYouthActionsTaken(e.target.value)} rows={2}
                    placeholder="e.g. Advised on next steps and referred to the appropriate contact."
                    className={classNames('w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2', config.focusRingClass)}/>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="followup" checked={followUpNeeded} onChange={e => setFollowUpNeeded(e.target.checked)} className="w-4 h-4"/>
                  <label htmlFor="followup" className="text-sm font-semibold text-gray-700">Follow-up visit needed</label>
                </div>
                {followUpNeeded && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Follow-up date</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                        className={classNames('w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2', config.focusRingClass)}/>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">What to check</label>
                      <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Check status and progress"
                        className={classNames('w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2', config.focusRingClass)}/>
                    </div>
                  </div>
                )}

                {consultSaved ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 font-semibold text-sm bg-green-50 rounded-xl px-4 py-3">
                      <CheckCircle size={16}/> Case saved to {selectedEntity.name}'s record.
                    </div>
                    {activeChallenge && (
                      <div className="bg-blue-50 border border-blue-300 rounded-xl px-4 py-3 flex items-start gap-2">
                        <Award size={16} className="text-blue-600 flex-shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-blue-800 mb-1">Community AI Challenge active</p>
                          <p className="text-xs text-blue-700 mb-2">You completed a consultation — did you also complete your challenge mission? Submit your reflection to earn your tier.</p>
                          <button
                            onClick={() => setShowChallengeReflect(true)}
                            className="text-xs font-bold text-blue-700 underline hover:text-blue-900"
                          >
                            Submit challenge reflection →
                          </button>
                        </div>
                      </div>
                    )}
                    {savedConsultId && (
                      <button
                        onClick={() => {
                          const saved = consultations.find(c => c.id === savedConsultId) ?? {
                            id: savedConsultId,
                            entity_id: selectedEntity.id,
                            youth_user_id: user?.id ?? '',
                            categoryValue: consultationCategory,
                            summary: '',
                            aiResponse: adviceResult.text,
                            urgency_level: adviceResult.urgency,
                            youth_actions_taken: youthActionsTaken || null,
                            conversation_history: [],
                            follow_up_needed: followUpNeeded,
                            follow_up_date: followUpDate || null,
                            follow_up_notes: followUpNotes || null,
                            resolved: false,
                            resolved_at: null,
                            resolution_outcome: null,
                            resolution_narrative: null,
                            resolution_value_amount: null,
                            resolution_value_unit: null,
                            resolution_value_label: null,
                            created_at: new Date().toISOString(),
                          } as AdvisorConsultation;
                          openFollowupChat(selectedEntity, saved);
                        }}
                        className={`w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r ${config.addButtonGradient} hover:opacity-90 flex items-center justify-center gap-2`}
                      >
                        <Send size={16}/> Continue with AI Follow-up Chat
                      </button>
                    )}
                  </div>
                ) : (
                  <button onClick={saveConsultation} disabled={savingConsult}
                    className={`w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r ${config.addButtonGradient} hover:opacity-90 disabled:opacity-50`}>
                    {savingConsult ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin"/>Saving…</span> : 'Save Case Record'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck size={14} className={classNames('flex-shrink-0 mt-0.5', config.accentTextClass)}/>
            <p className="text-xs text-gray-600">{config.disclaimer}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: FOLLOW-UP CHAT
  // ════════════════════════════════════════════════════════════════════════

  if (mode === 'followup-chat' && selectedEntity && selectedConsultation) {
    const entity = selectedEntity;
    const consult = selectedConsultation;
    const cc = config.categoryConfig[consult.categoryValue];
    const userTurns = messages.filter(m => m.role === 'user').length;

    return (
      <AppLayout>
        <AdvisorBackground image={config.backgroundImage} overlayGradient={config.bgOverlayGradient} />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setMode('entity-detail'); }} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cc.colour} flex items-center justify-center text-lg`}>{cc.emoji}</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Follow-up Questions</h2>
                  <p className="text-xs text-gray-500">{entity.name} · {cc.label}{consult.urgency_level ? ' · ' : ''}{consult.urgency_level && <UrgencyBadge level={consult.urgency_level}/>}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  {(['pidgin', 'english'] as const).map(m => (
                    <button key={m} onClick={() => setVoiceMode(m)}
                      className={`px-2.5 py-1.5 text-xs font-bold border-r border-gray-300 last:border-0 transition-all ${voiceMode===m?(m==='english'?'bg-blue-600 text-white':'bg-green-600 text-white'):'bg-white text-gray-500'}`}>
                      {m==='english'?'🇬🇧':'🇳🇬'}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setSpeechOn(s => !s); if (speechOn) { window.speechSynthesis.cancel(); stopPidginSpeech(); } }}
                  className={classNames('p-2 rounded-lg', speechOn ? `${config.accentBgClass} ${config.accentTextClass}` : 'bg-gray-100 text-gray-400')}>
                  {speechOn ? <Volume2 size={15}/> : <VolumeX size={15}/>}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <Lightbulb size={14} className={classNames('flex-shrink-0', config.accentTextClass)}/>
            <p className="text-xs text-gray-700">Ask about the advice, how to explain it, what to observe on follow-up, or any related question for this case.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: '460px' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl text-xs text-gray-500">
              <span className="font-semibold text-gray-700 flex items-center gap-1.5">{cc.emoji} AI Advisor</span>
              <span>{userTurns} exchange{userTurns !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${cc.colour} flex items-center justify-center text-lg`}>{cc.emoji}</div>
                  )}
                  <div className={classNames('max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user' ? `${config.probeAccent.userBubbleBg} text-white rounded-tr-sm` : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant' && <p className="text-xs font-bold mb-1 opacity-50">AI Advisor</p>}
                    {msg.role === 'user' && <p className="text-xs font-bold mb-1 opacity-75">You (Advisor)</p>}
                    <MarkdownText text={msg.content}/>
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && (
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${config.probeAccent.userBubbleBg} flex items-center justify-center`}>
                      <User size={15} className="text-white"/>
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${cc.colour} flex items-center justify-center text-lg`}>{cc.emoji}</div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef}/>
            </div>
            <div className="border-t p-4 rounded-b-2xl">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} rows={2}
                  placeholder="Ask a follow-up question about this case…"
                  disabled={isSending}
                  className={classNames('flex-1 px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 resize-none leading-relaxed disabled:opacity-50', config.focusRingClass)}/>
                <div className="flex flex-col gap-2">
                  <button onClick={toggleListening}
                    className={classNames('p-2.5 rounded-xl transition-all', isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                    {isListening ? <MicOff size={16}/> : <Mic size={16}/>}
                  </button>
                  <button onClick={sendMessage} disabled={!inputText.trim() || isSending}
                    className={classNames('p-2.5 rounded-xl transition-all',
                      inputText.trim() && !isSending ? `bg-gradient-to-br ${cc.colour} text-white hover:opacity-90` : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
                    <Send size={16}/>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: CASE DETAIL
  // ════════════════════════════════════════════════════════════════════════

  if (mode === 'case-detail' && selectedConsultation && selectedEntity) {
    const c = selectedConsultation;
    const cc = config.categoryConfig[c.categoryValue];
    return (
      <AppLayout>
        <AdvisorBackground image={config.backgroundImage} overlayGradient={config.bgOverlayGradient} />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('entity-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${cc.colour} flex items-center justify-center text-2xl`}>{cc.emoji}</div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900">{cc.label} Case — {selectedEntity.name}</h2>
                <p className="text-xs text-gray-500">{formatDate(c.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {c.urgency_level && <UrgencyBadge level={c.urgency_level}/>}
                {c.resolved
                  ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Resolved</span>
                  : <span className="text-xs text-orange-600 font-semibold">Open</span>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Intake Summary</p>
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">{c.summary}</p>
              </div>
              {c.aiResponse && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Advice</p>
                  <div className={classNames('text-sm text-gray-800 rounded-lg px-3 py-2 max-h-48 overflow-y-auto border',
                    c.urgency_level ? config.urgencyConfig[c.urgency_level]?.bg : 'bg-gray-50',
                    c.urgency_level ? config.urgencyConfig[c.urgency_level]?.border : 'border-gray-200')}>
                    <MarkdownText text={c.aiResponse}/>
                  </div>
                </div>
              )}
              {c.youth_actions_taken && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Actions Taken</p>
                  <p className={classNames('text-sm text-gray-800 rounded-lg px-3 py-2', config.accentBgClass)}>{c.youth_actions_taken}</p>
                </div>
              )}
              {c.follow_up_needed && (
                <div className="flex items-start gap-2 text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                  <Calendar size={14} className="mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-sm font-semibold">Follow-up{c.follow_up_date ? `: ${formatDate(c.follow_up_date)}` : ' needed'}</p>
                    {c.follow_up_notes && <p className="text-xs mt-0.5">{c.follow_up_notes}</p>}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => openFollowupChat(selectedEntity, c)}
                  className={classNames('flex-1 py-2.5 text-sm font-bold rounded-xl', config.accentBgClass, config.accentTextClass)}>
                  Ask AI Follow-up
                </button>
                {!c.resolved && (
                  <button onClick={() => setShowResolutionModal(true)}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl text-white bg-gradient-to-r ${config.addButtonGradient} hover:opacity-90`}>
                    Mark Resolved ✓
                  </button>
                )}
              </div>
              {c.resolved && c.resolution_narrative && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-bold text-teal-700 uppercase tracking-wide">
                    Outcome: {c.resolution_outcome === 'applied' ? 'Advice applied fully' : c.resolution_outcome === 'partially_applied' ? 'Partially applied' : 'Not applied'}
                  </p>
                  <p className="text-sm text-teal-800">{c.resolution_narrative}</p>
                  {c.resolution_value_amount != null && (
                    <p className="text-xs font-semibold text-teal-700">
                      {c.resolution_value_label}: {c.resolution_value_unit === 'NGN' ? '₦' : ''}{c.resolution_value_amount}{c.resolution_value_unit && c.resolution_value_unit !== 'NGN' ? ` ${c.resolution_value_unit}` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <ResolutionModal
            isOpen={showResolutionModal}
            consultationSummary={c.summary}
            defaultUnit="NGN"
            defaultValueLabel="Estimated value"
            accent={config.challengeAccent.resultAccent}
            onClose={() => setShowResolutionModal(false)}
            onSubmit={(data) => handleResolutionSubmit(c.id, data)}
          />
        </div>
      </AppLayout>
    );
  }

  return null;
};

export default AdvisorCasebookPage;
