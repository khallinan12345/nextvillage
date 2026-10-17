// src/lib/teamReviews.ts
// When is a scheduled review due? Pure helpers for the /team page.

export interface ReviewItem {
  id: string;
  title: string;
  description: string | null;
  doc_path: string | null;
  cadence_days: number;
  last_reviewed_at: string | null;
  audience: 'all_leaders' | 'platform_team';
  owner_id: string | null;
}

export type DueState = 'never' | 'overdue' | 'soon' | 'ok';

export interface DueInfo {
  state: DueState;
  /** Days until due (negative when overdue); null when never reviewed. */
  days: number | null;
  dueAt: Date | null;
}

const DAY = 86_400_000;

export function dueInfo(item: Pick<ReviewItem, 'cadence_days' | 'last_reviewed_at'>, now = new Date()): DueInfo {
  if (!item.last_reviewed_at) return { state: 'never', days: null, dueAt: null };
  const dueAt = new Date(new Date(item.last_reviewed_at).getTime() + item.cadence_days * DAY);
  const days = Math.ceil((dueAt.getTime() - now.getTime()) / DAY);
  const state: DueState = days < 0 ? 'overdue' : days <= 14 ? 'soon' : 'ok';
  return { state, days, dueAt };
}

const RANK: Record<DueState, number> = { never: 0, overdue: 1, soon: 2, ok: 3 };

/** Most urgent first: never reviewed, then overdue (most overdue first), then soonest. */
export function sortByUrgency<T extends Pick<ReviewItem, 'cadence_days' | 'last_reviewed_at'>>(items: T[], now = new Date()): T[] {
  return [...items].sort((a, b) => {
    const da = dueInfo(a, now), db = dueInfo(b, now);
    if (RANK[da.state] !== RANK[db.state]) return RANK[da.state] - RANK[db.state];
    return (da.days ?? 0) - (db.days ?? 0);
  });
}

export function describeDue(info: DueInfo): string {
  if (info.state === 'never') return 'Needs its first review';
  const d = info.days as number;
  if (d < 0) return `Overdue by ${-d} day${-d === 1 ? '' : 's'}`;
  if (d === 0) return 'Due today';
  return `Due in ${d} day${d === 1 ? '' : 's'}`;
}
