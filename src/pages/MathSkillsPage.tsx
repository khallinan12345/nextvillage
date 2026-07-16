// src/pages/MathSkillsPage.tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import AppLayout from '../components/layout/AppLayout';
import {
  Mic, MicOff, MessageSquare, BookOpen, Calculator,
  Lock, ArrowLeft, Send, Volume2, VolumeX, CheckCircle,
  TrendingUp, ChevronRight, Sigma, Wand2, Save,
  BarChart3, X, Hash, Shapes, FunctionSquare,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { chatText, chatJSON } from '../lib/chatClient';
import { useVoice } from '../hooks/useVoice';
import { PidginTooltip } from '../components/PidginTooltip';
import { VoiceFallback } from '../components/VoiceFallback';
import { AIPidginCoachWrapper } from '../components/AIPidginCoachWrapper';

// ─── Types ──────────────────────────────────────────────────────────────────

type ProficiencyLevel = 'Emerging' | 'Developing' | 'Proficient' | 'Advanced';

interface PersonalityBaseline {
  communicationStrategy: {
    preferred_tone?: string;
    interaction_style?: string;
    detail_level?: string;
    recommendations?: string[];
  } | null;
  learningStrategy: {
    learning_style?: string;
    motivation_approach?: string;
    pacing_preference?: string;
    recommendations?: string[];
  } | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface SubCategoryEval {
  name: string;
  level: ProficiencyLevel;
  score: number;
  evidence: string;
}

interface SessionEvaluation {
  stage_id: number;
  stage_name: string;
  overall_level: ProficiencyLevel;
  can_advance: boolean;
  is_complete: boolean;
  sub_categories: SubCategoryEval[];
  encouragement: string;
}

interface DashboardSession {
  id: string;
  title: string | null;
  sub_category: string | null;
  category_activity: string | null;
  progress: string;
  chat_history: string | null;
  math_skills_evaluation: SessionEvaluation | null;
  created_at: string;
  updated_at: string;
}

interface UserProgress {
  unlockedUpTo: number;
  completedStages: boolean[];
  stageLevels: (ProficiencyLevel | null)[];
}

// ─── Distorted Background ───────────────────────────────────────────────────

const MathDistortedBackground: React.FC = () => {
  const [mousePixels, setMousePixels] = React.useState({ x: 0, y: 0 });
  const [isMouseMoving, setIsMouseMoving] = React.useState(false);
  const mouseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const sidebarOffset = 256;
      const topOffset = 64;
      setMousePixels({
        x: Math.max(0, e.clientX - sidebarOffset),
        y: Math.max(0, e.clientY - topOffset),
      });
      setIsMouseMoving(true);
      if (mouseTimeoutRef.current) clearTimeout(mouseTimeoutRef.current);
      mouseTimeoutRef.current = setTimeout(() => setIsMouseMoving(false), 120);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (mouseTimeoutRef.current) clearTimeout(mouseTimeoutRef.current);
    };
  }, []);

  const imageUrl = '/background_math-skillls_page.jpeg';

  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="math-ripple-distortion" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012"
              numOctaves="3"
              seed="9"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="55"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>

      {/* Static background layer */}
      <div
        className="fixed top-14 left-0 right-0 bottom-0"
        style={{
          backgroundImage: `url('${imageUrl}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: 0,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/30 via-slate-300/25 to-cyan-300/30" />
        <div className="absolute inset-0 bg-white/10" />
      </div>

      {isMouseMoving && (
        <div
          className="fixed top-14 left-0 right-0 bottom-0 pointer-events-none"
          style={{
            backgroundImage: `url('${imageUrl}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            zIndex: 1,
            filter: 'url(#math-ripple-distortion)',
            WebkitMaskImage: `radial-gradient(circle 150px at ${mousePixels.x}px ${mousePixels.y}px, black 0%, black 50%, transparent 100%)`,
            maskImage: `radial-gradient(circle 150px at ${mousePixels.x}px ${mousePixels.y}px, black 0%, black 50%, transparent 100%)`,
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/30 via-slate-300/25 to-cyan-300/30" />
        </div>
      )}
    </>
  );
};

// ─── Stage Definitions ───────────────────────────────────────────────────────
// 7 mastery stages: Counting → Operations → Fractions → Measurement/Geometry →
// Ratios/Proportions → Pre-Algebra → Algebra & Geometry

const STAGES = [
  {
    id: 0,
    name: 'Counting & Number Sense',
    subtitle: 'Numbers Are Everywhere',
    description:
      'Build a strong number foundation. Count, compare, order, and understand what numbers really mean — from 1 to 1,000 and beyond.',
    icon: Hash,
    gradient: 'from-yellow-500 to-amber-500',
    glowBg: 'bg-yellow-500/90',
    border: 'border-yellow-400/60',
    textColor: 'text-yellow-300',
    voiceIntro: `Welcome to Stage 1: Counting and Number Sense. Numbers are the language of the universe, and this is where your journey begins! In this stage, you will practise counting, comparing numbers, and understanding what numbers mean. Your AI math coach will use games, stories, and everyday examples to help numbers feel real and fun. Choose a topic you enjoy — like market stalls, animals, or family members — and your coach will bring numbers to life through it. When you are ready, type your topic and press Start New Session.`,
    systemPrompt: `You are a warm, patient math coach working with young learners on COUNTING AND NUMBER SENSE.
This covers: counting forwards and backwards, number recognition 0–1000, comparing (greater than, less than, equal), ordering numbers, skip counting (2s, 5s, 10s), place value (ones, tens, hundreds), even and odd numbers.

The student's chosen context/topic today: {TOPIC}

Coaching principles:
• Use the student's topic to ground every number example in something real they care about.
• Start with their actual level — if they struggle with 20, don't rush to 100.
• Ask ONE clear math question at a time. Celebrate every attempt warmly.
• When they make an error, NEVER say "wrong". Instead:
  ✅ "Let's try that together! If we count 5, 10, 15... what comes next?"
• Use concrete imagery: "Imagine 7 mangoes on the left and 3 on the right. Which is more?"
• Keep responses SHORT (2–3 sentences max) and always end with a question or challenge.
• Make it feel like a game, not a test.`,
  },
  {
    id: 1,
    name: 'Addition & Subtraction',
    subtitle: 'Putting Together & Taking Apart',
    description:
      'Master adding and subtracting — from single digits to 3-digit numbers with regrouping. Understand the relationship between these operations.',
    icon: Calculator,
    gradient: 'from-green-500 to-emerald-500',
    glowBg: 'bg-green-500/90',
    border: 'border-green-400/60',
    textColor: 'text-green-300',
    voiceIntro: `Welcome to Stage 2: Addition and Subtraction. This is where numbers start working for you! You will practise adding and subtracting — starting with small numbers and building all the way to hundreds. Your AI coach will create real-world problems using your chosen topic so that every calculation feels meaningful and connected to your life. When you are ready, type your topic and press Start New Session.`,
    systemPrompt: `You are an encouraging math coach helping a student master ADDITION AND SUBTRACTION.
This covers: addition facts 0–20, subtraction facts 0–20, adding/subtracting 2-digit numbers, regrouping (carrying/borrowing), adding/subtracting 3-digit numbers, word problems, checking answers with the inverse operation.

The student's chosen context: {TOPIC}

Coaching principles:
• Ground every problem in the student's chosen topic. Make it a story problem.
• Scaffold step-by-step: "First let's add the ones column. What is 7 + 5?"
• Celebrate mental math when they do it! "You got that without writing it — amazing!"
• When they make an error:
  ✅ "Let's check that together! If 23 + 19 = ?, let's add the ones first: 3 + 9 = ?"
• Build number sense alongside procedure: "Does that answer feel about right?"
• Always ask one focused follow-up question.`,
  },
  {
    id: 2,
    name: 'Multiplication & Division',
    subtitle: 'Patterns of Equal Groups',
    description:
      'Unlock the power of multiplication and division — times tables, multi-digit multiplication, long division, and real-world applications.',
    icon: Sigma,
    gradient: 'from-orange-500 to-red-500',
    glowBg: 'bg-orange-500/90',
    border: 'border-orange-400/60',
    textColor: 'text-orange-300',
    voiceIntro: `Welcome to Stage 3: Multiplication and Division. These operations are incredibly powerful — they let you work with groups and patterns far faster than counting one by one. In this stage, you will learn your times tables, how to multiply and divide larger numbers, and how these two operations are connected. Your coach will use your chosen topic to create patterns and problems that feel real. Type your topic and press Start New Session when you are ready.`,
    systemPrompt: `You are a creative math coach helping a student master MULTIPLICATION AND DIVISION.
This covers: meaning of multiplication as equal groups, times tables 1–12, commutative and distributive properties, multi-digit multiplication, meaning of division as sharing/grouping, long division, remainders, relationship between × and ÷, word problems.

The student's chosen context: {TOPIC}

Coaching principles:
• Use arrays, groups, and visual descriptions to make multiplication concrete.
• Connect division back to multiplication always: "If 6 × 4 = 24, what is 24 ÷ 6?"
• Celebrate pattern recognition! "You noticed the pattern in the 9-times table — that's brilliant mathematical thinking."
• When they make an error:
  ✅ "Let's break that down. 7 × 8 — can you think of it as 7 × 4 doubled?"
• Build fluency with times tables through stories from their chosen topic.
• One question per turn. Short responses. Always end with a challenge.`,
  },
  {
    id: 3,
    name: 'Fractions & Decimals',
    subtitle: 'Parts of a Whole',
    description:
      'Explore the world of parts and wholes. Fractions, decimals, and percentages — understand, compare, and compute with confidence.',
    icon: BookOpen,
    gradient: 'from-teal-500 to-cyan-500',
    glowBg: 'bg-teal-500/90',
    border: 'border-teal-400/60',
    textColor: 'text-teal-300',
    voiceIntro: `Welcome to Stage 4: Fractions and Decimals. This is where many students find math gets tricky — but it does not have to be! Fractions are just ways of describing parts of things we already know. Your coach will connect fractions and decimals to your chosen topic so they feel natural and intuitive. You will practise comparing fractions, adding and subtracting them, and connecting them to decimals and percentages. Type your topic and press Start New Session.`,
    systemPrompt: `You are a patient math coach helping a student understand FRACTIONS, DECIMALS, AND PERCENTAGES.
This covers: understanding fractions as parts of a whole, equivalent fractions, simplifying fractions, comparing and ordering fractions, adding and subtracting fractions (like and unlike denominators), mixed numbers and improper fractions, decimals (tenths, hundredths, thousandths), connecting fractions to decimals to percentages, basic fraction multiplication.

The student's chosen context: {TOPIC}

Coaching principles:
• ALWAYS start with a concrete, visual model: "Imagine cutting a piece of land into 4 equal parts. If someone owns 3 of those parts, they own 3/4."
• Use the student's topic to make every fraction feel real and worth caring about.
• When they make an error:
  ✅ "Let's draw it out mentally. If the whole is divided into 5 equal parts and we colour 2, we have 2/5."
• Build conceptual understanding BEFORE procedural rules.
• Connect fractions ↔ decimals ↔ percentages in every session.
• Keep responses SHORT. End with one focused question.`,
  },
  {
    id: 4,
    name: 'Measurement & Geometry',
    subtitle: 'Shape, Space & Size',
    description:
      'Measure the world around you. Explore 2D and 3D shapes, area, perimeter, volume, angles, and coordinate geometry.',
    icon: Shapes,
    gradient: 'from-purple-500 to-violet-500',
    glowBg: 'bg-purple-500/90',
    border: 'border-purple-400/60',
    textColor: 'text-purple-300',
    voiceIntro: `Welcome to Stage 5: Measurement and Geometry. Mathematics lives in the physical world — in the shapes of buildings, the sizes of fields, and the angles of roads. In this stage you will explore shapes, their properties, how to measure them, and how to work with angles and coordinates. Your coach will use your chosen context to make geometry feel alive. Type your topic and press Start New Session.`,
    systemPrompt: `You are an imaginative math coach helping a student explore MEASUREMENT AND GEOMETRY.
This covers: units of length, mass, capacity, and time; perimeter and area of rectangles and triangles; area of parallelograms and circles; volume of rectangular prisms; properties of 2D shapes (triangles, quadrilaterals, circles, polygons); properties of 3D shapes; types of angles; angle sums in triangles and quadrilaterals; coordinate grids; transformations (reflection, rotation, translation); the Pythagorean theorem (introduction).

The student's chosen context: {TOPIC}

Coaching principles:
• Always connect shapes and measures to the student's real world and chosen topic.
• Use mental imagery powerfully: "Picture the wall of a room — its length times its height gives you its area."
• When they make an error:
  ✅ "Let's check the formula together. For a triangle, the area is base times height, then divide by 2."
• Ask students to REASON about shapes, not just memorise formulas.
• Celebrate when they notice geometric patterns in everyday life.
• One question per turn. Keep responses SHORT and visual.`,
  },
  {
    id: 5,
    name: 'Ratios, Rates & Proportions',
    subtitle: 'Relationships Between Quantities',
    description:
      'Understand proportional thinking — ratios, rates, percentages, proportions, and scaling — the bridge to algebra.',
    icon: TrendingUp,
    gradient: 'from-rose-500 to-pink-500',
    glowBg: 'bg-rose-500/90',
    border: 'border-rose-400/60',
    textColor: 'text-rose-300',
    voiceIntro: `Welcome to Stage 6: Ratios, Rates, and Proportions. This is where mathematics starts describing relationships between things — and that is incredibly powerful. Ratios show us how quantities compare. Rates describe how one quantity changes relative to another. Proportions let us scale things up or down. These ideas are everywhere in real life: cooking, business, maps, and more. Your coach will connect everything to your chosen topic. Type it in and press Start New Session.`,
    systemPrompt: `You are a practical math coach helping a student master RATIOS, RATES, AND PROPORTIONS.
This covers: meaning and notation of ratios (a:b and a/b), equivalent ratios, unit rates, rate problems (speed, price per unit), proportional relationships, solving proportions using cross-multiplication, percentage problems (% of a number, % increase/decrease, reverse percentage), scale drawings, direct and inverse proportion.

The student's chosen context: {TOPIC}

Coaching principles:
• Ground every ratio and rate in the student's chosen topic. Make it a real comparison.
• Ask them to estimate before calculating: "Before you work it out — do you think the answer will be bigger or smaller than 50?"
• When they make an error:
  ✅ "Let's set up the proportion carefully. If 3 bags cost 600 Naira, then 5 bags cost 5 × (600÷3) = ?"
• Help them see proportional reasoning as a powerful thinking tool, not just a procedure.
• Connect ratios → fractions → percentages → decimals naturally.
• One question per turn. Short, focused responses.`,
  },
  {
    id: 6,
    name: 'Algebra & Geometry',
    subtitle: 'The Language of Mathematics',
    description:
      'Think algebraically — variables, expressions, equations, inequalities, linear functions, and geometric proof. Welcome to real mathematics.',
    icon: FunctionSquare,
    gradient: 'from-indigo-500 to-blue-500',
    glowBg: 'bg-indigo-500/90',
    border: 'border-indigo-400/60',
    textColor: 'text-indigo-300',
    voiceIntro: `Welcome to Stage 7: Algebra and Geometry. You have arrived at the frontier of school mathematics. Algebra is the language mathematicians use to describe patterns, relationships, and unknowns. Geometry at this level proves WHY shapes work the way they do — not just what their measurements are. Your coach will meet you exactly where you are and guide you step by step through variables, equations, functions, and geometric reasoning. Type your topic or a specific area you want to work on, and press Start New Session.`,
    systemPrompt: `You are a rigorous but encouraging math coach helping a student develop ALGEBRAIC AND GEOMETRIC REASONING.
This covers: variables and expressions, simplifying expressions, solving one-step and two-step equations, inequalities and number lines, introduction to functions and linear relationships, slope and y-intercept, graphing linear equations, systems of equations (substitution and elimination), introduction to polynomials, the Pythagorean theorem and its applications, geometric proof and reasoning, similarity and congruence, circles (area, circumference, arcs, sectors), surface area and volume of prisms, cylinders, cones, and spheres, introduction to quadratic functions.

The student's chosen focus: {TOPIC}

Coaching principles:
• Ask the student to explain their REASONING — not just their answer.
• Use the Socratic method: ask guiding questions that lead them to discover the answer.
• When they make an error:
  ✅ "Let's check each step. In the equation 2x + 5 = 13, what should we do first to isolate x?"
• Build algebraic intuition: "What would happen to the equation if x were 0? What if it were negative?"
• Connect algebra and geometry wherever possible (e.g., area = lw connects to algebra).
• Praise mathematical thinking and reasoning — not just correct answers.
• ONE focused question per turn. Rigorous but human.`,
  },
];

// ─── Stage Rubrics ────────────────────────────────────────────────────────────

const STAGE_RUBRICS: Record<number, string[]> = {
  0: ['Number Recognition', 'Counting Accuracy', 'Comparison & Ordering', 'Place Value', 'Skip Counting'],
  1: ['Fact Fluency', 'Regrouping Accuracy', 'Word Problem Reasoning', 'Inverse Operations', 'Mental Math'],
  2: ['Times Table Fluency', 'Multi-digit Multiplication', 'Division Understanding', 'Remainders', 'Word Problems'],
  3: ['Fraction Concepts', 'Equivalent Fractions', 'Fraction Operations', 'Decimal Connections', 'Percentage Understanding'],
  4: ['Shape Properties', 'Perimeter & Area', 'Volume & Capacity', 'Angle Reasoning', 'Coordinate Geometry'],
  5: ['Ratio Reasoning', 'Rate Problems', 'Proportional Thinking', 'Percentage Applications', 'Scaling'],
  6: ['Variable & Expression Fluency', 'Equation Solving', 'Algebraic Reasoning', 'Function Understanding', 'Geometric Proof'],
};

const LEVEL_CONFIG: Record<ProficiencyLevel, { color: string; bg: string; border: string; emoji: string }> = {
  Emerging:   { color: 'text-red-600',    bg: 'bg-red-100',       border: 'border-red-300',   emoji: '🌱' },
  Developing: { color: 'text-blue-700',   bg: 'bg-blue-100',    border: 'border-blue-300',  emoji: '📈' },
  Proficient: { color: 'text-green-700',  bg: 'bg-green-100',   border: 'border-green-300', emoji: '✅' },
  Advanced:   { color: 'text-yellow-700', bg: 'bg-yellow-100',  border: 'border-yellow-300',emoji: '🏆' },
};

// ─── Evaluation function ──────────────────────────────────────────────────────

const evaluateSession = async (
  messages: ChatMessage[],
  stageId: number,
  mathLevel: number,
): Promise<SessionEvaluation> => {
  const rubrics = STAGE_RUBRICS[stageId];
  const stage = STAGES[stageId];
  const conversation = messages
    .map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`)
    .join('\n\n');

  const prompt = `You are an expert mathematics education assessor evaluating a student's math session.

Stage: "${stage.name}" (Stage ${stageId + 1} of 7)
Student's current math level: ${mathLevel} (scale 0–3, where 0=pre-numerate, 1=emerging, 2=developing, 3=proficient)

Assess the student ONLY on the rubric dimensions below. Base ALL assessments on actual evidence from the conversation.

Rubric dimensions:
${rubrics.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Conversation:
${conversation}

Scoring guide:
- Emerging (score 0–49): Little to no evidence; major misconceptions; needs foundational support
- Developing (score 50–69): Partial understanding; errors present but making progress
- Proficient (score 70–84): Solid understanding; minor errors; ready to advance
- Advanced (score 85–100): Deep, flexible understanding; can explain reasoning; extends concepts

Rules:
- can_advance = true only if ALL sub_categories are Proficient or Advanced
- is_complete = true only if ALL sub_categories are Advanced
- Be honest but kind — if there is insufficient conversation to assess a dimension fairly, mark it Emerging with low score and note "Insufficient evidence"
- Keep evidence notes to one concrete, specific sentence
- The encouragement must be personalised and genuinely reference something from the session

Respond ONLY with valid JSON:
{
  "stage_id": ${stageId},
  "stage_name": "${stage.name}",
  "overall_level": "Emerging|Developing|Proficient|Advanced",
  "can_advance": false,
  "is_complete": false,
  "sub_categories": [
    { "name": "...", "level": "Emerging|Developing|Proficient|Advanced", "score": 0, "evidence": "..." }
  ],
  "encouragement": "..."
}`;

  const result = await chatJSON({
    page: 'MathSkillsPage',
    messages: [{ role: 'user', content: prompt }],
    system: 'You are a mathematics education assessment expert. Return only valid JSON with no preamble or markdown.',
    max_tokens: 900,
    temperature: 0.15,
  });

  if (result?.stage_id === undefined || !result?.sub_categories) {
    throw new Error('Invalid evaluation response');
  }
  return result as SessionEvaluation;
};

// ─── Improve math explanation helper ─────────────────────────────────────────

const improveExplanation = async (
  text: string,
  context: string,
  stageId: number,
): Promise<{ improved: string; explanation: string }> => {
  const prompt = `You are a math communication coach. The student is working on "${STAGES[stageId].name}".

Their draft response/working:
"${text}"

Recent context:
${context}

Task:
1. Improve their mathematical explanation or working so it is clearer and more precise — while keeping their ideas and voice intact.
2. Write a brief, warm explanation of 1–2 changes you made.

Respond ONLY with valid JSON:
{ "improved": "...", "explanation": "..." }`;

  return await chatJSON({
    page: 'MathSkillsPage',
    messages: [{ role: 'user', content: prompt }],
    system: 'You are a math communication coach. Return only valid JSON.',
    max_tokens: 500,
    temperature: 0.3,
  });
};

// ─── Build spoken evaluation ──────────────────────────────────────────────────

const buildSpokenEvaluation = (evaluation: SessionEvaluation): string => {
  const levelPhrases: Record<ProficiencyLevel, string> = {
    Emerging:   'you are just beginning to build this skill — and that is perfectly fine',
    Developing: 'you are making real mathematical progress here',
    Proficient: 'you are doing really well with this concept',
    Advanced:   'you have mastered this — outstanding mathematical thinking',
  };

  const strongSkills = evaluation.sub_categories.filter(
    s => s.level === 'Proficient' || s.level === 'Advanced'
  );
  const growthSkills = evaluation.sub_categories.filter(
    s => s.level === 'Emerging' || s.level === 'Developing'
  );

  let speech = `Your math session evaluation is ready. `;
  speech += `Your overall level is ${evaluation.overall_level}. `;
  speech += `${evaluation.encouragement} `;

  if (strongSkills.length > 0) {
    speech += `You are doing well in: ${strongSkills.map(s => s.name).join(', ')}. `;
    speech += `These are genuine strengths — keep building on them! `;
  }

  if (growthSkills.length > 0) {
    speech += `To grow the most, keep practising: ${growthSkills.map(s => s.name).join(', ')}. `;
    const topGrowth = growthSkills[0];
    speech += `Especially ${topGrowth.name} — ${levelPhrases[topGrowth.level]}, and focused practice will make a big difference. `;
  }

  if (evaluation.is_complete) {
    speech += `Incredible achievement — you have reached Advanced in every skill! This stage is fully complete and the next stage is now unlocked. `;
  } else if (evaluation.can_advance) {
    speech += `You are Proficient in every skill — the next stage is now unlocked! Keep practising here to reach Advanced and fully master this stage. `;
  } else {
    speech += `Keep going — reach Proficient in all skills to unlock the next stage. Every session builds your mathematical mind. `;
  }

  speech += `Mathematics is a journey, not a race. I am proud of the thinking you showed today. Let us keep going!`;
  return speech;
};

// ─── MessageContent renderer ──────────────────────────────────────────────────

const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('✅')) {
          return (
            <p key={i} className="text-green-700 font-semibold">
              {line}
            </p>
          );
        }
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
};

// ─── Derive progress from saved sessions ─────────────────────────────────────

// ─── Strict Progression: Stage N only unlocks if Stage N-1 is Proficient+ ───────────────
const canAccessStage = (stageIndex: number, stageLevels: (string | null)[]): boolean => {
  // Stage 0 always accessible
  if (stageIndex === 0) return true;
  // Stage N requires Stage N-1 to be 'Proficient' or 'Advanced'
  const previousStageLevel = stageLevels[stageIndex - 1];
  if (!previousStageLevel) return false;
  return previousStageLevel === 'Proficient' || previousStageLevel === 'Advanced';
};

const isStrongLevel = (level: ProficiencyLevel) => level === 'Proficient' || level === 'Advanced';

const deriveProgress = (rows: DashboardSession[]): UserProgress => {
  const completedStages = Array(STAGES.length).fill(false) as boolean[];
  const stageLevels = Array(STAGES.length).fill(null) as (ProficiencyLevel | null)[];

  const levelPriority: Record<ProficiencyLevel, number> = {
    Emerging: 1,
    Developing: 2,
    Proficient: 3,
    Advanced: 4,
  };

  const strongestLevel = (current: ProficiencyLevel | null, candidate: ProficiencyLevel) =>
    !current || levelPriority[candidate] > levelPriority[current] ? candidate : current;

  for (const row of rows) {
    const ev = row.math_skills_evaluation;
    if (!ev || ev.stage_id < 0 || ev.stage_id >= STAGES.length) continue;
    stageLevels[ev.stage_id] = strongestLevel(stageLevels[ev.stage_id], ev.overall_level);
    completedStages[ev.stage_id] = ev.overall_level === 'Advanced';
  }

  let unlockedUpTo = 0;
  while (unlockedUpTo < completedStages.length && completedStages[unlockedUpTo]) {
    unlockedUpTo += 1;
  }

  return { unlockedUpTo, completedStages, stageLevels };
};

const EMPTY_USER_PROGRESS: UserProgress = {
  unlockedUpTo: 0,
  completedStages: Array(STAGES.length).fill(false) as boolean[],
  stageLevels: Array(STAGES.length).fill(null) as (ProficiencyLevel | null)[],
};

const EXTENSIVE_INTERACTIVE_INSTRUCTIONS = `
Always respond as a deeply thoughtful tutor. Your answers must:
- be expansive, detailed, and fully unpack the learner's question or prompt;
- explain reasoning step by step, not just give a short summary;
- connect ideas clearly to the current stage objective and the student's context;
- avoid superficial or brief responses unless the learner explicitly asks for a short summary;
- conclude with multiple highly relevant follow-up questions tied strictly to the current stage's math learning objective.

The AI must provide large, comprehensive answers capable of thoroughly addressing any user question.
The AI should act like a human tutor, responding in depth and following up with several highly relevant questions tailored to the specific activity.`;

// ─── Evaluation Modal ─────────────────────────────────────────────────────────

const EvaluationModal: React.FC<{
  evaluation: SessionEvaluation;
  stage: typeof STAGES[0];
  onClose: () => void;
  onSpeak: (text: string) => void;
}> = ({ evaluation, stage, onClose, onSpeak }) => {
  const overall = LEVEL_CONFIG[evaluation.overall_level];

  useEffect(() => {
    const spokenText = buildSpokenEvaluation(evaluation);
    const t = setTimeout(() => onSpeak(spokenText), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className={`sticky top-0 ${stage.glowBg} border-b ${stage.border} rounded-t-2xl px-6 py-4 flex items-start justify-between`}>
          <div>
            <h2 className="text-gray-900 font-bold text-lg">{stage.name} — Session Evaluation</h2>
            <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-sm font-semibold ${overall.bg} ${overall.color} border ${overall.border}`}>
              {overall.emoji} Overall: {evaluation.overall_level}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1 mt-0.5 flex-shrink-0">
            <X size={22} />
          </button>
        </div>

        {/* Sub-categories */}
        <div className="px-6 py-5 space-y-3">
          <h3 className="text-gray-500 font-semibold text-xs uppercase tracking-wider mb-4">Skill Breakdown</h3>
          {(evaluation.sub_categories ?? []).map((sub, i) => {
            const lc = LEVEL_CONFIG[sub.level];
            return (
              <div key={i} className={`rounded-xl border ${lc.border} ${lc.bg} p-4`}>
                <div className="flex items-center justify-between mb-2 gap-3">
                  <span className="text-gray-900 font-semibold text-sm">{sub.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${lc.bg} ${lc.color} ${lc.border}`}>
                      {lc.emoji} {sub.level}
                    </span>
                    <span className="text-gray-500 text-xs font-mono">{sub.score}/100</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-700/60 rounded-full mb-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${stage.gradient} transition-all duration-700`}
                    style={{ width: `${sub.score}%` }}
                  />
                </div>
                <p className="text-gray-600 text-xs leading-relaxed">
                  <span className="text-slate-500 mr-1">Evidence:</span>{sub.evidence}
                </p>
              </div>
            );
          })}
        </div>

        {/* Encouragement */}
        <div className="px-6 pb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-gray-700 text-sm leading-relaxed">🌟 {evaluation.encouragement}</p>
          </div>
        </div>

        {/* Growth focus */}
        {(() => {
          const growthSkills = evaluation.sub_categories.filter(
            s => s.level === 'Emerging' || s.level === 'Developing'
          );
          if (growthSkills.length === 0) return null;
          return (
            <div className="px-6 pb-4">
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <p className="text-amber-800 text-xs font-semibold uppercase tracking-wider mb-2">
                  🎯 Focus here next to grow the most
                </p>
                <ul className="space-y-1">
                  {growthSkills.map((s, i) => (
                    <li key={i} className="text-gray-600 text-sm flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span><strong className="text-gray-900">{s.name}</strong> — {s.evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}

        {/* Advancement status */}
        <div className="px-6 pb-4">
          {evaluation.is_complete ? (
            <div className="bg-green-100 border border-green-300 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
              <p className="text-green-800 text-sm font-medium">
                🎉 Outstanding! You have reached <strong>Advanced</strong> in every skill area. This stage is fully complete and the next stage is now unlocked!
              </p>
            </div>
          ) : evaluation.can_advance ? (
            <div className="bg-blue-100 border border-blue-300 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-700 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800 text-sm font-medium">
                ✅ You are <strong>Proficient</strong> in all skill areas — the next stage is unlocked! Keep practising here to reach Advanced and fully master this stage.
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-gray-600 text-sm">
                Keep going! Reach <strong className="text-blue-700">Proficient</strong> in all skill areas to unlock the next stage.
              </p>
            </div>
          )}
        </div>

        {/* Coach note */}
        <div className="px-6 pb-4">
          <div className="bg-indigo-50 border border-indigo-300 rounded-xl p-4 text-center">
            <p className="text-indigo-800 text-sm">
              🧮 Every mathematician started exactly where you are. You are building something real. Keep going!
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => onSpeak(buildSpokenEvaluation(evaluation))}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-indigo-300 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-all"
          >
            <Volume2 size={15} /> Hear Again
          </button>
          <button
            onClick={onClose}
            className={`flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r ${stage.gradient} hover:opacity-90 transition-opacity`}
          >
            Continue Practising
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const MathSkillsPage: React.FC = () => {
  const { user } = useAuth();
  type PageView = 'stages' | 'topic' | 'chat';

  const [view, setView] = useState<PageView>('stages');
  const [selectedStage, setSelectedStage] = useState<typeof STAGES[0] | null>(null);
  const [topic, setTopic] = useState('');
  const [topicInput, setTopicInput] = useState('');

  const [progress, setProgress] = useState<UserProgress>(EMPTY_USER_PROGRESS);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [stageSessions, setStageSessions] = useState<DashboardSession[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<SessionEvaluation | null>(null);
  const [showEvalModal, setShowEvalModal] = useState(false);

  const dashboardRowId = useRef<string | null>(null);

  // ── Voice ─────────────────────────────────────────────────────────────
  const [continent, setContinent] = useState<string | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [ttsUnlocked, setTtsUnlocked] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const hasSpokenIntro = useRef(false);
  const hasSpokenStagesIntro = useRef(false);

  const {
    speak: hookSpeak,
    cancel,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
  } = useVoice(voiceMode === 'pidgin');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Math level (mirrors communicationLevel from English) ──────────────
  // 0=pre-numerate, 1=emerging, 2=developing, 3=proficient
  const [mathLevel, setMathLevel] = useState<number>(1);
  const [personalityBaseline, setPersonalityBaseline] = useState<PersonalityBaseline>({
    communicationStrategy: null,
    learningStrategy: null,
  });

  // ── Fetch continent ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('continent, country').eq('id', user.id).single()
      .then(({ data }) => {
        const c = data?.continent ?? null;
        setContinent(c);
        const isNigerian = data?.country === 'Nigeria';
        setVoiceMode(isNigerian ? 'pidgin' : 'english');
      });
  }, [user?.id]);

  // ── Speak helpers ──────────────────────────────────────────────────────
  const speakAlways = useCallback((text: string) => {
    if (!ttsUnlocked) return;
    hookSpeak(text);
  }, [hookSpeak, ttsUnlocked]);

  const speak = useCallback((text: string) => {
    if (!speechEnabled || !ttsUnlocked) return;
    hookSpeak(text);
  }, [speechEnabled, hookSpeak, ttsUnlocked]);

  // ── Stage intro voice ─────────────────────────────────────────────────
  useEffect(() => {
    if (view === 'stages' && !hasSpokenStagesIntro.current && !loadingProgress) {
      hasSpokenStagesIntro.current = true;
      const t = setTimeout(() => speak(
        'Welcome to Math Skills. There are seven stages to master, from counting and number sense all the way to algebra and geometry. Complete each stage to unlock the next. Tap a stage card to begin.'
      ), 800);
      return () => clearTimeout(t);
    }
  }, [view, loadingProgress, speak]);

  useEffect(() => {
    if (view === 'topic' && selectedStage && !hasSpokenIntro.current) {
      hasSpokenIntro.current = true;
      const t = setTimeout(() => speak(selectedStage.voiceIntro), 600);
      return () => clearTimeout(t);
    }
  }, [view, selectedStage, speak]);

  useEffect(() => { if (view !== 'topic') hasSpokenIntro.current = false; }, [view]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') speak(last.content);
  }, [messages, speak]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Load progress ─────────────────────────────────────────────────────
  const loadAllProgress = useCallback(async () => {
    if (!user?.id) { setLoadingProgress(false); return; }
    const { data } = await supabase
      .from('dashboard')
      .select('id, title, sub_category, category_activity, progress, chat_history, math_skills_evaluation, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('activity', 'math_skills')
      .order('updated_at', { ascending: false });
    setProgress(deriveProgress((data ?? []) as DashboardSession[]));
    setLoadingProgress(false);
  }, [user?.id]);

  useEffect(() => { loadAllProgress(); }, [loadAllProgress]);

  const loadStageSessions = useCallback(async (stageName: string) => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('dashboard')
      .select('id, title, sub_category, category_activity, progress, chat_history, math_skills_evaluation, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('activity', 'math_skills')
      .eq('category_activity', stageName)
      .order('updated_at', { ascending: false });
    setStageSessions((data ?? []) as DashboardSession[]);
  }, [user?.id]);

  // ── Fetch personality baseline ────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('user_personality_baseline')
      .select('communication_strategy, learning_strategy, communication_level')
      .eq('user_id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return;
        setPersonalityBaseline({
          communicationStrategy: data.communication_strategy || null,
          learningStrategy: data.learning_strategy || null,
        });
        setMathLevel(data.communication_level ?? 1);
      });
  }, [user?.id]);

  // ── Math level language scaffold ──────────────────────────────────────
  const buildMathLevelBlock = (level: number): string => {
    if (level <= 0) return `
═══════════════════════════════════════════════
MATH LEVEL: 0 — PRE-NUMERATE / VERY BASIC
This student is at the very beginning of their number journey.
═══════════════════════════════════════════════
LANGUAGE RULES (mandatory):
- Use ONLY the simplest everyday language. Maximum 1–2 short sentences per turn.
- Ask questions answerable with a single number or "yes/no": "Can you count to 5? Try now!"
- Celebrate every attempt: "Good try! 👏"
- Use physical objects in your mental imagery: "Imagine 3 stones. Count them with me: 1, 2, 3."
- NEVER use math terminology without explaining it immediately.`;

    if (level === 1) return `
═══════════════════════════════════════════════
MATH LEVEL: 1 — EMERGING
This student is building foundational number sense. They may struggle with multi-step problems.
═══════════════════════════════════════════════
LANGUAGE RULES (mandatory):
- Short, simple sentences. One idea per turn. Full response under 60 words.
- Explain every math term as you use it: "We call this multiplication — it means equal groups."
- Use everyday objects and contexts: market stalls, farm animals, water buckets.
- Celebrate every correct attempt before correcting errors.
- Break all problems into tiny one-step chunks.`;

    if (level === 2) return `
═══════════════════════════════════════════════
MATH LEVEL: 2 — DEVELOPING
This student can handle multi-step problems with guidance and some math vocabulary.
═══════════════════════════════════════════════
LANGUAGE RULES:
- Clear explanations using correct math terminology with brief definitions where needed.
- Multi-step problems are fine but scaffold the steps explicitly.
- Connect new concepts to what they already know.
- Ask for reasoning: "How did you get that answer?"`;

    return `
═══════════════════════════════════════════════
MATH LEVEL: 3 — PROFICIENT
This student can handle abstract reasoning and multi-step problems with correct math language.
═══════════════════════════════════════════════
LANGUAGE RULES:
- Use full mathematical vocabulary without over-explaining it.
- Push for precision, generalisation, and proof.
- Challenge them: "Can you think of a case where that rule wouldn't work?"
- Expect and celebrate mathematical justification.`;
  };

  // ── Voice input ───────────────────────────────────────────────────────
  const toggleListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input is not supported. Try Chrome or Edge.'); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = 'en-NG'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setInputText(prev => prev ? `${prev} ${t}` : t);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.start();
    setIsListening(true);
  };

  // ── Persist to dashboard ──────────────────────────────────────────────
  const persistToDashboard = useCallback(async (
    msgs: ChatMessage[],
    eval_: SessionEvaluation | null = null,
  ) => {
    if (!dashboardRowId.current) return;
    await supabase
      .from('dashboard')
      .update({
        chat_history: JSON.stringify(msgs),
        ...(eval_ !== null && { math_skills_evaluation: eval_ }),
        progress: eval_?.is_complete ? 'completed' : 'started',
        updated_at: new Date().toISOString(),
      })
      .eq('id', dashboardRowId.current);
  }, []);

  // ── Start session ─────────────────────────────────────────────────────
  const startSession = async () => {
    if (!topicInput.trim() || !selectedStage) return;
    const t = topicInput.trim();
    setTopic(t); setMessages([]); setEvaluation(null);
    dashboardRowId.current = null; setIsSending(true);
    cancel();

    if (user?.id) {
      const newId = crypto.randomUUID();
      const { error } = await supabase.from('dashboard').insert({
        id: newId, user_id: user.id,
        activity: 'math_skills',
        category_activity: selectedStage.name,
        sub_category: t,
        title: `Stage ${selectedStage.id + 1}: ${selectedStage.name} — ${t}`,
        progress: 'started',
        chat_history: JSON.stringify([]),
        math_skills_evaluation: null,
        continent: continent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!error) dashboardRowId.current = newId;
    }
    setView('chat');

    try {
      const sysPrompt = selectedStage.systemPrompt.replace('{TOPIC}', t) + buildMathLevelBlock(mathLevel) + EXTENSIVE_INTERACTIVE_INSTRUCTIONS;
      const welcome = await chatText({
        page: 'MathSkillsPage',
        messages: [{ role: 'user', content: `The student has chosen to practice "${selectedStage.name}" using the context of: "${t}". Give a warm 2-sentence welcome and pose your very first math question or challenge, grounded in their context. Be encouraging and make it feel like an adventure.` }],
        system: sysPrompt,
        max_tokens: 400,
      });
      const welcomeMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: welcome, timestamp: new Date().toISOString(),
      };
      setMessages([welcomeMsg]);
      await persistToDashboard([welcomeMsg]);
    } catch {
      const fallback: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `Welcome! I am excited to explore ${selectedStage.name} with you through the context of "${t}". Let's get started! Can you tell me what you already know about this topic? What math have you done related to it before?`,
        timestamp: new Date().toISOString(),
      };
      setMessages([fallback]);
    } finally { setIsSending(false); }
  };

  // ── Resume session ────────────────────────────────────────────────────
  const resumeSession = async (session: DashboardSession) => {
    dashboardRowId.current = session.id;
    setTopic(session.sub_category ?? '');
    try { setMessages(session.chat_history ? JSON.parse(session.chat_history) : []); }
    catch { setMessages([]); }
    setEvaluation(session.math_skills_evaluation);
    cancel();
    setView('chat');
  };

  // ── Send message ──────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || isSending || !selectedStage) return;
    const userText = inputText.trim();
    setInputText(''); setIsSending(true);
    cancel();

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user',
      content: userText, timestamp: new Date().toISOString(),
    };
    const withUser = [...messages, userMsg];
    setMessages(withUser);

    try {
      const sysPrompt = selectedStage.systemPrompt.replace('{TOPIC}', topic) + buildMathLevelBlock(mathLevel) + EXTENSIVE_INTERACTIVE_INSTRUCTIONS;
      const aiText = await chatText({
        page: 'MathSkillsPage',
        messages: withUser.map(m => ({ role: m.role, content: m.content })),
        system: sysPrompt,
        max_tokens: 400,
      });
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: aiText, timestamp: new Date().toISOString(),
      };
      const finalMsgs = [...withUser, aiMsg];
      setMessages(finalMsgs);
      await persistToDashboard(finalMsgs, evaluation);
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: 'I had a small technical hiccup! Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  };

  // ── Improve explanation ───────────────────────────────────────────────
  const handleImprove = async () => {
    if (!inputText.trim() || isImproving || !selectedStage) return;
    setIsImproving(true);
    const context = messages.slice(-4).map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n');
    try {
      const { improved, explanation } = await improveExplanation(inputText.trim(), context, selectedStage.id);
      setInputText(improved);
      const explainMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `✏️ I polished your mathematical explanation!\n\n${explanation}\n\nYour improved response is now in the box — feel free to edit it before sending.`,
        timestamp: new Date().toISOString(),
      };
      const updatedMsgs = [...messages, explainMsg];
      setMessages(updatedMsgs);
      await persistToDashboard(updatedMsgs, evaluation);
    } catch (err) { console.error('Improve error:', err); }
    finally { setIsImproving(false); }
  };

  // ── Evaluation ────────────────────────────────────────────────────────
  const runEvaluation = async (msgs: ChatMessage[]): Promise<SessionEvaluation | null> => {
    if (!selectedStage) return null;
    try {
      const eval_ = await evaluateSession(msgs, selectedStage.id, mathLevel);
      setEvaluation(eval_);
      await loadAllProgress();
      return eval_;
    } catch (err) { console.error('Evaluate error:', err); return null; }
  };

  const handleEvaluate = async () => {
    if (isEvaluating || messages.filter(m => m.role === 'user').length < 2) return;
    setIsEvaluating(true);
    const eval_ = await runEvaluation(messages);
    if (eval_) { await persistToDashboard(messages, eval_); setShowEvalModal(true); }
    setIsEvaluating(false);
  };

  const handleSave = async () => {
    if (isSaving || messages.length < 2) return;
    setIsSaving(true);
    let eval_ = evaluation;
    if (messages.filter(m => m.role === 'user').length >= 1) {
      const fresh = await runEvaluation(messages);
      if (fresh) eval_ = fresh;
    }
    await persistToDashboard(messages, eval_);
    setShowEvalModal(true);
    setIsSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const isSessionFinished = (s: DashboardSession) => s.math_skills_evaluation?.is_complete === true;
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const busy = isSending || isImproving || isEvaluating || isSaving;

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: Stage Selection
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'stages') {
    return (
      <AppLayout>
        <MathDistortedBackground />
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="text-center mb-10">
            <div className="inline-flex flex-col items-center gap-1 rounded-lg bg-indigo-100/80 backdrop-blur-sm p-4 mb-4">
              <div className="flex items-center justify-center gap-3">
                <Sigma className="h-12 w-12 text-indigo-600 animate-pulse" />
                <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900">
                  Math Skills
                </h1>
              </div>
              <p className="text-xl md:text-2xl text-gray-800 max-w-2xl mx-auto">
                Build mathematical mastery from counting to algebra — one stage at a time, with an AI coach who meets you where you are.
              </p>
            </div>
            <div className="mt-4">
              <PidginTooltip
                originalText="Build mathematical mastery from counting to algebra — one stage at a time, with an AI coach who meets you where you are."
                hintText="Tap to translate this introduction into Nigerian Pidgin."
              />
            </div>

            {/* Voice selector */}
            <div className="mt-5 inline-flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-base text-white font-medium bg-indigo-600 rounded-xl px-4 py-2 shadow-lg">
                <Volume2 className="h-5 w-5 text-white" />
                <span>Choose your coach&apos;s voice:</span>
              </div>
              <div className="flex rounded-xl overflow-hidden border border-gray-300 shadow-lg">
                <button
                  onClick={e => { e.stopPropagation(); setVoiceMode('english'); }}
                  className={`flex items-center gap-2 px-5 py-3 text-base font-semibold transition-all
                    ${voiceMode === 'english' ? 'bg-blue-600 text-white shadow-inner' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  🇬🇧 British English
                </button>
                <div className="w-px bg-slate-500" />
                <button
                  onClick={e => { e.stopPropagation(); setVoiceMode('pidgin'); }}
                  className={`flex items-center gap-2 px-5 py-3 text-base font-semibold transition-all
                    ${voiceMode === 'pidgin' ? 'bg-green-600 text-white shadow-inner' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  🇳🇬 Nigerian Pidgin
                </button>
              </div>
              <p className="text-sm text-white font-medium bg-indigo-600 rounded-xl px-4 py-2 shadow-lg">
                {voiceMode === 'english'
                  ? 'British English voice — clear standard accent'
                  : 'Nigerian English voice (en-NG) — familiar local accent, works offline on Chromebook'}
              </p>
            </div>

            {/* TTS unlock */}
            <div className="mt-4 flex justify-center">
              {!ttsUnlocked ? (
                <button
                  onClick={() => {
                    setTtsUnlocked(true);
                    const utt = new SpeechSynthesisUtterance(' ');
                    utt.volume = 0;
                    window.speechSynthesis.speak(utt);
                    setTimeout(() => hookSpeak('Welcome to Math Skills. Tap a stage card to begin your journey.'), 300);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all text-base animate-pulse"
                >
                  <Volume2 className="h-5 w-5" />
                  🔊 Tap here to enable voice
                </button>
              ) : (
                <div className="flex items-center gap-2 text-indigo-700 text-sm font-semibold">
                  <Volume2 className="h-4 w-4" /> Voice is on
                </div>
              )}
            </div>
          </div>

          {/* Stage cards */}
          {loadingProgress ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-400" />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {(STAGES || []).map((stage, idx) => {
                const stageLevels = progress?.stageLevels ?? [];
                const unlockedUpTo = progress?.unlockedUpTo ?? 0;
                const currentLevel = (stageLevels && stageLevels[idx]) || null;
                const isCompleted = currentLevel === 'Advanced';
                // STRICT PROGRESSION: Use canAccessStage for enforcement
                const canAccess = canAccessStage(idx, stageLevels);
                const isLocked = !canAccess || isCompleted;
                const isActive = canAccess && !isCompleted;
                const isUnlocked = canAccess;
                const scoreBadge =
                  !isCompleted && (currentLevel === 'Proficient' || currentLevel === 'Emerging')
                    ? `Current Score: ${currentLevel}`
                    : null;
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.id}
                    onClick={(e) => {
                      // EXPLICIT CLICK BLOCKER: Prevent locked or completed stages
                      if (isLocked || isCompleted) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.warn(`[ProgressionLock] Stage ${idx + 1} is locked or completed. Access denied.`);
                        return;
                      }
                      setSelectedStage(stage); setTopicInput('');
                      loadStageSessions(stage.name); setView('topic');
                    }}
                    className={`relative rounded-2xl border-2 p-5 transition-all duration-200
                      ${isCompleted
                        ? 'bg-emerald-100/80 border-emerald-300 cursor-not-allowed opacity-70 backdrop-blur-sm pointer-events-none'
                        : isActive
                          ? `${stage.glowBg} ${stage.border} backdrop-blur-sm cursor-pointer hover:scale-[1.01] hover:shadow-2xl`
                          : 'bg-gray-100/80 border-gray-300 backdrop-blur-sm cursor-not-allowed opacity-70'}`}
                  >
                    <div className="flex items-start gap-5">
                      <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${isUnlocked ? `bg-gradient-to-br ${stage.gradient}` : 'bg-slate-600/80'}`}>
                        {isCompleted
                          ? <CheckCircle className="h-7 w-7 text-white" />
                          : isUnlocked
                            ? <Icon className="h-7 w-7 text-white" />
                            : <Lock className="h-6 w-6 text-gray-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                          <span className={`text-sm font-semibold uppercase tracking-wider ${isUnlocked ? 'text-slate-300' : 'text-gray-400'}`}>Stage {idx + 1}</span>
                          {isCompleted && <span className="font-bold text-green-700">Completed</span>}
                          {!isCompleted && scoreBadge && (
                            <span className="text-sm bg-slate-700/80 text-slate-200 px-2 py-0.5 rounded-full border border-slate-600/80">
                              {scoreBadge}
                            </span>
                          )}
                          {!isActive && isLocked && !isCompleted && (
                            <span className="text-sm bg-gray-300/80 text-gray-600 px-2 py-0.5 rounded-full border border-gray-400/60">
                              {idx === 0
                                ? '🔒 Not yet unlocked'
                                : `🔒 Complete Stage ${idx} to unlock`}
                            </span>
                          )}
                        </div>
                        <h3 className={`text-2xl font-bold ${isUnlocked ? 'text-white' : 'text-gray-500'}`}>{stage.name}</h3>
                        <p className={`text-base font-medium mt-0.5 ${isUnlocked ? stage.textColor : 'text-gray-400'}`}>{stage.subtitle}</p>
                        <p className={`text-base mt-1 ${isUnlocked ? 'text-slate-300' : 'text-gray-400'}`}>{stage.description || 'Description could not be loaded.'}</p>
                        <p className={`text-sm mt-2 ${isUnlocked ? 'text-slate-400' : 'text-gray-400'}`}>{(STAGE_RUBRICS[idx] ?? []).join(' · ')}</p>
                      </div>
                      {isActive && <ChevronRight className={`h-6 w-6 ${stage.textColor} flex-shrink-0 mt-1`} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: Topic + Session Dashboard
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'topic' && selectedStage) {
    const Icon = selectedStage.icon;
    const activeSessions = stageSessions.filter(s => !isSessionFinished(s));
    const finishedSessions = stageSessions.filter(s => isSessionFinished(s));

    return (
      <AppLayout>
        <MathDistortedBackground />
        <main className="relative z-10 flex-1 min-h-screen px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => { cancel(); setView('stages'); }}
              className="flex items-center gap-2 text-gray-400 hover:text-gray-900 mb-8 transition-colors text-base"
            >
              <ArrowLeft size={20} /> Back to Stages
            </button>

            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 mb-6">
              <div className="text-center mb-7">
                <div className={`w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${selectedStage.gradient} flex items-center justify-center`}>
                  <Icon className="h-10 w-10 text-white" />
                </div>
                <div className="text-base font-semibold text-gray-500 uppercase tracking-wider mb-1">Stage {selectedStage.id + 1}</div>
                <h2 className="text-4xl font-bold text-gray-900">{selectedStage.name}</h2>
                <p className="text-lg font-medium mt-1 text-gray-600">{selectedStage.subtitle}</p>
                <p className="text-gray-700 text-lg mt-3">{selectedStage.description || 'Description could not be loaded.'}</p>
                <p className="text-gray-500 text-base mt-2">{(STAGE_RUBRICS[selectedStage.id] ?? []).join(' · ')}</p>
                <button
                  onClick={() => speak(selectedStage.voiceIntro)}
                  className="mt-4 inline-flex items-center gap-2 text-base text-indigo-700 hover:text-indigo-800 border border-indigo-300 hover:border-indigo-400 bg-indigo-100 px-4 py-2 rounded-full transition-all"
                >
                  <Volume2 size={16} /> Hear instructions again
                </button>
              </div>

              {/* Voice mode */}
              <div className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-gray-900 text-lg font-semibold mb-3 text-center flex items-center justify-center gap-2">
                  <Volume2 size={18} className="text-indigo-600" /> Choose your coach&apos;s voice
                </p>
                <div className="flex rounded-xl overflow-hidden border border-gray-300">
                  <button
                    onClick={() => setVoiceMode('english')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-lg font-bold transition-all
                      ${voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    🇬🇧 British English
                  </button>
                  <div className="w-px bg-slate-500" />
                  <button
                    onClick={() => setVoiceMode('pidgin')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-lg font-bold transition-all
                      ${voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    🇳🇬 Nigerian Pidgin
                  </button>
                </div>
              </div>

              {/* Topic input */}
              <div className="mb-4">
                <label className="block text-gray-900 text-lg font-semibold mb-2">
                  What context or topic should your math coach use today?
                </label>
                <p className="text-gray-500 text-sm mb-3">
                  Choose something you love — farming, trading, cooking, football, building, or anything else. Your coach will teach math through it.
                </p>
                <input
                  type="text"
                  value={topicInput}
                  onChange={e => setTopicInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && topicInput.trim()) startSession(); }}
                  placeholder="e.g., market trading, football, farming, building construction..."
                  className="w-full bg-white border border-gray-300 text-gray-900 rounded-xl px-4 py-4 text-lg focus:outline-none focus:border-indigo-400 placeholder-gray-400 transition-colors"
                />
              </div>
              <button
                onClick={startSession}
                disabled={!topicInput.trim() || isSending}
                className={`w-full py-4 rounded-xl text-lg font-bold transition-all
                  ${topicInput.trim() && !isSending
                    ? `bg-gradient-to-r ${selectedStage.gradient} text-white hover:opacity-90 shadow-lg`
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
              >
                {isSending ? 'Starting session...' : '🧮 Start New Session'}
              </button>
            </div>

            {/* Active sessions */}
            {activeSessions.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <MessageSquare size={18} /> Continue a Session
                </h3>
                <div className="space-y-3">
                  {(activeSessions ?? []).map(session => (
                    <div
                      key={session.id}
                      onClick={() => resumeSession(session)}
                      className={`bg-white border ${selectedStage.border} rounded-xl p-4 cursor-pointer hover:bg-gray-50 transition-all`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 font-semibold text-base truncate">{session.sub_category}</p>
                          <p className="text-gray-500 text-sm mt-0.5">
                            {new Date(session.updated_at).toLocaleDateString()} · {session.progress}
                          </p>
                          {session.math_skills_evaluation && (
                            <div className="mt-1 flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold
                                ${LEVEL_CONFIG[session.math_skills_evaluation.overall_level].bg}
                                ${LEVEL_CONFIG[session.math_skills_evaluation.overall_level].color}
                                ${LEVEL_CONFIG[session.math_skills_evaluation.overall_level].border}`}>
                                {LEVEL_CONFIG[session.math_skills_evaluation.overall_level].emoji} {session.math_skills_evaluation.overall_level}
                              </span>
                            </div>
                          )}
                        </div>
                        <ChevronRight size={20} className={selectedStage.textColor} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed sessions */}
            {finishedSessions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-600" /> Completed Sessions
                </h3>
                <div className="space-y-2">
                  {(finishedSessions ?? []).map(session => (
                    <div
                      key={session.id}
                      onClick={() => resumeSession(session)}
                      className="bg-green-100 border border-green-300 rounded-xl p-4 cursor-pointer hover:bg-green-200 transition-all"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-green-700 font-semibold text-base truncate">🏆 {session.sub_category}</p>
                          <p className="text-gray-500 text-sm">{new Date(session.updated_at).toLocaleDateString()}</p>
                        </div>
                        <ChevronRight size={20} className="text-green-600" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </AppLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: Chat
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'chat' && selectedStage) {
    const Icon = selectedStage.icon;
    return (
      <AppLayout>
        <MathDistortedBackground />

        {showEvalModal && evaluation && (
          <EvaluationModal
            evaluation={evaluation}
            stage={selectedStage}
            onClose={() => setShowEvalModal(false)}
            onSpeak={speakAlways}
          />
        )}

        <main className="relative z-10 flex flex-col h-[calc(100vh-64px)]">
          {/* Chat header */}
          <div className={`flex-shrink-0 border-b ${selectedStage.border} bg-white/95 backdrop-blur px-4 py-3`}>
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => { cancel(); setView('topic'); }}
                  className="text-gray-400 hover:text-gray-900 transition-colors flex-shrink-0"
                >
                  <ArrowLeft size={22} />
                </button>
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${selectedStage.gradient} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-gray-900 font-bold text-base leading-tight truncate">{selectedStage.name}</p>
                  <p className={`text-sm ${selectedStage.textColor} truncate`}>{topic}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {evaluation && (
                  <button
                    onClick={() => setShowEvalModal(true)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border ${LEVEL_CONFIG[evaluation.overall_level].border} ${LEVEL_CONFIG[evaluation.overall_level].bg} ${LEVEL_CONFIG[evaluation.overall_level].color}`}
                  >
                    {LEVEL_CONFIG[evaluation.overall_level].emoji} {evaluation.overall_level}
                  </button>
                )}

                {/* Voice toggle */}
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  <button
                    onClick={() => setVoiceMode('english')}
                    title="British English voice"
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold transition-all border-r border-gray-300
                      ${voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700'}`}
                  >
                    🇬🇧 <span className="hidden sm:inline">English</span>
                  </button>
                  <button
                    onClick={() => setVoiceMode('pidgin')}
                    title="Nigerian Pidgin voice"
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold transition-all
                      ${voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700'}`}
                  >
                    🇳🇬 <span className="hidden sm:inline">Pidgin</span>
                  </button>
                </div>

                <button
                  onClick={() => { setSpeechEnabled(s => !s); if (speechEnabled) cancel(); }}
                  className={`p-2 rounded-lg transition-all ${speechEnabled ? `${selectedStage.glowBg} ${selectedStage.textColor} border ${selectedStage.border}` : 'bg-slate-700 text-slate-500'}`}
                >
                  {isSpeaking && speechEnabled ? <Volume2 size={16} className="animate-pulse" /> : speechEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-3`}>
                  {msg.role === 'assistant' && (
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${selectedStage.gradient} flex items-center justify-center flex-shrink-0 mt-1`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-5 py-4 text-lg leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-slate-700 text-white rounded-tr-sm'
                      : 'bg-gray-50 border border-gray-200 text-gray-800 rounded-tl-sm'}`}
                  >
                    <MessageContent content={msg.content} />
                    {msg.role === 'assistant' && (
                      <AIPidginCoachWrapper englishText={msg.content} />
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start gap-3">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${selectedStage.gradient} flex items-center justify-center`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-tl-sm px-5 py-3">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {fallbackText && (
              <div className="px-4 pb-2 max-w-3xl mx-auto">
                <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className={`flex-shrink-0 border-t ${selectedStage.border} bg-white/90 backdrop-blur px-4 pt-3 pb-4`}>
            <div className="max-w-3xl mx-auto">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer, working, or question here... or tap the mic to speak."
                rows={3}
                disabled={isSending || isImproving}
                className="w-full bg-white border border-gray-300 text-gray-900 rounded-xl px-4 py-3
                  focus:outline-none focus:border-indigo-400 placeholder-slate-400 resize-none text-lg
                  leading-relaxed disabled:opacity-50 transition-colors mb-2"
              />

              {/* Row 1: Mic + Send */}
              <div className="flex items-center justify-between mb-2 gap-2">
                <button
                  onClick={toggleListening}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-medium transition-all
                    ${isListening ? 'bg-red-500 animate-pulse text-white shadow-lg shadow-red-500/40' : 'bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700'}`}
                >
                  {isListening ? <MicOff size={17} /> : <Mic size={17} />}
                  {isListening ? 'Stop' : 'Speak'}
                </button>
                <button
                  onClick={sendMessage}
                  disabled={!inputText.trim() || isSending}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-base font-bold transition-all
                    ${inputText.trim() && !isSending
                      ? `bg-gradient-to-r ${selectedStage.gradient} text-white hover:opacity-90 shadow-lg`
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                >
                  <Send size={16} /> Send
                </button>
              </div>

              {/* Row 2: Improve | Save | Evaluate */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImprove}
                  disabled={!inputText.trim() || isImproving || isSending}
                  title="AI polishes your mathematical explanation while keeping your ideas"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all border
                    ${inputText.trim() && !isImproving && !isSending
                      ? 'bg-violet-100 border-violet-300 text-violet-700 hover:bg-violet-200'
                      : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'}`}
                >
                  <Wand2 size={15} />
                  {isImproving ? 'Polishing...' : 'Improve my explanation'}
                </button>

                <button
                  onClick={handleSave}
                  disabled={isSaving || isSending || messages.length < 2}
                  title="Save session and get your full evaluation"
                  className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border
                    ${!isSaving && messages.length >= 2
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'}`}
                >
                  <Save size={15} />
                  {isSaving ? 'Saving...' : 'Save Session'}
                </button>

                <button
                  onClick={handleEvaluate}
                  disabled={isEvaluating || isSending || userMessageCount < 2}
                  title={userMessageCount < 2 ? 'Send at least 2 messages first' : 'Get your full math evaluation'}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border
                    ${!isEvaluating && userMessageCount >= 2
                      ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                      : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'}`}
                >
                  <BarChart3 size={15} />
                  {isEvaluating ? 'Evaluating...' : 'Evaluate'}
                </button>
              </div>

              <p className="text-center text-gray-500 text-base mt-2">
                Enter to send · Shift+Enter for new line
                {userMessageCount < 2 && ` · Send ${2 - userMessageCount} more message${userMessageCount === 1 ? '' : 's'} to enable evaluation`}
              </p>
            </div>
          </div>
        </main>
      </AppLayout>
    );
  }

  return null;
};

export default MathSkillsPage;
