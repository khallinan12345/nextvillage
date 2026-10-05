import { describe, it, expect } from 'vitest';
import { passwordProblem, friendlyPasswordError } from './passwordRules';

describe('passwordProblem', () => {
  it('rejects passwords shorter than 8', () => {
    expect(passwordProblem('abc123')).toMatch(/at least 8/);
  });
  it('rejects passwords without a digit or without a letter', () => {
    expect(passwordProblem('onlyletters')).toMatch(/letters and numbers/);
    expect(passwordProblem('12345678')).toMatch(/letters and numbers/);
  });
  it('accepts letters plus digits, 8 or more', () => {
    expect(passwordProblem('oloibiri2026')).toBeNull();
  });
});

describe('friendlyPasswordError', () => {
  it('explains a leaked password', () => {
    expect(friendlyPasswordError('Password is known to be weak and easy to guess, please choose a different one.'))
      .toMatch(/data leak/);
  });
  it('explains a too-weak password', () => {
    expect(friendlyPasswordError('Password should be at least 8 characters.')).toMatch(/too weak/);
  });
  it('ignores unrelated errors', () => {
    expect(friendlyPasswordError('Invalid login credentials')).toBeNull();
  });
});
