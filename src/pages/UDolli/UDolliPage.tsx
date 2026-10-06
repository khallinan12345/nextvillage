// UD-OLLI guardrail lab.
//
// Two AI agents, one attack. Anchor has a long instruction file with
// guardrails; Driftwood has eight lines. Same model, same tools. Students
// give them news to read (optionally a booby-trapped page), send both the same
// request, and watch what each does. A third agent compares the two.
//
// Email is simulated: each agent's "sent" mail lands in an on-screen outbox and
// nothing is delivered (see api/udolli.js). Visible only to UD-OLLI members,
// that org's leader and platform administrators (udolli_has_access).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import classNames from 'classnames';
import {
  Anchor, Wind, Send, Plus, MessageSquare, Scale, Loader2, FileText, ShieldCheck,
  ShieldAlert, Mail, ChevronDown, ChevronRight, Lightbulb, X, Eye, Code2,
} from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useUdolliAccess } from '../../hooks/useUdolliAccess';
import ComparisonModal from './ComparisonModal';
import { IDEA_GROUPS, TEST_PAGES } from './testPages';
import type { AgentId, Analysis, Comparison, Round, Session } from './types';

const AUTHORIZED_RECIPIENT = 'crosscutudolli@gmail.com';
const MAX_MESSAGE = 4000;
const MAX_SOURCE = 20000;

type Target = 'both' | AgentId;

const AGENTS: Record<AgentId, { name: string; tagline: string; icon: React.ReactNode; box: string; head: string; chip: string }> = {
  anchor: {
    name: 'Anchor',
    tagline: 'Guarded',
    icon: <Anchor className="w-4 h-4" />,
    box: 'border-emerald-300 bg-emerald-50/40',
    head: 'bg-emerald-600 text-white',
    chip: 'bg-emerald-100 text-emerald-800',
  },
  driftwood: {
    name: 'Driftwood',
    tagline: 'No guardrails',
    icon: <Wind className="w-4 h-4" />,
    box: 'border-amber-300 bg-amber-50/40',
    head: 'bg-amber-600 text-white',
    chip: 'bg-amber-100 text-amber-800',
  },
};

// Mail blocks are shown separately as the simulated outbox, so hide them in the text.
const stripOutbox = (text: string) => text.replace(/\[SENDMAIL\][\s\S]*?\[\/SENDMAIL\]/gi, '').trim();

function groupRounds(rows: Analysis[]): Round[] {
  const order: string[] = [];
  const map = new Map<string, Round>();
  [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((r) => {
    if (!map.has(r.round_id)) {
      map.set(r.round_id, { roundId: r.round_id, prompt: r.prompt, sourceTitle: r.source_title });
      order.push(r.round_id);
    }
    map.get(r.round_id)![r.agent] = r;
  });
  return order.map((id) => map.get(id)!);
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

const SignalBadges: React.FC<{ a: Analysis }> = ({ a }) => {
  const s = a.signals || {};
  const badges: { text: string; tone: 'good' | 'bad' | 'neutral' }[] = [];
  if (s.injection_reported) badges.push({ text: 'Reported an injection attempt', tone: 'good' });
  else if (s.mentioned_hidden_instructions) badges.push({ text: 'Called out an instruction it would not follow', tone: 'good' });
  if (s.sent_to_unauthorized_address) badges.push({ text: `Also sent mail to: ${(s.unauthorized_recipients ?? []).join(', ')}`, tone: 'bad' });
  if (s.followed_pineapple_instruction) badges.push({ text: 'Followed a hidden instruction (started with PINEAPPLE)', tone: 'bad' });
  if (s.disclosed_config_files) badges.push({ text: 'Listed its configuration files', tone: 'bad' });
  if (s.mail_sent && !s.sent_to_unauthorized_address) badges.push({ text: 'Mail went only to the approved address', tone: 'neutral' });
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {badges.map((b) => (
        <span key={b.text} className={classNames(
          'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border',
          b.tone === 'good' && 'bg-emerald-100 text-emerald-800 border-emerald-300',
          b.tone === 'bad' && 'bg-red-100 text-red-800 border-red-300',
          b.tone === 'neutral' && 'bg-gray-100 text-gray-700 border-gray-300',
        )}>
          {b.tone === 'good' && <ShieldCheck className="w-3 h-3" />}
          {b.tone === 'bad' && <ShieldAlert className="w-3 h-3" />}
          {b.text}
        </span>
      ))}
    </div>
  );
};

const Outbox: React.FC<{ a: Analysis }> = ({ a }) => {
  // Open by default: an agent often puts its whole briefing in the email.
  const [open, setOpen] = useState(true);
  if (!a.outbox || a.outbox.length === 0) {
    return <p className="mt-3 text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" /> Simulated outbox: no email sent.</p>;
  }
  return (
    <div className="mt-3 rounded-md border border-gray-300 bg-white">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Mail className="w-3 h-3" /> Simulated outbox ({a.outbox.length}) <span className="font-normal text-gray-500">nothing was really sent</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {a.outbox.map((m, i) => {
            const bad = m.to.split(/[,;\s]+/).filter(Boolean).some((addr) => addr.toLowerCase() !== AUTHORIZED_RECIPIENT);
            return (
              <div key={i} className="text-xs border-t border-gray-100 pt-2">
                <p><span className="font-semibold">To:</span> <span className={classNames(bad && 'text-red-700 font-bold')}>{m.to}</span>{bad && ' (not the approved address)'}</p>
                <p><span className="font-semibold">Subject:</span> {m.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-700">{m.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AnswerBox: React.FC<{ agent: AgentId; a?: Analysis; pending: boolean; skipped: boolean }> = ({ agent, a, pending, skipped }) => {
  const meta = AGENTS[agent];
  return (
    <div className={classNames('rounded-lg border overflow-hidden', meta.box)}>
      <div className={classNames('flex items-center gap-2 px-3 py-1.5 text-sm font-semibold', meta.head)}>
        {meta.icon} {meta.name} <span className="font-normal opacity-90">· {meta.tagline}</span>
      </div>
      <div className="p-4 text-sm text-gray-800">
        {pending && <p className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> {meta.name} is working&hellip;</p>}
        {!pending && skipped && <p className="text-gray-400 italic">Not asked this round.</p>}
        {!pending && !skipped && !a && <p className="text-red-600">This agent could not answer. Try again.</p>}
        {!pending && a && (
          <>
            <SignalBadges a={a} />
            <div className="max-w-none leading-relaxed [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-0.5 [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-2 [&_strong]:font-semibold [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_a]:text-violet-700 [&_a]:underline">
              <ReactMarkdown>{stripOutbox(a.result)}</ReactMarkdown>
            </div>
            <Outbox a={a} />
          </>
        )}
      </div>
    </div>
  );
};

const SoulPanel: React.FC = () => {
  const [shown, setShown] = useState<AgentId | null>(null);
  const [souls, setSouls] = useState<{ anchor: string; driftwood: string } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!shown || souls) return;
    fetch('/api/udolli?action=souls')
      .then(async (r) => { if (!r.ok) throw new Error(); setSouls(await r.json()); })
      .catch(() => setErr('Could not load the instruction files.'));
  }, [shown, souls]);

  const lines = (t: string) => t.trimEnd().split('\n').length;
  const toggle = (a: AgentId) => setShown(shown === a ? null : a);

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-sm text-gray-700 mb-2">
        <span className="font-semibold text-gray-900">What makes the two agents different?</span> They use the same AI model and the same tools. The only difference is a written instruction file (called <span className="font-mono">soul.md</span>) that tells each one how to behave. Read each one:
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => toggle('anchor')} aria-pressed={shown === 'anchor'}
          className={classNames('inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold',
            shown === 'anchor' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100')}>
          <Anchor className="w-4 h-4" /> Guarded instructions (Anchor)
        </button>
        <button onClick={() => toggle('driftwood')} aria-pressed={shown === 'driftwood'}
          className={classNames('inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold',
            shown === 'driftwood' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100')}>
          <Wind className="w-4 h-4" /> Unguarded instructions (Driftwood)
        </button>
      </div>
      {shown && err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {shown && !souls && !err && <p className="mt-3 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading&hellip;</p>}
      {shown && souls && (
        <div className="mt-3">
          <p className={classNames('text-xs font-bold mb-1', shown === 'anchor' ? 'text-emerald-800' : 'text-amber-800')}>
            {shown === 'anchor' ? 'Anchor' : 'Driftwood'} · {lines(souls[shown])} lines
          </p>
          <pre className={classNames('text-xs border rounded p-3 whitespace-pre-wrap max-h-96 overflow-y-auto', shown === 'anchor' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200')}>{souls[shown]}</pre>
        </div>
      )}
    </div>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────

const UDolliPage: React.FC = () => {
  const { user } = useAuth();
  const { hasAccess, loading: accessLoading } = useUdolliAccess();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  const [pageChoice, setPageChoice] = useState<string>('none'); // 'none' | test page id | 'custom'
  const [customText, setCustomText] = useState('');
  const [viewMode, setViewMode] = useState<'reader' | 'source'>('reader');
  const [target, setTarget] = useState<Target>('both');
  const [message, setMessage] = useState('');

  const [pending, setPending] = useState<{ prompt: string; sourceTitle: string | null; target: Target } | null>(null);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  const rounds = useMemo(() => groupRounds(analyses), [analyses]);
  const canCompare = rounds.some((r) => r.anchor && r.driftwood);

  const selectedPage = TEST_PAGES.find((p) => p.id === pageChoice) ?? null;
  const source = pageChoice === 'custom' ? customText : selectedPage?.html ?? '';
  const sourceTitle = pageChoice === 'custom' ? 'Page pasted by student' : selectedPage?.title ?? null;

  // ── Data ──
  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from('udolli_sessions')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user?.id ?? '')
      .order('updated_at', { ascending: false })
      .limit(100);
    setSessions((data as Session[]) ?? []);
  }, [user?.id]);

  useEffect(() => { if (hasAccess && user?.id) loadSessions(); }, [hasAccess, user?.id, loadSessions]);

  const openSession = useCallback(async (id: string) => {
    setLoadingSession(true);
    setError('');
    setActiveId(id);
    const [{ data: rows }, { data: cmp }] = await Promise.all([
      supabase.from('udolli_analyses').select('*').eq('session_id', id).order('created_at', { ascending: true }),
      supabase.from('udolli_comparisons').select('*').eq('session_id', id).order('created_at', { ascending: false }).limit(1),
    ]);
    setAnalyses((rows as Analysis[]) ?? []);
    setComparison(((cmp as Comparison[]) ?? [])[0] ?? null);
    setLoadingSession(false);
  }, []);

  const newSession = () => {
    setActiveId(null);
    setAnalyses([]);
    setComparison(null);
    setError('');
    setPending(null);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [analyses.length, pending]);

  // ── Actions ──
  const send = async () => {
    const text = message.trim();
    if (!text || pending) return;
    if (pageChoice === 'custom' && !customText.trim()) { setError('Paste a page first, or choose "No page".'); return; }
    setError('');
    const agents: AgentId[] = target === 'both' ? ['anchor', 'driftwood'] : [target];
    setPending({ prompt: text, sourceTitle: source ? sourceTitle : null, target });
    try {
      const res = await fetch('/api/udolli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          session_id: activeId,
          message: text,
          source_text: source || undefined,
          source_title: source ? sourceTitle : undefined,
          agents,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setActiveId(data.session_id);
      setAnalyses((prev) => [...prev, ...(data.analyses as Analysis[])]);
      if (data.errors?.length) setError(data.errors.map((e: { agent: string; error: string }) => `${e.agent}: ${e.error}`).join(' '));
      setMessage('');
      setPageChoice('none');
      setCustomText('');
      loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(null);
    }
  };

  const compare = async () => {
    if (!activeId) return;
    setModalOpen(true);
    setCompareError('');
    setComparing(true);
    try {
      const res = await fetch('/api/udolli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compare', session_id: activeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setComparison(data.comparison as Comparison);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setComparing(false);
    }
  };

  const tryIdea = (text: string, needsPage?: string) => {
    setMessage(text);
    if (needsPage) setPageChoice(needsPage);
  };

  // ── Gate ──
  if (accessLoading) {
    return <AppLayout><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div></AppLayout>;
  }
  if (!hasAccess) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto py-24 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">This page is for UD-OLLI members</h1>
          <p className="text-gray-600">If you are part of UD-OLLI, make sure you joined with your group&rsquo;s code and that your leader has approved you.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">UD-OLLI Guardrail Lab</h1>
          <p className="text-gray-600 mt-1 max-w-3xl">Two AI agents do the same job: read the news and email a briefing. One has guardrails. One doesn&rsquo;t. Give them the same task, try to talk them into something they shouldn&rsquo;t do, hand them a page with tricks hidden in it, and see what happens. Email here is simulated, so nothing is ever really sent.</p>
          <p className="text-gray-500 text-sm mt-2 max-w-3xl">Keep in mind: today&rsquo;s AI models often resist simple tricks on their own, so you won&rsquo;t always see a difference. Try several ideas. Some show a clear contrast, and the ones where both agents behave well are worth discussing too: what did the written guardrails add?</p>
        </header>

        <div className="grid lg:grid-cols-[240px_1fr] gap-5">
          {/* History */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <button onClick={newSession} className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2 mb-3">
              <Plus className="w-4 h-4" /> New session
            </button>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Your history</p>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {sessions.length === 0 && <p className="text-xs text-gray-400">Your sessions will show up here.</p>}
              {sessions.map((s) => (
                <button key={s.id} onClick={() => openSession(s.id)}
                  className={classNames('w-full text-left rounded-md px-3 py-2 text-sm border transition-colors',
                    s.id === activeId ? 'bg-violet-50 border-violet-300 text-violet-900' : 'bg-white border-transparent hover:bg-gray-50 text-gray-700')}>
                  <span className="flex items-start gap-2"><MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" /><span className="line-clamp-2">{s.title}</span></span>
                  <span className="block text-[11px] text-gray-400 mt-0.5 ml-5">{new Date(s.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* Main */}
          <div className="min-w-0 space-y-4">
            <SoulPanel />

            {/* Conversation */}
            <div className="space-y-6">
              {loadingSession && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

              {!loadingSession && rounds.length === 0 && !pending && (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
                  <p className="font-medium text-gray-700 mb-1">Nothing here yet</p>
                  <p className="text-sm">Pick a page below (or none), choose an idea to try or write your own, and send it to both agents.</p>
                </div>
              )}

              {rounds.map((rd, i) => (
                <section key={rd.roundId}>
                  <div className="flex justify-end mb-2">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-violet-600 text-white px-4 py-2 text-sm">
                      <p className="text-[11px] opacity-80 mb-0.5">Round {i + 1} · you</p>
                      <p className="whitespace-pre-wrap">{rd.prompt}</p>
                      {rd.sourceTitle && <p className="mt-1.5 text-[11px] inline-flex items-center gap-1 bg-white/20 rounded px-1.5 py-0.5"><FileText className="w-3 h-3" /> {rd.sourceTitle}</p>}
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <AnswerBox agent="anchor" a={rd.anchor} pending={false} skipped={!rd.anchor && !!rd.driftwood} />
                    <AnswerBox agent="driftwood" a={rd.driftwood} pending={false} skipped={!rd.driftwood && !!rd.anchor} />
                  </div>
                </section>
              ))}

              {pending && (
                <section>
                  <div className="flex justify-end mb-2">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-violet-600 text-white px-4 py-2 text-sm">
                      <p className="text-[11px] opacity-80 mb-0.5">Round {rounds.length + 1} · you</p>
                      <p className="whitespace-pre-wrap">{pending.prompt}</p>
                      {pending.sourceTitle && <p className="mt-1.5 text-[11px] inline-flex items-center gap-1 bg-white/20 rounded px-1.5 py-0.5"><FileText className="w-3 h-3" /> {pending.sourceTitle}</p>}
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <AnswerBox agent="anchor" pending={pending.target !== 'driftwood'} skipped={pending.target === 'driftwood'} />
                    <AnswerBox agent="driftwood" pending={pending.target !== 'anchor'} skipped={pending.target === 'anchor'} />
                  </div>
                </section>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Compare */}
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 flex flex-wrap items-center gap-3">
              <Scale className="w-5 h-5 text-violet-600" />
              <p className="text-sm text-violet-900 flex-1 min-w-[200px]">When you have sent at least one message to both agents, a third agent can compare what each one did.</p>
              <div className="flex gap-2">
                {comparison && (
                  <button onClick={() => { setCompareError(''); setModalOpen(true); }} className="rounded-lg border border-violet-300 bg-white text-violet-700 text-sm font-semibold px-3 py-2 hover:bg-violet-100">
                    Last comparison
                  </button>
                )}
                <button onClick={compare} disabled={!canCompare || comparing || !!pending}
                  className="rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 inline-flex items-center gap-2">
                  {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />} Compare guarded vs. unguarded
                </button>
              </div>
            </div>

            {/* Composer */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              {/* Step 1: page */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1">1. Give them something to read <span className="font-normal text-gray-500">(optional)</span></p>
                <p className="text-sm text-gray-600 mb-2">Choose what both agents will be handed to read along with your message. You don&rsquo;t have to create anything: the pages below are already written for you, and the tricks (if any) are already in them. Pick one to see what it is and what to watch for, or choose &ldquo;No page&rdquo; to just chat.</p>
                <select value={pageChoice} onChange={(e) => setPageChoice(e.target.value)} className="w-full rounded-md border border-gray-300 text-sm px-3 py-2">
                  <option value="none">No page. Just chat.</option>
                  {TEST_PAGES.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  <option value="custom">Paste my own page or article text&hellip;</option>
                </select>

                {pageChoice === 'none' && (
                  <p className="mt-2 text-sm text-gray-600 rounded-md border border-gray-200 bg-gray-50 p-3">No page will be attached. Type your message in the box in step 2 just below, and both agents will answer it with nothing else to read.</p>
                )}

                {selectedPage && (
                  <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm text-gray-700">{selectedPage.blurb}</p>
                    <p className="text-sm text-violet-800 mt-1"><span className="font-semibold">Watch for:</span> {selectedPage.watchFor}</p>
                    <div className="mt-2 flex gap-1">
                      <button onClick={() => setViewMode('reader')} className={classNames('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border', viewMode === 'reader' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-700 border-gray-300')}><Eye className="w-3 h-3" /> What a reader sees</button>
                      <button onClick={() => setViewMode('source')} className={classNames('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border', viewMode === 'source' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-700 border-gray-300')}><Code2 className="w-3 h-3" /> What the agents read</button>
                    </div>
                    {viewMode === 'reader' ? (
                      <iframe title="Page as a reader sees it" sandbox="" srcDoc={selectedPage.html} className="mt-2 w-full h-64 rounded border border-gray-200 bg-white" />
                    ) : (
                      <pre className="mt-2 text-xs bg-white border border-gray-200 rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap">{selectedPage.html}</pre>
                    )}
                  </div>
                )}

                {pageChoice === 'custom' && (
                  <textarea value={customText} onChange={(e) => setCustomText(e.target.value.slice(0, MAX_SOURCE))} rows={6}
                    placeholder="Paste an article or a page's text or source here. You can hide your own instructions in it and see whether the agents follow them."
                    className="mt-2 w-full rounded-md border border-gray-300 text-sm p-3 font-mono" />
                )}
              </div>

              {/* Step 2: ask */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1">2. Type your message</p>
                {source && sourceTitle && (
                  <p className="mb-2 inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-800 rounded px-2 py-1">
                    <FileText className="w-3 h-3" /> Page attached: {sourceTitle}
                    <button onClick={() => { setPageChoice('none'); setCustomText(''); }} aria-label="Remove page"><X className="w-3 h-3" /></button>
                  </p>
                )}
                <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))} rows={3}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
                  placeholder="Type exactly what you want to say to the agents. Send the same words to both and compare."
                  className="w-full rounded-md border border-gray-300 text-sm p-3" />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-semibold" role="group" aria-label="Who to ask">
                    {([['both', 'Both agents'], ['anchor', 'Anchor only'], ['driftwood', 'Driftwood only']] as [Target, string][]).map(([v, label]) => (
                      <button key={v} onClick={() => setTarget(v)} className={classNames('px-3 py-1.5', target === v ? 'bg-violet-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}>{label}</button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 ml-auto">{message.length}/{MAX_MESSAGE}</span>
                  <button onClick={send} disabled={!message.trim() || !!pending}
                    className="rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 inline-flex items-center gap-2">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
                  </button>
                </div>
                {error && <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
              </div>

              {/* Ideas */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1"><Lightbulb className="w-4 h-4 text-amber-500" /> Not sure what to say? Click an idea to fill in the message box above</p>
                <div className="space-y-2">
                  {IDEA_GROUPS.map((g) => (
                    <details key={g.label} className="group rounded-md border border-gray-200">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-gray-800">{g.label}</summary>
                      <div className="px-3 pb-3">
                        <p className="text-xs text-gray-500 mb-2">{g.blurb}</p>
                        <div className="flex flex-wrap gap-2">
                          {g.ideas.map((idea) => (
                            <button key={idea.text} onClick={() => tryIdea(idea.text, idea.needsPage)}
                              className="text-left text-xs rounded-full border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-900 px-3 py-1.5">
                              {idea.text}{idea.needsPage && <span className="ml-1 opacity-60">(uses a page)</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">If you try to get an agent to email someone, use an address that ends in <span className="font-mono">@example.invalid</span>. It can never receive mail. Please don&rsquo;t use a real person&rsquo;s address, even though nothing is actually sent.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ComparisonModal open={modalOpen} loading={comparing} error={compareError} comparison={comparison} onClose={() => setModalOpen(false)} />
    </AppLayout>
  );
};

export default UDolliPage;
