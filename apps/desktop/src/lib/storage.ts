/** Local settings + device id. Uses localStorage in browser/dev; Tauri store when available. */

export type CpuPercentInUse = 0 | 25 | 50 | 75 | 100;
export type CpuPercentIdle = 25 | 50 | 75 | 100;

export interface Settings {
  apiBaseUrl: string;
  /** CPU while the user is actively using the computer. 0% = pause worker while in use. */
  cpuPercentInUse: CpuPercentInUse;
  /** CPU while the computer is idle. Applied on Start; activity switching uses this when idle again. */
  cpuPercentIdle: CpuPercentIdle;
  /** Minutes without input before treating the machine as idle (best-effort activity heuristic). */
  idleDelayMin: 1 | 5 | 10 | 30;
  /**
   * After activity pauses earning (in-use % is 0):
   * - pause: stay paused until the user presses Start
   * - resume_idle: automatically resume at idle % once idle again
   */
  whenBack: "pause" | "resume_idle";
  allowBattery: boolean;
  /** Who gets the 10% referral bonus if this device wins (editable anytime before a win is locked). */
  referralCode?: string;
  usdtAddress?: string;
  usdtNetwork: "TRC20";
  btcAddress?: string;
  preferredAsset: "USDT" | "BTC";
}

export const defaultSettings: Settings = {
  apiBaseUrl: "http://127.0.0.1:8787",
  cpuPercentInUse: 0,
  cpuPercentIdle: 50,
  idleDelayMin: 5,
  whenBack: "pause",
  allowBattery: false,
  usdtNetwork: "TRC20",
  preferredAsset: "USDT",
};

const DEVICE_KEY = "sparks_device_id";
const SETTINGS_KEY = "sparks_settings";

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function migrate(raw: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = { ...raw } as Partial<Settings>;

  // Legacy single CPU % → idle %
  if (out.cpuPercentIdle == null && typeof raw.cpuPercent === "number") {
    const p = raw.cpuPercent as number;
    out.cpuPercentIdle = ([25, 50, 75, 100].includes(p) ? p : 50) as CpuPercentIdle;
  }
  if (out.cpuPercentInUse == null) {
    out.cpuPercentInUse = 0;
  }

  // Drop XMR from preferred / addresses in local settings
  if (raw.preferredAsset === "XMR") {
    out.preferredAsset = "USDT";
  }
  if (raw.usdtNetwork === "ERC20") {
    out.usdtNetwork = "TRC20";
  }

  delete (out as { cpuPercent?: unknown }).cpuPercent;
  delete (out as { xmrAddress?: unknown }).xmrAddress;

  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { ...defaultSettings, ...migrate(parsed) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
