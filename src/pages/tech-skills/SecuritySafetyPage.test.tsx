import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// A chainable stand-in for the Supabase query builder: every call returns itself, awaiting it gives `result`.
const chain = (result: unknown) => {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'update', 'insert', 'single']) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
};

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    // Behaves like a database without the sec_* columns yet: reads error, so the page must fall back to this device.
    from: () => chain({ data: null, error: { message: 'column does not exist' } }),
  },
}));
vi.mock('../../components/layout/Navbar', () => ({ default: () => null }));
vi.mock('../../components/VoiceFallback', () => ({ VoiceFallback: () => null }));
vi.mock('../../components/AIPidginCoachWrapper', () => ({ AIPidginCoachWrapper: () => null }));
vi.mock('../../hooks/useVoice', () => ({
  useVoice: () => ({ speak: vi.fn(), cancel: vi.fn(), fallbackText: null, clearFallback: vi.fn() }),
}));
// Monaco cannot run in jsdom; a textarea is enough to edit files.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

import SecuritySafetyPage from './SecuritySafetyPage';

beforeEach(() => {
  localStorage.clear();
  // The AI coach is unreachable, so the page must keep working on its built-in checks.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) })));
});

describe('SecuritySafetyPage', () => {
  it('walks a learner from welcome through a decision and a fix, with hints that escalate and a last-resort reveal', async () => {
    render(<SecuritySafetyPage />);

    fireEvent.click(await screen.findByRole('button', { name: /start the lab/i }));

    // Step 1 (decide): the wrong pick is explained, the right picks pass.
    expect((await screen.findAllByText(/Which TWO lines must never appear/i)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText(/SUPABASE_URL/));
    fireEvent.click(screen.getByLabelText(/PAYMENT_SECRET_KEY/));
    fireEvent.click(screen.getByRole('button', { name: /check my answer/i }));
    expect(await screen.findByText(/only an address/i)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/SUPABASE_URL/)); // untick
    fireEvent.click(screen.getByLabelText(/ADMIN_PASSWORD/));
    fireEvent.click(screen.getByRole('button', { name: /check my answer/i }));
    expect(await screen.findByText(/✅ Correct/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    // Step 2 (fix): nothing is fixed yet, so checking gives a first small hint, then a stronger one.
    expect(await screen.findByText(/Fix src\/config\.js/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /check my fix/i }));
    expect(await screen.findByText(/3 things left/i)).toBeTruthy();
    expect(screen.getByText(/starts with pay_secret_/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /check my fix/i }));
    expect(await screen.findByText(/Delete the whole PAYMENT_SECRET_KEY line/i)).toBeTruthy();

    // "Show me" is held back until the learner has really tried.
    expect(screen.queryByRole('button', { name: /show me the fix/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /check my fix/i }));
    fireEvent.click(await screen.findByRole('button', { name: /show me the fix/i }));
    expect(await screen.findByText(/Reference fix applied/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /next step/i })).toBeTruthy();
  });

  it('lets a learner fix the file themselves and passes every check', async () => {
    render(<SecuritySafetyPage />);
    fireEvent.click(await screen.findByRole('button', { name: /start the lab/i }));
    await screen.findAllByText(/Which TWO lines/i);
    fireEvent.click(screen.getByLabelText(/PAYMENT_SECRET_KEY/));
    fireEvent.click(screen.getByLabelText(/ADMIN_PASSWORD/));
    fireEvent.click(screen.getByRole('button', { name: /check my answer/i }));
    fireEvent.click(await screen.findByRole('button', { name: /next step/i }));

    await screen.findByText(/Fix src\/config\.js/i);
    fireEvent.change(screen.getByLabelText('editor'), {
      target: { value: 'export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL\nexport const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check my fix/i }));
    expect(await screen.findByText(/Every check passes/i)).toBeTruthy();
  });

  it('keeps progress on this device when the database columns are missing, and resumes where the learner left off', async () => {
    const { unmount } = render(<SecuritySafetyPage />);
    fireEvent.click(await screen.findByRole('button', { name: /start the lab/i }));
    await screen.findAllByText(/Which TWO lines/i);
    await waitFor(() => expect(localStorage.getItem('sec_lab_v1_u1')).toBeTruthy(), { timeout: 3000 });
    unmount();

    render(<SecuritySafetyPage />);
    // Welcome is done, so the learner lands straight back on the first real step.
    expect((await screen.findAllByText(/Which TWO lines/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /start the lab/i })).toBeNull();
  });

  it('accepts an own-words answer through the built-in keyword check when the coach is offline', async () => {
    // Pre-finish everything before the first explain step by seeding saved progress.
    const { TASKS, STARTER_FILES } = await import('./securityLab/content');
    const done: Record<string, { misses: number; assisted: boolean }> = { welcome: { misses: 0, assisted: false } };
    for (const s of TASKS[1].steps) if (s.kind !== 'explain') done[s.id] = { misses: 0, assisted: false };
    localStorage.setItem('sec_lab_v1_u1', JSON.stringify({ files: STARTER_FILES, progress: { done } }));

    render(<SecuritySafetyPage />);
    const box = await screen.findByLabelText('Your answer');

    fireEvent.change(box, { target: { value: 'I like turtles and long walks on the beach' } });
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(await screen.findByText(/coach is offline/i)).toBeTruthy();

    fireEvent.change(box, { target: { value: 'Git keeps the history so the key is still there; you must rotate it and get a new key.' } });
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(await screen.findByText(/Step complete/i)).toBeTruthy();
  });
});
