// src/pages/community-impact/AgricultureConsultantPage.tsx
//
// Agriculture Advisor — Community Impact Track
// A professional casebook tool for youth agricultural advisors serving
// smallholder farmers in Oloibiri (Bayelsa State) and Ibiade (Ogun State).
//
// MODELED ON: FishingConsultantPage.tsx (which itself models HealthcareNavigatorPage.tsx)
// The youth advisor sits with a farmer and runs a STRUCTURED intake interview,
// guided step-by-step by AI coaching questions (Probe Panel). Once the problem
// is fully characterised, AI generates a detailed recommendation. The advisor
// and farmer can then continue in a follow-up chat mode. Every exchange is a
// learning moment for the youth advisor.
//
// DB tables: agriculture_clients
// agriculture_consultations
// agriculture_open_followups (view — UNRESTRICTED)
// agriculture_client_summary (view)
//
// Route: /community-impact/agriculture
// Activity: agriculture_advisor

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { chatText } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import { PidginTooltip } from '../../components/PidginTooltip';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { playPidginVoice, stopPidginSpeech } from '../../lib/speechCoordination';
import {
  Sprout, ArrowLeft, Send, Save, Loader2, Plus, User,
  FileText, AlertTriangle, CheckCircle, Clock, ChevronRight,
  ClipboardList, Calendar, Mic, MicOff,
  Volume2, VolumeX, X, Lightbulb, ShieldCheck, Award,
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
  | 'add-client'
  | 'client-detail'
  | 'new-consultation'
  | 'followup-chat'
  | 'case-detail';

type ConsultationType =
  | 'crop-disease'
  | 'pest-damage'
  | 'soil-water'
  | 'post-harvest'
  | 'market-input';

type UrgencyLevel = 'low' | 'medium' | 'high' | 'urgent';

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

type CropType =
  | 'cassava' | 'maize' | 'yam' | 'plantain' | 'vegetables'
  | 'cowpea' | 'rice' | 'cocoa' | 'oil-palm' | 'other';

interface Client {
  id: string;
  youth_user_id: string;
  farmer_name: string;
  village: string;
  phone: string | null;
  crops: CropType[];
  notes: string | null;
  created_at: string;
  total_consultations?: number;
  open_cases?: number;
  last_consultation_at?: string | null;
}

interface Consultation {
  id: string;
  farmer_id: string;
  youth_user_id: string;
  consultation_type: ConsultationType;
  problem_summary: string;
  ai_advice: string | null;
  urgency_level: UrgencyLevel | null;
  youth_actions_taken: string | null;
  conversation_history: ChatMessage[];
  follow_up_needed: boolean;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

// ─── Structured Intake Form ────────────────────────────────────────────────────

interface IntakeField {
  key: string;
  label: string;
  placeholder: string;
  tooltip: string;
  required?: boolean;
}

const INTAKE_FIELDS: Record<ConsultationType, IntakeField[]> = {
  'crop-disease': [
    { key: 'crop_and_stage', label: 'Crop and growth stage', placeholder: 'e.g. cassava 4 months after planting, maize at tasselling, yam vines flowering', tooltip: 'Disease symptoms and treatment options differ dramatically by crop and growth stage — seedling blast vs mature plant infection require very different responses.', required: true },
    { key: 'symptoms_description', label: 'Exact symptoms seen', placeholder: 'e.g. yellow mosaic pattern on cassava leaves, brown spots with yellow halos on maize, wilting from bottom up', tooltip: 'The pattern of symptoms is the key diagnostic tool. Mosaic/mottling = virus. Circular spots with yellow halo = fungal. Sudden uniform wilting = root/vascular problem. Be very specific.', required: true },
    { key: 'spread_pattern', label: 'How plants are affected (spread pattern)', placeholder: 'e.g. random scattered plants, in patches near low-lying corner, spreading from one edge, whole field uniform', tooltip: 'Spread pattern distinguishes soilborne disease (patches), airborne fungal (spreading front), insect-vectored virus (random scattered plants), or environmental stress (uniform across field).' },
    { key: 'onset_speed', label: 'When it started and how fast it is progressing', placeholder: 'e.g. noticed 1 week ago, getting worse daily; or gradual yellowing over 3 weeks', tooltip: 'Sudden rapid wilt in 1–2 days = likely soilborne fungal or bacterial. Gradual yellowing over weeks = nutrient deficiency or slow virus. Speed determines urgency.' },
    { key: 'recent_inputs', label: 'Recent fertiliser, pesticide or herbicide applied', placeholder: 'e.g. NPK 15:15:15 two weeks ago, glyphosate sprayed nearby, none applied', tooltip: 'Chemical burn from over-application or wrong chemical mimics disease symptoms. Herbicide drift causes leaf distortion similar to virus symptoms. This is a critical diagnostic question.' },
    { key: 'variety_source', label: 'Variety and source of planting material', placeholder: 'e.g. cassava cuttings from neighbour\'s field, TMS variety from ADP, local maize seed from last harvest', tooltip: 'Planting material from infected fields is the #1 source of cassava mosaic, yam mosaic, and many seed-borne diseases. Source of seed/cuttings/suckers is always relevant.' },
  ],
  'pest-damage': [
    { key: 'crop_and_stage', label: 'Crop and growth stage', placeholder: 'e.g. maize at 4 weeks (whorl stage), okra at fruiting, cassava at 3 months', tooltip: 'Pest identity and management depends heavily on crop and stage — Fall Armyworm in maize whorl vs ear stage requires different responses.', required: true },
    { key: 'damage_description', label: 'What the damage looks like', placeholder: 'e.g. ragged holes in maize whorl with sawdust-like droppings, silvery scarring on okra, white cottony clusters at cassava stem joints', tooltip: 'Damage type identifies the pest more reliably than seeing the pest itself. Irregular holes + frass in whorl = FAW. Silvery stippling = thrips or mites. White cottony mass = mealybug.', required: true },
    { key: 'pest_seen', label: 'Have they seen the actual pest? Describe it', placeholder: 'e.g. green caterpillar with stripes inside maize whorl, tiny white insects under leaves, no pest seen', tooltip: 'If the pest is visible, description helps confirm identity. Look under leaves, in soil, in stem tunnels, and at night for nocturnal pests.' },
    { key: 'affected_proportion', label: 'Percentage of crop showing damage', placeholder: 'e.g. about 30% of maize plants affected, only edges of field, almost every plant', tooltip: 'Economic threshold — minor pest pressure often does not justify chemical intervention. Heavy pressure (>20–30% plants affected) usually requires action. Helps calibrate urgency.' },
    { key: 'previous_treatment', label: 'Anything applied to control it', placeholder: 'e.g. wood ash into maize whorls, neem leaf spray, nothing tried yet, sprayed pesticide last week with no effect', tooltip: 'If a treatment was tried and failed, this tells us about resistance, wrong product, or wrong application timing. Critical for next recommendation.' },
    { key: 'neighbours_affected', label: 'Are neighbouring farms seeing the same problem?', placeholder: 'e.g. yes, the whole village has it; only this farm; not sure', tooltip: 'Outbreak spreading across farms = likely migratory pest (FAW, locusts) or weather-driven epidemic. Isolated to one farm = possibly sanitation issue or specific variety susceptibility.' },
  ],
  'soil-water': [
    { key: 'soil_appearance', label: 'Soil appearance and feel', placeholder: 'e.g. dark sticky clay, water sits for 2 days after rain, sandy and dries quickly, cracks when dry', tooltip: 'Visual soil assessment reveals drainage class, organic matter content, and compaction. Waterlogging is the dominant issue in Bayelsa; erosion and hardpan more common in Ogun State.' },
    { key: 'crop_symptoms', label: 'Crop symptoms linked to soil problems', placeholder: 'e.g. yellow leaves from bottom up, purple tinge on maize, wilting despite recent rain, very slow growth', tooltip: 'Crop symptoms map to soil nutrient deficiencies. Bottom-up yellowing = N deficiency. Purple tinge = P deficiency. Interveinal chlorosis = K or Mg. Wilting despite moisture = root suffocation from waterlogging.' },
    { key: 'drainage_situation', label: 'Drainage — does water sit on the field?', placeholder: 'e.g. water stands 24+ hours after heavy rain, drains within hours, completely flooded last week', tooltip: 'Standing water >24 hours causes root oxygen deprivation. >48 hours can permanently damage most crops. Raised beds and drainage channels are the primary solution in the Niger Delta.', required: true },
    { key: 'fertiliser_history', label: 'Fertiliser used in past 2 seasons and rate', placeholder: 'e.g. half bag NPK per acre last season, only chicken manure, no fertiliser applied for 3 years', tooltip: 'Soil nutrient depletion is cumulative. Two seasons of continuous cropping without organic matter return causes predictable deficiency patterns. Over-application of nitrogen causes leaf burn and acidification.' },
    { key: 'plot_history', label: 'What was grown here before, and for how many seasons', placeholder: 'e.g. cassava continuously for 5 years, rotated maize and cowpea, fresh land cleared this year', tooltip: 'Continuous monocropping exhausts specific nutrients and builds up soilborne pathogens. Crop rotation knowledge tells us what the soil has been depleted of and what diseases may be building.' },
    { key: 'flood_exposure', label: 'Flood exposure and active flooding now?', placeholder: 'e.g. flooded badly in 2022, low ground near creek, currently flooded with standing crop, on higher ground', tooltip: 'Active flooding with a standing crop is an EMERGENCY — crops can be lost in 24–72 hours. Document this clearly. Long-term: raised beds, drainage channels, flood-tolerant varieties.' },
  ],
  'post-harvest': [
    { key: 'crop_and_quantity', label: 'Crop and quantity harvested', placeholder: 'e.g. 200kg cassava roots, 5 bags maize (~500kg), 50kg fresh tomatoes, 3 bags cowpea', tooltip: 'Scale determines which post-harvest options are realistic. Large volumes may justify collective processing. Small volumes suit individual household methods.', required: true },
    { key: 'storage_method', label: 'Current storage method and duration', placeholder: 'e.g. cassava roots heaped on ground 3 days, maize in jute sacks in room for 2 weeks, yam in barn 1 month', tooltip: 'Most post-harvest loss in Nigeria is from wrong storage — damp sacks causing mould, unsealed containers allowing weevils, direct ground contact causing rot. Current method reveals the specific risk.' },
    { key: 'loss_signs', label: 'Signs of deterioration', placeholder: 'e.g. mould on maize with musty smell, weevil holes in cowpea, cassava roots turning black, soft rotten yam tubers', tooltip: 'Specific deterioration signs identify the cause — mould and smell = moisture/fungal (potential aflatoxin). Insect damage = weevil or borer. Shrinkage = respiration loss from high temperature. Each needs different intervention.' },
    { key: 'time_to_market', label: 'Time before it must be sold or processed', placeholder: 'e.g. sell within 3 days or it spoils, 2 weeks before next market day, hoping to store 3 months for better price', tooltip: 'Time available determines which interventions are viable. 3 days = focus on immediate sale or emergency drying. 3 weeks = improved storage method. 3 months = full processing or hermetic storage.' },
    { key: 'processing_access', label: 'Access to processing equipment', placeholder: 'e.g. shared community garri press, own grater, no equipment, hammer mill at next village', tooltip: 'Processing converts perishable raw produce into shelf-stable products worth 40–100% more. Knowing what equipment is accessible shapes the most realistic recommendation.' },
  ],
  'market-input': [
    { key: 'crop_ready', label: 'Crop and volume ready to sell (or weeks until ready)', placeholder: 'e.g. 10 bags garri ready now, cassava harvest in 6 weeks (estimate 1 ton), 3 bags cowpea ready', tooltip: 'Timing and volume determine which market channels are realistic. Large volumes need aggregation or trader contact. Small volumes suit local market or direct consumer.', required: true },
    { key: 'current_price', label: 'Price farmer is currently getting or expecting', placeholder: 'e.g. ₦25,000 per bag of garri from village trader, ₦300/kg for tomatoes, not sure of price', tooltip: 'Comparing to market reference prices reveals whether the farmer is being underpaid. Middlemen typically pay 40–60% of final market value.' },
    { key: 'selling_to', label: 'Who they currently sell to', placeholder: 'e.g. middleman comes to farm gate, take to local market on Wednesdays, sell to a Lagos trader on WhatsApp', tooltip: 'Farm gate sale to a single trader is the most common and least remunerative channel. Each step closer to the end consumer adds significant income.' },
    { key: 'input_needed', label: 'Inputs needed for next season', placeholder: 'e.g. improved cassava cuttings (TMS), 2 bags NPK fertiliser, neem extract for pest control, no money for inputs', tooltip: 'Input availability and affordability is often the binding constraint on yield. Knowing what is needed lets us identify the most accessible and affordable source — ADP, NASC, NIRSAL credit.' },
    { key: 'transport_access', label: 'Transport available to reach markets', placeholder: 'e.g. only motorcycle for small loads, can hire pickup ₦5,000 to Yenagoa, Lagos road via Sagamu accessible', tooltip: 'Transport cost and availability constrains which markets are accessible. In Bayelsa, boat access limits options. In Ogun, road access to Lagos is the major opportunity.' },
  ],
};

// ─── Niger Delta / Ogun State Agriculture Knowledge Base ──────────────────────

const AGRICULTURE_CONTEXT = `
NIGERIAN SMALLHOLDER FARMING CONTEXT — always apply this knowledge:

COMMUNITIES:
- Oloibiri, Ogbia LGA, Bayelsa State: Niger Delta; ~2,500mm rainfall/year;
  swampy/riverine land; dominant crops cassava, plantain, yam, cocoyam,
  vegetables (ugwu/fluted pumpkin, waterleaf, okra), some rice; oil
  contamination affects some farmland; flooding is a major seasonal hazard
  (April–November); most farmers are women; 2022 floods submerged 300+
  Bayelsa communities and destroyed thousands of farms.
- Ibiade, Ogun State: derived savanna and forest; better-drained soils;
  crops include cassava, maize, cowpea, vegetables, cocoa and oil palm;
  Lagos market access via Sagamu road is the major income opportunity;
  land tenure conflicts common.

FARMING SYSTEMS:
- Smallholder subsistence + surplus sale; 0.5–3 hectares typical
- Intercropping is the norm (cassava + maize + vegetable combinations)
- Minimal use of improved varieties, fertiliser, pesticides
- Women dominate vegetable and food crop production
- Post-harvest losses 20–40% for vegetables, 10–25% for cassava

CASSAVA (most important food security crop):
- Cassava Mosaic Disease (CMD): whitefly-transmitted virus; yellowing,
  mosaic pattern on leaves, stunted growth; NO CURE — rogue infected
  plants, plant CMD-resistant varieties (TMS series, IITA varieties);
  never plant cuttings from infected fields.
- Cassava Brown Streak Disease (CBSD): brown streaks on stems, root rot;
  use certified disease-free cuttings; worse in coastal/humid areas.
- Cassava Green Mite: angular leaf distortion; spray neem-based solutions.
- Mealybug: white cottony clusters at stem joints; remove by hand or neem.
- Root rot at harvest: waterlogging + poor drainage; choose well-drained
  sites; harvest at right maturity (9–18 months depending on variety).
- Post-harvest: roots deteriorate within 24–48 hours of harvest — process
  quickly into garri, flour, or fufu; dried chips last months.

MAIZE:
- Fall Armyworm (FAW): MOST SERIOUS CURRENT THREAT; caterpillar eats
  into the whorl leaving ragged holes and frass; check whorls early
  morning; apply neem extract or wood ash directly into whorl; Bt-based
  pesticides effective; early planting avoids peak FAW pressure.
- Streak virus: leafhopper-transmitted; white/yellow streaks on leaves;
  plant resistant varieties.
- Striga (witchweed): parasitic weed — small purple flowers in maize
  fields; devastating yield loss; use Striga-resistant varieties;
  intercrop with Desmodium (push-pull method).
- Storage: dry to <13% moisture; use hermetic bags (PICS bags) to prevent
  weevil damage; AFLATOXIN risk if stored damp — invisible fungal toxin
  causing liver cancer; serious health hazard.

VEGETABLES (ugwu/fluted pumpkin, waterleaf, okra, tomatoes):
- Downy mildew and leaf blight: humid conditions; improve spacing for
  airflow; copper-based fungicide if available.
- Aphids: yellow curling leaves; neem spray or soap solution.
- Thrips on okra and tomato: silvery scarring; neem, reflective mulch.
- Tomato fruitworm: bores into fruit; pick and destroy affected fruit.
- Waterlogging sensitivity: raised beds critical in Bayelsa.
- Post-harvest: most last <3 days without cooling; sell quickly or
  dry/preserve; zero-energy clay pot cool chambers extend by 2–3 days.

YAM:
- Yam mosaic virus: mottled leaves, reduced yield; plant certified seed
  yam; rogue infected plants.
- Yam beetles and nematodes: root damage; crop rotation.
- Storage: yam barn (stacked on wooden frame, shaded, ventilated); lasts
  3–6 months if undamaged; damaged tubers rot fast — dry small cuts with
  ash before storing.

PLANTAIN/BANANA:
- Black Sigatoka: dark leaf spots progressing to leaf death; remove
  affected leaves; ensure drainage.
- Panama disease (Fusarium wilt): yellowing from lower leaves; NO CURE;
  plant resistant PITA varieties; do not replant in infected soil for 3+ years.
- Banana weevil: bores into corm; cut and destroy affected corms; use
  clean planting material.

SOIL AND WATER:
- Niger Delta soils: typically acidic (pH 4.5–5.5), low phosphorus,
  waterlogged in rainy season.
- Bayelsa flooding: April–November; raised beds (30–50cm high), drainage
  channels, flood-tolerant varieties.
- Soil acidity: lime application (2–3 tons/ha); wood ash as accessible
  local amendment; raises pH, adds calcium and potassium.
- Organic fertiliser: compost from kitchen waste, crop residues, animal
  manure; apply 2–4 weeks before planting.
- Inorganic fertiliser: NPK 15:15:15 for general base dressing; urea for
  nitrogen top-dressing at 3–4 weeks; always apply to moist soil.
- Erosion: contour ridging, cover crops, mulching with crop residues.
- Mulching: dry grass/leaves cover; retains moisture, suppresses weeds.

POST-HARVEST AND MARKET:
- Biggest income loss point is post-harvest — more income from reducing
  loss than from increasing yield in most cases.
- Cassava processing: garri most common; fufu and starch have better
  market prices; cassava flour for urban markets.
- Grading: bigger, uniform produce commands 20–40% premium.
- Timing: sell at trough of supply glut (early dry season for vegetables)
  for highest price; store or process when prices are low.
- Market linkages: Lagos markets accessible from Ibiade via Sagamu road;
  Yenagoa market from Oloibiri; cooperatives access better prices.

URGENCY INDICATORS:
- URGENT: Suspected aflatoxin contamination (food safety emergency);
  complete crop failure affecting food security; unidentified sudden mass
  plant death across multiple plots; flooding actively destroying standing crop.
- HIGH: Confirmed Fall Armyworm outbreak spreading; CMD spreading rapidly
  through planting material; post-harvest loss >30% with no intervention;
  Panama disease confirmed.
- MEDIUM: Single pest or disease affecting <30% of crop; soil problems
  reducing yield but not causing crop failure; manageable post-harvest issues.
- LOW: General husbandry questions; market timing; input sourcing;
  next-season planning.

REFERRAL CONTACTS:
- ADP (Agricultural Development Programme): extension support, input
  subsidies, improved variety access — offices in Yenagoa and major Ogun
  State LGAs.
- NASC (National Agricultural Seed Council): certified seed sourcing.
- IITA (International Institute of Tropical Agriculture, Ibadan):
  technical resources; iita.org/contact.
- NIRSAL Microfinance Bank: agricultural credit.
- RMRDC: cassava processing support.
`;

// ─── Probe prompt builder ─────────────────────────────────────────────────────

function buildProbePrompt(field: IntakeField, consultType: ConsultationType, client: Client, currentIntake: Record<string, string>): string {
  const ct = CONSULT_TYPES[consultType];
  const cropList = client.crops.map(c => CROP_OPTIONS.find(o => o.value === c)?.label ?? c).join(', ') || 'mixed crops';
  const filledSoFar = Object.entries(currentIntake)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || 'nothing yet';

  return `You are coaching a youth agricultural advisor in ${client.village === 'Ibiade' || client.village === 'Sagamu' || client.village === 'Abeokuta' ? 'Ibiade (Ogun State)' : 'Oloibiri (Bayelsa State)'}, Nigeria. They are sitting with a smallholder farmer RIGHT NOW and need you to guide an in-depth interview about one specific topic.

FARMER: ${client.farmer_name}, ${client.village}
CROPS GROWN: ${cropList}

CONSULTATION TYPE: ${ct.emoji} ${ct.label}
TOPIC BEING EXPLORED: "${field.label}"
WHAT IT MEANS: ${field.tooltip}

INTAKE INFORMATION GATHERED SO FAR:
${filledSoFar}

${AGRICULTURE_CONTEXT}

YOUR ROLE:
- Ask ONE focused question at a time that the advisor can read directly to the farmer
- Keep language very simple — the advisor may translate to Ijaw, Yoruba, or pidgin
- Build a complete picture of this specific topic before moving on
- When you have enough information, end with the exact phrase: "✅ This topic is well characterised. You can move on."
- Never ask more than 6 questions on this one topic
- Draw on local context: cassava varieties, FAW, flooding, soil acidity, market access

FORMAT: One short question. After the advisor gives you the farmer's answer, probe deeper or confirm you have enough. Be direct, be brief, speak as if coaching in real time.

Start now with your FIRST question about: "${field.label}"`;
}

// ─── AI advice prompt ─────────────────────────────────────────────────────────

function buildAdvicePrompt(consultType: ConsultationType, client: Client, intake: Record<string, string>): string {
  const ct = CONSULT_TYPES[consultType];
  const cropList = client.crops.map(c => CROP_OPTIONS.find(o => o.value === c)?.label ?? c).join(', ') || 'mixed crops';
  const intakeSummary = INTAKE_FIELDS[consultType]
    .map(f => `${f.label}: ${intake[f.key]?.trim() || 'not provided'}`)
    .join('\n');

  // Detect danger conditions
  const allText = Object.values(intake).join(' ').toLowerCase();
  const aflatoxinRisk = consultType === 'post-harvest' && (allText.includes('mould') || allText.includes('mold') || allText.includes('musty') || allText.includes('aflatoxin') || allText.includes('damp maize') || allText.includes('wet maize'));
  const activeFlooding = consultType === 'soil-water' && (allText.includes('currently flooded') || allText.includes('actively flood') || allText.includes('water on field now') || allText.includes('standing crop') && allText.includes('flood'));
  const rapidSpread = consultType === 'pest-damage' && (allText.includes('whole village') || allText.includes('every farm') || allText.includes('spreading fast') || allText.includes('all neighbour'));

  let urgencyHint = '';
  if (aflatoxinRisk) urgencyHint = '\n🚨 AFLATOXIN RISK SUSPECTED — this is a food safety emergency. Open with URGENT. State clearly that mouldy maize must NOT be eaten or sold for human consumption.';
  else if (activeFlooding) urgencyHint = '\n🚨 ACTIVE FLOODING DESTROYING STANDING CROP — open with URGENT. Provide emergency salvage actions for the next 24–72 hours.';
  else if (rapidSpread) urgencyHint = '\n⚠️ APPARENT REGIONAL OUTBREAK — at minimum HIGH urgency. Recommend immediate ADP notification.';

  return `You are an expert agronomist and crop protection specialist supporting a youth agricultural advisor working directly with smallholder farmers in Oloibiri (Bayelsa State) and Ibiade (Ogun State), Nigeria.

${AGRICULTURE_CONTEXT}

CONSULTATION: ${ct.emoji} ${ct.label}
FARMER: ${client.farmer_name}, ${client.village}
CROPS GROWN: ${cropList}


STRUCTURED INTAKE COMPLETED BY YOUTH ADVISOR:
${intakeSummary}

YOUR TASK: Provide a complete, actionable advisory response based on this intake data.

STRUCTURE YOUR RESPONSE:
1. **URGENCY LEVEL**: State LOW / MEDIUM / HIGH / URGENT — and the single most important reason
2. **DIAGNOSIS / KEY FINDINGS**: What are the 2–4 most important things you see in this data? Name the likely disease, pest, or root cause where possible.
3. **IMMEDIATE ACTIONS**: What should the farmer do RIGHT NOW (step by step, prioritise free/low-cost actions first — wood ash, neem, roguing, drainage)
4. **MEDIUM-TERM PLAN**: What to do in the next 1–4 weeks
5. **REFERRAL** (if needed): Who to contact — ADP, NASC, IITA, NIRSAL — and exactly what to say
6. **WHAT NOT TO DO**: 1–2 common mistakes to avoid in this situation
7. **INCOME / YIELD ESTIMATE** (where relevant): Give a specific Naira calculation if this is post-harvest or market-input
8. **ONE ACTION TODAY**: End with one sentence — the single most important thing the farmer can do today, at zero cost

FORMAT:
- Short paragraphs and bullet points
- Specific and local — variety names (TMS, TME 419), Naira amounts, local references
- Plain language the advisor can read aloud to the farmer
${urgencyHint}

⚠️ DISCLAIMER: This is advisory support only. For crop disease outbreaks: contact ADP and IITA. For food safety emergencies (aflatoxin): the produce must NOT be sold or consumed. The youth advisor must use their own judgement and training.`;
}

// ─── Follow-up chat prompt ─────────────────────────────────────────────────────

function buildFollowupPrompt(client: Client, consultation: Consultation): string {
  const ct = CONSULT_TYPES[consultation.consultation_type];
  const uc = consultation.urgency_level ? URGENCY_CONFIG[consultation.urgency_level] : null;
  return `You are an agronomy and farm management expert supporting a youth agricultural advisor in Nigeria. The advisor has completed a structured consultation and has follow-up questions.

${AGRICULTURE_CONTEXT}

FARMER ON FILE: ${client.farmer_name}, ${client.village}
CONSULTATION TYPE: ${ct.emoji} ${ct.label}
URGENCY: ${uc ? uc.label : 'not assessed'}
PROBLEM SUMMARY: ${consultation.problem_summary}
AI ADVICE GIVEN: ${consultation.ai_advice ?? 'see consultation record'}

The advisor may ask follow-up questions about the advice, how to explain something to the farmer, referral logistics, or any practical agronomy / farm-management question related to this case.

Respond with practical, specific advice appropriate to this community context. Keep answers concise and actionable. Reference specific variety names (TMS series, TME 419, PITA), Naira amounts, and local extension contacts where relevant. Remind the advisor to contact ADP or IITA for anything outside your advisory scope.`;
}

// ─── Consultation type config ─────────────────────────────────────────────────

const CONSULT_TYPES: Record<ConsultationType, {
  label: string; emoji: string; colour: string;
  bgLight: string; border: string; textColour: string; description: string;
}> = {
  'crop-disease': { label: 'Crop Disease', emoji: '🦠', colour: 'from-red-600 to-orange-600', bgLight: 'bg-red-50', border: 'border-red-300', textColour: 'text-red-700', description: 'Identify and manage disease, virus, or nutrient deficiency in crops' },
  'pest-damage': { label: 'Pest Damage', emoji: '🐛', colour: 'from-orange-600 to-amber-600', bgLight: 'bg-orange-50', border: 'border-orange-300', textColour: 'text-orange-700', description: 'Diagnose pests like Fall Armyworm, mealybug, mites — recommend control' },
  'soil-water': { label: 'Soil & Water', emoji: '💧', colour: 'from-blue-600 to-teal-600', bgLight: 'bg-blue-50', border: 'border-blue-300', textColour: 'text-blue-700', description: 'Soil health, drainage, waterlogging, erosion, or flooding problems' },
  'post-harvest': { label: 'Post-Harvest', emoji: '🌾', colour: 'from-amber-600 to-yellow-600', bgLight: 'bg-amber-50', border: 'border-amber-300', textColour: 'text-amber-700', description: 'Reduce spoilage, storage, processing for better price, aflatoxin safety' },
  'market-input': { label: 'Market & Inputs', emoji: '💰', colour: 'from-green-600 to-emerald-600', bgLight: 'bg-green-50', border: 'border-green-300', textColour: 'text-green-700', description: 'Buyers, pricing strategy, input sourcing (seed, fertiliser, credit)' },
};

const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string; colour: string; bg: string; border: string; textDark: string; icon: React.ReactNode; description: string;
}> = {
  low:    { label: 'Low',    colour: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300',  textDark: 'text-green-800',  icon: <CheckCircle size={13}/>,    description: 'No immediate risk — plan medium-term improvements.' },
  medium: { label: 'Medium', colour: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-400', textDark: 'text-yellow-800', icon: <Clock size={13}/>,          description: 'Act this week — monitor and follow up in 2–7 days.' },
  high:   { label: 'High',   colour: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-400', textDark: 'text-orange-800', icon: <AlertTriangle size={13}/>,  description: 'Act today — losses or food safety risks are escalating.' },
  urgent: { label: 'URGENT', colour: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-400',    textDark: 'text-red-800',    icon: <AlertTriangle size={13}/>,  description: 'Stop harmful activity immediately and act now.' },
};

const CROP_OPTIONS: { value: CropType; label: string; emoji: string }[] = [
  { value: 'cassava',    label: 'Cassava',                          emoji: '🌿' },
  { value: 'maize',      label: 'Maize',                            emoji: '🌽' },
  { value: 'yam',        label: 'Yam',                              emoji: '🍠' },
  { value: 'plantain',   label: 'Plantain / Banana',                emoji: '🍌' },
  { value: 'vegetables', label: 'Vegetables (ugwu/okra/tomato)',    emoji: '🥬' },
  { value: 'cowpea',     label: 'Cowpea',                           emoji: '🫘' },
  { value: 'rice',       label: 'Rice',                             emoji: '🌾' },
  { value: 'cocoa',      label: 'Cocoa',                            emoji: '🍫' },
  { value: 'oil-palm',   label: 'Oil palm',                         emoji: '🌴' },
  { value: 'other',      label: 'Other',                            emoji: '🌱' },
];

const VILLAGES = ['Oloibiri', 'Ibiade', 'Otuabagi', 'Nembe', 'Ogbia', 'Yenagoa', 'Sagamu', 'Abeokuta', 'Other'];

// ─── Agriculture Background ───────────────────────────────────────────────────

const AgricultureBackground: React.FC = () => {
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
  const img = "url('/background_agriculture_consultant.webp')";
  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="agri-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="3" seed="13" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="60" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/70 via-lime-900/60 to-emerald-900/65" />
        <div className="absolute inset-0 bg-black/10" />
      </div>
      {moving && (
        <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 pointer-events-none" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1, filter: 'url(#agri-distortion)', WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`, maskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)` }}>
          <div className="absolute inset-0 bg-gradient-to-br from-green-900/70 via-lime-900/60 to-emerald-900/65" />
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

const InfoTooltip: React.FC<{ id: string; text: string; open: boolean; onToggle: () => void }> = ({ text, open, onToggle }) => (
  <div className="relative inline-block">
    <button onClick={onToggle} className="ml-1.5 text-lime-600 hover:text-lime-800 focus:outline-none" aria-label="More info">
      <Lightbulb size={13}/>
    </button>
    {open && (
      <div className="absolute z-50 left-0 top-6 w-64 bg-emerald-900 text-emerald-50 text-xs rounded-xl px-3 py-2.5 shadow-xl leading-relaxed">
        {text}
        <button onClick={onToggle} className="absolute top-1.5 right-2 text-emerald-300 hover:text-white"><X size={11}/></button>
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

// ─── RefreshCw icon (local) ───────────────────────────────────────────────────

const RefreshCw: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

// ─── Probe Panel ──────────────────────────────────────────────────────────────

interface ProbePanelProps {
  field: IntakeField;
  consultType: ConsultationType;
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
  field, consultType, messages, loading, done, input, onInputChange, onSend, onClose, chatEndRef
}) => {
  const ct = CONSULT_TYPES[consultType];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-2 pb-2">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b bg-emerald-50 rounded-t-2xl">
          <div>
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide">Field Interview Coach</p>
            <p className="text-sm font-bold text-emerald-900">Exploring: {field.label}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100">
            <X size={18}/>
          </button>
        </div>

        <div className="px-4 py-2 bg-emerald-900 text-emerald-100 text-xs flex items-start gap-2">
          <span className="text-base">💬</span>
          <span>Read each question aloud to the farmer. Type or speak their answer, then tap Send. The AI will ask follow-up questions until this topic is fully understood.</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ct.colour} flex items-center justify-center text-xs flex-shrink-0`}>{ct.emoji}</div>
              )}
              <div className={classNames('max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed',
                msg.role === 'user' ? 'bg-green-600 text-white rounded-tr-sm' : 'bg-emerald-50 text-emerald-900 rounded-tl-sm border border-emerald-100')}>
                {msg.role === 'assistant' && <p className="text-xs font-bold text-emerald-400 mb-1">AI Interview Coach</p>}
                {msg.role === 'user' && <p className="text-xs font-bold text-green-200 mb-1">Farmer's answer</p>}
                <MarkdownText text={msg.content}/>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-start gap-2">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ct.colour} flex items-center justify-center text-xs`}>{ct.emoji}</div>
              <div className="bg-emerald-50 rounded-2xl rounded-tl-sm px-3 py-2.5">
                <div className="flex gap-1 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
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
              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 whitespace-nowrap">
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

const AgricultureConsultantPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  // ── Navigation
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [consultationType, setConsultationType] = useState<ConsultationType | null>(null);

  // ── Data
  const [clients, setClients] = useState<Client[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingConsults, setLoadingConsults] = useState(false);

  // ── Add-client form
  const [newName, setNewName] = useState('');
  const [newVillage, setNewVillage] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCrops, setNewCrops] = useState<CropType[]>([]);
  const [newNotes, setNewNotes] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  // ── Structured intake
  const [intake, setIntake] = useState<Record<string, string>>({});
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [adviceResult, setAdviceResult] = useState<{ urgency: UrgencyLevel; text: string } | null>(null);
  const [advisorNotes, setAdvisorNotes] = useState('');
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

  // ── Tooltip
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  // ── Follow-up chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [speechOn, setSpeechOn] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin');

  // ── Community AI Challenge state ─────────────────────────────────────────
  const [availableChallenge, setAvailableChallenge] = useState<ActiveChallenge | null>(null);
  const [activeChallenge, setActiveChallenge]         = useState<ActiveChallenge | null>(null);
  const [challengeLoading, setChallengeLoading]       = useState(false);
  const [showChallengeReflect, setShowChallengeReflect] = useState(false);
  const [challengeReflect1, setChallengeReflect1]     = useState('');
  const [challengeReflect2, setChallengeReflect2]     = useState('');
  const [challengeReflect3, setChallengeReflect3]     = useState('');
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);
  const [challengeResult, setChallengeResult]         = useState<ChallengeEvalResult | null>(null);
  const [enrolling, setEnrolling]                     = useState(false);
  const [showOfflineModal, setShowOfflineModal]       = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // ─── Voice setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const speakBrowser = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 400));
    const voice = voiceMode === 'pidgin'
      ? (voices.find(v => v.lang === 'en-NG') || voices.find(v => v.lang === 'en-ZA') || voices.find(v => v.lang.startsWith('en')))
      : (voices.find(v => v.name === 'Google UK English Female') || voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en')));
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    utt.rate = 0.87; utt.pitch = 1.0;
    window.speechSynthesis.speak(utt);
  }, [voices, voiceMode]);

  const speak = useCallback((text: string) => {
    if (!speechOn) return;
    if (voiceMode === 'pidgin') {
      void playPidginVoice(text.slice(0, 400), {
        onError: (err) => {
          console.warn('[AgricultureConsultantPage] SpeechGen TTS failed, falling back to browser voice:', err);
          speakBrowser(text);
        },
      });
      return;
    }
    speakBrowser(text);
  }, [speechOn, voiceMode, speakBrowser]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isSending]);
  useEffect(() => { probeChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [probeMessages, probeLoading]);

  // ─── Load clients ─────────────────────────────────────────────────────────
  // ── Load active challenge for this page ─────────────────────────────────
  // If navigated from dashboard checkout, enrollment is passed via location.state
  // to avoid race condition. Otherwise, query the DB.
  useEffect(() => {
    if (!user?.id) return;

    // Fast path: dashboard passed enrollment directly via navigation state
    const navEnrollment = (location.state as any)?.challengeEnrollment;
    if (navEnrollment?.enrollmentId) {
      setActiveChallenge(navEnrollment);
      return;
    }

    // Slow path: query DB (handles direct navigation, page refresh, etc.)
    (async () => {
      setChallengeLoading(true);
      try {
        // Get learner's org to filter to the right challenge
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        // Map org UUID to slug via organizations table
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
          .eq('community_impact_slug', 'agriculture')
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
          status:               'submitted',
          submitted_at:         new Date().toISOString(),
          action_taken:         challengeReflect1.trim(),
          impact_observed:      challengeReflect2.trim(),
          extra_detail:         challengeReflect3.trim() || null,
          community_member_role: 'farmer',
        })
        .eq('id', activeChallenge.enrollmentId);

      const { data, error } = await supabase.functions.invoke('evaluate-challenge-submission', {
        body: { enrollment_id: activeChallenge.enrollmentId },
      });

      if (error) throw error;
      if (data?.impact_evaluation) setChallengeResult(data.impact_evaluation);
    } catch (err) {
      console.error('[AgricultureConsultantPage] challenge submit error:', err);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  const loadClients = useCallback(async () => {
    if (!user) return;
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('agriculture_farmer_summary')
        .select('*')
        .eq('youth_user_id', user.id)
        .order('farmer_name');
      if (!error && data) setClients(data as Client[]);
    } finally { setLoadingClients(false); }
  }, [user]);

  useEffect(() => { loadClients(); }, [loadClients]);

  // ─── Load consultations ───────────────────────────────────────────────────
  const loadConsultations = useCallback(async (clientId: string) => {
    setLoadingConsults(true);
    try {
      const { data, error } = await supabase
        .from('agriculture_consultations')
        .select('*')
        .eq('farmer_id', clientId)
        .order('created_at', { ascending: false });
      if (!error && data) setConsultations(data as Consultation[]);
    } finally { setLoadingConsults(false); }
  }, []);

  // ─── Open Probe Panel ─────────────────────────────────────────────────────
  const openProbe = useCallback(async (field: IntakeField) => {
    if (!selectedClient || !consultationType) return;
    setProbeField(field);
    setProbeMessages([]);
    setProbeInput('');
    setProbeDone(false);
    setProbeLoading(true);
    try {
      const systemPrompt = buildProbePrompt(field, consultationType, selectedClient, intake);
      const reply = await chatText({
        page: 'AgricultureConsultantPage',
        messages: [{ role: 'user', content: `Start probing: ${field.label}` }],
        system: systemPrompt,
        max_tokens: 600,
      });
      const isDone = reply.includes('✅ This topic is well characterised');
      setProbeDone(isDone);
      setProbeMessages([{ id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setProbeLoading(false); }
  }, [selectedClient, consultationType, intake]);

  // ─── Send probe reply ─────────────────────────────────────────────────────
  const sendProbeMessage = useCallback(async () => {
    if (!probeInput.trim() || probeLoading || !selectedClient || !probeField || !consultationType) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: probeInput.trim(), timestamp: new Date() };
    const updated = [...probeMessages, userMsg];
    setProbeMessages(updated);
    setProbeInput('');
    setProbeLoading(true);
    try {
      const systemPrompt = buildProbePrompt(probeField, consultationType, selectedClient, intake);
      const reply = await chatText({
        page: 'AgricultureConsultantPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 600,
      });
      const isDone = reply.includes('✅ This topic is well characterised');
      setProbeDone(isDone);
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      setProbeMessages(prev => [...prev, aiMsg]);
    } finally { setProbeLoading(false); }
  }, [probeInput, probeLoading, probeMessages, selectedClient, probeField, consultationType, intake]);

  // ─── Close probe and save notes to intake field ───────────────────────────
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

  // ─── Detect urgency from AI text ──────────────────────────────────────────
  const detectUrgency = (text: string): UrgencyLevel => {
    const upper = text.toUpperCase();
    if (upper.includes('URGENT')) return 'urgent';
    if (upper.includes('**HIGH**') || upper.includes('URGENCY: HIGH') || upper.includes('URGENCY LEVEL: HIGH')) return 'high';
    if (upper.includes('**MEDIUM**') || upper.includes('URGENCY: MEDIUM')) return 'medium';
    if (upper.includes('**LOW**') || upper.includes('URGENCY: LOW')) return 'low';
    return 'medium';
  };

  // ─── Generate AI advice ───────────────────────────────────────────────────
  const runAdvice = async () => {
    if (!selectedClient || !consultationType || isGeneratingAdvice) return;
    setIsGeneratingAdvice(true);
    try {
      const systemPrompt = buildAdvicePrompt(consultationType, selectedClient, intake);
      const reply = await chatText({
        page: 'AgricultureConsultantPage',
        messages: [{ role: 'user', content: 'Please analyse this intake and provide your advisory recommendation.' }],
        system: systemPrompt,
        max_tokens: 1500,
      });
      const urgency = detectUrgency(reply);
      setAdviceResult({ urgency, text: reply });
      speak(reply.slice(0, 300));
    } catch {
      setAdviceResult({ urgency: 'medium', text: 'Unable to generate advice. Please check the intake data and try again.' });
    } finally { setIsGeneratingAdvice(false); }
  };

  // ─── Save consultation ────────────────────────────────────────────────────
  const saveConsultation = async () => {
    if (!user || !selectedClient || !consultationType || !adviceResult) return;
    setSavingConsult(true);
    try {
      const fields = INTAKE_FIELDS[consultationType];
      const problemSummary = fields
        .filter(f => intake[f.key]?.trim())
        .map(f => `${f.label}: ${intake[f.key].trim()}`)
        .join(' | ');

      const conversationHistory: ChatMessage[] = [];

      const { data, error } = await supabase
        .from('agriculture_consultations')
        .insert({
          youth_user_id: user.id,
          farmer_id: selectedClient.id,
          consultation_type: consultationType,
          problem_summary: problemSummary || 'Structured intake consultation',
          ai_advice: adviceResult.text,
          urgency_level: adviceResult.urgency,
          youth_actions_taken: advisorNotes || null,
          conversation_history: conversationHistory,
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
        await loadClients();
        await loadConsultations(selectedClient.id);
      }
    } finally { setSavingConsult(false); }
  };

  // ─── Send follow-up message ───────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isSending || !selectedClient || !selectedConsultation) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: inputText.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);
    try {
      const history = [...messages, userMsg];
      const systemPrompt = buildFollowupPrompt(selectedClient, selectedConsultation);
      const reply = await chatText({
        page: 'AgricultureConsultantPage',
        messages: history.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 1200,
      });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const updated = [...history, aiMsg];
      setMessages(updated);
      speak(reply);
      await supabase
        .from('agriculture_consultations')
        .update({ conversation_history: updated })
        .eq('id', selectedConsultation.id);
    } catch {
      setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', content: 'Technical issue — please try again.', timestamp: new Date() }]);
    } finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [inputText, isSending, messages, selectedClient, selectedConsultation, speak]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ─── Voice input ──────────────────────────────────────────────────────────
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
  const startConsultation = (client: Client, type: ConsultationType) => {
    setSelectedClient(client);
    setConsultationType(type);
    setIntake({});
    setAdviceResult(null);
    setAdvisorNotes('');
    setFollowUpNeeded(false);
    setFollowUpDate('');
    setFollowUpNotes('');
    setConsultSaved(false);
    setSavedConsultId(null);
    setMode('new-consultation');
  };

  // ─── Open follow-up chat ──────────────────────────────────────────────────
  const openFollowupChat = (client: Client, consultation: Consultation) => {
    setSelectedClient(client);
    setSelectedConsultation(consultation);
    setMessages(consultation.conversation_history || []);
    setInputText('');
    setMode('followup-chat');
    if ((consultation.conversation_history || []).length === 0) {
      const ct = CONSULT_TYPES[consultation.consultation_type];
      const uc = consultation.urgency_level ? URGENCY_CONFIG[consultation.urgency_level] : null;
      const opener: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `Ready to help with follow-up questions for **${client.farmer_name}** (${ct.emoji} ${ct.label}${uc ? ` · **${uc.label}** urgency` : ''}).\n\nYou can ask me to explain the advice further, how to communicate it to the farmer in plain language, referral logistics (ADP, NASC, IITA), or any practical agronomy question related to this case.`,
        timestamp: new Date(),
      };
      setMessages([opener]);
    }
  };

  // ─── Save client ──────────────────────────────────────────────────────────
  const saveClient = async () => {
    if (!user || !newName.trim() || !newVillage) return;
    setSavingClient(true);
    try {
      const { error } = await supabase.from('agriculture_farmers').insert({
        youth_user_id: user.id,
        farmer_name: newName.trim(),
        village: newVillage,
        phone: newPhone || null,
        crops: newCrops,
        notes: newNotes || null,
      });
      if (!error) { await loadClients(); resetAddClient(); setMode('dashboard'); }
    } finally { setSavingClient(false); }
  };

  const resetAddClient = () => {
    setNewName(''); setNewVillage(''); setNewPhone('');
    setNewCrops([]); setNewNotes('');
  };

  const toggleCrop = (c: CropType) =>
    setNewCrops(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const markResolved = async (consultId: string) => {
    await supabase.from('agriculture_consultations').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', consultId);
    if (selectedClient) loadConsultations(selectedClient.id);
    await loadClients();
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  const intakeComplete = consultationType
    ? INTAKE_FIELDS[consultationType].filter(f => f.required).every(f => intake[f.key]?.trim())
    : false;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'dashboard') {
    return (
      <AppLayout>
        <AgricultureBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-2xl">🌿</div>
                <div>
                  <h1 className="text-xl font-bold text-white">Agriculture Advisor</h1>
                  <p className="text-sm text-green-200">Your farmer casebook · Oloibiri & Ibiade</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="Your farmer casebook · Oloibiri & Ibiade"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
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
                <button onClick={() => { resetAddClient(); setMode('add-client'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold text-sm hover:opacity-90">
                  <Plus size={16}/> Add Farmer
                </button>
              </div>
            </div>
          </div>

          {clients.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Farmers', value: clients.length, icon: '👨🏿‍🌾' },
                { label: 'Open Cases', value: clients.reduce((s, c) => s + (c.open_cases ?? 0), 0), icon: '📋' },
                { label: 'This Month', value: clients.filter(c => c.last_consultation_at && new Date(c.last_consultation_at) > new Date(Date.now() - 30*24*60*60*1000)).length, icon: '📅' },
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
            <div className="bg-emerald-900/80 backdrop-blur-sm border border-emerald-400/50 rounded-2xl p-5 mb-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-emerald-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide">Community AI Challenge — Active</span>
                    <span className="text-xs bg-emerald-400/20 text-emerald-200 px-2 py-0.5 rounded-full">{activeChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{activeChallenge.title}</p>
                  <p className="text-emerald-100 text-sm leading-relaxed mb-2">{activeChallenge.challenge_mode_intro}</p>
                  <div className="bg-emerald-800/60 rounded-xl p-3 mb-3">
                    <p className="text-xs font-bold text-emerald-300 mb-1">Your mission:</p>
                    <p className="text-emerald-100 text-sm">{activeChallenge.challenge_instruction}</p>
                  </div>
                  <button
                    onClick={() => setShowChallengeReflect(true)}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
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
                      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                        <Award size={32} className="text-emerald-600" />
                      </div>
                      <h2 className="text-2xl font-black text-gray-900">{challengeResult.tier_label}</h2>
                      <p className="text-sm text-emerald-600 font-bold uppercase tracking-wide mt-1">{challengeResult.tier} tier earned</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-emerald-800 mb-1">What you achieved</p>
                      <p className="text-sm text-emerald-700 leading-relaxed">{challengeResult.summary}</p>
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
                      className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide mb-0.5">Challenge Reflection</p>
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
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed"/>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_2}</label>
                        <textarea value={challengeReflect2} onChange={e => setChallengeReflect2(e.target.value)} rows={3}
                          placeholder="What happened…"
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed"/>
                      </div>
                      {activeChallenge.return_question_3 && (
                        <div>
                          <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_3}</label>
                          <textarea value={challengeReflect3} onChange={e => setChallengeReflect3(e.target.value)} rows={2}
                            placeholder="Additional details…"
                            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed"/>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSubmitChallengeReflection}
                      disabled={!challengeReflect1.trim() || !challengeReflect2.trim() || challengeSubmitting}
                      className="w-full mt-6 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
                    <h2 className="text-lg font-bold text-gray-900">Agriculture Advisor — Offline</h2>
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
                      The offline version works without internet. It runs the full crop and farm triage — disease, pest damage, soil and water, post-harvest, and market access — and saves consultations to your device for later sync.
                    </p>
                    <a
                      href="/offline-agriculture-advisor.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-sm hover:opacity-90 transition-opacity"
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
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
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
                      <li>• Complete required fields — especially crop type, problem description, and when it started</li>
                      <li>• Use the 💡 tip buttons for guidance on what each field is looking for</li>
                      <li>• <strong>Aflatoxin</strong> in post-harvest maize is an emergency — the advisor will flag it immediately</li>
                      <li>• <strong>Fall Armyworm</strong> outbreaks affecting multiple farms should be reported to the ADP extension officer</li>
                      <li>• The Consultation Record at the end can be read aloud to the farmer as a take-home action plan</li>
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

          {loadingClients ? (
            <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-green-300"/></div>
          ) : clients.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-10 text-center">
              <div className="text-5xl mb-4">🌾</div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">No farmers registered yet</h2>
              <p className="text-sm text-gray-500 mb-5">Add your first farmer client to start your casebook.</p>
              <button onClick={() => { resetAddClient(); setMode('add-client'); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold hover:opacity-90">
                <Plus size={16}/> Register First Farmer
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map(client => (
                <button key={client.id}
                  onClick={() => { setSelectedClient(client); loadConsultations(client.id); setMode('client-detail'); }}
                  className="w-full bg-white/90 backdrop-blur-sm rounded-2xl p-4 text-left hover:bg-white transition-colors border border-transparent hover:border-green-300">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center text-lg">👨🏿‍🌾</div>
                      <div>
                        <p className="font-bold text-gray-900">{client.farmer_name}</p>
                        <p className="text-sm text-gray-500">{client.village}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(client.crops || []).map(c => {
                            const opt = CROP_OPTIONS.find(o => o.value === c);
                            return opt ? (
                              <span key={c} className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">{opt.emoji} {opt.label}</span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <ChevronRight size={17} className="text-gray-400"/>
                      {(client.open_cases ?? 0) > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">{client.open_cases} open</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>{client.total_consultations ?? 0} consultation{client.total_consultations !== 1 ? 's' : ''}</span>
                    {client.last_consultation_at && <span>Last: {formatDate(client.last_consultation_at)}</span>}
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
  // RENDER: ADD CLIENT
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'add-client') {
    return (
      <AppLayout>
        <AgricultureBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div><h2 className="text-xl font-bold text-gray-900">Register Farmer</h2><p className="text-sm text-gray-500">Add to your casebook</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Farmer Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Mama Ebiere Okoro"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Village *</label>
                <select value={newVillage} onChange={e => setNewVillage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-base bg-white">
                  <option value="">Select village…</option>
                  {VILLAGES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone (optional)</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+234 801 234 5678"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Crops grown (select all that apply)</label>
                <div className="grid grid-cols-2 gap-2">
                  {CROP_OPTIONS.map(opt => (
                    <label key={opt.value} className={classNames('flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
                      newCrops.includes(opt.value) ? 'bg-green-50 border-green-400' : 'border-gray-200 hover:border-gray-300')}>
                      <input type="checkbox" checked={newCrops.includes(opt.value)} onChange={() => toggleCrop(opt.value)} className="accent-green-600"/>
                      <span className="text-lg">{opt.emoji}</span>
                      <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
                  placeholder="Past problems, soil type, special concerns, flooding history…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-sm resize-none"/>
              </div>
              <button onClick={saveClient} disabled={!newName.trim() || !newVillage || savingClient}
                className={classNames('w-full py-3.5 rounded-xl font-bold text-white text-base transition-opacity',
                  newName.trim() && newVillage && !savingClient ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90' : 'bg-gray-300 cursor-not-allowed')}>
                {savingClient ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>Saving…</span> : 'Register Farmer'}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: CLIENT DETAIL
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'client-detail' && selectedClient) {
    const client = selectedClient;
    return (
      <AppLayout>
        <AgricultureBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center text-2xl">👨🏿‍🌾</div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{client.farmer_name}</h2>
                <p className="text-sm text-gray-500">{client.village}{client.phone ? ` · ${client.phone}` : ''}</p>
              </div>
            </div>

            {(client.crops || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {client.crops.map(c => {
                  const opt = CROP_OPTIONS.find(o => o.value === c);
                  return opt ? (
                    <div key={c} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border bg-green-50 border-green-300 text-green-700">
                      {opt.emoji} {opt.label}
                    </div>
                  ) : null;
                })}
              </div>
            )}

            {client.notes && <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg px-3 py-2 mb-4">{client.notes}</p>}

            <p className="text-sm font-bold text-gray-700 mb-3">Start new consultation:</p>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(CONSULT_TYPES) as [ConsultationType, typeof CONSULT_TYPES[ConsultationType]][]).map(([key, ct]) => (
                <button key={key} onClick={() => startConsultation(client, key)}
                  className={classNames('flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-white text-sm bg-gradient-to-r hover:opacity-90 transition-opacity text-left', ct.colour)}>
                  <span className="text-xl flex-shrink-0">{ct.emoji}</span>
                  <div>
                    <div>{ct.label}</div>
                    <div className="text-xs font-normal opacity-80">{ct.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Case history */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList size={16} className="text-green-600"/> Case History
              </h3>
              <button onClick={() => loadConsultations(client.id)} className="text-gray-400 hover:text-gray-700"><RefreshCw size={14}/></button>
            </div>
            {loadingConsults ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-green-600"/></div>
            ) : consultations.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">No consultations yet.</p>
            ) : (
              <div className="space-y-3">
                {consultations.map(c => {
                  const ct = CONSULT_TYPES[c.consultation_type];
                  return (
                    <div key={c.id} className="border border-gray-200 rounded-xl p-4 hover:border-green-300 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{ct.emoji}</span>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{ct.label}</p>
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
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{c.problem_summary}</p>
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
                        <button onClick={() => openFollowupChat(client, c)}
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
  // RENDER: NEW CONSULTATION — STRUCTURED INTAKE + AI ADVICE
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'new-consultation' && selectedClient && consultationType) {
    const ct = CONSULT_TYPES[consultationType];
    const fields = INTAKE_FIELDS[consultationType];

    // Danger banners
    const allText = Object.values(intake).join(' ').toLowerCase();
    const aflatoxinAlert = consultationType === 'post-harvest' && (allText.includes('mould') || allText.includes('mold') || allText.includes('musty'));
    const floodAlert = consultationType === 'soil-water' && (allText.includes('currently flooded') || allText.includes('actively flood') || (allText.includes('standing crop') && allText.includes('flood')));
    const spreadAlert = consultationType === 'pest-damage' && (allText.includes('whole village') || allText.includes('every farm') || allText.includes('all neighbour'));

    return (
      <AppLayout>
        <AgricultureBackground />

        {probeField && (
          <ProbePanel
            field={probeField}
            consultType={consultationType}
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
              <button onClick={() => setMode('client-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-xl`}>{ct.emoji}</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{ct.label}</h2>
                <p className="text-xs text-gray-500">{selectedClient.farmer_name} · {selectedClient.village}</p>
              </div>
            </div>
          </div>

          {/* Danger banners */}
          {aflatoxinAlert && (
            <div className="bg-red-600 text-white rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold">🚨 AFLATOXIN RISK — FOOD SAFETY EMERGENCY</p>
                <p className="text-sm opacity-90">Mouldy or musty maize/grain may contain aflatoxin (cancer-causing toxin). Do NOT sell or eat. Document carefully — this is a serious health matter.</p>
              </div>
            </div>
          )}
          {floodAlert && (
            <div className="bg-red-600 text-white rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold">🚨 ACTIVE FLOODING — STANDING CROP AT RISK</p>
                <p className="text-sm opacity-90">Crops can be lost in 24–72 hours of waterlogging. Generate AI Advice immediately — emergency salvage actions required today.</p>
              </div>
            </div>
          )}
          {spreadAlert && (
            <div className="bg-orange-600 text-white rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold">⚠️ APPARENT REGIONAL OUTBREAK</p>
                <p className="text-sm opacity-90">A pest spreading across multiple farms may be a migratory or epidemic outbreak. Notify ADP after generating advice.</p>
              </div>
            </div>
          )}

          {/* Intake instructions */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <Lightbulb size={14} className="text-green-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-700">
              Fill in each field with what the farmer tells you. Tap <strong>🔍 Probe</strong> to get AI-guided interview questions for that topic — the AI will coach you to ask exactly the right follow-up questions, one at a time. When done, run AI Advice.
            </p>
          </div>

          {/* Structured intake fields */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
              <FileText size={15} className="text-green-600"/> Intake — {ct.label}
            </h3>
            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
              <span className="text-emerald-600 font-bold">🔍 Probe</span> — tap after filling a field to go deeper with AI interview coaching
            </p>
            <div className="space-y-4">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                    {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
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
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <button
                      onClick={() => openProbe(field)}
                      className={classNames(
                        'px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex-shrink-0 self-start mt-0.5',
                        probeField?.key === field.key
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                      )}
                    >
                      {probeField?.key === field.key ? '🔍 Probing…' : '🔍 Probe'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Advice section */}
          {!adviceResult ? (
            <button
              onClick={runAdvice}
              disabled={isGeneratingAdvice || !intakeComplete}
              className={classNames(
                'w-full py-4 rounded-xl font-bold text-white text-base transition-opacity flex items-center justify-center gap-2',
                !isGeneratingAdvice && intakeComplete
                  ? `bg-gradient-to-r ${ct.colour} hover:opacity-90`
                  : 'bg-gray-300 cursor-not-allowed'
              )}
            >
              {isGeneratingAdvice
                ? <><Loader2 size={18} className="animate-spin"/>Generating AI Advice…</>
                : <><Sprout size={18}/>Generate AI Advice{!intakeComplete && ' (fill required fields first)'}</>}
            </button>
          ) : (
            <div className={classNames('bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5 border-2', URGENCY_CONFIG[adviceResult.urgency].border)}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Advisory Result</p>
                  <div className="text-2xl font-black"><UrgencyBadge level={adviceResult.urgency}/></div>
                  <p className="text-xs text-gray-500 mt-1">{URGENCY_CONFIG[adviceResult.urgency].description}</p>
                </div>
                <button onClick={() => { setAdviceResult(null); runAdvice(); }}
                  className="text-xs text-green-600 hover:underline flex items-center gap-1">
                  <RefreshCw size={12}/> Re-run
                </button>
              </div>
              <div className="text-sm text-gray-800 bg-gray-50 rounded-xl px-4 py-3 max-h-72 overflow-y-auto">
                <MarkdownText text={adviceResult.text}/>
              </div>

              {/* Save section */}
              <div className="mt-4 space-y-3 border-t pt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">What did you advise / do on the ground?</label>
                  <textarea value={advisorNotes} onChange={e => setAdvisorNotes(e.target.value)} rows={2}
                    placeholder="e.g. Showed farmer how to rogue infected cassava plants. Recommended TMS cuttings from ADP. Demonstrated wood-ash application for FAW."
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
                      <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Check if FAW spread was stopped"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"/>
                    </div>
                  </div>
                )}

                {consultSaved ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 font-semibold text-sm bg-green-50 rounded-xl px-4 py-3">
                      <CheckCircle size={16}/> Case saved to {selectedClient.farmer_name}'s record.
                    </div>
                    {/* Challenge nudge — shown after save when challenge is active */}
                    {activeChallenge && (
                      <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3 flex items-start gap-2">
                        <Award size={16} className="text-emerald-600 flex-shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-emerald-800 mb-1">Community AI Challenge active</p>
                          <p className="text-xs text-emerald-700 mb-2">You completed a consultation — did you also go out and complete your challenge mission? Submit your reflection to earn your tier.</p>
                          <button
                            onClick={() => setShowChallengeReflect(true)}
                            className="text-xs font-bold text-emerald-700 underline hover:text-emerald-900"
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
                            farmer_id: selectedClient.id,
                            youth_user_id: user?.id ?? '',
                            consultation_type: consultationType,
                            problem_summary: '',
                            ai_advice: adviceResult.text,
                            urgency_level: adviceResult.urgency,
                            youth_actions_taken: advisorNotes || null,
                            conversation_history: [],
                            follow_up_needed: followUpNeeded,
                            follow_up_date: followUpDate || null,
                            follow_up_notes: followUpNotes || null,
                            resolved: false,
                            resolved_at: null,
                            created_at: new Date().toISOString(),
                          } as Consultation;
                          openFollowupChat(selectedClient, saved);
                        }}
                        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:opacity-90 flex items-center justify-center gap-2"
                      >
                        <Send size={16}/> Continue with AI Follow-up Chat
                      </button>
                    )}
                  </div>
                ) : (
                  <button onClick={saveConsultation} disabled={savingConsult}
                    className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90 disabled:opacity-50">
                    {savingConsult ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin"/>Saving…</span> : 'Save Case Record'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck size={14} className="text-green-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-600">This AI advice is <strong>agricultural support only</strong>. For crop disease outbreaks or food safety emergencies (aflatoxin, mass crop death), contact your local <strong>ADP office</strong> or <strong>IITA</strong> immediately. The youth advisor must use their own judgement and training.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: FOLLOW-UP CHAT
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'followup-chat' && selectedClient && selectedConsultation) {
    const client = selectedClient;
    const consult = selectedConsultation;
    const ct = CONSULT_TYPES[consult.consultation_type];
    const userTurns = messages.filter(m => m.role === 'user').length;

    return (
      <AppLayout>
        <AgricultureBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setMode('client-detail'); }} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-lg`}>{ct.emoji}</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Follow-up Questions</h2>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                    <span>{client.farmer_name} · {ct.label}</span>
                    {consult.urgency_level && <UrgencyBadge level={consult.urgency_level}/>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  {(['pidgin', 'english'] as const).map(m => (
                    <button key={m} onClick={() => setVoiceMode(m)}
                      className={`px-2.5 py-1.5 text-xs font-bold border-r border-gray-300 last:border-0 transition-all ${voiceMode===m?(m==='english'?'bg-blue-600 text-white':'bg-green-600 text-white'):'bg-white text-gray-500'}`}>
                      {m==='english'?'🇬🇧':'🇳🇬'}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setSpeechOn(s => !s); if (speechOn) { window.speechSynthesis.cancel(); stopPidginSpeech(); } }}
                  className={classNames('p-2 rounded-lg', speechOn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400')}>
                  {speechOn ? <Volume2 size={15}/> : <VolumeX size={15}/>}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <Lightbulb size={14} className="text-green-700 flex-shrink-0"/>
            <p className="text-xs text-gray-700">Ask about the advice, how to explain it to the farmer in plain language, referral logistics (ADP, NASC, IITA), or any practical agronomy question related to this case.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: '460px' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl text-xs text-gray-500">
              <span className="font-semibold text-gray-700 flex items-center gap-1.5">{ct.emoji} Agriculture AI Advisor</span>
              <span>{userTurns} exchange{userTurns !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-lg`}>{ct.emoji}</div>
                  )}
                  <div className={classNames('max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user' ? 'bg-green-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant' && <p className="text-xs font-bold mb-1 opacity-50">AI Agriculture Advisor</p>}
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
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-lg`}>{ct.emoji}</div>
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
                      inputText.trim() && !isSending ? `bg-gradient-to-br ${ct.colour} text-white hover:opacity-90` : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
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

  if (mode === 'case-detail' && selectedConsultation && selectedClient) {
    const c = selectedConsultation;
    const ct = CONSULT_TYPES[c.consultation_type];
    return (
      <AppLayout>
        <AgricultureBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('client-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-2xl`}>{ct.emoji}</div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900">{ct.label} — {selectedClient.farmer_name}</h2>
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
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Problem Summary</p>
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-line">{c.problem_summary}</p>
              </div>
              {c.ai_advice && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Recommendation</p>
                  <div className={classNames('text-sm text-gray-800 rounded-lg px-3 py-2 max-h-48 overflow-y-auto border',
                    c.urgency_level ? URGENCY_CONFIG[c.urgency_level].bg : 'bg-gray-50',
                    c.urgency_level ? URGENCY_CONFIG[c.urgency_level].border : 'border-gray-200')}>
                    <MarkdownText text={c.ai_advice}/>
                  </div>
                </div>
              )}
              {c.youth_actions_taken && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Actions Taken by Advisor</p>
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
                <button onClick={() => openFollowupChat(selectedClient, c)}
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-green-50 text-green-700 hover:bg-green-100">
                  Ask AI Follow-up
                </button>
                {!c.resolved && (
                  <button onClick={async () => { await markResolved(c.id); setSelectedConsultation({ ...c, resolved: true }); }}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90">
                    Mark Resolved ✓
                  </button>
                )}
              </div>
            </div>
          </div>

          {c.conversation_history?.length > 0 && (
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText size={14} className="text-green-600"/> Follow-up Chat Transcript
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {c.conversation_history.map((msg, i) => (
                  <div key={i} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className={`flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br ${ct.colour} flex items-center justify-center text-sm`}>{ct.emoji}</div>
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

          {/* Disclaimer */}
          <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck size={14} className="text-green-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-600">This AI advice is <strong>agricultural support only</strong>. For crop disease outbreaks or food safety emergencies, contact your local <strong>ADP office</strong> or <strong>IITA</strong> immediately.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return null;
};

export default AgricultureConsultantPage;