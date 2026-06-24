#!/bin/bash
# List all tables in etk_publ along with row counts.
# Send the resulting tables.txt back so we can identify the right table to dump.
set -e
cd "$(dirname "$0")"

export WINEPREFIX="$PWD/.wineprefix"
export WINEDEBUG=-all
TB="$PWD/tb-win32"

# Start the TransBase server in the background, pointed at our database directory.
# The server reads dblist.ini for the list of databases to serve.
mkdir -p server
cat > server/dblist.ini <<EOF
etk_publ=$PWD/databases/etk_publ
etk_nutzer=$PWD/databases/etk_nutzer
etk_preise=$PWD/databases/etk_preise
EOF

echo "Starting tbserv32 in background..."
(cd server && wine "$TB/tbserv32.exe" -d "$PWD" 2>server.log &)
SERVER_WINE_PID=$!
sleep 5

# Build a SQL script that lists tables and row counts.
# TransBase keeps schema info in the system catalog SYSTABLE.
cat > list.sql <<'EOF'
SELECT TNAME FROM SYSTABLE WHERE CREATOR='tbadmin' ORDER BY TNAME;
QUIT;
EOF

echo "Querying table list..."
wine "$TB/tbi32.exe" -f list.sql etk_publ tbadmin tmp 2>&1 | tee tables.txt

echo ""
echo "Done. tables.txt now contains the list of tables."
echo "Send tables.txt back to me so I can pick the typeCode→model table."

# Keep the server running for the next step (4-dump-table.sh will reuse it).
echo ""
echo "NOTE: tbserv32 is still running in the background (PID logged in server/server.log)."
echo "When you're done with everything, run: pkill -f tbserv32"
