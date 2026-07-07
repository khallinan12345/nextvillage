// src/pages/community-impact/FishingConsultantCertificationPage.tsx
//
// Fishing Consultant Certification
// Assesses whether a student can advise fishermen, fish traders, and aspiring
// aquaculture farmers in Oloibiri — covering local species, oil contamination
// and food safety, catfish pond farming, and sustainable fishing practice.
//
// Portfolio structure (two parts):
//   WRITTEN  — consulting approach, species & safety knowledge, aquaculture plan
//   SESSIONS — at least 2 live consultations with different fisher/trader personas
//              (student is the consultant; AI plays the community member)
//
// Evaluation: 5 rubric dimensions, 0-3 each. Proficient (≥2) on all = certified.
//
// Dashboard columns (new):
//   fishing_cert_session_id  text
//   fishing_cert_portfolio   jsonb  — written sections + session transcripts
//   fishing_cert_evaluation  jsonb  — per-criterion scores
//
// Activity stored as: 'Fishing Consultant Certification'
// Route: /community-impact/fishing/certification

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { useBranding } from '../../lib/useBranding';
import {
  Fish, Award, Trophy, Loader2, Download, AlertCircle,
  Volume2, VolumeX, Star, CheckCircle, ArrowRight, RefreshCw,
  PenLine, MessageSquare, Lightbulb, ShieldCheck, AlertTriangle,
  Send, Mic, MicOff, X, ChevronRight, Waves, Scale, CloudRain,
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

interface FishingPortfolio {
  consultingApproach: string;
  speciesSafetyKnowledge: string;
  aquaculturePlan: string;
  sessions: ConsultSession[];
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';
type BuildTab = 'written' | 'sessions';

// ─── Niger Delta Fishing Context ──────────────────────────────────────────────

const NIGER_DELTA_FISHING_CONTEXT = `
NIGER DELTA / OLOIBIRI FISHING CONTEXT (always apply this knowledge):

WATERWAYS & GEOGRAPHY:
- Oloibiri sits in Ogbia LGA, Bayelsa State — surrounded by creeks, rivers, and mangrove swamps
- Key local waterways: Kolo Creek (sacred to the Ogbia/Ijaw people), River Nun (major river),
  Taylor Creek, Ekole River, Brass River, Ikebiri Creek
- Over 200 fish species recorded in Bayelsa State waters
- Wet season: April–November (heavy rains, flooding, higher water levels)
- Dry season: December–March (lower water levels, fish concentrated in pools — often best catches)

FISH SPECIES (local names):
- Catfish / "Eja aro" — Clarias gariepinus: most important commercial species; fast-growing;
  ideal for pond farming; 500g in 5–6 months in a well-managed pond
- Tilapia / "Eja pupa" — Oreochromis niloticus: second most important; pond-ready; breeds prolifically
- Chrysichthys / "Oporo": bottom-dwelling; premium eating quality; high market value
- Bonga / "Shawa" — Ethmalosa fimbriata: abundant estuarine; important for smoking/drying
- Periwinkle / "Isawuru" — Tympanotonus fuscatus: gathered by hand in mangroves; sells well in Yenagoa/PH
- Clams / "Isami" — Egeria radiata: creek beds; risk of heavy metal contamination near oil infrastructure
- Shrimp: high value per kg; seasonal; ₦4,000–8,000/kg

FISHING GEAR: Cast nets, gill nets (40–60mm mesh for catfish/tilapia), drift nets, long-lines, drum traps,
hook and line, dugout canoe with paddle or small outboard

OIL CONTAMINATION — CRITICAL:
- Oloibiri was Nigeria's first oil field (1956); decades of spills contaminate waterways
- Oil blocks oxygen exchange — fish suffocate near heavy spills
- Carcinogenic hydrocarbons accumulate in fish flesh — DO NOT eat fish from heavily contaminated stretches
- Shellfish (clams, periwinkle) absorb heavy metals from polluted sediment — highest risk
- Signs: oily sheen on water, dead fish floating, petroleum smell, dark sediment near pipeline crossings
- LEGAL RIGHTS: Report to NOSDRA (0800-NOSDRA-9); document with photos/dates/GPS for compensation claims
- Recovery: 18–36 months after cleanup before fish populations return significantly

CLIMATE CHANGE IMPACTS:
- 2022 floods: worst in a decade — 300+ communities submerged; gear lost; ponds destroyed
- Irregular seasons: dry-season fish aggregation patterns becoming unreliable
- Sea level rise: saltwater advancing up creeks; freshwater species losing habitat
- Weather safety: never fish open water during heavy rain or storms — canoe capsizes kill fishers

AQUACULTURE — KEY OPPORTUNITY:
- Catfish pond farming: most viable for Oloibiri youth
- 100m² earthen pond: stock 1,000 fingerlings; harvest 300–500kg in 5–6 months
- Fingerlings: NIOMR or ADP hatcheries in Yenagoa — ₦50–80 each
- Feed: commercial catfish pellets (₦8,000–15,000/bag); supplement with kitchen waste
- Market: live catfish ₦2,500–4,500/kg; smoked catfish ₦3,500–6,000/kg
- FLOOD RISK: locate ponds on higher ground; build raised bunds 50cm above flood level
- ₦80,000 can start a small starter pond with careful planning

FISH PROCESSING & MARKET:
- Smoking preserves catfish 2–6 weeks — extends market reach dramatically
- Sun-drying for bonga/small fish — simple, low cost
- Cold chain almost non-existent — smoking/drying critical for post-harvest value
- Market prices: smoked catfish fetches 50–100% more than fresh
- WhatsApp trader groups share daily Yenagoa/PH prices
`;

// ─── Fisher Personas ──────────────────────────────────────────────────────────

interface FisherPersona {
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

const FISHER_PERSONAS: FisherPersona[] = [
  {
    id: 'bro_felix',
    name: 'Bro Felix',
    age: '32',
    occupation: 'Gill net and cast net fisherman, Kolo Creek',
    emoji: '🧑🏿',
    colour: 'from-blue-700 to-cyan-700',
    situation: 'Felix has been fishing Kolo Creek his whole life. His catches have been declining for five years — from 15–25kg/day to often less than 5kg. He suspects oil contamination near a pipeline crossing but isn\'t sure. He wants to know if catfish pond farming is viable as an alternative.',
    mainChallenge: 'Declining catches, oil contamination uncertainty, interest in aquaculture but skeptical',
    openingLine: `Good morning. You are the one who knows about AI and farming fish? My catch on Kolo Creek has been dropping every year for five years. I don't know what to do. My grandfather fished this same creek and it was full. Now sometimes I come home with nothing. A friend told me about fish ponds — growing catfish in a pond instead of catching wild. Is it true a man can make real money from that? Where do I even start?`,
    systemPrompt: `You are Felix, a 32-year-old fisherman from Oloibiri who has fished Kolo Creek his whole life. Your catches have been declining steadily for five years — from 15–25kg per day to often less than 5kg.
${NIGER_DELTA_FISHING_CONTEXT}

PERSONALITY: You are practical, hardworking, and quietly worried about the future. You speak direct Nigerian English with some Ijaw/Pidgin expressions. You are open to new ideas but want facts, not promises. You have a wife and two young children — this is serious, not a hobby.

YOUR SITUATION: Gill nets (60mm mesh, 30m long) and cast net; dugout canoe with small outboard. You fish mainly in Kolo Creek and a section of River Nun. You've noticed fewer catfish and the water sometimes smells strange after rain near the pipeline crossing.

WHAT YOU WANT TO KNOW: Why catches are declining (oil, climate, overfishing — explore all three); is catfish pond farming really viable? What does it cost to start? Where to get fingerlings? Can you do pond farming AND creek fishing at the same time?

WHAT CHANGES YOUR MIND: Specific numbers ("A 100m² pond can produce 400kg in 6 months"); honesty about why catches are declining; practical, affordable first steps.

WHAT KEEPS YOU SKEPTICAL: Vague encouragement, advice requiring a lot of money upfront, anyone who ignores the oil contamination question.

ASK REAL QUESTIONS: "The creek near the pipeline sometimes smells like fuel after heavy rain. Is my fish safe to sell?", "How much land do I need for a fish pond? I have a small plot behind my house.", "If my pond floods in October, do I lose everything?", "Where in Yenagoa can I buy the fingerlings? How much do they cost?"

Show genuine relief when you get specific, affordable, practical advice. Show frustration with vague answers.`,
  },
  {
    id: 'mama_tonye_fish',
    name: 'Mama Tonye',
    age: '48',
    occupation: 'Periwinkle gatherer and fish trader, Kolo Creek shore',
    emoji: '👩🏿',
    colour: 'from-teal-700 to-green-700',
    situation: 'Mama Tonye gathers periwinkles and oysters from mangroves near a pipeline crossing and also resells fish bought from local fishers. Periwinkles near that section are getting smaller and taste different. Her daughter showed her an article about shellfish absorbing toxins near oil spills. She is afraid but cannot simply stop working.',
    mainChallenge: 'Suspected shellfish contamination, food safety fear, cannot afford to lose income',
    openingLine: `Please, I need your advice. I gather periwinkle from the mangrove near the pipeline crossing — I have done it for fifteen years. But my daughter showed me something on the phone that says shellfish near oil spills are dangerous to eat. The periwinkles there have been getting smaller and they taste different. My husband says it is nothing. But I am afraid. What should I do? I cannot just stop — this is how I feed my children.`,
    systemPrompt: `You are Mama Tonye, a 48-year-old woman from Oloibiri who gathers periwinkles and oysters from the mangroves along Kolo Creek, and also buys and resells fish from local fishers.
${NIGER_DELTA_FISHING_CONTEXT}

PERSONALITY: You are a strong, resourceful woman — not easily scared, but this worry is real. You speak warm, direct Nigerian English. You are the economic backbone of your household; stopping work is not a simple choice.

YOUR SITUATION: You gather periwinkles from a section of mangrove near a pipeline crossing. Periwinkles are smaller than usual; slightly different taste; oily smell sometimes near that section after rain. Your daughter showed you an article about shellfish absorbing toxins from contaminated water. You sell to traders who sell in Yenagoa market — you worry about your buyers' health too.

WHAT YOU NEED: Honest assessment — are periwinkles near a pipeline contaminated? How to tell contamination from natural variation. Whether to continue gathering from that specific area. Your legal rights. Alternative income if you must stop. Guidance on the resale fish business.

WHAT CHANGES YOUR MIND: Honest, caring advice that doesn't dismiss fears; practical alternatives to the contaminated area; information about rights (NOSDRA, compensation); acknowledgement that stopping work has real financial consequences.

ASK SPECIFIC QUESTIONS: "How do I know if my periwinkle is safe? Is there a way to test it at home?", "If I report to NOSDRA, will they actually come? And will the oil company punish us?", "Are there other sections of the creek — away from the pipeline — where I can gather safely?", "What about my buyers? Am I responsible if they get sick?"

Show real emotion — fear, determination, love for your family. Warm up genuinely when the consultant addresses both safety AND livelihood concerns together.`,
  },
  {
    id: 'young_tamuno',
    name: 'Tamuno',
    age: '21',
    occupation: 'Aspiring catfish farmer — currently no experience',
    emoji: '👦🏿',
    colour: 'from-indigo-700 to-purple-700',
    situation: 'Just finished secondary school, no job, ₦80,000 saved and a 15m × 15m plot of family land near Kolo Creek. His uncle in Port Harcourt says catfish farming can earn ₦1 million in six months. He has been watching YouTube but has dangerous gaps — especially about flood risk.',
    mainChallenge: 'No experience, limited capital, overconfident from YouTube, critical flood-risk blind spot',
    openingLine: `Good day. I want to start a catfish business. I have been watching YouTube — I know about fingerlings, pellet food, all of that. I have ₦80,000 saved and a piece of land near the creek. My uncle says I can make one million naira in six months. Is that true? I want to start next month. What do I do first?`,
    systemPrompt: `You are Tamuno, a 21-year-old from Oloibiri who just finished secondary school. You have no job, ₦80,000 saved, and a 15m × 15m plot of family land near Kolo Creek. Your uncle says catfish farming is very profitable. You have been watching YouTube videos for two months.
${NIGER_DELTA_FISHING_CONTEXT}

PERSONALITY: Energetic, eager, and slightly overconfident from YouTube research. Casual Nigerian English mixed with Pidgin. Intelligent and absorbs information quickly when it's concrete. Impatient — wants to start immediately. Naive about flood risk, water quality management, and the realities YouTube didn't cover.

YOUR SITUATION: Land 15m × 15m near Kolo Creek; don't know how close to flood level it is. Capital ₦80,000 (tight but borderline possible for a small starter pond). Knowledge is YouTube-based — knows names of things but not the details. Your uncle's ₦1 million claim is an exaggeration but based on real potential.

WHAT YOU NEED TO LEARN: Is ₦80,000 enough? Is your land near the creek suitable (flood risk)? Where to buy fingerlings in Yenagoa? Feed costs and profitability? Water quality management? THE FLOOD RISK IN OCTOBER–NOVEMBER — the most dangerous gap in your plan.

WHAT EXCITES YOU: Specific numbers ("100 fingerlings × 6 months × ₦3,500/kg"); learning that ₦80,000 can start a small pond; practical first steps this week; hearing the idea is basically good, just needs to be done right.

ASK QUESTIONS: "My plot is maybe 3 metres above the creek. Will that flood?", "YouTube says I need an aerator — is that true? Can I manage without one?", "How many fingerlings can I buy with ₦80,000 after building the pond?", "Can I feed them with kitchen waste to save money on pellets?"

Get genuinely excited when the consultant gives you a specific action plan. Push back a little when told to slow down.`,
  },
  {
    id: 'papa_charles',
    name: 'Papa Charles',
    age: '58',
    occupation: 'Veteran fisherman — 35 years on River Nun and Kolo Creek',
    emoji: '👴🏿',
    colour: 'from-gray-700 to-slate-700',
    situation: 'Fished River Nun and Kolo Creek for 35 years and has watched the fish population collapse. Catches that filled a canoe in one night now barely fill a bucket. His two sons refuse to fish anymore. He wants an honest assessment of what happened and whether there is any future.',
    mainChallenge: 'Witnessing generational collapse of a livelihood; wants honest, weighted answers about the future',
    openingLine: `I have been fishing River Nun for thirty-five years. My father fished here, my grandfather too. Twenty years ago, I could fill my canoe in one night — Chrysichthys, catfish, all kinds. Now I am lucky if I fill one bucket. My sons refuse to fish — they say it is not worth it. Are they right? What has happened to our fish? Is it finished? Or is there still a way?`,
    systemPrompt: `You are Papa Charles, a 58-year-old veteran fisherman from Oloibiri with 35 years of experience on River Nun and Kolo Creek. You speak with the authority of deep personal knowledge and the grief of someone who has watched a way of life collapse.
${NIGER_DELTA_FISHING_CONTEXT}

PERSONALITY: Dignified, observant, and deeply sorrowful about what you have witnessed. Not dramatic — you state facts in a quiet, heavy way. You will challenge any consultant who gives easy answers. Skeptical of new ideas; have tried many things over the years. Measured, respectful Nigerian English.

WHAT YOU HAVE WITNESSED: 1990s — Chrysichthys and catfish abundant, full canoe most nights. 2000s — starting to decline after increased oil infrastructure. 2010s — the section near the pipeline crossing changed colour and smell; fish disappeared. 2020s — some areas produce almost nothing; species composition has shifted dramatically.

YOUR REAL QUESTIONS: Is the fish population gone permanently or can it recover? How long would recovery take if oil pollution stopped today? (Honest answer: 15–30 years in heavily contaminated areas.) Is it worth teaching grandchildren to fish? Can aquaculture replace wild fisheries?

WHAT CHANGES YOUR MIND: Honesty about the severity (you already know — you want confirmation and understanding); hope grounded in fact; any answer that acknowledges your 35 years of observation as valid evidence; aquaculture as a genuine alternative, not just a consolation prize.

WHAT CLOSES YOU DOWN: Easy optimism; blaming fishers for overfishing without acknowledging oil contamination; young consultants who speak as if you know nothing; suggestions that don't acknowledge the cultural loss.

DEEP QUESTIONS: "If the oil company cleaned up the spills tomorrow — how long before the fish come back? Be honest with me.", "You talk about fish ponds. But Chrysichthys doesn't grow in ponds. How do you replace what we have lost?", "Who is responsible for what has happened to our fish? And who will answer for it?"

Speak slowly, with weight. Warm up genuinely when the consultant shows real knowledge and genuine respect for what has been lost.`,
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'Fishing Consultant';
const CERT_ACTIVITY = 'Fishing Consultant Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const MIN_SESSIONS  = 2;

const EMPTY_PORTFOLIO: FishingPortfolio = {
  consultingApproach: '',
  speciesSafetyKnowledge: '',
  aquaculturePlan: '',
  sessions: [],
};

const WRITTEN_SECTIONS = [
  {
    key: 'consultingApproach' as const,
    label: '1. Your Consulting Approach',
    icon: <Fish size={13} />,
    colour: 'border-blue-500/40 bg-blue-500/5',
    placeholder: 'Describe how you approach a consultation with a fisherman, trader, or aspiring fish farmer in Oloibiri. What do you ask first? How do you listen before advising? How do you balance honesty about risks (oil contamination, flood hazards) with practical, hopeful advice? Write at least 3–4 sentences.',
    tip: 'The best consultants start by understanding the person\'s situation — their gear, waterways, income sources, and fears — before recommending anything. Describe how you do that.',
    rows: 4,
  },
  {
    key: 'speciesSafetyKnowledge' as const,
    label: '2. Species Knowledge & Contamination Safety',
    icon: <AlertTriangle size={13} />,
    colour: 'border-red-500/40 bg-red-500/5',
    placeholder: 'Write your answer to this question from a fish trader: "I gather periwinkle near the pipeline crossing. My daughter says it might be dangerous. Is it? And how do I know which fish are safe to sell?"\n\nYour answer should cover: the contamination risk for shellfish vs. open-water fish, how to identify signs of oil contamination in a waterway, what a fisher should do if they suspect contamination, and their legal rights.',
    tip: 'Be honest about the risk — periwinkle and clams near oil infrastructure are the highest-risk species. A good consultant does not minimise this. They give clear guidance AND tell the person what alternatives and rights they have.',
    rows: 6,
  },
  {
    key: 'aquaculturePlan' as const,
    label: '3. Aquaculture Start-Up Plan',
    icon: <Waves size={13} />,
    colour: 'border-cyan-500/40 bg-cyan-500/5',
    placeholder: 'Write a specific start-up plan for this person: a 21-year-old in Oloibiri with ₦80,000 saved and a 15m × 15m plot of family land near Kolo Creek, who wants to start a catfish pond.\n\nInclude: whether ₦80,000 is enough (and how to use it), how to assess the land for flood risk, where to get fingerlings in Yenagoa, a realistic income projection, and the single biggest risk they must manage.',
    tip: 'Be specific: name the hatchery sources (NIOMR, ADP Yenagoa), give realistic numbers (₦50–80 per fingerling, pellet costs), and address flood risk honestly — this is the most dangerous gap for first-time farmers near the creek.',
    rows: 6,
  },
];

const RUBRIC_DIMENSIONS = [
  {
    id: 'diagnosis',
    label: 'Problem Identification',
    desc: 'Correctly identifies the real problem — not just the surface complaint',
  },
  {
    id: 'knowledge',
    label: 'Fisheries Knowledge',
    desc: 'Advice is accurate and specific to Niger Delta species, waterways, and context',
  },
  {
    id: 'safety',
    label: 'Safety & Health Awareness',
    desc: 'Addresses contamination risks, food safety, and weather safety honestly',
  },
  {
    id: 'practical',
    label: 'Practical & Affordable',
    desc: 'Advice is actionable with limited resources; low-cost or free solutions prioritised',
  },
  {
    id: 'communication',
    label: 'Communication',
    desc: 'Advice is clear, respectful, and adapted to this person\'s experience and situation',
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

const writtenFilled = (p: FishingPortfolio) =>
  [p.consultingApproach, p.speciesSafetyKnowledge, p.aquaculturePlan].filter(v => v.trim().length > 30).length;

const portfolioReady = (p: FishingPortfolio) =>
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

const FishingConsultantCertificationPage: React.FC = () => {
  const { user } = useAuth();
  const branding = useBranding();

  const [view, setView]                         = useState<ViewMode>('overview');
  const [buildTab, setBuildTab]                 = useState<BuildTab>('written');
  const [portfolio, setPortfolio]               = useState<FishingPortfolio>(EMPTY_PORTFOLIO);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [sessionId]                             = useState(() => makeId());
  const [certName, setCertName]                 = useState('');
  const [isEvaluating, setIsEvaluating]         = useState(false);
  const [isGenCert, setIsGenCert]               = useState(false);
  const [evalError, setEvalError]               = useState('');
  const [dashboardRowId, setDashboardRowId]     = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking]             = useState(false);
  const [speechOn, setSpeechOn]                 = useState(true);
  const speechSynth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  const [activePersona, setActivePersona]       = useState<FisherPersona | null>(null);
  const [sessionMessages, setSessionMessages]   = useState<ChatMsg[]>([]);
  const [inputText, setInputText]               = useState('');
  const [isSending, setIsSending]               = useState(false);
  const [isListening, setIsListening]           = useState(false);
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
    utt.onend   = () => setIsSpeaking(false);
    speechSynth.speak(utt);
  }, [speechOn, speechSynth]);

  const stopSpeaking = useCallback(() => { speechSynth?.cancel(); setIsSpeaking(false); }, [speechSynth]);

  useEffect(() => {
    const last = sessionMessages[sessionMessages.length - 1];
    if (last?.role === 'assistant') speak(last.content);
  }, [sessionMessages, speak]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [sessionMessages]);

  // ── Dashboard ────────────────────────────────────────────────────────────────

  const saveToDashboard = useCallback(async (port: FishingPortfolio, scores: AssessmentScore[] = []) => {
    if (!user?.id) return;
    const payload = {
      user_id:                   user.id,
      activity:                  CERT_ACTIVITY,
      category_activity:         'Community Impact',
      fishing_cert_session_id:   sessionId,
      fishing_cert_portfolio:    port,
      fishing_cert_evaluation:   scores,
      progress:                  allProficient ? 'completed' : 'started',
      updated_at:                new Date().toISOString(),
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

  // ── Written ──────────────────────────────────────────────────────────────────

  const setWritten = (key: keyof Pick<FishingPortfolio, 'consultingApproach' | 'speciesSafetyKnowledge' | 'aquaculturePlan'>, value: string) =>
    setPortfolio(prev => ({ ...prev, [key]: value }));

  // ── Sessions ─────────────────────────────────────────────────────────────────

  const startSession = (persona: FisherPersona) => {
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
      const reply = await chatText({ page: 'FishingConsultantCertificationPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: activePersona.systemPrompt,
        max_tokens: 200, temperature: 0.8,
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
    if (!SR) { alert('Voice input not supported. Try Chrome.'); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }
    const rec = new SR(); recognitionRef.current = rec;
    rec.lang = 'en-NG'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => setInputText(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
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

  // ── Evaluation ───────────────────────────────────────────────────────────────

  const handleEvaluate = async () => {
    if (isEvaluating || !portfolioReady(portfolio)) return;
    setIsEvaluating(true); setEvalError('');
    try {
      const sessionsText = portfolio.sessions.map((s, i) =>
        `--- SESSION ${i + 1}: ${s.personaName} ${s.personaEmoji} (${s.turnCount} student turns) ---\n` +
        s.transcript.slice(-10).map(m => `${m.role === 'user' ? 'CONSULTANT STUDENT' : s.personaName}: ${m.content.slice(0, 500)}`).join('\n\n')
      ).join('\n\n');

      const prompt = `You are evaluating a student's Fishing Consultant Certification portfolio from the ${branding.institutionName}.

The student's role: advise fishermen, fish traders, and aspiring aquaculture farmers in the Niger Delta — covering local fish species, oil contamination and food safety, catfish pond farming, and sustainable fishing practice.

=== WRITTEN COMPONENTS ===

CONSULTING APPROACH:
${portfolio.consultingApproach}

SPECIES KNOWLEDGE & CONTAMINATION SAFETY:
${portfolio.speciesSafetyKnowledge}

AQUACULTURE START-UP PLAN:
${portfolio.aquaculturePlan}

=== CONSULTATION SESSIONS (live role-plays) ===
${sessionsText}

=== EVALUATION INSTRUCTIONS ===

Score the student on 5 dimensions (0–3 each) based on COMBINED evidence of written components AND live sessions:

1. Problem Identification (diagnosis)
   0 = Generic advice without understanding the person's actual situation
   1 = Identifies some aspects of the problem but misses key elements
   2 = Correctly identifies the core problem — the real concern beneath the surface complaint
   3 = Exceptionally perceptive; surfaces hidden concerns; asks clarifying questions before advising

2. Fisheries Knowledge (knowledge)
   0 = Advice is vague, inaccurate, or uses wrong species names / market prices
   1 = Some accurate information but missing key Niger Delta specifics
   2 = Accurate and specific: correct species names (Clarias gariepinus, Tympanotonus fuscatus), correct aquaculture figures (100m²=300–500kg), correct market prices
   3 = Exceptional accuracy; uses local data (NIOMR/ADP Yenagoa, Kolo Creek specifics, seasonal fishing calendars)

3. Safety & Health Awareness (safety)
   0 = Does not address contamination or safety risks despite clear opportunity
   1 = Mentions safety but doesn't give specific, honest guidance
   2 = Clearly addresses contamination risk for shellfish vs. open-water fish; gives honest food safety guidance; mentions NOSDRA rights
   3 = Exceptional safety framing; distinguishes high-risk shellfish from lower-risk open-water fish; empowers with legal rights; addresses weather safety

4. Practical & Affordable (practical)
   0 = Advice requires money or equipment the person clearly doesn't have
   1 = Partially achievable but some recommendations are unrealistic
   2 = All or most advice can be implemented with available resources; addresses flood risk for ponds; gives realistic cost breakdown
   3 = Exceptional prioritisation; clear sequenced action plan within constraints; addresses ₦80,000 budget specifically and honestly

5. Communication (communication)
   0 = Jargon-heavy; talks past the person; doesn't adapt to their level
   1 = Mostly clear but some technical language or generic phrasing
   2 = Clear, plain language; respects the person's existing knowledge; adapts to their specific situation and fears
   3 = Exceptional communication; uses the person's own words and experiences; warm, respectful, and specific throughout

Return valid JSON only (no markdown, no code fences):
{
  "scores": {
    "diagnosis": 0-3,
    "knowledge": 0-3,
    "safety": 0-3,
    "practical": 0-3,
    "communication": 0-3
  },
  "evidence": {
    "diagnosis": "specific quote or observation from portfolio",
    "knowledge": "specific quote or observation",
    "safety": "specific quote or observation",
    "practical": "specific quote or observation",
    "communication": "specific quote or observation"
  },
  "overall_score": 0.0-3.0,
  "can_advance": true or false,
  "summary": "2-3 sentences of specific, warm encouragement citing actual things the student did well",
  "main_growth_area": "1-2 sentences on the clearest area for improvement with a specific suggestion"
}`;

      const result = await chatJSON({ page: 'FishingConsultantCertificationPage',
        messages: [{ role: 'user', content: prompt }],
        system: 'You are an expert evaluator of fisheries consulting skills for the Niger Delta context. Be specific. Always cite actual evidence from the portfolio. Scoring must be fair and calibrated to the Oloibiri community context.',
        max_tokens: 900, temperature: 0.2,
      });

      if (!result?.scores) throw new Error('Invalid evaluation response');

      const scores: AssessmentScore[] = RUBRIC_DIMENSIONS.map(dim => ({
        assessment_name: dim.label,
        score:    result.scores[dim.id]    ?? null,
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
          theme:         'cyan',
          subtitle:      'Community Impact Track',
          description:   'Has demonstrated the ability to advise fishermen, fish traders, and aspiring aquaculture farmers in the Niger Delta — with accurate fisheries knowledge, honest safety guidance, and practical advice adapted to each person\'s resources and situation in Oloibiri, Bayelsa State, Nigeria.',
        }),
      });
      if (!r.ok) throw new Error('Certificate generation failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${certName.trim().replace(/\s+/g, '_')}_Fishing_Consultant_Certificate.pdf`;
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
        className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isSpeaking ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
        {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
    </div>
  );

  // ─── Active session UI ────────────────────────────────────────────────────────

  if (activePersona) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-4">
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

          <div className="px-4 py-2.5 bg-cyan-900/30 border border-cyan-500/20 rounded-xl mb-3 flex items-center gap-2">
            <ShieldCheck size={14} className="text-cyan-400 flex-shrink-0" />
            <p className="text-xs text-gray-300">
              You are the consultant. Listen before advising. Address contamination and safety risks honestly. Give practical, affordable recommendations.
            </p>
          </div>


          <div className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-2xl flex flex-col overflow-hidden" style={{ height: '420px' }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {sessionMessages.map(msg => (
                <div key={msg.id} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-base flex-shrink-0`}>
                      {activePersona.emoji}
                    </div>
                  )}
                  <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-cyan-600 text-white rounded-tr-sm' : 'bg-gray-700 text-gray-100 rounded-tl-sm'}`}>
                    <p className="text-[10px] font-bold mb-1 opacity-60">{msg.role === 'user' ? 'You (Consultant)' : activePersona.name}</p>
                    {msg.content}
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center flex-shrink-0">
                      <Fish size={14} className="text-white" />
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
                <textarea ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown} rows={2} placeholder={`Advise ${activePersona.name}…`}
                  disabled={isSending}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-500 resize-none leading-relaxed disabled:opacity-50"
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
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
            <VoiceBar text="Welcome to the Fishing Consultant Certification. Complete three written sections and at least two live consultations with different fishers or traders, then submit for evaluation." />

            <div className="p-6 bg-gradient-to-br from-blue-900/40 to-cyan-900/20 border border-cyan-500/25 rounded-2xl text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
                <Fish size={32} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Fishing Consultant Certification</h1>
              <p className="text-sm text-cyan-300">Community Impact Track · {branding.institutionName}</p>
              <p className="text-sm text-gray-300 leading-relaxed max-w-md mx-auto">
                Prove you can advise fishermen, fish traders, and aspiring aquaculture farmers in the Niger Delta — with accurate knowledge, honest safety guidance, and practical advice for each person's situation.
              </p>
            </div>

            <div className="p-5 bg-gray-800/60 border border-gray-700/50 rounded-2xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">What you need to complete</h2>
              <div className="space-y-3">
                {[
                  { icon: <PenLine size={16} />, colour: 'text-cyan-400', title: 'Written Portfolio (3 sections)',
                    desc: 'Your consulting approach, a contamination safety response, and a specific aquaculture start-up plan.',
                    done: wFilled === 3, progress: `${wFilled}/3 completed` },
                  { icon: <MessageSquare size={16} />, colour: 'text-blue-400', title: `Consultation Sessions (minimum ${MIN_SESSIONS})`,
                    desc: 'Live role-plays — the AI plays a local fisher or trader, you are the consultant. At least 3 turns each, with different people.',
                    done: sCount >= MIN_SESSIONS, progress: `${sCount}/${MIN_SESSIONS} completed` },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-700/40">
                    <div className={`flex-shrink-0 mt-0.5 ${item.colour}`}>{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        {item.done && <CheckCircle size={14} className="text-cyan-400 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                      <p className={`text-xs font-semibold mt-1 ${item.done ? 'text-cyan-400' : 'text-gray-500'}`}>{item.progress}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 bg-gray-800/60 border border-gray-700/50 rounded-2xl space-y-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">You'll be assessed on</h2>
              <div className="space-y-2">
                {RUBRIC_DIMENSIONS.map(d => (
                  <div key={d.id} className="flex items-start gap-2 text-sm">
                    <Fish size={12} className="text-cyan-400 flex-shrink-0 mt-0.5" />
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
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-xl transition-all">
                {portfolioReady(portfolio) ? 'Continue Portfolio' : 'Build Portfolio'} <ArrowRight size={16} />
              </button>
              {portfolioReady(portfolio) && (
                <button onClick={handleEvaluate} disabled={isEvaluating}
                  className="flex items-center gap-2 px-5 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors">
                  {isEvaluating ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />} Evaluate
                </button>
              )}
            </div>

            {assessmentScores.length > 0 && (
              <button onClick={() => setView('results')}
                className="w-full py-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors underline">
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
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">

            <div className="flex items-center justify-between">
              <button onClick={() => setView('overview')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">← Overview</button>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className={wFilled === 3 ? 'text-cyan-400 font-semibold' : ''}>Written {wFilled}/3</span>
                <span>·</span>
                <span className={sCount >= MIN_SESSIONS ? 'text-cyan-400 font-semibold' : ''}>Sessions {sCount}/{MIN_SESSIONS}</span>
                {ready && <CheckCircle size={13} className="text-cyan-400" />}
              </div>
            </div>

            <div className="flex gap-1 p-1 bg-gray-800/60 rounded-xl">
              {(['written', 'sessions'] as BuildTab[]).map(tab => (
                <button key={tab} onClick={() => setBuildTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${buildTab === tab ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  {tab === 'written' ? `Written Portfolio (${wFilled}/3)` : `Consultations (${sCount}/${MIN_SESSIONS})`}
                </button>
              ))}
            </div>

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
                        {done && <CheckCircle size={14} className="text-cyan-400 flex-shrink-0" />}
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <Lightbulb size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">{sec.tip}</p>
                      </div>
                      <textarea value={val} onChange={e => setWritten(sec.key, e.target.value)}
                        rows={sec.rows} placeholder={sec.placeholder}
                        className="w-full bg-gray-800/80 border border-gray-600/50 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-cyan-500 resize-none leading-relaxed"
                      />
                      <p className="text-right text-xs text-gray-600">{val.length} characters</p>
                    </div>
                  );
                })}
                <button onClick={() => setBuildTab('sessions')}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-cyan-800 hover:bg-cyan-700 text-white text-sm font-bold rounded-xl transition-colors">
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
                      <div key={s.personaId} className="flex items-center gap-3 p-3 bg-cyan-900/30 border border-cyan-500/25 rounded-xl">
                        <span className="text-2xl">{s.personaEmoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{s.personaName}</p>
                          <p className="text-xs text-gray-400">{s.turnCount} turns · saved</p>
                        </div>
                        <CheckCircle size={16} className="text-cyan-400" />
                        <button onClick={() => removeSession(s.personaId)} className="p-1 text-gray-600 hover:text-red-400 transition-colors"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {portfolio.sessions.length < MIN_SESSIONS
                      ? `Choose a fisher to advise (need ${MIN_SESSIONS - portfolio.sessions.length} more)`
                      : 'Add more consultations (optional)'}
                  </p>
                  {FISHER_PERSONAS.map(persona => {
                    const done = portfolio.sessions.some(s => s.personaId === persona.id);
                    return (
                      <button key={persona.id} onClick={() => startSession(persona)}
                        className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all ${done ? 'border-cyan-500/30 bg-cyan-900/20 opacity-75' : 'border-gray-700/50 bg-gray-800/40 hover:border-cyan-500/50 hover:bg-gray-700/40'}`}>
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${persona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>
                          {persona.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white">{persona.name}, {persona.age}</p>
                            {done && <CheckCircle size={13} className="text-cyan-400" />}
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
                    <div className="p-3 bg-cyan-900/30 border border-cyan-500/25 rounded-xl flex items-center gap-2">
                      <CheckCircle size={15} className="text-cyan-400" />
                      <p className="text-sm text-cyan-300 font-semibold">Portfolio complete! Ready to evaluate.</p>
                    </div>
                    <button onClick={handleEvaluate} disabled={isEvaluating}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
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
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            <VoiceBar text={`Your Fishing Consultant Certification results are ready. ${allProficient ? 'Congratulations — you have achieved certification level on all criteria!' : 'Continue building your portfolio and try again.'}`} />

            {overallScore !== null && (
              <div className={`p-5 rounded-2xl border ${allProficient ? 'bg-cyan-900/30 border-cyan-500/30' : 'bg-gray-800/60 border-gray-700/50'} flex items-center gap-5`}>
                <ScoreRing score={Math.round(overallScore)} />
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-white">{overallScore.toFixed(1)} / 3.0 overall</p>
                  <p className={`text-sm font-semibold ${allProficient ? 'text-cyan-400' : 'text-amber-400'}`}>
                    {allProficient ? '🎓 Certification level achieved on all criteria!' : 'Proficient (2/3) required on all criteria.'}
                  </p>
                </div>
                {allProficient && (
                  <button onClick={() => setView('certificate')}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
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
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                {isEvaluating ? <><Loader2 size={14} className="animate-spin" /> Evaluating…</> : <><RefreshCw size={14} /> Re-evaluate</>}
              </button>
              {allProficient && (
                <button onClick={() => setView('certificate')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 text-white text-sm font-bold rounded-xl transition-colors">
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
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            <VoiceBar text="Enter your name to generate your Fishing Consultant Certificate." />

            {!allProficient && (
              <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 flex gap-2 text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                You need Proficient (2/3) or above on all five criteria to earn your certificate. Continue building and re-evaluate.
              </div>
            )}

            {allProficient && (
              <>
                <div className="p-6 bg-gradient-to-br from-blue-900/40 to-cyan-900/20 border border-cyan-500/25 rounded-2xl text-center space-y-4">
                  <Trophy size={48} className="text-cyan-400 mx-auto" />
                  <div>
                    <h2 className="text-xl font-bold text-white">🎓 Certification Achieved!</h2>
                    <p className="text-sm text-gray-300 mt-1 max-w-sm mx-auto">
                      You have demonstrated the ability to advise fishermen, fish traders, and aspiring aquaculture farmers in the Niger Delta. Enter your name to download your certificate.
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
                  <label className="block text-sm font-semibold text-gray-300">Full name as it should appear on the certificate:</label>
                  <input type="text" value={certName} onChange={e => setCertName(e.target.value)}
                    placeholder="e.g. Amara Johnson"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-cyan-500 text-base"
                  />
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                    {isGenCert ? <><Loader2 size={18} className="animate-spin" /> Generating PDF…</> : <><Download size={18} /> Download Certificate</>}
                  </button>
                  <p className="text-center text-xs text-gray-500">{`Cyan-themed PDF · ${branding.institutionName}`}</p>
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

export default FishingConsultantCertificationPage;