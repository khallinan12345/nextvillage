// src/lib/teamDocs.ts
//
// The documentation library shown on /team. Paths are relative to the repository root; the page links
// to them on GitHub. Keep this list in step with docs/ when a document is added or renamed.
// Documents held in the private repository open through docUrl (see PRIVATE_PATHS below).
// Private documents that are in no repository are listed in PRIVATE_DOCS with where to ask for them.

export const REPO_URL = 'https://github.com/khallinan12345/nextvillage';

// Working documents (data map, DPIA, legal and vendor reviews, security program, decision log, incident
// runbook) live in a private repository with the same folder layout. Only people added as collaborators
// can open those links; everyone else sees GitHub's "not found" page.
export const PRIVATE_REPO_URL = 'https://github.com/khallinan12345/nextvillage-private';

const PRIVATE_PATHS = new Set<string>([
  'docs/privacy-and-legal/AI-LEGAL-REVIEW.md',
  'docs/privacy-and-legal/DATA-MAP.md',
  'docs/privacy-and-legal/DATA-SECURITY-AND-IDENTITY-PROTECTION.md',
  'docs/privacy-and-legal/Data-Security-and-Identity-Protection.docx',
  'docs/privacy-and-legal/DPIA.md',
  'docs/privacy-and-legal/GHANA-LEGAL-REVIEW.md',
  'docs/privacy-and-legal/LEGAL-REVIEW-BRIEF.md',
  'docs/privacy-and-legal/PRIVACY-COMPLIANCE-PLAN.md',
  'docs/privacy-and-legal/TRANSFER-BASIS.md',
  'docs/privacy-and-legal/VENDOR-DPA-CHECKLIST.md',
  'docs/privacy-and-legal/VENDOR-REVIEW.md',
  'docs/platform-management/DECISION-LOG.md',
  'docs/platform-management/SECURITY-PROGRAM.md',
  'docs/platform-management/SECURITY-SCANNER-NOTES.md',
  'docs/platform-management/runbooks/incident-response.md',
]);

export const docUrl = (path: string) => `${PRIVATE_PATHS.has(path) ? PRIVATE_REPO_URL : REPO_URL}/blob/main/${path}`;

/** True when the document is held in the private repository. */
export const isPrivateDoc = (path: string) => PRIVATE_PATHS.has(path);

export interface TeamDoc {
  title: string;
  path: string;
  about: string;
  /** Word copy in the repository, if there is one. */
  word?: string;
}

export interface DocGroup {
  id: string;
  label: string;
  docs: TeamDoc[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    id: 'start',
    label: 'Start here',
    docs: [
      { title: 'Leader guide', path: 'docs/onboarding/LEADER-GUIDE.md', about: 'Running a session day to day.' },
      { title: 'Leader training and sign-off', path: 'docs/onboarding/LEADER-TRAINING.md', about: 'Seven modules, role-plays and a ten-question check.', word: 'docs/onboarding/Leader-Training.docx' },
      { title: 'How we decide what changes', path: 'docs/platform-management/CHANGE-PROCESS.md', about: 'Propose, triage, approve, review, release, check.' },
      { title: 'Decision log', path: 'docs/platform-management/DECISION-LOG.md', about: 'What we decided and why.' },
    ],
  },
  {
    id: 'safety',
    label: 'Child safety and conduct',
    docs: [
      { title: 'Child safeguarding policy', path: 'docs/child-protection/CHILD-SAFEGUARDING-POLICY.md', about: 'What to do about a concern, who to tell, how fast.', word: 'docs/child-protection/Child-Safeguarding-Policy.docx' },
      { title: 'Code of conduct', path: 'docs/templates/CODE-OF-CONDUCT.md', about: 'Signed by every leader, mentor and volunteer.', word: 'docs/forms/Code of conduct.docx' },
      { title: 'How the AI is kept safe', path: 'docs/child-protection/AI-SAFETY-AND-GUARDRAILS.md', about: 'Rules, safety checker, removal of personal details, younger-learner settings.', word: 'docs/child-protection/AI-Safety-and-Guardrails.docx' },
      { title: 'Incident response runbook', path: 'docs/platform-management/runbooks/incident-response.md', about: 'If something goes wrong with data or safety.' },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy and data protection',
    docs: [
      { title: 'Learner privacy in simple words', path: 'docs/privacy-and-legal/LEARNER-PRIVACY.md', about: 'Read aloud with learners.', word: 'docs/privacy-and-legal/Learner-Privacy.docx' },
      { title: 'Data security and identity protection', path: 'docs/privacy-and-legal/DATA-SECURITY-AND-IDENTITY-PROTECTION.md', about: 'What protects a child\'s information.', word: 'docs/privacy-and-legal/Data-Security-and-Identity-Protection.docx' },
      { title: 'Data map', path: 'docs/privacy-and-legal/DATA-MAP.md', about: 'What we hold, where it flows, who sees it.' },
      { title: 'Vendor review', path: 'docs/privacy-and-legal/VENDOR-REVIEW.md', about: 'Each outside service and its terms.' },
      { title: 'Data protection impact assessment', path: 'docs/privacy-and-legal/DPIA.md', about: 'Risks to children and how they are reduced.' },
      { title: 'Privacy and compliance plan', path: 'docs/privacy-and-legal/PRIVACY-COMPLIANCE-PLAN.md', about: 'The full plan and its open items.' },
      { title: 'My path card (handout for families)', path: 'docs/forms/my-path-card-template.html', about: 'One page for parents: what this is, the path, safety. Also at /my-path.' },
      { title: 'Parent consent forms', path: 'docs/forms/README.md', about: 'Print-ready forms and how to use them.' },
    ],
  },
  {
    id: 'learning',
    label: 'Learning and results',
    docs: [
      { title: 'Core curriculum for new learners', path: 'docs/onboarding/CORE-CURRICULUM.md', about: 'What a new learner does, in order, and how each step is checked.', word: 'docs/onboarding/Core-Curriculum.docx' },
      { title: 'How students are evaluated', path: 'docs/evaluation/STUDENT-EVALUATION.md', about: 'Every kind of evaluation, with known limits.', word: 'docs/evaluation/Student-Evaluation.docx' },
      { title: 'Impact and outcomes summary', path: 'docs/fund-raising/IMPACT-SUMMARY.md', about: 'What the data supports and what it does not.', word: 'docs/fund-raising/Impact-Summary.docx' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations and security',
    docs: [
      { title: 'Security program', path: 'docs/platform-management/SECURITY-PROGRAM.md', about: 'How we keep the platform secure.' },
      { title: 'Duplicate account runbook', path: 'docs/platform-management/runbooks/duplicate-user.md', about: 'Merging duplicate accounts.' },
      { title: 'Admin operations manual', path: 'docs/platform-management/ADMIN-OPERATIONS-MANUAL.md', about: 'Routine administrator tasks.' },
    ],
  },
  {
    id: 'partners',
    label: 'Partners and funders',
    docs: [
      { title: 'Community onboarding guide', path: 'docs/onboarding/Community-Onboarding-Guide.html', about: 'For a new organization joining.' },
      { title: 'Partnership agreement', path: 'docs/templates/PARTNERSHIP-AGREEMENT.md', about: 'Terms between us and a partner.', word: 'docs/forms/Partnership agreement.docx' },
      { title: 'Funder data-protection summary', path: 'docs/fund-raising/FUNDER-DATA-PROTECTION-SUMMARY.md', about: 'One page for funders.', word: 'docs/fund-raising/Funder-Data-Protection-Summary.docx' },
      { title: 'Legal review brief', path: 'docs/privacy-and-legal/LEGAL-REVIEW-BRIEF.md', about: 'Questions for the lawyer.' },
    ],
  },
];

export const PRIVATE_DOCS: { title: string; where: string }[] = [
  { title: 'Team handbook (Word)', where: 'Ask the platform owner. Not kept in the public repository.' },
  { title: 'Continuity plan and who-holds-which-login sheet', where: 'Ask the platform owner. Private by design.' },
];
