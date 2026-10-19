/**
 * Remove the personal identification from an organization's learners while keeping everything they did.
 * IRREVERSIBLE: the names and emails are not stored anywhere afterwards.
 *
 *   npm run org:deidentify-learners -- "Back to Basics Youth Education" --prefix BtB            # dry run
 *   npm run org:deidentify-learners -- "Back to Basics Youth Education" --prefix BtB --confirm  # applies it
 *
 * Only students and learners are touched; leaders and staff are not. For each learner it:
 *   - profiles: name becomes "Former learner <prefix>-NN"; email becomes a placeholder; avatar, school name and
 *     username are cleared. Birth year, gender, city and organization are kept (for age and group analysis).
 *   - sign-in identity (Supabase auth): email becomes the placeholder; phone and profile details cleared. Any
 *     login block already set is kept.
 *   - guardian consent records: the free-text note is cleared; method, date and organization are kept.
 *
 * It does NOT touch what the learners wrote or made (chat sessions, sites, games, images, videos, scores,
 * usage records). Those may still contain names or faces they typed or uploaded, so the result is
 * de-identified at the account level only.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run via npm run org:deidentify-learners).');
  process.exit(1);
}

const args = process.argv.slice(2);
const flagValue = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const prefix = flagValue('--prefix');
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--prefix');
const confirm = args.includes('--confirm');
if (!target || !prefix) {
  console.error('Usage: npm run org:deidentify-learners -- <organization name or id> --prefix <short code> [--confirm]');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const orgQuery = sb.from('organizations').select('id, name');
  const { data: org, error: orgErr } = UUID.test(target!) ? await orgQuery.eq('id', target!).maybeSingle() : await orgQuery.eq('name', target!).maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) { console.error(`No organization found for ${target}`); process.exit(1); }

  const { data: people, error } = await sb.from('profiles').select('id, created_at')
    .eq('organization_id', org.id).in('role', ['student', 'learner']).order('created_at').order('id');
  if (error) throw error;
  const learners = people ?? [];
  console.log(`${org.name}: ${learners.length} learner accounts will lose their name, email and sign-in identity (leaders and staff untouched).`);
  const plan = learners.map((p, i) => ({
    id: p.id,
    code: `Former learner ${prefix}-${String(i + 1).padStart(2, '0')}`,
    email: `removed-${p.id.slice(0, 8)}@removed.invalid`,
  }));
  for (const p of plan) console.log(`  ${p.id}  ->  ${p.code}  <${p.email}>`);
  if (!confirm) { console.log('\nDry run only. This cannot be undone. Add --confirm to apply.'); return; }

  let done = 0;
  for (const p of plan) {
    const { error: pErr } = await sb.from('profiles')
      .update({ name: p.code, email: p.email, avatar_url: null, school_name: null, username: null })
      .eq('id', p.id);
    if (pErr) { console.error(`  FAILED profile ${p.id}: ${pErr.message}`); continue; }
    const { error: aErr } = await sb.auth.admin.updateUserById(p.id, { email: p.email, email_confirm: true, phone: '', user_metadata: {} });
    if (aErr) { console.error(`  FAILED sign-in identity ${p.id}: ${aErr.message}`); continue; }
    const { error: gErr } = await sb.from('guardian_consents').update({ note: null }).eq('learner_id', p.id);
    if (gErr) { console.error(`  FAILED consent note ${p.id}: ${gErr.message}`); continue; }
    done++;
  }
  console.log(`\nDe-identified ${done} of ${plan.length} learner accounts.`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
