#!/bin/bash
BASE_ID="11DM-EUR-09-2021-G87-BMW-M2"
OUT_DIR="/tmp/realoem-g87"
COOKIES="/tmp/realoem_cookies_bg.txt"
LOG="$OUT_DIR/scrape.log"
DELAY=20

mkdir -p "$OUT_DIR/cats" "$OUT_DIR/parts"

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

log() {
  echo "$(date '+%H:%M:%S') $1" | tee -a "$LOG"
}

fetch() {
  local url="$1"
  local outfile="$2"
  if [ -f "$outfile" ] && [ $(wc -c < "$outfile" 2>/dev/null || echo 0) -gt 5000 ] && ! grep -q 'recaptcha' "$outfile" 2>/dev/null; then
    return 0
  fi
  rm -f "$outfile"
  
  local delay=$((DELAY + RANDOM % 10))
  sleep $delay
  
  curl -sk "$url" \
    -H "User-Agent: $UA" \
    -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
    -H "Accept-Language: en-US,en;q=0.9" \
    -b "$COOKIES" -c "$COOKIES" \
    --compressed \
    -o "$outfile" 2>/dev/null
  
  if grep -q 'recaptcha' "$outfile" 2>/dev/null; then
    rm -f "$outfile"
    log "  RATE LIMITED, waiting 120s..."
    sleep 120
    # Reinit cookies
    curl -sk "https://realoem.com/" -H "User-Agent: $UA" -c "$COOKIES" -L -o /dev/null 2>/dev/null
    sleep 10
    # Retry once
    curl -sk "$url" \
      -H "User-Agent: $UA" \
      -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
      -H "Accept-Language: en-US,en;q=0.9" \
      -b "$COOKIES" -c "$COOKIES" \
      --compressed \
      -o "$outfile" 2>/dev/null
    if grep -q 'recaptcha' "$outfile" 2>/dev/null; then
      rm -f "$outfile"
      return 1
    fi
  fi
  return 0
}

echo "" > "$LOG"
log "=== Starting G87 M2 scrape ==="

# Init cookies
curl -sk "https://realoem.com/" -H "User-Agent: $UA" -c "$COOKIES" -L -o /dev/null 2>/dev/null
sleep 5

# Fetch main page
if ! fetch "https://realoem.com/bmw/enus/partgrp?id=$BASE_ID" "$OUT_DIR/main.html"; then
  log "FAILED: Main page rate limited"
  exit 1
fi
log "Main page OK"

CATEGORIES=$(grep -oP "mg=\d+" "$OUT_DIR/main.html" | sort -t= -k2 -n | uniq | cut -d= -f2)

for mg in $CATEGORIES; do
  cat_file="$OUT_DIR/cats/cat_${mg}.html"
  
  if ! fetch "https://realoem.com/bmw/enus/partgrp?id=${BASE_ID}&mg=${mg}" "$cat_file"; then
    log "FAILED: Rate limited at cat $mg"
    exit 1
  fi
  
  DIAGS=$(grep -oP "diagId=${mg}_\d+" "$cat_file" 2>/dev/null | sort | uniq | cut -d= -f2)
  DIAG_COUNT=$(echo "$DIAGS" | grep -c . 2>/dev/null || echo 0)
  
  cached=0
  fetched=0
  for diag in $DIAGS; do
    parts_file="$OUT_DIR/parts/parts_${diag}.html"
    if [ -f "$parts_file" ] && [ $(wc -c < "$parts_file" 2>/dev/null || echo 0) -gt 5000 ] && ! grep -q 'recaptcha' "$parts_file" 2>/dev/null; then
      cached=$((cached + 1))
      continue
    fi
    
    if ! fetch "https://realoem.com/bmw/enus/showparts?id=${BASE_ID}&diagId=${diag}" "$parts_file"; then
      log "FAILED: Rate limited at sub $diag in cat $mg"
      exit 1
    fi
    fetched=$((fetched + 1))
  done
  
  log "Cat $mg: $DIAG_COUNT subs ($cached cached, $fetched fetched)"
done

log "=== ALL DONE ==="
total=0
for f in "$OUT_DIR/parts/"*.html; do
  [ -f "$f" ] || continue
  c=$(grep -c 'class="r[01] pos' "$f" 2>/dev/null || echo 0)
  total=$((total + c))
done
log "Total part rows: $total"
