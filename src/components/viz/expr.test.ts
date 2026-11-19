import { describe, it, expect } from 'vitest';
import { compileExpr } from './expr';

const ev = (src: string, vars: Record<string, number> = {}) => {
  const c = compileExpr(src, ['x', 'a', 'b']);
  return c ? c.fn({ x: 0, a: 0, b: 0, ...vars }) : null;
};

describe('compileExpr', () => {
  it('does arithmetic with the right precedence', () => {
    expect(ev('2 + 3 * 4')).toBe(14);
    expect(ev('(2 + 3) * 4')).toBe(20);
    expect(ev('2^3^2')).toBe(512); // right associative
    expect(ev('-x^2', { x: 3 })).toBe(-9);
  });
  it('reads variables and strips a leading y =', () => {
    expect(ev('y = a*x^2 + b', { a: 2, x: 3, b: 1 })).toBe(19);
  });
  it('supports implicit multiplication and functions', () => {
    expect(ev('2x', { x: 4 })).toBe(8);
    expect(ev('3(x+1)', { x: 1 })).toBe(6);
    expect(ev('sqrt(16) + abs(-2)')).toBe(6);
    expect(ev('sin(pi/2)')).toBeCloseTo(1);
  });
  it('refuses anything that is not plain math', () => {
    expect(ev('alert(1)')).toBeNull();
    expect(ev('x; process.exit()')).toBeNull();
    expect(ev('constructor')).toBeNull();
    expect(ev('x.y')).toBeNull();
    expect(ev('z + 1')).toBeNull(); // unknown variable
    expect(ev('2 +')).toBeNull();
    expect(ev('(2')).toBeNull();
    expect(ev('"a"')).toBeNull();
    expect(ev('x'.repeat(200))).toBeNull();
  });
});
