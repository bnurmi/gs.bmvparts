# ISTA+ SQLite inventory (Task #105)

Generated from `data/ista/inventory/*.json` on 2026-05-03T10:36:25.273Z.
Re-render with `bash scripts/ista-pipeline.sh` (or `node scripts/render-ista-inventory-doc.mjs` if just the doc needs refreshing).

> **Scope guard.** Everything in this doc is exploration-only. No ISTA+ data has been imported into PostgreSQL or any user-facing surface. The full extracted tree lives under the gitignored quarantine `data/ista/extracted/`. Promotion of any "worth importing" table is a separate, planned task.

## Per-VIN FA verdict

**No.** No table in any ISTA+ SQLite database carries a VIN-shaped column or an FA-shaped column. ISTA+ does not ship a static per-VIN factory-order table; per-VIN FA must continue to come from PartsLink24 / the ETK FA dump pipeline (`server/etk-vin-fa.ts`).

## Storage layout

- Archive: `data/ista/raw/SQLiteDBs4.55.12.7z` (user-provided, ~23 GB)
- Password: `data/ista/raw/password.txt` (single line)
- Extracted SQLite tree: `data/ista/extracted/` (gitignored, ~60–100 GB)
- Inventory JSON: `data/ista/inventory/{inventory,classification,vin-fa-candidates}.json`
- Row samples: `data/ista/inventory/samples/*.csv`

Disk vs Object Storage: chose **local disk** because the workspace volume has ~162 GB free (more than the ~100 GB extracted footprint), and SQLite reads are dramatically faster against local files than against an object-storage FUSE mount. The whole `data/ista/` tree is gitignored so the extracted blob never enters git.

## Files

| File | Size | Tables | Total rows |
| --- | ---: | ---: | ---: |
| `data/ista/extracted/_othertest/fake.db` | 8.0 KB | 1 | 1 |
| `data/ista/extracted/_smoketest/fake.db` | 8.0 KB | 1 | 1 |

## Worth importing

_No tables matched the worth-importing rubric. (Either nothing is genuinely useful, or the rubric in `scripts/classify-ista-tables.mjs` needs widening.)_
## Not useful (do not revisit)

0 tables. Categories matched: diagnostic / fault-code / wiring / programming / ICOM / localisation-only / migration metadata. Also mirrored in `classification.json`.


## Needs deeper look

2 tables that the rubric couldn't classify. Each needs a manual look at the column list + 5-row sample to decide. Also mirrored in `classification.json`.

- `sa_codes_test` (data/ista/extracted/_othertest/fake.db, 1 rows) — has code+text columns — possible dictionary
- `sa_codes_test` (data/ista/extracted/_smoketest/fake.db, 1 rows) — has code+text columns — possible dictionary

## Recommended follow-up tasks

_To be filled in once the inventory has been reviewed against the candidates above. Each recommendation should be small enough to plan independently, e.g.:_

- Import N net-new SA codes from ISTA+ `<table>` into `sa_codes` (delta: +N codes).
- Merge ISTA+ engine technical specs from `<table>` into chassis hub blurbs (delta: enriches M chassis pages).
- Backfill paint-code finish/RGB metadata from ISTA+ `<table>` into `paint_codes` (delta: +K codes get RGB).
- (Per-VIN FA promotion only if the FA verdict above turns out to be **yes**.)
