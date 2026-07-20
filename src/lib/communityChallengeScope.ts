/**
 * communityChallengeScope — org boundary for the Oloibiri/Ibiade community
 * challenge program (weekly challenges, weekly champion, community impact
 * leaderboard, community impact tiers).
 *
 * This program only exists for Davidson AI Futures Lab (org id
 * OLOIBIRI_ORG_ID). Every other organization has no rows in
 * community_challenges / weekly_champions / community_impact_tiers, so
 * callers must treat a null return as "this org has no challenge program —
 * skip the fetch and show an empty state" rather than falling back to
 * Davidson's data.
 */

import { OLOIBIRI_ORG_ID } from './useBranding';

export { OLOIBIRI_ORG_ID };

/**
 * Resolves the text org_id slug used by community_challenges/
 * weekly_champions/community_impact_tiers for a given profile's real
 * organization_id (uuid). Returns null when the org has no challenge
 * program at all.
 */
export const resolveChallengeOrgSlug = (organizationId: string | null | undefined): string | null => {
  if (organizationId !== OLOIBIRI_ORG_ID) return null;
  return 'oloibiri';
};
