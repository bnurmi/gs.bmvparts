#!/usr/bin/env bash
# End-to-end orchestration for Task #105's ISTA+ SQLite exploration.
#
# Run after dropping the archive into data/ista/raw/:
#   data/ista/raw/SQLiteDBs4.55.12.7z
#   data/ista/raw/password.txt
#
# Steps:
#   1. extract       (skips files already extracted)
#   2. enumerate     (table list, column list, row counts → inventory.json)
#   3. classify      (worth-importing / not-useful / needs-deeper-look)
#   4. sample        (10-row CSV per worth-importing / VIN-FA candidate)
#   5. render-doc    (regenerates docs/ista-sqlite-inventory.md)
#
# Pass `--skip-extract` to re-run analysis without re-extracting.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_EXTRACT=0
INCLUDE_GLOB=""
for arg in "$@"; do
  case "$arg" in
    --skip-extract) SKIP_EXTRACT=1 ;;
    --include=*)    INCLUDE_GLOB="${arg#--include=}" ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ $SKIP_EXTRACT -eq 0 ]]; then
  echo "==[1/5]== extract"
  bash scripts/extract-ista-sqlite.sh "$INCLUDE_GLOB"
else
  echo "==[1/5]== extract (skipped)"
fi

echo "==[2/5]== enumerate"
node scripts/enumerate-ista-sqlite.mjs

echo "==[3/5]== classify"
node scripts/classify-ista-tables.mjs

echo "==[4/5]== sample"
node scripts/sample-ista-tables.mjs

echo "==[5/5]== render doc"
node scripts/render-ista-inventory-doc.mjs

echo ""
echo "Done. See docs/ista-sqlite-inventory.md for the writeup."
