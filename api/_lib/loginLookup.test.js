import { describe, it, expect } from 'vitest';
import { normalizeEmails, buildLoginEmail } from './loginLookup.js';

describe('normalizeEmails', () => {
  it('trims, lower-cases, de-duplicates and caps at 5', () => {
    expect(normalizeEmails([' A@Gmail.com ', 'a@gmail.com', 'b@gmail.com', 'c@x.org', 'd@x.org', 'e@x.org', 'f@x.org']))
      .toEqual(['a@gmail.com', 'b@gmail.com', 'c@x.org', 'd@x.org', 'e@x.org']);
  });
  it('drops anything that is not a plain email, and non-lists', () => {
    expect(normalizeEmails(['nope', 'a@b', 'x@y.com, z@y.com', '<s>@x.com', 5, null, 'ok@y.com'])).toEqual(['ok@y.com']);
    expect(normalizeEmails('a@b.com')).toEqual([]);
    expect(normalizeEmails(undefined)).toEqual([]);
  });
});

describe('buildLoginEmail', () => {
  const site = 'https://www.nextvillage.community';
  it('active: confirms the address and links sign-in', () => {
    const m = buildLoginEmail({ status: 'active' }, 'me@gmail.com', site);
    expect(m.text).toContain('me@gmail.com is your sign-in email');
    expect(m.text).toContain(`${site}/login`);
  });
  it('merged: names the address to use now and says not to make a new account', () => {
    const m = buildLoginEmail({ status: 'merged', login_email: 'main@gmail.com' }, 'old@gmail.com', site);
    expect(m.text).toContain('main@gmail.com');
    expect(m.text).toContain('do not make a new account');
  });
  it('none: says there is no account and offers other addresses', () => {
    const m = buildLoginEmail({ status: 'none' }, 'x@gmail.com', site);
    expect(m.text).toContain('No nextVillage account uses x@gmail.com');
  });
  it('inactive: points to a leader', () => {
    expect(buildLoginEmail({ status: 'inactive' }, 'x@gmail.com', site).text).toContain('leader');
  });
  it('escapes HTML', () => {
    expect(buildLoginEmail({ status: 'merged', login_email: 'a"<b>@x.com' }, 'o@x.com', site).html).not.toContain('<b>');
  });
});
