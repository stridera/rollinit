#!/usr/bin/env bash
# Deploy RollInit to production
# Run from local machine: ./scripts/deploy.sh
#
# Prod runs as the systemd unit `rollinit.service` under the `rollinit` user,
# which also owns the repo. Build steps run as that user; the restart uses sudo.
set -euo pipefail

SERVER="strider@stridera"

echo "=== Deploying RollInit ==="

ssh "${SERVER}" bash <<'REMOTE'
set -euo pipefail

APP_DIR="/var/www/rollinit.app"
APP_USER="rollinit"
SERVICE="rollinit"

sudo -n -u "${APP_USER}" bash -ls -- "${APP_DIR}" <<'APP'
set -euo pipefail
cd "$1"

echo "[*] Pulling latest from GitHub..."
git fetch origin
git reset --hard origin/main

echo "[*] Installing dependencies..."
npm ci --production=false --no-audit --no-fund

echo "[*] Generating Prisma client..."
npx prisma generate

echo "[*] Pushing database schema..."
npx prisma db push

echo "[*] Building Next.js..."
npm run build
APP

echo "[*] Restarting ${SERVICE}.service..."
sudo -n systemctl restart "${SERVICE}"

echo "[*] Waiting for app to respond on :3200..."
for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:3200/; then
        echo "[ok] ${SERVICE}.service up"
        break
    fi
    if ! systemctl is-active --quiet "${SERVICE}" || [ "$i" -eq 30 ]; then
        echo "[!] ${SERVICE}.service did not come up"
        sudo -n journalctl -u "${SERVICE}" -n 30 --no-pager -o cat
        exit 1
    fi
    sleep 2
done

echo "[*] Deployed: $(sudo -n -u "${APP_USER}" git -C "${APP_DIR}" log -1 --oneline)"

echo ""
echo "=== Deploy Complete ==="
echo "Site: https://rollinit.app"
REMOTE
