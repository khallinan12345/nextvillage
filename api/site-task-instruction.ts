// api/site-task-instruction.ts
// Returns one adaptive task instruction per navigation event.
// Each instruction has 3 sequential sub-tasks, each paired with a
// "why this matters" teaching commentary shown before the question.

import type { VercelRequest, VercelResponse } from '@vercel/node';
// Migrated from OpenAI → Anthropic direct fetch
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
      page:               'WebDevelopmentPage',
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

interface SubTaskSeed { teaching: string; question: string; }
interface TaskSeed { focus: string; steps: [SubTaskSeed, SubTaskSeed, SubTaskSeed]; }

const TASK_SEEDS: Record<string, TaskSeed> = {
  define_site: {
    focus: 'defining the website purpose, audience, and goals',
    steps: [
      {
        teaching: `Every professional website project begins with a single, clear statement of purpose. Without it, developers often build the wrong thing — spending weeks on features nobody needs. A one-sentence purpose statement keeps every future decision anchored to what actually matters.`,
        question: `What is the main purpose of this website? Describe in 1–2 sentences what it does and why someone would visit it.`,
      },
      {
        teaching: `Knowing your audience is the single most powerful design tool you have. A website for teenagers looks, reads, and navigates completely differently from one for professionals or community elders. Every font size, colour, and word on the page should be chosen with a real person in mind.`,
        question: `Who is the target audience? Describe the typical visitor — their age, background, and what they are looking for when they arrive.`,
      },
      {
        teaching: `Listing what your site will offer — before writing a single line of code — is called scoping. Professional developers use this to prevent "scope creep," where a project keeps growing until it never gets finished. A focused list of 3–5 things keeps the project achievable and the visitor experience clear.`,
        question: `List 3–5 key things a visitor should be able to find or do on this website.`,
      },
    ],
  },
  plan_pages: {
    focus: 'planning pages and component structure',
    steps: [
      {
        teaching: `Websites are made of pages, and each page should have exactly one job. The About page tells a story. The Services page explains what's offered. The Contact page gives people a way to reach you. Planning pages before building means you never end up with a page that tries to do too much — one of the most common beginner mistakes.`,
        question: `Based on your site's purpose, what pages does it need? List each one and its single job (e.g. Home, About, Services, Contact).`,
      },
      {
        teaching: `In React, a "component" is a reusable piece of UI — like a Navbar that appears at the top of every page, or a Card used to show each item in a list. Identifying shared components before building saves enormous time: write the code once and use it everywhere. This is one of the biggest differences between professional React development and just writing separate HTML files.`,
        question: `Which elements appear on every page and should be reusable components? (e.g. Navbar, Footer, Card for repeated content items)`,
      },
      {
        teaching: `Visitor flow — sometimes called the "user journey" — is the path someone takes through your site from the moment they arrive to the moment they accomplish their goal. Designers map this out before building so navigation, button placement, and page order guide visitors naturally. A site with poor flow loses visitors before they find what they came for.`,
        question: `What is the path a typical visitor takes through your site? Walk through it step by step, from landing page to goal.`,
      },
    ],
  },
  app_shell: {
    focus: 'building the App shell with routing and shared layout components',
    steps: [
      {
        teaching: `The Navbar is the first thing visitors see and interact with. It sets the visual tone of the entire site and gives people confidence they can find what they need. In React, the Navbar is a component written once but appearing on every page — meaning a change to it instantly updates everywhere. Professional developers always build this before individual pages.`,
        question: `Describe the navigation links your Navbar should have — one link per planned page. What order should they appear in, and what should the site name or logo look like?`,
      },
      {
        teaching: `The Footer anchors the bottom of every page and is where visitors look for contact information, legal notices, or secondary links. While it might seem minor, a well-designed footer signals professionalism and trust — especially important for informational websites where credibility matters.`,
        question: `What should the Footer include? (e.g. site name, copyright year, social links, secondary navigation, contact details)`,
      },
      {
        teaching: `React Router is what makes your site feel like a real multi-page website, even though it's actually a single HTML file. Each "route" maps a URL path like /about to a React component. Planning routes upfront means your links work, your browser back-button works, and visitors can bookmark any page — all behaviours they expect from a professional site.`,
        question: `Are all your pages at the top level (e.g. /about, /contact), or do any pages sit under a parent route (e.g. /services/design)? Describe the URL structure you want.`,
      },
    ],
  },
  home_page: {
    focus: 'building the Home page — the most important page of the site',
    steps: [
      {
        teaching: `Studies consistently show that visitors decide whether to stay or leave a website within the first 3 seconds. The "hero section" — the large area at the very top — is your one chance to make that impression count. A clear headline, a brief subheadline, and one call-to-action button are all you need. More than that creates confusion.`,
        question: `What is the main headline and subheadline a visitor should see first? What is the one action you want them to take next (the call-to-action button)?`,
      },
      {
        teaching: `Below the hero, visitors who stay want to quickly understand what makes this site worth their time. Sections like "key features," "what we offer," or "why this matters" serve as signposts. Each section should answer one question the visitor has in their mind. Professional designers call these "trust-building sections" because they convert curious visitors into engaged ones.`,
        question: `What sections should appear below the hero on your Home page? Describe each one and the question it answers for the visitor.`,
      },
      {
        teaching: `A Home page that doesn't guide visitors toward a specific next action is a missed opportunity. Whether it's "Read more," "Contact us," "View our work," or "Learn how this works" — a clear path forward keeps people engaged. This is called a conversion path, and it's the difference between a site that just looks good and one that actually accomplishes its goal.`,
        question: `Beyond the hero button, where else on the Home page should you guide visitors? Are there secondary calls-to-action linking to specific other pages?`,
      },
    ],
  },
  content_pages: {
    focus: 'building the remaining content pages',
    steps: [
      {
        teaching: `Each content page exists to answer a specific question your visitor is asking. The About page answers "Who made this and why should I trust them?" Writing real content — not placeholder text — forces you to think like the visitor, and that thinking produces better design. Professional developers always fill pages with real content, even in early drafts.`,
        question: `Pick your most important content page (not Home). What question does it answer for the visitor, and what content should it contain?`,
      },
      {
        teaching: `Reusable components are one of React's greatest strengths. The Navbar and Footer you already built should appear on every page without rewriting them. If your site has repeated content — like a list of services, team members, or projects — a Card component displays each item consistently. This is what separates a React site from a folder of separate HTML files.`,
        question: `Which components from your shell (Navbar, Footer, any Cards) should this page use? Are there any new reusable components this page needs?`,
      },
      {
        teaching: `Building pages one at a time is the professional approach — it prevents overwhelm and lets you test each page before moving on. But it's important to maintain consistency: every page should feel like it belongs to the same site through matching colours, fonts, spacing, and navigation. Inconsistency is one of the most common signs of an amateur website.`,
        question: `Are there other content pages still to build? For each remaining page, describe its purpose and the main content it needs.`,
      },
    ],
  },
  interactivity: {
    focus: 'adding meaningful interactivity with React state',
    steps: [
      {
        teaching: `Interactivity is what separates a website from a printed brochure. React's "state" system lets your site respond to what visitors do — clicking, typing, toggling — without reloading the page. The best interactive features reduce effort for the visitor, like a contact form that validates input, rather than just adding visual novelty.`,
        question: `What interactive feature would most improve the experience for your visitors? (e.g. a contact form with validation, a FAQ accordion, an image gallery, a dark/light mode toggle)`,
      },
      {
        teaching: `Before writing any code, professional developers describe interactivity as a "user story": what does the user do, and what does the site do in response? This maps directly to how React state works — an event triggers a state change, and the UI re-renders to reflect it. Understanding this action → reaction pattern is the foundation of all React development.`,
        question: `Describe the interaction step by step: what does the visitor click or type, what changes on screen, and what is the final state when they're done?`,
      },
      {
        teaching: `A site with one well-built interactive feature is more impressive than one with five broken ones. Once you've designed your main interactive feature, it's worth checking the rest of the site: are there places where a small interaction — a hover effect, a show/hide toggle, a smooth scroll — would make the experience feel more polished?`,
        question: `Are there smaller interactive moments across other pages that would improve the experience? (e.g. mobile menu toggle, "back to top" button, animated section reveals on scroll)`,
      },
    ],
  },
  styling: {
    focus: 'creating a cohesive, professional visual design',
    steps: [
      {
        teaching: `Colour is the first thing visitors notice and the last thing amateur designers get right. Professional websites choose 2–3 colours maximum: a primary colour for buttons and headings, a neutral for backgrounds and text, and an optional accent. Defining colours as CSS custom properties means changing one value updates the entire site instantly.`,
        question: `Describe the visual personality of your site — what colours reflect its purpose and audience? Be specific (e.g. "deep blue and white for trust and authority," "warm orange and cream for friendliness").`,
      },
      {
        teaching: `Typography communicates more than most people realise. A site with inconsistent heading sizes, crowded text, or clashing fonts looks untrustworthy even if the content is excellent. Professional developers define a typography "scale" — consistent sizes for headings, body text, and captions — before styling any page.`,
        question: `What typographic style suits your site — bold and modern, clean and minimal, warm and approachable? Are there any specific pages or components that need the most visual attention right now?`,
      },
      {
        teaching: `Whitespace — the empty space around and between elements — is the invisible hand of good design. Generous spacing makes content feel premium and readable. Tight spacing feels rushed and amateurish. Using a consistent set of spacing values (like 8px, 16px, 24px, 32px) is one of the simplest ways to make a site look professionally designed.`,
        question: `Are there specific sections or components that currently feel cramped, misaligned, or visually inconsistent with the rest of the site? Describe what needs improving.`,
      },
    ],
  },
  responsive: {
    focus: 'making the site fully responsive across all screen sizes',
    steps: [
      {
        teaching: `More than half of all web traffic comes from mobile phones. A site that looks beautiful on a desktop but breaks on a phone immediately loses half its visitors. "Mobile-first" design — starting with the smallest screen and expanding outward — is the professional standard because it forces you to prioritise content that truly matters.`,
        question: `On a small phone screen (320–480px wide), what is the single most important content a visitor should see immediately? What can be moved lower or hidden?`,
      },
      {
        teaching: `Certain layout patterns break predictably on small screens: wide navigation menus become unusable, multi-column grids stack awkwardly, and large images overflow their containers. Experienced developers check these "breakpoint failure points" first rather than testing every pixel. Identifying them upfront saves hours of debugging.`,
        question: `Which components are most likely to break on mobile — the Navbar, any grid layouts, images, or wide sections? Describe how each should behave on a small screen.`,
      },
      {
        teaching: `The hamburger menu — the three-line icon that reveals navigation on mobile — has become a universal convention because it solves a real problem: fitting 5+ links into a small screen. Visitors expect it. Implementing it in React is a perfect use of state: a boolean "isMenuOpen" toggles the menu open and closed with a click.`,
        question: `Should the mobile navigation collapse to a hamburger menu, or is a simplified always-visible navigation acceptable? What should happen when a visitor taps a link — does the menu close automatically?`,
      },
    ],
  },
  deploy_prep: {
    focus: 'preparing the site for deployment',
    steps: [
      {
        teaching: `"Deployment" means taking code that runs on your computer and making it available to anyone on the internet. With Vite + React, "npm run build" compiles everything into a tiny optimised "dist" folder — often just a few hundred kilobytes. That folder is all you upload. Netlify and Vercel can detect a Vite project and deploy it in under a minute for free.`,
        question: `Where do you plan to host this website? The most beginner-friendly options are Netlify and GitHub Pages — both are free for static sites. Which appeals to you and why?`,
      },
      {
        teaching: `A README file is how professional developers communicate with anyone who looks at their project later — including themselves six months from now. It answers: what does this project do, how do I run it locally, and how do I deploy it. A clear README is the mark of a developer who thinks beyond their own immediate needs.`,
        question: `What should your README document? At minimum: project purpose, how to install and run locally, and how to deploy. Are there any design decisions worth noting for a future maintainer?`,
      },
      {
        teaching: `Before publishing, professional developers do a "pre-flight check" — reviewing the site for broken links, missing pages, inconsistent styling, and any placeholder content never replaced. This is also the moment to ensure every page has a proper title tag for browser tabs and search engines, and that the site makes sense to a visitor who arrives on any page directly.`,
        question: `Do a mental walkthrough of your entire site: are there broken links, placeholder text, missing pages, or styling inconsistencies that need fixing before it's ready to publish?`,
      },
    ],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { taskId, taskLabel, phase, projectFiles, sessionContext, completedTasks, communicationStrategy, learningStrategy, gradeLevel } = req.body;

  const ctx: any            = sessionContext || {};
  const files: any[]        = projectFiles   || [];
  const completed: string[] = completedTasks || [];
  const seeds               = TASK_SEEDS[taskId];

  const commStr  = communicationStrategy ? JSON.stringify(communicationStrategy) : null;
  const learnStr = learningStrategy      ? JSON.stringify(learningStrategy)      : null;
  // Grade level scale: 1=Elementary, 2=Middle School, 3=High School, 4=Adult Learner (18+)
  const gradeLine: Record<number, string> = {
    1: 'The learner is in elementary school (grades 3-5, ages 8-11). Use very simple words and short sentences. Be extra encouraging.',
    2: 'The learner is in middle school (grades 6-8, ages 11-14). Use clear, age-appropriate language.',
    3: 'The learner is in high school (grades 9-12, ages 14-18). You can use more sophisticated language.',
    4: 'The learner is an adult (18+). Use clear, professional language — treat them as a capable adult, not a classroom student.',
  };
  const gradeStr = gradeLevel && gradeLine[gradeLevel] ? gradeLine[gradeLevel] : null;
  const personalitySection = (commStr || learnStr || gradeStr)
    ? '\n\nLEARNER PERSONALITY PROFILE:\n'
      + (commStr  ? `Communication strategy: ${commStr}\n` : '')
      + (learnStr ? `Learning strategy: ${learnStr}\n`     : '')
      + (gradeStr ? `Grade level: ${gradeStr}\n`           : '')
      + 'Adapt vocabulary and sentence length to match. The teaching commentary especially should feel personally pitched.\n'
    : '';

  const ctxLines = [
    ctx.siteName    && `Site name: "${ctx.siteName}"`,
    ctx.sitePurpose && `Purpose: ${ctx.sitePurpose}`,
    ctx.audience    && `Audience: ${ctx.audience}`,
    ctx.pages       && `Planned pages: ${ctx.pages}`,
    ctx.components  && `Planned components: ${ctx.components}`,
  ].filter(Boolean).join('\n');

  const fileList = files
    .filter((f: any) => f.preview?.length > 20)
    .map((f: any) => `- ${f.path}: ${f.preview.substring(0, 150).replace(/\n/g, ' ')}…`)
    .join('\n');

  const seedText = seeds
    ? seeds.steps.map((s, i) =>
        `Step ${i + 1}:\n  Teaching: ${s.teaching}\n  Question: ${s.question}`
      ).join('\n\n')
    : '';

  const system = `You are an expert Vite + React educator. Your role is not just to guide students through building a website — it is to explain the professional reasoning behind every step so they understand WHY, not just WHAT.${personalitySection}

This is a STATIC Vite + React site — no database. Pure front-end only.

THE IRON RULE — TEACHING AND QUESTION MUST BE DIRECTLY COUPLED:
Each subTaskTeaching introduces a specific concept (e.g. "audience shapes layout, language, and what content to show first").
The subTask question for that step MUST ask the student to apply that exact concept — naming the same things the teaching named.

If the teaching says "audience shapes layout, language, and content priority" → the question asks about their audience, the language to use, and what content to show first.
If the teaching says "reusable components save time" → the question asks which elements should be reusable components.
If the teaching says "visitor flow guides navigation design" → the question asks them to walk through their visitor's flow.

NEVER write a generic question ("Describe your requirements", "Add specific details") after a specific teaching.
The question is the direct application of what the teaching just named and explained.

Before finalising your output, read each pair: does subTasks[i] ask the student to apply exactly what subTaskTeaching[i] just taught? If not — rewrite the question until it does.

Each subTaskTeaching should:
- Name the professional concept clearly (e.g. "scoping", "component reuse", "visitor flow")
- Explain why it matters in 2–4 sentences
- Connect to real developer practice, not abstract theory

${ctxLines ? `SITE CONTEXT (personalise everything using this):\n${ctxLines}` : 'No site context yet.'}
${fileList ? `\nCurrent files:\n${fileList}` : ''}
Completed tasks: ${completed.length > 0 ? completed.join(', ') : 'none yet'}

Return JSON only — no markdown fences, no extra text:
{
  "headline": "Action verb + specific outcome (max 7 words)",
  "context": "One sentence: what this task builds toward, referencing their site if known.",
  "subTaskTeaching": ["concept name + why it matters, 2-4 sentences", "concept name + why it matters, 2-4 sentences", "concept name + why it matters, 2-4 sentences"],
  "subTasks": ["question asking student to apply the exact concept named in subTaskTeaching[0]", "question asking student to apply the exact concept named in subTaskTeaching[1]", "question asking student to apply the exact concept named in subTaskTeaching[2]"],
  "examplePrompt": "A complete example of what a student might type for step 1 — 2-3 sentences, specific to their site."
}`;

  const user = `Task: "${taskLabel}" (ID: ${taskId}, Phase ${phase})

${seedText ? `Seed content to adapt and personalise:\n\n${seedText}` : ''}

Write the full instruction with teaching commentary for all 3 steps.`;

  try {
    const _apiKey = process.env.ANTHROPIC_API_KEY;
    if (!_apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    const _response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         _apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       ANTHROPIC_MODEL,
        max_tokens:  1000,
        temperature: 0.35,
        system:      system,
        messages:    [{ role: 'user', content: user }],
      }),
    });
    if (!_response.ok) {
      const _err = await _response.json().catch(() => ({}));
      throw new Error(`Anthropic API error (${_response.status}): ${(_err as any)?.error?.message || 'Unknown'}`);
    }
    const _completion = await _response.json();
    logCost(
      _completion.usage?.input_tokens                ?? 0,
      _completion.usage?.output_tokens               ?? 0,
      _completion.usage?.cache_read_input_tokens     ?? 0,
      _completion.usage?.cache_creation_input_tokens ?? 0,
    );
    const raw     = _completion.content?.[0]?.text || '{}';
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(200).json(buildFallback(taskId, taskLabel, seeds));
    }

    // Ensure subTaskTeaching always has 3 entries
    if (!Array.isArray(result.subTaskTeaching) || result.subTaskTeaching.length < 3) {
      result.subTaskTeaching = seeds
        ? seeds.steps.map(s => s.teaching)
        : Array(3).fill('This step is important to professional web development.');
    }

    return res.status(200).json({
      headline:        result.headline        || taskLabel,
      context:         result.context         || '',
      subTasks:        result.subTasks        || [],
      subTaskTeaching: result.subTaskTeaching,
      examplePrompt:   result.examplePrompt   || '',
    });

  } catch (err: any) {
    console.error('[site-task-instruction]', err);
    return res.status(200).json(buildFallback(taskId, taskLabel, seeds));
  }
}

function buildFallback(taskId: string, taskLabel: string, seeds?: TaskSeed) {
  return {
    headline:        taskLabel,
    context:         `Let's work on ${taskLabel.toLowerCase()} for your website.`,
    subTasks:        seeds ? seeds.steps.map(s => s.question)  : ['Describe your goal clearly', 'Add specific details', 'Review and iterate'],
    subTaskTeaching: seeds ? seeds.steps.map(s => s.teaching)  : [
      'This step is foundational to professional web development.',
      'Understanding this helps every future decision you make.',
      'This is how experienced developers approach this stage.',
    ],
    examplePrompt:   seeds ? seeds.steps[0].question : `Help me with: ${taskLabel}`,
  };
}