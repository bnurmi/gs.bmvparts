# BMV.parts — Smoke Test Guide

Run these 6 tests in order after first boot on the VPS. All tests use `curl`.
Replace `https://bmv.parts` with your local URL (e.g. `http://localhost:5000`) during initial testing.

---

## Prerequisites

- [ ] Redis is running (`redis-cli ping` → `PONG`)
- [ ] Node process is running (`NODE_ENV=production node dist/index.cjs`)
- [ ] PostgreSQL is accepting connections
- [ ] `.env` is fully populated (use `forveronica/.env.example` as the template)

---

## Test 1 — Health check (unauthenticated)

```bash
curl -s https://bmv.parts/health | jq .
```

**Expected response:**
```json
{ "status": "ok", "db": "ok", "redis": "ok" }
```

**Failure signals:**

| Response | Likely cause |
|---|---|
| `"db": "error"` | DATABASE_URL wrong / PostgreSQL not running |
| `"redis": "error"` | Redis not started before Node |
| Connection refused | Node process not running / PORT mismatch |
| 502 Bad Gateway | Caddy reverse proxy misconfigured |

---

## Test 2 — Public catalog read

```bash
curl -s "https://bmv.parts/api/cars?limit=5" | jq 'length'
```

**Expected:** a number > 0 (should be in the thousands if data was imported from the PG dump).

**Failure signals:**

| Response | Likely cause |
|---|---|
| `0` or `[]` | PG dump not imported / wrong database |
| `500` | Schema mismatch — run `drizzle-kit push --force` |
| `503` | App starting up, wait 10s and retry |

---

## Test 3 — API key authentication

First, create an API key in the Admin UI (`/admin/api-keys`), then:

```bash
export BMV_API_KEY="your-api-key-here"
curl -s "https://bmv.parts/api/v1/cars?limit=3" \
  -H "X-API-Key: $BMV_API_KEY" | jq 'length'
```

**Expected:** a number > 0.

**Failure signals:**

| Response | Likely cause |
|---|---|
| `401 Unauthorized` | Key not created or wrong header name |
| `403 Forbidden` | Key exists but wrong tier/permissions |
| `429 Too Many Requests` | Rate limit hit — check `API_RATE_LIMIT_BASIC` |

---

## Test 4 — Bearer provision key

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://bmv.parts/api/admin/users/provision \
  -H "Authorization: Bearer $BMV_ACCOUNT_PROVISION_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@example.com","plan":"basic","dryRun":true}'
```

**Expected HTTP status:** `200` or `204` (dry run — no account created).

**Failure signals:**

| Status | Likely cause |
|---|---|
| `401` | BMV_ACCOUNT_PROVISION_KEY not set / wrong value |
| `500` | Body validation error — check server logs |
| `404` | Route not found — build may be stale, rebuild with `npm run build` |

---

## Test 5 — Backup scheduler health

```bash
curl -s "https://bmv.parts/api/admin/backups" \
  -H "Cookie: connect.sid=<your-admin-session-cookie>" | jq '.[0].status'
```

Or trigger a manual backup (requires admin session):

```bash
curl -s -X POST "https://bmv.parts/api/admin/backups/trigger" \
  -H "Cookie: connect.sid=<your-admin-session-cookie>" | jq .
```

**Expected:** `"success"` or a job ID indicating the backup queued.

**Failure signals:**

| Response | Likely cause |
|---|---|
| `401` | Session cookie missing / expired — log in first at `/login` |
| Backup status `"failed"` | Check `OFFSITE_BACKUP_*` vars / S3 credentials |
| No backup records | `BMV_DISABLE_BACKUP_SCHEDULER=1` is set (expected on first boot) |

---

## Test 6 — VIN decode public endpoint

```bash
curl -s "https://bmv.parts/api/vin/WBA3A5C50CF256551" | jq '.model'
```

**Expected:** a string like `"3 Series"` or similar BMW model name.

**Failure signals:**

| Response | Likely cause |
|---|---|
| `null` / empty | VIN not in local cache — expected on fresh install, will populate over time |
| `500` | VIN enrichment service misconfigured — check `BMW_CONFIGURATOR_HOST` / proxy vars |
| Slow (>5s) | First VIN lookup hits external APIs — normal |

---

## After all tests pass

1. Enable kill switches one at a time (start with `BMV_DISABLE_BACKUP_SCHEDULER=`)
2. Restart the Node process after each env change
3. Monitor logs for 5 minutes after re-enabling each job
4. Once stable, proceed with DNS cutover (see `forveronica/migration-dossier.md`)
