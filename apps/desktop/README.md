# Sparks Desktop (Tauri 2)

## Dev

```bash
# API should be running at http://127.0.0.1:8787 (Settings → Advanced / Developer to override)
cd apps/desktop
npm run fetch-worker   # download pinned XMRig v6.26.0 into binaries/xmrig/ (gitignored)
npm run tauri:dev
```

## Build

```bash
npm run fetch-worker
npm run tauri:build
```

Artifacts: `src-tauri/target/release/bundle/`

## Icons

Placeholder RGBA icons ship in `src-tauri/icons/`. For production:

```bash
npx tauri icon path/to/1024.png
```

## Worker (real XMRig → Nanopool)

1. **Fetch (not committed):** `npm run fetch-worker` downloads XMRig **v6.26.0** for your OS/arch into `binaries/xmrig/` (`xmrig` or `xmrig.exe`).
2. **Start** in the UI fetches `GET /v1/work-config` (also `/v1/public/work-config`), writes a local config, and spawns XMRig via Rust `start_xmrig`.
3. **Stratum user:** `{wallet}.{device_id}` — treasury wallet from work-config + `.` + this device UUID
4. **Pool (SSL):** `xmr-us-east1.nanopool.org:10343` (+ `pool_urls` failover), `tls: true`, password `x`, algo `rx/0`
5. **Pause** invokes `stop_worker` (kills the child process tree when possible)
6. **AV:** antivirus often flags XMRig — expected for this quick path; allowlist the binary if needed
7. **Huge pages / signing:** optional OS tweaks improve hashrate; macOS Gatekeeper may require right-click Open on unsigned builds

See root README “Public treasury (Nanopool)” for verified API/dashboard notes.
