import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PublicStats, type Announcement, type WinnerRow } from "../lib/api";
import { Countdown } from "../components/Countdown";

export function Home() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.stats(), api.announcements(2), api.winners(8)])
      .then(([s, a, w]) => {
        setStats(s);
        setAnns(a.announcements);
        setWinners(w.winners);
      })
      .catch(() => setErr("Could not reach API — is it running?"));
  }, []);

  return (
    <div className="container">
      <section className="hero">
        <h1>Idle your computer. Win prizes.</h1>
        <p className="lead">
          Sparks turns spare CPU time into lottery entries. Prizes in USDT or Bitcoin.
          No accounts. No seed phrases. One download.
        </p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link className="btn" to="/download">
            Download Sparks
          </Link>
          <Link className="btn btn-secondary" to="/fairness">
            How fairness works
          </Link>
        </div>
      </section>

      {err && <div className="callout">{err}</div>}

      <div className="stats">
        <div className="stat">
          <div className="n">${stats?.total_prizes_paid_usd?.toLocaleString() ?? "—"}</div>
          <div className="l">Paid out</div>
        </div>
        <div className="stat">
          <div className="n">{stats?.period_entries?.toLocaleString() ?? "—"}</div>
          <div className="l">Entries this race</div>
        </div>
        <div className="stat">
          <div className="n">{stats?.active_devices ?? "—"}</div>
          <div className="l">Active now</div>
        </div>
        <div className="stat">
          <div className="n">{stats?.total_devices ?? "—"}</div>
          <div className="l">Devices</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            {stats?.next_award?.headline ?? "Next award"}
          </h2>
          <Countdown target={stats?.next_award?.next_award_at ?? null} />
          <p style={{ marginBottom: 0 }}>
            {stats?.next_award?.prize_summary ? (
              <>
                <strong>{stats.next_award.prize_summary}</strong>
                {stats.next_award.total_usd != null && (
                  <span className="muted"> · ${stats.next_award.total_usd} total</span>
                )}
              </>
            ) : (
              <span className="muted">Prize list appears when an event is scheduled.</span>
            )}
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Announcements</h2>
          {anns.length === 0 ? (
            <p className="muted">No announcements yet.</p>
          ) : (
            <ul className="list">
              {anns.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.title}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {a.body.slice(0, 120)}
                      {a.body.length > 120 ? "…" : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/announcements">See all →</Link>
        </div>
      </div>

      <div className="callout" style={{ marginTop: 20 }}>
        <strong>Entries reset after every award</strong>
        {stats?.wipe_notice ??
          "After winners are published, everyone’s entries clear. Daily and weekly events are separate races — each starts from zero."}
      </div>

      <div className="card" style={{ marginTop: 16, marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ marginTop: 0 }}>Winner stream</h2>
          <Link to="/winners">See all winners</Link>
        </div>
        {winners.length === 0 ? (
          <p className="muted">No published winners yet — first award coming soon.</p>
        ) : (
          <ul className="list">
            {winners.map((w) => (
              <li key={w.id}>
                <div>
                  <strong>${Number(w.prize_amount_usd)}</strong>{" "}
                  <span className="muted">{w.preferred_asset ?? ""}</span>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {w.payout_address_masked ?? "address TBD"} · {w.headline ?? "Award"}
                  </div>
                </div>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  {w.published_at
                    ? new Date(w.published_at).toLocaleString()
                    : new Date(w.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
