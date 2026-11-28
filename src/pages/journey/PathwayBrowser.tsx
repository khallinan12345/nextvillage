// src/pages/journey/PathwayBrowser.tsx
//
// Stage 4, "Choosing a Direction": lets a learner add any number of pathways
// to their own shortlist, or remove them, at any time — not a final decision,
// just a running list of what's worth exploring further. Collapsed by default
// so the conversation stays the primary thing on the page.

import { useState } from 'react';

export interface BrowsablePathway {
  id: string;
  cluster_key: string;
  cluster_label: string;
  name: string;
  community_impact: string;
  curriculum_status: 'live' | 'foundation_exists' | 'future';
  reach: 'local' | 'global' | null;
  outlook_score: number | null;
}

const CURRICULUM_LABEL: Record<BrowsablePathway['curriculum_status'], string> = {
  live: 'Live now',
  foundation_exists: 'Foundation exists',
  future: 'To build',
};

const CLUSTERS: { key: string; label: string }[] = [
  { key: 'tech', label: 'Technology & AI' },
  { key: 'energy', label: 'Energy, Infrastructure & Built Environment' },
  { key: 'health', label: 'Health & Wellbeing' },
  { key: 'agri', label: 'Agriculture, Environment & Food Systems' },
  { key: 'finance', label: 'Finance & Economic Development' },
  { key: 'education', label: 'Education & Mentoring' },
  { key: 'civic', label: 'Civic Leadership & Social Work' },
  { key: 'creative', label: 'Creative, Communication & Culture' },
  { key: 'trades', label: 'Trades, Manufacturing & Mechanical Work' },
];

export default function PathwayBrowser({
  catalog,
  shortlist,
  onToggle,
}: {
  catalog: BrowsablePathway[];
  shortlist: Set<string>;
  onToggle: (pathwayId: string, nowExploring: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cluster, setCluster] = useState('all');

  const visible = cluster === 'all' ? catalog : catalog.filter((p) => p.cluster_key === cluster);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold text-gray-900 text-sm">
          Browse all pathways{shortlist.size > 0 ? ` — ${shortlist.size} on your list` : ''}
        </span>
        <span className="text-gray-400" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 flex flex-col gap-3">
          <p className="text-xs text-gray-500">
            Add any that interest you to your list. Add as many as you like, remove them anytime — nothing here commits you to anything.
          </p>
          <select
            value={cluster}
            onChange={(e) => setCluster(e.target.value)}
            className="w-full sm:w-auto rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="all">All clusters</option>
            {CLUSTERS.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>

          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {visible.map((p) => {
              const isExploring = shortlist.has(p.id);
              return (
                <div key={p.id} className="rounded-md border border-gray-200 p-3 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm text-gray-900">{p.name}</p>
                    <button
                      type="button"
                      onClick={() => onToggle(p.id, !isExploring)}
                      className={
                        isExploring
                          ? 'shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-600 text-white'
                          : 'shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }
                    >
                      {isExploring ? '✓ On your list' : 'Add to my list'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600">{p.community_impact}</p>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                    <span>{p.cluster_label}</span>
                    <span>·</span>
                    <span>{CURRICULUM_LABEL[p.curriculum_status]}</span>
                    {p.outlook_score != null && (
                      <>
                        <span>·</span>
                        <span>Outlook {p.outlook_score}/5 ({p.reach === 'global' ? 'remote/global' : 'local'})</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
