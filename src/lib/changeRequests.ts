// Shared types and rules for the Suggest Change process (page /admin/changes, card on the Admin dashboard).
// The database enforces who may do what (migration 20261023120000_change_suggestions.sql); this file only
// decides what to show and which items are waiting on the signed-in person.

export type ChangeStatus =
  | 'feedback' | 'revising' | 'awaiting_owner' | 'in_progress' | 'in_review' | 'closed' | 'declined';

export interface ChangeSuggestion {
  id: string; title: string; problem: string; who_affected: string | null; evidence: string | null;
  proposed_change: string; cost_effort: string | null; success_measure: string | null;
  touches_children: boolean; status: ChangeStatus; feedback_due: string;
  revised_change: string | null; revision_summary: string | null;
  owner_id: string | null; owner_name: string | null; owner_note: string | null; assigned_by_name: string | null;
  implementation_note: string | null; implemented_at: string | null; decline_reason: string | null;
  closed_at: string | null; created_by: string | null; created_by_name: string | null;
  created_at: string; updated_at: string;
}

export interface ChangeFeedback {
  suggestion_id: string; user_id: string; user_name: string | null;
  stance: 'support' | 'support_with_changes' | 'concern' | null; comment: string | null; responded_at: string | null;
}
export interface ChangeReview {
  suggestion_id: string; user_id: string; user_name: string | null;
  approved: boolean | null; comment: string | null; reviewed_at: string | null;
}

export const STATUS_LABEL: Record<ChangeStatus, string> = {
  feedback: 'Collecting feedback', revising: 'Being updated', awaiting_owner: 'Needs an owner',
  in_progress: 'In progress', in_review: 'In review', closed: 'Done', declined: 'Not going ahead',
};

export const STANCE_LABEL: Record<NonNullable<ChangeFeedback['stance']>, string> = {
  support: 'I support it', support_with_changes: 'Support, with changes', concern: 'I have a concern',
};

// The roles that can open Suggest Change and are asked for feedback (plus each organization's child safety officer).
export const CHANGE_MANAGER_ROLES = new Set(['site_leader', 'platform_administrator']);

export type ActionKind = 'feedback' | 'revise' | 'assign' | 'implement' | 'review';

export interface ChangeAction { kind: ActionKind; suggestion: ChangeSuggestion; label: string }

interface Me { userId: string; isManager: boolean }

// What is waiting on this person, most urgent first. `myFeedbackPending` and `myReviewPending` are the
// suggestion ids where the person's own feedback / review row is still unanswered.
export function actionsFor(
  suggestions: ChangeSuggestion[], me: Me, myFeedbackPending: Set<string>, myReviewPending: Set<string>,
): ChangeAction[] {
  const out: ChangeAction[] = [];
  for (const s of suggestions) {
    if (s.status === 'feedback' && myFeedbackPending.has(s.id)) {
      out.push({ kind: 'feedback', suggestion: s, label: 'Give feedback on this proposal' });
    } else if (s.status === 'revising' && (s.created_by === me.userId || me.isManager)) {
      out.push({ kind: 'revise', suggestion: s, label: 'Update the proposal with the feedback' });
    } else if (s.status === 'awaiting_owner' && me.isManager) {
      out.push({ kind: 'assign', suggestion: s, label: 'Choose who is responsible' });
    } else if (s.status === 'in_progress' && s.owner_id === me.userId) {
      out.push({ kind: 'implement', suggestion: s, label: 'You are responsible: mark it done when it is made' });
    } else if (s.status === 'in_review' && myReviewPending.has(s.id)) {
      out.push({ kind: 'review', suggestion: s, label: 'Review the change: thumbs up or feedback' });
    }
  }
  const order: ActionKind[] = ['feedback', 'review', 'implement', 'revise', 'assign'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)
    || a.suggestion.created_at.localeCompare(b.suggestion.created_at));
}

// The text people are asked to build and review: the updated version once there is one.
export const currentProposal = (s: ChangeSuggestion) => s.revised_change?.trim() || s.proposed_change;

export interface FeedbackTally { support: number; support_with_changes: number; concern: number; waiting: number }
export function tallyFeedback(rows: ChangeFeedback[]): FeedbackTally {
  const t: FeedbackTally = { support: 0, support_with_changes: 0, concern: 0, waiting: 0 };
  for (const r of rows) {
    if (!r.responded_at || !r.stance) t.waiting += 1; else t[r.stance] += 1;
  }
  return t;
}
