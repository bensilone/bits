import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "node:crypto";
import {
  drawWeightedWinners,
  formatPrizeSummary,
  prizeTotals,
  type DeviceSnapshot,
  type PrizeLine,
} from "@sparks/shared";
import { query, pool } from "../db/pool.js";
import { requireAdmin, signAdminToken } from "../middleware/adminAuth.js";
import { wipeAllPeriodEntries } from "../services/credits.js";
import { config } from "../config.js";

export const adminRouter = Router();

adminRouter.post("/login", async (req, res) => {
  const schema = z.object({
    username: z.string(),
    password: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { rows } = await query<{ id: number; username: string; password_hash: string }>(
    "SELECT id, username, password_hash FROM admin_users WHERE username = $1",
    [parsed.data.username]
  );
  if (!rows.length || !(await bcrypt.compare(parsed.data.password, rows[0].password_hash))) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const token = signAdminToken(rows[0].username, rows[0].id);
  res.cookie("sparks_admin", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 3600 * 1000,
    secure: config.nodeEnv === "production",
  });
  res.json({ token, username: rows[0].username });
});

adminRouter.post("/logout", (_req, res) => {
  res.clearCookie("sparks_admin");
  res.json({ ok: true });
});

adminRouter.use(requireAdmin);

adminRouter.get("/me", (req, res) => {
  res.json({ username: req.admin?.username });
});

// --- Announcements CRUD ---
adminRouter.get("/announcements", async (_req, res) => {
  const { rows } = await query(
    `SELECT * FROM announcements ORDER BY published_at DESC`
  );
  res.json({ announcements: rows });
});

adminRouter.post("/announcements", async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(10000),
    pinned: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { rows } = await query(
    `INSERT INTO announcements (title, body, pinned)
     VALUES ($1, $2, $3) RETURNING *`,
    [parsed.data.title, parsed.data.body, parsed.data.pinned ?? false]
  );
  res.status(201).json({ announcement: rows[0] });
});

adminRouter.put("/announcements/:id", async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).max(200).optional(),
    body: z.string().min(1).max(10000).optional(),
    pinned: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { rows } = await query(
    `UPDATE announcements SET
       title = COALESCE($2, title),
       body = COALESCE($3, body),
       pinned = COALESCE($4, pinned),
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      parsed.data.title ?? null,
      parsed.data.body ?? null,
      parsed.data.pinned ?? null,
    ]
  );
  if (!rows.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ announcement: rows[0] });
});

adminRouter.delete("/announcements/:id", async (req, res) => {
  await query("DELETE FROM announcements WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// --- Award events ---
const prizeLineSchema = z.object({
  amount_usd: z.number().positive(),
  quantity: z.number().int().positive(),
});

adminRouter.get("/award-events", async (_req, res) => {
  const { rows } = await query(
    `SELECT * FROM award_events ORDER BY created_at DESC LIMIT 50`
  );
  const withLines = [];
  for (const ev of rows) {
    const lines = await query(
      "SELECT amount_usd, quantity, sort_order FROM prize_lines WHERE award_event_id = $1 ORDER BY sort_order",
      [ev.id]
    );
    const pl: PrizeLine[] = lines.rows.map((l) => ({
      amountUsd: Number(l.amount_usd),
      quantity: l.quantity as number,
    }));
    withLines.push({
      ...ev,
      prize_lines: lines.rows,
      totals: prizeTotals(pl),
      prize_summary: formatPrizeSummary(pl),
    });
  }
  res.json({ events: withLines });
});

adminRouter.post("/award-events", async (req, res) => {
  const schema = z.object({
    headline: z.string().max(200).optional(),
    blurb: z.string().max(2000).optional(),
    next_award_at: z.string().datetime().optional().nullable(),
    use_spinner: z.boolean().optional(),
    status: z.enum(["draft", "scheduled", "armed"]).optional(),
    prize_lines: z.array(prizeLineSchema).min(1).max(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.prize_lines.length > 10) {
    res.status(400).json({ error: "max_10_prize_lines" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO award_events (headline, blurb, next_award_at, use_spinner, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        parsed.data.headline ?? null,
        parsed.data.blurb ?? null,
        parsed.data.next_award_at ?? null,
        parsed.data.use_spinner ?? true,
        parsed.data.status ?? "draft",
      ]
    );
    const event = rows[0];
    let order = 0;
    for (const line of parsed.data.prize_lines) {
      await client.query(
        `INSERT INTO prize_lines (award_event_id, amount_usd, quantity, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [event.id, line.amount_usd, line.quantity, order++]
      );
    }
    await client.query("COMMIT");

    const pl: PrizeLine[] = parsed.data.prize_lines.map((l) => ({
      amountUsd: l.amount_usd,
      quantity: l.quantity,
    }));
    const eligible = await query<{ devices: string; entries: string }>(
      `SELECT COUNT(*)::text AS devices, COALESCE(SUM(entries),0)::text AS entries
       FROM period_entries WHERE entries > 0`
    );
    res.status(201).json({
      event,
      totals: prizeTotals(pl),
      prize_summary: formatPrizeSummary(pl),
      eligible: {
        devices: Number(eligible.rows[0]?.devices ?? 0),
        entries: Number(eligible.rows[0]?.entries ?? 0),
      },
    });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

adminRouter.patch("/award-events/:id/schedule", async (req, res) => {
  const schema = z.object({
    next_award_at: z.string().datetime(),
    status: z.enum(["scheduled", "armed"]).optional(),
    headline: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { rows } = await query(
    `UPDATE award_events SET
       next_award_at = $2,
       status = COALESCE($3, status),
       headline = COALESCE($4, headline),
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      parsed.data.next_award_at,
      parsed.data.status ?? "scheduled",
      parsed.data.headline ?? null,
    ]
  );
  if (!rows.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ event: rows[0] });
});

adminRouter.post("/award-events/:id/roll", async (req, res) => {
  const eventId = req.params.id;
  const { rows: events } = await query(
    "SELECT * FROM award_events WHERE id = $1",
    [eventId]
  );
  if (!events.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const event = events[0];
  if (["published", "paid"].includes(event.status as string)) {
    res.status(400).json({ error: "already_finalized" });
    return;
  }

  const lines = await query<{ amount_usd: string; quantity: number }>(
    "SELECT amount_usd, quantity FROM prize_lines WHERE award_event_id = $1 ORDER BY sort_order",
    [eventId]
  );
  const prizeLines: PrizeLine[] = lines.rows.map((l) => ({
    amountUsd: Number(l.amount_usd),
    quantity: l.quantity,
  }));

  const snap = await query<{
    device_id: string;
    entries: number;
    preferred_asset: string | null;
    usdt_address: string | null;
    btc_address: string | null;
    xmr_address: string | null;
    referred_by: string | null;
  }>(
    `SELECT pe.device_id, pe.entries, d.preferred_asset, d.usdt_address, d.btc_address, d.xmr_address, d.referred_by
     FROM period_entries pe
     JOIN devices d ON d.id = pe.device_id
     WHERE pe.entries > 0
     ORDER BY pe.device_id`
  );

  const devices: DeviceSnapshot[] = snap.rows.map((r) => ({
    deviceId: r.device_id,
    entries: r.entries,
    preferredAsset: (r.preferred_asset as "USDT" | "BTC" | "XMR") ?? null,
    usdtAddress: r.usdt_address,
    btcAddress: r.btc_address,
    xmrAddress: r.xmr_address,
    referredBy: r.referred_by,
  }));

  const totalEntries = devices.reduce((s, d) => s + d.entries, 0);
  const ticketRoot = crypto
    .createHash("sha256")
    .update(
      devices.map((d) => `${d.deviceId}:${d.entries}`).join("|") +
        `|${eventId}|${totalEntries}`
    )
    .digest("hex");
  const beacon = (req.body?.beacon as string) || crypto.randomBytes(16).toString("hex");
  const seed = crypto
    .createHash("sha256")
    .update(`${ticketRoot}||${beacon}`)
    .digest("hex");

  const winners = drawWeightedWinners(devices, prizeLines, seed);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM winners WHERE award_event_id = $1", [eventId]);
    for (const w of winners) {
      await client.query(
        `INSERT INTO winners
           (award_event_id, seat, device_id, prize_amount_usd, entries_at_win,
            preferred_asset, payout_address, referred_by, referral_bonus_usd, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'proposed')`,
        [
          eventId,
          w.seat,
          w.deviceId,
          w.prizeAmountUsd,
          w.entries,
          w.preferredAsset,
          w.payoutAddress,
          w.referredBy,
          w.prizeAmountUsd * 0.1,
        ]
      );
    }
    await client.query(
      `UPDATE award_events SET
         status = 'rolled', seed = $2, ticket_root = $3,
         total_entries_snapshot = $4, updated_at = NOW()
       WHERE id = $1`,
      [eventId, seed, ticketRoot, totalEntries]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  res.json({
    event_id: eventId,
    seed,
    ticket_root: ticketRoot,
    beacon,
    total_entries: totalEntries,
    winners,
  });
});

adminRouter.post("/award-events/:id/publish", async (req, res) => {
  const eventId = req.params.id;
  const wipe = req.body?.wipe !== false; // default wipe on publish

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM award_events WHERE id = $1 FOR UPDATE",
      [eventId]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (rows[0].status !== "rolled" && rows[0].status !== "armed") {
      // allow publish from rolled primarily
    }
    await client.query(
      `UPDATE winners SET status = 'published'
       WHERE award_event_id = $1 AND status = 'proposed'`,
      [eventId]
    );
    let wiped = 0;
    if (wipe) {
      const w = await client.query(
        `UPDATE period_entries SET credits = 0, entries = 0, updated_at = NOW()`
      );
      wiped = w.rowCount ?? 0;
      await client.query(
        `UPDATE award_events SET status = 'published', published_at = NOW(), wiped_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [eventId]
      );
    } else {
      await client.query(
        `UPDATE award_events SET status = 'published', published_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [eventId]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, wiped_devices: wiped, wiped: wipe });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

adminRouter.post("/award-events/:id/wipe", async (req, res) => {
  const wiped = await wipeAllPeriodEntries();
  await query(
    `UPDATE award_events SET wiped_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  );
  res.json({ ok: true, wiped_devices: wiped });
});

adminRouter.post("/winners/:id/mark-paid", async (req, res) => {
  const schema = z.object({
    tx_id: z.string().min(1).max(200),
    referral_tx_id: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { rows } = await query(
    `UPDATE winners SET status = 'paid', tx_id = $2, referral_tx_id = COALESCE($3, referral_tx_id)
     WHERE id = $1 RETURNING *`,
    [req.params.id, parsed.data.tx_id, parsed.data.referral_tx_id ?? null]
  );
  if (!rows.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ winner: rows[0] });
});

/** Veto stub — marks winner vetoed; re-roll of that seat is a follow-up. */
adminRouter.post("/winners/:id/veto", async (req, res) => {
  const reason = (req.body?.reason as string) || "operator_veto";
  const { rows } = await query(
    `UPDATE winners SET status = 'vetoed', veto_reason = $2 WHERE id = $1 RETURNING *`,
    [req.params.id, reason]
  );
  if (!rows.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({
    winner: rows[0],
    note: "Veto recorded. Re-roll of this seat excluding vetoed devices is a stub — re-run event roll after deleting proposed winners, or implement seat re-roll.",
  });
});

adminRouter.get("/eligible", async (_req, res) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS devices, COALESCE(SUM(entries),0)::int AS entries
     FROM period_entries WHERE entries > 0`
  );
  res.json(rows[0]);
});
