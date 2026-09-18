import type { Settings } from "./storage";
import { apiFetch } from "./http";

export async function registerDevice(
  apiBase: string,
  deviceId: string,
  refCode?: string
) {
  const res = await apiFetch(`${apiBase}/v1/devices/register`, {
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
  const res = await apiFetch(`${apiBase}/v1/devices/${deviceId}/summary`);
  if (!res.ok) throw new Error(`summary ${res.status}`);
  return res.json();
}

export async function savePayout(apiBase: string, deviceId: string, s: Settings) {
  const res = await apiFetch(`${apiBase}/v1/devices/${deviceId}/payout`, {
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

/** Public work-config (mounted at /v1 and /v1/public). */
export interface WorkConfig {
  config_version?: number;
  provider?: string;
  work_type?: string;
  algo?: string;
  pool_url?: string;
  pool_urls?: string[];
  failover_pool_url?: string;
  tls?: boolean;
  wallet?: string | null;
  user_template?: string;
  worker_field?: string;
  pass?: string;
  pause_network?: boolean;
  note?: string;
}

export async function fetchWorkConfig(apiBase: string): Promise<WorkConfig> {
  const base = apiBase.replace(/\/$/, "");
  // Prefer /v1/work-config (alias); fall back to /v1/public/work-config
  let res = await apiFetch(`${base}/v1/work-config`);
  if (res.status === 404) {
    res = await apiFetch(`${base}/v1/public/work-config`);
  }
  if (!res.ok) throw new Error(`work-config ${res.status}`);
  return res.json();
}
