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
