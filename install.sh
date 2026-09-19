#!/usr/bin/env bash
# Sparks desktop — one-command setup (Mac primary).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/bensilone/sparks/main/install.sh | bash
# Or after clone:
#   ./install.sh
set -euo pipefail

REPO_URL="${SPARKS_REPO_URL:-https://github.com/bensilone/sparks.git}"
INSTALL_DIR="${SPARKS_DIR:-$HOME/sparks}"
PROD_API="https://sparks-api-x5tpjitcia-uc.a.run.app"

say() { printf '\n==> %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1; }

ensure_cargo_path() {
  if [[ -f "$HOME/.cargo/env" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.cargo/env"
  fi
  export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
}

os="$(uname -s)"
arch="$(uname -m)"
say "Sparks desktop installer ($os $arch)"
ensure_cargo_path

if [[ -f "./apps/desktop/package.json" ]]; then
  ROOT="$(pwd)"
  say "Using existing checkout: $ROOT"
else
  say "Cloning $REPO_URL → $INSTALL_DIR"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    git -C "$INSTALL_DIR" pull --ff-only || true
  else
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  ROOT="$INSTALL_DIR"
fi
cd "$ROOT"
ensure_cargo_path

if ! need node; then
  say "Node.js 20+ is required."
  if [[ "$os" == "Darwin" ]] && need brew; then
    say "Installing Node via Homebrew…"
    brew install node@20 || brew install node
    ensure_cargo_path
  else
    echo "Install Node 20+ from https://nodejs.org then re-run ./install.sh" >&2
    exit 1
  fi
fi
node_v="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [[ "${node_v:-0}" -lt 20 ]]; then
  echo "Node 20+ required (found $(node -v))." >&2
  exit 1
fi
say "Node $(node -v)"

if ! need rustc || ! need cargo; then
  say "Installing Rust (rustup)…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  ensure_cargo_path
fi
if ! need cargo; then
  echo "cargo not found on PATH after rustup. Open a new terminal and run:" >&2
  echo "  source \"\$HOME/.cargo/env\" && cd $ROOT && ./install.sh" >&2
  exit 1
fi
say "Rust $(rustc --version)"
say "Cargo $(cargo --version)"

if [[ "$os" == "Darwin" ]]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    say "Installing macOS Command Line Tools (GUI prompt may appear)…"
    xcode-select --install || true
    echo "After CLT finishes, re-run: cd $ROOT && ./install.sh" >&2
    exit 1
  fi
  say "Xcode CLT: $(xcode-select -p)"
fi

# Fresh npm install on THIS machine so optional native deps (Tauri CLI) match OS/arch.
# Do not reuse a lockfile generated on another OS — npm optional-deps bug:
# https://github.com/npm/cli/issues/4828
say "Clean npm install (platform-native Tauri CLI)"
rm -rf node_modules apps/desktop/node_modules
rm -f package-lock.json apps/desktop/package-lock.json
npm install --include=optional

# Explicit platform package if optional dep still missing (common on Apple Silicon)
if [[ "$os" == "Darwin" ]]; then
  if [[ "$arch" == "arm64" ]]; then
    npm install -w @sparks/desktop --save-optional @tauri-apps/cli-darwin-arm64 2>/dev/null \
      || npm install --no-save @tauri-apps/cli-darwin-arm64 || true
  else
    npm install -w @sparks/desktop --save-optional @tauri-apps/cli-darwin-x64 2>/dev/null \
      || npm install --no-save @tauri-apps/cli-darwin-x64 || true
  fi
fi

say "Fetching pinned XMRig worker"
npm run fetch-worker

say "Default API: $PROD_API (change under Settings → Advanced if needed)"
say "Starting Sparks (Tauri dev)…"
echo "Tip: first launch may take a few minutes while Rust crates compile."

ensure_cargo_path
cd "$ROOT/apps/desktop"
npm run tauri:dev
