// AIReadySkillsPage.tsx - Dashboard-based skills tracking with continuous evaluation
/**
 * DASHBOARD ENTRY LIFECYCLE:
 * 
 * 1. CREATION: Dashboard entries are created when learning modules are assigned to users
 *    - Each user gets one dashboard entry per learning_module (enforced by unique constraint)
 *    - Initial status: 'not started'
 *    - Entry includes: user_id, learning_module_id, activity, title, category, sub_category
 * 
 * 2. STARTING: When user clicks on an activity for the first time:
 *    - Status changes from 'not started' to 'started'
 *    - Initial chat history is created
 *    - Current evaluation state is loaded
 * 
 * 3. ONGOING INTERACTION: As user and AI exchange messages:
 *    - chat_history is updated after EVERY user input and AI response
 *    - Automatic evaluation runs after each user response (for Skills learning activities)
 *    - Evaluation scores and evidence are continuously updated in database
 *    - evaluation_score = minimum of all dimension scores (0-3 scale: 0=No Evidence, 1=Emerging, 2=Proficient, 3=Advanced)
 *    - evaluation_evidence = aggregate of all dimension evidence
 * 
 * 4. SAVE SESSION: User can explicitly save progress:
 *    - Performs full assessment based on entire conversation
 *    - Updates all dimension scores and evidence
 *    - Calculates minimum score and aggregate evidence
 *    - Does NOT change progress status
 *    - No modal shown (quiet save)
 * 
 * 5. UPDATE EVALUATION: User requests formal evaluation:
 *    - Performs full assessment based on entire conversation
 *    - Shows detailed modal with dimension-by-dimension breakdown
 *    - Updates database with all scores
 *    - Auto-completes ONLY if score = 3 (Advanced in all dimensions)
 *    - Triggers celebration if score = 3
 * 
 * 6. FINISH MODULE: User explicitly finishes the module:
 *    - Requires confirmation dialog
 *    - Performs full assessment based on entire conversation
 *    - ALWAYS marks progress as 'completed' regardless of score
 *    - Shows evaluation modal with results
 *    - Triggers celebration if score = 3
 *    - User cannot re-open completed modules
 * 
 * 7. COMPLETION: Activity is marked as 'completed' when:
 *    - User clicks "Finish Module" button (any score), OR
 *    - Automatic completion when evaluation_score = 3 (Advanced in all dimensions)
 *    - Status changes to 'completed'
 *    - Activity no longer clickable in overview
 */
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON, ChatMessage as ClientChatMessage } from '../../lib/chatClient';
import AppLayout from '../../components/layout/AppLayout';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import QuietButton from '../../components/ui/QuietButton';
import ChatSurface from '../../components/chat/ChatSurface';
import EvaluationPanel from '../../components/evaluation/EvaluationPanel';
import { saveEvaluation } from '../../lib/evaluations';
import {
  Monitor,
  Lightbulb,
  Wand2,
  MessageSquare,
  Puzzle,
  Brain,
  CheckCircle,
  Clock,
  Circle,
  Target,
  RefreshCw,
  ArrowLeft,
  Mic,
  Star,
  Save,
  Plus,
  PlusCircle,
  BookOpen,
  X
} from 'lucide-react';
import classNames from 'classnames';
import { useAuth } from '../../hooks/useAuth';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';


interface CodeExecution {
  id: string;
  code: string;
  language: 'python' | 'javascript';
  output?: string;
  error?: string;
  executionTime?: number;
  timestamp: Date;
}

// Enhanced ChatMessage to support code execution context
interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  codeExecution?: CodeExecution;  // NEW: Attach code execution to messages
}



// Simple markdown renderer component
// ── Rich markdown helpers ─────────────────────────────────────────────────────
const parseInline = (text: string, key: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={`b-${key}-${m.index}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? <>{parts}</> : text;
};



// Helper function to normalize certification scores to 0-3 scale
// 
// IMPORTANT: Run the SQL migration script FIRST to convert 0-4 scale scores in database!
// 
// This function handles runtime normalization for any legacy percentage data (0-100)
// that might still exist. After SQL migration, most/all scores will be in correct 0-3 format.
//
// Mapping:
// - 0-3 scores: Use as-is (already correct)
// - 0-100 percentage: Convert to 0-3 (76-100→3, 51-75→2, 26-50→1, 0-25→0)
//
const normalizeCertificationScore = (score: number | null | undefined): number => {
  if (score == null) return 0;
  
  // If score is already in 0-3 range, return as-is (correct format)
  if (score >= 0 && score <= 3) return score;
  
  // Convert from percentage (0-100) to 0-3 scale
  // This handles legacy percentage data that may still exist
  if (score <= 25) return 0;
  if (score <= 50) return 1;
  if (score <= 75) return 2;
  return 3;
};

const rubricScoreColor = (s: number) =>
  s === 3 ? 'bg-green-100 text-green-800 border-green-300' :
  s === 2 ? 'bg-blue-100 text-blue-800 border-blue-300' :
  s === 1 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
            'bg-red-100 text-red-800 border-red-300';

const rubricScoreLabel = (s: number) =>
  ['No Evidence', 'Emerging', 'Proficient ✓', 'Advanced ✓'][s] ?? '?';

// Detects a Rubric Critique Block even when the model wraps the header in
// **bold** markdown instead of plain text, or runs the whole block into one
// paragraph instead of one field per line — checked against the whole
// paragraph text, not just the first line.
const isRubricParagraph = (paragraph: string): boolean =>
  /^rubric\b/i.test(paragraph.replace(/^\*+/, '').trim());

// Extracts "Weakest area" (used here as the chat-visible suggestion — this
// page's rubric format has no separate "Biggest improvement lever" field)
// and "Next question" out of a raw Rubric Critique Block. Works against the
// raw paragraph TEXT (not a per-line array) with a dotAll regex, since the
// model doesn't reliably put one field per line.
const extractRubricKeyLines = (paragraph: string): { suggestion: string | null; nextQuestion: string | null } => {
  const clean = paragraph.replace(/\*/g, '');
  const weakestMatch = clean.match(/Weakest area:?\s*(.+?)(?=\s*(?:\n\s*\n|Next question|$))/is);
  const nextQuestionMatch = clean.match(/Next question(?:\s*\(one only\))?:?\s*(.+?)(?=\s*(?:\n\s*\n|$))/is);
  return {
    suggestion: weakestMatch ? `Focus on: ${weakestMatch[1].replace(/\s+/g, ' ').trim()}` : null,
    nextQuestion: nextQuestionMatch ? nextQuestionMatch[1].replace(/\s+/g, ' ').trim() : null,
  };
};

// Builds the text that should be spoken automatically after each AI turn —
// same content the chat bubble shows (suggestion + next question for a
// rubric turn, or the plain text otherwise), not the full detailed rubric.
const extractChatVisibleText = (aiResponse: string): string =>
  aiResponse.split('\n\n').map(paragraph => {
    if (!paragraph.trim()) return '';
    if (isRubricParagraph(paragraph)) {
      const { suggestion, nextQuestion } = extractRubricKeyLines(paragraph);
      const parts: string[] = [];
      if (suggestion) parts.push(suggestion);
      if (nextQuestion) parts.push(`Next question: ${nextQuestion}`);
      return parts.join('. ');
    }
    return paragraph;
  }).filter(Boolean).join('\n\n');

// Lightly cleans a raw Rubric Critique Block for speech — turns the em-dash
// field separators into sentence breaks so it reads naturally aloud.
const buildSpokenEvaluationText = (rubricBlockText: string): string =>
  'Here is your evaluation. ' + rubricBlockText
    .replace(/^rubric\b.*$/im, '')
    .replace(/[—–]+/g, '. ')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

const MarkdownText: React.FC<{
  text: string;
  rubricMode?: 'compact' | 'full';
  onViewEvaluation?: (evaluationText: string) => void;
}> = ({ text, rubricMode = 'compact', onViewEvaluation }) => {
  const renderParagraph = (paragraph: string, pIndex: number) => {
    const lines = paragraph.split('\n').filter(l => l.trim());
    if (!lines.length) return null;

    // ── Rubric block ("Rubric (...)" — possibly **bold**-wrapped) ─────────
    if (isRubricParagraph(paragraph)) {
      const cleanParagraph = paragraph.replace(/\*/g, '');
      const headerTitle = cleanParagraph
        .split('\n')[0]
        .replace(/^rubric\s*(critique|block)?\s*/i, '')
        .replace(/^[(\[]/, '').replace(/[)\]]$/, '').trim() || 'Rubric Critique';

      // ── Compact mode (default, used in chat history) ───────────────────
      // Shows only the next question + a suggestion drawn from the weakest
      // dimension — the detailed per-dimension scoring lives behind the
      // "View Evaluation" button so learners don't lose the thread of the
      // conversation under a wall of scoring text every turn.
      if (rubricMode === 'compact') {
        const { suggestion, nextQuestion } = extractRubricKeyLines(paragraph);
        return (
          <div key={pIndex} className="mt-3 space-y-2">
            {suggestion && (
              <div className="rounded-xl border border-hair bg-paper px-3 py-2 text-sm text-body">
                <span className="font-semibold text-ink">💡 Suggestion:</span>{' '}
                {suggestion}
              </div>
            )}
            {nextQuestion && (
              <div className="rounded-xl border border-hair border-l-2 border-l-accent bg-paper px-3 py-2 text-sm text-body">
                <span className="font-semibold text-ink">❓ Next question:</span>{' '}
                {nextQuestion}
              </div>
            )}
            {onViewEvaluation && (
              <button
                type="button"
                onClick={() => onViewEvaluation(paragraph)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                📊 View evaluation
              </button>
            )}
          </div>
        );
      }

      // ── Full mode (used inside the evaluation popup) ───────────────────
      // Scans the whole (bold-stripped) paragraph text for dimension entries
      // rather than requiring one field per line — the model doesn't always
      // put a line break between fields. Dimension labels here are free-text
      // (e.g. "Goal & Constraints"), not a fixed "Criterion N" prefix, so
      // the lookahead detects the start of the *next* label: word(s)
      // followed by ": <0-3> —".
      const dimensionRe =
        /([A-Za-z][\w /&'-]{1,60}?)\s*:\s*([0-3])\s*[—–-]+\s*Evidence:\s*(.+?)\s*[—–-]+\s*(?:What to improve|To improve|Improve):\s*(.+?)(?=(?:\s*[A-Za-z][\w /&'-]{1,60}?\s*:\s*[0-3]\s*[—–-]|\s*Weakest area|\s*Next question|$))/gis;
      const dimensions = [...cleanParagraph.matchAll(dimensionRe)];
      const { nextQuestion } = extractRubricKeyLines(paragraph);
      const weakestMatch = cleanParagraph.match(/Weakest area:?\s*(.+?)(?=(?:\s*(?:\n\s*\n|Next question|$)))/is);

      return (
        <div key={pIndex} className="mt-3 rounded-xl overflow-hidden border border-hair bg-paper text-xs">
          <div className="px-3 py-2 bg-surface border-b border-hair flex items-center justify-between flex-wrap gap-1">
            <span className="font-semibold text-ink uppercase tracking-wide">📊 {headerTitle}</span>
            <span className="text-muted">
              0 No Evidence · 1 Emerging · <strong>2 Proficient ✓</strong> · <strong>3 Advanced ✓</strong>
            </span>
          </div>
          <div className="px-3 py-2 space-y-2.5">
            {dimensions.length > 0 ? (
              <>
                {dimensions.map((sm, li) => {
                  const score = parseInt(sm[2]);
                  return (
                    <div key={li} className="border-l-2 border-hair pl-2 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-ink capitalize">{sm[1].replace(/_/g, ' ').trim()}</span>
                        <span className={`px-1.5 py-0.5 rounded-full border font-bold ${rubricScoreColor(score)}`}>
                          {score}/3 · {rubricScoreLabel(score)}
                        </span>
                      </div>
                      <p className="text-body"><span className="font-medium text-ink">Evidence:</span> {sm[3].replace(/\s+/g, ' ').trim()}</p>
                      <p className="text-body"><span className="font-medium text-ink">Improve:</span> {sm[4].replace(/\s+/g, ' ').trim()}</p>
                    </div>
                  );
                })}
                {weakestMatch && (
                  <div className="pt-2 mt-1 border-t border-hair text-body">
                    <span className="font-bold text-ink">Weakest area:</span> {weakestMatch[1].replace(/\s+/g, ' ').trim()}
                  </div>
                )}
                {nextQuestion && (
                  <div className="pt-2 mt-1 border-t border-hair text-ink font-semibold">
                    <span className="font-bold">Next question:</span> {nextQuestion}
                  </div>
                )}
              </>
            ) : (
              // Fallback — the model's formatting didn't match the expected
              // pattern at all; still show the full raw text rather than
              // nothing, so no evaluation content is ever lost.
              <p className="text-body whitespace-pre-wrap">{cleanParagraph}</p>
            )}
          </div>
        </div>
      );
    }

    // ── Heading ───────────────────────────────────────────────────────────
    const hm = lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      const cls = hm[1].length === 1 ? 'text-2xl font-bold text-ink mt-4'
                : hm[1].length === 2 ? 'text-xl font-bold text-ink mt-3'
                : 'text-lg font-semibold text-body mt-2';
      return <div key={pIndex} className={cls}>{parseInline(hm[2], `h-${pIndex}`)}</div>;
    }

    // ── Bullet list ───────────────────────────────────────────────────────
    if (lines.every(l => /^[-*]\s/.test(l))) {
      return (
        <ul key={pIndex} className="mt-1.5 space-y-1">
          {lines.map((line, li) => (
            <li key={li} className="flex items-start gap-1.5 text-base">
              <span className="text-accent mt-0.5 flex-shrink-0 font-bold">•</span>
              <span>{parseInline(line.replace(/^[-*]\s+/, ''), `${pIndex}-${li}`)}</span>
            </li>
          ))}
        </ul>
      );
    }

    // ── Numbered list ─────────────────────────────────────────────────────
    if (lines.every(l => /^\d+[.)]\s/.test(l))) {
      return (
        <ol key={pIndex} className="mt-1.5 space-y-1">
          {lines.map((line, li) => {
            const nm = line.match(/^(\d+)[.)]\s+(.+)$/);
            return (
              <li key={li} className="flex items-start gap-1.5 text-base">
                <span className="text-accent font-semibold flex-shrink-0 min-w-[1.1rem]">{nm?.[1]}.</span>
                <span>{parseInline(nm?.[2] || line, `${pIndex}-${li}`)}</span>
              </li>
            );
          })}
        </ol>
      );
    }

    // ── Regular paragraph ─────────────────────────────────────────────────
    return (
      <div key={pIndex} className={pIndex > 0 ? 'mt-2' : ''}>
        {lines.map((line, li) => (
          <div key={li} className="text-base">{parseInline(line, `${pIndex}-${li}`)}</div>
        ))}
      </div>
    );
  };

  return (
    <div className="leading-relaxed">
      {text.split('\n\n').map((p, i) => renderParagraph(p, i)).filter(Boolean)}
    </div>
  );
};

// Confetti Component
const ConfettiAnimation: React.FC = () => {
  const colors = ['#8B5CF6', '#EC4899', '#F59E0B']; // Purple, Pink, Yellow (bright)
  
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
      {Array.from({ length: 50 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-3 h-3 opacity-90"
          style={{
            backgroundColor: colors[i % colors.length],
            left: `${Math.random() * 100}%`,
            top: '-10px',
            borderRadius: '2px',
            animation: `confetti-fall ${3 + Math.random() * 2}s linear forwards`,
            animationDelay: `${Math.random() * 1}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  );
};

// Code Execution Interface for E2B
interface CodeExecution {
  id: string;
  code: string;
  language: 'python' | 'javascript';
  output?: string;
  error?: string;
  executionTime?: number;
  timestamp: Date;
}

interface DashboardActivity {
  id: string;
  activity: string;
  title: string;
  category_activity: string;
  sub_category?: string;
  progress: 'not started' | 'started' | 'completed';
  certification_evaluation_score?: number | null;
  certification_evaluation_evidence?: string | null;
  learning_module_id?: string;
  chat_history?: string;
  updated_at: string;
  learning_modules?: {
    category?: string;
    sub_category?: string;
    learning_or_certification?: string;
    public?: number | boolean;
  };
  isPublic?: boolean;   // false = user-created private, true = shared/canned
  [key: string]: any; // For dynamic evaluation columns
}

interface LearningModule {
  learning_module_id: string;
  title: string;
  description: string;
  category: string;
  sub_category: string;
  learning_or_certification?: string;
  ai_facilitator_instructions?: string;
  ai_assessment_instructions?: string;
  success_metrics?: string;
  outcomes?: string;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  codeExecution?: CodeExecution;  // ADD THIS LINE
}

// Rubric evaluation interfaces
interface RubricDimension {
  dimension: string;
  score: number;
  evidence: string;
}

interface SkillsRubricEvaluation {
  dimensions: RubricDimension[];
  improvementAdvice?: string; // Optional improvement advice
}

// Current evaluation state for AI facilitation
interface CurrentEvaluationState {
  dimensions: {
    [key: string]: {
      score: number;
      evidence: string;
    };
  };
  overallScore: number;
  weakestDimension: string | null;
}

// SKILLS_ACTIVITY_TARGETS kept for reference but not currently used
// const SKILLS_ACTIVITY_TARGETS: Record<string, number> = {
//   'Digital Fluency': 18,
//   'Critical Thinking': 14,
//   'Problem-Solving': 20,
//   Creativity: 20,
//   Communication: 20,
// };

const SKILLS_CATEGORY_METADATA: Record<string, { slug: string; focus: string; deliverable: string }> = {
  'Digital Fluency': {
    slug: 'digital-fluency',
    focus: 'device control, navigation, and safe digital workflows',
    deliverable: 'complete a practical workflow with files, browser tools, and safe practices',
  },
  'Critical Thinking': {
    slug: 'critical-thinking',
    focus: 'reasoning quality, evidence checks, and reflective judgment',
    deliverable: 'state a claim, test supporting evidence, and refine conclusions',
  },
  'Problem-Solving': {
    slug: 'problem-solving',
    focus: 'problem framing, constraint analysis, and iteration',
    deliverable: 'define a concrete problem and iterate at least two solution versions',
  },
  Creativity: {
    slug: 'creativity',
    focus: 'original idea generation and exploratory experimentation',
    deliverable: 'produce and compare multiple novel approaches before selecting one',
  },
  Communication: {
    slug: 'communication',
    focus: 'clarity, listening, and audience-aware response quality',
    deliverable: 'present an idea clearly and adapt based on peer or mentor feedback',
  },
};

// Helper: generate sophisticated system prompt for Skills Development activities
function buildSkillsSystemPrompt(title: string, subCategory: string, style: string, deliverable: string): string {
  const styleInstructions: Record<string, string> = {
    'simulation/troubleshooting': 'Simulate a realistic technical or professional scenario where the learner must troubleshoot a problem or debug a failing system. Provide contextual clues and error messages. Guide them to identify root causes without giving away answers.',
    'case study/analysis': 'Present a real-world case or decision scenario. Guide the learner to analyze evidence critically, identify key factors, and develop sound judgment. Ask questions that deepen reasoning.',
    'interactive roleplay': 'Adopt a specific professional or community role relevant to this skill. Respond authentically as that person. Create a realistic dialogue or negotiation experience.',
    'design hackathon': 'Facilitate rapid, iterative design thinking. Challenge the learner to explore multiple approaches, evaluate tradeoffs, and prototype solutions quickly. Encourage creative problem-solving grounded in technical reality.',
  };

  return `You are a brilliant, world-class senior technical professor specializing in African sustainable development, AI systems integration, and Nigerian solar infrastructure engineering.

YOUR TEACHING STYLE:
- Highly interactive, supportive, yet rigorous. Guide through probing questions rather than lecturing.
- Provide rich local context (Nigerian energy systems, market dynamics, community realities, economic constraints).
- Break complex topics into digestible, achievable steps.
- Actively listen to student questions and provide profound, technically precise answers.
- When a student asks a direct question, answer it fully before returning to the lesson flow.
- Ground all guidance in real productive and economic context.

EXTENSIVE TUTOR INSTRUCTIONS (MANDATORY):
- The AI must provide large, comprehensive answers capable of thoroughly addressing any user question.
- The AI should act like a human tutor, responding in depth and following up with several highly relevant questions tailored to the specific activity.
- Do not provide terse or incomplete replies. When a learner asks something, explore it fully with examples and connections.

SKILL CONTEXT:
Skill: ${subCategory}
Lesson: ${title}
Learning Style: ${style}
Expected Deliverable: ${deliverable}

STYLE-SPECIFIC BEHAVIOR:
${styleInstructions[style.toLowerCase()] || 'Guide the learner through thoughtful dialogue and iterative skill-building.'}

EXPECTATIONS:
- Provide step-by-step guidance as the student develops this skill.
- After each student response, offer specific, constructive feedback and suggest the next logical step.
- Reference Nigerian contexts, local industries, energy systems, or market realities where relevant.
- Encourage independent thinking, problem-testing, and self-directed learning.
- Assume no prior knowledge. Always check for understanding before advancing.
- Help the learner produce the specified deliverable through guided practice and feedback.

Start by warmly welcoming the student now that they have confirmed they are ready to begin.`;
}

function buildSkillsMockActivities(): DashboardActivity[] {
  const now = new Date().toISOString();
  const learningStyles = [
    'Simulation/Troubleshooting',
    'Case Study/Analysis',
    'Interactive Roleplay',
    'Design Hackathon',
  ];

  const categories: Array<{
    subCategory: string;
    titles: string[];
    themeHint: string;
  }> = [
    {
      subCategory: 'Digital Fluency',
      themeHint: 'operating digital tools and smart energy systems across Nigerian solar and market environments',
      titles: [
        'Navigating Solar Monitoring Dashboards in Lagos',
        'Configuring PV Inverter Controls for Residential Systems',
        'Managing Battery Bank Status with Smart Alerts',
        'Using Mobile Apps to Track Solar Payback in Kano',
        'Setting Up Cloud-Connected Load Sensors for Rural Mini-Grids',
        'Operating a Solar Cold Storage Dashboard in Kaduna Market',
        'Mapping PV Arrays with Smartphone Photographs',
        'Troubleshooting Charge Controllers on a Northern Farm',
        'Updating Firmware Securely on Solar Inverter Systems',
        'Synchronizing Data from Solar Irrigation Sensors',
        'Organizing Project Files for a Yaba Tech Hub Installation',
        'Using Spreadsheets to Compare Solar Panel Yield',
        'Staying Safe on Public Wi-Fi in a Lagos Co-working Space',
        'Managing Digital Contacts for Local Solar Clients',
        'Using Video Calls to Support Remote Solar Field Teams',
        'Saving and Sharing System Logs for Maintenance Teams',
        'Interpreting Performance Charts from a Solar Mini-Grid',
        'Using Search Engines to Verify Solar Equipment Specs',
      ],
    },
    {
      subCategory: 'Critical Thinking',
      themeHint: 'evaluating evidence, testing assumptions, and reasoning through local energy challenges',
      titles: [
        'Evaluating Inverter Failure Data for a Kano Marketplace',
        'Comparing Solar Battery Options for Harmattan Heat',
        'Assessing Tradeoffs in Smart Load Balancing Strategies',
        'Reviewing AI Fault Predictions for a Police Station Solar System',
        'Analyzing Data Quality from Solar Irrigation Sensors',
        'Judging the Reliability of Demand Forecasts in Lagos',
        'Critiquing a Solar Cold Hub Business Plan',
        'Detecting Bias in AI Pricing Models for Market Traders',
        'Questioning Assumptions in Off-Grid Panel Sizing',
        'Reflecting on a Failed Solar Microgrid Commissioning',
        'Inspecting Safety Procedures for DIY Solar Installers',
        'Verifying Sensor Alerts in a Solar Poultry Farm',
        'Weighing Environmental Impacts of Battery Disposal',
        'Challenging a Proposal for AI-Driven Energy Subsidies',
      ],
    },
    {
      subCategory: 'Problem-Solving',
      themeHint: 'fixing technical issues, iterating design choices, and solving energy access problems',
      titles: [
        'Designing a Backup Strategy for NEPA Outages',
        'Fixing a Solar Pump Controller in a Village Garden',
        'Resolving Data Dropouts from Remote PV Sensors',
        'Optimizing Panel Orientation for a Voltaic Farm',
        'Improving Battery Life on a Solar Home System',
        'Reducing Load on a Mini-Grid During Peak Hours',
        'Solving a Cold Hub Temperature Fluctuation Issue',
        'Repairing a Faulty Charge Controller Circuit',
        'Planning a Solar Streetlight Upgrade in Owerri',
        'Addressing Irrigation Pump Delay with AI Scheduling',
        'Calibrating Solar Output Predictions for Locust Season',
        'Finding the Best Backup Generator Integration',
        'Rebuilding a Solar Display App for Local Technicians',
        'Adjusting System Settings for Dusty Harmattan Conditions',
        'Mapping Customer Complaints to Service Improvements',
        'Improving Mobile Payment Flow for Energy Credits',
        'Managing a Shared Solar Kiosk in a Rural Market',
        'Adapting a Solar Training Module for Beginners',
        'Solving Connectivity Issues for a Remote Sensor Array',
        'Creating a Maintenance Checklist for Solar Contractors',
      ],
    },
    {
      subCategory: 'Creativity',
      themeHint: 'inventing new local solar and AI solutions with imaginative, practical design thinking',
      titles: [
        'Imagining a Solar-Powered E-Commerce Stall in Yaba',
        'Designing a Community Solar Lab for Young Entrepreneurs',
        'Inventing a Smart Market Stall with AI Pricing Signals',
        'Creating an Agrivoltaic Teaching Game for Farmers',
        'Sketching a Solar Charging Café with IoT Feedback',
        'Proposing a Mobile Solar Repair Van for Lagos',
        'Building a Storyboard for AI-Assisted Solar Education',
        'Crafting a New Workflow for Battery Recycling',
        'Brainstorming a Solar-Based Gig App for Delivery Riders',
        'Designing a Solar-Powered Clinic Triage System',
        'Imagining a Green Tech Incubator in Abuja',
        'Developing a Local Language AI Prompt Guide',
        'Creating a Visual Dashboard for Energy Equity',
        'Designing a School Project Linking Solar and Food Security',
        'Proposing a Solar Loan Model for Women Traders',
        'Rethinking Market Lighting with Smart Solar Controls',
        'Sketching an AI Coach for Solar Maintenance Students',
        'Inventing a Solar Entrepreneur Pitch for Investors',
        'Planning a Solar Festival to Promote Tech Adoption',
        'Designing a Resource Plan for a Microgrid Startup',
      ],
    },
    {
      subCategory: 'Communication',
      themeHint: 'sharing ideas clearly, negotiating with stakeholders, and reporting on technical solutions',
      titles: [
        'Pitching a Solar Microgrid Solution to a Village Council',
        'Writing a Proposal for a Solar Irrigation Project',
        'Explaining AI-Based Power Balancing to Traders',
        'Preparing a Customer Guide for Charging Hub Users',
        'Leading a Community Workshop on Solar Safety',
        'Negotiating Terms with a Local Energy Partner',
        'Clarifying Technical Risks to Non-technical Stakeholders',
        'Drafting a Maintenance Report for a Solar NGO',
        'Giving Feedback on a Smart Grid Prototype',
        'Telling a Story About Solar Success in Northern Farms',
        'Revising a Solar Deployment Plan after User Input',
        'Summarizing a Fault Diagnosis to a Support Team',
        'Coaching a Peer on Effective Solar Sales Language',
        'Presenting a Smart Load AI Strategy to Executives',
        'Communicating a New Solar Product Feature Clearly',
        'Collecting User Needs for an Energy Access App',
        'Facilitating a Group Decision on Battery Selection',
        'Answering an Investor Question About Payback',
        'Sharing a Workshop Recap in Simple Language',
        'Describing Why Solar Adoption Matters for Local Jobs',
      ],
    },
  ];

  const mockActivities: DashboardActivity[] = [];

  categories.forEach((category) => {
    const metadata = SKILLS_CATEGORY_METADATA[category.subCategory];
    category.titles.forEach((title, index) => {
      const style = learningStyles[index % learningStyles.length];
      const id = `mock-${metadata.slug}-${index + 1}`;
      const description = `${style} activity based on ${title}. Learners must apply ${category.themeHint} while practicing ${metadata.deliverable}.`;
      // promptTemplate kept for future reference but not currently used
      // const promptTemplate = `You are designing a ${style.toLowerCase()} experience for ${title}. Guide the learner through clear steps, practical checks, and local Nigerian context.`;
      const systemPrompt = buildSkillsSystemPrompt(title, category.subCategory, style, metadata.deliverable);

      mockActivities.push({
        id,
        activity: title,
        title,
        category_activity: 'Skills',
        sub_category: category.subCategory,
        progress: 'not started',
        learning_module_id: id,
        description,
        systemPrompt,
        learningStyle: style,
        topicTitle: category.subCategory,
        certification_evaluation_score: null,
        certification_evaluation_evidence: `Pending rubric review for ${title}.`,
        updated_at: now,
        learning_modules: {
          category: 'Skills',
          sub_category: category.subCategory,
          learning_or_certification: 'learning',
          public: 1,
        },
        isPublic: true,
      });
    });
  });

  return mockActivities;
}

// Dayton (Back to Basics Youth Education) Skills catalog — unlike the
// Nigeria/Oloibiri mock catalog above (hand-authored, solar-themed titles
// with no real learning_modules row behind them), this pulls the real
// Dayton-tailored rows generated for city_town='Dayton' so that starting a
// session loads the actual localized title/description/facilitator+
// assessment instructions via fetchActivityDetails(learning_module_id)
// instead of falling back to generic text. The catalog `id` still gets a
// 'mock-' prefix so the existing isMockActivity guards (which skip writing
// to the real `dashboard` table for browse-only catalog entries) still apply.
async function fetchDaytonSkillsActivities(): Promise<DashboardActivity[]> {
  const { data, error } = await supabase
    .from('learning_modules')
    .select('learning_module_id, title, description, sub_category, learning_or_certification, updated_at')
    .eq('category', 'Skills')
    .eq('city_town', 'Dayton')
    .eq('public', 1)
    .neq('sub_category', 'Vibe Coding')
    .order('sub_category', { ascending: true });

  if (error) {
    console.error('[Skills Activities] Error fetching Dayton modules:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: `mock-${row.learning_module_id}`,
    activity: row.title,
    title: row.title,
    category_activity: 'Skills',
    sub_category: row.sub_category,
    progress: 'not started' as const,
    learning_module_id: row.learning_module_id,
    description: row.description,
    updated_at: row.updated_at || new Date().toISOString(),
    certification_evaluation_score: null,
    certification_evaluation_evidence: null,
    learning_modules: {
      category: 'Skills',
      sub_category: row.sub_category,
      learning_or_certification: row.learning_or_certification ?? 'learning',
      public: 1,
    },
    isPublic: true,
  }));
}

// Define rubric dimensions for each sub-category
const RUBRIC_DEFINITIONS: Record<string, string[]> = {
  'Vibe Coding': [
    'problem_decomposition',
    'prompt_engineering',
    'ai_output_evaluation',
    'metacognitive_control'
  ],
  'Critical Thinking': [
    'logical_reasoning',
    'reflection'
  ],
  'Problem-Solving': [
    'problem_definition',
    'iteration'
  ],
  'Creativity': [
    'originality',
    'risk_and_exploration'
  ],
  'Communication': [
    'clarity',
    'listening_and_response'
  ],
  'Digital Fluency': [
    'device_familiarity_and_control',
    'typing_and_text_entry',
    'file_and_application_management',
    'internet_navigation',
    'online_research_and_information_use',
    'digital_safety_and_responsibility',
    'basic_troubleshooting_and_resilience'
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// EXACT database column names for every rubric dimension score + evidence.
// Many names are Postgres-truncated at 63 characters — this map is the single
// source of truth; never generate them dynamically to avoid mismatches.
// ─────────────────────────────────────────────────────────────────────────────
const RUBRIC_COLUMN_MAP: Record<string, Record<string, { score: string; evidence: string }>> = {
  'Vibe Coding': {
    problem_decomposition: {
      score:    'certification_evaluation_vibe_coding_problem_decomposition_scor',
      evidence: 'certification_evaluation_vibe_coding_problem_decomposition_evid',
    },
    prompt_engineering: {
      score:    'certification_evaluation_vibe_coding_prompt_engineering_score',
      evidence: 'certification_evaluation_vibe_coding_prompt_engineering_evidenc',
    },
    ai_output_evaluation: {
      score:    'certification_evaluation_vibe_coding_ai_output_evaluation_score',
      evidence: 'certification_evaluation_vibe_coding_ai_output_evaluation_evide',
    },
    metacognitive_control: {
      score:    'certification_evaluation_vibe_coding_metacognitive_control_scor',
      evidence: 'certification_evaluation_vibe_coding_metacognitive_control_evid',
    },
  },
  'Critical Thinking': {
    logical_reasoning: {
      score:    'certification_evaluation_critical_thinking_logical_reasoning_sc',
      evidence: 'certification_evaluation_critical_thinking_logical_reasoning_ev',
    },
    reflection: {
      score:    'certification_evaluation_critical_thinking_reflection_score',
      evidence: 'certification_evaluation_critical_thinking_reflection_evidence',
    },
  },
  'Problem-Solving': {
    problem_definition: {
      score:    'certification_evaluation_problem_solving_problem_definition_sco',
      evidence: 'certification_evaluation_problem_solving_problem_definition_evi',
    },
    iteration: {
      score:    'certification_evaluation_problem_solving_iteration_score',
      evidence: 'certification_evaluation_problem_solving_iteration_evidence',
    },
  },
  Creativity: {
    originality: {
      score:    'certification_evaluation_creativity_originality_score',
      evidence: 'certification_evaluation_creativity_originality_evidence',
    },
    risk_and_exploration: {
      score:    'certification_evaluation_creativity_risk_and_exploration_score',
      evidence: 'certification_evaluation_creativity_risk_and_exploration_eviden',
    },
  },
  Communication: {
    clarity: {
      score:    'certification_evaluation_communication_clarity_score',
      evidence: 'certification_evaluation_communication_clarity_evidence',
    },
    listening_and_response: {
      score:    'certification_evaluation_communication_listening_and_response_s',
      evidence: 'certification_evaluation_communication_listening_and_response_e',
    },
  },
  'Digital Fluency': {
    device_familiarity_and_control: {
      score:    'certification_evaluation_device_familiarity_and_control_score',
      evidence: 'certification_evaluation_device_familiarity_and_control_evidenc',
    },
    typing_and_text_entry: {
      score:    'certification_evaluation_typing_and_text_entry_score',
      evidence: 'certification_evaluation_typing_and_text_entry_evidence',
    },
    file_and_application_management: {
      score:    'certification_evaluation_file_and_application_management_score',
      evidence: 'certification_evaluation_file_and_application_management_eviden',
    },
    internet_navigation: {
      score:    'certification_evaluation_internet_navigation_score',
      evidence: 'certification_evaluation_internet_navigation_evidence',
    },
    online_research_and_information_use: {
      score:    'certification_evaluation_online_research_and_information_use_sc',
      evidence: 'certification_evaluation_online_research_and_information_use_ev',
    },
    digital_safety_and_responsibility: {
      score:    'certification_evaluation_digital_safety_and_responsibility_scor',
      evidence: 'certification_evaluation_digital_safety_and_responsibility_evid',
    },
    basic_troubleshooting_and_resilience: {
      score:    'certification_evaluation_basic_troubleshooting_and_resilience_s',
      evidence: 'certification_evaluation_basic_troubleshooting_and_resilience_e',
    },
  },
};

// Rubric evidence definitions
const RUBRIC_EVIDENCE_DEFINITIONS = `
### Vibe Coding – Evidence Definitions

**Problem Decomposition**
- 0 – No Evidence: Learner provides a solution or code without identifying sub-tasks. No breakdown of steps, inputs, or outputs is visible in prompts or explanations.
- 1 – Emerging (Unclear): Learner names components (e.g., 'first fetch data, then display') but lacks sequencing, dependencies, or rationale. Steps may be missing or logically disconnected.
- 2 – Proficient: Learner explicitly decomposes the task into ordered steps, identifies inputs/outputs for each step, and explains why steps are needed.
- 3 – Advanced: Learner decomposes, prioritizes, and restructures the problem, identifying optional paths, edge cases, and performance considerations.

**Prompt Engineering**
- 0 – No Evidence: Prompts are vague, copied, or irrelevant to the task.
- 1 – Emerging (Unclear): Prompts specify a goal but omit constraints, context, inputs, or success criteria. AI output requires heavy correction.
- 2 – Proficient: Prompts clearly specify task, constraints, inputs, expected format, and revision goals.
- 3 – Advanced: Prompts anticipate failure modes, request alternatives, and strategically guide iterative refinement.

**AI Output Evaluation**
- 0 – No Evidence: Learner accepts AI output without review or modification.
- 1 – Emerging (Unclear): Learner states output is 'wrong' or 'not working' without identifying why.
- 2 – Proficient: Learner evaluates output against requirements and identifies specific issues.
- 3 – Advanced: Learner identifies logical flaws, inefficiencies, edge cases, and proposes improvements.

**Metacognitive Control**
- 0 – No Evidence: No reflection or awareness of understanding.
- 1 – Emerging (Unclear): Learner notes confusion but does not act strategically.
- 2 – Proficient: Learner identifies knowledge gaps and asks targeted clarification questions.
- 3 – Advanced: Learner chooses between experimenting, prompting, researching, or simplifying strategically.

### Critical Thinking – Evidence Definitions

**Logical Reasoning**
- 0 – No Evidence: Reasoning is inconsistent or unsupported.
- 1 – Emerging (Unclear): Reasoning is partially logical but includes leaps, contradictions, or missing evidence.
- 2 – Proficient: Reasoning follows a clear logical structure supported by evidence.
- 3 – Advanced: Reasoning anticipates counterarguments and integrates multiple perspectives.

**Reflection**
- 0 – No Evidence: No reflection on reasoning.
- 1 – Emerging (Unclear): Reflection restates conclusions without examining reasoning.
- 2 – Proficient: Explains how conclusions were reached.
- 3 – Advanced: Refines conclusions based on reflection and feedback.

### Problem-Solving – Evidence Definitions

**Problem Definition**
- 0 – No Evidence: Problem is vague or misidentified.
- 1 – Emerging (Unclear): Problem identified but constraints and root causes are missing.
- 2 – Proficient: Problem is clearly defined with constraints and goals.
- 3 – Advanced: Problem is reframed insightfully to reveal leverage points.

**Iteration**
- 0 – No Evidence: Single attempt only.
- 1 – Emerging (Unclear): Minor revisions without explanation.
- 2 – Proficient: Revisions based on feedback or testing.
- 3 – Advanced: Continuous optimization with rationale.

### Creativity – Evidence Definitions

**Originality**
- 0 – No Evidence: Copied or template-based work.
- 1 – Emerging (Unclear): Minor variation on existing ideas.
- 2 – Proficient: Distinct idea with personal contribution.
- 3 – Advanced: Highly novel synthesis of ideas.

**Risk & Exploration**
- 0 – No Evidence: Avoids experimentation.
- 1 – Emerging (Unclear): Limited exploration within safe bounds.
- 2 – Proficient: Explores alternatives intentionally.
- 3 – Advanced: Pushes boundaries and iterates creatively.

### Communication – Evidence Definitions

**Clarity**
- 0 – No Evidence: Message is incoherent.
- 1 – Emerging (Unclear): Message is understandable but poorly organized or ambiguous.
- 2 – Proficient: Clear, structured, and audience-appropriate.
- 3 – Advanced: Compelling, adaptive, and precise.

**Listening & Response**
- 0 – No Evidence: Ignores others' input.
- 1 – Emerging (Unclear): Acknowledges input without integration.
- 2 – Proficient: Responds accurately and respectfully.
- 3 – Advanced: Builds on others' ideas and synthesizes discussion.

### Digital Fluency – Evidence Definitions

**Device Familiarity & Control**
- 0 – No Evidence: Learner cannot independently power on/off the device, use input tools (keyboard, mouse, touch), or navigate the interface. Requires continuous assistance.
- 1 – Emerging (Unclear): Learner can perform basic actions (clicking, tapping, typing) but movement is hesitant, error-prone, or inconsistent. Interface navigation lacks intent or understanding.
- 2 – Proficient: Learner confidently uses keyboard, mouse, or touch controls; navigates the operating system to open, switch, and close applications independently.
- 3 – Advanced: Learner adapts quickly to new devices or interfaces, uses shortcuts, and assists peers with device navigation.

**Typing & Text Entry**
- 0 – No Evidence: Cannot type words or sentences without assistance.
- 1 – Emerging (Unclear): Types short text slowly with frequent errors; relies heavily on looking at keys; struggles with spacing, capitalization, or punctuation.
- 2 – Proficient: Types complete sentences accurately at a functional speed; edits text using basic commands (backspace, enter, select).
- 3 – Advanced: Types fluently with minimal errors; formats text clearly and efficiently for readability.

**File & Application Management**
- 0 – No Evidence: Cannot locate, open, or save files.
- 1 – Emerging (Unclear): Can open files or apps when guided but does not understand file locations or naming conventions.
- 2 – Proficient: Creates, saves, names, and retrieves files; opens and closes applications independently.
- 3 – Advanced: Organizes files into folders, renames files strategically, and manages multiple documents effectively.

**Internet Navigation**
- 0 – No Evidence: Cannot open a browser or navigate web pages.
- 1 – Emerging (Unclear): Can open websites via direct links but struggles with navigation, scrolling, or tabs.
- 2 – Proficient: Uses a browser independently, navigates pages, opens tabs, and follows links purposefully.
- 3 – Advanced: Efficiently navigates across sites, manages tabs, and adapts to unfamiliar web layouts.

**Online Research & Information Use**
- 0 – No Evidence: Cannot perform searches or interpret results.
- 1 – Emerging (Unclear): Performs basic searches but selects results randomly or without understanding relevance.
- 2 – Proficient: Uses search terms effectively, selects relevant sources, and extracts needed information.
- 3 – Advanced: Refines searches, compares sources, and evaluates basic credibility and relevance.

**Digital Safety & Responsibility**
- 0 – No Evidence: No awareness of digital safety or appropriate behavior.
- 1 – Emerging (Unclear): Recognizes some safety rules but applies them inconsistently.
- 2 – Proficient: Demonstrates safe behaviors (password awareness, avoiding suspicious links, respectful communication).
- 3 – Advanced: Explains safety principles clearly and models responsible digital behavior for others.

**Basic Troubleshooting & Resilience**
- 0 – No Evidence: Stops working when encountering errors.
- 1 – Emerging (Unclear): Attempts random fixes without understanding the issue.
- 2 – Proficient: Identifies common issues (frozen app, lost cursor, connectivity) and applies basic fixes.
- 3 – Advanced: Systematically diagnoses problems and explains solutions to peers.
`;

const skillCategories = [
  // Row 1: Digital Fluency, Critical Thinking, Problem-Solving
  {
    id: 'digital-fluency',
    title: 'Digital Fluency',
    subCategory: 'Digital Fluency',
    icon: <Monitor className="h-6 w-6" />,
    description: 'Navigate digital tools and AI systems confidently'
  },
  {
    id: 'critical-thinking',
    title: 'Critical Thinking',
    subCategory: 'Critical Thinking',
    icon: <Brain className="h-6 w-6" />,
    description: 'Evaluate claims, analyze evidence, construct logical arguments'
  },
  {
    id: 'problem-solving',
    title: 'Problem-Solving',
    subCategory: 'Problem-Solving',
    icon: <Puzzle className="h-6 w-6" />,
    description: 'Design, test, and refine solutions to complex challenges'
  },
  // Row 2: Creativity, Communication
  {
    id: 'creativity',
    title: 'Creativity',
    subCategory: 'Creativity',
    icon: <Lightbulb className="h-6 w-6" />,
    description: 'Generate original ideas and innovative solutions'
  },
  {
    id: 'communication',
    title: 'Communication',
    subCategory: 'Communication',
    icon: <MessageSquare className="h-6 w-6" />,
    description: 'Express ideas clearly for real-world impact'
  },
];

// ── Create-Your-Own Skills session helpers ────────────────────────────────────
const SKILLS_SESSION_CATEGORIES = [
  { id: 'vibe-coding',       label: 'Vibe Coding',       subCategory: 'Vibe Coding' },
  { id: 'critical-thinking', label: 'Critical Thinking', subCategory: 'Critical Thinking' },
  { id: 'creativity',        label: 'Creativity',        subCategory: 'Creativity' },
  { id: 'problem-solving',   label: 'Problem-Solving',   subCategory: 'Problem-Solving' },
  { id: 'digital-fluency',   label: 'Digital Fluency',   subCategory: 'Digital Fluency' },
  { id: 'communication',     label: 'Communication',     subCategory: 'Communication' },
];

// Code Execution Service for E2B integration
class CodeExecutionService {
  private static apiUrl = '/api/execute-code';

  static async executeCode(code: string, language: 'python' | 'javascript'): Promise<CodeExecution> {
    const executionId = Date.now().toString();
    
    try {
      console.log(`Executing ${language} code via E2B...`);
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
      
      console.log(`Execution completed in ${result.executionTime}ms`);
      
      return {
        id: executionId,
        code,
        language,
        output: result.output,
        error: result.error,
        executionTime: result.executionTime,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Code execution error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return {
        id: executionId,
        code,
        language,
        error: `Execution failed: ${message}`,
        timestamp: new Date(),
      };
    }
  }
}

// ── Personality baseline type (mirrors user_personality_baseline columns) ──────
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

const buildSkillsFacilitatorPrompt = (
  subCategory: string,
  context: string,
  baseline?: PersonalityBaseline,
  communicationLevel: number = 1
): string => {
  const cs = baseline?.communicationStrategy;
  const ls = baseline?.learningStrategy;
  const personalizedBlock = (cs || ls) ? `
PERSONALIZED LEARNER PROFILE (from prior AI-assessed baseline):
${cs ? `- Communication Style: tone=${cs.preferred_tone ?? 'n/a'}, interaction=${cs.interaction_style ?? 'n/a'}, detail level=${cs.detail_level ?? 'n/a'}` : ''}
${cs?.recommendations?.length ? `  Communication Tips: ${cs.recommendations.join('; ')}` : ''}
${ls ? `- Learning Approach: style=${ls.learning_style ?? 'n/a'}, motivation=${ls.motivation_approach ?? 'n/a'}, pacing=${ls.pacing_preference ?? 'n/a'}` : ''}
${ls?.recommendations?.length ? `  Learning Tips: ${ls.recommendations.join('; ')}` : ''}

IMPORTANT: Adapt your tone, questioning style, pacing, and feedback delivery to match this profile in every response.
` : '';

  // ── Communication Level block — mandatory language register ───────────────
  // Takes precedence over grade-level assumptions. Applied to every response.
  const commLevelGuidance = communicationLevel <= 0 ? `

═══════════════════════════════════════════════
COMMUNICATION LEVEL: 0 — PRE-LITERATE / VERY BASIC
This learner writes in single words, short fragments, or severely broken sentences.
Spelling and grammar errors are frequent and sometimes obscure meaning.
═══════════════════════════════════════════════

LANGUAGE RULES (mandatory — apply to every single response):
- Use ONLY the simplest everyday words. If a simpler word exists, always use it.
- Maximum 1–2 short sentences per response. Never write a paragraph.
- Never use technical terms without immediately defining them in plain words.
- Use emojis sparingly to anchor meaning (e.g. "Critical thinking means asking 'why?' 🤔").
- If their message is unclear, respond with "I did not understand. Can you try again?" — never guess.
- Celebrate every attempt: "Good try! 👏" before any correction.
- Ask questions so simple they need only one or two words to answer: "Is this good or bad?"

EXAMPLE response style:
"Good try! 👏 Let us think about this step by step. You said the problem is money. Good. Now — who has the money problem? You, or your customer?"
` : communicationLevel === 1 ? `

═══════════════════════════════════════════════
COMMUNICATION LEVEL: 1 — EMERGING
This learner writes in simple short sentences with frequent grammar and spelling errors,
but meaning is usually recoverable. Basic vocabulary. First-generation digital learner.
═══════════════════════════════════════════════

LANGUAGE RULES (mandatory — apply to every single response):
- Use short, clear sentences. One idea per sentence.
- Avoid all jargon. If you must use a skill-related term, explain it immediately in plain language.
  Example: "Critical thinking means asking good questions about what you see or hear."
- Ask ONE question per turn, never two or three.
- Keep your full response under 60 words.
- When the learner gives a short or unclear answer, say "Can you tell me a little more?" — do not move to a new question until they have answered.
- Celebrate effort warmly: "That is a great answer!" or "Well done for trying!"
- Use examples from farming, markets, family, or community — not abstract business scenarios.

EXAMPLE response style:
"Good answer! You identified the problem clearly. That is the first step in problem-solving.
Here is the next question: What do you think is causing this problem? Give me one reason."
` : communicationLevel === 2 ? `

═══════════════════════════════════════════════
COMMUNICATION LEVEL: 2 — DEVELOPING
This learner writes multi-sentence responses with errors, but meaning is clear.
Growing vocabulary. Can follow structured explanation and reason with guidance.
═══════════════════════════════════════════════

LANGUAGE RULES:
- Use clear, direct language. You may use skill-related terms but always explain them briefly.
- Keep responses focused — 2–3 short paragraphs maximum.
- Ask one guiding question per turn. It may be slightly more complex than level 1.
- Build on what the learner said — reference their words before extending the idea.
- Encourage structured thinking: "Can you explain why?" or "What would happen if…?"
` : `

═══════════════════════════════════════════════
COMMUNICATION LEVEL: 3 — PROFICIENT
This learner communicates complex ideas clearly with mostly correct grammar.
Extended vocabulary. Can handle abstract reasoning and multi-step arguments.
═══════════════════════════════════════════════

LANGUAGE RULES:
- You may use standard skill-domain vocabulary with concise definitions where helpful.
- Responses can be fuller — but still aim for concision.
- Push for precision: "Can you be more specific?" or "What evidence supports that?"
- Challenge the learner to compare, evaluate, and synthesise across dimensions.
`;

  return `You are a skills coach helping a learner develop their "${subCategory}" skills through a real-world scenario they have chosen.

EXTENSIVE TUTOR INSTRUCTIONS (MANDATORY):
- The AI must provide large, comprehensive answers capable of thoroughly addressing any user question.
- The AI should act like a human tutor, responding in depth and following up with several highly relevant questions tailored to the specific activity and learner's skill level.
- Do not provide terse or incomplete replies. When a learner asks something, explore it fully with examples and connections to their scenario.

LEARNER'S CONTEXT:
${context}
${commLevelGuidance}
${personalizedBlock}
YOUR PRIMARY ROLE — ${subCategory} MASTERY:
Your core job is to develop the learner's "${subCategory}" skills using a constructivist, Socratic approach. Every question, hint, and critique must be anchored in the rubric dimensions below. The learner must reach Proficient (2/3) on every dimension before the session closes.

- Guide them constructively: ask one question at a time, no multi-part questions.
- After every learner response, give a rubric-based critique: score each dimension 0–3, cite evidence from their text, name the weakest dimension, and ask one targeted improvement question.
- Do not lecture or do the work for them. Use Socratic questioning.
- ANSWER DIRECT QUESTIONS: If the learner asks a genuine question ("What does X mean?", "Can you explain Y?", "I don't understand Z"), answer it clearly and concisely first, then return to guiding. Never respond to a direct question with another question.
- Tone: clear, encouraging, specific.${(cs || ls) ? ' Adapt tone and pacing to the learner\'s profile above.' : ''}

RUBRIC DIMENSIONS for ${subCategory}:
${(RUBRIC_DEFINITIONS[subCategory] || []).map(d => `- ${d.replace(/_/g, ' ')}`).join('\n')}

Scoring: 0=No Evidence, 1=Emerging, 2=Proficient, 3=Advanced

─────────────────────────────────────────
SECONDARY LENS — ENTREPRENEURIAL & PUE GROUNDING:
─────────────────────────────────────────
The learner's scenario has a real-world productive or entrepreneurial dimension. Where it fits naturally within the skill-building flow, deepen the learning by connecting ${subCategory} to:

- Costs & benefits: what value does applying this skill well actually create?
- Tradeoffs: what do you give up by choosing one approach over another?
- Long-term thinking: will this still work or be valuable in 2–5 years?
- Productive use of resources: does this create real economic value, or just consume time and energy?
- Business viability: could this become a service, livelihood, or competitive advantage?

Apply this lens selectively — when the learner's answer is technically sound but misses the "so what does this achieve in the real world?" dimension. A natural prompt when this happens: "Good work on the skill — now, what's the real-world payoff of doing this well here? Who benefits and what does it cost?"

Do NOT force a business framing onto every exchange. Some turns will be purely about developing the skill. The productive-use lens sharpens the learning, it does not replace it.
─────────────────────────────────────────

SESSION FLOW:
1. Acknowledge their scenario warmly (one sentence).
2. Ask one opening question focused on the first ${subCategory} rubric dimension, using the learner's scenario as context.
3. After each response: Rubric Critique Block → one improvement question targeting the weakest dimension.
4. When all dimensions reach ≥2 (Proficient), transition to Step 5.

Step 5 — Reflection (REQUIRED before final summary):
Prompt the learner with this reflection sequence — do not skip even if they ask to finish:

"Before we wrap up, I want you to take a moment to reflect on this session.

Please respond to these three questions — be as honest and specific as you can:

1. What is the most important thing you learned or figured out in this session?
2. What was the hardest part, and how did you work through it (or where did you get stuck)?
3. How would you approach a similar problem differently next time?

Take your time — your reflection matters."

After the learner responds, acknowledge briefly (1–2 sentences), then proceed to Step 6.

Step 6 — Final summary + peer diffusion activation:
Summarise their demonstrated skills across all dimensions. Where the learner connected their skill work to a real productive or business outcome, highlight it as an example of the skill at its most powerful.

Then add ONE teach-back prompt:
- "If you were going to explain this skill to a friend who has never tried it before, what would you say first?"
- "Imagine you are teaching this to someone in your community — a farmer, trader, or clinic worker — tomorrow. What are the three most important things they need to know?"
- "How would you explain to a family member why getting good at this skill could help them in their daily work or livelihood?"

Respond to their teach-back with ONE reinforcing observation, then close the session.

Rubric Critique Block format:
Rubric (${subCategory})
${(RUBRIC_DEFINITIONS[subCategory] || []).map(d => `${d.replace(/_/g, ' ')}: <0–3> — Evidence: <...> — Improve: <1 sentence>`).join('\n')}
Weakest area: <dimension>
Next question: <one question only — focused on the weakest rubric dimension; connect to real-world productive context where natural>`;
};


const AIReadySkillsPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const deepLinkHandledRef = useRef(false);
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<any>(null);
  const [wasListeningBeforeSubmit, setWasListeningBeforeSubmit] = useState(false);
  const [activeCategory, setActiveCategory] = useState('digital-fluency');
  const [allSkillsActivities, setAllSkillsActivities] = useState<DashboardActivity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<DashboardActivity | null>(null);
  const [activityDescription, setActivityDescription] = useState<string>('');
  const [moduleTitle, setModuleTitle] = useState<string>('');
  const [aiFacilitatorInstructions, setAiFacilitatorInstructions] = useState<string>('');
  const [aiAssessmentInstructions, setAiAssessmentInstructions] = useState<string>('');
  const [successMetrics, setSuccessMetrics] = useState<string>('');
  const [learningOutcomes, setLearningOutcomes] = useState<string>('');
  const [moduleDescription, setModuleDescription] = useState<string>('');
  const [currentModuleCategory, setCurrentModuleCategory] = useState<string>('');
  const [currentModuleSubCategory, setCurrentModuleSubCategory] = useState<string>('');
  const [currentModuleLearningOrCert, setCurrentModuleLearningOrCert] = useState<string>('');
  const [currentEvaluationState, setCurrentEvaluationState] = useState<CurrentEvaluationState | null>(null);
  const [userGradeLevel, setUserGradeLevel] = useState<number | null>(null);
  const [userContinent, setUserContinent] = useState<string | null>(null);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [personalityBaseline, setPersonalityBaseline] = useState<PersonalityBaseline>({
    communicationStrategy: null,
    learningStrategy: null
  });
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]); // stub — hook manages selection
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');

  // ── useVoice hook — Nigeria-aware TTS with offline fallback ───────────────
  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    recognitionLang,
    selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  // ── Per-turn evaluation popup ──────────────────────────────────────────────
  const openTurnEvaluation = (evaluationText: string) => {
    setTurnEvaluationText(evaluationText);
    if (voiceOutputEnabled) hookSpeak(buildSpokenEvaluationText(evaluationText));
  };
  const closeTurnEvaluation = () => {
    setTurnEvaluationText(null);
    cancelSpeech();
  };

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [historyCache, setHistoryCache] = useState<Record<string, ChatMessage[]>>({});
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [finishingModule, setFinishingModule] = useState(false);

  // Per-turn rubric evaluation popup — the full "Rubric" block for a single
  // AI response, shown on demand instead of inline in the chat history (chat
  // only shows the suggestion + next question) so learners don't lose track
  // of the conversation under a wall of per-dimension scoring text.
  const [turnEvaluationText, setTurnEvaluationText] = useState<string | null>(null);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{score: number, evidence: string} | SkillsRubricEvaluation | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // ── Reflection gate state ────────────────────────────────────────────────
  const [hasReflection, setHasReflection] = useState(false);
  const [reflectionValidating, setReflectionValidating] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [reflectionAttempts, setReflectionAttempts] = useState(0);
  const [awaitingReflection, setAwaitingReflection] = useState(false);

  // ── Create-Your-Own-Activity state ────────────────────────────────────────
  const [showCreateActivity, setShowCreateActivity] = useState(false);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '', description: '', location: '', constraints: '', stakeholders: '',
    entrepreneurialContext: '', category: 'vibe-coding'
  });

  // ── Complete Session modal state ───────────────────────────────────────────
  const [showCompleteSessionModal, setShowCompleteSessionModal] = useState(false);
  const [sessionReflectionInput, setSessionReflectionInput] = useState('');
  const [completingSession, setCompletingSession] = useState(false);

  const [codeEditorContent, setCodeEditorContent] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<'python' | 'javascript'>('python');
  const [codeHistory, setCodeHistory] = useState<CodeExecution[]>([]);
  const [latestExecution, setLatestExecution] = useState<CodeExecution | null>(null);
  const [isExecutingCode, setIsExecutingCode] = useState(false);
  const [showConsole, setShowConsole] = useState(false);


  // Initialize speech recognition
  // Note: voice selection and TTS are handled by useVoice hook
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      // recognitionLang = 'en-NG' for Africa users — understands Nigerian-accented speech
      recognition.lang = recognitionLang;
      
      if ('speechTimeout' in recognition) {
        recognition.speechTimeout = 10000;
      }
      if ('speechTimeoutDelay' in recognition) {
        recognition.speechTimeoutDelay = 10000;
      }
      
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          setUserInput(prev => prev + finalTranscript);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech' && event.error !== 'audio-capture') {
          setIsListening(false);
          alert('Voice input error: ' + event.error);
        }
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      setSpeechRecognition(recognition);
    }
  }, [recognitionLang]);

  // Voice input restarts after TTS finishes (mirrors AILearningPage pattern)
  const prevIsSpeaking = useRef(false);
  useEffect(() => {
    const wasSpeaking = prevIsSpeaking.current;
    prevIsSpeaking.current = isSpeaking;
    if (wasSpeaking && !isSpeaking && wasListeningBeforeSubmit && voiceInputEnabled && speechRecognition) {
      setTimeout(() => {
        try {
          speechRecognition.start();
          setIsListening(true);
        } catch (err) {
          console.error('Error restarting voice input after TTS:', err);
        }
      }, 500);
    }
  }, [isSpeaking, wasListeningBeforeSubmit, voiceInputEnabled, speechRecognition]);

  // Toggle voice input
  const toggleVoiceInput = () => {
    if (!speechRecognition) {
      alert('Voice input is not supported in your browser.');
      return;
    }

    if (isListening) {
      speechRecognition.stop();
      setIsListening(false);
    } else {
      try {
        speechRecognition.start();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting voice input:', error);
        alert('Failed to start voice input. Please try again.');
      }
    }
  };

  // Toggle voice output
  const toggleVoiceOutput = () => {
    setVoiceOutputEnabled(!voiceOutputEnabled);
    if (!voiceOutputEnabled) {
      cancelSpeech();
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Load historyCache from localStorage on component mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('SkillsDevelopmentPage_historyCache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (typeof parsed === 'object' && parsed !== null) {
          // Restore Date objects in ChatMessage timestamps
          const restored: Record<string, ChatMessage[]> = {};
          for (const [key, messages] of Object.entries(parsed)) {
            if (Array.isArray(messages)) {
              restored[key] = messages.map((msg: any) => ({
                ...msg,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
              }));
            }
          }
          setHistoryCache(restored);
          console.log('[AIReadySkillsPage] Restored historyCache from localStorage:', Object.keys(restored).length, 'activities');
        }
      }
    } catch (err) {
      console.warn('[AIReadySkillsPage] Failed to restore historyCache from localStorage:', err);
    }
  }, []);

  // Save historyCache to localStorage whenever it changes
  useEffect(() => {
    if (Object.keys(historyCache).length === 0) return; // Don't save empty cache
    try {
      localStorage.setItem('SkillsDevelopmentPage_historyCache', JSON.stringify(historyCache));
      console.log('[AIReadySkillsPage] Saved historyCache to localStorage:', Object.keys(historyCache).length, 'activities');
    } catch (err) {
      console.warn('[AIReadySkillsPage] Failed to save historyCache to localStorage:', err);
    }
  }, [historyCache]);

  // Fetch user profile
  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('grade_level, continent, city, country')
        .eq('id', userId)
        .single();

      if (error) throw error;

      return {
        gradeLevel: data?.grade_level || null,
        continent: data?.continent || null,
        city: data?.city || null,
        country: data?.country || null,
      };
    } catch (err) {
      console.error('Error fetching user profile:', err);
      return {
        gradeLevel: null,
        continent: null,
        city: null,
        country: null,
      };
    }
  };

  // Load current evaluation state for activity
  const loadCurrentEvaluationState = async (activity: DashboardActivity, subCategory: string): Promise<CurrentEvaluationState> => {
    const dimensions = RUBRIC_DEFINITIONS[subCategory] || [];
    const colMap = RUBRIC_COLUMN_MAP[subCategory] || {};
    
    const evaluationState: CurrentEvaluationState = {
      dimensions: {},
      overallScore: normalizeCertificationScore(activity.certification_evaluation_score),
      weakestDimension: null
    };

    let minScore = 3;
    let weakestDim = null;

    for (const dim of dimensions) {
      const dimensionKey = dim.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const cols = colMap[dimensionKey];

      const score    = cols ? (activity[cols.score]    || 0) : 0;
      const evidence = cols ? (activity[cols.evidence] || 'Not yet evaluated') : 'Not yet evaluated';
      
      evaluationState.dimensions[dim] = { score, evidence };
      
      if (score < minScore) {
        minScore = score;
        weakestDim = dim;
      }
    }

    evaluationState.weakestDimension = weakestDim;
    
    console.log('[Evaluation State] Loaded:', evaluationState);
    return evaluationState;
  };

  // Build contextual facilitation prompt based on current evaluation state
  const buildContextualFacilitationPrompt = (
    baseFacilitatorInstructions: string,
    subCategory: string,
    evalState: CurrentEvaluationState | null
  ): string => {
    // Build personalized profile block if baseline data exists
    const cs = personalityBaseline.communicationStrategy;
    const ls = personalityBaseline.learningStrategy;
    const personalizedBlock = (cs || ls) ? `
PERSONALIZED LEARNER PROFILE (from prior AI-assessed baseline):
${cs ? `- Communication Style: tone=${cs.preferred_tone ?? 'n/a'}, interaction=${cs.interaction_style ?? 'n/a'}, detail level=${cs.detail_level ?? 'n/a'}` : ''}
${cs?.recommendations?.length ? `  Communication Tips: ${cs.recommendations.join('; ')}` : ''}
${ls ? `- Learning Approach: style=${ls.learning_style ?? 'n/a'}, motivation=${ls.motivation_approach ?? 'n/a'}, pacing=${ls.pacing_preference ?? 'n/a'}` : ''}
${ls?.recommendations?.length ? `  Learning Tips: ${ls.recommendations.join('; ')}` : ''}

IMPORTANT: Adapt your tone, questioning style, pacing, and feedback delivery to match this profile in every response.
` : '';

    if (!evalState || Object.keys(evalState.dimensions).length === 0) {
      // No evaluation yet - use base instructions
      return `${baseFacilitatorInstructions}
${personalizedBlock}
GOAL: Your primary goal is to help the learner improve their skills in ${subCategory} based on the following rubric dimensions:
${(RUBRIC_DEFINITIONS[subCategory] || []).map(d => `- ${d.replace(/_/g, ' ')}`).join('\n')}

Since this learner is just starting, focus on building foundational understanding across all dimensions.`;
    }

    // Build performance summary
    const performanceSummary = Object.entries(evalState.dimensions)
      .map(([dim, data]) => {
        const level = data.score === 0 ? 'No Evidence' :
                     data.score === 1 ? 'Emerging' :
                     data.score === 2 ? 'Proficient' : 'Advanced';
        return `- ${dim.replace(/_/g, ' ')}: ${level} (${data.score}/3) - ${data.evidence}`;
      })
      .join('\n');

    const weakestArea = evalState.weakestDimension 
      ? evalState.weakestDimension.replace(/_/g, ' ')
      : 'overall performance';

    return `${baseFacilitatorInstructions}
${personalizedBlock}
CURRENT LEARNER PERFORMANCE IN ${subCategory}:
Overall Score: ${evalState.overallScore}/3

Dimension-by-Dimension Performance:
${performanceSummary}

FACILITATION STRATEGY:
- PRIMARY FOCUS: Help learner improve in "${weakestArea}" (their weakest area)
- GOAL: Guide learner toward demonstrating Proficient (2/3) or Advanced (3/3) performance
- APPROACH: Provide immediate, specific feedback after each response that helps them understand:
  * What they did well relative to the rubric
  * Exactly what would move them to the next level
  * Concrete suggestions for their next response${(cs || ls) ? '\n  * Deliver feedback in a tone and style matching the learner\'s profile above' : ''}

RUBRIC AWARENESS:
Reference the specific rubric criteria naturally in your feedback. For example:
- "That's good - you're showing emerging understanding of [dimension]. To reach proficient level, try..."
- "Excellent! That response demonstrates proficient [dimension] because..."
- "I notice you're still at the no evidence level for [dimension]. Let's work on that by..."

Remember: Every response is an opportunity to help them improve. Be specific, encouraging, and always tie feedback back to the rubric dimensions.`;
  };

  // Load dashboard activities
  const loadDashboardActivities = async (city?: string | null) => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Resolve which city_town to show: Ibiade users see Ibiade modules, Dayton
      // (Back to Basics Youth Education) users see Dayton modules, everyone else sees Oloibiri
      const cityTown = city === 'Ibiade' ? 'Ibiade' : city === 'Dayton' ? 'Dayton' : 'Oloibiri';

      console.log('[Skills Activities] Querying with JOIN to learning_modules');
      console.log('[Skills Activities] User ID:', user.id);
      console.log('[Skills Activities] Filtering by city_town:', cityTown);
      
      // Join with learning_modules to get the actual category
      const { data: dashboardData, error } = await supabase
        .from('dashboard')
        .select(`
          *,
          learning_modules:learning_module_id (
            category,
            sub_category,
            learning_or_certification,
            public,
            city_town
          )
        `)
        .eq('user_id', user.id)
        .not('learning_module_id', 'is', null)
        .order('sub_category', { ascending: true })
        .order('activity', { ascending: true });

      if (error) {
        console.error('[Skills Activities] Query error:', error);
        throw error;
      }

      // Filter for Skills category, correct city_town, excluding Vibe Coding
      const skillsActivities = (dashboardData?.filter(activity => {
        const module = activity.learning_modules;
        return (
          module &&
          module.category === 'Skills' &&
          module.sub_category !== 'Vibe Coding' &&
          (module.city_town === cityTown || module.city_town == null)
        );
      }) || []).map(activity => ({
        ...activity,
        isPublic: activity.learning_modules?.public === 1 ||
                  activity.learning_modules?.public === true,
      }));

      console.log('[Skills Activities] Loaded', dashboardData?.length || 0, 'total activities');
      console.log('[Skills Activities] Filtered to', skillsActivities.length, 'Skills activities');

      // Dayton (Back to Basics) learners get the real, Dayton-tailored catalog
      // generated for their city; everyone else keeps the existing mock catalog.
      if (cityTown === 'Dayton') {
        const daytonActivities = await fetchDaytonSkillsActivities();
        setAllSkillsActivities(daytonActivities.length > 0 ? daytonActivities : buildSkillsMockActivities());
      } else {
        // Force full mock activity list regardless of DB results
        setAllSkillsActivities(buildSkillsMockActivities());
      }
    } catch (err) {
      console.error('[Skills Activities] Error loading:', err);

      setAllSkillsActivities(buildSkillsMockActivities());
    } finally {
      setLoading(false);
    }
  };

  // Refresh dashboard
  const refreshDashboard = async () => {
    setRefreshing(true);
    await loadDashboardActivities(userCity);
    setRefreshing(false);
  };

  // Initial load — fetch profile first so city_town filter is applied immediately
  useEffect(() => {
    if (user?.id) {
      fetchUserProfile(user.id).then(profile => {
        setUserGradeLevel(profile.gradeLevel);
        setUserContinent(profile.continent);
        setUserCity(profile.city);
        if (profile.country === 'Nigeria') setVoiceMode('pidgin');
        else setVoiceMode('english');
        return loadDashboardActivities(profile.city);
      });
      fetchPersonalityBaseline(user.id);
    }
  }, [user]);

  // Deep-link support for ?activity=<title>&subCategory=<...> (open a specific
  // module) — used by the Skill Development guide. Matches against
  // allSkillsActivities (already filtered/loaded for the signed-in user's
  // city_town) rather than a raw learning_module_id, since the same activity
  // title can exist as a different row per city.
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    if (allSkillsActivities.length === 0) return;
    deepLinkHandledRef.current = true;

    const activityTitle = searchParams.get('activity');
    const subCategoryParam = searchParams.get('subCategory');
    const createFlag = searchParams.get('create');
    const categoryParam = searchParams.get('category');

    if (activityTitle) {
      const match = allSkillsActivities.find(a => {
        const subCategory = a.learning_modules?.sub_category || a.sub_category;
        return a.title === activityTitle && (!subCategoryParam || subCategory === subCategoryParam);
      });
      if (match) {
        const cat = skillCategories.find(c => c.subCategory === (match.learning_modules?.sub_category || match.sub_category));
        if (cat) setActiveCategory(cat.id);
        handleActivitySelect(match);
        return;
      }
    }

    if (createFlag === '1') {
      const catId = categoryParam && skillCategories.some(c => c.id === categoryParam) ? categoryParam : 'digital-fluency';
      setCreateForm(f => ({ ...f, category: catId }));
      setActiveCategory(catId);
      setShowCreateActivity(true);
    }
  }, [allSkillsActivities, searchParams]);

  const fetchPersonalityBaseline = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_personality_baseline')
        .select('communication_strategy, learning_strategy, communication_level')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.log('[Skills] No personality baseline found yet (normal for new users)');
        return;
      }

      setPersonalityBaseline({
        communicationStrategy: data?.communication_strategy || null,
        learningStrategy: data?.learning_strategy || null
      });
      setCommunicationLevel(data?.communication_level ?? 1);
      console.log('[Skills] Personality baseline loaded, communication_level:', data?.communication_level ?? 1);
    } catch (err) {
      console.log('[Skills] Baseline fetch skipped:', err);
    }
  };

  // ── Tweak personality baseline after each session ──────────────────────────
  // Runs silently (non-blocking) after save or evaluation.
  // Updates communication_strategy, learning_strategy, AND communication_level.
  const tweakPersonalityBaseline = async (
    userId: string,
    sessionMessages: typeof chatHistory,
    currentBaseline: PersonalityBaseline
  ): Promise<void> => {
    const learnerMessages = sessionMessages.filter(m => m.role === 'user');
    if (learnerMessages.length < 3) {
      console.log('[Skills Tweak] Too few learner messages — skipping baseline update');
      return;
    }
    if (!currentBaseline.communicationStrategy && !currentBaseline.learningStrategy) {
      console.log('[Skills Tweak] No existing baseline — skipping tweak (run initial assessment first)');
      return;
    }

    const cs = currentBaseline.communicationStrategy;
    const ls = currentBaseline.learningStrategy;

    const sessionExcerpt = learnerMessages
      .slice(-12)
      .map((m, i) => `[Turn ${i + 1}] ${m.content}`)
      .join('\n\n');

    const prompt = `You are a personality and learning assessment expert. You are making SMALL INCREMENTAL UPDATES to an existing learner profile based on evidence from a single new learning session. Do NOT rewrite or overhaul the profile — only nudge individual fields if the session provides clear evidence that the current value no longer fits.

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
  0 = Pre-literate / Very Basic — single words, fragments, errors that obscure meaning
  1 = Emerging — simple short sentences, frequent errors but meaning recoverable
  2 = Developing — multi-sentence responses, errors present but clear, growing vocabulary
  3 = Proficient — well-structured, complex ideas expressed clearly, mostly correct grammar

NEW SESSION — LEARNER MESSAGES ONLY:
${sessionExcerpt}

TASK:
Examine the learner's messages from this session.

For communication_strategy and learning_strategy: nudge individual fields only if this session provides clear new or contradictory evidence.

For communication_level: assess the TYPICAL writing quality across these messages (not the best or worst example). Nudge by at most 1 in either direction:
- Increase by 1 if the messages consistently show clearer structure, more complete sentences, or richer vocabulary than the current level describes.
- Decrease by 1 if the messages consistently show more fragmented or error-heavy writing than the current level describes.
- Leave unchanged if the messages are consistent with the current level, or if evidence is mixed.

RULES:
- Change a text field only if this session clearly shows the current value is wrong or incomplete.
- For recommendations arrays: add 1 new item if clearly supported, remove 1 if clearly contradicted, or leave unchanged. Never replace the whole array.
- For communication_level: maximum change is ±1 per session. Never jump more than 1 level.
- If unsure about any field, return the existing value unchanged.

Respond ONLY with valid JSON in this exact format (no extra fields, no commentary):
{
  "communication_strategy": {
    "preferred_tone": "<string>",
    "interaction_style": "<string>",
    "detail_level": "<string>",
    "recommendations": ["<string>", ...]
  },
  "learning_strategy": {
    "learning_style": "<string>",
    "motivation_approach": "<string>",
    "pacing_preference": "<string>",
    "recommendations": ["<string>", ...]
  },
  "communication_level": <integer 0–3>,
  "changes_made": "<one sentence summary of what changed and why, or 'No changes — existing profile confirmed by this session'>"
}`;

    try {
      const result = await chatJSON({
        page: 'SkillsDevelopmentPage',
        messages: [{ role: 'user', content: prompt }],
        system: 'You are a learner profile expert making careful, evidence-based incremental updates. Return only valid JSON.',
        max_tokens: 700,
        temperature: 0.2,
      });

      if (!result?.communication_strategy || !result?.learning_strategy) {
        console.warn('[Skills Tweak] Unexpected response shape — skipping update');
        return;
      }

      // Clamp communication_level to valid range
      const newLevel = Math.max(0, Math.min(3, Math.round(result.communication_level ?? communicationLevel))) as number;

      const { error } = await supabase
        .from('user_personality_baseline')
        .update({
          communication_strategy: result.communication_strategy,
          learning_strategy: result.learning_strategy,
          communication_level: newLevel,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        console.error('[Skills Tweak] Failed to save updated baseline:', error);
        return;
      }

      // Refresh local state so the next session in this visit uses the updated values
      setPersonalityBaseline({
        communicationStrategy: result.communication_strategy,
        learningStrategy: result.learning_strategy,
      });
      setCommunicationLevel(newLevel);

      console.log(`[Skills Tweak] Baseline updated. communication_level: ${communicationLevel} → ${newLevel}. ${result.changes_made}`);
    } catch (err) {
      console.warn('[Skills Tweak] Tweak skipped due to error:', err);
    }
  };

  // Function to get grade-appropriate instructions
  const getGradeAppropriateInstructions = (gradeLevel: number | null, commLevel: number = 1): string => {
    // ── Communication-level language register (prepended, takes precedence) ──
    const commLevelBlock = commLevel <= 0 ? `
═══════════════════════════════════════════════
COMMUNICATION LEVEL: 0 — PRE-LITERATE / VERY BASIC
This learner writes in single words, short fragments, or severely broken sentences.
═══════════════════════════════════════════════
LANGUAGE RULES (mandatory):
- Maximum 1–2 short sentences per response. Use only the simplest everyday words.
- Never use skill terms without immediately defining them in plain words.
- Ask questions answerable in one or two words only: "Is this good or bad?"
- Celebrate every attempt: "Good try! 👏" before any correction.
- If their message is unclear: "I did not understand. Can you try again?"
` : commLevel === 1 ? `
═══════════════════════════════════════════════
COMMUNICATION LEVEL: 1 — EMERGING
This learner writes simple short sentences with frequent errors but recoverable meaning.
═══════════════════════════════════════════════
LANGUAGE RULES (mandatory):
- Short sentences only. One idea per sentence. Keep responses under 60 words.
- Explain all skill terms immediately in plain language.
- Ask ONE question per turn. Use examples from farming, markets, or community life.
- Celebrate effort: "That is a great answer!" before any correction or follow-up.
- If answer is short or unclear: "Can you tell me a little more?" before moving on.
` : commLevel === 2 ? `
═══════════════════════════════════════════════
COMMUNICATION LEVEL: 2 — DEVELOPING
This learner writes multi-sentence responses with errors, but meaning is clear.
═══════════════════════════════════════════════
LANGUAGE RULES:
- Clear direct language. Briefly explain skill terms. 2–3 short paragraphs maximum.
- One guiding question per turn. Build on the learner's own words.
- Encourage structured thinking: "Can you explain why?" or "What would happen if…?"
` : `
═══════════════════════════════════════════════
COMMUNICATION LEVEL: 3 — PROFICIENT
This learner communicates complex ideas clearly with mostly correct grammar.
═══════════════════════════════════════════════
LANGUAGE RULES:
- Standard skill vocabulary with concise definitions where helpful.
- Push for precision: "Can you be more specific?" or "What evidence supports that?"
- Challenge the learner to compare, evaluate, and synthesise across dimensions.
`;

    const gradeBlock = (() => {
      if (gradeLevel === null) {
        return 'Adjust your language and examples to be appropriate for the student\'s level. Be supportive and encouraging.';
      }
      switch(gradeLevel) {
        case 1: return 'Use simple, clear language appropriate for elementary students. Use concrete examples and encourage frequently. Break down complex ideas into small, easy-to-understand steps. Be patient and positive.';
        case 2: return 'Use age-appropriate language for middle school students. Provide clear explanations with relevant examples. Encourage critical thinking and independence. Be supportive and respectful.';
        case 3: return 'Use language appropriate for high school students. Provide detailed explanations and challenge students to think deeply. Encourage analysis and synthesis of ideas. Respect their developing independence.';
        case 4: return 'This is an adult learner (18+). Use clear, professional language and treat them as a capable adult, not a classroom student — avoid childish framing or over-explaining basics. Connect guidance to real-world and career applications. Respect their existing knowledge and time, and encourage independent, self-directed exploration.';
        default: return 'Adjust your language and examples to be appropriate for the student\'s level. Be supportive and encouraging.';
      }
    })();

    return `${commLevelBlock}\n${gradeBlock}`;
  };

  // Fetch activity details from learning_modules
  const fetchActivityDetails = async (learningModuleId: string) => {
    try {
      const { data, error } = await supabase
        .from('learning_modules')
        .select('*')
        .eq('learning_module_id', learningModuleId)
        .single();

      if (error) throw error;

      console.log('[Skills Activity] Fetched module details:', data);

      const gradeInstructions = getGradeAppropriateInstructions(userGradeLevel, communicationLevel);
      
      return {
        title: data?.title || 'Learning Activity',
        description: data?.description || 'Description not available.',
        category: data?.category || '',
        subCategory: data?.sub_category || '',
        learningOrCertification: data?.learning_or_certification || '',
        aiInstructions: data?.ai_facilitator_instructions 
          ? `${gradeInstructions}\n\n${data.ai_facilitator_instructions}`
          : `${gradeInstructions}\n\nYou are a helpful skills learning assistant. Guide the student through this learning activity with patience and encouragement. Ask questions to check their understanding and provide helpful feedback.`,
        assessmentInstructions: data?.ai_assessment_instructions || 'Based on the conversation history, evaluate the student\'s performance in this skills learning activity. Consider their engagement, understanding, effort, and progress.',
        successMetrics: data?.metrics_for_success || 'Evaluate based on student engagement, understanding of concepts, quality of responses, and overall learning progress.',
        outcomes: data?.outcomes || 'Develop skills and understanding through guided practice and reflection.'
      };
    } catch (err) {
      console.error('[Skills Activity] Error fetching activity details:', err);
      
      const gradeInstructions = getGradeAppropriateInstructions(userGradeLevel, communicationLevel);
      
      return {
        title: 'This skills learning activity',
        description: 'Description could not be loaded.',
        category: '',
        subCategory: '',
        learningOrCertification: '',
        aiInstructions: `${gradeInstructions}\n\nYou are a helpful skills learning assistant. Guide the student through this learning activity with patience and encouragement. Ask questions to check their understanding and provide helpful feedback.`,
        assessmentInstructions: `Based on the conversation history, evaluate the student's performance in this skills learning activity. Consider their engagement, understanding, effort, and progress. Provide a score from 0-100 with justification.`,
        successMetrics: 'Evaluate based on student engagement, understanding of concepts, quality of responses, and overall learning progress.',
        outcomes: 'Develop skills and understanding through guided practice and reflection.'
      };
    }
  };

  // Updated OpenAI API integration with contextual facilitation
  const callOpenAI = async (userMessage: string, chatHistory: ChatMessage[], baseFacilitatorInstructions: string) => {
    try {
      console.log('[Skills Chat] Making API call with contextual facilitation');
      
      // Build contextual prompt based on current evaluation state
      const contextualPrompt = buildContextualFacilitationPrompt(
        baseFacilitatorInstructions,
        currentModuleSubCategory,
        currentEvaluationState
      );
      
      const messages: ClientChatMessage[] = [
        ...chatHistory.slice(1).map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: msg.content
        })),
        {
          role: 'user',
          content: userMessage
        }
      ];

      console.log('[Skills Chat] Using contextual facilitation with current scores');

      const response = await chatText({
        messages,
        system: contextualPrompt,
        max_tokens: 500,
        temperature: 0.7,
        page: 'SkillsDevelopmentPage',  // → Groq Llama 3.3 70B
      });

      console.log('[Skills Chat] API response received successfully');
      
      return response || 'I apologize, but I encountered an issue generating a response. Please try again.';
    } catch (error) {
      console.error('[Skills Chat] Error calling API:', error);
      
      if (error instanceof Error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('api key') || msg.includes('missing api')) {
          return 'I apologize, but the AI service is not properly configured. Please ensure your OpenAI API key is set in the environment variables and restart the server.';
        } else if (msg.includes('429')) {
          return "I'm currently experiencing high demand. Please wait a moment and try again.";
        } else if (msg.includes('401')) {
          return "There's an authentication issue with the AI service. Please check that your OpenAI API key is valid and has sufficient credits.";
        } else {
          return `I apologize, but I encountered a technical issue: ${error.message}. Please try again. If the problem persists, please contact support.`;
        }
      } else {
        return 'I apologize, but I encountered a technical issue. Please try again. If the problem persists, please contact support.';
      }
    }
  };

  // ── Reflection validation API call ──────────────────────────────────────
  const validateReflection = async (reflectionContent: string): Promise<{
    isGenuine: boolean;
    qualityFlag: 'substantive' | 'surface' | 'missing';
    nudge?: string;
  }> => {
    try {
      setReflectionValidating(true);
      const result = await chatJSON({
        page: 'SkillsDevelopmentPage',  // → Groq Llama 3.3 70B
        messages: [{
          role: 'user',
          content: `Evaluate whether this learner response is a genuine learning reflection.

LEARNER RESPONSE:
"${reflectionContent}"

A GENUINE REFLECTION must:
- Reference something specific learned or attempted (not just "it was good" or "I learned a lot")
- Acknowledge at least one difficulty, uncertainty, or moment of challenge
- Include some forward-looking element (next time I would... / I want to learn more about... / I realised I need to...)

A SURFACE reflection is vague, generic, or only complimentary ("This was great, I enjoyed it").
A MISSING reflection is off-topic, a question, or a refusal.

Respond ONLY with valid JSON:
{
  "isGenuine": <boolean>,
  "qualityFlag": "<substantive|surface|missing>",
  "nudge": "<if not genuine: one warm, specific prompt to help them go deeper — e.g. what was hard? what surprised you? If genuine: null>"
}`
        }],
        system: 'You are evaluating learning reflections for quality. Respond ONLY with valid JSON.',
        max_tokens: 300,
        temperature: 0.1
      });
      return result as any;
    } catch {
      return { isGenuine: true, qualityFlag: 'substantive' };
    } finally {
      setReflectionValidating(false);
    }
  };

  // Skills rubric assessment - evaluates based on LAST user response
  const callSkillsRubricAssessmentIncremental = async (
    chatHistory: ChatMessage[], 
    subCategory: string,
    assessmentInstructions: string,
    successMetrics: string
  ): Promise<SkillsRubricEvaluation> => {
    try {
      console.log('[Incremental Assessment] Evaluating last user response for:', subCategory);
      
      const dimensions = RUBRIC_DEFINITIONS[subCategory] || [];
      if (dimensions.length === 0) {
        throw new Error(`No rubric dimensions found for sub-category: ${subCategory}`);
      }

      // Get just the last few exchanges for focused evaluation
      const recentHistory = chatHistory.slice(-6); // Last 3 exchanges
      const chatHistoryText = recentHistory.map(msg => 
        `${msg.role === 'assistant' ? 'AI Assistant' : 'Student'}: ${msg.content.slice(0, 500)}`
      ).join('\n\n');

      const assessmentPrompt = `You are evaluating a student's MOST RECENT response in the "${subCategory}" skill area.

FOCUS: Evaluate ONLY the student's latest response and the immediate preceding AI-student exchange.

Assessment Instructions:
${assessmentInstructions}

Success Metrics:
${successMetrics}

Rubric Evidence Definitions:
${RUBRIC_EVIDENCE_DEFINITIONS}

Recent Conversation (focus on the LAST student response):
${chatHistoryText}

CRITICAL: Evaluate the student's MOST RECENT response across ALL of the following dimensions:
${dimensions.map(d => `- ${d.replace(/_/g, ' ')}`).join('\n')}

For each dimension:
1. Assign a score from 0-3 based ONLY on evidence in the LAST student response
2. Provide specific evidence from that response

Respond with ONLY valid JSON. Do NOT wrap the JSON in markdown code fences (for example, three backticks followed by "json" and closing three backticks):
{
  "dimensions": [
    ${dimensions.map(d => `{
      "dimension": "${d}",
      "score": [0-3],
      "evidence": "[specific evidence from LAST response]"
    }`).join(',\n    ')}
  ]
}

Scoring:
- 0: No Evidence
- 1: Emerging (Unclear)
- 2: Proficient
- 3: Advanced

Provide assessment now:`;

      const messages: ClientChatMessage[] = [
        {
          role: 'user',
          content: assessmentPrompt
        }
      ];

      const assessment = await chatJSON({
        page: 'SkillsDevelopmentPage',
        messages,
        system: 'You are an expert AI assessment evaluator. Evaluate ONLY the most recent student response. Respond only with valid JSON.',
        max_tokens: 1500,
        temperature: 0.3
      });

      // Parse sanitized JSON responses. If parsing fails, log the raw content and
      // return a structured mock assessment so the UI can display a helpful fallback.
      let finalAssessment: SkillsRubricEvaluation;
      if (typeof assessment === 'string') {
        const raw = assessment;
        const cleaned = String(raw)
          .replace(/```(?:json|JSON|js|javascript)?\s*[\r\n]*/g, '')
          .replace(/[\r\n]*```\s*$/g, '')
          .trim();
        try {
          finalAssessment = JSON.parse(cleaned) as SkillsRubricEvaluation;
        } catch (parseError) {
          console.error('[Incremental Assessment] JSON.parse failed on cleaned response:', parseError);
          console.error('[Incremental Assessment] Full raw response:', raw);
          console.error('[Incremental Assessment] Cleaned attempt preview:', cleaned.slice(0, 1000));
          const dimensions = RUBRIC_DEFINITIONS[subCategory] || [];
          finalAssessment = {
            dimensions: dimensions.map(dim => ({
              dimension: dim,
              score: 1,
              evidence: 'Incremental assessment unavailable due to parse failure. Raw response has been logged.'
            }))
          } as SkillsRubricEvaluation;
        }
      } else {
        finalAssessment = assessment as SkillsRubricEvaluation;
      }
      
      if (!finalAssessment.dimensions || !Array.isArray(finalAssessment.dimensions)) {
        throw new Error('Invalid assessment format');
      }

      for (const dim of finalAssessment.dimensions) {
        if (typeof dim.dimension !== 'string' || typeof dim.score !== 'number' || typeof dim.evidence !== 'string') {
          throw new Error('Invalid dimension format');
        }
        dim.score = Math.max(0, Math.min(3, Math.round(dim.score)));
      }
      
      console.log('[Incremental Assessment] Completed:', finalAssessment);
      return finalAssessment;
    } catch (error) {
      console.error('[Incremental Assessment] Error:', error);
      
      const dimensions = RUBRIC_DEFINITIONS[subCategory] || [];
      return {
        dimensions: dimensions.map(dim => ({
          dimension: dim,
          score: 1,
          evidence: `Incremental assessment unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
        }))
      };
    }
  };

  // Generate improvement advice based on evaluation
  const generateImprovementAdvice = async (
    chatHistory: ChatMessage[],
    rubricEvaluation: SkillsRubricEvaluation,
    subCategory: string
  ): Promise<string> => {
    try {
      console.log('[Improvement Advice] Generating personalized advice for:', subCategory);
      
      // Build summary of current performance
      const performanceSummary = rubricEvaluation.dimensions
        .map(dim => {
          const level = dim.score === 0 ? 'No Evidence (0/3)' :
                       dim.score === 1 ? 'Emerging (1/3)' :
                       dim.score === 2 ? 'Proficient (2/3)' : 'Advanced (3/3)';
          return `- ${dim.dimension.replace(/_/g, ' ')}: ${level}\n  Evidence: ${dim.evidence}`;
        })
        .join('\n\n');

      // Identify areas needing improvement (scores < 3)
      const areasForImprovement = rubricEvaluation.dimensions
        .filter(dim => dim.score < 3)
        .sort((a, b) => a.score - b.score) // Sort by score (lowest first)
        .map(dim => dim.dimension.replace(/_/g, ' '))
        .join(', ');

      // Get recent conversation context
      const recentHistory = chatHistory.slice(-10); // Last 5 exchanges
      const conversationContext = recentHistory.map(msg => 
        `${msg.role === 'assistant' ? 'AI' : 'Student'}: ${msg.content}`
      ).join('\n\n');

      const cs = personalityBaseline.communicationStrategy;
      const ls = personalityBaseline.learningStrategy;
      const personalizedCoachBlock = (cs || ls) ? `
PERSONALIZED LEARNER PROFILE:
${cs ? `- Communication Preference: tone=${cs.preferred_tone ?? 'n/a'}, interaction=${cs.interaction_style ?? 'n/a'}, detail=${cs.detail_level ?? 'n/a'}` : ''}
${cs?.recommendations?.length ? `  Communication Tips: ${cs.recommendations.join('; ')}` : ''}
${ls ? `- Learning Preference: style=${ls.learning_style ?? 'n/a'}, motivation=${ls.motivation_approach ?? 'n/a'}, pacing=${ls.pacing_preference ?? 'n/a'}` : ''}
${ls?.recommendations?.length ? `  Learning Tips: ${ls.recommendations.join('; ')}` : ''}

Adapt your feedback tone, phrasing, examples, and pacing to match this profile.
` : '';

      const advicePrompt = `You are an expert skills coach providing personalized improvement advice to a student.

STUDENT'S CURRENT PERFORMANCE IN ${subCategory}:

${performanceSummary}

AREAS NEEDING IMPROVEMENT (lowest to highest):
${areasForImprovement || 'All dimensions are at Advanced level!'}
${personalizedCoachBlock}
RECENT CONVERSATION CONTEXT:
${conversationContext}

RUBRIC CRITERIA FOR ${subCategory}:
${RUBRIC_EVIDENCE_DEFINITIONS}

TASK: Provide specific, actionable improvement advice to help this student advance in ${subCategory}.

REQUIREMENTS:
1. Focus primarily on the weakest dimension(s)
2. Provide 3-5 specific, concrete suggestions
3. Reference specific examples from their conversation when possible
4. Explain HOW to reach the next level (e.g., from Emerging to Proficient, or Proficient to Advanced)
5. Be encouraging and constructive
6. Make advice practical and immediately actionable
${(cs || ls) ? '7. Deliver all advice in a tone and style that matches the learner\'s communication and learning preferences above' : ''}

FORMAT YOUR RESPONSE AS:
**Priority Areas for Growth:**
[List the 1-2 weakest dimensions]

**Specific Suggestions:**
1. [Concrete action item with example]
2. [Concrete action item with example]
3. [Concrete action item with example]
[etc.]

**Next Steps:**
[Brief summary of what to focus on in next practice session]

Provide your improvement advice now:`;

      const messages: ClientChatMessage[] = [
        {
          role: 'user',
          content: advicePrompt
        }
      ];

      const advice = await chatText({
        page: 'SkillsDevelopmentPage',
        messages,
        system: 'You are an expert educational coach providing personalized, actionable feedback to help students improve their skills. Be specific, encouraging, and practical. When a learner profile is provided, tailor your tone, examples, and delivery to match their communication and learning preferences.',
        max_tokens: 800,
        temperature: 0.7
      });

      console.log('[Improvement Advice] Generated successfully');
      return advice || 'Unable to generate improvement advice at this time. Please try again.';
      
    } catch (error) {
      console.error('[Improvement Advice] Error:', error);
      return 'Unable to generate improvement advice at this time. Please continue practicing and request evaluation again later.';
    }
  };

  // Full rubric assessment based on entire chat history
  const callSkillsRubricAssessmentFull = async (
    chatHistory: ChatMessage[], 
    subCategory: string,
    assessmentInstructions: string,
    successMetrics: string
  ): Promise<SkillsRubricEvaluation> => {
    try {
      console.log('[Full Assessment] Evaluating entire conversation for:', subCategory);
      
      const dimensions = RUBRIC_DEFINITIONS[subCategory] || [];
      if (dimensions.length === 0) {
        throw new Error(`No rubric dimensions found for sub-category: ${subCategory}`);
      }

      const chatHistoryText = chatHistory.slice(-10).map(msg => 
        `${msg.role === 'assistant' ? 'AI Assistant' : 'Student'}: ${msg.content.slice(0, 500)}`
      ).join('\n\n');

      const reflectionSection = reflectionText
        ? `\n\nLEARNER END-OF-SESSION REFLECTION:\n"${reflectionText}"\n\nNote: This reflection demonstrates metacognitive awareness. Weight it toward the Reflection dimension (Critical Thinking) and any metacognitive dimensions. A substantive reflection that identifies learning and forward intent should raise those scores.`
        : `\n\nNote: No end-of-session reflection was submitted. Cap any Reflection or Metacognitive dimension score at 2 maximum. Proficient or Advanced on those dimensions requires demonstrated metacognitive reflection.`;

      const assessmentPrompt = `You are evaluating a student's OVERALL performance in "${subCategory}" based on the COMPLETE conversation history.

Assessment Instructions:
${assessmentInstructions}

Success Metrics:
${successMetrics}

Rubric Evidence Definitions:
${RUBRIC_EVIDENCE_DEFINITIONS}
${reflectionSection}
COMPLETE Conversation History:
${chatHistoryText}

CRITICAL: Evaluate the student's OVERALL performance across ALL dimensions:
${dimensions.map(d => `- ${d.replace(/_/g, ' ')}`).join('\n')}

For each dimension:
1. Assign a score from 0-3 based on ALL evidence across the conversation
2. Provide comprehensive evidence from multiple responses if available

Respond with ONLY valid JSON:
{
  "dimensions": [
    ${dimensions.map(d => `{
      "dimension": "${d}",
      "score": [0-3],
      "evidence": "[comprehensive evidence from conversation]"
    }`).join(',\n    ')}
  ]
}

Scoring:
- 0: No Evidence
- 1: Emerging (Unclear)  
- 2: Proficient
- 3: Advanced

Provide assessment now:`;

      const messages: ClientChatMessage[] = [
        {
          role: 'user',
          content: assessmentPrompt
        }
      ];

      const assessment = await chatJSON({
        page: 'SkillsDevelopmentPage',
        messages,
        system: 'You are an expert AI assessment evaluator for comprehensive skill evaluation. Respond only with valid JSON.',
        max_tokens: 3000,
        temperature: 0.3
      });

      let finalAssessment: SkillsRubricEvaluation;
      if (typeof assessment === 'string') {
        finalAssessment = JSON.parse(assessment);
      } else {
        finalAssessment = assessment as SkillsRubricEvaluation;
      }
      
      if (!finalAssessment.dimensions || !Array.isArray(finalAssessment.dimensions)) {
        throw new Error('Invalid assessment format');
      }

      for (const dim of finalAssessment.dimensions) {
        if (typeof dim.dimension !== 'string' || typeof dim.score !== 'number' || typeof dim.evidence !== 'string') {
          throw new Error('Invalid dimension format');
        }
        dim.score = Math.max(0, Math.min(3, Math.round(dim.score)));
      }
      
      console.log('[Full Assessment] Completed:', finalAssessment);
      return finalAssessment;
    } catch (error) {
      console.error('[Full Assessment] Error:', error);
      
      const dimensions = RUBRIC_DEFINITIONS[subCategory] || [];
      return {
        dimensions: dimensions.map(dim => ({
          dimension: dim,
          score: 2,
          evidence: `Full assessment unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
        }))
      };
    }
  };

  // Update activity with rubric evaluation
  const updateSkillsRubricEvaluation = async (
    activityId: string, 
    subCategory: string,
    rubricEvaluation: SkillsRubricEvaluation,
    chatHistory: ChatMessage[],
    _forceComplete: boolean = false
  ) => {
    // Guard: Don't attempt database operations for mock activity IDs
    if (String(activityId ?? '').startsWith('mock-')) {
      console.log('[Skills Rubric Update] Skipping database update for mock activity:', activityId);
      // Update local state only
      const evaluationScore = Math.min(...rubricEvaluation.dimensions.map(dim => dim.score));
      const shouldComplete = evaluationScore === 3;
      const newProgress = shouldComplete ? 'completed' : 'started';

      const aggregateEvidence = rubricEvaluation.dimensions
        .map(dim => `${dim.dimension.replace(/_/g, ' ')}: ${dim.evidence}`)
        .join(' | ');

      // Map dimensions to the same per-dimension columns the real-DB branch
      // uses, so cards/redisplays show full evidence for mock (Dayton, etc.)
      // activities too, not just the aggregate score.
      const colMap = RUBRIC_COLUMN_MAP[subCategory] || {};
      const dimensionData: Record<string, number | string> = {};
      for (const dim of rubricEvaluation.dimensions) {
        const dimensionKey = dim.dimension.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const cols = colMap[dimensionKey];
        if (cols) {
          dimensionData[cols.score] = dim.score;
          dimensionData[cols.evidence] = dim.evidence;
        }
      }

      setAllSkillsActivities(prev =>
        prev.map(activity =>
          activity.id === activityId
            ? {
                ...activity,
                certification_evaluation_score: evaluationScore,
                certification_evaluation_evidence: aggregateEvidence,
                progress: newProgress as 'not started' | 'started' | 'completed',
                ...dimensionData
              }
            : activity
        )
      );

      if (selectedActivity && selectedActivity.id === activityId) {
        setSelectedActivity(prev => prev ? {
          ...prev,
          certification_evaluation_score: evaluationScore,
          certification_evaluation_evidence: aggregateEvidence,
          progress: newProgress as 'not started' | 'started' | 'completed',
          ...dimensionData
        } : null);
      }

      if (shouldComplete) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }

      return {
        ...rubricEvaluation,
        score: evaluationScore,
        progress: newProgress
      };
    }

    try {
      console.log('[Skills Rubric Update] Updating database for:', subCategory);
      
      // Use MINIMUM score for overall certification score (0-3 scale, not percentage)
      // This represents the minimum proficiency level achieved across all dimensions
      const evaluationScore = Math.min(...rubricEvaluation.dimensions.map(dim => dim.score));
      
      const aggregateEvidence = rubricEvaluation.dimensions
        .map(dim => `${dim.dimension.replace(/_/g, ' ')}: ${dim.evidence}`)
        .join(' | ');
      
      // Only auto-complete if all dimensions reach Advanced (score 3)
      const shouldComplete = evaluationScore === 3;
      const newProgress = shouldComplete ? 'completed' : 'started';
      
      const updateData: any = {
        certification_evaluation_score: evaluationScore,
        certification_evaluation_evidence: aggregateEvidence,
        chat_history: JSON.stringify(chatHistory),
        progress: newProgress,
        updated_at: new Date().toISOString()
      };

      // Map dimensions to exact database columns using RUBRIC_COLUMN_MAP
      const colMap = RUBRIC_COLUMN_MAP[subCategory] || {};

      for (const dim of rubricEvaluation.dimensions) {
        const dimensionKey = dim.dimension.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const cols = colMap[dimensionKey];

        if (cols) {
          updateData[cols.score]    = dim.score;
          updateData[cols.evidence] = dim.evidence;
          console.log('[Skills Rubric Update] Mapping:', dim.dimension, '->', cols.score, '=', dim.score);
        } else {
          console.warn('[Skills Rubric Update] No column mapping for:', subCategory, '/', dim.dimension);
        }
      }

      console.log('[Skills Rubric Update] Update data:', updateData);

      // Ensure session is valid before database write
      console.log('[Skills Rubric Update] Checking session validity...');
      const sessionValid = await ensureValidSession();
      if (!sessionValid) {
        console.warn('[Skills Rubric Update] Session invalid, attempting write anyway...');
      }

      // Attempt database write with retry on auth errors
      let writeError = null;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          const { error } = await supabase
            .from('dashboard')
            .update(updateData)
            .eq('id', activityId);

          if (error) {
            writeError = error;
            // Check if it's an auth error that might benefit from retry
            if (error.message?.includes('JWT') || error.message?.includes('session') || error.message?.includes('auth')) {
              console.warn(`[Skills Rubric Update] Auth error on attempt ${retryCount + 1}:`, error.message);
              if (retryCount < maxRetries) {
                retryCount++;
                console.log(`[Skills Rubric Update] Retrying... (${retryCount}/${maxRetries})`);
                // Brief delay before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
                // Try refreshing session again
                await ensureValidSession();
                continue;
              }
            }
            throw error;
          }
          
          // Success - break out of retry loop
          writeError = null;
          break;
        } catch (err) {
          writeError = err;
          if (retryCount >= maxRetries) {
            throw err;
          }
        }
      }

      if (writeError) {
        throw writeError;
      }
      
      // Update local state
      setAllSkillsActivities(prev => 
        prev.map(activity => 
          activity.id === activityId 
            ? { 
                ...activity, 
                certification_evaluation_score: evaluationScore, 
                certification_evaluation_evidence: aggregateEvidence,
                progress: newProgress as 'not started' | 'started' | 'completed',
                ...updateData
              }
            : activity
        )
      );

      if (selectedActivity && selectedActivity.id === activityId) {
        const updatedActivity = {
          ...selectedActivity,
          certification_evaluation_score: evaluationScore,
          certification_evaluation_evidence: aggregateEvidence,
          progress: newProgress as 'not started' | 'started' | 'completed',
          ...updateData
        };
        setSelectedActivity(updatedActivity);
        
        // Update evaluation state for next facilitation
        const newEvalState = await loadCurrentEvaluationState(updatedActivity, subCategory);
        setCurrentEvaluationState(newEvalState);
      }
      
      console.log('[Skills Rubric Update] Success');

      // Dual-write to the shared evaluations table alongside the legacy
      // per-dimension dashboard columns above — see src/lib/evaluations.ts.
      // The legacy columns stay authoritative for dashboard/profile score
      // badges until those are migrated too.
      if (user?.id) {
        saveEvaluation(user.id, {
          dashboardId: activityId,
          activityType: 'ai_ready_skills',
          overallScore: evaluationScore,
          maxScore: 3,
          evidence: aggregateEvidence,
          criteria: rubricEvaluation.dimensions.map((dim, index) => ({
            key: `${dim.dimension}-${index}`,
            label: dim.dimension.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            score: dim.score,
            evidence: dim.evidence,
          })),
        }).catch(err => console.warn('[Evaluation] Dual-write to evaluations table failed:', err));
      }

      return { score: evaluationScore, completed: shouldComplete };
    } catch (err) {
      console.error('[Skills Rubric Update] Error:', err);
      throw err;
    }
  };

  // Ensure Supabase session is valid before critical database operations
  const ensureValidSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[Session] Error getting session:', error);
        return false;
      }
      if (!session) {
        console.warn('[Session] No active session');
        return false;
      }
      // Check if session is expiring soon (within 60 seconds)
      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      if (expiresAt && (expiresAt - now) < 60) {
        console.log('[Session] Session expiring soon, refreshing...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error('[Session] Refresh failed:', refreshError);
          return false;
        }
        console.log('[Session] Session refreshed successfully');
        return !!refreshData.session;
      }
      return true;
    } catch (err) {
      console.error('[Session] Exception checking session:', err);
      return false;
    }
  };

  // Update chat history in database
  const updateChatHistory = async (activityId: string, chatHistory: ChatMessage[]) => {
    // Guard: Don't attempt database operations for mock activity IDs
    if (String(activityId ?? '').startsWith('mock-')) {
      console.log('[Chat History] Skipping database update for mock activity:', activityId);
      // Use localStorage for mock activities
      try {
        const key = `SkillsDevelopmentPage_historyCache_${activityId}`;
        localStorage.setItem(key, JSON.stringify(chatHistory));
      } catch (err) {
        console.warn('[Chat History] Failed to save mock activity to localStorage:', err);
      }
      return;
    }

    try {
      // Quick session check (don't wait for refresh to avoid delays)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('[Chat History] No active session, skipping update');
        return;
      }

      const { error } = await supabase
        .from('dashboard')
        .update({ 
          chat_history: JSON.stringify(chatHistory),
          updated_at: new Date().toISOString()
        })
        .eq('id', activityId);

      if (error) throw error;
    } catch (err) {
      console.error('[Chat History] Error updating:', err);
      // Don't throw - chat history updates are non-critical
    }
  };

  // Handle celebration confetti
  const handleCelebration = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  };

  const handleImproveEnglish = async () => {
    if (!userInput.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const result = await chatJSON({
        page: 'SkillsDevelopmentPage',  // → Groq Llama 3.3 70B
        messages: [{
          role: 'user',
          content: `You are an English language coach helping a student in rural Nigeria improve their writing.
            The student wrote: "${userInput.trim()}"

            Your job:
            1. Carefully interpret what the student is trying to say — even if the grammar is poor, words are missing, or the sentence is incomplete.
            2. Rewrite their message as a complete, grammatically correct English sentence that expresses their intended meaning.
            3. Preserve their voice, ideas, and personality — do not change WHAT they are saying, only HOW it is said.
            4. Fix all grammar errors: subject-verb agreement, tense consistency, missing articles, word order, punctuation, and sentence completeness.
            5. If the meaning is unclear, make the most reasonable interpretation and write the clearest possible sentence.

            Return ONLY valid JSON: { "improved_text": "..." }`
        }],
        system: 'You are an English language coach. Return only valid JSON.',
        max_tokens: 600,
        temperature: 0.3,
      });
      if (result?.improved_text) setUserInput(result.improved_text);
    } catch (err) {
      console.error('Improve English error:', err);
    } finally {
      setIsImproving(false);
    }
  };
  // ── Parse rubric scores from the most recent AI rubric block in chat ─────────
  // Finds patterns like "dimension name: 2 —" to detect Proficient/Advanced status
  // without requiring a full evaluation to have run first.
  const extractLatestRubricScores = (history: typeof chatHistory): number[] => {
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role !== 'assistant') continue;
      if (!/rubric\s*\(/i.test(msg.content)) continue;
      const matches = [...msg.content.matchAll(/:\s*([0-3])\s*[—–-]/g)];
      if (matches.length >= 2) {
        return matches.map(m => parseInt(m[1], 10));
      }
    }
    return [];
  };

  // ── Complete Session — skips modal if reflection already captured in-chat ───
  const handleCompleteSession = () => {
    if (hasReflection && reflectionText.trim()) {
      // Learner already reflected via the in-chat Step 5 prompt — skip the modal
      handleCompleteSessionSubmit(reflectionText.trim());
    } else {
      setSessionReflectionInput('');
      setShowCompleteSessionModal(true);
    }
  };

  const handleCompleteSessionSubmit = async (overrideText?: string) => {
    const reflection = (overrideText ?? sessionReflectionInput).trim();
    if (!reflection || !selectedActivity || chatHistory.length <= 1) return;

    setCompletingSession(true);
    setShowCompleteSessionModal(false);

    // Store reflection so any subsequent saves also use it
    setReflectionText(reflection);
    setHasReflection(true);

    try {
      const isSkillsLearning = currentModuleCategory === 'Skills' && currentModuleLearningOrCert === 'learning';

      if (isSkillsLearning && currentModuleSubCategory) {
        const rubricEvaluation = await callSkillsRubricAssessmentFull(
          chatHistory,
          currentModuleSubCategory,
          aiAssessmentInstructions,
          successMetrics
        );

        const improvementAdvice = await generateImprovementAdvice(
          chatHistory,
          rubricEvaluation,
          currentModuleSubCategory
        );
        rubricEvaluation.improvementAdvice = improvementAdvice;

        const isMockActivity = String(selectedActivity.id ?? '').startsWith('mock-');
        let result: any = null;
        if (isMockActivity) {
          console.warn('[Complete Session] Skipping remote updateSkillsRubricEvaluation for mock activity id:', selectedActivity.id);
        } else {
          try {
            result = await updateSkillsRubricEvaluation(
              selectedActivity.id,
              currentModuleSubCategory,
              rubricEvaluation,
              chatHistory,
              true // force completion
            );
          } catch (dbErr) {
            console.warn('[Complete Session] Failed to update remote skills rubric evaluation:', dbErr);
          }
        }

        // Always update local UI state so the user is not blocked by remote failures
        setEvaluationResult(rubricEvaluation);
        setShowEvaluationModal(true);

        if (result && result.score === 100) {
          handleCelebration();
        } else if (isMockActivity) {
          // For mock activities, still celebrate to reflect completion locally
          handleCelebration();
        }
      } else {
        const isMockActivity = String(selectedActivity.id ?? '').startsWith('mock-');
        if (isMockActivity) {
          console.warn('[Complete Session] Skipping remote dashboard update for mock activity id:', selectedActivity.id);
          alert('Module completed (mock).');
          handleBackToOverview();
        } else {
          try {
            const { error } = await supabase
              .from('dashboard')
              .update({
                progress: 'completed',
                chat_history: JSON.stringify(chatHistory),
                updated_at: new Date().toISOString()
              })
              .eq('id', selectedActivity.id);
            if (error) throw error;
            alert('Module completed successfully!');
            handleBackToOverview();
          } catch (dbErr) {
            console.warn('[Complete Session] Failed to update remote dashboard:', dbErr);
            // Still allow local completion flow
            alert('Module completed (local).');
            handleBackToOverview();
          }
        }
      }

      // Silently tweak personality baseline
      if (user?.id && chatHistory.length > 1) {
        tweakPersonalityBaseline(user.id, chatHistory, personalityBaseline).catch(() => {});
      }
    } catch (error) {
      console.error('[Complete Session] Error:', error);
      alert('Failed to complete session. Please try again.');
      setShowCompleteSessionModal(true);
    } finally {
      setCompletingSession(false);
    }
  };

  // Save Session - Full assessment of entire conversation
  const handleSaveSession = async () => {
    if (!selectedActivity || chatHistory.length <= 1) {
      alert('No conversation history to save.');
      return;
    }

    setSavingSession(true);
    
    try {
      const isSkillsLearning = currentModuleCategory === 'Skills' && currentModuleLearningOrCert === 'learning';

      if (isSkillsLearning && currentModuleSubCategory) {
        console.log('[Save Session] Performing full rubric assessment');

        const rubricEvaluation = await callSkillsRubricAssessmentFull(
          chatHistory,
          currentModuleSubCategory,
          aiAssessmentInstructions,
          successMetrics
        );

        // updateSkillsRubricEvaluation has its own mock-vs-real branch internally
        // (mock activities update local state only, real ones write to Supabase),
        // so it's safe to call unconditionally here.
        await updateSkillsRubricEvaluation(
          selectedActivity.id,
          currentModuleSubCategory,
          rubricEvaluation,
          chatHistory,
          false // Don't force completion
        );

        // Show the same evaluation popup that Complete Session shows, so the
        // learner can see scores and evidence without leaving the page.
        setEvaluationResult(rubricEvaluation);
        setShowEvaluationModal(true);
      } else {
        // Just save chat history for non-Skills activities
        await updateChatHistory(selectedActivity.id, chatHistory);
        alert('Session saved successfully!');
      }

      // Silently tweak personality baseline in the background — never blocks the save
      if (user?.id && chatHistory.length > 1) {
        tweakPersonalityBaseline(user.id, chatHistory, personalityBaseline).catch(() => {});
      }
      
    } catch (error) {
      console.error('Error saving session:', error);
      alert('Failed to save session. Please try again.');
    } finally {
      setSavingSession(false);
    }
  };

  // Finish Module - Evaluate, save, and mark as completed
  const handleFinishModule = async () => {
    if (!selectedActivity || chatHistory.length <= 1) {
      alert('Please have a conversation before finishing the module.');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to finish this module? Your session will be evaluated. ' +
      'It will be marked as completed only if you have scored 3 (Advanced) on every rubric dimension.'
    );
    
    if (!confirmed) return;

    setFinishingModule(true);
    
    try {
      const isSkillsLearning = currentModuleCategory === 'Skills' && currentModuleLearningOrCert === 'learning';
      
      if (isSkillsLearning && currentModuleSubCategory) {
        console.log('[Finish Module] Performing final evaluation with improvement advice');
        
        // Step 1: Get rubric evaluation
        const rubricEvaluation = await callSkillsRubricAssessmentFull(
          chatHistory,
          currentModuleSubCategory,
          aiAssessmentInstructions,
          successMetrics
        );
        
        // Step 2: Generate improvement advice (even for completion)
        const improvementAdvice = await generateImprovementAdvice(
          chatHistory,
          rubricEvaluation,
          currentModuleSubCategory
        );
        
        // Add improvement advice to evaluation result
        rubricEvaluation.improvementAdvice = improvementAdvice;
        
        // Step 3: Update database and force completion
        const result = await updateSkillsRubricEvaluation(
          selectedActivity.id,
          currentModuleSubCategory,
          rubricEvaluation,
          chatHistory,
          true // Force completion
        );
        
        // Step 4: Show evaluation results
        setEvaluationResult(rubricEvaluation);
        setShowEvaluationModal(true);
        
        // Show celebration if 100% score
        if (result && result.score === 100) {
          handleCelebration();
        }
      } else {
        // Just mark as completed for non-Skills activities
        const isMockActivity = String(selectedActivity.id ?? '').startsWith('mock-');
        if (isMockActivity) {
          console.log('[Finish Module] Marking mock activity as completed (local only)');
          try {
            const key = `SkillsDevelopmentPage_historyCache_${selectedActivity.id}`;
            localStorage.setItem(key, JSON.stringify(chatHistory));
          } catch (err) {
            console.warn('[Finish Module] Failed to save mock activity to localStorage:', err);
          }
        } else {
          const { error } = await supabase
            .from('dashboard')
            .update({ 
              progress: 'completed',
              chat_history: JSON.stringify(chatHistory),
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedActivity.id);

          if (error) throw error;
        }
        
        alert('Module completed successfully!');
        handleBackToOverview();
      }

      // Silently tweak personality baseline — never blocks completion
      if (user?.id && chatHistory.length > 1) {
        tweakPersonalityBaseline(user.id, chatHistory, personalityBaseline).catch(() => {});
      }
      
    } catch (error) {
      console.error('Error finishing module:', error);
      alert('Failed to finish module. Please try again.');
    } finally {
      setFinishingModule(false);
    }
  };


  // Update Evaluation - Full assessment with modal display
  const handleUpdateEvaluation = async () => {
    if (!selectedActivity || chatHistory.length <= 1) {
      alert('No conversation history available for evaluation.');
      return;
    }

    setEvaluating(true);
    
    try {
      const isSkillsLearning = currentModuleCategory === 'Skills' && currentModuleLearningOrCert === 'learning';
      
      if (isSkillsLearning && currentModuleSubCategory) {
        console.log('[Update Evaluation] Full rubric assessment with improvement advice');
        
        // Step 1: Get rubric evaluation
        const rubricEvaluation = await callSkillsRubricAssessmentFull(
          chatHistory,
          currentModuleSubCategory,
          aiAssessmentInstructions,
          successMetrics
        );
        
        // Step 2: Generate improvement advice
        const improvementAdvice = await generateImprovementAdvice(
          chatHistory,
          rubricEvaluation,
          currentModuleSubCategory
        );
        
        // Add improvement advice to evaluation result
        rubricEvaluation.improvementAdvice = improvementAdvice;
        
        // Step 3: Update database
        const result = await updateSkillsRubricEvaluation(
          selectedActivity.id,
          currentModuleSubCategory,
          rubricEvaluation,
          chatHistory,
          false // Don't force completion - only completes at 100%
        );
        
        // Step 4: Show modal with evaluation and advice
        setEvaluationResult(rubricEvaluation);
        setShowEvaluationModal(true);
        
        // Show celebration only if exactly 100%
        if (result && result.score === 100) {
          handleCelebration();
        }
      }

      // Silently tweak personality baseline — never blocks evaluation display
      if (user?.id && chatHistory.length > 1) {
        tweakPersonalityBaseline(user.id, chatHistory, personalityBaseline).catch(() => {});
      }
      
    } catch (error) {
      console.error('Error during evaluation:', error);
      alert('Failed to complete evaluation. Please try again.');
    } finally {
      setEvaluating(false);
    }
  };

  // Update activity status to 'started'
  const updateActivityStatus = async (activityId: string) => {
    // Guard: Don't attempt database operations for mock activity IDs
    if (String(activityId ?? '').startsWith('mock-')) {
      console.log('[Update Status] Skipping database update for mock activity:', activityId);
      setAllSkillsActivities(prev => 
        prev.map(activity => 
          activity.id === activityId 
            ? { ...activity, progress: 'started' as const }
            : activity
        )
      );
      return;
    }

    try {
      const { error } = await supabase
        .from('dashboard')
        .update({ 
          progress: 'started',
          updated_at: new Date().toISOString()
        })
        .eq('id', activityId);

      if (error) throw error;
      
      setAllSkillsActivities(prev => 
        prev.map(activity => 
          activity.id === activityId 
            ? { ...activity, progress: 'started' as const }
            : activity
        )
      );
    } catch (err) {
      console.error('Error updating activity status:', err);
    }
  };

  const handleActivitySelect = async (activity: DashboardActivity) => {
    if (!isActivitySelectable(activity)) return;

    // CHAT HISTORY LOADING & PERSISTENCE:
    // When user opens an activity, we load any previously saved chat messages to allow them to
    // continue from where they left off. This applies to uncompleted and completed activities.
    
    // Persist current activity's chat history to local cache before switching
    try {
      if (selectedActivity) {
        const prevKey = String(selectedActivity.learning_module_id ?? selectedActivity.id ?? '');
        if (prevKey) {
          setHistoryCache(prev => ({ ...prev, [prevKey]: chatHistory }));
        }
      }
    } catch (err) {
      console.warn('[Activity Select] Failed to cache current chat history:', err);
    }

    setSelectedActivity(activity);
    
    if ((userGradeLevel === null || userContinent === null) && user?.id) {
      const profile = await fetchUserProfile(user.id);
      setUserGradeLevel(profile.gradeLevel);
      setUserContinent(profile.continent);
    }
    
    if (activity.progress === 'not started') {
      await updateActivityStatus(activity.id);
    }

    let initialChatHistory: ChatMessage[] = [];
    const newKey = String(activity.learning_module_id ?? activity.id ?? '');
    // Restore from local cache if present
    if (newKey && historyCache[newKey] && Array.isArray(historyCache[newKey]) && historyCache[newKey].length > 0) {
      initialChatHistory = historyCache[newKey];
    } else if (activity.chat_history) {
      try {
        const storedHistory = JSON.parse(activity.chat_history);
        if (Array.isArray(storedHistory) && storedHistory.length > 0) {
          initialChatHistory = storedHistory.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
        }
      } catch (error) {
        console.error('Error parsing stored chat history:', error);
      }
    }

    if (activity.learning_module_id) {
      const details = await fetchActivityDetails(activity.learning_module_id);
      setActivityDescription(details.description);
      setModuleTitle(details.title);
      setAiFacilitatorInstructions(details.aiInstructions);
      setAiAssessmentInstructions(details.assessmentInstructions);
      setSuccessMetrics(details.successMetrics);
      setLearningOutcomes(details.outcomes);
      setCurrentModuleCategory(details.category);
      setCurrentModuleSubCategory(details.subCategory);
      setCurrentModuleLearningOrCert(details.learningOrCertification);
      
      // Load current evaluation state
      if (details.category === 'Skills' && details.learningOrCertification === 'learning' && details.subCategory) {
        const evalState = await loadCurrentEvaluationState(activity, details.subCategory);
        setCurrentEvaluationState(evalState);
      } else {
        setCurrentEvaluationState(null);
      }
      
      if (initialChatHistory.length > 0) {
        setChatHistory(initialChatHistory);
      } else {
        setChatHistory([
          {
            role: 'assistant',
            content: `Hello! I'm your AI learning assistant. I'm here to guide you through "${details.title}". Are you ready to get going?`,
            timestamp: new Date()
          }
        ]);
      }
    } else {
      const gradeInstructions = getGradeAppropriateInstructions(userGradeLevel, communicationLevel);
      
      setActivityDescription('Description could not be loaded.');
      setModuleTitle(activity.title);
      setAiFacilitatorInstructions(`${gradeInstructions}\n\nYou are a helpful skills learning assistant. Guide the student through this learning activity with patience and encouragement.`);
      setAiAssessmentInstructions('Based on the conversation history, evaluate the student\'s performance.');
      setSuccessMetrics('Evaluate based on engagement and progress.');
      setLearningOutcomes('Develop skills and understanding.');
      setCurrentModuleCategory('');
      setCurrentModuleSubCategory('');
      setCurrentModuleLearningOrCert('');
      setCurrentEvaluationState(null);
      
      if (initialChatHistory.length > 0) {
        setChatHistory(initialChatHistory);
      } else {
        const topicTitle = activity.sub_category || 'Skills Development';
        const activityTitle = activity.title || 'this module';
        const welcomeMessage = `Welcome to this deep dive into **${activityTitle}** under our **${topicTitle}** framework. I'm your technical professor, and I'm excited to guide you through this hands-on learning experience.\n\nBefore we dive into the technical work, I want to make sure you're ready and energized. Are you ready to begin this lesson today? Please respond with something like "Yes, I'm ready" or "Let's go!" when you're prepared to start.`;
        setChatHistory([
          {
            role: 'assistant',
            content: welcomeMessage,
            timestamp: new Date()
          }
        ]);
      }
    }
  };

  // Handle back to overview
  const handleBackToOverview = () => {
    setSelectedActivity(null);
    setActivityDescription('');
    setModuleDescription('');
    setModuleTitle('');
    setAiFacilitatorInstructions('');
    setAiAssessmentInstructions('');
    setSuccessMetrics('');
    setLearningOutcomes('');
    setCurrentModuleCategory('');
    setCurrentModuleSubCategory('');
    setCurrentModuleLearningOrCert('');
    setCurrentEvaluationState(null);
    setChatHistory([]);
    setUserInput('');
    // Reset reflection gate
    setHasReflection(false);
    setReflectionText('');
    setReflectionAttempts(0);
    setAwaitingReflection(false);
    setReflectionValidating(false);
  };

  // Handle user message submission with automatic evaluation
  // CHAT PERSISTENCE STRATEGY:
  // 1. FETCH ON OPEN: When an activity is opened in handleActivitySelect, we fetch any existing chat_history
  //    from the activity record (via chat_history field) and restore it to the chat state.
  //    This applies to ALL activity states: 'not started', 'started', 'completed'.
  // 2. AUTO-SAVE USER MESSAGE: When user submits, we immediately save their message to database via updateChatHistory.
  // 3. AUTO-SAVE AI RESPONSE: After receiving AI response, we save the full chat history (user + AI) immediately.
  // 4. CONTINUOUS HISTORY: No conversational progress is lost if the user leaves before clicking "Complete Session".
  // 5. BACKGROUND EVALUATION: For Skills learning activities, automatic evaluation runs in background after each message.
  const handleSubmitMessage = async () => {
    if (!userInput.trim() || submitting || !selectedActivity) return;

    if (isListening && speechRecognition) {
      setWasListeningBeforeSubmit(true);
      speechRecognition.stop();
      setIsListening(false);
    } else {
      setWasListeningBeforeSubmit(false);
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: userInput.trim(),
      timestamp: new Date()
    };

    const updatedChatHistory = [...chatHistory, userMessage];
    setChatHistory(updatedChatHistory);
    
    await updateChatHistory(selectedActivity.id, updatedChatHistory);
    
    const currentInput = userInput;
    setUserInput('');
    setSubmitting(true);

    try {
      // Get AI response with contextual facilitation
      const aiResponse = await callOpenAI(currentInput, chatHistory, aiFacilitatorInstructions);
      
      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      };

      // ── Reflection gate detection ──────────────────────────────────────
      const isReflectionPrompt = (msg: string) =>
        /most important thing you learned|hardest part|approach.*differently|take a moment to reflect/i.test(msg);

      if (isReflectionPrompt(aiResponse)) {
        setAwaitingReflection(true);
      }

      // If we were awaiting a reflection, validate the learner's message
      if (awaitingReflection && currentInput.trim().length > 20 && !hasReflection) {
        const validation = await validateReflection(currentInput.trim());
        if (validation.isGenuine) {
          setHasReflection(true);
          setReflectionText(currentInput.trim());
          setAwaitingReflection(false);
        } else {
          setReflectionAttempts((prev: any) => prev + 1);
          if (validation.nudge) {
            const nudgeMessage: ChatMessage = {
              role: 'assistant',
              content: validation.nudge,
              timestamp: new Date()
            };
            const withNudge = [...updatedChatHistory, aiMessage, nudgeMessage];
            setChatHistory(withNudge);
            await updateChatHistory(selectedActivity.id, withNudge);
            return;
          }
        }
      }
      if (voiceOutputEnabled) {
        // Only the chat-visible content (suggestion + next question for a
        // rubric turn) — matches what's shown; the detailed evaluation is
        // spoken separately if the learner opens the evaluation popup.
        hookSpeak(extractChatVisibleText(aiResponse));
        // Voice input restart after TTS is handled by the isSpeaking useEffect above
      } else {
        if (wasListeningBeforeSubmit && voiceInputEnabled && speechRecognition) {
          setTimeout(() => {
            try {
              speechRecognition.start();
              setIsListening(true);
            } catch (error) {
              console.error('Error restarting voice input:', error);
            }
          }, 100);
        }
      }
      
      const finalChatHistory = [...updatedChatHistory, aiMessage];
      setChatHistory(finalChatHistory);
      
      // Save chat history
      await updateChatHistory(selectedActivity.id, finalChatHistory);

      // Immediately unblock UI so user can continue interacting
      setSubmitting(false);

      // AUTOMATIC EVALUATION after each user response for Skills learning activities
      // Run this asynchronously in the background without blocking the UI
      const isSkillsLearning = currentModuleCategory === 'Skills' && currentModuleLearningOrCert === 'learning';
      
      if (isSkillsLearning && currentModuleSubCategory && finalChatHistory.length > 2) {
        console.log('[Auto Evaluation] Starting background evaluation...');
        
        // Run evaluation in background (don't await)
        (async () => {
          try {
            const rubricEvaluation = await callSkillsRubricAssessmentIncremental(
              finalChatHistory,
              currentModuleSubCategory,
              aiAssessmentInstructions,
              successMetrics
            );
            
            await updateSkillsRubricEvaluation(
              selectedActivity.id,
              currentModuleSubCategory,
              rubricEvaluation,
              finalChatHistory
            );
            
            console.log('[Auto Evaluation] Completed successfully');
          } catch (evalError) {
            console.error('[Auto Evaluation] Error (non-blocking):', evalError);
            // Don't block user experience if evaluation fails
          }
        })();
      }
      
    } catch (error) {
      console.error('Error getting AI response:', error);
      
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'I apologize, but I encountered a technical issue. Please try again.',
        timestamp: new Date()
      };
      
      const errorChatHistory = [...updatedChatHistory, errorMessage];
      setChatHistory(errorChatHistory);
      
      await updateChatHistory(selectedActivity.id, errorChatHistory);

      if (wasListeningBeforeSubmit && voiceInputEnabled && speechRecognition) {
        setTimeout(() => {
          try {
            speechRecognition.start();
            setIsListening(true);
          } catch (error) {
            console.error('Error restarting voice input after error:', error);
          }
        }, 500);
      }
    } finally {
      setSubmitting(false);
    }
  };

  

  // Handle Enter key
  // Handle key press in text area
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitMessage();
    }
  };

  // Execute code via E2B
  const executeCode = async () => {
    if (!codeEditorContent.trim() || isExecutingCode || !selectedActivity) return;
    
    setIsExecutingCode(true);
    
    try {
      const execution = await CodeExecutionService.executeCode(
        codeEditorContent,
        selectedLanguage
      );
      
      setLatestExecution(execution);
      setCodeHistory(prev => [execution, ...prev]);
      
      // Add execution context to chat history
      const executionMessage: ChatMessage = {
        role: 'user',
        content: `I executed this ${selectedLanguage} code:\n\`\`\`${selectedLanguage}\n${codeEditorContent}\n\`\`\`\n\nResult: ${execution.error ? `Error: ${execution.error}` : `Output: ${execution.output}`}`,
        timestamp: new Date(),
        codeExecution: execution
      };
      
      const updatedHistory = [...chatHistory, executionMessage];
      setChatHistory(updatedHistory);
      
      if (selectedActivity) {
        await updateChatHistory(selectedActivity.id, updatedHistory);
      }
      
    } catch (error) {
      console.error('Code execution error:', error);
    } finally {
      setIsExecutingCode(false);
    }
  };

  // Clear code editor
  const clearCodeEditor = () => {
    setCodeEditorContent('');
    setLatestExecution(null);
  };

  // Copy code to clipboard
  const copyCode = () => {
    navigator.clipboard.writeText(codeEditorContent);
  };

  // Get activities for category
  const getActivitiesForCategory = (categoryId: string): DashboardActivity[] => {
    const category = skillCategories.find(cat => cat.id === categoryId);
    if (!category) return [];
    
    return allSkillsActivities.filter(activity => {
      // Use the joined learning_modules data for sub_category
      const subCategory = activity.learning_modules?.sub_category || activity.sub_category;
      return subCategory === category.subCategory;
    });
  };

  // Get category statistics
  const getCategoryStats = (categoryId: string) => {
    const activities = getActivitiesForCategory(categoryId);
    return {
      total: activities.length,
      completed: activities.filter(a => a.progress === 'completed').length,
      started: activities.filter(a => a.progress === 'started').length,
      notStarted: activities.filter(a => a.progress === 'not started').length
    };
  };

  // Check if activity is selectable
  const isActivitySelectable = (activity: DashboardActivity): boolean => {
    return activity.progress !== 'completed';
  };

  // Get progress icon
  const getProgressIcon = (progress: string) => {
    switch (progress) {
      case 'completed':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'started':
        return <Clock className="h-6 w-6 text-yellow-500" />;
      default:
        return <Circle className="h-6 w-6 text-gray-400" />;
    }
  };

  // Get progress color
  const getProgressColor = (progress: string) => {
    switch (progress) {
      case 'completed':
        return 'bg-green-50 border-green-300 text-green-700';
      case 'started':
        return 'bg-yellow-50 border-yellow-300 text-yellow-700';
      default:
        return 'bg-gray-50 border-gray-300 text-gray-700';
    }
  };

  // Handle category change
  const handleCategoryChange = (categoryId: string) => {
    setActiveCategory(categoryId);
  };

  // Create a user-defined Skills learning module + dashboard entry, then launch it
  const handleCreateCustomSkillsActivity = async () => {
    if (!user?.id) return;
    if (!createForm.title.trim())       { alert('Please enter a title.'); return; }
    if (!createForm.description.trim()) { alert('Please describe the problem or topic.'); return; }

    setIsCreatingModule(true);
    try {
      // Build context string — entrepreneurial angle surfaces first so the coach sees it immediately
      const contextParts = [`Problem/Topic: ${createForm.description.trim()}`];
      if (createForm.entrepreneurialContext.trim()) contextParts.push(`Entrepreneurial/Business Angle: ${createForm.entrepreneurialContext.trim()}`);
      if (createForm.location.trim())     contextParts.push(`Location: ${createForm.location.trim()}`);
      if (createForm.constraints.trim())  contextParts.push(`Constraints: ${createForm.constraints.trim()}`);
      if (createForm.stakeholders.trim()) contextParts.push(`Stakeholders: ${createForm.stakeholders.trim()}`);
      const context = contextParts.join('\n');

      const sessionCat = SKILLS_SESSION_CATEGORIES.find(c => c.id === createForm.category);
      const subCategory = sessionCat?.subCategory || 'Vibe Coding';

      // Build facilitator instructions using the rubric for this skill (PUE lens embedded)
      const facilitatorInstructions = buildSkillsFacilitatorPrompt(subCategory, context, personalityBaseline, communicationLevel);

      const newModuleId = crypto.randomUUID();
      const newDashboardId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Resolve city_town for module so it appears in the correct cohort's activity list
      const moduleCityTown = userCity === 'Dayton' ? 'Dayton'
                           : userContinent === 'North America' ? 'Cincinnati'
                           : (userCity === 'Ibiade' ? 'Ibiade' : 'Oloibiri');

      // NA-aware assessment and metrics text
      const isNA = userContinent === 'North America';
      const assessmentInstructions = isNA
        ? `Evaluate the learner's demonstration of ${subCategory} skills based on the rubric dimensions. Score each dimension 0–3 and provide evidence from the conversation. Where the learner connected their skill work to a career goal, certification path, community project, or local application, note this as evidence of advanced real-world application.`
        : `Evaluate the learner's demonstration of ${subCategory} skills based on the rubric dimensions. Score each dimension 0–3 and provide evidence from the conversation. Where the learner connected their skill work to real economic value, costs, benefits, or long-term thinking, note this as evidence of advanced productive application.`;
      const metricsForSuccess = isNA
        ? `Learner demonstrates Proficient (2/3) or Advanced (3/3) on all ${subCategory} rubric dimensions — and connects at least one dimension to a career goal, certification, community need, or entrepreneurial idea relevant to their local context.`
        : `Learner demonstrates Proficient (2/3) or Advanced (3/3) on all ${subCategory} rubric dimensions through their responses — and grounds at least one dimension in a real economic, business, or productive-use outcome.`;

      // 1. Insert learning_module
      const { error: moduleError } = await supabase.from('learning_modules').insert({
        learning_module_id: newModuleId,
        title: createForm.title.trim(),
        description: context,
        category: 'Skills',
        sub_category: subCategory,
        ai_facilitator_instructions: facilitatorInstructions,
        ai_assessment_instructions: assessmentInstructions,
        metrics_for_success: metricsForSuccess,
        outcomes: `Develop ${subCategory} skills applied to: ${createForm.title.trim()}`,
        public: 0,
        grade_level: 4,
        youtube_link: null,
        youtube_description: null,
        created_at: now,
        updated_at: now,
        continent: userContinent || null,
        city_town: moduleCityTown,
        user_id: user.id,
        application: 1,
        learning_or_certification: 'learning',
      });
      if (moduleError) throw moduleError;

      // 2. Insert dashboard entry
      const { error: dashError } = await supabase.from('dashboard').insert({
        id: newDashboardId,
        user_id: user.id,
        learning_module_id: newModuleId,
        activity: createForm.title.trim(),
        title: createForm.title.trim(),
        category_activity: 'Skills Development',
        sub_category: subCategory,
        progress: 'started',
        continent: userContinent || null,
        created_at: now,
        updated_at: now,
      });
      if (dashError) throw dashError;

      // 3. Reset form and reload
      setShowCreateActivity(false);
      setCreateForm({ title: '', description: '', location: '', constraints: '', stakeholders: '', entrepreneurialContext: '', category: 'vibe-coding' });
      await loadDashboardActivities(userCity);

      // 4. Launch the new activity directly
      const newActivity: DashboardActivity = {
        id: newDashboardId,
        title: createForm.title.trim(),
        activity: createForm.title.trim(),
        category_activity: 'Skills Development',
        sub_category: subCategory,
        progress: 'started',
        learning_module_id: newModuleId,
        updated_at: now,
        isPublic: false,
        learning_modules: { category: 'Skills', sub_category: subCategory, learning_or_certification: 'learning', public: 0 },
      };
      await handleActivitySelect(newActivity);
    } catch (err) {
      console.error('[Create Skills Activity] Error:', err);
      alert('Failed to create your activity. Please try again.');
    } finally {
      setIsCreatingModule(false);
    }
  };

  // Get current category info
  const currentCategory = skillCategories.find(cat => cat.id === activeCategory);
  const currentActivities = getActivitiesForCategory(activeCategory);
  const currentStats = getCategoryStats(activeCategory);
// Code Editor Panel Component (for Vibe Coding only)
// Vibe Coding Workflow Component
  // Render evaluation result
  const renderEvaluationResult = () => {
    if (!evaluationResult) return null;

    if ('dimensions' in evaluationResult) {
      const rubricEval = evaluationResult as SkillsRubricEvaluation;
      // Use MINIMUM score instead of average for overall certification score
      const overallScore = Math.min(...rubricEval.dimensions.map(dim => dim.score));

      return (
        <div>
          <EvaluationPanel
            title="Overall Certification Score"
            overallScore={overallScore}
            maxScore={3}
            criteria={rubricEval.dimensions.map((dim, index) => ({
              key: `${dim.dimension}-${index}`,
              label: dim.dimension.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              score: dim.score,
              evidence: dim.evidence,
            }))}
          />

          {/* Improvement Advice Section */}
          {rubricEval.improvementAdvice && (
            <div className="mt-6 border-t border-hair pt-6">
              <h4 className="font-semibold text-ink mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-accent" />
                Improvement Advice
              </h4>
              <div className="bg-surface rounded-lg p-4 text-sm text-body">
                <MarkdownText text={rubricEval.improvementAdvice} />
              </div>
            </div>
          )}
        </div>
      );
    } else {
      const standardEval = evaluationResult as {score: number, evidence: string};
      return (
        <div>
          <div className="mb-4 p-4 bg-surface border border-hair rounded-lg text-center">
            <div className="text-4xl font-bold text-ink mb-2">
              {standardEval.score}%
            </div>
            <div className="text-sm text-muted">
              Overall Score
            </div>
          </div>
          <div className="text-sm text-body bg-paper rounded-lg p-4">
            <strong className="block mb-2 text-ink">Evidence:</strong>
            {standardEval.evidence}
          </div>
        </div>
      );
    }
  };

  // ── UI text tiers based on communication_level ────────────────────────────
  const lvl = communicationLevel ?? 1;

  const uiText = {
    pageTitle:    lvl <= 1 ? 'Skills Practice'                           : 'AI Ready Skills Development',
    pageSubtitle: lvl <= 1 ? 'Pick a skill and practise with your coach' : 'Develop essential skills for success in an AI-powered world',

    activitiesSubtext: lvl <= 1 ? 'Click an activity to begin'           : 'Click on activities to start learning',
    createBtnLabel:    lvl <= 1 ? '+ Make My Own'                        : 'Create Your Own',

    createPageTitle:   lvl <= 1 ? 'Make Your Own Activity'               : 'Create Your Own Activity',
    createPageSub:     lvl <= 1 ? 'Choose a skill and a topic you know'  : 'Design a personalised skills session rooted in your real world',

    createBannerTitle: lvl <= 1 ? '💡 Use something from your real life' : '💡 Ground your skills in real productive value',
    createBannerBody:  lvl <= 1
      ? 'The best topics are things you already know — your farm, your market stall, your school, your community. When you practise a skill using something real, it is much easier to understand and remember.'
      : 'The best skill-building scenarios connect directly to something that creates economic value — starting or strengthening a business, improving agriculture, reducing costs, increasing income, or making a community service more productive. Your AI coach will push you to think about costs, benefits, tradeoffs, and long-term viability.',
    createBannerExamples: lvl <= 1
      ? 'Examples: Problem-solving a food shortage in my village · Critical thinking about which crop to plant · Coding a price calculator for my stall'
      : 'Examples: Problem-solving a supply chain for a market stall · Critical thinking about which crops to plant for best yield · Vibe Coding a price calculator for a solar kiosk · Communication skills for pitching a new product to investors',

    titleLabel:        lvl <= 1 ? 'Name of your activity'                : 'Activity Title',
    titlePlaceholder:  lvl <= 1 ? 'e.g. Solving the water problem in my village'
                                 : 'e.g. Solving the Cold-Storage Problem for My Fish Cooperative',
    categoryLabel:     lvl <= 1 ? 'What skill do you want to practise?'  : 'Skill Category',
    categoryHelp:      lvl <= 1 ? 'Your coach will use this skill to guide and score your session.'
                                 : "The AI coach uses this skill's rubric to guide and score your session — and connects every dimension to your real-world productive context.",
    problemLabel:      lvl <= 1 ? 'What do you want to work on?'         : 'Problem / Topic / Challenge',
    problemPlaceholder: lvl <= 1
      ? 'Tell me the problem or topic. What is happening? e.g. My family\'s farm has too many weeds and we do not know the best way to remove them.'
      : 'Describe the scenario or challenge you want to work through. Be specific — what is broken, inefficient, or costly right now?',

    pueLabel:  lvl <= 1 ? '💼 Could this help you earn or save money? (helps a lot)'
                        : '💼 Entrepreneurial or Productive-Use Angle (strongly recommended)',
    pueHelp:   lvl <= 1 ? 'Can this skill help you make money, save money, or help people? Even a small idea is good.'
                        : 'How could applying this skill create income, save money, improve a business, or strengthen a community? Even a rough idea helps your coach push you toward real economic thinking.',
    puePlaceholder: lvl <= 1
      ? 'e.g. I want to use problem-solving to help my family sell more fish. Or: I want to use coding to count my stock faster.'
      : 'e.g. I want to use problem-solving skills to reduce post-harvest losses for my cooperative so we can sell at better prices. Or: I\'m building a Vibe Coding tool to automate stock tracking for my family\'s shop.',

    locationLabel:       lvl <= 1 ? 'Where are you? (optional)'          : 'Location (optional)',
    locationPlaceholder: lvl <= 1 ? 'e.g. Oloibiri, Bayelsa'             : 'City, school, community, or region — helps the coach give locally relevant examples',
    constraintsLabel:    lvl <= 1 ? 'What makes this hard? (optional)'   : 'Constraints (optional)',
    constraintsPlaceholder: lvl <= 1
      ? 'e.g. No money, no internet, people cannot read well'
      : 'Budget limits, unreliable internet, no electricity, seasonal markets, low literacy in target users, etc.',
    stakeholdersLabel:   lvl <= 1 ? 'Who is affected? (optional)'        : 'Stakeholders (optional)',
    stakeholdersPlaceholder: lvl <= 1
      ? 'e.g. Farmers in my village, my customers, my family'
      : 'Customers, suppliers, community members, competitors, local government — anyone who gains or loses from this solution',

    infoBoxTitle: lvl <= 1 ? 'Your coach will ask you about…'            : 'What your coach will push you to think about',
    infoBoxItems: lvl <= 1 ? [
      { icon: '💰', bold: 'Cost and value',  text: '— Is your idea worth it? What does it cost?' },
      { icon: '⚖️', bold: 'Tradeoffs',       text: '— What do you give up? Who wins and who loses?' },
      { icon: '📈', bold: 'The future',      text: '— Will this still work in 2 years?' },
      { icon: '🏪', bold: 'Business',        text: '— Could someone pay for this?' },
    ] : [
      { icon: '💰', bold: 'Costs vs benefits',        text: '— Is your solution worth it? What does it cost to build or sustain?' },
      { icon: '⚖️', bold: 'Tradeoffs',                text: '— What do you give up by choosing this approach? Who benefits, who bears the risk?' },
      { icon: '📈', bold: 'Long-term thinking',       text: '— Will this still be useful or profitable in 2–5 years?' },
      { icon: '⚡', bold: 'Productive use of resources', text: '— Are time, energy, and money creating real value, or just being consumed?' },
      { icon: '🏪', bold: 'Business viability',       text: '— Could this become a real service, product, or livelihood?' },
    ],

    submitBtn: lvl <= 1 ? 'Start My Activity →'  : 'Create & Start Activity',
    backBtn:   lvl <= 1 ? '← Back'               : '← Back to Activities',
  };

  // ── Create Your Own Activity view ─────────────────────────────────────────
  if (!selectedActivity && showCreateActivity) {
    return (
      <AppLayout>
        <div className="min-h-screen">
          <div className="pl-6 pr-6 py-8 max-w-[50%]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2.5">
                  <PlusCircle className="h-8 w-8 text-accent" />
                  <h1 className="text-3xl font-bold text-ink">{uiText.createPageTitle}</h1>
                </div>
                <p className="text-body text-base">{uiText.createPageSub}</p>
              </div>
              <QuietButton onClick={() => setShowCreateActivity(false)} icon={<ArrowLeft size={16} />}>
                {uiText.backBtn}
              </QuietButton>
            </div>

            {/* PUE / context framing banner */}
            <div className="bg-surface border border-hair border-l-4 border-l-accent rounded-2xl px-6 py-4 mb-6 flex items-start gap-4">
              <span className="text-3xl flex-shrink-0">💡</span>
              <div>
                <p className="font-semibold text-ink text-base mb-1">{uiText.createBannerTitle}</p>
                <p className="text-body text-base leading-relaxed">{uiText.createBannerBody}</p>
                <p className="text-muted text-sm mt-2">{uiText.createBannerExamples}</p>
              </div>
            </div>

            <div className="bg-card border border-hair rounded-2xl shadow-sm p-8 space-y-6">

              {/* Title */}
              <div>
                <label className="block text-base font-semibold text-ink mb-1">{uiText.titleLabel} <span className="text-red-500">*</span></label>
                <input type="text" value={createForm.title}
                  onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={uiText.titlePlaceholder}
                  className="w-full border border-hair rounded-lg px-4 py-2.5 text-base bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
              </div>

              {/* Skill Category */}
              <div>
                <label className="block text-base font-semibold text-ink mb-1">{uiText.categoryLabel} <span className="text-red-500">*</span></label>
                <select value={createForm.category}
                  onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-hair rounded-lg px-4 py-2.5 text-base bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent">
                  {SKILLS_SESSION_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
                <p className="text-sm text-muted mt-1">{uiText.categoryHelp}</p>
              </div>

              {/* Problem / Topic */}
              <div>
                <label className="block text-base font-semibold text-ink mb-1">{uiText.problemLabel} <span className="text-red-500">*</span></label>
                <textarea value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder={uiText.problemPlaceholder}
                  className="w-full border border-hair rounded-lg px-4 py-2.5 text-base bg-paper resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
              </div>

              {/* Entrepreneurial / Business Angle */}
              <div className="bg-surface border border-hair rounded-xl p-4">
                <label className="block text-base font-semibold text-ink mb-1">{uiText.pueLabel}</label>
                <p className="text-sm text-muted mb-2">{uiText.pueHelp}</p>
                <textarea value={createForm.entrepreneurialContext}
                  onChange={e => setCreateForm(f => ({ ...f, entrepreneurialContext: e.target.value }))}
                  rows={3} placeholder={uiText.puePlaceholder}
                  className="w-full border border-hair rounded-lg px-4 py-2.5 text-base resize-none bg-card focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
              </div>

              {/* Location */}
              <div>
                <label className="block text-base font-semibold text-ink mb-1">{uiText.locationLabel}</label>
                <input type="text" value={createForm.location}
                  onChange={e => setCreateForm(f => ({ ...f, location: e.target.value }))}
                  placeholder={uiText.locationPlaceholder}
                  className="w-full border border-hair rounded-lg px-4 py-2.5 text-base bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
              </div>

              {/* Constraints */}
              <div>
                <label className="block text-base font-semibold text-ink mb-1">{uiText.constraintsLabel}</label>
                <textarea value={createForm.constraints}
                  onChange={e => setCreateForm(f => ({ ...f, constraints: e.target.value }))}
                  rows={2} placeholder={uiText.constraintsPlaceholder}
                  className="w-full border border-hair rounded-lg px-4 py-2.5 text-base bg-paper resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
              </div>

              {/* Stakeholders */}
              <div>
                <label className="block text-base font-semibold text-ink mb-1">{uiText.stakeholdersLabel}</label>
                <textarea value={createForm.stakeholders}
                  onChange={e => setCreateForm(f => ({ ...f, stakeholders: e.target.value }))}
                  rows={2} placeholder={uiText.stakeholdersPlaceholder}
                  className="w-full border border-hair rounded-lg px-4 py-2.5 text-base bg-paper resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
              </div>

              {/* Info box */}
              <div className="bg-surface border border-hair rounded-xl p-4 text-base text-body">
                <p className="font-semibold text-ink mb-2">{uiText.infoBoxTitle}</p>
                <ul className="space-y-1 text-sm text-body">
                  {uiText.infoBoxItems.map((item, i) => (
                    <li key={i}>{item.icon} <strong className="text-ink">{item.bold}</strong>{item.text}</li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end pt-2">
                <QuietButton
                  onClick={handleCreateCustomSkillsActivity}
                  disabled={isCreatingModule || !createForm.title.trim() || !createForm.description.trim()}
                  loading={isCreatingModule}
                  icon={<Plus size={16} />}
                  variant="solid"
                  className="px-8 py-3 text-base"
                >
                  {isCreatingModule ? 'Creating…' : uiText.submitBtn}
                </QuietButton>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-accent mx-auto mb-4"></div>
            <div className="text-muted">Loading activities...</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Activity Detail View
  if (selectedActivity) {
    return (
      <AppLayout>
        {showConfetti && <ConfettiAnimation />}

        <div className="py-8 max-w-[67%] mx-auto px-6">
          {/* Header */}
          <div className="mb-6">
            <QuietButton
              onClick={handleBackToOverview}
              icon={<ArrowLeft size={16} />}
              className="mb-4"
            >
              Back to Overview
            </QuietButton>

            <div className="bg-card border border-hair rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-ink mb-2">
                    {moduleTitle}
                  </h1>
                  <p className="text-lg text-body mb-3">
                    {activityDescription || 'Description could not be loaded.'}
                  </p>
                  <div className="flex items-center space-x-2 text-base text-muted">
                    <span>{selectedActivity.category_activity}</span>
                    {selectedActivity.sub_category && (
                      <>
                        <span>•</span>
                        <span>{selectedActivity.sub_category}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className={classNames(
                    'inline-flex items-center px-4 py-2 rounded-full text-base font-medium border',
                    getProgressColor(selectedActivity.progress)
                  )}>
                    {selectedActivity.progress}
                  </span>
                  {selectedActivity.certification_evaluation_score != null && (() => {
                    const normalizedScore = normalizeCertificationScore(selectedActivity.certification_evaluation_score);
                    return (
                      <div className="mt-2">
                        <div className="text-2xl font-bold text-ink">
                          {normalizedScore}/3
                        </div>
                        <div className="text-base text-muted">
                          {normalizedScore === 3 ? 'Advanced' :
                           normalizedScore === 2 ? 'Proficient' :
                           normalizedScore === 1 ? 'Emerging' :
                           'No Evidence'}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Voice settings */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <label className="inline-flex items-center gap-2 rounded-full border border-hair bg-card px-3 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={voiceOutputEnabled}
                onChange={toggleVoiceOutput}
                className="accent-accent w-4 h-4"
              />
              <span className="text-body font-medium">Voice output</span>
            </label>

            {voiceOutputEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-muted">Coach voice:</span>
                <div className="flex rounded-full overflow-hidden border border-hair">
                  <button
                    onClick={() => setVoiceMode('english')}
                    title="British English — Google UK English Female"
                    className={classNames(
                      'px-3 py-1.5 text-xs font-semibold transition-colors',
                      voiceMode === 'english' ? 'bg-accent text-white' : 'bg-card text-body hover:bg-paper'
                    )}
                  >
                    🇬🇧 English
                  </button>
                  <button
                    onClick={() => setVoiceMode('pidgin')}
                    title="Nigerian English / Pidgin voice"
                    className={classNames(
                      'px-3 py-1.5 text-xs font-semibold transition-colors border-l border-hair',
                      voiceMode === 'pidgin' ? 'bg-accent text-white' : 'bg-card text-body hover:bg-paper'
                    )}
                  >
                    🇳🇬 Pidgin
                  </button>
                </div>
                <span className="text-xs text-muted italic">{'Ezinne'}</span>
              </div>
            )}

            {isListening && (
              <span className="text-red-600 text-xs font-medium animate-pulse">● Listening…</span>
            )}
          </div>

          {/* Text fallback when TTS unavailable (e.g. no network voice in Nigeria) */}
          {fallbackText && (
            <div className="mb-4">
              <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
            </div>
          )}

          <ChatSurface
            title="Learning Conversation"
            legend={
              <details className="text-xs text-muted">
                <summary className="cursor-pointer select-none font-medium hover:text-ink">Scores out of 3</summary>
                <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 font-bold">0</span>
                  <span>No Evidence</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300 font-bold ml-2">1</span>
                  <span>Emerging</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 font-bold ml-2">2</span>
                  <span>Proficient ✓</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 font-bold ml-2">3</span>
                  <span>Advanced ✓</span>
                </div>
              </details>
            }
            messages={chatHistory}
            renderAssistant={(content) => (
              <>
                <MarkdownText text={content} onViewEvaluation={openTurnEvaluation} />
                <AIPidginCoachWrapper englishText={content} />
              </>
            )}
            submitting={submitting}
            transcriptRef={chatContainerRef}
            transcriptHeightClassName="h-[32rem]"
            value={userInput}
            onChange={setUserInput}
            onKeyDown={handleKeyDown}
            onSubmit={handleSubmitMessage}
            disabled={submitting}
            notice={
              <div className="mb-3 space-y-2">
                <p className="text-sm text-muted flex items-center gap-1.5">
                  <span>💡</span>
                  <span>Have a question? Just ask it — the AI will answer you directly before continuing.</span>
                </p>
                {(() => {
                  const scores = extractLatestRubricScores(chatHistory);
                  if (scores.length === 0) return null;
                  const allAdvanced = scores.every(s => s === 3);
                  const allProficient = scores.every(s => s >= 2);
                  if (allAdvanced) return (
                    <div className="flex items-start gap-3 rounded-xl border border-hair border-l-4 border-l-green-500 bg-paper px-4 py-3">
                      <span className="text-xl flex-shrink-0">🏆</span>
                      <div>
                        <p className="text-sm font-semibold text-ink">Advanced on all criteria!</p>
                        <p className="text-sm text-body mt-0.5">You've reached the highest level across every criterion. There's one final step — select <strong>Complete session</strong> below to save your results.</p>
                      </div>
                    </div>
                  );
                  if (allProficient) return (
                    <div className="flex items-start gap-3 rounded-xl border border-hair border-l-4 border-l-blue-500 bg-paper px-4 py-3">
                      <span className="text-xl flex-shrink-0">✅</span>
                      <div>
                        <p className="text-sm font-semibold text-ink">Proficient or higher on all criteria</p>
                        <p className="text-sm text-body mt-0.5">Well done — you've met the standard on every criterion. You can keep going to push for Advanced, or select <strong>Complete session</strong> below to save your results now.</p>
                      </div>
                    </div>
                  );
                  return null;
                })()}
              </div>
            }
            composerActions={
              <>
                <QuietButton
                  onClick={toggleVoiceInput}
                  icon={<Mic size={14} />}
                  className={isListening ? 'border-red-300 text-red-600 hover:text-red-700 hover:border-red-400' : undefined}
                >
                  {isListening ? 'Stop' : 'Voice'}
                </QuietButton>
                <QuietButton
                  onClick={handleImproveEnglish}
                  disabled={!userInput.trim() || isImproving}
                  icon={<Wand2 size={14} />}
                  loading={isImproving}
                >
                  Improve my English
                </QuietButton>
              </>
            }
            sessionActions={
              <>
                <QuietButton
                  onClick={handleSaveSession}
                  disabled={chatHistory.length <= 1 || savingSession}
                  icon={<Save size={14} />}
                  loading={savingSession}
                >
                  Evaluate me / Save session
                </QuietButton>
                <QuietButton
                  onClick={handleCompleteSession}
                  disabled={completingSession || chatHistory.length <= 1}
                  icon={<CheckCircle size={14} />}
                  loading={completingSession}
                  variant="solid"
                >
                  Complete session
                </QuietButton>
              </>
            }
          />

        {/* Complete Session Modal */}
        {showCompleteSessionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
            <div className="bg-card rounded-2xl border border-hair shadow-lg w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-hair flex items-center justify-between">
                <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-accent" />
                  Complete Your Session
                </h3>
                <button
                  onClick={() => setShowCompleteSessionModal(false)}
                  className="text-muted hover:text-ink transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-body leading-relaxed">
                  Before we save your results, take a moment to reflect on what you've worked through in this session.
                </p>
                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    What did you learn in this session? <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-muted mb-2">
                    Be as specific and detailed as you can — what concepts clicked for you? What was hard? What would you do differently next time?
                  </p>
                  <textarea
                    value={sessionReflectionInput}
                    onChange={e => setSessionReflectionInput(e.target.value)}
                    rows={6}
                    placeholder="e.g. I learned how to break down a complex problem into smaller steps and apply the skill of critical thinking to each one. The hardest part was identifying assumptions I hadn't noticed before. Next time I'd start by listing what I don't yet know..."
                    className="w-full border border-hair rounded-xl px-4 py-3 text-sm bg-paper resize-none leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                    autoFocus
                  />
                  <p className="text-xs text-muted mt-1 text-right">
                    {sessionReflectionInput.length} characters
                    {sessionReflectionInput.length < 80 && sessionReflectionInput.length > 0 && (
                      <span className="text-amber-700 ml-2">— a bit more detail will help your score</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="px-6 pb-5 flex gap-3 justify-end">
                <QuietButton onClick={() => setShowCompleteSessionModal(false)}>
                  Cancel
                </QuietButton>
                <QuietButton
                  onClick={() => handleCompleteSessionSubmit()}
                  disabled={sessionReflectionInput.trim().length < 20}
                  icon={<Star size={15} />}
                  variant="solid"
                >
                  Save &amp; Complete
                </QuietButton>
              </div>
            </div>
          </div>
        )}

        {/* Per-turn Rubric Evaluation Popup */}
        {turnEvaluationText && (
          <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl border border-hair shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                  📊 Evaluation
                </h3>
                <button onClick={closeTurnEvaluation} className="text-muted hover:text-ink">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <MarkdownText text={turnEvaluationText} rubricMode="full" />
              <div className="mt-4 flex justify-end">
                <QuietButton onClick={closeTurnEvaluation}>
                  Close
                </QuietButton>
              </div>
            </div>
          </div>
        )}

        {/* Evaluation Modal */}
        {showEvaluationModal && evaluationResult && (
          <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl border border-hair shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-ink mb-4">
                  Evaluation Results
                </h3>

                {renderEvaluationResult()}

                <div className="mt-6 flex justify-end space-x-3">
                  <QuietButton
                    onClick={() => {
                      setShowEvaluationModal(false);
                      if ('dimensions' in evaluationResult) {
                        const rubricEval = evaluationResult as SkillsRubricEvaluation;
                        const avgScore = rubricEval.dimensions.reduce((sum, dim) => sum + dim.score, 0) / rubricEval.dimensions.length;
                        const percentage = Math.round((avgScore / 3) * 100);
                        // Only celebrate and auto-return to overview if 100%
                        if (percentage === 100) {
                          handleCelebration();
                          setTimeout(() => handleBackToOverview(), 2000);
                        }
                      }
                    }}
                    variant="solid"
                  >
                    Continue
                  </QuietButton>
                </div>
              </div>
            </div>
          </div>
        )}
          </div>
      </AppLayout>
    );
  }

  // Overview - Activity List
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold text-ink mb-1">
                {uiText.pageTitle}
              </h1>
              <p className="text-lg text-body">
                {uiText.pageSubtitle}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <QuietButton
                onClick={refreshDashboard}
                icon={<RefreshCw size={14} />}
                loading={refreshing}
                className="text-xs px-3 py-1.5"
              >
                Refresh
              </QuietButton>
              {/* Tutorial link */}
              <a
                href="https://youtu.be/4arYya6dZWM"
                target="_blank"
                rel="noopener noreferrer"
                title="Watch video tutorial"
                className="flex items-center gap-1.5 border border-hair bg-card text-body hover:text-accent hover:border-accent/40 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                Tutorial
              </a>
              <Link
                to="/tutorials/skill-development-start"
                title="Read the written guide"
                className="flex items-center gap-1.5 border border-hair bg-card text-body hover:text-accent hover:border-accent/40 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors shrink-0">
                <BookOpen size={13} /> Guide
              </Link>
            </div>
          </div>

          {/* Category Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {skillCategories.map((category) => {
              const stats = getCategoryStats(category.id);
              const active = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={classNames(
                    'flex flex-col items-start space-y-3 p-6 rounded-xl border transition-colors text-left',
                    active
                      ? 'bg-surface border-accent/40 shadow-sm'
                      : 'bg-card border-hair hover:border-accent/30'
                  )}
                >
                  <div className={classNames(
                    'p-2 rounded-lg',
                    active ? 'bg-accent/10' : 'bg-paper'
                  )}>
                    <div className="text-accent">
                      {category.icon}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-ink mb-1">
                      {category.title}
                    </h3>
                    <p className="text-sm text-body mb-2">
                      {category.description}
                    </p>
                    <div className="flex items-center space-x-2 text-sm text-muted">
                      <span>{stats.total} activities</span>
                      {stats.completed > 0 && (
                        <span>• {stats.completed} completed</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Category Detail */}
          {currentCategory && (
            <div className="bg-card border border-hair rounded-2xl shadow-sm p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-surface rounded-lg text-accent">
                    {currentCategory.icon}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-ink">
                      {currentCategory.title}
                    </h2>
                    <p className="text-base text-body">{currentCategory.description}</p>
                    <p className="text-sm text-muted mt-1">
                      Sub-category: {currentCategory.subCategory}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-paper rounded-lg border border-hair">
                  <div className="text-3xl font-bold text-ink">{currentStats.total}</div>
                  <div className="text-base text-muted">Total Activities</div>
                </div>
                <div className="text-center p-4 bg-paper rounded-lg border border-hair">
                  <div className="text-3xl font-bold text-ink">{currentStats.completed}</div>
                  <div className="text-base text-muted">Completed</div>
                </div>
                <div className="text-center p-4 bg-paper rounded-lg border border-hair">
                  <div className="text-3xl font-bold text-ink">{currentStats.started}</div>
                  <div className="text-base text-muted">In Progress</div>
                </div>
                <div className="text-center p-4 bg-paper rounded-lg border border-hair">
                  <div className="text-3xl font-bold text-ink">{currentStats.notStarted}</div>
                  <div className="text-base text-muted">Not Started</div>
                </div>
              </div>

              {/* Progress Bar */}
              {currentStats.total > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between text-sm text-muted mb-2">
                    <span>Progress in {currentCategory.title}</span>
                    <span>{Math.round((currentStats.completed / currentStats.total) * 100)}% Complete</span>
                  </div>
                  <div className="w-full bg-hair rounded-full h-2">
                    <div
                      className="bg-accent h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(currentStats.completed / currentStats.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Activities List */}
          <div className="bg-card border border-hair rounded-2xl shadow-sm overflow-hidden">
            {/* Panel header with Create Your Own button */}
            <div className="px-6 py-4 border-b border-hair bg-surface flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  {lvl <= 1
                    ? `${uiText.activitiesSubtext.replace('Click an activity to begin', 'Learning Activities')} — ${currentCategory?.title}`
                    : `Learning Activities - ${currentCategory?.title}`}
                </h3>
                <p className="text-base text-body mt-1">
                  {uiText.activitiesSubtext}
                  {lvl > 1 && <> • Activities in "{currentCategory?.subCategory}" skill area</>}
                </p>
              </div>
              <QuietButton
                onClick={() => {
                  setCreateForm(f => ({ ...f, category: activeCategory }));
                  setShowCreateActivity(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                icon={<Plus size={16} />}
                variant="solid"
                className="whitespace-nowrap ml-4"
              >
                {uiText.createBtnLabel}
              </QuietButton>
            </div>

            {(() => {
              const myActivities     = currentActivities.filter(a => a.isPublic === false);
              const otherActivities  = currentActivities.filter(a => a.isPublic !== false);

              const renderRow = (activity: DashboardActivity) => {
                // Safely guard against undefined activity or missing properties
                if (!activity?.id) return null;
                
                // Collect per-dimension scores for display
                const isAdvancedComplete = (activity?.progress === 'completed' && activity?.certification_evaluation_score === 3) || false;
                const subCat = activity?.sub_category || '';
                const colMap = RUBRIC_COLUMN_MAP[subCat] || {};
                const dimensions = RUBRIC_DEFINITIONS[subCat] || [];

                const dimScores = dimensions
                  .map(dim => {
                    const dimKey = dim.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                    const cols = colMap[dimKey];
                    const score = cols ? (activity?.[cols.score] ?? null) : null;
                    return score != null ? { label: dim.replace(/_/g, ' '), score } : null;
                  })
                  .filter(Boolean) as { label: string; score: number }[];

                const hasScores = (activity?.progress !== 'not started') &&
                  (activity?.certification_evaluation_score != null || dimScores.length > 0);

                return (
                  <div
                    key={activity.id}
                    className={classNames(
                      'relative p-6 transition-colors',
                      isAdvancedComplete
                        ? 'bg-green-50/60 border-l-4 border-l-green-400 text-green-900 pointer-events-none opacity-60 cursor-not-allowed'
                        : activity.progress === 'completed'
                        ? 'bg-paper opacity-60 cursor-not-allowed'
                        : isActivitySelectable(activity)
                        ? 'hover:bg-surface cursor-pointer'
                        : 'cursor-default'
                    )}
                    onClick={() => isActivitySelectable(activity) && handleActivitySelect(activity)}
                  >
                    {/* ── Title row ── */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">{getProgressIcon(activity.progress)}</div>
                        <div className="flex-1 min-w-0">
                          <h4 className={classNames('text-lg font-medium',
                            isAdvancedComplete
                              ? 'text-green-900'
                              : activity.progress === 'completed'
                              ? 'text-muted line-through'
                              : 'text-ink')}>
                            {activity.title}
                            {isActivitySelectable(activity) && (
                              <span className="ml-2 text-sm text-accent">(Click to start)</span>
                            )}
                            {isAdvancedComplete ? (
                              <span className="ml-2 text-sm font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
                                Completed. Go to the next activity.
                              </span>
                            ) : activity.progress === 'completed' ? (
                              <span className="ml-2 text-sm text-muted no-underline font-normal">✓ Completed</span>
                            ) : null}
                          </h4>
                          <div className="flex items-center space-x-2 text-base text-muted mt-1">
                            <span>{activity.category_activity}</span>
                            {activity.sub_category && (<><span>•</span><span>{activity.sub_category}</span></>)}
                          </div>
                        </div>
                      </div>
                      {/* Progress badge */}
                      <span className={classNames(
                        'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0',
                        getProgressColor(activity.progress))}>
                        {activity.progress}
                      </span>
                    </div>

                    {/* ── Score strip (only when data present) ── */}
                    {hasScores && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {/* Overall score badge */}
                        {activity.certification_evaluation_score != null && (() => {
                          const normalizedScore = normalizeCertificationScore(activity.certification_evaluation_score);
                          return (
                            <span className={classNames(
                              'px-2.5 py-1 rounded-full text-xs font-bold border',
                              normalizedScore === 3
                                ? 'bg-green-100 text-green-800 border-green-300'
                                : normalizedScore === 2
                                ? 'bg-blue-100 text-blue-800 border-blue-300'
                                : normalizedScore === 1
                                ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                : 'bg-red-100 text-red-800 border-red-300'
                            )}>
                              Overall: {normalizedScore}/3 - {
                                normalizedScore === 3 ? 'Advanced' :
                                normalizedScore === 2 ? 'Proficient' :
                                normalizedScore === 1 ? 'Emerging' :
                                'No Evidence'
                              }
                            </span>
                          );
                        })()}

                        {/* Per-dimension score pills */}
                        {dimScores.map(({ label, score }) => (
                          <span
                            key={label}
                            className={classNames('px-2 py-0.5 rounded-full text-xs font-medium border capitalize', rubricScoreColor(score))}
                            title={`${label}: ${score}/3 — ${rubricScoreLabel(score)}`}
                          >
                            {label}: {score}/3
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ── Evidence summary ── */}
                    {activity.certification_evaluation_evidence && (
                      <div className="mt-2 text-xs text-muted bg-paper rounded px-3 py-1.5 line-clamp-2">
                        <strong className="text-body">Evidence:</strong>{' '}
                        {activity.certification_evaluation_evidence}
                      </div>
                    )}

                    <div className="mt-2 flex items-center text-xs text-muted">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>Updated {new Date(activity.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              };

              if (currentActivities.length === 0) {
                return (
                  <div className="p-6 text-center">
                    <Target className="h-10 w-10 text-muted mx-auto mb-4" />
                    <p className="text-body mb-2 font-semibold">No activities found for {currentCategory?.title}</p>
                    <div className="text-sm text-muted mb-4 max-w-md mx-auto">
                      <p className="mb-2">Looking for Skills activities with sub-category: <strong>"{currentCategory?.subCategory}"</strong></p>
                    </div>
                    <QuietButton onClick={refreshDashboard} icon={<RefreshCw size={16} />} loading={refreshing}>
                      Refresh Activities
                    </QuietButton>
                  </div>
                );
              }

              return (
                <>
                  {/* ── Your Created Learning Modules ───────────────── */}
                  {myActivities.length > 0 && (
                    <div>
                      <div className="px-6 py-3 bg-surface border-b border-hair">
                        <h4 className="text-sm font-bold text-ink uppercase tracking-wide">
                          Your Created Learning Modules
                        </h4>
                      </div>
                      <div className="divide-y divide-hair">
                        {myActivities.map(renderRow)}
                      </div>
                    </div>
                  )}

                  {/* ── Other Learning Modules ──────────────────────── */}
                  {otherActivities.length > 0 && (
                    <div>
                      <div className="px-6 py-3 bg-surface border-b border-hair flex items-baseline gap-2">
                        <h4 className="text-sm font-bold text-ink uppercase tracking-wide">
                          Other Learning Modules
                        </h4>
                        <span className="text-xs text-muted italic">…good for practice</span>
                      </div>
                      <div className="divide-y divide-hair">
                        {otherActivities.map(renderRow)}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AIReadySkillsPage;