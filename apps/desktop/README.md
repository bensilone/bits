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
- Replace with pinned RandomX worker + Nanopool stratum from `/v1/work-config`
- **Do not** ship stock XMRig binaries
