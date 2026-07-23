// src/pages/tech-skills/WebsiteBuilderPage.tsx
//
// A text-only lead-in to the full Web Development page
// (src/pages/tech-skills/WebDevelopmentPage.tsx). A student describes a
// website in chat; Claude generates a complete multi-page static site
// behind the scenes (code stays hidden — the student only sees the
// rendered preview and chat). Students can upload images to use as
// backgrounds or in page content. Once satisfied, the student publishes
// the site — each page gets saved to `student_site_pages` and becomes
// publicly viewable at /tech-skills/sites/:siteId/:slug, served raw by
// api/site-page/[siteId]/[slug].js (see SiteViewerPage.tsx).

import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { chatJSON } from '../../lib/chatClient';
import { Globe, Send, Loader2, ImagePlus, Rocket } from 'lucide-react';

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

const GENERATION_SYSTEM_PROMPT = `You are generating a small multi-page static website designed by a student.

STRICT REQUIREMENTS:
- Respond ONLY with valid JSON in this exact shape, no markdown fences, no commentary before or after: {"pages": [{"slug": "home", "title": "Home", "html": "<!DOCTYPE html>..."}]}
- Each page's "html" is a COMPLETE, self-contained HTML document: its own <style> tag for CSS, no external stylesheets, fonts, scripts, or images other than the uploaded image URLs explicitly provided to you.
- Every page must include the SAME simple navigation bar linking to every other page, using bare relative slugs as the href — e.g. <a href="about">About</a>, <a href="home">Home</a> — never a leading slash, never a file extension, never a full URL.
- Slugs must be short, lowercase, URL-safe (letters, numbers, hyphens only) and unique within the site. Always include a "home" page.
- If uploaded images are listed below, use their exact URLs as CSS background-image values or <img src="..."> tags wherever they fit what the student describes — never invent placeholder image URLs.
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

  const [sessionId] = useState(() => crypto.randomUUID());
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
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    supabase.rpc('get_my_effective_profile').then(({ data }) => {
      setEffectiveOrgId(data?.[0]?.organization_id ?? null);
    });
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
        max_tokens: 6000,
        temperature: 0.6,
      });
      const newPages: SitePage[] = Array.isArray(result?.pages)
        ? result.pages.filter((p: any) => p && typeof p.slug === 'string' && typeof p.title === 'string' && typeof p.html === 'string')
        : [];
      if (!newPages.length) throw new Error('empty');
      setPages(newPages);
      setActiveSlug(prev => (prev && newPages.some(p => p.slug === prev)) ? prev : newPages[0].slug);
    } catch {
      setError("Claude couldn't generate the site just now — please try again.");
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
      const storagePath = `${user.id}/${sessionId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('site-assets')
        .upload(storagePath, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from('site-assets').getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl ?? '';
      setUploadedImages(prev => [...prev.filter(i => i.filename !== file.name), { filename: file.name, url: publicUrl }]);
    } catch (err: any) {
      setError(`Image upload failed: ${err.message}`);
    } finally {
      setUploadingImage(false);
    }
  }, [user?.id, sessionId]);

  const handlePublish = useCallback(async () => {
    if (!user?.id || !pages || !pages.length || !effectiveOrgId || publishing) return;
    const siteTitle = title.trim() || 'My Website';
    setPublishing(true);
    setError('');

    const { error: siteError } = await supabase.from('student_sites').insert({
      id:               sessionId,
      organization_id:  effectiveOrgId,
      owner_id:         user.id,
      owner_name:       user.name,
      title:            siteTitle,
    });
    if (siteError) {
      setPublishing(false);
      setError('Could not publish the site — please try again.');
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
    setPublishing(false);
    if (pagesError) {
      setError('The site was created but its pages failed to save — please try again.');
      return;
    }

    const homeSlug = pages.some(p => p.slug === 'home') ? 'home' : pages[0].slug;
    navigate(`/tech-skills/sites/${sessionId}/${homeSlug}`);
  }, [user, pages, effectiveOrgId, publishing, title, sessionId, navigate]);

  const activePage = pages?.find(p => p.slug === activeSlug) ?? null;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600">
            <Globe size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Website Builder</h1>
            <p className="text-sm text-gray-500">Describe a website — Claude builds every page, and you publish it.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Chat panel ─────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {chatHistory.length === 0 && (
                <p className="text-sm text-gray-400">
                  Describe the website you want — for example: "a website for my dog-walking business, with a Home page, an About page, and a Contact page."
                </p>
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
                  srcDoc={activePage?.html ?? ''}
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
                  onClick={handlePublish}
                  disabled={publishing || !effectiveOrgId}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
                >
                  {publishing ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
                  Publish
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
