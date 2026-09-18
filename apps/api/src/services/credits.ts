import { config } from "../config.js";
import { pool, query } from "../db/pool.js";

/**
 * Idempotent credit ingest. Returns whether a new row was inserted.
 * Updates period_entries: credits += credits; entries = floor(credits / CREDITS_PER_ENTRY)
 */
export async function ingestCredits(opts: {
  deviceId: string;
  provider: string;
  ingestKey: string;
  nativeUnits: number;
  multiplier?: number;
  ratesVersion?: number;
  attestedAt?: Date;
}): Promise<{ inserted: boolean; credits: number; entries: number }> {
  const multiplier = opts.multiplier ?? config.nanopoolMultiplier;
  const ratesVersion = opts.ratesVersion ?? config.ratesVersion;
  const credits = opts.nativeUnits * multiplier;
  const creditsPerEntry = config.creditsPerEntry;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO spark_credits
         (device_id, provider, rates_version, native_units, multiplier, credits, ingest_key, attested_at)
       VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7, $8)
       ON CONFLICT (provider, ingest_key) DO NOTHING
       RETURNING id`,
      [
        opts.deviceId,
        opts.provider,
        ratesVersion,
        opts.nativeUnits,
        multiplier,
        credits,
        opts.ingestKey,
        opts.attestedAt ?? new Date(),
      ]
    );

    if (!ins.rowCount) {
      await client.query("COMMIT");
      const cur = await query<{ credits: string; entries: number }>(
        "SELECT credits, entries FROM period_entries WHERE device_id = $1",
        [opts.deviceId]
      );
      return {
        inserted: false,
        credits: Number(cur.rows[0]?.credits ?? 0),
        entries: cur.rows[0]?.entries ?? 0,
      };
    }

    await client.query(
      `INSERT INTO period_entries (device_id, credits, entries, lifetime_credits, lifetime_entries)
       VALUES (
         $1,
         $2::numeric,
         FLOOR($2::numeric / $3::numeric)::int,
         $2::numeric,
         FLOOR($2::numeric / $3::numeric)::int
       )
       ON CONFLICT (device_id) DO UPDATE SET
         credits = period_entries.credits + EXCLUDED.credits,
         entries = FLOOR((period_entries.credits + EXCLUDED.credits) / $3::numeric)::int,
         lifetime_credits = period_entries.lifetime_credits + EXCLUDED.credits,
         lifetime_entries = period_entries.lifetime_entries
           + (FLOOR((period_entries.credits + EXCLUDED.credits) / $3::numeric)::int - period_entries.entries),
         updated_at = NOW()`,
      [opts.deviceId, credits, creditsPerEntry]
    );

    const cur = await client.query<{ credits: string; entries: number }>(
      "SELECT credits, entries FROM period_entries WHERE device_id = $1",
      [opts.deviceId]
    );
    await client.query("COMMIT");
    return {
      inserted: true,
      credits: Number(cur.rows[0]?.credits ?? 0),
      entries: cur.rows[0]?.entries ?? 0,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function wipeAllPeriodEntries(): Promise<number> {
  const r = await query(
    `UPDATE period_entries SET credits = 0, entries = 0, updated_at = NOW()`
  );
  return r.rowCount ?? 0;
}
