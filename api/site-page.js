// api/site-page.js
//
// Publicly serves one published page of a "Website Builder" site
// (src/pages/tech-skills/WebsiteBuilderPage.tsx) as raw HTML — no login
// required, intentionally bypasses RLS via the service-role key (mirrors
// api/chat-room.js's pattern of a service-role call re-deriving its own
// access rules rather than trusting RLS, except here the rule is simply
// "public").
//
// This is a flat file taking siteId/slug as query params — NOT a
// [siteId]/[slug].js bracket-folder dynamic route. That was tried first
// and confirmed (via direct build-log/response inspection) not to be
// recognized as a function by this project's Vercel build; requests fell
// through to the SPA catch-all and served index.html instead. The pretty
// path /api/site-page/:siteId/:slug (needed so relative links in the
// generated HTML resolve correctly — query strings don't participate in
// relative-path resolution) is produced by a vercel.json rewrite mapping
// that path to this file with siteId/slug as query params, placed before
// the SPA catch-all rewrite.
//
// The Content-Security-Policy: sandbox header is the important safety net
// here — it forces the browser to treat this response as sandboxed with an
// opaque origin (same protection as a sandbox="allow-scripts" iframe)
// regardless of whether it's embedded in the SiteViewerPage iframe or
// someone navigates to this URL directly. Without it, a <script> in
// AI-generated (or prompt-injected) page content served on this app's own
// origin could reach a real visitor's session storage.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const { siteId, slug } = req.query;
  if (!siteId || !slug) {
    return res.status(400).send('Missing siteId or slug');
  }

  res.setHeader('Content-Security-Policy', 'sandbox allow-scripts');

  try {
    const { data: page, error } = await supabase
      .from('student_site_pages')
      .select('title, html_content')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .maybeSingle();

    if (error || !page) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send('<!DOCTYPE html><html><body><p>Page not found.</p></body></html>');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(page.html_content);
  } catch (err) {
    console.error('[site-page] Error:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(`<!DOCTYPE html><html><body><p>Something went wrong loading this page.</p></body></html>`);
  }
}
