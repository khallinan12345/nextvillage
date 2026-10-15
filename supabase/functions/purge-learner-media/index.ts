// supabase/functions/purge-learner-media/index.ts
//
// Nightly media retention: removes stored files that are past their retention period and clears
// the database links to them. What is "due" is decided in SQL (media_purge_candidates); this
// function only does the Storage API deletes, which SQL cannot do.
//
// Called by pg_cron with a secret header (checked against retention_job_secret). Defaults to a dry run: nothing is deleted unless
// the body says {"dry_run": false}.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CHUNK = 100;

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // The nightly job sends a random secret kept in retention_job_secret (service role only).
  const sent = req.headers.get('x-purge-secret') ?? '';
  const { data: stored } = await sb.from('retention_job_secret').select('secret').maybeSingle();
  if (!sent || !stored?.secret || sent !== stored.secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  let body: { dry_run?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* empty body = dry run */ }
  const dryRun = body.dry_run !== false;
  const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 2000);

  const { data, error } = await sb.rpc('media_purge_candidates', { p_limit: limit });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });

  const byBucket = new Map<string, string[]>();
  for (const row of (data ?? []) as { bucket_id: string; name: string }[]) {
    byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.name]);
  }

  const summary: Record<string, { due: number; deleted: number; links_cleared: number; errors: string[] }> = {};
  for (const [bucket, names] of byBucket) {
    summary[bucket] = { due: names.length, deleted: 0, links_cleared: 0, errors: [] };
    if (dryRun) continue;
    for (let i = 0; i < names.length; i += CHUNK) {
      const chunk = names.slice(i, i + CHUNK);
      const { error: rmError } = await sb.storage.from(bucket).remove(chunk);
      if (rmError) { summary[bucket].errors.push(rmError.message); continue; }
      summary[bucket].deleted += chunk.length;
      const { data: cleared, error: refError } = await sb.rpc('media_purge_clear_references', { p_bucket: bucket, p_names: chunk });
      if (refError) summary[bucket].errors.push(`links: ${refError.message}`);
      else summary[bucket].links_cleared += Number(cleared) || 0;
    }
  }

  console.log('[purge-learner-media]', dryRun ? 'dry run' : 'real run', JSON.stringify(summary));
  return new Response(JSON.stringify({ dry_run: dryRun, summary }), { status: 200, headers: JSON_HEADERS });
});
