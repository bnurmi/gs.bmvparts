// One-time migration to create the ai_faq_cache table in the database.
// Safe to run multiple times (uses IF NOT EXISTS).
//
// Usage: npx tsx scripts/migrate-ai-faq-cache.ts

import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log("[migrate] Creating ai_faq_cache table...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_faq_cache (
        id          SERIAL PRIMARY KEY,
        page_type   TEXT NOT NULL,
        page_key    TEXT NOT NULL,
        locale      TEXT NOT NULL,
        faq_items   JSONB NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_faq_cache_unique_idx
        ON ai_faq_cache (page_type, page_key, locale);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ai_faq_cache_page_type_idx
        ON ai_faq_cache (page_type);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ai_faq_cache_page_key_idx
        ON ai_faq_cache (page_key);
    `);

    console.log("[migrate] ai_faq_cache table and indexes created (or already existed).");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
