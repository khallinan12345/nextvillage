// src/pages/community-impact/HealthcareNavigatorCertificationPage.tsx
//
// Healthcare Navigator Certification
// Assesses whether a student can perform a systematic clinical assessment,
// apply WHO IMCI triage correctly, identify danger signs, communicate
// urgency clearly to caregivers, and produce a complete referral note.
//
// Portfolio structure (two parts):
//   WRITTEN  — navigator role & philosophy, vital signs & triage knowledge,
//              a complete referral note for a given clinical scenario
//   SESSIONS — at least 2 live consultations with different patient personas
//              (student is the navigator; AI plays the patient/caregiver)
//
// Evaluation: 5 rubric dimensions, 0-3 each. Proficient (≥2) on all = certified.
//
// Dashboard columns (new):
//   healthcare_cert_session_id  text
//   healthcare_cert_portfolio   jsonb  — written sections + session transcripts
//   healthcare_cert_evaluation  jsonb  — per-criterion scores
//
// Activity stored as: 'Healthcare Navigator Certification'
// Route: /community-impact/healthcare/certification

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
  Heart, Award, Trophy, Loader2, Download, AlertCircle,
  Volume2, VolumeX, Star, CheckCircle, ArrowRight, RefreshCw,
  PenLine, MessageSquare, Lightbulb, ShieldCheck, Stethoscope,
  Send, Mic, MicOff, X, ChevronRight, ClipboardList, Baby,
  Activity, Thermometer,
} from 'lucide-react';

// ─── Background — cursor-driven ripple distortion (no sidebar offset) ─────────
// The cert page uses Navbar only (no AppLayout sidebar), so the background
// spans the full width: fixed top-16 left-0 right-0 bottom-0.

const HealthCertBackground: React.FC = () => {
  const [mouse, setMouse]   = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      // No sidebar — only subtract the top navbar height (64px)
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

  const img = "url('/backghround_healthcare.jpg')";

  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="health-cert-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.010" numOctaves="3" seed="22" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="50" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>

      {/* Base layer — static image with dark overlay */}
      <div
        className="fixed top-16 left-0 right-0 bottom-0"
        style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/70 to-indigo-900/75" />
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
            filter: 'url(#health-cert-distortion)',
            WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`,
            maskImage:        `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/70 to-indigo-900/75" />
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

interface HealthcarePortfolio {
  navigatorRole: string;
  triageKnowledge: string;
  referralNote: string;
  sessions: ConsultSession[];
}

type ViewMode = 'overview' | 'build' | 'results' | 'certificate';
type BuildTab = 'written' | 'sessions';

// ─── Clinical Context ─────────────────────────────────────────────────────────

const CLINICAL_CONTEXT = `
OLOIBIRI / BAYELSA COMMUNITY HEALTH NAVIGATOR CONTEXT:

YOUR ROLE — COMMUNITY HEALTH NAVIGATOR (not a doctor):
You ASSESS, TRIAGE, and REFER. You do NOT diagnose or prescribe.
Collect measurements, identify danger signs, classify urgency using WHO IMCI
colour system, prepare a clear referral note.

DISEASE BURDEN IN BAYELSA / OLOIBIRI:
- MALARIA: #1 killer; 56–70% prevalence in Bayelsa; fever = malaria until proven otherwise
- PNEUMONIA: #1 cause of child death under 5; cough + fast breathing + chest indrawing
- DIARRHOEAL DISEASE: dehydration kills children fast; ORS saves lives
- MALNUTRITION: MUAC <11.5cm in child 6–59 months = SAM = emergency
- HYPERTENSION: silent; first presentation can be stroke; BP ≥140/90 needs referral; ≥180/120 = crisis
- MATERNAL: eclampsia (seizures + high BP in pregnancy) = emergency; BP ≥140/90 in pregnancy = urgent

WHO IMCI TRIAGE:
🔴 RED — URGENT: convulsions, cannot wake, unable to drink/feed, vomits everything, chest indrawing,
  MUAC <11.5cm, severe dehydration, stiff neck + fever, BP ≥180/120, BP ≥140/90 in pregnancy
🟡 YELLOW — TREAT & MONITOR: fever without danger signs, fast breathing without indrawing,
  some dehydration, MUAC 11.5–12.4cm, stage 2 hypertension (≥140/90 in non-pregnant adult)
🟢 GREEN — HOME CARE: normal vitals, no danger signs, mild manageable symptoms

VITAL SIGN THRESHOLDS:
Temperature (axillary): Normal 36.0–37.4°C; Fever ≥38.0°C; High ≥39.0°C
Respiratory rate — 2–12 months: fast ≥50; 1–5 years: fast ≥40; adults: concern ≥30
BP: Normal <120/80; Stage 2 ≥140/90; Crisis ≥180/120; ANY ≥140/90 in pregnancy = urgent
MUAC children 6–59 months: GREEN ≥12.5cm; YELLOW 11.5–12.4cm; RED <11.5cm
Dehydration: No (alert, normal turgor); Some (irritable, sunken eyes, thirsty); Severe (lethargic, cannot drink)

REFERRAL FACILITIES FROM OLOIBIRI:
- Oloibiri PHC (basic)
- Ogbia LGA Hospital, Ogbia town (~20 min)
- Federal Medical Centre, Yenagoa (~1.5–2 hours)
- NDUTH Amassoma (~1 hour)

REFERRAL NOTE must include: patient name/age/sex, vital signs + time, chief complaint + duration,
key findings/danger signs, assessment/impression (not diagnosis), pre-referral treatment given,
navigator name + contact, date + time
`;

// ─── Patient Personas ─────────────────────────────────────────────────────────

interface PatientPersona {
  id: string;
  name: string;
  age: string;
  occupation: string;
  emoji: string;
  colour: string;
  presentation: string;
  mainChallenge: string;
  openingLine: string;
  systemPrompt: string;
}

const PATIENT_PERSONAS: PatientPersona[] = [
  {
    id: 'child_adaeze',
    name: 'Adaeze (age 3)',
    age: '3',
    occupation: 'Child — brought by mother, fever and fast breathing for 2 days',
    emoji: '👧🏿',
    colour: 'from-amber-600 to-orange-600',
    presentation: 'Mother reports 2 days of fever and fast breathing. No convulsions, child can drink, no chest indrawing. RDT available. Clinical picture: uncomplicated malaria (YELLOW) — RR 43/min (fast for age), temp 38.9°C, RDT positive. Student must assess systematically before classifying.',
    mainChallenge: 'Fever + fast breathing = malaria OR pneumonia OR both. Must assess systematically — take measurements, check danger signs, perform RDT.',
    openingLine: `Good afternoon. Please, my daughter — she has been hot for two days now. She is not eating well. And she is breathing faster than normal, I think. No fits, she can drink. I am worried. What is wrong with her?`,
    systemPrompt: `You are the mother of Adaeze, a 3-year-old girl from Oloibiri. You are anxious and loving. Your daughter has had fever for 2 days and seems to breathe faster than normal.
${CLINICAL_CONTEXT}

YOUR DAUGHTER'S CLINICAL PICTURE (reveal ONLY when the navigator asks or examines):
- Temperature: 38.9°C axillary (navigator must measure — "I felt she was very hot; I don't have a thermometer")
- Respiratory rate: 43 breaths/minute — FAST for her age (normal <40); reveal when navigator counts: "You are counting so carefully! Is it bad?"
- Weight: 12.5 kg (appropriate)
- MUAC: 13.0 cm (GREEN — normal)
- No chest indrawing, no convulsions, no danger signs — she is awake and drinking
- Fever: 2 days; started suddenly; some rigors first night
- RDT: POSITIVE for malaria (when navigator performs it)
- No cough; no diarrhoea; mild pallor on palms and inner eyelids

CORRECT CLASSIFICATION: YELLOW — uncomplicated malaria with fast breathing (malaria-related respiratory change, not pneumonia — no cough, no indrawing). Needs ACT treatment TODAY. Not an emergency, but must not be sent home without treatment.

YOUR CHARACTER: Anxious but cooperative. Answer questions honestly. Provide more information than asked sometimes (mothers talk!). Respond with relief when the navigator is systematic and reassuring. Become worried if they seem unsure or skip examining Adaeze properly.

After assessment ask: "What is it? Is it serious? What medicine must I give her?"`,
  },
  {
    id: 'mama_joy',
    name: 'Mama Joy (7 months pregnant)',
    age: '28',
    occupation: 'Pregnant woman, 7 months — severe headache and swollen feet',
    emoji: '🤰🏿',
    colour: 'from-rose-600 to-pink-600',
    presentation: 'Seven months pregnant, third child. Severe headache for 2 days, bilateral ankle oedema, blurred vision (will reveal if asked). BP will be 158/102 — pre-eclampsia requiring urgent RED referral. Has had only 1 ANC visit. Student must measure BP correctly and convey urgency without causing panic.',
    mainChallenge: 'Recognise pre-eclampsia signs, measure BP correctly (twice), communicate RED urgency calmly, plan transport to FMC Yenagoa.',
    openingLine: `Good morning. I am 7 months pregnant. For two days now I have this very bad headache — not like normal headache, it is heavy and throbbing. And my feet are swollen — look. My husband said it is just from standing too long. But I am worried. I have not gone to the clinic since my first pregnancy check. Is everything okay?`,
    systemPrompt: `You are Mama Joy, a 28-year-old woman, 7 months pregnant (third child). You are slightly minimising — your husband said it's nothing — but you are intelligent and scared. Something feels wrong.
${CLINICAL_CONTEXT}

YOUR CLINICAL PICTURE (reveal ONLY when the navigator asks or examines):
- BP: 158/102 mmHg — reveal when navigator measures; do NOT reveal spontaneously
- Second BP reading: 155/100 mmHg (both elevated — pre-eclampsia territory = RED referral)
- Severe headache: throbbing, frontal, 2 days, not responding to paracetamol
- Bilateral pitting oedema on feet/ankles: visible; confirm when navigator looks
- Blurred vision: reveal ONLY if asked directly — "You mention it now — yes, sometimes the edges of things are not clear. I thought it was tiredness."
- No convulsions (yet); baby is moving; no vaginal bleeding
- Only 1 ANC visit at 12 weeks; no BP recorded then

CORRECT CLASSIFICATION: RED — pre-eclampsia. Urgent referral to FMC Yenagoa today. Without treatment, can progress to eclampsia (seizures) and death within hours or days.

YOUR CHARACTER: Responds to serious, calm, respectful care. Becomes appropriately alarmed (not panicked) when navigator explains the BP reading. Has practical concerns: "Yenagoa is far. Who will watch my other children?" After explanation: "How dangerous is this? Can I wait until my husband comes home?" — this is the crucial moment; navigator must convey urgency without causing panic.`,
  },
  {
    id: 'baba_charles',
    name: 'Baba Charles (age 61)',
    age: '61',
    occupation: 'Community elder — headache and dizziness, no prior health checks',
    emoji: '👴🏿',
    colour: 'from-purple-700 to-indigo-700',
    presentation: 'Never had BP measured. Headache and dizziness for 3 weeks. Smokes occasionally, high-salt diet. BP will be 162/98 (Stage 2 hypertension). No acute emergency but needs referral for treatment. Student must take two BP readings, explain hypertension clearly, and motivate him to attend clinic without alarming him.',
    mainChallenge: 'Take two BP readings correctly, explain "silent hypertension" to a dismissive elder, frame referral as strength not weakness, address stroke risk honestly.',
    openingLine: `My son, good afternoon. My daughter told me to come and see you. I have this headache and dizziness — coming and going for three weeks now. I am not one to go to hospital, I have never been sick in my life. Probably it is nothing. I am 61 years. My father lived to 80. I am fine. But my daughter insisted.`,
    systemPrompt: `You are Baba Charles, a 61-year-old community elder from Oloibiri. You have never had your blood pressure measured. You are slightly dismissive of health concerns.
${CLINICAL_CONTEXT}

YOUR CLINICAL PICTURE (reveal ONLY when the navigator asks or examines):
- First BP reading: 162/98 mmHg; second reading: 158/96 mmHg — Stage 2 hypertension, needs treatment
- No hypertensive crisis; no chest pain; no arm weakness; no facial drooping — not an acute emergency
- Headache: throbbing, mostly at back of head; worse in mornings; 3 weeks
- Dizziness: occasional; especially when standing up quickly
- Diet: lots of dried fish, occasional fried foods; smokes 2–3 cigarettes a day
- Family history: "My father — he just fell down one day. They said it was the head." — reveal only if asked about family
- NEVER had BP measured before

CORRECT CLASSIFICATION: YELLOW — Stage 2 hypertension; referral to Ogbia LGA Hospital for treatment. Not an emergency unless BP rises to crisis level (≥180/120).

YOUR CHARACTER: Initially dismissive ("I am fine, I am 61 not 80"). Responds to respect — if the navigator treats you as an intelligent adult elder, you engage. When you hear the BP numbers, ask: "What does that mean? Is that bad?" Become genuinely concerned when you learn about stroke risk — your father's death was likely a stroke. Frame health as strength: you respond to "treat this so you stay strong" more than "you are sick." Practical concern: "The clinic in Ogbia — I will need someone to take me."

Key moment: "So this thing can kill me? Even though I feel okay?" — this is the teaching moment about silent hypertension.`,
  },
  {
    id: 'baby_isoken',
    name: 'Baby Isoken (9 months)',
    age: '0',
    occupation: 'Infant — brought by grandmother, diarrhoea, poor feeding, visible wasting',
    emoji: '👶🏿',
    colour: 'from-teal-700 to-green-700',
    presentation: 'Grandmother brings Baby Isoken, 9 months. 5 days of diarrhoea, poor feeding, visibly thin. MUAC 10.8cm (RED/SAM). Some dehydration (not severe). Mother away in Yenagoa. Student must perform MUAC, assess dehydration, identify SAM + diarrhoea requiring same-day referral, and explain the severity clearly to an elderly non-medical caregiver.',
    mainChallenge: 'Identify SAM via MUAC (RED), assess dehydration correctly (SOME not SEVERE), explain severity kindly to worried grandmother, plan referral to Ogbia LGA Hospital with ORS en route.',
    openingLine: `Please help. I am the grandmother of this baby — her mother is in Yenagoa working. The child has been having running stomach for five days. She is not eating well. Look at her — she is getting thin. She was not like this before. What can I do?`,
    systemPrompt: `You are the grandmother of Baby Isoken, a 9-month-old girl. The baby's mother is working in Yenagoa. You are deeply worried and humble; you feel responsible; you did your best.
${CLINICAL_CONTEXT}

THE BABY'S CLINICAL PICTURE (reveal ONLY when navigator asks or examines):
- MUAC: 10.8 cm = RED zone = SEVERE ACUTE MALNUTRITION (SAM)
- Weight: 5.8 kg (was 7.2 kg at 6 months — visible weight loss; reveal if asked about recent weight)
- Temperature: 37.2°C (no fever)
- Respiratory rate: 42 bpm (acceptable for age — normal <50 for 2–12 months)
- Diarrhoea: 5 days; watery; 4–6 episodes per day; no blood in stool
- Dehydration: SOME (not severe) — irritable; drinks when offered; slightly sunken eyes; skin turgor slow but returns; NOT lethargic
- Visible wasting: ribs visible; limbs very thin — reveal when navigator looks at the baby
- No oedema (marasmus, not kwashiorkor)
- Not breastfeeding — mother stopped at 7 months; baby on only soft cassava pap + water

CORRECT CLASSIFICATION: Same-day referral to Ogbia LGA Hospital (not FMC Yenagoa unless transport not available to Ogbia). SAM = urgent therapeutic feeding referral. Some dehydration = give ORS before and during referral. The combination of SAM + diarrhoea is dangerous.

YOUR CHARACTER: Speak simple Nigerian English; may not understand medical terms. When navigator explains MUAC as RED: "What does that mean? Is she going to die?" You have one concern: "I don't know if I can go to Ogbia — who will watch my other grandchildren at home?" Respond warmly to clear, kind explanation. When told about ORS: "I have sugar and salt at home — is that the same thing?" You do not know the severity until the navigator explains it — do not add drama; let the clinical findings emerge from proper assessment.`,
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CERT_NAME     = 'Healthcare Navigator';
const CERT_ACTIVITY = 'Healthcare Navigator Certification';
const makeId        = () => Math.random().toString(36).substring(2, 9);
const MIN_SESSIONS  = 2;

const EMPTY_PORTFOLIO: HealthcarePortfolio = {
  navigatorRole: '',
  triageKnowledge: '',
  referralNote: '',
  sessions: [],
};

const WRITTEN_SECTIONS = [
  {
    key: 'navigatorRole' as const,
    label: '1. Your Role as a Community Health Navigator',
    icon: <Stethoscope size={13} />,
    colour: 'border-rose-500/40 bg-rose-500/5',
    placeholder: 'Describe the role of a Community Health Navigator in Oloibiri. What is the difference between your role and a doctor\'s or nurse\'s role? What are the three things you do (assess, triage, refer)? Why is this role essential in a community where most people cannot afford to travel to a clinic? Write at least 4 sentences.',
    tip: 'The most important thing to understand about this role: you do NOT diagnose or prescribe. You collect measurements, identify danger signs, classify urgency using RED/YELLOW/GREEN, and prepare a referral note. Be specific about what "assess, triage, refer" actually means in practice.',
    rows: 5,
  },
  {
    key: 'triageKnowledge' as const,
    label: '2. Vital Signs, Danger Signs & IMCI Triage',
    icon: <Activity size={13} />,
    colour: 'border-red-500/40 bg-red-500/5',
    placeholder: 'Answer these questions from memory — no looking up:\n\n  A) A child is 18 months old, calm. You count 44 breaths per minute. What does this mean and what do you do?\n  B) A pregnant woman has BP 152/98. What is your classification and action?\n  C) A 9-month baby has MUAC 11.2 cm, watery diarrhoea for 4 days, slightly sunken eyes. Classify each finding and describe your overall plan.\n  D) What are the four danger signs that automatically classify a patient as RED regardless of other findings?',
    tip: 'These questions test whether you have genuinely memorised the key thresholds. The answers must be specific: "fast breathing" is not enough — state the exact threshold for that age, classify it correctly, and state the action.',
    rows: 8,
  },
  {
    key: 'referralNote' as const,
    label: '3. Write a Complete Referral Note',
    icon: <ClipboardList size={13} />,
    colour: 'border-indigo-500/40 bg-indigo-500/5',
    placeholder: 'Write a complete referral note for this patient:\n\nPatient: Mama Blessing, 32 years old, female. 8 months pregnant. She came to you this morning (08:45) with a severe headache for 3 days and very swollen hands and feet. You measured her BP twice: first reading 164/106 mmHg, second reading 160/104 mmHg (both 5 minutes apart). She also told you she has had blurred vision since yesterday. Baby is moving. No convulsions. No vaginal bleeding. She has had 2 ANC visits. You have not given any pre-referral treatment (paracetamol is contraindicated for BP without medical supervision). You are referring her to FMC Yenagoa.\n\nWrite the full referral note exactly as you would hand it to the hospital.',
    tip: 'A referral note must include: patient name/age/sex, date and time of assessment, chief complaint and duration, ALL vital signs with times, key findings (danger signs, examination findings), your assessment/impression (NOT a diagnosis — write "suspected pre-eclampsia" not "patient has pre-eclampsia"), treatment given before referral, referral destination, your name and contact number.',
    rows: 10,
  },
];

const RUBRIC_DIMENSIONS = [
  {
    id: 'assessment',
    label: 'Systematic Assessment',
    desc: 'Takes structured history and all relevant measurements before forming an impression',
  },
  {
    id: 'triage',
    label: 'Correct Triage (RED/YELLOW/GREEN)',
    desc: 'Correctly classifies urgency using IMCI colour system and explains the reasoning',
  },
  {
    id: 'safety',
    label: 'Safety & Danger Signs',
    desc: 'Checks for and responds appropriately to all relevant danger signs',
  },
  {
    id: 'communication',
    label: 'Communication',
    desc: 'Advice is clear, respectful, and appropriate for the caregiver\'s understanding',
  },
  {
    id: 'referral',
    label: 'Referral Planning',
    desc: 'Gives clear referral guidance including where to go, how urgently, and what to watch for',
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

const writtenFilled = (p: HealthcarePortfolio) =>
  [p.navigatorRole, p.triageKnowledge, p.referralNote].filter(v => v.trim().length > 30).length;

const portfolioReady = (p: HealthcarePortfolio) =>
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

const HealthcareNavigatorCertificationPage: React.FC = () => {
  const { user } = useAuth();
  const branding = useBranding();

  const [view, setView]                         = useState<ViewMode>('overview');
  const [buildTab, setBuildTab]                 = useState<BuildTab>('written');
  const [portfolio, setPortfolio]               = useState<HealthcarePortfolio>(EMPTY_PORTFOLIO);
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

  const [activePersona, setActivePersona]     = useState<PatientPersona | null>(null);
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
        console.warn('[HealthcareNavigatorCertificationPage] SpeechGen TTS failed, falling back to browser voice:', err);
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

  // ── Dashboard ────────────────────────────────────────────────────────────────

  const saveToDashboard = useCallback(async (port: HealthcarePortfolio, scores: AssessmentScore[] = []) => {
    if (!user?.id) return;
    const payload = {
      user_id:                      user.id,
      activity:                     CERT_ACTIVITY,
      category_activity:            'Community Impact',
      healthcare_cert_session_id:   sessionId,
      healthcare_cert_portfolio:    port,
      healthcare_cert_evaluation:   scores,
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

  // ── Written ──────────────────────────────────────────────────────────────────

  const setWritten = (key: keyof Pick<HealthcarePortfolio, 'navigatorRole' | 'triageKnowledge' | 'referralNote'>, value: string) =>
    setPortfolio(prev => ({ ...prev, [key]: value }));

  // ── Sessions ─────────────────────────────────────────────────────────────────

  const startSession = (persona: PatientPersona) => {
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
      const reply = await chatText({ page: 'HealthcareNavigatorCertificationPage',
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
        s.transcript.slice(-10).map(m => `${m.role === 'user' ? 'NAVIGATOR STUDENT' : s.personaName}: ${m.content.slice(0, 500)}`).join('\n\n')
      ).join('\n\n');

      const prompt = `You are evaluating a student's Healthcare Navigator Certification portfolio from the ${branding.institutionName}.

The student's role: Community Health Navigator — ASSESS, TRIAGE, and REFER patients using WHO IMCI protocols. They do NOT diagnose or prescribe. They collect measurements, identify danger signs, classify urgency (RED/YELLOW/GREEN), and prepare referral notes.

=== WRITTEN COMPONENTS ===

NAVIGATOR ROLE DESCRIPTION:
${portfolio.navigatorRole}

TRIAGE KNOWLEDGE (vital signs, danger signs, IMCI answers):
${portfolio.triageKnowledge}

REFERRAL NOTE (for a pre-eclampsia case: Mama Blessing, 32F, 8 months pregnant, BP 164/106 and 160/104, headache 3 days, bilateral oedema, blurred vision):
${portfolio.referralNote}

=== CONSULTATION SESSIONS (live role-plays) ===
${sessionsText}

=== CLINICAL REFERENCE FOR GRADING ===
Correct answers for the triage knowledge section:
A) Child 18 months, 44 breaths/min: FAST breathing (normal <40 for 1–5 years) → possible pneumonia → YELLOW classification → count again when calm, check for chest indrawing and danger signs
B) Pregnant woman BP 152/98: ANY BP ≥140/90 in pregnancy = URGENT (pre-eclampsia risk) → RED referral to FMC Yenagoa
C) Baby 9 months: MUAC 11.2cm = YELLOW (moderate malnutrition); watery diarrhoea 4 days = assess dehydration; slightly sunken eyes = some dehydration (YELLOW); overall = same-day referral, give ORS
D) Four RED danger signs: convulsions, cannot wake/lethargic, unable to drink/feed, vomits everything

Referral note for Mama Blessing must include: name/age/sex, date+time (08:45), chief complaint + duration, two BP readings (164/106 and 160/104), oedema, blurred vision, baby moving, 2 ANC visits, no pre-referral treatment given, suspected pre-eclampsia, referral to FMC Yenagoa, navigator name + contact.

=== EVALUATION INSTRUCTIONS ===

Score on 5 dimensions (0–3 each) based on COMBINED evidence of written components AND live sessions:

1. Systematic Assessment (assessment)
   0 = Gives impressions without taking measurements; skips structured history
   1 = Takes some measurements but not systematically; misses key questions
   2 = Takes structured history AND relevant measurements before forming impression; checks danger signs
   3 = Exemplary systematic approach; checks all relevant measurements; probes underlying history; no shortcuts

2. Correct Triage RED/YELLOW/GREEN (triage)
   0 = Misclassifies cases; uses wrong thresholds; unable to explain reasoning
   1 = Some classifications correct but misses others or cannot explain the threshold
   2 = Correctly classifies all or most cases with correct thresholds and reasoning
   3 = Flawless classification with precise thresholds; correctly handles nuanced presentations (e.g. SAM + some dehydration, pre-eclampsia in pregnancy)

3. Safety & Danger Signs (safety)
   0 = Does not check for danger signs even with high-risk presentation
   1 = Checks some danger signs but misses others; does not always respond appropriately
   2 = Systematically checks all relevant danger signs; responds correctly to positive findings
   3 = Checks all danger signs proactively; correctly prioritises RED danger signs; demonstrates pre-referral safety thinking

4. Communication (communication)
   0 = Jargon-heavy; confusing; does not adapt to caregiver's level; causes unnecessary panic or false reassurance
   1 = Mostly clear but some medical language; does not fully adapt to the specific caregiver
   2 = Clear, respectful, plain-language communication; adapts to caregiver's level; explains urgency without panic
   3 = Exceptional communication; uses caregiver's own words; conveys RED urgency with calm authority; leaves caregiver knowing exactly what to do

5. Referral Planning (referral)
   0 = Does not give referral guidance or gives incorrect facility / timing
   1 = Gives referral but missing key elements (no timing, no transport plan, no what-to-watch-for)
   2 = Clear referral with correct facility, timing, and key instructions to caregiver
   3 = Complete referral planning: correct facility, urgency framing, pre-referral treatment if applicable, transport discussion, written referral note elements all present

Return valid JSON only (no markdown, no code fences):
{
  "scores": {
    "assessment": 0-3,
    "triage": 0-3,
    "safety": 0-3,
    "communication": 0-3,
    "referral": 0-3
  },
  "evidence": {
    "assessment": "specific quote or observation from portfolio",
    "triage": "specific quote or observation — cite the exact threshold used",
    "safety": "specific quote or observation",
    "communication": "specific quote or observation",
    "referral": "specific quote or observation — cite elements present/missing from referral note"
  },
  "overall_score": 0.0-3.0,
  "can_advance": true or false,
  "summary": "2-3 sentences of specific, warm encouragement citing actual things the student did well",
  "main_growth_area": "1-2 sentences on the clearest area for improvement with a specific suggestion"
}`;

      const result = await chatJSON({ page: 'HealthcareNavigatorCertificationPage',
        messages: [{ role: 'user', content: prompt }],
        system: 'You are an expert evaluator of community health navigator skills for the Oloibiri, Nigeria context. Be specific. Always cite actual evidence. Score against the clinical reference provided. Patient safety is the highest priority in grading.',
        max_tokens: 1000, temperature: 0.2,
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
          theme:         'rose',
          subtitle:      'Community Impact Track',
          description:   'Has demonstrated the ability to assess patients systematically using WHO IMCI protocols, classify urgency correctly using the RED/YELLOW/GREEN triage system, communicate clearly with caregivers, and produce complete referral notes — serving as a Community Health Navigator in Oloibiri, Bayelsa State, Nigeria.',
        }),
      });
      if (!r.ok) throw new Error('Certificate generation failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${certName.trim().replace(/\s+/g, '_')}_Healthcare_Navigator_Certificate.pdf`;
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
        className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isSpeaking ? 'bg-rose-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
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
        <HealthCertBackground />
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-4">
          <div className="flex items-center gap-3 p-4 bg-gray-800/60 border border-gray-700/50 rounded-2xl mb-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activePersona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>
              {activePersona.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{activePersona.name}</p>
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

          <div className="px-4 py-2.5 bg-rose-900/30 border border-rose-500/20 rounded-xl mb-3 flex items-center gap-2">
            <ShieldCheck size={14} className="text-rose-400 flex-shrink-0" />
            <p className="text-xs text-gray-300">
              You are the Navigator. Take a structured history first. Ask for and record all measurements. Check danger signs. Classify RED/YELLOW/GREEN before recommending action.
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
                  <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-rose-600 text-white rounded-tr-sm' : 'bg-gray-700 text-gray-100 rounded-tl-sm'}`}>
                    <p className="text-[10px] font-bold mb-1 opacity-60">{msg.role === 'user' ? 'You (Navigator)' : activePersona.name}</p>
                    {msg.content}
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center flex-shrink-0">
                      <Stethoscope size={14} className="text-white" />
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
                  onKeyDown={handleKeyDown} rows={2} placeholder={`Speak to ${activePersona.name}…`}
                  disabled={isSending}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-rose-500 resize-none leading-relaxed disabled:opacity-50"
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
        <HealthCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
            <VoiceBar text="Welcome to the Healthcare Navigator Certification. Complete three written sections — including a full referral note — and at least two live patient consultations. Then submit for evaluation." />

            <div className="p-6 bg-gradient-to-br from-rose-900/40 to-pink-900/20 border border-rose-500/25 rounded-2xl text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-rose-600 to-pink-600 flex items-center justify-center">
                <Heart size={32} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Healthcare Navigator Certification</h1>
              <p className="text-sm text-rose-300">Community Impact Track · {branding.institutionName}</p>
              <div className="flex justify-center">
                <PidginTooltip
                  originalText={`Community Impact Track · ${branding.institutionName}`}
                  hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                />
              </div>
              <p className="text-sm text-gray-300 leading-relaxed max-w-md mx-auto">
                Prove you can assess patients systematically, apply WHO IMCI triage correctly, communicate urgency clearly to caregivers, and produce a complete referral note.
              </p>
            </div>

            <div className="p-5 bg-gray-800/60 border border-gray-700/50 rounded-2xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">What you need to complete</h2>
              <div className="space-y-3">
                {[
                  { icon: <PenLine size={16} />, colour: 'text-rose-400', title: 'Written Portfolio (3 sections)',
                    desc: 'Your navigator role description, a triage knowledge test (answer 4 clinical questions from memory), and a complete referral note for a given patient scenario.',
                    done: wFilled === 3, progress: `${wFilled}/3 completed` },
                  { icon: <MessageSquare size={16} />, colour: 'text-pink-400', title: `Consultation Sessions (minimum ${MIN_SESSIONS})`,
                    desc: 'Live role-plays — the AI plays a patient or caregiver, you are the navigator. Take measurements, check danger signs, classify, and plan referral. At least 3 turns each.',
                    done: sCount >= MIN_SESSIONS, progress: `${sCount}/${MIN_SESSIONS} completed` },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-700/40">
                    <div className={`flex-shrink-0 mt-0.5 ${item.colour}`}>{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        {item.done && <CheckCircle size={14} className="text-rose-400 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                      <p className={`text-xs font-semibold mt-1 ${item.done ? 'text-rose-400' : 'text-gray-500'}`}>{item.progress}</p>
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
                    <Heart size={12} className="text-rose-400 flex-shrink-0 mt-0.5" />
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
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-bold rounded-xl transition-all">
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
                className="w-full py-2 text-xs text-rose-400 hover:text-rose-300 transition-colors underline">
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
        <HealthCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">

            <div className="flex items-center justify-between">
              <button onClick={() => setView('overview')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">← Overview</button>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className={wFilled === 3 ? 'text-rose-400 font-semibold' : ''}>Written {wFilled}/3</span>
                <span>·</span>
                <span className={sCount >= MIN_SESSIONS ? 'text-rose-400 font-semibold' : ''}>Sessions {sCount}/{MIN_SESSIONS}</span>
                {ready && <CheckCircle size={13} className="text-rose-400" />}
              </div>
            </div>

            <div className="flex gap-1 p-1 bg-gray-800/60 rounded-xl">
              {(['written', 'sessions'] as BuildTab[]).map(tab => (
                <button key={tab} onClick={() => setBuildTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${buildTab === tab ? 'bg-rose-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
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
                        {done && <CheckCircle size={14} className="text-rose-400 flex-shrink-0" />}
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <Lightbulb size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">{sec.tip}</p>
                      </div>
                      <textarea value={val} onChange={e => setWritten(sec.key, e.target.value)}
                        rows={sec.rows} placeholder={sec.placeholder}
                        className="w-full bg-gray-800/80 border border-gray-600/50 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-rose-500 resize-none leading-relaxed"
                      />
                      <p className="text-right text-xs text-gray-600">{val.length} characters</p>
                    </div>
                  );
                })}
                <button onClick={() => setBuildTab('sessions')}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-rose-800 hover:bg-rose-700 text-white text-sm font-bold rounded-xl transition-colors">
                  Next: Patient Consultations <ArrowRight size={14} />
                </button>
              </div>
            )}

            {buildTab === 'sessions' && (
              <div className="space-y-4">
                {portfolio.sessions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Completed Consultations</p>
                    {portfolio.sessions.map(s => (
                      <div key={s.personaId} className="flex items-center gap-3 p-3 bg-rose-900/30 border border-rose-500/25 rounded-xl">
                        <span className="text-2xl">{s.personaEmoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{s.personaName}</p>
                          <p className="text-xs text-gray-400">{s.turnCount} turns · saved</p>
                        </div>
                        <CheckCircle size={16} className="text-rose-400" />
                        <button onClick={() => removeSession(s.personaId)} className="p-1 text-gray-600 hover:text-red-400 transition-colors"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {portfolio.sessions.length < MIN_SESSIONS
                      ? `Choose a patient to assess (need ${MIN_SESSIONS - portfolio.sessions.length} more)`
                      : 'Add more consultations (optional)'}
                  </p>
                  {PATIENT_PERSONAS.map(persona => {
                    const done = portfolio.sessions.some(s => s.personaId === persona.id);
                    return (
                      <button key={persona.id} onClick={() => startSession(persona)}
                        className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all ${done ? 'border-rose-500/30 bg-rose-900/20 opacity-75' : 'border-gray-700/50 bg-gray-800/40 hover:border-rose-500/50 hover:bg-gray-700/40'}`}>
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${persona.colour} flex items-center justify-center text-2xl flex-shrink-0`}>
                          {persona.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white">{persona.name}</p>
                            {done && <CheckCircle size={13} className="text-rose-400" />}
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
                    <div className="p-3 bg-rose-900/30 border border-rose-500/25 rounded-xl flex items-center gap-2">
                      <CheckCircle size={15} className="text-rose-400" />
                      <p className="text-sm text-rose-300 font-semibold">Portfolio complete! Ready to evaluate.</p>
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
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <HealthCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            <VoiceBar text={`Your Healthcare Navigator Certification results are ready. ${allProficient ? 'Congratulations — you have achieved certification level on all criteria!' : 'Continue building your portfolio and try again.'}`} />

            {overallScore !== null && (
              <div className={`p-5 rounded-2xl border ${allProficient ? 'bg-rose-900/30 border-rose-500/30' : 'bg-gray-800/60 border-gray-700/50'} flex items-center gap-5`}>
                <ScoreRing score={Math.round(overallScore)} />
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-white">{overallScore.toFixed(1)} / 3.0 overall</p>
                  <p className={`text-sm font-semibold ${allProficient ? 'text-rose-400' : 'text-amber-400'}`}>
                    {allProficient ? '🎓 Certification level achieved on all criteria!' : 'Proficient (2/3) required on all criteria.'}
                  </p>
                </div>
                {allProficient && (
                  <button onClick={() => setView('certificate')}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
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
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:opacity-90 text-white text-sm font-bold rounded-xl transition-colors">
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
        <HealthCertBackground />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            <VoiceBar text="Enter your name to generate your Healthcare Navigator Certificate." />

            {!allProficient && (
              <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 flex gap-2 text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                You need Proficient (2/3) or above on all five criteria to earn your certificate. Continue building and re-evaluate.
              </div>
            )}

            {allProficient && (
              <>
                <div className="p-6 bg-gradient-to-br from-rose-900/40 to-pink-900/20 border border-rose-500/25 rounded-2xl text-center space-y-4">
                  <Trophy size={48} className="text-rose-400 mx-auto" />
                  <div>
                    <h2 className="text-xl font-bold text-white">🎓 Certification Achieved!</h2>
                    <p className="text-sm text-gray-300 mt-1 max-w-sm mx-auto">
                      You have demonstrated the ability to assess, triage, and refer patients using WHO IMCI protocols — serving the community of Oloibiri as a trained Healthcare Navigator. Enter your name to download your certificate.
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
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-rose-500 text-base"
                  />
                  <button onClick={generateCertificate} disabled={!certName.trim() || isGenCert}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                    {isGenCert ? <><Loader2 size={18} className="animate-spin" /> Generating PDF…</> : <><Download size={18} /> Download Certificate</>}
                  </button>
                  <p className="text-center text-xs text-gray-500">{`Rose-themed PDF · ${branding.institutionName}`}</p>
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

export default HealthcareNavigatorCertificationPage;