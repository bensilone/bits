import { useEffect, useState } from "react";

export function Countdown({ target }: { target: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return <span className="muted">No award scheduled yet</span>;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return <span className="countdown">Reveal soon</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="countdown">
      {d > 0 ? `${d}d ` : ""}
      {pad(h)}:{pad(m)}:{pad(sec)}
    </span>
  );
}
