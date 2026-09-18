/**
 * Supervisor for the background worker (work-config → pool).
 * Binary is fetched locally via `npm run fetch-worker` (not committed).
 * User-facing copy stays prize/entries; this module is plumbing only.
 */

import { fetchWorkConfig, type WorkConfig } from "./api";

export type WorkerStatus = "off" | "earning" | "paused" | "waiting_idle";

let running = false;
let lastOpts: { deviceId: string; cpuPercent: number; apiBase: string } | null =
  null;

export function isWorkerRunning() {
  return running;
}

function buildPools(cfg: WorkConfig, user: string, pass: string) {
  const urls: string[] = [];
  if (cfg.pool_url) urls.push(cfg.pool_url);
  if (Array.isArray(cfg.pool_urls)) {
    for (const u of cfg.pool_urls) {
      if (u && !urls.includes(u)) urls.push(u);
    }
  }
  if (cfg.failover_pool_url && !urls.includes(cfg.failover_pool_url)) {
    urls.push(cfg.failover_pool_url);
  }
  if (!urls.length) {
    urls.push("xmr-us-east1.nanopool.org:10343");
  }
  const tls = cfg.tls !== false;
  const algo = cfg.algo || "rx/0";
  return urls.map((url) => ({
    algo,
    url,
    user,
    pass,
    keepalive: true,
    tls,
  }));
}

export async function startWorker(opts: {
  deviceId: string;
  cpuPercent: number;
  apiBase: string;
}): Promise<void> {
  if (opts.cpuPercent <= 0) {
    await stopWorker();
    return;
  }

  // Restart if already running at a different %
  if (running) {
    const same =
      lastOpts &&
      lastOpts.deviceId === opts.deviceId &&
      lastOpts.apiBase === opts.apiBase &&
      lastOpts.cpuPercent === opts.cpuPercent;
    if (same) return;
    await stopWorker();
  }

  const work = await fetchWorkConfig(opts.apiBase);
  if (work.pause_network) {
    throw new Error("Network earning is paused by the server. Try again later.");
  }
  const wallet = work.wallet?.trim();
  if (!wallet) {
    throw new Error(
      "Work-config has no wallet. Set XMR_TREASURY_ADDRESS on the API."
    );
  }

  const user = `${wallet}.${opts.deviceId}`;
  const pass = work.pass || "x";
  const pools = buildPools(work, user, pass);

  const xmrigConfig = {
    autosave: false,
    "donate-level": 1,
    cpu: {
      enabled: true,
      "max-threads-hint": opts.cpuPercent,
      priority: 1,
    },
    pools,
  };

  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  const threads = Math.max(1, Math.round((cores * opts.cpuPercent) / 100));

  const { invoke } = await import("@tauri-apps/api/core");

  let binaryPath: string;
  try {
    binaryPath = await invoke<string>("resolve_xmrig_binary");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      msg.includes("fetch-worker")
        ? msg
        : `Worker binary missing. Run: cd apps/desktop && npm run fetch-worker (${msg})`
    );
  }

  const configPath = await invoke<string>("write_xmrig_config", {
    contents: JSON.stringify(xmrigConfig, null, 2),
  });

  await invoke("start_xmrig", {
    configPath,
    binaryPath,
    threads,
  });

  running = true;
  lastOpts = { ...opts };
  console.log(
    `[worker] started user=${user} threads=${threads} cpu%=${opts.cpuPercent} pool=${pools[0]?.url}`
  );
}

export async function stopWorker(): Promise<void> {
  running = false;
  lastOpts = null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_worker");
  } catch (e) {
    console.warn("[worker] stop failed", e);
  }
}
