// src/data/community-impact/fishing.tsx
//
// Domain knowledge for the Fishing Advisor (FishingConsultantPage.tsx):
// consultation-type taxonomy, structured intake schema, the Niger Delta
// fishing/aquaculture knowledge base, and the AI prompt builders that draw
// on it. Extracted out of the page component so the page's React/JSX code
// isn't mixed in with ~300 lines of domain content, and so this shape can be
// compared side by side with Agriculture's and Animal Husbandry's equivalents.
//
// Pure data + prompt-string builders — no page-specific state or rendering.

import React from 'react';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { ILLUSTRATION_INSTRUCTIONS } from './illustrationPrompt';

export type ConsultationType =
  | 'catch-problem'
  | 'aquaculture'
  | 'processing-market'
  | 'oil-contamination'
  | 'climate-safety';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'urgent';

export type ActivityType =
  | 'wild-fishing'
  | 'aquaculture'
  | 'fish-trading'
  | 'fish-processing'
  | 'shellfish-gathering';

export interface IntakeField {
  key: string;
  label: string;
  placeholder: string;
  tooltip: string;
  required?: boolean;
}

// ─── Structured Intake Form ────────────────────────────────────────────────────
// Each consultation type has its own intake fields, analogous to the health
// assessment vitals/symptoms. Probe buttons let AI coach the advisor in real time.

export const INTAKE_FIELDS: Record<ConsultationType, IntakeField[]> = {
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

export const NIGER_DELTA_FISHING_CONTEXT = `
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

// ─── Consultation type config ─────────────────────────────────────────────────

export const CONSULT_TYPES: Record<ConsultationType, {
  label: string; emoji: string; colour: string;
  bgLight: string; border: string; textColour: string; description: string;
}> = {
  'catch-problem':     { label: 'Catch Problem',          emoji: '🎣', colour: 'from-blue-600 to-cyan-600',    bgLight: 'bg-blue-50',   border: 'border-blue-300',   textColour: 'text-blue-700',   description: 'Declining catches, gear problems, wrong fishing spots or times' },
  'aquaculture':       { label: 'Fish Pond / Aquaculture', emoji: '🐟', colour: 'from-teal-600 to-green-600',  bgLight: 'bg-teal-50',   border: 'border-teal-300',   textColour: 'text-teal-700',   description: 'Starting or fixing a catfish or tilapia pond, disease, feed, water quality' },
  'processing-market': { label: 'Processing & Market',    emoji: '💰', colour: 'from-amber-600 to-orange-500', bgLight: 'bg-amber-50',  border: 'border-amber-300',  textColour: 'text-amber-700',  description: 'Smoking, drying, pricing, when and where to sell for more income' },
  'oil-contamination': { label: 'Oil Contamination',      emoji: '⚠️', colour: 'from-red-700 to-orange-700',  bgLight: 'bg-red-50',    border: 'border-red-300',    textColour: 'text-red-700',    description: 'Identifying pollution, food safety, legal rights, compensation claims' },
  'climate-safety':    { label: 'Climate & Safety',       emoji: '🌊', colour: 'from-indigo-600 to-blue-600', bgLight: 'bg-indigo-50', border: 'border-indigo-300', textColour: 'text-indigo-700', description: 'Flood risk, safe fishing seasons, weather, adapting to climate change' },
};

export const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string; colour: string; bg: string; border: string; textDark: string; icon: React.ReactNode; description: string;
}> = {
  low:    { label: 'Low',    colour: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300',  textDark: 'text-green-800',  icon: <CheckCircle size={13}/>, description: 'No immediate risk — plan medium-term improvements.' },
  medium: { label: 'Medium', colour: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-400', textDark: 'text-yellow-800', icon: <Clock size={13}/>,        description: 'Act this week — monitor and follow up in 2–7 days.' },
  high:   { label: 'High',   colour: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-400', textDark: 'text-orange-800', icon: <AlertTriangle size={13}/>, description: 'Act today — losses or health risks are escalating.' },
  urgent: { label: 'URGENT', colour: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-400',    textDark: 'text-red-800',    icon: <AlertTriangle size={13}/>, description: 'Stop harmful activity immediately and act now.' },
};

export const ACTIVITY_OPTIONS: { value: ActivityType; label: string; emoji: string }[] = [
  { value: 'wild-fishing',        label: 'Wild fishing (creek/river)',              emoji: '🎣' },
  { value: 'aquaculture',         label: 'Fish pond / aquaculture',                 emoji: '🐟' },
  { value: 'fish-trading',        label: 'Fish trading / selling',                  emoji: '🛒' },
  { value: 'fish-processing',     label: 'Fish processing / smoking',               emoji: '🔥' },
  { value: 'shellfish-gathering', label: 'Shellfish gathering (periwinkle/clam/oyster)', emoji: '🦪' },
];

export const WATERWAY_OPTIONS = [
  'Kolo Creek', 'River Nun', 'Taylor Creek', 'Ekole River',
  'Brass River', 'Ikebiri Creek', 'San Bartholomew River', 'Other',
];

export const VILLAGES = ['Oloibiri', 'Otuabagi', 'Nembe', 'Brass', 'Ogbia', 'Yenagoa', 'Ikebiri', 'Other'];

// ─── Prompt builders ───────────────────────────────────────────────────────────
//
// Structural (not imported) param types — the page's actual Client/Consultation
// row types satisfy these by having a superset of these fields, so no import
// back into the page is needed and this file stays fully self-contained.

interface ClientLike {
  client_name: string;
  village: string;
  activities: ActivityType[];
  waterways: string[];
}

interface ConsultationLike {
  consultation_type: ConsultationType;
  urgency_level: UrgencyLevel | null;
  problem_summary: string;
  ai_advice: string | null;
}

export function buildProbePrompt(field: IntakeField, consultType: ConsultationType, client: ClientLike, currentIntake: Record<string, string>): string {
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

export function buildAdvicePrompt(consultType: ConsultationType, client: ClientLike, intake: Record<string, string>): string {
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

⚠️ DISCLAIMER: This is advisory support only. For aquaculture disease, always recommend contacting NIOMR. For oil contamination, recommend NOSDRA. The youth advisor must use their own judgement and training.

${ILLUSTRATION_INSTRUCTIONS}`;
}

export function buildFollowupPrompt(client: ClientLike, consultation: ConsultationLike): string {
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

Respond with practical, specific advice appropriate to this community context. Keep answers concise and actionable. Reference specific species names, Naira amounts, and local waterways where relevant. Remind the advisor to contact NIOMR, ADP, or NOSDRA for anything outside your advisory scope.

${ILLUSTRATION_INSTRUCTIONS}`;
}
