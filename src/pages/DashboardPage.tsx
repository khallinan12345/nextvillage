// Updated DashboardPage.tsx with reorganized layout + Monthly Summary
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Project, Team, UserProfile } from '../types/supabase';
import {
  Plus,
  Clock,
  CheckCircle,
  Briefcase,
  Users,
  Book,
  Code as CodeIcon,
  Award,
  AlertCircle,
  Target,
  Star,
  RefreshCw,
  Trophy,
  GraduationCap,
  ArrowRight,
  Download,
  Globe2,
  TrendingUp,
  BarChart3,
  Brain,
  Lightbulb,
  MessageSquare,
  Zap,
  Activity,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  BookOpen,
  Calendar,
  Sparkles,
  Newspaper,
  X as XIcon,
} from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import classNames from 'classnames';

// ─── Community AI Challenge types ────────────────────────────────────────────

interface WeeklyChallenge {
  id: string;
  title: string;
  description: string;
  community_impact_slug: string;
  tier_target: string;
  week_end: string;
  challenge_mode_intro: string;
  challenge_instruction: string;
  return_question_1: string;
  return_question_2: string;
  return_question_3: string | null;
}

interface CommunityLeaderEntry {
  learner_id: string;
  name: string;
  avatar_url: string | null;
  highest_tier: string;
  highest_tier_label: string;
  total_actions: number;
  rank: number;
  seed_count: number;
  scout_count: number;
  bridge_count: number;
  builder_count: number;
  multiplier_count: number;
}

// ─── Grand Challenge types ───────────────────────────────────────────────────

interface GrandChallenge {
  quarter: string;
  start_date: string;
  submission_deadline: string;
  winner_announced_date: string;
  active: boolean;
}

interface GrandSubmission {
  id: string;
  quarter: string;
  title: string;
  status: 'draft' | 'submitted' | 'evaluated' | 'awarded' | 'expired';
  journal_entry_count: number;
  weeks_documented: number;
  tier_awarded: string | null;
  is_quarter_winner: boolean;
  impact_arc: string;
  community_impact_slug: string;
  community_member_name: string | null;
}

interface PastChallenge {
  id: string;
  title: string;
  description: string;
  community_impact_slug: string;
  tier_target: string;
  week_start: string;
  week_end: string;
  winner_name: string | null;
  winner_id: string | null;
  winner_reason: string | null;
  winner_tier: string | null;
}

interface PastChallengeLeaderEntry {
  learner_id: string;
  name: string;
  highest_tier: string;
  highest_tier_label: string;
  total_actions: number;
  rank: number;
}

interface PastCohortLeaderboard {
  month: string; // e.g. "2025-03"
  label: string; // e.g. "March 2025"
  entries: LeaderboardEntry[];
}

const TIER_COLOURS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  seed:       { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-300',  dot: 'bg-green-500'   },
  scout:      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-300',   dot: 'bg-blue-500'    },
  bridge:     { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-300',  dot: 'bg-amber-500'   },
  builder:    { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-300',    dot: 'bg-red-500'     },
  multiplier: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-300', dot: 'bg-purple-500'  },
};

const SLUG_TO_PATH: Record<string, string> = {
  'ai-ambassadors':  '/community-impact/ai-ambassadors',
  'agriculture':     '/community-impact/agriculture',
  'fishing':         '/community-impact/fishing',
  'healthcare':      '/community-impact/healthcare',
  'entrepreneurship':'/community-impact/entrepreneurship',
  'animal-husbandry':'/community-impact/animal-husbandry',
};

const SLUG_EMOJI: Record<string, string> = {
  'ai-ambassadors':   '🤖',
  'agriculture':      '🌱',
  'fishing':          '🎣',
  'healthcare':       '🏥',
  'entrepreneurship': '💼',
  'animal-husbandry': '🐾',
};

const TIER_LABELS_MAP: Record<string, string> = {
  seed:       'Community Teacher',
  scout:      'Problem Finder',
  bridge:     'Community Connector',
  builder:    'AI for Good',
  multiplier: 'Village Leader',
};

// Add interface for dashboard activities with sub_category
interface DashboardActivity {
  id: string;
  user_id: string;
  learning_module_id: string;
  activity: string;
  title: string;
  category_activity: string;
  sub_category?: string;
  progress: 'not started' | 'started' | 'completed';
  evaluation_score?: number;
  evaluation_evidence?: string;
  created_at: string;
  updated_at: string;
  certificate_pdf_url?: string | null;
  certification_evaluation_score?: number | null;
  certification_evaluation_evidence?: string | null;
  certification_evaluation_UNESCO_1_score?: number | null;
  certification_evaluation_UNESCO_1_evidence?: string | null;
  certification_evaluation_UNESCO_2_score?: number | null;
  certification_evaluation_UNESCO_2_evidence?: string | null;
  certification_evaluation_UNESCO_3_score?: number | null;
  certification_evaluation_UNESCO_3_evidence?: string | null;
  certification_evaluation_UNESCO_4_score?: number | null;
  certification_evaluation_UNESCO_4_evidence?: string | null;
  certification_ai_proficiency_understanding_ai_score?: number | null;
  certification_ai_proficiency_understanding_ai_evidence?: string | null;
  certification_ai_proficiency_application_of_ai_score?: number | null;
  certification_ai_proficiency_application_of_ai_evidence?: string | null;
  certification_ai_proficiency_ethics_responsibility_score?: number | null;
  certification_ai_proficiency_ethics_responsibility_evidence?: string | null;
  certification_ai_proficiency_verification_bias_score?: number | null;
  certification_ai_proficiency_verification_bias_evidence?: string | null;
  certification_vibe_coding_problem_decomposition_score?: number | null;
  certification_vibe_coding_problem_decomposition_evidence?: string | null;
  certification_vibe_coding_prompt_engineering_score?: number | null;
  certification_vibe_coding_prompt_engineering_evidence?: string | null;
  certification_vibe_coding_ai_output_evaluation_score?: number | null;
  certification_vibe_coding_ai_output_evaluation_evidence?: string | null;
  certification_evaluation_vibe_coding_problem_decomposition_scor?: number | null;
  certification_evaluation_vibe_coding_problem_decomposition_evid?: string | null;
  certification_evaluation_vibe_coding_prompt_engineering_score?: number | null;
  certification_evaluation_vibe_coding_prompt_engineering_evidenc?: string | null;
  certification_evaluation_vibe_coding_ai_output_evaluation_score?: number | null;
  certification_evaluation_vibe_coding_ai_output_evaluation_evide?: string | null;
  certification_evaluation_vibe_coding_metacognitive_control_scor?: number | null;
  certification_evaluation_vibe_coding_metacognitive_control_evid?: string | null;
  certification_critical_thinking_claim_evaluation_score?: number | null;
  certification_critical_thinking_claim_evaluation_evidence?: string | null;
  certification_critical_thinking_reasoning_trace_score?: number | null;
  certification_critical_thinking_reasoning_trace_evidence?: string | null;
  certification_critical_thinking_logical_reasoning_score?: number | null;
  certification_critical_thinking_logical_reasoning_evidence?: string | null;
  certification_critical_thinking_reflection_score?: number | null;
  certification_critical_thinking_reflection_evidence?: string | null;
  certification_evaluation_critical_thinking_logical_reasoning_sc?: number | null;
  certification_evaluation_critical_thinking_logical_reasoning_ev?: string | null;
  certification_evaluation_critical_thinking_reflection_score?: number | null;
  certification_evaluation_critical_thinking_reflection_evidence?: string | null;
  certification_problem_solving_problem_definition_score?: number | null;
  certification_problem_solving_problem_definition_evidence?: string | null;
  certification_problem_solving_iteration_score?: number | null;
  certification_problem_solving_iteration_evidence?: string | null;
  certification_problem_solving_outcome_measurement_score?: number | null;
  certification_problem_solving_outcome_measurement_evidence?: string | null;
  certification_evaluation_problem_solving_problem_definition_sco?: number | null;
  certification_evaluation_problem_solving_problem_definition_evi?: string | null;
  certification_evaluation_problem_solving_iteration_score?: number | null;
  certification_evaluation_problem_solving_iteration_evidence?: string | null;
  certification_creativity_creative_iteration_score?: number | null;
  certification_creativity_creative_iteration_evidence?: string | null;
  certification_creativity_originality_score?: number | null;
  certification_creativity_originality_evidence?: string | null;
  certification_creativity_exploration_score?: number | null;
  certification_creativity_exploration_evidence?: string | null;
  certification_evaluation_creativity_originality_score?: number | null;
  certification_evaluation_creativity_originality_evidence?: string | null;
  certification_evaluation_creativity_risk_and_exploration_score?: number | null;
  certification_evaluation_creativity_risk_and_exploration_eviden?: string | null;
  certification_communication_clarity_score?: number | null;
  certification_communication_clarity_evidence?: string | null;
  certification_communication_listening_response_score?: number | null;
  certification_communication_listening_response_evidence?: string | null;
  certification_communication_synthesis_score?: number | null;
  certification_communication_synthesis_evidence?: string | null;
  certification_evaluation_communication_clarity_score?: number | null;
  certification_evaluation_communication_clarity_evidence?: string | null;
  certification_evaluation_communication_listening_and_response_s?: number | null;
  certification_evaluation_communication_listening_and_response_e?: string | null;
  certification_digital_fluency_device_file_control_score?: number | null;
  certification_digital_fluency_device_file_control_evidence?: string | null;
  certification_digital_fluency_internet_navigation_score?: number | null;
  certification_digital_fluency_internet_navigation_evidence?: string | null;
  certification_digital_fluency_troubleshooting_score?: number | null;
  certification_digital_fluency_troubleshooting_evidence?: string | null;
  certification_evaluation_device_familiarity_and_control_score?: number | null;
  certification_evaluation_device_familiarity_and_control_evidenc?: string | null;
  certification_evaluation_typing_and_text_entry_score?: number | null;
  certification_evaluation_typing_and_text_entry_evidence?: string | null;
  certification_evaluation_file_and_application_management_score?: number | null;
  certification_evaluation_file_and_application_management_eviden?: string | null;
  certification_evaluation_internet_navigation_score?: number | null;
  certification_evaluation_internet_navigation_evidence?: string | null;
  certification_evaluation_online_research_and_information_use_sc?: number | null;
  certification_evaluation_online_research_and_information_use_ev?: string | null;
  certification_evaluation_digital_safety_and_responsibility_scor?: number | null;
  certification_evaluation_digital_safety_and_responsibility_evid?: string | null;
  certification_evaluation_basic_troubleshooting_and_resilience_s?: number | null;
  certification_evaluation_basic_troubleshooting_and_resilience_e?: string | null;
  [key: string]: any;
}

// Interface for certification progress
interface CertificationProgress {
  certificationName: string;
  displayName: string;
  totalAssessments: number;
  completedAssessments: number;
  progress: 'not started' | 'started' | 'completed';
  route: string;
  updated_at?: string;
}

// ── Monthly Assessment interface ─────────────────────────────────────────
interface MonthlyAssessment {
  id: string;
  user_id: string;
  measured_at: string;
  cognitive_score: number | null;
  cognitive_evidence: any;
  critical_thinking_score: number | null;
  critical_thinking_evidence: any;
  problem_solving_score: number | null;
  problem_solving_evidence: any;
  creativity_score: number | null;
  creativity_evidence: any;
  pue_score: number | null;
  pue_evidence: any;
  session_count: number | null;
  engaged_session_count: number | null;
  avg_words_per_session: number | null;
  pue_energy_constraint_pct: number | null;
  pue_market_pricing_pct: number | null;
  pue_battery_load_pct: number | null;
  pue_enterprise_planning_pct: number | null;
  pue_learner_initiated_pct: number | null;
  pue_ai_introduced_pct: number | null;
  pue_multi_domain_pct: number | null;
  pue_local_context_pct: number | null;
  pue_summary: string | null;
  scaffold_clarification_per_session: number | null;
  scaffold_decomposition_per_session: number | null;
  scaffold_correction_total_per_session: number | null;
  scaffold_convergence_trend: string | null;
  scaffold_convergence_narrative: string | null;
  scaffold_narrative: string | null;
  reasoning_definitional_pct: number | null;
  reasoning_responsive_pct: number | null;
  reasoning_elaborative_pct: number | null;
  reasoning_structured_pct: number | null;
  reasoning_chain_count: number | null;
  metacog_verification_rate: number | null;
  metacog_reactive_rate: number | null;
  metacog_strategic_rate: number | null;
  metacog_narrative: string | null;
  role_teaching_intent_count: number | null;
  role_community_application_count: number | null;
  role_enterprise_orientation_count: number | null;
  role_intergenerational_count: number | null;
  role_readiness_narrative: string | null;
  role_readiness_signals: string[] | null;
  enterprise_artifact_score: number | null;
  ai_playground_session_count: number | null;
  ai_playground_word_count: number | null;
  ai_playground_summary: string | null;
  ai_prof_application_score: number | null;
  ai_prof_ethics_score: number | null;
  ai_prof_understanding_score: number | null;
  ai_prof_verification_score: number | null;
  ai_prof_min_score: number | null;
  ai_prof_cert_level: string | null;
  ai_prof_gpt_narrative: string | null;
  cert_attempted_count: number | null;
  cert_passed_count: number | null;
  cert_names_attempted: string[] | null;
  cert_names_passed: string[] | null;
  cert_avg_score: number | null;
  cert_summary: string | null;
  ci_training_sessions_total: number | null;
  ci_certs_passed_count: number | null;
  ci_summary: string | null;
  assessment_model: string | null;
  assessment_version: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

interface DashboardData {
  projects: Project[];
  team?: Team & { profiles: UserProfile[] };
  dashboardActivities: DashboardActivity[];
  certifications: CertificationProgress[];
  dashboardSummary?: {
    total_activities: number;
    completed: number;
    started: number;
  };
  certificationSummary?: {
    total_certifications: number;
    completed_certifications: number;
    started_certifications: number;
  };
}

// ── Leaderboard ────────────────────────────────────────────────────────────
type LeaderboardMetric =
  | 'sessions_alltime'
  | 'sessions_thismonth'
  | 'certs_achieved'
  | 'certs_attempted';

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  value: number;
}

const LEADERBOARD_OPTIONS: { value: LeaderboardMetric; label: string }[] = [
  { value: 'sessions_alltime',   label: '💬 Most Sessions — All Time' },
  { value: 'sessions_thismonth', label: '📅 Most Sessions — This Month' },
  { value: 'certs_achieved',     label: '🏆 Certifications Achieved' },
  { value: 'certs_attempted',    label: '🎯 Certifications Attempted' },
];

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

// ── Helper: Score bar component ────────────────────────────────────────────
const ScoreBar: React.FC<{
  label: string;
  score: number | null;
  maxScore?: number;
  icon?: React.ReactNode;
  colorClass?: string;
}> = ({ label, score, maxScore = 100, icon, colorClass = 'bg-blue-500' }) => {
  const pct = score != null ? Math.min((Number(score) / maxScore) * 100, 100) : 0;
  const displayScore = score != null ? Number(score).toFixed(1) : '—';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="font-semibold text-gray-900">{displayScore}{score != null ? `/${maxScore}` : ''}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={classNames('h-2.5 rounded-full transition-all duration-500', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// ── Helper: Stat pill ──────────────────────────────────────────────────────
const StatPill: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  bgClass?: string;
}> = ({ label, value, sub, icon, bgClass = 'bg-gray-50' }) => (
  <div className={classNames('rounded-lg p-3 border border-gray-200 text-center', bgClass)}>
    {icon && <div className="flex justify-center mb-1">{icon}</div>}
    <div className="text-xl font-bold text-gray-900">{value}</div>
    <div className="text-xs font-medium text-gray-600">{label}</div>
    {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

// ── Helper: convergence trend badge ────────────────────────────────────────
const trendBadge = (trend: string | null) => {
  if (!trend) return null;
  const t = trend.toLowerCase();
  const color =
    t === 'improving' || t === 'converging' ? 'bg-green-100 text-green-800 border-green-300' :
    t === 'stable' || t === 'steady' ? 'bg-blue-100 text-blue-800 border-blue-300' :
    t === 'declining' || t === 'diverging' ? 'bg-red-100 text-red-800 border-red-300' :
    'bg-gray-100 text-gray-700 border-gray-300';
  return (
    <span className={classNames('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', color)}>
      {trend}
    </span>
  );
};

// ───────────────────────────────────────────────────────────────────────────

// ── News banner ───────────────────────────────────────────────────────────────
interface NewsItem {
  id: number;
  title: string;
  body: string;
  link?: string;
  link_label?: string;
  emoji?: string;
  created_at: string;
  organization_ids: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData>({
    projects: [],
    dashboardActivities: [],
    certifications: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [downloadingCert, setDownloadingCert] = useState<string | null>(null);
  const [selectedActivityForDetails, setSelectedActivityForDetails] = useState<DashboardActivity | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Monthly assessment state
  const [monthlyAssessment, setMonthlyAssessment] = useState<MonthlyAssessment | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlySectionExpanded, setMonthlySectionExpanded] = useState(true);

  // Leaderboard
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>('sessions_thismonth');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // ── Community AI Challenge state ─────────────────────────────────────────
  const [weeklyChallenge, setWeeklyChallenge]         = useState<WeeklyChallenge | null>(null);
  const [challengeLoading, setChallengeLoading]       = useState(false);
  const [enrollmentStatus, setEnrollmentStatus]       = useState<'none' | 'active' | 'submitted' | 'awarded'>('none');
  const [, setEnrollmentId]                           = useState<string | null>(null);
  const [enrolling, setEnrolling]                     = useState(false);
  const [communityLeaderboard, setCommunityLeaderboard] = useState<CommunityLeaderEntry[]>([]);
  const [communityLbLoading, setCommunityLbLoading]   = useState(false);

  // ── Grand Challenge state ─────────────────────────────────────────────────
  const [grandChallenge, setGrandChallenge]           = useState<GrandChallenge | null>(null);
  const [grandSubmission, setGrandSubmission]         = useState<GrandSubmission | null>(null);
  const [grandLoading, setGrandLoading]               = useState(false);
  const [grandSaving, setGrandSaving]                 = useState(false);
  const [grandDraftTitle, setGrandDraftTitle]         = useState('');
  const [grandDraftArc, setGrandDraftArc]             = useState('');
  const [grandDraftSlug, setGrandDraftSlug]           = useState('agriculture');
  const [grandJournalCount, setGrandJournalCount]     = useState(0);
  const [grandWeeksActive, setGrandWeeksActive]       = useState(0);
  const [grandShowInstructions, setGrandShowInstructions] = useState(false);
  const [priorSubmissions, setPriorSubmissions]       = useState<GrandSubmission[]>([]);

  // ── Past challenge history state ─────────────────────────────────────────
  const [pastChallenges, setPastChallenges]           = useState<PastChallenge[]>([]);
  const [showPastChallenges, setShowPastChallenges]   = useState(false);
  const [pastChallengeLeaderboards, setPastChallengeLeaderboards] = useState<Record<string, PastChallengeLeaderEntry[]>>({});
  const [expandedPastChallenge, setExpandedPastChallenge] = useState<string | null>(null);
  const [pastCohortLeaderboards, setPastCohortLeaderboards] = useState<PastCohortLeaderboard[]>([]);
  const [showPastCohortLb, setShowPastCohortLb]       = useState(false);
  const [pastCohortLoading, setPastCohortLoading]     = useState(false);

  // ── News banner state ─────────────────────────────────────────────────────
  const [newsItems, setNewsItems]       = useState<NewsItem[]>([]);
  const [newsDismissed, setNewsDismissed] = useState(false);
  const [newsIndex, setNewsIndex]       = useState(0);
  const navigate = useNavigate();
  const [orgOptions, setOrgOptions] = useState<{ id: string; name: string; join_code: string }[]>([]);
  const [selectedOrgJoinCode, setSelectedOrgJoinCode] = useState<string>('');
  const [leaderJoinCode, setLeaderJoinCode] = useState<string>('');
  
  const fetchingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const getCertificationRoute = (certName: string): string => {
    const routeMap: Record<string, string> = {
      'ai_proficiency': '/certifications/ai-proficiency',
      'vibe_coding': '/certifications/ai-ready-skills',
      'critical_thinking': '/certifications/ai-ready-skills',
      'creativity': '/certifications/ai-ready-skills',
      'communication': '/certifications/ai-ready-skills',
      'problem_solving': '/certifications/ai-ready-skills',
      'digital_fluency': '/certifications/ai-ready-skills'
    };
    return routeMap[certName] || '/certifications/ai-ready-skills';
  };

  const getScoreLabel = (score: number | null, isCertification: boolean): string => {
    if (score == null) return 'Not Assessed';
    if (isCertification) {
      const labels = ['No Evidence', 'Emerging', 'Proficient ✓', 'Advanced ✓'];
      return labels[score] || 'Unknown';
    } else {
      const labels = ['', 'Emerging', 'Developing', 'Competent', 'Advanced'];
      return labels[score] || 'Unknown';
    }
  };

  const getActivityScores = (activity: DashboardActivity): { dimension: string; score: number | null; evidence: string | null; maxScore: number }[] => {
    const isCertification = activity.category_activity === 'Certification';
    let subCat = activity.sub_category;
    const cat = activity.category_activity;
    
    if (isCertification && !subCat && activity.activity) {
      const activityName = activity.activity.toLowerCase();
      if (activityName.includes('critical thinking')) subCat = 'Critical Thinking';
      else if (activityName.includes('vibe coding')) subCat = 'Vibe Coding';
      else if (activityName.includes('creativity')) subCat = 'Creativity';
      else if (activityName.includes('communication')) subCat = 'Communication';
      else if (activityName.includes('problem solving') || activityName.includes('problem-solving')) subCat = 'Problem Solving';
      else if (activityName.includes('digital fluency')) subCat = 'Digital Fluency';
      else if (activityName.includes('ai proficiency')) subCat = 'AI Proficiency';
    }
    
    if (cat === 'AI Learning') {
      return [
        { dimension: 'Understanding of AI', score: activity.certification_evaluation_UNESCO_1_score ?? null, evidence: activity.certification_evaluation_UNESCO_1_evidence ?? null, maxScore: 4 },
        { dimension: 'Human-Centred Mindset', score: activity.certification_evaluation_UNESCO_2_score ?? null, evidence: activity.certification_evaluation_UNESCO_2_evidence ?? null, maxScore: 4 },
        { dimension: 'Application of AI Tools', score: activity.certification_evaluation_UNESCO_3_score ?? null, evidence: activity.certification_evaluation_UNESCO_3_evidence ?? null, maxScore: 4 },
        { dimension: 'Critical Evaluation', score: activity.certification_evaluation_UNESCO_4_score ?? null, evidence: activity.certification_evaluation_UNESCO_4_evidence ?? null, maxScore: 4 },
      ];
    }
    
    if (subCat === 'Vibe Coding' || cat === 'Vibe Coding') {
      if (isCertification) {
        return [
          { dimension: 'Problem Decomposition', score: activity.certification_vibe_coding_problem_decomposition_score ?? null, evidence: activity.certification_vibe_coding_problem_decomposition_evidence ?? null, maxScore: 3 },
          { dimension: 'Prompt Engineering', score: activity.certification_vibe_coding_prompt_engineering_score ?? null, evidence: activity.certification_vibe_coding_prompt_engineering_evidence ?? null, maxScore: 3 },
          { dimension: 'AI Output Evaluation', score: activity.certification_vibe_coding_ai_output_evaluation_score ?? null, evidence: activity.certification_vibe_coding_ai_output_evaluation_evidence ?? null, maxScore: 3 },
        ];
      } else {
        return [
          { dimension: 'Problem Decomposition', score: activity.certification_evaluation_vibe_coding_problem_decomposition_scor ?? null, evidence: activity.certification_evaluation_vibe_coding_problem_decomposition_evid ?? null, maxScore: 3 },
          { dimension: 'Prompt Engineering', score: activity.certification_evaluation_vibe_coding_prompt_engineering_score ?? null, evidence: activity.certification_evaluation_vibe_coding_prompt_engineering_evidenc ?? null, maxScore: 3 },
          { dimension: 'AI Output Evaluation', score: activity.certification_evaluation_vibe_coding_ai_output_evaluation_score ?? null, evidence: activity.certification_evaluation_vibe_coding_ai_output_evaluation_evide ?? null, maxScore: 3 },
          { dimension: 'Metacognitive Control', score: activity.certification_evaluation_vibe_coding_metacognitive_control_scor ?? null, evidence: activity.certification_evaluation_vibe_coding_metacognitive_control_evid ?? null, maxScore: 3 },
        ];
      }
    } 
    else if (subCat === 'Critical Thinking' || cat === 'Critical Thinking') {
      if (isCertification) {
        return [
          { dimension: 'Claim Evaluation', score: activity.certification_critical_thinking_claim_evaluation_score ?? null, evidence: activity.certification_critical_thinking_claim_evaluation_evidence ?? null, maxScore: 3 },
          { dimension: 'Reasoning Trace', score: activity.certification_critical_thinking_reasoning_trace_score ?? null, evidence: activity.certification_critical_thinking_reasoning_trace_evidence ?? null, maxScore: 3 },
          { dimension: 'Reflection', score: activity.certification_critical_thinking_reflection_score ?? null, evidence: activity.certification_critical_thinking_reflection_evidence ?? null, maxScore: 3 },
        ];
      } else {
        return [
          { dimension: 'Logical Reasoning', score: activity.certification_evaluation_critical_thinking_logical_reasoning_sc ?? null, evidence: activity.certification_evaluation_critical_thinking_logical_reasoning_ev ?? null, maxScore: 3 },
          { dimension: 'Reflection', score: activity.certification_evaluation_critical_thinking_reflection_score ?? null, evidence: activity.certification_evaluation_critical_thinking_reflection_evidence ?? null, maxScore: 3 },
        ];
      }
    } 
    else if (subCat === 'Problem-Solving' || cat === 'Problem-Solving' || cat === 'Problem Solving') {
      if (isCertification) {
        return [
          { dimension: 'Problem Definition', score: activity.certification_problem_solving_problem_definition_score ?? null, evidence: activity.certification_problem_solving_problem_definition_evidence ?? null, maxScore: 3 },
          { dimension: 'Iteration', score: activity.certification_problem_solving_iteration_score ?? null, evidence: activity.certification_problem_solving_iteration_evidence ?? null, maxScore: 3 },
          { dimension: 'Outcome Measurement', score: activity.certification_problem_solving_outcome_measurement_score ?? null, evidence: activity.certification_problem_solving_outcome_measurement_evidence ?? null, maxScore: 3 },
        ];
      } else {
        return [
          { dimension: 'Problem Definition', score: activity.certification_evaluation_problem_solving_problem_definition_sco ?? null, evidence: activity.certification_evaluation_problem_solving_problem_definition_evi ?? null, maxScore: 3 },
          { dimension: 'Iteration', score: activity.certification_evaluation_problem_solving_iteration_score ?? null, evidence: activity.certification_evaluation_problem_solving_iteration_evidence ?? null, maxScore: 3 },
        ];
      }
    } 
    else if (subCat === 'Creativity' || cat === 'Creativity') {
      if (isCertification) {
        return [
          { dimension: 'Creative Iteration', score: activity.certification_creativity_creative_iteration_score ?? null, evidence: activity.certification_creativity_creative_iteration_evidence ?? null, maxScore: 3 },
          { dimension: 'Exploration', score: activity.certification_creativity_exploration_score ?? null, evidence: activity.certification_creativity_exploration_evidence ?? null, maxScore: 3 },
          { dimension: 'Originality', score: activity.certification_creativity_originality_score ?? null, evidence: activity.certification_creativity_originality_evidence ?? null, maxScore: 3 },
        ];
      } else {
        return [
          { dimension: 'Originality', score: activity.certification_evaluation_creativity_originality_score ?? null, evidence: activity.certification_evaluation_creativity_originality_evidence ?? null, maxScore: 3 },
          { dimension: 'Risk & Exploration', score: activity.certification_evaluation_creativity_risk_and_exploration_score ?? null, evidence: activity.certification_evaluation_creativity_risk_and_exploration_eviden ?? null, maxScore: 3 },
        ];
      }
    } 
    else if (subCat === 'Communication' || cat === 'Communication') {
      if (isCertification) {
        return [
          { dimension: 'Clarity', score: activity.certification_communication_clarity_score ?? null, evidence: activity.certification_communication_clarity_evidence ?? null, maxScore: 3 },
          { dimension: 'Listening & Response', score: activity.certification_communication_listening_response_score ?? null, evidence: activity.certification_communication_listening_response_evidence ?? null, maxScore: 3 },
          { dimension: 'Synthesis', score: activity.certification_communication_synthesis_score ?? null, evidence: activity.certification_communication_synthesis_evidence ?? null, maxScore: 3 },
        ];
      } else {
        return [
          { dimension: 'Clarity', score: activity.certification_evaluation_communication_clarity_score ?? null, evidence: activity.certification_evaluation_communication_clarity_evidence ?? null, maxScore: 3 },
          { dimension: 'Listening & Response', score: activity.certification_evaluation_communication_listening_and_response_s ?? null, evidence: activity.certification_evaluation_communication_listening_and_response_e ?? null, maxScore: 3 },
        ];
      }
    } 
    else if (subCat === 'Digital Fluency' || cat === 'Digital Fluency') {
      if (isCertification) {
        return [
          { dimension: 'Device & File Control', score: activity.certification_digital_fluency_device_file_control_score ?? null, evidence: activity.certification_digital_fluency_device_file_control_evidence ?? null, maxScore: 3 },
          { dimension: 'Internet Navigation', score: activity.certification_digital_fluency_internet_navigation_score ?? null, evidence: activity.certification_digital_fluency_internet_navigation_evidence ?? null, maxScore: 3 },
          { dimension: 'Troubleshooting', score: activity.certification_digital_fluency_troubleshooting_score ?? null, evidence: activity.certification_digital_fluency_troubleshooting_evidence ?? null, maxScore: 3 },
        ];
      } else {
        return [
          { dimension: 'Device Familiarity', score: activity.certification_evaluation_device_familiarity_and_control_score ?? null, evidence: activity.certification_evaluation_device_familiarity_and_control_evidenc ?? null, maxScore: 3 },
          { dimension: 'Typing & Text Entry', score: activity.certification_evaluation_typing_and_text_entry_score ?? null, evidence: activity.certification_evaluation_typing_and_text_entry_evidence ?? null, maxScore: 3 },
          { dimension: 'File & App Management', score: activity.certification_evaluation_file_and_application_management_score ?? null, evidence: activity.certification_evaluation_file_and_application_management_eviden ?? null, maxScore: 3 },
          { dimension: 'Internet Navigation', score: activity.certification_evaluation_internet_navigation_score ?? null, evidence: activity.certification_evaluation_internet_navigation_evidence ?? null, maxScore: 3 },
          { dimension: 'Online Research', score: activity.certification_evaluation_online_research_and_information_use_sc ?? null, evidence: activity.certification_evaluation_online_research_and_information_use_ev ?? null, maxScore: 3 },
          { dimension: 'Digital Safety', score: activity.certification_evaluation_digital_safety_and_responsibility_scor ?? null, evidence: activity.certification_evaluation_digital_safety_and_responsibility_evid ?? null, maxScore: 3 },
          { dimension: 'Troubleshooting', score: activity.certification_evaluation_basic_troubleshooting_and_resilience_s ?? null, evidence: activity.certification_evaluation_basic_troubleshooting_and_resilience_e ?? null, maxScore: 3 },
        ];
      }
    }
    else if (subCat === 'AI Proficiency' || cat === 'AI Proficiency') {
      if (isCertification) {
        return [
          { dimension: 'Understanding AI', score: activity.certification_ai_proficiency_understanding_ai_score ?? null, evidence: activity.certification_ai_proficiency_understanding_ai_evidence ?? null, maxScore: 3 },
          { dimension: 'Application of AI', score: activity.certification_ai_proficiency_application_of_ai_score ?? null, evidence: activity.certification_ai_proficiency_application_of_ai_evidence ?? null, maxScore: 3 },
          { dimension: 'Ethics & Responsibility', score: activity.certification_ai_proficiency_ethics_responsibility_score ?? null, evidence: activity.certification_ai_proficiency_ethics_responsibility_evidence ?? null, maxScore: 3 },
          { dimension: 'Verification & Bias', score: activity.certification_ai_proficiency_verification_bias_score ?? null, evidence: activity.certification_ai_proficiency_verification_bias_evidence ?? null, maxScore: 3 },
        ];
      } else {
        return [
          { dimension: 'Understanding of AI', score: activity.certification_evaluation_UNESCO_1_score ?? null, evidence: activity.certification_evaluation_UNESCO_1_evidence ?? null, maxScore: 4 },
          { dimension: 'Human-Centred Mindset', score: activity.certification_evaluation_UNESCO_2_score ?? null, evidence: activity.certification_evaluation_UNESCO_2_evidence ?? null, maxScore: 4 },
          { dimension: 'Application of AI Tools', score: activity.certification_evaluation_UNESCO_3_score ?? null, evidence: activity.certification_evaluation_UNESCO_3_evidence ?? null, maxScore: 4 },
          { dimension: 'Critical Evaluation', score: activity.certification_evaluation_UNESCO_4_score ?? null, evidence: activity.certification_evaluation_UNESCO_4_evidence ?? null, maxScore: 4 },
        ];
      }
    }
    
    return [];
  };

  const hasScores = (activity: DashboardActivity): boolean => {
    if (activity.progress === 'not started') return false;
    const scores = getActivityScores(activity);
    return scores.some(s => s.score != null);
  };

  const extractCertificationProgress = (dashboardRows: any[]): CertificationProgress[] => {
    const certMap = new Map<string, { scores: (number | null)[], updated: string }>();
    
    const knownCerts = [
      'ai_proficiency', 'vibe_coding', 'critical_thinking',
      'creativity', 'communication', 'problem_solving', 'digital_fluency'
    ];

    const expectedAssessments: Record<string, number> = {
      'ai_proficiency': 4, 'vibe_coding': 3, 'critical_thinking': 3,
      'creativity': 3, 'communication': 3, 'problem_solving': 3, 'digital_fluency': 3
    };

    const certificationRows = dashboardRows.filter(row => row.category_activity === 'Certification');

    certificationRows.forEach(row => {
      for (const [key, value] of Object.entries(row)) {
        if (!key.startsWith('certification_') || !key.endsWith('_score')) continue;
        const parts = key.split('_');
        if (parts.length >= 2 && parts[1] === 'evaluation') continue;
        
        for (const certName of knownCerts) {
          if (key.startsWith(`certification_${certName}_`)) {
            if (!certMap.has(certName)) {
              certMap.set(certName, { scores: [], updated: row.updated_at || '' });
            }
            certMap.get(certName)!.scores.push(value as number | null);
            break;
          }
        }
      }
    });

    const certifications: CertificationProgress[] = [];
    
    certMap.forEach((data, certName) => {
      const totalAssessments = expectedAssessments[certName] || data.scores.length;
      const completedAssessments = data.scores.filter(s => s !== null && s >= 2).length;
      const attemptedAssessments = data.scores.filter(s => s !== null).length;
      
      let progress: 'not started' | 'started' | 'completed' = 'not started';
      if (completedAssessments === totalAssessments && completedAssessments > 0) {
        progress = 'completed';
      } else if (attemptedAssessments > 0) {
        progress = 'started';
      }

      const formatName = (str: string) => {
        return str.split('_').map(word => {
          if (word.toLowerCase() === 'ai') return 'AI';
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
      };

      certifications.push({
        certificationName: certName,
        displayName: formatName(certName) + ' Certification',
        totalAssessments, completedAssessments, progress,
        route: getCertificationRoute(certName),
        updated_at: data.updated
      });
    });

    return certifications.sort((a, b) => a.displayName.localeCompare(b.displayName));
  };

  const getProgressColor = (progress: string) => {
    switch (progress) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'started': return 'bg-yellow-100 text-yellow-800';
      case 'not started': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    const iconProps = { size: 16, className: "text-blue-600" };
    switch (category?.toLowerCase()) {
      case 'coding': case 'programming': case 'digital-fluency':
        return <CodeIcon {...iconProps} className="text-blue-600" />;
      case 'vibe coding': case 'tech workshop':
        return <CodeIcon {...iconProps} className="text-pink-600" />;
      case 'entrepreneurship':
        return <Briefcase {...iconProps} className="text-green-600" />;
      case 'teamwork': case 'communication':
        return <Users {...iconProps} className="text-purple-600" />;
      case 'learning': case 'education': case 'critical-thinking':
        return <Book {...iconProps} className="text-orange-600" />;
      case 'creative-expression':
        return <Award {...iconProps} className="text-pink-600" />;
      case 'problem-solving':
        return <Target {...iconProps} className="text-red-600" />;
      case 'logical-reasoning':
        return <Star {...iconProps} className="text-indigo-600" />;
      case 'certification':
        return <Trophy {...iconProps} className="text-purple-600" />;
      default:
        return <Target {...iconProps} className="text-gray-600" />;
    }
  };

  const getUniqueCategories = (): string[] => {
    const categories = new Set<string>();
    data.dashboardActivities.forEach(activity => {
      if (activity.category_activity && activity.category_activity !== 'Certification' && activity.activity !== 'english_skills') {
        categories.add(activity.category_activity);
      }
    });
    return Array.from(categories).sort();
  };

  const getFilteredActivities = (): DashboardActivity[] => {
    const nonCertActivities = data.dashboardActivities.filter(
      activity => activity.category_activity !== 'Certification' && activity.activity !== 'english_skills'
    );
    if (selectedCategory === 'all') return nonCertActivities;
    return nonCertActivities.filter(activity => activity.category_activity === selectedCategory);
  };

  // ── Leaderboard fetch ────────────────────────────────────────────────────
  const resolvedJoinCode =
    ((userProfile?.role as unknown) as string) === 'platform_administrator' ? selectedOrgJoinCode :
    ((userProfile?.role as unknown) as string) === 'leader' ? leaderJoinCode :
    ((userProfile as any)?.join_code_used ?? '');

  // ── Fetch weekly challenge and enrollment status ─────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setChallengeLoading(true);
      setCommunityLbLoading(true);
      try {
        // Get learner's org via profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        // Map org UUID to slug for challenge filtering
        let orgSlug = 'oloibiri';
        if (profile?.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', profile.organization_id)
            .single();
          orgSlug = org?.name?.toLowerCase().includes('ibiade') ? 'ibiade' : 'oloibiri';
        }

        // Get active challenge for this learner's org
        const { data: challenges } = await supabase
          .from('community_challenges')
          .select('id, title, description, community_impact_slug, tier_target, week_end, challenge_mode_intro, challenge_instruction, return_question_1, return_question_2, return_question_3')
          .eq('active', true)
          .eq('org_id', orgSlug)
          .order('week_start', { ascending: false })
          .limit(1);
        const challenge = challenges?.[0] ?? null;

        if (challenge) {
          setWeeklyChallenge(challenge);

          // Check this learner's enrollment
          const { data: enrollment } = await supabase
            .from('challenge_enrollments')
            .select('id, status')
            .eq('learner_id', user.id)
            .eq('challenge_id', challenge.id)
            .maybeSingle();

          if (enrollment) {
            setEnrollmentStatus(enrollment.status as any);
            setEnrollmentId(enrollment.id);
          }
        }

        // Fetch community impact leaderboard
        const { data: lb } = await supabase
          .from('community_leaderboard')
          .select('*')
          .order('rank', { ascending: true });

        if (lb) setCommunityLeaderboard(lb as CommunityLeaderEntry[]);

        // Fetch past (inactive) challenges for this org
        const { data: pastChallengeRows } = await supabase
          .from('community_challenges')
          .select('id, title, description, community_impact_slug, tier_target, week_start, week_end, winner_name, winner_id, winner_reason, winner_tier')
          .eq('active', false)
          .eq('org_id', orgSlug)
          .order('week_start', { ascending: false })
          .limit(12);
        if (pastChallengeRows) setPastChallenges(pastChallengeRows as PastChallenge[]);
      } finally {
        setChallengeLoading(false);
        setCommunityLbLoading(false);
      }
    })();
  }, [user?.id]);

  // ── Fetch platform news ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        let orgId: string | null = null;
        if (user?.id) {
          const { data: profileData } = await supabase
            .from('profiles').select('organization_id').eq('id', user.id).single();
          orgId = profileData?.organization_id ?? null;
        }
        const { data } = await supabase
          .from('platform_news')
          .select('id,title,body,link,link_label,emoji,created_at,organization_ids')
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(20);
        if (data) {
          const filtered = data.filter((item: any) => {
            const ids: string[] = item.organization_ids ?? [];
            return ids.length === 0 || (orgId && ids.includes(orgId));
          });
          setNewsItems(filtered as NewsItem[]);
        }
      } catch { /* silent — banner is non-critical */ }
    })();
  }, [user?.id]);

  // ── Fetch Grand Challenge quarter + submission ──────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setGrandLoading(true);
      try {
        // Get active quarter
        const { data: quarter } = await supabase
          .from('grand_challenge_quarters')
          .select('*')
          .eq('active', true)
          .single();
        if (!quarter) return;
        setGrandChallenge(quarter);

        // Get learner's existing submission for this quarter
        const { data: sub } = await supabase
          .from('grand_challenge_submissions')
          .select('*')
          .eq('learner_id', user.id)
          .eq('quarter', quarter.quarter)
          .maybeSingle();

        if (sub) {
          setGrandSubmission(sub);
          setGrandDraftTitle(sub.title ?? '');
          setGrandDraftArc(sub.impact_arc ?? '');
          setGrandDraftSlug(sub.community_impact_slug ?? 'agriculture');
        }

        // Get journal entry count for this quarter
        const { count } = await supabase
          .from('community_impact_journal')
          .select('*', { count: 'exact', head: true })
          .eq('learner_id', user.id)
          .gte('visit_date', quarter.start_date)
          .lte('visit_date', quarter.submission_deadline);
        setGrandJournalCount(count ?? 0);

        // Get prior submissions for carryover
        const { data: prior } = await supabase
          .from('grand_challenge_submissions')
          .select('id, quarter, title, status, tier_awarded, journal_entry_count, weeks_documented, impact_arc, community_impact_slug, community_member_name, is_quarter_winner')
          .eq('learner_id', user.id)
          .neq('quarter', quarter.quarter)
          .in('status', ['evaluated', 'awarded'])
          .order('quarter', { ascending: false });
        setPriorSubmissions(prior ?? []);
      } finally {
        setGrandLoading(false);
      }
    })();
  }, [user?.id]);

  // ── Save grand challenge draft ────────────────────────────────────────────
  const handleSaveGrandDraft = async () => {
    if (!user?.id || !grandChallenge || !grandDraftTitle.trim()) return;
    setGrandSaving(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      let orgSlug = 'oloibiri';
      if (profile?.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', profile.organization_id)
          .single();
        orgSlug = org?.name?.toLowerCase().includes('ibiade') ? 'ibiade' : 'oloibiri';
      }

      if (grandSubmission?.id) {
        // Update existing draft
        await supabase
          .from('grand_challenge_submissions')
          .update({
            title:                 grandDraftTitle.trim(),
            impact_arc:            grandDraftArc.trim(),
            community_impact_slug: grandDraftSlug,
            updated_at:            new Date().toISOString(),
          })
          .eq('id', grandSubmission.id);
        setGrandSubmission(prev => prev ? {
          ...prev,
          title: grandDraftTitle.trim(),
          impact_arc: grandDraftArc.trim(),
        } : prev);
      } else {
        // Create new draft
        const { data: newSub } = await supabase
          .from('grand_challenge_submissions')
          .insert({
            learner_id:            user.id,
            org_id:                orgSlug,
            quarter:               grandChallenge.quarter,
            title:                 grandDraftTitle.trim(),
            impact_arc:            grandDraftArc.trim() || ' ',
            community_impact_slug: grandDraftSlug,
            status:                'draft',
            journal_entry_count:   grandJournalCount,
          })
          .select()
          .single();
        if (newSub) setGrandSubmission(newSub);
      }
    } finally { setGrandSaving(false); }
  };

  // ── Submit grand challenge ────────────────────────────────────────────────
  const handleSubmitGrandChallenge = async () => {
    if (!grandSubmission?.id || !grandDraftArc.trim()) return;
    setGrandSaving(true);
    try {
      // Count weeks active from journal entries
      const { data: entries } = await supabase
        .from('community_impact_journal')
        .select('visit_date')
        .eq('learner_id', user!.id)
        .order('visit_date', { ascending: true });

      let weeksActive = 0;
      if (entries && entries.length >= 2) {
        const first = new Date(entries[0].visit_date);
        const last  = new Date(entries[entries.length - 1].visit_date);
        weeksActive = Math.ceil((last.getTime() - first.getTime()) / (7 * 86400000)) + 1;
      }

      await supabase
        .from('grand_challenge_submissions')
        .update({
          status:              'submitted',
          submitted_at:        new Date().toISOString(),
          impact_arc:          grandDraftArc.trim(),
          title:               grandDraftTitle.trim(),
          journal_entry_count: grandJournalCount,
          weeks_documented:    weeksActive,
        })
        .eq('id', grandSubmission.id);

      setGrandSubmission(prev => prev ? { ...prev, status: 'submitted' } : prev);
    } finally { setGrandSaving(false); }
  };

  // ── Carry over prior submission to new quarter ────────────────────────────
  const handleCarryOver = async (prior: GrandSubmission) => {
    if (!grandChallenge || !user?.id) return;
    setGrandDraftTitle(prior.title + ' (continued)');
    setGrandDraftArc(prior.impact_arc
      ? `[Continuing from ${prior.quarter}]

${prior.impact_arc}

[New developments this quarter]
`
      : '');
    setGrandDraftSlug(prior.community_impact_slug);
    // Save immediately as a draft
    await handleSaveGrandDraft();
  };

  // ── Enroll in weekly challenge then navigate ──────────────────────────────
  const handleChallengeCheckout = async () => {
    if (!weeklyChallenge || !user?.id || enrolling) return;
    setEnrolling(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      // Upsert enrollment — idempotent if already enrolled
      const { data: enrollment } = await supabase
        .from('challenge_enrollments')
        .upsert({
          learner_id:   user.id,
          challenge_id: weeklyChallenge.id,
          org_id:       profile?.organization_id ?? 'oloibiri',
          status:       'active',
        }, { onConflict: 'learner_id,challenge_id', ignoreDuplicates: true })
        .select('id, status')
        .single();

      if (enrollment) {
        setEnrollmentStatus(enrollment.status as any);
        setEnrollmentId(enrollment.id);
      }

      // Navigate to the community impact page, passing enrollment state
      // so the page doesn't need to re-query (avoids race condition)
      const path = SLUG_TO_PATH[weeklyChallenge.community_impact_slug];

      // If enrollment insert returned nothing (duplicate), fetch existing row
      let enrollmentId = enrollment?.id;
      if (!enrollmentId) {
        const { data: existing } = await supabase
          .from('challenge_enrollments')
          .select('id, status')
          .eq('learner_id', user.id)
          .eq('challenge_id', weeklyChallenge.id)
          .single();
        enrollmentId = existing?.id;
        if (existing) setEnrollmentStatus(existing.status as any);
      }

      if (path) navigate(path, {
        state: {
          challengeEnrollment: {
            enrollmentId:          enrollmentId ?? '',
            challengeId:           weeklyChallenge.id,
            title:                 weeklyChallenge.title,
            description:           weeklyChallenge.description,
            challenge_mode_intro:  weeklyChallenge.challenge_mode_intro,
            challenge_instruction: weeklyChallenge.challenge_instruction,
            return_question_1:     weeklyChallenge.return_question_1,
            return_question_2:     weeklyChallenge.return_question_2,
            return_question_3:     weeklyChallenge.return_question_3,
            tier_target:           weeklyChallenge.tier_target,
          }
        }
      });
    } finally {
      setEnrolling(false);
    }
  };

  // ── Fetch leaderboard for a past challenge ───────────────────────────────
  const fetchPastChallengeLeaderboard = useCallback(async (challengeId: string) => {
    if (pastChallengeLeaderboards[challengeId]) return; // already loaded
    try {
      const { data: enrollments } = await supabase
        .from('challenge_enrollments')
        .select('learner_id, status, tier_awarded, profiles(name)')
        .eq('challenge_id', challengeId)
        .in('status', ['submitted', 'awarded', 'active'])
        .order('tier_awarded', { ascending: false });

      if (!enrollments) return;

      const TIER_ORDER: Record<string, number> = { multiplier: 5, builder: 4, bridge: 3, scout: 2, seed: 1 };
      const entries: PastChallengeLeaderEntry[] = enrollments
        .map((e: any) => ({
          learner_id: e.learner_id,
          name: e.profiles?.name ?? 'Learner',
          highest_tier: e.tier_awarded ?? 'seed',
          highest_tier_label: TIER_LABELS_MAP[e.tier_awarded ?? 'seed'] ?? e.tier_awarded ?? 'Seed',
          total_actions: 1,
          rank: 0,
        }))
        .sort((a, b) => (TIER_ORDER[b.highest_tier] ?? 0) - (TIER_ORDER[a.highest_tier] ?? 0))
        .map((e, i) => ({ ...e, rank: i + 1 }));

      setPastChallengeLeaderboards(prev => ({ ...prev, [challengeId]: entries }));
    } catch (err) {
      console.error('[PastChallengeLeaderboard] error:', err);
    }
  }, [pastChallengeLeaderboards]);

  // ── Fetch past cohort leaderboards (by month) ────────────────────────────
  const fetchPastCohortLeaderboards = useCallback(async (joinCode: string) => {
    if (!joinCode || pastCohortLeaderboards.length > 0) return;
    setPastCohortLoading(true);
    try {
      const { data: cohortProfiles } = await supabase
        .from('profiles').select('id, name')
        .eq('join_code_used', joinCode).eq('role', 'student');
      if (!cohortProfiles || cohortProfiles.length === 0) return;

      const cohortIds = cohortProfiles.map(p => p.id);
      const nameMap: Record<string, string> = {};
      cohortProfiles.forEach(p => { nameMap[p.id] = p.name; });

      const { data: rows } = await supabase
        .from('dashboard').select('user_id, progress, created_at')
        .in('user_id', cohortIds).in('progress', ['started', 'completed']);
      if (!rows) return;

      // Group by YYYY-MM
      const monthMap: Record<string, Record<string, number>> = {};
      rows.forEach(r => {
        const d = new Date(r.created_at);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        if (!monthMap[key]) monthMap[key] = {};
        monthMap[key][r.user_id] = (monthMap[key][r.user_id] || 0) + 1;
      });

      const now = new Date();
      const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      const boards: PastCohortLeaderboard[] = Object.entries(monthMap)
        .filter(([key]) => key !== currentKey)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 6)
        .map(([key, counts]) => {
          const [year, month] = key.split('-');
          const label = new Date(Number(year), Number(month) - 1, 1)
            .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          const entries: LeaderboardEntry[] = Object.entries(counts)
            .map(([uid, count]) => ({ user_id: uid, name: nameMap[uid] || 'Unknown', value: count, rank: 0 }))
            .sort((a, b) => b.value - a.value).slice(0, 10)
            .map((e, i) => ({ ...e, rank: i + 1 }));
          return { month: key, label, entries };
        });

      setPastCohortLeaderboards(boards);
    } finally {
      setPastCohortLoading(false);
    }
  }, [pastCohortLeaderboards.length]);

  const fetchLeaderboardForCode = useCallback(async (
    metric: LeaderboardMetric, joinCode: string
  ) => {
    if (!joinCode) return;
    setLeaderboardLoading(true);
    try {
      const { data: cohortProfiles, error: cpErr } = await supabase
        .from('profiles').select('id, name')
        .eq('join_code_used', joinCode).eq('role', 'student');

      if (cpErr || !cohortProfiles || cohortProfiles.length === 0) { setLeaderboard([]); return; }

      const cohortIds = cohortProfiles.map(p => p.id);
      const nameMap: Record<string, string> = {};
      cohortProfiles.forEach(p => { nameMap[p.id] = p.name; });

      let counts: Record<string, number> = {};

      if (metric === 'sessions_alltime' || metric === 'sessions_thismonth') {
        const { data: rows, error: rowErr } = await supabase
          .from('dashboard').select('user_id, progress, created_at')
          .in('user_id', cohortIds).in('progress', ['started', 'completed']);
        if (rowErr || !rows) { setLeaderboard([]); return; }

        const now = new Date();
        const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
        const filtered = metric === 'sessions_thismonth'
          ? rows.filter(r => { const ts = Date.parse(r.created_at || ''); return !isNaN(ts) && ts >= monthStartMs; })
          : rows;
        filtered.forEach(r => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
      } else {
        const { data: certRows, error: certErr } = await supabase
          .from('dashboard').select('user_id, progress')
          .in('user_id', cohortIds).eq('category_activity', 'Certification');
        if (certErr || !certRows) { setLeaderboard([]); return; }
        certRows.forEach(r => {
          if (metric === 'certs_achieved' && r.progress !== 'completed') return;
          if (metric === 'certs_attempted' && r.progress === 'not started') return;
          counts[r.user_id] = (counts[r.user_id] || 0) + 1;
        });
      }

      const entries: LeaderboardEntry[] = Object.entries(counts)
        .map(([uid, count]) => ({ user_id: uid, name: nameMap[uid] || 'Unknown', value: count, rank: 0 }))
        .sort((a, b) => b.value - a.value)
        .map((e, i) => ({ ...e, rank: i + 1 }));
      setLeaderboard(entries);
    } catch (e) {
      console.error('[Leaderboard] fetch error:', e);
      setLeaderboard([]);
    } finally { setLeaderboardLoading(false); }
  }, []);

  useEffect(() => {
    if (((userProfile?.role as unknown) as string) !== 'platform_administrator') return;
    supabase.from('organizations').select('id, name, join_code').order('name', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) { setOrgOptions(data); setSelectedOrgJoinCode(data[0].join_code); }
      });
  }, [userProfile?.role]);

  useEffect(() => {
    if (((userProfile?.role as unknown) as string) !== 'leader' || !user?.id) return;
    supabase.from('profiles').select('organizations(join_code, join_codes)').eq('id', user.id).single()
      .then(({ data: profileData }) => {
        const org = (profileData as any)?.organizations;
        const code: string = (Array.isArray(org?.join_codes) && org.join_codes.length > 0 ? org.join_codes[0] : org?.join_code) ?? '';
        if (code) { setLeaderJoinCode(code); }
        else if ((userProfile as any)?.organization_id) {
          supabase.from('profiles').select('join_code_used')
            .eq('organization_id', (userProfile as any).organization_id).eq('role', 'student')
            .not('join_code_used', 'is', null).limit(1)
            .then(({ data: pd }) => { setLeaderJoinCode(pd?.[0]?.join_code_used ?? ''); });
        }
      });
  }, [userProfile?.role, (userProfile as any)?.organization_id, user?.id]);

  useEffect(() => {
    if (resolvedJoinCode) fetchLeaderboardForCode(leaderboardMetric, resolvedJoinCode);
  }, [leaderboardMetric, resolvedJoinCode, fetchLeaderboardForCode]);

  // ── Fetch monthly assessment ─────────────────────────────────────────────
  const fetchMonthlyAssessment = useCallback(async () => {
    if (!user?.id) return;
    setMonthlyLoading(true);
    try {
      const { data: rows, error: err } = await supabase
        .from('user_monthly_assessments')
        .select('*')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1);

      if (err) {
        console.warn('[Monthly Assessment] fetch error:', err);
        setMonthlyAssessment(null);
      } else if (rows && rows.length > 0) {
        setMonthlyAssessment(rows[0] as MonthlyAssessment);
      } else {
        setMonthlyAssessment(null);
      }
    } catch (e) {
      console.error('[Monthly Assessment] unexpected error:', e);
      setMonthlyAssessment(null);
    } finally {
      setMonthlyLoading(false);
    }
  }, [user?.id]);

  // ─────────────────────────────────────────────────────────────────────────

  const fetchDashboardData = useCallback(async (force = false) => {
    if (!user) return;
    if (fetchingRef.current && !force) return;
    if (!force && lastUserIdRef.current === user.id) return;

    try {
      fetchingRef.current = true;
      lastUserIdRef.current = user.id;
      setLoading(true);
      setError(null);
      
      if (user.role === 'facilitator') {
        setData({ projects: [], dashboardActivities: [], certifications: [] });
      } else {
        let projects: any[] = [];
        try {
          const projectQuery = supabase.from('projects').select('*').eq('user_id', user.id);
          if (user.team_id) projectQuery.or(`user_id.eq.${user.id},team_id.eq.${user.team_id}`);
          const { data: projectsData, error: projectsError } = await projectQuery.order('updated_at', { ascending: false });
          // Gracefully handle 404 or missing projects table
          if (projectsError) {
            if (projectsError.code === '404' || projectsError.message?.includes('relation') || projectsError.message?.includes('not found')) {
              console.debug('[Dashboard] projects table not available (normal for some deployments)');
            } else {
              console.warn('[Dashboard] Error fetching projects:', projectsError.message);
            }
          }
          projects = projectsData && Array.isArray(projectsData) ? projectsData : [];
        } catch (error) {
          console.debug('[Dashboard] Projects fetch exception (non-critical):', error instanceof Error ? error.message : String(error));
          projects = [];
        }

        let team = null;
        if (user.team_id) {
          const { data: teamData, error: teamError } = await supabase
            .from('teams').select(`*, profiles!profiles_team_id_fkey(id, name, email, avatar_url, role)`)
            .eq('id', user.team_id).single();
          if (!teamError) team = teamData;
        }

        let dashboardActivities: DashboardActivity[] = [];
        let certifications: CertificationProgress[] = [];
        
        const { data: dashboardData, error: dashboardError } = await supabase
          .from('dashboard').select('*').eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (dashboardError || !dashboardData || dashboardData.length === 0) {
          const { error: rpcError } = await supabase.rpc(
            'create_grade_appropriate_dashboard_activities_by_continent',
            { user_id_param: user.id, continent_param: userProfile!.continent }
          );
          if (rpcError) throw rpcError;
          const { data: retry, error: retryError } = await supabase
            .from('dashboard').select('*').eq('user_id', user.id)
            .order('updated_at', { ascending: false });
          if (retryError) throw retryError;
          dashboardActivities = retry || [];
          certifications = extractCertificationProgress(retry || []);
        } else {
          dashboardActivities = dashboardData;
          certifications = extractCertificationProgress(dashboardData);
        }

        const learningActivities = dashboardActivities.filter(a => a.category_activity !== 'Certification');
        let dashboardSummary = null;
        if (learningActivities.length > 0) {
          dashboardSummary = {
            total_activities: learningActivities.length,
            completed: learningActivities.filter(a => a.progress === 'completed').length,
            started: learningActivities.filter(a => a.progress === 'started').length
          };
        }

        let certificationSummary = null;
        if (certifications.length > 0) {
          certificationSummary = {
            total_certifications: certifications.length,
            completed_certifications: certifications.filter(c => c.progress === 'completed').length,
            started_certifications: certifications.filter(c => c.progress === 'started').length
          };
        }

        setData({
          projects: projects || [], team: team as DashboardData['team'],
          dashboardActivities, certifications,
          dashboardSummary: dashboardSummary || undefined,
          certificationSummary: certificationSummary || undefined
        });
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally { setLoading(false); fetchingRef.current = false; }
  }, [user, userProfile?.continent]);
  
  const refreshDashboard = useCallback(async () => {
    if (!user || user.role !== 'student') return;
    if (!userProfile?.continent) return;
    try {
      setRefreshing(true); setError(null);
      const { error: rpcError } = await supabase.rpc('create_grade_appropriate_dashboard_activities_by_continent',
        { user_id_param: user.id, continent_param: userProfile.continent });
      if (rpcError) throw rpcError;
      await fetchDashboardData(true);
    } catch (err) {
      setError('Failed to refresh dashboard: ' + (err as Error).message);
    } finally { setRefreshing(false); }
  }, [user, userProfile, fetchDashboardData]);

  const downloadCertificate = async (certificationName: string, displayName: string) => {
    try {
      setDownloadingCert(certificationName);
      const certActivity = data.dashboardActivities.find(
        a => a.activity.toLowerCase() === displayName.toLowerCase() && a.category_activity === 'Certification'
      );
      if (!certActivity) { alert('Certification activity not found.'); setDownloadingCert(null); return; }
      if (!certActivity.certificate_pdf_url) { alert('Certificate not yet generated.'); setDownloadingCert(null); return; }
      window.open(certActivity.certificate_pdf_url, '_blank');
      setDownloadingCert(null);
    } catch (error) { alert('Could not download certificate.'); setDownloadingCert(null); }
  };

  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data, error }) => { if (!error && data) setUserProfile(data); });
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && userProfile?.continent) {
      fetchingRef.current = false;
      lastUserIdRef.current = null;
      fetchDashboardData();
      fetchMonthlyAssessment();
    }
  }, [user?.id, userProfile?.continent, fetchDashboardData, fetchMonthlyAssessment]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-2 text-sm text-red-700">{error}</p>
                {user?.role === 'student' && (
                  <div className="mt-4">
                    <Button onClick={refreshDashboard} variant="outline" size="sm"
                      icon={<RefreshCw size={16} />} isLoading={refreshing}>
                      Try to Fix Dashboard
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const filteredActivities = getFilteredActivities();
  const uniqueCategories = getUniqueCategories();

  // ── Monthly Summary render helper ────────────────────────────────────────
  const renderMonthlySummary = () => {
    if (user?.role !== 'student') return null;

    if (monthlyLoading) {
      return (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-cyan-50">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-indigo-500" />
              Monthly Summary
            </h2>
          </div>
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-400" />
          </div>
        </div>
      );
    }

    if (!monthlyAssessment) {
      return (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-cyan-50">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-indigo-500" />
              Monthly Summary
            </h2>
          </div>
          <div className="py-8 text-center text-gray-400 text-sm">
            <Activity className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p>No monthly assessment data available yet.</p>
            <p className="text-xs mt-1">Keep learning — your first summary will appear after your sessions are assessed.</p>
          </div>
        </div>
      );
    }

    const ma = monthlyAssessment;
    const measuredDate = new Date(ma.measured_at);
    const monthLabel = measuredDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Engagement rate
    const engagementRate = ma.session_count && ma.session_count > 0
      ? Math.round(((ma.engaged_session_count ?? 0) / ma.session_count) * 100)
      : null;

    // Reasoning distribution for mini chart
    const reasoningLevels = [
      { label: 'Definitional', pct: ma.reasoning_definitional_pct, color: 'bg-gray-400' },
      { label: 'Responsive', pct: ma.reasoning_responsive_pct, color: 'bg-blue-400' },
      { label: 'Elaborative', pct: ma.reasoning_elaborative_pct, color: 'bg-indigo-500' },
      { label: 'Structured', pct: ma.reasoning_structured_pct, color: 'bg-purple-600' },
    ].filter(r => r.pct != null && Number(r.pct) > 0);

    // AI Proficiency cert level badge
    const aiCertColor = (() => {
      const lvl = (ma.ai_prof_cert_level ?? '').toLowerCase();
      if (lvl === 'advanced') return 'bg-green-100 text-green-800 border-green-300';
      if (lvl === 'proficient') return 'bg-blue-100 text-blue-800 border-blue-300';
      if (lvl === 'emerging') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      return 'bg-gray-100 text-gray-700 border-gray-300';
    })();

    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setMonthlySectionExpanded(prev => !prev)}
          className="w-full px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-cyan-50 flex items-center justify-between cursor-pointer hover:from-indigo-100 hover:to-cyan-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-indigo-500" />
            <div className="text-left">
              <h2 className="text-xl font-bold text-gray-900">Monthly Summary</h2>
              <p className="text-sm text-gray-500">{monthLabel} · assessed by {ma.assessment_model ?? 'AI'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Updated {new Date(ma.updated_at).toLocaleDateString()}
            </span>
            {monthlySectionExpanded
              ? <ChevronUp className="h-5 w-5 text-gray-400" />
              : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </div>
        </button>

        {monthlySectionExpanded && (
          <div className="p-6 space-y-6">

            {/* ── Row 1: Core Skill Scores ─────────────────────────────── */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Brain className="h-4 w-4" />
                Core Skill Scores
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                <ScoreBar label="Cognitive" score={ma.cognitive_score} icon={<Brain className="h-4 w-4 text-indigo-500" />} colorClass="bg-indigo-500" />
                <ScoreBar label="Critical Thinking" score={ma.critical_thinking_score} icon={<Lightbulb className="h-4 w-4 text-amber-500" />} colorClass="bg-amber-500" />
                <ScoreBar label="Problem Solving" score={ma.problem_solving_score} icon={<Target className="h-4 w-4 text-red-500" />} colorClass="bg-red-500" />
                <ScoreBar label="Creativity" score={ma.creativity_score} icon={<Star className="h-4 w-4 text-pink-500" />} colorClass="bg-pink-500" />
                <ScoreBar label="Productive Use of Energy (PUE)" score={ma.pue_score} icon={<Zap className="h-4 w-4 text-emerald-500" />} colorClass="bg-emerald-500" />
              </div>
            </div>

            {/* ── Row 2: Session Engagement + AI Proficiency ────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Session engagement */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Session Engagement
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <StatPill label="Total Sessions" value={ma.session_count ?? 0} icon={<MessageSquare className="h-4 w-4 text-blue-500" />} />
                  <StatPill label="Engaged" value={ma.engaged_session_count ?? 0}
                    sub={engagementRate != null ? `${engagementRate}% rate` : undefined}
                    icon={<Zap className="h-4 w-4 text-green-500" />} />
                  <StatPill label="Avg Words" value={ma.avg_words_per_session != null ? Math.round(Number(ma.avg_words_per_session)) : '—'}
                    icon={<Book className="h-4 w-4 text-purple-500" />} />
                </div>
              </div>

              {/* AI Proficiency */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4" />
                  AI Proficiency
                </h3>
                {ma.ai_prof_cert_level ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Certification Level</span>
                      <span className={classNames('inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border', aiCertColor)}>
                        {ma.ai_prof_cert_level}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {ma.ai_prof_understanding_score != null && (
                        <div className="flex justify-between"><span className="text-gray-500">Understanding</span><span className="font-medium">{ma.ai_prof_understanding_score}/3</span></div>
                      )}
                      {ma.ai_prof_application_score != null && (
                        <div className="flex justify-between"><span className="text-gray-500">Application</span><span className="font-medium">{ma.ai_prof_application_score}/3</span></div>
                      )}
                      {ma.ai_prof_ethics_score != null && (
                        <div className="flex justify-between"><span className="text-gray-500">Ethics</span><span className="font-medium">{ma.ai_prof_ethics_score}/3</span></div>
                      )}
                      {ma.ai_prof_verification_score != null && (
                        <div className="flex justify-between"><span className="text-gray-500">Verification</span><span className="font-medium">{ma.ai_prof_verification_score}/3</span></div>
                      )}
                    </div>
                    {ma.ai_prof_gpt_narrative && (
                      <p className="text-xs text-gray-500 italic border-t border-gray-200 pt-2 mt-1">{ma.ai_prof_gpt_narrative}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">No AI proficiency data yet</p>
                )}
              </div>
            </div>

            {/* ── Row 3: Reasoning Distribution + Scaffolding ───────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Reasoning distribution */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity className="h-4 w-4" />
                  Reasoning Distribution
                </h3>
                {reasoningLevels.length > 0 ? (
                  <div className="space-y-2">
                    {/* Stacked bar */}
                    <div className="flex h-6 rounded-full overflow-hidden bg-gray-200">
                      {reasoningLevels.map(r => (
                        <div
                          key={r.label}
                          className={classNames('h-full transition-all', r.color)}
                          style={{ width: `${Number(r.pct)}%` }}
                          title={`${r.label}: ${Number(r.pct).toFixed(1)}%`}
                        />
                      ))}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      {reasoningLevels.map(r => (
                        <span key={r.label} className="flex items-center gap-1">
                          <span className={classNames('inline-block w-2.5 h-2.5 rounded-full', r.color)} />
                          {r.label} {Number(r.pct).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                    {ma.reasoning_chain_count != null && (
                      <p className="text-xs text-gray-500 mt-1">
                        Reasoning chains detected: <span className="font-semibold">{ma.reasoning_chain_count}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">No reasoning data yet</p>
                )}
              </div>

              {/* Scaffolding */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4" />
                  Scaffolding & Convergence
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Convergence Trend</span>
                    {trendBadge(ma.scaffold_convergence_trend)}
                  </div>
                  {(ma.scaffold_clarification_per_session != null || ma.scaffold_decomposition_per_session != null || ma.scaffold_correction_total_per_session != null) && (
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <div className="font-semibold text-gray-900">{ma.scaffold_clarification_per_session != null ? Number(ma.scaffold_clarification_per_session).toFixed(1) : '—'}</div>
                        <div className="text-[10px] text-gray-500">Clarifications / session</div>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{ma.scaffold_decomposition_per_session != null ? Number(ma.scaffold_decomposition_per_session).toFixed(1) : '—'}</div>
                        <div className="text-[10px] text-gray-500">Decompositions / session</div>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{ma.scaffold_correction_total_per_session != null ? Number(ma.scaffold_correction_total_per_session).toFixed(1) : '—'}</div>
                        <div className="text-[10px] text-gray-500">Corrections / session</div>
                      </div>
                    </div>
                  )}
                  {(ma.scaffold_convergence_narrative || ma.scaffold_narrative) && (
                    <p className="text-xs text-gray-500 italic border-t border-gray-200 pt-2">
                      {ma.scaffold_convergence_narrative || ma.scaffold_narrative}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Row 4: Metacognition + Role Readiness ─────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Metacognition */}
              {(ma.metacog_verification_rate != null || ma.metacog_reactive_rate != null || ma.metacog_strategic_rate != null) && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Brain className="h-4 w-4" />
                    Metacognition
                  </h3>
                  <div className="space-y-2">
                    {ma.metacog_verification_rate != null && (
                      <ScoreBar label="Verification Rate" score={Number(ma.metacog_verification_rate)} maxScore={1} colorClass="bg-teal-500" />
                    )}
                    {ma.metacog_reactive_rate != null && (
                      <ScoreBar label="Reactive Rate" score={Number(ma.metacog_reactive_rate)} maxScore={1} colorClass="bg-orange-400" />
                    )}
                    {ma.metacog_strategic_rate != null && (
                      <ScoreBar label="Strategic Rate" score={Number(ma.metacog_strategic_rate)} maxScore={1} colorClass="bg-indigo-500" />
                    )}
                  </div>
                  {ma.metacog_narrative && (
                    <p className="text-xs text-gray-500 italic border-t border-gray-200 pt-2 mt-3">{ma.metacog_narrative}</p>
                  )}
                </div>
              )}

              {/* Role Readiness */}
              {(ma.role_teaching_intent_count != null || ma.role_community_application_count != null || ma.role_enterprise_orientation_count != null) && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    Role Readiness Signals
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <StatPill label="Teaching Intent" value={ma.role_teaching_intent_count ?? 0} bgClass="bg-blue-50" />
                    <StatPill label="Community Application" value={ma.role_community_application_count ?? 0} bgClass="bg-green-50" />
                    <StatPill label="Enterprise Orientation" value={ma.role_enterprise_orientation_count ?? 0} bgClass="bg-purple-50" />
                    <StatPill label="Intergenerational" value={ma.role_intergenerational_count ?? 0} bgClass="bg-amber-50" />
                  </div>
                  {ma.role_readiness_signals && ma.role_readiness_signals.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-gray-200">
                      {ma.role_readiness_signals.map((sig, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                          {sig}
                        </span>
                      ))}
                    </div>
                  )}
                  {ma.role_readiness_narrative && (
                    <p className="text-xs text-gray-500 italic border-t border-gray-200 pt-2 mt-3">{ma.role_readiness_narrative}</p>
                  )}
                </div>
              )}
            </div>

            {/* ── Row 5: Certifications Progress + PUE Breakdown ────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Certification progress from monthly */}
              {(ma.cert_attempted_count != null || ma.cert_passed_count != null) && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Trophy className="h-4 w-4" />
                    Certification Progress (Monthly)
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <StatPill label="Attempted" value={ma.cert_attempted_count ?? 0} icon={<Target className="h-4 w-4 text-blue-500" />} />
                    <StatPill label="Passed" value={ma.cert_passed_count ?? 0} icon={<CheckCircle className="h-4 w-4 text-green-500" />} />
                    <StatPill label="Avg Score" value={ma.cert_avg_score != null ? Number(ma.cert_avg_score).toFixed(1) : '—'} icon={<Star className="h-4 w-4 text-amber-500" />} />
                  </div>
                  {ma.cert_names_passed && ma.cert_names_passed.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-200">
                      <span className="text-xs text-gray-500 font-medium">Passed: </span>
                      <span className="text-xs text-green-700 font-medium">{ma.cert_names_passed.join(', ')}</span>
                    </div>
                  )}
                  {ma.cert_summary && (
                    <p className="text-xs text-gray-500 italic border-t border-gray-200 pt-2 mt-2">{ma.cert_summary}</p>
                  )}
                </div>
              )}

              {/* PUE Breakdown */}
              {ma.pue_score != null && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Zap className="h-4 w-4" />
                    PUE Breakdown
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    {[
                      { label: 'Energy Constraint', val: ma.pue_energy_constraint_pct },
                      { label: 'Market Pricing', val: ma.pue_market_pricing_pct },
                      { label: 'Battery Load', val: ma.pue_battery_load_pct },
                      { label: 'Enterprise Planning', val: ma.pue_enterprise_planning_pct },
                      { label: 'Learner Initiated', val: ma.pue_learner_initiated_pct },
                      { label: 'AI Introduced', val: ma.pue_ai_introduced_pct },
                      { label: 'Multi-Domain', val: ma.pue_multi_domain_pct },
                      { label: 'Local Context', val: ma.pue_local_context_pct },
                    ].filter(r => r.val != null).map(r => (
                      <div key={r.label} className="flex items-center justify-between">
                        <span className="text-gray-600 text-xs">{r.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(Number(r.val), 100)}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-700 w-10 text-right">{Number(r.val).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {ma.pue_summary && (
                    <p className="text-xs text-gray-500 italic border-t border-gray-200 pt-2 mt-3">{ma.pue_summary}</p>
                  )}
                </div>
              )}
            </div>

            {/* ── Row 6: CI Training + Enterprise Artifacts ─────────────── */}
            {(ma.ci_training_sessions_total != null && ma.ci_training_sessions_total > 0) && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Award className="h-4 w-4" />
                  CI Training & Enterprise
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatPill label="CI Sessions" value={ma.ci_training_sessions_total ?? 0} />
                  <StatPill label="CI Certs Passed" value={ma.ci_certs_passed_count ?? 0} />
                  <StatPill label="Enterprise Artifact" value={ma.enterprise_artifact_score != null ? Number(ma.enterprise_artifact_score).toFixed(1) : '—'} />
                  <StatPill label="AI Playground Sessions" value={ma.ai_playground_session_count ?? 0} />
                </div>
                {ma.ci_summary && (
                  <p className="text-xs text-gray-500 italic border-t border-gray-200 pt-2 mt-3">{ma.ci_summary}</p>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome, {user?.name || 'User'}!
            </h1>
            <p className="text-gray-600">
              {user?.role === 'facilitator'
                ? 'Manage your teams and monitor student progress'
                : 'Track your certifications, projects and learning progress'}
            </p>
          </div>
          
          {user?.role === 'student' && (
            <div className="flex items-center space-x-2">
              <Button onClick={refreshDashboard} variant="outline" size="sm"
                icon={<RefreshCw size={16} />} isLoading={refreshing}>
                Refresh Activities
              </Button>
            </div>
          )}
        </div>

        {user?.role === 'facilitator' ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Facilitator Dashboard</h2>
            <p className="text-gray-600">Facilitator features coming soon!</p>
          </div>
        ) : (
          <div className="space-y-8">

            {/* ── News Banner ─────────────────────────────────────────────── */}
            {!newsDismissed && newsItems.length > 0 && (
              <div className="rounded-2xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-300 px-5 py-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Newspaper size={15} className="text-yellow-600 flex-shrink-0" />
                    <span className="text-xs font-bold text-yellow-700 uppercase tracking-widest">What's New</span>
                    {newsItems.length > 1 && (
                      <span className="text-[10px] text-yellow-500 font-medium">
                        {newsIndex + 1} / {newsItems.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {newsItems.length > 1 && (
                      <button onClick={() => setNewsIndex(i => (i + 1) % newsItems.length)}
                        className="text-yellow-500 hover:text-yellow-700 transition-colors" title="Next">
                        <ChevronRight size={16} />
                      </button>
                    )}
                    <button onClick={() => setNewsDismissed(true)}
                      className="text-yellow-400 hover:text-yellow-700 transition-colors" title="Dismiss">
                      <XIcon size={14} />
                    </button>
                  </div>
                </div>
                {(() => {
                  const item = newsItems[newsIndex];
                  return (
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{item.body}</p>
                      {item.link && (
                        <a href={item.link}
                          className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-yellow-700 hover:text-yellow-900 underline underline-offset-2 transition-colors">
                          {item.link_label ?? 'Learn more'} <ChevronRight size={11} />
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            {(!challengeLoading || !grandLoading) && (weeklyChallenge || grandChallenge) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* ── Left: Weekly Challenge ── */}
                {weeklyChallenge && (
                  <div className={classNames(
                    'rounded-xl border overflow-hidden',
                    enrollmentStatus === 'active' || enrollmentStatus === 'submitted'
                      ? 'border-emerald-300 bg-emerald-50'
                      : enrollmentStatus === 'awarded'
                      ? 'border-purple-300 bg-purple-50'
                      : 'border-blue-300 bg-blue-50'
                  )}>
                    <div className="px-4 py-3 border-b border-black/5 flex items-center gap-2">
                      <Globe2 size={15} className="text-blue-600 flex-shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wide text-blue-600">Weekly Challenge</span>
                      {(() => {
                        const daysLeft = Math.ceil((new Date(weeklyChallenge.week_end).getTime() - Date.now()) / 86400000);
                        return daysLeft > 0
                          ? <span className="ml-auto text-xs text-gray-400">{daysLeft}d left</span>
                          : null;
                      })()}
                    </div>
                    <div className="px-4 py-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-white flex-shrink-0">
                          {SLUG_EMOJI[weeklyChallenge.community_impact_slug] ?? '🌍'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className={classNames(
                              'text-xs px-2 py-0.5 rounded-full font-semibold border',
                              TIER_COLOURS[weeklyChallenge.tier_target]?.bg ?? 'bg-gray-50',
                              TIER_COLOURS[weeklyChallenge.tier_target]?.text ?? 'text-gray-600',
                              TIER_COLOURS[weeklyChallenge.tier_target]?.border ?? 'border-gray-200',
                            )}>
                              {weeklyChallenge.tier_target}
                            </span>
                            {enrollmentStatus === 'awarded' && <span className="text-xs text-purple-600 font-bold">✅ Completed</span>}
                            {(enrollmentStatus === 'active' || enrollmentStatus === 'submitted') && <span className="text-xs text-emerald-600 font-bold">🎯 Active</span>}
                          </div>
                          <h3 className="text-sm font-bold text-gray-900 leading-tight mb-1">{weeklyChallenge.title}</h3>
                          <p className="text-xs text-gray-600 leading-relaxed">{weeklyChallenge.description}</p>
                        </div>
                      </div>
                      {(enrollmentStatus === 'active' || enrollmentStatus === 'submitted') && (
                        <div className="bg-white/70 rounded-lg p-2.5 mb-3">
                          <p className="text-xs font-bold text-emerald-700 mb-0.5">Your mission:</p>
                          <p className="text-xs text-gray-700">{weeklyChallenge.challenge_instruction}</p>
                        </div>
                      )}
                      {enrollmentStatus === 'none' ? (
                        <button onClick={handleChallengeCheckout} disabled={enrolling}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors">
                          {enrolling ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Checking out…</>
                            : <><ArrowRight size={13} /> Take this challenge</>}
                        </button>
                      ) : (
                        <button onClick={() => navigate(SLUG_TO_PATH[weeklyChallenge.community_impact_slug] ?? '/')}
                          className={classNames('w-full flex items-center justify-center gap-2 px-4 py-2 text-white font-bold text-xs rounded-lg transition-colors',
                            enrollmentStatus === 'awarded' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700')}>
                          <ArrowRight size={13} /> {enrollmentStatus === 'awarded' ? 'View page' : 'Continue challenge'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Right: Grand Challenge ── */}
                {grandChallenge && (
                  <div className={classNames(
                    'rounded-xl border overflow-hidden',
                    grandSubmission?.status === 'awarded' ? 'border-amber-400 bg-amber-50'
                    : grandSubmission?.status === 'submitted' || grandSubmission?.status === 'evaluated' ? 'border-orange-300 bg-orange-50'
                    : grandSubmission?.status === 'draft' ? 'border-amber-300 bg-amber-50'
                    : 'border-amber-200 bg-amber-50'
                  )}>
                    <div className="px-4 py-3 border-b border-black/5 flex items-center gap-2">
                      <Trophy size={15} className="text-amber-600 flex-shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Grand Challenge · {grandChallenge.quarter}</span>
                      <button
                        onClick={() => setGrandShowInstructions(v => !v)}
                        className="ml-1 w-5 h-5 rounded-full bg-amber-200 hover:bg-amber-300 flex items-center justify-center flex-shrink-0 transition-colors"
                        title="How the Grand Challenge works"
                      >
                        <span className="text-amber-800 font-bold" style={{fontSize:'11px'}}>?</span>
                      </button>
                      {(() => {
                        const daysLeft = Math.ceil((new Date(grandChallenge.submission_deadline).getTime() - Date.now()) / 86400000);
                        return daysLeft > 0
                          ? <span className="ml-auto text-xs text-gray-400">{daysLeft}d to deadline</span>
                          : <span className="ml-auto text-xs text-red-500 font-bold">Deadline passed</span>;
                      })()}
                    </div>

                    {/* Instructions panel */}
                    {grandShowInstructions && (
                      <div className="px-4 py-4 bg-amber-50 border-b border-amber-200 text-xs text-gray-700 leading-relaxed space-y-3">
                        <div className="bg-amber-100 rounded-lg p-3 border border-amber-300">
                          <p className="font-bold text-amber-900 mb-1">The most important thing</p>
                          <p className="text-amber-800">Help the people you talk with make real change that improves their lives and their work — whether they are a farmer, fisher, animal herder, entrepreneur, or anyone else in your community. The Grand Challenge is not about using AI for its own sake. It is about what actually gets better for a real person because you showed up and helped.</p>
                        </div>
                        <div>
                          <p className="font-bold text-amber-800 mb-1">What is the Grand Challenge?</p>
                          <p>A 3-month community impact project. You choose a real person in your community and work with them over multiple visits to solve a real problem. You use AI as your tool, document what happens, and write your story at the end. The learner with the deepest, most honest, most documented impact wins.</p>
                        </div>
                        <div>
                          <p className="font-bold text-amber-800 mb-1">How to use the Community Impact pages</p>
                          <p>The Agriculture, Fishing, Healthcare, Entrepreneurship, Animal Husbandry, and AI Ambassadors pages are your AI toolkit. When you are with a farmer who has a crop disease, open the Agriculture page and describe the problem — copy the AI's advice and share it with the farmer. When you are helping a fisher, use the Fishing page. When you are with an entrepreneur, use the Entrepreneurship page. You can copy and paste observations, symptoms, and solutions directly from those pages into your field notes here. Use the tools. That is what they are for.</p>
                        </div>
                        <div>
                          <p className="font-bold text-amber-800 mb-1">Field notes</p>
                          <p>Each time you visit, add a field note. Three questions: what was the situation when you arrived? what did you do with AI to help? what changed after? Short and honest is better than long and vague. A field note that says "Grace removed 12 infected cassava plants after I showed her the AI diagnosis" is stronger than one that says "I helped a farmer with her crops."</p>
                        </div>
                        <div>
                          <p className="font-bold text-amber-800 mb-1">The impact arc</p>
                          <p>Your impact arc is your story in your own words — the full picture across the whole quarter. Start with the problem, describe what you did visit by visit, and end with what actually changed. What is different now for this person or their family or their business? Be specific. Be honest. The best stories are the ones that show real struggle and real progress.</p>
                        </div>
                        <div>
                          <p className="font-bold text-amber-800 mb-1">How you are evaluated</p>
                          <p>An AI agent evaluates every submission on: real documented change (did something actually get better?), sustained engagement (did you go back more than once?), quality of evidence (are your field notes specific and honest?), and effective use of AI (did the tools actually help?). You earn an impact tier — Seed, Scout, Bridge, Builder, or Village Leader — based on what you did, not what you planned to do.</p>
                        </div>
                        <div>
                          <p className="font-bold text-amber-800 mb-1">The winner</p>
                          <p>On the deadline date the AI agent compares all submissions and selects the Grand Challenge winner — the learner whose work shows the deepest, most documented, most honest community impact. The winner is announced on {new Date(grandChallenge.winner_announced_date).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'})}.</p>
                        </div>
                        <div>
                          <p className="font-bold text-amber-800 mb-1">Carry over</p>
                          <p>If you worked on a community problem in a previous quarter, carry it forward. Your prior story becomes the foundation and you add what happened next. Expanding real impact over multiple quarters is recognised and rewarded — a 6-month story of helping a farmer recover from crop disease is more powerful than a 3-month one.</p>
                        </div>
                        <div className="pt-1">
                          <p className="text-amber-700 font-bold">Deadline: {new Date(grandChallenge.submission_deadline).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'})} · Winner announced: {new Date(grandChallenge.winner_announced_date).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'})}</p>
                        </div>
                      </div>
                    )}
                    <div className="px-4 py-4">

                      {/* Winner state */}
                      {grandSubmission?.status === 'awarded' && grandSubmission.is_quarter_winner ? (
                        <div className="text-center py-2">
                          <div className="text-3xl mb-2">🏆</div>
                          <p className="text-sm font-bold text-amber-800 mb-1">Grand Challenge Winner!</p>
                          <p className="text-xs text-amber-700 mb-3">{grandSubmission.title}</p>
                          <p className="text-xs text-gray-500">{TIER_LABELS_MAP[grandSubmission.tier_awarded ?? ''] ?? grandSubmission.tier_awarded}</p>
                        </div>

                      /* Submitted / evaluated state */
                      ) : grandSubmission?.status === 'submitted' || grandSubmission?.status === 'evaluated' ? (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle size={14} className="text-orange-600" />
                            <p className="text-xs font-bold text-orange-700">Submitted — awaiting evaluation</p>
                          </div>
                          <p className="text-xs text-gray-700 font-medium mb-1">{grandSubmission.title}</p>
                          <p className="text-xs text-gray-500 mb-3">{grandSubmission.journal_entry_count} field notes · {grandSubmission.weeks_documented} weeks</p>
                          {grandSubmission.tier_awarded && (
                            <div className={classNames('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border mb-3',
                              TIER_COLOURS[grandSubmission.tier_awarded]?.bg,
                              TIER_COLOURS[grandSubmission.tier_awarded]?.text,
                              TIER_COLOURS[grandSubmission.tier_awarded]?.border,
                            )}>
                              <span className={classNames('w-1.5 h-1.5 rounded-full', TIER_COLOURS[grandSubmission.tier_awarded]?.dot)} />
                              {TIER_LABELS_MAP[grandSubmission.tier_awarded]}
                            </div>
                          )}
                        </div>

                      /* Draft state — show editor */
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <div className="grid grid-cols-3 gap-2 w-full">
                              <div className="bg-white/70 rounded-lg p-2 text-center">
                                <p className="text-base font-bold text-amber-700">{grandJournalCount}</p>
                                <p className="text-xs text-gray-500">field notes</p>
                              </div>
                              <div className="bg-white/70 rounded-lg p-2 text-center">
                                <p className="text-base font-bold text-amber-700">{grandWeeksActive}</p>
                                <p className="text-xs text-gray-500">weeks active</p>
                              </div>
                              <div className="bg-white/70 rounded-lg p-2 text-center col-span-1">
                                <p className="text-base font-bold text-amber-700">{grandJournalCount > 0 ? '✓' : '—'}</p>
                                <p className="text-xs text-gray-500">{grandJournalCount > 0 ? 'started' : 'not yet'}</p>
                              </div>
                            </div>
                          </div>

                          <div>
                            <input
                              type="text"
                              value={grandDraftTitle}
                              onChange={e => setGrandDraftTitle(e.target.value)}
                              placeholder="Your story title…"
                              className="w-full px-3 py-2 text-xs border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </div>

                          <div>
                            <textarea
                              value={grandDraftArc}
                              onChange={e => setGrandDraftArc(e.target.value)}
                              rows={3}
                              placeholder="Tell your impact story — what problem did you work on, what did you do with AI, what changed for the community member?"
                              className="w-full px-3 py-2 text-xs border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none leading-relaxed"
                            />
                          </div>

                          {/* Carryover from prior quarters */}
                          {priorSubmissions.length > 0 && (
                            <div className="bg-white/60 rounded-lg p-2.5">
                              <p className="text-xs font-bold text-amber-800 mb-1.5 flex items-center gap-1">
                                <BookOpen size={11} /> Continue from a previous quarter
                              </p>
                              {priorSubmissions.map(prior => (
                                <div key={prior.id} className="flex items-center justify-between gap-2 py-1 border-b border-amber-100 last:border-0">
                                  <div className="min-w-0">
                                    <p className="text-xs text-gray-700 truncate">{prior.title}</p>
                                    <p className="text-xs text-gray-400">{prior.quarter} · {prior.journal_entry_count} entries</p>
                                  </div>
                                  <button
                                    onClick={() => handleCarryOver(prior)}
                                    className="flex-shrink-0 text-xs text-amber-700 font-bold hover:text-amber-900 underline"
                                  >
                                    carry over
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button onClick={handleSaveGrandDraft} disabled={grandSaving || !grandDraftTitle.trim()}
                              className="flex-1 py-1.5 text-xs border border-amber-300 rounded-lg text-amber-800 hover:bg-amber-100 disabled:opacity-40 transition-colors">
                              {grandSaving ? 'Saving…' : 'Save draft'}
                            </button>
                            <button
                              onClick={handleSubmitGrandChallenge}
                              disabled={grandSaving || !grandDraftArc.trim() || !grandDraftTitle.trim()}
                              className="flex-1 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                            >
                              <Trophy size={11} /> Submit
                            </button>
                          </div>
                          
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ── Community Impact Leaderboard ─────────────────────────────── */}
            {weeklyChallenge && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Globe2 className="h-6 w-6 text-emerald-600" />
                    Community Impact Leaderboard
                  </h2>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">ranked by highest tier · then total actions</span>
                    {pastChallenges.length > 0 && (
                      <button
                        onClick={() => setShowPastChallenges(v => !v)}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 rounded-full px-3 py-1 transition-colors flex items-center gap-1"
                      >
                        <Calendar size={12} />
                        {showPastChallenges ? 'Hide history' : `Past winners (${pastChallenges.length})`}
                      </button>
                    )}
                  </div>
                </div>

                {communityLbLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-400" />
                  </div>
                ) : communityLeaderboard.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <div className="text-4xl mb-3">🌍</div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">No community actions yet this week</p>
                    <p className="text-xs text-gray-400">Complete this week's challenge to appear on the leaderboard.</p>
                  </div>
                ) : (() => {
                    const top10 = communityLeaderboard.slice(0, 10);
                    const myEntry = communityLeaderboard.find(e => e.learner_id === user?.id);
                    const myRank = myEntry?.rank ?? 0;
                    const iAmOutside = myRank > 10;

                    const renderRow = (entry: CommunityLeaderEntry) => {
                      const isMe = entry.learner_id === user?.id;
                      const medal = MEDAL[entry.rank];
                      const tc = TIER_COLOURS[entry.highest_tier] ?? TIER_COLOURS.seed;
                      return (
                        <div key={entry.learner_id}
                          className={classNames('flex items-center px-6 py-3 gap-4 transition-colors',
                            isMe ? 'bg-emerald-50 border-l-4 border-emerald-400' : 'hover:bg-gray-50')}>
                          <div className="w-10 text-center flex-shrink-0">
                            {medal ? <span className="text-2xl leading-none">{medal}</span>
                              : <span className="text-base font-bold text-gray-400">#{entry.rank}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={classNames('text-sm font-semibold truncate block',
                              isMe ? 'text-emerald-800' : 'text-gray-800')}>
                              {entry.name ?? 'Learner'}
                              {isMe && <span className="ml-2 text-xs font-normal text-emerald-600">(you)</span>}
                            </span>
                            <span className={classNames(
                              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border mt-0.5',
                              tc.bg, tc.text, tc.border
                            )}>
                              <span className={classNames('w-1.5 h-1.5 rounded-full', tc.dot)} />
                              {entry.highest_tier_label}
                            </span>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <span className={classNames('text-base font-bold',
                              entry.rank === 1 ? 'text-amber-600' :
                              entry.rank === 2 ? 'text-gray-500' :
                              entry.rank === 3 ? 'text-orange-700' : 'text-gray-700')}>
                              {entry.total_actions}
                            </span>
                            <span className="ml-1 text-xs text-gray-400">
                              {entry.total_actions === 1 ? 'action' : 'actions'}
                            </span>
                          </div>
                          <div className="hidden sm:flex gap-1 flex-shrink-0">
                            {entry.seed_count > 0 && <span title="Seed" className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-bold">{entry.seed_count}</span>}
                            {entry.scout_count > 0 && <span title="Scout" className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">{entry.scout_count}</span>}
                            {entry.bridge_count > 0 && <span title="Bridge" className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-bold">{entry.bridge_count}</span>}
                            {entry.builder_count > 0 && <span title="Builder" className="w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs flex items-center justify-center font-bold">{entry.builder_count}</span>}
                            {entry.multiplier_count > 0 && <span title="Multiplier" className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">{entry.multiplier_count}</span>}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div className="divide-y divide-gray-100">
                        {top10.map(renderRow)}
                        {iAmOutside && myEntry && (
                          <>
                            <div className="px-6 py-1.5 bg-gray-50 flex items-center gap-2">
                              <div className="flex-1 border-t border-dashed border-gray-300" />
                              <span className="text-xs text-gray-400 flex-shrink-0">{myRank - 10} more above you</span>
                              <div className="flex-1 border-t border-dashed border-gray-300" />
                            </div>
                            {renderRow(myEntry)}
                          </>
                        )}
                      </div>
                    );
                  })()
                }

                {/* ── Past Challenge Winners ── */}
                {showPastChallenges && pastChallenges.length > 0 && (
                  <div className="border-t border-gray-200 bg-gray-50">
                    <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-2">
                      <Trophy size={14} className="text-amber-500" />
                      <span className="text-sm font-semibold text-gray-700">Past Weekly Challenges</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {pastChallenges.map(pc => {
                        const isExpanded = expandedPastChallenge === pc.id;
                        const weekLabel = new Date(pc.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const tc = TIER_COLOURS[pc.winner_tier ?? 'seed'] ?? TIER_COLOURS.seed;
                        const lbEntries = pastChallengeLeaderboards[pc.id];

                        return (
                          <div key={pc.id} className="px-6 py-3">
                            <button
                              onClick={async () => {
                                if (!isExpanded) await fetchPastChallengeLeaderboard(pc.id);
                                setExpandedPastChallenge(isExpanded ? null : pc.id);
                              }}
                              className="w-full flex items-start justify-between gap-3 text-left"
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <span className="text-lg leading-none flex-shrink-0 mt-0.5">
                                  {SLUG_EMOJI[pc.community_impact_slug] ?? '🌍'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-400">Week ending {weekLabel}</span>
                                    <span className={classNames(
                                      'text-xs px-2 py-0.5 rounded-full font-semibold border',
                                      TIER_COLOURS[pc.tier_target]?.bg ?? 'bg-gray-50',
                                      TIER_COLOURS[pc.tier_target]?.text ?? 'text-gray-600',
                                      TIER_COLOURS[pc.tier_target]?.border ?? 'border-gray-200',
                                    )}>
                                      {pc.tier_target}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{pc.title}</p>
                                  {pc.winner_name && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-sm">🏆</span>
                                      <span className="text-xs font-semibold text-amber-700">{pc.winner_name}</span>
                                      {pc.winner_tier && (
                                        <span className={classNames('text-xs px-1.5 py-0.5 rounded-full font-semibold border', tc.bg, tc.text, tc.border)}>
                                          {TIER_LABELS_MAP[pc.winner_tier] ?? pc.winner_tier}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {!pc.winner_name && (
                                    <p className="text-xs text-gray-400 italic mt-1">No winner recorded</p>
                                  )}
                                </div>
                              </div>
                              {isExpanded
                                ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0 mt-1" />
                                : <ChevronDown size={16} className="text-gray-400 flex-shrink-0 mt-1" />}
                            </button>

                            {/* Expanded: winner reason + leaderboard */}
                            {isExpanded && (
                              <div className="mt-3 space-y-3">
                                {pc.winner_reason && (
                                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <p className="text-xs font-semibold text-amber-800 mb-1">Why they won:</p>
                                    <p className="text-xs text-amber-900 leading-relaxed">{pc.winner_reason}</p>
                                  </div>
                                )}
                                {lbEntries === undefined ? (
                                  <div className="flex items-center justify-center py-4">
                                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-emerald-400" />
                                  </div>
                                ) : lbEntries.length === 0 ? (
                                  <p className="text-xs text-gray-400 text-center py-2">No participants recorded.</p>
                                ) : (
                                  <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                                    <div className="px-3 py-1.5 bg-gray-50 rounded-t-lg">
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Participants</span>
                                    </div>
                                    {lbEntries.slice(0, 8).map(e => {
                                      const medal = MEDAL[e.rank];
                                      const etc = TIER_COLOURS[e.highest_tier] ?? TIER_COLOURS.seed;
                                      return (
                                        <div key={e.learner_id} className="flex items-center px-3 py-2 gap-3">
                                          <div className="w-8 text-center flex-shrink-0 text-sm">
                                            {medal ?? <span className="text-gray-400 font-bold">#{e.rank}</span>}
                                          </div>
                                          <span className="flex-1 text-xs font-medium text-gray-800 truncate">{e.name}</span>
                                          <span className={classNames('text-xs px-2 py-0.5 rounded-full font-semibold border', etc.bg, etc.text, etc.border)}>
                                            {e.highest_tier_label}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Cohort Leaderboard ──────────────────────────────────────── */}
            {(((userProfile?.role as unknown) as string) === 'platform_administrator'
              || ((userProfile?.role as unknown) as string) === 'leader'
              || (userProfile as any)?.join_code_used) && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-yellow-50 flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-amber-500" />
                    Cohort Leaderboard
                    {((userProfile?.role as unknown) as string) === 'platform_administrator' && selectedOrgJoinCode && (
                      <span className="text-sm font-normal text-gray-500 ml-1">
                        ({orgOptions.find(o => o.join_code === selectedOrgJoinCode)?.name ?? selectedOrgJoinCode})
                      </span>
                    )}
                    {((userProfile?.role as unknown) as string) === 'leader' && leaderJoinCode && (
                      <span className="text-sm font-normal text-gray-500 ml-1">({leaderJoinCode})</span>
                    )}
                    {userProfile?.role === 'student' && (userProfile as any)?.join_code_used && (
                      <span className="text-sm font-normal text-gray-500 ml-1">({(userProfile as any).join_code_used})</span>
                    )}
                  </h2>

                  <div className="flex items-center gap-2 flex-wrap">
                    {((userProfile?.role as unknown) as string) === 'platform_administrator' && orgOptions.length > 0 && (
                      <select value={selectedOrgJoinCode} onChange={e => setSelectedOrgJoinCode(e.target.value)}
                        className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                        {orgOptions.map(org => (
                          <option key={org.id} value={org.join_code}>{org.name}</option>
                        ))}
                      </select>
                    )}
                    <select value={leaderboardMetric} onChange={e => setLeaderboardMetric(e.target.value as LeaderboardMetric)}
                      className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                      {LEADERBOARD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {(leaderboardMetric === 'sessions_alltime' || leaderboardMetric === 'sessions_thismonth') && resolvedJoinCode && (
                      <button
                        onClick={async () => {
                          if (!showPastCohortLb) await fetchPastCohortLeaderboards(resolvedJoinCode);
                          setShowPastCohortLb(v => !v);
                        }}
                        className="text-xs font-medium text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 rounded-full px-3 py-1 transition-colors flex items-center gap-1"
                      >
                        <Calendar size={12} />
                        {showPastCohortLb ? 'Hide history' : 'Past months'}
                      </button>
                    )}
                  </div>
                </div>

                {leaderboardLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-400" />
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">No data yet for this metric.</div>
                ) : (() => {
                    const top10 = leaderboard.slice(0, 10);
                    const myEntry = leaderboard.find(e => e.user_id === user?.id);
                    const myRank = myEntry?.rank ?? 0;
                    const iAmOutside = myRank > 10;
                    const metricLabelFor = (val: number) =>
                      leaderboardMetric === 'sessions_alltime' || leaderboardMetric === 'sessions_thismonth'
                        ? val === 1 ? 'session' : 'sessions'
                        : val === 1 ? 'certification' : 'certifications';

                    const renderCohortRow = (entry: LeaderboardEntry) => {
                      const isMe = entry.user_id === user?.id;
                      const medal = MEDAL[entry.rank];
                      return (
                        <div key={entry.user_id}
                          className={classNames('flex items-center px-6 py-3 gap-4 transition-colors',
                            isMe ? 'bg-amber-50 border-l-4 border-amber-400' : 'hover:bg-gray-50')}>
                          <div className="w-10 text-center flex-shrink-0">
                            {medal ? <span className="text-2xl leading-none">{medal}</span>
                              : <span className="text-base font-bold text-gray-400">#{entry.rank}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={classNames('text-sm font-semibold truncate block',
                              isMe ? 'text-amber-800' : 'text-gray-800')}>
                              {entry.name}
                              {isMe && <span className="ml-2 text-xs font-normal text-amber-600">(you)</span>}
                            </span>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <span className={classNames('text-base font-bold',
                              entry.rank === 1 ? 'text-amber-600' :
                              entry.rank === 2 ? 'text-gray-500' :
                              entry.rank === 3 ? 'text-orange-700' : 'text-gray-700')}>
                              {entry.value}
                            </span>
                            <span className="ml-1 text-xs text-gray-400">{metricLabelFor(entry.value)}</span>
                          </div>
                          <div className="hidden sm:block w-28 flex-shrink-0">
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={classNames('h-2 rounded-full',
                                entry.rank === 1 ? 'bg-amber-400' :
                                entry.rank === 2 ? 'bg-gray-400' :
                                entry.rank === 3 ? 'bg-orange-500' : 'bg-blue-300')}
                                style={{ width: `${Math.round((entry.value / leaderboard[0].value) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        <div className="divide-y divide-gray-100">
                          {top10.map(renderCohortRow)}
                          {iAmOutside && myEntry && (
                            <>
                              <div className="px-6 py-1.5 bg-gray-50 flex items-center gap-2">
                                <div className="flex-1 border-t border-dashed border-gray-300" />
                                <span className="text-xs text-gray-400 flex-shrink-0">{myRank - 10} more above you</span>
                                <div className="flex-1 border-t border-dashed border-gray-300" />
                              </div>
                              {renderCohortRow(myEntry)}
                            </>
                          )}
                        </div>

                        {/* ── Past Monthly Leaderboards ── */}
                        {showPastCohortLb && (
                          <div className="border-t border-gray-200 bg-gray-50">
                            <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-2">
                              <Calendar size={14} className="text-amber-500" />
                              <span className="text-sm font-semibold text-gray-700">Past Monthly Leaderboards — Sessions</span>
                            </div>
                            {pastCohortLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-400" />
                              </div>
                            ) : pastCohortLeaderboards.length === 0 ? (
                              <div className="px-6 py-6 text-center text-sm text-gray-400">No historical data available yet.</div>
                            ) : (
                              <div className="divide-y divide-gray-200">
                                {pastCohortLeaderboards.map(board => (
                                  <div key={board.month} className="px-6 py-4">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                      <span className="text-amber-500">📅</span> {board.label}
                                    </h3>
                                    <div className="space-y-1.5">
                                      {board.entries.map(entry => {
                                        const isMe = entry.user_id === user?.id;
                                        const medal = MEDAL[entry.rank];
                                        return (
                                          <div key={entry.user_id}
                                            className={classNames('flex items-center gap-3 px-3 py-1.5 rounded-lg',
                                              isMe ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-gray-100')}>
                                            <div className="w-8 text-center flex-shrink-0 text-sm">
                                              {medal ?? <span className="text-gray-400 font-bold text-xs">#{entry.rank}</span>}
                                            </div>
                                            <span className={classNames('flex-1 text-xs font-medium truncate',
                                              isMe ? 'text-amber-800' : 'text-gray-800')}>
                                              {entry.name}
                                              {isMe && <span className="ml-1 text-amber-600">(you)</span>}
                                            </span>
                                            <span className={classNames('text-xs font-bold',
                                              entry.rank === 1 ? 'text-amber-600' :
                                              entry.rank === 2 ? 'text-gray-500' :
                                              entry.rank === 3 ? 'text-orange-600' : 'text-gray-600')}>
                                              {entry.value} <span className="font-normal text-gray-400">sessions</span>
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()
                }
              </div>
            )}

            {/* ── Monthly Summary (beneath leaderboard) ──────────────────── */}
            {renderMonthlySummary()}

            {/* Combined Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg shadow p-6 border-2 border-purple-200">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-purple-600 text-white mr-4"><Trophy size={24} /></div>
                  <div>
                    <p className="text-sm font-medium text-purple-900">Certifications</p>
                    <p className="text-2xl font-semibold text-purple-900">
                      {data.certificationSummary?.completed_certifications || 0} / {data.certificationSummary?.total_certifications || 0}
                    </p>
                    <p className="text-xs text-purple-700">Completed</p>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow p-6 border-2 border-blue-200">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-blue-600 text-white mr-4"><Book size={24} /></div>
                  <div>
                    <p className="text-sm font-medium text-blue-900">Learning Activities</p>
                    <p className="text-2xl font-semibold text-blue-900">{data.dashboardSummary?.total_activities || 0}</p>
                    <p className="text-xs text-blue-700">Total Activities</p>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg shadow p-6 border-2 border-yellow-200">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-yellow-600 text-white mr-4"><Clock size={24} /></div>
                  <div>
                    <p className="text-sm font-medium text-yellow-900">In Progress</p>
                    <p className="text-2xl font-semibold text-yellow-900">
                      {(data.certificationSummary?.started_certifications || 0) + (data.dashboardSummary?.started || 0)}
                    </p>
                    <p className="text-xs text-yellow-700">
                      {data.certificationSummary?.started_certifications || 0} Certs • {data.dashboardSummary?.started || 0} Activities
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Certifications Section */}
            {data.certifications.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-pink-50">
                  <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Trophy className="h-7 w-7 text-purple-600" />
                    Certifications
                  </h1>
                </div>

                <div className="divide-y divide-gray-200">
                  {data.certifications.map((cert) => (
                    <div key={cert.certificationName} className="block p-6 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <Link to={cert.route} className="flex items-center space-x-4 flex-1">
                          <div className="p-3 bg-purple-100 rounded-lg">
                            <GraduationCap className="h-6 w-6 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900">{cert.displayName}</h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {cert.completedAssessments} / {cert.totalAssessments} assessments completed
                            </p>
                            {cert.updated_at && (
                              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Updated {new Date(cert.updated_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </Link>
                        <div className="flex items-center space-x-4">
                          <span className={classNames('inline-flex items-center px-3 py-1 rounded-full text-sm font-medium', getProgressColor(cert.progress))}>
                            {cert.progress}
                          </span>
                          {cert.progress === 'completed' && (
                            <>
                              <CheckCircle className="h-6 w-6 text-green-600" />
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadCertificate(cert.certificationName, cert.displayName); }}
                                disabled={downloadingCert === cert.certificationName}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Download Certificate">
                                {downloadingCert === cert.certificationName
                                  ? <RefreshCw className="h-5 w-5 animate-spin" />
                                  : <Download className="h-5 w-5" />}
                                <span className="hidden sm:inline">Download Certificate</span>
                              </button>
                            </>
                          )}
                          {cert.progress !== 'completed' && (
                            <Link to={cert.route}><ArrowRight className="h-5 w-5 text-gray-400" /></Link>
                          )}
                        </div>
                      </div>
                      
                      {/* Certification Assessment Scores Summary */}
                      {cert.progress !== 'not started' && (() => {
                        const certActivity = data.dashboardActivities.find(
                          a => a.activity.toLowerCase() === cert.displayName.toLowerCase() && a.category_activity === 'Certification'
                        );
                        if (!certActivity) return null;
                        if (!hasScores(certActivity)) return null;
                        
                        const allScores = getActivityScores(certActivity);
                        const scores = allScores.filter(s => s.score != null);
                        if (scores.length === 0) return null;
                        
                        return (
                          <div className="mt-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border-2 border-purple-200">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
                                <Trophy className="h-4 w-4" />
                                Assessment Scores
                              </h4>
                              <div className="text-xs text-purple-700 font-medium">
                                {scores.length} of {cert.totalAssessments} completed
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {scores.map(({ dimension, score, maxScore }) => {
                                const scoreLabel = getScoreLabel(score, true);
                                const colorClass = 
                                  score === 3 ? 'bg-green-50 border-green-400 text-green-900' :
                                  score === 2 ? 'bg-blue-50 border-blue-400 text-blue-900' :
                                  score === 1 ? 'bg-yellow-50 border-yellow-400 text-yellow-900' :
                                  'bg-gray-50 border-gray-400 text-gray-900';
                                const badgeColor =
                                  score === 3 ? 'bg-green-600 text-white' :
                                  score === 2 ? 'bg-blue-600 text-white' :
                                  score === 1 ? 'bg-yellow-600 text-white' :
                                  'bg-gray-600 text-white';
                                const icon = 
                                  score === 3 ? <Star className="h-3 w-3 fill-current" /> :
                                  score === 2 ? <CheckCircle className="h-3 w-3" /> : null;
                                
                                return (
                                  <div key={dimension} className={classNames('px-3 py-2.5 rounded-md border-2', colorClass)}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold truncate" title={dimension}>{dimension}</div>
                                        <div className="text-xs mt-1 font-medium flex items-center gap-1">{icon}{scoreLabel}</div>
                                      </div>
                                      <div className="flex-shrink-0">
                                        <span className={classNames('inline-flex items-center px-2 py-1 rounded text-xs font-bold', badgeColor)}>
                                          {score}/{maxScore}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {cert.progress === 'completed' && scores.length > 0 && (
                              <div className="mt-4 pt-3 border-t-2 border-purple-300">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-purple-900">Achievement Level:</span>
                                  <span className={classNames('text-base font-bold px-3 py-1 rounded-full',
                                    scores.every(s => s.score === 3) ? 'bg-green-600 text-white' : 'bg-blue-600 text-white')}>
                                    {scores.every(s => s.score === 3) ? 'Advanced ⭐' : 'Proficient ✓'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── English Skills Section ─────────────────────────────────── */}
            {(() => {
              const englishRows = data.dashboardActivities.filter(a => a.activity === 'english_skills');
              if (englishRows.length === 0) return null;

              const stageMap = new Map<string, DashboardActivity[]>();
              englishRows.forEach(row => {
                const stage = row.category_activity || 'English Skills';
                if (!stageMap.has(stage)) stageMap.set(stage, []);
                stageMap.get(stage)!.push(row);
              });

              const levelColor = (level: string) => {
                switch (level) {
                  case 'Advanced': return 'bg-green-100 text-green-800 border-green-300';
                  case 'Proficient': return 'bg-blue-100 text-blue-800 border-blue-300';
                  case 'Developing': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
                  default: return 'bg-gray-100 text-gray-700 border-gray-300';
                }
              };

              return (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 border-b bg-gradient-to-r from-cyan-50 to-blue-50">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                      <Globe2 className="h-7 w-7 text-cyan-600" />
                      English Skills
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {englishRows.filter(r => r.progress === 'completed').length} sessions completed · {englishRows.length} total
                    </p>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {Array.from(stageMap.entries()).map(([stageName, rows]) => {
                      const bestRow = rows.find(r => r.progress === 'completed') ?? rows[0];
                      const ev = bestRow?.english_skills_evaluation as any;
                      const overallLevel: string = ev?.overall_level ?? null;
                      const subCats: any[] = ev?.sub_categories ?? [];
                      const sessionCount = rows.length;
                      const completedCount = rows.filter(r => r.progress === 'completed').length;

                      return (
                        <Link key={stageName} to="/english-skills" className="block p-5 hover:bg-gray-50 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="p-2 bg-cyan-100 rounded-lg flex-shrink-0 mt-0.5">
                                <Globe2 className="h-5 w-5 text-cyan-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-semibold text-gray-900">{stageName}</h3>
                                <p className="text-sm text-gray-500 mt-0.5">
                                  {sessionCount} session{sessionCount !== 1 ? 's' : ''} · {completedCount} completed
                                </p>
                                {bestRow?.title && (
                                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                                    Latest topic: <span className="italic">{bestRow.title}</span>
                                  </p>
                                )}
                                {subCats.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {subCats.map((sc: any) => (
                                      <span key={sc.name}
                                        className={classNames('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', levelColor(sc.level))}>
                                        {sc.name}: {sc.level}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              {overallLevel && (
                                <span className={classNames('inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border', levelColor(overallLevel))}>
                                  <TrendingUp className="h-3.5 w-3.5 mr-1" />{overallLevel}
                                </span>
                              )}
                              <span className={classNames('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getProgressColor(bestRow?.progress ?? 'not started'))}>
                                {bestRow?.progress ?? 'not started'}
                              </span>
                              <ArrowRight className="h-4 w-4 text-gray-400 mt-1" />
                            </div>
                          </div>
                          <div className="mt-2 flex items-center text-xs text-gray-400">
                            <Clock size={13} className="mr-1" />
                            Updated {new Date(bestRow.updated_at).toLocaleDateString()}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Category Filter */}
            {uniqueCategories.length > 1 && (
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-700">Filter by category:</span>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setSelectedCategory('all')}
                      className={classNames('px-3 py-1 rounded-full text-sm font-medium transition-colors',
                        selectedCategory === 'all' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                      All ({filteredActivities.length})
                    </button>
                    {uniqueCategories.map((category) => {
                      const count = data.dashboardActivities.filter(
                        a => a.category_activity === category && a.category_activity !== 'Certification'
                      ).length;
                      return (
                        <button key={category} onClick={() => setSelectedCategory(category)}
                          className={classNames('px-3 py-1 rounded-full text-sm font-medium transition-colors',
                            selectedCategory === category ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                          {category} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Learning Activities */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-lg font-medium text-gray-900">
                  My Learning Activities
                  {selectedCategory !== 'all' && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      - {selectedCategory} ({filteredActivities.length})
                    </span>
                  )}
                </h2>
              </div>

              <div className="divide-y divide-gray-200">
                {filteredActivities.length > 0 ? (
                  filteredActivities.map((activity) => {
                    const isLinkable = activity.progress === 'started' && activity.learning_module_id;
                    let activityLink: string | null = null;
                    if (isLinkable) {
                      const cat = activity.category_activity;
                      const subCat = activity.sub_category;
                      if (cat === 'AI Learning') activityLink = `/learning/ai/${activity.learning_module_id}`;
                      else if (subCat === 'Vibe Coding' || cat === 'Vibe Coding' || cat === 'Tech Workshop') activityLink = '/tech-skills/vibe-coding';
                      else if (cat === 'Skills' || cat === 'Critical Thinking' || subCat === 'Critical Thinking' ||
                        cat === 'Problem-Solving' || cat === 'Problem Solving' || subCat === 'Problem-Solving' ||
                        cat === 'Creativity' || subCat === 'Creativity' || cat === 'Communication' || subCat === 'Communication' ||
                        cat === 'Digital Fluency' || subCat === 'Digital Fluency')
                        activityLink = '/learning/skills';
                      else activityLink = `/learning/ai/${activity.learning_module_id}`;
                    }

                    const isAdvancedComplete = false;

                    const content = (
                      <div className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4 flex-1">
                            <div className="p-2 bg-gray-100 rounded-lg">{getCategoryIcon(activity.category_activity)}</div>
                            <div className="flex-1">
                              <h3 className="text-base font-medium text-gray-900">{activity.activity}</h3>
                              <p className="text-sm text-gray-500">
                                {activity.category_activity}
                                {activity.sub_category && <span className="text-gray-400"> • {activity.sub_category}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <span className={classNames('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getProgressColor(activity.progress))}>
                              {activity.progress}
                            </span>
                            {(activity.evaluation_score != null || activity.certification_evaluation_score != null) && (
                              <div className="text-lg font-semibold text-green-600">
                                {activity.certification_evaluation_score ?? activity.evaluation_score}%
                              </div>
                            )}
                            {isLinkable && <ArrowRight className="h-5 w-5 text-blue-600" />}
                          </div>
                        </div>
                        
                        {hasScores(activity) && (
                          <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-gray-700">Evaluation Scores</h4>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedActivityForDetails(activity); setShowDetailsModal(true); }}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">
                                View Full Details →
                              </button>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {getActivityScores(activity).filter(s => s.score != null).map(({ dimension, score, maxScore, evidence }) => {
                                const isCert = activity.category_activity === 'Certification';
                                const scoreLabel = getScoreLabel(score, isCert);
                                const colorClass = 
                                  score === maxScore ? 'bg-green-50 border-green-300 text-green-900' :
                                  score === maxScore - 1 ? 'bg-blue-50 border-blue-300 text-blue-900' :
                                  score === maxScore - 2 ? 'bg-yellow-50 border-yellow-300 text-yellow-900' :
                                  'bg-red-50 border-red-300 text-red-900';
                                const badgeColor =
                                  score === maxScore ? 'bg-green-600 text-white' :
                                  score === maxScore - 1 ? 'bg-blue-600 text-white' :
                                  score === maxScore - 2 ? 'bg-yellow-600 text-white' :
                                  'bg-red-600 text-white';
                                
                                return (
                                  <div key={dimension} className={classNames('px-3 py-2 rounded-md border-2', colorClass)}
                                    title={evidence || 'No evidence recorded'}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate" title={dimension}>{dimension}</div>
                                        <div className="text-xs mt-0.5 opacity-75">{scoreLabel}</div>
                                      </div>
                                      <div className="flex-shrink-0">
                                        <span className={classNames('inline-flex items-center px-2 py-0.5 rounded text-xs font-bold', badgeColor)}>
                                          {score}/{maxScore}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {(activity.certification_evaluation_score != null || activity.evaluation_score != null) && (
                              <div className="mt-3 pt-3 border-t border-gray-300">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-gray-700">Overall Score:</span>
                                  <span className="text-lg font-bold text-green-600">
                                    {activity.certification_evaluation_score ?? activity.evaluation_score}%
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className="mt-2 flex items-center text-sm text-gray-500">
                          <Clock size={16} className="mr-1.5" />
                          <span>Updated {new Date(activity.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );

                    return activityLink ? (
                      <Link key={activity.id} to={activityLink}
                        state={{ activityId: activity.id, learningModuleId: activity.learning_module_id }}
                        className="block hover:bg-gray-50 transition-colors">
                        {content}
                      </Link>
                    ) : (
                      <div key={activity.id}>{content}</div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-gray-500">
                      {selectedCategory === 'all' ? 'No learning activities found.' : `No activities found for ${selectedCategory}.`}
                    </p>
                    <p className="text-sm text-gray-400 mt-2">Activities should be automatically created based on your grade level.</p>
                    <div className="mt-4">
                      <Button onClick={refreshDashboard} icon={<RefreshCw size={16} />} isLoading={refreshing}>
                        Load My Activities
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Projects Section */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-lg font-medium text-gray-900">My Projects</h2>
                <Link to="/projects/new">
                  <Button icon={<Plus size={16} />} size="sm">New Project</Button>
                </Link>
              </div>

              <div className="divide-y divide-gray-200">
                {data.projects.length > 0 ? (
                  data.projects.slice(0, 5).map((project) => (
                    <div key={project.id} className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-medium text-gray-900">
                            <Link to={`/project/${project.id}`} className="hover:text-blue-600 transition-colors">
                              {project.title}
                            </Link>
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">{project.description}</p>
                        </div>
                        <div className="text-right">
                          <span className={classNames('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', {
                            'bg-gray-100 text-gray-800': project.status === 'draft',
                            'bg-blue-100 text-blue-800': project.status === 'in_progress',
                            'bg-green-100 text-green-800': project.status === 'completed',
                            'bg-red-100 text-red-800': project.status === 'archived',
                          })}>
                            {project.status.replace('_', ' ')}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">Updated {new Date(project.updated_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-gray-500">No projects yet.</p>
                    <p className="text-sm text-gray-400 mt-2">Create your first project to get started!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Activity Score Details Modal */}
      {showDetailsModal && selectedActivityForDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto" onClick={() => setShowDetailsModal(false)}>
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 transition-opacity" />
            
            <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedActivityForDetails.activity}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedActivityForDetails.category_activity}
                    {selectedActivityForDetails.sub_category && <span className="text-gray-400"> • {selectedActivityForDetails.sub_category}</span>}
                  </p>
                </div>
                <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Overall Score</span>
                  <span className={classNames('text-3xl font-bold',
                    (selectedActivityForDetails.certification_evaluation_score ?? selectedActivityForDetails.evaluation_score) === 100 
                      ? 'text-green-600' : 'text-indigo-600')}>
                    {selectedActivityForDetails.certification_evaluation_score ?? selectedActivityForDetails.evaluation_score ?? 0}%
                  </span>
                </div>
                <div className="mt-3">
                  <div className="w-full bg-white rounded-full h-3 shadow-inner">
                    <div className={classNames('h-3 rounded-full transition-all',
                      (selectedActivityForDetails.certification_evaluation_score ?? selectedActivityForDetails.evaluation_score) === 100 
                        ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-indigo-500 to-purple-600')}
                      style={{ width: `${selectedActivityForDetails.certification_evaluation_score ?? selectedActivityForDetails.evaluation_score ?? 0}%` }} />
                  </div>
                </div>
              </div>

              <div className="px-6 py-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Trophy className="w-5 h-5 text-yellow-500 mr-2" />
                  Score Breakdown
                </h3>
                
                {(() => {
                  const scores = getActivityScores(selectedActivityForDetails);
                  const isCertification = selectedActivityForDetails.category_activity === 'Certification';
                  
                  return (
                    <div className="space-y-4">
                      {scores.map(({ dimension, score, evidence, maxScore }) => {
                        const colorClass = 
                          score === maxScore ? 'bg-green-100 text-green-800 border-green-300' :
                          score === maxScore - 1 ? 'bg-blue-100 text-blue-800 border-blue-300' :
                          score === maxScore - 2 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                          'bg-red-100 text-red-800 border-red-300';
                        const barColor =
                          score === maxScore ? 'bg-green-500' :
                          score === maxScore - 1 ? 'bg-blue-500' :
                          score === maxScore - 2 ? 'bg-yellow-500' : 'bg-red-500';
                        
                        return (
                          <div key={dimension} className="border-l-4 border-indigo-500 pl-4 py-2 bg-gray-50 rounded-r-lg">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-gray-900">{dimension}</h4>
                              <span className={classNames('px-3 py-1 rounded-full text-sm font-bold border shadow-sm', colorClass)}>
                                {score ?? 0}/{maxScore} — {getScoreLabel(score, isCertification)}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                              <div className={classNames('h-2 rounded-full transition-all', barColor)}
                                style={{ width: `${((score ?? 0) / maxScore) * 100}%` }} />
                            </div>
                            {evidence && evidence.trim() && (
                              <div className="text-sm text-gray-700 bg-white rounded-lg p-3 mt-2 border border-gray-200">
                                <strong className="text-indigo-700">Evidence:</strong> {evidence}
                              </div>
                            )}
                            {(!evidence || !evidence.trim()) && score != null && (
                              <p className="text-sm text-gray-400 italic mt-2">No evidence recorded</p>
                            )}
                          </div>
                        );
                      })}
                      
                      {scores.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                          <p>No detailed scores available for this activity.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex justify-between items-center">
                <span className="text-sm text-gray-500 flex items-center">
                  <Clock className="w-4 h-4 mr-1.5" />
                  Updated: {new Date(selectedActivityForDetails.updated_at).toLocaleDateString()}
                </span>
                <button onClick={() => setShowDetailsModal(false)}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default DashboardPage;