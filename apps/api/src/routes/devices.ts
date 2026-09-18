import { Router } from "express";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import crypto from "node:crypto";
import { query } from "../db/pool.js";
import { config } from "../config.js";

const refAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

export const devicesRouter = Router();

const registerSchema = z.object({
  device_id: z.string().uuid(),
  ref_code: z.string().min(4).max(16).optional(),
  app_version: z.string().max(64).optional(),
  os: z.string().max(64).optional(),
});

devicesRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { device_id, ref_code, app_version, os } = parsed.data;

  const existing = await query("SELECT id, ref_code FROM devices WHERE id = $1", [
    device_id,
  ]);
  if (existing.rows.length) {
    // Referral bonus target is editable anytime (until a win is locked in draw ops).
    let referredByUpdate: string | null | undefined = undefined;
    if (ref_code !== undefined) {
      referredByUpdate = null;
      if (ref_code) {
        const ref = await query<{ id: string }>(
          "SELECT id FROM devices WHERE ref_code = $1",
          [ref_code.toUpperCase()]
        );
        if (ref.rows[0] && ref.rows[0].id !== device_id) {
          referredByUpdate = ref.rows[0].id;
        }
      }
      await query(
        `UPDATE devices SET last_seen_at = NOW(), app_version = COALESCE($2, app_version),
         os = COALESCE($3, os), referred_by = $4, updated_at = NOW() WHERE id = $1`,
        [device_id, app_version ?? null, os ?? null, referredByUpdate]
      );
      await query(`DELETE FROM referrals WHERE referred_id = $1`, [device_id]);
      if (referredByUpdate) {
        await query(
          `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)
           ON CONFLICT (referred_id) DO UPDATE SET referrer_id = EXCLUDED.referrer_id`,
          [referredByUpdate, device_id]
        );
      }
    } else {
      await query(
        "UPDATE devices SET last_seen_at = NOW(), app_version = COALESCE($2, app_version), os = COALESCE($3, os), updated_at = NOW() WHERE id = $1",
        [device_id, app_version ?? null, os ?? null]
      );
    }
    const pe = await query(
      "SELECT entries, lifetime_entries FROM period_entries WHERE device_id = $1",
      [device_id]
    );
    res.json({
      device_id,
      ref_code: existing.rows[0].ref_code,
      created: false,
      entries: pe.rows[0]?.entries ?? 0,
      lifetime_entries: pe.rows[0]?.lifetime_entries ?? 0,
    });
    return;
  }

  let referredBy: string | null = null;
  if (ref_code) {
    const ref = await query<{ id: string }>(
      "SELECT id FROM devices WHERE ref_code = $1",
      [ref_code.toUpperCase()]
    );
    if (ref.rows[0] && ref.rows[0].id !== device_id) {
      referredBy = ref.rows[0].id;
    }
  }

  let myRef = refAlphabet();
  for (let i = 0; i < 5; i++) {
    const clash = await query("SELECT 1 FROM devices WHERE ref_code = $1", [myRef]);
    if (!clash.rows.length) break;
    myRef = refAlphabet();
  }

  const workerSecret = crypto.randomBytes(24).toString("base64url");

  await query(
    `INSERT INTO devices (id, ref_code, referred_by, worker_secret, app_version, os, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [device_id, myRef, referredBy, workerSecret, app_version ?? null, os ?? null]
  );
  await query(
    `INSERT INTO period_entries (device_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [device_id]
  );
  if (referredBy) {
    await query(
      `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2) ON CONFLICT (referred_id) DO NOTHING`,
      [referredBy, device_id]
    );
  }

  res.status(201).json({
    device_id,
    ref_code: myRef,
    created: true,
    worker_secret: workerSecret,
    entries: 0,
    lifetime_entries: 0,
  });
});

const payoutSchema = z.object({
  usdt_address: z.string().max(128).nullable().optional(),
  usdt_network: z.enum(["TRC20", "ERC20"]).optional(),
  btc_address: z.string().max(128).nullable().optional(),
  // Desktop UI no longer collects XMR; field kept optional for older clients.
  xmr_address: z.string().max(200).nullable().optional(),
  preferred_asset: z.enum(["USDT", "BTC", "XMR"]).optional(),
});

devicesRouter.put("/:id/payout", async (req, res) => {
  const id = req.params.id;
  const parsed = payoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const r = await query(
    `UPDATE devices SET
       usdt_address = COALESCE($2, usdt_address),
       usdt_network = COALESCE($3, usdt_network),
       btc_address = COALESCE($4, btc_address),
       xmr_address = COALESCE($5, xmr_address),
       preferred_asset = COALESCE($6, preferred_asset),
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, usdt_address, usdt_network, btc_address, xmr_address, preferred_asset`,
    [
      id,
      d.usdt_address ?? null,
      d.usdt_network ?? null,
      d.btc_address ?? null,
      d.xmr_address ?? null,
      d.preferred_asset ?? null,
    ]
  );
  if (!r.rows.length) {
    res.status(404).json({ error: "device_not_found" });
    return;
  }
  res.json({ device_id: id, payout: r.rows[0] });
});

devicesRouter.get("/:id/summary", async (req, res) => {
  const id = req.params.id;
  const d = await query(
    `SELECT id, ref_code, preferred_asset, usdt_address, usdt_network, btc_address, xmr_address, last_seen_at, created_at
     FROM devices WHERE id = $1`,
    [id]
  );
  if (!d.rows.length) {
    res.status(404).json({ error: "device_not_found" });
    return;
  }
  await query("UPDATE devices SET last_seen_at = NOW() WHERE id = $1", [id]);
  const pe = await query(
    "SELECT entries, credits, lifetime_entries, lifetime_credits FROM period_entries WHERE device_id = $1",
    [id]
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
    device: d.rows[0],
    entries: pe.rows[0]?.entries ?? 0,
    credits: Number(pe.rows[0]?.credits ?? 0),
    lifetime_entries: pe.rows[0]?.lifetime_entries ?? 0,
    lifetime_credits: Number(pe.rows[0]?.lifetime_credits ?? 0),
    credits_per_entry: config.creditsPerEntry,
    next_award: next.rows[0]
      ? {
          headline: next.rows[0].headline,
          next_award_at: next.rows[0].next_award_at,
          prize_summary: prizeSummary,
          total_usd: totalUsd,
        }
      : null,
  });
});
