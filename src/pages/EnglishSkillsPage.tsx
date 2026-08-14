// src/pages/EnglishSkillsPage.tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import {
  Mic, MicOff, MessageSquare, BookOpen, PenLine, Sparkles,
  Lock, ArrowLeft, Send, Volume2, VolumeX, CheckCircle,
  TrendingUp, ChevronRight, Globe2, Wand2, Save,
  BarChart3, PlayCircle, Clock, X,
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
  english_skills_evaluation: SessionEvaluation | null;
  created_at: string;
  updated_at: string;
}

interface UserProgress {
  unlockedUpTo: number;
  completedStages: boolean[];
  stageLevels: (ProficiencyLevel | null)[];
}

// ─── Correction block for every system prompt ────────────────────────────────
// The AI is instructed to prefix every correction line with ✅ so the renderer
// can detect it and apply green bold styling.

const CORRECTION_BLOCK = `
When the student makes a grammar or expression error, ALWAYS do all three steps:
  1. Warmly celebrate what they meant: "I love that idea!" or "That's so interesting!"
  2. On its OWN separate line, prefixed EXACTLY with the ✅ emoji, show the corrected sentence:
     ✅ A clearer way to say that is: "My family is very kind."
  3. Then continue the conversation naturally with your next question or prompt.
IMPORTANT FORMATTING RULE: The correction line MUST start with ✅ and appear on its own line, with a blank line before it and after it.
Never skip a correction, no matter how small. Use simple, kind language — the goal is to teach, not embarrass.`;

const EXTENSIVE_INTERACTIVE_INSTRUCTIONS = `
Always respond as a deeply thoughtful tutor. Your answers must:
- be expansive, detailed, and fully unpack the learner's question or prompt;
- explain reasoning step by step, not just give a short summary;
- connect ideas clearly to the current stage objective and the student's context;
- avoid superficial or brief responses unless the learner explicitly asks for a short summary;
- conclude with multiple highly relevant follow-up questions tied strictly to the current stage's English learning objective.

The AI must provide large, comprehensive answers capable of thoroughly addressing any user question.
The AI should act like a human tutor, responding in depth and following up with several highly relevant questions tailored to the specific activity.`;

// ─── Stage Definitions ───────────────────────────────────────────────────────

const STAGES = [
  {
    id: 0,
    name: 'Oral Expression',
    subtitle: 'Find Your Voice',
    description:
      'Build confidence expressing yourself in English. Talk about topics you care about — your family, your community, your goals, your daily life.',
    icon: Mic,
    gradient: 'from-blue-500 to-cyan-500',
    glowBg: 'bg-blue-500/90',
    border: 'border-blue-400/60',
    textColor: 'text-blue-300',
    voiceIntro: `Welcome to Oral Expression — Stage 1. In this stage, you will practise speaking and expressing your thoughts in English. You can talk about anything you like — your family, your community, your goals, or your daily life. Choose a topic you love, and your AI coach will have a friendly conversation with you. Your coach will also gently help you improve your English as you go. When you are ready, type your topic in the box and press Start New Session.`,
    systemPrompt: `You are a warm, patient English communication coach working with young people in rural Nigeria.
The student is practising ORAL EXPRESSION — speaking and expressing their thoughts in English.
Their chosen topic today: {TOPIC}

Coaching principles:
• Be warm, encouraging, and celebrate every effort. Never criticise harshly.
• Do NOT penalise Nigerian English or Pidgin — these show linguistic richness and cultural identity.
• Keep your responses SHORT (2–3 sentences max) so the student can respond easily.
• ALWAYS end with a friendly follow-up question or prompt to keep the conversation going.
• Focus on COMMUNICATION — but always gently correct grammar and expression errors too.
• You are being read aloud by text-to-speech — write naturally and clearly.
${CORRECTION_BLOCK}`,
  },
  {
    id: 1,
    name: 'Listening & Response',
    subtitle: 'Understand & Reply',
    description:
      'Practice understanding detailed questions and giving thoughtful, complete answers. Build your ability to follow English and respond clearly.',
    icon: MessageSquare,
    gradient: 'from-purple-500 to-violet-500',
    glowBg: 'bg-purple-500/90',
    border: 'border-purple-400/60',
    textColor: 'text-purple-300',
    voiceIntro: `Welcome to Listening and Response — Stage 2. In this stage, you will practise listening carefully to questions and giving clear, complete answers in English. Your AI coach will ask you one question at a time about your chosen topic. Take your time to understand each question before you answer. Your coach will also gently help you improve how you express your answers. Choose your topic and press Start New Session when you are ready.`,
    systemPrompt: `You are an English communication coach helping young Nigerians practise LISTENING AND RESPONDING.
Their chosen topic: {TOPIC}

Coaching principles:
• Ask ONE clear, interesting question at a time about the topic.
• Warmly acknowledge their answer before asking your next question.
• Gradually increase question complexity as they improve.
• Do NOT penalise Nigerian English or Pidgin — these show cultural identity.
• Focus on helping the student give complete, relevant answers.
• Always correct grammar and expression errors gently before moving on.
${CORRECTION_BLOCK}`,
  },
  {
    id: 2,
    name: 'Reading Fluency',
    subtitle: 'Read With Meaning',
    description:
      'Explore English texts, discuss what you read, and expand your vocabulary. Practice understanding and explaining complex ideas.',
    icon: BookOpen,
    gradient: 'from-emerald-500 to-teal-500',
    glowBg: 'bg-emerald-500/90',
    border: 'border-emerald-400/60',
    textColor: 'text-emerald-300',
    voiceIntro: `Welcome to Reading Fluency — Stage 3. In this stage, your AI coach will share short passages about your chosen topic. After each passage, your coach will ask you questions to check your understanding and help you learn new vocabulary. Practise explaining what you read in your own words. Your coach will kindly help you improve your English as you respond. Choose your topic and press Start New Session to begin.`,
    systemPrompt: `You are an English literacy coach helping young Nigerians improve READING FLUENCY.
Their chosen topic or reading area: {TOPIC}

Coaching principles:
• Share a SHORT, interesting passage (3–5 sentences) related to their topic, then ask a comprehension question.
• Build vocabulary naturally — introduce new words in context and explain them simply.
• Celebrate when they understand and explain ideas in their own words.
• Do NOT penalise Nigerian English or Pidgin — these show cultural identity.
• Progress from simple to more complex reading material based on their responses.
• Always correct grammar and expression errors gently before continuing.
${CORRECTION_BLOCK}`,
  },
  {
    id: 3,
    name: 'Written Communication',
    subtitle: 'Write Your Ideas',
    description:
      'Express yourself in clear written English. Practice writing messages, stories, arguments, and professional communication.',
    icon: PenLine,
    gradient: 'from-orange-500 to-amber-500',
    glowBg: 'bg-orange-500/90',
    border: 'border-orange-400/60',
    textColor: 'text-orange-300',
    voiceIntro: `Welcome to Written Communication — Stage 4. In this stage, you will practise writing your ideas clearly in English. Your AI coach will give you writing prompts about your chosen topic and help you improve your writing step by step. Remember — your ideas and your voice matter most. Your coach will help you express them more clearly. You can also use the Improve my English button to get help polishing your writing before you send it. Choose your topic and press Start New Session.`,
    systemPrompt: `You are an English writing coach helping young Nigerians develop WRITTEN COMMUNICATION skills.
Their writing topic: {TOPIC}

Coaching principles:
• Give clear, motivating writing prompts about their topic.
• Always respond to the CONTENT and IDEAS first — celebrate what they wrote about.
• Then correct grammar and expression errors gently before continuing.
• Suggest ONE specific writing improvement at a time.
• Never rewrite their work entirely — guide them to improve it themselves.
• Do NOT erase their authentic Nigerian English voice — help them add clarity to it.
• Focus on COMMUNICATION effectiveness.
${CORRECTION_BLOCK}`,
  },
  {
    id: 4,
    name: 'AI-Enhanced Writing',
    subtitle: 'Polish with AI',
    description:
      'Use AI as your writing partner. Write your ideas, then collaborate with AI to elevate your language and reach any audience.',
    icon: Sparkles,
    gradient: 'from-pink-500 to-rose-500',
    glowBg: 'bg-pink-500/90',
    border: 'border-pink-400/60',
    textColor: 'text-pink-300',
    voiceIntro: `Welcome to AI-Enhanced Writing — Stage 5. This is the most advanced stage. Here you will learn to use AI as your writing partner. Write your ideas first, then work with your AI coach to make your writing even more powerful and clear. You can also use the Improve my English button to see how AI can polish your writing while keeping your voice. Your coach will also gently correct any errors to help you keep growing. Choose your topic and press Start New Session.`,
    systemPrompt: `You are an AI writing partner helping young Nigerians learn to use AI to ENHANCE THEIR WRITING.
Their project or topic: {TOPIC}

Coaching principles:
• This is fully collaborative — they write their ideas, you help polish them.
• ALWAYS preserve their voice, ideas, and authentic perspective.
• Respond to their IDEAS first — celebrate the content before improving the form.
• Then gently correct grammar and expression errors before offering enhancements.
• Offer 2 versions of any improvement and let them choose.
• Teach them HOW to give good AI instructions.
• Explain WHY certain phrasings are more effective.
${CORRECTION_BLOCK}`,
  },
];

// ─── Stage Rubrics ────────────────────────────────────────────────────────────

const STAGE_RUBRICS: Record<number, string[]> = {
  0: ['Fluency & Flow', 'Vocabulary Range', 'Coherence', 'Confidence & Initiative', 'Comprehensibility'],
  1: ['Comprehension Accuracy', 'Response Relevance', 'Detail & Depth', 'Follow-up Engagement'],
  2: ['Main Idea Identification', 'Vocabulary in Context', 'Inference & Interpretation', 'Personal Connection'],
  3: ['Clarity & Organisation', 'Vocabulary Choice', 'Sentence Variety', 'Audience Awareness', 'Ideas & Content'],
  4: ['Prompt Crafting', 'Critical Evaluation', 'Revision & Refinement', 'Voice Preservation', 'Iterative Improvement'],
};

const LEVEL_CONFIG: Record<ProficiencyLevel, { color: string; bg: string; border: string; emoji: string }> = {
  Emerging:   { color: 'text-red-300',    bg: 'bg-red-500/90',    border: 'border-red-400/40',    emoji: '🌱' },
  Developing: { color: 'text-yellow-300', bg: 'bg-yellow-500/90', border: 'border-yellow-400/40', emoji: '🌿' },
  Proficient: { color: 'text-blue-300',   bg: 'bg-blue-500/90',   border: 'border-blue-400/40',   emoji: '⭐' },
  Advanced:   { color: 'text-green-300',  bg: 'bg-green-500/90',  border: 'border-green-400/40',  emoji: '🏆' },
};

// ─── Claude via chatClient ────────────────────────────────────────────────────

const evaluateSession = async (
  chatHistory: ChatMessage[],
  stageId: number,
  communicationLevel: number = 1,
): Promise<SessionEvaluation> => {
  const stage = STAGES[stageId];
  const subcats = STAGE_RUBRICS[stageId];
  const fullHistory = chatHistory.slice(-10)
    .map(m => `${m.role === 'user' ? 'STUDENT' : 'COACH'}: ${m.content.slice(0, 500)}`)
    .join('\n\n');

  const encouragementInstruction = communicationLevel <= 0
    ? 'Write the encouragement in ONLY the simplest words. Maximum 2 short sentences. Use emojis to anchor meaning (e.g. "Well done! 👏"). No jargon at all.'
    : communicationLevel === 1
    ? 'Write the encouragement in short, clear sentences. One idea per sentence. No jargon. Warm and celebratory. 2–3 sentences.'
    : communicationLevel === 2
    ? 'Write the encouragement in clear, friendly language. Brief explanations where helpful. 2–3 sentences.'
    : 'Write the encouragement in well-structured, natural English. 2–3 personalised sentences referencing specific strengths.';

  const prompt = `You are an expert English language evaluator for young people in rural Nigeria.

CRITICAL: Do NOT penalise Nigerian English or Pidgin — they show linguistic richness. Evaluate COMMUNICATION EFFECTIVENESS, not formal grammar perfection.

You are evaluating a "${stage.name}" session.

FULL CONVERSATION:
${fullHistory}

Evaluate the STUDENT only across these sub-categories:
${subcats.map((s, i) => `${i + 1}. ${s}`).join('\n')}

SCORING LEVELS:
• Emerging   (0–39):  Very limited demonstration
• Developing (40–64): Partial demonstration; support still needed
• Proficient (65–84): Consistent, independent demonstration
• Advanced   (85–100): Sophisticated, nuanced demonstration

For EACH sub-category provide:
  - level: exactly one of "Emerging" | "Developing" | "Proficient" | "Advanced"
  - score: integer 0–100
  - evidence: 1–2 warm sentences citing a SPECIFIC example from the student's messages

Also provide:
  - overall_level: the modal level across all sub-categories
  - can_advance: true ONLY IF every sub-category is Proficient OR Advanced
  - is_complete: true ONLY IF every sub-category is Advanced
  - encouragement: ${encouragementInstruction}

Return ONLY valid JSON:
{
  "stage_id": ${stageId},
  "stage_name": "${stage.name}",
  "overall_level": "...",
  "can_advance": false,
  "is_complete": false,
  "sub_categories": [{ "name": "...", "level": "...", "score": 0, "evidence": "..." }],
  "encouragement": "..."
}`;

  const result = await chatJSON({
    page: 'EnglishSkillsPage',  // → Groq Llama 3.3 70B
    messages: [{ role: 'user', content: prompt }],
    system: 'You are an expert English language evaluator. Return only valid JSON.',
    max_tokens: 1200,
    temperature: 0.2,
  });
  return result as SessionEvaluation;
};

const improveText = async (
  text: string,
  context: string,
  stageId: number,
): Promise<{ improved: string; explanation: string }> => {
  const prompt = `You are an English language coach helping a young student in Nigeria improve their writing.
Stage: ${STAGES[stageId].name}
Recent context: ${context}
Student wrote: "${text}"

Rewrite with clearer English — PRESERVE their authentic voice and meaning. Keep changes minimal.
Return ONLY valid JSON: { "improved_text": "...", "explanation": "..." }
Explanation: 2–3 warm sentences to the student explaining WHAT changed and WHY.`;

  const result = await chatJSON({
    page: 'EnglishSkillsPage',  // → Groq Llama 3.3 70B
    messages: [{ role: 'user', content: prompt }],
    system: 'You are an English language coach. Return only valid JSON.',
    max_tokens: 600,
    temperature: 0.3,
  });
  return { improved: result.improved_text, explanation: result.explanation };
};

const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  return (
    <span>
      {lines.map((line, i) => {
        const isCorrection = line.trimStart().startsWith('✅');
        if (isCorrection) {
          return (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              <br />
              <strong className="text-green-700 font-bold">{line}</strong>
              <br />
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={i}>
            {i > 0 && <br />}
            {line}
          </React.Fragment>
        );
      })}
    </span>
  );
};

// ─── Build spoken evaluation summary ─────────────────────────────────────────

const buildSpokenEvaluation = (evaluation: SessionEvaluation): string => {
  const levelPhrases: Record<ProficiencyLevel, string> = {
    Emerging:   'you are just beginning to develop this skill',
    Developing: 'you are making real progress with this skill',
    Proficient: 'you are doing really well with this skill',
    Advanced:   'you have mastered this skill — outstanding work',
  };

  const strongSkills = evaluation.sub_categories.filter(
    s => s.level === 'Proficient' || s.level === 'Advanced'
  );
  const growthSkills = evaluation.sub_categories.filter(
    s => s.level === 'Emerging' || s.level === 'Developing'
  );

  let speech = `Your session evaluation is ready. `;
  speech += `Your overall level is ${evaluation.overall_level}. `;
  speech += `${evaluation.encouragement} `;

  if (strongSkills.length > 0) {
    speech += `You are doing really well in: ${strongSkills.map(s => s.name).join(', ')}. `;
    speech += `Keep this up — it shows real growth! `;
  }

  if (growthSkills.length > 0) {
    speech += `To improve the most, focus on: ${growthSkills.map(s => s.name).join(', ')}. `;
    const topGrowth = growthSkills[0];
    speech += `Especially ${topGrowth.name} — ${levelPhrases[topGrowth.level]}, and with a little more practice you will see big improvement. `;
  }

  if (evaluation.is_complete) {
    speech += `Incredible — you have reached Advanced in every skill! This stage is completely finished. `;
  } else if (evaluation.can_advance) {
    speech += `You have reached Proficient in every skill! Keep practising here to reach Advanced and fully complete this stage. `;
  } else {
    speech += `Keep going — reach Proficient in all skills to master this stage. `;
  }

  speech += `Remember, I am here with you every step of the way. You are doing something amazing, and I am proud of your effort. Let us keep going together!`;

  return speech;
};

// ─── Message renderer — detects ✅ correction lines → green bold ─────────────

// All Foundations stages are open to everyone — no prerequisite gating.
// Finishing an earlier stage is no longer required to access a later one.
const canAccessStage = (_stageIndex: number, _stageLevels: (string | null)[]): boolean => {
  return true;
};

const levelFloor = (communicationLevel: number): number => {
  if (communicationLevel >= 3) return 4; // all stages open
  if (communicationLevel === 2) return 3; // stages 1–4 open (indices 0–3)
  return 0; // levels 0 & 1: only stage 1
};

const deriveProgress = (rows: DashboardSession[], communicationLevel: number = 1): UserProgress => {
  const completedStages = [false, false, false, false, false];
  const stageLevels = [null, null, null, null, null] as (ProficiencyLevel | null)[];

  const levelPriority: Record<ProficiencyLevel, number> = {
    Emerging: 1,
    Developing: 2,
    Proficient: 3,
    Advanced: 4,
  };

  const strongestLevel = (current: ProficiencyLevel | null, candidate: ProficiencyLevel) =>
    !current || levelPriority[candidate] > levelPriority[current] ? candidate : current;

  for (const row of rows) {
    const ev = row.english_skills_evaluation;
    if (!ev || ev.stage_id < 0 || ev.stage_id > 4) continue;
    stageLevels[ev.stage_id] = strongestLevel(stageLevels[ev.stage_id], ev.overall_level);
    completedStages[ev.stage_id] = ev.overall_level === 'Advanced';
  }

  let earnedUpTo = 0;
  while (earnedUpTo < completedStages.length && completedStages[earnedUpTo]) {
    earnedUpTo += 1;
  }

  // For level 2: Stage 5 (index 4) only unlocks once Stages 3 & 4 (indices 2 & 3) are complete.
  const floor = levelFloor(communicationLevel);
  const adjustedFloor = (communicationLevel === 2 && !(completedStages[2] && completedStages[3]))
    ? Math.min(floor, 3)
    : floor;

  const unlockedUpTo = Math.max(earnedUpTo, adjustedFloor);
  return { unlockedUpTo, completedStages, stageLevels };
};

const ENGLISH_STAGE_COUNT = 5;

const EMPTY_USER_PROGRESS: UserProgress = {
  unlockedUpTo: 0,
  completedStages: Array(ENGLISH_STAGE_COUNT).fill(false) as boolean[],
  stageLevels: Array(ENGLISH_STAGE_COUNT).fill(null) as (ProficiencyLevel | null)[],
};

// ─── Evaluation Modal ─────────────────────────────────────────────────────────

const EvaluationModal: React.FC<{
  evaluation: SessionEvaluation;
  stage: typeof STAGES[0];
  onClose: () => void;
  onSpeak: (text: string) => void;
}> = ({ evaluation, stage, onClose, onSpeak }) => {
  const overall = LEVEL_CONFIG[evaluation.overall_level];

  // Speak the evaluation automatically when the modal opens
  useEffect(() => {
    const spokenText = buildSpokenEvaluation(evaluation);
    const t = setTimeout(() => onSpeak(spokenText), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-card border border-hair rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className={`sticky top-0 ${stage.glowBg} border-b ${stage.border} rounded-t-2xl px-6 py-4 flex items-start justify-between`}>
          <div>
            <h2 className="text-ink font-bold text-lg">{stage.name} — Session Evaluation</h2>
            <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-sm font-semibold ${overall.bg} ${overall.color} border ${overall.border}`}>
              {overall.emoji} Overall: {evaluation.overall_level}
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink p-1 mt-0.5 flex-shrink-0">
            <X size={22} />
          </button>
        </div>

        {/* Sub-categories */}
        <div className="px-6 py-5 space-y-3">
          <h3 className="text-muted font-semibold text-xs uppercase tracking-wider mb-4">Skill Breakdown</h3>
          {(evaluation.sub_categories ?? []).map((sub, i) => {
            const lc = LEVEL_CONFIG[sub.level];
            return (
              <div key={i} className={`rounded-xl border ${lc.border} ${lc.bg} p-4`}>
                <div className="flex items-center justify-between mb-2 gap-3">
                  <span className="text-ink font-semibold text-sm">{sub.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${lc.bg} ${lc.color} ${lc.border}`}>
                      {lc.emoji} {sub.level}
                    </span>
                    <span className="text-muted text-xs font-mono">{sub.score}/100</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-700/60 rounded-full mb-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${stage.gradient} transition-all duration-700`}
                    style={{ width: `${sub.score}%` }}
                  />
                </div>
                <p className="text-body text-xs leading-relaxed">
                  <span className="text-slate-500 mr-1">Evidence:</span>{sub.evidence}
                </p>
              </div>
            );
          })}
        </div>

        {/* Encouragement */}
        <div className="px-6 pb-4">
          <div className="bg-paper border border-hair rounded-xl p-4">
            <p className="text-body text-sm leading-relaxed">🌟 {evaluation.encouragement}</p>
          </div>
        </div>

        {/* What to focus on next */}
        {(() => {
          const growthSkills = evaluation.sub_categories.filter(
            s => s.level === 'Emerging' || s.level === 'Developing'
          );
          if (growthSkills.length === 0) return null;
          return (
            <div className="px-6 pb-4">
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <p className="text-amber-800 text-xs font-semibold uppercase tracking-wider mb-2">
                  🎯 Focus here next to improve the most
                </p>
                <ul className="space-y-1">
                  {growthSkills.map((s, i) => (
                    <li key={i} className="text-body text-sm flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span><strong className="text-ink">{s.name}</strong> — {s.evidence}</span>
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
                🎉 Outstanding! You have reached <strong>Advanced</strong> in every skill area. This stage is fully complete!
              </p>
            </div>
          ) : evaluation.can_advance ? (
            <div className="bg-blue-100 border border-blue-300 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-700 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800 text-sm font-medium">
                ✅ You are <strong>Proficient</strong> in all skill areas! Keep practising here to reach Advanced and fully complete this stage.
              </p>
            </div>
          ) : (
            <div className="bg-paper border border-hair rounded-xl p-4 flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-muted flex-shrink-0 mt-0.5" />
              <p className="text-body text-sm">
                Keep going! Reach <strong className="text-blue-700">Proficient</strong> in all skill areas to master this stage.
              </p>
            </div>
          )}
        </div>

        {/* Reminder the coach is with them */}
        <div className="px-6 pb-4">
          <div className="bg-teal-50 border border-teal-300 rounded-xl p-4 text-center">
            <p className="text-teal-800 text-sm">
              💚 I am here with you every step of the way. Keep going — you are doing something amazing!
            </p>
          </div>
        </div>

        {/* Replay voice + close */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => onSpeak(buildSpokenEvaluation(evaluation))}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-teal-300 bg-teal-100 text-teal-700 hover:bg-teal-200 transition-all"
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

const EnglishSkillsPage: React.FC = () => {
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
  // Continent determines the default voice mode: Africa → Nigerian (pidgin), others → British
  const [continent, setContinent] = useState<string | null>(null);
  const isAfrica = continent === 'Africa';

  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [ttsUnlocked, setTtsUnlocked] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english'); // corrected once profile loads
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const hasSpokenIntro = useRef(false);
  const hasSpokenStagesIntro = useRef(false);

  // useVoice: 'pidgin' → en-NG priority chain; 'english' → en-GB priority chain
  // Both chains prefer local (offline-capable) voices — important for Nigeria bandwidth
  const {
    speak: hookSpeak,
    cancel,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
  } = useVoice(voiceMode === 'pidgin');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Personality baseline + communication level ────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);
  const [personalityBaseline, setPersonalityBaseline] = useState<PersonalityBaseline>({
    communicationStrategy: null,
    learningStrategy: null,
  });

  // ── Fetch continent to set default voice mode ─────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('continent, country').eq('id', user.id).single()
      .then(({ data }) => {
        const c = data?.continent ?? null;
        setContinent(c);
        const isNigerian = data?.country === 'Nigeria';
        // Default to Nigerian voice for Africa users; British for everyone else
        setVoiceMode(isNigerian ? 'pidgin' : 'english');
      });
  }, [user?.id]);

  // ── Core speak (ignores speechEnabled — used for modal/eval voice) ────
  const speakAlways = useCallback((text: string) => {
    if (!ttsUnlocked) return;
    hookSpeak(text);
  }, [hookSpeak, ttsUnlocked]);

  // ── Speak (respects speechEnabled toggle) ────────────────────────────
  const speak = useCallback((text: string) => {
    if (!speechEnabled || !ttsUnlocked) return;
    hookSpeak(text);
  }, [speechEnabled, hookSpeak, ttsUnlocked]);

  // ── Stages intro voice ────────────────────────────────────────────────
  useEffect(() => {
    if (view === 'stages' && !hasSpokenStagesIntro.current && !loadingProgress) {
      hasSpokenStagesIntro.current = true;
      const t = setTimeout(() => speak('Welcome to English Skills. There are five stages, and all of them are open. Tap any stage card to begin.'), 800);
      return () => clearTimeout(t);
    }
  }, [view, loadingProgress, speak]);

  // ── Topic intro voice ─────────────────────────────────────────────────
  useEffect(() => {
    if (view === 'topic' && selectedStage && !hasSpokenIntro.current) {
      hasSpokenIntro.current = true;
      const t = setTimeout(() => speak(selectedStage.voiceIntro), 600);
      return () => clearTimeout(t);
    }
  }, [view, selectedStage, speak]);

  useEffect(() => { if (view !== 'topic') hasSpokenIntro.current = false; }, [view]);

  // ── Auto-speak AI messages ────────────────────────────────────────────
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') speak(last.content);
  }, [messages, speak]);

  // ── Auto-scroll ───────────────────────────────────────────────────────
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Load progress ─────────────────────────────────────────────────────
  const loadAllProgress = useCallback(async () => {
    if (!user?.id) { setLoadingProgress(false); return; }
    const { data } = await supabase
      .from('dashboard')
      .select('id, title, sub_category, category_activity, progress, chat_history, english_skills_evaluation, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('activity', 'english_skills')
      .order('updated_at', { ascending: false });
    setProgress(deriveProgress((data ?? []) as DashboardSession[], communicationLevel));
    setLoadingProgress(false);
  }, [user?.id, communicationLevel]);

  useEffect(() => { loadAllProgress(); }, [loadAllProgress]);

  const loadStageSessions = useCallback(async (stageName: string) => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('dashboard')
      .select('id, title, sub_category, category_activity, progress, chat_history, english_skills_evaluation, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('activity', 'english_skills')
      .eq('category_activity', stageName)
      .order('updated_at', { ascending: false });
    setStageSessions((data ?? []) as DashboardSession[]);
  }, [user?.id]);

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
  // ── Fetch personality baseline on mount ──────────────────────────────
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
        setCommunicationLevel(data.communication_level ?? 1);
        console.log('[English] Baseline loaded, communication_level:', data.communication_level ?? 1);
      });
  }, [user?.id]);

  // ── Communication-level language register injected into every system prompt ──
  // Returns a block the AI coach must follow for every response in this session.
  const buildCommLevelBlock = (level: number): string => {
    if (level <= 0) return `
═══════════════════════════════════════════════
COMMUNICATION LEVEL: 0 — PRE-LITERATE / VERY BASIC
This student writes in single words, short fragments, or severely broken sentences.
═══════════════════════════════════════════════
LANGUAGE RULES (mandatory — every response):
- Write in ONLY the simplest everyday words. Maximum 1–2 short sentences per turn.
- Never use grammar terms. Show corrections only by example:
  ✅ Say it like this: "My mother is kind."
- Ask questions answerable in one or two words: "Do you like school? Yes or no?"
- Celebrate every attempt: "Good try! 👏" before any correction.
- If their message is unclear: "I did not understand. Can you try again?"`;

    if (level === 1) return `
═══════════════════════════════════════════════
COMMUNICATION LEVEL: 1 — EMERGING
This student writes simple short sentences with frequent errors but recoverable meaning.
═══════════════════════════════════════════════
LANGUAGE RULES (mandatory — every response):
- Short sentences only. One idea per sentence. Keep your full response under 60 words.
- Explain grammar corrections warmly and simply — no technical terms.
- Ask ONE question per turn. Use topics from daily life: family, farm, market, school.
- Celebrate every effort: "That is a great answer!" before any correction.
- If their answer is very short, say "Can you tell me a little more?" before moving on.`;

    if (level === 2) return `
═══════════════════════════════════════════════
COMMUNICATION LEVEL: 2 — DEVELOPING
This student writes multi-sentence responses with errors but clear meaning.
═══════════════════════════════════════════════
LANGUAGE RULES:
- Clear, direct language. Brief explanations for grammar corrections where helpful.
- 2–3 sentences per response maximum. One guiding question per turn.
- Build on what the student said — reference their words before extending the idea.`;

    return `
═══════════════════════════════════════════════
COMMUNICATION LEVEL: 3 — PROFICIENT
This student communicates complex ideas clearly with mostly correct grammar.
═══════════════════════════════════════════════
LANGUAGE RULES:
- Natural, well-structured English. Appropriate grammar terminology where helpful.
- Responses can be fuller but stay concise. Push for precision and nuance.`;
  };

  // ── Tweak personality baseline after each session ─────────────────────
  // Runs silently after handleSave. Updates communication_strategy,
  // learning_strategy, AND communication_level (max ±1 per session).
  const tweakPersonalityBaseline = async (): Promise<void> => {
    if (!user?.id) return;
    const learnerMessages = messages.filter(m => m.role === 'user');
    if (learnerMessages.length < 3) return;

    const cs = personalityBaseline.communicationStrategy;
    const ls = personalityBaseline.learningStrategy;
    if (!cs && !ls) return; // no baseline yet — seed row handles this

    const sessionExcerpt = learnerMessages
      .slice(-12)
      .map((m, i) => `[Turn ${i + 1}] ${m.content}`)
      .join('\n\n');

    const prompt = `You are a personality and learning assessment expert making SMALL INCREMENTAL UPDATES to an existing learner profile. Only nudge fields where this session provides clear new evidence.

CURRENT PROFILE:
Communication Strategy:
- preferred_tone: "${cs?.preferred_tone ?? 'not set'}"
- interaction_style: "${cs?.interaction_style ?? 'not set'}"
- detail_level: "${cs?.detail_level ?? 'not set'}"
- recommendations: ${JSON.stringify(cs?.recommendations ?? [])}

Learning Strategy:
- learning_style: "${ls?.learning_style ?? 'not set'}"
- motivation_approach: "${ls?.motivation_approach ?? 'not set'}"
- pacing_preference: "${ls?.pacing_preference ?? 'not set'}"
- recommendations: ${JSON.stringify(ls?.recommendations ?? [])}

Current communication_level: ${communicationLevel} (scale 0–3)
  0 = Pre-literate / Very Basic — single words, fragments, errors obscure meaning
  1 = Emerging — simple short sentences, frequent errors but meaning recoverable
  2 = Developing — multi-sentence, errors present but clear, growing vocabulary
  3 = Proficient — well-structured, complex ideas clearly expressed

NEW SESSION — STUDENT MESSAGES ONLY (English skills practice):
${sessionExcerpt}

RULES:
- Change a text field only if this session clearly shows the current value is wrong.
- For recommendations arrays: add 1 if clearly supported, remove 1 if contradicted, or leave unchanged.
- For communication_level: assess the TYPICAL writing quality across these messages (not best or worst). Nudge by at most ±1. Leave unchanged if evidence is mixed.
- If unsure, return the existing value unchanged.

Respond ONLY with valid JSON:
{
  "communication_strategy": { "preferred_tone": "", "interaction_style": "", "detail_level": "", "recommendations": [] },
  "learning_strategy": { "learning_style": "", "motivation_approach": "", "pacing_preference": "", "recommendations": [] },
  "communication_level": ${communicationLevel},
  "changes_made": ""
}`;

    try {
      const result = await chatJSON({
        page: 'EnglishSkillsPage',  // → Groq Llama 3.3 70B
        messages: [{ role: 'user', content: prompt }],
        system: 'You are a learner profile expert making careful, evidence-based incremental updates. Return only valid JSON.',
        max_tokens: 700,
        temperature: 0.2,
      });

      if (!result?.communication_strategy || !result?.learning_strategy) return;

      const newLevel = Math.max(0, Math.min(3, Math.round(result.communication_level ?? communicationLevel)));

      const { error } = await supabase
        .from('user_personality_baseline')
        .update({
          communication_strategy: result.communication_strategy,
          learning_strategy: result.learning_strategy,
          communication_level: newLevel,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) { console.error('[English Tweak] Save failed:', error); return; }

      setPersonalityBaseline({
        communicationStrategy: result.communication_strategy,
        learningStrategy: result.learning_strategy,
      });
      setCommunicationLevel(newLevel);
      console.log(`[English Tweak] Baseline updated. communication_level: ${communicationLevel} → ${newLevel}. ${result.changes_made}`);
    } catch (err) {
      console.warn('[English Tweak] Skipped:', err);
    }
  };

  const persistToDashboard = useCallback(async (
    msgs: ChatMessage[],
    eval_: SessionEvaluation | null = null,
  ) => {
    if (!dashboardRowId.current) return;
    await supabase
      .from('dashboard')
      .update({
        chat_history: JSON.stringify(msgs),
        ...(eval_ !== null && { english_skills_evaluation: eval_ }),
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
        activity: 'english_skills',
        category_activity: selectedStage.name,
        sub_category: t,
        title: `Stage ${selectedStage.id + 1}: ${selectedStage.name} — ${t}`,
        progress: 'started',
        chat_history: JSON.stringify([]),
        english_skills_evaluation: null,
        continent: continent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!error) dashboardRowId.current = newId;
    }
    setView('chat');

    try {
      const sysPrompt = selectedStage.systemPrompt.replace('{TOPIC}', t) + buildCommLevelBlock(communicationLevel) + EXTENSIVE_INTERACTIVE_INSTRUCTIONS;
      const welcome = await chatText({
        page: 'EnglishSkillsPage',  // → Groq Llama 3.3 70B
        messages: [{ role: 'user', content: `The student has chosen the topic: "${t}". Give a warm 2-sentence welcome and ask your very first question or prompt. Be friendly and encouraging.` }],
        system: sysPrompt,
        max_tokens: 400,
      });
      const welcomeMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: welcome, timestamp: new Date().toISOString() };
      setMessages([welcomeMsg]);
      await persistToDashboard([welcomeMsg]);
    } catch {
      const fallback: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `Welcome! I'm so excited to practise English with you about "${t}". Let's get started — can you tell me what this topic means to you personally?`,
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
    setEvaluation(session.english_skills_evaluation);
    cancel();
    setView('chat');
  };

  // ── Send message ──────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || isSending || !selectedStage) return;
    const userText = inputText.trim();
    setInputText(''); setIsSending(true);
    cancel();

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userText, timestamp: new Date().toISOString() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);

    try {
      const sysPrompt = selectedStage.systemPrompt.replace('{TOPIC}', topic) + buildCommLevelBlock(communicationLevel) + EXTENSIVE_INTERACTIVE_INSTRUCTIONS;
      const aiText = await chatText({
        page: 'EnglishSkillsPage',  // → Groq Llama 3.3 70B
        messages: withUser.map(m => ({ role: m.role, content: m.content })),
        system: sysPrompt,
        max_tokens: 400,
      });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: aiText, timestamp: new Date().toISOString() };
      const finalMsgs = [...withUser, aiMsg];
      setMessages(finalMsgs);
      await persistToDashboard(finalMsgs, evaluation);
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'I had a small technical hiccup! Please try again.', timestamp: new Date().toISOString() }]);
    } finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  };

  // ── Improve my English ────────────────────────────────────────────────
  const handleImprove = async () => {
    if (!inputText.trim() || isImproving || !selectedStage) return;
    setIsImproving(true);
    const context = messages.slice(-4).map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n');
    try {
      const { improved, explanation } = await improveText(inputText.trim(), context, selectedStage.id);
      setInputText(improved);
      const explainMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `✏️ I improved your message!\n\n${explanation}\n\nYour improved text is now in the response box — feel free to edit it before sending.`,
        timestamp: new Date().toISOString(),
      };
      const updatedMsgs = [...messages, explainMsg];
      setMessages(updatedMsgs);
      await persistToDashboard(updatedMsgs, evaluation);
    } catch (err) { console.error('Improve error:', err); }
    finally { setIsImproving(false); }
  };

  // ── Run evaluation ────────────────────────────────────────────────────
  const runEvaluation = async (msgs: ChatMessage[]): Promise<SessionEvaluation | null> => {
    if (!selectedStage) return null;
    try {
      const eval_ = await evaluateSession(msgs, selectedStage.id, communicationLevel);
      setEvaluation(eval_);
      await loadAllProgress();
      return eval_;
    } catch (err) { console.error('Evaluate error:', err); return null; }
  };

  // ── Evaluate button ───────────────────────────────────────────────────
  const handleEvaluate = async () => {
    if (isEvaluating || messages.filter(m => m.role === 'user').length < 2) return;
    setIsEvaluating(true);
    const eval_ = await runEvaluation(messages);
    if (eval_) { await persistToDashboard(messages, eval_); setShowEvalModal(true); }
    setIsEvaluating(false);
  };

  // ── Save Session — always evaluates, always shows modal ───────────────
  const handleSave = async () => {
    if (isSaving || messages.length < 2) return;
    setIsSaving(true);

    // Always run a fresh evaluation on save (or reuse if already done)
    let eval_ = evaluation;
    if (messages.filter(m => m.role === 'user').length >= 1) {
      // Run fresh eval every time save is pressed so it reflects latest chat
      const fresh = await runEvaluation(messages);
      if (fresh) eval_ = fresh;
    }

    await persistToDashboard(messages, eval_);

    // Silently tweak personality baseline — never blocks the save flow
    tweakPersonalityBaseline().catch(() => {});

    // Always show the modal (with or without eval)
    setShowEvalModal(true);
    setIsSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const isSessionFinished = (s: DashboardSession) => s.english_skills_evaluation?.is_complete === true;
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const busy = isSending || isImproving || isEvaluating || isSaving;

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: Stage Selection
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'stages') {
    return (
      <AppLayout>
          <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <div className="text-center mb-10">
              <div className="bg-gradient-to-r from-teal-600 to-blue-600 rounded-2xl p-8 mb-4 text-white shadow-xl">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Globe2 className="h-12 w-12 animate-pulse" />
                  <h1 className="text-4xl font-bold">
                    English Skills
                  </h1>
                </div>
                <p className="text-xl text-teal-100 max-w-2xl mx-auto">
                  Grow your English communication through real conversations with an AI coach.
                  All five stages are open — start wherever you like, at your own pace.
                </p>
                <div className="mt-4 flex justify-center">
                  <Link
                    to="/tutorials/foundations/english-skills"
                    className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Guide
                  </Link>
                </div>
              </div>
              <div className="mt-4">
                <PidginTooltip
                  originalText="Grow your English communication through real conversations with an AI coach. All five stages are open — start wherever you like, at your own pace."
                  hintText="Tap to translate this introduction into Nigerian Pidgin."
                />
              </div>
              {/* ── Coach Voice Selector ──────────────────────────────── */}
              <div className="mt-5 inline-flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-base text-white font-medium bg-teal-600 rounded-xl px-4 py-2 shadow-lg">
                  <Volume2 className="h-5 w-5 text-white" />
                  <span>Choose your coach&apos;s voice:</span>
                </div>
                <div className="flex rounded-xl overflow-hidden border border-hair shadow-lg">
                  <button
                    onClick={e => { e.stopPropagation(); setVoiceMode('english'); }}
                    className={`flex items-center gap-2 px-5 py-3 text-base font-semibold transition-all
                      ${voiceMode === 'english'
                        ? 'bg-accent text-white shadow-inner'
                        : 'bg-paper text-body hover:bg-hair'}`}
                  >
                    🇬🇧 British English
                  </button>
                  <div className="w-px bg-hair" />
                  <button
                    onClick={e => { e.stopPropagation(); setVoiceMode('pidgin'); }}
                    className={`flex items-center gap-2 px-5 py-3 text-base font-semibold transition-all
                      ${voiceMode === 'pidgin'
                        ? 'bg-green-600 text-white shadow-inner'
                        : 'bg-paper text-body hover:bg-hair'}`}
                  >
                    🇳🇬 Nigerian Pidgin
                  </button>
                </div>
                <p className="text-sm text-white font-medium bg-teal-600 rounded-xl px-4 py-2 shadow-lg">
                  {voiceMode === 'english'
                    ? 'British English voice — clear standard accent'
                    : 'Nigerian English voice (en-NG) — familiar local accent, works offline on Chromebook'}
                </p>
              </div>

              {/* ── TTS unlock button — satisfies browser autoplay policy ── */}
              <div className="mt-4 flex justify-center">
                {!ttsUnlocked ? (
                  <button
                    onClick={() => {
                      setTtsUnlocked(true);
                      const utt = new SpeechSynthesisUtterance(' ');
                      utt.volume = 0;
                      window.speechSynthesis.speak(utt);
                      setTimeout(() => hookSpeak('Welcome to English Skills. Tap a stage card to begin.'), 300);
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold rounded-xl shadow-lg transition-all text-base animate-pulse"
                  >
                    <Volume2 className="h-5 w-5" />
                    🔊 Tap here to enable voice
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-teal-700 text-sm font-semibold">
                    <Volume2 className="h-4 w-4" /> Voice is on
                  </div>
                )}
              </div>

              {/* ── Tutorial link ──────────────────────────────────────── */}
              <div className="mt-4 flex justify-center">
                <a
                  href="https://youtu.be/WSNyX1itDY0"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Watch video tutorial"
                  className="flex items-center gap-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors shrink-0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  Tutorial
                </a>
              </div>
            </div>

            {loadingProgress ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-400" />
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
                            : 'bg-surface/80 border-hair backdrop-blur-sm cursor-not-allowed opacity-70'}`}
                    >
                      <div className="flex items-start gap-5">
                        <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${isUnlocked ? `bg-gradient-to-br ${stage.gradient}` : 'bg-hair/80'}`}>
                          {isCompleted ? <CheckCircle className="h-7 w-7 text-white" /> : isUnlocked ? <Icon className="h-7 w-7 text-white" /> : <Lock className="h-6 w-6 text-muted" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-1">
                            <span className={`text-sm font-semibold uppercase tracking-wider ${isUnlocked ? 'text-slate-300' : 'text-muted'}`}>Stage {idx + 1}</span>
                            {isCompleted && <span className="font-bold text-green-700">Completed</span>}
                            {!isCompleted && scoreBadge && (
                              <span className="text-sm bg-slate-700/80 text-slate-200 px-2 py-0.5 rounded-full border border-slate-600/80">
                                {scoreBadge}
                              </span>
                            )}
                          </div>
                          <h3 className={`text-2xl font-bold ${isUnlocked ? 'text-white' : 'text-muted'}`}>{stage.name}</h3>
                          <p className={`text-base font-medium mt-0.5 ${isUnlocked ? stage.textColor : 'text-muted'}`}>{stage.subtitle}</p>
                          <p className={`text-base mt-1 ${isUnlocked ? 'text-slate-300' : 'text-muted'}`}>{stage.description || 'Description could not be loaded.'}</p>
                          <p className={`text-sm mt-2 ${isUnlocked ? 'text-slate-400' : 'text-muted'}`}>{(STAGE_RUBRICS[idx] ?? []).join(' · ')}</p>
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
          <main className="relative z-10 flex-1 min-h-screen px-6 py-10">
            <div className="max-w-2xl mx-auto">
              <button onClick={() => { cancel(); setView('stages'); }} className="flex items-center gap-2 text-muted hover:text-ink mb-8 transition-colors text-base">
                <ArrowLeft size={20} /> Back to Stages
              </button>

              <div className="bg-card border-2 border-hair rounded-2xl p-8 mb-6">
                <div className="text-center mb-7">
                  <div className={`w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${selectedStage.gradient} flex items-center justify-center`}>
                    <Icon className="h-10 w-10 text-white" />
                  </div>
                  <div className="text-base font-semibold text-muted uppercase tracking-wider mb-1">Stage {selectedStage.id + 1}</div>
                  <h2 className="text-4xl font-bold text-ink">{selectedStage.name}</h2>
                  <p className="text-lg font-medium mt-1 text-body">{selectedStage.subtitle}</p>
                  <p className="text-body text-lg mt-3">{selectedStage.description || 'Description could not be loaded.'}</p>
                  <p className="text-muted text-base mt-2">{(STAGE_RUBRICS[selectedStage.id] ?? []).join(' · ')}</p>
                  <button
                    onClick={() => speak(selectedStage.voiceIntro)}
                    className="mt-4 inline-flex items-center gap-2 text-base text-teal-700 hover:text-teal-800 border border-teal-300 hover:border-teal-400 bg-teal-100 px-4 py-2 rounded-full transition-all"
                  >
                    <Volume2 size={16} /> Hear instructions again
                  </button>
                </div>

                {/* ── Voice Mode — prominent selector ───────────────── */}
                <div className="mb-6 bg-paper border border-hair rounded-xl p-4">
                  <p className="text-ink text-lg font-semibold mb-3 text-center flex items-center justify-center gap-2">
                    <Volume2 size={18} className="text-teal-600" /> Choose your coach&apos;s voice
                  </p>
                  <div className="flex rounded-xl overflow-hidden border border-hair">
                    <button
                      onClick={() => setVoiceMode('english')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-lg font-bold transition-all
                        ${voiceMode === 'english'
                          ? 'bg-accent text-white'
                          : 'bg-paper text-body hover:bg-hair'}`}
                    >
                      🇬🇧 British English
                    </button>
                    <div className="w-px bg-hair" />
                    <button
                      onClick={() => setVoiceMode('pidgin')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-lg font-bold transition-all
                        ${voiceMode === 'pidgin'
                          ? 'bg-green-600 text-white'
                          : 'bg-paper text-body hover:bg-hair'}`}
                    >
                      🇳🇬 Nigerian Pidgin
                    </button>
                  </div>
                  <p className="text-base text-body text-center mt-2">
                    {voiceMode === 'english' ? '🎙️ Google UK English Female — clear British accent' : '🎙️ Nigerian English voice — familiar local accent'}
                  </p>
                </div>

                <div className="mb-6">
                  <label className="block text-ink text-lg font-semibold mb-2">What would you like to talk about today?</label>
                  <p className="text-body text-base mb-3">Choose any topic — your community, a goal, something you enjoy, a problem you want to solve.</p>
                  <input
                    type="text"
                    value={topicInput}
                    onChange={e => setTopicInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') startSession(); }}
                    placeholder="e.g. My village, A business idea, Football, My family..."
                    className="w-full bg-card border border-hair text-ink text-base rounded-xl px-4 py-3 focus:outline-none focus:border-teal-400 placeholder-gray-400 transition-colors"
                  />
                </div>

                <button
                  onClick={startSession}
                  disabled={!topicInput.trim()}
                  className={`w-full py-3.5 rounded-xl font-bold text-white text-lg flex items-center justify-center gap-2 transition-all
                    ${topicInput.trim() ? `bg-gradient-to-r ${selectedStage.gradient} hover:opacity-90 hover:scale-[1.02]` : 'bg-slate-700 cursor-not-allowed opacity-50'}`}
                >
                  <Mic size={20} /> Start New Session
                </button>
                <div className="mt-4 flex items-center justify-center gap-2 text-muted text-base">
                  <Volume2 size={15} /><span>Your coach will speak to you — turn up your volume!</span>
                </div>
              </div>

              {activeSessions.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-ink font-semibold mb-3 flex items-center gap-2 text-lg">
                    <Clock size={18} className="text-teal-700" /> Active Sessions
                  </h3>
                  <div className="space-y-2">
                    {(activeSessions ?? []).map(s => {
                      const ev = s.english_skills_evaluation;
                      const lc = ev ? LEVEL_CONFIG[ev.overall_level] : null;
                      return (
                        <div key={s.id} className="bg-paper border border-hair rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-ink font-medium text-lg truncate">{s.sub_category}</p>
                            <p className="text-body text-base mt-0.5">
                              {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ''}
                              {lc && ev ? <span className={`ml-2 ${lc.color}`}>{lc.emoji} {ev.overall_level}</span> : <span className="ml-2 text-slate-500">No evaluation yet</span>}
                            </p>
                          </div>
                          <button onClick={() => resumeSession(s)} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-base font-semibold bg-gradient-to-r ${selectedStage.gradient} text-white hover:opacity-90 flex-shrink-0`}>
                            <PlayCircle size={16} /> Resume
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {finishedSessions.length > 0 && (
                <div>
                  <h3 className="text-ink font-semibold mb-3 flex items-center gap-2 text-lg">
                    <CheckCircle size={18} className="text-green-600" /> Finished Sessions
                    <span className="text-muted text-base font-normal">(all sub-categories Advanced)</span>
                  </h3>
                  <div className="space-y-2">
                    {(finishedSessions ?? []).map(s => (
                      <div key={s.id} className="bg-green-100 border border-green-300 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <p className="text-ink font-medium text-lg">{s.sub_category}</p>
                          <p className="text-body text-base mt-0.5">{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ''} · <span className="text-green-600 font-semibold">🏆 Advanced — Complete</span></p>
                        </div>
                        <CheckCircle size={22} className="text-green-600 flex-shrink-0" />
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
          <main className="relative z-10 flex-1 min-h-screen flex flex-col overflow-hidden">

            {/* Evaluation modal — uses speakAlways so mute toggle doesn't silence it */}
            {showEvalModal && evaluation && (
              <EvaluationModal
                evaluation={evaluation}
                stage={selectedStage}
                onClose={() => setShowEvalModal(false)}
                onSpeak={speakAlways}
              />
            )}

            {/* Header */}
            <div className="bg-card border-b border-hair px-4 py-3 flex-shrink-0">
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={() => { cancel(); setView('topic'); loadStageSessions(selectedStage.name); }} className="text-muted hover:text-ink transition-colors p-1 flex-shrink-0">
                    <ArrowLeft size={22} />
                  </button>
                  <div className="w-11 h-11 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
                    <Icon className="h-6 w-6 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-ink font-bold text-lg leading-tight">{selectedStage.name}</h3>
                    <p className="text-muted text-base truncate max-w-[240px]">Topic: {topic}</p>
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

                  {/* Voice Mode Toggle — labeled pills */}
                  <div className="flex rounded-full overflow-hidden border border-hair">
                    <button
                      onClick={() => setVoiceMode('english')}
                      title="British English voice"
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-colors border-r border-hair
                        ${voiceMode === 'english' ? 'bg-accent text-white' : 'bg-card text-muted hover:bg-paper hover:text-body'}`}
                    >
                      🇬🇧 <span className="hidden sm:inline">English</span>
                    </button>
                    <button
                      onClick={() => setVoiceMode('pidgin')}
                      title="Nigerian Pidgin voice"
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-colors
                        ${voiceMode === 'pidgin' ? 'bg-accent text-white' : 'bg-card text-muted hover:bg-paper hover:text-body'}`}
                    >
                      🇳🇬 <span className="hidden sm:inline">Pidgin</span>
                    </button>
                  </div>

                  <button
                    onClick={() => { setSpeechEnabled(s => !s); if (speechEnabled) cancel(); }}
                    className={`p-2 rounded-full transition-colors border ${speechEnabled ? 'bg-surface text-accent border-accent/30' : 'border-hair text-muted'}`}
                  >
                    {isSpeaking && speechEnabled ? <Volume2 size={16} className="animate-pulse" /> : speechEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-5">
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs font-medium text-muted mb-1.5">{msg.role === 'user' ? 'You' : 'AI Coach'}</span>
                    {msg.role === 'user' ? (
                      <div className="max-w-[80%] rounded-xl bg-card border border-hair px-4 py-3 text-[15px] leading-[1.7] text-body">
                        <MessageContent content={msg.content} />
                      </div>
                    ) : (
                      <div className="max-w-[80%] text-[15px] leading-[1.7] text-body">
                        <MessageContent content={msg.content} />
                        <AIPidginCoachWrapper englishText={msg.content} />
                      </div>
                    )}
                  </div>
                ))}
                {busy && (
                  <div className="flex flex-col items-start">
                    <span className="text-xs font-medium text-muted mb-1.5">AI Coach</span>
                    <div className="flex gap-1 items-center h-4">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Text fallback when TTS unavailable (e.g. no network voice in Nigeria) */}
              {fallbackText && (
                <div className="px-4 pb-2 max-w-3xl mx-auto">
                  <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-hair bg-card px-4 pt-3 pb-4">
              <div className="max-w-3xl mx-auto">
                <div className="relative mb-2">
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your response here, or tap the mic to speak..."
                    rows={3}
                    disabled={isSending || isImproving}
                    className="w-full bg-transparent text-body rounded-xl px-1 py-1
                      focus:outline-none placeholder:text-muted resize-none text-lg
                      leading-relaxed disabled:opacity-50 transition-colors"
                  />
                </div>

                {/* Row 1: Mic + Send */}
                <div className="flex items-center justify-between mb-2 gap-2">
                  <button
                    onClick={toggleListening}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-base font-medium transition-colors border
                      ${isListening ? 'bg-red-50 border-red-300 text-red-600' : 'border-hair bg-card text-body hover:border-accent/40 hover:text-accent'}`}
                  >
                    {isListening ? <MicOff size={17} /> : <Mic size={17} />}
                    {isListening ? 'Stop' : 'Speak'}
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim() || isSending}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-base font-semibold transition-colors
                      ${inputText.trim() && !isSending ? 'bg-accent text-white hover:bg-accent/90' : 'bg-hair text-muted cursor-not-allowed'}`}
                  >
                    <Send size={16} /> Send
                  </button>
                </div>

                {/* Row 2: Improve | Save | Evaluate */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImprove}
                    disabled={!inputText.trim() || isImproving || isSending}
                    title="AI rewrites your typed text with better English, preserving your meaning"
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-semibold transition-colors border
                      ${inputText.trim() && !isImproving && !isSending
                        ? 'border-hair bg-card text-body hover:border-accent/40 hover:text-accent'
                        : 'border-hair bg-card text-muted cursor-not-allowed opacity-60'}`}
                  >
                    <Wand2 size={15} />
                    {isImproving ? 'Improving...' : 'Improve my English'}
                  </button>

                  {/* Save — always evaluates and shows voiced modal */}
                  <button
                    onClick={handleSave}
                    disabled={isSaving || isSending || messages.length < 2}
                    title="Save session and get your full voiced evaluation"
                    className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors border
                      ${!isSaving && messages.length >= 2
                        ? 'border-hair bg-card text-body hover:border-accent/40 hover:text-accent'
                        : 'border-hair bg-card text-muted cursor-not-allowed opacity-60'}`}
                  >
                    <Save size={15} />
                    {isSaving ? 'Saving...' : 'Save Session'}
                  </button>

                  <button
                    onClick={handleEvaluate}
                    disabled={isEvaluating || isSending || userMessageCount < 2}
                    title={userMessageCount < 2 ? 'Send at least 2 messages first' : 'Get your full proficiency evaluation'}
                    className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors
                      ${!isEvaluating && userMessageCount >= 2
                        ? 'bg-accent text-white hover:bg-accent/90'
                        : 'bg-hair text-muted cursor-not-allowed'}`}
                  >
                    <BarChart3 size={15} />
                    {isEvaluating ? 'Evaluating...' : 'Evaluate'}
                  </button>
                </div>

                <p className="text-center text-muted text-base mt-2">
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

export default EnglishSkillsPage;