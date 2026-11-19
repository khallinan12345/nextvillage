import { describe, it, expect } from 'vitest';
import { buildIntakePrompt, buildReminder } from './donationPrompt.js';

const d = { id: 'abc-123', amount_usd: 250, received_on: '2026-10-21', amount_received: 336654, received_currency: 'NGN' };

describe('buildIntakePrompt', () => {
  const m = buildIntakePrompt({ donation: d });
  it('asks who gave it and links straight to the entry', () => {
    expect(m.subject).toBe('Who gave this? $250.00 Sendwave transfer to vAI');
    expect(m.text).toContain('/admin/donations?complete=abc-123');
    expect(m.html).toContain('/admin/donations?complete=abc-123');
    expect(m.text).toContain('336,654 NGN reached Nigeria');
  });
});

describe('buildReminder', () => {
  it('is null when nothing is waiting', () => {
    expect(buildReminder({ pending: [] })).toBeNull();
  });
  it('lists what is waiting with a total', () => {
    const m = buildReminder({ pending: [d, { ...d, amount_usd: 483, received_on: '2026-10-22' }] });
    expect(m.subject).toBe('Reminder: 2 donations are missing a donor name');
    expect(m.text).toContain('$733.00 in all');
    expect(m.text).toContain('Oct 22, 2026: $483.00');
  });
  it('uses the singular for one', () => {
    expect(buildReminder({ pending: [d] }).subject).toBe('Reminder: 1 donation is missing a donor name');
  });
});
