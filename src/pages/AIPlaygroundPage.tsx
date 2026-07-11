// src/pages/AIPlaygroundPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { useVoice } from '../hooks/useVoice';
import { VoiceFallback } from '../components/VoiceFallback';
import { AIPidginCoachWrapper } from '../components/AIPidginCoachWrapper';
import { useBranding } from '../lib/useBranding';
import {
  Plus, Search, Trash2, Download, Send, Paperclip,
  ChevronLeft, ChevronRight, Edit3, Check, X,
  MessageSquare, Loader2, Bot, User, Copy, FileText, Code2, Home,
  Mic, MicOff, Volume2, VolumeX, AlertCircle, ChevronDown, History, Pin,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_CHAR_LIMIT     = 4000;
const MAX_API_MESSAGES    = 20;
const MAX_CONTEXT_TOKENS  = 60000;  // compress older messages when history exceeds ~60K tokens
const CODE_FENCE_RE       = /\`\`\`[\s\S]*?\`\`\`/g;
const REFLECTION_TRIGGER = 10;

// ── Interfaces ─────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachment?: { name: string; content: string; type: string }[];
  tokensIn?:  number;   // estimated input tokens for this exchange
  tokensOut?: number;   // estimated output tokens for this exchange
}
interface PlaygroundChat {
  id: string;
  user_id: string;
  title: string;
  messages: ChatMessage[];
  model?: string;
  created_at: string;
  updated_at: string;
}

// HistoryBlock: a code block accumulated across the whole session
interface ContextFile {
  id:         string;
  filename:   string;
  language:   string | null;
  size_chars: number;
  content?:   string; // only present client-side before upload
}

interface HistoryBlock {
  id: string;           // unique id for keying
  language: string;
  content: string;
  label: string;        // bold label shown above the block in chat (e.g. "In src/pages/Foo.tsx, replace lines 42–55:")
  cursorHint?: string;  // Cursor search suggestion extracted from <!-- CURSOR: ... -->
  messageIndex: number; // which assistant message it came from
  blockIndex: number;   // which block within that message
}

interface ArtifactPanel {
  type: 'code' | 'document';
  content: string;
  title: string;
  historyId?: string;   // points into sessionCodeHistory
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// ── parseCodeBlocks: extract all code blocks + their labels + cursor hints ─────
// Expected Claude output format:
//   **In src/pages/Foo.tsx, replace lines 42–55 with:**
//   ```tsx
//   ...code...
//   ```
//   <!-- CURSOR: search for "const detectArtifact" -->
interface ParsedBlock {
  language: string;
  content: string;
  label: string;
  cursorHint?: string;
  replaceSnippet?: string;      // code that the new snippet replaces
  insertAfterSnippet?: string;  // code after which the new snippet is inserted
}

const parseCodeBlocks = (text: string): ParsedBlock[] => {
  const result: ParsedBlock[] = [];
  const blockRegex = /(?:(?:^|\n)\*\*([^\n*]+)\*\*\n)?```(\w*)\n([\s\S]*?)```((?:\n<!--[\s\S]*?-->)*)/g;
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const label   = match[1]?.trim() ?? '';
    const lang    = match[2] || 'code';
    const content = match[3] ?? '';
    const meta    = match[4] ?? '';
    if (content.trim().length > 10) {
      const cursorHint         = meta.match(/<!-- CURSOR: ([\s\S]+?) -->/)?.[1]?.trim();
      const replaceSnippet     = meta.match(/<!-- REPLACE: ([\s\S]+?) -->/)?.[1]?.trim();
      const insertAfterSnippet = meta.match(/<!-- INSERT_AFTER: ([\s\S]+?) -->/)?.[1]?.trim();
      result.push({ language: lang, content, label, cursorHint, replaceSnippet, insertAfterSnippet });
    }
  }
  return result;
};

// ── InlineCode: styled pill with one-click copy ────────────────────────────────
const InlineCode: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      title="Click to copy"
      className="inline-flex items-center gap-1 bg-gray-100 hover:bg-purple-50 border border-gray-200 hover:border-purple-300 text-purple-800 font-mono text-sm px-1.5 py-0.5 rounded transition-colors cursor-pointer"
    >
      <span>{code}</span>
      <Copy size={10} className={`flex-shrink-0 ${copied ? 'text-green-500' : 'text-gray-400'}`} />
    </button>
  );
};

// ── renderInlineText: **bold** + `inline code` + plain text ───────────────────
const renderInlineText = (line: string) => {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span>
      {parts.map((p, j) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={j}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('`')  && p.endsWith('`'))  return <InlineCode key={j} code={p.slice(1, -1)} />;
        return <span key={j}>{p}</span>;
      })}
    </span>
  );
};

// ── InChatCodeBlock: formatted black-background block rendered in message ──────
const InChatCodeBlock: React.FC<{
  block: ParsedBlock;
  onOpenPanel: () => void;
}> = ({ block, onOpenPanel }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(block.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const hasContext = !!(block.replaceSnippet || block.insertAfterSnippet);

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-gray-700 shadow-md">

      {/* Label bar */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-purple-300 leading-snug">
          {block.label || `${block.language} code`}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-mono">{block.language}</span>
          <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors">
            <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onOpenPanel} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-200 px-2 py-1 rounded hover:bg-gray-700 transition-colors" title="Open in code panel">
            <Code2 size={11} />Panel
          </button>
        </div>
      </div>

      {/* Code to Replace */}
      {block.replaceSnippet && (
        <>
          <div className="bg-red-950 px-4 py-2 border-t border-gray-700">
            <span className="text-sm font-bold text-red-300">Code to Replace:</span>
          </div>
          <pre className="bg-red-950/40 text-red-200 font-mono text-xs px-4 py-3 overflow-x-auto leading-relaxed whitespace-pre-wrap line-through opacity-75">
            {block.replaceSnippet}
          </pre>
        </>
      )}

      {/* Code Preceding Code to Add */}
      {block.insertAfterSnippet && (
        <>
          <div className="bg-blue-950 px-4 py-2 border-t border-gray-700">
            <span className="text-sm font-bold text-blue-300">Code Preceding Code to Add:</span>
          </div>
          <pre className="bg-blue-950/40 text-blue-200 font-mono text-xs px-4 py-3 overflow-x-auto leading-relaxed whitespace-pre-wrap opacity-80">
            {block.insertAfterSnippet}
          </pre>
        </>
      )}

      {/* Code to Add */}
      <div className={`px-4 py-2 border-t border-gray-700 ${hasContext ? 'bg-green-950' : 'bg-gray-800'}`}>
        <span className={`text-sm font-bold ${hasContext ? 'text-green-300' : 'text-purple-300'}`}>
          Code to Add:
        </span>
      </div>
      <pre className="bg-gray-950 text-green-300 font-mono text-xs px-4 py-3 overflow-x-auto leading-relaxed whitespace-pre-wrap">
        {block.content}
      </pre>

      {/* Cursor hint */}
      {block.cursorHint && (
        <div className="bg-gray-900 border-t border-gray-700 px-4 py-2 flex items-center gap-2">
          <Search size={11} className="text-yellow-400 flex-shrink-0" />
          <span className="text-xs text-yellow-300">
            <span className="font-semibold">Cursor search: </span>
            <span className="font-mono bg-gray-800 px-1.5 py-0.5 rounded">{block.cursorHint}</span>
          </span>
          <button onClick={() => navigator.clipboard.writeText(block.cursorHint!)} className="ml-auto text-xs text-gray-500 hover:text-yellow-300 transition-colors" title="Copy search term">
            <Copy size={10} />
          </button>
        </div>
      )}
    </div>
  );
};

// ── MessageContent: full renderer including formatted code blocks ───────────────
const MessageContent: React.FC<{
  text: string;
  parsedBlocks: ParsedBlock[];
  onOpenBlock: (idx: number) => void;
}> = ({ text, parsedBlocks, onOpenBlock }) => {

  // Strip code fences + all meta comment markers from display text
  const blockRegex = /(?:(?:^|\n)\*\*([^\n*]+)\*\*\n)?```(\w*)\n[\s\S]*?```((?:\n<!--[\s\S]*?-->)*)/g;
  const segments: Array<{ type: 'text'; content: string } | { type: 'block'; index: number }> = [];
  let lastIndex = 0;
  let blockIdx = 0;
  let match;
  const regex = new RegExp(blockRegex.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'block', index: blockIdx++ });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  const renderTextSegment = (content: string) => {
    // Remove any stray HTML comment lines (<!-- ... -->) that leaked past the regex
    const cleaned = content.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n');
    const lines = cleaned.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('### ')) return <h3 key={i} className="font-bold text-base mt-2">{renderInlineText(line.slice(4))}</h3>;
      if (line.startsWith('## '))  return <h2 key={i} className="font-bold text-lg mt-3">{renderInlineText(line.slice(3))}</h2>;
      if (line.startsWith('# '))   return <h1 key={i} className="font-bold text-xl mt-3">{renderInlineText(line.slice(2))}</h1>;
      if (line.startsWith('- ') || line.startsWith('* ')) return (
        <div key={i} className="flex gap-2">
          <span className="mt-1 flex-shrink-0">•</span>
          <span>{renderInlineText(line.slice(2))}</span>
        </div>
      );
      if (/^\d+\.\s/.test(line)) {
        const dotIdx = line.indexOf('. ');
        return (
          <div key={i} className="flex gap-2">
            <span className="flex-shrink-0 font-semibold">{line.slice(0, dotIdx + 1)}</span>
            <span>{renderInlineText(line.slice(dotIdx + 2))}</span>
          </div>
        );
      }
      if (line.startsWith('```')) return null;
      if (line.startsWith('<!--')) return null;  // strip any remaining comment lines
      if (line.trim() === '')     return <div key={i} className="h-1" />;
      if (/^\*\*[^*]+\*\*$/.test(line.trim())) return null;
      return <p key={i}>{renderInlineText(line)}</p>;
    });
  };

  return (
    <div className="space-y-1 text-base leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <React.Fragment key={i}>{renderTextSegment(seg.content)}</React.Fragment>;
        const block = parsedBlocks[seg.index];
        if (!block) return null;
        // Large blocks (full files) show a compact link — they're in the artifact panel
        const lineCount = block.content.split('\n').length;
        if (lineCount > 50) {
          return (
            <div key={i} className="my-2 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
              <Code2 size={13} className="text-purple-400 flex-shrink-0" />
              <span className="font-medium truncate">{block.label || `${block.language} file`}</span>
              <span className="text-gray-400">· {lineCount} lines</span>
              <button onClick={() => onOpenBlock(seg.index)} className="ml-auto text-purple-600 hover:text-purple-800 font-semibold whitespace-nowrap">
                View in panel →
              </button>
            </div>
          );
        }
        return (
          <InChatCodeBlock
            key={i}
            block={block}
            onOpenPanel={() => onOpenBlock(seg.index)}
          />
        );
      })}
    </div>
  );
};

// ── ArtifactPanelView: code panel with session history dropdown ────────────────
const ArtifactPanelView: React.FC<{
  artifact: ArtifactPanel;
  sessionHistory: HistoryBlock[];
  onSelectHistory: (block: HistoryBlock) => void;
  onClose: () => void;
  onEdit: () => void;
  editInput: string;
  setEditInput: (v: string) => void;
  isEditing: boolean;
  isStreaming: boolean;
}> = ({ artifact, sessionHistory, onSelectHistory, onClose, onEdit, editInput, setEditInput, isEditing, isStreaming }) => {
  const [copied, setCopied]       = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Find current block in history for cursor hint
  const currentHistoryBlock = sessionHistory.find(b => b.id === artifact.historyId);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {artifact.type === 'code'
            ? <Code2 size={15} className="text-purple-400 flex-shrink-0" />
            : <FileText size={15} className="text-blue-400 flex-shrink-0" />}
          <span className="text-sm font-medium text-gray-200 truncate">{artifact.title}</span>
          {isEditing || isStreaming ? (
            <span className="flex items-center gap-1 text-xs text-purple-400 flex-shrink-0">
              <Loader2 size={11} className="animate-spin" />
              {isStreaming ? 'Writing…' : 'Applying…'}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          >
            <Copy size={12} />{copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            title="Close panel"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Session history dropdown */}
      {sessionHistory.length > 0 && (
        <div className="px-3 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0 relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="w-full flex items-center justify-between gap-2 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <History size={12} className="text-purple-400 flex-shrink-0" />
              <span className="truncate">
                {currentHistoryBlock
                  ? (currentHistoryBlock.label || `${currentHistoryBlock.language} block`)
                  : 'Select from session history…'}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="bg-purple-900 text-purple-300 text-xs px-1.5 py-0.5 rounded-full">{sessionHistory.length}</span>
              <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {dropdownOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
              {sessionHistory.map((block, idx) => (
                <button
                  key={block.id}
                  onClick={() => { onSelectHistory(block); setDropdownOpen(false); }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0 ${block.id === artifact.historyId ? 'bg-gray-700' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-gray-900 text-purple-300 px-1.5 py-0.5 rounded flex-shrink-0">{block.language}</span>
                    <span className="text-xs text-gray-200 truncate font-medium">
                      {block.label || `Block ${idx + 1}`}
                    </span>
                  </div>
                  {block.cursorHint && (
                    <p className="text-xs text-yellow-400 mt-1 truncate pl-1">🔍 {block.cursorHint}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5 font-mono truncate pl-1">
                    {block.content.trim().slice(0, 60)}…
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cursor hint strip */}
      {currentHistoryBlock?.cursorHint && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-700 flex items-center gap-2 flex-shrink-0">
          <Search size={11} className="text-yellow-400 flex-shrink-0" />
          <span className="text-xs text-yellow-300">
            <span className="font-semibold">Cursor search: </span>
            <span className="font-mono bg-gray-800 px-1.5 py-0.5 rounded">{currentHistoryBlock.cursorHint}</span>
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(currentHistoryBlock.cursorHint!)}
            className="ml-auto text-xs text-gray-500 hover:text-yellow-300 transition-colors"
            title="Copy search term"
          >
            <Copy size={10} />
          </button>
        </div>
      )}

      {/* Label strip */}
      {(currentHistoryBlock?.label || artifact.title) && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0">
          <p className="text-xs font-bold text-purple-300 leading-snug">
            {currentHistoryBlock?.label || artifact.title}
          </p>
        </div>
      )}

      {/* Code content */}
      <div className="flex-1 overflow-auto p-4">
        {artifact.type === 'code' ? (
          <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap leading-relaxed">{artifact.content}</pre>
        ) : (
          <div className="space-y-1">
            {artifact.content.split('\n').map((line, i) => {
              if (line.startsWith('### ')) return <h3 key={i} className="text-gray-100 font-bold text-base mt-4 mb-1">{line.slice(4)}</h3>;
              if (line.startsWith('## '))  return <h2 key={i} className="text-gray-100 font-bold text-lg mt-5 mb-2">{line.slice(3)}</h2>;
              if (line.startsWith('# '))   return <h1 key={i} className="text-gray-100 font-bold text-xl mt-6 mb-2">{line.slice(2)}</h1>;
              if (line.startsWith('- ') || line.startsWith('* ')) return (
                <div key={i} className="flex gap-2 text-sm text-gray-300"><span>•</span><span>{line.slice(2)}</span></div>
              );
              if (line.trim() === '') return <div key={i} className="h-2" />;
              const parts = line.split(/(\*\*[^*]+\*\*)/g);
              return (
                <p key={i} className="text-sm text-gray-300 leading-relaxed">
                  {parts.map((p, j) => p.startsWith('**') && p.endsWith('**')
                    ? <strong key={j} className="text-gray-100">{p.slice(2, -2)}</strong>
                    : p)}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Artifact edit bar ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-2">
        <div className="flex items-center gap-2 bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 focus-within:border-purple-500 transition-colors">
          <Edit3 size={13} className="text-purple-400 flex-shrink-0" />
          <input
            value={editInput}
            onChange={e => setEditInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEdit(); } }}
            placeholder="Edit this code… (e.g. add error handling, rename function)"
            disabled={isEditing}
            className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-500 outline-none"
          />
          <button
            onClick={onEdit}
            disabled={!editInput.trim() || isEditing}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            title="Apply edit"
          >
            {isEditing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1 text-center">Enter to apply · Claude rewrites the full code with your change</p>
      </div>
    </div>
  );
};

// ── Playground streaming via Edge function (no timeout, no CORS issues) ────────
// Calls /api/chat-stream which proxies to Anthropic server-side.
async function* streamPlayground(
  messages: { role: string; content: string }[],
  system: string,
  model: string,
  maxTokens: number,
  temperature: number,
  userId?: string,
): AsyncGenerator<{ chunk?: string; done?: boolean; fullText?: string; usedModel?: string; taskType?: string }> {
  const res = await fetch('/api/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, model, max_tokens: maxTokens, temperature, user_id: userId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err?.error ?? `Stream error ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop()!;

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6).trim());
        if (evt.chunk) { fullText += evt.chunk; yield { chunk: evt.chunk }; }
        if (evt.done)  {
          yield {
            done: true,
            fullText:  evt.fullText ?? fullText,
            usedModel: evt.usedModel,   // set by chat-stream for non-coding (Groq/Haiku)
            taskType:  evt.taskType,    // 'coding' | 'non-coding'
          };
          return;
        }
      } catch { /* skip malformed lines */ }
    }
  }
  yield { done: true, fullText };
}

// ── Playground via free-tier chain (non-Sonnet users) ────────────────────────
async function* chatPlaygroundFree(
  messages: { role: string; content: string }[],
  system: string,
  maxTokens: number,
  temperature: number,
  userId?: string,
): AsyncGenerator<{ chunk?: string; done?: boolean; fullText?: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages, system,
      max_tokens:  maxTokens,
      temperature,
      page:        'AIPlaygroundPage',
      userId:      userId ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err?.error ?? `Chat error ${res.status}`);
  }
  const data = await res.json();
  const fullText = data?.choices?.[0]?.message?.content ?? '';
  yield { chunk: fullText };
  yield { done: true, fullText };
}

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' },
];
const getModelDisplayName = (modelId: string): string => {
  const trimmed = (modelId || '').trim();
  const match = MODEL_OPTIONS.find(m => m.value === trimmed);
  if (match) return match.label;
  if (trimmed.includes('sonnet'))          return 'Claude Sonnet 4.6';
  if (trimmed.includes('haiku'))           return 'Claude Haiku 4.5';
  if (trimmed.includes('llama-3.3-70b'))   return 'Llama 3.3 70B';
  if (trimmed.includes('llama3.1-8b'))     return 'Llama 3.1 8B';
  return trimmed || 'Claude';
};

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a personal AI assistant for anyone using this platform. This is an open playground — help with anything ethical: coding, writing, research, math, science, business, creative projects, poetry, personal questions, technical problems, or just exploring ideas. There are no topic restrictions beyond safety.

SAFETY — the only limits:
- No instructions for violence, weapons, dangerous substances, or self-harm.
- If a user expresses distress or danger, respond with care and direct them to a trusted adult or community resource.
- No content that deceives, exploits, sexualizes, or demeans anyone.
- Do not take sides on community conflicts, land disputes, or political tensions — present perspectives fairly.
- Protect user privacy — do not encourage sharing personal details of others.

HOW TO RESPOND
- Help fully and warmly with whatever the user asks — poems, advice, explanations, creative work, research, code, math, anything.
- Explain your thinking so the user gains understanding, not just an answer.
- Be encouraging and treat every user as capable.
- At the end of a session or after a substantive exchange, invite the user to reflect briefly on what they got out of it.

CODE RESPONSES — when writing or changing code:

DEFAULT: Give the smallest snippet that solves the problem. Never return a full file unless the user explicitly asks (e.g. "give me the full file").

1. RATIONALE (2–4 sentences): What are you changing and why?

2. CODE BLOCK — one fenced block with only the new/changed code:
   - LABEL (bold line before fence): **In src/pages/Foo.tsx, replace the handleSend function:**
   - CODE FENCE: \`\`\`tsx  ...snippet...  \`\`\`
   - PLACEMENT MARKER immediately after closing fence — pick ONE:
     a. Replacing existing code: <!-- REPLACE: exact 1–4 lines being replaced -->
     b. Inserting new code:      <!-- INSERT_AFTER: exact line it goes after -->
     c. End of file / no anchor: <!-- CURSOR: search for "distinctive nearby line" -->

3. FOLLOW-UP: one sentence next step

4. UNDERSTANDING CHECK: ask what they think the change does

FULL FILE EXCEPTION: If asked for the full file or complete script, return it in one fenced block with no truncation.

Be warm, precise, and genuinely helpful.`;
// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════
const AIPlaygroundPage: React.FC = () => {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const branding  = useBranding();

  const [sidebarOpen, setSidebarOpen]             = useState(true);
  const [searchQuery, setSearchQuery]             = useState('');
  const [chats, setChats]                         = useState<PlaygroundChat[]>([]);
  const [activeChatId, setActiveChatId]           = useState<string | null>(null);
  const [loadingChats, setLoadingChats]           = useState(true);
  const [editingTitleId, setEditingTitleId]       = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [userInput, setUserInput]                 = useState('');
  const [sending, setSending]                     = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; content: string; type: string }[]>([]);
  const [artifact, setArtifact]                   = useState<ArtifactPanel | null>(null);
  const [artifactEditInput, setArtifactEditInput] = useState('');
  const [artifactEditing, setArtifactEditing]     = useState(false);
  const [artifactStreaming, setArtifactStreaming]  = useState(false);

  // ── Quota tracking ────────────────────────────────────────────────────────────
  const QUOTA_TOKENS    = 25000;
  const QUOTA_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours
  const [quotaUsed, setQuotaUsed]         = useState(0);
  const [quotaWindowStart, setQuotaWindowStart] = useState<Date | null>(null);
  const [playgroundModel, setPlaygroundModel]     = useState<string>('claude-haiku-4-5-20251001'); // default Haiku — overridden by profile
  // Tracks the model actually used for the last response (may differ from playgroundModel
  // because chat-stream routes non-coding turns to Groq/Haiku automatically).
  const [activeModel, setActiveModel]             = useState<string>('');   // '' = not yet sent
  const [modelLoaded, setModelLoaded]             = useState(false);
  const [showReflection, setShowReflection]       = useState(false);
  const [compressionActive, setCompressionActive] = useState(false); // true when old code blocks have been compressed
  const [contextFiles, setContextFiles]           = useState<ContextFile[]>([]); // files pinned to system prompt
  const [contextUploading, setContextUploading]   = useState(false);
  const [isDragging, setIsDragging]               = useState(false);

  // ── Session code history: accumulates ALL code blocks seen this session ────────
  const [sessionCodeHistory, setSessionCodeHistory] = useState<HistoryBlock[]>([]);

  const fileInputRef        = useRef<HTMLInputElement>(null);
  const contextFileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef   = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const dropZoneRef  = useRef<HTMLDivElement>(null);
  // Tracks when activeChatId changes because WE just created a new chat mid-send,
  // so the reset effect below doesn't wipe the artifact we just opened.
  const justCreatedChatRef = useRef(false);

  // ── Voice state ──────────────────────────────────────────────────────────────
  const [continent, setContinent]                   = useState<string | null>(null);
  const [profileName, setProfileName]               = useState<string | null>(null);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [isListening, setIsListening]               = useState(false);
  const recognitionRef = useRef<any>(null);
  const isAfrica = continent === 'Africa';

  const {
    speak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    recognitionLang,
    selectedVoice,
  } = useVoice(isAfrica);

  // ── Load profile ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('name, ai_playground_model')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.name) setProfileName(data.name);
        // Use profile model if explicitly set to Sonnet, otherwise default to Haiku
        const profileModel = data?.ai_playground_model;
        const model = profileModel === 'claude-sonnet-4-6'
          ? 'claude-sonnet-4-6'
          : 'claude-haiku-4-5-20251001';
        setPlaygroundModel(model);
        setModelLoaded(true);
        console.log(`[Playground] model loaded: ${model} (profile: ${profileModel ?? 'not set'})`);
      })
      .catch(() => {
        setPlaygroundModel('claude-haiku-4-5-20251001');
        setModelLoaded(true);
      });
  }, [user?.id]);

  // ── Reset on chat switch — clear history too ──────────────────────────────────
  useEffect(() => {
    if (justCreatedChatRef.current) {
      justCreatedChatRef.current = false;
      return;
    }
    cancelSpeech();
    setArtifact(null);
    setShowReflection(false);
    setSessionCodeHistory([]);
    setCompressionActive(false);
    setContextFiles([]);
    // Load any persisted context files for this chat
    if (activeChatId && user?.id) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.access_token) return;
        fetch(`/api/playground-context?chat_id=${activeChatId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then(r => r.json())
          .then(({ files }) => { if (files?.length) setContextFiles(files); })
          .catch(() => {});
      });
    }
  }, [activeChatId, user?.id]);

  const activeChat = chats.find(c => c.id === activeChatId) ?? null;
  const messages   = activeChat?.messages ?? [];

  // ── Reflection trigger ────────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length > 0 && messages.length % REFLECTION_TRIGGER === 0) {
      setShowReflection(true);
    }
  }, [messages.length]);

  // ── Fetch chats ───────────────────────────────────────────────────────────────
  const fetchChats = useCallback(async () => {
    if (!user?.id) return;
    setLoadingChats(true);
    try {
      const { data, error } = await supabase
        .from('ai_playground_chats')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setChats(data ?? []);
    } catch (err) {
      console.error('[Playground] fetch error:', err);
    } finally {
      setLoadingChats(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchChats(); }, [fetchChats]);

  // ── Fetch quota usage for last 3 hours ───────────────────────────────────────
  const fetchQuota = useCallback(async () => {
    if (!user?.id) return;
    const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS);
    try {
      const { data, error } = await supabase
        .from('api_cost_log')
        .select('input_tokens, output_tokens, logged_at')
        .eq('user_id', user.id)
        .eq('page', 'AIPlaygroundPage')
        .gte('logged_at', windowStart.toISOString())
        .order('logged_at', { ascending: true });
      if (error) { console.warn('[Playground] quota fetch error:', error.message); return; }
      const total = (data ?? []).reduce(
        (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0
      );
      setQuotaUsed(prev => Math.max(prev, total));
      setQuotaWindowStart(data?.[0]?.logged_at ? new Date(data[0].logged_at) : null);
    } catch (e) {
      console.warn('[Playground] quota fetch failed:', e);
    }
  }, [user?.id]);

  useEffect(() => { fetchQuota(); }, [fetchQuota]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, sending]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [userInput]);

  const handleNewChat = () => {
    setActiveChatId(null);
    setUserInput('');
    setAttachments([]);
    setArtifact(null);
    setShowReflection(false);
    setSessionCodeHistory([]);
    setActiveModel('');
    setCompressionActive(false);
    setContextFiles([]);
  };

  // ── Generate title ────────────────────────────────────────────────────────────
  const generateTitle = async (firstMessage: string): Promise<string> => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: 'AIPlaygroundPage',
          messages: [{ role: 'user', content: `Generate a short 3-5 word title for a chat that starts with: "${firstMessage.slice(0, 200)}". Reply with ONLY the title, no quotes or punctuation.` }],
          max_tokens: 20,
          temperature: 0.3,
        }),
      });
      const rawTitle = await res.text();
      let data: any;
      try { data = JSON.parse(rawTitle); } catch { return firstMessage.slice(0, 40) || 'New Chat'; }
      return data?.content?.[0]?.text?.trim() ?? data?.choices?.[0]?.message?.content?.trim() ?? 'New Chat';
    } catch { return firstMessage.slice(0, 40) || 'New Chat'; }
  };

  // ── openBlockInPanel: add to history, set artifact ───────────────────────────
  const openBlockInPanel = useCallback((
    block: ParsedBlock,
    messageIndex: number,
    blockIndex: number
  ) => {
    const id = `msg${messageIndex}-block${blockIndex}`;
    const historyBlock: HistoryBlock = {
      id,
      language: block.language,
      content: block.content,
      label: block.label,
      cursorHint: block.cursorHint,
      messageIndex,
      blockIndex,
    };
    // Add to history if not already present
    setSessionCodeHistory(prev => {
      if (prev.find(b => b.id === id)) return prev;
      return [...prev, historyBlock];
    });
    setArtifact({
      type: 'code',
      content: block.content,
      title: block.label || `${block.language} snippet`,
      historyId: id,
    });
  }, []);

  // ── Attach file as persistent context (goes into system prompt, not message) ──
  const handleContextFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user?.id) return;
    e.target.value = '';
    setContextUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Ensure we have a chat to attach to (create one if needed)
      let chatId = activeChatId;
      if (!chatId) {
        const { data: newChat, error } = await supabase
          .from('ai_playground_chats')
          .insert({ user_id: user.id, title: 'Code session', messages: [], model: playgroundModel, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .select().single();
        if (error || !newChat) return;
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        chatId = newChat.id;
      }

      for (const file of files) {
        const text = await file.text();
        const lang = file.name.split('.').pop() ?? null;
        const res  = await fetch('/api/playground-context', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body:    JSON.stringify({ chat_id: chatId, filename: file.name, content: text, language: lang }),
        });
        const { file: saved } = await res.json();
        if (saved) {
          // Store content client-side for immediate injection into system prompt
          setContextFiles(prev => {
            const without = prev.filter(f => f.filename !== file.name);
            return [...without, { ...saved, content: text }];
          });
        }
      }
    } catch (err) {
      console.error('[Context attach]', err);
    } finally {
      setContextUploading(false);
    }
  };

  const handleContextFileRemove = async (file: ContextFile) => {
    setContextFiles(prev => prev.filter(f => f.id !== file.id));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/playground-context?id=${file.id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch (err) {
      console.error('[Context remove]', err);
    }
  };

  // ── selectFromHistory ─────────────────────────────────────────────────────────
  const selectFromHistory = useCallback((block: HistoryBlock) => {
    setArtifact({
      type: 'code',
      content: block.content,
      title: block.label || `${block.language} snippet`,
      historyId: block.id,
    });
  }, []);

  // ── Edit code in artifact panel ───────────────────────────────────────────────
  const handleArtifactEdit = async () => {
    if (!artifactEditInput.trim() || !artifact || artifactEditing) return;
    setArtifactEditing(true);
    const instruction = artifactEditInput.trim();
    setArtifactEditInput('');
    try {
      const streamGen = streamPlayground(
        [{
          role: 'user',
          content: `Here is the current code (${artifact!.title}):\n\`\`\`${artifact!.type === 'code' ? 'tsx' : 'text'}\n${artifact!.content}\n\`\`\`\n\nEdit instruction: ${instruction}`,
        }],
        `You are a precise code editor. Return ONLY the complete updated code inside a single fenced code block with the correct language tag. No explanation before or after — just the fenced block. Preserve all logic not explicitly changed.`,
        playgroundModel,
        32000,
        0.2,
        user?.id,
      );

      let lineBuffer = '';
      let fullText = '';
      let inCodeFence = false;
      let codeText = '';

      for await (const evt of streamGen) {
        if (evt.done) { fullText = evt.fullText ?? fullText; break; }
        if (!evt.chunk) continue;
        fullText += evt.chunk;
        lineBuffer += evt.chunk;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop()!;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!inCodeFence && trimmed.startsWith('```') && trimmed.length > 3) {
            inCodeFence = true;
          } else if (inCodeFence && trimmed === '```') {
            inCodeFence = false;
            setArtifact(prev => prev ? { ...prev, content: codeText } : prev);
          } else if (inCodeFence) {
            codeText += line + '\n';
            setArtifact(prev => prev ? { ...prev, content: codeText } : prev);
          }
        }
      }
      if (lineBuffer.trim() && inCodeFence) {
        codeText += lineBuffer;
        setArtifact(prev => prev ? { ...prev, content: codeText } : prev);
      }
      const parsed = parseCodeBlocks(fullText);
      if (parsed.length > 0) {
        const updated = parsed[0];
        const newId = `edit-${Date.now()}`;
        const historyBlock: HistoryBlock = {
          id: newId,
          language: updated.language,
          content: updated.content,
          label: `Edited: ${instruction.slice(0, 60)}`,
          messageIndex: -1,
          blockIndex: 0,
        };
        setSessionCodeHistory(prev => [...prev, historyBlock]);
        setArtifact({
          type: 'code',
          content: updated.content,
          title: artifact.title,
          historyId: newId,
        });
      }
    } catch (err) {
      console.error('[Playground] artifact edit error:', err);
    } finally {
      setArtifactEditing(false);
    }
  };


  // ── Request scope check: is the first message in a chat too broad? ─────────────
  // Returns true if the request asks for multiple changes / a full build.
  // Only called on the very first user turn (messages.length === 0).
  const checkRequestScope = async (userText: string): Promise<boolean> => {
    if (userText.length < 80) return false; // short messages are always focused
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: 'AIPlaygroundPage',
          messages: [{
            role: 'user',
            content: `Is this request asking for multiple changes, a full build, or is it vague/broad? Reply ONLY "broad" or "focused".\n\nRequest: "${userText.slice(0, 400)}"`,
          }],
          max_tokens: 5,
          temperature: 0,
        }),
      });
      const data = await res.json();
      const label = (data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '').trim().toLowerCase();
      return label.startsWith('broad');
    } catch { return false; }
  };

  // ── Topic drift check: has the user shifted to a new subject mid-chat? ─────────
  // Returns true if the latest user message is clearly about a different topic
  // than the first message in the conversation.
  // Only called when there are already ≥ 2 messages (i.e. mid-conversation).
  const checkTopicDrift = async (currentMessages: ChatMessage[], newUserText: string): Promise<boolean> => {
    if (currentMessages.length < 2) return false;
    const firstUserMsg = currentMessages.find(m => m.role === 'user')?.content ?? '';
    if (!firstUserMsg || firstUserMsg === newUserText) return false;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: 'AIPlaygroundPage',
          messages: [{
            role: 'user',
            content: `Original topic: "${firstUserMsg.slice(0, 200)}"\n\nNew message: "${newUserText.slice(0, 200)}"\n\nAre these about the same topic? Reply ONLY "same" or "new".`,
          }],
          max_tokens: 5,
          temperature: 0,
        }),
      });
      const data = await res.json();
      const label = (data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '').trim().toLowerCase();
      return label.startsWith('new');
    } catch { return false; }
  };

  const handleSend = async () => {
    if ((!userInput.trim() && !attachments.length) || sending || !user?.id) return;
    const userMsg: ChatMessage = {
      role: 'user',
      content: userInput.trim(),
      timestamp: new Date().toISOString(),
      ...(attachments.length ? { attachment: attachments } : {}),
    };
    const currentInput = userInput.trim();
    setUserInput('');
    setAttachments([]);
    setSending(true);
    setShowReflection(false);

    const updatedMessages = [...messages, userMsg];

    // ── Scope check (first turn only) ────────────────────────────────────────
    // If the very first message is too broad, return a coaching message immediately
    // without hitting Sonnet. Cost: one tiny Haiku call via /api/chat.
    if (messages.length === 0) {
      const isBroad = await checkRequestScope(currentInput);
      if (isBroad) {
        const coachMsg: ChatMessage = {
          role: 'assistant',
          content: "That sounds like a big project! 🙌 To keep things focused — and to help make AI affordable for everyone on this platform — let's tackle **one specific thing at a time**.\n\nWhat's the single most important change or question you want to start with?",
          timestamp: new Date().toISOString(),
        };
        // Show coaching inline without creating a DB chat
        const { data: newChat } = await supabase
          .from('ai_playground_chats')
          .insert({ user_id: user.id, title: currentInput.slice(0, 40) || 'New Chat', messages: [userMsg, coachMsg], model: playgroundModel, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .select().single();
        if (newChat) {
          setChats(prev => [newChat, ...prev]);
          justCreatedChatRef.current = true;
          setActiveChatId(newChat.id);
        }
        setSending(false);
        return;
      }
    }

    // ── Topic drift check (mid-conversation) ─────────────────────────────────
    // If the user has shifted to a new topic, close this chat and prompt a new one.
    if (messages.length >= 2) {
      const isDrift = await checkTopicDrift(messages, currentInput);
      if (isDrift) {
        const driftMsg: ChatMessage = {
          role: 'assistant',
          content: "It looks like you're moving on to a new topic — great progress on this one! 🎉\n\nTo keep AI costs down so this platform can reach more people, please **start a fresh chat** for your new request. Just click **New Chat** in the sidebar.\n\nYour conversation here is saved and you can come back to it anytime.",
          timestamp: new Date().toISOString(),
        };
        const finalMessages = [...updatedMessages, driftMsg];
        if (activeChatId) {
          await supabase.from('ai_playground_chats').update({ messages: finalMessages, updated_at: new Date().toISOString() }).eq('id', activeChatId);
          setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: finalMessages } : c));
        }
        setSending(false);
        return;
      }
    }

    // ── Token-aware message preparation ─────────────────────────────────────
    // 1. Expand attachments into content strings
    // 2. Estimate token count; if over MAX_CONTEXT_TOKENS, compress code blocks
    //    in older messages (keep the last 6 messages verbatim — current context)
    const expandedMessages = updatedMessages.slice(-MAX_API_MESSAGES).map(m => ({
      role: m.role,
      content: m.attachment && m.attachment.length
        ? m.attachment.map(a => `[Attached file: ${a.name}]\n\n${a.content}`).join('\n\n---\n\n') + (m.content ? `\n\n${m.content}` : '')
        : m.content,
    }));

    const KEEP_RECENT = 6; // always keep last N messages verbatim
    const estimateTokens = (msgs: { content: string }[]) =>
      Math.ceil(msgs.reduce((s, m) => s + m.content.length, 0) / 4);

    let apiMessages = expandedMessages;
    if (estimateTokens(expandedMessages) > MAX_CONTEXT_TOKENS) {
      setCompressionActive(true);
      // Compress code blocks in older messages to a short placeholder
      const splitAt = Math.max(0, expandedMessages.length - KEEP_RECENT);
      const compressCodeBlocks = (text: string): string =>
        text.replace(
          /(```\w*)(\n[\s\S]*?)(```)/g,
          (match, open, body, _close) => {
            const tokens = Math.ceil(match.length / 4);
            if (tokens < 500) return match; // keep small blocks verbatim
            const lineCount = body.split('\n').length;
            const lang = open.replace('```', '');
            return '```' + lang + '\n[~' + lineCount + ' lines / ~' + tokens + ' tokens — compressed]\n```';
          }
        );
      const older = expandedMessages.slice(0, splitAt).map(m => ({
        ...m,
        content: compressCodeBlocks(m.content),
      }));
      apiMessages = [...older, ...expandedMessages.slice(splitAt)];
    }

    // Hoist token estimates so finally block can update quota optimistically
    const estTokensIn = Math.ceil(
      (SYSTEM_PROMPT.length + apiMessages.reduce((s, m) => s + m.content.length, 0)) / 4
    );
    let estTokensOut = 0; // updated after stream completes

    try {
      // ── Always route through chat-stream, which classifies and picks the model ──
      // chat-stream.js handles: coding → Sonnet, non-coding → Groq → Haiku.
      // We still pass playgroundModel so the user's explicit Sonnet preference is respected.
      setActiveModel('…');  // show spinner label while waiting
      // Build system prompt: base + any pinned context files
      // Context files are injected here (cached block) rather than in messages,
      // so they're paid for once and served from cache on every subsequent turn.
      const contextBlock = contextFiles.length > 0
        ? '\n\n---\n\nThe user has attached the following files as persistent context. Reference them throughout this conversation without the user needing to re-paste them:\n\n' +
          contextFiles.map(f =>
            '### ' + f.filename + (f.language ? ' (' + f.language + ')' : '') + '\n```' + (f.language ?? '') + '\n' + (f.content ?? '[content not loaded — user may need to re-attach]') + '\n```'
          ).join('\n\n')
        : '';
      const activeSystemPrompt = SYSTEM_PROMPT + contextBlock;

      const streamGen = streamPlayground(apiMessages, activeSystemPrompt, playgroundModel, 32000, 0.3, user?.id);

      // ── Consume stream: prose → chat bubble, code → artifact panel ────────────
      let lineBuffer = '';
      let fullText = '';
      let chatText = '';
      let codeText = '';
      let inCodeFence = false;
      const artifactId = `streaming-${Date.now()}`;

      const processLine = (contentLine: string) => {
        const trimmed = contentLine.trim();
        if (!inCodeFence && trimmed.startsWith('```') && trimmed.length > 3) {
          inCodeFence = true;
          setArtifactStreaming(true);
          // Open artifact panel immediately so user sees code arriving live
          setArtifact({ type: 'code', content: '', title: 'Generating…', historyId: artifactId });
        } else if (inCodeFence && trimmed === '```') {
          inCodeFence = false;
          setArtifactStreaming(false);
          setArtifact(prev => prev ? { ...prev, content: codeText } : prev);
        } else if (inCodeFence) {
          codeText += contentLine + '\n';
          setArtifact(prev => prev ? { ...prev, content: codeText } : prev);
        } else {
          chatText += contentLine + '\n';
          const streamMsg: ChatMessage = {
            role: 'assistant',
            content: chatText + '▌',
            timestamp: new Date().toISOString(),
          };
          setChats(prev => {
            const target = prev.find(c => c.id === activeChatId);
            if (!target) return prev;
            return prev.map(c =>
              c.id === target.id ? { ...c, messages: [...updatedMessages, streamMsg] } : c
            );
          });
        }
      };

      for await (const evt of streamGen) {
        if (evt.done) {
          fullText = evt.fullText ?? fullText;
          // Update active model label from what chat-stream actually used
          if (evt.usedModel) setActiveModel(evt.usedModel);
          else if (evt.taskType === 'coding') setActiveModel('claude-sonnet-4-6');
          else setActiveModel(playgroundModel);
          // Re-extract codeText from fullText as authoritative source
          // (streaming line-by-line can miss content if stream was batched)
          const fenceOpen  = fullText.indexOf('\n```');
          const fenceClose = fullText.lastIndexOf('\n```');
          if (fenceOpen !== -1 && fenceClose !== -1 && fenceClose > fenceOpen) {
            const afterOpen = fullText.indexOf('\n', fenceOpen + 1); // skip the opening ``` line
            codeText = fullText.slice(afterOpen + 1, fenceClose);
          }
          break;
        }
        if (!evt.chunk) continue;
        fullText += evt.chunk;
        lineBuffer += evt.chunk;

        const contentLines = lineBuffer.split('\n');
        lineBuffer = contentLines.pop()!;
        for (const line of contentLines) processLine(line);
      }

      // Flush remaining buffer
      if (lineBuffer.trim()) processLine(lineBuffer);
      setArtifactStreaming(false);
      // ── Stream complete ──────────────────────────────────────────────────────
      const assistantText = fullText;
      // Estimate tokens: ~4 chars per token
      estTokensOut = Math.ceil(assistantText.length / 4);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: assistantText,  // full text including code — needed for history rendering
        timestamp: new Date().toISOString(),
        tokensIn:  estTokensIn,
        tokensOut: estTokensOut,
      };
      const finalMessages = [...updatedMessages, assistantMsg];

      // Parse blocks for metadata; use streamed codeText as authoritative content
      const newMsgIndex      = finalMessages.length - 1;
      const parsedBlocks     = parseCodeBlocks(assistantText);
      const meta             = parsedBlocks[0];
      const finalCodeContent = codeText.trim() || meta?.content || '';

      // Only open artifact panel for large full-file responses (>100 lines).
      // Snippets stay in the chat bubble — the artifact panel is for full files only.
      const FULL_FILE_LINE_THRESHOLD = 100;
      if (finalCodeContent) {
        const blockId = `msg${newMsgIndex}-block0`;
        const historyBlock: HistoryBlock = {
          id: blockId,
          language: meta?.language || 'tsx',
          content: finalCodeContent,
          label: meta?.label || 'Updated code',
          cursorHint: meta?.cursorHint,
          messageIndex: newMsgIndex,
          blockIndex: 0,
        };
        const extraBlocks: HistoryBlock[] = (parsedBlocks.slice(1) ?? []).map((b, idx) => ({
          id: `msg${newMsgIndex}-block${idx + 1}`,
          language: b.language,
          content: b.content,
          label: b.label,
          cursorHint: b.cursorHint,
          messageIndex: newMsgIndex,
          blockIndex: idx + 1,
        }));
        setSessionCodeHistory(prev => {
          const existingIds = new Set(prev.map(b => b.id));
          const toAdd = [historyBlock, ...extraBlocks].filter(b => !existingIds.has(b.id));
          return [...prev, ...toAdd];
        });
        // Only open artifact panel for full files, not snippets
        const lineCount = finalCodeContent.split('\n').length;
        if (lineCount >= FULL_FILE_LINE_THRESHOLD) {
          setArtifact({
            type: 'code',
            content: finalCodeContent,
            title: meta?.label || 'Updated code',
            historyId: blockId,
          });
        }
      }

      if (voiceOutputEnabled) speak(assistantText);

      if (activeChatId) {
        const { error } = await supabase
          .from('ai_playground_chats')
          .update({ messages: finalMessages, updated_at: new Date().toISOString() })
          .eq('id', activeChatId);
        if (error) throw error;
        setChats(prev =>
          prev
            .map(c => c.id === activeChatId ? { ...c, messages: finalMessages, updated_at: new Date().toISOString() } : c)
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        );
      } else {
        const title = await generateTitle(currentInput);
        const { data: newChat, error } = await supabase
          .from('ai_playground_chats')
          .insert({ user_id: user.id, title, messages: finalMessages, model: playgroundModel, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .select().single();
        if (error) throw error;
        setChats(prev => [newChat, ...prev]);
        justCreatedChatRef.current = true; // prevent reset effect from clearing the artifact
        setActiveChatId(newChat.id);
      }
    } catch (err) {
      console.error('[Playground] send error:', err);
      const errorMsg: ChatMessage = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date().toISOString() };
      if (activeChatId) setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...updatedMessages, errorMsg] } : c));
    } finally {
      setSending(false);
      // If activeModel is still '…' (e.g. error before done event), reset to configured model
      setActiveModel(prev => prev === '…' ? playgroundModel : prev);
      // Update quota optimistically from local estimates, then sync from DB after a delay
      setQuotaUsed(prev => prev + estTokensIn + estTokensOut);
      setTimeout(() => fetchQuota(), 8000); // DB write may lag — sync after 8s
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── File handling ─────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => setAttachments(prev => [...prev, { name: file.name, content: reader.result as string, type: file.type }]);
      reader.readAsText(file);
    });
    e.target.value = '';
  };
  const readFileAsText = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setAttachments(prev => [...prev, { name: file.name, content: reader.result as string, type: file.type }]);
    reader.readAsText(file);
  };
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(file => readFileAsText(file));
  };

  // ── Chat management ───────────────────────────────────────────────────────────
  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase.from('ai_playground_chats').delete().eq('id', chatId);
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChatId === chatId) setActiveChatId(null);
    } catch (err) { console.error('[Playground] delete error:', err); }
  };
  const startEditTitle = (chat: PlaygroundChat, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingTitleId(chat.id); setEditingTitleValue(chat.title);
  };
  const saveTitle = async (chatId: string) => {
    if (!editingTitleValue.trim()) return;
    try {
      await supabase.from('ai_playground_chats').update({ title: editingTitleValue.trim() }).eq('id', chatId);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: editingTitleValue.trim() } : c));
    } catch (err) { console.error('[Playground] title update error:', err); }
    finally { setEditingTitleId(null); }
  };

  // ── Download transcript ───────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!activeChat) return;
    const modelLabel = getModelDisplayName(activeChat.model ?? playgroundModel);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${activeChat.title}</title>
    <style>
      body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }
      h1 { font-size: 1.5rem; border-bottom: 2px solid #7c3aed; padding-bottom: 8px; color: #4c1d95; }
      .meta { color: #6b7280; font-size: .85rem; margin-bottom: 32px; }
      .msg { margin: 20px 0; }
      .role { font-weight: bold; font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
      .user .role { color: #7c3aed; } .assistant .role { color: #059669; }
      .bubble { padding: 14px 18px; border-radius: 8px; white-space: pre-wrap; }
      .user .bubble { background: #f5f3ff; border-left: 3px solid #7c3aed; }
      .assistant .bubble { background: #f0fdf4; border-left: 3px solid #059669; }
      pre { background: #1e1e1e; color: #86efac; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: .85rem; }
      code { background: #f3f4f6; padding: 2px 5px; border-radius: 3px; font-size: .9em; }
      .time { font-size: .75rem; color: #9ca3af; margin-top: 4px; }
    </style></head><body>
    <h1>${activeChat.title}</h1>
    <div class="meta">${new Date(activeChat.created_at).toLocaleString()} · ${messages.length} messages · Model: ${modelLabel}</div>
    ${messages.map(m => `<div class="msg ${m.role}"><div class="role">${m.role === 'user' ? '👤 You' : '🤖 Claude'}</div><div class="bubble">${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div><div class="time">${new Date(m.timestamp).toLocaleTimeString()}</div></div>`).join('')}
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) win.onload = () => win.print();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const filteredChats = chats.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const charCount     = userInput.length;
  const charWarning   = charCount > MAX_CHAR_LIMIT;

  // ── Voice input ───────────────────────────────────────────────────────────────
  const toggleVoiceInput = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input is not supported. Try Chrome or Edge.'); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = recognitionLang; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setUserInput(prev => prev ? `${prev} ${t}` : t); };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    try { rec.start(); setIsListening(true); }
    catch (err) { console.error('[Playground] voice input error:', err); }
  }, [isListening, recognitionLang]);

  // ══════════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-300 flex-shrink-0 ${sidebarOpen ? 'w-64' : 'w-14'}`}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 flex-shrink-0">
          {sidebarOpen && <span className="text-sm font-semibold text-gray-700">Chats</span>}
          <div className={`flex items-center gap-1 ${!sidebarOpen ? 'flex-col w-full' : ''}`}>
            <button onClick={handleNewChat} title="New chat" className="p-2 rounded-lg hover:bg-purple-50 text-gray-500 hover:text-purple-600 transition-colors"><Plus size={17} /></button>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? 'Collapse' : 'Expand'} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              {sidebarOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
          </div>
        </div>

        {sidebarOpen && (
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search chats..." className="bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none w-full" />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {loadingChats ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
          ) : filteredChats.length === 0 ? (
            sidebarOpen && <div className="px-4 py-8 text-center"><MessageSquare size={22} className="text-gray-300 mx-auto mb-2" /><p className="text-xs text-gray-400">No chats yet</p></div>
          ) : (
            filteredChats.map(chat => (
              <div key={chat.id} onClick={() => setActiveChatId(chat.id)}
                className={`group relative flex items-start gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors ${activeChatId === chat.id ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                <MessageSquare size={13} className="flex-shrink-0 mt-0.5 text-gray-400" />
                {sidebarOpen && (
                  <>
                    <div className="flex-1 min-w-0">
                      {editingTitleId === chat.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input autoFocus value={editingTitleValue} onChange={e => setEditingTitleValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveTitle(chat.id); if (e.key === 'Escape') setEditingTitleId(null); }}
                            className="text-xs border border-purple-300 rounded px-1 py-0.5 w-full outline-none" />
                          <button onClick={() => saveTitle(chat.id)} className="text-green-600"><Check size={11} /></button>
                          <button onClick={() => setEditingTitleId(null)} className="text-gray-400"><X size={11} /></button>
                        </div>
                      ) : <p className="text-xs font-medium truncate">{chat.title}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{formatTime(chat.updated_at)}</p>
                    </div>
                    {editingTitleId !== chat.id && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={e => startEditTitle(chat, e)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600" title="Rename"><Edit3 size={11} /></button>
                        <button onClick={e => handleDeleteChat(chat.id, e)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={11} /></button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 overflow-hidden">

        {/* Chat panel */}
        <div ref={dropZoneRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          className={`relative flex flex-col min-w-0 transition-all duration-300 ${artifact ? 'w-1/2' : 'flex-1'}`}>

          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-purple-50/90 border-4 border-dashed border-purple-400 rounded-xl pointer-events-none">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-3"><Paperclip size={28} className="text-purple-500" /></div>
              <p className="text-lg font-bold text-purple-700">Drop file to attach</p>
              <p className="text-sm text-purple-500 mt-1">Text, code, CSV, JSON and more</p>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><Bot size={13} className="text-white" /></div>
              <div>
                <p className="text-sm font-semibold text-gray-800 leading-tight">
                  {activeChat?.title ?? (profileName
                    ? `Welcome, ${profileName.split(' ')[0]} to the AI Playground`
                    : 'AI Playground')}
                </p>
                {!activeChat && profileName && (
                  <p className="text-xs text-purple-500 leading-tight">Ask a question or paste your code</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-sm font-bold text-purple-700 px-3 py-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 transition-colors border border-purple-200">
                <Home size={15} />Home
              </button>
              <button
                onClick={() => { setVoiceOutputEnabled(v => !v); if (voiceOutputEnabled) cancelSpeech(); }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors border ${voiceOutputEnabled ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700' : 'text-gray-500 border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200'}`}
              >
                {voiceOutputEnabled ? <><Volume2 size={13} /><span className="hidden sm:inline">{isAfrica ? '🇳🇬' : '🔊'} On</span></> : <><VolumeX size={13} /><span className="hidden sm:inline">Voice</span></>}
              </button>
              {activeChat && messages.length > 0 && (
                <button onClick={handleDownload} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-purple-600 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors border border-gray-200 hover:border-purple-200">
                  <Download size={13} />Download
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

            {messages.length === 0 && !sending && (
              <div className="flex flex-col items-center justify-center h-full text-center pb-20">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg"><Bot size={28} className="text-white" /></div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  {profileName
                    ? `Welcome, ${profileName.split(' ')[0]} to the AI Playground`
                    : 'Welcome to the AI Playground'}
                </h2>
                <p className="text-gray-500 text-sm max-w-sm leading-relaxed">
                  Ask anything — code help, research, writing, math, business ideas, or just exploring.<br />
                  I'll help you think it through and understand, not just give you the answer.
                </p>
                {/* Focused-request instruction */}
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 max-w-sm text-left">
                  <p className="text-xs font-semibold text-amber-800 mb-1">💡 To keep AI affordable for everyone</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Keep each chat focused on <strong>one change or question</strong>. If you want to work on something new, start a fresh chat — it keeps things clear and helps the platform reach more people.
                  </p>
                </div>
                {branding.isReady && (
                  <p className="mt-3 text-xs italic text-purple-600 max-w-xs">
                    Built for the young people using {branding.institutionName}.
                  </p>
                )}
              </div>
            )}

            {messages.map((msg, msgIdx) => {
              const parsedBlocks = msg.role === 'assistant' ? parseCodeBlocks(msg.content) : [];
              return (
                <div key={msgIdx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-1"><Bot size={13} className="text-white" /></div>
                  )}
                  <div className={`${artifact ? 'max-w-md' : 'max-w-2xl'}`}>
                    {msg.attachment && msg.attachment.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {msg.attachment.map((att, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1.5 text-purple-700">
                            <Paperclip size={11} /><span className="font-medium">{att.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'}`}>
                      {msg.role === 'assistant'
                        ? (
                          <>
                            <MessageContent
                              text={msg.content}
                              parsedBlocks={parsedBlocks}
                              onOpenBlock={(blockIdx) => openBlockInPanel(parsedBlocks[blockIdx], msgIdx, blockIdx)}
                            />
                            <AIPidginCoachWrapper englishText={msg.content} />
                          </>
                        )
                        : <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      }
                    </div>
                    <div className={`mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      <span className="text-xs text-gray-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.role === 'assistant' && msg.tokensOut && (
                        <span className="ml-2 text-xs text-gray-400">
                          · ↑ {msg.tokensIn?.toLocaleString() ?? '—'} · ↓ {msg.tokensOut.toLocaleString()} tokens
                        </span>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-1"><User size={13} className="text-gray-500" /></div>
                  )}
                </div>
              );
            })}

            {/* Compression banner */}
            {compressionActive && (
              <div className="flex justify-center sticky bottom-2 z-10 pointer-events-none">
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 shadow-sm pointer-events-auto">
                  <span className="text-amber-500 text-base">⚠️</span>
                  <p className="text-xs text-amber-800 leading-snug">
                    <span className="font-semibold">Earlier code blocks have been compressed</span> to manage context length.
                    Re-paste any files you need the AI to reference.
                  </p>
                  <button
                    onClick={() => setCompressionActive(false)}
                    className="ml-2 text-amber-400 hover:text-amber-600 flex-shrink-0"
                    title="Dismiss"
                  >✕</button>
                </div>
              </div>
            )}

            {/* Reflection prompt */}
            {showReflection && !sending && (
              <div className="flex justify-center">
                <div className="bg-purple-50 border border-purple-200 rounded-2xl px-5 py-4 max-w-sm text-center shadow-sm">
                  <p className="text-sm font-semibold text-purple-700 mb-1">🌱 Pause and reflect</p>
                  <p className="text-xs text-purple-600 leading-relaxed">You've had a good session. Before you continue — what's one thing you got out of this conversation, or something you want to remember?</p>
                  <button onClick={() => setShowReflection(false)} className="mt-3 text-xs text-purple-500 hover:text-purple-700 underline">Dismiss</button>
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {sending && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-1"><Bot size={13} className="text-white" /></div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1.5 items-center h-5">
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Voice fallback */}
          {fallbackText && <div className="px-6 pb-2"><VoiceFallback text={fallbackText} onDismiss={clearFallback} /></div>}

          {/* Input area */}
          <div className="px-6 py-4 bg-white border-t border-gray-200 flex-shrink-0">
            {/* Pinned context file pills */}
            {contextFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {contextFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-blue-700 text-xs" title="Pinned to system prompt — available throughout this chat">
                    <Pin size={10} className="flex-shrink-0" />
                    <span className="font-medium max-w-[140px] truncate">{f.filename}</span>
                    <span className="text-blue-400">{Math.round(f.size_chars / 100) / 10}KB</span>
                    <button onClick={() => handleContextFileRemove(f)} className="hover:text-blue-900 ml-0.5"><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1.5 text-purple-700 text-xs">
                    <Paperclip size={11} />
                    <span className="font-medium max-w-[140px] truncate">{att.name}</span>
                    <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="hover:text-purple-900 ml-0.5"><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
            {charWarning && (
              <div className="mb-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} />
                <span>Your message is long ({charCount.toLocaleString()} characters). Consider breaking it into shorter questions for better results.</span>
              </div>
            )}
            {!modelLoaded && (
              <div className="mb-2 flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <Loader2 size={13} className="animate-spin" />
                <span>Loading your model settings — please wait a moment before sending.</span>
              </div>
            )}
            <div className="flex items-end gap-2 bg-white border border-gray-300 rounded-2xl px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100 transition-all">
              <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 p-1 text-gray-400 hover:text-purple-600 transition-colors mb-0.5" title="Attach file (inline — included in this message only)"><Paperclip size={17} /></button>
              <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" accept=".txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.css" multiple />
              <button onClick={() => contextFileInputRef.current?.click()} disabled={contextUploading} className="flex-shrink-0 p-1 text-gray-400 hover:text-blue-600 transition-colors mb-0.5" title="Pin file to context (stays in system prompt for entire chat — ideal for large code files)">
                {contextUploading ? <Loader2 size={17} className="animate-spin" /> : <Pin size={17} />}
              </button>
              <input ref={contextFileInputRef} type="file" onChange={handleContextFileAttach} className="hidden" accept=".txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.css,.sh,.yaml,.yml,.toml,.env" multiple />
              <textarea ref={textareaRef} value={userInput} onChange={e => setUserInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={quotaUsed >= QUOTA_TOKENS ? 'Quota reached — please wait for reset' : 'Message Claude...'} rows={1} disabled={sending || !modelLoaded || quotaUsed >= QUOTA_TOKENS}
                className="flex-1 resize-none outline-none text-base text-gray-800 placeholder-gray-400 bg-transparent min-h-[24px] max-h-[200px] leading-6" />
              <span
                className={`flex-shrink-0 text-xs mb-0.5 pr-1 font-medium transition-colors ${
                  (activeModel || playgroundModel) === 'claude-sonnet-4-6'
                    ? 'text-violet-600'
                    : (activeModel || playgroundModel).includes('llama') || (activeModel || playgroundModel).includes('groq')
                      ? 'text-emerald-600'
                      : 'text-gray-400'
                }`}
                title={`active: ${activeModel || playgroundModel} | configured: ${playgroundModel} | loaded: ${modelLoaded}`}
              >
                {!modelLoaded
                  ? '…'
                  : activeModel === '…'
                    ? '…'
                    : activeModel
                      ? getModelDisplayName(activeModel)
                      : getModelDisplayName(playgroundModel)
                }
              </span>
              <button onClick={toggleVoiceInput} disabled={sending}
                className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all mb-0.5 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}>
                {isListening ? <MicOff size={13} /> : <Mic size={13} />}
              </button>
              <button onClick={handleSend} disabled={(!userInput.trim() && !attachments.length) || sending || !modelLoaded || quotaUsed >= QUOTA_TOKENS}
                className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity mb-0.5">
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>

            {/* ── Quota bar ──────────────────────────────────────────────────────── */}
            {(() => {
              const pct = Math.min(100, Math.round((quotaUsed / QUOTA_TOKENS) * 100));
              const isOver = quotaUsed >= QUOTA_TOKENS;
              const resetTime = quotaWindowStart
                ? new Date(quotaWindowStart.getTime() + QUOTA_WINDOW_MS)
                : null;
              const resetStr = resetTime
                ? resetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null;
              const barColor = pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-purple-400';
              return (
                <div className="mt-2 px-1">
                  <p className="text-xs text-gray-400 mb-1">This bar shows your AI usage. To bring AI to as many people as possible, we set a 3-hour limit on the AI Playground. You can also use <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-500">Google Gemini</a> or <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-500">ChatGPT</a> for additional AI access.</p>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                  <p className="text-center text-xs mt-1 text-gray-400">
                    {isOver
                      ? `You've reached your session quota 💛 — resets at ${resetStr ?? '…'}`
                      : pct > 0
                        ? `You've used ${pct}% of your 3-hour session quota${resetStr ? ` · resets at ${resetStr}` : ''}`
                        : `Enter to send · Shift+Enter for new line${voiceOutputEnabled && (isAfrica || selectedVoice) ? ` · 🔊 ${isAfrica ? 'Ezinne' : `${selectedVoice!.name.split(' ').slice(0, 3).join(' ')}${selectedVoice!.localService ? ' (offline)' : ''}`}` : ''}`}
                  </p>
                </div>
              );
            })()}
            <p className="text-center text-xs text-gray-400 mt-1">Claude is AI and can make mistakes. Please double-check cited sources.</p>
          </div>
        </div>

        {/* ── Artifact panel ──────────────────────────────────────────────────── */}
        {artifact && (
          <div className="w-1/2 border-l border-gray-200 flex-shrink-0 overflow-hidden">
            <ArtifactPanelView
              artifact={artifact}
              sessionHistory={sessionCodeHistory}
              onSelectHistory={selectFromHistory}
              onClose={() => setArtifact(null)}
              onEdit={handleArtifactEdit}
              editInput={artifactEditInput}
              setEditInput={setArtifactEditInput}
              isEditing={artifactEditing}
              isStreaming={artifactStreaming}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AIPlaygroundPage;