// src/pages/tutorials/OloibiriCampGuidePage.tsx
//
// Oloibiri AI Camp — placeholder scaffold.
//
// The real per-day curriculum content hasn't been saved into this file yet
// (the branch that added this route only ever contained a stray filename
// string, not the actual guide). This scaffold exists so the route/nav
// entry work correctly rather than 404ing or crashing, using the day
// themes already written into the guide card's own blurb (Managing the
// Platform > Create an AI Camp > TutorialsPage.tsx) as section headers.
//
// To finish this: go back to the Use Claude or Gemini chat where the camp
// plan was drafted (per the Create an AI Camp guide) and paste each day's
// real content into its section below, following the step/checkbox
// pattern in FishMarketTutorialPage.tsx or CreateAICampGuidePage.tsx as
// the mirror.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { Compass, Palette } from 'lucide-react';

const DAYS = [
  'Onboarding',
  'Characters',
  'Stories',
  'Problem-Solving',
  'Final Showcase',
];

const OloibiriCampGuidePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-pink-600 to-purple-700 p-6 text-white">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-pink-200">
            <Palette className="h-4 w-4" /> Oloibiri AI Camp
          </div>
          <h1 className="mt-1 text-3xl font-extrabold">Eight Days From Keyboard to Creator</h1>
          <p className="mt-2 max-w-xl text-sm text-pink-100">
            This guide's day-by-day content is still being written. Below are the five days
            already planned — check back soon for the full curriculum.
          </p>
        </div>

        <div className="space-y-3">
          {DAYS.map((day, i) => (
            <div key={day} className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-extrabold text-pink-700">
                {i + 1}
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{day}</h2>
                <p className="text-sm text-gray-400">Content coming soon</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <button onClick={() => navigate('/tutorials')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800">
            <Compass className="h-4 w-4" /> All guides
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default OloibiriCampGuidePage;
