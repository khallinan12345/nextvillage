// supabase/functions/generate-video/index.ts
//
// Video generation via two models:
//   (1) text only            → wan-video/wan-2.2-t2v-fast
//   (2) image-to-video       → vidu/q3-pro  (start_image only)
//   (3) start + end frame    → vidu/q3-pro  (start_image + end_image)
//
// Vidu Q3 Pro requires public URLs — base64 images are uploaded to
// Supabase Storage (bucket: ai-videos) and signed URLs are passed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REPLICATE_T2V = 'https://api.replicate.com/v1/models/wan-video/wan-2.2-t2v-fast/predictions';
const REPLICATE_I2V = 'https://api.replicate.com/v1/models/vidu/q3-pro/predictions';
const FRAME_BUCKET  = 'ai-videos'; // Supabase Storage bucket — must be public

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

// Upload a base64 string to Supabase Storage and return a public URL.
async function uploadFrameImage(
  supabase: ReturnType<typeof createClient>,
  base64: string,
  userId: string,
  label: 'start' | 'end',
): Promise<string> {
  const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const path   = `${userId}/${Date.now()}-${label}.png`;
  const { error } = await supabase.storage
    .from(FRAME_BUCKET)
    .upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`Storage upload failed (${label}): ${error.message}`);
  const { data } = supabase.storage.from(FRAME_BUCKET).getPublicUrl(path);
  return data.publicUrl;
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
    const { prompt, negative_prompt, num_frames, image, last_image } = body;

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const safePrompt    = prompt.trim().slice(0, 500);
    const safeNegPrompt = (negative_prompt ?? 'low quality, blurry, distorted, watermark').slice(0, 300);
    const safeFrames    = Math.min(Math.max(num_frames ?? 121, 25), 129);
    const hasStart      = typeof image      === 'string' && image.length > 0;
    const hasEnd        = typeof last_image === 'string' && last_image.length > 0;

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
    let endpoint: string;
    let replicateInput: Record<string, unknown>;

    if (hasStart) {
      // ── Vidu Q3 Pro — I2V or start+end ──────────────────────────────────
      endpoint = REPLICATE_I2V;

      // Upload frame images to Storage to get public URLs
      const startUrl = await uploadFrameImage(supabase, image, user.id, 'start');
      const endUrl   = hasEnd
        ? await uploadFrameImage(supabase, last_image, user.id, 'end')
        : null;

      replicateInput = {
        prompt:      safePrompt,
        duration:    5,
        resolution:  '720p',
        aspect_ratio: '16:9',
        audio:       false,
        start_image: startUrl,
        ...(endUrl ? { end_image: endUrl } : {}),
      };

      console.log(`[generate-video] Vidu Q3 Pro — ${endUrl ? 'start+end' : 'I2V'} mode`);

    } else {
      // ── Wan 2.2 T2V Fast — text only ────────────────────────────────────
      endpoint = REPLICATE_T2V;

      replicateInput = {
        prompt:          safePrompt,
        negative_prompt: safeNegPrompt,
        num_frames:      safeFrames,
        fps:             24,
        fast_mode:       'Balanced',
        aspect_ratio:    '16:9',
      };

      console.log(`[generate-video] Wan 2.2 T2V Fast — text-only mode`);
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

    console.log(`[generate-video] Job ${jobId} → Replicate ${replicateId}`);

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
