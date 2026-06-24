/**
 * Growth engine DB setup — ensures the 4 SEO growth tables exist.
 * Called from server/index.ts startup sequence (IF NOT EXISTS guards make it idempotent).
 */

import { db } from "../storage";
import { sql } from "drizzle-orm";

export async function ensureSeoGrowthTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seo_keywords (
      id          SERIAL PRIMARY KEY,
      keyword     TEXT NOT NULL UNIQUE,
      intent      TEXT NOT NULL DEFAULT 'informational',
      volume_est  INTEGER NOT NULL DEFAULT 0,
      difficulty  INTEGER NOT NULL DEFAULT 50,
      cpc_usd     REAL NOT NULL DEFAULT 0,
      priority    REAL NOT NULL DEFAULT 5,
      page_targeting TEXT,
      created_at  TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS seo_keywords_priority_idx ON seo_keywords (priority DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS seo_keywords_intent_idx ON seo_keywords (intent)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seo_content_pages (
      id               SERIAL PRIMARY KEY,
      slug             TEXT NOT NULL UNIQUE,
      page_type        TEXT NOT NULL DEFAULT 'guide',
      primary_keyword  TEXT NOT NULL,
      title            TEXT NOT NULL,
      content          TEXT NOT NULL DEFAULT '',
      meta_title       TEXT NOT NULL DEFAULT '',
      meta_description TEXT NOT NULL DEFAULT '',
      word_count       INTEGER NOT NULL DEFAULT 0,
      indexed          BOOLEAN NOT NULL DEFAULT false,
      generated_at     TIMESTAMP DEFAULT NOW() NOT NULL,
      last_refreshed_at TIMESTAMP
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS seo_content_pages_type_idx ON seo_content_pages (page_type)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS seo_content_pages_generated_idx ON seo_content_pages (generated_at)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seo_content_clusters (
      id           SERIAL PRIMARY KEY,
      cluster_name TEXT NOT NULL,
      hub_url      TEXT NOT NULL UNIQUE,
      spoke_urls   JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at   TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seo_refresh_queue (
      id       SERIAL PRIMARY KEY,
      page_id  INTEGER NOT NULL UNIQUE REFERENCES seo_content_pages(id) ON DELETE CASCADE,
      due_at   TIMESTAMP NOT NULL,
      status   TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS seo_refresh_queue_due_idx ON seo_refresh_queue (due_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS seo_refresh_queue_status_idx ON seo_refresh_queue (status)
  `);
}
