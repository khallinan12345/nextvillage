import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type AuthState = {
  user: { membership_status: string };
  session: { user: { app_metadata: Record<string, unknown>; user_metadata?: Record<string, unknown> } };
  loading: boolean;
};
let authState: AuthState;
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: {}, rpc: vi.fn() } }));

import RequireAuth from './RequireAuth';

function renderGate() {
  return render(<MemoryRouter><RequireAuth /></MemoryRouter>);
}

describe('RequireAuth temporary-password gate', () => {
  beforeEach(() => {
    authState = { user: { membership_status: 'approved' }, session: { user: { app_metadata: {} } }, loading: false };
  });

  it('asks for a new password while must_change_password is set', () => {
    authState.session.user.app_metadata = { must_change_password: true };
    renderGate();
    expect(screen.getByText('Set my password')).toBeTruthy();
  });

  it('does not show the password screen once the flag is gone', () => {
    renderGate();
    expect(screen.queryByText('Set my password')).toBeNull();
  });

  it('ignores a flag in user_metadata, which the user can edit', () => {
    authState.session.user.user_metadata = { must_change_password: true };
    renderGate();
    expect(screen.queryByText('Set my password')).toBeNull();
  });
});
