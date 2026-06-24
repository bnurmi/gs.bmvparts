# ETK per-VIN data audit (Task #83)

This document records what per-VIN data the leaked BMW ETK Transbase
dump under `data/etk/` actually contains, what we have already
extracted, and what the realistic ceiling is for first-party
factory-order (FA) coverage. It is the audit referenced in step 1 of
Task #83 and is the basis for the "no third-party calls for pre-2020
VINs" enforcement that lives in
`server/vin-enrichment-service.ts`.

## What is on disk

```
data/etk/
├── Daten.zip                                  # original installer payload
├── ETK-Data_3.220.006_--.md5.part[1-6]        # MD5 split files (integrity)
├── db/etk_publ/                               # 3.8 MB live Transbase instance
│   ├── disks/tbdsk001                         # primary disk image
│   ├── roms/cd/comp00[01].00[012]             # published catalog data files
│   ├── account/, prepta/, scratch/, drlog/    # Transbase runtime state
│   └── dbconf.ini                             # server configuration
├── iso/
│   ├── ISO-Files-Minus-LargeFiles/            # installer assets
│   └── transbase/                             # Transbase 5.x Windows engine
│       ├── transbase.exe, *.dll, *.lib        # binary engine
│       └── webretknutzer_tb.sql               # dealer/order DDL (see below)
├── transbase_linux/                           # Linux engine + bootstrap scripts
├── jet-extractor/                             # JetExtract* extractor utilities
├── jet-output/, jet-output3/                  # extracted installer payloads
├── extracted-jars/                            # the installer's app jars
├── pricing/                                   # etkpr2604.zip (EU price file)
├── exports/
│   ├── fztyp.psv     (6,628 type-code rows — already loaded at boot)
│   ├── fztyp_raw.psv (0 bytes — placeholder)
│   └── vin_fa.psv    (1 fixture row + comments — see below)
└── tbdata/, mac-kit/, wineprefix/             # supporting bundles
```

The 3.8 MB `db/etk_publ/` is a fully bootable Transbase database. The
parts catalog itself lives in the binary `roms/cd/comp*.000` blobs
(opaque B-tree pages — only readable through Transbase's `tbi`
client, never as plain text).

## What is in the published Transbase schema

The only DDL shipped in the dump is `webretknutzer_tb.sql` (and
`webretkpreise_tb.sql`). Every table it creates is for **dealer-side
operational state**, not vehicle build data:

| Table family            | Purpose                                                       |
|-------------------------|---------------------------------------------------------------|
| `w_firma`, `w_filiale`  | Dealership / branch records                                   |
| `w_user*`               | Dealer login + permissions + UI preferences                   |
| `w_konfig`              | Dealer-store configuration (VAT, mail server, sequences)      |
| `w_teileliste*`         | Parts-list ("shopping list") order workflow                   |
| `w_auftrag`, `w_bestell*` | Order / parts-order rows                                    |
| `w_zub_*` (IPAC)        | Accessories quoting workflow                                  |
| `w_preise`              | Dealer price overrides                                        |

There is **no per-VIN** table here. Nothing keyed on a 17-character
VIN, nothing carrying paint codes or factory SA lists, no production
date column, no build plant.

The published catalog (the `roms/cd/comp*.000` data files, surfaced
through `_INDEX.tsv` etc.) keys everything on **type code** (the
4-character `TypNr` like `2528`, `73AK`, `AB12`). That's exactly the
shape we already have extracted into `data/etk/exports/fztyp.psv` and
loaded into `bmw_models` + the runtime `EtkVehicle` cache.

## What ETK is and is not

ETK is BMW's **electronic parts catalog**. It tells you, given a
type code, which group/diagram/part number applies. It deliberately
does not include the per-VIN factory-order (FA) — that lives in
**PartsLink24 / AIR / SGTV** (the dealer vehicle-history systems).
Those systems are a separate authentication realm and are not part
of this dump.

Even if we boot the Transbase server and dump every table, we will
not find a per-VIN paint code or SA list. That data was simply never
shipped with the catalog distribution.

### Verification done

1. Inventoried every directory under `data/etk/` (see tree above).
2. `grep -i 'fahrzeug\|VIN\|fa_typ\|sonderausstattung' data/etk/iso/transbase/*.sql` → 0 hits.
3. `grep 'CREATE TABLE' data/etk/iso/transbase/extracted/MIGRA/*` → only Transbase
   internal `@@sys*` system tables.
4. `awk -F'|' '{print $2}' data/etk/exports/fztyp.psv | sort -u | wc -l` → 296
   distinct chassis identifiers — this is the per-type-code metadata,
   not per-VIN.
5. `data/etk/exports/vin_fa.psv` contains comments + one deterministic
   fixture row (`WBS32AY090FM28236`) used by the verify-vin-enrichment
   smoke test. Real per-VIN rows are populated either by an ops
   admin import (PartsLink24 FA dump → `POST /api/admin/vin-factory-options/import`)
   or by promotion of historical bimmer.work cache hits
   (`scripts/promote-cache-to-factory-options.ts`).

## Verdict

| Per-VIN field   | In ETK dump?         | Source we use                                            |
|-----------------|----------------------|----------------------------------------------------------|
| Chassis / model / engine / body / drivetrain / transmission | **Yes** (per type code) | `data/etk/exports/fztyp.psv` → `EtkVehicle` |
| Model year      | Decoded from VIN     | `server/vin-decoder.ts` (SAE year-code disambiguation)   |
| SA / FA list    | **No**               | `vin_factory_options` (admin import / promoted cache)    |
| Paint code      | **No**               | `vin_factory_options.paintCode`                          |
| Upholstery code | **No**               | `vin_factory_options.upholsteryCode`                     |
| Production date | **No**               | `vin_factory_options.productionDate`                     |
| Build plant     | Decoded from VIN pos-11 | `server/vin-decoder.ts` `BMW_PLANTS` table             |

**Realistic ceiling for first-party FA coverage from this dump alone:
zero.** Every per-VIN FA row in `vin_factory_options` today comes
from one of the three operator-driven import paths, never from the
ETK files.

## What this means for the orchestrator

Because the dump genuinely lacks per-VIN FA, the only honest behaviour
for a pre-2020 ETK-covered VIN with no FA row is:

1. Return the per-type-code vehicle metadata we *do* have (chassis,
   model, engine, body, drivetrain, transmission, plant, model year).
2. Mark Options / Paint / Upholstery / Production date as **not in our
   dataset** — never call bimmer.work / mdecoder / vindecoderz to
   fill the gap.
3. Surface the gap in the admin VIN-coverage view with a one-line
   pointer to the existing import paths (admin upload, on-disk PSV
   loader, cache promotion script).

That is exactly the policy enforced by `vin-enrichment-service.ts`'s
`isEtkCovered` gate (see Task #83). New per-VIN FA data does not
arrive here by accident — an admin has to push it through one of
those import paths.

## Step 2: extracted any new per-VIN rows?

**No.** Step 2 of Task #83 (extract any per-VIN data the audit
uncovers into `vin_factory_options` with a new `etk_dump` source tag)
is a no-op for this dump. The extraction surface is empty, so no
extractor was written. If a future ETK release ever ships per-VIN
data, this audit should be re-run and the extractor added then.
