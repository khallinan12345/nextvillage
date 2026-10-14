// Birth-year prompt rules. We store only the year (not a full date of birth) to
// hold as little as possible about minors; it is enough to apply under-13 /
// under-16 / under-18 rules.

export const MIN_BIRTH_YEAR = 1920;

/** The youngest birth year we accept: people younger than 3 are almost
 *  certainly a typo, and a stray "2025" would silently flag a user as a toddler. */
export function latestBirthYear(now: Date = new Date()): number {
  return now.getFullYear() - 3;
}

export type BirthYearResult =
  | { ok: true; year: number }
  | { ok: false; error: string };

export function parseBirthYear(input: string, now: Date = new Date()): BirthYearResult {
  const trimmed = input.trim();
  if (!/^\d{4}$/.test(trimmed)) {
    return { ok: false, error: 'Please enter a 4-digit year, like 2010.' };
  }
  const year = parseInt(trimmed, 10);
  if (year < MIN_BIRTH_YEAR || year > latestBirthYear(now)) {
    return { ok: false, error: 'That year does not look right. Please check it and try again.' };
  }
  return { ok: true, year };
}

/** Age reached at some point this calendar year. With only a birth year this can
 *  be one year too high before their birthday, so use it for broad brackets only. */
export function approxAge(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear;
}
