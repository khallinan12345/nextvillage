// api/content-task-instruction.ts
// Two responsibilities behind one route, mirroring how the client calls it
// (src/pages/AIContentCreationPage.tsx) and the same two-mode shape as
// api/business-task-instruction.ts:
//
// 1. Default mode — returns one adaptive task instruction per navigation
//    event for the AI Content Creation workshop (Understand → Create →
//    Polish). Each instruction has 1-2 sequential sub-tasks, each paired
//    with a "why this matters" teaching commentary shown before the
//    question.
//
// 2. mode: 'critique' — evaluates the learner's response to the current
//    sub-task question and returns { hasSuggestions, feedback }.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// ─── Cost logger (fire-and-forget, mirrors chat.js / business-*.ts pattern) ──
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
      page:               'AIContentCreationPage',
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

// communication_level scale (0-3), same convention as English/Math/Science/
// Image/Voice/Video Creation pages.
const COMM_LEVEL_LINE: Record<number, string> = {
  0: 'The learner is at a very basic communication level. Use very simple words and short sentences. Be extra encouraging.',
  1: 'The learner is at an emerging communication level. Use clear, simple language with short sentences.',
  2: 'The learner is at a developing communication level. You can use everyday professional language.',
  3: 'The learner is at a proficient communication level. Use clear, professional language — treat them as a capable adult writer.',
};

function personalitySection(communicationStrategy: any, learningStrategy: any, communicationLevel: any): string {
  const commStr  = communicationStrategy ? JSON.stringify(communicationStrategy) : null;
  const learnStr = learningStrategy      ? JSON.stringify(learningStrategy)      : null;
  const levelStr = communicationLevel != null && COMM_LEVEL_LINE[communicationLevel] ? COMM_LEVEL_LINE[communicationLevel] : null;
  if (!commStr && !learnStr && !levelStr) return '';
  return '\n\nLEARNER PROFILE — adapt vocabulary and tone to match:\n'
    + (commStr  ? `Communication strategy: ${commStr}\n` : '')
    + (learnStr ? `Learning strategy: ${learnStr}\n`     : '')
    + (levelStr ? `Communication level: ${levelStr}\n`   : '');
}

interface SubTaskSeed { teaching: string; question: string; }
interface TaskSeed { focus: string; producesContent: boolean; steps: SubTaskSeed[]; }

// Ported directly from the client-side fallback content in
// AIContentCreationPage.tsx (the `fallbacks` object in fetchTaskInstruction)
// so the server-generated instructions and the offline fallback stay
// aligned, same design as business-task-instruction.ts's TASK_SEEDS.
const TASK_SEEDS: Record<string, TaskSeed> = {
  choose_type: {
    focus: 'choosing the right content type and topic',
    producesContent: false,
    steps: [
      { teaching: 'Choosing the right content type shapes everything — the length, tone, structure, and platform. A blog post reads very differently from a social media post or a grant proposal.',
        question: 'What type of content do you want to create? Select one from the panel on the right. Then tell me: what topic or subject will this content be about?' },
    ],
  },
  define_audience: {
    focus: 'defining the specific audience and platform',
    producesContent: false,
    steps: [
      { teaching: 'The most common mistake in content creation is writing for yourself instead of your reader. Every word, every sentence should serve the person who will read it.',
        question: 'Who is the person reading or watching this content? Describe them: their age, where they live, what they care about, and what problem they have that your content solves.' },
      { teaching: 'Knowing where your audience comes from changes the language you use. A local community reads differently from a donor abroad or a customer in a big city.',
        question: 'What platform or channel will you publish this on? Where will your audience find it — Facebook, a website, email, YouTube, WhatsApp?' },
    ],
  },
  define_purpose: {
    focus: 'defining one clear purpose and a strong hook',
    producesContent: false,
    steps: [
      { teaching: 'Every piece of great content has one clear goal. Not two. Not five. One. If you cannot say in one sentence what you want the reader to do or feel after reading, the content will feel unfocused.',
        question: 'Complete this sentence: "After reading this, I want my audience to ___." What is the single most important action or feeling you want to create?' },
      { teaching: 'A hook is the first line that makes someone decide to keep reading. You have about 3 seconds to earn their attention.',
        question: 'What is the most interesting or surprising thing about your topic? This will become the hook — the first thing your audience sees.' },
    ],
  },
  research_topic: {
    focus: 'gathering key ideas, facts, and stories',
    producesContent: false,
    steps: [
      { teaching: 'Before writing, gather your raw material. Good content is built from specific facts, stories, examples, and insights — not vague generalities.',
        question: 'Tell me 3–5 key points, facts, or ideas you want to include. These do not need to be perfectly written — just list what you know or want to say.' },
      { teaching: 'A real story or specific example is always more powerful than a general statement. Readers connect with specifics.',
        question: 'Is there a story, personal experience, or example from your community that illustrates your main point? Describe it briefly.' },
    ],
  },
  write_draft: {
    focus: 'writing the first full draft',
    producesContent: true,
    steps: [
      { teaching: 'The first draft does not need to be perfect. Its only job is to exist. You cannot edit a blank page. Write first, fix later.',
        question: 'Based on your audience, purpose, and key ideas — describe what your content should say from beginning to end. Use your own words and do not worry about grammar yet.' },
      { teaching: 'Structure is invisible when it works well. The reader flows naturally from beginning to middle to end without noticing the scaffolding.',
        question: 'How should this content be structured? For example: problem → solution → call to action, or story → lesson → takeaway. Describe the shape of your content.' },
    ],
  },
  add_voice: {
    focus: 'adding voice and personality to the draft',
    producesContent: true,
    steps: [
      { teaching: 'Voice is what makes your content sound like YOU — not like every other AI-generated piece on the internet. Tone, rhythm, word choice, and personality all contribute.',
        question: 'Describe the tone and personality of this content in 3–5 words. For example: warm and encouraging, direct and urgent, formal and professional, playful and surprising.' },
      { teaching: 'Your audience should feel like you are speaking directly to them — not broadcasting to a crowd. The words "you" and "your" do this instantly.',
        question: 'Read through your current draft. Find one place where the language feels too formal or generic. How would you say that sentence if you were speaking to one person face-to-face?' },
    ],
  },
  structure_refine: {
    focus: 'improving structure, flow, and the call to action',
    producesContent: true,
    steps: [
      { teaching: 'Headings, paragraphs, and white space are not decoration — they are navigation tools. Readers scan before they read. Clear structure invites them in.',
        question: 'Does your current draft have a clear opening, middle, and ending? Describe what each section is doing and whether you feel anything is missing or in the wrong order.' },
      { teaching: 'A call to action (CTA) tells the reader exactly what to do next. Without it, even great content produces no result.',
        question: 'What should the reader do after finishing your content? Click a link, reply to an email, share it, donate, buy something? Write your call to action.' },
    ],
  },
  edit_clarity: {
    focus: 'tightening clarity and language',
    producesContent: true,
    steps: [
      { teaching: 'The most powerful edit you can make is cutting. Every word that does not add meaning should be removed. Short sentences are almost always better than long ones.',
        question: 'Read your draft aloud. Find the three most complicated or wordy sentences. Paste them here and I will help you simplify them.' },
      { teaching: 'Passive voice weakens writing. "The project was completed by our team" becomes "Our team completed the project." Active voice is stronger and clearer.',
        question: 'Are there any places in your draft where you are using passive voice or indirect language? Share them here, or ask me to scan your draft for these patterns.' },
    ],
  },
  platform_adapt: {
    focus: 'adapting the content for its platform, plus headline/caption/subject line',
    producesContent: true,
    steps: [
      { teaching: 'The same content works differently on different platforms. A blog post is too long for Instagram. A tweet is too short for email. Platform adaptation is not a shortcut — it is a skill.',
        question: 'Besides the main platform, which other channel could this content be adapted for? Describe how the format, length, or tone would need to change.' },
      { teaching: 'Hashtags, subject lines, meta descriptions, and captions are each a separate skill. The right ones dramatically increase how many people see your content.',
        question: 'What is the subject line for this email, the caption for this post, or the headline for this article? Write 2–3 options and I will help you pick the strongest one.' },
    ],
  },
  final_review: {
    focus: 'final proofread and distribution planning',
    producesContent: false,
    steps: [
      { teaching: 'Before publishing, every professional content creator runs through a checklist. Typos, broken links, missing CTAs, wrong dates — small errors damage credibility.',
        question: 'Read your final draft one more time. List any remaining concerns, things that feel incomplete, or details you want to double-check before publishing.' },
      { teaching: 'Publishing is not the end — it is the beginning. Planning how to promote and distribute content multiplies its impact dramatically.',
        question: 'How will you share this content? Describe your distribution plan: who will you send it to, when will you post it, and how will you know if it worked?' },
    ],
  },
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  blog_post: 'Blog Post', social_media: 'Social Media', email: 'Email / Newsletter',
  video_script: 'Video Script', grant_proposal: 'Grant / Proposal',
  product_description: 'Product Description', press_release: 'Press Release', story: 'Short Story',
};

function buildFallback(taskId: string, taskLabel: string) {
  const seed = TASK_SEEDS[taskId];
  return {
    headline:        taskLabel,
    context:         `Working on: ${taskLabel}`,
    subTasks:        seed ? seed.steps.map(s => s.question)  : [`Share your current thinking on: ${taskLabel}`],
    subTaskTeaching: seed ? seed.steps.map(s => s.teaching)  : [`This step — ${taskLabel} — is essential to creating professional content that achieves results.`],
    examplePrompt:   seed ? seed.steps[0].question : `Help me with: ${taskLabel}`,
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
  const { prompt, subTaskQuestion, taskId, contentType, communicationStrategy, learningStrategy, communicationLevel } = req.body;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const focus = TASK_SEEDS[taskId]?.focus || taskId || 'this step of their content';
  const typeLabel = CONTENT_TYPE_LABELS[contentType] || 'content';
  const persona = personalitySection(communicationStrategy, learningStrategy, communicationLevel);

  const system = `You are a supportive but honest writing coach reviewing a learner's response to a content-creation question in the "AI Content Creation" workshop. They are working on a ${typeLabel}.${persona}

YOUR JOB:
Evaluate whether the response genuinely engages with the question — specific, concrete, usable in real content.
Be specific, encouraging, and brief — 2–4 sentences maximum.

RESPONSE RULES:
- If the response is good (specific, concrete, directly answers the question):
  Set hasSuggestions: false.
  Start with "Great job." then add ONE sentence of specific praise naming what they did well.
  End with "You've completed this step — let's move on."

- If the response needs improvement (too vague, generic, or doesn't answer the question):
  Set hasSuggestions: true.
  Do NOT say "great job" — be honest but kind.
  Give 1–2 specific, concrete suggestions tied to what makes real content work.
  End with: "Refine your response if you'd like, or move on when ready."

TONE: Warm, direct, professional. Like a mentor who respects the learner's time.

Return JSON only:
{ "hasSuggestions": boolean, "feedback": "2-4 sentence response" }`;

  const user = `Content focus: ${focus}

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
    console.error('[content-task-instruction:critique]', err);
    return res.status(200).json({ hasSuggestions: false, feedback: "Great job. You've completed this step — let's move on." });
  }
}

// ─── Task instruction mode ──────────────────────────────────────────────────

async function handleTaskInstruction(req: VercelRequest, res: VercelResponse) {
  const {
    taskId, taskLabel, contentType, sessionContext, completedTasks,
    communicationStrategy, learningStrategy, communicationLevel, existingContent,
  } = req.body;

  const ctx: any            = sessionContext || {};
  const completed: string[] = completedTasks || [];
  const seed                = TASK_SEEDS[taskId];
  const typeLabel            = CONTENT_TYPE_LABELS[contentType] || 'their content';
  const persona = personalitySection(communicationStrategy, learningStrategy, communicationLevel);

  const ctxLines = [
    ctx.audience && `Audience so far: ${ctx.audience}`,
    ctx.purpose  && `Purpose so far: ${ctx.purpose}`,
  ].filter(Boolean).join('\n');

  const seedText = seed
    ? seed.steps.map((s, i) => `Step ${i + 1}:\n  Teaching: ${s.teaching}\n  Question: ${s.question}`).join('\n\n')
    : '';

  const system = `You are an expert writing coach and content strategist helping a learner create a real ${typeLabel} in the "AI Content Creation" workshop.${persona}

THE IRON RULE — TEACHING AND QUESTION MUST BE DIRECTLY COUPLED:
Each subTaskTeaching introduces a specific content-writing concept.
The subTask question for that step MUST ask the learner to apply that exact concept to THEIR content.
Never write a generic question after a specific teaching.

Each subTaskTeaching should:
- Name the writing concept clearly
- Explain why it matters in 2-4 sentences
- Stay practical and concrete, not academic

${ctxLines ? `WHAT THEY'VE ALREADY TOLD YOU (personalise everything using this):\n${ctxLines}` : ''}
${existingContent ? `\nTHEIR CONTENT SO FAR:\n${String(existingContent).slice(0, 600)}` : ''}
Completed tasks: ${completed.length > 0 ? completed.join(', ') : 'none yet'}

Return JSON only — no markdown fences, no extra text:
{
  "headline": "Action verb + specific outcome (max 7 words)",
  "context": "One sentence: what this task builds toward, referencing their content if known.",
  "subTaskTeaching": ["concept + why it matters, 2-4 sentences"${seed && seed.steps.length > 1 ? ', "concept + why it matters, 2-4 sentences"' : ''}],
  "subTasks": ["question applying subTaskTeaching[0] to their content"${seed && seed.steps.length > 1 ? ', "question applying subTaskTeaching[1] to their content"' : ''}],
  "examplePrompt": "A complete example of what a learner might type for step 1 — 2-3 sentences, specific to their content type."
}`;

  const user = `Task: "${taskLabel}" (ID: ${taskId})

${seedText ? `Seed content to adapt and personalise:\n\n${seedText}` : ''}

Write the full instruction with teaching commentary for ${seed && seed.steps.length > 1 ? 'both steps' : 'this step'}.`;

  try {
    const cleaned = await callAnthropic(system, user, 900, 0.35);
    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(200).json(buildFallback(taskId, taskLabel));
    }

    if (!Array.isArray(result.subTaskTeaching) || result.subTaskTeaching.length < 1) {
      result.subTaskTeaching = seed ? seed.steps.map(s => s.teaching) : ['This step is important to creating great content.'];
    }

    return res.status(200).json({
      headline:        result.headline        || taskLabel,
      context:         result.context         || '',
      subTasks:        result.subTasks        || [],
      subTaskTeaching: result.subTaskTeaching,
      examplePrompt:   result.examplePrompt   || '',
    });
  } catch (err: any) {
    console.error('[content-task-instruction]', err);
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
