// api/_lib/teamReminder.js
//
// Monthly "what needs attention" email for the Team workspace (/team): reviews that are due or
// overdue, open tasks, and (platform team only) proposals waiting for triage. Pure functions; the
// route (api/team-review-reminder.ts) does the database and email I/O. Never contains learner data.
//
// Keep dueInfo in step with src/lib/teamReviews.ts.

const DAY = 86_400_000;
const SOON_DAYS = 14;
const TASK_HORIZON_DAYS = 30;

export function dueInfo(item, now = new Date()) {
  if (!item.last_reviewed_at) return { state: 'never', days: null };
  const dueAt = new Date(item.last_reviewed_at).getTime() + item.cadence_days * DAY;
  const days = Math.ceil((dueAt - now.getTime()) / DAY);
  return { state: days < 0 ? 'overdue' : days <= SOON_DAYS ? 'soon' : 'ok', days };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function dueText(info) {
  if (info.state === 'never') return 'needs its first review';
  if (info.days < 0) return `overdue by ${-info.days} day${-info.days === 1 ? '' : 's'}`;
  if (info.days === 0) return 'due today';
  return `due in ${info.days} day${info.days === 1 ? '' : 's'}`;
}

/**
 * audience: 'platform_team' sees everything; 'all_leaders' sees only items shared with all leaders.
 * Returns null when there is nothing to report.
 */
export function buildReminder({ audience, reviews, tasks, proposals, now = new Date(), baseUrl = 'https://www.nextvillage.community' }) {
  const visible = (x) => audience === 'platform_team' || x.audience === 'all_leaders';

  const rank = { never: 0, overdue: 1, soon: 2 };
  const dueReviews = reviews
    .filter(visible)
    .map((r) => ({ r, info: dueInfo(r, now) }))
    .filter((x) => x.info.state in rank)
    .sort((a, b) => rank[a.info.state] - rank[b.info.state] || (a.info.days ?? 0) - (b.info.days ?? 0));

  const today = new Date(now.toDateString()).getTime();
  const openTasks = tasks
    .filter(visible)
    .filter((t) => t.status !== 'done')
    .map((t) => {
      const due = t.due_date ? new Date(t.due_date).getTime() : null;
      const overdue = due !== null && due < today;
      const soon = due !== null && !overdue && due <= today + TASK_HORIZON_DAYS * DAY;
      return { t, overdue, soon };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.soon) - Number(a.soon));

  const triage = audience === 'platform_team' ? proposals.filter((p) => p.status === 'proposed') : [];

  const counts = { reviews: dueReviews.length, tasks: openTasks.length, proposals: triage.length };
  if (counts.reviews + counts.tasks + counts.proposals === 0) return null;

  const month = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const url = `${baseUrl}/team`;
  const subject = `Team workspace: ${counts.reviews} review${counts.reviews === 1 ? '' : 's'} due, ${counts.tasks} open task${counts.tasks === 1 ? '' : 's'} (${month})`;

  const lines = [];
  const html = [`<h2 style="margin:0 0 8px">Team workspace: ${esc(month)}</h2>`,
    `<p>This is your monthly reminder of what needs attention. Open the workspace to act on any of it: <a href="${esc(url)}">${esc(url)}</a></p>`];

  if (dueReviews.length) {
    html.push('<h3>Reviews due</h3><ul>');
    lines.push('REVIEWS DUE');
    for (const { r, info } of dueReviews) {
      html.push(`<li><strong>${esc(r.title)}</strong>: ${esc(dueText(info))}</li>`);
      lines.push(`- ${r.title}: ${dueText(info)}`);
    }
    html.push('</ul>'); lines.push('');
  }
  if (openTasks.length) {
    html.push('<h3>Open tasks</h3><ul>');
    lines.push('OPEN TASKS');
    for (const { t, overdue, soon } of openTasks) {
      const tag = t.due_date ? ` (${overdue ? 'overdue, ' : soon ? 'due soon, ' : ''}due ${esc(t.due_date)})` : '';
      html.push(`<li>${esc(t.title)}${tag}</li>`);
      lines.push(`- ${t.title}${t.due_date ? ` (${overdue ? 'overdue, ' : soon ? 'due soon, ' : ''}due ${t.due_date})` : ''}`);
    }
    html.push('</ul>'); lines.push('');
  }
  if (triage.length) {
    html.push('<h3>Change proposals waiting for triage</h3><ul>');
    lines.push('CHANGE PROPOSALS WAITING FOR TRIAGE');
    for (const p of triage) { html.push(`<li>${esc(p.title)}</li>`); lines.push(`- ${p.title}`); }
    html.push('</ul>'); lines.push('');
  }
  html.push('<p style="color:#666;font-size:12px">Sent automatically on the first of each month. No learner information is included.</p>');

  const text = [`Team workspace: ${month}`, '', `Open the workspace: ${url}`, '', ...lines, 'Sent automatically on the first of each month. No learner information is included.'].join('\n');
  return { subject, html: html.join('\n'), text, counts };
}
