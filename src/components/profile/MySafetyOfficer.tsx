// src/components/profile/MySafetyOfficer.tsx
// Shows a member their own organization's child safety officer, so they and their family know who to
// go to with a worry. Read-only; leaders change it from their dashboard (SafetyOfficerCard).

import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface Officer { org_name: string | null; officer_name: string | null; officer_email: string | null; officer_phone: string | null }

const MySafetyOfficer: React.FC = () => {
  const [officer, setOfficer] = useState<Officer | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc('my_safety_officer').then(({ data }) => {
      const row = (Array.isArray(data) ? data[0] : data) as Officer | undefined;
      if (alive) setOfficer(row?.officer_name ? row : null);
    });
    return () => { alive = false; };
  }, []);
  if (!officer) return null;
  return (
    <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4 text-emerald-700" /> Your child safety officer
      </p>
      <p className="text-sm text-gray-800 mt-1">
        <strong>{officer.officer_name}</strong>
        {officer.officer_phone ? ` · ${officer.officer_phone}` : ''}
        {officer.officer_email ? ` · ${officer.officer_email}` : ''}
      </p>
      <p className="text-xs text-gray-600 mt-0.5">Talk to them, or to your group leader, about anything that worries you.</p>
    </div>
  );
};

export default MySafetyOfficer;
