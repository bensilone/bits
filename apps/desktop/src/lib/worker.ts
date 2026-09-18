/**
 * Supervisor for the placeholder worker process.
 *
 * Production: spawn RandomX / Nanopool worker here (NOT stock XMRig binary in-repo).
 * Plug-in point: replace scripts/placeholder-worker.* with your pinned RandomX worker,
 * passing pool_url, wallet, worker=device_id from /v1/work-config.
 */

export type WorkerStatus = "off" | "earning" | "paused";

let simTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function isWorkerRunning() {
  return running;
}

export async function startWorker(opts: {
  deviceId: string;
  cpuPercent: number;
  apiBase: string;
}): Promise<void> {
  if (running) return;
  running = true;

  try {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const isWin = navigator.userAgent.includes("Windows");
    const script = isWin
      ? "scripts/placeholder-worker.cmd"
      : "scripts/placeholder-worker.sh";
    const cmd = Command.create(
      isWin ? "cmd" : "bash",
      isWin
        ? ["/c", script, opts.deviceId, String(opts.cpuPercent)]
        : [script, opts.deviceId, String(opts.cpuPercent)]
    );
    cmd.stdout.on("data", (l: string) => console.log("[worker]", l));
    cmd.stderr.on("data", (l: string) => console.warn("[worker]", l));
    await cmd.spawn();
    console.log("Worker spawned (placeholder). RandomX plugs in at scripts/ + Rust supervisor.");
  } catch {
    console.log("[worker-sim] earning for", opts.deviceId, "cpu%", opts.cpuPercent);
    simTimer = setInterval(() => {
      console.log("[worker-sim] heartbeat", new Date().toISOString());
    }, 15_000);
  }
}

export async function stopWorker(): Promise<void> {
  running = false;
  if (simTimer) {
    clearInterval(simTimer);
    simTimer = null;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_worker");
  } catch {
    console.log("[worker] stop (sim)");
  }
}
