# `data/ista/` — ISTA+ SQLite exploration quarantine

This directory is the agreed landing zone for the ISTA+ 4.55.12 SQLite
exploration described in Task #105. **Nothing in here is part of the
production data plane** — no production code reads from `data/ista/`,
nothing is imported into PostgreSQL from here, and the entire tree is
gitignored except for this README and `.gitignore`.

## Layout

```
data/ista/
├── raw/                    # drop SQLiteDBs4.55.12.7z and password.txt here
│   ├── SQLiteDBs4.55.12.7z (you provide)
│   └── password.txt        (you provide — single line, archive password)
├── extracted/              # populated by scripts/extract-ista-sqlite.sh
│   └── *.db / *.sqlite ... (one or more SQLite files from the archive)
└── inventory/              # populated by scripts/enumerate-ista-sqlite.mjs
    ├── inventory.json      # machine-readable: file → tables → columns → row count
    └── samples/            # per-table 5-row CSV samples for "worth importing" candidates
```

## How to use it (when the archive lands)

1. Drop the archive and password file into `data/ista/raw/`:

   ```
   data/ista/raw/SQLiteDBs4.55.12.7z
   data/ista/raw/password.txt
   ```

2. Run the pipeline end to end:

   ```bash
   bash scripts/ista-pipeline.sh
   ```

   This will:
   - extract the archive into `data/ista/extracted/` (resumable, skips
     files already extracted)
   - enumerate every `.db` / `.sqlite` / `.sqlite3` file (table list,
     column list, row counts) and write `inventory/inventory.json`
   - classify every table into "worth importing" / "not useful" /
     "needs deeper look" using the rubric in
     `scripts/classify-ista-tables.mjs`
   - search every database for VIN-keyed tables and produce the
     per-VIN FA verdict
   - sample 5–10 rows per "worth importing" table into
     `inventory/samples/`
   - regenerate `docs/ista-sqlite-inventory.md` from the live data

3. Review `docs/ista-sqlite-inventory.md`.

You can also run any step individually — see the script headers.

## Disk-footprint warning

`SQLiteDBs4.55.12.7z` is ~23 GB compressed and ~60–100 GB extracted.
The workspace volume currently has ~162 GB free, so a full extraction
fits, but only just. The extraction script supports `--include-glob`
to extract a subset (e.g. only files matching a pattern) if you want
to keep the footprint smaller.
