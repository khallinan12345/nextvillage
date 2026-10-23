// src/pages/admin/ChangeRequestsPage.tsx
//
// Suggest Change (/admin/changes and /admin/changes/:id). Anyone on the staff panel can suggest a change; the
// rest of the panel gives feedback; the proposal is updated; a site leader names who is responsible; the
// owner makes the change; the panel reviews it with a thumbs up or feedback. The database enforces every
// step (migration 20261023120000_change_suggestions.sql); this page shows the stage and the buttons for it.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, ThumbsUp, MessageSquare, CheckCircle2 } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import {
  actionsFor, currentProposal, tallyFeedback, CHANGE_MANAGER_ROLES, STATUS_LABEL, STANCE_LABEL,
  type ChangeSuggestion, type ChangeFeedback, type ChangeReview,
} from '../../lib/changeRequests';

const box = 'bg-white border border-gray-200 rounded-xl p-5';
const field = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm';
const primary = 'px-4 py-2 rounded-md text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50';
const quiet = 'px-3 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const friendly = (msg?: string) => (msg || 'Something went wrong. Please try again.').replace(/^.*?(?:ERROR:\s*)/, '');

const Label: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <label className="block mb-4">
    <span className="block text-sm font-semibold text-gray-800">{title}</span>
    {hint && <span className="block text-xs text-gray-500 mb-1">{hint}</span>}
    {children}
  </label>
);

const Block: React.FC<{ title: string; text: string | null }> = ({ title, text }) =>
  text ? (<div className="mb-3"><div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
    <p className="text-sm text-gray-800 whitespace-pre-wrap">{text}</p></div>) : null;

// ── Suggest form ────────────────────────────────────────────────────────────────────────────────
const blank = { title: '', problem: '', who: '', evidence: '', change: '', cost: '', success: '', children: false };

const SuggestForm: React.FC<{ onDone: (id: string) => void; onCancel: () => void }> = ({ onDone, onCancel }) => {
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc('change_suggest', {
      p_title: f.title, p_problem: f.problem, p_who_affected: f.who, p_evidence: f.evidence,
      p_proposed_change: f.change, p_cost_effort: f.cost, p_success_measure: f.success, p_touches_children: f.children,
    });
    setBusy(false);
    if (error) { setErr(friendly(error.message)); return; }
    onDone(data as string);
  };

  return (
    <form onSubmit={submit} className={box}>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Suggest a change</h2>
      <p className="text-sm text-gray-600 mb-4">
        The more detail you give, the better the feedback you will get. Everyone on the staff panel (site leaders, leaders,
        teachers, facilitators, safety officers and platform administrators) will be asked what they think.
      </p>
      <Label title="Short title"><input className={field} required minLength={3} maxLength={200} value={f.title} onChange={set('title')} /></Label>
      <Label title="What problem does this solve?" hint="What happened, how often, and what it costs learners or staff.">
        <textarea className={field} rows={4} required minLength={10} value={f.problem} onChange={set('problem')} /></Label>
      <Label title="Who is affected?" hint="Learners, which age group, teachers, one organization, everyone…">
        <textarea className={field} rows={2} value={f.who} onChange={set('who')} /></Label>
      <Label title="How do you know?" hint="Something you saw, a learner or parent comment, numbers, a screenshot description.">
        <textarea className={field} rows={3} value={f.evidence} onChange={set('evidence')} /></Label>
      <Label title="What exactly should change?" hint="Describe it step by step, as if explaining to the person who will build it. Say where on the site, and what people would see.">
        <textarea className={field} rows={7} required minLength={10} value={f.change} onChange={set('change')} /></Label>
      <Label title="What will it take?" hint="Time, money, AI cost, who needs to help. A guess is fine.">
        <textarea className={field} rows={2} value={f.cost} onChange={set('cost')} /></Label>
      <Label title="How will we know it worked?"><textarea className={field} rows={2} value={f.success} onChange={set('success')} /></Label>
      <label className="flex items-start gap-2 mb-5 text-sm text-gray-800">
        <input type="checkbox" className="mt-1" checked={f.children} onChange={set('children')} />
        <span>This touches children&rsquo;s data, safety, consent, AI behavior, or who can see what. (Tick if unsure.)</span>
      </label>
      {err && <p className="text-sm text-red-700 mb-3">{err}</p>}
      <div className="flex gap-2">
        <button className={primary} disabled={busy} type="submit">{busy ? 'Sending…' : 'Send for feedback'}</button>
        <button className={quiet} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
};

// ── Detail ──────────────────────────────────────────────────────────────────────────────────────
interface DetailProps {
  s: ChangeSuggestion; feedback: ChangeFeedback[]; reviews: ChangeReview[];
  userId: string; isManager: boolean; isAdmin: boolean; reload: () => Promise<void>;
}

const Detail: React.FC<DetailProps> = ({ s, feedback, reviews, userId, isManager, isAdmin, reload }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stance, setStance] = useState<ChangeFeedback['stance']>('support');
  const [comment, setComment] = useState('');
  const [revised, setRevised] = useState(currentProposal(s));
  const [summary, setSummary] = useState('');
  const [candidates, setCandidates] = useState<{ id: string; name: string; role: string }[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [ownerNote, setOwnerNote] = useState('');
  const [doneNote, setDoneNote] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [reason, setReason] = useState('');

  const mine = feedback.find(r => r.user_id === userId);
  const myReview = reviews.find(r => r.user_id === userId);
  const isProposer = s.created_by === userId;
  const tally = tallyFeedback(feedback);
  const pastDue = new Date(s.feedback_due).getTime() < Date.now();

  useEffect(() => {
    if (!isManager || !['awaiting_owner', 'in_progress'].includes(s.status)) return;
    void supabase.rpc('change_owner_candidates').then(({ data }) => setCandidates((data ?? []) as typeof candidates));
  }, [isManager, s.status]);

  const run = async (fn: string, args: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { setErr(friendly(error.message)); return; }
    setComment(''); setReviewNote(''); await reload();
  };

  return (
    <div className="stack-y-4">
      <div className={box}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-xl font-bold text-gray-900">{s.title}</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">{STATUS_LABEL[s.status]}</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">Suggested by {s.created_by_name ?? 'someone'} on {fmt(s.created_at)}
          {s.touches_children && <span className="ml-2 text-red-700 font-semibold">Touches children&rsquo;s data or safety</span>}</p>
        <Block title="Problem" text={s.problem} />
        <Block title="Who is affected" text={s.who_affected} />
        <Block title="How we know" text={s.evidence} />
        <Block title={s.revised_change ? 'Original proposal' : 'Proposed change'} text={s.proposed_change} />
        <Block title="What it will take" text={s.cost_effort} />
        <Block title="How we will know it worked" text={s.success_measure} />
        {s.revised_change && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <Block title="Updated proposal (after feedback)" text={s.revised_change} />
            <Block title="What changed" text={s.revision_summary} />
          </div>
        )}
        {s.status === 'declined' && <Block title="Not going ahead because" text={s.decline_reason} />}
        {s.owner_name && (
          <div className="mt-4 text-sm text-gray-800"><strong>Responsible:</strong> {s.owner_name}
            {s.assigned_by_name && <span className="text-gray-500"> (chosen by {s.assigned_by_name})</span>}
            {s.owner_note && <p className="text-gray-700">{s.owner_note}</p>}</div>
        )}
        {s.implementation_note && <div className="mt-3"><Block title={`What was done (${fmt(s.implemented_at)})`} text={s.implementation_note} /></div>}
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}

      {/* Feedback stage */}
      {(feedback.length > 0) && (
        <div className={box}>
          <h3 className="font-bold text-gray-900 mb-1">Feedback</h3>
          <p className="text-sm text-gray-600 mb-3">
            {tally.support} support · {tally.support_with_changes} support with changes · {tally.concern} concerns · {tally.waiting} still to answer
            {s.status === 'feedback' && <> · due {fmt(s.feedback_due)}</>}
          </p>
          {s.status === 'feedback' && mine && !mine.responded_at && (
            <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
              <div className="font-semibold text-gray-900 mb-2">What do you think?</div>
              <div className="flex gap-3 flex-wrap mb-2">
                {(Object.keys(STANCE_LABEL) as NonNullable<ChangeFeedback['stance']>[]).map(k => (
                  <label key={k} className="text-sm flex items-center gap-1.5">
                    <input type="radio" name="stance" checked={stance === k} onChange={() => setStance(k)} /> {STANCE_LABEL[k]}
                  </label>
                ))}
              </div>
              <textarea className={field} rows={3} value={comment} onChange={e => setComment(e.target.value)}
                placeholder={stance === 'support' ? 'Anything to add? (optional)' : 'What would you change, or what worries you?'} />
              <button className={`${primary} mt-2`} disabled={busy} onClick={() => run('change_give_feedback', { p_id: s.id, p_stance: stance, p_comment: comment })}>
                Send feedback</button>
            </div>
          )}
          <ul className="stack-y-2">
            {feedback.filter(r => r.responded_at).map(r => (
              <li key={r.user_id} className="text-sm border-l-4 border-gray-200 pl-3">
                <span className="font-semibold">{r.user_name ?? 'Someone'}</span> · {r.stance && STANCE_LABEL[r.stance]}
                {r.comment && <p className="text-gray-700 whitespace-pre-wrap">{r.comment}</p>}
              </li>
            ))}
          </ul>
          {s.status === 'feedback' && (isProposer || isManager) && (pastDue || isAdmin) && (
            <button className={`${quiet} mt-3`} disabled={busy} onClick={() => run('change_close_feedback', { p_id: s.id })}>
              Close feedback and update the proposal</button>
          )}
        </div>
      )}

      {/* Revise */}
      {s.status === 'revising' && (isProposer || isManager) && (
        <div className={box}>
          <h3 className="font-bold text-gray-900 mb-1">Update the proposal</h3>
          <p className="text-sm text-gray-600 mb-3">Rewrite the proposed change so it reflects the feedback above.</p>
          <textarea className={field} rows={9} value={revised} onChange={e => setRevised(e.target.value)} />
          <Label title="What changed, and why?"><textarea className={field} rows={3} value={summary} onChange={e => setSummary(e.target.value)} /></Label>
          <button className={primary} disabled={busy} onClick={() => run('change_publish_revision', { p_id: s.id, p_revised: revised, p_summary: summary })}>
            Save updated proposal</button>
        </div>
      )}

      {/* Choose owner */}
      {isManager && ['awaiting_owner', 'in_progress'].includes(s.status) && (
        <div className={box}>
          <h3 className="font-bold text-gray-900 mb-1">{s.status === 'in_progress' ? 'Change who is responsible' : 'Who is responsible for making this change?'}</h3>
          <select className={`${field} mb-2`} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            <option value="">Choose a person…</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role.replace('_', ' ')})</option>)}
          </select>
          <textarea className={field} rows={2} placeholder="Note for them: what to do, by when (optional)" value={ownerNote} onChange={e => setOwnerNote(e.target.value)} />
          <div className="flex gap-2 mt-2 flex-wrap">
            <button className={primary} disabled={busy || !ownerId} onClick={() => run('change_assign_owner', { p_id: s.id, p_owner: ownerId, p_note: ownerNote })}>Assign</button>
            {s.status === 'awaiting_owner' && (
              <>
                <input className={`${field} !w-64`} placeholder="Or: why it is not going ahead" value={reason} onChange={e => setReason(e.target.value)} />
                <button className={quiet} disabled={busy || reason.trim().length < 3} onClick={() => run('change_decline', { p_id: s.id, p_reason: reason })}>Not going ahead</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Implement */}
      {s.status === 'in_progress' && (s.owner_id === userId || isManager) && (
        <div className={box}>
          <h3 className="font-bold text-gray-900 mb-1">Mark the change as made</h3>
          <p className="text-sm text-gray-600 mb-2">Tell reviewers what was done and where to look. They will be asked to review it.</p>
          <textarea className={field} rows={3} value={doneNote} onChange={e => setDoneNote(e.target.value)} />
          <button className={`${primary} mt-2`} disabled={busy} onClick={() => run('change_mark_implemented', { p_id: s.id, p_note: doneNote })}>
            It is done, ask for review</button>
        </div>
      )}

      {/* Review */}
      {reviews.length > 0 && (
        <div className={box}>
          <h3 className="font-bold text-gray-900 mb-1">Review of the finished change</h3>
          <p className="text-sm text-gray-600 mb-3">
            {reviews.filter(r => r.approved === true).length} thumbs up · {reviews.filter(r => r.approved === false).length} with feedback · {reviews.filter(r => !r.reviewed_at).length} still to review
          </p>
          {s.status === 'in_review' && myReview && !myReview.reviewed_at && (
            <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
              <textarea className={field} rows={2} value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Feedback (needed unless you give a thumbs up)" />
              <div className="flex gap-2 mt-2">
                <button className={primary} disabled={busy} onClick={() => run('change_give_review', { p_id: s.id, p_approved: true, p_comment: reviewNote })}>
                  <ThumbsUp size={14} className="inline mr-1" /> Looks good</button>
                <button className={quiet} disabled={busy} onClick={() => run('change_give_review', { p_id: s.id, p_approved: false, p_comment: reviewNote })}>
                  <MessageSquare size={14} className="inline mr-1" /> Send feedback instead</button>
              </div>
            </div>
          )}
          <ul className="stack-y-2">
            {reviews.filter(r => r.reviewed_at).map(r => (
              <li key={r.user_id} className="text-sm border-l-4 border-gray-200 pl-3">
                <span className="font-semibold">{r.user_name ?? 'Someone'}</span> · {r.approved ? '👍 Looks good' : 'Feedback'}
                {r.comment && <p className="text-gray-700 whitespace-pre-wrap">{r.comment}</p>}
              </li>
            ))}
          </ul>
          {isManager && ['in_review', 'closed'].includes(s.status) && reviews.some(r => r.approved === false) && (
            <button className={`${quiet} mt-3`} disabled={busy} onClick={() => run('change_reopen', { p_id: s.id, p_note: 'Reviewers asked for changes' })}>
              Send back to the owner</button>
          )}
        </div>
      )}
      {s.status === 'closed' && <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={16} /> Everyone has reviewed this change.</p>}
    </div>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────────────────────────
type Filter = 'mine' | 'open' | 'finished';

const ChangeRequestsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const role = user?.role as string | undefined;
  const isManager = !!role && CHANGE_MANAGER_ROLES.has(role);
  const isAdmin = role === 'platform_administrator';

  const [list, setList] = useState<ChangeSuggestion[]>([]);
  const [feedback, setFeedback] = useState<ChangeFeedback[]>([]);
  const [reviews, setReviews] = useState<ChangeReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('mine');
  const [creating, setCreating] = useState(search.get('new') === '1');

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [s, f, r] = await Promise.all([
      supabase.from('change_suggestions').select('*').order('created_at', { ascending: false }),
      supabase.from('change_feedback').select('*'),
      supabase.from('change_reviews').select('*'),
    ]);
    if (s.error) setLoadError('We could not load change suggestions.');
    setList((s.data ?? []) as ChangeSuggestion[]);
    setFeedback((f.data ?? []) as ChangeFeedback[]);
    setReviews((r.data ?? []) as ChangeReview[]);
    setLoading(false);
  }, [user?.id]);
  useEffect(() => { void load(); }, [load]);

  const mineActions = useMemo(() => actionsFor(
    list, { userId: user?.id ?? '', isManager },
    new Set(feedback.filter(r => r.user_id === user?.id && !r.responded_at).map(r => r.suggestion_id)),
    new Set(reviews.filter(r => r.user_id === user?.id && !r.reviewed_at).map(r => r.suggestion_id)),
  ), [list, feedback, reviews, user?.id, isManager]);

  const shown = filter === 'mine' ? mineActions.map(a => a.suggestion)
    : list.filter(s => (filter === 'finished') === ['closed', 'declined'].includes(s.status));
  const selected = id ? list.find(s => s.id === id) : undefined;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button className="text-sm text-gray-600 flex items-center gap-1 mb-4" onClick={() => navigate(id || creating ? '/admin/changes' : '/admin/student-dashboard')}
          type="button"><ArrowLeft size={14} /> {id || creating ? 'All suggestions' : 'Admin dashboard'}</button>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Suggest Change</h1>
          {!creating && !id && <button className={primary} onClick={() => setCreating(true)}><Plus size={14} className="inline mr-1" />Suggest a change</button>}
        </div>

        {loading && <Loader2 className="animate-spin text-gray-400" />}
        {loadError && <p className="text-sm text-red-700">{loadError}</p>}

        {!loading && creating && <SuggestForm onCancel={() => setCreating(false)} onDone={async newId => { await load(); setCreating(false); navigate(`/admin/changes/${newId}`); }} />}

        {!loading && !creating && id && (selected && user
          ? <Detail s={selected} userId={user.id} isManager={isManager} isAdmin={isAdmin} reload={load}
              feedback={feedback.filter(r => r.suggestion_id === selected.id)} reviews={reviews.filter(r => r.suggestion_id === selected.id)} />
          : <p className="text-sm text-gray-600">We could not find that suggestion.</p>)}

        {!loading && !creating && !id && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Suggest a change, hear from the rest of the team, update the proposal, name who is responsible, then review the result together.
            </p>
            <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
              {([['mine', `Waiting on me (${mineActions.length})`], ['open', 'In progress'], ['finished', 'Finished']] as [Filter, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === k ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>{label}</button>
              ))}
            </div>
            <ul className="stack-y-2">
              {shown.length === 0 && <li className="text-sm text-gray-500">Nothing here.</li>}
              {shown.map(s => {
                const a = mineActions.find(x => x.suggestion.id === s.id);
                return (
                  <li key={s.id}>
                    <button onClick={() => navigate(`/admin/changes/${s.id}`)} className={`${box} w-full text-left hover:border-amber-300`}>
                      <div className="font-semibold text-gray-900">{s.title}</div>
                      <div className="text-xs text-gray-500">{STATUS_LABEL[s.status]} · {s.created_by_name ?? 'someone'} · {fmt(s.created_at)}</div>
                      {a && <div className="text-sm text-amber-700 font-medium mt-1">{a.label}</div>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default ChangeRequestsPage;
