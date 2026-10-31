// src/components/auth/ForcePasswordChange.tsx
//
// Shown by RequireAuth, in place of the whole app, when an administrator created the account with a temporary
// password (app_metadata.must_change_password). The person sets their own password; the flag is then cleared
// on the server and every other sign-in is ended.

import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { passwordProblem, friendlyPasswordError, PASSWORD_RULE_TEXT } from '../../lib/passwordRules';

const ForcePasswordChange: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { error: clearError } = await supabase.rpc('clear_must_change_password');
      if (clearError) throw clearError;

      try {
        await supabase.auth.signOut({ scope: 'others' });
      } catch (signOutError) {
        console.warn('Could not sign out other sessions after the password change:', signOutError);
      }

      // The flag lives in the sign-in token, so get a fresh one and reload into the app.
      await supabase.auth.refreshSession();
      window.location.assign('/home');
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(friendlyPasswordError(raw) || raw || 'Could not change your password. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-extrabold text-blue-600">nextVillage.community</h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Choose your own password to continue. The temporary one you signed in with will stop working.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-lg sm:px-10">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md text-sm mb-6" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="stack-y-6">
            <div>
              <Input
                label="New password"
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
              />
              <p className="mt-1 text-xs text-gray-500">{PASSWORD_RULE_TEXT}</p>
            </div>
            <Input
              label="Confirm new password"
              id="confirm-new-password"
              name="confirm-new-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              fullWidth
            />
            <Button type="submit" fullWidth disabled={loading}>
              {loading ? 'Saving…' : 'Set my password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
