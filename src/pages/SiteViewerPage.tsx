// src/pages/SiteViewerPage.tsx
//
// The public, shareable link for a published Website Builder site
// (src/pages/tech-skills/WebsiteBuilderPage.tsx). No login required — not
// wrapped in AppLayout. The actual page content is fetched by the browser
// from api/site-page/[siteId]/[slug].js inside a sandboxed iframe; this
// component just resolves which page to show from the URL and provides a
// minimal frame around it. The generated site's own internal nav links
// (see WebsiteBuilderPage's generation prompt) let visitors click between
// pages inside that iframe.

import React from 'react';
import { useParams, Link } from 'react-router-dom';

const SiteViewerPage: React.FC = () => {
  const { siteId, slug } = useParams<{ siteId: string; slug: string }>();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
        <Link to="/tech-skills/website-builder" className="text-xs text-gray-400 hover:text-gray-700">
          Built with the AI-ing &amp; Vibing Website Builder
        </Link>
      </div>
      <iframe
        title="Published site"
        src={`/api/site-page/${siteId}/${slug}`}
        sandbox="allow-scripts"
        className="flex-1 w-full border-0"
      />
    </div>
  );
};

export default SiteViewerPage;
