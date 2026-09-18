-- Sparks M1 schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY,
  ref_code VARCHAR(16) UNIQUE NOT NULL,
  referred_by UUID REFERENCES devices(id),
  worker_secret TEXT NOT NULL,
  app_version TEXT,
  os TEXT,
  usdt_address TEXT,
  usdt_network TEXT DEFAULT 'TRC20',
  btc_address TEXT,
  xmr_address TEXT,
  preferred_asset TEXT DEFAULT 'USDT',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_ref_code ON devices(ref_code);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);

CREATE TABLE IF NOT EXISTS spark_credits (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES devices(id),
  provider TEXT NOT NULL DEFAULT 'nanopool',
  rates_version INT NOT NULL DEFAULT 1,
  native_units NUMERIC NOT NULL,
  multiplier NUMERIC NOT NULL,
  credits NUMERIC NOT NULL,
  ingest_key TEXT NOT NULL,
  attested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, ingest_key)
);

CREATE INDEX IF NOT EXISTS idx_spark_credits_device ON spark_credits(device_id);

CREATE TABLE IF NOT EXISTS period_entries (
  device_id UUID PRIMARY KEY REFERENCES devices(id),
  credits NUMERIC NOT NULL DEFAULT 0,
  entries INT NOT NULL DEFAULT 0,
  lifetime_credits NUMERIC NOT NULL DEFAULT 0,
  lifetime_entries INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES devices(id),
  referred_id UUID NOT NULL REFERENCES devices(id) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS award_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  headline TEXT,
  blurb TEXT,
  next_award_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  use_spinner BOOLEAN NOT NULL DEFAULT true,
  seed TEXT,
  ticket_root TEXT,
  total_entries_snapshot INT,
  published_at TIMESTAMPTZ,
  wiped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prize_lines (
  id BIGSERIAL PRIMARY KEY,
  award_event_id UUID NOT NULL REFERENCES award_events(id) ON DELETE CASCADE,
  amount_usd NUMERIC NOT NULL,
  quantity INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS winners (
  id BIGSERIAL PRIMARY KEY,
  award_event_id UUID NOT NULL REFERENCES award_events(id) ON DELETE CASCADE,
  seat INT NOT NULL,
  device_id UUID NOT NULL REFERENCES devices(id),
  prize_amount_usd NUMERIC NOT NULL,
  entries_at_win INT NOT NULL,
  preferred_asset TEXT,
  payout_address TEXT,
  referred_by UUID REFERENCES devices(id),
  referral_bonus_usd NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed',
  veto_reason TEXT,
  tx_id TEXT,
  referral_tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (award_event_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_winners_event ON winners(award_event_id);
CREATE INDEX IF NOT EXISTS idx_winners_status ON winners(status);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
