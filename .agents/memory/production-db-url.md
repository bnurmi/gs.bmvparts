---
name: Production DB URL
description: DATABASE_URL in dev resolves to the container-local "helium" postgres; production VMs cannot reach it and time out on every query.
---

# Production DB connection string

In the dev Repl, `DATABASE_URL` = `postgresql://<creds>@helium/heliumdb?sslmode=disable`.
`helium` is a Docker-bridge hostname only reachable inside the dev container.
The deployed production VM has no `helium` DNS entry → every DB query times out immediately.

**Symptom:** site shows "Something went wrong", all API calls return 500, production logs flood with `Error: timeout exceeded when trying to connect`. Server starts in ~2 s (startup DB initialisation silently fails fast) instead of the normal ~40 s.

**Fix (already applied in `server/storage.ts`):**
```ts
const DB_URL =
  process.env.NODE_ENV === "production" && process.env.PROD_DATABASE_URL
    ? process.env.PROD_DATABASE_URL
    : process.env.DATABASE_URL;
```
All three pools (main, worker, health) use `DB_URL`. `PROD_DATABASE_URL` is a user-set Replit Secret that holds the real external production postgres connection string.

**Why:** `PROD_DATABASE_URL` is explicitly set by the user and points to the real production postgres. `DATABASE_URL` is a Replit-managed secret whose dev-environment value is the local helium instance — useless in production.

**How to apply:** Any future file that opens its own `pg.Pool` must use the same `DB_URL` constant (import from storage or replicate the same conditional). Do not hardcode `process.env.DATABASE_URL` in new production-facing code.
