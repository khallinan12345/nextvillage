// src/pages/tutorials/AILearningCategoryGuidePage.tsx
//
// One Guide per AI Learning category — Understanding AI, Prompt Engineering,
// AI Ethics & Responsible Use, Evaluating AI Outputs, and AI Applications.
// The taxonomy is flat (confirmed against AILearningPage.tsx's
// aiLearningCategories array and the learning_modules/dashboard schema —
// there is no real sub-category tier underneath the 5), so this is one
// dynamic route (/tutorials/ai-learning/:categoryId) driven by the
// CATEGORY_GUIDES config below, rather than 5 near-duplicate files.
//
// Unlike AILearningStartPage (the existing "Start Here" guide, which is
// purely a locked map of deep links — it never shows what a session looks
// like or explains how it's graded), this Guide goes deep on ONE category:
// a worked "case in action" showing a weak answer next to a strong one with
// the AI's actual Rubric Critique Block format applied to both, the real
// rubric criteria named and explained, the entrepreneurial/PUE lens that's
// woven into every question (so it doesn't blindside a learner expecting a
// pure AI-literacy lesson), and exactly how the two grading layers work —
// the in-chat 0–3 rubric that gates progression within a session, and the
// UNESCO Comprehensive Assessment (4 competencies, 1–4 each) that runs when
// a student clicks "Evaluate Me / Save Session" or "Complete Session".
//
// All of that content is transcribed from the real system prompts
// (AI_SESSION_BUILDER_PROMPT and buildUNESCOAssessmentInstructions in
// AILearningPage.tsx) — nothing here is invented or approximate, since a
// Guide that misdescribes its own grading would actively mislead a student.
//
// No AI Playground swivel: AILearningStartPage's own header comment
// confirms this feature doesn't use the Playground — the real learning and
// evaluation happens on /learning/ai itself, so "do" steps deep-link there
// instead (?activity=<title>&subCategory=<label>, the same contract
// AILearningStartPage already uses).
//
// Progress: localStorage first, mirrored to `tutorial_progress` in Supabase
// when signed in — same as every other Guide. Track id is per-category
// (`ai-learning-guide-<categoryId>`) since these are 5 independent Guides
// sharing one component, not one Guide with 5 episodes.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink,
  Brain, Edit, Eye, Shield, BookOpen,
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

interface CaseStudy {
  scenario: string;
  question: string;
  weakAnswer: string;
  weakCritique: string;
  strongAnswer: string;
  strongCritique: string;
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
  /** Matches aiLearningCategories[].subCategory exactly — the query param value the deep link needs. */
  subCategory: string;
  hook: string;
  rubricLetter: string;
  Icon: React.ComponentType<{ className?: string }>;
  criteria: CriterionDef[];
  caseStudy: CaseStudy;
  /** First of AILearningStartPage's 5 curated titles for this category — guaranteed unlocked from the start. */
  firstActivityTitle: string;
}

/* ───────────────────────────── content ───────────────────────────── */

const CATEGORY_GUIDES: Record<string, CategoryGuideContent> = {
  'understanding-ai': {
    id: 'understanding-ai',
    title: 'Understanding AI',
    subCategory: 'Understanding AI: Core Concepts & Capabilities',
    hook: 'What AI actually is, and isn’t — how it "thinks", what it gets wrong, and where it’s genuinely useful.',
    rubricLetter: 'A',
    Icon: Brain,
    criteria: [
      { name: 'AI Mechanism Understanding', detail: 'Can you explain, roughly, how the AI got from your question to its answer — the chain from data it was trained on, to patterns it learned, to the output it produced? Not the math, just the chain.' },
      { name: 'Contextual Performance', detail: 'For the specific thing you’re using AI for, where does it tend to do well, and where does it tend to struggle?' },
      { name: 'Limitations & Failure Modes', detail: 'Can you name a real way this AI could get it wrong here — bias in what it learned from, a confident-sounding wrong answer ("hallucination"), a gap in what it was trained on — and what that would actually cause if you trusted it blindly?' },
      { name: 'Terminology Accuracy', detail: 'Are you using words like "model," "training data," "hallucination," and "bias" correctly and naturally, not just dropping them in?' },
    ],
    caseStudy: {
      scenario: 'A student running a small fish stall wants to know if they can trust an AI chatbot to set tomorrow’s fish prices for them automatically.',
      question: 'You said you want the AI to set your fish prices automatically every morning. Before we get there — in your own words, how does an AI like this actually come up with an answer when you ask it something?',
      weakAnswer: 'It just knows because it’s smart.',
      weakCritique:
        'Rubric critique (Category: A)\nCriterion 1 (AI Mechanism Understanding): 0 — Evidence: "it just knows because it’s smart" — What to improve: Say what it’s actually doing — using patterns learned from data, not knowing the way a person knows.\nCriterion 4 (Terminology Accuracy): 0 — Evidence: no AI vocabulary used — What to improve: Try using a real term like "training data" or "pattern" in your answer.\nBiggest improvement lever: Replace "it’s smart" with a real description of the data → pattern → output chain.\nNext question (one only): If the AI has never seen today’s catch, today’s weather, or today’s actual buyer demand at your stall — what is it actually basing a price suggestion on?',
      strongAnswer: 'It’s trained on a huge pile of text and numbers from before — like old price lists and conversations — and it learned patterns in that data. So when I ask for a price, it’s predicting what a "normal" answer looks like based on those patterns, not looking at my stall right now. That’s actually risky for setting today’s price automatically, because it doesn’t know if today’s catch was small or a competitor undercut me this morning — it would just be guessing based on old patterns and calling it confident.',
      strongCritique:
        'Rubric critique (Category: A)\nCriterion 1 (AI Mechanism Understanding): 3 — Evidence: "trained on...old price lists...predicting what a normal answer looks like based on those patterns" — What to improve: Nothing major, this is a clear, accurate chain.\nCriterion 4 (Terminology Accuracy): 2 — Evidence: used "trained," "patterns," "predicting" correctly — What to improve: Try naming "hallucination" specifically next time you flag a risk.\nBiggest improvement lever: You’ve got the mechanism — now connect it to a concrete cost: what happens to your income the week the AI’s "confident" price is wrong?\nNext question (one only): If the AI’s suggested price is 20% too high on a slow sales day, what does that cost you by the end of the week?',
    },
    firstActivityTitle: 'Human or AI?',
  },

  'prompt-engineering': {
    id: 'prompt-engineering',
    title: 'Prompt Engineering',
    subCategory: 'Prompt Engineering: Effective AI Communication',
    hook: 'How to ask AI for what you actually want — clear instructions get better answers, every time.',
    rubricLetter: 'B',
    Icon: Edit,
    criteria: [
      { name: 'Goal & Constraints', detail: 'Did you tell the AI exactly what you want, who it’s for, and any real constraints — length, tone, format?' },
      { name: 'Iteration Strategy', detail: 'When your first prompt didn’t get what you needed, did you change it on purpose, and can you say why?' },
      { name: 'Output Sensitivity', detail: 'Can you point to exactly what changed in the output because of what you changed in the prompt?' },
    ],
    caseStudy: {
      scenario: 'A shop owner wants a WhatsApp broadcast message advertising this week’s prices.',
      question: 'Write me a prompt asking AI to create a WhatsApp message advertising your shop’s prices.',
      weakAnswer: 'make a price list message',
      weakCritique:
        'Rubric critique (Category: B)\nCriterion 1 (Goal & Constraints): 1 — Evidence: "make a price list message" — What to improve: Add who it’s for, which items and prices, tone, and a length limit.\nBiggest improvement lever: A prompt this short forces the AI to guess every constraint you actually care about.\nNext question (one only): If a customer only reads the first line of a WhatsApp message before deciding to keep scrolling, what does your prompt need to tell the AI to put there?',
      strongAnswer: 'Write a short WhatsApp broadcast message (under 300 characters) advertising this week’s prices at my provisions shop: rice ₦1,200/cup, garri ₦300/cup, cooking oil ₦2,500/bottle. Friendly, local tone, lead with the best deal first, end with "Message to order."',
      strongCritique:
        'Rubric critique (Category: B)\nCriterion 1 (Goal & Constraints): 3 — Evidence: specific items and prices, character limit, tone, ordering instruction — What to improve: Nothing major.\nCriterion 2 (Iteration Strategy): 2 — Evidence: rewrote the vague version into a constrained one — What to improve: Say explicitly what was wrong with the first draft that made you rewrite it.\nBiggest improvement lever: Try running both prompts and comparing the two outputs side by side — that comparison is where the real lesson is.\nNext question (one only): Which of your three prices would actually get more customers through the door if it were the first line instead of the last — and why?',
    },
    firstActivityTitle: 'Prompt Design Showcase',
  },

  'ai-ethics': {
    id: 'ai-ethics',
    title: 'AI Ethics & Responsible Use',
    subCategory: 'AI Ethics & Responsible Use',
    hook: 'Where AI can go wrong — bias, fairness, and who’s responsible when it does.',
    rubricLetter: 'C',
    Icon: Shield,
    criteria: [
      { name: 'Risk & Bias Reasoning', detail: 'Who could be unfairly helped or harmed by this AI use, and why specifically — not "it could be biased," but who and how?' },
      { name: 'Privacy Judgment', detail: 'Is any sensitive personal data involved, and what would actually protect it?' },
      { name: 'Ethical Action', detail: 'Given the risk you named, what specific step would you take to reduce it — not just noticing the problem, but a real mitigation?' },
    ],
    caseStudy: {
      scenario: 'A community savings group wants to use AI to help score small loan applications.',
      question: 'You want AI to help score loan applications for your savings group. Who might that unfairly help or hurt?',
      weakAnswer: 'It should be fine because AI is objective.',
      weakCritique:
        'Rubric critique (Category: C)\nCriterion 1 (Risk & Bias Reasoning): 0 — Evidence: "AI is objective" — What to improve: AI trained on past approvals can repeat whoever was favored before — name a specific group that could lose out.\nBiggest improvement lever: "Objective" isn’t a real answer here — the AI learned from your group’s past decisions, biases included.\nNext question (one only): If your group’s past loan approvals happened to favor people who’d borrowed before, what happens to a first-time applicant with no history when the AI scores them?',
      strongAnswer: 'Actually, if it’s trained on our past approvals, it could favor people who already have a track record and unfairly score down first-time borrowers or people from smaller villages we don’t have much data on. That’s not fair — it would lock out exactly the people the group is supposed to help. Also, loan applications have sensitive info like income and family situation, so we shouldn’t feed that into a general AI tool without checking how it stores it.',
      strongCritique:
        'Rubric critique (Category: C)\nCriterion 1 (Risk & Bias Reasoning): 3 — Evidence: names first-time borrowers and under-represented villages as specifically at risk — What to improve: Nothing major.\nCriterion 2 (Privacy Judgment): 2 — Evidence: flagged income/family data as sensitive — What to improve: Name one concrete safeguard (e.g. anonymizing names before scoring) rather than just "checking how it stores it."\nBiggest improvement lever: You’ve named the risk — now name the one process change that would actually fix it before the next lending cycle.\nNext question (one only): If a first-time borrower gets wrongly scored down and doesn’t get a loan they deserved, what does that cost them, and what does it cost the group in trust?',
    },
    firstActivityTitle: 'Bias Busters',
  },

  'evaluating-outputs': {
    id: 'evaluating-outputs',
    title: 'Evaluating AI Outputs',
    subCategory: 'Evaluating AI Outputs: Critical Analysis',
    hook: 'AI sounds confident even when it’s wrong — how to check its work before you trust it.',
    rubricLetter: 'D',
    Icon: Eye,
    criteria: [
      { name: 'Verification Process', detail: 'How would you actually check if this AI answer is true, using something outside the AI itself?' },
      { name: 'Error & Bias Detection', detail: 'Can you point to a specific flaw, unsupported claim, or misleading part of an output — not just "it might be wrong"?' },
      { name: 'Reflective Judgment', detail: 'For this kind of question, when should you trust AI, and when should you not?' },
    ],
    caseStudy: {
      scenario: 'AI gives fertilizer dosage advice for a small farm.',
      question: 'The AI told you to apply 200kg/hectare of a specific fertilizer. How would you check if that’s actually right before you buy and apply it?',
      weakAnswer: 'I’d just trust it, AI usually gets facts right.',
      weakCritique:
        'Rubric critique (Category: D)\nCriterion 1 (Verification Process): 0 — Evidence: "I’d just trust it" — What to improve: Name a real outside source you’d check against — an agricultural extension officer, a soil test, a seed supplier’s label.\nBiggest improvement lever: Nothing in your answer describes actually checking anything — that’s the whole point of this criterion.\nNext question (one only): If that dosage is wrong and you apply it to your whole field, what does the mistake cost you in wasted fertilizer and lost yield?',
      strongAnswer: 'I wouldn’t apply that without checking — fertilizer dosage depends a lot on my specific soil, which the AI doesn’t know. I’d check the recommendation against my local agricultural extension office, and ideally get a soil test first, since applying the wrong amount could burn my crop or waste money on fertilizer I didn’t need. The AI’s number is a starting estimate, not a final answer.',
      strongCritique:
        'Rubric critique (Category: D)\nCriterion 1 (Verification Process): 3 — Evidence: extension office and soil test named as outside checks — What to improve: Nothing major.\nCriterion 3 (Reflective Judgment): 2 — Evidence: "a starting estimate, not a final answer" — What to improve: Say explicitly what kind of AI answer you WOULD trust without checking, to show you can draw the line both ways.\nBiggest improvement lever: You’ve drawn the line well for high-stakes advice — now weigh the actual cost of skipping verification here.\nNext question (one only): A soil test costs money and takes time — what’s the smallest, cheapest check you could do before your next planting season to catch a wrong dosage before it costs you the whole field?',
    },
    firstActivityTitle: 'AI Fact-Checker',
  },

  applications: {
    id: 'applications',
    title: 'AI Applications',
    subCategory: 'Applications',
    hook: 'Putting it together — using AI to build something that solves a real problem in your community.',
    rubricLetter: 'E',
    Icon: BookOpen,
    criteria: [
      { name: 'Problem Decomposition', detail: 'Have you broken the real problem into its actual parts, not just described it as one big thing?' },
      { name: 'AI Suitability', detail: 'Is AI actually the right tool for this part of the problem, or would something simpler work better?' },
      { name: 'Outcome Measurement', detail: 'How will you know, with a real number, whether this actually worked?' },
    ],
    caseStudy: {
      scenario: 'Building a simple AI tool to help a clinic remember to follow up with patients.',
      question: 'You want to build something that helps the clinic follow up with patients. What are the actual separate pieces of that problem?',
      weakAnswer: 'The clinic needs an AI to remember patients.',
      weakCritique:
        'Rubric critique (Category: E)\nCriterion 1 (Problem Decomposition): 0 — Evidence: "an AI to remember patients" — What to improve: Break it into real parts — who needs follow-up, when, by what channel, who’s responsible for sending it.\nBiggest improvement lever: One vague sentence isn’t a plan — a clinic worker can’t build anything from it.\nNext question (one only): Right now, without any AI, how does the clinic currently decide which patients need a follow-up call this week — and where does that break down?',
      strongAnswer: 'It’s really a few pieces: (1) knowing which patients are due for follow-up and when, (2) getting a reminder message drafted for each one, (3) someone actually sending it, and (4) tracking who responded. AI is genuinely useful for piece 2 — drafting personalized reminder messages fast — but pieces 1 and 4 might just need a simple spreadsheet, not AI. I’d measure success by the percentage of due patients who actually get contacted within a week, compared to what happens now.',
      strongCritique:
        'Rubric critique (Category: E)\nCriterion 1 (Problem Decomposition): 3 — Evidence: four distinct pieces named — What to improve: Nothing major.\nCriterion 2 (AI Suitability): 3 — Evidence: correctly separates where AI helps (drafting) from where it doesn’t (tracking) — What to improve: Nothing major.\nCriterion 3 (Outcome Measurement): 2 — Evidence: "percentage of due patients contacted within a week" — What to improve: Name the current baseline number so the improvement is measurable, not just directional.\nBiggest improvement lever: You’ve correctly scoped where AI helps — now put a real number on what "current" looks like so you can prove the tool worked.\nNext question (one only): If contacting one more patient per week costs the clinic worker’s time, what’s the smallest version of this you could build to prove it’s worth it before building the whole thing?',
    },
    firstActivityTitle: 'AI Platform for Community Impact',
  },
};

/* ─────────────────────────── step builder ────────────────────────── */

function buildSteps(c: CategoryGuideContent): Step[] {
  const activityHref = `/learning/ai?activity=${encodeURIComponent(c.firstActivityTitle)}&subCategory=${encodeURIComponent(c.subCategory)}`;

  return [
    {
      id: 'intro',
      kind: 'read',
      title: `What "${c.title}" actually means`,
      body: [
        c.hook,
        'This isn’t a video to watch or a page to read — mastering this category means having a live, one-on-one conversation with an AI coach that asks you a question, scores your answer against a real rubric, and doesn’t move on until you’ve actually met the bar. This Guide shows you exactly what that looks like before you’re in it.',
      ],
    },
    {
      id: 'rubric',
      kind: 'read',
      title: 'The exact things it’s checking for',
      body: [
        `Every response you give gets scored 0–3 against ${c.criteria.length} specific criteria — not a vibe, an actual checklist. 0 means no evidence, 1 means emerging, 2 means competent, 3 means advanced. You need at least a 2 on each one before the session moves you forward.`,
      ],
      criteriaList: c.criteria,
    },
    {
      id: 'pue',
      kind: 'read',
      title: 'The question behind every question',
      body: [
        'One thing that surprises people: every criterion above also expects you to connect your answer to real economic value — what something costs, what it saves, who benefits, whether it holds up over 2–5 years. If your answer is technically correct but ignores the money or time involved, expect a follow-up like "That’s a solid technical answer — now, what’s the business case for it?"',
        'That’s not a separate topic bolted on — it’s baked into the same rubric criteria above. Knowing it’s coming means you can build it into your first answer instead of getting caught off guard by the follow-up.',
      ],
    },
    {
      id: 'case',
      kind: 'read',
      title: 'A case in action',
      body: [c.caseStudy.scenario],
      caseStudy: c.caseStudy,
    },
    {
      id: 'do-start',
      kind: 'do',
      title: `Try "${c.firstActivityTitle}" yourself`,
      body: [
        'Open the real activity below — it’s the same one, on the same AI Learning page, that a signed-in student would use. Answer one guiding question at a time, honestly, in your own words. After each answer, read the Rubric Critique Block the same way it’s shown above: which criterion it’s scoring, what evidence it found in your answer, and what to improve.',
        'Keep refining your answers on a criterion until it hits at least 2 (Competent) before moving to the next one — that’s what actually unlocks the rest of the session, not just clicking through.',
      ],
      doLabel: 'Open this activity',
      doHref: activityHref,
    },
    {
      id: 'scoring',
      kind: 'read',
      title: 'How it actually decides you’re done',
      body: [
        'Once every criterion hits Competent, the session asks you to build one integrated artifact that pulls it all together, then — before it gives you any final score — it requires a short written reflection: what you learned, what was hardest, what you’d do differently. That step isn’t optional, and skipping it caps part of your final score even if everything else was strong.',
        'There are two separate scores at play. The in-chat 0–3 rubric you just practiced is what moves the conversation forward. A second, separate check — the UNESCO Comprehensive Assessment — runs when you click "Evaluate Me / Save Session" or "Complete Session," and grades your whole conversation 1–4 against four fixed competencies: understanding AI’s principles and limitations, keeping humans responsible for AI-assisted decisions, using AI tools with real purpose, and critically evaluating AI’s output and impact.',
        'Those four scores get averaged into one overall level: Emerging, Proficient, or Advanced. "Complete Session" always finishes and saves your score, whatever it is — "Evaluate Me / Save Session" checks your progress without necessarily ending things.',
      ],
    },
    {
      id: 'do-finish',
      kind: 'do',
      title: 'Answer the reflection, then get your score',
      body: [
        'Back in your session: once you’ve worked through the criteria and the AI asks its three reflection questions, answer them for real — they’re graded too. Then click "Evaluate Me / Save Session" to see your UNESCO-based level, or "Complete Session" if you’re ready to close things out.',
      ],
      doLabel: 'Back to your session',
      doHref: activityHref,
    },
    {
      id: 'gate',
      kind: 'gate',
      title: 'Prove it',
      body: [
        'You’ve seen a worked example, know the exact rubric, and know how the two scoring layers fit together. Tell us how it went.',
      ],
      gate: {
        label: 'Which activity did you complete, and what level did you reach?',
        placeholder: `e.g. "${c.firstActivityTitle}" — Proficient`,
        validate: v => {
          const s = v.trim();
          if (s.length < 10) return 'Give a little more detail — the activity name and the level you reached.';
          if (!/\s/.test(s)) return 'That looks like one word — add the level you reached.';
          return null;
        },
      },
    },
  ];
}

/* ──────────────────────────── main page ──────────────────────────── */

const AILearningCategoryGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const content = categoryId ? CATEGORY_GUIDES[categoryId] : undefined;
  const steps = useMemo(() => (content ? buildSteps(content) : []), [content]);
  const track = content ? `ai-learning-guide-${content.id}` : '';

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
    do:   { badge: 'bg-violet-100 text-violet-800', label: 'Do', ring: 'border-violet-200' },
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
              <content.Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-violet-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">{content.title}</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                A case in action, the exact rubric it’s grading you against, and how the two scoring layers actually work — before you start your first real session.
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
              <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
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
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-red-700">Weak answer</p>
                          <p className="mb-2 text-sm italic text-gray-800">“{step.caseStudy.weakAnswer}”</p>
                          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-red-900">{step.caseStudy.weakCritique}</pre>
                        </div>
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-green-700">Stronger answer</p>
                          <p className="mb-2 text-sm italic text-gray-800">“{step.caseStudy.strongAnswer}”</p>
                          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-green-900">{step.caseStudy.strongCritique}</pre>
                        </div>
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
                      className="mb-3 flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-800 hover:bg-violet-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {step.doLabel ?? 'Open AI Learning'}
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
              You know the rubric, you’ve seen it applied, and you know how the score is actually calculated. The rest of this category’s activities work exactly the same way.
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

export default AILearningCategoryGuidePage;
