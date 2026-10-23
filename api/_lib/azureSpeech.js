// api/_lib/azureSpeech.js
//
// Azure AI Speech, called directly (no reseller). Ezinne is Microsoft's own Nigerian English neural voice
// (en-NG-EzinneNeural); SpeechGen resells the same voice at a markup. Needs AZURE_SPEECH_KEY and
// AZURE_SPEECH_REGION (e.g. "eastus") on the server. The free tier covers 500,000 characters a month.

export const AZURE_VOICE = 'en-NG-EzinneNeural';

export function azureConfigured(env = process.env) {
  return !!(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION);
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function buildSsml(text, voice = AZURE_VOICE) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-NG">`
    + `<voice name="${voice}"><prosody rate="-5%">${xmlEscape(text)}</prosody></voice></speak>`;
}

// Returns an mp3 Buffer, or { error, statusCode }.
export async function azureSynthesize(text, env = process.env, fetchImpl = fetch) {
  const res = await fetchImpl(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'nextvillage',
    },
    body: buildSsml(text, env.AZURE_SPEECH_VOICE || AZURE_VOICE),
  });
  if (!res.ok) {
    console.error('[pidgin-tts] Azure speech error', res.status);
    return { error: 'Azure speech request failed.', statusCode: res.status === 429 ? 429 : 502 };
  }
  return Buffer.from(await res.arrayBuffer());
}
