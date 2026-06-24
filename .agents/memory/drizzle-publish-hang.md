---
name: drizzle-kit publish hang root causes
description: Why Replit publish shows "timeout exceeded when trying to connect" and how to fix it permanently.
---

## The Problem

Replit's publish pre-check runs `drizzle-kit push` non-interactively (no TTY). When drizzle-kit finds **destructive** changes (DROP INDEX, DROP CONSTRAINT, etc.), it writes a confirmation prompt to `/dev/tty` and waits. Without a TTY, the process hangs indefinitely → Replit times out → shows "timeout exceeded when trying to connect".

Non-destructive changes (CREATE TABLE, ALTER COLUMN SET DEFAULT) are auto-applied without prompting — those are fine.

## Causes Found in This Project

1. **Missing GIN trigram indexes** (`idx_parts_description_trgm`, etc.) — drizzle-kit tries to CREATE them, which on a 5.6M-row `parts` table takes minutes without CONCURRENTLY, causing a different kind of hang.

2. **GIN trigram indexes with format mismatch** — drizzle-kit's introspection cannot round-trip `gin_trgm_ops` expressions. Even after creating the indexes correctly, drizzle-kit always sees them as mismatched and wants to DROP+RECREATE → triggers the prompt.

3. **Column default SET DEFAULT loop** — drizzle-kit always emits SET DEFAULT for array columns (`ARRAY[]::text[]`, `'{}'::text[]`). These are non-destructive so they auto-apply without prompting — safe to ignore.

## Permanent Fix

**GIN trigram indexes must NOT be in `shared/schema.ts`.**  
- drizzle-kit can never correctly round-trip `USING gin (col gin_trgm_ops)` expressions — it always wants DROP+RECREATE.
- Instead, create them via startup DDL in `server/index.ts` using `CREATE INDEX CONCURRENTLY IF NOT EXISTS` inside a `setImmediate()` callback (so server startup isn't blocked).
- Use `db.execute(sql`...`)` not `pool.connect()` — drizzle's pool runs in autocommit mode which satisfies CONCURRENTLY's "not inside a transaction" requirement.

## How to Diagnose Future Hangs

```bash
# Simulate non-interactive publish environment:
timeout 35 npx drizzle-kit push < /dev/null 2>&1; echo "EXIT:$?"
# EXIT:0 in <35s = good. EXIT:124 = still hanging.

# See exactly what drizzle-kit proposes (with a pty + piped n to cancel):
script -q /tmp/dk.txt -c "bash -c 'printf \"n\n\" | timeout 30 npx drizzle-kit push --verbose 2>&1'"
cat /tmp/dk.txt | strings | grep -v "^$" | grep -v "spinner chars"
```

**Why:** DROP INDEX is always destructive in drizzle-kit's eyes → always prompts. Find what causes the DROP and fix it at the schema or DB level.
