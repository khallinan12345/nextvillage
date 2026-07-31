// src/pages/SystemsThinkPage.tsx
//
// "Systems Think" — a reflective thinking-partner tool modeled on Kevin
// Hallinan's own reasoning method ("Virtual Kevin"). Lives under the Claude
// nav section alongside Use Claude / Use Claude Together.
//
// Design intent (do not remove without re-reading this): the tool
// deliberately makes the learner think first. Kevin opens by welcoming them
// and asking what they're wrestling with; the system prompt (see
// api/systems-think.js — kept verbatim there, don't fork a copy here)
// instructs the model to ask the learner for their own thinking before ever
// offering "how Kevin might see it," and to frame that perspective as one
// view to compare against the learner's own, never a final answer. That
// sequencing is the feature, not friction: it's the same empowerment-over-
// charity principle the persona itself is built on. Don't add anything that
// lets a learner skip straight to "what would Kevin do."
//
// The actual persona + the "thinking artifact" tool-use logic live
// server-side in api/systems-think.js (a dedicated Anthropic call, not the
// generic multi-provider /api/chat) — this page only holds conversation and
// session-persistence state.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import {
  Puzzle, Send, Loader2, FolderOpen, Plus, Trash2, X, Bot,
  Paperclip, Image as ImageIcon, FileText, Download, BookOpen,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Attachment {
  type: 'image' | 'text';
  name: string;
  mimeType?: string;
  dataUrl?: string;      // images — base64 data URI
  textContent?: string;  // text files — raw content, capped server-side
}

interface ThinkMessage {
  role: 'user' | 'assistant';
  content: string;
  // The very first message of every session is a hidden kickoff that
  // triggers Kevin's auto-generated welcome — never rendered, but kept in
  // the array so the full transcript replays correctly on resume.
  hidden?: boolean;
  attachment?: Attachment;
}

interface ThinkSession {
  id: string;
  title: string;
  messages: ThinkMessage[];
  artifact_content: string | null;
  updated_at: string;
}

const STARTER_PROMPTS = [
  'A problem in my community I want to solve…',
  'An idea I want to pressure-test…',
  'Something I’m stuck on…',
];

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

const SystemsThinkPage: React.FC = () => {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<ThinkSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThinkMessage[]>([]);
  const [artifactContent, setArtifactContent] = useState<string>('');
  const [input, setInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [sending, setSending] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [downloadingArtifact, setDownloadingArtifact] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // ── Kevin's opening welcome — an invisible kickoff turn so the model's
  // own "begin every conversation by welcoming them" instruction fires
  // without the learner ever seeing a synthetic first message. ────────────
  const beginSession = useCallback(async () => {
    if (!user?.id) return;
    setStartingSession(true);
    setError(null);
    try {
      const kickoff: ThinkMessage = { role: 'user', content: '(Starting a new Systems Think session.)', hidden: true };
      const res = await fetch('/api/systems-think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, messages: [kickoff], currentArtifact: null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'failed');

      const initialMessages: ThinkMessage[] = [kickoff, { role: 'assistant', content: data.reply }];

      const { data: row, error: insertError } = await supabase
        .from('systems_think_sessions')
        .insert({
          user_id: user.id, title: 'New Session', messages: initialMessages,
          artifact_content: data.artifactContent || null,
        })
        .select('*')
        .single();
      if (insertError || !row) throw insertError || new Error('insert failed');

      setActiveSessionId(row.id);
      setMessages(initialMessages);
      setArtifactContent(row.artifact_content || '');
      setSessions(prev => [row as ThinkSession, ...prev]);
      setShowSessionPicker(false);
      setArtifactPanelOpen(false);
    } catch {
      setError('Could not start a new session — please try again.');
    } finally {
      setStartingSession(false);
    }
  }, [user?.id]);

  // ── Load past sessions; auto-open the picker if any exist, otherwise
  // start fresh straight away. ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('systems_think_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        const rows = (data ?? []) as ThinkSession[];
        setSessions(rows);
        if (rows.length > 0) {
          setShowSessionPicker(true);
        } else {
          beginSession();
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadSession = (s: ThinkSession) => {
    setActiveSessionId(s.id);
    setMessages(s.messages || []);
    setArtifactContent(s.artifact_content || '');
    setShowSessionPicker(false);
    setError(null);
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await supabase.from('systems_think_sessions').delete().eq('id', id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionIdRef.current === id) {
        setActiveSessionId(null);
        setMessages([]);
        setArtifactContent('');
      }
    } finally {
      setDeletingId(null);
    }
  };

  // ── Attachments ───────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('That file is too large — please choose one under 4MB.');
      return;
    }
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isText = file.type.startsWith('text/') || /\.(txt|md)$/i.test(file.name);

    try {
      if (isImage) {
        const dataUrl = await readFileAsDataUrl(file);
        setPendingAttachment({ type: 'image', name: file.name, mimeType: file.type, dataUrl });
      } else if (isText) {
        const text = await file.text();
        setPendingAttachment({ type: 'text', name: file.name, textContent: text.slice(0, 60000) });
      } else {
        setError('Please attach an image (PNG/JPEG/GIF/WEBP) or a text file (.txt/.md).');
      }
    } catch {
      setError('Could not read that file — please try again.');
    }
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !pendingAttachment) || !user?.id || sending || !activeSessionId) return;
    setInput('');
    const attachment = pendingAttachment ?? undefined;
    setPendingAttachment(null);
    setSending(true);
    setError(null);

    const userMsg: ThinkMessage = {
      role: 'user',
      content: text || (attachment ? `(sharing ${attachment.type === 'image' ? 'an image' : 'a file'}: ${attachment.name})` : ''),
      ...(attachment ? { attachment } : {}),
    };
    const updated = [...messages, userMsg];
    setMessages(updated);

    try {
      const res = await fetch('/api/systems-think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, messages: updated, currentArtifact: artifactContent || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'failed');

      const withReply: ThinkMessage[] = [...updated, { role: 'assistant', content: data.reply }];
      setMessages(withReply);

      const artifactChanged = !!data.artifactContent && data.artifactContent !== artifactContent;
      if (artifactChanged) setArtifactContent(data.artifactContent);

      const current = sessions.find(s => s.id === activeSessionId);
      const title = (!current || current.title === 'New Session') ? (text.slice(0, 60) || 'New Session') : current.title;
      const updatedAt = new Date().toISOString();

      const dbUpdate: Record<string, unknown> = { messages: withReply, title, updated_at: updatedAt };
      if (artifactChanged) {
        dbUpdate.artifact_content = data.artifactContent;
        dbUpdate.artifact_updated_at = updatedAt;
      }

      await supabase.from('systems_think_sessions').update(dbUpdate).eq('id', activeSessionId);
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, ...dbUpdate } as ThinkSession : s));
    } catch {
      setError("Kevin couldn't respond just now — please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Artifact download (PDF) ─────────────────────────────────────────────
  const handleDownloadArtifact = async () => {
    if (downloadingArtifact || !artifactContent.trim()) return;
    setDownloadingArtifact(true);
    try {
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) { setError('PDF generation is not available right now.'); return; }
      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;
      const ensureSpace = (needed: number) => { if (y + needed > pageHeight - margin) { doc.addPage(); y = margin; } };

      const title = sessions.find(s => s.id === activeSessionId)?.title || 'Systems Think';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      for (const line of doc.splitTextToSize(title, maxWidth)) { ensureSpace(9); doc.text(line, margin, y); y += 9; }
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const paragraphs = artifactContent.trim().split(/\n{2,}/);
      for (const para of paragraphs) {
        for (const line of doc.splitTextToSize(para.trim(), maxWidth)) { ensureSpace(6.5); doc.text(line, margin, y); y += 6.5; }
        y += 4;
      }
      doc.save(`${title.replace(/\s+/g, '-').toLowerCase()}-artifact.pdf`);
    } finally {
      setDownloadingArtifact(false);
    }
  };

  // Only nudge with starter prompts before the learner has said anything
  // real yet (just the hidden kickoff + Kevin's welcome present).
  const showStarterPrompts = messages.filter(m => !m.hidden).length === 0;
  const artifactParagraphs = useMemo(
    () => artifactContent.trim() ? artifactContent.trim().split(/\n{2,}/).map(p => p.trim()).filter(Boolean) : [],
    [artifactContent]
  );

  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-violet-500" size={32} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className={artifactPanelOpen ? 'max-w-6xl mx-auto' : 'max-w-4xl mx-auto'}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600">
            <Puzzle size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Systems Think</h1>
            <p className="text-sm text-gray-500">Practice thinking through problems the way Kevin does.</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          This isn't an answer machine — it's a thinking partner. You'll be asked to work through
          the problem yourself first; only after that will it offer how Kevin might come at it, as
          one perspective to compare against your own. The goal is to strengthen <em>your</em> thinking,
          not replace it.
        </p>

        <div className="flex gap-4 h-[70vh]">
          <div className={`bg-white border border-gray-200 rounded-2xl flex flex-col min-w-0 transition-all duration-300 ${artifactPanelOpen ? 'w-1/2' : 'flex-1'}`}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <p className="font-semibold text-gray-900 truncate min-w-0">
                {sessions.find(s => s.id === activeSessionId)?.title || 'Systems Think'}
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setArtifactPanelOpen(o => !o)}
                  className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors ${
                    artifactPanelOpen
                      ? 'text-white bg-violet-600 border-violet-600 hover:bg-violet-700'
                      : 'text-violet-600 hover:text-violet-700 border-violet-200 hover:border-violet-300 bg-violet-50'
                  }`}
                >
                  <BookOpen size={13} /> {artifactPanelOpen ? 'Hide Artifact' : 'Artifact'}
                </button>
                <button
                  onClick={() => setShowSessionPicker(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-violet-600 border border-gray-200 hover:border-violet-200 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <FolderOpen size={13} /> History
                </button>
                <button
                  onClick={beginSession}
                  disabled={startingSession}
                  className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 border border-violet-200 hover:border-violet-300 bg-violet-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                >
                  <Plus size={13} /> New Session
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {startingSession && messages.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                  <Loader2 size={16} className="animate-spin" /> Kevin is settling in…
                </div>
              ) : (
                messages.filter(m => !m.hidden).map((msg, i) => {
                  const isMe = msg.role === 'user';
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <div className={`flex-1 rounded-2xl px-4 py-2.5 max-w-[85%] ${
                        isMe ? 'bg-violet-600 text-white ml-auto' : 'bg-purple-50 border border-purple-100'
                      }`}>
                        <p className={`text-xs font-semibold mb-0.5 flex items-center gap-1 ${isMe ? 'text-violet-100' : 'text-purple-500'}`}>
                          {!isMe && <Bot size={12} />} {isMe ? 'You' : 'Virtual Kevin'}
                        </p>
                        {msg.attachment?.type === 'image' && msg.attachment.dataUrl && (
                          <img src={msg.attachment.dataUrl} alt={msg.attachment.name} className="rounded-lg max-w-full max-h-56 object-contain mb-1.5" />
                        )}
                        {msg.attachment?.type === 'text' && (
                          <p className={`text-xs mb-1.5 flex items-center gap-1 ${isMe ? 'text-violet-100' : 'text-gray-500'}`}>
                            <FileText size={11} /> {msg.attachment.name}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
              {sending && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 size={13} className="animate-spin" /> Kevin is thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {error && <p className="text-xs text-red-500 px-5 pb-1">{error}</p>}

            {showStarterPrompts && !startingSession && (
              <div className="px-5 pb-2 flex flex-wrap gap-2">
                {STARTER_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => setInput(p.replace('…', ' '))}
                    className="text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-full px-3 py-1.5 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {pendingAttachment && (
              <div className="px-5 pt-2 flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs bg-violet-50 border border-violet-200 text-violet-700 rounded-full pl-2 pr-1.5 py-1">
                  {pendingAttachment.type === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
                  <span className="max-w-[180px] truncate">{pendingAttachment.name}</span>
                  <button onClick={() => setPendingAttachment(null)} className="hover:text-violet-900 p-0.5"><X size={12} /></button>
                </div>
              </div>
            )}

            <div className="flex items-end gap-2 px-5 py-3 border-t border-gray-100">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,text/plain,text/markdown,.md"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || startingSession || !activeSessionId}
                title="Attach an image or text file"
                className="flex-shrink-0 w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:text-violet-600 hover:border-violet-300 disabled:opacity-40 transition-colors"
              >
                <Paperclip size={15} />
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={startingSession ? 'Kevin is settling in…' : 'Share your thinking…'}
                disabled={sending || startingSession || !activeSessionId}
                className="flex-1 resize-none outline-none text-sm bg-gray-50 rounded-xl px-3 py-2 max-h-32 focus:ring-2 focus:ring-violet-100"
              />
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && !pendingAttachment) || sending || startingSession || !activeSessionId}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>

          {/* ── Thinking artifact panel ─────────────────────────────────── */}
          {artifactPanelOpen && (
            <div className="w-1/2 min-w-0 bg-white border border-gray-200 rounded-2xl flex flex-col overflow-hidden flex-shrink-0">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 min-w-0">
                  <BookOpen size={16} className="text-violet-600 flex-shrink-0" /> <span className="truncate">Thinking Artifact</span>
                </h2>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={handleDownloadArtifact}
                    disabled={!artifactContent.trim() || downloadingArtifact}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 border border-violet-200 hover:border-violet-300 bg-violet-50 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {downloadingArtifact ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF
                  </button>
                  <button onClick={() => setArtifactPanelOpen(false)} className="p-1 text-gray-400 hover:text-gray-700" title="Close panel">
                    <X size={17} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {artifactParagraphs.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-12">
                    Nothing captured yet — keep thinking it through with Kevin and a working document will build up here.
                  </p>
                ) : (
                  artifactParagraphs.map((para, i) => (
                    <p key={i} className="text-gray-800 leading-relaxed whitespace-pre-wrap mb-4 text-sm">{para}</p>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Session picker ──────────────────────────────────────────────── */}
      {showSessionPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FolderOpen size={18} className="text-violet-600" /> Your Sessions
              </h2>
              {(activeSessionId || sessions.length > 0) && (
                <button onClick={() => setShowSessionPicker(false)} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {sessions.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No sessions yet — start your first one below.</p>
              ) : sessions.map(s => (
                <button key={s.id} onClick={() => loadSession(s)}
                  className="w-full text-left p-3 bg-gray-50 hover:bg-violet-50 border border-gray-200 hover:border-violet-200 rounded-xl transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(s.updated_at).toLocaleDateString()}</p>
                    </div>
                    <button onClick={e => handleDeleteSession(e, s.id)} disabled={deletingId === s.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors flex-shrink-0">
                      {deletingId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 pb-4 flex-shrink-0">
              <button onClick={beginSession} disabled={startingSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl transition-colors disabled:opacity-50">
                {startingSession ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Start New Session
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default SystemsThinkPage;
