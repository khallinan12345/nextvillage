// src/components/dashboard/BirthYearInput.tsx
//
// A leader types a member's birth year (for example from a registration form). Saved through
// set_member_birth_year(), which re-checks that the caller leads the member's organization.
// Year only, never a full birthday.

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface Props {
  memberId: string;
  onSaved: (year: number) => void;
}

const BirthYearInput: React.FC<Props> = ({ memberId, onSaved }) => {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thisYear = new Date().getFullYear();
  const year = Number(value);
  const valid = /^\d{4}$/.test(value) && year >= 1920 && year <= thisYear;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('set_member_birth_year', {
      target_user: memberId,
      new_birth_year: year,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onSaved(year);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        type="text" inputMode="numeric" maxLength={4} value={value}
        onChange={e => setValue(e.target.value.replace(/\D/g, ''))}
        placeholder="Birth year"
        aria-label="Birth year"
        className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm"
      />
      <button
        onClick={save} disabled={!valid || saving}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {saving && <Loader2 size={12} className="animate-spin" />}
        Save
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
};

export default BirthYearInput;
