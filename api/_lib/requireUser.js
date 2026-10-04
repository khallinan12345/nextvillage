// api/_lib/requireUser.js
//
// Resolves the signed-in user behind a request from its
// "Authorization: Bearer <access token>" header (see src/lib/authHeaders.ts).
// Never trust a user id sent in the request body — anyone can type any id.

export async function getRequestUser(req, supabase) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}
