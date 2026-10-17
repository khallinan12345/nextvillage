import { describe, it, expect } from 'vitest';
import { resolveLeaderEmails } from './safetyGuardrails.js';

// A tiny fake of the three REST lookups the function makes.
function fakeFetch(db) {
  return async (url) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    const q = (k) => u.searchParams.get(k);
    let rows = db[table] ?? [];
    const id = q('id'), org = q('organization_id'), role = q('role');
    if (id) rows = rows.filter(r => `eq.${r.id}` === id);
    if (org) rows = rows.filter(r => `eq.${r.organization_id}` === org);
    if (role?.startsWith('in.(')) {
      const roles = role.slice(4, -1).split(',');
      rows = rows.filter(r => roles.includes(r.role));
    } else if (role?.startsWith('eq.')) {
      rows = rows.filter(r => r.role === role.slice(3));
    }
    return { json: async () => rows };
  };
}

describe('resolveLeaderEmails', () => {
  const db = {
    profiles: [
      { id: 's1', name: 'Learner', email: 'l@x', city: 'Oloibiri', organization_id: 'o1', role: 'student' },
      { id: 'a', email: 'plain-leader@x', organization_id: 'o1', role: 'leader' },
      { id: 'b', email: 'site-leader-1@x', organization_id: 'o1', role: 'site_leader' },
      { id: 'c', email: 'site-leader-2@x', organization_id: 'o1', role: 'site_leader' },
      { id: 'd', email: 'other-org@x', organization_id: 'o2', role: 'site_leader' },
      { id: 'e', email: 'primary@x', organization_id: 'o1', role: 'teacher' },
      { id: 'f', email: 'site-admin@x', organization_id: 'o1', role: 'site_administrator' },
    ],
    organizations: [{ id: 'o1', leader_id: 'e' }],
  };

  it('reaches site leaders, leaders and the primary leader of the learner\'s organization only', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = fakeFetch(db);
    try {
      const { leaderEmails } = await resolveLeaderEmails('s1', 'https://db.test', 'key');
      expect(leaderEmails.sort()).toEqual(['plain-leader@x', 'primary@x', 'site-admin@x', 'site-leader-1@x', 'site-leader-2@x']);
    } finally { globalThis.fetch = orig; }
  });
});
