import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const openAIApiKey = Deno.env.get('OPENAI_API_KEY')

serve(async (req) => {
  const { message, type, context } = await req.json()
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: `You are an AI assistant for ${type}. ${context}` },
        { role: 'user', content: message }
      ],
    }),
  })
  
  const data = await response.json()
  
  return new Response(
    JSON.stringify({ reply: data.choices[0].message.content }),
    { headers: { "Content-Type": "application/json" } },
  )
})