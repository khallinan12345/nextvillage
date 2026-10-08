import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { LearnerGrowth } from '../../lib/learnerGrowth';

const fetchGrowth = vi.fn();
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../lib/learnerGrowth', async () => {
  const actual = await vi.importActual<typeof import('../../lib/learnerGrowth')>('../../lib/learnerGrowth');
  return { ...actual, fetchLearnerGrowth: (...a: unknown[]) => fetchGrowth(...a) };
});

import LearnerGrowthPage from './LearnerGrowthPage';

const learner = (over: Partial<LearnerGrowth>): LearnerGrowth => ({
  learner_id: 'l1',
  name: 'Ada Learner',
  organization: 'Davidson AI Futures Lab',
  first_session_at: '2026-03-10T00:00:00Z',
  total_sessions: 80,
  by_area: { learning: 40, tech_skills: 30, community_impact: 10 },
  early_mix: { learning: 20, tech_skills: 5 },
  recent_mix: { learning: 5, tech_skills: 15, community_impact: 5 },
  assessed_months: 3,
  first_assessment: { month: '2026-03-01', cognitive: 40, critical_thinking: 35, problem_solving: 30, creativity: 50, clarifications: 7 },
  latest_assessment: { month: '2026-08-01', cognitive: 55, critical_thinking: 30, problem_solving: 45, creativity: 50, clarifications: 2 },
  certifications: 2,
  revisit: null,
  checkpoints: null,
  ...over,
});

beforeEach(() => {
  fetchGrowth.mockReset();
});

describe('LearnerGrowthPage', () => {
  it('explains that the page is for staff when the database refuses', async () => {
    fetchGrowth.mockRejectedValue({ message: 'not authorized' });
    render(<LearnerGrowthPage />);
    expect(await screen.findByText('This page is for facilitators and researchers')).toBeInTheDocument();
  });

  it('says plainly when it cannot load', async () => {
    fetchGrowth.mockRejectedValue({ message: 'network down' });
    render(<LearnerGrowthPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load');
  });

  it('shows each learner with change in words and arrows', async () => {
    fetchGrowth.mockResolvedValue([learner({})]);
    render(<LearnerGrowthPage />);
    const row = (await screen.findByText('Ada Learner')).closest('tr') as HTMLElement;
    expect(within(row).getByText(/Cognitive: 40 → 55/)).toBeInTheDocument();
    expect(within(row).getAllByText(/▲ \+15/)).toHaveLength(2); // cognitive and problem solving both rose by 15
    expect(within(row).getByText(/Critical thinking: 35 → 30/)).toBeInTheDocument();
    expect(within(row).getAllByText(/▼ −5/)).toHaveLength(2); // critical thinking and clarifications both fell by 5
    expect(within(row).getByText(/Learning 80% → 20%/)).toBeInTheDocument();
    expect(within(row).getByText(/7 → 2/)).toBeInTheDocument();
  });

  it('does not invent change for learners with one assessed month or too few sessions', async () => {
    fetchGrowth.mockResolvedValue([
      learner({ learner_id: 'l2', name: 'New Learner', total_sessions: 12, assessed_months: 1, recent_mix: null }),
    ]);
    render(<LearnerGrowthPage />);
    const row = (await screen.findByText('New Learner')).closest('tr') as HTMLElement;
    expect(within(row).getByText('One assessed month so far')).toBeInTheDocument();
    expect(within(row).getByText('Needs 50 sessions')).toBeInTheDocument();
    expect(within(row).queryByText(/▲|▼/)).not.toBeInTheDocument();
    expect(within(row).getByText('None yet')).toBeInTheDocument();
  });

  it('shows Prompt Challenge results when they exist', async () => {
    fetchGrowth.mockResolvedValue([
      learner({
        revisit: {
          original: { cognitive: 30, critical_thinking: 30, problem_solving: 30, creativity: 30 },
          new: { cognitive: 60, critical_thinking: 60, problem_solving: 60, creativity: 60 },
        },
        checkpoints: { '25': 48.5, '0': 35 },
      }),
    ]);
    render(<LearnerGrowthPage />);
    const row = (await screen.findByText('Ada Learner')).closest('tr') as HTMLElement;
    expect(within(row).getByText(/First session → redo: 30 → 60/)).toBeInTheDocument();
    expect(within(row).getByText('0 sessions: 35 · 25 sessions: 48.5')).toBeInTheDocument();
  });

  it('filters by name and by minimum sessions', async () => {
    fetchGrowth.mockResolvedValue([
      learner({ learner_id: 'a', name: 'Ada Learner', total_sessions: 80 }),
      learner({ learner_id: 'b', name: 'Bola Learner', total_sessions: 10 }),
    ]);
    render(<LearnerGrowthPage />);
    await screen.findByText('Ada Learner');
    expect(screen.getByText('2 learners')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sessions'), { target: { value: '25' } });
    expect(screen.queryByText('Bola Learner')).not.toBeInTheDocument();
    expect(screen.getByText('1 learners')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sessions'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Find a learner'), { target: { value: 'bola' } });
    expect(screen.queryByText('Ada Learner')).not.toBeInTheDocument();
    expect(screen.getByText('Bola Learner')).toBeInTheDocument();
  });
});
