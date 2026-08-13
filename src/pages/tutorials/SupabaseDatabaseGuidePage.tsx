// src/pages/tutorials/SupabaseDatabaseGuidePage.tsx
//
// "Building a Real Database in Supabase" — a step-by-step Guide that does not
// wrap an existing nextVillage build page. It sends the student to the real
// Supabase dashboard (supabase.com) and has them type real SQL into the real
// SQL Editor, the same way a professional would. That's deliberate: a
// database isn't a feature of one app, it's infrastructure you'll reuse for
// every app after this one, so the habit worth building is "open Supabase
// and know what to do," not "click a button on nextVillage."
//
// Four episodes: what a database actually is + creating the account, writing
// SQL to create/explore/change a table by hand, loading a real CSV of sales
// data through the Table Editor's import feature, and Row Level Security —
// taught with the same deny-by-default / auth.uid()-ownership pattern this
// site's own tutorial_progress table uses to keep each student's progress
// private to them.
//
// No slide images or recorded audio (Fish Market has its own asset set) —
// narration falls back to on-device text-to-speech via useVoice.
//
// Progress: localStorage first (instant, offline), mirrored to
// `tutorial_progress` in Supabase when signed in — same as every other
// Guide on this site. (Recording your own progress in a Supabase table with
// RLS, while learning RLS, was too fitting to not point out — see the aside
// in Episode 3.)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import {
  Check, Lock, Copy, CheckCheck, ExternalLink, Volume2, VolumeX,
  ChevronDown, ChevronRight, Link2, Loader2, Download, Database,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'swivel' | 'gate';

interface Gate {
  label: string;
  placeholder: string;
  /** Return null when valid, or a short message explaining what's wrong. */
  validate: (value: string) => string | null;
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  /** Prompt or SQL text with a copy button. For swivels this is what gets copied. */
  prompt?: string;
  promptNote?: string;
  /** Short aside rendered in a tinted box. */
  aside?: string;
  gate?: Gate;
  /** Overrides the spoken text (defaults to title + body). */
  narration?: string;
  /** 'do' steps open Supabase by default; override the label/link, or hide it. */
  doLabel?: string;
  doHref?: string;
  hideDoButton?: boolean;
  /** Renders a download button for a bundled asset. */
  download?: { href: string; label: string };
}

interface Episode {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  duration: string;
  available: boolean;
  steps: Step[];
}

const TRACK = 'supabase-database-guide';
const SUPABASE_DASHBOARD = 'https://supabase.com/dashboard';

/* ───────────────────────────── content ───────────────────────────── */

const EPISODES: Episode[] = [
  {
    id: 'ep0',
    number: '0',
    title: 'What You Are Actually Building',
    subtitle: 'What a database is, why Supabase, and creating your free project',
    duration: 'about 20 minutes',
    available: true,
    steps: [
      {
        id: 'ep0-what-is-db',
        kind: 'read',
        title: 'A database is a spreadsheet with rules',
        body: [
          "You've used a spreadsheet: rows and columns, type anything anywhere, nothing stops you from putting a word where a number should go. A database is the same basic idea — rows and columns — but it enforces rules. A column marked \"number\" refuses to accept the word \"seven.\" A column marked \"required\" refuses to stay blank. That strictness is the whole point: it is what stops a small mistake today from becoming a confusing bug in your app six weeks from now.",
          'The technology that actually stores and enforces this is called Postgres (short for PostgreSQL) — a database engine that has run the back end of real companies for over 25 years. You are about to use the real thing, not a toy version made for tutorials.',
        ],
      },
      {
        id: 'ep0-what-is-supabase',
        kind: 'read',
        title: 'Where Supabase fits in',
        body: [
          "Postgres by itself is just software — someone has to install it on a computer, keep that computer running, and give you a way to reach it. That's what Supabase does: it runs a real Postgres database for you, for free, and wraps it in a dashboard with two tools you'll use constantly — a Table Editor (a spreadsheet-like view of your data) and a SQL Editor (a text box where you type commands and click Run).",
          'Every button in the Table Editor is really just SQL happening behind the scenes. You are going to learn to write that SQL directly, which means you will understand exactly what every click actually does — not just that clicking it worked.',
        ],
      },
      {
        id: 'ep0-account',
        kind: 'do',
        title: 'Create your free Supabase account and project',
        body: [
          'Open Supabase and sign up — GitHub or email both work. Once you are in, click "New Project." Give it a short name (anything — "my-first-database" is fine), pick the region closest to you, and set a database password.',
          'Write that password down somewhere. Supabase generates it once and will not show it to you again — you will not need it for anything in this Guide, but you will if you ever connect a real app to this project later.',
          'Provisioning takes about two minutes. Wait for the dashboard to finish loading before moving on.',
        ],
        doLabel: 'Open Supabase',
        aside: 'Free tier is genuinely free — no card required to create this project.',
      },
      {
        id: 'ep0-swivel-1',
        kind: 'swivel',
        title: 'Swivel — spreadsheet vs. database, in your own words',
        body: [
          "Before you touch SQL, use this swivel to make sure the core idea actually landed. If you can't explain the difference in your own words yet, the next episode will feel like memorizing syntax instead of using a tool you understand.",
        ],
        prompt:
          "I just created my first Postgres database using Supabase. Explain, in plain language with a concrete analogy, what makes a relational database different from a spreadsheet like Google Sheets — specifically what \"table,\" \"row,\" \"column,\" and \"schema\" mean, and why a database enforces rules that a spreadsheet lets you ignore.",
        promptNote: 'Read the answer, then try explaining "schema" out loud to yourself in one sentence before continuing.',
      },
    ],
  },

  {
    id: 'ep1',
    number: '1',
    title: 'Create, Explore, and Change a Table',
    subtitle: 'Real SQL, typed by hand, in the real SQL Editor',
    duration: 'about 40 minutes',
    available: true,
    steps: [
      {
        id: 'ep1-create-table',
        kind: 'do',
        title: 'Create your first table',
        body: [
          'In your Supabase project, open the SQL Editor from the left sidebar. Paste the SQL below into it and click Run (or press Cmd/Ctrl+Enter).',
          'Reading it line by line: id is a number that Postgres assigns automatically and never repeats — that is what "primary key" means, a value that uniquely identifies each row. title and author must be text and cannot be left blank ("not null"). pages is a whole number and is allowed to be blank. is_read is true/false and starts false unless you say otherwise. added_at records the exact moment the row was created, automatically.',
        ],
        prompt:
          'create table books (\n  id bigint generated always as identity primary key,\n  title text not null,\n  author text not null,\n  pages int,\n  is_read boolean not null default false,\n  added_at timestamptz not null default now()\n);',
        doLabel: 'Open SQL Editor',
      },
      {
        id: 'ep1-explore-table',
        kind: 'do',
        title: 'Find it in the Table Editor',
        body: [
          'Switch to the Table Editor in the left sidebar. You should see "books" listed. Click it — you\'ll see the five columns you just defined, an empty table with zero rows, and the data type of each column shown right under its name.',
          "Every column, type, and default you wrote in SQL is right here, drawn as a spreadsheet. That's the whole relationship between the two tools: SQL Editor to command, Table Editor to look.",
        ],
        doLabel: 'Open Table Editor',
      },
      {
        id: 'ep1-insert-rows',
        kind: 'do',
        title: 'Add rows with INSERT',
        body: [
          'Back in the SQL Editor, run this to add three real rows at once. Then flip back to the Table Editor and refresh — your three books should be sitting there.',
        ],
        prompt:
          "insert into books (title, author, pages, is_read)\nvalues\n  ('The Hobbit', 'J.R.R. Tolkien', 310, true),\n  ('Educated', 'Tara Westover', 334, false),\n  ('Sapiens', 'Yuval Noah Harari', 443, false);",
        doLabel: 'Open SQL Editor',
      },
      {
        id: 'ep1-alter-table',
        kind: 'do',
        title: 'Change the table\'s shape with ALTER',
        body: [
          'Add a new column to a table that already has data in it — this is the step people are most nervous about the first time, worried it will wipe everything out. It will not. Run this:',
        ],
        prompt:
          "alter table books add column genre text;\n\nupdate books set genre = 'Fantasy' where title = 'The Hobbit';\nupdate books set genre = 'Memoir' where title = 'Educated';\nupdate books set genre = 'History' where title = 'Sapiens';",
        doLabel: 'Open SQL Editor',
        aside: "Check the Table Editor again after running this — your three original rows are untouched, just with a new genre column filled in.",
      },
      {
        id: 'ep1-ddl-dml',
        kind: 'read',
        title: 'Why that did not erase anything',
        body: [
          'create and alter change the shape of a table — what columns exist, what type each one is. insert, update, and delete change the data sitting inside that shape. Those are two different kinds of operation, which is exactly why adding a genre column left your three books alone: you changed the shape, not the content.',
          "This distinction has real names — data definition (shape) and data manipulation (content) — but you don't need the vocabulary to use it. You just need to know that reshaping a table is normal and does not threaten existing rows, as long as you're adding, not removing.",
        ],
      },
      {
        id: 'ep1-swivel-2',
        kind: 'swivel',
        title: 'Swivel — choosing a data type',
        body: [
          'Every column you add from here on means picking a data type. Use this swivel on a real decision from your own table before you have to make one under pressure later.',
        ],
        prompt:
          "Here's a table I created in Postgres:\n\ncreate table books (\n  id bigint generated always as identity primary key,\n  title text not null,\n  author text not null,\n  pages int,\n  is_read boolean not null default false,\n  added_at timestamptz not null default now(),\n  genre text\n);\n\nIf I wanted to add a column to track the price I paid for each book, what data type should I use and why? Also explain the difference between a column being NULL versus being an empty string or 0 — why does Postgres treat those as genuinely different things?",
        promptNote: 'Add the column yourself afterward if you want the extra practice — it is just one more alter table statement.',
      },
    ],
  },

  {
    id: 'ep2',
    number: '2',
    title: 'Load a Real Data File',
    subtitle: 'Two weeks of sales data, imported from a CSV you download yourself',
    duration: 'about 30 minutes',
    available: true,
    steps: [
      {
        id: 'ep2-what-is-csv',
        kind: 'read',
        title: 'What a CSV actually is',
        body: [
          'CSV stands for comma-separated values — a plain text file where each line is one row, and commas mark where one column ends and the next begins. The very first line usually holds the column names. It is the closest thing computing has to a universal format: every spreadsheet program, every database, and every data tool can open one.',
          "That's why it's the standard way real data gets handed off between systems — someone exports a CSV from wherever their data already lives, and it lands somewhere else. You're about to do that exact handoff into your own database.",
        ],
      },
      {
        id: 'ep2-download',
        kind: 'do',
        title: 'Download the data file',
        body: [
          "This is two weeks of sales from a small corner store — one row per item sold in a day, with the date, item name, category, quantity, and price. Download it and open it in any text editor or spreadsheet app first, just to see what real, slightly messy tabular data actually looks like before a database has organized it.",
        ],
        download: { href: '/tutorials/assets/store-sales.csv', label: 'Download store-sales.csv' },
        hideDoButton: true,
      },
      {
        id: 'ep2-import',
        kind: 'do',
        title: 'Import it as a new table',
        body: [
          'In the Table Editor, click "New Table," then look for "Import data via spreadsheet" (sometimes shown as a CSV upload option) instead of adding columns by hand. Upload store-sales.csv.',
          'Supabase will read the file, guess a name and data type for each column, and show you a preview before creating anything. Check its guesses — quantity and unit_price should be numbers, sale_date should be a date, item and category should be text. Fix anything it guessed wrong, name the table store_sales, and save.',
        ],
        doLabel: 'Open Table Editor',
        aside: "Column type guessing from a file is never perfect. Treat the preview screen as a step to actually read, not click through.",
      },
      {
        id: 'ep2-verify',
        kind: 'do',
        title: 'Query the data you just loaded',
        body: [
          'Open the Table Editor and confirm store_sales has rows — the count should match the number of data lines in the CSV. Then switch to the SQL Editor and run this to answer a real question: which category brought in the most money?',
        ],
        prompt:
          'select category, sum(quantity * unit_price) as revenue\nfrom store_sales\ngroup by category\norder by revenue desc;',
        doLabel: 'Open SQL Editor',
      },
      {
        id: 'ep2-swivel-3',
        kind: 'swivel',
        title: 'Swivel — ask your own question of the data',
        body: [
          'group by and sum are two of the most useful things SQL does — turning hundreds of individual rows into one answer. Use this swivel to get a query for a question you actually want answered, not just the one above.',
        ],
        prompt:
          "I imported a CSV of two weeks of small-store sales into a Postgres table called store_sales, with columns sale_date, item, category, quantity, and unit_price. Write a SQL query that tells me which single item sold the most total units across the whole period, and a second query that tells me total revenue per day. Explain what each part of both queries — select, group by, order by — is actually doing.",
        promptNote: 'Run both in your SQL Editor and check the answer against what you would guess just from skimming the file.',
      },
    ],
  },

  {
    id: 'ep3',
    number: '3',
    title: 'Row Level Security: Locking the Door',
    subtitle: 'Every table is reachable from the internet the moment it exists — this is how you control that',
    duration: 'about 30 minutes',
    available: true,
    steps: [
      {
        id: 'ep3-why-rls',
        kind: 'read',
        title: 'Why this matters more than it sounds like it should',
        body: [
          "Here is the part that surprises most people the first time: every Supabase table is reachable over the internet the moment you create it, through a public web address and a key that ships inside your website's own code — visible to anyone who opens their browser's developer tools. That is not a bug. It is how Supabase lets your React app talk to your database directly, with no server code of your own in between.",
          "Row Level Security (RLS) is the safeguard that makes that workable: a rule, written in SQL, attached directly to the table, that Postgres checks on every single request no matter where it came from — your app, someone else's app, or a stranger poking at the address directly. Until you turn it on for a table and add at least one policy, treat that table as fully exposed. Once you turn it on with zero policies, the opposite happens — Postgres denies every request by default, including yours. You have to explicitly grant access back, one rule at a time.",
        ],
      },
      {
        id: 'ep3-enable',
        kind: 'do',
        title: 'Turn RLS on and watch it lock everything',
        body: [
          'Run this on your books table, then run a plain select * from books;. It will return zero rows — not an error, just nothing. That is RLS doing exactly what it is designed to do: deny by default until you say otherwise. This is called "failing closed," and it is the safer of the two possible defaults, because a forgotten rule fails toward "nobody gets in" instead of "everybody does."',
        ],
        prompt: 'alter table books enable row level security;',
        doLabel: 'Open SQL Editor',
      },
      {
        id: 'ep3-policy',
        kind: 'do',
        title: 'Write your first policy',
        body: [
          "Run this to open reading back up. In plain language: \"for select operations, allow the request if this condition holds\" — and the condition is just the word true, so it always holds. That makes books fully readable by anyone again, the way it was before you enabled RLS, except now that's a decision you made on purpose instead of the default you never chose.",
        ],
        prompt: 'create policy "Anyone can read books"\non books for select\nusing (true);',
        doLabel: 'Open SQL Editor',
      },
      {
        id: 'ep3-real-policy',
        kind: 'read',
        title: 'What a real policy usually looks like',
        body: [
          "using (true) is fine for data that genuinely is public — a shared catalog, a store's price list. Most tables aren't that: they belong to a specific signed-in user, and the standard pattern is using (auth.uid() = user_id) — Postgres compares the id of whoever is currently signed in against a user_id column on the row, and only matches let the request through.",
          "It's also common to leave a delete policy out entirely, rather than write one and hope no one triggers it by mistake. A door that was never built cannot be walked through by accident.",
        ],
        aside: "This exact pattern — RLS on, auth.uid() = user_id for select/insert/update, no delete policy — is what keeps your own progress on this Guide private to you. It's stored in a Supabase table just like the one you built today.",
      },
      {
        id: 'ep3-swivel-4',
        kind: 'swivel',
        title: 'Swivel — write a policy for a scenario you invent',
        body: [
          'Use this swivel to see the ownership pattern applied to a table you make up — something with a user_id column, the way almost every real per-user table looks.',
        ],
        prompt:
          "I have a Postgres table called notes with a user_id column that references auth.users. I want each signed-in user to be able to see and edit only their own rows, and I want no one — not even the row's owner — to be able to delete a row. Write the exact create policy statements I need for select, insert, and update, and explain in plain language what the using and with check clauses on each one are actually checking.",
        promptNote: 'Notice it needs three separate policies, not one — select, insert, and update each get checked independently.',
      },
      {
        id: 'ep3-gate',
        kind: 'gate',
        title: 'Prove it',
        body: [
          "You built a real Postgres database, by hand, in the same dashboard a professional would use: a table created and reshaped with SQL, real data loaded from a file, and a security rule that actually restricts access. Tell us what you locked down.",
        ],
        gate: {
          label: 'Which table did you enable RLS on, and what does your policy allow?',
          placeholder: "e.g. books — anyone can read, but I haven't added write access yet",
          validate: v => {
            const s = v.trim();
            if (s.length < 10) return 'Give a little more detail — a table name and what the policy actually allows.';
            if (!/\s/.test(s)) return 'That looks like one word — add what the policy allows.';
            return null;
          },
        },
      },
    ],
  },
];

const ALL_STEP_IDS = EPISODES.flatMap(e => e.steps.map(s => s.id));

/* ──────────────────────────── small parts ─────────────────────────── */

const CopyBlock: React.FC<{ text: string; tone?: 'amber' | 'purple' | 'emerald' }> = ({ text, tone = 'emerald' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older mobile browsers: fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more we can do */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  const ring = tone === 'purple' ? 'border-purple-300 bg-purple-50' : tone === 'amber' ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50';
  const btn = tone === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : tone === 'amber' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700';
  return (
    <div className={`relative rounded-xl border ${ring} p-4 pr-32`}>
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-gray-800">{text}</pre>
      <button
        onClick={copy}
        className={`absolute right-3 top-3 flex items-center gap-1.5 rounded-lg ${btn} px-3 py-2 text-xs font-bold text-white transition-colors`}
      >
        {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

/* ──────────────────────────── main page ──────────────────────────── */

const SupabaseDatabaseGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [openEpisode, setOpenEpisode] = useState('ep0');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');
  const [speakingStep, setSpeakingStep] = useState<string | null>(null);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
  } = useVoice(voiceMode === 'pidgin');

  useEffect(() => { if (!isSpeaking) setSpeakingStep(null); }, [isSpeaking]);

  /* ── load progress: localStorage first (instant, offline), then Supabase ── */

  const lsKey = `tutorial:${TRACK}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const p = JSON.parse(raw);
        setDone(new Set<string>(p.completed ?? []));
        setArtifacts(p.artifacts ?? {});
      }
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tutorial_progress')
        .select('completed_steps, artifacts')
        .eq('user_id', userId)
        .eq('track', TRACK)
        .maybeSingle();
      if (cancelled || error || !data) return;
      // Union with anything done offline — the cloud copy never deletes local work.
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
      setArtifacts(prev => ({ ...(data.artifacts ?? {}), ...prev }));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback((nextDone: Set<string>, nextArtifacts: Record<string, string>) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({
        completed: [...nextDone], artifacts: nextArtifacts, updated: Date.now(),
      }));
    } catch { /* private browsing, quota — progress still works in memory */ }
    if (!userId) return;
    setSyncing(true);
    supabase
      .from('tutorial_progress')
      .upsert({
        user_id: userId,
        track: TRACK,
        completed_steps: [...nextDone],
        artifacts: nextArtifacts,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, userId]);

  /* ── progression ── */

  const stepsOf = (ep: Episode) => ep.steps;

  const firstIncompleteIndex = useCallback((ep: Episode) => {
    const idx = ep.steps.findIndex(s => !done.has(s.id));
    return idx === -1 ? ep.steps.length : idx;
  }, [done]);

  const isUnlocked = useCallback((ep: Episode, index: number) => index <= firstIncompleteIndex(ep), [firstIncompleteIndex]);

  const complete = (step: Step, value?: string) => {
    const nextDone = new Set(done); nextDone.add(step.id);
    const nextArt = value !== undefined ? { ...artifacts, [step.id]: value } : artifacts;
    setDone(nextDone); setArtifacts(nextArt); persist(nextDone, nextArt);
    setExpanded(prev => { const n = new Set(prev); n.delete(step.id); return n; });
  };

  const uncomplete = (step: Step) => {
    const nextDone = new Set(done); nextDone.delete(step.id);
    setDone(nextDone); persist(nextDone, artifacts);
  };

  const submitGate = (step: Step) => {
    const v = (gateDraft[step.id] ?? '').trim();
    const err = step.gate!.validate(v);
    if (err) { setGateError(p => ({ ...p, [step.id]: err })); return; }
    setGateError(p => ({ ...p, [step.id]: '' }));
    complete(step, v);
  };

  /* ── narration ── */

  const narrationFor = (s: Step) => s.narration ?? [s.title, ...s.body, s.aside ?? ''].filter(Boolean).join('. ');

  const speakStep = (s: Step) => {
    if (speakingStep === s.id) { cancelSpeech(); setSpeakingStep(null); return; }
    cancelSpeech();
    setSpeakingStep(s.id);
    hookSpeak(narrationFor(s));
  };

  useEffect(() => () => { cancelSpeech(); }, [cancelSpeech]);

  /* ── swivel ── */

  const swivel = async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); } catch { /* copy button is still there */ }
    window.open('/playground', '_blank', 'noopener');
  };

  /* ── derived ── */

  const totalSteps = ALL_STEP_IDS.length;
  const doneCount = useMemo(() => ALL_STEP_IDS.filter(id => done.has(id)).length, [done]);
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read:   { badge: 'bg-slate-100 text-slate-600',     label: 'Read',     ring: 'border-gray-200' },
    do:     { badge: 'bg-emerald-100 text-emerald-800', label: 'Do',       ring: 'border-emerald-200' },
    swivel: { badge: 'bg-purple-100 text-purple-800',   label: 'Swivel',   ring: 'border-purple-300' },
    gate:   { badge: 'bg-cyan-100 text-cyan-800',       label: 'Prove it', ring: 'border-cyan-300' },
  };

  if (!loaded) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">

        {/* header */}
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">Building a Real Database in Supabase</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                Create a free Supabase account, then build a real Postgres database with your own hands — a table created and changed with SQL, real data loaded from a file, and security rules that actually restrict access.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-slate-600">
                <button
                  onClick={() => setVoiceMode('english')}
                  className={`px-2.5 py-1.5 text-xs font-bold ${voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >🇬🇧 <span className="hidden sm:inline">English</span></button>
                <button
                  onClick={() => setVoiceMode('pidgin')}
                  title="Nigerian English / Pidgin voice"
                  className={`px-2.5 py-1.5 text-xs font-bold ${voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >🇳🇬 <span className="hidden sm:inline">Pidgin</span></button>
              </div>
              <button
                onClick={() => { setVoiceOn(v => { if (v) { cancelSpeech(); setSpeakingStep(null); } return !v; }); }}
                title={voiceOn ? 'Turn narration off' : 'Turn narration on'}
                className={`rounded-lg p-2 ${voiceOn ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {totalSteps} steps</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {!userId && (
              <p className="mt-2 text-xs text-slate-400">
                Your progress is saved on this device. Sign in to keep it across devices.
              </p>
            )}
          </div>
        </div>

        {/* episodes */}
        {EPISODES.map(ep => {
          const open = openEpisode === ep.id;
          const epDone = ep.steps.filter(s => done.has(s.id)).length;
          const epComplete = ep.steps.length > 0 && epDone === ep.steps.length;

          return (
            <div key={ep.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => setOpenEpisode(open ? '' : ep.id)}
                disabled={!ep.available}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${ep.available ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  epComplete ? 'bg-green-600 text-white' : ep.available ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-400'}`}>
                  {epComplete ? <Check className="h-6 w-6" /> : ep.available ? ep.number : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h2 className="text-lg font-bold text-gray-900">Episode {ep.number} · {ep.title}</h2>
                    <span className="text-xs text-gray-400">{ep.duration}</span>
                  </div>
                  <p className="truncate text-sm text-gray-500">{ep.subtitle}</p>
                  {ep.available && ep.steps.length > 0 && (
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(epDone / ep.steps.length) * 100}%` }} />
                    </div>
                  )}
                </div>
                {ep.available && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 sm:p-6">
                  {stepsOf(ep).map((step, i) => {
                    const unlocked = isUnlocked(ep, i);
                    const isDone = done.has(step.id);
                    const isOpen = unlocked && (!isDone || expanded.has(step.id));
                    const st = KIND_STYLE[step.kind];

                    return (
                      <div
                        key={step.id}
                        className={`mb-3 rounded-xl border bg-white transition-all ${isDone ? 'border-green-200' : st.ring} ${!unlocked ? 'opacity-50' : ''}`}
                      >
                        <button
                          onClick={() => {
                            if (!unlocked) return;
                            setExpanded(prev => {
                              const n = new Set(prev);
                              if (n.has(step.id)) n.delete(step.id); else n.add(step.id);
                              return n;
                            });
                          }}
                          className="flex w-full items-center gap-3 p-4 text-left"
                        >
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isDone ? 'bg-green-600 text-white' : unlocked ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>
                            {isDone ? <Check className="h-4 w-4" /> : unlocked ? i + 1 : <Lock className="h-3 w-3" />}
                          </div>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${st.badge}`}>{st.label}</span>
                          <span className={`flex-1 text-sm font-semibold ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.title}</span>
                          {voiceOn && unlocked && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={e => { e.stopPropagation(); speakStep(step); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); speakStep(step); } }}
                              className={`rounded p-1.5 ${speakingStep === step.id ? 'bg-cyan-100 text-cyan-700' : 'text-gray-400 hover:bg-gray-100'}`}
                            >
                              <Volume2 className="h-4 w-4" />
                            </span>
                          )}
                        </button>

                        {isOpen && (
                          <div className="border-t border-gray-100 px-4 pb-4 pt-4 sm:px-6">
                            {step.body.map((p, k) => (
                              <p key={k} className="mb-3 text-[15px] leading-relaxed text-gray-700">{p}</p>
                            ))}

                            {step.prompt && (
                              <div className="mb-3">
                                <CopyBlock text={step.prompt} tone={step.kind === 'swivel' ? 'purple' : 'emerald'} />
                                {step.promptNote && <p className="mt-2 text-sm italic text-gray-500">{step.promptNote}</p>}
                              </div>
                            )}

                            {step.aside && (
                              <div className="mb-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                                {step.aside}
                              </div>
                            )}

                            {step.kind === 'swivel' && step.prompt && (
                              <button
                                onClick={() => swivel(step.prompt!)}
                                className="mb-3 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700"
                              >
                                <Database className="h-4 w-4" />
                                Copy and open the AI Playground
                                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                              </button>
                            )}

                            {step.download && (
                              <a
                                href={step.download.href}
                                download
                                className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100 w-fit"
                              >
                                <Download className="h-4 w-4" />
                                {step.download.label}
                              </a>
                            )}

                            {step.kind === 'do' && !step.hideDoButton && (
                              <button
                                onClick={() => window.open(step.doHref ?? SUPABASE_DASHBOARD, '_blank', 'noopener')}
                                className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
                              >
                                <ExternalLink className="h-4 w-4" />
                                {step.doLabel ?? 'Open Supabase'}
                              </button>
                            )}

                            {step.gate ? (
                              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                                <label className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-900">
                                  <Link2 className="h-4 w-4" />{step.gate.label}
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <input
                                    value={gateDraft[step.id] ?? artifacts[step.id] ?? ''}
                                    onChange={e => setGateDraft(p => ({ ...p, [step.id]: e.target.value }))}
                                    placeholder={step.gate.placeholder}
                                    className="flex-1 rounded-lg border border-cyan-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                                  />
                                  <button
                                    onClick={() => submitGate(step)}
                                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700"
                                  >
                                    {isDone ? 'Update' : 'Submit'}
                                  </button>
                                </div>
                                {gateError[step.id] && <p className="mt-2 text-sm font-semibold text-red-600">{gateError[step.id]}</p>}
                                {isDone && artifacts[step.id] && (
                                  <p className="mt-2 break-all text-xs text-cyan-800">Saved: {artifacts[step.id]}</p>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                {!isDone ? (
                                  <button
                                    onClick={() => complete(step)}
                                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
                                  >
                                    Mark done
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => uncomplete(step)}
                                    className="text-sm font-semibold text-gray-400 hover:text-gray-600"
                                  >
                                    Not done yet
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {epComplete && (
                    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
                      <p className="font-bold text-green-900">Episode {ep.number} complete.</p>
                      <p className="mt-1 text-sm text-green-800">
                        {ep.id === 'ep3'
                          ? 'You built a real Postgres database by hand — a table created and reshaped with SQL, real data loaded from a file, and a security rule that actually restricts access. When you are ready to connect this to a live React app, Full-Stack Development is the next step.'
                          : 'Move on when you are ready.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-8 text-center">
          <button onClick={() => navigate('/tutorials')} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </div>

      {fallbackText && <VoiceFallback text={fallbackText} onDismiss={clearFallback} />}
    </AppLayout>
  );
};

export default SupabaseDatabaseGuidePage;
