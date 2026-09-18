import { useCallback, useEffect, useState } from "react";
import {
  getOrCreateDeviceId,
  loadSettings,
  saveSettings,
  type Settings,
} from "./lib/storage";
import { fetchSummary, registerDevice, savePayout } from "./lib/api";
import { startWorker, stopWorker, type WorkerStatus } from "./lib/worker";

type Tab = "home" | "payout" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [status, setStatus] = useState<WorkerStatus>("off");
  const [entries, setEntries] = useState(0);
  const [refCode, setRefCode] = useState<string>("");
  const [nextAward, setNextAward] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

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
      setMsg(`API unreachable (${settings.apiBaseUrl}). Start the API locally.`);
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

  async function toggleEarn() {
    if (status === "earning") {
      await stopWorker();
      setStatus("paused");
      setMsg("");
      return;
    }
    // Battery gate: earn OFF by default unless Settings allow it
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
    try {
      await startWorker({
        deviceId,
        cpuPercent: settings.cpuPercent,
        apiBase: settings.apiBaseUrl,
      });
      setStatus("earning");
      setMsg("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("off");
      setMsg(msg);
    }
  }

  async function syncPayout() {
    try {
      await savePayout(settings.apiBaseUrl, deviceId, settings);
      setMsg("Payout addresses saved.");
    } catch {
      setMsg("Could not save payout — is the API up?");
    }
  }

  return (
    <div className="app">
      <div className="tabs">
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
          Home
        </button>
        <button className={tab === "payout" ? "active" : ""} onClick={() => setTab("payout")}>
          Payout
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Settings
        </button>
      </div>

      {tab === "home" && (
        <div className="card">
          <p className="status">
            {status === "earning"
              ? "Idle · Earning"
              : status === "paused"
                ? "Paused"
                : "Off"}
          </p>
          <p className="muted">Your entries this race</p>
          <div className="big">{entries}</div>
          <p className="muted">
            Next award:{" "}
            {nextAward ? new Date(nextAward).toLocaleString() : "not scheduled"}
          </p>
          <button
            className={`btn ${status === "earning" ? "pause" : ""}`}
            onClick={toggleEarn}
          >
            {status === "earning" ? "Pause" : "Start"}
          </button>
          <p className="muted" style={{ marginTop: 10 }}>
            Start runs RandomX to Nanopool for the prize pot. Pause stops the worker.
            Earning stays off on battery unless enabled in Settings.
          </p>
          <div className="callout">
            Entries reset after every award. Each event is a new race from zero.
          </div>
          <div className="footer-links">
            Ref: <code>{refCode || "…"}</code>
            {refCode && (
              <>
                {" "}
                ·{" "}
                <button
                  style={{ border: "none", background: "none", color: "#0284c7", cursor: "pointer" }}
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
          <label>USDT address (TRC20 default)</label>
          <input
            value={settings.usdtAddress ?? ""}
            onChange={(e) => update({ usdtAddress: e.target.value })}
            placeholder="T…"
          />
          <label>USDT network</label>
          <select
            value={settings.usdtNetwork}
            onChange={(e) =>
              update({ usdtNetwork: e.target.value as Settings["usdtNetwork"] })
            }
          >
            <option value="TRC20">TRC20</option>
            <option value="ERC20">ERC20</option>
          </select>
          <label>BTC address</label>
          <input
            value={settings.btcAddress ?? ""}
            onChange={(e) => update({ btcAddress: e.target.value })}
          />
          <label>XMR address</label>
          <input
            value={settings.xmrAddress ?? ""}
            onChange={(e) => update({ xmrAddress: e.target.value })}
          />
          <label>Preferred payout</label>
          <select
            value={settings.preferredAsset}
            onChange={(e) =>
              update({ preferredAsset: e.target.value as Settings["preferredAsset"] })
            }
          >
            <option value="USDT">USDT</option>
            <option value="BTC">BTC</option>
            <option value="XMR">XMR</option>
          </select>
          <button className="btn" onClick={syncPayout}>
            Save
          </button>
        </div>
      )}

      {tab === "settings" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Settings</h2>
          <label>API base URL</label>
          <input
            value={settings.apiBaseUrl}
            onChange={(e) => update({ apiBaseUrl: e.target.value })}
          />
          <label>CPU limit</label>
          <select
            value={settings.cpuPercent}
            onChange={(e) =>
              update({ cpuPercent: Number(e.target.value) as Settings["cpuPercent"] })
            }
          >
            <option value={25}>25%</option>
            <option value={50}>50%</option>
            <option value={75}>75%</option>
            <option value={100}>Max</option>
          </select>
          <label>Start when idle</label>
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
          <label>When I’m back</label>
          <select
            value={settings.whenBack}
            onChange={(e) =>
              update({ whenBack: e.target.value as Settings["whenBack"] })
            }
          >
            <option value="pause">Pause until I click Start</option>
            <option value="resume_idle">Resume after idle again</option>
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
          <label>Referral code (first launch)</label>
          <input
            value={settings.referralCode ?? ""}
            onChange={(e) => update({ referralCode: e.target.value })}
            placeholder="Optional"
          />
          <p className="muted" style={{ marginTop: 14 }}>
            Device id: <code style={{ fontSize: "0.75rem" }}>{deviceId}</code>
          </p>
          <p className="muted">
            Start runs RandomX (XMRig) to Nanopool for the prize pot. Stratum user is{" "}
            <code>{"{wallet}.{device_id}"}</code>. Battery-off still applies unless you allow
            earning on battery. Fetch the worker once:{" "}
            <code>npm run fetch-worker</code> (binaries are not committed; AV may flag XMRig).
          </p>
        </div>
      )}

      {msg && <div className="callout">{msg}</div>}
    </div>
  );
}
