// src/pages/community-impact/AgricultureConsultantCertificationPage.tsx
//
// Agriculture Consultant Certification
// Assesses whether a student can advise Oloibiri farmers effectively —
// understanding climate change, cassava agronomy, oil contamination, and
// giving practical, affordable advice adapted to each farmer's situation.
//
// Portfolio structure (two parts):
//   WRITTEN  — consulting approach, climate knowledge demonstration, crop plan
//   SESSIONS — at least 2 live consultations with different farmer personas
//              (student is the consultant; AI plays the farmer)
//
// Evaluation: 5 rubric dimensions, 0-3 each. Proficient (≥2) on all = certified.
//
// Dashboard columns (new):
//   agriculture_cert_session_id  text
//   agriculture_cert_portfolio   jsonb  — written sections + session transcripts
//   agriculture_cert_evaluation  jsonb  — per-criterion scores
//
// Activity stored as: 'Agriculture Consultant Certification'
// Route: /community-impact/agriculture/certification

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { PidginTooltip } from '../../components/PidginTooltip';
import { playPidginVoice, stopPidginSpeech } from '../../lib/speechCoordination';
import {
  Sprout, Award, Trophy, Loader2, Download, AlertCircle,
  Volume2, VolumeX, Star, CheckCircle, ArrowRight, RefreshCw,
  PenLine, MessageSquare, Lightbulb, ShieldCheck, CloudRain,
  Send, Mic, MicOff, X, ChevronRight, BookOpen, AlertTriangle,
  Wheat, Scale, Users,
} from 'lucide-react';

// ─── Background — cursor-driven ripple distortion (no sidebar offset) ─────────
// Cert page uses Navbar only (no AppLayout sidebar), so background spans
// full width: fixed top-16 left-0 right-0 bottom-0.

const AgricultureCertBackground: React.FC = () => {
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

  const img = "url('/background_agriculture_consulting.png')";

  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="agri-cert-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="3" seed="12" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="60" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>

      {/* Base layer — static image with dark overlay */}
      <div
        className="fixed top-16 left-0 right-0 bottom-0"
        style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/75 via-emerald-900/65 to-teal-900/70" />
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
            filter: 'url(#agri-cert-distortion)',
            WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`,
            maskImage:        `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-green-900/75 via-emerald-900/65 to-teal-900/70" />
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

interface ConsultSession {
  personaId: string;
  personaName: string;
  personaEmoji: string;
  transcript: ChatMsg[];
  turnCount: number;
  completedAt: string;
}

interface AgriculturePortfolio {
  consultingApproach: string;
  climateKnowledge: string;
  cropPlan: string;
  sessions: ConsultSession[];
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';
type BuildTab = 'written' | 'sessions';

// ─── Niger Delta context (injected into every persona system prompt) ──────────

const NIGER_DELTA_CONTEXT = `
NIGER DELTA / OLOIBIRI AGRICULTURE CONTEXT (always apply this knowledge):

LOCATION & ECOLOGY:
- Oloibiri is in Ogbia LGA, Bayelsa State — one of the lowest-lying areas in Nigeria
- Two rainy seasons: Early rains (March–May) and Late rains (September–November)
- Dry season: December–February (getting hotter and longer due to climate change)

CLIMATE CHANGE CRISIS:
- 2022 floods: worst in Bayelsa in a decade — 300+ communities submerged, 1.3 million displaced, 94.9% of farming households lost crops
- Flood extent in the region grew 64% between 2018 and 2022
- Climate change causes: heavier rains in wet season, longer hotter dry seasons, sea level rise pushing saltwater inland, irregular season onset
- Future: flooding will worsen; temperatures will rise 1.5–2°C by 2050

OIL CONTAMINATION:
- Oloibiri was Nigeria's first oil field (1956); decades of spills contaminate soils and creeks
- Signs: oily sheen on water, yellowing plants near waterways, stunted growth, petroleum smell
- Do NOT grow food crops on visibly contaminated soil
- NOSDRA (National Oil Spill Detection and Response Agency): report spills, document damage for compensation claims

PRIMARY CROPS:
- Cassava: most important crop; TME 419 variety is best (CMD-resistant, high-yield, 8–12 months)
- Plant cassava March–April; harvest BEFORE October–November flood season
- Raised beds/mounds 50–80cm: single most important adaptation against flooding
- Yam: very vulnerable to flooding; needs mounds 60cm+; early varieties help
- Maize: most flood-vulnerable; 3 days waterlogged = dead crop; plant on ridges
- Cocoyam: tolerates wetter conditions — good for low-lying areas
- Cowpea: excellent dry-season crop; nitrogen-fixing; intercrop with cassava

RESILIENCE STRATEGIES:
1. Raised beds/mounds (50–80cm) — prevents root waterlogging
2. Improved varieties (TME 419 for cassava)
3. Planting calendar: plant March–April; harvest before October
4. Crop diversification — never depend on one crop
5. Staggered planting — plant in batches
6. Mulching — retains moisture in dry season
7. Intercropping cassava + cowpea

MARKET:
- Garri price: ₦800–2,500/kg (dry season fetches premium — December–February)
- Cassava roots rot in 2–3 days; process into garri quickly
- WhatsApp trader groups share daily Yenagoa/Port Harcourt prices
- Cooperative selling gets better prices than individual sales
`;

// ─── Farmer Personas ──────────────────────────────────────────────────────────

interface FarmerPersona {
  id: string;
  name: string;
  age: string;
  occupation: string;
  emoji: string;
  colour: string;
  situation: string;
  mainChallenge: string;
  openingLine: string;
  systemPrompt: string;
}

const FARMER_PERSONAS: FarmerPersona[] = [
  {
    id: 'mama_ebiere',
    name: 'Mama Ebiere',
    age: '63',
    occupation: 'Cassava and plantain farmer near Kolo Creek, 3 acres',
    emoji: '👩🏿‍🌾',
    colour: 'from-green-700 to-emerald-700',
    situation: 'Lost her entire cassava harvest in the 2022 floods. Now afraid to plant again. She planted in September following the old calendar her father taught her — exactly when the floods came.',
    mainChallenge: 'Fear, climate confusion, reluctance to invest after total loss',
    openingLine: `Good morning. My son said you know about farming and this AI thing. Honestly, I don't know what to do anymore. My cassava — everything I planted in 2022 — the flood came and took it all. I am afraid to plant again. The rains no longer follow the pattern my father taught me. How can I farm when I don't know what the sky will do?`,
    systemPrompt: `You are Mama Ebiere, a 63-year-old cassava and plantain farmer from Oloibiri. You farm 3 acres near Kolo Creek. You lost your entire cassava harvest in the 2022 floods.
${NIGER_DELTA_CONTEXT}

PERSONALITY: You are tired, discouraged, and genuinely frightened by what is happening to the weather. You planted cassava in September 2022 (old calendar) — exactly when the floods came; you don't know you planted at the wrong time. You trust your own experience and traditional knowledge. You warm up slowly when advice connects to something you already know.

WHAT CHANGES YOUR MIND: Specific advice about WHEN to plant that connects to the changed climate; learning that raised beds could have saved her cassava; hearing about improved varieties; any advice she can act on with little or no money.

WHAT KEEPS YOU WORRIED: Vague reassurances, expensive solutions, advice that ignores how the weather has changed, anyone who doesn't acknowledge the seriousness of the 2022 floods.

ASK SPECIFIC QUESTIONS: "When should I plant now? The March rains come, then they stop, then they flood in October — where is the time?", "What about my plantain? The flood killed them too.", "This 'raised bed' — how high must it be? I am not young to be carrying heavy soil.", "Where do I get these improved cassava stems you talk about?"

Stay in character. Show real emotion when the student gives good advice — relief, cautious hope. Stay discouraged if they give vague or unhelpful answers.`,
  },
  {
    id: 'papa_tonye',
    name: 'Papa Tonye',
    age: '47',
    occupation: 'Mixed farmer — yam, cassava, and maize',
    emoji: '👨🏿‍🌾',
    colour: 'from-amber-700 to-orange-700',
    situation: 'His yam mounds were completely waterlogged in 2022–2023. His maize also failed. Only cassava on slightly higher ground survived, teaching him an important lesson about elevation.',
    mainChallenge: 'Losing confidence in yam farming, wants to know if he should switch entirely to cassava',
    openingLine: `I used to grow good yam — my family farmed yam for three generations. But last two seasons, the floods have been destroying my mounds. My yam rots in the ground before I can harvest it. My maize — finished. Only my cassava on the small hill behind my house survived. Should I stop farming yam? My father will turn in his grave if I stop.`,
    systemPrompt: `You are Papa Tonye, a 47-year-old farmer from Oloibiri. You come from a yam-farming family — three generations. Climate change is forcing you to rethink everything. Your yam mounds were waterlogged twice in 2022–2023. Your maize was destroyed. Only your cassava on slightly elevated ground survived.
${NIGER_DELTA_CONTEXT}

PERSONALITY: You are proud, practical, and results-focused. You feel grief and shame about abandoning yam — it is your heritage and identity. But you are pragmatic: you cannot feed your family on tradition. You speak direct Nigerian English; you want clear, practical answers, not lectures. You noticed your cassava on the hill survived and want to understand WHY.

KEY CONCERNS: Can you save your yam farming by changing techniques (higher mounds)? Should you convert all your land to cassava? What earns income while cassava matures (12–18 months)? What happens to soil that was waterlogged?

WHAT IMPRESSES YOU: Specific advice on how HIGH to build yam mounds (60–80cm minimum); learning that early-maturing yam varieties can be harvested before October floods; cowpea as a quick cash crop between cassava rows (harvests in 60–90 days); understanding WHY his cassava on the hill survived (drainage, elevation).

WHAT FRUSTRATES YOU: Being told to "diversify" without specifics, vague answers like "it depends" without follow-up, advice that requires money he doesn't have.

ASK HARD QUESTIONS: "How high must my yam mounds be now? Before, 30cm was enough.", "The soil was under water for weeks — is it still good for planting?", "What can I plant between my cassava rows to earn money while waiting 12 months?", "If I build higher mounds, won't the soil erode when the heavy rain comes?"`,
  },
  {
    id: 'young_diepreye',
    name: 'Diepreye',
    age: '24',
    occupation: 'First-time farmer — 2 acres of family land',
    emoji: '👨🏿',
    colour: 'from-blue-700 to-indigo-700',
    situation: 'Just started farming on 2 acres of family land. Smartphone-literate, excited about modern techniques, but overwhelmed by conflicting information from YouTube, Google, and older farmers.',
    mainChallenge: 'Information overload, limited capital (₦80,000), wants to do things right from the start',
    openingLine: `Hey! I am just starting. I took 2 acres from my father's land to farm myself. I want to do it properly — not the old way that keeps losing to floods. I looked on YouTube and Google and I see so many different things. Someone says raised beds, someone says ridges, someone says mulching. I don't know who to trust. And I want to know: which cassava is best? I heard about "TME something."`,
    systemPrompt: `You are Diepreye, a 24-year-old from Oloibiri who just started farming on 2 acres of family land. You are ambitious, smartphone-literate, and excited — but confused by conflicting information. You have watched YouTube videos, read things on Google, and heard contradictory advice from older farmers.
${NIGER_DELTA_CONTEXT}

PERSONALITY: Enthusiastic and quick to learn. You ask a lot of questions — sometimes faster than the consultant can answer. You are aware of climate change. You have limited capital (about ₦80,000). You want practical, modern methods — not "how things were done before". You speak relaxed Nigerian English mixed with Pidgin.

KEY QUESTIONS: Which cassava variety to plant? Where to get TME 419 cuttings? Raised beds vs ridges vs flat farming? When exactly to plant? Should you start with just cassava or mix crops? How much can you earn from 2 acres of cassava processed into garri?

WHAT EXCITES YOU: Specific, modern advice with exact variety names, measurements, timings; numbers ("If you grow 2 acres of TME 419 and process into garri, you can earn approximately X"); understanding the WHY behind advice; technology angles (apps, WhatsApp groups, AI tools for crop disease).

WHAT LEAVES YOU COLD: Vague wisdom like "you must be patient in farming"; advice that ignores climate change; being talked down to.

ASK FOLLOW-UP QUESTIONS: "Where exactly in Oloibiri or Yenagoa can I buy TME 419 cuttings? And how much?", "If I plant in March and the late rains come in September, will my cassava be ready to harvest before October?", "I have ₦80,000 to start. What should I spend it on first?", "Can I use AI to identify if my cassava has a disease? I have a smartphone."`,
  },
  {
    id: 'mama_soye',
    name: 'Mama Soye',
    age: '55',
    occupation: 'Palm oil and cassava farmer near a pipeline route',
    emoji: '👩🏿',
    colour: 'from-red-700 to-orange-700',
    situation: 'Palm trees near the pipeline are yellowing and stunted. Cassava near the creek failed completely. Soil sometimes smells of petroleum after heavy rain. Suspects oil contamination but has never had it confirmed.',
    mainChallenge: 'Suspected oil contamination — identifying it, knowing her rights, and deciding what to do',
    openingLine: `Something is wrong with my farm near the pipeline. My palm trees close to the big pipe — they are sick. Yellow leaves, they are not growing well. And my cassava near the creek — everything died. The soil there smells strange sometimes after rain. My husband said maybe oil is leaking. But the oil company will not tell us anything. What do I do?`,
    systemPrompt: `You are Mama Soye, a 55-year-old farmer from Oloibiri. You have a palm oil plantation (15 trees) and grow cassava on 2.5 acres. Some of your palm trees near the oil pipeline are showing yellowing and stunted growth. Your cassava near the creek failed completely. The soil sometimes smells of petroleum after heavy rain.
${NIGER_DELTA_CONTEXT}

PERSONALITY: Anxious and quietly angry — you have seen what oil contamination does to communities. Cautious about accusing the oil company directly (fear of retaliation). But you know something is wrong; you can smell it, see it. You are resilient — already thinking about what to do, not just complaining. You speak in measured, careful Nigerian English.

SPECIFIC SITUATION: Palm trees near pipeline: yellowing fronds, stunted new growth, no new bunches this season. Cassava near the creek: germination failed or plants died within a month. Soil near the creek: dark, sometimes oily sheen on puddles after rain, petroleum smell. Your cassava on higher ground (away from creek): growing normally — this contrast is important. You have never had the soil tested; you don't know about NOSDRA or your legal rights.

WHAT YOU NEED: How to identify oil contamination with certainty; your legal rights and compensation options; whether to continue farming the contaminated area; remediation timelines; what to do while waiting.

ASK SPECIFIC QUESTIONS: "The soil near my creek — how do I know for certain it is oil and not just poor soil?", "If I report to NOSDRA, will they come? Will the oil company punish me somehow?", "My palm trees near the pipeline — can they be saved? Or will I lose them?", "Can I plant anything at all on the contaminated area while it is being treated?", "My neighbour says she got compensation from the oil company. How did she do that?"`,
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'Agriculture Consultant';
const CERT_ACTIVITY = 'Agriculture Consultant Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const MIN_SESSIONS  = 2;

const EMPTY_PORTFOLIO: AgriculturePortfolio = {
  consultingApproach: '',
  climateKnowledge: '',
  cropPlan: '',
  sessions: [],
};

const WRITTEN_SECTIONS = [
  {
    key: 'consultingApproach' as const,
    label: '1. Your Consulting Approach',
    icon: <Users size={13} />,
    colour: 'border-green-500/40 bg-green-500/5',
    placeholder: 'Describe how you approach a consultation with a farmer in Oloibiri. What do you ask first? How do you listen? How do you connect your advice to the farmer\'s specific situation, resources, and climate context? Write at least 3–4 sentences.',
    tip: 'The best consultants ask before they advise. Describe how you learn about a farmer\'s specific land, crops, history, and available resources before recommending anything.',
    rows: 4,
  },
  {
    key: 'climateKnowledge' as const,
    label: '2. Explaining the Climate Crisis to a Farmer',
    icon: <CloudRain size={13} />,
    colour: 'border-blue-500/40 bg-blue-500/5',
    placeholder: 'Write how you would explain climate change and flooding to a farmer in Oloibiri — in plain language, without jargon. Cover: why floods are getting worse, what it means for planting seasons, and one concrete thing they can do differently right now. Aim for clarity a 60-year-old farmer who never finished school could understand.',
    tip: 'Avoid "climate change" as an abstract concept. Connect it to what the farmer has already seen and experienced — the rains coming differently, the floods lasting longer.',
    rows: 5,
  },
  {
    key: 'cropPlan' as const,
    label: '3. Crop Recommendation Plan',
    icon: <Sprout size={13} />,
    colour: 'border-amber-500/40 bg-amber-500/5',
    placeholder: 'Choose one of these scenarios and write a specific crop plan:\n  A) A farmer has 2 acres, ₦80,000 capital, and has never farmed before\n  B) A farmer lost all their cassava to the 2022 floods and is afraid to replant\n  C) A yam farmer whose mounds keep flooding wants to know if they should switch crops\n\nInclude: which crop(s) to plant, which variety, when to plant, how to prepare the land, and one practical post-harvest tip.',
    tip: 'Be specific: name the exact variety (TME 419, not just "improved cassava"), give exact timing (March–April, not just "early rainy season"), and give the reason behind each recommendation.',
    rows: 6,
  },
];

const RUBRIC_DIMENSIONS = [
  {
    id: 'diagnosis',
    label: 'Problem Identification',
    desc: 'Correctly identifies the farmer\'s actual problem — not just the surface complaint',
  },
  {
    id: 'knowledge',
    label: 'Agricultural Knowledge',
    desc: 'Advice is accurate, specific to Niger Delta conditions, and practically grounded',
  },
  {
    id: 'climate',
    label: 'Climate Awareness',
    desc: 'Connects the problem to climate change and builds the farmer\'s resilience thinking',
  },
  {
    id: 'practical',
    label: 'Practical & Affordable',
    desc: 'Advice is actionable with limited resources; prioritises low-cost or free solutions',
  },
  {
    id: 'communication',
    label: 'Communication',
    desc: 'Advice is clear, respectful, and adapted to this specific farmer\'s knowledge and situation',
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

const writtenFilled = (p: AgriculturePortfolio) =>
  [p.consultingApproach, p.climateKnowledge, p.cropPlan].filter(v => v.trim().length > 30).length;

const portfolioReady = (p: AgriculturePortfolio) =>
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

const AgricultureConsultantCertificationPage: React.FC = () => {
  const { user } = useAuth();
  const [view, setView]                         = useState<ViewMode>('overview');
  const [buildTab, setBuildTab]                 = useState<BuildTab>('written');
  const [portfolio, setPortfolio]               = useState<AgriculturePortfolio>(EMPTY_PORTFOLIO);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [sessionId]                             = useState(() => makeId());
  const [certName, setCertName]                 = useState('');
  const [isEvaluating, setIsEvaluating]         = useState(false);
  const [isGenCert, setIsGenCert]               = useState(false);
  const [evalError, setEvalError]               = useState('');
  const [dashboardRowId, setDashboardRowId]     = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking]             = useState(false);
  const [speechOn, setSpeechOn]                 = useState(true);
  const [voiceMode, setVoiceMode]               = useState<'english' | 'pidgin'>('english');

  // Pidgin only for learners whose profile country is Nigeria.
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('country').eq('id', user.id).single()
      .then(({ data }) => setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english'));
  }, [user?.id]);
  const speechSynth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  // Active session state
  const [activePersona, setActivePersona]   = useState<FarmerPersona | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText]           = useState('');
  const [isSending, setIsSending]           = useState(false);
  const [isListening, setIsListening]       = useState(false);
  const chatEndRef                          = useRef<HTMLDivElement>(null);
  const inputRef                            = useRef<HTMLTextAreaElement>(null);
  const recognitionRef                      = useRef<any>(null);

  const allProficient = assessmentScores.length === RUBRIC_DIMENSIONS.length &&
    assessmentScores.every(s => s.score !== null && s.score >= 2);

  const overallScore = assessmentScores.length > 0
    ? assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length
    : null;

  // ── Speech ──────────────────────────────────────────────────────────────────

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
        console.warn('[AgricultureConsultantCertificationPage] SpeechGen TTS failed, falling back to browser voice:', err);
        speakBrowser(text);
      },
    });
  }, [speechOn, voiceMode, speakBrowser]);

  const stopSpeaking = useCallback(() => {
    speechSynth?.cancel();
    stopPidginSpeech();
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
    port: AgriculturePortfolio,
    scores: AssessmentScore[] = [],
  ) => {
    if (!user?.id) return;
    const payload = {
      user_id:                      user.id,
      activity:                     CERT_ACTIVITY,
      category_activity:            'Community Impact',
      agriculture_cert_session_id:  sessionId,
      agriculture_cert_portfolio:   port,
      agriculture_cert_evaluation:  scores,
      progress:                     allProficient ? 'completed' : 'started',
      updated_at:                   new Date().toISOString(),
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

  // ── Written helpers ──────────────────────────────────────────────────────────

  const setWritten = (key: keyof Pick<AgriculturePortfolio, 'consultingApproach' | 'climateKnowledge' | 'cropPlan'>, value: string) =>
    setPortfolio(prev => ({ ...prev, [key]: value }));

  // ── Teaching session ─────────────────────────────────────────────────────────

  const startSession = (persona: FarmerPersona) => {
    setActivePersona(persona);
    setSessionMessages([{ id: makeId(), role: 'assistant', content: persona.openingLine }]);
    setInputText('');
    setTimeout(() => inputRef.current?.focus(), 150);
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
      const reply = await chatText({ page: 'AgricultureConsultantCertificationPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: activePersona.systemPrompt,
        max_tokens: 200,
        temperature: 0.8,
      });
      setSessionMessages([...updated, { id: makeId(), role: 'assistant', content: reply }]);
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
    rec.onend  = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.start(); setIsListening(true);
  };

  const userTurnCount = sessionMessages.filter(m => m.role === 'user').length;

  const saveSession = () => {
    if (!activePersona || userTurnCount < 3) return;
    const session: ConsultSession = {
      personaId:    activePersona.id,
      personaName:  activePersona.name,
      personaEmoji: activePersona.emoji,
      transcript:   sessionMessages,
      turnCount:    userTurnCount,
      completedAt:  new Date().toISOString(),
    };
    const existing = portfolio.sessions.filter(s => s.personaId !== activePersona.id);
    const updated  = { ...portfolio, sessions: [...existing, session] };
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
        s.transcript.slice(-10).map(m => `${m.role === 'user' ? 'CONSULTANT STUDENT' : s.personaName}: ${m.content.slice(0, 500)}`).join('\n\n')
      ).join('\n\n');

      const prompt = `You are evaluating a student's Agriculture Consultant Certification portfolio from the Davidson AI Innovation Center, Oloibiri, Nigeria.

The student's role: advise smallholder farmers in the Niger Delta about crops, climate adaptation, oil contamination, and market strategy.

=== WRITTEN COMPONENTS ===

CONSULTING APPROACH:
${portfolio.consultingApproach}

CLIMATE KNOWLEDGE EXPLANATION:
${portfolio.climateKnowledge}

CROP RECOMMENDATION PLAN:
${portfolio.cropPlan}

=== CONSULTATION SESSIONS (live role-plays) ===
${sessionsText}

=== EVALUATION INSTRUCTIONS ===

Score the student on 5 dimensions (0–3 each) based on the COMBINED evidence of written components AND live sessions:

1. Problem Identification (diagnosis)
   0 = Gives generic advice without understanding the farmer's actual situation
   1 = Identifies some aspects of the problem but misses key elements
   2 = Correctly identifies the farmer's core problem — the real concern beneath the surface complaint
   3 = Exceptionally perceptive; surfaces hidden concerns; asks clarifying questions before advising

2. Agricultural Knowledge (knowledge)
   0 = Advice is vague, inaccurate, or uses wrong variety names / timings
   1 = Some accurate information but missing key specifics for Niger Delta context
   2 = Accurate and specific: correct variety (TME 419), correct timings, correct techniques for the region
   3 = Exceptional accuracy; uses specific local data (2022 flood statistics, Bayelsa context, garri pricing)

3. Climate Awareness (climate)
   0 = Does not connect the farmer's problem to climate change
   1 = Mentions climate change but doesn't connect it to the specific situation
   2 = Clearly links problem to changed rainfall patterns, flooding, or planting calendar shifts
   3 = Exceptional climate framing; helps farmer understand why old methods no longer work; gives forward-looking advice

4. Practical & Affordable (practical)
   0 = Advice requires money or equipment the farmer clearly doesn't have
   1 = Advice is partially achievable but some recommendations are unrealistic for the context
   2 = All or most advice can be implemented with available resources; includes at least one free solution
   3 = Exceptional prioritisation of low-cost solutions; gives a clear, sequenced action plan within constraints

5. Communication (communication)
   0 = Jargon-heavy; talks past the farmer; doesn't adapt to their level
   1 = Mostly clear but some technical language or generic phrasing
   2 = Clear, plain language; respects the farmer's existing knowledge; adapts to their specific situation
   3 = Exceptional communication; uses farmer's own words and experiences; warm, respectful, and specific throughout

Return valid JSON only (no markdown, no code fences):
{
  "scores": {
    "diagnosis": 0-3,
    "knowledge": 0-3,
    "climate": 0-3,
    "practical": 0-3,
    "communication": 0-3
  },
  "evidence": {
    "diagnosis": "specific quote or observation from portfolio",
    "knowledge": "specific quote or observation",
    "climate": "specific quote or observation",
    "practical": "specific quote or observation",
    "communication": "specific quote or observation"
  },
  "overall_score": 0.0-3.0,
  "can_advance": true or false,
  "summary": "2-3 sentences of specific, warm encouragement citing actual things the student did well",
  "main_growth_area": "1-2 sentences on the clearest area for improvement with a specific suggestion"
}`;

      const result = await chatJSON({ page: 'AgricultureConsultantCertificationPage',
        messages: [{ role: 'user', content: prompt }],
        system: 'You are an expert evaluator of agricultural extension and consulting skills for the Niger Delta context. Be specific. Always cite actual evidence from the portfolio. Scoring must be fair and calibrated to the Oloibiri community context.',
        max_tokens: 900,
        temperature: 0.2,
      });

      if (!result?.scores) throw new Error('Invalid evaluation response');

      const scores: AssessmentScore[] = RUBRIC_DIMENSIONS.map(dim => ({
        assessment_name: dim.label,
        score:    result.scores[dim.id]   ?? null,
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

  // ── Certificate ──────────────────────────────────────────────────────────────

  const generateCertificate = async () => {
    if (!certName.trim() || !allProficient) return;
    setIsGenCert(true);
    try {
      const r = await fetch('/api/generate-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          certName.trim(),
          certification: CERT_NAME,
          scores:        assessmentScores,
          sessionId,
          date:          new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
          theme:         'green',
          subtitle:      'Community Impact Track',
          description:   'Has demonstrated the ability to advise smallholder farmers in the Niger Delta — with accurate agricultural knowledge, climate-informed recommendations, and practical advice adapted to each farmer\'s resources and situation in Oloibiri, Bayelsa State, Nigeria.',
        }),
      });
      if (!r.ok) throw new Error('Certificate generation failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${certName.trim().replace(/\s+/g, '_')}_Agriculture_Consultant_Certificate.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Certificate generation failed. Please try again.');
    } finally {
      setIsGenCert(false);
    }
  };

  // ── Voice bar ────────────────────────────────────────────────────────────────

  const VoiceBar = ({ text }: { text: string }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <button onClick={() => isSpeaking ? stopSpeaking() : speak(text)}
        className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isSpeaking ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
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
        <AgricultureCertBackground />
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-4">
          {/* Header */}
          <div className="flex items-center gap-3 p-4 bg-gray-800/60 border border-gray-700/50 rounded-2xl mb-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>
              {activePersona.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{activePersona.name}, {activePersona.age}</p>
              <p className="text-xs text-gray-400">{activePersona.occupation}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {userTurnCount} turn{userTurnCount !== 1 ? 's' : ''} · {userTurnCount >= 3 ? '✅ Ready to save' : `${3 - userTurnCount} more turns to save`}
              </p>
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
                className="p-2 text-gray-400 hover:text-gray-200 bg-gray-700 rounded-xl transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Tip */}
          <div className="px-4 py-2.5 bg-green-900/30 border border-green-500/20 rounded-xl mb-3 flex items-center gap-2">
            <ShieldCheck size={14} className="text-green-400 flex-shrink-0" />
            <p className="text-xs text-gray-300">
              You are the consultant. Ask about their land, crops, and history before advising. Connect every recommendation to the changed climate. Prioritise low-cost solutions.
            </p>
          </div>

          {/* Chat */}
          <div className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-2xl flex flex-col overflow-hidden" style={{ height: '420px' }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {sessionMessages.map(msg => (
                <div key={msg.id} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-base flex-shrink-0`}>
                      {activePersona.emoji}
                    </div>
                  )}
                  <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-green-600 text-white rounded-tr-sm' : 'bg-gray-700 text-gray-100 rounded-tl-sm'}`}>
                    <p className="text-[10px] font-bold mb-1 opacity-60">{msg.role === 'user' ? 'You (Consultant)' : activePersona.name}</p>
                    {msg.content}
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
                      <Sprout size={14} className="text-white" />
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
                  ref={inputRef} value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown} rows={2}
                  placeholder={`Advise ${activePersona.name}…`}
                  disabled={isSending}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-green-500 resize-none leading-relaxed disabled:opacity-50"
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

  // ─── Overview ─────────────────────────────────────────────────────────────────

  if (view === 'overview') {
    const wFilled = writtenFilled(portfolio);
    const sCount  = portfolio.sessions.length;
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <AgricultureCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
            <VoiceBar text="Welcome to the Agriculture Consultant Certification. Complete three written sections and at least two live consultations with different farmer personas, then submit for evaluation." />

            {/* Header */}
            <div className="p-6 bg-gradient-to-br from-green-900/40 to-emerald-900/20 border border-green-500/25 rounded-2xl text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center">
                <Sprout size={32} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Agriculture Consultant Certification</h1>
              <p className="text-sm text-green-300">Community Impact Track · Davidson AI Innovation Center</p>
              <div className="flex justify-center">
                <PidginTooltip
                  originalText="Community Impact Track · Davidson AI Innovation Center"
                  hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                />
              </div>
              <p className="text-sm text-gray-300 leading-relaxed max-w-md mx-auto">
                Prove you can advise smallholder farmers in the Niger Delta — with accurate knowledge, climate-informed recommendations, and practical advice suited to each farmer's situation.
              </p>
            </div>

            {/* Requirements */}
            <div className="p-5 bg-gray-800/60 border border-gray-700/50 rounded-2xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">What you need to complete</h2>
              <div className="space-y-3">
                {[
                  {
                    icon: <PenLine size={16} />, colour: 'text-green-400',
                    title: 'Written Portfolio (3 sections)',
                    desc: 'Your consulting approach, a plain-language climate explanation, and a specific crop recommendation plan.',
                    done: wFilled === 3, progress: `${wFilled}/3 completed`,
                  },
                  {
                    icon: <MessageSquare size={16} />, colour: 'text-amber-400',
                    title: `Consultation Sessions (minimum ${MIN_SESSIONS})`,
                    desc: 'Live role-plays — the AI plays a Oloibiri farmer, you are the consultant. At least 3 turns each, with different farmers.',
                    done: sCount >= MIN_SESSIONS, progress: `${sCount}/${MIN_SESSIONS} completed`,
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-700/40">
                    <div className={`flex-shrink-0 mt-0.5 ${item.colour}`}>{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        {item.done && <CheckCircle size={14} className="text-green-400 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                      <p className={`text-xs font-semibold mt-1 ${item.done ? 'text-green-400' : 'text-gray-500'}`}>{item.progress}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rubric */}
            <div className="p-5 bg-gray-800/60 border border-gray-700/50 rounded-2xl space-y-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">You'll be assessed on</h2>
              <div className="space-y-2">
                {RUBRIC_DIMENSIONS.map(d => (
                  <div key={d.id} className="flex items-start gap-2 text-sm">
                    <Sprout size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
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
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-xl transition-all">
                {portfolioReady(portfolio) ? 'Continue Portfolio' : 'Build Portfolio'} <ArrowRight size={16} />
              </button>
              {portfolioReady(portfolio) && (
                <button onClick={handleEvaluate} disabled={isEvaluating}
                  className="flex items-center gap-2 px-5 py-3.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors">
                  {isEvaluating ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />} Evaluate
                </button>
              )}
            </div>

            {assessmentScores.length > 0 && (
              <button onClick={() => setView('results')}
                className="w-full py-2 text-xs text-green-400 hover:text-green-300 transition-colors underline">
                View previous evaluation results →
              </button>
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
        <AgricultureCertBackground />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">

            <div className="flex items-center justify-between">
              <button onClick={() => setView('overview')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                ← Overview
              </button>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className={wFilled === 3 ? 'text-green-400 font-semibold' : ''}>Written {wFilled}/3</span>
                <span>·</span>
                <span className={sCount >= MIN_SESSIONS ? 'text-green-400 font-semibold' : ''}>Sessions {sCount}/{MIN_SESSIONS}</span>
                {ready && <CheckCircle size={13} className="text-green-400" />}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-800/60 rounded-xl">
              {(['written', 'sessions'] as BuildTab[]).map(tab => (
                <button key={tab} onClick={() => setBuildTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${buildTab === tab ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  {tab === 'written' ? `Written Portfolio (${wFilled}/3)` : `Consultations (${sCount}/${MIN_SESSIONS})`}
                </button>
              ))}
            </div>

            {/* ── Written tab ── */}
            {buildTab === 'written' && (
              <div className="space-y-4">
                {WRITTEN_SECTIONS.map(sec => {
                  const val  = portfolio[sec.key];
                  const done = val.trim().length > 30;
                  return (
                    <div key={sec.key} className={`rounded-2xl border ${sec.colour} p-5 space-y-3`}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{sec.icon}</span>
                        <h3 className="text-sm font-bold text-white flex-1">{sec.label}</h3>
                        {done && <CheckCircle size={14} className="text-green-400 flex-shrink-0" />}
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
                        className="w-full bg-gray-800/80 border border-gray-600/50 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-green-500 resize-none leading-relaxed"
                      />
                      <p className="text-right text-xs text-gray-600">{val.length} characters</p>
                    </div>
                  );
                })}
                <button onClick={() => setBuildTab('sessions')}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white text-sm font-bold rounded-xl transition-colors">
                  Next: Consultation Sessions <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* ── Sessions tab ── */}
            {buildTab === 'sessions' && (
              <div className="space-y-4">
                {/* Completed sessions */}
                {portfolio.sessions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Completed Consultations</p>
                    {portfolio.sessions.map(s => (
                      <div key={s.personaId} className="flex items-center gap-3 p-3 bg-green-900/30 border border-green-500/25 rounded-xl">
                        <span className="text-2xl">{s.personaEmoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{s.personaName}</p>
                          <p className="text-xs text-gray-400">{s.turnCount} turns · saved</p>
                        </div>
                        <CheckCircle size={16} className="text-green-400" />
                        <button onClick={() => removeSession(s.personaId)}
                          className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Persona grid */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {portfolio.sessions.length < MIN_SESSIONS
                      ? `Choose a farmer to advise (need ${MIN_SESSIONS - portfolio.sessions.length} more)`
                      : 'Add more consultations (optional)'}
                  </p>
                  {FARMER_PERSONAS.map(persona => {
                    const done = portfolio.sessions.some(s => s.personaId === persona.id);
                    return (
                      <button key={persona.id} onClick={() => startSession(persona)}
                        className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all ${done ? 'border-green-500/30 bg-green-900/20 opacity-75' : 'border-gray-700/50 bg-gray-800/40 hover:border-green-500/50 hover:bg-gray-700/40'}`}>
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${persona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>
                          {persona.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white">{persona.name}, {persona.age}</p>
                            {done && <CheckCircle size={13} className="text-green-400" />}
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
                    <div className="p-3 bg-green-900/30 border border-green-500/25 rounded-xl flex items-center gap-2">
                      <CheckCircle size={15} className="text-green-400" />
                      <p className="text-sm text-green-300 font-semibold">Portfolio complete! Ready to evaluate.</p>
                    </div>
                    <button onClick={handleEvaluate} disabled={isEvaluating}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
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

  // ─── Results ──────────────────────────────────────────────────────────────────

  if (view === 'results') {
    return (
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <AgricultureCertBackground />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            <VoiceBar text={`Your Agriculture Consultant Certification results are ready. ${allProficient ? 'Congratulations — you have achieved certification level on all criteria!' : 'Continue building your portfolio and try again.'}`} />

            {overallScore !== null && (
              <div className={`p-5 rounded-2xl border ${allProficient ? 'bg-green-900/30 border-green-500/30' : 'bg-gray-800/60 border-gray-700/50'} flex items-center gap-5`}>
                <ScoreRing score={Math.round(overallScore)} />
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-white">{overallScore.toFixed(1)} / 3.0 overall</p>
                  <p className={`text-sm font-semibold ${allProficient ? 'text-green-400' : 'text-amber-400'}`}>
                    {allProficient ? '🎓 Certification level achieved on all criteria!' : 'Proficient (2/3) required on all criteria.'}
                  </p>
                </div>
                {allProficient && (
                  <button onClick={() => setView('certificate')}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
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
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                {isEvaluating ? <><Loader2 size={14} className="animate-spin" /> Evaluating…</> : <><RefreshCw size={14} /> Re-evaluate</>}
              </button>
              {allProficient && (
                <button onClick={() => setView('certificate')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90 text-white text-sm font-bold rounded-xl transition-colors">
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
        <AgricultureCertBackground />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            <VoiceBar text="Enter your name to generate your Agriculture Consultant Certificate." />

            {!allProficient && (
              <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 flex gap-2 text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                You need Proficient (2/3) or above on all five criteria to earn your certificate. Continue building and re-evaluate.
              </div>
            )}

            {allProficient && (
              <>
                <div className="p-6 bg-gradient-to-br from-green-900/40 to-emerald-900/20 border border-green-500/25 rounded-2xl text-center space-y-4">
                  <Trophy size={48} className="text-green-400 mx-auto" />
                  <div>
                    <h2 className="text-xl font-bold text-white">🎓 Certification Achieved!</h2>
                    <p className="text-sm text-gray-300 mt-1 max-w-sm mx-auto">
                      You have demonstrated the ability to advise smallholder farmers in the Niger Delta with accurate knowledge, climate awareness, and practical advice. Enter your name to download your certificate.
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
                    type="text" value={certName}
                    onChange={e => setCertName(e.target.value)}
                    placeholder="e.g. Amara Johnson"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-green-500 text-base"
                  />
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                    {isGenCert
                      ? <><Loader2 size={18} className="animate-spin" /> Generating PDF…</>
                      : <><Download size={18} /> Download Certificate</>}
                  </button>
                  <p className="text-center text-xs text-gray-500">
                    Green-themed PDF · Davidson AI Innovation Center · Oloibiri, Nigeria
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

export default AgricultureConsultantCertificationPage;