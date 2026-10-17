// Escapes the characters that let text turn into HTML. Use before building an HTML string from AI or
// learner text that is then given to dangerouslySetInnerHTML.
export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
