/**
 * api/donation-intake.ts
 *
 * Picks up Sendwave transfer receipts so a donation is never forgotten. A small Google Apps Script in the
 * owner's Gmail posts each "You sent $X to NAME" receipt here. The route:
 *   1. checks the shared secret and that the mail is from sendwave.com,
 *   2. reads amount, date, confirmation code and what arrived (api/_lib/sendwaveReceipt.js),
 *   3. ignores transfers to anyone not in DONATION_INTAKE_RECIPIENTS (the owner may send other money by Sendwave),
 *   4. creates a donation flagged needs_donor (skipped if that confirmation code is already recorded),
 *   5. emails report_recipients (report = 'donation_prompt') a link to add the donor's name.
 * The recipient's account number is never stored.
 *
 * Auth:  header "x-intake-secret: $DONATION_INTAKE_SECRET"
 * Body:  { from, subject, body }   (JSON, POST)
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DONATION_INTAKE_SECRET,
 *        DONATION_INTAKE_RECIPIENTS (comma-separated names; if unset every Sendwave transfer is accepted)
 */

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from './_lib/vercelTypes';
import { parseSendwaveReceipt } from "./_lib/sendwaveReceipt.js";
import { buildIntakePrompt } from "./_lib/donationPrompt.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MAX_BODY_CHARS = 200_000;

function secretMatches(given: unknown): boolean {
  const want = process.env.DONATION_INTAKE_SECRET;
  if (!want || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sendEmail(to: string[], msg: { subject: string; html: string; text: string }) {
  const out = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "nextVillage Reports <reports@nextvillage.community>", to, subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!out.ok) throw new Error(`Resend error ${out.status}: ${await out.text()}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!secretMatches(req.headers["x-intake-secret"])) return res.status(401).json({ error: "Unauthorized" });

  const { from, subject, body } = (req.body ?? {}) as { from?: string; subject?: string; body?: string };
  if (typeof body !== "string" || typeof subject !== "string" || body.length > MAX_BODY_CHARS) {
    return res.status(400).json({ error: "subject and body (text) are required" });
  }
  if (!/@(?:[\w-]+\.)*sendwave\.com>?\s*$/i.test(String(from ?? ""))) return res.status(200).json({ ignored: "not from sendwave.com" });

  const receipt = parseSendwaveReceipt({ subject, body });
  if (!receipt.ok) return res.status(200).json({ ignored: receipt.reason });

  const allowed = (process.env.DONATION_INTAKE_RECIPIENTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length > 0 && !allowed.some((a) => (receipt.recipientName ?? "").toLowerCase().includes(a))) {
    return res.status(200).json({ ignored: "recipient is not a vAI recipient" });
  }

  try {
    const { data: existing, error: eErr } = await supabase.from("donations").select("id").eq("sendwave_reference", receipt.reference).limit(1);
    if (eErr) throw new Error(eErr.message);
    if (existing && existing.length > 0) return res.status(200).json({ duplicate: true });

    const { data: row, error } = await supabase.from("donations").insert({
      received_on: receipt.receivedOn,
      donor_name: "Donor not yet recorded",
      needs_donor: true,
      amount_usd: receipt.amountUsd,
      amount_received: receipt.amountReceived,
      received_currency: receipt.receivedCurrency,
      sendwave_reference: receipt.reference,
      notes: `Added automatically from the Sendwave receipt${receipt.recipientName ? ` (sent to ${receipt.recipientName}` + (receipt.exchangeRate ? `, rate ${receipt.exchangeRate}` : "") + ")" : ""}.`,
    }).select("id, amount_usd, received_on, amount_received, received_currency").single();
    if (error) {
      if (error.code === "23505") return res.status(200).json({ duplicate: true });
      throw new Error(error.message);
    }

    let emailed = 0;
    try {
      const { data: rcpts, error: rErr } = await supabase.from("report_recipients").select("email").eq("report", "donation_prompt").eq("active", true);
      if (rErr) throw new Error(rErr.message);
      const to = (rcpts ?? []).map((r: { email: string }) => r.email);
      const msg = buildIntakePrompt({ donation: row });
      for (const addr of to) { await sendEmail([addr], msg); emailed++; }
    } catch (mailErr) {
      // The donation is recorded either way; the daily reminder will still prompt for the donor name.
      console.error("donation-intake: prompt email failed:", (mailErr as Error).message);
    }
    return res.status(200).json({ created: true, id: row.id, emailed });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
