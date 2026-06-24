import { sql } from "drizzle-orm";
import { db } from "../storage";

/**
 * Idempotent table bootstrap for the backup subsystem.
 *
 * `shared/schema.ts` is the source of truth, but `drizzle-kit push` cannot
 * be run unattended in every environment (e.g. when interactive rename
 * prompts appear). We therefore guarantee these tables/indexes exist via
 * `CREATE TABLE IF NOT EXISTS` at process start. The DDL below mirrors
 * the Drizzle definitions and is safe to run on a database that already
 * has them.
 */
export async function ensureBackupTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backup_logs (
      id SERIAL PRIMARY KEY,
      backup_type TEXT NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'manual',
      label TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      storage_key TEXT,
      size_bytes INTEGER,
      checksum TEXT,
      duration_ms INTEGER,
      offsite_status TEXT NOT NULL DEFAULT 'skipped',
      offsite_key TEXT,
      offsite_error TEXT,
      error_message TEXT,
      details JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS backup_logs_created_at_idx ON backup_logs (created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS backup_logs_type_status_idx ON backup_logs (backup_type, status)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  const orphaned = await db.execute(sql`
    UPDATE backup_logs
    SET
      status = 'failed',
      error_message = 'orphaned: process restarted before completion',
      completed_at = NOW()
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '10 minutes'
  `);
  const count = (orphaned as any).rowCount ?? 0;
  if (count > 0) {
    console.log(`[Backup/Bootstrap] Marked ${count} orphaned pending backup(s) as failed`);
  }
}
