// api/platform-news.ts
// Returns the latest platform news items from Supabase.
// Called by HomePage to populate the What's New banner.
//
// GET  /api/platform-news          — returns latest 5 active items
// POST /api/platform-news          — internal: add a news item (used by add-news.sh)
//
// Environment variables required:
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (server-side only — NOT the anon key)

import type { VercelRequest, VercelResponse } from './_lib/vercelTypes';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── GET: return latest active news items ────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('platform_news')
      .select('id, title, body, link, link_label, emoji, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('[platform-news] fetch error:', error.message);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data ?? []);
  }

  // ── POST: insert a new news item ────────────────────────────────────────────
  // Protected by a shared secret — only the add-news.sh script should call this.
  if (req.method === 'POST') {
    const secret = req.headers['x-news-secret'];
    if (!secret || secret !== process.env.NEWS_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, body, link, link_label, emoji } = req.body ?? {};
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const { data, error } = await supabase
      .from('platform_news')
      .insert({
        title:      String(title).trim(),
        body:       String(body).trim(),
        link:       link       ? String(link).trim()       : null,
        link_label: link_label ? String(link_label).trim() : null,
        emoji:      emoji      ? String(emoji).trim()      : null,
        active:     true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[platform-news] insert error:', error.message);
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  }

  // ── DELETE: deactivate a news item by id ────────────────────────────────────
  if (req.method === 'DELETE') {
    const secret = req.headers['x-news-secret'];
    if (!secret || secret !== process.env.NEWS_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await supabase
      .from('platform_news')
      .update({ active: false })
      .eq('id', Number(id));

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
