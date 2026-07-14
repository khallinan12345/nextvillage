import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  grade_level?: number;
  country?: string;
  school_name?: string;
  avatar_url?: string;
  team_id?: string;
  profile_completed?: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: UserProfile | null;
  session: Session | null;
  loading: boolean;
  needsProfileCompletion: boolean;
  markProfileCompleted: (userId: string) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);

  // Protection refs
  const initializedRef = useRef(false);
  const fetchingRef = useRef(false);
  const profileConfirmedRef = useRef(false);
  // stable ref to avoid placing `user` into callback deps
  const userRef = useRef<UserProfile | null>(null);

  // keep userRef in sync
  useEffect(() => { userRef.current = user; }, [user]);

  /**
   * Ensure a profile row exists for the given user id.
   * If none exists, automatically insert/upsert a minimal row with role 'student'.
   * Returns the profile row or null on failure.
   */
  const ensureProfileRow = useCallback(async (userId: string, email?: string) => {
    try {
      // Try to select single row
      const selectResult = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!selectResult.error && selectResult.data) {
        profileConfirmedRef.current = true;
        return selectResult.data as any;
      }

      // If error indicates no rows returned OR data is null -> create minimal profile
      const selectErr: any = selectResult.error;
      const noRows = (selectErr && (selectErr.code === 'PGRST116' || String(selectErr.message).includes('No rows returned'))) || !selectResult.data;

      if (noRows) {
        // Use upsert so concurrent inserts won't fail and role is lowercase 'student'
        const payload = {
          id: userId,
          email: email ?? null,
          role: 'student',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any;

        const upsertResult = await supabase
          .from('profiles')
          .upsert([payload], { onConflict: 'id' })
          .select()
          .single();

        if (upsertResult.error) {
          console.warn('[Auth] ensureProfileRow upsert failed:', upsertResult.error);
          return null;
        }

        profileConfirmedRef.current = true;
        return upsertResult.data as any;
      }

      // Other errors - log and return null
      console.error('[Auth] ensureProfileRow unexpected select error:', selectErr);
      return null;
    } catch (err) {
      console.error('[Auth] ensureProfileRow exception:', err);
      return null;
    }
  }, []);

  // fetchUserProfile wrapped in useCallback to avoid recreating function.
  // `force` skips the cached-user fast path — use this any time you need to
  // read the actual current row (e.g. right after writing to `profiles`).
  const fetchUserProfile = useCallback(async (userId: string, force: boolean = false) => {
    if (fetchingRef.current) {
      console.log('[Auth] Profile fetch already in progress, skipping');
      return null;
    }

    // If profile already confirmed for same user, return cached user from ref —
    // unless the caller explicitly wants a fresh read.
    if (!force && profileConfirmedRef.current && userRef.current?.id === userId) {
      console.log('[Auth] Profile already confirmed, returning cached user');
      return userRef.current;
    }

    try {
      fetchingRef.current = true;
      console.log('[Auth] fetchUserProfile for', userId, force ? '(forced)' : '');
      console.log('Sending query to Supabase profiles table...');

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 2000)
      );

      let timedOut = false;
      const result: any = await Promise.race([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        timeoutPromise,
      ]).catch((err: any) => {
        console.warn('[Auth] fetchUserProfile query timed out:', err?.message);
        timedOut = true;
        return { data: null, error: null };
      });

      if (timedOut) {
        // Do NOT fabricate a profile here and do NOT set profileConfirmedRef —
        // that previously poisoned the cache with fake data that looked
        // "confirmed" forever. Tell the caller this attempt was inconclusive
        // so it can retry instead of treating it as a real profile.
        return 'TIMEOUT' as any;
      }

      console.log('Supabase response:', { data: result.data, error: result.error });

      if (result.error) {
        // If no rows returned -> null (caller may call ensureProfileRow)
        if (result.error.code === 'PGRST116' || String(result.error.message).includes('No rows returned')) {
          console.log('[Auth] fetchUserProfile: no profile found');
          profileConfirmedRef.current = false;
          return null;
        }

        // Auth/session errors: return special token so caller can handle
        if (result.error.message?.includes('JWT') || result.error.message?.includes('auth') || result.error.message?.includes('token') || String(result.error.code) === '401') {
          console.warn('[Auth] fetchUserProfile auth error (session may not be ready):', result.error.message);
          return 'AUTH_ERROR' as any;
        }

        console.error('[Auth] fetchUserProfile error:', result.error);
        return null;
      }

      // Success
      profileConfirmedRef.current = true;
      return result.data as any;
    } catch (err: any) {
      console.error('[Auth] fetchUserProfile exception:', err);
      // Ensure we don't leave the app stuck in a loading spinner
      try { setLoading(false); } catch (e) { /* noop */ }
      return null;
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  const refreshUserProfile = useCallback(async () => {
    console.log('[Auth] refreshUserProfile start');
    if (!session?.user) {
      console.log('[Auth] no session user, skipping refresh');
      return;
    }

    try {
      let profile = await fetchUserProfile(session.user.id, true);

      if (profile === 'AUTH_ERROR') {
        console.warn('[Auth] refreshUserProfile aborted due to auth error');
        return;
      }

      if (profile === 'TIMEOUT') {
        // One retry — a genuine write (e.g. profile completion) just
        // happened and we need the real row, not a stale/fake one.
        console.warn('[Auth] refreshUserProfile query timed out, retrying once');
        profile = await fetchUserProfile(session.user.id, true);
        if (profile === 'TIMEOUT' || profile === 'AUTH_ERROR') {
          console.warn('[Auth] refreshUserProfile retry also failed, giving up for now');
          return;
        }
      }

      if (profile) {
        setUser(profile);
        // Consider profile_completed flag; fallback to true if explicit
        setNeedsProfileCompletion(!(profile as any).profile_completed);
        profileConfirmedRef.current = true;
      } else {
        // Try to ensure profile exists by creating minimal row
        const ensured = await ensureProfileRow(session.user.id, session.user.email ?? undefined);
        if (ensured) {
          setUser(ensured);
          setNeedsProfileCompletion(!(ensured as any).profile_completed);
        } else {
          // Build minimal local user object to drive UI (forcing completion)
          const minimalUser: UserProfile = {
            id: session.user.id,
            name: '',
            email: session.user.email || '',
            role: 'student',
            created_at: session.user.created_at || '',
            updated_at: session.user.created_at || '',
          };
          setUser(minimalUser);
          setNeedsProfileCompletion(true);
          profileConfirmedRef.current = false;
        }
      }

      console.log('[Auth] refreshUserProfile done');
    } catch (error) {
      console.error('[Auth] refreshUserProfile error:', error);
      // ensure loading is not stuck if invoked during init
      try { setLoading(false); } catch (e) { /* noop */ }
    }
  }, [session?.user?.id, ensureProfileRow, fetchUserProfile]);

  const markProfileCompleted = useCallback(async (userId: string) => {
    console.log('[Auth] markProfileCompleted for', userId);
    try {
      setNeedsProfileCompletion(false);
      profileConfirmedRef.current = true;
      // Fire a background refresh
      refreshUserProfile().catch(err =>
        console.warn('[Auth] background refresh after markProfileCompleted failed:', err)
      );
    } catch (error) {
      console.error('[Auth] markProfileCompleted exception:', error);
      throw error;
    }
  }, [refreshUserProfile]);

  // Main initialization - runs once
  useEffect(() => {
    if (initializedRef.current) {
      console.log('[Auth] Already initialized, skipping');
      return;
    }

    initializedRef.current = true;
    console.log('[Auth] initAuth start');

    const timeoutId = setTimeout(() => {
      console.log('[Auth] TIMEOUT - forcing loading to false');
      setLoading(false);
    }, 30000);

    const initAuth = async () => {
      try {
        console.log('[Auth] Getting session...');
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log('[Auth] got session:', !!currentSession);

        setSession(currentSession);

        if (currentSession?.user) {
          console.log('[Auth] Session user found, checking for profile...');

          // Try fetch first
          let profile = await fetchUserProfile(currentSession.user.id);
          if (profile === 'TIMEOUT') {
            console.warn('[Auth] Initial profile fetch timed out, retrying once');
            profile = await fetchUserProfile(currentSession.user.id, true);
          }

          if (profile === 'AUTH_ERROR' || profile === 'TIMEOUT') {
            // session not ready, or the query timed out; treat as no profile
            // but do not force insert, and — critically — do not mark
            // profileConfirmedRef true. That flag being set from a fake
            // "profile" is what previously trapped users behind a
            // completion popup that never cleared.
            console.warn('[Auth] Profile fetch inconclusive during init (', profile, ') - deferring');
            const minimalUser: UserProfile = {
              id: currentSession.user.id,
              name: '',
              email: currentSession.user.email || '',
              role: 'student',
              created_at: currentSession.user.created_at || '',
              updated_at: currentSession.user.created_at || '',
            };
            setUser(minimalUser);
            setNeedsProfileCompletion(true);
            profileConfirmedRef.current = false;
          } else if (profile) {
            console.log('[Auth] Profile found, setting user state');
            setUser(profile);
            setNeedsProfileCompletion(!profile.profile_completed);
            profileConfirmedRef.current = true;
          } else {
            // No profile found -> create minimal row and set state
            console.log('[Auth] No profile found - attempting auto-upsert');
            const ensured = await ensureProfileRow(currentSession.user.id, currentSession.user.email ?? undefined);
            if (ensured) {
              setUser(ensured);
              setNeedsProfileCompletion(!(ensured as any).profile_completed);
              profileConfirmedRef.current = true;
            } else {
              // fallback minimal user to prompt completion UI
              const minimalUser: UserProfile = {
                id: currentSession.user.id,
                name: '',
                email: currentSession.user.email || '',
                role: 'student',
                created_at: currentSession.user.created_at || '',
                updated_at: currentSession.user.created_at || '',
              };
              setUser(minimalUser);
              setNeedsProfileCompletion(true);
              profileConfirmedRef.current = false;
            }
          }
        } else {
          console.log('[Auth] no session, user not logged in');
          setUser(null);
          setNeedsProfileCompletion(false);
          profileConfirmedRef.current = false;
        }
      } catch (error) {
        console.error('[Auth] initAuth error:', error);
        setUser(null);
        setNeedsProfileCompletion(false);
        profileConfirmedRef.current = false;
        // Ensure UI isn't stuck on loading if initAuth fails
        try { setLoading(false); } catch (e) { /* noop */ }
      } finally {
        clearTimeout(timeoutId);
        console.log('[Auth] Setting loading to false...');
        setLoading(false);
        console.log('[Auth] initAuth done - loading set to false');
      }
    };

    initAuth();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [fetchUserProfile, ensureProfileRow]);

  // Auth state change listener
  useEffect(() => {
    if (!initializedRef.current) return;

    console.log('[Auth] Setting up auth state listener');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[Auth] onAuthStateChange:', event, !!newSession);

      if (event === 'INITIAL_SESSION') {
        console.log('[Auth] skipping INITIAL_SESSION');
        return;
      }

      setSession(newSession);

      if (event === 'SIGNED_IN' && newSession?.user) {
        console.log('[Auth] user signed in, checking for profile');

        // Avoid redundant fetch if already confirmed for this same user
        if (profileConfirmedRef.current && userRef.current?.id === newSession.user.id) {
          console.log('[Auth] Profile already confirmed for this user, skipping fetch');
          return;
        }

        let profile = await fetchUserProfile(newSession.user.id);

        if ((profile as any) === 'AUTH_ERROR') {
          console.warn('[Auth] Auth error in SIGNED_IN handler — skipping popup');
          return;
        }

        if ((profile as any) === 'TIMEOUT') {
          // Retry once with force before giving up — this is exactly the
          // path a fresh login takes, and a slow first query shouldn't
          // masquerade as "no profile" or "profile confirmed".
          console.warn('[Auth] Profile fetch timed out in SIGNED_IN handler, retrying once');
          profile = await fetchUserProfile(newSession.user.id, true);
          if ((profile as any) === 'TIMEOUT' || (profile as any) === 'AUTH_ERROR') {
            console.warn('[Auth] Retry also failed — leaving user state as-is for now');
            return;
          }
        }

        if (profile) {
          setUser(profile);
          setNeedsProfileCompletion(profile.profile_completed === false);
          profileConfirmedRef.current = true;
        } else {
          // No profile found -> ensure one exists
          console.log('[Auth] Signed in user has no profile - attempting auto-upsert');
          const ensured = await ensureProfileRow(newSession.user.id, newSession.user.email ?? undefined);
          if (ensured) {
            setUser(ensured);
            setNeedsProfileCompletion(!(ensured as any).profile_completed);
            profileConfirmedRef.current = true;
          } else {
            const minimalUser: UserProfile = {
              id: newSession.user.id,
              name: '',
              email: newSession.user.email || '',
              role: 'student',
              created_at: newSession.user.created_at || '',
              updated_at: newSession.user.created_at || '',
            };
            setUser(minimalUser);
            setNeedsProfileCompletion(true);
            profileConfirmedRef.current = false;
          }
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('[Auth] user signed out');
        setUser(null);
        setNeedsProfileCompletion(false);
        profileConfirmedRef.current = false;
      }
    });

    return () => {
      console.log('[Auth] Cleaning up auth listener');
      try { subscription?.unsubscribe(); } catch (e) { /* noop */ }
    };
  }, [fetchUserProfile, ensureProfileRow]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      needsProfileCompletion,
      markProfileCompleted,
      refreshUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;