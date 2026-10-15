// src/components/dashboard/MissingBirthYearCard.tsx
//
// Approved learners with no birth year yet. Until a birth year is known, learners in a group
// that includes children under 13 get the younger-learner protections (names hidden, no peer
// chat, vetted AI only). A leader can type the year here, for example from a registration
// form, instead of waiting for each learner to answer the prompt. Renders nothing when
// everyone has one. RLS limits the list to the leader's own organization.

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import BirthYearInput from './BirthYearInput';

interface Learner {
  id: string;
  name: string | null;
  email: string | null;
}

const MissingBirthYearCard: React.FC = () => {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'student')
      .eq('membership_status', 'approved')
      .is('birth_year', null)
      .order('name', { ascending: true })
      .limit(500);
    if (error) {
      console.warn('[MissingBirthYearCard] load failed:', error.message);
      return;
    }
    setLearners((data ?? []) as Learner[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (learners.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3 flex items-center gap-2 text-left"
      >
        <CalendarDays size={18} className="text-gray-500" />
        <span className="flex-1">
          <span className="font-medium text-gray-900">
            {learners.length} learner{learners.length > 1 ? 's' : ''} without a birth year
          </span>
          <span className="block text-xs text-gray-500">
            Until it is known, younger-learner protections may apply to them. Type it here if you have it.
          </span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {learners.map(l => (
            <li key={l.id} className="px-5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{l.name || 'No name given'}</p>
                <p className="text-xs text-gray-500 truncate">{l.email || 'No email'}</p>
              </div>
              <BirthYearInput
                memberId={l.id}
                onSaved={() => setLearners(prev => prev.filter(x => x.id !== l.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MissingBirthYearCard;
