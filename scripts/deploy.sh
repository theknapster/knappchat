#!/usr/bin/env bash
# Build and (re)deploy knappchat on this host: migrate the DB, build the
# backend and client, publish the client to /srv/knappchat (served by Caddy),
# and restart the backend service. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT=/srv/knappchat

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"

echo "==> docker services"
(cd "$ROOT" && sudo docker compose up -d)

echo "==> server: install, migrate, build"
cd "$ROOT/server"
npm ci --no-audit --no-fund
npm run migrate
npm run build

echo "==> client: install, build, publish to $WEB_ROOT"
cd "$ROOT/client"
npm ci --no-audit --no-fund
npm run build
sudo install -d -o "$USER" -g "$USER" "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"

echo "==> restart backend"
sudo systemctl restart knappchat
systemctl is-active knappchat
