import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      function_name: 'video-status',
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

    // ── Get jobId from query param ────────────────────────────────────────
    const url   = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch the job from DB ─────────────────────────────────────────────
    const { data: job, error: fetchError } = await supabase
      .from('video_generations')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)   // ensure user can only check their own jobs
      .single();

    if (fetchError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── If already terminal, return immediately without hitting Replicate ─
    if (job.status === 'succeeded' || job.status === 'failed') {
      return new Response(
        JSON.stringify({ status: job.status, videoUrl: job.video_url, error: job.error_message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Poll Replicate ────────────────────────────────────────────────────
    if (!job.replicate_id) {
      return new Response(JSON.stringify({ status: 'pending' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const replicateToken = Deno.env.get('REPLICATE_API_TOKEN')!;
    const replicateRes = await fetch(
      `https://api.replicate.com/v1/predictions/${job.replicate_id}`,
      { headers: { 'Authorization': `Bearer ${replicateToken}` } },
    );

    if (!replicateRes.ok) {
      return new Response(JSON.stringify({ status: 'processing' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prediction = await replicateRes.json();
    const replicateStatus = prediction.status; // starting | processing | succeeded | failed | canceled

    // ── Map Replicate status to our status ────────────────────────────────
    if (replicateStatus === 'succeeded') {
      // Output can be a string URL or array; LTX-Video returns a single URL string
      const videoUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;

      await supabase
        .from('video_generations')
        .update({ status: 'succeeded', video_url: videoUrl, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      console.log(`[video-status] Job ${jobId} succeeded: ${videoUrl}`);
      return new Response(
        JSON.stringify({ status: 'succeeded', videoUrl }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (replicateStatus === 'failed' || replicateStatus === 'canceled') {
      const errMsg = prediction.error ?? 'Generation failed';
      await supabase
        .from('video_generations')
        .update({ status: 'failed', error_message: errMsg, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      return new Response(
        JSON.stringify({ status: 'failed', error: errMsg }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Still processing
    return new Response(
      JSON.stringify({ status: 'processing' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[video-status] Unhandled error:', err);
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