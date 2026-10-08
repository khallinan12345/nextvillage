import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CheckpointStatus } from '../../lib/anchorAttempts';

const fetchStatus = vi.fn();
const startAttempt = vi.fn();
const navigate = vi.fn();

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../lib/anchorAttempts', async () => {
  const actual = await vi.importActual<typeof import('../../lib/anchorAttempts')>('../../lib/anchorAttempts');
  return {
    ...actual,
    fetchCheckpointStatus: (...a: unknown[]) => fetchStatus(...a),
    startAnchorAttempt: (...a: unknown[]) => startAttempt(...a),
  };
});
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import AnchorPromptCard from './AnchorPromptCard';

const base: CheckpointStatus = {
  total_sessions: 10,
  by_area: { learning: 10, foundational: 0, tech_skills: 0, community_impact: 0, ai_playground: 0 },
  eligible_learner: true,
  due_checkpoint: null,
  anchor_module_id: 'm1',
  open_attempt: null,
  revisit: { eligible: false, source_dashboard_id: null, source_title: null, learning_module_id: null },
};

const renderCard = () => render(<MemoryRouter><AnchorPromptCard /></MemoryRouter>);

beforeEach(() => {
  fetchStatus.mockReset();
  startAttempt.mockReset();
  navigate.mockReset();
});

describe('AnchorPromptCard', () => {
  it('shows nothing when nothing is due', async () => {
    fetchStatus.mockResolvedValue(base);
    const { container } = renderCard();
    await waitFor(() => expect(fetchStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing if the status cannot be loaded', async () => {
    fetchStatus.mockRejectedValue(new Error('offline'));
    const { container } = renderCard();
    await waitFor(() => expect(fetchStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the revisit by name and starts it, then opens the challenge page', async () => {
    fetchStatus.mockResolvedValue({
      ...base,
      total_sessions: 60,
      due_checkpoint: 50,
      revisit: { eligible: true, source_dashboard_id: 'd1', source_title: 'AI Melody Remix', learning_module_id: 'x' },
    });
    startAttempt.mockResolvedValue({ id: 'attempt-1' });
    renderCard();
    expect(await screen.findByText('Revisit your first AI Learning session')).toBeInTheDocument();
    expect(screen.getByText(/AI Melody Remix/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisit it' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/prompt-challenge/attempt-1'));
    expect(startAttempt).toHaveBeenCalledWith(expect.anything(), 'revisit');
  });

  it('offers a due checkpoint and resumes an unfinished attempt with the same kind', async () => {
    fetchStatus.mockResolvedValue({ ...base, due_checkpoint: 25 });
    startAttempt.mockResolvedValue({ id: 'a2' });
    const first = renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Start the challenge' }));
    await waitFor(() => expect(startAttempt).toHaveBeenCalledWith(expect.anything(), 'checkpoint'));
    first.unmount();

    fetchStatus.mockResolvedValue({ ...base, open_attempt: { id: 'a2', kind: 'checkpoint', checkpoint: 25 } });
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(startAttempt).toHaveBeenLastCalledWith(expect.anything(), 'checkpoint'));
  });

  it('tells the learner when it could not start, and lets them try again', async () => {
    fetchStatus.mockResolvedValue({ ...base, due_checkpoint: 25 });
    startAttempt.mockRejectedValue(new Error('no'));
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Start the challenge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not start');
    expect(screen.getByRole('button', { name: 'Start the challenge' })).toBeEnabled();
  });
});
