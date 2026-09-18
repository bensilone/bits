#!/usr/bin/env bash
# Sparks desktop — one-command setup (Mac primary; Linux/Windows notes printed).
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

os="$(uname -s)"
say "Sparks desktop installer ($os)"

# Resolve working copy
if [[ -f "./apps/desktop/package.json" ]]; then
  ROOT="$(pwd)"
  say "Using existing checkout: $ROOT"
elif [[ -f "./package.json" ]] && [[ -d "./apps/desktop" ]]; then
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

# Node
if ! need node; then
  say "Node.js 20+ is required."
  if [[ "$os" == "Darwin" ]] && need brew; then
    say "Installing Node via Homebrew…"
    brew install node@20 || brew install node
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

# Rust (for Tauri)
if ! need cargo; then
  say "Installing Rust (rustup)…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi
say "Rust $(rustc --version 2>/dev/null || echo missing)"

if [[ "$os" == "Darwin" ]]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    say "Installing macOS Command Line Tools (GUI prompt may appear)…"
    xcode-select --install || true
    echo "After CLT finishes, re-run: cd $ROOT && ./install.sh" >&2
    exit 1
  fi
fi

say "npm install"
npm install

say "Fetching pinned XMRig worker"
npm run fetch-worker

say "Default API: $PROD_API (change under Settings → Advanced if needed)"
say "Starting Sparks (Tauri dev)…"
echo "Tip: first launch may take a few minutes while Rust crates compile."
npm run dev
