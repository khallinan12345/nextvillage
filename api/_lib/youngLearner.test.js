import { describe, it, expect } from 'vitest';
import { isYoungLearner, peerChatBlocked } from './youngLearner.js';

const NOW = new Date('2026-10-14T00:00:00Z');
const young10 = { learner_age_min: 10 };
const adults = { learner_age_min: 17 };

describe('isYoungLearner', () => {
  it('uses birth year when present', () => {
    expect(isYoungLearner({ role: 'student', birth_year: 2015 }, adults, NOW)).toBe(true);
    expect(isYoungLearner({ role: 'student', birth_year: 2013 }, adults, NOW)).toBe(true);   // could still be 12
    expect(isYoungLearner({ role: 'student', birth_year: 2012 }, young10, NOW)).toBe(false);
  });
  it('defaults by organization minimum age when birth year is blank', () => {
    expect(isYoungLearner({ role: 'student', birth_year: null }, young10, NOW)).toBe(true);
    expect(isYoungLearner({ role: 'student', birth_year: null }, adults, NOW)).toBe(false);
    expect(isYoungLearner({ role: 'student', birth_year: null }, { learner_age_min: null }, NOW)).toBe(false);
    expect(isYoungLearner({ role: 'student', birth_year: null }, null, NOW)).toBe(false);
  });
  it('never treats staff as young', () => {
    expect(isYoungLearner({ role: 'leader', birth_year: 2016 }, young10, NOW)).toBe(false);
    expect(isYoungLearner({ role: 'platform_administrator', birth_year: null }, young10, NOW)).toBe(false);
  });
});

describe('peerChatBlocked', () => {
  it('blocks young learners by default', () => {
    expect(peerChatBlocked({ role: 'student', birth_year: 2016 }, young10, NOW)).toBe(true);
  });
  it('lets an organization allow it explicitly', () => {
    expect(peerChatBlocked({ role: 'student', birth_year: 2016 }, { ...young10, allow_young_peer_chat: true }, NOW)).toBe(false);
  });
  it('does not block older learners', () => {
    expect(peerChatBlocked({ role: 'student', birth_year: 2005 }, young10, NOW)).toBe(false);
  });
});
