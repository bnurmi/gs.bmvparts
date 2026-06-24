#!/bin/bash
# Dump a table from etk_publ to CSV.
# I'll fill in the TABLE_NAME and COLUMNS once we see tables.txt.
set -e
cd "$(dirname "$0")"

export WINEPREFIX="$PWD/.wineprefix"
export WINEDEBUG=-all
TB="$PWD/tb-win32"

# >>> EDIT THESE TWO LINES once we know the right table <<<
TABLE_NAME="MODELL"          # <-- placeholder, will be replaced
COLUMNS="*"                  # <-- placeholder, will be replaced
OUTPUT="bmw_models.csv"

# Make sure tbserv32 is still running. If not, restart it.
if ! pgrep -f tbserv32 > /dev/null; then
  echo "tbserv32 is not running — restarting..."
  (cd server && wine "$TB/tbserv32.exe" -d "$PWD" 2>>server.log &)
  sleep 5
fi

cat > dump.sql <<EOF
-- Output as CSV with header row
SELECT $COLUMNS FROM $TABLE_NAME;
QUIT;
EOF

echo "Dumping $TABLE_NAME → $OUTPUT ..."
# tbi32 -csv flag outputs comma-separated; -h prints column headers.
wine "$TB/tbi32.exe" -csv -h -f dump.sql etk_publ tbadmin tmp > "$OUTPUT" 2>dump.log

LINES=$(wc -l < "$OUTPUT")
echo ""
echo "Done. $OUTPUT has $LINES lines ($(du -h "$OUTPUT" | cut -f1))."
echo "Upload $OUTPUT to Object Storage and we'll import it."
