# Sparks

**Public brand:** [winbitcoin.app](https://winbitcoin.app)

Idle CPU → verified compute → lottery entries → win **USDT (TRC20)** or **BTC**.

This repository is the **desktop app** (Tauri 2 for Mac and Windows). The backend is private; the app talks to the live Sparks API by default.

## One-command install (Mac)

```bash
curl -fsSL https://raw.githubusercontent.com/bensilone/sparks/main/install.sh | bash
```

That clones into `~/sparks` (or updates it), installs Node/Rust if needed, downloads the pinned XMRig worker, and launches the app.

Already cloned?

```bash
cd sparks
./install.sh
```

### What you need

- **Node 20+**
- **Rust** (installer can install via rustup)
- **macOS:** Xcode Command Line Tools
- **Windows:** [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2, VS Build Tools), then `./install.sh` from Git Bash or run the npm steps manually

## Manual commands

```bash
git clone https://github.com/bensilone/sparks.git
cd sparks
npm install
npm run fetch-worker   # pinned XMRig into apps/desktop/binaries/ (gitignored)
npm run dev            # Tauri window
```

Production build:

```bash
npm run build
```

## How entries work

Your machine mines Monero to the Sparks treasury pool under a worker name tied to your device. **Entries are credited from pool stats on the server**, not from anything the app claims. Changing the app cannot invent entries without real pool hashrate for your device.

Default API: `https://sparks-api-x5tpjitcia-uc.a.run.app`  
Override anytime under **Settings → Advanced**.

## Notes

- Antivirus often flags XMRig — allowlist the binary if needed.
- Unsigned Mac builds may need right-click → Open the first time.
- Battery earning is off by default.

## License / ops

Application source for end users. Server and deploy tooling live in a private repo.
