// api/business-task-instruction.ts
// Two responsibilities behind one route, mirroring how the client calls it:
//
// 1. Default mode — returns one adaptive task instruction per navigation event
//    for the AI for Business workshop. Each instruction has 2 sequential
//    sub-tasks, each paired with a "why this matters" teaching commentary
//    shown before the question.
//
// 2. mode: 'critique' — evaluates the learner's response to the current
//    sub-task question and returns { hasSuggestions, feedback }.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// ─── Cost logger (fire-and-forget, mirrors chat.js pattern) ──────────────────
function logCost(inputTokens: number, outputTokens: number, cacheHitTokens = 0, cacheWriteTokens = 0) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || (!inputTokens && !outputTokens)) return;

  const MTok = 1_000_000;
  const standardInput = Math.max(0, inputTokens - cacheHitTokens - cacheWriteTokens);
  const estimatedCost =
    (standardInput    / MTok) * 3.00  +
    (cacheWriteTokens / MTok) * 3.75  +
    (cacheHitTokens   / MTok) * 0.30  +
    (outputTokens     / MTok) * 15.00;

  fetch(`${supabaseUrl}/rest/v1/api_cost_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      page:               'AIForBusinessPage',
      provider:           'anthropic',
      model:              ANTHROPIC_MODEL,
      action:             'generate',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_hit_tokens:   cacheHitTokens,
      cache_write_tokens: cacheWriteTokens,
      estimated_cost_usd: estimatedCost,
      logged_at:          new Date().toISOString(),
    }),
  }).catch(() => {}); // never block the response for logging
}

// Grade level scale: 1=Elementary, 2=Middle School, 3=High School, 4=Adult Learner (18+)
const GRADE_LINE: Record<number, string> = {
  1: 'The learner is in elementary school (grades 3-5, ages 8-11). Use very simple words and short sentences. Be extra encouraging.',
  2: 'The learner is in middle school (grades 6-8, ages 11-14). Use clear, age-appropriate language.',
  3: 'The learner is in high school (grades 9-12, ages 14-18). You can use more sophisticated language.',
  4: 'The learner is an adult (18+). Use clear, professional language — treat them as a capable adult, not a classroom student.',
};

function personalitySection(communicationStrategy: any, learningStrategy: any, gradeLevel: any): string {
  const commStr  = communicationStrategy ? JSON.stringify(communicationStrategy) : null;
  const learnStr = learningStrategy      ? JSON.stringify(learningStrategy)      : null;
  const gradeStr = gradeLevel && GRADE_LINE[gradeLevel] ? GRADE_LINE[gradeLevel] : null;
  if (!commStr && !learnStr && !gradeStr) return '';
  return '\n\nLEARNER PROFILE — adapt vocabulary and tone to match:\n'
    + (commStr  ? `Communication strategy: ${commStr}\n` : '')
    + (learnStr ? `Learning strategy: ${learnStr}\n`     : '')
    + (gradeStr ? `Grade level: ${gradeStr}\n`           : '');
}

interface SubTaskSeed { teaching: string; question: string; }
interface TaskSeed { focus: string; steps: [SubTaskSeed, SubTaskSeed]; }

// Ported from the client-side fallback content in AIForBusinessPage.tsx so
// the server-generated instructions and the offline fallback stay aligned.
const TASK_SEEDS: Record<string, TaskSeed> = {
  spot_opportunity: {
    focus: 'spotting a real business opportunity in their community',
    steps: [
      { teaching: 'The best businesses do not start with a product — they start with a problem. Walk around your community and ask: what takes too long, costs too much, or does not exist yet? That gap is where your business lives.',
        question: 'What problem have you noticed in your community, your school, or among the people around you that AI could help solve? Describe it in 2–3 sentences. Be specific — name the people and the situation.' },
      { teaching: 'Your AI skills are not just technical abilities — they are tools that solve real problems. A student who can build an AI image generator can save a market trader hours of design work. That is a business.',
        question: 'Which AI skill you have learned (image creation, voice creation, content writing, website building, workflows) best matches the problem you described? How does it solve the problem specifically?' },
    ],
  },
  know_customer: {
    focus: 'defining one specific first customer',
    steps: [
      { teaching: 'The biggest mistake new business owners make is trying to sell to "everyone." The most successful first businesses sell to one specific person — someone you can name, find, and speak to this week.',
        question: 'Describe your first customer as if they were a real person you know. Give them a name. How old are they? What do they do for work? What does their typical day look like? What frustrates them that your service could fix?' },
      { teaching: 'Knowing what your customer already spends money on is the fastest way to find out if they will pay for your service. If they spend on similar things, they will likely spend on yours.',
        question: 'Does your customer already pay for anything similar to your service — a graphic designer, a typist, a social media person? How much do they currently pay, or what do they do without? This tells you your market price.' },
    ],
  },
  design_offer: {
    focus: 'turning a skill into a specific, sellable offer',
    steps: [
      { teaching: 'An offer is not a skill — it is a specific result for a specific person. "I do AI content writing" is a skill. "I write 10 WhatsApp product descriptions for your clothing business in 24 hours" is an offer. The second one is something a customer can say yes to.',
        question: 'Write your offer as one clear sentence: "I help [type of customer] to [specific result] in [timeframe] using [AI tool]." Try writing 2–3 versions and we will improve the best one.' },
      { teaching: 'The best offers solve a pain that the customer already feels every day. If your customer has to explain why they need it, the offer is not specific enough yet.',
        question: 'What is the single biggest pain your offer removes for the customer? Describe the "before" (without your service) and the "after" (with your service) in concrete terms.' },
    ],
  },
  business_model: {
    focus: 'choosing how the business actually makes money',
    steps: [
      { teaching: 'There are four simple ways to make money from an AI service: charge per job (one payment each time), charge a monthly retainer (regular monthly fee), charge per piece (per post, per image, per article), or charge a setup fee plus maintenance. Each suits a different service and customer.',
        question: 'Which payment model fits your offer best — and why? Think about what is easiest for your customer to pay and what gives you the most predictable income. Describe your choice and reasoning.' },
      { teaching: 'In most Nigerian communities, trust is built before money changes hands. Many first customers start as free trials or a deeply discounted first job. This is not weakness — it is strategy. A happy first customer becomes a reference that brings five more.',
        question: 'How will you handle your first customer? Will you offer a free sample, a discounted first job, or full price? What would you need to see from the relationship before asking for full payment?' },
    ],
  },
  build_offer: {
    focus: 'writing the message that goes to a real customer',
    steps: [
      { teaching: 'Your offer message is what you actually send to a potential customer — on WhatsApp, in person, or on social media. It should be short enough to read in 30 seconds, clear enough that they understand immediately, and compelling enough that they ask a follow-up question.',
        question: 'Write the WhatsApp message or post you would send to your first customer TODAY. Imagine you are sending it to the specific person you described earlier. Include: what you do, what they get, and how to contact you. Keep it under 100 words.' },
      { teaching: 'The first line is the most important. If it does not make the customer curious, they will not read the rest. Start with their problem, not your service.',
        question: 'Look at the first line of your offer message. Does it name a problem the customer has, or does it start with "I do…"? Rewrite the first line to open with their problem or a surprising result.' },
    ],
  },
  price_payment: {
    focus: 'naming a real price and a real way to get paid',
    steps: [
      { teaching: 'Underpricing is the most common mistake first-time service providers make. If you charge too little, customers assume the quality is low. Pricing sends a signal. The right price is not the lowest price — it is the price that reflects the value you deliver.',
        question: 'Name a specific price for your service. Do not say "it depends" — name a number. How did you arrive at that number? What would you charge for a basic version and what would you charge for a premium version?' },
      { teaching: 'In Nigeria, popular payment methods include Opay, Palmpay, bank transfer, and cash. Your customer needs to be able to pay you easily. Friction at payment kills deals that are already won.',
        question: 'How will your customer pay you? Name the exact method — bank transfer to which bank, which mobile money app, cash on delivery? Walk through the payment process step by step as if explaining it to the customer.' },
    ],
  },
  test_validate: {
    focus: 'testing the idea before building anything',
    steps: [
      { teaching: 'Testing before building is the most important business lesson there is. Every successful company in the world tested their idea with one customer before spending money on technology, marketing, or staff. This is called the "manual first" approach — do the work yourself for one customer, then automate it if it works.',
        question: 'How can you test your business idea THIS WEEK without building any new technology? Describe the simplest possible experiment: one customer, one request, one result. What would success look like?' },
      { teaching: 'The goal of a test is not to make money — it is to learn. If the customer says yes, you learn the offer works. If they say no, you learn why and can change it. Both results are valuable. A test that fails is not a failure — it is information.',
        question: 'Name one specific person you could approach this week to test your offer. How would you contact them? What would you offer to do for them? What would you ask them afterwards to understand if your service was valuable?' },
    ],
  },
  first_30_days: {
    focus: 'turning the plan into a concrete first-30-days schedule',
    steps: [
      { teaching: 'A business plan that lives on paper never starts. A to-do list with three names and a deadline is a business that might. The goal of the first 30 days is not to make a lot of money — it is to have your first real customer conversation and learn from it.',
        question: 'Name 3 specific people you will contact in the next 7 days about your service. For each one: their name (or description), how you know them, and how you will reach out. Make this real — not hypothetical.' },
      { teaching: 'Your AI tools are already paid for (this platform). Your knowledge is already built. The only thing between you and your first income is a message sent to the right person. You have everything you need to start today.',
        question: 'Write your 30-day plan: Week 1 (contact 3 people), Week 2 (follow up and deliver for first customer), Week 3 (improve based on feedback), Week 4 (ask for a referral or testimonial). Be specific about what you will actually do each week.' },
    ],
  },
};

function buildFallback(taskId: string, taskLabel: string) {
  const seeds = TASK_SEEDS[taskId];
  return {
    headline:        taskLabel,
    context:         `Working on: ${taskLabel}`,
    subTasks:        seeds ? seeds.steps.map(s => s.question)  : [`Share your current thinking on: ${taskLabel}`],
    subTaskTeaching: seeds ? seeds.steps.map(s => s.teaching)  : [`This step — ${taskLabel} — is essential to turning your AI skills into a real income.`],
    examplePrompt:   seeds ? seeds.steps[0].question : `Help me with: ${taskLabel}`,
  };
}

async function callAnthropic(system: string, user: string, maxTokens: number, temperature: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error (${response.status}): ${(err as any)?.error?.message || 'Unknown'}`);
  }

  const completion = await response.json();
  logCost(
    completion.usage?.input_tokens                ?? 0,
    completion.usage?.output_tokens               ?? 0,
    completion.usage?.cache_read_input_tokens     ?? 0,
    completion.usage?.cache_creation_input_tokens ?? 0,
  );
  const raw = completion.content?.[0]?.text || '';
  return raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
}

// ─── Critique mode ─────────────────────────────────────────────────────────

async function handleCritique(req: VercelRequest, res: VercelResponse) {
  const { prompt, subTaskQuestion, taskId, communicationStrategy, learningStrategy, gradeLevel } = req.body;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const focus = TASK_SEEDS[taskId]?.focus || taskId || 'this step of their business plan';
  const persona = personalitySection(communicationStrategy, learningStrategy, gradeLevel);

  const system = `You are a supportive but honest business coach reviewing a learner's response to a planning question in the "AI for Business" workshop.${persona}

YOUR JOB:
Evaluate whether the response genuinely engages with the question — specific, concrete, usable in a real business plan.
Be specific, encouraging, and brief — 2–4 sentences maximum.

RESPONSE RULES:
- If the response is good (specific, concrete, directly answers the question):
  Set hasSuggestions: false.
  Start with "Great job." then add ONE sentence of specific praise naming what they did well.
  End with "You've completed this step — let's move on."

- If the response needs improvement (too vague, generic, or doesn't answer the question):
  Set hasSuggestions: true.
  Do NOT say "great job" — be honest but kind.
  Give 1–2 specific, concrete suggestions tied to what makes a real business plan work.
  End with: "Refine your response if you'd like, or move on when ready."

TONE: Warm, direct, professional. Like a mentor who respects the learner's time.

Return JSON only:
{ "hasSuggestions": boolean, "feedback": "2-4 sentence response" }`;

  const user = `Business planning focus: ${focus}

The question they were answering:
"${subTaskQuestion || '(no question provided)'}"

Their response:
"${prompt}"

Evaluate their response.`;

  try {
    const cleaned = await callAnthropic(system, user, 250, 0.3);
    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(200).json({ hasSuggestions: false, feedback: "Great job. You've completed this step — let's move on." });
    }
    return res.status(200).json({
      hasSuggestions: result.hasSuggestions === true,
      feedback:       result.feedback || "Great job. You've completed this step — let's move on.",
    });
  } catch (err: any) {
    console.error('[business-task-instruction:critique]', err);
    return res.status(200).json({ hasSuggestions: false, feedback: "Great job. You've completed this step — let's move on." });
  }
}

// ─── Task instruction mode ──────────────────────────────────────────────────

async function handleTaskInstruction(req: VercelRequest, res: VercelResponse) {
  const {
    taskId, taskLabel, sessionContext, completedTasks,
    communicationStrategy, learningStrategy, gradeLevel, canvas,
  } = req.body;

  const ctx: any            = sessionContext || {};
  const completed: string[] = completedTasks || [];
  const seeds                = TASK_SEEDS[taskId];
  const persona = personalitySection(communicationStrategy, learningStrategy, gradeLevel);

  const canvasLines = canvas
    ? Object.entries(canvas).filter(([, v]) => typeof v === 'string' && (v as string).trim().length > 0)
        .map(([k, v]) => `${k}: ${(v as string).substring(0, 200)}`).join('\n')
    : '';

  const ctxLines = [
    ctx.opportunity && `Opportunity so far: ${ctx.opportunity}`,
    ctx.customer    && `Customer so far: ${ctx.customer}`,
    ctx.offer       && `Offer so far: ${ctx.offer}`,
  ].filter(Boolean).join('\n');

  const seedText = seeds
    ? seeds.steps.map((s, i) => `Step ${i + 1}:\n  Teaching: ${s.teaching}\n  Question: ${s.question}`).join('\n\n')
    : '';

  const system = `You are an expert business mentor helping a first-generation digital learner turn their AI skills into a real income-generating service — for their own community.${persona}

THE IRON RULE — TEACHING AND QUESTION MUST BE DIRECTLY COUPLED:
Each subTaskTeaching introduces a specific business concept.
The subTask question for that step MUST ask the learner to apply that exact concept to THEIR business idea.
Never write a generic question after a specific teaching.

Each subTaskTeaching should:
- Name the business concept clearly
- Explain why it matters in 2-4 sentences
- Stay grounded in a real, local, small-business context (WhatsApp, mobile money, community trust) — not corporate jargon

${ctxLines ? `WHAT THEY'VE ALREADY TOLD YOU (personalise everything using this):\n${ctxLines}` : ''}
${canvasLines ? `\nTHEIR BUSINESS CANVAS SO FAR:\n${canvasLines}` : ''}
Completed tasks: ${completed.length > 0 ? completed.join(', ') : 'none yet'}

Return JSON only — no markdown fences, no extra text:
{
  "headline": "Action verb + specific outcome (max 7 words)",
  "context": "One sentence: what this task builds toward, referencing their business idea if known.",
  "subTaskTeaching": ["concept + why it matters, 2-4 sentences", "concept + why it matters, 2-4 sentences"],
  "subTasks": ["question applying subTaskTeaching[0] to their business", "question applying subTaskTeaching[1] to their business"],
  "examplePrompt": "A complete example of what a learner might type for step 1 — 2-3 sentences, specific to a small local business."
}`;

  const user = `Task: "${taskLabel}" (ID: ${taskId})

${seedText ? `Seed content to adapt and personalise:\n\n${seedText}` : ''}

Write the full instruction with teaching commentary for both steps.`;

  try {
    const cleaned = await callAnthropic(system, user, 900, 0.35);
    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(200).json(buildFallback(taskId, taskLabel));
    }

    if (!Array.isArray(result.subTaskTeaching) || result.subTaskTeaching.length < 2) {
      result.subTaskTeaching = seeds ? seeds.steps.map(s => s.teaching) : ['This step is important to building your business.'];
    }

    return res.status(200).json({
      headline:        result.headline        || taskLabel,
      context:         result.context         || '',
      subTasks:        result.subTasks        || [],
      subTaskTeaching: result.subTaskTeaching,
      examplePrompt:   result.examplePrompt   || '',
    });
  } catch (err: any) {
    console.error('[business-task-instruction]', err);
    return res.status(200).json(buildFallback(taskId, taskLabel));
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (req.body?.mode === 'critique') {
    return handleCritique(req, res);
  }
  return handleTaskInstruction(req, res);
}
