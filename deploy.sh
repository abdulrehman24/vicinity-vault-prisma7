#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/var/www/vault"
APP_NAME="vault"
BRANCH="${1:-main}"
RUN_NGINX_RELOAD="${RUN_NGINX_RELOAD:-true}"

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
