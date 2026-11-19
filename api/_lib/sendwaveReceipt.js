// api/_lib/sendwaveReceipt.js
//
// Reads a Sendwave "You sent $X to NAME" receipt email (plain-text body) into the few fields the donations
// ledger needs. Pure function, no I/O. Deliberately does NOT keep the recipient's account number, bank
// details or sender address: only the amount, dates, the confirmation code and the recipient's name.

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

// Text after a label such as "Transfer Amount", on the same line or the next, with markdown bold removed.
function after(text, label) {
  const m = text.match(new RegExp(`${label}[ \\t]*\\n*[ \\t]*([^\\n]+)`, 'i'));
  return m ? m[1].trim() : null;
}
const num = (s) => Number(String(s).replace(/,/g, ''));

/**
 * @param {{subject?: string, body?: string}} mail
 * @returns {{ok: true, reference: string, amountUsd: number, receivedOn: string, amountReceived: number|null,
 *            receivedCurrency: string|null, recipientName: string|null, exchangeRate: string|null}
 *          | {ok: false, reason: string, code: 'not_receipt'|'not_usd'|'unreadable'}}
 */
export function parseSendwaveReceipt({ subject = '', body = '', html = '' }) {
  const first = parseOne({ subject, body });
  if (first.ok || first.code !== 'unreadable' || !html) return first;
  // Gmail's plain-text version of the receipt table can come out in a different order. The HTML
  // keeps every label and value together, so fall back to that.
  return parseOne({ subject, body: htmlToText(html) });
}

/** Turn the receipt's HTML into plain lines: each table cell / paragraph / <br> becomes a line. */
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*br\s*\/?>|<\/(td|th|tr|p|div|li|h\d|b|strong)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n');
}

function parseOne({ subject = '', body = '' }) {
  if (!/^\s*You sent\b/i.test(subject)) return { ok: false, reason: 'not a Sendwave "You sent" receipt', code: 'not_receipt' };
  const text = String(body).replace(/[*_]/g, '');

  const amount = (after(text, 'Transfer Amount') || '').match(/^([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/);
  if (!amount) return { ok: false, reason: 'no transfer amount found', code: 'unreadable' };
  if (amount[1] !== 'USD') return { ok: false, reason: `transfer was in ${amount[1]}, not USD`, code: 'not_usd' };
  const amountUsd = num(amount[2]);
  if (!(amountUsd > 0)) return { ok: false, reason: 'transfer amount is not positive', code: 'unreadable' };

  const reference = (after(text, 'Confirmation Code') || '').match(/^[A-Z0-9][A-Z0-9-]{5,}$/i)?.[0];
  if (!reference) return { ok: false, reason: 'no confirmation code found', code: 'unreadable' };

  const d = (after(text, 'Transfer Date') || '').match(/^([A-Z][a-z]{2})[a-z]*\s+(\d{1,2}),\s*(\d{4})/);
  if (!d || !MONTHS[d[1]]) return { ok: false, reason: 'no transfer date found', code: 'unreadable' };
  const receivedOn = `${d[3]}-${MONTHS[d[1]]}-${d[2].padStart(2, '0')}`;

  const total = (after(text, 'Total to Recipient') || '').match(/^([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/);
  return {
    ok: true,
    reference,
    amountUsd,
    receivedOn,
    amountReceived: total ? num(total[2]) : null,
    receivedCurrency: total ? total[1] : null,
    recipientName: (after(text, 'Recipient Name') || '').slice(0, 120) || null,
    exchangeRate: (after(text, 'Exchange Rate') || '').match(/^[\d,.]+/)?.[0] ?? null,
  };
}
