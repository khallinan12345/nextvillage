// supabase/functions/sync-offline-fishing-consultations/index.ts
//
// Syncs offline fishing consultations from the
// fishing-consultant-offline.html tool into the Supabase database.
//
// Expected body:
// {
//   consultations: [{
//     id: string,                // local ID e.g. "fish_1717000000000_ab12"
//     ts: string,                // ISO timestamp
//     fisher: {
//       name: string,
//       village: string,
//       phone?: string,
//       activities?: string[],   // e.g. ["wild-fishing", "aquaculture"]
//       waterways?: string[],    // e.g. ["Kolo Creek", "River Nun"]
//       notes?: string,
//     },
//     consultType: string,       // catch-problem | aquaculture | processing-market | oil-contamination | climate-safety
//     intake: Record<string, string>,
//     result: {
//       urgency: string,         // low | medium | high | urgent
//       reasons: string[],
//       immediateActions: string[],
//       mediumTermActions: string[],
//       referrals: { who: string; why: string; urgency: string }[],
//     },
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

// Must match FISHING_OFFLINE_SYNC_KEY secret in Supabase
const EXPECTED_SYNC_KEY = Deno.env.get('FISHING_OFFLINE_SYNC_KEY') ?? 'vai-fishing-offline-2024-oloibiri';

// Offline placeholder — consultations sync without a real logged-in user
const OFFLINE_USER_ID = '00000000-0000-0000-0000-000000000000';

// Valid values per DB constraints
const VALID_CONSULT_TYPES = new Set([
  'catch-problem', 'aquaculture', 'processing-market', 'oil-contamination', 'climate-safety',
]);
const VALID_URGENCY = new Set(['low', 'medium', 'high', 'urgent']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers: CORS_HEADERS });
  }

  let body: { consultations?: any[] };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS_HEADERS });
  }

  const consultations = body.consultations ?? [];
  if (consultations.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, synced: [], errors: [] }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Validate sync key
  if (consultations[0]?.syncKey !== EXPECTED_SYNC_KEY) {
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
      const fisher = c.fisher ?? {};

      // ── 1. Upsert fishing_clients ──────────────────────────────────────────
      // Match on client_name + village to avoid duplicates across sync sessions.
      // Since offline submissions don't have a real youth_user_id, we use the
      // offline placeholder — platform admins can re-assign later if needed.

      const clientName = (fisher.name ?? 'Unknown').trim();
      const village    = (fisher.village ?? 'Oloibiri').trim();

      // Check if a client with this name + village already exists
      const { data: existingClient } = await supabase
        .from('fishing_clients')
        .select('id')
        .eq('client_name', clientName)
        .eq('village', village)
        .limit(1)
        .maybeSingle();

      let clientId: string;

      if (existingClient) {
        clientId = existingClient.id;

        // Update phone / notes if they weren't set before
        await supabase
          .from('fishing_clients')
          .update({
            phone:      fisher.phone     ?? null,
            activities: fisher.activities ?? [],
            waterways:  fisher.waterways  ?? [],
            notes:      fisher.notes      ?? null,
          })
          .eq('id', clientId)
          .is('phone', null); // only overwrite if phone was empty
      } else {
        const { data: newClient, error: clientErr } = await supabase
          .from('fishing_clients')
          .insert({
            youth_user_id: OFFLINE_USER_ID,
            client_name:   clientName,
            village:       village,
            phone:         fisher.phone     ?? null,
            activities:    fisher.activities ?? [],
            waterways:     fisher.waterways  ?? [],
            notes:         fisher.notes      ?? null,
          })
          .select('id')
          .single();

        if (clientErr) throw new Error(`fishing_clients insert: ${clientErr.message}`);
        clientId = newClient.id;
      }

      // ── 2. Sanitise consultation_type and urgency_level ────────────────────

      const rawType    = (c.consultType ?? '').toLowerCase().trim();
      const consultType = VALID_CONSULT_TYPES.has(rawType) ? rawType : 'catch-problem';

      const rawUrgency  = (c.result?.urgency ?? '').toLowerCase().trim();
      const urgencyLevel = VALID_URGENCY.has(rawUrgency) ? rawUrgency : 'low';

      // ── 3. Build problem_summary from intake fields ────────────────────────

      const intakeLines = Object.entries(c.intake ?? {})
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(' | ');

      const reasonsText = (c.result?.reasons ?? []).join('. ');
      const problemSummary = [intakeLines, reasonsText].filter(Boolean).join('\n').slice(0, 1000);

      // ── 4. Build ai_advice from result actions ─────────────────────────────

      const immediate   = (c.result?.immediateActions   ?? []).map((a: string) => '• ' + a).join('\n');
      const mediumTerm  = (c.result?.mediumTermActions   ?? []).map((a: string) => '• ' + a).join('\n');
      const referrals   = (c.result?.referrals           ?? []).map((r: any) => `→ ${r.who}: ${r.why} (${r.urgency})`).join('\n');

      const aiAdvice = [
        immediate  ? `IMMEDIATE ACTIONS:\n${immediate}`   : '',
        mediumTerm ? `FOLLOW-UP:\n${mediumTerm}`          : '',
        referrals  ? `REFERRALS:\n${referrals}`           : '',
      ].filter(Boolean).join('\n\n').slice(0, 2000);

      // ── 5. Insert fishing_consultations ───────────────────────────────────

      const { error: consultErr } = await supabase
        .from('fishing_consultations')
        .insert({
          youth_user_id:       OFFLINE_USER_ID,
          client_id:           clientId,
          consultation_type:   consultType,
          problem_summary:     problemSummary || 'Offline consultation — no intake recorded',
          ai_advice:           aiAdvice       || null,
          urgency_level:       urgencyLevel,
          youth_actions_taken: null,
          conversation_history: [],
          follow_up_needed:    urgencyLevel === 'urgent' || urgencyLevel === 'high',
          follow_up_date:      null,
          follow_up_notes:     null,
          resolved:            false,
          created_at:          c.ts ?? new Date().toISOString(),
          // Store the raw offline payload in conversation_history as a record
          // (reuses existing jsonb column; first entry flags it as offline)
        });

      if (consultErr) throw new Error(`fishing_consultations insert: ${consultErr.message}`);

      synced.push({ id: c.id });

    } catch (err) {
      console.error(`Sync error for ${c.id}:`, err);
      errors.push({ id: c.id ?? 'unknown', error: String(err) });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, synced, errors }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});