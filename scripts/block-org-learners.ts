/**
 * Stop an organization's learners (students and learners, never leaders or administrators) from signing in,
 * keeping all of their data. Reversible.
 *
 *   npm run org:block-learners -- "Back to Basics Youth Education"            # dry run: lists who
 *   npm run org:block-learners -- "Back to Basics Youth Education" --confirm  # blocks sign-in
 *   npm run org:block-learners -- "Back to Basics Youth Education" --undo --confirm   # lets them in again
 *
 * Accepts an organization name or id. Without --confirm nothing is changed.
 *
 * It sets Supabase's login block on each learner's account (about 100 years; "none" lifts it). The profile,
 * sessions, files and scores are untouched. A signed-in session ends when its token next refreshes, within
 * about an hour. Use the Supabase dashboard (Authentication, Users) to see or lift an individual block.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run via npm run org:block-learners).');
  process.exit(1);
}

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const confirm = args.includes('--confirm');
const undo = args.includes('--undo');
if (!target) {
  console.error('Usage: npm run org:block-learners -- <organization name or id> [--undo] [--confirm]');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const orgQuery = sb.from('organizations').select('id, name');
  const { data: org, error: orgErr } = UUID.test(target!) ? await orgQuery.eq('id', target!).maybeSingle() : await orgQuery.eq('name', target!).maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) { console.error(`No organization found for ${target}`); process.exit(1); }

  const { data: people, error } = await sb.from('profiles').select('id, name, email, role')
    .eq('organization_id', org.id).in('role', ['student', 'learner']).order('name');
  if (error) throw error;
  const { count: others } = await sb.from('profiles').select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id).not('role', 'in', '(student,learner)');

  console.log(`${org.name}: ${people?.length ?? 0} learner accounts will be ${undo ? 'allowed to sign in again' : 'blocked from signing in'}; ${others ?? 0} leaders/staff are not touched.`);
  for (const p of people ?? []) console.log(`  ${p.name ?? '(no name)'} <${p.email}>  ${p.id}`);
  if (!confirm) { console.log('\nDry run only. Add --confirm to apply.'); return; }

  let done = 0;
  for (const p of people ?? []) {
    const { error: uErr } = await sb.auth.admin.updateUserById(p.id, { ban_duration: undo ? 'none' : '876000h' });
    if (uErr) console.error(`  FAILED ${p.email}: ${uErr.message}`); else done++;
  }
  console.log(`\n${undo ? 'Unblocked' : 'Blocked'} ${done} of ${people?.length ?? 0} accounts.`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
