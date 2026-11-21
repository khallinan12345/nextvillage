/**
 * api/find-my-login.ts
 *
 * "Not sure which email you used?" on the sign-in page. A learner types the email addresses they might
 * have used (up to 5). Every typed address gets ONE email:
 *   - it is a sign-in email  -> "yes, this is your username", with the sign-in link
 *   - it was merged          -> "sign in with <the address to use now>"
 *   - there is no account    -> "no account here, try your other addresses"
 * The screen always answers the same thing ("we sent an email to each address"), so this cannot be used to
 * find out who has an account: only the owner of a mailbox ever learns what is registered to it.
 *
 * Public route (the learner is signed out). Limits: per caller (HMAC of network address) and per target
 * address, counted in the database (api/_lib/rateLimit.js), so it cannot be used to flood anyone's inbox.
 *
 * security-check: ignore api-no-auth -- public by design (signed-out learners); identical answer for every address, rate-limited per caller and per address
 * Body:  { emails: string[] }   (JSON, POST)
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, SITE_URL (optional)
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "./_lib/vercelTypes";
import { allowRequest, callerAddress, fingerprint } from "./_lib/rateLimit.js";
import { normalizeEmails, buildLoginEmail } from "./_lib/loginLookup.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SITE_URL = process.env.SITE_URL || "https://www.nextvillage.community";

async function sendEmail(to: string, msg: { subject: string; html: string; text: string }) {
  const out = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "nextVillage <reports@nextvillage.community>", to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!out.ok) throw new Error(`Resend error ${out.status}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const emails = normalizeEmails((req.body as { emails?: unknown } | undefined)?.emails);
  if (emails.length === 0) return res.status(400).json({ error: "Please type at least one valid email address." });

  const me = fingerprint(callerAddress(req));
  if (!(await allowRequest(supabase, `flm:caller:${me}`, 10, 3600))) {
    return res.status(429).json({ error: "Too many tries. Please wait a little while and try again." });
  }

  for (const email of emails) {
    try {
      // At most 3 of these emails per address per hour. Over the limit we quietly skip: the answer stays the same.
      if (!(await allowRequest(supabase, `flm:target:${fingerprint(email)}`, 3, 3600))) continue;
      const { data, error } = await supabase.rpc("login_email_status", { p_email: email });
      if (error) throw new Error(error.message);
      await sendEmail(email, buildLoginEmail(data ?? { status: "none" }, email, SITE_URL));
    } catch (err) {
      // Never tell the browser which address failed; the log has the reason (no address in it).
      console.error("find-my-login: could not process one address:", (err as Error).message);
    }
  }
  return res.status(200).json({ ok: true });
}
