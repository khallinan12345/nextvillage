import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import {
  idleState, msUntilSignOut, readLastActivity, writeLastActivity, formatCountdown,
} from '../../lib/idleSignOut';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'] as const;
const TICK_MS = 5_000;
const WRITE_THROTTLE_MS = 10_000;

/**
 * Signs the person out after a long stretch with no activity (see src/lib/idleSignOut.ts). Renders a small
 * "still there?" notice for the last two minutes; any key, tap or click dismisses it.
 */
const IdleSignOut: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState<number | null>(null); // ms until sign-out, only while warning
  const lastWrite = useRef(0);
  const startupChecked = useRef(false);
  const signingOut = useRef(false);

  const signOutIdle = useCallback(async () => {
    if (signingOut.current) return; // the next tick can fire before the sign-out has finished
    signingOut.current = true;
    setRemaining(null);
    try { await supabase.auth.signOut(); } catch (e) { console.warn('[IdleSignOut] sign-out failed', e); }
    navigate('/login?idle=1');
    signingOut.current = false;
  }, [navigate]);

  // Once, when the app opens: a session left behind by a closed browser that has been idle too long ends now.
  // A fresh sign-in later in this visit is not affected (there is no session yet at this point).
  useEffect(() => {
    if (startupChecked.current) return;
    startupChecked.current = true;
    (async () => {
      try {
        const last = readLastActivity();
        if (last === null) return;
        const { data } = await supabase.auth.getSession();
        if (data.session && idleState(Date.now(), last) === 'expired') await signOutIdle();
      } catch (e) {
        console.warn('[IdleSignOut] startup check failed', e);
      }
    })();
  }, [signOutIdle]);

  useEffect(() => {
    if (!user) { setRemaining(null); return; }

    const touch = () => {
      const now = Date.now();
      setRemaining(null);
      if (now - lastWrite.current >= WRITE_THROTTLE_MS) {
        lastWrite.current = now;
        writeLastActivity(now);
      }
    };
    // Signing in counts as activity.
    lastWrite.current = Date.now();
    writeLastActivity(lastWrite.current);

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, touch, { passive: true }));

    const tick = window.setInterval(() => {
      const now = Date.now();
      const last = readLastActivity() ?? now; // another tab may have been active
      const state = idleState(now, last);
      if (state === 'expired') void signOutIdle();
      else if (state === 'warn') setRemaining(msUntilSignOut(now, last));
      else setRemaining(null);
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, touch));
      window.clearInterval(tick);
    };
  }, [user, signOutIdle]);

  if (!user || remaining === null) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Are you still there?"
      className="fixed bottom-4 left-1/2 z-[1000] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-lg"
    >
      <p className="text-sm font-semibold text-amber-900">Are you still there?</p>
      <p className="mt-1 text-sm text-amber-900">
        To keep your account safe on shared computers, we sign you out after a long time with no activity.
        You will be signed out in <strong>{formatCountdown(remaining)}</strong>.
      </p>
      <button
        type="button"
        className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        onClick={() => { writeLastActivity(Date.now()); setRemaining(null); }}
      >
        I'm still here
      </button>
    </div>
  );
};

export default IdleSignOut;
