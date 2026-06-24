// Idempotent table creation for the ISTA quarterly auto-ingest worker
// (Task #109). Mirrors the pattern used by server/backup/bootstrap.ts:
// runs at startup, CREATE IF NOT EXISTS so it's safe to call repeatedly.

import { db } from "../storage";
import { sql } from "drizzle-orm";

export async function ensureIstaTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ista_ingest_runs (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL,
      bucket_key TEXT NOT NULL,
      file_size_bytes INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      trigger TEXT NOT NULL DEFAULT 'scheduled',
      triggered_by TEXT,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMP,
      duration_ms INTEGER,
      ssp_rows INTEGER NOT NULL DEFAULT 0,
      fub_rows INTEGER NOT NULL DEFAULT 0,
      diff JSONB,
      failed_step TEXT,
      error_message TEXT,
      warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ista_ingest_runs_version_idx ON ista_ingest_runs(version)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ista_ingest_runs_created_at_idx ON ista_ingest_runs(created_at)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ista_ingest_locks (
      version TEXT PRIMARY KEY,
      bucket_key TEXT NOT NULL,
      acquired_at TIMESTAMP NOT NULL DEFAULT NOW(),
      acquired_by TEXT NOT NULL
    )
  `);

  // SSP records table (Task #151)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ista_ssp_records (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL,
      ista_id TEXT NOT NULL,
      chassis TEXT NOT NULL,
      doc_type_code TEXT,
      title_en TEXT,
      description_en TEXT,
      keywords TEXT,
      raw_node_id TEXT,
      imported_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ista_ssp_records_unique_idx
      ON ista_ssp_records(version, ista_id, chassis)
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ista_ssp_records_version_idx ON ista_ssp_records(version)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ista_ssp_records_chassis_idx ON ista_ssp_records(chassis)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ista_ssp_records_ista_id_idx ON ista_ssp_records(ista_id)`);

  // FUB records table (Task #151)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ista_fub_records (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL,
      ista_id TEXT NOT NULL,
      chassis TEXT NOT NULL,
      doc_type_code TEXT,
      title_en TEXT,
      description_en TEXT,
      process_type TEXT,
      raw_node_id TEXT,
      imported_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ista_fub_records_unique_idx
      ON ista_fub_records(version, ista_id, chassis)
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ista_fub_records_version_idx ON ista_fub_records(version)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ista_fub_records_chassis_idx ON ista_fub_records(chassis)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ista_fub_records_ista_id_idx ON ista_fub_records(ista_id)`);
}
