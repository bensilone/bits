# Bits

**Public brand:** [bitsprize.com](https://bitsprize.com)

Spare compute → verified work → prize entries → win **BTC** or **USDT (TRC20)**.

This repository is the **Bits desktop app** (Tauri 2 for Mac and Windows). The backend is private; the app talks to the live Bits API by default.

## One-command install (Mac)

```bash
curl -fsSL https://raw.githubusercontent.com/bensilone/bits/main/install.sh | bash
```

That clones into `~/bits` (or updates it), installs Node/Rust if needed, downloads the pinned XMRig worker, and launches the app.

Already cloned?

```bash
cd bits
./install.sh
```

### What you need

- **Node 20+**
- **Rust** (installer can install via rustup)
- **macOS:** Xcode Command Line Tools
- **Windows:** [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2, VS Build Tools), then `./install.sh` from Git Bash or run the npm steps manually

## If `tauri dev` says “Cannot find native binding”

The Tauri CLI needs a Mac-native binary. From the repo root:

```bash
rm -rf node_modules apps/desktop/node_modules package-lock.json
npm install --include=optional
npm run fetch-worker
npm run dev
```

Or re-run `./install.sh` (it does a clean platform install).

## Manual commands

```bash
git clone https://github.com/bensilone/bits.git
cd bits
npm install
npm run fetch-worker   # pinned XMRig into apps/desktop/binaries/ (gitignored)
npm run dev            # Tauri window
```

Production build:

```bash
npm run build
```

## How entries work

Your machine mines Monero to the Bits treasury pool under a worker name tied to your device. **Entries are credited from pool stats on the server**, not from anything the app claims. Changing the app cannot invent entries without real pool hashrate for your device.

Default API: `https://sparks-api-x5tpjitcia-uc.a.run.app`  
Override anytime under **Settings → Advanced**.

## Notes

- Antivirus often flags XMRig — allowlist the binary if needed.
- Unsigned Mac builds may need right-click → Open the first time.
- Battery earning is off by default.

## License / ops

Application source for end users. Server and deploy tooling live in a private repo.
