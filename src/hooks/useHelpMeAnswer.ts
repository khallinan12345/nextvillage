// src/hooks/useHelpMeAnswer.ts
// Reusable hook for the "Help Me Answer" conversational AI assistant.
//
// Used by any learning page that has a sub-task question pattern:
//   teaching commentary → question → learner response
//
// The hook owns all state and API logic. The companion <HelpMeAnswerPopup>
// component is purely presentational — it receives the hook's return values.
//
// Usage:
//   const helpMe = useHelpMeAnswer({
//     question, teaching, taskLabel, taskContext, sessionContext,
//     chatPage,            // routes /api/chat to the right model
//     systemPromptPreset,  // 'web-dev' | 'community-impact' | 'ai-skills' | 'custom'
//     customSystemPrompt,  // override for fully custom pages
//   });
//   <HelpMeAnswerPopup {...helpMe} onUseDraft={draft => setPrompt(draft)} />

import React, { useState, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HelpMeAnswerMessage {
  role: 'assistant' | 'user';
  text: string;
}

export type SystemPromptPreset =
  | 'web-dev'          // Explains technical web terms with real-world analogies
  | 'community-impact' // Reflective, community-centred questions
  | 'ai-skills'        // AI concepts, tools, enterprise use cases
  | 'custom';          // Use customSystemPrompt directly

export interface UseHelpMeAnswerOptions {
  /** The current sub-task question the learner is answering */
  question: string;
  /** The teaching commentary that preceded the question */
  teaching: string;
  /** Label of the current task (e.g. "Deploy Preparation") */
  taskLabel: string;
  /** Optional broader context string (phase label, task ID, etc.) */
  taskContext?: string;
  /** Session/site context object — serialised into the system prompt */
  sessionContext?: Record<string, any>;
  /**
   * The `page` value sent to /api/chat — determines model routing.
   * 'WebDevelopmentPage' → Sonnet (code-capable).
   * Any GROQ_PAGES value → Llama (free tier).
   * Defaults to 'WebDevelopmentPage' (Sonnet) for all learning pages.
   */
  chatPage?: string;
  /** Which built-in system prompt style to use */
  systemPromptPreset?: SystemPromptPreset;
  /** Full system prompt override — only used when preset is 'custom' */
  customSystemPrompt?: string;
  /** Learner's grade level (1=Elementary, 2=Middle School, 3=High School, 4=Adult Learner) — tailors language complexity */
  gradeLevel?: number | null;
}

export interface UseHelpMeAnswerReturn {
  // State
  isOpen: boolean;
  messages: HelpMeAnswerMessage[];
  inputValue: string;
  isLoading: boolean;
  draft: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  // Passed-through context (for popup header display)
  question: string;
  taskLabel: string;
  taskContext?: string;
  // Actions
  open: () => void;
  close: () => void;
  setInputValue: (v: string) => void;
  sendMessage: () => Promise<void>;
  requestDraft: () => void;
  useDraft: (onDraft: (draft: string) => void) => void;
}

// ─── Built-in system prompt presets ──────────────────────────────────────────

// Grade level scale: 1=Elementary, 2=Middle School, 3=High School, 4=Adult Learner (18+)
function gradeGuidance(gradeLevel?: number | null): string {
  switch (gradeLevel) {
    case 1: return 'The learner is in elementary school (grades 3-5, ages 8-11). Use very simple words and short sentences. Be extra encouraging.';
    case 2: return 'The learner is in middle school (grades 6-8, ages 11-14). Use clear, age-appropriate language.';
    case 3: return 'The learner is in high school (grades 9-12, ages 14-18). You can use more sophisticated language.';
    case 4: return 'The learner is an adult (18+). Use clear, professional language — treat them as a capable adult, not a classroom student.';
    default: return '';
  }
}

function buildSystemPrompt(
  preset: SystemPromptPreset,
  question: string,
  teaching: string,
  taskLabel: string,
  sessionContext: Record<string, any>,
  customSystemPrompt?: string,
  gradeLevel?: number | null,
): string {
  const ctx = Object.keys(sessionContext).length > 0
    ? `\nLearner context: ${JSON.stringify(sessionContext)}`
    : '';
  const grade = gradeGuidance(gradeLevel);

  if (preset === 'custom' && customSystemPrompt) return customSystemPrompt;

  const shared = `
They are answering this question: "${question}"
Background concept: ${teaching}
Task: ${taskLabel}${ctx}
${grade ? `\n${grade}` : ''}

Your job:
- Explain things in plain, simple language — no jargon
- When they ask about technical terms, explain with a real-world analogy
- When they ask for options, give 3-4 concrete, specific choices they can pick from
- Ask which option they prefer so you can build a complete answer for them
- When you have enough information, end your message with: READY_TO_DRAFT
- Keep replies short — 3-6 sentences maximum
- Never use bullet points or markdown — plain conversational sentences only`;

  const personas: Record<SystemPromptPreset, string> = {
    'web-dev': `You are a friendly helper for a first-generation digital learner building their first website.
When they ask about technical terms (like 'hamburger menu', 'hex color', 'font stack', 'route', 'component'), explain with a real-world analogy before offering options.${shared}`,

    'community-impact': `You are a warm, encouraging mentor helping a learner reflect on their community, their goals, and the impact of their work.
Avoid technical jargon entirely. Ask questions that help them find their own words. Use examples from community life — farming, fishing, market days, school, local enterprise — where relevant.${shared}`,

    'ai-skills': `You are a practical AI literacy coach helping a first-generation digital learner understand AI concepts and tools.
When they ask about AI terms (like 'model', 'prompt', 'training data', 'inference', 'API'), explain with everyday analogies. Help them think about how AI applies to their own community and work.${shared}`,

    'custom': shared, // fallback — should be overridden by customSystemPrompt
  };

  return personas[preset] ?? personas['web-dev'];
}

function buildDraftSystemPrompt(
  question: string,
  teaching: string,
  taskLabel: string,
  sessionContext: Record<string, any>,
): string {
  const ctx = Object.keys(sessionContext).length > 0
    ? `\nLearner context: ${JSON.stringify(sessionContext)}`
    : '';

  return `Based on the conversation below, write a complete, natural answer the learner can submit.
The question they are answering: "${question}"
Task context: ${taskLabel} — ${teaching}${ctx}
Write 2-4 sentences in first person, as if the learner is writing it themselves.
Be specific — use the exact choices and details from the conversation.
No jargon. Plain English. No bullet points. Just a direct, complete answer.`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHelpMeAnswer({
  question,
  teaching,
  taskLabel,
  taskContext,
  sessionContext = {},
  chatPage = 'WebDevelopmentPage',
  systemPromptPreset = 'web-dev',
  customSystemPrompt,
  gradeLevel = null,
}: UseHelpMeAnswerOptions): UseHelpMeAnswerReturn {

  const [isOpen, setIsOpen]       = useState(false);
  const [messages, setMessages]   = useState<HelpMeAnswerMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [draft, setDraft]         = useState<string | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  // ── open ──────────────────────────────────────────────────────────────────
  const open = useCallback(() => {
    const opening =
      `Let me help you answer this question about ${taskLabel}.\n\n` +
      `The question is asking: "${question}"\n\n` +
      `Here is what to think about: ${teaching}\n\n` +
      `What would you like me to explain? You can ask what specific terms mean, ` +
      `ask for options to choose from, or just say "give me some options" and ` +
      `I will walk you through the choices.`;
    setMessages([{ role: 'assistant', text: opening }]);
    setInputValue('');
    setDraft(null);
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [question, teaching, taskLabel]);

  const close = useCallback(() => setIsOpen(false), []);

  // ── generateDraft ─────────────────────────────────────────────────────────
  const generateDraft = useCallback(async (
    history: HelpMeAnswerMessage[],
  ) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page:       chatPage,
          max_tokens: 400,
          system:     buildDraftSystemPrompt(question, teaching, taskLabel, sessionContext),
          messages: [
            ...history.map(m => ({ role: m.role, content: m.text })),
            { role: 'user', content: 'Now write my complete answer that I can submit.' },
          ],
        }),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      if (text) setDraft(text);
    } catch { /* silent — user can trigger manually */ }
  }, [question, teaching, taskLabel, sessionContext, chatPage]);

  // ── sendMessage ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const newMessages: HelpMeAnswerMessage[] = [
      ...messages,
      { role: 'user', text },
    ];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page:       chatPage,
          max_tokens: 800,
          system:     buildSystemPrompt(
            systemPromptPreset, question, teaching, taskLabel,
            sessionContext, customSystemPrompt, gradeLevel,
          ),
          messages: newMessages.map(m => ({ role: m.role, content: m.text })),
        }),
      });

      const data  = await res.json();
      const reply = data.choices?.[0]?.message?.content
        ?? 'Sorry, I could not get a response. Please try again.';
      const isReady    = reply.includes('READY_TO_DRAFT');
      const cleanReply = reply.replace('READY_TO_DRAFT', '').trim();
      const withReply: HelpMeAnswerMessage[] = [
        ...newMessages,
        { role: 'assistant', text: cleanReply },
      ];
      setMessages(withReply);
      if (isReady) await generateDraft(withReply);
    } catch {
      setMessages((prev: HelpMeAnswerMessage[]) => [
        ...prev,
        { role: 'assistant', text: 'Sorry, something went wrong. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [
    inputValue, isLoading, messages, chatPage,
    systemPromptPreset, question, teaching, taskLabel,
    sessionContext, customSystemPrompt, gradeLevel, generateDraft,
  ]);

  // ── requestDraft ──────────────────────────────────────────────────────────
  const requestDraft = useCallback(() => {
    generateDraft(messages);
  }, [messages, generateDraft]);

  // ── useDraft ──────────────────────────────────────────────────────────────
  const useDraft = useCallback((onDraft: (draft: string) => void) => {
    if (draft) {
      onDraft(draft);
      setIsOpen(false);
    }
  }, [draft]);

  return {
    isOpen, messages, inputValue, isLoading, draft, inputRef,
    question, taskLabel, taskContext,
    open, close, setInputValue, sendMessage, requestDraft, useDraft,
  };
}
