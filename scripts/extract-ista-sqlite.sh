#!/usr/bin/env bash
# Extract the password-protected ISTA+ SQLite archive into the
# quarantined `data/ista/extracted/` tree. Idempotent: re-running
# skips files that already exist on disk (7z `-aos` = "skip
# existing output files").
#
# Inputs:
#   data/ista/raw/SQLiteDBs4.55.12.7z   (you provide)
#   data/ista/raw/password.txt           (you provide — single-line password)
#
# Output:
#   data/ista/extracted/...              (one or more .db / .sqlite files)
#
# Usage:
#   bash scripts/extract-ista-sqlite.sh                # full extract
#   bash scripts/extract-ista-sqlite.sh '*.db'         # only .db files
#
# Footprint warning: full extract is ~60-100 GB. See data/ista/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="$ROOT/data/ista/raw/SQLiteDBs4.55.12.7z"
PWFILE="$ROOT/data/ista/raw/password.txt"
OUT="$ROOT/data/ista/extracted"
INCLUDE_GLOB="${1:-}"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "ERROR: archive not found at $ARCHIVE" >&2
  echo "  Drop SQLiteDBs4.55.12.7z into data/ista/raw/ and re-run." >&2
  exit 2
fi
if [[ ! -f "$PWFILE" ]]; then
  echo "ERROR: password file not found at $PWFILE" >&2
  echo "  Drop password.txt (single-line archive password) into data/ista/raw/ and re-run." >&2
  exit 2
fi

PASSWORD="$(head -n1 "$PWFILE" | tr -d '\r\n')"
if [[ -z "$PASSWORD" ]]; then
  echo "ERROR: password.txt is empty" >&2
  exit 2
fi

mkdir -p "$OUT"

# List archive contents first so the caller sees what's coming.
echo "[ista-extract] Listing archive contents..."
7z l -slt -p"$PASSWORD" "$ARCHIVE" \
  | awk '/^Path = / && NR>5 {print substr($0,8)}' \
  | head -50
echo "[ista-extract] (preview truncated to 50 entries)"
echo ""

echo "[ista-extract] Extracting to $OUT (skipping existing files)..."
if [[ -n "$INCLUDE_GLOB" ]]; then
  echo "[ista-extract] include filter: $INCLUDE_GLOB"
  7z x -aos -p"$PASSWORD" -o"$OUT" "$ARCHIVE" "$INCLUDE_GLOB"
else
  7z x -aos -p"$PASSWORD" -o"$OUT" "$ARCHIVE"
fi

echo ""
echo "[ista-extract] Done. SQLite files extracted:"
find "$OUT" \( -iname '*.db' -o -iname '*.sqlite' -o -iname '*.sqlite3' \) -printf '  %p (%s bytes)\n' | sort
