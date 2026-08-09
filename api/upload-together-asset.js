// api/upload-together-asset.js
//
// Server-side proxy for "Use Claude Together" image uploads (together-assets
// bucket) — a room member shares an image (e.g. a chapter-book
// illustration) that appears in the chat and in the compiled book view.
//
// Uses the same service-role-key proxy pattern as api/upload-site-asset.js
// (see that file for why direct client uploads to Storage unreliably fail
// RLS in this project) — the browser sends raw file bytes, this endpoint
// verifies the caller's session, re-derives their effective organization
// (mirroring api/chat-room.js), confirms it matches the target room's
// organization, then writes to Storage with the service-role key.
//
// The browser sends raw file bytes (not multipart/base64) with the target
// room id and filename in headers, and its own session's access token in
// Authorization so this endpoint can verify who's actually asking.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
]);
const MAX_BYTES = 10 * 1024 * 1024; // matches the together-assets bucket's file_size_limit

// Vercel's default body parser only reliably populates req.body for
// application/json and form-encoded bodies — read the raw stream ourselves,
// same as upload-site-asset.js.
export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-filename, x-room-id');

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
  // trust a client-supplied user id.
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user?.id) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const userId = userData.user.id;

  const roomId = req.headers['x-room-id'];
  const filenameHeader = req.headers['x-filename'];
  if (!roomId || typeof roomId !== 'string' || !filenameHeader || typeof filenameHeader !== 'string') {
    return res.status(400).json({ error: 'Missing x-room-id or x-filename header' });
  }
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) {
    return res.status(400).json({ error: 'Invalid room id' });
  }
  const filename = decodeURIComponent(filenameHeader);
  // Reject path traversal / separators — it becomes the last path segment
  // of the storage object, nothing else.
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  // ── Re-derive authorization — mirrors api/chat-room.js: resolve the
  // caller's effective organization and require it match the room's. ───────
  const { data: room, error: roomErr } = await supabase
    .from('together_rooms')
    .select('id, organization_id, status')
    .eq('id', roomId)
    .single();
  if (roomErr || !room || room.status !== 'active') {
    return res.status(403).json({ error: 'room_not_available' });
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('organization_id, join_code_used')
    .eq('id', userId)
    .single();
  if (profileErr || !profile) {
    return res.status(403).json({ error: 'not_authorized' });
  }

  let effectiveOrgId = profile.organization_id;
  if (!effectiveOrgId && profile.join_code_used?.trim()) {
    const joinCode = profile.join_code_used.trim();
    const { data: byCode } = await supabase
      .from('organizations')
      .select('id')
      .eq('join_code', joinCode)
      .maybeSingle();
    let org = byCode;
    if (!org) {
      const { data: byCodes } = await supabase
        .from('organizations')
        .select('id')
        .contains('join_codes', [joinCode])
        .maybeSingle();
      org = byCodes;
    }
    effectiveOrgId = org?.id ?? null;
  }

  if (!effectiveOrgId || effectiveOrgId !== room.organization_id) {
    return res.status(403).json({ error: 'not_authorized' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return res.status(400).json({ error: `Unsupported content type: ${contentType}` });
  }

  const buffer = await readRawBody(req);
  if (!buffer.length) {
    return res.status(400).json({ error: 'Empty or unreadable request body' });
  }
  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'File too large (10MB limit)' });
  }

  const storagePath = `${roomId}/${Date.now()}-${filename}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from('together-assets')
      .upload(storagePath, buffer, { contentType, upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('together-assets').getPublicUrl(storagePath);
    return res.status(200).json({ url: urlData?.publicUrl ?? '' });
  } catch (err) {
    console.error('[upload-together-asset] Upload failed:', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
}
