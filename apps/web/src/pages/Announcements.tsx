import { useEffect, useState } from "react";
import { api, type Announcement } from "../lib/api";

export function Announcements() {
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    api.announcements(50).then((a) => setItems(a.announcements)).catch(() => {});
  }, []);

  return (
    <div className="container page">
      <h1>Announcements</h1>
      <p className="muted">Schedule notes, prize bumps, maintenance, work-type changes.</p>
      {items.length === 0 ? (
        <div className="card"><p className="muted">Nothing posted yet.</p></div>
      ) : (
        items.map((a) => (
          <div className="card" key={a.id}>
            <h2 style={{ marginTop: 0 }}>
              {a.pinned ? "📌 " : ""}
              {a.title}
            </h2>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {new Date(a.published_at).toLocaleString()}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
          </div>
        ))
      )}
    </div>
  );
}
