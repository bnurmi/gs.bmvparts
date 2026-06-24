# BMW ETK Extraction Kit (macOS / Wine)

Goal: restore the ETK `.jetarch` archive into a TransBase database on your Mac, then export the table that maps **BMW type codes → models** to a CSV file we'll import into Postgres.

You need:
- Your local copy of `ETK-Data_3.220.006_--.jetarch` (5.7 GB) — the same file you split & uploaded to Object Storage
- This kit (`tb-win32/` + the scripts in this folder)
- ~10 GB of free disk space
- Wine (free) — install with: `brew install --cask wine-stable`
  - After installing, clear the macOS quarantine flag on the Win32 binaries: `xattr -dr com.apple.quarantine tb-win32/`

## Steps

1. **Unzip this kit** somewhere with space, e.g. `~/etk-extract/`
2. **Copy your `.jetarch` file into the kit folder** and rename it to `etk.jetarch` (just to keep the script simple). Final layout:
   ```
   ~/etk-extract/
     ├── tb-win32/         (the Win32 TransBase tools)
     ├── etk.jetarch       (your 5.7 GB archive)
     ├── 1-create-db.sh
     ├── 2-restore.sh
     ├── 3-list-tables.sh
     └── 4-dump-table.sh
   ```
3. Open Terminal, `cd ~/etk-extract/`
4. Run the scripts in order:
   ```bash
   ./1-create-db.sh         # creates an empty etk_publ database (~5 sec)
   ./2-restore.sh           # restores the .jetarch into etk_publ (~10–60 min)
   ./3-list-tables.sh       # dumps all table names + row counts → tables.txt
   ```
5. **Send me `tables.txt`.** I'll identify the typeCode→model table (likely named `MODELL`, `TYPSCHL`, `FAHRZEUG`, or similar) and tell you exactly what to put in `4-dump-table.sh`.
6. Run `./4-dump-table.sh` → produces `bmw_models.csv`. Upload that one file (~1–5 MB) to Object Storage and we're done.

## Troubleshooting

- **`wine: command not found`** → run `brew install --cask --no-quarantine wine-stable`, then `export PATH="/usr/local/bin:$PATH"` (Intel) or `/opt/homebrew/bin` (Apple Silicon)
- **First wine run is slow** — Wine builds its prefix on first launch (~30 sec). Subsequent runs are fast.
- **macOS quarantine blocks the .exe** — run `xattr -dr com.apple.quarantine tb-win32/`
- **Restore takes forever** — it's a 5.7 GB archive going through Wine; 30–60 min is normal. The script logs progress to `restore.log`.
- **Apple Silicon Macs**: Wine still works for 32-bit Win32 binaries via Rosetta + Wine's WOW64 layer; if `wine` complains about architecture, install via `brew install --cask --no-quarantine wine-crossover` instead.
