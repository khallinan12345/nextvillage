// src/data/community-impact/agriculture.tsx
//
// Domain knowledge for the Agriculture Advisor (AgricultureConsultantPage.tsx):
// consultation-type taxonomy, structured intake schema, the Niger Delta /
// Ogun State agronomy knowledge base, and the AI prompt builders that draw
// on it. Extracted out of the page component so the page's React/JSX code
// isn't mixed in with ~350 lines of domain content, and so this shape can be
// compared side by side with Fishing's and Animal Husbandry's equivalents.
//
// Pure data + prompt-string builders — no page-specific state or rendering.

import React from 'react';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export type ConsultationType =
  | 'crop-disease'
  | 'pest-damage'
  | 'soil-water'
  | 'post-harvest'
  | 'market-input';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'urgent';

export type CropType =
  | 'cassava' | 'maize' | 'yam' | 'plantain' | 'vegetables'
  | 'cowpea' | 'rice' | 'cocoa' | 'oil-palm' | 'other';

export interface IntakeField {
  key: string;
  label: string;
  placeholder: string;
  tooltip: string;
  required?: boolean;
}

// ─── Structured Intake Form ────────────────────────────────────────────────────

export const INTAKE_FIELDS: Record<ConsultationType, IntakeField[]> = {
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

export const AGRICULTURE_CONTEXT = `
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

// ─── Consultation type config ─────────────────────────────────────────────────

export const CONSULT_TYPES: Record<ConsultationType, {
  label: string; emoji: string; colour: string;
  bgLight: string; border: string; textColour: string; description: string;
}> = {
  'crop-disease': { label: 'Crop Disease', emoji: '🦠', colour: 'from-red-600 to-orange-600', bgLight: 'bg-red-50', border: 'border-red-300', textColour: 'text-red-700', description: 'Identify and manage disease, virus, or nutrient deficiency in crops' },
  'pest-damage': { label: 'Pest Damage', emoji: '🐛', colour: 'from-orange-600 to-amber-600', bgLight: 'bg-orange-50', border: 'border-orange-300', textColour: 'text-orange-700', description: 'Diagnose pests like Fall Armyworm, mealybug, mites — recommend control' },
  'soil-water': { label: 'Soil & Water', emoji: '💧', colour: 'from-blue-600 to-teal-600', bgLight: 'bg-blue-50', border: 'border-blue-300', textColour: 'text-blue-700', description: 'Soil health, drainage, waterlogging, erosion, or flooding problems' },
  'post-harvest': { label: 'Post-Harvest', emoji: '🌾', colour: 'from-amber-600 to-yellow-600', bgLight: 'bg-amber-50', border: 'border-amber-300', textColour: 'text-amber-700', description: 'Reduce spoilage, storage, processing for better price, aflatoxin safety' },
  'market-input': { label: 'Market & Inputs', emoji: '💰', colour: 'from-green-600 to-emerald-600', bgLight: 'bg-green-50', border: 'border-green-300', textColour: 'text-green-700', description: 'Buyers, pricing strategy, input sourcing (seed, fertiliser, credit)' },
};

export const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string; colour: string; bg: string; border: string; textDark: string; icon: React.ReactNode; description: string;
}> = {
  low:    { label: 'Low',    colour: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300',  textDark: 'text-green-800',  icon: <CheckCircle size={13}/>,    description: 'No immediate risk — plan medium-term improvements.' },
  medium: { label: 'Medium', colour: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-400', textDark: 'text-yellow-800', icon: <Clock size={13}/>,          description: 'Act this week — monitor and follow up in 2–7 days.' },
  high:   { label: 'High',   colour: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-400', textDark: 'text-orange-800', icon: <AlertTriangle size={13}/>,  description: 'Act today — losses or food safety risks are escalating.' },
  urgent: { label: 'URGENT', colour: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-400',    textDark: 'text-red-800',    icon: <AlertTriangle size={13}/>,  description: 'Stop harmful activity immediately and act now.' },
};

export const CROP_OPTIONS: { value: CropType; label: string; emoji: string }[] = [
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

export const VILLAGES = ['Oloibiri', 'Ibiade', 'Otuabagi', 'Nembe', 'Ogbia', 'Yenagoa', 'Sagamu', 'Abeokuta', 'Other'];

// ─── Prompt builders ───────────────────────────────────────────────────────────
//
// Structural (not imported) param types — the page's actual Client/Consultation
// row types satisfy these by having a superset of these fields, so no import
// back into the page is needed and this file stays fully self-contained.

interface ClientLike {
  farmer_name: string;
  village: string;
  crops: CropType[];
}

interface ConsultationLike {
  consultation_type: ConsultationType;
  urgency_level: UrgencyLevel | null;
  problem_summary: string;
  ai_advice: string | null;
}

export function buildProbePrompt(field: IntakeField, consultType: ConsultationType, client: ClientLike, currentIntake: Record<string, string>): string {
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

export function buildAdvicePrompt(consultType: ConsultationType, client: ClientLike, intake: Record<string, string>): string {
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

export function buildFollowupPrompt(client: ClientLike, consultation: ConsultationLike): string {
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
