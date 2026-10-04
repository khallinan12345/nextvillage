// src/components/auth/PendingApprovalScreen.tsx
//
// Shown by RequireAuth in place of every signed-in page while a person's
// request to join an organization is waiting for a leader (or was
// declined). The database already keeps pending members out of the org's
// rooms, member lists and leaderboards (get_my_profile() reports no org for
// them) — this screen just tells them why, instead of showing a half-empty
// app.

import React, { useState } from 'react';
import { Clock, XCircle, RefreshCw, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

const PendingApprovalScreen: React.FC<{ status: 'pending' | 'declined' }> = ({ status }) => {
  const { refreshUserProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try { await refreshUserProfile(); } finally { setChecking(false); }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const declined = status === 'declined';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-md w-full p-8 text-center space-y-4">
        {declined
          ? <XCircle className="mx-auto text-red-500" size={40} />
          : <Clock className="mx-auto text-amber-500" size={40} />}
        <h1 className="text-xl font-semibold text-gray-900">
          {declined ? 'Your request was not approved' : 'Waiting for your leader'}
        </h1>
        <p className="text-gray-600 text-sm">
          {declined
            ? 'A leader of this organization did not approve your request to join. If you think this is a mistake, please speak to your leader in person.'
            : 'Your request to join has been sent to your organization’s leaders. You’ll be able to use the platform as soon as one of them approves you.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          {!declined && (
            <button onClick={checkAgain} disabled={checking}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60">
              <RefreshCw size={16} className={checking ? 'animate-spin' : ''} /> Check again
            </button>
          )}
          <button onClick={signOut}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalScreen;
