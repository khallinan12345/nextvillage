// src/lib/financialLiteracy.ts
//
// Single source of truth for the Financial Literacy training + certification
// pages: skill areas, rubric criteria, country-specific money context, and the
// prompt builders both pages share.
//
// Design notes
// - Each AREA is one tab on the training page AND one assessment on the
//   certification page (area.subCategory === certification_assessments.assessment_name
//   === learning_modules.sub_category). One string ties all three together.
// - Scores live in dashboard.rubric_scores (jsonb) instead of one column per
//   criterion, so there are no 63-character truncated column names to maintain.
// - The facilitator returns a machine-readable <rubric>{json}</rubric> tag on
//   every scored turn, so per-turn scoring needs no second API call.

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
export const FINLIT_CATEGORY = 'Financial Literacy';          // learning_modules.category
export const FINLIT_CERT_NAME = 'Financial Literacy';         // certification_assessments.certification_name
export const FINLIT_CERT_ACTIVITY = 'Financial Literacy Certification'; // dashboard.activity for the cert row

// chatClient routes models by `page`. Reusing the Skills key keeps the Groq
// routing until a 'FinancialLiteracyPage' key is registered in chatClient.
export const FINLIT_CHAT_PAGE = 'SkillsDevelopmentPage';

// ─────────────────────────────────────────────────────────────────────────────
// Areas & rubric criteria
// ─────────────────────────────────────────────────────────────────────────────
export type Levels = [string, string, string, string]; // 0 No Evidence · 1 Emerging · 2 Proficient · 3 Advanced

export interface FinLitCriterion {
  key: string;
  label: string;
  levels: Levels;
}

export interface FinLitArea {
  id: string;             // URL-safe id (?area=...)
  subCategory: string;    // learning_modules.sub_category and certification assessment_name
  title: string;
  description: string;
  icon: 'wallet' | 'piggy' | 'credit' | 'shield' | 'store';
  criteria: [FinLitCriterion, FinLitCriterion];
}

export const FINLIT_AREAS: FinLitArea[] = [
  {
    id: 'budgeting',
    subCategory: 'Budgeting and Cash Flow',
    title: 'Budgeting & Cash Flow',
    description: 'Know where your money comes from, where it goes, and plan for the lean weeks',
    icon: 'wallet',
    criteria: [
      {
        key: 'tracking',
        label: 'Tracking money in and out',
        levels: [
          'Cannot say where money came from or went; no record of any kind.',
          'Lists some income or spending but misses items, mixes up amounts, or the totals do not add up.',
          'Keeps a complete, accurate record for a period, separates income from spending, and totals it correctly.',
          'Uses the record to spot patterns (leaks, peak days, seasonal dips) and explains what to change because of them.',
        ],
      },
      {
        key: 'planning',
        label: 'Planning ahead',
        levels: [
          'No plan; spends as money arrives.',
          'States a goal or a rough plan but ignores irregular income or confuses needs with wants.',
          'Builds a realistic plan that covers needs first, sets money aside, and accounts for irregular or seasonal income.',
          'Plans for several scenarios (good week, bad week, price rise) and adjusts the plan with clear reasons.',
        ],
      },
    ],
  },
  {
    id: 'saving',
    subCategory: 'Saving and Resilience',
    title: 'Saving & Resilience',
    description: 'Save on purpose, choose safe places to keep money, and prepare for shocks',
    icon: 'piggy',
    criteria: [
      {
        key: 'saving_strategy',
        label: 'Saving strategy',
        levels: [
          'No saving goal or method.',
          'Wants to save but has no amount, timeline, or method; or picks a method without thinking about safety or access.',
          'Sets a specific goal with amount and time, picks a method (group, bank, wallet) and explains its safety and access trade-offs.',
          'Compares several methods on safety, access, cost, and inflation, and combines them deliberately.',
        ],
      },
      {
        key: 'risk_preparedness',
        label: 'Preparing for shocks',
        levels: [
          'Does not consider emergencies or rising prices.',
          'Mentions that emergencies happen but has no plan or buffer.',
          'Plans a buffer for a named risk (illness, flood, lost stock) and explains how inflation erodes cash savings.',
          'Weighs several protections (buffer, group support, insurance, spreading risk) against their costs and chooses with reasons.',
        ],
      },
    ],
  },
  {
    id: 'credit',
    subCategory: 'Credit and Debt',
    title: 'Credit & Debt',
    description: 'Work out what a loan really costs and decide when borrowing makes sense',
    icon: 'credit',
    criteria: [
      {
        key: 'cost_of_credit',
        label: 'True cost of borrowing',
        levels: [
          'Cannot say how much a loan will cost to repay.',
          'Knows interest exists but calculates the cost wrongly or ignores fees and repayment period.',
          'Correctly calculates total repayment including interest and fees, and compares two offers.',
          'Converts different offers (daily, weekly, monthly rates, fees) to a comparable cost and explains which is cheaper and why.',
        ],
      },
      {
        key: 'borrowing_judgment',
        label: 'Borrowing judgment',
        levels: [
          'Would borrow from anyone for anything.',
          'Senses some loans are risky but cannot say why or check the lender.',
          'Separates borrowing that earns money from borrowing that only spends it, checks repayment capacity, and checks the lender is registered.',
          'Plans repayment against realistic income, names what happens if income drops, and considers alternatives to borrowing.',
        ],
      },
    ],
  },
  {
    id: 'digital-money',
    subCategory: 'Digital Money Safety',
    title: 'Digital Money & Fraud Safety',
    description: 'Use mobile money and bank apps safely and spot scams before they cost you',
    icon: 'shield',
    criteria: [
      {
        key: 'safe_transactions',
        label: 'Safe transactions',
        levels: [
          'Shares PINs or codes, or cannot confirm whether money arrived.',
          'Knows some rules but applies them inconsistently; confirms payments by SMS or screenshot only.',
          'Protects PIN/OTP, confirms payments in the app or with the provider, and knows agent fees before paying.',
          'Explains why each safety step matters and builds a routine others can follow.',
        ],
      },
      {
        key: 'scam_detection',
        label: 'Spotting scams',
        levels: [
          'Would join a "guaranteed" high-return scheme or trust an unknown caller.',
          'Suspects something is off but cannot name the warning signs or how to check.',
          'Names specific warning signs (guaranteed returns, pressure, recruit-to-earn, requests for codes) and checks registration with the regulator.',
          'Calculates why the promised returns are impossible and explains it convincingly to someone who wants to join.',
        ],
      },
    ],
  },
  {
    id: 'pricing-profit',
    subCategory: 'Pricing and Profit',
    title: 'Pricing & Profit',
    description: 'Price for real profit and use your numbers to run a small business',
    icon: 'store',
    criteria: [
      {
        key: 'cost_and_pricing',
        label: 'Costing and pricing',
        levels: [
          'Sets prices by guessing or copying neighbours.',
          'Counts some costs (stock) but misses others (transport, spoilage, fuel, own time); margin math is wrong or missing.',
          'Counts all main costs per unit, calculates margin correctly, and sets a price that covers costs and competes.',
          'Tests prices against demand and competitors, and explains the trade-off between volume and margin.',
        ],
      },
      {
        key: 'profit_decisions',
        label: 'Using profit wisely',
        levels: [
          'Business and household money are mixed; cannot say if the business made a profit.',
          'Knows profit matters but cannot calculate it or separate business money.',
          'Separates business money, calculates profit for a period, and decides how much to reinvest, save, or take home.',
          'Uses records over time to decide on growth (new stock, equipment, hiring) and justifies it with numbers.',
        ],
      },
    ],
  },
];

export const getFinLitArea = (id: string) => FINLIT_AREAS.find(a => a.id === id) ?? null;
export const getFinLitAreaBySubCategory = (sub: string | null | undefined) =>
  FINLIT_AREAS.find(a => a.subCategory === sub) ?? null;

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ─────────────────────────────────────────────────────────────────────────────
// Country context — keeps examples, currency, and regulators local
// ─────────────────────────────────────────────────────────────────────────────
export interface FinLitLocale {
  country: string;
  currencyName: string;
  symbol: string;
  savingsGroups: string;
  mobileMoney: string;
  regulators: string;
  commonScams: string;
  everydayExamples: string;
  numberScale: string; // what "realistic" amounts look like for a young learner
}

export const FINLIT_LOCALES: Record<string, FinLitLocale> = {
  Nigeria: {
    country: 'Nigeria',
    currencyName: 'naira',
    symbol: '₦',
    savingsGroups: 'ajo / esusu contribution groups and cooperative thrift societies',
    mobileMoney: 'OPay, Moniepoint, PalmPay, bank USSD codes, and POS agents',
    regulators:
      'CBN (banks, microfinance banks, mobile money operators), SEC Nigeria (investment schemes), FCCPC (digital loan apps must be registered), NDIC (deposit insurance)',
    commonScams:
      '"double your money" Ponzi schemes (e.g. MMM, CBEX), fake transfer alerts, callers asking for BVN or OTP, unregistered loan apps that harass the borrower\'s contacts',
    everydayExamples:
      'fish and periwinkle sellers, garri and plantain traders, okada riders, tailors, phone-charging and POS businesses, school fees',
    numberScale: 'a small trader might earn ₦3,000–₦15,000 on a market day; a sachet of water costs about ₦50',
  },
  Kenya: {
    country: 'Kenya',
    currencyName: 'shilling',
    symbol: 'KSh',
    savingsGroups: 'chamas, merry-go-rounds, table banking groups, and SACCOs',
    mobileMoney: 'M-Pesa, Fuliza overdrafts, Airtel Money, and M-Pesa agents',
    regulators:
      'CBK (banks and licensed digital credit providers), CMA (investment schemes), SASRA (SACCOs), KDIC (deposit insurance)',
    commonScams:
      'fake "I sent money to you by mistake" SMS asking for a reversal, pyramid and forex schemes promising fixed high returns, SIM-swap fraud, unlicensed digital lenders',
    everydayExamples:
      'mama mboga vegetable stalls, boda boda riders, mitumba clothes sellers, jua kali workshops, school fees',
    numberScale: 'a small trader might earn KSh 300–1,500 on a market day; a loaf of bread costs about KSh 65',
  },
};

export const DEFAULT_FINLIT_LOCALE: FinLitLocale = {
  country: 'your country',
  currencyName: 'local currency',
  symbol: '',
  savingsGroups: 'rotating savings groups, savings cooperatives, and village savings and loan associations',
  mobileMoney: 'mobile money wallets and agents',
  regulators: 'the central bank, the securities/capital-markets regulator, and the consumer-protection agency',
  commonScams: 'guaranteed-return investment schemes, fake payment messages, callers asking for PINs or codes, unregistered loan apps',
  everydayExamples: 'market traders, farmers, transport riders, tailors, school fees',
  numberScale: 'use amounts a young person in a rural community would realistically handle',
};

export const getFinLitLocale = (country?: string | null): FinLitLocale =>
  (country && FINLIT_LOCALES[country]) || DEFAULT_FINLIT_LOCALE;

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

// Language register AND number difficulty scale together — a level-0 learner
// should never be handed a compound-interest problem.
export function commLevelRules(level: number): string {
  if (level <= 0) {
    return `COMMUNICATION LEVEL 0 — VERY BASIC
- Only the simplest everyday words. At most 2 short sentences per reply.
- Numbers: small round amounts, one operation at a time (add OR subtract). Show the sum written out.
- Ask questions answerable with one word or one number.
- Praise every attempt ("Good try! 👏") before any correction.
- If the message is unclear: "I did not understand. Can you try again?"`;
  }
  if (level === 1) {
    return `COMMUNICATION LEVEL 1 — EMERGING
- Short sentences, one idea each. Under 70 words per reply (excluding the <rubric> tag).
- Explain any money word the first time (e.g. "profit means the money left after you pay your costs").
- Numbers: whole amounts, add/subtract/multiply. No percentages unless you first show them as "₦10 out of every ₦100".
- ONE question per turn. Examples from market, farm, family, school.`;
  }
  if (level === 2) {
    return `COMMUNICATION LEVEL 2 — DEVELOPING
- Clear, direct language; brief definitions for money terms. 2–3 short paragraphs max.
- Numbers: percentages, simple interest, weekly vs monthly comparisons.
- ONE guiding question per turn; build on the learner's own words.`;
  }
  return `COMMUNICATION LEVEL 3 — PROFICIENT
- Standard vocabulary; concise definitions where helpful.
- Numbers: compound interest, inflation-adjusted savings, margin vs markup, comparing loan offers with different fee structures.
- Push for precision: "Show me the calculation", "What happens if prices rise 20%?"`;
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

const localeBlock = (l: FinLitLocale) => `
LOCAL MONEY CONTEXT (${l.country}) — use this, not generic Western examples:
- Currency: ${l.currencyName} (${l.symbol || 'local symbol'}). Realistic scale: ${l.numberScale}.
- Savings groups: ${l.savingsGroups}
- Digital money: ${l.mobileMoney}
- Regulators to check a lender or investment: ${l.regulators}
- Common scams: ${l.commonScams}
- Everyday livelihoods to draw examples from: ${l.everydayExamples}`;

const SAFETY_RULES = `
SAFETY RULES (mandatory):
- Teach principles and how to check things. NEVER recommend a specific investment, coin, trading platform, loan app, or lender.
- If the learner mentions a scheme that promises fixed high returns or pays for recruiting, say clearly it has the signs of a Ponzi scheme and show how to check the regulator — without mocking anyone who joined.
- Never ask for, or encourage sharing, real PINs, OTPs, BVN/ID numbers, or account numbers — even as an example. Use obviously fake ones like "1234".
- If the learner describes real money trouble (debt they cannot repay, a lender threatening them), respond with care, suggest talking to a trusted adult or the program facilitator, and name the consumer-protection regulator.`;

const rubricCriteriaText = (area: FinLitArea) =>
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
export function buildFinLitFacilitatorPrompt(opts: {
  area: FinLitArea;
  moduleTitle: string;
  context: string;
  locale: FinLitLocale;
  communicationLevel: number;
  baseline?: PersonalityBaselineLike | null;
  moduleInstructions?: string | null;
}): string {
  const { area, moduleTitle, context, locale, communicationLevel, baseline, moduleInstructions } = opts;
  const keys = area.criteria.map(c => c.key);

  return `You are a warm, practical money coach helping a young learner build "${area.title}" skills through a real situation from their own life or community.

ACTIVITY: ${moduleTitle}
SCENARIO / CONTEXT:
${context}
${moduleInstructions ? `\nMODULE-SPECIFIC GUIDANCE:\n${moduleInstructions}\n` : ''}
${localeBlock(locale)}

${commLevelRules(communicationLevel)}
${baselineBlock(baseline)}
${SAFETY_RULES}

HOW TO TEACH (constructivist, Socratic):
- Work with REAL NUMBERS in ${locale.currencyName}. Give the learner a small concrete situation with amounts, and make THEM do the calculation. Money skill is shown in numbers, not opinions.
- When the learner calculates, check the arithmetic. If it is wrong, do not give the answer — point to the step that went wrong and let them redo it.
- One question per turn. Do not lecture or do the work for them.
- If the learner asks a direct question ("What is interest?"), answer it clearly first, then return to the activity.
- Connect to livelihoods: what would doing this well earn, save, or protect for this learner or their family?
- AI angle, where natural: the learner can use AI to check a calculation or draft a budget, but must be able to spot when the AI's numbers are wrong.

RUBRIC for ${area.title} (score 0–3 each; 2 = Proficient, the passing bar):
${rubricCriteriaText(area)}

SESSION FLOW:
1. First reply: greet in one sentence and set up the scenario with concrete numbers, then ask one opening question.
2. After every learner answer: brief specific feedback (quote their words or numbers), then ONE next question aimed at the weakest criterion.
3. When both criteria are at 2 or higher, move to REFLECTION — ask these three and wait:
   "1. What is the most important thing you figured out about money today?
    2. What was hardest, and how did you work through it?
    3. What will you do differently with real money this week?"
4. After the reflection, give a short summary and ONE teach-back prompt: "How would you explain this to a family member or a trader in your market?" Respond to it with one encouraging observation, then close.

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

export function splitRubric(content: string, area?: FinLitArea | null): { text: string; rubric: TurnRubric | null } {
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

export const latestRubricIn = (messages: { role: string; content: string }[], area?: FinLitArea | null): TurnRubric | null => {
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

export function buildFinLitAssessmentPrompt(opts: {
  area: FinLitArea;
  transcript: string;
  reflection?: string;
  locale: FinLitLocale;
  communicationLevel: number;
}): string {
  const { area, transcript, reflection, locale, communicationLevel } = opts;
  return `Evaluate a young learner's OVERALL "${area.title}" skill from a full coaching conversation set in ${locale.country}.

RUBRIC:
${rubricCriteriaText(area)}

SCORING RULES:
- Score each criterion 0–3 from evidence anywhere in the conversation. Quote or closely paraphrase the learner as evidence.
- Check every calculation the learner made. If a wrong calculation drives their conclusion and they never corrected it, cap that criterion at 1. Correcting their own mistake is evidence of skill.
- Judge money reasoning, not English quality.
${reflection
  ? `- End-of-session reflection from the learner: "${reflection}". Credit specific learning and a concrete plan for real money.`
  : '- No reflection was submitted; an Advanced (3) score requires the learner to have shown reflective planning in the conversation itself.'}

CONVERSATION:
${transcript}

Then write improvement advice in markdown: "**What you did well**" (1–2 points), "**Next step to level up**" (2–3 concrete actions with a real-money example in ${locale.currencyName}). Write it at communication level ${communicationLevel} (0 = very simple words, 3 = standard English).

Respond ONLY with JSON:
{"dimensions":[${area.criteria.map(c => `{"dimension":"${c.key}","score":0,"evidence":"..."}`).join(',')}],"advice":"<markdown>"}`;
}

export function normalizeAssessment(raw: any, area: FinLitArea): FullAssessment {
  const byKey = new Map<string, any>((raw?.dimensions ?? []).map((d: any) => [String(d?.dimension), d]));
  return {
    dimensions: area.criteria.map(c => {
      const d = byKey.get(c.key);
      return { dimension: c.key, score: clampScore(d?.score), evidence: String(d?.evidence ?? 'No evidence returned.') };
    }),
    advice: String(raw?.advice ?? ''),
  };
}

export const criterionLabel = (area: FinLitArea | null, key: string) =>
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
  locale: FinLitLocale;
  communicationLevel: number;
  baseline?: PersonalityBaselineLike | null;
}): string {
  const { assessmentName, anchorPrompt, levels, ctx, locale, communicationLevel, baseline } = opts;
  return `Create a CERTIFICATION CHALLENGE (not tutoring) for the Financial Literacy skill "${assessmentName}". The learner completes it alone with no hints.

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
${ctx.livelihood ? `- Livelihood / money angle: ${ctx.livelihood}` : ''}
${localeBlock(locale)}
${baselineBlock(baseline)}

${commLevelRules(communicationLevel)}

Write a challenge that:
1. Is set entirely in the learner's context, with a short scenario using REALISTIC AMOUNTS in ${locale.currencyName}.
2. Has 3–5 NUMBERED questions. At least one requires a calculation the learner must show step by step. At least one requires a judgment (a risk, a trade-off, or a choice between options) with reasons.
3. Lets a Proficient learner answer every question with specific numbers and reasons, and gives room for an Advanced learner to compare options or plan for what could go wrong.
4. Matches the communication level above in vocabulary AND number difficulty.
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
  locale: FinLitLocale;
}): string {
  const { assessmentName, description, challenge, response, levels, ctx, locale } = opts;
  return `Evaluate a learner's INDEPENDENT certification response for Financial Literacy — "${assessmentName}" (${description}). The learner is a young person in ${locale.country} writing without AI help.

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
- Recompute every calculation in the response. A wrong calculation that drives the learner's conclusion caps the score at 1. A small slip that does not change the conclusion may still earn 2 — name it in feedback.
- Unanswered numbered questions count as missing evidence.
- Judge money reasoning, not grammar or spelling.

"evidence" is markdown:
- One-sentence verdict with the level in bold (e.g. **PROFICIENT**).
- **Calculations:** which were right, which were wrong, with the correct working for any error.
- **Judgment & Reasoning:** quote the learner's reasons.
- **Use of Context:** how well they used their real setting and livelihood.
- If below 3: **Limitations Preventing Higher Score:** what was missing.
- One warm closing sentence.

Respond ONLY with JSON: {"score": <0-3>, "evidence": "<markdown>"}`;
}
