// supabase/functions/generate-image/index.ts
//
// Generates an image using FLUX Schnell on Replicate.
// Uses the blocking Prefer: wait header so the result comes back in the
// same HTTP response (FLUX Schnell completes in ~2-4 seconds).
//
// Required env vars:
//   REPLICATE_API_TOKEN       — your Replicate API token
//   SUPABASE_URL              — injected automatically
//   SUPABASE_SERVICE_ROLE_KEY — injected automatically

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// FLUX Schnell — official Replicate deployment, uses /v1/models/ path
const REPLICATE_API = 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions';

// Appended server-side only to what's sent to the model — never shown to the
// learner and never stored as part of their prompt (image_generations.prompt
// stays exactly what they typed, for display/reuse).
const SAFETY_SUFFIX = 'No violence, blood, gore, weapons, or graphic injury. Family-friendly, appropriate for children.';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'generate-image',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block for logging */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse request ─────────────────────────────────────────────────────
    const { prompt, aspect_ratio, steps } = await req.json();

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const safePrompt      = prompt.trim().slice(0, 500);
    const safeAspectRatio = ['1:1', '16:9', '9:16', '4:3', '3:4'].includes(aspect_ratio)
      ? aspect_ratio : '16:9';
    const safeSteps       = Math.min(Math.max(steps ?? 4, 1), 8);

    // ── Insert job row ────────────────────────────────────────────────────
    const { data: jobRow, error: insertError } = await supabase
      .from('image_generations')
      .insert({
        user_id:      user.id,
        prompt:       safePrompt,
        status:       'pending',
        aspect_ratio: safeAspectRatio,
        steps:        safeSteps,
      })
      .select('id')
      .single();

    if (insertError || !jobRow) {
      console.error('[generate-image] DB insert failed:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create job record' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jobId = jobRow.id;

    // ── Call Replicate (blocking — waits up to 60s for result) ────────────
    const replicateToken = (Deno.env.get('REPLICATE_API_TOKEN') ?? '').trim();
    if (!replicateToken) {
      await supabase.from('image_generations')
        .update({ status: 'failed', error_message: 'REPLICATE_API_TOKEN not configured' })
        .eq('id', jobId);
      return new Response(JSON.stringify({ error: 'Replicate not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const replicateRes = await fetch(REPLICATE_API, {
      method: 'POST',
      headers: new Headers({
        'Authorization': `Bearer ${replicateToken}`,
        'Content-Type':  'application/json',
        'Prefer':        'wait',   // blocking — returns result directly
      }),
      body: JSON.stringify({
        input: {
          prompt:       `${safePrompt}. ${SAFETY_SUFFIX}`,
          aspect_ratio: safeAspectRatio,
          num_outputs:  1,
          num_inference_steps: safeSteps,
          output_format: 'webp',
          output_quality: 90,
        },
      }),
    });

    if (!replicateRes.ok) {
      const errorText = await replicateRes.text();
      console.error('[generate-image] Replicate error:', errorText);
      await supabase.from('image_generations')
        .update({ status: 'failed', error_message: `Replicate error: ${replicateRes.status} — ${errorText}` })
        .eq('id', jobId);
      return new Response(JSON.stringify({ error: 'Image generation service error', detail: errorText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prediction = await replicateRes.json();

    // Output is array of URLs for FLUX Schnell
    const imageUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output ?? null;

    if (!imageUrl || prediction.status === 'failed') {
      const errMsg = prediction.error ?? 'Generation failed';
      await supabase.from('image_generations')
        .update({ status: 'failed', error_message: errMsg })
        .eq('id', jobId);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Save result to DB ─────────────────────────────────────────────────
    await supabase.from('image_generations')
      .update({
        status:     'succeeded',
        image_url:  imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    console.log(`[generate-image] Job ${jobId} succeeded: ${imageUrl}`);

    return new Response(
      JSON.stringify({ jobId, imageUrl, status: 'succeeded' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[generate-image] Unhandled error:', err);
    try {
      const sb = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      await logEvent(sb, {
        event_type: 'unhandled_exception',
        severity:   'critical',
        details:    { error: String(err) },
      });
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});