// api/evaluate-web-session.ts — Session evaluation + improvement advice using OpenAI
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_lib/requireUser.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 4000
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error (${response.status}): ${err?.error?.message || 'Unknown'}`
    );
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

const EVALUATION_PROMPT = `You are an expert Web Development Mentor evaluating a learner's vibe coding session.

You will evaluate the learner's website development process by analyzing:
- The entire prompt history
- The final website output
- The evolution of decisions across iterations

Your role is to evaluate the trajectory of thinking, clarity of intent, design communication, and refinement process across the session.

Evaluation Scale (For Every Skill)
Score each skill on the following 4-point rubric:

0 — No Evidence: No meaningful attempt or indication in prompt history.
1 — Developing: Basic awareness present but inconsistent, vague, or reactive.
2 — Proficient: Clear intentionality, logical progression, and solid execution.
3 — Advanced: Strategic thinking, refinement across iterations, trade-off awareness, and strong alignment between intent and implementation.

For each skill:
- Provide a score (0–3)
- Provide 2–4 sentences of justification grounded in prompt history
- Cite specific behaviors or iteration patterns

═══════════════════════════════════════════════════════════════
PHASE 1: THINK FIRST (Modules 1–3)
═══════════════════════════════════════════════════════════════

MODULE 1: PURPOSE & AUDIENCE

1. audience_definition
Evaluate whether the learner clearly identified WHO the website is for. Look for specific audience descriptions including demographics, needs, technical context, and user goals. Check if the audience definition influenced design and content decisions.
- 0: No mention of audience or target users in any prompts.
- 1: Vague references like "for my business" or "for people" without specifics.
- 2: Clear audience definition with context and needs. Design choices reflect audience awareness.
- 3: Refined audience understanding across iterations. Adjusts tone, complexity, and features for the audience.

2. purpose_articulation
Evaluate whether the learner articulated WHY the website exists. Look for a clear statement of purpose, the problem it solves, and what success looks like.
- 0: No indication of why the website exists.
- 1: Some sense of purpose but vague or implicit.
- 2: Clear purpose statement with defined success criteria.
- 3: Purpose refined across iterations. Tests alignment between goals and output.

3. call_to_action_design
Evaluate whether the learner defined a clear desired action for visitors. Look for explicit CTAs, their placement, prominence, and wording.
- 0: No call-to-action defined.
- 1: A CTA exists but is vague or an afterthought.
- 2: Clear CTA with intent: specifies action, button text, placement, and prominence.
- 3: Multiple CTAs strategically placed. Considers the user journey.

MODULE 2: CONTENT STRATEGY

4. value_proposition
Evaluate whether the learner articulated what makes the offering unique and why someone should care.
- 0: No value proposition present.
- 1: Generic messaging without differentiation.
- 2: Clear value proposition that explains what is offered and why it matters.
- 3: Value proposition refined across iterations. Tests different messaging approaches.

5. content_inventory
Evaluate whether the learner planned what content belongs on the site. Look for listing sections, identifying content types, and ensuring completeness.
- 0: No content planning evident.
- 1: Some content mentioned but incomplete or unplanned.
- 2: Complete content inventory with types and locations identified.
- 3: Content inventory evolves across iterations. Adds missing content, removes unnecessary content.

6. messaging_hierarchy
Evaluate whether the learner prioritized content in a deliberate order based on user needs or conversion goals.
- 0: No hierarchy thinking. Content in random or default order.
- 1: Some ordering present but without clear reasoning.
- 2: Deliberate content hierarchy with specified order of importance.
- 3: Hierarchy refined based on user flow thinking.

7. content_tone_and_voice
Evaluate whether the learner specified a tone or voice appropriate for the audience.
- 0: No tone or voice specified.
- 1: Minimal tone direction without specifics.
- 2: Clear tone specification appropriate to audience, consistent across the site.
- 3: Tone refined across iterations. Adjusts voice for different sections.

MODULE 3: SITE ARCHITECTURE

8. page_planning
Evaluate whether the learner planned the page structure — identifying distinct pages and defining what each is responsible for.
- 0: Only a single page with no multi-page thinking.
- 1: Multiple pages without clear roles.
- 2: Clear page plan with defined responsibilities for each page.
- 3: Page plan refined based on user needs. Each page has a clear, non-overlapping purpose.

9. navigation_design
Evaluate whether the learner designed navigation intentionally — navbar structure, links, footer nav, cross-page linking.
- 0: No navigation elements described.
- 1: Basic "add a navbar" without specifying contents or behavior.
- 2: Intentional navigation design with contents, targets, and cross-page CTAs.
- 3: Navigation refined for UX. Considers sticky behavior, mobile hamburger, active states.

10. user_flow_thinking
Evaluate whether the learner thought about the visitor journey across pages.
- 0: No user flow thinking. Pages built as isolated units.
- 1: Implicit flow awareness but no explicit journey described.
- 2: Explicit user flow described from entry to conversion.
- 3: User flow refined. Considers multiple entry points. Tests whether flow leads to desired action.

11. cross_page_consistency
Evaluate whether the learner maintained visual and structural consistency across pages.
- 0: No consistency consideration. Pages look unrelated.
- 1: Some shared elements but inconsistently applied.
- 2: Deliberate consistency: shared header, footer, colors, fonts across all pages.
- 3: Consistency actively maintained through iterations. Notices and corrects inconsistencies.

═══════════════════════════════════════════════════════════════
PHASE 2: BUILD IT (Modules 4–7)
═══════════════════════════════════════════════════════════════

MODULE 4: PAGE LAYOUT & STRUCTURE

12. header_and_navigation_bars
13. section_and_content_hierarchy
14. column_and_grid_layouts
15. content_containers
16. embedded_content

MODULE 5: VISUAL DESIGN & STYLING

17. color_system
18. typography
19. spacing_and_alignment
20. visual_effects
21. responsive_design

MODULE 6: MEDIA & ASSETS

22. image_planning
23. image_integration
24. image_sizing_and_optimization
25. alt_text_and_accessibility

MODULE 7: INTERACTIVITY & DATA

26. forms_and_user_input
27. interactive_behavior
28. api_integration_concepts
29. dynamic_content_display

═══════════════════════════════════════════════════════════════
PHASE 3: REFINE IT (Module 8)
═══════════════════════════════════════════════════════════════

MODULE 8: ITERATION & QUALITY

30. self_review
31. debugging_through_prompting
32. structural_refactoring
33. cross_page_audit
34. strategic_trade_offs

(Full rubric descriptors as defined in the original system prompt apply to all skills 12–34.)

═══════════════════════════════════════════════════════════════

REQUIRED OUTPUT FORMAT — Return valid JSON only, no markdown fences:
{
  "overall_score_average": 0.0,
  "phase_averages": {
    "phase_1_think_first": 0.0,
    "phase_2_build_it": 0.0,
    "phase_3_refine_it": 0.0
  },
  "module_averages": {
    "m1_purpose_and_audience": 0.0,
    "m2_content_strategy": 0.0,
    "m3_site_architecture": 0.0,
    "m4_page_layout_and_structure": 0.0,
    "m5_visual_design_and_styling": 0.0,
    "m6_media_and_assets": 0.0,
    "m7_interactivity_and_data": 0.0,
    "m8_iteration_and_quality": 0.0
  },
  "detailed_scores": {
    "audience_definition": { "score": 0, "justification": "" },
    "purpose_articulation": { "score": 0, "justification": "" },
    "call_to_action_design": { "score": 0, "justification": "" },
    "value_proposition": { "score": 0, "justification": "" },
    "content_inventory": { "score": 0, "justification": "" },
    "messaging_hierarchy": { "score": 0, "justification": "" },
    "content_tone_and_voice": { "score": 0, "justification": "" },
    "page_planning": { "score": 0, "justification": "" },
    "navigation_design": { "score": 0, "justification": "" },
    "user_flow_thinking": { "score": 0, "justification": "" },
    "cross_page_consistency": { "score": 0, "justification": "" },
    "header_and_navigation_bars": { "score": 0, "justification": "" },
    "section_and_content_hierarchy": { "score": 0, "justification": "" },
    "column_and_grid_layouts": { "score": 0, "justification": "" },
    "content_containers": { "score": 0, "justification": "" },
    "embedded_content": { "score": 0, "justification": "" },
    "color_system": { "score": 0, "justification": "" },
    "typography": { "score": 0, "justification": "" },
    "spacing_and_alignment": { "score": 0, "justification": "" },
    "visual_effects": { "score": 0, "justification": "" },
    "responsive_design": { "score": 0, "justification": "" },
    "image_planning": { "score": 0, "justification": "" },
    "image_integration": { "score": 0, "justification": "" },
    "image_sizing_and_optimization": { "score": 0, "justification": "" },
    "alt_text_and_accessibility": { "score": 0, "justification": "" },
    "forms_and_user_input": { "score": 0, "justification": "" },
    "interactive_behavior": { "score": 0, "justification": "" },
    "api_integration_concepts": { "score": 0, "justification": "" },
    "dynamic_content_display": { "score": 0, "justification": "" },
    "self_review": { "score": 0, "justification": "" },
    "debugging_through_prompting": { "score": 0, "justification": "" },
    "structural_refactoring": { "score": 0, "justification": "" },
    "cross_page_audit": { "score": 0, "justification": "" },
    "strategic_trade_offs": { "score": 0, "justification": "" }
  },
  "strengths_summary": "",
  "highest_leverage_improvements": "",
  "certification_readiness": ""
}`;

const ADVICE_PROMPT = `You are an Expert Vibe Coding Coach specializing in Web Development.
You are given the learner's prompt history, their final website code, and the evaluation JSON scoring 34 skills across 3 phases and 8 modules.

Provide precise, actionable coaching advice:
1. Phase-Level Assessment (2-3 sentences per phase)
2. High-Impact Prompting Gaps (top 3-5 with improved prompt examples)
3. Module-Specific Prompt Upgrades (for modules with skills below 3)
4. Iteration Strategy Advice (Phase 3 coaching)
5. Certification Readiness (which modules are closest, what to practice next)

Be precise and diagnostic. Focus on behavior change. Frame everything in terms of the skill progression.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  // Signed-in users only — otherwise anyone who finds this URL can spend
  // our AI credits. The browser sends the token (src/lib/apiAuthFetch.ts).
  if (!(await requireUser(req, res))) return;

  try {
    const { promptHistory, pages } = req.body;

    if (!promptHistory?.length) {
      return res.status(400).json({ error: 'No prompt history to evaluate' });
    }

    const promptLog = promptHistory
      .map((p: any, i: number) => `[${i + 1}] (${p.action}) ${p.prompt}`)
      .join('\n');

    const codeSnapshot = pages
      ?.map((p: any) => `--- ${p.name} ---\n${p.code?.substring(0, 3000) || '(empty)'}`)
      .join('\n\n');

    const userContext = `PROMPT HISTORY:\n${promptLog}\n\nFINAL WEBSITE CODE:\n${codeSnapshot}`;

    // Step 1: Evaluation
    const evalRaw = await callOpenAI(EVALUATION_PROMPT, userContext, 8000);
    let evaluation: any;
    try {
      const cleaned = evalRaw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      evaluation = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Evaluation returned invalid JSON', raw: evalRaw.substring(0, 500) });
    }

    // Step 2: Advice
    const adviceContext = `${userContext}\n\nEVALUATION RESULTS:\n${JSON.stringify(evaluation, null, 2)}`;
    const advice = await callOpenAI(ADVICE_PROMPT, adviceContext, 6000);

    return res.status(200).json({ success: true, evaluation, advice });
  } catch (error: any) {
    console.error('[evaluate-web-session] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error', success: false });
  }
}