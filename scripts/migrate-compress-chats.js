#!/usr/bin/env node
// scripts/migrate-compress-chats.js
//
// One-shot migration: compresses any ai_playground_chat with more than
// COMPRESSION_THRESHOLD messages using the same Haiku summariser logic
// as chat-stream.js. Safe to run multiple times — skips chats that already
// have a summary pair injected.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/migrate-compress-chats.js
//
// Or with a .env file:
//   node -r dotenv/config scripts/migrate-compress-chats.js
//
// Dry-run (no writes to Supabase):
//   DRY_RUN=true node -r dotenv/config scripts/migrate-compress-chats.js

const COMPRESSION_THRESHOLD = 30;  // compress chats with more messages than this
const KEEP_RECENT           = 20;  // keep this many recent messages verbatim
const HAIKU_MODEL           = 'claude-haiku-4-5';
const MAX_CHARS_PER_MSG     = 800; // truncate each message in the transcript

const DRY_RUN        = process.env.DRY_RUN === 'true';
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Validation ────────────────────────────────────────────────────────────────

if (!ANTHROPIC_KEY)  { console.error('❌  ANTHROPIC_API_KEY is required'); process.exit(1); }
if (!SUPABASE_URL)   { console.error('❌  SUPABASE_URL is required');       process.exit(1); }
if (!SUPABASE_KEY)   { console.error('❌  SUPABASE_SERVICE_ROLE_KEY is required'); process.exit(1); }

if (DRY_RUN) console.log('🔍  DRY RUN — no writes will be made\n');

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supabasePatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path} → ${res.status}: ${await res.text()}`);
}

// ── Haiku summariser ──────────────────────────────────────────────────────────

async function compressMessages(messages, chatTitle) {
  const splitAt        = messages.length - KEEP_RECENT;
  const toCompress     = messages.slice(0, splitAt);
  const recentMessages = messages.slice(splitAt);

  const transcript = toCompress
    .map(m => `[${(m.role || 'unknown').toUpperCase()}]: ${String(m.content || '').slice(0, MAX_CHARS_PER_MSG)}`)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:       HAIKU_MODEL,
      max_tokens:  800,
      temperature: 0.1,
      system: 'You are a conversation summariser. Write a concise factual summary of a chat history for use as context in an ongoing conversation. Include: key topics discussed, decisions made, important facts the user shared, and any code or artifacts produced. Write in third person. Be specific and dense — this replaces the full history.',
      messages: [{
        role:    'user',
        content: `Summarise this conversation history (${toCompress.length} messages, chat titled "${chatTitle}") into a compact context summary:\n\n${transcript}`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Haiku API error ${res.status}: ${err}`);
  }

  const data    = await res.json();
  const summary = data.content?.[0]?.text ?? '';
  if (!summary) throw new Error('Haiku returned empty summary');

  const usage = data.usage ?? {};

  const summaryPair = [
    {
      role:    'user',
      content: `[Earlier conversation summary — ${toCompress.length} messages compressed]`,
    },
    {
      role:      'assistant',
      content:   `[SUMMARY OF EARLIER CONVERSATION]\n${summary}`,
      timestamp: new Date().toISOString(),
    },
  ];

  return {
    compressed: [...summaryPair, ...recentMessages],
    inputTokens:  usage.input_tokens  ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    compressedCount: toCompress.length,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📥  Fetching all ai_playground_chats...\n');

  const chats = await supabaseGet('ai_playground_chats?select=id,user_id,title,messages,updated_at&order=updated_at.desc');
  console.log(`    Found ${chats.length} total chats\n`);

  const toProcess = chats.filter(chat => {
    const msgs = chat.messages;
    if (!Array.isArray(msgs) || msgs.length <= COMPRESSION_THRESHOLD) return false;
    // Skip chats already compressed (summary pair present)
    const alreadyCompressed = msgs.some(m =>
      typeof m.content === 'string' && m.content.includes('[Earlier conversation summary')
    );
    if (alreadyCompressed) {
      console.log(`⏭️   Skipping "${chat.title}" — already compressed (${msgs.length} msgs)`);
      return false;
    }
    return true;
  });

  if (toProcess.length === 0) {
    console.log('✅  No chats need compression.');
    return;
  }

  console.log(`🗜️   ${toProcess.length} chat(s) need compression:\n`);
  toProcess.forEach(c => {
    const estTokens = Math.round(
      c.messages.reduce((s, m) => s + String(m.content || '').length, 0) / 4
    );
    console.log(`    • "${c.title}" — ${c.messages.length} msgs, ~${estTokens.toLocaleString()} tokens`);
    console.log(`      id=${c.id}  user=${c.user_id}`);
  });
  console.log();

  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let successCount      = 0;

  for (const chat of toProcess) {
    const label = `"${chat.title}" (${chat.messages.length} msgs)`;
    process.stdout.write(`  🔄  Compressing ${label}...`);

    try {
      const { compressed, inputTokens, outputTokens, compressedCount } =
        await compressMessages(chat.messages, chat.title);

      totalInputTokens  += inputTokens;
      totalOutputTokens += outputTokens;

      const costUsd = (inputTokens / 1e6) * 1.0 + (outputTokens / 1e6) * 5.0;

      process.stdout.write(` done\n`);
      console.log(`      compressed ${compressedCount} → summary pair + ${compressed.length - 2} recent msgs`);
      console.log(`      tokens: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out  (~$${costUsd.toFixed(4)})`);
      console.log(`      result: ${compressed.length} total msgs`);

      if (!DRY_RUN) {
        await supabasePatch(
          `ai_playground_chats?id=eq.${chat.id}`,
          { messages: compressed, updated_at: new Date().toISOString() }
        );
        console.log(`      ✅  Written to Supabase`);
      } else {
        console.log(`      🔍  DRY RUN — would write ${compressed.length} messages`);
      }

      successCount++;

      // Brief pause between Haiku calls to avoid rate limits
      if (toProcess.indexOf(chat) < toProcess.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }

    } catch (err) {
      console.log(` ❌  FAILED`);
      console.error(`      Error: ${err.message}`);
    }

    console.log();
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalCost = (totalInputTokens / 1e6) * 1.0 + (totalOutputTokens / 1e6) * 5.0;
  console.log('─────────────────────────────────────────');
  console.log(`✅  Done: ${successCount}/${toProcess.length} chats compressed`);
  console.log(`   Total Haiku tokens: ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out`);
  console.log(`   Total Haiku cost:   ~$${totalCost.toFixed(4)}`);
  if (DRY_RUN) console.log('\n🔍  DRY RUN complete — rerun without DRY_RUN=true to apply changes');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
