// src/pages/community-impact/HealthcareNavigatorPage.tsx
//
// Healthcare Navigator — Community Impact Track
// A professional casebook tool for youth Community Health Navigators
// (modelled on Nigeria's CHIPS Agents) serving patients in Oloibiri
// (Bayelsa State) and Ibiade (Ogun State).
//
// The navigator registers community members, runs structured clinical
// assessments using WHO IMCI protocols (vitals, danger signs, triage),
// gets AI-assisted RED/YELLOW/GREEN classification, and maintains a
// case history per patient — with follow-up tracking and referral notes.
//
// DB tables: health_patients
//            health_assessments
//
// Route: /community-impact/healthcare
// Activity: healthcare_navigator
//
// CLINICAL BASIS: WHO IMCI thresholds, Nigeria CHIPS programme,
// Nigeria Malaria Treatment Guidelines. All advice is framed as
// clinical decision SUPPORT for a trained human navigator —
// NOT diagnosis or prescription.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { chatText } from '../../lib/chatClient';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { useAuth } from '../../hooks/useAuth';
import {
  Heart, ArrowLeft, Send, Save, Loader2, Plus, User,
  FileText, AlertTriangle, CheckCircle, Clock, ChevronRight,
  ClipboardList, RefreshCw, Calendar, Mic, MicOff,
  Volume2, VolumeX, X, Lightbulb, Thermometer, Activity,
  Baby, Stethoscope, ShieldCheck, AlertCircle, XCircle, Award,
} from 'lucide-react';
import classNames from 'classnames';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type AppMode =
  | 'dashboard'
  | 'add-patient'
  | 'patient-detail'
  | 'new-assessment'
  | 'followup-chat'         // "Evaluate My Case History" — reflective self-review
  | 'prior-followup-chat'  // "Follow-up Prior Assessment" — guided clinical follow-up
  | 'case-detail';

type TriageLevel = 'red' | 'yellow' | 'green' | 'pending';
type PatientGroup = 'child-under-5' | 'child-5-14' | 'adult' | 'pregnant' | 'elderly';

// ─── Challenge types ──────────────────────────────────────────────────────────

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

interface Patient {
  patient_id: string;
  youth_user_id: string;
  patient_name: string;
  village: string;
  phone: string | null;
  age_years: number | null;
  age_months: number | null;
  sex: 'male' | 'female' | '';
  patient_group: PatientGroup;
  notes: string | null;
  created_at: string;
  // from summary view
  total_assessments?: number;
  open_cases?: number;
  last_assessment_at?: string | null;
}

interface AssessmentData {
  // Vitals
  tempC: string;
  tempMethod: 'axillary' | 'oral' | 'rectal';
  respiratoryRate: string;
  pulseRate: string;
  bpSystolic: string;
  bpDiastolic: string;
  // Anthropometry
  weightKg: string;
  heightCm: string;
  muacCm: string;
  // Chief complaint
  chiefComplaint: string;
  // General danger signs (IMCI)
  convulsions: boolean;
  unconscious: boolean;
  unableToFeed: boolean;
  vomitsEverything: boolean;
  // Main symptoms
  fever: boolean; feverDays: string;
  cough: boolean; coughDays: string;
  chestIndrawing: boolean;
  diarrhoea: boolean; diarrhoeaDays: string;
  bloodInStool: boolean;
  vomiting: boolean;
  // Signs
  palmarPallor: boolean;
  stiffNeck: boolean;
  eyeJaundice: boolean;
  oedema: boolean;
  // Malaria
  malariaSuspected: boolean;
  rdt: 'positive' | 'negative' | 'not_done';
  recentBednetUse: boolean;
  // Physical observations
  obs_appearance: string;
  obs_breathing: string;
  obs_skin: string;
  obs_hydration: string;
  // Notes
  additionalNotes: string;
}

const BLANK_ASSESSMENT: AssessmentData = {
  tempC: '', tempMethod: 'axillary',
  respiratoryRate: '', pulseRate: '',
  bpSystolic: '', bpDiastolic: '',
  weightKg: '', heightCm: '', muacCm: '',
  chiefComplaint: '',
  convulsions: false, unconscious: false, unableToFeed: false, vomitsEverything: false,
  fever: false, feverDays: '',
  cough: false, coughDays: '', chestIndrawing: false,
  diarrhoea: false, diarrhoeaDays: '', bloodInStool: false,
  vomiting: false,
  palmarPallor: false, stiffNeck: false, eyeJaundice: false, oedema: false,
  malariaSuspected: false, rdt: 'not_done', recentBednetUse: false,
  obs_appearance: '', obs_breathing: '', obs_skin: '', obs_hydration: '',
  additionalNotes: '',
};

interface Assessment {
  id: string;
  patient_id: string;
  youth_user_id: string;
  assessment_data: AssessmentData;
  probe_notes: Record<string, string>;       // keyed by symptom/observation label
  triage_level: TriageLevel;
  ai_triage_summary: string | null;
  referral_note: string | null;
  navigator_actions: string | null;
  conversation_history: ChatMessage[];
  follow_up_needed: boolean;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

// ─── Clinical Knowledge Base ──────────────────────────────────────────────────

const CLINICAL_CONTEXT = `
OLOIBIRI / BAYELSA COMMUNITY HEALTH NAVIGATOR CONTEXT:

YOUR ROLE — COMMUNITY HEALTH NAVIGATOR (not a doctor):
You are a trained Community Health Navigator, similar to a Nigerian CHIPS Agent.
You ASSESS, TRIAGE, and REFER. You do NOT diagnose or prescribe.
Your job: collect measurements, identify danger signs, classify urgency using the
WHO IMCI colour system, and prepare a clear referral note for the clinic.
You are trained, supervised by health professionals, and working to improve access
for people who cannot afford to travel to a clinic for every concern.

DISEASE BURDEN IN BAYELSA / OLOIBIRI (always apply this context):
- MALARIA: #1 killer; 56–70% prevalence in Bayelsa (highest in Nigeria); Plasmodium falciparum;
  affects ALL ages; worst in children under 5 and pregnant women;
  fever in Bayelsa = malaria until proven otherwise in high-transmission areas
- TYPHOID FEVER: Common; often confused with malaria; sustained high fever, headache, abdominal pain;
  needs laboratory confirmation ideally; treat empirically with cotrimoxazole or ciprofloxacin
- ACUTE RESPIRATORY INFECTIONS: pneumonia = #1 cause of child death under 5;
  presents as cough + fast breathing + chest indrawing; bacterial; needs antibiotics urgently
- DIARRHOEAL DISEASE: Cholera possible during floods; dehydration kills children fast;
  ORS (Oral Rehydration Solution) saves lives; assess dehydration before everything else
- MALNUTRITION: high burden; MUAC <11.5cm in child 6–59 months = SAM; urgent referral needed
- HYPERTENSION: increasingly common in adults; often silent; first presentation can be stroke;
  BP ≥140/90 needs medical review; ≥180/120 = hypertensive crisis, immediate referral
- MATERNAL COMPLICATIONS: eclampsia (seizures + high BP in pregnancy) = emergency;
  haemorrhage; prolonged labour; fever in pregnancy = malaria, needs urgent treatment
- OIL-RELATED ILLNESS: Skin conditions, respiratory symptoms, eye irritation near
  contaminated waterways; benzene exposure risk from oil infrastructure

WHO IMCI COLOUR CLASSIFICATION:
🔴 RED — URGENT REFERRAL IMMEDIATELY (do not delay):
  DANGER SIGNS: convulsions, loss of consciousness, very lethargic/cannot wake,
  unable to drink/breastfeed, vomits everything, severe respiratory distress
  ALSO RED: chest indrawing + fever; MUAC <11.5cm; severe dehydration;
  stiff neck + fever (meningitis); BP ≥180/120; any BP ≥140/90 in pregnancy

🟡 YELLOW — TREAT AND MONITOR (refer if no improvement in 2 days):
  Fever without danger signs; fast breathing without chest indrawing;
  some dehydration; moderate pallor; MUAC 11.5–12.4cm; BP 140–179/90–119 in non-pregnant adults

🟢 GREEN — HOME CARE (educate caregiver; follow-up instructions):
  Normal vital signs; no danger signs; mild symptoms manageable at home; good nutrition

VITAL SIGNS REFERENCE:
TEMPERATURE (axillary):
  Normal: 36.0–37.4°C | Low-grade fever: 37.5–37.9°C | Fever: 38.0–38.9°C
  High fever ≥39.0°C: urgent assessment | ≥39.5°C with danger signs = RED

RESPIRATORY RATE:
  0–2 months: Normal <60; Fast ≥60 = refer urgently
  2–12 months: Normal <50; Fast ≥50 = YELLOW; with indrawing = RED
  1–5 years: Normal <40; Fast ≥40 = YELLOW; with indrawing = RED
  5+ years/adults: Normal <25; ≥30 = concerning; laboured = urgent

PULSE:
  Infants: 100–160 normal | Children 1–5: 80–130 | Adults: 60–100; >120 at rest = investigate

BLOOD PRESSURE (adults):
  Normal: <120/80 | Stage 1 hypertension: 130–139/80–89 → refer
  Stage 2: ≥140/90 → refer for treatment | Crisis ≥180/120 = RED EMERGENCY
  Pregnancy: ANY BP ≥140/90 = URGENT referral (pre-eclampsia)

MUAC (children 6–59 months, left arm):
  GREEN ≥12.5cm = Normal | YELLOW 11.5–12.4cm = Moderate Acute Malnutrition → refer
  RED <11.5cm = Severe Acute Malnutrition = URGENT referral + therapeutic feeding
  Pregnant women: MUAC <23cm = nutritional risk

DEHYDRATION (for diarrhoea cases):
  🟢 No dehydration: Alert; drinks normally; normal skin turgor; no sunken eyes
  🟡 Some dehydration: Restless/irritable; drinks eagerly; sunken eyes; slow skin turgor
  🔴 Severe dehydration: Lethargic; unable to drink; very sunken eyes; very slow turgor = EMERGENCY

MALARIA RDT:
  Positive = malaria confirmed → treat with ACT
  Negative = malaria unlikely BUT if high fever + danger signs in Bayelsa, still discuss with supervising health worker
  Always test before treating — overuse causes resistance

KEY REFERRAL FACILITIES FROM OLOIBIRI:
  Oloibiri Primary Health Centre (on-site basic care)
  Ogbia LGA Hospital, Ogbia town (~20 min drive)
  Federal Medical Centre, Yenagoa (full hospital; ~1.5–2 hours)
  Niger Delta University Teaching Hospital, Amassoma (~1 hour)
  For obstetric emergencies: FMC Yenagoa has maternity and NICU

REFERRAL NOTE — ALWAYS INCLUDE:
  Patient name, age, sex | Vital signs with time | Main complaint + duration
  Key findings (danger signs, abnormal vitals) | Assessment/impression (not diagnosis)
  Treatment given before referral | Navigator name + contact | Date and time
`;

// ─── Navigator Kit Inventory ──────────────────────────────────────────────────
// Solomon Matthias Solomon's full kit — vAI / Davidson AI Innovation Centre
// ALL treatment and diagnostic recommendations MUST reference this kit first.

const KIT_CONTEXT = `
NAVIGATOR KIT — SOLOMON MATTHIAS SOLOMON (vAI, Oloibiri):
The navigator has the following equipment. Always reference these specifically in your guidance.

INSTRUMENTS (durable — always available):
- iHealth No-Touch Infrared Thermometer → use for ALL patients; point at forehead 1-2 inches away
- Omron Gold BP Monitor (upper arm, Bluetooth) → use for adults, elderly, pregnant, any headache/dizziness
- Zacurate Pro 500DL Pulse Oximeter (SpO2 + pulse rate) → use for cough, breathing difficulty, any respiratory concern. Normal SpO2 ≥95%; ≤90% = severe hypoxia = RED
- Eko CORE 500 Digital Stethoscope (EKG + Bluetooth, AI-assisted) → use for chest auscultation on any respiratory or cardiac concern. Listen for wheezing, crackles, reduced breath sounds, murmurs
- Contour Next ONE Glucometer (Bluetooth) → use when diabetes suspected, elderly patient, known diabetic
- MUAC Tape → measure ALL children 6-59 months and ALL pregnant women

DIAGNOSTIC CONSUMABLES:
- Malaria RDTs (SD Bioline Ag P.f) — 50 available → ALWAYS perform before treating for malaria; result in 15-20 min; do not read after 30 min
- Typhoid RDTs (SD Bioline IgG/IgM) — 25 available → sustained fever + headache + abdominal pain + negative malaria RDT
- Urine Dipstick Strips (10-parameter) — 100 available → UTI suspected, or glucose/protein screening in diabetics and pregnant women
- Pregnancy Test Strips — 25 available → uncertain pregnancy status in women of reproductive age
- Glucometer Strips — 150 available → paired with Contour Next ONE glucometer

TREATMENT CONSUMABLES — recommend from this kit before suggesting hospital for treatable conditions:
⚠️ NAFDAC Alert 08/2025: counterfeit AL circulating as "Aflotin 20/120" (batch PA2128L) — use VERIFIED brands only.

- Artemether-Lumefantrine (AL) ADULT — 20 courses: 4 tablets at hours 0, 8, 24, 36, 48, 60. Give with food. Complete full course. NOT in 1st trimester pregnancy.
- Artemether-Lumefantrine (AL) PAEDIATRIC — 10 courses: weight-based (5-14kg: 1 tab; 15-24kg: 2 tabs; 25-34kg: 3 tabs per dose) × same 6-dose schedule.
- ORS Sachets — 40: dissolve 1 sachet in 1 litre clean water. Children 50-100ml per stool; adults 200-400ml. Fresh every 24 hours.
- Zinc Sulfate (paediatric) — 30 courses: ALWAYS with ORS for child diarrhoea. >6mo: 20mg daily × 14 days; <6mo: 10mg daily × 14 days.
- Paracetamol 500mg — 200 tabs: adults 500mg-1g every 6-8h (max 4g/day); children 10-15mg/kg every 6h. NO aspirin for children.
- Ibuprofen 400mg — 100 tabs: adults 400mg every 6-8h with food. NOT in pregnancy. NOT if dehydrated. NOT under 6 months.
- Amoxicillin 500mg ADULT — 10 courses: 500mg 3× daily × 5-7 days. Complete full course.
- Amoxicillin Suspension PAEDIATRIC — 5 courses: 25-50mg/kg/day in 3 divided doses × 5-7 days.
- Mebendazole 500mg — 20 doses: single 500mg dose for intestinal worms. Safe from age 1. Repeat in 2-4 weeks if needed.
- Metronidazole 400mg — 10 courses: 400mg 3× daily × 5-7 days. NO alcohol during and 48h after.
- Clotrimazole Antifungal Cream — 5 tubes: apply 2-3× daily, continue 2 weeks after resolution.
- Gentian Violet Solution — 2 bottles: oral thrush or wound care; stains purple.
- Cetirizine 10mg — 50 tabs: adults/children >6yr: 10mg once daily. Children 2-6yr: 5mg once daily.
- Petroleum Jelly — 2 tubs: dry skin, wound dressing base.
- Wound Care Pack (gauze, bandages, antiseptic) — 1 pack: clean, apply gauze, change daily.
- Nitrile Gloves — 2 boxes: wear for all procedures involving body fluids.
- Alcohol Swabs — 200: clean skin before finger pricks and wound assessment.
`;


// ─── Clinical tooltips for navigator education ───────────────────────────────

const VITAL_TOOLTIPS: Record<string, string> = {
  tempC: 'Normal axillary temp is 36.0–37.4°C. Fever ≥38°C needs investigation. In Bayelsa, fever = malaria until proven otherwise.',
  respiratoryRate: 'Count breaths for a full 60 seconds watching the chest rise. Fast breathing in adults (≥25/min) or children may mean pneumonia.',
  pulseRate: 'Normal adult pulse is 60–100 bpm. Above 100 at rest (tachycardia) can mean infection, dehydration, or pain.',
  bpSystolic: 'Top number. ≥140 in adults = hypertension needing referral. ≥180 = emergency. In pregnancy, ≥140 = urgent.',
  bpDiastolic: 'Bottom number. ≥90 in adults = hypertension. ≥120 = hypertensive crisis.',
  weightKg: 'Weight is essential for calculating drug doses and detecting malnutrition. Weigh without shoes if possible.',
  heightCm: 'Used with weight to assess growth in children. Measure without shoes, standing straight.',
  muacCm: 'Mid-Upper Arm Circumference — fastest way to screen for malnutrition in children 6–59 months. <11.5cm = severe (RED). 11.5–12.4cm = moderate (YELLOW).',
};

const SYMPTOM_TOOLTIPS: Record<string, string> = {
  fever: 'Fever in Bayelsa is malaria until an RDT proves otherwise. Ask how many days, whether it comes and goes, and if there are chills or sweating.',
  cough: 'Cough + fast breathing + chest indrawing = pneumonia in children. For adults, ask about duration, sputum colour, and whether it is worse at night.',
  chestIndrawing: 'Watch the lower chest during breathing. If it pulls INWARD when the child breathes IN — that is chest indrawing, a danger sign. Not the same as normal chest movement.',
  diarrhoea: 'Ask how many stools per day and whether there is blood. Assess dehydration: sunken eyes, skin turgor (pinch belly skin — does it spring back?), can they drink?',
  vomiting: 'Ask how many times, whether they can keep any fluid down, and if there is blood. Vomiting everything = danger sign.',
  palmarPallor: 'Look at the palms in good light. Pale or white palms suggest anaemia, which can be caused by malaria, malnutrition, or bleeding.',
  stiffNeck: 'Ask patient to touch chin to chest. If they cannot or it causes pain, this is a danger sign for meningitis — refer immediately.',
  eyeJaundice: 'Look at the whites of the eyes in natural light. Yellow colouration (jaundice) indicates liver involvement — possible severe malaria, hepatitis, or sickle cell crisis.',
  oedema: 'Press the top of the foot with your thumb for 3 seconds. If a pit (dent) remains, that is pitting oedema — sign of severe malnutrition, heart or kidney problems.',
  malariaSuspected: 'In Oloibiri, suspect malaria for any fever, headache, body aches, or child with poor feeding. Always test with RDT before treating.',
};

// ─── Symptom probe system prompt ─────────────────────────────────────────────

function buildProbePrompt(symptom: string, patient: Patient, currentAssessment: AssessmentData): string {
  const pg = PATIENT_GROUPS[patient.patient_group];
  const ageStr = patient.age_years != null ? `${patient.age_years} years` : patient.age_months != null ? `${patient.age_months} months` : 'age unknown';
  return `You are coaching a Community Health Navigator in Oloibiri, Bayelsa State, Nigeria, during a live patient assessment. The navigator is sitting with the patient RIGHT NOW and needs you to guide the clinical interview.

${KIT_CONTEXT}

PATIENT: ${patient.patient_name}, ${pg.label} (${ageStr}), ${patient.sex || 'sex unknown'}, ${patient.village}
CHIEF COMPLAINT: ${currentAssessment.chiefComplaint || 'not yet recorded'}
SYMPTOM BEING PROBED: ${symptom}
OTHER SYMPTOMS NOTED SO FAR: ${[
    currentAssessment.fever && 'fever',
    currentAssessment.cough && 'cough',
    currentAssessment.diarrhoea && 'diarrhoea',
    currentAssessment.vomiting && 'vomiting',
    currentAssessment.chestIndrawing && 'chest indrawing',
    currentAssessment.palmarPallor && 'palmar pallor',
    currentAssessment.stiffNeck && 'stiff neck',
    currentAssessment.oedema && 'oedema',
  ].filter(Boolean).join(', ') || 'none yet'}

YOUR ROLE:
- Ask ONE focused clinical question at a time that the navigator can read directly to the patient or caregiver
- Keep language very simple — the navigator may translate to Ijaw or Yoruba
- When relevant, instruct the navigator to USE A SPECIFIC KIT INSTRUMENT — for example:
  → For fever: "Use the iHealth thermometer to record temperature if not already done"
  → For cough/breathing: "Use the Zacurate pulse oximeter — clip to finger and read SpO2 and pulse rate"
  → For chest symptoms: "Use the Eko CORE 500 stethoscope — listen to front and back of chest on both sides"
  → For BP/headache/dizziness: "Use the Omron BP monitor on the upper arm"
  → For fever where malaria suspected: "Perform the SD Bioline Malaria RDT from your kit — result in 15-20 minutes"
  → For suspected UTI/diabetes/pregnancy: use the relevant dipstick or test strip
- After each answer, decide: do you need more information, or is this symptom fully characterised?
- When the symptom is FULLY and THOROUGHLY characterised — including all clinically relevant follow-up threads — end your message with the exact phrase: "✅ This symptom is well characterised. You can move on."
- NEVER mark a symptom as well characterised if there is a clinically significant finding that hasn't been fully explored (e.g. blood in sputum, blood in stool, high fever with neurological signs, chest pain with dyspnoea). Keep probing those threads until you have a complete clinical picture.
- There is NO limit on probing questions — follow the clinical evidence wherever it leads
- Draw on Bayelsa disease context: malaria, typhoid, pneumonia, cholera, malnutrition, oil-related illness

FORMAT: One short question or instrument instruction. After the navigator gives you the patient's answer or reading, probe deeper or confirm characterisation. Be direct, be brief, speak as if coaching the navigator in real time.

Start now with your FIRST question about: ${symptom}`;
}

// ─── Patient group config ─────────────────────────────────────────────────────

const PATIENT_GROUPS: Record<PatientGroup, {
  label: string; emoji: string; colour: string;
  bgLight: string; border: string; textColour: string;
}> = {
  'child-under-5': { label: 'Child under 5',  emoji: '👶🏿', colour: 'from-amber-500 to-orange-500', bgLight: 'bg-amber-50',  border: 'border-amber-300',  textColour: 'text-amber-700'  },
  'child-5-14':    { label: 'Child 5–14',     emoji: '👧🏿', colour: 'from-teal-500 to-green-500',  bgLight: 'bg-teal-50',   border: 'border-teal-300',   textColour: 'text-teal-700'   },
  'adult':         { label: 'Adult',           emoji: '🧑🏿', colour: 'from-blue-500 to-indigo-500', bgLight: 'bg-blue-50',   border: 'border-blue-300',   textColour: 'text-blue-700'   },
  'pregnant':      { label: 'Pregnant woman',  emoji: '🤰🏿', colour: 'from-rose-500 to-pink-500',  bgLight: 'bg-rose-50',   border: 'border-rose-300',   textColour: 'text-rose-700'   },
  'elderly':       { label: 'Elderly (60+)',   emoji: '👴🏿', colour: 'from-purple-500 to-violet-500', bgLight: 'bg-purple-50', border: 'border-purple-300', textColour: 'text-purple-700' },
};

const TRIAGE_CONFIG: Record<TriageLevel, {
  label: string; colour: string; bg: string; border: string;
  textDark: string; icon: React.ReactNode; description: string;
}> = {
  red:     { label: 'RED — Urgent Referral', colour: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-400',    textDark: 'text-red-800',    icon: <AlertTriangle size={14}/>, description: 'Refer immediately. Do not delay.' },
  yellow:  { label: 'YELLOW — Treat & Monitor', colour: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-400', textDark: 'text-yellow-800', icon: <AlertCircle size={14}/>,  description: 'Treat and monitor. Refer if no improvement in 2 days.' },
  green:   { label: 'GREEN — Home Care', colour: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-400',  textDark: 'text-green-800',  icon: <CheckCircle size={14}/>,  description: 'Home care with education and follow-up instructions.' },
  pending: { label: 'Pending Assessment',  colour: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-300',   textDark: 'text-gray-700',   icon: <Clock size={14}/>,        description: 'Assessment in progress.' },
};

const VILLAGES = ['Oloibiri', 'Ibiade', 'Otuabagi', 'Nembe', 'Ogbia', 'Yenagoa', 'Ikebiri', 'Other'];

// ─── Build AI triage system prompt ───────────────────────────────────────────

function buildTriagePrompt(patient: Patient, assessment: AssessmentData, probeNotes: Record<string, string>, priorHistoryContext = ''): string {
  const pg = PATIENT_GROUPS[patient.patient_group];
  const ageStr = patient.age_years != null
    ? `${patient.age_years} years${patient.age_months ? ` ${patient.age_months} months` : ''}`
    : patient.age_months != null ? `${patient.age_months} months` : 'age not specified';

  return `You are a clinical decision support system for a trained Community Health Navigator in Oloibiri, Bayelsa State, Nigeria. The navigator has completed a structured patient assessment and needs your AI-assisted triage classification.

${CLINICAL_CONTEXT}

${KIT_CONTEXT}

PATIENT: ${patient.patient_name}, ${pg.label} (${ageStr}), ${patient.sex || 'sex not recorded'}, ${patient.village}

ASSESSMENT DATA COLLECTED:
Chief complaint: ${assessment.chiefComplaint || 'not recorded'}

VITALS:
- Temperature: ${assessment.tempC ? `${assessment.tempC}°C (${assessment.tempMethod})` : 'not measured'}
- Respiratory rate: ${assessment.respiratoryRate ? `${assessment.respiratoryRate} breaths/min` : 'not measured'}
- Pulse: ${assessment.pulseRate ? `${assessment.pulseRate} bpm` : 'not measured'}
- Blood pressure: ${assessment.bpSystolic && assessment.bpDiastolic ? `${assessment.bpSystolic}/${assessment.bpDiastolic} mmHg` : 'not measured'}

ANTHROPOMETRY:
- Weight: ${assessment.weightKg ? `${assessment.weightKg} kg` : 'not measured'}
- Height: ${assessment.heightCm ? `${assessment.heightCm} cm` : 'not measured'}
- MUAC: ${assessment.muacCm ? `${assessment.muacCm} cm` : 'not measured'}

GENERAL DANGER SIGNS:
- Convulsions: ${assessment.convulsions ? '✅ YES' : 'No'}
- Unconscious/cannot wake: ${assessment.unconscious ? '✅ YES' : 'No'}
- Unable to feed/drink: ${assessment.unableToFeed ? '✅ YES' : 'No'}
- Vomits everything: ${assessment.vomitsEverything ? '✅ YES' : 'No'}

SYMPTOMS:
- Fever: ${assessment.fever ? `Yes (${assessment.feverDays || '?'} days)` : 'No'}
- Cough: ${assessment.cough ? `Yes (${assessment.coughDays || '?'} days)` : 'No'}
- Chest indrawing: ${assessment.chestIndrawing ? '✅ YES' : 'No'}
- Diarrhoea: ${assessment.diarrhoea ? `Yes (${assessment.diarrhoeaDays || '?'} days)${assessment.bloodInStool ? ' + blood in stool' : ''}` : 'No'}
- Vomiting: ${assessment.vomiting ? 'Yes' : 'No'}

SIGNS:
- Palmar pallor: ${assessment.palmarPallor ? 'Yes' : 'No'}
- Stiff neck: ${assessment.stiffNeck ? '✅ YES' : 'No'}
- Eye jaundice: ${assessment.eyeJaundice ? 'Yes' : 'No'}
- Oedema: ${assessment.oedema ? 'Yes' : 'No'}

MALARIA:
- RDT result: ${assessment.rdt}
- Recent bednet use: ${assessment.recentBednetUse ? 'Yes' : 'No'}

ADDITIONAL NOTES: ${assessment.additionalNotes || 'None'}

PHYSICAL OBSERVATIONS:
- General appearance: ${assessment.obs_appearance || 'Not recorded'}
- Breathing pattern: ${assessment.obs_breathing || 'Not recorded'}
- Skin & eyes: ${assessment.obs_skin || 'Not recorded'}
- Hydration signs: ${assessment.obs_hydration || 'Not recorded'}

AI-COACHED CLINICAL INTERVIEW NOTES:
${Object.keys(probeNotes).length === 0
  ? 'No in-depth probing conducted.'
  : Object.entries(probeNotes).map(([symptom, notes]) =>
      `[${symptom}]\n${notes}`
    ).join('\n\n')
}

YOUR TASK — provide a structured triage response:

1. **TRIAGE CLASSIFICATION**: State clearly — RED / YELLOW / GREEN — and the single most important reason
2. **KEY FINDINGS**: List the 2–4 most clinically significant findings from this assessment
3. **IMMEDIATE ACTIONS**: What the navigator must do RIGHT NOW (step by step). Reference specific kit instruments where applicable (e.g. "Use the Omron BP monitor to recheck BP in 10 minutes", "Perform the SD Bioline Malaria RDT now")
4. **REFERRAL GUIDANCE** (if RED or YELLOW): Where to go, what to say, what pre-referral actions to take
5. **REFERRAL NOTE DRAFT**: Write a ready-to-use referral note the navigator can copy or read aloud
6. **TREATMENT FROM NAVIGATOR KIT** (CRITICAL — always include this section):
   - Specify EXACTLY which items from the navigator's kit should be used, with precise dosing
   - For confirmed malaria: specify AL adult or paediatric with exact tablet count and timing schedule
   - For fever: paracetamol dose by weight/age from kit
   - For diarrhoea/dehydration: ORS preparation + zinc for children
   - For suspected bacterial infection: amoxicillin adult or paediatric with full course duration
   - For any other treatable condition: specify the exact kit item, dose, frequency, and duration
   - State clearly if a condition CANNOT be safely treated from the kit and requires hospital
   - Include the NAFDAC counterfeit AL warning if prescribing Artemether-Lumefantrine
7. **HOME CARE PLAN** (ALWAYS include even for RED cases — for what to do while waiting or if referral not possible):
   - Safe, specific actions the patient/caregiver can take at home
   - Positioning, fluids, rest, nutrition advice appropriate to this case
   - Clear warning signs: "Go to hospital immediately if…" (list 2–3 specific signs)
   - What NOT to do (e.g. do not give aspirin to children, do not stop ORS if vomiting)
8. **MISSING MEASUREMENTS**: Note any kit instruments that were NOT used but should have been for this patient type (e.g. "SpO2 not recorded — use Zacurate pulse oximeter for any respiratory concern")
9. **FOLLOW-UP**: When to reassess and what warning signs to watch for

IMPORTANT CONSTRAINTS:
- You are supporting a trained navigator, NOT replacing clinical judgement
- Use clear, plain language — the navigator may read this aloud to a supervisor
- If any danger sign is present: classify RED regardless of other findings
- Always err on the side of caution in this resource-limited high-risk context
- ALWAYS recommend treatment from the navigator's kit before suggesting hospital for conditions that can be safely managed at home
- End with one sentence the navigator can say directly to the patient/caregiver

⚠️ DISCLAIMER: This is clinical decision SUPPORT only. The navigator must follow their training and supervision protocols. This does not replace a doctor's assessment.${priorHistoryContext}`;
}

// ─── Build EVALUATE MY CASE HISTORY prompt (reflective self-review) ───────────

function buildFollowupPrompt(patient: Patient, assessment: Assessment): string {
  const pg = PATIENT_GROUPS[patient.patient_group];
  const tc = TRIAGE_CONFIG[assessment.triage_level];
  const probeCount = Object.keys(assessment.probe_notes ?? {}).length;
  const probeList = Object.keys(assessment.probe_notes ?? {}).join(', ') || 'none';
  return `You are a clinical supervision coach for a Community Health Navigator in Oloibiri, Bayelsa State, Nigeria. The navigator wants to reflect on the quality of their own assessment and identify where they could improve.

${CLINICAL_CONTEXT}

${KIT_CONTEXT}

CASE UNDER REVIEW:
Patient: ${patient.patient_name}, ${pg.label}, ${patient.village}
Chief complaint: ${assessment.assessment_data.chiefComplaint || 'not recorded'}
Triage result: ${tc.label}
Symptoms probed in-depth: ${probeList} (${probeCount} of the symptoms ticked)
AI triage summary: ${assessment.ai_triage_summary || 'not available'}
Follow-up scheduled: ${assessment.follow_up_needed ? (assessment.follow_up_date ? `Yes — ${assessment.follow_up_date}` : 'Yes (no date set)') : 'No'}
Resolved: ${assessment.resolved ? 'Yes' : 'No'}

YOUR ROLE — REFLECTIVE SUPERVISOR:
- Help the navigator critically evaluate the quality and completeness of THEIR OWN assessment
- Ask them what they think they did well or missed, then give honest, specific feedback
- Point out: symptoms that were ticked but NOT probed in-depth (missed depth), symptoms they may not have considered given the presentation, vital signs that were not recorded but should have been for this patient type, follow-up planning quality
- Be constructive and educational — this is a learning tool, not punishment
- Use the Bayelsa disease context to frame what a skilled navigator SHOULD have looked for
- Ask one reflective question at a time, wait for their answer, then respond

Start by acknowledging the case briefly, then ask the navigator: "Looking back at this assessment, what do you feel went well — and what would you do differently?"`;
}

// ─── Build PRIOR FOLLOW-UP CHAT prompt (guided clinical follow-up questions) ──

function buildPriorFollowupPrompt(
  patient: Patient,
  priorAssessments: Assessment[],
  followupIndex: number,
): string {
  const pg = PATIENT_GROUPS[patient.patient_group];

  // Sort chronologically ascending so the AI understands trajectory
  const sorted = [...priorAssessments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const historyBlock = sorted.map((a, i) => {
    const label = i === sorted.length - 1 ? `MOST RECENT ASSESSMENT (#${i + 1})` : `PRIOR ASSESSMENT #${i + 1}`;
    return `--- ${label} — ${new Date(a.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} ---
Chief complaint: ${a.assessment_data.chiefComplaint || 'not recorded'}
Triage: ${TRIAGE_CONFIG[a.triage_level].label}
AI summary: ${a.ai_triage_summary?.slice(0, 600) || 'not available'}
Follow-up notes on file: ${a.follow_up_notes || 'none'}`;
  }).join('\n\n');

  const baseAssessment = sorted[sorted.length - 1]; // most recent is what we're following up on

  return `You are a clinical follow-up guide for a Community Health Navigator in Oloibiri, Bayelsa State, Nigeria. The navigator is conducting a follow-up visit for a patient whose previous case(s) are on file. Your job is to guide the navigator through asking the RIGHT follow-up questions — ONE at a time — based on the trajectory of this patient's condition.

${CLINICAL_CONTEXT}

${KIT_CONTEXT}

PATIENT: ${patient.patient_name}, ${pg.label}, ${patient.village}

CASE HISTORY (chronological — note how symptoms and triage have evolved):
${historyBlock}

THIS IS FOLLOW-UP #${followupIndex + 1} on the most recent case above.

YOUR ROLE — GUIDED FOLLOW-UP COACH:
- Ask ONE focused follow-up question at a time that the navigator can read directly to the patient or caregiver
- Base each question on what we already know: look for improvement, deterioration, new symptoms, treatment adherence
- Consider the disease trajectory for this Bayelsa context: has the malaria resolved? Is fever gone? Did they make the referral? Are danger signs still present?
- After each answer from the navigator, decide what to ask next
- When you have enough to summarise the follow-up, produce a brief structured UPDATE SUMMARY (changes since last assessment, new triage recommendation if different, actions needed)
- Keep language very simple — the navigator may translate to Ijaw or Yoruba
- When the follow-up is complete, end with: "✅ Follow-up complete. Review the summary above and save your notes."

Start with your FIRST question, which should determine the most critical thing: has the patient's primary presenting concern (${baseAssessment.assessment_data.chiefComplaint || 'the chief complaint'}) improved, worsened, or stayed the same?`;
}

// ─── Build FOLLOW-UP RE-TRIAGE prompt (updated classification after a guided follow-up) ──

function buildFollowupTriagePrompt(
  patient: Patient,
  baseAssessment: Assessment,
  followupTranscript: string,
): string {
  const pg = PATIENT_GROUPS[patient.patient_group];
  const tc = TRIAGE_CONFIG[baseAssessment.triage_level];

  return `You are a clinical decision support system for a trained Community Health Navigator in Oloibiri, Bayelsa State, Nigeria. The navigator has just completed a guided follow-up conversation on an existing case and needs an UPDATED triage classification based on what has changed since the original assessment.

${CLINICAL_CONTEXT}

${KIT_CONTEXT}

PATIENT: ${patient.patient_name}, ${pg.label}, ${patient.village}

ORIGINAL ASSESSMENT (for context — do not re-triage this, only the current state below):
Chief complaint: ${baseAssessment.assessment_data.chiefComplaint || 'not recorded'}
Original triage: ${tc.label}
Original AI summary: ${baseAssessment.ai_triage_summary?.slice(0, 800) || 'not available'}

FOLLOW-UP CONVERSATION JUST CONDUCTED (this is the new information):
${followupTranscript}

YOUR TASK — provide an UPDATED structured triage response based on the follow-up:
1. **UPDATED TRIAGE CLASSIFICATION**: State clearly — RED / YELLOW / GREEN — and whether this is an improvement, worsening, or unchanged from the original triage
2. **WHAT CHANGED**: List the 2–4 most clinically significant changes reported in the follow-up
3. **IMMEDIATE ACTIONS**: What the navigator must do RIGHT NOW given this update
4. **REFERRAL GUIDANCE** (if RED or YELLOW): Where to go, what to say, what pre-referral actions to take
5. **HOME CARE / NEXT STEPS**: What the patient/caregiver should do until the next check-in, and clear warning signs to watch for
6. **NEXT FOLLOW-UP**: When to check in again

IMPORTANT CONSTRAINTS:
- You are supporting a trained navigator, NOT replacing clinical judgement
- If any new danger sign has appeared, classify RED regardless of the original triage level
- Always err on the side of caution in this resource-limited high-risk context
- End with one sentence the navigator can say directly to the patient/caregiver

⚠️ DISCLAIMER: This is clinical decision SUPPORT only. The navigator must follow their training and supervision protocols. This does not replace a doctor's assessment.`;
}

// ─── Build NEW ASSESSMENT RAG context prompt ───────────────────────────────────

function buildNewAssessmentContextBlock(priorAssessments: Assessment[]): string {
  if (!priorAssessments || priorAssessments.length === 0) return '';
  const sorted = [...priorAssessments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const summaries = sorted.map((a, i) =>
    `[Case ${i + 1} — ${new Date(a.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} — ${TRIAGE_CONFIG[a.triage_level].label}]\nChief complaint: ${a.assessment_data.chiefComplaint || 'not recorded'}\n${a.ai_triage_summary?.slice(0, 500) || ''}`
  ).join('\n\n');
  return `\n\nPATIENT HISTORY CONTEXT (${sorted.length} prior case(s) — consider these when interpreting the current presentation):\n${summaries}`;
}

// ─── Healthcare background (preserved from original) ─────────────────────────

const HealthBackground: React.FC = () => {
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
  const img = "url('/background_healthcare_navigator.png')";
  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="health-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.007" numOctaves="3" seed="22" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="55" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      {/* Desktop: offset for sidebar (left-64) + top bar (top-16). Mobile: full bleed from top bar (top-16, left-0) */}
      <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/70 via-indigo-900/60 to-teal-900/65" />
        <div className="absolute inset-0 bg-black/10" />
      </div>
      {moving && (
        <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 pointer-events-none" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1, filter: 'url(#health-distortion)', WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`, maskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)` }}>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/70 via-indigo-900/60 to-teal-900/65" />
        </div>
      )}
    </>
  );
};

// ─── Markdown renderer (preserved from original) ──────────────────────────────

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

// ─── Info tooltip ─────────────────────────────────────────────────────────────

const InfoTooltip: React.FC<{ id: string; text: string; open: boolean; onToggle: () => void }> = ({ id, text, open, onToggle }) => (
  <div className="relative inline-block">
    <button onClick={onToggle} className="ml-1.5 text-blue-400 hover:text-blue-600 focus:outline-none" aria-label="More info">
      <Lightbulb size={13}/>
    </button>
    {open && (
      <div className="absolute z-50 left-0 top-6 w-64 max-w-[calc(100vw-2rem)] bg-blue-900 text-blue-50 text-xs rounded-xl px-3 py-2.5 shadow-xl leading-relaxed">
        {text}
        <button onClick={onToggle} className="absolute top-1.5 right-2 text-blue-300 hover:text-white"><X size={11}/></button>
      </div>
    )}
  </div>
);

// ─── Checkbox row helper ──────────────────────────────────────────────────────

const CheckRow: React.FC<{
  label: string; checked: boolean; onChange: (v: boolean) => void;
  danger?: boolean; subField?: React.ReactNode;
  tooltip?: string; tooltipOpen?: boolean; onTooltipToggle?: () => void;
  onProbe?: () => void; probeActive?: boolean;
}> = ({ label, checked, onChange, danger, subField, tooltip, tooltipOpen, onTooltipToggle, onProbe, probeActive }) => (
  <div>
    <div className={classNames('flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
      checked
        ? danger ? 'bg-red-50 border-red-400' : 'bg-blue-50 border-blue-400'
        : 'border-gray-200 hover:border-gray-300')}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className={classNames('w-4 h-4 flex-shrink-0', danger ? 'accent-red-600' : 'accent-blue-600')} />
      <span className={classNames('text-sm font-medium flex-1', checked && danger ? 'text-red-700 font-bold' : 'text-gray-800')}
        onClick={() => onChange(!checked)}>
        {danger && checked && '⚠️ '}{label}
      </span>
      {tooltip && onTooltipToggle && (
        <InfoTooltip id={label} text={tooltip} open={!!tooltipOpen} onToggle={onTooltipToggle}/>
      )}
      {checked && onProbe && (
        <button onClick={e => { e.stopPropagation(); onProbe(); }}
          className={classNames('ml-1 px-2 py-0.5 rounded-lg text-xs font-bold border transition-colors flex-shrink-0',
            probeActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100')}>
          {probeActive ? '🔍 Probing…' : '🔍 Probe'}
        </button>
      )}
    </div>
    {checked && subField && <div className="mt-1 ml-10">{subField}</div>}
  </div>
);

// ─── Symptom Probe Panel (modal sheet) ───────────────────────────────────────

interface ProbePanelProps {
  symptom: string;
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
  symptom, messages, loading, done, input, onInputChange, onSend, onClose, chatEndRef
}) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-2 pb-2">
    <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '90dvh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-indigo-50 rounded-t-2xl">
        <div>
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide">Clinical Interview Coach</p>
          <p className="text-sm font-bold text-indigo-900">Probing: {symptom}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100">
          <X size={18}/>
        </button>
      </div>

      {/* Instruction bar */}
      <div className="px-4 py-2 bg-indigo-900 text-indigo-100 text-xs flex items-start gap-2">
        <span className="text-base">💬</span>
        <span>Read each question aloud to the patient. Type or speak their answer, then tap Send.</span>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.map(msg => (
          <div key={msg.id} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs flex-shrink-0">🏥</div>
            )}
            <div className={classNames('max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed',
              msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-indigo-50 text-indigo-900 rounded-tl-sm border border-indigo-100')}>
              {msg.role === 'assistant' && <p className="text-xs font-bold text-indigo-400 mb-1">AI Coach</p>}
              {msg.role === 'user' && <p className="text-xs font-bold text-blue-200 mb-1">Navigator answer</p>}
              <MarkdownText text={msg.content}/>
              {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs">🏥</div>
            <div className="bg-indigo-50 rounded-2xl rounded-tl-sm px-3 py-2.5">
              <div className="flex gap-1 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
            </div>
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      {/* Done banner */}
      {done && (
        <div className="mx-4 mb-2 bg-green-50 border border-green-300 rounded-xl px-3 py-2.5 flex items-center gap-2 text-green-800 text-sm font-semibold">
          <CheckCircle size={16} className="text-green-600 flex-shrink-0"/>
          Symptom fully characterised. Tap "Move On" when ready.
        </div>
      )}

      {/* Input — text-base prevents iOS auto-zoom */}
      <div className="border-t px-3 py-3 rounded-b-2xl">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSend(); } }}
            placeholder="Type patient's answer…"
            disabled={loading}
            className="flex-1 px-3 py-2.5 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          />
          <button onClick={onSend} disabled={!input.trim() || loading}
            className="px-3 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
            <Send size={15}/>
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 whitespace-nowrap">
            Move On ✓
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const HealthcareNavigatorPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  // ── Navigation
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);

  // ── Data
  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingAssessments, setLoadingAssessments] = useState(false);

  // ── Add-patient form
  const [newName, setNewName] = useState('');
  const [newVillage, setNewVillage] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAgeYears, setNewAgeYears] = useState('');
  const [newAgeMonths, setNewAgeMonths] = useState('');
  const [newSex, setNewSex] = useState<'male' | 'female' | ''>('');
  const [newGroup, setNewGroup] = useState<PatientGroup>('adult');
  const [newNotes, setNewNotes] = useState('');
  const [savingPatient, setSavingPatient] = useState(false);

  // ── Assessment form
  const [assessment, setAssessment] = useState<AssessmentData>({ ...BLANK_ASSESSMENT });
  const [isTriaging, setIsTriaging] = useState(false);
  const [triageResult, setTriageResult] = useState<{ level: TriageLevel; summary: string } | null>(null);
  const [navigatorActions, setNavigatorActions] = useState('');
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [assessmentSaved, setAssessmentSaved] = useState(false);

  // ── Symptom probe panel
  const [probeSymptom, setProbeSymptom] = useState<string | null>(null);
  const [probeMessages, setProbeMessages] = useState<ChatMessage[]>([]);
  const [probeInput, setProbeInput] = useState('');
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeDone, setProbeDone] = useState(false);
  const [probeNotes, setProbeNotes] = useState<Record<string, string>>({});
  const probeChatEndRef = useRef<HTMLDivElement>(null);

  // ── Tooltip visibility
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  // ── Follow-up chat (evaluate case history)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [speechOn, setSpeechOn] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // ── Prior follow-up chat state (guided clinical follow-up)
  const [priorFollowupMessages, setPriorFollowupMessages] = useState<ChatMessage[]>([]);
  const [priorFollowupInput, setPriorFollowupInput] = useState('');
  const [priorFollowupSending, setPriorFollowupSending] = useState(false);
  const [priorFollowupIndex, setPriorFollowupIndex] = useState(0);
  const [priorFollowupComplete, setPriorFollowupComplete] = useState(false);
  const [followupTriaging, setFollowupTriaging] = useState(false);
  const [followupTriageResult, setFollowupTriageResult] = useState<{ level: TriageLevel; summary: string } | null>(null);

  // ── Community AI Challenge state ─────────────────────────────────────────
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

  const priorFollowupEndRef = useRef<HTMLDivElement>(null);

  // ── Patient prior history (for RAG in new assessments and follow-up)
  const [patientPriorHistory, setPatientPriorHistory] = useState<Assessment[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // ─── Voice ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const speak = useCallback((text: string) => {
    if (!speechOn || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 400));
    const voice = voices.find(v => v.lang === 'en-NG') || voices.find(v => v.lang.startsWith('en'));
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    utt.rate = 0.87;
    window.speechSynthesis.speak(utt);
  }, [speechOn, voices]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isSending]);
  useEffect(() => { priorFollowupEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [priorFollowupMessages, priorFollowupSending]);

  // ─── Load patients ────────────────────────────────────────────────────────
  // ── Load active challenge for this page ─────────────────────────────────
  // Fast path: dashboard passed enrollment via navigation state (no race condition)
  // Slow path: query DB for direct navigation / page refresh
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

        let orgSlug = 'oloibiri';
        if (profile?.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', profile.organization_id)
            .single();
          orgSlug = org?.name?.toLowerCase().includes('ibiade') ? 'ibiade' : 'oloibiri';
        }

        const { data: challenges } = await supabase
          .from('community_challenges')
          .select('id, title, description, challenge_mode_intro, challenge_instruction, return_question_1, return_question_2, return_question_3, tier_target, org_id')
          .eq('community_impact_slug', 'healthcare')
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

        if (enrollment) {
          setActiveChallenge(mapped);
        } else {
          setAvailableChallenge(mapped);
        }
      } finally {
        setChallengeLoading(false);
      }
    })();
  }, [user?.id]);

  // ── Enroll in challenge ───────────────────────────────────────────────────
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
          org_id:       profile?.organization_id ?? 'oloibiri',
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

  // ── Submit challenge reflection ───────────────────────────────────────────
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
          community_member_role: 'health',
        })
        .eq('id', activeChallenge.enrollmentId);

      const { data, error } = await supabase.functions.invoke('evaluate-challenge-submission', {
        body: { enrollment_id: activeChallenge.enrollmentId },
      });

      if (error) throw error;
      if (data?.impact_evaluation) setChallengeResult(data.impact_evaluation);
    } catch (err) {
      console.error('[HealthcareNavigatorPage] challenge submit error:', err);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  const loadPatients = useCallback(async () => {
    if (!user) return;
    setLoadingPatients(true);
    try {
      const { data, error } = await supabase
        .from('health_patient_summary')
        .select('*')
        .eq('youth_user_id', user.id)
        .order('patient_name');
      if (!error && data) setPatients(data as Patient[]);
    } finally { setLoadingPatients(false); }
  }, [user]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  // ─── Load assessments ─────────────────────────────────────────────────────
  const loadAssessments = useCallback(async (patientId: string) => {

    if (!patientId) return;
    setLoadingAssessments(true);
    try {
      const { data, error } = await supabase
        .from('health_assessments')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        // Normalise probe_notes: pre-migration rows return null
        const normalised = data.map(row => ({
          ...row,
          probe_notes: row.probe_notes ?? {},
        })) as Assessment[];
        setAssessments(normalised);
        setPatientPriorHistory(normalised);
      }
    } finally { setLoadingAssessments(false); }
  }, []);

  // ─── Open symptom probe panel ─────────────────────────────────────────────
  const openProbe = useCallback(async (symptomKey: string, symptomLabel: string) => {
    if (!selectedPatient) return;
    setProbeSymptom(symptomLabel);
    setProbeMessages([]);
    setProbeInput('');
    setProbeDone(false);
    setProbeLoading(true);
    try {
      const systemPrompt = buildProbePrompt(symptomLabel, selectedPatient, assessment);
      const reply = await chatText({
        page: 'HealthcareNavigatorPage',
        messages: [{ role: 'user', content: `Start probing: ${symptomLabel}` }],
        system: systemPrompt,
        max_tokens: 400,
      });
      const isDone = reply.includes('✅ This symptom is well characterised');
      setProbeDone(isDone);
      setProbeMessages([{ id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setProbeLoading(false); }
  }, [selectedPatient, assessment]);

  // ─── Send probe reply ─────────────────────────────────────────────────────
  const sendProbeMessage = useCallback(async () => {
    if (!probeInput.trim() || probeLoading || !selectedPatient || !probeSymptom) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: probeInput.trim(), timestamp: new Date() };
    const updated = [...probeMessages, userMsg];
    setProbeMessages(updated);
    setProbeInput('');
    setProbeLoading(true);
    try {
      const systemPrompt = buildProbePrompt(probeSymptom, selectedPatient, assessment);
      const reply = await chatText({
        page: 'HealthcareNavigatorPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 400,
      });
      const isDone = reply.includes('✅ This symptom is well characterised');
      setProbeDone(isDone);
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      setProbeMessages(prev => [...prev, aiMsg]);
    } finally { setProbeLoading(false); }
  }, [probeInput, probeLoading, probeMessages, selectedPatient, probeSymptom, assessment]);

  // ─── Close probe panel and save notes ────────────────────────────────────
  const closeProbe = useCallback(() => {
    if (probeSymptom && probeMessages.length > 0) {
      // Build a clean Q&A summary keyed by symptom label
      const summary = probeMessages
        .map(m => `${m.role === 'assistant' ? 'AI Coach' : 'Navigator'}: ${m.content.slice(0, 600)}`)
        .join('\n');
      setProbeNotes(prev => ({ ...prev, [probeSymptom]: summary }));
      // No longer polluting additionalNotes — probe_notes is its own column
    }
    setProbeSymptom(null);
    setProbeMessages([]);
    setProbeDone(false);
  }, [probeSymptom, probeMessages]);

  useEffect(() => { probeChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [probeMessages, probeLoading]);

  // ─── Field updater ────────────────────────────────────────────────────────
  const setField = <K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) =>
    setAssessment(prev => ({ ...prev, [key]: value }));

  // ─── Detect triage from AI text ───────────────────────────────────────────
  const detectTriage = (text: string): TriageLevel => {
    const upper = text.toUpperCase();
    if (upper.includes('RED')) return 'red';
    if (upper.includes('YELLOW')) return 'yellow';
    if (upper.includes('GREEN')) return 'green';
    return 'yellow'; // default to caution
  };

  // ─── Run AI triage ────────────────────────────────────────────────────────
  const runTriage = async () => {
    if (!selectedPatient || isTriaging) return;
    setIsTriaging(true);
    try {
      const priorHistoryContext = buildNewAssessmentContextBlock(patientPriorHistory);
      const systemPrompt = buildTriagePrompt(selectedPatient, assessment, probeNotes, priorHistoryContext);
      const reply = await chatText({ page: 'HealthcareNavigatorPage', messages: [{ role: 'user', content: 'Please analyse this patient assessment and provide your triage classification.' }], system: systemPrompt, max_tokens: 800 });
      const level = detectTriage(reply);
      setTriageResult({ level, summary: reply });
      speak(reply.slice(0, 200));
    } catch { setTriageResult({ level: 'yellow', summary: 'Unable to complete AI triage. Please use your clinical training and contact your supervising health worker.' }); }
    finally { setIsTriaging(false); }
  };

  // ─── Save assessment ──────────────────────────────────────────────────────
  const saveAssessment = async () => {
    if (!user || !selectedPatient || !triageResult) return;
    setSavingAssessment(true);
    try {
      const { data, error } = await supabase
        .from('health_assessments')
        .insert({
          youth_user_id: user.id,
          patient_id: selectedPatient.patient_id,
          assessment_data: assessment,
          probe_notes: probeNotes,
          triage_level: triageResult.level,
          ai_triage_summary: triageResult.summary,
          navigator_actions: navigatorActions || null,
          conversation_history: [],
          follow_up_needed: followUpNeeded,
          follow_up_date: followUpDate || null,
          follow_up_notes: followUpNotes || null,
          resolved: false,
        })
        .select('id')
        .single();
      if (!error && data) {
        setAssessmentSaved(true);
        await loadPatients();
        await loadAssessments(selectedPatient.patient_id);
      }
    } finally { setSavingAssessment(false); }
  };

  // ─── Send follow-up message ───────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isSending || !selectedPatient || !selectedAssessment) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: inputText.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);
    try {
      const history = [...messages, userMsg];
      const systemPrompt = buildFollowupPrompt(selectedPatient, selectedAssessment);
      const reply = await chatText({ page: 'HealthcareNavigatorPage', messages: history.map(m => ({ role: m.role, content: m.content })), system: systemPrompt, max_tokens: 800 });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const updated = [...history, aiMsg];
      setMessages(updated);
      speak(reply);
      // Persist updated conversation to the assessment record
      await supabase.from('health_assessments').update({ conversation_history: updated }).eq('id', selectedAssessment.id);
    } catch { setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', content: 'Technical issue — please try again.', timestamp: new Date() }]); }
    finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [inputText, isSending, messages, selectedPatient, selectedAssessment, speak]);

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

  // ─── Save patient ─────────────────────────────────────────────────────────
  const savePatient = async () => {
    if (!user || !newName.trim() || !newVillage) return;
    setSavingPatient(true);
    try {
      const { error } = await supabase.from('health_patients').insert({
        youth_user_id: user.id,
        patient_name: newName.trim(),
        village: newVillage,
        phone: newPhone || null,
        age_years: newAgeYears ? Number(newAgeYears) : null,
        age_months: newAgeMonths ? Number(newAgeMonths) : null,
        sex: newSex || null,
        patient_group: newGroup,
        notes: newNotes || null,
      });
      if (!error) { await loadPatients(); resetAddPatient(); setMode('dashboard'); }
    } finally { setSavingPatient(false); }
  };

  const resetAddPatient = () => { setNewName(''); setNewVillage(''); setNewPhone(''); setNewAgeYears(''); setNewAgeMonths(''); setNewSex(''); setNewGroup('adult'); setNewNotes(''); };

  // ─── Start new assessment ─────────────────────────────────────────────────
  const startAssessment = (patient: Patient) => {
    setSelectedPatient(patient);
    setAssessment({ ...BLANK_ASSESSMENT });
    setTriageResult(null);
    setNavigatorActions('');
    setFollowUpNeeded(false);
    setFollowUpDate('');
    setFollowUpNotes('');
    setAssessmentSaved(false);
    setMode('new-assessment');
  };

  // ─── Open follow-up chat ──────────────────────────────────────────────────
  const openFollowupChat = (patient: Patient, assess: Assessment) => {
    setSelectedPatient(patient);
    setSelectedAssessment(assess);
    setMessages(assess.conversation_history || []);
    setInputText('');
    setMode('followup-chat');
    if ((assess.conversation_history || []).length === 0) {
      const opener: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `Let's review your assessment of **${patient.patient_name}** together.\n\nLooking back at this case, what do you feel went well — and what would you do differently?`,
        timestamp: new Date(),
      };
      setMessages([opener]);
    }
  };

  // ─── Open prior follow-up (guided clinical follow-up questions) ───────────
  const openPriorFollowupChat = (patient: Patient, assess: Assessment) => {
    setSelectedPatient(patient);
    setSelectedAssessment(assess);
    setPriorFollowupMessages([]);
    setPriorFollowupInput('');
    setPriorFollowupSending(false);
    setPriorFollowupComplete(false);
    setFollowupTriageResult(null);
    setFollowupTriaging(false);
    // How many follow-ups have already happened on this case?
    const followupCount = (assess.follow_up_notes || '').split('---FOLLOWUP---').filter(Boolean).length;
    setPriorFollowupIndex(followupCount);
    setMode('prior-followup-chat');
    // Kick off the first AI question
    const allCasesForPatient = patientPriorHistory.filter(a => a.patient_id === assess.patient_id || true);
    const systemPrompt = buildPriorFollowupPrompt(patient, allCasesForPatient, followupCount);
    setPriorFollowupSending(true);
    chatText({
      page: 'HealthcareNavigatorPage',
      messages: [{ role: 'user', content: 'Begin the follow-up assessment.' }],
      system: systemPrompt,
      max_tokens: 400,
    }).then(reply => {
      const done = reply.includes('✅ Follow-up complete');
      setPriorFollowupComplete(done);
      setPriorFollowupMessages([{ id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    }).finally(() => setPriorFollowupSending(false));
  };

  // ─── Send prior follow-up message ─────────────────────────────────────────
  const sendPriorFollowupMessage = useCallback(async () => {
    if (!priorFollowupInput.trim() || priorFollowupSending || !selectedPatient || !selectedAssessment) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: priorFollowupInput.trim(), timestamp: new Date() };
    const updated = [...priorFollowupMessages, userMsg];
    setPriorFollowupMessages(updated);
    setPriorFollowupInput('');
    setPriorFollowupSending(true);
    try {
      const allCases = patientPriorHistory;
      const systemPrompt = buildPriorFollowupPrompt(selectedPatient, allCases, priorFollowupIndex);
      const reply = await chatText({
        page: 'HealthcareNavigatorPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 500,
      });
      const done = reply.includes('✅ Follow-up complete');
      setPriorFollowupComplete(done);
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const finalMsgs = [...updated, aiMsg];
      setPriorFollowupMessages(finalMsgs);
      // Save follow-up notes appended to the same assessment row
      const newNoteBlock = `---FOLLOWUP---\n${new Date().toISOString()}\n${finalMsgs.map(m => `${m.role === 'assistant' ? 'AI' : 'Navigator'}: ${m.content.slice(0, 400)}`).join('\n')}`;
      const updatedNotes = ((selectedAssessment.follow_up_notes || '') + '\n' + newNoteBlock).trim();
      await supabase.from('health_assessments')
        .update({ follow_up_notes: updatedNotes, conversation_history: finalMsgs })
        .eq('id', selectedAssessment.id);
    } catch {
      setPriorFollowupMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', content: 'Technical issue — please try again.', timestamp: new Date() }]);
    } finally { setPriorFollowupSending(false); }
  }, [priorFollowupInput, priorFollowupSending, priorFollowupMessages, selectedPatient, selectedAssessment, patientPriorHistory, priorFollowupIndex]);

  // ─── Perform updated triage from the guided follow-up conversation ────────
  const runFollowupTriage = useCallback(async () => {
    if (!selectedPatient || !selectedAssessment || priorFollowupMessages.length === 0 || followupTriaging) return;
    setFollowupTriaging(true);
    try {
      const transcript = priorFollowupMessages
        .map(m => `${m.role === 'assistant' ? 'AI Follow-up Guide' : 'Navigator'}: ${m.content}`)
        .join('\n');
      const systemPrompt = buildFollowupTriagePrompt(selectedPatient, selectedAssessment, transcript);
      const reply = await chatText({
        page: 'HealthcareNavigatorPage',
        messages: [{ role: 'user', content: 'Based on this follow-up conversation, provide an updated triage classification.' }],
        system: systemPrompt,
        max_tokens: 700,
      });
      const level = detectTriage(reply);
      setFollowupTriageResult({ level, summary: reply });

      const stamp = `\n\n--- FOLLOW-UP RE-TRIAGE (${new Date().toLocaleString('en-NG')}) ---\n${reply}`;
      const updatedSummary = (selectedAssessment.ai_triage_summary || '') + stamp;

      await supabase.from('health_assessments')
        .update({ triage_level: level, ai_triage_summary: updatedSummary })
        .eq('id', selectedAssessment.id);

      setSelectedAssessment(prev => prev ? { ...prev, triage_level: level, ai_triage_summary: updatedSummary } : prev);
      await loadAssessments(selectedPatient.patient_id);
      await loadPatients();
    } catch {
      setFollowupTriageResult({ level: 'yellow', summary: 'Unable to complete updated triage. Please use your clinical training and contact your supervising health worker.' });
    } finally { setFollowupTriaging(false); }
  }, [selectedPatient, selectedAssessment, priorFollowupMessages, followupTriaging, loadAssessments, loadPatients]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  const triageBadge = (level: TriageLevel) => {
    const cfg = TRIAGE_CONFIG[level];
    return (
      <span className={classNames('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border', cfg.colour, cfg.bg, cfg.border)}>
        {cfg.icon} {level.toUpperCase()}
      </span>
    );
  };

  const markResolved = async (assessId: string) => {
    await supabase.from('health_assessments').update({ resolved: true }).eq('id', assessId);
    if (selectedPatient) loadAssessments(selectedPatient.patient_id);
    await loadPatients();
  };

  const hasDangerSign = () =>
    assessment.convulsions || assessment.unconscious ||
    assessment.unableToFeed || assessment.vomitsEverything ||
    assessment.chestIndrawing || assessment.stiffNeck;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'dashboard') {
    return (
      <AppLayout>
        <HealthBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          {/* Header bar */}
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl sm:text-2xl">🏥</div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">Health Navigator</h1>
                  <p className="text-xs text-blue-200 truncate">Your patient casebook · Oloibiri & Ibiade</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowOfflineModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold text-sm transition-colors border border-white/30"
                  title="Use offline version"
                >
                  📴 Offline
                </button>
                <button onClick={() => { resetAddPatient(); setMode('add-patient'); }}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:opacity-90">
                  <Plus size={16}/> <span className="hidden xs:inline">Add</span> Patient
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          {patients.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              {[
                { label: 'Patients', value: patients.length, icon: '👥' },
                { label: 'Open Cases', value: patients.reduce((s, p) => s + (p.open_cases ?? 0), 0), icon: '📋' },
                { label: 'This Month', value: patients.filter(p => p.last_assessment_at && new Date(p.last_assessment_at) > new Date(Date.now() - 30*24*60*60*1000)).length, icon: '📅' },
              ].map(stat => (
                <div key={stat.label} className="bg-white/90 backdrop-blur-sm rounded-xl p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl mb-0.5">{stat.icon}</div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500 leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Challenge Banner — available (not enrolled) ── */}
          {!challengeLoading && availableChallenge && !activeChallenge && (
            <div className="bg-blue-900/80 backdrop-blur-sm border border-blue-400/50 rounded-2xl p-5 mb-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-blue-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-blue-300 uppercase tracking-wide">Community AI Challenge — This Week</span>
                    <span className="text-xs bg-blue-400/20 text-blue-200 px-2 py-0.5 rounded-full">{availableChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{availableChallenge.title}</p>
                  <p className="text-blue-100 text-sm leading-relaxed mb-3">{availableChallenge.description}</p>
                  <button
                    onClick={() => handleEnrollChallenge(availableChallenge)}
                    disabled={enrolling}
                    className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
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
            <div className="bg-indigo-900/80 backdrop-blur-sm border border-indigo-400/50 rounded-2xl p-5 mb-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-indigo-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wide">Community AI Challenge — Active</span>
                    <span className="text-xs bg-indigo-400/20 text-indigo-200 px-2 py-0.5 rounded-full">{activeChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{activeChallenge.title}</p>
                  <p className="text-indigo-100 text-sm leading-relaxed mb-2">{activeChallenge.challenge_mode_intro}</p>
                  <div className="bg-indigo-800/60 rounded-xl p-3 mb-3">
                    <p className="text-xs font-bold text-indigo-300 mb-1">Your mission:</p>
                    <p className="text-indigo-100 text-sm">{activeChallenge.challenge_instruction}</p>
                  </div>
                  <button
                    onClick={() => setShowChallengeReflect(true)}
                    className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
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
                      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                        <Award size={32} className="text-blue-600" />
                      </div>
                      <h2 className="text-2xl font-black text-gray-900">{challengeResult.tier_label}</h2>
                      <p className="text-sm text-blue-600 font-bold uppercase tracking-wide mt-1">{challengeResult.tier} tier earned</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-blue-800 mb-1">What you achieved</p>
                      <p className="text-sm text-blue-700 leading-relaxed">{challengeResult.summary}</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-indigo-800 mb-1">Why you earned this tier</p>
                      <p className="text-sm text-indigo-700 leading-relaxed">{challengeResult.tier_reasoning}</p>
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
                      className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-0.5">Challenge Reflection</p>
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
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none leading-relaxed"/>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_2}</label>
                        <textarea value={challengeReflect2} onChange={e => setChallengeReflect2(e.target.value)} rows={3}
                          placeholder="What happened…"
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none leading-relaxed"/>
                      </div>
                      {activeChallenge.return_question_3 && (
                        <div>
                          <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_3}</label>
                          <textarea value={challengeReflect3} onChange={e => setChallengeReflect3(e.target.value)} rows={2}
                            placeholder="Additional details…"
                            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none leading-relaxed"/>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSubmitChallengeReflection}
                      disabled={!challengeReflect1.trim() || !challengeReflect2.trim() || challengeSubmitting}
                      className="w-full mt-6 py-3.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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

          {/* ── Offline Mode Modal ────────────────────────────────────────── */}
          {showOfflineModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b bg-blue-50 rounded-t-2xl">
                  <div>
                    <p className="text-xs font-bold text-blue-500 uppercase tracking-wide">Offline Mode</p>
                    <h2 className="text-lg font-bold text-gray-900">Healthcare Navigator — Offline</h2>
                  </div>
                  <button onClick={() => setShowOfflineModal(false)} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <X size={18}/>
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Open offline tool */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-blue-800 mb-2">📴 Use the offline navigator now</p>
                    <p className="text-sm text-blue-700 mb-3 leading-relaxed">
                      The offline version works without internet. It runs the full WHO IMCI triage — assessing danger signs, vital signs, and generating referral notes — and saves consultations to your device for later sync.
                    </p>
                    <a
                      href="/offline-health-navigator.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-sm hover:opacity-90 transition-opacity"
                    >
                      <span>📴</span> Open Offline Navigator
                    </a>
                  </div>

                  {/* Install on phone */}
                  <div className="border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-gray-800 mb-3">📱 Install on your phone (works without internet)</p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Open in your browser</p>
                          <p className="text-xs text-gray-500 mt-0.5">Tap "Open Offline Navigator" above. It will open in a new tab in your phone's browser (Chrome or Safari).</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Add to Home Screen</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            <strong>Android (Chrome):</strong> Tap the ⋮ menu → "Add to Home Screen" → "Add".<br/>
                            <strong>iPhone (Safari):</strong> Tap the Share button (□↑) → "Add to Home Screen" → "Add".
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Use it anywhere — no internet needed</p>
                          <p className="text-xs text-gray-500 mt-0.5">It will appear as an app icon. Open it in the field, complete the triage, and save the consultation to your device.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Sync when back online</p>
                          <p className="text-xs text-gray-500 mt-0.5">When you have internet again, open the app, tap the ⬆ sync button in the top right, and your saved consultations will upload to the vAI database automatically.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tips */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-2">💡 Tips for field use</p>
                    <ul className="space-y-1.5 text-xs text-amber-700">
                      <li>• Complete required fields — especially patient age, presenting complaint, and danger signs</li>
                      <li>• Use the 💡 tip buttons for WHO IMCI guidance on each assessment field</li>
                      <li>• <strong>Danger signs</strong> trigger immediate referral — always check these first</li>
                      <li>• The Referral Note at the end can be read aloud to the family or given to the clinic</li>
                      <li>• This tool is for triage and referral only — it does not replace a clinician's diagnosis</li>
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

          {loadingPatients ? (
            <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-blue-300"/></div>
          ) : patients.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 sm:p-10 text-center">
              <div className="text-5xl mb-4">🏥</div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">No patients registered yet</h2>
              <p className="text-sm text-gray-500 mb-5">Register your first community patient to start your casebook.</p>
              <button onClick={() => { resetAddPatient(); setMode('add-patient'); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:opacity-90">
                <Plus size={16}/> Register First Patient
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {patients.map(patient => {
                const pg = PATIENT_GROUPS[patient.patient_group];
                return (
                  <button key={patient.patient_id}
                    onClick={() => { setSelectedPatient(patient); loadAssessments(patient.patient_id); setMode('patient-detail'); }}
                    className="w-full bg-white/90 backdrop-blur-sm rounded-2xl p-4 text-left hover:bg-white active:bg-white transition-colors border border-transparent hover:border-blue-300 active:border-blue-300">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-lg">{pg.emoji}</div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{patient.patient_name}</p>
                          <p className="text-sm text-gray-500">{patient.village}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className={classNames('text-xs rounded-full px-2 py-0.5 font-medium border', pg.bgLight, pg.border, pg.textColour)}>
                              {pg.emoji} {pg.label}
                            </span>
                            {(patient.age_years != null || patient.age_months != null) && (
                              <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                                {patient.age_years != null ? `${patient.age_years}y` : ''}{patient.age_months != null ? ` ${patient.age_months}m` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <ChevronRight size={17} className="text-gray-400"/>
                        {(patient.open_cases ?? 0) > 0 && (
                          <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">{patient.open_cases} open</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      <span>{patient.total_assessments ?? 0} assessment{patient.total_assessments !== 1 ? 's' : ''}</span>
                      {patient.last_assessment_at && <span>Last: {formatDate(patient.last_assessment_at)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: ADD PATIENT
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'add-patient') {
    return (
      <AppLayout>
        <HealthBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div><h2 className="text-xl font-bold text-gray-900">Register Patient</h2><p className="text-sm text-gray-500">Add to your casebook</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Adaeze Okafor"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Village *</label>
                <select value={newVillage} onChange={e => setNewVillage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-base bg-white">
                  <option value="">Select village…</option>
                  {VILLAGES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Age (years)</label>
                  <input type="number" min="0" value={newAgeYears} onChange={e => setNewAgeYears(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-base"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Age (months)</label>
                  <input type="number" min="0" max="11" value={newAgeMonths} onChange={e => setNewAgeMonths(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-base"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Sex</label>
                  <select value={newSex} onChange={e => setNewSex(e.target.value as 'male' | 'female' | '')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-base bg-white">
                    <option value="">Not specified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Patient Group *</label>
                  <select value={newGroup} onChange={e => setNewGroup(e.target.value as PatientGroup)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-base bg-white">
                    {(Object.entries(PATIENT_GROUPS) as [PatientGroup, typeof PATIENT_GROUPS[PatientGroup]][]).map(([k, v]) => (
                      <option key={k} value={k}>{v.emoji} {v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone (optional)</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+234 801 234 5678" type="tel"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
                  placeholder="Chronic conditions, allergies, previous serious illness…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-base resize-none"/>
              </div>
              <button onClick={savePatient} disabled={!newName.trim() || !newVillage || savingPatient}
                className={classNames('w-full py-3.5 rounded-xl font-bold text-white text-base transition-opacity',
                  newName.trim() && newVillage && !savingPatient ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90' : 'bg-gray-300 cursor-not-allowed')}>
                {savingPatient ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>Saving…</span> : 'Register Patient'}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: PATIENT DETAIL
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'patient-detail' && selectedPatient) {
    const patient = selectedPatient;
    const pg = PATIENT_GROUPS[patient.patient_group];
    return (
      <AppLayout>
        <HealthBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1 flex-shrink-0"><ArrowLeft size={20}/></button>
              <div className="w-11 h-11 flex-shrink-0 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-2xl">{pg.emoji}</div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{patient.patient_name}</h2>
                <p className="text-sm text-gray-500 truncate">{patient.village}{patient.phone ? ` · ${patient.phone}` : ''}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={classNames('px-3 py-1.5 rounded-xl text-sm font-semibold border', pg.bgLight, pg.border, pg.textColour)}>
                {pg.emoji} {pg.label}
              </span>
              {(patient.age_years != null || patient.age_months != null) && (
                <span className="px-3 py-1.5 rounded-xl text-sm font-semibold border bg-gray-50 border-gray-200 text-gray-700">
                  Age: {patient.age_years != null ? `${patient.age_years}y` : ''}{patient.age_months != null ? ` ${patient.age_months}m` : ''}
                </span>
              )}
              {patient.sex && (
                <span className="px-3 py-1.5 rounded-xl text-sm font-semibold border bg-gray-50 border-gray-200 text-gray-700">
                  {patient.sex === 'female' ? '♀' : '♂'} {patient.sex}
                </span>
              )}
            </div>
            {patient.notes && <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg px-3 py-2 mb-4">{patient.notes}</p>}
            {/* Follow-up Prior Assessment — only shown when there's an open/prior case */}
            {assessments.length > 0 && !assessments[0].resolved && (
              <button onClick={() => openPriorFollowupChat(patient, assessments[0])}
                className="w-full mb-2 py-3 rounded-xl font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 active:bg-blue-100 flex items-center justify-center gap-2 text-sm sm:text-base">
                <Calendar size={17}/> Follow-up Prior Assessment
              </button>
            )}
            <button onClick={() => startAssessment(patient)}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 active:opacity-90 flex items-center justify-center gap-2 text-sm sm:text-base">
              <Stethoscope size={18}/> Start New Assessment
            </button>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList size={16} className="text-blue-600"/> Assessment History
              </h3>
              <button onClick={() => loadAssessments(patient.patient_id)} className="text-gray-400 hover:text-gray-700 p-1"><RefreshCw size={14}/></button>
            </div>
            {loadingAssessments ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-blue-600"/></div>
            ) : assessments.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">No assessments yet.</p>
            ) : (
              <div className="space-y-3">
                {assessments.map(a => (
                  <div key={a.id} className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{a.assessment_data.chiefComplaint || 'Assessment'}</p>
                        <p className="text-xs text-gray-500">{formatDate(a.created_at)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {triageBadge(a.triage_level)}
                        {a.resolved
                          ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Resolved</span>
                          : <span className="text-xs text-orange-600 font-semibold">Open</span>}
                      </div>
                    </div>
                    {a.follow_up_date && !a.resolved && (
                      <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                        <Calendar size={11}/> Follow-up: {formatDate(a.follow_up_date)}
                      </p>
                    )}
                    {/* Buttons stack on very small screens */}
                    <div className="flex flex-col xs:flex-row gap-2 mt-3">
                      <button onClick={() => { setSelectedAssessment(a); setMode('case-detail'); }}
                        className="flex-1 py-2.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700 active:border-blue-300">
                        View Case
                      </button>
                      <button onClick={() => openFollowupChat(patient, a)}
                        className="flex-1 py-2.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:bg-indigo-100">
                        Evaluate My Case History
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: NEW ASSESSMENT (structured form + AI triage)
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'new-assessment' && selectedPatient) {
    const patient = selectedPatient;
    const pg = PATIENT_GROUPS[patient.patient_group];
    const isChild = patient.patient_group === 'child-under-5' || patient.patient_group === 'child-5-14';
    const isPregnant = patient.patient_group === 'pregnant';

    return (
      <AppLayout>
        <HealthBackground />

        {/* Symptom Probe Panel Modal */}
        {probeSymptom && (
          <ProbePanel
            symptom={probeSymptom}
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

        <div className="relative z-10 max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">

          {/* Header */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4">
            <div className="flex items-center gap-3">
              <button onClick={() => { setMode('patient-detail'); }} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pg.colour} flex items-center justify-center text-xl`}>{pg.emoji}</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Assessment — {patient.patient_name}</h2>
                <p className="text-xs text-gray-500">{patient.village} · {pg.label}</p>
              </div>
            </div>
          </div>

          {/* Danger sign banner */}
          {hasDangerSign() && (
            <div className="bg-red-600 text-white rounded-xl p-4 flex items-start gap-3 animate-pulse">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold">⚠️ DANGER SIGN DETECTED</p>
                <p className="text-sm opacity-90">At least one IMCI danger sign is present. This patient likely requires IMMEDIATE RED referral. Run AI triage and contact your supervising health worker now.</p>
              </div>
            </div>
          )}

          {/* Chief complaint */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 sm:p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><FileText size={15} className="text-blue-600"/> Chief Complaint</h3>
            <textarea value={assessment.chiefComplaint} onChange={e => setField('chiefComplaint', e.target.value)} rows={2}
              placeholder="Main reason for this visit — what the patient/caregiver says in their own words…"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"/>
          </div>

          {/* Vitals */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 sm:p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Thermometer size={15} className="text-blue-600"/> Vital Signs</h3>
            <div className="space-y-3">
              {/* Temp */}
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                    Temperature (°C)
                    <InfoTooltip id="tempC" text={VITAL_TOOLTIPS.tempC} open={openTooltip === 'tempC'} onToggle={() => setOpenTooltip(openTooltip === 'tempC' ? null : 'tempC')}/>
                  </label>
                  <input type="number" inputMode="decimal" step="0.1" value={assessment.tempC} onChange={e => setField('tempC', e.target.value)} placeholder="e.g. 38.2"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div className="flex-shrink-0">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Method</label>
                  <select value={assessment.tempMethod} onChange={e => setField('tempMethod', e.target.value as AssessmentData['tempMethod'])}
                    className="px-3 py-2.5 border border-gray-300 rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="axillary">Axillary</option>
                    <option value="oral">Oral</option>
                    <option value="rectal">Rectal</option>
                  </select>
                </div>
                {assessment.tempC && (
                  <div className="text-xs font-bold pt-7 px-1">
                    {Number(assessment.tempC) >= 39.0 ? <span className="text-red-600">🔴</span>
                      : Number(assessment.tempC) >= 37.5 ? <span className="text-yellow-600">🟡</span>
                      : <span className="text-green-600">🟢</span>}
                  </div>
                )}
              </div>
              {/* RR + Pulse */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                    Resp. Rate (/min)
                    <InfoTooltip id="rr" text={VITAL_TOOLTIPS.respiratoryRate} open={openTooltip === 'rr'} onToggle={() => setOpenTooltip(openTooltip === 'rr' ? null : 'rr')}/>
                  </label>
                  <input type="number" inputMode="numeric" value={assessment.respiratoryRate} onChange={e => setField('respiratoryRate', e.target.value)} placeholder="Count 60s"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                    Pulse (bpm)
                    <InfoTooltip id="pulse" text={VITAL_TOOLTIPS.pulseRate} open={openTooltip === 'pulse'} onToggle={() => setOpenTooltip(openTooltip === 'pulse' ? null : 'pulse')}/>
                  </label>
                  <input type="number" inputMode="numeric" value={assessment.pulseRate} onChange={e => setField('pulseRate', e.target.value)} placeholder="e.g. 96"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
              </div>
              {/* BP */}
              {!isChild && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                      BP Systolic (mmHg)
                      <InfoTooltip id="bpSys" text={VITAL_TOOLTIPS.bpSystolic} open={openTooltip === 'bpSys'} onToggle={() => setOpenTooltip(openTooltip === 'bpSys' ? null : 'bpSys')}/>
                    </label>
                    <input type="number" inputMode="numeric" value={assessment.bpSystolic} onChange={e => setField('bpSystolic', e.target.value)} placeholder="e.g. 130"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                      BP Diastolic (mmHg)
                      <InfoTooltip id="bpDia" text={VITAL_TOOLTIPS.bpDiastolic} open={openTooltip === 'bpDia'} onToggle={() => setOpenTooltip(openTooltip === 'bpDia' ? null : 'bpDia')}/>
                    </label>
                    <input type="number" inputMode="numeric" value={assessment.bpDiastolic} onChange={e => setField('bpDiastolic', e.target.value)} placeholder="e.g. 85"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Anthropometry */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 sm:p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Activity size={15} className="text-blue-600"/> Measurements</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Weight (kg)</label>
                <input type="number" inputMode="decimal" step="0.1" value={assessment.weightKg} onChange={e => setField('weightKg', e.target.value)} placeholder="e.g. 12.5"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Height (cm)</label>
                <input type="number" inputMode="decimal" step="0.1" value={assessment.heightCm} onChange={e => setField('heightCm', e.target.value)} placeholder="e.g. 95"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-xs font-semibold text-gray-600 block mb-1">MUAC (cm)</label>
                <div className="relative">
                  <input type="number" inputMode="decimal" step="0.1" value={assessment.muacCm} onChange={e => setField('muacCm', e.target.value)} placeholder="e.g. 13.0"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  {assessment.muacCm && isChild && (
                    <div className="text-xs font-bold mt-1 text-center">
                      {Number(assessment.muacCm) < 11.5 ? <span className="text-red-600">🔴 SAM</span>
                        : Number(assessment.muacCm) < 12.5 ? <span className="text-yellow-600">🟡 MAM</span>
                        : <span className="text-green-600">🟢 OK</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Danger signs */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2"><AlertTriangle size={15}/> General Danger Signs (IMCI)</h3>
            <p className="text-xs text-gray-500 mb-3">ANY one = potential RED classification</p>
            <div className="space-y-2">
              <CheckRow label="Convulsions (now or in this illness)" checked={assessment.convulsions} onChange={v => setField('convulsions', v)} danger/>
              <CheckRow label="Unconscious / cannot be woken" checked={assessment.unconscious} onChange={v => setField('unconscious', v)} danger/>
              <CheckRow label="Unable to drink or feed" checked={assessment.unableToFeed} onChange={v => setField('unableToFeed', v)} danger/>
              <CheckRow label="Vomits everything" checked={assessment.vomitsEverything} onChange={v => setField('vomitsEverything', v)} danger/>
            </div>
          </div>

          {/* Symptoms */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2"><Stethoscope size={15} className="text-blue-600"/> Symptoms & Signs</h3>
            <p className="text-xs text-gray-400 mb-3 flex items-center gap-1"><span className="text-indigo-500 font-bold">🔍 Probe</span> — tap after checking a symptom to interview the patient in depth</p>
            <div className="space-y-2">
              <CheckRow label="Fever" checked={assessment.fever} onChange={v => setField('fever', v)}
                tooltip={SYMPTOM_TOOLTIPS.fever} tooltipOpen={openTooltip === 'fever'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'fever' ? null : 'fever')}
                onProbe={() => openProbe('fever', 'Fever')} probeActive={probeSymptom === 'Fever'}
                subField={<input type="text" value={assessment.feverDays} onChange={e => setField('feverDays', e.target.value)} placeholder="Days of fever" className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>}/>
              <CheckRow label="Cough" checked={assessment.cough} onChange={v => setField('cough', v)}
                tooltip={SYMPTOM_TOOLTIPS.cough} tooltipOpen={openTooltip === 'cough'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'cough' ? null : 'cough')}
                onProbe={() => openProbe('cough', 'Cough')} probeActive={probeSymptom === 'Cough'}
                subField={<input type="text" value={assessment.coughDays} onChange={e => setField('coughDays', e.target.value)} placeholder="Days of cough" className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>}/>
              <CheckRow label="Chest indrawing (lower chest pulls in when breathing)" checked={assessment.chestIndrawing} onChange={v => setField('chestIndrawing', v)} danger
                tooltip={SYMPTOM_TOOLTIPS.chestIndrawing} tooltipOpen={openTooltip === 'chestIndrawing'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'chestIndrawing' ? null : 'chestIndrawing')}
                onProbe={() => openProbe('chestIndrawing', 'Chest Indrawing')} probeActive={probeSymptom === 'Chest Indrawing'}/>
              <CheckRow label="Diarrhoea" checked={assessment.diarrhoea} onChange={v => setField('diarrhoea', v)}
                tooltip={SYMPTOM_TOOLTIPS.diarrhoea} tooltipOpen={openTooltip === 'diarrhoea'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'diarrhoea' ? null : 'diarrhoea')}
                onProbe={() => openProbe('diarrhoea', 'Diarrhoea')} probeActive={probeSymptom === 'Diarrhoea'}
                subField={
                  <div className="space-y-1">
                    <input type="text" value={assessment.diarrhoeaDays} onChange={e => setField('diarrhoeaDays', e.target.value)} placeholder="Days of diarrhoea" className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={assessment.bloodInStool} onChange={e => setField('bloodInStool', e.target.checked)} className="accent-blue-600"/>
                      Blood in stool
                    </label>
                  </div>
                }/>
              <CheckRow label="Vomiting" checked={assessment.vomiting} onChange={v => setField('vomiting', v)}
                tooltip={SYMPTOM_TOOLTIPS.vomiting} tooltipOpen={openTooltip === 'vomiting'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'vomiting' ? null : 'vomiting')}
                onProbe={() => openProbe('vomiting', 'Vomiting')} probeActive={probeSymptom === 'Vomiting'}/>
              <CheckRow label="Palmar pallor (pale palms)" checked={assessment.palmarPallor} onChange={v => setField('palmarPallor', v)}
                tooltip={SYMPTOM_TOOLTIPS.palmarPallor} tooltipOpen={openTooltip === 'palmarPallor'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'palmarPallor' ? null : 'palmarPallor')}
                onProbe={() => openProbe('palmarPallor', 'Palmar Pallor')} probeActive={probeSymptom === 'Palmar Pallor'}/>
              <CheckRow label="Stiff neck" checked={assessment.stiffNeck} onChange={v => setField('stiffNeck', v)} danger
                tooltip={SYMPTOM_TOOLTIPS.stiffNeck} tooltipOpen={openTooltip === 'stiffNeck'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'stiffNeck' ? null : 'stiffNeck')}
                onProbe={() => openProbe('stiffNeck', 'Stiff Neck')} probeActive={probeSymptom === 'Stiff Neck'}/>
              <CheckRow label="Jaundice (yellow eyes)" checked={assessment.eyeJaundice} onChange={v => setField('eyeJaundice', v)}
                tooltip={SYMPTOM_TOOLTIPS.eyeJaundice} tooltipOpen={openTooltip === 'eyeJaundice'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'eyeJaundice' ? null : 'eyeJaundice')}
                onProbe={() => openProbe('eyeJaundice', 'Jaundice')} probeActive={probeSymptom === 'Jaundice'}/>
              <CheckRow label="Oedema (swelling — feet, legs, face)" checked={assessment.oedema} onChange={v => setField('oedema', v)}
                tooltip={SYMPTOM_TOOLTIPS.oedema} tooltipOpen={openTooltip === 'oedema'} onTooltipToggle={() => setOpenTooltip(openTooltip === 'oedema' ? null : 'oedema')}
                onProbe={() => openProbe('oedema', 'Oedema')} probeActive={probeSymptom === 'Oedema'}/>
            </div>
          </div>

          {/* Physical Observation */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">👁️ Physical Observation</h3>
            <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">Look at the patient carefully. <span className="text-indigo-500 font-bold ml-1">🔍 Probe</span> — tap to interview in depth.</p>
            <div className="space-y-3">
              {([
                { key: 'obs_appearance' as const, label: 'General appearance', prompt: 'Does the patient look well, unwell, or very sick? Are they alert, drowsy, or difficult to wake?' },
                { key: 'obs_breathing' as const, label: 'Breathing pattern', prompt: 'Is breathing fast, laboured, or noisy? Can you hear wheezing or grunting? Any nasal flaring?' },
                { key: 'obs_skin' as const, label: 'Skin & eyes', prompt: 'Is the skin pale, yellow, or grey? Are the eyes sunken or yellow? Any rashes or wounds?' },
                { key: 'obs_hydration' as const, label: 'Hydration signs', prompt: 'Pinch the skin on the belly — does it spring back immediately? Are the lips dry? Is the child crying without tears?' },
              ] as Array<{ key: 'obs_appearance' | 'obs_breathing' | 'obs_skin' | 'obs_hydration'; label: string; prompt: string }>).map(obs => (
                <div key={obs.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      {obs.label}
                      <InfoTooltip id={obs.key} text={obs.prompt} open={openTooltip === obs.key} onToggle={() => setOpenTooltip(openTooltip === obs.key ? null : obs.key)}/>
                    </label>
                    {assessment[obs.key] && (
                      <button
                        onClick={() => openProbe(obs.key, obs.label)}
                        className={classNames('px-2 py-0.5 rounded-lg text-xs font-bold border transition-colors flex-shrink-0',
                          probeSymptom === obs.label ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100')}
                      >
                        {probeSymptom === obs.label ? '🔍 Probing…' : '🔍 Probe'}
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    placeholder={obs.prompt}
                    value={assessment[obs.key]}
                    onChange={e => setField(obs.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />
                  {probeNotes[obs.label] && (
                    <p className="text-xs text-indigo-600 mt-1 italic">✓ Probed — detail captured in additional notes</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Malaria */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-amber-700 mb-3 flex items-center gap-2">🦟 Malaria Assessment</h3>
            <div className="space-y-2">
              <CheckRow label="Malaria suspected" checked={assessment.malariaSuspected} onChange={v => setField('malariaSuspected', v)}/>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">RDT Result</label>
                <div className="flex gap-2">
                  {(['positive', 'negative', 'not_done'] as const).map(val => (
                    <button key={val} onClick={() => setField('rdt', val)}
                      className={classNames('flex-1 py-2 text-xs font-bold rounded-lg border transition-colors', assessment.rdt === val
                        ? val === 'positive' ? 'bg-red-600 text-white border-red-600'
                          : val === 'negative' ? 'bg-green-600 text-white border-green-600'
                          : 'bg-gray-600 text-white border-gray-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400')}>
                      {val === 'positive' ? '+ Positive' : val === 'negative' ? '– Negative' : 'Not done'}
                    </button>
                  ))}
                </div>
              </div>
              <CheckRow label="Patient uses bednet regularly" checked={assessment.recentBednetUse} onChange={v => setField('recentBednetUse', v)}/>
            </div>
          </div>

          {/* Additional notes */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-2">Additional Notes</h3>
            <textarea value={assessment.additionalNotes} onChange={e => setField('additionalNotes', e.target.value)} rows={3}
              placeholder="Any other observations, caregiver history, context…"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"/>
          </div>

          {/* AI Triage */}
          {!triageResult ? (
            <button onClick={runTriage} disabled={isTriaging || !assessment.chiefComplaint.trim()}
              className={classNames('w-full py-4 rounded-xl font-bold text-white text-base transition-opacity flex items-center justify-center gap-2',
                !isTriaging && assessment.chiefComplaint.trim() ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90' : 'bg-gray-300 cursor-not-allowed')}>
              {isTriaging ? <><Loader2 size={18} className="animate-spin"/>Running AI Triage…</> : <><Stethoscope size={18}/>Run AI Triage Classification</>}
            </button>
          ) : (
            <div className={classNames('bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5 border-2', TRIAGE_CONFIG[triageResult.level].border)}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Triage Result</p>
                  <div className="text-2xl font-black">{triageBadge(triageResult.level)}</div>
                  <p className="text-xs text-gray-500 mt-1">{TRIAGE_CONFIG[triageResult.level].description}</p>
                </div>
                <button onClick={() => { setTriageResult(null); runTriage(); }} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <RefreshCw size={12}/> Re-run
                </button>
              </div>
              <div className="text-sm text-gray-800 bg-gray-50 rounded-xl px-4 py-3 max-h-64 overflow-y-auto">
                <MarkdownText text={triageResult.summary}/>
              </div>

              {/* Save section */}
              <div className="mt-4 space-y-3 border-t pt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Actions taken by navigator</label>
                  <textarea value={navigatorActions} onChange={e => setNavigatorActions(e.target.value)} rows={2}
                    placeholder="e.g. Gave ORS, explained referral plan to caregiver, wrote referral note…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="followup" checked={followUpNeeded} onChange={e => setFollowUpNeeded(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
                  <label htmlFor="followup" className="text-sm font-semibold text-gray-700">Follow-up needed</label>
                </div>
                {followUpNeeded && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Follow-up date</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">What to check</label>
                      <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Check fever resolved"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                  </div>
                )}
                {assessmentSaved ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm bg-blue-50 rounded-xl px-4 py-3">
                      <CheckCircle size={16}/> Assessment saved to {patient.patient_name}'s record.
                    </div>
                    {/* Challenge nudge — shown after save when challenge is active */}
                    {activeChallenge && (
                      <div className="bg-blue-50 border border-blue-300 rounded-xl px-4 py-3 flex items-start gap-2">
                        <Award size={16} className="text-blue-600 flex-shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-blue-800 mb-1">Community AI Challenge active</p>
                          <p className="text-xs text-blue-700 mb-2">You completed an assessment — did you also complete your challenge mission? Submit your reflection to earn your tier.</p>
                          <button
                            onClick={() => setShowChallengeReflect(true)}
                            className="text-xs font-bold text-blue-700 underline hover:text-blue-900"
                          >
                            Submit challenge reflection →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={saveAssessment} disabled={savingAssessment}
                    className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 disabled:opacity-50">
                    {savingAssessment ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin"/>Saving…</span> : 'Save Assessment Record'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Clinical disclaimer */}
          <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck size={14} className="text-blue-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-600">This AI triage is clinical decision <strong>support only</strong>. Always follow your training and supervision protocols. Contact your supervising health worker for any RED or uncertain case.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: FOLLOW-UP CHAT
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'followup-chat' && selectedPatient && selectedAssessment) {
    const patient = selectedPatient;
    const assess = selectedAssessment;
    const tc = TRIAGE_CONFIG[assess.triage_level];
    const userTurns = messages.filter(m => m.role === 'user').length;

    return (
      <AppLayout>
        <HealthBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setMode('patient-detail'); }} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-lg">🏥</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Evaluate My Case History</h2>
                  <p className="text-xs text-gray-500">{patient.patient_name} · {triageBadge(assess.triage_level)}</p>
                </div>
              </div>
              <button onClick={() => { setSpeechOn(s => !s); if (speechOn) window.speechSynthesis.cancel(); }}
                className={classNames('p-2 rounded-lg', speechOn ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                {speechOn ? <Volume2 size={15}/> : <VolumeX size={15}/>}
              </button>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <Lightbulb size={14} className="text-indigo-700 flex-shrink-0"/>
            <p className="text-xs text-gray-700">Reflect on this assessment with your AI supervisor. Consider what you did well, what you missed, and what you'd do differently next time.</p>
          </div>

          {/* Chat panel — flex column, fills available vertical space without overflowing */}
          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: 'min(460px, calc(100dvh - 260px))' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl text-xs text-gray-500">
              <span className="font-semibold text-gray-700 flex items-center gap-1.5">🏥 Clinical AI Advisor</span>
              <span>{userTurns} exchange{userTurns !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
              {messages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-base sm:text-lg">🏥</div>
                  )}
                  <div className={classNames('max-w-[82%] rounded-2xl px-3 sm:px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant' && <p className="text-xs font-bold mb-1 opacity-50">AI Clinical Advisor</p>}
                    {msg.role === 'user' && <p className="text-xs font-bold mb-1 opacity-75">You (Navigator)</p>}
                    <MarkdownText text={msg.content}/>
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                      <User size={14} className="text-white"/>
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-base">🏥</div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center h-4">{[0, 150, 300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef}/>
            </div>
            <div className="border-t p-3 sm:p-4 rounded-b-2xl">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} rows={2}
                  placeholder="Share your thoughts on the assessment…"
                  disabled={isSending}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none leading-relaxed disabled:opacity-50"/>
                <div className="flex flex-col gap-2">
                  <button onClick={toggleListening}
                    className={classNames('p-2.5 rounded-xl transition-all', isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                    {isListening ? <MicOff size={16}/> : <Mic size={16}/>}
                  </button>
                  <button onClick={sendMessage} disabled={!inputText.trim() || isSending}
                    className={classNames('p-2.5 rounded-xl transition-all',
                      inputText.trim() && !isSending ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white hover:opacity-90' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
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

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: PRIOR FOLLOW-UP CHAT (guided clinical follow-up questions)
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'prior-followup-chat' && selectedPatient && selectedAssessment) {
    const patient = selectedPatient;
    const assess = selectedAssessment;
    const userTurns = priorFollowupMessages.filter(m => m.role === 'user').length;

    return (
      <AppLayout>
        <HealthBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setMode('patient-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-lg">🔄</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Follow-up Prior Assessment</h2>
                <p className="text-xs text-gray-500">{patient.patient_name} · Follow-up #{priorFollowupIndex + 1}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-teal-700 flex-shrink-0"/>
            <p className="text-xs text-gray-700">The AI will guide you through follow-up questions one at a time. Answer each question with what the patient tells you. Your responses are saved to the existing case record.</p>
          </div>

          {priorFollowupComplete && (
            <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 mb-4 flex items-center gap-2 text-green-800 text-sm font-semibold">
              <CheckCircle size={16} className="text-green-600 flex-shrink-0"/>
              Follow-up complete. Notes saved to the case record.
            </div>
          )}

          {userTurns > 0 && (
            <div className="mb-4">
              <button onClick={runFollowupTriage} disabled={followupTriaging}
                className={classNames('w-full py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all',
                  followupTriaging ? 'bg-gray-100 text-gray-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90')}>
                {followupTriaging ? <><Loader2 size={16} className="animate-spin"/> Re-evaluating…</> : <><Stethoscope size={16}/> Perform Updated Triage</>}
              </button>
              {followupTriageResult && (
                <div className={classNames('mt-3 rounded-xl border px-4 py-3', TRIAGE_CONFIG[followupTriageResult.level].bg, TRIAGE_CONFIG[followupTriageResult.level].border)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Updated Triage</span>
                    {triageBadge(followupTriageResult.level)}
                  </div>
                  <div className="text-sm text-gray-800 max-h-56 overflow-y-auto">
                    <MarkdownText text={followupTriageResult.summary}/>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: 'min(460px, calc(100dvh - 300px))' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-teal-50 rounded-t-2xl text-xs text-gray-500">
              <span className="font-semibold text-teal-800 flex items-center gap-1.5">🔄 AI Follow-up Guide</span>
              <span>{userTurns} answer{userTurns !== 1 ? 's' : ''} recorded</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
              {priorFollowupMessages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-base">🔄</div>
                  )}
                  <div className={classNames('max-w-[82%] rounded-2xl px-3 sm:px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user' ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant' && <p className="text-xs font-bold mb-1 opacity-50">AI Follow-up Guide</p>}
                    {msg.role === 'user' && <p className="text-xs font-bold mb-1 opacity-75">You (Navigator)</p>}
                    <MarkdownText text={msg.content}/>
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-600 flex items-center justify-center">
                      <User size={14} className="text-white"/>
                    </div>
                  )}
                </div>
              ))}
              {priorFollowupSending && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-base">🔄</div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center h-4">{[0, 150, 300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
                  </div>
                </div>
              )}
              <div ref={priorFollowupEndRef}/>
            </div>
            <div className="border-t p-3 sm:p-4 rounded-b-2xl">
              <div className="flex items-end gap-2">
                <textarea
                  value={priorFollowupInput}
                  onChange={e => setPriorFollowupInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPriorFollowupMessage(); } }}
                  rows={2}
                  placeholder={priorFollowupComplete ? 'Follow-up complete — notes saved.' : "Type patient's response here…"}
                  disabled={priorFollowupSending || priorFollowupComplete}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none leading-relaxed disabled:opacity-50"/>
                <button onClick={sendPriorFollowupMessage}
                  disabled={!priorFollowupInput.trim() || priorFollowupSending || priorFollowupComplete}
                  className={classNames('p-2.5 rounded-xl transition-all',
                    priorFollowupInput.trim() && !priorFollowupSending && !priorFollowupComplete
                      ? 'bg-gradient-to-br from-teal-600 to-blue-600 text-white hover:opacity-90'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
                  <Send size={16}/>
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: CASE DETAIL
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'case-detail' && selectedAssessment && selectedPatient) {
    const a = selectedAssessment;
    const tc = TRIAGE_CONFIG[a.triage_level];
    return (
      <AppLayout>
        <HealthBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('patient-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl">🏥</div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900">Assessment — {selectedPatient.patient_name}</h2>
                <p className="text-xs text-gray-500">{formatDate(a.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {triageBadge(a.triage_level)}
                {a.resolved
                  ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Resolved</span>
                  : <span className="text-xs text-orange-600 font-semibold">Open</span>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Chief Complaint</p>
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">{a.assessment_data.chiefComplaint || 'Not recorded'}</p>
              </div>

              {/* Key vitals summary */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Vitals Recorded</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Temp', value: a.assessment_data.tempC ? `${a.assessment_data.tempC}°C` : '—' },
                    { label: 'RR', value: a.assessment_data.respiratoryRate ? `${a.assessment_data.respiratoryRate}/min` : '—' },
                    { label: 'Pulse', value: a.assessment_data.pulseRate ? `${a.assessment_data.pulseRate} bpm` : '—' },
                    { label: 'BP', value: a.assessment_data.bpSystolic ? `${a.assessment_data.bpSystolic}/${a.assessment_data.bpDiastolic}` : '—' },
                    { label: 'Weight', value: a.assessment_data.weightKg ? `${a.assessment_data.weightKg} kg` : '—' },
                    { label: 'MUAC', value: a.assessment_data.muacCm ? `${a.assessment_data.muacCm} cm` : '—' },
                  ].map(v => (
                    <div key={v.label} className="flex justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                      <span className="text-gray-500 font-medium">{v.label}</span>
                      <span className="font-bold text-gray-900">{v.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Probe notes — labelled clinical interview summaries */}
              {a.probe_notes && Object.keys(a.probe_notes).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Clinical Interview Notes</p>
                  <div className="space-y-2">
                    {Object.entries(a.probe_notes).map(([symptom, notes]) => (
                      <div key={symptom} className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                        <p className="text-xs font-bold text-indigo-700 mb-1">🔍 {symptom}</p>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{notes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {a.ai_triage_summary && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Triage Summary</p>
                  <div className={classNames('text-sm text-gray-800 rounded-lg px-3 py-2 max-h-48 overflow-y-auto border whitespace-pre-wrap', tc.bg, tc.border)}>
                    <MarkdownText text={a.ai_triage_summary}/>
                  </div>
                </div>
              )}
              {a.navigator_actions && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Actions Taken</p>
                  <p className="text-sm text-gray-800 bg-blue-50 rounded-lg px-3 py-2">{a.navigator_actions}</p>
                </div>
              )}
              {(a.follow_up_needed || a.follow_up_notes) && (
                <div className="flex items-start gap-2 text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                  <Calendar size={14} className="mt-0.5 flex-shrink-0"/>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Follow-up{a.follow_up_date ? `: ${formatDate(a.follow_up_date)}` : a.follow_up_needed ? ' needed' : ''}</p>
                    {a.follow_up_notes && <p className="text-xs mt-0.5 whitespace-pre-wrap leading-relaxed">{a.follow_up_notes}</p>}
                  </div>
                </div>
              )}
              {/* Saved conversation — from either "Evaluate My Case History" or "Follow-up Prior Assessment" chats */}
              {a.conversation_history && a.conversation_history.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Saved Conversation</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto bg-gray-50 rounded-lg p-3 border border-gray-200">
                    {a.conversation_history.map(msg => (
                      <div key={msg.id} className={classNames('rounded-lg px-3 py-2 text-xs leading-relaxed',
                        msg.role === 'user' ? 'bg-teal-600 text-white ml-6' : 'bg-white text-gray-800 border border-gray-200 mr-6')}>
                        <p className="text-[10px] font-bold mb-0.5 opacity-60">{msg.role === 'user' ? 'Navigator' : 'AI'}</p>
                        <MarkdownText text={msg.content}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => openFollowupChat(selectedPatient, a)}
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                  Evaluate My Case History
                </button>
                {!a.resolved && (
                  <button onClick={async () => { await markResolved(a.id); setSelectedAssessment({ ...a, resolved: true }); }}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90">
                    Mark Resolved ✓
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return null;
};

export default HealthcareNavigatorPage;