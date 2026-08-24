// e2b-sdk-server.cjs - Using official E2B SDK
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// E2B Code Execution using official SDK
async function executeWithE2BSDK(code, language) {
  const startTime = Date.now();
  
  try {
    // Import E2B SDK dynamically
    const { Sandbox } = await import('@e2b/code-interpreter');
    
    const E2B_API_KEY = process.env.E2B_API_KEY;
    
    if (!E2B_API_KEY) {
      throw new Error('E2B_API_KEY not found in environment variables');
    }

    console.log(`🚀 Creating E2B ${language} sandbox using official SDK...`);

    // Create sandbox using official SDK
    const sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY,
    });

    console.log(`✅ Created sandbox: ${sandbox.id}`);

    try {
      let result;
      
      if (language === 'python') {
        console.log('🐍 Executing Python code...');
        result = await sandbox.runCode(code);
      } else if (language === 'javascript') {
        console.log('🟨 Executing JavaScript code...');
        // For JavaScript, we need to create a file and run it
        await sandbox.filesystem.write('script.js', code);
        result = await sandbox.commands.run('node script.js');
      }

      // Close sandbox
      console.log('🧹 Closing sandbox...');
      await sandbox.close();

      const executionTime = Date.now() - startTime;
      console.log(`⏱️  Total execution time: ${executionTime}ms`);

      if (result.error) {
        console.log('❌ Execution failed:', result.error);
        return {
          error: result.error,
          executionTime,
          success: false,
        };
      }

      const output = result.stdout || result.text || result.output || 'Code executed successfully (no output)';
      console.log('✅ Execution successful:', output.substring(0, 100) + '...');
      
      return {
        output: output,
        executionTime,
        success: true,
      };

    } catch (error) {
      // Close sandbox on error
      await sandbox.close().catch(() => {});
      throw error;
    }
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('💥 E2B SDK execution error:', error.message);
    
    return {
      error: `E2B SDK execution failed: ${error.message}`,
      executionTime,
      success: false,
    };
  }
}

// Fallback: Use a simple JavaScript VM for testing
function executeJavaScriptLocally(code) {
  const startTime = Date.now();
  
  try {
    const vm = require('vm');
    
    let outputBuffer = [];
    
    const context = {
      console: {
        log: (...args) => {
          outputBuffer.push(args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(' '));
        },
      },
      setTimeout,
      clearTimeout,
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
    };
    
    const vmContext = vm.createContext(context);
    const result = vm.runInContext(code, vmContext, {
      timeout: 30000,
      displayErrors: true,
    });

    const executionTime = Date.now() - startTime;
    
    let output = outputBuffer.join('\n');
    if (result !== undefined) {
      output += (output ? '\n' : '') + String(result);
    }

    return {
      output: output || 'Code executed successfully (no output)',
      executionTime,
      success: true,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    return {
      error: error.message,
      executionTime,
      success: false,
    };
  }
}

// Code execution endpoint with fallback
app.post('/api/execute-code', async (req, res) => {
  const { code, language } = req.body;
  
  console.log(`\n🎵 E2B SDK Execution Request:`);
  console.log(`📝 Language: ${language}`);
  console.log(`📝 Code: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);
  
  try {
    // Input validation
    if (!code || !language) {
      return res.status(400).json({ error: 'Missing code or language' });
    }

    if (!['python', 'javascript'].includes(language)) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    if (code.length > 10000) {
      return res.status(400).json({ error: 'Code too long (max 10,000 characters)' });
    }

    let result;
    
    // Try E2B SDK first
    try {
      result = await executeWithE2BSDK(code, language);
    } catch (sdkError) {
      console.warn('⚠️  E2B SDK failed, using fallback:', sdkError.message);
      
      if (language === 'javascript') {
        // Fallback to local JS execution
        result = executeJavaScriptLocally(code);
      } else {
        // For Python, return a helpful error
        result = {
          error: `E2B SDK failed (${sdkError.message}). Python execution requires E2B cloud sandbox.`,
          executionTime: 0,
          success: false,
        };
      }
    }
    
    console.log('📤 Sending result:', {
      success: result.success,
      outputLength: result.output ? result.output.length : 0,
      errorLength: result.error ? result.error.length : 0,
      executionTime: result.executionTime
    });
    
    res.json(result);

  } catch (error) {
    console.error('💥 API Error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      executionTime: 0,
      success: false,
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const hasApiKey = !!process.env.E2B_API_KEY;
  res.json({ 
    status: 'OK', 
    message: `E2B SDK server is running! API Key: ${hasApiKey ? 'Found' : 'Missing'}` 
  });
});

const SPEECHGEN_API_URL = 'https://speechgen.io/index.php?r=api/text';
const VOICE_BY_MODE = {
  pidgin: 'ClergyPidgin clone',
  english: 'Ezinne',
};

async function generateSpeechGenAudio(text, mode) {
  const token = process.env.SPEECHGEN_TOKEN;
  const email = process.env.SPEECHGEN_EMAIL;
  const voice = process.env.SPEECHGEN_VOICE || VOICE_BY_MODE[mode] || 'ClergyPidgin clone';

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

  const data = await response.json().catch(() => null);

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

app.post('/api/pidgin-tts', async (req, res) => {
  const { text, mode } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const voiceMode = mode === 'english' ? 'english' : 'pidgin';

  try {
    const result = await generateSpeechGenAudio(text, voiceMode);

    if (result.error) {
      return res.status(result.statusCode || 502).json({ error: result.error });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ audioUrl: result.audioUrl });
  } catch (error) {
    console.error('[pidgin-tts] Error:', error);
    return res.status(500).json({ error: 'Internal server error while generating Pidgin audio' });
  }
});

app.post('/api/pidgin-translate', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const systemPrompt = `You are an expert Nigerian Pidgin translator. Translate the exact input into simple, clear Nigerian Pidgin. Output only the raw translated text with no explanation, no labels, and no additional punctuation or quotes.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Translate this English text into Nigerian Pidgin: ${text.trim()}` },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[pidgin-translate] Anthropic error', data);
      return res.status(response.status).json({ error: data?.error?.message || 'Translation provider error' });
    }

    const translation = data?.content?.[0]?.text?.trim?.();
    if (!translation) {
      return res.status(500).json({ error: 'Translation failed to return valid text' });
    }

    return res.status(200).json({ translation });
  } catch (error) {
    console.error('[pidgin-translate] Error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// Chat endpoint — Real Groq or Developer Mock Mode
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, system, max_tokens = 800, temperature = 0.7, page, playgroundModel, userId, city } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || process.env.OPENAI_API_KEY;

    // ── REAL GROQ MODE ───────────────────────────────────────────────────────
    if (groqKey) {
      console.log('[/api/chat] ✅ Using REAL Groq API (key found)');
      
      try {
        const sanitizedClientMessages = messages
          .map(msg => ({
            role: msg && msg.role,
            content: msg && (typeof msg.content === 'string' ? msg.content : String(msg.content))
          }))
          .filter(m => m.role && m.content);

        const oaiMessages = [];
        if (system) {
          oaiMessages.push({ role: 'system', content: String(system) });
        }
        oaiMessages.push(...sanitizedClientMessages);

        const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: oaiMessages,
            max_tokens,
            temperature,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error('[/api/chat] Groq API error:', data.error);
          return res.status(response.status).json({
            error: data.error?.message || 'Groq API error',
          });
        }

        return res.json(data);

      } catch (oaiError) {
        console.error('[/api/chat] Groq call failed:', oaiError);
        return res.status(500).json({
          error: `Groq request failed: ${oaiError.message}`,
        });
      }
    }

    // ── DEVELOPER MOCK MODE (no API key) ────────────────────────────────────────
    console.log('[/api/chat] 🎭 DEVELOPER MOCK MODE (no OPENAI_API_KEY found)');
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    const isEvaluation = 
      (system && (system.includes('JSON') || system.includes('tier') || system.includes('evaluation'))) ||
      (messages[messages.length - 1]?.content?.includes('JSON') || 
       messages[messages.length - 1]?.content?.includes('tier') ||
       messages[messages.length - 1]?.content?.includes('score'));

    let mockContent = '';

    if (isEvaluation) {
      const mockEvaluation = {
        tier: 'Developing',
        tier_label: 'Tier 2: Developing',
        summary: 'Your submission demonstrates solid understanding of the core concepts with room for deeper exploration.',
        tier_reasoning: 'Your implementation shows competent use of the required technologies and patterns.',
        follow_up_instruction: 'Review the advanced patterns section and try implementing one optimization technique.',
        strengths: ['Clear code structure', 'Good variable naming', 'Proper error handling'],
        improvements: ['Consider extracting repeated logic', 'Add more granular comments']
      };
      mockContent = JSON.stringify(mockEvaluation);
    } else {
      mockContent = `Thanks for your question! I'm currently in Developer Mock Mode.`;
    }

    res.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: mockContent,
          },
        },
      ],
    });

  } catch (error) {
    console.error('PROXY ROUTE ERROR:', error);
    try {
      return res.status(400).json({
        error: (error && error.message) ? error.message : String(error),
        messages: []
      });
    } catch (innerErr) {
      console.error('PROXY ROUTE ERROR (while sending response):', innerErr);
      res.status(400).json({ error: 'Unknown proxy error', messages: [] });
    }
  }
});

// ── SECURE CRON DIGEST ENDPOINTS FOR TESTING ──────────────────────────────
app.get('/api/linkedin-digest', async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET || '2004';

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing secret key' });
  }

  console.log('📌 LinkedIn digest cron job triggered successfully.');
  return res.json({ success: true, message: 'LinkedIn digest executed successfully!' });
});

app.get('/api/x-digest', async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET || '2004';

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing secret key' });
  }

  console.log('📌 X digest cron job triggered successfully.');
  return res.json({ success: true, message: 'X digest executed successfully!' });
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎵 Development Server Running!');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log('🔗 Vite will proxy /api requests to this server\n');
});