---
name: bmv.vin host rewriter single-segment rule
description: How the Express host rewriter in server/index.ts handles single-segment paths on bmv.vin, and what passthrough rules are needed for VIN tool pages.
---

# bmv.vin Host Rewriter — Single-Segment Path Rules

## The rule
Single-segment paths on `bmv.vin` (e.g., `/something`) go through this decision tree in `server/index.ts` (~line 261–318):

1. `req.url.startsWith("/api/")` → pass through
2. Multi-segment path (`/a/b/...`) → pass through unless first segment is in `BMV_VIN_REDIRECT_TO_PARTS_PREFIXES`
3. Single-segment:
   - In `BMV_VIN_RESERVED_PREFIXES` (`"chassis"`, `"year"`, `"plant"`, `"market"`, `"paint"`, `"option"`, `"guide"`, `"glossary"`, `"vin"`, `"decode"`) → pass through
   - Contains `.` (static asset) → pass through
   - Starts with `"bmw-"` → pass through (VIN tool and model landing pages)
   - Anything else → **rewritten to `/vin/{seg}`** (treated as a VIN landing)

**Why:** Valid VINs are purely alphanumeric (no dashes). So `lower.startsWith("bmw-")` unambiguously identifies VIN tool slugs (`/bmw-vin-decoder`, `/bmw-g20-vin-decoder`, etc.) and never catches a real VIN.

**How to apply:** When adding new single-segment bmv.vin SEO routes that don't start with "bmw-", either:
- Add the word to `BMV_VIN_RESERVED_PREFIXES`, OR
- Add another passthrough pattern before the `/vin/{seg}` rewrite line

Otherwise the path will silently become a VIN lookup (SPA surface, no SSR).

## Files
- `server/index.ts` lines ~234–318 (host rewriter middleware)
- `server/seo/bmv-vin-ssr-middleware.ts` (receives the (possibly rewritten) path)
