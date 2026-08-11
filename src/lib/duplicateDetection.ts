import { supabase } from './supabaseClient';

// Iterative Levenshtein distance — used to catch typo'd emails/names
// ("Princss" vs "Princess", "gmial.com" vs "gmail.com") that an exact
// match would miss.
export const levenshtein = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
};

export const maskEmail = (e: string): string => {
  const [local, domain] = e.split('@');
  if (!domain) return e;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
};

export interface SimilarProfileMatch {
  id: string;
  maskedEmail: string;
  rawEmail: string;
}

/**
 * Looks for an existing active profile whose email or name is close enough
 * to be the same real person signing up again.
 *
 * Pass organizationId to scope the search to one org/cohort — needed for
 * name-based matching, since checking names across the whole platform
 * produces false positives between unrelated people who share a common
 * name. Without it, only email similarity is checked (safe to run globally,
 * e.g. before a user has chosen/entered an org at signup time).
 */
export const findSimilarProfile = async ({
  email,
  name,
  organizationId,
  excludeUserId,
}: {
  email?: string;
  name?: string;
  organizationId?: string;
  excludeUserId?: string;
}): Promise<SimilarProfileMatch | null> => {
  const emailLocal = email ? email.split('@')[0].toLowerCase() : '';
  const nameLower = organizationId ? (name ?? '').trim().toLowerCase() : '';

  // Runs pre-auth (anon) at signup, so this goes through a SECURITY DEFINER
  // RPC rather than a direct table query — profiles has RLS enabled and the
  // anon role has no policy granting it visibility into other users' rows.
  // The RPC returns the same (id, email, name) candidate rows the direct
  // query used to; the fuzzy matching below stays client-side.
  const { data, error } = await supabase.rpc('find_similar_profile_candidates', {
    p_organization_id: organizationId ?? null,
    p_exclude_user_id: excludeUserId ?? null,
  });
  if (error || !data) return null;

  for (const profile of data) {
    if (!profile.email) continue;
    const profileLocal = profile.email.split('@')[0].toLowerCase();
    const profileName = (profile.name ?? '').toLowerCase();

    const sameLocal = !!emailLocal && profileLocal === emailLocal;
    const emailClose = !!emailLocal && levenshtein(emailLocal, profileLocal) <= 2;
    const nameMatch = nameLower.length >= 3 &&
      (profileName === nameLower || levenshtein(profileName, nameLower) <= 2);

    if (sameLocal || emailClose || nameMatch) {
      return { id: profile.id, maskedEmail: maskEmail(profile.email), rawEmail: profile.email };
    }
  }
  return null;
};
