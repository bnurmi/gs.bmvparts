// SSR for /vin/:VIN. Reads vin_cache only — never user_cars.

import type { Express, Request, Response, NextFunction } from "express";
import type { ViteDevServer } from "vite";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { LOCALE_LIST, type LocaleCode } from "../../shared/i18n";
import {
  buildVinLandingSeo,
  buildVinNotFoundSeo,
  buildVinPreparingSeo,
  isStructurallyValidVin,
  hasValidVinCheckDigit,
  isBmwWmi,
  projectVinCacheRow,
} from "./vin-landing";
import { ensureBackgroundEnrichment } from "./vin-ssr-enrichment";
import { generateAiFaq, buildFaqPageJsonLd } from "./ai-faq";

const LOCALE_PREFIXES = LOCALE_LIST.map(l => l.prefix).filter(Boolean);

interface VinSsrAppLocals {
  vite?: Pick<ViteDevServer, "transformIndexHtml">;
}

function resolveTemplatePath(): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return path.resolve(process.cwd(), "dist", "public", "index.html");
  return path.resolve(process.cwd(), "client", "index.html");
}

let cachedTemplate: { source: string; mtimeMs: number } | null = null;

async function loadTemplate(): Promise<string> {
  const file = resolveTemplatePath();
  const stat = await fs.promises.stat(file);
  if (cachedTemplate && cachedTemplate.mtimeMs === stat.mtimeMs) {
    return cachedTemplate.source;
  }
  const source = await fs.promises.readFile(file, "utf-8");
  cachedTemplate = { source, mtimeMs: stat.mtimeMs };
  return source;
}

function injectIntoTemplate(template: string, headFragment: string, rootBody: string): string {
  const headInjected = template.replace(
    "</head>",
    `    ${headFragment}\n  </head>`,
  );
  return headInjected.replace(
    `<div id="root"></div>`,
    `<div id="root">${rootBody}</div>`,
  );
}

// In dev, run the template through vite.transformIndexHtml so the React
// Refresh preamble + @vite/client HMR script get injected.
async function maybeTransformViaVite(req: Request, url: string, html: string): Promise<string> {
  const locals = req.app.locals as VinSsrAppLocals;
  const vite = locals.vite;
  if (!vite) return html;
  try {
    return await vite.transformIndexHtml(url, html);
  } catch (err) {
    console.error("[vin-ssr] vite.transformIndexHtml failed", err);
    return html;
  }
}

// Extract the raw VIN segment + locale from `/[locale/]vin/:vin`.
// Returns null when the path doesn't match. Locale prefix is optional
// and matched against the registered locale prefix list to avoid false
// positives. Returns `locale: "en"` when no prefix is present so all
// downstream builders see a concrete LocaleCode.
function parseVinPath(p: string): { vin: string; locale: LocaleCode } | null {
  // Strip query/hash (defensive — req.path normally excludes them).
  const path = p.split(/[?#]/)[0];
  // Require trailing slash absence so /vin/ABC/foo doesn't trigger.
  const m = path.match(/^\/(?:([^\/]+)\/)?vin\/([A-Za-z0-9]{1,17})\/?$/);
  if (!m) return null;
  const prefix = m[1] || "";
  let locale: LocaleCode = "en";
  if (prefix) {
    const found = LOCALE_LIST.find(l => l.prefix === prefix);
    if (!found) return null;
    locale = found.code;
  }
  return { vin: m[2].toUpperCase(), locale };
}

async function handleVinSsr(req: Request, res: Response, next: NextFunction) {
  const parsed = parseVinPath(req.path);
  if (!parsed) return next();

  // Only intercept GET (HEAD is fine to fall through; other methods are
  // never SPA routes anyway and should 404 from the static layer).
  if (req.method !== "GET") return next();

  // Crawlers send `Accept: */*` or text/html. Asset requests (Vite
  // module fetches) send Accept: */* but with Sec-Fetch-Dest: script —
  // we only intervene when the destination is a document so JS/CSS
  // module fetches by Vite never hit this branch.
  const fetchDest = req.header("sec-fetch-dest");
  if (fetchDest && fetchDest !== "document" && fetchDest !== "empty") {
    return next();
  }
  const accept = req.header("accept") || "";
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) {
    return next();
  }

  const vin = parsed.vin;
  const locale = parsed.locale;
  // The host-rewrite middleware in server/index.ts tags requests that
  // came in on bmv.vin so we can flip the SEO output (canonical, alts,
  // breadcrumbs) to point at the bmv.vin vanity host instead of bmv.parts.
  const vinHostMode = req.bmvVinHost === true;
  const seoOpts = { vinHostMode };

  const respondNotFound = async (reason: "invalid" | "not_bmw" | "uncached") => {
    const seo = buildVinNotFoundSeo(vin, reason, locale, seoOpts);
    const tpl = await loadTemplate();
    const raw = injectIntoTemplate(tpl, seo.headFragment, seo.rootBody);
    const html = await maybeTransformViaVite(req, req.originalUrl, raw);
    res.status(404).type("html").send(html);
  };

  try {
    // Last-7 deep links (or any sub-17 input) aren't crawlable landing
    // pages — fall through to the SPA decoder so users can still
    // interactively decode them.
    if (vin.length < 17) return next();

    if (!isStructurallyValidVin(vin)) return respondNotFound("invalid");
    if (!hasValidVinCheckDigit(vin)) return respondNotFound("invalid");
    if (!isBmwWmi(vin)) return respondNotFound("not_bmw");

    const cached = await storage.getVinCache(vin);
    if (!cached || !cached.enrichedData) {
      // Valid BMW VIN but no enriched cache row yet. Kick off the
      // first-party-first orchestrator in the background (deduped per
      // VIN) and serve a noindex "preparing this VIN" page. Crawlers
      // honor the noindex tag; humans see the SPA hydrate over it and
      // the `/api/vin/queue-status` poller takes over progress UX.
      ensureBackgroundEnrichment(vin);
      const seo = buildVinPreparingSeo(vin, locale, seoOpts);
      const tpl = await loadTemplate();
      const raw = injectIntoTemplate(tpl, seo.headFragment, seo.rootBody);
      const html = await maybeTransformViaVite(req, req.originalUrl, raw);
      // 202 Accepted — semantically: "we got the request, work is in
      // progress." Browsers render the body; crawlers obey noindex.
      res.status(202).type("html").send(html);
      return;
    }

    const projected = projectVinCacheRow(cached);
    if (!projected.isBmw) return respondNotFound("not_bmw");

    // On bmv.vin, enrich the projection with related rails (same chassis
    // other years, same plant + year, similar builds) and top paint /
    // option callouts (Task #96, T006). Rails are queried in parallel
    // and individual failures yield empty rails — the SSR never blocks.
    let enriched: typeof projected | import("../../shared/bmv-vin/projection").VinForLanding = projected;
    if (vinHostMode) {
      try {
        const { projectVinForLanding } = await import("./bmv-vin-rails");
        enriched = await projectVinForLanding(projected);
      } catch (e) {
        console.warn("[vin-ssr] bmv.vin rail projection failed", e);
      }
    }

    const seo = buildVinLandingSeo(enriched, locale, seoOpts);
    let headFragment = seo.headFragment;

    // Inject AI FAQ JSON-LD (keyed by last-7 VIN chars to keep cache manageable).
    try {
      const vinKey = vin.slice(-7);
      const items = await generateAiFaq("vin", vinKey, locale, {
        vin,
        vinChassis: (enriched as any).chassis ?? null,
        vinModelYear: (enriched as any).modelYear ?? null,
        vinSeries: (enriched as any).series ?? null,
        vinModelName: (enriched as any).modelName ?? null,
        vinPlantCity: (enriched as any).plantCity ?? null,
        vinPlantCountry: (enriched as any).plantCountry ?? null,
      });
      if (items && items.length > 0) {
        headFragment += `\n<script type="application/ld+json">${JSON.stringify(buildFaqPageJsonLd(items, locale))}</script>`;
      }
    } catch (faqErr) {
      console.warn("[vin-ssr] AI FAQ injection failed", faqErr);
    }

    const tpl = await loadTemplate();
    const raw = injectIntoTemplate(tpl, headFragment, seo.rootBody);
    const html = await maybeTransformViaVite(req, req.originalUrl, raw);
    res.status(200).type("html").send(html);
  } catch (err) {
    // Best-effort SSR: on failure fall through to the SPA.
    console.error("[vin-ssr] error", err);
    return next();
  }
}

export function mountVinSeoSsr(app: Express): void {
  // Register on /vin/* (will receive both /vin/:vin and /:locale/vin/:vin
  // under any LOCALIZED_PATHS prefix). We use a path-agnostic middleware
  // that introspects req.path so we don't need to register one route per
  // locale prefix.
  app.use((req, res, next) => {
    if (!/(^|\/)vin\//.test(req.path)) return next();
    handleVinSsr(req, res, next);
  });
}
