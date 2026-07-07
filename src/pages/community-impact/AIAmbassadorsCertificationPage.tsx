// src/pages/community-impact/AIAmbassadorsCertificationPage.tsx
//
// AI Ambassadors Certification
// Assesses whether a student can teach community members about AI effectively.
//
// Portfolio structure (two parts):
//   WRITTEN  — teaching philosophy, best plain-language explanation, objection response
//   SESSIONS — at least 2 live in-page teaching sessions with different personas
//              (student is the teacher; AI plays the community member)
//
// Evaluation: 5 rubric dimensions, 0-3 each. Proficient (≥2) on all = certified.
//
// Dashboard columns (new):
//   ambassador_cert_session_id  text
//   ambassador_cert_portfolio   jsonb  — written sections + session transcripts
//   ambassador_cert_evaluation  jsonb  — per-criterion scores
//
// Activity stored as: 'AI Ambassadors Certification'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import {
  Users, Award, Trophy, Loader2, Download, AlertCircle,
  Volume2, VolumeX, Star, CheckCircle, ArrowRight, RefreshCw,
  PenLine, MessageSquare, Lightbulb, ShieldCheck, Globe2,
  Send, Mic, MicOff, X, ChevronRight, BookOpen, Heart,
} from 'lucide-react';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';

// ─── Background — cursor-driven ripple distortion (no sidebar offset) ─────────
// Cert page uses Navbar only (no AppLayout sidebar), so background spans
// full width: fixed top-16 left-0 right-0 bottom-0.

const AmbassadorCertBackground: React.FC = () => {
  const [mouse, setMouse]   = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      setMouse({ x: Math.max(0, e.clientX), y: Math.max(0, e.clientY - 64) });
      setMoving(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMoving(false), 120);
    };
    window.addEventListener('mousemove', h);
    return () => {
      window.removeEventListener('mousemove', h);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const img = "url('/background_AI_ambassador.png')";

  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="ambassador-cert-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="8" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="55" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>

      {/* Base layer — static image with dark overlay */}
      <div
        className="fixed top-16 left-0 right-0 bottom-0"
        style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/75 via-teal-900/65 to-green-900/75" />
        <div className="absolute inset-0 bg-black/15" />
      </div>

      {/* Distortion spotlight — only while mouse is moving */}
      {moving && (
        <div
          className="fixed top-16 left-0 right-0 bottom-0 pointer-events-none"
          style={{
            backgroundImage: img,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 1,
            filter: 'url(#ambassador-cert-distortion)',
            WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`,
            maskImage:        `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/75 via-teal-900/65 to-green-900/75" />
        </div>
      )}
    </>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssessmentScore {
  assessment_name: string;
  score: number | null;
  evidence: string | null;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface TeachingSession {
  personaId: string;
  personaName: string;
  personaEmoji: string;
  transcript: ChatMsg[];
  turnCount: number;
  completedAt: string;
}

interface AmbassadorPortfolio {
  // Written components
  teachingPhilosophy: string;
  bestExplanation: string;
  objectionResponse: string;
  // Live sessions
  sessions: TeachingSession[];
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';
type BuildTab = 'written' | 'sessions';

// ─── Personas (same 5 as AIAmbassadorsPage) ───────────────────────────────────

interface Persona {
  id: string;
  name: string;
  age: string;
  occupation: string;
  emoji: string;
  colour: string;
  openingLine: string;
  systemPrompt: string;
}

const PERSONAS: Persona[] = [
  {
    id: 'mama_grace',
    name: 'Mama Grace',
    age: '52',
    occupation: 'Market trader — sells cloth and household goods',
    emoji: '👩🏾‍🦱',
    colour: 'from-amber-600 to-orange-600',
    openingLine: `Good afternoon! My son said I should come and listen to you. He says you know about this "AI" thing. Honestly, I do not understand why I need it. My market is fine as it is.`,
    systemPrompt: `You are Mama Grace, a 52-year-old market trader from Oloibiri, Bayelsa State, Nigeria. You sell cloth and household goods at the local market and have done so for 25 years. You are polite but skeptical. You speak simple, warm Nigerian English, sometimes slipping in Pidgin phrases.

PERSONALITY: You are proud of your market success and suspicious of anything that might threaten it. You worry about your customers and your relationships with them. You warm up slowly when someone gives a genuinely useful, practical example.

WHAT CHANGES YOUR MIND: Specific examples of how AI could help you write better WhatsApp messages to customers; showing AI can help check prices at other markets; explaining AI doesn't replace you — it helps YOU serve customers better; speaking simply, without jargon.

WHAT KEEPS YOU SKEPTICAL: Technical talk, vague benefits, any suggestion AI could replace human relationships, rushing past your questions.

Ask real questions like: "But how does it know about MY market?", "What if it gives me wrong prices and I lose money?", "Will my customers know I am using a machine to write to them? Will they feel cheated?"

Stay completely in character. Keep responses 2-4 sentences. Occasionally express small victories: "Ah! So it is like having a helper who knows everything? Interesting..."`,
  },
  {
    id: 'bro_emeka',
    name: 'Bro Emeka',
    age: '26',
    occupation: 'Fisherman on the Kolo Creek',
    emoji: '👨🏾‍🦱',
    colour: 'from-blue-600 to-cyan-600',
    openingLine: `Hey! So you are the one teaching about AI? I hear about it on TikTok but honestly, bro, I am just a fisherman. What will AI do for someone like me? Catch fish for me?`,
    systemPrompt: `You are Emeka, a 26-year-old fisherman from Oloibiri who works on Kolo Creek. You are young, smartphone-literate (YouTube, TikTok, WhatsApp), and curious — but you genuinely doubt that AI is relevant to your life. You speak casual Nigerian English and Pidgin freely.

PERSONALITY: You dismiss yourself ("I'm just a fisherman") but you're actually smart. Genuinely curious when something concrete comes up. Skeptical about cost — money is always tight. Worried about network reliability on the creek.

WHAT GETS YOU INTERESTED: Weather forecasting for the creek, checking fish prices in Yenagoa before selling, identifying contaminated fish, writing good messages to city buyers.

WHAT LEAVES YOU COLD: Abstract explanations of "artificial intelligence" and "data", city-centric examples, anything requiring a laptop.

Ask: "Na free? Or dem go charge me money?", "Wetin happen if the AI give me wrong weather and the boat capsize?", "My papa say technology spoil the young people — how I go take explain am to am?"

Stay in character. Keep responses conversational, 2-4 sentences. Get excited when something concrete and relevant is shown.`,
  },
  {
    id: 'aunty_patience',
    name: 'Aunty Patience',
    age: '45',
    occupation: 'Church administrator and Sunday school coordinator',
    emoji: '👩🏾',
    colour: 'from-purple-600 to-violet-600',
    openingLine: `Good day to you. Sister Ngozi from the women's group said you could explain this AI they are talking about. I have been praying on whether these things are of God or not. My pastor is not sure. But I am open to listen.`,
    systemPrompt: `You are Aunty Patience, a 45-year-old church administrator from Oloibiri. You coordinate Sunday school and the women's fellowship. You have a smartphone and use it for church WhatsApp groups and gospel music. You are spiritually minded and filter new things through a faith lens.

PERSONALITY: Thoughtful and prayerful before adopting anything new. Not hostile to technology but wants to understand its moral dimension. Speaks formal, dignified Nigerian English. Warms up when AI is connected to serving the church or the community.

WHAT INTERESTS YOU: Using AI to write better Bible study materials or Sunday school lessons; helping families in need by finding resources; organizing the church women's program better.

WHAT CONCERNS YOU: Whether AI is "of God"; privacy (sharing personal things with a machine); the content AI might produce being inappropriate; young people being misled.

Ask: "Can AI help me write a sermon outline without it being ungodly?", "What if the AI says something against our faith?", "How do I know it is not listening to my private conversations?", "Is this something even an uneducated person like me can use?"

Stay in character. Be gracious but probe ethical concerns. Warm up when spiritual and community uses are explained.`,
  },
  {
    id: 'mr_biodun',
    name: 'Mr. Biodun',
    age: '38',
    occupation: 'Primary school teacher (Classes 4–6)',
    emoji: '👨🏾‍🏫',
    colour: 'from-green-600 to-teal-600',
    openingLine: `Hello! I heard about your AI session. I am a teacher here — Classes 4 to 6. I have been reading a little about AI. My concern is what it means for education. If AI can do everything, what will I teach? And what will the children actually learn to do themselves?`,
    systemPrompt: `You are Mr. Biodun, a 38-year-old primary school teacher in Oloibiri. You teach Classes 4 to 6. You are educated, thoughtful, and genuinely engaged — but you have real concerns about AI's impact on education and children's development.

PERSONALITY: Professional and articulate. Curious and somewhat tech-aware. You have real concerns about plagiarism, children becoming dependent on AI, and the devaluation of teachers. You speak formal Nigerian English.

WHAT INTERESTS YOU: AI tools that help you plan better lessons, give feedback on student writing, explain difficult concepts in simpler ways, or help you find teaching resources.

WHAT CONCERNS YOU: Students using AI to cheat; AI replacing teachers; AI giving wrong information that students accept without question; children losing the ability to think for themselves.

Ask: "If I give students AI to write their essays, what are they actually learning?", "How do I know the information AI gives is correct and not fabricated?", "Can AI adapt to the way our children learn here — in Ijaw areas, with English as a second language?", "What do you say to parents who think AI is making children lazy?"

Stay in character. Push back seriously on educational concerns. Warm up when AI is shown as a teacher's tool, not a replacement.`,
  },
  {
    id: 'chief_tamuno',
    name: 'Chief Tamuno',
    age: '67',
    occupation: 'Community elder and retired civil servant',
    emoji: '👴🏾',
    colour: 'from-gray-600 to-slate-700',
    openingLine: `Sit down, young one. They tell me you have something important to share about this artificial intelligence. I have lived through many things that were supposed to change everything — radio, then television, then mobile phones. Convince me this is different. And tell me what it means for our community, not just for business.`,
    systemPrompt: `You are Chief Tamuno, a 67-year-old community elder and retired civil servant in Oloibiri. You have seen many technologies come and go. You speak with authority and expect to be spoken to with respect. You care deeply about the community's long-term wellbeing, cultural continuity, and the next generation.

PERSONALITY: Measured, wise, and testing. You are not hostile but you require substance. You value what has proven itself over time. You speak careful, formal Nigerian English with occasional Ijaw references.

WHAT INTERESTS YOU: AI for preserving Ijaw language and stories; helping young people find livelihoods without leaving Oloibiri; supporting community governance and record-keeping; health information for elders.

WHAT CONCERNS YOU: Young people abandoning traditional values for technology; foreign companies profiting from community data; AI replacing human wisdom and judgment; the community becoming dependent on things it cannot maintain or control.

Ask: "Who controls this AI? Is it our people or foreigners?", "What happens to our data — our stories, our conversations — when we put them in this system?", "Can AI speak our language and understand our customs?", "In ten years, what will this have done to our young people — made them stronger or weaker?"

Stay in character. Be dignified and serious. Require real answers. Warm up only when community benefit is clearly and specifically articulated.`,
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'AI Ambassadors';
const CERT_ACTIVITY = 'AI Ambassadors Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const MIN_SESSIONS  = 2;

const EMPTY_PORTFOLIO: AmbassadorPortfolio = {
  teachingPhilosophy: '',
  bestExplanation: '',
  objectionResponse: '',
  sessions: [],
};

const WRITTEN_SECTIONS = [
  {
    key: 'teachingPhilosophy' as const,
    label: '1. Your Teaching Philosophy',
    icon: <BookOpen size={13} />,
    colour: 'border-emerald-500/40 bg-emerald-500/5',
    placeholder: 'Describe your approach to teaching someone who is new to AI and possibly skeptical. How do you begin? What do you prioritise? How do you read someone\'s concerns and adapt? Write at least 3–4 sentences.',
    tip: 'The best AI Ambassadors start by listening, not explaining. Describe how you connect AI to the specific person\'s life before you explain what AI is.',
    rows: 4,
  },
  {
    key: 'bestExplanation' as const,
    label: '2. Your Best Plain-Language Explanation of AI',
    icon: <Lightbulb size={13} />,
    colour: 'border-blue-500/40 bg-blue-500/5',
    placeholder: 'Write the clearest, simplest explanation of what AI is that you could give to anyone in your community — a market trader, an elder, a fisherman. No jargon. No technical terms. Use an analogy if it helps. Aim for something a 10-year-old could understand.',
    tip: 'Avoid words like "algorithm", "data", "neural network", "machine learning". If you wouldn\'t say it to your grandmother, don\'t write it here.',
    rows: 4,
  },
  {
    key: 'objectionResponse' as const,
    label: '3. Handling the Hardest Objection',
    icon: <ShieldCheck size={13} />,
    colour: 'border-violet-500/40 bg-violet-500/5',
    placeholder: 'Choose one of these objections and write how you would respond:\n  A) "AI will take my job and my customers"\n  B) "I am too old to learn this"\n  C) "This is made by foreigners who don\'t understand our community"\n\nWrite a full, empathetic response — acknowledge the concern, then address it specifically.',
    tip: 'The best response starts by agreeing with the emotion: "You are right to think carefully about this." Then address the specific fear with a concrete local example.',
    rows: 5,
  },
];

const RUBRIC_DIMENSIONS = [
  {
    id: 'plain_language',
    label: 'Plain-Language Explanation',
    desc: 'Explains AI clearly without jargon; uses analogies appropriate for the person',
  },
  {
    id: 'local_relevance',
    label: 'Local Relevance & Examples',
    desc: 'Connects AI to the specific person\'s life, work, and community context',
  },
  {
    id: 'resistance',
    label: 'Handling Resistance & Objections',
    desc: 'Acknowledges concerns empathetically; provides specific, grounded responses',
  },
  {
    id: 'next_step',
    label: 'Practical Next Step',
    desc: 'Leaves the community member with one concrete, achievable action',
  },
  {
    id: 'cultural_respect',
    label: 'Respect & Cultural Awareness',
    desc: 'Honours the person\'s existing knowledge, dignity, and community context',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20'    };
  if (s === 3)    return { text: 'Advanced',     color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'    };
  if (s === 1)    return { text: 'Emerging',     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   };
  return               { text: 'No Evidence',  color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30'     };
};

const writtenFilled = (p: AmbassadorPortfolio) =>
  [p.teachingPhilosophy, p.bestExplanation, p.objectionResponse].filter(v => v.trim().length > 30).length;

const portfolioReady = (p: AmbassadorPortfolio) =>
  writtenFilled(p) === 3 && p.sessions.length >= MIN_SESSIONS;

// ─── Score Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  const pct = score === null ? 0 : (score / 3) * 100;
  const col = score === null ? '#6B7280' : score === 3 ? '#10B981' : score === 2 ? '#3B82F6' : score === 1 ? '#F59E0B' : '#EF4444';
  const r = 16; const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex-shrink-0" style={{ width: 44, height: 44 }}>
      <svg width={44} height={44} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="#374151" strokeWidth={4} />
        <circle cx={22} cy={22} r={r} fill="none" stroke={col} strokeWidth={4}
          strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: col }}>
        {score === null ? '?' : `${score}/3`}
      </span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AIAmbassadorsCertificationPage: React.FC = () => {
  const { user } = useAuth();
  const [view, setView]                         = useState<ViewMode>('overview');
  const [buildTab, setBuildTab]                 = useState<BuildTab>('written');
  const [portfolio, setPortfolio]               = useState<AmbassadorPortfolio>(EMPTY_PORTFOLIO);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [sessionId]                             = useState(() => makeId());
  const [certName, setCertName]                 = useState('');
  const [isEvaluating, setIsEvaluating]         = useState(false);
  const [isGenCert, setIsGenCert]               = useState(false);
  const [evalError, setEvalError]               = useState('');
  const [dashboardRowId, setDashboardRowId]     = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking]             = useState(false);
  const [speechOn, setSpeechOn]                 = useState(true);
  const speechSynth                             = typeof window !== 'undefined' ? window.speechSynthesis : null;

  // Active teaching session state
  const [activePersona, setActivePersona]       = useState<Persona | null>(null);
  const [sessionMessages, setSessionMessages]   = useState<ChatMsg[]>([]);
  const [inputText, setInputText]               = useState('');
  const [isSending, setIsSending]               = useState(false);
  const [isListening, setIsListening]           = useState(false);
  const [isInitiating, setIsInitiating]         = useState(false);
  const chatEndRef                              = useRef<HTMLDivElement>(null);
  const inputRef                                = useRef<HTMLTextAreaElement>(null);
  const recognitionRef                          = useRef<any>(null);

  const allProficient = assessmentScores.length === RUBRIC_DIMENSIONS.length &&
    assessmentScores.every(s => s.score !== null && s.score >= 2);

  const overallScore = assessmentScores.length > 0
    ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length
    : null;

  // ── Speech ──────────────────────────────────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!speechOn || !speechSynth) return;
    speechSynth.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 300));
    const voices = speechSynth.getVoices();
    const voice = voices.find(v => v.lang === 'en-NG') || voices.find(v => v.lang.startsWith('en'));
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    utt.rate = 0.87;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => setIsSpeaking(false);
    speechSynth.speak(utt);
  }, [speechOn, speechSynth]);

  const stopSpeaking = useCallback(() => {
    speechSynth?.cancel();
    setIsSpeaking(false);
  }, [speechSynth]);

  useEffect(() => {
    const last = sessionMessages[sessionMessages.length - 1];
    if (last?.role === 'assistant') speak(last.content);
  }, [sessionMessages, speak]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionMessages]);

  // ── Dashboard persistence ───────────────────────────────────────────────────

  const saveToDashboard = useCallback(async (
    port: AmbassadorPortfolio,
    scores: AssessmentScore[] = [],
  ) => {
    if (!user?.id) return;
    const payload = {
      user_id:                    user.id,
      activity:                   CERT_ACTIVITY,
      category_activity:          'Community Impact',
      ambassador_cert_session_id: sessionId,
      ambassador_cert_portfolio:  port,
      ambassador_cert_evaluation: scores,
      progress:                   allProficient ? 'completed' : 'started',
      updated_at:                 new Date().toISOString(),
    };
    if (dashboardRowId) {
      await supabase.from('dashboard').update(payload).eq('id', dashboardRowId);
    } else {
      const { data } = await supabase.from('dashboard')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select('id').single();
      if (data?.id) setDashboardRowId(data.id);
    }
  }, [user?.id, sessionId, dashboardRowId, allProficient]);

  // ── Written portfolio helpers ────────────────────────────────────────────────

  const setWritten = (key: keyof Pick<AmbassadorPortfolio, 'teachingPhilosophy' | 'bestExplanation' | 'objectionResponse'>, value: string) => {
    setPortfolio(prev => ({ ...prev, [key]: value }));
  };

  // ── Teaching session within the cert page ───────────────────────────────────

  const startSession = async (persona: Persona) => {
    setActivePersona(persona);
    setSessionMessages([]);
    setInputText('');
    setIsInitiating(true);
    try {
      const openingMsg: ChatMsg = {
        id: makeId(), role: 'assistant', content: persona.openingLine,
      };
      setSessionMessages([openingMsg]);
    } finally {
      setIsInitiating(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isSending || !activePersona) return;
    const text = inputText.trim();
    setInputText('');
    setIsSending(true);
    stopSpeaking();
    const userMsg: ChatMsg = { id: makeId(), role: 'user', content: text };
    const updated = [...sessionMessages, userMsg];
    setSessionMessages(updated);
    try {
      const reply = await chatText({ page: 'AIAmbassadorsCertificationPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: activePersona.systemPrompt,
        max_tokens: 200,
        temperature: 0.8,
      });
      const aiMsg: ChatMsg = { id: makeId(), role: 'assistant', content: reply };
      setSessionMessages([...updated, aiMsg]);
    } catch {
      setSessionMessages(prev => [...prev, { id: makeId(), role: 'assistant', content: 'I had a small problem. Please continue.' }]);
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const toggleListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input not supported in this browser. Try Chrome.'); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = 'en-NG'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => setInputText(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.start(); setIsListening(true);
  };

  const userTurnCount = sessionMessages.filter(m => m.role === 'user').length;

  const saveSession = () => {
    if (!activePersona || userTurnCount < 3) return;
    const session: TeachingSession = {
      personaId:    activePersona.id,
      personaName:  activePersona.name,
      personaEmoji: activePersona.emoji,
      transcript:   sessionMessages,
      turnCount:    userTurnCount,
      completedAt:  new Date().toISOString(),
    };
    const existing = portfolio.sessions.filter(s => s.personaId !== activePersona.id);
    const updated = { ...portfolio, sessions: [...existing, session] };
    setPortfolio(updated);
    saveToDashboard(updated);
    setActivePersona(null);
    setSessionMessages([]);
  };

  const removeSession = (personaId: string) => {
    const updated = { ...portfolio, sessions: portfolio.sessions.filter(s => s.personaId !== personaId) };
    setPortfolio(updated);
  };

  // ── Evaluation ───────────────────────────────────────────────────────────────

  const handleEvaluate = async () => {
    if (isEvaluating || !portfolioReady(portfolio)) return;
    setIsEvaluating(true);
    setEvalError('');
    try {
      const sessionsText = portfolio.sessions.map((s, i) =>
        `--- SESSION ${i + 1}: ${s.personaName} ${s.personaEmoji} (${s.turnCount} student turns) ---\n` +
        s.transcript.slice(-10).map(m => `${m.role === 'user' ? 'AMBASSADOR STUDENT' : s.personaName}: ${m.content.slice(0, 500)}`).join('\n\n')
      ).join('\n\n');

      const prompt = `You are evaluating a student's AI Ambassadors Certification portfolio from the Davidson AI Innovation Center, Oloibiri, Nigeria.

The student's role: teach community members about AI in a way that is practical, relevant, and accessible.

=== WRITTEN COMPONENTS ===

TEACHING PHILOSOPHY:
${portfolio.teachingPhilosophy}

BEST PLAIN-LANGUAGE EXPLANATION OF AI:
${portfolio.bestExplanation}

OBJECTION RESPONSE:
${portfolio.objectionResponse}

=== TEACHING SESSIONS (live role-plays) ===
${sessionsText}

=== EVALUATION INSTRUCTIONS ===

Score the student on 5 dimensions (0–3 each) based on the COMBINED evidence of written components AND live sessions:

1. Plain-Language Explanation (plain_language)
   0 = Uses jargon; confusing; no analogies
   1 = Mostly clear but some technical terms creep in
   2 = Clear, simple, uses at least one good analogy; community member could understand
   3 = Exceptionally clear; multiple vivid analogies; adapts language to the specific person

2. Local Relevance & Examples (local_relevance)
   0 = Generic examples from cities or different cultures
   1 = Some local reference but mostly generic
   2 = Connects AI to the specific person's work, location, or life situation
   3 = Multiple specific, accurate local examples; clearly knows the community context

3. Handling Resistance & Objections (resistance)
   0 = Dismisses or ignores concerns; becomes defensive
   1 = Acknowledges concern but doesn't fully address it
   2 = Empathetically acknowledges and specifically addresses the concern
   3 = Exceptionally handles resistance; turns concern into understanding; patient and warm

4. Practical Next Step (next_step)
   0 = Leaves the community member with no clear action
   1 = Vague next step ("try AI sometime")
   2 = One clear, specific, achievable action the person can take today
   3 = Tailored next step matched to the specific person's situation; includes HOW to do it

5. Respect & Cultural Awareness (cultural_respect)
   0 = Patronising; dismisses existing knowledge; talks down
   1 = Respectful in tone but doesn't honour community knowledge
   2 = Genuinely honours the person's existing expertise; doesn't oversell AI
   3 = Exemplary cultural sensitivity; connects AI to existing strengths; never patronising

Return valid JSON only (no markdown, no code fences):
{
  "scores": {
    "plain_language": 0-3,
    "local_relevance": 0-3,
    "resistance": 0-3,
    "next_step": 0-3,
    "cultural_respect": 0-3
  },
  "evidence": {
    "plain_language": "specific quote or observation from portfolio",
    "local_relevance": "specific quote or observation",
    "resistance": "specific quote or observation",
    "next_step": "specific quote or observation",
    "cultural_respect": "specific quote or observation"
  },
  "overall_score": 0.0-3.0,
  "can_advance": true or false,
  "summary": "2-3 sentences of specific, warm encouragement",
  "main_growth_area": "1-2 sentences on the clearest area for improvement"
}`;

      const result = await chatJSON({ page: 'AIAmbassadorsCertificationPage',
        messages: [{ role: 'user', content: prompt }],
        system: 'You are an expert evaluator of community AI education skills. Be specific. Always cite actual evidence from the portfolio. Scoring must be fair and calibrated.',
        max_tokens: 900,
        temperature: 0.2,
      });

      if (!result?.scores) throw new Error('Invalid evaluation response');

      const scores: AssessmentScore[] = RUBRIC_DIMENSIONS.map(dim => ({
        assessment_name: dim.label,
        score: result.scores[dim.id] ?? null,
        evidence: result.evidence?.[dim.id] ?? null,
      }));

      setAssessmentScores(scores);
      await saveToDashboard(portfolio, scores);
      setView('results');
    } catch (err: any) {
      setEvalError('Evaluation failed. Please check your portfolio is complete and try again.');
      console.error(err);
    } finally {
      setIsEvaluating(false);
    }
  };

  // ── Certificate generation ───────────────────────────────────────────────────

  const generateCertificate = async () => {
    if (!certName.trim() || !allProficient) return;
    setIsGenCert(true);
    try {
      const r = await fetch('/api/generate-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: certName.trim(),
          certification: CERT_NAME,
          scores: assessmentScores,
          sessionId,
          date: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
          theme: 'emerald',
          subtitle: 'Community Impact Track',
          description: 'Has demonstrated the ability to teach community members about AI — clearly, respectfully, and with practical application to local life in Oloibiri, Bayelsa State, Nigeria.',
        }),
      });
      if (!r.ok) throw new Error('Certificate generation failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${certName.trim().replace(/\s+/g, '_')}_AI_Ambassadors_Certificate.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Certificate generation failed. Please try again.');
    } finally {
      setIsGenCert(false);
    }
  };

  // ── Voice bar helper ─────────────────────────────────────────────────────────
  const VoiceBar = ({ text }: { text: string }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(text)}
        className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isSpeaking ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
        {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEWS
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Overview ─────────────────────────────────────────────────────────────────
  if (view === 'overview') {
    const wFilled = writtenFilled(portfolio);
    const sCount  = portfolio.sessions.length;
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <AmbassadorCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">

            <VoiceBar text={`Welcome to the AI Ambassadors Certification. To earn this certificate, you must complete three written sections and at least two live teaching sessions with different community personas. Then submit your portfolio for evaluation.`} />

            {/* Header */}
            <div className="p-6 bg-gradient-to-br from-emerald-900/40 to-teal-900/20 border border-emerald-500/25 rounded-2xl text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center">
                <Users size={32} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">AI Ambassadors Certification</h1>
              <p className="text-sm text-emerald-300">Community Impact Track · Davidson AI Innovation Center</p>
              <p className="text-sm text-gray-300 leading-relaxed max-w-md mx-auto">
                Prove you can teach anyone in Oloibiri about AI — clearly, respectfully, and with practical examples from their own life.
              </p>
            </div>

            {/* What you'll do */}
            <div className="p-5 bg-gray-800/60 border border-gray-700/50 rounded-2xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">What you need to complete</h2>
              <div className="space-y-3">
                {[
                  {
                    icon: <PenLine size={16} />, colour: 'text-blue-400',
                    title: 'Written Portfolio (3 sections)',
                    desc: 'Your teaching philosophy, your best plain-language explanation of AI, and how you handle the hardest objection.',
                    done: wFilled === 3,
                    progress: `${wFilled}/3 completed`,
                  },
                  {
                    icon: <MessageSquare size={16} />, colour: 'text-emerald-400',
                    title: `Teaching Sessions (minimum ${MIN_SESSIONS})`,
                    desc: 'Live role-plays inside this page — the AI plays a community member, you are the teacher. At least 3 turns each, with different personas.',
                    done: sCount >= MIN_SESSIONS,
                    progress: `${sCount}/${MIN_SESSIONS} completed`,
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-700/40">
                    <div className={`flex-shrink-0 mt-0.5 ${item.colour}`}>{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        {item.done && <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                      <p className={`text-xs font-semibold mt-1 ${item.done ? 'text-emerald-400' : 'text-gray-500'}`}>{item.progress}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rubric preview */}
            <div className="p-5 bg-gray-800/60 border border-gray-700/50 rounded-2xl space-y-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">You'll be assessed on</h2>
              <div className="space-y-2">
                {RUBRIC_DIMENSIONS.map(d => (
                  <div key={d.id} className="flex items-start gap-2 text-sm">
                    <Star size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-gray-200">{d.label}</span>
                      <span className="text-gray-400"> — {d.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 pt-1">Proficient (2/3) or above on all five dimensions required for certification.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl transition-all">
                {portfolioReady(portfolio) ? 'Continue Portfolio' : 'Build Portfolio'} <ArrowRight size={16} />
              </button>
              {portfolioReady(portfolio) && (
                <button onClick={handleEvaluate} disabled={isEvaluating}
                  className="flex items-center gap-2 px-5 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors">
                  {isEvaluating ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
                  Evaluate
                </button>
              )}
            </div>

            {assessmentScores.length > 0 && (
              <button onClick={() => setView('results')}
                className="w-full py-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors underline">
                View previous evaluation results →
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────────
  if (view === 'build') {
    const wFilled = writtenFilled(portfolio);
    const sCount  = portfolio.sessions.length;
    const ready   = portfolioReady(portfolio);

    // If a session is active, show full chat UI
    if (activePersona) {
      return (
        <div className="min-h-screen flex flex-col relative">
          <Navbar />
        <AmbassadorCertBackground />
          <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-4">
            {/* Session header */}
            <div className="flex items-center gap-3 p-4 bg-gray-800/60 border border-gray-700/50 rounded-2xl mb-3">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>
                {activePersona.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{activePersona.name}</p>
                <p className="text-xs text-gray-400">{activePersona.occupation}</p>
                <p className="text-xs text-gray-500 mt-0.5">{userTurnCount} turn{userTurnCount !== 1 ? 's' : ''} · {userTurnCount >= 3 ? '✅ Ready to save' : `${3 - userTurnCount} more turns to save`}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={saveSession} disabled={userTurnCount < 3}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-colors ${userTurnCount >= 3 ? `bg-gradient-to-r ${activePersona.colour} text-white` : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                  <CheckCircle size={13} /> Save Session
                </button>
                <button onClick={() => { stopSpeaking(); setActivePersona(null); setSessionMessages([]); }}
                  className="p-2 text-gray-400 hover:text-gray-200 bg-gray-700 rounded-xl transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Tip */}
            <div className="px-4 py-2.5 bg-emerald-900/30 border border-emerald-500/20 rounded-xl mb-3 flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-gray-300">
                You are the teacher. Ask about their life first. Connect AI to their specific work. Use simple language. Avoid jargon. End with one practical action they can take.
              </p>
            </div>

            {/* Chat */}
            <div className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-2xl flex flex-col overflow-hidden" style={{ minHeight: 0, height: '420px' }}>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {sessionMessages.map(msg => (
                  <div key={msg.id} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-base flex-shrink-0`}>
                        {activePersona.emoji}
                      </div>
                    )}
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-gray-700 text-gray-100 rounded-tl-sm'}`}>
                      <p className="text-[10px] font-bold mb-1 opacity-60">{msg.role === 'user' ? 'You (Ambassador)' : activePersona.name}</p>
                      {msg.content}
                      {msg.role === 'assistant' && (
                        <AIPidginCoachWrapper englishText={msg.content} />
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                        <Users size={14} className="text-white" />
                      </div>
                    )}
                  </div>
                ))}
                {isSending && (
                  <div className="flex items-start gap-2">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-base flex-shrink-0`}>{activePersona.emoji}</div>
                    <div className="bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1.5">{[0,150,300].map(d=><div key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-gray-700/50 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder={`Speak to ${activePersona.name}…`}
                    disabled={isSending}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500 resize-none leading-relaxed disabled:opacity-50"
                  />
                  <div className="flex flex-col gap-1.5">
                    <button onClick={toggleListening}
                      className={`p-2.5 rounded-xl transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                      {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>
                    <button onClick={sendMessage} disabled={!inputText.trim() || isSending}
                      className={`p-2.5 rounded-xl transition-colors ${inputText.trim() && !isSending ? `bg-gradient-to-br ${activePersona.colour} text-white` : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Main build UI
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <AmbassadorCertBackground />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">

            {/* Back + progress */}
            <div className="flex items-center justify-between">
              <button onClick={() => setView('overview')}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                ← Overview
              </button>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className={wFilled === 3 ? 'text-emerald-400 font-semibold' : ''}>Written {wFilled}/3</span>
                <span>·</span>
                <span className={sCount >= MIN_SESSIONS ? 'text-emerald-400 font-semibold' : ''}>Sessions {sCount}/{MIN_SESSIONS}</span>
                {ready && <CheckCircle size={13} className="text-emerald-400" />}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-800/60 rounded-xl">
              {(['written', 'sessions'] as BuildTab[]).map(tab => (
                <button key={tab} onClick={() => setBuildTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${buildTab === tab ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  {tab === 'written' ? `Written Portfolio (${wFilled}/3)` : `Teaching Sessions (${sCount}/${MIN_SESSIONS})`}
                </button>
              ))}
            </div>

            {/* ── Written tab ── */}
            {buildTab === 'written' && (
              <div className="space-y-4">
                {WRITTEN_SECTIONS.map(sec => {
                  const val = portfolio[sec.key];
                  const done = val.trim().length > 30;
                  return (
                    <div key={sec.key} className={`rounded-2xl border ${sec.colour} p-5 space-y-3`}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{sec.icon}</span>
                        <h3 className="text-sm font-bold text-white flex-1">{sec.label}</h3>
                        {done && <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />}
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <Lightbulb size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">{sec.tip}</p>
                      </div>
                      <textarea
                        value={val}
                        onChange={e => setWritten(sec.key, e.target.value)}
                        rows={sec.rows}
                        placeholder={sec.placeholder}
                        className="w-full bg-gray-800/80 border border-gray-600/50 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500 resize-none leading-relaxed"
                      />
                      <p className="text-right text-xs text-gray-600">{val.length} characters</p>
                    </div>
                  );
                })}
                <button onClick={() => setBuildTab('sessions')}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-colors">
                  Next: Teaching Sessions <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* ── Sessions tab ── */}
            {buildTab === 'sessions' && (
              <div className="space-y-4">
                {/* Completed sessions */}
                {portfolio.sessions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Completed Sessions</p>
                    {portfolio.sessions.map(s => (
                      <div key={s.personaId} className="flex items-center gap-3 p-3 bg-emerald-900/30 border border-emerald-500/25 rounded-xl">
                        <span className="text-2xl">{s.personaEmoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{s.personaName}</p>
                          <p className="text-xs text-gray-400">{s.turnCount} turns · saved</p>
                        </div>
                        <CheckCircle size={16} className="text-emerald-400" />
                        <button onClick={() => removeSession(s.personaId)}
                          className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Available personas */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {portfolio.sessions.length < MIN_SESSIONS
                      ? `Choose a persona to teach (need ${MIN_SESSIONS - portfolio.sessions.length} more)`
                      : 'Add more sessions (optional)'}
                  </p>
                  {PERSONAS.map(persona => {
                    const done = portfolio.sessions.some(s => s.personaId === persona.id);
                    return (
                      <button key={persona.id} onClick={() => startSession(persona)}
                        className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all ${done ? 'border-emerald-500/30 bg-emerald-900/20 opacity-75' : 'border-gray-700/50 bg-gray-800/40 hover:border-emerald-500/50 hover:bg-gray-700/40'}`}>
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${persona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>
                          {persona.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white">{persona.name}, {persona.age}</p>
                            {done && <CheckCircle size={13} className="text-emerald-400" />}
                          </div>
                          <p className="text-xs text-gray-400">{persona.occupation}</p>
                          <p className="text-xs text-gray-500 mt-1 italic">"{persona.openingLine.slice(0, 80)}…"</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-500 flex-shrink-0 mt-2" />
                      </button>
                    );
                  })}
                </div>

                {ready && (
                  <div className="space-y-3 pt-2">
                    <div className="p-3 bg-emerald-900/30 border border-emerald-500/25 rounded-xl flex items-center gap-2">
                      <CheckCircle size={15} className="text-emerald-400" />
                      <p className="text-sm text-emerald-300 font-semibold">Portfolio complete! Ready to evaluate.</p>
                    </div>
                    <button onClick={handleEvaluate} disabled={isEvaluating}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                      {isEvaluating
                        ? <><Loader2 size={16} className="animate-spin" /> Evaluating portfolio…</>
                        : <><Star size={16} /> Submit for Evaluation</>}
                    </button>
                  </div>
                )}

                {evalError && (
                  <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────────
  if (view === 'results') {
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <AmbassadorCertBackground />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">

            <VoiceBar text={`Your AI Ambassadors Certification results are ready. ${allProficient ? 'Congratulations — you have achieved certification level on all criteria!' : 'Continue building your portfolio and try again.'}`} />

            {/* Summary card */}
            {overallScore !== null && (
              <div className={`p-5 rounded-2xl border ${allProficient ? 'bg-emerald-900/30 border-emerald-500/30' : 'bg-gray-800/60 border-gray-700/50'} flex items-center gap-5`}>
                <div className="flex-shrink-0">
                  <ScoreRing score={Math.round(overallScore)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-white">{overallScore.toFixed(1)} / 3.0 overall</p>
                  <p className={`text-sm font-semibold ${allProficient ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {allProficient ? '🎓 Certification level achieved on all criteria!' : 'Proficient (2/3) required on all criteria.'}
                  </p>
                </div>
                {allProficient && (
                  <button onClick={() => setView('certificate')}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
                    <Trophy size={15} /> Get Certificate
                  </button>
                )}
              </div>
            )}

            {/* Per-criterion */}
            {assessmentScores.length > 0 && (
              <div className="space-y-2">
                {assessmentScores.map(sc => {
                  const dim = RUBRIC_DIMENSIONS.find(d => d.label === sc.assessment_name);
                  const { text, color, bg, border } = scoreLabel(sc.score);
                  return (
                    <div key={sc.assessment_name} className={`rounded-xl border ${border} ${bg} p-4`}>
                      <div className="flex items-center gap-3 mb-2">
                        <ScoreRing score={sc.score} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white">{sc.assessment_name}</p>
                          <p className={`text-xs font-semibold ${color}`}>{text}</p>
                        </div>
                      </div>
                      {sc.evidence && <p className="text-xs text-gray-300 leading-relaxed pl-14">{sc.evidence}</p>}
                      {dim && sc.score !== null && sc.score < 2 && (
                        <div className="mt-2 pl-14 text-[10px] text-blue-300 leading-relaxed">
                          <span className="text-gray-500">To reach Proficient: </span>{dim.desc}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {evalError && (
              <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2 text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button onClick={() => setView('build')}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-xl transition-colors">
                <PenLine size={14} /> Continue Building
              </button>
              <button onClick={handleEvaluate} disabled={isEvaluating}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                {isEvaluating ? <><Loader2 size={14} className="animate-spin" /> Evaluating…</> : <><RefreshCw size={14} /> Re-evaluate</>}
              </button>
              {allProficient && (
                <button onClick={() => setView('certificate')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white text-sm font-bold rounded-xl transition-colors">
                  <Trophy size={14} /> Get Certificate
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Certificate ───────────────────────────────────────────────────────────────
  if (view === 'certificate') {
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <AmbassadorCertBackground />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">

            <VoiceBar text="Enter your name to generate your AI Ambassadors Certificate." />

            {!allProficient && (
              <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 flex gap-2 text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                You need Proficient (2/3) or above on all five criteria to earn your certificate. Continue building your portfolio and re-evaluate.
              </div>
            )}

            {allProficient && (
              <>
                <div className="p-6 bg-gradient-to-br from-emerald-900/40 to-teal-900/20 border border-emerald-500/25 rounded-2xl text-center space-y-4">
                  <Trophy size={48} className="text-emerald-400 mx-auto" />
                  <div>
                    <h2 className="text-xl font-bold text-white">🎓 Certification Achieved!</h2>
                    <p className="text-sm text-gray-300 mt-1 max-w-sm mx-auto">
                      You have demonstrated the ability to teach community members about AI — clearly, respectfully, and with practical application to Oloibiri life. Enter your name to download your certificate.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {assessmentScores.map(sc => {
                      const { text, color } = scoreLabel(sc.score);
                      return (
                        <div key={sc.assessment_name} className="flex items-center justify-between px-3 py-1.5 bg-gray-800/60 rounded-lg">
                          <span className="text-gray-300 truncate text-left">{sc.assessment_name}</span>
                          <span className={`font-bold flex-shrink-0 ml-2 ${color}`}>{text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-300">
                    Full name as it should appear on the certificate:
                  </label>
                  <input
                    type="text"
                    value={certName}
                    onChange={e => setCertName(e.target.value)}
                    placeholder="e.g. Amara Johnson"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-emerald-500 text-base"
                  />
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                    {isGenCert
                      ? <><Loader2 size={18} className="animate-spin" /> Generating PDF…</>
                      : <><Download size={18} /> Download Certificate</>}
                  </button>
                  <p className="text-center text-xs text-gray-500">
                    Emerald-themed PDF · Davidson AI Innovation Center · Oloibiri, Nigeria
                  </p>
                </div>
              </>
            )}

            <button onClick={() => setView('overview')}
              className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              ← Back to Overview
            </button>
          </div>
        </main>
      </div>
    );
  }

  return null;
};

export default AIAmbassadorsCertificationPage;