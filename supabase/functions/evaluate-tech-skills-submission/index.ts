// supabase/functions/evaluate-tech-skills-submission/index.ts
//
// Real AI evaluation for the /tech-skills employability roadmap. Replaces
// both the client-side localStorage stub and the earlier broken attempt
// (see git history 2115a69/7e88ded/6dc31aa) which parsed the /api/chat proxy
// response using the wrong shape and silently failed every submission.
//
// The rubric (CRITERIA) lives here, server-side, so a client cannot tamper
// with the criteria sent alongside a submission. The caller's identity is
// derived from their JWT, not trusted from the request body, so a learner
// cannot submit evaluations under another user's id. Writes to
// tech_skills_progress happen only here via the service role — the table's
// anon/authenticated grants no longer include INSERT/UPDATE (see migration
// 20260713001346_secure_tech_skills_progress.sql).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CriterionDef {
  trackLabel: string;
  prompt: string;
}

// One entry per (phase_id, task_name) pair — 'diag' for the 3 diagnostics,
// 'p1'..'p4' for the 24 phase tasks. Prompts copied verbatim from
// src/pages/tech-skills/TechSkillsPage.tsx (submitPrompt fields).
const CRITERIA: Record<string, Record<string, CriterionDef>> = {
  diag: {
    'Auth test': {
      trackLabel: 'Diagnostic',
      prompt: "Write out your platform's auth flow from memory — no IDE, no code open. Cover: (1) how a new user registers, (2) how the session token is stored and refreshed, (3) what happens when the token expires mid-session, (4) at least two edge cases your platform handles (or should handle). Name your platform at the top (nextvillage.community or your own). The evaluator is looking for specificity, not perfection — honest gaps are fine.",
    },
    'Debug test': {
      trackLabel: 'Diagnostic',
      prompt: "Describe a real bug you fixed on your platform (nextvillage.community or your own full-stack app). Structure your answer as four fields: (1) Observable symptom — what did the user or you see? (2) Your hypothesis before looking at anything — what did you think was wrong and why? (3) What you actually found. (4) Whether your hypothesis was correct, and what your mental model missed if it was wrong. One paragraph per field. The evaluator rewards honest reflection over a clean story.",
    },
    'Schema test': {
      trackLabel: 'Diagnostic',
      prompt: "Name your platform at the top. Then list your main database tables from memory — for each table write: the table name, the 4–6 most important columns, who can read rows (all users? only the owner? only admins?), and who can write rows. Then describe one foreign key relationship between two tables. You do not need to be complete — the evaluator is looking for genuine ownership of what you have built, and honest \"I'm not sure about this one\" notes are a good sign.",
    },
  },
  p1: {
    'Adopt conventional commits': {
      trackLabel: 'Git & Collaboration',
      prompt: "Paste the output of `git log --oneline -10` from your repo showing at least 5 conventional commits (feat:, fix:, refactor:, etc.). Each commit message should follow the format type(scope): description.",
    },
    'Set up PR workflow on your repo': {
      trackLabel: 'Git & Collaboration',
      prompt: "Paste the URL of a real PR you submitted on your repo, plus the first paragraph of your PR description. The description should answer: what does this change, why was it needed, and how did you test it?",
    },
    'Add branch protection + CI lint/build check': {
      trackLabel: 'Git & Collaboration',
      prompt: "Paste the full contents of your .github/workflows/ci.yml file. It should include checkout, node setup, npm ci, and at minimum npm run build.",
    },
    'Draw the architecture you built': {
      trackLabel: 'System Design (Your Own Work)',
      prompt: "Paste the GitHub URL to your committed architecture diagram (e.g. https://github.com/yourrepo/blob/main/docs/architecture.png). Then write 2–3 sentences describing the most important data flow shown in the diagram.",
    },
    'Write 3 Architecture Decision Records (ADRs)': {
      trackLabel: 'System Design (Your Own Work)',
      prompt: "Paste the full text of one of your three ADRs. It must include at minimum: Context, Options Considered, Decision, and Consequences/Tradeoffs sections.",
    },
    "Name 2 things you'd do differently now": {
      trackLabel: 'System Design (Your Own Work)',
      prompt: "Paste the 'Lessons learned' section you added to your README. Each of the two items should name a specific technical decision, explain what went wrong or what was harder than expected, and describe what you would do differently.",
    },
  },
  p2: {
    'Write unit tests for 3 existing utility functions': {
      trackLabel: 'Testing Practice',
      prompt: "Paste the full contents of one of your test files (.test.ts). It should contain at least 3 test cases covering different inputs, including at least one edge case (empty input, null, boundary value).",
    },
    'Build an AI agent behavioral test harness': {
      trackLabel: 'Testing Practice',
      prompt: "Paste the persona definition file (JSON or TypeScript) for at least 2 learner personas, plus a snippet of the Playwright test script that drives one persona through the onboarding flow.",
    },
    'Write a manual test plan for one full user journey': {
      trackLabel: 'Testing Practice',
      prompt: "Paste your complete manual test plan document. It must include all five sections: Scope, Preconditions, Steps (at least 8 numbered steps with expected results), Edge Cases (at least 3), and Pass/Fail Criteria.",
    },
    'Keep a hypothesis log for the next 5 bugs': {
      trackLabel: 'Debugging Without the Fix First',
      prompt: "Paste all 5 entries from your debug-log.md. Each entry must have all four fields: symptom, hypothesis, finding, and accuracy assessment. The log should show honest reflection on where your hypotheses were wrong.",
    },
    'Learn Supabase logs + Vercel function logs': {
      trackLabel: 'Debugging Without the Fix First',
      prompt: "Paste a screenshot description or text output from Supabase logs showing at least one real event you investigated (auth event, API call, or error). Then write 2–3 sentences explaining what you found and what it told you about your platform.",
    },
    'Write one post-mortem on a past bug': {
      trackLabel: 'Debugging Without the Fix First',
      prompt: "Paste your complete post-mortem document. It must include all six sections: Summary (one sentence), Timeline (at least 3 timestamped entries), Root Cause (the underlying technical reason, not just the symptom), Impact, Resolution, and Prevention.",
    },
  },
  p3: {
    'Contribute a fix to an open-source repo': {
      trackLabel: 'Code Reading',
      prompt: "Paste the GitHub URL of your merged pull request. Then write a paragraph describing: what the bug or issue was, how you navigated the unfamiliar codebase to find the right place to fix it, and what the review process was like.",
    },
    "Read and formally critique a peer's project": {
      trackLabel: 'Code Reading',
      prompt: "Paste your written code review. It must include three sections: (1) What works well — with at least one specific, non-generic observation. (2) Two specific changes with reasons. (3) One question you would ask the author before merging.",
    },
    'Trace one library you use daily into its source': {
      trackLabel: 'Code Reading',
      prompt: "Name the library and function you traced. Paste a link to the source on GitHub. Then write your 1-paragraph plain-English summary explaining what the function actually does internally — including at least one thing that surprised you or that you did not know before reading the source.",
    },
    "Design a system you haven't built": {
      trackLabel: 'System Design + Credentials',
      prompt: "Paste your system design document. It must include: a component list with responsibilities, a data model (table/schema sketch), stack choices with justification, and a paragraph addressing scale to 100,000 learners. Diagrams can be described in text if you cannot paste an image.",
    },
    'GitHub Foundations certification': {
      trackLabel: 'System Design + Credentials',
      prompt: "Paste your GitHub Foundations certification badge URL or credential ID from your GitHub profile or Credly. Then write 1–2 sentences on which topic in the exam you found hardest and why.",
    },
    'Microsoft AI-900 certification': {
      trackLabel: 'System Design + Credentials',
      prompt: "Paste your AI-900 certification badge URL or Credly credential ID. Then write 2–3 sentences connecting one concept from the AI-900 curriculum to something specific in how nextvillage.community works.",
    },
  },
  p4: {
    'Own one full feature solo: requirements → deploy': {
      trackLabel: 'Platform Stewardship',
      prompt: "Paste: (1) your one-page requirements document, (2) the GitHub PR URL, and (3) the Vercel deployment URL. The requirements document must be written before the code — if the PR predates the doc, that is a flag.",
    },
    'Own monitoring + incident log for 60 days': {
      trackLabel: 'Platform Stewardship',
      prompt: "Paste your incident-log.md covering at least 4 weeks. It must include at least 3 entries with: date, observed anomaly, likely cause, and action taken (or \"no action — monitored\"). Then paste your 1-page summary of patterns observed.",
    },
    'Write the onboarding doc for a future developer': {
      trackLabel: 'Platform Stewardship',
      prompt: "Paste the full onboarding document. It must include all five sections: Prerequisites, Architecture Overview (with link to diagram), Key Flows (at least 3 flows described step-by-step), Deployment Process, and Known Gotchas (at least 2).",
    },
    'Build one independent project (not your main platform)': {
      trackLabel: 'Portfolio & Employability',
      prompt: "Paste: (1) the live URL, (2) the GitHub repo URL, and (3) the README excerpt that covers what it does, why you built it, and what you would do differently. The project must be deployed — a GitHub repo alone does not count.",
    },
    'Launch a portfolio site: two projects with architecture notes': {
      trackLabel: 'Portfolio & Employability',
      prompt: "Paste the live URL of your portfolio site. Then paste the full text of your main platform's project entry — it must include human impact framing first, then architecture, then technical decisions. The portfolio must be live, not a local build.",
    },
    'Complete a mock technical interview with your mentor': {
      trackLabel: 'Portfolio & Employability',
      prompt: "Write your 90-second platform description as you would deliver it in a real interview. Then write your mentor's feedback from the mock interview — what they said you did well and what they said you should improve. Both parts are required.",
    },
  },
};

const MINIMUM_WORDS = 15;

function checkSubmissionQuality(text: string): { valid: boolean; reason?: string; wordCount: number } {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < MINIMUM_WORDS) {
    return { valid: false, reason: 'too_short', wordCount };
  }
  return { valid: true, wordCount };
}

interface EvalVerdict {
  pass: boolean;
  feedback: string;
}

async function callClaude(anthropic: Anthropic, question: string, criteriaPrompt: string, submission: string): Promise<EvalVerdict> {
  const systemPrompt = `You are a rigorous but encouraging technical mentor evaluating a developer learner's self-reported evidence for a single roadmap item on an employability program.

The item is: "${question}"
What good evidence looks like: ${criteriaPrompt}

Judge literally against the stated criteria — count numbered steps, count required sections, check for named specifics — not vibes. Vague, generic, template, or off-topic submissions should not pass. Honest gaps with specific detail are fine and can still pass.

Respond in JSON only, no markdown, no preamble:
{
  "pass": true | false,
  "feedback": "2-4 sentences. If pass=true: confirm what was demonstrated. If pass=false: say exactly what is missing or falls short against the stated criteria, so the learner knows what to fix and resubmit."
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: submission }],
  });

  const block = response.content[0];
  const raw = block?.type === 'text' ? block.text : '';
  let parsed: EvalVerdict;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('Could not parse evaluation response.');
  }
  if (typeof parsed.pass !== 'boolean' || typeof parsed.feedback !== 'string') {
    throw new Error('Evaluation response missing required fields.');
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

  let body: { phase_id?: string; task_name?: string; submission_text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const { phase_id, task_name, submission_text } = body;
  if (!phase_id || !task_name || !submission_text?.trim()) {
    return new Response(JSON.stringify({ error: 'phase_id, task_name, and submission_text are required' }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const criterion = CRITERIA[phase_id]?.[task_name];
  if (!criterion) {
    return new Response(JSON.stringify({ error: `Unknown roadmap item: ${phase_id} / ${task_name}` }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401, headers: CORS_HEADERS,
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: CORS_HEADERS,
    });
  }

  try {
    const trimmed = submission_text.trim();
    const quality = checkSubmissionQuality(trimmed);

    const { data: existing } = await supabase
      .from('tech_skills_progress')
      .select('attempt_count')
      .eq('user_id', user.id)
      .eq('phase_id', phase_id)
      .eq('task_name', task_name)
      .maybeSingle();

    const nextAttemptCount = (existing?.attempt_count ?? 0) + 1;

    let status: 'pass' | 'needs_work';
    let ai_feedback: string;
    let ai_score: 0 | 1;

    if (!quality.valid) {
      status = 'needs_work';
      ai_score = 0;
      ai_feedback = `Submission was only ${quality.wordCount} words — too short to evaluate meaningfully. Add real detail (specifics about your own platform, not generic statements) and resubmit.`;
    } else {
      const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
      const verdict = await callClaude(anthropic, task_name, criterion.prompt, trimmed);
      status = verdict.pass ? 'pass' : 'needs_work';
      ai_score = verdict.pass ? 1 : 0;
      ai_feedback = verdict.feedback;
    }

    const { error: dbError } = await supabase
      .from('tech_skills_progress')
      .upsert({
        user_id: user.id,
        phase_id,
        track_label: criterion.trackLabel,
        task_name,
        status,
        submission_text: trimmed,
        ai_feedback,
        ai_score,
        attempt_count: nextAttemptCount,
        submitted_at: new Date().toISOString(),
        evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,phase_id,task_name' });

    if (dbError) throw new Error(dbError.message);

    return new Response(JSON.stringify({
      ok: true,
      status,
      ai_feedback,
      attempt_count: nextAttemptCount,
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('evaluate-tech-skills-submission error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
