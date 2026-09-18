# Sparks

**Internal name:** Sparks · **Public brand lean:** [winbitcoin.app](https://winbitcoin.app)

Idle compute → lottery entries → win USDT / BTC. Venmo-simple. Prize-first UI.

This monorepo is **M1 skeleton + start of M2 desktop shell** per [`SPEC.md`](./SPEC.md) (v0.9).

```
apps/api       TypeScript Express + Postgres
apps/web       Vite/React marketing site
apps/desktop   Tauri 2 app (Mac Silicon/Intel + Windows)
packages/shared  Weighted draw helper + shared types
```

## Prerequisites

- Node 20+
- Docker (for Postgres) **or** any Postgres 16+
- For desktop builds: Rust stable + platform WebView deps ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

## Quick start (API + web)

```bash
# 1. Env
cp .env.example .env
# edit ADMIN_*, JWT_SECRET — XMR_TREASURY_ADDRESS is set in .env.example (public treasury)

# 2. Database
docker compose up -d
# waits until healthy, then:

npm install
npm run db:migrate   # or just start API — it migrates on boot
npm run dev:api      # http://localhost:8787
npm run dev:web      # http://localhost:5173  (VITE_API_URL from .env)
```

Health check: `curl http://localhost:8787/health`

### Useful API calls

```bash
# Register a device
curl -s -X POST http://localhost:8787/v1/devices/register \
  -H 'content-type: application/json' \
  -d '{"device_id":"11111111-1111-1111-1111-111111111111","os":"macOS"}'

# Mock attested work (dev only) — 5000 native → credits → entries
curl -s -X POST http://localhost:8787/v1/dev/mock-ingest \
  -H 'content-type: application/json' \
  -d '{"device_id":"11111111-1111-1111-1111-111111111111","native_units":5000}'

# Public stats
curl -s http://localhost:8787/v1/public/stats

# Admin login
curl -s -X POST http://localhost:8787/v1/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"changeme"}'
```

Admin JWT: send `Authorization: Bearer <token>` or cookie `sparks_admin`.

### Nanopool poll

Verified against live Nanopool (SSL stratum + workers/balance APIs).

```bash
npm run poll:nanopool
# Requires XMR_TREASURY_ADDRESS (set in .env.example). Fetches workers once,
# matches worker.id → devices.id, mints credits via rating delta or hashrate×time.
```

- **Stratum user:** `{wallet}.{worker}` where `worker` is the device UUID from `/v1/devices/register`
  - Example: `45SKqCpV….V4J.11111111-1111-1111-1111-111111111111`
- **Stratum SSL:** `xmr-us-east1.nanopool.org:10343` (also eu1, eu2, us-west1, asia1, jp1, au1 — all `:10343`)
- **Password:** `x` · **Algo:** `rx/0` (RandomX)
- **API:** `GET https://api.nanopool.org/v1/xmr/workers/{wallet}` (use this; fetch **once** per poll)
- **Balance:** `GET .../balance/{wallet}` works for telemetry
- **`/user/{wallet}` is flaky** — do not rely on it (often “Account not found” even after shares)
- Rate limit ~30 req/min
- Dashboard: https://xmr.nanopool.org/account/{wallet}

## Desktop (Tauri 2) — Mac & Windows

```bash
cd apps/desktop
npm install   # if not using workspaces root install
npm run fetch-worker   # pinned XMRig v6.26.0 → binaries/xmrig/ (gitignored; AV may flag)
```

### macOS (Apple Silicon or Intel)

1. Install Xcode CLT, Rust (`rustup`), and Tauri deps.
2. From repo root (or `apps/desktop`):

```bash
cd apps/desktop
npm run fetch-worker
npm run tauri:dev      # hot reload against local API
npm run tauri:build    # produces .app / .dmg under src-tauri/target/release/bundle
```

Apple Silicon vs Intel: build on each arch (or cross-compile) for separate artifacts. Gatekeeper may prompt on unsigned builds.

### Windows

1. Install MSVC Build Tools, WebView2, Rust.
2.

```bash
cd apps/desktop
npm run fetch-worker
npm run tauri:dev
npm run tauri:build
```

Windows Defender often quarantines XMRig — restore/allowlist `binaries/xmrig/xmrig.exe` if Start fails.

### What the desktop app does today

| Feature | Status |
|--------|--------|
| Generate/store `device_id` | Works (localStorage) |
| Home: status / entries / next award / Start–Pause | Works |
| Settings: CPU%, idle delay, when-back, **battery earn OFF by default**, referral, API URL | Works |
| Payout addresses → API | Works |
| Worker supervisor | **Real XMRig** via Rust `start_xmrig` / `stop_worker` |
| RandomX / Nanopool | **Quick path** — `npm run fetch-worker` then Start (stratum user `{wallet}.{device_id}`) |
| Idle OS APIs | Stubbed (settings present; real idle hooks are M2 follow-up) |

**Do not** commit XMRig binaries (too large / AV). Desktop fetches pinned v6.26.0 locally via `fetch-worker`.

**Stratum user:** `{wallet}.{device_id}` from `GET /v1/work-config`. Pool SSL `xmr-us-east1.nanopool.org:10343`, pass `x`, algo `rx/0`. Limitations: AV false positives, optional huge pages for hashrate, no code signing in this milestone.

## Env vars

See [`.env.example`](./.env.example).

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection |
| `PORT` | API port (default 8787) |
| `ADMIN_USER` / `ADMIN_PASS` | Primary operator |
| `ADMIN_USER_2` / `ADMIN_PASS_2` | Backup operator |
| `JWT_SECRET` | Admin session tokens |
| `XMR_TREASURY_ADDRESS` | Work-config wallet + Nanopool poll |
| `CREDITS_PER_ENTRY` | Credits → entries divisor |
| `NANOPOOL_MULTIPLIER` | Versioned provider multiplier |
| `VITE_API_URL` | Web → API base |

## Draw helper

`packages/shared` — `drawWeightedWinners(devices, prizeLines, seed)`  
Weighted multi-prize draw **without device replacement** (one prize per device). Used by `POST /v1/admin/award-events/:id/roll`.

## What works vs stubs

**Works**

- Migrations, device register/payout/summary
- Public stats, announcements, winners, work-config
- Admin login, announcements CRUD, award events (≤10 prize lines), schedule, roll, publish+wipe, mark paid
- Dev mock-ingest
- Web pages: Home (wipe callout), Winners, Fairness, Announcements, About/FAQ, Download, Wallet, `/r/:code`
- Shared draw math
- Desktop UI shell + configurable API URL

**Stubs / intentional gaps**

- Nanopool poll needs a real `XMR_TREASURY_ADDRESS` and migration `002_nanopool_state` (skips if unset)
- Winner veto re-roll (veto marks row; seat re-roll is stub note)
- Desktop XMRig is fetched locally (not in git); AV / Gatekeeper / huge pages are operator concerns
- OS idle / battery detection incomplete outside browser Battery API
- No signed work-config yet
- No Firebase / Cloud Run deploy configs in this milestone

## License / tone

Open source client + site. Market as a voluntary idle-compute **prize game**, not income.


## Public treasury (Nanopool)

v1 Monero receive address (public by design — never share the seed/keys):

`45SKqCpVYCDLHdaHk9gDwL6BNxTyd6x1xPs5jciterQTZJaFpYKtMcoKmGWkERgbX79BpWNmXVA3BQv9t21DbUgXVW3kV4J`

- **Dashboard:** https://xmr.nanopool.org/account/45SKqCpVYCDLHdaHk9gDwL6BNxTyd6x1xPs5jciterQTZJaFpYKtMcoKmGWkERgbX79BpWNmXVA3BQv9t21DbUgXVW3kV4J
- **Workers API (preferred):** `GET https://api.nanopool.org/v1/xmr/workers/{wallet}` → `{status, data:[{id, hashrate, lastShare, rating, uid}]}`
- **Balance API:** `GET .../balance/{wallet}` — works; use for telemetry only (not credit minting)
- **`/user/{wallet}` is flaky** — avoid (intermittent “Account not found” even after shares)
- **Stratum SSL:** `xmr-us-east1.nanopool.org:10343` (eu1, eu2, us-west1, asia1, jp1, au1 — all port `10343`)
- **Worker user format:** `{wallet}.{device_id}` (verified live, e.g. `45SK….sparks-test-1`)
- Work-config: `GET /v1/public/work-config` (also `/v1/work-config`) exposes `pool_url`, `pool_urls`, `tls`, `wallet`, `user_template`, `worker_field`, `pass`, `algo`
- Lower min payout in Nanopool account settings once the account exists (~0.11 XMR floor)
- Poll credits: `npm run poll:nanopool` (idempotent via `nanopool_worker_state` + `ingest_key`)
