/**
 * Nanopool poller — fetches workers once per poll, matches to registered
 * devices, and mints spark_credits via rating delta (preferred) or hashrate×time.
 * Unknown pool workers (e.g. sparks-test-1) are ignored until registered as devices.
 */

import { config } from "../config.js";
import { query } from "../db/pool.js";
import { ingestCredits } from "./credits.js";

const NANOPOOL_API =
  process.env.NANOPOOL_API?.replace(/\/$/, "") ||
  "https://api.nanopool.org/v1/xmr";

const MIN_HASHRATE_ELAPSED_SEC = 30;

export interface NanopoolPollResult {
  skipped: boolean;
  reason?: string;
  workersFromPool: number;
  matchedDevices: number;
  creditsInserted: number;
  balance?: number | null;
  errors: string[];
}

interface NanopoolWorker {
  id: string;
  hashrate?: number;
  lastShare?: number;
  rating?: number;
  uid?: number;
}

interface WorkerState {
  worker_id: string;
  last_rating: string | null;
  last_hashrate: string | null;
  last_polled_at: Date | null;
}

function isoMinuteUtc(d = new Date()): string {
  // e.g. 2026-09-18T19:47Z — one mint per device per UTC minute
  return d.toISOString().slice(0, 16) + "Z";
}

async function fetchJson<T>(
  url: string
): Promise<{ ok: true; body: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} for ${url}` };
    }
    const body = (await res.json()) as T;
    return { ok: true, body };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function upsertWorkerState(
  workerId: string,
  rating: number,
  hashrate: number,
  polledAt: Date
): Promise<void> {
  await query(
    `INSERT INTO nanopool_worker_state (worker_id, last_rating, last_hashrate, last_polled_at)
     VALUES ($1, $2::numeric, $3::numeric, $4)
     ON CONFLICT (worker_id) DO UPDATE SET
       last_rating = EXCLUDED.last_rating,
       last_hashrate = EXCLUDED.last_hashrate,
       last_polled_at = EXCLUDED.last_polled_at`,
    [workerId, rating, hashrate, polledAt]
  );
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
      workersFromPool: 0,
      matchedDevices: 0,
      creditsInserted: 0,
      errors: [],
    };
  }

  const errors: string[] = [];
  const now = new Date();

  // 1) Workers once per poll (rate limit ~30 req/min)
  const workersUrl = `${NANOPOOL_API}/workers/${wallet}`;
  const workersRes = await fetchJson<{
    status: boolean;
    data?: NanopoolWorker[] | null;
    error?: string;
  }>(workersUrl);

  if (!workersRes.ok) {
    return {
      skipped: false,
      workersFromPool: 0,
      matchedDevices: 0,
      creditsInserted: 0,
      errors: [workersRes.error],
    };
  }

  if (!workersRes.body.status || !Array.isArray(workersRes.body.data)) {
    errors.push(
      workersRes.body.error ||
        "Nanopool workers response missing data (account may not exist yet)"
    );
    // Still try balance for telemetry
  }

  const poolWorkers = Array.isArray(workersRes.body.data)
    ? workersRes.body.data
    : [];

  // 2) Balance once (telemetry only — not used for credits). Do not use /user/.
  let balance: number | null = null;
  const balanceRes = await fetchJson<{
    status: boolean;
    data?: number | null;
  }>(`${NANOPOOL_API}/balance/${wallet}`);
  if (balanceRes.ok && balanceRes.body.status) {
    balance =
      typeof balanceRes.body.data === "number" ? balanceRes.body.data : null;
  } else if (!balanceRes.ok) {
    errors.push(`balance: ${balanceRes.error}`);
  }

  // 3) Registered devices — match worker.id ↔ device.id (case-insensitive)
  const { rows: devices } = await query<{ id: string }>(
    "SELECT id FROM devices ORDER BY created_at DESC LIMIT 5000"
  );
  const deviceByLowerId = new Map(
    devices.map((d) => [d.id.toLowerCase(), d.id])
  );

  let matchedDevices = 0;
  let creditsInserted = 0;

  for (const worker of poolWorkers) {
    const workerIdRaw = String(worker.id ?? "").trim();
    if (!workerIdRaw) continue;

    const deviceId = deviceByLowerId.get(workerIdRaw.toLowerCase());
    if (!deviceId) {
      // Unknown workers (e.g. sparks-test-1) — do not mint
      continue;
    }
    matchedDevices++;

    const rating = Number(worker.rating ?? 0);
    const hashrate = Number(worker.hashrate ?? 0);
    const ratingSafe = Number.isFinite(rating) ? rating : 0;
    const hashrateSafe = Number.isFinite(hashrate) ? hashrate : 0;

    try {
      const { rows: stateRows } = await query<WorkerState>(
        `SELECT worker_id, last_rating, last_hashrate, last_polled_at
         FROM nanopool_worker_state WHERE worker_id = $1`,
        [deviceId]
      );
      const prev = stateRows[0];

      // First observation: seed state only (avoid minting historical rating)
      if (!prev || !prev.last_polled_at) {
        await upsertWorkerState(deviceId, ratingSafe, hashrateSafe, now);
        continue;
      }

      const lastRating = Number(prev.last_rating ?? 0);
      const lastPolledAt = new Date(prev.last_polled_at);
      const elapsedSeconds = Math.max(
        0,
        (now.getTime() - lastPolledAt.getTime()) / 1000
      );

      let native = 0;
      let ingestKey: string | null = null;

      if (ratingSafe > lastRating) {
        native = ratingSafe - lastRating;
        ingestKey = `nanopool:rating:${deviceId}:${ratingSafe}`;
      } else if (
        hashrateSafe > 0 &&
        elapsedSeconds >= MIN_HASHRATE_ELAPSED_SEC
      ) {
        native = hashrateSafe * elapsedSeconds;
        ingestKey = `nanopool:hr:${deviceId}:${isoMinuteUtc(now)}`;
      }

      if (native > 0 && ingestKey) {
        const result = await ingestCredits({
          deviceId,
          provider: "nanopool",
          ingestKey,
          nativeUnits: native,
          attestedAt: now,
        });
        if (result.inserted) creditsInserted++;
      }

      await upsertWorkerState(deviceId, ratingSafe, hashrateSafe, now);
    } catch (e) {
      errors.push(
        `worker ${deviceId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return {
    skipped: false,
    workersFromPool: poolWorkers.length,
    matchedDevices,
    creditsInserted,
    balance,
    errors,
  };
}
