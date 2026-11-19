// api/_lib/donationPrompt.js
//
// The two emails that keep Sendwave transfers from going unrecorded:
//   buildIntakePrompt  right after a receipt is picked up: "who gave this?" with a link to finish the entry
//   buildReminder      the daily nudge while entries are still waiting for a donor name
// Pure functions. Amounts and dates only; never account numbers.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = (v) => '$' + Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const wrap = (inner) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1208;font-size:14px;line-height:1.5">${inner}</div>`;
const button = (href, label) => `<p style="margin:18px 0"><a href="${esc(href)}" style="background:#d97706;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">${esc(label)}</a></p>`;

export function buildIntakePrompt({ donation, baseUrl = 'https://www.nextvillage.community' }) {
  const link = `${baseUrl}/admin/donations?complete=${encodeURIComponent(donation.id)}`;
  const where = donation.amount_received && donation.received_currency
    ? ` (${Number(donation.amount_received).toLocaleString('en-US')} ${donation.received_currency} reached Nigeria)` : '';
  const subject = `Who gave this? ${usd(donation.amount_usd)} Sendwave transfer to vAI`;
  const text = [
    `A Sendwave transfer of ${usd(donation.amount_usd)} on ${day(donation.received_on)}${where} has been added to the donations list.`,
    'It is waiting for the donor\'s name. Please add who is being thanked, and whether they agreed to appear on the donor wall:',
    link, '',
    'If this transfer was not a donation to vAI, open it and delete it.',
  ].join('\n');
  const html = wrap(`<h2 style="margin:0 0 8px;font-size:18px">Who gave this?</h2>
<p>A Sendwave transfer of <b>${esc(usd(donation.amount_usd))}</b> on ${esc(day(donation.received_on))}${esc(where)} has been added to the donations list and is waiting for the donor&rsquo;s name.</p>
${button(link, 'Add the donor')}
<p style="color:#6b5f4a;font-size:12px">If this transfer was not a donation to vAI, open it and delete it. You will get a reminder each day until it is filled in.</p>`);
  return { subject, text, html };
}

/** @returns null when nothing is waiting */
export function buildReminder({ pending, baseUrl = 'https://www.nextvillage.community' }) {
  if (!pending || pending.length === 0) return null;
  const link = `${baseUrl}/admin/donations`;
  const total = pending.reduce((a, d) => a + Number(d.amount_usd || 0), 0);
  const noun = pending.length === 1 ? 'donation is' : 'donations are';
  const subject = `Reminder: ${pending.length} ${noun} missing a donor name`;
  const lines = pending.map((d) => `${day(d.received_on)}: ${usd(d.amount_usd)}`);
  const text = [`${pending.length} ${noun} waiting for a donor name (${usd(total)} in all):`, ...lines.map((l) => `  - ${l}`), '', link].join('\n');
  const html = wrap(`<h2 style="margin:0 0 8px;font-size:18px">Donations waiting for a donor name</h2>
<p>${pending.length} ${noun} still missing a name (<b>${esc(usd(total))}</b> in all):</p>
<ul style="padding-left:20px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>${button(link, 'Open the donations list')}`);
  return { subject, text, html };
}
