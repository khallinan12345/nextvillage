#!/usr/bin/env node
// scripts/security/security-check.mjs
//
// Advisory security check. Never blocks: it always exits 0.
//
//   npm run security-check                 changed files vs origin/main (plus uncommitted work)
//   npm run security-check -- --all        every file (a full review of the repo)
//   npm run security-check -- --open       also open the HTML report in your browser (macOS)
//   npm run security-check -- --audit      also count known-vulnerable npm packages
//   --base <ref>      compare against another branch (default origin/main, or $BASE_REF)
//   --sarif <file>    write SARIF (used in CI to feed GitHub's private Security tab)
//   --summary <file>  write a short counts-only markdown summary (safe to show publicly)
//   --out <dir>       where the HTML/JSON report goes (default security-report/, git-ignored)
//
// The rules live in rules.mjs.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RULES, SEVERITY, checkFile } from './rules.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

const all = flag('--all');
const base = opt('--base', process.env.BASE_REF || 'origin/main');
const outDir = opt('--out', 'security-report');

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const lines = (s) => s.split('\n').filter(Boolean);

// ── Which files ───────────────────────────────────────────────────────────────

let files;
let knownHosts = null;
if (all) {
  files = lines(git('ls-files'));
} else {
  const set = new Set();
  try {
    lines(git('diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`)).forEach((f) => set.add(f));
  } catch {
    console.error(`(Could not compare with ${base}; checking uncommitted work only.)`);
  }
  lines(git('diff', '--name-only', '--diff-filter=ACMR', 'HEAD')).forEach((f) => set.add(f));
  lines(git('ls-files', '--others', '--exclude-standard')).forEach((f) => set.add(f));
  files = [...set];
  try {
    const grep = spawnSync('git', ['grep', '-hoiE', 'https?://[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}', base, '--', 'api', 'src', 'lib'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    knownHosts = new Set(lines(grep.stdout || '').map((u) => u.replace(/^https?:\/\//i, '').toLowerCase()));
  } catch {
    knownHosts = null;
  }
}

// ── Run the rules ─────────────────────────────────────────────────────────────

// Whole-history audits read all migrations together, because later ones fix earlier ones.
const corpus = all
  ? files.filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f)).sort().map((f) => readFileSync(f, 'utf8')).join('\n')
  : null;

// Which migration defines each function last (older definitions are superseded and not worth reporting).
const latestDefinition = new Map();
if (all) {
  for (const f of files.filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f)).sort()) {
    for (const m of readFileSync(f, 'utf8').matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)/gi))
      latestDefinition.set(m[1].replace(/["`]/g, '').replace(/^public\./i, '').toLowerCase(), f);
  }
}

const findings = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  findings.push(...checkFile(file, text, { knownHosts: knownHosts ? new Set(knownHosts) : null, corpus, checkGrants: !all, latestDefinition: all ? latestDefinition : null }));
}
findings.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || a.file.localeCompare(b.file) || a.line - b.line);

// ── npm audit (optional) ──────────────────────────────────────────────────────

let audit = null;
if (flag('--audit')) {
  const r = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try {
    const v = JSON.parse(r.stdout).metadata?.vulnerabilities || {};
    audit = { critical: v.critical || 0, high: v.high || 0, moderate: v.moderate || 0, low: v.low || 0 };
  } catch {
    audit = { error: 'npm audit could not be read' };
  }
}

const counts = { high: 0, medium: 0, low: 0 };
findings.forEach((f) => counts[f.severity]++);

// ── Console ───────────────────────────────────────────────────────────────────

const scope = all ? 'the whole repo' : `${files.length} changed file${files.length === 1 ? '' : 's'} vs ${base}`;
console.log(`\nSecurity advisor: checked ${scope}`);
if (!findings.length) console.log('  No findings.');
for (const f of findings) {
  console.log(`  [${f.severity.toUpperCase()}] ${f.title}\n      ${f.file}:${f.line}  ${f.detail}`);
}
if (audit) console.log(audit.error ? `  npm audit: ${audit.error}` : `  npm audit: ${audit.critical} critical, ${audit.high} high, ${audit.moderate} moderate, ${audit.low} low`);
console.log('  (Advisory only; nothing is blocked.)\n');

// ── Outputs ───────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString();
writeFileSync(join(outDir, 'report.json'), JSON.stringify({ stamp, scope, counts, audit, findings }, null, 2));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const byRule = {};
findings.forEach((f) => (byRule[f.rule] ??= []).push(f));
const sections = Object.entries(byRule)
  .map(
    ([id, list]) => `<section class="sev-${RULES[id].severity}">
  <h2><span class="pill">${RULES[id].severity}</span> ${esc(RULES[id].title)} <small>(${list.length})</small></h2>
  <p><b>Why it matters.</b> ${esc(RULES[id].why)}</p>
  <p><b>What to do.</b> ${esc(RULES[id].fix)}</p>
  <ul>${list.map((f) => `<li><code>${esc(f.file)}:${f.line}</code> ${esc(f.detail)}</li>`).join('')}</ul>
  <p class="mute">If this one is deliberate, add a comment <code>security-check: ignore ${esc(id)} -- reason</code> in the file.</p>
</section>`,
  )
  .join('\n');
writeFileSync(
  join(outDir, 'report.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Security advisor report</title>
<style>
:root{--bg:#fff;--fg:#1c2530;--mute:#5b6775;--card:#f5f7fa;--line:#dde3ea;--high:#b42318;--medium:#b54708;--low:#175cd3}
@media(prefers-color-scheme:dark){:root{--bg:#10151b;--fg:#e6ebf1;--mute:#9aa7b5;--card:#18202a;--line:#2a3541;--high:#ff8a80;--medium:#ffb74d;--low:#82b1ff}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:860px;margin:auto}
h1{font-size:1.5rem;margin:.2em 0}h2{font-size:1.1rem;margin:.2em 0}
.mute,.meta{color:var(--mute);font-size:.9rem}
.tiles{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 16px;min-width:90px}
.tile b{font-size:1.6rem;display:block}
section{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--low);border-radius:10px;padding:12px 16px;margin:14px 0}
section.sev-high{border-left-color:var(--high)}section.sev-medium{border-left-color:var(--medium)}
.pill{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;border:1px solid currentColor;border-radius:99px;padding:1px 8px}
.sev-high .pill{color:var(--high)}.sev-medium .pill{color:var(--medium)}.sev-low .pill{color:var(--low)}
code{font-size:.85rem;word-break:break-all}li{margin:4px 0}
@media print{body{background:#fff;color:#000}section{break-inside:avoid}}
</style></head><body><main>
<h1>Security advisor report</h1>
<p class="meta">Checked ${esc(scope)} · ${esc(stamp)} · advisory only, nothing is blocked</p>
<div class="tiles"><div class="tile"><b>${counts.high}</b>high</div><div class="tile"><b>${counts.medium}</b>medium</div><div class="tile"><b>${counts.low}</b>low</div>${
    audit && !audit.error
      ? `<div class="tile"><b>${audit.critical + audit.high}</b>critical/high npm packages</div>`
      : ''
  }</div>
${sections || '<p>No findings. Nice.</p>'}
<p class="mute">These are pattern checks, so they can miss things and can flag things that are fine. A finding means a person should look, not that something is broken. To save as PDF: print this page and choose Save as PDF.</p>
</main></body></html>`,
);

if (opt('--summary')) {
  const total = findings.length;
  writeFileSync(
    opt('--summary'),
    [
      '### Security advisor (advisory, not blocking)',
      total
        ? `${total} item${total === 1 ? '' : 's'} to look at: ${counts.high} high, ${counts.medium} medium, ${counts.low} low. Details are in the repository's Security tab (code scanning) for people with access, or run \`npm run security-check\` locally.`
        : 'Nothing to look at in the changed files.',
      audit && !audit.error ? `\nnpm audit: ${audit.critical} critical, ${audit.high} high, ${audit.moderate} moderate, ${audit.low} low.` : '',
      '',
    ].join('\n'),
  );
}

if (opt('--sarif')) {
  const level = { high: 'error', medium: 'warning', low: 'note' };
  writeFileSync(
    opt('--sarif'),
    JSON.stringify(
      {
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
        runs: [
          {
            tool: {
              driver: {
                name: 'NextVillage security advisor',
                rules: Object.entries(RULES).map(([id, r]) => ({
                  id,
                  shortDescription: { text: r.title },
                  fullDescription: { text: `${r.why} ${r.fix}` },
                  defaultConfiguration: { level: level[r.severity] },
                  properties: { 'security-severity': { high: '8.0', medium: '5.0', low: '3.0' }[r.severity] },
                })),
              },
            },
            results: findings.map((f) => ({
              ruleId: f.rule,
              level: level[f.severity],
              message: { text: `${f.title}: ${f.detail}. ${f.fix}` },
              locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }],
            })),
          },
        ],
      },
      null,
      2,
    ),
  );
}

console.log(`Report: ${join(outDir, 'report.html')}`);
if (flag('--open') && process.platform === 'darwin') spawnSync('open', [join(outDir, 'report.html')]);
process.exit(0); // advisory: never fails a build
