import { describe, it, expect } from 'vitest';
import { buildSsml, azureConfigured, azureSynthesize } from './azureSpeech.js';

describe('buildSsml', () => {
  it('uses the Ezinne voice and escapes markup characters', () => {
    const s = buildSsml(`Tom & "Jerry" <b> it's`);
    expect(s).toContain('en-NG-EzinneNeural');
    expect(s).toContain('Tom &amp; &quot;Jerry&quot; &lt;b&gt; it&apos;s');
    expect(s).not.toContain('<b>');
  });
});

describe('azureConfigured', () => {
  it('needs both the key and the region', () => {
    expect(azureConfigured({ AZURE_SPEECH_KEY: 'k' })).toBe(false);
    expect(azureConfigured({ AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'eastus' })).toBe(true);
  });
});

describe('azureSynthesize', () => {
  const env = { AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'eastus' };
  it('returns audio bytes and sends the key and SSML', async () => {
    let seen;
    const fake = async (url, init) => { seen = { url, init }; return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; };
    const out = await azureSynthesize('Hello there.', env, fake);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(seen.url).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(seen.init.headers['Ocp-Apim-Subscription-Key']).toBe('k');
    expect(seen.init.body).toContain('Hello there.');
  });
  it('maps a rate limit to 429 and other failures to 502', async () => {
    expect((await azureSynthesize('x', env, async () => ({ ok: false, status: 429 }))).statusCode).toBe(429);
    expect((await azureSynthesize('x', env, async () => ({ ok: false, status: 500 }))).statusCode).toBe(502);
  });
});
