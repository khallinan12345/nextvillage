// supabase/functions/sync-offline-entrepreneurship-consultations/index.ts
//
// Syncs offline entrepreneurship consultations from
// entrepreneurship-advisor-offline.html into Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const EXPECTED_SYNC_KEY = Deno.env.get('ENTREPRENEUR_OFFLINE_SYNC_KEY') ?? 'vai-entrepreneur-offline-2024-oloibiri';
const OFFLINE_USER_ID   = '00000000-0000-0000-0000-000000000000';

const VALID_CONSULT_TYPES = new Set([
  'starting-up', 'business-planning', 'pricing-finance',
  'marketing-sales', 'fixing-problems', 'growing-scaling',
]);

const VALID_URGENCY = new Set(['low', 'medium', 'high', 'urgent']);

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'sync-offline-entrepreneurship-consultations',
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
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS_HEADERS });
  }

  const consultations = body.consultations ?? [];
  if (consultations.length === 0) {
    return new Response(JSON.stringify({ ok: true, synced: [], errors: [] }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

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
      const client = c.client ?? {};
      const clientName    = (client.name          ?? 'Unknown').trim();
      const village       = (client.village        ?? 'Oloibiri').trim();
      const businessType  = (client.business_type  ?? 'general').trim();
      const businessStage = (client.business_stage ?? 'Just started (0–6 months)').trim();

      const { data: existingClient } = await supabase
        .from('entrepreneurship_clients')
        .select('id')
        .eq('client_name', clientName)
        .eq('village', village)
        .limit(1)
        .maybeSingle();

      let clientId: string;

      if (existingClient) {
        clientId = existingClient.id;
        await supabase
          .from('entrepreneurship_clients')
          .update({
            phone:          client.phone  ?? null,
            business_type:  businessType,
            business_stage: businessStage,
            notes:          client.notes  ?? null,
          })
          .eq('id', clientId)
          .is('phone', null);
      } else {
        const { data: newClient, error: clientErr } = await supabase
          .from('entrepreneurship_clients')
          .insert({
            youth_user_id:  OFFLINE_USER_ID,
            client_name:    clientName,
            village:        village,
            phone:          client.phone  ?? null,
            business_type:  businessType,
            business_stage: businessStage,
            notes:          client.notes  ?? null,
          })
          .select('id')
          .single();

        if (clientErr) throw new Error(`entrepreneurship_clients insert: ${clientErr.message}`);
        clientId = newClient.id;
      }

      const rawType      = (c.consultType ?? '').toLowerCase().trim();
      const consultType  = VALID_CONSULT_TYPES.has(rawType) ? rawType : 'fixing-problems';

      const rawUrgency   = (c.result?.urgency ?? '').toLowerCase().trim();
      const urgencyLevel = VALID_URGENCY.has(rawUrgency) ? rawUrgency : 'low';

      const intakeLines = Object.entries(c.intake ?? {})
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(' | ');

      const reasonsText    = (c.result?.reasons ?? []).join('. ');
      const problemSummary = [intakeLines, reasonsText].filter(Boolean).join('\n').slice(0, 1000) || 'Offline consultation';

      const immediate  = (c.result?.immediateActions  ?? []).map((a: string) => '• ' + a).join('\n');
      const mediumTerm = (c.result?.mediumTermActions  ?? []).map((a: string) => '• ' + a).join('\n');
      const incomeTips = (c.result?.incomeTips         ?? []).map((t: string) => '₦ ' + t).join('\n');
      const aiTools    = (c.result?.aiTools            ?? []).map((t: string) => '🤖 ' + t).join('\n');
      const referrals  = (c.result?.referrals          ?? []).map((r: any) => `→ ${r.who}: ${r.why}`).join('\n');

      const aiAdvice = [
        immediate  ? `IMMEDIATE ACTIONS:\n${immediate}`   : '',
        mediumTerm ? `FOLLOW-UP:\n${mediumTerm}`          : '',
        incomeTips ? `FINANCIAL INSIGHT:\n${incomeTips}`  : '',
        aiTools    ? `AI TOOLS:\n${aiTools}`              : '',
        referrals  ? `REFERRALS:\n${referrals}`           : '',
      ].filter(Boolean).join('\n\n').slice(0, 2000);

      const { error: consultErr } = await supabase
        .from('entrepreneurship_consultations')
        .insert({
          youth_user_id:        OFFLINE_USER_ID,
          client_id:            clientId,
          consultation_type:    consultType,
          problem_summary:      problemSummary,
          ai_advice:            aiAdvice || null,
          urgency_level:        urgencyLevel,
          youth_actions_taken:  null,
          conversation_history: [],
          follow_up_needed:     urgencyLevel === 'urgent' || urgencyLevel === 'high',
          follow_up_date:       null,
          follow_up_notes:      null,
          resolved:             false,
          created_at:           c.ts ?? new Date().toISOString(),
        });

      if (consultErr) throw new Error(`entrepreneurship_consultations insert: ${consultErr.message}`);

      synced.push({ id: c.id });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Sync error for ${c.id}:`, msg);
      errors.push({ id: c.id ?? 'unknown', error: msg });
      await logEvent(supabase, {
        event_type: 'sync_error',
        severity:   'error',
        details: {
          offline_id:    c.id,
          client:        c.client?.name,
          consult_type:  c.consultType,
          error:         msg,
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