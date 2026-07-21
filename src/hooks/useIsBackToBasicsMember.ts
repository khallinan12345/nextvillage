import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabaseClient';
import { isBackToBasicsMember } from '../lib/backToBasicsScope';

// Shared by nav components (Sidebar, Navbar) that need to know whether the
// current user belongs to Back to Basics Youth Education, without each
// querying profiles independently.
export function useIsBackToBasicsMember(): boolean {
  const { user } = useAuth();
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    if (!user?.id) { setIsMember(false); return; }
    supabase
      .from('profiles')
      .select('organization_id, join_code_used')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setIsMember(isBackToBasicsMember(data?.organization_id, data?.join_code_used)))
      .catch(() => setIsMember(false));
  }, [user?.id]);

  return isMember;
}
