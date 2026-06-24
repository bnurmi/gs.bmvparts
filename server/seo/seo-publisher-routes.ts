/**
 * SEO Publisher API routes (Roman/Hermes automation)
 *
 * All routes are mounted at /api/seo/publisher and protected by publisherAuth.
 * Admin-facing routes (approve/reject drafts, audit log read) are also accessible
 * via the admin session middleware under /api/admin/seo/publisher/*.
 */

import type { Express, Request, Response } from "express";
import { publisherAuth } from "./publisher-auth";
import { validatePublisherPage, sanitizeHtml } from "./publisher-validate";
import { requireAdmin } from "../auth";
import { db } from "../storage";
import { sql } from "drizzle-orm";
import { seoPublisherPages, seoAuditLog } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Env flags
// ---------------------------------------------------------------------------
function requireApproval(): boolean {
  return process.env.SEO_PUBLISHER_REQUIRE_PUBLISH_APPROVAL === "true";
}

function defaultMode(): string {
  return process.env.SEO_PUBLISHER_DEFAULT_MODE ?? "draft";
}

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------
async function writeAudit(params: {
  actor: string;
  tokenLabel?: string;
  action: string;
  contentType?: string;
  targetId?: number;
  targetSlug?: string;
  targetUrl?: string;
  summary?: string;
  status?: string;
  error?: string;
}): Promise<void> {
  try {
    await db.insert(seoAuditLog).values({
      actor: params.actor,
      tokenLabel: params.tokenLabel ?? null,
      action: params.action,
      contentType: params.contentType ?? null,
      targetId: params.targetId ?? null,
      targetSlug: params.targetSlug ?? null,
      targetUrl: params.targetUrl ?? null,
      summary: params.summary ?? null,
      status: params.status ?? "ok",
      error: params.error ?? null,
    });
  } catch (e) {
    console.error("[seo-publisher] audit log write failed", e);
  }
}

// ---------------------------------------------------------------------------
// Find page by id or slug (optionally domain-scoped)
// ---------------------------------------------------------------------------
// Default domain used when caller omits domain hint (first in the allowlist).
// Ensures slug-based lookups are deterministic even before multiple domains have pages.
function getDefaultDomain(): string {
  return (process.env.SEO_PUBLISHER_ALLOWED_DOMAINS ?? "bmv.parts,bmw.vin")
    .split(",").map((s) => s.trim())[0];
}

// findPage() always returns Drizzle-mapped camelCase rows — never raw SQL rows.
// Callers MUST pass domain when targeting by slug in multi-domain context.
async function findPage(
  idOrSlug: string,
  domain?: string,
): Promise<typeof seoPublisherPages.$inferSelect | null> {
  const isNumeric = /^\d+$/.test(idOrSlug);

  if (isNumeric) {
    const r = await db.select().from(seoPublisherPages)
      .where(eq(seoPublisherPages.id, parseInt(idOrSlug, 10)));
    return r[0] ?? null;
  }

  // Slug-based lookup: scope to domain to prevent cross-domain ambiguity.
  // Fall back to the default domain when caller omits hint, so behaviour is
  // deterministic even if the same slug exists on multiple domains later.
  const effectiveDomain = domain ?? getDefaultDomain();
  const r = await db.select().from(seoPublisherPages)
    .where(and(eq(seoPublisherPages.slug, idOrSlug), eq(seoPublisherPages.domain, effectiveDomain)));
  return r[0] ?? null;
}

// ---------------------------------------------------------------------------
// Allowed domains helper (authoritative; also used by route handlers)
// ---------------------------------------------------------------------------
function getAllowedDomainsSet(): Set<string> {
  const raw = process.env.SEO_PUBLISHER_ALLOWED_DOMAINS ?? "bmv.parts,bmw.vin";
  return new Set(raw.split(",").map((d) => d.trim()).filter(Boolean));
}

function enforceAllowedDomain(domain: string, res: Response): boolean {
  const allowed = getAllowedDomainsSet();
  if (!allowed.has(domain)) {
    res.status(403).json({ error: `Domain '${domain}' is not in SEO_PUBLISHER_ALLOWED_DOMAINS (${[...allowed].join(",")})` });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sitemap refresh helper — publisher pages are included in the dynamic
// sitemap-content.xml route (which queries seo_publisher_pages at request
// time, so there is no stale cache to bust). This function records the event
// and logs a meaningful count so operators can confirm the action.
// ---------------------------------------------------------------------------
async function triggerSitemapRefresh(domain: string): Promise<{ domain: string; publishedCount: number }> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM seo_publisher_pages WHERE status = 'published' AND domain = ${domain}
  `);
  const publishedCount = ((result as any).rows ?? result)[0]?.cnt ?? 0;
  // Sitemaps (sitemap-content.xml / bmv.vin sitemap-pages) are generated
  // dynamically from the DB on every request — no server-side cache to bust.
  // The next Googlebot fetch will automatically include the updated page set.
  console.log(`[seo-publisher] sitemap refresh for ${domain}: ${publishedCount} published pages now included in sitemap-content.xml`);
  return { domain, publishedCount };
}

// ---------------------------------------------------------------------------
// Ensure tables exist (called at startup)
// ---------------------------------------------------------------------------
export async function ensureSeoPublisherTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seo_publisher_pages (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'page',
      status TEXT NOT NULL DEFAULT 'draft',
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      title TEXT NOT NULL,
      meta_description TEXT,
      canonical_url TEXT,
      h1 TEXT,
      body_html TEXT,
      excerpt TEXT,
      schema_json JSONB,
      internal_links JSONB,
      featured_image_url TEXT,
      og_title TEXT,
      og_description TEXT,
      og_image_url TEXT,
      category TEXT,
      tags TEXT[],
      source TEXT NOT NULL DEFAULT 'roman-hermes',
      author TEXT,
      domain TEXT NOT NULL DEFAULT 'bmv.parts',
      published_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seo_audit_log (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor TEXT NOT NULL,
      token_label TEXT,
      action TEXT NOT NULL,
      content_type TEXT,
      target_id INTEGER,
      target_slug TEXT,
      target_url TEXT,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      error TEXT
    )
  `);
  // Composite unique constraint: same slug can exist on different domains
  await db.execute(sql`
    ALTER TABLE seo_publisher_pages
      ADD CONSTRAINT seo_publisher_pages_slug_domain_unique UNIQUE (slug, domain)
  `).catch((e: any) => {
    // Ignore "already exists" — idempotent
    if (!e.message?.includes("already exists")) throw e;
  });
  // Drop old single-column slug unique if it exists (migration cleanup)
  await db.execute(sql`
    ALTER TABLE seo_publisher_pages DROP CONSTRAINT IF EXISTS seo_publisher_pages_slug_key
  `).catch(() => {});
  await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_publisher_pages_slug_idx ON seo_publisher_pages (slug)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_publisher_pages_slug_domain_idx ON seo_publisher_pages (slug, domain)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_publisher_pages_status_idx ON seo_publisher_pages (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_publisher_pages_source_idx ON seo_publisher_pages (source)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_publisher_pages_domain_idx ON seo_publisher_pages (domain)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_audit_log_timestamp_idx ON seo_audit_log (timestamp)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_audit_log_actor_idx ON seo_audit_log (actor)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS seo_audit_log_target_idx ON seo_audit_log (target_slug)`);
  console.log("[seo-publisher] tables ready");
}

// ---------------------------------------------------------------------------
// Mount all publisher routes
// ---------------------------------------------------------------------------
export function mountSeoPublisherRoutes(app: Express): void {

  // ---- Public bearer-token routes (/api/seo/publisher/*) ------------------

  // Health
  app.get("/api/seo/publisher/health", publisherAuth, (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      apiVersion: "1.0",
      defaultMode: defaultMode(),
      requirePublishApproval: requireApproval(),
    });
  });

  // Capabilities
  app.get("/api/seo/publisher/capabilities", publisherAuth, (_req, res) => {
    res.json({
      supportsPages: true,
      supportsArticles: true,
      supportsGuides: true,
      supportsDataPages: true,
      supportsScheduledPublishing: false,
      supportsSitemapRefresh: true,
      supportsArchiving: true,
      contentTypes: ["page", "article", "guide", "data"],
      statusValues: ["draft", "published", "archived"],
      rateLimits: { reads: "60/min", writes: "10/min", publishes: "3/min" },
      domains: (process.env.SEO_PUBLISHER_ALLOWED_DOMAINS ?? "bmv.parts,bmw.vin").split(",").map((d) => d.trim()),
      requirePublishApproval: requireApproval(),
    });
  });

  // Validate (pre-write check; no DB writes)
  // Also runs sanitizeHtml() on bodyHtml and reports if content would be stripped.
  app.post("/api/seo/publisher/validate", publisherAuth, async (req, res) => {
    try {
      const body = req.body ?? {};
      const result = await validatePublisherPage(body);

      // Run sanitizer in preview mode: compare before/after and warn on changes
      let sanitizerWarnings: string[] = [];
      let sanitizedBodyHtml: string | null = null;
      if (body.bodyHtml && typeof body.bodyHtml === "string") {
        sanitizedBodyHtml = sanitizeHtml(body.bodyHtml);
        if (sanitizedBodyHtml !== body.bodyHtml) {
          result.warnings.push(
            "bodyHtml contains disallowed tags/attributes that will be stripped at write time. " +
            "Preview the sanitized output in the `sanitizedBodyHtml` field."
          );
        }
      }

      res.json({ ...result, sanitizedBodyHtml });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create page (POST /api/seo/publisher/pages)
  app.post("/api/seo/publisher/pages", publisherAuth, async (req, res) => {
    await handleCreate(req, res, "page");
  });

  // Update page (PUT /api/seo/publisher/pages/:idOrSlug)
  app.put("/api/seo/publisher/pages/:idOrSlug", publisherAuth, async (req, res) => {
    await handleUpdate(req, res, req.params.idOrSlug);
  });

  // List pages
  app.get("/api/seo/publisher/pages", publisherAuth, async (req, res) => {
    await handleList(req, res, ["page", "guide", "data"]);
  });

  // Get single page
  app.get("/api/seo/publisher/pages/:idOrSlug", publisherAuth, async (req, res) => {
    const domainHint = (req.query?.domain as string | undefined);
    await handleGet(req, res, req.params.idOrSlug, domainHint);
  });

  // Create article (POST /api/seo/publisher/articles)
  app.post("/api/seo/publisher/articles", publisherAuth, async (req, res) => {
    await handleCreate(req, res, "article");
  });

  // Update article
  app.put("/api/seo/publisher/articles/:idOrSlug", publisherAuth, async (req, res) => {
    await handleUpdate(req, res, req.params.idOrSlug);
  });

  // List articles
  app.get("/api/seo/publisher/articles", publisherAuth, async (req, res) => {
    await handleList(req, res, ["article"]);
  });

  // Get single article
  app.get("/api/seo/publisher/articles/:idOrSlug", publisherAuth, async (req, res) => {
    await handleGet(req, res, req.params.idOrSlug);
  });

  // Publish
  app.post("/api/seo/publisher/publish/:idOrSlug", publisherAuth, async (req, res) => {
    const actor = (req as any).__publisherActor ?? "api";
    const tokenLabel = (req as any).__publisherTokenLabel;
    try {
      const domainHint = ((req.body?.domain ?? req.query?.domain) as string | undefined);
      const page = await findPage(req.params.idOrSlug, domainHint);
      if (!page) {
        res.status(404).json({ error: "Page not found" });
        return;
      }
      // Enforce domain allowlist on the resolved page's domain
      if (!enforceAllowedDomain(page.domain, res)) return;
      if (page.status === "published") {
        res.json({ ok: true, message: "Already published", page });
        return;
      }
      if (requireApproval() && !page.approved) {
        res.status(403).json({ error: "This page requires admin approval before publishing. Set SEO_PUBLISHER_REQUIRE_PUBLISH_APPROVAL=false to bypass." });
        return;
      }
      await db.execute(sql`
        UPDATE seo_publisher_pages
        SET status = 'published', published_at = NOW(), updated_at = NOW(), updated_by = ${actor}
        WHERE id = ${page.id}
      `);
      await writeAudit({ actor, tokenLabel, action: "publish", contentType: page.contentType, targetId: page.id, targetSlug: page.slug, status: "ok", summary: `Published '${page.title}'` });
      triggerSitemapRefresh(page.domain).catch(() => {});
      const updated = await findPage(String(page.id));
      res.json({ ok: true, page: updated });
    } catch (e: any) {
      await writeAudit({ actor, tokenLabel, action: "publish", targetSlug: req.params.idOrSlug, status: "error", error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // Archive
  app.post("/api/seo/publisher/archive/:idOrSlug", publisherAuth, async (req, res) => {
    const actor = (req as any).__publisherActor ?? "api";
    const tokenLabel = (req as any).__publisherTokenLabel;
    try {
      const domainHint = ((req.body?.domain ?? req.query?.domain) as string | undefined);
      const page = await findPage(req.params.idOrSlug, domainHint);
      if (!page) {
        res.status(404).json({ error: "Page not found" });
        return;
      }
      // Enforce domain allowlist on the resolved page's domain
      if (!enforceAllowedDomain(page.domain, res)) return;
      await db.execute(sql`
        UPDATE seo_publisher_pages
        SET status = 'archived', archived_at = NOW(), updated_at = NOW(), updated_by = ${actor}
        WHERE id = ${page.id}
      `);
      await writeAudit({ actor, tokenLabel, action: "archive", contentType: page.contentType, targetId: page.id, targetSlug: page.slug, status: "ok", summary: `Archived '${page.title}'` });
      triggerSitemapRefresh(page.domain).catch(() => {});
      const updated = await findPage(String(page.id));
      res.json({ ok: true, page: updated });
    } catch (e: any) {
      await writeAudit({ actor, tokenLabel, action: "archive", targetSlug: req.params.idOrSlug, status: "error", error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // Sitemap refresh
  app.post("/api/seo/publisher/sitemap/refresh", publisherAuth, async (req, res) => {
    const actor = (req as any).__publisherActor ?? "api";
    const tokenLabel = (req as any).__publisherTokenLabel;
    const domain = (req.body?.domain as string) ?? "bmv.parts";
    if (!enforceAllowedDomain(domain, res)) return;
    try {
      const { publishedCount } = await triggerSitemapRefresh(domain);
      await writeAudit({ actor, tokenLabel, action: "sitemap_refresh", summary: `Sitemap refresh for ${domain}: ${publishedCount} published pages`, status: "ok" });
      res.json({
        ok: true, domain, timestamp: new Date().toISOString(),
        publishedCount,
        sitemapUrl: domain === "bmw.vin" ? "https://bmw.vin/sitemap.xml" : "https://bmv.parts/sitemap-content.xml",
        note: "Publisher pages are included in sitemap-content.xml on every request (no cache — next Googlebot fetch picks them up automatically)",
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Audit log (bearer-token access)
  app.get("/api/seo/publisher/audit", publisherAuth, async (req, res) => {
    await handleAuditLog(req, res);
  });

  // ---- Admin-session routes (/api/admin/seo/publisher/*) ------------------

  // List drafts for admin panel
  app.get("/api/admin/seo/publisher/pages", requireAdmin, async (req, res) => {
    await handleList(req, res, null);
  });

  // Get single page (admin) — domain query param scopes slug lookups
  app.get("/api/admin/seo/publisher/pages/:idOrSlug", requireAdmin, async (req, res) => {
    const domainHint = (req.query?.domain as string | undefined);
    await handleGet(req, res, req.params.idOrSlug, domainHint);
  });

  // Approve
  app.post("/api/admin/seo/publisher/approve/:idOrSlug", requireAdmin, async (req, res) => {
    const actor = (req as any).user?.username ?? "admin";
    const domainHint = ((req.body?.domain ?? req.query?.domain) as string | undefined);
    try {
      const page = await findPage(req.params.idOrSlug, domainHint);
      if (!page) { res.status(404).json({ error: "Not found" }); return; }
      await db.execute(sql`
        UPDATE seo_publisher_pages SET approved = TRUE, updated_at = NOW(), updated_by = ${actor} WHERE id = ${page.id}
      `);
      await writeAudit({ actor, action: "approve", contentType: page.contentType, targetId: page.id, targetSlug: page.slug, status: "ok", summary: `Approved '${page.title}'` });
      const updated = await findPage(String(page.id));
      res.json({ ok: true, page: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reject (set approved=false, keep as draft)
  app.post("/api/admin/seo/publisher/reject/:idOrSlug", requireAdmin, async (req, res) => {
    const actor = (req as any).user?.username ?? "admin";
    const reason = req.body?.reason as string | undefined;
    const domainHint = ((req.body?.domain ?? req.query?.domain) as string | undefined);
    try {
      const page = await findPage(req.params.idOrSlug, domainHint);
      if (!page) { res.status(404).json({ error: "Not found" }); return; }
      await db.execute(sql`
        UPDATE seo_publisher_pages SET approved = FALSE, status = 'draft', updated_at = NOW(), updated_by = ${actor} WHERE id = ${page.id}
      `);
      await writeAudit({ actor, action: "reject", contentType: page.contentType, targetId: page.id, targetSlug: page.slug, status: "ok", summary: `Rejected '${page.title}'${reason ? `: ${reason}` : ""}` });
      const updated = await findPage(String(page.id));
      res.json({ ok: true, page: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin-publish (bypasses approval requirement)
  app.post("/api/admin/seo/publisher/publish/:idOrSlug", requireAdmin, async (req, res) => {
    const actor = (req as any).user?.username ?? "admin";
    const domainHint = ((req.body?.domain ?? req.query?.domain) as string | undefined);
    try {
      const page = await findPage(req.params.idOrSlug, domainHint);
      if (!page) { res.status(404).json({ error: "Not found" }); return; }
      await db.execute(sql`
        UPDATE seo_publisher_pages SET status = 'published', approved = TRUE, published_at = NOW(), updated_at = NOW(), updated_by = ${actor} WHERE id = ${page.id}
      `);
      await writeAudit({ actor, action: "admin_publish", contentType: page.contentType, targetId: page.id, targetSlug: page.slug, status: "ok", summary: `Admin published '${page.title}'` });
      triggerSitemapRefresh(page.domain).catch(() => {});
      const updated = await findPage(String(page.id));
      res.json({ ok: true, page: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin health proxy — returns publisher config status without exposing the bearer token.
  // The token check is done server-side; only a boolean "tokenConfigured" is surfaced.
  app.get("/api/admin/seo/publisher/health", requireAdmin, async (req, res) => {
    const apiToken = process.env.SEO_PUBLISHER_API_TOKEN;
    res.json({
      ok: true,
      tokenConfigured: !!apiToken,
      domains: (process.env.SEO_PUBLISHER_ALLOWED_DOMAINS ?? "bmv.parts,bmw.vin").split(",").map((d) => d.trim()),
      defaultMode: process.env.SEO_PUBLISHER_DEFAULT_MODE ?? "draft",
      requireApproval: process.env.SEO_PUBLISHER_REQUIRE_PUBLISH_APPROVAL ?? "false",
    });
  });

  // Admin audit log
  app.get("/api/admin/seo/publisher/audit", requireAdmin, async (req, res) => {
    await handleAuditLog(req, res);
  });

  // Admin delete
  app.delete("/api/admin/seo/publisher/pages/:idOrSlug", requireAdmin, async (req, res) => {
    const actor = (req as any).user?.username ?? "admin";
    const domainHint = ((req.body?.domain ?? req.query?.domain) as string | undefined);
    try {
      const page = await findPage(req.params.idOrSlug, domainHint);
      if (!page) { res.status(404).json({ error: "Not found" }); return; }
      await db.execute(sql`DELETE FROM seo_publisher_pages WHERE id = ${page.id}`);
      await writeAudit({ actor, action: "delete", contentType: page.contentType, targetId: page.id, targetSlug: page.slug, status: "ok", summary: `Deleted '${page.title}'` });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

// ---------------------------------------------------------------------------
// Shared handlers
// ---------------------------------------------------------------------------

async function handleCreate(req: Request, res: Response, defaultContentType: string): Promise<void> {
  const actor = (req as any).__publisherActor ?? "api";
  const tokenLabel = (req as any).__publisherTokenLabel;
  const body = req.body ?? {};

  const contentType = (body.contentType as string) || defaultContentType;

  // Resolve effective domain (may be defaulted), then enforce allowlist
  const effectiveDomain = (body.domain as string | undefined) ?? "bmv.parts";
  if (!enforceAllowedDomain(effectiveDomain, res)) {
    await writeAudit({ actor, tokenLabel, action: "create", contentType, targetSlug: body.slug, status: "rejected", summary: `Domain '${effectiveDomain}' not in allowlist` });
    return;
  }

  // Run validation
  const validation = await validatePublisherPage(body);
  if (!validation.passed) {
    await writeAudit({ actor, tokenLabel, action: "create", contentType, targetSlug: body.slug, status: "rejected", summary: `Validation failed: ${validation.errors.join("; ")}` });
    res.status(422).json({ error: "Validation failed", ...validation });
    return;
  }

  // Sanitize
  const safeBody = body.bodyHtml ? sanitizeHtml(body.bodyHtml) : null;
  const initialStatus = defaultMode() === "published" ? "published" : "draft";

  try {
    // Idempotent upsert: if slug+domain already exists, update it rather than erroring.
    // This is safe for automation agents that retry create on transient failures.
    const result = await db.execute(sql`
      INSERT INTO seo_publisher_pages (
        slug, content_type, status, approved, title, meta_description, canonical_url,
        h1, body_html, excerpt, schema_json, internal_links, featured_image_url,
        og_title, og_description, og_image_url, category, tags, source, author, domain, updated_by
      ) VALUES (
        ${body.slug}, ${contentType}, ${initialStatus}, ${false},
        ${body.title}, ${body.metaDescription ?? null}, ${body.canonicalUrl ?? null},
        ${body.h1 ?? null}, ${safeBody}, ${body.excerpt ?? null},
        ${body.schemaJson ? JSON.stringify(body.schemaJson) : null}::jsonb,
        ${body.internalLinks ? JSON.stringify(body.internalLinks) : null}::jsonb,
        ${body.featuredImageUrl ?? null},
        ${body.ogTitle ?? null}, ${body.ogDescription ?? null}, ${body.ogImageUrl ?? null},
        ${body.category ?? null},
        ${body.tags ? `{${(body.tags as string[]).map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}` : null}::text[],
        ${body.source ?? "roman-hermes"}, ${body.author ?? null},
        ${effectiveDomain}, ${actor}
      )
      ON CONFLICT (slug, domain) DO UPDATE SET
        content_type = EXCLUDED.content_type,
        title = EXCLUDED.title,
        meta_description = EXCLUDED.meta_description,
        canonical_url = EXCLUDED.canonical_url,
        h1 = EXCLUDED.h1,
        body_html = EXCLUDED.body_html,
        excerpt = EXCLUDED.excerpt,
        schema_json = EXCLUDED.schema_json,
        internal_links = EXCLUDED.internal_links,
        featured_image_url = EXCLUDED.featured_image_url,
        og_title = EXCLUDED.og_title,
        og_description = EXCLUDED.og_description,
        og_image_url = EXCLUDED.og_image_url,
        category = EXCLUDED.category,
        tags = EXCLUDED.tags,
        author = EXCLUDED.author,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *, (xmax = 0) AS was_inserted
    `);
    const row = ((result as any).rows ?? result)[0];
    const wasInserted = row.was_inserted ?? true;
    const action = wasInserted ? "create" : "upsert";
    await writeAudit({ actor, tokenLabel, action, contentType, targetId: row.id, targetSlug: row.slug, status: "ok", summary: `${wasInserted ? "Created" : "Upserted"} '${row.title}' as ${wasInserted ? initialStatus : row.status}` });
    res.status(wasInserted ? 201 : 200).json({ ok: true, page: row, validation, upserted: !wasInserted });
  } catch (e: any) {
    await writeAudit({ actor, tokenLabel, action: "create", contentType, targetSlug: body.slug, status: "error", error: e.message });
    res.status(500).json({ error: e.message });
  }
}

async function handleUpdate(req: Request, res: Response, idOrSlug: string): Promise<void> {
  const actor = (req as any).__publisherActor ?? "api";
  const tokenLabel = (req as any).__publisherTokenLabel;
  const body = req.body ?? {};

  // Use domain from body to scope slug lookups — prevents cross-domain match
  const domainHint = (body.domain as string | undefined);
  const existing = await findPage(idOrSlug, domainHint);

  if (!existing) {
    // Idempotent: if slug provided in body and matches idOrSlug, treat as create
    if (body.slug && (body.slug === idOrSlug || /^\d+$/.test(idOrSlug))) {
      await handleCreate(req, res, (body.contentType as string) || "page");
      return;
    }
    res.status(404).json({ error: "Page not found" });
    return;
  }

  // Run validation in update mode (fields not provided are kept from existing; only validate what's changing)
  const validation = await validatePublisherPage(body, { isUpdate: true, existingId: existing.id });
  if (!validation.passed) {
    await writeAudit({ actor, tokenLabel, action: "update", contentType: existing.contentType, targetId: existing.id, targetSlug: existing.slug, status: "rejected", summary: `Validation failed: ${validation.errors.join("; ")}` });
    res.status(422).json({ error: "Validation failed", ...validation });
    return;
  }

  const safeBody = body.bodyHtml ? sanitizeHtml(body.bodyHtml) : existing.bodyHtml;

  try {
    await db.execute(sql`
      UPDATE seo_publisher_pages SET
        slug = ${body.slug ?? existing.slug},
        content_type = ${body.contentType ?? existing.contentType},
        title = ${body.title ?? existing.title},
        meta_description = ${body.metaDescription ?? existing.metaDescription},
        canonical_url = ${body.canonicalUrl ?? existing.canonicalUrl},
        h1 = ${body.h1 ?? existing.h1},
        body_html = ${safeBody},
        excerpt = ${body.excerpt ?? existing.excerpt},
        schema_json = ${body.schemaJson ? JSON.stringify(body.schemaJson) : existing.schemaJson ? JSON.stringify(existing.schemaJson) : null}::jsonb,
        internal_links = ${body.internalLinks ? JSON.stringify(body.internalLinks) : existing.internalLinks ? JSON.stringify(existing.internalLinks) : null}::jsonb,
        featured_image_url = ${body.featuredImageUrl ?? existing.featuredImageUrl},
        og_title = ${body.ogTitle ?? existing.ogTitle},
        og_description = ${body.ogDescription ?? existing.ogDescription},
        og_image_url = ${body.ogImageUrl ?? existing.ogImageUrl},
        category = ${body.category ?? existing.category},
        tags = ${body.tags ? `{${(body.tags as string[]).map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}` : existing.tags ? `{${existing.tags.map((t: string) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}` : null}::text[],
        author = ${body.author ?? existing.author},
        domain = ${body.domain ?? existing.domain},
        updated_by = ${actor},
        updated_at = NOW()
      WHERE id = ${existing.id}
    `);
    await writeAudit({ actor, tokenLabel, action: "update", contentType: existing.contentType, targetId: existing.id, targetSlug: existing.slug, status: "ok", summary: `Updated '${body.title ?? existing.title}'` });
    const updated = await findPage(String(existing.id));
    res.json({ ok: true, page: updated, validation });
  } catch (e: any) {
    await writeAudit({ actor, tokenLabel, action: "update", contentType: existing.contentType, targetId: existing.id, targetSlug: existing.slug, status: "error", error: e.message });
    res.status(500).json({ error: e.message });
  }
}

async function handleList(req: Request, res: Response, contentTypeFilter: string[] | null): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);
    const source = req.query.source as string | undefined;
    // Domain filter: default to all allowed domains so callers can't list pages
    // from non-allowlisted domains by omitting the param.
    const allowed = getAllowedDomainsSet();
    const domainFilter = req.query.domain as string | undefined;
    const effectiveDomains: string[] = domainFilter
      ? [domainFilter].filter((d) => allowed.has(d))
      : [...allowed];
    if (domainFilter && !allowed.has(domainFilter)) {
      res.status(403).json({ error: `Domain '${domainFilter}' is not in SEO_PUBLISHER_ALLOWED_DOMAINS` });
      return;
    }

    let whereClauses: string[] = [];
    // Always scope to allowlisted domains
    whereClauses.push(`domain IN (${effectiveDomains.map((d) => `'${d.replace(/'/g, "''")}'`).join(",")})`);
    if (status) whereClauses.push(`status = '${status.replace(/'/g, "''")}'`);
    if (contentTypeFilter && contentTypeFilter.length > 0) {
      whereClauses.push(`content_type IN (${contentTypeFilter.map((ct) => `'${ct}'`).join(",")})`);
    }
    if (source) whereClauses.push(`source = '${source.replace(/'/g, "''")}'`);

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const rows = await db.execute(sql.raw(`
      SELECT id, slug, content_type, status, approved, title, meta_description, category, tags,
             source, author, domain, published_at, archived_at, created_at, updated_at, updated_by
      FROM seo_publisher_pages
      ${where}
      ORDER BY updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `));
    const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::int AS cnt FROM seo_publisher_pages ${where}`));
    const total = ((countResult as any).rows ?? countResult)[0]?.cnt ?? 0;

    res.json({
      pages: (rows as any).rows ?? rows,
      total,
      limit,
      offset,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}



async function handleGet(req: Request, res: Response, idOrSlug: string, domain?: string): Promise<void> {
  try {
    const page = await findPage(idOrSlug, domain);
    if (!page) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    // Enforce domain allowlist even on read — prevents listing pages from
    // unknown/future domains that slipped into the DB before restrictions.
    if (!enforceAllowedDomain(page.domain, res)) return;
    res.json(page);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

async function handleAuditLog(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);
    const action = req.query.action as string | undefined;
    const actor = req.query.actor as string | undefined;

    let whereClauses: string[] = [];
    if (action) whereClauses.push(`action = '${action.replace(/'/g, "''")}'`);
    if (actor) whereClauses.push(`actor = '${actor.replace(/'/g, "''")}'`);

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const rows = await db.execute(sql.raw(`
      SELECT * FROM seo_audit_log ${where} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}
    `));
    const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::int AS cnt FROM seo_audit_log ${where}`));
    const total = ((countResult as any).rows ?? countResult)[0]?.cnt ?? 0;

    res.json({
      entries: (rows as any).rows ?? rows,
      total,
      limit,
      offset,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
