import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContent } from './App';

// Regression test for the specific incident that motivated this test suite:
// the profile-completion popup was accidentally left commented out in
// App.tsx for six weeks, so new signups never got prompted to enter their
// name/org and silently ended up with broken, orphaned profiles. This test
// fails if that JSX block (or the showPopup condition) is ever removed or
// broken again.

const mockUseAuth = vi.fn();
vi.mock('./hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Generic chainable Supabase mock. Whatever page renders under the tested
// route may call any combination of .select/.eq/.order/.maybeSingle/etc. —
// a Proxy makes every property access return a chainable no-op instead of
// having to enumerate each method by hand (and re-break every time a page
// starts using one this test doesn't know about). Any terminal `await` on
// the chain resolves to an empty, error-free result; no real network calls.
vi.mock('./lib/supabaseClient', () => {
  const resolved = Promise.resolve({ data: null, error: null });
  const builder: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return resolved.then.bind(resolved);
        if (prop === 'catch') return resolved.catch.bind(resolved);
        return vi.fn(() => builder);
      },
    }
  );
  return {
    supabase: {
      from: vi.fn(() => builder),
      auth: { signOut: vi.fn() },
      rpc: vi.fn(() => builder),
    },
  };
});

const baseAuthState = {
  user: { id: 'user-1', email: 'test@example.com' },
  session: { user: { id: 'user-1', email: 'test@example.com' } },
  loading: false,
  markProfileCompleted: vi.fn(),
};

beforeEach(() => {
  mockUseAuth.mockReset();
});

describe('profile completion popup', () => {
  it('renders when a logged-in user has not completed their profile', () => {
    mockUseAuth.mockReturnValue({ ...baseAuthState, needsProfileCompletion: true });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppContent />
      </MemoryRouter>
    );

    expect(screen.getByText(/Complete Your Profile/i)).toBeInTheDocument();
  });

  it('does not render once the profile is already complete', () => {
    mockUseAuth.mockReturnValue({ ...baseAuthState, needsProfileCompletion: false });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppContent />
      </MemoryRouter>
    );

    expect(screen.queryByText(/Complete Your Profile/i)).not.toBeInTheDocument();
  });

  it('does not render for a signed-out visitor, even if the flag is stale', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      loading: false,
      needsProfileCompletion: true,
      markProfileCompleted: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppContent />
      </MemoryRouter>
    );

    expect(screen.queryByText(/Complete Your Profile/i)).not.toBeInTheDocument();
  });
});
