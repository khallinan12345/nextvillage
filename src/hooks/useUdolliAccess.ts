import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabaseClient';

// Whether the signed-in person may see the UD-OLLI guardrail lab: an approved
// UD-OLLI member, that org's leader, or a platform administrator. Asks the
// database (udolli_has_access) rather than guessing from profile fields, so a
// pending member — who has typed the join code but isn't approved — never
// sees the link. `loading` stays true until the first answer arrives.
export function useUdolliAccess(): { hasAccess: boolean; loading: boolean } {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setHasAccess(false); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc('udolli_has_access')
      .then(({ data, error }) => {
        if (cancelled) return;
        setHasAccess(!error && data === true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.membership_status]);

  return { hasAccess, loading };
}
