#!/usr/bin/env bash
# Supervisor that restarts the importer on any non-zero exit (or kill).
# Imports are resumable via /tmp/external_catalog_import_state.json so a
# restart picks up exactly where the last successful page left off.
LOG=logs/external_catalog_import.log
mkdir -p logs
echo "[supervisor] starting at $(date -u '+%F %T')" >> "$LOG"
attempt=0
while true; do
  attempt=$((attempt+1))
  echo "[supervisor] launching importer (attempt #$attempt) at $(date -u '+%F %T')" >> "$LOG"
  node scripts/import-external-catalog.mjs >> "$LOG" 2>&1
  rc=$?
  echo "[supervisor] importer exited rc=$rc at $(date -u '+%F %T')" >> "$LOG"
  if [ "$rc" = "0" ]; then
    echo "[supervisor] clean exit — import complete. stopping." >> "$LOG"
    exit 0
  fi
  if [ "$attempt" -ge 50 ]; then
    echo "[supervisor] too many restarts ($attempt). giving up." >> "$LOG"
    exit 1
  fi
  sleep 5
done
