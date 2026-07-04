// src/components/dashboard/ReflectionCard.tsx
//
// Daily reflection habit card for DashboardPage. Shows the AI Camp
// curriculum prompt during the two-week camp window, and a rotating
// general prompt for every other day — so the habit installed during
// camp keeps working for any Oloibiri student long after camp ends.

import React, { useEffect, useState } from 'react';
import { BookOpen, Flame, Check, Loader2 } from 'lucide-react';
import classNames from 'classnames';
import { supabase } from '../../lib/supabaseClient';
import { useReflectionStreak } from '../../hooks/useReflectionStreak';

// ── Camp window ──────────────────────────────────────────────────────────
// TODO: set to the real camp dates once finalized. Outside this window
// (or if these are left null), every student — camper or not — gets the
// general prompt bank below.
const CAMP_START_DATE: string | null = null; // e.g. '2026-07-13'
const CAMP_END_DATE: string | null = null;   // e.g. '2026-07-24'

// Pulled directly from the "Ten Days. Infinite Futures." curriculum —
// same wording girls see on their printed Day 1 article and daily schedule.
const CAMP_PROMPTS: Record<number, string> = {
  1:  "One thing AI surprised me with today. One question I still have.",
  2:  "What data would I need to teach an AI to recognize kindness?",
  3:  "What can AI communicate that humans struggle to? What can humans communicate that AI never will?",
  4:  "If AI can see, does it understand? What is the difference between seeing and understanding?",
  5:  "Your morning WPM was ___. Your afternoon WPM was ___. What changed?",
  6:  "Would I trust an AI doctor? Under what conditions?",
  7:  "If AI makes the art, who is the artist? Does it matter?",
  8:  "Which job do I want, and is it safe from AI?",
  9:  "Who in my community most needs AI — and what's standing in their way?",
  10: "I came in thinking AI was ___. I'm leaving knowing AI is ___. And I'm going to use it to ___, because that's what I care about.",
};

// General rotation for any day outside the camp window — deterministic
// per calendar day (not random per page load) so a student who checks
// the dashboard twice in one day sees the same question both times.
const GENERAL_PROMPTS: string[] = [
  "What is one thing AI helped you do this week that you couldn't have done alone?",
  "Describe a moment this week when you didn't trust something AI told you. What made you pause?",
  "If you explained today's AI Learning session to a friend in one sentence, what would you say?",
  "What is a task you still want to do yourself, even if AI could do it faster?",
  "Who in your life would benefit most from what you learned about AI today — and what would you teach them first?",
  "What is something AI got wrong for you recently? What did that teach you about how it works?",
  "Name one skill you're building that AI can't replace. Why does it matter?",
  "What question about AI are you still trying to answer for yourself?",
  "Think of someone who has never used AI. What would surprise them most about your work today?",
  "What did you build, write, or create today that you're proud of — with or without AI's help?",
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCampDayForDate(dateISO: string): number | null {
  if (!CAMP_START_DATE || !CAMP_END_DATE) return null;
  if (dateISO < CAMP_START_DATE || dateISO > CAMP_END_DATE) return null;

  const start = new Date(CAMP_START_DATE);
  const current = new Date(dateISO);
  const diffDays = Math.round((current.getTime() - start.getTime()) / 86400000);

  // Camp runs Mon-Fri, two weeks — day 1..10, skipping weekends.
  const week = Math.floor(diffDays / 7);
  const dayInWeek = diffDays % 7;
  if (dayInWeek > 4) return null; // Saturday/Sunday
  const campDay = week * 5 + dayInWeek + 1;
  return campDay >= 1 && campDay <= 10 ? campDay : null;
}

function getPromptForToday(): { text: string; campDay: number | null } {
  const dateISO = todayISO();
  const campDay = getCampDayForDate(dateISO);
  if (campDay && CAMP_PROMPTS[campDay]) {
    return { text: CAMP_PROMPTS[campDay], campDay };
  }
  // Deterministic day-of-year rotation through the general bank.
  const dayOfYear = Math.floor(
    (new Date(dateISO).getTime() - new Date(dateISO.slice(0, 4) + '-01-01').getTime()) / 86400000
  );
  const idx = dayOfYear % GENERAL_PROMPTS.length;
  return { text: GENERAL_PROMPTS[idx], campDay: null };
}

interface ReflectionCardProps {
  userId: string;
}

const ReflectionCard: React.FC<ReflectionCardProps> = ({ userId }) => {
  const streak = useReflectionStreak(userId);
  const { text: promptText, campDay } = getPromptForToday();

  const [reflectionText, setReflectionText] = useState('');
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('daily_reflections')
        .select('id, reflection_text')
        .eq('user_id', userId)
        .eq('reflection_date', todayISO())
        .maybeSingle();

      if (!cancelled && data) {
        setExistingId(data.id);
        setReflectionText(data.reflection_text ?? '');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleSave = async () => {
    if (!reflectionText.trim() || saving) return;
    setSaving(true);

    const payload = {
      user_id: userId,
      reflection_date: todayISO(),
      camp_day: campDay,
      prompt_text: promptText,
      reflection_text: reflectionText.trim(),
    };

    const { data, error } = await supabase
      .from('daily_reflections')
      .upsert(payload, { onConflict: 'user_id,reflection_date' })
      .select('id')
      .single();

    setSaving(false);
    if (!error && data) {
      setExistingId(data.id);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-indigo-100 overflow-hidden">
      <div className="px-5 py-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          {campDay ? `Day ${campDay} Reflection` : 'Daily Reflection'}
        </h2>
        {streak > 0 && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
            aria-label={`${streak} day reflection streak`}
          >
            <Flame size={15} className="text-indigo-500" />
            {streak} day{streak !== 1 ? 's' : ''} streak
          </span>
        )}
      </div>

      <div className="p-5">
        <p className="text-sm text-gray-700 italic mb-3">"{promptText}"</p>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <textarea
              value={reflectionText}
              onChange={e => setReflectionText(e.target.value)}
              rows={4}
              placeholder="Write a few sentences..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {existingId ? 'You can update this any time today.' : 'Private — only you and your facilitator can see this.'}
              </span>
              <button
                onClick={handleSave}
                disabled={!reflectionText.trim() || saving}
                className={classNames(
                  'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                  !reflectionText.trim() || saving
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                )}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : justSaved ? (
                  <Check className="h-4 w-4" />
                ) : null}
                {justSaved ? 'Saved' : existingId ? 'Update' : 'Save Reflection'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReflectionCard;
