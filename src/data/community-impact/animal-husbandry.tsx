// src/data/community-impact/animal-husbandry.tsx
//
// Domain knowledge for the Animal Husbandry Advisor (AnimalHusbandryPage.tsx):
// species taxonomy, structured intake schema per species, the Nigeria
// livestock knowledge base, and the AI prompt builders that draw on it.
// Extracted out of the page component so the page's React/JSX code isn't
// mixed in with ~230 lines of domain content, and so this shape can be
// compared side by side with Agriculture's and Fishing's equivalents.
//
// Pure data + prompt-string builders — no page-specific state or rendering.

import React from 'react';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { ILLUSTRATION_INSTRUCTIONS } from './illustrationPrompt';

export type Species = 'poultry' | 'goats_sheep' | 'cattle' | 'pigs';
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'emergency';

export interface IntakeField {
  key: string;
  label: string;
  placeholder: string;
  tooltip: string;
  required?: boolean;
  danger?: boolean; // flags this as an emergency indicator if answered "yes"
}

// ─── Structured intake fields per species ─────────────────────────────────────
// Mirrors the HealthcareNavigator's AssessmentData / FishingConsultant's
// INTAKE_FIELDS pattern. Each field has a probe tooltip and a probe-able key.

export const SPECIES_INTAKE: Record<Species, IntakeField[]> = {
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

export const NIGERIA_LIVESTOCK_CONTEXT = `
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

// ─── Species config ───────────────────────────────────────────────────────────

export const SPECIES_CONFIG: Record<Species, {
  label: string; emoji: string; colour: string;
  bgLight: string; border: string; textColour: string;
}> = {
  poultry:     { label: 'Poultry',     emoji: '🐔', colour: 'from-amber-500 to-orange-500',  bgLight: 'bg-amber-50',  border: 'border-amber-300',  textColour: 'text-amber-700'  },
  goats_sheep: { label: 'Goats/Sheep', emoji: '🐐', colour: 'from-green-600 to-teal-600',   bgLight: 'bg-green-50',  border: 'border-green-300',  textColour: 'text-green-700'  },
  cattle:      { label: 'Cattle',      emoji: '🐄', colour: 'from-orange-600 to-amber-700', bgLight: 'bg-orange-50', border: 'border-orange-300', textColour: 'text-orange-700' },
  pigs:        { label: 'Pigs',        emoji: '🐖', colour: 'from-pink-500 to-rose-500',    bgLight: 'bg-pink-50',   border: 'border-pink-300',   textColour: 'text-pink-700'   },
};

export const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string; colour: string; bg: string; border: string; textDark: string; icon: React.ReactNode; description: string;
}> = {
  low:       { label: 'Low',       colour: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-300',  textDark: 'text-green-800',  icon: <CheckCircle size={14}/>,  description: 'Monitor and improve care — no immediate danger.' },
  medium:    { label: 'Medium',    colour: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-300', textDark: 'text-yellow-800', icon: <Clock size={14}/>,        description: 'Act this week — isolate, check vaccines, contact animal-health worker.' },
  high:      { label: 'High',      colour: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-300', textDark: 'text-orange-800', icon: <AlertTriangle size={14}/>, description: 'Act today — deaths or rapid spread requires urgent vet contact.' },
  emergency: { label: 'EMERGENCY', colour: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-400',    textDark: 'text-red-800',    icon: <AlertTriangle size={14}/>, description: 'STOP all animal movement. Isolate. Report to veterinary authority now.' },
};

export const VILLAGES = ['Oloibiri', 'Ibiade', 'Nembe', 'Brass', 'Yenagoa', 'Other'];

export const SPECIES_OPTIONS: { value: Species; label: string; emoji: string }[] = [
  { value: 'poultry',     label: 'Poultry (chickens, ducks, guinea fowl)', emoji: '🐔' },
  { value: 'goats_sheep', label: 'Goats / Sheep',                          emoji: '🐐' },
  { value: 'cattle',      label: 'Cattle',                                 emoji: '🐄' },
  { value: 'pigs',        label: 'Pigs',                                   emoji: '🐖' },
];

// ─── Prompt builders ───────────────────────────────────────────────────────────
//
// Structural (not imported) param types — the page's actual Farmer/Consultation
// row types satisfy these by having a superset of these fields, so no import
// back into the page is needed and this file stays fully self-contained.

interface AnimalEntryLike {
  species: Species;
  count: number;
}

interface FarmerLike {
  farmer_name: string;
  village: string;
  animals: AnimalEntryLike[];
}

interface ConsultationLike {
  species: Species;
  urgency_level: UrgencyLevel | null;
  symptom_summary: string;
  ai_diagnosis: string | null;
}

export function buildProbePrompt(field: IntakeField, species: Species, farmer: FarmerLike, currentIntake: Record<string, string>): string {
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

export function buildDiagnosisPrompt(species: Species, farmer: FarmerLike, intake: Record<string, string>): string {
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

⚠️ DISCLAIMER: This is advisory support only. Never prescribe specific drug doses. For emergencies, reportable diseases, or severe cases, insist on a trained animal-health worker or vet.

${ILLUSTRATION_INSTRUCTIONS}`;
}

export function buildFollowupPrompt(farmer: FarmerLike, consultation: ConsultationLike): string {
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

Respond with practical, specific, actionable advice. Never prescribe specific drug doses — recommend a trained animal-health worker for medication decisions. For any EMERGENCY situation, keep reinforcing the urgency.

${ILLUSTRATION_INSTRUCTIONS}`;
}
