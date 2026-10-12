/**
 * Erase one person's account and files (a deletion request).
 *
 *   npm run user:delete -- someone@example.com            # dry run: shows what would go
 *   npm run user:delete -- someone@example.com --confirm  # actually deletes
 *
 * Accepts an email or a user id. Without --confirm nothing is changed.
 * Leaders and administrators are refused unless --allow-staff is given.
 *
 * What it does:
 *   1. Removes every file stored under <user-id>/ in every storage bucket
 *      (certificates, AI images/voices/videos, projects, ...). Database
 *      cascades don't touch stored files, so this has to happen first.
 *   2. Deletes the auth user. Foreign keys cascade to the database rows that
 *      belong to them; rows that only record "who reviewed this" are detached.
 *
 * What it does NOT do (see docs/DATA-MAP.md, "Deletion"): remove the person's
 * name from other people's free text, or from emails already sent; undo
 * anonymised, aggregated research figures.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run via npm run user:delete).');
  process.exit(1);
}

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const confirm = args.includes('--confirm');
const allowStaff = args.includes('--allow-staff');
if (!target) {
  console.error('Usage: npm run user:delete -- <email-or-user-id> [--confirm] [--allow-staff]');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every file under <prefix>/ in a bucket, walking sub-folders.
async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${bucket}: ${error.message}`);
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id === null) out.push(...(await listAll(bucket, path))); // folder
    else out.push(path);
  }
  return out;
}

async function main() {
  const query = sb.from('profiles').select('id, email, role, name');
  const { data: profile, error } = UUID.test(target!)
    ? await query.eq('id', target!).maybeSingle()
    : await query.eq('email', target!.toLowerCase()).maybeSingle();
  if (error) throw error;
  if (!profile) { console.error(`No profile found for ${target}`); process.exit(1); }

  console.log(`Account: ${profile.name ?? '(no name)'} <${profile.email}>  role=${profile.role}  id=${profile.id}`);
  if (profile.role !== 'student' && profile.role !== 'learner' && !allowStaff) {
    console.error(`Refusing: role is "${profile.role}". Re-run with --allow-staff if that is intended.`);
    process.exit(1);
  }

  const { data: buckets, error: bErr } = await sb.storage.listBuckets();
  if (bErr) throw bErr;
  const files: { bucket: string; paths: string[] }[] = [];
  for (const b of buckets ?? []) {
    const paths = await listAll(b.name, profile.id);
    if (paths.length) files.push({ bucket: b.name, paths });
  }
  const total = files.reduce((n, f) => n + f.paths.length, 0);
  console.log(`Stored files: ${total}` + files.map(f => `\n  ${f.bucket}: ${f.paths.length}`).join(''));

  if (!confirm) {
    console.log('\nDry run only. Add --confirm to delete the files and the account.');
    return;
  }

  for (const f of files) {
    for (let i = 0; i < f.paths.length; i += 100) {
      const { error: rErr } = await sb.storage.from(f.bucket).remove(f.paths.slice(i, i + 100));
      if (rErr) throw new Error(`Removing from ${f.bucket}: ${rErr.message}`);
    }
  }
  const { error: dErr } = await sb.auth.admin.deleteUser(profile.id);
  if (dErr) throw new Error(`Deleting auth user: ${dErr.message}`);
  console.log(`\nDeleted ${total} files and the account ${profile.id}. Database rows cascaded.`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
