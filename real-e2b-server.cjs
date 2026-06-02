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

// Chat endpoint — Real OpenAI or Developer Mock Mode
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, system, max_tokens = 800, temperature = 0.7, page, playgroundModel, userId, city } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const openaiKey = process.env.OPENAI_API_KEY;

    // ── REAL OPENAI MODE ───────────────────────────────────────────────────────
    if (openaiKey) {
      console.log('[/api/chat] ✅ Using REAL OpenAI API (key found)');
      
      try {
        // Strongly sanitize incoming messages: OpenAI accepts only {role, content}
        const sanitizedClientMessages = messages
          .map(msg => ({
            role: msg && msg.role,
            content: msg && (typeof msg.content === 'string' ? msg.content : String(msg.content))
          }))
          .filter(m => m.role && m.content);

        // Build message array with optional system prompt, using sanitized messages only
        const oaiMessages = [];
        if (system) {
          oaiMessages.push({ role: 'system', content: String(system) });
        }
        oaiMessages.push(...sanitizedClientMessages);

        // Call OpenAI completions endpoint
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',  // or 'gpt-3.5-turbo' if you prefer cheaper model
            messages: oaiMessages,
            max_tokens,
            temperature,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error('[/api/chat] OpenAI API error:', data.error);
          return res.status(response.status).json({
            error: data.error?.message || 'OpenAI API error',
          });
        }

        // Return OpenAI response in same format
        return res.json(data);

      } catch (oaiError) {
        console.error('[/api/chat] OpenAI call failed:', oaiError);
        return res.status(500).json({
          error: `OpenAI request failed: ${oaiError.message}`,
        });
      }
    }

    // ── DEVELOPER MOCK MODE (no API key) ────────────────────────────────────────
    console.log('[/api/chat] 🎭 DEVELOPER MOCK MODE (no OPENAI_API_KEY found)');
    
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Determine if this is a JSON evaluation request by checking the system prompt or last message
    const isEvaluation = 
      (system && (system.includes('JSON') || system.includes('tier') || system.includes('evaluation'))) ||
      (messages[messages.length - 1]?.content?.includes('JSON') || 
       messages[messages.length - 1]?.content?.includes('tier') ||
       messages[messages.length - 1]?.content?.includes('score'));

    let mockContent = '';

    if (isEvaluation) {
      // Return a realistic evaluation JSON response
      const mockEvaluation = {
        tier: 'Developing',
        tier_label: 'Tier 2: Developing',
        summary: 'Your submission demonstrates solid understanding of the core concepts with room for deeper exploration. The architecture is sound and follows best practices in most areas.',
        tier_reasoning: 'Your implementation shows competent use of the required technologies and patterns. The code is well-structured and your explanations are clear. To reach the next tier, consider adding more advanced patterns or optimizations.',
        follow_up_instruction: 'Review the advanced patterns section and try implementing one optimization technique in your next submission.',
        strengths: [
          'Clear code structure',
          'Good variable naming',
          'Proper error handling in most cases'
        ],
        improvements: [
          'Consider extracting repeated logic into helper functions',
          'Add more granular comments for complex sections',
          'Optimize database queries for performance'
        ]
      };
      mockContent = JSON.stringify(mockEvaluation);
    } else {
      // Return a helpful text response for general chat
      const lastMessage = messages[messages.length - 1]?.content || 'Hello';
      mockContent = `Thanks for your question! I'm currently in Developer Mock Mode (no OPENAI_API_KEY configured). 
      
To enable real AI responses:
1. Add OPENAI_API_KEY=sk-... to your .env file
2. Restart this server
3. Your requests will automatically use the real OpenAI API

Mock response: Your submission looks good so far. In production mode, you'll get detailed feedback powered by OpenAI's models.`;
    }

    // Return OpenAI-compatible format
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
    console.error('[/api/chat] Error:', error);
    res.status(500).json({
      error: error.message || 'Chat server error',
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  const hasE2bKey = !!process.env.E2B_API_KEY;
  const hasOpenAiKey = !!process.env.OPENAI_API_KEY;
  
  console.log('\n🎵 Development Server Running!');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔑 E2B API Key: ${hasE2bKey ? '✅ Found' : '❌ Missing'}`);
  console.log(`🤖 OpenAI API Key: ${hasOpenAiKey ? '✅ Found (REAL API)' : '❌ Missing (Mock Mode)'}`);
  console.log('🔗 Vite will proxy /api requests to this server');
  
  if (hasOpenAiKey) {
    console.log('✨ /api/chat will use REAL OpenAI API\n');
  } else {
    console.log('⚠️  /api/chat is in MOCK MODE (no OPENAI_API_KEY found)');
    console.log('   To enable real OpenAI:');
    console.log('   1. Get your API key from https://platform.openai.com');
    console.log('   2. Add OPENAI_API_KEY=sk-... to .env');
    console.log('   3. Restart this server\n');
  }
  
  if (!hasE2bKey) {
    console.log('⚠️  E2B_API_KEY not found (needed for /api/execute only)');
    console.log('   1. Get your API key from https://e2b.dev');
    console.log('   2. Add E2B_API_KEY=your_key_here to .env');
    console.log('   3. Restart this server\n');
  }
});
