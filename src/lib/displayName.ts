// "First L." display name for anywhere a student's name is shown to other
// people (champions, winners). Mirrors public.short_display_name() in the
// database, which the leaderboards use.
//   'Daniel Peace Azibaolari' -> 'Daniel A.'
//   one-word names stay as they are; blank names become 'Member'.
export function shortDisplayName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Member';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}
