// src/pages/tech-skills/TechSkillsPage.tsx
// Route: /tech-skills
//
// New dependencies:
//   - supabase client (already in project)
//   - useAuth hook (already in project)
//
// New Supabase table required (already created per Kevin):
//   tech_skills_progress (see schema in conversation)

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Code2, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Terminal, GitBranch, FlaskConical, Layers, Trophy, Zap,
  ExternalLink, BookOpen, Lock, Send, Loader2, AlertCircle,
  ThumbsUp, RefreshCw, ClipboardList
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  name: string;
  short: string;
  def: { label: string; text: string };
  how: string;
  platform: string;
  submitPrompt: string; // what to paste / what evidence is expected
}

interface Track {
  label: string;
  tasks: Task[];
}

interface Phase {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  color: string;
  colorBg: string;
  colorBorder: string;
  milestone: string;
  tracks: Track[];
}

interface DiagItem {
  q: string;
  summary: string;
  def: string;
  detail: string;
  submitPrompt: string;
}

type TaskStatus = 'locked' | 'available' | 'submitted' | 'pass' | 'needs_work';

interface ProgressRecord {
  phase_id: string;
  task_name: string;
  status: TaskStatus;
  submission_text?: string;
  ai_feedback?: string;
  attempt_count: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const DIAGNOSTICS: DiagItem[] = [
  {
    q: 'Auth test',
    summary: 'Explain the full auth flow end-to-end without looking at code — edge cases, not the happy path.',
    def: "Authentication verifies that a user is who they claim to be. The 'happy path' is what happens when everything works perfectly. Edge cases are everything else: what happens when a token expires mid-session? When a user tries to log in with the wrong password three times? When Supabase is temporarily unreachable? When a session cookie is present but the user was deleted from the database?",
    detail: 'On your platform (nextvillage.community or your own full-stack app), your auth is likely handled by Supabase Auth. Walk through: how a user signs up, how their session token is stored, what happens when that token expires, what happens if they open two browser tabs, and what error your platform shows when auth fails. Do this out loud, from memory, before looking at any code. Write down where you got stuck — those are your gaps.',
    submitPrompt: "Write out your platform's auth flow from memory — no IDE, no code open. Cover: (1) how a new user registers, (2) how the session token is stored and refreshed, (3) what happens when the token expires mid-session, (4) at least two edge cases your platform handles (or should handle). Name your platform at the top (nextvillage.community or your own). The evaluator is looking for specificity, not perfection — honest gaps are fine.",
  },
  {
    q: 'Debug test',
    summary: 'Walk through a recent bug: what was your hypothesis before you ran the fix?',
    def: "A hypothesis is a testable explanation for why something is broken, formed before you look at the solution. Most developers go straight from 'error message' to 'fix.' Hypothesis first: 'I think the problem is X because Y, and I can verify by doing Z.' This distinguishes a developer who owns a system from one who merely maintains it.",
    detail: 'Think of the last bug you fixed on your platform. Write: what did you think was wrong before you ran the fix? Was your guess right? If you cannot reconstruct a hypothesis, that is your baseline — and Phase 2 is designed to build this muscle deliberately.',
    submitPrompt: "Describe a real bug you fixed on your platform (nextvillage.community or your own full-stack app). Structure your answer as four fields: (1) Observable symptom — what did the user or you see? (2) Your hypothesis before looking at anything — what did you think was wrong and why? (3) What you actually found. (4) Whether your hypothesis was correct, and what your mental model missed if it was wrong. One paragraph per field. The evaluator rewards honest reflection over a clean story.",
  },
  {
    q: 'Schema test',
    summary: "Sketch your platform's data model on paper — tables, relationships, RLS intent. No IDE.",
    def: "A data model describes what data your application stores and how pieces relate to each other. RLS (Row Level Security) is Supabase's mechanism for controlling which users can read or write which rows — for example, a learner should only see their own assessment results, not another learner's.",
    detail: 'On paper, draw the main tables in your platform (nextvillage.community or your own full-stack app). Name the columns you remember. Draw lines between connected tables. Write one sentence per table describing who is allowed to read it and who is allowed to write it. Where you are unsure, mark it — those are the parts of your own platform you do not fully own yet.',
    submitPrompt: "Name your platform at the top. Then list your main database tables from memory — for each table write: the table name, the 4–6 most important columns, who can read rows (all users? only the owner? only admins?), and who can write rows. Then describe one foreign key relationship between two tables. You do not need to be complete — the evaluator is looking for genuine ownership of what you have built, and honest \"I'm not sure about this one\" notes are a good sign.",
  },
];

const PHASES: Phase[] = [
  {
    id: 'p1',
    label: 'Phase 1 · Months 1–2',
    title: 'Foundations & Discipline',
    subtitle: "Consolidate what you've built — make it transferable",
    color: '#6c4fd4',
    colorBg: 'rgba(108,79,212,0.07)',
    colorBorder: 'rgba(108,79,212,0.22)',
    milestone: 'Submit a PR to the vAI repo that Kevin reviews. You can explain every line — and why it was written that way — without looking at notes.',
    tracks: [
      {
        label: 'Git & Collaboration',
        tasks: [
          {
            name: 'Adopt conventional commits',
            short: 'feat:, fix:, refactor: — every commit tells a story',
            def: { label: 'What are conventional commits?', text: "Conventional commits is a standard for writing Git commit messages so any developer — including you six months from now — can understand what changed and why. A message like 'fix stuff' tells no one anything. A message like 'fix(auth): handle expired Supabase token on session restore' tells a hiring manager reviewing your GitHub exactly what changed, where, and why. Format: type(scope): short description. Common types: feat (new feature), fix (bug fix), refactor (restructuring without behavior change), docs, test, chore." },
            how: 'Starting today, every commit to nextvillage.community must follow the convention. Install commitlint in the repo to enforce it automatically so it becomes habit, not a choice.',
            platform: 'Go back and look at your last 10 commits. How many tell a clear story? Rewrite them mentally using conventional format — this exercise reveals where your thinking about changes is vague.',
            submitPrompt: "Paste the output of `git log --oneline -10` from your repo showing at least 5 conventional commits (feat:, fix:, refactor:, etc.). Each commit message should follow the format type(scope): description.",
          },
          {
            name: 'Set up PR workflow on the vAI repo',
            short: 'Submit PRs to Kevin; he reviews before merge to main',
            def: { label: 'What is a Pull Request (PR)?', text: "A Pull Request is a formal request to merge code from one branch into another — typically from a feature branch into main. It is the standard collaboration mechanism in professional development. A PR includes: a description of what changed and why, a diff showing every line added or removed, and a review process where another developer reads your code and either approves it, requests changes, or asks questions. PRs create a permanent record of every decision made in a codebase." },
            how: 'On the nextvillage.community GitHub repo, enable branch protection on main: Settings → Branches → Add rule → require pull request review before merging. From now on, you never push directly to main.',
            platform: 'The next feature you build — even a small one — goes through a full PR. Write the description as if Kevin has never seen the code before.',
            submitPrompt: "Paste the URL of a real PR you submitted on the vAI repo, plus the first paragraph of your PR description. The description should answer: what does this change, why was it needed, and how did you test it?",
          },
          {
            name: 'Add branch protection + CI lint/build check',
            short: 'Nothing merges to main without passing a gate you set up',
            def: { label: 'What is CI (Continuous Integration)?', text: 'CI is a practice where every code change automatically triggers a set of checks — linting, building, and optionally testing. GitHub Actions is the standard tool: you write a YAML file that describes what to run, and GitHub runs it on every push or PR.' },
            how: 'Create a .github/workflows/ci.yml file in nextvillage.community that runs npm run lint and npm run build on every PR. Then add a branch protection rule requiring this check to pass before merging.',
            platform: 'The Vite build already exists — hooking it into GitHub Actions takes about 20 lines of YAML. Once CI is running, you will never again accidentally merge code that breaks the build.',
            submitPrompt: "Paste the full contents of your .github/workflows/ci.yml file. It should include checkout, node setup, npm ci, and at minimum npm run build.",
          },
        ],
      },
      {
        label: 'System Design (Your Own Work)',
        tasks: [
          {
            name: 'Draw the vAI architecture you built',
            short: '1-page diagram: React → Vercel → Supabase → AI services',
            def: { label: 'What is a system architecture diagram?', text: 'An architecture diagram is a visual map of the components in a system and how they communicate. For a web platform it typically shows: the frontend (React), the hosting layer (Vercel), the database and auth (Supabase), external AI services, and any edge functions or background jobs.' },
            how: 'Include: the React frontend served from Vercel, Supabase (database, auth, storage, edge functions), AI service calls (which pages call which models), SSE streaming flows, and the two learner cohorts (Oloibiri and Ibiade) as distinct data contexts.',
            platform: 'Use Excalidraw or draw.io. Export as PNG and commit it to the repo under /docs/architecture.png.',
            submitPrompt: "Paste the GitHub URL to your committed architecture diagram (e.g. https://github.com/yourrepo/blob/main/docs/architecture.png). Then write 2–3 sentences describing the most important data flow shown in the diagram.",
          },
          {
            name: 'Write 3 Architecture Decision Records (ADRs)',
            short: 'Context → options → decision → tradeoffs',
            def: { label: 'What is an ADR?', text: "An Architecture Decision Record captures a significant technical decision: the context that made it necessary, the options considered, the decision made, and the consequences — including tradeoffs. ADRs live in the codebase, typically in a /docs/decisions/ folder." },
            how: 'Three good candidates: (1) Why Supabase over a custom backend. (2) Why Vercel Edge Functions over standard serverless — SSE streaming requirement. (3) Why Anthropic with Groq fallback — quality vs. speed tradeoff.',
            platform: "Create /docs/decisions/001-supabase.md using the standard ADR template. Three ADRs in a public repo is a stronger signal than most junior developers\' entire portfolios.",
            submitPrompt: "Paste the full text of one of your three ADRs. It must include at minimum: Context, Options Considered, Decision, and Consequences/Tradeoffs sections.",
          },
          {
            name: "Name 2 things you'd do differently now",
            short: 'Written reflection — honest critical thinking about your own code',
            def: { label: 'Why does this matter?', text: "The ability to critically evaluate your own past work — without defensiveness — is a mark of a maturing developer. In interviews you will often be asked: 'What would you do differently if you rebuilt this?' A vague answer signals inexperience. A specific answer signals someone who learns from their decisions." },
            how: "Prompts: What part of the codebase do you dread touching, and why? What took much longer than it should have? What would you refactor first if you had a free week?",
            platform: "Write this as a short section in your README under 'Lessons learned.'",
            submitPrompt: "Paste the 'Lessons learned' section you added to your README. Each of the two items should name a specific technical decision, explain what went wrong or what was harder than expected, and describe what you would do differently.",
          },
        ],
      },
    ],
  },
  {
    id: 'p2',
    label: 'Phase 2 · Months 2–4',
    title: 'Testing & Debugging Rigor',
    subtitle: '"It works" is not the same as "I know why it works"',
    color: '#0e8f62',
    colorBg: 'rgba(14,143,98,0.07)',
    colorBorder: 'rgba(14,143,98,0.22)',
    milestone: 'A working test suite with 10+ tests for nextvillage.community. At least one test catches a regression Kevin deliberately introduces into the codebase.',
    tracks: [
      {
        label: 'Testing Practice',
        tasks: [
          {
            name: 'Write unit tests for 3 existing utility functions',
            short: 'Vitest or Jest — small, fast, no network calls',
            def: { label: 'What is a unit test?', text: 'A unit test verifies a single function works correctly — in isolation, without a database, without a network, without a browser. You call the function with known inputs and assert expected outputs. Unit tests are the foundation of professional code quality.' },
            how: 'Since nextvillage.community uses Vite, use Vitest. Install with npm install -D vitest, add "test": "vitest" to package.json scripts, and write test files ending in .test.ts.',
            platform: 'Good candidates: proficiency scoring functions, cohort reporting calculations, and any date/time utility in the monthly assessment logic.',
            submitPrompt: "Paste the full contents of one of your test files (.test.ts). It should contain at least 3 test cases covering different inputs, including at least one edge case (empty input, null, boundary value).",
          },
          {
            name: 'Build an AI agent behavioral test harness',
            short: 'Agents simulate learner personas hitting real user flows',
            def: { label: 'What is an agentic simulation test suite?', text: 'AI agents behave like different types of users — a confused first-time learner, an advanced learner, a user on a slow connection — and interact with your platform as those users would. This catches UX failures and edge cases that unit tests cannot reach.' },
            how: 'Define 4–5 learner personas. Write a script for each: what they click, what they type, what responses they give. Use Playwright for browser automation and the Anthropic API to generate persona-appropriate responses dynamically.',
            platform: 'Start with the Oloibiri new-learner onboarding flow. Give this project its own repository and README — it is a portfolio centerpiece.',
            submitPrompt: "Paste the persona definition file (JSON or TypeScript) for at least 2 learner personas, plus a snippet of the Playwright test script that drives one persona through the onboarding flow.",
          },
          {
            name: 'Write a manual test plan for one full user journey',
            short: 'Written before testing, not reconstructed after',
            def: { label: 'What is a manual test plan?', text: "A manual test plan describes step by step how a human tester should verify a feature works — written before testing begins. It forces you to think clearly about what 'working correctly' actually means." },
            how: 'Structure: Scope, Preconditions, Steps (numbered actions with expected results), Edge cases, Pass/Fail criteria.',
            platform: 'Write the test plan for the full new-learner journey: discovery → registration → first AI interaction → first assessment → certificate generation.',
            submitPrompt: "Paste your complete manual test plan document. It must include all five sections: Scope, Preconditions, Steps (at least 8 numbered steps with expected results), Edge Cases (at least 3), and Pass/Fail Criteria.",
          },
        ],
      },
      {
        label: 'Debugging Without the Fix First',
        tasks: [
          {
            name: 'Keep a hypothesis log for the next 5 bugs',
            short: 'Write your theory before opening AI — then check if you were right',
            def: { label: 'What is hypothesis-driven debugging?', text: "Hypothesis-driven debugging inserts one step before reaching for AI: form a specific, testable explanation for why the bug exists. Format: 'I believe the issue is X because Y evidence, and I can confirm by doing Z.' This trains you to reason about systems rather than pattern-match on symptoms." },
            how: "For each bug write: (1) the observable symptom, (2) your hypothesis before looking at anything, (3) what you found, (4) whether your hypothesis was correct. Keep this in a debug-log.md.",
            platform: 'After 5 entries, review: how accurate were your hypotheses? Where were your mental models wrong?',
            submitPrompt: "Paste all 5 entries from your debug-log.md. Each entry must have all four fields: symptom, hypothesis, finding, and accuracy assessment. The log should show honest reflection on where your hypotheses were wrong.",
          },
          {
            name: 'Learn Supabase logs + Vercel function logs',
            short: 'Platform-level debugging, not just the browser console',
            def: { label: 'What are platform logs?', text: 'The browser console shows errors in the browser. Platform logs show everything else: database queries that failed, edge functions that timed out, auth events that were rejected. A developer who can only read browser errors is missing the majority of production failure information.' },
            how: 'Learn: how to filter Supabase logs by time, endpoint, and status code; how to read a slow query log; how to find Vercel function logs for a specific request.',
            platform: 'Spend one hour exploring Supabase logs for the Oloibiri cohort. Look at the last 100 auth events.',
            submitPrompt: "Paste a screenshot description or text output from Supabase logs showing at least one real event you investigated (auth event, API call, or error). Then write 2–3 sentences explaining what you found and what it told you about your platform.",
          },
          {
            name: 'Write one post-mortem on a past bug',
            short: 'Timeline, root cause, what signals were missed',
            def: { label: 'What is a post-mortem?', text: 'A post-mortem is a written analysis of a bug conducted after it is resolved. It is not about blame — it is about learning. A good post-mortem describes: what happened and when, the impact, the root cause, what fixed it, and what changes would prevent recurrence.' },
            how: 'Standard format — Summary, Timeline, Root cause, Impact, Resolution, Prevention.',
            platform: 'Pick the most significant bug you have fixed — something that affected real learners in Oloibiri or Ibiade.',
            submitPrompt: "Paste your complete post-mortem document. It must include all six sections: Summary (one sentence), Timeline (at least 3 timestamped entries), Root Cause (the underlying technical reason, not just the symptom), Impact, Resolution, and Prevention.",
          },
        ],
      },
    ],
  },
  {
    id: 'p3',
    label: 'Phase 3 · Months 4–6',
    title: 'Reading Code & System Design',
    subtitle: 'From owner of one codebase to developer anywhere',
    color: '#b07800',
    colorBg: 'rgba(176,120,0,0.07)',
    colorBorder: 'rgba(176,120,0,0.22)',
    milestone: 'A merged open-source contribution. You can talk about what reading unfamiliar code taught you — not just what you changed.',
    tracks: [
      {
        label: 'Code Reading',
        tasks: [
          {
            name: 'Contribute a fix to an open-source repo',
            short: 'Unfamiliar codebase, real review process',
            def: { label: 'What does open-source contribution prove?', text: "Contributing requires navigating a codebase you did not write, understanding its conventions, making a change that fits the existing style, writing a PR description that convinces strangers your change is correct, and responding to review feedback professionally. A merged PR in a public repository is verifiable by any hiring manager in 30 seconds." },
            how: "On GitHub, search for issues labeled 'good first issue' in repos you already use. A documentation fix or a small bug fix is better than a large feature.",
            platform: 'If you encounter a limitation in a library used on nextvillage.community, that is the ideal contribution candidate.',
            submitPrompt: "Paste the GitHub URL of your merged pull request. Then write a paragraph describing: what the bug or issue was, how you navigated the unfamiliar codebase to find the right place to fix it, and what the review process was like.",
          },
          {
            name: "Read and formally critique a peer's project",
            short: "Structured written review: what works, what you'd change, and why",
            def: { label: 'What is a code review?', text: "A code review is a systematic examination of someone else's code. Good reviewers look for: correctness, clarity, edge cases, and security. The ability to give precise, constructive code review distinguishes senior developers." },
            how: "Your critique should include: what the code does well (be specific), at least two things you would change with clear reasons, and one question you would ask the author before merging.",
            platform: "This skill directly applies to leading future Oloibiri developers.",
            submitPrompt: "Paste your written code review. It must include three sections: (1) What works well — with at least one specific, non-generic observation. (2) Two specific changes with reasons. (3) One question you would ask the author before merging.",
          },
          {
            name: 'Trace one library you use daily into its source',
            short: 'Read it. Understand what it actually does. Write a 1-paragraph summary.',
            def: { label: 'Why read library source code?', text: "Reading the source of a library you depend on builds three capabilities: you understand what it can and cannot do, you can debug it when it behaves unexpectedly, and you learn patterns from developers who are better than you." },
            how: 'Pick one function from a library used in nextvillage.community. Find the source on GitHub. Trace the function: what does it call internally? What errors can it throw? What assumptions does it make?',
            platform: 'The Supabase JS client is open source. Reading how signInWithPassword() works under the hood will deepen your understanding of the auth flow.',
            submitPrompt: "Name the library and function you traced. Paste a link to the source on GitHub. Then write your 1-paragraph plain-English summary explaining what the function actually does internally — including at least one thing that surprised you or that you did not know before reading the source.",
          },
        ],
      },
      {
        label: 'System Design + Credentials',
        tasks: [
          {
            name: "Design a system you haven't built",
            short: 'Diagram it, choose a stack, defend the tradeoffs',
            def: { label: 'What is a system design exercise?', text: "System design is the process of defining the architecture, components, and data flows before writing any code. It tests whether you can reason about scale, tradeoffs, and technical decisions without being told what to build." },
            how: 'Prompt: Design a push notification system for nextvillage.community that sends daily learning reminders to 10,000 learners across Oloibiri and Ibiade, with different message content per cohort and offline delivery queuing for intermittent connections.',
            platform: 'Produce: a component diagram, a data model, your stack choices, and a paragraph on what you would do differently at 100,000 learners.',
            submitPrompt: "Paste your system design document. It must include: a component list with responsibilities, a data model (table/schema sketch), stack choices with justification, and a paragraph addressing scale to 100,000 learners. Diagrams can be described in text if you cannot paste an image.",
          },
          {
            name: 'GitHub Foundations certification',
            short: 'Validates Git discipline with a portable credential',
            def: { label: 'What is the GitHub Foundations certification?', text: 'GitHub Foundations is an official certification from GitHub that validates knowledge of Git fundamentals, repositories, branching, PRs, issues, Actions, and collaboration workflows. It appears on your LinkedIn and GitHub profile as a verified credential.' },
            how: 'GitHub provides a free study guide at gh.io/foundations-study-guide. After completing Phases 1 and 2, you will already know most of the material from practice.',
            platform: 'The GitHub Foundations certification signals to Nigerian and international employers that your Git practices meet a verified standard.',
            submitPrompt: "Paste your GitHub Foundations certification badge URL or credential ID from your GitHub profile or Credly. Then write 1–2 sentences on which topic in the exam you found hardest and why.",
          },
          {
            name: 'Microsoft AI-900 certification',
            short: 'AI vocabulary + third-party validation for the Nigerian market',
            def: { label: 'What is AI-900?', text: "Microsoft AI-900 (Azure AI Fundamentals) covers core AI concepts: machine learning, computer vision, natural language processing, generative AI, and responsible AI principles. In Nigeria and across Africa, Microsoft certifications carry significant weight with employers." },
            how: 'Microsoft offers free learning paths at learn.microsoft.com. Budget 3–4 weeks of study.',
            platform: "The AI-900 also strengthens partnership conversations — including with Microsoft's Elevate Africa program.",
            submitPrompt: "Paste your AI-900 certification badge URL or Credly credential ID. Then write 2–3 sentences connecting one concept from the AI-900 curriculum to something specific in how nextvillage.community works.",
          },
        ],
      },
    ],
  },
  {
    id: 'p4',
    label: 'Phase 4 · Months 6–9',
    title: 'Platform Ownership & Portfolio',
    subtitle: 'Employable identity + full vAI stewardship',
    color: '#c24a20',
    colorBg: 'rgba(194,74,32,0.07)',
    colorBorder: 'rgba(194,74,32,0.22)',
    milestone: 'A live portfolio. A live platform you can say you own — and prove it. An interview you can walk into with stories, not just code.',
    tracks: [
      {
        label: 'vAI Platform Stewardship',
        tasks: [
          {
            name: 'Own one full feature solo: requirements → deploy',
            short: 'No review from Kevin until you request it',
            def: { label: 'What does full ownership of a feature mean?', text: 'Full ownership means you are responsible for every phase: writing the requirements, designing the solution, building and testing it, writing the PR, deploying it, and monitoring it for the first week after launch.' },
            how: 'Suggested feature: a learner progress dashboard visible to Bennywhite Davidson and Solomon Mathias Solomon — showing weekly active learners, assessment completion rates, and proficiency trends for both cohorts.',
            platform: 'Share the requirements document with Kevin not for approval but for information — then proceed independently.',
            submitPrompt: "Paste: (1) your one-page requirements document, (2) the GitHub PR URL, and (3) the Vercel deployment URL. The requirements document must be written before the code — if the PR predates the doc, that is a flag.",
          },
          {
            name: 'Own monitoring + incident log for 60 days',
            short: 'You are the on-call person — document every anomaly',
            def: { label: 'What is platform monitoring?', text: 'Monitoring is actively watching a live system to detect problems — ideally before users report them. An incident log is a running record of every anomaly: what happened, when, what the likely cause was, and whether action was taken.' },
            how: 'Set up Vercel status alerts for deployment failures and Supabase email alerts for auth anomalies. Create an incident-log.md and update it weekly.',
            platform: 'The Oloibiri cohort operates in an environment with intermittent connectivity. 60 days of monitoring will give you real data on how offline conditions affect your platform.',
            submitPrompt: "Paste your incident-log.md covering at least 4 weeks. It must include at least 3 entries with: date, observed anomaly, likely cause, and action taken (or \"no action — monitored\"). Then paste your 1-page summary of patterns observed.",
          },
          {
            name: 'Write the vAI onboarding doc for a future developer',
            short: 'If you left, could someone else take over? Write that guide.',
            def: { label: 'What is a developer onboarding document?', text: "A developer onboarding document allows a new developer to understand, run, and contribute to a codebase without asking questions. Writing one forces you to surface assumptions you have been carrying silently — things you 'just know' that no one else would." },
            how: 'Cover: prerequisites, architecture overview, key flows (how a new learner is created, how assessments work, how certifications are generated), deployment process, and known gotchas.',
            platform: 'This document is also the foundation for training future Oloibiri developers.',
            submitPrompt: "Paste the full onboarding document. It must include all five sections: Prerequisites, Architecture Overview (with link to diagram), Key Flows (at least 3 flows described step-by-step), Deployment Process, and Known Gotchas (at least 2).",
          },
        ],
      },
      {
        label: 'Portfolio & Employability',
        tasks: [
          {
            name: 'Build one independent project (not vAI)',
            short: 'Your idea, your stack — demonstrates agency to hiring managers',
            def: { label: 'Why an independent project?', text: "nextvillage.community is genuinely impressive — but it was initiated and mentored by Kevin. An independent project built from your own idea answers definitively: 'Is this his work or his mentor's?'" },
            how: 'Criteria: your own idea, deployed and publicly accessible, with a README explaining what it does, why you built it, and what you would do differently.',
            platform: 'What problem did you notice while building nextvillage.community that the platform itself does not solve? That gap is your independent project.',
            submitPrompt: "Paste: (1) the live URL, (2) the GitHub repo URL, and (3) the README excerpt that covers what it does, why you built it, and what you would do differently. The project must be deployed — a GitHub repo alone does not count.",
          },
          {
            name: 'Launch a portfolio site: two projects with architecture notes',
            short: 'Not just screenshots — explain the decisions and tradeoffs',
            def: { label: 'What makes a developer portfolio effective?', text: "Most developer portfolios show screenshots and list technologies. An effective portfolio shows thinking: why was this architecture chosen, what tradeoffs were made, what problems were harder than they looked. A hiring manager remembers the one who explained their decisions." },
            how: 'For each project include: a 2-sentence description, the architecture diagram, one key technical decision and why, one thing that was harder than expected, and a live link plus GitHub link.',
            platform: 'The vAI platform entry should lead with the human impact — 79+ learners in off-grid Nigeria — before the technical details.',
            submitPrompt: "Paste the live URL of your portfolio site. Then paste the full text of the vAI project entry — it must include human impact framing first, then architecture, then technical decisions. The portfolio must be live, not a local build.",
          },
          {
            name: 'Complete a mock technical interview with Kevin',
            short: 'Architecture, live debugging, tradeoff discussion — treat it as real',
            def: { label: 'What does a technical interview look like?', text: "A technical interview has three parts: (1) a conversation about your background and projects; (2) a live coding or debugging exercise solved in real time while thinking out loud; (3) a system design discussion where the interviewer wants to hear your reasoning process." },
            how: "The mock interview should cover: (1) Describe nextvillage.community in 90 seconds. (2) Kevin introduces a bug — you diagnose it while narrating your thinking out loud. (3) Tradeoff question: 'Why Supabase instead of building your own auth?'",
            platform: "The 90-second platform description is the most important exercise. Practice it until it leads with impact before technology.",
            submitPrompt: "Write your 90-second platform description as you would deliver it in a real interview. Then write Kevin's feedback from the mock interview — what he said you did well and what he said you should improve. Both parts are required.",
          },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Flat ordered list of all task keys for sequential gating
const ALL_TASK_KEYS: string[] = PHASES.flatMap(p =>
  p.tracks.flatMap(t => t.tasks.map(task => `${p.id}::${task.name}`))
);

function taskKey(phaseId: string, taskName: string) {
  return `${phaseId}::${taskName}`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const DiagCard: React.FC<{
  item: DiagItem;
  record: ProgressRecord | null;
  onEvaluated: (rec: ProgressRecord) => void;
}> = ({ item, record, onEvaluated }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(record?.submission_text ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passed = record?.status === 'pass';

  const handleSubmit = async () => {
    if (!text.trim() || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const systemPrompt = `You are a rigorous but encouraging technical mentor evaluating a self-assessment submitted by a developer learner.

The diagnostic is: "${item.q}"
What good evidence looks like: ${item.submitPrompt}

Evaluate the submission strictly but fairly. Respond in JSON only, no markdown, no preamble:
{
  "pass": true | false,
  "feedback": "2-4 sentences. If pass=true: confirm what was demonstrated and what to carry into Phase 1. If pass=false: be specific about what is vague, missing, or needs more depth, and what to resubmit."
}

Pass criteria: the submission shows genuine self-knowledge of the learner's own platform. Vague, generic, or copy-pasted answers should not pass. Honest gaps with specific detail are fine.`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          system: systemPrompt,
          messages: [{ role: 'user', content: text.trim() }],
        }),
      });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();
      const raw = data.content?.[0]?.text ?? '{}';
      let parsed: { pass: boolean; feedback: string };
      try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
      catch { throw new Error('Could not parse evaluation response.'); }

      const newStatus: TaskStatus = parsed.pass ? 'pass' : 'needs_work';
      const { error: dbError } = await supabase
        .from('tech_skills_progress')
        .upsert({
          user_id: user.id,
          phase_id: 'diag',
          track_label: 'Diagnostic',
          task_name: item.q,
          status: newStatus,
          submission_text: text.trim(),
          ai_feedback: parsed.feedback,
          ai_score: parsed.pass ? 1 : 0,
          submitted_at: new Date().toISOString(),
          evaluated_at: new Date().toISOString(),
          attempt_count: (record?.attempt_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,phase_id,task_name' });
      if (dbError) throw new Error(dbError.message);

      onEvaluated({
        phase_id: 'diag',
        task_name: item.q,
        status: newStatus,
        submission_text: text.trim(),
        ai_feedback: parsed.feedback,
        attempt_count: (record?.attempt_count ?? 0) + 1,
      });
    } catch (e: any) {
      setError(e.message ?? 'Evaluation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-lg border bg-white p-4 transition-shadow hover:shadow-sm ${
      passed ? 'border-emerald-300' : 'border-purple-200'
    }`}>
      {/* Header row — clickable to expand */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {passed
                ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                : record?.status === 'needs_work'
                  ? <RefreshCw size={14} className="text-amber-400 flex-shrink-0" />
                  : <Circle size={14} className="text-purple-300 flex-shrink-0" />
              }
              <p className="text-xs font-mono uppercase tracking-wider text-purple-500">{item.q}</p>
            </div>
            <p className="text-sm text-gray-700 leading-snug">{item.summary}</p>
          </div>
          <span className="text-xs text-purple-300 font-mono flex-shrink-0 mt-0.5">
            {open ? '▴' : '▾'}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-purple-100 space-y-3">
          {/* Definition */}
          <div className="rounded bg-purple-50 p-2.5">
            <span className="font-medium text-purple-700 text-xs">Definition: </span>
            <span className="text-xs text-gray-700">{item.def}</span>
          </div>
          {/* Detail / instructions */}
          <p className="text-xs text-gray-600 leading-relaxed">{item.detail}</p>

          {/* What to submit */}
          <div className="rounded-md p-3 bg-purple-50 border border-purple-200">
            <p className="text-xs font-mono uppercase tracking-wider text-purple-600 mb-1 flex items-center gap-1">
              <ClipboardList size={11} /> What to submit
            </p>
            <p className="text-xs text-gray-700 leading-relaxed">{item.submitPrompt}</p>
            <p className="text-xs text-gray-400 mt-2 italic">
              Write in plain text below. No code required — this is a self-assessment of what you already know.
              You can work from nextvillage.community or your own full-stack platform.
            </p>
          </div>

          {/* Prior feedback */}
          {record?.ai_feedback && (
            <div className={`rounded-md p-3 border ${
              passed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${
                passed ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {passed
                  ? <><ThumbsUp size={11} className="inline mr-1" />Passed — mentor feedback</>
                  : <><AlertCircle size={11} className="inline mr-1" />Needs work — attempt {record.attempt_count}</>
                }
              </p>
              <p className="text-xs text-gray-700 leading-relaxed">{record.ai_feedback}</p>
            </div>
          )}

          {/* Textarea + submit */}
          {!passed && (
            <>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Write your answer here — be specific about your platform..."
                rows={6}
                className="w-full text-sm rounded-md border border-purple-200 bg-white p-3 resize-y focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              {error && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </p>
              )}
              <button
                onClick={handleSubmit}
                disabled={loading || !text.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 text-white text-xs font-semibold px-4 py-2 hover:bg-purple-700 transition-colors disabled:opacity-40"
              >
                {loading
                  ? <><Loader2 size={13} className="animate-spin" /> Evaluating…</>
                  : <><Send size={13} /> Submit for evaluation</>
                }
              </button>
              {record?.status === 'needs_work' && (
                <p className="text-xs text-gray-400 font-mono">
                  Attempt {(record.attempt_count ?? 0) + 1} · revise and resubmit anytime
                </p>
              )}
            </>
          )}
          {passed && (
            <p className="text-xs text-emerald-600 font-mono flex items-center gap-1">
              <CheckCircle2 size={13} /> Complete
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Submission panel ──────────────────────────────────────────────────────────

interface SubmissionPanelProps {
  task: Task;
  phaseId: string;
  phaseColor: string;
  phaseBg: string;
  record: ProgressRecord | null;
  onEvaluated: (rec: ProgressRecord) => void;
}

const SubmissionPanel: React.FC<SubmissionPanelProps> = ({
  task, phaseId, phaseColor, phaseBg, record, onEvaluated
}) => {
  const { user } = useAuth();
  const [text, setText] = useState(record?.submission_text ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyPassed = record?.status === 'pass';

  const handleSubmit = async () => {
    if (!text.trim() || !user?.id) return;
    setLoading(true);
    setError(null);

    try {
      // ── 1. Call Anthropic via edge function (or directly) for evaluation ──
      const systemPrompt = `You are a rigorous but encouraging technical mentor evaluating evidence submitted by a developer learner named Silas.

The task is: "${task.name}"
What good evidence looks like: ${task.submitPrompt}

Evaluate the submission strictly but fairly. Respond in JSON only, no markdown, no preamble:
{
  "pass": true | false,
  "feedback": "2-4 sentences. If pass=true: confirm what was done well and what to carry forward. If pass=false: be specific about exactly what is missing or needs improvement and what to resubmit."
}

Pass criteria: the submission meaningfully addresses the task requirements described above. Incomplete, placeholder, or off-topic submissions should not pass.`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          system: systemPrompt,
          messages: [{ role: 'user', content: text.trim() }],
        }),
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();
      const raw = data.content?.[0]?.text ?? '{}';
      let parsed: { pass: boolean; feedback: string };
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      } catch {
        throw new Error('Could not parse evaluation response.');
      }

      const newStatus: TaskStatus = parsed.pass ? 'pass' : 'needs_work';

      // ── 2. Upsert into tech_skills_progress ──
      const { error: dbError } = await supabase
        .from('tech_skills_progress')
        .upsert({
          user_id: user.id,
          phase_id: phaseId,
          track_label: '', // caller could pass this; fine as empty for now
          task_name: task.name,
          status: newStatus,
          submission_text: text.trim(),
          ai_feedback: parsed.feedback,
          ai_score: parsed.pass ? 1 : 0,
          submitted_at: new Date().toISOString(),
          evaluated_at: new Date().toISOString(),
          attempt_count: (record?.attempt_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,phase_id,task_name' });

      if (dbError) throw new Error(dbError.message);

      const updated: ProgressRecord = {
        phase_id: phaseId,
        task_name: task.name,
        status: newStatus,
        submission_text: text.trim(),
        ai_feedback: parsed.feedback,
        attempt_count: (record?.attempt_count ?? 0) + 1,
      };
      onEvaluated(updated);
    } catch (e: any) {
      setError(e.message ?? 'Evaluation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-4 space-y-3">

      {/* What to submit */}
      <div className="rounded-md p-3" style={{ background: phaseBg, borderLeft: `3px solid ${phaseColor}` }}>
        <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: phaseColor }}>
          <ClipboardList size={11} className="inline mr-1" />What to submit
        </p>
        <p className="text-xs text-gray-700 leading-relaxed">{task.submitPrompt}</p>
        <p className="text-xs text-gray-500 mt-2 italic">
          Paste from your terminal, AI Playground, GitHub, or document editor.
          You can work from nextvillage.community or your own website.
          The AI evaluator checks your submission against these criteria.
        </p>
      </div>

      {/* Feedback from previous attempt */}
      {record?.ai_feedback && (
        <div className={`rounded-md p-3 border ${
          record.status === 'pass'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${
            record.status === 'pass' ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            {record.status === 'pass'
              ? <><ThumbsUp size={11} className="inline mr-1" />Passed — mentor feedback</>
              : <><AlertCircle size={11} className="inline mr-1" />Needs work — attempt {record.attempt_count}</>
            }
          </p>
          <p className="text-xs text-gray-700 leading-relaxed">{record.ai_feedback}</p>
        </div>
      )}

      {/* Submission textarea */}
      {!alreadyPassed && (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste your evidence here — terminal output, code, document text, URLs..."
            rows={8}
            className="w-full text-sm font-mono rounded-md border border-gray-200 bg-gray-50 p-3 resize-y focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': phaseColor } as any}
          />

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !text.trim()}
            className="inline-flex items-center gap-2 rounded-lg text-white text-xs font-semibold px-4 py-2 transition-opacity disabled:opacity-40"
            style={{ background: phaseColor }}
          >
            {loading
              ? <><Loader2 size={13} className="animate-spin" /> Evaluating…</>
              : <><Send size={13} /> Submit for evaluation</>
            }
          </button>

          {record?.status === 'needs_work' && (
            <p className="text-xs text-gray-400 font-mono">
              Attempt {(record.attempt_count ?? 0) + 1} · revise and resubmit anytime
            </p>
          )}
        </>
      )}

      {alreadyPassed && (
        <p className="text-xs text-emerald-600 font-mono flex items-center gap-1">
          <CheckCircle2 size={13} /> Task complete · next task is now unlocked
        </p>
      )}
    </div>
  );
};

// ── TaskRow ───────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  phaseId: string;
  phaseColor: string;
  phaseBg: string;
  status: TaskStatus;
  record: ProgressRecord | null;
  onEvaluated: (rec: ProgressRecord) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({
  task, phaseId, phaseColor, phaseBg, status, record, onEvaluated
}) => {
  const [open, setOpen] = useState(false);
  const locked = status === 'locked';
  const passed = status === 'pass';

  return (
    <div className={`border-b border-gray-100 last:border-0 ${locked ? 'opacity-50' : ''}`}>
      {/* Row header */}
      <div className="flex items-start gap-3 py-3 px-1">
        {/* Status icon */}
        <div className="mt-0.5 flex-shrink-0">
          {passed
            ? <CheckCircle2 size={18} style={{ color: phaseColor }} />
            : locked
              ? <Lock size={18} className="text-gray-300" />
              : status === 'needs_work'
                ? <RefreshCw size={18} className="text-amber-400" />
                : <Circle size={18} className="text-gray-300" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${passed ? 'line-through text-gray-400' : locked ? 'text-gray-400' : 'text-gray-800'}`}>
            {task.name}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 italic">{task.short}</p>
          {status === 'needs_work' && (
            <p className="text-xs text-amber-500 mt-0.5 font-mono">↩ revise and resubmit</p>
          )}
        </div>

        <button
          onClick={() => !locked && setOpen(o => !o)}
          disabled={locked}
          className={`flex-shrink-0 flex items-center gap-1 text-xs border rounded-md px-2 py-1 font-mono transition-colors ${
            locked
              ? 'text-gray-300 border-gray-100 cursor-not-allowed'
              : 'text-gray-400 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {locked ? <><Lock size={10} /> locked</> : <>details {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</>}
        </button>
      </div>

      {/* Accordion */}
      {open && !locked && (
        <div className="ml-7 mb-3 space-y-3">
          {/* Definition */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 text-sm text-gray-700">
            <div className="rounded-md p-3" style={{ background: phaseBg, borderLeft: `3px solid ${phaseColor}` }}>
              <p className="text-xs font-mono uppercase tracking-wider mb-1.5" style={{ color: phaseColor }}>
                {task.def.label}
              </p>
              <p className="text-xs leading-relaxed text-gray-700">{task.def.text}</p>
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">How to practice</p>
              <p className="text-sm text-gray-700">{task.how}</p>
            </div>
            <div className="rounded-md p-3 bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-mono uppercase tracking-wider text-emerald-700 mb-1.5">
                On nextvillage.community
              </p>
              <p className="text-xs leading-relaxed text-emerald-900">{task.platform}</p>
            </div>
          </div>

          {/* Submission panel */}
          <SubmissionPanel
            task={task}
            phaseId={phaseId}
            phaseColor={phaseColor}
            phaseBg={phaseBg}
            record={record}
            onEvaluated={onEvaluated}
          />
        </div>
      )}
    </div>
  );
};

// ── PhaseSection ──────────────────────────────────────────────────────────────

interface PhaseSectionProps {
  phase: Phase;
  progressMap: Map<string, ProgressRecord>;
  onEvaluated: (rec: ProgressRecord) => void;
  diagAllPassed: boolean;
}

const PhaseSection: React.FC<PhaseSectionProps> = ({ phase, progressMap, onEvaluated, diagAllPassed }) => {
  const [open, setOpen] = useState(phase.id === 'p1');

  const phaseIcon = {
    p1: <GitBranch size={16} />,
    p2: <FlaskConical size={16} />,
    p3: <Layers size={16} />,
    p4: <Trophy size={16} />,
  }[phase.id];

  const allTasks = phase.tracks.flatMap(t => t.tasks);
  const passedCount = allTasks.filter(t => progressMap.get(taskKey(phase.id, t.name))?.status === 'pass').length;

  return (
    <div className="mb-8">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-start gap-3 mb-4"
      >
        <span
          className="mt-1 flex-shrink-0 text-xs font-bold tracking-wide px-3 py-1 rounded-full"
          style={{ background: phase.colorBg, color: phase.color, border: `1px solid ${phase.colorBorder}` }}
        >
          {phase.label}
        </span>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 leading-tight flex items-center gap-2">
            <span style={{ color: phase.color }}>{phaseIcon}</span>
            {phase.title}
          </h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{phase.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-shrink-0">
          <span className="text-xs font-mono text-gray-400">{passedCount}/{allTasks.length}</span>
          {open ? <ChevronUp size={18} className="text-gray-300" /> : <ChevronDown size={18} className="text-gray-300" />}
        </div>
      </button>

      {open && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {phase.tracks.map((track, ti) => (
              <div key={ti} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: phase.color }}>
                  {track.label}
                </p>
                {track.tasks.map((task, i) => {
                  const key = taskKey(phase.id, task.name);
                  const rec = progressMap.get(key) ?? null;
                  const globalIdx = ALL_TASK_KEYS.indexOf(key);
                  const prevKey = globalIdx > 0 ? ALL_TASK_KEYS[globalIdx - 1] : null;
                  const prevPassed = prevKey
                    ? progressMap.get(prevKey)?.status === 'pass'
                    : diagAllPassed; // first task unlocks only after diagnostics pass
                  const status: TaskStatus = rec?.status === 'pass'
                    ? 'pass'
                    : !prevPassed
                      ? 'locked'
                      : rec?.status ?? 'available';

                  return (
                    <TaskRow
                      key={i}
                      task={task}
                      phaseId={phase.id}
                      phaseColor={phase.color}
                      phaseBg={phase.colorBg}
                      status={status}
                      record={rec}
                      onEvaluated={onEvaluated}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Milestone */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">{phase.id === 'p4' ? '🏁' : '🎯'}</span>
            <div>
              <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: phase.color }}>
                Phase milestone
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{phase.milestone}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-gray-100" />
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const TechSkillsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [progressMap, setProgressMap] = useState<Map<string, ProgressRecord>>(new Map());
  const [loadingProgress, setLoadingProgress] = useState(true);

  // Load all progress records for this user
  useEffect(() => {
    if (!user?.id) { setLoadingProgress(false); return; }
    supabase
      .from('tech_skills_progress')
      .select('phase_id, task_name, status, submission_text, ai_feedback, attempt_count')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error) console.error('[TechSkillsPage] progress load error:', error);
        if (data) {
          const map = new Map<string, ProgressRecord>();
          data.forEach((r: any) => map.set(taskKey(r.phase_id, r.task_name), r));
          setProgressMap(map);
        }
        setLoadingProgress(false);
      });
  }, [user?.id]);

  const handleEvaluated = useCallback((rec: ProgressRecord) => {
    setProgressMap(prev => {
      const next = new Map(prev);
      next.set(taskKey(rec.phase_id, rec.task_name), rec);
      return next;
    });
  }, []);

  const totalTasks = PHASES.reduce((sum, p) => sum + p.tracks.reduce((s, t) => s + t.tasks.length, 0), 0);
  const totalPassed = [...progressMap.values()].filter(r => r.status === 'pass').length;
  const diagAllPassed = DIAGNOSTICS.every(d => progressMap.get(taskKey('diag', d.q))?.status === 'pass');

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10 pb-20">

        {/* Home button */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/home')}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-gray-700 transition-colors border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50"
          >
            ← Home
          </button>
        </div>

        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-3">
            vAI · nextvillage.community
          </p>
          <h1 className="text-4xl font-extrabold text-gray-900 leading-tight mb-3">
            Employable{' '}
            <span className="bg-gradient-to-r from-purple-600 via-blue-500 to-emerald-500 bg-clip-text text-transparent">
              Developer Roadmap
            </span>
          </h1>
          <p className="text-base text-gray-500 max-w-xl leading-relaxed mb-6">
            A 9-month plan from full-stack builder to platform owner and employable developer.
            Each task must be completed and evaluated before the next unlocks.
          </p>

          {/* AI Playground CTA */}
          <div className="inline-flex items-start gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <Terminal size={22} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800 mb-0.5">
                Use the AI Playground to do the work
              </p>
              <p className="text-xs text-blue-600 leading-relaxed mb-3">
                For each task, open the AI Playground and use it as your thinking partner.
                Then paste your evidence back here to submit.
              </p>
              <button
                onClick={() => window.open('/playground', '_blank')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white text-xs font-semibold px-4 py-2 hover:bg-blue-700 transition-colors"
              >
                <Terminal size={13} />
                Open AI Playground
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Progress summary */}
        <div className="mb-8 rounded-xl border border-gray-100 bg-gray-50 px-5 py-4 flex items-center gap-4">
          <BookOpen size={18} className="text-gray-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-1">
              Your progress
            </p>
            {loadingProgress ? (
              <p className="text-sm text-gray-400 flex items-center gap-1">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </p>
            ) : (
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-800">{totalPassed}</span>
                  <span className="text-gray-400"> / {totalTasks} tasks passed</span>
                </p>
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-xs">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${(totalPassed / totalTasks) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Diagnostic */}
        <div className="mb-10 rounded-xl border border-purple-200 bg-purple-50 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className="text-purple-500" />
            <p className="text-xs font-mono uppercase tracking-wider text-purple-600">
              Start here — diagnostic before month 1
            </p>
          </div>
          <p className="text-xs text-purple-500 mb-4">
            Complete all three before Phase 1 unlocks. Your answers reveal where to push hardest.
            You must pass each one — the AI evaluator checks for genuine self-knowledge of your platform.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DIAGNOSTICS.map((d, i) => (
              <DiagCard
                key={i}
                item={d}
                record={progressMap.get(taskKey('diag', d.q)) ?? null}
                onEvaluated={handleEvaluated}
              />
            ))}
          </div>
        </div>

        {/* Phase 1 gate notice */}
        {!loadingProgress && !diagAllPassed && (
          <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-4 flex items-center gap-3">
            <Lock size={16} className="text-purple-400 flex-shrink-0" />
            <p className="text-xs text-purple-600">
              <span className="font-semibold">Phase 1 is locked.</span>{' '}
              Complete and pass all three diagnostics above to unlock the roadmap.
            </p>
          </div>
        )}

        {/* Phases */}
        {!loadingProgress && PHASES.map(phase => (
          <PhaseSection
            key={phase.id}
            phase={phase}
            progressMap={progressMap}
            onEvaluated={handleEvaluated}
            diagAllPassed={diagAllPassed}
          />
        ))}

        {/* Footer */}
        <p className="text-center text-xs font-mono text-gray-300 pt-6 border-t border-gray-100">
          vAI · nextvillage.community · May 2026
        </p>
      </div>
    </div>
  );
};

export default TechSkillsPage;