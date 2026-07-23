// src/pages/tech-skills/WebsiteBuilderPage.tsx
//
// A text-only lead-in to the full Web Development page
// (src/pages/tech-skills/WebDevelopmentPage.tsx). A student describes a
// website in chat; Claude generates a complete multi-page static site
// behind the scenes (code stays hidden — the student only sees the
// rendered preview and chat), and can keep asking for changes to improve
// it before saving. Students can upload images to use as backgrounds or
// in page content. Saving persists the site — each page gets written to
// `student_site_pages` and becomes publicly viewable at
// /tech-skills/sites/:siteId/:slug, served raw (query params, not path
// segments — see api/site-page.js's header comment for why) by
// api/site-page.js (see SiteViewerPage.tsx). A student can reopen any of
// their own previously saved sites from the "Your websites" list to keep
// improving it — saving again updates that same site in place (same
// `student_sites.id`, so its public URL never changes) rather than
// creating a duplicate.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { chatJSON } from '../../lib/chatClient';
import { buildSafeHtml } from '../../lib/sandboxSafety';
import { Globe, Send, Loader2, ImagePlus, Rocket, Save, FolderOpen, Plus } from 'lucide-react';

interface SitePage {
  slug: string;
  title: string;
  html: string;
}

interface UploadedImage {
  filename: string;
  url: string;
}

interface ChatEntry {
  role: 'user';
  content: string;
}

interface SavedSite {
  id: string;
  title: string;
  updated_at: string;
}

const GENERATION_SYSTEM_PROMPT = `You are generating a small multi-page static website designed by a student.

STRICT REQUIREMENTS:
- Respond ONLY with valid JSON in this exact shape, no markdown fences, no commentary before or after: {"pages": [{"slug": "home", "title": "Home", "html": "<!DOCTYPE html>..."}]}
- Each page's "html" is a COMPLETE, self-contained HTML document: its own <style> tag for CSS, no external stylesheets, fonts, scripts, or images other than the uploaded image URLs explicitly provided to you.
- Every page must include the SAME simple navigation bar linking to every other page, using bare relative slugs as the href — e.g. <a href="about">About</a>, <a href="home">Home</a> — never a leading slash, never a file extension, never a full URL.
- Slugs must be short, lowercase, URL-safe (letters, numbers, hyphens only) and unique within the site. Always include a "home" page.
- If uploaded images are listed below, use their exact URLs as CSS background-image values or <img src="..."> tags wherever they fit what the student describes — never invent placeholder image URLs.
- Do NOT use localStorage, sessionStorage, cookies, or any other persistence API — the sandboxed iframe blocks them and touching them can crash the whole page. Keep all state in plain JavaScript variables that reset each time the page loads.
- Keep the design clean and readable: sensible spacing, a coherent color scheme, and real placeholder content based on what the student described (not lorem ipsum).`;

function buildPrompt(userMessage: string, pages: SitePage[] | null, images: UploadedImage[]): string {
  const imagesBlock = images.length
    ? `\n\nUPLOADED IMAGES AVAILABLE:\n${images.map(i => `- ${i.filename}: ${i.url}`).join('\n')}`
    : '';
  if (!pages || !pages.length) {
    return `A student wants this website: ${userMessage}${imagesBlock}\n\nGenerate the complete multi-page site.`;
  }
  const currentPages = pages.map(p => `--- ${p.slug} (${p.title}) ---\n${p.html}`).join('\n\n');
  return `Here are the CURRENT pages of the site:\n\n${currentPages}${imagesBlock}\n\nThe student wants this change: ${userMessage}\n\nReturn the COMPLETE updated set of pages (same JSON shape) with this change applied — keep everything else working.`;
}

const WebsiteBuilderPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [isExistingSite, setIsExistingSite] = useState(false);
  const [effectiveOrgId, setEffectiveOrgId] = useState<string | null>(null);

  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);

  const [pages, setPages] = useState<SitePage[] | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [mySites, setMySites] = useState<SavedSite[]>([]);
  const [loadingSite, setLoadingSite] = useState(false);

  const refreshMySites = useCallback(() => {
    if (!user?.id) return;
    supabase
      .from('student_sites')
      .select('id, title, updated_at')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => setMySites(data ?? []));
  }, [user?.id]);

  useEffect(() => {
    supabase.rpc('get_my_effective_profile').then(({ data }) => {
      setEffectiveOrgId(data?.[0]?.organization_id ?? null);
    });
  }, []);

  useEffect(() => { refreshMySites(); }, [refreshMySites]);

  const loadSite = useCallback(async (site: SavedSite) => {
    setLoadingSite(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('student_site_pages')
      .select('slug, title, html_content, sort_order')
      .eq('site_id', site.id)
      .order('sort_order', { ascending: true });
    setLoadingSite(false);
    if (loadError || !data || !data.length) {
      setError('Could not load that website — please try again.');
      return;
    }
    setSessionId(site.id);
    setIsExistingSite(true);
    setTitle(site.title);
    setPages(data.map(p => ({ slug: p.slug, title: p.title, html: p.html_content })));
    setActiveSlug(data[0].slug);
    setChatHistory([]);
    setUploadedImages([]);
  }, []);

  const handleStartNew = useCallback(() => {
    setSessionId(crypto.randomUUID());
    setIsExistingSite(false);
    setTitle('');
    setPages(null);
    setActiveSlug(null);
    setChatHistory([]);
    setUploadedImages([]);
    setError('');
  }, []);

  const runGeneration = useCallback(async (userMessage: string) => {
    setGenerating(true);
    setError('');
    try {
      const prompt = buildPrompt(userMessage, pages, uploadedImages);
      const result = await chatJSON({
        page: 'WebsiteBuilderPage',
        system: GENERATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        // Now routed to claude-sonnet-5 (api/chat.js), whose tokenizer produces
        // ~30% more tokens for the same text than Haiku's — raised well past
        // 12000 so multi-page sites get real headroom under the new tokenizer.
        max_tokens: 20000,
        temperature: 0.6,
      });
      const newPages: SitePage[] = Array.isArray(result?.pages)
        ? result.pages.filter((p: any) => p && typeof p.slug === 'string' && typeof p.title === 'string' && typeof p.html === 'string')
        : [];
      if (!newPages.length) throw new Error('empty');
      setPages(newPages);
      setActiveSlug(prev => (prev && newPages.some(p => p.slug === prev)) ? prev : newPages[0].slug);
    } catch (err) {
      // A multi-page site with substantial per-page CSS can run past the
      // token budget — chatJSON throws a recognizable "Failed to parse
      // JSON response" error when that happens (the response gets cut off
      // mid-string, which is never valid JSON). Give a specific, actionable
      // message for that case rather than a generic "try again" — matches
      // the same failure mode already handled in CreateGamePage.tsx.
      const isTruncated = err instanceof Error && err.message.startsWith('Failed to parse JSON response');
      setError(
        isTruncated
          ? "That site was too complex to finish in one go — try describing fewer pages, or ask for one page at a time."
          : "Claude couldn't generate the site just now — please try again."
      );
    } finally {
      setGenerating(false);
    }
  }, [pages, uploadedImages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || generating) return;
    setInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: text }]);
    runGeneration(text);
  }, [input, generating, runGeneration]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;
    setUploadingImage(true);
    setError('');
    try {
      // getSession() validates the current token's expiry and transparently
      // refreshes it via the stored refresh token if needed. Without this, a
      // session that's gone stale (tab left open across a long editing
      // session) can send an expired access token to Storage — Postgres then
      // correctly rejects the insert under the bucket's `TO authenticated`
      // RLS policy, which surfaces as a confusing "row-level security
      // policy" error instead of the actual auth problem.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session has expired — please refresh the page and sign in again.');

      const storagePath = `${user.id}/${sessionId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('site-assets')
        .upload(storagePath, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from('site-assets').getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl ?? '';
      setUploadedImages(prev => [...prev.filter(i => i.filename !== file.name), { filename: file.name, url: publicUrl }]);
    } catch (err: any) {
      console.error('[WebsiteBuilder] Image upload failed:', err);
      setError(`Image upload failed: ${err.message}`);
    } finally {
      setUploadingImage(false);
    }
  }, [user?.id, sessionId]);

  const handleSave = useCallback(async () => {
    if (!user?.id || !pages || !pages.length || !effectiveOrgId || saving) return;
    const siteTitle = title.trim() || 'My Website';
    setSaving(true);
    setError('');

    // Upsert rather than plain insert so re-saving an already-loaded site
    // updates it in place (same id → same public URL) instead of failing
    // on the primary-key conflict a plain insert would hit.
    const { error: siteError } = await supabase.from('student_sites').upsert({
      id:               sessionId,
      organization_id:  effectiveOrgId,
      owner_id:         user.id,
      owner_name:       user.name,
      title:            siteTitle,
      updated_at:       new Date().toISOString(),
    });
    if (siteError) {
      setSaving(false);
      setError('Could not save the website — please try again.');
      return;
    }

    // Pages can be added/removed/renamed between edits, so replace the
    // whole set rather than trying to reconcile individual rows.
    const { error: deleteError } = await supabase.from('student_site_pages').delete().eq('site_id', sessionId);
    if (deleteError) {
      setSaving(false);
      setError('Could not save the website — please try again.');
      return;
    }

    const { error: pagesError } = await supabase.from('student_site_pages').insert(
      pages.map((p, i) => ({
        site_id:      sessionId,
        slug:         p.slug,
        title:        p.title,
        html_content: p.html,
        sort_order:   i,
      }))
    );
    setSaving(false);
    if (pagesError) {
      setError('The website was saved but its pages failed to save — please try again.');
      return;
    }

    setIsExistingSite(true);
    refreshMySites();
    const homeSlug = pages.some(p => p.slug === 'home') ? 'home' : pages[0].slug;
    navigate(`/tech-skills/sites/${sessionId}/${homeSlug}`);
  }, [user, pages, effectiveOrgId, saving, title, sessionId, navigate, refreshMySites]);

  const activePage = pages?.find(p => p.slug === activeSlug) ?? null;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600">
              <Globe size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Website Builder</h1>
              <p className="text-sm text-gray-500">Describe a website — Claude builds every page, and you save it.</p>
            </div>
          </div>
          {(pages || mySites.length > 0) && (
            <button
              onClick={handleStartNew}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-sky-600 border border-gray-200 hover:border-sky-200 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
            >
              <Plus size={13} /> New website
            </button>
          )}
        </div>

        {mySites.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
              <FolderOpen size={13} /> Your websites
            </p>
            <div className="flex flex-wrap gap-2">
              {mySites.map(site => (
                <button
                  key={site.id}
                  onClick={() => loadSite(site)}
                  disabled={loadingSite}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors disabled:opacity-40 ${
                    isExistingSite && site.id === sessionId
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : 'text-gray-500 border-gray-200 hover:text-sky-600 hover:border-sky-200'
                  }`}
                >
                  {site.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Chat panel ─────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {chatHistory.length === 0 && (
                <div className="text-sm text-gray-400 space-y-2">
                  <p>
                    Describe the website you want — for example: "a website for my dog-walking business, with a Home page, an About page, and a Contact page."
                  </p>
                  <p>
                    Have a photo to include? Click the <ImagePlus size={13} className="inline align-text-bottom" /> image icon to upload it, then tell Claude what to use it for — e.g. "use this as the background of the Home page" or "put this in the About page."
                  </p>
                  <p>
                    Once your site is generated, keep asking for changes right here to improve it — then save when you're happy with it.
                  </p>
                </div>
              )}
              {chatHistory.map((m, i) => (
                <div key={i} className="rounded-2xl px-4 py-2.5 bg-purple-600 text-white ml-auto max-w-[85%]">
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              ))}
              {uploadedImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedImages.map(img => (
                    <span key={img.filename} className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 rounded-full px-2.5 py-1">
                      <ImagePlus size={11} /> {img.filename}
                    </span>
                  ))}
                </div>
              )}
              {generating && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 size={13} className="animate-spin" /> {pages ? 'Updating your site…' : 'Building your site…'}
                </div>
              )}
            </div>
            {error && <p className="text-xs text-red-500 px-5 pb-1">{error}</p>}
            <div className="flex items-end gap-2 px-5 py-3 border-t border-gray-100">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                title="Upload an image"
                className="flex-shrink-0 w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-sky-600 hover:border-sky-200 disabled:opacity-40 transition-colors"
              >
                {uploadingImage ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                rows={1}
                placeholder={pages ? 'Ask for a change, e.g. "use the logo image as the header background"…' : 'Describe your website idea…'}
                disabled={generating}
                className="flex-1 resize-none outline-none text-sm bg-gray-50 rounded-xl px-3 py-2 max-h-32 focus:ring-2 focus:ring-sky-100"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || generating}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {generating ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>

          {/* ── Preview panel ──────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-[70vh] overflow-hidden">
            {pages && pages.length > 0 ? (
              <>
                <div className="flex items-center gap-1 px-3 pt-3 border-b border-gray-100 overflow-x-auto">
                  {pages.map(p => (
                    <button
                      key={p.slug}
                      onClick={() => setActiveSlug(p.slug)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-t-lg flex-shrink-0 transition-colors ${
                        activeSlug === p.slug ? 'bg-sky-50 text-sky-700 border border-b-0 border-gray-100' : 'text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
                <iframe
                  key={activeSlug}
                  title="Website preview"
                  srcDoc={activePage ? buildSafeHtml(activePage.html) : ''}
                  sandbox="allow-scripts"
                  className="flex-1 w-full border-0"
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
                Your website will appear here.
              </div>
            )}

            {pages && pages.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-2">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Name your website…"
                  maxLength={100}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !effectiveOrgId}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : isExistingSite ? <Save size={15} /> : <Rocket size={15} />}
                  {isExistingSite ? 'Save' : 'Publish'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default WebsiteBuilderPage;
