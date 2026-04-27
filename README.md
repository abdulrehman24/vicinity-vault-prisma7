# VicinityVault

Internal Vimeo video search platform for sales teams.  
It syncs videos from one or more Vimeo sources, processes transcripts, generates embeddings, and returns high-quality AI-ranked search results with match reasons.

## 1) Project Overview

### What this app does
- Syncs Vimeo video libraries into PostgreSQL
- Stores metadata, tags, transcripts, chunks, embeddings
- Supports keyword + semantic search for client briefs
- Provides AI-generated “why this matched” reasoning
- Includes admin operations (sync, retry, rebuild embeddings, source management)

### Tech stack
- Next.js (App Router)
- Prisma ORM
- PostgreSQL
- OpenAI API
- Vimeo API
- NextAuth (Google SSO + internal authorization)

---

## 2) Prerequisites

On a fresh DigitalOcean Ubuntu server, install/configure:
- Node.js LTS (recommended: Node 20)
- npm
- Git
- PM2 (process manager)
- Nginx (reverse proxy)
- SSL via Let’s Encrypt (Certbot)
- PostgreSQL (local) **or** DigitalOcean Managed PostgreSQL

---

## 3) Server Setup (Fresh DigitalOcean Ubuntu)

## 3.1 Update system
```bash
sudo apt update && sudo apt upgrade -y
```

## 3.2 Install base packages
```bash
sudo apt install -y curl git build-essential ufw nginx
```

## 3.3 Install Node.js LTS (Node 20)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3.4 Install PM2
```bash
sudo npm install -g pm2
pm2 -v
```

## 3.5 Firewall (recommended)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## 4) Database Setup

Choose one:

## Option A: DigitalOcean Managed PostgreSQL (recommended)
1. Create a managed PostgreSQL cluster in DigitalOcean.
2. Create database (example): `vimeo_vault`.
3. Add trusted source IP (your Droplet IP).
4. Copy connection string (`DATABASE_URL`).

No local PostgreSQL install needed.

## Option B: Local PostgreSQL on server
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Create DB/user:
```bash
sudo -u postgres psql
```
Inside psql:
```sql
CREATE USER vimeo_vault_user WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE vimeo_vault OWNER vimeo_vault_user;
\q
```

Example local URL:
```env
DATABASE_URL="postgresql://vimeo_vault_user:CHANGE_ME_STRONG_PASSWORD@localhost:5432/vimeo_vault?schema=public"
```

---

## 5) Clone and Install Project

```bash
cd /var/www
sudo git clone <YOUR_REPO_URL> vimeo-vault
sudo chown -R $USER:$USER /var/www/vimeo-vault
cd /var/www/vimeo-vault/frontend-next
npm ci
```

---

## 6) Environment Configuration

Create production env file:
```bash
cp .env.example .env.production
nano .env.production
```

Set at minimum:
```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="generate-a-long-random-secret"
APP_SECRET_KEY="generate-a-long-random-secret"

GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
ALLOWED_GOOGLE_DOMAIN="vicinity.sg"

VIMEO_ACCESS_TOKEN=""
OPENAI_API_KEY=""
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_TRANSCRIPTION_MODEL="gpt-4o-mini-transcribe"
ENABLE_SYNC_FILE_LOGS="true"

ENABLE_LOCAL_AUTH_BYPASS="false"
LOCAL_BYPASS_EMAIL=""
```

Generate secure secrets:
```bash
openssl rand -base64 48
```

> Notes:
> - This app supports per-source Vimeo tokens and OpenAI key in admin DB config, but server env still needs secure baseline values.
> - Keep secrets server-side only.

---

## 7) Prisma Setup and Migrations

Run from `frontend-next`:
```bash
npx prisma generate
npx prisma migrate deploy
```

Optional verification:
```bash
npx prisma migrate status
```

---

## 8) Build and Run App (PM2)

## 8.1 Build
```bash
cd /var/www/vimeo-vault/frontend-next
npm run check:env
npm run build
```

## 8.2 Start with PM2
```bash
pm2 start npm --name vimeo-vault -- start -- -p 3000
pm2 save
pm2 startup
```

Follow the printed `pm2 startup` command and run it once.

Check app:
```bash
pm2 status
pm2 logs vimeo-vault --lines 200
```

---

## 9) Nginx Reverse Proxy

Create Nginx site config:
```bash
sudo nano /etc/nginx/sites-available/vimeo-vault
```

Use this (replace `your-domain.com`):
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/vimeo-vault /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 10) SSL with Let’s Encrypt

Install Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
```

Issue cert:
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Test renewal:
```bash
sudo certbot renew --dry-run
```

---

## 11) First Production Validation Checklist

After deployment:
1. Open `https://your-domain.com/login`
2. Verify Google SSO login works for allowed domain only
3. Verify admin access restrictions by role
4. Open `/admin`:
   - add/update Vimeo source
   - trigger source sync
   - check recent operations and sync errors
5. Open `/search` and run real brief queries
6. Verify `/featured`, `/playlists`, `/personal` load dynamic data
7. Test favorites, collection create/delete, and sharing links

---

## 12) Operations Commands

From `/var/www/vimeo-vault/frontend-next`:

### Trigger Vimeo sync script
```bash
npm run sync:vimeo
```

### Env checks
```bash
npm run check:env
npm run check:env:strict
```

### PM2 controls
```bash
pm2 status
pm2 logs vimeo-vault --lines 200
pm2 restart vimeo-vault
pm2 stop vimeo-vault
```

### Nginx controls
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
```

---

## 13) Deploy Updates (CI-less Manual Flow)

```bash
cd /var/www/vimeo-vault
git pull origin main
cd frontend-next
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart vimeo-vault
```

---

## 14) Troubleshooting

### `Unknown field ...` Prisma errors
Usually Prisma Client/schema mismatch.
```bash
cd /var/www/vimeo-vault/frontend-next
npx prisma generate
npx prisma migrate deploy
pm2 restart vimeo-vault
```

### App not reachable
- Check PM2:
```bash
pm2 status
pm2 logs vimeo-vault --lines 200
```
- Check Nginx:
```bash
sudo systemctl status nginx
sudo tail -n 200 /var/log/nginx/error.log
```

### Auth issues
- Confirm:
  - `NEXTAUTH_URL` matches production domain
  - `NEXTAUTH_SECRET` set
  - Google OAuth redirect URI matches deployed callback endpoint:
    - `https://your-domain.com/api/auth/callback/google`

### Vimeo/OpenAI behavior issues
- Verify tokens/keys in admin and env
- Check `/admin` sync errors table
- Rebuild embeddings from admin if needed

---

## 15) Security Notes

- Never commit `.env.production`
- Use strong secrets for `NEXTAUTH_SECRET` and `APP_SECRET_KEY`
- Restrict DB network access (trusted IPs only)
- Keep local bypass disabled in production:
```env
ENABLE_LOCAL_AUTH_BYPASS="false"
```
- Ensure only internal allowed domain users can log in

---

## 16) Repository Structure (relevant)

```text
frontend-next/
  app/                     # Next.js routes + API routes
  prisma/                  # schema + migrations
  src/server/services/     # sync/search/admin/auth business logic
  scripts/                 # operational scripts
```

---

## 17) License / Internal Use

This project is intended for internal use by authorized team members.
