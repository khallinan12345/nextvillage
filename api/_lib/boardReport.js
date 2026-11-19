// api/_lib/boardReport.js
//
// "Impact Mining Program News": the monthly email to the board of directors. Pure functions; the
// route (api/board-monthly-report.ts) fetches the numbers (get_board_monthly_stats) and sends it.
//
// Counts only about learners: no learner names, nothing a learner wrote, no scores. The donations section
// names donors (the board sees who gave and how much; the public wall shows opted-in names only). New students are shown per
// African partner organization (organizations.continent = 'Africa').

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = (v) => Number(v ?? 0).toLocaleString('en-US');
const usd = (v) => '$' + Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The calendar month before `now`, as { start: 'YYYY-MM-01', label: 'October 2026' } (UTC). */
export function previousMonth(now = new Date()) {
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() - 1;
  if (m < 0) { m = 11; y -= 1; }
  return { start: `${y}-${String(m + 1).padStart(2, '0')}-01`, label: `${MONTHS[m]} ${y}` };
}

const CHANNELS = { bank_transfer: 'bank transfer', check: 'check', venmo: 'Venmo', substack: 'Substack', gofundme: 'GoFundMe', other: 'other' };
const shortDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// `donations` is the result of get_board_donations (or null/undefined when it could not be fetched, in which
// case the section is left out rather than shown as zero).
export function buildBoardReport({ stats, donations = null, monthLabel, baseUrl = 'https://www.nextvillage.community' }) {
  const orgs = stats.new_students_by_org ?? [];
  const newStudents = orgs.reduce((a, o) => a + Number(o.new_students || 0), 0);
  const totalStudents = orgs.reduce((a, o) => a + Number(o.total_students || 0), 0);
  const certs = Number(stats.new_certifications || 0);
  const certTitles = stats.certifications_by_title ?? [];
  const newOrgs = stats.new_organizations ?? [];
  const sessions = Number(stats.sessions || 0);
  const active = Number(stats.active_learners || 0);
  const cost = Number(stats.ai_cost_total_usd || 0);
  const requests = Number(stats.ai_requests || 0);
  const providers = (stats.ai_cost_by_provider ?? []).filter((p) => Number(p.usd) > 0);
  const freeRequests = (stats.ai_cost_by_provider ?? []).filter((p) => Number(p.usd) === 0).reduce((a, p) => a + Number(p.requests || 0), 0);
  const perSession = sessions > 0 ? cost / sessions : null;

  const don = donations && typeof donations === 'object' ? donations : null;
  const donItems = don?.items ?? [];
  const donCount = Number(don?.count || 0);
  const donTotal = Number(don?.total_usd || 0);
  const donReceived = (don?.received_by_currency ?? []).map((r) => `${Number(r.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${r.currency}`);
  const donAllTime = don ? `${usd(don.all_time_usd)} from ${n(don.all_time_count)} donation${Number(don.all_time_count) === 1 ? '' : 's'} to date` : '';
  const donLine = (i) => `${shortDate(i.received_on)}: ${i.donor} gave ${usd(i.amount_usd)}${i.channel && CHANNELS[i.channel] ? ` via ${CHANNELS[i.channel]}` : ''}${i.purpose ? ` (${i.purpose})` : ''}`;

  const orgLabel = (o) => (o.country ? `${o.name} (${o.country})` : o.name);
  const subject = `Impact Mining Program News: ${monthLabel}`;

  const lines = [];
  lines.push(`Impact Mining Program News: ${monthLabel}`, '');
  lines.push(`New students (African partner organizations): ${n(newStudents)}  [${n(totalStudents)} in total]`);
  for (const o of orgs.filter((o) => Number(o.new_students) > 0 || Number(o.total_students) > 0)) {
    lines.push(`  - ${orgLabel(o)}: ${n(o.new_students)} new, ${n(o.total_students)} in total`);
  }
  lines.push('', `New certifications granted: ${n(certs)}`);
  for (const t of certTitles) lines.push(`  - ${t.title ?? 'Certification'}: ${n(t.count)}`);
  lines.push('', `New organizations: ${n(newOrgs.length)}`);
  for (const o of newOrgs) lines.push(`  - ${orgLabel(o)}`);
  lines.push('', `Learning sessions: ${n(sessions)} across ${n(active)} active learners`);
  lines.push('', `AI costs: ${usd(cost)} across ${n(requests)} AI requests` + (perSession !== null ? ` (about ${usd(perSession)} per session)` : ''));
  for (const p of providers) lines.push(`  - ${p.provider}: ${usd(p.usd)}`);
  if (freeRequests > 0) lines.push(`  - ${n(freeRequests)} further requests ran on free-tier providers at no cost`);
  if (don) {
    lines.push('', donCount > 0 ? `Donations received: ${usd(donTotal)} from ${n(donCount)} donation${donCount === 1 ? '' : 's'} (via Impact Mining, Inc. and Sendwave)` : 'Donations received: none this month');
    for (const i of donItems) lines.push(`  - ${donLine(i)}`);
    if (donReceived.length > 0) lines.push(`  Received by vAI after fees and conversion: ${donReceived.join(', ')}`);
    lines.push(`  All time: ${donAllTime}`);
  }
  lines.push('', 'Counts only: no learner names or work are included. Sent automatically each month.');
  const text = lines.join('\n');

  const stat = (label, value, sub) =>
    `<td style="padding:12px 14px;background:#f6f3ec;border-radius:8px;text-align:center"><div style="font-size:26px;font-weight:700;color:#1a1208">${esc(value)}</div><div style="font-size:12px;color:#6b5f4a">${esc(label)}</div>${sub ? `<div style="font-size:11px;color:#8a7f6a">${esc(sub)}</div>` : ''}</td>`;
  const h = (t) => `<h3 style="margin:22px 0 6px;font-size:15px;color:#1a1208">${esc(t)}</h3>`;
  const ul = (items) => (items.length ? `<ul style="margin:4px 0 0;padding-left:20px;color:#333;font-size:14px">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1a1208">
<h2 style="margin:0 0 2px;font-size:22px">Impact Mining Program News</h2>
<div style="color:#6b5f4a;font-size:14px;margin-bottom:16px">${esc(monthLabel)}</div>
<table role="presentation" cellspacing="8" style="width:100%;border-collapse:separate"><tr>
${stat('New students', n(newStudents), `${n(totalStudents)} in total`)}${stat('New certifications', n(certs))}${stat('Sessions', n(sessions), `${n(active)} active learners`)}${stat('AI costs', usd(cost))}
</tr></table>
${h('New students by African organization')}
${ul(orgs.filter((o) => Number(o.new_students) > 0 || Number(o.total_students) > 0).map((o) => `${esc(orgLabel(o))}: <b>${n(o.new_students)}</b> new (${n(o.total_students)} in total)`)) || '<p style="color:#666;font-size:14px;margin:4px 0">No students yet.</p>'}
${h('New certifications granted')}
${certs > 0 ? ul(certTitles.map((t) => `${esc(t.title ?? 'Certification')}: <b>${n(t.count)}</b>`)) : '<p style="color:#666;font-size:14px;margin:4px 0">None this month.</p>'}
${h('New organizations')}
${newOrgs.length > 0 ? ul(newOrgs.map((o) => esc(orgLabel(o)))) : '<p style="color:#666;font-size:14px;margin:4px 0">None this month.</p>'}
${h('AI costs')}
<p style="margin:4px 0;font-size:14px;color:#333">${usd(cost)} across ${n(requests)} AI requests${perSession !== null ? ` (about ${usd(perSession)} per session)` : ''}.</p>
${ul([...providers.map((p) => `${esc(p.provider)}: ${usd(p.usd)}`), ...(freeRequests > 0 ? [`${n(freeRequests)} further requests ran on free-tier providers at no cost`] : [])])}
${don ? `${h('Donations')}
${donCount > 0 ? `<p style="margin:4px 0;font-size:14px;color:#333"><b>${usd(donTotal)}</b> from ${n(donCount)} donation${donCount === 1 ? '' : 's'}, sent by Impact Mining, Inc. through Sendwave.</p>${ul([...donItems.map((i) => esc(donLine(i))), ...(donReceived.length > 0 ? [`Received by vAI after fees and conversion: ${esc(donReceived.join(', '))}`] : [])])}` : '<p style="color:#666;font-size:14px;margin:4px 0">None this month.</p>'}
<p style="margin:6px 0 0;font-size:12px;color:#8a7f6a">All time: ${esc(donAllTime)}.</p>` : ''}
<p style="margin-top:26px;font-size:12px;color:#8a7f6a">Counts only; no learner names or work are included. Sent automatically each month. <a href="${esc(baseUrl)}" style="color:#8a7f6a">nextVillage.community</a></p>
</div>`;

  return { subject, html, text, counts: { newStudents, certs, newOrgs: newOrgs.length, sessions, cost, donations: don ? donCount : null } };
}
