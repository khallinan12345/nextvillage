// src/components/dashboard/ChangeRequestsCard.tsx
//
// Action items from the Suggest Change process, shown on each staff member's Admin dashboard: proposals
// waiting for their feedback, changes waiting for their review, and the owner / revision / assignment
// steps that are theirs. Renders nothing when there is nothing to do. See pages/admin/ChangeRequestsPage.tsx.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { actionsFor, CHANGE_MANAGER_ROLES, type ChangeAction, type ChangeSuggestion } from '../../lib/changeRequests';

const ChangeRequestsCard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [actions, setActions] = useState<ChangeAction[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [s, f, r] = await Promise.all([
        supabase.from('change_suggestions').select('*').not('status', 'in', '(closed,declined)'),
        supabase.from('change_feedback').select('suggestion_id').eq('user_id', user.id).is('responded_at', null),
        supabase.from('change_reviews').select('suggestion_id').eq('user_id', user.id).is('reviewed_at', null),
      ]);
      if (cancelled || s.error) return; // before the tables exist, or not on the panel: show nothing
      setActions(actionsFor(
        (s.data ?? []) as ChangeSuggestion[],
        { userId: user.id, isManager: CHANGE_MANAGER_ROLES.has(user.role as string) },
        new Set((f.data ?? []).map(x => x.suggestion_id as string)),
        new Set((r.data ?? []).map(x => x.suggestion_id as string)),
      ));
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  if (actions.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center gap-2 font-semibold text-amber-900 mb-2">
        <Lightbulb size={16} /> Suggested changes waiting on you ({actions.length})
      </div>
      <ul className="stack-y-1">
        {actions.map(a => (
          <li key={a.suggestion.id + a.kind}>
            <button className="text-left text-sm text-gray-900 hover:underline" onClick={() => navigate(`/admin/changes/${a.suggestion.id}`)}>
              <strong>{a.suggestion.title}</strong> <span className="text-gray-600">— {a.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChangeRequestsCard;
