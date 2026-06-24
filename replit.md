# BMW Parts Catalog

## Overview
This project is an offline BMW parts catalog designed to scrape and store BMW parts data locally. Its primary purpose is to provide users with an efficient way to browse, search, and cross-reference BMW parts across various models without an internet connection. The system aims to cover a vast range of BMW cars, offer AI-powered part identification, and integrate VIN decoding with extensive vehicle data enrichment. The project has significant market potential by offering a comprehensive, offline parts catalog for BMW enthusiasts and professionals.

## PRE-DEPLOY CHECKLIST (READ BEFORE EVERY PUBLISH)

The Replit publish UI generates a SQL migration by diffing **shared/schema.ts against the live prod DB**. If dev DB has drifted (missing indexes, defaults, constraints, or different column widths vs prod), the publish UI will propose destructive operations — `DROP INDEX`, `ALTER COLUMN DROP DEFAULT`, `DROP CONSTRAINT` — that can damage real prod data.

**NEVER click Publish without inspecting the migration diff first.**

**Mandatory steps before clicking Publish (in order):**

1. **Sync any prod-only indexes/constraints into dev** so drizzle sees no diff:
   - Run the sync script (recommended — auto-discovers all drift):
     ```
     PROD_DATABASE_URL=<prod-connection-string> npx tsx scripts/sync-schema-from-prod.ts
     ```
     This connects to both DBs, finds every index and constraint that prod has but dev is missing, and applies them with `IF NOT EXISTS` guards. It is idempotent — safe to re-run at any time.
   - Alternatively: run `CREATE INDEX IF NOT EXISTS ...` / `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS ...` directly on the dev DB for each missing object by hand.

2. **Apply new tables/columns directly to prod first** (before publishing):
   - For new tables: ensure they exist on prod before the publish migration runs — the publish UI `CREATE TABLE` lines become no-ops, leaving only safe additions.
   - For new columns: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` directly against prod.

3. **Inspect the publish UI migration diff** before clicking Apply:
   - SAFE: `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX`, `ADD CONSTRAINT`
   - STOP if you see: `DROP INDEX`, `DROP CONSTRAINT`, `DROP COLUMN`, `DROP DEFAULT`, varchar shrinking
   - If any destructive statement appears, close the dialog, sync dev from prod for the affected object, and recheck.

4. **Parts GIN trigram indexes (task #161)**: Before the first publish after this change, run the one-time migration script to create GIN indexes on the `parts` table **with CONCURRENTLY** (to avoid write locks on 5.97M rows):
   ```
   npx tsx scripts/apply-parts-trgm-indexes.ts
   ```
   This creates `idx_parts_description_trgm`, `idx_parts_part_number_trgm`, and `idx_parts_part_number_clean_trgm`. The script is idempotent (IF NOT EXISTS). Once created on prod, drizzle-kit will no longer propose DROP+CREATE for these indexes.

**Why this matters**: drizzle-kit's migration journal is empty (`migrations/meta/_journal.json` has no entries), so every publish diff is computed fresh against the live prod DB. Dev/prod drift is the #1 cause of unexpected destructive migrations.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
The application features a React, Vite, and TypeScript frontend using TanStack Query, Shadcn UI, and Wouter for routing. The backend is an Express.js REST API with Passport.js for session authentication. PostgreSQL, managed via Drizzle ORM, serves as the primary database. AI functionalities are powered by OpenAI GPT-4o through Replit AI Integrations. Scraping mechanisms are implemented server-side using Node.js. Authentication is session-based, with bcrypt for password hashing and PostgreSQL for session storage. The UI/UX emphasizes clear navigation with a 3-panel layout for part browsing and dedicated pages for search, VIN decoding, and model references, adhering to the BMV.parts brand pack for visual consistency. Data export uses a chunked format for efficient deployment and synchronization. SEO is managed with `react-helmet-async`, a reusable SEO component, per-page unique SEO tags, sitemaps, robots.txt, route-based code splitting, and internal linking, including a dedicated `bmv.vin` vanity host for VIN tooling. A background job system tracks long-running operations in a `background_jobs` table, with auto-resume capabilities. An SEO content layer provides server-rendered SEO copy for part detail pages, utilizing editorial content and generating rich JSON-LD data. The ISTA quarterly auto-ingest worker (`server/ista/`) polls the `BMV-Bucket` Object Storage bucket for new `.istapackage` files, runs the real `SqliteExtractor` (`server/ista/sqlite-extractor.ts`) that downloads pre-extracted SQLite databases from object storage (DiagDocDb.sqlite + xmlvalueprimitive_ENUS.sqlite), joins them to produce English-labelled SSP/FUB records, and upserts into `ista_ssp_records` + `ista_fub_records`. Diffs against the previous version, persists run records (`ista_ingest_runs` + `ista_ingest_locks`), alerts admins on failure, and surfaces in the Admin → ISTA tab; per-version DB locks make re-runs safe no-ops. Configurable via `ISTA_INGEST_POLL_MINUTES`, `BMV_DISABLE_ISTA_SCHEDULER`, and `ISTA_ALERT_EMAIL`. SQLite bucket key convention: `BMW_ISPI_ISTA-DATA_GLOBAL_{version}/DiagDocDb.sqlite` and `BMW_ISPI_ISTA-DATA_en-US_{version}/xmlvalueprimitive_ENUS.sqlite`.

## External Dependencies
- **BMW ETK (bmw-etk.info)**: Main data source for car models and parts catalog.
- **BMWPartsDeal (bmwpartsdeal.com)**: Primary source for G87 M2 data and pricing.
- **LLLParts (lllparts.co.uk)**: Fallback pricing source.
- **OpenAI GPT-4o**: For AI-powered part identification.
- **Oxylabs Web Scraper API**: For proxying scraping requests.
- **VinEnrichmentService**: First-party orchestrator for VIN decoding, integrating with BMW configurator CDN and owners-manuals.bmw.com.
- **bimmer.work / mdecoder / vindecoderz**: Fallback VIN decoders for non-ETK-covered VINs.
- **Carvertical**: For mileage link affiliate integration.
- **Shopify**: For real-time stock checks on mperformance.parts.
- **Replit Object Storage**: For backup storage.
- **S3-compatible storage**: Optional offsite backup mirror.
- **Telegram / Email**: For backup alerts.