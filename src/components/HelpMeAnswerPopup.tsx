// src/components/HelpMeAnswerPopup.tsx
// Presentational popup for the "Help Me Answer" conversational AI assistant.
//
// Receives all state and actions from the useHelpMeAnswer hook.
// Has zero API logic of its own — fully controlled by props.
//
// Usage:
//   const helpMe = useHelpMeAnswer({ question, teaching, taskLabel, ... });
//
//   {/* Button to open */}
//   <button onClick={helpMe.open}>Help Me Answer</button>
//
//   {/* Popup (renders nothing when closed) */}
//   <HelpMeAnswerPopup
//     {...helpMe}
//     onUseDraft={draft => setPrompt(draft)}
//     phaseLabel="Phase 2: Build"   // optional header context
//   />

import React from 'react';
import { HelpCircle, X, Loader2 } from 'lucide-react';
import type { UseHelpMeAnswerReturn } from '../hooks/useHelpMeAnswer';

// ─── Props ────────────────────────────────────────────────────────────────────

interface HelpMeAnswerPopupProps extends UseHelpMeAnswerReturn {
  /** Called with the AI-generated draft when the learner clicks "Use this answer" */
  onUseDraft: (draft: string) => void;
  /** Optional phase/context label shown in the popup header (e.g. "Phase 2: Build") */
  phaseLabel?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const HelpMeAnswerPopup: React.FC<HelpMeAnswerPopupProps> = ({
  isOpen,
  messages,
  inputValue,
  isLoading,
  draft,
  inputRef,
  question,
  taskLabel,
  taskContext,
  close,
  setInputValue,
  sendMessage,
  requestDraft,
  useDraft,
  onUseDraft,
  phaseLabel,
}) => {
  if (!isOpen) return null;

  const handleUseDraft = () => useDraft(onUseDraft);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)' }}
    >
      <div
        className="w-full max-w-lg flex flex-col rounded-2xl shadow-2xl border overflow-hidden"
        style={{ background: '#1a1025', borderColor: '#6040a0', maxHeight: '85vh' }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: '#3a2060', background: '#12081a' }}
        >
          <div className="flex items-center gap-2">
            <HelpCircle size={16} style={{ color: '#a080e0' }} />
            <div>
              {(phaseLabel || taskContext) && (
                <p
                  className="text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: '#a080e0' }}
                >
                  {[phaseLabel, taskContext].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="text-sm font-bold text-white">Help Me Answer</p>
            </div>
          </div>
          <button
            onClick={close}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            aria-label="Close"
          >
            <X size={16} style={{ color: '#a080e0' }} />
          </button>
        </div>

        {/* ── Question reminder ─────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <div
            className="rounded-xl p-3 border"
            style={{ background: '#2a1845', borderColor: '#6040a0' }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-wide mb-1"
              style={{ color: '#a080e0' }}
            >
              Your question
            </p>
            <p className="text-xs text-white leading-relaxed">{question}</p>
          </div>
        </div>

        {/* ── Conversation messages ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-3 stack-y-3 min-h-0">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                style={{
                  maxWidth: '85%',
                  background: msg.role === 'user' ? '#4a20a0' : '#2a1845',
                  color:      msg.role === 'user' ? 'white'   : '#e0d0ff',
                  borderRadius: msg.role === 'user'
                    ? '18px 18px 4px 18px'
                    : '18px 18px 18px 4px',
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl px-4 py-3"
                style={{ background: '#2a1845' }}
              >
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{
                        background: '#a080e0',
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Draft answer panel ────────────────────────────────────────── */}
        {draft && (
          <div
            className="mx-5 mb-3 rounded-xl border flex-shrink-0"
            style={{ background: '#0f2a0f', borderColor: '#3a7a3a' }}
          >
            <div className="px-4 pt-3 pb-1">
              <p
                className="text-[10px] font-bold uppercase tracking-wide mb-2"
                style={{ color: '#7aba7a' }}
              >
                Your answer — ready to use
              </p>
              <p
                className="text-xs leading-relaxed"
                style={{ color: '#c0e8c0' }}
              >
                {draft}
              </p>
            </div>
            <div className="px-4 pb-3 pt-2">
              <button
                onClick={handleUseDraft}
                className="w-full py-2 rounded-xl text-sm font-bold transition-colors hover:opacity-90"
                style={{ background: '#3a7a3a', color: 'white' }}
              >
                Use this answer →
              </button>
            </div>
          </div>
        )}

        {/* ── Input row ─────────────────────────────────────────────────── */}
        <div className="px-5 pb-4 pt-2 flex gap-2 flex-shrink-0">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(); }}
            placeholder="Ask me anything, or say 'give me some options'…"
            disabled={isLoading}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-hidden disabled:opacity-50"
            style={{
              background: '#2a1845',
              border: '1px solid #6040a0',
              color: 'white',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !inputValue.trim()}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
            style={{ background: '#6040a0', color: 'white' }}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
          </button>
        </div>

        {/* ── "Get an AI response" button (after 3 exchanges, if no draft) */}
        {!draft && messages.length >= 3 && (
          <div
            className="px-5 pb-5 flex-shrink-0 border-t pt-3"
            style={{ borderColor: '#3a2060' }}
          >
            <button
              onClick={requestDraft}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors hover:opacity-90 disabled:opacity-40"
              style={{ background: '#3a7a3a', color: 'white' }}
            >
              ✨ Get an AI response you can use
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HelpMeAnswerPopup;
