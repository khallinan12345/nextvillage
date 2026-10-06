/**
 * udolliScope — org boundary for the UD-OLLI guardrail lab (Anchor vs
 * Driftwood). UD-OLLI is a group of senior learners in Dayton, Ohio.
 *
 * Access is decided by the database function udolli_has_access() (approved
 * members of this org, its leader, platform administrators) and re-checked on
 * the server in api/udolli.js. This constant only exists so the front end can
 * name the org; never use it to grant access on its own.
 */

export const UDOLLI_ORG_ID = 'a1b2c3d4-0002-0002-0002-00000000d011';
export const UDOLLI_PATH = '/udolli';
