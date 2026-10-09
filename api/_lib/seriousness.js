// api/_lib/seriousness.js
//
// Monthly "how seriously are learners taking their sessions" review.
//
// "Seriousness" here means effort and relevance: is the learner making a
// genuine attempt at the activity, or are they joking, typing nothing in
// particular, repeating themselves, or answering with single words? It is never
// about spelling, grammar, English level or Pidgin, and it is meant to show
// facilitators who may need a check-in, not to rank or punish anyone.
//
// Pure functions only: signal calculation, the judging prompt, and the email.
// The route (api/seriousness-report.ts) does the database, model and email I/O.

export const RATINGS = ['serious', 'mixed', 'not_serious', 'insufficient'];

export const RATING_LABELS = {
  serious: 'Serious effort',
  mixed: 'Mixed effort',
  not_serious: 'Low effort',
  insufficient: 'Too little activity to judge',
};

/** Learner messages needed in the month before a judgement is attempted. */
export const MIN_MESSAGES = 8;

const MAX_GAP_MS = 10 * 60 * 1000; // a longer pause counts as a break, not time on task
const MAX_SAMPLE = 14;

export function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

/** Keyboard mash, repeated characters, or text that is mostly not letters. */
export function isGibberish(text) {
  const t = String(text ?? '').trim();
  if (t.length < 6) return false;
  if (/(.)\1{4,}/.test(t)) return true;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (letters / t.length < 0.5) return true;
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  const mashed = words.filter(
    (w) => w.length >= 5 && (!/[aeiouy]/.test(w) || /asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|zxcv|xcvb|cvbn|vbnm|uiop|tyui/.test(w)),
  ).length;
  return words.length > 0 && mashed / words.length >= 0.5;
}

/** Accept an array or a JSON string; return [{role, content, ts}] with ts in ms (or null). */
export function parseMessages(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v
    .filter((m) => m && typeof m === 'object' && typeof m.content === 'string' && m.content.trim() !== '')
    .map((m) => {
      const ms = typeof m.timestamp === 'string' ? Date.parse(m.timestamp) : NaN;
      return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content.trim(), ts: Number.isFinite(ms) ? ms : null };
    });
}

/** Keep only messages stamped inside [startMs, endMs). Unstamped messages are dropped. */
export function inWindow(messages, startMs, endMs) {
  return messages.filter((m) => m.ts !== null && m.ts >= startMs && m.ts < endMs);
}

function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * conversations: array of message lists (already limited to the month).
 * Returns plain numbers describing how the learner used their sessions.
 */
export function computeSignals(conversations) {
  const learner = [];
  let minutes = 0;
  const days = new Set();
  let sessions = 0;
  for (const convo of conversations) {
    const learnerMsgs = convo.filter((m) => m.role === 'user');
    if (learnerMsgs.length === 0) continue;
    sessions++;
    learner.push(...learnerMsgs);
    const stamped = convo.filter((m) => m.ts !== null).sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < stamped.length; i++) {
      const gap = stamped[i].ts - stamped[i - 1].ts;
      if (gap > 0) minutes += Math.min(gap, MAX_GAP_MS) / 60000;
    }
    for (const m of learnerMsgs) if (m.ts !== null) days.add(new Date(m.ts).toISOString().slice(0, 10));
  }

  const words = learner.map((m) => wordCount(m.content));
  const seen = new Set();
  let dupes = 0;
  for (const m of learner) {
    const key = m.content.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) dupes++;
    seen.add(key);
  }
  const n = learner.length;
  return {
    sessions,
    learnerMessages: n,
    medianWords: round(median(words), 1),
    shortShare: n ? round(words.filter((w) => w <= 2).length / n) : 0,
    duplicateShare: n ? round(dupes / n) : 0,
    gibberishShare: n ? round(learner.filter((m) => isGibberish(m.content)).length / n) : 0,
    activeDays: days.size,
    minutesActive: Math.round(minutes),
  };
}

/** Evenly spaced learner messages across the month, each with the question it answered. */
export function sampleMessages(conversations, max = MAX_SAMPLE) {
  const all = [];
  for (const convo of conversations) {
    convo.forEach((m, i) => {
      if (m.role !== 'user') return;
      const prev = convo[i - 1];
      all.push({
        ts: m.ts ?? 0,
        question: prev && prev.role === 'assistant' ? prev.content.slice(0, 220) : '',
        answer: m.content.slice(0, 400),
      });
    });
  }
  all.sort((a, b) => a.ts - b.ts);
  if (all.length <= max) return all;
  const out = [];
  for (let i = 0; i < max; i++) out.push(all[Math.floor((i * (all.length - 1)) / (max - 1))]);
  return out;
}

export const SYSTEM_PROMPT = `You are helping facilitators at an AI learning lab in Oloibiri, Nigeria, where learners aged 12 to 24 are using AI for the first time. Each month you are shown a sample of one learner's replies, each with the question it answered, plus a few counts about how they used their sessions.

Decide how seriously the learner took their sessions this month. Judge effort and relevance only:
- serious: replies are mostly relevant and show real effort to engage with the task, even when short or imperfect.
- mixed: some real effort, but a good share of replies are off-task, copied, repeated, or minimal.
- not_serious: most replies are off-task, joking, typed at random, repeated, or single words with no attempt to engage.

Do not penalize spelling, grammar, limited English, Nigerian English or Pidgin, or short answers to simple questions. Do not guess at reasons beyond what you can see. Poor effort can have kind explanations (shared devices, power cuts, tiredness), so write the reason neutrally.

Reply with one JSON object and nothing else:
{"rating": "serious" | "mixed" | "not_serious", "reason": "<at most 25 words, no names, no direct quotes>"}`;

export function buildJudgePrompt(signals, sample) {
  const facts = [
    `Sessions with replies: ${signals.sessions}`,
    `Replies: ${signals.learnerMessages}`,
    `Median words per reply: ${signals.medianWords}`,
    `Share of replies of two words or fewer: ${Math.round(signals.shortShare * 100)}%`,
    `Share of repeated replies: ${Math.round(signals.duplicateShare * 100)}%`,
    `Share that look like random typing: ${Math.round(signals.gibberishShare * 100)}%`,
    `Days active: ${signals.activeDays}`,
  ].join('\n');
  const replies = sample
    .map((s, i) => `Reply ${i + 1}${s.question ? ` (to: "${s.question}")` : ''}:\n${s.answer}`)
    .join('\n\n');
  return `Counts for the month:\n${facts}\n\nSample of replies:\n\n${replies}\n\nReturn the JSON object now.`;
}

export function parseJudgement(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model reply');
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!['serious', 'mixed', 'not_serious'].includes(obj.rating)) throw new Error(`unexpected rating: ${obj.rating}`);
  const reason = typeof obj.reason === 'string' ? obj.reason.trim().slice(0, 240) : '';
  return { rating: obj.rating, reason };
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * rows: [{ name, rating, reason, signals, previous }]  previous = last month's rating or null
 * Returns { subject, html, text }.
 */
export function buildReport({ monthLabel, rows, noActivityCount }) {
  const by = (r) => rows.filter((x) => x.rating === r).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const groups = {
    not_serious: by('not_serious'),
    mixed: by('mixed'),
    serious: by('serious'),
    insufficient: by('insufficient'),
  };
  const counts = Object.fromEntries(RATINGS.map((r) => [r, groups[r].length]));
  const judged = counts.serious + counts.mixed + counts.not_serious;

  const prev = (x) => (x.previous && x.previous !== x.rating ? ` (last month: ${RATING_LABELS[x.previous].toLowerCase()})` : '');
  const line = (x) =>
    `${x.name ?? 'Unnamed learner'}${prev(x)}${x.reason ? `: ${x.reason}` : ''}`;

  const subject = `Learner effort report, ${monthLabel}: ${counts.not_serious + counts.mixed} to check in with, ${counts.serious} serious`;

  const intro =
    `This is a monthly look at how seriously learners at the lab took their sessions in ${monthLabel}. ` +
    `It looks at effort and relevance in their replies, never at spelling or English level. ` +
    `Use it to decide who to check in with, not as a verdict on anyone: shared devices, power cuts and tiredness all show up as low effort.`;

  const summary = `${judged} learners were reviewed: ${counts.serious} serious effort, ${counts.mixed} mixed, ${counts.not_serious} low effort. ` +
    `${counts.insufficient} had too little activity to judge, and ${noActivityCount} enrolled learners had no sessions.`;

  const textSection = (title, list) =>
    list.length ? `${title}\n${list.map((x) => `- ${line(x)}`).join('\n')}\n\n` : '';
  const text =
    `${intro}\n\n${summary}\n\n` +
    textSection('WORTH A CHECK-IN: low effort', groups.not_serious) +
    textSection('WORTH A CHECK-IN: mixed effort', groups.mixed) +
    textSection('SERIOUS EFFORT', groups.serious) +
    (groups.insufficient.length
      ? `TOO LITTLE ACTIVITY TO JUDGE\n${groups.insufficient.map((x) => `- ${x.name ?? 'Unnamed learner'}`).join('\n')}\n`
      : '');

  const htmlSection = (title, list, color, showReason = true) =>
    list.length
      ? `<h2 style="font-size:16px;margin:22px 0 6px;color:${color}">${esc(title)} (${list.length})</h2>` +
        `<ul style="margin:0;padding-left:20px">${list
          .map(
            (x) =>
              `<li style="margin:4px 0"><strong>${esc(x.name ?? 'Unnamed learner')}</strong>${esc(prev(x))}` +
              `${showReason && x.reason ? `: ${esc(x.reason)}` : ''}</li>`,
          )
          .join('')}</ul>`
      : '';

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;padding:16px;color:#1d2420;line-height:1.5">` +
    `<h1 style="font-size:20px;margin:0 0 8px">Learner effort report, ${esc(monthLabel)}</h1>` +
    `<p style="margin:0 0 12px">${esc(intro)}</p>` +
    `<p style="margin:0 0 4px"><strong>${esc(summary)}</strong></p>` +
    htmlSection('Worth a check-in: low effort', groups.not_serious, '#9b1c1c') +
    htmlSection('Worth a check-in: mixed effort', groups.mixed, '#92400e') +
    htmlSection('Serious effort', groups.serious, '#166534', false) +
    htmlSection('Too little activity to judge', groups.insufficient, '#4b5563', false) +
    `<p style="margin:24px 0 0;font-size:12px;color:#5d6a63">Generated automatically on the 3rd of each month by nextVillage. ` +
    `Each learner's replies were read by an AI model without their name, and the sample is a small part of their month, so treat each line as a prompt for a conversation.</p>` +
    `</div>`;

  return { subject, html, text, counts };
}
