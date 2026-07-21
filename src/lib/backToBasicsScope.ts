/**
 * backToBasicsScope — org boundary for features exclusive to Back to Basics
 * Youth Education (the Sonnet 5 default in "Use Claude", the image-generation
 * quota exemption, and the usage-quota exemption on "Use Claude Together",
 * which is otherwise available to every organization).
 *
 * organization_id isn't always populated for join-code signups, so callers
 * must check both organization_id and join_code_used — never organization_id
 * alone.
 */

export const BACK_TO_BASICS_ORG_ID    = 'bf573bfa-c57a-4476-be26-508991bb4d76';
export const BACK_TO_BASICS_JOIN_CODE = 'Y3K9DC';

export const isBackToBasicsMember = (
  organizationId: string | null | undefined,
  joinCodeUsed: string | null | undefined,
): boolean =>
  organizationId === BACK_TO_BASICS_ORG_ID ||
  joinCodeUsed?.trim() === BACK_TO_BASICS_JOIN_CODE;
