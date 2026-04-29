# Operations Notes

## Preflight

Run environment checks before starting:

```bash
npm run check:env
```

For production-like strict checks:

```bash
npm run check:env:strict
```

## Local Run

```bash
npm install
npm run dev
```

## Vimeo Sync

Trigger sync script:

```bash
npm run sync:vimeo
```

Optional flags:

- `--baseUrl=http://localhost:3000`
- `--dataSourceId=<uuid>`
- `--perPage=50`
- `--maxPages=1`

## Durable Sync Worker

Admin sync buttons now enqueue database-backed sync jobs. Run the worker alongside the web app to process queued jobs:

```bash
npm run worker:sync
```

Optional flags:

- `--baseUrl=http://localhost:3000`
- `--pollMs=5000`
- `--workerId=sync-worker-1`

Recommended transcription timeout defaults:

- `TRANSCRIPTION_DOWNLOAD_TIMEOUT_MS=120000`
- `TRANSCRIPTION_COMMAND_TIMEOUT_MS=180000`
- `OPENAI_TRANSCRIPTION_TIMEOUT_MS=180000`

PM2 example:

```bash
pm2 start npm --name vimeo-vault -- start
pm2 start npm --name vimeo-vault-sync-worker -- run worker:sync
```

## Admin Ops

In `/admin` → `System`:

- Manual sync all sources
- Rebuild embeddings (all sources)
- Retry failed/partial sync runs
- Review sync error queue and mark `resolved` / `ignored` / `open`

## Smoke QA Checklist

1. Login (Google SSO or local bypass if enabled)
2. `/admin` loads system stats and health status
3. Sync a source and confirm recent operation appears
4. Run search and verify dynamic results + match reason
5. Add favorite and verify count updates in nav
6. Add video to playlist/personal collection and reload page
