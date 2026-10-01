// src/lib/solarEngineering.ts
//
// Single source of truth for the Solar Engineering & Installation training +
// certification pages: skill areas, rubric criteria, country-specific solar
// context, and the prompt builders both pages share.
//
// Mirrors src/lib/financialLiteracy.ts exactly in shape:
// - Each AREA is one tab on the training page AND one assessment on the
//   certification page (area.subCategory === certification_assessments.assessment_name
//   === learning_modules.sub_category).
// - Scores live in dashboard.rubric_scores (jsonb).
// - The facilitator returns a machine-readable <rubric>{json}</rubric> tag on
//   every scored turn.

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
export const SOLAR_CATEGORY = 'Solar Engineering & Installation';          // learning_modules.category
export const SOLAR_CERT_NAME = 'Solar Engineering & Installation';        // certification_assessments.certification_name
export const SOLAR_CERT_ACTIVITY = 'Solar Engineering & Installation Certification'; // dashboard.activity for the cert row

// chatClient routes models by `page`. Reusing the Skills key keeps the Groq
// routing until a 'SolarEngineeringPage' key is registered in chatClient.
export const SOLAR_CHAT_PAGE = 'SkillsDevelopmentPage';

// ─────────────────────────────────────────────────────────────────────────────
// Areas & rubric criteria
// ─────────────────────────────────────────────────────────────────────────────
export type Levels = [string, string, string, string]; // 0 No Evidence · 1 Emerging · 2 Proficient · 3 Advanced

export interface SolarCriterion {
  key: string;
  label: string;
  levels: Levels;
}

export interface SolarArea {
  id: string;             // URL-safe id (?area=...)
  subCategory: string;    // learning_modules.sub_category and certification assessment_name
  title: string;
  description: string;
  icon: 'sun' | 'calculator' | 'zap' | 'wrench' | 'battery' | 'clipboard';
  criteria: [SolarCriterion, SolarCriterion];
}

export const SOLAR_AREAS: SolarArea[] = [
  {
    id: 'site-assessment',
    subCategory: 'Site Assessment and Solar Resource',
    title: 'Site Assessment & Solar Resource',
    description: 'Read a roof or a plot of land and work out how much sun it can really deliver',
    icon: 'sun',
    criteria: [
      {
        key: 'resource_estimation',
        label: 'Estimating usable sun-hours',
        levels: [
          'Cannot say how much sun a site gets or ignores shading and orientation entirely.',
          'States a rough sun-hours number but ignores shading objects, roof pitch, or seasonal change.',
          'Estimates peak sun-hours for the site using orientation, tilt, and a shading survey (trees, buildings, water tanks) across the day.',
          'Adjusts the estimate for seasonal sun-path change and explains how it changes the design margin.',
        ],
      },
      {
        key: 'site_survey',
        label: 'Site survey and structural read',
        levels: [
          'Does not check roof/ground condition, access, or safety before planning an install.',
          'Notes the roof or mounting surface exists but does not check its condition, structural capacity, or safe access.',
          'Surveys roof material, condition, structural capacity, cable routing, and safe access/fall-protection needs before proposing a layout.',
          'Identifies a structural or access risk that would change the whole design and proposes a specific mitigation.',
        ],
      },
    ],
  },
  {
    id: 'system-sizing',
    subCategory: 'System Sizing and Load Calculation',
    title: 'System Sizing & Load Calculation',
    description: 'Turn a household or business energy need into panel, battery, and inverter numbers',
    icon: 'calculator',
    criteria: [
      {
        key: 'load_calculation',
        label: 'Load calculation',
        levels: [
          'Cannot list the appliances/loads or their power draw.',
          'Lists some loads but misses run-hours, surge/starting current, or mixes up watts and watt-hours.',
          'Builds a complete load table (watts × hours = daily watt-hours) for every appliance, including surge current for motors, and totals it correctly.',
          'Separates critical vs. deferrable loads and designs a load schedule that reduces system cost without reducing reliability.',
        ],
      },
      {
        key: 'component_sizing',
        label: 'Panel, battery & inverter sizing',
        levels: [
          'Picks panel/battery/inverter sizes by guessing or copying another system.',
          'Calculates one component correctly (e.g. panel wattage) but gets battery autonomy, depth-of-discharge, or inverter surge rating wrong.',
          'Correctly sizes panels (with derating for temperature and losses), battery bank (with usable capacity and days of autonomy), and inverter (continuous and surge rating) from the load table.',
          'Compares two design options (e.g. more panels vs. more battery, or grid-tied vs. hybrid) on cost and reliability and justifies the choice with numbers.',
        ],
      },
    ],
  },
  {
    id: 'electrical-safety',
    subCategory: 'Electrical Theory and Wiring Safety',
    title: 'Electrical Theory & Wiring Safety',
    description: 'Get the volts, amps, wire gauge, and protection right — and know what can kill',
    icon: 'zap',
    criteria: [
      {
        key: 'circuit_calculations',
        label: 'Circuit calculations',
        levels: [
          'Cannot calculate current, voltage drop, or wire size for a circuit.',
          'Uses Ohm\'s law for a simple case but gets voltage-drop or wire-gauge calculations wrong for the actual cable run length.',
          'Correctly calculates current draw, selects wire gauge for the run length and acceptable voltage drop (target under 3%), and sizes fuses/breakers to protect the cable.',
          'Compares series vs. parallel string wiring, calculates the effect on system voltage and current, and chooses the configuration that best fits the inverter\'s input window.',
        ],
      },
      {
        key: 'electrical_safety',
        label: 'Electrical safety practice',
        levels: [
          'Ignores basic safety (no disconnects, no grounding, would work on live DC/AC circuits).',
          'Names a safety rule (e.g. "ground it") but cannot explain why or apply it correctly to this system.',
          'Specifies correct grounding/earthing, DC and AC disconnects, overcurrent protection, and lock-out/tag-out steps before working on the system.',
          'Identifies a specific hazard in a given scenario (e.g. arc-flash risk from a loose DC connector, reversed polarity) and explains exactly how to prevent it.',
        ],
      },
    ],
  },
  {
    id: 'mounting-installation',
    subCategory: 'Mounting and Mechanical Installation',
    title: 'Mounting & Mechanical Installation',
    description: 'Fix panels so they survive wind, rain, and years of sun without leaking or falling',
    icon: 'wrench',
    criteria: [
      {
        key: 'mounting_method',
        label: 'Mounting method and structural loads',
        levels: [
          'Would mount panels without considering wind load, roof penetration, or weatherproofing.',
          'Picks a mounting method but cannot explain how it resists wind uplift or how penetrations are sealed.',
          'Selects a mounting method appropriate to the roof/ground type, accounts for wind and snow/rain load, and correctly seals every penetration.',
          'Calculates or reasons through wind-uplift risk for the local climate and adjusts spacing, fasteners, or bracing accordingly.',
        ],
      },
      {
        key: 'installation_sequence',
        label: 'Installation sequence and workmanship',
        levels: [
          'Has no clear order of operations; would connect live circuits before mechanical work is finished.',
          'Names some steps but in an unsafe or inefficient order (e.g. wiring before racking is secured and tested).',
          'Follows a correct sequence: rack and secure structure, mount and torque panels to spec, route and secure cabling with strain relief, then make electrical connections last.',
          'Explains how to inspect and commission the finished system (torque checks, cable dressing, thermal-imaging or visual hot-spot check) before energizing it for the customer.',
        ],
      },
    ],
  },
  {
    id: 'battery-inverters',
    subCategory: 'Battery Storage and Inverters',
    title: 'Battery Storage & Inverters',
    description: 'Choose, connect, and protect battery banks and inverters so they last and stay safe',
    icon: 'battery',
    criteria: [
      {
        key: 'battery_management',
        label: 'Battery chemistry & management',
        levels: [
          'Treats all batteries the same; ignores depth-of-discharge, charge rate, or ventilation needs.',
          'Names a battery type (lead-acid, lithium) but cannot explain its correct depth-of-discharge, charge/discharge limits, or safety needs.',
          'Selects battery chemistry appropriate to budget and use case, applies the correct usable depth-of-discharge and charge controller settings, and provides for correct ventilation/thermal management.',
          'Compares total cost of ownership between battery chemistries (cycle life × depth-of-discharge × price) for a given daily use pattern and recommends one with numbers.',
        ],
      },
      {
        key: 'inverter_integration',
        label: 'Inverter selection & integration',
        levels: [
          'Cannot match an inverter to the loads or the battery/panel system.',
          'Picks an inverter by brand or price alone, without checking continuous/surge rating or compatibility with the battery voltage.',
          'Matches inverter continuous and surge rating to the load table, confirms battery-voltage compatibility, and sets charge/inverter parameters correctly for the battery chemistry.',
          'Designs for a mixed AC/DC or hybrid (grid-tied plus battery) system and explains how the inverter manages the transition between sources.',
        ],
      },
    ],
  },
  {
    id: 'codes-certification',
    subCategory: 'Codes, Standards and Certification Pathways',
    title: 'Codes, Standards & Certification Pathways',
    description: 'Meet the electrical code, get permits right, and plan a real path to a recognized credential',
    icon: 'clipboard',
    criteria: [
      {
        key: 'code_compliance',
        label: 'Code and standards compliance',
        levels: [
          'Unaware that electrical codes, permits, or inspections apply to a solar install.',
          'Knows codes exist but cannot name a specific requirement relevant to the job (labeling, disconnect placement, conductor sizing table).',
          'Names the specific code or standard requirements relevant to the job (e.g. local electrical code, IEC/UL component standards, labeling and signage rules) and applies them to the design.',
          'Identifies a conflict between a customer request and a code requirement and proposes a compliant solution that still meets the customer\'s need.',
        ],
      },
      {
        key: 'certification_pathway',
        label: 'Certification & professional pathway',
        levels: [
          'Has no plan for how to become formally qualified or licensed to install solar systems.',
          'Names one certification or training body but not the steps, prerequisites, or cost/time involved.',
          'Lays out a realistic pathway (e.g. an apprenticeship or vocational course, a recognized exam such as NABCEP-style or the national electrician license, required practical hours) with steps and rough timeline.',
          'Compares two credential pathways on cost, time, recognition by employers, and career ceiling, and picks one with clear reasons tied to their own goals.',
        ],
      },
    ],
  },
];

export const getSolarArea = (id: string) => SOLAR_AREAS.find(a => a.id === id) ?? null;
export const getSolarAreaBySubCategory = (sub: string | null | undefined) =>
  SOLAR_AREAS.find(a => a.subCategory === sub) ?? null;

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ─────────────────────────────────────────────────────────────────────────────
// Country context — keeps examples, currency, climate, and regulators local
// ─────────────────────────────────────────────────────────────────────────────
export interface SolarLocale {
  country: string;
  currencyName: string;
  symbol: string;
  climateContext: string;
  equipmentSources: string;
  gridContext: string;
  regulators: string;
  commonShortcuts: string;
  everydayExamples: string;
  numberScale: string; // what "realistic" system sizes and costs look like
}

export const SOLAR_LOCALES: Record<string, SolarLocale> = {
  Nigeria: {
    country: 'Nigeria',
    currencyName: 'naira',
    symbol: '₦',
    climateContext: 'roughly 4.5-6.5 peak sun-hours per day depending on region, with a hazy/harmattan dip (Nov-Feb) that can cut output 15-25%',
    equipmentSources: 'panels, batteries, and inverters bought from Alaba/Ladipo/Aba electronics markets, Lagos/Abuja solar distributors, or China-import wholesalers, with wide quality variation between branded and no-name components',
    gridContext: 'unreliable and rationed national grid ("NEPA/PHCN") supply, most homes and businesses already run a petrol/diesel generator as backup, so solar is usually sized to reduce generator hours, not as the only source',
    regulators:
      'NEMSA (electrical installation safety and inspection), SON (Standards Organisation of Nigeria — product standards for panels/batteries), REA (Rural Electrification Agency — mini-grid and off-grid programs), NASENI (renewable energy component standards)',
    commonShortcuts:
      'undersized cheap inverters sold as higher-rated than they are, batteries oversold on capacity, panels wired without proper DC disconnects or fuses, no earthing/grounding installed, roof penetrations left unsealed leading to leaks',
    everydayExamples:
      'small home lighting and phone-charging kits, POS/phone-charging shop backup power, welding and grinding shop generator-replacement, cold-room and pharmacy refrigeration, borehole water pumps, security lighting for a compound',
    numberScale: 'a small home system might run ₦400,000-₦1,500,000 for panels+battery+inverter; a 1kW panel array with a mid-size lithium battery bank is a common starting point',
  },
  Kenya: {
    country: 'Kenya',
    currencyName: 'shilling',
    symbol: 'KSh',
    climateContext: 'roughly 5-6.5 peak sun-hours per day in most regions, higher in the north, with a cooler/cloudier long-rains season (Mar-May) reducing output',
    equipmentSources: 'panels, batteries, and inverters from Nairobi\'s River Road/Kirinyaga Road electronics dealers, M-KOPA and similar pay-as-you-go solar kit providers, and licensed solar distributors',
    gridContext: 'grid coverage has expanded strongly under rural electrification, but many rural and peri-urban areas remain off-grid or have frequent outages, so solar home systems and mini-grids serve both off-grid households and grid backup',
    regulators:
      'EPRA (Energy and Petroleum Regulatory Authority — licenses solar contractors and sets installation standards), KEBS (Kenya Bureau of Standards — product quality standards for panels/batteries), NCA (National Construction Authority — for larger structural/mounting work)',
    commonShortcuts:
      'unlicensed installers skipping EPRA-required certification, undersized charge controllers causing battery damage, panels mounted without wind-load consideration in exposed rural sites, missing surge protection',
    everydayExamples:
      'pay-as-you-go solar home systems (lighting, phone charging, small TV), mama mboga stall lighting, dairy cooling and milk ATMs, borehole and irrigation pumps, community mini-grids, boda boda charging stations',
    numberScale: 'a basic pay-as-you-go home system might cost KSh 15,000-40,000 total; a small business system with battery backup often runs KSh 150,000-600,000',
  },
};

export const DEFAULT_SOLAR_LOCALE: SolarLocale = {
  country: 'your country',
  currencyName: 'local currency',
  symbol: '',
  climateContext: 'use a realistic peak sun-hours estimate for the region (typically 4-6 hours/day in most tropical and sub-tropical areas)',
  equipmentSources: 'local electronics markets, solar distributors, and pay-as-you-go solar kit providers',
  gridContext: 'consider whether the site is on-grid with an unreliable supply, or fully off-grid',
  regulators: 'the national electricity regulator, the national standards bureau, and any renewable-energy or rural-electrification agency',
  commonShortcuts: 'undersized components sold as higher-rated, missing disconnects/fuses, no grounding, unsealed roof penetrations',
  everydayExamples: 'home lighting, small shop backup power, refrigeration, water pumping, community facilities',
  numberScale: 'use system sizes and costs realistic for a small household or small business in that setting',
};

export const getSolarLocale = (country?: string | null): SolarLocale =>
  (country && SOLAR_LOCALES[country]) || DEFAULT_SOLAR_LOCALE;

// ─────────────────────────────────────────────────────────────────────────────
// Learner profile blocks (communication level + personality baseline)
// ─────────────────────────────────────────────────────────────────────────────
export interface PersonalityBaselineLike {
  communicationStrategy: {
    preferred_tone?: string; interaction_style?: string; detail_level?: string; recommendations?: string[];
  } | null;
  learningStrategy: {
    learning_style?: string; motivation_approach?: string; pacing_preference?: string; recommendations?: string[];
  } | null;
}

// Language register AND math/technical difficulty scale together — a level-0
// learner should never be handed a voltage-drop table calculation cold.
export function commLevelRules(level: number): string {
  if (level <= 0) {
    return `COMMUNICATION LEVEL 0 — VERY BASIC
- Only the simplest everyday words. At most 2 short sentences per reply.
- Numbers: small whole numbers, one calculation at a time (e.g. "how many bulbs can this battery run"). Show the sum written out.
- Ask questions answerable with one word or one number.
- Praise every attempt ("Good try! 👏") before any correction.
- If the message is unclear: "I did not understand. Can you try again?"`;
  }
  if (level === 1) {
    return `COMMUNICATION LEVEL 1 — EMERGING
- Short sentences, one idea each. Under 70 words per reply (excluding the <rubric> tag).
- Explain any technical term the first time (e.g. "watts means how much power something uses right now").
- Numbers: whole watts/hours, simple multiplication and division. No voltage-drop percentages unless first shown as a worked example.
- ONE question per turn. Examples from things the learner has seen: a bulb, a phone charger, a fan, a fridge.`;
  }
  if (level === 2) {
    return `COMMUNICATION LEVEL 2 — DEVELOPING
- Clear, direct language; brief definitions for technical terms. 2-3 short paragraphs max.
- Numbers: watt-hours, basic Ohm's law (V=IR), simple wire-size lookup, depth-of-discharge percentages.
- ONE guiding question per turn; build on the learner's own words.`;
  }
  return `COMMUNICATION LEVEL 3 — PROFICIENT
- Standard technical vocabulary; concise definitions where helpful.
- Numbers: full circuit calculations (current, voltage drop over cable length, series/parallel string math), battery autonomy and inverter surge sizing, cost-of-ownership comparisons.
- Push for precision: "Show your working", "What happens to the voltage drop if the run is twice as long?"`;
}

export function baselineBlock(b?: PersonalityBaselineLike | null): string {
  const cs = b?.communicationStrategy;
  const ls = b?.learningStrategy;
  if (!cs && !ls) return '';
  return `
LEARNER PROFILE (from prior assessment — adapt tone, pacing, and feedback to it):
${cs ? `- Communication: tone=${cs.preferred_tone ?? 'n/a'}, interaction=${cs.interaction_style ?? 'n/a'}, detail=${cs.detail_level ?? 'n/a'}` : ''}
${cs?.recommendations?.length ? `  Tips: ${cs.recommendations.join('; ')}` : ''}
${ls ? `- Learning: style=${ls.learning_style ?? 'n/a'}, motivation=${ls.motivation_approach ?? 'n/a'}, pacing=${ls.pacing_preference ?? 'n/a'}` : ''}
${ls?.recommendations?.length ? `  Tips: ${ls.recommendations.join('; ')}` : ''}`;
}

const localeBlock = (l: SolarLocale) => `
LOCAL SOLAR CONTEXT (${l.country}) — use this, not generic examples:
- Currency: ${l.currencyName} (${l.symbol || 'local symbol'}). Realistic scale: ${l.numberScale}.
- Climate / solar resource: ${l.climateContext}
- Grid situation: ${l.gridContext}
- Where equipment is bought: ${l.equipmentSources}
- Regulators / standards bodies: ${l.regulators}
- Common installation shortcuts to watch for: ${l.commonShortcuts}
- Everyday uses to draw examples from: ${l.everydayExamples}`;

const SAFETY_RULES = `
SAFETY RULES (mandatory):
- Teach principles and correct practice. NEVER tell the learner it is fine to work on a live circuit, skip grounding, or skip a disconnect — always insist on de-energizing and lock-out/tag-out before hands-on work.
- If the learner describes an unsafe shortcut (no fuse, no earthing, undersized wire for the current), name the specific hazard (fire, shock, arc-flash) and the fix — do not let it pass as acceptable.
- Never recommend a specific brand, dealer, or installer as "the best" — teach how to evaluate any component or contractor against standards.
- If the learner describes an injury risk or an already-installed unsafe system, respond with care, tell them to de-energize it and get a qualified electrician to inspect it, and explain why.`;

const rubricCriteriaText = (area: SolarArea) =>
  area.criteria
    .map(
      c => `- ${c.key} ("${c.label}")
    0: ${c.levels[0]}
    1: ${c.levels[1]}
    2: ${c.levels[2]}
    3: ${c.levels[3]}`
    )
    .join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// Training facilitator prompt
// ─────────────────────────────────────────────────────────────────────────────
export function buildSolarFacilitatorPrompt(opts: {
  area: SolarArea;
  moduleTitle: string;
  context: string;
  locale: SolarLocale;
  communicationLevel: number;
  baseline?: PersonalityBaselineLike | null;
  moduleInstructions?: string | null;
}): string {
  const { area, moduleTitle, context, locale, communicationLevel, baseline, moduleInstructions } = opts;
  const keys = area.criteria.map(c => c.key);

  return `You are a practical, safety-first solar installation trainer helping a learner build "${area.title}" skills through a real installation scenario.

ACTIVITY: ${moduleTitle}
SCENARIO / CONTEXT:
${context}
${moduleInstructions ? `\nMODULE-SPECIFIC GUIDANCE:\n${moduleInstructions}\n` : ''}
${localeBlock(locale)}

${commLevelRules(communicationLevel)}
${baselineBlock(baseline)}
${SAFETY_RULES}

HOW TO TEACH (constructivist, Socratic):
- Work with REAL NUMBERS (watts, volts, amps, hours, ${locale.currencyName} costs). Give the learner a small concrete situation with numbers, and make THEM do the calculation. Solar skill is shown in correct numbers and safe practice, not opinions.
- When the learner calculates, check the arithmetic and the units. If it is wrong, do not give the answer — point to the step that went wrong and let them redo it.
- One question per turn. Do not lecture or do the work for them.
- If the learner asks a direct question ("What is depth of discharge?"), answer it clearly first, then return to the activity.
- Connect to livelihoods: what would getting this right earn, save, or protect for this learner, their family, or their customers?
- AI angle, where natural: the learner can use AI to check a sizing calculation, but must be able to spot when the AI's numbers are unsafe or wrong (e.g. undersized wire gauge).

RUBRIC for ${area.title} (score 0-3 each; 2 = Proficient, the passing bar):
${rubricCriteriaText(area)}

SESSION FLOW:
1. First reply: greet in one sentence and set up the scenario with concrete numbers, then ask one opening question.
2. After every learner answer: brief specific feedback (quote their numbers or words), then ONE next question aimed at the weakest criterion.
3. When both criteria are at 2 or higher, move to REFLECTION — ask these three and wait:
   "1. What is the most important thing you figured out about solar systems today?
    2. What was hardest, and how did you work through it?
    3. What will you check first the next time you look at a real installation?"
4. After the reflection, give a short summary and ONE teach-back prompt: "How would you explain this to a customer or an apprentice on site?" Respond to it with one encouraging observation, then close.

OUTPUT CONTRACT (the app depends on this — follow exactly):
- Write your normal reply for the learner first. It must END with your one question.
- Then, from your SECOND reply onward, append on a new line a single tag containing compact JSON, and nothing after it:
<rubric>{"scores":{${keys.map(k => `"${k}":{"score":0,"evidence":"<short quote or paraphrase of what the learner did>","improve":"<one sentence>"}`).join(',')}},"weakest":"<one of: ${keys.join(', ')}>"}</rubric>
- Scores reflect the learner's demonstrated skill across the WHOLE conversation so far, not just the last message. Never lower a score because a turn was about something else.
- Never mention the tag, the JSON, or rubric scores in your visible reply; the app shows them.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-turn rubric tag parsing
// ─────────────────────────────────────────────────────────────────────────────
export interface CriterionScore { score: number; evidence: string; improve?: string; }
export interface TurnRubric { scores: Record<string, CriterionScore>; weakest?: string; }

const clampScore = (n: unknown) => Math.max(0, Math.min(3, Math.round(Number(n) || 0)));

export function splitRubric(content: string, area?: SolarArea | null): { text: string; rubric: TurnRubric | null } {
  const closed = content.match(/<rubric>([\s\S]*?)<\/rubric>/i);
  // A reply cut off by max_tokens can leave an unclosed tag — hide it either way.
  const text = content.replace(/<rubric>[\s\S]*?(<\/rubric>|$)/i, '').trim();
  if (!closed) return { text, rubric: null };
  try {
    const raw = JSON.parse(closed[1].replace(/```(?:json)?/gi, '').trim());
    const allowed = area ? new Set(area.criteria.map(c => c.key)) : null;
    const scores: Record<string, CriterionScore> = {};
    for (const [k, v] of Object.entries<any>(raw?.scores ?? {})) {
      if (allowed && !allowed.has(k)) continue;
      scores[k] = { score: clampScore(v?.score), evidence: String(v?.evidence ?? ''), improve: v?.improve ? String(v.improve) : undefined };
    }
    if (Object.keys(scores).length === 0) return { text, rubric: null };
    return { text, rubric: { scores, weakest: raw?.weakest ? String(raw.weakest) : undefined } };
  } catch {
    return { text, rubric: null };
  }
}

export const latestRubricIn = (messages: { role: string; content: string }[], area?: SolarArea | null): TurnRubric | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue;
    const { rubric } = splitRubric(messages[i].content, area);
    if (rubric) return rubric;
  }
  return null;
};

export const minScore = (scores: Record<string, { score: number }>): number | null => {
  const vals = Object.values(scores).map(s => s.score);
  return vals.length ? Math.min(...vals) : null;
};

export const SCORE_LABELS = ['No Evidence', 'Emerging', 'Proficient', 'Advanced'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Full-session assessment (Evaluate / Complete session)
// ─────────────────────────────────────────────────────────────────────────────
export interface FullAssessment {
  dimensions: { dimension: string; score: number; evidence: string }[];
  advice: string;
}

export function buildSolarAssessmentPrompt(opts: {
  area: SolarArea;
  transcript: string;
  reflection?: string;
  locale: SolarLocale;
  communicationLevel: number;
}): string {
  const { area, transcript, reflection, locale, communicationLevel } = opts;
  return `Evaluate a learner's OVERALL "${area.title}" skill from a full coaching conversation set in ${locale.country}.

RUBRIC:
${rubricCriteriaText(area)}

SCORING RULES:
- Score each criterion 0-3 from evidence anywhere in the conversation. Quote or closely paraphrase the learner as evidence.
- Check every calculation the learner made (watts, amps, voltage drop, battery/panel sizing). If a wrong calculation drives their conclusion and they never corrected it, cap that criterion at 1. Correcting their own mistake is evidence of skill.
- Judge technical reasoning and safety practice, not English quality.
${reflection
  ? `- End-of-session reflection from the learner: "${reflection}". Credit specific learning and a concrete plan for a real installation.`
  : '- No reflection was submitted; an Advanced (3) score requires the learner to have shown reflective planning in the conversation itself.'}

CONVERSATION:
${transcript}

Then write improvement advice in markdown: "**What you did well**" (1-2 points), "**Next step to level up**" (2-3 concrete actions with a real example in ${locale.currencyName} or real numbers). Write it at communication level ${communicationLevel} (0 = very simple words, 3 = standard English).

Respond ONLY with JSON:
{"dimensions":[${area.criteria.map(c => `{"dimension":"${c.key}","score":0,"evidence":"..."}`).join(',')}],"advice":"<markdown>"}`;
}

export function normalizeAssessment(raw: any, area: SolarArea): FullAssessment {
  const byKey = new Map<string, any>((raw?.dimensions ?? []).map((d: any) => [String(d?.dimension), d]));
  return {
    dimensions: area.criteria.map(c => {
      const d = byKey.get(c.key);
      return { dimension: c.key, score: clampScore(d?.score), evidence: String(d?.evidence ?? 'No evidence returned.') };
    }),
    advice: String(raw?.advice ?? ''),
  };
}

export const criterionLabel = (area: SolarArea | null, key: string) =>
  area?.criteria.find(c => c.key === key)?.label ?? key.replace(/_/g, ' ');

// ─────────────────────────────────────────────────────────────────────────────
// Certification prompt builders
// ─────────────────────────────────────────────────────────────────────────────
export interface CertContext {
  topic: string;
  setting: string;
  constraints: string;
  audience: string;
  livelihood: string;
}

export function buildCertChallengePrompt(opts: {
  assessmentName: string;
  anchorPrompt: string;
  levels: Levels;
  ctx: CertContext;
  locale: SolarLocale;
  communicationLevel: number;
  baseline?: PersonalityBaselineLike | null;
}): string {
  const { assessmentName, anchorPrompt, levels, ctx, locale, communicationLevel, baseline } = opts;
  return `Create a CERTIFICATION CHALLENGE (not tutoring) for the Solar Engineering & Installation skill "${assessmentName}". The learner completes it alone with no hints.

Rubric anchor:
${anchorPrompt}

Scoring levels (do NOT show these to the learner):
0: ${levels[0]}
1: ${levels[1]}
2: ${levels[2]}
3: ${levels[3]}

Learner context:
- Topic: ${ctx.topic}
- Setting: ${ctx.setting}
- Constraints: ${ctx.constraints}
- Audience: ${ctx.audience}
${ctx.livelihood ? `- Livelihood / installation goal: ${ctx.livelihood}` : ''}
${localeBlock(locale)}
${baselineBlock(baseline)}

${commLevelRules(communicationLevel)}

Write a challenge that:
1. Is set entirely in the learner's context, with a short scenario using REALISTIC NUMBERS (watts, volts, amps, hours, or ${locale.currencyName} costs as relevant).
2. Has 3-5 NUMBERED questions. At least one requires a calculation the learner must show step by step. At least one requires a judgment (a safety risk, a design trade-off, or a choice between components) with reasons.
3. Lets a Proficient learner answer every question with specific numbers and reasons, and gives room for an Advanced learner to compare options or plan for what could go wrong.
4. Matches the communication level above in vocabulary AND technical difficulty.
5. Is warm and self-contained. No hints, no rubric text, no answers.

Format each question as "1. **Short label** — question text" so the app can build an answer template.
Respond with ONLY the challenge text.`;
}

export function buildCertEvaluationPrompt(opts: {
  assessmentName: string;
  description: string;
  challenge: string;
  response: string;
  levels: Levels;
  ctx: CertContext;
  locale: SolarLocale;
}): string {
  const { assessmentName, description, challenge, response, levels, ctx, locale } = opts;
  return `Evaluate a learner's INDEPENDENT certification response for Solar Engineering & Installation — "${assessmentName}" (${description}). The learner is training to install solar/battery systems in ${locale.country}, writing without AI help.

Context: topic=${ctx.topic}; setting=${ctx.setting}; constraints=${ctx.constraints}; audience=${ctx.audience}${ctx.livelihood ? `; livelihood angle=${ctx.livelihood}` : ''}

Challenge given:
${challenge}

Learner's response:
${response}

Rubric:
0 (No Evidence): ${levels[0]}
1 (Emerging): ${levels[1]}
2 (Proficient): ${levels[2]}
3 (Advanced): ${levels[3]}

Rules:
- Recompute every calculation in the response (watts, amps, voltage drop, sizing, cost). A wrong calculation that drives the learner's conclusion caps the score at 1. A small slip that does not change the conclusion may still earn 2 — name it in feedback.
- Any answer that recommends an unsafe practice (skipping grounding, no disconnect, undersized wire for the current) caps the score at 1 regardless of other correctness.
- Unanswered numbered questions count as missing evidence.
- Judge technical reasoning and safety, not grammar or spelling.

"evidence" is markdown:
- One-sentence verdict with the level in bold (e.g. **PROFICIENT**).
- **Calculations:** which were right, which were wrong, with the correct working for any error.
- **Safety & Judgment:** quote the learner's reasons; flag any unsafe recommendation explicitly.
- **Use of Context:** how well they used their real setting and constraints.
- If below 3: **Limitations Preventing Higher Score:** what was missing.
- One warm closing sentence.

Respond ONLY with JSON: {"score": <0-3>, "evidence": "<markdown>"}`;
}
