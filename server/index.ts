import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { startBatchProcessor } from "./bimmer-work-scraper";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth, ensureDefaultAdmin } from "./auth";
import { db } from "./storage";
import { sql } from "drizzle-orm";
import { getInterruptedJobs, failJob, ensureBackgroundJobsTable } from "./job-manager";
import { metricsMiddleware } from "./metrics";
import { spawn } from "child_process";
import path from "path";

/**
 * Once-per-24-hours delta importer for the engineroom catalog. Spawns the
 * delta script (offset=0, descending-id, stops at boundary), so a long-running
 * import cannot block the request loop. Runs once on startup after a 60s warm-up
 * (so initial routes/workflows settle), then every 24h thereafter. Idempotent —
 * the delta script no-ops cleanly when there is nothing new.
 */
function startCatalogDeltaScheduler(): void {
  const ENABLED = process.env.CATALOG_DELTA_DISABLED !== "1";
  if (!ENABLED) {
    console.log("[catalog-delta] disabled via CATALOG_DELTA_DISABLED=1");
    return;
  }
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  const STARTUP_DELAY_MS = 60 * 1000;
  let running = false;

  const runOnce = () => {
    if (running) {
      console.log("[catalog-delta] previous run still active; skipping this tick");
      return;
    }
    running = true;
    const startedAt = Date.now();
    console.log(`[catalog-delta] starting delta run at ${new Date().toISOString()}`);
    const child = spawn(
      "node",
      [path.join(process.cwd(), "scripts", "import-external-catalog-delta.mjs")],
      { stdio: "inherit", env: process.env },
    );
    child.on("exit", (code, signal) => {
      const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[catalog-delta] finished in ${dur}s (code=${code}, signal=${signal})`);
      running = false;
    });
    child.on("error", (err) => {
      console.error(`[catalog-delta] spawn error: ${err.message}`);
      running = false;
    });
  };

  setTimeout(runOnce, STARTUP_DELAY_MS);
  setInterval(runOnce, INTERVAL_MS);
  console.log(`[catalog-delta] scheduled: first run in ${STARTUP_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 1000 / 3600}h`);
}

const app = express();
const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Server-ready gate — set to true at the end of the startup IIFE once all
// DB migrations, schedulers, and Vite/static setup have completed.
// ---------------------------------------------------------------------------
let serverReady = false;

// ---------------------------------------------------------------------------
// Maintenance-page HTML — self-contained, inline CSS, no external deps.
// Served with a <meta http-equiv="refresh" content="5"> so users auto-land
// on the live app once the deploy finishes.
// ---------------------------------------------------------------------------
function buildMaintenanceHtml(heading: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="5" />
  <title>BMV.parts — ${heading}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0a;
      color: #e5e5e5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      text-align: center;
      max-width: 440px;
      width: 100%;
    }
    .logo-wrap {
      margin-bottom: 3rem;
      display: flex;
      justify-content: center;
    }
    .divider {
      width: 2rem;
      height: 2px;
      background: #1c69d4;
      margin: 0 auto 2rem;
      border-radius: 2px;
    }
    h1 {
      font-size: 1.375rem;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: -0.01em;
      margin-bottom: 0.625rem;
    }
    p {
      font-size: 0.9375rem;
      color: #8a8a8a;
      line-height: 1.65;
      margin-bottom: 2.25rem;
    }
    .dots {
      display: flex;
      justify-content: center;
      gap: 6px;
      margin-bottom: 0;
    }
    .dots span {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #2a2a2a;
      animation: pulse 1.4s ease-in-out infinite;
    }
    .dots span:nth-child(2) { animation-delay: 0.22s; }
    .dots span:nth-child(3) { animation-delay: 0.44s; }
    @keyframes pulse {
      0%, 75%, 100% { background: #2a2a2a; transform: scale(1); }
      37%            { background: #1c69d4; transform: scale(1.25); }
    }
    .hint {
      font-size: 0.75rem;
      color: #3a3a3a;
      margin-top: 2.5rem;
      letter-spacing: 0.01em;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 52" width="224" height="52" role="img" aria-label="BMV.parts">
        <!-- Blue badge for BMV -->
        <rect x="0" y="0" width="78" height="52" rx="7" fill="#1c69d4"/>
        <text x="39" y="34"
              text-anchor="middle"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              font-size="21" font-weight="800" fill="#ffffff" letter-spacing="3">BMV</text>
        <!-- .PARTS wordmark -->
        <text x="90" y="34"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              font-size="21" font-weight="300" fill="#cccccc" letter-spacing="5">.PARTS</text>
      </svg>
    </div>
    <div class="divider"></div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <div class="dots">
      <span></span><span></span><span></span>
    </div>
    <p class="hint">Refreshing automatically&thinsp;&mdash;&thinsp;no action needed.</p>
  </div>
</body>
</html>`;
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Trust the Replit edge proxy so req.hostname / req.protocol reflect the
// real client-facing host (X-Forwarded-Host / X-Forwarded-Proto), not the
// internal upstream. Required for the vanity-host routing below to fire.
app.set("trust proxy", true);

// ---------------------------------------------------------------------------
// Vanity host: bmv.vin
// ---------------------------------------------------------------------------
// bmv.vin is a vanity domain that *serves* the VIN tool directly (no visible
// redirect, URL bar stays as bmv.vin/<VIN>). We achieve this with a pair
// of cooperating middlewares:
//
//   1. On bmv.vin: internally rewrite the URL so the existing /vin handlers
//      (SSR + SPA) see the same paths they always have:
//        bmv.vin/                  →  /vin             (decoder home)
//        bmv.vin/WBS32AY090FM28236 →  /vin/WBS32AY...  (per-VIN landing)
//      Multi-segment paths (/assets/*, /api/*, /sitemap-*, etc.) pass
//      through unchanged so static assets and APIs still work.
//      We tag the request with `bmvVinHost = true` so downstream code
//      (canonical URL builders, the SPA bundle) can render bmv.vin URLs.
//
//   2. On bmv.parts: 301-redirect the legacy /vin and /vin/* URLs over to
//      bmv.vin so search engines consolidate on the new canonical host.
//      /api/vin/* is left alone (those are API endpoints, not pages).
// ---------------------------------------------------------------------------

declare module "http" {
  interface IncomingMessage {
    bmvVinHost?: boolean;
  }
}

// Reserved bare top-level segments on bmv.vin that route to the new SSR
// content surface (Task #96). When the path matches one of these, we tag
// the request with `bmvVinHost = true` and pass it through unchanged so
// the bmv-vin-pages SSR layer (or the SPA on hydrate) can render it.
// Anything else that's a plain single segment is treated as a VIN-shaped
// vanity URL and gets internally rewritten to `/vin/<seg>` so the
// existing per-VIN SSR pipeline takes over.
//
// HARD DOMAIN SPLIT (per Task #96 review): bmv.vin must NOT host catalog
// (search, models, part-finder, car/*, part/*, series/*) or auth/admin
// surfaces (login, admin, reset-password, my-cars). Those live ONLY on
// bmv.parts and are 301-redirected below if a visitor lands on bmv.vin.
// The only bare top-level prefixes that may pass through are: the bmv.vin
// SEO surfaces themselves, the legacy /vin path (used by the form fallback
// + admin SSR preview), and the root-level static asset filenames.
const BMV_VIN_RESERVED_PREFIXES = new Set([
  "decoder", "chassis", "year", "plant", "market", "paint", "option",
  "guide", "glossary", "vin", "decode",
  "favicon.ico", "robots.txt",
]);

// Catalog/auth/admin paths that — if a visitor types or links them on
// bmv.vin — must 301 to bmv.parts. We explicitly enumerate these (instead
// of blanket-redirecting everything not in the SEO allowlist) so that
// future bmv.vin pages don't accidentally get bounced and so the redirect
// destinations are honest about preserving query strings + sub-paths.
const BMV_VIN_REDIRECT_TO_PARTS_PREFIXES = new Set([
  "search", "models", "part-finder", "about", "friends",
  "login", "admin", "reset-password", "my-cars",
  "car", "part", "series",
  // locale-prefixed catalog roots — these all live on bmv.parts only.
  "de", "fr", "es", "it", "zh", "ko", "es-mx", "en-za", "pt-br", "ru",
]);

app.use((req, res, next) => {
  const host = (req.hostname || "").toLowerCase();

  // (1) bmv.vin: tag the request and (only when the path looks like a bare
  // VIN segment) rewrite it into the existing /vin/:VIN pipeline. Reserved
  // top-level prefixes (decoder/chassis/year/.../guide/glossary/...) and
  // multi-segment paths (/assets/*, /api/*, /sitemap-*, etc.) pass through
  // unchanged so the bmv-vin-pages SSR layer + SPA can serve them.
  if (host === "bmv.vin" || host === "www.bmv.vin") {
    req.bmvVinHost = true;
    // /api/* must always pass through (JSON APIs are shared between hosts;
    // the form fallback below also depends on /api/vin/decode being live).
    if (req.url && req.url.startsWith("/api/")) return next();
    // /assets/*, /sitemap-*, /@vite/*, etc. are multi-segment paths that
    // never need rewriting — they go straight to their handlers.
    const firstSlashAfterRoot = req.url ? req.url.indexOf("/", 1) : -1;
    const isMultiSegment = firstSlashAfterRoot > 0 && firstSlashAfterRoot < (req.url?.indexOf("?") ?? req.url?.length ?? 0);
    if (isMultiSegment) {
      // Multi-segment paths: only redirect if the FIRST segment is in the
      // bmv.parts-only allowlist (catalog/auth/admin). Everything else
      // (e.g. /decoder/bmw, /chassis/g05, /guide/some-slug) passes through
      // and the bmv-vin SSR layer will handle it.
      const firstSeg = req.url!.slice(1, firstSlashAfterRoot).toLowerCase();
      if (BMV_VIN_REDIRECT_TO_PARTS_PREFIXES.has(firstSeg)) {
        return res.redirect(301, `https://bmv.parts${req.originalUrl}`);
      }
      return next();
    }
    const m = (req.url ?? "/").match(/^\/([^\/?]+)?(\?.*)?$/);
    if (m) {
      const seg = m[1] ?? "";
      const qs = m[2] ?? "";
      // Bare root → internal /vin so the home decoder SPA mounts.
      if (!seg) {
        req.url = `/vin${qs}`;
        return next();
      }
      const lower = seg.toLowerCase();
      // bmv.parts-only single segment (e.g. /search, /login, /admin)
      // → 301 across the host boundary so the catalog/auth surface
      // stays on bmv.parts and bmv.vin's link graph stays clean.
      if (BMV_VIN_REDIRECT_TO_PARTS_PREFIXES.has(lower)) {
        return res.redirect(301, `https://bmv.parts${req.originalUrl}`);
      }
      // Reserved bmv.vin SEO word: leave alone (the new bmv-vin SSR layer
      // or SPA will pick it up).
      if (BMV_VIN_RESERVED_PREFIXES.has(lower)) return next();
      // BMW tool landing pages: /bmw-vin-decoder, /bmw-build-sheet-lookup,
      // /bmw-paint-code-lookup, etc. These start with "bmw-" and are
      // handled by the SSR middleware's toolSlugMatch block.
      // Must NOT be rewritten to /vin/{slug} or they become invalid VINs.
      if (lower.startsWith("bmw-")) return next();
      // Anything containing a `.` is a static asset / sitemap shard /
      // file extension — never a VIN. Pass through so /sitemap.xml,
      // /sitemap-pages.xml, /sitemap-vins-1.xml, /apple-touch-icon.png,
      // /manifest.json etc. all reach their dedicated handlers.
      if (seg.includes(".")) return next();
      // Anything else single-segment: treat as a VIN landing.
      req.url = `/vin/${seg}${qs}`;
    }
    return next();
  }

  // (2) bmv.parts/vin* → 301 to bmv.vin/* (canonical consolidation).
  //     Leave /api/vin/* untouched (those are JSON APIs, not pages).
  if (host === "bmv.parts" || host === "www.bmv.parts") {
    const p = req.path;
    if (p === "/vin" || p.startsWith("/vin/")) {
      const remainder = p === "/vin" ? "/" : p.slice(4); // strip "/vin"
      const qIdx = req.originalUrl.indexOf("?");
      const qs = qIdx >= 0 ? req.originalUrl.slice(qIdx) : "";
      return res.redirect(301, `https://www.bmv.vin${remainder}${qs}`);
    }
  }

  next();
});

// gzip JSON / HTML / CSS / JS responses (Task #162). The default
// `compression()` middleware skips already-compressed payloads (images,
// pre-gzipped assets) and short responses, so this is safe to apply
// globally — it shaves a large chunk off list endpoints like
// /api/cars(/homepage) without any per-route plumbing.
app.use(compression());

// ---------------------------------------------------------------------------
// Health endpoint — registered at module level (before the IIFE's listen()
// call) so it is always available, even while startup work is in progress.
// Returns 200 in both states so Replit's healthcheck never fails; the body
// distinguishes initialising from ready.
// ---------------------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({ status: serverReady ? "ok" : "starting", ready: serverReady });
});

// ---------------------------------------------------------------------------
// Warming-up gate — while serverReady is false (startup migrations, scheduler
// initialisation, Vite setup still in progress), return a 503 maintenance
// page so users see a branded message instead of a raw connection error.
//
// Browser detection: use Express content negotiation as the primary signal.
// An explicit Accept: application/json header always returns JSON regardless
// of any other header. For everything else, req.accepts('html') determines
// the preferred response type.
// ---------------------------------------------------------------------------
function isLikelyBrowser(req: Request): boolean {
  // Explicit JSON preference — always return JSON regardless of UA
  const accept = req.headers["accept"] ?? "";
  if (accept.includes("application/json")) return false;
  // Non-browser user agents (curl, scrapers, internal services, bots) get JSON.
  // Real browsers always include "Mozilla" in their UA string.
  const ua = req.headers["user-agent"] ?? "";
  if (!ua || !/mozilla/i.test(ua)) return false;
  // For browser-like UAs, use Express content negotiation as the final signal.
  return !!req.accepts("html");
}

app.use((req: Request, res: Response, next: NextFunction) => {
  if (serverReady) return next();
  // During startup, GET / always returns 200 regardless of user-agent so
  // Replit's deployment healthchecker passes no matter which UA it sends.
  // (The /health endpoint at module level also always returns 200.)
  if (req.method === "GET" && req.path === "/") {
    return res.status(200).json({ status: "starting", ready: false });
  }
  if (isLikelyBrowser(req)) {
    return res
      .status(503)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(
        buildMaintenanceHtml(
          "Update in progress",
          "A new update is being applied. This page will reload automatically once the site is back.",
        ),
      );
  }
  return res.status(503).json({ message: "Service starting up" });
});

// Prometheus HTTP instrumentation — registered before routes so every
// request is measured. Skips /health and /metrics to avoid feedback loops.
app.use(metricsMiddleware);

app.use(
  express.json({
    limit: "100mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

setupAuth(app);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Start listening immediately so the server is reachable while all startup
  // work (DB migrations, scheduler initialisation, Vite setup) runs in the
  // background. The warming-up middleware above returns 503 + the branded
  // maintenance page to browsers until serverReady is flipped to true.
  const port = parseInt(process.env.PORT || "5000", 10);
  await new Promise<void>((resolve) => {
    httpServer.listen(
      { port, host: "0.0.0.0", reusePort: true },
      () => {
        log(`serving on port ${port} (startup initialisation in progress)`);
        resolve();
      },
    );
  });

  // ensureDefaultAdmin, all DDL (Phase 1/2), parts btree indexes,
  // loadVinFaDumpOnStartup, and interrupted-job recovery all run as
  // fire-and-forget AFTER the maintenance gate opens. Every operation is
  // guarded by IF NOT EXISTS / ON CONFLICT DO NOTHING, so running them in
  // the background is safe. On production these are all instant no-ops
  // (tables/indexes already exist); only a fresh deploy does real work.
  void (async () => {
  try {
    await ensureDefaultAdmin();
    await ensureBackgroundJobsTable();

    // -------------------------------------------------------------------------
    // Phase 1: Parallel table creation — all tables that have no FK dependencies
    // on tables created in this same startup block run concurrently. Each async
    // IIFE is one table group (CREATE TABLE + its immediate indexes). This cuts
    // the sequential DDL round-trip chain from ~100 await calls to ~3 phases.
    // -------------------------------------------------------------------------
    await Promise.all([
      // link_clicks
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS link_clicks (
            id SERIAL PRIMARY KEY,
            url TEXT NOT NULL,
            destination TEXT NOT NULL,
            label TEXT,
            part_number TEXT,
            source TEXT,
            referrer TEXT,
            user_agent TEXT,
            ip TEXT,
            clicked_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_link_clicks_destination ON link_clicks(destination)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON link_clicks(clicked_at)`);
      })(),
      // provisioned_accounts (refs users — pre-existing table)
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS provisioned_accounts (
            id SERIAL PRIMARY KEY,
            source TEXT NOT NULL DEFAULT 'gearswap',
            source_user_id INTEGER NOT NULL,
            account_type TEXT NOT NULL,
            user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            username TEXT NOT NULL,
            email TEXT,
            full_name TEXT,
            company TEXT,
            phone TEXT,
            country TEXT,
            role TEXT,
            tier TEXT,
            employer_source_id INTEGER,
            store_slug TEXT,
            store_name TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provisioned_source_user ON provisioned_accounts(source, source_user_id)`);
      })(),
      // category_editorial (CREATE only; locale migration patches run after this batch)
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS category_editorial (
            id SERIAL PRIMARY KEY,
            category_key TEXT NOT NULL,
            subcategory_key TEXT,
            blurb TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS category_editorial_key_idx ON category_editorial(category_key, subcategory_key)`);
      })(),
      // part_editorial_notes (CREATE only; locale migration patches run after this batch)
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS part_editorial_notes (
            id SERIAL PRIMARY KEY,
            part_number_clean TEXT NOT NULL,
            note TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
      })(),
      // hub_editorial
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS hub_editorial (
            id SERIAL PRIMARY KEY,
            hub_type TEXT NOT NULL,
            hub_key TEXT NOT NULL,
            blurb TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS hub_editorial_key_idx ON hub_editorial(hub_type, hub_key)`);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS hub_editorial_unique_idx ON hub_editorial(hub_type, hub_key)`);
      })(),
      // language_request_stats
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS language_request_stats (
            id SERIAL PRIMARY KEY,
            locale TEXT NOT NULL,
            day TEXT NOT NULL,
            hits INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS language_request_stats_unique_idx ON language_request_stats(locale, day)`);
      })(),
      // Task #175 — proxy_usage_logs + proxy_provider_config
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS proxy_usage_logs (
            id SERIAL PRIMARY KEY,
            scraper TEXT NOT NULL,
            provider TEXT NOT NULL,
            role TEXT NOT NULL,
            url_hash TEXT NOT NULL,
            bytes INTEGER NOT NULL DEFAULT 0,
            success BOOLEAN NOT NULL,
            duration_ms INTEGER,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS proxy_usage_logs_scraper_created_idx ON proxy_usage_logs(scraper, created_at)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS proxy_usage_logs_created_idx ON proxy_usage_logs(created_at)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS proxy_usage_logs_provider_idx ON proxy_usage_logs(provider)`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS proxy_provider_config (
            scraper TEXT PRIMARY KEY,
            primary_provider TEXT NOT NULL,
            backup_provider TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
      })(),
      // Task #59 / #166 — vin_cache column additions (pre-existing table, independent)
      (async () => {
        await db.execute(sql`ALTER TABLE vin_cache ADD COLUMN IF NOT EXISTS enrichment_source jsonb`);
        await db.execute(sql`ALTER TABLE vin_cache ADD COLUMN IF NOT EXISTS bimmerwork_hash text`);
      })(),
      // sa_codes, paint_codes, upholstery_codes (no FK deps)
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS sa_codes (
            code varchar(8) PRIMARY KEY,
            category text,
            names jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamp DEFAULT now()
          )
        `);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS paint_codes (
            code varchar(8) PRIMARY KEY,
            finish text,
            rgb text,
            names jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamp DEFAULT now()
          )
        `);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS upholstery_codes (
            code varchar(8) PRIMARY KEY,
            material text,
            rgb text,
            names jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamp DEFAULT now()
          )
        `);
      })(),
      // Per-VIN factory option mapping (no FK deps; E2E fixture insert runs after this batch)
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS vin_factory_options (
            vin varchar(17) PRIMARY KEY,
            sa_codes text[] NOT NULL DEFAULT '{}'::text[],
            paint_code text,
            upholstery_code text,
            production_date text,
            source text NOT NULL DEFAULT 'unknown',
            updated_at timestamp DEFAULT now()
          )
        `);
      })(),
      // Task #96 — BMV.VIN content tables (no FK deps between them)
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS bmv_vin_home_copy (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE DEFAULT 'default',
            hero JSONB NOT NULL DEFAULT '{}'::jsonb,
            intro JSONB NOT NULL DEFAULT '{}'::jsonb,
            faq JSONB NOT NULL DEFAULT '[]'::jsonb,
            meta_title JSONB NOT NULL DEFAULT '{}'::jsonb,
            meta_description JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS bmv_vin_brand_decoder_copy (
            id SERIAL PRIMARY KEY,
            brand TEXT NOT NULL UNIQUE,
            hero JSONB NOT NULL DEFAULT '{}'::jsonb,
            intro JSONB NOT NULL DEFAULT '{}'::jsonb,
            body JSONB NOT NULL DEFAULT '{}'::jsonb,
            faq JSONB NOT NULL DEFAULT '[]'::jsonb,
            meta_title JSONB NOT NULL DEFAULT '{}'::jsonb,
            meta_description JSONB NOT NULL DEFAULT '{}'::jsonb,
            wmis TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS bmv_vin_facet_blurb (
            id SERIAL PRIMARY KEY,
            facet_kind TEXT NOT NULL,
            facet_value TEXT NOT NULL,
            blurb JSONB NOT NULL DEFAULT '{}'::jsonb,
            faq JSONB NOT NULL DEFAULT '[]'::jsonb,
            meta_title JSONB NOT NULL DEFAULT '{}'::jsonb,
            meta_description JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS bmv_vin_facet_blurb_unique_idx
            ON bmv_vin_facet_blurb(facet_kind, facet_value)
        `);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS bmv_vin_guide (
            id SERIAL PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            schema_type TEXT NOT NULL DEFAULT 'Article',
            category TEXT,
            title JSONB NOT NULL DEFAULT '{}'::jsonb,
            summary JSONB NOT NULL DEFAULT '{}'::jsonb,
            body JSONB NOT NULL DEFAULT '{}'::jsonb,
            faq JSONB NOT NULL DEFAULT '[]'::jsonb,
            meta_title JSONB NOT NULL DEFAULT '{}'::jsonb,
            meta_description JSONB NOT NULL DEFAULT '{}'::jsonb,
            steps JSONB NOT NULL DEFAULT '[]'::jsonb,
            related_slugs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            published BOOLEAN NOT NULL DEFAULT TRUE,
            published_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        // Backfill `published` for older deploys.
        await db.execute(sql`ALTER TABLE bmv_vin_guide ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE`);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS bmv_vin_glossary (
            id SERIAL PRIMARY KEY,
            term TEXT NOT NULL UNIQUE,
            term_set TEXT,
            display JSONB NOT NULL DEFAULT '{}'::jsonb,
            definition JSONB NOT NULL DEFAULT '{}'::jsonb,
            long_form JSONB NOT NULL DEFAULT '{}'::jsonb,
            meta_title JSONB NOT NULL DEFAULT '{}'::jsonb,
            meta_description JSONB NOT NULL DEFAULT '{}'::jsonb,
            related_terms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            published BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`ALTER TABLE bmv_vin_glossary ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE`);
      })(),
      // Task #106 — Servicing tables (no FK deps between them)
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS servicing_specs (
            id SERIAL PRIMARY KEY,
            chassis TEXT NOT NULL,
            engine TEXT NOT NULL,
            fluids JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS servicing_specs_chassis_engine_unique_idx ON servicing_specs(chassis, engine)`);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS servicing_filter_pins (
            id SERIAL PRIMARY KEY,
            chassis TEXT NOT NULL,
            engine TEXT NOT NULL,
            filter_key TEXT NOT NULL,
            part_number TEXT NOT NULL,
            note TEXT,
            status TEXT NOT NULL DEFAULT 'ai_draft',
            verified_by TEXT,
            verified_at TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS servicing_filter_pins_unique_idx ON servicing_filter_pins(chassis, engine, filter_key)`);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS servicing_coverage_requests (
            id SERIAL PRIMARY KEY,
            chassis TEXT NOT NULL,
            engine TEXT NOT NULL,
            email TEXT,
            vin TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS servicing_coverage_requests_created_idx ON servicing_coverage_requests(created_at)`);
      })(),
      // Task #84 — RealOEM catalog audit tables (refs subcategories/cars — pre-existing)
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS subcategory_realoem_map (
            id SERIAL PRIMARY KEY,
            subcategory_id INTEGER NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
            car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
            realoem_diagram_url TEXT NOT NULL,
            realoem_diagram_id TEXT,
            confidence REAL NOT NULL DEFAULT 1,
            source TEXT NOT NULL DEFAULT 'manual',
            notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS subcategory_realoem_map_car_idx ON subcategory_realoem_map(car_id)`);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS realoem_audit_findings (
            id SERIAL PRIMARY KEY,
            audit_run_id INTEGER NOT NULL,
            car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
            subcategory_id INTEGER NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
            realoem_diagram_url TEXT NOT NULL,
            realoem_diagram_id TEXT,
            realoem_part_count INTEGER NOT NULL DEFAULT 0,
            our_part_count INTEGER NOT NULL DEFAULT 0,
            missing_part_count INTEGER NOT NULL DEFAULT 0,
            missing_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
            extra_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
            status TEXT NOT NULL DEFAULT 'open',
            backfilled_at TIMESTAMP,
            backfilled_by VARCHAR,
            parts_backfilled INTEGER NOT NULL DEFAULT 0,
            dismissed_at TIMESTAMP,
            dismissed_by VARCHAR,
            notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS realoem_audit_findings_run_idx ON realoem_audit_findings(audit_run_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS realoem_audit_findings_car_idx ON realoem_audit_findings(car_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS realoem_audit_findings_status_idx ON realoem_audit_findings(status)`);
      })(),
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS realoem_unmatched_diagrams (
            id SERIAL PRIMARY KEY,
            car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
            realoem_diagram_url TEXT NOT NULL,
            realoem_diagram_id TEXT,
            realoem_diagram_title TEXT,
            realoem_part_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'open',
            discovered_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS realoem_unmatched_car_idx ON realoem_unmatched_diagrams(car_id)`);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS realoem_unmatched_unique_idx ON realoem_unmatched_diagrams(car_id, realoem_diagram_url)`);
      })(),
      // Task #101 — RealOEM cross-variant diagram dedup
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS realoem_diagram_canonical (
            id SERIAL PRIMARY KEY,
            chassis TEXT NOT NULL,
            diag_id TEXT NOT NULL,
            realoem_diagram_url TEXT NOT NULL,
            realoem_diagram_title TEXT,
            parts_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
            part_count INTEGER NOT NULL DEFAULT 0,
            content_hash TEXT NOT NULL,
            diagram_class TEXT NOT NULL DEFAULT 'unknown',
            source_car_id INTEGER,
            fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS realoem_diagram_canonical_chassis_idx ON realoem_diagram_canonical(chassis)`);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS realoem_diagram_canonical_unique_idx ON realoem_diagram_canonical(chassis, diag_id)`);
      })(),
      // Task #105 — RealOEM per-part chassis appearance harvest
      (async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS part_chassis_appearances (
            id SERIAL PRIMARY KEY,
            part_number_clean TEXT NOT NULL,
            chassis TEXT NOT NULL,
            chassis_label_raw TEXT NOT NULL,
            production_from TEXT,
            production_to TEXT,
            source_car_id TEXT NOT NULL,
            source_part_url TEXT NOT NULL,
            harvested_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS part_chassis_appearances_unique_idx ON part_chassis_appearances(part_number_clean, chassis)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS part_chassis_appearances_part_idx ON part_chassis_appearances(part_number_clean)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS part_chassis_appearances_chassis_idx ON part_chassis_appearances(chassis)`);
      })(),
    ]);
    console.log("[Startup] Phase 1 DDL complete");

    // -------------------------------------------------------------------------
    // Phase 2: Sequential migration patches that depend on Phase 1 tables.
    // -------------------------------------------------------------------------

    // One-time data rename (idempotent — no-op once done).
    await db.execute(sql`
      UPDATE categories SET name = 'Additional Parts'
      WHERE category_id = 'realoem-backfill' AND name = 'RealOEM Backfill'
    `);

    // --- Multilingual SEO migration (Task #32) ---
    // Add `locale` columns to editorial tables and rebuild uniqueness so
    // every supported language can carry independent blurbs/notes.
    await db.execute(sql`ALTER TABLE category_editorial ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en'`);
    await db.execute(sql`ALTER TABLE part_editorial_notes ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en'`);
    // Drop legacy unique constraints (we rebuild them with locale as part
    // of the key). DROP IF EXISTS makes this idempotent across deploys.
    await db.execute(sql`DROP INDEX IF EXISTS category_editorial_unique_idx`);
    // The legacy UNIQUE on part_number_clean was created as a constraint
    // by drizzle's `.unique()`. Use ALTER TABLE ... DROP CONSTRAINT IF EXISTS
    // to retire it without erroring on fresh installs.
    await db.execute(sql`ALTER TABLE part_editorial_notes DROP CONSTRAINT IF EXISTS part_editorial_notes_part_number_clean_unique`);
    await db.execute(sql`ALTER TABLE part_editorial_notes DROP CONSTRAINT IF EXISTS part_editorial_notes_part_number_clean_key`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS category_editorial_locale_unique_idx ON category_editorial(category_key, COALESCE(subcategory_key, ''), locale)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS part_editorial_notes_locale_unique_idx ON part_editorial_notes(part_number_clean, locale)`);

    // E2E fixture — ships a single deterministic ETK-covered VIN row
    // so `scripts/verify-vin-enrichment.ts` (and any future regression
    // suite) can prove the first-party regime end-to-end without
    // depending on a real PartsLink24 dump being present in the
    // workspace. ON CONFLICT DO NOTHING means real ops imports always
    // win over the fixture.
    await db.execute(sql`
      INSERT INTO vin_factory_options (vin, sa_codes, paint_code, upholstery_code, production_date, source)
      VALUES ('WBS32AY090FM28236', ARRAY['S206','S2VB','S2TB']::text[], '475', 'FAAT', '2020-09', 'e2e_fixture')
      ON CONFLICT (vin) DO NOTHING
    `);

    // Mapping uniqueness: one diagram per subcategory. Older deploys had a
    // composite unique index `(subcategory_id, realoem_diagram_url)` that
    // permitted the same subcategory to map to multiple URLs — drop it
    // (idempotent) before creating the stricter constraint. We also drop
    // the redundant non-unique single-column index.
    await db.execute(sql`DROP INDEX IF EXISTS subcategory_realoem_map_unique_idx`);
    await db.execute(sql`DROP INDEX IF EXISTS subcategory_realoem_map_subcategory_idx`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS subcategory_realoem_map_subcategory_unique_idx ON subcategory_realoem_map(subcategory_id)`);

    // Task #161 — parts table performance: enable pg_trgm + btree indexes.
    //
    // Btree indexes are fast and safe to create on every boot.
    // GIN trigram indexes use CONCURRENTLY so they never hold a table-level
    // write lock (safe even on a 5.97M-row live table). CONCURRENTLY cannot
    // run inside a transaction, so we use pool.query() directly.
    // These indexes are NOT declared in shared/schema.ts because drizzle-kit
    // cannot round-trip gin_trgm_ops expressions and would always emit
    // DROP+CREATE prompts, breaking the publish pre-check.
    try {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_parts_car_id ON parts(car_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_parts_subcategory_id ON parts(subcategory_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_parts_part_number_clean ON parts(part_number_clean)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts(part_number)`);
      console.log("[Startup] parts btree indexes ensured");
    } catch (err: any) {
      console.warn(`[Startup] parts btree index setup non-fatal error: ${err.message}`);
    }
    // GIN trigram indexes — created CONCURRENTLY in background so startup
    // is not blocked. IF NOT EXISTS makes this a no-op after first run.
    // db.execute() uses the pool in autocommit mode, which satisfies
    // CONCURRENTLY's "cannot run inside a transaction block" requirement.
    setImmediate(async () => {
      try {
        await db.execute(sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parts_description_trgm ON parts USING gin (description gin_trgm_ops)`);
        await db.execute(sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parts_part_number_trgm ON parts USING gin (part_number gin_trgm_ops)`);
        await db.execute(sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parts_part_number_clean_trgm ON parts USING gin (part_number_clean gin_trgm_ops)`);
        console.log("[Startup] parts GIN trigram indexes ensured (CONCURRENTLY)");
      } catch (err: any) {
        console.warn(`[Startup] parts GIN index non-fatal error: ${err.message}`);
      }
    });

    // Task #62 — file-based per-VIN FA importer. Reads
    // `data/etk/exports/vin_fa.psv` (BMW PartsLink24 FA dump format,
    // see `server/etk-vin-fa.ts`) and bulk-seeds `vin_factory_options`
    // so the orchestrator can serve the Options tab from local
    // first-party data instead of falling back to bimmer.work. Safe
    // no-op when the dump file is absent.
    try {
      const { loadVinFaDumpOnStartup } = await import("./etk-vin-fa");
      await loadVinFaDumpOnStartup();
    } catch (err: any) {
      console.warn(`[Startup] vin_fa.psv loader failed (non-fatal): ${err.message}`);
    }

    const result = await db.execute(
      sql`UPDATE cars SET scrape_status = CASE WHEN total_parts > 0 THEN 'complete' ELSE 'idle' END WHERE scrape_status = 'running' RETURNING id`
    );
    const fixedCars = result.rows?.length || 0;
    if (fixedCars > 0) {
      console.log(`[Startup] Reset ${fixedCars} stuck car scrapes from 'running' to 'complete'/'idle'`);
    }

    const interrupted = await getInterruptedJobs();
    if (interrupted.length > 0) {
      console.log(`[Startup] Found ${interrupted.length} interrupted background job(s)`);
      for (const job of interrupted) {
        console.log(`[Startup] Resuming interrupted ${job.jobType} job #${job.id} (started ${job.startedAt})`);
        try {
          if (job.jobType === "enrichment") {
            const { startEnrichment } = await import("./scraper");
            startEnrichment(true).catch(err => console.error(`[Startup] Resume enrichment failed:`, err.message));
          } else if (job.jobType === "crossref") {
            const { startCrossRefEnrichment } = await import("./realoem-crossref");
            startCrossRefEnrichment(true).catch(err => console.error(`[Startup] Resume crossref failed:`, err.message));
          } else if (job.jobType === "model_scrape") {
            const { startModelScrape } = await import("./model-scraper");
            startModelScrape(true).catch(err => console.error(`[Startup] Resume model scrape failed:`, err.message));
          } else if (job.jobType === "resume_incomplete") {
            const progress = job.progress as any;
            const remainingCarIds = progress?.remainingCarIds || [];
            if (remainingCarIds.length > 0) {
              console.log(`[Startup] Will auto-resume incomplete scrape for ${remainingCarIds.length} cars after server is ready`);
              await failJob(job.id, "Server restarted, will create new job");
              const resumeData = { carIds: remainingCarIds, previousProgress: progress };
              setTimeout(async () => {
                try {
                  const http = await import("http");
                  const postData = JSON.stringify(resumeData);
                  const req = http.request({
                    hostname: "localhost",
                    port: parseInt(process.env.PORT || "5000"),
                    path: "/api/admin/resume-incomplete/auto-restart",
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-internal-restart": "true", "Content-Length": Buffer.byteLength(postData) },
                  }, (resp) => {
                    let data = "";
                    resp.on("data", (c: string) => data += c);
                    resp.on("end", () => console.log(`[Startup] Resume incomplete auto-restart response: ${data}`));
                  });
                  req.on("error", (e: any) => console.error(`[Startup] Resume incomplete auto-restart failed:`, e.message));
                  req.write(postData);
                  req.end();
                } catch (e: any) {
                  console.error(`[Startup] Resume incomplete auto-restart error:`, e.message);
                }
              }, 10000);
            } else {
              await failJob(job.id, "Server restarted, no remaining cars");
            }
          } else if (job.jobType === "part-appearance-harvest") {
            const { startPartAppearanceHarvest } = await import("./realoem-part-appearance-harvester");
            const progress = job.progress as any;
            const freshHours = progress?.freshHours ?? 24;
            await failJob(job.id, "Server restarted, will resume");
            startPartAppearanceHarvest({ freshHours, isResume: true })
              .catch(err => console.error(`[Startup] Resume part-appearance-harvest failed:`, err.message));
          } else if (job.jobType === "etk_uncovered_backfill") {
            const { startEtkUncoveredBackfill } = await import("./etk-uncovered-backfill");
            await failJob(job.id, "Server restarted, will resume");
            startEtkUncoveredBackfill()
              .catch(err => console.error(`[Startup] Resume etk_uncovered_backfill failed:`, err.message));
          } else if (job.jobType === "realoem_backfill") {
            const { runBackfill } = await import("./realoem-backfill");
            const progress = job.progress as any;
            const scope = (progress?.scope ?? "all") as "car" | "chassis" | "all";
            const scopeLabel: string = progress?.scopeLabel ?? "";
            const chassis = scope === "chassis"
              ? scopeLabel.replace(/^chassis\s+/i, "").trim() || undefined
              : undefined;
            const opts = {
              scope,
              chassis,
              freshnessHours: progress?.freshnessHours ?? 72,
              fixtureOnly: !!progress?.fixtureOnly,
              forceRefetch: !!progress?.forceRefetch,
            };
            console.log(`[Startup] Resuming realoem_backfill with scope=${scope} chassis=${chassis ?? "all"}`);
            await failJob(job.id, "Server restarted, will resume");
            runBackfill(opts)
              .catch(err => console.error(`[Startup] Resume realoem_backfill failed:`, err.message));
          } else {
            const { interruptJob } = await import("./job-manager");
            console.log(`[Startup] Job type '${job.jobType}' does not support auto-resume — marking interrupted`);
            await interruptJob(job.id);
          }
        } catch (err: any) {
          console.error(`[Startup] Could not resume job #${job.id}:`, err.message);
          await failJob(job.id, `Resume failed: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error("[Background] Startup DDL/recovery failed:", err);
  }
  })(); // end fire-and-forget DDL block

  try {
    await registerRoutes(httpServer, app);
  } catch (err) {
    console.error("[Startup] registerRoutes failed — API routes may be partially unavailable:", err);
  }
  startBatchProcessor();
  startCatalogDeltaScheduler();

  // Error handler — registered before serverReady so any error during the
  // remaining startup work is caught and returned correctly.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    if (isLikelyBrowser(req)) {
      return res
        .status(status)
        .set("Content-Type", "text/html; charset=utf-8")
        .send(
          buildMaintenanceHtml(
            "Something went wrong",
            "An unexpected error occurred. We\u2019ll try again shortly.",
          ),
        );
    }

    return res.status(status).json({ message });
  });

  // Static file serving / Vite HMR — must be registered before serverReady
  // so the frontend is immediately available once the gate opens.
  if (process.env.NODE_ENV === "production") {
    try {
      serveStatic(app);
    } catch (err) {
      console.error("[Startup] serveStatic failed — frontend may be unavailable, but API is up:", err);
    }
  } else {
    try {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    } catch (err) {
      console.error("[Startup] setupVite failed:", err);
    }
  }

  // Open the maintenance gate — all synchronous startup work (routes, error
  // handler, static/Vite setup) is complete. Background schedulers below are
  // fire-and-forget and must not block this assignment.
  serverReady = true;
  log("Server ready — maintenance gate lifted");

  // -------------------------------------------------------------------------
  // Background schedulers & DDL — fire-and-forget AFTER the gate opens.
  // None of these are prerequisites for handling requests. Wrapping them in
  // void IIFEs means a hang or error in any one block never affects the others
  // or the main request path.
  // -------------------------------------------------------------------------

  // VIN backfill worker
  void (async () => {
    try {
      const { startVinBackfillWorker } = await import("./vin-backfill/worker");
      await startVinBackfillWorker();
    } catch (err: any) {
      console.error("[Background] VIN backfill worker failed to start:", err.message);
    }
  })();

  // Backup scheduler + catch-up
  void (async () => {
    try {
      const { ensureBackupTables } = await import("./backup/bootstrap");
      await ensureBackupTables();
      try {
        const { getBackupScheduleSettings, setBackupScheduleSettings } = await import("./backup/settings");
        const current = await getBackupScheduleSettings();
        if (current.hourlyEnabled) {
          await setBackupScheduleSettings({ hourlyEnabled: false });
          console.log("[Background] Backup schedule patched: hourlyEnabled → false");
        }
      } catch (patchErr) {
        console.error("[Background] Backup schedule hourly-disable patch failed:", patchErr);
      }
      const { startScheduler, isSchedulerActive, runCatchupBackupsIfStale } = await import("./backup/scheduler");
      await startScheduler();
      if (isSchedulerActive()) {
        void (async () => {
          try {
            await runCatchupBackupsIfStale();
          } catch (err) {
            console.error("[Background] Backup catch-up check failed:", err);
          }
        })();
      }
    } catch (err) {
      console.error("[Background] Backup scheduler failed to start:", err);
    }
  })();

  // SEO Growth Engine tables (Task #259)
  void (async () => {
    try {
      await Promise.all([
        (async () => {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS seo_keywords (
              id SERIAL PRIMARY KEY,
              project TEXT NOT NULL DEFAULT 'bmv.vin',
              keyword TEXT NOT NULL,
              intent TEXT NOT NULL,
              estimated_volume INTEGER,
              difficulty INTEGER,
              cpc REAL,
              priority INTEGER NOT NULL DEFAULT 1,
              page_targeting TEXT,
              cluster_id TEXT,
              discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS seo_keywords_keyword_project_unique_idx ON seo_keywords(keyword, project)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_keywords_project_idx ON seo_keywords(project)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_keywords_intent_idx ON seo_keywords(intent)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_keywords_priority_idx ON seo_keywords(priority)`);
        })(),
        (async () => {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS seo_content_pages (
              id SERIAL PRIMARY KEY,
              project TEXT NOT NULL DEFAULT 'bmv.vin',
              url TEXT NOT NULL,
              page_type TEXT NOT NULL,
              primary_keyword TEXT,
              word_count INTEGER,
              indexed BOOLEAN NOT NULL DEFAULT false,
              content_ref TEXT,
              generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
              last_refreshed_at TIMESTAMP
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS seo_content_pages_url_unique_idx ON seo_content_pages(url, project)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_content_pages_project_idx ON seo_content_pages(project)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_content_pages_type_idx ON seo_content_pages(page_type)`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS seo_refresh_queue (
              id SERIAL PRIMARY KEY,
              page_id INTEGER NOT NULL REFERENCES seo_content_pages(id) ON DELETE CASCADE,
              due_at TIMESTAMP NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              priority INTEGER NOT NULL DEFAULT 1,
              attempts INTEGER NOT NULL DEFAULT 0,
              last_attempt_at TIMESTAMP,
              completed_at TIMESTAMP,
              notes TEXT
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_refresh_queue_status_idx ON seo_refresh_queue(status)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_refresh_queue_due_idx ON seo_refresh_queue(due_at)`);
        })(),
      ]);
      console.log("[Background] SEO growth engine tables ensured");
    } catch (err: any) {
      console.warn("[Background] SEO growth engine table setup non-fatal:", err.message);
    }
  })();

  // SEO growth auxiliary tables
  void (async () => {
    try {
      const { ensureSeoGrowthTables } = await import("./seo/growth-setup");
      await ensureSeoGrowthTables();
      console.log("[Background] SEO growth tables ensured");
    } catch (err) {
      console.error("[Background] SEO growth tables failed to ensure:", err);
    }
  })();

  // AI usage tracking table (Task #300)
  void (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
          id             SERIAL PRIMARY KEY,
          feature        TEXT NOT NULL,
          model          TEXT NOT NULL,
          prompt_tokens  INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd       REAL NOT NULL DEFAULT 0,
          created_at     TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON ai_usage_logs(created_at)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_usage_logs_feature_idx ON ai_usage_logs(feature)`);
      console.log("[Background] ai_usage_logs table ensured");
    } catch (err: any) {
      console.warn("[Background] ai_usage_logs table setup non-fatal:", err.message);
    }
  })();

  // SEO Publisher API (Roman/Hermes automation — Task #336)
  void (async () => {
    try {
      const { ensureSeoPublisherTables } = await import("./seo/seo-publisher-routes");
      await ensureSeoPublisherTables();
      const apiToken = process.env.SEO_PUBLISHER_API_TOKEN;
      const allowedDomains = process.env.SEO_PUBLISHER_ALLOWED_DOMAINS ?? "bmv.parts,bmw.vin";
      const defaultMode = process.env.SEO_PUBLISHER_DEFAULT_MODE ?? "draft";
      const requireApproval = process.env.SEO_PUBLISHER_REQUIRE_PUBLISH_APPROVAL ?? "false";
      console.log(`[SEO Publisher] configured — token=${apiToken ? "SET" : "NOT SET"} domains=${allowedDomains} defaultMode=${defaultMode} requireApproval=${requireApproval}`);
    } catch (err: any) {
      console.warn("[Background] SEO Publisher tables non-fatal:", err.message);
    }
  })();

  // One-time patch: F87N VINs enriched before the VIN-year disambiguation
  // fix had their startOfProduction set to "01/2000" by the ETK enricher
  // (which called BMW's API with modelYear=2000 — wrong, should be 2020).
  // F87N ran 2018–2021 so "01/2000" is always wrong; patch both:
  //   • enriched_data.vehicle.startOfProduction → "01/2020"
  //   • decoded_data.modelYear → 2020 (set minimal decoded_data if missing)
  // Idempotent — WHERE clauses guard against double-patching.
  void (async () => {
    try {
      const patched = await db.execute(sql`
        UPDATE vin_cache
        SET
          enriched_data = CASE
            WHEN enriched_data->'vehicle'->>'startOfProduction' = '01/2000'
            THEN jsonb_set(enriched_data, '{vehicle,startOfProduction}', '"01/2020"'::jsonb)
            ELSE enriched_data
          END,
          decoded_data = CASE
            WHEN decoded_data IS NULL
            THEN jsonb_build_object('modelYear', 2020, 'chassis', enriched_data->'vehicle'->>'chassis', 'isBmw', true)
            ELSE jsonb_set(decoded_data, '{modelYear}', '2020'::jsonb)
          END,
          updated_at = NOW()
        WHERE enriched_data->'vehicle'->>'chassis' = 'F87N'
          AND (
            enriched_data->'vehicle'->>'startOfProduction' = '01/2000'
            OR (decoded_data IS NOT NULL AND (decoded_data->>'modelYear')::int = 2000)
          )
      `);
      const cnt = (patched as any).rowCount ?? 0;
      if (cnt > 0) console.log(`[Background] F87N modelYear patch applied to ${cnt} VIN rows`);
    } catch (err: any) {
      console.warn("[Background] F87N VIN patch non-fatal:", err.message);
    }
  })();

  // ISTA tables + extractor wiring
  void (async () => {
    try {
      const { ensureIstaTables } = await import("./ista/bootstrap");
      await ensureIstaTables();
      const { setExtractor } = await import("./ista/extractor");
      const { SqliteExtractor } = await import("./ista/sqlite-extractor");
      setExtractor(new SqliteExtractor());
      console.log("[ISTA] Real SqliteExtractor wired in (stub replaced)");
    } catch (err) {
      console.error("[Background] ISTA bootstrap failed:", err);
    }
  })();

  // VIN cache backfill — fire-and-forget so the seed import (now ~220k rows)
  // never blocks the server from listening / passing healthchecks. The
  // bootstrap is idempotent (per-source skip + ON CONFLICT DO NOTHING), so
  // running it in the background after listen() is safe.
  (async () => {
    try {
      const { ensureVinCacheBackfill } = await import("./vin-cache-bootstrap");
      await ensureVinCacheBackfill();
    } catch (err) {
      console.error("[Background] VIN cache backfill bootstrap failed:", err);
    }
  })();

  // bmw_models reference table seed — fire-and-forget so a fresh deploy
  // (or a restored backup missing this table) gets the ~6.5k VIN
  // decoder rows without an out-of-band HTTP sync. No-op when the table
  // is already populated above the threshold.
  (async () => {
    try {
      const { runBmwModelsSeed } = await import("./bmw-models-seed");
      await runBmwModelsSeed();
    } catch (err) {
      console.error("[Background] bmw_models seed failed:", err);
    }
  })();

  // bmv.vin content seed — fire-and-forget so a fresh deploy or DB restore
  // automatically populates home copy, brand decoder copy, glossary (34 terms),
  // guides (12), and facet blurbs without manual intervention. The seed is
  // fully idempotent (upsert on unique keys), so re-runs are safe no-ops.
  // Skipped when tables are already populated to avoid unnecessary DB writes.
  (async () => {
    try {
      const countRow = await db.execute(
        sql`SELECT COUNT(*) AS n FROM bmv_vin_guide`
      );
      const n = Number((countRow.rows?.[0] as any)?.n ?? 0);
      if (n === 0) {
        const { seedBmvVinContent } = await import("./seo/bmv-vin-seed");
        const report = await seedBmvVinContent();
        console.log(
          `[Background] bmv_vin content seeded — guides=${report.guides} glossary=${report.glossary} brands=${report.brandDecoderCopy}`,
        );
      }
    } catch (err) {
      console.error("[Background] bmv_vin content seed failed:", err);
    }
  })();

  // -------------------------------------------------------------------------
  // Background data patches — run AFTER the gate lifts so they never block
  // healthchecks or the maintenance-gate timeout. Both are idempotent.
  // -------------------------------------------------------------------------

  // Patch 1: F87N VINs with stale startOfProduction "01/2000" and/or
  // decoded_data.modelYear = 2000. F87N ran 2018–2021 so 2000 is always wrong.
  void (async () => {
    try {
      const patched = await db.execute(sql`
        UPDATE vin_cache
        SET
          enriched_data = CASE
            WHEN enriched_data->'vehicle'->>'startOfProduction' = '01/2000'
            THEN jsonb_set(enriched_data, '{vehicle,startOfProduction}', '"01/2020"'::jsonb)
            ELSE enriched_data
          END,
          decoded_data = CASE
            WHEN decoded_data IS NULL
            THEN jsonb_build_object('modelYear', 2020, 'chassis', enriched_data->'vehicle'->>'chassis', 'isBmw', true)
            ELSE jsonb_set(decoded_data, '{modelYear}', '2020'::jsonb)
          END,
          updated_at = NOW()
        WHERE enriched_data->'vehicle'->>'chassis' = 'F87N'
          AND (
            enriched_data->'vehicle'->>'startOfProduction' = '01/2000'
            OR (decoded_data IS NOT NULL AND (decoded_data->>'modelYear')::int = 2000)
          )
      `);
      const n = (patched as any).rowCount ?? 0;
      if (n > 0) console.log(`[Background] Patched ${n} stale F87N vin_cache rows (SOP 01/2000 → 01/2020, modelYear 2000 → 2020)`);
    } catch (err: any) {
      console.warn("[Background] F87N modelYear patch non-fatal:", err.message);
    }
  })();

  // Patch 2: G80/G82/G83 and other VINs where decoded_data.modelYear is 2020
  // but enriched_data already has a startOfProduction pointing to a different
  // year. Corrects historical cache rows locked at 2020 by the year-code "0"
  // heuristic before the disambiguateModelYear long-run-chassis guard was added.
  void (async () => {
    try {
      const backfillResult = await db.execute(sql`
        UPDATE vin_cache
        SET
          decoded_data = jsonb_set(
            COALESCE(decoded_data, '{}'::jsonb),
            '{modelYear}',
            to_jsonb(
              (regexp_match(
                COALESCE(
                  enriched_data->'vehicle'->>'startOfProduction',
                  enriched_data->>'productionDate'
                ),
                '\d{4}'
              ))[1]::int
            )
          ),
          updated_at = NOW()
        WHERE
          (decoded_data IS NULL OR (decoded_data->>'modelYear')::int = 2020)
          AND (
            enriched_data->'vehicle'->>'startOfProduction' IS NOT NULL
            OR enriched_data->>'productionDate' IS NOT NULL
          )
          AND (
            (regexp_match(
              COALESCE(
                enriched_data->'vehicle'->>'startOfProduction',
                enriched_data->>'productionDate'
              ),
              '\d{4}'
            ))[1]::int
          ) IS DISTINCT FROM 2020
          AND (
            (regexp_match(
              COALESCE(
                enriched_data->'vehicle'->>'startOfProduction',
                enriched_data->>'productionDate'
              ),
              '\d{4}'
            ))[1]::int
          ) BETWEEN 1980 AND 2030
      `);
      const n = (backfillResult as any).rowCount ?? 0;
      if (n > 0) console.log(`[Background] Backfilled ${n} vin_cache rows: corrected modelYear from 2020 to SOP-derived year`);
    } catch (err: any) {
      console.warn("[Background] modelYear SOP backfill non-fatal:", err.message);
    }
  })();

  // ---------------------------------------------------------------------------
  // Non-critical schedulers — fired as fire-and-forget AFTER serverReady so they
  // never delay the maintenance-gate lift. None of these need to be running
  // before the server accepts traffic; they only poll/refresh in the background.
  // ---------------------------------------------------------------------------
  (async () => {
    try {
      const { initSeoGrowthEngine } = await import("./seo/seo-growth-engine");
      initSeoGrowthEngine();
    } catch (err: any) {
      console.warn("[Background] SEO growth engine init non-fatal:", err.message);
    }
  })();
  (async () => {
    try {
      const { startSeoGrowthScheduler } = await import("./seo/growth-scheduler");
      startSeoGrowthScheduler();
    } catch (err: any) {
      console.warn("[Background] SEO growth scheduler non-fatal:", err.message);
    }
  })();
  (async () => {
    try {
      const { startIstaScheduler } = await import("./ista/scheduler");
      startIstaScheduler();
      console.log("[Background] ISTA scheduler started");
    } catch (err) {
      console.error("[Background] ISTA scheduler failed to start:", err);
    }
  })();

  // autoBootstrap was previously called in the httpServer.listen() callback.
  // Now that listen() is at the top of the IIFE, we call it here instead —
  // after serverReady is true so the internal HTTP call to /api/sync-from-dev
  // is no longer blocked by the maintenance-page gate.
  void autoBootstrapDataIfEmpty(port);
})();

async function autoBootstrapDataIfEmpty(port: number) {
  // Threshold gates the "is this a freshly-deployed empty DB" decision.
  // We check `cars` (not `bmw_models`) because the latter is now seeded
  // independently at startup from data/bmw-models-seed.json — using
  // bmw_models here would cause the seed to permanently mask the
  // autobootstrap signal and a greenfield deploy would never load
  // cars/parts/pricing/etc. from the dev export. cars is the right
  // proxy: it only grows via scrape or sync-from-dev, never via seed.
  const MIN_CARS = 100;

  if (process.env.NODE_ENV !== "production" && process.env.AUTO_BOOTSTRAP !== "1") {
    return;
  }

  try {
    const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM cars`);
    const count = Number((r.rows?.[0] as any)?.n ?? 0);
    if (count >= MIN_CARS) {
      log(`[Bootstrap] cars=${count} (>= ${MIN_CARS}); skipping auto-sync`);
      return;
    }

    // Cross-replica guard: only one replica should kick off the sync. Stale
    // locks (>15min — sync usually completes in a few minutes) auto-expire so
    // a crashed replica can't permanently wedge bootstrap.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bootstrap_locks (
        name TEXT PRIMARY KEY,
        acquired_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    const lockResult = await db.execute(sql`
      INSERT INTO bootstrap_locks (name, acquired_at) VALUES ('auto_sync_from_dev', NOW())
      ON CONFLICT (name) DO UPDATE SET acquired_at = NOW()
        WHERE bootstrap_locks.acquired_at < NOW() - INTERVAL '15 minutes'
      RETURNING acquired_at
    `);
    if (!lockResult.rows || lockResult.rows.length === 0) {
      log(`[Bootstrap] cars=${count}; another replica holds the bootstrap lock — skipping`);
      return;
    }

    log(`[Bootstrap] cars=${count} (< ${MIN_CARS}); auto-triggering /api/sync-from-dev from Object Storage`);
    const http = await import("http");
    const postData = JSON.stringify({ force: false });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/sync-from-dev",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "x-internal-bootstrap": "true",
        },
      },
      (resp) => {
        let data = "";
        resp.on("data", (c: string) => (data += c));
        resp.on("end", () => log(`[Bootstrap] sync-from-dev kickoff: ${resp.statusCode} ${data.slice(0, 200)}`));
      },
    );
    req.on("error", (e: any) => log(`[Bootstrap] sync-from-dev kickoff failed: ${e.message}`));
    req.write(postData);
    req.end();
  } catch (e: any) {
    log(`[Bootstrap] auto-sync check failed: ${e.message}`);
  }
}
