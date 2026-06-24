# External BMW Parts Catalog — Candidate UI Integration Points

The new read-only client (`server/parts-catalog-client.ts`) can fetch OEM
part records, supersession info, and diagram references from the upstream
catalog (~511k parts across 33 series). No UI uses it yet. The places below
are where surfacing this data would have the most user value, in rough
priority order.

## 1. Part Detail page — `client/src/pages/PartDetail.tsx`
- **Cross-reference / supersession panel.** Show the upstream `partNumber`
  alongside `supersessionPartNumber` + `supersessionInfo` so users see when
  BMW has replaced a part with a newer SKU. We currently have no
  supersession data anywhere in the app.
- **EUR retail price strip.** The upstream record carries `price` + `currency`
  (typically EUR). This is a third independent price quote next to the
  existing US/UK/EUR-ETK pricing block.
- **Diagram thumbnail.** `diagramImagePath` + `diagramRefNumber` would let
  us render an "Originally appears on diagram #12" hint when the part is not
  yet in our local catalog.

## 2. Part Finder results — `client/src/pages/PartFinder.tsx`
- **Fallback lookup when our local DB has no hit.** After AI identifies a
  part number that we don't know about locally, call `lookupPart(pn)` and
  surface the upstream description / model series / supersession so the
  result page is never empty.
- **Confidence boost for AI-identified part numbers.** A green check next
  to a candidate part number when the upstream catalog confirms it exists
  for the guessed model.

## 3. Car Detail page — `client/src/pages/CarDetail.tsx`
- **"Also seen on this model" indicator.** When viewing a subcategory,
  call `searchByModel(car.chassis)` to flag parts present in the upstream
  catalog but missing from our local subcategory — a hint that our scrape
  is stale or incomplete for that diagram.
- **Diagram cross-link.** When `diagramImagePath` matches our local
  diagram, link out for higher-resolution upstream imagery.

## 4. VIN Decoder result — `client/src/pages/VinDecoder.tsx`
- **"Common parts for your chassis" teaser.** Once a VIN resolves to a
  chassis (e.g. G20), pull a small `searchByModel` sample to give VIN
  visitors something tangible to click into — the same model code is the
  primary key on both sides.

## 5. Models / Chassis landing pages — `SeriesLanding.tsx`, `ChassisLanding.tsx`
- **Catalog coverage badge.** Show "Upstream catalog: X parts indexed"
  beside our own count, so users (and us) can see at a glance where the
  external scrape is ahead of us.

## Out of scope until UI work is scoped
- Mirroring upstream parts into our DB.
- Background refresh / freshness tracking.
- Surfacing upstream EUR prices to anonymous (signed-out) users — the
  existing `PricingGate` model should still apply.

## Configuration
- `PARTS_CATALOG_API_URL` — base URL (default `https://engineroom.gearswap.ai`).
- `PARTS_CATALOG_API_TOKEN` — reserved for future bearer auth; when set,
  the client adds `Authorization: Bearer <token>` automatically.

## Verification
Run `npx tsx scripts/verify-parts-catalog.ts [model] [partNumber]` to
confirm the client reaches the live API and parses responses.
