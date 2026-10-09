// api/_lib/promptBudget.js
//
// Claude Haiku 5.5 is priced per prompt size: prompts over 100k tokens cost 5x
// more per token. This keeps every Haiku 5.5 request under that line by
// dropping the oldest turns (never the latest one) when a prompt gets large.
// Token counts are estimated at 3 characters per token, which over-counts
// ordinary English slightly, so the real prompt stays safely under the cap.

export const HAIKU_PROMPT_TOKEN_CAP = 100_000;
const TARGET = 85_000; // trim down to this, leaving headroom for the estimate being off

export const usesHaiku55 = (model) => /^claude-haiku-5-5/.test(model || '');

export function estimateTokens(value) {
  if (value == null) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(text.length / 3);
}

const messageTokens = (m) => estimateTokens(m?.content) + 4;

// system: string or array of blocks. Returns { messages, trimmed, estimatedTokens }.
export function fitToBudget(messages, system, target = TARGET) {
  const fixed = estimateTokens(system);
  let kept = Array.isArray(messages) ? [...messages] : [];
  let total = fixed + kept.reduce((n, m) => n + messageTokens(m), 0);
  if (total <= target) return { messages: kept, trimmed: false, estimatedTokens: total };

  while (kept.length > 1 && total > target) {
    total -= messageTokens(kept[0]);
    kept.shift();
  }
  // The conversation has to open with a user turn.
  while (kept.length > 1 && kept[0].role !== 'user') {
    total -= messageTokens(kept[0]);
    kept.shift();
  }
  // One enormous latest message: keep its tail (the end is usually the question).
  if (total > target && kept.length === 1 && typeof kept[0].content === 'string') {
    const room = Math.max(1000, (target - fixed - 4) * 3);
    kept = [{ ...kept[0], content: kept[0].content.slice(-room) }];
    total = fixed + messageTokens(kept[0]);
  }
  return { messages: kept, trimmed: true, estimatedTokens: total };
}

// Plain text (for single big prompts such as a monthly assessment): keep the
// most recent text that fits.
export function fitTextToBudget(text, otherTokens = 0, target = TARGET) {
  const room = Math.max(1000, (target - otherTokens) * 3);
  return text.length <= room ? text : text.slice(-room);
}
