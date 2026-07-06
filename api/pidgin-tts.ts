import type { VercelRequest, VercelResponse } from '@vercel/node';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'nigerian_native';
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY is not configured on the server' });
  }

  const { text } = req.body as { text?: string };
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
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
  } catch (err: unknown) {
    console.error('[pidgin-tts] Error:', err);
    return res.status(500).json({ error: 'Internal server error while generating Pidgin audio' });
  }
}
