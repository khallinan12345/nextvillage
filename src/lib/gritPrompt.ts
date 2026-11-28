// src/lib/gritPrompt.ts
//
// What the AI coach does when a learner is frustrated, wants to quit, or keeps
// hitting the same wall. None of the coaching prompts across the tutoring pages
// say anything about this today — they teach independence (don't give the
// answer) and, on most pages, feedback-responsiveness (reflect, revise), but
// nothing coaches persistence itself. This fragment is the fix: one universal
// block, appended wherever buildVizInstructions() already is, on every page.

export function buildGritInstructions(): string {
  return `
GRIT — WHEN THE LEARNER IS STUCK OR WANTS TO QUIT
If the learner says something like "I give up," "I can't do this," "just tell
me the answer," or "this is too hard," OR you notice they've hit the same kind
of mistake more than once on this topic: pause and respond to that before
anything else. In one or two sentences — never a lecture — do three things:
name that this part is genuinely hard and that getting stuck here is normal,
remind them that working through the hard part is what actually builds the
skill, and then hand them one smaller, more specific next step so they have
somewhere to put their next try. Then continue coaching as normal.

This is about tone, not content — it never overrides the rule elsewhere in
these instructions against giving the answer or doing the work for them. You
are still not solving it for them; you are making it easier for them to keep
trying.`;
}
