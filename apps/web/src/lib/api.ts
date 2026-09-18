const API = import.meta.env.VITE_API_URL || "http://localhost:8787";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

export interface PublicStats {
  total_prizes_paid_usd: number;
  period_entries: number;
  active_devices: number;
  total_devices: number;
  wipe_notice: string;
  next_award: {
    headline: string | null;
    next_award_at: string | null;
    prize_summary: string | null;
    total_usd: number | null;
  } | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  published_at: string;
}

export interface WinnerRow {
  id: number;
  seat: number;
  prize_amount_usd: string;
  preferred_asset: string | null;
  payout_address_masked: string | null;
  status: string;
  tx_id: string | null;
  headline: string | null;
  published_at: string | null;
  created_at: string;
}

export const api = {
  stats: () => get<PublicStats>("/v1/public/stats"),
  announcements: (limit = 20) =>
    get<{ announcements: Announcement[] }>(`/v1/public/announcements?limit=${limit}`),
  winners: (limit = 50) =>
    get<{ winners: WinnerRow[] }>(`/v1/public/winners?limit=${limit}`),
  workConfig: () => get<Record<string, unknown>>("/v1/work-config"),
};

export { API };
