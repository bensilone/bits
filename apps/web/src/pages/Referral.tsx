import { Link, useParams } from "react-router-dom";

export function Referral() {
  const { code } = useParams();
  return (
    <div className="container page">
      <h1>You’re invited</h1>
      <p className="lead muted">
        A friend shared Sparks with you. Download the app — your referral code{" "}
        <strong>{code}</strong> will be ready on first launch.
      </p>
      <div className="btn-row">
        <Link className="btn" to={`/download?ref=${encodeURIComponent(code ?? "")}`}>
          Download Sparks
        </Link>
        <Link className="btn btn-secondary" to="/about">
          What’s this?
        </Link>
      </div>
    </div>
  );
}
