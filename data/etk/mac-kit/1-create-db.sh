#!/bin/bash
# Create empty TransBase databases (etk_publ is the one that will hold the catalog)
set -e
cd "$(dirname "$0")"

export WINEPREFIX="$PWD/.wineprefix"
export WINEDEBUG=-all
TB="$PWD/tb-win32"

mkdir -p databases
rm -rf databases/etk_publ databases/etk_nutzer databases/etk_preise

echo "Initializing wine prefix (first time only — may take 30s)..."
wine wineboot --init 2>/dev/null || true

echo "Creating etk_publ (the main catalog DB)..."
wine "$TB/tbadm32.exe" -cf etk_publ p=tmp h="$PWD/databases/etk_publ" typ=E ps=4096 lc=1024 rs=512000 d=,512000 cp=utf8

echo "Creating etk_nutzer (users — small)..."
wine "$TB/tbadm32.exe" -cf etk_nutzer p=tmp h="$PWD/databases/etk_nutzer" cp=utf8

echo "Creating etk_preise (prices — small)..."
wine "$TB/tbadm32.exe" -cf etk_preise p=tmp h="$PWD/databases/etk_preise" cp=utf8

echo "Done. Databases created in ./databases/"
ls -la databases/
