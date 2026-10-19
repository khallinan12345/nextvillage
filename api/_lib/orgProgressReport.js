// api/_lib/orgProgressReport.js
//
// The monthly progress report a partner organization's leaders receive about their own learners.
// Pure functions only; the route (api/org-monthly-report.ts) does the I/O.
//
// What it shows, per learner: the four rubric scores for the month (0-100) and whether each moved
// since last month, and sessions. What it deliberately leaves out: certification counts (the stored
// count has not been checked against real passes),  anything
// the learner wrote, the AI's narrative comments about them, quotes ("evidence"), effort ratings,
// safety information, birth year or age, and any other organization's learners. Leaders already see
// their own learners on the dashboard; this report adds nothing they could not see, and nothing that
// would label a child.

export const DIMENSIONS = [
  ['cognitive', 'Understanding'],
  ['critical_thinking', 'Critical thinking'],
  ['problem_solving', 'Problem solving'],
  ['creativity', 'Creativity'],
];

// A change smaller than this is "steady": scores are AI estimates and wobble from month to month.
export const STEADY_BAND = 5;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Reduces a database row to just the fields the report may use. Anything else is dropped here. */
export function pickScores(row) {
  if (!row) return null;
  const out = {
    cognitive: num(row.cognitive_score),
    critical_thinking: num(row.critical_thinking_score),
    problem_solving: num(row.problem_solving_score),
    creativity: num(row.creativity_score),
    sessions: num(row.session_count) ?? 0,
  };
  const any = DIMENSIONS.some(([k]) => out[k] !== null);
  return any ? out : null;
}

/** 'up' | 'down' | 'steady' | null (no previous month to compare). */
export function trend(now, before) {
  if (now === null || before === null || now === undefined || before === undefined) return null;
  const d = now - before;
  if (d >= STEADY_BAND) return 'up';
  if (d <= -STEADY_BAND) return 'down';
  return 'steady';
}

const ARROW = { up: '↑', down: '↓', steady: '→' };
const WORD = { up: 'up', down: 'down', steady: 'steady' };

// Below 10 the scale cannot tell "a little" from "nothing", so it is shown as "<10" rather than a
// bare 0 that would read as a verdict on a child.
const show = (v) => (v < 10 ? '<10' : String(Math.round(v)));

function cell(now, before) {
  if (now === null) return { text: '–', html: '–' };
  const t = trend(now, before);
  const n = show(now);
  return { text: t ? `${n} ${ARROW[t]}` : `${n}`, html: t ? `${n} <span title="${WORD[t]}">${ARROW[t]}</span>` : `${n}` };
}

/**
 * rows: [{ name, current: pickScores(...)|null, previous: pickScores(...)|null }]
 * Returns { subject, html, text, counts }.
 */
export function buildOrgReport({ orgName, monthLabel, rows }) {
  const sorted = [...rows].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const scored = sorted.filter((r) => r.current);
  const quiet = sorted.filter((r) => !r.current);

  const average = (key) => {
    const vals = scored.map((r) => r.current[key]).filter((v) => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const movers = (key, dir) => scored.filter((r) => r.previous && trend(r.current[key], r.previous[key]) === dir).length;

  const counts = { enrolled: sorted.length, scored: scored.length, noAssessment: quiet.length };
  const subject = `${orgName} learner progress, ${monthLabel}`;

  const intro =
    `This is the monthly progress report for ${orgName}, covering ${monthLabel}. It lists only your own learners. ` +
    `The scores are AI estimates of how a learner thought and worked in their sessions, from 0 to 100. They are not school grades. ` +
    `Spelling, grammar and English level are not scored, and a low number does not mean a child is failing: ` +
    `shared devices, power cuts, a new topic or a hard month all show up. Use the report to decide who to talk to and who to encourage, ` +
    `and look at the direction over several months rather than any single number.`;

  const summary = `${counts.scored} of ${counts.enrolled} enrolled learners have a score for ${monthLabel}. ` +
    `${counts.noAssessment} had too little activity to score.`;

  const avgLine = DIMENSIONS.map(([k, label]) => `${label} ${average(k) === null ? '–' : show(average(k))}`).join(' · ');
  const changeLine = DIMENSIONS.map(([k, label]) => `${label}: ${movers(k, 'up')} up, ${movers(k, 'down')} down`).join('; ');

  const omitted =
    `This report shows scores only. It does not include what children wrote, the AI's comments about them, ` +
    `any safety information, or any other organization's learners.`;

  // ── plain text ──
  const textRows = scored.map((r) => {
    const parts = DIMENSIONS.map(([k, label]) => `${label} ${cell(r.current[k], r.previous?.[k] ?? null).text}`);
    return `- ${r.name ?? 'Unnamed learner'}: ${parts.join(', ')}; ${r.current.sessions} sessions`;
  });
  const text =
    `${intro}\n\n${summary}\n\nGroup average (learners with a score): ${avgLine}\nMovement since last month: ${changeLine}\n\n` +
    `SCORES (arrow = change since last month; steady means within ${STEADY_BAND} points)\n${textRows.join('\n') || '(none)'}\n\n` +
    (quiet.length ? `TOO LITTLE ACTIVITY TO SCORE\n- ${quiet.map((r) => r.name ?? 'Unnamed learner').join(', ')}\n\n` : '') +
    `${omitted}\nPlease do not forward this report.\n`;

  // ── html ──
  const th = 'text-align:left;padding:6px 8px;border-bottom:2px solid #d5dcd8;font-size:13px';
  const td = 'padding:6px 8px;border-bottom:1px solid #e7ece9;font-size:14px';
  const tr = scored
    .map((r) => {
      const cells = DIMENSIONS.map(([k]) => `<td style="${td};text-align:center">${cell(r.current[k], r.previous?.[k] ?? null).html}</td>`).join('');
      return `<tr><td style="${td}"><strong>${esc(r.name ?? 'Unnamed learner')}</strong></td>${cells}` +
        `<td style="${td};text-align:center">${r.current.sessions}</td></tr>`;
    })
    .join('');
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:720px;margin:0 auto;padding:16px;color:#1d2420;line-height:1.5">` +
    `<h1 style="font-size:20px;margin:0 0 8px">${esc(orgName)}: learner progress, ${esc(monthLabel)}</h1>` +
    `<p style="margin:0 0 12px">${esc(intro)}</p>` +
    `<p style="margin:0 0 4px"><strong>${esc(summary)}</strong></p>` +
    `<p style="margin:0 0 2px;font-size:14px"><strong>Group average:</strong> ${esc(avgLine)}</p>` +
    `<p style="margin:0 0 14px;font-size:14px"><strong>Movement since last month:</strong> ${esc(changeLine)}</p>` +
    (scored.length
      ? `<table style="border-collapse:collapse;width:100%;margin:8px 0"><thead><tr><th style="${th}">Learner</th>` +
        DIMENSIONS.map(([, label]) => `<th style="${th};text-align:center">${esc(label)}</th>`).join('') +
        `<th style="${th};text-align:center">Sessions</th></tr></thead><tbody>${tr}</tbody></table>` +
        `<p style="margin:0 0 12px;font-size:12px;color:#5d6a63">↑ up, ↓ down, → steady (within ${STEADY_BAND} points) compared with last month. A dash means no score.</p>`
      : `<p>No learner had enough activity to score this month.</p>`) +
    (quiet.length
      ? `<h2 style="font-size:16px;margin:20px 0 6px;color:#4b5563">Too little activity to score (${quiet.length})</h2>` +
        `<p style="margin:0;font-size:14px">${quiet.map((r) => esc(r.name ?? 'Unnamed learner')).join(', ')}</p>`
      : '') +
    `<p style="margin:24px 0 0;font-size:12px;color:#5d6a63">${esc(omitted)} Generated automatically by nextVillage after the monthly assessment. Please do not forward this report.</p>` +
    `</div>`;

  return { subject, html, text, counts };
}
