// src/pages/tutorials/SkillDevelopmentCategoryGuidePage.tsx
//
// One Guide per Skill Development category — Digital Fluency, Critical
// Thinking, Problem-Solving, Creativity, Communication. Same shape as
// AILearningCategoryGuidePage.tsx (one dynamic route, one config-driven
// component, since the taxonomy is flat here too — confirmed against
// SkillsDevelopmentPage.tsx's skillCategories array and the same
// dashboard/learning_modules tables AI Learning uses, just category='Skills'
// instead of AI Learning's category value).
//
// Two real mechanical differences from AI Learning, both load-bearing for
// what this Guide teaches:
//
// 1. Only ONE scoring layer here, not two. AI Learning has an in-chat 0–3
//    rubric AND a separate UNESCO Comprehensive Assessment. Skills has just
//    the one rubric (buildSkillsFacilitatorPrompt / RUBRIC_DEFINITIONS in
//    SkillsDevelopmentPage.tsx) — it does double duty as both the live
//    coaching signal and the final certification score. There is no second
//    "formal assessment" pass to describe here.
//
// 2. The overall score is the MINIMUM across a category's dimensions, not
//    an average (`Math.min(...dimensions.map(d => d.score))`,
//    SkillsDevelopmentPage.tsx). One weak dimension caps the whole category
//    — worth teaching explicitly, especially for Digital Fluency, which has
//    7 dimensions instead of the other four categories' 2.
//
// Activity titles are hand-localized per student city_town (no fixed
// catalog the way AI Learning's 5-per-category curated list is), so unlike
// AILearningCategoryGuidePage's `firstActivityTitle` deep link, "do" steps
// here always use the `?create=1&category=<id>` contract — guaranteed to
// work for every student regardless of location, and it doubles as an
// invitation to design a session around the same kind of scenario just
// walked through.
//
// AI-world framing: SkillsDevelopmentPage.tsx and SkillDevelopmentStartPage
// never explain why these 5 skills matter, and the only in-app AI framing
// is one thin subtitle line. The real, citable material is in
// AboutPage.tsx's "AI Ready Skills" certification card: "AI amplifies
// whatever thinking you bring to it — this is the skillset that makes the
// amplification worth something," citing UNESCO Transversal Competencies,
// ISTE Standards, Partnership for 21st Century Skills, DigComp 2.2, and
// Classical Rhetoric (five different real frameworks, one per skill below
// where it fits — not the same UNESCO framework AI Learning cites, which is
// UNESCO's *AI Competency Framework*, a different document).
//
// Progress: localStorage first, mirrored to `tutorial_progress` when signed
// in — same as every other Guide. Track id is per-category
// (`skill-development-guide-<categoryId>`).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink,
  Monitor, Brain, Puzzle, Lightbulb, MessageSquare,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'gate';

interface Gate {
  label: string;
  placeholder: string;
  validate: (value: string) => string | null;
}

interface CriterionDef {
  name: string;
  detail: string;
}

interface Attempt {
  label: string;
  answer: string;
  critique: string;
  /** Plain-language reason this attempt is better than the last — absent on the first attempt. */
  whyBetter?: string;
}

interface CaseStudy {
  scenario: string;
  question: string;
  attempts: Attempt[];
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  aside?: string;
  criteriaList?: CriterionDef[];
  caseStudy?: CaseStudy;
  doLabel?: string;
  doHref?: string;
  gate?: Gate;
  narration?: string;
}

interface CategoryGuideContent {
  id: string;
  title: string;
  hook: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Why this specific skill matters more, not less, in an AI-saturated world. */
  whyAI: string;
  /** A short, real, citable framework anchor (from AboutPage.tsx's AI Ready Skills card) — optional. */
  frameworkNote?: string;
  criteria: CriterionDef[];
  caseStudy: CaseStudy;
}

/* ───────────────────────────── content ───────────────────────────── */

const CATEGORY_GUIDES: Record<string, CategoryGuideContent> = {
  'digital-fluency': {
    id: 'digital-fluency',
    title: 'Digital Fluency',
    hook: 'Navigating digital tools and AI systems confidently — the everyday tech skills everything else builds on.',
    Icon: Monitor,
    whyAI: 'Every AI tool you’ll ever use lives inside a device, a browser, a file system. If you can’t confidently navigate that layer — save a file where you can find it again, judge whether a website is trustworthy, recover when something breaks — you can’t actually use AI well, no matter how good the AI is. This is the floor everything else stands on.',
    frameworkNote: 'This category lines up with DigComp 2.2, the international framework for digital competence.',
    criteria: [
      { name: 'Device Familiarity & Control', detail: 'Can you confidently use keyboard, mouse, or touch controls, and navigate the operating system to open, switch, and close applications on your own?' },
      { name: 'Typing & Text Entry', detail: 'Can you enter text accurately and at a reasonable pace without it becoming the bottleneck?' },
      { name: 'File & Application Management', detail: 'Can you save something somewhere on purpose, and find it again later — not just create it and lose track of it?' },
      { name: 'Internet Navigation', detail: 'Can you move around the web efficiently — search, open new tabs, go back, distinguish a real site from a broken one?' },
      { name: 'Online Research & Information Use', detail: 'When you search for something, can you judge which result is actually trustworthy, not just which one loaded first?' },
      { name: 'Digital Safety & Responsibility', detail: 'Do you protect information the way it actually needs protecting — the real source, not just a copied fragment?' },
      { name: 'Basic Troubleshooting & Resilience', detail: 'When something breaks, do you have a real way to diagnose it, or do you freeze / restart everything and hope?' },
    ],
    caseStudy: {
      scenario: 'A student needs to research a health question online and save what they find so they can share it with a family member.',
      question: 'You want to research a question online and save what you find to share with your family. Walk me through exactly how you’d do that, step by step.',
      attempts: [
        {
          label: 'First attempt',
          answer: 'I’d just Google it and send the link.',
          critique: 'Rubric (Digital Fluency)\nOnline Research & Information Use: 0 — Evidence: "I’d just Google it" — Improve: Name how you’d judge if a search result is trustworthy, not just that you’d search.\nDigital Safety & Responsibility: 1 — Evidence: "send the link" — Improve: A link can break or change later — say how you’d protect the actual information for your family.\nWeakest area: Online Research & Information Use\nNext question: When you search and see five different results with five different answers, how do you decide which one to trust?',
        },
        {
          label: 'Second attempt',
          answer: 'I’d search using specific medical terms, and check if the result is from a hospital or health organization website rather than a random blog. Then I’d copy the useful part into a note.',
          whyBetter: 'This time the student names a real way to judge trustworthiness — checking the source type — instead of just describing the act of searching. That’s the actual skill being measured, not the searching itself.',
          critique: 'Rubric (Digital Fluency)\nOnline Research & Information Use: 2 — Evidence: "check if the result is from a hospital or health organization website" — Improve: Name one specific feature you’d check for, like a .gov or .org domain.\nDigital Safety & Responsibility: 1 — Evidence: "copy the useful part into a note" — Improve: A plain note can be lost or edited by mistake — how would you keep the original safe too?\nWeakest area: Digital Safety & Responsibility\nNext question: If your family member later asks "where did this come from?", what would you have actually saved to answer that?',
        },
        {
          label: 'Third attempt',
          answer: 'I’d search with specific terms, prioritize .gov, .org, or hospital websites over blogs, and check the publish date since medical advice changes. Then I’d save the actual page as a PDF — not just a note — so the source and date are preserved, and name the file clearly, like "diabetes-diet-mayo-2026.pdf", so it’s easy to find and cite later.',
          whyBetter: 'Now the response protects the actual source, not just a copied fragment — meaning the family member can verify where the information came from. That’s the real point of digital safety and responsibility, not just finding an answer fast.',
          critique: 'Rubric (Digital Fluency)\nOnline Research & Information Use: 3 — Evidence: prioritizes .gov/.org/hospital sites, checks publish date — Improve: Nothing major.\nDigital Safety & Responsibility: 3 — Evidence: saves the actual source as a dated, clearly named PDF — Improve: Nothing major.\nWeakest area: none — every dimension checked here is Advanced.',
        },
      ],
    },
  },

  'critical-thinking': {
    id: 'critical-thinking',
    title: 'Critical Thinking',
    hook: 'Evaluating claims, weighing evidence, and building a sound argument instead of taking things at face value.',
    Icon: Brain,
    whyAI: 'AI answers confidently whether it’s right or wrong — it has no built-in doubt. Critical thinking is the only thing standing between you and believing something false just because it was said smoothly and fast.',
    criteria: [
      { name: 'Logical Reasoning', detail: 'Are you testing a claim against something you actually know, or just accepting or rejecting it on instinct?' },
      { name: 'Reflection', detail: 'Can you notice and name why your own thinking went a certain way — not just correct the answer, but explain the reasoning error itself?' },
    ],
    caseStudy: {
      scenario: 'An AI chatbot confidently claims a viral "miracle" solar panel technology doubles output for free.',
      question: 'The AI told you this new solar panel technology doubles output for free. Before you believe it and tell your family to invest, what’s your reasoning?',
      attempts: [
        {
          label: 'First attempt',
          answer: 'The AI said it, so it’s probably true.',
          critique: 'Rubric (Critical Thinking)\nLogical Reasoning: 0 — Evidence: "the AI said it, so it’s probably true" — Improve: An AI restating a claim isn’t evidence the claim is true — name what WOULD count as evidence.\nReflection: 0 — Evidence: no check on your own reasoning — Improve: Ask yourself what would make this claim suspicious.\nWeakest area: Logical Reasoning\nNext question: If doubling solar output for free were real, why hasn’t every solar company already switched to it?',
        },
        {
          label: 'Second attempt',
          answer: 'That’s a good point — if it were real, big solar companies would already be using it since it would make them a lot of money. So I’d be suspicious. I’d want to see it from a real engineering source, not just a viral post.',
          whyBetter: 'Instead of just repeating or rejecting the claim, the student is now testing it against something they already know — that companies chase profit. That’s actual reasoning, not just trust or distrust.',
          critique: 'Rubric (Critical Thinking)\nLogical Reasoning: 2 — Evidence: "if it were real, big solar companies would already be using it" — Improve: Name one specific source type you’d check next, like a manufacturer spec sheet or peer-reviewed study.\nReflection: 2 — Evidence: revised initial trust once prompted — Improve: Notice why you believed it at first — was it because it sounded exciting?\nWeakest area: Reflection\nNext question: What made you willing to believe it in the first place, before you thought it through?',
        },
        {
          label: 'Third attempt',
          answer: 'I believed it at first because it sounded exciting and the post had a lot of shares, which felt like proof — but shares aren’t evidence, just popularity. Next time I see a claim like this, I’ll check it against a manufacturer’s real spec sheet or an independent review before I pass it on, especially before recommending my family spend money on it.',
          whyBetter: 'Now the student names exactly why their own thinking went wrong the first time — mistaking popularity for proof — and turns it into a specific rule for next time. That’s real reflection, not just a one-off correction.',
          critique: 'Rubric (Critical Thinking)\nLogical Reasoning: 3 — Evidence: identifies "shares aren’t evidence, just popularity," names real verification sources — Improve: Nothing major.\nReflection: 3 — Evidence: names the specific reasoning error and converts it into a rule for next time — Improve: Nothing major.\nWeakest area: none.',
        },
      ],
    },
  },

  'problem-solving': {
    id: 'problem-solving',
    title: 'Problem-Solving',
    hook: 'Designing, testing, and refining a solution to a real, messy problem — not just the textbook version.',
    Icon: Puzzle,
    whyAI: 'AI can generate ten solutions to a problem in a second — but it can’t tell you which real problem is actually worth solving, or whether its first idea actually worked when you tried it. That part is still entirely you.',
    criteria: [
      { name: 'Problem Definition', detail: 'Have you narrowed a vague complaint down to the specific, actual condition that triggers it?' },
      { name: 'Iteration', detail: 'Are you testing something small and measurable before committing to an expensive fix?' },
    ],
    caseStudy: {
      scenario: 'A small shop’s mobile money app keeps crashing during busy hours, losing sales.',
      question: 'Your shop’s payment app keeps crashing when it’s busy. What’s the actual problem you’re solving?',
      attempts: [
        {
          label: 'First attempt',
          answer: 'The app is broken, I need a new app.',
          critique: 'Rubric (Problem-Solving)\nProblem Definition: 0 — Evidence: "the app is broken" — Improve: "Broken" isn’t specific — what exactly happens, and only when?\nIteration: 0 — Evidence: jumps straight to a full replacement — Improve: Have you tried anything smaller first?\nWeakest area: Problem Definition\nNext question: Does it crash on every sale, or only during busy hours — and what’s different about busy hours?',
        },
        {
          label: 'Second attempt',
          answer: 'It only crashes when a lot of customers are paying at once, so maybe it’s about how many people are using it at the same time, not the app itself being bad.',
          whyBetter: 'The student stopped treating "broken" as one big vague problem and isolated the actual condition that triggers it — load, not the app in general. That’s the real skill: narrowing a problem to something you can actually act on.',
          critique: 'Rubric (Problem-Solving)\nProblem Definition: 2 — Evidence: "only crashes when a lot of customers are paying at once" — Improve: Name what you’d measure to confirm it, like transactions per minute before it fails.\nIteration: 1 — Evidence: no test attempted yet — Improve: What’s the smallest, cheapest thing you could try before buying a new app?\nWeakest area: Iteration\nNext question: What’s one small change — not a whole new app — you could test tomorrow during a busy hour?',
        },
        {
          label: 'Third attempt',
          answer: 'I’d test switching to WiFi instead of mobile data during busy hours tomorrow, since crashes might be about connection speed under load, not the app itself. I’d track how many transactions go through before it crashes with each connection type, and only consider replacing the app if that doesn’t fix it.',
          whyBetter: 'Now there’s an actual testable plan with a way to measure success, instead of guessing — and it saves the shop from an expensive new-app purchase if the cheaper fix turns out to be the real cause.',
          critique: 'Rubric (Problem-Solving)\nProblem Definition: 3 — Evidence: narrows the trigger to connection speed under load — Improve: Nothing major.\nIteration: 3 — Evidence: proposes a small, measurable test before a costly replacement — Improve: Nothing major.\nWeakest area: none.',
        },
      ],
    },
  },

  creativity: {
    id: 'creativity',
    title: 'Creativity',
    hook: 'Generating original ideas and inventive solutions, not just the first answer that comes to mind.',
    Icon: Lightbulb,
    whyAI: 'The fastest thing an AI can give you is the most obvious answer — the one everyone else prompting it is also getting. Creativity is what makes your use of AI produce something original instead of something generic that a thousand other people already have.',
    criteria: [
      { name: 'Originality', detail: 'Is this the first, most obvious idea, or did you push past it to something less expected?' },
      { name: 'Risk & Exploration', detail: 'Did you generate more than one genuinely different direction before settling on an answer?' },
    ],
    caseStudy: {
      scenario: 'A student wants to design a poster to get more people to visit a community health clinic.',
      question: 'Design a poster idea to get more people into the clinic. What’s your idea?',
      attempts: [
        {
          label: 'First attempt',
          answer: 'A poster that says "Visit the clinic" with a picture of a doctor.',
          critique: 'Rubric (Creativity)\nOriginality: 0 — Evidence: generic doctor image, generic instruction — Improve: This is the first idea most people would think of — what’s a less obvious angle?\nRisk & Exploration: 0 — Evidence: only one idea offered — Improve: Try generating two or three very different directions before picking one.\nWeakest area: Originality\nNext question: Instead of telling people to visit, what if the poster showed something people are afraid of missing, or someone they know?',
        },
        {
          label: 'Second attempt',
          answer: 'What if the poster showed a real patient from the community saying how the clinic helped them, instead of a generic doctor photo?',
          whyBetter: 'Moving from a generic instruction to a specific, relatable story is a genuinely more original idea — it’s something a stock photo poster couldn’t do, and it came from thinking past the first, most obvious option.',
          critique: 'Rubric (Creativity)\nOriginality: 2 — Evidence: real patient testimonial instead of stock doctor image — Improve: Push one step further — what’s an even less expected way to tell this story?\nRisk & Exploration: 2 — Evidence: explored a second, different direction — Improve: Try one more idea that takes a bigger risk, even if it might not work.\nWeakest area: Risk & Exploration\nNext question: What’s a version of this poster that feels a little risky or unusual to you — the kind of idea you’d hesitate to suggest out loud?',
        },
        {
          label: 'Third attempt',
          answer: 'What if instead of a poster, we made it a "before and after" comic strip — three panels showing someone avoiding the clinic, getting worse, then visiting and recovering — posted where people already wait in line for something else, like the market or the bus stop?',
          whyBetter: 'This isn’t just a better version of a poster — it’s a different format entirely, placed somewhere people already are, which is a genuinely riskier and more original idea than anything in the first two attempts.',
          critique: 'Rubric (Creativity)\nOriginality: 3 — Evidence: reimagines the format entirely, comic strip instead of poster — Improve: Nothing major.\nRisk & Exploration: 3 — Evidence: proposes an unconventional placement and format, outside the safe default — Improve: Nothing major.\nWeakest area: none.',
        },
      ],
    },
  },

  communication: {
    id: 'communication',
    title: 'Communication',
    hook: 'Explaining ideas clearly and persuasively so they land with a real audience.',
    Icon: MessageSquare,
    whyAI: 'An AI can draft a message for you in seconds, but it doesn’t actually know your audience the way you do. Communication is what turns an AI draft into something that lands with the specific person it’s for.',
    frameworkNote: 'The structure underneath this category is the same one classical rhetoric has taught for over 2,000 years: know your audience, make your point clearly, listen to the response.',
    criteria: [
      { name: 'Clarity', detail: 'Are you naming something specific and concrete, or staying general enough that it could mean anything?' },
      { name: 'Listening & Response', detail: 'Are you responding to what the other person actually cares about, or just repeating your own point?' },
    ],
    caseStudy: {
      scenario: 'A student needs to explain to a parent why they should be allowed to use AI tools for schoolwork.',
      question: 'Explain to your parent why you should be allowed to use AI for your schoolwork.',
      attempts: [
        {
          label: 'First attempt',
          answer: 'It’s helpful, everyone uses it.',
          critique: 'Rubric (Communication)\nClarity: 0 — Evidence: "it’s helpful" — Improve: Helpful how, specifically? Name one real thing it helps with.\nListening & Response: 0 — Evidence: doesn’t address any likely parental concern — Improve: What is your parent actually worried about?\nWeakest area: Listening & Response\nNext question: What do you think your parent is actually afraid will happen if you use AI for homework?',
        },
        {
          label: 'Second attempt',
          answer: 'I think they’re worried I’ll just copy answers instead of learning. I’d explain that I use it to check my understanding after I try the problem myself, not instead of trying.',
          whyBetter: 'The response now directly answers the parent’s real, unspoken worry instead of just restating "it’s helpful" — that’s the actual skill: listening for what the other person cares about, not just delivering your own point.',
          critique: 'Rubric (Communication)\nClarity: 2 — Evidence: names a specific use, "check my understanding after I try myself" — Improve: Give one concrete example of a time this worked.\nListening & Response: 2 — Evidence: directly addresses the "just copying" worry — Improve: Ask your parent what would actually reassure them, instead of guessing.\nWeakest area: Clarity\nNext question: Can you describe one real homework problem where this actually happened, start to finish?',
        },
        {
          label: 'Third attempt',
          answer: 'Last week I tried my math homework first, got stuck on one step, and used AI to explain just that step — not the whole answer. I still had to do the rest myself. I know you’re worried I’ll stop learning, so how about I show you my work before and after I use it for a week, so you can see it’s not replacing my thinking?',
          whyBetter: 'This version gives a real, specific example instead of a general claim, names the parent’s worry out loud, and offers a concrete way for the parent to verify it themselves — which is what actually earns trust in a real conversation, not just a better-worded argument.',
          critique: 'Rubric (Communication)\nClarity: 3 — Evidence: specific example, "got stuck on one step... used AI to explain just that step" — Improve: Nothing major.\nListening & Response: 3 — Evidence: names the worry directly and offers a concrete way to verify it — Improve: Nothing major.\nWeakest area: none.',
        },
      ],
    },
  },
};

/* ─────────────────────────── step builder ────────────────────────── */

function buildSteps(c: CategoryGuideContent): Step[] {
  const sessionHref = `/learning/skills?create=1&category=${c.id}`;

  return [
    {
      id: 'intro',
      kind: 'read',
      title: `What "${c.title}" actually means`,
      body: [
        c.hook,
        'This isn’t a video to watch or a page to read — it’s a live, one-on-one conversation with an AI coach that asks you a question, scores your answer against a real rubric, and pushes you to improve before moving on. This Guide shows you exactly what that looks like first.',
      ],
    },
    {
      id: 'why-ai',
      kind: 'read',
      title: 'Why this matters, especially with AI',
      body: [c.whyAI],
      aside: c.frameworkNote,
    },
    {
      id: 'rubric',
      kind: 'read',
      title: 'The exact things it’s checking for',
      body: [
        `Every response gets scored 0–3 on each of these ${c.criteria.length} dimensions — 0 is no evidence, 1 is emerging, 2 is proficient, 3 is advanced. Here’s the part that catches people off guard: your overall score for this skill isn’t an average of these — it’s the lowest one. Ace every dimension but one, and that one weak spot is your whole score.${c.criteria.length > 4 ? ' Digital Fluency has more moving parts than the other four skills, which also means more chances for one weak spot to cap the rest.' : ''}`,
      ],
      criteriaList: c.criteria,
    },
    {
      id: 'case',
      kind: 'read',
      title: 'A case in action',
      body: [c.caseStudy.scenario, 'Watch the same question answered three times, each one better than the last — and read why each improvement actually counts as an improvement, not just a longer answer.'],
      caseStudy: c.caseStudy,
    },
    {
      id: 'do-start',
      kind: 'do',
      title: 'Design a session like this yourself',
      body: [
        'Activities in this category are written locally for your own region, so there isn’t one fixed activity to send you to — instead, open "design your own" below and describe a scenario like the one you just read, or a real one from your own life. Answer honestly, in your own words, and read the rubric critique after each response the same way it’s shown above.',
        'Keep refining a dimension until it hits at least 2 (Proficient) before moving to the next — remember, the weakest one decides your whole score, so don’t skip past a shaky one just because another one scored well.',
      ],
      doLabel: 'Design your session',
      doHref: sessionHref,
    },
    {
      id: 'scoring',
      kind: 'read',
      title: 'How it decides you’re done',
      body: [
        'Unlike some other tracks on this site, there’s no separate second exam here — this one rubric is doing the whole job, live, updating after every message you send in the chat. You’ll see your scores shift in real time as you go, not just at the end.',
        'Once every dimension is at least Proficient, the session asks for a short written reflection before it gives any final score — what you learned, what was hardest, what you’d do differently. That step matters; don’t rush through it.',
        'Two buttons close things out: "Evaluate Me / Save Session" quietly re-checks your whole conversation against the rubric without ending anything, and "Complete Session" always finishes and saves your result, whatever it is. Your overall level — Emerging, Proficient, or Advanced — comes straight from that lowest dimension score, so a real Advanced here means every single dimension actually earned it.',
      ],
    },
    {
      id: 'do-finish',
      kind: 'do',
      title: 'Finish and see your score',
      body: [
        'Back in your session: once every dimension reads Proficient or better and you’ve answered the reflection honestly, click "Evaluate Me / Save Session" to check your level, or "Complete Session" to close things out.',
      ],
      doLabel: 'Back to your session',
      doHref: sessionHref,
    },
    {
      id: 'gate',
      kind: 'gate',
      title: 'Prove it',
      body: [
        'You’ve seen three attempts get gradually better, know the exact rubric, and know how the score is actually calculated. Tell us how your own session went.',
      ],
      gate: {
        label: 'What scenario did you try, and what level did you reach?',
        placeholder: 'e.g. Explaining a budget decision to a family member — Proficient',
        validate: v => {
          const s = v.trim();
          if (s.length < 10) return 'Give a little more detail — the scenario and the level you reached.';
          if (!/\s/.test(s)) return 'That looks like one word — add the level you reached.';
          return null;
        },
      },
    },
  ];
}

/* ──────────────────────────── main page ──────────────────────────── */

const SkillDevelopmentCategoryGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const content = categoryId ? CATEGORY_GUIDES[categoryId] : undefined;
  const steps = useMemo(() => (content ? buildSteps(content) : []), [content]);
  const track = content ? `skill-development-guide-${content.id}` : '';

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lsKey = `tutorial:${track}`;

  useEffect(() => {
    if (!track) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const p = JSON.parse(raw);
        setDone(new Set<string>(p.completed ?? []));
        setArtifacts(p.artifacts ?? {});
      }
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey, track]);

  useEffect(() => {
    if (!userId || !track) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tutorial_progress')
        .select('completed_steps, artifacts')
        .eq('user_id', userId)
        .eq('track', track)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
      setArtifacts(prev => ({ ...(data.artifacts ?? {}), ...prev }));
    })();
    return () => { cancelled = true; };
  }, [userId, track]);

  const persist = useCallback((nextDone: Set<string>, nextArtifacts: Record<string, string>) => {
    if (!track) return;
    try {
      localStorage.setItem(lsKey, JSON.stringify({
        completed: [...nextDone], artifacts: nextArtifacts, updated: Date.now(),
      }));
    } catch { /* private browsing, quota — progress still works in memory */ }
    if (!userId) return;
    setSyncing(true);
    supabase
      .from('tutorial_progress')
      .upsert({
        user_id: userId,
        track,
        completed_steps: [...nextDone],
        artifacts: nextArtifacts,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, track, userId]);

  const firstIncompleteIndex = useMemo(() => {
    const idx = steps.findIndex(s => !done.has(s.id));
    return idx === -1 ? steps.length : idx;
  }, [steps, done]);

  const isUnlocked = (index: number) => index <= firstIncompleteIndex;

  const complete = (step: Step, value?: string) => {
    const nextDone = new Set(done); nextDone.add(step.id);
    const nextArt = value !== undefined ? { ...artifacts, [step.id]: value } : artifacts;
    setDone(nextDone); setArtifacts(nextArt); persist(nextDone, nextArt);
    setExpanded(prev => { const n = new Set(prev); n.delete(step.id); return n; });
  };

  const uncomplete = (step: Step) => {
    const nextDone = new Set(done); nextDone.delete(step.id);
    setDone(nextDone); persist(nextDone, artifacts);
  };

  const submitGate = (step: Step) => {
    const v = (gateDraft[step.id] ?? '').trim();
    const err = step.gate!.validate(v);
    if (err) { setGateError(p => ({ ...p, [step.id]: err })); return; }
    setGateError(p => ({ ...p, [step.id]: '' }));
    complete(step, v);
  };

  const totalSteps = steps.length;
  const doneCount = steps.filter(s => done.has(s.id)).length;
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;
  const allDone = totalSteps > 0 && doneCount === totalSteps;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read: { badge: 'bg-slate-100 text-slate-600', label: 'Read', ring: 'border-gray-200' },
    do:   { badge: 'bg-teal-100 text-teal-800', label: 'Do', ring: 'border-teal-200' },
    gate: { badge: 'bg-cyan-100 text-cyan-800', label: 'Prove it', ring: 'border-cyan-300' },
  };

  if (!categoryId || !content) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 pb-24 pt-6 text-center">
          <p className="text-lg font-bold text-gray-900">We don’t have a Guide for that category.</p>
          <button onClick={() => navigate('/tutorials')} className="mt-4 text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </AppLayout>
    );
  }

  if (!loaded) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">

        {/* header */}
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
              <content.Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-teal-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">{content.title}</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                Three attempts at the same scenario, each better than the last, why each improvement actually counts, and exactly how your score gets calculated.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {totalSteps} steps</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {!userId && (
              <p className="mt-2 text-xs text-slate-400">
                Your progress is saved on this device. Sign in to keep it across devices.
              </p>
            )}
          </div>
        </div>

        {/* steps */}
        {steps.map((step, i) => {
          const unlocked = isUnlocked(i);
          const isDone = done.has(step.id);
          const isOpen = unlocked && (!isDone || expanded.has(step.id));
          const st = KIND_STYLE[step.kind];

          return (
            <div
              key={step.id}
              className={`mb-3 overflow-hidden rounded-xl border bg-white transition-all ${isDone ? 'border-green-200' : st.ring} ${!unlocked ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => {
                  if (!unlocked) return;
                  setExpanded(prev => {
                    const n = new Set(prev);
                    if (n.has(step.id)) n.delete(step.id); else n.add(step.id);
                    return n;
                  });
                }}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isDone ? 'bg-green-600 text-white' : unlocked ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>
                  {isDone ? <Check className="h-4 w-4" /> : unlocked ? i + 1 : <Lock className="h-3 w-3" />}
                </div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${st.badge}`}>{st.label}</span>
                <span className={`flex-1 text-sm font-semibold ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.title}</span>
                {unlocked && (isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />)}
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-4 sm:px-6">
                  {step.body.map((p, k) => (
                    <p key={k} className="mb-3 text-[15px] leading-relaxed text-gray-700">{p}</p>
                  ))}

                  {step.criteriaList && (
                    <dl className="mb-3 space-y-2">
                      {step.criteriaList.map(cr => (
                        <div key={cr.name} className="rounded-lg border border-gray-200 p-3">
                          <dt className="text-sm font-bold text-gray-900">{cr.name}</dt>
                          <dd className="mt-1 text-sm text-gray-600">{cr.detail}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {step.caseStudy && (
                    <div className="mb-3 overflow-hidden rounded-xl border border-gray-200">
                      <div className="border-b border-gray-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        AI asks: “{step.caseStudy.question}”
                      </div>
                      <div className="space-y-3 p-4">
                        {step.caseStudy.attempts.map((a, idx) => {
                          const tone = idx === 0 ? 'red' : idx === step.caseStudy!.attempts.length - 1 ? 'green' : 'amber';
                          const toneClasses = tone === 'red'
                            ? 'border-red-200 bg-red-50 text-red-700 [&_pre]:text-red-900'
                            : tone === 'amber'
                            ? 'border-amber-200 bg-amber-50 text-amber-700 [&_pre]:text-amber-900'
                            : 'border-green-200 bg-green-50 text-green-700 [&_pre]:text-green-900';
                          return (
                            <div key={a.label}>
                              {a.whyBetter && (
                                <div className="mb-2 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                                  <span className="font-bold text-cyan-800">Why this is better: </span>{a.whyBetter}
                                </div>
                              )}
                              <div className={`rounded-lg border p-3 ${toneClasses}`}>
                                <p className="mb-1 text-xs font-bold uppercase tracking-wide">{a.label}</p>
                                <p className="mb-2 text-sm italic text-gray-800">“{a.answer}”</p>
                                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">{a.critique}</pre>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {step.aside && (
                    <div className="mb-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                      {step.aside}
                    </div>
                  )}

                  {step.kind === 'do' && step.doHref && (
                    <button
                      onClick={() => window.open(step.doHref!, '_blank', 'noopener')}
                      className="mb-3 flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-800 hover:bg-teal-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {step.doLabel ?? 'Open Skill Development'}
                    </button>
                  )}

                  {step.gate ? (
                    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                      <label className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-900">
                        <Link2 className="h-4 w-4" />{step.gate.label}
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={gateDraft[step.id] ?? artifacts[step.id] ?? ''}
                          onChange={e => setGateDraft(p => ({ ...p, [step.id]: e.target.value }))}
                          placeholder={step.gate.placeholder}
                          className="flex-1 rounded-lg border border-cyan-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                        />
                        <button
                          onClick={() => submitGate(step)}
                          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700"
                        >
                          {isDone ? 'Update' : 'Submit'}
                        </button>
                      </div>
                      {gateError[step.id] && <p className="mt-2 text-sm font-semibold text-red-600">{gateError[step.id]}</p>}
                      {isDone && artifacts[step.id] && (
                        <p className="mt-2 break-all text-xs text-cyan-800">Saved: {artifacts[step.id]}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {!isDone ? (
                        <button
                          onClick={() => complete(step)}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
                        >
                          Mark done
                        </button>
                      ) : (
                        <button
                          onClick={() => uncomplete(step)}
                          className="text-sm font-semibold text-gray-400 hover:text-gray-600"
                        >
                          Not done yet
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {allDone && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="font-bold text-green-900">Guide complete.</p>
            <p className="mt-1 text-sm text-green-800">
              You’ve seen gradual improvement broken down step by step, know the exact rubric, and know how the score is actually calculated. Every other activity in this category works exactly the same way.
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <button onClick={() => navigate('/tutorials')} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default SkillDevelopmentCategoryGuidePage;
