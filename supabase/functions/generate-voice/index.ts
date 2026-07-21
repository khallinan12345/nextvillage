// supabase/functions/generate-voice/index.ts
//
// Voice generation via Kokoro TTS on Replicate.
// Model: jaaari/kokoro-82m — same Kokoro v1.0 (82M params, StyleTTS2) model
// previously deployed as hexgrad/kokoro-82m, which was removed from
// Replicate entirely (predictions returned 404 "Model not found"). This
// community deployment has no official/default version configured, so it
// must be called via the generic /v1/predictions endpoint with an explicit
// version hash — the /v1/models/{owner}/{name}/predictions shorthand 404s
// for it. If this version is ever retired, look up the current
// latest_version at https://replicate.com/jaaari/kokoro-82m/versions.
// Uses the same Replicate API token already configured for video generation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REPLICATE_TTS = 'https://api.replicate.com/v1/predictions';
const REPLICATE_TTS_VERSION = 'f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function logEvent(supabase: ReturnType<typeof createClient>, payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'generate-voice',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block for logging */ }
}

// Map our preset voice IDs → Kokoro voice names
// Full list: https://huggingface.co/hexgrad/Kokoro-82M
const VOICE_MAP: Record<string, string> = {
  'female-sharonlee': 'af_sarah',      // American female, warm
  'female-sarah':     'af_sarah',      // American female
  'female-luna':      'bf_emma',       // British female, calm
  'female-aria':      'af_sky',        // American female, energetic
  'male-adam':        'am_adam',       // American male, deep
  'male-charlie':     'am_michael',    // American male, friendly
  'male-liam':        'bm_lewis',      // British male, authoritative
  'male-oliver':      'bm_george',     // British male, storyteller
};

// Map emotion → Kokoro speed tweaks (Kokoro doesn't have emotion params,
// so we use speed as the main expressive lever)
const EMOTION_SPEED: Record<string, number> = {
  neutral:   1.0,
  happy:     1.1,
  sad:       0.85,
  surprised: 1.15,
  angry:     1.2,
  fearful:   0.9,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // ── Parse request ────────────────────────────────────────────────────────
    const { script, voice_id, emotion = 'neutral', speed = 1.0 } = await req.json();

    if (!script?.trim()) return new Response(
      JSON.stringify({ error: 'Script is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const replicateToken = (Deno.env.get('REPLICATE_API_TOKEN') ?? '').trim();
    if (!replicateToken) return new Response(
      JSON.stringify({ error: 'REPLICATE_API_TOKEN not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const kokoroVoice = VOICE_MAP[voice_id] ?? 'af_sarah';
    // Combine user speed selection with emotion speed modifier
    const emotionMod  = EMOTION_SPEED[emotion] ?? 1.0;
    const finalSpeed  = Math.round(speed * emotionMod * 10) / 10;

    // ── Call Replicate synchronously (Kokoro is fast enough) ────────────────
    // Use Prefer: respond-sync to wait for result directly (avoids polling)
    console.log(`[generate-voice] voice=${kokoroVoice} speed=${finalSpeed} script="${script.trim().slice(0, 60)}…"`);

    const replicateRes = await fetch(REPLICATE_TTS, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${replicateToken}`,
        'Content-Type':  'application/json',
        'Prefer':        'wait=60',  // wait up to 60s for result
      },
      body: JSON.stringify({
        version: REPLICATE_TTS_VERSION,
        input: {
          text:   script.trim().slice(0, 500),
          voice:  kokoroVoice,
          speed:  finalSpeed,
        },
      }),
    });

    if (!replicateRes.ok) {
      const errText = await replicateRes.text();
      console.error('[generate-voice] Replicate error:', replicateRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Replicate error ${replicateRes.status}: ${errText.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prediction = await replicateRes.json();
    console.log('[generate-voice] Replicate status:', prediction.status);

    // If not completed yet (Prefer:wait timed out), poll once more
    let audioUrl: string | null = null;

    if (prediction.status === 'succeeded') {
      audioUrl = prediction.output as string;
    } else if (prediction.status === 'processing' || prediction.status === 'starting') {
      // Poll every 3s for up to 60s
      const pollUrl = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(pollUrl, {
          headers: { 'Authorization': `Bearer ${replicateToken}` },
        });
        const pollData = await pollRes.json();
        console.log(`[generate-voice] Poll ${i + 1}: ${pollData.status}`);
        if (pollData.status === 'succeeded') {
          audioUrl = pollData.output as string;
          break;
        }
        if (pollData.status === 'failed' || pollData.status === 'canceled') {
          throw new Error('Voice generation failed: ' + (pollData.error ?? pollData.status));
        }
      }
    } else if (prediction.status === 'failed') {
      throw new Error('Voice generation failed: ' + (prediction.error ?? 'unknown'));
    }

    if (!audioUrl) throw new Error('Voice generation timed out — please try again');

    // voice_generations.id is a uuid column — must generate a fresh one here,
    // never reuse Replicate's own prediction id (not a UUID), or the insert
    // below fails silently and every later voice-status poll 404s.
    const jobId = crypto.randomUUID();

    // ── Upload to ai-voices bucket for permanent storage ─────────────────────
    // Mirrors voice-status's own upload step, done here since this function
    // already has the final result — so the row is inserted already-complete
    // (status 'succeeded' + saved_audio_url set) and voice-status's existing
    // "already succeeded" fast path returns it correctly on the first poll,
    // with no changes needed to voice-status or the frontend poll loop.
    let savedAudioUrl = audioUrl; // fallback to the ephemeral Replicate URL
    try {
      const audioRes = await fetch(audioUrl);
      if (audioRes.ok) {
        const audioBuffer = await audioRes.arrayBuffer();
        const storagePath = `${user.id}/${jobId}.mp3`;
        const { error: uploadError } = await supabase.storage
          .from('ai-voices')
          .upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

        if (!uploadError) {
          const { data: signed } = await supabase.storage
            .from('ai-voices')
            .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
          if (signed?.signedUrl) savedAudioUrl = signed.signedUrl;
        } else {
          console.warn('[generate-voice] Storage upload failed:', uploadError.message);
        }
      }
    } catch (uploadErr) {
      console.warn('[generate-voice] Storage upload exception:', uploadErr);
    }

    // ── Save record to DB ─────────────────────────────────────────────────
    const { error: dbError } = await supabase
      .from('voice_generations')
      .insert({
        id:              jobId,
        user_id:         user.id,
        script:          script.trim(),
        voice_id,
        emotion,
        speed,
        status:          'succeeded',
        audio_url:       audioUrl,
        saved_audio_url: savedAudioUrl,
        saved_at:        new Date().toISOString(),
        created_at:      new Date().toISOString(),
        replicate_id:    prediction.id ?? null,
      });

    if (dbError) console.warn('[generate-voice] DB insert warning:', dbError.message);

    console.log('[generate-voice] Done. jobId:', jobId, 'audioUrl:', savedAudioUrl.slice(0, 60));

    return new Response(
      JSON.stringify({ audioUrl: savedAudioUrl, jobId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[generate-voice] Error:', err);
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
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});