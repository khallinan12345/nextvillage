// api/_lib/duplicateMatch.js
//
// Fuzzy "is this the same person signing up again?" matching, used by
// api/find-similar-profile.js. Lives server-side so the candidate list —
// every active profile's id, name and email — never reaches a browser. The
// browser only ever gets back one match, with the email masked.

// Iterative Levenshtein distance — used to catch typo'd emails/names
// ("Princss" vs "Princess", "gmial.com" vs "gmail.com") that an exact
// match would miss.
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export function maskEmail(e) {
  const [local, domain] = e.split('@');
  if (!domain) return e;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

/**
 * Returns the first candidate close enough to be the same real person, or
 * null. Name matching only runs when matchNames is true (i.e. the search is
 * scoped to one organization) — across the whole platform, unrelated people
 * share common names.
 */
export function findBestMatch(candidates, { email, name, matchNames }) {
  const emailLocal = email ? email.split('@')[0].toLowerCase() : '';
  const nameLower = matchNames ? (name ?? '').trim().toLowerCase() : '';

  for (const profile of candidates ?? []) {
    if (!profile.email) continue;
    const profileLocal = profile.email.split('@')[0].toLowerCase();
    const profileName = (profile.name ?? '').toLowerCase();

    const sameLocal = !!emailLocal && profileLocal === emailLocal;
    const emailClose = !!emailLocal && levenshtein(emailLocal, profileLocal) <= 2;
    const nameMatch = nameLower.length >= 3 &&
      (profileName === nameLower || levenshtein(profileName, nameLower) <= 2);

    if (sameLocal || emailClose || nameMatch) return profile;
  }
  return null;
}
