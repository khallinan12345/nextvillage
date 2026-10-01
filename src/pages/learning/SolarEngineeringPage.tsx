// src/pages/learning/SolarEngineeringPage.tsx
//
// Solar Engineering & Installation — coached practice (training) page.
//
// Mirrors FinancialLiteracyPage.tsx, with these structural changes:
// - Areas, rubric, locale, and prompts come from src/lib/solarEngineering.ts.
// - Catalog modules are real learning_modules rows (category 'Solar Engineering & Installation');
//   a dashboard row is created the first time a learner opens one, so progress
//   always persists (no local-only "mock-" activities).
// - Per-turn scores come from a <rubric> tag in the trainer's reply (no second
//   background evaluation call per turn).
// - Scores are stored in dashboard.rubric_scores (jsonb) + the existing
//   certification_evaluation_score / _evidence aggregate columns, and
//   dual-written to the evaluations table via saveEvaluation().

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import classNames from 'classnames';
import {
  Sun, Calculator, Zap, Wrench, BatteryCharging, ClipboardCheck,
  ArrowLeft, Plus, PlusCircle, RefreshCw, Save, CheckCircle, Clock, Circle,
  Mic, Wand2, BookOpen, X, Target, Star, Award, Lightbulb,
} from 'lucide-react';

import AppLayout from '../../components/layout/AppLayout';
import QuietButton from '../../components/ui/QuietButton';
import ChatSurface from '../../components/chat/ChatSurface';
import EvaluationPanel from '../../components/evaluation/EvaluationPanel';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { VoiceFallback } from '../../components/VoiceFallback';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON } from '../../lib/chatClient';
import { saveEvaluation } from '../../lib/evaluations';
import { useAuth } from '../../hooks/useAuth';
import { useVoice } from '../../hooks/useVoice';
import {
  SOLAR_AREAS, SOLAR_CATEGORY, SOLAR_CHAT_PAGE,
  SolarArea, FullAssessment, PersonalityBaselineLike, TurnRubric,
  buildSolarAssessmentPrompt, buildSolarFacilitatorPrompt, criterionLabel,
  getSolarArea, getSolarAreaBySubCategory, getSolarLocale, latestRubricIn,
  minScore, normalizeAssessment, splitRubric, SCORE_LABELS,
} from '../../lib/solarEngineering';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

type Progress = 'not started' | 'started' | 'completed';
type ScoreMap = Record<string, { score: number; evidence: string }>;

interface SolarActivity {
  key: string;                 // stable React key
  dashboardId: string | null;  // null until the learner first opens a catalog module
  learningModuleId: string;
  title: string;
  description: string;
  subCategory: string;
  progress: Progress;
  overallScore: number | null;
  evidence: string | null;
  rubricScores: ScoreMap;
  chatHistory: ChatMessage[];
  isOwn: boolean;
  updatedAt: string;
  moduleInstructions: string | null;
}

interface LearnerProfile {
  country: string | null;
  continent: string | null;
  organizationId: string | null;
  gradeLevel: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
const AREA_ICONS: Record<SolarArea['icon'], React.ReactNode> = {
  sun: <Sun className="h-6 w-6" />,
  calculator: <Calculator className="h-6 w-6" />,
  zap: <Zap className="h-6 w-6" />,
  wrench: <Wrench className="h-6 w-6" />,
  battery: <BatteryCharging className="h-6 w-6" />,
  clipboard: <ClipboardCheck className="h-6 w-6" />,
};

const scorePill = (s: number) =>
  s === 3 ? 'bg-green-100 text-green-800 border-green-300'
  : s === 2 ? 'bg-blue-100 text-blue-800 border-blue-300'
  : s === 1 ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
  : 'bg-red-100 text-red-800 border-red-300';

const parseHistory = (raw: unknown): ChatMessage[] => {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr)
      ? arr.map((m: any) => ({ role: m.role, content: String(m.content ?? ''), timestamp: new Date(m.timestamp ?? Date.now()) }))
      : [];
  } catch {
    return [];
  }
};

const markdown = {
  p: ({ children }: any) => <p className="mb-2 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc ml-5 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal ml-5 mb-2 space-y-1">{children}</ol>,
  strong: ({ children }: any) => <strong className="font-semibold text-ink">{children}</strong>,
};

const greetingFor = (title: string, level: number) =>
  level <= 1
    ? `Hello! 👋 Today we will practise **${title}** with a real installation example. Are you ready?`
    : `Welcome! In this session we'll work through **${title}** using real numbers from an installation scenario. Ready to begin?`;

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
const SolarEngineeringPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  // Learner
  const [profile, setProfile] = useState<LearnerProfile>({ country: null, continent: null, organizationId: null, gradeLevel: null });
  const [baseline, setBaseline] = useState<PersonalityBaselineLike | null>(null);
  const [commLevel, setCommLevel] = useState(1);
  const locale = useMemo(() => getSolarLocale(profile.country), [profile.country]);

  // Overview
  const [activeAreaId, setActiveAreaId] = useState(SOLAR_AREAS[0].id);
  const [activities, setActivities] = useState<SolarActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Session
  const [session, setSession] = useState<SolarActivity | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [latestRubric, setLatestRubric] = useState<TurnRubric | null>(null);
  const [rubricDetail, setRubricDetail] = useState<TurnRubric | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<FullAssessment | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [reflection, setReflection] = useState('');
  const [isImproving, setIsImproving] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Create-your-own
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '', areaId: SOLAR_AREAS[0].id, situation: '', moneyAngle: '', location: '', constraints: '', people: '',
  });

  // Voice
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { speak, cancel, fallbackText, clearFallback, recognitionLang } = useVoice(voiceMode === 'pidgin');

  const activeArea = getSolarArea(activeAreaId) ?? SOLAR_AREAS[0];
  const sessionArea = session ? getSolarAreaBySubCategory(session.subCategory) : null;

  // ── Load learner profile + baseline, then activities ─────────────────────
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: p } = await supabase
        .from('profiles')
        .select('country, continent, organization_id, grade_level')
        .eq('id', user.id)
        .single();
      const prof: LearnerProfile = {
        country: p?.country ?? null,
        continent: p?.continent ?? null,
        organizationId: p?.organization_id ?? null,
        gradeLevel: p?.grade_level ?? null,
      };
      setProfile(prof);
      setVoiceMode(prof.country === 'Nigeria' ? 'pidgin' : 'english');

      const { data: b } = await supabase
        .from('user_personality_baseline')
        .select('communication_strategy, learning_strategy, communication_level')
        .eq('user_id', user.id)
        .maybeSingle();
      if (b) {
        setBaseline({ communicationStrategy: b.communication_strategy ?? null, learningStrategy: b.learning_strategy ?? null });
        setCommLevel(b.communication_level ?? 1);
      }

      await loadActivities(prof.organizationId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Deep link: ?area=electrical-safety or ?create=1&area=system-sizing
  useEffect(() => {
    const area = searchParams.get('area');
    if (area && getSolarArea(area)) {
      setActiveAreaId(area);
      setForm(f => ({ ...f, areaId: area }));
    }
    if (searchParams.get('create') === '1') setShowCreate(true);
  }, [searchParams]);

  // Speech recognition (voice input)
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = recognitionLang;
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text) setInput(prev => (prev ? `${prev} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch { /* noop */ } };
  }, [recognitionLang]);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [chat]);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadActivities = async (organizationId: string | null) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const dashboardQuery = supabase
        .from('dashboard')
        .select(`
          id, learning_module_id, progress, certification_evaluation_score, certification_evaluation_evidence,
          rubric_scores, chat_history, updated_at,
          learning_modules:learning_module_id (
            title, description, category, sub_category, public, user_id, ai_facilitator_instructions
          )
        `)
        .eq('user_id', user.id)
        .not('learning_module_id', 'is', null);

      let catalogQuery = supabase
        .from('learning_modules')
        .select('learning_module_id, title, description, sub_category, organization_id, updated_at, ai_facilitator_instructions')
        .eq('category', SOLAR_CATEGORY)
        .eq('public', 1);
      catalogQuery = organizationId
        ? catalogQuery.or(`organization_id.eq.${organizationId},organization_id.is.null`)
        : catalogQuery.is('organization_id', null);

      const [{ data: rows, error: dashErr }, { data: catalog, error: catErr }] = await Promise.all([dashboardQuery, catalogQuery]);
      if (dashErr) throw dashErr;
      if (catErr) throw catErr;

      const mine: SolarActivity[] = (rows ?? [])
        .filter((r: any) => {
          const m = Array.isArray(r.learning_modules) ? r.learning_modules[0] : r.learning_modules;
          return m?.category === SOLAR_CATEGORY;
        })
        .map((r: any) => {
          const m = Array.isArray(r.learning_modules) ? r.learning_modules[0] : r.learning_modules;
          return {
            key: r.id,
            dashboardId: r.id,
            learningModuleId: r.learning_module_id,
            title: m?.title ?? 'Activity',
            description: m?.description ?? '',
            subCategory: m?.sub_category ?? '',
            progress: (r.progress ?? 'started') as Progress,
            overallScore: r.certification_evaluation_score ?? null,
            evidence: r.certification_evaluation_evidence ?? null,
            rubricScores: (r.rubric_scores ?? {}) as ScoreMap,
            chatHistory: parseHistory(r.chat_history),
            isOwn: m?.public === 0 && m?.user_id === user.id,
            updatedAt: r.updated_at,
            moduleInstructions: m?.ai_facilitator_instructions ?? null,
          };
        });

      const started = new Set(mine.map(a => a.learningModuleId));
      const fromCatalog: SolarActivity[] = (catalog ?? [])
        .filter((m: any) => !started.has(m.learning_module_id))
        .map((m: any) => ({
          key: `catalog-${m.learning_module_id}`,
          dashboardId: null,
          learningModuleId: m.learning_module_id,
          title: m.title,
          description: m.description ?? '',
          subCategory: m.sub_category ?? '',
          progress: 'not started' as Progress,
          overallScore: null,
          evidence: null,
          rubricScores: {},
          chatHistory: [],
          isOwn: false,
          updatedAt: m.updated_at ?? new Date().toISOString(),
          moduleInstructions: m.ai_facilitator_instructions ?? null,
        }));

      setActivities([...mine, ...fromCatalog]);
    } catch (err) {
      console.error('[Solar] Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadActivities(profile.organizationId);
    setRefreshing(false);
  };

  const patchActivity = (dashboardId: string, patch: Partial<SolarActivity>) => {
    setActivities(prev => prev.map(a => (a.dashboardId === dashboardId ? { ...a, ...patch } : a)));
    setSession(prev => (prev && prev.dashboardId === dashboardId ? { ...prev, ...patch } : prev));
  };

  // Creates the learner's dashboard row the first time a catalog module is opened.
  const ensureDashboardRow = async (a: SolarActivity): Promise<string> => {
    if (a.dashboardId) return a.dashboardId;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('dashboard')
      .insert({
        user_id: user!.id,
        learning_module_id: a.learningModuleId,
        activity: a.title,
        title: a.title,
        category_activity: SOLAR_CATEGORY,
        sub_category: a.subCategory,
        progress: 'started',
        continent: profile.continent,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();
    if (!error && data) return data.id;
    if (error?.code === '23505') {
      // Row already exists (unique user + module) — reuse it.
      const { data: existing } = await supabase
        .from('dashboard').select('id')
        .eq('user_id', user!.id).eq('learning_module_id', a.learningModuleId)
        .maybeSingle();
      if (existing?.id) return existing.id;
    }
    throw error ?? new Error('Could not create dashboard row');
  };

  // ── Open / close a session ───────────────────────────────────────────────
  const openActivity = async (a: SolarActivity) => {
    if (a.progress === 'completed') return;
    try {
      const dashboardId = await ensureDashboardRow(a);
      if (a.progress === 'not started' || !a.dashboardId) {
        await supabase.from('dashboard').update({ progress: 'started', updated_at: new Date().toISOString() }).eq('id', dashboardId);
      }
      const opened: SolarActivity = { ...a, dashboardId, key: dashboardId, progress: 'started' };
      setActivities(prev => prev.map(x => (x.key === a.key ? opened : x)));
      setSession(opened);

      const history = a.chatHistory.length
        ? a.chatHistory
        : [{ role: 'assistant' as const, content: greetingFor(a.title, commLevel), timestamp: new Date() }];
      setChat(history);
      setLatestRubric(latestRubricIn(history, getSolarAreaBySubCategory(a.subCategory)));
      setReflection('');
    } catch (err) {
      console.error('[Solar] Could not open activity:', err);
      alert('Could not open this activity. Please try again.');
    }
  };

  const closeSession = () => {
    cancel();
    setSession(null);
    setChat([]);
    setInput('');
    setLatestRubric(null);
    setEvalResult(null);
  };

  const systemPrompt = useMemo(() => {
    if (!session || !sessionArea) return '';
    return buildSolarFacilitatorPrompt({
      area: sessionArea,
      moduleTitle: session.title,
      context: session.description,
      locale,
      communicationLevel: commLevel,
      baseline,
      moduleInstructions: session.isOwn ? null : session.moduleInstructions, // own modules: description already holds the context
    });
  }, [session, sessionArea, locale, commLevel, baseline]);

  // ── Chat turn ────────────────────────────────────────────────────────────
  const persistTurn = async (history: ChatMessage[], rubric: TurnRubric | null) => {
    if (!session?.dashboardId) return;
    const update: Record<string, any> = { chat_history: JSON.stringify(history), updated_at: new Date().toISOString() };
    let patch: Partial<SolarActivity> = { chatHistory: history };
    if (rubric) {
      const scores: ScoreMap = Object.fromEntries(
        Object.entries(rubric.scores).map(([k, v]) => [k, { score: v.score, evidence: v.evidence }])
      );
      const overall = minScore(scores);
      update.rubric_scores = scores;
      update.certification_evaluation_score = overall;
      patch = { ...patch, rubricScores: scores, overallScore: overall };
    }
    const { error } = await supabase.from('dashboard').update(update).eq('id', session.dashboardId);
    if (error) console.warn('[Solar] Turn save failed (non-blocking):', error);
    patchActivity(session.dashboardId, patch);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || submitting || !session) return;
    if (listening) { try { recognitionRef.current?.stop(); } catch { /* noop */ } }

    const history: ChatMessage[] = [...chat, { role: 'user', content: text, timestamp: new Date() }];
    setChat(history);
    setInput('');
    setSubmitting(true);

    try {
      const reply = await chatText({
        page: SOLAR_CHAT_PAGE,
        system: systemPrompt,
        // Drop the canned greeting; cap context so long sessions stay affordable.
        messages: history.slice(1).slice(-24).map(m => ({ role: m.role, content: m.content })),
        max_tokens: 900,
        temperature: 0.6,
      });
      const content = reply?.trim() || 'Sorry, I could not answer that. Please try again.';
      const final: ChatMessage[] = [...history, { role: 'assistant', content, timestamp: new Date() }];
      setChat(final);

      const { text: visible, rubric } = splitRubric(content, sessionArea);
      if (rubric) setLatestRubric(rubric);
      if (voiceOn) speak(visible.replace(/[*_#>`]/g, ''));
      await persistTurn(final, rubric);
    } catch (err) {
      console.error('[Solar] Chat error:', err);
      const final: ChatMessage[] = [...history, { role: 'assistant', content: 'I had a technical problem. Please send that again.', timestamp: new Date() }];
      setChat(final);
      await persistTurn(final, null);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleVoiceInput = () => {
    const rec = recognitionRef.current;
    if (!rec) { alert('Voice input is not supported in this browser.'); return; }
    if (listening) { rec.stop(); setListening(false); }
    else { try { rec.start(); setListening(true); } catch { setListening(false); } }
  };

  const improveEnglish = async () => {
    if (!input.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const result = await chatJSON({
        page: SOLAR_CHAT_PAGE,
        system: 'You are an English language coach. Return only valid JSON.',
        messages: [{
          role: 'user',
          content: `A student in ${locale.country} wrote: "${input.trim()}"
Rewrite it as clear, grammatical English that keeps their meaning, voice, and ideas.
NEVER change any number, amount, measurement, or calculation — copy every number exactly as written, even if it looks wrong.
Return ONLY JSON: {"improved_text": "..."}`,
        }],
        max_tokens: 600,
        temperature: 0.2,
      });
      if (result?.improved_text) setInput(result.improved_text);
    } catch (err) {
      console.error('[Solar] Improve English error:', err);
    } finally {
      setIsImproving(false);
    }
  };

  // ── Full evaluation (Evaluate me / Complete session) ─────────────────────
  const runFullAssessment = async (reflectionText?: string): Promise<FullAssessment | null> => {
    if (!sessionArea) return null;
    const transcript = chat
      .slice(-30)
      .map(m => `${m.role === 'assistant' ? 'Trainer' : 'Learner'}: ${splitRubric(m.content).text.slice(0, 800)}`)
      .join('\n\n');
    try {
      const raw = await chatJSON({
        page: SOLAR_CHAT_PAGE,
        system: 'You are a fair, evidence-based solar installation skills assessor. Respond only with valid JSON.',
        messages: [{
          role: 'user',
          content: buildSolarAssessmentPrompt({ area: sessionArea, transcript, reflection: reflectionText, locale, communicationLevel: commLevel }),
        }],
        max_tokens: 1800,
        temperature: 0.2,
      });
      return normalizeAssessment(typeof raw === 'string' ? JSON.parse(raw) : raw, sessionArea);
    } catch (err) {
      console.error('[Solar] Full assessment failed:', err);
      return null;
    }
  };

  const persistAssessment = async (a: FullAssessment, markComplete: boolean) => {
    if (!session?.dashboardId || !sessionArea) return;
    const scores: ScoreMap = Object.fromEntries(a.dimensions.map(d => [d.dimension, { score: d.score, evidence: d.evidence }]));
    const overall = minScore(scores) ?? 0;
    const evidence = a.dimensions.map(d => `${criterionLabel(sessionArea, d.dimension)}: ${d.evidence}`).join(' | ');
    const progress: Progress = markComplete ? 'completed' : 'started';

    const { error } = await supabase.from('dashboard').update({
      rubric_scores: scores,
      certification_evaluation_score: overall,
      certification_evaluation_evidence: evidence,
      chat_history: JSON.stringify(chat),
      progress,
      updated_at: new Date().toISOString(),
    }).eq('id', session.dashboardId);
    if (error) throw error;

    patchActivity(session.dashboardId, { rubricScores: scores, overallScore: overall, evidence, progress });

    if (user?.id) {
      saveEvaluation(user.id, {
        dashboardId: session.dashboardId,
        activityType: 'solar_engineering',
        overallScore: overall,
        maxScore: 3,
        evidence,
        criteria: a.dimensions.map(d => ({
          key: d.dimension,
          label: criterionLabel(sessionArea, d.dimension),
          score: d.score,
          evidence: d.evidence,
        })),
      }).catch(err => console.warn('[Solar] evaluations dual-write failed:', err));
    }
  };

  const evaluateNow = async () => {
    if (chat.length <= 1) return;
    setEvaluating(true);
    try {
      const result = await runFullAssessment(reflection || undefined);
      if (!result) throw new Error('No assessment');
      await persistAssessment(result, false);
      setEvalResult(result);
    } catch {
      alert('Evaluation failed. Please try again.');
    } finally {
      setEvaluating(false);
    }
  };

  // Completion rule: a session completes when every criterion is Proficient (2)
  // or higher — the same bar the in-chat banner and the certification use.
  const completeSession = async () => {
    const text = reflection.trim();
    if (text.length < 20) return;
    setShowComplete(false);
    setEvaluating(true);
    try {
      const result = await runFullAssessment(text);
      if (!result) throw new Error('No assessment');
      const passed = result.dimensions.every(d => d.score >= 2);
      await persistAssessment(result, passed);
      setEvalResult(result);
      if (passed) {
        const confetti = await import('canvas-confetti').catch(() => null);
        confetti?.default?.({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      }
    } catch {
      alert('Could not complete the session. Please try again.');
      setShowComplete(true);
    } finally {
      setEvaluating(false);
    }
  };

  // ── Create-your-own activity ─────────────────────────────────────────────
  const createActivity = async () => {
    if (!user?.id || !form.title.trim() || !form.situation.trim()) return;
    const area = getSolarArea(form.areaId) ?? SOLAR_AREAS[0];
    setCreating(true);
    try {
      const context = [
        `Situation: ${form.situation.trim()}`,
        form.moneyAngle.trim() && `Installation goal / livelihood angle: ${form.moneyAngle.trim()}`,
        form.location.trim() && `Location: ${form.location.trim()}`,
        form.constraints.trim() && `Constraints: ${form.constraints.trim()}`,
        form.people.trim() && `People affected: ${form.people.trim()}`,
      ].filter(Boolean).join('\n');

      const moduleId = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error: modErr } = await supabase.from('learning_modules').insert({
        learning_module_id: moduleId,
        title: form.title.trim(),
        description: context,
        category: SOLAR_CATEGORY,
        sub_category: area.subCategory,
        // Facilitation is built at runtime from src/lib/solarEngineering.ts,
        // so rubric or prompt improvements reach old modules automatically.
        ai_facilitator_instructions: null,
        ai_assessment_instructions: `Score ${area.title} criteria 0-3 from the conversation; check the learner's calculations and safety practice.`,
        metrics_for_success: `Proficient (2) or higher on: ${area.criteria.map(c => c.label).join(', ')}.`,
        outcomes: `Apply ${area.title} to: ${form.title.trim()}`,
        public: 0,
        grade_level: profile.gradeLevel ?? 4,
        created_at: now,
        updated_at: now,
        continent: profile.continent,
        organization_id: profile.organizationId,
        user_id: user.id,
        application: 1,
        learning_or_certification: 'learning',
      });
      if (modErr) throw modErr;

      const draft: SolarActivity = {
        key: `new-${moduleId}`, dashboardId: null, learningModuleId: moduleId,
        title: form.title.trim(), description: context, subCategory: area.subCategory,
        progress: 'not started', overallScore: null, evidence: null, rubricScores: {},
        chatHistory: [], isOwn: true, updatedAt: now, moduleInstructions: null,
      };
      setActivities(prev => [draft, ...prev]);
      setShowCreate(false);
      setActiveAreaId(area.id);
      setForm({ title: '', areaId: area.id, situation: '', moneyAngle: '', location: '', constraints: '', people: '' });
      await openActivity(draft);
    } catch (err) {
      console.error('[Solar] Create activity failed:', err);
      alert('Could not create your activity. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const areaActivities = activities.filter(a => a.subCategory === activeArea.subCategory);
  const statsFor = (area: SolarArea) => {
    const list = activities.filter(a => a.subCategory === area.subCategory);
    return {
      total: list.length,
      completed: list.filter(a => a.progress === 'completed').length,
      started: list.filter(a => a.progress === 'started').length,
    };
  };
  const simple = commLevel <= 1;

  // ─────────────────────────────────────────────────────────────────────────
  // Views
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout>
        <div className="py-16 text-center text-muted">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-accent mx-auto mb-4" />
          Loading activities…
        </div>
      </AppLayout>
    );
  }

  // ── Create view ──────────────────────────────────────────────────────────
  if (!session && showCreate) {
    const fieldCls = 'w-full border border-hair rounded-lg px-4 py-2.5 text-base bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent';
    const area = getSolarArea(form.areaId) ?? SOLAR_AREAS[0];
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <PlusCircle className="h-8 w-8 text-accent" />
                <h1 className="text-3xl font-bold text-ink">{simple ? 'Make Your Own Solar Activity' : 'Create Your Own Installation Activity'}</h1>
              </div>
              <p className="text-body mt-1">
                {simple ? 'Pick a real solar or wiring problem to practise.' : 'Practise with a real installation situation from a site, job, or a system you\'ve seen.'}
              </p>
            </div>
            <QuietButton onClick={() => setShowCreate(false)} icon={<ArrowLeft size={16} />}>Back</QuietButton>
          </div>

          <div className="bg-surface border border-hair border-l-4 border-l-accent rounded-2xl px-6 py-4 mb-6">
            <p className="font-semibold text-ink mb-1">💡 {simple ? 'Use a real site you know' : 'The best activities use real numbers'}</p>
            <p className="text-body text-sm">
              {simple
                ? `Think of a real roof, shop, or home you know that needs power: lights, a fridge, a phone-charging shop, a borehole pump.`
                : `Your trainer will ask you to work with actual watts, volts, and ${locale.currencyName} costs for the system. The more real the numbers, the more useful the practice.`}
            </p>
          </div>

          <div className="bg-card border border-hair rounded-2xl shadow-sm p-8 space-y-5">
            <div>
              <label className="block font-semibold text-ink mb-1">{simple ? 'Name of your activity' : 'Activity title'} <span className="text-red-500">*</span></label>
              <input className={fieldCls} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={simple ? 'e.g. Sizing a system for my phone-charging shop' : 'e.g. Should this cold-room switch to hybrid solar/generator?'} />
            </div>
            <div>
              <label className="block font-semibold text-ink mb-1">{simple ? 'What solar skill?' : 'Skill area'} <span className="text-red-500">*</span></label>
              <select className={fieldCls} value={form.areaId} onChange={e => setForm(f => ({ ...f, areaId: e.target.value }))}>
                {SOLAR_AREAS.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
              <p className="text-sm text-muted mt-1">Your trainer will score you on: {area.criteria.map(c => c.label).join(' and ')}.</p>
            </div>
            <div>
              <label className="block font-semibold text-ink mb-1">{simple ? 'What is the installation problem?' : 'Situation'} <span className="text-red-500">*</span></label>
              <textarea rows={3} className={`${fieldCls} resize-none`} value={form.situation} onChange={e => setForm(f => ({ ...f, situation: e.target.value }))}
                placeholder={simple
                  ? 'e.g. My uncle runs a phone-charging shop and the generator is too expensive to run all day.'
                  : `e.g. A cold-room owner spends ${locale.symbol}30,000 a week on diesel and wants to know if solar with battery backup can cut that cost.`} />
            </div>
            <div className="bg-surface border border-hair rounded-xl p-4">
              <label className="block font-semibold text-ink mb-1">💼 {simple ? 'What should the system power?' : 'Installation goal or livelihood angle (strongly recommended)'}</label>
              <textarea rows={2} className={`${fieldCls} resize-none bg-card`} value={form.moneyAngle} onChange={e => setForm(f => ({ ...f, moneyAngle: e.target.value }))}
                placeholder={simple ? 'e.g. Run lights, a fan, and phone chargers all evening.' : 'e.g. Keep the cold-room running through a full grid outage without spoiling stock.'} />
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">Location</label>
                <input className={fieldCls} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Oloibiri" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">What makes it hard?</label>
                <input className={fieldCls} value={form.constraints} onChange={e => setForm(f => ({ ...f, constraints: e.target.value }))} placeholder="e.g. frequent cloudy days" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">Who is affected?</label>
                <input className={fieldCls} value={form.people} onChange={e => setForm(f => ({ ...f, people: e.target.value }))} placeholder="e.g. my family's shop" />
              </div>
            </div>
            <div className="flex justify-end">
              <QuietButton onClick={createActivity} disabled={creating || !form.title.trim() || !form.situation.trim()}
                loading={creating} icon={<Plus size={16} />} variant="solid" className="px-8 py-3">
                {creating ? 'Creating…' : simple ? 'Start My Activity →' : 'Create & Start'}
              </QuietButton>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Session view ─────────────────────────────────────────────────────────
  if (session && sessionArea) {
    const scores = latestRubric?.scores ?? {};
    const vals = sessionArea.criteria.map(c => scores[c.key]?.score).filter((s): s is number => typeof s === 'number');
    const allProficient = vals.length === sessionArea.criteria.length && vals.every(s => s >= 2);
    const allAdvanced = allProficient && vals.every(s => s === 3);

    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto px-6 py-8">
          <QuietButton onClick={closeSession} icon={<ArrowLeft size={16} />} className="mb-4">Back to activities</QuietButton>

          <div className="bg-card border border-hair rounded-2xl shadow-sm p-6 mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-accent mb-1">{AREA_ICONS[sessionArea.icon]}<span className="text-sm font-semibold">{sessionArea.title}</span></div>
              <h1 className="text-2xl font-bold text-ink">{session.title}</h1>
              {!session.isOwn && session.description && <p className="text-body mt-1">{session.description}</p>}
            </div>
            <div className="text-right shrink-0">
              {session.overallScore != null && (
                <>
                  <div className="text-2xl font-bold text-ink">{session.overallScore}/3</div>
                  <div className="text-sm text-muted">{SCORE_LABELS[session.overallScore]}</div>
                </>
              )}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <label className="inline-flex items-center gap-2 rounded-full border border-hair bg-card px-3 py-1.5 cursor-pointer">
              <input type="checkbox" checked={voiceOn} onChange={() => { if (voiceOn) cancel(); setVoiceOn(!voiceOn); }} className="accent-accent w-4 h-4" />
              <span className="text-body font-medium">Voice output</span>
            </label>
            {voiceOn && (
              <div className="flex rounded-full overflow-hidden border border-hair">
                {(['english', 'pidgin'] as const).map(mode => (
                  <button key={mode} onClick={() => setVoiceMode(mode)}
                    className={classNames('px-3 py-1.5 text-xs font-semibold', voiceMode === mode ? 'bg-accent text-white' : 'bg-card text-body hover:bg-paper')}>
                    {mode === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
                  </button>
                ))}
              </div>
            )}
            {listening && <span className="text-red-600 text-xs font-medium animate-pulse">● Listening…</span>}
          </div>

          {fallbackText && <div className="mb-4"><VoiceFallback text={fallbackText} onDismiss={clearFallback} /></div>}

          <ChatSurface
            title="Solar Trainer"
            legend={
              <span className="text-xs text-muted">Scores out of 3 · 2 = Proficient ✓</span>
            }
            messages={chat}
            renderAssistant={(content: string) => {
              const { text, rubric } = splitRubric(content, sessionArea);
              const weakest = rubric?.weakest ? rubric.scores[rubric.weakest] : undefined;
              return (
                <>
                  <div className="text-base"><ReactMarkdown components={markdown}>{text}</ReactMarkdown></div>
                  {rubric && (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {sessionArea.criteria.map(c => {
                          const s = rubric.scores[c.key];
                          return s ? (
                            <span key={c.key} className={classNames('px-2 py-0.5 rounded-full text-xs font-medium border', scorePill(s.score))}>
                              {c.label}: {s.score}/3
                            </span>
                          ) : null;
                        })}
                      </div>
                      {weakest?.improve && (
                        <div className="rounded-xl border border-hair bg-paper px-3 py-2 text-sm text-body">
                          <span className="font-semibold text-ink">💡 To level up:</span> {weakest.improve}
                        </div>
                      )}
                      <button type="button" onClick={() => setRubricDetail(rubric)} className="text-xs font-semibold text-accent hover:underline">
                        📊 View scores
                      </button>
                    </div>
                  )}
                  <AIPidginCoachWrapper englishText={text} />
                </>
              );
            }}
            submitting={submitting}
            transcriptRef={transcriptRef}
            transcriptHeightClassName="h-[32rem]"
            value={input}
            onChange={setInput}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            onSubmit={sendMessage}
            disabled={submitting}
            notice={
              <div className="mb-3 space-y-2">
                <p className="text-sm text-muted">💡 Show your working when you calculate — your trainer checks the numbers and the safety practice. Ask any question anytime.</p>
                {allAdvanced ? (
                  <div className="rounded-xl border border-hair border-l-4 border-l-green-500 bg-paper px-4 py-3 text-sm">
                    <p className="font-semibold text-ink">🏆 Advanced on every criterion!</p>
                    <p className="text-body">Select <strong>Complete session</strong> to save your result.</p>
                  </div>
                ) : allProficient ? (
                  <div className="rounded-xl border border-hair border-l-4 border-l-blue-500 bg-paper px-4 py-3 text-sm">
                    <p className="font-semibold text-ink">✅ Proficient on every criterion</p>
                    <p className="text-body">Keep going for Advanced, or select <strong>Complete session</strong> to finish.</p>
                  </div>
                ) : null}
              </div>
            }
            composerActions={
              <>
                <QuietButton onClick={toggleVoiceInput} icon={<Mic size={14} />}
                  className={listening ? 'border-red-300 text-red-600' : undefined}>
                  {listening ? 'Stop' : 'Voice'}
                </QuietButton>
                <QuietButton onClick={improveEnglish} disabled={!input.trim() || isImproving} loading={isImproving} icon={<Wand2 size={14} />}>
                  Improve my English
                </QuietButton>
              </>
            }
            sessionActions={
              <>
                <QuietButton onClick={evaluateNow} disabled={chat.length <= 1 || evaluating} loading={evaluating} icon={<Save size={14} />}>
                  Evaluate me / Save
                </QuietButton>
                <QuietButton onClick={() => setShowComplete(true)} disabled={chat.length <= 1 || evaluating} icon={<CheckCircle size={14} />} variant="solid">
                  Complete session
                </QuietButton>
              </>
            }
          />
        </div>

        {/* Per-turn score detail */}
        {rubricDetail && (
          <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={() => setRubricDetail(null)}>
            <div className="bg-card rounded-2xl border border-hair shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-ink">📊 Your scores so far</h3>
                <button onClick={() => setRubricDetail(null)} className="text-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              <EvaluationPanel
                title={sessionArea.title}
                overallScore={minScore(rubricDetail.scores) ?? 0}
                maxScore={3}
                criteria={sessionArea.criteria.filter(c => rubricDetail.scores[c.key]).map(c => ({
                  key: c.key,
                  label: c.label,
                  score: rubricDetail.scores[c.key].score,
                  evidence: [rubricDetail.scores[c.key].evidence, rubricDetail.scores[c.key].improve && `To improve: ${rubricDetail.scores[c.key].improve}`].filter(Boolean).join(' — '),
                }))}
              />
            </div>
          </div>
        )}

        {/* Complete-session reflection */}
        {showComplete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
            <div className="bg-card rounded-2xl border border-hair shadow-lg w-full max-w-lg">
              <div className="px-6 py-4 border-b border-hair flex items-center justify-between">
                <h3 className="font-semibold text-ink flex items-center gap-2"><BookOpen className="h-5 w-5 text-accent" /> Complete your session</h3>
                <button onClick={() => setShowComplete(false)} className="text-muted hover:text-ink"><X size={18} /></button>
              </div>
              <div className="px-6 py-5 space-y-3">
                <p className="text-sm text-body">
                  {simple
                    ? 'Tell us: What did you learn about solar systems today? What was hard? What will you check first on a real site?'
                    : 'Reflect before we score: what did you figure out, what was hardest, and what will you check first on a real installation?'}
                </p>
                <textarea rows={6} autoFocus value={reflection} onChange={e => setReflection(e.target.value)}
                  className="w-full border border-hair rounded-xl px-4 py-3 text-sm bg-paper resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder={`e.g. I learned that the wire gauge matters more than I thought once the cable run gets long. Next time I will calculate voltage drop before choosing cable.`} />
                <p className="text-xs text-muted">You pass the session when every criterion is Proficient (2) or higher.</p>
              </div>
              <div className="px-6 pb-5 flex justify-end gap-3">
                <QuietButton onClick={() => setShowComplete(false)}>Cancel</QuietButton>
                <QuietButton onClick={completeSession} disabled={reflection.trim().length < 20} icon={<Star size={15} />} variant="solid">
                  Save &amp; complete
                </QuietButton>
              </div>
            </div>
          </div>
        )}

        {/* Full evaluation result */}
        {evalResult && (
          <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl border border-hair shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
              <h3 className="text-lg font-semibold text-ink mb-4">Evaluation results</h3>
              <EvaluationPanel
                title="Session score"
                overallScore={Math.min(...evalResult.dimensions.map(d => d.score))}
                maxScore={3}
                criteria={evalResult.dimensions.map(d => ({
                  key: d.dimension, label: criterionLabel(sessionArea, d.dimension), score: d.score, evidence: d.evidence,
                }))}
              />
              {evalResult.advice && (
                <div className="mt-6 border-t border-hair pt-5">
                  <h4 className="font-semibold text-ink mb-2 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-accent" /> Advice</h4>
                  <div className="bg-surface rounded-lg p-4 text-sm text-body"><ReactMarkdown components={markdown}>{evalResult.advice}</ReactMarkdown></div>
                </div>
              )}
              <div className="mt-6 flex justify-end gap-3">
                {session.progress === 'completed' && (
                  <Link to="/certifications/solar-engineering" className="text-sm font-semibold text-accent hover:underline self-center">
                    Ready? Try the certification →
                  </Link>
                )}
                <QuietButton variant="solid" onClick={() => {
                  const done = session.progress === 'completed';
                  setEvalResult(null);
                  if (done) closeSession();
                }}>
                  Continue
                </QuietButton>
              </div>
            </div>
          </div>
        )}
      </AppLayout>
    );
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  const own = areaActivities.filter(a => a.isOwn);
  const others = areaActivities.filter(a => !a.isOwn);
  const stats = statsFor(activeArea);

  const renderRow = (a: SolarActivity) => {
    const done = a.progress === 'completed';
    return (
      <div key={a.key} onClick={() => !done && openActivity(a)}
        className={classNames('p-5 transition-colors', done ? 'bg-paper opacity-60 cursor-not-allowed' : 'hover:bg-surface cursor-pointer')}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {done ? <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
              : a.progress === 'started' ? <Clock className="h-6 w-6 text-yellow-500 shrink-0" />
              : <Circle className="h-6 w-6 text-gray-400 shrink-0" />}
            <div className="min-w-0">
              <h4 className={classNames('text-lg font-medium', done ? 'text-muted' : 'text-ink')}>
                {a.title}{done && <span className="ml-2 text-sm font-normal">✓ Completed</span>}
              </h4>
              {!a.isOwn && a.description && <p className="text-sm text-body line-clamp-1">{a.description}</p>}
            </div>
          </div>
          <span className="text-xs text-muted shrink-0">{a.progress}</span>
        </div>
        {Object.keys(a.rubricScores).length > 0 && (
          <div className="mt-3 ml-10 flex flex-wrap gap-1.5">
            {activeArea.criteria.map(c => {
              const s = a.rubricScores[c.key];
              return s ? (
                <span key={c.key} className={classNames('px-2 py-0.5 rounded-full text-xs font-medium border', scorePill(s.score))}>
                  {c.label}: {s.score}/3
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold text-ink mb-1">{simple ? 'Solar Skills' : 'Solar Engineering & Installation'}</h1>
            <p className="text-lg text-body">
              {simple ? 'Practise with your solar trainer using real installation examples' : 'Build the site-assessment, sizing, electrical, and installation skills to design and install solar/battery systems safely — with a trainer who works in your currency and climate'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <QuietButton onClick={refresh} icon={<RefreshCw size={14} />} loading={refreshing} className="text-xs px-3 py-1.5">Refresh</QuietButton>
            <Link to="/certifications/solar-engineering"
              className="flex items-center gap-1.5 border border-hair bg-card text-body hover:text-accent rounded-full px-3 py-1.5 text-xs font-semibold">
              <Award size={13} /> Certification
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          {SOLAR_AREAS.map(area => {
            const s = statsFor(area);
            const active = area.id === activeAreaId;
            return (
              <button key={area.id} onClick={() => setActiveAreaId(area.id)}
                className={classNames('flex flex-col items-start gap-3 p-5 rounded-xl border text-left transition-colors',
                  active ? 'bg-surface border-accent/40 shadow-sm' : 'bg-card border-hair hover:border-accent/30')}>
                <div className={classNames('p-2 rounded-lg text-accent', active ? 'bg-accent/10' : 'bg-paper')}>{AREA_ICONS[area.icon]}</div>
                <div>
                  <h3 className="font-semibold text-ink">{area.title}</h3>
                  <p className="text-sm text-body mt-1">{area.description}</p>
                  <p className="text-xs text-muted mt-2">{s.total} activities{s.completed ? ` · ${s.completed} done` : ''}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-card border border-hair rounded-2xl shadow-sm p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-surface rounded-lg text-accent">{AREA_ICONS[activeArea.icon]}</div>
            <div>
              <h2 className="text-xl font-semibold text-ink">{activeArea.title}</h2>
              <p className="text-body">You're scored on: {activeArea.criteria.map((c, i) => (
                <React.Fragment key={c.key}>{i > 0 && ' and '}<strong>{c.label}</strong></React.Fragment>
              ))}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[['Total', stats.total], ['Completed', stats.completed], ['In progress', stats.started]].map(([label, n]) => (
              <div key={label as string} className="text-center p-4 bg-paper rounded-lg border border-hair">
                <div className="text-3xl font-bold text-ink">{n}</div>
                <div className="text-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-hair rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-hair bg-surface flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-ink">Activities — {activeArea.title}</h3>
              <p className="text-body">{simple ? 'Click an activity to begin' : 'Pick an activity, or create one from your own installation situation'}</p>
            </div>
            <QuietButton variant="solid" icon={<Plus size={16} />} className="whitespace-nowrap"
              onClick={() => { setForm(f => ({ ...f, areaId: activeArea.id })); setShowCreate(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              {simple ? '+ Make My Own' : 'Create your own'}
            </QuietButton>
          </div>

          {areaActivities.length === 0 ? (
            <div className="p-8 text-center">
              <Target className="h-10 w-10 text-muted mx-auto mb-3" />
              <p className="text-body font-semibold">No activities here yet.</p>
              <p className="text-sm text-muted">Create your own from a real installation situation.</p>
            </div>
          ) : (
            <>
              {own.length > 0 && (
                <>
                  <div className="px-6 py-3 bg-surface border-b border-hair text-sm font-bold text-ink uppercase tracking-wide">Your activities</div>
                  <div className="divide-y divide-hair">{own.map(renderRow)}</div>
                </>
              )}
              {others.length > 0 && (
                <>
                  <div className="px-6 py-3 bg-surface border-b border-hair text-sm font-bold text-ink uppercase tracking-wide">Practice activities</div>
                  <div className="divide-y divide-hair">{others.map(renderRow)}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default SolarEngineeringPage;
