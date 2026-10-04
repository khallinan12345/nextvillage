import { authHeaders } from './authHeaders';

export interface SimilarProfileMatch {
  id: string;
  maskedEmail: string;
}

interface MatchInput {
  email?: string;
  name?: string;
  // Scopes name matching to that code's organization (signed-in only) —
  // across the whole platform, unrelated people share common names.
  joinCode?: string;
}

// The matching itself runs in api/find-similar-profile.js: the list of
// existing accounts never reaches the browser, only one masked match.
async function post(body: Record<string, unknown>): Promise<Response> {
  return fetch('/api/find-similar-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
}

/**
 * Looks for an existing active profile whose email (or, with a join code,
 * name) is close enough to be the same real person signing up again.
 */
export const findSimilarProfile = async ({ email, name, joinCode }: MatchInput): Promise<SimilarProfileMatch | null> => {
  try {
    const res = await post({ action: 'check', email, name, join_code: joinCode });
    if (!res.ok) return null;
    const { match } = await res.json();
    return match ?? null;
  } catch {
    return null;
  }
};

/**
 * "That's me": emails a sign-in link to the matched account's real address.
 * Pass the same inputs that produced the match — the server re-checks it.
 */
export const sendDuplicateResetLink = async (matchId: string, input: MatchInput): Promise<void> => {
  const res = await post({
    action: 'send-reset', match_id: matchId,
    email: input.email, name: input.name, join_code: input.joinCode,
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: null }));
    throw new Error(error || 'Failed to send reset link. Please try again.');
  }
};
