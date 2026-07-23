// api/site-page.js
//
// Publicly serves one published page of a "Website Builder" site
// (src/pages/tech-skills/WebsiteBuilderPage.tsx) as raw HTML — no login
// required, intentionally bypasses RLS via the service-role key (mirrors
// api/chat-room.js's pattern of a service-role call re-deriving its own
// access rules rather than trusting RLS, except here the rule is simply
// "public").
//
// Takes siteId/slug as query params (?siteId=...&slug=...), not path
// segments. A path-segment version (api/site-page/[siteId]/[slug].js, then
// a flat file + vercel.json rewrite from a pretty path to this file) were
// both tried first — the bracket-folder route was never recognized as a
// function by this project's Vercel build at all, and the rewrite version,
// despite generating a structurally correct routes manifest (verified via
// `vercel build` locally), empirically did not work against the real
// deployment either. Query params, confirmed working by direct testing,
// are the reliable option here.
//
// Since query strings don't participate in relative-path URL resolution,
// a bare relative link in the generated HTML (<a href="about">) can't
// resolve correctly on its own against a query-param URL — so internal
// nav links matching the slug format the generation prompt requires
// (WebsiteBuilderPage.tsx's GENERATION_SYSTEM_PROMPT: lowercase,
// hyphenated, no leading slash, no extension) are rewritten here, at
// serve time, into full ?siteId=...&slug=... URLs before the response is
// sent. This also means any accidental drift in the AI's storage format
// doesn't need to stay bug-compatible across every already-published page
// forever — the rewrite always uses the current siteId/rules.
//
// The Content-Security-Policy: sandbox header is the important safety net
// here — it forces the browser to treat this response as sandboxed with an
// opaque origin (same protection as a sandbox="allow-scripts" iframe)
// regardless of whether it's embedded in the SiteViewerPage iframe or
// someone navigates to this URL directly. Without it, a <script> in
// AI-generated (or prompt-injected) page content served on this app's own
// origin could reach a real visitor's session storage.
//
// STORAGE_SHIM_SCRIPT below is a duplicate of src/lib/sandboxSafety.ts's
// STORAGE_SHIM_SCRIPT — this is a serverless function, not part of the
// frontend bundle, so it can't import that module directly. Keep both
// copies in sync: a sandboxed opaque-origin document throws SecurityError
// on ANY localStorage/sessionStorage access (not just no-ops), and
// generated page code reaching for it near the top of a script (a
// "remember your preference" pattern is a natural instinct) can abort the
// rest of that script entirely if left unhandled.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Matches href="slug-like-text" — lowercase letters/digits/hyphens only,
// no leading slash, no protocol, no hash — exactly the format the
// generation prompt requires for internal nav links. Deliberately narrow
// so it never touches href="#section", href="https://...", href="/foo",
// or href="mailto:...".
const RELATIVE_NAV_HREF_RE = /href="([a-z0-9][a-z0-9-]*)"/g;

function rewriteInternalLinks(html, siteId) {
  return html.replace(RELATIVE_NAV_HREF_RE, (match, slug) => `href="/api/site-page?siteId=${siteId}&slug=${slug}"`);
}

const STORAGE_SHIM_SCRIPT = `
<script>
(function () {
  function makeMemoryStorage() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; },
    };
  }
  function shimIfThrows(name) {
    try {
      window[name]; // eslint-disable-line no-unused-expressions
    } catch (e) {
      var mem = makeMemoryStorage();
      try {
        Object.defineProperty(window, name, { get: function () { return mem; }, configurable: true });
      } catch (e2) {}
    }
  }
  shimIfThrows('localStorage');
  shimIfThrows('sessionStorage');
})();
</script>`;

function injectEarly(html, script) {
  const headOpenMatch = html.match(/<head[^>]*>/i);
  if (headOpenMatch) {
    const insertAt = headOpenMatch.index + headOpenMatch[0].length;
    return html.slice(0, insertAt) + script + html.slice(insertAt);
  }
  const htmlOpenMatch = html.match(/<html[^>]*>/i);
  if (htmlOpenMatch) {
    const insertAt = htmlOpenMatch.index + htmlOpenMatch[0].length;
    return html.slice(0, insertAt) + script + html.slice(insertAt);
  }
  return script + html;
}

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
    const safeHtml = injectEarly(page.html_content, STORAGE_SHIM_SCRIPT);
    return res.status(200).send(rewriteInternalLinks(safeHtml, siteId));
  } catch (err) {
    console.error('[site-page] Error:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(`<!DOCTYPE html><html><body><p>Something went wrong loading this page.</p></body></html>`);
  }
}
