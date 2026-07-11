import type { VercelRequest, VercelResponse } from '@vercel/node';

const SPEECHGEN_API_URL = 'https://speechgen.io/index.php?r=api/text';
const DEFAULT_SPEECHGEN_VOICE = 'Chioma';

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

async function generateSpeechGenAudio(text: string): Promise<{ audioUrl: string } | { error: string; statusCode?: number }> {
  const response = await fetch(SPEECHGEN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: process.env.SPEECHGEN_TOKEN || '2817806e-6b14-4ae0-943c-7006439cddee',
      email: process.env.SPEECHGEN_EMAIL || 'khallinan1@udayton.edu',
      voice: 'ClergyPidgin clone',
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

  const { text } = req.body as { text?: string };
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const result = await generateSpeechGenAudio(text);

    if ('error' in result) {
      return res.status(result.statusCode || 502).json({ error: result.error });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ audioUrl: result.audioUrl });

    // ElevenLabs fallback (commented out — restore if reverting from SpeechGen)
    /*
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'nigerian_native';
    if (!apiKey) {
      return res.status(500).json({ error: 'ELEVENLABS_API_KEY is not configured on the server' });
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.85,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('[pidgin-tts] ElevenLabs response failed', response.status, errorData);
      return res.status(response.status).json({ error: errorData?.error?.message || 'ElevenLabs TTS request failed' });
    }

    const audioBuffer = await response.arrayBuffer();
    const audioArray = Buffer.from(audioBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audioArray);
    */
  } catch (err: unknown) {
    console.error('[pidgin-tts] Error:', err);
    return res.status(500).json({ error: 'Internal server error while generating Pidgin audio' });
  }
}
