import { describe, it, expect } from 'vitest';
import { parseSendwaveReceipt } from './sendwaveReceipt.js';

// Shape copied from a real Sendwave receipt (account numbers and names replaced).
const body = `You sent $250.00 to Jane Roe

**Sender Name**
Sam Sender

|

**Transfer Amount**
USD 250.00

|

**Recipient Name**
Jane Roe

**Account Number**
0000000000

**Confirmation Code**
BAN-261021-RW7J42

**Transfer Date**
Oct 21, 2026, 5:37:28 PM

**Exchange Rate**
1346.61

**Total to Recipient**
NGN 336654
_Your recipient may receive less due to fees._`;

describe('parseSendwaveReceipt', () => {
  const r = parseSendwaveReceipt({ subject: 'You sent $250.00 to Jane Roe', body });
  it('reads amount, reference, date, what arrived and the recipient', () => {
    expect(r).toEqual({
      ok: true, reference: 'BAN-261021-RW7J42', amountUsd: 250, receivedOn: '2026-10-21',
      amountReceived: 336654, receivedCurrency: 'NGN', recipientName: 'Jane Roe', exchangeRate: '1346.61',
    });
  });
  it('never carries the account number', () => {
    expect(JSON.stringify(r)).not.toContain('0000000000');
  });
  it('handles thousands separators and single-digit days', () => {
    const x = parseSendwaveReceipt({ subject: 'You sent $1,250.50 to A', body: body.replace('USD 250.00', 'USD 1,250.50').replace('Oct 21,', 'Nov 3,').replace('NGN 336654', 'NGN 1,683,000.25') });
    expect(x).toMatchObject({ ok: true, amountUsd: 1250.5, receivedOn: '2026-11-03', amountReceived: 1683000.25 });
  });
  it('ignores other Sendwave emails', () => {
    expect(parseSendwaveReceipt({ subject: 'We’re updating some of our fees', body }).ok).toBe(false);
  });
  it('rejects non-USD transfers, and receipts missing the amount or the code', () => {
    expect(parseSendwaveReceipt({ subject: 'You sent', body: body.replace('USD 250.00', 'EUR 250.00') })).toMatchObject({ ok: false });
    expect(parseSendwaveReceipt({ subject: 'You sent', body: body.replace('Transfer Amount', 'Something') }).ok).toBe(false);
    expect(parseSendwaveReceipt({ subject: 'You sent', body: body.replace('Confirmation Code', 'Nothing') }).ok).toBe(false);
  });
  it('still works if the amount received is missing', () => {
    const x = parseSendwaveReceipt({ subject: 'You sent', body: body.replace('Total to Recipient', 'Other') });
    expect(x).toMatchObject({ ok: true, amountReceived: null, receivedCurrency: null });
  });
});
