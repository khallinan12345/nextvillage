// src/lib/teamDocs.ts
//
// The documentation library shown on /team. Paths are relative to the repository root; the page links
// to them on GitHub. Keep this list in step with docs/ when a document is added or renamed.
// Private documents (not in the repository) are listed in PRIVATE_DOCS with where to ask for them.

export const REPO_URL = 'https://github.com/khallinan12345/nextvillage';

export const docUrl = (path: string) => `${REPO_URL}/blob/main/${path}`;

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
      { title: 'Leader guide', path: 'docs/LEADER-GUIDE.md', about: 'Running a session day to day.' },
      { title: 'Leader training and sign-off', path: 'docs/LEADER-TRAINING.md', about: 'Seven modules, role-plays and a ten-question check.', word: 'docs/Leader-Training.docx' },
      { title: 'How we decide what changes', path: 'docs/CHANGE-PROCESS.md', about: 'Propose, triage, approve, review, release, check.' },
      { title: 'Decision log', path: 'docs/DECISION-LOG.md', about: 'What we decided and why.' },
    ],
  },
  {
    id: 'safety',
    label: 'Child safety and conduct',
    docs: [
      { title: 'Child safeguarding policy', path: 'docs/CHILD-SAFEGUARDING-POLICY.md', about: 'What to do about a concern, who to tell, how fast.', word: 'docs/Child-Safeguarding-Policy.docx' },
      { title: 'Code of conduct', path: 'docs/templates/CODE-OF-CONDUCT.md', about: 'Signed by every leader, mentor and volunteer.', word: 'docs/forms/Code of conduct.docx' },
      { title: 'How the AI is kept safe', path: 'docs/AI-SAFETY-AND-GUARDRAILS.md', about: 'Rules, safety checker, removal of personal details, younger-learner settings.', word: 'docs/AI-Safety-and-Guardrails.docx' },
      { title: 'Incident response runbook', path: 'docs/runbooks/incident-response.md', about: 'If something goes wrong with data or safety.' },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy and data protection',
    docs: [
      { title: 'Learner privacy in simple words', path: 'docs/LEARNER-PRIVACY.md', about: 'Read aloud with learners.', word: 'docs/Learner-Privacy.docx' },
      { title: 'Data security and identity protection', path: 'docs/DATA-SECURITY-AND-IDENTITY-PROTECTION.md', about: 'What protects a child\'s information.', word: 'docs/Data-Security-and-Identity-Protection.docx' },
      { title: 'Data map', path: 'docs/DATA-MAP.md', about: 'What we hold, where it flows, who sees it.' },
      { title: 'Vendor review', path: 'docs/VENDOR-REVIEW.md', about: 'Each outside service and its terms.' },
      { title: 'Data protection impact assessment', path: 'docs/DPIA.md', about: 'Risks to children and how they are reduced.' },
      { title: 'Privacy and compliance plan', path: 'docs/PRIVACY-COMPLIANCE-PLAN.md', about: 'The full plan and its open items.' },
      { title: 'Parent consent forms', path: 'docs/forms/README.md', about: 'Print-ready forms and how to use them.' },
    ],
  },
  {
    id: 'learning',
    label: 'Learning and results',
    docs: [
      { title: 'How students are evaluated', path: 'docs/STUDENT-EVALUATION.md', about: 'Every kind of evaluation, with known limits.', word: 'docs/Student-Evaluation.docx' },
      { title: 'Impact and outcomes summary', path: 'docs/IMPACT-SUMMARY.md', about: 'What the data supports and what it does not.', word: 'docs/Impact-Summary.docx' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations and security',
    docs: [
      { title: 'Security program', path: 'docs/SECURITY-PROGRAM.md', about: 'How we keep the platform secure.' },
      { title: 'Duplicate account runbook', path: 'docs/runbooks/duplicate-user.md', about: 'Merging duplicate accounts.' },
      { title: 'Admin operations manual', path: 'docs/ADMIN-OPERATIONS-MANUAL.md', about: 'Routine administrator tasks.' },
    ],
  },
  {
    id: 'partners',
    label: 'Partners and funders',
    docs: [
      { title: 'Community onboarding guide', path: 'docs/Community-Onboarding-Guide.html', about: 'For a new organization joining.' },
      { title: 'Partnership agreement', path: 'docs/templates/PARTNERSHIP-AGREEMENT.md', about: 'Terms between us and a partner.', word: 'docs/forms/Partnership agreement.docx' },
      { title: 'Funder data-protection summary', path: 'docs/FUNDER-DATA-PROTECTION-SUMMARY.md', about: 'One page for funders.', word: 'docs/Funder-Data-Protection-Summary.docx' },
      { title: 'Legal review brief', path: 'docs/LEGAL-REVIEW-BRIEF.md', about: 'Questions for the lawyer.' },
    ],
  },
];

export const PRIVATE_DOCS: { title: string; where: string }[] = [
  { title: 'Team handbook (Word)', where: 'Ask the platform owner. Not kept in the public repository.' },
  { title: 'Continuity plan and who-holds-which-login sheet', where: 'Ask the platform owner. Private by design.' },
];
