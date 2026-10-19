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

// Public pages (the landing page) show a learner only by initials, never a name. Many winners are
// children, and public display needs a parent's specific consent (docs/privacy-and-legal/AI-LEGAL-REVIEW.md, A4).
//   'Daniel Peace Azibaolari' -> 'D. A.'   'Learner 4821' stays as it is   blank -> 'A learner'
export function publicInitials(fullName: string | null | undefined): string {
  const name = (fullName ?? '').trim();
  if (!name) return 'A learner';
  if (/^Learner \d+$/.test(name)) return name;
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0].charAt(0).toUpperCase() + '.';
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

// The written reason for a win can mention the learner by name; replace each part of the name
// (three letters or more) with 'this learner' before showing it publicly.
export function publicReason(fullName: string | null | undefined, reason: string | null | undefined): string {
  let text = reason ?? '';
  for (const part of (fullName ?? '').trim().split(/\s+/)) {
    if (part.length < 3) continue;
    const safe = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\b${safe}\\b`, 'gi'), 'this learner');
  }
  return text;
}
