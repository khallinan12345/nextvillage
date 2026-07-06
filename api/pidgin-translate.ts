import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface TranslationRequest {
  text?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

type TranslationProvider = 'groq' | 'openai' | 'anthropic';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;

  const provider = groqKey ? 'groq'
    : openaiKey ? 'openai'
    : anthropicKey ? 'anthropic'
    : null;

  if (!provider) {
    return res.status(500).json({ error: 'No translation provider is configured on the server. Set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.' });
  }

  const { text } = req.body as TranslationRequest;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const systemPrompt = `You are an expert Nigerian Pidgin translator. Translate the exact input into simple, clear Nigerian Pidgin. Output only the raw translated text with no explanation, no labels, and no additional punctuation or quotes.`;

  const anthropicMessages: AnthropicMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Translate this English text into Nigerian Pidgin: ${text.trim()}` },
  ];

  let providerUrl = '';
  let providerApiKey = '';
  let providerModel = '';
  let requestBody: Record<string, any>;

  if (provider === 'groq') {
    providerUrl = GROQ_API_URL;
    providerApiKey = groqKey!;
    providerModel = 'llama-3.3-70b-versatile';
    requestBody = {
      model: providerModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.trim() },
      ],
      max_tokens: 300,
      temperature: 0.3,
    };
  } else if (provider === 'openai') {
    providerUrl = OPENAI_API_URL;
    providerApiKey = openaiKey!;
    providerModel = 'gpt-3.5-turbo';
    requestBody = {
      model: providerModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.trim() },
      ],
      max_tokens: 300,
      temperature: 0.3,
    };
  } else {
    providerUrl = ANTHROPIC_API_URL;
    providerApiKey = anthropicKey!;
    providerModel = 'claude-sonnet-4-6';
    requestBody = {
      model: providerModel,
      max_tokens: 300,
      messages: anthropicMessages,
    };
  }

  try {
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider === 'anthropic'
          ? { 'x-api-key': providerApiKey, 'anthropic-version': '2023-06-01' }
          : { Authorization: `Bearer ${providerApiKey}` }),
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error(`[pidgin-translate] ${provider} error`, data);
      const errorMessage = data?.error?.message || data?.error || data?.message || `Translation provider error (${provider})`;
      return res.status(response.status || 502).json({ error: errorMessage });
    }

    const translation = provider === 'anthropic'
      ? data?.content?.[0]?.text?.trim?.()
      : data?.choices?.[0]?.message?.content?.trim?.();

    if (!translation) {
      console.error('[pidgin-translate] No translation text returned', { provider, data });
      return res.status(500).json({ error: 'Translation failed to return valid text' });
    }

    return res.status(200).json({ translation });
  } catch (error: unknown) {
    console.error('[pidgin-translate] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}
