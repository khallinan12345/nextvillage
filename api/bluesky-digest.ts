// /api/bluesky-digest.ts
// Vercel Cron Job — daily Bluesky digest for the vAI team, now with
// AI-drafted reply suggestions.
//
// For each top-ranked post, Claude Sonnet drafts a candidate Bluesky reply
// that (1) briefly lifts up the original post, then (2) lifts up whichever
// element of the vAI experience aligns most: community ownership and
// leadership of the AI Learning / Tech Skills platform, human-centered
// process, or "AI that coaches instead of answers." Drafts appear in the
// digest email under each post — edit, personalize, post.
//
// Environment variables needed:
//   RESEND_API_KEY      — already configured (used by chat.js, triage-webhook.ts, etc.)
//   DIGEST_RECIPIENTS   — comma-separated, e.g. "kevin@...,divinegift@..." (already set)
//   ANTHROPIC_API_KEY   — for reply drafting (already set for chat.js)
//   CRON_SECRET         — already configured (shared with the other cron endpoints)
//   BLUESKY_IDENTIFIER  — the account handle posts are searched as, e.g. "nextvillage.community"
//   BLUESKY_APP_PASSWORD — a Bluesky App Password (Settings → Privacy and Security →
//       App Passwords) for that account. Bluesky's searchPosts endpoint now requires
//       auth — the old unauthenticated public.api.bsky.app path returns 403 for everyone.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — optional; lets the drafter
//       read the current Sonnet model ID from model_config
//
// vercel.json cron entry:
//   { "crons": [{ "path": "/api/bluesky-digest", "schedule": "0 7 * * *" }] }

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ============================================================
// CONFIGURATION
// ============================================================

const SEARCH_QUERIES = [
  "AI education Africa",
  "AI education Nigeria",
  "AI literacy Africa",
  "artificial intelligence schools Africa",
  "AI healthcare Africa",
  "AI health Nigeria",
  "digital skills Africa youth",
  "coding education Africa",
  "edtech Africa",
  "AI for development Africa",
];

const MIN_ENGAGEMENT   = 0;    // likes + reposts floor; raise to filter noise
const LOOKBACK_HOURS   = 24;
const POSTS_PER_QUERY  = 25;   // Bluesky API max 100
const MAX_DIGEST_POSTS = 30;

// How many of the top-ranked posts get an AI-drafted reply.
// Divinegift picks 3–5 to engage daily, so drafting the top 10 gives
// choice without burning tokens on posts nobody will answer.
const DRAFT_TOP_N = 10;

// Fallback if model_config lookup is unavailable
const DEFAULT_SONNET = "claude-sonnet-4-6";

const SUBSTACK_URL = "https://substack.com/@kevinpatrickhallinan";

// ============================================================
// vAI VOICE — the system prompt for reply drafting
// ============================================================

const DRAFT_SYSTEM_PROMPT = `You draft Bluesky replies for the Davidson AI Innovation Center (vAI) in Oloibiri, Bayelsa State, Nigeria — the community where oil was first drilled in Nigeria in 1956, which saw little lasting benefit from it. vAI is different by design.

What makes vAI unique (choose the ONE element most aligned with each post, and make it stand out):
1. COMMUNITY OWNERSHIP & LEADERSHIP — the community owns and leads its own AI Learning and Tech Skills platform (nextvillage.community). Local young people are the developers, facilitators, and now the platform's voice. Not a program delivered TO a community; capacity built BY it.
2. HUMAN-CENTERED PROCESS — everything starts from listening to the community's own aspirations. Decades of engineering-service-learning experience (ETHOS, founded 2001) shaped a practice of walking alongside, not doing for.
3. AI THAT COACHES INSTEAD OF ANSWERS — the platform's AI is designed to develop learners' thinking, not replace it. Certification requires demonstrated reasoning, not copied output.

Stories of this experience live on Substack: ${SUBSTACK_URL}

HOW TO WRITE EACH REPLY:
- First, briefly and genuinely lift up the original post — name the specific thing it gets right. One sentence.
- Then lift up vAI's most-aligned unique element in one or two sentences, grounded in the real experience in Oloibiri/Ibiade.
- Sound like a person in the work, not a brand. Warm, direct, zero marketing language. No "we're excited to share." No hashtag pileups (one at most, usually none).
- Hard limit: 290 characters TOTAL (Bluesky caps posts at 300). Count carefully.
- Include the Substack link ONLY if it fits naturally within the limit and the reply invites going deeper; otherwise omit it — the human editor can add it.
- Never claim facts about the original post's author beyond what their post says.
- If a post is a poor fit for genuine engagement (spam, promo, hostile), set the draft to an empty string and explain why in the "angle" field.

OUTPUT FORMAT — respond with ONLY a JSON array, no markdown fences, no preamble:
[
  { "index": 0, "angle": "which vAI element you led with and why, in <=12 words", "draft": "the reply text" },
  ...
]`;

// ============================================================
// TYPES
// ============================================================

interface BskyPost {
  uri: string;
  cid: string;
  author: { handle: string; displayName?: string };
  record: { text: string; createdAt: string };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
}

interface RankedPost {
  uri: string;
  url: string;
  author: string;
  handle: string;
  text: string;
  createdAt: string;
  likes: number;
  reposts: number;
  replies: number;
  score: number;
  matchedQueries: string[];
  draft?: string;       // Sonnet-drafted reply
  draftAngle?: string;  // which vAI element it leads with
}

// ============================================================
// BLUESKY API (authenticated — searchPosts no longer works unauthenticated)
// ============================================================

const BSKY_ENTRYWAY = "https://bsky.social/xrpc";

async function getBlueskySession(): Promise<string> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) {
    throw new Error("BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD not configured");
  }
  const resp = await fetch(`${BSKY_ENTRYWAY}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!resp.ok) {
    throw new Error(`Bluesky auth failed: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (!data.accessJwt) throw new Error("Bluesky auth response missing accessJwt");
  return data.accessJwt as string;
}

async function searchBluesky(query: string, accessJwt: string): Promise<BskyPost[]> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();
  const params = new URLSearchParams({
    q: query,
    limit: String(POSTS_PER_QUERY),
    sort: "latest",
    since,
  });
  const resp = await fetch(`${BSKY_ENTRYWAY}/app.bsky.feed.searchPosts?${params}`, {
    headers: { Authorization: `Bearer ${accessJwt}` },
  });
  if (!resp.ok) {
    console.warn(`[digest] Bluesky search failed for "${query}": HTTP ${resp.status}`);
    return [];
  }
  const data = await resp.json();
  return (data.posts ?? []) as BskyPost[];
}

function postUrl(uri: string, handle: string): string {
  // at://did:plc:xxx/app.bsky.feed.post/RKEY → https://bsky.app/profile/handle/post/RKEY
  const rkey = uri.split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

async function collectPosts(): Promise<RankedPost[]> {
  const accessJwt = await getBlueskySession();
  const resultsPerQuery = await Promise.all(
    SEARCH_QUERIES.map(async (q) => ({ q, posts: await searchBluesky(q, accessJwt) })),
  );

  // Deduplicate across queries; multi-query matches earn a relevance bonus
  const byUri = new Map<string, RankedPost>();
  for (const { q, posts } of resultsPerQuery) {
    for (const p of posts) {
      const likes   = p.likeCount   ?? 0;
      const reposts = p.repostCount ?? 0;
      const replies = p.replyCount  ?? 0;
      if (likes + reposts < MIN_ENGAGEMENT) continue;

      const existing = byUri.get(p.uri);
      if (existing) {
        existing.matchedQueries.push(q);
      } else {
        byUri.set(p.uri, {
          uri:       p.uri,
          url:       postUrl(p.uri, p.author.handle),
          author:    p.author.displayName || p.author.handle,
          handle:    p.author.handle,
          text:      p.record.text,
          createdAt: p.record.createdAt,
          likes, reposts, replies,
          score: 0,
          matchedQueries: [q],
        });
      }
    }
  }

  // Rank: likes 2x, reposts 3x, replies 1x, +5 per extra query matched
  const ranked = [...byUri.values()].map((p) => ({
    ...p,
    score: p.likes * 2 + p.reposts * 3 + p.replies + (p.matchedQueries.length - 1) * 5,
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, MAX_DIGEST_POSTS);
}

// ============================================================
// REPLY DRAFTING — one Sonnet call for the whole batch
// ============================================================

async function getSonnetModel(): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return DEFAULT_SONNET;
  try {
    const resp = await fetch(
      `${url}/rest/v1/model_config?provider=eq.anthropic_sonnet&select=model`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (rows?.[0]?.model) return rows[0].model;
    }
  } catch { /* fall through */ }
  return DEFAULT_SONNET;
}

async function draftReplies(posts: RankedPost[]): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || posts.length === 0) return;

  const targets = posts.slice(0, DRAFT_TOP_N);
  const model = await getSonnetModel();

  const userMessage =
    `Draft one reply per post below. Return the JSON array only.\n\n` +
    targets
      .map(
        (p, i) =>
          `POST ${i}\nAuthor: ${p.author} (@${p.handle})\nText: ${p.text}\nEngagement: ${p.likes} likes, ${p.reposts} reposts, ${p.replies} replies`,
      )
      .join("\n\n");

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system: DRAFT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[digest] Anthropic draft call failed: HTTP ${resp.status}`, body.slice(0, 500));
      return; // digest still goes out, just without drafts
    }

    const data = await resp.json();
    const text: string = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    const clean = text.replace(/```json|```/g, "").trim();
    const drafts: Array<{ index: number; angle: string; draft: string }> = JSON.parse(clean);

    for (const d of drafts) {
      const post = targets[d.index];
      if (!post) continue;
      // Enforce the Bluesky limit even if the model miscounted
      post.draft = (d.draft ?? "").slice(0, 300);
      post.draftAngle = d.angle ?? "";
    }
    console.log(`[digest] Drafted ${drafts.length} replies with ${model}`);
  } catch (err: any) {
    console.error("[digest] Reply drafting failed (digest continues without drafts):", err?.message);
  }
}

// ============================================================
// EMAIL
// ============================================================

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEmail(posts: RankedPost[]): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "Africa/Lagos",
  });

  const items = posts
    .map((p, i) => {
      const draftBlock = p.draft
        ? `<div style="margin-top:10px;padding:10px 12px;background:#eef6f1;border-left:3px solid #2f855a;border-radius:0 6px 6px 0;">
             <div style="font-size:11px;color:#2f855a;font-weight:700;text-transform:uppercase;margin-bottom:4px;">
               Suggested reply · ${esc(p.draftAngle || "")} · ${p.draft.length}/300 chars
             </div>
             <div style="font-size:14px;color:#1a202c;white-space:pre-wrap;">${esc(p.draft)}</div>
             <div style="font-size:11px;color:#718096;margin-top:6px;">Edit before posting — make it yours.</div>
           </div>`
        : p.draftAngle
          ? `<div style="margin-top:8px;font-size:12px;color:#a0aec0;">No draft: ${esc(p.draftAngle)}</div>`
          : "";

      return `
      <div style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:13px;color:#718096;">#${i + 1} · ${esc(p.author)} (@${esc(p.handle)}) · ❤️ ${p.likes} 🔁 ${p.reposts} 💬 ${p.replies}</div>
        <div style="font-size:15px;color:#1a202c;margin:6px 0;white-space:pre-wrap;">${esc(p.text)}</div>
        <a href="${p.url}" style="font-size:13px;color:#3182ce;">Open on Bluesky →</a>
        ${draftBlock}
      </div>`;
    })
    .join("");

  return `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <h2 style="margin:0;color:#1a202c;">vAI Bluesky Digest</h2>
    <p style="margin:4px 0 16px 0;color:#718096;font-size:14px;">${date} · ${posts.length} posts found · pick 3–5 to engage today</p>
    <p style="margin:0 0 8px 0;font-size:13px;color:#4a5568;background:#fffaf0;border:1px solid #fbd38d;border-radius:6px;padding:8px 12px;">
      Suggested replies are starting points, not scripts. Read the post, adjust the draft in your own voice, then reply.
    </p>
    ${items}
    <p style="margin:24px 0 0 0;font-size:12px;color:#a0aec0;">
      Sent by bluesky-digest · nextvillage.community · stories: <a href="${SUBSTACK_URL}" style="color:#a0aec0;">${SUBSTACK_URL}</a>
    </p>
  </div>`;
}

async function sendDigest(posts: RankedPost[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const recipients = (process.env.DIGEST_RECIPIENTS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!apiKey || recipients.length === 0) {
    throw new Error("RESEND_API_KEY or DIGEST_RECIPIENTS not configured");
  }

  const drafted = posts.filter((p) => p.draft).length;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "digest@nextvillage.community",
      to: recipients,
      subject: `vAI Bluesky Digest — ${posts.length} posts, ${drafted} replies drafted`,
      html: formatEmail(posts),
    }),
  });
  if (!resp.ok) {
    throw new Error(`Resend failed: HTTP ${resp.status} ${await resp.text()}`);
  }
}

// ============================================================
// ORCHESTRATION
// ============================================================

async function runDigest() {
  const posts = await collectPosts();
  console.log(`[digest] Collected ${posts.length} posts`);
  if (posts.length === 0) {
    return { posts: 0, drafted: 0, note: "No matching posts today — no email sent." };
  }
  await draftReplies(posts);
  await sendDigest(posts);
  return { posts: posts.length, drafted: posts.filter((p) => p.draft).length };
}

// --- Vercel cron entry point ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["authorization"] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await runDigest();
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error("Digest cron failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// --- Standalone execution (for testing: npx ts-node bluesky-digest.ts) ---
if (typeof require !== "undefined" && require.main === module) {
  runDigest()
    .then((r) => console.log("\nDone:", r))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
