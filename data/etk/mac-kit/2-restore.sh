#!/bin/bash
# Restore the .jetarch archive into etk_publ
# This is the slow step (10–60 min depending on Mac).
set -e
cd "$(dirname "$0")"

if [ ! -f etk.jetarch ]; then
  echo "ERROR: etk.jetarch not found in current directory."
  echo "Copy your ETK-Data_3.220.006_--.jetarch here and rename it to etk.jetarch."
  exit 1
fi

export WINEPREFIX="$PWD/.wineprefix"
export WINEDEBUG=-all
TB="$PWD/tb-win32"

echo "Restoring etk.jetarch ($(du -h etk.jetarch | cut -f1)) into etk_publ..."
echo "Progress is logged to restore.log. This will take a while — go grab coffee."
echo ""

# tbarc32 is the multi-volume CD archive tool (the .jetarch is exactly that format).
# Syntax:  tbarc32 -r <archive> <db> [p=<password>]
# tbadmin is the default user; tmp is the install-time password from createdb.bat.
wine "$TB/tbarc32.exe" -r etk.jetarch etk_publ p=tmp 2>&1 | tee restore.log

echo ""
echo "Restore complete. Check restore.log for any errors."
