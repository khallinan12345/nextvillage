// supabase/functions/sync-offline-animal-consultations/index.ts
//
// Syncs offline animal husbandry consultations from the
// vai-offline-animal-husbandry.html tool into the Supabase database.
//
// Expected body:
// {
//   consultations: [{
//     id: string,           // local ID e.g. "animal_1717000000000_ab12"
//     ts: string,           // ISO timestamp
//     farmer: { name, village, phone, notes },
//     species: 'poultry' | 'goats_sheep' | 'cattle' | 'pigs',
//     intake: Record<string, string>,
//     result: { urgency, reasons, immediateActions, referrals, isolate, ... },
//     syncKey: string,
//     navigatorUserId: string,
//   }]
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const EXPECTED_SYNC_KEY = Deno.env.get('ANIMAL_OFFLINE_SYNC_KEY') ?? 'vai-animal-offline-2024-oloibiri';

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'sync-offline-animal-consultations',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block sync for logging */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers: CORS_HEADERS });
  }

  let body: { consultations?: any[] };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS_HEADERS }); }

  const consultations = body.consultations ?? [];
  if (consultations.length === 0) {
    return new Response(JSON.stringify({ ok: true, synced: [] }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  // Validate sync key
  const firstKey = consultations[0]?.syncKey;
  if (firstKey !== EXPECTED_SYNC_KEY) {
    return new Response(JSON.stringify({ error: 'Invalid sync key' }), { status: 401, headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const synced: { id: string }[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const c of consultations) {
    try {
      // Upsert farmer record
      const { data: farmer, error: farmerErr } = await supabase
        .from('animal_husbandry_farmers')
        .upsert({
          farmer_name: c.farmer?.name ?? 'Unknown',
          village: c.farmer?.village ?? 'Oloibiri',
          phone: c.farmer?.phone ?? null,
          notes: c.farmer?.notes ?? null,
          animals: [],
          youth_user_id: '00000000-0000-0000-0000-000000000000', // offline placeholder
        }, { onConflict: 'farmer_name,village', ignoreDuplicates: false })
        .select('id')
        .single();

      if (farmerErr) throw new Error(`Farmer upsert: ${farmerErr.message}`);

      // Build symptom summary from intake
      const symptomSummary = Object.entries(c.intake ?? {})
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(' | ')
        .slice(0, 1000);

      // Insert consultation
      const { error: consultErr } = await supabase
        .from('animal_husbandry_consultations')
        .insert({
          farmer_id: farmer.id,
          youth_user_id: '00000000-0000-0000-0000-000000000000',
          species: c.species,
          symptom_summary: symptomSummary,
          animals_affected: null,
          animals_total: null,
          ai_diagnosis: (c.result?.reasons ?? []).join('. '),
          urgency_level: c.result?.urgency ?? 'low',
          farmer_actions_recommended: (c.result?.immediateActions ?? []).join('\n'),
          youth_actions_taken: null,
          conversation_history: [],
          follow_up_needed: c.result?.urgency === 'emergency' || c.result?.urgency === 'high',
          follow_up_date: null,
          follow_up_notes: null,
          resolved: false,
          created_at: c.ts ?? new Date().toISOString(),
          // Store full intake + result JSON for reference
          raw_offline_payload: { intake: c.intake, result: c.result, local_id: c.id },
        });

      if (consultErr) throw new Error(`Consultation insert: ${consultErr.message}`);

      synced.push({ id: c.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ id: c.id, error: msg });
      await logEvent(supabase, {
        event_type: 'sync_error',
        severity:   'error',
        details: {
          offline_id: c.id,
          farmer:     c.farmer?.name,
          species:    c.species,
          error:      msg,
        },
      });
    }
  }

  if (errors.length > 0) {
    await logEvent(supabase, {
      event_type: 'sync_partial_failure',
      severity:   errors.length === consultations.length ? 'error' : 'warning',
      details: {
        received: consultations.length,
        synced:   synced.length,
        failed:   errors.length,
      },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, synced, errors }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});