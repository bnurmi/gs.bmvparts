// bmv.vin host-specific sitemap subtree (Task #96, T007).
// Shards: /sitemap-pages, -chassis, -facets, -guides, -glossary, -vins-N.
// Threshold-driven inclusion (>= FACET_SITEMAP_MIN_COHORT) with real
// MAX(updated_at) lastmod values per cohort. /robots.txt allows the first
// FACET_HUB_CRAWLABLE_PAGE_LIMIT pages and disallows the long tail.
// All handlers short-circuit unless `req.bmvVinHost === true`.

import type { Express, Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db, bmvVinStorage } from "../storage";
import { hasValidVinCheckDigit } from "./vin-landing";
import {
  BMV_VIN_BRANDS, BMV_VIN_FACET_KINDS,
} from "../../shared/bmv-vin/feature-registry";
import { bmvVinLinks, BMV_VIN_BASE } from "../../shared/bmv-vin/links";
import { FACET_HUB_CRAWLABLE_PAGE_LIMIT, LOOKUP_PAGE_SLUGS } from "./bmv-vin-pages";

const SITEMAP_MAX_URLS = 45_000;
// Threshold-driven facet inclusion: every facet value with at least this many
// VINs gets its own sitemap entry. (Spec says hubs below the noindex threshold
// of 3 are noindexed — so we publish only cohorts >= 3.) No top-N cap; the
// per-shard 45k URL ceiling is enforced separately via the shard layout.
const FACET_SITEMAP_MIN_COHORT = 3;

/** Mounts bmv.vin-specific /robots.txt, /sitemap.xml, and shard handlers.
 *  Each handler is a no-op on bmv.parts so the canonical sitemap routes in
 *  server/routes.ts continue to win on the catalog host.
 */
export function mountBmvVinSitemaps(app: Express): void {
  app.get("/robots.txt", (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    // Vanity-host policy:
    //   - allow everything by default
    //   - explicitly Allow `?page=1` through `?page=${LIMIT}` (Allow wins
    //     over Disallow when both match because it is the more specific
    //     pattern — Googlebot resolves overlap by longest match)
    //   - then Disallow any remaining `?page=` so deep facet tail pages
    //     don't burn crawl budget
    //   - admin / auth surfaces are 301-redirected to bmv.parts at the
    //     server-index layer, but we still Disallow them here so logs stay
    //     clean
    const lines: string[] = [
      `User-agent: *`,
      `Allow: /`,
    ];
    for (let i = 1; i <= FACET_HUB_CRAWLABLE_PAGE_LIMIT; i++) {
      lines.push(`Allow: /*?page=${i}$`);
    }
    lines.push(
      `Disallow: /admin`,
      `Disallow: /admin/`,
      `Disallow: /login`,
      `Disallow: /reset-password`,
      `Disallow: /my-cars`,
      `Disallow: /*?page=`,
      `Disallow: /*?offset=`,
      ``,
      `Sitemap: ${BMV_VIN_BASE}/sitemap.xml`,
      ``,
    );
    res.type("text/plain").send(lines.join("\n"));
  });

  app.get("/sitemap.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    try {
      const vinCount = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM vin_cache`);
      const totalVins = Number((vinCount.rows?.[0] as { cnt?: unknown } | undefined)?.cnt ?? 0);
      const vinSitemapCount = Math.max(1, Math.ceil(totalVins / SITEMAP_MAX_URLS));
      // Facet shard count: query the URL count once (cheap COUNT) so the
      // index references /sitemap-facets-1..N.xml when above the 45k cap,
      // or a single /sitemap-facets.xml when it fits in one file.
      const facetCount = await countFacetSitemapUrls();
      const facetShardCount = facetCount > SITEMAP_MAX_URLS
        ? Math.ceil(facetCount / SITEMAP_MAX_URLS)
        : 1;
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      xml += `  <sitemap><loc>${BMV_VIN_BASE}/sitemap-pages.xml</loc></sitemap>\n`;
      xml += `  <sitemap><loc>${BMV_VIN_BASE}/sitemap-tools.xml</loc></sitemap>\n`;
      xml += `  <sitemap><loc>${BMV_VIN_BASE}/sitemap-models.xml</loc></sitemap>\n`;
      xml += `  <sitemap><loc>${BMV_VIN_BASE}/sitemap-chassis.xml</loc></sitemap>\n`;
      if (facetShardCount === 1) {
        xml += `  <sitemap><loc>${BMV_VIN_BASE}/sitemap-facets.xml</loc></sitemap>\n`;
      } else {
        for (let i = 1; i <= facetShardCount; i++) {
          xml += `  <sitemap><loc>${BMV_VIN_BASE}/sitemap-facets-${i}.xml</loc></sitemap>\n`;
        }
      }
      // Spec: guides sitemap carries both guide and glossary URLs in a
      // single shard (no separate /sitemap-glossary.xml in the index).
      xml += `  <sitemap><loc>${BMV_VIN_BASE}/sitemap-guides.xml</loc></sitemap>\n`;
      for (let i = 1; i <= vinSitemapCount; i++) {
        xml += `  <sitemap><loc>${BMV_VIN_BASE}/sitemap-vins-${i}.xml</loc></sitemap>\n`;
      }
      xml += `</sitemapindex>`;
      res.type("application/xml").send(xml);
    } catch (err: unknown) {
      console.error("[bmv-vin/sitemap] failed", err);
      const msg = err instanceof Error ? err.message : "sitemap error";
      res.status(500).type("text/plain").send(msg);
    }
  });

  app.get("/sitemap-pages.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    const url = (loc: string, prio = "0.7", freq = "monthly", lastmod?: string) =>
      `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>${freq}</changefreq><priority>${prio}</priority></url>\n`;
    xml += url(bmvVinLinks.home(), "1.0", "weekly");
    for (const brand of BMV_VIN_BRANDS) xml += url(bmvVinLinks.brandDecoder(brand), "0.8", "weekly");
    xml += url(bmvVinLinks.guideIndex(), "0.7", "weekly");
    xml += url(bmvVinLinks.glossaryIndex(), "0.7", "weekly");
    for (const kind of BMV_VIN_FACET_KINDS) xml += url(bmvVinLinks.facetIndex(kind), "0.7", "weekly");
    // Lookup landing pages — seven high-intent SEO targets for BMW owners.
    // Static lastmod: content is deterministic template copy, not DB-driven.
    // Slug list is the canonical LOOKUP_PAGE_SLUGS export from bmv-vin-pages.ts.
    for (const slug of LOOKUP_PAGE_SLUGS) xml += url(`${BMV_VIN_BASE}/${slug}`, "0.8", "monthly", "2026-06-17");
    // Publisher pages on bmw.vin domain (Roman/Hermes AI-authored pages)
    try {
      const publisherRows = await db.execute(sql`
        SELECT slug, updated_at FROM seo_publisher_pages
        WHERE status = 'published' AND domain = 'bmw.vin'
        ORDER BY updated_at DESC LIMIT 10000
      `);
      for (const p of ((publisherRows as any).rows ?? []) as { slug: string; updated_at: string }[]) {
        const lastmod = p.updated_at ? new Date(p.updated_at).toISOString().slice(0, 10) : undefined;
        xml += url(`${BMV_VIN_BASE}/${p.slug}`, "0.7", "monthly", lastmod);
      }
    } catch { /* non-fatal: table may not exist yet on first boot */ }
    xml += `</urlset>`;
    res.type("application/xml").send(xml);
  });

  // /sitemap-tools.xml — VIN tool landing pages (Template A) and comparison/statistics pages
  app.get("/sitemap-tools.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    try {
      const { VIN_TOOL_SLUGS, COMPARISON_SLUGS, STATISTICS_SLUGS } = await import("./vin-tool-seo");
      const today = new Date().toISOString().slice(0, 10);
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      const url = (loc: string, prio = "0.8", freq = "monthly") =>
        `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>\n`;
      for (const slug of VIN_TOOL_SLUGS) {
        xml += url(`${BMV_VIN_BASE}/${slug}`, slug === "bmw-vin-decoder" ? "0.9" : "0.8", "weekly");
      }
      for (const slug of COMPARISON_SLUGS) {
        xml += url(`${BMV_VIN_BASE}/compare/${slug}`, "0.7");
      }
      for (const slug of STATISTICS_SLUGS) {
        xml += url(`${BMV_VIN_BASE}/data/${slug}`, "0.7", "weekly");
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: unknown) {
      console.error("[bmv-vin/sitemap-tools] failed", err);
      res.status(500).type("text/plain").send("sitemap-tools error");
    }
  });

  // /sitemap-models.xml — Model-specific VIN pages (Template B), one per chassis
  app.get("/sitemap-models.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    try {
      const rs = await db.execute(sql`
        SELECT DISTINCT UPPER(chassis) AS chassis
        FROM cars
        WHERE chassis IS NOT NULL AND chassis <> ''
        ORDER BY chassis
      `);
      const today = new Date().toISOString().slice(0, 10);
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      for (const row of (rs.rows as { chassis: string }[])) {
        const chassis = row.chassis.toLowerCase();
        if (!chassis) continue;
        xml += `  <url><loc>${BMV_VIN_BASE}/bmw-${chassis}-vin-decoder</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: unknown) {
      console.error("[bmv-vin/sitemap-models] failed", err);
      res.status(500).type("text/plain").send("sitemap-models error");
    }
  });

  app.get("/sitemap-chassis.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    try {
      // Threshold-driven inclusion: any chassis cohort >= MIN_COHORT gets a
      // sitemap row. Real `lastmod` is the most recent `vin_cache.updated_at`
      // for any VIN in the cohort — gives Googlebot a true recrawl signal.
      const rs = await db.execute(sql`
        SELECT LOWER(decoded_data->>'chassis') AS value,
               COUNT(*)::int AS count,
               MAX(updated_at) AS lastmod
        FROM vin_cache
        WHERE decoded_data->>'chassis' IS NOT NULL AND decoded_data->>'chassis' <> ''
        GROUP BY value
        HAVING COUNT(*) >= ${FACET_SITEMAP_MIN_COHORT}
        ORDER BY MAX(updated_at) DESC NULLS LAST, count DESC
      `);
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      for (const row of (rs.rows as { value: unknown; count: unknown; lastmod: unknown }[])) {
        const v = String(row.value || "").trim();
        if (!v) continue;
        const loc = bmvVinLinks.facetHub("chassis", v);
        const lastmod = row.lastmod ? new Date(row.lastmod as string | Date).toISOString().slice(0, 10) : null;
        xml += `  <url><loc>${loc}</loc>`;
        if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
        xml += `<changefreq>weekly</changefreq><priority>0.6</priority></url>\n`;
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: unknown) {
      console.error("[bmv-vin/sitemap-chassis] failed", err);
      const msg = err instanceof Error ? err.message : "sitemap-chassis error";
      res.status(500).type("text/plain").send(msg);
    }
  });

  // Single-file mode: served when total facet URL count <= 45k. The shard
  // handler below covers both single (?shard=undefined => emits all) and
  // sharded (?shard=N => slices by SITEMAP_MAX_URLS) modes through one code
  // path so the URL ordering stays consistent between the two layouts.
  app.get("/sitemap-facets.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    await emitFacetSitemap(res, null);
  });

  app.get("/sitemap-facets-:n.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    // Accept only positive integers — anything else 404s so we don't leak
    // a single-mode urlset under an unexpected shard URL.
    if (!/^[1-9]\d*$/.test(String(req.params.n))) {
      res.status(404).type("text/plain").send("invalid shard");
      return;
    }
    const n = Number.parseInt(String(req.params.n), 10);
    await emitFacetSitemap(res, n);
  });

  // Spec: guides sitemap is the *single* shard for both guide and glossary
  // URLs. Order is guides first (priority 0.6), then glossary (priority 0.5)
  // so crawlers see the longer-form content nodes ahead of the term entries.
  app.get("/sitemap-guides.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    try {
      const [guides, terms] = await Promise.all([
        bmvVinStorage.listGuides(),
        bmvVinStorage.listGlossary(),
      ]);
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      for (const g of guides) {
        const lastmod = (g.updatedAt ?? g.publishedAt) ? new Date(g.updatedAt ?? g.publishedAt!).toISOString().slice(0, 10) : null;
        xml += `  <url><loc>${bmvVinLinks.guide(g.slug)}</loc>`;
        if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
        xml += `<changefreq>monthly</changefreq><priority>0.6</priority></url>\n`;
      }
      for (const t of terms) {
        const lastmod = t.updatedAt ? new Date(t.updatedAt).toISOString().slice(0, 10) : null;
        xml += `  <url><loc>${bmvVinLinks.glossary(t.term)}</loc>`;
        if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
        xml += `<changefreq>monthly</changefreq><priority>0.5</priority></url>\n`;
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: unknown) {
      console.error("[bmv-vin/sitemap-guides] failed", err);
      const msg = err instanceof Error ? err.message : "sitemap-guides error";
      res.status(500).type("text/plain").send(msg);
    }
  });

  // /sitemap-vins-N.xml must be registered here (before the bmv-vin SSR
  // catch-all middleware in bmv-vin-ssr-middleware.ts) so that bmv.vin
  // requests reach this handler and are not swallowed by the SSR layer.
  // On bmv.parts the handler calls next() so the canonical handler in
  // server/routes.ts (which has no bmvVinHost guard) can serve it instead.
  //
  // NOTE — intentional duplication: the VIN sitemap generation logic also
  // lives in server/routes.ts (`app.get("/sitemap-vins-:page.xml", …)`).
  // That handler is mounted too late in the route chain to be reached on
  // bmv.vin (the SSR catch-all intercepts first), so the logic is mirrored
  // here. If the shared query, VIN check-digit filter, XML shape, or
  // canonical URL base (`BMV_VIN_BASE`) ever changes, both copies must be
  // updated together. Consider extracting into a shared helper if this
  // becomes a maintenance burden.
  app.get("/sitemap-vins-:page.xml", async (req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost !== true) return next();
    try {
      const page = parseInt(req.params.page, 10);
      if (isNaN(page) || page < 1) {
        res.status(400).type("text/plain").send("Invalid page");
        return;
      }
      const offset = (page - 1) * SITEMAP_MAX_URLS;

      const rows = await db.execute(
        sql`SELECT vin, updated_at, created_at FROM vin_cache ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, vin ASC LIMIT ${SITEMAP_MAX_URLS} OFFSET ${offset}`
      );
      const { LOCALE_LIST } = await import("../../shared/i18n");

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
      if (rows.rows) {
        for (const row of rows.rows) {
          const vinRaw = (row as { vin?: unknown }).vin as string | undefined;
          if (!vinRaw) continue;
          const vin = vinRaw.toUpperCase();
          if (!hasValidVinCheckDigit(vin)) continue;
          const updatedAt = (row as { updated_at?: unknown }).updated_at as Date | string | null;
          const createdAt = (row as { created_at?: unknown }).created_at as Date | string | null;
          const lastmodSource = updatedAt ?? createdAt;
          const lastmod = lastmodSource
            ? new Date(lastmodSource as string | Date).toISOString().slice(0, 10)
            : null;
          const canonicalLoc = `${BMV_VIN_BASE}/${vin}`;
          xml += `  <url><loc>${canonicalLoc}</loc>`;
          if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
          xml += `<changefreq>monthly</changefreq><priority>0.6</priority>\n`;
          for (const l of LOCALE_LIST) {
            xml += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${canonicalLoc}"/>\n`;
          }
          xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${canonicalLoc}"/>\n`;
          xml += `  </url>\n`;
        }
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: unknown) {
      console.error("[bmv-vin/sitemap-vins] failed", err);
      const msg = err instanceof Error ? err.message : "sitemap-vins error";
      res.status(500).type("text/plain").send(msg);
    }
  });
}

// -----------------------------------------------------------------------------
// Facet sitemap shard helpers
// -----------------------------------------------------------------------------
// The facet sitemap union (year + plant + market + paint + option facets) can
// outgrow the 45k URL cap once enrichment fills out, so the index switches
// from a single /sitemap-facets.xml to /sitemap-facets-1.xml..N.xml.
// To keep the two layouts byte-identical for the URLs they share, both modes
// build the *same* ordered (kind, value, lastmod) list and either emit all of
// it (single mode) or slice [start, start+SITEMAP_MAX_URLS) for shard N.
type FacetUrlRow = { kind: string; value: string; lastmod: Date | null };

async function loadAllFacetUrls(): Promise<FacetUrlRow[]> {
  const out: FacetUrlRow[] = [];
  // Column expressions are wrapped in `sql.raw` from a hardcoded whitelist;
  // no request input touches the SQL string.
  const colByKind: Record<string, import("drizzle-orm").SQL> = {
    year:   sql.raw("decoded_data->>'modelYear'"),
    plant:  sql.raw("decoded_data->'plant'->>'city'"),
    market: sql.raw("enriched_data->'vehicle'->>'market'"),
    paint:  sql.raw("enriched_data->'vehicle'->>'colorCode'"),
  };
  type Row = { value: unknown; count: unknown; lastmod: unknown };
  for (const [kind, col] of Object.entries(colByKind)) {
    const rs = await db.execute(sql`
      SELECT ${col} AS value,
             COUNT(*)::int AS count,
             MAX(updated_at) AS lastmod
      FROM vin_cache
      WHERE ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY value
      HAVING COUNT(*) >= ${FACET_SITEMAP_MIN_COHORT}
      ORDER BY MAX(updated_at) DESC NULLS LAST, count DESC, value ASC
    `);
    for (const row of (rs.rows as Row[])) {
      const v = String(row.value || "").trim();
      if (!v) continue;
      out.push({
        kind,
        value: v,
        lastmod: row.lastmod ? new Date(row.lastmod as string | Date) : null,
      });
    }
  }
  // Option facet (jsonb array column).
  const optRs = await db.execute(sql`
    SELECT opt->>'code' AS value,
           COUNT(DISTINCT vc.vin)::int AS count,
           MAX(vc.updated_at) AS lastmod
    FROM vin_cache vc, jsonb_array_elements(COALESCE(vc.enriched_data->'options', '[]'::jsonb)) AS opt
    WHERE opt->>'code' IS NOT NULL
    GROUP BY value
    HAVING COUNT(DISTINCT vc.vin) >= ${FACET_SITEMAP_MIN_COHORT}
    ORDER BY MAX(vc.updated_at) DESC NULLS LAST, count DESC, value ASC
  `);
  for (const row of (optRs.rows as { value: unknown; count: unknown; lastmod: unknown }[])) {
    const v = String(row.value || "").trim();
    if (!v) continue;
    out.push({
      kind: "option",
      value: v,
      lastmod: row.lastmod ? new Date(row.lastmod as string | Date) : null,
    });
  }
  return out;
}

/** Cheap COUNT used by the index to decide single vs. sharded layout. */
async function countFacetSitemapUrls(): Promise<number> {
  const rows = await loadAllFacetUrls();
  return rows.length;
}

/** Emits the urlset for the given shard (1-based) or the entire list when
 *  `shard` is null. Returns 404 when a shard number is past the end. */
async function emitFacetSitemap(res: Response, shard: number | null): Promise<void> {
  try {
    const all = await loadAllFacetUrls();
    let slice: FacetUrlRow[];
    if (shard === null) {
      slice = all;
    } else {
      const start = (shard - 1) * SITEMAP_MAX_URLS;
      if (start >= all.length) {
        res.status(404).type("text/plain").send("shard out of range");
        return;
      }
      slice = all.slice(start, start + SITEMAP_MAX_URLS);
    }
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const row of slice) {
      const loc = bmvVinLinks.facetHub(
        row.kind as Parameters<typeof bmvVinLinks.facetHub>[0],
        row.value,
      );
      const lastmod = row.lastmod ? row.lastmod.toISOString().slice(0, 10) : null;
      xml += `  <url><loc>${loc}</loc>`;
      if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
      xml += `<changefreq>weekly</changefreq><priority>0.5</priority></url>\n`;
    }
    xml += `</urlset>`;
    res.type("application/xml").send(xml);
  } catch (err: unknown) {
    console.error("[bmv-vin/sitemap-facets] failed", err);
    const msg = err instanceof Error ? err.message : "sitemap-facets error";
    res.status(500).type("text/plain").send(msg);
  }
}
