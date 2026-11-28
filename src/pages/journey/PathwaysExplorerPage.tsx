// src/pages/journey/PathwaysExplorerPage.tsx
//
// Phase 1 pilot of the personalized learning journey: Stages 1-3 only
// (Orientation, Discovery, The Big Picture). Reachable only by direct link —
// deliberately not added to any navigation or sidebar, so it can be tested
// with a small group before anything downstream of it gets built (Stage 4
// "Choosing a Direction" and beyond). Nothing here is saved yet; the
// conversation lives only in this page's own state.

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { chatText } from '../../lib/chatClient';
import { supabase } from '../../lib/supabaseClient';
import { cleanReply } from '../../lib/promptChallenge';
import {
  buildJourneyMentorPrompt,
  journeyOpeningMessage,
  type PathwayCatalogRow,
} from '../../lib/journeyMentorPrompt';
import PathwayBrowser, { type BrowsablePathway } from './PathwayBrowser';

// pathway_catalog() returns more columns than the mentor prompt needs
// (journeyMentorPrompt's PathwayCatalogRow); this page also needs id and
// cluster_key for the shortlist browser, so it keeps the fuller row shape.
type CatalogRow = PathwayCatalogRow & BrowsablePathway;

// Same Mermaid renderer the AI tutoring pages already use for diagrams
// (src/components/viz), lazy-loaded the same way since the library is large.
const MermaidDiagram = lazy(() => import('../../components/viz/MermaidDiagram'));

// A fixed, hand-authored diagram (not AI-generated), so it needs no validation
// pass — just the mentoring journey's own throughline: interests lead to
// aligned learning, which leads to both a career/life for the learner and a
// benefit for their community. Colors reuse the same palette MermaidDiagram.tsx
// sets globally (emerald/amber), so this matches every other diagram on the site.
const JOURNEY_DIAGRAM = `flowchart LR
  A[Your Interests and Strengths] --> B[Mentoring Conversation]
  B --> C[Learning Aligned to You]
  C --> D[Your Career and Life]
  C --> E[Your Community]
  classDef career fill:#ecfdf5,stroke:#059669,color:#064e3b
  classDef community fill:#fffbeb,stroke:#f59e0b,color:#78350f
  class D career
  class E community`;

type Message = { role: 'user' | 'assistant'; content: string };
type Phase = 'loading' | 'chat' | 'error';

function readSavedMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is Message =>
    !!m && typeof m === 'object'
    && ((m as Record<string, unknown>).role === 'user' || (m as Record<string, unknown>).role === 'assistant')
    && typeof (m as Record<string, unknown>).content === 'string'
    && (m as Record<string, unknown>).content !== '',
  );
}

// The mentor is asked to put each pathway on its own dashed line and end
// every message with one question on its own line, so this renders those as
// a real list and makes the question stand out instead of dumping everything
// into one dense paragraph.
function AssistantContent({ content }: { content: string }) {
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => {
        const isBullet = /^[-•]\s+/.test(line);
        const text = isBullet ? line.replace(/^[-•]\s+/, '') : line;
        const isQuestion = text.endsWith('?');
        const questionClass = isQuestion ? 'font-semibold text-blue-900' : '';
        if (isBullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-blue-700 font-bold shrink-0">•</span>
              <span className={questionClass}>{text}</span>
            </div>
          );
        }
        return <p key={i} className={questionClass}>{text}</p>;
      })}
    </div>
  );
}

export default function PathwaysExplorerPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [shortlist, setShortlist] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: catalogData, error: catalogError } = await supabase.rpc('pathway_catalog');
      if (cancelled) return;
      if (catalogError || !catalogData) { setPhase('error'); return; }
      setCatalog(catalogData as CatalogRow[]);

      // Resume an in-progress conversation if one was saved, so a refresh
      // never means starting over.
      const { data: savedData } = await supabase.rpc('my_journey_session');
      if (cancelled) return;
      const saved = readSavedMessages(savedData);
      setMessages(saved.length > 0 ? saved : [{ role: 'assistant', content: journeyOpeningMessage() }]);

      // Stage 4: the learner's current shortlist (pathways marked "exploring").
      const { data: shortlistData } = await supabase
        .from('pathway_shortlist')
        .select('pathway_id, status');
      if (cancelled) return;
      if (Array.isArray(shortlistData)) {
        setShortlist(new Set(
          shortlistData.filter((r) => r.status === 'exploring').map((r) => r.pathway_id as string),
        ));
      }

      setPhase('chat');
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || phase !== 'chat') return;
    const withLearner: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(withLearner);
    setInput('');
    setBusy(true);
    setNotice(null);
    try {
      const reply = cleanReply(await chatText({
        page: 'PathwaysExplorerPage',
        system: buildJourneyMentorPrompt(catalog),
        messages: withLearner,
        max_tokens: 500,
      }));
      const full: Message[] = [...withLearner, { role: 'assistant', content: reply }];
      setMessages(full);
      supabase.rpc('save_journey_session', { p_transcript: full }).then(({ error: saveError }) => {
        if (saveError) setNotice('Your conversation was saved up to your last message, but the latest reply may not have saved. If you refresh, you may need to repeat your last message.');
      });
    } catch {
      setNotice('The mentor could not answer just now. Please try sending your message again.');
      setMessages(messages);
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  async function toggleShortlist(pathwayId: string, nowExploring: boolean) {
    setShortlist((prev) => {
      const next = new Set(prev);
      if (nowExploring) next.add(pathwayId); else next.delete(pathwayId);
      return next;
    });
    const { error } = await supabase.rpc('set_pathway_shortlist_status', {
      p_pathway_id: pathwayId,
      p_status: nowExploring ? 'exploring' : 'dropped',
    });
    if (error) {
      setShortlist((prev) => {
        const next = new Set(prev);
        if (nowExploring) next.delete(pathwayId); else next.add(pathwayId);
        return next;
      });
      setNotice('Could not save that change. Please try again.');
    }
  }

  if (phase === 'loading') {
    return <div className="max-w-2xl mx-auto p-6 text-gray-600">Loading your mentor…</div>;
  }

  if (phase === 'error') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">We could not load this page</h1>
        <p className="text-gray-600 mb-4">Please try again in a moment.</p>
        <Link to="/dashboard" className="text-blue-700 underline">Back to your dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <header>
        <Link to="/dashboard" className="text-sm text-blue-700 underline">Back to your dashboard</Link>
        <p className="text-xs text-gray-500 mt-0.5">
          Your conversation saves automatically, so you can pick up where you left off.
        </p>
        <h1 className="mt-3 text-xl font-semibold text-gray-900">Explore your path</h1>
        <p className="text-sm text-gray-600 mt-1">A conversation to help you think about the kind of work and life you might want.</p>
      </header>

      <div className="rounded-xl p-3 shadow-xs" style={{ background: '#eef2ff', border: '2px solid #818cf8' }}>
        <p className="text-xs font-bold mb-2 uppercase tracking-wide text-indigo-700">Your journey</p>
        <Suspense fallback={<p className="text-sm text-slate-500">Drawing diagram…</p>}>
          <MermaidDiagram code={JOURNEY_DIAGRAM} alt="Your interests and strengths lead into a mentoring conversation, which leads to learning aligned to you, which leads to both your career and life and your community" />
        </Suspense>
      </div>

      <div className="flex flex-col gap-3" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'self-end max-w-[85%] rounded-lg bg-blue-700 text-white px-3 py-2 whitespace-pre-wrap'
                : 'self-start max-w-[85%] rounded-lg bg-gray-100 text-gray-900 px-3.5 py-3'
            }
          >
            {m.role === 'user' ? m.content : <AssistantContent content={m.content} />}
          </div>
        ))}
        {busy && <div className="self-start text-sm text-gray-500">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      {notice && <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{notice}</p>}

      <div className="flex flex-col gap-2">
        <label htmlFor="journey-input" className="text-sm font-medium text-gray-700">Your message</label>
        <textarea
          id="journey-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          rows={3}
          disabled={busy}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="Write here…"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || input.trim() === ''}
          className="self-start px-4 py-2 rounded-md bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Send
        </button>
      </div>

      <PathwayBrowser catalog={catalog} shortlist={shortlist} onToggle={(id, now) => void toggleShortlist(id, now)} />
    </div>
  );
}
