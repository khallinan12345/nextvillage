import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Buffer } from 'buffer';

const GROQ_TRANSLATION_URL = 'https://api.groq.com/openai/v1/audio/translations';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured' });
  }

  const { audioBase64, fileName = 'voice.webm' } = req.body as {
    audioBase64?: string;
    fileName?: string;
  };

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(400).json({
      error: 'Request body must include audioBase64 as a base64-encoded string.',
    });
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const audioBlob = new Blob([audioBuffer], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', audioBlob, fileName);
    formData.append('model', 'whisper-large-v3-turbo');

    const response = await fetch(GROQ_TRANSLATION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: `Groq translation request failed: ${body}`,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
}
