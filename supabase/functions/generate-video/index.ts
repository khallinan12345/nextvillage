// supabase/functions/generate-video/index.ts
//
// Video generation via Wan 2.1 I2V / T2V 720p on Replicate.
// Uses /v1/models/{owner}/{name}/predictions — no version hash needed,
// always runs the latest published version of the public model.
//
// Modes:
//   (1) text only     → wavespeedai/wan-2.2-t2v-fast
//   (2) text + image  → wavespeedai/wan-2.1-i2v-720p  (start frame pixel-locked)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REPLICATE_I2V = 'https://api.replicate.com/v1/models/wavespeedai/wan-2.1-i2v-720p/predictions';
const REPLICATE_T2V = 'https://api.replicate.com/v1/models/wavespeedai/wan-2.2-t2v-fast/predictions';

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
      function_name: 'generate-video',
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
    // ── Auth ───────────────────────────────────────────────────────────────
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

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { prompt, negative_prompt, num_frames, image } = body;

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const safePrompt    = prompt.trim().slice(0, 500);
    const safeNegPrompt = (negative_prompt ?? 'low quality, blurry, distorted, watermark').slice(0, 300);
    // Wan 2.1 720p is stable up to ~129 frames (≈5s at 24fps). Cap there for reliability.
    const safeFrames    = Math.min(Math.max(num_frames ?? 121, 25), 129);
    const hasImage      = typeof image === 'string' && image.length > 0;

    // ── Create DB job row ──────────────────────────────────────────────────
    const { data: jobRow, error: insertError } = await supabase
      .from('video_generations')
      .insert({
        user_id:    user.id,
        prompt:     safePrompt,
        status:     'pending',
        width:      1280,
        height:     720,
        num_frames: safeFrames,
      })
      .select('id')
      .single();

    if (insertError || !jobRow) {
      console.error('[generate-video] DB insert failed:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create job record' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jobId = jobRow.id;

    const replicateToken = (Deno.env.get('REPLICATE_API_TOKEN') ?? '').trim();
    if (!replicateToken) {
      await supabase.from('video_generations')
        .update({ status: 'failed', error_message: 'REPLICATE_API_TOKEN not configured' })
        .eq('id', jobId);
      return new Response(JSON.stringify({ error: 'Replicate not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Build Replicate payload ────────────────────────────────────────────
    const endpoint = hasImage ? REPLICATE_I2V : REPLICATE_T2V;

    const replicateInput: Record<string, unknown> = {
      prompt:          safePrompt,
      negative_prompt: safeNegPrompt,
      num_frames:      safeFrames,
      fps:             24,
      guide_scale:     5.0,
      shift:           8,
      steps:           30,
      fast_mode:       'Off',
    };

    if (hasImage) {
      // Replicate requires a full data URI for base64 images
      replicateInput.image = `data:image/png;base64,${image}`;
    }

    // ── Call Replicate ─────────────────────────────────────────────────────
    const replicateRes = await fetch(endpoint, {
      method: 'POST',
      headers: new Headers({
        'Authorization': `Bearer ${replicateToken}`,
        'Content-Type':  'application/json',
        'Prefer':        'respond-async',
      }),
      body: JSON.stringify({ input: replicateInput }),
    });

    if (!replicateRes.ok) {
      const errText = await replicateRes.text();
      console.error(`[generate-video] Replicate ${replicateRes.status}:`, errText);
      await supabase.from('video_generations')
        .update({ status: 'failed', error_message: `Replicate error: ${replicateRes.status} — ${errText}` })
        .eq('id', jobId);
      return new Response(JSON.stringify({ error: 'Video generation service error', detail: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prediction  = await replicateRes.json();
    const replicateId = prediction.id;

    await supabase.from('video_generations')
      .update({ replicate_id: replicateId, status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    console.log(`[generate-video] Job ${jobId} → Replicate ${replicateId} (${hasImage ? 'I2V' : 'T2V'} 720p)`);

    return new Response(
      JSON.stringify({ jobId, replicateId, status: 'processing' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[generate-video] Unhandled error:', err);
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