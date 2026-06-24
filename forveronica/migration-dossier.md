# BMV.parts — VPS Migration Dossier

Everything Veronica needs to run the BMW Parts Catalog on a VPS with Docker + Caddy.

---

## Architecture Overview

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (built to `dist/public/`) |
| Backend | Express.js (Node 20, compiled to `dist/index.cjs`) |
| Database | PostgreSQL 15+ via Drizzle ORM |
| Cache / sessions | Redis 7 (local, bind 127.0.0.1) |
| Object Storage | Replit Object Storage (ISTA package bucket) |
| AI | OpenAI GPT-4o via `AI_INTEGRATIONS_OPENAI_*` |
| Proxies | Oxylabs + Evomi (scraping) |

---

## Build & Run

### Requirements
- Node.js 20 (LTS)
- PostgreSQL 15+
- Redis 7

### Build
```bash
npm install
npm run build
# Produces: dist/index.cjs (server bundle ~2.5 MB) + dist/public/ (frontend assets)
```

### Production start command (exact from `.replit [deployment]`)
```bash
redis-server --daemonize yes --loglevel warning --save '60 1' --bind 127.0.0.1 2>/dev/null || true
NODE_ENV=production node dist/index.cjs
```

Redis **must start before** the Node process. The `|| true` means a pre-existing Redis is tolerated.

### Port binding
- **App**: listens on `PORT` env var (default `5000`), bind `0.0.0.0`
- **Redis**: `127.0.0.1:6379` (localhost only — never expose externally)

---

## Background Jobs (8 total)

All jobs run inside the main Node process. Each has a kill switch env var.

| Job | Kill switch | Default interval | Notes |
|---|---|---|---|
| Catalog delta importer | `BMV_DISABLE_BACKUP_SCHEDULER` | — | ETK scrape diff |
| Backup scheduler | `BMV_DISABLE_BACKUP_SCHEDULER` | — | PG dump → Object Storage + S3 |
| SEO growth engine | `BMV_DISABLE_SEO_ENGINES` | `SEO_REFRESH_INTERVAL_HOURS` | AI content seeder |
| SEO scheduler | `BMV_DISABLE_SEO_SCHEDULER` | `SEO_SEED_INTERVAL_HOURS` | |
| ISTA quarterly ingest | `BMV_DISABLE_ISTA_SCHEDULER` | `ISTA_INGEST_POLL_MINUTES` | Polls Replit Object Storage bucket |
| VIN enrichment backfill | `BMV_DISABLE_VIN_BACKFILL` | `VIN_BACKFILL_DAILY_LIMIT` | |
| AI FAQ generation | `BMV_DISABLE_AI_FAQ` | — | Costs $$ if enabled |
| Idempotent DDL bootstrap | `BMW_MODELS_SEED_DISABLED` | on startup | Creates indexes etc. |

**Recommended on a new VPS**: set all kill switches to `1` until the app is confirmed healthy, then enable one at a time.

---

## Auth Mechanisms (6)

| Mechanism | Header / cookie | Used for |
|---|---|---|
| Session (Passport.js + PostgreSQL) | `connect.sid` cookie | Admin UI login |
| X-API-Key (basic tier) | `X-API-Key: <key>` | Rate-limited read API |
| X-API-Key (paid tier) | `X-API-Key: <key>` | Higher rate limits |
| Bearer provision key | `Authorization: Bearer <BMV_ACCOUNT_PROVISION_KEY>` | Headless account provisioning |
| SEO publisher token | `Authorization: Bearer <SEO_PUBLISHER_API_TOKEN>` | CMS-style content publishing |
| Backup health token | custom header | Backup health webhook |

---

## Route Inventory by Auth Level

### Public (no auth)
- `GET /` — serves React SPA
- `GET /api/cars` — model list
- `GET /api/cars/:id/parts` — parts for a model
- `GET /api/parts/:id` — part detail
- `GET /api/search` — full-text search
- `GET /api/vin/:vin` — VIN decode (public)
- `GET /health` — health check (DB + Redis ping)
- `GET /sitemap.xml`, `GET /robots.txt`

### Session / Admin
- `POST /api/login`, `POST /api/logout`
- `GET /api/admin/*` — admin dashboard endpoints
- `GET /api/admin/backups` — backup history
- `POST /api/admin/backups/trigger` — manual backup
- `GET /api/admin/ista` — ISTA ingest history

### API Key
- `GET /api/v1/cars` — versioned catalog API
- `GET /api/v1/parts` — versioned parts API

### Provision Key (Bearer)
- `POST /api/admin/users/provision` — headless user creation

### SEO Publisher Token
- `POST /api/seo/publish` — push editorial content
- `GET /api/seo/pages` — list SEO pages

---

## GearSwap Integration

GearSwap is a headless provisioning / OAuth2 partner.

| Setting | Env var |
|---|---|
| GearSwap base URL | `PARTS_CATALOG_API_URL` |
| GearSwap API token | `PARTS_CATALOG_API_TOKEN` |
| Provision endpoint auth | `BMV_ACCOUNT_PROVISION_KEY` |
| SSO shared secret | `BMV_SSO_SECRET` |

**Headless provisioning example:**
```bash
curl -X POST https://bmv.parts/api/admin/users/provision \
  -H "Authorization: Bearer $BMV_ACCOUNT_PROVISION_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","plan":"basic"}'
```

---

## Database

- ORM: Drizzle (no migration journal — schema is pushed directly with `drizzle-kit push`)
- Session store: `session` table (connect-pg-simple)
- 63 tables total (see `shared/schema.ts` for full list)

### Important: no migration journal
`migrations/meta/_journal.json` has no entries. Every schema change is applied via `drizzle-kit push --force`. **Do not use `drizzle-kit migrate`** — it will no-op or conflict.

### Pre-deploy checklist (verbatim from replit.md)
Before any schema change:
1. Run `PROD_DATABASE_URL=<conn> npx tsx scripts/sync-schema-from-prod.ts` to sync prod indexes/constraints into dev
2. Apply new columns to prod first with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
3. Inspect any migration diff for `DROP INDEX`, `DROP CONSTRAINT`, `DROP COLUMN`, `DROP DEFAULT` — stop if you see these

---

## Object Storage (ISTA)

The ISTA quarterly ingest worker polls a Replit Object Storage bucket for `.istapackage` files and downloads pre-extracted SQLite databases:

- `BMW_ISPI_ISTA-DATA_GLOBAL_{version}/DiagDocDb.sqlite`
- `BMW_ISPI_ISTA-DATA_en-US_{version}/xmlvalueprimitive_ENUS.sqlite`

On a VPS, you have two options:
1. **Keep using Replit Object Storage**: set `REPLIT_OBJECT_STORAGE_*` credentials (obtainable from Replit dashboard)
2. **Disable the ISTA scheduler**: set `BMV_DISABLE_ISTA_SCHEDULER=1`

The offsite S3-compatible backup mirror is independent — set `OFFSITE_BACKUP_*` vars.

---

## DNS / Dual-Host Routing

The app serves two vanity hosts:

| Host | Purpose |
|---|---|
| `bmv.parts` / `www.bmv.parts` | Main parts catalog |
| `bmv.vin` / `www.bmv.vin` | VIN tooling (single-segment `/bmw-*` paths pass through; anything else routes to VIN lookup) |

At the Caddy/proxy layer, route both hosts to the same Node process on port 5000. The app's `bmv.vin` host-rewriter middleware handles path routing internally.

### Caddy example
```
bmv.parts, www.bmv.parts, bmv.vin, www.bmv.vin {
    reverse_proxy localhost:5000
    tls your@email.com
}
```

---

## Migration Risks (ranked)

1. **Data loss** — PG dump must succeed before cutover. Verify `pg_dump` completes without error.
2. **Redis startup order** — Redis must be running before Node starts or session auth breaks immediately.
3. **Session secret rotation** — changing `SESSION_SECRET` invalidates all existing sessions. Do not rotate unless forced.
4. **Provision key** — `BMV_ACCOUNT_PROVISION_KEY` is shared with GearSwap. Rotate both simultaneously or not at all.
5. **Scheduler duplication** — if the old Replit VM and new VPS both run, background jobs (backup, ISTA, VIN) will double-fire. Shut Replit down before starting VPS.
6. **API costs** — `BMV_DISABLE_AI_FAQ=1` and `BMV_DISABLE_SEO_ENGINES=1` are set in prod for cost control. Keep them set until you've confirmed OpenAI billing is budgeted.
7. **Object Storage cutover** — ISTA ingest reads from Replit Object Storage. Either retain Replit credentials or disable the scheduler.
8. **DNS cutover** — bmv.parts and bmv.vin both need A/AAAA records updated. TTL-lower 24h before cutover.

---

## One-Time Migration Checklist

1. [ ] `pg_dump` from Replit prod DB → import into VPS PostgreSQL
2. [ ] Copy all secrets from Replit → VPS `.env` (use `forveronica/.env.example` as the template)
3. [ ] Set all kill switches to `1` initially (`BMV_DISABLE_AI_FAQ`, `BMV_DISABLE_SEO_ENGINES`, `BMV_DISABLE_ISTA_SCHEDULER`, `BMV_DISABLE_VIN_BACKFILL`, `BMV_DISABLE_SEO_SCHEDULER`)
4. [ ] Start Redis, then Node — confirm `/health` returns `{"status":"ok"}`
5. [ ] Run smoke tests from `forveronica/smoke-test-guide.md`
6. [ ] Confirm session login works (Admin UI → `/login`)
7. [ ] Lower DNS TTL for bmv.parts + bmv.vin to 300s
8. [ ] Cut DNS over (update A/AAAA records)
9. [ ] Confirm TLS certs issued by Caddy (check https://bmv.parts)
10. [ ] Shut down Replit deployment (prevent scheduler duplication)
11. [ ] Re-enable kill switches one at a time, monitor logs after each
12. [ ] Confirm backup job fires and PG dump lands in S3 offsite bucket
