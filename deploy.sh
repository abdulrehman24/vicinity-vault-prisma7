#!/bin/bash

set -e

APP_DIR="/var/www/vault"
APP_NAME="vault"

echo "🚀 Starting deployment..."

cd "$APP_DIR"

echo "📥 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🔧 Generating Prisma client..."
npx prisma generate

echo "🗄️ Running database migrations..."
npx prisma migrate deploy

echo "🏗️ Building Next.js app..."
npm run build

echo "🔁 Restarting PM2 app..."
pm2 restart "$APP_NAME" || pm2 start npm --name "$APP_NAME" -- start

echo "💾 Saving PM2 process..."
pm2 save

echo "🔍 Testing Nginx..."
sudo nginx -t

echo "♻️ Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Deployment completed successfully!"
