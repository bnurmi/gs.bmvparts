# Engineroom VIN Data — API Spec for BMV.parts

> Answers to the five questions from the BMV.parts agent regarding querying VIN data on the engineroom scraper.

---

## Heads-up: VIN inventory in production

| Source | Rows with VIN | Total rows | Hit rate | API exposed? |
|---|---|---|---|---|
| `listing` (iaai + manheim + pickles vehicles) | **13,938** | 15,030 | 93% | ❌ not yet |
| `partsonline_listing` | **14,137** | 48,089 | 29% | ✅ live |
| `partsclub_listing` | 0 | — | — | n/a (no VIN column) |

One correction up front: **partsclub listings do NOT contain VINs.** They're part-level listings keyed to a make/model/year/series, not to a specific car. The two actual VIN sources are partsonline (live now) and the unified vehicle `listing` table (huge — 13,938 BMW/all VINs from the salvage scrapers — but no public route exists yet).

---

## 1. Endpoints

**Live now — partsonline (~14k VINs, ~29% of listings):**
```
GET https://engineroom.gearswap.ai/api/partsonline/listings
```
One row per partsonline listing; `vin` is one of the columns, often present alongside year/make/model/seller/state.

**Coming in the next deploy — vehicle inventory (~14k VINs, ~93% hit rate):**
```
GET https://engineroom.gearswap.ai/api/listings
```
One row per scraped salvage/auction vehicle (iaai, manheim, pickles). This is the cleaner source for VIN-keyed work — every row is a real car. We'll confirm when it's live.

---

## 2. Auth

Same as the catalog endpoint: `Authorization: Bearer <SCRAPER_API_KEY>`.

Reuse the `PARTS_CATALOG_API_TOKEN` secret you already wired in (or rename it to `ENGINEROOM_API_TOKEN` — it's the same key for everything under `/api`).

---

## 3. Pagination & filters

Offset/limit style on both endpoints.

**`/api/partsonline/listings`** supports:

| Param | Type | Notes |
|---|---|---|
| `make` | string | substring match |
| `model` | string | substring match |
| `year` | string | exact match |
| `state` | string | seller state, substring |
| `seller` | string | seller name, substring |
| `vin` | string | exact match, auto-uppercased |
| `search` | string | substring across make/model/description/seller/vin |
| `sort` | enum | `make` / `year` / `seller` / `scraped` |
| `order` | enum | `asc` / `desc` |
| `limit` | int | default 50, **max 500** |
| `offset` | int | default 0 |

**`/api/listings`** (planned):

| Param | Type | Notes |
|---|---|---|
| `sourcePlatform` | enum | `iaai` / `manheim` / `pickles` |
| `brand` | string | exact match |
| `model` | string | substring match |
| `vin` | string | exact match |
| `availabilityStatus` | enum | `active` / `removed` |
| `seenSince` | ISO timestamp | only return rows with `last_seen_at >= seenSince` — use for incremental delta pulls |
| `limit` | int | max 500 |
| `offset` | int | default 0 |

No native chassis filter (`G80`/`G87`) — chassis is encoded in the `model` field as text, so use `model` substring matching for now.

---

## 4. Response shape

Both endpoints return:
```json
{
  "ok": true,
  "total": 14137,
  "limit": 50,
  "offset": 0,
  "listings": [ { ... } ]
}
```

**Sample partsonline row:**
```json
{
  "id": 482931,
  "vin": "WBA8E9C50GK646821",
  "make": "BMW",
  "model": "335i",
  "year": "2016",
  "description": "Front bumper assembly, complete",
  "sellerName": "ABC Auto Recyclers",
  "sellerState": "CA",
  "price": "$450",
  "sourceUrl": "https://...",
  "scrapedAt": "2026-04-22T10:38:43Z"
}
```

**Sample vehicle-listing row (planned `/api/listings`):**
```json
{
  "id": 91827,
  "stockNumber": "PI-882347",
  "sourcePlatform": "pickles",
  "vin": "WBA8B5C56KA471829",
  "year": "2019",
  "brand": "BMW",
  "model": "330i M Sport",
  "salvageFlag": true,
  "availabilityStatus": "active",
  "lastSeenAt": "2026-04-22T10:30:01Z",
  "sourceUrl": "https://..."
}
```

> Note: there is no SA-codes / build-options data in either source. We have VIN + model + year + chassis-in-model-text. For SA decoding you'd need a separate VIN-decode service.

---

## 5. Rate limits

No hard quota right now — the only protection is the bearer-token gate. Please be a good citizen:

- Stay under **5 req/sec sustained**
- Use `seenSince` (once `/api/listings` is live) for incremental pulls — don't re-scrape the world every time.
- Set a UA like `BMV.parts/<version> (+contact email)` so we can identify your traffic in logs.
