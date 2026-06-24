# BMV.parts SEO Strategy — Living Config

**Domain:** bmv.parts  
**Mission:** The largest BMW parts reference database in the world — free OEM data, part numbers, fitment, pricing, and buyer guides.  
**Tone:** Technical authority — speaks to mechanics, enthusiasts, and wreckers equally.

---

## Core Keywords

### Tier 1 — High Volume, High Commercial Intent
| Keyword | Intent | Notes |
|---|---|---|
| BMW parts | Commercial | Broad head term |
| BMW OEM parts | Commercial | High CPC |
| BMW genuine parts | Commercial | High trust signal |
| BMW parts catalog | Informational/Commercial | Core product |
| BMW parts lookup | Transactional | Part number search |
| BMW parts online | Transactional | Purchase intent |
| BMW parts Australia | Commercial + Geo | AU market |
| BMW parts USA | Commercial + Geo | US market |
| BMW parts UK | Commercial + Geo | UK market |

### Tier 2 — Model-Level Keywords (Programmatic)
Pattern: `BMW [Series] [Model] parts`

- BMW 3 Series parts, BMW 5 Series parts, BMW M3 parts, BMW M4 parts
- BMW X5 parts, BMW M2 parts, BMW 7 Series parts, BMW i4 parts

### Tier 3 — Chassis-Level Keywords (Programmatic)
Pattern: `BMW [Chassis] parts` / `BMW [Chassis] [part] for sale`

- BMW F80 parts, BMW G80 parts, BMW E46 parts, BMW E90 parts
- BMW E92 parts, BMW F10 parts, BMW G30 parts, BMW G87 parts

### Tier 4 — Part-Level Keywords (Programmatic — millions of combinations)
Pattern: `BMW [Chassis/Model] [Part Name]`

- BMW G80 M3 front bumper, BMW F80 M3 engine, BMW E92 M3 door card
- BMW G82 M4 headlight, BMW E46 M3 gearbox, BMW F10 M5 exhaust

### Tier 5 — Part Number Keywords
Pattern: `BMW part [OEM part number]`

### Tier 6 — Informational / Buyer Guide Keywords
- BMW G80 M3 buying guide, BMW E46 M3 common problems
- new BMW parts vs used BMW parts, BMW M3 parts cost
- most expensive BMW parts, BMW wreckers Australia

### Tier 7 — Comparison Keywords
- BMW G80 M3 vs G82 M4 parts, BMW F80 vs G80 M3 parts
- OEM BMW parts vs aftermarket, genuine BMW parts vs pattern parts

---

## Competitors & Gaps
| Competitor | Weakness |
|---|---|
| BMW ETK (bmw-etk.info) | No content, data only |
| RealOEM (realoem.com) | No SEO content |
| BMWPartsDeal | US-only pricing |
| FCP Euro | General European focus |
| Pelican Parts | Aging site |

**Gap:** No site combines OEM part data + rich SEO content + programmatic model/chassis/part pages at scale.

---

## Content Clusters

### Cluster 1: BMW Model Hubs (`/series/:slug`, `/chassis/:code`)
Each hub page targets `BMW [Model] Parts`.

### Cluster 2: Buyer Guides (`/guides/:slug`)
Long-form content targeting commercial and informational intent.
- Templates: 1,500–4,000 words, FAQ schema, structured data
- Topics: G80 M3 buying guide, E46 M3 common problems, OEM vs aftermarket

### Cluster 3: Comparison Pages (`/compare/:slug`)
Targets comparison search intent — strong AI Overview signal.
- Topics: G80 vs G82 parts, F80 vs G80 M3, OEM vs aftermarket

### Cluster 4: Statistics / Authority Pages (`/data/:slug`)
Original data — attracts backlinks naturally.
- Topics: most expensive BMW parts, most searched chassis, price index

### Cluster 5: How-To Guides (`/guides/:slug`)
- How to find BMW part numbers, how to use BMW parts catalog

---

## Page Templates

### Template A: Chassis × Part Page
**URL:** `/chassis/:code` (extended with part filter)
- H1: `BMW [Chassis] [Part] — OEM Part Numbers, Pricing & Fitment`
- OEM Part Numbers table, Fitment table, Pricing, FAQ schema

### Template B: Model Hub Page
**URL:** `/series/:slug`, `/chassis/:code`
- H1: `BMW [Model] [Chassis] Parts — Complete OEM Catalog`
- Chassis overview, part category grid, FAQ schema

### Template C: Buyer Guide Page
**URL:** `/guides/:slug`
- H1, Introduction, H2 sections (5–8, 1,500–4,000 words total)
- Pros/cons, common problems, part costs, FAQ schema (8–10), internal links, CTA

### Template D: Comparison Page
**URL:** `/compare/:slug`
- H1: `BMW [A] vs [B]: Parts Compatibility, Differences & Costs`
- Quick verdict box (AI Overview bait), comparison sections, tables, FAQ, links

### Template E: Statistics / Authority Page
**URL:** `/data/:slug`
- H1, key findings summary box, data tables, methodology, FAQ, sources

---

## Internal Link Strategy

### Hub → Spoke
- Series pages → chassis pages → part pages
- Every chassis page → all part categories for that chassis

### Spoke → Hub
- Every part page → chassis hub + series hub
- Every article → at least 3 part pages

### Cross-cluster
- Buyer guides → relevant part pages + comparison pages
- Comparison pages → buyer guides + chassis hubs
- Statistics pages → buyer guides + model hubs

### VIN Cross-linking
- Every chassis page → VIN decoder page on BMV.vin
- "Check your VIN →" CTA on all model and chassis pages

---

## Technical SEO Requirements

### Meta Generation Rules
- `<title>`: `BMW [Chassis] [Part] — OEM Part Numbers & Pricing | BMV.parts`
- `<meta description>`: 155 chars max, includes chassis code + part name + CTA
- `<meta keywords>`: 5–8 relevant keywords

### Open Graph
- `og:title`, `og:description`, `og:image`, `og:type`

### Structured Data (per page type)
| Page Type | Schema Types |
|---|---|
| Part page | Product, Vehicle, BreadcrumbList, FAQPage |
| Buyer guide | Article, FAQPage, BreadcrumbList |
| Comparison page | Article, FAQPage, BreadcrumbList |
| Statistics page | Article, Dataset, BreadcrumbList |
| Model hub | CollectionPage, BreadcrumbList |
| Homepage | Organization, WebSite, SearchAction |

### Sitemaps
- `sitemap-guides.xml` — buyer guides, comparison, authority pages
- `sitemap-compare.xml` — comparison pages
- `sitemap-data.xml` — statistics/authority pages
- All ping Google + Bing on update

---

## AI Keyword Discovery Engine (24-hour cycle)

### Intent Clustering
| Intent Type | Signal Words | Action |
|---|---|---|
| Commercial | buy, for sale, price, cost, cheap | Part page or buyer guide |
| Transactional | part number, OEM, genuine, order | Part page |
| Informational | what is, how to, guide, explained | Article/guide |
| Comparison | vs, versus, difference, better | Comparison page |
| How-To | how to replace, DIY, install | How-To article |
| Part Number | numeric strings, OEM codes | Part page |
| Repair Guide | repair, fix, replace, broken | How-To article |

---

## AI Content Engine (GEO-Optimised)

Every article must answer:
- **What** — definition, clear and direct
- **Why** — context and importance
- **How** — step-by-step where applicable
- **Cost** — real pricing data from catalog
- **Alternatives** — related parts, aftermarket
- **Common Problems** — failure modes, known issues

### Quick Answer Box
A 2–3 sentence direct answer at the top of every informational article — Google / AI engines can lift verbatim.

### Article Structure
H1 → Introduction (150–200 words) → H2 sections (5–8) → FAQ (8–10 questions) → Related Parts → CTA

---

## AI Refresh Engine (90-day cycle)
1. Re-run keyword analysis
2. Compare top 5 SERP results
3. Identify content gaps
4. Add new sections for gaps
5. Update statistics from live catalog
6. Expand FAQ section
7. Add new internal links
8. Update `dateModified` in Article schema
9. Re-submit URL to Google Indexing API

---

## Geographic Targeting
| Market | Priority | Language |
|---|---|---|
| Australia | Primary | English (AU) |
| United Kingdom | High | English (UK) |
| USA | High | English (US) |
| Germany | Medium | German |
| Canada | Medium | English (CA) |

---

## Monetisation Goals
| Revenue Stream | SEO Driver |
|---|---|
| Part listing referrals | Part pages → affiliate/partner links |
| Premium data access | Buyer guides → subscription upsell |
| Lead generation for wreckers | Model/chassis pages → quote forms |
| Display advertising | High-traffic informational articles |
| Sponsored content | Authority/statistics pages |

---

## Success Metrics (12-month targets)
| Metric | Target |
|---|---|
| Indexed pages | 50,000+ |
| Monthly organic visitors | 500,000+ |
| Keyword rankings (any position) | 200,000+ |
| Keywords in top 10 | 10,000+ |
| Domain Rating | 40+ |
| Backlinks | 5,000+ |
| Organic leads generated | 10,000+/month |
