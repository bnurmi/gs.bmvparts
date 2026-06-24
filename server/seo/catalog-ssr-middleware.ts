// SSR middleware for bmv.parts catalog pages:
//   /chassis/:code, /series/:slug, /car/:slug, /part/:partNumber
// and their locale-prefixed equivalents (/:locale/chassis/:code, etc.).
//
// Only fires when req.bmvVinHost is falsy (i.e. bmv.parts traffic).
// Follows the same template-loading / injection pattern as
// server/seo/bmv-vin-ssr-middleware.ts.

import type { Express, Request, Response, NextFunction } from "express";
import type { ViteDevServer } from "vite";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { LOCALE_LIST, type LocaleCode } from "../../shared/i18n";
import {
  buildChassisPageSeo,
  buildSeriesPageSeo,
  buildCarDetailSeo,
  buildPartDetailSeo,
  type CatalogSeoBundle,
} from "./catalog-pages";
import { generateAiFaq, buildFaqPageJsonLd, type AiFaqContext, type AiFaqItem } from "./ai-faq";

// ---------------------------------------------------------------------------
// Template helpers (mirrors vin-ssr-middleware.ts / bmv-vin-ssr-middleware.ts)
// ---------------------------------------------------------------------------

interface AppLocals { vite?: Pick<ViteDevServer, "transformIndexHtml">; }

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
  const vite = (req.app.locals as AppLocals).vite;
  if (!vite) return html;
  try { return await vite.transformIndexHtml(url, html); }
  catch (err) { console.error("[catalog-ssr] vite.transformIndexHtml failed", err); return html; }
}

// ---------------------------------------------------------------------------
// Request filtering
// ---------------------------------------------------------------------------

function isDocumentRequest(req: Request): boolean {
  const fetchDest = req.header("sec-fetch-dest");
  if (fetchDest && fetchDest !== "document" && fetchDest !== "empty") return false;
  const accept = req.header("accept") || "";
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------------------

type ParsedCatalogPath =
  | { type: "chassis"; code: string; locale: LocaleCode }
  | { type: "series"; slug: string; locale: LocaleCode }
  | { type: "car"; slug: string; locale: LocaleCode }
  | { type: "part"; partNumber: string; locale: LocaleCode };

const LOCALE_BY_PREFIX = new Map<string, LocaleCode>(
  LOCALE_LIST
    .filter(l => l.prefix)
    .map(l => [l.prefix, l.code]),
);

function parseCatalogPath(p: string): ParsedCatalogPath | null {
  // Strip query / hash and trailing slash.
  const clean = p.split(/[?#]/)[0].replace(/\/+$/, "");

  // Match: /[locale-prefix/]<type>/<value>
  // where <type> is chassis|series|car|part and <value> has no further slashes.
  const m = clean.match(/^\/(?:([^/]+)\/)?(?:(chassis|series|car|part)\/([^/]+))$/);
  if (!m) return null;

  const prefixSeg = m[1] ?? "";
  const pageType = m[2] as "chassis" | "series" | "car" | "part";
  const value = m[3];
  if (!value) return null;

  // Resolve locale from the URL prefix segment.
  let locale: LocaleCode = "en";
  if (prefixSeg) {
    const found = LOCALE_BY_PREFIX.get(prefixSeg);
    // Unknown prefix ≠ locale prefix → might be a different route (e.g. /api/…)
    if (!found) return null;
    locale = found;
  }

  switch (pageType) {
    case "chassis": return { type: "chassis", code: value, locale };
    case "series":  return { type: "series",  slug: value, locale };
    case "car":     return { type: "car",      slug: value, locale };
    case "part":    return { type: "part",     partNumber: value, locale };
    default:        return null;
  }
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

async function sendBundle(req: Request, res: Response, bundle: CatalogSeoBundle): Promise<void> {
  const tpl = await loadTemplate();
  const raw = injectIntoTemplate(tpl, bundle.headFragment, bundle.rootBody);
  const html = await maybeTransformViaVite(req, req.originalUrl, raw);
  res.status(bundle.status).type("html").send(html);
}

/**
 * Like sendBundle, but injects a cached FAQPage JSON-LD script if one is already
 * stored in ai_faq_cache. If the cache is cold, the HTML is sent immediately
 * (without a FAQ) and generation is fired in the background so the next request
 * gets the cached version. A 300 ms race-timeout on the DB read ensures a slow
 * DB never delays the response.
 */
async function sendBundleWithFaq(
  req: Request,
  res: Response,
  bundle: CatalogSeoBundle,
  pageType: Parameters<typeof generateAiFaq>[0],
  pageKey: string,
  locale: LocaleCode,
  context: AiFaqContext,
): Promise<void> {
  const t0 = Date.now();
  const tpl = await loadTemplate();
  let headFragment = bundle.headFragment;
  let faqStatus: "cached" | "pending" | "skipped" = "skipped";

  // Fast cache-only DB lookup with a 300 ms hard timeout.
  // We never await a GPT call on the hot response path.
  try {
    const DB_TIMEOUT_MS = 300;
    const cached = await Promise.race<Awaited<ReturnType<typeof storage.getAiFaq>>>([
      storage.getAiFaq(pageType, pageKey, locale),
      new Promise((resolve) => setTimeout(() => resolve(null), DB_TIMEOUT_MS)),
    ]);

    if (cached) {
      const items = cached.faqItems as AiFaqItem[];
      if (Array.isArray(items) && items.length > 0) {
        const jsonLd = buildFaqPageJsonLd(items, locale);
        headFragment += `\n<script type="application/ld+json">${safeJsonLd(jsonLd)}</script>`;
        faqStatus = "cached";
      }
    } else {
      // Cache miss — fire-and-forget so the next cold request gets the FAQ.
      faqStatus = "pending";
      generateAiFaq(pageType, pageKey, locale, context).catch((err) => {
        console.warn("[catalog-ssr] background FAQ generation failed",
          { pageType, pageKey, locale }, err);
      });
    }
  } catch (err) {
    faqStatus = "skipped";
    console.warn("[catalog-ssr] FAQ cache lookup failed", err);
  }

  const raw = injectIntoTemplate(tpl, headFragment, bundle.rootBody);
  const html = await maybeTransformViaVite(req, req.originalUrl, raw);
  res.status(bundle.status).type("html").send(html);

  const elapsed = Date.now() - t0;
  console.log(`[catalog-ssr] ${pageType}/${pageKey} served in ${elapsed}ms; faq=${faqStatus}`);
}

// ---------------------------------------------------------------------------
// Per-page handlers
// ---------------------------------------------------------------------------

async function handleChassis(req: Request, res: Response, next: NextFunction, code: string, locale: LocaleCode): Promise<void> {
  const allCars = await storage.getCars();
  const cars = allCars.filter(c => (c.chassis ?? "").toLowerCase() === code.toLowerCase());
  if (cars.length === 0) return next();

  const editorial = await storage.getHubEditorial("chassis", code.toUpperCase()).catch(() => undefined);
  const bundle = buildChassisPageSeo({
    chassisCode: code,
    locale,
    cars,
    editorial: editorial?.blurb ?? null,
  });

  // Derive year-range from the cars list for AI context.
  const years = cars.flatMap(c => [c.yearStart, c.yearEnd]).filter((y): y is number => typeof y === "number");
  const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
  const seriesName = cars[0]?.series ?? undefined;

  await sendBundleWithFaq(req, res, bundle, "chassis", code.toUpperCase(), locale, {
    chassisCode: code.toUpperCase(),
    series: seriesName,
    yearRange,
    carCount: cars.length,
  });
}

async function handleSeries(req: Request, res: Response, next: NextFunction, slug: string, locale: LocaleCode): Promise<void> {
  const allCars = await storage.getCars();
  const cars = allCars.filter(c =>
    (c.series || "Other").toLowerCase().replace(/\s+/g, "-") === slug.toLowerCase(),
  );
  if (cars.length === 0) return next();

  const seriesName = cars[0].series || "Other";
  const editorial = await storage.getHubEditorial("series", slug).catch(() => undefined);
  const bundle = buildSeriesPageSeo({
    seriesSlug: slug,
    seriesName,
    locale,
    cars,
    editorial: editorial?.blurb ?? null,
  });

  const chassisCodes = [...new Set(cars.map(c => c.chassis).filter((ch): ch is string => !!ch))];
  await sendBundleWithFaq(req, res, bundle, "series", slug, locale, {
    seriesName,
    chassisCodes,
    seriesChassisCount: chassisCodes.length,
  });
}

async function handleCar(req: Request, res: Response, next: NextFunction, slug: string, locale: LocaleCode): Promise<void> {
  const isNumeric = /^\d+$/.test(slug);
  const car = isNumeric
    ? await storage.getCar(parseInt(slug, 10))
    : await storage.getCarBySlug(slug);
  if (!car) return next();

  const bundle = buildCarDetailSeo({ car, locale });
  await sendBundle(req, res, bundle);
}

async function handlePart(req: Request, res: Response, next: NextFunction, partNumber: string, locale: LocaleCode): Promise<void> {
  const xref = await storage.crossReferencePart(partNumber);
  if (!xref) return next();

  // Build rich SEO copy via content.ts (same generator the JSON API uses).
  let seoContent: { metaTitle: string; metaDescription: string; intro: string } | null = null;
  try {
    const { generateSeoContent } = await import("./content");
    const c = generateSeoContent({
      locale,
      partNumber: xref.partNumber,
      partNumberClean: xref.partNumberClean,
      description: xref.description,
      additionalInfo: xref.additionalInfo,
      weight: xref.weight,
      vehicles: xref.vehicles.map(v => ({
        carId: v.carId,
        carName: v.carName,
        carSlug: v.carSlug,
        chassis: v.chassis,
        engine: v.engine,
        bodyType: v.bodyType,
        yearStart: v.yearStart,
        yearEnd: v.yearEnd,
        categoryName: v.categoryName,
        subcategoryName: v.subcategoryName,
        quantity: v.quantity,
      })),
    });
    seoContent = { metaTitle: c.metaTitle, metaDescription: c.metaDescription, intro: c.intro };
  } catch (err) {
    console.warn("[catalog-ssr] generateSeoContent failed, falling back to basic copy", err);
  }

  const bundle = buildPartDetailSeo({
    partNumberClean: xref.partNumberClean,
    description: xref.description,
    additionalInfo: xref.additionalInfo,
    weight: xref.weight,
    locale,
    vehicles: xref.vehicles,
    seoContent,
  });

  // Build AI FAQ context from the xref data.
  const chassisCodes = [...new Set(xref.vehicles.map(v => v.chassis).filter((ch): ch is string => !!ch))];
  const firstVehicle = xref.vehicles[0];
  await sendBundleWithFaq(req, res, bundle, "part", xref.partNumberClean, locale, {
    partNumber: xref.partNumber,
    partDescription: xref.description,
    chassisCodes,
    categoryName: firstVehicle?.categoryName ?? undefined,
    subcategoryName: firstVehicle?.subcategoryName ?? undefined,
    weight: xref.weight ?? undefined,
    vehicleCount: xref.vehicles.length,
    supersededBy: null,
  });
}

// ---------------------------------------------------------------------------
// Publisher page SSR handler
// ---------------------------------------------------------------------------

/**
 * Safely serialize an object to JSON for embedding in an inline
 * `<script type="application/ld+json">` block.
 *
 * JSON.stringify can produce strings like `</script>` or `<!--` that
 * terminate or confuse the surrounding script context.  We escape the
 * three dangerous sequences in-place so the JSON is still valid while
 * the browser parser never sees a raw `</script` or `<!--` token.
 * U+2028 / U+2029 are also escaped — they are line terminators inside
 * JSON strings and can break some parsers.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Derive the canonical domain string for a request host, used to scope publisher page lookups. */
function resolvePublisherDomain(req: Request): string {
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.hostname ?? "";
  if (host.includes("bmw.vin")) return "bmw.vin";
  return "bmv.parts";
}

/**
 * Escape a string for safe interpolation into an HTML attribute value or text node.
 * Handles all five dangerous HTML chars: & < > " '
 */
function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function handlePublisherPage(req: Request, res: Response, next: NextFunction, slug: string): Promise<void> {
  try {
    const { db } = await import("../storage");
    const { sql } = await import("drizzle-orm");

    // Scope lookup to the tenant domain so bmw.parts and bmw.vin pages with
    // the same slug never cross-contaminate.
    const domain = resolvePublisherDomain(req);
    const result = await db.execute(sql`
      SELECT * FROM seo_publisher_pages WHERE slug = ${slug} AND domain = ${domain} LIMIT 1
    `);
    const rows = (result as any).rows ?? result;
    if (!rows.length) return next();

    const page = rows[0] as {
      id: number; slug: string; status: string; title: string;
      meta_description: string | null; canonical_url: string | null;
      h1: string | null; body_html: string | null; excerpt: string | null;
      schema_json: unknown; featured_image_url: string | null;
      og_title: string | null; og_description: string | null; og_image_url: string | null;
      content_type: string; domain: string;
    };

    // Only render published pages (archived get a noindex served shell)
    if (page.status === "draft") return next();

    const canonical = page.canonical_url ?? `https://${page.domain}/${page.slug}`;
    const isArchived = page.status === "archived";

    // Build schema JSON-LD
    let schemaLd = "";
    if (page.schema_json && !isArchived) {
      try {
        const schemaObj = typeof page.schema_json === "string"
          ? JSON.parse(page.schema_json)
          : page.schema_json;

        const contentType = page.content_type;

        // FAQ schema from schemaJson.faq array
        if ((schemaObj as any)?.faq && Array.isArray((schemaObj as any).faq)) {
          const faqLd = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": (schemaObj as any).faq.map((q: { question: string; answer: string }) => ({
              "@type": "Question",
              "name": q.question,
              "acceptedAnswer": { "@type": "Answer", "text": q.answer },
            })),
          };
          schemaLd += `<script type="application/ld+json">${safeJsonLd(faqLd)}</script>\n`;
        }

        // Article schema for article/guide content types
        if (contentType === "article" || contentType === "guide") {
          const articleLd = {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": page.title,
            "description": page.meta_description ?? undefined,
            "url": canonical,
            "image": page.og_image_url ?? page.featured_image_url ?? undefined,
          };
          schemaLd += `<script type="application/ld+json">${safeJsonLd(articleLd)}</script>\n`;
        }
      } catch {
        // schema JSON invalid — skip
      }
    }

    // Build breadcrumbs JSON-LD
    const breadcrumbLd = safeJsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": `https://${page.domain}` },
        { "@type": "ListItem", "position": 2, "name": page.title, "item": canonical },
      ],
    });

    // Escape all text fields before inserting into HTML to prevent stored XSS.
    // body_html is already sanitized by sanitizeHtml() at write time (strips
    // <script>, <style>, and on* event handlers) — safe to interpolate as-is.
    const safeTitle = escHtml(page.title);
    const safeMetaDesc = escHtml(page.meta_description);
    const safeOgTitle = escHtml(page.og_title ?? page.title);
    const safeOgDesc = escHtml(page.og_description);
    // For URL attributes: allow only safe http/https URLs; strip otherwise
    const safifyUrl = (u: string | null | undefined): string => {
      if (!u) return "";
      try {
        const p = new URL(u);
        if (p.protocol !== "https:" && p.protocol !== "http:") return "";
        return escHtml(u);
      } catch { return ""; }
    };
    const safeCanonical = safifyUrl(canonical);
    const safeOgImage = safifyUrl(page.og_image_url ?? page.featured_image_url);
    const safeH1 = escHtml(page.h1);

    const headFragment = [
      `<title>${safeTitle}</title>`,
      safeMetaDesc ? `<meta name="description" content="${safeMetaDesc}">` : "",
      safeCanonical ? `<link rel="canonical" href="${safeCanonical}">` : "",
      isArchived ? `<meta name="robots" content="noindex, nofollow">` : "",
      `<meta property="og:title" content="${safeOgTitle}">`,
      safeOgDesc ? `<meta property="og:description" content="${safeOgDesc}">` : "",
      safeOgImage ? `<meta property="og:image" content="${safeOgImage}">` : "",
      safeCanonical ? `<meta property="og:url" content="${safeCanonical}">` : "",
      `<meta property="og:type" content="${page.content_type === "article" || page.content_type === "guide" ? "article" : "website"}">`,
      schemaLd,
      `<script type="application/ld+json">${breadcrumbLd}</script>`,
    ].filter(Boolean).join("\n    ");

    const h1Html = safeH1 ? `<h1 class="seo-publisher-h1">${safeH1}</h1>` : "";
    // One-H1 guarantee: when the h1 field is populated, strip any <h1> tags
    // from body_html so the rendered page has exactly one H1 element.
    const bodyHtmlSafe = safeH1 && page.body_html
      ? page.body_html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "")
      : (page.body_html ?? "");
    const rootBody = bodyHtmlSafe
      ? `<article class="seo-publisher-page" data-slug="${escHtml(page.slug)}" data-type="${escHtml(page.content_type)}">${h1Html}${bodyHtmlSafe}</article>`
      : "";

    const tpl = await loadTemplate();
    const raw = injectIntoTemplate(tpl, headFragment, rootBody);
    const html = await maybeTransformViaVite(req, req.originalUrl, raw);
    res.status(isArchived ? 410 : 200).type("html").send(html);
  } catch (err) {
    console.error("[catalog-ssr] publisher page error", err);
    return next();
  }
}

// ---------------------------------------------------------------------------
// Main middleware handler (extended to include publisher pages)
// ---------------------------------------------------------------------------

async function handleCatalogSsr(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.bmvVinHost) return next();
  if (req.method !== "GET") return next();
  if (!isDocumentRequest(req)) return next();

  const parsed = parseCatalogPath(req.path);
  if (!parsed) {
    // Check if this path matches a publisher page slug
    // Publisher slugs are at /<slug> (no type prefix)
    const cleanPath = req.path.replace(/\/+$/, "");
    const slug = cleanPath.startsWith("/") ? cleanPath.slice(1) : cleanPath;
    if (slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return await handlePublisherPage(req, res, next, slug);
    }
    return next();
  }

  try {
    switch (parsed.type) {
      case "chassis":
        return await handleChassis(req, res, next, parsed.code, parsed.locale);
      case "series":
        return await handleSeries(req, res, next, parsed.slug, parsed.locale);
      case "car":
        return await handleCar(req, res, next, parsed.slug, parsed.locale);
      case "part":
        return await handlePart(req, res, next, parsed.partNumber, parsed.locale);
    }
  } catch (err) {
    console.error("[catalog-ssr] unhandled error", err);
    return next();
  }
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountCatalogSsr(app: Express): void {
  // Quick structural pre-filter so non-catalog paths don't even parse.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.bmvVinHost) return next();
    if (req.method !== "GET") return next();
    if (!/\/(chassis|series|car|part)\//.test(req.path)) return next();
    handleCatalogSsr(req, res, next);
  });

  // Publisher page SSR: any path matching /<slug> that isn't caught by other routes.
  // Intentionally runs on BOTH bmv.parts and bmw.vin hosts — resolvePublisherDomain()
  // maps the host to the correct domain for DB lookup, so each host serves only its
  // own domain's published pages.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    if (!isDocumentRequest(req)) return next();
    const cleanPath = req.path.replace(/\/+$/, "");
    // Only single-segment paths (no sub-slashes) that look like slugs
    if (cleanPath.split("/").length !== 2) return next();
    const slug = cleanPath.split("/")[1];
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return next();
    handlePublisherPage(req, res, next, slug);
  });
}
