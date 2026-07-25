// src/pages/tech-skills/VibeCodingPage.tsx
//
// Standalone Vibe Coding page — accessible at /tech-skills/vibe-coding
// Two-column layout:
//   LEFT  — AI design coach chat: "Start Here — Work with AI to Design Your Vibe Coding Prompt"
//   RIGHT — VibeCodingWorkflow (phases 1–4)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON, ChatMessage as ClientChatMessage } from '../../lib/chatClient';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import { VibeCodingWorkflow } from '../../components/learning/VibeCodingWorkflow';
import { useAuth } from '../../hooks/useAuth';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { AIPidginCoachWrapper } from '../../components/AIPidginCoachWrapper';
import { PidginTooltip } from '../../components/PidginTooltip';
import {
  Bot, User, Send, Mic, Wand2, Save, CheckCircle,
  Volume2, VolumeX, Code, FolderOpen, Plus, X, ChevronDown, Edit3, Check,
} from 'lucide-react';
import classNames from 'classnames';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

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

// ── Session type ──────────────────────────────────────────────────────────────

interface VibeSession {
  id: string;
  user_id: string;
  name: string;
  chat_history: ChatMessage[];
  vibe_prompt: string | null;
  created_at: string;
  updated_at: string;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const rendered = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>')
    .replace(/\n/g, '<br/>');
  return <span dangerouslySetInnerHTML={{ __html: rendered }} />;
};

// ── Code execution service ────────────────────────────────────────────────────

interface CodeExecution {
  id: string;
  code: string;
  language: 'python' | 'javascript' | 'html';
  output?: string;
  error?: string;
  executionTime?: number;
}

class CodeExecutionService {
  private static apiUrl = '/api/execute-code';

  static async executeCode(code: string, language: 'python' | 'javascript' | 'html'): Promise<CodeExecution> {
    const executionId = Date.now().toString();
    if (language === 'html') {
      return { id: executionId, code, language, output: 'HTML ready — use Open as Web Page', executionTime: 0 };
    }
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const result = await response.json();
      return { id: executionId, code, language, output: result.output, error: result.error, executionTime: result.executionTime };
    } catch (error: any) {
      return { id: executionId, code, language, error: `Execution failed: ${error.message}` };
    }
  }
}

// Grade-level language guidance for the design coach, layered on top of communication level.
function getGradeGuidance(gradeLevel: number | null): string {
  switch (gradeLevel) {
    case 1: return 'GRADE LEVEL: Elementary (Grades 3-5, Ages 8-11). Use very simple words and short sentences. Relate ideas to games, school, family, or pets. Be extra encouraging.';
    case 2: return 'GRADE LEVEL: Middle School (Grades 6-8, Ages 11-14). Use clear, age-appropriate language. Relate ideas to school life, friends, and technology they already use.';
    case 3: return 'GRADE LEVEL: High School (Grades 9-12, Ages 14-18). You can use more sophisticated language. Relate ideas to real-world projects, college, or career interests.';
    case 4: return 'GRADE LEVEL: Adult Learner (18+). Use clear, professional language — treat them as a capable adult, not a student. Relate ideas to real-world and work applications.';
    default: return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const VibeCodingPage: React.FC = () => {
  const { user } = useAuth();

  // ── Profile & personality ──────────────────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);
  const [userGradeLevel, setUserGradeLevel] = useState<number | null>(null);
  const [personalityBaseline, setPersonalityBaseline] = useState<PersonalityBaseline>({
    communicationStrategy: null,
    learningStrategy: null,
  });

  // ── Voice ─────────────────────────────────────────────────────────────────
  const [voiceMode, setVoiceMode]           = useState<'english' | 'pidgin'>('english');
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [voiceInputEnabled, setVoiceInputEnabled]   = useState(false);
  const [isListening, setIsListening]       = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<any>(null);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    selectedVoice,
    recognitionLang,
  } = useVoice(voiceMode === 'pidgin');

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [chatHistory, setChatHistory]       = useState<ChatMessage[]>([]);
  const [userInput, setUserInput]           = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [savingSession, setSavingSession]   = useState(false);
  const [aiFacilitatorInstructions, setAiFacilitatorInstructions] = useState('');
  const chatContainerRef                    = useRef<HTMLDivElement>(null);

  // ── Session state ──────────────────────────────────────────────────────────
  const [sessions, setSessions]             = useState<VibeSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions]   = useState(false);
  const [showSessionBar, setShowSessionBar]     = useState(false);
  const [showNameModal, setShowNameModal]       = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  // ── Vibe Coding Prompt injection ───────────────────────────────────────────
  const [vibeCodingInjectedPrompt, setVibeCodingInjectedPrompt]         = useState<string | null>(null);
  const [generatingVibePromptFromChat, setGeneratingVibePromptFromChat] = useState(false);

  // ── Improve my English ─────────────────────────────────────────────────────
  const [isImproving, setIsImproving] = useState(false);

  // ── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    // Continent → voice mode, grade level → tailored language
    supabase.from('profiles').select('continent, grade_level, country').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.country) setVoiceMode(data.country === 'Nigeria' ? 'pidgin' : 'english');
        if (data?.grade_level) setUserGradeLevel(data.grade_level);
      });

    // Personality baseline + communication level
    supabase.from('user_personality_baseline')
      .select('communication_strategy, learning_strategy, communication_level')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPersonalityBaseline({
            communicationStrategy: data.communication_strategy || null,
            learningStrategy: data.learning_strategy || null,
          });
          if (data.communication_level != null) setCommunicationLevel(data.communication_level);
        }
      });
  }, [user?.id]);

  // ── Fetch past sessions ───────────────────────────────────────────────────
  const fetchSessions = async () => {
    if (!user?.id) return;
    setLoadingSessions(true);
    try {
      const { data } = await supabase
        .from('vibe_coding_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      setSessions(data ?? []);
    } catch (err) { console.error('[VibeCoding] fetch sessions error:', err); }
    finally { setLoadingSessions(false); }
  };

  useEffect(() => { fetchSessions(); }, [user?.id]);

  const loadSession = (session: VibeSession) => {
    setChatHistory(session.chat_history.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    })));
    setCurrentSessionId(session.id);
    if (session.vibe_prompt) setVibeCodingInjectedPrompt(session.vibe_prompt);
    setShowSessionBar(false);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase.from('vibe_coding_sessions').delete().eq('id', id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setChatHistory([]);
      }
    } catch (err) { console.error('[VibeCoding] delete session error:', err); }
  };

  const startRenameSession = (session: VibeSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingNameValue(session.name);
  };

  const saveRenameSession = async (id: string) => {
    if (!editingNameValue.trim()) return;
    try {
      await supabase.from('vibe_coding_sessions').update({ name: editingNameValue.trim() }).eq('id', id);
      setSessions(prev => prev.map(s => s.id === id ? { ...s, name: editingNameValue.trim() } : s));
    } catch (err) { console.error('[VibeCoding] rename error:', err); }
    finally { setEditingSessionId(null); }
  };

  // ── Welcome message + facilitator prompt ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const lvl = communicationLevel;
    const gradeGuidance = getGradeGuidance(userGradeLevel);
    const facilitator = `You are an AI vibe coding design coach. Your job is to help the student define what they want to build BEFORE they write any code.

Ask them questions about:
- What problem they want to solve or what they want to create
- Who will use it and what it should do
- What technology they want to use (HTML/web page, Python, JavaScript)
- Any specific features, design preferences, or constraints

Keep questions short and focused. One question at a time.
Communication level: ${lvl} (0=very basic, 3=proficient). Adjust your language accordingly.
${lvl <= 1 ? 'Use simple, short sentences. Celebrate effort.' : ''}
${gradeGuidance}

When they have a clear enough idea, encourage them to click "Create Vibe Coding Prompt from Design" below to capture it as a structured prompt.`;

    setAiFacilitatorInstructions(facilitator);

    const welcome: ChatMessage = {
      role: 'assistant',
      content: lvl <= 1
        ? `Hello! 👋 I am your coding coach. I will help you plan what to build.\n\nTell me — what do you want your code to do?`
        : `Welcome to Vibe Coding! 🎵\n\nBefore writing any code, let's design your idea together. Tell me — what do you want to build? Describe the problem you want to solve or the project you have in mind.`,
      timestamp: new Date(),
    };
    setChatHistory([welcome]);
  }, [user?.id, communicationLevel, userGradeLevel]);

  // ── Auto-scroll chat ───────────────────────────────────────────────────────
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // ── Speech recognition ─────────────────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = recognitionLang;
    recognition.onstart  = () => setIsListening(true);
    recognition.onend    = () => setIsListening(false);
    recognition.onerror  = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
      }
      if (final) setUserInput(prev => prev + final);
    };
    setSpeechRecognition(recognition);
  }, [recognitionLang]);

  const toggleVoiceInput = () => {
    if (!speechRecognition) { alert('Voice input not supported in your browser. Use Chrome or Edge.'); return; }
    if (isListening) { speechRecognition.stop(); } else { try { speechRecognition.start(); } catch {} }
  };

  const toggleVoiceOutput = () => {
    if (voiceOutputEnabled) cancelSpeech();
    setVoiceOutputEnabled(prev => !prev);
  };

  // ── Send message to design coach ──────────────────────────────────────────
  const handleSubmitMessage = async () => {
    if (!userInput.trim() || submitting) return;

    const userMsg: ChatMessage = { role: 'user', content: userInput.trim(), timestamp: new Date() };
    const updated = [...chatHistory, userMsg];
    setChatHistory(updated);
    setUserInput('');
    setSubmitting(true);

    try {
      const messages: ClientChatMessage[] = [
        ...chatHistory.slice(1).map(m => ({
          role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: m.content,
        })),
        { role: 'user', content: userInput.trim() },
      ];

      const response = await chatText({ page: 'VibeCodingPage',
        model: 'claude-sonnet-4-6',
        messages,
        system: aiFacilitatorInstructions,
        max_tokens: 400,
        temperature: 0.7,
      });

      const aiMsg: ChatMessage = { role: 'assistant', content: response, timestamp: new Date() };
      const final = [...updated, aiMsg];
      setChatHistory(final);
      if (voiceOutputEnabled) hookSpeak(response.slice(0, 300));
    } catch (err) {
      const errMsg: ChatMessage = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date() };
      setChatHistory(prev => [...prev, errMsg]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitMessage(); }
  };

  // ── Improve my English ─────────────────────────────────────────────────────
  const handleImproveEnglish = async () => {
    if (!userInput.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const improved = await chatText({ page: 'VibeCodingPage',
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: `Improve the English grammar and clarity of this text. Keep the same meaning and voice. Return only the improved text:\n\n"${userInput}"` }],
        system: 'You are an English writing assistant. Return only the improved text, nothing else.',
        max_tokens: 200,
        temperature: 0.3,
      });
      setUserInput(improved.trim().replace(/^["']|["']$/g, ''));
    } catch {} finally { setIsImproving(false); }
  };

  // ── Save session ───────────────────────────────────────────────────────────
  const handleSaveSession = () => {
    if (!user?.id || chatHistory.length <= 1) return;
    // Pre-fill name if resuming an existing session
    const existing = sessions.find(s => s.id === currentSessionId);
    setSessionNameInput(existing?.name ?? '');
    setShowNameModal(true);
  };

  const commitSaveSession = async () => {
    const name = sessionNameInput.trim();
    if (!name || !user?.id) return;
    setSavingSession(true);
    setShowNameModal(false);
    try {
      const payload = {
        user_id: user.id,
        name,
        chat_history: chatHistory,
        vibe_prompt: vibeCodingInjectedPrompt ?? null,
        updated_at: new Date().toISOString(),
      };
      if (currentSessionId) {
        // Update existing
        const { error } = await supabase.from('vibe_coding_sessions')
          .update(payload)
          .eq('id', currentSessionId);
        if (!error) {
          setSessions(prev => prev.map(s => s.id === currentSessionId
            ? { ...s, ...payload } : s));
        }
      } else {
        // Insert new
        const { data, error } = await supabase.from('vibe_coding_sessions')
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select().single();
        if (!error && data) {
          setCurrentSessionId(data.id);
          setSessions(prev => [data, ...prev]);
        }
      }
    } catch (err) { console.error('[VibeCoding] save session error:', err); }
    finally { setSavingSession(false); }
  };

  // ── Create Vibe Coding Prompt from chat ────────────────────────────────────
  const handleCreateVibePromptFromChat = async () => {
    if (chatHistory.length < 2) return;
    setGeneratingVibePromptFromChat(true);
    try {
      const conversation = chatHistory.slice(-10)
        .map(m => `${m.role === 'assistant' ? 'Coach' : 'Student'}: ${m.content}`)
        .join('\n\n');

      const prompt = await chatText({ page: 'VibeCodingPage',
        model: 'claude-sonnet-4-6',
        messages: [{
          role: 'user',
          content: `A student has been working with an AI coding coach to design a coding project. Based on the conversation below, write a clear, complete VIBE CODING PROMPT that captures exactly what they want to build.

The prompt should:
- Start with "Build me a..." or "Create a..."
- Specify the technology (HTML/CSS/JS, Python, etc.)
- Describe all features and behaviours discussed
- Include design preferences (colours, layout, style) mentioned
- Be specific enough that any AI coding tool can start building immediately

CONVERSATION:
${conversation}

Write ONLY the vibe coding prompt — no explanation, no preamble. Make it specific and complete.`,
        }],
        system: 'You write precise, complete vibe coding prompts. Output only the prompt itself.',
        max_tokens: 600,
        temperature: 0.4,
      });

      setVibeCodingInjectedPrompt(prompt.trim());
    } catch (err) {
      console.error('[Vibe Coding] Failed to generate prompt from chat:', err);
    } finally {
      setGeneratingVibePromptFromChat(false);
    }
  };

  // ── VibeCodingWorkflow handlers ────────────────────────────────────────────
  const handleExecuteCode = async (code: string, language: 'python' | 'javascript' | 'html') => {
    const execution = await CodeExecutionService.executeCode(code, language);
    return { output: execution.output, error: execution.error, executionTime: execution.executionTime };
  };

  const handleGetInstructionCritique = async (instructions: string) => {
    const critiquePrompt = `You are evaluating a student's Vibe Coding instructions BEFORE generating code.

STUDENT'S INSTRUCTIONS:
${instructions}

TASK: Evaluate these instructions using ONLY these two rubric dimensions:

1. **Problem Decomposition** (0-3):
   - 0: No breakdown of steps, inputs, or outputs
   - 1: Names components but lacks sequencing or rationale
   - 2: Explicitly decomposes into ordered steps with inputs/outputs
   - 3: Decomposes, prioritizes, identifies edge cases

2. **Prompt Engineering** (0-3):
   - 0: Vague, copied, or irrelevant
   - 1: Specifies goal but omits constraints, context, or success criteria
   - 2: Clearly specifies task, constraints, inputs, expected format
   - 3: Anticipates failure modes, requests alternatives

Respond with ONLY valid JSON:
{
  "problemDecomposition": {
    "score": <0-3>,
    "evidence": "<specific quote or observation>",
    "improvement": "<one specific suggestion>"
  },
  "promptEngineering": {
    "score": <0-3>,
    "evidence": "<specific quote or observation>",
    "improvement": "<one specific suggestion>"
  },
  "recommendation": "<Should they improve (if scores <2) or proceed (if scores >=2)? One sentence.>"
}`;

    const result = await chatJSON({ page: 'VibeCodingPage',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: critiquePrompt }],
      system: 'You are an expert at evaluating coding instructions. Respond only with valid JSON.',
      max_tokens: 800,
      temperature: 0.3,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  };

  const handleGenerateCodeFromInstructions = async (instructions: string, language: 'python' | 'javascript' | 'html') => {
    const isHTML = language === 'html';
    const prompt = isHTML
      ? `Generate a complete, self-contained HTML file based on these instructions:\n\n${instructions}\n\nREQUIREMENTS:\n- Single HTML file with embedded CSS and JavaScript\n- Mobile-friendly, works in any browser\n- No external dependencies except CDN libraries if needed\n- Clean, well-commented code\n\nRespond with ONLY the complete HTML file, no explanations or markdown formatting.`
      : `Generate ${language} code based on these instructions:\n\n${instructions}\n\nREQUIREMENTS:\n- Write clean, well-commented code\n- Include error handling where appropriate\n- Make it executable and testable\n- Keep it simple and readable\n\nRespond with ONLY the code, no explanations or markdown formatting.`;

    const code = await chatText({ page: 'VibeCodingPage',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: prompt }],
      system: isHTML
        ? 'You are a web developer. Generate ONLY a complete HTML file with no markdown backticks or explanations.'
        : `You are a code generator. Generate ONLY executable ${language} code with no markdown backticks or explanations.`,
      max_tokens: 2500,
      temperature: 0.5,
    });

    return code.trim()
      .replace(/^```(?:html|python|javascript|js)?\n/i, '')
      .replace(/\n```$/i, '');
  };

  const handleGetDebuggingHelp = async (code: string, error: string, instructions: string) => {
    const advice = await chatText({ page: 'VibeCodingPage',
      model: 'claude-sonnet-4-6',
      messages: [{
        role: 'user',
        content: `A student's code produced an error. Help them understand and fix it.\n\nORIGINAL INSTRUCTIONS:\n${instructions}\n\nGENERATED CODE:\n\`\`\`\n${code}\n\`\`\`\n\nERROR:\n${error}\n\nTASK: Provide debugging help that teaches, not just fixes:\n1. Explain what the error means in simple terms\n2. Identify which part of the instructions might have caused this\n3. Suggest how to improve the instructions to prevent this error\n4. Give ONE specific fix they can try\n\nKeep it concise and educational.`,
      }],
      system: "You are a patient coding tutor. Help students learn from errors, don't just fix things for them.",
      max_tokens: 600,
      temperature: 0.7,
    });
    return advice;
  };

  // ── New session ────────────────────────────────────────────────────────────
  const handleNewSession = () => {
    setCurrentSessionId(null);
    setChatHistory([]);
    setVibeCodingInjectedPrompt(null);
    setShowSessionBar(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      <div className="min-h-screen bg-gray-50">
        {/* ── Name Modal ───────────────────────────────────────────────────── */}
        {showNameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Name your session</h3>
              <p className="text-sm text-gray-500 mb-4">Give this vibe coding session a memorable name so you can find it later.</p>
              <input
                autoFocus
                type="text"
                value={sessionNameInput}
                onChange={e => setSessionNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitSaveSession(); if (e.key === 'Escape') setShowNameModal(false); }}
                placeholder="e.g. Weather App, Quiz Game, Portfolio Site"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowNameModal(false)} className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={commitSaveSession} disabled={!sessionNameInput.trim()} className="flex-1 py-2 rounded-xl bg-purple-600 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-40">Save Session</button>
              </div>
            </div>
          </div>
        )}

        {/* Page header */}
        <div className="bg-gradient-to-r from-purple-700 to-pink-600 px-6 py-5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Code className="h-7 w-7 text-white flex-shrink-0" />
              <div>
                <h1 className="text-2xl font-bold text-white">Vibe Coding</h1>
                <p className="text-sm text-purple-100">Design your prompt, critique it, and generate code with AI</p>
                <div className="mt-2">
                  <PidginTooltip
                    originalText="Design your prompt, critique it, and generate code with AI"
                    hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                  />
                </div>
              </div>
              {/* Tutorial link */}
              <a
                href="https://youtu.be/JrYHTz-xDsY"
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
            {/* Session controls in header */}
            <div className="flex items-center gap-2">
              {currentSessionId && (
                <span className="hidden sm:block text-xs text-purple-200 truncate max-w-[160px]">
                  📁 {sessions.find(s => s.id === currentSessionId)?.name}
                </span>
              )}
              <button
                onClick={handleNewSession}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors"
              >
                <Plus size={14} /> New
              </button>
              <button
                onClick={() => setShowSessionBar(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors"
              >
                <FolderOpen size={14} />
                Sessions
                <ChevronDown size={13} className={showSessionBar ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Session Bar ──────────────────────────────────────────────────── */}
        {showSessionBar && (
          <div className="bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen size={15} className="text-purple-600" />
                <span className="text-sm font-semibold text-gray-700">Your Saved Sessions</span>
                {loadingSessions && <span className="text-xs text-gray-400 ml-1">Loading…</span>}
              </div>
              {sessions.length === 0 && !loadingSessions ? (
                <p className="text-sm text-gray-400 py-2">No saved sessions yet — start chatting and click Save.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sessions.map(session => (
                    <div
                      key={session.id}
                      onClick={() => loadSession(session)}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all text-sm ${
                        currentSessionId === session.id
                          ? 'bg-purple-50 border-purple-300 text-purple-800 font-semibold'
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-purple-50 hover:border-purple-200'
                      }`}
                    >
                      {editingSessionId === session.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editingNameValue}
                            onChange={e => setEditingNameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveRenameSession(session.id); if (e.key === 'Escape') setEditingSessionId(null); }}
                            className="text-xs border border-purple-300 rounded px-1.5 py-0.5 outline-none w-32"
                          />
                          <button onClick={() => saveRenameSession(session.id)} className="text-green-600 hover:text-green-700"><Check size={12} /></button>
                          <button onClick={() => setEditingSessionId(null)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                        </div>
                      ) : (
                        <>
                          <span className="truncate max-w-[140px]">{session.name}</span>
                          <span className="text-xs text-gray-400 hidden group-hover:inline">
                            {new Date(session.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={e => e.stopPropagation()}>
                            <button onClick={e => startRenameSession(session, e)} className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600" title="Rename"><Edit3 size={11} /></button>
                            <button onClick={e => handleDeleteSession(session.id, e)} className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="Delete"><X size={11} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* ── LEFT: AI Design Coach ──────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-md flex flex-col" style={{ height: '700px' }}>

              {/* Start Here header */}
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-4 rounded-t-xl flex-shrink-0">
                <p className="text-xs font-bold text-purple-200 uppercase tracking-wider mb-0.5">Start Here</p>
                <h3 className="text-base font-bold text-white leading-snug">
                  Work with AI to Design Your Vibe Coding Prompt
                </h3>
                <p className="text-xs text-purple-100 mt-1 leading-relaxed">
                  Describe your project idea to the coach. Ask questions, explore features, and refine your thinking. When you're ready, click <strong>Create Vibe Coding Prompt</strong> below to turn this conversation into a structured prompt — then move to the right column to generate your code.
                </p>
              </div>

              {/* Chat messages */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-5 space-y-4">
                {chatHistory.map((message, index) => (
                  <div
                    key={index}
                    className={classNames(
                      'flex items-start space-x-3',
                      message.role === 'assistant' ? 'justify-start' : 'justify-end'
                    )}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-purple-600" />
                      </div>
                    )}
                    <div className={classNames(
                      'max-w-sm rounded-lg px-4 py-3 text-sm',
                      message.role === 'assistant' ? 'bg-gray-100 text-gray-900' : 'bg-purple-600 text-white'
                    )}>
                      <MarkdownText text={message.content} />
                      {message.role === 'assistant' && <AIPidginCoachWrapper englishText={message.content} />}
                    </div>
                    {message.role === 'user' && (
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center">
                        <User className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                {submitting && (
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="bg-gray-100 rounded-lg px-4 py-3 flex space-x-1">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* VoiceFallback inline */}
              {fallbackText && (
                <div className="px-4 py-2">
                  <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
                </div>
              )}

              {/* Input area */}
              <div className="border-t p-4 flex-shrink-0 space-y-2">
                <p className="text-xs text-indigo-600 flex items-center gap-1">
                  <span>💡</span>
                  <span>Have a question? Just ask it — the AI will answer you directly.</span>
                </p>

                <div className="flex items-end space-x-2">
                  <div className="flex-1">
                    <textarea
                      value={userInput}
                      onChange={e => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe what you want to build..."
                      rows={2}
                      disabled={submitting}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <Button
                      onClick={toggleVoiceInput}
                      icon={<Mic size={15} className={isListening ? 'text-red-500' : ''} />}
                      variant={isListening ? 'danger' : 'secondary'}
                      size="sm"
                    >
                      {isListening ? 'Stop' : 'Voice'}
                    </Button>
                    <Button
                      onClick={handleSubmitMessage}
                      icon={<Send size={15} />}
                      disabled={!userInput.trim() || submitting}
                      isLoading={submitting}
                      size="sm"
                    >
                      Send
                    </Button>
                  </div>
                </div>

                {/* Create Vibe Coding Prompt from Design */}
                <Button
                  onClick={handleCreateVibePromptFromChat}
                  disabled={chatHistory.length < 2 || generatingVibePromptFromChat}
                  isLoading={generatingVibePromptFromChat}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white justify-center"
                  icon={<Wand2 size={15} />}
                >
                  {generatingVibePromptFromChat ? 'Creating Prompt…' : 'Create Vibe Coding Prompt from Design'}
                </Button>
                {chatHistory.length < 2 && (
                  <p className="text-xs text-gray-400 text-center">Chat with the AI first to design your project</p>
                )}
                {vibeCodingInjectedPrompt && (
                  <p className="text-xs text-emerald-600 text-center flex items-center justify-center gap-1">
                    <CheckCircle size={11} /> Prompt sent to the Vibe Coding panel →
                  </p>
                )}

                {/* Voice controls row */}
                <div className="flex items-center justify-between text-sm text-gray-600 pt-1">
                  <div className="flex items-center space-x-3">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={voiceOutputEnabled}
                        onChange={toggleVoiceOutput}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs">Voice Output</span>
                    </label>
                    {voiceOutputEnabled && (
                      <div className="flex rounded-lg overflow-hidden border border-gray-300">
                        {(['english', 'pidgin'] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => setVoiceMode(m)}
                            className={classNames(
                              'flex items-center gap-0.5 px-2 py-1 text-xs font-bold transition-all border-r border-gray-300 last:border-0',
                              voiceMode === m
                                ? m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                                : 'bg-white text-gray-500 hover:bg-gray-100'
                            )}
                          >
                            {m === 'english' ? '🇬🇧' : '🇳🇬'} {m === 'english' ? 'EN' : 'NG'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleImproveEnglish}
                      disabled={!userInput.trim() || isImproving}
                      className="bg-violet-500 hover:bg-violet-600 text-white"
                      size="sm"
                    >
                      {isImproving ? 'Improving…' : <><Wand2 size={13} /> Improve English</>}
                    </Button>
                    <Button
                      onClick={handleSaveSession}
                      icon={<Save size={14} />}
                      disabled={chatHistory.length <= 1 || savingSession}
                      isLoading={savingSession}
                      variant="secondary"
                      size="sm"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Vibe Coding Workflow ────────────────────────────────── */}
            <VibeCodingWorkflow
              onExecuteCode={handleExecuteCode}
              onGetAICritique={handleGetInstructionCritique}
              onGenerateCode={handleGenerateCodeFromInstructions}
              onGetDebuggingHelp={handleGetDebuggingHelp}
              injectedInstructions={vibeCodingInjectedPrompt}
              onInstructionsInjected={() => setVibeCodingInjectedPrompt(null)}
            />

          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default VibeCodingPage;