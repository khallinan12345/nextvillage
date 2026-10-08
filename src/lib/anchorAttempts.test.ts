import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchCheckpointStatus,
  finishAnchorAttempt,
  nextPrompt,
  startAnchorAttempt,
  type CheckpointStatus,
} from './anchorAttempts';

const area = { learning: 1, foundational: 0, tech_skills: 0, community_impact: 0, ai_playground: 0 };

function status(over: Partial<CheckpointStatus> = {}): CheckpointStatus {
  return {
    total_sessions: 10,
    by_area: area,
    eligible_learner: true,
    due_checkpoint: null,
    anchor_module_id: 'm1',
    open_attempt: null,
    revisit: { eligible: false, source_dashboard_id: null, source_title: null, learning_module_id: null },
    ...over,
  };
}

function rpcClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('nextPrompt', () => {
  it('offers nothing to staff or when nothing is due', () => {
    expect(nextPrompt(null)).toBeNull();
    expect(nextPrompt(status({ eligible_learner: false, due_checkpoint: 25 }))).toBeNull();
    expect(nextPrompt(status())).toBeNull();
  });

  it('resumes an unfinished attempt before anything else', () => {
    const s = status({
      open_attempt: { id: 'a1', kind: 'checkpoint', checkpoint: 25 },
      due_checkpoint: 50,
      revisit: { eligible: true, source_dashboard_id: 'd1', source_title: 'Light and Shadow Play', learning_module_id: 'x' },
    });
    expect(nextPrompt(s)).toEqual({ type: 'resume', attemptId: 'a1', kind: 'checkpoint' });
  });

  it('offers the one-time revisit before a due checkpoint', () => {
    const s = status({
      due_checkpoint: 100,
      revisit: { eligible: true, source_dashboard_id: 'd1', source_title: 'AI Melody Remix', learning_module_id: 'x' },
    });
    expect(nextPrompt(s)).toEqual({ type: 'revisit', sourceTitle: 'AI Melody Remix' });
  });

  it('offers a due checkpoint only when an anchor activity exists', () => {
    expect(nextPrompt(status({ due_checkpoint: 25 }))).toEqual({ type: 'checkpoint', checkpoint: 25 });
    expect(nextPrompt(status({ due_checkpoint: 25, anchor_module_id: null }))).toBeNull();
  });
});

describe('rpc wrappers', () => {
  it('fetches the status from my_checkpoint_status', async () => {
    const s = status({ total_sessions: 42 });
    const { client, rpc } = rpcClient({ data: s });
    expect(await fetchCheckpointStatus(client)).toEqual(s);
    expect(rpc).toHaveBeenCalledWith('my_checkpoint_status');
  });

  it('starts an attempt with the requested kind and surfaces refusals', async () => {
    const attempt = { id: 'a1', kind: 'revisit' };
    const ok = rpcClient({ data: attempt });
    expect(await startAnchorAttempt(ok.client, 'revisit')).toEqual(attempt);
    expect(ok.rpc).toHaveBeenCalledWith('start_anchor_attempt', { p_kind: 'revisit' });

    const refused = rpcClient({ error: { message: 'no checkpoint is due' } });
    await expect(startAnchorAttempt(refused.client, 'checkpoint')).rejects.toMatchObject({ message: 'no checkpoint is due' });
  });

  it('finishes an attempt with the dashboard row and transcript', async () => {
    const { client, rpc } = rpcClient({});
    await finishAnchorAttempt(client, 'a1', 'd1', [{ role: 'user', content: 'hi' }]);
    expect(rpc).toHaveBeenCalledWith('finish_anchor_attempt', {
      p_attempt: 'a1',
      p_dashboard: 'd1',
      p_transcript: [{ role: 'user', content: 'hi' }],
    });
  });
});
