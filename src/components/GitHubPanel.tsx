// src/components/GitHubPanel.tsx
// GitHub Personal Access Token integration for the Full-Stack deploy task.
// Allows learners to create a GitHub repo and push all project files
// directly from the platform without any server-side OAuth flow.

import React, { useState, useCallback } from 'react';
import {
  Github, Key, Plus, ExternalLink, CheckCircle, Loader2,
  AlertCircle, Copy, Check, Eye, EyeOff, ChevronDown, ChevronRight,
  GitBranch, Upload, Globe,
} from 'lucide-react';

interface ProjectFile { path: string; content: string; }

interface GitHubPanelProps {
  projectFiles: ProjectFile[];
  sessionName: string;
}

type Step = 'token' | 'repo' | 'push' | 'done';

interface RepoInfo {
  name: string;
  url: string;
  cloneUrl: string;
}

// ── GitHub API helpers ────────────────────────────────────────────────────────

async function ghFetch(path: string, token: string, method = 'GET', body?: any) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API error ${res.status}`);
  return data;
}

function toBase64(str: string): string {
  // Handle Unicode content correctly
  return btoa(unescape(encodeURIComponent(str)));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100) || 'my-fullstack-app';
}

// ── Component ─────────────────────────────────────────────────────────────────

const GitHubPanel: React.FC<GitHubPanelProps> = ({ projectFiles, sessionName }) => {
  const [step, setStep]                   = useState<Step>('token');
  const [token, setToken]                 = useState('');
  const [showToken, setShowToken]         = useState(false);
  const [tokenValid, setTokenValid]       = useState<boolean | null>(null);
  const [githubUser, setGithubUser]       = useState<string | null>(null);
  const [validating, setValidating]       = useState(false);

  const [repoName, setRepoName]           = useState(slugify(sessionName));
  const [repoDesc, setRepoDesc]           = useState('Built with the Girls AIing and Vibing full-stack platform');
  const [repoPrivate, setRepoPrivate]     = useState(false);
  const [creating, setCreating]           = useState(false);
  const [repo, setRepo]                   = useState<RepoInfo | null>(null);

  const [pushing, setPushing]             = useState(false);
  const [pushProgress, setPushProgress]   = useState<string[]>([]);
  const [pushError, setPushError]         = useState<string | null>(null);

  const [copied, setCopied]               = useState<string | null>(null);
  const [guideOpen, setGuideOpen]         = useState(false);

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  // ── Step 1: Validate PAT ──────────────────────────────────────────────────
  const validateToken = useCallback(async () => {
    if (!token.trim()) return;
    setValidating(true); setTokenValid(null);
    try {
      const user = await ghFetch('/user', token);
      setGithubUser(user.login);
      setTokenValid(true);
      setStep('repo');
    } catch (err: any) {
      setTokenValid(false);
    } finally { setValidating(false); }
  }, [token]);

  // ── Step 2: Create repo ───────────────────────────────────────────────────
  const createRepo = useCallback(async () => {
    if (!token || !repoName) return;
    setCreating(true);
    try {
      const data = await ghFetch('/user/repos', token, 'POST', {
        name: repoName,
        description: repoDesc,
        private: repoPrivate,
        auto_init: false,
      });
      setRepo({ name: data.name, url: data.html_url, cloneUrl: data.clone_url });
      setStep('push');
    } catch (err: any) {
      alert(`Could not create repo: ${err.message}`);
    } finally { setCreating(false); }
  }, [token, repoName, repoDesc, repoPrivate]);

  // ── Step 3: Push files ────────────────────────────────────────────────────
  const pushFiles = useCallback(async () => {
    if (!token || !repo || !githubUser) return;
    setPushing(true); setPushError(null); setPushProgress([]);

    const log = (msg: string) => setPushProgress(prev => [...prev, msg]);

    try {
      // 1. Create initial commit with README to initialise the repo
      log('Initialising repository...');
      await ghFetch(`/repos/${githubUser}/${repo.name}/contents/README.md`, token, 'PUT', {
        message: 'Initial commit — project scaffold',
        content: toBase64(`# ${sessionName}\n\nBuilt with the Girls AIing and Vibing full-stack platform.\n`),
      });

      // 2. Push each project file
      const files = projectFiles.filter(f => f.content && f.content.length > 0);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        log(`Uploading ${file.path} (${i + 1}/${files.length})...`);
        try {
          await ghFetch(`/repos/${githubUser}/${repo.name}/contents/${file.path}`, token, 'PUT', {
            message: `Add ${file.path}`,
            content: toBase64(file.content),
          });
        } catch (fileErr: any) {
          log(`  ⚠ Skipped ${file.path}: ${fileErr.message}`);
        }
      }

      log('✅ All files pushed successfully!');
      setStep('done');
    } catch (err: any) {
      setPushError(err.message);
      log(`❌ Error: ${err.message}`);
    } finally { setPushing(false); }
  }, [token, repo, githubUser, projectFiles, sessionName]);

  // ── Render ────────────────────────────────────────────────────────────────

  const stepDot = (s: Step, label: string, num: number) => {
    const isActive = step === s;
    const isDone = (
      (s === 'token' && ['repo', 'push', 'done'].includes(step)) ||
      (s === 'repo'  && ['push', 'done'].includes(step)) ||
      (s === 'push'  && step === 'done')
    );
    return (
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
          isDone ? 'bg-emerald-500 text-white' :
          isActive ? 'bg-purple-500 text-white' :
          'bg-gray-700 text-gray-500'
        }`}>
          {isDone ? <CheckCircle size={13} /> : num}
        </div>
        <span className={`text-xs font-semibold ${isActive ? 'text-white' : isDone ? 'text-emerald-400' : 'text-gray-600'}`}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#0d1117' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <Github size={20} className="text-white" />
        <div>
          <p className="text-sm font-bold text-white">Push to GitHub</p>
          <p className="text-[11px] text-gray-500">Create a repo and push your project files</p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-800 flex-shrink-0">
        {stepDot('token', 'Connect', 1)}
        <div className="flex-1 h-px bg-gray-800" />
        {stepDot('repo', 'Create Repo', 2)}
        <div className="flex-1 h-px bg-gray-800" />
        {stepDot('push', 'Push Files', 3)}
        <div className="flex-1 h-px bg-gray-800" />
        {stepDot('done', 'Done', 4)}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 stack-y-5">

        {/* ── How to get a PAT guide ── */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <button
            onClick={() => setGuideOpen(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors">
            <div className="flex items-center gap-2">
              <Key size={13} className="text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">How to get a GitHub token</span>
            </div>
            {guideOpen ? <ChevronDown size={13} className="text-gray-600" /> : <ChevronRight size={13} className="text-gray-600" />}
          </button>
          {guideOpen && (
            <div className="px-4 py-4 stack-y-3 border-t border-gray-800 bg-gray-950">
              {[
                { n: 1, text: 'Go to github.com and sign in (or create a free account)', link: 'https://github.com' },
                { n: 2, text: 'Click your profile photo → Settings → Developer settings (bottom of left sidebar)', link: 'https://github.com/settings/apps' },
                { n: 3, text: 'Click Personal access tokens → Tokens (classic) → Generate new token (classic)', link: 'https://github.com/settings/tokens/new' },
                { n: 4, text: 'Give it a name like "vAI Platform". Set expiration to 90 days. Check the "repo" scope (full control of repositories). Scroll down and click Generate token.', link: null },
                { n: 5, text: 'Copy the token immediately — GitHub only shows it once. Paste it below.', link: null },
              ].map(({ n, text, link }) => (
                <div key={n} className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-gray-800 text-gray-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-[10px] text-blue-400 hover:text-blue-300">
                        <ExternalLink size={10} /> {link}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Step 1: Token ── */}
        <div className={`rounded-xl border overflow-hidden transition-colors ${step === 'token' ? 'border-purple-500/40' : 'border-gray-800'}`}>
          <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Step 1 — Connect GitHub</p>
          </div>
          <div className="px-4 py-4 stack-y-3">
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => { setToken(e.target.value); setTokenValid(null); }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-hidden focus:border-purple-500 pr-10 font-mono"
              />
              <button onClick={() => setShowToken(p => !p)}
                className="absolute right-3 top-2.5 text-gray-600 hover:text-gray-400">
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {tokenValid === false && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle size={11} /> Invalid token — check it and try again
              </p>
            )}
            {tokenValid === true && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle size={11} /> Connected as @{githubUser}
              </p>
            )}
            <button onClick={validateToken} disabled={validating || !token.trim() || tokenValid === true}
              className="w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
              style={{ background: '#6e40c9', color: 'white' }}>
              {validating ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" /> Verifying...</span> : tokenValid === true ? '✓ Connected' : 'Connect to GitHub'}
            </button>
          </div>
        </div>

        {/* ── Step 2: Create repo ── */}
        {(step === 'repo' || step === 'push' || step === 'done') && (
          <div className={`rounded-xl border overflow-hidden transition-colors ${step === 'repo' ? 'border-purple-500/40' : 'border-gray-800'}`}>
            <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Step 2 — Create Repository</p>
            </div>
            <div className="px-4 py-4 stack-y-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Repository name</label>
                <input
                  type="text" value={repoName}
                  onChange={e => setRepoName(slugify(e.target.value))}
                  disabled={step !== 'repo'}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-purple-500 disabled:opacity-50"
                />
                <p className="text-[9px] text-gray-600 mt-1">github.com/{githubUser}/{repoName}</p>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Description (optional)</label>
                <input
                  type="text" value={repoDesc}
                  onChange={e => setRepoDesc(e.target.value)}
                  disabled={step !== 'repo'}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-hidden focus:border-purple-500 disabled:opacity-50"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={repoPrivate} onChange={e => setRepoPrivate(e.target.checked)}
                  disabled={step !== 'repo'}
                  className="rounded-sm border-gray-600 bg-gray-800 text-purple-500" />
                <span className="text-xs text-gray-400">Private repository</span>
              </label>
              {step === 'repo' && (
                <button onClick={createRepo} disabled={creating || !repoName}
                  className="w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: '#6e40c9', color: 'white' }}>
                  {creating ? <><Loader2 size={13} className="animate-spin" /> Creating...</> : <><Plus size={13} /> Create Repository</>}
                </button>
              )}
              {repo && (
                <a href={repo.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-emerald-400 hover:text-emerald-300">
                  <CheckCircle size={12} /> {repo.url}
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Push files ── */}
        {(step === 'push' || step === 'done') && (
          <div className={`rounded-xl border overflow-hidden transition-colors ${step === 'push' ? 'border-purple-500/40' : 'border-gray-800'}`}>
            <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Step 3 — Push Project Files</p>
            </div>
            <div className="px-4 py-4 stack-y-3">
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Files to push ({projectFiles.filter(f => f.content).length})</p>
                <div className="stack-y-0.5 max-h-32 overflow-y-auto">
                  {projectFiles.filter(f => f.content).map(f => (
                    <div key={f.path} className="flex items-center gap-2 text-[10px] text-gray-400">
                      <GitBranch size={9} className="text-gray-700 flex-shrink-0" />
                      {f.path}
                    </div>
                  ))}
                </div>
              </div>

              {pushProgress.length > 0 && (
                <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 max-h-40 overflow-y-auto">
                  {pushProgress.map((msg, i) => (
                    <p key={i} className={`text-[10px] font-mono ${msg.startsWith('✅') ? 'text-emerald-400' : msg.startsWith('❌') ? 'text-red-400' : msg.startsWith('⚠') ? 'text-amber-400' : 'text-gray-400'}`}>
                      {msg}
                    </p>
                  ))}
                  {pushing && <p className="text-[10px] text-gray-600 animate-pulse">...</p>}
                </div>
              )}

              {pushError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle size={11} /> {pushError}
                </p>
              )}

              {step === 'push' && (
                <button onClick={pushFiles} disabled={pushing}
                  className="w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: '#6e40c9', color: 'white' }}>
                  {pushing ? <><Loader2 size={13} className="animate-spin" /> Pushing files...</> : <><Upload size={13} /> Push to GitHub</>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 4: Done — Vercel deploy ── */}
        {step === 'done' && repo && (
          <div className="rounded-xl border border-emerald-500/30 overflow-hidden">
            <div className="px-4 py-3 bg-emerald-500/10 border-b border-emerald-500/20">
              <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">🎉 Code is on GitHub — Deploy to Vercel</p>
            </div>
            <div className="px-4 py-4 stack-y-4">

              {/* Repo URL */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Your repository</p>
                <div className="flex items-center gap-2">
                  <a href={repo.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-xs text-blue-400 hover:text-blue-300 truncate flex items-center gap-1">
                    <Github size={11} /> {repo.url}
                  </a>
                  <button onClick={() => copyText(repo.url, 'repoUrl')} className="text-gray-600 hover:text-gray-400">
                    {copied === 'repoUrl' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              {/* Vercel deploy steps */}
              <div className="stack-y-2">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Deploy to Vercel (3 steps)</p>
                {[
                  { n: 1, text: 'Go to vercel.com and sign in with GitHub', link: 'https://vercel.com/new' },
                  { n: 2, text: `Click "Add New Project" → Import ${repo.name} from GitHub`, link: null },
                  { n: 3, text: 'Add environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY → Click Deploy', link: null },
                ].map(({ n, text, link }) => (
                  <div key={n} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-gray-800 text-gray-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-[10px] text-blue-400 hover:text-blue-300">
                          <ExternalLink size={10} /> {link}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Vercel import link */}
              <a
                href={`https://vercel.com/new/clone?repository-url=${encodeURIComponent(repo.url)}`}
                target="_blank" rel="noopener noreferrer"
                className="w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors hover:opacity-90"
                style={{ background: '#000', color: 'white', border: '1px solid #333' }}>
                <Globe size={14} /> Deploy to Vercel →
              </a>

              {/* git clone command */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Or clone locally</p>
                <div className="flex items-center gap-2 bg-gray-950 rounded-lg px-3 py-2 border border-gray-800">
                  <code className="text-[10px] text-green-400 flex-1 font-mono truncate">
                    git clone {repo.cloneUrl}
                  </code>
                  <button onClick={() => copyText(`git clone ${repo.cloneUrl}`, 'clone')} className="text-gray-600 hover:text-gray-400 flex-shrink-0">
                    {copied === 'clone' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default GitHubPanel;
