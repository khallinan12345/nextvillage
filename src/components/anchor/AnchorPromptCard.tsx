import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
  fetchCheckpointStatus,
  nextPrompt,
  startAnchorAttempt,
  type NextPrompt,
} from '../../lib/anchorAttempts';

// Invites the learner to the Prompt Challenge when the database says one is
// due: a checkpoint (0/25/50/100 real sessions), the one-time revisit of their
// first AI Learning session, or an unfinished attempt. Shows nothing when
// nothing is due, for staff, or if the status cannot be loaded.

function copy(prompt: NonNullable<NextPrompt>) {
  if (prompt.type === 'resume') {
    return {
      title: 'Continue your Prompt Challenge',
      body: 'You started a short activity. Pick up where you left off.',
      action: 'Continue',
    };
  }
  if (prompt.type === 'revisit') {
    return {
      title: 'Revisit your first AI Learning session',
      body: prompt.sourceTitle
        ? `Try "${prompt.sourceTitle}" again with what you know now. It takes about 10 minutes.`
        : 'Try your first AI Learning session again with what you know now. It takes about 10 minutes.',
      action: 'Revisit it',
    };
  }
  return {
    title: 'Prompt Challenge',
    body:
      prompt.checkpoint === 0
        ? 'Start with a short prompt-writing activity. You will do it again after more practice, so you can see your own progress.'
        : 'You have reached a new milestone. Take about 10 minutes for a prompt-writing activity and see how you are growing.',
    action: 'Start the challenge',
  };
}

export default function AnchorPromptCard() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<NextPrompt>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCheckpointStatus(supabase)
      .then((status) => { if (!cancelled) setPrompt(nextPrompt(status)); })
      .catch(() => { /* no card if the status cannot be read */ });
    return () => { cancelled = true; };
  }, []);

  if (!prompt) return null;
  const text = copy(prompt);

  async function go() {
    if (!prompt || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const kind = prompt.type === 'resume' ? prompt.kind : prompt.type;
      const attempt = await startAnchorAttempt(supabase, kind);
      navigate(`/prompt-challenge/${attempt.id}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="anchor-card-title" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <h2 id="anchor-card-title" className="text-lg font-semibold text-emerald-900">{text.title}</h2>
      <p className="mt-1 text-sm text-emerald-900/80 max-w-prose">{text.body}</p>
      {failed && <p role="alert" className="mt-2 text-sm text-red-700">We could not start it just now. Please try again.</p>}
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="mt-3 px-4 py-2 rounded-md bg-emerald-700 text-white font-medium hover:bg-emerald-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {busy ? 'Opening…' : text.action}
      </button>
    </section>
  );
}
