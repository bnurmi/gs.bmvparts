# BMV.parts — Current State (April 22, 2026)

This document is a factual snapshot of BMV.parts as it exists today, intended as
context for branding and UX work. It is descriptive only — it makes no
recommendations. Every major section cites `CHANGELOG.md` so a reader can
verify the underlying claim against the source.

---

## Product summary

BMV.parts is an offline‑first BMW parts catalog and VIN tool for owners,
enthusiasts, indie workshops and parts vendors. The site lets a visitor browse
every BMW chassis we have data for, drill from a car into its OEM diagrams and
part numbers, decode a VIN to identify the exact vehicle and its catalog match,
and (for signed‑in users) save personal cars and use an AI part‑finder. The
catalog is mirrored locally so lookups are fast, and it falls back to an
external OEM catalog when the local data does not cover a part. (See
`replit.md` "Overview" and `CHANGELOG.md 2026-04-22 — Mirror full engineroom
catalog into local DB`.)

---

## User roles

There are three roles today.

- **Guest (not signed in).** Can browse the home dashboard, every car page,
  every part page, the BMW Models index, the Series and Chassis landing
  pages, About, Recommended Sites, and the public Search. Can run a VIN
  decode and view the decoded vehicle, but pricing and the AI Part Finder
  are gated behind sign‑in.
- **Registered user.** Everything a guest can do, plus saving personal
  vehicles in **My Cars**, using the AI **Part Finder**, and seeing
  full pricing on part pages. Sign‑in supports a normal username/password
  flow and "Login with GearSwap" SSO. (See `replit.md` "GearSwap SSO" and
  `CHANGELOG.md 2026-04-21 — EU dealer pricing live`.)
- **Admin.** Everything a registered user can do, plus access to the
  `/admin` panel: user and API‑key management, data tools (scraping,
  enrichment, sync, BMW ETK price uploads), analytics, feature‑flag style
  controls, and the full backups console. Admin links are only rendered
  in the header for users with `role = "admin"`. (See
  `client/src/App.tsx` and `CHANGELOG.md 2026-04-22 — Enterprise backup
  system`.)

---

## Page-by-page inventory (live frontend)

All routes are registered in `client/src/App.tsx`.

### Home / Dashboard (`/`)
The landing page, titled "BMW Parts Database". Shows a row of summary
stat cards (e.g. Fully Synced count), a grid of every BMW chassis with
its scrape status (idle / running / complete / unavailable) and a
"Browse" link into Car Detail, plus "Browse by Series" and "Browse by
Chassis" badge sections that link out to the corresponding landing
pages. Some sync/run controls are surfaced on chassis cards when an
admin is signed in. (See `client/src/pages/Home.tsx` and the
declutter work listed under "Known gaps" below.)

### Car Detail (`/car/:slug`)
Three‑panel drill‑down for a single chassis: **Categories →
Subcategories → Diagram + Parts**. The right pane shows the OEM diagram
image alongside the parts table for the selected subcategory. Each part
links to its detail page. Has Vehicle JSON‑LD and breadcrumbs for SEO.
(See `replit.md` "Per‑page SEO".)

### Part Detail (`/part/:partNumberClean`)
Full record for a single part number. Shows description, applicable cars
(local cross‑references), pricing rows (US via BMWPartsDeal/LLLParts and
**BMW Europe Dealer Pricing** in EUR with an AUD approximation), and an
"OEM catalog details" panel sourced from the external engineroom catalog
when available — including model, hierarchy path, supersession, diagram
ref and quantity. Outbound shop links (ECS Tuning, eBay, Amazon,
BMWPartsDeal, LLLParts, MPerformance.parts) are routed through the
tracked `/go` redirector. (See `CHANGELOG.md 2026-04-22 — Wire OEM
catalog into Part Detail and Part Finder UI` and `2026-04-21 — EU
dealer pricing live`.)

### VIN Decoder (`/vin`, `/vin/:vin`)
A user enters a 17‑character VIN. The decoder resolves the chassis and
type code from the local `bmw_models` table first, then enriches
asynchronously via bimmer.work / mdecoder / vindecoderz for options,
factory color and images. The decoded vehicle view has four tabs —
**Vehicle, Options, Images, Manuals** — and a separate "Parts Catalog"
section listing matching cars from the local DB. Includes an "honest
progress" countdown when external sources are still being polled, a
soft "data may be stale" banner for post‑2020 VINs, and a
`chassis_resolved_no_local_parts` fallback that calls the RealOEM
scraper when local matching fails. (See
`CHANGELOG.md 2026-04-22 — RealOEM fallback`, `2026-04-21 — Make
/api/vin/decode non-blocking`, and `2026-04-21 — Honest progress UI`.)

### Part Finder (`/part-finder`)
AI‑assisted part identification for signed‑in users. Accepts a photo
upload and/or a free‑text description (optionally with a model hint),
calls OpenAI GPT‑4o for an interpretation, and returns matching parts
from the local catalog. When local matches are empty, it falls back to
an "OEM Catalog Matches" section sourced from the external engineroom
catalog. Buy links are tracked through `/go`. (See `CHANGELOG.md
2026-04-22 — Wire OEM catalog into Part Detail and Part Finder UI`.)

### Search (`/search`)
Free‑text parts search with optional car filters. The user types a
part number or description; results are debounced and grouped, and a
car‑filter dropdown lets the user narrow matches to one or more chassis
they care about. Each result row links to its Part Detail page and
shows the originating car, category, and subcategory for context. Used
as the catch‑all entry point when a user knows part of a description
or part number but not the exact car. (See `client/src/pages/Search.tsx`
and `replit.md` "SEO Infrastructure".)

### My Cars (`/my-cars`)
Signed‑in users save VIN‑decoded vehicles with an optional nickname.
Each saved car shows the chassis, model, and year decoded from the VIN
and links to its catalog match so the user can jump straight back into
Car Detail. (See `client/src/pages/MyCars.tsx`.)

### BMW Models (`/models`)
Master index of every BMW chassis BMV.parts knows about, used for SEO
and as the canonical "browse by model" entry. Series Landing
(`/series/:seriesSlug`) and Chassis Landing (`/chassis/:chassisCode`)
are companion pages that group cars under a series (e.g. "3 Series") or
under a chassis code (e.g. "G20"), each with breadcrumbs and structured
data. (See `replit.md` "Content Pages (SEO)".)

### About (`/about`) and Recommended Sites (`/friends`)
Static content. About explains what BMV.parts is and includes an
FAQ marked up as `FAQPage` JSON‑LD. Recommended Sites links to
GearSwap, BMBolts, 8HP.shop, and MPerformance.parts. All outbound
links are tracked.

### Authentication pages
**Login** (`/login`) supports username/password sign‑in, a "Login with
GearSwap" SSO button, and a forgot‑password flow. **Reset Password**
(`/reset-password`) handles the token redemption.

### Admin panel (`/admin`)
Visible only to users with the admin role. Organized into five tabs in
`client/src/pages/Admin.tsx`:

- **Management** — create / delete / re‑role users, manage their email
  addresses, and issue / revoke API keys with `basic`, `paid` or `admin`
  tiers.
- **Data Tools** — kick off scraping jobs (catalog, enrichment,
  cross‑references, model scrapes), import/sync data between dev and
  production, upload BMW ETK European dealer price ZIPs, and run
  type‑code backfills.
- **Analytics** — outbound link click stats from the `/go` redirector,
  broken down by destination, day, and top clicked parts.
- **Features** — copy/feature flags surface for things like
  benefits/messaging blocks.
- **Backups** — the full backups console (see below).

### Backups admin (`/admin` → Backups tab, plus `/admin/backups/restore/:id`)
The `BackupsPanel` shows backup health (last success per type, scheduler
state, offsite configuration, total storage used), retention and
schedule editors, run‑now buttons for DB and file backups, an offsite
connection test, and a paginated history table with status, offsite
status, checksum, and duration per backup. The destructive **Restore**
flow lives at `/admin/backups/restore/:id` with explicit confirmation
copy. (See `CHANGELOG.md 2026-04-22 — Enterprise backup system`.)

---

## Primary user workflows

### 1. Find a part for a known car
A user lands on the home page, drills via Series → Chassis → Car Detail
(or jumps straight in from the BMW Models page), navigates Categories →
Subcategories, picks a part from the diagram/parts table, and lands on
Part Detail to see pricing, supersession, and shop links.

### 2. Identify a part from a VIN
The user enters a VIN. The decoder returns the chassis, type code,
model, and engine almost immediately from the local `bmw_models` index;
options, images and factory color are filled in asynchronously by
bimmer.work / mdecoder. From the Parts Catalog section below the
vehicle view, the user clicks through into Car Detail with their VIN
already matched to a chassis.
(See `CHANGELOG.md 2026-04-21 — Skip blocking external enrichment` and
`2026-04-21 — VIN decoder rewired to bmw_models`.)

### 3. Identify a part from a photo or description (AI Part Finder)
A signed‑in user uploads a part photo and/or types a description. GPT‑4o
returns a best‑guess search, the app shows local matches first, and
falls back to OEM catalog matches when local data is empty. Buy links
route through the tracked redirector. (See `CHANGELOG.md 2026-04-22 —
Wire OEM catalog into Part Detail and Part Finder UI`.)

### 4. Maintenance / scrape (admin)
An admin opens **Admin → Data Tools** to start or watch a long‑running
scrape (catalog, enrichment, cross‑references, model scrape). Jobs are
persisted in the `background_jobs` table and resume automatically after
deploys or restarts. The Catalog Importer workflow concurrently keeps
the local mirror of the external engineroom catalog up to date with a
24‑hour delta sync. (See `replit.md` "Background Job System" and
`CHANGELOG.md 2026-04-22 — Daily delta-sync from engineroom`.)

### 5. Backup and restore (admin)
Backups run on the schedule configured under **Admin → Backups**
(hourly / daily / weekly / monthly, plus a pre‑deploy backup before
every publish). Each run is recorded in `backup_logs` with size,
checksum, duration, and offsite status. An admin can trigger a one‑off
DB or file backup, edit retention, test the offsite connection, and
restore from any historical entry through the destructive‑action
confirmation page. (See `CHANGELOG.md 2026-04-22 — Enterprise backup
system`.)

---

## Key backend / system capabilities relevant to UX

- **Offline‑first local catalog.** All cars, categories, subcategories
  and parts are stored in Postgres so every page renders without an
  external round trip. (See `replit.md` "System Architecture".)
- **External OEM catalog fallback.** A typed read‑only client mirrors
  ~511k BMW parts from `engineroom.gearswap.ai` into a local
  `external_catalog_parts` cache; reads hit the cache first and only
  fall through to the live API on a miss. A daily delta keeps the
  cache fresh. (See `CHANGELOG.md 2026-04-22 — Mirror full engineroom
  catalog` and `2026-04-22 — Daily delta-sync`.)
- **VIN decoding pipeline.** Local `bmw_models` lookup (6,560 ETK
  rows) resolves chassis and type code first; bimmer.work, mdecoder,
  and vindecoderz fill in options, images and factory color
  asynchronously; RealOEM is the last‑resort chassis resolver, with a
  daily budget and a permanent positive cache. (See `CHANGELOG.md
  2026-04-21 — VIN decoder rewired to bmw_models` and `2026-04-22 —
  RealOEM fallback`.)
- **AI part identification.** OpenAI GPT‑4o, accessed through
  Replit AI Integrations, powers the AI Part Finder.
- **Pricing.** Per‑part rows combine US/UK scrape data
  (BMWPartsDeal, LLLParts) with the BMW ETK European dealer price
  list imported from `etkpr*.zip`. AUD approximations are computed
  with an admin‑configurable rate. (See `CHANGELOG.md 2026-04-21
  — EU dealer pricing live`.)
- **External link / supplier tracking.** Every outbound link goes
  through `/go` and is logged to `link_clicks`, which makes the
  Analytics tab and any future affiliate swap trivial. (See
  `replit.md` "External Link Click Tracking".)
- **Enterprise backup system.** Streamed `pg_dump → gzip` to Replit
  Object Storage with sha256 checksums, gzip header verification,
  optional S3‑compatible offsite mirror, scheduler with lock file,
  per‑prefix retention, pre‑deploy hook, and restore from any
  historical entry. (See `CHANGELOG.md 2026-04-22 — Enterprise
  backup system`.)
- **Alerting.** Backup failures, repeated offsite failures, and
  stale‑success thresholds dispatch Telegram and email alerts to a
  configurable admin recipient. (See `CHANGELOG.md 2026-04-22 —
  Enterprise backup system`.)
- **API keys.** Admins can issue per‑user API keys with `basic`,
  `paid`, or `admin` tiers. The keys are consumed by external
  integrations such as GearSwap's VIN lookup. (See `replit.md`
  "Account Provisioning API" and `client/src/pages/Admin.tsx`.)
- **GearSwap integration.** OAuth SSO ("Login with GearSwap")
  plus a server‑to‑server account provisioning API for staff,
  vendors, and marketplace stores. (See `replit.md` "GearSwap SSO"
  and "Account Provisioning API".)

---

## Recent changes (last ~10 changelog entries)

Summarized from `CHANGELOG.md`. Most recent first.

- **2026-04-22 — RealOEM fallback (Tier 1 + Tier 2 scaffolding):**
  Added a last‑resort chassis lookup against RealOEM with a daily
  budget, permanent positive cache, and an admin‑triggered chassis
  scraper.
- **2026-04-22 — Enterprise backup system:** Production‑grade
  scheduled DB and file backups to Object Storage with optional
  offsite mirror, retention, alerts, pre‑deploy hook, restore page,
  and a new "Backups" admin tab.
- **2026-04-22 — Daily delta‑sync from engineroom (24h ping):**
  New script and scheduler that fetch only the parts added upstream
  since the last sync, keeping the local catalog mirror current.
- **2026-04-22 — Mirror full engineroom catalog into local DB for
  fast lookups:** Bulk importer plus the `external_catalog_parts`
  table; part lookups now hit Postgres first and report a `source`
  field on the response.
- **2026-04-22 — Wire OEM catalog into Part Detail and Part Finder
  UI:** Part Detail shows an "OEM catalog details" panel and no
  longer dead‑ends on local misses; Part Finder shows OEM matches
  when local results are empty.
- **2026-04-22 — Add read‑only client for external BMW parts catalog
  API:** Typed client (`server/parts-catalog-client.ts`) with cache,
  retry, and pagination over the engineroom API.
- **2026-04-22 — Wire up engineroom (PartsLink24) catalog client —
  live and authenticated:** Fixed the API path and made the client
  read whichever of `PARTS_CATALOG_API_TOKEN` or `SCRAPER_API_KEY`
  is set.
- **2026-04-22 — Kick off batch parts‑scrape for 1,505
  newly‑discovered cars:** Long‑running driver script that fans the
  scrape pipeline out to ~12 concurrent workers without overwhelming
  the upstream catalog.
- **2026-04-22 — Realoem scraper: probed and parked:** Documented
  why a direct RealOEM catalog scraper isn't viable today (JS‑driven,
  no internal hrefs); the per‑VIN fallback above is the chosen
  workaround.
- **2026-04-21 — Make `/api/vin/decode` non‑blocking for ALL VINs:**
  Removed the synchronous bimmer.work / mdecoder / vindecoderz chain
  from the decode endpoint; enrichment now always runs asynchronously
  client‑side, dropping decode latency from ~40s to ~400ms.
- **2026-04-21 — EU dealer pricing live: import service, admin
  uploader, part‑detail row:** Imported 590k EUR price rows, exposed
  them on the pricing endpoint, added a "BMW Europe Dealer Pricing"
  row on Part Detail and a ZIP uploader in the admin panel.

---

## Known gaps / in‑flight work

The following items are tracked in the project task list as currently
proposed or active work. They are described here in plain language and
do not reflect anything that has shipped.

- **Frontend declutter and redesign.** The home page, sidebar, car
  detail drill‑down, and part detail page are being reworked for a
  calmer visual hierarchy, a single primary action on the landing
  page, a quieter sidebar that doesn't list every model, and a
  consistent muted treatment for status badges.
- **VIN debug page for admins.** Surface the existing VIN debug
  view from the admin dashboard so admins can investigate decode
  failures without a direct URL.
- **Resolving catalog vehicles that map to several factory codes.**
  Give admins a tool for cleanly handling cars in the catalog whose
  VIN type code resolves to more than one BMW factory code.
- **Automatic factory‑code backfill on catalog changes.** Re‑run
  the type‑code backfill whenever the catalog data changes, so new
  cars don't sit without a resolved factory code.
- **Verify the restore flow end‑to‑end.** Exercise the backup
  restore path on a throwaway database to confirm the round trip
  works as documented.
- **Show the latest pre‑deploy backup status next to Publish.**
  Make it obvious in the admin UI whether the most recent deploy
  was preceded by a fresh, successful backup.
- **Alert when a deploy ships without a fresh pre‑deploy backup.**
  Wire the existing alerting to specifically catch deploys that
  went out without a recent backup.
- **Require admin email addresses.** Make admin email a required
  field so backup and operational alerts always have a guaranteed
  recipient.
