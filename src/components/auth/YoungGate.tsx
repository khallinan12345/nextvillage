// src/components/auth/YoungGate.tsx
//
// Under-13 tier: wraps a page that young learners must not use (the community-service advisor
// tools, which store records about other people). The database blocks the same tables, so this
// only keeps young learners from landing on a page that cannot work for them.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import AppLayout from '../layout/AppLayout';

const YoungGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [state, setState] = useState<'checking' | 'young' | 'ok'>('checking');

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('viewer_is_young').then(({ data }) => {
      if (!cancelled) setState(data === true ? 'young' : 'ok');
    });
    return () => { cancelled = true; };
  }, []);

  if (state === 'ok') return <>{children}</>;

  if (state === 'young') {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-20 text-center stack-y-3">
          <h1 className="text-xl font-semibold text-gray-900">This tool is not available yet</h1>
          <p className="text-sm text-gray-600">
            It is for older learners, because it keeps notes about other people.
            All of your learning activities are still here for you.
          </p>
          <button
            onClick={() => navigate('/home')}
            className="mt-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            Back to home
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
    </div>
  );
};

export default YoungGate;
