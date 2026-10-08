import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { chatText } from '../../lib/chatClient';
import { supabase } from '../../lib/supabaseClient';
import { finishAnchorAttempt, saveAnchorTranscript } from '../../lib/anchorAttempts';
import {
  buildChallengeSystemPrompt,
  canFinish,
  challengeGreeting,
  cleanReply,
  readTranscript,
  toModelMessages,
  type ChallengeMessage,
  type ChallengeModule,
} from '../../lib/promptChallenge';

// A short, standardized activity: the same facilitator rules for every learner
// at every checkpoint, and a clean conversation each time. The conversation is
// saved as the learner goes so it can be resumed. Learners never see scores.

type Phase = 'loading' | 'chat' | 'done' | 'error';

export default function PromptChallengePage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [module, setModule] = useState<ChallengeModule | null>(null);
  const [messages, setMessages] = useState<ChallengeMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!attemptId) { setPhase('error'); return; }
      const { data: attempt, error } = await supabase
        .from('anchor_attempts')
        .select('id, learning_module_id, transcript, completed_at')
        .eq('id', attemptId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !attempt) { setPhase('error'); return; }
      if (attempt.completed_at) { setPhase('done'); return; }

      const { data: mod } = await supabase
        .from('learning_modules')
        .select('title, description, ai_facilitator_instructions')
        .eq('learning_module_id', attempt.learning_module_id)
        .maybeSingle();
      if (cancelled) return;
      if (!mod) { setPhase('error'); return; }

      setModule(mod as ChallengeModule);
      const saved = readTranscript(attempt.transcript);
      setMessages(
        saved.length > 0
          ? saved
          : [{ role: 'assistant', content: challengeGreeting(mod.title), timestamp: new Date().toISOString() }],
      );
      setPhase('chat');
    })();
    return () => { cancelled = true; };
  }, [attemptId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !module || !attemptId) return;
    const withLearner: ChallengeMessage[] = [...messages, { role: 'user', content: text, timestamp: new Date().toISOString() }];
    setMessages(withLearner);
    setInput('');
    setBusy(true);
    setNotice(null);
    try {
      const reply = cleanReply(await chatText({
        page: 'PromptChallengePage',
        system: buildChallengeSystemPrompt(module),
        messages: toModelMessages(withLearner),
        max_tokens: 400,
      }));
      const full: ChallengeMessage[] = [...withLearner, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }];
      setMessages(full);
      saveAnchorTranscript(supabase, attemptId, full).catch(() => {
        setNotice('Your last message was not saved yet. Keep going, it will save with the next one.');
      });
    } catch {
      setNotice('The assistant could not answer just now. Please try sending your message again.');
      setMessages(messages);
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!attemptId || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await finishAnchorAttempt(supabase, attemptId, null, messages);
      setPhase('done');
    } catch {
      setNotice('We could not save your work just now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'loading') {
    return <div className="max-w-2xl mx-auto p-6 text-gray-600">Loading your challenge…</div>;
  }

  if (phase === 'error') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">We could not open this challenge</h1>
        <p className="text-gray-600 mb-4">It may have been finished already, or the link is not right.</p>
        <Link to="/dashboard" className="text-blue-700 underline">Back to your dashboard</Link>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Thank you, you are finished</h1>
        <p className="text-gray-600 mb-4">
          Your work has been saved. Your facilitators and the research team will use it to see how
          learning grows over time.
        </p>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 rounded-md bg-blue-700 text-white font-medium hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Back to your dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <header>
        <Link to="/dashboard" className="text-sm text-blue-700 underline">Back to your dashboard</Link>
        <p className="text-xs text-gray-500 mt-0.5">Your conversation is saved. You can come back and continue later.</p>
        <h1 className="mt-3 text-xl font-semibold text-gray-900">{module?.title}</h1>
        {module?.description && <p className="text-sm text-gray-600 mt-1">{module.description}</p>}
      </header>

      <div className="flex flex-col gap-3" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'self-end max-w-[85%] rounded-lg bg-blue-700 text-white px-3 py-2 whitespace-pre-wrap'
                : 'self-start max-w-[85%] rounded-lg bg-gray-100 text-gray-900 px-3 py-2 whitespace-pre-wrap'
            }
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="self-start text-sm text-gray-500">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      {notice && <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{notice}</p>}

      <div className="flex flex-col gap-2">
        <label htmlFor="challenge-input" className="text-sm font-medium text-gray-700">Your message</label>
        <textarea
          id="challenge-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          rows={3}
          disabled={busy}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="Write here…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || input.trim() === ''}
            className="px-4 py-2 rounded-md bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={busy || !canFinish(messages)}
            className="px-4 py-2 rounded-md border border-gray-400 text-gray-800 font-medium hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            I am finished
          </button>
          {!canFinish(messages) && (
            <span className="text-xs text-gray-500">You can finish after a few messages.</span>
          )}
        </div>
      </div>
    </div>
  );
}
