// src/components/dashboard/ExplorePathCard.tsx
//
// Phase 2 opt-in entry point for the personalized learning journey
// (src/pages/journey/PathwaysExplorerPage.tsx). Purely additive — every
// learner who doesn't click through sees the rest of the Dashboard exactly
// as before. Checks my_journey_session() only to swap the button's wording
// once a learner has actually started, so "continue" makes sense instead of
// always saying "start".

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const ExplorePathCard: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('my_journey_session').then(({ data, error }) => {
      if (cancelled || error) return;
      setHasStarted(Array.isArray(data) && data.length > 0);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b bg-linear-to-r from-indigo-50 to-emerald-50">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Compass size={20} className="text-indigo-600" />
          Explore your path
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          A mentoring conversation to help you think about the kind of work and life you want — and line up your learning to get you there.
        </p>
      </div>
      <div className="p-5">
        <p className="text-xs text-gray-500 mb-3">Totally optional. Nothing here is required, and you decide where it goes.</p>
        <Link
          to="/pathways"
          className="inline-block px-4 py-2 rounded-md bg-indigo-700 text-white font-medium hover:bg-indigo-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {hasStarted ? 'Continue exploring' : 'Start exploring'}
        </Link>
      </div>
    </div>
  );
};

export default ExplorePathCard;
