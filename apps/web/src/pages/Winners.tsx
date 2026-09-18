import { useEffect, useState } from "react";
import { api, type WinnerRow } from "../lib/api";

export function Winners() {
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  useEffect(() => {
    api.winners(100).then((w) => setWinners(w.winners)).catch(() => {});
  }, []);

  return (
    <div className="container page">
      <h1>Winners</h1>
      <p className="muted">Published award history. Re-rolls show as voided proposals + new winners.</p>
      <div className="card">
        {winners.length === 0 ? (
          <p className="muted">No winners published yet.</p>
        ) : (
          <ul className="list">
            {winners.map((w) => (
              <li key={w.id}>
                <div>
                  <strong>${Number(w.prize_amount_usd)}</strong> {w.preferred_asset} · seat {w.seat}
                  <div className="muted">{w.payout_address_masked} · {w.status}</div>
                  {w.tx_id && <div className="muted">tx: {w.tx_id}</div>}
                </div>
                <span className="muted">
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
