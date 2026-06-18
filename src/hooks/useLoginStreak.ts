import { useEffect, useState } from 'react';

interface StreakStorage {
  consecutive_days_logged_in?: number;
  last_login_date?: string;
}

function streakKey(userId: string): string {
  return `consecutive_days_logged_in_${userId}`;
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useLoginStreak(userId: string | undefined): number {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const key = streakKey(userId);
    const today = todayUtc();

    let stored: StreakStorage = {};
    try {
      stored = JSON.parse(localStorage.getItem(key) || '{}') as StreakStorage;
    } catch {
      stored = {};
    }

    let next = stored.consecutive_days_logged_in ?? 0;

    if (stored.last_login_date === today) {
      // same day — keep current streak
    } else if (stored.last_login_date === yesterdayUtc()) {
      next += 1;
    } else {
      next = 1;
    }

    try {
      localStorage.setItem(key, JSON.stringify({
        consecutive_days_logged_in: next,
        last_login_date: today,
      }));
    } catch {
      // localStorage unavailable — still show computed streak in memory
    }

    setStreak(next);
  }, [userId]);

  return streak;
}
