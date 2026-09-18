import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { ingestCredits } from "../services/credits.js";
import { pollNanopool } from "../services/nanopool.js";
import { query } from "../db/pool.js";

export const devRouter = Router();

devRouter.use((_req, res, next) => {
  if (!config.isDev) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  next();
});

/**
 * POST /v1/dev/mock-ingest — add attested work for a device (local testing).
 */
devRouter.post("/mock-ingest", async (req, res) => {
  const schema = z.object({
    device_id: z.string().uuid(),
    native_units: z.number().positive(),
    ingest_key: z.string().min(1).max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const exists = await query("SELECT 1 FROM devices WHERE id = $1", [
    parsed.data.device_id,
  ]);
  if (!exists.rows.length) {
    res.status(404).json({ error: "device_not_found" });
    return;
  }
  const key =
    parsed.data.ingest_key ??
    `mock:${parsed.data.device_id}:${Date.now()}:${parsed.data.native_units}`;
  const result = await ingestCredits({
    deviceId: parsed.data.device_id,
    provider: "mock",
    ingestKey: key,
    nativeUnits: parsed.data.native_units,
  });
  res.json({ ok: true, ingest_key: key, ...result });
});

devRouter.post("/poll-nanopool", async (_req, res) => {
  const result = await pollNanopool();
  res.json(result);
});
