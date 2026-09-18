import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOrCreateDeviceId,
  loadSettings,
  saveSettings,
  type Settings,
} from "./lib/storage";
import { fetchSummary, registerDevice, savePayout } from "./lib/api";
import { startWorker, stopWorker, type WorkerStatus } from "./lib/worker";

type Tab = "home" | "payout" | "settings";
type ActivityMode = "idle" | "active";

const IDLE_POLL_MS = 5_000;

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [status, setStatus] = useState<WorkerStatus>("off");
  const [activity, setActivity] = useState<ActivityMode>("idle");
  const [entries, setEntries] = useState(0);
  const [refCode, setRefCode] = useState<string>("");
  const [nextAward, setNextAward] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const statusRef = useRef(status);
  const settingsRef = useRef(settings);
  const lastInputRef = useRef(Date.now());
  const applyingRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const refresh = useCallback(async () => {
    try {
      const reg = await registerDevice(
        settings.apiBaseUrl,
        deviceId,
        settings.referralCode
      );
      setRefCode(reg.ref_code);
      const sum = await fetchSummary(settings.apiBaseUrl, deviceId);
      setEntries(sum.entries ?? 0);
      setNextAward(sum.next_award?.next_award_at ?? null);
      setMsg("");
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setMsg(
        `Can't reach the app server (${settings.apiBaseUrl}). ${detail}`
      );
    }
  }, [deviceId, settings.apiBaseUrl, settings.referralCode]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  function update(partial: Partial<Settings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveSettings(next);
  }

  async function applyCpuPercent(percent: number): Promise<boolean> {
    if (applyingRef.current) return false;
    applyingRef.current = true;
    try {
      if (percent <= 0) {
        await stopWorker();
        return true;
      }
      await startWorker({
        deviceId,
        cpuPercent: percent,
        apiBase: settingsRef.current.apiBaseUrl,
      });
      return true;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setMsg(err);
      setStatus("off");
      return false;
    } finally {
      applyingRef.current = false;
    }
  }

  async function toggleEarn() {
    if (status === "earning" || status === "waiting_idle") {
      await stopWorker();
      setStatus("paused");
      setMsg("");
      return;
    }

    if (!settings.allowBattery) {
      try {
        const batt = await (
          navigator as Navigator & {
            getBattery?: () => Promise<{ charging: boolean }>;
          }
        ).getBattery?.();
        if (batt && !batt.charging) {
          setMsg(
            "On battery — earning is off by default. Enable “Allow earning on battery” in Settings to override."
          );
          return;
        }
      } catch {
        /* Battery API unavailable — continue */
      }
    }

    // On Start: apply idle % (yield-the-machine default path).
    const ok = await applyCpuPercent(settings.cpuPercentIdle);
    if (ok) {
      setStatus("earning");
      setActivity("idle");
      lastInputRef.current = Date.now();
      setMsg("");
    }
  }

  async function syncPayout() {
    try {
      await savePayout(settings.apiBaseUrl, deviceId, settings);
      setMsg("Payout addresses saved.");
    } catch {
      setMsg("Could not save payout — is the app server up?");
    }
  }

  // Best-effort activity heuristic (window input). OS idle APIs are next.
  useEffect(() => {
    const bump = () => {
      lastInputRef.current = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;
    for (const ev of events) window.addEventListener(ev, bump, { passive: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, bump);
    };
  }, []);

  useEffect(() => {
    const tick = async () => {
      const s = settingsRef.current;
      const st = statusRef.current;
      if (st !== "earning" && st !== "waiting_idle") return;

      const idleMs = s.idleDelayMin * 60_000;
      const quiet = Date.now() - lastInputRef.current >= idleMs;
      const nextMode: ActivityMode = quiet ? "idle" : "active";
      setActivity(nextMode);

      if (nextMode === "active") {
        if (s.cpuPercentInUse <= 0) {
          await stopWorker();
          if (s.whenBack === "pause") {
            setStatus("paused");
            setMsg("Paused while you’re using the computer. Press Start when you’re ready.");
          } else {
            setStatus("waiting_idle");
          }
        } else if (st === "earning") {
          await applyCpuPercent(s.cpuPercentInUse);
        }
      } else {
        // Idle again
        if (st === "waiting_idle" || st === "earning") {
          const ok = await applyCpuPercent(s.cpuPercentIdle);
          if (ok) setStatus("earning");
        }
      }
    };

    const t = setInterval(tick, IDLE_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  function homeStatusLabel(): { title: string; sub: string; pill: string } {
    if (status === "earning") {
      if (activity === "active" && settings.cpuPercentInUse > 0) {
        return {
          title: "Earning entries…",
          sub: `Computer in use · ${settings.cpuPercentInUse}% CPU`,
          pill: "earning",
        };
      }
      return {
        title: "Earning entries…",
        sub: `Idle · ${settings.cpuPercentIdle}% CPU`,
        pill: "earning",
      };
    }
    if (status === "waiting_idle") {
      return {
        title: "Waiting until idle",
        sub: "Will resume earning when you step away",
        pill: "waiting",
      };
    }
    if (status === "paused") {
      return {
        title: "Paused",
        sub: "Not earning right now",
        pill: "paused",
      };
    }
    return {
      title: "Off",
      sub: "Press Start to earn entries while idle",
      pill: "off",
    };
  }

  const home = homeStatusLabel();

  return (
    <div className="app">
      <div className="tabs">
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
          Home
        </button>
        <button className={tab === "payout" ? "active" : ""} onClick={() => setTab("payout")}>
          Payout
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
      </div>

      {tab === "home" && (
        <div className="card">
          <div className={`status-pill ${home.pill}`}>
            <span className="status-dot" aria-hidden />
            {home.title}
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            {home.sub}
          </p>
          <p className="muted" style={{ marginTop: 16 }}>
            Your entries this race
          </p>
          <div className="big">{entries}</div>
          <p className="muted">
            Next award:{" "}
            {nextAward ? new Date(nextAward).toLocaleString() : "not scheduled"}
          </p>
          <button
            className={`btn ${status === "earning" || status === "waiting_idle" ? "pause" : ""}`}
            onClick={toggleEarn}
          >
            {status === "earning" || status === "waiting_idle" ? "Pause" : "Start"}
          </button>
          <p className="muted" style={{ marginTop: 10 }}>
            Start uses spare computer time to earn prize entries. Pause stops earning.
            Earning stays off on battery unless enabled in Settings.
          </p>
          <div className="callout">
            Entries reset after every award. Each event is a new race from zero.
          </div>
          <div className="footer-links">
            Your invite: <code>{refCode || "…"}</code>
            {refCode && (
              <>
                {" "}
                ·{" "}
                <button
                  className="linkish"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `https://winbitcoin.app/r/${refCode}`
                    )
                  }
                >
                  Copy invite
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "payout" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Where should winnings go?</h2>
          <label>USDT address (TRC20)</label>
          <input
            value={settings.usdtAddress ?? ""}
            onChange={(e) => update({ usdtAddress: e.target.value })}
            placeholder="T…"
          />
          <label>BTC address</label>
          <input
            value={settings.btcAddress ?? ""}
            onChange={(e) => update({ btcAddress: e.target.value })}
            placeholder="bc1… or 1…"
          />
          <fieldset className="radio-group">
            <legend>Preferred payout</legend>
            <label className="radio">
              <input
                type="radio"
                name="pref"
                checked={settings.preferredAsset === "USDT"}
                onChange={() => update({ preferredAsset: "USDT" })}
              />
              USDT (TRC20) — recommended
            </label>
            <label className="radio">
              <input
                type="radio"
                name="pref"
                checked={settings.preferredAsset === "BTC"}
                onChange={() => update({ preferredAsset: "BTC" })}
              />
              BTC
            </label>
          </fieldset>
          <button className="btn" onClick={syncPayout}>
            Save
          </button>
          <p className="muted" style={{ marginTop: 12 }}>
            You can change addresses anytime before a win is locked for payout.
          </p>
        </div>
      )}

      {tab === "settings" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Settings</h2>

          <label>While I’m using the computer</label>
          <select
            value={settings.cpuPercentInUse}
            onChange={(e) =>
              update({
                cpuPercentInUse: Number(e.target.value) as Settings["cpuPercentInUse"],
              })
            }
          >
            <option value={0}>0% — don’t earn while in use</option>
            <option value={25}>25%</option>
            <option value={50}>50%</option>
            <option value={75}>75%</option>
            <option value={100}>100%</option>
          </select>
          <p className="hint">
            When activity is detected, switch to this level. 0% pauses the worker.
          </p>

          <label>When idle</label>
          <select
            value={settings.cpuPercentIdle}
            onChange={(e) =>
              update({
                cpuPercentIdle: Number(e.target.value) as Settings["cpuPercentIdle"],
              })
            }
          >
            <option value={25}>25%</option>
            <option value={50}>50%</option>
            <option value={75}>75%</option>
            <option value={100}>100%</option>
          </select>
          <p className="hint">Used when you press Start, and again once the computer is idle.</p>

          <label>Consider idle after</label>
          <select
            value={settings.idleDelayMin}
            onChange={(e) =>
              update({
                idleDelayMin: Number(e.target.value) as Settings["idleDelayMin"],
              })
            }
          >
            <option value={1}>1 min</option>
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={30}>30 min</option>
          </select>

          <label>If earning pauses while I’m using the computer</label>
          <select
            value={settings.whenBack}
            onChange={(e) =>
              update({ whenBack: e.target.value as Settings["whenBack"] })
            }
          >
            <option value="pause">Stay paused until I press Start</option>
            <option value="resume_idle">Automatically resume idle earning</option>
          </select>

          <div className="row">
            <input
              id="batt"
              type="checkbox"
              checked={settings.allowBattery}
              onChange={(e) => update({ allowBattery: e.target.checked })}
            />
            <label htmlFor="batt" style={{ margin: 0 }}>
              Allow earning on battery (off by default)
            </label>
          </div>

          <label>Bonus goes to (referral code)</label>
          <input
            value={settings.referralCode ?? ""}
            onChange={(e) => update({ referralCode: e.target.value.trim() })}
            placeholder="Friend’s code"
          />
          <p className="hint">
            If you win, that person gets a 10% bonus. You can change this anytime before a
            win is locked.
          </p>

          <details
            className="disclosure"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary>Advanced / Developer</summary>
            <label>API base URL</label>
            <input
              value={settings.apiBaseUrl}
              onChange={(e) => update({ apiBaseUrl: e.target.value })}
            />
            <p className="hint">Testing/dev only. Default is fine for normal use.</p>
          </details>

          <details
            className="disclosure"
            open={detailsOpen}
            onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary>Details / log</summary>
            <p className="muted" style={{ marginTop: 8 }}>
              Device id: <code style={{ fontSize: "0.75rem" }}>{deviceId}</code>
            </p>
            <p className="muted">
              Your invite code: <code>{refCode || "…"}</code>
            </p>
            <p className="muted">
              Activity switching is best-effort (keyboard/mouse in this window). Full OS
              idle detection is next. Worker still uses signed work-config under the hood.
            </p>
          </details>
        </div>
      )}

      {msg && <div className="callout">{msg}</div>}
    </div>
  );
}
