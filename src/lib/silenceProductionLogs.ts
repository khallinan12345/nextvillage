// Imported first in main.tsx, before anything else runs. Debug logging
// (console.log/console.warn) is scattered across ~40 files and includes
// auth state, user IDs, and emails — useful in development, but it has no
// business reaching a production browser console. Rather than rewriting
// every call site (high risk of breaking multi-line log statements across
// 40 files for a purely cosmetic change), this silences the two methods
// globally in production. console.error is left alone — real errors should
// still surface.
if (!import.meta.env.DEV) {
  console.log = () => {};
  console.warn = () => {};
}
