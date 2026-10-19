// src/components/community-impact/PersonAgreedCheck.tsx
//
// Shown above the "Register" button on every advisor form that stores a record about another person
// (patient, farmer, fisher, animal keeper, business owner). The helper must confirm that the person
// knows their details are being recorded and has agreed. Required by the privacy review
// (docs/privacy-and-legal/AI-LEGAL-REVIEW.md, E5): these people have no account and no other way to object.

import React from 'react';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
}

const PersonAgreedCheck: React.FC<Props> = ({ checked, onChange }) => (
  <label className="flex items-start gap-2 text-sm text-gray-700 rounded-lg border border-amber-200 bg-amber-50 p-3">
    <input type="checkbox" className="mt-0.5" checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>
      This person knows I am recording their details here, and has agreed. I have asked only for what is
      needed to help them. They can ask for it to be removed through my group leader.
    </span>
  </label>
);

export default PersonAgreedCheck;
