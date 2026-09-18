/**
 * Weighted multi-prize draw without device replacement.
 * Deterministic given the same seed + ordered snapshot + prize lines.
 *
 * Algorithm:
 * 1. Expand prize seats (largest amounts first by default if caller sorts).
 * 2. For each seat, pick a device proportional to remaining entries using
 *    a seeded PRNG (mulberry32 from SHA-256 seed bytes).
 * 3. Remove that device from the pool (one prize per device).
 */

import type { DeviceSnapshot, DrawWinner, PrizeLine, PayoutAsset } from "./types.js";

/** Expand prize lines into ordered seats (caller should sort largest-first). */
export function expandPrizeSeats(lines: PrizeLine[]): number[] {
  const seats: number[] = [];
  for (const line of lines) {
    if (line.quantity < 1 || line.amountUsd <= 0) continue;
    for (let i = 0; i < line.quantity; i++) {
      seats.push(line.amountUsd);
    }
  }
  return seats;
}

/** Sort prize lines largest amount first (stable for equal amounts). */
export function sortPrizeLinesLargestFirst(lines: PrizeLine[]): PrizeLine[] {
  return [...lines].sort((a, b) => b.amountUsd - a.amountUsd);
}

export function prizeTotals(lines: PrizeLine[]): {
  totalPrizes: number;
  totalPayoutUsd: number;
  referralFloatUsd: number;
  grandTotalUsd: number;
} {
  let totalPrizes = 0;
  let totalPayoutUsd = 0;
  for (const l of lines) {
    totalPrizes += l.quantity;
    totalPayoutUsd += l.amountUsd * l.quantity;
  }
  const referralFloatUsd = totalPayoutUsd * 0.1;
  return {
    totalPrizes,
    totalPayoutUsd,
    referralFloatUsd,
    grandTotalUsd: totalPayoutUsd + referralFloatUsd,
  };
}

/** Simple mulberry32 PRNG from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a 32-bit seed from a hex/string seed (FNV-1a style mix). */
export function seedToU32(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function resolvePayoutAddress(
  d: DeviceSnapshot
): { asset: PayoutAsset | null; address: string | null } {
  const pref = d.preferredAsset ?? "USDT";
  if (pref === "USDT" && d.usdtAddress) return { asset: "USDT", address: d.usdtAddress };
  if (pref === "BTC" && d.btcAddress) return { asset: "BTC", address: d.btcAddress };
  if (pref === "XMR" && d.xmrAddress) return { asset: "XMR", address: d.xmrAddress };
  if (d.usdtAddress) return { asset: "USDT", address: d.usdtAddress };
  if (d.btcAddress) return { asset: "BTC", address: d.btcAddress };
  if (d.xmrAddress) return { asset: "XMR", address: d.xmrAddress };
  return { asset: pref, address: null };
}

/**
 * Draw winners for all seats from the same snapshot.
 * Devices with entries <= 0 are ignored.
 * If seats remain but no eligible devices left, those seats are skipped.
 */
export function drawWeightedWinners(
  devices: DeviceSnapshot[],
  prizeLines: PrizeLine[],
  seed: string,
  options?: { sortLargestFirst?: boolean }
): DrawWinner[] {
  const lines =
    options?.sortLargestFirst === false
      ? prizeLines
      : sortPrizeLinesLargestFirst(prizeLines);
  const seats = expandPrizeSeats(lines);
  const pool = devices
    .filter((d) => d.entries > 0)
    .map((d) => ({ ...d }));
  const rng = mulberry32(seedToU32(seed));
  const winners: DrawWinner[] = [];

  for (let seat = 0; seat < seats.length; seat++) {
    const totalWeight = pool.reduce((s, d) => s + d.entries, 0);
    if (totalWeight <= 0 || pool.length === 0) break;

    let pick = rng() * totalWeight;
    let chosenIdx = 0;
    for (let i = 0; i < pool.length; i++) {
      pick -= pool[i].entries;
      if (pick < 0) {
        chosenIdx = i;
        break;
      }
      chosenIdx = i;
    }

    const chosen = pool[chosenIdx];
    const { asset, address } = resolvePayoutAddress(chosen);
    winners.push({
      seat: seat + 1,
      prizeAmountUsd: seats[seat],
      deviceId: chosen.deviceId,
      entries: chosen.entries,
      preferredAsset: asset,
      payoutAddress: address,
      referredBy: chosen.referredBy ?? null,
    });
    pool.splice(chosenIdx, 1);
  }

  return winners;
}

/** Format prize lines for public copy: "1× $100 · 5× $20 · 20× $10" */
export function formatPrizeSummary(lines: PrizeLine[]): string {
  return lines
    .filter((l) => l.quantity > 0 && l.amountUsd > 0)
    .map((l) => `${l.quantity}× $${l.amountUsd}`)
    .join(" · ");
}
