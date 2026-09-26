// api/research-submit.js
// Receives a new research proposal, runs a full Sonnet 4.6 equity review,
// emails the board the AI memo, and inserts the proposal as pending_review.

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend    = new Resend(process.env.RESEND_API_KEY);

// ── AI equity review ──────────────────────────────────────────────────────────
async function generateReview(proposal) {
  const { title, description, guiding_questions, sites, submitter_name, submitter_institution } = proposal;

  const questionsText = (guiding_questions || [])
    .map((q, i) => `  ${i + 1}. [${q.domain}] ${q.title}\n     Research question: ${q.research_question}`)
    .join('\n');

  const prompt = `You are the AI reviewer for the vAI Open Research Network — a distributed, community-led research initiative where youth in off-grid communities are co-researchers, not subjects. Your role is to produce a rigorous, honest review memo for the Research Review Board.

PROPOSAL DETAILS
----------------
Title: ${title}
Submitted by: ${submitter_name} (${submitter_institution})
Sites/Communities: ${(sites || []).join(', ')}
Description: ${description}

Guiding Questions:
${questionsText}

REVIEW FRAMEWORK
----------------
Evaluate this proposal across exactly these six dimensions. For each, give a score of STRONG / ADEQUATE / WEAK / CONCERN and 2–4 sentences of substantive analysis. Be honest — do not soften concerns.

1. YOUTH EMPOWERMENT
   Does this research treat youth as active agents, co-investigators, and leaders — not passive subjects or data sources? Does it build their capability, voice, and agency?

2. NON-EXPLOITATION SAFEGUARDS
   What risks exist that this research could extract value from the community without returning it? Are there power imbalances between the proposing institution and the community? How are these mitigated?

3. BROADER IMPACT (NSF CRITERION)
   What is the potential societal benefit beyond the immediate research finding? Does it contribute to knowledge, policy, infrastructure, or community wellbeing at a scale beyond the study site?

4. SCALABILITY
   Can this research model be replicated in other off-grid or underserved communities? What would limit or enable scale? Is the methodology designed for transfer?

5. IDENTITY PROTECTION & PRIVACY
   How does the research protect the identity and personal data of youth participants? Are there specific risks given the communities involved (off-grid, limited legal infrastructure)? What safeguards are proposed or needed?

6. HARM PREVENTION
   What is the realistic risk of physical, psychological, economic, or reputational harm to participants or communities? How is harm monitored and what are the stopping conditions?

OVERALL RECOMMENDATION
----------------------
End with one of: RECOMMEND APPROVAL / RECOMMEND APPROVAL WITH CONDITIONS / DO NOT APPROVE
Followed by 3–5 sentences summarizing the key reasoning and any conditions the board should impose before activation.

Format your response as clean prose under each heading. Do not use bullet points. Do not hedge excessively. The board needs clear signal.`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return msg.content[0].type === 'text' ? msg.content[0].text : '';
}

// ── Email builder ─────────────────────────────────────────────────────────────
function buildEmailHtml(proposal, review) {
  const { title, submitter_name, submitter_institution, description, sites, guiding_questions } = proposal;

  const reviewHtml = review
    .split('\n')
    .map(line => {
      if (/^\d\.\s+[A-Z\s&()]+$/.test(line.trim()) || /^OVERALL RECOMMENDATION/.test(line.trim())) {
        return `<h3 style="color:#1e40af;font-size:14px;font-weight:700;margin:20px 0 6px;text-transform:uppercase;letter-spacing:0.06em;">${line.trim()}</h3>`;
      }
      if (line.trim() === '') return '<br/>';
      return `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;">${line}</p>`;
    })
    .join('');

  const siteBadges = (sites || [])
    .map(s => `<span style="display:inline-block;padding:2px 10px;border-radius:99px;background:#d1fae5;color:#065f46;font-size:12px;font-weight:600;margin:2px;">${s}</span>`)
    .join(' ');

  const questionsHtml = (guiding_questions || [])
    .map(q => `
      <div style="margin-bottom:12px;padding:12px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:4px;">
        <div style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${q.domain || ''}</div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:4px;">${q.title}</div>
        <div style="font-size:13px;color:#64748b;font-style:italic;">"${q.research_question}"</div>
      </div>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:32px 36px;">
      <div style="font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">vAI Research Review Board</div>
      <h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 6px;">New Research Proposal</h1>
      <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0;">Requires board review and approval before activation</p>
    </div>

    <!-- Proposal summary -->
    <div style="padding:28px 36px;border-bottom:1px solid #e2e8f0;">
      <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin:0 0 4px;">${title}</h2>
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">Submitted by <strong>${submitter_name}</strong> · ${submitter_institution}</p>
      <p style="font-size:14px;color:#374151;line-height:1.75;margin:0 0 16px;">${description}</p>
      <div style="margin-bottom:16px;">${siteBadges}</div>
      ${guiding_questions?.length ? `<h3 style="font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Guiding Questions</h3>${questionsHtml}` : ''}
    </div>

    <!-- AI Review -->
    <div style="padding:28px 36px;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <div style="width:8px;height:8px;border-radius:50%;background:#6366f1;"></div>
        <h2 style="font-size:14px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.08em;margin:0;">AI Equity Review — Claude Sonnet 4.6</h2>
      </div>
      <div style="background:#fafafa;border-radius:8px;padding:20px;border:1px solid #e2e8f0;">
        ${reviewHtml}
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 36px;background:#f8fafc;">
      <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.6;">
        This proposal is currently <strong style="color:#d97706;">pending_review</strong> and is not visible to the public.
        Reply to this email or log into the admin dashboard to approve, request changes, or reject.
        <br/>This review was generated by Claude Sonnet 4.6 and is advisory only — final decision rests with the board.
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const proposal = req.body;
  const { title, description, sites, guiding_questions } = proposal;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  try {
    // 1. Run AI equity review
    console.log('[research-submit] Running Sonnet equity review for:', title);
    const review = await generateReview(proposal);

    // 2. Insert proposal as pending_review
    const { data: inserted, error: insertErr } = await supabase
      .from('research_programs')
      .insert({
        slug:        title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        title,
        description,
        sites:       sites || [],
        is_active:   false,
        status:      'pending_review',
        submitted_by: user.id,
        ai_review:   review,
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    // Insert guiding questions linked to new program
    if (guiding_questions?.length) {
      const rows = guiding_questions.map((q, i) => ({
        program_id:        inserted.id,
        slug:              q.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        title:             q.title,
        short_title:       q.title.slice(0, 40),
        domain:            q.domain || `Domain ${i + 1}`,
        research_question: q.research_question,
        icon:              q.icon || '🔬',
        color_hex:         q.color_hex || '#6366f1',
        sites:             sites || [],
        is_active:         false,
      }));
      await supabase.from('research_guiding_questions').insert(rows);
    }

    // 3. Fetch board member emails
    const { data: boardMembers } = await supabase
      .from('research_board_members')
      .select('name, email')
      .eq('is_active', true);

    if (!boardMembers?.length) {
      console.warn('[research-submit] No active board members found');
    }

    // 4. Send email to all board members
    const emailHtml = buildEmailHtml(proposal, review);
    const boardEmails = (boardMembers || []).map(m => m.email);

    await resend.emails.send({
      from:    'vAI Research Board <research@nextvillage.community>',
      to:      boardEmails,
      subject: `[Research Proposal] ${title} — Awaiting Board Review`,
      html:    emailHtml,
    });

    console.log(`[research-submit] Proposal submitted and emailed to ${boardEmails.length} board members`);

    return res.status(200).json({
      success: true,
      program_id: inserted.id,
      message: 'Proposal submitted for board review. You will be notified of the decision.',
    });

  } catch (err) {
    console.error('[research-submit] Error:', err);
    return res.status(500).json({ error: err.message || 'Submission failed' });
  }
}
