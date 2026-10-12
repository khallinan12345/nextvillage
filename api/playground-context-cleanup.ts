/**
 * PLAYGROUND CONTEXT CLEANUP — Vercel Cron Handler
 *
 * Runs every hour to delete expired rows from the playground_context table.
 * Rows expire after 24 hours (set by expires_at on insert).
 *
 * Vercel cron: "0 * * * *"   (top of every hour)
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from './_lib/vercelTypes';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── Auth: allow Vercel cron or manual trigger with CRON_SECRET ──────────────
  const cronSecret      = process.env.CRON_SECRET;
  const isVercelCron    = req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManualTrigger = req.headers["x-cron-secret"] === cronSecret && !!cronSecret;

  if (!isVercelCron && !isManualTrigger) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const startedAt = new Date().toISOString();

  try {
    // ── Delete expired context rows ────────────────────────────────────────────
    const { data, error, count } = await supabase
      .from("playground_context")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString());

    if (error) throw error;

    const deletedCount = count ?? 0;
    console.log(`[playground-context-cleanup] Deleted ${deletedCount} expired rows at ${startedAt}`);

    return res.status(200).json({
      ok:          true,
      deletedRows: deletedCount,
      ranAt:       startedAt,
    });

  } catch (err: any) {
    console.error("[playground-context-cleanup] Error:", err);
    return res.status(500).json({
      ok:    false,
      error: err?.message ?? "Unknown error",
      ranAt: startedAt,
    });
  }
}
