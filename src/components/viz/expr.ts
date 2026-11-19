// src/components/viz/expr.ts
//
// A tiny, safe math-expression evaluator for the interactive graph. The AI coach
// writes an expression like "a*x^2 + b" and the page draws it. This is a hand-written
// parser, NOT eval() / new Function(): it can only add, subtract, multiply, divide,
// raise to a power, call a short list of math functions and read the variables it is
// given. Nothing else in the string can run.

const FUNCS: Record<string, (n: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, floor: Math.floor, ceil: Math.ceil,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  const s = src.replace(/×|·/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest);
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^(),'.includes(s[i])) { out.push({ t: 'op', v: s[i] }); i++; continue; }
    return null; // any other character: refuse the whole expression
  }
  return out;
}

export type Compiled = { fn: (vars: Record<string, number>) => number; names: string[] };

/**
 * Compile an expression. `allowed` lists the variable names the caller will supply
 * (for example ['x', 'a', 'b']). Returns null for anything that is not a plain math
 * expression over those names.
 */
export function compileExpr(src: string, allowed: string[]): Compiled | null {
  if (typeof src !== 'string' || src.length === 0 || src.length > 120) return null;
  const toks = tokenize(src.replace(/^\s*y\s*=\s*/i, ''));
  if (!toks || toks.length === 0 || toks.length > 80) return null;
  const names = new Set<string>();
  let pos = 0;
  let bad = false;

  type Node = (v: Record<string, number>) => number;
  const peek = () => toks[pos];
  const isOp = (v: string) => { const k = toks[pos]; return !!k && k.t === 'op' && k.v === v; };

  const parseExpr = (): Node => {
    let left = parseTerm();
    while (isOp('+') || isOp('-')) {
      const op = (toks[pos++] as { v: string }).v;
      const l = left, r = parseTerm();
      left = op === '+' ? v => l(v) + r(v) : v => l(v) - r(v);
    }
    return left;
  };
  const startsFactor = () => {
    const k = peek();
    return !!k && (k.t === 'id' || k.t === 'num' || (k.t === 'op' && k.v === '('));
  };
  const parseTerm = (): Node => {
    let left = parseUnary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = (toks[pos++] as { v: string }).v;
        const l = left, r = parseUnary();
        left = op === '*' ? v => l(v) * r(v) : v => l(v) / r(v);
      } else if (startsFactor()) {
        // implicit multiplication: "2x", "3(x+1)", "x sin(x)"
        const l = left, r = parseUnary();
        left = v => l(v) * r(v);
      } else break;
    }
    return left;
  };
  const parseUnary = (): Node => {
    if (isOp('-')) { pos++; const o = parseUnary(); return v => -o(v); }
    if (isOp('+')) { pos++; return parseUnary(); }
    return parsePower();
  };
  const parsePower = (): Node => {
    const base = parseAtom();
    if (isOp('^')) { pos++; const exp = parseUnary(); return v => Math.pow(base(v), exp(v)); }
    return base;
  };
  const parseAtom = (): Node => {
    const k = toks[pos++];
    if (!k) { bad = true; return () => NaN; }
    if (k.t === 'num') { const n = k.v; return () => n; }
    if (k.t === 'op' && k.v === '(') {
      const inner = parseExpr();
      if (isOp(')')) pos++; else bad = true;
      return inner;
    }
    if (k.t === 'id') {
      const name = k.v.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(FUNCS, name) && isOp('(')) {
        pos++;
        const arg = parseExpr();
        if (isOp(')')) pos++; else bad = true;
        const f = FUNCS[name];
        return v => f(arg(v));
      }
      if (Object.prototype.hasOwnProperty.call(CONSTS, name) && !allowed.includes(k.v)) { const c = CONSTS[name]; return () => c; }
      if (allowed.includes(k.v)) { names.add(k.v); const key = k.v; return v => v[key]; }
      bad = true;
      return () => NaN;
    }
    bad = true;
    return () => NaN;
  };

  const root = parseExpr();
  if (bad || pos !== toks.length) return null;
  return { fn: root, names: [...names] };
}
