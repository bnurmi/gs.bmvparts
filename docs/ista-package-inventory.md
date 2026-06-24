# ISTA package inventory — `BMW_ISPI_ISTA-BLP_4.59.10.istapackage`

> Task #107: figure out where SSP (Schaltplan / wiring) and FUB
> (Funktionsbeschreibung / function descriptions) live inside the
> `.istapackage` artifact in `BMV-Bucket`. Exploration only — no
> schema, no DB writes, no UI.

## TL;DR — headline finding

**SSP and FUB are NOT in this package.** The artifact in the bucket
named `BMW_ISPI_ISTA-BLP_4.59.10.istapackage` is the
**ISTA Logistic Base Package (ISTA-BLP)** — it contains BMW's
**psdzdata** (programming/coding data), not service documentation.
Wiring diagrams (SSP) and function descriptions (FUB) live in the
sibling `BMW_ISPI_ISTA-DATA_GLOBAL_*.istapackage` and the per-locale
`BMW_ISPI_ISTA-DATA_<culture>_*.istapackage` packages, which are
**not present in `BMV-Bucket`**. We need a different drop before any
SSP/FUB extractor can be written.

The follow-up task ("Build SSP/FUB extractor and schema") therefore
needs an upstream gate: **acquire and drop an ISTA-DATA package into
the bucket first**. The ISTA-BLP package we have is still useful, but
for a different purpose (ECU/ODX cross-references — see "What this
package is good for" below).

## Source artifact

| Field | Value |
| --- | --- |
| Bucket | Replit Object Storage `replit-objstore-1a5831e3-4e2b-4117-a45b-0be5d373df6a` (the in-project default; this is what the task brief calls "BMV-Bucket") |
| Object key | `BMW_ISPI_ISTA-BLP_4.59.10.istapackage` |
| Compressed size | 1,643,273,923 bytes (1.53 GiB) |
| Uncompressed size | 8,102,408,448 bytes (~7.55 GiB), 2,195 files |
| Container format | ZIP (OPC / Open Packaging Convention — has `[Content_Types].xml`, `_rels/.rels`, `package/services/digital-signature/...psdsxs`) |
| Encryption / password | None. `unzip -l` works without prompting. |
| Sibling metadata in bucket | `BMW_ISPI_ISTA-META_4.59.14.xml` (8.7 kB, full ISTA 4.59 package manifest) and `BMW_ISPI_ISTA-META_SDP_4.59.10.xml` (5.3 kB, SDP delta manifest) |

### Where the bytes live during this exploration
- Package downloaded once to `/tmp/ista/BMW_ISPI_ISTA-BLP_4.59.10.istapackage` (32 GiB free on `/tmp` in this container, comfortable headroom for ~7.5 GiB extraction if needed).
- We chose **`/tmp` over Object Storage scratch** because the package is one shot, exploration-only, and we never need to extract the multi-GB `KIS.data` HSQLDB blobs to answer the SSP/FUB question — file listing + selective `unzip -p` of small XML/manifest files was enough. No artifacts of this exploration are pushed back to the bucket.
- Raw enumeration alongside this human doc: `docs/ista-package-inventory/file-listing.txt` (`unzip -l` output, 2,200 lines) and `docs/ista-package-inventory/brv-codes.txt` (the 21 chassis-group "BRV" codes covered).

## Top-level structure of the archive

Path counts from the full enumeration:

| Top-level | Files | Notes |
| --- | --- | --- |
| `psdzdata/` | 2,189 | All payload (programming + diagnostic data) |
| `package/services/digital-signature/...` | 3 | OPC digital signature (`origin.psdsor`, `_rels`, `c0…psdsxs`) |
| `_rels/.rels` | 1 | OPC root relationships |
| `LogisticInstallationDescription.xml` | 1 | 2.83 MB — the package's installer manifest |
| `[Content_Types].xml` | 1 | OPC content-type registry |

File-extension distribution inside `psdzdata/`:

| Ext | Count | What it is |
| --- | --- | --- |
| `.odx-d` | 1,028 | ODX Diagnostic Layer (per ECU base-variant) |
| `.odx-f` | 544 | ODX Flash data (programming jobs) |
| `.xml` | 197 | Mostly `cseq.xml`, `fseq.xml`, `sweseq_*.xml`, `map2basename.xml`, `taskextensions.xml`, `blumap_*.xml` (programming-sequence + bus-mapping inputs) |
| `.pdx` | 41 | Packed ODX bundles (zips of ODX) |
| `.odx-v` | 24 | ODX Vehicle-Info (per-chassis vehicle descriptor) |
| `.odx-c` | 8 | ODX Communication Parameters (`UDS_BMW_CPS`, `KWP_BMW_CPS`) |
| `.odx-m` | 2 | ODX Multi-ECU jobs |
| `.signature` | 21 | One per `kiswb/<BRV>/` directory (manifest signature) |
| `.script` / `.properties` / `.manifest` / `.data` | 21 each | Per `kiswb/<BRV>/` — HSQLDB 2.7.4 readonly database files (KIS workbench DB) |
| `.jar` | 7 | `psdzdata/extLibs/codesyslib.jar`, `kis.jar` |
| `.<NNN_NNN_NNN>` (versioned shadow files) | ~50 | `*.zip.<rev>`, `KIS.data.<rev>`, etc. — versioning sidecars |

### `psdzdata/` decomposed

```
psdzdata/
├── extLibs/
│   ├── codesyslib.jar
│   └── kis.jar                     # 25.9 MB — the runtime that reads KIS.data
├── kiswb/                          # KIS WorkBench: per-chassis-group HSQLDB
│   ├── F001/  F010/  F020/  F025/  F056/
│   ├── G045/  G070/
│   ├── I001/  I020/                # Mini
│   ├── J001/                       # Mini-derivative
│   ├── K001/  KE01/  KS01/         # Motorrad / EV variants
│   ├── NA05/                       # ?
│   ├── RR21/                       # Rolls-Royce
│   ├── S15A/  S15C/  S18A/         # Spartanburg-built X-line
│   ├── U006/                       # UKL2 (front-drive)
│   └── X001/  XS01/                # X / NEUE KLASSE
│       ├── KIS.data                # large (250 MB – 744 MB) HSQLDB cached table file
│       ├── KIS.script              # SQL DDL + DML (CREATE TABLE … SET TABLE … INSERT …)
│       ├── KIS.properties          # readonly=true, version=2.7.4
│       ├── .manifest               # SHA-512 of KIS.{script,properties,data}
│       └── .manifest.signature     # detached signature
└── mainseries/                     # ODX + programming sequences per chassis × I-step
    └── <BRV>/<BRV>_YY_MM_NNN_V_VVV_VVV_VVV>/
        ├── mapping/
        │   ├── cseq.xml            # Coding sequence ECU dependency graph
        │   ├── fseq.xml            # Flash sequence ECU dependency graph
        │   ├── sweseq_*.xml        # Per-software-entity flash sequences
        │   ├── map2basename.xml    # Logical link → ODX base-variant mapping
        │   ├── taskextensions.xml  # Programming task extensions
        │   └── blumaps/blumap_*.xml # Bus / logical-link map
        └── odx/src/
            ├── odx-d/<ECU>.odx-d   # 1,028 ECU base-variant descriptors
            ├── odx-f/<ECU>.odx-f   # 544 flash-data documents
            ├── odx-c/{UDS|KWP}_BMW_CPS.odx-c
            └── odx-v/<BRV>.odx-v   # Vehicle-info-spec for the chassis group
```

The 21 `kiswb/` chassis-group ("BRV") codes covered:
`F001, F010, F020, F025, F056, G045, G070, I001, I020, J001, K001,
KE01, KS01, NA05, RR21, S15A, S15C, S18A, U006, X001, XS01`.
These are *programming chassis groups*, not the consumer chassis codes
(E90, F30, G20, …) we use elsewhere in BMV.parts — `F010` here covers
many F-family bodies, `G070` covers G-family, etc. The mapping back to
consumer chassis is implicit in `LogisticInstallationDescription.xml`
and in the per-BRV `<BRV>.odx-v` vehicle-info-spec.

## SSP (Schaltplan / wiring) — **NOT PRESENT**

Evidence:
- `grep -iE 'schaltplan|wiring|ssp|circuit'` over the full file
  listing and over the 2.83 MB `LogisticInstallationDescription.xml`
  returns **zero hits**.
- No SVG / PNG / DGN / DXF / CGM / SCH / wiring-diagram-format files
  anywhere — the extension distribution above is exhaustive
  (counted from `unzip -l`).
- The XML files that exist are programming-sequence files (cseq, fseq,
  sweseq, map2basename, blumap, taskextensions) and ODX
  (ISO 22901 diagnostic descriptions) — neither carries pin-level
  wiring.

Where SSP actually lives in the broader ISTA distribution: inside the
ISTA-DATA packages listed in `BMW_ISPI_ISTA-META_4.59.14.xml` (see
"What we'd actually need to grab next" below), under
`Rheingold\TRIC\sgdat\` and the `data\swe\` tree of the *installed*
ISTA application. None of that ships in ISTA-BLP.

## FUB (Funktionsbeschreibung / function descriptions) — **NOT PRESENT**

Evidence:
- Same grep over file listing and `LogisticInstallationDescription.xml`
  for `funktion|fub|FuncDesc|description` returns **zero hits**
  matching FUB's expected naming (BMW FUB files are typically named
  `FUB_*.xml` or sit under `funktionsbeschreibung/` / `Rheingold/.../FUB`).
- The closest thing in the package is the `<LONG-NAME>` field on each
  ODX base-variant — e.g. `AAG.odx-d` carries
  `<LONG-NAME>Anhängermodul (HighSpeed CAN)</LONG-NAME>`. That's a
  one-line ECU title, not a function description.
- No HTML, no rich-text, no `Texts*` / `Symptom*` / `Procedure*` tables
  anywhere — those live in ISTA-DATA's SQLite/XML procedure store, not
  in ISTA-BLP.

## Cross-references that the BLP package *does* expose

Even though SSP/FUB are absent, the package is internally
cross-referenced and that is informative for any future schema:

- **Chassis-group → ECU base-variant**: the per-chassis
  `mapping/cseq.xml` and `fseq.xml` enumerate every ECU short-name
  the chassis can ship with (e.g. `AAG`, `ACSM`, `DSC`, `HU_NBT`,
  `KOMBI`, `EGS`, …) plus its `physicalOffset` (the diagnostic
  address). These `baseVariantName` values match the file names of
  the `odx-d` files one-to-one.
- **ECU → diagnostic address / protocol**: each `<ECU>.odx-d` carries
  `BASE-VARIANT` → `COMPARAM-REF` → `PROTOCOL-SNREF` (e.g.
  `ISO_14229_BMW_TCP`) and a baud-rate value, plus
  `<PARENT-REF DOCREF="PROG_UDS_DLC">` / `COD_UDS_DLC` linking it to
  the programming/coding functional groups.
- **Logical link → ECU mapping over time**: `map2basename.xml` records
  `MapBaseVariant from="BAT" to="BAT_INFRACAN"` rows scoped by `BRV`,
  `SerienEinsatzTermin` (start week, e.g. `22-07`) and `Included/BR`
  (consumer chassis like `G005`, `G018`, `RR25`). This is the only
  spot in the package that bridges programming-chassis to
  consumer-chassis codes.
- **KIS workbench tables** (`kiswb/<BRV>/KIS.script`) — readonly
  HSQLDB 2.7.4 schemas with German-named tables that are clearly
  about logistical/programming relationships, not service
  documentation:
  - `BORDNETZTEILNEHMER` (bus participant / ECU node) — `NAME`,
    `DIAGNOSEADRESSE`, `BESCHREIBUNG`
  - `LOGISTISCHESTEIL` (logistical part) — `SACHNR` (BMW part #),
    `KOSTEN_FLASHEN`, `KOSTEN_EINBAU`, `NAME`, `BESTELLOPTION`
  - `LOGISTISCHEVERWENDUNG`, `TECHNISCHEVERWENDUNG`,
    `ALTERNATIVENMAPPING`, `FARBMAPPING`, `BNTNMAPPING`,
    `ZUSGESTEILMAPPING`, `EINSATZBEDINGUNG`, `INFORMATIONWISSENSBASIS`,
    `FAHRZEUGTYP`, `BRV`, `VERLGUELTA`, `UEBKOMP{1,2A,2B,3}`,
    `ZUSBAUKOMP{1,2A,2B}`, …

  Notably `LOGISTISCHESTEIL.SACHNR` is a BMW part number — the same
  `parts.partNumber` shape we already store. So if any cross-reference
  *is* worth pulling out of this artifact, it's the ECU ↔ part-number ↔
  chassis-group ↔ I-step relation in those KIS tables, not SSP/FUB.

## Localized copies

- ISTA-BLP itself is single-locale — strings inside ODX `LONG-NAME`
  tags are German (e.g. "Anhängermodul (HighSpeed CAN)"). There are
  **no per-language variants** of the BLP package itself.
- Localization in the ISTA ecosystem is handled by the
  `BMW_ISPI_ISTA-DATA_<culture>_4.59.12.istapackage` family
  (see meta XML below), one ~47 GB package per culture
  (`en-GB`, `en-US`, `de-DE`, `fr-FR`, `es-ES`, `it-IT`, `nl-NL`,
  `pt-PT`, `sv-SE`, `tr-TR`, `ru-RU`, `el-GR`, `pl-PL`, `cs-CZ`,
  `ja-JP`, `ko-KR`, `zh-CN`, `th-TH`, …).
- That means localization is a per-culture decision for SSP/FUB once
  we get those packages — currently moot.

## What the META XML tells us (and what's missing from the bucket)

`BMW_ISPI_ISTA-META_4.59.14.xml` enumerates every package in the
ISTA 4.59 release. Excerpt of the package types relevant here:

| `packageType` | Example file | targetSize | In bucket? |
| --- | --- | ---: | :---: |
| `SYSTEM` | `BMW_ISPI_ISTA-APP_4.59.12.33212.msi` | 3.0 GB | no |
| `LOGISTIC_BASE` | `BMW_ISPI_ISTA-BLP_4.59.10.istapackage` | 1.54 GB | **yes** (this file) |
| `ICOMFW_NEXT` | `BMW_ISPI_ICOM-Next-FW_04-26-10.msi` | 138 MB | no |
| `DIAGNOSE_DATA` | `BMW_ISPI_ISTA-DATA_GLOBAL_4.59.12.istapackage` | **36.0 GB** | no |
| `DIAGNOSE_LOCALIZED_DATA` | `BMW_ISPI_ISTA-DATA_<culture>_4.59.12.istapackage` × ~20 cultures | ~46–53 GB each | no |

Plus the SDP delta in `BMW_ISPI_ISTA-META_SDP_4.59.10.xml`:
`BMW_ISPI_ISTA_DELTA-SDP_4.59.10.istapackage` (24.85 GB,
`packageType=SWI_DATA_DELTA`).

→ The two `DIAGNOSE_*` package types are where SSP/FUB live, and
neither is in the bucket.

## 10–20 sample records

Captured for shape-checking; raw extracts in the doc above:

1. **`LogisticInstallationDescription.xml`** root: `<InstallDescription>`
   → `<VersionInfo>` (Version=4.59.10, Type=Full, Mode=TEST,
   InitialVersion=4.58.42), then a single
   `<Package Name="pdx-bundle" Category="V-IC">` listing every
   directory and file the installer must lay down.
2. **`psdzdata/kiswb/F001/KIS.properties`**: HSQLDB header —
   `version=2.7.4`, `readonly=true (set to true by SOLIS)`.
3. **`psdzdata/kiswb/F001/KIS.script`**: HSQLDB DDL — schemas
   `PUBLIC` and `KIS`, ~30 cached tables incl. `BORDNETZTEILNEHMER`,
   `LOGISTISCHESTEIL`, `LOGISTISCHEVERWENDUNG`, `FAHRZEUGTYP`, `BRV`,
   `EINSATZBEDINGUNG`, `INFORMATIONWISSENSBASIS`, `ZUSBAUKOMP{1,2A,2B}`,
   `UEBKOMP{1,2A,2B,3}`, `ZUSGESTEILMAPPING`, `BNTNMAPPING`,
   `FARBMAPPING`, `ALTERNATIVENMAPPING`, `VERLGUELTA`,
   `TECHNISCHEVERWENDUNG`. Foreign keys reference `BORDNETZTEILNEHMER`
   and `LOGISTISCHESTEIL`. KIS-user password digest present, no real
   secrets.
4. **`psdzdata/kiswb/F001/.manifest`**: `KIS.{script,properties,data}`
   each with a SHA-512.
5. **`psdzdata/mainseries/F001/F001_25_11_550_V_004_000_000/mapping/cseq.xml`**:
   coding sequence DAG, e.g.
   `<ECU><baseVariantName name="DSC"/><diagnosticAddress physicalOffset="41"/></ECU>`,
   ECU change history in comments dating back to 2007.
6. **`…/mapping/fseq.xml`**: same shape, *flash* sequence; properties
   `supportsParallelMostFlash=true`, `disabledMostParallelECUs=MULF%85,ZGW%16`.
7. **`…/mapping/map2basename.xml`**: `<MapBaseVariant from="BAT" to="BAT_INFRACAN"><BRV>S18A</BRV><SerienEinsatzTermin start="22-07"/><Included><BR>G007</BR></Included></MapBaseVariant>` — the only consumer-chassis bridge in the package.
8. **`…/odx/src/odx-d/AAG.odx-d`**: ODX 2.0.1, `DIAG-LAYER-CONTAINER` →
   `BASE-VARIANT SHORT-NAME=AAG`,
   `LONG-NAME=Anhängermodul (HighSpeed CAN)`,
   `COMPARAM-REF DOCREF=UDS_BMW_CPS PROTOCOL=ISO_14229_BMW_TCP VALUE=62500`,
   parents `PROG_UDS_DLC`, `COD_UDS_DLC`.
9. **`…/odx/src/odx-v/F001.odx-v`**: vehicle-info-spec, `INFO-COMPONENT
   xsi:type="OEM" SHORT-NAME=BMW`,
   `INFO-COMPONENT xsi:type="MODEL-YEAR" SHORT-NAME=F001`, doc revision
   `2006-06-30 Initial Release`.
10. **OPC plumbing**: `[Content_Types].xml`, `_rels/.rels`,
    `package/services/digital-signature/origin.psdsor` and a
    `c079f4ef…psdsxs` xml-signature blob (Microsoft OPC signing).

## EasyUltra contact

Not yet contacted as of this exploration — the user will reach out.
The findings above already conclusively answer the SSP/FUB-presence
question for *this* package, so the EasyUltra response is most useful
for confirming **where in the ISTA-DATA tree** SSP/FUB live (so we
can target the next download precisely) and for password/encryption
notes on the DATA packages. To fold in once received:

> *(placeholder — append EasyUltra's reply here verbatim or
> summarized; even a "paths X, Y, Z confirmed" line is enough)*

## Recommendation

1. **Do not build an SSP/FUB extractor against this package.** It
   does not contain SSP or FUB. Doing so would be wasted effort.
2. **Acquire an ISTA-DATA package** (`BMW_ISPI_ISTA-DATA_GLOBAL_*` plus
   one localized culture, probably `en-GB` first) and drop it into
   `BMV-Bucket`. Sizes from the META XML: GLOBAL ≈ 36 GB, en-GB ≈ 47 GB —
   the en-GB pull alone is ~30× this exploration's download. Plan
   storage and bandwidth accordingly. The downstream
   "Build SSP/FUB extractor and schema" task should be **gated on
   that drop landing in the bucket**, with a re-do of this kind of
   inventory against the new artifact as its first step.
3. **Repurpose this BLP package separately.** What it *does* uniquely
   give us is an authoritative map of:
   - every ECU short-name BMW ships (1,028 base variants),
   - per-chassis-group programming/coding sequences and
     diagnostic addresses,
   - logistical-part-number ↔ ECU ↔ chassis-group ↔ I-step
     relations in the KIS workbench HSQLDB tables.

   That's not in scope for Task #107, but it is a candidate for a
   future "ECU + I-step enrichment" task feeding the part-detail
   pages — worth flagging so it doesn't get lost.
4. **Schema-keying guidance for the future SSP/FUB extractor** (still
   useful even though it'll really run against ISTA-DATA): use
   ECU `<BASE-VARIANT SHORT-NAME>` (e.g. `AAG`, `DSC`, `KOMBI`,
   `HU_NBT`) as the join axis between parts ↔ wiring ↔ function
   text. ECU names are stable across BMW's docs, ISTA, and ETK part
   notes. Cross-reference to the consumer chassis (E/F/G/U/I/RR
   codes) goes via `map2basename.xml`'s `<BR>` elements
   (programming-BRV → consumer-chassis), not directly.
5. **Storage footprint estimate**: extracting *all* SSP+FUB content
   from a single ISTA-DATA package is in the low-tens-of-GB range
   uncompressed (the GLOBAL package is 36 GB, but most of that is
   procedure/diagnostic content; SSP+FUB selectively is a fraction).
   We won't know the exact subset until we have the DATA package in
   hand and can repeat this kind of inventory.
6. **Licensing flag — needs user decision before *anything*
   user-facing is built.** ISTA content (SSP, FUB, procedures, ODX)
   is BMW AG copyrighted and the BLP package carries an OPC digital
   signature (`c079f4ef…psdsxs`) — this is licensed dealer/diagnostic
   IP, not public docs. Public republishing of substantial extracts
   could draw a takedown / legal notice from BMW AG. Internal use
   for enrichment (improving our own part descriptions, ECU notes,
   chassis pages) is a much safer posture than publishing diagrams or
   procedure text verbatim. **The user must explicitly decide the
   redistribution posture before the SSP/FUB extractor's output
   ever reaches a public-facing surface on `bmv.parts` or `bmv.vin`.**

## Out-of-scope items honoured

- No DB tables created.
- No imports into PostgreSQL.
- No UI, admin pages, or sitemap entries built.
- `SQLiteDBs4.55.12.7z` (Task #105's lane) untouched.
- Auto-ingest worker not built.
- Licensing flag raised but not resolved.
