// src/components/profile/BirthYearPrompt.tsx
//
// One-time question shown to anyone signed in whose profile has no birth year
// yet (every existing user once, every new user right after finishing their
// profile). It stays up until answered; it only asks for a year, never a full
// date. Used for age-based consent and safety rules, not shown to anyone else.

import React, { useState } from 'react';
import { Cake } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { parseBirthYear } from '../../lib/birthYear';

const BirthYearPrompt: React.FC<{ userId: string }> = ({ userId }) => {
  const { refreshUserProfile } = useAuth();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseBirthYear(value);
    if (!parsed.ok) { setError(parsed.error); return; }

    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ birth_year: parsed.year })
      .eq('id', userId);
    if (updateError) {
      setSaving(false);
      setError('Could not save that. Please try again.');
      return;
    }
    try { await refreshUserProfile(); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="birth-year-title">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 stack-y-4">
        <div className="text-center">
          <Cake className="mx-auto text-blue-500" size={36} />
          <h2 id="birth-year-title" className="mt-2 text-lg font-semibold text-gray-900">What year were you born?</h2>
          <p className="mt-1 text-sm text-gray-600">
            We only ask for the year. It helps us keep nextVillage safe and age-appropriate for everyone. You only need to answer once.
          </p>
        </div>
        <div>
          <label htmlFor="birth-year-input" className="sr-only">Birth year</label>
          <input
            id="birth-year-input"
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={value}
            onChange={e => { setValue(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder="For example, 2010"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={saving || value.length !== 4}
          className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
};

export default BirthYearPrompt;
