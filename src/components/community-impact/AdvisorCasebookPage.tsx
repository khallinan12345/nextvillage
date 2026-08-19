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
import QuietButton from '../ui/QuietButton';
import ChatSurface from '../chat/ChatSurface';
import { MarkdownText } from './MarkdownText';
import { withIllustration } from '../../lib/illustrationAgent';
import { extractIllustration } from './illustrationParser';
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 px-2 pb-2">
      <div className="w-full max-w-lg bg-card border border-hair rounded-2xl shadow-lg flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair rounded-t-2xl bg-surface">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Interview Coach</p>
            <p className="text-sm font-bold text-ink">Exploring: {field.label}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-muted hover:text-ink hover:bg-paper">
            <X size={18}/>
          </button>
        </div>

        <div className="px-4 py-2 text-xs flex items-start gap-2 bg-paper text-body border-b border-hair">
          <span className="text-base">💬</span>
          <span>Read each question aloud. Type or speak the answer, then tap Send. The AI will keep asking until this topic is fully characterised.</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={classNames('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}>
              <span className="text-xs font-medium text-muted mb-1">
                {msg.role === 'user' ? 'Your answer' : 'AI Interview Coach'}
              </span>
              {msg.role === 'user' ? (
                <div className="max-w-[85%] rounded-xl bg-paper border border-hair px-3 py-2.5 text-sm leading-relaxed text-body">
                  <MarkdownText text={msg.content}/>
                </div>
              ) : (
                <div className="max-w-[85%] text-sm leading-relaxed text-body">
                  <MarkdownText text={msg.content}/>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex flex-col items-start">
              <span className="text-xs font-medium text-muted mb-1">AI Interview Coach</span>
              <div className="flex gap-1 items-center h-4 py-1.5">{[0,150,300].map(d => <div key={d} className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" style={{ animationDelay: `${d}ms` }}/>)}</div>
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

        <div className="border-t border-hair px-3 py-3 rounded-b-2xl bg-card">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSend(); } }}
              placeholder="Type the answer…"
              disabled={loading}
              className="flex-1 px-3 py-2.5 text-sm border border-hair bg-paper rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent disabled:opacity-50"
            />
            <button onClick={onSend} disabled={!input.trim() || loading}
              className="px-3 py-2.5 rounded-xl text-white bg-accent hover:bg-accent/90 disabled:opacity-40">
              <Send size={15}/>
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-ink border border-hair bg-card hover:bg-paper text-sm font-bold whitespace-nowrap">
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

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
  }, [messages, isSending]);
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
    // Strip any trailing <illustration> block first — it's meant to be seen,
    // not read aloud as raw JSON.
    const spokenText = extractIllustration(text).text;
    void playPidginVoice(spokenText.slice(0, 400), 'english', {
      onError: (err) => {
        console.warn(`[${config.pageName}] SpeechGen TTS failed, falling back to browser voice:`, err);
        speakBrowser(spokenText);
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
      const illustratedReply = await withIllustration('', reply);
      setAdviceResult({ urgency, text: illustratedReply });
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
      const illustratedReply = await withIllustration(userMsg.content, reply);
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: illustratedReply, timestamp: new Date() };
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
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-card border border-hair rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center text-2xl">{config.headerEmoji}</div>
                <div>
                  <h1 className="text-xl font-bold text-ink">{config.dashboardTitle}</h1>
                  <p className="text-sm text-muted">{config.dashboardSubtitle}</p>
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
                    className="flex items-center gap-1.5 px-3 py-2.5 border border-hair bg-card text-body hover:border-accent/40 hover:text-accent rounded-xl font-semibold text-sm transition-colors"
                    title="Read the written guide"
                  >
                    <BookOpen size={16} /> Guide
                  </Link>
                )}
                <button
                  onClick={() => setShowOfflineModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 border border-hair bg-card text-body hover:border-accent/40 hover:text-accent rounded-xl font-semibold text-sm transition-colors"
                  title="Use offline version"
                >
                  📴 Offline
                </button>
                <button onClick={() => { resetAddEntity(); setMode('add-entity'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white rounded-xl font-semibold text-sm transition-colors">
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
                <div key={stat.label} className="bg-card border border-hair rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <p className="text-2xl font-bold text-ink">{stat.value}</p>
                  <p className="text-xs text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Challenge Banner — available (not enrolled) ── */}
          {!challengeLoading && availableChallenge && !activeChallenge && (
            <div className="bg-surface border border-hair border-l-4 border-l-accent rounded-2xl p-5 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-card border border-hair flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-accent" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted">Community AI Challenge — This Week</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-card border border-hair text-body">{availableChallenge.tier_target}</span>
                  </div>
                  <p className="text-ink font-bold text-base mb-1">{availableChallenge.title}</p>
                  <p className="text-sm leading-relaxed mb-3 text-body">{availableChallenge.description}</p>
                  <QuietButton
                    onClick={() => handleEnrollChallenge(availableChallenge)}
                    disabled={enrolling}
                    loading={enrolling}
                    icon={<ChevronRight size={16} />}
                    variant="solid"
                    className="w-full justify-center"
                  >
                    {enrolling ? 'Checking out…' : 'Check out this challenge'}
                  </QuietButton>
                </div>
              </div>
            </div>
          )}

          {/* ── Challenge Banner — enrolled ── */}
          {activeChallenge && (
            <div className="bg-surface border border-hair border-l-4 border-l-accent rounded-2xl p-5 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-card border border-hair flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-accent" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-accent">Community AI Challenge — Active</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-card border border-hair text-body">{activeChallenge.tier_target}</span>
                  </div>
                  <p className="text-ink font-bold text-base mb-1">{activeChallenge.title}</p>
                  <p className="text-sm leading-relaxed mb-2 text-body">{activeChallenge.challenge_mode_intro}</p>
                  <div className="rounded-xl p-3 mb-3 bg-card border border-hair">
                    <p className="text-xs font-bold mb-1 text-ink">Your mission:</p>
                    <p className="text-sm text-body">{activeChallenge.challenge_instruction}</p>
                  </div>
                  <QuietButton
                    onClick={() => setShowChallengeReflect(true)}
                    icon={<CheckCircle size={16} />}
                    variant="solid"
                    className="w-full justify-center"
                  >
                    I've done it — submit my reflection
                  </QuietButton>
                </div>
              </div>
            </div>
          )}

          {/* ── Challenge Reflection Modal ── */}
          {showChallengeReflect && activeChallenge && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
              <div className="bg-card rounded-2xl border border-hair w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-lg">
                {challengeResult ? (
                  <div className="p-6">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 bg-surface border border-hair">
                        <Award size={32} className="text-accent" />
                      </div>
                      <h2 className="text-2xl font-bold text-ink">{challengeResult.tier_label}</h2>
                      <p className="text-sm font-bold uppercase tracking-wide mt-1 text-accent">{challengeResult.tier} tier earned</p>
                    </div>
                    <div className="bg-paper border border-hair rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-ink mb-1">What you achieved</p>
                      <p className="text-sm text-body leading-relaxed">{challengeResult.summary}</p>
                    </div>
                    <div className="bg-paper border border-hair rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-ink mb-1">Why you earned this tier</p>
                      <p className="text-sm text-body leading-relaxed">{challengeResult.tier_reasoning}</p>
                    </div>
                    <div className="bg-paper border border-hair rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-ink mb-1">What to do next</p>
                      <p className="text-sm text-body leading-relaxed">{challengeResult.follow_up_instruction}</p>
                    </div>
                    <div className="bg-paper rounded-xl p-3 mb-5">
                      <p className="text-xs text-muted">{challengeResult.next_tier_hint}</p>
                    </div>
                    <QuietButton
                      onClick={() => { setShowChallengeReflect(false); setChallengeResult(null); setActiveChallenge(null); }}
                      variant="solid"
                      className="w-full justify-center"
                    >
                      Done
                    </QuietButton>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide mb-0.5 text-accent">Challenge Reflection</p>
                        <h2 className="text-xl font-bold text-ink">{activeChallenge.title}</h2>
                      </div>
                      <button onClick={() => setShowChallengeReflect(false)} className="text-muted hover:text-ink p-1">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-ink mb-1.5">{activeChallenge.return_question_1}</label>
                        <textarea value={challengeReflect1} onChange={e => setChallengeReflect1(e.target.value)} rows={3}
                          placeholder="Describe what you did…"
                          className="w-full px-4 py-3 text-sm border border-hair bg-paper rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-none leading-relaxed"/>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-ink mb-1.5">{activeChallenge.return_question_2}</label>
                        <textarea value={challengeReflect2} onChange={e => setChallengeReflect2(e.target.value)} rows={3}
                          placeholder="What happened…"
                          className="w-full px-4 py-3 text-sm border border-hair bg-paper rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-none leading-relaxed"/>
                      </div>
                      {activeChallenge.return_question_3 && (
                        <div>
                          <label className="block text-sm font-bold text-ink mb-1.5">{activeChallenge.return_question_3}</label>
                          <textarea value={challengeReflect3} onChange={e => setChallengeReflect3(e.target.value)} rows={2}
                            placeholder="Additional details…"
                            className="w-full px-4 py-3 text-sm border border-hair bg-paper rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-none leading-relaxed"/>
                        </div>
                      )}
                      <EvidencePicker sourceType="challenge_enrollment" sourceId={activeChallenge.enrollmentId} accent="violet" />
                    </div>
                    <QuietButton
                      onClick={handleSubmitChallengeReflection}
                      disabled={!challengeReflect1.trim() || !challengeReflect2.trim() || challengeSubmitting}
                      loading={challengeSubmitting}
                      icon={<CheckCircle size={16} />}
                      variant="solid"
                      className="w-full justify-center mt-6"
                    >
                      {challengeSubmitting ? 'Evaluating your impact…' : 'Submit reflection'}
                    </QuietButton>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Offline Mode Modal ── */}
          {showOfflineModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
              <div className="bg-card rounded-2xl border border-hair w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-lg">
                <div className="flex items-center justify-between px-5 py-4 border-b border-hair bg-surface rounded-t-2xl">
                  <div>
                    <p className="text-xs font-bold text-muted uppercase tracking-wide">Offline Mode</p>
                    <h2 className="text-lg font-bold text-ink">{config.offlineModalTitle}</h2>
                  </div>
                  <button onClick={() => setShowOfflineModal(false)} className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surface">
                    <X size={18}/>
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="border border-hair bg-paper rounded-xl p-4">
                    <p className="text-sm font-bold text-ink mb-2">📴 Use the offline advisor now</p>
                    <p className="text-sm text-body mb-3 leading-relaxed">{config.offlineToolDescription}</p>
                    <a
                      href={config.offlineToolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-accent hover:bg-accent/90 text-white font-bold text-sm transition-colors"
                    >
                      <span>📴</span> Open Offline Advisor
                    </a>
                  </div>

                  <div className="bg-paper border border-hair rounded-xl p-4">
                    <p className="text-sm font-bold text-ink mb-2">💡 Tips for field use</p>
                    <ul className="space-y-1.5 text-xs text-body">
                      {config.offlineTips.map((tip, i) => <li key={i}>• {tip}</li>)}
                    </ul>
                  </div>

                  <QuietButton
                    onClick={() => setShowOfflineModal(false)}
                    className="w-full justify-center"
                  >
                    Close
                  </QuietButton>
                </div>
              </div>
            </div>
          )}

          {loadingEntities ? (
            <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-accent"/></div>
          ) : entities.length === 0 ? (
            <div className="bg-card border border-hair rounded-2xl p-10 text-center">
              <div className="text-5xl mb-4">{config.headerEmoji}</div>
              <h2 className="text-lg font-bold text-ink mb-2">No {config.entityNounSingular.toLowerCase()}s registered yet</h2>
              <p className="text-sm text-muted mb-5">Add your first {config.entityNounSingular.toLowerCase()} to start your casebook.</p>
              <QuietButton onClick={() => { resetAddEntity(); setMode('add-entity'); }} icon={<Plus size={16}/>} variant="solid">
                Register First {config.entityNounSingular}
              </QuietButton>
            </div>
          ) : (
            <div className="space-y-3">
              {entities.map(entity => (
                <button key={entity.id}
                  onClick={() => { setSelectedEntity(entity); loadConsultations(entity.id); setMode('entity-detail'); }}
                  className="w-full bg-card rounded-2xl p-4 text-left hover:bg-surface transition-colors border border-hair hover:border-accent/40">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-lg">{config.entityCardEmoji}</div>
                      <div>
                        <p className="font-bold text-ink">{entity.name}</p>
                        <p className="text-sm text-muted">{entity.village}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {config.renderCategorySummary(entity.extra)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <ChevronRight size={17} className="text-muted"/>
                      {(entity.open_cases ?? 0) > 0 && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-full px-2 py-0.5 font-semibold">{entity.open_cases} open</span>
                      )}
                      {(entity.dangerCount ?? 0) > 0 && (
                        <span className="text-xs bg-red-100 text-red-700 border border-red-300 rounded-full px-2 py-0.5 font-bold">⚠️ Urgent</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted">
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
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-card border border-hair rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setMode('dashboard')} className="text-muted hover:text-ink p-1"><ArrowLeft size={20}/></button>
              <div><h2 className="text-xl font-bold text-ink">Register {config.entityNounSingular}</h2><p className="text-sm text-muted">Add to your casebook</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">{config.entityNounSingular} Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={config.registerNamePlaceholder}
                  className="w-full px-4 py-3 border border-hair bg-paper rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">Village *</label>
                <select value={newVillage} onChange={e => setNewVillage(e.target.value)}
                  className="w-full px-4 py-3 border border-hair rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent text-base bg-paper">
                  <option value="">Select village…</option>
                  {config.villages.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">Phone (optional)</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+234 801 234 5678"
                  className="w-full px-4 py-3 border border-hair bg-paper rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent text-base"/>
              </div>

              {config.renderExtraFields(newExtra, setNewExtra)}

              <div>
                <label className="block text-sm font-semibold text-ink mb-1">Notes (optional)</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
                  placeholder="Past problems, special concerns…"
                  className="w-full px-4 py-3 border border-hair bg-paper rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent text-sm resize-none"/>
              </div>
              <QuietButton
                onClick={saveEntity}
                disabled={!newName.trim() || !newVillage || savingEntity}
                loading={savingEntity}
                variant="solid"
                className="w-full justify-center py-3.5 text-base"
              >
                {savingEntity ? 'Saving…' : `Register ${config.entityNounSingular}`}
              </QuietButton>
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
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-card border border-hair rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('dashboard')} className="text-muted hover:text-ink p-1"><ArrowLeft size={20}/></button>
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center text-2xl">{config.entityCardEmoji}</div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-ink">{entity.name}</h2>
                <p className="text-sm text-muted">{entity.village}{entity.phone ? ` · ${entity.phone}` : ''}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {config.renderCategorySummary(entity.extra)}
            </div>

            {entity.notes && <p className="text-sm text-body italic bg-paper rounded-lg px-3 py-2 mb-4">{entity.notes}</p>}

            <p className="text-sm font-semibold text-ink mb-2">Start new consultation for:</p>
            <div className="grid grid-cols-1 gap-2">
              {consultOptions.map(value => {
                const cc = config.categoryConfig[value];
                if (!cc) return null;
                return (
                  <button key={value} onClick={() => startConsultation(entity, value)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm bg-card border border-hair hover:border-accent/40 hover:bg-surface transition-colors text-left">
                    <span className="text-xl flex-shrink-0">{cc.emoji}</span>
                    <div>
                      <div className="text-ink">{cc.label}</div>
                      {cc.description && <div className="text-xs font-normal text-muted">{cc.description}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Case history */}
          <div className="bg-card border border-hair rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <ClipboardList size={16} className="text-accent"/> Case History
              </h3>
              <button onClick={() => loadConsultations(entity.id)} className="text-muted hover:text-ink"><RefreshCw size={14}/></button>
            </div>
            {loadingConsults ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-accent"/></div>
            ) : consultations.length === 0 ? (
              <p className="text-sm text-muted italic text-center py-4">No consultations yet.</p>
            ) : (
              <div className="space-y-3">
                {consultations.map(c => {
                  const cc = config.categoryConfig[c.categoryValue];
                  return (
                    <div key={c.id} className="border border-hair rounded-xl p-4 hover:border-accent/40 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{cc?.emoji}</span>
                          <div>
                            <p className="font-semibold text-ink text-sm">{cc?.label}</p>
                            <p className="text-xs text-muted">{formatDate(c.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {c.urgency_level && <UrgencyBadge level={c.urgency_level}/>}
                          {c.resolved
                            ? <span className="text-xs text-green-700 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Resolved</span>
                            : <span className="text-xs text-yellow-700 font-semibold">Open</span>}
                        </div>
                      </div>
                      <p className="text-sm text-body mt-2 line-clamp-2">{c.summary}</p>
                      {c.follow_up_needed && !c.resolved && c.follow_up_date && (
                        <p className="text-xs text-blue-700 mt-1.5 flex items-center gap-1">
                          <Calendar size={11}/> Follow-up: {formatDate(c.follow_up_date)}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <QuietButton onClick={() => { setSelectedConsultation(c); setMode('case-detail'); }} className="flex-1 justify-center py-2 text-xs">
                          View Case
                        </QuietButton>
                        <QuietButton onClick={() => openFollowupChat(entity, c)} className="flex-1 justify-center py-2 text-xs">
                          Ask AI Follow-up
                        </QuietButton>
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

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

          <div className="bg-card border border-hair rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setMode('entity-detail')} className="text-muted hover:text-ink p-1"><ArrowLeft size={20}/></button>
              <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-xl">{cc.emoji}</div>
              <div>
                <h2 className="text-base font-bold text-ink">{cc.label} Consultation</h2>
                <p className="text-xs text-muted">{selectedEntity.name} · {selectedEntity.village}</p>
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

          <div className="bg-card border border-hair rounded-xl px-4 py-3 flex items-start gap-2">
            <Lightbulb size={14} className="flex-shrink-0 mt-0.5 text-accent"/>
            <p className="text-xs text-body">
              Fill in each field with what you learn. Tap <strong>🔍 Probe</strong> to get AI-coached interview questions for that topic — the AI will ask one question at a time until it fully understands. Then run AI Advice.
            </p>
          </div>

          <div className="bg-card border border-hair rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
              <ClipboardList size={15} className="text-accent"/> Intake — {cc.label}
            </h3>
            <p className="text-xs text-muted mb-4 flex items-center gap-1">
              <span className="font-bold text-accent">🔍 Probe</span> — tap after a field to explore it deeper with AI interview coaching
            </p>
            <div className="space-y-4">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-semibold text-ink flex items-center mb-1">
                    {field.required && <span className="text-red-500 mr-1">*</span>}
                    {field.danger && <span className="text-red-500 mr-1">⚠️</span>}
                    {field.label}
                    <InfoTooltip
                      text={field.tooltip}
                      open={openTooltip === field.key}
                      onToggle={() => setOpenTooltip(openTooltip === field.key ? null : field.key)}
                      accent="text-accent"
                    />
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      value={intake[field.key] || ''}
                      onChange={e => setIntake(prev => ({ ...prev, [field.key]: e.target.value }))}
                      rows={2}
                      placeholder={field.placeholder}
                      className={classNames(
                        'flex-1 px-3 py-2.5 border rounded-xl text-sm bg-paper resize-none focus:outline-none focus:ring-2',
                        field.danger && intake[field.key]?.trim()
                          ? 'border-red-300 focus:ring-red-400 bg-red-50'
                          : 'border-hair focus:ring-accent/40 focus:border-accent'
                      )}
                    />
                    <QuietButton
                      onClick={() => openProbe(field)}
                      variant={probeField?.key === field.key ? 'solid' : 'quiet'}
                      className="text-xs flex-shrink-0 self-start mt-0.5"
                    >
                      {probeField?.key === field.key ? '🔍 Probing…' : '🔍 Probe'}
                    </QuietButton>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!adviceResult ? (
            <QuietButton
              onClick={runAdvice}
              disabled={isGeneratingAdvice || !intakeComplete}
              loading={isGeneratingAdvice}
              icon={<ClipboardList size={18}/>}
              variant="solid"
              className="w-full justify-center py-4 text-base"
            >
              {isGeneratingAdvice ? 'Generating AI Advice…' : `Generate AI Advice${!intakeComplete ? ' (fill required fields first)' : ''}`}
            </QuietButton>
          ) : (
            <div className={classNames('bg-card rounded-2xl shadow-sm p-5 border-2', config.urgencyConfig[adviceResult.urgency]?.border)}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1">AI Advisory Result</p>
                  <UrgencyBadge level={adviceResult.urgency}/>
                  <p className="text-xs text-muted mt-1">{config.urgencyConfig[adviceResult.urgency]?.description}</p>
                </div>
                <button onClick={() => { setAdviceResult(null); runAdvice(); }}
                  className="text-xs hover:underline flex items-center gap-1 text-accent">
                  <RefreshCw size={12}/> Re-run
                </button>
              </div>

              {config.criticalUrgencyValue && adviceResult.urgency === config.criticalUrgencyValue && (
                <div className="bg-red-600 text-white rounded-xl p-3 mb-4 flex items-start gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>
                  <p className="text-sm font-bold">{config.criticalBannerText}</p>
                </div>
              )}

              <div className="text-sm text-body bg-paper rounded-xl px-4 py-3 max-h-72 overflow-y-auto">
                <MarkdownText text={adviceResult.text}/>
              </div>

              <div className="mt-4 space-y-3 border-t border-hair pt-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">What did you advise / do?</label>
                  <textarea value={youthActionsTaken} onChange={e => setYouthActionsTaken(e.target.value)} rows={2}
                    placeholder="e.g. Advised on next steps and referred to the appropriate contact."
                    className="w-full px-3 py-2 border border-hair bg-paper rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"/>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="followup" checked={followUpNeeded} onChange={e => setFollowUpNeeded(e.target.checked)} className="w-4 h-4 accent-accent"/>
                  <label htmlFor="followup" className="text-sm font-semibold text-ink">Follow-up visit needed</label>
                </div>
                {followUpNeeded && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">Follow-up date</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                        className="w-full px-3 py-2 border border-hair bg-paper rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"/>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">What to check</label>
                      <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Check status and progress"
                        className="w-full px-3 py-2 border border-hair bg-paper rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"/>
                    </div>
                  </div>
                )}

                {consultSaved ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-800 font-semibold text-sm bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                      <CheckCircle size={16}/> Case saved to {selectedEntity.name}'s record.
                    </div>
                    {activeChallenge && (
                      <div className="bg-surface border border-hair rounded-xl px-4 py-3 flex items-start gap-2">
                        <Award size={16} className="text-accent flex-shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-ink mb-1">Community AI Challenge active</p>
                          <p className="text-xs text-body mb-2">You completed a consultation — did you also complete your challenge mission? Submit your reflection to earn your tier.</p>
                          <button
                            onClick={() => setShowChallengeReflect(true)}
                            className="text-xs font-bold text-accent underline hover:no-underline"
                          >
                            Submit challenge reflection →
                          </button>
                        </div>
                      </div>
                    )}
                    {savedConsultId && (
                      <QuietButton
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
                        icon={<Send size={16}/>}
                        variant="solid"
                        className="w-full justify-center py-3"
                      >
                        Continue with AI Follow-up Chat
                      </QuietButton>
                    )}
                  </div>
                ) : (
                  <QuietButton onClick={saveConsultation} disabled={savingConsult} loading={savingConsult} variant="solid" className="w-full justify-center py-3">
                    {savingConsult ? 'Saving…' : 'Save Case Record'}
                  </QuietButton>
                )}
              </div>
            </div>
          )}

          <div className="bg-card border border-hair rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck size={14} className="flex-shrink-0 mt-0.5 text-accent"/>
            <p className="text-xs text-body">{config.disclaimer}</p>
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
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-card border border-hair rounded-2xl shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setMode('entity-detail'); }} className="text-muted hover:text-ink p-1"><ArrowLeft size={20}/></button>
                <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-lg">{cc.emoji}</div>
                <div>
                  <h2 className="text-base font-bold text-ink">Follow-up Questions</h2>
                  <p className="text-xs text-muted">{entity.name} · {cc.label}{consult.urgency_level ? ' · ' : ''}{consult.urgency_level && <UrgencyBadge level={consult.urgency_level}/>}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-full overflow-hidden border border-hair">
                  {(['pidgin', 'english'] as const).map(m => (
                    <button key={m} onClick={() => setVoiceMode(m)}
                      className={classNames('px-2.5 py-1.5 text-xs font-bold transition-colors',
                        m !== 'pidgin' && 'border-l border-hair',
                        voiceMode === m ? 'bg-accent text-white' : 'bg-card text-body hover:bg-paper')}>
                      {m==='english'?'🇬🇧':'🇳🇬'}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setSpeechOn(s => !s); if (speechOn) { window.speechSynthesis.cancel(); stopPidginSpeech(); } }}
                  className={classNames('p-2 rounded-lg', speechOn ? 'bg-surface text-accent' : 'bg-paper text-muted')}>
                  {speechOn ? <Volume2 size={15}/> : <VolumeX size={15}/>}
                </button>
              </div>
            </div>
          </div>

          <ChatSurface
            title={`${cc.emoji} AI Advisor`}
            legend={<span className="text-xs text-muted">{userTurns} exchange{userTurns !== 1 ? 's' : ''}</span>}
            messages={messages}
            renderAssistant={(content) => (
              <>
                <MarkdownText text={content}/>
                <AIPidginCoachWrapper englishText={content} />
              </>
            )}
            submitting={isSending}
            transcriptRef={chatEndRef}
            transcriptHeightClassName="h-[28rem]"
            value={inputText}
            onChange={setInputText}
            onKeyDown={handleKeyDown}
            onSubmit={sendMessage}
            disabled={isSending}
            placeholder="Ask a follow-up question about this case…"
            notice={
              <p className="text-xs text-muted mb-3 flex items-start gap-1.5">
                <Lightbulb size={14} className="flex-shrink-0 mt-0.5 text-accent"/>
                Ask about the advice, how to explain it, what to observe on follow-up, or any related question for this case.
              </p>
            }
            composerActions={
              <QuietButton
                onClick={toggleListening}
                icon={isListening ? <MicOff size={14}/> : <Mic size={14}/>}
                className={isListening ? 'border-red-300 text-red-600 hover:text-red-700 hover:border-red-400' : undefined}
              >
                {isListening ? 'Stop' : 'Speak'}
              </QuietButton>
            }
          />
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
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-card border border-hair rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('entity-detail')} className="text-muted hover:text-ink p-1"><ArrowLeft size={20}/></button>
              <div className="w-11 h-11 rounded-xl bg-surface flex items-center justify-center text-2xl">{cc.emoji}</div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-ink">{cc.label} Case — {selectedEntity.name}</h2>
                <p className="text-xs text-muted">{formatDate(c.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {c.urgency_level && <UrgencyBadge level={c.urgency_level}/>}
                {c.resolved
                  ? <span className="text-xs text-green-700 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Resolved</span>
                  : <span className="text-xs text-yellow-700 font-semibold">Open</span>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1">Intake Summary</p>
                <p className="text-sm text-body bg-paper rounded-lg px-3 py-2">{c.summary}</p>
              </div>
              {c.aiResponse && (
                <div>
                  <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1">AI Advice</p>
                  <div className={classNames('text-sm text-body rounded-lg px-3 py-2 max-h-48 overflow-y-auto border',
                    c.urgency_level ? config.urgencyConfig[c.urgency_level]?.bg : 'bg-paper',
                    c.urgency_level ? config.urgencyConfig[c.urgency_level]?.border : 'border-hair')}>
                    <MarkdownText text={c.aiResponse}/>
                  </div>
                </div>
              )}
              {c.youth_actions_taken && (
                <div>
                  <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1">Actions Taken</p>
                  <p className="text-sm text-body rounded-lg px-3 py-2 bg-paper">{c.youth_actions_taken}</p>
                </div>
              )}
              {c.follow_up_needed && (
                <div className="flex items-start gap-2 text-ink bg-surface border border-hair rounded-lg px-3 py-2">
                  <Calendar size={14} className="mt-0.5 flex-shrink-0 text-accent"/>
                  <div>
                    <p className="text-sm font-semibold">Follow-up{c.follow_up_date ? `: ${formatDate(c.follow_up_date)}` : ' needed'}</p>
                    {c.follow_up_notes && <p className="text-xs mt-0.5 text-body">{c.follow_up_notes}</p>}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <QuietButton onClick={() => openFollowupChat(selectedEntity, c)} className="flex-1 justify-center py-2.5 text-sm">
                  Ask AI Follow-up
                </QuietButton>
                {!c.resolved && (
                  <QuietButton onClick={() => setShowResolutionModal(true)} variant="solid" className="flex-1 justify-center py-2.5 text-sm">
                    Mark Resolved ✓
                  </QuietButton>
                )}
              </div>
              {c.resolved && c.resolution_narrative && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-bold text-green-800 uppercase tracking-wide">
                    Outcome: {c.resolution_outcome === 'applied' ? 'Advice applied fully' : c.resolution_outcome === 'partially_applied' ? 'Partially applied' : 'Not applied'}
                  </p>
                  <p className="text-sm text-green-800">{c.resolution_narrative}</p>
                  {c.resolution_value_amount != null && (
                    <p className="text-xs font-semibold text-green-700">
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
            accent="violet"
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
