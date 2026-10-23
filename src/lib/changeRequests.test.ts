import { describe, it, expect } from 'vitest';
import { actionsFor, currentProposal, tallyFeedback, type ChangeSuggestion, type ChangeFeedback } from './changeRequests';

const s = (over: Partial<ChangeSuggestion>): ChangeSuggestion => ({
  id: 'a', title: 't', problem: 'p', who_affected: null, evidence: null, proposed_change: 'orig',
  cost_effort: null, success_measure: null, touches_children: false, status: 'feedback',
  feedback_due: '2026-11-01T00:00:00Z', revised_change: null, revision_summary: null, owner_id: null,
  owner_name: null, owner_note: null, assigned_by_name: null, implementation_note: null, implemented_at: null,
  decline_reason: null, closed_at: null, created_by: 'proposer', created_by_name: null,
  created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z', ...over,
});
const none = new Set<string>();

describe('actionsFor', () => {
  it('asks for feedback only from people whose feedback row is pending', () => {
    const list = [s({ id: '1' }), s({ id: '2' })];
    const a = actionsFor(list, { userId: 'u', isManager: false }, new Set(['2']), none);
    expect(a.map(x => x.suggestion.id)).toEqual(['2']);
    expect(a[0].kind).toBe('feedback');
  });
  it('sends the revision to the proposer and to managers', () => {
    const list = [s({ status: 'revising' })];
    expect(actionsFor(list, { userId: 'proposer', isManager: false }, none, none)[0].kind).toBe('revise');
    expect(actionsFor(list, { userId: 'x', isManager: true }, none, none)[0].kind).toBe('revise');
    expect(actionsFor(list, { userId: 'x', isManager: false }, none, none)).toHaveLength(0);
  });
  it('asks managers to choose an owner', () => {
    const list = [s({ status: 'awaiting_owner' })];
    expect(actionsFor(list, { userId: 'x', isManager: true }, none, none)[0].kind).toBe('assign');
    expect(actionsFor(list, { userId: 'x', isManager: false }, none, none)).toHaveLength(0);
  });
  it('tells the owner, and only the owner, to implement', () => {
    const list = [s({ status: 'in_progress', owner_id: 'me' })];
    expect(actionsFor(list, { userId: 'me', isManager: false }, none, none)[0].kind).toBe('implement');
    expect(actionsFor(list, { userId: 'other', isManager: false }, none, none)).toHaveLength(0);
  });
  it('asks reviewers who have not answered', () => {
    const list = [s({ status: 'in_review' })];
    expect(actionsFor(list, { userId: 'u', isManager: false }, none, new Set(['a']))[0].kind).toBe('review');
    expect(actionsFor(list, { userId: 'u', isManager: false }, none, none)).toHaveLength(0);
  });
  it('lists feedback and review requests before manager chores', () => {
    const list = [s({ id: 'm', status: 'awaiting_owner' }), s({ id: 'f' })];
    const a = actionsFor(list, { userId: 'u', isManager: true }, new Set(['f']), none);
    expect(a.map(x => x.kind)).toEqual(['feedback', 'assign']);
  });
});

describe('currentProposal / tallyFeedback', () => {
  it('prefers the updated proposal', () => {
    expect(currentProposal(s({}))).toBe('orig');
    expect(currentProposal(s({ revised_change: ' new ' }))).toBe('new');
  });
  it('counts answers and the people still to answer', () => {
    const row = (stance: ChangeFeedback['stance'], at: string | null): ChangeFeedback =>
      ({ suggestion_id: 'a', user_id: Math.random().toString(), user_name: null, stance, comment: null, responded_at: at });
    const t = tallyFeedback([row('support', 'x'), row('concern', 'x'), row(null, null), row('support', 'x')]);
    expect(t).toEqual({ support: 2, support_with_changes: 0, concern: 1, waiting: 1 });
  });
});
