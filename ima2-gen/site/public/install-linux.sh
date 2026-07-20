#!/usr/bin/env bash
# ima2-gen one-click install (Linux / WSL)
#
# Usage:
#   curl -fsSL https://lidge-jun.github.io/ima2-gen/install-linux.sh | bash
#   or
#   bash install-linux.sh
#
# Steps:
#   1. Detect Node.js (nvm → fnm → system pkg → auto-install nvm)
#   2. Verify Node >= 20
#   3. Kill stale ima2 processes
#   4. Install ima2-gen globally
#   5. Launch ima2 serve

set -euo pipefail

MIN_NODE=20

print() { printf '\033[1;36m▸\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m✔\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m⚠\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

node_major() {
  node --version 2>/dev/null | sed 's/v\([0-9]*\).*/\1/'
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
}

# ── 1. Find or install Node.js ──────────────────────────────────────

if command -v node >/dev/null 2>&1; then
  print "Node.js detected: $(node --version)"
else
  warn "Node.js not found. Searching for version managers…"

  # Try nvm
  load_nvm
  if command -v nvm >/dev/null 2>&1; then
    print "nvm detected. Installing Node LTS…"
    nvm install --lts
    nvm use --lts
  # Try fnm
  elif command -v fnm >/dev/null 2>&1; then
    print "fnm detected. Installing Node LTS…"
    fnm install --lts
    eval "$(fnm env)"
  else
    # Auto-install nvm (works without sudo)
    print "No version manager found. Installing nvm…"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    load_nvm
    if ! command -v nvm >/dev/null 2>&1; then
      fail "nvm install succeeded but nvm not on PATH. Open a new terminal and re-run."
    fi
    nvm install --lts
    nvm use --lts
  fi
fi

# ── 2. Version gate ─────────────────────────────────────────────────

MAJOR="$(node_major)"
if [ -z "$MAJOR" ]; then
  fail "node is not on PATH after install. Open a new terminal and re-run this script."
fi
if [ "$MAJOR" -lt "$MIN_NODE" ]; then
  fail "Node $MAJOR is too old. ima2-gen requires Node >= $MIN_NODE. Run: nvm install --lts"
fi
NPM_VERSION="$(npm --version)"
NPM_MAJOR="${NPM_VERSION%%.*}"
ok "Node $(node --version), npm $NPM_VERSION"

# ── 3. Kill stale processes ─────────────────────────────────────────

if pgrep -f "ima2.*(serve|server)" >/dev/null 2>&1; then
  warn "Stopping stale ima2 processes…"
  pkill -f "ima2.*(serve|server)" 2>/dev/null || true
  sleep 1
fi

# ── 4. Install ima2-gen ─────────────────────────────────────────────

print "Installing ima2-gen globally…"
INSTALL_ARGS=(install -g ima2-gen)
if [ "$NPM_MAJOR" -ge 12 ]; then
  INSTALL_ARGS+=(--allow-scripts=ima2-gen,better-sqlite3,sharp)
fi
if npm "${INSTALL_ARGS[@]}" 2>/dev/null; then
  ok "ima2-gen $(ima2 --version 2>/dev/null || echo 'installed')"
else
  warn "Permission denied. Trying with sudo…"
  sudo npm "${INSTALL_ARGS[@]}" || fail "Install failed. Set a user prefix: npm config set prefix ~/.npm-global"
fi
print "Verifying runtime dependencies…"
ima2 doctor >/dev/null || fail "Runtime verification failed. Re-run the installer and inspect 'ima2 doctor'."
ok "Runtime dependencies verified"

# ── 5. Launch ────────────────────────────────────────────────────────

print "Starting image studio (Ctrl+C to stop)…"
print "If the browser doesn't open, visit http://localhost:3333"
echo
exec ima2 serve
