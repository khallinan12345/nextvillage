// src/lib/sandboxSafety.ts
//
// Shared safety net for any AI-generated HTML rendered in a
// sandbox="allow-scripts" iframe (Create Game, Website Builder, and their
// published views) — used by src/pages/tech-skills/CreateGamePage.tsx (via
// gameTestHarness.ts), PlayGamePage.tsx, and WebsiteBuilderPage.tsx.
//
// A sandboxed iframe without allow-same-origin has an opaque origin, where
// localStorage/sessionStorage access throws SecurityError on ANY access —
// not just no-ops. Generated code commonly reaches for localStorage
// without being told not to (a high-score save is a very natural instinct
// for a game). If that happens near the top of the script, the resulting
// uncaught exception can abort the rest of that script block entirely,
// breaking the whole game/page rather than just the storage feature.
//
// The fix here is a runtime shim, not just a system-prompt instruction —
// prompts are a soft constraint the model can still miss, especially on
// more elaborate generations. injectEarly() places this before the
// generated code's own <script> tags so window.localStorage/sessionStorage
// are already safe (backed by an in-memory object, so reads/writes work
// but obviously don't persist across reloads) by the time any of that code
// runs. If real storage access doesn't throw (i.e. this isn't actually a
// restrictive sandboxed context), the shim leaves the native objects
// alone.
//
// api/site-page.js needs the identical shim for published Website Builder
// pages but can't import this module (frontend bundle vs. serverless
// function) — keep that copy in sync with STORAGE_SHIM_SCRIPT below.

export function injectEarly(html: string, script: string): string {
  const headOpenMatch = html.match(/<head[^>]*>/i);
  if (headOpenMatch && headOpenMatch.index !== undefined) {
    const insertAt = headOpenMatch.index + headOpenMatch[0].length;
    return html.slice(0, insertAt) + script + html.slice(insertAt);
  }
  const htmlOpenMatch = html.match(/<html[^>]*>/i);
  if (htmlOpenMatch && htmlOpenMatch.index !== undefined) {
    const insertAt = htmlOpenMatch.index + htmlOpenMatch[0].length;
    return html.slice(0, insertAt) + script + html.slice(insertAt);
  }
  return script + html;
}

export const STORAGE_SHIM_SCRIPT = `
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

export function buildSafeHtml(rawHtml: string): string {
  return injectEarly(rawHtml, STORAGE_SHIM_SCRIPT);
}
