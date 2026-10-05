// src/lib/passwordRules.ts
//
// Mirrors the password policy set in Supabase (Authentication → Providers →
// Email): at least 8 characters, letters and digits, and not a known leaked
// password. Supabase enforces it; this just lets the forms say so plainly
// before and after the request. Keep in sync if the dashboard setting changes.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with both letters and numbers.`;

// Returns a message for the first rule the password breaks, or null.
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include both letters and numbers.';
  }
  return null;
}

// Turns Supabase's weak-password errors into something a student can act on.
// Returns null when the error isn't about the password.
export function friendlyPasswordError(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes('known to be weak') || m.includes('pwned') || m.includes('easy to guess')) {
    return 'That password has appeared in a data leak elsewhere, so it isn’t safe. Please choose a different one.';
  }
  if (m.includes('password should') || m.includes('weak password') || m.includes('weak_password')) {
    return `That password is too weak. ${PASSWORD_RULE_TEXT}`;
  }
  return null;
}
