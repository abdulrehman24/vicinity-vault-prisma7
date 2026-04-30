#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/var/www/vault"
APP_NAME="vault"
SYNC_WORKER_NAME="vimeo-vault-sync-worker"
LEGACY_SYNC_WORKER_NAME="vimeo-va"
BRANCH="${1:-main}"
RUN_NGINX_RELOAD="${RUN_NGINX_RELOAD:-true}"
SYNC_BASE_URL="${SYNC_BASE_URL:-http://127.0.0.1:3000}"
APP_HEALTH_URL="${APP_HEALTH_URL:-$SYNC_BASE_URL/login}"
APP_HEALTH_RETRIES="${APP_HEALTH_RETRIES:-30}"
APP_HEALTH_SLEEP_SECONDS="${APP_HEALTH_SLEEP_SECONDS:-2}"

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

# If INTERNAL_SYNC_TOKEN is not exported in the current shell, try loading from .env.
if [[ -z "${INTERNAL_SYNC_TOKEN:-}" && -f ".env" ]]; then
  token_from_env="$(grep -E '^INTERNAL_SYNC_TOKEN=' .env | tail -n 1 | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  if [[ -n "${token_from_env:-}" ]]; then
    export INTERNAL_SYNC_TOKEN="$token_from_env"
    echo "[deploy] Loaded INTERNAL_SYNC_TOKEN from .env"
  fi
fi

if [[ -z "${INTERNAL_SYNC_TOKEN:-}" ]]; then
  echo "[deploy] ERROR: INTERNAL_SYNC_TOKEN is required for sync worker authentication."
  echo "[deploy] Set INTERNAL_SYNC_TOKEN in your shell, .env, PM2 ecosystem, or service env before deploy."
  exit 1
fi

echo "[deploy] Generating Prisma client..."
npx prisma generate

echo "[deploy] Running database migrations..."
npx prisma migrate deploy

echo "[deploy] Building Next.js app..."
npm run build

echo "[deploy] Removing legacy sync worker process names (if any)..."
pm2 delete "$LEGACY_SYNC_WORKER_NAME" >/dev/null 2>&1 || true

echo "[deploy] Stopping sync worker before app restart (queue-safe deploy)..."
pm2 stop "$SYNC_WORKER_NAME" >/dev/null 2>&1 || true

echo "[deploy] Restarting PM2 app..."
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start npm --name "$APP_NAME" -- start
fi

echo "[deploy] Waiting for app health at $APP_HEALTH_URL ..."
for ((i=1; i<=APP_HEALTH_RETRIES; i++)); do
  if curl -fsS "$APP_HEALTH_URL" >/dev/null 2>&1; then
    echo "[deploy] App health check passed."
    break
  fi
  if [[ "$i" -eq "$APP_HEALTH_RETRIES" ]]; then
    echo "[deploy] ERROR: App health check failed after $APP_HEALTH_RETRIES attempts."
    exit 1
  fi
  sleep "$APP_HEALTH_SLEEP_SECONDS"
done

echo "[deploy] Restarting sync worker..."
if pm2 describe "$SYNC_WORKER_NAME" >/dev/null 2>&1; then
  INTERNAL_SYNC_TOKEN="$INTERNAL_SYNC_TOKEN" SYNC_BASE_URL="$SYNC_BASE_URL" pm2 restart "$SYNC_WORKER_NAME" --update-env
else
  INTERNAL_SYNC_TOKEN="$INTERNAL_SYNC_TOKEN" SYNC_BASE_URL="$SYNC_BASE_URL" pm2 start npm --name "$SYNC_WORKER_NAME" -- run worker:sync
fi

echo "[deploy] Saving PM2 process list..."
pm2 save
pm2 list

if [[ "$RUN_NGINX_RELOAD" == "true" ]]; then
  echo "[deploy] Testing Nginx config..."
  sudo nginx -t

  echo "[deploy] Reloading Nginx..."
  sudo systemctl reload nginx
else
  echo "[deploy] Skipping Nginx reload (RUN_NGINX_RELOAD=false)"
fi

echo "[deploy] Deployment completed successfully."
