import { describe, it, expect } from 'vitest';
import {
  TASKS, STARTER_FILES, toMap, runChecks, hintFor, sameSet, keywordReview, totalSteps,
  type FileMap, type Step,
} from './content';

const fixSteps = TASKS.flatMap(t => t.steps).filter((s): s is Extract<Step, { kind: 'fix' }> => s.kind === 'fix');

describe('security lab content', () => {
  it('has unique task and step ids', () => {
    const taskIds = TASKS.map(t => t.id);
    expect(new Set(taskIds).size).toBe(taskIds.length);
    const stepIds = TASKS.flatMap(t => t.steps.map(s => s.id));
    expect(new Set(stepIds).size).toBe(stepIds.length);
    expect(totalSteps()).toBe(stepIds.length);
  });

  it('keeps tasks in phase order', () => {
    const phases = TASKS.map(t => t.phase);
    expect([...phases].sort()).toEqual(phases);
  });

  it('only opens files that exist in the starter repo', () => {
    const paths = new Set(STARTER_FILES.map(f => f.path));
    for (const s of fixSteps) {
      expect(paths.has(s.openFile), s.openFile).toBe(true);
      for (const sol of s.solution) expect(paths.has(sol.path), sol.path).toBe(true);
    }
  });

  it('decide steps name real options as the correct answers', () => {
    for (const s of TASKS.flatMap(t => t.steps)) {
      if (s.kind !== 'decide') continue;
      const ids = s.options.map(o => o.id);
      expect(s.correct.length).toBeGreaterThan(0);
      for (const c of s.correct) expect(ids, s.id).toContain(c);
      if (!s.multi) expect(s.correct.length, s.id).toBe(1);
    }
  });

  it('every fix step fails on the files as the learner meets them and passes with the reference fix', () => {
    // Apply earlier solutions cumulatively, the way a learner who got every step right would.
    let files: FileMap = toMap(STARTER_FILES);
    for (const s of fixSteps) {
      const before = runChecks(s.checks, files);
      expect(before.some(r => !r.pass), `${s.id} should have something left to fix`).toBe(true);
      const after: FileMap = { ...files, ...Object.fromEntries(s.solution.map(f => [f.path, f.content])) };
      const results = runChecks(s.checks, after);
      expect(results.filter(r => !r.pass).map(r => r.id), `${s.id} reference fix`).toEqual([]);
      files = after;
    }
  });

  it('checks stay green after every later reference fix (no step undoes an earlier one)', () => {
    let files: FileMap = toMap(STARTER_FILES);
    const done: typeof fixSteps = [];
    for (const s of fixSteps) {
      files = { ...files, ...Object.fromEntries(s.solution.map(f => [f.path, f.content])) };
      done.push(s);
      for (const d of done) {
        expect(runChecks(d.checks, files).every(r => r.pass), `${d.id} after ${s.id}`).toBe(true);
      }
    }
  });

  it('every check has hints that move toward the answer', () => {
    for (const s of fixSteps) {
      for (const c of s.checks) {
        expect(c.hints.length, `${s.id}/${c.id}`).toBeGreaterThanOrEqual(2);
        expect(hintFor(c, 0)).toBeNull();
        expect(hintFor(c, 1)).toBe(c.hints[0]);
        expect(hintFor(c, 99)).toBe(c.hints[c.hints.length - 1]);
      }
    }
  });

  it('the fallback keyword review accepts the model answer and rejects empty or off-topic text', () => {
    for (const s of TASKS.flatMap(t => t.steps)) {
      if (s.kind !== 'explain') continue;
      expect(keywordReview(s.modelAnswer, s.keywords), s.id).toBe(true);
      expect(keywordReview('idk', s.keywords), s.id).toBe(false);
      expect(keywordReview('I like turtles and long walks on the beach', s.keywords), s.id).toBe(false);
    }
  });

  it('compares answer sets without caring about order', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSet(['a'], ['a', 'b'])).toBe(false);
    expect(sameSet(['a', 'c'], ['a', 'b'])).toBe(false);
  });
});
