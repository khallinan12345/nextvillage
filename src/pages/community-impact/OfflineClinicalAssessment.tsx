// src/pages/community-impact/OfflineClinicalAssessment.tsx
//
// OFFLINE CLINICAL ASSESSMENT — Rule-Based IMCI Triage Engine
//
// A fully offline clinical assessment tool for Community Health Navigators.
// NO API calls. NO network dependency. All logic is deterministic and
// based on WHO IMCI protocols + Nigeria/Bayelsa clinical context.
//
// Designed for: Solomon Matthias Solomon and future navigators
// Clinical review: Requires Dr. O'Connell sign-off before field deployment
//
// Features:
//   • Step-by-step mobile wizard (not a long form)
//   • Rule-based RED/YELLOW/GREEN triage classification
//   • Structured symptom interview scripts (branching questions per symptom)
//   • Pre-written clinical action cards for common presentations
//   • Referral note generator (deterministic template)
//   • LocalStorage persistence with sync-to-Supabase queue
//
// Route: /community-impact/healthcare-offline
// Activity: healthcare_navigator_offline

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Heart, Thermometer, Activity,
  AlertTriangle, CheckCircle, Clock, User, Save,
  ChevronRight, ChevronDown, Wifi, WifiOff, Upload,
  ClipboardList, ShieldCheck, Baby, Stethoscope,
  FileText, Calendar, RefreshCw, XCircle, AlertCircle,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type TriageLevel = 'red' | 'yellow' | 'green';
type PatientGroup = 'child-under-5' | 'child-5-14' | 'adult' | 'pregnant' | 'elderly';
type Step = 'patient' | 'vitals' | 'danger-signs' | 'symptoms' | 'observations' | 'result';

interface PatientInfo {
  name: string;
  village: string;
  ageYears: string;
  ageMonths: string;
  sex: 'male' | 'female' | '';
  group: PatientGroup;
  phone: string;
}

interface Vitals {
  tempC: string;
  tempMethod: 'axillary' | 'oral' | 'rectal';
  respiratoryRate: string;
  pulseRate: string;
  bpSystolic: string;
  bpDiastolic: string;
  weightKg: string;
  heightCm: string;
  muacCm: string;
}

interface DangerSigns {
  convulsions: boolean;
  unconscious: boolean;
  unableToFeed: boolean;
  vomitsEverything: boolean;
}

interface SymptomData {
  present: boolean;
  interview: Record<string, string>; // question key → answer
}

interface Symptoms {
  chiefComplaint: string;
  fever: SymptomData;
  cough: SymptomData;
  diarrhoea: SymptomData;
  vomiting: SymptomData;
  chestIndrawing: boolean;
  bloodInStool: boolean;
  palmarPallor: boolean;
  stiffNeck: boolean;
  eyeJaundice: boolean;
  oedema: boolean;
  malariaSuspected: boolean;
  rdt: 'positive' | 'negative' | 'not_done';
  recentBednetUse: boolean;
}

interface Observations {
  appearance: string;
  breathing: string;
  skin: string;
  hydration: string;
  additionalNotes: string;
}

interface TriageResult {
  level: TriageLevel;
  reasons: string[];
  actions: string[];
  homeCare: string[];
  warningSigns: string[];
  referralNeeded: boolean;
  referralFacility: string;
  referralUrgency: string;
  medications: string[];
}

interface SavedAssessment {
  id: string;
  timestamp: string;
  patient: PatientInfo;
  vitals: Vitals;
  dangerSigns: DangerSigns;
  symptoms: Symptoms;
  observations: Observations;
  triage: TriageResult;
  synced: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURED INTERVIEW SCRIPTS
// Each symptom has a fixed sequence of branching questions.
// These replace the AI probe coach in offline mode.
// ═══════════════════════════════════════════════════════════════════════════════

interface InterviewQuestion {
  key: string;
  question: string;          // What the navigator reads to the patient
  type: 'yes-no' | 'number' | 'choice' | 'text';
  choices?: string[];        // for 'choice' type
  clinicalNote?: string;     // education note shown to navigator (not read aloud)
  showIf?: (answers: Record<string, string>) => boolean; // conditional branching
}

const FEVER_INTERVIEW: InterviewQuestion[] = [
  { key: 'days', question: 'How many days have you had the fever?', type: 'number',
    clinicalNote: 'Fever >7 days may suggest typhoid, not malaria. Fever >3 days in a child under 5 always needs RDT.' },
  { key: 'pattern', question: 'Is the fever constant, or does it come and go?', type: 'choice',
    choices: ['Constant', 'Comes and goes', 'Only at night', 'Not sure'],
    clinicalNote: 'Intermittent fever with chills is classic malaria. Constant fever may suggest typhoid or bacterial infection.' },
  { key: 'chills', question: 'Do you have chills or shivering with the fever?', type: 'yes-no',
    clinicalNote: 'Rigors (violent shivering) are strongly associated with malaria in Bayelsa.' },
  { key: 'sweating', question: 'Do you have heavy sweating, especially at night?', type: 'yes-no',
    clinicalNote: 'Night sweats with fever — consider malaria, TB, or lymphoma in prolonged cases.' },
  { key: 'headache', question: 'Do you have a headache with the fever?', type: 'yes-no',
    clinicalNote: 'Headache + fever + stiff neck = meningitis until proven otherwise. Check stiff neck.' },
  { key: 'treatment', question: 'Have you taken any medicine for this fever? If yes, what?', type: 'text',
    clinicalNote: 'Important: prior antimalarial use affects treatment choice. ACT resistance is a concern if recent treatment failed.' },
  { key: 'lastMalaria', question: 'When was the last time you had malaria or malaria treatment?', type: 'text',
    clinicalNote: 'Recent malaria (<1 month ago) with recurrent fever may indicate treatment failure or re-infection.' },
];

const COUGH_INTERVIEW: InterviewQuestion[] = [
  { key: 'days', question: 'How many days have you had the cough?', type: 'number',
    clinicalNote: 'Cough >14 days in adults: consider TB. Cough >3 days in child under 5 with fast breathing: pneumonia.' },
  { key: 'sputumType', question: 'When you cough, does anything come up? What colour?', type: 'choice',
    choices: ['Dry cough (nothing comes up)', 'White/clear sputum', 'Yellow/green sputum', 'Brown/rusty sputum', 'Blood in sputum'],
    clinicalNote: 'Yellow/green = bacterial infection likely. Rusty = pneumonia. Blood = TB, pneumonia, or cancer — refer.' },
  { key: 'worseAtNight', question: 'Is the cough worse at night or when lying down?', type: 'yes-no',
    clinicalNote: 'Nocturnal cough: consider asthma, post-nasal drip, or heart failure in elderly.' },
  { key: 'chestPain', question: 'Do you have pain in your chest when you cough or breathe deeply?', type: 'yes-no',
    clinicalNote: 'Pleuritic chest pain (sharp, worse on breathing) with fever = pneumonia or pleural effusion.' },
  { key: 'breathingDifficulty', question: 'Are you having difficulty breathing or feeling short of breath?', type: 'yes-no',
    clinicalNote: 'Dyspnoea + cough + fever = likely lower respiratory tract infection. Assess respiratory rate carefully.' },
  { key: 'bloodSputum', question: 'Have you coughed up any blood, even just streaks?', type: 'yes-no',
    clinicalNote: 'Haemoptysis: even small amounts need referral. Consider TB, pneumonia, bronchiectasis.',
    showIf: (a) => a.sputumType !== 'Blood in sputum' },
  { key: 'tbContact', question: 'Has anyone in your household had TB (tuberculosis) or a long cough?', type: 'yes-no',
    clinicalNote: 'TB is a significant risk in this population. Known contact + chronic cough = high suspicion.',
    showIf: (a) => parseInt(a.days) >= 14 || a.sputumType === 'Blood in sputum' || a.bloodSputum === 'Yes' },
  { key: 'asthmaHistory', question: 'Have you ever been told you have asthma, or used an inhaler?', type: 'yes-no',
    clinicalNote: 'Asthma is underdiagnosed in this community. Wheezing + nocturnal cough + triggers = likely asthma.' },
];

const DIARRHOEA_INTERVIEW: InterviewQuestion[] = [
  { key: 'days', question: 'How many days have you had diarrhoea?', type: 'number',
    clinicalNote: 'Acute (<14 days) most likely infectious. Persistent (>14 days) needs investigation. Cholera: profuse watery stool, rapid dehydration.' },
  { key: 'frequency', question: 'How many times did you pass stool today or yesterday?', type: 'number',
    clinicalNote: '>6 watery stools/day in a child = high risk of dehydration. >10 in anyone = severe.' },
  { key: 'consistency', question: 'What does the stool look like?', type: 'choice',
    choices: ['Watery (like water)', 'Loose/mushy', 'Mucus (slimy)', 'Blood mixed in', 'Rice-water (white watery)'],
    clinicalNote: 'Rice-water stool = suspect cholera — immediate oral rehydration and referral. Blood = dysentery.' },
  { key: 'sunkenEyes', question: 'Look at the patient: are their eyes sunken?', type: 'yes-no',
    clinicalNote: 'Sunken eyes = dehydration sign. Combine with skin turgor and thirst assessment.' },
  { key: 'skinTurgor', question: 'Pinch the skin on the belly. Does it go back quickly or slowly?', type: 'choice',
    choices: ['Goes back immediately (normal)', 'Goes back slowly (1-2 seconds)', 'Stays pinched/tented (very slow)'],
    clinicalNote: 'Slow return = some dehydration (YELLOW). Tented/very slow = severe dehydration (RED). Test on abdomen, not hand.' },
  { key: 'drinking', question: 'Can the patient drink? Are they thirsty?', type: 'choice',
    choices: ['Drinks normally', 'Drinks eagerly (very thirsty)', 'Unable to drink or drinks poorly'],
    clinicalNote: 'Unable to drink = danger sign = RED. Drinks eagerly = some dehydration. Normal drinking = good sign.' },
  { key: 'alertness', question: 'Is the patient alert, restless, or lethargic?', type: 'choice',
    choices: ['Alert and active', 'Restless or irritable', 'Lethargic or difficult to wake'],
    clinicalNote: 'Lethargic = danger sign = RED regardless of other findings. Restless = some dehydration.' },
  { key: 'vomiting', question: 'Is the patient also vomiting? Can they keep fluids down?', type: 'choice',
    choices: ['No vomiting', 'Vomiting but can keep some fluids down', 'Vomits everything'],
    clinicalNote: 'Vomits everything = danger sign. Can keep some fluids = use frequent small sips of ORS.' },
];

const VOMITING_INTERVIEW: InterviewQuestion[] = [
  { key: 'frequency', question: 'How many times have they vomited today?', type: 'number',
    clinicalNote: 'Frequency helps assess severity. >5 times/day with no fluid retention = high dehydration risk.' },
  { key: 'keepFluids', question: 'Can they keep any water or ORS down between vomiting episodes?', type: 'yes-no',
    clinicalNote: 'If they can keep some fluids down, give small frequent sips (5ml every 1-2 minutes). If not = danger sign.' },
  { key: 'bloodInVomit', question: 'Is there any blood in the vomit, or does it look like coffee grounds?', type: 'yes-no',
    clinicalNote: 'Haematemesis (blood in vomit) = urgent referral. Coffee-ground vomit = upper GI bleeding.' },
  { key: 'abdominalPain', question: 'Does the patient have stomach or belly pain?', type: 'yes-no',
    clinicalNote: 'Vomiting + severe abdominal pain = possible surgical abdomen. Refer if pain is severe or constant.' },
  { key: 'lastAte', question: 'When did the patient last eat or drink successfully?', type: 'text',
    clinicalNote: 'No intake >12 hours in a child, or >24 hours in an adult, increases dehydration urgency.' },
];

// Map symptom keys to their interview scripts
const SYMPTOM_INTERVIEWS: Record<string, { label: string; script: InterviewQuestion[] }> = {
  fever:     { label: 'Fever', script: FEVER_INTERVIEW },
  cough:     { label: 'Cough', script: COUGH_INTERVIEW },
  diarrhoea: { label: 'Diarrhoea', script: DIARRHOEA_INTERVIEW },
  vomiting:  { label: 'Vomiting', script: VOMITING_INTERVIEW },
};

// ═══════════════════════════════════════════════════════════════════════════════
// RULE-BASED IMCI TRIAGE ENGINE
// Deterministic. Auditable. No LLM dependency.
// Based on WHO IMCI protocols + Nigeria/Bayelsa context from CLINICAL_CONTEXT.
// ═══════════════════════════════════════════════════════════════════════════════

function computeTriage(
  patient: PatientInfo,
  vitals: Vitals,
  dangerSigns: DangerSigns,
  symptoms: Symptoms,
  observations: Observations,
): TriageResult {
  const reasons: string[] = [];
  const actions: string[] = [];
  const homeCare: string[] = [];
  const warningSigns: string[] = [];
  const medications: string[] = [];
  let level: TriageLevel = 'green';
  let referralNeeded = false;
  let referralFacility = '';
  let referralUrgency = '';

  const ageYears = parseInt(patient.ageYears) || 0;
  const ageMonths = parseInt(patient.ageMonths) || 0;
  const totalMonths = ageYears * 12 + ageMonths;
  const temp = parseFloat(vitals.tempC) || 0;
  const rr = parseInt(vitals.respiratoryRate) || 0;
  const pulse = parseInt(vitals.pulseRate) || 0;
  const bpSys = parseInt(vitals.bpSystolic) || 0;
  const bpDia = parseInt(vitals.bpDiastolic) || 0;
  const muac = parseFloat(vitals.muacCm) || 0;
  const isChild = patient.group === 'child-under-5' || patient.group === 'child-5-14';
  const isUnder5 = patient.group === 'child-under-5';
  const isPregnant = patient.group === 'pregnant';

  // Helper to escalate triage level
  const escalate = (to: TriageLevel) => {
    if (to === 'red') level = 'red';
    else if (to === 'yellow' && level !== 'red') level = 'yellow';
  };

  // ── DANGER SIGNS → always RED ──────────────────────────────────────────────

  if (dangerSigns.convulsions) {
    escalate('red');
    reasons.push('DANGER SIGN: Convulsions present');
    actions.push('Place patient on their side (recovery position). Clear airway. Do NOT put anything in their mouth.');
    actions.push('Refer IMMEDIATELY to nearest hospital.');
  }
  if (dangerSigns.unconscious) {
    escalate('red');
    reasons.push('DANGER SIGN: Patient unconscious or cannot be woken');
    actions.push('Check airway is clear. Place in recovery position. Do NOT give any oral fluids or medicines.');
    actions.push('Refer IMMEDIATELY — this is a life-threatening emergency.');
  }
  if (dangerSigns.unableToFeed) {
    escalate('red');
    reasons.push('DANGER SIGN: Unable to drink or breastfeed');
    actions.push('Attempt small sips of ORS by spoon. If unable to swallow safely, refer immediately.');
  }
  if (dangerSigns.vomitsEverything) {
    escalate('red');
    reasons.push('DANGER SIGN: Vomits everything — cannot keep any fluid down');
    actions.push('Try small frequent sips (5ml ORS every 2 minutes). If still vomiting everything after 30 minutes, refer.');
  }

  // ── VITAL SIGN TRIGGERS ────────────────────────────────────────────────────

  // Temperature
  if (temp >= 39.5 && (dangerSigns.convulsions || dangerSigns.unconscious || symptoms.stiffNeck)) {
    escalate('red');
    reasons.push(`Very high fever (${vitals.tempC}°C) with danger signs`);
  } else if (temp >= 39.0) {
    escalate('yellow');
    reasons.push(`High fever: ${vitals.tempC}°C — needs investigation and treatment`);
    medications.push('Paracetamol: Adults 500mg–1g every 6–8 hours. Children: 10–15mg/kg every 6 hours. Tepid sponging.');
  } else if (temp >= 38.0) {
    escalate('yellow');
    reasons.push(`Fever: ${vitals.tempC}°C`);
    medications.push('Paracetamol for fever. Monitor temperature every 4 hours.');
  }

  // Respiratory rate
  if (rr > 0) {
    if (totalMonths <= 2 && rr >= 60) {
      escalate('red');
      reasons.push(`Very fast breathing for young infant: ${vitals.respiratoryRate}/min (≥60 at 0-2 months)`);
      actions.push('Refer urgently — possible serious bacterial infection in young infant.');
    } else if (totalMonths > 2 && totalMonths <= 12 && rr >= 50) {
      if (symptoms.chestIndrawing) {
        escalate('red');
        reasons.push(`Fast breathing (${vitals.respiratoryRate}/min) + chest indrawing in infant = severe pneumonia`);
      } else {
        escalate('yellow');
        reasons.push(`Fast breathing for age: ${vitals.respiratoryRate}/min (≥50 at 2-12 months)`);
      }
    } else if (totalMonths > 12 && totalMonths <= 60 && rr >= 40) {
      if (symptoms.chestIndrawing) {
        escalate('red');
        reasons.push(`Fast breathing (${vitals.respiratoryRate}/min) + chest indrawing in child = severe pneumonia`);
      } else {
        escalate('yellow');
        reasons.push(`Fast breathing for age: ${vitals.respiratoryRate}/min (≥40 at 1-5 years)`);
      }
    } else if (totalMonths > 60 && rr >= 30) {
      escalate('yellow');
      reasons.push(`Elevated respiratory rate: ${vitals.respiratoryRate}/min`);
    }
  }

  // Blood pressure
  if (bpSys > 0 && bpDia > 0) {
    if (bpSys >= 180 || bpDia >= 120) {
      escalate('red');
      reasons.push(`HYPERTENSIVE CRISIS: BP ${vitals.bpSystolic}/${vitals.bpDiastolic} mmHg`);
      actions.push('Keep patient calm and seated. Refer IMMEDIATELY to hospital. Do NOT give any medication without doctor order.');
      referralNeeded = true;
      referralFacility = 'Federal Medical Centre, Yenagoa or nearest hospital with emergency capacity';
      referralUrgency = 'IMMEDIATE — hypertensive emergency';
    } else if (isPregnant && (bpSys >= 140 || bpDia >= 90)) {
      escalate('red');
      reasons.push(`HIGH BP IN PREGNANCY: ${vitals.bpSystolic}/${vitals.bpDiastolic} — pre-eclampsia risk`);
      actions.push('Ask about headache, visual disturbances, upper abdominal pain, swelling of hands/face.');
      actions.push('Refer URGENTLY to FMC Yenagoa maternity ward. Pre-eclampsia can progress rapidly.');
      referralNeeded = true;
      referralFacility = 'FMC Yenagoa — Maternity/Obstetric Emergency';
      referralUrgency = 'URGENT — possible pre-eclampsia';
    } else if (bpSys >= 140 || bpDia >= 90) {
      escalate('yellow');
      reasons.push(`Hypertension: BP ${vitals.bpSystolic}/${vitals.bpDiastolic} mmHg`);
      actions.push('Refer to clinic for BP management. Advise reducing salt intake.');
    }
  }

  // Pulse
  if (pulse > 0) {
    if (!isChild && pulse > 120) {
      escalate('yellow');
      reasons.push(`Tachycardia: Pulse ${vitals.pulseRate} bpm at rest — may indicate infection, dehydration, or pain`);
    }
  }

  // MUAC (children 6-59 months)
  if (muac > 0 && totalMonths >= 6 && totalMonths <= 59) {
    if (muac < 11.5) {
      escalate('red');
      reasons.push(`SEVERE ACUTE MALNUTRITION: MUAC ${vitals.muacCm} cm (<11.5)`);
      actions.push('Begin therapeutic feeding if available. Refer to nutrition rehabilitation centre.');
      referralNeeded = true;
      referralFacility = 'Ogbia LGA Hospital or FMC Yenagoa — Nutrition/Paediatrics';
      referralUrgency = 'URGENT — SAM requires therapeutic feeding';
    } else if (muac < 12.5) {
      escalate('yellow');
      reasons.push(`Moderate Acute Malnutrition: MUAC ${vitals.muacCm} cm (11.5–12.4)`);
      actions.push('Nutritional counselling. Refer to supplementary feeding programme.');
      homeCare.push('Ensure 3 meals + 2 snacks daily. Add oil/groundnut paste to porridge for energy density.');
    }
  }
  // MUAC in pregnant women
  if (muac > 0 && isPregnant && muac < 23) {
    escalate('yellow');
    reasons.push(`Nutritional risk in pregnancy: MUAC ${vitals.muacCm} cm (<23)`);
    homeCare.push('Increase food intake. Iron-folate supplementation. Refer for antenatal nutritional support.');
  }

  // ── SYMPTOM-SPECIFIC RULES ─────────────────────────────────────────────────

  // Stiff neck + fever = meningitis suspicion
  if (symptoms.stiffNeck && (temp >= 38.0 || symptoms.fever.present)) {
    escalate('red');
    reasons.push('MENINGITIS SUSPECTED: Stiff neck + fever — refer immediately');
    actions.push('Do NOT delay. Keep patient lying down. Protect from light if photophobic. Refer to hospital with emergency capacity.');
    referralNeeded = true;
    referralFacility = 'FMC Yenagoa or Niger Delta University Teaching Hospital';
    referralUrgency = 'IMMEDIATE — suspected meningitis';
  }

  // Chest indrawing (without already being caught by RR rules)
  if (symptoms.chestIndrawing && level !== 'red') {
    escalate('red');
    reasons.push('Chest indrawing present — sign of severe respiratory distress');
    actions.push('Refer urgently. If available, give first dose of amoxicillin before referral.');
  }

  // Fever + malaria context
  if (symptoms.fever.present && symptoms.rdt === 'positive') {
    escalate('yellow');
    reasons.push('MALARIA CONFIRMED: Fever + positive RDT');
    medications.push('ACT (Artemether-Lumefantrine): Adults — 4 tablets at 0, 8, 24, 36, 48, 60 hours (total 24 tablets). Check for allergies first.');
    if (isUnder5) {
      medications.push('ACT dosing for children by weight — refer to weight-based dosing chart. Ensure child completes full 3-day course.');
    }
    if (isPregnant) {
      escalate('red');
      reasons.push('MALARIA IN PREGNANCY — higher risk of complications');
      actions.push('Refer to facility for supervised antimalarial treatment. Quinine may be needed in first trimester.');
      referralNeeded = true;
      referralFacility = 'FMC Yenagoa — Maternity';
      referralUrgency = 'URGENT — malaria in pregnancy';
    }
    homeCare.push('Complete the full course of ACT even if feeling better. Paracetamol for fever. Plenty of fluids.');
    homeCare.push('Sleep under insecticide-treated bednet. Return if fever persists after 3 days of treatment.');
    warningSigns.push('Fever still present after 3 days of ACT — return immediately');
    warningSigns.push('Convulsions, loss of consciousness, inability to eat or drink — go to hospital immediately');
  } else if (symptoms.fever.present && symptoms.rdt === 'not_done') {
    escalate('yellow');
    reasons.push('Fever present — RDT not performed. In Bayelsa, fever = malaria until proven otherwise.');
    actions.push('Perform RDT if available. If RDT not available and fever >38°C, consider empiric ACT treatment per guidelines.');
  } else if (symptoms.fever.present && symptoms.rdt === 'negative') {
    escalate('yellow');
    reasons.push('Fever with negative RDT — consider typhoid, UTI, or other infection');
    actions.push('Monitor closely. If fever persists >3 days, refer for laboratory investigation (blood culture, urinalysis).');
  }

  // Diarrhoea — dehydration assessment from interview
  if (symptoms.diarrhoea.present) {
    const di = symptoms.diarrhoea.interview;
    const isSevereDehydration =
      di.skinTurgor === 'Stays pinched/tented (very slow)' ||
      di.drinking === 'Unable to drink or drinks poorly' ||
      di.alertness === 'Lethargic or difficult to wake';
    const isSomeDehydration =
      di.skinTurgor === 'Goes back slowly (1-2 seconds)' ||
      di.drinking === 'Drinks eagerly (very thirsty)' ||
      di.alertness === 'Restless or irritable' ||
      di.sunkenEyes === 'Yes';
    const isCholera = di.consistency === 'Rice-water (white watery)';

    if (isSevereDehydration) {
      escalate('red');
      reasons.push('SEVERE DEHYDRATION: ' + [
        di.skinTurgor === 'Stays pinched/tented (very slow)' && 'skin turgor very slow',
        di.drinking === 'Unable to drink or drinks poorly' && 'unable to drink',
        di.alertness === 'Lethargic or difficult to wake' && 'lethargic',
      ].filter(Boolean).join(', '));
      actions.push('Begin ORS immediately (small frequent sips if conscious). Refer urgently for IV fluids.');
      referralNeeded = true;
      referralFacility = 'Ogbia LGA Hospital or FMC Yenagoa';
      referralUrgency = 'URGENT — severe dehydration, may need IV fluids';
    } else if (isSomeDehydration) {
      escalate('yellow');
      reasons.push('SOME DEHYDRATION detected in diarrhoea assessment');
      medications.push('ORS: Dissolve 1 sachet in 1 litre of clean water. Give small frequent sips — 50-100ml after each loose stool (children), 200-400ml for adults.');
      homeCare.push('Continue feeding. Breastfed infants: increase breastfeeding frequency. Give ORS after every loose stool.');
    }
    if (isCholera) {
      escalate('red');
      reasons.push('CHOLERA SUSPECTED: Rice-water stool pattern');
      actions.push('Begin aggressive ORS. Refer immediately. Report to health authorities — cholera is notifiable.');
      referralNeeded = true;
      referralFacility = 'FMC Yenagoa — Cholera Treatment Centre if active';
      referralUrgency = 'IMMEDIATE — suspected cholera';
    }
    if (symptoms.bloodInStool) {
      escalate('yellow');
      reasons.push('Blood in stool — possible dysentery');
      actions.push('Refer for stool examination and antibiotic treatment. Maintain hydration.');
    }

    if (!isSevereDehydration) {
      homeCare.push('ORS after every loose stool. Continue feeding. Monitor for worsening dehydration.');
      warningSigns.push('Unable to drink, vomiting everything, blood in stool, or very drowsy — go to hospital immediately');
    }
  }

  // Eye jaundice
  if (symptoms.eyeJaundice) {
    escalate('yellow');
    reasons.push('Jaundice (yellow eyes) — possible severe malaria, hepatitis, or sickle cell crisis');
    actions.push('Refer for liver function assessment and blood tests.');
  }

  // Oedema
  if (symptoms.oedema) {
    if (isUnder5) {
      escalate('red');
      reasons.push('Bilateral oedema in child under 5 — sign of kwashiorkor (severe malnutrition)');
      referralNeeded = true;
      referralFacility = 'Ogbia LGA Hospital — Nutrition/Paediatrics';
      referralUrgency = 'URGENT — suspected kwashiorkor';
    } else {
      escalate('yellow');
      reasons.push('Oedema present — needs investigation (heart, kidney, liver, or nutritional cause)');
    }
  }

  // Palmar pallor
  if (symptoms.palmarPallor) {
    escalate('yellow');
    reasons.push('Palmar pallor — likely anaemia (common causes: malaria, malnutrition, hookworm)');
    actions.push('Refer for haemoglobin test. Consider iron supplementation if mild.');
    if (isPregnant) {
      actions.push('Anaemia in pregnancy is dangerous. Ensure iron-folate supplementation. Refer if pallor is severe.');
    }
  }

  // ── GREEN-LEVEL HOME CARE (if no escalation occurred) ──────────────────────

  if (level === 'green') {
    reasons.push('No danger signs. Vital signs within normal range. Symptoms manageable at home.');
    homeCare.push('Continue regular meals and fluids. Rest as needed.');
    homeCare.push('Return in 2 days for follow-up, or immediately if condition worsens.');
    if (symptoms.fever.present) {
      homeCare.push('Paracetamol for fever. Tepid sponging. Plenty of fluids. Sleep under treated bednet.');
    }
    if (symptoms.cough.present) {
      homeCare.push('Warm fluids for comfort. Honey and lemon (not for children under 1 year). Monitor breathing rate.');
    }
    warningSigns.push('Any danger sign: convulsions, loss of consciousness, unable to drink, vomiting everything');
    warningSigns.push('Fever that does not improve after 2 days');
    warningSigns.push('Breathing becomes fast or difficult');
  }

  // ── DEFAULT REFERRAL ASSIGNMENT ────────────────────────────────────────────

  if (level === 'red' && !referralNeeded) {
    referralNeeded = true;
    referralFacility = referralFacility || 'Ogbia LGA Hospital, Ogbia town (~20 min drive)';
    referralUrgency = referralUrgency || 'URGENT — danger signs present';
  }
  if (level === 'yellow' && !referralNeeded) {
    referralNeeded = false; // yellow = treat and monitor, refer if no improvement
    referralFacility = 'Oloibiri Primary Health Centre or Ogbia LGA Hospital';
    referralUrgency = 'Refer if no improvement in 2 days';
  }

  // ── UNIVERSAL HOME CARE ────────────────────────────────────────────────────

  if (level !== 'green') {
    homeCare.push('While waiting for referral or improvement: keep patient comfortable, offer small sips of clean water or ORS.');
    if (temp >= 38.0) {
      homeCare.push('Paracetamol for fever: Adults 500mg–1g every 6–8 hours. Children 10–15mg/kg every 6 hours. Do NOT give aspirin to children.');
    }
    warningSigns.push('Any new danger sign: convulsions, loss of consciousness, unable to drink — go to hospital IMMEDIATELY');
  }

  // Always add bednet advice in Bayelsa
  homeCare.push('Sleep under an insecticide-treated bednet every night — this is Bayelsa, malaria is the #1 killer.');

  return {
    level, reasons, actions, homeCare, warningSigns,
    referralNeeded, referralFacility, referralUrgency, medications,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REFERRAL NOTE GENERATOR (deterministic template)
// ═══════════════════════════════════════════════════════════════════════════════

function generateReferralNote(
  patient: PatientInfo,
  vitals: Vitals,
  symptoms: Symptoms,
  triage: TriageResult,
  navigatorName: string,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  const ageStr = patient.ageYears ? `${patient.ageYears} years` : patient.ageMonths ? `${patient.ageMonths} months` : 'age unknown';

  const vitalsStr = [
    vitals.tempC && `Temp: ${vitals.tempC}°C (${vitals.tempMethod})`,
    vitals.respiratoryRate && `RR: ${vitals.respiratoryRate}/min`,
    vitals.pulseRate && `Pulse: ${vitals.pulseRate} bpm`,
    vitals.bpSystolic && vitals.bpDiastolic && `BP: ${vitals.bpSystolic}/${vitals.bpDiastolic} mmHg`,
    vitals.muacCm && `MUAC: ${vitals.muacCm} cm`,
  ].filter(Boolean).join(' | ');

  const symptomsStr = [
    symptoms.chiefComplaint && `Chief complaint: ${symptoms.chiefComplaint}`,
    symptoms.fever.present && `Fever (${symptoms.fever.interview.days || '?'} days)`,
    symptoms.cough.present && `Cough (${symptoms.cough.interview.days || '?'} days)`,
    symptoms.diarrhoea.present && `Diarrhoea (${symptoms.diarrhoea.interview.days || '?'} days)`,
    symptoms.chestIndrawing && 'Chest indrawing',
    symptoms.bloodInStool && 'Blood in stool',
    symptoms.stiffNeck && 'Stiff neck',
    symptoms.rdt !== 'not_done' && `Malaria RDT: ${symptoms.rdt}`,
  ].filter(Boolean).join('; ');

  return `──────────────────────────────
COMMUNITY HEALTH NAVIGATOR
REFERRAL NOTE
──────────────────────────────
Date: ${dateStr}   Time: ${timeStr}

PATIENT: ${patient.name}
Age: ${ageStr}   Sex: ${patient.sex || 'not recorded'}
Village: ${patient.village}
Phone: ${patient.phone || 'none'}

VITALS: ${vitalsStr || 'Not all recorded'}

FINDINGS: ${symptomsStr}

DANGER SIGNS: ${[
    triage.reasons.filter(r => r.startsWith('DANGER')).join('; ') || 'None identified'
  ]}

TRIAGE: ${triage.level.toUpperCase()}
${triage.reasons[0] || ''}

ACTIONS TAKEN: ${triage.medications.length > 0 ? triage.medications.join('; ') : 'None prior to referral'}

REFERRING TO: ${triage.referralFacility}
URGENCY: ${triage.referralUrgency}

Navigator: ${navigatorName}
Contact: vAI Community Health Programme, Oloibiri
──────────────────────────────`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'vai_offline_assessments';

function loadSavedAssessments(): SavedAssessment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAssessmentLocally(assessment: SavedAssessment) {
  const existing = loadSavedAssessments();
  existing.unshift(assessment);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

function markSynced(id: string) {
  const existing = loadSavedAssessments();
  const updated = existing.map(a => a.id === id ? { ...a, synced: true } : a);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

function getPendingSyncCount(): number {
  return loadSavedAssessments().filter(a => !a.synced).length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const PATIENT_GROUPS: Record<PatientGroup, { label: string; emoji: string }> = {
  'child-under-5': { label: 'Child under 5', emoji: '👶🏿' },
  'child-5-14':    { label: 'Child 5–14',    emoji: '👧🏿' },
  'adult':         { label: 'Adult',          emoji: '🧑🏿' },
  'pregnant':      { label: 'Pregnant woman', emoji: '🤰🏿' },
  'elderly':       { label: 'Elderly (60+)',  emoji: '👴🏿' },
};

const VILLAGES = ['Oloibiri', 'Ibiade', 'Otuabagi', 'Nembe', 'Ogbia', 'Yenagoa', 'Ikebiri', 'Other'];

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'patient',      label: 'Patient',      icon: <User size={16}/> },
  { key: 'vitals',       label: 'Vitals',        icon: <Activity size={16}/> },
  { key: 'danger-signs', label: 'Danger Signs',  icon: <AlertTriangle size={16}/> },
  { key: 'symptoms',     label: 'Symptoms',      icon: <Stethoscope size={16}/> },
  { key: 'observations', label: 'Observations',  icon: <ClipboardList size={16}/> },
  { key: 'result',       label: 'Result',        icon: <ShieldCheck size={16}/> },
];

const OfflineClinicalAssessment: React.FC = () => {
  const [step, setStep] = useState<Step>('patient');
  const [patient, setPatient] = useState<PatientInfo>({
    name: '', village: 'Oloibiri', ageYears: '', ageMonths: '', sex: '', group: 'adult', phone: '',
  });
  const [vitals, setVitals] = useState<Vitals>({
    tempC: '', tempMethod: 'axillary', respiratoryRate: '', pulseRate: '',
    bpSystolic: '', bpDiastolic: '', weightKg: '', heightCm: '', muacCm: '',
  });
  const [dangerSigns, setDangerSigns] = useState<DangerSigns>({
    convulsions: false, unconscious: false, unableToFeed: false, vomitsEverything: false,
  });
  const [symptoms, setSymptoms] = useState<Symptoms>({
    chiefComplaint: '',
    fever: { present: false, interview: {} },
    cough: { present: false, interview: {} },
    diarrhoea: { present: false, interview: {} },
    vomiting: { present: false, interview: {} },
    chestIndrawing: false, bloodInStool: false,
    palmarPallor: false, stiffNeck: false, eyeJaundice: false, oedema: false,
    malariaSuspected: false, rdt: 'not_done', recentBednetUse: false,
  });
  const [observations, setObservations] = useState<Observations>({
    appearance: '', breathing: '', skin: '', hydration: '', additionalNotes: '',
  });
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingSync, setPendingSync] = useState(getPendingSyncCount());
  const [showReferralNote, setShowReferralNote] = useState(false);
  const [activeInterview, setActiveInterview] = useState<string | null>(null);
  const [showSavedList, setShowSavedList] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [step]);

  const stepIndex = STEPS.findIndex(s => s.key === step);

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) {
      if (next.key === 'result') {
        const result = computeTriage(patient, vitals, dangerSigns, symptoms, observations);
        setTriage(result);
      }
      setStep(next.key);
    }
  };
  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.key);
  };

  const saveAssessment = () => {
    if (!triage) return;
    const assessment: SavedAssessment = {
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      patient, vitals, dangerSigns, symptoms, observations, triage,
      synced: false,
    };
    saveAssessmentLocally(assessment);
    setSaved(true);
    setPendingSync(getPendingSyncCount());
  };

  const resetForm = () => {
    setStep('patient');
    setPatient({ name: '', village: 'Oloibiri', ageYears: '', ageMonths: '', sex: '', group: 'adult', phone: '' });
    setVitals({ tempC: '', tempMethod: 'axillary', respiratoryRate: '', pulseRate: '', bpSystolic: '', bpDiastolic: '', weightKg: '', heightCm: '', muacCm: '' });
    setDangerSigns({ convulsions: false, unconscious: false, unableToFeed: false, vomitsEverything: false });
    setSymptoms({ chiefComplaint: '', fever: { present: false, interview: {} }, cough: { present: false, interview: {} }, diarrhoea: { present: false, interview: {} }, vomiting: { present: false, interview: {} }, chestIndrawing: false, bloodInStool: false, palmarPallor: false, stiffNeck: false, eyeJaundice: false, oedema: false, malariaSuspected: false, rdt: 'not_done', recentBednetUse: false });
    setObservations({ appearance: '', breathing: '', skin: '', hydration: '', additionalNotes: '' });
    setTriage(null);
    setSaved(false);
    setShowReferralNote(false);
    setActiveInterview(null);
  };

  // ── SHARED UI COMPONENTS ─────────────────────────────────────────────────

  const triageColor = (level: TriageLevel) => ({
    red:    { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-800', badge: 'bg-red-600' },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-800', badge: 'bg-amber-500' },
    green:  { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-800', badge: 'bg-emerald-600' },
  }[level]);

  const SectionCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );

  const Label: React.FC<{ children: React.ReactNode; required?: boolean; hint?: string }> = ({ children, required, hint }) => (
    <label className="block mb-1.5">
      <span className="text-sm font-semibold text-gray-700">{children}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
      {hint && <span className="block text-xs text-gray-400 mt-0.5">{hint}</span>}
    </label>
  );

  const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className={`w-full px-3.5 py-2.5 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 ${props.className || ''}`} />
  );

  const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean; hint?: string }> = ({ label, checked, onChange, danger, hint }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-all active:scale-[0.98] ${
        checked
          ? danger ? 'border-red-400 bg-red-50' : 'border-teal-400 bg-teal-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
        checked ? (danger ? 'bg-red-500' : 'bg-teal-500') : 'bg-gray-200'
      }`}>
        {checked ? '✓' : ''}
      </div>
      <div className="text-left flex-1">
        <span className={`text-sm font-medium ${checked ? (danger ? 'text-red-800' : 'text-teal-800') : 'text-gray-700'}`}>{label}</span>
        {hint && <span className="block text-xs text-gray-400 mt-0.5">{hint}</span>}
      </div>
    </button>
  );

  // ── STRUCTURED INTERVIEW COMPONENT ───────────────────────────────────────

  const StructuredInterview: React.FC<{
    symptomKey: string;
    answers: Record<string, string>;
    onAnswer: (key: string, value: string) => void;
  }> = ({ symptomKey, answers, onAnswer }) => {
    const config = SYMPTOM_INTERVIEWS[symptomKey];
    if (!config) return null;

    const visibleQuestions = config.script.filter(q =>
      !q.showIf || q.showIf(answers)
    );

    // Find first unanswered question
    const firstUnanswered = visibleQuestions.findIndex(q => !answers[q.key]);
    const questionsToShow = firstUnanswered === -1
      ? visibleQuestions // all answered
      : visibleQuestions.slice(0, firstUnanswered + 1);

    return (
      <div className="mt-3 ml-2 pl-3 border-l-2 border-teal-300 space-y-3">
        <p className="text-xs font-bold text-teal-700 uppercase tracking-wide">
          📋 {config.label} — Clinical Interview
        </p>
        {questionsToShow.map((q, idx) => {
          const isAnswered = !!answers[q.key];
          const isCurrent = idx === questionsToShow.length - 1 && !isAnswered;
          return (
            <div key={q.key} className={`rounded-xl p-3 ${isCurrent ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50'}`}>
              <p className={`text-sm font-medium mb-2 ${isCurrent ? 'text-teal-900' : 'text-gray-700'}`}>
                {isCurrent && '👉 '}{q.question}
              </p>
              {q.clinicalNote && (
                <p className="text-xs text-gray-400 italic mb-2 flex items-start gap-1">
                  <span className="mt-0.5">💡</span> {q.clinicalNote}
                </p>
              )}
              {q.type === 'yes-no' && (
                <div className="flex gap-2">
                  {['Yes', 'No'].map(opt => (
                    <button key={opt} type="button" onClick={() => onAnswer(q.key, opt)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 ${
                        answers[q.key] === opt
                          ? 'bg-teal-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-600'
                      }`}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              {q.type === 'choice' && q.choices && (
                <div className="space-y-1.5">
                  {q.choices.map(opt => (
                    <button key={opt} type="button" onClick={() => onAnswer(q.key, opt)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all active:scale-[0.98] ${
                        answers[q.key] === opt
                          ? 'bg-teal-600 text-white font-semibold'
                          : 'bg-white border border-gray-300 text-gray-600'
                      }`}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              {q.type === 'number' && (
                <Input type="number" inputMode="numeric" placeholder="Enter number"
                  value={answers[q.key] || ''} onChange={e => onAnswer(q.key, e.target.value)} />
              )}
              {q.type === 'text' && (
                <Input type="text" placeholder="Type answer…"
                  value={answers[q.key] || ''} onChange={e => onAnswer(q.key, e.target.value)} />
              )}
            </div>
          );
        })}
        {firstUnanswered === -1 && (
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 text-sm font-semibold">
            <CheckCircle size={16}/> Interview complete for {config.label}
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // STEP RENDERS
  // ════════════════════════════════════════════════════════════════════════════

  const renderPatientStep = () => (
    <SectionCard>
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <User size={20} className="text-teal-600"/> Patient Information
      </h2>
      <div className="space-y-4">
        <div>
          <Label required>Patient Name</Label>
          <Input value={patient.name} onChange={e => setPatient({ ...patient, name: e.target.value })}
            placeholder="Full name" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Age (years)</Label>
            <Input type="number" inputMode="numeric" value={patient.ageYears}
              onChange={e => setPatient({ ...patient, ageYears: e.target.value })} placeholder="Years" />
          </div>
          <div>
            <Label>Age (months)</Label>
            <Input type="number" inputMode="numeric" value={patient.ageMonths}
              onChange={e => setPatient({ ...patient, ageMonths: e.target.value })} placeholder="Months" />
          </div>
        </div>
        <div>
          <Label required>Sex</Label>
          <div className="flex gap-2">
            {(['male', 'female'] as const).map(s => (
              <button key={s} type="button" onClick={() => setPatient({ ...patient, sex: s })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  patient.sex === s ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}>
                {s === 'male' ? '♂ Male' : '♀ Female'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label required>Patient Group</Label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(PATIENT_GROUPS) as [PatientGroup, { label: string; emoji: string }][]).map(([key, pg]) => (
              <button key={key} type="button" onClick={() => setPatient({ ...patient, group: key })}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                  patient.group === key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}>
                <span>{pg.emoji}</span> {pg.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label required>Village</Label>
          <div className="flex flex-wrap gap-2">
            {VILLAGES.map(v => (
              <button key={v} type="button" onClick={() => setPatient({ ...patient, village: v })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                  patient.village === v ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label hint="Optional">Phone Number</Label>
          <Input type="tel" inputMode="tel" value={patient.phone}
            onChange={e => setPatient({ ...patient, phone: e.target.value })} placeholder="+234…" />
        </div>
      </div>
    </SectionCard>
  );

  const renderVitalsStep = () => (
    <SectionCard>
      <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Activity size={20} className="text-teal-600"/> Vital Signs
      </h2>
      <p className="text-xs text-gray-400 mb-4">Measure carefully. Record what you can — leave blank if equipment not available.</p>
      <div className="space-y-4">
        <div>
          <Label hint="Normal axillary: 36.0–37.4°C. Fever ≥38°C.">Temperature (°C)</Label>
          <div className="flex gap-2">
            <Input type="number" inputMode="decimal" step="0.1" value={vitals.tempC}
              onChange={e => setVitals({ ...vitals, tempC: e.target.value })} placeholder="e.g. 37.5" className="flex-1" />
            <select value={vitals.tempMethod} onChange={e => setVitals({ ...vitals, tempMethod: e.target.value as any })}
              className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white">
              <option value="axillary">Axillary</option>
              <option value="oral">Oral</option>
              <option value="rectal">Rectal</option>
            </select>
          </div>
        </div>
        <div>
          <Label hint="Count for 60 full seconds watching the chest rise.">Respiratory Rate (/min)</Label>
          <Input type="number" inputMode="numeric" value={vitals.respiratoryRate}
            onChange={e => setVitals({ ...vitals, respiratoryRate: e.target.value })} placeholder="Breaths per minute" />
        </div>
        <div>
          <Label hint="Normal adult: 60–100 bpm. >120 at rest = investigate.">Pulse Rate (bpm)</Label>
          <Input type="number" inputMode="numeric" value={vitals.pulseRate}
            onChange={e => setVitals({ ...vitals, pulseRate: e.target.value })} placeholder="Beats per minute" />
        </div>
        <div>
          <Label hint="≥140/90 = hypertension. ≥180/120 = emergency. In pregnancy: ≥140/90 = URGENT.">Blood Pressure (mmHg)</Label>
          <div className="flex gap-2 items-center">
            <Input type="number" inputMode="numeric" value={vitals.bpSystolic}
              onChange={e => setVitals({ ...vitals, bpSystolic: e.target.value })} placeholder="Systolic" />
            <span className="text-gray-400 font-bold">/</span>
            <Input type="number" inputMode="numeric" value={vitals.bpDiastolic}
              onChange={e => setVitals({ ...vitals, bpDiastolic: e.target.value })} placeholder="Diastolic" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label hint="Essential for drug dosing">Weight (kg)</Label>
            <Input type="number" inputMode="decimal" step="0.1" value={vitals.weightKg}
              onChange={e => setVitals({ ...vitals, weightKg: e.target.value })} placeholder="kg" />
          </div>
          <div>
            <Label>Height (cm)</Label>
            <Input type="number" inputMode="numeric" value={vitals.heightCm}
              onChange={e => setVitals({ ...vitals, heightCm: e.target.value })} placeholder="cm" />
          </div>
        </div>
        <div>
          <Label hint="Children 6–59 mo: <11.5cm = SEVERE. 11.5–12.4 = moderate. Pregnant: <23cm = risk.">MUAC (cm)</Label>
          <Input type="number" inputMode="decimal" step="0.1" value={vitals.muacCm}
            onChange={e => setVitals({ ...vitals, muacCm: e.target.value })} placeholder="Mid-upper arm circumference" />
        </div>
      </div>
    </SectionCard>
  );

  const renderDangerSignsStep = () => {
    const anyDanger = Object.values(dangerSigns).some(Boolean);
    return (
      <SectionCard>
        <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
          <AlertTriangle size={20} className="text-red-600"/> General Danger Signs
        </h2>
        <p className="text-xs text-gray-400 mb-4">Any ONE of these = RED — Urgent Referral. Check each carefully.</p>
        {anyDanger && (
          <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3 mb-4 flex items-start gap-2">
            <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-800">⚠️ DANGER SIGN DETECTED</p>
              <p className="text-xs text-red-700 mt-0.5">This patient will be classified RED. Continue assessment to gather full picture for referral note.</p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Toggle danger label="Convulsions (seizures) — now or recently" hint="Ask: has the patient been shaking or jerking uncontrollably?"
            checked={dangerSigns.convulsions} onChange={v => setDangerSigns({ ...dangerSigns, convulsions: v })} />
          <Toggle danger label="Unconscious or cannot be woken" hint="Try to wake the patient. Can they respond to voice or touch?"
            checked={dangerSigns.unconscious} onChange={v => setDangerSigns({ ...dangerSigns, unconscious: v })} />
          <Toggle danger label="Unable to drink or breastfeed" hint="Offer water or breast. If they cannot swallow or refuse completely = danger."
            checked={dangerSigns.unableToFeed} onChange={v => setDangerSigns({ ...dangerSigns, unableToFeed: v })} />
          <Toggle danger label="Vomits everything" hint="Cannot keep ANY fluid down. Different from occasional vomiting."
            checked={dangerSigns.vomitsEverything} onChange={v => setDangerSigns({ ...dangerSigns, vomitsEverything: v })} />
        </div>
      </SectionCard>
    );
  };

  const renderSymptomsStep = () => (
    <SectionCard>
      <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Stethoscope size={20} className="text-teal-600"/> Symptoms & Signs
      </h2>
      <p className="text-xs text-gray-400 mb-4">Tick symptoms present. For key symptoms, a clinical interview will guide you through the right questions.</p>

      <div className="space-y-4">
        <div>
          <Label required>Chief Complaint</Label>
          <textarea value={symptoms.chiefComplaint}
            onChange={e => setSymptoms({ ...symptoms, chiefComplaint: e.target.value })}
            rows={2} placeholder="In the patient's own words, what is the main problem?"
            className="w-full px-3.5 py-2.5 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
        </div>

        {/* Main symptoms with structured interviews */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Main Symptoms — with clinical interview</p>
          <div className="space-y-2">
            {(['fever', 'cough', 'diarrhoea', 'vomiting'] as const).map(key => {
              const config = SYMPTOM_INTERVIEWS[key];
              const data = symptoms[key] as SymptomData;
              return (
                <div key={key}>
                  <Toggle label={config.label}
                    checked={data.present}
                    onChange={v => {
                      setSymptoms({ ...symptoms, [key]: { ...data, present: v, interview: v ? data.interview : {} } });
                      if (v) setActiveInterview(key);
                      else if (activeInterview === key) setActiveInterview(null);
                    }} />
                  {data.present && (
                    <>
                      <button type="button" onClick={() => setActiveInterview(activeInterview === key ? null : key)}
                        className="mt-1 ml-2 flex items-center gap-1 text-xs text-teal-600 font-semibold">
                        {activeInterview === key ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        {Object.keys(data.interview).length > 0
                          ? `${Object.keys(data.interview).length} questions answered`
                          : 'Start clinical interview'}
                      </button>
                      {activeInterview === key && (
                        <StructuredInterview symptomKey={key} answers={data.interview}
                          onAnswer={(qKey, val) => {
                            setSymptoms({
                              ...symptoms,
                              [key]: { ...data, interview: { ...data.interview, [qKey]: val } },
                            });
                          }} />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Additional signs */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Additional Signs</p>
          <div className="space-y-2">
            <Toggle label="Chest indrawing" hint="Watch lower chest during breathing. Pulls INWARD on inspiration = danger sign."
              checked={symptoms.chestIndrawing} danger={symptoms.chestIndrawing}
              onChange={v => setSymptoms({ ...symptoms, chestIndrawing: v })} />
            <Toggle label="Blood in stool"
              checked={symptoms.bloodInStool}
              onChange={v => setSymptoms({ ...symptoms, bloodInStool: v })} />
            <Toggle label="Palmar pallor (pale palms)"  hint="Compare palms to your own in good light."
              checked={symptoms.palmarPallor}
              onChange={v => setSymptoms({ ...symptoms, palmarPallor: v })} />
            <Toggle label="Stiff neck" hint="Ask patient to touch chin to chest. Pain or inability = danger sign." danger={symptoms.stiffNeck}
              checked={symptoms.stiffNeck}
              onChange={v => setSymptoms({ ...symptoms, stiffNeck: v })} />
            <Toggle label="Yellow eyes (jaundice)" hint="Look at whites of eyes in natural light."
              checked={symptoms.eyeJaundice}
              onChange={v => setSymptoms({ ...symptoms, eyeJaundice: v })} />
            <Toggle label="Oedema (swelling)" hint="Press top of foot for 3 seconds. Pit/dent remaining = oedema."
              checked={symptoms.oedema}
              onChange={v => setSymptoms({ ...symptoms, oedema: v })} />
          </div>
        </div>

        {/* Malaria section */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Malaria Assessment</p>
          <div className="space-y-2">
            <Toggle label="Malaria suspected"
              checked={symptoms.malariaSuspected}
              onChange={v => setSymptoms({ ...symptoms, malariaSuspected: v })} />
            <div>
              <Label>RDT Result</Label>
              <div className="flex gap-2">
                {(['not_done', 'positive', 'negative'] as const).map(r => (
                  <button key={r} type="button" onClick={() => setSymptoms({ ...symptoms, rdt: r })}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                      symptoms.rdt === r
                        ? r === 'positive' ? 'bg-red-500 text-white' : r === 'negative' ? 'bg-emerald-500 text-white' : 'bg-gray-500 text-white'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}>
                    {r === 'not_done' ? 'Not Done' : r === 'positive' ? '⊕ Positive' : '⊖ Negative'}
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="Using insecticide-treated bednet"
              checked={symptoms.recentBednetUse}
              onChange={v => setSymptoms({ ...symptoms, recentBednetUse: v })} />
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderObservationsStep = () => (
    <SectionCard>
      <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <ClipboardList size={20} className="text-teal-600"/> Physical Observations
      </h2>
      <p className="text-xs text-gray-400 mb-4">Describe what you SEE. Use your own words.</p>
      <div className="space-y-4">
        {[
          { key: 'appearance' as const, label: 'General Appearance', placeholder: 'Alert? Lethargic? Distressed? Comfortable? Well-nourished?' },
          { key: 'breathing' as const, label: 'Breathing Pattern', placeholder: 'Normal? Fast? Laboured? Wheezing? Grunting?' },
          { key: 'skin' as const, label: 'Skin & Eyes', placeholder: 'Colour, rashes, wounds, jaundice, pallor, dehydration signs?' },
          { key: 'hydration' as const, label: 'Hydration Signs', placeholder: 'Moist mouth? Dry lips? Sunken fontanelle (infant)? Tears when crying?' },
        ].map(field => (
          <div key={field.key}>
            <Label>{field.label}</Label>
            <textarea value={observations[field.key]}
              onChange={e => setObservations({ ...observations, [field.key]: e.target.value })}
              rows={2} placeholder={field.placeholder}
              className="w-full px-3.5 py-2.5 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
          </div>
        ))}
        <div>
          <Label>Additional Notes</Label>
          <textarea value={observations.additionalNotes}
            onChange={e => setObservations({ ...observations, additionalNotes: e.target.value })}
            rows={3} placeholder="Anything else relevant — medications patient is taking, recent travel, contacts who are sick, etc."
            className="w-full px-3.5 py-2.5 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
        </div>
      </div>
    </SectionCard>
  );

  const renderResultStep = () => {
    if (!triage) return null;
    const tc = triageColor(triage.level);
    const referralNote = triage.referralNeeded
      ? generateReferralNote(patient, vitals, symptoms, triage, 'Solomon Matthias Solomon')
      : '';

    return (
      <div className="space-y-4">
        {/* Triage Classification Banner */}
        <div className={`rounded-2xl border-2 p-5 ${tc.bg} ${tc.border}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-14 h-14 rounded-2xl ${tc.badge} flex items-center justify-center`}>
              {triage.level === 'red' && <AlertTriangle size={28} className="text-white"/>}
              {triage.level === 'yellow' && <AlertCircle size={28} className="text-white"/>}
              {triage.level === 'green' && <CheckCircle size={28} className="text-white"/>}
            </div>
            <div>
              <h2 className={`text-xl font-black uppercase ${tc.text}`}>
                {triage.level === 'red' && '🔴 RED — Urgent Referral'}
                {triage.level === 'yellow' && '🟡 YELLOW — Treat & Monitor'}
                {triage.level === 'green' && '🟢 GREEN — Home Care'}
              </h2>
              <p className="text-sm text-gray-600">{patient.name} — {PATIENT_GROUPS[patient.group].emoji} {PATIENT_GROUPS[patient.group].label}</p>
            </div>
          </div>
          <div className="space-y-1">
            {triage.reasons.map((r, i) => (
              <p key={i} className={`text-sm font-medium ${tc.text}`}>• {r}</p>
            ))}
          </div>
        </div>

        {/* Immediate Actions */}
        {triage.actions.length > 0 && (
          <SectionCard>
            <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500"/> Immediate Actions
            </h3>
            <div className="space-y-2">
              {triage.actions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 bg-red-50 rounded-lg px-3 py-2">
                  <span className="text-red-600 font-bold text-sm mt-0.5">{i + 1}.</span>
                  <p className="text-sm text-red-900">{a}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Medications */}
        {triage.medications.length > 0 && (
          <SectionCard>
            <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
              💊 Medications / Treatment
            </h3>
            <div className="space-y-2">
              {triage.medications.map((m, i) => (
                <p key={i} className="text-sm text-gray-800 bg-blue-50 rounded-lg px-3 py-2">{m}</p>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Home Care */}
        {triage.homeCare.length > 0 && (
          <SectionCard>
            <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
              🏠 Home Care Instructions
            </h3>
            <p className="text-xs text-gray-400 mb-2">Read these to the patient or caregiver:</p>
            <div className="space-y-1.5">
              {triage.homeCare.map((h, i) => (
                <p key={i} className="text-sm text-gray-800 bg-emerald-50 rounded-lg px-3 py-2">✓ {h}</p>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Warning Signs */}
        {triage.warningSigns.length > 0 && (
          <SectionCard>
            <h3 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">
              ⚠️ Warning Signs — Return Immediately If:
            </h3>
            <div className="space-y-1.5">
              {triage.warningSigns.map((w, i) => (
                <p key={i} className="text-sm text-red-800 bg-red-50 rounded-lg px-3 py-2 font-medium">🚨 {w}</p>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Referral Note */}
        {triage.referralNeeded && (
          <SectionCard>
            <button type="button" onClick={() => setShowReferralNote(!showReferralNote)}
              className="w-full flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileText size={16} className="text-blue-600"/> Referral Note
              </h3>
              {showReferralNote ? <ChevronDown size={16} className="text-gray-400"/> : <ChevronRight size={16} className="text-gray-400"/>}
            </button>
            {showReferralNote && (
              <pre className="mt-3 text-xs text-gray-800 bg-gray-50 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {referralNote}
              </pre>
            )}
          </SectionCard>
        )}

        {/* Save / Actions */}
        <SectionCard>
          <div className="space-y-3">
            {!saved ? (
              <button type="button" onClick={saveAssessment}
                className="w-full py-3 rounded-xl text-white font-bold text-base bg-gradient-to-r from-teal-600 to-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <Save size={18}/> Save Assessment (Offline)
              </button>
            ) : (
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle size={18} className="text-emerald-600"/>
                <div>
                  <p className="text-sm font-bold text-emerald-800">Saved to device</p>
                  <p className="text-xs text-emerald-600">Will sync to cloud when online. {pendingSync} assessment{pendingSync !== 1 ? 's' : ''} pending sync.</p>
                </div>
              </div>
            )}
            <button type="button" onClick={resetForm}
              className="w-full py-3 rounded-xl font-bold text-sm border-2 border-gray-300 text-gray-600 active:scale-[0.98] transition-all">
              Start New Assessment
            </button>
          </div>
        </SectionCard>

        {/* Clinical disclaimer */}
        <p className="text-xs text-gray-400 text-center px-4 pb-4">
          ⚠️ CLINICAL DECISION SUPPORT ONLY — Rule-based WHO IMCI classification.
          Follow your training and supervision protocols. This does not replace a doctor's assessment.
          Built for vAI Community Health Programme, Oloibiri. Clinical review: Dr. O'Connell.
        </p>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-50">
      <div ref={topRef} />

      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-lg mx-auto px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
                <Heart size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900 leading-tight">Offline Clinical Assessment</h1>
                <p className="text-[10px] text-gray-400">Rule-Based IMCI Triage • No Internet Required</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pendingSync > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg font-medium">
                  <Upload size={12}/> {pendingSync}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                <WifiOff size={12}/> Offline
              </span>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                <button type="button"
                  onClick={() => {
                    if (i < stepIndex) setStep(s.key);
                    else if (i === stepIndex + 1) goNext();
                  }}
                  disabled={i > stepIndex + 1}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    i === stepIndex ? 'bg-teal-100 text-teal-700' :
                    i < stepIndex ? 'bg-emerald-100 text-emerald-600' :
                    'bg-gray-100 text-gray-400'
                  }`}
                >
                  {i < stepIndex && <CheckCircle size={10}/>}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 rounded ${i < stepIndex ? 'bg-emerald-300' : 'bg-gray-200'}`}/>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-3 py-4">
        {/* Online mode link */}
        <Link to="/community-impact/healthcare"
          className="flex items-center justify-between gap-3 bg-white rounded-xl px-4 py-3 mb-3 border border-gray-200 shadow-sm hover:bg-teal-50 transition-colors group">
          <div className="flex items-center gap-2.5">
            <Wifi size={16} className="text-teal-500" />
            <div>
              <p className="text-sm font-semibold text-gray-700">Have signal? Use AI-Powered Mode</p>
              <p className="text-xs text-gray-400">Full AI clinical assistant with smart triage</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-400 group-hover:text-teal-500 transition-colors" />
        </Link>

        {step === 'patient' && renderPatientStep()}
        {step === 'vitals' && renderVitalsStep()}
        {step === 'danger-signs' && renderDangerSignsStep()}
        {step === 'symptoms' && renderSymptomsStep()}
        {step === 'observations' && renderObservationsStep()}
        {step === 'result' && renderResultStep()}
      </div>

      {/* Navigation Footer */}
      {step !== 'result' && (
        <div className="sticky bottom-0 z-20 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="max-w-lg mx-auto px-3 py-3 flex gap-3">
            {stepIndex > 0 && (
              <button type="button" onClick={goBack}
                className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-gray-300 text-gray-600 active:scale-[0.98] transition-all flex items-center justify-center gap-1">
                <ArrowLeft size={16}/> Back
              </button>
            )}
            <button type="button" onClick={goNext}
              disabled={step === 'patient' && !patient.name.trim()}
              className={`flex-1 py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1 ${
                step === 'patient' && !patient.name.trim()
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-600 to-blue-600 text-white'
              }`}>
              {stepIndex === STEPS.length - 2 ? 'Run Triage' : 'Next'} <ArrowRight size={16}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineClinicalAssessment;
