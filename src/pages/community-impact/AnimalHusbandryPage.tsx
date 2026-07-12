// src/pages/community-impact/AnimalHusbandryPage.tsx
//
// Animal Husbandry Advisory — Community Impact Track
// A professional casebook tool for youth animal-health advisors
// serving rural Nigerian farmers in Oloibiri (Bayelsa) and
// Ibiade (Ogun) communities.
//
// UPGRADED TO MATCH HealthcareNavigatorPage / FishingConsultantPage PATTERN:
// ─ Structured intake form per species (replaces open-ended chat starter)
// ─ Probe Panel modal: AI coaches the youth to ask the right questions one
//   at a time, field by field, before AI generates a full diagnosis
// ─ Follow-up chat mode: post-save AI conversation anchored to the case
// ─ Animal background with distortion effect (matching other pages)
//
// DB tables: animal_husbandry_farmers
//            animal_husbandry_consultations
//
// Route: /community-impact/animal-husbandry
// Activity: animal_husbandry_advisor

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { chatText } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { ResolutionModal, ResolutionSubmitData } from '../../components/community-impact/ResolutionModal';
import {
  ArrowLeft, Send, Loader2, Plus, User, FileText,
  AlertTriangle, CheckCircle, Clock, ChevronRight, X,
  Stethoscope, ClipboardList, Users, Calendar,
  Mic, MicOff, Volume2, VolumeX, Lightbulb, ShieldCheck, RefreshCw, Award,
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
  | 'add-farmer'
  | 'farmer-detail'
  | 'new-consultation'
  | 'followup-chat'
  | 'case-detail';

interface AnimalEntry {
  species: Species;
  count: number;
}

interface Farmer {
  id: string;
  youth_user_id: string;
  farmer_name: string;
  village: string;
  phone: string | null;
  animals: AnimalEntry[];
  notes: string | null;
  created_at: string;
  total_consultations?: number;
  open_cases?: number;
  emergency_count?: number;
  last_consultation_at?: string | null;
}

interface Consultation {
  id: string;
  farmer_id: string;
  youth_user_id: string;
  species: Species;
  symptom_summary: string;
  animals_affected: number | null;
  animals_total: number | null;
  ai_diagnosis: string | null;
  urgency_level: UrgencyLevel | null;
  farmer_actions_recommended: string | null;
  youth_actions_taken: string | null;
  conversation_history: ChatMessage[];
  follow_up_needed: boolean;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolution_outcome: 'applied' | 'partially_applied' | 'not_applied' | null;
  resolution_narrative: string | null;
  resolution_value_amount: number | null;
  resolution_value_unit: string | null;
  resolution_value_label: string | null;
  created_at: string;
}

type Species = 'poultry' | 'goats_sheep' | 'cattle' | 'pigs';
type UrgencyLevel = 'low' | 'medium' | 'high' | 'emergency';

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

// ─── Structured intake fields per species ─────────────────────────────────────
// Mirrors the HealthcareNavigator's AssessmentData / FishingConsultant's
// INTAKE_FIELDS pattern. Each field has a probe tooltip and a probe-able key.

interface IntakeField {
  key: string;
  label: string;
  placeholder: string;
  tooltip: string;
  required?: boolean;
  danger?: boolean; // flags this as an emergency indicator if answered "yes"
}

const SPECIES_INTAKE: Record<Species, IntakeField[]> = {
  poultry: [
    { key: 'scale', label: 'How many sick vs. total flock', placeholder: 'e.g. 12 sick out of 80 birds; 3 dead since yesterday', tooltip: 'Scale determines urgency immediately. If more than 20% of birds are affected or deaths are rapid, this is HIGH or EMERGENCY.', required: true },
    { key: 'main_symptoms', label: 'Main symptoms observed', placeholder: 'e.g. drooping wings, watery/bloody droppings, gasping, twisted neck, swollen face', tooltip: 'Twisted neck = Newcastle (emergency). Bloody droppings = Coccidiosis or Gumboro. Swollen face = Fowl pox or respiratory infection. Gasping = respiratory disease.', required: true },
    { key: 'onset', label: 'When it started and how fast it spread', placeholder: 'e.g. 2 days ago, 5 birds in one morning then 12 by evening', tooltip: 'Sudden rapid spread (many birds in 1–2 days) = Newcastle or HPAI. Gradual = Coccidiosis, worms, or nutrition. Speed of spread is a critical triage signal.', required: true },
    { key: 'droppings', label: 'Droppings colour and consistency', placeholder: 'e.g. normal green-white, yellowish watery, bloody/reddish, whitish paste', tooltip: 'Bloody droppings = Coccidiosis (high urgency in young birds) or severe infection. Yellowish watery = Gumboro. White paste on feathers around vent = Fowl typhoid.' },
    { key: 'vaccination', label: 'Vaccination history', placeholder: 'e.g. Newcastle vaccinated 6 weeks ago, no Gumboro vaccine, or no vaccinations at all', tooltip: 'Unvaccinated flocks are at extreme risk of Newcastle and Gumboro. A vaccinated bird getting sick suggests a different disease or vaccine failure — both need urgent investigation.' },
    { key: 'feed_water', label: 'Feed and water quality recently', placeholder: 'e.g. changed feed supplier last week, water from open creek, litter very wet', tooltip: 'Wet litter = Coccidiosis risk. Changed feed = mycotoxin or nutrition problem. Dirty water = bacterial infections. Housing and hygiene often drive 80% of disease outbreaks.' },
    { key: 'new_birds', label: 'Any new birds introduced recently', placeholder: 'e.g. bought 20 birds from Yenagoa market 10 days ago, no quarantine', tooltip: 'New birds without quarantine are the #1 cause of disease introduction. Even vaccinated birds can carry and transmit disease to naive birds.', danger: true },
  ],
  goats_sheep: [
    { key: 'scale', label: 'How many sick vs. total herd', placeholder: 'e.g. 5 goats sick out of 18; 1 kid died overnight', tooltip: 'PPR (Peste des Petits Ruminants) spreads fast — 5+ animals in 1–2 days is an emergency. Internal parasites tend to be gradual. Deaths in kids/lambs escalate urgency.', required: true },
    { key: 'main_symptoms', label: 'Main symptoms observed', placeholder: 'e.g. high fever, eye/nose discharge, bloody diarrhoea, mouth sores, difficulty breathing, rough coat', tooltip: 'High fever + discharge + bloody diarrhoea + mouth sores = PPR (EMERGENCY, reportable). Pot-belly + poor coat + weight loss = worms. Sudden collapse = acute poisoning or enterotoxaemia.', required: true },
    { key: 'onset', label: 'When it started and spread pattern', placeholder: 'e.g. 3 days ago, started with 2 animals, now 5 more', tooltip: 'PPR can move through a herd in 3–5 days with high mortality. Gradual slow spread over weeks = internal parasites or chronic nutrition. Pattern tells us if this is infectious or systemic.', required: true },
    { key: 'deworming', label: 'Deworming history', placeholder: 'e.g. dewormed 3 months ago with Albendazole, never dewormed, or dewormed recently with no improvement', tooltip: 'In Nigeria, internal parasites (Haemonchus contortus especially) are the single most common cause of poor performance and deaths in small ruminants. Deworming frequency is critical.' },
    { key: 'body_condition', label: 'Body condition and FAMACHA score if known', placeholder: 'e.g. very thin, bony spine, very pale pink gums (anaemia), or good body condition', tooltip: 'Pale/white gums = severe anaemia from Haemonchus (barber pole worm). This is a life-threatening worm burden that needs immediate deworming. FAMACHA scores 4–5 = deworm NOW.' },
    { key: 'mouth_feet', label: 'Any sores in mouth or on feet', placeholder: 'e.g. sores on gums and tongue, limping, sores between toes', tooltip: 'Mouth + feet sores = FMD (Foot-and-Mouth Disease) if cattle are also affected — reportable disease. Foot rot = bacterial, common in wet conditions, treatable.' },
    { key: 'new_animals', label: 'Any new animals added recently', placeholder: 'e.g. bought 3 goats at Oloibiri market last week, no quarantine period', tooltip: 'PPR spreads through contact with infected animals. New animals from markets without quarantine are the most common source of herd-level outbreaks.', danger: true },
  ],
  cattle: [
    { key: 'scale', label: 'How many affected vs. total herd', placeholder: 'e.g. 2 cows sick out of 6, or 1 bull showing severe signs', tooltip: 'Even one cow with severe respiratory signs, blisters on feet and mouth, or sudden collapse is an emergency event — cattle diseases with these signs are often reportable.', required: true },
    { key: 'main_symptoms', label: 'Main symptoms observed', placeholder: 'e.g. heavy breathing/coughing, blisters on tongue and feet, extreme weight loss, swollen limbs, milk drop', tooltip: 'Coughing + fever + difficulty breathing = CBPP (emergency/reportable). Blisters on mouth + feet = FMD (emergency/reportable). Chronic weight loss + anaemia = Trypanosomiasis (tsetse). Mastitis = swollen painful udder.', required: true },
    { key: 'onset', label: 'How long sick and any deaths', placeholder: 'e.g. sick for 5 days, one cow died last night, another now showing same signs', tooltip: 'CBPP: starts slow but spreads and kills. FMD: sudden onset of blisters, spreads very fast. Any cattle death with respiratory signs or mouth/feet blisters = report to authorities immediately.' },
    { key: 'grazing_area', label: 'Where they graze and water sources', placeholder: 'e.g. near riverbank in tsetse-heavy bush, or dry open farmland', tooltip: 'Tsetse fly habitat (riverine forest) = Trypanosomiasis risk. Shared water points with other herds = CBPP, FMD spread risk. Overgrazing = nutritional stress compounding disease.' },
    { key: 'ticks', label: 'Tick burden and tick-control', placeholder: 'e.g. heavy ticks visible especially on ears and udder, or dipped regularly', tooltip: 'Heavy ticks = Tick-borne diseases (Babesiosis, Anaplasmosis — can cause sudden death). Also East Coast Fever in some areas. Regular dipping or acaricide application prevents significant losses.' },
    { key: 'nutrition', label: 'Dry-season feeding and body condition', placeholder: 'e.g. only grazing dry pasture, no supplement, thin animals; or given crop residue + mineral block', tooltip: 'Cattle in the dry season frequently suffer severe nutritional deficiency — this weakens immunity and makes every disease worse. Mineral deficiency causes poor reproduction and growth failure.' },
  ],
  pigs: [
    { key: 'scale', label: 'How many affected vs. total pen', placeholder: 'e.g. 6 pigs sick out of 20, 3 already dead in 2 days', tooltip: 'Multiple rapid deaths in pigs = ASF (African Swine Fever) until proven otherwise. ASF is 100% fatal with no cure — it requires immediate total isolation and reporting. Do not delay.', required: true, danger: true },
    { key: 'main_symptoms', label: 'Main symptoms observed', placeholder: 'e.g. high fever, not eating, reddish/bluish skin patches, bloody diarrhoea, sudden death, or respiratory signs', tooltip: 'Reddish/purple skin patches + fever + bloody diarrhoea + sudden deaths = ASF (EMERGENCY, no cure, must report). Respiratory signs alone = bacterial pneumonia (treatable). Scouring piglets = scours (common, manageable).', required: true },
    { key: 'onset', label: 'When it started and death rate', placeholder: 'e.g. started 3 days ago, 30% dead already, rest declining fast', tooltip: 'ASF kills 90–100% of affected pigs within days. A rapid death rate of 20%+ is an emergency that requires stopping all movement and reporting to the nearest veterinary authority.' },
    { key: 'feed', label: 'Feed sources and recent changes', placeholder: 'e.g. given food waste/slaughter house scraps, changed commercial feed brand', tooltip: 'Feeding kitchen or abattoir waste is the #1 cause of ASF introduction. This practice must stop. Mycotoxin contamination from mouldy feed also causes illness and reproductive failure.' },
    { key: 'movement', label: 'Any pigs moved in or out recently', placeholder: 'e.g. bought 2 weaners from a farm in Yenagoa 2 weeks ago, sold 3 pigs to a trader last week', tooltip: 'ASF spreads through movement of infected pigs and contaminated equipment. If pigs were recently brought in from another farm, that is the most likely source. Movement of live pigs must stop immediately if ASF is suspected.', danger: true },
    { key: 'skin_lesions', label: 'Skin colour and visible lesions', placeholder: 'e.g. normal pink skin, or reddish/dark patches on ears, belly, and legs', tooltip: 'Blue-purple discolouration of extremities (ears, snout, legs) = strong sign of ASF haemorrhage. Raised red patches = Swine Erysipelas (treatable with antibiotics — much better outcome than ASF).' },
  ],
};

// ─── Nigeria Livestock Knowledge Base ────────────────────────────────────────

const NIGERIA_LIVESTOCK_CONTEXT = `
NIGERIA RURAL LIVESTOCK ADVISORY CONTEXT:

COMMUNITIES SERVED:
- Oloibiri, Ogbia LGA, Bayelsa State (Niger Delta)
- Ibiade, Ogun State
- Smallholder farmers; most households depend directly on animal income
- Veterinary services are costly and often far away

COMMON ANIMALS AND WHY THEY MATTER:
- Poultry: fastest turnover, eggs + meat, low entry cost but very disease-sensitive
- Goats/Sheep: hardy, low feed cost, high market demand, savings asset
- Cattle: wealth + status + traction; more capital-intensive
- Pigs: fast growth, good feed conversion; regional variation

NIGERIA-PRIORITY DISEASES:
POULTRY: Newcastle disease (most feared, rapid mortality), Gumboro/IBD (young birds),
  Coccidiosis (bloody droppings, wet litter), Fowl pox, Avian influenza (EMERGENCY/report)
GOATS & SHEEP: PPR - Peste des Petits Ruminants (EMERGENCY, highly contagious), 
  Internal parasites/Haemonchus (most common chronic problem), Coccidiosis in kids,
  Pneumonia, Mange, Foot rot
CATTLE: CBPP - Contagious Bovine Pleuropneumonia (respiratory EMERGENCY),
  Foot-and-mouth disease (blisters; REPORT), Trypanosomiasis (tsetse areas; chronic),
  Tick-borne diseases, Mastitis, Dry-season nutrition deficit
PIGS: African Swine Fever (catastrophic; no cure; EMERGENCY/report),
  Respiratory disease, Piglet scours, Mange, Mycotoxin poisoning

TRIAGE URGENCY LEVELS:
LOW: One animal, mild signs, still eating/drinking → monitor, isolate, improve care
MEDIUM: Several sick, no deaths, moderate signs → isolate, check vaccines/deworm, contact animal-health worker
HIGH: Deaths, rapid spread, bloody diarrhoea, severe weakness → urgent veterinary contact
EMERGENCY: Sudden multiple deaths, suspected ASF/HPAI/FMD/PPR/CBPP → STOP all movement, isolate, REPORT

ABSOLUTE GUARDRAILS (always enforce):
- Do NOT sell or move sick animals
- Isolate sick animals immediately
- Do NOT mix newly purchased animals without quarantine
- Do NOT give random antibiotics or human medicines
- Do NOT open carcasses after sudden unexplained deaths
- Vaccination prevents disease; vaccines do not cure already sick animals
- Fix water, feed, housing, hygiene BEFORE assuming every problem needs medicine
- Call a trained animal-health worker when disease spreads, deaths occur, or signs are severe
`;

// ─── Build probe prompt (field interview coach) ───────────────────────────────

function buildProbePrompt(field: IntakeField, species: Species, farmer: Farmer, currentIntake: Record<string, string>): string {
  const sc = SPECIES_CONFIG[species];
  const animalCount = farmer.animals.find(a => a.species === species)?.count ?? 'unknown';
  const filledSoFar = Object.entries(currentIntake)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || 'nothing yet';

  return `You are coaching a youth animal-health advisor in rural Nigeria. They are sitting with a farmer RIGHT NOW and need you to guide an in-depth interview about one specific topic.

FARMER: ${farmer.farmer_name}, ${farmer.village}
SPECIES: ${sc.emoji} ${sc.label} (${animalCount} animals)
TOPIC BEING EXPLORED: "${field.label}"
WHY IT MATTERS: ${field.tooltip}

INTAKE INFORMATION GATHERED SO FAR:
${filledSoFar}

${NIGERIA_LIVESTOCK_CONTEXT}

YOUR ROLE:
- Ask ONE focused question at a time that the advisor can read directly to the farmer
- Keep language very simple — the farmer may not be literate; the advisor may translate to Ijaw or Yoruba
- Build a complete clinical picture of this specific topic before moving on
- When you have enough detail, end with the EXACT phrase: "✅ This topic is well characterised. You can move on."
- Never ask more than 5 questions on this one topic
- Draw on Nigerian livestock disease context specific to ${sc.label}

FORMAT: One short question. After the advisor gives the farmer's answer, probe deeper or confirm. Be direct, brief — coaching in real time.

Start now with your FIRST question about: "${field.label}"`;
}

// ─── Build AI diagnosis prompt ────────────────────────────────────────────────

function buildDiagnosisPrompt(species: Species, farmer: Farmer, intake: Record<string, string>): string {
  const sc = SPECIES_CONFIG[species];
  const animalCount = farmer.animals.find(a => a.species === species)?.count ?? 'unknown';
  const intakeSummary = SPECIES_INTAKE[species]
    .map(f => `${f.label}: ${intake[f.key]?.trim() || 'not provided'}`)
    .join('\n');

  const emergencyNote = species === 'pigs'
    ? '\n🚨 If ASF signs present (rapid deaths, skin patches, bloody diarrhoea): lead with EMERGENCY. State to STOP all animal movement and report to nearest vet authority IMMEDIATELY.'
    : species === 'poultry'
    ? '\n🚨 If twisted neck, or sudden mass deaths in unvaccinated flock: lead with EMERGENCY (Newcastle or HPAI).'
    : species === 'goats_sheep'
    ? '\n🚨 If high fever + discharge + mouth sores spreading fast: lead with EMERGENCY (PPR).'
    : '\n🚨 If mouth or feet blisters, or severe respiratory signs spreading: lead with EMERGENCY (FMD or CBPP — reportable).';

  return `You are an expert animal health advisor supporting a youth advisor in rural Nigeria. They have completed a structured intake interview with a farmer and need your full diagnostic assessment.

${NIGERIA_LIVESTOCK_CONTEXT}

FARMER: ${farmer.farmer_name}, ${farmer.village}
SPECIES: ${sc.emoji} ${sc.label}
TOTAL ANIMALS: ${animalCount}

STRUCTURED INTAKE COMPLETED:
${intakeSummary}

YOUR TASK: Provide a complete, actionable diagnostic response.

STRUCTURE YOUR RESPONSE:
1. **URGENCY LEVEL**: State LOW / MEDIUM / HIGH / EMERGENCY — and the single most important reason
2. **PROBABLE DIAGNOSIS**: Most likely condition(s) with distinguishing evidence from this intake
3. **IMMEDIATE ACTIONS** (today, step by step):
   - What the FARMER can do right now (include at least one zero-cost action)
   - What the YOUTH ADVISOR should do or arrange
4. **WHAT TO WATCH FOR**: Signs that would escalate urgency in next 24–48 hours
5. **DO NOT DO**: Critical mistakes to avoid (especially around selling, movement, medication)
6. **REFERRAL**: When and who to call — veterinary authority, animal-health worker, or reportable disease hotline
7. **PREVENTION** (brief): One action that would prevent this recurring

FORMAT:
- Short paragraphs and bullet points
- Label urgency explicitly e.g. "**Urgency: HIGH**"
- Plain language the farmer can understand when the advisor reads aloud
- Specific and practical — no generic advice
${emergencyNote}

⚠️ DISCLAIMER: This is advisory support only. Never prescribe specific drug doses. For emergencies, reportable diseases, or severe cases, insist on a trained animal-health worker or vet.`;
}

// ─── Build follow-up chat prompt ──────────────────────────────────────────────

function buildFollowupPrompt(farmer: Farmer, consultation: Consultation): string {
  const sc = SPECIES_CONFIG[consultation.species];
  const uc = consultation.urgency_level ? URGENCY_CONFIG[consultation.urgency_level] : null;
  return `You are an expert animal health advisor supporting a youth advisor in rural Nigeria. A structured consultation has been completed and the advisor has follow-up questions.

${NIGERIA_LIVESTOCK_CONTEXT}

FARMER: ${farmer.farmer_name}, ${farmer.village}
SPECIES: ${sc.emoji} ${sc.label}
URGENCY: ${uc ? uc.label : 'not assessed'}
SYMPTOMS REPORTED: ${consultation.symptom_summary}
AI DIAGNOSIS GIVEN: ${consultation.ai_diagnosis ?? 'see case record'}

The advisor may ask follow-up questions about the diagnosis, how to explain it to the farmer, what to observe at the follow-up visit, medication logistics, or any related animal-health question for this case.

Respond with practical, specific, actionable advice. Never prescribe specific drug doses — recommend a trained animal-health worker for medication decisions. For any EMERGENCY situation, keep reinforcing the urgency.`;
}

// ─── Species config ───────────────────────────────────────────────────────────

const SPECIES_CONFIG: Record<Species, {
  label: string; emoji: string; colour: string;
  bgLight: string; border: string; textColour: string;
}> = {
  poultry:     { label: 'Poultry',     emoji: '🐔', colour: 'from-amber-500 to-orange-500',  bgLight: 'bg-amber-50',  border: 'border-amber-300',  textColour: 'text-amber-700'  },
  goats_sheep: { label: 'Goats/Sheep', emoji: '🐐', colour: 'from-green-600 to-teal-600',   bgLight: 'bg-green-50',  border: 'border-green-300',  textColour: 'text-green-700'  },
  cattle:      { label: 'Cattle',      emoji: '🐄', colour: 'from-orange-600 to-amber-700', bgLight: 'bg-orange-50', border: 'border-orange-300', textColour: 'text-orange-700' },
  pigs:        { label: 'Pigs',        emoji: '🐖', colour: 'from-pink-500 to-rose-500',    bgLight: 'bg-pink-50',   border: 'border-pink-300',   textColour: 'text-pink-700'   },
};

const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string; colour: string; bg: string; border: string; textDark: string; icon: React.ReactNode; description: string;
}> = {
  low:       { label: 'Low',       colour: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-300',  textDark: 'text-green-800',  icon: <CheckCircle size={14}/>,  description: 'Monitor and improve care — no immediate danger.' },
  medium:    { label: 'Medium',    colour: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-300', textDark: 'text-yellow-800', icon: <Clock size={14}/>,        description: 'Act this week — isolate, check vaccines, contact animal-health worker.' },
  high:      { label: 'High',      colour: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-300', textDark: 'text-orange-800', icon: <AlertTriangle size={14}/>, description: 'Act today — deaths or rapid spread requires urgent vet contact.' },
  emergency: { label: 'EMERGENCY', colour: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-400',    textDark: 'text-red-800',    icon: <AlertTriangle size={14}/>, description: 'STOP all animal movement. Isolate. Report to veterinary authority now.' },
};

const VILLAGES = ['Oloibiri', 'Ibiade', 'Nembe', 'Brass', 'Yenagoa', 'Other'];
const SPECIES_OPTIONS: { value: Species; label: string; emoji: string }[] = [
  { value: 'poultry',     label: 'Poultry (chickens, ducks, guinea fowl)', emoji: '🐔' },
  { value: 'goats_sheep', label: 'Goats / Sheep',                          emoji: '🐐' },
  { value: 'cattle',      label: 'Cattle',                                 emoji: '🐄' },
  { value: 'pigs',        label: 'Pigs',                                   emoji: '🐖' },
];

// ─── Animal background ────────────────────────────────────────────────────────

const AnimalBackground: React.FC = () => {
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
  const img = "url('/background_animal_husbandry.webp')";
  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="animal-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.007" numOctaves="3" seed="31" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="55" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/70 via-teal-900/60 to-emerald-900/65" />
        <div className="absolute inset-0 bg-black/10" />
      </div>
      {moving && (
        <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 pointer-events-none" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1, filter: 'url(#animal-distortion)', WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`, maskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)` }}>
          <div className="absolute inset-0 bg-gradient-to-br from-green-900/70 via-teal-900/60 to-emerald-900/65" />
        </div>
      )}
    </>
  );
};

// ─── Markdown renderer ────────────────────────────────────────────────────────

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

// ─── Info Tooltip ─────────────────────────────────────────────────────────────

const InfoTooltip: React.FC<{ id: string; text: string; open: boolean; onToggle: () => void }> = ({ id, text, open, onToggle }) => (
  <div className="relative inline-block">
    <button onClick={onToggle} className="ml-1.5 text-green-500 hover:text-green-700 focus:outline-none" aria-label="More info">
      <Lightbulb size={13}/>
    </button>
    {open && (
      <div className="absolute z-50 left-0 top-6 w-64 bg-green-900 text-green-50 text-xs rounded-xl px-3 py-2.5 shadow-xl leading-relaxed">
        {text}
        <button onClick={onToggle} className="absolute top-1.5 right-2 text-green-300 hover:text-white"><X size={11}/></button>
      </div>
    )}
  </div>
);

// ─── Urgency badge ────────────────────────────────────────────────────────────

const UrgencyBadge: React.FC<{ level: UrgencyLevel }> = ({ level }) => {
  const cfg = URGENCY_CONFIG[level];
  return (
    <span className={classNames('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border', cfg.colour, cfg.bg, cfg.border)}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ─── Probe Panel ──────────────────────────────────────────────────────────────

interface ProbePanelProps {
  field: IntakeField;
  species: Species;
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
  field, species, messages, loading, done, input, onInputChange, onSend, onClose, chatEndRef
}) => {
  const sc = SPECIES_CONFIG[species];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-2 pb-2">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b bg-green-50 rounded-t-2xl">
          <div>
            <p className="text-xs font-bold text-green-500 uppercase tracking-wide">Clinical Interview Coach</p>
            <p className="text-sm font-bold text-green-900">Exploring: {field.label}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-green-400 hover:text-green-700 hover:bg-green-100">
            <X size={18}/>
          </button>
        </div>

        <div className="px-4 py-2 bg-green-900 text-green-100 text-xs flex items-start gap-2">
          <span className="text-base">💬</span>
          <span>Read each question aloud to the farmer. Type or speak their answer, then tap Send. The AI will keep asking until this topic is fully characterised.</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${sc.colour} flex items-center justify-center text-xs flex-shrink-0`}>{sc.emoji}</div>
              )}
              <div className={classNames('max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed',
                msg.role === 'user' ? 'bg-green-600 text-white rounded-tr-sm' : 'bg-green-50 text-green-900 rounded-tl-sm border border-green-100')}>
                {msg.role === 'assistant' && <p className="text-xs font-bold text-green-400 mb-1">AI Interview Coach</p>}
                {msg.role === 'user' && <p className="text-xs font-bold text-green-200 mb-1">Farmer's answer</p>}
                <MarkdownText text={msg.content}/>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-start gap-2">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${sc.colour} flex items-center justify-center text-xs`}>{sc.emoji}</div>
              <div className="bg-green-50 rounded-2xl rounded-tl-sm px-3 py-2.5">
                <div className="flex gap-1 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
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
              placeholder="Type farmer's answer…"
              disabled={loading}
              className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
            />
            <button onClick={onSend} disabled={!input.trim() || loading}
              className="px-3 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
              <Send size={15}/>
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 whitespace-nowrap">
              Move On ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const AnimalHusbandryPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  // ── Navigation
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [consultationSpecies, setConsultationSpecies] = useState<Species | null>(null);

  // ── Data
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingFarmers, setLoadingFarmers] = useState(true);
  const [loadingConsults, setLoadingConsults] = useState(false);

  // ── Add-farmer form
  const [newFarmerName, setNewFarmerName] = useState('');
  const [newFarmerVillage, setNewFarmerVillage] = useState('');
  const [newFarmerPhone, setNewFarmerPhone] = useState('');
  const [newFarmerAnimals, setNewFarmerAnimals] = useState<AnimalEntry[]>([]);
  const [newFarmerNotes, setNewFarmerNotes] = useState('');
  const [savingFarmer, setSavingFarmer] = useState(false);

  // ── Structured intake (new pattern)
  const [intake, setIntake] = useState<Record<string, string>>({});
  const [isGeneratingDiagnosis, setIsGeneratingDiagnosis] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<{ urgency: UrgencyLevel; text: string } | null>(null);
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

  // ── Tooltip visibility
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  // ── Follow-up chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [speechOn, setSpeechOn] = useState(false);
  const [isListening, setIsListening] = useState(false);

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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isSending]);
  useEffect(() => { probeChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [probeMessages, probeLoading]);

  const speak = useCallback((text: string) => {
    if (!speechOn || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 300));
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
  }, [speechOn]);

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
        // Get learner's org to filter to the right challenge
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
          .eq('community_impact_slug', 'animal-husbandry')
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
          community_member_role: 'animal-keeper',
        })
        .eq('id', activeChallenge.enrollmentId);

      const { data, error } = await supabase.functions.invoke('evaluate-challenge-submission', {
        body: { enrollment_id: activeChallenge.enrollmentId },
      });

      if (error) throw error;
      if (data?.impact_evaluation) setChallengeResult(data.impact_evaluation);
    } catch (err) {
      console.error('[AnimalHusbandryPage] challenge submit error:', err);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  // ─── Load farmers ─────────────────────────────────────────────────────────
  const loadFarmers = useCallback(async () => {
    if (!user) return;
    setLoadingFarmers(true);
    try {
      const { data, error } = await supabase
        .from('animal_husbandry_farmer_summary')
        .select('*')
        .eq('youth_user_id', user.id)
        .order('farmer_name');
      if (!error && data) setFarmers(data as Farmer[]);
    } finally { setLoadingFarmers(false); }
  }, [user]);

  useEffect(() => { loadFarmers(); }, [loadFarmers]);

  const loadConsultations = useCallback(async (farmerId: string) => {
    setLoadingConsults(true);
    try {
      const { data, error } = await supabase
        .from('animal_husbandry_consultations')
        .select('*')
        .eq('farmer_id', farmerId)
        .order('created_at', { ascending: false });
      if (!error && data) setConsultations(data as Consultation[]);
    } finally { setLoadingConsults(false); }
  }, []);

  // ─── Open Probe Panel ─────────────────────────────────────────────────────
  const openProbe = useCallback(async (field: IntakeField) => {
    if (!selectedFarmer || !consultationSpecies) return;
    setProbeField(field);
    setProbeMessages([]);
    setProbeInput('');
    setProbeDone(false);
    setProbeLoading(true);
    try {
      const systemPrompt = buildProbePrompt(field, consultationSpecies, selectedFarmer, intake);
      const reply = await chatText({
        page: 'AnimalHusbandryPage',
        messages: [{ role: 'user', content: `Start probing: ${field.label}` }],
        system: systemPrompt,
        max_tokens: 600,
      });
      const isDone = reply.includes('✅ This topic is well characterised');
      setProbeDone(isDone);
      setProbeMessages([{ id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setProbeLoading(false); }
  }, [selectedFarmer, consultationSpecies, intake]);

  const sendProbeMessage = useCallback(async () => {
    if (!probeInput.trim() || probeLoading || !selectedFarmer || !probeField || !consultationSpecies) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: probeInput.trim(), timestamp: new Date() };
    const updated = [...probeMessages, userMsg];
    setProbeMessages(updated);
    setProbeInput('');
    setProbeLoading(true);
    try {
      const systemPrompt = buildProbePrompt(probeField, consultationSpecies, selectedFarmer, intake);
      const reply = await chatText({
        page: 'AnimalHusbandryPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 600,
      });
      const isDone = reply.includes('✅ This topic is well characterised');
      setProbeDone(isDone);
      setProbeMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setProbeLoading(false); }
  }, [probeInput, probeLoading, probeMessages, selectedFarmer, probeField, consultationSpecies, intake]);

  const closeProbe = useCallback(() => {
    if (probeField && probeMessages.length > 0) {
      const summary = probeMessages
        .slice(-8)
        .map(m => `${m.role === 'assistant' ? 'AI' : 'Farmer'}: ${m.content.slice(0, 400)}`)
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

  // ─── Detect urgency ───────────────────────────────────────────────────────
  const detectUrgency = (text: string): UrgencyLevel => {
    const lower = text.toLowerCase();
    if (lower.includes('emergency') || lower.includes('🚨')) return 'emergency';
    if (lower.includes('urgency: high') || lower.includes('**high**')) return 'high';
    if (lower.includes('urgency: medium') || lower.includes('**medium**')) return 'medium';
    if (lower.includes('urgency: low') || lower.includes('**low**')) return 'low';
    return 'medium';
  };

  // ─── Generate AI diagnosis ────────────────────────────────────────────────
  const runDiagnosis = async () => {
    if (!selectedFarmer || !consultationSpecies || isGeneratingDiagnosis) return;
    setIsGeneratingDiagnosis(true);
    try {
      const systemPrompt = buildDiagnosisPrompt(consultationSpecies, selectedFarmer, intake);
      const reply = await chatText({
        page: 'AnimalHusbandryPage',
        messages: [{ role: 'user', content: 'Please analyse this intake and provide your diagnostic recommendation.' }],
        system: systemPrompt,
        max_tokens: 1500,
      });
      const urgency = detectUrgency(reply);
      setDiagnosisResult({ urgency, text: reply });
      speak(reply.slice(0, 300));
    } catch {
      setDiagnosisResult({ urgency: 'medium', text: 'Unable to generate diagnosis. Check intake data and try again.' });
    } finally { setIsGeneratingDiagnosis(false); }
  };

  // ─── Save consultation ────────────────────────────────────────────────────
  const saveConsultation = async () => {
    if (!user || !selectedFarmer || !consultationSpecies || !diagnosisResult) return;
    setSavingConsult(true);
    try {
      const fields = SPECIES_INTAKE[consultationSpecies];
      const symptomSummary = fields
        .filter(f => intake[f.key]?.trim())
        .map(f => `${f.label}: ${intake[f.key].trim()}`)
        .join(' | ');

      const animalCount = selectedFarmer.animals.find(a => a.species === consultationSpecies)?.count ?? null;

      const { data, error } = await supabase
        .from('animal_husbandry_consultations')
        .insert({
          youth_user_id: user.id,
          farmer_id: selectedFarmer.id,
          species: consultationSpecies,
          symptom_summary: symptomSummary || 'Structured intake consultation',
          animals_total: animalCount,
          ai_diagnosis: diagnosisResult.text,
          urgency_level: diagnosisResult.urgency,
          farmer_actions_recommended: diagnosisResult.text,
          youth_actions_taken: youthActionsTaken || null,
          conversation_history: [],
          follow_up_needed: followUpNeeded,
          follow_up_date: followUpDate || null,
          follow_up_notes: followUpNotes || null,
          resolved: false,
        })
        .select('id')
        .single();

      if (!error && data) {
        setConsultSaved(true);
        setSavedConsultId(data.id);
        await loadFarmers();
        await loadConsultations(selectedFarmer.id);
      } else if (error) {
        console.error('[AnimalHusbandryPage] saveConsultation error:', error);
      }
    } finally { setSavingConsult(false); }
  };

  // ─── Follow-up chat send ──────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isSending || !selectedFarmer || !selectedConsultation) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: inputText.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);
    try {
      const history = [...messages, userMsg];
      const systemPrompt = buildFollowupPrompt(selectedFarmer, selectedConsultation);
      const reply = await chatText({
        page: 'AnimalHusbandryPage',
        messages: history.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 1200,
      });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const updated = [...history, aiMsg];
      setMessages(updated);
      speak(reply);
      await supabase.from('animal_husbandry_consultations').update({ conversation_history: updated }).eq('id', selectedConsultation.id);
    } catch {
      setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', content: 'Technical issue — please try again.', timestamp: new Date() }]);
    } finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [inputText, isSending, messages, selectedFarmer, selectedConsultation, speak]);

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
  const startConsultation = (farmer: Farmer, species: Species) => {
    setSelectedFarmer(farmer);
    setConsultationSpecies(species);
    setIntake({});
    setDiagnosisResult(null);
    setYouthActionsTaken('');
    setFollowUpNeeded(false);
    setFollowUpDate('');
    setFollowUpNotes('');
    setConsultSaved(false);
    setSavedConsultId(null);
    setMode('new-consultation');
  };

  // ─── Open follow-up chat ──────────────────────────────────────────────────
  const openFollowupChat = (farmer: Farmer, consultation: Consultation) => {
    setSelectedFarmer(farmer);
    setSelectedConsultation(consultation);
    setMessages(consultation.conversation_history || []);
    setInputText('');
    setMode('followup-chat');
    if ((consultation.conversation_history || []).length === 0) {
      const sc = SPECIES_CONFIG[consultation.species];
      const uc = consultation.urgency_level ? URGENCY_CONFIG[consultation.urgency_level] : null;
      const opener: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `Ready to help with follow-up questions for **${farmer.farmer_name}** (${sc.emoji} ${sc.label}${uc ? ` · **${uc.label}** urgency` : ''}).\n\nYou can ask about the diagnosis, how to explain it to the farmer, what to observe on follow-up, or any practical animal-health question for this case.`,
        timestamp: new Date(),
      };
      setMessages([opener]);
    }
  };

  // ─── Save farmer ──────────────────────────────────────────────────────────
  const saveFarmer = async () => {
    if (!user || !newFarmerName.trim() || !newFarmerVillage) return;
    setSavingFarmer(true);
    try {
      const { error } = await supabase.from('animal_husbandry_farmers').insert({
        youth_user_id: user.id,
        farmer_name: newFarmerName.trim(),
        village: newFarmerVillage,
        phone: newFarmerPhone || null,
        animals: newFarmerAnimals,
        notes: newFarmerNotes || null,
      });
      if (!error) { await loadFarmers(); resetAddFarmer(); setMode('dashboard'); }
    } finally { setSavingFarmer(false); }
  };

  const resetAddFarmer = () => {
    setNewFarmerName(''); setNewFarmerVillage(''); setNewFarmerPhone('');
    setNewFarmerAnimals([]); setNewFarmerNotes('');
  };

  const addAnimalEntry = () => {
    const used = new Set(newFarmerAnimals.map(a => a.species));
    const next = SPECIES_OPTIONS.find(s => !used.has(s.value));
    if (next) setNewFarmerAnimals(prev => [...prev, { species: next.value, count: 0 }]);
  };

  const updateAnimalEntry = (idx: number, field: 'species' | 'count', value: string | number) => {
    setNewFarmerAnimals(prev => prev.map((a, i) =>
      i === idx ? { ...a, [field]: field === 'count' ? Number(value) : value } : a
    ));
  };

  const removeAnimalEntry = (idx: number) => {
    setNewFarmerAnimals(prev => prev.filter((_, i) => i !== idx));
  };

  const [showResolutionModal, setShowResolutionModal] = useState(false);

  const handleResolutionSubmit = async (consultId: string, data: ResolutionSubmitData) => {
    await supabase.from('animal_husbandry_consultations').update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_outcome: data.outcome,
      resolution_narrative: data.narrative,
      resolution_value_amount: data.valueAmount,
      resolution_value_unit: data.valueUnit,
      resolution_value_label: data.valueLabel,
    }).eq('id', consultId);
    setSelectedConsultation(prev => prev ? { ...prev, resolved: true } : prev);
    if (selectedFarmer) loadConsultations(selectedFarmer.id);
    await loadFarmers();
    setShowResolutionModal(false);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  // Check required intake fields filled
  const intakeComplete = consultationSpecies
    ? SPECIES_INTAKE[consultationSpecies].filter(f => f.required).every(f => intake[f.key]?.trim())
    : false;

  // Check for danger-field keywords in intake (flags emergency warning)
  const hasDangerSignal = consultationSpecies
    ? SPECIES_INTAKE[consultationSpecies]
        .filter(f => f.danger)
        .some(f => intake[f.key]?.trim().length > 0)
    : false;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'dashboard') {
    return (
      <AppLayout>
        <AnimalBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-teal-600 flex items-center justify-center text-2xl">🐾</div>
                <div>
                  <h1 className="text-xl font-bold text-white">Animal Health Advisor</h1>
                  <p className="text-sm text-green-200">Your farmer casebook · Oloibiri & Ibiade</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowOfflineModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold text-sm transition-colors border border-white/30"
                  title="Use offline version"
                >
                  📴 Offline
                </button>
                <button onClick={() => { resetAddFarmer(); setMode('add-farmer'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl font-semibold text-sm hover:opacity-90">
                  <Plus size={16}/> Add Farmer
                </button>
              </div>
            </div>
          </div>

          {farmers.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Farmers', value: farmers.length, icon: '👨🏿‍🌾' },
                { label: 'Open Cases', value: farmers.reduce((s, f) => s + (f.open_cases ?? 0), 0), icon: '📋' },
                { label: 'Emergencies', value: farmers.reduce((s, f) => s + (f.emergency_count ?? 0), 0), icon: '🚨' },
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
            <div className="bg-green-900/80 backdrop-blur-sm border border-green-400/50 rounded-2xl p-5 mb-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-green-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-green-300 uppercase tracking-wide">Community AI Challenge — This Week</span>
                    <span className="text-xs bg-green-400/20 text-green-200 px-2 py-0.5 rounded-full">{availableChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{availableChallenge.title}</p>
                  <p className="text-green-100 text-sm leading-relaxed mb-3">{availableChallenge.description}</p>
                  <button
                    onClick={() => handleEnrollChallenge(availableChallenge)}
                    disabled={enrolling}
                    className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
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
            <div className="bg-teal-900/80 backdrop-blur-sm border border-teal-400/50 rounded-2xl p-5 mb-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-teal-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-teal-300 uppercase tracking-wide">Community AI Challenge — Active</span>
                    <span className="text-xs bg-teal-400/20 text-teal-200 px-2 py-0.5 rounded-full">{activeChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{activeChallenge.title}</p>
                  <p className="text-teal-100 text-sm leading-relaxed mb-2">{activeChallenge.challenge_mode_intro}</p>
                  <div className="bg-teal-800/60 rounded-xl p-3 mb-3">
                    <p className="text-xs font-bold text-teal-300 mb-1">Your mission:</p>
                    <p className="text-teal-100 text-sm">{activeChallenge.challenge_instruction}</p>
                  </div>
                  <button
                    onClick={() => setShowChallengeReflect(true)}
                    className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
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
                      <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-3">
                        <Award size={32} className="text-teal-600" />
                      </div>
                      <h2 className="text-2xl font-black text-gray-900">{challengeResult.tier_label}</h2>
                      <p className="text-sm text-teal-600 font-bold uppercase tracking-wide mt-1">{challengeResult.tier} tier earned</p>
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
                      className="w-full py-3 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-xs font-bold text-teal-500 uppercase tracking-wide mb-0.5">Challenge Reflection</p>
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
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none leading-relaxed"/>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_2}</label>
                        <textarea value={challengeReflect2} onChange={e => setChallengeReflect2(e.target.value)} rows={3}
                          placeholder="What happened…"
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none leading-relaxed"/>
                      </div>
                      {activeChallenge.return_question_3 && (
                        <div>
                          <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_3}</label>
                          <textarea value={challengeReflect3} onChange={e => setChallengeReflect3(e.target.value)} rows={2}
                            placeholder="Additional details…"
                            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none leading-relaxed"/>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSubmitChallengeReflection}
                      disabled={!challengeReflect1.trim() || !challengeReflect2.trim() || challengeSubmitting}
                      className="w-full mt-6 py-3.5 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
                <div className="flex items-center justify-between px-5 py-4 border-b bg-green-50 rounded-t-2xl">
                  <div>
                    <p className="text-xs font-bold text-green-500 uppercase tracking-wide">Offline Mode</p>
                    <h2 className="text-lg font-bold text-gray-900">Animal Husbandry Advisor — Offline</h2>
                  </div>
                  <button onClick={() => setShowOfflineModal(false)} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <X size={18}/>
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Open offline tool */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-green-800 mb-2">📴 Use the offline advisor now</p>
                    <p className="text-sm text-green-700 mb-3 leading-relaxed">
                      The offline version works without internet. It runs the full animal health triage — poultry, goats/sheep, cattle, and pigs — and saves consultations to your device for later sync.
                    </p>
                    <a
                      href="/offline-animal-advisor.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-green-600 to-teal-600 text-white font-bold text-sm hover:opacity-90 transition-opacity"
                    >
                      <span>📴</span> Open Offline Advisor
                    </a>
                  </div>

                  {/* Install on phone */}
                  <div className="border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-gray-800 mb-3">📱 Install on your phone (works without internet)</p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Open in your browser</p>
                          <p className="text-xs text-gray-500 mt-0.5">Tap "Open Offline Advisor" above. It will open in a new tab in your phone's browser (Chrome or Safari).</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Add to Home Screen</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            <strong>Android (Chrome):</strong> Tap the ⋮ menu → "Add to Home Screen" → "Add".<br/>
                            <strong>iPhone (Safari):</strong> Tap the Share button (□↑) → "Add to Home Screen" → "Add".
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Use it anywhere — no internet needed</p>
                          <p className="text-xs text-gray-500 mt-0.5">It will appear as an app icon. Open it in the field, complete the triage, and save the consultation to your device.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Sync when back online</p>
                          <p className="text-xs text-gray-500 mt-0.5">When you have internet again, open the app, tap the ⬆ sync button in the top right, and your saved consultations will upload to the vAI database automatically.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Operating offline tips */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-2">💡 Tips for field use</p>
                    <ul className="space-y-1.5 text-xs text-amber-700">
                      <li>• Complete required fields (marked *) — especially species, scale, and main symptoms</li>
                      <li>• Use the 💡 tip buttons to understand what each field is looking for</li>
                      <li>• For <strong>pigs</strong>: read the ASF warning before starting — rapid deaths in pigs are an emergency</li>
                      <li>• The Consultation Record at the end can be read aloud to the farmer as a referral note</li>
                      <li>• Emergency cases (ASF, PPR, FMD, Newcastle, CBPP) must be reported to the LGA Veterinary Officer — the advisor will tell you</li>
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

          {loadingFarmers ? (
            <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-green-300"/></div>
          ) : farmers.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-10 text-center">
              <div className="text-5xl mb-4">🐾</div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">No farmers registered yet</h2>
              <p className="text-sm text-gray-500 mb-5">Add your first farmer to start your casebook.</p>
              <button onClick={() => { resetAddFarmer(); setMode('add-farmer'); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90">
                <Plus size={16}/> Register First Farmer
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {farmers.map(farmer => (
                <button key={farmer.id}
                  onClick={() => { setSelectedFarmer(farmer); loadConsultations(farmer.id); setMode('farmer-detail'); }}
                  className="w-full bg-white/90 backdrop-blur-sm rounded-2xl p-4 text-left hover:bg-white transition-colors border border-transparent hover:border-green-300">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-100 to-teal-100 flex items-center justify-center text-lg">👨🏿‍🌾</div>
                      <div>
                        <p className="font-bold text-gray-900">{farmer.farmer_name}</p>
                        <p className="text-sm text-gray-500">{farmer.village}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(farmer.animals as AnimalEntry[]).map(a => (
                            <span key={a.species} className="text-xs bg-gray-100 rounded-full px-2 py-0.5 text-gray-600">
                              {SPECIES_CONFIG[a.species]?.emoji} {a.count} {SPECIES_CONFIG[a.species]?.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <ChevronRight size={17} className="text-gray-400"/>
                      {(farmer.open_cases ?? 0) > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">{farmer.open_cases} open</span>
                      )}
                      {(farmer.emergency_count ?? 0) > 0 && (
                        <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-bold">⚠️ Emergency</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>{farmer.total_consultations ?? 0} consultation{farmer.total_consultations !== 1 ? 's' : ''}</span>
                    {farmer.last_consultation_at && <span>Last: {formatDate(farmer.last_consultation_at)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: ADD FARMER
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'add-farmer') {
    return (
      <AppLayout>
        <AnimalBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div><h2 className="text-xl font-bold text-gray-900">Register Farmer</h2><p className="text-sm text-gray-500">Add to your casebook</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Farmer Name *</label>
                <input value={newFarmerName} onChange={e => setNewFarmerName(e.target.value)} placeholder="e.g. Mama Bello"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Village *</label>
                <select value={newFarmerVillage} onChange={e => setNewFarmerVillage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-base bg-white">
                  <option value="">Select village…</option>
                  {VILLAGES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone (optional)</label>
                <input value={newFarmerPhone} onChange={e => setNewFarmerPhone(e.target.value)} placeholder="+234 801 234 5678"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-base"/>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Animals</label>
                  <button onClick={addAnimalEntry} disabled={newFarmerAnimals.length >= 4}
                    className="text-xs text-green-700 font-semibold hover:underline disabled:opacity-40">+ Add species</button>
                </div>
                {newFarmerAnimals.length === 0 && <p className="text-sm text-gray-400 italic">No animals added yet.</p>}
                <div className="space-y-2">
                  {newFarmerAnimals.map((a, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select value={a.species} onChange={e => updateAnimalEntry(idx, 'species', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                        {SPECIES_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>)}
                      </select>
                      <input type="number" min="0" value={a.count} onChange={e => updateAnimalEntry(idx, 'count', e.target.value)}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400" placeholder="0"/>
                      <button onClick={() => removeAnimalEntry(idx)} className="text-gray-400 hover:text-red-500 p-1"><X size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={newFarmerNotes} onChange={e => setNewFarmerNotes(e.target.value)} rows={2}
                  placeholder="Past diseases, special concerns, housing type…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-sm resize-none"/>
              </div>
              <button onClick={saveFarmer} disabled={!newFarmerName.trim() || !newFarmerVillage || savingFarmer}
                className={classNames('w-full py-3.5 rounded-xl font-bold text-white text-base transition-opacity',
                  newFarmerName.trim() && newFarmerVillage && !savingFarmer ? 'bg-gradient-to-r from-green-600 to-teal-600 hover:opacity-90' : 'bg-gray-300 cursor-not-allowed')}>
                {savingFarmer ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>Saving…</span> : 'Register Farmer'}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: FARMER DETAIL
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'farmer-detail' && selectedFarmer) {
    const farmer = selectedFarmer;
    return (
      <AppLayout>
        <AnimalBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-teal-100 flex items-center justify-center text-2xl">👨🏿‍🌾</div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{farmer.farmer_name}</h2>
                <p className="text-sm text-gray-500">{farmer.village}{farmer.phone ? ` · ${farmer.phone}` : ''}</p>
              </div>
            </div>

            {(farmer.animals as AnimalEntry[]).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {(farmer.animals as AnimalEntry[]).map(a => {
                  const cfg = SPECIES_CONFIG[a.species];
                  return (
                    <div key={a.species} className={classNames('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border', cfg.bgLight, cfg.border, cfg.textColour)}>
                      {cfg.emoji} {a.count} {cfg.label}
                    </div>
                  );
                })}
              </div>
            )}

            {farmer.notes && <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg px-3 py-2 mb-4">{farmer.notes}</p>}

            <p className="text-sm font-semibold text-gray-700 mb-2">Start new consultation for:</p>
            <div className="grid grid-cols-2 gap-2">
              {((farmer.animals as AnimalEntry[]).length > 0
                ? (farmer.animals as AnimalEntry[])
                : SPECIES_OPTIONS.map(s => ({ species: s.value, count: 0 }))
              ).map(a => {
                const cfg = SPECIES_CONFIG[a.species];
                return (
                  <button key={a.species} onClick={() => startConsultation(farmer, a.species)}
                    className={classNames('flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-white text-sm bg-gradient-to-r hover:opacity-90 transition-opacity', cfg.colour)}>
                    <span className="text-lg">{cfg.emoji}</span> {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Case history */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList size={16} className="text-green-600"/> Case History
              </h3>
              <button onClick={() => loadConsultations(farmer.id)} className="text-gray-400 hover:text-gray-700"><RefreshCw size={14}/></button>
            </div>
            {loadingConsults ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-green-600"/></div>
            ) : consultations.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">No consultations yet.</p>
            ) : (
              <div className="space-y-3">
                {consultations.map(c => {
                  const sc = SPECIES_CONFIG[c.species];
                  return (
                    <div key={c.id} className="border border-gray-200 rounded-xl p-4 hover:border-green-300 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{sc.emoji}</span>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{sc.label}</p>
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
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{c.symptom_summary}</p>
                      {c.follow_up_needed && !c.resolved && c.follow_up_date && (
                        <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                          <Calendar size={11}/> Follow-up: {formatDate(c.follow_up_date)}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setSelectedConsultation(c); setMode('case-detail'); }}
                          className="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:border-green-300 hover:text-green-700">
                          View Case
                        </button>
                        <button onClick={() => openFollowupChat(farmer, c)}
                          className="flex-1 py-2 text-xs font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100">
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

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: NEW CONSULTATION — STRUCTURED INTAKE + AI DIAGNOSIS
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'new-consultation' && selectedFarmer && consultationSpecies) {
    const sc = SPECIES_CONFIG[consultationSpecies];
    const fields = SPECIES_INTAKE[consultationSpecies];

    return (
      <AppLayout>
        <AnimalBackground />

        {/* Probe Panel Modal */}
        {probeField && (
          <ProbePanel
            field={probeField}
            species={consultationSpecies}
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

          {/* Header */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setMode('farmer-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${sc.colour} flex items-center justify-center text-xl`}>{sc.emoji}</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{sc.label} Consultation</h2>
                <p className="text-xs text-gray-500">{selectedFarmer.farmer_name} · {selectedFarmer.village}</p>
              </div>
            </div>
          </div>

          {/* Emergency danger signal banner */}
          {hasDangerSignal && (
            <div className="bg-red-600 text-white rounded-xl p-4 flex items-start gap-3 animate-pulse">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold">⚠️ POTENTIAL EMERGENCY INDICATOR</p>
                <p className="text-sm opacity-90">You have noted a high-risk factor. Complete the intake and run AI Diagnosis — if emergency signs are confirmed, stop all animal movement and report immediately.</p>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <Lightbulb size={14} className="text-green-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-700">
              Fill in each field with what the farmer tells you. Tap <strong>🔍 Probe</strong> to get AI-coached interview questions for that topic — the AI will ask one question at a time until it fully understands. Then run AI Diagnosis.
            </p>
          </div>

          {/* Structured intake form */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
              <Stethoscope size={15} className="text-green-600"/> Intake — {sc.label}
            </h3>
            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
              <span className="text-green-600 font-bold">🔍 Probe</span> — tap after a field to explore it deeper with AI interview coaching
            </p>
            <div className="space-y-4">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                    {field.required && <span className="text-red-500 mr-1">*</span>}
                    {field.danger && <span className="text-red-500 mr-1">⚠️</span>}
                    {field.label}
                    <InfoTooltip
                      id={field.key}
                      text={field.tooltip}
                      open={openTooltip === field.key}
                      onToggle={() => setOpenTooltip(openTooltip === field.key ? null : field.key)}
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
                          : 'border-gray-300 focus:ring-green-400'
                      )}
                    />
                    <button
                      onClick={() => openProbe(field)}
                      className={classNames(
                        'px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex-shrink-0 self-start mt-0.5',
                        probeField?.key === field.key
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                      )}
                    >
                      {probeField?.key === field.key ? '🔍 Probing…' : '🔍 Probe'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Diagnosis button / result */}
          {!diagnosisResult ? (
            <button
              onClick={runDiagnosis}
              disabled={isGeneratingDiagnosis || !intakeComplete}
              className={classNames(
                'w-full py-4 rounded-xl font-bold text-white text-base transition-opacity flex items-center justify-center gap-2',
                !isGeneratingDiagnosis && intakeComplete
                  ? `bg-gradient-to-r ${sc.colour} hover:opacity-90`
                  : 'bg-gray-300 cursor-not-allowed'
              )}
            >
              {isGeneratingDiagnosis
                ? <><Loader2 size={18} className="animate-spin"/>Generating AI Diagnosis…</>
                : <><Stethoscope size={18}/>Generate AI Diagnosis{!intakeComplete && ' (fill required fields first)'}</>}
            </button>
          ) : (
            <div className={classNames('bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5 border-2', URGENCY_CONFIG[diagnosisResult.urgency].border)}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Diagnostic Result</p>
                  <UrgencyBadge level={diagnosisResult.urgency}/>
                  <p className="text-xs text-gray-500 mt-1">{URGENCY_CONFIG[diagnosisResult.urgency].description}</p>
                </div>
                <button onClick={() => { setDiagnosisResult(null); runDiagnosis(); }}
                  className="text-xs text-green-600 hover:underline flex items-center gap-1">
                  <RefreshCw size={12}/> Re-run
                </button>
              </div>

              {diagnosisResult.urgency === 'emergency' && (
                <div className="bg-red-600 text-white rounded-xl p-3 mb-4 flex items-start gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>
                  <p className="text-sm font-bold">STOP all animal movement. Isolate sick animals. Report to veterinary authority immediately. Do not sell or slaughter sick animals.</p>
                </div>
              )}

              <div className="text-sm text-gray-800 bg-gray-50 rounded-xl px-4 py-3 max-h-72 overflow-y-auto">
                <MarkdownText text={diagnosisResult.text}/>
              </div>

              {/* Save section */}
              <div className="mt-4 space-y-3 border-t pt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">What did you advise / do on the ground?</label>
                  <textarea value={youthActionsTaken} onChange={e => setYouthActionsTaken(e.target.value)} rows={2}
                    placeholder="e.g. Told farmer to isolate sick birds. Recommended Newcastle vaccination. Advised against selling."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"/>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="followup" checked={followUpNeeded} onChange={e => setFollowUpNeeded(e.target.checked)} className="w-4 h-4 accent-green-600"/>
                  <label htmlFor="followup" className="text-sm font-semibold text-gray-700">Follow-up visit needed</label>
                </div>
                {followUpNeeded && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Follow-up date</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"/>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">What to check</label>
                      <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Check mortality rate, vaccination status"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"/>
                    </div>
                  </div>
                )}

                {consultSaved ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 font-semibold text-sm bg-green-50 rounded-xl px-4 py-3">
                      <CheckCircle size={16}/> Case saved to {selectedFarmer.farmer_name}'s record.
                    </div>
                    {/* Challenge nudge — shown after save when challenge is active */}
                    {activeChallenge && (
                      <div className="bg-teal-50 border border-teal-300 rounded-xl px-4 py-3 flex items-start gap-2">
                        <Award size={16} className="text-teal-600 flex-shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-teal-800 mb-1">Community AI Challenge active</p>
                          <p className="text-xs text-teal-700 mb-2">You completed a consultation — did you also complete your challenge mission? Submit your reflection to earn your tier.</p>
                          <button
                            onClick={() => setShowChallengeReflect(true)}
                            className="text-xs font-bold text-teal-700 underline hover:text-teal-900"
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
                            farmer_id: selectedFarmer.id,
                            youth_user_id: user?.id ?? '',
                            species: consultationSpecies,
                            symptom_summary: '',
                            animals_affected: null,
                            animals_total: null,
                            ai_diagnosis: diagnosisResult.text,
                            urgency_level: diagnosisResult.urgency,
                            farmer_actions_recommended: diagnosisResult.text,
                            youth_actions_taken: youthActionsTaken || null,
                            conversation_history: [],
                            follow_up_needed: followUpNeeded,
                            follow_up_date: followUpDate || null,
                            follow_up_notes: followUpNotes || null,
                            resolved: false,
                            resolved_at: null,
                            created_at: new Date().toISOString(),
                          } as Consultation;
                          openFollowupChat(selectedFarmer, saved);
                        }}
                        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-teal-600 to-green-600 hover:opacity-90 flex items-center justify-center gap-2"
                      >
                        <Send size={16}/> Continue with AI Follow-up Chat
                      </button>
                    )}
                  </div>
                ) : (
                  <button onClick={saveConsultation} disabled={savingConsult}
                    className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-600 to-teal-600 hover:opacity-90 disabled:opacity-50">
                    {savingConsult ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin"/>Saving…</span> : 'Save Case Record'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck size={14} className="text-green-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-600">This AI diagnosis is <strong>support only</strong>. Never prescribe specific drug doses. For emergencies or reportable diseases (ASF, HPAI, FMD, PPR, CBPP), contact the nearest veterinary authority immediately.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: FOLLOW-UP CHAT
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'followup-chat' && selectedFarmer && selectedConsultation) {
    const farmer = selectedFarmer;
    const consult = selectedConsultation;
    const sc = SPECIES_CONFIG[consult.species];
    const userTurns = messages.filter(m => m.role === 'user').length;

    return (
      <AppLayout>
        <AnimalBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setMode('farmer-detail'); }} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${sc.colour} flex items-center justify-center text-lg`}>{sc.emoji}</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Follow-up Questions</h2>
                  <p className="text-xs text-gray-500">{farmer.farmer_name} · {sc.label}{consult.urgency_level ? ' · ' : ''}{consult.urgency_level && <UrgencyBadge level={consult.urgency_level}/>}</p>
                </div>
              </div>
              <button onClick={() => { setSpeechOn(s => !s); if (speechOn) window.speechSynthesis.cancel(); }}
                className={classNames('p-2 rounded-lg', speechOn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400')}>
                {speechOn ? <Volume2 size={15}/> : <VolumeX size={15}/>}
              </button>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <Lightbulb size={14} className="text-green-700 flex-shrink-0"/>
            <p className="text-xs text-gray-700">Ask about the diagnosis, how to explain it to the farmer, what to observe on follow-up, or any animal-health question for this case.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: '460px' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl text-xs text-gray-500">
              <span className="font-semibold text-gray-700 flex items-center gap-1.5">{sc.emoji} Animal Health AI Advisor</span>
              <span>{userTurns} exchange{userTurns !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${sc.colour} flex items-center justify-center text-lg`}>{sc.emoji}</div>
                  )}
                  <div className={classNames('max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user' ? 'bg-green-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant' && <p className="text-xs font-bold mb-1 opacity-50">AI Animal Health Advisor</p>}
                    {msg.role === 'user' && <p className="text-xs font-bold mb-1 opacity-75">You (Advisor)</p>}
                    <MarkdownText text={msg.content}/>
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center">
                      <User size={15} className="text-white"/>
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${sc.colour} flex items-center justify-center text-lg`}>{sc.emoji}</div>
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
                  className="flex-1 px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 resize-none leading-relaxed disabled:opacity-50"/>
                <div className="flex flex-col gap-2">
                  <button onClick={toggleListening}
                    className={classNames('p-2.5 rounded-xl transition-all', isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                    {isListening ? <MicOff size={16}/> : <Mic size={16}/>}
                  </button>
                  <button onClick={sendMessage} disabled={!inputText.trim() || isSending}
                    className={classNames('p-2.5 rounded-xl transition-all',
                      inputText.trim() && !isSending ? `bg-gradient-to-br ${sc.colour} text-white hover:opacity-90` : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
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
  // RENDER: CASE DETAIL
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'case-detail' && selectedConsultation && selectedFarmer) {
    const c = selectedConsultation;
    const sc = SPECIES_CONFIG[c.species];
    return (
      <AppLayout>
        <AnimalBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('farmer-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${sc.colour} flex items-center justify-center text-2xl`}>{sc.emoji}</div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900">{sc.label} Case — {selectedFarmer.farmer_name}</h2>
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
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">{c.symptom_summary}</p>
              </div>
              {c.ai_diagnosis && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Diagnosis</p>
                  <div className={classNames('text-sm text-gray-800 rounded-lg px-3 py-2 max-h-48 overflow-y-auto border',
                    c.urgency_level ? URGENCY_CONFIG[c.urgency_level].bg : 'bg-gray-50',
                    c.urgency_level ? URGENCY_CONFIG[c.urgency_level].border : 'border-gray-200')}>
                    <MarkdownText text={c.ai_diagnosis}/>
                  </div>
                </div>
              )}
              {c.youth_actions_taken && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Actions Taken</p>
                  <p className="text-sm text-gray-800 bg-green-50 rounded-lg px-3 py-2">{c.youth_actions_taken}</p>
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
                <button onClick={() => openFollowupChat(selectedFarmer, c)}
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-green-50 text-green-700 hover:bg-green-100">
                  Ask AI Follow-up
                </button>
                {!c.resolved && (
                  <button onClick={() => setShowResolutionModal(true)}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl text-white bg-gradient-to-r from-green-600 to-teal-600 hover:opacity-90">
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
            consultationSummary={c.symptom_summary}
            defaultUnit="animals_saved"
            defaultValueLabel="Animals recovered/saved"
            accent="teal"
            onClose={() => setShowResolutionModal(false)}
            onSubmit={(data) => handleResolutionSubmit(c.id, data)}
          />

          {c.conversation_history?.length > 0 && (
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText size={14} className="text-green-600"/> Follow-up Chat Transcript
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {c.conversation_history.map((msg, i) => (
                  <div key={i} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className={`flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br ${sc.colour} flex items-center justify-center text-sm`}>{sc.emoji}</div>
                    )}
                    <div className={classNames('max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed',
                      msg.role === 'user' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800')}>
                      <MarkdownText text={msg.content}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  return null;
};

export default AnimalHusbandryPage;