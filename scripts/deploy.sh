#!/usr/bin/env bash
# Deploy RollInit to production
# Run from local machine: ./scripts/deploy.sh
set -euo pipefail

SERVER="strider@stridera"
APP_DIR="/var/www/rollinit.app"

echo "=== Deploying RollInit ==="

ssh "${SERVER}" bash <<'REMOTE'
set -euo pipefail

APP_DIR="/var/www/rollinit.app"
cd "${APP_DIR}"

echo "[*] Pulling latest from GitHub..."
git fetch origin
git reset --hard origin/main

echo "[*] Installing dependencies..."
npm ci --production=false

echo "[*] Generating Prisma client..."
npx prisma generate

echo "[*] Pushing database schema..."
npx prisma db push

echo "[*] Building Next.js..."
npm run build

echo "[*] Restarting application..."
if pm2 describe rollinit &>/dev/null; then
    pm2 restart rollinit
    echo "[ok] pm2 restarted"
else
    pm2 start npm --name rollinit -- run start
    pm2 save
    echo "[ok] pm2 started and saved"
fi

echo "[*] Status:"
pm2 status rollinit

echo ""
echo "=== Deploy Complete ==="
echo "Site: https://rollinit.app"
REMOTE
