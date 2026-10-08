import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const attemptRow: { value: Record<string, unknown> | null } = { value: null };
const moduleRow = {
  title: 'Prompt Improvement Challenge',
  description: 'Refine a basic prompt.',
  ai_facilitator_instructions: 'Guide students to refine prompts.',
};
const chatText = vi.fn();
const saveTranscript = vi.fn();
const finishAttempt = vi.fn();

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: table === 'anchor_attempts' ? attemptRow.value : moduleRow, error: null }),
        }),
      }),
    }),
  },
}));
vi.mock('../../lib/chatClient', () => ({ chatText: (...a: unknown[]) => chatText(...a) }));
vi.mock('../../lib/anchorAttempts', () => ({
  saveAnchorTranscript: (...a: unknown[]) => saveTranscript(...a),
  finishAnchorAttempt: (...a: unknown[]) => finishAttempt(...a),
}));

import PromptChallengePage from './PromptChallengePage';

const open = () =>
  render(
    <MemoryRouter initialEntries={['/prompt-challenge/att-1']}>
      <Routes>
        <Route path="/prompt-challenge/:attemptId" element={<PromptChallengePage />} />
        <Route path="/dashboard" element={<div>dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  );

async function say(text: string) {
  fireEvent.change(screen.getByLabelText('Your message'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText(text);
}

beforeEach(() => {
  attemptRow.value = { id: 'att-1', learning_module_id: 'mod-1', transcript: null, completed_at: null };
  chatText.mockReset().mockResolvedValue('What could make your question clearer?');
  saveTranscript.mockReset().mockResolvedValue(undefined);
  finishAttempt.mockReset().mockResolvedValue(undefined);
});

describe('PromptChallengePage', () => {
  it('opens with the fixed greeting and the activity title', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Prompt Improvement Challenge' })).toBeInTheDocument();
    expect(screen.getByText(/There are no wrong answers/)).toBeInTheDocument();
  });

  it('sends only the learner conversation to the pinned page, and saves after each reply', async () => {
    open();
    await screen.findByLabelText('Your message');
    await say('how do I keep fish fresh');
    await screen.findByText('What could make your question clearer?');
    const call = chatText.mock.calls[0][0];
    expect(call.page).toBe('PromptChallengePage');
    expect(call.messages).toEqual([{ role: 'user', content: 'how do I keep fish fresh' }]);
    expect(call.system).toContain('Guide students to refine prompts.');
    await waitFor(() => expect(saveTranscript).toHaveBeenCalledWith(expect.anything(), 'att-1', expect.any(Array)));
    const saved = saveTranscript.mock.calls[0][2] as { role: string }[];
    expect(saved.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant']);
  });

  it('cleans markdown out of the assistant reply and offers a way back to the dashboard', async () => {
    chatText.mockResolvedValue('Now think. **What could make your question clearer?**');
    open();
    await screen.findByLabelText('Your message');
    expect(screen.getByRole('link', { name: 'Back to your dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByText(/Your conversation is saved/)).toBeInTheDocument();
    await say('my first prompt');
    expect(await screen.findByText('Now think. What could make your question clearer?')).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('lets the learner finish only after enough messages, then saves with no dashboard row', async () => {
    open();
    await screen.findByLabelText('Your message');
    const finish = screen.getByRole('button', { name: 'I am finished' });
    expect(finish).toBeDisabled();
    await say('first try');
    await say('second try');
    expect(finish).toBeDisabled();
    await say('third try');
    await waitFor(() => expect(finish).toBeEnabled());
    fireEvent.click(finish);
    expect(await screen.findByText('Thank you, you are finished')).toBeInTheDocument();
    expect(finishAttempt).toHaveBeenCalledWith(expect.anything(), 'att-1', null, expect.any(Array));
  });

  it('keeps the learner message and says so if the assistant cannot answer', async () => {
    chatText.mockRejectedValue(new Error('down'));
    open();
    await screen.findByLabelText('Your message');
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'my prompt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not answer');
    expect(screen.getByLabelText('Your message')).toHaveValue('my prompt');
  });

  it('resumes a saved conversation instead of starting over', async () => {
    attemptRow.value = {
      id: 'att-1', learning_module_id: 'mod-1', completed_at: null,
      transcript: [
        { role: 'assistant', content: 'Hello again', timestamp: '2026-10-08T10:00:00Z' },
        { role: 'user', content: 'my earlier prompt', timestamp: '2026-10-08T10:01:00Z' },
      ],
    };
    open();
    expect(await screen.findByText('my earlier prompt')).toBeInTheDocument();
    expect(screen.queryByText(/There are no wrong answers/)).not.toBeInTheDocument();
  });

  it('shows the finished screen for an attempt that is already complete', async () => {
    attemptRow.value = { id: 'att-1', learning_module_id: 'mod-1', transcript: [], completed_at: '2026-10-08T11:00:00Z' };
    open();
    expect(await screen.findByText('Thank you, you are finished')).toBeInTheDocument();
  });

  it('shows a plain message when the attempt cannot be found', async () => {
    attemptRow.value = null;
    open();
    expect(await screen.findByText('We could not open this challenge')).toBeInTheDocument();
  });
});
