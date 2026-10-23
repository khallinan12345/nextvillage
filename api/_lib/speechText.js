// api/_lib/speechText.js
//
// Turns an AI reply into the short thing worth reading aloud. Text-to-speech is billed per character, and
// learners rarely need a whole answer read to them, so before anything reaches the voice vendor we drop code,
// links, lists, tables and markdown, keep the first few sentences, and cap the length. The full text stays on
// screen; only this short version is voiced.

export const SPOKEN_MAX_CHARS = 320;
export const SPOKEN_MAX_SENTENCES = 3;

export function stripForSpeech(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')              // fenced code blocks (also an unterminated one)
    .replace(/`[^`\n]*`/g, ' ')                       // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')            // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')          // links: keep the words
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')        // bare URLs
    .replace(/^\s*\|.*\|\s*$/gm, ' ')                 // table rows
    .replace(/^\s*[-*+•]\s+.*$/gm, ' ')               // bullet items
    .replace(/^\s*\d+[.)]\s+.*$/gm, ' ')              // numbered items
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')               // heading marks
    .replace(/^\s*>\s?/gm, '')                        // quote marks
    .replace(/(\*\*|__|\*|_|~~)/g, '')                // bold, italic, strike
    .replace(/<[^>]+>/g, ' ')                         // html tags
    .replace(/\s+/g, ' ')
    .trim();
}

// Keep whole sentences up to the limits. If even the first sentence is too long, cut it at a word boundary.
export function spokenVersion(text, { maxChars = SPOKEN_MAX_CHARS, maxSentences = SPOKEN_MAX_SENTENCES } = {}) {
  const clean = stripForSpeech(text);
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [clean];
  let out = '';
  let n = 0;
  for (const s of sentences) {
    const next = (out ? out + ' ' : '') + s.trim();
    if (n >= maxSentences || next.length > maxChars) break;
    out = next;
    n += 1;
  }
  if (!out) {
    const cut = clean.slice(0, maxChars);
    out = cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim();
    if (clean.length > maxChars) out += '.';
  }
  return out;
}
