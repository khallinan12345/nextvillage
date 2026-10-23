import type { VercelRequest, VercelResponse } from './_lib/vercelTypes';
import { requireUser } from './_lib/requireUser.js';
import { fetchCallerIsYoung } from './_lib/youngLearner.js';
import { NOT_AVAILABLE_FOR_AGE } from './_lib/claudeText.js';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { spokenVersion } from './_lib/speechText.js';
import { azureConfigured, azureSynthesize, AZURE_VOICE } from './_lib/azureSpeech.js';

const SPEECHGEN_API_URL = 'https://speechgen.io/index.php?r=api/text';

type VoiceMode = 'pidgin' | 'english';

// Both modes use Ezinne — the Clergy Pidgin clone voice cost 2x more per
// character and was dropped entirely to control SpeechGen spend. `mode` is
// kept (rather than collapsed away) since it's still meaningful plumbing —
// same voice today, but a distinct, cheaper-if-possible voice per mode is
// one config change away if that's ever wanted again.
const VOICE_BY_MODE: Record<VoiceMode, string> = {
  pidgin: 'Ezinne',
  english: 'Ezinne',
};

// ElevenLabs fallback (commented out — restore if reverting from SpeechGen)
// const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

interface SpeechGenSuccessResponse {
  status: 1;
  file?: string;
  file_cors?: string;
}

interface SpeechGenErrorResponse {
  status: -1;
  error?: string;
}

type SpeechGenResponse = SpeechGenSuccessResponse | SpeechGenErrorResponse;

async function generateSpeechGenAudio(text: string, mode: VoiceMode): Promise<{ audioUrl: string } | { error: string; statusCode?: number }> {
  const token = process.env.SPEECHGEN_TOKEN;
  const email = process.env.SPEECHGEN_EMAIL;
  const voice = process.env.SPEECHGEN_VOICE || VOICE_BY_MODE[mode] || 'Ezinne';

  if (!token || !email) {
    return {
      error: 'SpeechGen credentials are not configured on the server (SPEECHGEN_TOKEN, SPEECHGEN_EMAIL).',
      statusCode: 500,
    };
  }

  const response = await fetch(SPEECHGEN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
      email,
      voice,
      text,
      format: 'mp3',
      speed: 1,
      sample_rate: 24000,
      bitrate: 192,
    }),
  });

  const data = (await response.json().catch(() => null)) as SpeechGenResponse | null;

  if (!data) {
    return { error: 'SpeechGen returned an invalid response.', statusCode: 502 };
  }

  if (data.status === -1) {
    console.error('[pidgin-tts] SpeechGen error', data.error);
    return { error: data.error || 'SpeechGen TTS request failed.', statusCode: 502 };
  }

  if (data.status !== 1) {
    return { error: 'SpeechGen TTS request failed with an unexpected status.', statusCode: 502 };
  }

  const audioUrl = data.file_cors || data.file;
  if (!audioUrl) {
    return { error: 'SpeechGen response did not include an audio URL.', statusCode: 502 };
  }

  return { audioUrl };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Signed-in users only — otherwise anyone who finds this URL can spend
  // our AI credits. The browser sends the token (src/lib/apiAuthFetch.ts).
  const caller = await requireUser(req, res);
  if (!caller) return;

  // Under-13 tier: text goes to SpeechGen, which we have not vetted.
  if (await fetchCallerIsYoung(caller.id)) return res.status(403).json(NOT_AVAILABLE_FOR_AGE);

  const { text, mode } = req.body as { text?: string; mode?: VoiceMode };
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const voiceMode: VoiceMode = mode === 'english' ? 'english' : 'pidgin';

  // Voice only the part that matters: no code, links, lists or markdown, and at most a few sentences.
  const spoken = spokenVersion(text);
  if (!spoken) return res.status(200).json({ audioUrl: null, skipped: 'nothing to read aloud' });

  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const useAzure = azureConfigured();
    const provider = useAzure ? 'azure' : 'speechgen';
    const voiceName = useAzure ? (process.env.AZURE_SPEECH_VOICE || AZURE_VOICE) : (process.env.SPEECHGEN_VOICE || VOICE_BY_MODE[voiceMode]);

    // Each distinct text is generated and paid for once; later requests reuse the stored clip.
    const path = `${createHash('sha256').update(`${provider}|${voiceName}|${spoken}`).digest('hex')}.mp3`;
    const signed = (p: string) => supabase.storage.from('tts-cache').createSignedUrl(p, 60 * 60 * 6);
    const log = async (cacheHit: boolean) => {
      const { error } = await supabase.from('tts_usage').insert({ user_id: caller.id, chars: spoken.length, provider, cache_hit: cacheHit });
      if (error) console.warn('[pidgin-tts] usage log failed:', error.message);
    };

    const hit = await signed(path);
    if (hit.data?.signedUrl) {
      await log(true);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ audioUrl: hit.data.signedUrl, cached: true });
    }

    // Safety valve: a daily limit on newly generated characters per person (falls back to the browser voice).
    const cap = Number(process.env.TTS_DAILY_CHAR_CAP || 4000);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase.from('tts_usage').select('chars').eq('user_id', caller.id).eq('cache_hit', false).gte('created_at', since);
    const usedToday = (recent ?? []).reduce((n: number, r: { chars: number }) => n + r.chars, 0);
    if (usedToday + spoken.length > cap) {
      return res.status(429).json({ error: 'Daily voice limit reached. The browser voice will be used instead.' });
    }

    let audio: Buffer | null = null;
    let fallbackUrl: string | null = null;
    if (useAzure) {
      const out = await azureSynthesize(spoken);
      if (!Buffer.isBuffer(out)) return res.status(out.statusCode || 502).json({ error: out.error });
      audio = out;
    } else {
      const out = await generateSpeechGenAudio(spoken, voiceMode);
      if ('error' in out) return res.status(out.statusCode || 502).json({ error: out.error });
      fallbackUrl = out.audioUrl;
      const dl = await fetch(out.audioUrl).catch(() => null);
      if (dl?.ok) audio = Buffer.from(await dl.arrayBuffer());
    }

    await log(false);
    res.setHeader('Cache-Control', 'no-store');

    if (audio) {
      const up = await supabase.storage.from('tts-cache').upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
      if (!up.error) {
        const url = await signed(path);
        if (url.data?.signedUrl) return res.status(200).json({ audioUrl: url.data.signedUrl });
      } else {
        console.warn('[pidgin-tts] cache upload failed:', up.error.message);
      }
      if (!fallbackUrl) return res.status(200).json({ audioUrl: `data:audio/mpeg;base64,${audio.toString('base64')}` });
    }
    return res.status(200).json({ audioUrl: fallbackUrl });

  } catch (err: unknown) {
    console.error('[pidgin-tts] Error:', err);
    return res.status(500).json({ error: 'Internal server error while generating Pidgin audio' });
  }
}
