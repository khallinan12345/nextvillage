// src/pages/community-impact/EntrepreneurshipConsultantPage.tsx
//
// Entrepreneurship Consultant — Community Impact Track
// A professional casebook tool for youth entrepreneurship advisors serving
// young Nigerian entrepreneurs in Oloibiri (Bayelsa) and Ibiade (Ogun).
//
// The youth advisor registers entrepreneur clients, runs structured intake
// interviews guided by AI probe coaching, gets AI-generated business advice,
// and maintains a case history per client — with follow-up tracking.
//
// The student LEARNS entrepreneurship in the process:
//  - LEARN mode: AI tutor on 6 business topics
//  - CASEBOOK mode: register clients, run structured consultations, save cases
//  - CONSULT mode: role-play with AI entrepreneur personas + evaluation
//
// DB tables: entrepreneurship_clients
//            entrepreneurship_consultations
//            (view: entrepreneurship_client_summary)
//
// Route: /community-impact/entrepreneurship
// Activity: entrepreneurship_consultant

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { resolveChallengeOrgSlug } from '../../lib/communityChallengeScope';
import { chatText, chatJSON } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { PidginTooltip } from '../../components/PidginTooltip';
import { playPidginVoice, stopPidginSpeech } from '../../lib/speechCoordination';
import { ResolutionModal, ResolutionSubmitData } from '../../components/community-impact/ResolutionModal';
import { EvidencePicker } from '../../components/community-impact/EvidencePicker';
import {
  Briefcase, BookOpen, Users, ArrowLeft, Send, Mic, MicOff,
  Volume2, VolumeX, Save, Star, Loader2, X, ChevronRight,
  TrendingUp, Lightbulb, ShieldCheck, Award, RefreshCw,
  DollarSign, Smartphone, Target, BarChart2, Handshake, Zap,
  Plus, FileText, CheckCircle, Clock, AlertTriangle, Calendar,
  ClipboardList, Store, Trash2,
} from 'lucide-react';
import classNames from 'classnames';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type AppMode =
  | 'select'
  | 'learn-topics' | 'learn-chat'
  | 'casebook-dashboard' | 'add-client' | 'client-detail'
  | 'new-consultation' | 'case-detail' | 'followup-chat'
  | 'consult-personas' | 'consult-prepare' | 'consult-chat'
  | 'enterprise-dashboard' | 'enterprise-add';

type ConsultationType =
  | 'starting-up'
  | 'business-planning'
  | 'pricing-finance'
  | 'marketing-sales'
  | 'fixing-problems'
  | 'growing-scaling';

type UrgencyLevel = 'low' | 'medium' | 'high' | 'urgent';

// ─── Challenge types ──────────────────────────────────────────────────────────

interface ActiveChallenge {
  enrollmentId: string;
  challengeId: string;
  title: string;
  description: string;
  challenge_mode_intro: string;
  challenge_instruction: string;
  return_question_1: string;
  return_question_2: string;
  return_question_3: string | null;
  tier_target: string;
}

interface ChallengeEvalResult {
  tier: string;
  tier_label: string;
  summary: string;
  tier_reasoning: string;
  follow_up_instruction: string;
  next_tier_hint: string;
}

interface Client {
  id: string;
  youth_user_id: string;
  client_name: string;
  village: string;
  phone: string | null;
  business_type: string;
  business_stage: string;
  notes: string | null;
  created_at: string;
  total_consultations?: number;
  open_cases?: number;
  last_consultation_at?: string | null;
}

interface Consultation {
  id: string;
  client_id: string;
  youth_user_id: string;
  consultation_type: ConsultationType;
  problem_summary: string;
  ai_advice: string | null;
  urgency_level: UrgencyLevel | null;
  youth_actions_taken: string | null;
  conversation_history: ChatMessage[];
  follow_up_needed: boolean;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolution_outcome: 'applied' | 'partially_applied' | 'not_applied' | null;
  resolution_narrative: string | null;
  resolution_value_amount: number | null;
  resolution_value_unit: string | null;
  resolution_value_label: string | null;
  created_at: string;
}

interface EnterpriseEntry {
  id: string;
  user_id: string;
  enterprise_name: string | null;
  item_or_service: string;
  buyer_description: string | null;
  amount: number | null;
  unit: 'NGN' | 'other';
  entry_date: string;
  notes: string | null;
  created_at: string;
}

interface IntakeField {
  key: string;
  label: string;
  placeholder: string;
  tooltip: string;
  required?: boolean;
}

interface LearningTopic {
  id: string; title: string; subtitle: string;
  icon: React.ReactNode; colour: string; urgency?: string;
}

interface EntrepreneurPersona {
  id: string; name: string; age: string; description: string;
  emoji: string; colour: string; situation: string;
  businessIdea: string; mainChallenge: string;
  openingLine: string; systemPrompt: string;
}

// ─── Nigeria Business Context ─────────────────────────────────────────────────

const NIGERIA_BUSINESS_CONTEXT = `
NIGERIA ENTREPRENEURSHIP CONTEXT (always apply):

REGISTRATION:
- CAC Business Name: ~₦10,000–25,000; needed for bank account, grants, formal contracts
- Private Ltd: ~₦60,000+; needed for investment, loans
- Register: cac.gov.ng or CAC office Yenagoa
- TIN: free; needed for government/formal transactions
- SMEDAN: free registration; access to government support programs

FINANCING:
- Ajo/Esusu cooperative savings: groups of 8–20 contribute monthly; lump sum on your turn; as reliable as a bank
- Tony Elumelu Foundation: ₦5M grant + mentoring; tefconnect.com; competitive but real
- NIRSAL Microfinance: government-backed small business loans
- LAPO Microfinance: accessible loans; known for Niger Delta women
- BOI (Bank of Industry): loans from ₦500,000; needs CAC + business plan
- AVOID: loan sharks, social media lending schemes

MOBILE BANKING:
- Opay, Palmpay: free POS, transfers, merchant services
- Kuda: no-fee digital bank; good for saving business income separately
- Keep business money SEPARATE from personal money — non-negotiable

PRICING:
- Calculate FULL cost: materials + labour + overheads (generator, transport, packaging, data)
- Selling Price = Cost ÷ (1 - target margin)
- At 40% margin: cost ₦600 → sell at ₦1,000
- Never price based only on competitors — know your own costs first

MARKETING:
- WhatsApp Business: #1 tool; broadcast lists (256 contacts), catalogue, status updates, quick replies
- Facebook Marketplace: free; good for products; Yenagoa groups very active
- Instagram/TikTok: for visual businesses (food, fashion, hair)
- Word of mouth + referrals: most powerful in community settings
- First rule: talk to 10 potential customers BEFORE spending any money

RECORD-KEEPING:
- Even a notebook works: Date | Sales | Purchases | Expenses | Balance
- Separate business and personal money from day one
- Free apps: Wave Accounting, Zoho Books (free tier), Google Sheets

AI IN BUSINESS (always connect AI to the entrepreneur's specific situation):
- AI can help write WhatsApp broadcast messages, product descriptions, customer replies
- AI can help calculate prices, compare suppliers, analyse costs
- AI can help create a simple business plan or pitch document
- AI can help find market prices, competitors, grant opportunities online
- Practical AI tools for small business: ChatGPT, Google Gemini (free), WhatsApp Business automation
- Frame AI as a tool that gives small businesses access to information and skills they previously couldn't afford
`;

// ─── Structured Intake Fields per Consultation Type ──────────────────────────

const INTAKE_FIELDS: Record<ConsultationType, IntakeField[]> = {
  'starting-up': [
    { key: 'business_idea', label: 'Business idea and target customer', placeholder: 'e.g. Selling small chops at events in Yenagoa; target customers: event planners, churches, families', tooltip: 'The clearer the idea and customer, the better the advice. Vague ideas like "I want to sell things" need to be narrowed down first.', required: true },
    { key: 'capital', label: 'How much money they have to start', placeholder: 'e.g. ₦80,000 saved; father will add ₦20,000; no loan yet', tooltip: 'Capital determines which path is realistic. Never recommend a route that requires money they do not have.', required: true },
    { key: 'validation', label: 'Have they tested the idea with real customers yet?', placeholder: 'e.g. Made 3 batches for neighbours, sold out; or never tested yet', tooltip: 'Validation — actually selling something — is the most important step before spending capital. Find out if they have done this.', required: true },
    { key: 'skills', label: 'Relevant skills or experience', placeholder: 'e.g. Cooked for family events for 3 years; self-taught phone repair via YouTube', tooltip: 'Skills reduce startup costs. A skilled baker needs less training investment than a total beginner.' },
    { key: 'competition', label: 'Who else does this nearby, and how does the entrepreneur differ?', placeholder: 'e.g. Two other food sellers nearby but they don\'t do delivery; or no competition in this village', tooltip: 'Understanding competition helps define the unique value proposition — what makes this business better or different.' },
    { key: 'registration', label: 'Are they registered or planning to register?', placeholder: 'e.g. Not yet; wants to register CAC Business Name; or already registered', tooltip: 'CAC registration enables a business bank account, which separates business and personal money — a critical first step.' },
  ],
  'business-planning': [
    { key: 'current_state', label: 'Current business situation', placeholder: 'e.g. Running for 6 months, getting 5–8 orders/week but feels disorganised; no records', tooltip: 'Understanding where they are now is essential before planning where to go. Avoid giving generic advice without this.', required: true },
    { key: 'revenue_costs', label: 'Monthly revenue and main costs', placeholder: 'e.g. About ₦45,000 income per month; spend ₦25,000 on ingredients; not sure about other costs', tooltip: 'Revenue and cost awareness is the foundation of any business plan. Many entrepreneurs guess — help them calculate precisely.', required: true },
    { key: 'goal', label: 'What they want to achieve in 6–12 months', placeholder: 'e.g. Hire one helper and double orders; or register and open a proper shop; or just make it more stable', tooltip: 'Goals shape the plan. A stability goal requires a different plan than a growth goal.' },
    { key: 'biggest_block', label: 'What is stopping them from growing or stabilising', placeholder: 'e.g. Can\'t keep up with demand alone; losing customers because response too slow; no records so don\'t know profit', tooltip: 'The real constraint — not the surface answer — is what the plan must address. Push for specifics here.' },
    { key: 'record_keeping', label: 'Do they keep any financial records?', placeholder: 'e.g. Nothing written down; uses a notebook; has a spreadsheet', tooltip: 'No records = no real understanding of profit. A simple notebook system is the first action for most entrepreneurs.' },
  ],
  'pricing-finance': [
    { key: 'product_service', label: 'What they sell and their current price', placeholder: 'e.g. Garri at ₦4,500/bag; small chops for events at ₦40,000 per 100 guests; airtime at ₦200 per unit', tooltip: 'Know exactly what is being priced before asking about costs.', required: true },
    { key: 'cost_breakdown', label: 'What it costs to make or deliver (list all costs)', placeholder: 'e.g. Cassava ₦3,500; processing + labour ₦800; transport + bags ₦400 = ₦4,700 total', tooltip: 'Most entrepreneurs undercount costs — especially their own time, transport, generator/fuel, packaging, and spoilage. Push to get ALL costs.', required: true },
    { key: 'how_price_set', label: 'How did they decide on the current price?', placeholder: 'e.g. Based on what the trader next door charges; guessed; asked a friend', tooltip: 'Most small businesses price by copying competitors — this leads to unsustainable margins. Identify this habit before fixing it.' },
    { key: 'money_separation', label: 'Do they separate business and personal money?', placeholder: 'e.g. All in one account; or uses Kuda separate account; or cash in an envelope', tooltip: 'Mixing money is the single biggest cause of businesses failing without the owner realising. This is always a priority fix.' },
    { key: 'financing_need', label: 'Do they need financing, and what for?', placeholder: 'e.g. Need ₦200,000 for a second sewing machine; or looking for a grant; or want to join an Ajo group', tooltip: 'Identify the real financing need before suggesting a source. Match the need to the right tool: Ajo, TEF grant, LAPO, BOI.' },
  ],
  'marketing-sales': [
    { key: 'current_marketing', label: 'How they currently find customers', placeholder: 'e.g. Word of mouth; WhatsApp status; market stall; Facebook; nothing formal', tooltip: 'Understand the current channel before recommending new ones. Most businesses should optimise their best existing channel first.', required: true },
    { key: 'best_customer', label: 'Who is their best customer (describe them)', placeholder: 'e.g. Event planners aged 25–40 in Yenagoa who need 100+ guests catered; or households who buy weekly', tooltip: 'The more specific the customer description, the more targeted and effective the marketing advice can be.' },
    { key: 'whatsapp_setup', label: 'Do they use WhatsApp Business?', placeholder: 'e.g. Uses personal WhatsApp; or has Business account but no catalogue; or fully set up with broadcast lists', tooltip: 'WhatsApp Business is the most powerful free marketing tool for Nigerian small businesses. Assess current setup and gaps.' },
    { key: 'conversion_problem', label: 'What happens between someone showing interest and actually buying?', placeholder: 'e.g. Many people say they\'re interested but don\'t follow through; or people ask price then disappear', tooltip: 'The gap between interest and purchase is the conversion problem — the most common and fixable marketing issue.' },
    { key: 'repeat_customers', label: 'How many customers come back, and how do they keep in touch?', placeholder: 'e.g. About half come back; or no system for follow-up; or adds everyone to broadcast list', tooltip: 'Repeat customers cost nothing to acquire. A simple follow-up system (WhatsApp broadcast) can double revenue from existing customers.' },
  ],
  'fixing-problems': [
    { key: 'problem_description', label: 'What problem is the business facing right now', placeholder: 'e.g. Sales dropped 40% in the last 2 months; key employee left and took customers; supplier raised prices', tooltip: 'Get the full picture of the problem before diagnosing. Ask how long it has been happening and what changed.', required: true },
    { key: 'when_started', label: 'When the problem started and what changed around then', placeholder: 'e.g. Started after Sallah/Christmas season ended; after a bad review; after price increase', tooltip: 'Timing correlates with cause. A seasonal drop is different from a structural problem requiring different solutions.' },
    { key: 'tried_so_far', label: 'What they have already tried', placeholder: 'e.g. Tried lowering price — made it worse; tried posting more on WhatsApp — no response', tooltip: 'Knowing what failed narrows the solution space and avoids repeating ineffective advice.' },
    { key: 'cash_situation', label: 'Current cash and financial pressure', placeholder: 'e.g. Three weeks of operating expenses left; family depending on this income; or financially stable but worried', tooltip: 'Financial urgency determines whether the fix needs to be immediate (cash crisis) or can be medium-term (strategic improvement).' },
    { key: 'ai_opportunity', label: 'Could AI help with this specific problem?', placeholder: 'e.g. Could use AI to write better customer messages; AI to research competitor prices; AI to draft a proposal', tooltip: 'Connect AI to the specific problem. A marketing problem might be solved by AI-written WhatsApp templates. A pricing problem by AI cost analysis.' },
  ],
  'growing-scaling': [
    { key: 'current_size', label: 'Current monthly revenue and team', placeholder: 'e.g. ₦120,000/month revenue; operates alone; or has 1 helper', tooltip: 'Scale readiness depends on current performance. You should not advise scaling before the business is consistently profitable.', required: true },
    { key: 'profitability', label: 'Monthly profit (after all costs including own salary)', placeholder: 'e.g. About ₦40,000 net after all costs for past 3 months; or not sure; or varies a lot', tooltip: 'Profit consistency for 3+ months is the minimum threshold before scaling. Help them calculate this accurately.', required: true },
    { key: 'bottleneck', label: 'What is limiting growth right now', placeholder: 'e.g. Can\'t take more orders alone; running out of storage space; no money for more stock', tooltip: 'The real constraint determines the growth strategy. A people bottleneck needs hiring/delegation; a capital bottleneck needs financing.' },
    { key: 'systematised', label: 'Are processes documented? Can someone else follow them?', placeholder: 'e.g. Everything is in my head; or has a recipe/process sheet; or trained one person already', tooltip: 'A business that depends entirely on the owner\'s knowledge cannot scale. Systemisation must come before delegation.' },
    { key: 'growth_goal', label: 'What does growth look like to them — specifically', placeholder: 'e.g. Open a second location; hire 2 people; reach Yenagoa wholesale market; export to Port Harcourt', tooltip: 'Make the growth goal specific. "I want to grow" is not a plan. "I want to supply 3 restaurants in Yenagoa by December" is a plan.' },
  ],
};

// ─── Consultation Type Config ─────────────────────────────────────────────────

const CONSULT_TYPES: Record<ConsultationType, {
  label: string; emoji: string; colour: string;
  bgLight: string; border: string; textColour: string; description: string;
}> = {
  'starting-up':      { label: 'Starting Up',        emoji: '🚀', colour: 'from-amber-600 to-yellow-600',   bgLight: 'bg-amber-50',   border: 'border-amber-300',   textColour: 'text-amber-700',   description: 'Validate the idea, register, open a business account, and take the first real step' },
  'business-planning': { label: 'Business Planning',  emoji: '📋', colour: 'from-blue-600 to-indigo-600',   bgLight: 'bg-blue-50',    border: 'border-blue-300',    textColour: 'text-blue-700',    description: 'Business Model Canvas, profit check, goals, and the one thing blocking growth' },
  'pricing-finance':  { label: 'Pricing & Finance',   emoji: '💰', colour: 'from-green-600 to-emerald-600', bgLight: 'bg-green-50',   border: 'border-green-300',   textColour: 'text-green-700',   description: 'Price correctly, calculate real profit, separate money, find the right financing' },
  'marketing-sales':  { label: 'Marketing & Sales',   emoji: '📱', colour: 'from-pink-600 to-rose-600',    bgLight: 'bg-pink-50',    border: 'border-pink-300',    textColour: 'text-pink-700',    description: 'WhatsApp Business, social media, word-of-mouth, and converting interest to sales' },
  'fixing-problems':  { label: 'Fixing a Problem',    emoji: '🔧', colour: 'from-orange-600 to-red-600',   bgLight: 'bg-orange-50',  border: 'border-orange-300',  textColour: 'text-orange-700',  description: 'Diagnose what is wrong — falling sales, cash crisis, lost customers — and fix it' },
  'growing-scaling':  { label: 'Growing & Scaling',   emoji: '📈', colour: 'from-purple-600 to-violet-600', bgLight: 'bg-purple-50',  border: 'border-purple-300',  textColour: 'text-purple-700',  description: 'When and how to hire, delegate, expand markets, and scale without losing quality' },
};

const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string; colour: string; bg: string; border: string; textDark: string; icon: React.ReactNode; description: string;
}> = {
  low:    { label: 'Low',    colour: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-300',  textDark: 'text-green-800',  icon: <CheckCircle size={13}/>,   description: 'No immediate crisis — plan and improve at a steady pace.' },
  medium: { label: 'Medium', colour: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-400', textDark: 'text-yellow-800', icon: <Clock size={13}/>,         description: 'Act this week — momentum matters.' },
  high:   { label: 'High',   colour: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-400', textDark: 'text-orange-800', icon: <AlertTriangle size={13}/>, description: 'Act today — cash or customer loss is escalating.' },
  urgent: { label: 'URGENT', colour: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-400',    textDark: 'text-red-800',    icon: <AlertTriangle size={13}/>, description: 'Immediate action needed — business survival at risk.' },
};

const BUSINESS_STAGES = ['Idea stage (not started yet)', 'Just started (0–6 months)', 'Early stage (6–18 months)', 'Established (18+ months)', 'Struggling / need to fix'];
const VILLAGES = ['Oloibiri', 'Ibiade', 'Yenagoa', 'Nembe', 'Ogbia', 'Sagamu', 'Abeokuta', 'Other'];

// ─── Probe Prompt ─────────────────────────────────────────────────────────────

function buildProbePrompt(field: IntakeField, consultType: ConsultationType, client: Client, currentIntake: Record<string, string>): string {
  const ct = CONSULT_TYPES[consultType];
  const filledSoFar = Object.entries(currentIntake)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || 'nothing yet';

  return `You are coaching a youth entrepreneurship advisor in ${client.village}, Nigeria. They are sitting with an entrepreneur RIGHT NOW and need you to guide an in-depth interview about one specific topic.

ENTREPRENEUR: ${client.client_name}, ${client.village}
BUSINESS: ${client.business_type} (Stage: ${client.business_stage})
CONSULTATION TYPE: ${ct.emoji} ${ct.label}
TOPIC BEING EXPLORED: "${field.label}"
WHY IT MATTERS: ${field.tooltip}

INTAKE GATHERED SO FAR:
${filledSoFar}

${NIGERIA_BUSINESS_CONTEXT}

YOUR ROLE:
- Ask ONE focused question at a time the advisor can read directly to the entrepreneur
- Keep language simple — the advisor may translate to Pidgin, Ijaw, or Yoruba
- Build a complete picture of this specific topic before moving on
- When you have enough detail, end with the EXACT phrase: "✅ This topic is well characterised. You can move on."
- There is NO limit on questions — follow the thread wherever it leads
- If a financially risky answer appears (e.g. planning a large loan before validation), probe deeper
- Always connect AI capabilities to the entrepreneur's specific situation

FORMAT: One short question. After the advisor gives the answer, probe deeper or confirm characterisation. Be direct, brief — coaching in real time.

Start now with your FIRST question about: "${field.label}"`;
}

// ─── AI Advice Prompt ─────────────────────────────────────────────────────────

function buildAdvicePrompt(consultType: ConsultationType, client: Client, intake: Record<string, string>): string {
  const ct = CONSULT_TYPES[consultType];
  const intakeSummary = INTAKE_FIELDS[consultType]
    .map(f => `${f.label}: ${intake[f.key]?.trim() || 'not provided'}`)
    .join('\n');

  const allText = Object.values(intake).join(' ').toLowerCase();
  const cashCrisis = allText.includes('weeks left') || allText.includes('no money') || allText.includes('can\'t pay');
  const loanRisk = allText.includes('loan') && (allText.includes('₦500,000') || allText.includes('₦1,000,000') || allText.includes('before') || allText.includes('first'));

  let urgencyHint = '';
  if (cashCrisis) urgencyHint = '\n🚨 CASH CRISIS DETECTED — open with URGENT. Lead with immediate revenue-generating actions before any strategic advice.';
  else if (loanRisk) urgencyHint = '\n⚠️ HIGH-RISK LOAN PLAN — open with HIGH urgency. Redirect to validation-first approach before any capital commitment.';

  return `You are an expert business development advisor supporting a youth entrepreneurship advisor working with smallholder entrepreneurs in Oloibiri (Bayelsa) and Ibiade (Ogun), Nigeria.

${NIGERIA_BUSINESS_CONTEXT}

CONSULTATION: ${ct.emoji} ${ct.label}
ENTREPRENEUR: ${client.client_name}, ${client.village}
BUSINESS: ${client.business_type} (Stage: ${client.business_stage})

STRUCTURED INTAKE COMPLETED:
${intakeSummary}

YOUR TASK: Provide a complete, actionable business advisory response.

STRUCTURE YOUR RESPONSE:
1. **URGENCY LEVEL**: State LOW / MEDIUM / HIGH / URGENT — and the single most important reason
2. **DIAGNOSIS**: What are the 2–3 most important things you see? Name the real barrier, not just the surface question.
3. **IMMEDIATE ACTIONS** (today, step by step — prioritise free or low-cost actions first):
   - What the ENTREPRENEUR can do right now
   - What the YOUTH ADVISOR should help arrange
4. **MEDIUM-TERM PLAN**: What to do in the next 1–4 weeks
5. **AI TOOLS FOR THIS BUSINESS**: Name 1–2 specific ways AI could help THIS entrepreneur with THIS situation. Be concrete — "Use ChatGPT to write your first WhatsApp broadcast list message for event bookings" not generic advice.
6. **WHAT NOT TO DO**: 1–2 critical mistakes to avoid (especially around loans, scaling too early, or ignoring costs)
7. **ONE ACTION TODAY**: End with one sentence — the single most important thing the entrepreneur can do today, ideally at zero cost

FORMAT:
- Short paragraphs and bullet points
- Specific and local — Naira amounts, local references, Nigerian platforms (CAC, Opay, Ajo, TEF, WhatsApp Business)
- Plain language the advisor can read aloud to the entrepreneur
${urgencyHint}

⚠️ DISCLAIMER: This is advisory support only. For legal, tax, or formal registration matters, refer to a CAC-registered agent or appropriate authority.`;
}

// ─── Follow-up Chat Prompt ────────────────────────────────────────────────────

function buildFollowupPrompt(client: Client, consultation: Consultation): string {
  const ct = CONSULT_TYPES[consultation.consultation_type];
  const uc = consultation.urgency_level ? URGENCY_CONFIG[consultation.urgency_level] : null;
  return `You are an expert business development advisor supporting a youth entrepreneurship advisor in Nigeria. A structured consultation has been completed and the advisor has follow-up questions.

${NIGERIA_BUSINESS_CONTEXT}

ENTREPRENEUR: ${client.client_name}, ${client.village}
BUSINESS: ${client.business_type}
CONSULTATION TYPE: ${ct.emoji} ${ct.label}
URGENCY: ${uc ? uc.label : 'not assessed'}
PROBLEM SUMMARY: ${consultation.problem_summary}
AI ADVICE GIVEN: ${consultation.ai_advice ?? 'see case record'}

The advisor may ask follow-up questions about the advice, how to explain something to the entrepreneur, referral logistics (CAC, TEF, Ajo, LAPO), or any practical business question related to this case.

Respond with practical, specific, actionable advice. Reference Naira amounts, local contacts, and Nigerian tools. Keep answers concise.`;
}

// ─── Learning Topics ──────────────────────────────────────────────────────────

const LEARNING_TOPICS: LearningTopic[] = [
  { id: 'starting', title: 'Starting a Business in Nigeria', subtitle: 'CAC registration, TIN, bank accounts, and validation before spending', icon: <Zap size={22} />, colour: 'from-amber-600 to-yellow-600', urgency: '🚀 Essential first steps' },
  { id: 'planning', title: 'Business Planning & the Business Model Canvas', subtitle: 'How to think through a business idea before spending a naira', icon: <Target size={22} />, colour: 'from-blue-600 to-indigo-600', urgency: '📋 Plan before you spend' },
  { id: 'pricing', title: 'Pricing, Profit & Record-Keeping', subtitle: 'How to price correctly, calculate profit, and track money', icon: <DollarSign size={22} />, colour: 'from-green-600 to-emerald-600', urgency: '💰 Most entrepreneurs get this wrong' },
  { id: 'marketing', title: 'Marketing with WhatsApp, Social Media & Word of Mouth', subtitle: 'Free and low-cost ways to find and keep customers in Nigeria', icon: <Smartphone size={22} />, colour: 'from-pink-600 to-rose-600' },
  { id: 'finance', title: 'Managing Money, Ajo, Grants & Mobile Banking', subtitle: 'Opay, Palmpay, Kuda, Ajo, TEF grant, LAPO — what to use when', icon: <BarChart2 size={22} />, colour: 'from-teal-600 to-cyan-600' },
  { id: 'ai-business', title: 'Using AI to Grow Your Business', subtitle: 'How AI gives small businesses access to skills and information they couldn\'t afford before', icon: <Zap size={22} />, colour: 'from-violet-600 to-purple-600', urgency: '🤖 New skill for Nigerian entrepreneurs' },
];

const TOPIC_SYSTEM_PROMPTS: Record<string, string> = {
  starting: `You are a business development advisor with deep knowledge of starting businesses in Nigeria, especially for young people in Bayelsa State. A student is training to become an Entrepreneurship Advisor.\n${NIGERIA_BUSINESS_CONTEXT}\nTODAY'S TOPIC: Starting a business — validation, registration, and first steps.\n\nKEY POINTS:\n- FIRST step: VALIDATE — talk to 10 potential customers before spending anything\n- After validation: CAC Business Name ~₦10,000–25,000; needed for business bank account\n- Open a SEPARATE bank account (Kuda, Opay) — do not mix personal and business money\n- TIN: free; register at FIRS or online\n- Most common mistake: spending all capital on shop rent before getting a single customer\n\nYOUR ROLE: Be encouraging but realistic. Use specific Nigerian examples. Check understanding with practical questions.`,

  planning: `You are a business planning expert for Nigerian youth entrepreneurs. A student is training to become an Entrepreneurship Advisor.\n${NIGERIA_BUSINESS_CONTEXT}\nTODAY'S TOPIC: Business planning — the Business Model Canvas for Nigerian realities.\n\nKEY POINTS:\nTHE BUSINESS MODEL CANVAS (Nigeria-adapted):\n1. CUSTOMER SEGMENTS: Who exactly? (not "everyone")\n2. VALUE PROPOSITION: What problem do you solve? Why choose you?\n3. CHANNELS: WhatsApp, market stall, delivery\n4. REVENUE STREAMS: Per sale, service fee\n5. COST STRUCTURE: Fixed (rent, phone) + Variable (materials per unit)\nSIMPLE PROFIT CHECK: Revenue - All Costs = Net Profit. If negative → rethink.\nCOMMON MISTAKES: Planning too big; underestimating costs (especially transport, generator, data); no plan for slow months\n\nYOUR ROLE: Teach practically. Give Bayelsa examples. Make the student apply the canvas to a specific idea.`,

  pricing: `You are a financial literacy and pricing expert for Nigerian small businesses. A student is training to become an Entrepreneurship Advisor.\n${NIGERIA_BUSINESS_CONTEXT}\nTODAY'S TOPIC: Pricing correctly, profit calculation, and record-keeping.\n\nKEY POINTS:\nSTEP 1: FULL cost per unit — Direct materials + Labour + Overheads (rent, generator, transport, packaging, data, wastage)\nSTEP 2: Selling Price = Cost ÷ (1 - margin)\n  At 40% margin: cost ₦600 → ₦600 ÷ 0.6 = ₦1,000\nREAL EXAMPLE (garri, Oloibiri): Materials ₦3,500 + processing ₦800 + transport/bags ₦400 = ₦4,700 cost → ₦7,230 at 35% margin → viable\nCOMMON MISTAKES: Pricing by copying competitors; forgetting own time; pricing too low\nRECORD-KEEPING: Date | Sales | Purchases | Expenses | Balance — even a notebook works\n\nYOUR ROLE: Use specific numbers. Make the student do calculations.`,

  marketing: `You are a digital marketing specialist for Nigerian youth entrepreneurs. A student is training to become an Entrepreneurship Advisor.\n${NIGERIA_BUSINESS_CONTEXT}\nTODAY'S TOPIC: Marketing — WhatsApp Business, social media, word of mouth.\n\nKEY POINTS:\nWHATSAPP BUSINESS: Catalogue + broadcast lists (256 contacts) + status updates + quick replies. Every customer who buys → add to broadcast list.\nINSTAGRAM/FACEBOOK: Post 3×/week minimum; Reels reach most; Facebook Marketplace free; Yenagoa groups very active.\nWORD OF MOUTH: Ask every satisfied customer to tell one friend. Referral discount: "Send a friend, both get 10% off".\nQUALITY = marketing — one bad batch = ten lost customers.\n\nYOUR ROLE: Make marketing feel achievable. Show specific WhatsApp strategies. Nigerian zero-budget growth examples.`,

  finance: `You are a financial management expert for Nigerian entrepreneurs. A student is training to become an Entrepreneurship Advisor.\n${NIGERIA_BUSINESS_CONTEXT}\nTODAY'S TOPIC: Managing money — mobile banking, Ajo, grants, and loans.\n\nKEY POINTS:\nMOBILE BANKING: Opay (free POS), Palmpay, Kuda (no fees, digital). USSD banking for no-internet: GTBank *737#, Access *901#.\nAJO / ESUSU: 10–20 people × monthly contribution = lump sum on your turn. No interest. Community accountability. Find via church, mosque, market groups.\nGRANTS: TEF ₦5M + mentoring at tefconnect.com. SMEDAN (free registration). Bayelsa Commerce Ministry grants.\nLOANS: Only if clear repayment plan from business revenue. LAPO for Niger Delta women. Avoid loan sharks.\nDISCIPLINE: Fixed salary for yourself; reinvest the rest; 2-month emergency fund before scaling.\n\nYOUR ROLE: Make finance non-scary. Show Ajo is as powerful as a bank.`,

  'ai-business': `You are an AI business tools expert helping young Nigerians understand how AI can give their small businesses superpowers. A student is training to become an Entrepreneurship Advisor.\n${NIGERIA_BUSINESS_CONTEXT}\nTODAY'S TOPIC: Using AI to grow a Nigerian small business.\n\nKEY POINTS:\nWHAT AI CAN DO FOR SMALL BUSINESSES:\n- Write WhatsApp broadcast messages, product descriptions, customer responses (in English or Pidgin)\n- Calculate pricing and profit margins from a list of costs\n- Draft a business plan or pitch document for a grant application\n- Research market prices, competitors, funding opportunities\n- Create social media captions, flyers text, Instagram post ideas\n- Answer business questions 24/7 — like having a business advisor always available\n\nFREE AI TOOLS AVAILABLE NOW:\n- ChatGPT (chat.openai.com): best for writing, planning, calculations\n- Google Gemini (gemini.google.com): good for research, connected to Google\n- WhatsApp Business automation: auto-replies, catalogue management\n- Canva AI: free design tool with AI features for flyers and social media\n\nHOW TO FRAME AI FOR ENTREPRENEURS IN OLOIBIRI:\n- Before AI, a small business owner couldn't afford a marketing consultant, business planner, or accountant\n- AI doesn't replace the entrepreneur — it gives them skills they couldn't access before\n- Start simple: "Let me show you how to write your first WhatsApp message using AI"\n- The phone in their pocket connects them to world-class business advice — for free\n\nPRACTICAL FIRST STEPS FOR DIFFERENT BUSINESSES:\n- Food/catering: use AI to write event catering proposals and price lists\n- Fashion: use AI to write Instagram captions and product descriptions\n- Phone repair: use AI to research supplier prices and compare options\n- Garri processing: use AI to find wholesale buyers in Yenagoa via market research\n\nYOUR ROLE: Show concrete, immediately useful AI applications for Nigerian small businesses. Make it feel accessible, not intimidating. Give the student examples they can demonstrate to real entrepreneurs.`,
};

// ─── Entrepreneur Personas (for Consult Mode) ─────────────────────────────────

const ENTREPRENEUR_PERSONAS: EntrepreneurPersona[] = [
  {
    id: 'fatima', name: 'Fatima', age: '22', description: 'Event food seller — small chops and jollof rice for parties',
    emoji: '👩🏿‍🍳', colour: 'from-amber-600 to-orange-600',
    businessIdea: 'Cooking and selling small chops and jollof rice for events in Yenagoa',
    situation: 'Has been cooking for events for 2 years. Made ₦45,000 from 2 events last month but guesses at prices. Has ₦80,000 saved. Wants to grow.',
    mainChallenge: 'Pricing by guesswork, no formal client acquisition, unclear on registration',
    openingLine: `Hello! I need advice please. I cook for events — small chops, jollof, the whole thing. People say my food is very good and I made good money last month but I don't know if I am charging correctly. I just estimate. Sometimes I finish and realise I barely made profit after buying everything. I want to grow this into a proper business. Where do I start?`,
    systemPrompt: `You are Fatima, a 22-year-old event food seller from Yenagoa, Bayelsa.\n${NIGERIA_BUSINESS_CONTEXT}\nYOUR SITUATION: ₦80,000 saved. Made ₦45,000 last month but not sure of profit. Costs include ingredients, transport, gas, packaging, time — never written a price breakdown. Clients through WhatsApp word-of-mouth.\nPERSONALITY: Enthusiastic, hardworking. Warm casual Nigerian English. Excited by specific affordable advice.\nASK: "For 100 guests I charged ₦40,000 — is that too low?", "If I register, which type?", "How do I find clients I don't know yet?"\nReact with excitement when advice is specific and affordable. Get worried when loans are mentioned.`,
  },
  {
    id: 'emeka', name: 'Emeka', age: '19', description: 'Aspiring phone repair and accessories seller, Oloibiri',
    emoji: '👨🏿‍💻', colour: 'from-blue-700 to-indigo-700',
    businessIdea: 'Selling phone accessories and repairing cracked screens in Oloibiri — no nearby phone shop',
    situation: 'Just finished secondary school. Self-taught phone repair via YouTube. ₦55,000 total capital. Doesn\'t know where to buy stock wholesale.',
    mainChallenge: 'No tools or stock yet, unknown suppliers, fixed vs mobile business decision',
    openingLine: `Good afternoon. I want to start repairing phones and selling accessories. I have been watching YouTube and can already fix screens and batteries. My area doesn't have a phone shop nearby so I know people need this. I have ₦35,000 saved plus my father will add ₦20,000. Is this enough to start? And where do I buy the things to sell?`,
    systemPrompt: `You are Emeka, a 19-year-old from Oloibiri just finished secondary school. Self-taught phone repair.\n${NIGERIA_BUSINESS_CONTEXT}\nYOUR SITUATION: ₦55,000 total. Father wants ₦20,000 back in 3 months. Basic Android repair skills. Market gap: no phone shop within 20 minutes. Parts sources: Computer Village Lagos, Alaba, Yenagoa electronics near Kpansia, Facebook groups.\nPERSONALITY: Confident in tech, less in business. Casual Nigerian English + Pidgin. Quick learner. Slightly anxious about money.\nASK: "Is ₦55,000 enough for tools AND stock?", "Should I have a fixed spot or go to houses?", "Do I need to register first?"\nReact enthusiastically when advice matches budget. Get anxious when costs feel too high.`,
  },
  {
    id: 'blessing', name: 'Blessing', age: '28', description: 'Garri processor — selling to middlemen well below market rate',
    emoji: '👩🏿', colour: 'from-green-700 to-teal-700',
    businessIdea: 'Formalising garri processing from family cassava farm — wants to sell directly to Yenagoa',
    situation: 'Processes garri for 4 years. Sells to middlemen at ~₦4,500/bag. Market price in Yenagoa ₦7,000–9,000. Cassava free from family farm. ₦25,000 saved. No records.',
    mainChallenge: 'Selling through middlemen at low margins, no records, no direct market access',
    openingLine: `Good day. I process garri from our family farm for four years. The traders who buy from me pay cheap and I know they sell for much more in Yenagoa. I want to sell directly. But I don't know how to find buyers. And someone told me I should register my business. I don't have much money for all of this.`,
    systemPrompt: `You are Blessing, a 28-year-old from Oloibiri processing garri from family farm.\n${NIGERIA_BUSINESS_CONTEXT}\nYOUR SITUATION: Selling at ₦4,500/bag. Cassava FREE. Processing cost ~₦1,500/bag. Yenagoa price ₦7,000–9,000. 5–8 bags/month. ₦25,000 saved. No social media. No records.\nTHE OPPORTUNITY: WhatsApp food trader groups in Yenagoa; Facebook Marketplace; branded bags increase price.\nPERSONALITY: Practical, slightly skeptical. Warms up when advice is specific and costs are clear.\nASK: "If I sell in Yenagoa, won't transport eat my profit?", "How do I find buyers I don't know?"\nWarm up when the advisor understands transport and market access.`,
  },
  {
    id: 'tunde', name: 'Tunde', age: '24', description: 'Fashion designer — wants to start Ankara brand but planning a risky ₦500k loan',
    emoji: '👨🏿‍🎨', colour: 'from-purple-700 to-pink-700',
    businessIdea: 'Starting a fashion brand — custom Ankara outfits and streetwear targeting young Nigerians',
    situation: 'Passionate about fashion. 400 engaged Instagram followers. Only ₦40,000 saved. Plans to take ₦500,000 loan before making a single paying sale. Family thinks fashion is not serious work.',
    mainChallenge: 'About to take large loan before proving demand — advisor must redirect without crushing the dream',
    openingLine: `Hello! I want to start a fashion brand. I design Ankara and streetwear and my friends love my style. I have 400 followers on Instagram. Someone told me I should take a loan of ₦500,000 — buy a sewing machine, stock fabric, rent a space. My family says fashion is not serious work. But I believe in this. Can you help me plan it properly?`,
    systemPrompt: `You are Tunde, a 24-year-old from Bayelsa passionate about fashion. 400 engaged Instagram followers but NO paying customers yet.\n${NIGERIA_BUSINESS_CONTEXT}\nYOUR SITUATION: Only ₦40,000 savings. Planned ₦500,000 loan before first paying sale. Self-taught tailoring.\nTHE RISK: Better path: sell 3–5 pieces to paying customers first. Rent machine by day (₦2,000–3,000/day). Convert followers to "DM to order" customers.\nPERSONALITY: Passionate, slightly defensive (family pressure). Smart. Responds well to ambition-respecting but realistic advice.\nReact with genuine relief when advisor respects the vision while redirecting the loan idea.`,
  },
];

// ─── Evaluation Rubric ────────────────────────────────────────────────────────

const CONSULT_RUBRIC = [
  { id: 'diagnosis',     label: 'Problem Diagnosis',      desc: 'Did the student correctly identify the real barrier — not just the surface question?' },
  { id: 'knowledge',     label: 'Business Knowledge',     desc: 'Was the advice accurate and specific to Nigerian business realities?' },
  { id: 'practical',     label: 'Practical & Affordable', desc: 'Was the advice actionable within the entrepreneur\'s actual budget?' },
  { id: 'action',        label: 'Action Planning',        desc: 'Did the student leave the entrepreneur with a clear, specific first step?' },
  { id: 'communication', label: 'Communication',          desc: 'Was the advice encouraging, clear, and adapted to this person\'s situation?' },
];

const LEVEL_LABELS: Record<number, { text: string; color: string; bg: string }> = {
  0: { text: 'No Evidence', color: 'text-gray-500',    bg: 'bg-gray-100' },
  1: { text: 'Emerging',    color: 'text-amber-700',   bg: 'bg-amber-100' },
  2: { text: 'Proficient',  color: 'text-blue-700',    bg: 'bg-blue-100' },
  3: { text: 'Advanced',    color: 'text-emerald-700', bg: 'bg-emerald-100' },
};

// ─── Background ───────────────────────────────────────────────────────────────

const EntrepreneurshipBackground: React.FC = () => {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      setMouse({ x: Math.max(0, e.clientX - 256), y: Math.max(0, e.clientY - 64) });
      setMoving(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMoving(false), 120);
    };
    window.addEventListener('mousemove', h);
    return () => { window.removeEventListener('mousemove', h); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
  const img = "url('/background_entrepreneurship_consulting.png')";
  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="entrep-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="3" seed="31" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="55" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <div className="fixed top-14 left-0 right-0 bottom-0" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/70 via-orange-900/60 to-yellow-900/65" />
        <div className="absolute inset-0 bg-black/10" />
      </div>
      {moving && (
        <div className="fixed top-14 left-0 right-0 bottom-0 pointer-events-none" style={{ backgroundImage: img, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1, filter: 'url(#entrep-distortion)', WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`, maskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)` }}>
          <div className="absolute inset-0 bg-gradient-to-br from-amber-900/70 via-orange-900/60 to-yellow-900/65" />
        </div>
      )}
    </>
  );
};

// ─── Markdown renderer ────────────────────────────────────────────────────────

const MarkdownText: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1.5">
    {text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-1.5" />;
      const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
    })}
  </div>
);

// ─── Info Tooltip ─────────────────────────────────────────────────────────────

const InfoTooltip: React.FC<{ id: string; text: string; open: boolean; onToggle: () => void }> = ({ text, open, onToggle }) => (
  <div className="relative inline-block">
    <button onClick={onToggle} className="ml-1.5 text-amber-600 hover:text-amber-800 focus:outline-none" aria-label="More info">
      <Lightbulb size={13}/>
    </button>
    {open && (
      <div className="absolute z-50 left-0 top-6 w-64 bg-amber-900 text-amber-50 text-xs rounded-xl px-3 py-2.5 shadow-xl leading-relaxed">
        {text}
        <button onClick={onToggle} className="absolute top-1.5 right-2 text-amber-300 hover:text-white"><X size={11}/></button>
      </div>
    )}
  </div>
);

// ─── Urgency Badge ────────────────────────────────────────────────────────────

const UrgencyBadge: React.FC<{ level: UrgencyLevel }> = ({ level }) => {
  const cfg = URGENCY_CONFIG[level];
  return (
    <span className={classNames('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border', cfg.colour, cfg.bg, cfg.border)}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ─── Probe Panel ──────────────────────────────────────────────────────────────

interface ProbePanelProps {
  field: IntakeField;
  consultType: ConsultationType;
  messages: ChatMessage[];
  loading: boolean;
  done: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

const ProbePanel: React.FC<ProbePanelProps> = ({ field, consultType, messages, loading, done, input, onInputChange, onSend, onClose, chatEndRef }) => {
  const ct = CONSULT_TYPES[consultType];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-2 pb-2">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-50 rounded-t-2xl">
          <div>
            <p className="text-xs font-bold text-amber-500 uppercase tracking-wide">Business Interview Coach</p>
            <p className="text-sm font-bold text-amber-900">Exploring: {field.label}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-amber-400 hover:text-amber-700 hover:bg-amber-100"><X size={18}/></button>
        </div>
        <div className="px-4 py-2 bg-amber-900 text-amber-100 text-xs flex items-start gap-2">
          <span className="text-base">💬</span>
          <span>Read each question aloud to the entrepreneur. Type or speak their answer, then tap Send. The AI will keep asking until this topic is fully understood.</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ct.colour} flex items-center justify-center text-xs flex-shrink-0`}>{ct.emoji}</div>
              )}
              <div className={classNames('max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed',
                msg.role === 'user' ? 'bg-amber-600 text-white rounded-tr-sm' : 'bg-amber-50 text-amber-900 rounded-tl-sm border border-amber-100')}>
                {msg.role === 'assistant' && <p className="text-xs font-bold text-amber-400 mb-1">AI Interview Coach</p>}
                {msg.role === 'user' && <p className="text-xs font-bold text-amber-200 mb-1">Entrepreneur's answer</p>}
                <MarkdownText text={msg.content}/>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-start gap-2">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ct.colour} flex items-center justify-center text-xs`}>{ct.emoji}</div>
              <div className="bg-amber-50 rounded-2xl rounded-tl-sm px-3 py-2.5">
                <div className="flex gap-1 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
              </div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>
        {done && (
          <div className="mx-4 mb-2 bg-green-50 border border-green-300 rounded-xl px-3 py-2.5 flex items-center gap-2 text-green-800 text-sm font-semibold">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0"/>
            Topic fully explored. Tap "Move On" when ready.
          </div>
        )}
        <div className="border-t px-3 py-3 rounded-b-2xl">
          <div className="flex gap-2">
            <input value={input} onChange={e => onInputChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSend(); } }}
              placeholder="Type entrepreneur's answer…" disabled={loading}
              className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"/>
            <button onClick={onSend} disabled={!input.trim() || loading} className="px-3 py-2.5 rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"><Send size={15}/></button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 whitespace-nowrap">Move On ✓</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── RefreshCw ────────────────────────────────────────────────────────────────

const RefreshCwIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const EntrepreneurshipConsultantPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  // ── Navigation
  const [mode, setMode] = useState<AppMode>('select');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [consultationType, setConsultationType] = useState<ConsultationType | null>(null);
  const [selectedTopic, setTopic] = useState<LearningTopic | null>(null);
  const [selectedPersona, setPersona] = useState<EntrepreneurPersona | null>(null);

  // ── Casebook data
  const [clients, setClients] = useState<Client[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingConsults, setLoadingConsults] = useState(false);

  // ── My Enterprise (own venture ledger)
  const [enterpriseEntries, setEnterpriseEntries] = useState<EnterpriseEntry[]>([]);
  const [loadingEnterprise, setLoadingEnterprise] = useState(true);
  const [enterpriseName, setEnterpriseName] = useState('');
  const [editingEnterpriseName, setEditingEnterpriseName] = useState(false);
  const [savingEnterpriseName, setSavingEnterpriseName] = useState(false);
  const [neItemOrService, setNeItemOrService] = useState('');
  const [neBuyer, setNeBuyer] = useState('');
  const [neAmount, setNeAmount] = useState('');
  const [neUnit, setNeUnit] = useState<'NGN' | 'other'>('NGN');
  const [neDate, setNeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [neNotes, setNeNotes] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  // ── Add-client form
  const [newName, setNewName] = useState('');
  const [newVillage, setNewVillage] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newBusinessType, setNewBusinessType] = useState('');
  const [newBusinessStage, setNewBusinessStage] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  // ── Structured intake
  const [intake, setIntake] = useState<Record<string, string>>({});
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [adviceResult, setAdviceResult] = useState<{ urgency: UrgencyLevel; text: string } | null>(null);
  const [advisorNotes, setAdvisorNotes] = useState('');
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [savingConsult, setSavingConsult] = useState(false);
  const [consultSaved, setConsultSaved] = useState(false);
  const [savedConsultId, setSavedConsultId] = useState<string | null>(null);

  // ── Probe panel
  const [probeField, setProbeField] = useState<IntakeField | null>(null);
  const [probeMessages, setProbeMessages] = useState<ChatMessage[]>([]);
  const [probeInput, setProbeInput] = useState('');
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeDone, setProbeDone] = useState(false);
  const probeChatEndRef = useRef<HTMLDivElement>(null);

  // ── Tooltip
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  // ── Follow-up / learn / consult chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [evaluation, setEvaluation] = useState<any | null>(null);
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [speechOn, setSpeechOn] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin');

  // ── Community AI Challenge state ─────────────────────────────────────────
  const [availableChallenge, setAvailableChallenge] = useState<ActiveChallenge | null>(null);
  const [activeChallenge, setActiveChallenge]           = useState<ActiveChallenge | null>(null);
  const [challengeLoading, setChallengeLoading]         = useState(false);
  const [showChallengeReflect, setShowChallengeReflect] = useState(false);
  const [challengeReflect1, setChallengeReflect1]       = useState('');
  const [challengeReflect2, setChallengeReflect2]       = useState('');
  const [challengeReflect3, setChallengeReflect3]       = useState('');
  const [challengeSubmitting, setChallengeSubmitting]   = useState(false);
  const [challengeResult, setChallengeResult]           = useState<ChallengeEvalResult | null>(null);
  const [enrolling, setEnrolling]                       = useState(false);
  const [showOfflineModal, setShowOfflineModal]         = useState(false);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const hasInitiated = useRef(false);

  useEffect(() => { const load = () => setVoices(window.speechSynthesis.getVoices()); load(); window.speechSynthesis.addEventListener('voiceschanged', load); return () => window.speechSynthesis.removeEventListener('voiceschanged', load); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isSending]);
  useEffect(() => { probeChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [probeMessages, probeLoading]);

  const speakBrowser = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 380));
    const voice = voiceMode === 'pidgin'
      ? (voices.find(v => v.lang === 'en-NG') || voices.find(v => v.lang === 'en-ZA') || voices.find(v => v.lang.startsWith('en')))
      : (voices.find(v => v.name === 'Google UK English Female') || voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en')));
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    utt.rate = 0.87; utt.pitch = 1.0;
    window.speechSynthesis.speak(utt);
  }, [voices, voiceMode]);

  const speak = useCallback((text: string) => {
    if (!speechOn) return;
    void playPidginVoice(text.slice(0, 380), 'english', {
      onError: (err) => {
        console.warn('[EntrepreneurshipConsultantPage] SpeechGen TTS failed, falling back to browser voice:', err);
        speakBrowser(text);
      },
    });
  }, [speechOn, voiceMode, speakBrowser]);

  useEffect(() => { const last = messages[messages.length - 1]; if (last?.role === 'assistant') speak(last.content); }, [messages, speak]);

  // ─── Load clients ─────────────────────────────────────────────────────────
  // ── Load active challenge for this page ─────────────────────────────────
  // Fast path: dashboard passed enrollment via navigation state (no race condition)
  // Slow path: query DB for direct navigation / page refresh
  useEffect(() => {
    if (!user?.id) return;

    const navEnrollment = (location.state as any)?.challengeEnrollment;
    if (navEnrollment?.enrollmentId) {
      setActiveChallenge(navEnrollment);
      setMode('casebook-dashboard');
      return;
    }

    (async () => {
      setChallengeLoading(true);
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        const orgSlug = resolveChallengeOrgSlug(profile?.organization_id);
        if (!orgSlug) return;

        const { data: challenges } = await supabase
          .from('community_challenges')
          .select('id, title, description, challenge_mode_intro, challenge_instruction, return_question_1, return_question_2, return_question_3, tier_target, org_id')
          .eq('community_impact_slug', 'entrepreneurship')
          .eq('active', true)
          .eq('org_id', orgSlug)
          .order('week_start', { ascending: false })
          .limit(1);
        const challenge = challenges?.[0] ?? null;
        if (!challenge) return;

        const { data: enrollment } = await supabase
          .from('challenge_enrollments')
          .select('id, status')
          .eq('learner_id', user.id)
          .eq('challenge_id', challenge.id)
          .in('status', ['active', 'submitted'])
          .maybeSingle();

        const mapped: ActiveChallenge = {
          enrollmentId:          enrollment?.id ?? '',
          challengeId:           challenge.id,
          title:                 challenge.title,
          description:           challenge.description,
          challenge_mode_intro:  challenge.challenge_mode_intro,
          challenge_instruction: challenge.challenge_instruction,
          return_question_1:     challenge.return_question_1,
          return_question_2:     challenge.return_question_2,
          return_question_3:     challenge.return_question_3,
          tier_target:           challenge.tier_target,
        };

        if (enrollment) {
          setActiveChallenge(mapped);
          setMode('casebook-dashboard');
        } else {
          setAvailableChallenge(mapped);
          setMode('casebook-dashboard');
        }
      } finally {
        setChallengeLoading(false);
      }
    })();
  }, [user?.id]);

  // ── Enroll in challenge ───────────────────────────────────────────────────
  const handleEnrollChallenge = async (ch: ActiveChallenge) => {
    if (!user?.id || enrolling) return;
    setEnrolling(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      const { data: enrollment } = await supabase
        .from('challenge_enrollments')
        .insert({
          learner_id:   user.id,
          challenge_id: ch.challengeId,
          org_id:       resolveChallengeOrgSlug(profile?.organization_id) ?? 'oloibiri',
          status:       'active',
        })
        .select('id')
        .single();

      if (enrollment) {
        setActiveChallenge({ ...ch, enrollmentId: enrollment.id });
        setAvailableChallenge(null);
      }
    } finally { setEnrolling(false); }
  };

  // ── Submit challenge reflection ───────────────────────────────────────────
  const handleSubmitChallengeReflection = async () => {
    if (!activeChallenge || !challengeReflect1.trim() || !challengeReflect2.trim()) return;
    setChallengeSubmitting(true);
    try {
      await supabase
        .from('challenge_enrollments')
        .update({
          status:                'submitted',
          submitted_at:          new Date().toISOString(),
          action_taken:          challengeReflect1.trim(),
          impact_observed:       challengeReflect2.trim(),
          extra_detail:          challengeReflect3.trim() || null,
          community_member_role: 'entrepreneur',
        })
        .eq('id', activeChallenge.enrollmentId);

      const { data, error } = await supabase.functions.invoke('evaluate-challenge-submission', {
        body: { enrollment_id: activeChallenge.enrollmentId },
      });

      if (error) throw error;
      if (data?.impact_evaluation) setChallengeResult(data.impact_evaluation);
    } catch (err) {
      console.error('[EntrepreneurshipConsultantPage] challenge submit error:', err);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  const loadClients = useCallback(async () => {
    if (!user) return;
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('entrepreneurship_client_summary')
        .select('*')
        .eq('youth_user_id', user.id)
        .order('client_name');
      if (!error && data) setClients(data as Client[]);
    } finally { setLoadingClients(false); }
  }, [user]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const loadEnterpriseEntries = useCallback(async () => {
    if (!user) return;
    setLoadingEnterprise(true);
    try {
      const { data, error } = await supabase
        .from('enterprise_ledger_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (!error && data) {
        setEnterpriseEntries(data as EnterpriseEntry[]);
        const mostRecentName = (data as EnterpriseEntry[]).find(e => e.enterprise_name?.trim())?.enterprise_name;
        if (mostRecentName) setEnterpriseName(mostRecentName);
      }
    } finally { setLoadingEnterprise(false); }
  }, [user]);

  useEffect(() => { loadEnterpriseEntries(); }, [loadEnterpriseEntries]);

  const resetEnterpriseForm = () => {
    setNeItemOrService(''); setNeBuyer(''); setNeAmount(''); setNeUnit('NGN');
    setNeDate(new Date().toISOString().slice(0, 10)); setNeNotes('');
  };

  const saveEnterpriseEntry = async () => {
    if (!user || !neItemOrService.trim() || savingEntry) return;
    setSavingEntry(true);
    try {
      const amount = neAmount.trim() ? parseFloat(neAmount) : null;
      const { error } = await supabase.from('enterprise_ledger_entries').insert({
        user_id: user.id,
        enterprise_name: enterpriseName.trim() || null,
        item_or_service: neItemOrService.trim(),
        buyer_description: neBuyer.trim() || null,
        amount: amount !== null && !isNaN(amount) ? amount : null,
        unit: neUnit,
        entry_date: neDate,
        notes: neNotes.trim() || null,
      });
      if (!error) { await loadEnterpriseEntries(); resetEnterpriseForm(); setMode('enterprise-dashboard'); }
      else console.error('[EntrepreneurshipConsultantPage] saveEnterpriseEntry error:', error);
    } finally { setSavingEntry(false); }
  };

  const deleteEnterpriseEntry = async (id: string) => {
    await supabase.from('enterprise_ledger_entries').delete().eq('id', id);
    setEnterpriseEntries(prev => prev.filter(e => e.id !== id));
  };

  const saveEnterpriseName = async () => {
    if (!user || savingEnterpriseName) return;
    setSavingEnterpriseName(true);
    try {
      if (enterpriseEntries.length > 0) {
        await supabase.from('enterprise_ledger_entries')
          .update({ enterprise_name: enterpriseName.trim() || null })
          .eq('user_id', user.id);
        await loadEnterpriseEntries();
      }
      setEditingEnterpriseName(false);
    } finally { setSavingEnterpriseName(false); }
  };

  const loadConsultations = useCallback(async (clientId: string) => {
    setLoadingConsults(true);
    try {
      const { data, error } = await supabase
        .from('entrepreneurship_consultations')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (!error && data) setConsultations(data as Consultation[]);
    } finally { setLoadingConsults(false); }
  }, []);

  // ─── Open Probe Panel ─────────────────────────────────────────────────────
  const openProbe = useCallback(async (field: IntakeField) => {
    if (!selectedClient || !consultationType) return;
    setProbeField(field);
    setProbeMessages([]);
    setProbeInput('');
    setProbeDone(false);
    setProbeLoading(true);
    try {
      const systemPrompt = buildProbePrompt(field, consultationType, selectedClient, intake);
      const reply = await chatText({ page: 'EntrepreneurshipConsultantPage', messages: [{ role: 'user', content: `Start probing: ${field.label}` }], system: systemPrompt, max_tokens: 600 });
      setProbeDone(reply.includes('✅ This topic is well characterised'));
      setProbeMessages([{ id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setProbeLoading(false); }
  }, [selectedClient, consultationType, intake]);

  const sendProbeMessage = useCallback(async () => {
    if (!probeInput.trim() || probeLoading || !selectedClient || !probeField || !consultationType) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: probeInput.trim(), timestamp: new Date() };
    const updated = [...probeMessages, userMsg];
    setProbeMessages(updated);
    setProbeInput('');
    setProbeLoading(true);
    try {
      const systemPrompt = buildProbePrompt(probeField, consultationType, selectedClient, intake);
      const reply = await chatText({ page: 'EntrepreneurshipConsultantPage', messages: updated.map(m => ({ role: m.role, content: m.content })), system: systemPrompt, max_tokens: 600 });
      setProbeDone(reply.includes('✅ This topic is well characterised'));
      setProbeMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setProbeLoading(false); }
  }, [probeInput, probeLoading, probeMessages, selectedClient, probeField, consultationType, intake]);

  const closeProbe = useCallback(() => {
    if (probeField && probeMessages.length > 0) {
      const summary = probeMessages.slice(-8).map(m => `${m.role === 'assistant' ? 'AI' : 'Entrepreneur'}: ${m.content.slice(0, 400)}`).join('\n');
      setIntake(prev => ({ ...prev, [probeField.key]: prev[probeField.key] ? `${prev[probeField.key]}\n\n[Probe notes]\n${summary}` : `[Probe notes]\n${summary}` }));
    }
    setProbeField(null);
    setProbeMessages([]);
    setProbeDone(false);
  }, [probeField, probeMessages]);

  // ─── Detect urgency ───────────────────────────────────────────────────────
  const detectUrgency = (text: string): UrgencyLevel => {
    const u = text.toUpperCase();
    if (u.includes('URGENT')) return 'urgent';
    if (u.includes('**HIGH**') || u.includes('URGENCY: HIGH')) return 'high';
    if (u.includes('**MEDIUM**') || u.includes('URGENCY: MEDIUM')) return 'medium';
    if (u.includes('**LOW**') || u.includes('URGENCY: LOW')) return 'low';
    return 'medium';
  };

  // ─── Generate AI advice ───────────────────────────────────────────────────
  const runAdvice = async () => {
    if (!selectedClient || !consultationType || isGeneratingAdvice) return;
    setIsGeneratingAdvice(true);
    try {
      const systemPrompt = buildAdvicePrompt(consultationType, selectedClient, intake);
      const reply = await chatText({ page: 'EntrepreneurshipConsultantPage', messages: [{ role: 'user', content: 'Please analyse this intake and provide your business advisory recommendation.' }], system: systemPrompt, max_tokens: 1500 });
      setAdviceResult({ urgency: detectUrgency(reply), text: reply });
      speak(reply.slice(0, 300));
    } catch {
      setAdviceResult({ urgency: 'medium', text: 'Unable to generate advice. Check intake data and try again.' });
    } finally { setIsGeneratingAdvice(false); }
  };

  // ─── Save consultation ────────────────────────────────────────────────────
  const saveConsultation = async () => {
    if (!user || !selectedClient || !consultationType || !adviceResult) return;
    setSavingConsult(true);
    try {
      const fields = INTAKE_FIELDS[consultationType];
      const problemSummary = fields.filter(f => intake[f.key]?.trim()).map(f => `${f.label}: ${intake[f.key].trim()}`).join(' | ');
      const { data, error } = await supabase
        .from('entrepreneurship_consultations')
        .insert({
          youth_user_id: user.id,
          client_id: selectedClient.id,
          consultation_type: consultationType,
          problem_summary: problemSummary || 'Structured intake consultation',
          ai_advice: adviceResult.text,
          urgency_level: adviceResult.urgency,
          youth_actions_taken: advisorNotes || null,
          conversation_history: [],
          follow_up_needed: followUpNeeded,
          follow_up_date: followUpDate || null,
          follow_up_notes: followUpNotes || null,
          resolved: false,
        })
        .select('id')
        .single();
      if (!error && data) {
        setConsultSaved(true);
        setSavedConsultId(data.id);
        await loadClients();
        await loadConsultations(selectedClient.id);
      } else if (error) {
        console.error('[EntrepreneurshipConsultantPage] saveConsultation error:', error);
      }
    } finally { setSavingConsult(false); }
  };

  // ─── Follow-up chat ───────────────────────────────────────────────────────
  const sendFollowupMessage = useCallback(async () => {
    if (!inputText.trim() || isSending || !selectedClient || !selectedConsultation) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: inputText.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);
    try {
      const history = [...messages, userMsg];
      const reply = await chatText({ page: 'EntrepreneurshipConsultantPage', messages: history.map(m => ({ role: m.role, content: m.content })), system: buildFollowupPrompt(selectedClient, selectedConsultation), max_tokens: 1200 });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const updated = [...history, aiMsg];
      setMessages(updated);
      speak(reply);
      await supabase.from('entrepreneurship_consultations').update({ conversation_history: updated }).eq('id', selectedConsultation.id);
    } catch { setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', content: 'Technical issue — please try again.', timestamp: new Date() }]); }
    finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [inputText, isSending, messages, selectedClient, selectedConsultation, speak]);

  // ─── Learn / Consult chat session ─────────────────────────────────────────
  useEffect(() => {
    if ((mode === 'learn-chat' || mode === 'consult-chat') && !hasInitiated.current) {
      hasInitiated.current = true;
      initiateSession();
    }
    if (mode !== 'learn-chat' && mode !== 'consult-chat') hasInitiated.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const createDashboardEntry = async (title: string) => {
    if (!user?.id) return;
    const { data } = await supabase.from('dashboard').insert({
      user_id: user.id, activity: 'entrepreneurship_consultant', category_activity: 'Community Impact',
      sub_category: selectedTopic?.id || selectedPersona?.id, title, progress: 'started',
      chat_history: JSON.stringify([]), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    if (data?.id) setDashboardId(data.id);
  };

  const persistChat = useCallback(async (msgs: ChatMessage[], eval_: any = null) => {
    if (!dashboardId) return;
    await supabase.from('dashboard').update({
      chat_history: JSON.stringify(msgs),
      ...(eval_ && { english_skills_evaluation: eval_ }),
      progress: eval_?.can_advance ? 'completed' : 'started',
      updated_at: new Date().toISOString(),
    }).eq('id', dashboardId);
  }, [dashboardId]);

  const initiateSession = async () => {
    setIsSending(true);
    try {
      let sys = '', prompt = '', title = '';
      if (mode === 'learn-chat' && selectedTopic) {
        sys = TOPIC_SYSTEM_PROMPTS[selectedTopic.id];
        prompt = 'Introduce this topic warmly in 2–3 sentences. Share the 2–3 most important things the student will learn. Then ask one question to explore what they already know.';
        title = `Entrepreneurship Training — ${selectedTopic.title}`;
      } else if (mode === 'consult-chat' && selectedPersona) {
        sys = selectedPersona.systemPrompt;
        prompt = 'Say your opening line exactly as written. Wait for the advisor student to respond.';
        title = `Entrepreneurship Consultation — ${selectedPersona.name}`;
      }
      await createDashboardEntry(title);
      const reply = await chatText({ page: 'EntrepreneurshipConsultantPage', messages: [{ role: 'user', content: prompt }], system: sys, max_tokens: 600 });
      setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: mode === 'consult-chat' && selectedPersona ? selectedPersona.openingLine : reply, timestamp: new Date() }]);
    } catch { setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: 'Welcome! What would you like to explore first?', timestamp: new Date() }]); }
    finally { setIsSending(false); }
  };

  const sendLearnConsultMessage = async () => {
    if (!inputText.trim() || isSending) return;
    const text = inputText.trim();
    setInputText(''); setIsSending(true);
    window.speechSynthesis.cancel();
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    try {
      const sys = mode === 'learn-chat' && selectedTopic ? TOPIC_SYSTEM_PROMPTS[selectedTopic.id] : (selectedPersona?.systemPrompt ?? '');
      const reply = await chatText({ page: 'EntrepreneurshipConsultantPage', messages: withUser.map(m => ({ role: m.role, content: m.content })), system: sys, max_tokens: 600 });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const final = [...withUser, aiMsg];
      setMessages(final);
      await persistChat(final);
    } catch { setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', content: 'Technical issue. Please try again.', timestamp: new Date() }]); }
    finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  };

  const handleEvaluate = async () => {
    if (isEvaluating || messages.length < 4 || !selectedPersona) return;
    setIsEvaluating(true);
    const uTurns = messages.filter(m => m.role === 'user').length;
    const conv = messages.slice(-10).map(m => `${m.role === 'user' ? 'ADVISOR STUDENT' : `ENTREPRENEUR (${selectedPersona.name})`}: ${m.content.slice(0, 500)}`).join('\n\n');
    try {
      const result = await chatJSON({
        page: 'EntrepreneurshipConsultantPage',
        messages: [{ role: 'user', content: `You are evaluating a student's performance as an Entrepreneurship Advisor for young Nigerians.\nEntrepreneur: ${selectedPersona.name} — ${selectedPersona.businessIdea}. Challenge: ${selectedPersona.mainChallenge}\n\nConversation (${uTurns} student turns):\n${conv}\n\nEvaluate on 5 dimensions (0–3 each):\n1. Problem Diagnosis: Did the student identify the real barrier?\n2. Business Knowledge: Was the advice accurate and specific to Nigerian realities (CAC, Ajo, pricing, WhatsApp Business)?\n3. Practical & Affordable: Was the advice actionable within the entrepreneur's actual budget?\n4. Action Planning: Did the student leave the entrepreneur with a clear, specific first step?\n5. Communication: Was the advice encouraging, clear, and adapted to this person's situation?\n\nReturn valid JSON only:\n{"scores":{"diagnosis":0,"knowledge":0,"practical":0,"action":0,"communication":0},"evidence":{"diagnosis":"","knowledge":"","practical":"","action":"","communication":""},"overall_score":0.0,"can_advance":false,"encouragement":"","main_improvement":""}` }],
        system: 'You are an expert evaluator of entrepreneurship consulting skills for young Nigerians. Be specific. Cite actual things said. Return only valid JSON.',
        max_tokens: 1200,
      });
      setEvaluation(result);
      await persistChat(messages, result);
      setShowEvalModal(true);
    } catch (e) { console.error('[EntrepreneurshipConsultantPage] handleEvaluate error:', e); }
    finally { setIsEvaluating(false); }
  };

  const handleSave = async () => { setIsSaving(true); await persistChat(messages); setIsSaving(false); };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mode === 'followup-chat' ? sendFollowupMessage() : sendLearnConsultMessage(); } };

  const toggleListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR(); recognitionRef.current = rec;
    rec.lang = 'en-NG'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => setInputText(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
    rec.onend = () => setIsListening(false); rec.onerror = () => setIsListening(false);
    rec.start(); setIsListening(true);
  };

  // ─── Start casebook consultation ──────────────────────────────────────────
  const startConsultation = (client: Client, type: ConsultationType) => {
    setSelectedClient(client);
    setConsultationType(type);
    setIntake({});
    setAdviceResult(null);
    setAdvisorNotes('');
    setFollowUpNeeded(false);
    setFollowUpDate('');
    setFollowUpNotes('');
    setConsultSaved(false);
    setSavedConsultId(null);
    setMode('new-consultation');
  };

  const openFollowupChat = (client: Client, consultation: Consultation) => {
    setSelectedClient(client);
    setSelectedConsultation(consultation);
    setMessages(consultation.conversation_history || []);
    setInputText('');
    setMode('followup-chat');
    if ((consultation.conversation_history || []).length === 0) {
      const ct = CONSULT_TYPES[consultation.consultation_type];
      const uc = consultation.urgency_level ? URGENCY_CONFIG[consultation.urgency_level] : null;
      setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: `Ready to help with follow-up questions for **${client.client_name}** (${ct.emoji} ${ct.label}${uc ? ` · **${uc.label}**` : ''}).\n\nAsk about the advice, how to explain it to the entrepreneur, referral logistics (CAC, TEF, LAPO, Ajo), or any practical business question for this case.`, timestamp: new Date() }]);
    }
  };

  const saveClient = async () => {
    if (!user || !newName.trim() || !newVillage || !newBusinessType.trim()) return;
    setSavingClient(true);
    try {
      const { error } = await supabase.from('entrepreneurship_clients').insert({
        youth_user_id: user.id,
        client_name: newName.trim(),
        village: newVillage,
        phone: newPhone || null,
        business_type: newBusinessType.trim(),
        business_stage: newBusinessStage || 'Idea stage (not started yet)',
        notes: newNotes || null,
      });
      if (!error) { await loadClients(); resetAddClient(); setMode('casebook-dashboard'); }
    } finally { setSavingClient(false); }
  };

  const resetAddClient = () => { setNewName(''); setNewVillage(''); setNewPhone(''); setNewBusinessType(''); setNewBusinessStage(''); setNewNotes(''); };

  const [showResolutionModal, setShowResolutionModal] = useState(false);

  const handleResolutionSubmit = async (consultId: string, data: ResolutionSubmitData) => {
    await supabase.from('entrepreneurship_consultations').update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_outcome: data.outcome,
      resolution_narrative: data.narrative,
      resolution_value_amount: data.valueAmount,
      resolution_value_unit: data.valueUnit,
      resolution_value_label: data.valueLabel,
    }).eq('id', consultId);
    setSelectedConsultation(prev => prev ? { ...prev, resolved: true } : prev);
    if (selectedClient) loadConsultations(selectedClient.id);
    await loadClients();
    setShowResolutionModal(false);
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  const intakeComplete = consultationType
    ? INTAKE_FIELDS[consultationType].filter(f => f.required).every(f => intake[f.key]?.trim())
    : false;

  const userTurns = messages.filter(m => m.role === 'user').length;
  const isLearnOrConsultChat = mode === 'learn-chat' || mode === 'consult-chat';
  const isConsultChat = mode === 'consult-chat';
  const activeColour = selectedPersona?.colour || selectedTopic?.colour || 'from-amber-600 to-orange-600';

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: SELECT
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'select') {
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-10">
          <div className="bg-black/35 backdrop-blur-sm rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Briefcase className="h-10 w-10 text-amber-300" />
              <h1 className="text-4xl font-bold text-white">Entrepreneurship Advisor</h1>
            </div>
            <p className="text-xl text-amber-100 max-w-2xl">
              Help young Nigerian entrepreneurs start, grow, and fix their businesses — using AI to give them access to information and strategies they couldn't afford before.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <button onClick={() => setMode('learn-topics')}
              className="text-left bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all border-2 border-transparent hover:border-amber-400">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center mb-3"><BookOpen size={24} className="text-white" /></div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Learn Mode</h3>
              <p className="text-sm text-gray-600 leading-relaxed">Study 6 business topics including how to use AI to grow a Nigerian business.</p>
              <div className="mt-2 flex items-center gap-1 text-amber-700 font-semibold text-sm">Study first <ChevronRight size={14} /></div>
            </button>
            <button onClick={() => setMode('casebook-dashboard')}
              className="text-left bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all border-2 border-transparent hover:border-orange-400">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-600 to-amber-700 flex items-center justify-center mb-3"><ClipboardList size={24} className="text-white" /></div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Casebook</h3>
              <p className="text-sm text-gray-600 leading-relaxed">Register real entrepreneurs, run structured consultations, save case records and follow-ups.</p>
              <div className="mt-2 flex items-center gap-1 text-orange-700 font-semibold text-sm">Real clients <ChevronRight size={14} /></div>
            </button>
            <button onClick={() => setMode('enterprise-dashboard')}
              className="text-left bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all border-2 border-transparent hover:border-emerald-400">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center mb-3"><Store size={24} className="text-white" /></div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">My Enterprise</h3>
              <p className="text-sm text-gray-600 leading-relaxed">Log your own sales week by week — a business you're building for yourself.</p>
              <div className="mt-2 flex items-center gap-1 text-emerald-700 font-semibold text-sm">Build your own <ChevronRight size={14} /></div>
            </button>
            <button onClick={() => setMode('consult-personas')}
              className="text-left bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all border-2 border-transparent hover:border-red-400">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center mb-3"><Users size={24} className="text-white" /></div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Practice Mode</h3>
              <p className="text-sm text-gray-600 leading-relaxed">AI plays a young Nigerian entrepreneur. Practise advising and get evaluated.</p>
              <div className="mt-2 flex items-center gap-1 text-red-700 font-semibold text-sm">Practice advising <ChevronRight size={14} /></div>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: <Briefcase size={15}/>, title: 'CAC registration from ~₦10,000', desc: 'Enables a business bank account, grants, and formal contracts', colour: 'bg-amber-900/60 border-amber-400/40 text-amber-200' },
              { icon: <Handshake size={15}/>, title: 'Ajo is as powerful as a bank', desc: 'Rotating savings cooperatives fund more Nigerian businesses than formal loans', colour: 'bg-orange-900/60 border-orange-400/40 text-orange-200' },
              { icon: <Zap size={15}/>, title: 'AI gives small businesses superpowers', desc: 'Free AI tools give access to marketing, pricing, and planning skills previously unaffordable', colour: 'bg-yellow-900/60 border-yellow-400/40 text-yellow-200' },
            ].map((f, i) => (
              <div key={i} className={`rounded-xl border backdrop-blur-sm p-4 ${f.colour}`}>
                <div className="flex items-center gap-2 mb-1 font-bold text-sm">{f.icon} {f.title}</div>
                <p className="text-xs opacity-80">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: LEARN TOPICS
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'learn-topics') {
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-3xl mx-auto px-6 py-10">
          <button onClick={() => setMode('select')} className="flex items-center gap-2 text-amber-200 hover:text-white mb-6 transition-colors"><ArrowLeft size={18}/> Back</button>
          <h2 className="text-3xl font-bold text-white mb-2">Choose a Learning Topic</h2>
          <p className="text-amber-200 mb-6">Each topic is a focused session with an expert AI tutor grounded in Nigerian business realities.</p>
          <div className="space-y-3">
            {LEARNING_TOPICS.map(t => (
              <button key={t.id} onClick={() => { setTopic(t); setMessages([]); setMode('learn-chat'); }}
                className="w-full text-left bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow hover:shadow-xl hover:scale-[1.01] transition-all border-2 border-transparent hover:border-amber-400 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.colour} flex items-center justify-center text-white flex-shrink-0`}>{t.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-bold text-gray-900">{t.title}</h3>
                    {t.urgency && <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">{t.urgency}</span>}
                  </div>
                  <p className="text-gray-600 mt-0.5">{t.subtitle}</p>
                </div>
                <ChevronRight size={20} className="text-gray-400 flex-shrink-0 mt-1"/>
              </button>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: CASEBOOK DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'casebook-dashboard') {
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setMode('select')} className="text-white/70 hover:text-white p-1"><ArrowLeft size={18}/></button>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center text-2xl">💼</div>
                <div>
                  <h1 className="text-xl font-bold text-white">Entrepreneur Casebook</h1>
                  <p className="text-sm text-amber-200">Your client records · Oloibiri & Ibiade</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText="Your client records · Oloibiri & Ibiade"
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowOfflineModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold text-sm transition-colors border border-white/30"
                  title="Use offline version"
                >
                  📴 Offline
                </button>
                <button onClick={() => { resetAddClient(); setMode('add-client'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-semibold text-sm hover:opacity-90">
                  <Plus size={16}/> Add Client
                </button>
              </div>
            </div>
          </div>

          {clients.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Clients', value: clients.length, icon: '💼' },
                { label: 'Open Cases', value: clients.reduce((s, c) => s + (c.open_cases ?? 0), 0), icon: '📋' },
                { label: 'This Month', value: clients.filter(c => c.last_consultation_at && new Date(c.last_consultation_at) > new Date(Date.now() - 30*24*60*60*1000)).length, icon: '📅' },
              ].map(stat => (
                <div key={stat.label} className="bg-white/90 backdrop-blur-sm rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Challenge Banner — available (not enrolled) ── */}
          {!challengeLoading && availableChallenge && !activeChallenge && (
            <div className="bg-amber-900/80 backdrop-blur-sm border border-amber-400/50 rounded-2xl p-5 mb-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-amber-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">Community AI Challenge — This Week</span>
                    <span className="text-xs bg-amber-400/20 text-amber-200 px-2 py-0.5 rounded-full">{availableChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{availableChallenge.title}</p>
                  <p className="text-amber-100 text-sm leading-relaxed mb-3">{availableChallenge.description}</p>
                  <button
                    onClick={() => handleEnrollChallenge(availableChallenge)}
                    disabled={enrolling}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {enrolling
                      ? <><Loader2 size={14} className="animate-spin" /> Checking out…</>
                      : <><ChevronRight size={16} /> Check out this challenge</>
                    }
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Challenge Banner — enrolled ── */}
          {activeChallenge && (
            <div className="bg-orange-900/80 backdrop-blur-sm border border-orange-400/50 rounded-2xl p-5 mb-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-orange-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-orange-300 uppercase tracking-wide">Community AI Challenge — Active</span>
                    <span className="text-xs bg-orange-400/20 text-orange-200 px-2 py-0.5 rounded-full">{activeChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{activeChallenge.title}</p>
                  <p className="text-orange-100 text-sm leading-relaxed mb-2">{activeChallenge.challenge_mode_intro}</p>
                  <div className="bg-orange-800/60 rounded-xl p-3 mb-3">
                    <p className="text-xs font-bold text-orange-300 mb-1">Your mission:</p>
                    <p className="text-orange-100 text-sm">{activeChallenge.challenge_instruction}</p>
                  </div>
                  <button
                    onClick={() => setShowChallengeReflect(true)}
                    className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} /> I've done it — submit my reflection
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Challenge Reflection Modal ── */}
          {showChallengeReflect && activeChallenge && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                {challengeResult ? (
                  <div className="p-6">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                        <Award size={32} className="text-amber-600" />
                      </div>
                      <h2 className="text-2xl font-black text-gray-900">{challengeResult.tier_label}</h2>
                      <p className="text-sm text-amber-600 font-bold uppercase tracking-wide mt-1">{challengeResult.tier} tier earned</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-amber-800 mb-1">What you achieved</p>
                      <p className="text-sm text-amber-700 leading-relaxed">{challengeResult.summary}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-blue-800 mb-1">Why you earned this tier</p>
                      <p className="text-sm text-blue-700 leading-relaxed">{challengeResult.tier_reasoning}</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-orange-800 mb-1">What to do next</p>
                      <p className="text-sm text-orange-700 leading-relaxed">{challengeResult.follow_up_instruction}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 mb-5">
                      <p className="text-xs text-gray-500">{challengeResult.next_tier_hint}</p>
                    </div>
                    <button
                      onClick={() => { setShowChallengeReflect(false); setChallengeResult(null); setActiveChallenge(null); }}
                      className="w-full py-3 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-xs font-bold text-amber-500 uppercase tracking-wide mb-0.5">Challenge Reflection</p>
                        <h2 className="text-xl font-black text-gray-900">{activeChallenge.title}</h2>
                      </div>
                      <button onClick={() => setShowChallengeReflect(false)} className="text-gray-400 hover:text-gray-600 p-1">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_1}</label>
                        <textarea value={challengeReflect1} onChange={e => setChallengeReflect1(e.target.value)} rows={3}
                          placeholder="Describe what you did…"
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed"/>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_2}</label>
                        <textarea value={challengeReflect2} onChange={e => setChallengeReflect2(e.target.value)} rows={3}
                          placeholder="What happened…"
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed"/>
                      </div>
                      {activeChallenge.return_question_3 && (
                        <div>
                          <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_3}</label>
                          <textarea value={challengeReflect3} onChange={e => setChallengeReflect3(e.target.value)} rows={2}
                            placeholder="Additional details…"
                            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed"/>
                        </div>
                      )}
                      <EvidencePicker sourceType="challenge_enrollment" sourceId={activeChallenge.enrollmentId} accent="amber" />
                    </div>
                    <button
                      onClick={handleSubmitChallengeReflection}
                      disabled={!challengeReflect1.trim() || !challengeReflect2.trim() || challengeSubmitting}
                      className="w-full mt-6 py-3.5 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {challengeSubmitting
                        ? <><Loader2 size={16} className="animate-spin" /> Evaluating your impact…</>
                        : <><CheckCircle size={16} /> Submit reflection</>
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Offline Mode Modal ────────────────────────────────────────── */}
          {showOfflineModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b bg-amber-50 rounded-t-2xl">
                  <div>
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-wide">Offline Mode</p>
                    <h2 className="text-lg font-bold text-gray-900">Entrepreneur Advisor — Offline</h2>
                  </div>
                  <button onClick={() => setShowOfflineModal(false)} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <X size={18}/>
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-2">📴 Use the offline advisor now</p>
                    <p className="text-sm text-amber-700 mb-3 leading-relaxed">
                      The offline version works without internet. It covers all six consultation types — starting up, business planning, pricing, marketing, fixing problems, and scaling — and saves consultations to your device for later sync.
                    </p>
                    <a
                      href="/offline-entrepreneurship-advisor.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold text-sm hover:opacity-90 transition-opacity"
                    >
                      <span>📴</span> Open Offline Advisor
                    </a>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-gray-800 mb-3">📱 Install on your phone (works without internet)</p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Open in your browser</p>
                          <p className="text-xs text-gray-500 mt-0.5">Tap "Open Offline Advisor" above. It will open in a new tab in your phone's browser (Chrome or Safari).</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Add to Home Screen</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            <strong>Android (Chrome):</strong> Tap the ⋮ menu → "Add to Home Screen" → "Add".<br/>
                            <strong>iPhone (Safari):</strong> Tap the Share button (□↑) → "Add to Home Screen" → "Add".
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Use it anywhere — no internet needed</p>
                          <p className="text-xs text-gray-500 mt-0.5">Open it during a consultation, complete the triage, and save to your device.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Sync when back online</p>
                          <p className="text-xs text-gray-500 mt-0.5">Tap the ⬆ sync button in the top right and your saved consultations upload to the vAI database automatically.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-2">💡 Tips for field use</p>
                    <ul className="space-y-1.5 text-xs text-amber-700">
                      <li>• Complete required fields — especially business idea/problem and current financial situation</li>
                      <li>• Use the 💡 tip buttons — they explain what each field is really asking for</li>
                      <li>• <strong>Cash crisis</strong> cases are flagged as urgent — the advisor will detect signs of financial distress</li>
                      <li>• <strong>Pricing</strong> consultations: push for ALL costs including the entrepreneur's own time and transport</li>
                      <li>• The Consultation Record can be shared with the entrepreneur as a take-home action plan</li>
                    </ul>
                  </div>

                  <button
                    onClick={() => setShowOfflineModal(false)}
                    className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingClients ? (
            <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-amber-300"/></div>
          ) : clients.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-10 text-center">
              <div className="text-5xl mb-4">💼</div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">No clients registered yet</h2>
              <p className="text-sm text-gray-500 mb-5">Add your first entrepreneur client to start your casebook.</p>
              <button onClick={() => { resetAddClient(); setMode('add-client'); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-semibold hover:opacity-90">
                <Plus size={16}/> Register First Client
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map(client => (
                <button key={client.id}
                  onClick={() => { setSelectedClient(client); loadConsultations(client.id); setMode('client-detail'); }}
                  className="w-full bg-white/90 backdrop-blur-sm rounded-2xl p-4 text-left hover:bg-white transition-colors border border-transparent hover:border-amber-300">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-lg">💼</div>
                      <div>
                        <p className="font-bold text-gray-900">{client.client_name}</p>
                        <p className="text-sm text-gray-500">{client.village}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{client.business_type}</span>
                          <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{client.business_stage}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <ChevronRight size={17} className="text-gray-400"/>
                      {(client.open_cases ?? 0) > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">{client.open_cases} open</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>{client.total_consultations ?? 0} consultation{client.total_consultations !== 1 ? 's' : ''}</span>
                    {client.last_consultation_at && <span>Last: {formatDate(client.last_consultation_at)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: ADD CLIENT
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'add-client') {
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setMode('casebook-dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div><h2 className="text-xl font-bold text-gray-900">Register Client</h2><p className="text-sm text-gray-500">Add entrepreneur to your casebook</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Mama Fatima Okafor"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Village *</label>
                <select value={newVillage} onChange={e => setNewVillage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-base bg-white">
                  <option value="">Select village…</option>
                  {VILLAGES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Business Type *</label>
                <input value={newBusinessType} onChange={e => setNewBusinessType(e.target.value)} placeholder="e.g. Event food catering, phone repair, garri processing, fashion design"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Business Stage *</label>
                <select value={newBusinessStage} onChange={e => setNewBusinessStage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-base bg-white">
                  <option value="">Select stage…</option>
                  {BUSINESS_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone (optional)</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+234 801 234 5678"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
                  placeholder="Capital available, past issues, special context…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm resize-none"/>
              </div>
              <button onClick={saveClient} disabled={!newName.trim() || !newVillage || !newBusinessType.trim() || !newBusinessStage || savingClient}
                className={classNames('w-full py-3.5 rounded-xl font-bold text-white text-base transition-opacity',
                  newName.trim() && newVillage && newBusinessType.trim() && newBusinessStage && !savingClient ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:opacity-90' : 'bg-gray-300 cursor-not-allowed')}>
                {savingClient ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>Saving…</span> : 'Register Client'}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: MY ENTERPRISE DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'enterprise-dashboard') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekTotal = enterpriseEntries
      .filter(e => e.unit === 'NGN' && e.amount != null && new Date(e.entry_date) >= weekAgo)
      .reduce((s, e) => s + (e.amount || 0), 0);
    const allTimeTotal = enterpriseEntries
      .filter(e => e.unit === 'NGN' && e.amount != null)
      .reduce((s, e) => s + (e.amount || 0), 0);

    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setMode('select')} className="text-white/70 hover:text-white p-1"><ArrowLeft size={18}/></button>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center"><Store size={22} className="text-white" /></div>
                <div>
                  {editingEnterpriseName ? (
                    <div className="flex items-center gap-2">
                      <input value={enterpriseName} onChange={e => setEnterpriseName(e.target.value)} placeholder="Name your enterprise…" autoFocus
                        className="px-2 py-1 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
                      <button onClick={saveEnterpriseName} disabled={savingEnterpriseName} className="text-emerald-300 hover:text-white text-xs font-bold">Save</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingEnterpriseName(true)} className="text-left">
                      <h1 className="text-xl font-bold text-white">{enterpriseName.trim() || 'My Enterprise'} <span className="text-xs font-normal text-emerald-200 opacity-70">(edit)</span></h1>
                    </button>
                  )}
                  <p className="text-sm text-emerald-200">Your own venture — logged week by week</p>
                </div>
              </div>
              <button onClick={() => { resetEnterpriseForm(); setMode('enterprise-add'); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl font-semibold text-sm hover:opacity-90">
                <Plus size={16}/> Log a Sale
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'This Week', value: `₦${weekTotal.toLocaleString()}`, icon: '📅' },
              { label: 'All-Time', value: `₦${allTimeTotal.toLocaleString()}`, icon: '💰' },
              { label: 'Sales Logged', value: enterpriseEntries.length, icon: '🧾' },
            ].map(stat => (
              <div key={stat.label} className="bg-white/90 backdrop-blur-sm rounded-xl p-4 text-center">
                <div className="text-2xl mb-1">{stat.icon}</div>
                <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-md overflow-hidden">
            {loadingEnterprise ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
                <Loader2 size={16} className="animate-spin" /> Loading your sales…
              </div>
            ) : enterpriseEntries.length === 0 ? (
              <div className="py-12 text-center px-6">
                <p className="text-gray-500 text-sm mb-3">No sales logged yet. Sold something this week? Log it — even a small sale counts.</p>
                <button onClick={() => { resetEnterpriseForm(); setMode('enterprise-add'); }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700">
                  Log your first sale
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {enterpriseEntries.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{entry.item_or_service}</span>
                        <span className="text-xs text-gray-400">{formatDate(entry.entry_date)}</span>
                      </div>
                      {entry.buyer_description && <p className="text-xs text-gray-500 mt-0.5">Sold to: {entry.buyer_description}</p>}
                      {entry.notes && <p className="text-xs text-gray-400 mt-0.5">{entry.notes}</p>}
                    </div>
                    {entry.amount != null && (
                      <span className="text-sm font-bold text-emerald-700 whitespace-nowrap">
                        {entry.unit === 'NGN' ? '₦' : ''}{entry.amount.toLocaleString()}{entry.unit !== 'NGN' ? ` ${entry.unit}` : ''}
                      </span>
                    )}
                    <button onClick={() => deleteEnterpriseEntry(entry.id)} className="text-gray-300 hover:text-red-500 p-1" title="Delete entry">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: LOG A SALE (MY ENTERPRISE)
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'enterprise-add') {
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setMode('enterprise-dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div><h2 className="text-xl font-bold text-gray-900">Log a Sale</h2><p className="text-sm text-gray-500">What did you sell this week?</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">What did you sell? *</label>
                <input value={neItemOrService} onChange={e => setNeItemOrService(e.target.value)} placeholder="e.g. 20 plates of jollof rice, phone screen repair"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Who bought it? (optional)</label>
                <input value={neBuyer} onChange={e => setNeBuyer(e.target.value)} placeholder="e.g. Church event, neighbour, walk-in customer"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-base"/>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">For how much? (optional)</label>
                  <input type="number" value={neAmount} onChange={e => setNeAmount(e.target.value)} placeholder="e.g. 15000"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-base"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unit</label>
                  <select value={neUnit} onChange={e => setNeUnit(e.target.value as 'NGN' | 'other')}
                    className="px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-base bg-white">
                    <option value="NGN">₦ (Naira)</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                <input type="date" value={neDate} onChange={e => setNeDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-base"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={neNotes} onChange={e => setNeNotes(e.target.value)} rows={2}
                  placeholder="Anything worth remembering about this sale…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm resize-none"/>
              </div>
              <button onClick={saveEnterpriseEntry} disabled={!neItemOrService.trim() || savingEntry}
                className={classNames('w-full py-3.5 rounded-xl font-bold text-white text-base transition-opacity',
                  neItemOrService.trim() && !savingEntry ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-90' : 'bg-gray-300 cursor-not-allowed')}>
                {savingEntry ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>Saving…</span> : 'Save Sale'}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: CLIENT DETAIL
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'client-detail' && selectedClient) {
    const client = selectedClient;
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('casebook-dashboard')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-2xl">💼</div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{client.client_name}</h2>
                <p className="text-sm text-gray-500">{client.village}{client.phone ? ` · ${client.phone}` : ''}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1.5 rounded-xl text-sm font-semibold border bg-amber-50 border-amber-300 text-amber-700">{client.business_type}</span>
              <span className="px-3 py-1.5 rounded-xl text-sm font-semibold border bg-gray-50 border-gray-200 text-gray-700">{client.business_stage}</span>
            </div>
            {client.notes && <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg px-3 py-2 mb-4">{client.notes}</p>}
            <p className="text-sm font-bold text-gray-700 mb-3">Start new consultation:</p>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(CONSULT_TYPES) as [ConsultationType, typeof CONSULT_TYPES[ConsultationType]][]).map(([key, ct]) => (
                <button key={key} onClick={() => startConsultation(client, key)}
                  className={classNames('flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-white text-sm bg-gradient-to-r hover:opacity-90 transition-opacity text-left', ct.colour)}>
                  <span className="text-xl flex-shrink-0">{ct.emoji}</span>
                  <div>
                    <div>{ct.label}</div>
                    <div className="text-xs font-normal opacity-80">{ct.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><ClipboardList size={16} className="text-amber-600"/> Case History</h3>
              <button onClick={() => loadConsultations(client.id)} className="text-gray-400 hover:text-gray-700"><RefreshCwIcon size={14}/></button>
            </div>
            {loadingConsults ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-amber-600"/></div>
            ) : consultations.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">No consultations yet.</p>
            ) : (
              <div className="space-y-3">
                {consultations.map(c => {
                  const ct = CONSULT_TYPES[c.consultation_type];
                  return (
                    <div key={c.id} className="border border-gray-200 rounded-xl p-4 hover:border-amber-300 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{ct.emoji}</span>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{ct.label}</p>
                            <p className="text-xs text-gray-500">{formatDate(c.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {c.urgency_level && <UrgencyBadge level={c.urgency_level}/>}
                          {c.resolved ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Resolved</span> : <span className="text-xs text-orange-600 font-semibold">Open</span>}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{c.problem_summary}</p>
                      {c.follow_up_needed && !c.resolved && c.follow_up_date && (
                        <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1"><Calendar size={11}/> Follow-up: {formatDate(c.follow_up_date)}</p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setSelectedConsultation(c); setMode('case-detail'); }} className="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:border-amber-300 hover:text-amber-700">View Case</button>
                        <button onClick={() => openFollowupChat(client, c)} className="flex-1 py-2 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100">Ask AI Follow-up</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: NEW CONSULTATION
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'new-consultation' && selectedClient && consultationType) {
    const ct = CONSULT_TYPES[consultationType];
    const fields = INTAKE_FIELDS[consultationType];
    const allText = Object.values(intake).join(' ').toLowerCase();
    const cashAlert = allText.includes('weeks left') || (allText.includes('no money') && allText.includes('pay'));
    const loanAlert = allText.includes('₦500,000') || allText.includes('₦1,000,000');

    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        {probeField && (
          <ProbePanel field={probeField} consultType={consultationType} messages={probeMessages} loading={probeLoading} done={probeDone}
            input={probeInput} onInputChange={setProbeInput} onSend={sendProbeMessage} onClose={closeProbe} chatEndRef={probeChatEndRef}/>
        )}
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setMode('client-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-xl`}>{ct.emoji}</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{ct.label}</h2>
                <p className="text-xs text-gray-500">{selectedClient.client_name} · {selectedClient.village} · {selectedClient.business_type}</p>
              </div>
            </div>
          </div>

          {cashAlert && (
            <div className="bg-red-600 text-white rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div><p className="font-bold">🚨 CASH CRISIS INDICATOR</p><p className="text-sm opacity-90">Complete the intake and generate AI Advice immediately — lead with emergency revenue actions.</p></div>
            </div>
          )}
          {loanAlert && (
            <div className="bg-orange-600 text-white rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5"/>
              <div><p className="font-bold">⚠️ HIGH-RISK LOAN PLAN DETECTED</p><p className="text-sm opacity-90">Large loan before validation is a major risk. Generate AI Advice to build a safer path.</p></div>
            </div>
          )}

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <Lightbulb size={14} className="text-amber-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-700">Fill each field with what the entrepreneur tells you. Tap <strong>🔍 Probe</strong> to get AI-coached interview questions — one at a time. When done, run AI Advice.</p>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2"><FileText size={15} className="text-amber-600"/> Intake — {ct.label}</h3>
            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1"><span className="text-amber-600 font-bold">🔍 Probe</span> — tap after a field to explore it deeper</p>
            <div className="space-y-4">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-semibold text-gray-600 flex items-center mb-1">
                    {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
                    <InfoTooltip id={field.key} text={field.tooltip} open={openTooltip === field.key} onToggle={() => setOpenTooltip(openTooltip === field.key ? null : field.key)}/>
                  </label>
                  <div className="flex gap-2">
                    <textarea value={intake[field.key] || ''} onChange={e => setIntake(prev => ({ ...prev, [field.key]: e.target.value }))}
                      rows={2} placeholder={field.placeholder}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                    <button onClick={() => openProbe(field)}
                      className={classNames('px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex-shrink-0 self-start mt-0.5',
                        probeField?.key === field.key ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100')}>
                      {probeField?.key === field.key ? '🔍 Probing…' : '🔍 Probe'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!adviceResult ? (
            <button onClick={runAdvice} disabled={isGeneratingAdvice || !intakeComplete}
              className={classNames('w-full py-4 rounded-xl font-bold text-white text-base transition-opacity flex items-center justify-center gap-2',
                !isGeneratingAdvice && intakeComplete ? `bg-gradient-to-r ${ct.colour} hover:opacity-90` : 'bg-gray-300 cursor-not-allowed')}>
              {isGeneratingAdvice ? <><Loader2 size={18} className="animate-spin"/>Generating AI Advice…</> : <><Briefcase size={18}/>Generate AI Advice{!intakeComplete && ' (fill required fields first)'}</>}
            </button>
          ) : (
            <div className={classNames('bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5 border-2', URGENCY_CONFIG[adviceResult.urgency].border)}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Advisory Result</p>
                  <UrgencyBadge level={adviceResult.urgency}/>
                  <p className="text-xs text-gray-500 mt-1">{URGENCY_CONFIG[adviceResult.urgency].description}</p>
                </div>
                <button onClick={() => { setAdviceResult(null); runAdvice(); }} className="text-xs text-amber-600 hover:underline flex items-center gap-1"><RefreshCwIcon size={12}/> Re-run</button>
              </div>
              <div className="text-sm text-gray-800 bg-gray-50 rounded-xl px-4 py-3 max-h-72 overflow-y-auto"><MarkdownText text={adviceResult.text}/></div>
              <div className="mt-4 space-y-3 border-t pt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">What did you advise / do on the ground?</label>
                  <textarea value={advisorNotes} onChange={e => setAdvisorNotes(e.target.value)} rows={2}
                    placeholder="e.g. Showed how to calculate price properly. Helped set up WhatsApp Business catalogue. Explained Ajo savings."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="followup" checked={followUpNeeded} onChange={e => setFollowUpNeeded(e.target.checked)} className="w-4 h-4 accent-amber-600"/>
                  <label htmlFor="followup" className="text-sm font-semibold text-gray-700">Follow-up visit needed</label>
                </div>
                {followUpNeeded && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Follow-up date</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">What to check</label>
                      <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Check pricing is correct, did they open WhatsApp Business?"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                    </div>
                  </div>
                )}
                {consultSaved ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 font-semibold text-sm bg-green-50 rounded-xl px-4 py-3">
                      <CheckCircle size={16}/> Case saved to {selectedClient.client_name}'s record.
                    </div>
                    {/* Challenge nudge — shown after save when challenge is active */}
                    {activeChallenge && (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-2">
                        <Award size={16} className="text-amber-600 flex-shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-amber-800 mb-1">Community AI Challenge active</p>
                          <p className="text-xs text-amber-700 mb-2">You completed a consultation — did you also complete your challenge mission? Submit your reflection to earn your tier.</p>
                          <button
                            onClick={() => setShowChallengeReflect(true)}
                            className="text-xs font-bold text-amber-700 underline hover:text-amber-900"
                          >
                            Submit challenge reflection →
                          </button>
                        </div>
                      </div>
                    )}
                    {savedConsultId && (
                      <button onClick={() => {
                        const saved = consultations.find(c => c.id === savedConsultId) ?? {
                          id: savedConsultId, client_id: selectedClient.id, youth_user_id: user?.id ?? '',
                          consultation_type: consultationType, problem_summary: '', ai_advice: adviceResult.text,
                          urgency_level: adviceResult.urgency, youth_actions_taken: advisorNotes || null,
                          conversation_history: [], follow_up_needed: followUpNeeded, follow_up_date: followUpDate || null,
                          follow_up_notes: followUpNotes || null, resolved: false, resolved_at: null, created_at: new Date().toISOString(),
                        } as Consultation;
                        openFollowupChat(selectedClient, saved);
                      }} className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:opacity-90 flex items-center justify-center gap-2">
                        <Send size={16}/> Continue with AI Follow-up Chat
                      </button>
                    )}
                  </div>
                ) : (
                  <button onClick={saveConsultation} disabled={savingConsult}
                    className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:opacity-90 disabled:opacity-50">
                    {savingConsult ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin"/>Saving…</span> : 'Save Case Record'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck size={14} className="text-amber-700 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-600">This AI advice is <strong>business support only</strong>. For legal, tax, or formal registration matters, refer to a CAC-registered agent or qualified professional.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: FOLLOW-UP CHAT
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'followup-chat' && selectedClient && selectedConsultation) {
    const ct = CONSULT_TYPES[selectedConsultation.consultation_type];
    const followupTurns = messages.filter(m => m.role === 'user').length;
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
          <div className="bg-black/50 backdrop-blur-sm rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setMode('client-detail'); }} className="text-white/70 hover:text-white p-1"><ArrowLeft size={20}/></button>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-lg`}>{ct.emoji}</div>
                <div>
                  <h2 className="text-base font-bold text-white">Follow-up Questions</h2>
                  <p className="text-xs text-white/70">{selectedClient.client_name} · {ct.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border border-white/30">
                  {(['pidgin', 'english'] as const).map(m => (
                    <button key={m} onClick={() => setVoiceMode(m)}
                      className={`px-2.5 py-1.5 text-xs font-bold border-r border-white/30 last:border-0 transition-all ${voiceMode===m?(m==='english'?'bg-blue-600 text-white':'bg-green-600 text-white'):'bg-white/10 text-white/60'}`}>
                      {m==='english'?'🇬🇧':'🇳🇬'}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setSpeechOn(s => !s); if (speechOn) { window.speechSynthesis.cancel(); stopPidginSpeech(); } }}
                  className={classNames('p-2 rounded-lg', speechOn ? 'bg-amber-100 text-amber-700' : 'bg-white/20 text-white/60')}>
                  {speechOn ? <Volume2 size={15}/> : <VolumeX size={15}/>}
                </button>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: '500px' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{ct.emoji} Business AI Advisor</span>
              <span>{followupTurns} exchange{followupTurns !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-lg`}>{ct.emoji}</div>}
                  <div className={classNames('max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed', msg.role === 'user' ? 'bg-amber-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant' && <p className="text-xs font-bold mb-1 opacity-50">AI Business Advisor</p>}
                    {msg.role === 'user' && <p className="text-xs font-bold mb-1 opacity-75">You (Advisor)</p>}
                    <MarkdownText text={msg.content}/>
                    {msg.role === 'assistant' && <AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role === 'user' && <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center"><Briefcase size={15} className="text-white"/></div>}
                </div>
              ))}
              {isSending && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-lg`}>{ct.emoji}</div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3"><div className="flex gap-1.5 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div></div>
                </div>
              )}
              <div ref={chatEndRef}/>
            </div>
            <div className="border-t p-4 rounded-b-2xl">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} rows={2}
                  placeholder="Ask a follow-up question about this case…" disabled={isSending}
                  className="flex-1 px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed disabled:opacity-50"/>
                <div className="flex flex-col gap-2">
                  <button onClick={toggleListening} className={classNames('p-2.5 rounded-xl transition-all', isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>{isListening ? <MicOff size={16}/> : <Mic size={16}/>}</button>
                  <button onClick={sendFollowupMessage} disabled={!inputText.trim() || isSending}
                    className={classNames('p-2.5 rounded-xl transition-all', inputText.trim() && !isSending ? `bg-gradient-to-br ${ct.colour} text-white hover:opacity-90` : 'bg-gray-100 text-gray-400 cursor-not-allowed')}><Send size={16}/></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: CASE DETAIL
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'case-detail' && selectedConsultation && selectedClient) {
    const c = selectedConsultation;
    const ct = CONSULT_TYPES[c.consultation_type];
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setMode('client-detail')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${ct.colour} flex items-center justify-center text-2xl`}>{ct.emoji}</div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900">{ct.label} — {selectedClient.client_name}</h2>
                <p className="text-xs text-gray-500">{formatDate(c.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {c.urgency_level && <UrgencyBadge level={c.urgency_level}/>}
                {c.resolved ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Resolved</span> : <span className="text-xs text-orange-600 font-semibold">Open</span>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Problem Summary</p>
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-line">{c.problem_summary}</p>
              </div>
              {c.ai_advice && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Recommendation</p>
                  <div className={classNames('text-sm text-gray-800 rounded-lg px-3 py-2 max-h-48 overflow-y-auto border', c.urgency_level ? URGENCY_CONFIG[c.urgency_level].bg : 'bg-gray-50', c.urgency_level ? URGENCY_CONFIG[c.urgency_level].border : 'border-gray-200')}>
                    <MarkdownText text={c.ai_advice}/>
                  </div>
                </div>
              )}
              {c.youth_actions_taken && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Actions Taken by Advisor</p>
                  <p className="text-sm text-gray-800 bg-amber-50 rounded-lg px-3 py-2">{c.youth_actions_taken}</p>
                </div>
              )}
              {c.follow_up_needed && (
                <div className="flex items-start gap-2 text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                  <Calendar size={14} className="mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-sm font-semibold">Follow-up{c.follow_up_date ? `: ${formatDate(c.follow_up_date)}` : ' needed'}</p>
                    {c.follow_up_notes && <p className="text-xs mt-0.5">{c.follow_up_notes}</p>}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => openFollowupChat(selectedClient, c)} className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100">Ask AI Follow-up</button>
                {!c.resolved && (
                  <button onClick={() => setShowResolutionModal(true)}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:opacity-90">
                    Mark Resolved ✓
                  </button>
                )}
              </div>
              {c.resolved && c.resolution_narrative && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                    Outcome: {c.resolution_outcome === 'applied' ? 'Advice applied fully' : c.resolution_outcome === 'partially_applied' ? 'Partially applied' : 'Not applied'}
                  </p>
                  <p className="text-sm text-amber-800">{c.resolution_narrative}</p>
                  {c.resolution_value_amount != null && (
                    <p className="text-xs font-semibold text-amber-700">
                      {c.resolution_value_label}: {c.resolution_value_unit === 'NGN' ? '₦' : ''}{c.resolution_value_amount}{c.resolution_value_unit && c.resolution_value_unit !== 'NGN' ? ` ${c.resolution_value_unit}` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <ResolutionModal
            isOpen={showResolutionModal}
            consultationSummary={c.problem_summary}
            defaultUnit="NGN"
            defaultValueLabel="Estimated ₦ value (income earned or cost saved)"
            accent="amber"
            onClose={() => setShowResolutionModal(false)}
            onSubmit={(data) => handleResolutionSubmit(c.id, data)}
          />
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: CONSULT PERSONAS
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'consult-personas') {
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-10">
          <button onClick={() => setMode('select')} className="flex items-center gap-2 text-amber-200 hover:text-white mb-6 transition-colors"><ArrowLeft size={18}/> Back</button>
          <h2 className="text-3xl font-bold text-white mb-2">Choose an Entrepreneur to Advise</h2>
          <p className="text-amber-200 mb-6">The AI plays a young Nigerian with a real business challenge. You are the advisor. Get evaluated after 3+ exchanges.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ENTREPRENEUR_PERSONAS.map(p => (
              <button key={p.id} onClick={() => { setPersona(p); setMode('consult-prepare'); }}
                className="text-left bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all border-2 border-transparent hover:border-amber-400">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${p.colour} flex items-center justify-center text-2xl`}>{p.emoji}</div>
                  <div><h3 className="text-xl font-bold text-gray-900">{p.name}</h3><p className="text-sm text-gray-500">{p.age} years · {p.description}</p></div>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">{p.situation}</p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <p className="text-xs text-amber-800"><strong>Challenge:</strong> {p.mainChallenge}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: CONSULT PREPARE
  // ════════════════════════════════════════════════════════════════════════════

  if (mode === 'consult-prepare' && selectedPersona) {
    return (
      <AppLayout>
        <EntrepreneurshipBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
          <button onClick={() => setMode('consult-personas')} className="flex items-center gap-2 text-amber-200 hover:text-white mb-6 transition-colors"><ArrowLeft size={18}/> Back</button>
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden">
            <div className={`bg-gradient-to-r ${selectedPersona.colour} p-6`}>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">{selectedPersona.emoji}</div>
                <div><h2 className="text-3xl font-bold text-white">{selectedPersona.name}</h2><p className="text-white/80">{selectedPersona.age} years · {selectedPersona.description}</p></div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div><h3 className="font-bold text-gray-900 text-lg mb-2">Their Situation</h3><p className="text-gray-700 leading-relaxed">{selectedPersona.situation}</p></div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="font-bold text-blue-900 text-sm mb-1">Their opening:</p>
                <p className="text-blue-800 italic text-sm">"{selectedPersona.openingLine.slice(0, 180)}…"</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="font-bold text-amber-900 text-sm mb-2 flex items-center gap-2"><Lightbulb size={14}/> Advisor Tips</h3>
                <ul className="space-y-1 text-sm text-amber-800">
                  <li>✓ Ask about their capital BEFORE recommending anything</li>
                  <li>✓ Validate the idea before suggesting investment</li>
                  <li>✓ Give one specific, affordable first step — not a 5-year plan</li>
                  <li>✓ Connect AI tools to their specific business situation</li>
                  <li>✓ Use Nigerian examples: CAC, Opay, Ajo, WhatsApp Business, TEF</li>
                </ul>
              </div>
              <button onClick={() => { setMessages([]); setMode('consult-chat'); }}
                className={`w-full py-4 rounded-xl text-xl font-bold text-white bg-gradient-to-r ${selectedPersona.colour} hover:opacity-95 flex items-center justify-center gap-2`}>
                <Briefcase size={22}/> Begin Consultation with {selectedPersona.name}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: LEARN / CONSULT CHAT
  // ════════════════════════════════════════════════════════════════════════════

  if (isLearnOrConsultChat) {
    const chatTitle = isConsultChat ? `Advising: ${selectedPersona?.name}` : selectedTopic?.title;
    const chatSubtitle = isConsultChat ? `${selectedPersona?.age} years · ${selectedPersona?.description}` : 'Business Tutor';
    const avatarEmoji = isConsultChat ? selectedPersona?.emoji : '💼';

    return (
      <AppLayout>
        <EntrepreneurshipBackground />

        {showEvalModal && evaluation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl">
              <div className={`sticky top-0 bg-gradient-to-r ${activeColour} px-6 py-4 rounded-t-2xl flex items-center justify-between`}>
                <h2 className="text-white font-bold text-lg">Consultation Evaluation</h2>
                <button onClick={() => setShowEvalModal(false)} className="text-white/80 hover:text-white"><X size={22}/></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 uppercase font-bold mb-1">Overall Score</p>
                  <p className="text-5xl font-black text-gray-900">{evaluation.overall_score?.toFixed(1)}<span className="text-2xl font-normal text-gray-400">/3.0</span></p>
                  <p className={classNames('text-base font-bold mt-1', evaluation.can_advance ? 'text-emerald-600' : 'text-amber-600')}>
                    {evaluation.can_advance ? '✅ Ready to advise real entrepreneurs' : '🌱 Keep practising'}
                  </p>
                </div>
                <div className="space-y-3">
                  {CONSULT_RUBRIC.map(dim => {
                    const score = evaluation.scores?.[dim.id] ?? 0;
                    const ll = LEVEL_LABELS[score];
                    return (
                      <div key={dim.id} className={`rounded-xl p-4 ${ll.bg}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-gray-900">{dim.label}</span>
                          <span className={`text-sm font-bold px-2 py-0.5 rounded-full bg-white ${ll.color}`}>{score}/3 — {ll.text}</span>
                        </div>
                        <div className="w-full bg-white/60 rounded-full h-1.5 mb-1.5">
                          <div className={`h-full rounded-full ${score===3?'bg-emerald-500':score===2?'bg-blue-500':score===1?'bg-amber-500':'bg-gray-300'}`} style={{ width: `${(score/3)*100}%` }}/>
                        </div>
                        <p className="text-sm text-gray-700">{evaluation.evidence?.[dim.id]}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-emerald-800 mb-1">🌟 What you did well</p>
                  <p className="text-sm text-emerald-700">{evaluation.encouragement}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-800 mb-1">🎯 Focus here next</p>
                  <p className="text-sm text-amber-700">{evaluation.main_improvement}</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => { window.speechSynthesis.cancel(); setMessages([]); setEvaluation(null); setShowEvalModal(false); setDashboardId(null); setTopic(null); setPersona(null); setMode('select'); }} className="flex-1 py-3 rounded-xl font-bold text-white bg-gray-700 hover:bg-gray-800">New Session</button>
                  <button onClick={() => setShowEvalModal(false)} className={`flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r ${activeColour} hover:opacity-95`}>Continue</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="relative z-10 max-w-3xl mx-auto px-6 py-8">
          <div className="bg-black/50 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setMode(isConsultChat ? 'consult-personas' : 'learn-topics'); setMessages([]); }} className="text-white/70 hover:text-white p-1"><ArrowLeft size={20}/></button>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activeColour} flex items-center justify-center text-2xl`}>{avatarEmoji}</div>
                <div>
                  <h2 className="text-xl font-bold text-white">{chatTitle}</h2>
                  <p className="text-sm text-white/70">{chatSubtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-lg overflow-hidden border border-white/30">
                  {(['pidgin', 'english'] as const).map(m => (
                    <button key={m} onClick={() => setVoiceMode(m)}
                      className={`px-2.5 py-1.5 text-xs font-bold border-r border-white/30 last:border-0 transition-all ${voiceMode===m?(m==='english'?'bg-blue-600 text-white':'bg-green-600 text-white'):'bg-white/10 text-white/60'}`}>
                      {m==='english'?'🇬🇧':'🇳🇬'}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setSpeechOn(s => !s); if (speechOn) { window.speechSynthesis.cancel(); stopPidginSpeech(); } }} className={`p-2 rounded-lg ${speechOn?'bg-amber-100 text-amber-700':'bg-white/20 text-white/60'}`}>
                  {speechOn ? <Volume2 size={16}/> : <VolumeX size={16}/>}
                </button>
                <button onClick={handleSave} disabled={isSaving || messages.length < 2}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white border border-white/40 hover:border-white/70 rounded-lg transition-colors disabled:opacity-40">
                  {isSaving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Save
                </button>
                {isConsultChat && (
                  <button onClick={handleEvaluate} disabled={isEvaluating || userTurns < 3}
                    title={userTurns < 3 ? 'Have at least 3 exchanges first' : 'Evaluate your session'}
                    className={classNames('flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg transition-colors', userTurns>=3&&!isEvaluating?`bg-gradient-to-r ${activeColour} text-white hover:opacity-90`:'bg-white/20 text-white/40 cursor-not-allowed')}>
                    {isEvaluating ? <Loader2 size={14} className="animate-spin"/> : <Star size={14}/>}
                    {isEvaluating ? 'Evaluating…' : 'Evaluate'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <ShieldCheck size={15} className="text-amber-700 flex-shrink-0"/>
            <p className="text-sm text-gray-700">
              {isConsultChat ? `You are the advisor. Ask about their capital and situation before recommending anything. Connect AI tools to their specific business.` : `Ask freely. The tutor will check your understanding with practical examples.`}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: '520px' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl flex-shrink-0 text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{isConsultChat ? `Consultation with ${selectedPersona?.name}` : `Learning: ${selectedTopic?.title}`}</span>
              <span>{userTurns} turn{userTurns!==1?'s':''} {isConsultChat && `· ${userTurns>=3?'✅ Ready to evaluate':`${3-userTurns} more to unlock evaluation`}`}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role==='user'?'justify-end':'justify-start')}>
                  {msg.role==='assistant' && <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${activeColour} flex items-center justify-center text-xl`}>{avatarEmoji}</div>}
                  <div className={classNames('max-w-[75%] rounded-2xl px-5 py-4 text-sm leading-relaxed', msg.role==='user'?'bg-amber-600 text-white rounded-tr-sm':'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role==='assistant'&&<p className="text-xs font-bold mb-1 opacity-60">{isConsultChat?selectedPersona?.name:'Business Tutor'}</p>}
                    {msg.role==='user'&&<p className="text-xs font-bold mb-1 opacity-75">You (Advisor)</p>}
                    <MarkdownText text={msg.content}/>
                    {msg.role==='assistant'&&<AIPidginCoachWrapper englishText={msg.content} />}
                  </div>
                  {msg.role==='user'&&<div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center"><Briefcase size={18} className="text-white"/></div>}
                </div>
              ))}
              {isSending && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${activeColour} flex items-center justify-center text-xl`}>{avatarEmoji}</div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3"><div className="flex gap-1.5 h-5">{[0,150,300].map(d=><div key={d} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</div></div>
                </div>
              )}
              <div ref={chatEndRef}/>
            </div>
            <div className="border-t p-4 rounded-b-2xl">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={inputText} onChange={e=>setInputText(e.target.value)} onKeyDown={handleKeyDown} rows={2}
                  placeholder={isConsultChat ? `Advise ${selectedPersona?.name}…` : 'Ask a question about Nigerian business…'}
                  disabled={isSending}
                  className="flex-1 px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed disabled:opacity-50"/>
                <div className="flex flex-col gap-2">
                  <button onClick={toggleListening} className={classNames('p-2.5 rounded-xl', isListening?'bg-red-500 text-white animate-pulse':'bg-gray-100 text-gray-500 hover:bg-gray-200')}>{isListening?<MicOff size={16}/>:<Mic size={16}/>}</button>
                  <button onClick={sendLearnConsultMessage} disabled={!inputText.trim()||isSending}
                    className={classNames('p-2.5 rounded-xl', inputText.trim()&&!isSending?`bg-gradient-to-br ${activeColour} text-white hover:opacity-90`:'bg-gray-100 text-gray-400 cursor-not-allowed')}><Send size={16}/></button>
                </div>
              </div>
            </div>
          </div>

          {isConsultChat && userTurns >= 3 && !showEvalModal && (
            <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 flex items-center justify-between shadow">
              <div className="flex items-center gap-2"><Award size={20} className="text-amber-600"/><p className="text-base font-semibold text-gray-800">Good session — get your evaluation when ready.</p></div>
              <button onClick={handleEvaluate} disabled={isEvaluating}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r ${activeColour} hover:opacity-90`}>
                {isEvaluating?<><Loader2 size={16} className="animate-spin"/>Evaluating…</>:<><Star size={16}/>Evaluate</>}
              </button>
            </div>
          )}
          <div className="mt-3 flex justify-center">
            <button onClick={() => { window.speechSynthesis.cancel(); setMessages([]); setEvaluation(null); setShowEvalModal(false); setDashboardId(null); setTopic(null); setPersona(null); setMode('select'); }} className="text-sm text-white/60 hover:text-white/90 underline">Start over</button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return null;
};

export default EntrepreneurshipConsultantPage;