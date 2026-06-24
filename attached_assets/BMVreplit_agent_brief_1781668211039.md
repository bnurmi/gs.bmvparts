# BMV.parts / BMV.vin Production E2E Fix Brief for Replit Agent

## Context

Review of Jesse/Hermes E2E bundle for BMV.parts and BMV.vin.

- Production domains: `https://www.bmv.parts`, `https://www.bmv.vin`
- Test timestamp: 2026-06-17T02:07:02Z
- Routes tested: 217
- OK: 56
- WARN: 116
- BROKEN: 45
- Bundle files reviewed:
  - `report.md`
  - `raw-results.json`

## Executive summary

Do **not** treat this as 45 unrelated broken pages.

The broken pages cluster heavily into two route families:

1. `https://www.bmv.parts/series/*`
2. `https://www.bmv.parts/chassis/*`

Jesse’s browser timeout was only **6000ms**, and independent recheck showed representative routes do eventually return 200 but are slow:

- `https://www.bmv.parts/series/3` returned 200 in ~15.6s
- `https://www.bmv.parts/chassis/E46` returned 200 in ~12.1s
- `https://www.bmv.parts/hub/E46` returned 200 in ~0.8s
- `https://www.bmv.vin/` returned 200 in ~1.5s
- `https://www.bmv.vin/option/sa-205` returned 200 in ~1.7s

So the likely root issue is **slow SSR/data loading on series/chassis pages**, not hard 404/500 failures.

## Replit fix order

### P0 — Route-family performance issue: BMV.parts series pages

Affected examples from the bundle:

- `/series/1`
- `/series/2`
- `/series/3`
- `/series/4`
- `/series/5`
- `/series/6`
- `/series/7`
- `/series/M`
- `/series/X1`
- `/series/X2`
- `/series/X3`
- `/series/X4`
- `/series/X5`
- `/series/X6`
- `/series/X7`
- `/series/XM`

Observed:

- Playwright timed out after 6000ms waiting for DOMContentLoaded.
- Independent check confirms at least `/series/3` eventually returns 200 but takes ~15.6s.

Expected:

- Series landing pages should reach DOMContentLoaded quickly, ideally under 2s–4s production target.
- If expensive data is required, render shell/above-fold SEO content first and lazy-load heavy lists.

Investigate:

- SSR data fetches for series pages.
- N+1 queries over chassis/models/parts.
- External API calls blocking server render.
- Missing cache layer for series page aggregates.
- Slow DB query/plans for series-to-chassis/model counts.

Acceptance criteria:

- Representative series routes return 200 and DOMContentLoaded under 6s, preferably under 3s:
  - `/series/3`
  - `/series/M`
  - `/series/X5`
- Page still contains correct H1/title/meta and useful content.
- No client console errors.

### P0 — Route-family performance issue: BMV.parts chassis pages

Affected examples from bundle:

- `/chassis/E30`
- `/chassis/E36`
- `/chassis/E46`
- `/chassis/E60`
- `/chassis/E61`
- `/chassis/E70`
- `/chassis/E90`
- `/chassis/E92`
- `/chassis/E93`
- `/chassis/F10`
- `/chassis/F15`
- `/chassis/F20`
- `/chassis/F25`
- `/chassis/F30`
- `/chassis/F80`
- `/chassis/F82`
- `/chassis/F87`
- `/chassis/F87N`
- `/chassis/G05`
- `/chassis/G20`
- `/chassis/G22`
- `/chassis/G30`
- `/chassis/G80`
- `/chassis/G82`
- `/chassis/G87`

Observed:

- Playwright timed out after 6000ms waiting for DOMContentLoaded.
- Independent check confirms `/chassis/E46` eventually returns 200 but takes ~12.1s.
- Equivalent `/hub/E46` route returns in ~0.8s, so compare implementation/caching between `/chassis/*` and `/hub/*`.

Expected:

- Chassis pages should load quickly and not block DOMContentLoaded on heavy data.

Investigate:

- Compare `/chassis/[code]` implementation to `/hub/[code]` implementation.
- Identify whether `/chassis/*` is performing heavy synchronous RealOEM/backfill/catalog joins.
- Cache chassis metadata and counts.
- Defer large part lists, compatibility tables, or search data until after first render.

Acceptance criteria:

- Representative chassis routes return 200 and DOMContentLoaded under 6s, preferably under 3s:
  - `/chassis/E46`
  - `/chassis/F30`
  - `/chassis/G80`
- No timeout at a 6s QA threshold.
- Correct H1/meta present server-side.

### P1 — BMV.vin root and option routes were flagged broken in Jesse run, but recheck passed

Bundle flagged:

- `https://www.bmv.vin/`
- `https://www.bmv.vin/option/sa-205`
- `https://www.bmv.parts/de/vin/WBS2U720107F68697`

Independent recheck:

- `https://www.bmv.vin/` returned 200 in ~1.5s.
- `https://www.bmv.vin/option/sa-205` returned 200 in ~1.7s.

Action:

- Re-run these in browser with a 15s timeout before changing code.
- If no reproduction, treat as transient network/test timeout and update QA threshold/reporting.

Acceptance criteria:

- BMV.vin root and option page render under 6s reliably across 3 repeated runs.

## P1/P2 SEO cleanup cluster

Many WARNs are not route failures. They are mostly missing SSR `meta_description` and `h1` on dynamic BMV.vin and BMV.parts detail pages.

Common affected examples:

### BMV.parts car pages

- `/car/e46-m3-47606`
- `/car/e46-325ti-47656`
- `/car/e60-m5-48421`
- `/car/f30-320i-49341`

Warning:

- HTTP 200 but missing SSR `meta_description`, `h1`

### BMV.parts part pages

- `/part/52107147481`
- `/part/52107147478`
- `/part/52107147462`
- `/part/52106955520`

Warning:

- HTTP 200 but missing SSR `meta_description`, `h1`

### BMV.vin pages

Large cluster of pages return 200 but miss SSR `meta_description` and `h1`, including:

- `/WBS2U720107F68697`
- `/bmw-vin-decoder`
- `/decoder/bmw`
- `/chassis`
- `/year`
- `/plant`
- `/market`
- `/paint`
- `/option`
- `/chassis/F87N`
- `/year/2020`
- `/plant/dingolfing`
- `/option/sa-302`
- `/bmw-m3`
- `/glossary/check-digit`
- `/glossary/sa-205`

Action:

- Add SSR H1/meta generation for dynamic VIN, option, paint, plant, chassis, glossary, car, and part templates.
- Do not rely only on client-side rendering for SEO-critical text.

Acceptance criteria:

- Representative pages include server-rendered `<h1>` and `<meta name="description">`.
- Titles remain unique and useful.

## 404 warnings / route-map decision needed

Some WARNs are 404s. Replit should not blindly create all of these unless product wants the page live.

Examples:

- `https://www.bmv.parts/vin/WBAUU31040KY36955` — 404
- `https://www.bmv.parts/vin/WBA4J51080BNB0416` — 404
- `https://www.bmv.vin/bmw-build-sheet-lookup` — 404
- `https://www.bmv.vin/bmw-paint-code-lookup` — 404
- `https://www.bmv.vin/bmw-production-date-lookup` — 404
- `https://www.bmv.vin/bmw-engine-code-lookup` — 404
- `https://www.bmv.vin/bmw-options-lookup` — 404
- `https://www.bmv.vin/bmw-plant-code-lookup` — 404
- `https://www.bmv.vin/bmw-model-year-lookup` — 404

Decision:

- If these are intended SEO landing pages, implement or redirect them.
- If not intended, remove from QA URL map or keep as expected 404.

## Placeholder routes in QA map

These should not be tested as literal public URLs:

- `https://www.bmv.parts/guides/:slug`
- `https://www.bmv.parts/compare/:slug`
- `https://www.bmv.parts/data/:slug`
- `https://www.bmv.vin/guide/:slug`
- `https://www.bmv.vin/compare/:slug`
- `https://www.bmv.vin/data/:slug`

Action:

- Replace placeholders with real known slugs, or mark as route pattern only.

## Replit agent instructions

1. Start with performance profiling, not broad page creation.
2. Reproduce with browser timing for representative routes:
   - `/series/3`
   - `/series/M`
   - `/series/X5`
   - `/chassis/E46`
   - `/chassis/F30`
   - `/chassis/G80`
3. Compare fast `/hub/*` implementation against slow `/chassis/*` implementation.
4. Add caching/defer heavy queries so DOMContentLoaded is not blocked.
5. Then address SSR SEO warnings for dynamic car/part/VIN pages.
6. Only after that, triage 404 SEO landing pages and placeholders.
7. Retest with browser at 6s and 15s thresholds, and provide before/after timing evidence.

## Acceptance test command shape

The final validation should report:

- URL
- status
- final URL
- time to first byte / total HTML response time
- browser DOMContentLoaded time
- H1 present
- meta description present
- console/page errors

Minimum pass set:

- `/series/3`
- `/series/M`
- `/series/X5`
- `/chassis/E46`
- `/chassis/F30`
- `/chassis/G80`
- `/hub/E46`
- `/`
- `/search`
- `/part-finder`
- `https://www.bmv.vin/`
- `https://www.bmv.vin/option/sa-205`

## Bottom line

This bundle is suitable to send to Replit **with this brief attached**.

Do not send the raw report alone as “fix 45 broken routes,” because most failures are timeout/performance symptoms from a small number of route families.
