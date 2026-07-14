import { describe, it, expect, vi, afterEach } from 'vitest';

// The module under test mutates the real global console.log/warn — save the
// true originals once, up front, so each test can restore them regardless
// of what a previous test's import did to the global object.
const realLog = console.log;
const realWarn = console.warn;
const realError = console.error;

// import.meta.env.DEV is true under Vitest by default, so these tests force
// the module to re-evaluate as if it were a production (or dev) build to
// verify the actual behavior that matters: console.log/warn become no-ops
// in production, console.error never does, and dev is untouched either way.
describe('silenceProductionLogs', () => {
  afterEach(() => {
    console.log = realLog;
    console.warn = realWarn;
    console.error = realError;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('silences console.log and console.warn in production', async () => {
    vi.stubEnv('DEV', false);

    await import('./silenceProductionLogs');

    expect(console.log).not.toBe(realLog);
    expect(console.warn).not.toBe(realWarn);
    expect(() => console.log('should not print')).not.toThrow();
    expect(() => console.warn('should not print')).not.toThrow();
    expect(console.error).toBe(realError); // untouched
  });

  it('leaves console.log/warn alone in development', async () => {
    vi.stubEnv('DEV', true);

    await import('./silenceProductionLogs');

    expect(console.log).toBe(realLog);
    expect(console.warn).toBe(realWarn);
  });
});
