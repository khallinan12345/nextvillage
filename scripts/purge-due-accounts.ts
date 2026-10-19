/**
 * Erase the accounts a leader scheduled for removal (inactive for 12+ months) whose 90 days are up.
 *
 *   npm run accounts:purge-due             # dry run: lists who is due and how many files they have
 *   npm run accounts:purge-due -- --confirm  # deletes their stored files and their accounts
 *
 * Only accounts with a recorded leader decision of "remove", past their date, and still inactive are
 * included (due_account_removals()). Platform administrators are never included. Same erasure as
 * `npm run user:delete`: files first (database cascades do not touch storage), then the auth user,
 * and database rows cascade. See docs/privacy-and-legal/DATA-MAP.md, "Deletion".
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run via npm run accounts:purge-due).');
  process.exit(1);
}
const confirm = process.argv.includes('--confirm');
const sb = createClient(url, key, { auth: { persistSession: false } });

async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${bucket}: ${error.message}`);
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id === null) out.push(...(await listAll(bucket, path)));
    else out.push(path);
  }
  return out;
}

async function main() {
  const { data: due, error } = await sb.rpc('due_account_removals');
  if (error) throw error;
  const list = (due ?? []) as { user_id: string; email: string; role: string; remove_after: string }[];
  if (list.length === 0) { console.log('No accounts are due for removal.'); return; }

  const { data: buckets, error: bErr } = await sb.storage.listBuckets();
  if (bErr) throw bErr;

  let accounts = 0;
  let files = 0;
  for (const a of list) {
    const found: { bucket: string; paths: string[] }[] = [];
    for (const b of buckets ?? []) {
      const paths = await listAll(b.name, a.user_id);
      if (paths.length) found.push({ bucket: b.name, paths });
    }
    const n = found.reduce((s, f) => s + f.paths.length, 0);
    console.log(`${a.email ?? a.user_id}  role=${a.role}  due since ${a.remove_after.slice(0, 10)}  files=${n}`);
    if (!confirm) continue;
    for (const f of found) {
      for (let i = 0; i < f.paths.length; i += 100) {
        const { error: rErr } = await sb.storage.from(f.bucket).remove(f.paths.slice(i, i + 100));
        if (rErr) throw new Error(`Removing from ${f.bucket}: ${rErr.message}`);
      }
    }
    const { error: dErr } = await sb.auth.admin.deleteUser(a.user_id);
    if (dErr) throw new Error(`Deleting ${a.email}: ${dErr.message}`);
    accounts += 1; files += n;
  }
  if (!confirm) console.log(`\nDry run: ${list.length} account(s) are due. Add --confirm to delete them and their files.`);
  else console.log(`\nDeleted ${accounts} account(s) and ${files} file(s).`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
