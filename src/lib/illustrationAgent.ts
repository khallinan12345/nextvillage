// src/lib/illustrationAgent.ts
//
// Decides, via a small dedicated Claude Haiku call, whether an AI coaching/
// advisor response would benefit from an inline illustration — and if so,
// composes it. Runs AFTER the main coaching reply is already generated, so
// a failure or "no" here never affects the visible response. Appends the
// same <illustration>{...}</illustration> block format the existing
// parser/renderer already understand (illustrationParser.ts,
// SceneIllustration.tsx, MarkdownText.tsx) — zero changes needed downstream.
//
// Replaces the earlier approach of asking the SAME coaching call to also
// emit this block inline. Confirmed via production data that the coaching
// models — especially Groq's Llama 3.3 70B, used on the English Skills and
// AI-Ready Skills pages — essentially never complied (0 of 21+ sessions),
// and in one case the coaching reply itself came back completely empty
// right after a student explicitly asked for a picture. A separate,
// single-purpose, JSON-only call is far more reliable, and Haiku is cheap
// enough that running it after every turn is fine even though most turns
// will (correctly) come back "no".

import { chatJSON } from './chatClient';
import { validateScene } from '../components/community-impact/illustrationParser';

const DECISION_SYSTEM_PROMPT = `
You decide whether a tutor's response to a young learner would benefit from a simple illustration, and if so, compose it.

Add one ONLY if a simple picture would genuinely help picture something spatial or sequential — where something is happening, how two things relate, a before/after. Do NOT illustrate purely verbal, emotional, or procedural content — most exchanges do NOT need a picture, and a stick-figure scene next to plain reassurance looks careless. When in doubt, say no.

WORKED EXAMPLE — a student discussing "an apple fell from a tree and hit Newton on the head while he sat beneath it" should get:
{"shouldIllustrate": true, "caption": "The apple fell from the tree and struck Newton on the head", "scene": [{"sym": "tree", "x": 120, "y": 110, "w": 130}, {"sym": "apple", "x": 190, "y": 70, "w": 22}, {"sym": "person-sit", "x": 230, "y": 150, "w": 55, "face": "worried"}]}

A student asking an abstract or purely emotional question ("why do I feel nervous about this?") should get:
{"shouldIllustrate": false}

Respond with ONLY one JSON object, nothing else:
{"shouldIllustrate": boolean, "caption": "under 15 words, only if shouldIllustrate is true", "scene": [{"sym": "SYMBOL_ID", "x": 0-400, "y": 0-240, "w": 10-200, "face": "happy|worried|neutral"}]}

Rules:
- "sym" MUST be exactly one of: person-stand, person-sit, person-point, person-carry, fish, pond, plant, tree, apple, goat, chicken, phone, house, market-stall, coin, medical-cross, speech-bubble, sun, drum, boat, book. Anything else is dropped.
- "scene" is 2-6 items. "x"/"y" is the CENTER of that symbol on a 400 (wide) by 240 (tall) canvas — position items sensibly relative to each other.
- "w" and "face" are optional per item; "face" only applies to person-* items.
- Only include "caption"/"scene" when shouldIllustrate is true. When false, just return {"shouldIllustrate": false}.
`.trim();

/**
 * Decides whether to illustrate this exchange and, if so, appends the
 * <illustration> block to aiResponse. Always resolves — never throws — and
 * returns aiResponse unchanged on any failure or "no" decision.
 */
export async function withIllustration(userMessage: string, aiResponse: string): Promise<string> {
  if (!aiResponse.trim()) return aiResponse;

  try {
    const result = await chatJSON({
      page: 'IllustrationAgent',
      messages: [{
        role: 'user',
        content: `STUDENT SAID: ${userMessage.trim() || '(none — this is an opening message)'}\n\nTUTOR RESPONDED: ${aiResponse}\n\nDecide whether to illustrate this moment.`,
      }],
      system: DECISION_SYSTEM_PROMPT,
      max_tokens: 300,
      temperature: 0.2,
    });

    if (!result?.shouldIllustrate) return aiResponse;

    const scene = validateScene(result);
    if (!scene) return aiResponse;

    return `${aiResponse}\n\n<illustration>${JSON.stringify(scene)}</illustration>`;
  } catch (err) {
    console.warn('[IllustrationAgent] decision call failed, skipping illustration:', err);
    return aiResponse;
  }
}
