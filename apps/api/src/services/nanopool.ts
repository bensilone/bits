/**
 * Nanopool poll stub — safe no-op without a real treasury address.
 * When XMR_TREASURY_ADDRESS is set, would poll Nanopool worker API
 * and call ingestCredits with idempotent keys.
 */

import { config } from "../config.js";
import { query } from "../db/pool.js";
import { ingestCredits } from "./credits.js";

const NANOPOOL_API = "https://api.nanopool.org/v1/xmr";

export interface NanopoolPollResult {
  skipped: boolean;
  reason?: string;
  workersChecked: number;
  creditsInserted: number;
}

/**
 * Poll Nanopool for worker stats and mint spark_credits.
 * Without XMR_TREASURY_ADDRESS this is a documented no-op.
 */
export async function pollNanopool(): Promise<NanopoolPollResult> {
  const wallet = config.xmrTreasuryAddress?.trim();
  if (!wallet || wallet.startsWith("YOUR_")) {
    return {
      skipped: true,
      reason: "XMR_TREASURY_ADDRESS not configured — Nanopool poll is a no-op",
      workersChecked: 0,
      creditsInserted: 0,
    };
  }

  // List known devices as workers
  const { rows: devices } = await query<{ id: string }>(
    "SELECT id FROM devices ORDER BY created_at DESC LIMIT 500"
  );

  let creditsInserted = 0;
  for (const d of devices) {
    try {
      const url = `${NANOPOOL_API}/workers/${wallet}`;
      // In production we'd fetch worker list once; per-worker for clarity in stub
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        status: boolean;
        data?: Array<{ id: string; rating?: number; hashrate?: number }>;
      };
      if (!body.status || !body.data) continue;

      const worker = body.data.find((w) => w.id === d.id);
      if (!worker) continue;

      // Use rating (difficulty-weighted shares) when present; key by hour bucket
      const native = Number(worker.rating ?? worker.hashrate ?? 0);
      if (native <= 0) continue;

      const hour = new Date().toISOString().slice(0, 13);
      const ingestKey = `nanopool:${d.id}:${hour}:${Math.floor(native)}`;
      const result = await ingestCredits({
        deviceId: d.id,
        provider: "nanopool",
        ingestKey,
        nativeUnits: native,
      });
      if (result.inserted) creditsInserted++;
    } catch {
      // swallow per-worker errors in stub
    }
  }

  return {
    skipped: false,
    workersChecked: devices.length,
    creditsInserted,
  };
}
