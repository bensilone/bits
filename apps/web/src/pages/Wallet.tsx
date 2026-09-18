import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Wallet() {
  const [wallet, setWallet] = useState<string | null>(null);

  useEffect(() => {
    api
      .workConfig()
      .then((c) => setWallet((c.wallet as string) || null))
      .catch(() => {});
  }, []);

  return (
    <div className="container page prose">
      <h1>Wallet / funding</h1>
      <p>
        Prizes are funded from compute proceeds and operator funding over time — not a classic
        ticket-sale pot. There is no public “solvency meter”; funding may span assets as work
        types change.
      </p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Current work receiving address (example)</h2>
        <p className="muted">
          v1 may show the XMR treasury as an example of where compute value lands.
        </p>
        {wallet ? (
          <p>
            <code style={{ wordBreak: "break-all" }}>{wallet}</code>
          </p>
        ) : (
          <p className="muted">
            Not configured yet (set <code>XMR_TREASURY_ADDRESS</code> on the API).
          </p>
        )}
      </div>
    </div>
  );
}
