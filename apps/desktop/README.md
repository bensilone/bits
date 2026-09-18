# Sparks Desktop (Tauri 2)

## Dev

```bash
# API should be running at http://localhost:8787 (or change Settings → API base URL)
cd apps/desktop
npm run tauri:dev
```

## Build

```bash
npm run tauri:build
```

Artifacts: `src-tauri/target/release/bundle/`

## Icons

Placeholder RGBA icons ship in `src-tauri/icons/`. For production:

```bash
npx tauri icon path/to/1024.png
```

## Worker plug-in

- `scripts/placeholder-worker.sh` / `.cmd` — sleep/log stub
- Rust commands: `start_worker_process`, `stop_worker`
- Replace with pinned RandomX worker + Nanopool stratum from `/v1/work-config` (or `/v1/public/work-config`)
- **Stratum user:** `{wallet}.{device_id}` — e.g. treasury from work-config + `.` + this device UUID
- **Pool (SSL):** `xmr-us-east1.nanopool.org:10343`, `tls: true`, password `x`, algo `rx/0`
- See root README “Public treasury (Nanopool)” for verified API/dashboard notes
- **Do not** ship stock XMRig binaries
