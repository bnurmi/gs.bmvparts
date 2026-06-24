// SSR middleware that wires bmv.vin content routes into Express (Task #96).
// The host-rewrite layer in `server/index.ts` tags bmv.vin requests with
// `req.bmvVinHost = true`; this middleware builds the per-route
// VinHostSeoBundle from `bmv-vin-pages` + DB rows and injects it into the
// SPA template so crawlers see hand-rolled HTML. Short-circuits on bmv.parts.

import type { Express, Request, Response, NextFunction } from "express";
import type { ViteDevServer } from "vite";
import fs from "fs";
import path from "path";
import { db, bmvVinStorage, storage } from "../storage";
import { generateAiFaq, buildFaqPageJsonLd } from "./ai-faq";
import { sql } from "drizzle-orm";
import { resolveLocale } from "../../shared/i18n";
import {
  BMV_VIN_BRANDS, BMV_VIN_FACET_KINDS, BRAND_WMIS,
  type BmvVinBrand, type BmvVinFacetKind,
} from "../../shared/bmv-vin/feature-registry";
import { partsLocalePrefix } from "../../shared/bmv-vin/links";
import {
  buildDecoderHomeSeo, buildBrandDecoderSeo, buildFacetIndexSeo,
  buildFacetHubSeo, buildGuideIndexSeo, buildGuideDetailSeo,
  buildGlossaryIndexSeo, buildGlossaryTermSeo, buildVinHostNotFoundSeo,
  buildLookupPageSeo, LOOKUP_PAGE_SLUGS, buildModelLandingSeo,
  FACET_HUB_PAGE_SIZE, type FacetCrossRail,
  type VinHostSeoBundle, type RecentlyDecodedVin,
} from "./bmv-vin-pages";

interface VinHostAppLocals { vite?: Pick<ViteDevServer, "transformIndexHtml">; }

function resolveTemplatePath(): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return path.resolve(process.cwd(), "dist", "public", "index.html");
  return path.resolve(process.cwd(), "client", "index.html");
}

let cachedTemplate: { source: string; mtimeMs: number } | null = null;
async function loadTemplate(): Promise<string> {
  const file = resolveTemplatePath();
  const stat = await fs.promises.stat(file);
  if (cachedTemplate && cachedTemplate.mtimeMs === stat.mtimeMs) return cachedTemplate.source;
  const source = await fs.promises.readFile(file, "utf-8");
  cachedTemplate = { source, mtimeMs: stat.mtimeMs };
  return source;
}

function injectIntoTemplate(template: string, headFragment: string, rootBody: string): string {
  return template
    .replace("</head>", `    ${headFragment}\n  </head>`)
    .replace(`<div id="root"></div>`, `<div id="root">${rootBody}</div>`);
}

async function maybeTransformViaVite(req: Request, url: string, html: string): Promise<string> {
  const locals = req.app.locals as VinHostAppLocals;
  const vite = locals.vite;
  if (!vite) return html;
  try { return await vite.transformIndexHtml(url, html); }
  catch (err) { console.error("[bmv-vin-ssr] vite.transformIndexHtml failed", err); return html; }
}

function isDocumentRequest(req: Request): boolean {
  const fetchDest = req.header("sec-fetch-dest");
  if (fetchDest && fetchDest !== "document" && fetchDest !== "empty") return false;
  const accept = req.header("accept") || "";
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return false;
  return true;
}

async function send(req: Request, res: Response, bundle: VinHostSeoBundle): Promise<void> {
  const tpl = await loadTemplate();
  const raw = injectIntoTemplate(tpl, bundle.headFragment, bundle.rootBody);
  const html = await maybeTransformViaVite(req, req.originalUrl, raw);
  res.status(bundle.status).type("html").send(html);
}

// -----------------------------------------------------------------------------
// Cohort + example queries (kept here to avoid bloating storage.ts with
// host-specific SQL — the bmv-vin SSR layer is the only consumer).
// -----------------------------------------------------------------------------

// Drizzle's `execute(sql.raw(...))` returns rows typed as `unknown` — every
// SQL helper below shares the same projected columns, so we declare the
// row shapes once here. Centralising the casts means there is exactly ONE
// place where we acknowledge the runtime → static type bridge instead of
// scattering `as any[]` across every helper.
interface FacetCountRow { value: unknown; count: unknown }
interface VinExampleRow { vin: unknown; label: unknown }
interface CohortSizeRow { c: unknown }
interface RecentlyDecodedRow { vin: unknown; year: unknown; chassis: unknown; name: unknown; plant: unknown }
const toFacetCounts = (rows: unknown[]): { value: string; count: number }[] =>
  (rows as FacetCountRow[])
    .map(r => ({ value: String(r.value ?? ""), count: Number(r.count ?? 0) }))
    .filter(r => r.value && r.value !== "unknown");
const toVinExamples = (rows: unknown[]): { vin: string; label: string }[] =>
  (rows as VinExampleRow[]).map(r => ({
    vin: String(r.vin ?? ""),
    label: String(r.label ?? r.vin ?? "").trim(),
  }));
const toCohortSize = (rows: unknown[]): number => Number((rows[0] as CohortSizeRow | undefined)?.c ?? 0);

// Whitelist mapping from facet kind to the SQL expression used to read it
// from vin_cache. Only entries listed here are addressable — the request
// handler validates `kind` against `BMV_VIN_FACET_KINDS` before we ever
// look it up, and `option` (the array column) takes a separate code path.
// We never interpolate user input into a column expression.
function facetKindToColumnSql(kind: BmvVinFacetKind): import("drizzle-orm").SQL | null {
  switch (kind) {
    case "chassis": return sql.raw("decoded_data->>'chassis'");
    case "year":    return sql.raw("decoded_data->>'modelYear'");
    case "plant":   return sql.raw("decoded_data->'plant'->>'city'");
    case "market":  return sql.raw("enriched_data->'vehicle'->>'market'");
    case "paint":   return sql.raw("enriched_data->'vehicle'->>'colorCode'");
    case "option":  return null; // array column — handled separately
    default:        return null;
  }
}

async function listFacetValues(kind: BmvVinFacetKind): Promise<{ value: string; count: number }[]> {
  const col = facetKindToColumnSql(kind);
  if (!col) return [];
  const rs = await db.execute(sql`
    SELECT ${col} AS value, COUNT(*)::int AS count
    FROM vin_cache
    WHERE ${col} IS NOT NULL AND ${col} <> ''
    GROUP BY value
    ORDER BY count DESC
    LIMIT 200
  `);
  return toFacetCounts(rs.rows);
}

// Query both the example list (paginated) AND the cohort size in a single
// round-trip. `page` is 1-indexed; `pageSize` defaults to FACET_HUB_PAGE_SIZE.
// `value` is bound as a parameter — never string-interpolated.
async function getFacetExamples(
  kind: BmvVinFacetKind,
  value: string,
  page = 1,
  pageSize = FACET_HUB_PAGE_SIZE,
): Promise<{ examples: { vin: string; label: string }[]; cohortSize: number }> {
  const col = facetKindToColumnSql(kind);
  if (!col) return { examples: [], cohortSize: 0 };
  const offset = Math.max(0, (page - 1) * pageSize);
  // Most-recently-decoded VINs first — gives users a fresh stream and lets
  // Googlebot see new content on every recrawl. Tie-break on VIN for stable
  // pagination when timestamps are equal.
  const rs = await db.execute(sql`
    SELECT vin,
           CONCAT_WS(' ',
             decoded_data->>'modelYear',
             COALESCE(decoded_data->>'modelName', decoded_data->>'chassis', '')
           ) AS label
    FROM vin_cache
    WHERE LOWER(${col}) = LOWER(${value})
    ORDER BY updated_at DESC NULLS LAST, vin
    LIMIT ${pageSize} OFFSET ${offset}
  `);
  const cohortRs = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM vin_cache WHERE LOWER(${col}) = LOWER(${value})
  `);
  return { examples: toVinExamples(rs.rows), cohortSize: toCohortSize(cohortRs.rows) };
}

// Special-case option facet (array column).
async function getOptionFacetValues(): Promise<{ value: string; count: number }[]> {
  const rs = await db.execute(sql`
    SELECT opt->>'code' AS value, COUNT(*)::int AS count
    FROM vin_cache, jsonb_array_elements(COALESCE(enriched_data->'options', '[]'::jsonb)) AS opt
    WHERE opt->>'code' IS NOT NULL
    GROUP BY value
    ORDER BY count DESC
    LIMIT 200
  `);
  return (rs.rows as unknown as FacetCountRow[]).map(r => ({ value: String(r.value ?? ""), count: Number(r.count ?? 0) }));
}

async function getOptionFacetExamples(
  value: string,
  page = 1,
  pageSize = FACET_HUB_PAGE_SIZE,
): Promise<{ examples: { vin: string; label: string }[]; cohortSize: number }> {
  const offset = Math.max(0, (page - 1) * pageSize);
  // Most-recently-decoded VINs first (matches non-array facet ordering).
  const rs = await db.execute(sql`
    SELECT vc.vin,
           CONCAT_WS(' ',
             vc.decoded_data->>'modelYear',
             COALESCE(vc.decoded_data->>'modelName', vc.decoded_data->>'chassis', '')
           ) AS label
    FROM vin_cache vc
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(vc.enriched_data->'options', '[]'::jsonb)) AS opt
      WHERE opt->>'code' = ${value}
    )
    ORDER BY vc.updated_at DESC NULLS LAST, vc.vin
    LIMIT ${pageSize} OFFSET ${offset}
  `);
  const cohortRs = await db.execute(sql`
    SELECT COUNT(DISTINCT vc.vin)::int AS c
    FROM vin_cache vc
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(vc.enriched_data->'options', '[]'::jsonb)) AS opt
      WHERE opt->>'code' = ${value}
    )
  `);
  return { examples: toVinExamples(rs.rows), cohortSize: toCohortSize(cohortRs.rows) };
}

// -----------------------------------------------------------------------------
// New SEO data helpers (recently-decoded strip, brand top chassis, cross-rails)
// -----------------------------------------------------------------------------
/** Build a "Recently decoded VINs" list from `vin_cache`. Optionally
 *  filtered by brand WMI prefix (e.g. for the brand decoder hub).
 *  Sourced exclusively from `vin_cache` — `user_cars` is never queried
 *  on bmv.vin (the vanity host is public-only).
 */
// WMI-prefix WHERE clause built from a registry-provided list. Each prefix
// is bound as a separate parameter (`vin LIKE $n`) and OR'd together, so
// no untrusted string ever lands inside the SQL itself.
function buildWmiClause(wmiList: readonly string[] | null | undefined): import("drizzle-orm").SQL | null {
  if (!wmiList || wmiList.length === 0) return null;
  const parts = wmiList.map(w => sql`vin LIKE ${w + "%"}`);
  return sql.join(parts, sql` OR `);
}

async function getRecentlyDecodedVins(limit = 12, brand: BmvVinBrand | null = null): Promise<RecentlyDecodedVin[]> {
  const wmiClause = buildWmiClause(brand ? BRAND_WMIS[brand] : null);
  const lim = Math.max(1, Math.min(50, Math.floor(limit)));
  const rs = await db.execute(sql`
    SELECT vin,
           decoded_data->>'modelYear' AS year,
           decoded_data->>'chassis' AS chassis,
           COALESCE(decoded_data->>'modelName', decoded_data->>'chassis', '') AS name,
           decoded_data->'plant'->>'city' AS plant
    FROM vin_cache
    WHERE decoded_data IS NOT NULL
      ${wmiClause ? sql`AND (${wmiClause})` : sql``}
    ORDER BY updated_at DESC NULLS LAST, vin DESC
    LIMIT ${lim}
  `);
  return (rs.rows as unknown as RecentlyDecodedRow[]).map(r => {
    const chassisStr = r.chassis ? String(r.chassis).toUpperCase() : null;
    const nameStr = r.name && r.name !== r.chassis ? String(r.name) : null;
    const yearStr = r.year ? String(r.year) : null;
    const plantStr = r.plant ? String(r.plant) : null;
    const parts: string[] = [yearStr, chassisStr, nameStr, plantStr]
      .filter((p): p is string => Boolean(p && p.trim()));
    return { vin: String(r.vin ?? ""), label: parts.join(" · ") || String(r.vin ?? "") };
  });
}

/** Top chassis cohorts for a given brand, used by the brand decoder hub.
 *  Joins on the brand's WMI prefix list so we never inadvertently leak a
 *  rival brand's chassis onto the wrong page. */
async function getTopChassisForBrand(brand: BmvVinBrand, limit = 24): Promise<{ value: string; count: number }[]> {
  const wmiClause = buildWmiClause(BRAND_WMIS[brand]);
  if (!wmiClause) return [];
  const lim = Math.max(1, Math.min(50, Math.floor(limit)));
  const rs = await db.execute(sql`
    SELECT decoded_data->>'chassis' AS value, COUNT(*)::int AS count
    FROM vin_cache
    WHERE decoded_data->>'chassis' IS NOT NULL
      AND decoded_data->>'chassis' <> ''
      AND (${wmiClause})
    GROUP BY value
    ORDER BY count DESC
    LIMIT ${lim}
  `);
  return toFacetCounts(rs.rows);
}

/** Cross-facet rail: for a `(kind, value)` cohort, return the top values of
 *  the *other* axis. E.g. for `chassis=G05` we return the top years; for
 *  `year=2019` we return the top chassis. Used to give Googlebot internal
 *  crawl paths between sibling cohorts and reduce orphan pages. */
async function getCrossFacetRail(kind: BmvVinFacetKind, value: string): Promise<FacetCrossRail | null> {
  // Pick a sensible "other axis" per starting kind. Always falls back to
  // year for unsupported pairings so we always have something to render.
  const otherKind: BmvVinFacetKind | null = (() => {
    switch (kind) {
      case "chassis": return "year";
      case "year":    return "chassis";
      case "plant":   return "chassis";
      case "market":  return "chassis";
      case "paint":   return "chassis";
      case "option":  return "chassis";
      default:        return null;
    }
  })();
  if (!otherKind) return null;

  const col = facetKindToColumnSql(kind);
  const otherCol = facetKindToColumnSql(otherKind);
  if (!col || !otherCol) return null;

  const rs = await db.execute(sql`
    SELECT ${otherCol} AS value, COUNT(*)::int AS count
    FROM vin_cache
    WHERE LOWER(${col}) = LOWER(${value})
      AND ${otherCol} IS NOT NULL
      AND ${otherCol} <> ''
    GROUP BY value
    ORDER BY count DESC
    LIMIT 12
  `);
  const items = (rs.rows as unknown as FacetCountRow[])
    .map(r => ({ value: String(r.value ?? ""), label: String(r.value ?? ""), count: Number(r.count ?? 0) }))
    .filter(r => r.value && r.value !== "unknown");
  if (items.length === 0) return null;
  return { kind: otherKind, items };
}

// -----------------------------------------------------------------------------
// Per-route handlers
// -----------------------------------------------------------------------------
function pickLocale(req: Request): ReturnType<typeof resolveLocale> {
  // bmv.vin doesn't expose locale prefixes in the URL — the body language
  // is driven by Accept-Language. resolveLocale defaults to "en" on miss.
  return resolveLocale(null, req.header("accept-language"));
}

function pickPageNum(req: Request): number {
  const raw = req.query?.page;
  const n = Math.floor(Number(raw));
  if (!isFinite(n) || n < 1) return 1;
  return Math.min(n, 999);
}

async function handleHome(req: Request, res: Response): Promise<void> {
  const locale = pickLocale(req);
  const [copy, guides, glossary, recently] = await Promise.all([
    bmvVinStorage.getHomeCopy("default"),
    bmvVinStorage.listGuides(),
    bmvVinStorage.listGlossary(),
    getRecentlyDecodedVins(12, null),
  ]);
  const bundle = buildDecoderHomeSeo(
    copy ?? null, locale, [],
    guides.slice(0, 6), glossary.slice(0, 12),
    recently,
  );
  await send(req, res, bundle);
}

async function handleBrandDecoder(req: Request, res: Response, brand: BmvVinBrand): Promise<void> {
  const locale = pickLocale(req);
  const [copy, recently, topChassis] = await Promise.all([
    bmvVinStorage.getBrandDecoderCopy(brand),
    getRecentlyDecodedVins(12, brand),
    getTopChassisForBrand(brand, 24),
  ]);
  const bundle = buildBrandDecoderSeo(brand, copy ?? null, locale, recently, topChassis);
  await send(req, res, bundle);
}

async function handleFacetIndex(req: Request, res: Response, kind: BmvVinFacetKind): Promise<void> {
  const locale = pickLocale(req);
  const values = kind === "option" ? await getOptionFacetValues() : await listFacetValues(kind);
  const bundle = buildFacetIndexSeo(kind, values, locale);
  await send(req, res, bundle);
}

async function handleFacetHub(req: Request, res: Response, kind: BmvVinFacetKind, value: string): Promise<void> {
  const locale = pickLocale(req);
  const page = pickPageNum(req);
  // Chassis hubs reuse the shared hub_editorial blurb (cross-host source of truth).
  const [blurb, editorial, examplesResult, crossRail] = await Promise.all([
    bmvVinStorage.getFacetBlurb(kind, value.toLowerCase()),
    kind === "chassis"
      ? storage.getHubEditorial("chassis", value.toUpperCase())
      : Promise.resolve(undefined),
    kind === "option"
      ? getOptionFacetExamples(value, page)
      : getFacetExamples(kind, value, page),
    getCrossFacetRail(kind, value),
  ]);
  const { examples, cohortSize } = examplesResult;
  const bundle = buildFacetHubSeo(
    kind, value, blurb ?? null, examples, cohortSize, locale,
    {
      page,
      totalForPagination: cohortSize,
      crossRail,
      partsLocalePrefix: partsLocalePrefix(locale),
      editorialIntro: editorial?.blurb ?? null,
    },
  );

  // Inject AI FAQ JSON-LD into <head> for facet hub pages.
  const tpl = await loadTemplate();
  let headFragment = bundle.headFragment;
  try {
    const pageKey = `${kind}:${value.toLowerCase()}`;
    const items = await generateAiFaq("facet", pageKey, locale, {
      facetKind: kind,
      facetValue: value.toLowerCase(),
    });
    if (items && items.length > 0) {
      headFragment += `\n<script type="application/ld+json">${JSON.stringify(buildFaqPageJsonLd(items, locale))}</script>`;
    }
  } catch (faqErr) {
    console.warn("[bmv-vin-ssr] AI FAQ injection failed", faqErr);
  }
  const raw = injectIntoTemplate(tpl, headFragment, bundle.rootBody);
  const html = await maybeTransformViaVite(req, req.originalUrl, raw);
  res.status(bundle.status).type("html").send(html);
}

async function handleGuideIndex(req: Request, res: Response): Promise<void> {
  const locale = pickLocale(req);
  const guides = await bmvVinStorage.listGuides();
  await send(req, res, buildGuideIndexSeo(guides, locale));
}

async function handleGuideDetail(req: Request, res: Response, slug: string): Promise<void> {
  const locale = pickLocale(req);
  // Public path: getGuide() filters by published=true, so drafts 404+noindex.
  const guide = await bmvVinStorage.getGuide(slug);
  if (!guide) {
    await send(req, res, buildVinHostNotFoundSeo(req.path, locale));
    return;
  }
  const allGuides = await bmvVinStorage.listGuides();
  const related = (guide.relatedSlugs ?? []).length > 0
    ? allGuides.filter(g => (guide.relatedSlugs as string[]).includes(g.slug))
    : allGuides.filter(g => g.id !== guide.id).slice(0, 6);
  await send(req, res, buildGuideDetailSeo(guide, related, locale));
}

async function handleGlossaryIndex(req: Request, res: Response): Promise<void> {
  const locale = pickLocale(req);
  const terms = await bmvVinStorage.listGlossary();
  await send(req, res, buildGlossaryIndexSeo(terms, locale));
}

async function handleGlossaryTerm(req: Request, res: Response, term: string): Promise<void> {
  const locale = pickLocale(req);
  // Public path: getGlossary() filters by published=true, so drafts 404+noindex.
  const row = await bmvVinStorage.getGlossary(term);
  if (!row) {
    await send(req, res, buildVinHostNotFoundSeo(req.path, locale));
    return;
  }
  const allTerms = await bmvVinStorage.listGlossary();
  const related = (row.relatedTerms ?? []).length > 0
    ? allTerms.filter(t => (row.relatedTerms as string[]).includes(t.term))
    : allTerms.filter(t => t.id !== row.id && t.termSet === row.termSet).slice(0, 6);
  await send(req, res, buildGlossaryTermSeo(row, related, locale));
}

// -----------------------------------------------------------------------------
// Admin SSR preview helper
// -----------------------------------------------------------------------------
/** Render a fully-baked HTML preview of any bmv.vin SSR page for the admin
 *  panel. The admin UI embeds this in an iframe so editors can see exactly
 *  what crawlers will fetch after they save a content row. The function
 *  reuses the same handlers as the live host so the preview stays in lock-
 *  step with production output (one source of truth). */
export interface AdminPreviewOpts {
  type: "home" | "brand" | "facet-index" | "facet" | "guide-index" | "guide" | "glossary-index" | "glossary";
  /** For type=brand: BmvVinBrand. For type=facet/facet-index: kind. */
  kind?: string;
  /** Facet value, guide slug, or glossary term, depending on type. */
  value?: string;
  /** Optional locale override (BCP-47). Defaults to "en". */
  locale?: string;
  /** Optional pagination page (facet hubs). */
  page?: number;
}

export async function renderBmvVinAdminPreview(req: Request, opts: AdminPreviewOpts): Promise<{ status: number; html: string }> {
  const locale = resolveLocale(opts.locale ?? null, null);
  let bundle: VinHostSeoBundle | null = null;
  try {
    switch (opts.type) {
      case "home": {
        const [copy, guides, glossary, recently] = await Promise.all([
          bmvVinStorage.getHomeCopy("default"),
          bmvVinStorage.listGuides(),
          bmvVinStorage.listGlossary(),
          getRecentlyDecodedVins(12, null),
        ]);
        bundle = buildDecoderHomeSeo(copy ?? null, locale, [], guides.slice(0, 6), glossary.slice(0, 12), recently);
        break;
      }
      case "brand": {
        const brand = (opts.kind ?? opts.value ?? "") as BmvVinBrand;
        if (!(BMV_VIN_BRANDS as readonly string[]).includes(brand)) {
          bundle = buildVinHostNotFoundSeo(`/decoder/${brand}`, locale);
          break;
        }
        const [copy, recently, topChassis] = await Promise.all([
          bmvVinStorage.getBrandDecoderCopy(brand),
          getRecentlyDecodedVins(12, brand),
          getTopChassisForBrand(brand, 24),
        ]);
        bundle = buildBrandDecoderSeo(brand, copy ?? null, locale, recently, topChassis);
        break;
      }
      case "facet-index": {
        const kind = opts.kind as BmvVinFacetKind;
        if (!(BMV_VIN_FACET_KINDS as readonly string[]).includes(kind)) {
          bundle = buildVinHostNotFoundSeo(`/${kind}`, locale);
          break;
        }
        const values = kind === "option" ? await getOptionFacetValues() : await listFacetValues(kind);
        bundle = buildFacetIndexSeo(kind, values, locale);
        break;
      }
      case "facet": {
        const kind = opts.kind as BmvVinFacetKind;
        const value = opts.value ?? "";
        if (!(BMV_VIN_FACET_KINDS as readonly string[]).includes(kind) || !value) {
          bundle = buildVinHostNotFoundSeo(`/${kind}/${value}`, locale);
          break;
        }
        const page = Math.max(1, Math.floor(opts.page ?? 1));
        const [blurb, editorial, examplesResult, crossRail] = await Promise.all([
          bmvVinStorage.getFacetBlurb(kind, value.toLowerCase()),
          kind === "chassis"
            ? storage.getHubEditorial("chassis", value.toUpperCase())
            : Promise.resolve(undefined),
          kind === "option" ? getOptionFacetExamples(value, page) : getFacetExamples(kind, value, page),
          getCrossFacetRail(kind, value),
        ]);
        bundle = buildFacetHubSeo(
          kind, value, blurb ?? null, examplesResult.examples, examplesResult.cohortSize, locale,
          {
            page, totalForPagination: examplesResult.cohortSize, crossRail,
            partsLocalePrefix: partsLocalePrefix(locale),
            editorialIntro: editorial?.blurb ?? null,
          },
        );
        break;
      }
      case "guide-index": {
        const guides = await bmvVinStorage.listGuides();
        bundle = buildGuideIndexSeo(guides, locale);
        break;
      }
      case "guide": {
        const slug = opts.value ?? "";
        // Admin preview bypasses the published filter to render drafts.
        const guide = await bmvVinStorage.getGuide(slug, { includeDrafts: true });
        if (!guide) { bundle = buildVinHostNotFoundSeo(`/guide/${slug}`, locale); break; }
        const all = await bmvVinStorage.listGuides({ includeDrafts: true });
        const related = (guide.relatedSlugs ?? []).length > 0
          ? all.filter(g => (guide.relatedSlugs as string[]).includes(g.slug))
          : all.filter(g => g.id !== guide.id).slice(0, 6);
        bundle = buildGuideDetailSeo(guide, related, locale);
        break;
      }
      case "glossary-index": {
        const terms = await bmvVinStorage.listGlossary();
        bundle = buildGlossaryIndexSeo(terms, locale);
        break;
      }
      case "glossary": {
        const term = opts.value ?? "";
        // Admin preview bypasses the published filter to render drafts.
        const row = await bmvVinStorage.getGlossary(term, { includeDrafts: true });
        if (!row) { bundle = buildVinHostNotFoundSeo(`/glossary/${term}`, locale); break; }
        const all = await bmvVinStorage.listGlossary(undefined, { includeDrafts: true });
        const related = (row.relatedTerms ?? []).length > 0
          ? all.filter(t => (row.relatedTerms as string[]).includes(t.term))
          : all.filter(t => t.id !== row.id && t.termSet === row.termSet).slice(0, 6);
        bundle = buildGlossaryTermSeo(row, related, locale);
        break;
      }
    }
  } catch (err) {
    console.error("[bmv-vin-admin-preview] handler error", err);
  }
  if (!bundle) bundle = buildVinHostNotFoundSeo("/", locale);
  const tpl = await loadTemplate();
  const raw = injectIntoTemplate(tpl, bundle.headFragment, bundle.rootBody);
  // Skip Vite transform on admin previews to keep them snappy and to avoid
  // re-injecting client HMR scripts that confuse iframe sandboxing.
  void req;
  return { status: bundle.status, html: raw };
}

// -----------------------------------------------------------------------------
// Route mounting
// -----------------------------------------------------------------------------
export function mountBmvVinSeoSsr(app: Express): void {
  // Single dispatcher middleware. Cheap host check first so bmv.parts pays
  // nothing.
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    if (req.bmvVinHost !== true) return next();
    // JSON APIs are shared between bmv.vin and bmv.parts. They MUST bypass
    // the document-SSR dispatcher; otherwise browser fetch() requests
    // (which advertise `accept: */*` + `sec-fetch-dest: empty`, and so
    // satisfy isDocumentRequest()) get hijacked by the 404 SEO fallback
    // below — turning a perfectly good JSON 200 into an HTML 200 that
    // React Query's default fetcher then chokes on as it tries to
    // res.json() the SPA template. That's how `GET /api/categories/:id/
    // subcategories` was silently returning the noindex shell on bmv.vin
    // (Task #97), which made the car-detail page render the
    // "No parts groups" empty state for every visitor on every fresh
    // visit. The host-rewrite middleware in server/index.ts already
    // short-circuits /api/* before any URL rewriting, but the SSR
    // catch-all is registered later in the Express chain, so it has to
    // re-assert this guard for itself.
    if (req.path.startsWith("/api/")) return next();
    if (!isDocumentRequest(req)) return next();

    const p = req.path.replace(/\/+$/, "") || "/";

    try {
      // Decoder home: bmv.vin/ (originally rewritten to /vin in host
      // middleware so the /vin/:vin matcher doesn't fire on a bare host).
      if (p === "/" || p === "/vin") {
        await handleHome(req, res);
        return;
      }

      // Note: GET /decode?vin=... is handled in routes.ts (registered earlier
      // in the chain); it 302s to /<VIN> on the vanity host or back to /
      // with ?error=invalid otherwise. The dispatcher's allow-list below
      // still covers /decode for any GET that slips through without a vin.

      // Brand decoder: /decoder/:brand
      const brandMatch = p.match(/^\/decoder\/([a-z-]+)$/);
      if (brandMatch) {
        const brand = brandMatch[1] as BmvVinBrand;
        if (!(BMV_VIN_BRANDS as readonly string[]).includes(brand)) {
          await send(req, res, buildVinHostNotFoundSeo(p, pickLocale(req)));
          return;
        }
        await handleBrandDecoder(req, res, brand);
        return;
      }
      if (p === "/decoder") {
        // /decoder index just sends to home
        await handleHome(req, res);
        return;
      }

      // Facet hubs: /chassis, /chassis/:value, /year, /year/:y, ...
      const facetIdxMatch = p.match(/^\/([a-z]+)$/);
      if (facetIdxMatch) {
        const kind = facetIdxMatch[1];
        if ((BMV_VIN_FACET_KINDS as readonly string[]).includes(kind)) {
          await handleFacetIndex(req, res, kind as BmvVinFacetKind);
          return;
        }
      }
      const facetHubMatch = p.match(/^\/([a-z]+)\/([^\/]+)$/);
      if (facetHubMatch) {
        const kind = facetHubMatch[1];
        if ((BMV_VIN_FACET_KINDS as readonly string[]).includes(kind)) {
          const value = decodeURIComponent(facetHubMatch[2]);
          await handleFacetHub(req, res, kind as BmvVinFacetKind, value);
          return;
        }
      }

      // Guides
      if (p === "/guide") { await handleGuideIndex(req, res); return; }
      const guideMatch = p.match(/^\/guide\/([^\/]+)$/);
      if (guideMatch) {
        await handleGuideDetail(req, res, decodeURIComponent(guideMatch[1]));
        return;
      }

      // Glossary
      if (p === "/glossary") { await handleGlossaryIndex(req, res); return; }
      const glossaryMatch = p.match(/^\/glossary\/([^\/]+)$/);
      if (glossaryMatch) {
        await handleGlossaryTerm(req, res, decodeURIComponent(glossaryMatch[1]));
        return;
      }

      // VIN tool landing pages (Template A): /bmw-vin-decoder, /bmw-build-sheet-lookup, …
      // The seven lookup slugs (bmw-*-lookup) are handled via buildLookupPageSeo()
      // from bmv-vin-pages, which delegates to buildVinToolSeo() in vin-tool-seo.ts.
      const toolSlugMatch = p.match(/^\/bmw-([a-z-]+)$/)?.at(0);
      if (toolSlugMatch) {
        const slug = p.slice(1); // strip leading /
        // Check lookup slugs first (explicitly imported from bmv-vin-pages).
        const LOOKUP_SLUG_SET: ReadonlySet<string> = new Set(LOOKUP_PAGE_SLUGS);
        if (LOOKUP_SLUG_SET.has(slug)) {
          try {
            const bundle = await buildLookupPageSeo(slug);
            if (bundle) { await send(req, res, bundle); return; }
          } catch (e) { console.error("[bmv-vin-ssr] lookup-page-seo error", e); }
        }
        // Remaining VIN tool slugs (bmw-vin-decoder, brand variants, etc.).
        try {
          const { buildVinToolSeo, VIN_TOOL_SLUGS_SET } = await import("./vin-tool-seo");
          if (VIN_TOOL_SLUGS_SET.has(slug)) {
            const bundle = buildVinToolSeo(slug);
            if (bundle) { await send(req, res, bundle); return; }
          }
        } catch (e) { console.error("[bmv-vin-ssr] vin-tool-seo load error", e); }
      }

      // Model-specific VIN pages (Template B): /bmw-{chassis}-vin-decoder
      const modelVinMatch = p.match(/^\/bmw-([a-z0-9]+)-vin-decoder$/);
      if (modelVinMatch) {
        const chassis = modelVinMatch[1].toUpperCase();
        try {
          const { buildModelVinSeo } = await import("./vin-tool-seo");
          const bundle = await buildModelVinSeo(chassis);
          if (bundle) { await send(req, res, bundle); return; }
          // chassis not found — fall through to 404 below
        } catch (e) { console.error("[bmv-vin-ssr] model-vin-seo error", e); }
      }

      // Model landing pages (Template C): /bmw-{model} — slugs with digits or
      // mixed characters that weren't claimed by toolSlugMatch or modelVinMatch
      // (e.g. /bmw-m3, /bmw-m4, /bmw-3-series).
      const modelLandingMatch = p.match(/^\/bmw-([a-z0-9-]+)$/);
      if (modelLandingMatch) {
        const modelSlug = modelLandingMatch[1];
        try {
          const allCars = await storage.getCars();
          const query = modelSlug.replace(/-/g, " ").toLowerCase();
          const seriesQuery = modelSlug.replace(/-series$/, "").replace(/-/g, " ").toLowerCase();
          const matched = allCars.filter((c) => {
            const name = (c.displayName || "").toLowerCase();
            const series = (c.series || "").toLowerCase();
            const chassis = (c.chassis || "").toLowerCase();
            return (
              name.includes(query) ||
              series === seriesQuery ||
              chassis === query ||
              series.replace(/\s+/g, "-") === modelSlug
            );
          });
          if (matched.length > 0) {
            const bundle = buildModelLandingSeo(modelSlug, matched);
            await send(req, res, bundle);
            return;
          }
          // No matching cars — fall through to 404
        } catch (e) {
          console.error("[bmv-vin-ssr] model-landing error", e);
        }
      }

      // Comparison pages (Template E): /compare/:slug
      const compareMatch = p.match(/^\/compare\/([a-z0-9-]+)$/);
      if (compareMatch) {
        const slug = compareMatch[1];
        try {
          const { buildComparisonSeo } = await import("./vin-tool-seo");
          const bundle = buildComparisonSeo(slug);
          if (bundle) { await send(req, res, bundle); return; }
        } catch (e) { console.error("[bmv-vin-ssr] comparison-seo error", e); }
      }

      // Statistics pages (Template F): /data/:slug
      const dataMatch = p.match(/^\/data\/([a-z0-9-]+)$/);
      if (dataMatch) {
        const slug = dataMatch[1];
        try {
          const { buildStatisticsSeo } = await import("./vin-tool-seo");
          const bundle = await buildStatisticsSeo(slug);
          if (bundle) { await send(req, res, bundle); return; }
        } catch (e) { console.error("[bmv-vin-ssr] statistics-seo error", e); }
      }

      // Allow SPA decode fallbacks; everything else is a noindex 404.
      const isSpaSurface = p === "/decode" || /^\/vin\/[^\/]{1,16}$/.test(p);
      if (isSpaSurface) return next();
      await send(req, res, buildVinHostNotFoundSeo(p, pickLocale(req)));
      return;
    } catch (err) {
      console.error("[bmv-vin-ssr] handler error", err);
      try {
        await send(req, res, buildVinHostNotFoundSeo(req.path, pickLocale(req)));
      } catch {
        next();
      }
    }
  });
}
