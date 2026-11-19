// src/components/viz/vizPrompt.ts
//
// What the AI coach is told about pictures. Replaces the old "a picture in EVERY response"
// rule, which forced decorative or wrong pictures on questions that did not need one.
// Now: draw when it makes the idea clearer, skip when it would not, and pick the right kind.

export type VizSubject = 'math' | 'science' | 'finance' | 'energy' | 'business' | 'english' | 'general';

const EX_COUNTERS = '```viz\n{"type":"counters","alt":"7 mangoes and 3 mangoes","groups":[{"count":7,"emoji":"🥭","label":"mangoes"},{"count":3,"emoji":"🥭","label":"mangoes"}]}\n```';
const EX_NUMBERLINE = '```viz\n{"type":"number-line","alt":"jump of 19 from 23 to 42","min":0,"max":50,"points":[23,42],"jump":{"from":23,"to":42,"label":"+19"}}\n```';
const EX_TAPE = '```viz\n{"type":"tape","alt":"23 plus 19 makes 42","label":"23 + 19 = ?","parts":[{"value":23,"label":"23"},{"value":19,"label":"19"}],"total":42}\n```';
const EX_ARRAY = '```viz\n{"type":"array","alt":"4 rows of 6 dots","rows":4,"cols":6,"label":"4 × 6 = 24"}\n```';
const EX_FRACTION = '```viz\n{"type":"fraction-bar","alt":"2 of 5 parts shaded","parts":5,"shaded":2,"label":"2/5 of the farm"}\n```\n(also "fraction-circle" with the same fields, for round things)';
const EX_BARS = '```viz\n{"type":"bar-chart","alt":"fish caught Monday to Wednesday","label":"Fish caught per day","bars":[{"label":"Mon","value":12},{"label":"Tue","value":18},{"label":"Wed","value":9}]}\n```';
const EX_LINE = '```viz\n{"type":"line-chart","alt":"plant height rising over four weeks","label":"Plant height","xLabel":"Week","yLabel":"cm","series":[{"name":"Sun","points":[[1,2],[2,5],[3,9],[4,14]]},{"name":"Shade","points":[[1,1],[2,2],[3,3],[4,4]]}]}\n```\n(x can be words, e.g. [["Jan",40],["Feb",55]]; add "style":"scatter" for dots only)';
const EX_GRAPH = '```viz\n{"type":"graph","alt":"parabola whose steepness the learner can change","label":"y = a·x²","expr":"a*x^2 + b","params":[{"name":"a","min":-3,"max":3,"value":1,"step":0.1},{"name":"b","min":-5,"max":5,"value":0,"step":0.5}],"xmin":-5,"xmax":5,"ymin":-10,"ymax":10,"xLabel":"x","yLabel":"y"}\n```\n(x is always the horizontal axis; params are sliders the learner can drag; use + - * / ^ ( ) and sin cos tan sqrt abs ln exp pi)';
const EX_TABLE = '```viz\n{"type":"table","alt":"comparison of two loans","label":"Two loans","columns":["","Loan A","Loan B"],"rows":[["Interest","5%","8%"],["Monthly payment","$120","$140"]]}\n```';
const EX_CYCLE = '```viz\n{"type":"cycle","alt":"the water cycle","label":"Water cycle","center":"Water","steps":["Evaporation","Condensation","Rain","Runoff"]}\n```';
const EX_MERMAID = '```mermaid\nflowchart TD\n  A[Sunlight hits panel] --> B[Panel makes DC power]\n  B --> C[Inverter makes AC power]\n  C --> D[Home uses power]\n```\n(also: timeline, mindmap, sequenceDiagram, pie. Plain Mermaid code only. Short labels, no HTML, no links. Use ONLY words and letters in node labels, no parentheses inside [ ].)';

const KINDS: Record<string, string> = {
  counters: '• Small counts + story objects        → counters',
  numberline: '• Adding, subtracting, skip-counting      → number-line with jump',
  tape: '• Part-whole, comparing two amounts         → tape',
  array: '• Equal groups, times tables                  → array',
  fraction: '• Fraction of something                       → fraction-bar or fraction-circle',
  bars: '• Comparing quantities, categories            → bar-chart',
  line: '• Change over time, data, results, trends     → line-chart (or scatter)',
  graph: '• How an equation or formula behaves (let the learner drag a slider) → graph',
  table: '• Side-by-side comparison, a data table       → table',
  cycle: '• A repeating loop (water, carbon, seasons, cash flow) → cycle',
  mermaid: '• Process, steps, cause and effect, timeline, how parts connect, concept map → ```mermaid block',
};

const EXAMPLES: Record<string, string> = {
  counters: EX_COUNTERS, numberline: EX_NUMBERLINE, tape: EX_TAPE, array: EX_ARRAY, fraction: EX_FRACTION,
  bars: EX_BARS, line: EX_LINE, graph: EX_GRAPH, table: EX_TABLE, cycle: EX_CYCLE, mermaid: EX_MERMAID,
};

const MENUS: Record<VizSubject, string[]> = {
  math: ['counters', 'numberline', 'tape', 'array', 'fraction', 'bars', 'line', 'graph', 'table', 'mermaid'],
  science: ['line', 'graph', 'cycle', 'mermaid', 'table', 'bars', 'counters', 'fraction'],
  finance: ['line', 'graph', 'bars', 'table', 'tape', 'mermaid', 'cycle'],
  energy: ['line', 'graph', 'bars', 'table', 'mermaid', 'cycle'],
  business: ['bars', 'line', 'table', 'mermaid', 'cycle', 'tape'],
  english: ['mermaid', 'table', 'cycle'],
  general: ['mermaid', 'table', 'line', 'bars', 'cycle'],
};

const WHEN: Record<VizSubject, string> = {
  math: `For young learners and any question about a quantity, a picture almost always helps — include one whenever a number, a group, a fraction, a pattern or a graph is involved.`,
  science: `Use a picture whenever it shows something words alone make hard: how something changes, a loop or process, a comparison, how a formula behaves, or results from an experiment.`,
  finance: `Use a picture when money changes over time, when two options are compared, or when a formula (interest, savings, break-even) is easier to see than to read.`,
  energy: `Use a picture when a quantity changes over time or with another quantity (sun hours, load, battery charge, cost), when a formula behaves differently as inputs change, or when showing how the parts of a system connect.`,
  business: `Use a picture to compare options or numbers, show a process or customer journey, or show how money flows.`,
  english: `Use a picture only for structure: a story's order of events, how ideas connect, a comparison, or steps in writing. Do NOT add pictures to vocabulary, grammar corrections, or conversation.`,
  general: `Use a picture when it makes a process, a comparison, or a change over time clearer.`,
};

export function buildVizInstructions(subject: VizSubject = 'general'): string {
  const keys = MENUS[subject];
  return `
═══════════════════════════════════════════════
PICTURES — USE WHEN THEY HELP
═══════════════════════════════════════════════
${WHEN[subject]}

Skip the picture when it would not add anything: greetings, encouragement, a simple yes/no,
a question that is only about wording, or when you already drew a picture for the same idea.
One good picture beats two. Maximum 2 per response. Never make a picture just to decorate.

Put the picture on its own lines right after the sentence it illustrates. Never describe the
code in your words, and never mention "viz" or "JSON" to the learner. Every picture needs an
"alt" field: one plain sentence describing what it shows, for learners who cannot see it.

Choose the right kind:
${keys.map(k => KINDS[k]).join('\n')}

Examples — copy these shapes exactly:

${keys.map(k => EXAMPLES[k]).join('\n\n')}

Hard rules:
- Every number in a picture must match the numbers in your words exactly. Do the arithmetic before you draw.
- Pick emoji from the learner's chosen topic (market → 🧺, fishing → 🐟, animals → 🐄).
- viz blocks hold valid JSON only: double quotes, no trailing commas, no comments.
- Write formulas as plain text (for example A = P × (1 + r)^t), never with dollar-sign LaTeX.
- If you are not sure a picture is correct, leave it out and explain in words.`;
}

/** Math coach default (kept for older imports). */
export const VIZ_INSTRUCTIONS = buildVizInstructions('math');
