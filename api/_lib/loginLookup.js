// api/_lib/loginLookup.js
//
// Pure helpers for "Which email did I use?" (api/find-my-login.ts): clean up the addresses a learner
// typed, and write the one email each address receives. The screen never says whether an account
// exists; the answer goes only to the mailbox that was typed.

const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export const MAX_ADDRESSES = 5;

/** Up to 5 distinct, valid, lower-cased addresses from whatever was posted. */
export function normalizeEmails(input) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const e = raw.trim().toLowerCase();
    if (e.length > 254 || !EMAIL_RE.test(e) || out.includes(e)) continue;
    out.push(e);
    if (out.length === MAX_ADDRESSES) break;
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {{status: 'none'|'active'|'merged'|'inactive', login_email?: string}} result  from login_email_status
 * @param {string} typed   the address this email is being sent to
 * @param {string} siteUrl
 */
export function buildLoginEmail(result, typed, siteUrl) {
  const signIn = `${siteUrl}/login`;
  const reset = 'On the sign-in page, type that email and press "Email me a link to reset my password".';
  let subject, lines;
  switch (result?.status) {
    case 'active':
      subject = 'Your nextVillage sign-in email';
      lines = [
        'You asked which email you use for nextVillage.',
        `Yes: ${typed} is your sign-in email. Use it as your username.`,
        `Sign in here: ${signIn}`,
        `Forgot your password? ${reset}`,
      ];
      break;
    case 'merged':
      subject = 'Your nextVillage sign-in email';
      lines = [
        'You asked which email you use for nextVillage.',
        `Your accounts were combined into one. Sign in with this email: ${result.login_email}`,
        `Sign in here: ${signIn}`,
        `Forgot your password? ${reset}`,
        'Please do not make a new account. Your learning is saved.',
      ];
      break;
    case 'inactive':
      subject = 'About your nextVillage account';
      lines = [
        'You asked which email you use for nextVillage.',
        `The account for ${typed} is switched off right now. Please ask your leader or facilitator to help.`,
        'Please do not make a new account.',
      ];
      break;
    default:
      subject = 'nextVillage: no account for this email';
      lines = [
        'You asked which email you use for nextVillage.',
        `No nextVillage account uses ${typed}. Try your other email addresses on the same page.`,
        `If you have never joined, you can create an account here: ${siteUrl}/signup`,
        'If you did not ask for this, you can ignore this message.',
      ];
  }
  const text = lines.join('\n\n');
  const html = lines.map((l) => `<p style="font-family:sans-serif;font-size:15px;line-height:1.5">${esc(l)}</p>`).join('');
  return { subject, text, html };
}
