// AILearningPage.tsx - Dashboard-based AI learning with interactive activities
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { chatText, chatJSON, ChatMessage as ClientChatMessage } from '../lib/chatClient';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
import SpellCheckTextarea from '../components/ui/SpellCheckTextarea';
import {
  Brain,
  Wand2,
  Shield,
  Edit,
  Eye,
  BookOpen,
  CheckCircle,
  Clock,
  Circle,
  Target,
  RefreshCw,
  ArrowLeft,
  Mic,
  Send,
  Bot,
  User,
  Star,
  Save,
  Plus,
  PlusCircle,
  X
} from 'lucide-react';
import classNames from 'classnames';
import { useAuth } from '../hooks/useAuth';
import { useVoice } from '../hooks/useVoice';
import { PidginTooltip } from '../components/PidginTooltip';
import { AIPidginCoachWrapper } from '../components/AIPidginCoachWrapper';
import { VoiceFallback } from '../components/VoiceFallback';
// Helper function to check and trigger baseline assessment
// Helper function to check and trigger baseline assessment
async function checkAndTriggerBaseline(userId: string, userToken: string): Promise<void> {
  try {
    // Use the existing supabase instance, not createClient
    const { data: baseline } = await supabase
      .from('user_personality_baseline')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (baseline) return;

    const { count } = await supabase
      .from('dashboard')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count && count >= 10) {
      fetch('/api/assess-baseline', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => {});
    }
  } catch (error) {
    // Silent fail - baseline is optional
  }
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

const rubricScoreColor = (s: number) =>
  s === 3 ? 'bg-green-100 text-green-800 border-green-300' :
  s === 2 ? 'bg-blue-100 text-blue-800 border-blue-300' :
  s === 1 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
            'bg-red-100 text-red-800 border-red-300';

const rubricScoreLabel = (s: number) =>
  ['No Evidence', 'Emerging', 'Proficient ✓', 'Advanced ✓'][s] ?? '?';

// UNESCO competency scores are 1–4 (not 0–3)
const unescoScoreColor = (s: number) =>
  s === 4 ? 'bg-green-100 text-green-800 border-green-300' :
  s === 3 ? 'bg-blue-100 text-blue-800 border-blue-300' :
  s === 2 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
            'bg-red-100 text-red-800 border-red-300';

const unescoScoreLabel = (s: number) =>
  s === 4 ? 'Advanced' :
  s === 3 ? 'Competent' :
  s === 2 ? 'Developing' :
  s === 1 ? 'Emerging' : '?';

const TUTOR_BEHAVIOR_RULES = `
The AI must provide large, comprehensive answers capable of thoroughly addressing any user question.
The AI should act like a human tutor, responding in depth and following up with several highly relevant questions tailored to the specific activity.`;

function certificationScoreToOverallLevel(score: number | null | undefined): 'Emerging' | 'Proficient' | 'Advanced' | null {
  if (score == null) return null;
  let normalized = score;
  if (normalized > 3) {
    if (normalized <= 25) normalized = 0;
    else if (normalized <= 50) normalized = 1;
    else if (normalized <= 75) normalized = 2;
    else normalized = 3;
  }
  if (normalized === 3) return 'Advanced';
  if (normalized === 2) return 'Proficient';
  if (normalized === 1) return 'Emerging';
  return null;
}

const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const renderParagraph = (paragraph: string, pIndex: number) => {
    const lines = paragraph.split('\n').filter(l => l.trim());
    if (!lines.length) return null;

    // ── Rubric block (starts with "Rubric ...") ───────────────────────────
    if (/^rubric\b/i.test(lines[0].trim())) {
      const headerTitle = lines[0]
        .replace(/^rubric\s*(critique|block)?\s*/i, '')
        .replace(/^[(\[]/, '').replace(/[)\]]$/, '').trim() || 'Rubric Critique';

      return (
        <div key={pIndex} className="mt-3 rounded-xl overflow-hidden border border-indigo-200 bg-indigo-50 text-xs">
          {/* Header row */}
          <div className="px-3 py-2 bg-indigo-100 border-b border-indigo-200 flex items-center justify-between flex-wrap gap-1">
            <span className="font-bold text-indigo-700 uppercase tracking-wide">📊 {headerTitle}</span>
            <span className="text-indigo-500">
              0 No Evidence · 1 Emerging · <strong>2 Proficient ✓</strong> · <strong>3 Advanced ✓</strong>
            </span>
          </div>
          {/* Criterion lines */}
          <div className="px-3 py-2 space-y-2.5">
            {lines.slice(1).map((line, li) => {
              // Match: "Label: score — Evidence: ... — Improve/What to improve: ..."
              const sm = line.match(
                /^(.+?):\s*([0-3])\s*[—–-]+\s*Evidence:\s*(.+?)\s*[—–-]+\s*(?:What to improve|To improve|Improve):\s*(.+)$/i
              );
              if (sm) {
                const score = parseInt(sm[2]);
                return (
                  <div key={li} className="border-l-2 border-indigo-300 pl-2 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-gray-800 capitalize">{sm[1].replace(/_/g, ' ').trim()}</span>
                      <span className={`px-1.5 py-0.5 rounded-full border font-bold ${rubricScoreColor(score)}`}>
                        {score}/3 · {rubricScoreLabel(score)}
                      </span>
                    </div>
                    <p className="text-gray-600"><span className="font-medium text-gray-700">Evidence:</span> {sm[3]}</p>
                    <p className="text-amber-700"><span className="font-medium">Improve:</span> {sm[4]}</p>
                  </div>
                );
              }
              // "Biggest improvement lever:", "Weakest area:", "Next question..."
              const km = line.match(/^(Biggest improvement lever|Weakest area|Next question[^:]*):\s*(.+)$/i);
              if (km) {
                const isQ = /next question/i.test(km[1]);
                return (
                  <div key={li} className={`pt-2 mt-1 border-t border-indigo-100 ${isQ ? 'text-indigo-800 font-semibold' : 'text-gray-700'}`}>
                    <span className="font-bold">{km[1]}:</span> {km[2]}
                  </div>
                );
              }
              return <p key={li} className="text-gray-600">{parseInline(line, `${pIndex}-${li}`)}</p>;
            })}
          </div>
        </div>
      );
    }

    // ── Heading ───────────────────────────────────────────────────────────
    const hm = lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (lines.length === 1 && hm) {
      const cls = hm[1].length === 1 ? 'text-base font-bold text-gray-900 mt-3'
                : hm[1].length === 2 ? 'text-sm font-bold text-gray-800 mt-2'
                : 'text-sm font-semibold text-gray-700 mt-2';
      return <div key={pIndex} className={cls}>{parseInline(hm[2], `h-${pIndex}`)}</div>;
    }

    // ── Bullet list ───────────────────────────────────────────────────────
    if (lines.every(l => /^[-*]\s/.test(l))) {
      return (
        <ul key={pIndex} className="mt-1.5 space-y-1">
          {lines.map((line, li) => (
            <li key={li} className="flex items-start gap-1.5 text-sm">
              <span className="text-indigo-400 mt-0.5 flex-shrink-0 font-bold">•</span>
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
              <li key={li} className="flex items-start gap-1.5 text-sm">
                <span className="text-indigo-600 font-semibold flex-shrink-0 min-w-[1.1rem]">{nm?.[1]}.</span>
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
          <div key={li} className="text-sm">{parseInline(line, `${pIndex}-${li}`)}</div>
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
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
  
  return (
    <>
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
        .confetti-piece {
          animation: confetti-fall 4s linear forwards;
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 opacity-80 confetti-piece"
            style={{
              backgroundColor: colors[i % colors.length],
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>
    </>
  );
};


// Background with the same color filtering + transparency style as HomePage,
// plus cursor-driven ripple distortion "spotlight".
const DistortedBackground: React.FC<{ imageUrl: string }> = ({ imageUrl }) => {
  const [mousePixels, setMousePixels] = useState({ x: 0, y: 0 });
  const [isMouseMoving, setIsMouseMoving] = useState(false);
  const mouseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // AppLayout offsets (top nav + left sidebar)
      const sidebarOffset = 256; // left-64
      const topOffset = 64; // top-16

      const x = Math.max(0, e.clientX - sidebarOffset);
      const y = Math.max(0, e.clientY - topOffset);

      setMousePixels({ x, y });

      setIsMouseMoving(true);
      if (mouseTimeoutRef.current) clearTimeout(mouseTimeoutRef.current);
      mouseTimeoutRef.current = setTimeout(() => setIsMouseMoving(false), 120);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleMouseMove);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        if (mouseTimeoutRef.current) clearTimeout(mouseTimeoutRef.current);
      };
    }
  }, []);

  return (
    <>
      {/* SVG filter definition (kept tiny + hidden) */}
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="ai-learning-ripple-distortion" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.01"
              numOctaves="3"
              seed="2"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="60"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>

      {/* Normal background */}
      <div
        className="fixed top-14 left-0 md:left-64 right-0 bottom-0"
        style={{
          backgroundImage: `url('${imageUrl}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: 0,
        }}
      >
        {/* Soft, hopeful overlay — matches AIProficiencyPage's aesthetic */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 via-pink-400/25 to-blue-400/30" />
        <div className="absolute inset-0 bg-white/10" />
      </div>

      {/* Distorted layer - only visible during mouse movement */}
      {isMouseMoving && (
        <div
          className="fixed top-14 left-0 md:left-64 right-0 bottom-0 pointer-events-none transition-opacity duration-100"
          style={{
            backgroundImage: `url('${imageUrl}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            zIndex: 1,
            filter: 'url(#ai-learning-ripple-distortion)',
            WebkitMaskImage: `radial-gradient(circle 150px at ${mousePixels.x}px ${mousePixels.y}px, black 0%, black 50%, transparent 100%)`,
            maskImage: `radial-gradient(circle 150px at ${mousePixels.x}px ${mousePixels.y}px, black 0%, black 50%, transparent 100%)`,
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 via-pink-400/25 to-blue-400/30" />
          <div className="absolute inset-0 bg-white/10" />
        </div>
      )}
    </>
  );
};


interface DashboardActivity {
  id: string;
  activity: string;
  title: string;
  category_activity: string;
  sub_category?: string;
  progress: 'not started' | 'started' | 'completed';
  certification_evaluation_score?: number | null;
  certification_evaluation_evidence?: string | null;
  // UNESCO competency scores (1–4 scale) — column name = semantic meaning:
  certification_evaluation_UNESCO_1_score?: number | null;      // Understanding of AI
  certification_evaluation_UNESCO_1_evidence?: string | null;
  certification_evaluation_UNESCO_2_score?: number | null;      // Human-Centred Mindset
  certification_evaluation_UNESCO_2_evidence?: string | null;
  certification_evaluation_UNESCO_3_score?: number | null;      // Application of AI Tools
  certification_evaluation_UNESCO_3_evidence?: string | null;
  certification_evaluation_UNESCO_4_score?: number | null;      // Critical Evaluation
  certification_evaluation_UNESCO_4_evidence?: string | null;
  learning_module_id?: string;
  chat_history?: string;
  updated_at: string;
  isPublic?: boolean;   // false = user-created private, true = shared/canned
  [key: string]: any;
}

interface DashboardEntryResult {
  id: string;
  chat_history: string;
  progress: 'not started' | 'started' | 'completed';
  isMock?: boolean;
}

const isValidUuid = (value?: string): boolean => {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

const aiLearningCategories = [
  
  
  {
    id: 'understanding-ai',
    title: 'Understanding AI',
    subCategory: 'Understanding AI: Core Concepts & Capabilities',
    icon: <Brain className="h-6 w-6" />,
    description: 'Learn fundamental AI concepts and capabilities'
  },
  {
    id: 'prompt-engineering',
    title: 'Prompt Engineering',
    subCategory: 'Prompt Engineering: Effective AI Communication',
    icon: <Edit className="h-6 w-6" />,
    description: 'Master effective communication with AI tools'
  },
  {
    id: 'evaluating-outputs',
    title: 'Evaluating AI Outputs',
    subCategory: 'Evaluating AI Outputs: Critical Analysis',
    icon: <Eye className="h-6 w-6" />,
    description: 'Critically analyze AI-generated content'
  },
  {
    id: 'ai-ethics',
    title: 'AI Ethics & Responsible Use',
    subCategory: 'AI Ethics & Responsible Use',
    icon: <Shield className="h-6 w-6" />,
    description: 'Understand ethical implications of AI'
  },
  {
    id: 'applications',
    title: 'AI Applications',
    subCategory: 'Applications',
    icon: <BookOpen className="h-6 w-6" />,
    description: 'Apply AI to solve real-world problems'
  },
];

const AI_CATEGORY_METADATA: Record<string, { label: string; focus: string; outputHint: string }> = {
  'Understanding AI: Core Concepts & Capabilities': {
    label: 'understanding-ai',
    focus: 'core AI mechanisms, limits, and terminology',
    outputHint: 'explain concepts using one practical scenario',
  },
  'Prompt Engineering: Effective AI Communication': {
    label: 'prompt-engineering',
    focus: 'prompt structure, constraints, and iterative refinement',
    outputHint: 'submit baseline and revised prompts with comparison notes',
  },
  'Evaluating AI Outputs: Critical Analysis': {
    label: 'evaluating-ai-outputs',
    focus: 'verification workflows, bias detection, and trust decisions',
    outputHint: 'validate outputs against two independent checks',
  },
  'AI Ethics & Responsible Use': {
    label: 'ai-ethics-responsible-use',
    focus: 'privacy, fairness, and mitigation planning',
    outputHint: 'identify one ethical risk and one concrete mitigation',
  },
  Applications: {
    label: 'ai-applications',
    focus: 'real-world implementation and measurable outcomes',
    outputHint: 'define a success metric and rollout plan',
  },
};

// Helper: generate sophisticated system prompt for AI Learning activities
function buildAILearningSystemPrompt(title: string, subCategory: string, style: string): string {
  const styleInstructions: Record<string, string> = {
    'simulation/troubleshooting': 'You will simulate a broken or failing system environment. Present the learner with realistic error logs, performance metrics, or system alerts. Ask them to diagnose the issue step-by-step. Provide hints when they are stuck, but do not reveal the answer outright.',
    'case study/analysis': 'You will present a real-world case scenario or decision point. Guide the learner to critically analyze evidence, identify assumptions, and develop reasoned judgments. Ask probing questions about tradeoffs, consequences, and alternatives.',
    'interactive roleplay': 'You will adopt a specific professional role (investor, engineer, community leader, trader, etc.). Respond authentically to the learner as that person would, creating a realistic negotiation, pitch, or consultation experience.',
    'design hackathon': 'You will facilitate rapid ideation and prototyping. Challenge the learner to brainstorm multiple approaches, evaluate constraints, and iterate quickly. Encourage creative thinking while grounding solutions in technical feasibility.',
  };

  return `You are a brilliant, world-class senior technical professor specializing in African sustainable development, AI systems integration, and Nigerian solar infrastructure engineering.

YOUR TEACHING STYLE:
- Highly interactive, supportive, yet rigorous. Do not give away answers instantly.
- Ask probing questions that guide discovery. Provide rich local context (Nigerian grid configurations, market environments, technical constraints).
- Break complex topics into digestible steps. Actively listen to student questions and give profound, technically precise explanations.
- Guide learners organically toward mastering the lesson through dialogue, not lecture.
- When a student asks a direct question, answer it fully and clearly before continuing the lesson flow.
- Ground all guidance in real productive and economic context.

ACTIVITY CONTEXT:
Topic: ${subCategory}
Lesson: ${title}
Learning Style: ${style}

STYLE-SPECIFIC BEHAVIOR:
${styleInstructions[style.toLowerCase()] || 'Guide the learner through thoughtful questioning and iterative exploration of this topic.'}

EXPECTATIONS:
- Provide step-by-step guidance as the student progresses through this lesson.
- After each student response, offer specific feedback, ask clarifying questions, and suggest next steps.
- Reference Nigerian infrastructure, energy systems, market dynamics, or local economic realities where relevant.
- Encourage the student to think independently, test assumptions, and build on their own reasoning.
- Never skip steps or assume prior knowledge. Always check for understanding.
${TUTOR_BEHAVIOR_RULES}

Start by warmly welcoming the student now that they have acknowledged they are ready to begin.`;
}

function buildAILearningMockActivities(userId: string): DashboardActivity[] {
  const now = new Date().toISOString();
  const learningStyles = [
    'Simulation/Troubleshooting',
    'Case Study/Analysis',
    'Interactive Roleplay',
    'Design Hackathon',
  ];

  const categoryDefinitions: Array<{
    subCategory: string;
    titles: string[];
    themeHint: string;
  }> = [
    {
      subCategory: 'Understanding AI: Core Concepts & Capabilities',
      themeHint: 'explore AI mechanisms, limits, and data use in Nigerian solar and market systems',
      titles: [
        'Evaluating Solar Inverter Data via AI Logs',
        'Optimizing Mini-Grids in Ibadan with Predictive Models',
        'AI-Powered Fault Detection in Residential Solar Arrays',
        'Computer Vision for Monitoring Dust on Northern PV Panels',
        'Predicting Harmattan Dust Impact on Solar Efficiency',
        'Understanding Battery Degradation Patterns with Nigeria Heat Profiles',
        'Using AI to Forecast NEPA Grid Drops in Lagos',
        'Interpreting Solar Charge Controller Alerts with Expert Systems',
        'Modeling Solar Irradiance for Kano and Abuja Microgrids',
        'Teaching an AI to Recognize Faulty PV Strings',
        'Assessing Local Energy Needs for a Solar Cold Hub',
        'Explaining AI Confidence Levels in Load Predictions',
        'Linking Sensor Data to Solar Performance in Rural Farms',
        'Diagnosing DC/AC Inverter Alarms with Machine Learning',
        'Comparing Rule-Based vs Data-Driven Solar Fault Detection',
        'Translating Solar System Telemetry into Actionable Insights',
        'Spotting Anomalies in Solar Irrigation Pump Data',
        'Tracking Panel Output Loss from Dust and Heat',
        'Understanding AI Recommendations for Grid-Connected Solar',
        'Mapping User Behavior to Solar Charging Demand',
        'Evaluating Predictive Maintenance on Hybrid Systems',
        'Assessing Sensor Trustworthiness in Remote PV Sites',
        'Explaining How AI Learns from Energy Consumption Patterns',
        'Comparing Smart Meter Data with Field Inspections',
        'Investigating Why a Solar Battery Bank Won’t Hold Charge',
        'Analyzing AI Alerts During a Lagos Brownout',
        'Reviewing Prediction Errors for a Community Microgrid',
        'Understanding AI Decision Boundaries in Fault Detection',
        'Observing Seasonal Changes in Solar Yield with Machine Learning',
        'Exploring AI Models for Solar Irrigation Timing',
        'Reading Grid Stability Predictions for Residential Estates',
        'Assessing False Positives in Solar Alarm Systems',
        'Interpreting AI Feedback from a Solar Service App',
        'Explaining Data Bias in Solar Panel Performance Logs',
        'Testing AI Assumptions in a Kano Solar Marketplace',
        'Understanding AI-Driven Energy Efficiency Ratings',
        'Explaining How AI Uses Weather and Load Data Together',
        'Tracking Power Quality Issues with Machine Learning',
        'Diagnosing Inverter Overheating Through Predictive Signals',
        'Exploring How AI Groups Similar Solar Sites',
        'Reviewing a Smart Grid Model for Urban Energy Use',
        'Understanding AI Alerts for Battery Temperature Changes',
        'Comparing Human and AI Solar Fault Triage Decisions',
        'Explaining Why AI Might Miss a Panel Wiring Fault',
        'Investigating AI Accuracy on Local Energy Data',
        'Connecting Solar Site Details to AI Output Quality',
      ],
    },
    {
      subCategory: 'Prompt Engineering: Effective AI Communication',
      themeHint: 'craft effective AI prompts for solar systems, outage predictions, and marketplace tools',
      titles: [
        'AI Prompt Lab for Solar Microgrid Status Reports in Lagos',
        'Refining Commands for NEPA Outage Predictions',
        'Writing Prompts for Battery Management Alerts',
        'Clarifying Instructions for Agrivoltaics Irrigation Models',
        'Tuning a Chatbot for Solar Installer Troubleshooting',
        'Constructing Prompts for Local Market Pricing Simulations',
        'Designing Prompts for Dust Impact Forecasts on PV Panels',
        'Iterating Prompts for Smart Load Balancing Recommendations',
      ],
    },
    {
      subCategory: 'Evaluating AI Outputs: Critical Analysis',
      themeHint: 'judge and improve AI recommendations in energy and gig economies',
      titles: [
        'Assessing AI Recommendations for Kano Solar Water Pumps',
        'Validating Smart Load Insights for Lagos Residential Users',
        'Checking AI Pricing Advice for Yaba Tech Vendors',
        'Reviewing AI Fault Diagnostics for Battery Banks',
        'Evaluating Solar Irrigation Schedules Suggested by AI',
        'Testing Model Outputs for Northern Cold Hub Temperature Control',
        'Comparing AI Predictions to Field Measurements in a Farm',
        'Assessing Output Quality from an Energy Demand Forecast',
      ],
    },
    {
      subCategory: 'AI Ethics & Responsible Use',
      themeHint: 'explore fairness, privacy, and community impact in Nigerian energy applications',
      titles: [
        'Ethical Review of Solar Metering in Lagos Tenements',
        'Privacy Risks for Sensor Data in Rural Solar Farms',
        'Bias in AI Pricing Models for Local Traders',
        'Responsibility in Predicting Power Outages for Schools',
        'Fairness in AI-Managed Load Shedding Decisions',
        'Community Consent for Smart Solar Monitoring',
        'Environmental Justice in Solar Battery Disposal Plans',
        'Safety and Trust in AI-Powered Energy Advice',
      ],
    },
    {
      subCategory: 'Applications',
      themeHint: 'apply AI to real Nigerian energy, e-commerce, and solar entrepreneurship challenges',
      titles: [
        'Deploying AI-Based Load Shedding Alerts for Village Solar Hubs',
        'Building a Solar Cold Storage Pricing Assistant',
        'Designing an Agrivoltaic Crop Yield Prediction Workflow',
        'Creating a Solar-Powered Gig Economy Service Tracker',
        'Architecting a Smart Microgrid Rollout Plan for Northern Markets',
      ],
    },
  ];

  const mockActivities: DashboardActivity[] = [];

  categoryDefinitions.forEach((category) => {
    const metadata = AI_CATEGORY_METADATA[category.subCategory];
    category.titles.forEach((title, index) => {
      const style = learningStyles[index % learningStyles.length];
      const id = `mock-${metadata.label}-${index + 1}`;
      const description = `${style} challenge in Nigeria: ${title}. Learners explore ${category.themeHint} through a hands-on scenario.`;
      const systemPrompt = buildAILearningSystemPrompt(title, category.subCategory, style);

      mockActivities.push({
        id,
        user_id: userId,
        category_activity: 'AI Learning',
        sub_category: category.subCategory,
        learning_module_id: id,
        title,
        activity: title,
        description,
        systemPrompt,
        learningStyle: style,
        topicTitle: category.subCategory,
        progress: 'not started',
        created_at: now,
        updated_at: now,
        isPublic: true,
      });
    });
  });

  return mockActivities;
}

// ── AI Learning Session Builder facilitator prompt ────────────────────────────
const AI_SESSION_BUILDER_PROMPT = `AI Learning Session Builder + Constructivist Mastery Coach

You are an AI Learning Coach helping a learner design and complete a personalized learning session. Your job is to guide them one step at a time to master one AI Proficiency category, using a constructivist approach (ask questions, elicit thinking, do not lecture).

Non-negotiable operating rules:
- One step at a time: Ask one question or instruction per turn. No multi-part questions.
- Constructivist: Prefer questions that make the learner generate the content. Only short targeted hints if stuck.
- Rubric-based critique after every response: score each criterion 0–3, evidence-based feedback, single biggest improvement lever, one guiding question.
- No skipping: don't advance until the learner reaches ≥2 (Competent) on criteria relevant to that step.
- No doing the work for them: you may model structure but do not write their full solution.
- Tone: Clear, motivating, direct.
- ANSWER DIRECT QUESTIONS FIRST: If the learner asks a genuine question (e.g. "What does X mean?", "Can you explain Y?", "I don't understand Z"), answer it clearly and concisely before returning to the guiding flow. Never respond to a direct question with another question. A learner who doesn't get answers will disengage.
${TUTOR_BEHAVIOR_RULES}

IMPORTANT: The session context (title, description, location, constraints, stakeholders, entrepreneurial angle, and chosen category) is already embedded in the MODULE DESCRIPTION below. Proceed directly to Step 3 — Run category mastery loop. Do NOT ask the learner to re-enter context.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENTREPRENEURIAL & PUE LENS (APPLY IN EVERY STEP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This learner's topic has an entrepreneurial or productive-use dimension. Throughout the session, you MUST weave in questions and critiques that push the learner to reason about:

1. COSTS & BENEFITS — What does this AI solution cost to set up and run? What concrete value does it create (money saved, income earned, time freed, risk reduced)? Is the benefit bigger than the cost?

2. TRADEOFFS — What do you give up by choosing this approach over another? Who benefits and who bears the burden? What is the opportunity cost?

3. LONG-TERM THINKING — Will this still be useful or profitable in 2–5 years? What could change (technology, market, weather, policy)? How do you make it sustainable?

4. PRODUCTIVE USE OF ENERGY (PUE) — If energy (electricity, solar, fuel) is involved, push them to connect it to productive economic activity: earning income, saving money, increasing output, reducing losses. Idle consumption is waste; productive consumption creates value.

5. BUSINESS VIABILITY — Can this actually work as a business or livelihood? Who would pay for it? What would make it grow or fail?

Do NOT turn the session into a business class — maintain the AI Proficiency rubric at the core. But every guiding question, hint, and critique should GROUND the AI thinking in this entrepreneurial reality. If the learner gives a technically correct answer that ignores the economic dimension, push them with: "That's a solid technical answer — now, what's the business case for it?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rubrics:

A) Understanding AI: Core Concepts & Capabilities
- AI Mechanism Understanding (data→model→patterns→output)
- Contextual Performance (where AI works well vs poorly for this task)
- Limitations & Failure Modes (bias, hallucination, data gaps; cause+consequence)
- Terminology Accuracy (correct + integrated)

B) Prompt Engineering: Effective AI Communication
- Goal & Constraints (clear goal + constraints: audience/format/context)
- Iteration Strategy (why prompts changed; what was learned)
- Output Sensitivity (how changes altered outputs; quality criteria)

C) AI Ethics & Responsible Use
- Risk & Bias Reasoning (who harmed/advantaged + why; tradeoffs)
- Privacy Judgment (sensitive data + protection strategies)
- Ethical Action (mitigation steps + reasoning)

D) Evaluating AI Outputs: Critical Analysis
- Verification Process (facts/tests/trusted sources; triangulation for advanced)
- Error & Bias Detection (flaws/assumptions/misleading content; correction)
- Reflective Judgment (when AI should/should not be trusted; why)

E) Real-World Applications & Problem Solving
- Problem Decomposition (components; causal structure for advanced)
- AI Suitability (justify AI vs alternatives; limits)
- Outcome Measurement (define success; measurable indicators)

Scoring: 0=No Evidence, 1=Emerging, 2=Competent, 3=Advanced

Session flow:

Step 3 — Category mastery loop
For each criterion: ask one guiding question using the learner's context → Rubric Critique Block → one improvement question → repeat until ≥2.

IMPORTANT: At least ONE guiding question per criterion must connect to the entrepreneurial/PUE dimension (costs, benefits, tradeoffs, long-term viability, income generation, or productive energy use). Do not allow a learner to complete a criterion by describing AI in the abstract only — they must ground their answer in the real economic or productive context of their scenario.

Step 4 — Integrated mastery artifact (when all criteria ≥2)
A) Plain-language explanation + failure modes + key terms + how this AI capability affects the economics of the learner's scenario
B) Prompt set: baseline + 2 iterations + comparison notes + which iteration produced the most commercially useful output and why
C) Ethical risk register + privacy plan + mitigations — include at least one risk specific to a small business or agricultural/community setting
D) Evaluation plan: verification + bias checks + trust rules — include at least one check for whether AI output could lead to a bad business or financial decision
E) Solution plan: decomposition + AI suitability + metrics — metrics must include at least one economic indicator (revenue, cost saving, yield increase, time saving with monetary value, etc.)

Step 5 — Reflection (REQUIRED before final scores)

Before providing final scores, you MUST prompt the learner with this reflection sequence.
Do not skip this step even if the learner asks to finish early.

Deliver this reflection prompt exactly:
"Before we wrap up, I want you to take a moment to reflect on this session.

Please respond to these three questions — be as honest and specific as you can:

1. What is the most important thing you learned or figured out in this session?
2. What was the hardest part, and how did you work through it (or where did you get stuck)?
3. How would you approach a similar problem differently next time?

Take your time — your reflection matters."

After the learner responds to the reflection, acknowledge it briefly (1–2 sentences), then proceed to Step 6.

Step 6 — Final scores + peer diffusion activation

Provide final scores across all criteria.

Then add ONE of these teach-back prompts based on the learner's strongest artifact:
- "If you were going to explain this to a friend who wants to start a small business using AI, what would you tell them first?"
- "Imagine you are explaining this AI skill to a farmer, shop owner, or clinic worker in your community tomorrow. What are the three most important things they need to know to use it productively?"
- "How would you explain to a family member why mastering this AI skill could help them earn more, save money, or run their work better?"

This teach-back is not assessed. Its purpose is to consolidate learning through social articulation with a PUE lens.
Respond to their teach-back with ONE reinforcing observation that connects the AI skill to real productive value, then close the session.

Also suggest 1–2 next-step activities based on the learner's progress.

Rubric Critique Block format:
Rubric critique (Category: <A–E>)
Criterion 1: <0–3> — Evidence: <quote/paraphrase> — What to improve: <1 sentence>
Criterion 2: <0–3> — Evidence: <...> — What to improve: <...>
Criterion 3: <0–3> — Evidence: <...> — What to improve: <...>
(Criterion 4 if category A)
Biggest improvement lever: <single sentence>
Next question (one only): <one guiding question — must connect to entrepreneurial/PUE dimension if the learner has not yet addressed it>`;

// Maps category letter → sub_category in learning_modules
const NA_SESSION_BUILDER_PROMPT = AI_SESSION_BUILDER_PROMPT;

const SESSION_CATEGORIES = [
  { id: 'A', label: 'Understanding AI: Core Concepts & Capabilities',
    subCategory: 'Understanding AI: Core Concepts & Capabilities' },
  { id: 'B', label: 'Prompt Engineering: Effective AI Communication',
    subCategory: 'Prompt Engineering: Effective AI Communication' },
  { id: 'C', label: 'AI Ethics & Responsible Use',
    subCategory: 'AI Ethics & Responsible Use' },
  { id: 'D', label: 'Evaluating AI Outputs: Critical Analysis',
    subCategory: 'Evaluating AI Outputs: Critical Analysis' },
  { id: 'E', label: 'Real-World Applications & Problem Solving',
    subCategory: 'Applications' },
];

const AILearningPage: React.FC = () => {
  const { user } = useAuth();
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isImproving, setIsImproving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<any>(null);
  const [wasListeningBeforeSubmit, setWasListeningBeforeSubmit] = useState(false);
  const [activeCategory, setActiveCategory] = useState('what-is-ai');
  const [allAIActivities, setAllAIActivities] = useState<DashboardActivity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<DashboardActivity | null>(null);
  const [currentDashboardId, setCurrentDashboardId] = useState<string | null>(null);
  const [activityDescription, setActivityDescription] = useState<string>('');
  const [moduleTitle, setModuleTitle] = useState<string>('');
  const [aiFacilitatorInstructions, setAiFacilitatorInstructions] = useState<string>('');
  const [successMetrics, setSuccessMetrics] = useState<string>('');
  const [userGradeLevel, setUserGradeLevel] = useState<number | null>(null);
  const [userContinent, setUserContinent] = useState<string | null>(null);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [communicationStrategy, setCommunicationStrategy] = useState<any>(null);
  const [learningStrategy, setLearningStrategy] = useState<any>(null);
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [historyCache, setHistoryCache] = useState<Record<string, ChatMessage[]>>({});
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{
    score: number, 
    evidence: string, 
    improvementAdvice?: string,
    unescoScores?: {
      competency_1_score: number;
      competency_1_evidence: string;
      competency_2_score: number;
      competency_2_evidence: string;
      competency_3_score: number;
      competency_3_evidence: string;
      competency_4_score: number;
      competency_4_evidence: string;
    }
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // ── Reflection gate state ────────────────────────────────────────────────
  const [hasReflection, setHasReflection] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [awaitingReflection, setAwaitingReflection] = useState(false);
  const [userSessionCount, setUserSessionCount] = useState(0);

  // ── Create-Your-Own-Activity state ────────────────────────────────────────
  const [showCreateActivity, setShowCreateActivity] = useState(false);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '', description: '', location: '', constraints: '', stakeholders: '',
    entrepreneurialContext: '', category: 'A'
  });

  // ── Complete Session modal state ───────────────────────────────────────────
  const [showCompleteSessionModal, setShowCompleteSessionModal] = useState(false);
  const [sessionReflectionInput, setSessionReflectionInput] = useState('');
  const [completingSession, setCompletingSession] = useState(false);

  // ── useVoice hook — Nigeria-aware TTS with offline fallback ───────────────
  // voiceMode === 'pidgin' → en-NG priority (local on Chromebook, works offline)
  // voiceMode === 'english' → en-GB priority
  const {
    speak: hookSpeak,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    recognitionLang,
    selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  // Initialize speech recognition
  // Note: voice selection and TTS are handled by useVoice hook above
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
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
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

  // Voice restart after TTS ends (voice input resumes when speech output finishes)
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

  // Load historyCache from localStorage on component mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('AILearningPage_historyCache');
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
          console.log('[AILearning] Restored historyCache from localStorage:', Object.keys(restored).length, 'activities');
        }
      }
    } catch (err) {
      console.warn('[AILearning] Failed to restore historyCache from localStorage:', err);
    }
  }, []);

  // Save historyCache to localStorage whenever it changes
  useEffect(() => {
    if (Object.keys(historyCache).length === 0) return; // Don't save empty cache
    try {
      localStorage.setItem('AILearningPage_historyCache', JSON.stringify(historyCache));
      console.log('[AILearning] Saved historyCache to localStorage:', Object.keys(historyCache).length, 'activities');
    } catch (err) {
      console.warn('[AILearning] Failed to save historyCache to localStorage:', err);
    }
  }, [historyCache]);

  // Voice input function
  const startVoiceInput = () => {
    if (!speechRecognition) {
      alert('Voice input is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }
    
    if (isListening) {
      speechRecognition.stop();
      setWasListeningBeforeSubmit(false);
      return;
    }
    
    try {
      speechRecognition.start();
    } catch (error) {
      console.error('Error starting voice input:', error);
      alert('Could not start voice input. Please try again.');
    }
  };

  // Auto-scroll chat to bottom when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const getProgressIcon = (progress: string) => {
    switch (progress) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'started':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      default:
        return <Circle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getProgressColor = (progress: string) => {
    switch (progress) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'started':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const isActivitySelectable = (activity: DashboardActivity): boolean => {
    if (certificationScoreToOverallLevel(activity.certification_evaluation_score) === 'Advanced') {
      return false;
    }
    return activity.progress === 'not started' || activity.progress === 'started';
  };

  // Fetch user's grade level and continent from profiles
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('[AI Profile] Fetching profile for user:', userId);
      
      // Fetch profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('grade_level, continent, city, country')
        .eq('id', userId)
        .single();
  
      if (profileError) {
        console.error('[AI Profile] Error fetching profile:', profileError);
      }
  
      // Fetch baseline data (communication and learning strategies + communication level)
      const { data: baselineData, error: baselineError } = await supabase
        .from('user_personality_baseline')
        .select('communication_strategy, learning_strategy, communication_level')
        .eq('user_id', userId)
        .maybeSingle();
  
      if (baselineError) {
        console.log('[AI Profile] No baseline found yet (normal for new users)');
      } else if (baselineData?.communication_strategy && baselineData?.learning_strategy) {
        console.log('[AI Profile] Baseline strategies loaded and will be applied');
      } else {
        console.log('[AI Profile] Baseline row missing or strategies not yet generated — personalization skipped');
      }
  
    // Check and trigger baseline assessment (optional - won't break if it fails)
    try {
      supabase.auth.getSession()
        .then(({ data: { session } }) => {
          if (session?.access_token) {
            checkAndTriggerBaseline(userId, session.access_token).catch(err => {
              console.log('Baseline check skipped:', err);
            });
          }
        })
        .catch(() => {}); // Silently fail - baseline is optional
    } catch (err) {
      // Ignore - baseline check is optional
    }
      
      return {
        gradeLevel: profileData?.grade_level || null,
        continent: profileData?.continent || null,
        city: profileData?.city || null,
        communicationStrategy: baselineData?.communication_strategy || null,
        learningStrategy: baselineData?.learning_strategy || null,
        communicationLevel: baselineData?.communication_level ?? 1,
      };
    } catch (err) {
      console.error('[AI Profile] Error fetching user profile:', err);
      return { 
        gradeLevel: null, 
        continent: null,
        city: null,
        communicationStrategy: null,
        learningStrategy: null,
        communicationLevel: 1,
      };
    }
  };

// Get personalized learning instructions based on grade level AND baseline strategies
const getPersonalizedInstructions = (
  gradeLevel: number | null,
  communicationStrategy: any,
  learningStrategy: any,
  sessionCount: number = 0,
  communicationLevel: number = 1
): string => {
  const commonGuidance = `CRITICAL: Your role is to GUIDE learning. 
If the situation calls for presenting options to students - such as with Human or AI - give them a response that can either be human or AI. Ask them which it is and why? 
Do not ask them what topic they'd like to explore. 
If the situation calls for evaluating a prompt, or a potentially biased AI comment, or a potentially incorrect AI response, give them real cases to see. 
If the situation calls for a student to critique the accuracy of an AI response, give them a prompt that could possibly lead to an inaccurate AI response and ask the student to test the prompt to see what the AI delivers. Then ask them to evaluate whether the response is accurate or not. The student should be challenged to consider the efficacy of the response and even conjecture why it may not be accurate. You should help them in this case to understand how to verify the accuracy. 
If the situation calls for a student to spar with AI, ask them to make a claim about something in their world. In this case, the AI should be a devil's advocate, challenging every idea that the student has. When a student has to defend their idea, their stance and position is strengthened. 

ANSWER QUESTIONS DIRECTLY: If the learner asks a genuine question — "What does X mean?", "Can you explain Y?", "I don't understand Z", "How does this work?" — answer it clearly and concisely first, then return to guiding. Never respond to a direct question with another question. Learners who don't get answers will disengage and stop trying.

RESPONSE LENGTH: Keep responses to 75 words maximum unless it's absolutely essential to provide more information for understanding. Be concise while maintaining effectiveness.`;

  // ── Communication Level block — always applied, overrides defaults ────────
  // This reflects the learner's actual English reading/writing maturity.
  // It takes precedence over grade-level assumptions.
  const commLevelGuidance = communicationLevel <= 0 ? `

═══════════════════════════════════════════════
COMMUNICATION LEVEL: 0 — PRE-LITERATE / VERY BASIC
This learner writes in single words, short fragments, or severely broken sentences.
Spelling and grammar errors are frequent and sometimes obscure meaning.
═══════════════════════════════════════════════

LANGUAGE RULES (mandatory — apply to every single response):
- Use ONLY the simplest everyday words. If a word has a simpler version, always use the simpler one.
- Maximum 1–2 short sentences per response. Never write a paragraph.
- Never use technical terms without immediately defining them in plain words.
- Use emojis sparingly to anchor meaning (e.g. "AI is a computer brain 🤖").
- If their message is unclear, respond with "I did not understand. Can you try again?" — never guess.
- Celebrate every attempt: "Good try! 👏" before any correction.
- Ask questions so simple they need only one or two words to answer: "Is this good or bad?"

EXAMPLE response style:
"Good try! 👏 AI learns from data. Data means information — like numbers or words. Does your phone have AI? Yes or no?"
` : communicationLevel === 1 ? `

═══════════════════════════════════════════════
COMMUNICATION LEVEL: 1 — EMERGING
This learner writes in simple short sentences with frequent grammar and spelling errors,
but meaning is usually recoverable. Basic vocabulary. First-generation digital learner.
═══════════════════════════════════════════════

LANGUAGE RULES (mandatory — apply to every single response):
- Use short, clear sentences. One idea per sentence.
- Avoid all jargon. If you must use a technical word, explain it immediately in plain language.
  Example: "AI uses training data — that means lots of examples it has already seen."
- Ask ONE question per turn, never two or three.
- Keep your full response under 60 words.
- When the learner gives a short or unclear answer, say "Can you tell me a little more?" — do not ask a new question until they have answered this one.
- Celebrate effort warmly: "That is a great answer!" or "Well done for trying!"
- Use examples from farming, markets, family, or community — not tech industry examples.

EXAMPLE response style:
"Good answer! AI learns from examples, just like you learn from practice.
Here is a question: Can you think of one problem on your farm that AI might help with?"
` : communicationLevel === 2 ? `

═══════════════════════════════════════════════
COMMUNICATION LEVEL: 2 — DEVELOPING
This learner writes multi-sentence responses with errors, but meaning is clear.
Growing vocabulary. Can follow structured explanation and reason with guidance.
═══════════════════════════════════════════════

LANGUAGE RULES:
- Use clear, direct language. You may use technical terms but always explain them briefly.
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
- You may use standard technical vocabulary with concise definitions where helpful.
- Responses can be fuller — but still honour the 75-word guideline unless depth is essential.
- Push for precision: "Can you be more specific?" or "What evidence would support that claim?"
- Challenge the learner to compare, evaluate, and synthesise across concepts.
`;

  // Add personalized strategies if baseline exists, otherwise use level-1 defaults
  let personalizedGuidance = '';
  if (communicationStrategy && learningStrategy) {
    personalizedGuidance = `

═══════════════════════════════════════════════
PERSONALIZED LEARNER PROFILE
═══════════════════════════════════════════════

COMMUNICATION STYLE (adapt your tone and interaction):
- Preferred Tone: ${communicationStrategy.preferred_tone}
- Interaction Style: ${communicationStrategy.interaction_style}  
- Detail Level: ${communicationStrategy.detail_level}
- Key Recommendations: ${communicationStrategy.recommendations?.join('; ')}

LEARNING APPROACH (adapt your teaching method):
- Learning Style: ${learningStrategy.learning_style}
- Motivation Approach: ${learningStrategy.motivation_approach}
- Pacing Preference: ${learningStrategy.pacing_preference}
- Key Recommendations: ${learningStrategy.recommendations?.join('; ')}

IMPORTANT: Use this profile to personalize EVERY response. Match their preferred communication tone, interaction style, and teaching approach. This is critical for effective learning.

═══════════════════════════════════════════════
`;
  } else {
    // No baseline yet — apply level-1 (Emerging) defaults so the AI coach
    // communicates simply and accessibly until a real profile is built.
    personalizedGuidance = `

═══════════════════════════════════════════════
DEFAULT COMMUNICATION STRATEGY — LEVEL 1 (Emerging)
No personalised profile available yet for this learner.
═══════════════════════════════════════════════

COMMUNICATION STYLE:
- Use simple, short sentences. Avoid technical jargon and complex vocabulary.
- Be warm, patient, and encouraging. Validate every attempt, even partial ones.
- Ask one question at a time. Do not combine multiple questions into a single turn.
- If the learner's response is short or unclear, gently prompt for more with "Can you say a bit more about that?"

LEARNING APPROACH:
- Keep steps small and concrete. Explain one idea before moving to the next.
- Connect every concept to something familiar from the learner's daily life or community.
- Celebrate small wins explicitly — "That's a great start!" or "Well done for trying."
- Do not assume prior knowledge. Briefly re-explain terms if a learner seems unsure.

═══════════════════════════════════════════════
`;
  }
  
  // Grade-specific guidance
  let gradeGuidance = '';
  
  if (gradeLevel === 1) {
    gradeGuidance = `
GRADE LEVEL: Elementary School (Grades 3-5, Ages 8-11)

LANGUAGE: Use simple, clear language. Use shorter sentences, avoid complex vocabulary, and be extra encouraging and patient.

TEACHING APPROACH: Ask simple guiding questions like "What do you think might happen if...?" or "Can you tell me what you notice about...?" Break complex ideas into smaller steps. Use examples from their daily life like family, pets, games, or school activities. Celebrate their thinking process, not just correct answers. Make learning feel like a fun puzzle to solve together!`;
  } else if (gradeLevel === 2) {
    gradeGuidance = `
GRADE LEVEL: Middle School (Grades 6-8, Ages 11-14)

LANGUAGE: Use age-appropriate language. You can use slightly more complex vocabulary but still keep explanations clear and relatable.

TEACHING APPROACH: Ask thought-provoking questions that build on their developing critical thinking skills. Use questions like "Why do you think that happened?" or "What evidence supports that idea?" Help them make connections between concepts. Use examples from school life, friends, technology, and current events they might relate to. Encourage them to explain their reasoning and challenge them to think deeper.`;
  } else if (gradeLevel === 3) {
    gradeGuidance = `
GRADE LEVEL: High School (Grades 9-12, Ages 14-18)

LANGUAGE: You can use more sophisticated language and concepts. They can handle complex ideas and abstract thinking.

TEACHING APPROACH: Use advanced questioning techniques that promote analytical and critical thinking. Ask questions like "How would you analyze this situation?" or "What are the implications of this concept?" Encourage them to evaluate different perspectives, make predictions, and synthesize information. Connect learning to their future goals, college prep, career interests, and real-world applications. Challenge them to defend their reasoning and consider alternative viewpoints.`;
  } else {
    gradeGuidance = `
TEACHING APPROACH: Adapt your communication style to be clear and age-appropriate. Use encouraging language and check for understanding frequently. Focus on guiding the student to discover answers through thoughtful questioning rather than providing direct solutions.`;
  }

  // ── Scaffolding tier: reduce support as learner gains experience ─────────
  const scaffoldingGuidance = sessionCount <= 3
    ? `
SCAFFOLDING TIER 1 — EMERGING LEARNER (sessions 1–3):
Provide generous scaffolding. Offer partial examples if the learner is stuck. Validate attempts openly.
Break down every criterion into a single guiding question. Expect short, definitional answers — this is normal.`
    : sessionCount <= 10
    ? `
SCAFFOLDING TIER 2 — DEVELOPING LEARNER (sessions 4–10):
Reduce scaffolding. Withhold partial examples — ask a follow-up question instead.
Expect structured reasoning, not just definitions. If learner responds definitionally,
prompt: "Can you walk me through WHY that happens, not just WHAT it is?"
Do not re-explain concepts already covered in earlier sessions.`
    : `
SCAFFOLDING TIER 3 — ADVANCED LEARNER (10+ sessions):
Minimal scaffolding. Do not offer hints unless the learner explicitly asks.
Expect integrated, causal reasoning. Push toward synthesis: "How does this connect to what
you already know about [prior topic]?" If the learner gives a correct answer quickly,
go deeper immediately — do not praise and move on.`;

  return `${commonGuidance}${commLevelGuidance}${personalizedGuidance}${gradeGuidance}${scaffoldingGuidance}`;
};

  // Fetch all dashboard activities with category = 'AI Learning'
  const fetchAllAIActivities = async (city?: string | null) => {
    if (!user?.id) return;
  
    try {
      // Resolve which city_town to show: Ibiade users see Ibiade modules, everyone else sees Oloibiri
      const cityTown = city === 'Ibiade' ? 'Ibiade' : 'Oloibiri';

      // 1. Fetch all relevant learning modules filtered by city_town
      const { data, error } = await supabase
        .from('learning_modules')
        .select('*')
        .eq('category', 'AI Proficiency')
        .eq('learning_or_certification', 'learning')
        .eq('city_town', cityTown)
        .or(`public.eq.1,user_id.eq.${user.id}`)
        .order('sub_category', { ascending: true });
  
      if (error) throw error;
      
      // 2. Fetch this user's dashboard rows for those modules (progress + all scores)
      const moduleIds = (data || []).map(m => m.learning_module_id);
      let dashMap = new Map<string, any>();

      if (moduleIds.length > 0) {
        const { data: dashRows, error: dashErr } = await supabase
          .from('dashboard')
          .select(`
            learning_module_id, progress, updated_at,
            certification_evaluation_score, certification_evaluation_evidence,
            certification_evaluation_UNESCO_1_score, certification_evaluation_UNESCO_1_evidence,
            certification_evaluation_UNESCO_2_score, certification_evaluation_UNESCO_2_evidence,
            certification_evaluation_UNESCO_3_score, certification_evaluation_UNESCO_3_evidence,
            certification_evaluation_UNESCO_4_score, certification_evaluation_UNESCO_4_evidence
          `)
          .eq('user_id', user.id)
          .in('learning_module_id', moduleIds);

        if (dashErr) {
          console.warn('[AI Activities] Could not load dashboard scores:', dashErr.message);
        } else {
          dashMap = new Map((dashRows || []).map(d => [d.learning_module_id, d]));
        }
      }

      // 3. Merge — module metadata + user's saved progress & scores
      const activities: DashboardActivity[] = (data || []).map(module => {
        const dash = dashMap.get(module.learning_module_id);
        return {
          id: module.learning_module_id,
          user_id: user.id,
          category_activity: 'AI Learning',
          sub_category: module.sub_category,
          learning_module_id: module.learning_module_id,
          title: module.title,
          description: module.description,
          activity: module.title,
          progress: (dash?.progress ?? 'not started') as 'not started' | 'started' | 'completed',
          certification_evaluation_score:           dash?.certification_evaluation_score           ?? null,
          certification_evaluation_evidence:        dash?.certification_evaluation_evidence        ?? null,
          certification_evaluation_UNESCO_1_score:  dash?.certification_evaluation_UNESCO_1_score  ?? null,
          certification_evaluation_UNESCO_1_evidence: dash?.certification_evaluation_UNESCO_1_evidence ?? null,
          certification_evaluation_UNESCO_2_score:  dash?.certification_evaluation_UNESCO_2_score  ?? null,
          certification_evaluation_UNESCO_2_evidence: dash?.certification_evaluation_UNESCO_2_evidence ?? null,
          certification_evaluation_UNESCO_3_score:  dash?.certification_evaluation_UNESCO_3_score  ?? null,
          certification_evaluation_UNESCO_3_evidence: dash?.certification_evaluation_UNESCO_3_evidence ?? null,
          certification_evaluation_UNESCO_4_score:  dash?.certification_evaluation_UNESCO_4_score  ?? null,
          certification_evaluation_UNESCO_4_evidence: dash?.certification_evaluation_UNESCO_4_evidence ?? null,
          created_at: module.created_at,
          updated_at: dash?.updated_at ?? module.updated_at,
          isPublic: module.public === 1 || module.public === true,
        };
      });
      
      setAllAIActivities(activities);
    } catch (err) {
      console.error('Error fetching AI learning activities:', err);
      // Use full mock fallback on error
      console.log('[AI Activities] Error loading — using full mock fallback data.');
      setAllAIActivities(buildAILearningMockActivities(user.id));
    }
  };

  // Create or get dashboard entry for learning activity
  const getOrCreateDashboardEntry = async (activity: DashboardActivity, userId: string, gradeLevel: number | null, continent: string | null): Promise<DashboardEntryResult> => {
    const moduleId = activity.learning_module_id || '';
    const fallbackId = `mock-dashboard-${moduleId || 'unknown'}`;

    if (!isValidUuid(moduleId)) {
      console.warn('[Dashboard] Skipping Supabase query for non-UUID learning_module_id:', moduleId);
      return {
        id: fallbackId,
        chat_history: activity.chat_history || '[]',
        progress: activity.progress || 'not started',
        isMock: true,
      };
    }

    try {
      // Check if dashboard entry exists
      const { data: existing, error: checkError } = await supabase
        .from('dashboard')
        .select('*')
        .eq('user_id', userId)
        .eq('learning_module_id', moduleId)
        .maybeSingle();

      if (checkError) {
        console.error('[Dashboard] Error checking for existing entry:', checkError);
        throw checkError;
      }

      if (existing) {
        console.log('[Dashboard] Existing entry found:', existing.id);
        return {
          id: existing.id,
          chat_history: existing.chat_history || '[]',
          progress: existing.progress || 'not started'
        };
      }

      // Create new dashboard entry
      console.log('[Dashboard] Creating new entry for module:', moduleId);
      const { data: newEntry, error: createError } = await supabase
        .from('dashboard')
        .insert({
          user_id: userId,
          learning_module_id: moduleId,
          title: activity.title,
          activity: activity.title,
          category_activity: 'AI Learning',
          sub_category: activity.sub_category,
          progress: 'started',
          grade_level: gradeLevel,
          continent: continent || null,
          chat_history: '[]',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('[Dashboard] Error creating entry:', createError);
        throw createError;
      }

      console.log('[Dashboard] New entry created:', newEntry.id);
      return {
        id: newEntry.id,
        chat_history: newEntry.chat_history || '[]',
        progress: newEntry.progress || 'started'
      };

    } catch (error) {
      console.error('[Dashboard] Error in getOrCreateDashboardEntry:', error);
      return {
        id: fallbackId,
        chat_history: activity.chat_history || '[]',
        progress: activity.progress || 'not started',
        isMock: true,
      };
    }
  };

  // Build UNESCO assessment instructions
  const buildUNESCOAssessmentInstructions = () => {
    return `You are evaluating learner responses against the UNESCO AI Competency Framework for Learners.

You must assess FOUR competencies. For EACH competency, provide:
1. A score from 1-4
2. Specific evidence from the learner's response

COMPETENCY 1: Understanding of AI Principles and Limitations
UNESCO Standard: Learners understand, at an appropriate level, how AI systems work, including their capabilities, limitations, and potential risks.

Evidence MUST show:
- Accurate description of what the AI system can and cannot do
- Identification of at least one limitation or risk (e.g., bias, error, data dependence)
Quality threshold: No anthropomorphizing (e.g., "AI knows," "AI decides")

COMPETENCY 2: Human-Centred Mindset
UNESCO Standard: Learners recognize that AI systems should respect human dignity, rights, and agency, and that humans remain responsible for decisions made with AI systems.

Evidence MUST show:
- Learner explicitly identifies human responsibility for outcomes
- AI is described as supporting, not replacing, human judgment
- At least one human, ethical, or social consideration is named
Quality threshold: Statements must be context-specific, not generic

COMPETENCY 3: Application of AI Tools
UNESCO Standard: Learners use AI systems purposefully and responsibly to support learning, problem-solving, creativity, and decision-making.

Evidence MUST show:
- Clear purpose for AI use tied to the category goal
- Learner-driven prompts or interactions
- Human modification, selection, or refinement of AI output
Quality threshold: AI use must be intentional, not incidental

COMPETENCY 4: Critical Evaluation and Societal Impact
UNESCO Standard: Learners critically assess AI outputs and reflect on the broader social, ethical, and environmental implications of AI use.

Evidence MUST show:
- Evaluation of accuracy, usefulness, or appropriateness
- Reflection on real-world or community impact
Quality threshold: Must include judgment, not just description

SCORING RUBRIC (1-4 for each competency):
Level 4 – Advanced: Meets competency with depth and coherence; demonstrates agency, judgment, and contextual awareness
Level 3 – Competent: Meets competency at a functional level; minor gaps in depth or integration
Level 2 – Developing: Meets competency inconsistently; limited evaluation or understanding
Level 1 – Emerging: Minimal or superficial evidence; AI treated as authority or black box

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this exact structure:
{
  "competency_1_score": <number 1-4>,
  "competency_1_evidence": "<specific quote or description from learner's work>",
  "competency_2_score": <number 1-4>,
  "competency_2_evidence": "<specific quote or description from learner's work>",
  "competency_3_score": <number 1-4>,
  "competency_3_evidence": "<specific quote or description from learner's work>",
  "competency_4_score": <number 1-4>,
  "competency_4_evidence": "<specific quote or description from learner's work>"
}

CRITICAL: Return ONLY the JSON object. No preamble, no explanation, no markdown formatting.
Do NOT wrap the JSON in markdown code fences (for example, three backticks followed by "json" and closing three backticks). Return the raw JSON object only.`;
  };

  // Build UNESCO AI Competency Framework guidance (enriched with all improvements)
  const buildUNESCOGuidance = (subCategory: string, scores: any, sessionCount: number = 0) => {
    const baseGuidance = `INTERNAL GUIDANCE (DO NOT SHARE WITH LEARNER):
You are facilitating AI Proficiency learning aligned to the UNESCO AI Competency Framework for Learners.

LEARNER'S CURRENT PERFORMANCE (INTERNAL ONLY - DO NOT MENTION TO LEARNER):
- Competency 1 – Understanding of AI: Score ${scores.score1 || 'Not evaluated'} | Evidence: ${scores.evidence1 || 'None'}
- Competency 2 – Human-Centred Mindset: Score ${scores.score2 || 'Not evaluated'} | Evidence: ${scores.evidence2 || 'None'}
- Competency 3 – Application of AI Tools: Score ${scores.score3 || 'Not evaluated'} | Evidence: ${scores.evidence3 || 'None'}
- Competency 4 – Critical Evaluation: Score ${scores.score4 || 'Not evaluated'} | Evidence: ${scores.evidence4 || 'None'}

YOUR FACILITATION APPROACH:
1. Identify which competency area has the lowest score (internal use only)
2. Focus your guidance on improving that specific area
3. NEVER mention scores, competencies, or UNESCO to the learner
4. NEVER evaluate or score the learner's work
5. NEVER provide direct answers or solutions
6. Use natural, supportive questions to guide improvement
7. Frame everything as helping them strengthen their work, not fixing a "low score"

Your role:
- Acknowledge what's working well in their response
- Use questions to guide them toward deeper thinking in the weakest area
- Help them see what could be clearer, more thorough, or more thoughtful
- Invite them to revise and expand their work
- Maintain a supportive, encouraging tone that reinforces their agency`;

    // Determine lowest score
    const validScores = [
      { num: 1, score: scores.score1 },
      { num: 2, score: scores.score2 },
      { num: 3, score: scores.score3 },
      { num: 4, score: scores.score4 }
    ].filter(s => s.score !== null);

    let lowestCompetency: number | null = null;
    if (validScores.length > 0) {
      lowestCompetency = validScores.reduce((min, curr) =>
        curr.score < min.score ? curr : min
      ).num;
    }

    // Sub-category specific guidance
    let categoryGuidance = '';
    if (subCategory === 'Understanding AI: Core Concepts & Capabilities') {
      categoryGuidance = `\n\nFOCUS AREA FOR ${subCategory}:\nHelp the learner deepen their understanding of how AI systems work and their limitations.\n\nGuide them with questions like:\n- What is this AI system designed to do in this activity?\n- What is something it cannot do reliably?\n- Where does a human still need to make decisions or check the output?\n- How would you explain this AI's capabilities and limits to someone else?\n\nEncourage them to make their explanation clearer and more specific about AI limitations and human responsibility.`;
    } else if (subCategory === 'Prompt Engineering: Effective AI Communication') {
      categoryGuidance = `\n\nFOCUS AREA FOR ${subCategory}:\nHelp the learner reflect more deeply on how they directed the AI and made choices.\n\nGuide them with questions like:\n- What was your goal when you wrote this prompt?\n- How did the AI's response change when you adjusted the prompt?\n- What choices did you make after seeing the AI's output?\n- What made you decide to use the AI's suggestion (or not use it)?\n\nEncourage them to describe their intentional choices and decision-making process more explicitly.`;
    } else if (subCategory === 'AI Ethics & Responsible Use') {
      categoryGuidance = `\n\nFOCUS AREA FOR ${subCategory}:\nHelp the learner think more concretely about responsibility and real-world consequences.\n\nGuide them with questions like:\n- Who might be affected by using AI in this way?\n- What could go wrong if this output were used without checking it carefully?\n- What responsibility does a human have in this situation?\n- What would responsible use look like here?\n\nEncourage them to add specific, real-world ethical considerations connected to this activity.`;
    } else if (subCategory === 'Evaluating AI Outputs: Critical Analysis') {
      categoryGuidance = `\n\nFOCUS AREA FOR ${subCategory}:\nHelp the learner strengthen their critical judgment of AI output quality.\n\nGuide them with questions like:\n- How do you know this output is accurate or appropriate?\n- What might the AI have misunderstood or missed?\n- If someone trusted this output without checking, what could happen?\n- What would you need to verify before using this?\n\nEncourage them to add clearer critique, correction, or justification of the AI's output.`;
    } else if (subCategory === 'Applications') {
      categoryGuidance = `\n\nFOCUS AREA FOR ${subCategory} (Real-World Applications & Problem Solving):\nHelp the learner strengthen their reasoning about AI use in real contexts.\n\nGuide them with questions like:\n- Why is AI helpful here, and why is it not enough on its own?\n- What decisions must a human still make?\n- What risks or tradeoffs could appear in a real-world setting?\n- How would this work in practice outside of this activity?\n\nEncourage them to demonstrate clearer reasoning about human responsibility, evaluation, and real-world awareness.`;
    }

    let focusGuidance = '';
    if (lowestCompetency) {
      focusGuidance = `\n\nPRIORITY FOCUS (INTERNAL): The learner's work is weakest in Competency Area ${lowestCompetency}. Use the category-specific questions above to guide them toward improvement in this area. Remember: be natural and supportive - never mention competencies, scores, or the framework.`;
    }

    // ── PUE Application Bridge (for returning learners, 5+ sessions) ─────────
    const pueBridge = sessionCount >= 5
      ? `\n\nPUE APPLICATION BRIDGE (INTERNAL — do NOT use terms like "PUE" or "framework" with learner):
This learner has enough session experience to begin connecting AI competencies to real productive activity.
Where natural in the conversation, weave in a bridging question such as:
- "How might someone use this in a small business or farm in your community?"
- "If a clinic worker or local teacher needed this AI skill, how would they apply it?"
- "Can you think of a local service or product where this AI capability would help?"
This is NOT a separate step — fold it naturally into the mastery loop as a context-grounding move.
If the learner generates an application scenario, affirm it and deepen it — do not redirect back to the abstract.`
      : '';

    // ── Certification Proximity Framing ────────────────────────────────────
    const allScoresPresent = scores.score1 && scores.score2 && scores.score3 && scores.score4;
    const avgScore = allScoresPresent
      ? (scores.score1 + scores.score2 + scores.score3 + scores.score4) / 4
      : null;
    const proximityNote = avgScore !== null && avgScore >= 2.5
      ? `\n\nCERTIFICATION PROXIMITY (INTERNAL ONLY — do NOT mention scores to learner):
This learner is performing at a high level. Use goal-proximate language to amplify momentum:
- "You're getting very close to showing mastery of this whole topic."
- "One more clear example in this area would really round out your understanding."
- "You've come a long way — let's push for the clearest explanation you've given yet."
This is a motivational amplifier. The learner should feel momentum and near-completion, not pressure.`
      : '';

    // ── Reasoning Mode Signal ──────────────────────────────────────────────
    const evidenceText = [scores.evidence1, scores.evidence2, scores.evidence3, scores.evidence4]
      .filter(Boolean).join(' ');
    const isDefinitional = !scores.score1 || evidenceText.length < 80 ||
      /^(AI is|AI means|AI can|AI helps|this is|this means)/i.test(evidenceText.trim());
    const reasoningModeNote = scores.score1
      ? `\n\nREASONING MODE SIGNAL (INTERNAL ONLY):
${isDefinitional
  ? `This learner is in DEFINITIONAL mode — responses describe what things are, not how or why.
STRATEGY: Push past definitions immediately. If they define a term, ask: "Good — now tell me WHY that happens" or "What would break that if it were wrong?" Never accept a definition as a complete answer.`
  : `This learner is in STRUCTURED REASONING mode — responses include cause, consequence, and context.
STRATEGY: Do not re-prompt for basic definitions. Start at analysis level. Ask them to compare, predict, or synthesize. If they give a structured answer, push for a counter-case or edge condition.`}`
      : '';

    return baseGuidance + categoryGuidance + focusGuidance + pueBridge + proximityNote + reasoningModeNote;
  };

  // Fetch previous session summary for cross-session memory stub
  const fetchPreviousSessionSummary = async (userId: string, moduleId: string): Promise<string> => {
    try {
      const { data } = await supabase
        .from('dashboard')
        .select('chat_history, certification_evaluation_evidence, updated_at')
        .eq('user_id', userId)
        .eq('learning_module_id', moduleId)
        .maybeSingle();

      if (!data?.chat_history) return '';
      const history = JSON.parse(data.chat_history);
      if (!Array.isArray(history) || history.length < 4) return '';

      const lastLearnerMessages = history
        .filter((m: any) => m.role === 'user')
        .slice(-2)
        .map((m: any) => m.content)
        .join(' / ');

      if (!lastLearnerMessages) return '';

      return `
PREVIOUS SESSION MEMORY (INTERNAL — do NOT share verbatim, use only to personalise):
This learner has visited this module before. Their last responses indicated: "${lastLearnerMessages.slice(0, 300)}..."
Evidence note from last evaluation: ${data.certification_evaluation_evidence || 'None recorded'}

USE THIS TO:
- Reference prior thinking naturally: "Last time you were exploring X — let's build on that."
- Skip re-introducing concepts the learner has already demonstrated understanding of.
- Start from where they left off, not from the beginning.
- Do NOT recap the previous session to them — just use it to calibrate depth and continuity.`;
    } catch {
      return '';
    }
  };

  // Fetch user's total session count across all modules (for scaffolding tier)
  const fetchUserSessionCount = async (userId: string): Promise<number> => {
    try {
      const { count } = await supabase
        .from('dashboard')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('chat_history', 'is', null);
      return count || 0;
    } catch {
      return 0;
    }
  };

  // Fetch learning module description and AI instructions
  const fetchActivityDetails = async (activity: DashboardActivity, userId: string) => {
    try {
      console.log('[AI Learning] Fetching activity details for:', activity.learning_module_id);

      if (!activity.learning_module_id) {
        throw new Error('No learning_module_id in activity');
      }

      // Fetch learning module details
      const { data, error } = await supabase
        .from('learning_modules')
        .select('*')
        .eq('learning_module_id', activity.learning_module_id)
        .single();

      if (error) {
        console.error('[AI Learning] Error fetching module details:', error);
        throw error;
      }

      console.log('[AI Learning] Details fetched successfully:', data?.title);

      // Fetch UNESCO evaluation scores from dashboard
      const { data: dashboardData, error: dashboardError } = await supabase
        .from('dashboard')
        .select('certification_evaluation_UNESCO_1_score, certification_evaluation_UNESCO_1_evidence, certification_evaluation_UNESCO_2_score, certification_evaluation_UNESCO_2_evidence, certification_evaluation_UNESCO_3_score, certification_evaluation_UNESCO_3_evidence, certification_evaluation_UNESCO_4_score, certification_evaluation_UNESCO_4_evidence')
        .eq('user_id', userId)
        .eq('learning_module_id', activity.learning_module_id)
        .maybeSingle();

      if (dashboardError) {
        console.warn('[AI Learning] Dashboard fetch warning:', dashboardError);
      }

      const unescoScores = {
        score1: dashboardData?.certification_evaluation_UNESCO_1_score || null,
        evidence1: dashboardData?.certification_evaluation_UNESCO_1_evidence || '',
        score2: dashboardData?.certification_evaluation_UNESCO_2_score || null,
        evidence2: dashboardData?.certification_evaluation_UNESCO_2_evidence || '',
        score3: dashboardData?.certification_evaluation_UNESCO_3_score || null,
        evidence3: dashboardData?.certification_evaluation_UNESCO_3_evidence || '',
        score4: dashboardData?.certification_evaluation_UNESCO_4_score || null,
        evidence4: dashboardData?.certification_evaluation_UNESCO_4_evidence || ''
      };

      console.log('[AI Learning] UNESCO scores loaded:', unescoScores);

      // Fetch session count and previous session memory in parallel
      const [sessionCount, previousSummary] = await Promise.all([
        fetchUserSessionCount(userId),
        fetchPreviousSessionSummary(userId, activity.learning_module_id)
      ]);
      setUserSessionCount(sessionCount);

      const userProfile = await fetchUserProfile(userId);
      const gradeInstructions = getPersonalizedInstructions(
        userProfile.gradeLevel,
        userProfile.communicationStrategy,
        userProfile.learningStrategy,
        sessionCount,
        userProfile.communicationLevel ?? communicationLevel
      );
      const moduleDescription = data?.description?.trim() || 'Description could not be loaded.';
      const subCategory = data?.sub_category || activity.sub_category || '';

      // Build UNESCO Framework guidance (with sessionCount for PUE bridge)
      const unescoGuidance = buildUNESCOGuidance(subCategory, unescoScores, sessionCount);

      const enhancedFacilitatorInstructions = data?.ai_facilitator_instructions
        ? `${gradeInstructions}

${unescoGuidance}
${previousSummary}
LEARNING MODULE: "${data?.title || activity.title}"
MODULE DESCRIPTION: ${moduleDescription}
SUB-CATEGORY: ${subCategory}

FACILITATOR INSTRUCTIONS: ${data.ai_facilitator_instructions}
${TUTOR_BEHAVIOR_RULES}`
        : `${gradeInstructions}

${unescoGuidance}
${previousSummary}
LEARNING MODULE: "${data?.title || activity.title}"
MODULE DESCRIPTION: ${moduleDescription}
SUB-CATEGORY: ${subCategory}

You are a helpful AI learning assistant guiding a student through this learning activity. Be encouraging, patient, and provide step-by-step guidance. Ask questions to check understanding and provide hints when needed.
${TUTOR_BEHAVIOR_RULES}`;

      return {
        title: data?.title || 'this learning activity',
        description: moduleDescription,
        aiInstructions: enhancedFacilitatorInstructions,
        assessmentInstructions: buildUNESCOAssessmentInstructions(),
        successMetrics: data?.metrics_for_success || "Evaluate based on student engagement, understanding of concepts, quality of responses, and overall learning progress.",
        outcomes: data?.outcomes || ''
      };
    } catch (err) {
      console.error('[AI Learning] Fallback due to error:', err);

      const gradeInstructions = getPersonalizedInstructions(userGradeLevel, null, null, userSessionCount);

      return {
        title: 'this learning activity',
        description: 'Description could not be loaded.',
        aiInstructions: `${gradeInstructions}\n\nYou are a helpful AI learning assistant. Guide the student through this learning activity with patience and encouragement.\n${TUTOR_BEHAVIOR_RULES}`,
        assessmentInstructions: "Based on the conversation history, evaluate the student's performance. Consider engagement, effort, and understanding.",
        successMetrics: "Evaluate based on student engagement, understanding of concepts, quality of responses, and overall learning progress.",
        outcomes: ''
      };
    }
  };

  // ── Reflection validation API call ──────────────────────────────────────
  const validateReflection = async (reflectionContent: string): Promise<{
    isGenuine: boolean;
    qualityFlag: 'substantive' | 'surface' | 'missing';
    nudge?: string;
  }> => {
    try {
      const result = await chatJSON({
        page: 'AILearningPage',   // → routes to Groq Llama 3.3 70B
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
      // Fail open — never block a learner due to a validation error
      return { isGenuine: true, qualityFlag: 'substantive' };
    }
  };

  // Updated OpenAI API integration using chatClient
  const callOpenAI = async (userMessage: string, chatHistory: ChatMessage[], aiInstructions: string) => {
    try {
      console.log('[AI Chat] Making API call via chat client');
      
      // Convert local chat history to client format
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

      console.log('[AI Chat] Sending', messages.length, 'messages to API via client');

      const response = await chatText({
        page: 'AILearningPage',
        messages,
        system: aiInstructions,
        max_tokens: 500,
        temperature: 0.7,
      });

      console.log('[AI Chat] API response received successfully');
      
      return response || 'I apologize, but I encountered an issue generating a response. Please try again.';
    } catch (error) {
      console.error('[AI Chat] Error calling API:', error);
      
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

  // Updated Assessment API call using chatJSON
  // overrideReflection is used by Complete Session so the text is available
  // immediately without waiting for React state to flush.
  const callAssessmentAI = async (
    chatHistory: ChatMessage[],
    assessmentInstructions: string,
    successMetrics: string,
    overrideReflection?: string
  ) => {
    try {
      console.log('[UNESCO Comprehensive Assessment] Evaluating full conversation history');
      
      const chatHistoryText = chatHistory.slice(-10).map(msg => 
        `${msg.role === 'assistant' ? 'AI Assistant' : 'Learner'}: ${msg.content.slice(0, 500)}`
      ).join('\n\n');

      const effectiveReflection = overrideReflection ?? reflectionText;
      const reflectionSection = effectiveReflection
        ? `\n\nLEARNER END-OF-SESSION REFLECTION:\n"${effectiveReflection}"\n\nNote: This reflection demonstrates metacognitive awareness. Weight it toward Competency 4 (Critical Evaluation). A substantive reflection that identifies learning and forward intent should raise the Competency 4 score.`
        : `\n\nNote: No end-of-session reflection was submitted by this learner. Cap Competency 4 (Critical Evaluation) score at 2 maximum. Proficient or Advanced on Competency 4 requires demonstrated metacognitive reflection.`;

      const comprehensivePrompt = `Evaluate this learner's COMPLETE performance across the ENTIRE conversation history against UNESCO AI Competency standards.

FULL CONVERSATION HISTORY:
${chatHistoryText}

${assessmentInstructions}
${reflectionSection}

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this exact structure:
{
  "competency_1_score": <number 0-3>,
  "competency_1_evidence": "<specific examples from conversation>",
  "competency_2_score": <number 0-3>,
  "competency_2_evidence": "<specific examples from conversation>",
  "competency_3_score": <number 0-3>,
  "competency_3_evidence": "<specific examples from conversation>",
  "competency_4_score": <number 0-3>,
  "competency_4_evidence": "<specific examples from conversation>",
  "overall_score": <number 0-3>,
  "overall_evidence": "<summary of learner's performance across all competencies>"
}

SCORING SCALE (0-3):
- 0 = No Evidence: Minimal or no demonstration of competency
- 1 = Emerging: Basic understanding with significant gaps
- 2 = Proficient: Functional level, solid understanding with minor gaps
- 3 = Advanced: Comprehensive, nuanced understanding with depth

Calculate overall_score as:
- Average the 4 competency scores
- Round to nearest integer (0-3)
- Example: scores [2,3,2,3] → average 2.5 → rounds to 3

CRITICAL: Return ONLY the JSON object. No preamble, no explanation, no markdown.`;

      const assessment = await chatJSON({
        page: 'AILearningPage',
        messages: [{ role: 'user', content: comprehensivePrompt }],
        system: 'You are a UNESCO AI Competency evaluator. Respond ONLY with valid JSON. Do not include any other text.',
        max_tokens: 1200,
        temperature: 0.2,
      });

      console.log('[UNESCO Comprehensive Assessment] Raw response:', assessment);
      
      // Handle both object and string responses. If a string, aggressively strip markdown fences
      // and attempt to JSON.parse. If parsing still fails, log the full raw response and
      // return a safe mock assessment structure so the UI can render a meaningful fallback.
      let finalAssessment;
      if (typeof assessment === 'string') {
        const raw = assessment;
        const cleaned = String(raw)
          .replace(/```(?:json|JSON|js|javascript)?\s*[\r\n]*/g, '')
          .replace(/[\r\n]*```\s*$/g, '')
          .trim();
        try {
          finalAssessment = JSON.parse(cleaned);
        } catch (parseError) {
          console.error('[UNESCO Assessment] JSON.parse failed on cleaned response:', parseError);
          console.error('[UNESCO Assessment] Full raw response:', raw);
          console.error('[UNESCO Assessment] Cleaned attempt preview:', cleaned.slice(0, 1000));
          // Provide a safe mock structure so the UI shows a structured fallback instead of blank categories
          finalAssessment = {
            competency_1_score: 1,
            competency_1_evidence: 'Unavailable (parse error)',
            competency_2_score: 1,
            competency_2_evidence: 'Unavailable (parse error)',
            competency_3_score: 1,
            competency_3_evidence: 'Unavailable (parse error)',
            competency_4_score: 1,
            competency_4_evidence: 'Unavailable (parse error)',
            overall_score: 1,
            overall_evidence: 'Evaluation unavailable due to parse failure. Raw response has been logged for debugging.'
          } as any;
        }
      } else {
        finalAssessment = assessment;
      }

      // Validate response structure
      if (
        typeof finalAssessment.competency_1_score !== 'number' ||
        typeof finalAssessment.competency_2_score !== 'number' ||
        typeof finalAssessment.competency_3_score !== 'number' ||
        typeof finalAssessment.competency_4_score !== 'number' ||
        typeof finalAssessment.overall_score !== 'number'
      ) {
        console.error('[UNESCO Assessment] Invalid assessment structure:', finalAssessment);
        throw new Error('Assessment response missing required scores');
      }

      console.log('[UNESCO Assessment] Successfully parsed comprehensive assessment');
      
      return {
        evaluation_score: Math.round(finalAssessment.overall_score),
        evaluation_evidence: finalAssessment.overall_evidence,
        unesco_scores: {
          competency_1_score: finalAssessment.competency_1_score,
          competency_1_evidence: finalAssessment.competency_1_evidence,
          competency_2_score: finalAssessment.competency_2_score,
          competency_2_evidence: finalAssessment.competency_2_evidence,
          competency_3_score: finalAssessment.competency_3_score,
          competency_3_evidence: finalAssessment.competency_3_evidence,
          competency_4_score: finalAssessment.competency_4_score,
          competency_4_evidence: finalAssessment.competency_4_evidence
        }
      };
      
    } catch (error) {
      console.error('[UNESCO Assessment] Error during assessment:', error);
      throw error;
    }
  };

  // Update activity evaluation in database
  const updateActivityEvaluation = async (
    activityId: string, 
    evaluationScore: number, 
    evaluationEvidence: string, 
    chatHistory: ChatMessage[],
    unescoScores?: {
      competency_1_score: number;
      competency_1_evidence: string;
      competency_2_score: number;
      competency_2_evidence: string;
      competency_3_score: number;
      competency_3_evidence: string;
      competency_4_score: number;
      competency_4_evidence: string;
    },
    forceComplete: boolean = false
  ) => {
    // Guard: Don't attempt database operations for mock activity IDs
    if (String(activityId ?? '').startsWith('mock-')) {
      console.log('[Evaluation Update] Skipping database update for mock activity:', activityId);
      // Update local state only
      const shouldComplete = forceComplete || evaluationScore === 3;
      const newProgress = shouldComplete ? 'completed' : 'started';
      
      setAllAIActivities(prev => 
        prev.map(activity => 
          activity.id === activityId 
            ? { 
                ...activity, 
                certification_evaluation_score: evaluationScore, 
                certification_evaluation_evidence: evaluationEvidence,
                progress: newProgress as 'not started' | 'started' | 'completed'
              }
            : activity
        )
      );

      if (selectedActivity && selectedActivity.id === activityId) {
        setSelectedActivity(prev => prev ? {
          ...prev,
          certification_evaluation_score: evaluationScore,
          certification_evaluation_evidence: evaluationEvidence,
          progress: newProgress as 'not started' | 'started' | 'completed'
        } : null);
      }
      
      if (shouldComplete) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }
      return;
    }

    try {
      // Complete when all 4 UNESCO competencies are at level 3, OR when explicitly forced
      const shouldComplete = forceComplete || evaluationScore === 3;
      const newProgress = shouldComplete ? 'completed' : 'started';
      
      const updateData: any = { 
        certification_evaluation_score: evaluationScore,
        certification_evaluation_evidence: evaluationEvidence,
        chat_history: JSON.stringify(chatHistory),
        progress: newProgress,
        updated_at: new Date().toISOString()
      };

      // Add UNESCO scores if provided
      if (unescoScores) {
        updateData.certification_evaluation_UNESCO_1_score = unescoScores.competency_1_score;
        updateData.certification_evaluation_UNESCO_1_evidence = unescoScores.competency_1_evidence;
        updateData.certification_evaluation_UNESCO_2_score = unescoScores.competency_2_score;
        updateData.certification_evaluation_UNESCO_2_evidence = unescoScores.competency_2_evidence;
        updateData.certification_evaluation_UNESCO_3_score = unescoScores.competency_3_score;
        updateData.certification_evaluation_UNESCO_3_evidence = unescoScores.competency_3_evidence;
        updateData.certification_evaluation_UNESCO_4_score = unescoScores.competency_4_score;
        updateData.certification_evaluation_UNESCO_4_evidence = unescoScores.competency_4_evidence;
      }

      const { error } = await supabase
        .from('dashboard')
        .update(updateData)
        .eq('id', activityId);

      if (error) throw error;

      setAllAIActivities(prev => 
        prev.map(activity => 
          activity.id === activityId 
            ? { 
                ...activity, 
                certification_evaluation_score: evaluationScore, 
                certification_evaluation_evidence: evaluationEvidence,
                progress: newProgress as 'not started' | 'started' | 'completed'
              }
            : activity
        )
      );

      if (selectedActivity && selectedActivity.id === activityId) {
        setSelectedActivity(prev => prev ? {
          ...prev,
          certification_evaluation_score: evaluationScore,
          certification_evaluation_evidence: evaluationEvidence,
          progress: newProgress as 'not started' | 'started' | 'completed'
        } : null);
      }
      
      if (shouldComplete) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }
      
    } catch (err) {
      console.error('Error updating activity evaluation:', err);
      throw err;
    }
  };

  // Update chat history in database
  const updateChatHistory = async (activityId: string, chatHistory: ChatMessage[]) => {
    // Guard: Don't attempt database operations for mock activity IDs
    if (String(activityId ?? '').startsWith('mock-')) {
      console.log('[Chat History] Skipping database update for mock activity:', activityId);
      // Use localStorage for mock activities
      try {
        const key = `AILearningPage_historyCache_${activityId}`;
        localStorage.setItem(key, JSON.stringify(chatHistory));
      } catch (err) {
        console.warn('[Chat History] Failed to save mock activity to localStorage:', err);
      }
      return;
    }

    try {
      const { error } = await supabase
        .from('dashboard')
        .update({ 
          chat_history: JSON.stringify(chatHistory),
          updated_at: new Date().toISOString()
        })
        .eq('id', activityId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating chat history:', err);
    }
  };

  // Generate personalized improvement advice based on UNESCO scores
const generateImprovementAdvice = async (unescoScores: any) => {
  try {
    console.log('[Improvement Advice] Generating suggestions...');
    
    const advicePrompt = `Based on this learner's UNESCO AI Competency assessment, provide specific, actionable improvement advice.

LEARNER'S SCORES:
Competency 1 - Human-Centred Mindset: ${unescoScores.competency_1_score}
Evidence: ${unescoScores.competency_1_evidence}

Competency 2 - Understanding AI Principles: ${unescoScores.competency_2_score}
Evidence: ${unescoScores.competency_2_evidence}

Competency 3 - Application of AI Tools: ${unescoScores.competency_3_score}
Evidence: ${unescoScores.competency_3_evidence}

Competency 4 - Critical Evaluation: ${unescoScores.competency_4_score}
Evidence: ${unescoScores.competency_4_evidence}

(Scores are on a 0-3 scale: 0=No Evidence, 1=Emerging, 2=Proficient, 3=Advanced)

Provide improvement suggestions in this EXACT format with 3-4 sections:

**Deepen Understanding:**
[2-3 sentences of specific advice]

**Practice Application:**
[2-3 sentences of specific advice]

**Develop Critical Skills:**
[2-3 sentences of specific advice]

Use section headers like "Deepen Understanding:", "Practice Application:", "Develop Critical Skills:", or "Explore Real-World Examples:". Start each section with ** markdown formatting and separate sections with blank lines.`;

    const advice = await chatText({
      page: 'AILearningPage',
      messages: [
        {
          role: 'user',
          content: advicePrompt
        }
      ],
      system: 'You are a supportive AI learning coach providing personalized improvement advice. Follow the exact formatting instructions provided, using clear section headers with ** markdown formatting and separating sections with blank lines.',
      max_tokens: 600,
      temperature: 0.7
    });

    console.log('[Improvement Advice] Generated successfully');
    return advice.trim();
    
  } catch (error) {
    console.error('[Improvement Advice] Error:', error);
    return '**Continue Learning:**\n\nKeep practicing and engaging with the material. Focus on deepening your understanding of how AI works and thinking critically about its applications and limitations.';
  }
};
  const handleImproveEnglish = async () => {
    if (!userInput.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const result = await chatJSON({
        page: 'AILearningPage',
        messages: [{
          role: 'user',
          content: `You are an English language coach helping a student improve their writing.
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
  // ── Tweak personality baseline after each session ─────────────────────────
  // Runs silently (non-blocking) after save or evaluation.
  // Makes small nudges to the existing profile — never a full rewrite.
  const tweakPersonalityBaseline = async (
    userId: string,
    sessionMessages: typeof chatHistory,
    currentCs: any,
    currentLs: any
  ): Promise<void> => {
    const learnerMessages = sessionMessages.filter(m => m.role === 'user');
    if (learnerMessages.length < 3) return;
    if (!currentCs && !currentLs) return;

    const sessionExcerpt = learnerMessages
      .slice(-12)
      .map((m, i) => `[Turn ${i + 1}] ${m.content}`)
      .join('\n\n');

    const prompt = `You are a personality and learning assessment expert. You are making SMALL INCREMENTAL UPDATES to an existing learner profile based on evidence from a single new learning session. Do NOT rewrite or overhaul the profile — only nudge individual fields if the session provides clear evidence that the current value no longer fits.

CURRENT PROFILE:
Communication Strategy:
- preferred_tone: "${currentCs?.preferred_tone ?? 'not set'}"
- interaction_style: "${currentCs?.interaction_style ?? 'not set'}"
- detail_level: "${currentCs?.detail_level ?? 'not set'}"
- recommendations: ${JSON.stringify(currentCs?.recommendations ?? [])}

Learning Strategy:
- learning_style: "${currentLs?.learning_style ?? 'not set'}"
- motivation_approach: "${currentLs?.motivation_approach ?? 'not set'}"
- pacing_preference: "${currentLs?.pacing_preference ?? 'not set'}"
- recommendations: ${JSON.stringify(currentLs?.recommendations ?? [])}

Current communication_level: ${communicationLevel} (scale 0–3)
  0 = Pre-literate / Very Basic — single words, fragments, errors that obscure meaning
  1 = Emerging — simple short sentences, frequent errors but meaning recoverable
  2 = Developing — multi-sentence responses, errors present but clear, growing vocabulary
  3 = Proficient — well-structured, complex ideas expressed clearly, mostly correct grammar

NEW SESSION — LEARNER MESSAGES ONLY:
${sessionExcerpt}

RULES:
- Change a text field only if this session clearly shows the current value is wrong or incomplete.
- For recommendations arrays: add 1 new item if clearly supported, remove 1 if clearly contradicted, or leave unchanged. Never replace the whole array.
- For communication_level: assess the TYPICAL writing quality across these messages (not best or worst). Nudge by at most ±1. Increase if messages consistently show clearer structure or richer vocabulary than the current level; decrease if consistently more fragmented. Leave unchanged if evidence is mixed or consistent with current level.
- If unsure about any field, return the existing value unchanged.

Respond ONLY with valid JSON:
{
  "communication_strategy": { "preferred_tone": "", "interaction_style": "", "detail_level": "", "recommendations": [] },
  "learning_strategy": { "learning_style": "", "motivation_approach": "", "pacing_preference": "", "recommendations": [] },
  "communication_level": ${communicationLevel},
  "changes_made": ""
}`;

    try {
      const result = await chatJSON({
        page: 'AILearningPage',
        messages: [{ role: 'user', content: prompt }],
        system: 'You are a learner profile expert making careful, evidence-based incremental updates. Return only valid JSON.',
        max_tokens: 700,
        temperature: 0.2,
      });

      if (!result?.communication_strategy || !result?.learning_strategy) return;

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

      if (error) { console.error('[AI Tweak] Failed to save:', error); return; }

      setCommunicationStrategy(result.communication_strategy);
      setLearningStrategy(result.learning_strategy);
      setCommunicationLevel(newLevel);
      console.log(`[AI Tweak] Baseline updated. communication_level: ${communicationLevel} → ${newLevel}. ${result.changes_made}`);
    } catch (err) {
      console.warn('[AI Tweak] Skipped:', err);
    }
  };

  // ── Parse rubric scores from the most recent AI rubric block in chat ────────
  // Finds patterns like "AI Mechanism Understanding: 3 —" or "Criterion: 2 —"
  // Used to detect when the learner has reached Proficient/Advanced on all criteria
  // WITHOUT requiring a full evaluation to have run first.
  const extractLatestRubricScores = (history: ChatMessage[]): number[] => {
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role !== 'assistant') continue;
      if (!/rubric critique|rubric \(/i.test(msg.content)) continue;
      // Match patterns like ": 3 —" or ": 2 —" (score always between : and —)
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
      // Learner already reflected via the in-chat Step 5 prompt — go straight to evaluation
      handleCompleteSessionSubmit(reflectionText.trim());
    } else {
      setSessionReflectionInput('');
      setShowCompleteSessionModal(true);
    }
  };

  const handleCompleteSessionSubmit = async (overrideText?: string) => {
    const reflection = (overrideText ?? sessionReflectionInput).trim();
    if (!reflection) return;
    if (!currentDashboardId || chatHistory.length <= 1) return;

    setCompletingSession(true);
    setShowCompleteSessionModal(false);

    // Store reflection so any subsequent saves also use it
    setReflectionText(reflection);
    setHasReflection(true);

    try {
      // Pass reflection directly to avoid React state batching delay
      const assessment = await callAssessmentAI(
        chatHistory,
        buildUNESCOAssessmentInstructions(),
        successMetrics,
        reflection  // overrideReflection — bypasses state timing issue
      );

      // Always mark completed when the learner explicitly chooses Complete Session
      const isMockDashboard = String(currentDashboardId ?? '').startsWith('mock-');
      if (isMockDashboard) {
        console.warn('[Complete Session] Skipping remote updateActivityEvaluation for mock dashboard id:', currentDashboardId);
      } else {
        try {
          await updateActivityEvaluation(
            currentDashboardId,
            assessment.evaluation_score,
            assessment.evaluation_evidence,
            chatHistory,
            assessment.unesco_scores,
            true // forceComplete
          );
        } catch (dbErr) {
          console.warn('[Complete Session] Failed to update remote dashboard:', dbErr);
        }
      }

      const improvementAdvice = await generateImprovementAdvice(assessment.unesco_scores);

      setEvaluationResult({
        score: assessment.evaluation_score,
        evidence: assessment.evaluation_evidence,
        improvementAdvice,
        unescoScores: assessment.unesco_scores
      });
      setShowEvaluationModal(true);

      // Silently tweak personality baseline
      if (user?.id && chatHistory.length > 1) {
        tweakPersonalityBaseline(user.id, chatHistory, communicationStrategy, learningStrategy).catch(() => {});
      }
    } catch (error) {
      console.error('[Complete Session] Error:', error);
      alert('Failed to complete session. Please try again.');
      setShowCompleteSessionModal(true); // Re-open so they don't lose their text
    } finally {
      setCompletingSession(false);
    }
  };

  // Handle save session button click
  const handleSaveSession = async () => {
    if (!currentDashboardId || !chatHistory.length) {
      alert('No session data to save.');
      return;
    }

    setEvaluating(true);
    
    try {
      console.log('[Save Session] Saving chat history and running assessment...');
      
      // Guard: Handle mock activities gracefully with localStorage only
      const isMockActivity = String(currentDashboardId ?? '').startsWith('mock-');
      if (isMockActivity) {
        console.log('[Save Session] Saving mock activity to localStorage only');
        try {
          const key = `AILearningPage_historyCache_${currentDashboardId}`;
          localStorage.setItem(key, JSON.stringify(chatHistory));
        } catch (err) {
          console.warn('[Save Session] Failed to save mock activity to localStorage:', err);
        }
      } else {
        // Save chat history for real activities
        await updateChatHistory(currentDashboardId, chatHistory);
      }
      
      // Run full evaluation (same as Update Evaluation button)
      const assessment = await callAssessmentAI(chatHistory, buildUNESCOAssessmentInstructions(), successMetrics);
      
      await updateActivityEvaluation(
        currentDashboardId,
        assessment.evaluation_score,
        assessment.evaluation_evidence,
        chatHistory,
        assessment.unesco_scores
      );

      const improvementAdvice = await generateImprovementAdvice(assessment.unesco_scores);

      setEvaluationResult({
        score: assessment.evaluation_score,
        evidence: assessment.evaluation_evidence,
        improvementAdvice: improvementAdvice,
        unescoScores: assessment.unesco_scores
      });
      setShowEvaluationModal(true);
      handleBackToOverview();

    } catch (error) {
      console.error('Error saving session:', error);
      alert('Failed to save session. Please try again.');
    } finally {
      setEvaluating(false);
    }
  };

    // Update activity status to 'started'
  const updateActivityStatus = async (activityId: string) => {
    // Guard: Don't attempt database operations for mock activity IDs
    if (String(activityId ?? '').startsWith('mock-')) {
      console.log('[Update Status] Skipping database update for mock activity:', activityId);
      setAllAIActivities(prev => 
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
      
      setAllAIActivities(prev => 
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

  // Handle activity selection
  const handleActivitySelect = async (activity: DashboardActivity) => {
    if (!isActivitySelectable(activity)) return;

    // CHAT HISTORY LOADING & PERSISTENCE:
    // When user opens an activity, we load any previously saved chat messages to allow them to
    // continue from where they left off.
    
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
    
    // Create or get dashboard entry for this activity
    if (user?.id && activity.learning_module_id) {
      try {
        const dashboardEntry = await getOrCreateDashboardEntry(
          activity,
          user.id,
          userGradeLevel,
          userContinent
        );
        setCurrentDashboardId(dashboardEntry.id);
        console.log('[Activity Select] Dashboard entry:', dashboardEntry.id, 'isMock:', dashboardEntry.isMock);

        let initialChatHistory: ChatMessage[] = [];
        // Prefer locally cached history for this learning module id (preserves recent local edits)
        const newKey = String(activity.learning_module_id ?? activity.id ?? '');
        if (newKey && historyCache[newKey] && Array.isArray(historyCache[newKey]) && historyCache[newKey].length > 0) {
          initialChatHistory = historyCache[newKey];
        } else if (dashboardEntry.chat_history) {
          try {
            const storedHistory = JSON.parse(dashboardEntry.chat_history);
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

        if (activity.progress === 'not started') {
          if (!dashboardEntry.isMock) {
            await updateActivityStatus(dashboardEntry.id);
          } else {
            setAllAIActivities(prev => 
              prev.map(act => 
                act.id === activity.id ? { ...act, progress: 'started' } : act
              )
            );
            setSelectedActivity(prev => prev ? { ...prev, progress: 'started' } : prev);
          }
        }

        // Fetch activity details
        const details = await fetchActivityDetails(activity, user.id);
        setActivityDescription(details.description);
        setModuleTitle(details.title);
        setAiFacilitatorInstructions(details.aiInstructions);
        setSuccessMetrics(details.successMetrics);
        
        if (initialChatHistory.length > 0) {
          setChatHistory(initialChatHistory);
        } else {
          const topicTitle = activity.sub_category || 'AI Learning';
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
        
        // Scroll to top when activity loads
        window.scrollTo({ top: 0, behavior: 'smooth' });

      } catch (error) {
        console.error('[Activity Select] Error:', error);
        alert('Error loading activity. Please try again.');
      }
    }
  };

  // Handle back to overview
  const handleBackToOverview = () => {
    setSelectedActivity(null);
    setCurrentDashboardId(null);
    setActivityDescription('');
    setModuleTitle('');
    setAiFacilitatorInstructions('');
    setSuccessMetrics('');
    setChatHistory([]);
    setUserInput('');
    // Reset reflection gate
    setHasReflection(false);
    setReflectionText('');
    setAwaitingReflection(false);
  };

  // Assess user response against UNESCO standards
  const assessUNESCOCompetencies = async (activityId: string, chatHistory: ChatMessage[]) => {
    if (!user?.id || chatHistory.length < 2) return; // Need at least user message and AI response

    try {
      console.log('[UNESCO Assessment] Evaluating competencies across full conversation...');
      
      // Use FULL conversation history for accurate assessment (not just last few messages)
      const conversationContext = chatHistory.slice(-10).map(msg => 
        `${msg.role === 'user' ? 'Learner' : 'AI'}: ${msg.content.slice(0, 500)}`
      ).join('\n\n');

      // Use the standardized UNESCO assessment instructions (not module-specific ones)
      // so scores are always consistent and map correctly to the 4 DB columns
      const standardInstructions = buildUNESCOAssessmentInstructions();

      const assessmentResult = await chatJSON({
        page: 'AILearningPage',
        messages: [
          {
            role: 'user',
            content: `Evaluate this learner's COMPLETE performance across the ENTIRE conversation against UNESCO AI Competency standards:\n\n${conversationContext}`
          }
        ],
        system: standardInstructions,
        max_tokens: 1200,
        temperature: 0.2
      });

      console.log('[UNESCO Assessment] Result:', assessmentResult);

      // Validate all 4 competency scores are present
      // AI returns 1-4 scale; DB constraint requires 0-3, so map by subtracting 1
      const mapScore = (s: any): number | null => {
        if (typeof s !== 'number') return null;
        return Math.min(3, Math.max(0, s - 1)); // 1→0, 2→1, 3→2, 4→3
      };

      const s1 = mapScore(assessmentResult.competency_1_score);
      const s2 = mapScore(assessmentResult.competency_2_score);
      const s3 = mapScore(assessmentResult.competency_3_score);
      const s4 = mapScore(assessmentResult.competency_4_score);

      const validScores = [s1, s2, s3, s4].filter((s): s is number => s !== null);
      const averageScore = validScores.length > 0
        ? validScores.reduce((sum, s) => sum + s, 0) / validScores.length
        : 1;

      const overallScore = averageScore;

      // Build overall evidence summary with correct competency labels
      // (must match column ordering: UNESCO_1=Understanding, UNESCO_2=Human-Centred, UNESCO_3=Application, UNESCO_4=Critical)
      const overallEvidence = `UNESCO Competency Assessment (0-3 scale):
• Understanding of AI: ${s1}/3 - ${assessmentResult.competency_1_evidence}
• Human-Centred Mindset: ${s2}/3 - ${assessmentResult.competency_2_evidence}
• Application of AI Tools: ${s3}/3 - ${assessmentResult.competency_3_evidence}
• Critical Evaluation: ${s4}/3 - ${assessmentResult.competency_4_evidence}`;

      // Store all 4 UNESCO competency scores + overall evaluation in dashboard
      const { error: updateError } = await supabase
        .from('dashboard')
        .update({
          certification_evaluation_UNESCO_1_score: s1,
          certification_evaluation_UNESCO_1_evidence: assessmentResult.competency_1_evidence,
          certification_evaluation_UNESCO_2_score: s2,
          certification_evaluation_UNESCO_2_evidence: assessmentResult.competency_2_evidence,
          certification_evaluation_UNESCO_3_score: s3,
          certification_evaluation_UNESCO_3_evidence: assessmentResult.competency_3_evidence,
          certification_evaluation_UNESCO_4_score: s4,
          certification_evaluation_UNESCO_4_evidence: assessmentResult.competency_4_evidence,
          certification_evaluation_score: overallScore,
          certification_evaluation_evidence: overallEvidence,
          updated_at: new Date().toISOString()
        })
        .eq('id', activityId);

      if (updateError) {
        console.error('[UNESCO Assessment] Error storing scores:', updateError);
      } else {
        console.log('[UNESCO Assessment] Scores stored successfully — Overall:', overallScore,
          '| Understanding of AI:', assessmentResult.competency_1_score,
          '| Human-Centred:', assessmentResult.competency_2_score,
          '| Application:', assessmentResult.competency_3_score,
          '| Critical Eval:', assessmentResult.competency_4_score
        );
      }

    } catch (error) {
      console.error('[UNESCO Assessment] Error:', error);
    }
  };

  // Handle user message submission
  // CHAT PERSISTENCE STRATEGY:
  // 1. FETCH ON OPEN: When an activity is opened in handleActivitySelect, we fetch any existing chat_history
  //    from the dashboard entry and restore it to the chat state.
  // 2. AUTO-SAVE USER MESSAGE: When user submits, we immediately save their message to database via updateChatHistory.
  // 3. AUTO-SAVE AI RESPONSE: After receiving AI response, we save the full chat history (user + AI) immediately.
  // 4. CONTINUOUS HISTORY: No conversational progress is lost if the user leaves before clicking "Complete Session".
  const handleSubmitMessage = async () => {
    if (!userInput.trim() || submitting || !selectedActivity || !currentDashboardId) return;

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
    
    await updateChatHistory(currentDashboardId, updatedChatHistory);
    
    const currentInput = userInput;
    setUserInput('');
    setSubmitting(true);

    try {
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
          if (validation.nudge) {
            const nudgeMessage: ChatMessage = {
              role: 'assistant',
              content: validation.nudge,
              timestamp: new Date()
            };
            const withNudge = [...updatedChatHistory, aiMessage, nudgeMessage];
            setChatHistory(withNudge);
            await updateChatHistory(currentDashboardId, withNudge);
            await assessUNESCOCompetencies(currentDashboardId, withNudge);
            return; // Skip normal flow — nudge already injected
          }
        }
      }

      // Text-to-Speech playback of AI response
      if (voiceOutputEnabled) {
        hookSpeak(aiResponse);
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
      
      await updateChatHistory(currentDashboardId, finalChatHistory);
      
      // Automatically assess UNESCO competencies after each exchange
      await assessUNESCOCompetencies(currentDashboardId, finalChatHistory);
    } catch (error) {
      console.error('Error getting AI response:', error);
      
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'I apologize, but I encountered a technical issue. Please try again or contact support if the problem persists.',
        timestamp: new Date()
      };
      
      const errorChatHistory = [...updatedChatHistory, errorMessage];
      setChatHistory(errorChatHistory);
      
      await updateChatHistory(currentDashboardId, errorChatHistory);

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

  // Handle Enter key in input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitMessage();
    }
  };

  // Get activities for the currently selected sub-category
  const getActivitiesForCategory = (categoryId: string): DashboardActivity[] => {
    const category = aiLearningCategories.find(cat => cat.id === categoryId);
    if (!category) return [];

    return (allAIActivities ?? []).filter(activity =>
      activity.sub_category === category.subCategory
    );
  };

  // Get statistics for a specific category
  const getCategoryStats = (categoryId: string) => {
    const activities = getActivitiesForCategory(categoryId);
    const total = activities.length;
    const completed = activities.filter(a => a.progress === 'completed').length;
    const started = activities.filter(a => a.progress === 'started').length;
    const notStarted = activities.filter(a => a.progress === 'not started').length;
    
    return { total, completed, started, notStarted };
  };

  // Refresh dashboard data
  const refreshDashboard = async () => {
    if (!user?.id) return;

    try {
      setRefreshing(true);
      
      const { error: refreshError } = await supabase.rpc('refresh_user_dashboard', {
        user_id_param: user.id
      });

      if (refreshError) throw refreshError;
      await fetchAllAIActivities(userCity);
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Handle category change
  const handleCategoryChange = (categoryId: string) => {
    setActiveCategory(categoryId);
  };

  // Generate metrics_for_success via AI
  const generateMetricsForSuccess = async (categoryId: string, context: string): Promise<string> => {
    const rubrics: Record<string, string> = {
      A: '1. AI Mechanism Understanding: explains data→model→patterns→output in their context\n2. Contextual Performance: identifies where AI works well vs poorly for their task — including economic impact of failures\n3. Limitations & Failure Modes: names ≥1 limitation with cause and consequence, including at least one business or financial consequence\n4. Terminology Accuracy: uses ≥3 AI terms correctly and integrated',
      B: '1. Goal & Constraints: states a clear goal + ≥1 constraint — goal must reference a productive or economic outcome\n2. Iteration Strategy: explains why prompts changed and what was learned — at least one iteration must target a commercially useful improvement\n3. Output Sensitivity: describes how prompt changes altered outputs and their economic usefulness',
      C: '1. Risk & Bias Reasoning: identifies who is harmed or advantaged with tradeoffs — must include at least one business, livelihood, or community economic risk\n2. Privacy Judgment: names sensitive data + ≥1 protection strategy\n3. Ethical Action: proposes concrete mitigation steps with reasoning, including any impact on trust or commercial viability',
      D: '1. Verification Process: names ≥2 verification sources or methods — at least one must address whether AI output could lead to a bad business or financial decision\n2. Error & Bias Detection: identifies ≥1 flaw/assumption + suggests a correction grounded in real-world consequences\n3. Reflective Judgment: states when AI output should/should not be trusted and why — must address at least one high-stakes productive use scenario',
      E: '1. Problem Decomposition: breaks problem into ≥2 components with causal connections — must include at least one economic or cost component\n2. AI Suitability: justifies AI vs ≥1 alternative, including a cost-benefit comparison\n3. Outcome Measurement: defines success with ≥1 measurable economic indicator (revenue, cost saving, yield increase, time saved with monetary value, etc.)',
    };
    try {
      const result = await chatText({
        page: 'AILearningPage',
        messages: [{ role: 'user', content: `A learner is doing an AI Proficiency session with an entrepreneurial focus:\n${context}\n\nRubric criteria:\n${rubrics[categoryId] || rubrics['A']}\n\nWrite a concise paragraph (3–5 sentences) describing specific evidence the learner must produce to score Competent (2) or higher on each criterion, grounded in their scenario. Emphasise that answers must connect AI thinking to real economic value, cost-benefit reasoning, or productive outcomes — not just technical accuracy.` }],
        system: 'You are an educational assessment designer who specialises in connecting AI skills to entrepreneurial and productive-use contexts. Be specific, concise, and use the learner\'s context.',
        max_tokens: 400,
        temperature: 0.3
      });
      return result.trim();
    } catch (error) {
      console.error('[generateMetricsForSuccess] Error:', error);
      return '';
    }
  };

  // Create a new user-defined learning module + launch it
  const handleCreateCustomActivity = async () => {
    if (!user?.id) return;
    if (!createForm.title.trim()) { alert('Please enter a title.'); return; }
    if (!createForm.description.trim()) { alert('Please describe the problem or topic.'); return; }
    setIsCreatingModule(true);
    try {
      const contextParts = [`Problem/Topic: ${createForm.description.trim()}`];
      if (createForm.entrepreneurialContext.trim()) contextParts.push(`Entrepreneurial/Business Angle: ${createForm.entrepreneurialContext.trim()}`);
      if (createForm.location.trim())     contextParts.push(`Location: ${createForm.location.trim()}`);
      if (createForm.constraints.trim())  contextParts.push(`Constraints: ${createForm.constraints.trim()}`);
      if (createForm.stakeholders.trim()) contextParts.push(`Stakeholders: ${createForm.stakeholders.trim()}`);
      contextParts.push(`Chosen Category: ${createForm.category}`);
      const context = contextParts.join('\n');
      const sessionCat = SESSION_CATEGORIES.find(c => c.id === createForm.category);
      const subCategory = sessionCat?.subCategory || 'Understanding AI: Core Concepts & Capabilities';
      let gradeLevel = userGradeLevel;
      let continent = userContinent;
      if (gradeLevel === null || continent === null) {
        const profile = await fetchUserProfile(user.id);
        gradeLevel = profile.gradeLevel; continent = profile.continent;
        setUserGradeLevel(gradeLevel); setUserContinent(continent);
      }
      const metricsForSuccess = await generateMetricsForSuccess(createForm.category, context);
      const newModuleId = crypto.randomUUID();
      // Resolve city_town for module so it appears in the correct cohort's activity list
      const moduleCityTown = continent === 'North America' ? 'Cincinnati'
                           : (userCity === 'Ibiade' ? 'Ibiade' : 'Oloibiri');

      const { error: insertError } = await supabase.from('learning_modules').insert({
        learning_module_id: newModuleId,
        title: createForm.title.trim(),
        description: context,
        category: 'AI Proficiency',
        sub_category: subCategory,
        ai_facilitator_instructions: continent === 'North America' ? NA_SESSION_BUILDER_PROMPT : AI_SESSION_BUILDER_PROMPT,
        ai_assessment_instructions: buildUNESCOAssessmentInstructions(),
        metrics_for_success: metricsForSuccess,
        outcomes: '',
        public: 0,
        grade_level: 4,
        youtube_link: null,
        youtube_description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        continent: continent || null,
        city_town: moduleCityTown,
        user_id: user.id,
        application: 1,
        learning_or_certification: 'learning',
      });
      if (insertError) throw insertError;
      const newActivity: DashboardActivity = {
        id: newModuleId, title: createForm.title.trim(), activity: createForm.title.trim(),
        category_activity: 'AI Learning', sub_category: subCategory,
        progress: 'started', learning_module_id: newModuleId,
        updated_at: new Date().toISOString(), isPublic: false,
      };
      setShowCreateActivity(false);
      setCreateForm({ title: '', description: '', location: '', constraints: '', stakeholders: '', entrepreneurialContext: '', category: 'A' });
      await fetchAllAIActivities(userCity);
      await handleActivitySelect(newActivity);
    } catch (err) {
      console.error('[Create Activity] Error:', err);
      alert('Failed to create your activity. Please try again.');
    } finally {
      setIsCreatingModule(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (user?.id) {
      setLoading(true);
      
      fetchUserProfile(user.id).then(profile => {
        setUserGradeLevel(profile.gradeLevel);
        setUserContinent(profile.continent);
        setUserCity(profile.city);
        // Default Nigerian voice for Africa users; British for everyone else
        if (profile.country === 'Nigeria') setVoiceMode('pidgin');
        else setVoiceMode('english');
        if (profile.communicationStrategy) setCommunicationStrategy(profile.communicationStrategy);
        if (profile.learningStrategy)       setLearningStrategy(profile.learningStrategy);
        setCommunicationLevel(profile.communicationLevel ?? 1);
        return fetchAllAIActivities(profile.city);
      }).finally(() => setLoading(false));
    }
  }, [user?.id]);

  const currentCategory = aiLearningCategories.find(cat => cat.id === activeCategory);
  const currentActivities = getActivitiesForCategory(activeCategory) ?? [];
  const currentStats = getCategoryStats(activeCategory);

  // ── UI text tiers based on communication_level ────────────────────────────
  // lvl 0–1 = simpler labels, shorter sentences, plain vocabulary
  // lvl 2–3 = current phrasing (unchanged)
  const lvl = communicationLevel ?? 1;

  const uiText = {
    // ── Page header ──────────────────────────────────────────────────────────
    pageTitle:    lvl <= 1 ? 'AI Learning'                                : 'AI Learning Center',
    pageSubtitle: lvl <= 1 ? 'Pick a topic and start learning with AI'   : 'Explore and master artificial intelligence concepts and applications',

    // ── Activity list panel ──────────────────────────────────────────────────
    activitiesHeader:  lvl <= 1 ? 'Learning Activities'                  : `Learning Activities - ${undefined}`, // placeholder, used inline
    activitiesSubtext: lvl <= 1 ? 'Click an activity to begin'           : 'Click on activities to start learning',
    createBtnLabel:    lvl <= 1 ? '+ Make My Own'                        : 'Create Your Own',

    // ── Create Your Own form ─────────────────────────────────────────────────
    createPageTitle:   lvl <= 1 ? 'Make Your Own Activity'               : 'Create Your Own Activity',
    createPageSub:     lvl <= 1 ? 'Choose a topic from your life'        : 'Design a personalized AI learning session rooted in your real world',

    createBannerTitle: lvl <= 1 ? '💡 Connect to your real life'         : '💡 Ground your learning in real productive value',
    createBannerBody:  lvl <= 1
      ? 'The best topics are things you already know — your farm, your market stall, your school, your community. When you learn about AI using something real, it is easier to understand.'
      : 'The best learning activities connect AI skills to something that creates economic value — starting or strengthening a business, improving agriculture, reducing costs, increasing income, or making a community service more productive. Your AI coach will push you to think about costs, benefits, tradeoffs, and long-term viability.',
    createBannerExamples: lvl <= 1
      ? 'Examples: AI to find plant diseases on my farm · AI to help price goods at my market · AI to answer questions for students'
      : 'Examples: AI-assisted crop disease detection → sell diagnosis as a service · Solar-powered cold storage pricing tool · AI chatbot for a market stall · Smart irrigation scheduling for a farm cooperative',

    titleLabel:        lvl <= 1 ? 'Name of your activity'                : 'Activity Title',
    titlePlaceholder:  lvl <= 1 ? 'e.g. Using AI to check my crops'      : 'e.g. Using AI to Price Solar-Dried Fish in My Market',
    categoryLabel:     lvl <= 1 ? 'What type of AI skill?'               : 'AI Proficiency Category',
    categoryHelp:      lvl <= 1 ? 'Your coach will use this to guide your session.'
                                : "The AI coach will use this category's rubric to guide your session — and connect every criterion to your real-world business context.",
    problemLabel:      lvl <= 1 ? 'What do you want to learn about?'     : 'Problem / Topic / Challenge',
    problemPlaceholder: lvl <= 1
      ? 'Tell me what you want to explore. What is the problem or question? e.g. How can AI help me know when to water my garden?'
      : 'Describe the problem or challenge you want to explore. Be specific — what is broken, inefficient, or costly right now?',

    pueLabel:          lvl <= 1 ? '💼 How could this help you earn or save money? (helps a lot)'
                                : '💼 Entrepreneurial or Productive-Use Angle (strongly recommended)',
    pueHelp:           lvl <= 1 ? 'Can this help you make money, save money, or help people in your community? Even a small idea is good.'
                                : 'How could solving this problem create income, save money, improve a business, or strengthen a community? Even a rough idea helps your coach push you toward real economic thinking.',
    puePlaceholder:    lvl <= 1
      ? 'e.g. I want to charge farmers to check their crops with AI. Or: I want to use AI to help me decide prices at my stall.'
      : "e.g. I want to start a small service charging farmers to identify crop diseases using AI. Or: I manage a solar kiosk and want to use AI to predict demand so I don't waste power.",

    locationLabel:     lvl <= 1 ? 'Where are you? (optional)'            : 'Location (optional)',
    locationPlaceholder: lvl <= 1 ? 'e.g. Oloibiri, Bayelsa'            : 'City, town, or region — helps the coach give locally relevant examples',
    constraintsLabel:  lvl <= 1 ? 'What makes this hard? (optional)'     : 'Constraints (optional)',
    constraintsPlaceholder: lvl <= 1
      ? 'e.g. No internet, not much money, people cannot read well'
      : 'Budget limits, unreliable internet, no electricity at site, low literacy in target users, seasonal market, etc.',
    stakeholdersLabel: lvl <= 1 ? 'Who is affected? (optional)'          : 'Stakeholders (optional)',
    stakeholdersPlaceholder: lvl <= 1
      ? 'e.g. Farmers in my village, my customers, my family'
      : 'Customers, suppliers, community members, local government, competitors — anyone who gains or loses from this solution',

    infoBoxTitle:      lvl <= 1 ? 'Your AI coach will ask you about…'    : 'What your coach will push you to think about',
    infoBoxItems:      lvl <= 1 ? [
      { icon: '💰', bold: 'Cost and value', text: '— Is AI worth it here? How much does it cost?' },
      { icon: '⚖️', bold: 'Tradeoffs',      text: '— What do you give up? Who wins and who loses?' },
      { icon: '📈', bold: 'The future',     text: '— Will this still work in 2 years?' },
      { icon: '🏪', bold: 'Business',       text: '— Could someone pay for this?' },
    ] : [
      { icon: '💰', bold: 'Costs vs benefits',      text: '— Is the AI solution worth it? What does it cost to run?' },
      { icon: '⚖️', bold: 'Tradeoffs',              text: '— What do you give up by choosing this approach? Who benefits and who bears the risk?' },
      { icon: '📈', bold: 'Long-term thinking',     text: '— Will this still be useful in 2–5 years? What could go wrong over time?' },
      { icon: '⚡', bold: 'Productive use of energy', text: '— If power is involved, is it creating real economic value or just consuming resources?' },
      { icon: '🏪', bold: 'Business viability',     text: '— Could this become a real service or business? Who would pay for it?' },
    ],

    submitBtn:         lvl <= 1 ? 'Start My Activity →'                  : 'Create & Start Activity',
    backBtn:           lvl <= 1 ? '← Back'                               : '← Back to Activities',
  };

  // ── Create Your Own Activity view ─────────────────────────────────────────
  if (!selectedActivity && showCreateActivity) {
    return (
      <AppLayout>
        <div className="min-h-screen">
          <DistortedBackground imageUrl="/AI_learning.png" />
          <div className="relative z-10 px-6 py-8">
            {/* Constrain to 2/3 of available width */}
            <div className="max-w-[50%]">
            <div className="mb-6 flex items-center justify-between">
              <div className="inline-flex flex-col items-start gap-1 rounded-lg bg-pink-100/80 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-10 w-10 text-purple-600" />
                  <h1 className="text-3xl font-extrabold text-gray-900">{uiText.createPageTitle}</h1>
                </div>
                <p className="text-gray-700 text-base">{uiText.createPageSub}</p>
              </div>
              <button onClick={() => setShowCreateActivity(false)}
                className="bg-pink-400 hover:bg-purple-900 text-purple-900 hover:text-pink-200 rounded-full px-5 py-2 text-base font-medium flex items-center gap-2 transition-colors">
                <ArrowLeft size={16} /> {uiText.backBtn}
              </button>
            </div>

            {/* PUE / context framing banner */}
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-6 py-4 mb-6 flex items-start gap-4">
              <span className="text-3xl flex-shrink-0">💡</span>
              <div>
                <p className="font-bold text-amber-900 text-base mb-1">{uiText.createBannerTitle}</p>
                <p className="text-amber-800 text-base leading-relaxed">{uiText.createBannerBody}</p>
                <p className="text-amber-700 text-sm mt-2 font-medium">{uiText.createBannerExamples}</p>
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-8 space-y-6">

              {/* Title */}
              <div>
                <label className="block text-base font-semibold text-gray-800 mb-1">{uiText.titleLabel} <span className="text-red-500">*</span></label>
                <input type="text" value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={uiText.titlePlaceholder}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-purple-400 focus:border-purple-400" />
              </div>

              {/* Category */}
              <div>
                <label className="block text-base font-semibold text-gray-800 mb-1">{uiText.categoryLabel} <span className="text-red-500">*</span></label>
                <select value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white">
                  {SESSION_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.id}) {cat.label}</option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">{uiText.categoryHelp}</p>
              </div>

              {/* Problem / Topic */}
              <div>
                <label className="block text-base font-semibold text-gray-800 mb-1">{uiText.problemLabel} <span className="text-red-500">*</span></label>
                <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder={uiText.problemPlaceholder}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-purple-400 focus:border-purple-400 resize-none" />
              </div>

              {/* Entrepreneurial / Business Angle */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <label className="block text-base font-semibold text-green-900 mb-1">{uiText.pueLabel}</label>
                <p className="text-sm text-green-700 mb-2">{uiText.pueHelp}</p>
                <textarea value={createForm.entrepreneurialContext} onChange={e => setCreateForm(f => ({ ...f, entrepreneurialContext: e.target.value }))}
                  rows={3} placeholder={uiText.puePlaceholder}
                  className="w-full border border-green-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-green-400 focus:border-green-400 resize-none bg-white" />
              </div>

              {/* Location */}
              <div>
                <label className="block text-base font-semibold text-gray-800 mb-1">{uiText.locationLabel}</label>
                <input type="text" value={createForm.location} onChange={e => setCreateForm(f => ({ ...f, location: e.target.value }))}
                  placeholder={uiText.locationPlaceholder}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-purple-400 focus:border-purple-400" />
              </div>

              {/* Constraints */}
              <div>
                <label className="block text-base font-semibold text-gray-800 mb-1">{uiText.constraintsLabel}</label>
                <textarea value={createForm.constraints} onChange={e => setCreateForm(f => ({ ...f, constraints: e.target.value }))}
                  rows={2} placeholder={uiText.constraintsPlaceholder}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-purple-400 focus:border-purple-400 resize-none" />
              </div>

              {/* Stakeholders */}
              <div>
                <label className="block text-base font-semibold text-gray-800 mb-1">{uiText.stakeholdersLabel}</label>
                <textarea value={createForm.stakeholders} onChange={e => setCreateForm(f => ({ ...f, stakeholders: e.target.value }))}
                  rows={2} placeholder={uiText.stakeholdersPlaceholder}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-purple-400 focus:border-purple-400 resize-none" />
              </div>

              {/* Info box */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-base text-purple-800">
                <p className="font-semibold mb-2">{uiText.infoBoxTitle}</p>
                <ul className="space-y-1 text-sm text-purple-700">
                  {uiText.infoBoxItems.map((item, i) => (
                    <li key={i}>{item.icon} <strong>{item.bold}</strong>{item.text}</li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={handleCreateCustomActivity}
                  disabled={isCreatingModule || !createForm.title.trim() || !createForm.description.trim()}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full px-8 py-3 font-semibold text-base transition-colors">
                  {isCreatingModule
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating…</>
                    : <><Plus size={16} />{uiText.submitBtn}</>}
                </button>
              </div>
            </div>
            </div>{/* end max-w-[66%] */}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your AI learning activities...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Activity Learning Interface
  if (selectedActivity) {
    return (
      <AppLayout>
        {showConfetti && <ConfettiAnimation />}
        
        <div className="min-h-screen">
          <DistortedBackground imageUrl="/AI_learning.png" />
          <div className="relative z-10 pl-6 pr-6 py-8">
            {/* Constrain chat and input to 2/3 width, centered */}
            <div className="max-w-[67%] mx-auto">
            {/* Header with Back Button */}
            <div className="mb-6 flex items-center justify-between">
              <div className="inline-flex flex-col items-start gap-1 rounded-lg bg-pink-100/75 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Brain className="h-10 w-10 text-purple-600" />
                  <h1 className="text-4xl font-extrabold text-gray-900">
                    {moduleTitle || selectedActivity.title}
                  </h1>
                </div>
                <p className="text-gray-800 text-lg">
                  Interactive AI Learning Activity
                </p>
              </div>

              <Button
                onClick={handleBackToOverview}
                size="sm"
                icon={<ArrowLeft size={16} />}
                className="bg-pink-400 hover:bg-purple-900 text-purple-900 hover:text-pink-200 rounded-full px-6 py-2 border-0"
              >
                Back to AI Learning Menu
              </Button>
            </div>

            {/* Activity Info Panel */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">Activity Overview</h2>
              <div className="space-y-2 text-base">
                <div><strong>Category:</strong> {selectedActivity.sub_category}</div>
                <div><strong>Status:</strong> 
                  <span className={classNames(
                    'ml-2 px-2 py-1 rounded text-base',
                    getProgressColor(selectedActivity.progress)
                  )}>
                    {selectedActivity.progress}
                  </span>
                </div>
                {selectedActivity.certification_evaluation_score && (
                  <div><strong>Current Score:</strong> 
                    <span className="ml-2 text-xl font-semibold text-green-600">
                      {selectedActivity.certification_evaluation_score}
                    </span>
                  </div>
                )}
                {selectedActivity.certification_evaluation_evidence && (
                  <div><strong>Last Evaluation:</strong> 
                    <p className="mt-1 text-gray-700 bg-gray-50 rounded p-2 text-base">
                      {selectedActivity.certification_evaluation_evidence}
                    </p>
                  </div>
                )}
                <div className="pt-2">
                  <strong>Description:</strong>
                  <p className="mt-1 text-gray-700 text-base">
                    {activityDescription || selectedActivity.description || 'Description could not be loaded.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Evaluation Results Modal */}
            {showEvaluationModal && evaluationResult && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={classNames(
                      "text-xl font-bold flex items-center",
                      evaluationResult.score === 3 ? "text-green-600" : "text-gray-900"
                    )}>
                      <Star className={classNames(
                        "h-6 w-6 mr-2",
                        evaluationResult.score === 3 ? "text-yellow-500 fill-yellow-500" : "text-yellow-500"
                      )} />
                      {evaluationResult.score === 3 ? "🎉 Activity Completed!" : "Evaluation Complete"}
                    </h3>
                    <button
                      onClick={() => setShowEvaluationModal(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  
                  {/* Content */}
                  <div className="space-y-4">
                    {/* Overall Certification Score Display */}
                    <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-200">
                      <div className="text-center">
                        <div className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-3">
                          Overall Certification Score
                        </div>
                        <div className="flex items-center justify-center gap-4 mb-2">
                          <div className="text-6xl font-extrabold text-purple-700">
                            {evaluationResult.score}<span className="text-3xl text-purple-500">/3</span>
                          </div>
                        </div>
                        <div className={classNames(
                          "inline-block px-6 py-3 rounded-full text-2xl font-bold mt-2",
                          evaluationResult.score === 3 ? 'bg-green-100 text-green-800' :
                          evaluationResult.score === 2 ? 'bg-blue-100 text-blue-800' :
                          evaluationResult.score === 1 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        )}>
                          {evaluationResult.score === 3 ? 'Advanced' :
                           evaluationResult.score === 2 ? 'Proficient' :
                           evaluationResult.score === 1 ? 'Emerging' :
                           'No Evidence'}
                        </div>
                        <div className="text-xs text-gray-600 mt-3">
                          {evaluationResult.score === 0 && 'No evidence of competency demonstrated'}
                          {evaluationResult.score === 1 && 'Emerging understanding of competency'}
                          {evaluationResult.score === 2 && 'Proficient - Meets certification standard ✓'}
                          {evaluationResult.score === 3 && 'Advanced - Exceeds certification standard ✓'}
                        </div>
                        {evaluationResult.score === 3 && (
                          <div className="mt-3 text-sm text-green-600 font-semibold">
                            Activity marked as completed!
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* UNESCO Competency Sub-Scores */}
                    {evaluationResult.unescoScores && (
                      <div className="mb-6">
                        <h4 className="font-semibold text-lg mb-3">UNESCO AI Competency Scores:</h4>
                        <div className="space-y-4">
                          {/* Competency 1 */}
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-semibold text-gray-800">Understanding of AI Principles</h5>
                              <span className={classNames(
                                "px-3 py-1 rounded-full text-sm font-bold",
                                evaluationResult.unescoScores.competency_1_score === 3 ? "bg-green-100 text-green-800" :
                                evaluationResult.unescoScores.competency_1_score === 2 ? "bg-blue-100 text-blue-800" :
                                evaluationResult.unescoScores.competency_1_score === 1 ? "bg-yellow-100 text-yellow-800" :
                                "bg-gray-100 text-gray-800"
                              )}>
                                {evaluationResult.unescoScores.competency_1_score}/3
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Evidence:</span> {evaluationResult.unescoScores.competency_1_evidence}
                            </p>
                          </div>

                          {/* Competency 2 */}
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-semibold text-gray-800">Human-Centred Mindset</h5>
                              <span className={classNames(
                                "px-3 py-1 rounded-full text-sm font-bold",
                                evaluationResult.unescoScores.competency_2_score === 3 ? "bg-green-100 text-green-800" :
                                evaluationResult.unescoScores.competency_2_score === 2 ? "bg-blue-100 text-blue-800" :
                                evaluationResult.unescoScores.competency_2_score === 1 ? "bg-yellow-100 text-yellow-800" :
                                "bg-gray-100 text-gray-800"
                              )}>
                                {evaluationResult.unescoScores.competency_2_score}/3
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Evidence:</span> {evaluationResult.unescoScores.competency_2_evidence}
                            </p>
                          </div>

                          {/* Competency 3 */}
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-semibold text-gray-800">Application of AI Tools</h5>
                              <span className={classNames(
                                "px-3 py-1 rounded-full text-sm font-bold",
                                evaluationResult.unescoScores.competency_3_score === 3 ? "bg-green-100 text-green-800" :
                                evaluationResult.unescoScores.competency_3_score === 2 ? "bg-blue-100 text-blue-800" :
                                evaluationResult.unescoScores.competency_3_score === 1 ? "bg-yellow-100 text-yellow-800" :
                                "bg-gray-100 text-gray-800"
                              )}>
                                {evaluationResult.unescoScores.competency_3_score}/3
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Evidence:</span> {evaluationResult.unescoScores.competency_3_evidence}
                            </p>
                          </div>

                          {/* Competency 4 */}
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-semibold text-gray-800">Critical Evaluation</h5>
                              <span className={classNames(
                                "px-3 py-1 rounded-full text-sm font-bold",
                                evaluationResult.unescoScores.competency_4_score === 3 ? "bg-green-100 text-green-800" :
                                evaluationResult.unescoScores.competency_4_score === 2 ? "bg-blue-100 text-blue-800" :
                                evaluationResult.unescoScores.competency_4_score === 1 ? "bg-yellow-100 text-yellow-800" :
                                "bg-gray-100 text-gray-800"
                              )}>
                                {evaluationResult.unescoScores.competency_4_score}/3
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Evidence:</span> {evaluationResult.unescoScores.competency_4_evidence}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Improvement Advice */}
                    {evaluationResult.improvementAdvice && (
                      <div className="border-t pt-4 bg-blue-50 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
                          <Target className="h-5 w-5 mr-2" />
                          Improvement Advice:
                        </h4>
                        <div className="text-blue-900 space-y-4">
                          {evaluationResult.improvementAdvice.split('\n\n').map((section, index) => {
                            const headingMatch = section.match(/^\*\*(.+?):\*\*/);
                            if (headingMatch) {
                              const heading = headingMatch[1];
                              const content = section.substring(headingMatch[0].length).trim();
                              return (
                                <div key={index} className="space-y-2">
                                  <h5 className="font-semibold text-blue-800">{heading}:</h5>
                                  <p className="text-blue-800 text-sm leading-relaxed pl-4">{content}</p>
                                </div>
                              );
                            } else {
                              return (
                                <p key={index} className="text-blue-800 text-sm leading-relaxed">
                                  {section}
                                </p>
                              );
                            }
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Footer Button */}
                    <div className="flex justify-end pt-4">
                      <Button
                        onClick={() => setShowEvaluationModal(false)}
                        className={classNames(
                          "px-6 py-2 rounded-lg text-white",
                          evaluationResult.score === 3 ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                        )}
                      >
                        {evaluationResult.score === 3 ? "Celebrate!" : "Close"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chat History Panel */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg mb-4">
              <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xl font-semibold text-gray-900">Learning Conversation</h3>
                <div className="flex items-center gap-1.5 text-sm bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 text-indigo-700">
                  <span className="font-semibold">Scores out of 3:</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 font-bold">0</span>
                  <span>No Evidence</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300 font-bold">1</span>
                  <span>Emerging</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 font-bold">2</span>
                  <span className="font-semibold">Proficient ✓</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 font-bold">3</span>
                  <span className="font-semibold">Advanced ✓</span>
                </div>
              </div>
              <div 
                ref={chatContainerRef}
                className="p-4 space-y-4 overflow-y-auto w-full h-72"
              >
                {chatHistory.map((message, index) => (
                  <div
                    key={index}
                    className={classNames(
                      'flex flex-col space-y-2',
                      message.role === 'user' ? 'items-end' : 'items-start'
                    )}
                  >
                    <div className={classNames(
                      'flex items-start space-x-3 max-w-2xl',
                      message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    )}>
                      <div className={classNames(
                        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                        message.role === 'assistant' ? 'bg-blue-100' : 'bg-green-100'
                      )}>
                        {message.role === 'assistant' ? (
                          <Bot className="w-4 h-4 text-blue-600" />
                        ) : (
                          <User className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className={classNames(
                          'text-base font-semibold mb-1',
                          message.role === 'assistant' ? 'text-blue-600' : 'text-green-600'
                        )}>
                          {message.role === 'assistant' ? (
                            <span><strong>AI Assistant:</strong></span>
                          ) : (
                            <span><strong>You:</strong></span>
                          )}
                        </div>
                        <div className={classNames(
                          'p-3 rounded-lg',
                          message.role === 'assistant' 
                            ? 'bg-gray-100 text-gray-900' 
                            : 'bg-blue-500 text-white'
                        )}>
                          <div className="text-base leading-relaxed">
                            {message.role === 'assistant' ? (
                              <>
                                <MarkdownText text={message.content} />
                                <AIPidginCoachWrapper englishText={message.content} />
                              </>
                            ) : (
                              <p>{message.content}</p>
                            )}
                          </div>
                          <p className={classNames(
                            'text-sm mt-1',
                            message.role === 'assistant' ? 'text-gray-500' : 'text-blue-100'
                          )}>
                            {message.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {submitting && (
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-semibold mb-1 text-blue-600">
                        <strong>AI Assistant:</strong>
                      </div>
                      <div className="bg-gray-100 text-gray-900 p-3 rounded-lg">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Text fallback when TTS unavailable (e.g. no network voice in Nigeria) */}
            {fallbackText && (
              <div className="px-2 pb-2">
                <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
              </div>
            )}

            {/* Voice Controls */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* Voice Input toggle */}
              <label className="flex items-center space-x-2 bg-purple-100 border border-black px-4 py-2 rounded-md cursor-pointer">
                <input
                  type="checkbox"
                  checked={voiceInputEnabled}
                  onChange={(e) => {
                    setVoiceInputEnabled(e.target.checked);
                    if (!e.target.checked && isListening && speechRecognition) {
                      speechRecognition.stop();
                      setIsListening(false);
                      setWasListeningBeforeSubmit(false);
                    }
                  }}
                  className="accent-purple-600 w-5 h-5"
                />
                <span className="text-black font-medium text-base">Enable Voice Input</span>
              </label>
              {/* Voice Output toggle */}
              <label className="flex items-center space-x-2 bg-purple-100 border border-black px-4 py-2 rounded-md cursor-pointer">
                <input
                  type="checkbox"
                  checked={voiceOutputEnabled}
                  onChange={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
                  className="accent-purple-600 w-5 h-5"
                />
                <span className="text-black font-medium text-base">Enable Voice Output</span>
              </label>

              {/* Coach Voice Language Toggle */}
              {voiceOutputEnabled && (
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-gray-700">Coach voice:</span>
                  <div className="flex rounded-lg overflow-hidden border border-gray-400 shadow-sm">
                    <button
                      onClick={() => setVoiceMode('english')}
                      title="British English — Google UK English Female"
                      className={`flex items-center gap-1.5 px-4 py-2 text-base font-bold transition-all border-r border-gray-400
                        ${voiceMode === 'english'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                    >
                      🇬🇧 British English
                    </button>
                    <button
                      onClick={() => setVoiceMode('pidgin')}
                      title="Nigerian English / Pidgin voice"
                      className={`flex items-center gap-1.5 px-4 py-2 text-base font-bold transition-all
                        ${voiceMode === 'pidgin'
                          ? 'bg-green-600 text-white'
                          : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                    >
                      🇳🇬 Nigerian Pidgin
                    </button>
                  </div>
                  <span className="text-xs text-gray-500 italic">
                    {'Ezinne'}
                  </span>
                </div>
              )}
            </div>

            {/* User Input Panel with Voice Chat */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-4 w-full">
              <p className="text-base text-indigo-600 mb-2 flex items-center gap-1">
                <span>💡</span>
                <span>Have a question? Just ask it — the AI will answer you directly before continuing.</span>
              </p>

              {/* ── Proficient/Advanced status banner ─────────────────────── */}
              {(() => {
                const scores = extractLatestRubricScores(chatHistory);
                if (scores.length === 0) return null;
                const allAdvanced = scores.every(s => s === 3);
                const allProficient = scores.every(s => s >= 2);
                if (allAdvanced) {
                  return (
                    <div className="mb-3 flex items-start gap-3 rounded-xl bg-green-50 border border-green-300 px-4 py-3">
                      <span className="text-xl flex-shrink-0">🏆</span>
                      <div>
                        <p className="text-base font-bold text-green-800">Advanced on all criteria!</p>
                        <p className="text-sm text-green-700 mt-0.5">
                          You've reached the highest level across every criterion. There's one final step — select <strong>Complete Session</strong> below to save your results.
                        </p>
                      </div>
                    </div>
                  );
                }
                if (allProficient) {
                  return (
                    <div className="mb-3 flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                      <span className="text-xl flex-shrink-0">✅</span>
                      <div>
                        <p className="text-base font-bold text-blue-800">Proficient or higher on all criteria</p>
                        <p className="text-sm text-blue-700 mt-0.5">
                          Well done — you've met the standard on every criterion. You can keep going to push for Advanced, or select <strong>Complete Session</strong> below to save your results now.
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex items-end space-x-3">
                <div className="flex-1">
                  <div className="flex-1">
                    <SpellCheckTextarea
                      value={userInput}
                      onChange={setUserInput}
                      onKeyDown={handleKeyPress}
                      placeholder="Type your response here..."
                      className="w-full p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-24 text-base leading-relaxed"
                      disabled={submitting}
                    />
                  </div>
                </div>

                {voiceInputEnabled && (
                  <Button
                    onClick={startVoiceInput}
                    icon={<Mic size={18} />}
                    className={classNames(
                      "px-4 py-3 text-base",
                      isListening 
                        ? "bg-red-100 hover:bg-red-200 text-red-800" 
                        : "bg-blue-100 hover:bg-blue-200 text-blue-800"
                    )}
                    disabled={!speechRecognition}
                  >
                    {isListening ? 'Stop' : 'Speak'}
                  </Button>
                )}

                <Button
                  onClick={handleSubmitMessage}
                  disabled={!userInput.trim() || submitting}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 text-base"
                  icon={<Send size={18} />}
                  isLoading={submitting}
                >
                  Submit
                </Button>
              </div>
              
              {/* Action buttons row */}
              <div className="mt-3 flex flex-wrap justify-center gap-3">
                <Button
                  onClick={handleImproveEnglish}
                  disabled={!userInput.trim() || isImproving}
                  className="bg-violet-500 hover:bg-violet-600 text-white px-6 py-2 rounded-full text-base"
                  icon={<Wand2 size={18} />}
                  isLoading={isImproving}
                >
                  Improve my English
                </Button>
                <Button
                  onClick={handleSaveSession}
                  disabled={evaluating || chatHistory.length <= 1}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full text-base flex items-center gap-2"
                >
                  {evaluating
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                    : <><Save size={18} /> Save Session</>}
                </Button>
                <button
                  onClick={handleCompleteSession}
                  disabled={completingSession || chatHistory.length <= 1}
                  className={classNames(
                    'flex items-center gap-2 px-6 py-2 rounded-full text-base font-semibold transition-colors',
                    chatHistory.length > 1 && !completingSession
                      ? 'bg-pink-500 hover:bg-pink-600 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  )}
                >
                  {completingSession
                    ? <><div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Completing...</>
                    : <><CheckCircle size={18} /> Complete Session</>}
                </button>
              </div>
            </div>

            {/* ── Complete Session Modal ──────────────────────────────────── */}
            {showCompleteSessionModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-purple-600" />
                      Complete Your Session
                    </h3>
                    <button
                      onClick={() => setShowCompleteSessionModal(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="px-6 py-5 space-y-4">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      Before we save your results, take a moment to reflect on what you've worked through in this session.
                    </p>
                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">
                        What did you learn in this session? <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Be as specific and detailed as you can — what concepts clicked for you? What was hard? What would you do differently?
                      </p>
                      <textarea
                        value={sessionReflectionInput}
                        onChange={e => setSessionReflectionInput(e.target.value)}
                        rows={6}
                        placeholder="e.g. I learned that AI models learn patterns from data, not rules — so if the training data has gaps (like no examples from small farms), the AI will perform poorly in those situations. The hardest part was explaining failure modes. Next time I'd try to give more specific examples from my own context..."
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 resize-none leading-relaxed"
                        autoFocus
                      />
                      <p className="text-xs text-gray-400 mt-1 text-right">
                        {sessionReflectionInput.length} characters
                        {sessionReflectionInput.length < 80 && sessionReflectionInput.length > 0 && (
                          <span className="text-amber-600 ml-2">— a bit more detail will help your score</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-6 pb-5 flex gap-3 justify-end">
                    <button
                      onClick={() => setShowCompleteSessionModal(false)}
                      className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-full transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleCompleteSessionSubmit()}
                      disabled={sessionReflectionInput.trim().length < 20}
                      className={classNames(
                        'flex items-center gap-2 px-6 py-2 rounded-full text-sm font-semibold transition-colors',
                        sessionReflectionInput.trim().length >= 20
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      <Star size={15} /> Save &amp; Complete
                    </button>
                  </div>
                </div>
              </div>
            )}
            </div>{/* end max-w-[67%] mx-auto */}
          </div>
        </div>
      </AppLayout>
    );
  }

  // Main AI Learning Overview Interface
  return (
    <AppLayout>
      {showConfetti && <ConfettiAnimation />}
      
      <div className="min-h-screen">
        <DistortedBackground imageUrl="/AI_learning.png" />
        
        <div className="relative z-10 pl-6 pr-6 py-12">
          <div className="max-w-5xl mx-auto">
          <div className="mb-8 flex items-center justify-between">
            <div className="inline-flex flex-col items-start gap-1 rounded-lg bg-pink-100/75 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Brain className="h-12 w-12 text-purple-600" />
                <h1 className="text-5xl font-extrabold text-gray-900">
                  {uiText.pageTitle}
                </h1>
              </div>
              <p className="text-gray-800 text-xl">
                {uiText.pageSubtitle}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Tutorial link */}
              <a
                href="https://youtu.be/LwxDIOKXdjI"
                target="_blank"
                rel="noopener noreferrer"
                title="Watch video tutorial"
                className="flex items-center gap-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                Tutorial
              </a>

              <Button
                onClick={refreshDashboard}
                variant="outline"
                size="sm"
                icon={<RefreshCw size={16} />}
                isLoading={refreshing}
                className={classNames(
                  'bg-pink-400 text-pink-200',
                  'hover:bg-purple-900 hover:text-pink-200',
                  'border border-pink-200',
                  'disabled:opacity-60'
                )}
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {(aiLearningCategories || []).map(category => {
              const stats = getCategoryStats(category.id);
              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={classNames(
                    'flex flex-col items-start space-y-3 p-6 rounded-lg border transition-all duration-200 text-left',
                    activeCategory === category.id
                      ? 'bg-purple-100 border-purple-400 shadow-md'
                      : 'bg-white hover:shadow-md border-gray-200 hover:border-purple-200'
                  )}
                >
                  <div
                    className={classNames(
                      'p-2 rounded-lg',
                      activeCategory === category.id ? 'bg-purple-200' : 'bg-gray-100'
                    )}
                  >
                    <div
                      className={
                        activeCategory === category.id ? 'text-purple-700' : 'text-purple-600'
                      }
                    >
                      {category.icon}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 mb-1">
                      {category.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">{category.description}</p>
                    <div className="flex items-center space-x-2 text-sm">
                      <span className="text-gray-500">{stats.total} activities</span>
                      {stats.completed > 0 && (
                        <span className="text-green-600">• {stats.completed} completed</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {currentCategory && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-purple-100 rounded-lg text-purple-600">
                    {currentCategory.icon}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {currentCategory.title}
                    </h2>
                    <p className="text-base text-gray-600">{currentCategory.description}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Sub-category: {currentCategory.subCategory}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{currentStats.total}</div>
                  <div className="text-base text-blue-700">Total Activities</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">
                    {currentStats.completed}
                  </div>
                  <div className="text-base text-green-700">Completed</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-3xl font-bold text-yellow-600">
                    {currentStats.started}
                  </div>
                  <div className="text-base text-yellow-700">In Progress</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-gray-600">
                    {currentStats.notStarted}
                  </div>
                  <div className="text-base text-gray-700">Not Started</div>
                </div>
              </div>

              {currentStats.total > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                    <span>Progress in {currentCategory.title}</span>
                    <span>
                      {Math.round((currentStats.completed / currentStats.total) * 100)}% Complete
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-purple-500 h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${(currentStats.completed / currentStats.total) * 100}%`
                      }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Panel header with Create Your Own button */}
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {lvl <= 1
                    ? `${uiText.activitiesHeader} — ${currentCategory?.title}`
                    : `Learning Activities - ${currentCategory?.title}`}
                </h3>
                <p className="text-base text-gray-600 mt-1">
                  {uiText.activitiesSubtext}
                  {lvl > 1 && <> • Activities in "{currentCategory?.subCategory}" area</>}
                </p>
              </div>
              <button
                onClick={() => {
                  const catMap: Record<string, string> = {
                    'understanding-ai': 'A', 'prompt-engineering': 'B',
                    'ai-ethics': 'C', 'evaluating-outputs': 'D', 'applications': 'E',
                  };
                  setCreateForm(f => ({ ...f, category: catMap[activeCategory] || 'A' }));
                  setShowCreateActivity(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full px-5 py-2.5 text-base font-semibold transition-colors shadow-sm whitespace-nowrap ml-4"
              >
                <Plus size={16} />
                {uiText.createBtnLabel}
              </button>
            </div>

            {(() => {
              const myActivities = (currentActivities ?? []).filter(a => a.isPublic === false);
              const otherActivities = (currentActivities ?? []).filter(a => a.isPublic !== false);

              const renderRow = (activity: DashboardActivity) => {
                const overallLevel = certificationScoreToOverallLevel(activity.certification_evaluation_score);
                const isAdvancedLocked = overallLevel === 'Advanced' ||
                  (activity.progress === 'completed' && activity.certification_evaluation_score === 3);
                const scoreBadge =
                  !isAdvancedLocked && (overallLevel === 'Proficient' || overallLevel === 'Emerging')
                    ? `Current Score: ${overallLevel}`
                    : null;

                const hasScores = activity.progress !== 'not started' &&
                  (activity.certification_evaluation_score != null ||
                   activity.certification_evaluation_UNESCO_1_score != null);

                const scoreCompetencies = [
                  { label: 'Understanding of AI',  score: activity.certification_evaluation_UNESCO_1_score },
                  { label: 'Human-Centred',         score: activity.certification_evaluation_UNESCO_2_score },
                  { label: 'Application',           score: activity.certification_evaluation_UNESCO_3_score },
                  { label: 'Critical Eval',         score: activity.certification_evaluation_UNESCO_4_score },
                ].filter(c => c.score != null);

                return (
                  <div
                    key={activity.id}
                    className={classNames(
                      'relative p-6 transition-colors rounded-3xl overflow-hidden',
                      isAdvancedLocked
                        ? 'bg-green-50/80 border border-green-200 shadow-sm text-green-900 opacity-90 backdrop-blur-sm pointer-events-none cursor-not-allowed'
                        : isActivitySelectable(activity)
                        ? 'hover:bg-purple-50 cursor-pointer'
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
                            isAdvancedLocked
                              ? 'text-green-900'
                              : isActivitySelectable(activity)
                              ? 'text-purple-900'
                              : 'text-gray-900')}>
                            {activity.title}
                            {isAdvancedLocked ? (
                              <span className="ml-2 text-sm font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
                                {activity.progress === 'completed' ? 'Completed. Go to the next activity.' : 'Advanced • Locked'}
                              </span>
                            ) : scoreBadge ? (
                              <span className="ml-2 text-sm font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                {scoreBadge}
                              </span>
                            ) : null}
                            {isActivitySelectable(activity) && (
                              <span className="ml-2 text-sm text-purple-600">(Click to start)</span>
                            )}
                          </h4>
                          <div className="flex items-center space-x-2 text-base text-gray-500 mt-1">
                            <span>{activity.category_activity}</span>
                            {activity.sub_category && (<><span>•</span><span>{activity.sub_category}</span></>)}
                          </div>
                        </div>
                      </div>
                      {/* Progress badge (right-aligned) */}
                      <span className={classNames('inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0', getProgressColor(activity.progress))}>
                        {activity.progress}
                      </span>
                    </div>

                    {/* ── Scores row (only when data present) ── */}
                    {hasScores && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {/* Overall score */}
                        {activity.certification_evaluation_score != null && (
                          <span className={classNames(
                            'px-2.5 py-1 rounded-full text-xs font-bold border',
                            activity.certification_evaluation_score === 3
                              ? 'bg-green-100 text-green-800 border-green-300'
                              : activity.certification_evaluation_score === 2
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : activity.certification_evaluation_score === 1
                              ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                              : 'bg-gray-100 text-gray-800 border-gray-300'
                          )}>
                            Overall: {activity.certification_evaluation_score}/3
                          </span>
                        )}
                        {/* 4 UNESCO competency score pills */}
                        {(scoreCompetencies ?? []).map(({ label, score }) => (
                          <span
                            key={label}
                            className={classNames('px-2 py-0.5 rounded-full text-xs font-medium border', unescoScoreColor(score!))}
                            title={`${label}: ${score}/3 — ${unescoScoreLabel(score!)}`}
                          >
                            {label}: {score}/3
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ── Evidence (collapsed to one line) ── */}
                    {activity.certification_evaluation_evidence && (
                      <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5 line-clamp-2">
                        <strong className="text-gray-600">Evidence:</strong>{' '}
                        {activity.certification_evaluation_evidence}
                      </div>
                    )}

                    <div className="mt-2 flex items-center text-xs text-gray-500">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>Updated {new Date(activity.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              };

              if (currentActivities.length === 0) {
                return (
                  <div className="p-6 text-center">
                    <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">No activities found for {currentCategory?.title}</p>
                    <p className="text-sm text-gray-500 mb-4">
                      AI Learning activities with sub-category "{currentCategory?.subCategory}" will appear here
                    </p>
                    <Button onClick={refreshDashboard} icon={<RefreshCw size={16} />} isLoading={refreshing}>
                      Refresh Activities
                    </Button>
                  </div>
                );
              }

              return (
                <>
                  {/* ── Your Created Learning Modules ───────────────── */}
                  {myActivities.length > 0 && (
                    <div>
                      <div className="px-6 py-3 bg-purple-50 border-b border-purple-100">
                        <h4 className="text-sm font-bold text-purple-800 uppercase tracking-wide">
                          Your Created Learning Modules
                        </h4>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {(myActivities ?? []).map(renderRow)}
                      </div>
                    </div>
                  )}

                  {/* ── Other Learning Modules ──────────────────────── */}
                  {otherActivities.length > 0 && (
                    <div>
                      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-baseline gap-2">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                          Other Learning Modules
                        </h4>
                        <span className="text-xs text-gray-500 italic">…good for practice</span>
                      </div>
                      <div className="divide-y divide-gray-200">
                        {(otherActivities ?? []).map(renderRow)}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>{/* end activities panel */}
          </div>{/* end max-w-5xl centering wrapper */}
        </div>
      </div>
    </AppLayout>
  );
};

export default AILearningPage;