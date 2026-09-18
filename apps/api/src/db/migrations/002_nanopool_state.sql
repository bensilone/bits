-- Nanopool worker poll state for idempotent credit minting
CREATE TABLE IF NOT EXISTS nanopool_worker_state (
  worker_id TEXT PRIMARY KEY,
  last_rating NUMERIC,
  last_hashrate NUMERIC,
  last_polled_at TIMESTAMPTZ
);
