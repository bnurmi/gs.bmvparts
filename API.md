# BMV.parts — Full API Reference

> **Base URL (production):** `https://bmv.parts`  
> **Base URL (development):** `http://localhost:5000`

---

## Auth Levels

| Label | Meaning |
|---|---|
| 🔓 Public | No credentials required |
| 🔑 Session | Requires a logged-in session cookie (`requireAuth`) |
| 🛡 Admin | Requires admin role session (`requireAdmin`) |
| 🔑+🛡 Admin/Key | Accepts either admin session **or** `BMV_ACCOUNT_PROVISION_KEY` header (`requireAdminOrProvisionKey`) |
| 🗝 API Key | Requires `X-API-Key` header (`requireApiKey`); tier restrictions noted separately |
| 🔐 Provision Key | Requires `BMV_ACCOUNT_PROVISION_KEY` header (`requireProvisionKey`) |
| 🏥 Health Token | Requires `X-Backup-Health-Token` header (`requireBackupHealthToken`) |

---

## Table of Contents

1. [Catalog — Cars & Models](#1-catalog--cars--models)
2. [Catalog — Parts](#2-catalog--parts)
3. [Catalog — Chassis & Series](#3-catalog--chassis--series)
4. [Catalog — BMW Models (ETK type codes)](#4-catalog--bmw-models-etk-type-codes)
5. [VIN Decoding & Enrichment](#5-vin-decoding--enrichment)
6. [Search](#6-search)
7. [Authentication](#7-authentication)
8. [User Profile](#8-user-profile)
9. [FAQ (AI-generated)](#9-faq-ai-generated)
10. [BMV-VIN Guides & Glossary](#10-bmv-vin-guides--glossary)
11. [Stats & Catalog Status](#11-stats--catalog-status)
12. [External API v1 (API-Key gated)](#12-external-api-v1-api-key-gated)
13. [Account Provisioning](#13-account-provisioning)
14. [AI Integrations](#14-ai-integrations)
15. [Sitemaps & Crawl](#15-sitemaps--crawl)
16. [Redirects & Tracking](#16-redirects--tracking)
17. [Admin — Users & API Keys](#17-admin--users--api-keys)
18. [Admin — Backups](#18-admin--backups)
19. [Admin — Pricing Sync](#19-admin--pricing-sync)
20. [Admin — SEO Content](#20-admin--seo-content)
21. [Admin — Google Search Console](#21-admin--google-search-console)
22. [Admin — ISTA Ingest](#22-admin--ista-ingest)
23. [Admin — RealOEM Backfill](#23-admin--realoem-backfill)
24. [Admin — Part Appearances](#24-admin--part-appearances)
25. [Admin — Proxy & Scraping](#25-admin--proxy--scraping)
26. [Admin — Bimmer.work Bulk Discovery](#26-admin--bimmerwork-bulk-discovery)
27. [Admin — VIN Enrichment Ops](#27-admin--vin-enrichment-ops)
28. [Admin — Background Jobs](#28-admin--background-jobs)
29. [Admin — FAQ Management](#29-admin--faq-management)
30. [Admin — Misc / One-off Ops](#30-admin--misc--one-off-ops)
31. [AI Photo Quote Generator](#31-ai-photo-quote-generator)
32. [MPerformance Partner Quote Proxy](#32-mperformance-partner-quote-proxy)
33. [Internal / Unlisted Endpoints](#33-internal--unlisted-endpoints)

---

## 1. Catalog — Cars & Models

### `GET /api/catalog/status`
🔓 Public  
Returns freshness metadata for the catalog (last scrape timestamps, record counts).

### `GET /api/cars`
🔓 Public  
Returns all car models. Supports `?series=`, `?chassis=`, `?limit=`, `?offset=` query params.

### `GET /api/cars/homepage`
🔓 Public  
Returns a curated subset of car models for the homepage feature grid.

### `GET /api/cars/seo/:slug`
🔓 Public  
Returns car details by SEO-friendly slug (e.g. `bmw-e90-320i`). Used by SSR middleware for meta tags.

### `GET /api/cars/:idOrSlug`
🔓 Public  
Returns a single car by numeric ID or slug. Includes model metadata, series, and chassis code.

### `GET /api/cars/:id/categories`
🔓 Public  
Returns top-level part categories for a given car ID.

### `GET /api/categories/:id/subcategories`
🔓 Public  
Returns subcategories under a given category ID.

### `GET /api/subcategories/:id/parts`
🔓 Public  
Returns all parts listed under a given subcategory ID.

### `GET /api/cars/:id/parts`
🔓 Public  
Returns all parts for a car, flattened across all subcategories. May be large — paginated.

---

## 2. Catalog — Parts

### `GET /api/parts/external/:partNumberClean`
🔓 Public  
Looks up a part number across external catalogs (RealOEM, ETK). Returns pricing hints and listing URLs. `partNumberClean` is the OEM part number with spaces and hyphens stripped.

### `GET /api/parts/external-search`
🔓 Public  
Query: `?q=<search term>` — searches external catalogs by keyword.

### `GET /api/parts/external-catalog/stats`
🔓 Public  
Returns aggregate stats for the external catalog index (row counts, last-updated timestamps).

### `GET /api/parts/cross-reference/:partNumberClean`
🔓 Public  
Returns all cars a part number appears on. Used by the cross-reference panel.

### `GET /api/parts/mperformance/:partNumberClean`
🔓 Public  
Checks live Shopify stock for `mperformance.parts` for a given OEM part number. Returns availability + price from the M Performance storefront.

### `GET /api/parts/pricing/:partNumberClean`
🔑 Session (logged-in users only)  
Returns aggregated pricing data (BMWPartsDeal, LLLParts) for a part number.

### `POST /api/parts/identify`
🔑 Session  
Body: `{ image: "<base64 PNG/JPG>", context?: string }`  
Sends an image to GPT-4o Vision and returns the likely BMW OEM part number(s) and description. 50 MB body limit.

### `GET /api/parts/realoem-check/:partNumberClean`
🛡 Admin  
Internal check: returns whether a part number is indexed in the RealOEM scrape table.

---

## 3. Catalog — Chassis & Series

### `GET /api/chassis`
🔓 Public  
Returns all known chassis codes with metadata (series, body style, production years, model count).

### `GET /api/chassis/seo/:code`
🔓 Public  
Returns chassis SEO metadata for a given chassis code (e.g. `E90`). Used by SSR middleware.

### `GET /api/chassis/:chassisCode`
🔓 Public  
Returns full detail for a single chassis code, including associated car models and part counts.

### `GET /api/series`
🔓 Public  
Returns all series (1 Series, 3 Series, M, etc.) with model counts.

### `GET /api/series/:slug`
🔓 Public  
Returns detail for a single series by slug (e.g. `3-series`).

### `GET /api/series/seo/:slug`
🔓 Public  
Returns series SEO metadata by slug. Used by SSR middleware for meta tags.

### `GET /api/models/seo`
🔓 Public  
Returns SEO metadata for all model pages in a single batch. Used to pre-render sitemap entries.

---

## 4. Catalog — BMW Models (ETK type codes)

### `GET /api/bmw-models`
🔓 Public  
Returns BMW ETK model records (chassis + type code combinations). Supports `?chassis=`, `?limit=`, `?offset=`.

### `GET /api/bmw-models/stats`
🔓 Public  
Returns count of ETK model records indexed per chassis.

### `GET /api/bmw-models/:chassis/:typeCode`
🔓 Public  
Returns a single ETK model record by chassis code and type code.

### `POST /api/bmw-models/scrape`
🛡 Admin  
Triggers a fresh scrape of BMW ETK for model metadata.

### `DELETE /api/bmw-models/scrape`
🛡 Admin  
Cancels an in-progress model scrape.

### `POST /api/bmw-models/import-legacy`
🛡 Admin  
Body: JSON legacy model list. Imports historical model data from a legacy export.

---

## 5. VIN Decoding & Enrichment

### `POST /api/vin/decode`
🔓 Public  
Body: `{ vin: string }`  
Decodes a full 17-character VIN. Returns make, model, year, engine, transmission, and production spec where available.

### `GET /api/vin/decode/:vin`
🔓 Public  
Same as POST variant but via URL param. Useful for link sharing and prefetch.

### `GET /api/vin/bimmerwork/:vin`
🔓 Public  
Fetches raw data from bimmer.work / bvzine for a VIN. Returns build sheet data including options and factory codes.

### `GET /api/vin/enrich/:vin`
🔓 Public  
Triggers full VIN enrichment pipeline (bvzine, BMW CDN, BMW manuals portal, vindecoderz). Returns aggregated data and caches the result. Long-running — may take several seconds on cold VINs.

### `GET /api/vin/queue-status/:vin`
🔓 Public  
Returns the enrichment queue status for a VIN (pending / in-progress / complete / error).

### `GET /api/vin/proxy-image`
🔓 Public  
Query: `?url=<encoded image URL>`  
Proxy for fetching VIN-associated images from BMW CDN and owner manual portals. Avoids CORS restrictions on the frontend.

### `GET /api/vin/debug/:vin`
🛡 Admin  
Returns full internal enrichment state for a VIN: all source responses, error logs, cache contents, and proxy routing decisions.

---

## 6. Search

### `GET /api/search`
🔓 Public  
Query: `?q=<term>&type=<cars|parts|all>`  
Global full-text search across cars and parts. Uses PostgreSQL GIN trigram indexes. Returns ranked results.

---

## 7. Authentication

### `POST /api/auth/login`
🔓 Public  
Body: `{ username: string, password: string }`  
Creates a session. Returns `{ user }` on success or `401` on bad credentials.

### `POST /api/auth/logout`
🔓 Public  
Destroys the current session.

### `GET /api/auth/me`
🔓 Public  
Returns the currently authenticated user object, or `{ user: null }` if unauthenticated.

### `POST /api/auth/register`
🔓 Public  
Body: `{ username, password, email }`  
Creates a new user account.

### `POST /api/auth/forgot-password`
🔓 Public  
Body: `{ email: string }`  
Sends a password reset email if the address is registered.

### `GET /api/auth/reset-password/validate`
🔓 Public  
Query: `?token=<reset token>`  
Validates a password reset token before presenting the reset form.

### `POST /api/auth/reset-password`
🔓 Public  
Body: `{ token: string, password: string }`  
Completes password reset using the emailed token.

### `GET /api/auth/gearswap`
🔓 Public  
Initiates OAuth flow for Gearswap integration (SSO).

### `GET /api/auth/gearswap/callback`
🔓 Public  
OAuth callback handler for Gearswap SSO. Exchanges code for session.

---

## 8. User Profile

### `GET /api/my-cars`
🔑 Session  
Returns the authenticated user's saved cars list.

### `POST /api/my-cars`
🔑 Session  
Body: `{ carId: number, nickname?: string, notes?: string }`  
Saves a car to the user's garage.

### `PATCH /api/my-cars/:id`
🔑 Session  
Body: partial `{ nickname, notes }`  
Updates metadata on a saved car entry.

### `DELETE /api/my-cars/:id`
🔑 Session  
Removes a car from the user's garage.

---

## 9. FAQ (AI-generated)

### `GET /api/faq`
🔓 Public  
Query: `?pageType=<chassis|series|part|vin|hub>&pageKey=<key>&locale=<en|de|fr|...>`  
Returns a cached AI-generated FAQ for a page. Returns empty if not yet generated. Silently returns `{ questions: [] }` on miss — generation is deferred to SSR middleware or admin trigger.

---

## 10. BMV-VIN Guides & Glossary

These serve the `bmv.vin` vanity host content.

### `GET /api/bmv-vin/guides`
🔓 Public  
Returns all published VIN decoder guides (list with slugs, titles, summaries).

### `GET /api/bmv-vin/guides/:slug`
🔓 Public  
Returns full content for a single guide by slug.

### `GET /api/bmv-vin/glossary`
🔓 Public  
Returns all VIN glossary terms.

### `GET /api/bmv-vin/glossary/:term`
🔓 Public  
Returns definition and detail for a single glossary term.

---

## 11. Stats & Catalog Status

### `GET /api/stats`
🔓 Public  
Returns high-level catalog counts: total cars, parts, chassis codes, VINs decoded.

### `GET /api/v1/stats`
🗝 API Key (basic tier)  
Same data as `/api/stats` but authenticated, for API consumers tracking catalog freshness.

### `GET /api/settings/carvertical`
🔓 Public  
Returns the Carvertical affiliate configuration (link template, whether affiliate mode is enabled). Used to render mileage report links.

---

## 12. External API v1 (API-Key gated)

All `/api/v1/*` routes require the `X-API-Key` header. Tier restrictions:

| Tier | Access |
|---|---|
| `basic` | Cars list, VIN decode, category browse, stats |
| `paid` | Parts data, full-text search, cross-reference |
| `admin` | Pricing endpoint |

### `GET /api/v1/cars`
🗝 API Key — basic  
Same as `/api/cars`. Paginated catalog of all car models.

### `GET /api/v1/cars/:idOrSlug`
🗝 API Key — basic  
Single car by ID or slug.

### `GET /api/v1/cars/:id/categories`
🗝 API Key — basic  
Part categories for a car.

### `GET /api/v1/categories/:id/subcategories`
🗝 API Key — basic  
Subcategories under a category.

### `GET /api/v1/subcategories/:id/parts`
🗝 API Key — **paid**  
Parts for a subcategory.

### `GET /api/v1/search`
🗝 API Key — **paid**  
Global search. Query: `?q=<term>`.

### `GET /api/v1/parts/cross-reference/:partNumberClean`
🗝 API Key — **paid**  
Cross-reference a part number across all car models.

### `GET /api/v1/parts/pricing/:partNumberClean`
🗝 API Key — **admin tier only**  
Pricing data for a part number.

### `GET /api/v1/vin/decode/:vin`
🗝 API Key — basic  
VIN decode result. Same data as the public endpoint but rate-limited per key.

---

## 13. Account Provisioning

Used by automated systems to create API accounts in bulk.

### `POST /api/v1/accounts/provision`
🔐 Provision Key  
Body: `{ username, email, tier }`  
Creates a single API account and returns the generated API key.

### `POST /api/v1/accounts/provision/batch`
🔐 Provision Key  
Body: `{ accounts: [{ username, email, tier }] }`  
Batch-provisions multiple API accounts in one call.

### `GET /api/v1/accounts/status`
🔐 Provision Key  
Query: `?username=<name>` or `?email=<addr>`  
Returns account status and tier for a provisioned account.

---

## 14. AI Integrations

Backed by Replit AI Integrations / OpenAI. No BMV-specific auth guard on these — they rely on the overall session or are accessed internally.

### `POST /api/generate-image`
🔓 Public (internal use)  
Body: `{ prompt: string, size?: "256x256"|"512x512"|"1024x1024" }`  
Generates an image via OpenAI `gpt-image-1`. Returns `{ url, b64_json }`.

### `GET /api/conversations`
🔓 Public (internal use)  
Returns all AI chat conversations.

### `GET /api/conversations/:id`
🔓 Public  
Returns a single conversation with its full message history.

### `POST /api/conversations`
🔓 Public  
Body: `{ title?: string }`  
Creates a new chat conversation.

### `DELETE /api/conversations/:id`
🔓 Public  
Deletes a conversation and all its messages.

### `POST /api/conversations/:id/messages` — Text (SSE)
🔓 Public  
Body: `{ content: string }`  
Sends a text message to a conversation. Streams GPT-5.1 response as Server-Sent Events.  
Event format: `data: { content: "..." }` while streaming, then `data: { done: true }`.

### `POST /api/conversations/:id/messages` — Voice (SSE)
🔓 Public  
Body: `{ audio: "<base64 audio>", voice?: "alloy"|... }` (50 MB limit)  
Transcribes audio via `gpt-4o-mini-transcribe`, sends to conversation context, streams back both text transcript and PCM16 audio chunks via SSE.  
Event types: `user_transcript`, `transcript`, `audio`, `done`, `error`.

---

## 15. Sitemaps & Crawl

### `GET /robots.txt`
🔓 Public  
Dynamic robots.txt. Behaviour differs by host (`bmv.parts` vs `bmv.vin`).

### `GET /sitemap.xml`
🔓 Public  
Master sitemap index. Links to sub-sitemaps.

### `GET /sitemap-pages.xml`
🔓 Public  
Static pages sitemap (home, VIN decoder, about, etc.).

### `GET /sitemap-cars.xml`
🔓 Public  
Car model pages sitemap.

### `GET /sitemap-chassis.xml`
🔓 Public  
Chassis hub pages sitemap.

### `GET /sitemap-parts-:page.xml`
🔓 Public  
Paginated parts sitemap. `:page` is a 1-based integer (e.g. `/sitemap-parts-1.xml`).

### `GET /sitemap-vins-:page.xml`
🔓 Public  
Paginated VIN landing pages sitemap.

---

## 16. Redirects & Tracking

### `GET /decode`
🔓 Public  
Redirects to the VIN decode landing page. Preserves any `?vin=` query param. Used for short URL sharing.

### `GET /go`
🔓 Public  
Query: `?to=<destination>&ref=<source>&pid=<part>`  
Affiliate / outbound link tracker. Logs the click and redirects to the destination.

---

## 17. Admin — Users & API Keys

### `GET /api/admin/users`
🛡 Admin  
Returns all registered users with roles and metadata.

### `POST /api/admin/users`
🛡 Admin  
Body: `{ username, email, password, role }`  
Creates a user account directly (bypasses registration email flow).

### `PATCH /api/admin/users/:id`
🛡 Admin  
Body: partial user fields (role, email, active status).

### `DELETE /api/admin/users/:id`
🛡 Admin  
Permanently deletes a user account.

### `GET /api/admin/api-keys`
🛡 Admin  
Returns all issued API keys with owner, tier, usage counts.

### `POST /api/admin/api-keys`
🛡 Admin  
Body: `{ userId, tier, label }`  
Issues a new API key. Returns the raw key (only shown once).

### `PATCH /api/admin/api-keys/:id`
🛡 Admin  
Body: `{ tier?, label?, active? }`  
Updates API key tier or deactivates a key.

### `DELETE /api/admin/api-keys/:id`
🛡 Admin  
Revokes and deletes an API key.

---

## 18. Admin — Backups

### `GET /api/admin/backups`
🛡 Admin  
Lists all backup records (DB, files, code, assets) with timestamps and storage locations.

### `POST /api/admin/backups/run-db`
🛡 Admin  
Triggers an immediate PostgreSQL database backup to Replit Object Storage.

### `POST /api/admin/backups/run-files`
🛡 Admin  
Triggers an immediate file-system snapshot backup.

### `POST /api/admin/backups/run-code`
🛡 Admin  
Triggers a git-bundle code archive backup.

### `POST /api/admin/backups/run-assets-full`
🛡 Admin  
Triggers a full assets backup (images, diagrams).

### `GET /api/admin/backups/settings`
🛡 Admin  
Returns current backup schedule, retention settings, and offsite config.

### `POST /api/admin/backups/retention`
🛡 Admin  
Body: `{ keepDays: number }`  
Updates backup retention window.

### `POST /api/admin/backups/schedule`
🛡 Admin  
Body: `{ cronExpression: string }`  
Updates the automatic backup schedule.

### `POST /api/admin/backups/test-offsite`
🛡 Admin  
Tests connectivity to the offsite S3-compatible mirror.

### `GET /api/admin/backups/restore/:id`
🛡 Admin  
Returns restore preview metadata for a backup entry.

### `POST /api/admin/backups/restore/:id`
🛡 Admin  
Initiates restore from a backup entry. Destructive.

### `POST /api/admin/backup/pre-deploy`
🏥 Health Token  
Called by automated pre-deploy hooks. Runs a DB backup before publishing.

### `GET /api/admin/backup/health`
🏥 Health Token  
Returns backup system health: last backup age, offsite sync status, storage usage.

---

## 19. Admin — Pricing Sync

### `GET /api/admin/pricing-sync/status`
🛡 Admin  
Returns current state of the background pricing sync job (idle / running / progress %).

### `POST /api/admin/pricing-sync/start`
🛡 Admin  
Body: `{ chassis?: string }`  
Starts a pricing sync from BMWPartsDeal / LLLParts. Optional chassis filter to restrict scope.

### `POST /api/admin/pricing-sync/stop`
🛡 Admin  
Stops the in-progress pricing sync.

---

## 20. Admin — SEO Content

### `GET /api/admin/seo/category-editorial`
🛡 Admin  
Lists all category editorial content entries (hand-written SEO copy for part categories).

### `POST /api/admin/seo/category-editorial`
🛡 Admin  
Body: `{ categoryId, content, locale }`  
Creates or updates editorial copy for a part category.

### `DELETE /api/admin/seo/category-editorial/:id`
🛡 Admin  
Deletes an editorial entry.

### `GET /api/admin/seo/part-notes`
🛡 Admin  
Query: `?partNumberClean=<pn>`  
Lists part-level SEO notes.

### `POST /api/admin/seo/part-notes`
🛡 Admin  
Body: `{ partNumberClean, note, locale }`  
Creates or updates a part note.

### `DELETE /api/admin/seo/part-notes/:partNumberClean`
🛡 Admin  
Deletes part notes for a given part number.

### `GET /api/admin/seo/hub-editorial`
🛡 Admin  
Lists all hub page editorial content (chassis / series landing pages).

### `POST /api/admin/seo/hub-editorial`
🛡 Admin  
Body: `{ hubType, hubKey, content, locale }`  
Creates or updates editorial copy for a hub page.

### `DELETE /api/admin/seo/hub-editorial/:id`
🛡 Admin  

### `GET /api/admin/seo/language-stats`
🛡 Admin  
Query: `?locale=<code>`  
Returns SEO coverage stats — how many pages have editorial content in a given locale.

### `GET /api/admin/seo/health`
🛡 Admin  
Returns overall SEO health score: pages missing titles, descriptions, or editorial copy.

### `GET /api/admin/seo/preview/:partNumberClean`
🛡 Admin  
Returns the fully assembled server-rendered SEO payload for a part detail page (title, description, JSON-LD, editorial copy) without hitting the SSR middleware.

---

## 21. Admin — Google Search Console

### `GET /api/admin/gsc/status`
🛡 Admin  
Returns whether GSC credentials are configured and the account they're linked to.

### `POST /api/admin/gsc/credentials`
🛡 Admin  
Body: `{ clientId, clientSecret }`  
Saves OAuth2 client credentials for GSC. Initiates auth flow.

### `POST /api/admin/gsc/save-credentials`
🛡 Admin  
Body: `{ accessToken, refreshToken, expiry }`  
Stores OAuth tokens after completing the GSC consent screen.

### `DELETE /api/admin/gsc/credentials`
🛡 Admin  
Removes stored GSC credentials.

### `GET /api/admin/gsc/search-analytics`
🛡 Admin  
Query: `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&dimensions=page,query`  
Pulls search analytics data from the GSC API.

### `GET /api/admin/gsc/coverage`
🛡 Admin  
Query: `?page=<url>`  
Returns index coverage status for a URL from GSC.

### `POST /api/admin/gsc/recommend`
🛡 Admin  
Body: `{ context: string }`  
Asks GPT-4o to generate SEO recommendations based on GSC data context. Returns suggestions JSON.

---

## 22. Admin — ISTA Ingest

ISTA (BMW's ISPI diagnostics database) quarterly ingest pipeline.

### `GET /api/admin/ista/status`
🛡 Admin  
Returns the ingest worker status: last run timestamp, version processed, record counts.

### `POST /api/admin/ista/import`
🛡 Admin  
Triggers a full ISTA package ingest from Object Storage. Processes `DiagDocDb.sqlite` + `xmlvalueprimitive_ENUS.sqlite`, upserts SSP and FUB records.

### `POST /api/admin/ista/import/dry-run`
🛡 Admin  
Same pipeline as full import but writes no records — returns a diff preview of what would change.

### `GET /api/admin/ista/runs`
🛡 Admin  
Lists all ISTA ingest run records with status, version, and timing.

### `POST /api/admin/ista/runs`
🛡 Admin  
Body: `{ version: string }`  
Manually registers an ISTA run record (used for bookkeeping when importing outside the scheduler).

### `POST /api/admin/ista/scan`
🛡 Admin  
Scans the `BMV-Bucket` Object Storage bucket for new `.istapackage` files and returns discovered versions without ingesting.

---

## 23. Admin — RealOEM Backfill

Backfill pipeline for parts data sourced from RealOEM.

### `GET /api/admin/realoem-backfill/status`
🔑+🛡 Admin/Key  
Returns current backfill job status (idle / running / chassis progress / ETA).

### `POST /api/admin/realoem-backfill/estimate`
🔑+🛡 Admin/Key  
Body: `{ chassis?: string[] }`  
Returns an estimated count of parts to backfill for given chassis codes.

### `POST /api/admin/realoem-backfill/run`
🔑+🛡 Admin/Key  
Body: `{ chassis?: string[], limit?: number }`  
Starts the RealOEM backfill. Respects `LAUNCH_RESERVE` budget.

### `POST /api/admin/realoem-backfill/cancel`
🔑+🛡 Admin/Key  
Cancels the running backfill.

### `GET /api/admin/realoem-backfill/runs`
🔑+🛡 Admin/Key  
Lists all backfill run records with per-chassis stats.

### `GET /api/admin/realoem-backfill/runs/:id/inserts.csv`
🔑+🛡 Admin/Key  
Downloads a CSV of all parts inserted during a given run.

### `GET /api/admin/realoem-backfill/dedup-preview`
🔑+🛡 Admin/Key  
Query: `?chassis=<code>`  
Returns a preview of duplicate parts that would be removed by dedup.

### `GET /api/admin/realoem-backfill/dedup-chassis`
🔑+🛡 Admin/Key  
Returns per-chassis duplicate counts.

### `POST /api/admin/realoem-backfill/mark-skip`
🔑+🛡 Admin/Key  
Body: `{ chassis: string }`  
Marks a chassis code as skip — excluded from future backfill runs.

### `GET /api/admin/catalog-coverage`
🔑+🛡 Admin/Key  
Returns a coverage table: for every chassis, how many parts are indexed vs expected from RealOEM.

---

## 24. Admin — Part Appearances

Tracks which car models each part number appears on (cross-reference table builder).

### `GET /api/admin/part-appearances/status`
🔑+🛡 Admin/Key  
Returns job status for the appearances rebuild.

### `POST /api/admin/part-appearances/start`
🔑+🛡 Admin/Key  
Body: `{ chassis?: string[] }`  
Starts the appearances rebuild for given chassis codes (or all if omitted).

### `POST /api/admin/part-appearances/cancel`
🔑+🛡 Admin/Key  
Cancels the running appearances job.

### `GET /api/admin/part-appearances/coverage`
🔑+🛡 Admin/Key  
Query: `?chassis=<code>`  
Returns coverage stats: how many parts have appearance records vs total.

---

## 25. Admin — Proxy & Scraping

### `GET /api/admin/proxy/status`
🛡 Admin  
Returns health and configuration for all configured proxy channels (Evomi Core, Evomi Premium, Oxylabs) plus `vindecoderzEnabled` flag.

### `GET /api/admin/proxy/usage`
🛡 Admin  
Returns per-proxy bandwidth and request usage for the current billing period.

### `GET /api/scrape-status`
🛡 Admin  
Returns status of the active scrape worker (progress, current chassis, queue depth).

### `GET /api/scrape-proxy`
🛡 Admin  
Query: `?url=<encoded URL>`  
Proxies a single scrape request through the configured proxy chain and returns the raw response. Used for debugging proxy routing.

### `POST /api/scrape-proxy`
🛡 Admin  
Body: `{ url: string, scraper?: string }`  
Same as GET variant but via POST. Allows passing scraper key to select proxy channel.

### `POST /api/batch-scrape`
🛡 Admin  
Body: `{ chassis: string[], options?: object }`  
Enqueues a batch scrape job across multiple chassis codes.

### `POST /api/admin/realoem/scrape-chassis/:chassis`
🛡 Admin  
Triggers an immediate RealOEM scrape for a single chassis code.

### `GET /api/admin/realoem/scrape-status/:chassis`
🛡 Admin  
Returns live scrape status for a chassis.

### `GET /api/admin/realoem/scrape-jobs`
🛡 Admin  
Lists all active and queued scrape jobs.

### `GET /api/admin/realoem/cache`
🛡 Admin  
Query: `?key=<cache key>`  
Inspects the RealOEM HTTP cache entry for a given key.

### `GET /api/admin/realoem/budget`
🛡 Admin  
Returns remaining scrape budget (requests remaining before throttle kicks in).

### `POST /api/admin/realoem/refresh-vin/:vin`
🛡 Admin  
Forces a fresh scrape of VIN-specific RealOEM data, bypassing cache.

### `POST /api/cars/:id/scrape`
🔓 Public (no auth guard — internal worker use)  
Triggers a scrape for a single car ID. Used by the catalog importer worker.

### `DELETE /api/cars/:id/scrape`
🔓 Public (no auth guard — internal worker use)  
Cancels a pending scrape for a car ID.

---

## 26. Admin — Bimmer.work Bulk Discovery

### `POST /api/admin/bimmerwork/bulk-discover`
🛡 Admin  
Body: `{ vins: string[] }`  
Submits a list of VINs for bulk lookup via bimmer.work / bvzine. Runs concurrently with rate limiting.

### `GET /api/admin/bimmerwork/bulk-discover/status`
🛡 Admin  
Returns progress of the running bulk discovery job (processed / total / errors).

---

## 27. Admin — VIN Enrichment Ops

### `GET /api/admin/vin-enrichment-stats`
🛡 Admin  
Returns enrichment coverage: VINs decoded, VINs with full build data, breakdown by source.

### `GET /api/admin/vin-coverage-gaps`
🛡 Admin  
Query: `?chassis=<code>&limit=<n>`  
Lists VINs that have partial or missing enrichment data for investigation.

### `GET /api/admin/dictionaries/stats`
🛡 Admin  
Returns stats for the VIN option code dictionaries (how many codes are mapped, unmapped, locale coverage).

### `POST /api/admin/dictionaries/import`
🛡 Admin  
Imports a fresh set of BMW option code dictionaries from the internal data source.

### `POST /api/admin/vin-factory-options/import`
🛡 Admin  
Body: `{ data: object[] }`  
Imports factory option records (S-codes, X-codes) for VINs.

### `POST /api/admin/fix-vin-years`
🛡 Admin  
One-off: corrects year values in the VIN cache where the ETK year differed from the decoded year.

### `POST /api/admin/migrate-vin-images`
🛡 Admin  
Migrates VIN-associated images from old storage paths to the current Object Storage convention.

---

## 28. Admin — Background Jobs

### `GET /api/admin/background-jobs`
🛡 Admin  
Returns all records from the `background_jobs` table with status, progress, and last heartbeat. Used by the admin dashboard to show running operations.

### `GET /api/admin/resume-incomplete/status`
🛡 Admin  
Returns which incomplete scrape/backfill jobs are eligible for auto-resume.

### `POST /api/admin/resume-incomplete/start`
🛡 Admin  
Starts auto-resume for all incomplete jobs.

### `POST /api/admin/resume-incomplete/auto-restart`
🔓 Public (no auth guard — called by internal health check loop)  
Internal endpoint. Triggers auto-restart of stuck background jobs. Not intended for external callers.

### `POST /api/admin/resume-incomplete/stop`
🛡 Admin  
Stops the auto-resume coordinator.

---

## 29. Admin — FAQ Management

### `GET /api/admin/faq/list`
🛡 Admin  
Query: `?pageType=<type>&locale=<code>`  
Lists cached AI FAQ entries, optionally filtered by page type and locale.

### `POST /api/admin/faq/regenerate`
🛡 Admin  
Body: `{ pageType: string, pageKey: string, locale: string }`  
Force-regenerates the AI FAQ for a specific page/locale combination, overwriting the cache.

---

## 30. Admin — Misc / One-off Ops

### `POST /api/test-email`
🛡 Admin  
Body: `{ to: string, subject?: string }`  
Sends a test email via the configured SMTP transport.

### `POST /api/admin/settings/carvertical`
🛡 Admin  
Body: `{ affiliateId?, enabled? }`  
Updates Carvertical affiliate link settings.

### `GET /api/admin/link-clicks/stats`
🛡 Admin  
Query: `?since=<ISO date>`  
Returns outbound link click stats aggregated by destination and referrer.

### `GET /api/admin/model-image-stats`
🛡 Admin  
Returns counts of car models with and without associated hero images.

### `GET /api/admin/cars/type-code-report`
🛡 Admin  
Returns a report of chassis/type-code combinations missing from the ETK model table.

### `POST /api/admin/cars/type-code-backfill`
🛡 Admin  
Starts a backfill that assigns type codes to car records that are missing them.

### `POST /api/dedup-categories`
🛡 Admin  
Deduplicates part categories that have identical names within the same car.

### `POST /api/recalculate-counts`
🛡 Admin  
Recalculates parts-per-category and parts-per-car counts across the entire catalog.

### `POST /api/rescrape-parts`
🛡 Admin  
Body: `{ chassis?: string }`  
Re-queues parts scraping for cars whose parts count is zero or stale.

### `POST /api/enrich-empty`
🛡 Admin  
Starts the empty-part enrichment pass (fills in missing descriptions via AI/external lookup).

### `GET /api/enrich-empty/status`
🛡 Admin  
Returns enrichment pass progress.

### `POST /api/enrich-empty/cancel`
🛡 Admin  
Cancels the enrichment pass.

### `POST /api/realoem-crossref/start`
🛡 Admin  
Starts the RealOEM cross-reference builder (maps OEM part numbers to RealOEM IDs).

### `GET /api/realoem-crossref/status`
🛡 Admin  
Returns cross-reference builder progress.

### `POST /api/realoem-crossref/cancel`
🛡 Admin  
Cancels the cross-reference builder.

### `GET /api/realoem-crossref/stats`
🛡 Admin  
Returns cross-reference coverage stats.

### `POST /api/admin/reset-stuck-scrapes`
🛡 Admin  
Resets any scrape jobs that have been in `running` state longer than the timeout threshold.

---

## 31. AI Photo Quote Generator

Requires a **paid or admin** account (`requireAuth` + `requirePaidAccess`). Unauthenticated or free-tier requests receive `403`. The `/quote` page shows a sales landing to unpaid visitors and the tool itself to paid/admin users.

`requirePaidAccess` passes if: the session user has role `admin`, **or** the session user owns at least one API key with tier `paid` or `admin`.

### `POST /api/vendor/photo-quote`
🔑 Session + Paid access  
Body (JSON, 50 MB limit):

```json
{
  "vehicle": "BMW M3 G80",
  "vin": "WBS...",
  "photos": ["<base64 image>", "..."],
  "customerName": "Jane Smith",
  "customerEmail": "jane@example.com",
  "customerPhone": "+44 7700 900000",
  "customerPostcode": "SW1A 1AA",
  "vehicleYear": 2022,
  "vehicleColour": "Frozen Portimao Blue"
}
```

- `vehicle` — required. Free-text model description passed to GPT-4o vision prompt.
- `photos` — required. Array of base64-encoded images (JPEG/PNG/WebP). Maximum 20.
- All customer and vehicle fields are optional.

**What it does:**
1. Sends photos + vehicle context to GPT-4o Vision (`analyzePhotoDamage`) to detect damaged zones and likely affected OEM parts.
2. Matches detected parts against the `parts` + `part_pricing` tables using trigram similarity (`matchDetectedParts`).
3. Calculates totals (BMW list price vs BMV price vs saving).
4. Persists the quote to the `photo_quotes` table with a UUID `quoteRef`.
5. Fire-and-forget: submits the quote to MPerformance.parts partner lead API in the background.

**Response `201`:**
```json
{
  "quote_id": 42,
  "quote_ref": "uuid-v4",
  "vehicle": "BMW M3 G80",
  "vin": "WBS...",
  "detected_parts": [
    {
      "partNumber": "51117377352",
      "description": "Front bumper trim",
      "qty": 1,
      "bmwListPrice": 320.00,
      "ourPrice": 271.50,
      "saving": 48.50
    }
  ],
  "analysis_notes": [
    { "damage_location": "front-left", "notes": "Dent may require panel replacement", "status": "review" }
  ],
  "total_bmw_new": 320.00,
  "total_our_price": 271.50,
  "total_saving": 48.50,
  "csv_url": null
}
```

### `GET /api/vendor/photo-quote`
🔑 Session + Paid access  
Returns the authenticated user's quote history (list). The `aiAnalysisJson` field is stripped from list responses for brevity.

**Response:**
```json
[
  {
    "id": 42,
    "quoteRef": "uuid-v4",
    "vehicle": "BMW M3 G80",
    "totalOurPrice": "271.50",
    "createdAt": "2026-05-29T21:00:00Z"
  }
]
```

### `GET /api/vendor/photo-quote/:id`
🔑 Session + Paid access  
Returns a single quote by numeric ID including the full `aiAnalysisJson`. Returns `403` if the quote belongs to a different user (admin can access any quote).

### `PATCH /api/vendor/photo-quote/:id/rows`
🔑 Session + Paid access  
Body: `{ "quoteRows": [...] }` (2 MB limit)  
Replaces the quote's line items with an edited set (used when the user modifies quantities or removes parts in the review table). Recalculates totals and persists.

**Response:** Full updated quote object.

### `GET /api/vendor/photo-quote/:id/csv`
🔑 Session + Paid access  
Downloads the quote as a UTF-8 BOM CSV in M Performance Parts format. `Content-Disposition: attachment; filename="quote-<ref>.csv"`. Returns `403` for other users' quotes.

---

## 32. MPerformance Partner Quote Proxy

### `POST /api/partner/mp-quote`
🔓 Public (no session required)  
Server-side proxy that forwards a quote request to the MPerformance.parts partner lead API. The partner API key (`MPERF_PARTNER_API_KEY` / `QUOTE_PARTS_API_KEY`) is never exposed to the browser.

Used by the **Request a Quote** modal on part detail pages — available to all visitors, no login needed.

**Body:**
```json
{
  "fullName": "John Smith",
  "email": "john@example.com",
  "phone": "+44 7700 900000",
  "shippingPostcode": "M1 1AA",
  "notes": "Prefer OEM, not aftermarket",
  "partNumber": "51117377352",
  "partDescription": "Front bumper trim",
  "vehicleMake": "BMW",
  "vehicleModel": "M3",
  "vehicleSeries": "G80",
  "vehicleYear": 2022
}
```

Required: `fullName`, `email`, `phone`, `partNumber`.  
Optional: `shippingPostcode`, `notes`, `vehicleMake`, `vehicleModel`, `vehicleSeries`, `vehicleYear`.

**Response `200`:**
```json
{ "referenceNumber": "MP-2026-XXXXX" }
```

Returns `503` if the partner API key env var is not set. Returns `400` with field-level validation errors on bad input.

---

## 33. Internal / Unlisted Endpoints

These endpoints exist but are **not advertised** and are used by internal workers, scripts, or legacy tooling.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/export` | 🛡 Admin | Streams full catalog export as chunked JSON. Used by the data export pipeline. |
| `POST` | `/api/import` | 🛡 Admin | Bulk-imports chunked catalog data. 500 MB body limit. |
| `GET` | `/api/sync-from-dev/status` | 🔓 None | Returns sync-from-dev job status. No auth guard — internal VM use only. |
| `POST` | `/api/sync-from-dev` | 🔓 None | Triggers a DB sync from the dev environment into a target. No auth guard. |
| `DELETE` | `/api/sync-from-dev` | 🔓 None | Cancels the sync. No auth guard. |
| `GET` | `/api/discover-variants` | 🔓 None | Lists discovered variant configurations for a chassis. |
| `POST` | `/api/discover-variants/insert` | 🔓 None | Inserts a discovered variant record. No auth guard. |
| `POST` | `/api/discover-variants/by-chassis` | 🔓 None | Discovers variants for a chassis code via scraping. No auth guard. |
| `POST` | `/api/download-images` | 🔓 None | Triggers image download + Object Storage upload for a set of part numbers. No auth guard. |
| `POST` | `/api/backfill-diagram-images` | 🔓 None | Backfills diagram images for parts missing them. No auth guard. |
| `POST` | `/api/bmw-models/import-legacy` | 🛡 Admin | Imports legacy ETK model data from a JSON payload. |
| `GET` | `/images/*` | 🔓 None | Image proxy for Replit Object Storage assets. Served by `server/static.ts`. |

---

## Notes on Authentication Implementation

- **Session auth** uses `express-session` backed by PostgreSQL (`connect-pg-simple`). The session cookie is `httpOnly`, `sameSite: lax`.
- **`requireAuth`** middleware returns `401` if `req.user` is not set.
- **`requireAdmin`** returns `403` if the user is authenticated but lacks the `admin` role.
- **`requireApiKey`** reads `X-API-Key` header, looks up the key in the `api_keys` table, and attaches tier to the request.
- **`requireApiTier`** is composed after `requireApiKey` and returns `403` if the key's tier doesn't meet the requirement.
- **`requireProvisionKey`** reads `X-Provision-Key` header and compares against the `BMV_ACCOUNT_PROVISION_KEY` env secret.
- **`requireBackupHealthToken`** reads `X-Backup-Health-Token` and compares against a stored token.
- **`requireAdminOrProvisionKey`** passes if either `requireAdmin` OR `requireProvisionKey` would pass.
