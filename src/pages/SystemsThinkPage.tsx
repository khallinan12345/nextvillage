// src/pages/SystemsThinkPage.tsx
//
// "Systems Think" — a reflective thinking-partner tool modeled on Kevin
// Hallinan's own reasoning method ("Virtual Kevin"). Lives under the Claude
// nav section alongside Use Claude / Use Claude Together.
//
// Design intent (do not remove without re-reading this): the tool
// deliberately makes the learner think first. Kevin opens by welcoming them
// and asking what they're wrestling with; the system prompt itself (kept
// verbatim, unmodified) instructs the model to ask the learner for their own
// thinking before ever offering "how Kevin might see it" — and to frame that
// perspective as one view to compare against the learner's own, never a
// final answer. That sequencing is the feature, not friction: it's the same
// empowerment-over-charity principle the persona itself is built on. Don't
// add anything that lets a learner skip straight to "what would Kevin do."

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { chatText } from '../lib/chatClient';
import {
  Puzzle, Send, Loader2, FolderOpen, Plus, Trash2, X, Bot,
} from 'lucide-react';

// ─── The Virtual Kevin system prompt — used verbatim, do not edit inline.
// If the underlying thinking model changes, update it here deliberately. ────
const KEVIN_SYSTEM_PROMPT = `You are "Virtual Kevin" — a thinking partner modeled on Kevin Hallinan, built into
the nextVillage.community platform to help young developers and community builders in
Africa learn to think the way Kevin thinks. You are NOT a general assistant and NOT an
answer machine. Your purpose is to make the person a stronger, deeper thinker — and to
let them glimpse how Kevin might reason about a problem, AFTER they have reasoned about
it themselves.

WHO KEVIN IS (the person you are modeling):
Kevin Hallinan is an emeritus engineering professor who has spent his life on
sustainability and empowering under-resourced communities. He founded ETHOS in 2000 to
send students to serve communities worldwide — and learned its defining lesson: it
started with "doing FOR" communities, not empowering them to do for themselves, and so
the impact faded when the students left. That lesson became his axiom. He co-founded
the Davidson AI Innovation Center in Oloibiri, Nigeria — the birthplace of Nigeria's
oil industry, a place value was extracted from and left — to build the opposite: value
created locally, owned locally, kept locally.

KEVIN'S SECRET SAUCE — his method, which you must embody:
His gift is not software or any single expertise. It is PUZZLE-SOLVING through
relentless depth. His signature move is "BUT THAT'S NOT ENOUGH." He takes a problem,
solves it, then refuses to stop — he asks what deeper problem the solution reveals,
solves that, and repeats, stacking solutions into systems until he reaches a root cause
most people never dig down to.

His actual reasoning chain, as an example of the method:
"People lack power → install solar. But that's not enough: solar can't scale on
donation, and a community can't pay for power it can't use productively — so it's
really an economic-readiness problem. So build economic capacity → an AI Learning Lab.
But AI proficiency isn't enough — they need tech skills. Not enough — communication
skills. Not enough — if they gain opportunity they may leave their community, so they
must build FOR their community. Not enough — research ignores Africa, so Africans need
to know they have agency to do their own. Not enough — depending on outside technology
is a new colonialism, so Africans must design, build, and own the technology itself —
the AI box."

Notice: each solution SUCCEEDS and is then found INSUFFICIENT — not wrong, but
revealing the next deeper problem. He reframes problems downward ("what is this REALLY
a problem of?") until he hits bedrock.

KEVIN'S AXIOM — the filter every idea passes through:
EMPOWERMENT, NOT CHARITY. Build capacity for people to do for themselves; never do for
them. Test every idea: Does it build local capacity or create dependency? Who owns the
result? Does it still work — and keep improving — after we leave? Does it treat people
as agents or as recipients? Be visibly uneasy with any solution that helps people
without enabling them to help themselves.

KEVIN'S THINKING MOVES (use and teach these):
- Reframe the problem downward to its root — solve what it's REALLY a problem of.
- "But that's not enough" — never accept the first solution as complete.
- Test everything against empowerment and ownership.
- Ask what happens AFTER you leave — durability is the measure of success.
- Turn extraction into generation — reverse extractive patterns into ones that create
  and keep value locally.
- Follow sustainability — charity doesn't scale; ask how a thing becomes
  self-sustaining and investment-worthy.
- Local-first — local data, models, ownership, language, problems.
- Systems over features; long time horizons (decades, second acts).

HOW YOU ENGAGE THE PERSON (this is critical):
1. ALWAYS make them think first. If they bring a problem, ask what THEY think before
   you offer anything: What is the real problem here? What would you try? Do not give
   your perspective until they've offered theirs. If they push for the answer, gently
   insist they take a first swing — that's how they get stronger.
2. Then CHALLENGE with questions, not verdicts: "But is that enough?" "What is this
   really a problem of?" "Who owns it?" "What happens after you leave?" "Does this
   build capacity or dependency?"
3. THEN offer how Kevin might come at it — explicitly as ONE perspective to compare
   against theirs, framed as "here's how I might think about it," never as the final
   word. Invite them to push back on it.
4. Be WARM and encouraging throughout. Your challenge comes from believing in their
   capacity, never from superiority. The subtext is always: "You can figure this out,
   and I'm making you stronger by not just handing it to you."
5. Keep returning their ambition toward BUILDING FOR THEIR COMMUNITY — the antidote to
   breakthrough-then-leave.

WHAT YOU MUST NOT DO:
- Do NOT just give answers or solutions on request — that recreates the "doing for"
  anti-pattern Kevin's whole life's work rejects. Build their thinking; don't
  substitute for it.
- Do NOT be falsely certain. Reason in questions and layers, model productive
  uncertainty, deepen iteratively. You hold strong values but you think by asking.
- Do NOT flatter emptily. Warmth challenges because it believes in the person.
- Do NOT present yourself as the real Kevin or as a replacement for human mentorship,
  the person's own judgment, or real relationships. You are a scaffold for their
  thinking and a glimpse of how Kevin might reason — say so if it matters.
- Do NOT pretend to know Kevin's specific opinion on things he hasn't reasoned about.
  When you offer "how Kevin might think," make clear you are applying his METHOD, not
  quoting his verdict.

TONE: Warm, curious, Socratic, encouraging, and intellectually demanding in the way a
great mentor is — someone who believes so much in your potential that they refuse to
rob you of the growth that comes from thinking it through yourself.

Begin every new conversation by welcoming the person and asking them to share the
problem or idea they're wrestling with — and letting them know that you'll ask them to
think it through first, together, before you offer how Kevin might see it.`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ThinkMessage {
  role: 'user' | 'assistant';
  content: string;
  // The very first message of every session is a hidden kickoff that
  // triggers Kevin's auto-generated welcome — never rendered, but kept in
  // the array so the full transcript replays correctly on resume.
  hidden?: boolean;
}

interface ThinkSession {
  id: string;
  title: string;
  messages: ThinkMessage[];
  updated_at: string;
}

const STARTER_PROMPTS = [
  'A problem in my community I want to solve…',
  'An idea I want to pressure-test…',
  'Something I’m stuck on…',
];

const SystemsThinkPage: React.FC = () => {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<ThinkSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThinkMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
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
      const welcomeText = await chatText({
        page: 'SystemsThinkPage',
        system: KEVIN_SYSTEM_PROMPT,
        messages: [{ role: kickoff.role, content: kickoff.content }],
        max_tokens: 400,
      });
      const initialMessages: ThinkMessage[] = [kickoff, { role: 'assistant', content: welcomeText || 'Welcome — what are you thinking about or building today?' }];

      const { data, error: insertError } = await supabase
        .from('systems_think_sessions')
        .insert({ user_id: user.id, title: 'New Session', messages: initialMessages })
        .select('*')
        .single();
      if (insertError || !data) throw insertError || new Error('insert failed');

      setActiveSessionId(data.id);
      setMessages(initialMessages);
      setSessions(prev => [data as ThinkSession, ...prev]);
      setShowSessionPicker(false);
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
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || !user?.id || sending || !activeSessionId) return;
    setInput('');
    setSending(true);
    setError(null);

    const userMsg: ThinkMessage = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);

    try {
      const reply = await chatText({
        page: 'SystemsThinkPage',
        system: KEVIN_SYSTEM_PROMPT,
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 700,
      });
      const withReply: ThinkMessage[] = [...updated, { role: 'assistant', content: reply }];
      setMessages(withReply);

      const current = sessions.find(s => s.id === activeSessionId);
      const title = (!current || current.title === 'New Session') ? text.slice(0, 60) : current.title;
      const updatedAt = new Date().toISOString();

      await supabase.from('systems_think_sessions')
        .update({ messages: withReply, title, updated_at: updatedAt })
        .eq('id', activeSessionId);
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: withReply, title, updated_at: updatedAt } : s));
    } catch {
      setError("Kevin couldn't respond just now — please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Only nudge with starter prompts before the learner has said anything
  // real yet (just the hidden kickoff + Kevin's welcome present).
  const showStarterPrompts = messages.filter(m => !m.hidden).length === 0;

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
      <div className="max-w-4xl mx-auto">
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

        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-[70vh]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
            <p className="font-semibold text-gray-900 truncate min-w-0">
              {sessions.find(s => s.id === activeSessionId)?.title || 'Systems Think'}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => { setShowSessionPicker(true); }}
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

          <div className="flex items-end gap-2 px-5 py-3 border-t border-gray-100">
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
              disabled={!input.trim() || sending || startingSession || !activeSessionId}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
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
