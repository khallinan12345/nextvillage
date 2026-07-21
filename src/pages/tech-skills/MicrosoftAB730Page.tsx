// src/pages/tech-skills/MicrosoftAB730Page.tsx
// Microsoft AB-730: AI Business Professional — Certification Prep
// API routes needed:
//   /api/ab730-task-instruction   (returns TaskInstruction for each topic)
//   /api/ab730-evaluate-session   (returns evaluation scores + feedback)

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import {
  Brain, BookOpen, CheckCircle, ArrowRight, Loader2, FolderOpen,
  ArrowUpCircle, SkipForward, Lightbulb, BarChart3, Award, X,
  Copy, Volume2, VolumeX, AlertCircle, Star, GraduationCap,
  Target, TrendingUp, HelpCircle, Trash2, Plus, Zap, Sparkles,
  FileText, MessageSquare, BarChart2, Users, Shield, Briefcase,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopicDef {
  id: string;
  label: string;
  skill: 1 | 2 | 3;
  icon: string;
  isOnboarding?: boolean;
  weight: string;
}

interface TaskInstruction {
  headline: string;
  context: string;
  subTasks: string[];
  subTaskTeaching: string[];
  examplePrompt: string;
}

interface QuizEntry {
  id: string;
  topicId: string;
  subTaskIndex: number;
  subTaskQuestion?: string;
  subTaskTeaching?: string;
  userAnswer: string;
  aiExplanation?: string;
  aiCritique?: string;
  hasSuggestions?: boolean;
  timestamp: string;
  action: 'answer' | 'iterate' | 'critique' | 'practice';
}

interface SessionRecord {
  id: number;
  ab730_session_id: string;
  ab730_session_name: string;
  ab730_prompts: any[];
  ab730_evaluation: any | null;
  updated_at?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const makeId = () => Math.random().toString(36).substring(2, 9);
const AB730_ACTIVITY = 'ab730_cert_prep';

const TOPICS: TopicDef[] = [
  // Onboarding
  { id: 'intro_ab730',       label: 'Welcome & Exam Overview',        skill: 1, icon: '🎓', isOnboarding: true, weight: '' },

  // Skill 1 — Understand Generative AI Fundamentals (≈30%)
  { id: 'genai_how_works',   label: 'How Generative AI Works',         skill: 1, icon: '🧠', weight: '~30%' },
  { id: 'copilot_overview',  label: 'Microsoft 365 Copilot Overview',  skill: 1, icon: '✨', weight: '~30%' },
  { id: 'responsible_ai',    label: 'Responsible AI & Data Privacy',   skill: 1, icon: '🛡️', weight: '~30%' },
  { id: 'grounding_context', label: 'Grounding & Context in Copilot',  skill: 1, icon: '🔗', weight: '~30%' },

  // Skill 2 — Manage Prompts and Conversations (≈35%)
  { id: 'prompt_principles', label: 'Prompt Engineering Principles',   skill: 2, icon: '📝', weight: '~35%' },
  { id: 'prompt_techniques', label: 'Advanced Prompt Techniques',      skill: 2, icon: '🎯', weight: '~35%' },
  { id: 'agents_copilot',    label: 'Copilot Agents & Automation',     skill: 2, icon: '🤖', weight: '~35%' },
  { id: 'managing_convos',   label: 'Managing Conversations & Output', skill: 2, icon: '💬', weight: '~35%' },

  // Skill 3 — Draft and Analyze Business Content (≈35%)
  { id: 'copilot_word',      label: 'Copilot in Word & Documents',     skill: 3, icon: '📄', weight: '~35%' },
  { id: 'copilot_excel',     label: 'Copilot in Excel & Data',         skill: 3, icon: '📊', weight: '~35%' },
  { id: 'copilot_ppt',       label: 'Copilot in PowerPoint',           skill: 3, icon: '🖥️', weight: '~35%' },
  { id: 'copilot_outlook',   label: 'Copilot in Outlook & Email',      skill: 3, icon: '📧', weight: '~35%' },
  { id: 'copilot_teams',     label: 'Copilot in Teams & Meetings',     skill: 3, icon: '👥', weight: '~35%' },
  { id: 'evaluating_output', label: 'Evaluating & Refining AI Output', skill: 3, icon: '🔍', weight: '~35%' },

  // Practice exam
  { id: 'practice_exam',     label: 'Practice Exam Simulation',        skill: 3, icon: '🎯', weight: '' },
];

const SKILL_META: Record<number, {
  label: string; shortLabel: string; color: string;
  bg: string; border: string; icon: React.ReactNode;
}> = {
  1: { label: 'Skill 1: Generative AI Fundamentals', shortLabel: 'S1: AI Fundamentals', color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',   icon: <Brain size={12} /> },
  2: { label: 'Skill 2: Prompts & Conversations',    shortLabel: 'S2: Prompts',         color: 'text-purple-400',  bg: 'bg-purple-500/15',  border: 'border-purple-500/30', icon: <MessageSquare size={12} /> },
  3: { label: 'Skill 3: Business Content',           shortLabel: 'S3: Content',         color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30',icon: <FileText size={12} /> },
};

// ─── Fallback seeds ───────────────────────────────────────────────────────────

const FALLBACK_SEEDS: Record<string, { teaching: string; question: string }[]> = {
  genai_how_works: [
    { teaching: 'Generative AI models like Microsoft Copilot are trained on vast amounts of text. They predict the most useful next words based on patterns learned — they do not "look things up" like a search engine. They generate new text from patterns.',
      question: 'You ask Copilot to summarise a document. In your own words, explain what Copilot is actually doing — is it reading and memorising the document, or doing something else? What does "generating" a summary mean?' },
    { teaching: 'Large Language Models (LLMs) work by tokenising text into chunks and predicting the next token based on what came before. This is why they can hallucinate — they generate plausible-sounding text even when they do not have accurate information.',
      question: 'Copilot writes a summary of a report and includes a statistic that looks correct but is actually wrong. What is this problem called in AI — and what should a business professional always do before using AI-generated content in a final document?' },
    { teaching: 'Microsoft 365 Copilot combines an LLM with your organisation\'s data via Microsoft Graph. This is called "grounding" — the AI\'s responses are anchored to real documents, emails, and data from your work environment, not just general training knowledge.',
      question: 'What is the key difference between asking a public AI chatbot a question versus asking Microsoft 365 Copilot the same question inside your organisation\'s Microsoft 365 environment? Why does this distinction matter for business users in Nigeria?' },
  ],
  copilot_overview: [
    { teaching: 'Microsoft 365 Copilot is built into the Microsoft 365 apps you already use: Word, Excel, PowerPoint, Outlook, and Teams. It uses the context of what you are working on — the document, the email thread, the meeting — to give relevant AI assistance.',
      question: 'Name three Microsoft 365 apps and describe one specific thing Copilot can do inside each one to help a business professional in Oloibiri — for example, someone running a small agriculture consultancy or a community health NGO.' },
    { teaching: 'Copilot also includes two powerful agents: Researcher (searches the web and your files for accurate, sourced information) and Analyst (analyses data and creates charts without needing Excel formulas). These are distinct from the general chat Copilot.',
      question: 'A community organisation wants to understand recent changes to Nigerian agricultural regulations and create a summary report. Should they use the general Copilot chat, the Researcher agent, or the Analyst agent — and why?' },
    { teaching: 'Microsoft 365 Copilot requires a specific licence separate from a standard Microsoft 365 subscription. Data processed by Copilot stays within the organisation\'s Microsoft 365 tenant — it is not used to train the underlying model.',
      question: 'On the AB-730 exam, you might see: "A manager is concerned that confidential company data shared with Copilot will be used to train Microsoft\'s AI models." Is this concern valid — and what is the correct explanation you would give them?' },
  ],
  responsible_ai: [
    { teaching: 'Microsoft\'s Responsible AI principles apply to Copilot just as they apply to AI-900 concepts: Fairness, Reliability & Safety, Privacy & Security, Inclusiveness, Transparency, and Accountability. The AB-730 exam tests how these apply in real business scenarios.',
      question: 'A business manager uses Copilot to automatically screen job applications and only forward the top-ranked ones for human review. Which Responsible AI principles might be at risk — and what safeguard should the organisation put in place?' },
    { teaching: 'Data residency refers to where your organisation\'s data is stored and processed. Microsoft 365 Copilot processes data in the region where your Microsoft 365 tenant is configured. For Nigerian organisations, understanding data residency helps meet local compliance requirements.',
      question: 'A Nigerian NGO is considering using Microsoft 365 Copilot to process sensitive health data. What two data protection questions should they ask Microsoft before proceeding — and where would they find the answers in the Microsoft 365 admin centre?' },
    { teaching: 'Hallucination is when an AI produces confident-sounding but factually incorrect information. On the AB-730 exam, the correct response to AI-generated content is always to verify it before using it — especially for business decisions, legal documents, or financial reports.',
      question: 'Your colleague uses Copilot to draft a business proposal and submits it without reviewing the AI-generated statistics. Three days later, a client points out that two of the figures are incorrect. What Responsible AI practice was skipped — and what should the workflow have included?' },
  ],
  grounding_context: [
    { teaching: 'Grounding means connecting an AI\'s responses to specific, verified information sources rather than relying only on training data. Microsoft Graph is what allows Copilot to access your organisation\'s emails, documents, calendar, and Teams conversations as context.',
      question: 'You ask Copilot: "Summarise what was decided in last week\'s project meeting." Copilot gives an accurate answer based on your Teams meeting transcript. Explain what "grounding" means using this example — what data source is Copilot connected to, and why is the answer more reliable than a generic AI chatbot?' },
    { teaching: 'Copilot only accesses content that the logged-in user has permission to see. If you do not have access to a file, Copilot cannot include it in its response. This is called permission-based access and is enforced by Microsoft Entra ID.',
      question: 'A finance team member asks Copilot to summarise all the company\'s budget documents. Copilot only returns some documents, not all. Why might this happen — and is this a bug, or a security feature? Explain what permission-based access means in this context.' },
    { teaching: 'You can explicitly provide context to Copilot by referencing files, emails, or meetings in your prompt using the "/" command or by attaching documents. This is a key prompt skill tested on the AB-730 exam.',
      question: 'You need Copilot to draft a client proposal based on a specific requirements document and three previous email threads. Describe step by step how you would provide this context to Copilot in your prompt — and what difference does providing specific context make to the quality of the output?' },
  ],
  prompt_principles: [
    { teaching: 'A strong Copilot prompt has four elements: Goal (what you want done), Context (background information), Source (which files or data to use), and Expectations (format, length, tone). Microsoft calls this the "Copilot prompt framework" and it directly maps to what is tested on the AB-730.',
      question: 'Write a Copilot prompt to draft a one-page summary of a community health project for a Nigerian government grant application. Then label each part of your prompt: Goal, Context, Source, and Expectations.' },
    { teaching: 'Iteration is part of effective Copilot use. Your first prompt rarely produces a perfect result. Asking Copilot to "make it more formal," "add a section on risks," or "shorten to three paragraphs" are all valid follow-up prompts that refine the output.',
      question: 'Copilot drafts a proposal but it is too long and uses too much technical language for the community audience. Write two follow-up prompts — one to shorten the document and one to simplify the language — and explain why iteration is more efficient than starting over.' },
    { teaching: 'The AB-730 exam tests your ability to identify the best prompt for a given business scenario. Common wrong answers include prompts that are too vague ("help me with this"), too restrictive (removing necessary context), or that ask for something Copilot cannot do (like real-time data it does not have access to).',
      question: 'A manager needs a competitive analysis comparing three Nigerian fintech companies. Which prompt would give the best result: (A) "Write about Nigerian fintech." (B) "Compare Flutterwave, Paystack, and Interswitch on pricing, market share, and key features — in a table format for an executive audience." Explain why B is stronger using the Copilot prompt framework.' },
  ],
  prompt_techniques: [
    { teaching: 'Role prompting means asking Copilot to respond as if it has a specific role or expertise: "You are a financial analyst — review this budget for risks." This shapes the tone, depth, and framing of the response and is a tested technique on AB-730.',
      question: 'You need Copilot to review a community grant proposal for weaknesses before submission. Write a role prompt that gives Copilot the right perspective — and explain why adding a role improves the quality of critical feedback compared to a basic request like "check this document".' },
    { teaching: 'Few-shot prompting in Copilot means providing examples of the format or style you want before asking for the main output. For example, showing Copilot two example email formats before asking it to write a third in the same style.',
      question: 'You want Copilot to write five social media posts for the Davidson AI Innovation Center in a specific style — warm, community-focused, written in plain English accessible to Oloibiri residents. Write a few-shot prompt that demonstrates the style with one example before asking for the five posts.' },
    { teaching: 'Chain-of-thought prompting asks Copilot to reason step by step before giving a final answer. This is particularly useful for business decisions: "First analyse the data, then identify the top three risks, then recommend an action." The exam tests when this technique is most appropriate.',
      question: 'You are using Copilot to help decide whether the Davidson AI Innovation Center should apply for a specific grant. Write a chain-of-thought prompt that asks Copilot to reason through the decision before giving a recommendation — and explain why this is better than just asking "should we apply for this grant?"' },
  ],
  agents_copilot: [
    { teaching: 'Copilot agents are AI assistants customised for specific tasks or workflows. The Researcher agent searches the web and your files for accurate sourced information. The Analyst agent processes data and creates charts. Custom agents can be built in Copilot Studio for specific business needs.',
      question: 'The Girls AIing and Vibing platform uses an AI to help learners in Oloibiri — this is similar to a custom Copilot agent. Describe what a custom Copilot agent is, what types of tasks it is best suited for, and how it differs from just using the general Copilot chat.' },
    { teaching: 'Copilot Studio allows business users (not just developers) to build custom agents using a low-code interface. You can connect the agent to your organisation\'s data, define its behaviour, and deploy it in Microsoft Teams. This is a key topic tested on AB-730.',
      question: 'A community health NGO wants to create a Copilot agent that answers staff questions about patient procedures using their internal procedure manuals. Which Microsoft tool would they use to build this — and what three things would they need to configure when building the agent?' },
    { teaching: 'Agents can be assigned capabilities: web search, file access, code interpretation, and image generation. Matching the right capability to the task is an exam skill. A marketing agent that creates visual assets needs image generation. An analyst agent that processes spreadsheets needs code interpreter.',
      question: 'Match each task to the correct agent capability: (1) A Copilot agent that creates logo concepts for a community event. (2) A Copilot agent that analyses six months of sales data and identifies trends. (3) A Copilot agent that answers questions about Nigerian tax regulations using government documents. Which capability does each need?' },
  ],
  managing_convos: [
    { teaching: 'In Microsoft 365 Copilot, you can save, share, and schedule prompts for reuse. Saving a prompt means you and your team can apply the same high-quality instruction consistently — this is how organisations standardise AI-assisted workflows.',
      question: 'Your team at the Davidson AI Innovation Center writes a weekly project update using the same structure every time. How would you use Copilot\'s prompt saving feature to standardise this — and what business benefit does prompt reuse provide beyond saving time?' },
    { teaching: 'When evaluating Copilot\'s output, the AB-730 exam expects you to assess: accuracy (are the facts correct?), completeness (is anything missing?), relevance (does it address the actual need?), and tone (is it appropriate for the audience?). These are the four quality dimensions.',
      question: 'Copilot drafts a funding proposal for a Nigerian government grant. List the four quality dimensions you should check before submitting, and for each one give a specific example of what could go wrong if you skipped that check in a real Oloibiri community project context.' },
    { teaching: 'Copilot can work in different modes: chat (conversational, multi-turn), inline (directly editing a document you are working on), and meeting recap (summarising after a call). Understanding which mode to use in which scenario is tested on AB-730.',
      question: 'Describe the correct Copilot mode for each scenario: (1) You want to brainstorm five names for a new community programme during a creative session. (2) You want Copilot to rewrite a specific paragraph in a grant proposal you are editing in Word. (3) You want a summary of key decisions from a Teams call that ended 10 minutes ago.' },
  ],
  copilot_word: [
    { teaching: 'In Microsoft Word, Copilot can draft documents from scratch, rewrite or improve existing text, summarise long documents, and extract key information. The "/Draft with Copilot" feature starts a new document. The Copilot pane on the right allows conversation about the open document.',
      question: 'You need to write a 500-word community impact report about the Girls AIing and Vibing programme in Oloibiri for a donor. Describe step by step how you would use Copilot in Word to create the first draft — what information would you include in your prompt, and what would you check before finalising?' },
    { teaching: 'Copilot in Word can reference other files when drafting. You can say "Draft a project summary based on /[filename]" and Copilot will use that file as source material. This is only possible if you have permission to access the referenced file.',
      question: 'You have a 40-page programme evaluation report and need to create a two-page executive summary for community leaders who are not familiar with technical terms. Write the Copilot in Word prompt you would use — and explain which Responsible AI check you would apply before sharing the summary.' },
    { teaching: 'The Rewrite feature in Word lets you ask Copilot to change the tone (more professional, more conversational), length (shorter, longer), or format (as bullet points, as a table) of selected text without rewriting the whole document.',
      question: 'A section of a report uses highly technical language about machine learning. The audience is community elders and local government officials in Bayelsa State with no tech background. Which Copilot Word feature would you use to fix this — and write the prompt you would give it?' },
  ],
  copilot_excel: [
    { teaching: 'Copilot in Excel can analyse data and identify trends, generate formulas, create charts, and highlight patterns — all through natural language. You do not need to know Excel formulas. You ask "What are the top three months by revenue?" and Copilot finds and highlights the answer.',
      question: 'The Davidson AI Innovation Center has a spreadsheet tracking 44 learner assessment scores across 6 months. You want to find which learners have improved the most. Write a natural language prompt you would give Copilot in Excel to surface this insight — and explain why this is faster than writing VLOOKUP or SORT formulas manually.' },
    { teaching: 'The Analyst agent is Copilot\'s most powerful data tool. It goes beyond Excel\'s built-in Copilot by running Python code behind the scenes to perform advanced analysis, forecast trends, and create complex visualisations — all without the user writing any code.',
      question: 'What is the difference between Copilot in Excel and the Analyst agent? Give an example of a task that Copilot in Excel can handle, and a task that would require the Analyst agent. Use a Nigerian business context in your examples.' },
    { teaching: 'On the AB-730 exam, Excel Copilot questions often ask you to identify the best prompt for a data task, or to recognise what Copilot can and cannot do. Copilot cannot access real-time external data — it works with the data already in your spreadsheet.',
      question: 'A manager asks Copilot in Excel: "What is today\'s exchange rate between naira and USD?" Will Copilot answer this accurately — and if not, what should the manager do instead? What does this tell you about the limitations of Copilot in Excel?' },
  ],
  copilot_ppt: [
    { teaching: 'Copilot in PowerPoint can create a presentation from scratch based on a prompt, convert a Word document into slides, add new slides to an existing deck, and redesign slide layouts. The "Create presentation about..." command is the core feature tested on AB-730.',
      question: 'You need to present the AI-900 certification pathway to community leaders at the Davidson AI Innovation Center. Write the Copilot in PowerPoint prompt you would use to create a 6-slide deck — include the audience, purpose, and key content areas you want covered.' },
    { teaching: 'Copilot can convert a Word document into a PowerPoint presentation using "Create presentation from /[Word file]". This is one of the most practical cross-app Copilot features for business professionals who write detailed documents and then need to present them.',
      question: 'You wrote a 10-page programme evaluation report in Word. Your director needs a presentation version for a stakeholder meeting in 2 hours. Describe step by step how you would use Copilot to create the PowerPoint from the Word document — and what two things you would check in the generated slides before the meeting.' },
    { teaching: 'Speaker notes are often auto-generated by Copilot in PowerPoint. The exam tests your ability to evaluate whether auto-generated notes are appropriate for the audience and context — and to know when to edit them.',
      question: 'Copilot generates speaker notes for your presentation that are very technical and assume the audience knows AI terminology. Your audience is community leaders with no tech background. What Copilot feature or follow-up prompt would you use to fix the speaker notes — and why is this important before presenting?' },
  ],
  copilot_outlook: [
    { teaching: 'Copilot in Outlook can draft new emails, reply to emails, summarise long email threads, and identify action items from your inbox. The "Draft with Copilot" button appears when composing a new email or reply.',
      question: 'You received a 15-email thread about organising the next Girls AIing cohort in Ibiade. You need to quickly understand what was agreed and what is still outstanding before joining a call. Which Copilot in Outlook feature would you use — and write the prompt you would give it?' },
    { teaching: 'Copilot can adjust the tone of a drafted email: "Make it more formal," "Make it shorter," "Make it more persuasive." The Coaching feature in Outlook reviews your draft and suggests improvements for tone, clarity, and sentiment before you send.',
      question: 'You drafted an email declining a partnership offer from a donor organisation. You want to decline politely but leave the door open for future collaboration. Write a Copilot coaching prompt that asks for feedback on your draft — and list the two specific things you want Copilot to check.' },
    { teaching: 'Copilot can schedule follow-up actions from emails: "Create a task from this email," "Schedule a meeting based on this thread." These integrations between Outlook and Microsoft To Do / Calendar are tested on the AB-730 exam.',
      question: 'After Copilot summarises a long email thread, you notice three action items that were agreed but not yet assigned. Describe how you would use Copilot in Outlook to convert these into tasks — and what would happen if you did this manually versus with Copilot for 10 emails per day?' },
  ],
  copilot_teams: [
    { teaching: 'Copilot in Teams has two key features: Meeting recap (automatic summary, action items, and decisions after a meeting) and Meeting chat Copilot (asking questions about what was said during a live or recorded meeting without watching the whole recording).',
      question: 'You missed a 45-minute Teams strategy meeting because of a connectivity issue in Oloibiri. You need to know what was decided and what actions were assigned to you. Which two Copilot in Teams features would help — and write the specific prompt you would use for each one?' },
    { teaching: 'Copilot in Teams Channels can summarise unread channel messages, highlight key discussions, and identify items that need your attention. This is especially useful for busy community coordinators managing multiple project channels.',
      question: 'You manage three Teams channels for different Girls AIing cohorts (Oloibiri, Ibiade, and the Next Village partners). You have been offline for 3 days. How would you use Copilot in Teams Channels to catch up efficiently — and what prompt would you use for each channel?' },
    { teaching: 'Microsoft Pages and Notebooks (within Teams and Loop) allow teams to co-create documents alongside Copilot. Copilot can help draft, expand, or summarise collaborative pages in real time during a working session.',
      question: 'During a live Teams meeting, your team is co-editing a community action plan in a shared Loop page. Describe how Copilot in Pages could help the team during the meeting — give two specific examples of prompts the meeting facilitator might use.' },
  ],
  evaluating_output: [
    { teaching: 'Every piece of AI-generated content must be evaluated before use. The AB-730 exam tests four evaluation dimensions: Accuracy (is it factually correct?), Completeness (is anything important missing?), Relevance (does it address the actual need?), and Appropriateness (is the tone and format right for the audience?).',
      question: 'Copilot drafts a health programme report for the Oloibiri community. Before submitting it to the state government, apply all four evaluation dimensions: write one specific check question for each dimension that reflects the Nigerian context of this report.' },
    { teaching: 'Fact-checking AI output means verifying specific claims against original sources. Copilot\'s Researcher agent provides citations, making verification easier. For general Copilot chat, you must verify claims independently — especially statistics, dates, names, and regulatory information.',
      question: 'Copilot writes: "According to the Nigerian Ministry of Health, 67% of rural communities in Bayelsa State lack access to trained healthcare workers." How would you verify this statistic before including it in an official report — and what would you do if you could not verify it?' },
    { teaching: 'When AI output needs refinement, the most efficient approach is to use targeted follow-up prompts rather than starting over. "Make this section shorter," "Add a paragraph on risks," "Change the tone to be less formal" are all refinement prompts. Starting over wastes context and time.',
      question: 'Copilot generates a five-page funding proposal that is accurate but reads like it was written for a technical audience. The funder is a community development foundation expecting plain language. Write three targeted refinement prompts — one for tone, one for length, and one for a specific section — and explain why you chose iteration over starting a new prompt.' },
  ],
  practice_exam: [
    { teaching: 'The AB-730 exam has approximately 60 questions in 60 minutes. It tests three skills: Generative AI Fundamentals (~30%), Prompts & Conversations (~35%), and Business Content (~35%). Questions are scenario-based — they describe a real workplace situation and ask what the best Copilot action or response is.',
      question: 'Rate your confidence in each skill area before we begin: Skill 1 (Generative AI Fundamentals), Skill 2 (Prompts & Conversations), Skill 3 (Business Content with Copilot). Use 1 (not confident) to 5 (very confident) for each. This helps me weight the practice questions.' },
    { teaching: 'AB-730 exam tip: scenario questions almost always have one clearly right answer based on the Copilot prompt framework (Goal + Context + Source + Expectations). Wrong answers are usually too vague, use the wrong Copilot feature, or skip verification of AI output.',
      question: 'Practice question 1: A project manager needs a summary of all emails from the past week related to a specific client, including key decisions and outstanding actions. Which is the best Copilot approach: (A) Ask Copilot Chat to "summarise my recent emails." (B) In Outlook, use Copilot to search and summarise the specific client thread with the prompt: "Summarise all emails from [client] this week — list key decisions and outstanding action items." (C) Forward all emails to a colleague and ask them to summarise. Explain why B is correct.' },
    { teaching: 'Responsible AI questions on AB-730 follow this pattern: a business user does something with Copilot that raises a risk, and you need to identify the correct safeguard or principle. Always look for the answer that adds human oversight, verifies output, or protects data privacy.',
      question: 'Practice question 2: A recruitment manager uses Copilot to screen 200 CVs and automatically reject candidates without human review. Which TWO actions should the organisation take to align this process with Responsible AI principles — and which specific principles do these actions address?' },
  ],
};

// ─── Score badge ──────────────────────────────────────────────────────────────

const ScoreBadge: React.FC<{ score: number; max?: number }> = ({ score, max = 3 }) => {
  const pct = score / max;
  const color = pct >= 0.8 ? 'from-emerald-400 to-green-500 text-green-950'
    : pct >= 0.5 ? 'from-amber-400 to-yellow-500 text-yellow-950'
    : 'from-red-400 to-rose-500 text-rose-950';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${color}`}>
      <Star size={12} />{score}/{max}
    </span>
  );
};

// ─── Onboarding card ──────────────────────────────────────────────────────────

const AB730Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    <div className="p-4 bg-purple-500/10 border border-purple-500/25 rounded-xl">
      <p className="text-xs font-bold text-purple-400 uppercase mb-3">💼 Welcome to AB-730 Certification Prep</p>
      <p className="text-sm text-gray-300 leading-relaxed mb-3">
        You are preparing for the <strong className="text-white">Microsoft Certified: AI Business Professional (AB-730)</strong>.
        This certification proves you can use generative AI and Microsoft 365 Copilot to improve daily work
        and drive real business outcomes — <strong className="text-white">no coding required, ever</strong>.
      </p>
      <p className="text-sm text-gray-300 leading-relaxed mb-4">
        This is the natural next step after AI-900. Where AI-900 tested <em>what AI is</em>,
        AB-730 tests <em>how to use AI effectively</em> in real business work.
      </p>
      <div className="mb-4">
        <PidginTooltip
          originalText="You are preparing for the Microsoft Certified: AI Business Professional (AB-730). This certification proves you can use generative AI and Microsoft 365 Copilot to improve daily work and drive real business outcomes — no coding required, ever."
          hintText="Tap here to translate this introduction into Nigerian Pidgin."
        />
      </div>

      <p className="text-xs font-bold text-gray-400 uppercase mb-2">Three Skills Measured</p>
      <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs leading-relaxed space-y-1 mb-3">
        {[
          ['🧠', 'S1', 'Generative AI Fundamentals', '~30%', 'text-blue-300'],
          ['📝', 'S2', 'Prompts & Conversations',    '~35%', 'text-purple-300'],
          ['📄', 'S3', 'Business Content with Copilot', '~35%', 'text-emerald-300'],
        ].map(([icon, code, name, weight, col]) => (
          <div key={code} className="flex items-center gap-2">
            <span>{icon}</span>
            <span className={`${col} font-bold w-6`}>{code}</span>
            <span className="text-gray-300 flex-1">{name}</span>
            <span className="text-gray-500 text-[10px]">{weight}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      {[
        { icon: <Briefcase size={14}/>,    title: 'No coding, ever',         desc: '~60 scenario questions — using AI in business, not building it', col: 'text-purple-400' },
        { icon: <Target size={14}/>,       title: 'Score 700/1000',          desc: '60 minutes, multiple choice and scenario-based', col: 'text-emerald-400' },
        { icon: <Sparkles size={14}/>,     title: 'Practical AI skills',     desc: 'Copilot in Word, Excel, PowerPoint, Outlook, Teams', col: 'text-blue-400' },
        { icon: <TrendingUp size={14}/>,   title: 'Career proof',            desc: 'Employers increasingly require AI proficiency for all roles', col: 'text-amber-400' },
      ].map((item, i) => (
        <div key={i} className="p-3 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className={`flex items-center gap-1.5 mb-1 ${item.col}`}>{item.icon}<span className="text-xs font-bold">{item.title}</span></div>
          <p className="text-[11px] text-gray-400">{item.desc}</p>
        </div>
      ))}
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">🔗 How AB-730 builds on AI-900</p>
      <div className="space-y-1.5 text-xs text-gray-400">
        <div className="flex items-start gap-2">
          <span className="text-blue-400 font-bold flex-shrink-0">AI-900</span>
          <span>What AI is, how machine learning works, Azure AI services, Responsible AI principles</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <span className="flex-shrink-0">↓</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-purple-400 font-bold flex-shrink-0">AB-730</span>
          <span>How to <em className="text-white">use</em> AI tools effectively, write great prompts, and apply Copilot to real business work</span>
        </div>
      </div>
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">💡 How this prep course works</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        You already use AI every day in the Girls AIing platform — that makes you better prepared than most
        AB-730 candidates. This course will connect what you already do to the exam vocabulary and Microsoft
        Copilot context. All examples are grounded in <strong className="text-white">Oloibiri, Nigeria</strong>.
      </p>
    </div>

    {/* Free voucher CTA */}
    <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
      <p className="text-xs font-bold text-emerald-400 mb-1.5">🎟️ Get Your Free Exam Voucher</p>
      <p className="text-xs text-gray-300 leading-relaxed mb-2">
        Nigerian citizens can access <strong className="text-white">free Microsoft certification exam vouchers</strong> through
        the Digital Skills Nigeria programme. The voucher covers AB-730 and other Microsoft exams.
      </p>
      <div className="flex flex-col gap-1.5">
        <a
          href="https://aka.ms/registerngcertification"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
        >
          <GraduationCap size={13} /> Register — Digital Skills Nigeria
        </a>
        <a
          href="https://techcommunity.microsoft.com/blog/educatordeveloperblog/free-microsoft-associate-and-expert-certification-vouchers-in-nigeria/3695976"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors"
        >
          <BookOpen size={13} /> Step-by-step voucher guide (Microsoft)
        </a>
      </div>
    </div>

    <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
      <p className="text-xs font-bold text-purple-400 mb-1.5">⏱️ Exam at a Glance</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['~60', 'Questions'], ['60 min', 'Time limit'], ['700/1000', 'Pass score']].map(([val, lbl]) => (
          <div key={lbl}>
            <p className="text-sm font-black text-white">{val}</p>
            <p className="text-[10px] text-gray-400">{lbl}</p>
          </div>
        ))}
      </div>
    </div>

    <button onClick={onComplete}
      className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors">
      Let's start with Skill 1! <ArrowRight size={16} />
    </button>
  </div>
);

// ─── Topic stepper ────────────────────────────────────────────────────────────

const TopicStepper: React.FC<{
  topics: TopicDef[];
  topicIndex: number;
  onJump: (idx: number) => void;
}> = ({ topics, topicIndex, onJump }) => {
  const onboarding = topics.find(t => t.isOnboarding);
  const skills = [1, 2, 3] as const;

  return (
    <div className="px-3 py-3 border-b border-gray-700 space-y-2 overflow-y-auto flex-shrink-0" style={{ maxHeight: '45vh' }}>
      {/* Intro */}
      {onboarding && (() => {
        const idx = topics.findIndex(t => t.id === onboarding.id);
        const isDone = idx < topicIndex;
        const isCurrent = idx === topicIndex;
        return (
          <button key={onboarding.id} onClick={() => isDone && onJump(idx)} disabled={!isDone && !isCurrent}
            className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
              ${isCurrent ? 'bg-purple-500/15 border border-purple-500/30 font-bold text-purple-400' : ''}
              ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
              ${!isDone && !isCurrent ? 'text-gray-600 cursor-default' : ''}`}>
            <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? onboarding.icon : '⬜'}</span>
            <span className="truncate">{onboarding.label}</span>
          </button>
        );
      })()}

      {/* Skill groups */}
      {skills.map(skill => {
        const sm = SKILL_META[skill];
        const skillTopics = topics.filter(t => t.skill === skill && !t.isOnboarding && t.id !== 'practice_exam');
        if (skillTopics.length === 0) return null;
        return (
          <div key={skill}>
            <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider mb-1 ${sm.color}`}>
              {sm.icon}{sm.shortLabel}
              <span className="text-gray-600 font-normal normal-case tracking-normal">{skillTopics[0].weight}</span>
            </div>
            <div className="space-y-0.5">
              {skillTopics.map(topic => {
                const globalIdx = topics.findIndex(t => t.id === topic.id);
                const isDone = globalIdx < topicIndex;
                const isCurrent = globalIdx === topicIndex;
                const isFuture = globalIdx > topicIndex;
                return (
                  <button key={topic.id} onClick={() => isDone && onJump(globalIdx)} disabled={isFuture}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                      ${isCurrent ? `${sm.bg} ${sm.border} border font-bold ${sm.color}` : ''}
                      ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
                      ${isFuture ? 'text-gray-600 cursor-default' : ''}`}>
                    <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? topic.icon : '⬜'}</span>
                    <span className="truncate">{topic.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Practice exam */}
      {(() => {
        const pe = topics.find(t => t.id === 'practice_exam');
        if (!pe) return null;
        const idx = topics.findIndex(t => t.id === 'practice_exam');
        const isDone = idx < topicIndex;
        const isCurrent = idx === topicIndex;
        const isFuture = idx > topicIndex;
        return (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1 text-amber-400">Final Practice</p>
            <button onClick={() => isDone && onJump(idx)} disabled={isFuture}
              className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                ${isCurrent ? 'bg-amber-500/15 border border-amber-500/30 font-bold text-amber-400' : ''}
                ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
                ${isFuture ? 'text-gray-600 cursor-default' : ''}`}>
              <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? pe.icon : '⬜'}</span>
              <span className="truncate">{pe.label}</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
};

// ─── Exam tip card ────────────────────────────────────────────────────────────

const ExamTipCard: React.FC<{ topicId: string }> = ({ topicId }) => {
  const tips: Record<string, string> = {
    genai_how_works:   'If asked "why did Copilot state something incorrect?" the answer is always "hallucination." AI generates plausible text — it does not verify facts. Always verify before using in official documents.',
    copilot_overview:  'Data processed by Copilot stays in your Microsoft 365 tenant — it is NOT used to train Microsoft\'s AI models. This is a common exam trap question.',
    responsible_ai:    'Exam pattern: "AI gives different outcomes to different groups" → Fairness. "No explanation of how decision was made" → Transparency. "Cannot override AI" → Accountability. "Data shared without consent" → Privacy & Security.',
    grounding_context: '"/" in Copilot prompts references a specific file. This is grounding — anchoring the AI response to verified, specific data rather than general knowledge. Grounded responses are more accurate and verifiable.',
    prompt_principles: 'The Copilot prompt framework: Goal + Context + Source + Expectations. Every exam scenario with a "what is the best prompt" question — pick the answer that includes all four elements.',
    prompt_techniques: 'Role prompting → "You are a [role]..." Few-shot → give examples first. Chain-of-thought → "First analyse..., then...". The exam tests WHEN each technique is most appropriate, not just what they are.',
    agents_copilot:    'Image generation → visual/creative tasks. Code interpreter → data analysis, spreadsheets. Web search → current information. File search → internal documents. Match the capability to the task type.',
    managing_convos:   'The four output quality checks: Accuracy (correct?), Completeness (missing anything?), Relevance (answers the actual need?), Appropriateness (right tone and format?). Memorise these four.',
    copilot_word:      '"Draft with Copilot" = new document. Copilot pane = conversation about existing document. Rewrite = change tone/length of selected text. These three features have distinct use cases.',
    copilot_excel:     'Copilot in Excel works with data already in the spreadsheet. It cannot access real-time external data (exchange rates, stock prices). The Analyst agent is for advanced analysis requiring Python-level computation.',
    copilot_ppt:       '"Create presentation from /[Word file]" is the key cross-app feature. Copilot converts your document structure into slides. Always check: slide count, accuracy of key facts, and speaker note appropriateness.',
    copilot_outlook:   'Copilot in Outlook: summarise threads, draft replies, coach on tone. It uses the email context for grounding. "Schedule follow-up" integrates with Calendar and To Do — a common multi-step workflow question.',
    copilot_teams:     'Meeting recap appears AFTER the meeting. In-meeting questions use the live transcript. Channel summarisation works on unread messages. Pages/Loop is for collaborative real-time document creation.',
    evaluating_output: 'The correct action after Copilot generates content is always: verify accuracy, check completeness, confirm relevance, assess appropriateness — THEN refine with targeted follow-up prompts before finalising.',
    practice_exam:     'AB-730 scenario questions have one right answer. Eliminate vague options first. Then eliminate options that skip verification. The right answer usually includes: correct Copilot feature + specific prompt + human review step.',
  };
  const tip = tips[topicId];
  if (!tip) return null;
  return (
    <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
      <p className="text-[10px] font-bold text-amber-400 uppercase mb-1.5 flex items-center gap-1">
        <Zap size={10} /> Exam Tip
      </p>
      <p className="text-xs text-gray-300 leading-relaxed">{tip}</p>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const MicrosoftAB730Page: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null)); }, []);

  // ── Personality baseline ─────────────────────────────────────────────
  const [communicationStrategy, setCommunicationStrategy] = useState<any>(null);
  const [learningStrategy, setLearningStrategy]           = useState<any>(null);
  useEffect(() => {
    if (!userId) return;
    supabase.from('user_personality_baseline').select('communication_strategy, learning_strategy')
      .eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data?.communication_strategy) setCommunicationStrategy(data.communication_strategy);
        if (data?.learning_strategy)       setLearningStrategy(data.learning_strategy);
      });
  }, [userId]);

  // ── Voice ────────────────────────────────────────────────────────────
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [voiceMode, setVoiceMode]                   = useState<'english' | 'pidgin'>('english');
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('continent, country').eq('id', userId).single()
      .then(({ data }) => { setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english'); });
  }, [userId]);

  const { speak: hookSpeak, cancel: cancelSpeech, fallbackText, clearFallback } = useVoice(voiceMode === 'pidgin');
  const speakTextRef = useRef<(text: string) => void>(() => {});
  const speakText = useCallback((text: string) => {
    if (!voiceOutputEnabled || !text.trim()) return;
    hookSpeak(text);
  }, [voiceOutputEnabled, hookSpeak]);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  // ── Session ──────────────────────────────────────────────────────────
  const [sessionId, setSessionId]               = useState<string | null>(null);
  const [sessionName, setSessionName]           = useState('AB-730 Prep');
  const [sessions, setSessions]                 = useState<SessionRecord[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Topic ────────────────────────────────────────────────────────────
  const [topicIndex, setTopicIndex]                 = useState(0);
  const [taskInstruction, setTaskInstruction]       = useState<TaskInstruction | null>(null);
  const [loadingInstruction, setLoadingInstruction] = useState(false);
  const [topicHasAnswer, setTopicHasAnswer]         = useState(false);
  const [subTaskIndex, setSubTaskIndex]             = useState(0);
  const [subTaskCritique, setSubTaskCritique]       = useState<{ hasSuggestions: boolean; feedback: string } | null>(null);

  // ── Answer ───────────────────────────────────────────────────────────
  const [answer, setAnswer]               = useState('');
  const [answerHistory, setAnswerHistory] = useState<QuizEntry[]>([]);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [isCritiquing, setIsCritiquing]   = useState(false);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // ── Evaluation ───────────────────────────────────────────────────────
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [isEvaluating, setIsEvaluating]     = useState(false);
  const [evaluation, setEvaluation]         = useState<any>(null);
  const [evalError, setEvalError]           = useState<string | null>(null);

  const currentTopic  = TOPICS[topicIndex];
  const currentSkill  = currentTopic?.skill ?? 1;
  const sm            = SKILL_META[currentSkill];
  const isOnboarding  = currentTopic?.isOnboarding && currentTopic?.id === 'intro_ab730';
  const maxSubTask    = (taskInstruction?.subTasks?.length ?? 1) - 1;
  const progressPct   = Math.round((topicIndex / (TOPICS.length - 1)) * 100);

  // ── Load sessions ─────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('dashboard')
      .select('id, ab730_session_id, ab730_session_name, ab730_prompts, ab730_evaluation, updated_at')
      .eq('user_id', userId).eq('activity', AB730_ACTIVITY)
      .not('ab730_session_id', 'is', null).order('updated_at', { ascending: false });
    if (data?.length) { setSessions(data as SessionRecord[]); if (!sessionId) setShowSessionPicker(true); }
  }, [userId, sessionId]);
  useEffect(() => { if (userId) loadSessions(); }, [userId, loadSessions]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (userId) {
      await supabase.from('dashboard').insert({
        user_id: userId, activity: AB730_ACTIVITY,
        ab730_session_id: sid, ab730_session_name: sessionName,
        ab730_prompts: [], ab730_evaluation: { topicIndex: 0 },
      });
    }
    return sid;
  }, [userId, sessionName]);

  const persistSession = useCallback(async (prompts: QuizEntry[], tIdx: number) => {
    const sid = sessionIdRef.current; if (!userId || !sid) return;
    await supabase.from('dashboard').update({
      ab730_prompts: prompts,
      ab730_evaluation: { topicIndex: tIdx },
      ab730_session_name: sessionName,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('ab730_session_id', sid);
  }, [userId, sessionName]);

  const createNewSession = useCallback(async () => {
    if (!userId) return;
    const sid = makeId();
    await supabase.from('dashboard').insert({
      user_id: userId, activity: AB730_ACTIVITY,
      ab730_session_id: sid, ab730_session_name: 'AB-730 Prep',
      ab730_prompts: [], ab730_evaluation: { topicIndex: 0 },
    });
    setSessionId(sid); sessionIdRef.current = sid;
    setSessionName('AB-730 Prep'); setTopicIndex(0);
    setAnswerHistory([]); setEvaluation(null);
    setTopicHasAnswer(false); setShowSessionPicker(false);
    setTaskInstruction(null); setAnswer(''); setAiExplanation(null);
    setErrorMsg(null); setSubTaskCritique(null); setSubTaskIndex(0);
  }, [userId]);

  const loadSession = useCallback((s: SessionRecord) => {
    setSessionId(s.ab730_session_id); sessionIdRef.current = s.ab730_session_id;
    setSessionName(s.ab730_session_name);
    const ev = s.ab730_evaluation || {};
    setTopicIndex(ev.topicIndex ?? 0);
    setAnswerHistory(s.ab730_prompts || []);
    setEvaluation(ev.scores || null); setTopicHasAnswer(false);
    setShowSessionPicker(false); setTaskInstruction(null);
    setAnswer(''); setAiExplanation(null); setErrorMsg(null);
    setSubTaskCritique(null); setSubTaskIndex(0);
  }, []);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation(); if (!userId) return;
    setDeletingSessionId(sid);
    try {
      await supabase.from('dashboard').update({
        ab730_session_id: null, ab730_session_name: null, ab730_prompts: null, ab730_evaluation: null,
      }).eq('user_id', userId).eq('ab730_session_id', sid);
      setSessions(prev => prev.filter(s => s.ab730_session_id !== sid));
    } finally { setDeletingSessionId(null); }
  }, [userId]);

  // ── Fetch task instruction ────────────────────────────────────────────
  const fetchTaskInstruction = useCallback(async (idx: number) => {
    const topic = TOPICS[idx]; if (!topic || topic.isOnboarding) return;
    setLoadingInstruction(true); setTaskInstruction(null);
    try {
      const res = await fetch('/api/ab730-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          topicId: topic.id, topicLabel: topic.label, skill: topic.skill,
          completedTopics: TOPICS.slice(0, idx).map(t => t.id),
          communicationStrategy, learningStrategy,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setTaskInstruction(result as TaskInstruction);
        if (result?.subTaskTeaching?.[0]) speakTextRef.current(result.subTaskTeaching[0]);
      } else { throw new Error('API unavailable'); }
    } catch {
      const seeds = FALLBACK_SEEDS[topic.id] ?? [
        { teaching: `Let's explore ${topic.label} — a key AB-730 topic.`,
          question: `In your own words, describe what you already know about ${topic.label} and how it might apply to work in Oloibiri.` },
      ];
      setTaskInstruction({
        headline: topic.label,
        context: `Skill ${topic.skill}: ${SKILL_META[topic.skill].shortLabel}`,
        subTasks: seeds.map(s => s.question),
        subTaskTeaching: seeds.map(s => s.teaching),
        examplePrompt: seeds[0].question,
      });
      if (seeds[0].teaching) speakTextRef.current(seeds[0].teaching);
    } finally { setLoadingInstruction(false); }
  }, [communicationStrategy, learningStrategy]);

  useEffect(() => {
    if (topicIndex > 0) fetchTaskInstruction(topicIndex);
    setTopicHasAnswer(false); setSubTaskIndex(0);
    setSubTaskCritique(null); setAiExplanation(null); setAnswer('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicIndex]);

  // ── Submit answer ─────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true); setErrorMsg(null); setAiExplanation(null); setSubTaskCritique(null);
    await ensureSession();

    const entry: QuizEntry = {
      id: makeId(), topicId: currentTopic?.id, subTaskIndex,
      subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
      subTaskTeaching: taskInstruction?.subTaskTeaching?.[subTaskIndex],
      userAnswer: answer.trim(), timestamp: new Date().toISOString(),
      action: topicHasAnswer ? 'iterate' : 'answer',
    };

    try {
      const res = await fetch('/api/ab730-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', mode: 'evaluate',
          topicId: currentTopic?.id, skill: currentTopic?.skill,
          subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
          subTaskTeaching: taskInstruction?.subTaskTeaching?.[subTaskIndex],
          userAnswer: answer.trim(),
          communicationStrategy, learningStrategy,
        }),
      });

      let explanation = '';
      if (res.ok) {
        const result = await res.json();
        explanation = result.explanation || result.feedback || '';
        if (result.feedback) {
          entry.aiCritique = result.feedback; entry.hasSuggestions = result.hasSuggestions;
          setSubTaskCritique({ hasSuggestions: !!result.hasSuggestions, feedback: result.feedback });
          if (!result.hasSuggestions) speakTextRef.current(result.feedback.substring(0, 200));
        }
        entry.aiExplanation = explanation;
        setAiExplanation(explanation || null);
      } else {
        explanation = 'Great effort! Your answer has been recorded. Keep reasoning through each concept in your own words — that is how real understanding forms.';
        setAiExplanation(explanation);
        setSubTaskCritique({ hasSuggestions: false, feedback: explanation });
      }

      const newHistory = [...answerHistory, entry];
      setAnswerHistory(newHistory); setTopicHasAnswer(true); setAnswer('');
      await persistSession(newHistory, topicIndex);
      if (voiceOutputEnabled && explanation) speakTextRef.current(explanation.substring(0, 180));
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally { setIsSubmitting(false); }
  }, [answer, isSubmitting, currentTopic, taskInstruction, subTaskIndex, answerHistory,
      topicHasAnswer, communicationStrategy, learningStrategy, ensureSession, persistSession,
      topicIndex, voiceOutputEnabled]);

  // ── Hint ─────────────────────────────────────────────────────────────
  const handleCritique = useCallback(async () => {
    if (!answer.trim() || isCritiquing) return;
    setIsCritiquing(true);
    try {
      const res = await fetch('/api/ab730-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', mode: 'hint',
          topicId: currentTopic?.id, skill: currentTopic?.skill,
          subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
          userAnswer: answer.trim(), communicationStrategy, learningStrategy,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.hint) setSubTaskCritique({ hasSuggestions: true, feedback: d.hint });
      }
    } catch { /* ignore */ }
    finally { setIsCritiquing(false); }
  }, [answer, isCritiquing, currentTopic, taskInstruction, subTaskIndex, communicationStrategy, learningStrategy]);

  // ── Navigation ────────────────────────────────────────────────────────
  const handleMoveToNextSubTask = useCallback(() => {
    if (subTaskIndex < maxSubTask) {
      setSubTaskIndex(s => s + 1);
      setSubTaskCritique(null); setAiExplanation(null); setAnswer('');
      const nextTeaching = taskInstruction?.subTaskTeaching?.[subTaskIndex + 1];
      if (nextTeaching) speakTextRef.current(nextTeaching);
    }
  }, [subTaskIndex, maxSubTask, taskInstruction]);

  const handleCompleteTopic = useCallback(async () => {
    if (topicIndex < TOPICS.length - 1) {
      const newIdx = topicIndex + 1;
      setTopicIndex(newIdx);
      await persistSession(answerHistory, newIdx);
    }
  }, [topicIndex, answerHistory, persistSession]);

  const handleJumpToTopic = useCallback((idx: number) => { setTopicIndex(idx); }, []);

  // ── Evaluate ──────────────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    setShowEvaluation(true); setIsEvaluating(true); setEvalError(null);
    try {
      const res = await fetch('/api/ab730-evaluate-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          answerHistory: answerHistory.map(e => ({
            topicId: e.topicId, subTaskQuestion: e.subTaskQuestion,
            userAnswer: e.userAnswer, action: e.action,
          })),
          topicsCompleted: TOPICS.slice(0, topicIndex).map(t => t.id),
        }),
      });
      if (res.ok) setEvaluation(await res.json());
      else setEvalError('Could not generate evaluation. Your progress has been saved.');
    } catch { setEvalError('Evaluation unavailable offline. Your answers have been saved.'); }
    finally { setIsEvaluating(false); }
  }, [answerHistory, topicIndex]);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <Navbar />

      {/* Voice fallback */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      {/* Session picker */}
      {showSessionPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderOpen size={18} className="text-purple-400" /> Your AB-730 Sessions
              </h2>
              <button onClick={() => setShowSessionPicker(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {sessions.map(s => (
                <button key={s.ab730_session_id} onClick={() => loadSession(s)}
                  className="w-full text-left p-3 bg-gray-700/40 hover:bg-gray-700 border border-gray-600 hover:border-purple-500/40 rounded-xl transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.ab730_session_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Topic {(s.ab730_evaluation as any)?.topicIndex ?? 0}/{TOPICS.length} · {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <button onClick={e => handleDeleteSession(e, s.ab730_session_id)}
                      disabled={deletingSessionId === s.ab730_session_id}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded transition-colors flex-shrink-0">
                      {deletingSessionId === s.ab730_session_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 pb-4 flex-shrink-0">
              <button onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors">
                <Plus size={15} /> Start New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation modal */}
      {showEvaluation && (() => {
        const scoreColor = (s: number) => s >= 2.5 ? 'text-emerald-400' : s >= 1.5 ? 'text-amber-400' : 'text-red-400';
        const skillLabel = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart3 size={20} className="text-purple-400" /> Session Evaluation
                </h2>
                <button onClick={() => setShowEvaluation(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isEvaluating && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 size={36} className="animate-spin text-purple-400 mb-3" />
                    <p className="text-gray-300 font-medium">Evaluating your AB-730 readiness…</p>
                  </div>
                )}
                {evalError && !isEvaluating && (
                  <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}
                  </div>
                )}
                {evaluation && !isEvaluating && (
                  <>
                    {evaluation.overall_score_average !== undefined && (
                      <div className="flex items-center gap-3 p-4 bg-gray-700/60 rounded-xl border border-gray-600">
                        <Award size={28} className="text-amber-400" />
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-bold">Overall Readiness Score</p>
                          <p className={`text-3xl font-black ${scoreColor(evaluation.overall_score_average)}`}>
                            {Number(evaluation.overall_score_average).toFixed(1)}<span className="text-base font-normal text-gray-500"> / 3.0</span>
                          </p>
                        </div>
                      </div>
                    )}
                    {evaluation.strengths_summary && (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase mb-2">💪 Strengths</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{evaluation.strengths_summary}</p>
                      </div>
                    )}
                    {evaluation.highest_leverage_improvements && (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-amber-400 uppercase mb-2">🎯 Focus Areas Before the Exam</p>
                        <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">{evaluation.highest_leverage_improvements}</p>
                      </div>
                    )}
                    {evaluation.exam_readiness && (
                      <div className="p-4 bg-purple-500/10 border border-purple-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-purple-400 uppercase mb-2">💼 Exam Readiness Assessment</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{evaluation.exam_readiness}</p>
                      </div>
                    )}
                    {evaluation.detailed_scores && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Skill Breakdown</p>
                        {Object.entries(evaluation.detailed_scores as Record<string, { score: number; justification: string }>).map(([skill, data]) => (
                          <details key={skill} className="group border border-gray-700 rounded-lg overflow-hidden">
                            <summary className="flex items-center gap-3 px-3 py-2 bg-gray-700/30 hover:bg-gray-700/50 cursor-pointer list-none">
                              <span className={`text-sm font-black w-5 text-right flex-shrink-0 ${scoreColor(data.score)}`}>{data.score}</span>
                              <span className="text-[11px] text-gray-300 flex-1">{skillLabel(skill)}</span>
                              <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
                                <div className={`h-full rounded-full ${data.score >= 2 ? 'bg-purple-500' : data.score >= 1 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${(data.score / 3) * 100}%` }} />
                              </div>
                            </summary>
                            <div className="px-3 py-2 bg-gray-800/50 text-[11px] text-gray-400 leading-relaxed">{data.justification}</div>
                          </details>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Main layout ═══ */}
      <main className="flex flex-1 min-h-0 overflow-hidden">

        {/* ─── LEFT sidebar ─── */}
        <div className="w-56 flex-shrink-0 bg-gray-800/60 border-r border-gray-700 flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Briefcase size={14} className="text-purple-400" />
              <span className="text-xs font-bold text-white truncate">AB-730 Prep</span>
              <button onClick={() => setVoiceOutputEnabled(v => !v)} title="Toggle voice"
                className={`ml-auto p-1 rounded transition-colors ${voiceOutputEnabled ? 'text-purple-400 hover:text-purple-300' : 'text-gray-600 hover:text-gray-400'}`}>
                {voiceOutputEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              </button>
            </div>
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-[9px] text-gray-500">{progressPct}% complete · {topicIndex}/{TOPICS.length} topics</p>
          </div>

          <div className="flex-1 overflow-hidden">
            <TopicStepper topics={TOPICS} topicIndex={topicIndex} onJump={handleJumpToTopic} />
          </div>

          <div className="px-3 py-3 border-t border-gray-700 space-y-1.5 flex-shrink-0">
            <button onClick={() => setShowSessionPicker(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors">
              <FolderOpen size={11} /> Sessions
            </button>
            <button onClick={handleEvaluate} disabled={answerHistory.length < 3}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <BarChart3 size={11} /> Evaluate Readiness
            </button>
          </div>
        </div>

        {/* ─── RIGHT: content + answer ─── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Content panel */}
          <div className="w-80 flex-shrink-0 border-r border-gray-700 flex flex-col overflow-hidden bg-gray-800/40">
            {!isOnboarding && currentTopic && (
              <div className={`flex items-center gap-2 px-4 py-2 ${sm.bg} border-b ${sm.border} flex-shrink-0`}>
                <span className={sm.color}>{sm.icon}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${sm.color}`}>{sm.label}</span>
                {currentTopic.weight && (
                  <span className="ml-auto text-[10px] text-gray-500">{currentTopic.weight}</span>
                )}
              </div>
            )}

            {isOnboarding ? (
              <AB730Onboarding onComplete={handleCompleteTopic} />
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Topic {topicIndex}/{TOPICS.length - 1}</p>
                  <h2 className="text-sm font-bold text-white">{currentTopic?.label}</h2>
                </div>

                {loadingInstruction && (
                  <div className="flex items-center gap-2 p-3 bg-gray-800/60 rounded-xl">
                    <Loader2 size={14} className="animate-spin text-purple-400" />
                    <span className="text-xs text-gray-400">Loading topic…</span>
                  </div>
                )}

                {taskInstruction && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/25 rounded-xl">
                    <p className="text-[10px] font-bold text-purple-400 uppercase mb-1.5 flex items-center gap-1">
                      <BookOpen size={10} /> Teaching Point {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                    </p>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {taskInstruction.subTaskTeaching?.[subTaskIndex]}
                    </p>
                  </div>
                )}

                <ExamTipCard topicId={currentTopic?.id ?? ''} />

                {answerHistory.filter(e => e.topicId === currentTopic?.id).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Your Answers — This Topic</p>
                    {answerHistory.filter(e => e.topicId === currentTopic?.id).slice(-3).map((entry, i) => (
                      <div key={entry.id} className="p-2 bg-gray-800/50 border border-gray-700 rounded-lg">
                        <p className="text-[9px] text-gray-600 uppercase mb-0.5">Q{i + 1}</p>
                        <p className="text-[11px] text-gray-300 truncate">{entry.userAnswer.slice(0, 80)}…</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Answer panel */}
          {!isOnboarding && (
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Question */}
              <div className="flex-shrink-0 px-5 py-4 border-b border-gray-700 bg-gray-800/30">
                {loadingInstruction ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-purple-400" />
                    <span className="text-xs text-gray-500">Loading question…</span>
                  </div>
                ) : taskInstruction ? (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">
                      Question {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                    </p>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {taskInstruction.subTasks[subTaskIndex]}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Select a topic from the left panel to begin.</p>
                )}
              </div>

              {/* Feedback + answer area */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

                {aiExplanation && (
                  <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-purple-400 uppercase flex items-center gap-1">
                        <Brain size={10} /> AI Coach Response
                      </p>
                      <button onClick={() => navigator.clipboard.writeText(aiExplanation)} className="text-gray-600 hover:text-gray-300 transition-colors">
                        <Copy size={11} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{aiExplanation}</p>
                  </div>
                )}

                {subTaskCritique && !aiExplanation && (
                  <div className={`p-3 rounded-xl border ${subTaskCritique.hasSuggestions ? 'bg-amber-500/10 border-amber-500/25' : 'bg-emerald-500/10 border-emerald-500/25'}`}>
                    <p className={`text-[10px] font-bold uppercase mb-1.5 ${subTaskCritique.hasSuggestions ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {subTaskCritique.hasSuggestions ? '💡 Coaching Feedback' : '✅ Strong Answer'}
                    </p>
                    <p className="text-xs text-gray-300 leading-relaxed">{subTaskCritique.feedback}</p>
                    {subTaskCritique.hasSuggestions && (
                      <p className="text-[10px] text-gray-500 italic mt-1.5">Refine your answer, or move on when ready.</p>
                    )}
                  </div>
                )}

                {errorMsg && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" />
                    <p className="text-xs text-red-300">{errorMsg}</p>
                  </div>
                )}

                <div>
                  <textarea
                    ref={answerRef} value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
                    placeholder={taskInstruction?.subTasks[subTaskIndex]?.substring(0, 80) + '…' || 'Type your answer here…'}
                    style={{ minHeight: '140px' }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-purple-500 transition-colors leading-relaxed"
                  />
                  <p className="text-[9px] text-gray-700 mt-1">Ctrl+Enter to submit</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex-shrink-0 px-5 pb-5 space-y-2">
                <div className="flex gap-2">
                  <button onClick={handleSubmit} disabled={isSubmitting || !answer.trim() || !taskInstruction}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-40">
                    {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpCircle size={18} />}
                    {isSubmitting && <span className="text-sm">Evaluating…</span>}
                  </button>
                  <button onClick={handleCritique} disabled={isCritiquing || !answer.trim()} title="Get a hint"
                    className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors disabled:opacity-40">
                    {isCritiquing ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                  </button>
                </div>

                {topicHasAnswer && subTaskIndex < maxSubTask && (
                  <button onClick={handleMoveToNextSubTask}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition-all">
                    <SkipForward size={13} /> Next Question
                  </button>
                )}

                {topicHasAnswer && subTaskIndex >= maxSubTask && (!subTaskCritique || !subTaskCritique.hasSuggestions) && topicIndex < TOPICS.length - 1 && (
                  <button onClick={handleCompleteTopic}
                    className={`w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border transition-all ${sm.bg} ${sm.color} ${sm.border} hover:opacity-90`}>
                    <CheckCircle size={13} /> Complete Topic & Continue <ArrowRight size={13} />
                  </button>
                )}

                {topicHasAnswer && subTaskIndex >= maxSubTask && subTaskCritique?.hasSuggestions && topicIndex < TOPICS.length - 1 && (
                  <button onClick={handleCompleteTopic}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-all">
                    <CheckCircle size={13} /> Continue anyway <ArrowRight size={13} />
                  </button>
                )}

                {topicIndex >= TOPICS.length - 1 && topicHasAnswer && (
                  <button onClick={handleEvaluate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white transition-all">
                    <Award size={15} /> Get Exam Readiness Report
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MicrosoftAB730Page;
