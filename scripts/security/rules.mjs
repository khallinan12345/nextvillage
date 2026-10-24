// scripts/security/rules.mjs
//
// Advisory security rules for the NextVillage repo. Each rule looks at ONE file's text and returns
// findings; nothing here blocks anything. Run through scripts/security/security-check.mjs
// (`npm run security-check`), which also runs in CI as a non-blocking advisor on pull requests.
//
// These are deliberately simple pattern checks written for this codebase's known mistakes. They will
// miss things and occasionally flag something fine. A finding means "a person should look at this",
// not "this is broken". To silence a finding that is deliberate, put a comment on the line above or in
// the file:   security-check: ignore <rule-id> -- <why>

export const SEVERITY = { high: 3, medium: 2, low: 1 };

export const RULES = {
  'db-no-rls': {
    severity: 'high',
    title: 'New table without row-level security',
    why: 'Without RLS, anyone with the public API key can read or write every row of the table.',
    fix: 'Add: ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY; and policies (or none, for server-only tables).',
  },
  'db-default-grants': {
    severity: 'medium',
    title: 'New table/view/function not revoked from anon and authenticated',
    why: 'Supabase grants anon and authenticated on every new object automatically. REVOKE FROM PUBLIC is not enough.',
    fix: 'Add: REVOKE ALL ON <object> FROM anon, authenticated; then GRANT back only what the app needs.',
  },
  'db-definer-search-path': {
    severity: 'high',
    title: 'SECURITY DEFINER function without a fixed search_path',
    why: 'A definer function runs with its owner\'s rights; without SET search_path a caller can shadow objects it uses.',
    fix: 'Add: SET search_path = public, pg_temp to the function definition.',
  },
  'db-definer-no-caller-check': {
    severity: 'medium',
    title: 'SECURITY DEFINER function that never checks who is asking',
    why: 'A definer function bypasses row-level security. New ones must verify auth.uid() and the caller\'s role inside.',
    fix: 'Check auth.uid() (or a helper that does) before returning or changing anything. If it is deliberately public, say why in a comment.',
  },
  'ai-temperature-claude': {
    severity: 'medium',
    title: 'temperature sent to a Claude call',
    why: 'Claude Sonnet 5.5 and newer models reject any temperature with a 400 error, which fails the whole request.',
    fix: 'Send temperature only behind the modelAllowsCustomTemperature(model) gate used in api/chat.js.',
  },
  'api-no-auth': {
    severity: 'high',
    title: 'API route with no sign-in or secret check',
    why: 'Anyone on the internet can call it. Routes using the service-role key bypass row-level security entirely.',
    fix: 'Use requireUser / getRequestUser from api/_lib/requireUser.js, or check CRON_SECRET / a webhook secret. If the route is deliberately public, document why in its header comment and add the ignore comment.',
  },
  'api-trusts-body-id': {
    severity: 'high',
    title: 'User id taken from the request body or query',
    why: 'Anyone can type any id. Acting on it without comparing to the signed-in user lets one user act as another.',
    fix: 'Derive the user from the Authorization header (api/_lib/requireUser.js) and ignore any id in the body.',
  },
  'secret-in-browser': {
    severity: 'high',
    title: 'Server secret reachable from browser code',
    why: 'Anything in src/ or a VITE_ variable is shipped to every visitor.',
    fix: 'Keep service-role keys and secrets in api/ or edge functions only; the browser gets the public anon key.',
  },
  'log-student-content': {
    severity: 'medium',
    title: 'Request content written to logs',
    why: 'Logs are kept for months and read by more people than the database is. Student messages must not end up there.',
    fix: 'Log ids and counts, never message text, prompts or request bodies.',
  },
  'code-exec-outside-sandbox': {
    severity: 'high',
    title: 'Code run on our own server instead of the E2B sandbox',
    why: 'eval, new Function, child_process and Node\'s vm module are not sandboxes. Learner-written code that reaches them can take over the server, steal keys or attack other learners.',
    fix: 'Run learner code only through E2B (api/execute-code.ts). There must be no local fallback, even for testing.',
  },
  'iframe-no-sandbox': {
    severity: 'high',
    title: 'Embedded page that can run learner code without a safe sandbox',
    why: 'An iframe showing learner-written HTML without sandbox="allow-scripts" (or with allow-same-origin added) can reach the signed-in session of whoever opens it.',
    fix: 'Use sandbox="allow-scripts" and never add allow-same-origin to it.',
  },
  'pii-column-datamap': {
    severity: 'low',
    title: 'New column that looks like personal data',
    why: 'Anything that holds personal information about people must be in the data map and covered by the retention rules before it ships.',
    fix: 'Add it to the data map (kept in the private working-documents repo) and say so in the PR. If already done: add the ignore comment.',
  },
  'chat-table-no-safety': {
    severity: 'low',
    title: 'New message or chat table with no safety check',
    why: 'Peer messages between children need the automatic safety flags that Together Room has. AI-only chats are different, so this is a prompt to confirm which this is.',
    fix: 'If people write to each other here, add a safety trigger like together_messages_safety_check. If it is AI-only, add the ignore comment.',
  },
  'public-sensitive-doc': {
    severity: 'medium',
    title: 'Working document with real numbers in the public repository',
    why: 'Row counts and table inventories about children tell an attacker where the data is and how much. This repository is public and git keeps history.',
    fix: 'Keep working documents (data map, DPIA, reviews) in the private repository, or remove the numbers.',
  },
  'new-external-host': {
    severity: 'medium',
    title: 'New outside service called',
    why: 'Sending student text to a new third party needs a privacy and data-map review first.',
    fix: 'If intended, update docs/privacy-and-legal/DATA-MAP.md and the privacy notice, then add the ignore comment.',
  },
};

// Lines of context a comment can sit in and still cover a finding.
function ignored(text, ruleId) {
  const re = new RegExp(`security-check:\\s*ignore\\s+(?:[\\w-]+\\s*,\\s*)*${ruleId}\\b`);
  return re.test(text);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function finding(ruleId, file, line, detail) {
  return { rule: ruleId, file, line, detail, ...RULES[ruleId] };
}

const stripSqlComments = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));

// ── Migrations ────────────────────────────────────────────────────────────────

function nameOf(raw) {
  return raw.replace(/["`]/g, '').replace(/^public\./i, '').toLowerCase();
}

// `corpus` (optional) is all migrations' SQL joined: migrations build on each other, so when auditing
// the whole history a later migration may legitimately fix an earlier one (enable RLS, pin search_path).
// `checkGrants` is off for whole-history audits, where older tables rely on RLS rather than REVOKE.
export function checkMigration(file, text, { corpus = null, checkGrants = true, latestDefinition = null } = {}) {
  const out = [];
  const sql = stripSqlComments(text);
  const fixes = corpus ? stripSqlComments(corpus) : sql;

  const created = (kind) => {
    const re = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:UNLOGGED\\s+|MATERIALIZED\\s+|TEMP(?:ORARY)?\\s+)*${kind}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([\\w."]+)`,
      'gi',
    );
    return [...sql.matchAll(re)].map((m) => ({ name: nameOf(m[1]), index: m.index }));
  };

  const tables = created('TABLE');
  const views = created('VIEW');
  const functions = created('FUNCTION');

  const rlsOn = new Set(
    [...fixes.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([\w."]+)\s+(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY/gi)].map((m) =>
      nameOf(m[1]),
    ),
  );
  const revokes = [...fixes.matchAll(/REVOKE\b[^;]*;/gi)].map((m) => m[0].toLowerCase());
  const revoked = (name) =>
    revokes.some((r) => r.includes(name) && /\banon\b/.test(r) && /\bauthenticated\b/.test(r));

  for (const t of tables) {
    // Tables created inside a function body or as a temp are not app tables.
    if (!rlsOn.has(t.name) && !ignored(text, 'db-no-rls'))
      out.push(finding('db-no-rls', file, lineOf(sql, t.index), `Table ${t.name}`));
  }
  for (const o of checkGrants ? [...tables, ...views, ...functions] : []) {
    if (!revoked(o.name) && !ignored(text, 'db-default-grants'))
      out.push(finding('db-default-grants', file, lineOf(sql, o.index), `${o.name}`));
  }

  // SECURITY DEFINER functions: split the file on CREATE FUNCTION and look at each definition.
  const parts = sql.split(/(?=CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s)/i).filter((p) => /^CREATE/i.test(p.trimStart()));
  for (const p of parts) {
    if (!/SECURITY\s+DEFINER/i.test(p)) continue;
    const name = nameOf((p.match(/FUNCTION\s+([\w."]+)/i) || [])[1] || 'unknown');
    if (latestDefinition && latestDefinition.get(name) !== file) continue; // a later migration redefines it
    const at = lineOf(sql, sql.indexOf(p));
    const pinnedLater = new RegExp(`ALTER\\s+FUNCTION\\s+(?:public\\.)?"?${name}"?\\s*\\([^)]*\\)\\s+SET\\s+"?search_path"?`, 'i').test(fixes);
    if (!/SET\s+"?search_path"?/i.test(p) && !pinnedLater && !ignored(text, 'db-definer-search-path'))
      out.push(finding('db-definer-search-path', file, at, `Function ${name}`));
    // Checks that count as "looks at the caller": auth.uid(), auth.jwt(), or one of our role helpers.
    const looksAtCaller = /auth\.(uid|jwt|role)\s*\(|\b(?:is|has|can|in|require|assert)_[a-z_]+\s*\(/i.test(p);
    // Only app users can exploit a missing caller check: server-only functions (revoked from anon and
    // authenticated, never granted back) are reachable by the service role alone.
    const grantedBack = [...fixes.matchAll(/GRANT\b[^;]*;/gi)].some((g) => {
      const t = g[0].toLowerCase();
      return t.includes(name) && /\bto\b[^;]*\b(anon|authenticated|public)\b/.test(t);
    });
    const callable = !revoked(name) || grantedBack;
    if (!looksAtCaller && callable && !ignored(text, 'db-definer-no-caller-check'))
      out.push(finding('db-definer-no-caller-check', file, at, `Function ${name}`));
  }
  return out;
}

// ── API routes ────────────────────────────────────────────────────────────────

const AUTH_MARKERS =
  /requireUser|getRequestUser|getUserFromAuthHeader|CRON_SECRET|WEBHOOK_SECRET|NEWS_API_SECRET|auth\.getUser\s*\(/;

export function checkApiRoute(file, text) {
  const out = [];
  // Helpers (api/_lib) and tests are not routes.
  if (/\/_lib\//.test(file) || /\.test\.[jt]s$/.test(file)) return out;

  if (!AUTH_MARKERS.test(text) && !ignored(text, 'api-no-auth'))
    out.push(finding('api-no-auth', file, 1, 'No requireUser / CRON_SECRET / webhook secret found'));

  const usesCallerIdentity = /requireUser|getRequestUser|getUserFromAuthHeader|auth\.getUser\s*\(/.test(text);
  const bodyId = /req\.(?:body|query)\??\.(?:user_?[iI]d|student_?[iI]d|learner_?[iI]d|profile_?[iI]d)\b|\{[^}\n]*\b(?:user_?[iI]d|student_?[iI]d|learner_?[iI]d)\b[^}\n]*\}\s*=\s*(?:req\.body|req\.query|body)\b/;
  const m = text.match(bodyId);
  const secretGated = /CRON_SECRET|WEBHOOK_SECRET|NEWS_API_SECRET/.test(text); // admin/cron callers choose the user
  if (m && !usesCallerIdentity && !secretGated && !ignored(text, 'api-trusts-body-id'))
    out.push(finding('api-trusts-body-id', file, lineOf(text, m.index), m[0].slice(0, 80)));

  const logRe = /console\.(?:log|info|warn|error|debug)\s*\([^;\n]*\b(?:req\.body|req\.query|messages|prompt|userMessage|user_message|transcript)\b(?!\??\.length)/g;
  for (const l of text.matchAll(logRe)) {
    if (ignored(text, 'log-student-content')) break;
    out.push(finding('log-student-content', file, lineOf(text, l.index), l[0].slice(0, 100)));
  }

  out.push(...checkClaudeTemperature(file, text));
  return out;
}

export function checkClaudeTemperature(file, text) {
  const out = [];
  if (!/api\.anthropic\.com|@anthropic-ai\/sdk|new\s+Anthropic\b/.test(text)) return out; // our own /api/chat proxy gates it
  if (/modelAllowsCustomTemperature/.test(text)) return out; // gated, like api/chat.js
  if (ignored(text, 'ai-temperature-claude')) return out;
  const m = text.match(/\btemperature\s*[:=]/);
  if (m) out.push(finding('ai-temperature-claude', file, lineOf(text, m.index), m[0]));
  return out;
}

// ── Browser code ──────────────────────────────────────────────────────────────

export function checkBrowserCode(file, text) {
  const out = [];
  // Comments that merely mention a variable are not uses of it (blank them, keeping line numbers).
  const code = text.replace(/^\s*\/\/.*$/gm, (c) => ' '.repeat(c.length));
  const m = code.match(/(?:import\.meta\.env|process\.env)\.[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE|ANTHROPIC|RESEND)[A-Z0-9_]*/);
  if (m && !ignored(text, 'secret-in-browser')) out.push(finding('secret-in-browser', file, lineOf(code, m.index), m[0]));
  return out;
}

// ── Code execution, iframes, personal data, chat tables, public docs ─────────

const noLineComments = (t) => t.replace(/^\s*(?:\/\/|\*|\/\*).*$/gm, (c) => ' '.repeat(c.length));

export function checkCodeExecution(file, text) {
  if (/\.test\.[jt]s$/.test(file) || ignored(text, 'code-exec-outside-sandbox')) return [];
  const code = noLineComments(text);
  const m = code.match(/\beval\s*\(|new\s+Function\s*\(|child_process|\bexecSync\b|\bspawnSync\b|\bexecFile(?:Sync)?\b|from\s+['"](?:node:)?vm['"]|require\(\s*['"](?:node:)?vm['"]\s*\)|\bvm\.(?:run\w*|Script)\b/);
  return m ? [finding('code-exec-outside-sandbox', file, lineOf(code, m.index), m[0])] : [];
}

export function checkIframes(file, text) {
  const out = [];
  if (ignored(text, 'iframe-no-sandbox')) return out;
  for (const m of text.matchAll(/<iframe\b((?:[^>]|=>)*?)>/g)) {
    const attrs = m[1];
    const sandbox = attrs.match(/\bsandbox\s*=\s*(?:"([^"]*)"|\{\s*["'`]([^"'`]*)["'`]\s*\})/);
    const line = lineOf(text, m.index);
    if (sandbox) {
      if (/allow-same-origin/.test(sandbox[1] ?? sandbox[2]) && /allow-scripts/.test(sandbox[1] ?? sandbox[2]))
        out.push(finding('iframe-no-sandbox', file, line, 'sandbox has both allow-scripts and allow-same-origin'));
      continue;
    }
    if (/\bsandbox\b/.test(attrs)) continue; // set by a variable; a person should read it, but not flag it
    // A fixed https address (a video embed, say) shows nobody's code; anything else might.
    const fixedAddress = /\bsrc\s*=\s*"https:\/\/[^"]+"/.test(attrs) && !/srcDoc/.test(attrs);
    if (!fixedAddress) out.push(finding('iframe-no-sandbox', file, line, 'iframe without a sandbox attribute'));
  }
  return out;
}

const PII_NAME = '[a-z_]*(?:email(?!ed)|phone|birth|dob|address|first_name|last_name|full_name|surname|guardian|ip_address|latitude|longitude|national_id|passport)[a-z_]*';
const COLUMN_TYPE = '(?:text|varchar|character|citext|date|timestamp|timestamptz|inet|numeric|integer|int|bigint|jsonb)';

export function checkSchemaSignals(file, text, { corpus = null } = {}) {
  const out = [];
  // Look only at CREATE TABLE / ALTER TABLE statements (not function bodies, where variables share these names).
  const sql = stripSqlComments(text).replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, (b) => b.replace(/[^\n]/g, ' '));
  const statements = sql.split(';');
  let at = 0;
  const piiHits = new Set();
  for (const st of statements) {
    const start = at;
    at += st.length + 1;
    if (!/^\s*(?:CREATE\s+(?:UNLOGGED\s+)?TABLE|ALTER\s+TABLE)\b/i.test(st)) continue;
    const re = new RegExp(`(?:ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?|[(,]\\s*)"?(${PII_NAME})"?\\s+${COLUMN_TYPE}\\b`, 'gi');
    for (const m of st.matchAll(re)) {
      const name = m[1].toLowerCase();
      if (/^(?:p|v)_/.test(name) || /_(?:at|by|count|status|sent)$/.test(name) || piiHits.has(name)) continue;
      piiHits.add(name);
      if (!ignored(text, 'pii-column-datamap')) out.push(finding('pii-column-datamap', file, lineOf(sql, start + m.index), name));
    }
    // Peer messaging tables: a new table named like messages/chat.
    const t = st.match(/CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/i);
    const table = t ? nameOf(t[1]) : '';
    const covered =
      /safety/i.test(text) ||
      (corpus && new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER[^;]*safety[^;]*\\bON\\s+(?:public\\.)?"?${table}"?`, 'i').test(corpus));
    if (t && /message|chat/i.test(t[1]) && !covered && !ignored(text, 'chat-table-no-safety'))
      out.push(finding('chat-table-no-safety', file, lineOf(sql, start + (t.index ?? 0)), nameOf(t[1])));
  }
  return out;
}

// Documents meant for families may stay public; working documents should not carry real numbers.
const PUBLIC_DOCS = /^docs\/(?:forms|templates)\/|\/(?:LEARNER-PRIVACY|PRIVACY-NOTICE-DRAFT|CHILD-SAFEGUARDING-POLICY)\.md$/i;

export function checkPublicDoc(file, text) {
  if (PUBLIC_DOCS.test(file) || ignored(text, 'public-sensitive-doc')) return [];
  const m = text.match(/~?\b\d[\d,]*\s+rows\b/i);
  return m ? [finding('public-sensitive-doc', file, lineOf(text, m.index), m[0])] : [];
}

// ── New outside hosts ─────────────────────────────────────────────────────────

const HOST_RE = /https?:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi;
// Hosts that are never a data path: docs, schemas, standards, localhost.
const BENIGN_HOSTS = /(^|\.)(w3\.org|github\.com|githubusercontent\.com|npmjs\.com|mozilla\.org|wikipedia\.org|example\.(com|org)|schema\.org|reactjs\.org|vercel\.com|supabase\.com|anthropic\.com|nextvillage\.org)$/i;

export function hostsIn(text) {
  return new Set([...text.matchAll(HOST_RE)].map((m) => m[1].toLowerCase()).filter((h) => !BENIGN_HOSTS.test(h)));
}

// `known` = hosts already present in the base branch. Only hosts used in a fetch/URL context are flagged.
export function checkNewHosts(file, text, known) {
  const out = [];
  if (ignored(text, 'new-external-host')) return out;
  for (const m of text.matchAll(HOST_RE)) {
    const host = m[1].toLowerCase();
    if (BENIGN_HOSTS.test(host) || known.has(host)) continue;
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    if (!/fetch\s*\(|axios|baseURL|endpoint|url\s*[:=]|new\s+URL/i.test(before)) continue;
    out.push(finding('new-external-host', file, lineOf(text, m.index), host));
    known.add(host); // report each new host once
  }
  return out;
}

// ── Entry point per file ──────────────────────────────────────────────────────

export function checkFile(file, text, { knownHosts = null, corpus = null, checkGrants = true, latestDefinition = null } = {}) {
  const out = [];
  if (/^supabase\/migrations\/.+\.sql$/.test(file)) {
    out.push(...checkMigration(file, text, { corpus, checkGrants, latestDefinition }));
    out.push(...checkSchemaSignals(file, text, { corpus }));
  }
  else if (/^api\/.+\.(js|ts)$/.test(file)) out.push(...checkApiRoute(file, text), ...checkCodeExecution(file, text));
  else if (/^src\/.+\.(ts|tsx|js|jsx)$/.test(file)) out.push(...checkBrowserCode(file, text), ...(/\.(tsx|jsx)$/.test(file) ? checkIframes(file, text) : []));
  else if (/^(?:lib\/.+\.(js|ts)|[^/]+\.cjs|scripts\/.+\.(ts|js))$/.test(file)) out.push(...checkCodeExecution(file, text));
  else if (/^docs\/.+\.(md|html)$/.test(file)) out.push(...checkPublicDoc(file, text));
  if (knownHosts && /^(api|src|lib)\/.+\.(js|ts|tsx|jsx)$/.test(file) && !/\.test\./.test(file))
    out.push(...checkNewHosts(file, text, knownHosts));
  return out;
}
