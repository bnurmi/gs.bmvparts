#!/bin/bash
set -e
npm install
# `--force` so schema changes that require a destructive prompt
# (e.g. adding a unique constraint to a populated table) don't hang
# waiting for stdin — the post-merge hook runs with stdin closed.
npm run db:push -- --force
# Ensure Playwright Chromium is present for the hub-seo pre-deploy
# validation (scripts/verify-hub-seo.ts), which also drives the
# locale-prefixed SEO spec from tests/e2e/locale-seo.spec.ts.
#
# Only download if missing — the binary is ~185MB (~10-15s download)
# and the post-merge step has a 20s budget. The browser cache lives in
# the workspace at .cache/ms-playwright (survives across merges), so a
# re-download is only needed after a Playwright version bump.
PW_CACHE=".cache/ms-playwright"
PW_BIN="$PW_CACHE/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell"
if [ -x "$PW_BIN" ]; then
  echo "[post-merge] Playwright Chromium already installed at $PW_BIN — skipping download"
else
  echo "[post-merge] Installing Playwright Chromium (one-time download, ~185MB)..."
  PLAYWRIGHT_BROWSERS_PATH="$PWD/$PW_CACHE" npx playwright install chromium
fi
