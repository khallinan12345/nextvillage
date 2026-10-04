import { supabase } from './supabaseClient';

// Authorization header carrying the signed-in user's access token, for our
// own /api routes that verify who is calling (execute-code, chat-room,
// find-similar-profile). Empty when signed out.
export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}
