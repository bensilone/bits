/** Local settings + device id. Uses localStorage in browser/dev; Tauri store when available. */

export interface Settings {
  apiBaseUrl: string;
  cpuPercent: 25 | 50 | 75 | 100;
  idleDelayMin: 1 | 5 | 10 | 30;
  whenBack: "pause" | "resume_idle";
  allowBattery: boolean;
  referralCode?: string;
  usdtAddress?: string;
  usdtNetwork: "TRC20" | "ERC20";
  btcAddress?: string;
  xmrAddress?: string;
  preferredAsset: "USDT" | "BTC" | "XMR";
}

export const defaultSettings: Settings = {
  apiBaseUrl: "http://127.0.0.1:8787",
  cpuPercent: 50,
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

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
