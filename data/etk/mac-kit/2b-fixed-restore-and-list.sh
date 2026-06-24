#!/bin/bash
# All-in-one fixed script: configures Wine properly, starts tbserv32, restores
# (skipped if etk_publ already has data), then lists tables.
set -e
cd "$(dirname "$0")"

export WINEPREFIX="$PWD/.wineprefix"
export WINEDEBUG=-all
TB="$PWD/tb-win32"

# --- 1. Write a tbwin.ini that Wine programs will pick up ----------------------
# Wine maps the wine prefix's drive_c to C:\, so c:\windows is here:
WIN_DIR="$WINEPREFIX/drive_c/windows"
mkdir -p "$WIN_DIR"

# Convert Unix paths to Windows paths Wine can use
TB_WIN=$(winepath -w "$TB" 2>/dev/null)
DB_WIN=$(winepath -w "$PWD/databases" 2>/dev/null)

cat > "$WIN_DIR/tbwin.ini" <<EOF
[tbwin]
TRANSBASE_SERVICENAMES=2024:2025
TBKERNELDLL32=$TB_WIN\\tbker32.dll
HOSTACCESS32=$TB_WIN\\tbwsoc32.dll
TRANSBASE=$TB_WIN
TRANSBASE_LOCAL=$TB_WIN
SERVICENAME=Transbase
LINKED_IN=OFF
EOF
echo "Wrote tbwin.ini → $WIN_DIR/tbwin.ini"

# --- 2. Write dblist.ini next to tbserv32 ---------------------------------------
cat > "$TB/dblist.ini" <<EOF
etk_publ=$DB_WIN\\etk_publ
etk_nutzer=$DB_WIN\\etk_nutzer
etk_preise=$DB_WIN\\etk_preise
EOF
echo "Wrote dblist.ini → $TB/dblist.ini"

# --- 3. Kill any stale tbserv32 -----------------------------------------------
pkill -f tbserv32 2>/dev/null || true
sleep 1

# --- 4. Start tbserv32 in background, capture its early output -----------------
echo "Starting tbserv32..."
( cd "$TB" && wine tbserv32.exe > "$PWD/server.log" 2>&1 ) &
SERVER_PID=$!
sleep 6

# Verify server is running
if ! pgrep -f tbserv32 > /dev/null; then
  echo "ERROR: tbserv32 exited. Last lines of server.log:"
  tail -20 server.log
  exit 1
fi
echo "tbserv32 is running. server.log so far:"
tail -10 server.log
echo ""

# Check it's listening on 2024 (macOS lsof)
if lsof -nP -iTCP:2024 -sTCP:LISTEN 2>/dev/null | grep -q .; then
  echo "Port 2024 is bound — server is listening."
else
  echo "WARN: port 2024 doesn't appear to be bound. Check server.log."
fi
echo ""

# --- 5. Restore (only if etk_publ looks empty) ---------------------------------
DB_BYTES=$(du -sk databases/etk_publ 2>/dev/null | awk '{print $1}')
if [ "${DB_BYTES:-0}" -lt 100000 ]; then  # < 100 MB means restore didn't run
  echo "etk_publ is empty (~${DB_BYTES} KB). Running restore — this takes 10–60 min."
  if [ ! -f etk.jetarch ]; then
    echo "ERROR: etk.jetarch not found."
    exit 1
  fi
  ARCHIVE_WIN=$(winepath -w "$PWD/etk.jetarch")
  # Try local @localhost connection explicitly:
  wine "$TB/tbarc32.exe" -r "$ARCHIVE_WIN" "etk_publ@127.0.0.1:2024" p=tmp 2>&1 | tee restore.log
else
  echo "etk_publ already has ~${DB_BYTES} KB — skipping restore."
fi

# --- 6. List tables ------------------------------------------------------------
echo ""
echo "Querying table list..."
cat > list.sql <<'EOF'
SELECT TNAME FROM SYSTABLE WHERE CREATOR='tbadmin' ORDER BY TNAME;
COMMIT;
QUIT;
EOF
wine "$TB/tbi32.exe" -f list.sql "etk_publ@127.0.0.1:2024" tbadmin tmp 2>&1 | tee tables.txt

echo ""
echo "Done. Send tables.txt back."
