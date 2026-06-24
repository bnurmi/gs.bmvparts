#!/usr/bin/env bash
set -euo pipefail

echo "[start-prod] Checking Redis..."

# If Redis is already running (e.g. container restart), skip launching a new instance.
if redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "[start-prod] Redis already running — skipping start"
else
  echo "[start-prod] Starting Redis..."
  redis-server --daemonize yes --loglevel notice --save "60 1" --bind 127.0.0.1 || {
    echo "[start-prod] WARNING: redis-server failed to start — continuing without cache"
  }

  echo "[start-prod] Waiting for Redis to be ready..."
  MAX_WAIT=10
  for i in $(seq 1 $MAX_WAIT); do
    if redis-cli ping 2>/dev/null | grep -q PONG; then
      echo "[start-prod] Redis is ready (attempt $i)"
      break
    fi
    if [ "$i" -eq "$MAX_WAIT" ]; then
      echo "[start-prod] WARNING: Redis did not respond after ${MAX_WAIT}s — continuing anyway"
    fi
    sleep 1
  done
fi

echo "[start-prod] Starting Node server..."
exec npm run start
