/**
 * PLAYGROUND CONTEXT API
 *
 * Manages persistent context files for the AI Playground.
 * Files are stored in playground_context table and injected into the
 * system prompt as a cached block — NOT sent inline in every message.
 *
 * POST /api/playground-context   — save a file (upsert by user_id + chat_id + filename)
 * DELETE /api/playground-context — remove a file by id
 * GET /api/playground-context    — list files for a chat
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const TTL_HOURS = 24;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).setHeader('Access-Control-Allow-Origin', '*').end();

  // ── Auth: expect Bearer <supabase_access_token> ────────────────────────────
  const authHeader = req.headers.authorization ?? '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  // Verify the token and get user_id
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
  const userId = user.id;

  try {
    // ── GET: list context files for a chat ──────────────────────────────────
    if (req.method === 'GET') {
      const chatId = req.query.chat_id as string;
      if (!chatId) return res.status(400).json({ error: 'chat_id required' });

      const { data, error } = await supabase
        .from('playground_context')
        .select('id, filename, language, size_chars, created_at')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return res.status(200).setHeader('Access-Control-Allow-Origin', '*').json({ files: data ?? [] });
    }

    // ── POST: save a context file ───────────────────────────────────────────
    if (req.method === 'POST') {
      const { chat_id, filename, content, language } = req.body ?? {};
      if (!chat_id || !filename || !content) {
        return res.status(400).json({ error: 'chat_id, filename, content required' });
      }

      const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString();

      // Upsert by user_id + chat_id + filename so re-attaching the same file updates it
      const { data, error } = await supabase
        .from('playground_context')
        .upsert(
          {
            user_id:    userId,
            chat_id,
            filename,
            content,
            language:   language ?? null,
            size_chars: content.length,
            expires_at: expiresAt,
          },
          { onConflict: 'user_id,chat_id,filename' }
        )
        .select('id, filename, language, size_chars')
        .single();

      if (error) throw error;
      return res.status(200).setHeader('Access-Control-Allow-Origin', '*').json({ file: data });
    }

    // ── DELETE: remove a context file by id ────────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'id required' });

      const { error } = await supabase
        .from('playground_context')
        .delete()
        .eq('id', id)
        .eq('user_id', userId); // RLS double-check

      if (error) throw error;
      return res.status(200).setHeader('Access-Control-Allow-Origin', '*').json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err: any) {
    console.error('[playground-context]', err);
    return res
      .status(500)
      .setHeader('Access-Control-Allow-Origin', CORS_HEADERS['Access-Control-Allow-Origin'])
      .setHeader('Access-Control-Allow-Methods', CORS_HEADERS['Access-Control-Allow-Methods'])
      .setHeader('Access-Control-Allow-Headers', CORS_HEADERS['Access-Control-Allow-Headers'])
      .json({ error: err?.message ?? 'Server error' });
  }
}
