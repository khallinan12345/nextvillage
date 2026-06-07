// supabase/functions/voice-status/index.ts
// Polls Replicate, then uploads audio to ai-voices bucket and saves saved_audio_url.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const url   = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    if (!jobId) return new Response(
      JSON.stringify({ error: 'jobId required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const replicateToken = (Deno.env.get('REPLICATE_API_TOKEN') ?? '').trim();

    // Get job from DB
    const { data: job } = await supabase
      .from('voice_generations')
      .select('id, status, audio_url, saved_audio_url, error_message, user_id')
      .eq('id', jobId)
      .single();

    if (!job) return new Response(
      JSON.stringify({ error: 'Job not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // Already done — return cached result
    if (job.status === 'succeeded' && job.saved_audio_url) {
      return new Response(
        JSON.stringify({ status: 'succeeded', audioUrl: job.saved_audio_url }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (job.status === 'failed') {
      return new Response(
        JSON.stringify({ status: 'failed', error: job.error_message ?? 'Generation failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Poll Replicate — replicateId stored in error_message field temporarily
    const replicateId = job.error_message;
    if (!replicateId) return new Response(
      JSON.stringify({ status: 'processing' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const pollRes  = await fetch(`https://api.replicate.com/v1/predictions/${replicateId}`, {
      headers: { 'Authorization': `Bearer ${replicateToken}` },
    });
    const pollData = await pollRes.json();
    console.log(`[voice-status] jobId=${jobId} status=${pollData.status}`);

    if (pollData.status === 'succeeded') {
      const replicateUrl = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;

      // ── Upload audio to ai-voices bucket for permanent storage ──────────────
      let savedAudioUrl = replicateUrl; // fallback to Replicate URL
      try {
        const audioRes = await fetch(replicateUrl);
        if (audioRes.ok) {
          const audioBuffer = await audioRes.arrayBuffer();
          const storagePath = `${job.user_id}/${jobId}.mp3`;

          const { error: uploadError } = await supabase.storage
            .from('ai-voices')
            .upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

          if (!uploadError) {
            const { data: signed } = await supabase.storage
              .from('ai-voices')
              .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
            if (signed?.signedUrl) savedAudioUrl = signed.signedUrl;
            console.log('[voice-status] Uploaded to ai-voices:', storagePath);
          } else {
            console.warn('[voice-status] Upload failed:', uploadError.message);
          }
        }
      } catch (uploadErr) {
        console.warn('[voice-status] Upload exception:', uploadErr);
      }

      // Update DB with permanent URL
      await supabase.from('voice_generations').update({
        status:          'succeeded',
        audio_url:       replicateUrl,
        saved_audio_url: savedAudioUrl,
        error_message:   null,
        saved_at:        new Date().toISOString(),
      }).eq('id', jobId);

      return new Response(
        JSON.stringify({ status: 'succeeded', audioUrl: savedAudioUrl }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (pollData.status === 'failed' || pollData.status === 'canceled') {
      const errMsg = pollData.error ?? pollData.status;
      await supabase.from('voice_generations')
        .update({ status: 'failed', error_message: errMsg })
        .eq('id', jobId);
      return new Response(
        JSON.stringify({ status: 'failed', error: errMsg }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ status: pollData.status }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[voice-status] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});