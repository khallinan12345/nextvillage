// src/pages/community-impact/EntrepreneurshipConsultantCertificationPage.tsx
//
// Entrepreneurship Consultant Certification
// Assesses whether a student can advise young Nigerians starting businesses —
// covering CAC registration, pricing, WhatsApp marketing, Ajo savings,
// and giving practical affordable advice matched to each entrepreneur's situation.
//
// Portfolio structure:
//   WRITTEN  — consulting approach, business knowledge test (with pricing calc), lean business plan
//   SESSIONS — at least 2 live consultations with different entrepreneur personas
//
// Evaluation: 5 rubric dimensions, 0-3 each. Proficient (≥2) on all = certified.
//
// Dashboard columns:
//   entrepreneurship_cert_session_id  text
//   entrepreneurship_cert_portfolio   jsonb
//   entrepreneurship_cert_evaluation  jsonb
//
// Activity: 'Entrepreneurship Consultant Certification'
// Route: /community-impact/entrepreneurship/certification

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { PidginTooltip } from '../../components/PidginTooltip';
import { playPidginVoice, stopPidginSpeech } from '../../lib/speechCoordination';
import { useBranding } from '../../lib/useBranding';
import {
  Briefcase, Award, Trophy, Loader2, Download, AlertCircle,
  Volume2, VolumeX, Star, CheckCircle, ArrowRight, RefreshCw,
  PenLine, MessageSquare, Lightbulb, ShieldCheck, TrendingUp,
  Send, Mic, MicOff, X, ChevronRight, DollarSign, Smartphone,
  Target,
} from 'lucide-react';

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

interface ConsultSession {
  personaId: string;
  personaName: string;
  personaEmoji: string;
  transcript: ChatMsg[];
  turnCount: number;
  completedAt: string;
}

interface EntrepreneurshipPortfolio {
  consultingApproach: string;
  businessKnowledge: string;
  leanBusinessPlan: string;
  sessions: ConsultSession[];
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';
type BuildTab = 'written' | 'sessions';

// ─── Nigeria Business Context ─────────────────────────────────────────────────

const NIGERIA_BUSINESS_CONTEXT = `
NIGERIA ENTREPRENEURSHIP CONTEXT (always apply):

REGISTRATION:
- CAC Business Name: ~₦10,000–25,000; needed for bank account, grants, formal contracts
- TIN: free; needed for government/formal transactions
- Register at cac.gov.ng or CAC office Yenagoa

FINANCING:
- Ajo/Esusu cooperative savings: groups of 8–20 contribute monthly; lump sum on your turn; as reliable as a bank
- Tony Elumelu Foundation: ₦5M grant + mentoring; tefconnect.com
- NIRSAL Microfinance: government-backed small business loans
- LAPO Microfinance: accessible loans; known for Niger Delta women
- BOI: loans from ₦500,000; needs CAC + business plan
- AVOID: loan sharks, social media lending schemes

MOBILE BANKING: Opay, Palmpay (free POS, transfers), Kuda (no-fee bank). Keep business money SEPARATE from personal.

PRICING:
- Selling Price = Cost ÷ (1 - target margin)
- At 35% margin: cost ₦1,200 → ₦1,200 ÷ 0.65 = ₦1,846
- Calculate FULL cost: materials + labour + overheads (generator, transport, packaging, data)

MARKETING: WhatsApp Business broadcast lists + catalogue; Facebook Marketplace Yenagoa groups; Instagram/TikTok for visual businesses. Talk to 10 customers BEFORE spending money.

RECORD-KEEPING: Daily notebook or Wave Accounting (free). Separate business and personal money from day 1.
`;

// ─── Entrepreneur Personas ────────────────────────────────────────────────────

interface EntrepreneurPersona {
  id: string; name: string; age: string;
  occupation: string; emoji: string; colour: string;
  situation: string; mainChallenge: string;
  openingLine: string; systemPrompt: string;
}

const ENTREPRENEUR_PERSONAS: EntrepreneurPersona[] = [
  {
    id: 'fatima',
    name: 'Fatima',
    age: '22',
    occupation: 'Event food seller — small chops and jollof for parties in Yenagoa',
    emoji: '👩🏿‍🍳',
    colour: 'from-amber-600 to-orange-600',
    situation: 'Has been cooking for events for 2 years. Made ₦45,000 from 2 events last month but doesn\'t know if she\'s actually profitable because she guesses at prices. Has ₦80,000 saved.',
    mainChallenge: 'Pricing by guesswork, no formal client acquisition, unclear on registration',
    openingLine: `Hello! I need advice please. I cook for events — small chops, jollof, the whole thing. People say my food is very good and I made good money last month but I don't know if I am charging correctly. I just estimate. Sometimes I finish and realise I barely made profit after buying everything. I want to grow this into a proper business. Where do I start?`,
    systemPrompt: `You are Fatima, a 22-year-old event food seller from Yenagoa, Bayelsa. You cook small chops and jollof for events and have been taking private orders for 2 years.
${NIGERIA_BUSINESS_CONTEXT}

YOUR SITUATION: Made ₦45,000 from 2 events last month but not sure how much was profit. Costs include ingredients, transport, gas/firewood, packaging trays, your time. Never written a price breakdown. ₦80,000 saved.

PERSONALITY: Enthusiastic, hardworking. Warm casual Nigerian English. Excited by specific affordable advice. Worried when loans are mentioned.

ASK: "For one small chops event for 100 guests, I charged ₦40,000. Is that too low?", "If I register, which type?", "How do I find clients I don't know yet?", "Can I hire someone just for events?"`,
  },
  {
    id: 'emeka',
    name: 'Emeka',
    age: '19',
    occupation: 'Aspiring phone repair and accessories seller, Oloibiri',
    emoji: '👨🏿‍💻',
    colour: 'from-blue-700 to-indigo-700',
    situation: 'Just finished secondary school. Self-taught in basic phone repair via YouTube. Nearest phone shop is 20 minutes from Oloibiri. Has ₦55,000 (₦35,000 own + ₦20,000 from father who wants it back in 3 months).',
    mainChallenge: 'No tools or stock yet, doesn\'t know suppliers, fixed vs mobile business decision',
    openingLine: `Good afternoon. I want to start repairing phones and selling accessories. I have been watching YouTube for how to fix screens and batteries and I can already do it on family phones. My area in Oloibiri doesn't have a phone shop nearby so I know people need this. I have ₦35,000 saved plus my father will add ₦20,000. Is this enough to start? And where do I buy the things to sell?`,
    systemPrompt: `You are Emeka, a 19-year-old from Oloibiri who just finished secondary school. Self-taught in basic phone repair via YouTube.
${NIGERIA_BUSINESS_CONTEXT}

YOUR SITUATION: Capital ₦55,000. Father wants ₦20,000 back in 3 months. No tools or stock yet. Market gap: no phone shop within 20 minutes.

PERSONALITY: Confident in tech, less confident in business. Casual Nigerian English + Pidgin. Anxious about money.

ASK: "Is ₦55,000 enough for tools AND stock?", "Fixed spot or go to people's houses?", "Do I need to register first?", "What if I fix a phone and something goes wrong?"`,
  },
  {
    id: 'blessing',
    name: 'Blessing',
    age: '28',
    occupation: 'Garri processor — family farm, selling to middlemen below market rate',
    emoji: '👩🏿',
    colour: 'from-green-700 to-teal-700',
    situation: 'Processes garri from family cassava farm for 4 years. Sells to middlemen at ~₦4,500/bag when Yenagoa market pays ₦7,000–9,000. Cassava is free (family farm). ₦25,000 saved, keeps no records.',
    mainChallenge: 'Selling through middlemen at low margins, no records, no direct market access',
    openingLine: `Good day. I process garri from our family farm. I have been doing it for four years. I make some money but the traders who come to buy from me — they buy cheap and I know they sell for much more in Yenagoa. I want to sell directly. But I don't know how to find buyers. And someone told me I should register my business if I want to grow. Is that true? I don't have much money for all of this.`,
    systemPrompt: `You are Blessing, a 28-year-old woman from Oloibiri who processes garri from her family's cassava farm.
${NIGERIA_BUSINESS_CONTEXT}

YOUR SITUATION: Sells at ~₦4,500/bag to middlemen. Garri sells in Yenagoa for ₦7,000–9,000. Cassava is FREE from family farm. Cost per bag ≈ ₦1,500 (processing + fuel + bags + transport). ₦25,000 saved. No records. No social media.

PERSONALITY: Practical, slightly skeptical of new ideas. Measured Nigerian English. Warms up when advice is specific and costs are clear.

ASK: "If I sell in Yenagoa, how do I get the garri there? Transport will eat my profit.", "How do I find buyers in Yenagoa?", "Do I need to register?", "What if the cassava harvest fails?"`,
  },
  {
    id: 'tunde',
    name: 'Tunde',
    age: '24',
    occupation: 'Fashion designer — wants to start Ankara and streetwear brand',
    emoji: '👨🏿‍🎨',
    colour: 'from-purple-700 to-pink-700',
    situation: 'Passionate about fashion with 400 engaged Instagram followers. Plans to take a ₦500,000 loan to set up a shop before making a single paying sale. Only ₦40,000 saved. Family thinks fashion is not serious work.',
    mainChallenge: 'About to take large loan before proving demand — advisor must redirect without crushing the dream',
    openingLine: `Hello! I want to start a fashion brand. I design Ankara and streetwear and my friends love my style. I have 400 followers on Instagram who engage well. Someone told me I should take a loan of ₦500,000 to start — buy a sewing machine, stock fabric, rent a space. My family says fashion is not serious work. But I believe in this. Can you help me plan it properly?`,
    systemPrompt: `You are Tunde, a 24-year-old from Bayelsa with a genuine passion for fashion design. 400 engaged Instagram followers but no paying customers yet.
${NIGERIA_BUSINESS_CONTEXT}

YOUR SITUATION: Only ₦40,000 saved. Planning to borrow ₦500,000 before making a single paying sale. No formal tailoring training — self-taught.

PERSONALITY: Passionate and slightly defensive (family pressure hurts). Creative modern Nigerian English. Responds well to ambition-respecting but realistic advice.

ASK: "How do I prove demand without a shop?", "How do I convert Instagram followers to customers?", "What if I start small and people don't take me seriously?", "The loan — if I don't take it, how do I afford a sewing machine?"

React with genuine relief when someone respects your vision while redirecting the loan idea.`,
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'Entrepreneurship Consultant';
const CERT_ACTIVITY = 'Entrepreneurship Consultant Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const MIN_SESSIONS  = 2;

const EMPTY_PORTFOLIO: EntrepreneurshipPortfolio = {
  consultingApproach: '',
  businessKnowledge: '',
  leanBusinessPlan: '',
  sessions: [],
};

const WRITTEN_SECTIONS = [
  {
    key: 'consultingApproach' as const,
    label: '1. Your Consulting Approach',
    icon: <Target size={13} />,
    colour: 'border-amber-500/40 bg-amber-500/5',
    placeholder: 'Describe how you approach advising a young Nigerian who wants to start a business. What do you ask first? How do you assess their situation before recommending anything? How do you balance encouragement with honesty about risks (like taking a large loan before proving demand)? Write at least 3–4 sentences.',
    tip: 'The best entrepreneurship advisors ask about capital, skills, and existing demand BEFORE recommending any investment. Describe how you start with listening, not prescribing.',
    rows: 4,
  },
  {
    key: 'businessKnowledge' as const,
    label: '2. Nigerian Business Knowledge Test',
    icon: <DollarSign size={13} />,
    colour: 'border-blue-500/40 bg-blue-500/5',
    placeholder: 'Answer all four questions from memory:\n\n  A) A young woman wants to open a hair salon and take a ₦300,000 bank loan to start. What is your advice — and what questions do you ask her first?\n\n  B) What is Ajo/Esusu and why is it often a better option than a bank loan for a first-time entrepreneur with no credit history?\n\n  C) A young man sells phone chargers at cost price ₦1,200 each. He wants to make 35% profit. What is his correct selling price? Show the calculation.\n\n  D) Name THREE free or low-cost ways a small business in Oloibiri/Yenagoa can find its first customers — without spending money on advertising.',
    tip: 'Question C requires a specific calculation: Selling Price = Cost ÷ (1 - 0.35) = ₦1,200 ÷ 0.65 = ₦1,846. Questions A and B test whether you understand Nigerian financial realities — not just textbook business advice.',
    rows: 8,
  },
  {
    key: 'leanBusinessPlan' as const,
    label: '3. Write a Lean Business Plan',
    icon: <TrendingUp size={13} />,
    colour: 'border-green-500/40 bg-green-500/5',
    placeholder: 'Write a lean business plan for this person:\n\nChidi is 23 years old, from Oloibiri. He wants to sell fresh fish and smoked catfish — buying from local fishermen at Kolo Creek and reselling in Yenagoa market and via WhatsApp. He has ₦120,000 saved. He has a smartphone, a bicycle, and a large cooler box his father gave him. He has no business experience.\n\nYour plan must include:\n  1. The key opportunity and target customer\n  2. Start-up costs (what to spend the ₦120,000 on first)\n  3. Pricing approach (buy at ₦X, sell at ₦Y — give realistic numbers)\n  4. How to find the first 10 customers\n  5. The biggest risk and how to manage it\n  6. One specific action Chidi should take THIS WEEK',
    tip: 'Be specific and realistic. Fresh catfish buys at ~₦2,500/kg from fishermen; sells at ₦4,000–4,500/kg in Yenagoa; smoked catfish sells for ₦5,000–6,000/kg. The plan must be executable with ₦120,000 — not more.',
    rows: 9,
  },
];

const RUBRIC_DIMENSIONS = [
  { id: 'diagnosis',     label: 'Problem Diagnosis',      desc: 'Correctly identifies the real barrier — not just the surface question' },
  { id: 'knowledge',     label: 'Business Knowledge',     desc: 'Advice is accurate and specific to Nigerian business realities (CAC, Ajo, mobile money, pricing)' },
  { id: 'practical',     label: 'Practical & Affordable', desc: 'Advice is actionable within the entrepreneur\'s actual budget and situation' },
  { id: 'action',        label: 'Action Planning',        desc: 'Leaves the entrepreneur with a clear, sequenced, specific first step' },
  { id: 'communication', label: 'Communication',          desc: 'Advice is encouraging, clear, and adapted to this person\'s specific situation' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreLabel = (s: number | null) => {
  if (s === null) return { text: 'Not assessed', color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20'    };
  if (s === 3)    return { text: 'Advanced',     color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (s === 2)    return { text: 'Proficient',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'    };
  if (s === 1)    return { text: 'Emerging',     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   };
  return               { text: 'No Evidence',  color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30'     };
};

const writtenFilled = (p: EntrepreneurshipPortfolio) =>
  [p.consultingApproach, p.businessKnowledge, p.leanBusinessPlan].filter(v => v.trim().length > 30).length;

const portfolioReady = (p: EntrepreneurshipPortfolio) =>
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

// ─── Background ───────────────────────────────────────────────────────────────

const EntrepreneurCertBackground: React.FC = () => {
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
    return () => { window.removeEventListener('mousemove', h); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const img = "url('/background_entrepreneurship_consulting.png')";

  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="entrep-cert-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="3" seed="31" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="55" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <div className="fixed top-16 left-0 right-0 bottom-0"
        style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/80 via-orange-900/70 to-yellow-900/75" />
        <div className="absolute inset-0 bg-black/15" />
      </div>
      {moving && (
        <div className="fixed top-16 left-0 right-0 bottom-0 pointer-events-none"
          style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1, filter: 'url(#entrep-cert-distortion)',
            WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`,
            maskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)` }}>
          <div className="absolute inset-0 bg-gradient-to-br from-amber-900/80 via-orange-900/70 to-yellow-900/75" />
        </div>
      )}
    </>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const EntrepreneurshipConsultantCertificationPage: React.FC = () => {
  const { user } = useAuth();
  const branding = useBranding();
  const [view, setView]                         = useState<ViewMode>('overview');
  const [buildTab, setBuildTab]                 = useState<BuildTab>('written');
  const [portfolio, setPortfolio]               = useState<EntrepreneurshipPortfolio>(EMPTY_PORTFOLIO);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [sessionId]                             = useState(() => makeId());
  const [certName, setCertName]                 = useState('');
  const [isEvaluating, setIsEvaluating]         = useState(false);
  const [isGenCert, setIsGenCert]               = useState(false);
  const [evalError, setEvalError]               = useState('');
  const [dashboardRowId, setDashboardRowId]     = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking]             = useState(false);
  const [speechOn, setSpeechOn]                 = useState(true);
  const [voiceMode, setVoiceMode]               = useState<'english' | 'pidgin'>('pidgin');
  const speechSynth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  const [activePersona, setActivePersona]     = useState<EntrepreneurPersona | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText]             = useState('');
  const [isSending, setIsSending]             = useState(false);
  const [isListening, setIsListening]         = useState(false);
  const chatEndRef                            = useRef<HTMLDivElement>(null);
  const inputRef                              = useRef<HTMLTextAreaElement>(null);
  const recognitionRef                        = useRef<any>(null);

  const allProficient = assessmentScores.length === RUBRIC_DIMENSIONS.length &&
    assessmentScores.every(s => s.score !== null && s.score >= 2);

  const overallScore = assessmentScores.length > 0
    ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length
    : null;

  const speakBrowser = useCallback((text: string) => {
    if (!speechSynth) return;
    speechSynth.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 300));
    const voices = speechSynth.getVoices();
    const voice = voiceMode === 'pidgin'
      ? (voices.find(v => v.lang === 'en-NG') || voices.find(v => v.lang === 'en-ZA') || voices.find(v => v.lang.startsWith('en')))
      : (voices.find(v => v.name === 'Google UK English Female') || voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en')));
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    utt.rate = 0.87; utt.pitch = 1.0;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend   = () => setIsSpeaking(false);
    speechSynth.speak(utt);
  }, [speechSynth, voiceMode]);

  const speak = useCallback((text: string) => {
    if (!speechOn) return;
    void playPidginVoice(text.slice(0, 300), 'english', {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: (err) => {
        console.warn('[EntrepreneurshipConsultantCertificationPage] SpeechGen TTS failed, falling back to browser voice:', err);
        speakBrowser(text);
      },
    });
  }, [speechOn, voiceMode, speakBrowser]);

  const stopSpeaking = useCallback(() => { speechSynth?.cancel(); stopPidginSpeech(); setIsSpeaking(false); }, [speechSynth]);

  useEffect(() => {
    const last = sessionMessages[sessionMessages.length - 1];
    if (last?.role === 'assistant') speak(last.content);
  }, [sessionMessages, speak]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [sessionMessages]);

  const saveToDashboard = useCallback(async (port: EntrepreneurshipPortfolio, scores: AssessmentScore[] = []) => {
    if (!user?.id) return;
    const payload = {
      user_id:                              user.id,
      activity:                             CERT_ACTIVITY,
      category_activity:                    'Community Impact',
      entrepreneurship_cert_session_id:     sessionId,
      entrepreneurship_cert_portfolio:      port,
      entrepreneurship_cert_evaluation:     scores,
      progress:                             allProficient ? 'completed' : 'started',
      updated_at:                           new Date().toISOString(),
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

  const setWritten = (key: keyof Pick<EntrepreneurshipPortfolio, 'consultingApproach' | 'businessKnowledge' | 'leanBusinessPlan'>, value: string) =>
    setPortfolio(prev => ({ ...prev, [key]: value }));

  const startSession = (persona: EntrepreneurPersona) => {
    setActivePersona(persona);
    setSessionMessages([{ id: makeId(), role: 'assistant', content: persona.openingLine }]);
    setInputText('');
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isSending || !activePersona) return;
    const text = inputText.trim();
    setInputText(''); setIsSending(true); stopSpeaking();
    const userMsg: ChatMsg = { id: makeId(), role: 'user', content: text };
    const updated = [...sessionMessages, userMsg];
    setSessionMessages(updated);
    try {
      const reply = await chatText({ page: 'EntrepreneurshipConsultantCertificationPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: activePersona.systemPrompt, max_tokens: 200, temperature: 0.8,
      });
      setSessionMessages([...updated, { id: makeId(), role: 'assistant', content: reply }]);
    } catch {
      setSessionMessages(prev => [...prev, { id: makeId(), role: 'assistant', content: 'I had a small problem. Please continue.' }]);
    } finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const toggleListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input not supported. Try Chrome.'); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }
    const rec = new SR(); recognitionRef.current = rec;
    rec.lang = 'en-NG'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => setInputText(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
    rec.onend = () => setIsListening(false); rec.onerror = () => setIsListening(false);
    rec.start(); setIsListening(true);
  };

  const userTurnCount = sessionMessages.filter(m => m.role === 'user').length;

  const saveSession = () => {
    if (!activePersona || userTurnCount < 3) return;
    const session: ConsultSession = {
      personaId: activePersona.id, personaName: activePersona.name, personaEmoji: activePersona.emoji,
      transcript: sessionMessages, turnCount: userTurnCount, completedAt: new Date().toISOString(),
    };
    const updated = { ...portfolio, sessions: [...portfolio.sessions.filter(s => s.personaId !== activePersona.id), session] };
    setPortfolio(updated); saveToDashboard(updated);
    setActivePersona(null); setSessionMessages([]);
  };

  const removeSession = (personaId: string) => {
    const updated = { ...portfolio, sessions: portfolio.sessions.filter(s => s.personaId !== personaId) };
    setPortfolio(updated);
  };

  const handleEvaluate = async () => {
    if (isEvaluating || !portfolioReady(portfolio)) return;
    setIsEvaluating(true); setEvalError('');
    try {
      const sessionsText = portfolio.sessions.map((s, i) =>
        `--- SESSION ${i + 1}: ${s.personaName} ${s.personaEmoji} (${s.turnCount} student turns) ---\n` +
        s.transcript.slice(-10).map(m => `${m.role === 'user' ? 'ADVISOR STUDENT' : s.personaName}: ${m.content.slice(0, 500)}`).join('\n\n')
      ).join('\n\n');

      const prompt = `You are evaluating a student's Entrepreneurship Consultant Certification portfolio from the ${branding.institutionName}.

The student's role: advise young Nigerians starting or growing a business — covering CAC registration, pricing, WhatsApp marketing, Ajo savings, grants (Tony Elumelu Foundation), and lean business planning.

=== WRITTEN COMPONENTS ===

CONSULTING APPROACH:
${portfolio.consultingApproach}

BUSINESS KNOWLEDGE TEST (4 questions):
${portfolio.businessKnowledge}

LEAN BUSINESS PLAN (for Chidi's fish trading business, ₦120,000 capital):
${portfolio.leanBusinessPlan}

=== CONSULTATION SESSIONS ===
${sessionsText}

=== EVALUATION REFERENCE ===
Correct answer for Question C (pricing calculation): Selling Price = ₦1,200 ÷ (1 - 0.35) = ₦1,200 ÷ 0.65 = ₦1,846 per unit.

For the lean business plan: realistic buy price for fresh catfish ~₦2,500/kg from Kolo Creek fishermen; sell at ₦4,000–4,500/kg in Yenagoa; smoked catfish sells at ₦5,000–6,000/kg. ₦120,000 should cover: stock float, packaging, registration, WhatsApp marketing setup (free), emergency reserve. First 10 customers: existing WhatsApp contacts, Yenagoa Facebook food groups, talk to 10 people first. Biggest risk: spoilage.

=== EVALUATION INSTRUCTIONS ===

Score on 5 dimensions (0–3 each) based on COMBINED written + session evidence:

1. Problem Diagnosis (diagnosis)
   0 = Generic advice without understanding the person's actual situation
   1 = Identifies some aspects but misses key barriers
   2 = Correctly identifies the real barrier — the concern beneath the surface question
   3 = Surfaces hidden concerns; asks about capital before recommending; identifies loan risk proactively

2. Business Knowledge (knowledge)
   0 = Advice is vague, inaccurate, or misses Nigerian business realities
   1 = Some accurate information but missing key specifics
   2 = Accurate: mentions CAC registration correctly, knows Ajo/Esusu concept, correct pricing formula applied, realistic market prices in business plan
   3 = Exceptional: correct pricing calculation (₦1,846); specific Nigerian tools (Opay, Tony Elumelu Foundation, WhatsApp Business); realistic Oloibiri/Bayelsa market data

3. Practical & Affordable (practical)
   0 = Advice requires money the entrepreneur clearly doesn't have
   1 = Partially achievable but some recommendations are unrealistic
   2 = All advice actionable within stated budget; redirects loan idea appropriately if applicable
   3 = Exceptional budget-consciousness; prioritises best return for limited capital; sequenced spending plan

4. Action Planning (action)
   0 = Leaves the entrepreneur with no clear next step
   1 = Gives vague direction ("think about your pricing")
   2 = One specific, concrete, achievable next step this week
   3 = Sequenced action plan tailored to this specific entrepreneur's situation; "do X before Y because Z"

5. Communication (communication)
   0 = Intimidating, jargon-heavy, or crushing to confidence
   1 = Mostly clear but uses some business jargon; not fully adapted to this person
   2 = Clear, warm, encouraging AND honest; uses the entrepreneur's own context
   3 = Respects the dream while redirecting mistakes; uses the entrepreneur's own language; leaves them energised and clear

Return valid JSON only (no markdown, no code fences):
{
  "scores": {"diagnosis":0-3,"knowledge":0-3,"practical":0-3,"action":0-3,"communication":0-3},
  "evidence": {"diagnosis":"specific quote or observation","knowledge":"cite pricing calc if present","practical":"specific quote","action":"specific quote","communication":"specific quote"},
  "overall_score": 0.0-3.0,
  "can_advance": true or false,
  "summary": "2-3 sentences of specific warm encouragement citing actual things the student did well",
  "main_growth_area": "1-2 sentences on the clearest area for improvement with a specific suggestion"
}`;

      const result = await chatJSON({ page: 'EntrepreneurshipConsultantCertificationPage',
        messages: [{ role: 'user', content: prompt }],
        system: 'You are an expert evaluator of entrepreneurship consulting skills for young Nigerians. Be specific. Always cite actual evidence. Check the pricing calculation. Score calibrated against Nigerian business realities.',
        max_tokens: 900, temperature: 0.2,
      });

      if (!result?.scores) throw new Error('Invalid evaluation response');

      const scores: AssessmentScore[] = RUBRIC_DIMENSIONS.map(dim => ({
        assessment_name: dim.label,
        score:    result.scores[dim.id]    ?? null,
        evidence: result.evidence?.[dim.id] ?? null,
      }));

      setAssessmentScores(scores); await saveToDashboard(portfolio, scores); setView('results');
    } catch (err: any) {
      setEvalError('Evaluation failed. Please check your portfolio is complete and try again.');
      console.error(err);
    } finally { setIsEvaluating(false); }
  };

  const generateCertificate = async () => {
    if (!certName.trim() || !allProficient) return;
    setIsGenCert(true);
    try {
      const r = await fetch('/api/generate-certificate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: certName.trim(), certification: CERT_NAME, scores: assessmentScores, sessionId,
          date: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
          theme: 'amber', subtitle: 'Community Impact Track',
          description: 'Has demonstrated the ability to advise young Nigerian entrepreneurs — with accurate business knowledge, practical recommendations within real budget constraints, and clear action plans grounded in the economic realities of Oloibiri, Bayelsa State, and Nigeria.',
        }),
      });
      if (!r.ok) throw new Error('Certificate generation failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${certName.trim().replace(/\s+/g, '_')}_Entrepreneurship_Consultant_Certificate.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch { alert('Certificate generation failed. Please try again.'); }
    finally { setIsGenCert(false); }
  };

  const VoiceBar = ({ text }: { text: string }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(text)}
        className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isSpeaking ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
        {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
    </div>
  );

  // ─── Active session UI ────────────────────────────────────────────────────────

  if (activePersona) {
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <EntrepreneurCertBackground />
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-4 relative z-10">
          <div className="flex items-center gap-3 p-4 bg-gray-800/80 border border-gray-700/50 rounded-2xl mb-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>{activePersona.emoji}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{activePersona.name}, {activePersona.age}</p>
              <p className="text-xs text-gray-400">{activePersona.occupation}</p>
              <p className="text-xs text-gray-500 mt-0.5">{userTurnCount} turn{userTurnCount !== 1 ? 's' : ''} · {userTurnCount >= 3 ? '✅ Ready to save' : `${3 - userTurnCount} more turns to save`}</p>
            </div>
            <div className="flex gap-2">
              <div className="flex rounded-xl overflow-hidden border border-gray-600">
                {(['pidgin', 'english'] as const).map(m => (
                  <button key={m} onClick={() => setVoiceMode(m)}
                    className={`px-2 py-2 text-xs font-bold border-r border-gray-600 last:border-0 transition-all ${voiceMode===m?(m==='english'?'bg-blue-600 text-white':'bg-green-600 text-white'):'bg-gray-700 text-gray-400'}`}>
                    {m==='english'?'🇬🇧':'🇳🇬'}
                  </button>
                ))}
              </div>
              <button onClick={saveSession} disabled={userTurnCount < 3}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-colors ${userTurnCount >= 3 ? `bg-gradient-to-r ${activePersona.colour} text-white` : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                <CheckCircle size={13} /> Save Session
              </button>
              <button onClick={() => { stopSpeaking(); setActivePersona(null); setSessionMessages([]); }}
                className="p-2 text-gray-400 hover:text-gray-200 bg-gray-700 rounded-xl transition-colors"><X size={14} /></button>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-amber-900/40 border border-amber-500/20 rounded-xl mb-3 flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-400 flex-shrink-0" />
            <p className="text-xs text-gray-300">Ask about their capital and situation before advising. Give one specific, affordable first step. Acknowledge their ambition while being honest about risks.</p>
          </div>

          <div className="flex-1 bg-gray-800/80 border border-gray-700/50 rounded-2xl flex flex-col overflow-hidden" style={{ height: '420px' }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {sessionMessages.map(msg => (
                <div key={msg.id} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-base flex-shrink-0`}>{activePersona.emoji}</div>}
                  <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-amber-600 text-white rounded-tr-sm' : 'bg-gray-700 text-gray-100 rounded-tl-sm'}`}>
                    <p className="text-[10px] font-bold mb-1 opacity-60">{msg.role === 'user' ? 'You (Advisor)' : activePersona.name}</p>
                    {msg.content}
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center flex-shrink-0"><Briefcase size={14} className="text-white" /></div>}
                </div>
              ))}
              {isSending && (
                <div className="flex items-start gap-2">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-base flex-shrink-0`}>{activePersona.emoji}</div>
                  <div className="bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3"><div className="flex gap-1.5">{[0,150,300].map(d=><div key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</div></div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-gray-700/50 p-3">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown} rows={2} placeholder={`Advise ${activePersona.name}…`}
                  disabled={isSending}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500 resize-none leading-relaxed disabled:opacity-50"
                />
                <div className="flex flex-col gap-1.5">
                  <button onClick={toggleListening} className={`p-2.5 rounded-xl transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>{isListening ? <MicOff size={15} /> : <Mic size={15} />}</button>
                  <button onClick={sendMessage} disabled={!inputText.trim() || isSending}
                    className={`p-2.5 rounded-xl transition-colors ${inputText.trim() && !isSending ? `bg-gradient-to-br ${activePersona.colour} text-white` : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}><Send size={15} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Overview ─────────────────────────────────────────────────────────────────

  if (view === 'overview') {
    const wFilled = writtenFilled(portfolio);
    const sCount  = portfolio.sessions.length;
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <EntrepreneurCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
            <VoiceBar text="Welcome to the Entrepreneurship Consultant Certification. Complete three written sections and at least two live consultations, then submit for evaluation." />

            <div className="p-6 bg-gradient-to-br from-amber-900/50 to-orange-900/30 border border-amber-500/25 rounded-2xl text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
                <Briefcase size={32} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Entrepreneurship Consultant Certification</h1>
              <p className="text-sm text-amber-300">Community Impact Track · {branding.institutionName}</p>
              <div className="flex justify-center">
                <PidginTooltip
                  originalText={`Community Impact Track · ${branding.institutionName}`}
                  hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                />
              </div>
              <p className="text-sm text-gray-300 leading-relaxed max-w-md mx-auto">
                Prove you can advise young Nigerians starting businesses — with accurate knowledge of CAC registration, pricing, WhatsApp marketing, Ajo savings, and lean business planning.
              </p>
            </div>

            <div className="p-5 bg-gray-800/70 border border-gray-700/50 rounded-2xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">What you need to complete</h2>
              <div className="space-y-3">
                {[
                  { icon: <PenLine size={16} />, colour: 'text-amber-400', title: 'Written Portfolio (3 sections)',
                    desc: 'Your consulting approach, a 4-question business knowledge test (including a pricing calculation), and a lean business plan for a given entrepreneur scenario.',
                    done: wFilled === 3, progress: `${wFilled}/3 completed` },
                  { icon: <MessageSquare size={16} />, colour: 'text-orange-400', title: `Consultation Sessions (minimum ${MIN_SESSIONS})`,
                    desc: 'Live role-plays — the AI plays a young Nigerian with a business challenge, you are the advisor. At least 3 turns each, with different entrepreneurs.',
                    done: sCount >= MIN_SESSIONS, progress: `${sCount}/${MIN_SESSIONS} completed` },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-700/40">
                    <div className={`flex-shrink-0 mt-0.5 ${item.colour}`}>{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        {item.done && <CheckCircle size={14} className="text-amber-400 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                      <p className={`text-xs font-semibold mt-1 ${item.done ? 'text-amber-400' : 'text-gray-500'}`}>{item.progress}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 bg-gray-800/70 border border-gray-700/50 rounded-2xl space-y-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">You'll be assessed on</h2>
              <div className="space-y-2">
                {RUBRIC_DIMENSIONS.map(d => (
                  <div key={d.id} className="flex items-start gap-2 text-sm">
                    <Briefcase size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div><span className="font-semibold text-gray-200">{d.label}</span><span className="text-gray-400"> — {d.desc}</span></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 pt-1">Proficient (2/3) or above on all five dimensions required for certification.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setView('build')}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold rounded-xl transition-all">
                {portfolioReady(portfolio) ? 'Continue Portfolio' : 'Build Portfolio'} <ArrowRight size={16} />
              </button>
              {portfolioReady(portfolio) && (
                <button onClick={handleEvaluate} disabled={isEvaluating}
                  className="flex items-center gap-2 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors">
                  {isEvaluating ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />} Evaluate
                </button>
              )}
            </div>
            {assessmentScores.length > 0 && (
              <button onClick={() => setView('results')} className="w-full py-2 text-xs text-amber-400 hover:text-amber-300 transition-colors underline">View previous evaluation results →</button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ─── Build ────────────────────────────────────────────────────────────────────

  if (view === 'build') {
    const wFilled = writtenFilled(portfolio);
    const sCount  = portfolio.sessions.length;
    const ready   = portfolioReady(portfolio);
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <EntrepreneurCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setView('overview')} className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors">← Overview</button>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className={wFilled === 3 ? 'text-amber-400 font-semibold' : ''}>Written {wFilled}/3</span>
                <span>·</span>
                <span className={sCount >= MIN_SESSIONS ? 'text-amber-400 font-semibold' : ''}>Sessions {sCount}/{MIN_SESSIONS}</span>
                {ready && <CheckCircle size={13} className="text-amber-400" />}
              </div>
            </div>

            <div className="flex gap-1 p-1 bg-gray-800/70 rounded-xl">
              {(['written', 'sessions'] as BuildTab[]).map(tab => (
                <button key={tab} onClick={() => setBuildTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${buildTab === tab ? 'bg-amber-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  {tab === 'written' ? `Written Portfolio (${wFilled}/3)` : `Consultations (${sCount}/${MIN_SESSIONS})`}
                </button>
              ))}
            </div>

            {buildTab === 'written' && (
              <div className="space-y-4">
                {WRITTEN_SECTIONS.map(sec => {
                  const val = portfolio[sec.key]; const done = val.trim().length > 30;
                  return (
                    <div key={sec.key} className={`rounded-2xl border ${sec.colour} p-5 space-y-3`}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{sec.icon}</span>
                        <h3 className="text-sm font-bold text-white flex-1">{sec.label}</h3>
                        {done && <CheckCircle size={14} className="text-amber-400 flex-shrink-0" />}
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <Lightbulb size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">{sec.tip}</p>
                      </div>
                      <textarea value={val} onChange={e => setWritten(sec.key, e.target.value)}
                        rows={sec.rows} placeholder={sec.placeholder}
                        className="w-full bg-gray-800/80 border border-gray-600/50 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-amber-500 resize-none leading-relaxed"
                      />
                      <p className="text-right text-xs text-gray-600">{val.length} characters</p>
                    </div>
                  );
                })}
                <button onClick={() => setBuildTab('sessions')}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-amber-800 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-colors">
                  Next: Consultation Sessions <ArrowRight size={14} />
                </button>
              </div>
            )}

            {buildTab === 'sessions' && (
              <div className="space-y-4">
                {portfolio.sessions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Completed Consultations</p>
                    {portfolio.sessions.map(s => (
                      <div key={s.personaId} className="flex items-center gap-3 p-3 bg-amber-900/40 border border-amber-500/25 rounded-xl">
                        <span className="text-2xl">{s.personaEmoji}</span>
                        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white">{s.personaName}</p><p className="text-xs text-gray-400">{s.turnCount} turns · saved</p></div>
                        <CheckCircle size={16} className="text-amber-400" />
                        <button onClick={() => removeSession(s.personaId)} className="p-1 text-gray-600 hover:text-red-400"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {portfolio.sessions.length < MIN_SESSIONS ? `Choose an entrepreneur to advise (need ${MIN_SESSIONS - portfolio.sessions.length} more)` : 'Add more consultations (optional)'}
                  </p>
                  {ENTREPRENEUR_PERSONAS.map(persona => {
                    const done = portfolio.sessions.some(s => s.personaId === persona.id);
                    return (
                      <button key={persona.id} onClick={() => startSession(persona)}
                        className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all ${done ? 'border-amber-500/30 bg-amber-900/30 opacity-75' : 'border-gray-700/50 bg-gray-800/50 hover:border-amber-500/50 hover:bg-gray-700/50'}`}>
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${persona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>{persona.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white">{persona.name}, {persona.age}</p>
                            {done && <CheckCircle size={13} className="text-amber-400" />}
                          </div>
                          <p className="text-xs text-gray-400">{persona.mainChallenge}</p>
                          <p className="text-xs text-gray-500 mt-1 italic">"{persona.openingLine.slice(0, 85)}…"</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-500 flex-shrink-0 mt-2" />
                      </button>
                    );
                  })}
                </div>

                {ready && (
                  <div className="space-y-3 pt-2">
                    <div className="p-3 bg-amber-900/40 border border-amber-500/25 rounded-xl flex items-center gap-2">
                      <CheckCircle size={15} className="text-amber-400" />
                      <p className="text-sm text-amber-300 font-semibold">Portfolio complete! Ready to evaluate.</p>
                    </div>
                    <button onClick={handleEvaluate} disabled={isEvaluating}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                      {isEvaluating ? <><Loader2 size={16} className="animate-spin" /> Evaluating portfolio…</> : <><Star size={16} /> Submit for Evaluation</>}
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

  // ─── Results ──────────────────────────────────────────────────────────────────

  if (view === 'results') {
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <EntrepreneurCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            <VoiceBar text={`Your Entrepreneurship Consultant Certification results are ready. ${allProficient ? 'Congratulations — you have achieved certification level on all criteria!' : 'Continue building your portfolio and try again.'}`} />

            {overallScore !== null && (
              <div className={`p-5 rounded-2xl border ${allProficient ? 'bg-amber-900/40 border-amber-500/30' : 'bg-gray-800/70 border-gray-700/50'} flex items-center gap-5`}>
                <ScoreRing score={Math.round(overallScore)} />
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-white">{overallScore.toFixed(1)} / 3.0 overall</p>
                  <p className={`text-sm font-semibold ${allProficient ? 'text-amber-400' : 'text-orange-400'}`}>
                    {allProficient ? '🎓 Certification level achieved on all criteria!' : 'Proficient (2/3) required on all criteria.'}
                  </p>
                </div>
                {allProficient && (
                  <button onClick={() => setView('certificate')}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
                    <Trophy size={15} /> Get Certificate
                  </button>
                )}
              </div>
            )}

            {assessmentScores.length > 0 && (
              <div className="space-y-2">
                {assessmentScores.map(sc => {
                  const dim = RUBRIC_DIMENSIONS.find(d => d.label === sc.assessment_name);
                  const { text, color, bg, border } = scoreLabel(sc.score);
                  return (
                    <div key={sc.assessment_name} className={`rounded-xl border ${border} ${bg} p-4`}>
                      <div className="flex items-center gap-3 mb-2">
                        <ScoreRing score={sc.score} />
                        <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white">{sc.assessment_name}</p><p className={`text-xs font-semibold ${color}`}>{text}</p></div>
                      </div>
                      {sc.evidence && <p className="text-xs text-gray-300 leading-relaxed pl-14">{sc.evidence}</p>}
                      {dim && sc.score !== null && sc.score < 2 && (
                        <div className="mt-2 pl-14 text-[10px] text-blue-300 leading-relaxed"><span className="text-gray-500">To reach Proficient: </span>{dim.desc}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {evalError && <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2 text-sm"><AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}</div>}

            <div className="flex flex-wrap gap-3">
              <button onClick={() => setView('build')} className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-xl transition-colors"><PenLine size={14} /> Continue Building</button>
              <button onClick={handleEvaluate} disabled={isEvaluating}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                {isEvaluating ? <><Loader2 size={14} className="animate-spin" /> Evaluating…</> : <><RefreshCw size={14} /> Re-evaluate</>}
              </button>
              {allProficient && (
                <button onClick={() => setView('certificate')} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:opacity-90 text-white text-sm font-bold rounded-xl transition-colors">
                  <Trophy size={14} /> Get Certificate
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Certificate ──────────────────────────────────────────────────────────────

  if (view === 'certificate') {
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <EntrepreneurCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            <VoiceBar text="Enter your name to generate your Entrepreneurship Consultant Certificate." />
            {!allProficient && (
              <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 flex gap-2 text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />You need Proficient (2/3) or above on all five criteria. Continue building and re-evaluate.
              </div>
            )}
            {allProficient && (
              <>
                <div className="p-6 bg-gradient-to-br from-amber-900/50 to-orange-900/30 border border-amber-500/25 rounded-2xl text-center space-y-4">
                  <Trophy size={48} className="text-amber-400 mx-auto" />
                  <div>
                    <h2 className="text-xl font-bold text-white">🎓 Certification Achieved!</h2>
                    <p className="text-sm text-gray-300 mt-1 max-w-sm mx-auto">You have demonstrated the ability to advise young Nigerian entrepreneurs with accurate business knowledge, practical guidance, and clear action plans. Enter your name to download your certificate.</p>
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
                  <label className="block text-sm font-semibold text-gray-300">Full name as it should appear on the certificate:</label>
                  <input type="text" value={certName} onChange={e => setCertName(e.target.value)} placeholder="e.g. Amara Johnson"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-amber-500 text-base" />
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                    {isGenCert ? <><Loader2 size={18} className="animate-spin" /> Generating PDF…</> : <><Download size={18} /> Download Certificate</>}
                  </button>
                  <p className="text-center text-xs text-gray-500">{`Amber-themed PDF · ${branding.institutionName}`}</p>
                </div>
              </>
            )}
            <button onClick={() => setView('overview')} className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">← Back to Overview</button>
          </div>
        </main>
      </div>
    );
  }

  return null;
};

export default EntrepreneurshipConsultantCertificationPage;