// api/upload-site-asset.js
//
// Server-side proxy for Website Builder image uploads (site-assets bucket).
//
// WHY THIS EXISTS: uploading directly from the browser via the normal
// Supabase client (supabase.storage.from('site-assets').upload(...)) with
// the user's own session — the standard, otherwise-working pattern used by
// every other per-user-folder bucket in this project (ai-images,
// web-projects, certificates, ...) — reliably fails on this specific
// bucket with "new row violates row-level security policy", regardless of
// the bucket's public flag, allowed_mime_types, RLS policy role scope
// (TO authenticated vs TO public), or whether the bucket was created via
// raw SQL or the Storage API itself. Confirmed via direct reproduction
// with a real, valid, unexpired user session (independently verified
// valid against PostgREST) using Chrome browser automation, and via a
// dozen+ isolated variations testing every dimension above — see the git
// history around 2026-07-23 for the full investigation. The one thing
// that reliably works, in this project, right now: server-side writes
// using the service-role key (the same pattern already used throughout
// this codebase — api/chat-room.js, cost logging, etc.). Routing the
// upload through this endpoint sidesteps whatever is actually broken in
// Storage's user-JWT-authenticated object-creation path for this bucket,
// without needing to understand its exact root cause.
//
// The browser sends the raw file bytes as the request body (not
// multipart, not base64/JSON — avoids the ~33% base64 size penalty
// against Vercel's request body limit) with the target filename and
// session id in headers, and its own session's access token in
// Authorization so this endpoint can verify who's actually asking rather
// than trusting a client-supplied user id.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml',
]);
const MAX_BYTES = 10 * 1024 * 1024; // matches the site-assets bucket's file_size_limit

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-filename, x-session-id');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'] || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  // Verify the caller's identity against their own session token — don't
  // trust a client-supplied user id for a folder-ownership path.
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user?.id) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const userId = userData.user.id;

  const sessionId = req.headers['x-session-id'];
  const filenameHeader = req.headers['x-filename'];
  if (!sessionId || typeof sessionId !== 'string' || !filenameHeader || typeof filenameHeader !== 'string') {
    return res.status(400).json({ error: 'Missing x-session-id or x-filename header' });
  }
  const filename = decodeURIComponent(filenameHeader);
  // Reject path traversal / separators in the filename — it becomes the
  // last path segment of the storage object, nothing else.
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  // sessionId is a client-generated crypto.randomUUID() used only as a
  // folder segment — constrain it to that shape so it can't be used to
  // inject extra path segments either.
  if (!/^[a-z0-9-]{1,64}$/i.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return res.status(400).json({ error: `Unsupported content type: ${contentType}` });
  }

  // Vercel's default body parser hands back non-JSON, non-form bodies as a
  // Buffer already — no manual stream collection needed.
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: 'Empty or unreadable request body' });
  }
  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'File too large (10MB limit)' });
  }

  const storagePath = `${userId}/${sessionId}/${filename}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from('site-assets')
      .upload(storagePath, buffer, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('site-assets').getPublicUrl(storagePath);
    return res.status(200).json({ url: urlData?.publicUrl ?? '' });
  } catch (err) {
    console.error('[upload-site-asset] Upload failed:', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
}
