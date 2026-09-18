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

### Nanopool poll stub

```bash
npm run poll:nanopool
# Safe no-op until XMR_TREASURY_ADDRESS is a real address
```

## Desktop (Tauri 2) — Mac & Windows

```bash
cd apps/desktop
npm install   # if not using workspaces root install
```

### macOS (Apple Silicon or Intel)

1. Install Xcode CLT, Rust (`rustup`), and Tauri deps.
2. From repo root (or `apps/desktop`):

```bash
cd apps/desktop
npm run tauri:dev      # hot reload against local API
npm run tauri:build    # produces .app / .dmg under src-tauri/target/release/bundle
```

Apple Silicon vs Intel: build on each arch (or cross-compile) for separate artifacts.

### Windows

1. Install MSVC Build Tools, WebView2, Rust.
2.

```bash
cd apps/desktop
npm run tauri:dev
npm run tauri:build
```

### What the desktop app does today

| Feature | Status |
|--------|--------|
| Generate/store `device_id` | Works (localStorage) |
| Home: status / entries / next award / Start–Pause | Works |
| Settings: CPU%, idle delay, when-back, **battery earn OFF by default**, referral, API URL | Works |
| Payout addresses → API | Works |
| Worker supervisor | **Placeholder** bash/cmd that sleeps/logs |
| RandomX / Nanopool | **Not shipped** — plug into `scripts/placeholder-worker.*` + Rust `start_worker_process` / `stop_worker` |
| Idle OS APIs | Stubbed (settings present; real idle hooks are M2 follow-up) |

**Do not** commit or bundle stock XMRig binaries.

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

- Nanopool poll (no-op without treasury address)
- Winner veto re-roll (veto marks row; seat re-roll is stub note)
- Desktop placeholder worker (not RandomX)
- OS idle / battery detection incomplete outside browser Battery API
- No signed work-config yet
- No Firebase / Cloud Run deploy configs in this milestone

## License / tone

Open source client + site. Market as a voluntary idle-compute **prize game**, not income.


## Public treasury (Nanopool)

v1 Monero receive address (public by design — never share the seed/keys):

`45SKqCpVYCDLHdaHk9gDwL6BNxTyd6x1xPs5jciterQTZJaFpYKtMcoKmGWkERgbX79BpWNmXVA3BQv9t21DbUgXVW3kV4J`

- Dashboard: https://xmr.nanopool.org/ (paste address after first share)
- API: `https://api.nanopool.org/v1/xmr/user/<address>` — “Account not found” until the first share
- Stratum SSL: `xmr-us-east1.nanopool.org:10343` (also eu1/eu2/us-west1/asia1/jp1/au1)
- Lower min payout in Nanopool account settings once the account exists (~0.11 XMR floor)
