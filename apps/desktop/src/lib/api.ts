import type { Settings } from "./storage";

export async function registerDevice(
  apiBase: string,
  deviceId: string,
  refCode?: string
) {
  const res = await fetch(`${apiBase}/v1/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      ref_code: refCode || undefined,
      app_version: "0.1.0",
      os: navigator.platform,
    }),
  });
  if (!res.ok) throw new Error(`register ${res.status}`);
  return res.json();
}

export async function fetchSummary(apiBase: string, deviceId: string) {
  const res = await fetch(`${apiBase}/v1/devices/${deviceId}/summary`);
  if (!res.ok) throw new Error(`summary ${res.status}`);
  return res.json();
}

export async function savePayout(apiBase: string, deviceId: string, s: Settings) {
  const res = await fetch(`${apiBase}/v1/devices/${deviceId}/payout`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usdt_address: s.usdtAddress || null,
      usdt_network: s.usdtNetwork,
      btc_address: s.btcAddress || null,
      xmr_address: s.xmrAddress || null,
      preferred_asset: s.preferredAsset,
    }),
  });
  if (!res.ok) throw new Error(`payout ${res.status}`);
  return res.json();
}
