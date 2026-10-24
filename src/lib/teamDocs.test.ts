import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { DOC_GROUPS, docUrl, isPrivateDoc, PRIVATE_REPO_URL, REPO_URL } from './teamDocs';

describe('docUrl', () => {
  it('opens working documents in the private repository', () => {
    expect(docUrl('docs/privacy-and-legal/DATA-MAP.md')).toBe(`${PRIVATE_REPO_URL}/blob/main/docs/privacy-and-legal/DATA-MAP.md`);
    expect(isPrivateDoc('docs/platform-management/DECISION-LOG.md')).toBe(true);
  });

  it('keeps family-facing documents in the public repository', () => {
    expect(docUrl('docs/privacy-and-legal/LEARNER-PRIVACY.md')).toBe(`${REPO_URL}/blob/main/docs/privacy-and-legal/LEARNER-PRIVACY.md`);
    expect(isPrivateDoc('docs/child-protection/CHILD-SAFEGUARDING-POLICY.md')).toBe(false);
  });

  it('only links public documents that really are in this repository', () => {
    const missing = DOC_GROUPS.flatMap(g => g.docs.flatMap(d => [d.path, d.word ?? '']))
      .filter(p => p && !isPrivateDoc(p) && !existsSync(p));
    expect(missing).toEqual([]);
  });
});
