import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOrCreateDeviceId,
  getWorkerSecret,
  loadSettings,
  saveSettings,
  saveWorkerSecret,
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
const SITE = "https://bitsprize.com";

function inviteUrl(code: string) {
  return `${SITE}/r/${code}`;
}

function inviteBlurb(code: string) {
  return `I'm earning prize entries with Bits (bitsprize.com). Join with my invite and we both benefit if you win: ${inviteUrl(code)}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Not scheduled yet";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}


function EntryProgress(props: {
  entries: number;
  credits: number;
  creditsPerEntry: number;
  earning: boolean;
}) {
  const cpe = props.creditsPerEntry > 0 ? props.creditsPerEntry : 1000;
  const toward = ((props.credits % cpe) + cpe) % cpe;
  const pct = Math.min(100, Math.round((toward / cpe) * 100));
  return (
    <div className="entry-progress">
      <div className="entry-progress-top">
        <span className="muted">
          {props.entries === 0
            ? props.earning
              ? "Working toward your first entry"
              : "Progress to first entry"
            : "Progress to next entry"}
        </span>
        <span className="muted">{pct}%</span>
      </div>
      <div className="entry-progress-track" aria-hidden>
        <div className="entry-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {props.earning
          ? "Verified work counts as it comes in — usually a few minutes for the bar to move, then your first entry."
          : "Press Start to begin earning. Entries are based only on verified work."}
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [status, setStatus] = useState<WorkerStatus>("off");
  const [activity, setActivity] = useState<ActivityMode>("idle");
  const [entries, setEntries] = useState(0);
  const [credits, setCredits] = useState(0);
  const [creditsPerEntry, setCreditsPerEntry] = useState(1000);
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

  // Belt-and-suspenders: stop worker if the window/webview is torn down
  useEffect(() => {
    const halt = () => {
      void stopWorker();
    };
    window.addEventListener("beforeunload", halt);
    window.addEventListener("pagehide", halt);
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          await stopWorker();
          // allow close to proceed
          void event;
        });
      } catch {
        /* browser / non-tauri */
      }
    })();
    return () => {
      window.removeEventListener("beforeunload", halt);
      window.removeEventListener("pagehide", halt);
      unlisten?.();
      void stopWorker();
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const reg = await registerDevice(
        settings.apiBaseUrl,
        deviceId,
        settings.referralCode
      );
      if (typeof reg.worker_secret === "string" && reg.worker_secret) {
        saveWorkerSecret(reg.worker_secret);
      }
      setRefCode(reg.ref_code);
      const sum = await fetchSummary(settings.apiBaseUrl, deviceId);
      setEntries(sum.entries ?? 0);
      setCredits(Number(sum.credits ?? 0));
      setCreditsPerEntry(Number(sum.credits_per_entry ?? 1000) || 1000);
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
    const earning = status === "earning" || status === "waiting_idle";
    const t = setInterval(refresh, earning ? 15_000 : 30_000);
    return () => clearInterval(t);
  }, [refresh, status]);

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
      let secret = getWorkerSecret();
      if (!secret) {
        const reg = await registerDevice(
          settings.apiBaseUrl,
          deviceId,
          settings.referralCode
        );
        if (typeof reg.worker_secret === "string" && reg.worker_secret) {
          saveWorkerSecret(reg.worker_secret);
          secret = reg.worker_secret;
        }
      }
      if (!secret) {
        setMsg("Could not save payout — missing device secret. Restart the app once.");
        return;
      }
      await savePayout(settings.apiBaseUrl, deviceId, settings, secret);
      setMsg("Payout addresses saved.");
    } catch {
      setMsg("Could not save payout — check the server, or restart the app once to refresh the device secret.");
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

  function homeStatusLabel(): {
    title: string;
    detail: string | null;
    detailKind: "inuse" | "idle" | null;
    pill: string;
  } {
    if (status === "earning") {
      if (activity === "active" && settings.cpuPercentInUse > 0) {
        return {
          title: "Earning entries…",
          detail: `In use ${settings.cpuPercentInUse}%`,
          detailKind: "inuse",
          pill: "earning",
        };
      }
      return {
        title: "Earning entries…",
        detail: `Idle ${settings.cpuPercentIdle}%`,
        detailKind: "idle",
        pill: "earning",
      };
    }
    if (status === "waiting_idle") {
      return {
        title: "Waiting until idle",
        detail: "Away soon",
        detailKind: "idle",
        pill: "waiting",
      };
    }
    if (status === "paused") {
      return {
        title: "Paused",
        detail: null,
        detailKind: null,
        pill: "paused",
      };
    }
    return {
      title: "Off",
      detail: null,
      detailKind: null,
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
          <div className="card card-home-controls">
            <div className="status-row">
              <div className={`status-pill ${home.pill}`}>
                <span className="status-dot" aria-hidden />
                {home.title}
              </div>
              {home.detail && (
                <div className={`status-pill detail ${home.detailKind ?? ""}`}>
                  {home.detail}
                </div>
              )}
            </div>
            <button
              className={`btn btn-start ${status === "earning" || status === "waiting_idle" ? "pause" : ""}`}
              onClick={toggleEarn}
            >
              {status === "earning" || status === "waiting_idle" ? "Pause" : "Start"}
            </button>
            <p className="hint" style={{ marginTop: 8, textAlign: "center" }}>
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
            <EntryProgress
              entries={entries}
              credits={credits}
              creditsPerEntry={creditsPerEntry}
              earning={status === "earning" || status === "waiting_idle"}
            />
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
                <div className="share-icons" role="group" aria-label="Share invite">
                  <button
                    type="button"
                    className="share-icon"
                    title={copied === "link" ? "Copied link" : "Copy link"}
                    aria-label="Copy invite link"
                    onClick={() => copyText("link", shareUrl)}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                      <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                    <span className="share-icon-label">{copied === "link" ? "Copied" : "Link"}</span>
                  </button>
                  <button
                    type="button"
                    className="share-icon"
                    title={copied === "msg" ? "Copied" : "Copy message"}
                    aria-label="Copy invite message"
                    onClick={() => copyText("msg", shareText)}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                      <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                    </svg>
                    <span className="share-icon-label">{copied === "msg" ? "Copied" : "Msg"}</span>
                  </button>
                  <a
                    className="share-icon"
                    href={xShare}
                    target="_blank"
                    rel="noreferrer"
                    title="Share on X"
                    aria-label="Share on X"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.924L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
                    </svg>
                    <span className="share-icon-label">X</span>
                  </a>
                  <a
                    className="share-icon"
                    href={fbShare}
                    target="_blank"
                    rel="noreferrer"
                    title="Share on Facebook"
                    aria-label="Share on Facebook"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                      <path fill="currentColor" d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.4V9.84c0-2.37 1.41-3.68 3.56-3.68 1.03 0 2.11.18 2.11.18v2.32h-1.19c-1.17 0-1.54.73-1.54 1.48v1.78h2.62l-.42 2.91h-2.2V22c4.78-.75 8.44-4.91 8.44-9.93z"/>
                    </svg>
                    <span className="share-icon-label">FB</span>
                  </a>
                  <button
                    type="button"
                    className="share-icon"
                    title={copied === "ig" ? "Copied — paste in Instagram" : "Copy for Instagram"}
                    aria-label="Copy invite for Instagram"
                    onClick={() => {
                      void copyText("ig", shareText);
                      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                      <path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm11 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                    </svg>
                    <span className="share-icon-label">{copied === "ig" ? "Copied" : "IG"}</span>
                  </button>
                </div>
                {copied === "ig" && (
                  <p className="hint" style={{ marginTop: 8, textAlign: "center" }}>
                    Message copied — paste it in Instagram.
                  </p>
                )}
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
