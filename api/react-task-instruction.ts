// api/react-task-instruction.ts
// Generates a personalized, adaptive task instruction based on current project state.
//
// Request body:
//   taskId: string
//   taskLabel: string
//   phase: 1 | 2 | 3
//   projectFiles: { path: string; preview: string }[]   (first 400 chars of each file)
//   sessionContext: { appName?, appPurpose?, audience?, tables?, components? }
//   completedTasks: string[]
//
// Response:
//   { headline: string, context: string, subTasks: string[], examplePrompt: string }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { taskId, taskLabel, phase, projectFiles, sessionContext, completedTasks, communicationStrategy, learningStrategy } = req.body;

  const ctx = sessionContext || {};
  const files: any[] = projectFiles || [];
  const completed: string[] = completedTasks || [];

  // Build context summary
  const ctxLines = [
    ctx.appName    && `App name: "${ctx.appName}"`,
    ctx.appPurpose && `Purpose: ${ctx.appPurpose}`,
    ctx.audience   && `Audience: ${ctx.audience}`,
    ctx.tables     && `Supabase tables planned: ${ctx.tables}`,
    ctx.components && `Components planned: ${ctx.components}`,
  ].filter(Boolean).join('\n');

  const fileList = files
    .filter(f => f.preview?.length > 20)
    .map(f => `- ${f.path}: ${f.preview.substring(0, 150).replace(/\n/g, ' ')}…`)
    .join('\n');

    // Build personality strategy strings if available
  const commStratStr = communicationStrategy
    ? JSON.stringify(communicationStrategy)
    : null;
  const learnStratStr = learningStrategy
    ? JSON.stringify(learningStrategy)
    : null;

  const personalitySection = (commStratStr || learnStratStr)
    ? `
LEARNER PERSONALITY PROFILE (use this to shape HOW you communicate):
` +
      (commStratStr ? `Communication strategy: ${commStratStr}
` : '') +
      (learnStratStr ? `Learning strategy: ${learnStratStr}
` : '') +
      `Apply these directly:
` +
      `- Match the learner's preferred communication style in every sentence
` +
      `- Structure sub-tasks and examples to align with their learning strategy
` +
      `- Adjust vocabulary complexity, encouragement style, and example types accordingly
`
    : '';

  const system = `You are an expert React/Vite/Supabase educator guiding a student one step at a time.${personalitySection}

CRITICAL RULE — ONE SUB-TASK AT A TIME:
Return exactly 3 subTasks. Each is a SINGLE, standalone question or action — not a list.
The student sees only ONE at a time. They answer it, then the next one appears.
Do NOT combine multiple questions into one subTask. Each must be answerable on its own.

CONTEXT RULE:
Every instruction must be grounded in building a REAL React/Vite/Supabase website.
Do not use abstract terms. Always frame instructions in terms of: components, pages, Supabase tables, routes, or user flows.

FIRST SUB-TASK RULE (applies to ALL tasks):
The very first subTask must always start with defining or clarifying the WEBSITE'S PURPOSE in concrete terms.
e.g. "What is the main purpose of your website? Describe in 1-2 sentences what it does and why someone would visit it."
Even if the task is about data or components — begin by grounding it in the website's purpose.

PROGRESSION RULE:
subTasks must build on each other:
- subTask 1: foundational definition (always website-purpose-grounded)
- subTask 2: one concrete design or data decision that follows from #1
- subTask 3: one specific React or Supabase implementation detail

Return JSON only — no markdown, no extra text:
{
  "headline": "Action verb + specific outcome (max 7 words)",
  "context": "One sentence explaining what this step builds toward. Reference their app if name/purpose is known.",
  "subTasks": [
    "Single focused question or action — grounded in website purpose",
    "One concrete follow-on decision about design, data, or structure",
    "One specific React/Supabase implementation detail to decide"
  ],
  "examplePrompt": "A complete example of what a student might type for subTask 1. 2-3 sentences, specific to their app context."
}`;

  const user = `Current task: "${taskLabel}" (Task ID: ${taskId}, Phase ${phase})

${ctxLines ? `What we know about their app:\n${ctxLines}\n` : 'No app context yet — this is a planning task.\n'}
${fileList ? `Current project files:\n${fileList}\n` : ''}
Completed tasks so far: ${completed.length > 0 ? completed.join(', ') : 'none yet'}

Write the adaptive task instruction.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 600,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      // Fallback if JSON parse fails
      return res.status(200).json({
        headline: taskLabel,
        context: raw.substring(0, 200),
        subTasks: ['Describe what you want to build', 'Generate the code', 'Review and iterate'],
        examplePrompt: `Help me with: ${taskLabel}`,
      });
    }

    return res.status(200).json({
      headline: result.headline || taskLabel,
      context: result.context || '',
      subTasks: result.subTasks || [],
      examplePrompt: result.examplePrompt || '',
    });
  } catch (err: any) {
    console.error('[react-task-instruction]', err);
    return res.status(500).json({ error: err.message || 'Failed to generate instruction' });
  }
}