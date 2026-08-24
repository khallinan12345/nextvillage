// /api/linkedin-digest.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import Groq from 'groq-sdk';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const groq = new Groq({ apiKey: groqApiKey });

    // Using Groq's compound system to search public LinkedIn discussions via web search
    const completion = await groq.chat.completions.create({
      model: 'groq/compound',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant supporting the nextVillage community team. Search the web specifically for recent public LinkedIn posts, articles, and discussions about 'vAI', 'nextVillage', or 'community ownership'. Draft thoughtful, coaching-oriented suggested replies for a human community manager to review.
            
Core vAI Principles:
- Community ownership and leadership
- Human-centered process
- AI that coaches instead of answers
- Suggested replies must be starting points for a human to edit, not automatic posts.`
        },
        {
          role: 'user',
          content: 'Find recent public LinkedIn discussions matching our community keywords and draft the daily email digest with suggested coaching replies.'
        }
      ],
      temperature: 0.3,
    });

    const aiContent = completion.choices?.[0]?.message?.content || 'No relevant content returned.';

    const recipients = process.env.DIGEST_RECIPIENTS ? process.env.DIGEST_RECIPIENTS.split(',') : [];
    if (recipients.length === 0) {
      throw new Error('DIGEST_RECIPIENTS environment variable is not configured');
    }

    const emailHtml = `
      <h2>vAI LinkedIn Community Digest</h2>
      <p>Automated daily professional network web scan and coaching draft replies via Groq.</p>
      <hr />
      <div>${aiContent.replace(/\n/g, '<br />')}</div>
    `;

    const emailResponse = await resend.emails.send({
      from: 'vAI Digests <digest@nextVillage.community>',
      to: recipients,
      subject: `vAI LinkedIn Digest - ${new Date().toLocaleDateString()}`,
      html: emailHtml,
    });

    return res.status(200).json({
      success: true,
      emailId: emailResponse.data?.id,
    });
  } catch (error: any) {
    console.error('Error running LinkedIn Groq digest cron:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}