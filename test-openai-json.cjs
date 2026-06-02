// Test script to verify OpenAI JSON response parsing
(async () => {
  console.log('[TEST] Sending JSON evaluation request to real OpenAI...\n');
  
  const testMessages = [
    { 
      role: 'user', 
      content: 'I used AI to help me understand machine learning. It explained how neural networks work, and I asked it to show examples of bias in AI systems.' 
    }
  ];
  
  const systemPrompt = `You are evaluating learner responses against the UNESCO AI Competency Framework.
You must assess FOUR competencies. For EACH competency, provide a score from 1-4 and evidence.

Respond with ONLY valid JSON:
{
  "competency_1_score": <number 1-4>,
  "competency_1_evidence": "<evidence>",
  "competency_2_score": <number 1-4>,
  "competency_2_evidence": "<evidence>",
  "competency_3_score": <number 1-4>,
  "competency_3_evidence": "<evidence>",
  "competency_4_score": <number 1-4>,
  "competency_4_evidence": "<evidence>"
}`;

  const body = JSON.stringify({ messages: testMessages, system: systemPrompt, max_tokens: 500 });
  
  try {
    const r = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    
    const data = await r.json();
    console.log('[TEST] Status:', r.status);
    
    const content = data.choices[0].message.content;
    console.log('\n[TEST] Raw response (first 800 chars):');
    console.log(content.slice(0, 800));
    
    console.log('\n[TEST] Attempting to parse...');
    
    // Test markdown stripping
    let json = content.trim();
    
    if (json.startsWith('```')) {
      console.log('[TEST] Response starts with markdown code fence');
      json = json.replace(/^```(?:json|JSON|js|javascript)?\s*[\r\n]+/, '');
      json = json.replace(/[\r\n]+```\s*$/, '');
      json = json.replace(/```\s*$/, '');
      json = json.trim();
      console.log('[TEST] Stripped markdown');
    }
    
    console.log('\n[TEST] After stripping (first 500 chars):');
    console.log(json.slice(0, 500));
    
    const parsed = JSON.parse(json);
    console.log('\n[TEST] ✅ SUCCESS! Parsed object keys:');
    console.log(Object.keys(parsed).join(', '));
    console.log('\n[TEST] Sample scores:');
    console.log(`- Competency 1 Score: ${parsed.competency_1_score}`);
    console.log(`- Competency 1 Evidence: ${parsed.competency_1_evidence.slice(0, 100)}...`);
    
  } catch (e) {
    console.error('[TEST] ❌ ERROR:', e.message);
    console.error(e.stack);
  }
})();
