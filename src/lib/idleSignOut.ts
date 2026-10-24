// src/lib/idleSignOut.ts
//
// Idle sign-out for shared computers. Learners often share a device, and a closed browser tab keeps its
// sign-in, so the next person would open the previous learner's account. After IDLE_LIMIT_MS with no
// mouse, keyboard, touch or scroll activity the person is signed out, after a WARN_BEFORE_MS warning they
// can dismiss by pressing anything. The last-activity time is kept in localStorage so it also works across
// tabs and across a closed browser (checked once when the app opens).

export const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes without activity
export const WARN_BEFORE_MS = 2 * 60 * 1000; // warn for the last 2 minutes
export const ACTIVITY_KEY = 'nv_last_activity';

export type IdleState = 'active' | 'warn' | 'expired';

export function idleState(now: number, lastActivity: number, limit = IDLE_LIMIT_MS, warnBefore = WARN_BEFORE_MS): IdleState {
  const idle = now - lastActivity;
  if (idle >= limit) return 'expired';
  if (idle >= limit - warnBefore) return 'warn';
  return 'active';
}

export function msUntilSignOut(now: number, lastActivity: number, limit = IDLE_LIMIT_MS): number {
  return Math.max(0, limit - (now - lastActivity));
}

export function readLastActivity(storage: Pick<Storage, 'getItem'> | null = safeStorage()): number | null {
  try {
    const raw = storage?.getItem(ACTIVITY_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(now: number, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(ACTIVITY_KEY, String(now));
  } catch {
    // Storage can be blocked (private windows); idle sign-out then works for this tab only.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
