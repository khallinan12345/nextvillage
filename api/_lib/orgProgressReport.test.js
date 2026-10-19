import { describe, it, expect } from 'vitest';
import { buildOrgReport, pickScores, trend } from './orgProgressReport.js';

const row = (o = {}) => ({
  cognitive_score: 60, critical_thinking_score: 50, problem_solving_score: 40, creativity_score: 70,
  session_count: 12, cert_passed_count: 34,
  // fields that must never reach the report:
  cognitive_evidence: ['I wrote that my mother is sick'], pue_summary: 'secret narrative',
  metacog_narrative: 'private note', role_readiness_narrative: 'private', ai_prof_gpt_narrative: 'private',
  ...o,
});

describe('pickScores', () => {
  it('keeps only scores, sessions and certifications', () => {
    expect(Object.keys(pickScores(row())).sort()).toEqual(
      ['cognitive', 'creativity', 'critical_thinking', 'problem_solving', 'sessions'].sort());
  });
  it('returns null when there is no score at all', () => {
    expect(pickScores(row({ cognitive_score: null, critical_thinking_score: null, problem_solving_score: null, creativity_score: null }))).toBeNull();
    expect(pickScores(null)).toBeNull();
  });
});

describe('trend', () => {
  it('calls small changes steady and needs a previous month', () => {
    expect(trend(60, 50)).toBe('up');
    expect(trend(50, 60)).toBe('down');
    expect(trend(52, 50)).toBe('steady');
    expect(trend(52, null)).toBeNull();
  });
});

describe('buildOrgReport', () => {
  const rows = [
    { name: 'Bola <b>', current: pickScores(row()), previous: pickScores(row({ cognitive_score: 40 })) },
    { name: 'Amaka', current: pickScores(row({ cognitive_score: 30 })), previous: null },
    { name: 'Chidi', current: null, previous: null },
  ];
  const r = buildOrgReport({ orgName: 'Davidson AI Futures Lab', monthLabel: 'September 2026', rows });

  it('counts scored and quiet learners and sorts by name', () => {
    expect(r.counts).toEqual({ enrolled: 3, scored: 2, noAssessment: 1 });
    expect(r.text.indexOf('Amaka')).toBeLessThan(r.text.indexOf('Bola'));
  });
  it('shows movement for a learner with a previous month', () => {
    expect(r.text).toContain('Understanding 60 ↑');
  });
  it('never includes what a learner wrote or the AI narratives', () => {
    for (const secret of ['my mother is sick', 'secret narrative', 'private note']) {
      expect(r.text).not.toContain(secret);
      expect(r.html).not.toContain(secret);
    }
    expect(r.text).toContain('does not include what children wrote');
  });
  it('escapes names in the HTML', () => {
    expect(r.html).toContain('Bola &lt;b&gt;');
    expect(r.html).not.toContain('<b>Bola');
  });
  it('lists learners with too little activity without scores', () => {
    expect(r.text).toContain('TOO LITTLE ACTIVITY TO SCORE\n- Chidi');
  });
  it('shows scores under 10 as <10, never a bare 0', () => {
    const low = buildOrgReport({ orgName: 'X', monthLabel: 'August 2026', rows: [{ name: 'Z', current: pickScores(row({ critical_thinking_score: 0, problem_solving_score: 4 })), previous: null }] });
    expect(low.text).toContain('Critical thinking <10');
    expect(low.text).toContain('Problem solving <10');
    expect(low.text).not.toMatch(/Critical thinking 0/);
  });
});
