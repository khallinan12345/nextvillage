import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: {}, rpc: vi.fn() } }));
vi.mock('../../lib/duplicateDetection', () => ({ findSimilarProfile: vi.fn(), sendDuplicateResetLink: vi.fn() }));

import AuthForm from './AuthForm';

describe('AuthForm sign-in options', () => {
  it('offers Google only: GitHub sign-in is switched off in Supabase', () => {
    render(<MemoryRouter><AuthForm mode="login" /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Google' })).toBeTruthy();
    expect(screen.queryByText('GitHub')).toBeNull();
  });
});
