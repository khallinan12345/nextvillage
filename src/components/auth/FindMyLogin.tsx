// "Not sure which email you used?" Learners with several Gmail accounts type the addresses they might have
// used; each address gets an email saying whether it is their sign-in. The screen never says whether an
// account exists (that would let strangers look people up). See api/find-my-login.ts.

import React, { useState } from 'react';
import Button from '../ui/Button';

const FindMyLogin: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState('');

  const addresses = () =>
    text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 5);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const list = addresses();
    if (list.length === 0) { setError('Please type at least one email address.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/find-my-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: list }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Something went wrong. Please try again.');
      setSent(list.length);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <p className="mt-3 text-center text-sm">
        <button type="button" onClick={() => setOpen(true)} className="text-blue-700 underline hover:text-blue-900">
          Not sure which email you used?
        </button>
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3" aria-live="polite">
      {sent === null ? (
        <form onSubmit={submit} className="stack-y-2">
          <p className="text-sm font-semibold text-gray-900">Which email did you use?</p>
          <p className="text-xs text-gray-600">
            Type every email address you might have used (up to 5), one on each line. We will send an email to each one.
            It will say if that address is your sign-in email. Do not make a new account.
          </p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Email addresses you might have used"
            placeholder={'myname@gmail.com\nmyname2010@gmail.com'}
            className="w-full rounded-lg border border-gray-300 p-2 text-sm"
          />
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" isLoading={busy} size="sm">Send me the answer</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </form>
      ) : (
        <div className="stack-y-2">
          <p className="text-sm font-semibold text-gray-900">Check your email</p>
          <p className="text-sm text-gray-700">
            We sent a message to each address you typed. Open each inbox (and the spam folder). The message will say which one is your sign-in email.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => { setSent(null); setText(''); }}>Try other addresses</Button>
        </div>
      )}
    </div>
  );
};

export default FindMyLogin;
