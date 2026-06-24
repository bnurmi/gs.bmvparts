# BMW first-party coverage audit (Task #61)

The VIN decoder pulls Vehicle / Options / Images / Manuals from a mix of
first-party sources (BMW configurator CDN, BMW owners-manuals portal,
local ETK dump) and a bimmer.work fallback. The new image and manuals
clients ship with sensible URL patterns plus graceful 404 fallbacks, so
a regressed BMW endpoint will *silently* leave us stuck on bimmer.work.

This audit answers the question **"which model years does BMW actually
serve through these endpoints today?"** by walking every cached VIN and
re-probing the BMW endpoints live.

## Running the audit

```bash
# Full audit of every VIN in vin_cache (read-only, safe to run anytime)
npx tsx scripts/audit-bmw-first-party-coverage.ts

# Quick sanity run of the first 50 VINs while debugging
npx tsx scripts/audit-bmw-first-party-coverage.ts --limit 50

# Save the full JSON report (for trending / sharing)
npx tsx scripts/audit-bmw-first-party-coverage.ts \
  --out tmp/bmw-coverage-$(date +%F).json
```

Other flags:

- `--concurrency N` — parallel BMW probes per tab (default 4, keep small
  to stay polite with the BMW edge).
- `--no-images` / `--no-manuals` — skip one of the two probes.

The script never writes to the database. It re-uses
`server/bmw-configurator-images.ts::fetchConfiguratorImages` and
`server/bmw-manuals.ts::fetchManualsForModel` so the probe is exactly
what production would do during a fresh enrichment.

## What the report contains

For each tab the script bucketises hit rates by:

1. **Overall** — total VINs vs first-party hit count.
2. **By model year** — `<2005`, `2005–2009`, `2010–2014`, `2015–2019`,
   `2020–2024`, `2025+`, and `(unknown)`. This is the bucket the task
   description specifically calls out (e.g. pre-2010 manuals).
3. **By chassis** — top 15 chassis by VIN count.
4. **Structural gaps** — every bucket with ≥3 attempts and a 0% hit
   rate. These are the (year, source) combinations where the
   bimmer.work fallback is structurally required.
5. Sample miss VINs for each tab so ops can drill in manually.

## Companion endpoint

`GET /api/admin/vin-enrichment-stats` (admin-only) reports the same
counters from the *historical* persisted `vin_cache.enrichment_source`
column. The audit script complements that endpoint by **actively
re-probing** today, which catches regressions on cached VINs whose
provenance was recorded before a BMW endpoint changed shape.

## Documenting structural gaps

When a structural gap shows up in the "Structural gaps" section,
add a row to the table below so future operators know that the
bimmer.work fallback for that bucket is expected, not a regression.

| Tab | Year bucket / chassis | Reason | Date observed |
| --- | --- | --- | --- |
| _(none yet — fill in after first production run)_ | | | |
