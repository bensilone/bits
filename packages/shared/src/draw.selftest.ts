import { drawWeightedWinners, prizeTotals } from "./draw.js";

const devices = [
  { deviceId: "a", entries: 10 },
  { deviceId: "b", entries: 5 },
  { deviceId: "c", entries: 1 },
];
const lines = [
  { amountUsd: 100, quantity: 1 },
  { amountUsd: 10, quantity: 2 },
];
const w1 = drawWeightedWinners(devices, lines, "seed-demo-1");
const w2 = drawWeightedWinners(devices, lines, "seed-demo-1");
const ids1 = w1.map((w) => w.deviceId).join(",");
const ids2 = w2.map((w) => w.deviceId).join(",");
if (ids1 !== ids2) throw new Error("not deterministic");
if (new Set(w1.map((w) => w.deviceId)).size !== w1.length)
  throw new Error("device replacement bug");
console.log("draw ok", w1, prizeTotals(lines));
