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
//   ANTHROPIC_API_KEY         — already configured for other Deno functions
//                               (evaluate-challenge-submission, etc.) — used
//                               here to classify the prompt before generating
//   RESEND_API_KEY            — new: for the community-leader safety alert
//   SAFETY_ALERT_FALLBACK_EMAIL — new: comma-separated address(es) that
//     always get a copy of a safety alert, in addition to any leader(s)
//     resolved for the student's organization. This is a *separate* secrets
//     store from the Vercel env vars of the same name used by
//     api/_lib/safetyGuardrails.js — set it here too, independently.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// FLUX Schnell — official Replicate deployment, uses /v1/models/ path
const REPLICATE_API = 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions';

// Appended server-side only to what's sent to the model — never shown to the
// learner and never stored as part of their prompt (image_generations.prompt
// stays exactly what they typed, for display/reuse).
const SAFETY_SUFFIX = 'No violence, blood, gore, weapons, or graphic injury. Family-friendly, appropriate for children.';

// ── Prompt moderation + community-leader escalation ────────────────────────
//
// SAFETY_SUFFIX above only steers the *model's* output toward being
// non-graphic — it says nothing about a prompt that's simply racist, sexist,
// or otherwise harmful even if the resulting image wouldn't be violent. This
// classifies the learner's own typed prompt (mirrors api/_lib/safetyGuardrails.js
// on the Vercel side, reimplemented here since Deno Edge Functions and Vercel
// functions are separate deploy targets that can't share a module) and, if
// flagged, blocks generation and emails the student's community leader(s)
// instead of silently producing (or silently refusing) the image.

type SafetyCategory = 'none' | 'self_harm' | 'harm_to_others' | 'hate_or_discriminatory';

const MODERATION_SYSTEM_PROMPT = `You are a strict safety classifier for image prompts written by students on an educational platform. Read the student's image description and reply with exactly one word, nothing else — no punctuation, no explanation:

none — the prompt is fine.
self_harm — depicts or references self-harm, suicide, or personal crisis.
harm_to_others — depicts or references violence, threats, or harm toward a specific person or group.
hate_or_discriminatory — racist, sexist, or otherwise demeans/discriminates against a person or group.

If unsure, or the prompt is borderline, reply none — this classifier only escalates clear cases.`;

async function moderatePrompt(text: string): Promise<SafetyCategory> {
  const trimmed = text.trim();
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (trimmed.length < 3 || !apiKey) return 'none'; // fail open — backup layer, not the only one
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        temperature: 0,
        system: MODERATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: trimmed.slice(0, 500) }],
      }),
    });
    if (!upstream.ok) return 'none';
    const data = await upstream.json();
    const raw = ((data?.content ?? []).find((b: { type: string }) => b?.type === 'text')?.text ?? '').trim().toLowerCase();
    const categories: SafetyCategory[] = ['self_harm', 'harm_to_others', 'hate_or_discriminatory'];
    return categories.find(c => raw.includes(c)) ?? 'none';
  } catch {
    return 'none'; // never let a classifier failure block a legitimate image
  }
}

const SAFETY_FALLBACK_EMAILS = (Deno.env.get('SAFETY_ALERT_FALLBACK_EMAIL') ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ── PII scrubbing (mirrors api/_lib/piiScrubbing.js on the Vercel side) ─────
//
// Removes personal information from the learner's own typed prompt before
// it's sent to the image model — the learner's own first name is the only
// personal detail allowed through. Two layers: a regex pass (emails, phone
// numbers, handles, street addresses — zero cost, always runs) then an LLM
// rewrite pass for names/schools/locations the regex can't catch. On any
// failure this falls back no further than the regex-scrubbed text — never
// back to the original raw prompt.
//
// Only what's sent to Replicate is scrubbed — the original prompt is still
// what's stored in image_generations and shown back to the student for
// "reuse prompt" (that's a display of their own text to themselves, not a
// call to an AI model, so the scrub requirement doesn't apply to it).

const IMG_EMAIL_RE  = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IMG_PHONE_RE  = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const IMG_HANDLE_RE = /(?<![\w@])@[A-Za-z0-9_]{2,}/g;
const IMG_STREET_RE = /\b\d{1,6}\s+([A-Z][a-z]+\s){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\.?\b/g;

function regexScrubPrompt(text: string): string {
  return text
    .replace(IMG_EMAIL_RE, '[email removed]')
    .replace(IMG_PHONE_RE, '[phone number removed]')
    .replace(IMG_HANDLE_RE, '[handle removed]')
    .replace(IMG_STREET_RE, '[address removed]');
}

async function fetchFirstName(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle();
    const name = (data as { name?: string } | null)?.name;
    if (!name) return null;
    return name.trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

async function scrubPromptPII(text: string, firstName: string | null): Promise<string> {
  const regexScrubbed = regexScrubPrompt(text);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey || !regexScrubbed.trim()) return regexScrubbed;

  const system = `You rewrite an image description written by a student, to remove personal information before it reaches an image-generation model. Rewrite it, keeping the visual description intent exactly as written, EXCEPT:

- Remove any last name / family name. ${firstName ? `The student's own first name is "${firstName}" — you may keep that one word if it appears.` : 'Remove any first name too, since none is confirmed for this student.'}
- Remove any other person's name.
- Remove school names, exact addresses, towns/neighborhoods, and other specific location details.
- Some personal info may already be replaced with [placeholders] — leave those as-is.

Replace anything removed with a short neutral placeholder like [name removed], [school removed] — keep the description usable for generating an image. Reply with ONLY the rewritten description, nothing else — no preamble, no quotes.`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: regexScrubbed.slice(0, 2000) }],
      }),
    });
    if (!upstream.ok) return regexScrubbed;
    const data = await upstream.json();
    const rewritten = (data?.content ?? []).find((b: { type: string }) => b?.type === 'text')?.text;
    return (rewritten && rewritten.trim()) ? rewritten.trim() : regexScrubbed;
  } catch {
    return regexScrubbed; // never fall back further than the regex pass
  }
}

const CATEGORY_LABELS: Record<SafetyCategory, string> = {
  none:                   'none',
  self_harm:              'Possible self-harm / distress',
  harm_to_others:         'Possible threat or harm toward someone else',
  hate_or_discriminatory: 'Racist, sexist, or discriminatory content',
};

// Resolve the student's community leader(s) the same way api/_lib/safetyGuardrails.js
// does on the Vercel side: profiles.organization_id -> profiles where role='leader'
// in that organization. Uses the already-authenticated service-role `supabase`
// client rather than a second raw REST call.
async function notifyLeadersOfSafetyFlag(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  category: SafetyCategory,
  prompt: string,
) {
  const leaderEmails = new Set(SAFETY_FALLBACK_EMAILS);
  let student: { name: string | null; email: string | null; city: string | null } | null = null;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email, city, organization_id')
      .eq('id', userId)
      .maybeSingle();
    student = profile ?? null;

    if (profile?.organization_id) {
      const { data: leaders } = await supabase
        .from('profiles')
        .select('email')
        .eq('organization_id', profile.organization_id)
        .eq('role', 'leader');
      (leaders ?? []).forEach((l: { email: string | null }) => l?.email && leaderEmails.add(l.email));
    }
  } catch { /* fall back to SAFETY_FALLBACK_EMAILS only */ }

  await logEvent(supabase, {
    event_type: `safety_flag_${category}`,
    severity:   'critical',
    details:    { prompt, student_email: student?.email ?? null, student_name: student?.name ?? null, city: student?.city ?? null },
  });

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!leaderEmails.size || !resendKey) return;

  const categoryLabel = CATEGORY_LABELS[category];
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from:    'safety@nextvillage.community',
        to:      [...leaderEmails],
        subject: `[Safety Flag] ${categoryLabel} — ${student?.name || student?.email || 'a student'}`,
        html: `<h2>${categoryLabel}</h2>
<p><strong>Student:</strong> ${student?.name ?? 'unknown'} (${student?.email ?? 'no email on file'})</p>
<p><strong>City/community:</strong> ${student?.city ?? 'unknown'}</p>
<p><strong>Page:</strong> AI Image Creation</p>
<p><strong>When:</strong> ${new Date().toISOString()}</p>
<p><strong>What was requested</strong> (an image prompt, automatically flagged by an AI classifier and blocked — please review directly with the student before assuming intent):</p>
<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#333;">${prompt.replace(/</g, '&lt;').slice(0, 1000)}</blockquote>
<p>The image was not generated. This is an automated flag — please follow up with the student.</p>`,
      }),
    });
  } catch { /* never block the response for an alert email */ }
}

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

    // ── Moderate the prompt before generating anything ─────────────────────
    // Unlike the chat guardrails (which flag-and-alert without blocking, so
    // the model's own caring response still reaches the student), an image
    // prompt has no equivalent "helpful" response to fall back on — a flagged
    // prompt is refused outright, not generated. The leader alert still
    // fires either way.
    const flaggedCategory = await moderatePrompt(safePrompt);
    if (flaggedCategory !== 'none') {
      notifyLeadersOfSafetyFlag(supabase, user.id, flaggedCategory, safePrompt).catch(() => {});
      return new Response(
        JSON.stringify({ error: "Let's try a different idea for your picture — ask a facilitator if you're not sure why this one didn't work." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Scrub personal info before this ever reaches the image model ──────
    // The original safePrompt is still what's stored below and shown back
    // to the student — only what's sent to Replicate uses the scrubbed text.
    const firstName    = await fetchFirstName(supabase, user.id);
    const scrubbedPrompt = await scrubPromptPII(safePrompt, firstName);

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
          prompt:       `${scrubbedPrompt}. ${SAFETY_SUFFIX}`,
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