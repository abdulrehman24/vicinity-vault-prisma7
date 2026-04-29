#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/var/www/vault"
APP_NAME="vault"
SYNC_WORKER_NAME="vimeo-vault-sync-worker"
BRANCH="${1:-main}"
RUN_NGINX_RELOAD="${RUN_NGINX_RELOAD:-true}"
SYNC_BASE_URL="${SYNC_BASE_URL:-http://127.0.0.1:3000}"

echo "[deploy] Starting deployment..."

cd "$APP_DIR"

echo "[deploy] Pulling latest code from branch: $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[deploy] Installing dependencies..."
npm ci

echo "[deploy] Checking environment..."
npm run check:env:strict

if [[ -z "${INTERNAL_SYNC_TOKEN:-}" ]]; then
  echo "[deploy] ERROR: INTERNAL_SYNC_TOKEN is required for sync worker authentication."
  echo "[deploy] Set INTERNAL_SYNC_TOKEN in your shell, PM2 ecosystem, or service env before deploy."
  exit 1
fi

echo "[deploy] Generating Prisma client..."
npx prisma generate

echo "[deploy] Running database migrations..."
npx prisma migrate deploy

echo "[deploy] Building Next.js app..."
npm run build

echo "[deploy] Restarting PM2 app..."
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME"
else
  pm2 start npm --name "$APP_NAME" -- start
fi

echo "[deploy] Restarting sync worker..."
if pm2 describe "$SYNC_WORKER_NAME" >/dev/null 2>&1; then
  INTERNAL_SYNC_TOKEN="$INTERNAL_SYNC_TOKEN" SYNC_BASE_URL="$SYNC_BASE_URL" pm2 restart "$SYNC_WORKER_NAME" --update-env
else
  INTERNAL_SYNC_TOKEN="$INTERNAL_SYNC_TOKEN" SYNC_BASE_URL="$SYNC_BASE_URL" pm2 start npm --name "$SYNC_WORKER_NAME" -- run worker:sync
fi

echo "[deploy] Saving PM2 process list..."
pm2 save

if [[ "$RUN_NGINX_RELOAD" == "true" ]]; then
  echo "[deploy] Testing Nginx config..."
  sudo nginx -t

  echo "[deploy] Reloading Nginx..."
  sudo systemctl reload nginx
else
  echo "[deploy] Skipping Nginx reload (RUN_NGINX_RELOAD=false)"
fi

echo "[deploy] Deployment completed successfully."
