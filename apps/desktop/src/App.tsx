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

type NextAward = {
  headline: string | null;
  next_award_at: string | null;
  prize_summary: string | null;
  total_usd: number | null;
};

const IDLE_POLL_MS = 5_000;
const SITE = "https://winbitcoin.app";

function inviteUrl(code: string) {
  return `${SITE}/r/${code}`;
}

function inviteBlurb(code: string) {
  return `I'm earning prize entries with Sparks (winbitcoin.app). Join with my invite and we both benefit if you win: ${inviteUrl(code)}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Not scheduled yet";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [status, setStatus] = useState<WorkerStatus>("off");
  const [activity, setActivity] = useState<ActivityMode>("idle");
  const [entries, setEntries] = useState(0);
  const [refCode, setRefCode] = useState<string>("");
  const [nextAward, setNextAward] = useState<NextAward | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      setNextAward(sum.next_award ?? null);
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
            "On battery — earning is off by default. Turn on “Allow earning on battery” in Settings to override."
          );
          return;
        }
      } catch {
        /* Battery API unavailable — continue */
      }
    }

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

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setMsg("Could not copy — try selecting the link manually.");
    }
  }

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
          sub: `In use · ${settings.cpuPercentInUse}%`,
          pill: "earning",
        };
      }
      return {
        title: "Earning entries…",
        sub: `Idle · ${settings.cpuPercentIdle}%`,
        pill: "earning",
      };
    }
    if (status === "waiting_idle") {
      return {
        title: "Waiting until idle",
        sub: "Resumes when you step away",
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
      sub: "Press Start to earn while idle",
      pill: "off",
    };
  }

  const home = homeStatusLabel();
  const shareUrl = refCode ? inviteUrl(refCode) : "";
  const shareText = refCode ? inviteBlurb(refCode) : "";
  const xShare = shareUrl
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`
    : "";
  const fbShare = shareUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
    : "";

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
        <div className="stack">
          <div className="card">
            <div className={`status-pill ${home.pill}`}>
              <span className="status-dot" aria-hidden />
              {home.title}
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              {home.sub}
            </p>
            <button
              className={`btn ${status === "earning" || status === "waiting_idle" ? "pause" : ""}`}
              onClick={toggleEarn}
            >
              {status === "earning" || status === "waiting_idle" ? "Pause" : "Start"}
            </button>
            <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>
              Start uses spare compute. Off on battery unless you allow it in Settings.
            </p>
          </div>

          <div className="card award-card">
            <p className="eyebrow">Next award</p>
            <h2 className="award-title">
              {nextAward?.headline ?? "Coming soon"}
            </h2>
            {(nextAward?.total_usd != null || nextAward?.prize_summary) && (
              <p className="award-amount">
                {nextAward.total_usd != null
                  ? `$${nextAward.total_usd.toLocaleString()}`
                  : nextAward.prize_summary}
              </p>
            )}
            <p className="award-when">{formatWhen(nextAward?.next_award_at ?? null)}</p>
            <div className="entries-row">
              <span className="muted">Your entries this race</span>
              <span className="entries-num">{entries.toLocaleString()}</span>
            </div>
          </div>

          <div className="card invite-card">
            <h2 className="section-h">Invite friends</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Share your link. If someone joins with it and wins, you get a{" "}
              <strong>10% bonus</strong> on their prize.
            </p>
            {refCode ? (
              <>
                <div className="invite-code-box">
                  <span className="muted tiny">Your invite code</span>
                  <code className="invite-code">{refCode}</code>
                </div>
                <div className="share-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => copyText("link", shareUrl)}
                  >
                    {copied === "link" ? "Copied link" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => copyText("msg", shareText)}
                  >
                    {copied === "msg" ? "Copied" : "Copy message"}
                  </button>
                </div>
                <div className="share-row">
                  <a
                    className="btn btn-ghost"
                    href={xShare}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Share on X
                  </a>
                  <a
                    className="btn btn-ghost"
                    href={fbShare}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Share on Facebook
                  </a>
                </div>
              </>
            ) : (
              <p className="muted">Invite link appears once the app connects.</p>
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
                checked={settings.preferredAsset === "BTC"}
                onChange={() => update({ preferredAsset: "BTC" })}
              />
              BTC
            </label>
            <label className="radio">
              <input
                type="radio"
                name="pref"
                checked={settings.preferredAsset === "USDT"}
                onChange={() => update({ preferredAsset: "USDT" })}
              />
              USDT (TRC20)
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
        <div className="stack">
          <div className="card">
            <h2 className="section-h" style={{ marginTop: 0 }}>
              Earning
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              How hard the app works when you’re away vs when you’re using the computer.
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
              <option value={25}>Light (25%)</option>
              <option value={50}>Medium (50%)</option>
              <option value={75}>High (75%)</option>
              <option value={100}>Max (100%)</option>
            </select>

            <label>While using the computer</label>
            <select
              value={settings.cpuPercentInUse}
              onChange={(e) =>
                update({
                  cpuPercentInUse: Number(e.target.value) as Settings["cpuPercentInUse"],
                })
              }
            >
              <option value={0}>Pause earning</option>
              <option value={25}>Light (25%)</option>
              <option value={50}>Medium (50%)</option>
              <option value={75}>High (75%)</option>
              <option value={100}>Max (100%)</option>
            </select>

            <label>Treat as idle after</label>
            <select
              value={settings.idleDelayMin}
              onChange={(e) =>
                update({
                  idleDelayMin: Number(e.target.value) as Settings["idleDelayMin"],
                })
              }
            >
              <option value={1}>1 minute</option>
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={30}>30 minutes</option>
            </select>

            <label>If earning stops while you’re busy</label>
            <select
              value={settings.whenBack}
              onChange={(e) =>
                update({ whenBack: e.target.value as Settings["whenBack"] })
              }
            >
              <option value="pause">Stay paused until I press Start</option>
              <option value="resume_idle">Resume automatically when idle again</option>
            </select>

            <div className="row">
              <input
                id="batt"
                type="checkbox"
                checked={settings.allowBattery}
                onChange={(e) => update({ allowBattery: e.target.checked })}
              />
              <label htmlFor="batt" style={{ margin: 0 }}>
                Allow earning on battery
              </label>
            </div>
          </div>

          <div className="card">
            <h2 className="section-h" style={{ marginTop: 0 }}>
              Someone invited you?
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Enter their code so they get the 10% bonus if you win. Separate from{" "}
              <em>your</em> invite on Home, which you share with friends.
            </p>
            <label>Their invite code</label>
            <input
              value={settings.referralCode ?? ""}
              onChange={(e) => update({ referralCode: e.target.value.trim() })}
              placeholder="Paste a friend’s code"
            />
          </div>

          <div className="card">
            <details
              className="disclosure flat"
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>Advanced</summary>
              <label>Server URL</label>
              <input
                value={settings.apiBaseUrl}
                onChange={(e) => update({ apiBaseUrl: e.target.value })}
              />
              <p className="hint">Leave the default unless you’re testing.</p>
              <p className="muted" style={{ marginTop: 12 }}>
                Device id: <code className="tiny-code">{deviceId}</code>
              </p>
            </details>
          </div>
        </div>
      )}

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
