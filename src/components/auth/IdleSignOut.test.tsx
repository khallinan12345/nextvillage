import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signOut = vi.fn();
const getSession = vi.fn();
const navigate = vi.fn();
let mockUser: { id: string } | null = { id: 'u1' };

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { auth: { signOut: (...a: unknown[]) => signOut(...a), getSession: (...a: unknown[]) => getSession(...a) } },
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import IdleSignOut from './IdleSignOut';
import { ACTIVITY_KEY, IDLE_LIMIT_MS, WARN_BEFORE_MS } from '../../lib/idleSignOut';

const mount = () => render(<MemoryRouter><IdleSignOut /></MemoryRouter>);
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

describe('IdleSignOut', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    localStorage.clear();
    signOut.mockReset().mockResolvedValue({ error: null });
    getSession.mockReset().mockResolvedValue({ data: { session: null } });
    navigate.mockReset();
    mockUser = { id: 'u1' };
  });
  afterEach(() => { vi.useRealTimers(); });

  it('stays quiet while the person is active', async () => {
    mount();
    await advance(10 * 60 * 1000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('warns for the last two minutes, then signs out and goes to the login page', async () => {
    mount();
    await advance(IDLE_LIMIT_MS - WARN_BEFORE_MS + 10_000);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    await advance(WARN_BEFORE_MS);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login?idle=1');
  });

  it('"I\'m still here" clears the warning and keeps the person signed in', async () => {
    mount();
    await advance(IDLE_LIMIT_MS - WARN_BEFORE_MS + 10_000);
    fireEvent.click(screen.getByText("I'm still here"));
    await advance(30_000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await advance(WARN_BEFORE_MS);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('activity resets the clock', async () => {
    mount();
    await advance(IDLE_LIMIT_MS - WARN_BEFORE_MS - 20_000);
    fireEvent.keyDown(window, { key: 'a' });
    await advance(WARN_BEFORE_MS + 60_000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does nothing when nobody is signed in', async () => {
    mockUser = null;
    mount();
    await advance(IDLE_LIMIT_MS * 2);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('on opening the app, ends a session that was left idle past the limit', async () => {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - IDLE_LIMIT_MS - 1000));
    getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } });
    mockUser = null; // the profile has not loaded yet at this point
    mount();
    await advance(0);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login?idle=1');
  });

  it('on opening the app, keeps a session that was used recently, or when there is no session', async () => {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - 5 * 60 * 1000));
    getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } });
    mockUser = null;
    mount();
    await advance(0);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('a stale time left from earlier does not sign out a fresh login', async () => {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - IDLE_LIMIT_MS - 1000)); // yesterday
    getSession.mockResolvedValue({ data: { session: null } }); // nobody signed in when the app opened
    mockUser = null;
    const { rerender } = mount();
    await advance(0);
    mockUser = { id: 'u2' }; // signs in a moment later
    rerender(<MemoryRouter><IdleSignOut /></MemoryRouter>);
    await advance(TICK());
    expect(signOut).not.toHaveBeenCalled();
  });
});

function TICK() { return 6000; }
