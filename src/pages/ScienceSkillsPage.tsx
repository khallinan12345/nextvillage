// src/pages/ScienceSkillsPage.tsx
//
// Architecture: Two-tier mastery learning
//   Tier 1 — Scientific Reasoning (5 sequential stages, universal gate)
//   Tier 2 — Pathways (Life Sciences | Physical Sciences), each 5 sequential stages
//             Unlocked only after Tier 1 is complete (all 5 stages Proficient+)
//
// Supabase: uses dashboard table, activity = 'science_skills'
//           evaluation stored in science_skills_evaluation jsonb column
//           evaluation object includes { pathway: 'reasoning' | 'life' | 'physical', stage_id, ... }

import React, { useEffect, useState, useRef, useCallback } from 'react';
import AppLayout from '../components/layout/AppLayout';
import {
  Mic, MicOff, MessageSquare, Lock, ArrowLeft, Send,
  Volume2, VolumeX, CheckCircle, TrendingUp, ChevronRight,
  ChevronDown, ChevronUp, Wand2, Save, BarChart3, X,
  Microscope, Atom, FlaskConical, Eye, Lightbulb,
  TreePine, Dna, Globe, Zap, BookOpen,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { chatText, chatJSON } from '../lib/chatClient';
import { useVoice } from '../hooks/useVoice';
import { PidginTooltip } from '../components/PidginTooltip';
import { VoiceFallback } from '../components/VoiceFallback';
import { AIPidginCoachWrapper } from '../components/AIPidginCoachWrapper';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProficiencyLevel = 'Emerging' | 'Developing' | 'Proficient' | 'Advanced';
type Pathway = 'reasoning' | 'life' | 'physical';

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
  pathway: Pathway;
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
  science_skills_evaluation: SessionEvaluation | null;
  created_at: string;
  updated_at: string;
}

interface StageProgress {
  unlockedUpTo: number;
  completedStages: boolean[];
  stageLevels: (ProficiencyLevel | null)[];
}

interface UserProgress {
  reasoning: StageProgress;
  life: StageProgress;
  physical: StageProgress;
  tier1Complete: boolean; // all 5 reasoning stages Proficient+
}

const EXTENSIVE_INTERACTIVE_INSTRUCTIONS = `

Always respond as a deeply thoughtful tutor. Your answers must:
- be expansive, detailed, and fully unpack the learner's question or prompt;
- explain the reasoning step by step, not just give a short summary;
- connect ideas clearly to the current stage objective and the student's context;
- avoid introducing content beyond the current stage unless the student specifically requests a broader explanation;
- finish by asking several targeted, context-specific follow-up questions that guide the learner deeper into the stage goal.

The AI must provide large, comprehensive answers capable of thoroughly addressing any user question.
The AI should act like a human tutor, responding in depth and following up with several highly relevant questions tailored to the specific activity.`;

// ─── Distorted Background ─────────────────────────────────────────────────────

const ScienceDistortedBackground: React.FC = () => {
  const [mousePixels, setMousePixels] = React.useState({ x: 0, y: 0 });
  const [isMouseMoving, setIsMouseMoving] = React.useState(false);
  const mouseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePixels({
        x: Math.max(0, e.clientX - 256),
        y: Math.max(0, e.clientY - 64),
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

  const imageUrl = '/SciencePageBackground.jpeg';

  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="science-ripple-distortion" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="3" seed="13" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="65" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <div
        className="fixed top-14 left-0 md:left-64 right-0 bottom-0"
        style={{ backgroundImage: `url('${imageUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/65 via-teal-900/55 to-cyan-900/60" />
        <div className="absolute inset-0 bg-black/10" />
      </div>
      {isMouseMoving && (
        <div
          className="fixed top-14 left-0 md:left-64 right-0 bottom-0 pointer-events-none"
          style={{
            backgroundImage: `url('${imageUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center',
            zIndex: 1, filter: 'url(#science-ripple-distortion)',
            WebkitMaskImage: `radial-gradient(circle 150px at ${mousePixels.x}px ${mousePixels.y}px, black 0%, black 50%, transparent 100%)`,
            maskImage: `radial-gradient(circle 150px at ${mousePixels.x}px ${mousePixels.y}px, black 0%, black 50%, transparent 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/65 via-teal-900/55 to-cyan-900/60" />
        </div>
      )}
    </>
  );
};

// ─── Tier 1: Scientific Reasoning Stages ─────────────────────────────────────

const REASONING_STAGES = [
  {
    id: 0,
    pathway: 'reasoning' as Pathway,
    name: 'Observation & Questioning',
    subtitle: 'See the World Like a Scientist',
    description: 'Develop the habit of careful observation. Learn to ask precise, testable questions about the world around you — the foundation of all science.',
    icon: Eye,
    gradient: 'from-sky-500 to-blue-500',
    glowBg: 'bg-sky-500/20',
    border: 'border-sky-400/60',
    textColor: 'text-sky-300',
    voiceIntro: `Welcome to Stage 1: Observation and Questioning. Every great scientific discovery began with someone paying close attention to the world around them. In this stage, you will practise making careful observations and turning what you notice into precise, testable questions. Your AI science coach will use your chosen context to help you see science everywhere in your daily life. Choose a topic you are curious about and press Start New Session.`,
    systemPrompt: `You are an inspiring science coach helping a student develop OBSERVATION AND QUESTIONING skills.
This covers: making careful, detailed observations using all senses; distinguishing observation from interpretation; identifying variables and patterns; forming precise, testable questions; understanding what makes a question scientific vs non-scientific; connecting observations to curiosity and wonder.

Student's chosen context/topic: {TOPIC}

Coaching principles:
• Ground every observation exercise in the student's chosen context. Science is everywhere.
• Use Nigerian/Oloibiri examples powerfully: "When you watch the Niger Delta at low tide, what exactly do you see? Describe it precisely."
• Distinguish observation from inference: "You said the sky looks sad — but what exactly do you SEE? What color, what texture?"
• Help them form testable questions: "That's interesting — how could you turn that into a question you could actually test?"
• Celebrate precise, specific observations enthusiastically.
• Ask ONE focused question per turn. Keep responses SHORT (2–3 sentences). Always end with a prompt.`,
  },
  {
    id: 1,
    pathway: 'reasoning' as Pathway,
    name: 'Hypothesis & Prediction',
    subtitle: 'Making Educated Guesses',
    description: 'Transform questions into testable predictions. Learn the structure of a scientific hypothesis and understand the difference between a guess and a reasoned prediction.',
    icon: Lightbulb,
    gradient: 'from-yellow-500 to-amber-500',
    glowBg: 'bg-yellow-500/20',
    border: 'border-yellow-400/60',
    textColor: 'text-yellow-300',
    voiceIntro: `Welcome to Stage 2: Hypothesis and Prediction. A hypothesis is not just a guess — it is a reasoned prediction based on what you already know. In this stage, you will learn to turn your observations and questions into well-formed hypotheses, and to make specific, testable predictions from them. Your coach will connect every concept to your chosen context. Type your topic and press Start New Session.`,
    systemPrompt: `You are a patient science coach helping a student master HYPOTHESIS AND PREDICTION.
This covers: structure of a good hypothesis (if... then... because...); independent and dependent variables; constants and controls; distinguishing hypotheses from theories and laws; making specific, measurable predictions; understanding falsifiability; connecting prior knowledge to hypothesis formation.

Student's chosen context: {TOPIC}

Coaching principles:
• Teach the "If... then... because..." structure explicitly and practice it repeatedly.
• Use the student's context to practice: "Based on your observations of {TOPIC}, what prediction could you make?"
• Challenge vague hypotheses: "That's a start! Can you make it more specific — what exactly would you measure?"
• Connect to indigenous knowledge: "Your grandmother's knowledge about planting seasons is actually a hypothesis — let's write it scientifically."
• Keep responses SHORT. One focused question or challenge per turn.`,
  },
  {
    id: 2,
    pathway: 'reasoning' as Pathway,
    name: 'Investigation & Evidence',
    subtitle: 'Designing Fair Tests',
    description: 'Design investigations to test your hypotheses. Understand variables, controls, and what makes evidence reliable and trustworthy.',
    icon: FlaskConical,
    gradient: 'from-violet-500 to-purple-500',
    glowBg: 'bg-violet-500/20',
    border: 'border-violet-400/60',
    textColor: 'text-violet-300',
    voiceIntro: `Welcome to Stage 3: Investigation and Evidence. A hypothesis is only as good as the test you design to examine it. In this stage, you will learn how to design fair, reliable investigations — what to change, what to keep the same, and how to collect evidence you can trust. Your coach will guide you through experimental design using your chosen context. Type your topic and press Start New Session.`,
    systemPrompt: `You are a methodical science coach helping a student develop INVESTIGATION AND EVIDENCE skills.
This covers: designing controlled experiments; identifying independent, dependent, and controlled variables; understanding sample size and reliability; qualitative vs quantitative data collection; fair testing principles; recognising bias and sources of error; fieldwork and observational study design (not all science is lab-based); ethics in investigation.

Student's chosen context: {TOPIC}

Coaching principles:
• Emphasise that investigations don't always require labs — fieldwork and observation are rigorous science too.
• Use the student's context: "How would you design a fair test for your hypothesis about {TOPIC}?"
• Challenge sloppy design: "If you only tested it once, how do you know it wasn't a fluke?"
• Connect to accessible investigations: students can design experiments with materials they have at home or in the community.
• One focused question per turn. Short responses.`,
  },
  {
    id: 3,
    pathway: 'reasoning' as Pathway,
    name: 'Data, Patterns & Analysis',
    subtitle: 'Making Sense of Evidence',
    description: 'Collect, organise, and analyse data to find patterns. Learn to distinguish signal from noise, and evidence from opinion.',
    icon: BarChart3,
    gradient: 'from-rose-500 to-pink-500',
    glowBg: 'bg-rose-500/20',
    border: 'border-rose-400/60',
    textColor: 'text-rose-300',
    voiceIntro: `Welcome to Stage 4: Data, Patterns, and Analysis. Collecting data is only the beginning — the real scientific skill is making sense of it. In this stage, you will practise organising data, identifying patterns, and drawing conclusions that are actually supported by your evidence. Your coach will use your chosen context to make data analysis feel meaningful and real. Type your topic and press Start New Session.`,
    systemPrompt: `You are an analytical science coach helping a student develop DATA ANALYSIS AND PATTERN RECOGNITION skills.
This covers: organising data in tables; calculating means, ranges, and simple statistics; identifying trends and patterns in data; constructing and reading graphs and charts; distinguishing correlation from causation; evaluating whether data supports or refutes a hypothesis; anomalous results; the role of uncertainty in scientific conclusions.

Student's chosen context: {TOPIC}

Coaching principles:
• Use simple, real datasets connected to the student's context wherever possible.
• Teach pattern recognition: "Look at these numbers — what trend do you notice? Does it match your prediction?"
• Tackle correlation vs causation firmly: "Just because two things happen together doesn't mean one caused the other."
• Celebrate honest analysis even when data contradicts the hypothesis: "That's actually GREAT science — your data surprised you. That's how discoveries happen."
• Short responses. One question per turn.`,
  },
  {
    id: 4,
    pathway: 'reasoning' as Pathway,
    name: 'Scientific Communication',
    subtitle: 'Sharing What You Discover',
    description: 'Communicate your findings clearly and honestly. Learn to write up investigations, evaluate claims, and engage with the scientific community of practice.',
    icon: MessageSquare,
    gradient: 'from-teal-500 to-green-500',
    glowBg: 'bg-teal-500/20',
    border: 'border-teal-400/60',
    textColor: 'text-teal-300',
    voiceIntro: `Welcome to Stage 5: Scientific Communication. Science only advances when findings are shared clearly and honestly. In this stage, you will practise writing up your investigations, evaluating scientific claims you encounter in the world, and understanding peer review. Your coach will help you communicate science powerfully using your chosen context. This is the final Reasoning stage — completing it unlocks both pathway tracks. Type your topic and press Start New Session.`,
    systemPrompt: `You are a science communication coach helping a student master SCIENTIFIC COMMUNICATION.
This covers: structure of a scientific report (aim, hypothesis, method, results, conclusion, evaluation); writing clear, objective conclusions linked to evidence; evaluating scientific claims in the media and everyday life; understanding peer review and scientific consensus; the difference between a scientific theory and a common-use "theory"; presenting findings to different audiences; the role of scepticism and reproducibility in science.

Student's chosen context: {TOPIC}

Coaching principles:
• Practice the full report structure: "Let's write up your investigation. Start with: what was your aim?"
• Build scientific literacy: "Here is a claim you might hear: [claim]. How would a scientist evaluate this?"
• Connect to real-world issues relevant to Nigeria and West Africa: climate change evidence, health claims, agricultural science.
• Celebrate clear, evidence-linked writing enthusiastically.
• Short responses. One question per turn.`,
  },
];

// ─── Tier 2: Life Sciences Pathway ───────────────────────────────────────────

const LIFE_STAGES = [
  {
    id: 0,
    pathway: 'life' as Pathway,
    name: 'Cells & Life Processes',
    subtitle: 'The Building Blocks of Life',
    description: 'Explore the cell as the fundamental unit of life. Understand what all living things share and what makes each type of organism unique.',
    icon: Microscope,
    gradient: 'from-green-500 to-emerald-500',
    glowBg: 'bg-green-500/20',
    border: 'border-green-400/60',
    textColor: 'text-green-300',
    voiceIntro: `Welcome to Life Sciences Stage 1: Cells and Life Processes. Every living thing — from the smallest bacterium to the tallest iroko tree — is made of cells. In this stage, you will explore what cells are, how they work, and what characteristics define all living things. Your coach will connect everything to your chosen context. Type your topic and press Start New Session.`,
    systemPrompt: `You are a biology coach helping a student explore CELLS AND LIFE PROCESSES.
This covers: characteristics of living things (MRS GREN); cell theory; prokaryotic vs eukaryotic cells; plant vs animal cells; cell organelles and their functions; cell specialisation and differentiation; diffusion and osmosis; nutrition, respiration, excretion, reproduction, sensitivity, growth.

Student's chosen context: {TOPIC}

Coaching principles:
• Use the student's context to bring biology alive: "Think about a cassava plant — every part of it is made of cells. Let's explore what those cells look like."
• Connect to health and food: students in Nigeria see biology through agriculture, traditional medicine, and food.
• Use the ✅ marker for corrections: ✅ The correct term is "organelle", not "organ" — organelles are structures inside the cell.
• Socratic method: guide them to discover rather than just receive.
• Short responses. One focused question per turn.`,
  },
  {
    id: 1,
    pathway: 'life' as Pathway,
    name: 'Organisms & Systems',
    subtitle: 'How Living Things Are Organised',
    description: 'From cells to tissues to organs to systems — understand how complex organisms are organised, and how body systems work together to sustain life.',
    icon: Dna,
    gradient: 'from-lime-500 to-green-500',
    glowBg: 'bg-lime-500/20',
    border: 'border-lime-400/60',
    textColor: 'text-lime-300',
    voiceIntro: `Welcome to Life Sciences Stage 2: Organisms and Systems. A single cell can only do so much. Complex living things organise their cells into tissues, organs, and systems — each with a specialised role. In this stage, you will explore how major body systems work and how they cooperate to keep an organism alive. Type your topic and press Start New Session.`,
    systemPrompt: `You are a biology coach helping a student understand ORGANISMS AND BODY SYSTEMS.
This covers: levels of organisation (cell → tissue → organ → system → organism); digestive system; circulatory system; respiratory system; nervous system; skeletal and muscular system; reproductive system (age-appropriate); immune system basics; plant organ systems (roots, stems, leaves, flowers); comparing systems across different organisms.

Student's chosen context: {TOPIC}

Coaching principles:
• Use the student's chosen context to frame systems thinking: "Think about how a fish feeds — trace that food through its digestive system."
• Connect to health literacy: students should understand their own bodies.
• Use analogies to familiar systems: "The circulatory system is like the road network connecting every village — blood is the truck carrying goods."
• Short responses. One focused question per turn.`,
  },
  {
    id: 2,
    pathway: 'life' as Pathway,
    name: 'Ecosystems & Interdependence',
    subtitle: 'Life in Communities',
    description: 'Explore how organisms interact with each other and their environment. Food webs, energy flow, nutrient cycles, and the fragile balance of ecosystems.',
    icon: TreePine,
    gradient: 'from-emerald-500 to-teal-500',
    glowBg: 'bg-emerald-500/20',
    border: 'border-emerald-400/60',
    textColor: 'text-emerald-300',
    voiceIntro: `Welcome to Life Sciences Stage 3: Ecosystems and Interdependence. No organism lives in isolation. Every living thing is connected to others and to its physical environment in a web of relationships. In this stage, you will explore ecosystems, food webs, energy flow, and the interdependence of life — using the rich ecosystems of the Niger Delta and West Africa as your primary context. Type your topic and press Start New Session.`,
    systemPrompt: `You are an ecology coach helping a student explore ECOSYSTEMS AND INTERDEPENDENCE.
This covers: biotic and abiotic factors; habitats, niches, and populations; food chains and food webs; producers, consumers, and decomposers; energy flow through ecosystems (10% rule); nutrient cycles (carbon, nitrogen, water); predator-prey relationships; competition, mutualism, parasitism, commensalism; biodiversity; human impact on ecosystems; conservation.

Student's chosen context: {TOPIC}

Coaching principles:
• USE THE NIGER DELTA AND WEST AFRICAN CONTEXT POWERFULLY: mangroves, rainforests, savanna, river ecosystems are all rich teaching contexts.
• Connect to real environmental issues: oil spills, deforestation, fish stock depletion are directly relevant.
• Build ecological thinking: "If the mangroves are removed, trace what happens to the food web step by step."
• Indigenous ecological knowledge is scientifically valid — honour and build on it.
• Short responses. One focused question per turn.`,
  },
  {
    id: 3,
    pathway: 'life' as Pathway,
    name: 'Genetics & Heredity',
    subtitle: 'Why Offspring Resemble Parents',
    description: 'Understand how traits are inherited, the role of DNA and genes, and the basics of Mendelian genetics and modern genomics.',
    icon: Dna,
    gradient: 'from-purple-500 to-violet-500',
    glowBg: 'bg-purple-500/20',
    border: 'border-purple-400/60',
    textColor: 'text-purple-300',
    voiceIntro: `Welcome to Life Sciences Stage 4: Genetics and Heredity. Why do children look like their parents? Why do some traits skip a generation? The answers lie in DNA — the molecule that carries the instructions for life. In this stage, you will explore how traits are inherited and how genetics shapes living things. Type your topic and press Start New Session.`,
    systemPrompt: `You are a genetics coach helping a student understand GENETICS AND HEREDITY.
This covers: DNA structure and function; genes, alleles, and chromosomes; Mendel's laws of inheritance; dominant and recessive traits; genotype and phenotype; Punnett squares; sex determination; mutations; genetic variation; introduction to natural selection; applications of genetics (agriculture, medicine).

Student's chosen context: {TOPIC}

Coaching principles:
• Start with observable traits from the student's world: "Think about the yam varieties farmers select — that IS genetics in action."
• Punnett squares are a tool, not the destination — emphasise the underlying reasoning.
• Connect to agricultural applications: selective breeding of crops and livestock is deeply relevant.
• Use ✅ marker for corrections: ✅ A gene codes for a specific trait; an allele is one version of that gene.
• Short responses. One focused question per turn.`,
  },
  {
    id: 4,
    pathway: 'life' as Pathway,
    name: 'Evolution & Biodiversity',
    subtitle: 'The Story of Life on Earth',
    description: 'Understand natural selection, adaptation, and how life on Earth diversified over billions of years into the extraordinary biodiversity we see today.',
    icon: Globe,
    gradient: 'from-cyan-500 to-blue-500',
    glowBg: 'bg-cyan-500/20',
    border: 'border-cyan-400/60',
    textColor: 'text-cyan-300',
    voiceIntro: `Welcome to Life Sciences Stage 5: Evolution and Biodiversity. How did life on Earth produce millions of different species — from bacteria to blue whales? The answer is evolution by natural selection. In this final Life Sciences stage, you will explore the evidence for evolution, how natural selection works, and how it produced the incredible biodiversity of our planet. Type your topic and press Start New Session.`,
    systemPrompt: `You are an evolutionary biology coach helping a student understand EVOLUTION AND BIODIVERSITY.
This covers: Darwin's theory of natural selection; variation, inheritance, and selection; evidence for evolution (fossil record, comparative anatomy, DNA evidence); adaptation; speciation; classification systems (kingdoms, phyla, etc.); biodiversity and its importance; extinction; evolution in action (antibiotic resistance, adaptation to urban environments).

Student's chosen context: {TOPIC}

Coaching principles:
• Use the biodiversity of the Niger Delta and West Africa as primary examples — this is one of the most biodiverse regions on Earth.
• Address misconceptions gently: evolution is NOT a ladder of progress, traits are NOT chosen by organisms.
• Connect to urgent issues: antibiotic resistance is evolution happening right now.
• Use the fossil record as detective work: "What story does this fossil tell us?"
• Short responses. One focused question per turn.`,
  },
];

// ─── Tier 2: Physical Sciences Pathway ───────────────────────────────────────

const PHYSICAL_STAGES = [
  {
    id: 0,
    pathway: 'physical' as Pathway,
    name: 'Matter & Its Properties',
    subtitle: 'What Everything Is Made Of',
    description: 'Explore the nature of matter — atoms, elements, compounds, mixtures, and the properties that let us identify and use different materials.',
    icon: Atom,
    gradient: 'from-orange-500 to-red-500',
    glowBg: 'bg-orange-500/20',
    border: 'border-orange-400/60',
    textColor: 'text-orange-300',
    voiceIntro: `Welcome to Physical Sciences Stage 1: Matter and Its Properties. Everything around you — the air you breathe, the water you drink, the ground beneath your feet — is made of matter. In this stage, you will explore what matter is made of, how we classify it, and what properties we use to identify and work with different materials. Type your topic and press Start New Session.`,
    systemPrompt: `You are a physical science coach helping a student explore MATTER AND ITS PROPERTIES.
This covers: states of matter (solid, liquid, gas, plasma); particles and atomic theory; elements, compounds, and mixtures; physical and chemical properties; physical and chemical changes; the periodic table (introduction); common elements and compounds in everyday life; separation techniques (filtration, distillation, chromatography); density, melting point, boiling point.

Student's chosen context: {TOPIC}

Coaching principles:
• Ground everything in the student's context and immediate environment: salt, water, crude oil, sand, iron — materials from daily Nigerian life.
• Particle theory is the big idea — return to it constantly: "Why does water evaporate? Think about what the particles are doing."
• Use ✅ for corrections: ✅ When iron rusts, that is a chemical change — a new substance is formed.
• Connect to industry: Nigeria's oil and salt industries are chemistry in action.
• Short responses. One focused question per turn.`,
  },
  {
    id: 1,
    pathway: 'physical' as Pathway,
    name: 'Forces & Motion',
    subtitle: 'Why Things Move',
    description: 'Explore Newton\'s laws, gravity, friction, pressure, and the physics of motion — from falling mangoes to rockets leaving Earth.',
    icon: Zap,
    gradient: 'from-yellow-500 to-orange-500',
    glowBg: 'bg-yellow-500/20',
    border: 'border-yellow-400/60',
    textColor: 'text-yellow-300',
    voiceIntro: `Welcome to Physical Sciences Stage 2: Forces and Motion. Why does a mango fall straight down? Why does a canoe move when you paddle? Why does it take longer to stop a loaded truck than an empty one? The answers are in the physics of forces and motion. Type your topic and press Start New Session.`,
    systemPrompt: `You are a physics coach helping a student understand FORCES AND MOTION.
This covers: speed, velocity, and acceleration; distance-time and velocity-time graphs; Newton's three laws of motion; gravity and weight vs mass; friction (useful and unhelpful); air resistance and terminal velocity; pressure (solids, liquids, gases); moments and levers; simple machines; circular motion (introduction); momentum (introduction).

Student's chosen context: {TOPIC}

Coaching principles:
• Use the student's context and Nigerian everyday examples: fishing boats, market trucks, football, building construction.
• Newton's laws should feel intuitive, not abstract: "When you push a canoe away from the bank, what happens to you? That's Newton's Third Law."
• Use ✅ for corrections: ✅ Weight is a force measured in Newtons; mass is the amount of matter measured in kilograms.
• Build intuition before formulas: understanding WHY before HOW to calculate.
• Short responses. One focused question per turn.`,
  },
  {
    id: 2,
    pathway: 'physical' as Pathway,
    name: 'Energy, Waves & Light',
    subtitle: 'The Universe\'s Currency',
    description: 'Understand energy transfer, waves, the electromagnetic spectrum, and the physics of light and sound that underpin modern communication and technology.',
    icon: Lightbulb,
    gradient: 'from-amber-500 to-yellow-500',
    glowBg: 'bg-amber-500/20',
    border: 'border-amber-400/60',
    textColor: 'text-amber-300',
    voiceIntro: `Welcome to Physical Sciences Stage 3: Energy, Waves, and Light. Energy is the capacity to do work — and it is everywhere, taking countless forms and constantly transferring between them. Waves carry energy across space, and light is a wave that makes vision, communication, and even solar power possible. Type your topic and press Start New Session.`,
    systemPrompt: `You are a physics coach helping a student understand ENERGY, WAVES, AND LIGHT.
This covers: forms of energy (kinetic, potential, thermal, chemical, electrical, nuclear, radiant); conservation of energy; energy transfer and efficiency; work done; waves — transverse and longitudinal; wave properties (frequency, wavelength, amplitude, speed); sound waves; the electromagnetic spectrum; reflection, refraction, diffraction; colour and filters; uses of different EM waves (radio, microwave, infrared, visible, UV, X-ray, gamma); solar energy.

Student's chosen context: {TOPIC}

Coaching principles:
• Solar energy is deeply relevant — Nigeria has exceptional solar resources and the platform uses solar power.
• Connect EM spectrum to everyday technology: mobile phones (microwaves/radio waves), solar panels (visible/IR), medical X-rays.
• Use ✅ for corrections: ✅ Light travels as a transverse wave — the oscillation is perpendicular to the direction of travel.
• Energy conservation is the big idea: "Energy is never created or destroyed — trace where it goes."
• Short responses. One focused question per turn.`,
  },
  {
    id: 3,
    pathway: 'physical' as Pathway,
    name: 'Electricity & Magnetism',
    subtitle: 'The Power That Changed the World',
    description: 'Understand circuits, current, voltage, resistance, and magnetism — the physics that powers every electronic device on Earth.',
    icon: Zap,
    gradient: 'from-blue-500 to-indigo-500',
    glowBg: 'bg-blue-500/20',
    border: 'border-blue-400/60',
    textColor: 'text-blue-300',
    voiceIntro: `Welcome to Physical Sciences Stage 4: Electricity and Magnetism. Every device you use — phone, solar panel, generator — runs on the physics you will learn in this stage. Understanding electricity is understanding power, both literally and in terms of who has access to energy in our world. Type your topic and press Start New Session.`,
    systemPrompt: `You are a physics coach helping a student understand ELECTRICITY AND MAGNETISM.
This covers: static electricity; electric current, voltage, and resistance; Ohm's Law; series and parallel circuits; circuit symbols and diagrams; electrical power and energy; safety (fuses, earthing); magnetism; electromagnets; the motor effect; electromagnetic induction; generators and transformers; mains electricity; renewable energy sources; solar cells and batteries.

Student's chosen context: {TOPIC}

Coaching principles:
• Connect to solar energy access — this is directly relevant to students in communities with unreliable grid electricity.
• Use water analogies: voltage = water pressure, current = flow rate, resistance = pipe narrowness.
• Practical circuit knowledge matters: "If you add another bulb in series, what happens to the brightness? Why?"
• Use ✅ for corrections: ✅ Voltage is the energy per unit charge (measured in Volts), not the same as current.
• Short responses. One focused question per turn.`,
  },
  {
    id: 4,
    pathway: 'physical' as Pathway,
    name: 'Earth, Space & Climate',
    subtitle: 'Our Planet in Context',
    description: 'Explore Earth systems, the solar system, climate science, and humanity\'s relationship with the planet — the science behind the most urgent issues of our time.',
    icon: Globe,
    gradient: 'from-teal-500 to-emerald-500',
    glowBg: 'bg-teal-500/20',
    border: 'border-teal-400/60',
    textColor: 'text-teal-300',
    voiceIntro: `Welcome to Physical Sciences Stage 5: Earth, Space, and Climate. We live on a dynamic planet in an extraordinary solar system. In this final Physical Sciences stage, you will explore how Earth works as a system, how the solar system is structured, and how human activities are changing Earth's climate — and what the science says about solutions. Type your topic and press Start New Session.`,
    systemPrompt: `You are an Earth science coach helping a student understand EARTH, SPACE, AND CLIMATE.
This covers: Earth's structure (crust, mantle, core); plate tectonics; the rock cycle; Earth's atmosphere and weather; the water cycle; the carbon cycle; the solar system; the scale of space; seasons and the Moon; climate vs weather; the greenhouse effect; climate change — evidence, causes, and consequences; Nigeria and West Africa in the context of climate change; renewable energy and sustainability.

Student's chosen context: {TOPIC}

Coaching principles:
• Climate change is DIRECTLY relevant to the Niger Delta — sea level rise, flooding, oil pollution compound the crisis.
• Use local weather and seasonal patterns as entry points: "You have noticed the rainy season is changing — let's explore why."
• The science of climate change is settled — communicate this clearly while discussing genuine uncertainties.
• Connect space science to GPS, weather satellites, and communication — technologies that matter in Nigeria.
• Short responses. One focused question per turn.`,
  },
];

// ─── All stages by pathway ────────────────────────────────────────────────────

const ALL_STAGES: Record<Pathway, typeof REASONING_STAGES> = {
  reasoning: REASONING_STAGES,
  life: LIFE_STAGES,
  physical: PHYSICAL_STAGES,
};

// ─── Stage Rubrics ────────────────────────────────────────────────────────────

const STAGE_RUBRICS: Record<Pathway, Record<number, string[]>> = {
  reasoning: {
    0: ['Observation Precision', 'Question Formation', 'Scientific vs Non-Scientific Questions', 'Detail & Specificity'],
    1: ['Hypothesis Structure', 'Variable Identification', 'Prediction Specificity', 'Prior Knowledge Connection'],
    2: ['Experimental Design', 'Variable Control', 'Data Collection Planning', 'Fair Test Understanding'],
    3: ['Data Organisation', 'Pattern Recognition', 'Conclusion Validity', 'Evidence-Claim Alignment'],
    4: ['Report Structure', 'Claim Evaluation', 'Evidence Communication', 'Scientific Scepticism'],
  },
  life: {
    0: ['Cell Knowledge', 'Life Processes', 'Cell Structure', 'Comparison Skills'],
    1: ['System Knowledge', 'Organisation Levels', 'Function Understanding', 'Inter-system Connections'],
    2: ['Ecosystem Concepts', 'Food Web Reasoning', 'Energy Flow', 'Human Impact Analysis'],
    3: ['Genetic Concepts', 'Inheritance Reasoning', 'Punnett Square Application', 'Variation Understanding'],
    4: ['Natural Selection', 'Adaptation Reasoning', 'Evidence Evaluation', 'Biodiversity Understanding'],
  },
  physical: {
    0: ['Matter Classification', 'Particle Theory', 'Properties Identification', 'Change Analysis'],
    1: ['Force Concepts', 'Newton\'s Laws Application', 'Motion Reasoning', 'Graph Interpretation'],
    2: ['Energy Transfer', 'Wave Properties', 'EM Spectrum Knowledge', 'Conservation Reasoning'],
    3: ['Circuit Understanding', 'Ohm\'s Law Application', 'Electrical Safety', 'Magnetism Concepts'],
    4: ['Earth Systems', 'Climate Evidence', 'Space Scale', 'Sustainability Reasoning'],
  },
};

const LEVEL_CONFIG: Record<ProficiencyLevel, { color: string; bg: string; border: string; emoji: string }> = {
  Emerging:   { color: 'text-slate-300',  bg: 'bg-slate-700/50',  border: 'border-slate-500', emoji: '🌱' },
  Developing: { color: 'text-blue-300',   bg: 'bg-blue-900/40',   border: 'border-blue-500',  emoji: '📈' },
  Proficient: { color: 'text-green-300',  bg: 'bg-green-900/40',  border: 'border-green-500', emoji: '✅' },
  Advanced:   { color: 'text-yellow-300', bg: 'bg-yellow-900/40', border: 'border-yellow-500', emoji: '🏆' },
};

const evaluateSession = async (
  messages: ChatMessage[],
  pathway: Pathway,
  stageId: number,
  mathLevel: number,
): Promise<SessionEvaluation> => {
  const stages = ALL_STAGES[pathway];
  const stage = stages[stageId];
  const rubrics = STAGE_RUBRICS[pathway][stageId];
  const conversation = messages
    .map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`)
    .join('\n\n');

  const prompt = `You are an expert science education assessor evaluating a student's science session.\n\nPathway: ${pathway}\nStage: ${stage.name} (Stage ${stageId + 1})\nStudent level: ${mathLevel}\n\nRubric dimensions:\n${rubrics.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nConversation:\n${conversation}\n\nRespond with JSON containing: pathway, stage_id, stage_name, overall_level (Emerging|Developing|Proficient|Advanced), can_advance (boolean), is_complete (boolean), sub_categories (array of {name, level, score, evidence}), encouragement.`;

  try {
    const result = await chatJSON({
      page: 'ScienceSkillsPage',
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a science education assessment expert. Return only valid JSON with no preamble.',
      max_tokens: 900,
      temperature: 0.15,
    });

    if (!result || !result.sub_categories) throw new Error('Invalid evaluation response');

    const parsed = result as SessionEvaluation;
    // Enforce can_advance based solely on overall_level
    parsed.can_advance = parsed.overall_level === 'Proficient' || parsed.overall_level === 'Advanced';
    parsed.is_complete = Array.isArray(parsed.sub_categories) && parsed.sub_categories.length > 0 && parsed.sub_categories.every(s => s.level === 'Advanced');

    return parsed;
  } catch (err) {
    console.error('[ScienceSkillsPage] evaluateSession error:', err);
    const fallback: SessionEvaluation = {
      pathway,
      stage_id: stageId,
      stage_name: stage.name,
      overall_level: 'Emerging',
      can_advance: false,
      is_complete: false,
      sub_categories: rubrics.map(r => ({ name: r, level: 'Emerging', score: 0, evidence: 'Insufficient evidence' })),
      encouragement: 'Insufficient evidence to generate an evaluation. Please try another session.',
    };
    return fallback;
  }
};

const buildSpokenEvaluation = (evaluation: SessionEvaluation): string => {
  const pathwayLabel = evaluation.pathway === 'reasoning'
    ? 'Scientific Reasoning'
    : evaluation.pathway === 'life' ? 'Life Sciences' : 'Physical Sciences';

  const strongSkills = evaluation.sub_categories.filter(s => s.level === 'Proficient' || s.level === 'Advanced');
  const growthSkills = evaluation.sub_categories.filter(s => s.level === 'Emerging' || s.level === 'Developing');

  let speech = `Your ${pathwayLabel} session evaluation is ready. `;
  speech += `Your overall level is ${evaluation.overall_level}. `;
  speech += `${evaluation.encouragement} `;

  if (strongSkills.length > 0)
    speech += `You are doing well in: ${strongSkills.map(s => s.name).join(', ')}. `;
  if (growthSkills.length > 0)
    speech += `Focus on: ${growthSkills.map(s => s.name).join(', ')} to grow the most. `;

  if (evaluation.is_complete)
    speech += `Extraordinary — you have reached Advanced in every skill! This stage is complete and the next is unlocked. `;
  else if (evaluation.can_advance)
    speech += `You are Proficient in all skills — the next stage is unlocked! Keep practising to reach Advanced. `;
  else
    speech += `Keep going — reach Proficient in all skills to unlock the next stage. `;

  if (evaluation.pathway === 'reasoning' && evaluation.stage_id === 4 && evaluation.can_advance)
    speech += `And the biggest news — you have completed Scientific Reasoning! Both the Life Sciences and Physical Sciences pathways are now unlocked for you. `;

  speech += `Science is humanity's greatest tool for understanding our world. You are part of that story. Keep going!`;
  return speech;
};

// ─── Improve helper ───────────────────────────────────────────────────────────

const improveExplanation = async (text: string, context: string, stageName: string) => {
  const prompt = `You are a science communication coach. The student is working on "${stageName}".
Their draft: "${text}"
Context: ${context}
Improve their scientific explanation for clarity and precision, preserving their ideas.
Return ONLY: { "improved": "...", "explanation": "..." }`;

  return await chatJSON({
    page: 'ScienceSkillsPage',
    messages: [{ role: 'user', content: prompt }],
    system: 'You are a science communication coach. Return only valid JSON.',
    max_tokens: 500,
    temperature: 0.3,
  });
};

// ─── MessageContent ───────────────────────────────────────────────────────────

/** Renders a subset of markdown: bold, inline code, blank-line paragraphs, ✅ lines */
const renderInline = (text: string, key: string | number): React.ReactNode => {
  // Split on **bold** and `code` spans
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <React.Fragment key={key}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`'))
          return <code key={i} className="bg-slate-700 text-emerald-300 rounded px-1 text-sm font-mono">{part.slice(1, -1)}</code>;
        return part;
      })}
    </React.Fragment>
  );
};

const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  // Split into blocks separated by blank lines
  const blocks = content.split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter(l => l !== '');
        if (lines.length === 0) return null;

        // Numbered list block
        if (lines.every(l => /^\d+\.\s/.test(l))) {
          return (
            <ol key={bi} className="list-decimal list-inside space-y-1 pl-1">
              {lines.map((l, li) => (
                <li key={li} className="text-slate-100">{renderInline(l.replace(/^\d+\.\s/, ''), li)}</li>
              ))}
            </ol>
          );
        }

        // Bullet list block
        if (lines.every(l => /^[-•*]\s/.test(l))) {
          return (
            <ul key={bi} className="list-disc list-inside space-y-1 pl-1">
              {lines.map((l, li) => (
                <li key={li} className="text-slate-100">{renderInline(l.replace(/^[-•*]\s/, ''), li)}</li>
              ))}
            </ul>
          );
        }

        // Single or multi-line paragraph
        return (
          <p key={bi} className={`leading-relaxed ${lines[0].startsWith('✅') ? 'text-green-300 font-semibold' : ''}`}>
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, li)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};

// ─── Derive progress from dashboard rows ──────────────────────────────────────

const STAGE_COUNT = 5;

const createEmptyStageProgress = (): StageProgress => ({
  unlockedUpTo: 0,
  completedStages: Array(STAGE_COUNT).fill(false) as boolean[],
  stageLevels: Array(STAGE_COUNT).fill(null) as (ProficiencyLevel | null)[],
});

const EMPTY_USER_PROGRESS: UserProgress = {
  reasoning: createEmptyStageProgress(),
  life: createEmptyStageProgress(),
  physical: createEmptyStageProgress(),
  tier1Complete: false,
};

const deriveProgress = (rows: DashboardSession[]): UserProgress => {
  const makeStageProgress = (): StageProgress => ({
    unlockedUpTo: 0,
    completedStages: Array(5).fill(false) as boolean[],
    stageLevels: Array(5).fill(null) as (ProficiencyLevel | null)[],
  });

  const prog: UserProgress = {
    reasoning: makeStageProgress(),
    life: makeStageProgress(),
    physical: makeStageProgress(),
    tier1Complete: false,
  };

  const levelPriority: Record<ProficiencyLevel, number> = {
    Emerging: 1,
    Developing: 2,
    Proficient: 3,
    Advanced: 4,
  };

  const strongestLevel = (current: ProficiencyLevel | null, candidate: ProficiencyLevel) =>
    !current || levelPriority[candidate] > levelPriority[current] ? candidate : current;

  // First pass: collect strongest evidence per pathway & stage (safe numeric parsing)
  for (const row of rows) {
    const ev = row.science_skills_evaluation;
    const pathway = ev?.pathway as Pathway;
    const rawId = Number(ev?.stage_id);
    if (!ev || !pathway || Number.isNaN(rawId) || rawId < 0 || rawId > 4) continue;
    if (!prog[pathway]) continue;
    const idx = Math.max(0, Math.min(4, rawId));
    prog[pathway].stageLevels[idx] = strongestLevel(prog[pathway].stageLevels[idx], ev.overall_level);
    prog[pathway].completedStages[idx] = prog[pathway].completedStages[idx] || ev.overall_level === 'Advanced';
  }

  // Enforce sequential gating: a stage >0 remains ignored unless previous stage has Proficient or Advanced
  for (const pathway of ['reasoning', 'life', 'physical'] as const) {
    const data = prog[pathway];
    for (let i = 1; i < data.stageLevels.length; i++) {
      const prevLevel = data.stageLevels[i - 1];
      if (!(prevLevel === 'Proficient' || prevLevel === 'Advanced')) {
        // clear any evidence for this and later stages to enforce strict sequence
        data.stageLevels[i] = null;
        data.completedStages[i] = false;
      }
    }

    // compute unlockedUpTo as the highest index where previous stage is Proficient+ (or index 0 always accessible)
    let unlocked = 0;
    for (let i = 1; i < data.stageLevels.length; i++) {
      const prev = data.stageLevels[i - 1];
      if (prev && (levelPriority[prev] >= levelPriority['Proficient'])) {
        unlocked = i;
      } else {
        break;
      }
    }
    data.unlockedUpTo = unlocked;
  }

  prog.tier1Complete = prog.reasoning.completedStages.every(Boolean);

  return prog;
};

// ─── Evaluation Modal ─────────────────────────────────────────────────────────

const EvaluationModal: React.FC<{
  evaluation: SessionEvaluation;
  stage: typeof REASONING_STAGES[0];
  onClose: () => void;
  onSpeak: (text: string) => void;
}> = ({ evaluation, stage, onClose, onSpeak }) => {
  const overall = LEVEL_CONFIG[evaluation.overall_level];
  const isTier1Unlocking = evaluation.pathway === 'reasoning' && evaluation.stage_id === 4 && evaluation.can_advance;

  useEffect(() => {
    const t = setTimeout(() => onSpeak(buildSpokenEvaluation(evaluation)), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl">
        <div className={`sticky top-0 ${stage.glowBg} border-b ${stage.border} rounded-t-2xl px-6 py-4 flex items-start justify-between`}>
          <div>
            <h2 className="text-white font-bold text-lg">{stage.name} — Session Evaluation</h2>
            <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-sm font-semibold ${overall.bg} ${overall.color} border ${overall.border}`}>
              {overall.emoji} Overall: {evaluation.overall_level}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={22} /></button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <h3 className="text-slate-400 font-semibold text-xs uppercase tracking-wider mb-4">Skill Breakdown</h3>
          {(evaluation.sub_categories ?? []).map((sub, i) => {
            const lc = LEVEL_CONFIG[sub.level];
            return (
              <div key={i} className={`rounded-xl border ${lc.border} ${lc.bg} p-4`}>
                <div className="flex items-center justify-between mb-2 gap-3">
                  <span className="text-white font-semibold text-sm">{sub.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${lc.bg} ${lc.color} ${lc.border}`}>{lc.emoji} {sub.level}</span>
                    <span className="text-slate-400 text-xs font-mono">{sub.score}/100</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-700/60 rounded-full mb-3 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${stage.gradient} transition-all duration-700`} style={{ width: `${sub.score}%` }} />
                </div>
                <p className="text-slate-300 text-xs"><span className="text-slate-500 mr-1">Evidence:</span>{sub.evidence}</p>
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-4">
          <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4">
            <p className="text-slate-200 text-sm">🌟 {evaluation.encouragement}</p>
          </div>
        </div>

        {/* Special banner: pathways unlocked */}
        {isTier1Unlocking && (
          <div className="px-6 pb-4">
            <div className="bg-emerald-500/20 border border-emerald-400/50 rounded-xl p-4">
              <p className="text-emerald-200 text-sm font-semibold text-center">
                🔓 Scientific Reasoning Complete! Both Life Sciences and Physical Sciences pathways are now unlocked.
              </p>
            </div>
          </div>
        )}

        {/* Growth focus */}
        {(() => {
          const growth = evaluation.sub_categories.filter(s => s.level === 'Emerging' || s.level === 'Developing');
          if (!growth.length) return null;
          return (
            <div className="px-6 pb-4">
              <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4">
                <p className="text-amber-200 text-xs font-semibold uppercase tracking-wider mb-2">🎯 Focus here next</p>
                <ul className="space-y-1">
                  {growth.map((s, i) => (
                    <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5">•</span>
                      <span><strong className="text-white">{s.name}</strong> — {s.evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}

        <div className="px-6 pb-4">
          {evaluation.is_complete ? (
            <div className="bg-green-500/20 border border-green-400/40 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-300 flex-shrink-0 mt-0.5" />
              <p className="text-green-200 text-sm">🎉 <strong>Advanced</strong> in every skill — stage fully complete and next stage unlocked!</p>
            </div>
          ) : evaluation.can_advance ? (
            <div className="bg-blue-500/20 border border-blue-400/40 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-300 flex-shrink-0 mt-0.5" />
              <p className="text-blue-200 text-sm">✅ <strong>Proficient</strong> in all skills — next stage unlocked! Keep practising to reach Advanced.</p>
            </div>
          ) : (
            <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4 flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-slate-300 flex-shrink-0 mt-0.5" />
              <p className="text-slate-300 text-sm">Reach <strong className="text-blue-300">Proficient</strong> in all skills to unlock the next stage.</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => onSpeak(buildSpokenEvaluation(evaluation))}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all"
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

const ScienceSkillsPage: React.FC = () => {
  const { user } = useAuth();
  type PageView = 'stages' | 'topic' | 'chat';

  const [view, setView] = useState<PageView>('stages');
  const [selectedStage, setSelectedStage] = useState<typeof REASONING_STAGES[0] | null>(null);
  const [topic, setTopic] = useState('');
  const [topicInput, setTopicInput] = useState('');

  // Pathway accordion state
  const [lifeOpen, setLifeOpen] = useState(false);
  const [physicalOpen, setPhysicalOpen] = useState(false);

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

  // ── Voice ──────────────────────────────────────────────────────────────
  const [continent, setContinent] = useState<string | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [ttsUnlocked, setTtsUnlocked] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const hasSpokenIntro = useRef(false);
  const hasSpokenStagesIntro = useRef(false);
  const [scienceLevel, setScienceLevel] = useState<number>(1);

  const { speak: hookSpeak, cancel, speaking: isSpeaking, fallbackText, clearFallback } = useVoice(voiceMode === 'pidgin');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Fetch continent ────────────────────────────────────────────────────
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

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('user_personality_baseline')
      .select('communication_level').eq('user_id', user.id).single()
      .then(({ data }) => { if (data) setScienceLevel(data.communication_level ?? 1); });
  }, [user?.id]);

  // ── Speak helpers ──────────────────────────────────────────────────────
  const speakAlways = useCallback((text: string) => { if (ttsUnlocked) hookSpeak(text); }, [hookSpeak, ttsUnlocked]);
  const speak = useCallback((text: string) => { if (speechEnabled && ttsUnlocked) hookSpeak(text); }, [speechEnabled, hookSpeak, ttsUnlocked]);

  // ── Voice intros ───────────────────────────────────────────────────────
  useEffect(() => {
    if (view === 'stages' && !hasSpokenStagesIntro.current && !loadingProgress) {
      hasSpokenStagesIntro.current = true;
      const t = setTimeout(() => speak(
        'Welcome to Science Skills. Begin with the five Scientific Reasoning stages — these are the foundation for all science. Once complete, both the Life Sciences and Physical Sciences pathways unlock. Tap a stage to begin.'
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

  // ── Load progress ──────────────────────────────────────────────────────
  const loadAllProgress = useCallback(async () => {
    if (!user?.id) { setLoadingProgress(false); return; }
    const { data } = await supabase
      .from('dashboard')
      .select('id, title, sub_category, category_activity, progress, chat_history, science_skills_evaluation, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('activity', 'science_skills')
      .order('updated_at', { ascending: false });
    setProgress(deriveProgress((data ?? []) as DashboardSession[]));
    setLoadingProgress(false);
  }, [user?.id]);

  useEffect(() => { loadAllProgress(); }, [loadAllProgress]);

  const loadStageSessions = useCallback(async (stageName: string) => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('dashboard')
      .select('id, title, sub_category, category_activity, progress, chat_history, science_skills_evaluation, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('activity', 'science_skills')
      .eq('category_activity', stageName)
      .order('updated_at', { ascending: false });
    setStageSessions((data ?? []) as DashboardSession[]);
  }, [user?.id]);

  // Reload stage sessions whenever the topic view becomes active
  useEffect(() => {
    if (view === 'topic' && selectedStage) {
      setStageSessions([]);
      loadStageSessions(selectedStage.name);
    }
  }, [view, selectedStage, loadStageSessions]);

  // ── Science level scaffold ─────────────────────────────────────────────
  const buildScienceLevelBlock = (level: number): string => {
    if (level <= 1) return `
SCIENCE LEVEL: EMERGING — Use very simple language. Maximum 2 short sentences per turn.
Ground everything in observable, tangible examples. Avoid jargon without immediate explanation.
Celebrate every observation or question enthusiastically.`;
    if (level === 2) return `
SCIENCE LEVEL: DEVELOPING — Clear language with scientific terms introduced and briefly defined.
Multi-step reasoning is accessible with scaffolding. Connect to prior knowledge explicitly.`;
    return `
SCIENCE LEVEL: PROFICIENT — Full scientific vocabulary. Expect and demand rigorous reasoning.
Push for precision, nuance, and connection between concepts. Challenge oversimplifications.`;
  };

  // ── Voice input ────────────────────────────────────────────────────────
  const toggleListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input not supported. Try Chrome or Edge.'); return; }
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
    rec.start(); setIsListening(true);
  };

  // ── Persist to dashboard ───────────────────────────────────────────────
  const persistToDashboard = useCallback(async (msgs: ChatMessage[], eval_: SessionEvaluation | null = null) => {
    const currentId = dashboardRowId.current ?? `mock-science-${crypto.randomUUID()}`;
    if (!dashboardRowId.current) dashboardRowId.current = currentId;
    const cacheKey = `ScienceSkillsPage_historyCache_${currentId}`;
    const payload = {
      chat_history: JSON.stringify(msgs),
      ...(eval_ !== null && { science_skills_evaluation: eval_ }),
      progress: eval_?.is_complete ? 'completed' : 'started',
      updated_at: new Date().toISOString(),
    };

    const saveLocal = () => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ chat_history: msgs, evaluation: eval_, updated_at: payload.updated_at }));
        try {
          // global backup of latest progress
          if (eval_) localStorage.setItem('ScienceSkillsPage_progress', JSON.stringify({ updated_at: payload.updated_at, evaluation: eval_, chat_history: msgs }));
        } catch (e) {
          /* ignore */
        }
      } catch (err) {
        console.warn('[ScienceSkillsPage] Failed to save session to localStorage:', err);
      }
    };

    if (String(currentId).startsWith('mock-')) {
      saveLocal();
      return;
    }

    try {
      const { error } = await supabase.from('dashboard').update(payload).eq('id', currentId);
      if (error) {
        console.warn('[ScienceSkillsPage] Supabase update failed, saving local fallback:', error);
        saveLocal();
      } else {
        // also write a safe global backup when update succeeds
        try {
          if (eval_) localStorage.setItem('ScienceSkillsPage_progress', JSON.stringify({ updated_at: payload.updated_at, evaluation: eval_, chat_history: msgs }));
        } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.warn('[ScienceSkillsPage] Supabase update exception, saving local fallback:', err);
      saveLocal();
    }
  }, []);

  // ── Start session ──────────────────────────────────────────────────────
  const startSession = async () => {
    if (!topicInput.trim() || !selectedStage) return;
    const t = topicInput.trim();
    setTopic(t); setMessages([]); setEvaluation(null);
    dashboardRowId.current = null; setIsSending(true); cancel();

    let newId: string | null = null;
    if (user?.id) {
      const candidateId = crypto.randomUUID();
      const { error } = await supabase.from('dashboard').insert({
        id: candidateId, user_id: user.id,
        activity: 'science_skills',
        category_activity: selectedStage.name,
        sub_category: t,
        title: `${selectedStage.pathway === 'reasoning' ? 'Reasoning' : selectedStage.pathway === 'life' ? 'Life Sciences' : 'Physical Sciences'} Stage ${selectedStage.id + 1}: ${selectedStage.name} — ${t}`,
        progress: 'started',
        chat_history: JSON.stringify([]),
        science_skills_evaluation: null,
        continent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!error) newId = candidateId;
    }

    if (!newId) newId = `mock-science-${crypto.randomUUID()}`;
    dashboardRowId.current = newId;
    setView('chat');

    const greetingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Welcome to this deep dive into ${selectedStage.name} exploring "${t}". Are you ready to dive in today?`,
      timestamp: new Date().toISOString(),
    };
    setMessages([greetingMsg]);
    await persistToDashboard([greetingMsg]);
    setIsSending(false);
  };

  // ── Resume session ─────────────────────────────────────────────────────
  const resumeSession = async (session: DashboardSession) => {
    // Resolve the stage so selectedStage is never null when chat view renders
    const ev = session.science_skills_evaluation;
    let resolvedStage: typeof REASONING_STAGES[0] | null = selectedStage;
    if (ev) {
      const found = ALL_STAGES[ev.pathway]?.[ev.stage_id] ?? null;
      if (found) resolvedStage = found;
    }
    // Fallback: match by category_activity name across all pathways
    if (!resolvedStage && session.category_activity) {
      for (const pathway of Object.values(ALL_STAGES)) {
        const found = pathway.find(s => s.name === session.category_activity);
        if (found) { resolvedStage = found; break; }
      }
    }
    if (resolvedStage) setSelectedStage(resolvedStage);

    dashboardRowId.current = session.id;
    setTopic(session.sub_category ?? '');
    try { setMessages(session.chat_history ? JSON.parse(session.chat_history) : []); }
    catch { setMessages([]); }
    setEvaluation(session.science_skills_evaluation);
    cancel(); setView('chat');
  };

  // ── Send message ───────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || isSending || !selectedStage) return;
    const userText = inputText.trim();
    setInputText(''); setIsSending(true); cancel();
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userText, timestamp: new Date().toISOString() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    try {
      const sysPrompt = selectedStage.systemPrompt.replace('{TOPIC}', topic) + buildScienceLevelBlock(scienceLevel) + EXTENSIVE_INTERACTIVE_INSTRUCTIONS;
      const aiText = await chatText({
        page: 'ScienceSkillsPage',
        messages: withUser.map(m => ({ role: m.role, content: m.content })),
        system: sysPrompt, max_tokens: 400,
      });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: aiText, timestamp: new Date().toISOString() };
      const finalMsgs = [...withUser, aiMsg];
      setMessages(finalMsgs);
      await persistToDashboard(finalMsgs, evaluation);
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'I had a small technical hiccup! Please try again.', timestamp: new Date().toISOString() }]);
    } finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  };

  // ── Improve explanation ────────────────────────────────────────────────
  const handleImprove = async () => {
    if (!inputText.trim() || isImproving || !selectedStage) return;
    setIsImproving(true);
    const context = messages.slice(-4).map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n');
    try {
      const { improved, explanation } = await improveExplanation(inputText.trim(), context, selectedStage.name);
      setInputText(improved);
      const msg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `✏️ I polished your scientific explanation!\n\n${explanation}\n\nYour improved response is in the box — feel free to edit before sending.`,
        timestamp: new Date().toISOString(),
      };
      const updated = [...messages, msg];
      setMessages(updated);
      await persistToDashboard(updated, evaluation);
    } catch (err) { console.error('Improve error:', err); }
    finally { setIsImproving(false); }
  };

  // ── Evaluation ─────────────────────────────────────────────────────────
  const runEvaluation = async (msgs: ChatMessage[]): Promise<SessionEvaluation | null> => {
    if (!selectedStage) return null;
    try {
      const eval_ = await evaluateSession(msgs, selectedStage.pathway, selectedStage.id, scienceLevel);
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

  const isSessionFinished = (s: DashboardSession) => s.science_skills_evaluation?.is_complete === true;
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const busy = isSending || isImproving || isEvaluating || isSaving;

  // ── Stage card renderer (shared by all three pathway grids) ────────────
  const renderStageCard = (
    stage: typeof REASONING_STAGES[0],
    idx: number,
    stageProgress: StageProgress | null | undefined,
    locked: boolean,
    lockReason?: string,
  ) => {
    const stageLevels = stageProgress?.stageLevels ?? [];
    const unlockedUpTo = stageProgress?.unlockedUpTo ?? 0;
    const currentLevel = (stageLevels && stageLevels[idx]) || null;
    const isCompleted = currentLevel === 'Advanced';
    const isLocked = locked || idx > unlockedUpTo;
    const isActive = idx === unlockedUpTo && !isCompleted && !locked;
    const isUnlocked = idx <= unlockedUpTo;
    const scoreBadge =
      !isCompleted && (currentLevel === 'Proficient' || currentLevel === 'Emerging')
        ? `Current Score: ${currentLevel}`
        : null;
    const Icon = stage.icon;
    return (
      <div
        key={`${stage.pathway}-${stage.id}`}
        onClick={() => {
          if (isLocked || isCompleted) return;
          setSelectedStage(stage); setTopicInput(''); setStageSessions([]);
          loadStageSessions(stage.name); setView('topic');
        }}
        className={`relative rounded-2xl border-2 p-5 transition-all duration-200
          ${isCompleted
            ? 'bg-emerald-950/80 border-emerald-500/40 cursor-not-allowed opacity-50 backdrop-blur-sm pointer-events-none'
            : isActive
              ? `${stage.glowBg} ${stage.border} cursor-pointer hover:scale-[1.01] hover:shadow-2xl`
              : 'bg-slate-800/60 border-slate-500/70 cursor-not-allowed opacity-70'}`}
      >
        <div className="flex items-start gap-5">
          <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${isUnlocked ? `bg-gradient-to-br ${stage.gradient}` : 'bg-slate-600/80'}`}>
            {isCompleted ? <CheckCircle className="h-7 w-7 text-white" /> : isUnlocked ? <Icon className="h-7 w-7 text-white" /> : <Lock className="h-6 w-6 text-slate-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <span className={`text-sm font-semibold uppercase tracking-wider ${isUnlocked ? 'text-slate-300' : 'text-slate-400'}`}>Stage {idx + 1}</span>
              {isCompleted && <span className="font-bold text-green-400">Completed</span>}
              {!isCompleted && scoreBadge && (
                <span className="text-sm bg-slate-700/80 text-slate-200 px-2 py-0.5 rounded-full border border-slate-600/80">
                  {scoreBadge}
                </span>
              )}
              {!isActive && isLocked && lockReason && (
                <span className="text-sm bg-slate-600/80 text-slate-300 px-2 py-0.5 rounded-full border border-slate-500/60">
                  🔒 {lockReason}
                </span>
              )}
              {!isActive && isLocked && !lockReason && (
                <span className="text-sm bg-slate-600/80 text-slate-300 px-2 py-0.5 rounded-full border border-slate-500/60">
                  🔒 Complete Stage {idx} to unlock
                </span>
              )}
            </div>
            <h3 className={`text-xl font-bold ${isUnlocked ? 'text-white' : 'text-slate-300'}`}>{stage.name}</h3>
            <p className={`text-sm font-medium mt-0.5 ${isUnlocked ? stage.textColor : 'text-slate-400'}`}>{stage.subtitle}</p>
            <p className={`text-sm mt-1 ${isUnlocked ? 'text-slate-300' : 'text-slate-400'}`}>{stage.description || 'Description could not be loaded.'}</p>
            <p className={`text-xs mt-2 ${isUnlocked ? 'text-slate-400' : 'text-slate-500'}`}>
              {(STAGE_RUBRICS[stage.pathway]?.[idx] ?? []).join(' · ')}
            </p>
          </div>
          {isActive && <ChevronRight className={`h-6 w-6 ${stage.textColor} flex-shrink-0 mt-1`} />}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: Stage Selection
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'stages') {
    return (
      <AppLayout>
        <ScienceDistortedBackground />
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10">

          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-4">
              <FlaskConical className="h-12 w-12 text-emerald-400 animate-pulse" />
              <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                Science Skills
              </h1>
            </div>
            <p className="text-xl md:text-2xl text-slate-200 max-w-2xl mx-auto">
              Build scientific reasoning first — then unlock Life Sciences and Physical Sciences pathways.
            </p>
            <div className="mt-4">
              <PidginTooltip
                originalText="Build scientific reasoning first — then unlock Life Sciences and Physical Sciences pathways."
                hintText="Tap to translate this introduction into Nigerian Pidgin."
              />
            </div>

            {/* Voice selector */}
            <div className="mt-5 inline-flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-base text-white font-medium">
                <Volume2 className="h-5 w-5 text-emerald-300" />
                <span>Choose your coach&apos;s voice:</span>
              </div>
              <div className="flex rounded-xl overflow-hidden border border-slate-500 shadow-lg">
                <button
                  onClick={e => { e.stopPropagation(); setVoiceMode('english'); }}
                  className={`flex items-center gap-2 px-5 py-3 text-base font-semibold transition-all
                    ${voiceMode === 'english' ? 'bg-blue-600 text-white shadow-inner' : 'bg-slate-700/80 text-white hover:bg-slate-600'}`}
                >
                  🇬🇧 British English
                </button>
                <div className="w-px bg-slate-500" />
                <button
                  onClick={e => { e.stopPropagation(); setVoiceMode('pidgin'); }}
                  className={`flex items-center gap-2 px-5 py-3 text-base font-semibold transition-all
                    ${voiceMode === 'pidgin' ? 'bg-green-600 text-white shadow-inner' : 'bg-slate-700/80 text-white hover:bg-slate-600'}`}
                >
                  🇳🇬 Nigerian Pidgin
                </button>
              </div>
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
                    setTimeout(() => hookSpeak('Welcome to Science Skills. Begin with Scientific Reasoning to unlock the pathways.'), 300);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all text-base animate-pulse"
                >
                  <Volume2 className="h-5 w-5" /> 🔊 Tap here to enable voice
                </button>
              ) : (
                <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
                  <Volume2 className="h-4 w-4" /> Voice is on
                </div>
              )}
            </div>
          </div>

          {loadingProgress ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-400" />
            </div>
          ) : (
            <div className="space-y-8">

              {/* ── Tier 1: Scientific Reasoning ── */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-sky-500/60 to-transparent" />
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/20 border border-sky-400/50">
                    <Eye className="h-4 w-4 text-sky-300" />
                    <span className="text-sky-300 font-bold text-sm uppercase tracking-wider">
                      Tier 1 · Scientific Reasoning
                    </span>
                    {progress?.tier1Complete && <CheckCircle className="h-4 w-4 text-green-400" />}
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-l from-sky-500/60 to-transparent" />
                </div>
                <p className="text-center text-slate-400 text-sm mb-5">
                  Complete all 5 stages to unlock the Science Pathways below.
                </p>
                <div className="space-y-4">
                  {(REASONING_STAGES || []).map((stage, idx) =>
                    renderStageCard(stage, idx, progress?.reasoning, false)
                  )}
                </div>
              </div>

              {/* ── Tier 2: Pathway Accordions ── */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/60 to-transparent" />
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/50">
                    <BookOpen className="h-4 w-4 text-emerald-300" />
                    <span className="text-emerald-300 font-bold text-sm uppercase tracking-wider">
                      Tier 2 · Science Pathways
                    </span>
                    {!progress?.tier1Complete && <Lock className="h-4 w-4 text-slate-400" />}
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-l from-emerald-500/60 to-transparent" />
                </div>

                {!progress?.tier1Complete && (
                  <div className="bg-slate-800/70 border border-slate-600 rounded-xl p-4 text-center mb-5">
                    <Lock className="h-6 w-6 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-300 text-sm font-medium">
                      Complete all 5 Scientific Reasoning stages to unlock the pathways below.
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      {5 - (REASONING_STAGES || []).filter((_, i) => progress?.reasoning?.completedStages?.[i] === true).length} stage{
                        5 - (REASONING_STAGES || []).filter((_, i) => progress?.reasoning?.completedStages?.[i] === true).length !== 1 ? 's' : ''
                      } remaining
                    </p>
                  </div>
                )}

                <div className="space-y-4">

                  {/* Life Sciences accordion */}
                  <div className={`rounded-2xl border-2 overflow-hidden transition-all ${progress?.tier1Complete ? 'border-green-500/50' : 'border-slate-600/50 opacity-60'}`}>
                    <button
                      disabled={!progress?.tier1Complete}
                      onClick={() => setLifeOpen(o => !o)}
                      className={`w-full flex items-center justify-between px-6 py-5 transition-all
                        ${progress?.tier1Complete
                          ? 'bg-green-900/30 hover:bg-green-900/40 cursor-pointer'
                          : 'bg-slate-800/50 cursor-not-allowed'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-500`}>
                          <Microscope className="h-6 w-6 text-white" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-white">Life Sciences</h3>
                            {progress?.tier1Complete && (
                              <span className="text-xs bg-green-500/30 text-green-300 px-2 py-0.5 rounded-full border border-green-500/40">
                                {(progress?.life?.completedStages ?? []).filter(Boolean).length}/5 complete
                              </span>
                            )}
                          </div>
                          <p className="text-green-300 text-sm mt-0.5">Cells · Organisms · Ecosystems · Genetics · Evolution</p>
                        </div>
                      </div>
                      {progress?.tier1Complete
                        ? (lifeOpen ? <ChevronUp className="h-5 w-5 text-green-300" /> : <ChevronDown className="h-5 w-5 text-green-300" />)
                        : <Lock className="h-5 w-5 text-slate-400" />}
                    </button>
                    {lifeOpen && progress?.tier1Complete && (
                      <div className="px-4 pb-4 pt-2 space-y-3 bg-green-900/10">
                        {(LIFE_STAGES || []).map((stage, idx) =>
                          renderStageCard(stage, idx, progress?.life, false)
                        )}
                      </div>
                    )}
                  </div>

                  {/* Physical Sciences accordion */}
                  <div className={`rounded-2xl border-2 overflow-hidden transition-all ${progress?.tier1Complete ? 'border-orange-500/50' : 'border-slate-600/50 opacity-60'}`}>
                    <button
                      disabled={!progress?.tier1Complete}
                      onClick={() => setPhysicalOpen(o => !o)}
                      className={`w-full flex items-center justify-between px-6 py-5 transition-all
                        ${progress?.tier1Complete
                          ? 'bg-orange-900/30 hover:bg-orange-900/40 cursor-pointer'
                          : 'bg-slate-800/50 cursor-not-allowed'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-500 to-red-500">
                          <Atom className="h-6 w-6 text-white" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-white">Physical Sciences</h3>
                            {progress?.tier1Complete && (
                              <span className="text-xs bg-orange-500/30 text-orange-300 px-2 py-0.5 rounded-full border border-orange-500/40">
                                {(progress?.physical?.completedStages ?? []).filter(Boolean).length}/5 complete
                              </span>
                            )}
                          </div>
                          <p className="text-orange-300 text-sm mt-0.5">Matter · Forces · Energy & Waves · Electricity · Earth & Space</p>
                        </div>
                      </div>
                      {progress?.tier1Complete
                        ? (physicalOpen ? <ChevronUp className="h-5 w-5 text-orange-300" /> : <ChevronDown className="h-5 w-5 text-orange-300" />)
                        : <Lock className="h-5 w-5 text-slate-400" />}
                    </button>
                    {physicalOpen && progress?.tier1Complete && (
                      <div className="px-4 pb-4 pt-2 space-y-3 bg-orange-900/10">
                        {(PHYSICAL_STAGES || []).map((stage, idx) =>
                          renderStageCard(stage, idx, progress?.physical, false)
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: Topic picker
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'topic' && selectedStage) {
    const Icon = selectedStage.icon;
    const pathwayLabel = selectedStage.pathway === 'reasoning' ? 'Scientific Reasoning'
      : selectedStage.pathway === 'life' ? 'Life Sciences' : 'Physical Sciences';
    const activeSessions = stageSessions.filter(s => !isSessionFinished(s));
    const finishedSessions = stageSessions.filter(s => isSessionFinished(s));

    return (
      <AppLayout>
        <ScienceDistortedBackground />
        <main className="relative z-10 flex-1 min-h-screen px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => { cancel(); setView('stages'); }} className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors">
              <ArrowLeft size={20} /> Back to Stages
            </button>

            <div className="bg-slate-900 border-2 border-slate-600 rounded-2xl p-8 mb-6">
              <div className="text-center mb-7">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{pathwayLabel}</div>
                <div className={`w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${selectedStage.gradient} flex items-center justify-center`}>
                  <Icon className="h-10 w-10 text-white" />
                </div>
                <div className="text-base font-semibold text-slate-300 uppercase tracking-wider mb-1">Stage {selectedStage.id + 1}</div>
                <h2 className="text-4xl font-bold text-white">{selectedStage.name}</h2>
                <p className={`text-lg font-medium mt-1 ${selectedStage.textColor}`}>{selectedStage.subtitle}</p>
                <p className="text-slate-200 text-lg mt-3">{selectedStage.description?.trim() || 'Description could not be loaded.'}</p>
                <p className="text-slate-400 text-sm mt-2">{(STAGE_RUBRICS[selectedStage.pathway]?.[selectedStage.id] ?? []).join(' · ')}</p>
                <button
                  onClick={() => speak(selectedStage.voiceIntro)}
                  className={`mt-4 inline-flex items-center gap-2 text-base ${selectedStage.textColor} border ${selectedStage.border} bg-white/5 px-4 py-2 rounded-full hover:bg-white/10 transition-all`}
                >
                  <Volume2 size={16} /> Hear instructions again
                </button>
              </div>

              {/* Voice */}
              <div className="mb-6 bg-slate-800 border border-slate-600 rounded-xl p-4">
                <p className="text-white text-lg font-semibold mb-3 text-center flex items-center justify-center gap-2">
                  <Volume2 size={18} className="text-emerald-400" /> Choose your coach&apos;s voice
                </p>
                <div className="flex rounded-xl overflow-hidden border border-slate-500">
                  <button onClick={() => setVoiceMode('english')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-lg font-bold transition-all ${voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
                    🇬🇧 British English
                  </button>
                  <div className="w-px bg-slate-500" />
                  <button onClick={() => setVoiceMode('pidgin')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-lg font-bold transition-all ${voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
                    🇳🇬 Nigerian Pidgin
                  </button>
                </div>
              </div>

              {/* Topic input */}
              <div className="mb-4">
                <label className="block text-white text-lg font-semibold mb-2">
                  What context should your science coach use today?
                </label>
                <p className="text-slate-400 text-sm mb-3">
                  Choose something from your world — the Niger Delta, your farm, fishing, cooking, the sky, animals nearby. Science is everywhere.
                </p>
                <input
                  type="text"
                  value={topicInput}
                  onChange={e => setTopicInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && topicInput.trim()) startSession(); }}
                  placeholder="e.g., mangrove forests, cassava farming, the harmattan, fishing, solar panels..."
                  className={`w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-4 text-lg focus:outline-none focus:${selectedStage.border} placeholder-slate-400 transition-colors`}
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
                {isSending ? 'Starting session...' : '🔬 Start New Session'}
              </button>
            </div>

            {activeSessions.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <MessageSquare size={18} /> Continue a Session
                </h3>
                <div className="space-y-3">
                  {(activeSessions ?? []).map(session => (
                    <div key={session.id} onClick={() => resumeSession(session)}
                      className={`bg-slate-900 border ${selectedStage.border} rounded-xl p-4 cursor-pointer hover:bg-slate-800 transition-all`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-base truncate">{session.sub_category}</p>
                          <p className="text-slate-400 text-sm mt-0.5">{new Date(session.updated_at).toLocaleDateString()} · {session.progress}</p>
                          {session.science_skills_evaluation && (
                            <span className={`mt-1 inline-flex text-xs px-2 py-0.5 rounded-full border font-semibold
                              ${LEVEL_CONFIG[session.science_skills_evaluation.overall_level].bg}
                              ${LEVEL_CONFIG[session.science_skills_evaluation.overall_level].color}
                              ${LEVEL_CONFIG[session.science_skills_evaluation.overall_level].border}`}>
                              {LEVEL_CONFIG[session.science_skills_evaluation.overall_level].emoji} {session.science_skills_evaluation.overall_level}
                            </span>
                          )}
                        </div>
                        <ChevronRight size={20} className={selectedStage.textColor} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {finishedSessions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-400" /> Completed Sessions
                </h3>
                <div className="space-y-2">
                  {(finishedSessions ?? []).map(session => (
                    <div key={session.id} onClick={() => resumeSession(session)}
                      className="bg-green-900/20 border border-green-500/40 rounded-xl p-4 cursor-pointer hover:bg-green-900/30 transition-all">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-green-300 font-semibold text-base truncate">🏆 {session.sub_category}</p>
                          <p className="text-slate-400 text-sm">{new Date(session.updated_at).toLocaleDateString()}</p>
                        </div>
                        <ChevronRight size={20} className="text-green-400" />
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
    const pathwayLabel = selectedStage.pathway === 'reasoning' ? 'Scientific Reasoning'
      : selectedStage.pathway === 'life' ? 'Life Sciences' : 'Physical Sciences';

    return (
      <AppLayout>
        <ScienceDistortedBackground />
        {showEvalModal && evaluation && (
          <EvaluationModal evaluation={evaluation} stage={selectedStage} onClose={() => setShowEvalModal(false)} onSpeak={speakAlways} />
        )}

        <main className="relative z-10 flex flex-col h-[calc(100vh-64px)]">
          {/* Chat header */}
          <div className={`flex-shrink-0 border-b ${selectedStage.border} bg-slate-900/95 backdrop-blur px-4 py-3`}>
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => { cancel(); setView('topic'); }} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
                  <ArrowLeft size={22} />
                </button>
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${selectedStage.gradient} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-bold text-base leading-tight truncate">{selectedStage.name}</p>
                  <p className={`text-xs ${selectedStage.textColor} truncate`}>{pathwayLabel} · {topic}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {evaluation && (
                  <button onClick={() => setShowEvalModal(true)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border ${LEVEL_CONFIG[evaluation.overall_level].border} ${LEVEL_CONFIG[evaluation.overall_level].bg} ${LEVEL_CONFIG[evaluation.overall_level].color}`}>
                    {LEVEL_CONFIG[evaluation.overall_level].emoji} {evaluation.overall_level}
                  </button>
                )}
                <div className="flex rounded-lg overflow-hidden border border-slate-600">
                  <button onClick={() => setVoiceMode('english')} title="British English voice"
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold transition-all border-r border-slate-600
                      ${voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
                    🇬🇧 <span className="hidden sm:inline">English</span>
                  </button>
                  <button onClick={() => setVoiceMode('pidgin')} title="Nigerian Pidgin voice"
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold transition-all
                      ${voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
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
                    ${msg.role === 'user' ? 'bg-slate-700 text-white rounded-tr-sm' : 'bg-slate-900 border border-slate-600 text-slate-100 rounded-tl-sm'}`}>
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
                  <div className="bg-slate-900 border border-slate-600 rounded-2xl rounded-tl-sm px-5 py-3">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 150, 300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
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
          <div className={`flex-shrink-0 border-t ${selectedStage.border} bg-slate-900/90 backdrop-blur px-4 pt-3 pb-4`}>
            <div className="max-w-3xl mx-auto">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your observation, hypothesis, or answer here... or tap the mic to speak."
                rows={3}
                disabled={isSending || isImproving}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-400 placeholder-slate-400 resize-none text-lg leading-relaxed disabled:opacity-50 transition-colors mb-2"
              />
              <div className="flex items-center justify-between mb-2 gap-2">
                <button onClick={toggleListening}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-medium transition-all
                    ${isListening ? 'bg-red-500 animate-pulse text-white shadow-lg shadow-red-500/40' : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white'}`}>
                  {isListening ? <MicOff size={17} /> : <Mic size={17} />}
                  {isListening ? 'Stop' : 'Speak'}
                </button>
                <button onClick={sendMessage} disabled={!inputText.trim() || isSending}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-base font-bold transition-all
                    ${inputText.trim() && !isSending
                      ? `bg-gradient-to-r ${selectedStage.gradient} text-white hover:opacity-90 shadow-lg`
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
                  <Send size={16} /> Send
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleImprove} disabled={!inputText.trim() || isImproving || isSending}
                  title="AI polishes your scientific explanation"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all border
                    ${inputText.trim() && !isImproving && !isSending
                      ? 'bg-violet-500/20 border-violet-400/50 text-violet-300 hover:bg-violet-500/30'
                      : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'}`}>
                  <Wand2 size={15} />
                  {isImproving ? 'Polishing...' : 'Improve my explanation'}
                </button>
                <button onClick={handleSave} disabled={isSaving || isSending || messages.length < 2}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border
                    ${!isSaving && messages.length >= 2
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30'
                      : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'}`}>
                  <Save size={15} />
                  {isSaving ? 'Saving...' : 'Save Session'}
                </button>
                <button onClick={handleEvaluate} disabled={isEvaluating || isSending || userMessageCount < 2}
                  title={userMessageCount < 2 ? 'Send at least 2 messages first' : 'Get your science evaluation'}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border
                    ${!isEvaluating && userMessageCount >= 2
                      ? 'bg-slate-700 border-slate-500 text-white hover:bg-slate-600'
                      : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'}`}>
                  <BarChart3 size={15} />
                  {isEvaluating ? 'Evaluating...' : 'Evaluate'}
                </button>
              </div>
              <p className="text-center text-slate-400 text-base mt-2">
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

export default ScienceSkillsPage;