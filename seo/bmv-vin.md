# BMV.vin SEO Strategy — Living Configuration
_Last updated: June 2026. This is the canonical reference for all SEO decisions on bmv.vin._

---

## Domain & Brand Positioning

| Field | Value |
|---|---|
| **Domain** | bmv.vin |
| **Purpose** | VIN decoding, build sheet lookup, options identification, production data |
| **Positioning** | The most accurate, most detailed BMW VIN decoder on the internet — free, instant, backed by real BMW factory data |
| **Tone** | Authoritative and informative. Speaks to buyers, mechanics, enthusiasts, insurance professionals |
| **Key differentiator** | Surfaces real BMW factory build data (options, paint, production date, plant) — not generic VIN database guesses |

---

## Core Keywords

### Tier 1 — Head Terms (VIN Decoder)
| Keyword | Intent | Volume (est.) |
|---|---|---|
| BMW VIN decoder | Transactional | 40,000+ |
| BMW VIN lookup | Transactional | 25,000+ |
| BMW VIN check | Transactional | 15,000+ |
| BMW VIN number decoder | Informational | 8,000+ |
| decode BMW VIN | Transactional | 10,000+ |
| free BMW VIN decoder | Transactional | 5,000+ |
| BMW VIN decoder free | Transactional | 5,000+ |
| check BMW VIN number | Transactional | 4,000+ |

### Tier 2 — Build Sheet & Options
| Keyword | Intent |
|---|---|
| BMW build sheet lookup | Transactional |
| BMW options lookup | Transactional |
| BMW build sheet by VIN | Transactional |
| BMW options by VIN | Transactional |
| BMW paint code lookup | Transactional |
| BMW paint code by VIN | Transactional |
| BMW production date lookup | Transactional |
| BMW production date by VIN | Transactional |
| BMW plant code lookup | Informational |

### Tier 3 — Specific Field Lookups
| Keyword | Intent |
|---|---|
| BMW engine code by VIN | Transactional |
| BMW transmission code VIN | Transactional |
| BMW model year by VIN | Transactional |
| BMW original colour from VIN | Transactional |

### Tier 4 — Model-Specific VIN (Programmatic)
Pattern: `BMW [Chassis] VIN decoder`

Examples: BMW M3 VIN decoder, BMW G80 M3 VIN decoder, BMW F80 M3 VIN decoder, BMW E46 M3 VIN decoder, BMW X5 VIN decoder, BMW G05 X5 VIN decoder, BMW i4 VIN decoder, BMW 3 Series VIN decoder

### Tier 5 — Informational / How-To
| Keyword | Intent |
|---|---|
| how to read BMW VIN number | Informational |
| what does BMW VIN number mean | Informational |
| BMW VIN structure guide | Informational |
| where is BMW VIN number | Informational |
| BMW SA option codes list | Informational |

### Tier 6 — Buyer / Pre-Purchase Intent
| Keyword | Intent |
|---|---|
| BMW VIN check before buying | Commercial |
| BMW used car VIN check | Commercial |
| BMW history check by VIN | Commercial |
| BMW pre-purchase VIN check | Commercial |
| check BMW mileage by VIN | Commercial |

### Tier 7 — Comparison
| Keyword | Intent |
|---|---|
| best BMW VIN decoder | Commercial |
| BMW VIN decoder vs AutoCheck | Comparison |
| BMW VIN decoder comparison | Comparison |

---

## Content Clusters

### Cluster 1: VIN Tool Landing Pages (Template A)
One page per VIN data point:
- `/bmw-vin-decoder` — BMW VIN Decoder hub
- `/bmw-build-sheet-lookup` — BMW Build Sheet by VIN
- `/bmw-paint-code-lookup` — BMW Paint Code by VIN
- `/bmw-production-date-lookup` — BMW Production Date by VIN
- `/bmw-engine-code-lookup` — BMW Engine Code by VIN
- `/bmw-options-lookup` — BMW Factory Options by VIN
- `/bmw-plant-code-lookup` — BMW Production Plant Lookup
- `/bmw-model-year-lookup` — BMW Model Year by VIN

### Cluster 2: Model-Specific VIN Pages (Template B)
`/bmw-{chassis}-vin-decoder` — one per chassis code, programmatic from database.

### Cluster 3: How-To Articles (Template C, /guide/:slug)
- how-to-read-bmw-vin-number
- bmw-vin-structure-explained
- how-to-find-bmw-build-sheet
- what-does-bmw-vin-tell-you
- bmw-sa-option-codes-complete-guide
- where-to-find-vin-on-bmw

### Cluster 4: Buyer Guides (Template D, /guide/:slug)
- bmw-used-car-vin-check-buyers-guide
- what-to-check-before-buying-used-bmw
- bmw-history-check-what-your-vin-reveals
- bmw-mileage-verification-by-vin

### Cluster 5: Comparison Pages (Template E, /compare/:slug)
- `/compare/best-bmw-vin-decoders`
- `/compare/bmv-vin-vs-vindecoderz`
- `/compare/free-vs-paid-bmw-vin-check`

### Cluster 6: Statistics / Authority Pages (Template F, /data/:slug)
- `/data/most-popular-bmw-options` — Most Popular BMW Options (live data)
- `/data/most-common-bmw-paint-colours` — Most Common BMW Paint Colours
- `/data/bmw-production-plant-stats` — Production Plant Statistics
- `/data/most-decoded-bmw-chassis` — Most Searched Chassis on BMV.vin

---

## URL Conventions

| Template | Pattern | Example |
|---|---|---|
| A: VIN Tool | `/bmw-{tool-slug}` | `/bmw-vin-decoder` |
| B: Model VIN | `/bmw-{chassis}-vin-decoder` | `/bmw-g80-vin-decoder` |
| C/D: Guide | `/guide/{slug}` | `/guide/how-to-read-bmw-vin-number` |
| E: Comparison | `/compare/{slug}` | `/compare/best-bmw-vin-decoders` |
| F: Statistics | `/data/{slug}` | `/data/most-popular-bmw-options` |

---

## Meta Generation Rules

| Page Type | Title Pattern |
|---|---|
| VIN tool | `BMW {Tool} — Free, Instant & Accurate \| BMV.vin` |
| Model VIN | `BMW {Chassis} VIN Decoder — Free {Chassis} VIN Lookup \| BMV.vin` |
| How-to guide | `{H1} — BMW VIN Guide \| BMV.vin` |
| Buyer guide | `{H1} \| BMV.vin` |
| Statistics | `{H1} — BMW VIN Data \| BMV.vin` |
| Comparison | `{H1} — BMW VIN Decoder Comparison \| BMV.vin` |

---

## Structured Data (per page type)

| Page Type | Schema Types |
|---|---|
| VIN tool page | WebApplication, FAQPage, BreadcrumbList |
| Model VIN page | Vehicle, FAQPage, BreadcrumbList |
| How-to guide | Article, HowTo, FAQPage, BreadcrumbList |
| Buyer guide | Article, FAQPage, BreadcrumbList |
| Comparison | Article, FAQPage, BreadcrumbList |
| Statistics | Article, Dataset, BreadcrumbList |
| Homepage | Organization, WebSite, SearchAction |

---

## Sitemap Structure

- `/sitemap.xml` — index sitemap
- `/sitemap-tools.xml` — VIN tool landing pages (Template A)
- `/sitemap-models.xml` — model-specific VIN pages (Template B)
- `/sitemap-guides.xml` — articles, guides, comparisons, statistics

VIN result pages (`/{VIN}`) are **excluded** — they canonical back to `/bmw-vin-decoder`.

---

## AI Content Engine

**Model:** GPT-4o  
**GEO / AI Overview structure (every page must answer):**
1. **What** — clear definition
2. **Why** — why it matters
3. **How** — step-by-step
4. **Cost** — free vs paid context
5. **Alternatives** — other tools / manual methods
6. **Common Problems** — VIN not found, partial decode, errors

**Quick Answer box:** 2–3 sentence direct answer on every page (AI Overview bait).

**Refresh cycle:** Every 90 days per page via `seo_refresh_queue` table.

---

## Keyword Discovery (24-hour cycle)

**Sources:**
- Seeded VIN-intent pattern library (Tier 1–7 above)
- Per-chassis expansion (BMW {chassis} VIN decoder × every chassis in database)
- Intent clustering: tool | informational | pre-purchase | comparison | model-specific

**Score & upsert:** Into `seo_keywords` table, scoped by `project = 'bmv.vin'`.

---

## Internal Link Strategy

```
VIN Decode Result → "Find {Chassis} Parts →" (bmv.parts/chassis/{code})
VIN Tool Hub → Spoke Tools (build sheet, paint, production date, engine code, …)
Guide → Tool ("Try it now" CTA)
Buyer Guide → Carvertical affiliate (mileage/history check)
Chassis VIN Page → BMV.parts chassis hub
```

---

## Monetisation

| Revenue | SEO Driver |
|---|---|
| Carvertical affiliate | Buyer guide pages → mileage/history check links |
| Parts cross-sell | Every decode → "Find parts for your BMW" → BMV.parts |
| Premium VIN reports | Free decode → upsell full history |
| Display advertising | How-to / explainer articles |
| B2B API | Authority positioning → enterprise leads |

---

## Geographic Priority

| Market | Priority | Notes |
|---|---|---|
| Australia | Primary | PPSR link, compliance plate context |
| United Kingdom | High | DVLA cross-reference |
| USA | High | NHTSA, Carfax comparison |
| Germany | Medium | OEM home market, de/DE hreflang |
| Canada | Medium | Similar to US |

---

## Competitors

| Competitor | Weakness |
|---|---|
| VINDecoderZ | Generic, not BMW-specific |
| Bimmer.work | Limited content, no SEO |
| MDEcoder | Paid, no content layer |
| AutoCheck | General, not BMW-specialist |
| Carfax | General, US-heavy |
| EpicVIN | Generic, low trust |

**Gap:** No site combines BMW-specific accuracy + rich SEO content + programmatic model/chassis pages + free tool. BMV.vin owns this position.

---

## 12-Month Success Targets

| Metric | Target |
|---|---|
| Indexed pages | 10,000+ |
| Monthly organic visitors | 200,000+ |
| VIN decodes / month | 100,000+ |
| Keywords ranking | 50,000+ |
| Keywords in top 10 | 5,000+ |
| Domain Rating | 35+ |
| Carvertical affiliate clicks | 5,000+/month |
| Cross-referred to BMV.parts | 20,000+/month |
