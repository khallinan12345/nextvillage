// src/hooks/useReflectionStreak.ts
//
// Mirrors the *shape* of useLoginStreak (same call signature — pass a userId,
// get back a number) so it drops into DashboardPage the same way. I don't
// have useLoginStreak's actual source, so this is a fresh implementation
// tailored to daily_reflections, not a copy of its internals — worth a
// quick diff against the real hook if you want the two streak definitions
// (e.g. "does missing today break the streak, or only missing yesterday")
// to match exactly.
//
// Streak definition used here: count consecutive calendar days with a
// reflection row, walking backward from today. Missing *today* does not
// yet break the streak (the student still has until end of day) — the
// streak only breaks once a full day is skipped entirely.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useReflectionStreak(userId: string | undefined): number {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('daily_reflections')
        .select('reflection_date')
        .eq('user_id', userId)
        .order('reflection_date', { ascending: false })
        .limit(400); // ~13 months of daily entries is plenty of headroom

      if (error || !data || cancelled) return;

      const dates = new Set(data.map(r => r.reflection_date as string));
      if (dates.size === 0) {
        setStreak(0);
        return;
      }

      const toISODate = (d: Date) => d.toISOString().slice(0, 10);

      let cursor = new Date();
      let count = 0;

      // If today has no entry yet, start checking from yesterday instead —
      // an unbroken streak shouldn't reset to 0 at 12:01am before the
      // student has had a chance to write today's reflection.
      if (!dates.has(toISODate(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
      }

      while (dates.has(toISODate(cursor))) {
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      }

      if (!cancelled) setStreak(count);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  return streak;
}
