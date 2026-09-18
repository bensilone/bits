import { useSearchParams } from "react-router-dom";

export function Download() {
  const [params] = useSearchParams();
  const ref = params.get("ref");

  return (
    <div className="container page">
      <h1>Download Sparks</h1>
      <p className="muted">
        Desktop only — Windows, macOS (Apple Silicon & Intel), Linux. Build from source or grab a
        release when published.
      </p>
      {ref && (
        <div className="callout">
          <strong>Referral attached</strong>
          Code <code>{ref}</code> will be offered on first launch.
        </div>
      )}
      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>macOS</h2>
          <p>Apple Silicon and Intel builds (separate artifacts).</p>
          <p className="muted">See repo README → apps/desktop for Tauri run/build steps.</p>
          <a className="btn" href="https://github.com/bensilone/sparks">
            Build from source
          </a>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Windows</h2>
          <p>x64 installer / portable when releases are cut.</p>
          <p className="muted">Code signing + notarization required for shipping.</p>
          <a className="btn btn-secondary" href="https://github.com/bensilone/sparks">
            View source
          </a>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Checksums</h2>
        <p className="muted">
          SHA256SUMS will appear on GitHub Releases. Prefer building from this public repo until
          signed binaries ship.
        </p>
      </div>
    </div>
  );
}
