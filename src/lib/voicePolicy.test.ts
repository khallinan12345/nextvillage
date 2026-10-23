import { describe, it, expect } from 'vitest';
import { stageForDays, effectiveStage, AUTO_DAYS, TAP_DAYS } from './voicePolicy';

describe('voice fades as learners advance', () => {
  it('is automatic in the first days, then tap, then off', () => {
    expect(stageForDays(0)).toBe('auto');
    expect(stageForDays(AUTO_DAYS)).toBe('auto');
    expect(stageForDays(AUTO_DAYS + 1)).toBe('tap');
    expect(stageForDays(TAP_DAYS)).toBe('tap');
    expect(stageForDays(TAP_DAYS + 1)).toBe('off');
  });
  it('lets a learner choice win either way', () => {
    expect(effectiveStage(100, 'auto')).toBe('auto');
    expect(effectiveStage(0, 'off')).toBe('off');
    expect(effectiveStage(100, null)).toBe('off');
  });
});
