import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const updateUser = vi.fn();
const signOut = vi.fn();

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { auth: { updateUser: (...a: unknown[]) => updateUser(...a), signOut: (...a: unknown[]) => signOut(...a) } },
}));

import ResetPasswordPage from './ResetPasswordPage';

function fill(password: string, confirm = password) {
  const inputs = document.querySelectorAll('input');
  fireEvent.change(inputs[0], { target: { value: password } });
  fireEvent.change(inputs[1], { target: { value: confirm } });
  fireEvent.submit(document.querySelector('form')!);
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    updateUser.mockReset();
    signOut.mockReset();
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
  });

  it('signs out every other session after the password changes', async () => {
    render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
    fill('goodpass123');
    await waitFor(() => expect(screen.getByText('Password updated!')).toBeTruthy());
    expect(updateUser).toHaveBeenCalledWith({ password: 'goodpass123' });
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('still succeeds if signing out the other sessions fails', async () => {
    signOut.mockRejectedValue(new Error('network'));
    render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
    fill('goodpass123');
    await waitFor(() => expect(screen.getByText('Password updated!')).toBeTruthy());
  });

  it('does not touch sessions when the password is rejected', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Password is known to be weak' } });
    render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
    fill('goodpass123');
    await waitFor(() => expect(screen.getByText(/data leak/i)).toBeTruthy());
    expect(signOut).not.toHaveBeenCalled();
  });
});
