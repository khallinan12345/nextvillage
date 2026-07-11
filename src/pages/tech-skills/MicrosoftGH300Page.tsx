// src/pages/tech-skills/MicrosoftGH300Page.tsx
// GitHub Foundations (GH-300) Certification Prep
// API routes needed:
//   /api/gh300-task-instruction   (returns TaskInstruction for each topic)
//   /api/gh300-evaluate-session   (returns evaluation scores + feedback)

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import {
  Brain, BookOpen, Play, CheckCircle, ArrowRight, Eye,
  ChevronDown, ChevronRight, Loader2, FolderOpen,
  ArrowUpCircle, SkipForward, Lightbulb, RefreshCw, BarChart3,
  Award, X, Copy, Check, Volume2, VolumeX, AlertCircle, Star,
  Cpu, MessageSquarePlus, Zap, Shield, Camera, Mic, Sparkles,
  Trash2, Plus, HelpCircle, GraduationCap, Target, TrendingUp,
  GitBranch, GitCommit, GitMerge, GitPullRequest, Lock, Users,
  Terminal, Package, Search, Settings, Globe, Code,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopicDef {
  id: string;
  label: string;
  domain: 1 | 2 | 3 | 4 | 5 | 6;
  icon: string;
  isOnboarding?: boolean;
  weight: string;
  keyTools?: string[];
}

interface TaskInstruction {
  headline: string;
  context: string;
  subTasks: string[];
  subTaskTeaching: string[];
  examplePrompt: string;
}

interface QuizEntry {
  id: string;
  topicId: string;
  subTaskIndex: number;
  subTaskQuestion?: string;
  subTaskTeaching?: string;
  userAnswer: string;
  aiExplanation?: string;
  aiCritique?: string;
  hasSuggestions?: boolean;
  timestamp: string;
  action: 'answer' | 'iterate' | 'critique' | 'practice';
}

interface SessionRecord {
  id: number;
  gh300_session_id: string;
  gh300_session_name: string;
  gh300_prompts: any[];
  gh300_evaluation: any | null;
  updated_at?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const makeId = () => Math.random().toString(36).substring(2, 9);
const GH300_ACTIVITY = 'gh300_cert_prep';

const TOPICS: TopicDef[] = [
  // Onboarding
  { id: 'intro_gh300',         label: 'Welcome & Exam Overview',          domain: 1, icon: '🎓', isOnboarding: true, weight: '' },

  // Domain 1 — Introduction to Git and GitHub (22%)
  { id: 'git_fundamentals',    label: 'Git Fundamentals',                  domain: 1, icon: '🌿', weight: '22%' },
  { id: 'github_overview',     label: 'GitHub Overview & Navigation',      domain: 1, icon: '🐙', weight: '22%' },
  { id: 'repos_basics',        label: 'Repositories: Create & Manage',     domain: 1, icon: '📁', weight: '22%' },

  // Domain 2 — Working with GitHub Repositories (8%)
  { id: 'commits_history',     label: 'Commits & History',                 domain: 2, icon: '📝', weight: '8%' },
  { id: 'branches_merging',    label: 'Branches & Merging',                domain: 2, icon: '🌿', weight: '8%' },

  // Domain 3 — Collaboration Features (30%)
  { id: 'issues_projects',     label: 'Issues & GitHub Projects',          domain: 3, icon: '📋', weight: '30%', keyTools: ['GitHub Issues', 'GitHub Projects'] },
  { id: 'pull_requests',       label: 'Pull Requests & Code Review',       domain: 3, icon: '🔀', weight: '30%', keyTools: ['Pull Requests', 'Code Review'] },
  { id: 'discussions_wikis',   label: 'Discussions, Wikis & Gists',        domain: 3, icon: '💬', weight: '30%', keyTools: ['GitHub Discussions', 'GitHub Wiki', 'Gists'] },
  { id: 'notifications_search','label': 'Notifications & Search',          domain: 3, icon: '🔔', weight: '30%', keyTools: ['GitHub Search', 'Notifications'] },

  // Domain 4 — Modern Development (13%)
  { id: 'github_actions',      label: 'GitHub Actions & CI/CD',            domain: 4, icon: '⚡', weight: '13%', keyTools: ['GitHub Actions', 'Workflows'] },
  { id: 'codespaces',          label: 'GitHub Codespaces',                 domain: 4, icon: '💻', weight: '13%', keyTools: ['GitHub Codespaces'] },
  { id: 'copilot',             label: 'GitHub Copilot',                    domain: 4, icon: '🤖', weight: '13%', keyTools: ['GitHub Copilot'] },

  // Domain 5 — Project Management (7%)
  { id: 'project_boards',      label: 'Project Boards & Milestones',       domain: 5, icon: '📊', weight: '7%',  keyTools: ['GitHub Projects', 'Milestones'] },
  { id: 'insights_analytics',  label: 'Insights & Repository Analytics',   domain: 5, icon: '📈', weight: '7%',  keyTools: ['GitHub Insights', 'Pulse'] },

  // Domain 6 — Privacy, Security & Administration (10%)
  { id: 'auth_permissions',    label: 'Authentication & Permissions',      domain: 6, icon: '🔐', weight: '10%', keyTools: ['2FA', 'SSH Keys', 'PATs'] },
  { id: 'security_features',   label: 'Security Features & Best Practices',domain: 6, icon: '🛡️', weight: '10%', keyTools: ['Dependabot', 'Secret Scanning', 'Code Scanning'] },
  { id: 'org_admin',           label: 'Organisation & Repository Admin',   domain: 6, icon: '⚙️', weight: '10%', keyTools: ['Org Settings', 'Branch Protection', 'CODEOWNERS'] },

  // Practice exam
  { id: 'practice_exam',       label: 'Practice Exam Simulation',          domain: 6, icon: '🎯', weight: '' },
];

const DOMAIN_META: Record<number, {
  label: string; shortLabel: string;
  color: string; bg: string; border: string;
  icon: React.ReactNode;
}> = {
  1: { label: 'Domain 1: Introduction to Git and GitHub',  shortLabel: 'D1: Git & GitHub',  color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: <GitBranch size={12} /> },
  2: { label: 'Domain 2: Working with GitHub Repositories',shortLabel: 'D2: Repositories',  color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',   icon: <GitCommit size={12} /> },
  3: { label: 'Domain 3: Collaboration Features',          shortLabel: 'D3: Collaboration', color: 'text-purple-400',  bg: 'bg-purple-500/15',  border: 'border-purple-500/30', icon: <Users size={12} /> },
  4: { label: 'Domain 4: Modern Development',              shortLabel: 'D4: Modern Dev',    color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30',  icon: <Zap size={12} /> },
  5: { label: 'Domain 5: Project Management',              shortLabel: 'D5: Projects',      color: 'text-pink-400',    bg: 'bg-pink-500/15',    border: 'border-pink-500/30',   icon: <Target size={12} /> },
  6: { label: 'Domain 6: Privacy, Security & Administration', shortLabel: 'D6: Security',   color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/30',    icon: <Lock size={12} /> },
};

// ─── Fallback seeds ───────────────────────────────────────────────────────────

const FALLBACK_SEEDS: Record<string, { teaching: string; question: string }[]> = {
  git_fundamentals: [
    {
      teaching: 'Git is a distributed version control system. Every developer has a full copy of the repository history on their machine. The three key areas are: the Working Directory (files you edit), the Staging Area (files you\'ve marked for the next commit), and the Repository (the committed history).',
      question: 'In your own words, explain the difference between the Working Directory, the Staging Area, and the Repository in Git. Why does the Staging Area exist — what problem does it solve?',
    },
    {
      teaching: 'The four most essential Git commands are: `git init` (create a new repo), `git add` (stage changes), `git commit` (save a snapshot), and `git status` (see what\'s changed). A commit is a permanent snapshot of your staged changes with a message describing what changed.',
      question: 'You have just edited two files: README.md and index.html. You only want to commit the README change right now. Write the exact sequence of Git commands you would run — and explain what each command does.',
    },
    {
      teaching: 'Git uses SHA-1 hashes (40-character strings like `a3f9c2d…`) to uniquely identify every commit. `git log` shows the commit history. `git diff` shows what changed between versions. These are the core tools for understanding a project\'s history.',
      question: 'A teammate says "just revert to the commit from last Tuesday." What Git command would you use to see the list of commits and find the right one — and what information does each commit entry show you?',
    },
  ],
  github_overview: [
    {
      teaching: 'GitHub is a cloud platform built on top of Git. It adds collaboration features: a web interface, pull requests, issues, Actions, and more. The key difference: Git is the tool, GitHub is the platform. Other platforms (GitLab, Bitbucket) also use Git.',
      question: 'Explain the difference between Git and GitHub to someone who has never heard of either. Use an analogy — perhaps comparing Git to a tool and GitHub to a workshop where people use that tool together.',
    },
    {
      teaching: 'GitHub\'s main navigation areas: Repositories (your code), Issues (tasks/bugs), Pull Requests (proposed changes), Actions (automation), Projects (planning boards), and the Marketplace (third-party integrations). The profile page shows your contribution graph.',
      question: 'You join a new open-source project on GitHub. Name three things you would look at first to understand the project — and which GitHub feature or page would you use for each one?',
    },
    {
      teaching: 'GitHub offers three account types: Personal accounts (individual users), Organisation accounts (teams and companies), and Enterprise accounts (large organisations with advanced security). Repositories can be Public (anyone can see), Private (only invited people), or Internal (visible to org members).',
      question: 'The Girls AIing platform is built by a small team and the code should only be visible to team members. Should the repository be Public, Private, or Internal — and what account type makes most sense for the organisation?',
    },
  ],
  repos_basics: [
    {
      teaching: 'Creating a repository: you can initialise on GitHub (with a README, .gitignore, and licence) or locally with `git init` then push. Cloning copies a remote repo to your machine: `git clone <url>`. Forking creates your own copy of someone else\'s repo on GitHub.',
      question: 'What is the difference between cloning and forking a repository? When would you clone, and when would you fork — give a real example for each.',
    },
    {
      teaching: 'A README.md is the front page of your repository — it should explain what the project does, how to install it, and how to contribute. A .gitignore file tells Git which files to never track (e.g. node_modules/, .env files with secrets). A LICENCE file defines how others can use your code.',
      question: 'You are creating a repository for a Nigerian community water-quality monitoring app. What would you include in the README.md — list at least four sections. Why is a .gitignore file especially important for this project?',
    },
    {
      teaching: 'Repository settings let you: rename or delete the repo, change visibility (public/private), manage collaborators, set up branch protection rules, and configure features like Issues and Wikis. The "About" section (description, topics, website) helps people discover your project.',
      question: 'After creating a repository, a teammate cannot push code even though you added them as a collaborator. What repository setting would you check — and what is the difference between a collaborator with "Read", "Write", and "Admin" access?',
    },
  ],
  commits_history: [
    {
      teaching: 'A good commit message follows the convention: a short subject line (50 chars max) in the imperative mood ("Add login feature", not "Added" or "Adding"), optionally followed by a blank line and a longer body explaining why the change was made.',
      question: 'Here are three commit messages: (1) "fixed stuff", (2) "Update README.md", (3) "Fix: resolve null pointer error when user profile is empty on first login". Rank them from worst to best and explain what makes a commit message useful for a team.',
    },
    {
      teaching: '`git log` shows commit history. `git log --oneline` gives a compact view. `git show <hash>` shows the full diff of one commit. `git blame <file>` shows who last changed each line. These tools help you understand why code is the way it is.',
      question: 'A bug was introduced sometime in the last two weeks. Describe the Git commands you would use to: (1) see all commits in that period, (2) find which commit introduced a specific line of code, and (3) see exactly what changed in that commit.',
    },
    {
      teaching: '`git revert <hash>` creates a new commit that undoes a previous one — safe for shared branches. `git reset` moves the branch pointer back — dangerous on shared branches. `git restore <file>` discards uncommitted changes to a file.',
      question: 'You pushed a commit that broke the main branch and your team is affected. Should you use `git revert` or `git reset` to fix it — and why does the answer change depending on whether others have already pulled that commit?',
    },
  ],
  branches_merging: [
    {
      teaching: 'A branch is a lightweight pointer to a commit. `git branch feature-login` creates a branch. `git checkout -b feature-login` creates and switches to it. `git switch` is the modern alternative to `git checkout` for switching branches. The default branch is usually called `main`.',
      question: 'Your team uses a branch-per-feature workflow. You are starting work on a "dark mode" feature. Write the exact Git commands to: (1) create a new branch called `feature/dark-mode`, (2) switch to it, and (3) verify you are on the correct branch.',
    },
    {
      teaching: 'Merging combines two branches. A fast-forward merge moves the pointer forward when there are no diverging commits. A three-way merge creates a new merge commit when branches have diverged. A merge conflict happens when two branches changed the same lines differently.',
      question: 'You are merging a feature branch into main and Git reports a merge conflict in `styles.css`. Describe step by step what you would do to resolve it — what does the conflict look like in the file, and what commands do you run after resolving it?',
    },
    {
      teaching: 'Rebasing rewrites commit history by replaying commits on top of another branch — it creates a linear history. `git rebase main` from a feature branch replays your feature commits on top of the latest main. The golden rule: never rebase commits that have been pushed to a shared branch.',
      question: 'Explain the difference between merging and rebasing using a diagram described in words. When would you choose rebase over merge — and what is the "golden rule" of rebasing and why does it matter?',
    },
  ],
  issues_projects: [
    {
      teaching: 'GitHub Issues are the primary way to track bugs, feature requests, and tasks. Each issue has: a title, description (Markdown), labels (e.g. "bug", "enhancement"), assignees, milestones, and a comment thread. Issues can be linked to pull requests and automatically closed when a PR merges.',
      question: 'Your team is building a crop disease detection app. Create a well-structured GitHub Issue for this bug: "The app crashes when a user uploads a photo larger than 5MB on a slow connection." Include a title, description with steps to reproduce, expected vs actual behaviour, and suggest two labels.',
    },
    {
      teaching: 'GitHub Projects is a flexible planning tool. You can create a board with columns (e.g. To Do, In Progress, Done) and add issues and pull requests as cards. Projects support custom fields, filters, and multiple views (Board, Table, Roadmap).',
      question: 'Your team has 12 open issues for a two-week sprint. Describe how you would set up a GitHub Project board to manage this sprint — what columns would you create, and how would you decide which issues go in each column?',
    },
    {
      teaching: 'Labels help categorise and filter issues. Milestones group issues by a deadline or release version. You can use closing keywords in commit messages or PR descriptions: "Fixes #42" or "Closes #42" will automatically close issue #42 when the PR merges.',
      question: 'What is the difference between a Label and a Milestone in GitHub Issues? Give an example of each for a project building a water quality monitoring app — and write a PR description line that would automatically close issue #17 when merged.',
    },
  ],
  pull_requests: [
    {
      teaching: 'A Pull Request (PR) is a proposal to merge changes from one branch into another. It shows a diff of all changes, allows inline comments on specific lines, and requires review before merging. PRs are the core collaboration mechanism on GitHub.',
      question: 'You have finished a feature on the `feature/user-auth` branch and want to merge it into `main`. Describe the steps to open a Pull Request on GitHub — what information should you include in the PR title and description to help your reviewers?',
    },
    {
      teaching: 'Code review on GitHub: reviewers can leave comments, suggest specific code changes (which the author can accept with one click), approve the PR, or request changes. A PR cannot be merged until all required reviewers have approved and all status checks pass.',
      question: 'You are reviewing a teammate\'s PR and notice a function that could cause a security vulnerability. How do you leave feedback — what is the difference between a regular comment, a "suggestion", and "requesting changes" in a GitHub code review?',
    },
    {
      teaching: 'Three merge strategies: (1) Create a merge commit — preserves full history. (2) Squash and merge — combines all PR commits into one clean commit on main. (3) Rebase and merge — replays commits linearly without a merge commit. Each has different implications for history readability.',
      question: 'Your team\'s main branch history is getting cluttered with many small "WIP" commits from feature branches. Which merge strategy would you recommend — merge commit, squash and merge, or rebase and merge? Justify your answer.',
    },
  ],
  discussions_wikis: [
    {
      teaching: 'GitHub Discussions is a forum-style feature for open-ended conversations that don\'t belong in Issues (which are for actionable tasks). Categories include Q&A, Announcements, Ideas, and General. Discussions can be marked as "answered" in Q&A mode.',
      question: 'Your open-source project gets a lot of questions like "How do I configure this for Windows?" and "What is your roadmap for 2025?" Should these be GitHub Issues or GitHub Discussions — and why is the distinction important for keeping your issue tracker clean?',
    },
    {
      teaching: 'GitHub Wiki provides a space for project documentation — installation guides, architecture decisions, API references. It is a separate Git repository you can clone and edit. Gists are lightweight, shareable code snippets — they are full Git repositories but designed for single files or small collections.',
      question: 'Your project has three types of content: (1) Step-by-step setup instructions, (2) A reusable Python function you want to share with the community, (3) A bug report. Which GitHub feature is best for each — Wiki, Gist, or Issue? Explain your reasoning.',
    },
    {
      teaching: 'Markdown is the formatting language used across GitHub — in READMEs, Issues, PRs, Discussions, and Wikis. Key syntax: `# Heading`, `**bold**`, `- list item`, `` `code` ``, `[link text](url)`, and fenced code blocks with triple backticks.',
      question: 'Write a short GitHub Issue description in Markdown that includes: a heading, a numbered list of steps to reproduce a bug, a code block showing an error message, and a link to a related issue (#23). Then explain why Markdown matters for collaboration.',
    },
  ],
  notifications_search: [
    {
      teaching: 'GitHub Notifications alert you to activity on repositories you watch, issues you are assigned to, or PRs you are reviewing. You can manage notifications by: watching/unwatching repos, setting notification preferences per repo, and using the Notifications inbox to triage.',
      question: 'You are contributing to five open-source projects and your GitHub notification inbox has 200 unread items. Describe two strategies you would use to manage this — using GitHub\'s notification settings — so you only see what actually needs your attention.',
    },
    {
      teaching: 'GitHub Search is powerful. You can search across all of GitHub or within a repo. Key qualifiers: `is:open`, `is:closed`, `label:bug`, `author:username`, `repo:owner/name`, `language:python`, `created:>2024-01-01`. The search bar also supports code, commits, users, and topics.',
      question: 'You want to find all open issues labelled "good first issue" in Python repositories created after January 2024, to find a project to contribute to. Write the GitHub search query you would use — and explain what each qualifier does.',
    },
  ],
  github_actions: [
    {
      teaching: 'GitHub Actions is a CI/CD platform built into GitHub. A Workflow is a YAML file in `.github/workflows/`. It is triggered by Events (push, pull_request, schedule, etc.), contains Jobs (groups of steps that run on a Runner), and each Job has Steps (individual commands or Actions).',
      question: 'Explain the relationship between a Workflow, a Job, a Step, and an Action in GitHub Actions. Use an analogy — perhaps a recipe (workflow) with cooking stages (jobs) and individual instructions (steps) that use kitchen tools (actions).',
    },
    {
      teaching: 'A basic workflow YAML structure:\n```yaml\nname: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n```\nThe `uses` keyword references a pre-built Action. `run` executes a shell command.',
      question: 'Your team wants to automatically run tests every time someone pushes to the `main` branch. Describe what the workflow YAML file would need to contain — the trigger, the runner, and the steps. You do not need to write perfect YAML, but explain each section.',
    },
    {
      teaching: 'GitHub Actions has a Marketplace with thousands of pre-built Actions. Secrets (stored in repo or org settings) are used to pass API keys and passwords to workflows without exposing them in code. Artifacts let you save files produced by a workflow (e.g. build outputs, test reports).',
      question: 'Your workflow needs to deploy to a cloud server and requires an API key. How do you store and use this secret securely in GitHub Actions — and why should you never put the API key directly in the YAML file?',
    },
  ],
  codespaces: [
    {
      teaching: 'GitHub Codespaces is a cloud-based development environment. It spins up a container (based on a `devcontainer.json` config) with VS Code in the browser — pre-installed with your project\'s dependencies. You can code from any device without local setup.',
      question: 'A new contributor wants to work on your project but says "I can\'t install Node.js on my school computer." How would GitHub Codespaces solve this problem — and what file in your repository controls what tools are pre-installed in the Codespace?',
    },
    {
      teaching: 'Codespaces are billed by compute time and storage. Free tier: 60 core-hours/month for personal accounts. You can stop a Codespace when not in use to save hours. The `devcontainer.json` file specifies the base image, extensions, and post-create commands.',
      question: 'What is the difference between stopping and deleting a Codespace? When would you do each — and what happens to your uncommitted changes if you delete a Codespace without pushing?',
    },
  ],
  copilot: [
    {
      teaching: 'GitHub Copilot is an AI pair programmer that suggests code completions, entire functions, and tests as you type. It is powered by large language models trained on public code. It integrates with VS Code, JetBrains, and other editors. Copilot Chat allows conversational coding assistance.',
      question: 'You are writing a Python function to parse CSV files from water quality sensors. Describe how you would use GitHub Copilot to help — what would you type to trigger a useful suggestion, and how would you evaluate whether the suggestion is correct and safe to use?',
    },
    {
      teaching: 'Responsible use of Copilot: always review suggestions before accepting — Copilot can produce incorrect, insecure, or outdated code. It may reproduce code from its training data, raising potential licence concerns. Copilot is a tool to accelerate, not replace, developer judgement.',
      question: 'GitHub Copilot suggests a function that looks correct but you are not sure if it handles edge cases. What steps would you take before accepting and committing this suggestion — and what does this tell you about the role of AI tools in software development?',
    },
  ],
  project_boards: [
    {
      teaching: 'GitHub Projects (v2) supports multiple views: Board (Kanban), Table (spreadsheet), and Roadmap (timeline). Custom fields let you add priority, effort, sprint number, or any metadata. Items can be issues, PRs, or draft items. Projects can span multiple repositories.',
      question: 'Your team is planning a three-month development roadmap for a community app. Which GitHub Projects view would be most useful for each scenario: (1) seeing which tasks are blocked right now, (2) planning which features land in which month, (3) comparing effort estimates across all tasks?',
    },
    {
      teaching: 'Milestones group issues and PRs by a target date or version. They show a progress bar (open vs closed issues). Milestones are repository-specific, while Projects can span repos. Use milestones for version releases (v1.0, v1.1) and Projects for ongoing workflow management.',
      question: 'What is the difference between a GitHub Milestone and a GitHub Project? Give a concrete example of when you would use each for a team building a mobile app — and how do they complement each other?',
    },
  ],
  insights_analytics: [
    {
      teaching: 'GitHub Insights provides analytics for repositories and organisations. Key views: Pulse (activity summary for a period), Contributors (who committed what), Traffic (page views and clones), Commits (activity over time), and Code Frequency (additions vs deletions).',
      question: 'You are the maintainer of an open-source project and want to understand its health. Name three GitHub Insights views you would check — and what specific question each one helps you answer.',
    },
    {
      teaching: 'The Dependency Graph shows all packages your project depends on. Combined with Dependabot, GitHub can automatically open PRs to update vulnerable dependencies. The Security tab shows open security advisories for your dependencies.',
      question: 'Your repository uses 40 npm packages. How does GitHub help you stay aware of security vulnerabilities in those packages — name the two features involved and describe what each one does automatically.',
    },
  ],
  auth_permissions: [
    {
      teaching: 'GitHub authentication methods: Username/password (basic), Personal Access Tokens (PATs — used instead of passwords for API and Git operations), SSH Keys (for Git operations over SSH), and OAuth Apps / GitHub Apps (for third-party integrations). Two-factor authentication (2FA) adds a second verification step.',
      question: 'A developer on your team wants to push code from a CI/CD pipeline to a private GitHub repository. Should they use their password, a Personal Access Token, or an SSH key — and why is using a password directly a bad practice for automated systems?',
    },
    {
      teaching: 'Repository permission levels: Read (view and clone), Triage (manage issues/PRs, no code push), Write (push code), Maintain (manage repo settings, no destructive actions), Admin (full control). Organisation roles: Owner, Member, Outside Collaborator.',
      question: 'You are onboarding three people to your GitHub organisation: (1) a junior developer who will write code, (2) a project manager who needs to manage issues but not push code, (3) a security auditor who only needs to read the code. What permission level would you assign each person — and why?',
    },
    {
      teaching: 'SSH keys: you generate a key pair (public + private). The public key goes on GitHub, the private key stays on your machine. PATs have scopes (repo, workflow, read:org, etc.) that limit what the token can do. Fine-grained PATs (newer) let you restrict access to specific repositories.',
      question: 'What is the difference between a classic Personal Access Token and a fine-grained Personal Access Token on GitHub? Which is more secure for a token that only needs to read one specific private repository — and why?',
    },
  ],
  security_features: [
    {
      teaching: 'GitHub\'s security features: Dependabot (automated dependency updates and vulnerability alerts), Secret Scanning (detects accidentally committed API keys and passwords), Code Scanning (static analysis for security vulnerabilities using CodeQL or third-party tools), and Security Advisories (for disclosing vulnerabilities responsibly).',
      question: 'A developer accidentally commits an AWS API key to a public repository. Which GitHub security feature would detect this — and what should the developer do immediately after discovering the commit, even after deleting it from the repo?',
    },
    {
      teaching: 'Branch protection rules prevent force-pushes, require PR reviews before merging, require status checks to pass, and can require signed commits. These are configured in repository Settings → Branches. CODEOWNERS files automatically assign reviewers based on which files changed.',
      question: 'Your team\'s `main` branch keeps getting broken by direct pushes. Describe two branch protection rules you would enable — and explain what each one prevents. What is a CODEOWNERS file and how does it complement branch protection?',
    },
    {
      teaching: 'Security policies: a SECURITY.md file in the repository root tells users how to responsibly report vulnerabilities (rather than opening a public issue). GitHub\'s Private Vulnerability Reporting feature lets researchers report issues privately. Security Advisories let maintainers draft and publish CVEs.',
      question: 'You maintain an open-source library used by thousands of developers. Someone emails you saying they found a serious security vulnerability. What GitHub features would you use to: (1) receive the report privately, (2) coordinate a fix without public disclosure, and (3) notify users once patched?',
    },
  ],
  org_admin: [
    {
      teaching: 'Organisation settings control: member privileges (can members create repos?), default repository visibility, base permissions for all members, team management, and billing. Teams within an org can be given access to specific repositories with specific permission levels.',
      question: 'You are setting up a GitHub Organisation for a 20-person development team. Describe three organisation-level settings you would configure on day one — and explain why each one matters for security or workflow.',
    },
    {
      teaching: 'Repository rulesets (the modern replacement for branch protection rules) can be applied at the organisation level — protecting all repos at once. They support: required reviews, status checks, signed commits, and restricting who can push to protected branches.',
      question: 'What is the advantage of using organisation-level rulesets instead of setting branch protection rules on each repository individually — especially for an organisation with 50 repositories?',
    },
    {
      teaching: 'The audit log records all actions taken in an organisation: who changed what settings, who was added or removed, which repos were created or deleted. It is essential for security compliance. Enterprise accounts can stream audit logs to external SIEM tools.',
      question: 'A repository was accidentally made public last night and you need to find out who changed the visibility setting and when. Which GitHub feature would you use — and what information would the audit log entry contain?',
    },
  ],
  practice_exam: [
    {
      teaching: 'The GH-300 GitHub Foundations exam has approximately 75 questions, a 120-minute time limit, and requires a score of 700/1000 to pass. Questions are scenario-based. Domain 3 (Collaboration) carries the most weight at 30%, followed by Domain 1 (Git & GitHub) at 22%.',
      question: 'Before we begin the practice simulation, rate your confidence in each domain from 1 (not confident) to 5 (very confident): D1 (Git & GitHub), D2 (Repositories), D3 (Collaboration), D4 (Modern Dev), D5 (Project Management), D6 (Security & Admin). This helps me focus the practice questions on your weakest areas.',
    },
    {
      teaching: 'Exam tip: identify the trigger words. "Propose changes for review" → Pull Request. "Track a bug or task" → Issue. "Automate on push" → GitHub Actions. "Cloud dev environment" → Codespaces. "AI code suggestions" → Copilot. "Detect leaked secrets" → Secret Scanning.',
      question: 'Practice question 1: A team wants to ensure that no code is merged into `main` without at least two approvals and all automated tests passing. Which GitHub feature do they configure — and where in the GitHub interface would they find this setting?',
    },
    {
      teaching: 'Common exam traps: (1) Git vs GitHub — know which features are Git (local) vs GitHub (platform). (2) Fork vs Clone — fork is for contributing to others\' repos; clone is for working locally. (3) Revert vs Reset — revert is safe for shared branches; reset rewrites history.',
      question: 'Practice question 2: A developer wants to contribute to an open-source project they do not have write access to. They want to make changes and propose them to the original project. What is the correct workflow — and what is the first step they must take on GitHub before writing any code?',
    },
  ],
};

// ─── Score badge ──────────────────────────────────────────────────────────────

const ScoreBadge: React.FC<{ score: number; max?: number }> = ({ score, max = 3 }) => {
  const pct = score / max;
  const color = pct >= 0.8
    ? 'from-emerald-400 to-green-500 text-green-950'
    : pct >= 0.5
    ? 'from-amber-400 to-yellow-500 text-yellow-950'
    : 'from-red-400 to-rose-500 text-rose-950';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${color}`}>
      <Star size={12} />{score}/{max}
    </span>
  );
};

// ─── Onboarding card ──────────────────────────────────────────────────────────

const GH300Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
      <p className="text-xs font-bold text-emerald-400 uppercase mb-3">🐙 Welcome to GitHub Foundations Prep</p>
      <p className="text-sm text-gray-300 leading-relaxed mb-3">
        You are preparing for the <strong className="text-white">GitHub Foundations (GH-300)</strong> certification —
        a globally recognised credential that validates your understanding of Git, GitHub, and modern collaborative
        software development. <strong className="text-white">No advanced coding required.</strong>
      </p>
      <p className="text-sm text-gray-300 leading-relaxed mb-4">
        This certification is offered by <strong className="text-white">GitHub Education</strong> and is an excellent
        first step for developers, project managers, and anyone working with code on GitHub.
      </p>

      <p className="text-xs font-bold text-gray-400 uppercase mb-2">What GH-300 Covers</p>
      <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs leading-relaxed space-y-1 mb-3">
        {[
          ['🌿', 'D1', 'Introduction to Git and GitHub',        '22%', 'text-emerald-300'],
          ['📁', 'D2', 'Working with GitHub Repositories',      '8%',  'text-blue-300'],
          ['👥', 'D3', 'Collaboration Features',                '30%', 'text-purple-300'],
          ['⚡', 'D4', 'Modern Development',                    '13%', 'text-amber-300'],
          ['📊', 'D5', 'Project Management',                    '7%',  'text-pink-300'],
          ['🔐', 'D6', 'Privacy, Security & Administration',    '10%', 'text-red-300'],
        ].map(([icon, code, name, weight, col]) => (
          <div key={code} className="flex items-center gap-2">
            <span>{icon}</span>
            <span className={`${col} font-bold w-6`}>{code}</span>
            <span className="text-gray-300 flex-1">{name}</span>
            <span className="text-gray-500 text-[10px]">{weight}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      {[
        { icon: <HelpCircle size={14} />, title: 'Scenario-based questions', desc: '~75 questions testing real GitHub workflows, not just definitions', col: 'text-emerald-400' },
        { icon: <Target size={14} />,     title: 'Score 700/1000 to pass',   desc: '120 minutes, navigate freely, flag questions to revisit', col: 'text-blue-400' },
        { icon: <GraduationCap size={14} />, title: 'GitHub certified',      desc: 'Issued by GitHub — recognised by employers worldwide', col: 'text-amber-400' },
        { icon: <TrendingUp size={14} />, title: 'Career foundation',        desc: 'Prerequisite knowledge for GitHub Actions, Advanced Security certs', col: 'text-purple-400' },
      ].map((item, i) => (
        <div key={i} className="p-3 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className={`flex items-center gap-1.5 mb-1 ${item.col}`}>{item.icon}<span className="text-xs font-bold">{item.title}</span></div>
          <p className="text-[11px] text-gray-400">{item.desc}</p>
        </div>
      ))}
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">💡 How this prep course works</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        Each topic uses the <strong className="text-white">Socratic method</strong> — you explain concepts in your
        own words before the AI confirms or corrects. This builds genuine understanding, not just memorisation.
        Examples are grounded in real development scenarios from the <strong className="text-white">Girls AIing platform</strong> and
        community projects in <strong className="text-white">Oloibiri, Nigeria</strong>.
      </p>
    </div>

    <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
      <p className="text-xs font-bold text-emerald-400 mb-1.5">⏱️ Exam at a Glance</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['~75', 'Questions'], ['120 min', 'Time limit'], ['700/1000', 'Pass score']].map(([val, lbl]) => (
          <div key={lbl}>
            <p className="text-sm font-black text-white">{val}</p>
            <p className="text-[10px] text-gray-400">{lbl}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
      <p className="text-xs font-bold text-blue-400 mb-1.5">🎟️ Register for the Exam</p>
      <p className="text-xs text-gray-300 leading-relaxed mb-2">
        The GitHub Foundations exam is available through <strong className="text-white">PSI Online</strong>.
        GitHub Education offers discounts and free vouchers through student and community programmes.
      </p>
      <div className="flex flex-col gap-1.5">
        <a
          href="https://examregistration.github.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
        >
          <GraduationCap size={13} /> Register — GitHub Certifications
        </a>
        <a
          href="https://resources.github.com/learn/certifications/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors"
        >
          <BookOpen size={13} /> Official study guide (GitHub)
        </a>
      </div>
    </div>

    <button
      onClick={onComplete}
      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors"
    >
      Let's start with Domain 1! <ArrowRight size={16} />
    </button>
  </div>
);

// ─── Topic stepper ────────────────────────────────────────────────────────────

const TopicStepper: React.FC<{
  topics: TopicDef[];
  topicIndex: number;
  onJump: (idx: number) => void;
}> = ({ topics, topicIndex, onJump }) => {
  const domains = [1, 2, 3, 4, 5, 6] as const;
  const onboarding = topics.find(t => t.isOnboarding && t.id === 'intro_gh300');

  return (
    <div className="px-3 py-3 border-b border-gray-700 space-y-2 overflow-y-auto flex-shrink-0" style={{ maxHeight: '45vh' }}>
      {/* Intro */}
      {onboarding && (() => {
        const idx = topics.findIndex(t => t.id === onboarding.id);
        const isDone = idx < topicIndex;
        const isCurrent = idx === topicIndex;
        return (
          <button
            key={onboarding.id}
            onClick={() => isDone && onJump(idx)}
            disabled={!isDone && !isCurrent}
            className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
              ${isCurrent ? 'bg-emerald-500/15 border border-emerald-500/30 font-bold text-emerald-400' : ''}
              ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
              ${!isDone && !isCurrent ? 'text-gray-600 cursor-default' : ''}`}
          >
            <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? onboarding.icon : '⬜'}</span>
            <span className="truncate">{onboarding.label}</span>
          </button>
        );
      })()}

      {/* Domain groups */}
      {domains.map(domain => {
        const dm = DOMAIN_META[domain];
        const domainTopics = topics.filter(t => t.domain === domain && !t.isOnboarding && t.id !== 'practice_exam');
        if (domainTopics.length === 0) return null;
        return (
          <div key={domain}>
            <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider mb-1 ${dm.color}`}>
              {dm.icon}{dm.shortLabel}
              {domainTopics[0]?.weight && (
                <span className="text-gray-600 font-normal normal-case tracking-normal">{domainTopics[0].weight}</span>
              )}
            </div>
            <div className="space-y-0.5">
              {domainTopics.map(topic => {
                const globalIdx = topics.findIndex(t => t.id === topic.id);
                const isDone = globalIdx < topicIndex;
                const isCurrent = globalIdx === topicIndex;
                const isFuture = globalIdx > topicIndex;
                return (
                  <button
                    key={topic.id}
                    onClick={() => isDone && onJump(globalIdx)}
                    disabled={isFuture}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                      ${isCurrent ? `${dm.bg} ${dm.border} border font-bold ${dm.color}` : ''}
                      ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
                      ${isFuture ? 'text-gray-600 cursor-default' : ''}`}
                  >
                    <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? topic.icon : '⬜'}</span>
                    <span className="truncate">{topic.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Practice exam */}
      {(() => {
        const pe = topics.find(t => t.id === 'practice_exam');
        if (!pe) return null;
        const idx = topics.findIndex(t => t.id === 'practice_exam');
        const isDone = idx < topicIndex;
        const isCurrent = idx === topicIndex;
        const isFuture = idx > topicIndex;
        return (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1 text-emerald-400">Final Practice</p>
            <button
              onClick={() => isDone && onJump(idx)}
              disabled={isFuture}
              className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                ${isCurrent ? 'bg-emerald-500/15 border border-emerald-500/30 font-bold text-emerald-400' : ''}
                ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
                ${isFuture ? 'text-gray-600 cursor-default' : ''}`}
            >
              <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? pe.icon : '⬜'}</span>
              <span className="truncate">{pe.label}</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
};

// ─── Key tools reference panel ────────────────────────────────────────────────

const ToolReferencePanel: React.FC<{ topic: TopicDef }> = ({ topic }) => {
  const tools: Record<string, { desc: string; domain: string }> = {
    'GitHub Issues':        { desc: 'Track bugs, features, and tasks with labels, assignees, and milestones', domain: 'D3' },
    'GitHub Projects':      { desc: 'Flexible planning boards with Board, Table, and Roadmap views', domain: 'D3/D5' },
    'Pull Requests':        { desc: 'Propose, review, and merge code changes with inline comments', domain: 'D3' },
    'Code Review':          { desc: 'Inline comments, suggestions, approvals, and change requests on PRs', domain: 'D3' },
    'GitHub Discussions':   { desc: 'Forum-style conversations for Q&A, ideas, and announcements', domain: 'D3' },
    'GitHub Wiki':          { desc: 'Documentation space — a separate Git repo for project docs', domain: 'D3' },
    'Gists':                { desc: 'Shareable code snippets — lightweight single-file repositories', domain: 'D3' },
    'GitHub Search':        { desc: 'Search code, issues, PRs, users, and repos with qualifiers', domain: 'D3' },
    'Notifications':        { desc: 'Alerts for watched repos, assigned issues, and review requests', domain: 'D3' },
    'GitHub Actions':       { desc: 'CI/CD platform — automate workflows triggered by GitHub events', domain: 'D4' },
    'Workflows':            { desc: 'YAML files in .github/workflows/ defining automation pipelines', domain: 'D4' },
    'GitHub Codespaces':    { desc: 'Cloud-based VS Code dev environment — code from any device', domain: 'D4' },
    'GitHub Copilot':       { desc: 'AI pair programmer — code completions and chat assistance', domain: 'D4' },
    'Milestones':           { desc: 'Group issues/PRs by target date or release version', domain: 'D5' },
    'GitHub Insights':      { desc: 'Analytics: contributors, traffic, commits, code frequency', domain: 'D5' },
    'Pulse':                { desc: 'Activity summary for a repository over a selected period', domain: 'D5' },
    '2FA':                  { desc: 'Two-factor authentication — second verification step for login', domain: 'D6' },
    'SSH Keys':             { desc: 'Cryptographic key pair for authenticating Git operations over SSH', domain: 'D6' },
    'PATs':                 { desc: 'Personal Access Tokens — used instead of passwords for API/Git', domain: 'D6' },
    'Dependabot':           { desc: 'Automated dependency updates and vulnerability alerts', domain: 'D6' },
    'Secret Scanning':      { desc: 'Detects accidentally committed API keys and credentials', domain: 'D6' },
    'Code Scanning':        { desc: 'Static analysis for security vulnerabilities using CodeQL', domain: 'D6' },
    'Org Settings':         { desc: 'Organisation-level controls: member privileges, base permissions', domain: 'D6' },
    'Branch Protection':    { desc: 'Rules preventing force-push, requiring reviews and status checks', domain: 'D6' },
    'CODEOWNERS':           { desc: 'File that auto-assigns reviewers based on which files changed', domain: 'D6' },
  };

  const relevant = topic.keyTools?.filter(t => tools[t]) ?? [];
  if (relevant.length === 0) return null;

  return (
    <div className="p-3 bg-gray-800/40 border border-gray-700 rounded-xl space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <GitBranch size={11} className="text-emerald-400" /> Key Tools — This Topic
      </p>
      {relevant.map(tool => (
        <div key={tool} className="flex gap-2">
          <span className="text-[10px] font-bold text-emerald-300 whitespace-nowrap pt-0.5 min-w-[40px]">{tools[tool].domain}</span>
          <div>
            <p className="text-xs font-semibold text-white">{tool}</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">{tools[tool].desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Exam tip card ────────────────────────────────────────────────────────────

const ExamTipCard: React.FC<{ topicId: string }> = ({ topicId }) => {
  const tips: Record<string, string> = {
    git_fundamentals:    '"Distributed version control" → Git. "Working Directory → Staging → Repository" is the core Git flow. `git add` stages; `git commit` saves; `git status` shows current state.',
    github_overview:     '"Git is the tool; GitHub is the platform." Public = anyone. Private = invited only. Internal = org members only. Know the three account types: Personal, Organisation, Enterprise.',
    repos_basics:        '"Clone" = copy to your machine. "Fork" = copy to your GitHub account to contribute. README.md = project front page. .gitignore = files Git should never track.',
    commits_history:     '"Good commit message" → imperative mood, 50-char subject. `git log` = history. `git blame` = who changed which line. `git revert` = safe undo. `git reset` = dangerous on shared branches.',
    branches_merging:    '"Fast-forward" = no diverging commits, pointer just moves. "Three-way merge" = creates a merge commit. "Merge conflict" = same lines changed differently. Never rebase shared branches.',
    issues_projects:     '"Fixes #42" in a PR description auto-closes issue #42 on merge. Labels = categories. Milestones = version/date groupings. Projects = flexible planning boards.',
    pull_requests:       '"Squash and merge" = one clean commit. "Merge commit" = full history. "Rebase and merge" = linear history. Required reviews + status checks = branch protection.',
    discussions_wikis:   '"Actionable task/bug" → Issue. "Open-ended conversation" → Discussion. "Project documentation" → Wiki. "Shareable code snippet" → Gist.',
    notifications_search:'"is:open label:bug author:username" — combine qualifiers. Watch/unwatch repos to control notification volume. Notification inbox = triage centre.',
    github_actions:      '"Workflow" = YAML file. "Event" = trigger (push, PR, schedule). "Job" = group of steps on a runner. "Step" = individual command or `uses:` action. Secrets = never in YAML.',
    codespaces:          '"devcontainer.json" = defines the Codespace environment. Stop = pauses billing. Delete = removes environment (uncommitted work lost). Free tier = 60 core-hours/month.',
    copilot:             '"AI pair programmer" → Copilot. Always review suggestions — Copilot can be wrong or insecure. Copilot Chat = conversational. Copilot completions = inline suggestions.',
    project_boards:      '"Board view" = Kanban (what\'s blocked now). "Roadmap view" = timeline (what ships when). "Table view" = spreadsheet (compare all items). Milestones = repo-specific; Projects = cross-repo.',
    insights_analytics:  '"Pulse" = activity summary. "Contributors" = who committed what. "Traffic" = views and clones. "Dependency Graph + Dependabot" = automated security updates.',
    auth_permissions:    '"PAT" = token used instead of password. "SSH key" = cryptographic auth for Git. "Fine-grained PAT" = more secure, repo-specific. 2FA = always enable for security.',
    security_features:   '"Secret Scanning" = detects leaked credentials. "Dependabot" = fixes vulnerable dependencies. "Code Scanning/CodeQL" = finds security bugs in code. "Branch protection" = prevents bad merges.',
    org_admin:           '"Audit log" = who did what and when. "Rulesets" = org-wide branch protection. "CODEOWNERS" = auto-assign reviewers. "Base permissions" = default access for all org members.',
    practice_exam:       'D3 (Collaboration) = 30% of exam — know Issues, PRs, and Projects deeply. D1 (Git & GitHub) = 22%. Read each scenario for trigger words before choosing an answer.',
  };
  const tip = tips[topicId];
  if (!tip) return null;
  return (
    <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
      <p className="text-[10px] font-bold text-amber-400 uppercase mb-1.5 flex items-center gap-1">
        <Zap size={10} /> Exam Tip
      </p>
      <p className="text-xs text-gray-300 leading-relaxed">{tip}</p>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const MicrosoftGH300Page: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  // ── Personality baseline ──────────────────────────────────────────────
  const [communicationStrategy, setCommunicationStrategy] = useState<any>(null);
  const [learningStrategy, setLearningStrategy]           = useState<any>(null);
  useEffect(() => {
    if (!userId) return;
    supabase.from('user_personality_baseline')
      .select('communication_strategy, learning_strategy')
      .eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data?.communication_strategy) setCommunicationStrategy(data.communication_strategy);
        if (data?.learning_strategy)       setLearningStrategy(data.learning_strategy);
      });
  }, [userId]);

  // ── Voice ─────────────────────────────────────────────────────────────
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [voiceMode, setVoiceMode]                   = useState<'english' | 'pidgin'>('pidgin');

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('continent, country').eq('id', userId).single()
      .then(({ data }) => { setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english'); });
  }, [userId]);

  const { speak: hookSpeak, cancel: cancelSpeech, fallbackText, clearFallback } = useVoice(voiceMode === 'pidgin');

  const speakTextRef = useRef<(text: string) => void>(() => {});
  const speakText = useCallback((text: string) => {
    if (!voiceOutputEnabled || !text.trim()) return;
    hookSpeak(text);
  }, [voiceOutputEnabled, hookSpeak]);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  // ── Session ───────────────────────────────────────────────────────────
  const [sessionId, setSessionId]                 = useState<string | null>(null);
  const [sessionName, setSessionName]             = useState('GH-300 Prep');
  const [sessions, setSessions]                   = useState<SessionRecord[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Topic ─────────────────────────────────────────────────────────────
  const [topicIndex, setTopicIndex]                   = useState(0);
  const [taskInstruction, setTaskInstruction]         = useState<TaskInstruction | null>(null);
  const [loadingInstruction, setLoadingInstruction]   = useState(false);
  const [topicHasAnswer, setTopicHasAnswer]           = useState(false);
  const [subTaskIndex, setSubTaskIndex]               = useState(0);
  const [subTaskCritique, setSubTaskCritique]         = useState<{ hasSuggestions: boolean; feedback: string } | null>(null);

  // ── Answer ────────────────────────────────────────────────────────────
  const [answer, setAnswer]               = useState('');
  const [answerHistory, setAnswerHistory] = useState<QuizEntry[]>([]);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [isCritiquing, setIsCritiquing]   = useState(false);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // ── Evaluation ────────────────────────────────────────────────────────
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [isEvaluating, setIsEvaluating]     = useState(false);
  const [evaluation, setEvaluation]         = useState<any>(null);
  const [evalError, setEvalError]           = useState<string | null>(null);

  const currentTopic  = TOPICS[topicIndex];
  const currentDomain = (currentTopic?.domain ?? 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const dm            = DOMAIN_META[currentDomain];

  // ── Load sessions ─────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('dashboard')
      .select('id, gh300_session_id, gh300_session_name, gh300_prompts, gh300_evaluation, updated_at')
      .eq('user_id', userId).eq('activity', GH300_ACTIVITY)
      .not('gh300_session_id', 'is', null)
      .order('updated_at', { ascending: false });
    if (data?.length) {
      setSessions(data as SessionRecord[]);
      if (!sessionId) setShowSessionPicker(true);
    }
  }, [userId, sessionId]);

  useEffect(() => { if (userId) loadSessions(); }, [userId, loadSessions]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId();
    sessionIdRef.current = sid;
    setSessionId(sid);
    if (userId) {
      await supabase.from('dashboard').insert({
        user_id: userId, activity: GH300_ACTIVITY,
        gh300_session_id: sid, gh300_session_name: sessionName,
        gh300_prompts: [], gh300_evaluation: { topicIndex: 0 },
      });
    }
    return sid;
  }, [userId, sessionName]);

  const persistSession = useCallback(async (prompts: QuizEntry[], tIdx: number) => {
    const sid = sessionIdRef.current;
    if (!userId || !sid) return;
    await supabase.from('dashboard').update({
      gh300_prompts: prompts,
      gh300_evaluation: { topicIndex: tIdx },
      gh300_session_name: sessionName,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('gh300_session_id', sid);
  }, [userId, sessionName]);

  const createNewSession = useCallback(async () => {
    if (!userId) return;
    const sid = makeId();
    await supabase.from('dashboard').insert({
      user_id: userId, activity: GH300_ACTIVITY,
      gh300_session_id: sid, gh300_session_name: 'GH-300 Prep',
      gh300_prompts: [], gh300_evaluation: { topicIndex: 0 },
    });
    setSessionId(sid); sessionIdRef.current = sid;
    setSessionName('GH-300 Prep'); setTopicIndex(0);
    setAnswerHistory([]); setEvaluation(null);
    setTopicHasAnswer(false); setShowSessionPicker(false);
    setTaskInstruction(null); setAnswer(''); setAiExplanation(null);
    setErrorMsg(null); setSubTaskCritique(null); setSubTaskIndex(0);
  }, [userId]);

  const loadSession = useCallback((s: SessionRecord) => {
    setSessionId(s.gh300_session_id); sessionIdRef.current = s.gh300_session_id;
    setSessionName(s.gh300_session_name);
    const ev = s.gh300_evaluation || {};
    setTopicIndex(ev.topicIndex ?? 0);
    setAnswerHistory(s.gh300_prompts || []);
    setEvaluation(ev.scores || null);
    setTopicHasAnswer(false); setShowSessionPicker(false);
    setTaskInstruction(null); setAnswer(''); setAiExplanation(null);
    setErrorMsg(null); setSubTaskCritique(null); setSubTaskIndex(0);
  }, []);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    if (!userId) return;
    setDeletingSessionId(sid);
    try {
      await supabase.from('dashboard').update({
        gh300_session_id: null, gh300_session_name: null,
        gh300_prompts: null, gh300_evaluation: null,
      }).eq('user_id', userId).eq('gh300_session_id', sid);
      setSessions(prev => prev.filter(s => s.gh300_session_id !== sid));
    } finally { setDeletingSessionId(null); }
  }, [userId]);

  // ── Fetch task instruction ────────────────────────────────────────────
  const fetchTaskInstruction = useCallback(async (idx: number) => {
    const topic = TOPICS[idx];
    if (!topic || topic.isOnboarding) return;
    setLoadingInstruction(true); setTaskInstruction(null);
    try {
      const res = await fetch('/api/gh300-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          topicId: topic.id, topicLabel: topic.label, domain: topic.domain,
          completedTopics: TOPICS.slice(0, idx).map(t => t.id),
          communicationStrategy, learningStrategy,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setTaskInstruction(result as TaskInstruction);
        if (result?.subTaskTeaching?.[0]) speakTextRef.current(result.subTaskTeaching[0]);
      } else { throw new Error('API unavailable'); }
    } catch {
      const seeds = FALLBACK_SEEDS[topic.id] ?? [
        {
          teaching: `Let's explore ${topic.label} — a key topic in the GH-300 exam.`,
          question: `In your own words, describe what you already know about ${topic.label}. What questions do you have?`,
        },
      ];
      setTaskInstruction({
        headline: topic.label,
        context: `Domain ${topic.domain}: ${DOMAIN_META[topic.domain].shortLabel}`,
        subTasks: seeds.map(s => s.question),
        subTaskTeaching: seeds.map(s => s.teaching),
        examplePrompt: seeds[0].question,
      });
      if (seeds[0].teaching) speakTextRef.current(seeds[0].teaching);
    } finally { setLoadingInstruction(false); }
  }, [communicationStrategy, learningStrategy]);

  useEffect(() => {
    if (topicIndex > 0) fetchTaskInstruction(topicIndex);
    setTopicHasAnswer(false); setSubTaskIndex(0);
    setSubTaskCritique(null); setAiExplanation(null); setAnswer('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicIndex]);

  // ── Submit answer ─────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true); setErrorMsg(null); setAiExplanation(null); setSubTaskCritique(null);
    await ensureSession();

    const entry: QuizEntry = {
      id: makeId(), topicId: currentTopic?.id, subTaskIndex,
      subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
      subTaskTeaching: taskInstruction?.subTaskTeaching?.[subTaskIndex],
      userAnswer: answer.trim(), timestamp: new Date().toISOString(),
      action: topicHasAnswer ? 'iterate' : 'answer',
    };

    try {
      const res = await fetch('/api/gh300-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          mode: 'evaluate',
          topicId: currentTopic?.id, domain: currentTopic?.domain,
          subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
          subTaskTeaching: taskInstruction?.subTaskTeaching?.[subTaskIndex],
          userAnswer: answer.trim(),
          communicationStrategy, learningStrategy,
        }),
      });

      let explanation = '';
      if (res.ok) {
        const result = await res.json();
        explanation = result.explanation || result.feedback || '';
        if (result.feedback) {
          entry.aiCritique = result.feedback;
          entry.hasSuggestions = result.hasSuggestions;
          setSubTaskCritique({ hasSuggestions: !!result.hasSuggestions, feedback: result.feedback });
          if (!result.hasSuggestions) speakTextRef.current(result.feedback.substring(0, 200));
        }
        entry.aiExplanation = explanation;
        setAiExplanation(explanation || null);
      } else {
        explanation = 'Great effort! Your answer has been recorded. Keep reasoning through each concept in your own words — that is how real understanding forms. Move to the next question when you are ready.';
        setAiExplanation(explanation);
        setSubTaskCritique({ hasSuggestions: false, feedback: explanation });
      }

      const newHistory = [...answerHistory, entry];
      setAnswerHistory(newHistory); setTopicHasAnswer(true); setAnswer('');
      await persistSession(newHistory, topicIndex);
      if (voiceOutputEnabled && explanation) speakTextRef.current(explanation.substring(0, 180));

    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally { setIsSubmitting(false); }
  }, [answer, isSubmitting, currentTopic, taskInstruction, subTaskIndex, answerHistory,
      topicHasAnswer, communicationStrategy, learningStrategy, ensureSession, persistSession,
      topicIndex, voiceOutputEnabled]);

  // ── Critique / hint ───────────────────────────────────────────────────
  const handleCritique = useCallback(async () => {
    if (!answer.trim() || isCritiquing) return;
    setIsCritiquing(true);
    try {
      const res = await fetch('/api/gh300-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          mode: 'hint',
          topicId: currentTopic?.id, domain: currentTopic?.domain,
          subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
          userAnswer: answer.trim(),
          communicationStrategy, learningStrategy,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.hint) setSubTaskCritique({ hasSuggestions: true, feedback: d.hint });
      }
    } catch { /* ignore */ }
    finally { setIsCritiquing(false); }
  }, [answer, isCritiquing, currentTopic, taskInstruction, subTaskIndex, communicationStrategy, learningStrategy]);

  // ── Navigation ────────────────────────────────────────────────────────
  const handleMoveToNextSubTask = useCallback(() => {
    const maxSub = (taskInstruction?.subTasks?.length ?? 1) - 1;
    if (subTaskIndex < maxSub) {
      setSubTaskIndex(s => s + 1);
      setSubTaskCritique(null); setAiExplanation(null); setAnswer('');
      const nextTeaching = taskInstruction?.subTaskTeaching?.[subTaskIndex + 1];
      if (nextTeaching) speakTextRef.current(nextTeaching);
    }
  }, [subTaskIndex, taskInstruction]);

  const handleCompleteTopic = useCallback(async () => {
    if (topicIndex < TOPICS.length - 1) {
      const newIdx = topicIndex + 1;
      setTopicIndex(newIdx);
      await persistSession(answerHistory, newIdx);
    }
  }, [topicIndex, answerHistory, persistSession]);

  const handleJumpToTopic = useCallback((idx: number) => {
    setTopicIndex(idx);
  }, []);

  // ── Evaluate session ──────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    setShowEvaluation(true); setIsEvaluating(true); setEvalError(null);
    try {
      const res = await fetch('/api/gh300-evaluate-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          answerHistory: answerHistory.map(e => ({
            topicId: e.topicId, subTaskQuestion: e.subTaskQuestion,
            userAnswer: e.userAnswer, action: e.action,
          })),
          topicsCompleted: TOPICS.slice(0, topicIndex).map(t => t.id),
        }),
      });
      if (res.ok) setEvaluation(await res.json());
      else setEvalError('Could not generate evaluation. Your progress has still been saved.');
    } catch { setEvalError('Evaluation unavailable offline. Your answers have been saved.'); }
    finally { setIsEvaluating(false); }
  }, [answerHistory, topicIndex]);

  const handleCopyAnswer = useCallback(() => {
    if (aiExplanation) navigator.clipboard.writeText(aiExplanation);
  }, [aiExplanation]);

  // ── Derived state ─────────────────────────────────────────────────────
  const isOnboarding = currentTopic?.isOnboarding && currentTopic?.id === 'intro_gh300';
  const maxSubTask   = (taskInstruction?.subTasks?.length ?? 1) - 1;
  const progressPct  = Math.round((topicIndex / (TOPICS.length - 1)) * 100);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <Navbar />

      {/* Voice fallback */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      {/* Session picker */}
      {showSessionPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderOpen size={18} className="text-emerald-400" /> Your GH-300 Sessions
              </h2>
              <button onClick={() => setShowSessionPicker(false)} className="p-1 text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {sessions.map(s => (
                <button key={s.gh300_session_id} onClick={() => loadSession(s)}
                  className="w-full text-left p-3 bg-gray-700/40 hover:bg-gray-700 border border-gray-600 hover:border-emerald-500/40 rounded-xl transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.gh300_session_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Topic {(s.gh300_evaluation as any)?.topicIndex ?? 0}/{TOPICS.length} · {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <button
                      onClick={e => handleDeleteSession(e, s.gh300_session_id)}
                      disabled={deletingSessionId === s.gh300_session_id}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded transition-colors flex-shrink-0"
                    >
                      {deletingSessionId === s.gh300_session_id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 pb-4 flex-shrink-0">
              <button onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors">
                <Plus size={15} /> Start New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation modal */}
      {showEvaluation && (() => {
        const scoreColor = (s: number) => s >= 2.5 ? 'text-emerald-400' : s >= 1.5 ? 'text-amber-400' : 'text-red-400';
        const skillLabel = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart3 size={20} className="text-emerald-400" /> Session Evaluation
                </h2>
                <button onClick={() => setShowEvaluation(false)} className="p-1 text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isEvaluating && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 size={36} className="animate-spin text-emerald-400 mb-3" />
                    <p className="text-gray-300 font-medium">Evaluating your GH-300 readiness…</p>
                  </div>
                )}
                {evalError && !isEvaluating && (
                  <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}
                  </div>
                )}
                {evaluation && !isEvaluating && (
                  <>
                    {evaluation.overall_score_average !== undefined && (
                      <div className="flex items-center gap-3 p-4 bg-gray-700/60 rounded-xl border border-gray-600">
                        <Award size={28} className="text-amber-400" />
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-bold">Overall Readiness Score</p>
                          <p className={`text-3xl font-black ${scoreColor(evaluation.overall_score_average)}`}>
                            {Number(evaluation.overall_score_average).toFixed(1)}
                            <span className="text-base font-normal text-gray-500"> / 3.0</span>
                          </p>
                        </div>
                      </div>
                    )}
                    {evaluation.strengths_summary && (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase mb-2">💪 Strengths</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{evaluation.strengths_summary}</p>
                      </div>
                    )}
                    {evaluation.highest_leverage_improvements && (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-amber-400 uppercase mb-2">🎯 Focus Areas Before the Exam</p>
                        <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                          {evaluation.highest_leverage_improvements}
                        </p>
                      </div>
                    )}
                    {evaluation.exam_readiness && (
                      <div className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">🎓 Exam Readiness Assessment</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{evaluation.exam_readiness}</p>
                      </div>
                    )}
                    {evaluation.detailed_scores && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Domain Breakdown</p>
                        {Object.entries(
                          evaluation.detailed_scores as Record<string, { score: number; justification: string }>
                        ).map(([skill, data]) => (
                          <details key={skill} className="group border border-gray-700 rounded-lg overflow-hidden">
                            <summary className="flex items-center gap-3 px-3 py-2 bg-gray-700/30 hover:bg-gray-700/50 cursor-pointer list-none">
                              <span className={`text-sm font-black w-5 text-right flex-shrink-0 ${scoreColor(data.score)}`}>
                                {data.score}
                              </span>
                              <span className="text-[11px] text-gray-300 flex-1">{skillLabel(skill)}</span>
                              <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
                                <div
                                  className={`h-full rounded-full ${data.score >= 2 ? 'bg-emerald-500' : data.score >= 1 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${(data.score / 3) * 100}%` }}
                                />
                              </div>
                            </summary>
                            <div className="px-3 py-2 bg-gray-800/50 text-[11px] text-gray-400 leading-relaxed">
                              {data.justification}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Main layout ═══ */}
      <main className="flex flex-1 min-h-0 overflow-hidden">

        {/* ─── LEFT: Topic list + session controls ─── */}
        <div className="w-56 flex-shrink-0 bg-gray-800/60 border-r border-gray-700 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-3 py-2.5 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <GitBranch size={14} className="text-emerald-400" />
              <span className="text-xs font-bold text-white truncate">GH-300 Prep</span>
              <button
                onClick={() => setVoiceOutputEnabled(v => !v)}
                title="Toggle voice"
                className={`ml-auto p-1 rounded transition-colors ${voiceOutputEnabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-gray-600 hover:text-gray-400'}`}
              >
                {voiceOutputEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              </button>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-[9px] text-gray-500">{progressPct}% complete · {topicIndex}/{TOPICS.length} topics</p>
          </div>

          {/* Topic stepper */}
          <div className="flex-1 overflow-hidden">
            <TopicStepper topics={TOPICS} topicIndex={topicIndex} onJump={handleJumpToTopic} />
          </div>

          {/* Session controls */}
          <div className="px-3 py-3 border-t border-gray-700 space-y-1.5 flex-shrink-0">
            <button
              onClick={() => setShowSessionPicker(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
            >
              <FolderOpen size={11} /> Sessions
            </button>
            <button
              onClick={handleEvaluate}
              disabled={answerHistory.length < 3}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <BarChart3 size={11} /> Evaluate Readiness
            </button>
          </div>
        </div>

        {/* ─── RIGHT: Instruction + answer panel ─── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ─── CONTENT panel ─── */}
          <div className="w-80 flex-shrink-0 border-r border-gray-700 flex flex-col overflow-hidden bg-gray-800/40">

            {/* Domain badge */}
            {!isOnboarding && currentTopic && (
              <div className={`flex items-center gap-2 px-4 py-2 ${dm.bg} border-b ${dm.border} flex-shrink-0`}>
                <span className={dm.color}>{dm.icon}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${dm.color}`}>{dm.label}</span>
                {currentTopic.weight && (
                  <span className="ml-auto text-[10px] text-gray-500">{currentTopic.weight}</span>
                )}
              </div>
            )}

            {/* Onboarding or instruction content */}
            {isOnboarding ? (
              <GH300Onboarding onComplete={handleCompleteTopic} />
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Topic headline */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                    Topic {topicIndex}/{TOPICS.length - 1}
                  </p>
                  <h2 className="text-sm font-bold text-white">{currentTopic?.label}</h2>
                </div>

                {/* Loading */}
                {loadingInstruction && (
                  <div className="flex items-center gap-2 p-3 bg-gray-800/60 rounded-xl">
                    <Loader2 size={14} className="animate-spin text-emerald-400" />
                    <span className="text-xs text-gray-400">Loading topic…</span>
                  </div>
                )}

                {/* Teaching moment */}
                {taskInstruction && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase mb-1.5 flex items-center gap-1">
                      <BookOpen size={10} /> Teaching Point {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                    </p>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {taskInstruction.subTaskTeaching?.[subTaskIndex]}
                    </p>
                  </div>
                )}

                {/* Key tools reference */}
                {currentTopic && <ToolReferencePanel topic={currentTopic} />}

                {/* Exam tip */}
                {currentTopic && <ExamTipCard topicId={currentTopic.id} />}

                {/* Answer history for this topic */}
                {answerHistory.filter(e => e.topicId === currentTopic?.id).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Your Answers — This Topic</p>
                    {answerHistory
                      .filter(e => e.topicId === currentTopic?.id)
                      .slice(-3)
                      .map((entry, i) => (
                        <div key={entry.id} className="p-2 bg-gray-800/50 border border-gray-700 rounded-lg">
                          <p className="text-[9px] text-gray-600 uppercase mb-0.5">Q{i + 1}</p>
                          <p className="text-[11px] text-gray-300 truncate">{entry.userAnswer.slice(0, 80)}…</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── ANSWER panel ─── */}
          {!isOnboarding && (
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Question display */}
              <div className="flex-shrink-0 px-5 py-4 border-b border-gray-700 bg-gray-800/30">
                {loadingInstruction ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-emerald-400" />
                    <span className="text-xs text-gray-500">Loading question…</span>
                  </div>
                ) : taskInstruction ? (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">
                      Question {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                    </p>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {taskInstruction.subTasks[subTaskIndex]}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Select a topic from the left panel to begin.</p>
                )}
              </div>

              {/* Scrollable middle: feedback + answer box */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

                {/* AI explanation after submission */}
                {aiExplanation && (
                  <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                        <Brain size={10} /> AI Coach Response
                      </p>
                      <button onClick={handleCopyAnswer} className="text-gray-600 hover:text-gray-300 transition-colors">
                        <Copy size={11} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{aiExplanation}</p>
                  </div>
                )}

                {/* Sub-task critique */}
                {subTaskCritique && !aiExplanation && (
                  <div className={`p-3 rounded-xl border ${subTaskCritique.hasSuggestions ? 'bg-amber-500/10 border-amber-500/25' : 'bg-emerald-500/10 border-emerald-500/25'}`}>
                    <p className={`text-[10px] font-bold uppercase mb-1.5 ${subTaskCritique.hasSuggestions ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {subTaskCritique.hasSuggestions ? '💡 Coaching Feedback' : '✅ Strong Answer'}
                    </p>
                    <p className="text-xs text-gray-300 leading-relaxed">{subTaskCritique.feedback}</p>
                    {subTaskCritique.hasSuggestions && (
                      <p className="text-[10px] text-gray-500 italic mt-1.5">Refine your answer, or move on when ready.</p>
                    )}
                  </div>
                )}

                {/* Error */}
                {errorMsg && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                    <AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" />
                    <p className="text-xs text-red-300">{errorMsg}</p>
                  </div>
                )}

                {/* Answer textarea */}
                <div>
                  <textarea
                    ref={answerRef}
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
                    placeholder="Type your answer here…"
                    style={{ minHeight: '140px' }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-emerald-500 transition-colors leading-relaxed"
                  />
                  <p className="text-[9px] text-gray-700 mt-1">Ctrl+Enter to submit</p>
                </div>
              </div>

              {/* Fixed bottom buttons */}
              <div className="flex-shrink-0 px-5 pb-5 space-y-2">
                <div className="flex gap-2">
                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !answer.trim() || !taskInstruction}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors disabled:opacity-40"
                  >
                    {isSubmitting
                      ? <><Loader2 size={15} className="animate-spin" /><span className="text-sm">Evaluating…</span></>
                      : <ArrowUpCircle size={18} />}
                  </button>
                  {/* Hint */}
                  <button
                    onClick={handleCritique}
                    disabled={isCritiquing || !answer.trim()}
                    title="Get a hint before submitting"
                    className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors disabled:opacity-40"
                  >
                    {isCritiquing ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                  </button>
                </div>

                {/* Next question within topic */}
                {topicHasAnswer && subTaskIndex < maxSubTask && (
                  <button
                    onClick={handleMoveToNextSubTask}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition-all"
                  >
                    <SkipForward size={13} /> Next Question
                  </button>
                )}

                {/* Complete topic */}
                {topicHasAnswer && subTaskIndex >= maxSubTask && (!subTaskCritique || !subTaskCritique.hasSuggestions) && topicIndex < TOPICS.length - 1 && (
                  <button
                    onClick={handleCompleteTopic}
                    className={`w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border transition-all ${dm.bg} ${dm.color} ${dm.border} hover:opacity-90`}
                  >
                    <CheckCircle size={13} /> Complete Topic & Continue <ArrowRight size={13} />
                  </button>
                )}

                {/* Continue anyway */}
                {topicHasAnswer && subTaskIndex >= maxSubTask && subTaskCritique?.hasSuggestions && topicIndex < TOPICS.length - 1 && (
                  <button
                    onClick={handleCompleteTopic}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-all"
                  >
                    <CheckCircle size={13} /> Continue anyway <ArrowRight size={13} />
                  </button>
                )}

                {/* Finished all topics */}
                {topicIndex >= TOPICS.length - 1 && topicHasAnswer && (
                  <button
                    onClick={handleEvaluate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white transition-all"
                  >
                    <Award size={15} /> Get Exam Readiness Report
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MicrosoftGH300Page;