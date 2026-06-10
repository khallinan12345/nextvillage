// src/pages/community-impact/FishingConsultantPage.tsx
//
// Fishing Advisor — Community Impact Track
// A professional casebook tool for youth fishing advisors serving fishers,
// fish farmers, and fish traders in Oloibiri (Bayelsa State) and surrounding
// Niger Delta communities.
//
// MODELED ON: HealthcareNavigatorPage.tsx
// The youth advisor sits with a client and runs a STRUCTURED intake interview,
// guided step-by-step by AI coaching questions (Probe Panel). Once the problem
// is fully characterised, AI generates a detailed recommendation. The advisor
// and client can then continue in a follow-up chat mode. Every exchange is a
// learning moment for the youth advisor.
//
// DB tables: fishing_clients
//            fishing_consultations
//            fishing_open_followups (view — UNRESTRICTED)
//
// Route: /community-impact/fishing
// Activity: fishing_advisor
//
// KEY PATTERNS FROM HEALTHCARE NAVIGATOR:
// - Structured intake form with AI-powered "Probe" buttons per field
// - ProbePanel modal: coaches youth to ask exactly the right questions one at a time
// - AI advice generated only after intake is complete
// - Follow-up chat mode after case is saved
// - All conversation history persisted to DB

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { chatText } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import {
  Fish, ArrowLeft, Send, Save, Loader2, Plus, User,
  FileText, AlertTriangle, CheckCircle, Clock, ChevronRight,
  ClipboardList, RefreshCw, Calendar, Mic, MicOff,
  Volume2, VolumeX, X, Lightbulb, Waves, Scale, Droplets,
  Anchor, ShieldCheck, AlertCircle, Award,
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
  | 'catch-problem'
  | 'aquaculture'
  | 'processing-market'
  | 'oil-contamination'
  | 'climate-safety';

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

type ActivityType =
  | 'wild-fishing'
  | 'aquaculture'
  | 'fish-trading'
  | 'fish-processing'
  | 'shellfish-gathering';

interface Client {
  id: string;
  youth_user_id: string;
  client_name: string;
  village: string;
  phone: string | null;
  activities: ActivityType[];
  waterways: string[];
  notes: string | null;
  created_at: string;
  total_consultations?: number;
  open_cases?: number;
  last_consultation_at?: string | null;
}

interface Consultation {
  id: string;
  client_id: string;
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
// Each consultation type has its own intake fields, analogous to the health
// assessment vitals/symptoms. Probe buttons let AI coach the advisor in real time.

interface IntakeField {
  key: string;
  label: string;
  placeholder: string;
  tooltip: string;
  required?: boolean;
}

const INTAKE_FIELDS: Record<ConsultationType, IntakeField[]> = {
  'catch-problem': [
    { key: 'target_species', label: 'Species targeted', placeholder: 'e.g. catfish, bonga, tilapia, shrimp', tooltip: 'Knowing the target species tells us if the problem is species-specific (contamination, habitat) or general (wrong technique, season change).', required: true },
    { key: 'gear_used', label: 'Gear used', placeholder: 'e.g. gill net (3-inch mesh), cast net, long-line, drum trap', tooltip: 'Gear type and mesh size determine which fish you can catch. Wrong mesh = wrong fish. Old nets = torn mesh = escaping fish.', required: true },
    { key: 'waterway', label: 'Waterway / fishing location', placeholder: 'e.g. Kolo Creek near the pipeline crossing, River Nun at Otuabagi bend', tooltip: 'Exact location helps identify contamination risk, seasonal fish movement patterns, and whether the area is overfished.', required: true },
    { key: 'fishing_time', label: 'When they fish', placeholder: 'e.g. night (6pm–6am), dawn, dry season only', tooltip: 'Catfish feed at night. Mullet school at dawn. Fishing at the wrong time can explain poor catches even with good gear.', required: true },
    { key: 'catch_change', label: 'How catches have changed', placeholder: 'e.g. dropped suddenly 3 weeks ago, gradually declining for 2 years, certain species disappeared', tooltip: 'Sudden decline = spill or seasonal event. Gradual = long-term habitat damage or overfishing. This shapes everything.', required: true },
    { key: 'water_condition', label: 'Water appearance and smell', placeholder: 'e.g. oily sheen, petroleum smell, normal, dark/black sediment, floating dead fish', tooltip: 'Oil contamination shows as an iridescent sheen, petroleum smell, dead fish. Black sediment near pipelines = historic contamination.' },
  ],
  'aquaculture': [
    { key: 'pond_status', label: 'Existing pond or planning to start?', placeholder: 'e.g. existing pond (1 year old, 100m²), or planning new pond', tooltip: 'Guides everything — existing pond = diagnose problems; new pond = site selection, construction, stocking advice.', required: true },
    { key: 'species', label: 'Species in pond (or planned)', placeholder: 'e.g. catfish (Clarias), tilapia, or mix', tooltip: 'Catfish (Clarias gariepinus) is the best choice — tolerates low oxygen, grows fast (500–800g in 5–6 months). Tilapia is simpler to start but breeds fast — must manage males.', required: true },
    { key: 'pond_size', label: 'Pond size and depth', placeholder: 'e.g. 10m × 10m (100m²), about 1.2m deep', tooltip: 'Minimum 100m² for viable production. 1–1.5m deep. Shallower = temperature stress; deeper = oxygen problems at bottom.' },
    { key: 'stocking', label: 'Number of fish stocked', placeholder: 'e.g. 200 catfish fingerlings from NIOMR Yenagoa', tooltip: '100–200 catfish per 100m² is optimal. Overstocking is the #1 cause of poor growth and disease. Fingerlings from NIOMR or ADP hatcheries in Yenagoa.' },
    { key: 'main_problem', label: 'Main problem being experienced', placeholder: 'e.g. fish gasping at surface, not eating, skin ulcers, slow growth, fish dying, pond flooding', tooltip: 'Fish gasping at surface = low oxygen → change water NOW. Ulcers/fin rot = bacterial infection from poor water quality. Slow growth = overfeeding, overcrowding, or wrong feed.', required: true },
    { key: 'water_management', label: 'How they manage water quality', placeholder: 'e.g. change 30% weekly, never change it, add freshwater when low', tooltip: 'Water quality is the most common cause of pond problems. Change 30% of pond water weekly. Never let latrine or fertiliser runoff reach the pond.' },
  ],
  'processing-market': [
    { key: 'species_volume', label: 'Species and quantity available', placeholder: 'e.g. 50kg catfish, 200kg bonga, 10kg shrimp', tooltip: 'Volume determines which markets are accessible. Shrimp must sell immediately — no storage. Catfish can be smoked for 2–6 weeks of shelf life.', required: true },
    { key: 'current_method', label: 'Current processing and selling method', placeholder: 'e.g. selling fresh at local market, smoking with palm kernel shell kiln, sun-drying', tooltip: 'Selling fresh = lowest price, highest spoilage risk. Smoking = 40–80% higher value, 2–6 week shelf life. This gap is the biggest income lever.', required: true },
    { key: 'current_price', label: 'Price currently getting per kg', placeholder: 'e.g. ₦1,800/kg fresh catfish from local trader', tooltip: 'Comparing to market prices reveals if the client is being underpaid. Middlemen pay 40–60% of final market value. We can calculate the gap.' },
    { key: 'selling_to', label: 'Who they sell to and where', placeholder: 'e.g. to a middleman who comes to the village, at Yenagoa market directly', tooltip: 'Selling directly to market women or consumers adds 40–100% more income than selling to middlemen. Knowing this shapes the best strategy.' },
    { key: 'storage_access', label: 'Storage and preservation available', placeholder: 'e.g. traditional kiln, no kiln, cold storage (rare), dried on racks', tooltip: 'Without cold storage, speed and smoking/drying are the only preservation options. A functional kiln changes the income equation completely.' },
    { key: 'main_challenge', label: 'Biggest challenge', placeholder: 'e.g. fish spoiling before sold, getting too low price, can\'t reach Yenagoa market, no kiln', tooltip: 'The specific bottleneck tells us where to focus. Spoilage = processing method. Low price = market access or collective selling. Isolation = transport or WhatsApp trader networks.', required: true },
  ],
  'oil-contamination': [
    { key: 'location', label: 'Exact location of suspected contamination', placeholder: 'e.g. Kolo Creek stretch between the pipeline crossing and the old SPDC manifold', tooltip: 'Exact location helps identify responsible pipeline operator, proximity to infrastructure, and whether this is a known spill. Be as specific as possible — it matters for legal claims.', required: true },
    { key: 'visual_signs', label: 'What they can see on the water and fish', placeholder: 'e.g. oily rainbow sheen, dead fish floating, petroleum smell, black oily sediment on banks', tooltip: 'Rainbow/iridescent sheen = hydrocarbon contamination. Dead fish = acute toxicity event. Petroleum smell = active leak. Black sediment near pipelines = historic chronic contamination.', required: true },
    { key: 'catch_impact', label: 'Impact on catches', placeholder: 'e.g. no fish for 2 weeks, fish have unusual taste/smell, catches dropped 80%', tooltip: 'Sudden collapse = acute spill. Gradual decline = chronic contamination. Fish with unusual smell should NOT be eaten — hydrocarbons accumulate in flesh.', required: true },
    { key: 'health_symptoms', label: 'Any health symptoms from water contact', placeholder: 'e.g. skin rash, eye irritation, headaches after fishing in the creek', tooltip: 'Hydrocarbon exposure through skin contact causes rashes, eye irritation, and respiratory issues. This is a serious health matter — document all symptoms for the NOSDRA report.' },
    { key: 'timeline', label: 'When this started and any known incident', placeholder: 'e.g. started 3 weeks ago, heard a pipeline burst near Otuabagi, or no known incident', tooltip: 'Timeline helps establish causation for compensation claims. Pipeline burst = operator liability. Chronic leaking = also operator liability. Document everything from the first day noticed.' },
    { key: 'documentation', label: 'Documentation gathered so far', placeholder: 'e.g. photos with dates, GPS location saved on phone, names of witnesses', tooltip: 'Photos, dates, GPS coordinates, and witness names are the foundation of any compensation claim. Without documentation, claims fail. We can guide on what to gather.' },
  ],
  'climate-safety': [
    { key: 'waterways_used', label: 'Waterways and open water they fish on', placeholder: 'e.g. Kolo Creek (narrow), River Nun (open water), coastal creeks near Brass', tooltip: 'Open wide rivers carry much higher capsize risk than narrow creeks. Risk assessment depends on where they fish.', required: true },
    { key: 'current_season', label: 'Current season and recent weather', placeholder: 'e.g. early wet season, heavy rain yesterday, dry season ending late', tooltip: 'Traditional fishing calendars are shifting — dry season 2–4 weeks later than 20 years ago, wet season more intense. Local knowledge may be unreliable now.', required: true },
    { key: 'changes_noticed', label: 'Changes they have noticed over recent years', placeholder: 'e.g. floods worse than before, fish harder to find in usual dry-season spots, seasons unpredictable', tooltip: 'Local observation of change is valuable data. It helps us understand what is shifting and tailor adaptation advice to their actual situation.' },
    { key: 'safety_equipment', label: 'Safety equipment on canoe', placeholder: 'e.g. nothing, one life jacket, a rope, a bailing container', tooltip: 'A plastic container tied to rope as a flotation aid is better than nothing. Life jackets are rare but critical. Knowing current safety equipment shapes the safety advice.', required: true },
    { key: 'flood_risk', label: 'Fish pond location and flood exposure (if applicable)', placeholder: 'e.g. pond on low ground near creek, flooded in 2022, on higher ground', tooltip: 'The 2022 floods submerged 300+ Bayelsa communities and destroyed thousands of fish ponds. Elevated bunds (50–80cm above flood level) are the critical mitigation.' },
    { key: 'main_concern', label: 'Main concern or question', placeholder: 'e.g. worried about fishing in rainy season, pond keeps flooding, catches very unpredictable', tooltip: 'The most urgent concern shapes where we start. Safety first — if they describe dangerous conditions, we address that before anything else.', required: true },
  ],
};

// ─── Niger Delta Fishing Knowledge Base ───────────────────────────────────────

const NIGER_DELTA_FISHING_CONTEXT = `
NIGER DELTA / OLOIBIRI FISHING CONTEXT — always apply this knowledge:

WATERWAYS & GEOGRAPHY:
- Oloibiri sits in Ogbia LGA, Bayelsa State — surrounded by creeks, rivers, and mangrove swamps
- Key waterways: Kolo Creek (sacred to Ogbia/Ijaw people), River Nun (major river),
  Taylor Creek, Ekole River, San Bartholomew River, Brass River, Ikebiri Creek
- Over 200 fish species recorded in Bayelsa State waters
- ~2,370 km² of flowing freshwater + ~8,600 km² of swampland
- Tidal influence in lower creeks near coast; affects best fishing times
- Wet season: April–November (heavy rains, flooding, higher water, fish dispersed)
- Dry season: December–March (lower water, fish concentrated in deeper pools — often best catches)

FISH SPECIES (local names + commercial importance):
FRESHWATER — rivers and creeks like Kolo Creek:
- Catfish / "Eja aro" — Clarias gariepinus: most important commercial species; grows fast
  (fingerling to 500–800g in 5–6 months in ponds); tolerates low oxygen; top aquaculture species
- Tilapia / "Eja pupa" — Oreochromis niloticus: second most important; hardy; prolifically breeding;
  ideal for pond farming; prefers shallow warm water
- Chrysichthys (bagrid catfish / "Oporo") — Chrysichthys nigrodigitatus: bottom-dwelling;
  premium eating quality; highest wild market value; declining due to oil contamination
- Bonga / "Shawa" — Ethmalosa fimbriata: most abundant estuarine species; very affordable protein;
  important for smoking/drying; sells well dried in markets up to Lagos

ESTUARINE & COASTAL — lower creeks, mangroves:
- Croaker / "Eja dudu" — Pseudotolithus spp.: high-value white fish; popular in city markets
- Mullet — Mugil cephalus: schooling fish; cast nets at dawn; good fresh price
- Shrimp / "Ẹja okun kekere": highest value per kg (₦4,000–8,000/kg); seasonal; hand-gathered

SHELLFISH & INVERTEBRATES — important women's livelihoods:
- Periwinkle / "Isawuru" — Tympanotonus fuscatus: common in mangrove mudflats; women and children
  gather by hand; ₦1,000–2,500/kg in Yenagoa/Port Harcourt markets
- Clams / "Isami" — Egeria radiata: freshwater clam; important food and income;
  found in creek beds; WARNING — heavy metal contamination risk near oil infrastructure
- Oysters: attached to mangrove roots; hand-gathered; important for women's income

FISHING GEAR (what local fishers actually use):
- Cast nets: used from canoe or bank; good for mullet, tilapia, small bonga
- Gill nets: set across channels; most versatile; mesh size critical (2.5–5 inch for different species)
- Drift nets: carried by current; good for open-water bonga and croaker
- Dugout canoes: primary vessel; paddle or small outboard motor
- Round/drum traps: passive; set overnight in channels for catfish and Chrysichthys
- Long-lines with hooks: set overnight; large catfish and Labeo

OIL CONTAMINATION — CRITICAL FOR OLOIBIRI:
- Oloibiri was Nigeria's first oil field (1956); decades of spills have contaminated waterways
- Oil on water: blocks oxygen exchange → fish suffocate in heavy spills
- Contaminated water: carcinogenic hydrocarbons accumulate in fish flesh — serious health risk
- Contaminated sediment: clams and periwinkle absorb heavy metals from polluted mud
- Signs: oily sheen on creek surface, dead fish floating, petroleum smell, dark/black sediment
  near pipeline crossings, stunted mangrove vegetation nearby
- FOOD SAFETY: Fish from heavily contaminated stretches should NOT be eaten — be honest
- LEGAL RIGHTS: Report spills to NOSDRA (0800-NOSDRA-9); document with photos, dates,
  GPS location, and catch records for compensation claims
- Recovery timeline: after a spill is cleaned, 18–36 months before fish populations return significantly

AQUACULTURE — KEY OPPORTUNITY:
- Pond catfish farming (Clarias gariepinus) is the highest-income aquaculture option
- Simple earthen pond (10m × 10m = 100m²): dig 1–1.5m deep; fill with freshwater
- Fingerlings: available from hatcheries in Yenagoa (NIOMR, ADP) — cost ~₦50–80 each
- Feed: commercial catfish pellets (₦8,000–15,000/bag) supplemented with kitchen waste/worms
- 100m² pond: produces 300–500kg per harvest cycle (5–6 months) — significant income
- CRITICAL RISK: flooding destroys ponds — locate on higher ground; build raised earthen bunds
- Water quality: change 30% of pond water weekly; avoid runoff from latrines; test for ammonia

FISH PROCESSING & MARKET:
- SMOKING: Traditional kiln smoking preserves fish 2–6 weeks; adds 40–80% value
- MARKET PRICES (approximate, Bayelsa 2024–2025):
  • Live catfish: ₦2,500–4,500/kg | Smoked catfish: ₦3,500–6,000/kg
  • Live tilapia: ₦1,800–3,500/kg | Smoked bonga: ₦800–2,000/kg
  • Fresh shrimp: ₦4,000–8,000/kg | Periwinkle: ₦1,000–2,500/kg
  • Fresh croaker: ₦3,000–6,000/kg
- Women fish traders: operate transport-and-resale networks; critical economic actors

CLIMATE CHANGE IMPACTS:
- More intense wet-season floods (2022: 300+ Bayelsa communities submerged)
- Irregular seasons: dry season later and shorter; traditional fish-concentration knowledge unreliable
- Sea level rise: saltwater intrusion advancing up creeks; affects freshwater species

SAFETY — NON-NEGOTIABLE:
- Fishing on open water during heavy rains or storms = canoe capsize risk; do NOT go out
- Never eat fish or shellfish from areas with visible oil contamination signs
- Personal flotation devices: rarely used but critical — advocate for them

RESOURCES FOR REFERRAL:
- NIOMR Yenagoa office: fingerlings, aquaculture technical support
- ADP (Agricultural Development Programme): fingerlings, extension support
- NOSDRA: oil spill reporting and compensation
- WhatsApp trader groups: Yenagoa and Port Harcourt daily market prices
`;

// ─── Probe prompt builder ─────────────────────────────────────────────────────

function buildProbePrompt(field: IntakeField, consultType: ConsultationType, client: Client, currentIntake: Record<string, string>): string {
  const ct = CONSULT_TYPES[consultType];
  const activityList = client.activities.map(a => ACTIVITY_OPTIONS.find(o => o.value === a)?.label ?? a).join(', ') || 'fishing';
  const filledSoFar = Object.entries(currentIntake)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || 'nothing yet';

  return `You are coaching a youth fishing advisor in Oloibiri, Bayelsa State, Nigeria. They are sitting with a client RIGHT NOW and need you to guide an in-depth interview about one specific topic.

CLIENT: ${client.client_name}, ${client.village}
CLIENT ACTIVITIES: ${activityList}
CONSULTATION TYPE: ${ct.emoji} ${ct.label}
TOPIC BEING EXPLORED: "${field.label}"
WHAT IT MEANS: ${field.tooltip}

INTAKE INFORMATION GATHERED SO FAR:
${filledSoFar}

${NIGER_DELTA_FISHING_CONTEXT}

YOUR ROLE:
- Ask ONE focused question at a time that the advisor can read directly to the client
- Keep language very simple — the advisor may translate to Ijaw or Yoruba
- Build a complete picture of this specific topic before moving on
- When you have enough information, end with the exact phrase: "✅ This topic is well characterised. You can move on."
- Never ask more than 6 questions on this one topic
- Draw on Niger Delta context: oil contamination, Kolo Creek, seasonal patterns, local fish species

FORMAT: One short question. After the advisor gives you the client's answer, probe deeper or confirm you have enough. Be direct, be brief, speak as if coaching in real time.

Start now with your FIRST question about: "${field.label}"`;
}

// ─── AI advice prompt ─────────────────────────────────────────────────────────

function buildAdvicePrompt(consultType: ConsultationType, client: Client, intake: Record<string, string>): string {
  const ct = CONSULT_TYPES[consultType];
  const activityList = client.activities.map(a => ACTIVITY_OPTIONS.find(o => o.value === a)?.label ?? a).join(', ') || 'fishing';
  const waterwayList = client.waterways.join(', ') || 'local creeks';
  const intakeSummary = INTAKE_FIELDS[consultType]
    .map(f => `${f.label}: ${intake[f.key]?.trim() || 'not provided'}`)
    .join('\n');

  const urgencyInstructions = consultType === 'oil-contamination'
    ? '\n🚨 If contamination is confirmed: open with URGENT. State clearly what to STOP immediately (eating contaminated fish, fishing contaminated area). Food safety before economics.'
    : consultType === 'climate-safety'
    ? '\n⛵ If dangerous conditions described: prioritise safety absolutely. State clearly if it is NOT safe to go on water right now.'
    : '';

  return `You are an expert fisheries and aquaculture advisor supporting a youth advisor working directly with fishing communities in Oloibiri (Bayelsa State) and surrounding Niger Delta communities, Nigeria.

${NIGER_DELTA_FISHING_CONTEXT}

CONSULTATION: ${ct.emoji} ${ct.label}
CLIENT: ${client.client_name}, ${client.village}
CLIENT ACTIVITIES: ${activityList}
WATERWAYS: ${waterwayList}

STRUCTURED INTAKE COMPLETED BY YOUTH ADVISOR:
${intakeSummary}

YOUR TASK: Provide a complete, actionable advisory response based on this intake data.

STRUCTURE YOUR RESPONSE:
1. **URGENCY LEVEL**: State LOW / MEDIUM / HIGH / URGENT — and the single most important reason
2. **DIAGNOSIS / KEY FINDINGS**: What are the 2–4 most important things you see in this data?
3. **IMMEDIATE ACTIONS**: What should the client do RIGHT NOW (step by step, prioritise free/low-cost actions first)
4. **MEDIUM-TERM PLAN**: What to do in the next 1–4 weeks
5. **REFERRAL** (if needed): Who to contact — NIOMR, ADP, NOSDRA, WhatsApp trader groups — and exactly what to say
6. **WHAT NOT TO DO**: 1–2 common mistakes to avoid in this situation
7. **INCOME ESTIMATE** (where relevant): Give a specific Naira calculation if this is processing-market or aquaculture
8. **ONE ACTION TODAY**: End with one sentence — the single most important thing the client can do today, at zero cost

FORMAT:
- Short paragraphs and bullet points
- Specific and local — species names, Naira amounts, waterway names, local references
- Plain language the advisor can read aloud to the client
${urgencyInstructions}

⚠️ DISCLAIMER: This is advisory support only. For aquaculture disease, always recommend contacting NIOMR. For oil contamination, recommend NOSDRA. The youth advisor must use their own judgement and training.`;
}

// ─── Follow-up chat prompt ─────────────────────────────────────────────────────

function buildFollowupPrompt(client: Client, consultation: Consultation): string {
  const ct = CONSULT_TYPES[consultation.consultation_type];
  const uc = consultation.urgency_level ? URGENCY_CONFIG[consultation.urgency_level] : null;
  return `You are a fisheries and aquaculture expert advisor supporting a youth fishing advisor in Oloibiri, Bayelsa State, Nigeria. The advisor has completed a structured consultation and has follow-up questions.

${NIGER_DELTA_FISHING_CONTEXT}

CLIENT ON FILE: ${client.client_name}, ${client.village}
CONSULTATION TYPE: ${ct.emoji} ${ct.label}
URGENCY: ${uc ? uc.label : 'not assessed'}
PROBLEM SUMMARY: ${consultation.problem_summary}
AI ADVICE GIVEN: ${consultation.ai_advice ?? 'see consultation record'}

The advisor may ask follow-up questions about the advice, how to explain something to the client, referral logistics, or any practical fishing/aquaculture question related to this case.

Respond with practical, specific advice appropriate to this community context. Keep answers concise and actionable. Reference specific species names, Naira amounts, and local waterways where relevant. Remind the advisor to contact NIOMR, ADP, or NOSDRA for anything outside your advisory scope.`;
}

// ─── Consultation type config ─────────────────────────────────────────────────

const CONSULT_TYPES: Record<ConsultationType, {
  label: string; emoji: string; colour: string;
  bgLight: string; border: string; textColour: string; description: string;
}> = {
  'catch-problem':     { label: 'Catch Problem',          emoji: '🎣', colour: 'from-blue-600 to-cyan-600',    bgLight: 'bg-blue-50',   border: 'border-blue-300',   textColour: 'text-blue-700',   description: 'Declining catches, gear problems, wrong fishing spots or times' },
  'aquaculture':       { label: 'Fish Pond / Aquaculture', emoji: '🐟', colour: 'from-teal-600 to-green-600',  bgLight: 'bg-teal-50',   border: 'border-teal-300',   textColour: 'text-teal-700',   description: 'Starting or fixing a catfish or tilapia pond, disease, feed, water quality' },
  'processing-market': { label: 'Processing & Market',    emoji: '💰', colour: 'from-amber-600 to-orange-500', bgLight: 'bg-amber-50',  border: 'border-amber-300',  textColour: 'text-amber-700',  description: 'Smoking, drying, pricing, when and where to sell for more income' },
  'oil-contamination': { label: 'Oil Contamination',      emoji: '⚠️', colour: 'from-red-700 to-orange-700',  bgLight: 'bg-red-50',    border: 'border-red-300',    textColour: 'text-red-700',    description: 'Identifying pollution, food safety, legal rights, compensation claims' },
  'climate-safety':    { label: 'Climate & Safety',       emoji: '🌊', colour: 'from-indigo-600 to-blue-600', bgLight: 'bg-indigo-50', border: 'border-indigo-300', textColour: 'text-indigo-700', description: 'Flood risk, safe fishing seasons, weather, adapting to climate change' },
};

const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string; colour: string; bg: string; border: string; textDark: string; icon: React.ReactNode; description: string;
}> = {
  low:    { label: 'Low',    colour: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300',  textDark: 'text-green-800',  icon: <CheckCircle size={13}/>, description: 'No immediate risk — plan medium-term improvements.' },
  medium: { label: 'Medium', colour: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-400', textDark: 'text-yellow-800', icon: <Clock size={13}/>,        description: 'Act this week — monitor and follow up in 2–7 days.' },
  high:   { label: 'High',   colour: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-400', textDark: 'text-orange-800', icon: <AlertTriangle size={13}/>, description: 'Act today — losses or health risks are escalating.' },
  urgent: { label: 'URGENT', colour: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-400',    textDark: 'text-red-800',    icon: <AlertTriangle size={13}/>, description: 'Stop harmful activity immediately and act now.' },
};

const ACTIVITY_OPTIONS: { value: ActivityType; label: string; emoji: string }[] = [
  { value: 'wild-fishing',        label: 'Wild fishing (creek/river)',              emoji: '🎣' },
  { value: 'aquaculture',         label: 'Fish pond / aquaculture',                 emoji: '🐟' },
  { value: 'fish-trading',        label: 'Fish trading / selling',                  emoji: '🛒' },
  { value: 'fish-processing',     label: 'Fish processing / smoking',               emoji: '🔥' },
  { value: 'shellfish-gathering', label: 'Shellfish gathering (periwinkle/clam/oyster)', emoji: '🦪' },
];

const WATERWAY_OPTIONS = [
  'Kolo Creek', 'River Nun', 'Taylor Creek', 'Ekole River',
  'Brass River', 'Ikebiri Creek', 'San Bartholomew River', 'Other',
];

const VILLAGES = ['Oloibiri', 'Otuabagi', 'Nembe', 'Brass', 'Ogbia', 'Yenagoa', 'Ikebiri', 'Other'];

// ─── Fishing Background ───────────────────────────────────────────────────────

const FishingBackground: React.FC = () => {
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
  const img = "url('/background_fishing_consultant.webp')";
  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="fish-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="3" seed="17" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="65" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/70 via-teal-900/60 to-cyan-900/65" />
        <div className="absolute inset-0 bg-black/10" />
      </div>
      {moving && (
        <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 pointer-events-none" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1, filter: 'url(#fish-distortion)', WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`, maskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)` }}>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/70 via-teal-900/60 to-cyan-900/65" />
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
    <button onClick={onToggle} className="ml-1.5 text-cyan-500 hover:text-cyan-700 focus:outline-none" aria-label="More info">
      <Lightbulb size={13}/>
    </button>
    {open && (
      <div className="absolute z-50 left-0 top-6 w-64 bg-teal-900 text-teal-50 text-xs rounded-xl px-3 py-2.5 shadow-xl leading-relaxed">
        {text}
        <button onClick={onToggle} className="absolute top-1.5 right-2 text-teal-300 hover:text-white"><X size={11}/></button>
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
// The core learning mechanism: AI coaches the youth advisor to ask the right
// questions one at a time, exactly like the HealthcareNavigator ProbePanel.

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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-teal-50 rounded-t-2xl">
          <div>
            <p className="text-xs font-bold text-teal-500 uppercase tracking-wide">Field Interview Coach</p>
            <p className="text-sm font-bold text-teal-900">Exploring: {field.label}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-teal-400 hover:text-teal-700 hover:bg-teal-100">
            <X size={18}/>
          </button>
        </div>

        {/* Instruction bar */}
        <div className="px-4 py-2 bg-teal-900 text-teal-100 text-xs flex items-start gap-2">
          <span className="text-base">💬</span>
          <span>Read each question aloud to the client. Type or speak their answer, then tap Send. The AI will ask follow-up questions until this topic is fully understood.</span>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ct.colour} flex items-center justify-center text-xs flex-shrink-0`}>{ct.emoji}</div>
              )}
              <div className={classNames('max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed',
                msg.role === 'user' ? 'bg-cyan-600 text-white rounded-tr-sm' : 'bg-teal-50 text-teal-900 rounded-tl-sm border border-teal-100')}>
                {msg.role === 'assistant' && <p className="text-xs font-bold text-teal-400 mb-1">AI Interview Coach</p>}
                {msg.role === 'user' && <p className="text-xs font-bold text-cyan-200 mb-1">Client's answer</p>}
                <MarkdownText text={msg.content}/>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-start gap-2">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ct.colour} flex items-center justify-center text-xs`}>{ct.emoji}</div>
              <div className="bg-teal-50 rounded-2xl rounded-tl-sm px-3 py-2.5">
                <div className="flex gap-1 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
              </div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>

        {/* Done banner */}
        {done && (
          <div className="mx-4 mb-2 bg-green-50 border border-green-300 rounded-xl px-3 py-2.5 flex items-center gap-2 text-green-800 text-sm font-semibold">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0"/>
            Topic fully explored. Tap "Move On" when ready.
          </div>
        )}

        {/* Input */}
        <div className="border-t px-3 py-3 rounded-b-2xl">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSend(); } }}
              placeholder="Type client's answer…"
              disabled={loading}
              className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50"
            />
            <button onClick={onSend} disabled={!input.trim() || loading}
              className="px-3 py-2.5 rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40">
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
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const FishingConsultantPage: React.FC = () => {
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
  const [newActivities, setNewActivities] = useState<ActivityType[]>([]);
  const [newWaterways, setNewWaterways] = useState<string[]>([]);
  const [newNotes, setNewNotes] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  // ── Structured intake (the key new pattern)
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

  // ── Probe Panel (field interview coach)
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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin');

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

  // ─── Voice setup ──────────────────────────────────────────────────────────
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
    const voice = voiceMode === 'pidgin'
      ? (voices.find(v => v.lang === 'en-NG') || voices.find(v => v.lang === 'en-ZA') || voices.find(v => v.lang.startsWith('en')))
      : (voices.find(v => v.name === 'Google UK English Female') || voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en')));
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    utt.rate = 0.87; utt.pitch = 1.0;
    window.speechSynthesis.speak(utt);
  }, [speechOn, voices, voiceMode]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isSending]);
  useEffect(() => { probeChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [probeMessages, probeLoading]);

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
          .eq('community_impact_slug', 'fishing')
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
          community_member_role: 'fisher',
        })
        .eq('id', activeChallenge.enrollmentId);

      const { data, error } = await supabase.functions.invoke('evaluate-challenge-submission', {
        body: { enrollment_id: activeChallenge.enrollmentId },
      });

      if (error) throw error;
      if (data?.impact_evaluation) setChallengeResult(data.impact_evaluation);
    } catch (err) {
      console.error('[FishingConsultantPage] challenge submit error:', err);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  // ─── Load clients ─────────────────────────────────────────────────────────
  const loadClients = useCallback(async () => {
    if (!user) return;
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('fishing_client_summary')
        .select('*')
        .eq('youth_user_id', user.id)
        .order('client_name');
      if (!error && data) setClients(data as Client[]);
    } finally { setLoadingClients(false); }
  }, [user]);

  useEffect(() => { loadClients(); }, [loadClients]);

  // ─── Load consultations ───────────────────────────────────────────────────
  const loadConsultations = useCallback(async (clientId: string) => {
    setLoadingConsults(true);
    try {
      const { data, error } = await supabase
        .from('fishing_consultations')
        .select('*')
        .eq('client_id', clientId)
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
        page: 'FishingConsultantPage',
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
        page: 'FishingConsultantPage',
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
        .map(m => `${m.role === 'assistant' ? 'AI' : 'Client'}: ${m.content.slice(0, 400)}`)
        .join('\n');
      // Append probe summary to the field's intake value
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
    return 'medium'; // default to caution
  };

  // ─── Generate AI advice ───────────────────────────────────────────────────
  const runAdvice = async () => {
    if (!selectedClient || !consultationType || isGeneratingAdvice) return;
    setIsGeneratingAdvice(true);
    try {
      const systemPrompt = buildAdvicePrompt(consultationType, selectedClient, intake);
      const reply = await chatText({
        page: 'FishingConsultantPage',
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

      // Create a simple conversation_history array from the intake probe sessions
      const conversationHistory: ChatMessage[] = [];

      const { data, error } = await supabase
        .from('fishing_consultations')
        .insert({
          youth_user_id: user.id,
          client_id: selectedClient.id,
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
      } else if (error) {
        console.error('[FishingConsultantPage] saveConsultation error:', error);
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
        page: 'FishingConsultantPage',
        messages: history.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 1200,
      });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const updated = [...history, aiMsg];
      setMessages(updated);
      speak(reply);
      // Persist conversation history
      await supabase
        .from('fishing_consultations')
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
        content: `Ready to help with follow-up questions for **${client.client_name}** (${ct.emoji} ${ct.label}${uc ? ` · **${uc.label}** urgency` : ''}).\n\nYou can ask me to explain the advice further, how to communicate it to the client in plain language, referral logistics, or any practical fishing question related to this case.`,
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
      const { error } = await supabase.from('fishing_clients').insert({
        youth_user_id: user.id,
        client_name: newName.trim(),
        village: newVillage,
        phone: newPhone || null,
        activities: newActivities,
        waterways: newWaterways,
        notes: newNotes || null,
      });
      if (!error) { await loadClients(); resetAddClient(); setMode('dashboard'); }
    } finally { setSavingClient(false); }
  };

  const resetAddClient = () => {
    setNewName(''); setNewVillage(''); setNewPhone('');
    setNewActivities([]); setNewWaterways([]); setNewNotes('');
  };

  const toggleActivity = (a: ActivityType) =>
    setNewActivities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const toggleWaterway = (w: string) =>
    setNewWaterways(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w]);

  const markResolved = async (consultId: string) => {
    await supabase.from('fishing_consultations').update({ resolved: true }).eq('id', consultId);
    if (selectedClient) loadConsultations(selectedClient.id);
    await loadClients();
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  // Check if required intake fields are filled
  const intakeComplete = consultationType
    ? INTAKE_FIELDS[consultationType].filter(f => f.required).every(f => intake[f.key]?.trim())
    : false;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'dashboard') {
    return (
      <AppLayout>
        <FishingBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-2xl">🎣</div>
                <div>
                  <h1 className="text-xl font-bold text-white">Fishing Advisor</h1>
                  <p className="text-sm text-cyan-200">Your client casebook · Oloibiri & Niger Delta</p>
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
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-xl font-semibold text-sm hover:opacity-90">
                  <Plus size={16}/> Add Client
                </button>
              </div>
            </div>
          </div>

          {clients.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Clients', value: clients.length, icon: '🎣' },
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
            <div className="bg-cyan-900/80 backdrop-blur-sm border border-cyan-400/50 rounded-2xl p-5 mb-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-cyan-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-cyan-300 uppercase tracking-wide">Community AI Challenge — This Week</span>
                    <span className="text-xs bg-cyan-400/20 text-cyan-200 px-2 py-0.5 rounded-full">{availableChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{availableChallenge.title}</p>
                  <p className="text-cyan-100 text-sm leading-relaxed mb-3">{availableChallenge.description}</p>
                  <button
                    onClick={() => handleEnrollChallenge(availableChallenge)}
                    disabled={enrolling}
                    className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
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
                      <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center mx-auto mb-3">
                        <Award size={32} className="text-cyan-600" />
                      </div>
                      <h2 className="text-2xl font-black text-gray-900">{challengeResult.tier_label}</h2>
                      <p className="text-sm text-cyan-600 font-bold uppercase tracking-wide mt-1">{challengeResult.tier} tier earned</p>
                    </div>
                    <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-cyan-800 mb-1">What you achieved</p>
                      <p className="text-sm text-cyan-700 leading-relaxed">{challengeResult.summary}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-blue-800 mb-1">Why you earned this tier</p>
                      <p className="text-sm text-blue-700 leading-relaxed">{challengeResult.tier_reasoning}</p>
                    </div>
                    <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-teal-800 mb-1">What to do next</p>
                      <p className="text-sm text-teal-700 leading-relaxed">{challengeResult.follow_up_instruction}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 mb-5">
                      <p className="text-xs text-gray-500">{challengeResult.next_tier_hint}</p>
                    </div>
                    <button
                      onClick={() => { setShowChallengeReflect(false); setChallengeResult(null); setActiveChallenge(null); }}
                      className="w-full py-3 rounded-xl bg-cyan-600 text-white font-bold hover:bg-cyan-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-xs font-bold text-cyan-500 uppercase tracking-wide mb-0.5">Challenge Reflection</p>
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
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed"/>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_2}</label>
                        <textarea value={challengeReflect2} onChange={e => setChallengeReflect2(e.target.value)} rows={3}
                          placeholder="What happened…"
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed"/>
                      </div>
                      {activeChallenge.return_question_3 && (
                        <div>
                          <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_3}</label>
                          <textarea value={challengeReflect3} onChange={e => setChallengeReflect3(e.target.value)} rows={2}
                            placeholder="Additional details…"
                            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed"/>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSubmitChallengeReflection}
                      disabled={!challengeReflect1.trim() || !challengeReflect2.trim() || challengeSubmitting}
                      className="w-full mt-6 py-3.5 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
                <div className="flex items-center justify-between px-5 py-4 border-b bg-cyan-50 rounded-t-2xl">
                  <div>
                    <p className="text-xs font-bold text-cyan-500 uppercase tracking-wide">Offline Mode</p>
                    <h2 className="text-lg font-bold text-gray-900">Fishing Advisor — Offline</h2>
                  </div>
                  <button onClick={() => setShowOfflineModal(false)} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <X size={18}/>
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Open offline tool */}
                  <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-cyan-800 mb-2">📴 Use the offline advisor now</p>
                    <p className="text-sm text-cyan-700 mb-3 leading-relaxed">
                      The offline version works without internet. It covers catch problems, aquaculture, fish processing and market access, oil contamination documentation, and climate and safety — and saves consultations to your device for later sync.
                    </p>
                    <a
                      href="/fishing-consultant-offline.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 transition-opacity"
                    >
                      <span>📴</span> Open Offline Advisor
                    </a>
                  </div>

                  {/* Install on phone */}
                  <div className="border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-gray-800 mb-3">📱 Install on your phone (works without internet)</p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Open in your browser</p>
                          <p className="text-xs text-gray-500 mt-0.5">Tap "Open Offline Advisor" above. It will open in a new tab in your phone's browser (Chrome or Safari).</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Add to Home Screen</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            <strong>Android (Chrome):</strong> Tap the ⋮ menu → "Add to Home Screen" → "Add".<br/>
                            <strong>iPhone (Safari):</strong> Tap the Share button (□↑) → "Add to Home Screen" → "Add".
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Use it anywhere — no internet needed</p>
                          <p className="text-xs text-gray-500 mt-0.5">It will appear as an app icon. Open it at the waterside, complete the consultation, and save it to your device.</p>
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

                  {/* Tips */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-2">💡 Tips for field use</p>
                    <ul className="space-y-1.5 text-xs text-amber-700">
                      <li>• Complete required fields — especially fisher name, waterway, and problem description</li>
                      <li>• Use the 💡 tip buttons for guidance on what each field is looking for</li>
                      <li>• <strong>Oil contamination</strong> cases — document GPS location and visible signs carefully; this is evidence</li>
                      <li>• <strong>Aquaculture emergencies</strong> (mass pond deaths) require same-day action — the advisor will flag them</li>
                      <li>• The Consultation Record at the end can be read aloud to the fisher as a take-home action plan</li>
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
            <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-cyan-300"/></div>
          ) : clients.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-10 text-center">
              <div className="text-5xl mb-4">🎣</div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">No clients registered yet</h2>
              <p className="text-sm text-gray-500 mb-5">Add your first fishing client to start your casebook.</p>
              <button onClick={() => { resetAddClient(); setMode('add-client'); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90">
                <Plus size={16}/> Register First Client
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map(client => (
                <button key={client.id}
                  onClick={() => { setSelectedClient(client); loadConsultations(client.id); setMode('client-detail'); }}
                  className="w-full bg-white/90 backdrop-blur-sm rounded-2xl p-4 text-left hover:bg-white transition-colors border border-transparent hover:border-cyan-300">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-100 to-teal-100 flex items-center justify-center text-lg">🎣</div>
                      <div>
                        <p className="font-bold text-gray-900">{client.client_name}</p>
                        <p className="text-sm text-gray-500">{client.village}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {client.activities.map(a => {
                            const opt = ACTIVITY_OPTIONS.find(o => o.value === a);
                            return opt ? (
                              <span key={a} className="text-xs bg-cyan-100 text-cyan-700 rounded-full px-2 py-0.5">{opt.emoji} {opt.label}</span>
                            ) : null;
                          })}
                        </div>
                        {client.waterways.length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">{client.waterways.join(', ')}</p>
                        )}
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
        <FishingBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div><h2 className="text-xl font-bold text-gray-900">Register Client</h2><p className="text-sm text-gray-500">Add to your casebook</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Client Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Papa Charles Amabebe"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Village *</label>
                <select value={newVillage} onChange={e => setNewVillage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 text-base bg-white">
                  <option value="">Select village…</option>
                  {VILLAGES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone (optional)</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+234 801 234 5678"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Activities (select all that apply)</label>
                <div className="space-y-2">
                  {ACTIVITY_OPTIONS.map(opt => (
                    <label key={opt.value} className={classNames('flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
                      newActivities.includes(opt.value) ? 'bg-cyan-50 border-cyan-400' : 'border-gray-200 hover:border-gray-300')}>
                      <input type="checkbox" checked={newActivities.includes(opt.value)} onChange={() => toggleActivity(opt.value)} className="accent-cyan-600"/>
                      <span className="text-lg">{opt.emoji}</span>
                      <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Waterways used (select all that apply)</label>
                <div className="flex flex-wrap gap-2">
                  {WATERWAY_OPTIONS.map(w => (
                    <button key={w} onClick={() => toggleWaterway(w)}
                      className={classNames('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                        newWaterways.includes(w) ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-gray-600 border-gray-300 hover:border-cyan-400')}>
                      🌊 {w}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
                  placeholder="Past problems, specific concerns, gear owned, pond size…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 text-sm resize-none"/>
              </div>
              <button onClick={saveClient} disabled={!newName.trim() || !newVillage || savingClient}
                className={classNames('w-full py-3.5 rounded-xl font-bold text-white text-base transition-opacity',
                  newName.trim() && newVillage && !savingClient ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:opacity-90' : 'bg-gray-300 cursor-not-allowed')}>
                {savingClient ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>Saving…</span> : 'Register Client'}
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
        <FishingBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-100 to-teal-100 flex items-center justify-center text-2xl">🎣</div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{client.client_name}</h2>
                <p className="text-sm text-gray-500">{client.village}{client.phone ? ` · ${client.phone}` : ''}</p>
              </div>
            </div>

            {client.activities.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {client.activities.map(a => {
                  const opt = ACTIVITY_OPTIONS.find(o => o.value === a);
                  return opt ? (
                    <div key={a} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border bg-cyan-50 border-cyan-300 text-cyan-700">
                      {opt.emoji} {opt.label}
                    </div>
                  ) : null;
                })}
              </div>
            )}

            {client.waterways.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {client.waterways.map(w => (
                  <span key={w} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 font-medium">🌊 {w}</span>
                ))}
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
                <ClipboardList size={16} className="text-cyan-600"/> Case History
              </h3>
              <button onClick={() => loadConsultations(client.id)} className="text-gray-400 hover:text-gray-700"><RefreshCw size={14}/></button>
            </div>
            {loadingConsults ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-cyan-600"/></div>
            ) : consultations.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">No consultations yet.</p>
            ) : (
              <div className="space-y-3">
                {consultations.map(c => {
                  const ct = CONSULT_TYPES[c.consultation_type];
                  return (
                    <div key={c.id} className="border border-gray-200 rounded-xl p-4 hover:border-cyan-300 transition-colors">
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
                          className="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:border-cyan-300 hover:text-cyan-700">
                          View Case
                        </button>
                        <button onClick={() => openFollowupChat(client, c)}
                          className="flex-1 py-2 text-xs font-semibold rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
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
  // This is the core new pattern: structured form + probe buttons → AI advice
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'new-consultation' && selectedClient && consultationType) {
    const ct = CONSULT_TYPES[consultationType];
    const fields = INTAKE_FIELDS[consultationType];
    const isOilContam = consultationType === 'oil-contamination';
    const isClimateSafety = consultationType === 'climate-safety';

    return (
      <AppLayout>
        <FishingBackground />

        {/* Probe Panel Modal */}
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
                <p className="text-xs text-gray-500">{selectedClient.client_name} · {selectedClient.village}</p>
              </div>
            </div>
          </div>

          {/* Urgent warning for oil contamination */}
          {isOilContam && (
            <div className="bg-red-600 text-white rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold">⚠️ OIL CONTAMINATION — FOOD SAFETY FIRST</p>
                <p className="text-sm opacity-90">Do not eat fish from visibly contaminated areas while completing this assessment. Document everything for the NOSDRA report.</p>
              </div>
            </div>
          )}

          {/* Intake instructions */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <Lightbulb size={14} className="text-cyan-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-700">
              Fill in each field with what the client tells you. Tap <strong>🔍 Probe</strong> to get AI-guided interview questions for that topic — the AI will coach you to ask exactly the right follow-up questions, one at a time. When done, run AI Advice.
            </p>
          </div>

          {/* Structured intake fields */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
              <FileText size={15} className="text-cyan-600"/> Intake — {ct.label}
            </h3>
            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
              <span className="text-teal-600 font-bold">🔍 Probe</span> — tap after filling a field to go deeper with AI interview coaching
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
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                    <button
                      onClick={() => openProbe(field)}
                      className={classNames(
                        'px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex-shrink-0 self-start mt-0.5',
                        probeField?.key === field.key
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100'
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
                : <><Fish size={18}/>Generate AI Advice{!intakeComplete && ' (fill required fields first)'}</>}
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
                  className="text-xs text-cyan-600 hover:underline flex items-center gap-1">
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
                    placeholder="e.g. Advised client to avoid fishing near the pipeline. Showed how to document spill for NOSDRA. Referred to NIOMR for fingerlings."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400"/>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="followup" checked={followUpNeeded} onChange={e => setFollowUpNeeded(e.target.checked)} className="w-4 h-4 accent-cyan-600"/>
                  <label htmlFor="followup" className="text-sm font-semibold text-gray-700">Follow-up visit needed</label>
                </div>
                {followUpNeeded && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Follow-up date</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"/>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">What to check</label>
                      <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Check pond water quality"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"/>
                    </div>
                  </div>
                )}

                {consultSaved ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-cyan-700 font-semibold text-sm bg-cyan-50 rounded-xl px-4 py-3">
                      <CheckCircle size={16}/> Case saved to {selectedClient.client_name}'s record.
                    </div>
                    {/* Challenge nudge — shown after save when challenge is active */}
                    {activeChallenge && (
                      <div className="bg-cyan-50 border border-cyan-300 rounded-xl px-4 py-3 flex items-start gap-2">
                        <Award size={16} className="text-cyan-600 flex-shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-cyan-800 mb-1">Community AI Challenge active</p>
                          <p className="text-xs text-cyan-700 mb-2">You completed a consultation — did you also complete your challenge mission? Submit your reflection to earn your tier.</p>
                          <button
                            onClick={() => setShowChallengeReflect(true)}
                            className="text-xs font-bold text-cyan-700 underline hover:text-cyan-900"
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
                            client_id: selectedClient.id,
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
                        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-teal-600 to-cyan-600 hover:opacity-90 flex items-center justify-center gap-2"
                      >
                        <Send size={16}/> Continue with AI Follow-up Chat
                      </button>
                    )}
                  </div>
                ) : (
                  <button onClick={saveConsultation} disabled={savingConsult}
                    className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:opacity-90 disabled:opacity-50">
                    {savingConsult ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin"/>Saving…</span> : 'Save Case Record'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck size={14} className="text-cyan-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-600">This AI advice is <strong>support only</strong>. For aquaculture disease: contact NIOMR. For oil contamination: contact NOSDRA (0800-NOSDRA-9). For life-threatening situations on water: prioritise safety above all else.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: FOLLOW-UP CHAT
  // Modeled exactly on HealthcareNavigator's followup-chat mode
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'followup-chat' && selectedClient && selectedConsultation) {
    const client = selectedClient;
    const consult = selectedConsultation;
    const ct = CONSULT_TYPES[consult.consultation_type];
    const userTurns = messages.filter(m => m.role === 'user').length;

    return (
      <AppLayout>
        <FishingBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setMode('client-detail'); }} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-lg`}>{ct.emoji}</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Follow-up Questions</h2>
                  <p className="text-xs text-gray-500">{client.client_name} · {ct.label}{consult.urgency_level ? ` · ` : ''}{consult.urgency_level && <UrgencyBadge level={consult.urgency_level}/>}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  {(['pidgin', 'english'] as const).map(m => (
                    <button key={m} onClick={() => setVoiceMode(m)}
                      className={`px-2.5 py-1.5 text-xs font-bold border-r border-gray-300 last:border-0 transition-all ${voiceMode===m?(m==='english'?'bg-blue-600 text-white':'bg-cyan-600 text-white'):'bg-white text-gray-500'}`}>
                      {m==='english'?'🇬🇧':'🇳🇬'}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setSpeechOn(s => !s); if (speechOn) window.speechSynthesis.cancel(); }}
                  className={classNames('p-2 rounded-lg', speechOn ? 'bg-cyan-100 text-cyan-700' : 'bg-gray-100 text-gray-400')}>
                  {speechOn ? <Volume2 size={15}/> : <VolumeX size={15}/>}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <Lightbulb size={14} className="text-cyan-700 flex-shrink-0"/>
            <p className="text-xs text-gray-700">Ask about the advice, how to explain it to the client in plain language, referral logistics, or any practical fishing question related to this case.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: '460px' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl text-xs text-gray-500">
              <span className="font-semibold text-gray-700 flex items-center gap-1.5">{ct.emoji} Fishing AI Advisor</span>
              <span>{userTurns} exchange{userTurns !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-lg`}>{ct.emoji}</div>
                  )}
                  <div className={classNames('max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user' ? 'bg-cyan-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant' && <p className="text-xs font-bold mb-1 opacity-50">AI Fishing Advisor</p>}
                    {msg.role === 'user' && <p className="text-xs font-bold mb-1 opacity-75">You (Advisor)</p>}
                    <MarkdownText text={msg.content}/>
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-cyan-600 flex items-center justify-center">
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
                  className="flex-1 px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed disabled:opacity-50"/>
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
        <FishingBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('client-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-2xl`}>{ct.emoji}</div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900">{ct.label} — {selectedClient.client_name}</h2>
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
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">{c.problem_summary}</p>
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
                  <p className="text-sm text-gray-800 bg-cyan-50 rounded-lg px-3 py-2">{c.youth_actions_taken}</p>
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
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
                  Ask AI Follow-up
                </button>
                {!c.resolved && (
                  <button onClick={async () => { await markResolved(c.id); setSelectedConsultation({ ...c, resolved: true }); }}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:opacity-90">
                    Mark Resolved ✓
                  </button>
                )}
              </div>
            </div>
          </div>

          {c.conversation_history?.length > 0 && (
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText size={14} className="text-cyan-600"/> Follow-up Chat Transcript
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {c.conversation_history.map((msg, i) => (
                  <div key={i} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className={`flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br ${ct.colour} flex items-center justify-center text-sm`}>{ct.emoji}</div>
                    )}
                    <div className={classNames('max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed',
                      msg.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-800')}>
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

export default FishingConsultantPage;