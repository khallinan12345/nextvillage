// src/data/community-impact/illustrationPrompt.ts
//
// Shared instruction fragment, appended to prompt builders whose output is
// prose/narrative advice (not structured intake questions, not dense
// triage output). Tells the model it MAY compose a small illustration from
// a fixed symbol library — it decides per-response whether one would help,
// the same way it decides how long to make its answer.
//
// The symbol list here must stay in sync with SYMBOL_IDS in
// src/components/community-impact/illustrationSymbols.tsx — anything the
// model names outside this list is simply dropped by the parser, never
// rendered, so drift here only loses illustrations, it can't break safety.

export const ILLUSTRATION_INSTRUCTIONS = `
You may optionally add one small illustration if — and only if — a simple picture would genuinely help a young person picture something spatial or sequential (e.g. where something is happening, how two things relate, a before/after). Do NOT add one to most responses — purely verbal, emotional, or procedural advice doesn't need a picture, and a stick-figure scene next to plain reassurance looks careless.

If you decide one would help, end your entire response with this exact block (valid JSON inside, nothing else in the block):

<illustration>
{"caption": "short caption, under 15 words", "scene": [{"sym": "SYMBOL_ID", "x": 200, "y": 120, "face": "worried"}]}
</illustration>

Rules:
- "scene" is 2-6 items. Each item needs "sym" and a position.
- "x" and "y" are the CENTER of that symbol on a fixed 400 (wide) by 240 (tall) canvas — position items sensibly relative to each other and the canvas, e.g. a pond in the lower-middle, a person standing beside it.
- "w" is optional (item's on-canvas width in pixels, ~30-160) — omit it to use a sensible default.
- "face" is optional and only meaningful on person-* items: "happy" | "worried" | "neutral".
- "sym" MUST be exactly one of this list — anything else is silently ignored, so only ever use these: person-stand, person-sit, person-point, person-carry, fish, pond, plant, goat, chicken, phone, house, market-stall, coin, medical-cross, speech-bubble, sun, drum, boat, book.
- If no illustration would help, simply don't include the block at all.
`.trim();
