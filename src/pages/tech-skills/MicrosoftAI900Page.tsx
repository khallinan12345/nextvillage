// src/pages/tech-skills/MicrosoftAI900Page.tsx
// Microsoft AI-900: Azure AI Fundamentals — Certification Prep
// API routes needed:
//   /api/ai900-task-instruction   (returns TaskInstruction for each topic)
//   /api/ai900-evaluate-session   (returns evaluation scores + feedback)

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import {
  Brain, BookOpen, Play, CheckCircle, ArrowRight, Eye,
  ChevronDown, ChevronRight, Loader2, FolderOpen,
  ArrowUpCircle, SkipForward, Lightbulb, RefreshCw, BarChart3,
  Award, X, Copy, Check, Volume2, VolumeX, AlertCircle, Star,
  Cpu, MessageSquarePlus, Zap, Shield, Camera, Mic, Sparkles,
  Trash2, Plus, HelpCircle, GraduationCap, Target, TrendingUp,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopicDef {
  id: string;
  label: string;
  domain: 1 | 2 | 3 | 4 | 5;
  icon: string;
  isOnboarding?: boolean;
  weight: string;        // exam weighting band e.g. "15–20%"
  azureServices?: string[];
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
  ai900_session_id: string;
  ai900_session_name: string;
  ai900_prompts: any[];
  ai900_evaluation: any | null;
  updated_at?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const makeId = () => Math.random().toString(36).substring(2, 9);
const AI900_ACTIVITY = 'ai900_cert_prep';

const TOPICS: TopicDef[] = [
  // Onboarding
  { id: 'intro_ai900',      label: 'Welcome & Exam Overview',      domain: 1, icon: '🎓', isOnboarding: true, weight: '' },

  // Domain 1 — AI Workloads & Responsible AI (15–20%)
  { id: 'ai_workloads',     label: 'AI Workload Types',             domain: 1, icon: '⚙️', weight: '15–20%' },
  { id: 'responsible_ai',   label: 'Responsible AI Principles',     domain: 1, icon: '🛡️', weight: '15–20%' },

  // Domain 2 — Machine Learning Principles (15–20%)
  { id: 'ml_types',         label: 'Machine Learning Techniques',   domain: 2, icon: '🧠', weight: '15–20%', azureServices: ['Azure Machine Learning'] },
  { id: 'ml_concepts',      label: 'Core ML Concepts',              domain: 2, icon: '📊', weight: '15–20%', azureServices: ['Azure ML workspace', 'AutoML'] },
  { id: 'azure_ml',         label: 'Azure ML Services',             domain: 2, icon: '☁️', weight: '15–20%', azureServices: ['Azure Machine Learning', 'AutoML'] },

  // Domain 3 — Computer Vision (15–20%)
  { id: 'cv_solutions',     label: 'Computer Vision Types',         domain: 3, icon: '📷', weight: '15–20%', azureServices: ['Azure AI Vision', 'Azure AI Face'] },
  { id: 'azure_cv',         label: 'Azure Vision Services',         domain: 3, icon: '🔍', weight: '15–20%', azureServices: ['Azure AI Vision', 'Azure AI Face', 'Azure Video Indexer'] },

  // Domain 4 — NLP Workloads (15–20%)
  { id: 'nlp_workloads',    label: 'NLP Workload Types',            domain: 4, icon: '💬', weight: '15–20%', azureServices: ['Azure AI Language', 'Azure AI Speech'] },
  { id: 'azure_nlp',        label: 'Azure NLP Services',            domain: 4, icon: '🗣️', weight: '15–20%', azureServices: ['Azure AI Language', 'Azure AI Speech', 'Azure AI Translator'] },

  // Domain 5 — Generative AI (20–25%)
  { id: 'genai_concepts',   label: 'Generative AI Concepts',        domain: 5, icon: '✨', weight: '20–25%', azureServices: ['Azure OpenAI Service'] },
  { id: 'prompt_engineering', label: 'Prompt Engineering',          domain: 5, icon: '📝', weight: '20–25%' },
  { id: 'azure_genai',      label: 'Azure Generative AI Services',  domain: 5, icon: '🚀', weight: '20–25%', azureServices: ['Azure OpenAI Service', 'Azure AI Foundry'] },

  // Practice exam
  { id: 'practice_exam',    label: 'Practice Exam Simulation',      domain: 5, icon: '🎯', weight: '', isOnboarding: false },
];

const DOMAIN_META: Record<number, { label: string; shortLabel: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  1: { label: 'Domain 1: AI Workloads & Responsible AI', shortLabel: 'D1: Workloads', color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',   icon: <Shield size={12} /> },
  2: { label: 'Domain 2: Machine Learning Principles',   shortLabel: 'D2: ML',        color: 'text-purple-400',  bg: 'bg-purple-500/15',  border: 'border-purple-500/30', icon: <Brain size={12} /> },
  3: { label: 'Domain 3: Computer Vision',               shortLabel: 'D3: Vision',    color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30',icon: <Camera size={12} /> },
  4: { label: 'Domain 4: Natural Language Processing',   shortLabel: 'D4: NLP',       color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30',  icon: <Mic size={12} /> },
  5: { label: 'Domain 5: Generative AI',                 shortLabel: 'D5: Gen AI',    color: 'text-pink-400',    bg: 'bg-pink-500/15',    border: 'border-pink-500/30',   icon: <Sparkles size={12} /> },
};

// ─── Fallback instructions per topic ────────────────────────────────────────

const FALLBACK_SEEDS: Record<string, { teaching: string; question: string }[]> = {
  ai_workloads: [
    { teaching: 'AI workloads are the types of tasks that AI systems perform. The five main types on the AI-900 exam are: machine learning, computer vision, natural language processing (NLP), document intelligence, and knowledge mining.',
      question: 'In your own words, describe one AI workload you have already used in the Girls AIing platform. Which of the five types does it belong to, and why?' },
    { teaching: 'Each AI workload maps to real-world problems. Computer vision reads images. NLP understands language. Knowledge mining finds patterns in large document sets. Generative AI creates new content.',
      question: 'Think about cassava farming in Oloibiri. Which AI workload would help a farmer detect crop disease from a phone photo — and what would help them get advice in their local language? Name the workload type for each.' },
    { teaching: 'The AI-900 exam uses scenario questions: "A company wants to identify objects in photos — which workload do they need?" Knowing which workload matches which problem is the key skill.',
      question: 'An oil company wants to automatically read text from scanned inspection reports. A health clinic wants to understand patient feedback written in Ijaw. Which AI workload type fits each scenario — and why?' },
  ],
  responsible_ai: [
    { teaching: 'Microsoft defines six Responsible AI principles that appear throughout the AI-900 exam: Fairness, Reliability & Safety, Privacy & Security, Inclusiveness, Transparency, and Accountability.',
      question: 'In your own words, explain what "Fairness" means in AI. Give one example of an AI system that could be unfair — perhaps one that was trained on data that did not include people from rural Nigeria.' },
    { teaching: 'Transparency means people should know when they are interacting with AI. Accountability means humans remain responsible for AI decisions — AI cannot be held legally responsible.',
      question: 'The Girls AIing platform has a disclaimer at the bottom: "Claude is AI and can make mistakes." Which Responsible AI principle does this address — Transparency or Accountability? Explain your reasoning.' },
    { teaching: 'The AI-900 exam often presents a scenario and asks: "Which Responsible AI principle is being violated?" Practice by identifying the principle from the problem described.',
      question: 'An AI model gives better loan approval rates to men than women because it was trained on historical data where men received more loans. Which Responsible AI principle is violated — Fairness, Reliability, or Inclusiveness? Justify your answer.' },
  ],
  ml_types: [
    { teaching: 'The three main machine learning technique types are: Supervised learning (trained on labelled examples), Unsupervised learning (finds patterns without labels), and Reinforcement learning (learns by trial and reward).',
      question: 'A model is trained on 10,000 images of cassava leaves labelled "healthy" or "diseased". When given a new photo, it predicts the label. Is this supervised, unsupervised, or reinforcement learning — and what specifically makes it that type?' },
    { teaching: 'Within supervised learning: Regression predicts a continuous number (e.g. tomorrow\'s fish catch in kg). Classification predicts a category (e.g. safe/unsafe water). Clustering groups similar items without labels — that is unsupervised.',
      question: 'For each scenario, identify whether it is regression, classification, or clustering: (1) Predicting the price of solar panels next month. (2) Grouping Oloibiri community members by their learning behaviour without pre-set categories. (3) Deciding if a creek water sample is safe to drink.' },
    { teaching: 'Transformer architecture is the foundation of modern language models like Claude and GPT. It uses "attention" to understand the relationship between words across long passages — not just nearby words.',
      question: 'The AI Playground uses Claude, which is built on transformer architecture. Describe in your own words what a transformer does differently from an older AI that only looked at the word immediately before each new word.' },
  ],
  ml_concepts: [
    { teaching: 'Features are the input variables a model learns from. Labels are the correct answers used during training. Example: to predict fish catch, features might be water temperature, season, and tide height — the label is the actual catch recorded that day.',
      question: 'You want to train a model to predict whether a student will pass the AI-900 exam. List three features you would use and explain why each one is relevant. What would the label be?' },
    { teaching: 'A training dataset teaches the model. A validation dataset tests whether the model works on data it has never seen. Overfitting happens when a model memorises training data but fails on new examples.',
      question: 'A model performs perfectly on its training data (100% accuracy) but only 60% on new data it has never seen. What is this problem called — and what does it tell you about whether the model has truly "learned" versus just "memorised"?' },
    { teaching: 'Automated ML (AutoML) removes the need to manually choose and tune algorithms. You provide your data and AutoML tries many algorithms and settings, then recommends the best one.',
      question: 'In the Azure Machine Learning workspace, what is the difference between training a model manually versus using AutoML? What type of learner would benefit most from AutoML, and why?' },
  ],
  azure_ml: [
    { teaching: 'The Azure Machine Learning workspace is the hub for all ML work on Azure: creating datasets, training models, running experiments, and deploying models as endpoints that apps can call.',
      question: 'A data scientist wants to train a model to predict crop yields using three years of Nigerian rainfall and temperature data. Name two things they would do inside an Azure Machine Learning workspace to make this happen.' },
    { teaching: 'Model deployment on Azure means publishing a trained model as a web endpoint. An application can then send data to that endpoint and receive a prediction — without needing to know how the model works internally.',
      question: 'Once a cassava disease detection model is trained, a health NGO wants to use it in a mobile app. Describe in plain English what "deploying the model as an endpoint" means — and what the mobile app sends and receives.' },
    { teaching: 'Azure AutoML automatically tries multiple algorithms and selects the best one based on a metric you choose (e.g. accuracy or error rate). It reduces the need for deep statistical expertise.',
      question: 'On the AI-900 exam, you might see: "A company with no data scientists wants to train a predictive model without writing code — which Azure ML feature should they use?" What is your answer and why?' },
  ],
  cv_solutions: [
    { teaching: 'The four main computer vision solution types are: Image classification (what is in the image?), Object detection (where are specific things in the image?), OCR / optical character recognition (reading text from images), and Facial detection (locating and analysing faces).',
      question: 'For each scenario, name the computer vision solution type: (1) An app reads the text on a handwritten OWFA fishing licence. (2) A drone identifies how many fishing nets are visible in a creek photo. (3) A security system checks whether the person at the door is an enrolled staff member.' },
    { teaching: 'Object detection goes further than classification: it not only says "there is a fish" but draws a bounding box around it and counts multiple instances. Classification just says what the image contains overall.',
      question: 'Explain the difference between image classification and object detection using an example from Oloibiri — perhaps a creek, a market, or a community meeting. When would you need detection rather than classification?' },
    { teaching: 'Semantic segmentation goes even further than object detection — it labels every single pixel in an image with a category. This is used in medical imaging, satellite maps, and autonomous vehicles.',
      question: 'A satellite image of the Niger Delta needs to identify which areas are mangrove forest versus open creek versus oil-contaminated land. Would image classification, object detection, or semantic segmentation be most appropriate — and why?' },
  ],
  azure_cv: [
    { teaching: 'Azure AI Vision is the core service for image classification, object detection, and OCR. Azure AI Face is specifically for detecting, analysing, and comparing human faces.',
      question: 'A company wants to automatically tag photos from a community event — identifying people, objects, and reading any text visible in the photos. Which Azure computer vision service or combination of services would they use?' },
    { teaching: 'Azure AI Video Indexer extends computer vision to video: it can transcribe speech, detect faces over time, identify objects, and extract key moments — all automatically.',
      question: 'A training video from the Davidson AI Innovation Center needs to be automatically captioned and have key topics extracted. Which Azure service handles this — and name two things it can extract from the video automatically.' },
    { teaching: 'On the AI-900, Azure service identification questions follow a pattern: "A solution needs to read printed text from scanned documents at scale — which Azure service?" Always match the use case to the service name.',
      question: 'Match each use case to the correct Azure computer vision service: (1) Detecting whether a person is wearing a face mask. (2) Reading invoice numbers from scanned paper forms. (3) Recognising a specific employee from a photo to grant door access.' },
  ],
  nlp_workloads: [
    { teaching: 'The main NLP workload types are: key phrase extraction (finding the important topics in text), entity recognition (identifying names, dates, places), sentiment analysis (is the text positive, negative, or neutral?), language modelling, speech recognition, speech synthesis, and translation.',
      question: 'A community radio station wants to understand whether listeners are happy or unhappy based on their text messages. Which NLP workload type does this use — and what would the output of that workload look like?' },
    { teaching: 'Named entity recognition (NER) finds specific types of information in text: person names, organisations, locations, dates. This is useful for extracting structured data from unstructured documents like government reports.',
      question: 'The sentence is: "On 14 March 2024, the OWFA signed an agreement with Bayelsa State in Yenagoa." Using named entity recognition, identify each named entity and its type (person, organisation, location, or date).' },
    { teaching: 'Speech recognition converts spoken audio to text (speech-to-text). Speech synthesis converts text to spoken audio (text-to-speech). Translation converts between languages. These are three distinct NLP workloads with different Azure services.',
      question: 'The Girls AIing platform uses voice input in Nigerian English and reads AI responses aloud. Name the two NLP workload types being used — and explain the difference between them in one sentence each.' },
  ],
  azure_nlp: [
    { teaching: 'Azure AI Language covers text analytics: key phrase extraction, entity recognition, sentiment analysis, and language understanding. Azure AI Speech covers speech-to-text, text-to-speech, and speaker recognition. Azure AI Translator covers language translation.',
      question: 'A health NGO collects patient feedback in written English and wants to: (1) identify which health topics are most commonly mentioned, (2) determine whether patients are satisfied or dissatisfied, and (3) translate feedback written in Ijaw to English. Which Azure NLP service handles each task?' },
    { teaching: 'Azure AI Language also includes custom models — you can train it on your own domain-specific text so it recognises terms specific to Nigerian fishing regulations, for example, not just standard English entities.',
      question: 'Why might a standard Azure AI Language entity recognition model fail to correctly identify "OWFA" or "Nun River" as important entities? What Azure feature would you use to teach it about local terminology?' },
    { teaching: 'On AI-900 exam questions: if the scenario mentions reading speech → Azure AI Speech. If it mentions translating between languages → Azure AI Translator. If it mentions understanding or analysing text → Azure AI Language.',
      question: 'Match each scenario to the correct Azure NLP service: (1) Converting a minister\'s speech from audio to a written transcript. (2) Translating a fishing regulation document from English to Ijaw. (3) Detecting whether a student\'s written answer expresses confusion or confidence.' },
  ],
  genai_concepts: [
    { teaching: 'Generative AI creates new content — text, images, code, audio — based on patterns learned from massive training datasets. Large Language Models (LLMs) like Claude and GPT are the most common type, generating human-like text from a prompt.',
      question: 'You use Claude in the AI Playground every day. In your own words, explain what makes Claude "generative" — what is it generating, and where does that output come from?' },
    { teaching: 'Tokens are the chunks of text a language model processes. Context window is the maximum amount of text a model can consider at once. Grounding is connecting a model to a specific knowledge source so its answers are accurate for your domain.',
      question: 'Why might the AI Playground forget something you mentioned early in a very long conversation? Explain this using the concept of a context window — and what would grounding do to help an AI give accurate answers about Oloibiri fishing regulations?' },
    { teaching: 'Responsible AI in generative AI includes: hallucination (the model states false information confidently), bias (output reflects biases in training data), copyright concerns, and transparency about AI-generated content.',
      question: 'The AI Playground footer says "Claude is AI and can make mistakes — please double-check cited sources." Which generative AI risk does this address — hallucination, bias, or copyright? Explain why this disclaimer matters for learners in Oloibiri.' },
  ],
  prompt_engineering: [
    { teaching: 'Prompt engineering is the skill of writing clear, specific instructions so an AI gives useful, accurate responses. A good prompt includes: context (who you are, what you need), the task (what to do), constraints (format, length, tone), and examples when helpful.',
      question: 'You want Claude to explain what a transformer model is to a 15-year-old student in Oloibiri who has never studied computer science. Write a prompt that would produce a clear, locally grounded explanation. Then identify each element of your prompt: context, task, constraints.' },
    { teaching: 'Zero-shot prompting gives the AI no examples — just the instruction. Few-shot prompting includes 2–3 examples before asking. Chain-of-thought prompting asks the AI to reason step by step before giving a final answer.',
      question: 'You need the AI to classify water quality descriptions as "safe" or "unsafe". Write one zero-shot prompt and one few-shot prompt for the same task. Which produces a more reliable result — and why?' },
    { teaching: 'System prompts set the AI\'s behaviour for an entire conversation — like the "Be warm, encouraging, and precise" instruction in your platform. User prompts are the individual messages. Understanding this distinction helps both exam answers and real platform development.',
      question: 'The Girls AIing platform system prompt says "You are a thinking partner, not an answer machine." In the context of the AI-900 exam, what aspect of generative AI does this system prompt address — responsible AI, grounding, or prompt engineering? Justify your answer.' },
  ],
  azure_genai: [
    { teaching: 'Azure OpenAI Service gives enterprise access to OpenAI\'s GPT models (and DALL-E for images) through Microsoft\'s Azure infrastructure — with Microsoft\'s security, compliance, and support. It is conceptually similar to Claude but from OpenAI, hosted on Azure.',
      question: 'A Nigerian government ministry wants to build an AI assistant that answers questions about public health policy, using GPT-4, with enterprise security and data residency in Africa. Which Azure service would they use — and name two reasons a government would choose Azure OpenAI over the public OpenAI API.' },
    { teaching: 'Azure AI Foundry (formerly Azure AI Studio) is the platform for building, testing, and deploying custom AI models and agents on Azure. It supports multiple model types and allows you to ground models in your own data.',
      question: 'A startup wants to build a custom AI assistant trained on Nigerian agricultural regulations so it gives accurate local advice. They want to use Azure, test different models, and ground the AI in their document library. Which Azure service is designed for exactly this use case?' },
    { teaching: 'The AI-900 exam distinguishes between Azure OpenAI Service (accessing OpenAI models via Azure) and Azure AI Foundry (the broader platform for building custom AI solutions with multiple model options). Know which to choose based on the scenario.',
      question: 'Final exam-style question: "A developer wants to add GPT-4-based text generation to their enterprise app, using Azure\'s security and compliance tools." — Azure OpenAI Service or Azure AI Foundry? And: "A team wants to build and deploy a custom model trained on their own data with a visual development interface." — which service?' },
  ],
  practice_exam: [
    { teaching: 'The AI-900 exam has 40–60 standalone questions, a 45-minute time limit, and requires a score of 700/1000 to pass. Questions are scenario-based: they describe a real problem and ask which AI concept, principle, or Azure service applies.',
      question: 'Before we begin the practice simulation, rate your confidence in each domain from 1 (not confident) to 5 (very confident): Domain 1 (AI Workloads & Responsible AI), Domain 2 (Machine Learning), Domain 3 (Computer Vision), Domain 4 (NLP), Domain 5 (Generative AI). This will help me focus the practice questions.' },
    { teaching: 'Exam tip: read each scenario carefully and identify the key trigger words. "Identify objects in images" → Computer Vision. "Understand written text" → NLP. "Generate new content" → Generative AI. "Train on labelled examples" → Supervised ML.',
      question: 'Practice question 1: A company wants to automatically extract the names of people, organisations, and dates from thousands of scanned contract documents. Which AI workload type does this describe — and which Azure service would you use?' },
    { teaching: 'Responsible AI questions often give you a scenario of something going wrong and ask which principle is violated. Common patterns: AI gives different outcomes to different groups → Fairness. AI makes a decision with no explanation → Transparency. Humans cannot override the AI → Accountability.',
      question: 'Practice question 2: An AI hiring system rejects all applicants from a particular region without explanation, and the company has no way to review or override its decisions. Which TWO Responsible AI principles are violated — and explain each one briefly.' },
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

const AI900Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    <div className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl">
      <p className="text-xs font-bold text-blue-400 uppercase mb-3">🎓 Welcome to AI-900 Certification Prep</p>
      <p className="text-sm text-gray-300 leading-relaxed mb-3">
        You are preparing for the <strong className="text-white">Microsoft AI-900: Azure AI Fundamentals</strong> certification.
        This is a globally recognised credential that validates your understanding of AI concepts and Azure AI services —
        <strong className="text-white"> no coding required</strong>.
      </p>
      <p className="text-sm text-gray-300 leading-relaxed mb-4">
        Nigerian citizens can get the exam voucher <strong className="text-white">free</strong> through the
        3MTT × Microsoft Skilling Programme at{' '}
        <a href="https://aka.ms/registerngcertification" target="_blank" rel="noopener noreferrer"
          className="text-blue-400 underline">aka.ms/registerngcertification</a>.
      </p>
      <div className="mb-4">
        <PidginTooltip
          originalText="You are preparing for the Microsoft AI-900: Azure AI Fundamentals certification. This is a globally recognised credential that validates your understanding of AI concepts and Azure AI services — no coding required."
          hintText="Tap here to translate this introduction into Nigerian Pidgin."
        />
      </div>

      <p className="text-xs font-bold text-gray-400 uppercase mb-2">What the AI-900 Covers</p>
      <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs leading-relaxed space-y-1 mb-3">
        {[
          ['🛡️', 'D1', 'AI Workloads & Responsible AI', '15–20%', 'text-blue-300'],
          ['🧠', 'D2', 'Machine Learning Principles',   '15–20%', 'text-purple-300'],
          ['📷', 'D3', 'Computer Vision Workloads',     '15–20%', 'text-emerald-300'],
          ['💬', 'D4', 'NLP Workloads',                 '15–20%', 'text-amber-300'],
          ['✨', 'D5', 'Generative AI Workloads',       '20–25%', 'text-pink-300'],
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
        { icon: <HelpCircle size={14}/>, title: 'No coding required', desc: '40–60 conceptual questions — understanding AI, not building it', col: 'text-blue-400' },
        { icon: <Target size={14}/>,     title: 'Score 700/1000 to pass', desc: '45 minutes, standalone questions, navigate freely', col: 'text-emerald-400' },
        { icon: <GraduationCap size={14}/>, title: 'Free for Nigerians', desc: '3MTT × Microsoft voucher pathway — ages 16–35', col: 'text-amber-400' },
        { icon: <TrendingUp size={14}/>, title: 'Career proof', desc: 'Globally recognised, renewable annually for free', col: 'text-purple-400' },
      ].map((item, i) => (
        <div key={i} className="p-3 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className={`flex items-center gap-1.5 mb-1 ${item.col}`}>{item.icon}<span className="text-xs font-bold">{item.title}</span></div>
          <p className="text-[11px] text-gray-400">{item.desc}</p>
        </div>
      ))}
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">💡 How this prep course works</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        Each topic follows the <strong className="text-white">Socratic method</strong> — you will be asked to explain
        concepts in your own words before the AI confirms or corrects. This builds genuine understanding, not just memorisation.
        The <strong className="text-white">Practice Exam</strong> at the end simulates real AI-900 question style.
        All examples are grounded in <strong className="text-white">Oloibiri, Nigeria</strong> — the community you know.
      </p>
    </div>

    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
      <p className="text-xs font-bold text-blue-400 mb-1.5">⏱️ Exam at a Glance</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['40–60', 'Questions'], ['45 min', 'Time limit'], ['700/1000', 'Pass score']].map(([val, lbl]) => (
          <div key={lbl}>
            <p className="text-sm font-black text-white">{val}</p>
            <p className="text-[10px] text-gray-400">{lbl}</p>
          </div>
        ))}
      </div>
    </div>

    {/* Free voucher CTA */}
    <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
      <p className="text-xs font-bold text-emerald-400 mb-1.5">🎟️ Get Your Free Exam Voucher</p>
      <p className="text-xs text-gray-300 leading-relaxed mb-2">
        Nigerian citizens can claim a <strong className="text-white">fully paid AI-900 exam voucher</strong> through
        the Microsoft Digital Skills Nigeria programme — at zero cost. Complete the learning, score above 60%
        on the mock exam, and receive your voucher.
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

    <button onClick={onComplete}
      className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">
      Let's start with Domain 1! <ArrowRight size={16} />
    </button>
  </div>
);

// ─── Topic stepper ─────────────────────────────────────────────────────────────

const TopicStepper: React.FC<{
  topics: TopicDef[];
  topicIndex: number;
  onJump: (idx: number) => void;
}> = ({ topics, topicIndex, onJump }) => {
  const domains = [1, 2, 3, 4, 5] as const;
  // Group topics by domain (excluding onboarding)
  const mainTopics = topics.filter(t => !t.isOnboarding || t.id === 'practice_exam');
  const onboarding = topics.find(t => t.isOnboarding && t.id === 'intro_ai900');

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
              ${isCurrent ? 'bg-blue-500/15 border border-blue-500/30 font-bold text-blue-400' : ''}
              ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
              ${!isDone && !isCurrent ? 'text-gray-600 cursor-default' : ''}`}>
            <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? onboarding.icon : '⬜'}</span>
            <span className="truncate">{onboarding.label}</span>
          </button>
        );
      })()}

      {/* Domain groups */}
      {domains.map(domain => {
        const dm = DOMAIN_META[domain];
        const domainTopics = topics.filter(t => t.domain === domain && !t.isOnboarding);
        if (domainTopics.length === 0) return null;
        return (
          <div key={domain}>
            <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider mb-1 ${dm.color}`}>
              {dm.icon}{dm.shortLabel}
              {domainTopics[0].weight && <span className="text-gray-600 font-normal normal-case tracking-normal">{domainTopics[0].weight}</span>}
            </div>
            <div className="space-y-0.5">
              {domainTopics.map(topic => {
                const globalIdx = topics.findIndex(t => t.id === topic.id);
                const isDone = globalIdx < topicIndex;
                const isCurrent = globalIdx === topicIndex;
                const isFuture = globalIdx > topicIndex;
                return (
                  <button key={topic.id} onClick={() => isDone && onJump(globalIdx)} disabled={isFuture}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                      ${isCurrent ? `${dm.bg} ${dm.border} border font-bold ${dm.color}` : ''}
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
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1 text-pink-400">Final Practice</p>
            <button onClick={() => isDone && onJump(idx)} disabled={isFuture}
              className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                ${isCurrent ? 'bg-pink-500/15 border border-pink-500/30 font-bold text-pink-400' : ''}
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

// ─── Azure service reference panel ───────────────────────────────────────────

const ServiceReferencePanel: React.FC<{ topic: TopicDef }> = ({ topic }) => {
  const services: Record<string, { desc: string; domain: string }> = {
    'Azure Machine Learning':  { desc: 'Workspace for training, managing, and deploying ML models', domain: 'D2' },
    'AutoML':                  { desc: 'Automatically selects and tunes the best algorithm for your data', domain: 'D2' },
    'Azure ML workspace':      { desc: 'Hub for all ML experiments, datasets, and model management', domain: 'D2' },
    'Azure AI Vision':         { desc: 'Image classification, object detection, and OCR', domain: 'D3' },
    'Azure AI Face':           { desc: 'Facial detection, analysis, and verification', domain: 'D3' },
    'Azure Video Indexer':     { desc: 'Extracts insights from video: transcription, faces, objects, topics', domain: 'D3' },
    'Azure AI Language':       { desc: 'Text analytics: key phrases, entities, sentiment, language understanding', domain: 'D4' },
    'Azure AI Speech':         { desc: 'Speech-to-text, text-to-speech, and speaker recognition', domain: 'D4' },
    'Azure AI Translator':     { desc: 'Real-time translation between 100+ languages', domain: 'D4' },
    'Azure OpenAI Service':    { desc: 'Enterprise access to GPT and DALL-E models on Azure infrastructure', domain: 'D5' },
    'Azure AI Foundry':        { desc: 'Platform for building, testing, and deploying custom AI models and agents', domain: 'D5' },
  };

  const relevantServices = topic.azureServices?.filter(s => services[s]) ?? [];
  if (relevantServices.length === 0) return null;

  return (
    <div className="p-3 bg-gray-800/40 border border-gray-700 rounded-xl space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <Cpu size={11} className="text-blue-400" /> Azure Services — This Topic
      </p>
      {relevantServices.map(svc => (
        <div key={svc} className="flex gap-2">
          <span className="text-[10px] font-bold text-blue-300 whitespace-nowrap pt-0.5 min-w-[60px]">{services[svc].domain}</span>
          <div>
            <p className="text-xs font-semibold text-white">{svc}</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">{services[svc].desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Exam tip card ────────────────────────────────────────────────────────────

const ExamTipCard: React.FC<{ topicId: string }> = ({ topicId }) => {
  const tips: Record<string, string> = {
    ai_workloads:    'Trigger words: "identify objects in images" → Computer Vision. "understand text" → NLP. "generate new content" → Generative AI. "train on historical data" → Machine Learning.',
    responsible_ai:  'Exam scenarios often say "AI gives different outcomes to different groups" → Fairness. "No way to know how AI decided" → Transparency. "Cannot override AI" → Accountability.',
    ml_types:        '"Trained on labelled examples with known answers" → Supervised. "Groups data without pre-defined categories" → Unsupervised. "Learns by trial and reward" → Reinforcement.',
    ml_concepts:     '"Perfect on training data, poor on new data" → Overfitting. "Input variables the model learns from" → Features. "Correct answers used during training" → Labels.',
    azure_ml:        'Azure Machine Learning = the workspace hub. AutoML = automatic algorithm selection. Model deployment = publishing as an API endpoint apps can call.',
    cv_solutions:    '"What is in the image overall?" → Classification. "Where are specific objects?" → Detection. "Read text from image" → OCR. "Identify a face" → Facial detection.',
    azure_cv:        'Azure AI Vision = images and OCR. Azure AI Face = faces specifically. Azure Video Indexer = video analysis and transcription.',
    nlp_workloads:   '"Find the main topics in text" → Key phrase extraction. "Identify names/dates/places" → Entity recognition. "Positive or negative tone?" → Sentiment analysis.',
    azure_nlp:       'Azure AI Language = text analysis. Azure AI Speech = voice ↔ text. Azure AI Translator = language translation. Match the service to the modality.',
    genai_concepts:  '"Model states something false confidently" → Hallucination. "Model reflects biases in training data" → Bias. "Output based on patterns from huge dataset" → LLM.',
    prompt_engineering: '"Instruction with 2–3 examples" → Few-shot. "Instruction alone, no examples" → Zero-shot. "Ask AI to show its reasoning first" → Chain-of-thought.',
    azure_genai:     'Azure OpenAI Service = accessing OpenAI models (GPT, DALL-E) via Azure. Azure AI Foundry = building custom AI solutions with multiple model options.',
    practice_exam:   'Read each scenario and identify the KEY trigger word before choosing an answer. You can flag questions and return — use this for tricky ones.',
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

const MicrosoftAI900Page: React.FC = () => {
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

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    fallbackText,
    clearFallback,
  } = useVoice(voiceMode === 'pidgin');

  const speakTextRef = useRef<(text: string) => void>(() => {});
  const speakText = useCallback((text: string) => {
    if (!voiceOutputEnabled || !text.trim()) return;
    hookSpeak(text);
  }, [voiceOutputEnabled, hookSpeak]);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  // ── Session ──────────────────────────────────────────────────────────
  const [sessionId, setSessionId]               = useState<string | null>(null);
  const [sessionName, setSessionName]           = useState('AI-900 Prep');
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
  const [isCritiquingResponse, setIsCritiquingResponse] = useState(false);

  // ── Answer ───────────────────────────────────────────────────────────
  const [answer, setAnswer]                 = useState('');
  const [answerHistory, setAnswerHistory]   = useState<QuizEntry[]>([]);
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [isCritiquing, setIsCritiquing]     = useState(false);
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);
  const [aiExplanation, setAiExplanation]   = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // ── Evaluation ───────────────────────────────────────────────────────
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [isEvaluating, setIsEvaluating]     = useState(false);
  const [evaluation, setEvaluation]         = useState<any>(null);
  const [evalError, setEvalError]           = useState<string | null>(null);

  const currentTopic  = TOPICS[topicIndex];
  const currentDomain = currentTopic?.domain ?? 1;
  const dm            = DOMAIN_META[currentDomain];

  // ── Load sessions ─────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('dashboard')
      .select('id, ai900_session_id, ai900_session_name, ai900_prompts, ai900_evaluation, updated_at')
      .eq('user_id', userId).eq('activity', AI900_ACTIVITY)
      .not('ai900_session_id', 'is', null).order('updated_at', { ascending: false });
    if (data?.length) { setSessions(data as SessionRecord[]); if (!sessionId) setShowSessionPicker(true); }
  }, [userId, sessionId]);
  useEffect(() => { if (userId) loadSessions(); }, [userId, loadSessions]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (userId) {
      await supabase.from('dashboard').insert({
        user_id: userId, activity: AI900_ACTIVITY,
        ai900_session_id: sid, ai900_session_name: sessionName,
        ai900_prompts: [], ai900_evaluation: { topicIndex: 0 },
      });
    }
    return sid;
  }, [userId, sessionName]);

  const persistSession = useCallback(async (prompts: QuizEntry[], tIdx: number) => {
    const sid = sessionIdRef.current; if (!userId || !sid) return;
    await supabase.from('dashboard').update({
      ai900_prompts: prompts,
      ai900_evaluation: { topicIndex: tIdx },
      ai900_session_name: sessionName,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('ai900_session_id', sid);
  }, [userId, sessionName]);

  const createNewSession = useCallback(async () => {
    if (!userId) return;
    const sid = makeId();
    await supabase.from('dashboard').insert({
      user_id: userId, activity: AI900_ACTIVITY,
      ai900_session_id: sid, ai900_session_name: 'AI-900 Prep',
      ai900_prompts: [], ai900_evaluation: { topicIndex: 0 },
    });
    setSessionId(sid); sessionIdRef.current = sid;
    setSessionName('AI-900 Prep'); setTopicIndex(0);
    setAnswerHistory([]); setEvaluation(null);
    setTopicHasAnswer(false); setShowSessionPicker(false);
    setTaskInstruction(null); setAnswer(''); setAiExplanation(null);
    setErrorMsg(null); setSubTaskCritique(null); setSubTaskIndex(0);
  }, [userId]);

  const loadSession = useCallback((s: SessionRecord) => {
    setSessionId(s.ai900_session_id); sessionIdRef.current = s.ai900_session_id;
    setSessionName(s.ai900_session_name);
    const ev = s.ai900_evaluation || {};
    setTopicIndex(ev.topicIndex ?? 0);
    setAnswerHistory(s.ai900_prompts || []);
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
        ai900_session_id: null, ai900_session_name: null, ai900_prompts: null, ai900_evaluation: null,
      }).eq('user_id', userId).eq('ai900_session_id', sid);
      setSessions(prev => prev.filter(s => s.ai900_session_id !== sid));
    } finally { setDeletingSessionId(null); }
  }, [userId]);

  // ── Fetch task instruction ───────────────────────────────────────────
  const fetchTaskInstruction = useCallback(async (idx: number) => {
    const topic = TOPICS[idx]; if (!topic || topic.isOnboarding) return;
    setLoadingInstruction(true); setTaskInstruction(null);
    try {
      const res = await fetch('/api/ai900-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          topicId: topic.id, topicLabel: topic.label, domain: topic.domain,
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
      // Fallback seeds
      const seeds = FALLBACK_SEEDS[topic.id] ?? [
        { teaching: `Let\'s explore ${topic.label} — a key topic in the AI-900 exam.`,
          question: `In your own words, describe what you already know about ${topic.label}. What questions do you have?` },
      ];
      setTaskInstruction({
        headline: topic.label,
        context: `Domain ${topic.domain}: ${DOMAIN_META[topic.domain].shortLabel}`,
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

  // ── Submit answer ────────────────────────────────────────────────────
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
      const res = await fetch('/api/ai900-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          mode: 'evaluate',
          topicId: currentTopic?.id, domain: currentTopic?.domain,
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
          entry.aiCritique = result.feedback;
          entry.hasSuggestions = result.hasSuggestions;
          setSubTaskCritique({ hasSuggestions: !!result.hasSuggestions, feedback: result.feedback });
          if (!result.hasSuggestions) speakTextRef.current(result.feedback.substring(0, 200));
        }
        entry.aiExplanation = explanation;
        setAiExplanation(explanation || null);
      } else {
        // Offline fallback: acknowledge and encourage
        explanation = 'Great effort! Your answer has been recorded. Keep reasoning through each concept in your own words — that is how real understanding forms. Move to the next question when you are ready.';
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

  // ── Critique (ask for hint before submitting) ────────────────────────
  const handleCritique = useCallback(async () => {
    if (!answer.trim() || isCritiquing) return;
    setIsCritiquing(true);
    try {
      const res = await fetch('/api/ai900-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          mode: 'hint',
          topicId: currentTopic?.id, domain: currentTopic?.domain,
          subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
          userAnswer: answer.trim(),
          communicationStrategy, learningStrategy,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.hint) setSubTaskCritique({ hasSuggestions: true, feedback: d.hint });
      }
    } catch { /* ignore */ }
    finally { setIsCritiquing(false); }
  }, [answer, isCritiquing, currentTopic, taskInstruction, subTaskIndex, communicationStrategy, learningStrategy]);

  // ── Navigation ───────────────────────────────────────────────────────
  const handleMoveToNextSubTask = useCallback(() => {
    const maxSub = (taskInstruction?.subTasks?.length ?? 1) - 1;
    if (subTaskIndex < maxSub) {
      setSubTaskIndex(s => s + 1);
      setSubTaskCritique(null); setAiExplanation(null); setAnswer('');
      const nextTeaching = taskInstruction?.subTaskTeaching?.[subTaskIndex + 1];
      if (nextTeaching) speakTextRef.current(nextTeaching);
    }
  }, [subTaskIndex, taskInstruction]);

  const handleCompleteTopic = useCallback(async () => {
    if (topicIndex < TOPICS.length - 1) {
      const newIdx = topicIndex + 1;
      setTopicIndex(newIdx);
      await persistSession(answerHistory, newIdx);
    }
  }, [topicIndex, answerHistory, persistSession]);

  const handleJumpToTopic = useCallback((idx: number) => {
    setTopicIndex(idx);
  }, []);

  // ── Evaluate session ─────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    setShowEvaluation(true); setIsEvaluating(true); setEvalError(null);
    try {
      const res = await fetch('/api/ai900-evaluate-session', {
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
      else setEvalError('Could not generate evaluation. Your progress has still been saved.');
    } catch { setEvalError('Evaluation unavailable offline. Your answers have been saved.'); }
    finally { setIsEvaluating(false); }
  }, [answerHistory, topicIndex]);

  const handleCopyAnswer = useCallback(() => {
    if (aiExplanation) navigator.clipboard.writeText(aiExplanation);
  }, [aiExplanation]);

  // ── Derived state ────────────────────────────────────────────────────
  const isOnboarding = currentTopic?.isOnboarding && currentTopic?.id === 'intro_ai900';
  const maxSubTask   = (taskInstruction?.subTasks?.length ?? 1) - 1;
  const progressPct  = Math.round((topicIndex / (TOPICS.length - 1)) * 100);

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
                <FolderOpen size={18} className="text-blue-400" /> Your AI-900 Sessions
              </h2>
              <button onClick={() => setShowSessionPicker(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {sessions.map(s => (
                <button key={s.ai900_session_id} onClick={() => loadSession(s)}
                  className="w-full text-left p-3 bg-gray-700/40 hover:bg-gray-700 border border-gray-600 hover:border-blue-500/40 rounded-xl transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.ai900_session_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Topic {(s.ai900_evaluation as any)?.topicIndex ?? 0}/{TOPICS.length} · {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <button onClick={e => handleDeleteSession(e, s.ai900_session_id)}
                      disabled={deletingSessionId === s.ai900_session_id}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded transition-colors flex-shrink-0">
                      {deletingSessionId === s.ai900_session_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 pb-4 flex-shrink-0">
              <button onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
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
                  <BarChart3 size={20} className="text-blue-400" /> Session Evaluation
                </h2>
                <button onClick={() => setShowEvaluation(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isEvaluating && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 size={36} className="animate-spin text-blue-400 mb-3" />
                    <p className="text-gray-300 font-medium">Evaluating your AI-900 readiness…</p>
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
                      <div className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">🎓 Exam Readiness Assessment</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{evaluation.exam_readiness}</p>
                      </div>
                    )}
                    {evaluation.detailed_scores && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Domain Breakdown</p>
                        {Object.entries(evaluation.detailed_scores as Record<string, { score: number; justification: string }>).map(([skill, data]) => (
                          <details key={skill} className="group border border-gray-700 rounded-lg overflow-hidden">
                            <summary className="flex items-center gap-3 px-3 py-2 bg-gray-700/30 hover:bg-gray-700/50 cursor-pointer list-none">
                              <span className={`text-sm font-black w-5 text-right flex-shrink-0 ${scoreColor(data.score)}`}>{data.score}</span>
                              <span className="text-[11px] text-gray-300 flex-1">{skillLabel(skill)}</span>
                              <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
                                <div className={`h-full rounded-full ${data.score >= 2 ? 'bg-blue-500' : data.score >= 1 ? 'bg-amber-500' : 'bg-red-500'}`}
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

      {/* ═══ Main layout: left sidebar + right content ═══ */}
      <main className="flex flex-1 min-h-0 overflow-hidden">

        {/* ─── LEFT: Topic list + session controls ─── */}
        <div className="w-56 flex-shrink-0 bg-gray-800/60 border-r border-gray-700 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-3 py-2.5 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Brain size={14} className="text-blue-400" />
              <span className="text-xs font-bold text-white truncate">AI-900 Prep</span>
              <button onClick={() => setVoiceOutputEnabled(v => !v)} title="Toggle voice"
                className={`ml-auto p-1 rounded transition-colors ${voiceOutputEnabled ? 'text-blue-400 hover:text-blue-300' : 'text-gray-600 hover:text-gray-400'}`}>
                {voiceOutputEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              </button>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-[9px] text-gray-500">{progressPct}% complete · {topicIndex}/{TOPICS.length} topics</p>
          </div>

          {/* Topic stepper */}
          <div className="flex-1 overflow-hidden">
            <TopicStepper topics={TOPICS} topicIndex={topicIndex} onJump={handleJumpToTopic} />
          </div>

          {/* Session controls */}
          <div className="px-3 py-3 border-t border-gray-700 space-y-1.5 flex-shrink-0">
            <button onClick={() => setShowSessionPicker(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors">
              <FolderOpen size={11} /> Sessions
            </button>
            <button onClick={handleEvaluate} disabled={answerHistory.length < 3}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <BarChart3 size={11} /> Evaluate Readiness
            </button>
          </div>
        </div>

        {/* ─── RIGHT: Instruction + answer panel ─── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ─── CONTENT panel ─── */}
          <div className="w-80 flex-shrink-0 border-r border-gray-700 flex flex-col overflow-hidden bg-gray-800/40">

            {/* Domain badge */}
            {!isOnboarding && currentTopic && (
              <div className={`flex items-center gap-2 px-4 py-2 ${dm.bg} border-b ${dm.border} flex-shrink-0`}>
                <span className={dm.color}>{dm.icon}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${dm.color}`}>{dm.label}</span>
                {currentTopic.weight && (
                  <span className="ml-auto text-[10px] text-gray-500">{currentTopic.weight}</span>
                )}
              </div>
            )}

            {/* Onboarding or instruction content */}
            {isOnboarding ? (
              <AI900Onboarding onComplete={handleCompleteTopic} />
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Topic headline */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                    Topic {topicIndex}/{TOPICS.length - 1}
                  </p>
                  <h2 className="text-sm font-bold text-white">{currentTopic?.label}</h2>
                </div>

                {/* Loading */}
                {loadingInstruction && (
                  <div className="flex items-center gap-2 p-3 bg-gray-800/60 rounded-xl">
                    <Loader2 size={14} className="animate-spin text-blue-400" />
                    <span className="text-xs text-gray-400">Loading topic…</span>
                  </div>
                )}

                {/* Teaching moment */}
                {taskInstruction && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/25 rounded-xl">
                    <p className="text-[10px] font-bold text-blue-400 uppercase mb-1.5 flex items-center gap-1">
                      <BookOpen size={10} /> Teaching Point {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                    </p>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {taskInstruction.subTaskTeaching?.[subTaskIndex]}
                    </p>
                  </div>
                )}

                {/* Azure service reference */}
                {currentTopic && <ServiceReferencePanel topic={currentTopic} />}

                {/* Exam tip */}
                {currentTopic && <ExamTipCard topicId={currentTopic.id} />}

                {/* Answer history for this topic */}
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

          {/* ─── ANSWER panel ─── */}
          {!isOnboarding && (
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Question display */}
              <div className="flex-shrink-0 px-5 py-4 border-b border-gray-700 bg-gray-800/30">
                {loadingInstruction ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-blue-400" />
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

              {/* Scrollable middle: feedback + explanation */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

                {/* AI explanation after submission */}
                {aiExplanation && (
                  <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1">
                        <Brain size={10} /> AI Coach Response
                      </p>
                      <button onClick={handleCopyAnswer} className="text-gray-600 hover:text-gray-300 transition-colors">
                        <Copy size={11} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{aiExplanation}</p>
                  </div>
                )}

                {/* Sub-task critique */}
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

                {/* Error */}
                {errorMsg && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" />
                    <p className="text-xs text-red-300">{errorMsg}</p>
                  </div>
                )}

                {/* Answer textarea */}
                <div>
                  <textarea
                    ref={answerRef} value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
                    placeholder={taskInstruction?.subTasks[subTaskIndex]?.replace(/^[^:]+:\s*/, '').substring(0, 80) + '…' || 'Type your answer here…'}
                    style={{ minHeight: '140px' }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-blue-500 transition-colors leading-relaxed"
                  />
                  <p className="text-[9px] text-gray-700 mt-1">Ctrl+Enter to submit</p>
                </div>
              </div>

              {/* Fixed bottom buttons */}
              <div className="flex-shrink-0 px-5 pb-5 space-y-2">
                <div className="flex gap-2">
                  {/* Submit answer */}
                  <button onClick={handleSubmit} disabled={isSubmitting || !answer.trim() || !taskInstruction}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-40">
                    {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpCircle size={18} />}
                    {isSubmitting && <span className="text-sm">Evaluating…</span>}
                  </button>
                  {/* Get a hint */}
                  <button onClick={handleCritique} disabled={isCritiquing || !answer.trim()}
                    title="Get a hint before submitting"
                    className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors disabled:opacity-40">
                    {isCritiquing ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                  </button>
                </div>

                {/* Move to next question within topic */}
                {topicHasAnswer && subTaskIndex < maxSubTask && (
                  <button onClick={handleMoveToNextSubTask}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition-all">
                    <SkipForward size={13} /> Next Question
                  </button>
                )}

                {/* Complete topic and advance */}
                {topicHasAnswer && subTaskIndex >= maxSubTask && (!subTaskCritique || !subTaskCritique.hasSuggestions) && topicIndex < TOPICS.length - 1 && (
                  <button onClick={handleCompleteTopic}
                    className={`w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border transition-all ${dm.bg} ${dm.color} ${dm.border} hover:opacity-90`}>
                    <CheckCircle size={13} /> Complete Topic & Continue <ArrowRight size={13} />
                  </button>
                )}

                {/* Complete anyway (with unresolved suggestions) */}
                {topicHasAnswer && subTaskIndex >= maxSubTask && subTaskCritique?.hasSuggestions && topicIndex < TOPICS.length - 1 && (
                  <button onClick={handleCompleteTopic}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-all">
                    <CheckCircle size={13} /> Continue anyway <ArrowRight size={13} />
                  </button>
                )}

                {/* Finished all topics */}
                {topicIndex >= TOPICS.length - 1 && topicHasAnswer && (
                  <button onClick={handleEvaluate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transition-all">
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

export default MicrosoftAI900Page;