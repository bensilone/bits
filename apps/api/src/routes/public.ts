import { Router } from "express";
import { query } from "../db/pool.js";
import { config } from "../config.js";

export const publicRouter = Router();

publicRouter.get("/stats", async (_req, res) => {
  const paid = await query<{ sum: string }>(
    `SELECT COALESCE(SUM(prize_amount_usd), 0) AS sum FROM winners WHERE status = 'paid'`
  );
  const period = await query<{ sum: string }>(
    `SELECT COALESCE(SUM(entries), 0) AS sum FROM period_entries`
  );
  const active = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM devices WHERE last_seen_at > NOW() - INTERVAL '60 minutes'`
  );
  const total = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM devices`
  );
  const next = await query(
    `SELECT id, headline, next_award_at, status FROM award_events
     WHERE status IN ('scheduled','armed') AND next_award_at IS NOT NULL
     ORDER BY next_award_at ASC LIMIT 1`
  );

  let prizeSummary: string | null = null;
  let totalUsd: number | null = null;
  if (next.rows[0]) {
    const lines = await query<{ amount_usd: string; quantity: number }>(
      "SELECT amount_usd, quantity FROM prize_lines WHERE award_event_id = $1 ORDER BY sort_order",
      [next.rows[0].id]
    );
    prizeSummary = lines.rows
      .map((l) => `${l.quantity}× $${Number(l.amount_usd)}`)
      .join(" · ");
    totalUsd = lines.rows.reduce(
      (s, l) => s + Number(l.amount_usd) * l.quantity,
      0
    );
  }

  res.json({
    total_prizes_paid_usd: Number(paid.rows[0]?.sum ?? 0),
    period_entries: Number(period.rows[0]?.sum ?? 0),
    active_devices: Number(active.rows[0]?.count ?? 0),
    total_devices: Number(total.rows[0]?.count ?? 0),
    next_award: next.rows[0]
      ? {
          headline: next.rows[0].headline,
          next_award_at: next.rows[0].next_award_at,
          prize_summary: prizeSummary,
          total_usd: totalUsd,
        }
      : null,
    wipe_notice:
      "Entries are for this award only. After winners are published, everyone's entries reset. The next event is a new race from zero.",
  });
});

publicRouter.get("/announcements", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { rows } = await query(
    `SELECT id, title, body, pinned, published_at
     FROM announcements
     ORDER BY pinned DESC, published_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json({ announcements: rows });
});

publicRouter.get("/winners", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { rows } = await query(
    `SELECT w.id, w.seat, w.prize_amount_usd, w.preferred_asset, w.payout_address,
            w.status, w.tx_id, w.referral_bonus_usd, w.created_at,
            ae.headline, ae.published_at
     FROM winners w
     JOIN award_events ae ON ae.id = w.award_event_id
     WHERE w.status IN ('published', 'paid')
     ORDER BY COALESCE(ae.published_at, w.created_at) DESC, w.seat ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const masked = rows.map((r) => ({
    ...r,
    payout_address_masked: maskAddress(r.payout_address as string | null),
  }));
  res.json({ winners: masked });
});

function maskAddress(addr: string | null): string | null {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

publicRouter.get("/work-config", async (_req, res) => {
  res.json({
    config_version: 1,
    rates_version: config.ratesVersion,
    credits_per_entry: config.creditsPerEntry,
    provider: "nanopool",
    work_type: "xmr_randomx",
    pool_url: "xmr-us-east1.nanopool.org:10343",
    failover_pool_url: null,
    wallet:
      config.xmrTreasuryAddress && !config.xmrTreasuryAddress.startsWith("YOUR_")
        ? config.xmrTreasuryAddress
        : null,
    note: "Stratum stub — desktop worker plugs RandomX/Nanopool here. Do not ship XMRig binary in-repo.",
    pause_network: false,
  });
});
