# Replit Agent Brief: Secure SEO Publishing API for GearSwap Web Properties

**Purpose:** Give Roman/Hermes a secure, authenticated way to create, update, draft, publish, validate, and internally link SEO pages/articles on GearSwap-owned web properties that are not currently writable through Shopify Admin API.

**Requested by:** Mitch  
**Prepared by:** Roman / GearSwap AI Organization CMO  
**Primary use case:** recurring SEO content engine across Quote.parts, GearSwap.ai, BMW.parts, BMW.vin, BMWBolts/BMClips-style properties, and future sites.

---

## 1. Current Publishing Reality

Roman/Hermes can publish where credentials/API access exists.

### Verified currently available in Roman profile

Current Shopify Admin credentials in Roman profile point to:

- **Shop:** `8HP.Shop`
- **Primary domain:** `8hp.shop`
- **myshopify domain:** `rtu5g2-pz.myshopify.com`
- **Verified API read access:** shop, blogs, pages, products count
- **Blog handles detected:** `8hp-guides`, plus archive blogs

### Not currently verified in Roman profile

MPerformance.parts publishing credentials are **not currently active in this Roman profile `.env`**. If MPP credentials are supplied/selected, Roman can publish MPP Shopify content using the same Shopify blog/page pattern.

### Needed for non-Shopify/non-writable properties

For domains such as:

- `quote.parts`
- `gearswap.ai`
- `gearswap.au`
- `bmw.parts`
- `bmw.vin`
- `bmbolts.com`
- `bmclips.com`
- `raceservice.au`
- future `.parts` properties

Build a secure SEO publishing API so Roman can produce and publish recurring SEO content safely.

---

## 2. Core Requirement

Create a private authenticated API that allows approved automation to:

1. Create SEO page drafts.
2. Create blog/article drafts.
3. Update existing SEO pages/articles.
4. Publish approved pages/articles.
5. Add/update metadata.
6. Add schema blocks.
7. Add internal links.
8. Validate before publish.
9. Return live URLs and status.
10. Maintain an audit log of every change.

This must be secure, auditable, and reversible.

---

## 3. Security Requirements

## Authentication

Use API token auth with strong bearer tokens.

Header:

```http
Authorization: Bearer ${SEO_PUBLISHER_API_TOKEN}
```

The token must be stored server-side as an environment variable and never exposed to the frontend.

Recommended env vars:

```bash
SEO_PUBLISHER_API_TOKEN=long-random-secret
SEO_PUBLISHER_ALLOWED_DOMAINS=quote.parts,gearswap.ai,bmw.parts,bmw.vin
SEO_PUBLISHER_DEFAULT_MODE=draft
SEO_PUBLISHER_REQUIRE_PUBLISH_APPROVAL=true
```

## Optional HMAC hardening

For stronger security, require:

```http
X-SEO-Timestamp: 2026-06-19T00:00:00Z
X-SEO-Signature: hmac_sha256(timestamp + body, SEO_PUBLISHER_HMAC_SECRET)
```

Reject requests older than 5 minutes.

## Access controls

- Only allow writes to approved domains/sites.
- Only allow content types supported by the site.
- Never allow arbitrary file writes.
- Never allow code execution.
- Never allow theme/template mutation through this API.
- Default to `draft`, not `published`, unless explicitly allowed.
- Maintain audit logs with user/agent, timestamp, endpoint, target URL, diff/summary, status.

## Rate limiting

Suggested:

- 60 requests/minute per token for reads/validation.
- 10 write requests/minute per token.
- 3 publish requests/minute per token.

---

## 4. API Endpoints

## Health / capability

### `GET /api/seo/health`

Returns API health and enabled features.

Response:

```json
{
  "ok": true,
  "site": "quote.parts",
  "environment": "production",
  "features": {
    "draft_pages": true,
    "publish_pages": true,
    "draft_articles": true,
    "publish_articles": true,
    "schema": true,
    "sitemap_refresh": true
  }
}
```

---

## Site capabilities

### `GET /api/seo/capabilities`

Response:

```json
{
  "site": "quote.parts",
  "content_types": ["seo_page", "article", "guide", "landing_page"],
  "supported_statuses": ["draft", "published", "archived"],
  "supports": {
    "title": true,
    "meta_description": true,
    "canonical": true,
    "faq_schema": true,
    "article_schema": true,
    "breadcrumbs": true,
    "internal_links": true,
    "scheduled_publish": false
  }
}
```

---

## Create SEO page

### `POST /api/seo/pages`

Creates a draft or published SEO page.

Request:

```json
{
  "status": "draft",
  "slug": "bmw-g80-m3-headlight-quote",
  "title": "BMW G80 M3 Headlight Quote Australia",
  "meta_description": "Need a BMW G80 M3 headlight? Request a quote for genuine, used or aftermarket headlights and confirm fitment before buying.",
  "h1": "BMW G80 M3 Headlight Quote Australia",
  "content_html": "<p>...</p>",
  "canonical_url": "https://quote.parts/bmw-g80-m3-headlight-quote/",
  "excerpt": "Request a BMW G80 M3 headlight quote with fitment support.",
  "category": "BMW Parts Quotes",
  "tags": ["BMW", "G80 M3", "Headlight", "Quote"],
  "schema": {
    "type": "Service",
    "faq": [
      {
        "question": "Do G80 M3 headlights vary by option package?",
        "answer": "Yes. VIN, lighting type and build date should be checked before purchase."
      }
    ]
  },
  "internal_links": [
    {
      "label": "BMW Headlight Quote",
      "url": "/bmw-headlight-quote/"
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "id": "seo_page_123",
  "status": "draft",
  "url": "https://quote.parts/bmw-g80-m3-headlight-quote/",
  "admin_url": "https://quote.parts/admin/seo/pages/seo_page_123",
  "validation": {
    "passed": true,
    "warnings": []
  }
}
```

---

## Update SEO page

### `PUT /api/seo/pages/{id_or_slug}`

Updates an existing page by ID or slug.

Must be idempotent.

Request fields same as create endpoint, all optional except target.

---

## Create article / guide

### `POST /api/seo/articles`

Request:

```json
{
  "status": "draft",
  "slug": "how-to-check-bmw-part-fitment-by-vin",
  "title": "How to Check BMW Part Fitment by VIN",
  "meta_description": "Learn how BMW VINs help confirm part fitment before ordering used, genuine or OEM replacement parts.",
  "h1": "How to Check BMW Part Fitment by VIN",
  "content_html": "<article>...</article>",
  "excerpt": "A practical guide to checking BMW part compatibility using VIN, part numbers and photos.",
  "author": "GearSwap Editorial",
  "category": "BMW Fitment Guides",
  "tags": ["BMW VIN", "BMW Parts", "Fitment"],
  "featured_image_url": "https://...",
  "schema": {
    "type": "Article",
    "faq": []
  },
  "internal_links": [
    {
      "label": "Get a BMW Parts Quote",
      "url": "/bmw-parts-quote/"
    }
  ]
}
```

---

## Validate content before publishing

### `POST /api/seo/validate`

Request:

```json
{
  "content_type": "seo_page",
  "slug": "f80-m3-brakes-on-e92-m3",
  "title": "F80 M3 Brakes on E92 M3 | Retrofit Parts Quote Australia",
  "meta_description": "Want to fit F80 M3 brakes to an E92 M3? Get a quote for calipers, rotors, pads, brackets, lines and fitment guidance in Australia.",
  "h1": "F80 M3 Brakes on E92 M3 Retrofit Guide & Parts Quote",
  "content_html": "<p>...</p>",
  "schema": {}
}
```

Validation should check:

- slug safety
- duplicate slug
- title length
- meta description length
- exactly one H1
- no visible internal SEO labels like `SEO Hub`
- no empty body
- minimum useful content length
- schema JSON validity
- canonical host match
- internal links valid format
- dangerous HTML stripped

Response:

```json
{
  "passed": false,
  "errors": [
    "Duplicate slug already exists"
  ],
  "warnings": [
    "Meta description is longer than 160 characters"
  ]
}
```

---

## Publish draft

### `POST /api/seo/publish/{id_or_slug}`

Publishes an existing draft.

Request:

```json
{
  "content_type": "seo_page",
  "confirm": true
}
```

Response:

```json
{
  "ok": true,
  "status": "published",
  "url": "https://quote.parts/f80-m3-brakes-on-e92-m3/",
  "published_at": "2026-06-19T00:00:00Z"
}
```

If `SEO_PUBLISHER_REQUIRE_PUBLISH_APPROVAL=true`, this endpoint should either:

- reject automation publishing, or
- only publish records marked `approved=true` by an admin user.

---

## List content

### `GET /api/seo/pages?status=draft&limit=50`

### `GET /api/seo/articles?status=published&limit=50`

Used to avoid duplicate content and support updates.

---

## Read single content item

### `GET /api/seo/pages/{id_or_slug}`

### `GET /api/seo/articles/{id_or_slug}`

Returns current title/meta/body/status and live URL.

---

## Archive / noindex

### `POST /api/seo/archive/{id_or_slug}`

Request:

```json
{
  "content_type": "seo_page",
  "reason": "Cannibalises stronger BMW headlight quote page"
}
```

Should either archive the page or set `noindex`, depending site architecture.

---

## Sitemap refresh

### `POST /api/seo/sitemap/refresh`

Regenerates sitemap or triggers framework revalidation.

Response:

```json
{
  "ok": true,
  "sitemap_url": "https://quote.parts/sitemap.xml",
  "refreshed_at": "2026-06-19T00:00:00Z"
}
```

---

## 5. Content Model

Recommended internal content fields:

```ts
type SeoContent = {
  id: string;
  contentType: 'seo_page' | 'article' | 'guide' | 'landing_page';
  status: 'draft' | 'published' | 'archived';
  slug: string;
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  excerpt?: string;
  contentHtml: string;
  canonicalUrl?: string;
  category?: string;
  tags?: string[];
  featuredImageUrl?: string;
  schemaJson?: Record<string, unknown>;
  internalLinks?: { label: string; url: string }[];
  author?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy: string;
  updatedBy?: string;
  source?: 'roman-hermes' | 'admin' | 'replit-agent' | 'manual';
};
```

---

## 6. Rendering Requirements

All published pages/articles must render with:

- SSR/indexable HTML where possible.
- One semantic H1.
- SEO title and meta description.
- Canonical URL.
- OpenGraph title/description/url/image where image exists.
- Breadcrumbs.
- FAQ schema when FAQs are present.
- Article schema for guides/articles.
- Clean internal links.
- Buyer-facing labels only.
- No visible `SEO Hub`, `SEO Guides`, `crawl hub`, or internal implementation wording.

---

## 7. Revalidation / Static Site Support

If the site uses static generation, add one of:

- on-demand revalidation endpoint after publish;
- server-side content fetch from database/CMS;
- buildless content layer loaded at runtime;
- queue rebuild webhook.

Recommended endpoint:

```http
POST /api/seo/revalidate
```

Request:

```json
{
  "paths": [
    "/f80-m3-brakes-on-e92-m3/",
    "/sitemap.xml"
  ]
}
```

---

## 8. Audit Log

Every mutation must log:

```ts
type SeoAuditLog = {
  id: string;
  timestamp: string;
  actor: string;
  tokenLabel?: string;
  action: 'create' | 'update' | 'publish' | 'archive' | 'validate' | 'revalidate';
  contentType: string;
  targetId?: string;
  targetSlug?: string;
  targetUrl?: string;
  summary: string;
  status: 'success' | 'failed';
  error?: string;
};
```

Add read endpoint:

```http
GET /api/seo/audit?limit=100
```

---

## 9. Roman/Hermes Usage Pattern

Roman will call these endpoints from scheduled SEO workflows.

Default behavior:

1. Create Plane task for the weekly SEO batch.
2. Generate high-quality page/article content.
3. Validate via `/api/seo/validate`.
4. Create as `draft` via `/api/seo/pages` or `/api/seo/articles`.
5. If publishing approval is enabled, leave as draft and report URLs/admin IDs.
6. If approved publishing is enabled for the token, publish and verify live URL.
7. Update Plane with evidence.

---

## 10. Acceptance Criteria

This API is done when:

- Auth rejects missing/invalid tokens.
- Valid token can create a draft SEO page.
- Valid token can create a draft article.
- Duplicate slug handling works.
- Validation catches bad content.
- Draft content can be retrieved by API.
- Publish endpoint works only under configured approval rules.
- Live page renders title/meta/H1/body/schema.
- Sitemap refresh/revalidation works.
- Audit log records every mutation.
- Roman can call it from a script without frontend login cookies.

---

## 11. Initial Test Payloads

Use these first.

### Quote.parts test draft page

```json
{
  "status": "draft",
  "slug": "test-bmw-parts-quote-api-draft",
  "title": "Test BMW Parts Quote API Draft",
  "meta_description": "Test draft page for the secure Quote.parts SEO publishing API.",
  "h1": "Test BMW Parts Quote API Draft",
  "content_html": "<p>This is a test draft created through the secure SEO publishing API. It should not be indexed or publicly promoted until approved.</p>",
  "category": "BMW Parts Guides",
  "tags": ["test", "api", "seo"]
}
```

### BMW retrofit page test

```json
{
  "status": "draft",
  "slug": "f80-m3-brakes-on-e92-m3",
  "title": "F80 M3 Brakes on E92 M3 | Retrofit Parts Quote Australia",
  "meta_description": "Want to fit F80 M3 brakes to an E92 M3? Get a quote for calipers, rotors, pads, brackets, lines and supporting parts in Australia.",
  "h1": "F80 M3 Brakes on E92 M3 Retrofit Guide & Parts Quote",
  "content_html": "<p>F80 M3 brakes are a popular OEM+ retrofit path for older M cars, but wheel clearance, brackets, brake lines and hardware need to be checked before buying parts.</p>",
  "category": "BMW Retrofit Guides",
  "tags": ["BMW", "F80 M3", "E92 M3", "Brakes", "Retrofit"]
}
```

---

## 12. Final Build Direction

Build the secure SEO publishing API first on one property, ideally `quote.parts`, then copy the pattern across the other Replit-managed properties.

Roman needs a stable API contract, not a browser-only admin form.

Once implemented, recurring SEO can safely produce weekly drafts/pages across the full portfolio without manual copy-paste.
