import { describe, it, expect } from 'vitest';
import {
  SAFETY_FLOOR,
  COMMUNITY_VALUES,
  FACILITATOR_FLOOR,
  appendSafetyFloor,
  appendFacilitatorFloor,
} from './safetyGuardrails.js';

// The values are added to facilitator chat only. The graders and task writers still use
// appendSafetyFloor(), so their prompts must not change.

describe('community values', () => {
  it('leaves the safety floor untouched so graders and task writers score as before', () => {
    expect(SAFETY_FLOOR).not.toMatch(/HOW WE WORK WITH LEARNERS/);
    expect(appendSafetyFloor('page rules')).toBe(`page rules\n\n${SAFETY_FLOOR}`);
  });

  it('puts the safety limits first and the values after them', () => {
    expect(FACILITATOR_FLOOR.startsWith(SAFETY_FLOOR)).toBe(true);
    expect(FACILITATOR_FLOOR.endsWith(COMMUNITY_VALUES)).toBe(true);
  });

  it('appends the combined floor as the suffix, which the prompt cache split relies on', () => {
    expect(appendFacilitatorFloor('page rules')).toBe(`page rules\n\n${FACILITATOR_FLOOR}`);
    expect(appendFacilitatorFloor('')).toBe(FACILITATOR_FLOOR);
  });

  it('covers each part of the proposal', () => {
    for (const phrase of [
      /respect, honesty, kindness, responsibility and community/,
      /where they come from/,
      /never assume or stereotype/,
      /help the learner think/,
      /trusted person/,
      /an AI and can be wrong/,
    ]) {
      expect(COMMUNITY_VALUES).toMatch(phrase);
    }
  });

  it('does not stop pages that make things from making them', () => {
    expect(COMMUNITY_VALUES).toMatch(/make it well/);
  });
});
