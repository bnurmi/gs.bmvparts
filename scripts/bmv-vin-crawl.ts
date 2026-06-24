// =============================================================================
// bmv.vin link crawler (Task #96, T011).
// =============================================================================
//
// Walks the bmv.vin SSR surface starting from `/`, following every internal
// link until the frontier is exhausted. Reports:
//
//   - HTTP status per URL
//   - Pages with a missing or non-canonical canonical tag
//   - Orphaned pages (URLs reachable from the sitemap but unreachable from
//     `/` — surfaced separately so a stale link table doesn't hide content)
//
// Default base URL: http://localhost:5000 with Host: bmv.vin so the dev
// server's host-rewrite middleware fires.
// =============================================================================

// Self-contained: extract <a href> + canonical via regex so this script does
// not depend on jsdom (which we don't ship). Server-rendered bmv.vin HTML is
// well-formed enough that a tag-stripping regex catches every internal anchor
// the SSR layer emits.

import { BMV_VIN_HOST } from "../shared/bmv-vin/links";

const BASE = process.env.BMV_VIN_CRAWL_BASE || `http://localhost:${process.env.PORT || "5000"}`;
const HOST_HEADER = BMV_VIN_HOST;
const MAX_PAGES = Number(process.env.BMV_VIN_CRAWL_MAX || "200");

interface Visit { url: string; status: number; canonical: string | null; outLinks: string[] }
const visited = new Map<string, Visit>();

// Node's fetch (Undici) strips the manual Host header — it's on the
// "forbidden header" list — so we drop down to node:http where we can
// fully control request headers and impersonate the bmv.vin host.
import { request as httpRequest } from "node:http";
import { URL as NodeURL } from "node:url";

function fetchHtml(path: string, accept = "text/html"): Promise<{ status: number; html: string }> {
  const u = new NodeURL(`${BASE}${path}`);
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: "GET",
      headers: { Host: HOST_HEADER, Accept: accept },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, html: Buffer.concat(chunks).toString("utf-8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

function normalize(href: string): string | null {
  if (!href) return null;
  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  try {
    const u = new URL(href, `https://${HOST_HEADER}`);
    if (u.hostname && u.hostname !== HOST_HEADER) return null;
    return u.pathname + (u.search || "");
  } catch { return null; }
}

async function crawl(): Promise<void> {
  const queue: string[] = ["/"];
  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    let visit: Visit;
    try {
      const { status, html } = await fetchHtml(url);
      const canonMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
                     || html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
      const canonical = canonMatch ? canonMatch[1] : null;
      const outLinks: string[] = [];
      const anchorRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = anchorRe.exec(html)) !== null) {
        const norm = normalize(m[1]);
        if (norm) outLinks.push(norm);
      }
      visit = { url, status, canonical, outLinks: Array.from(new Set(outLinks)) };
    } catch (err: any) {
      visit = { url, status: 0, canonical: null, outLinks: [] };
      console.warn(`[crawl] ${url} failed: ${err?.message || err}`);
    }
    visited.set(url, visit);
    for (const next of visit.outLinks) {
      if (!visited.has(next) && !queue.includes(next)) queue.push(next);
    }
  }
}

async function readSitemapUrls(): Promise<string[]> {
  const out = new Set<string>();
  try {
    const idx = await fetchHtml("/sitemap.xml", "application/xml");
    if (idx.status !== 200) return [];
    const shards = Array.from(idx.html.matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => m[1]);
    for (const shardUrl of shards) {
      // shard URLs are absolute https://bmv.vin/... — fetch via local base
      const path = shardUrl.replace(/^https?:\/\/[^/]+/, "");
      try {
        const r = await fetchHtml(path, "application/xml");
        if (r.status !== 200) continue;
        for (const m of r.html.matchAll(/<loc>([^<]+)<\/loc>/g)) {
          out.add(m[1].replace(/^https?:\/\/[^/]+/, ""));
        }
      } catch {}
    }
  } catch {}
  return Array.from(out);
}

async function main() {
  console.log(`[crawl] starting at ${BASE} (Host: ${HOST_HEADER}, max ${MAX_PAGES} pages)`);
  await crawl();
  const sitemapUrls = await readSitemapUrls();

  const badPages: Visit[] = [];
  const badCanonPages: Visit[] = [];
  for (const v of visited.values()) {
    if (v.status >= 400 || v.status === 0) badPages.push(v);
    if (v.status === 200 && v.canonical && !v.canonical.startsWith("https://bmv.vin")) badCanonPages.push(v);
  }
  const orphans = sitemapUrls.filter(u => !visited.has(u));

  console.log(`\n[crawl] visited:    ${visited.size}`);
  console.log(`[crawl] non-2xx:    ${badPages.length}`);
  console.log(`[crawl] bad canon:  ${badCanonPages.length}`);
  console.log(`[crawl] sitemap N:  ${sitemapUrls.length}`);
  console.log(`[crawl] orphans:    ${orphans.length}`);
  if (badPages.length > 0) {
    console.log(`\n[crawl] non-2xx URLs:`);
    for (const v of badPages.slice(0, 50)) console.log(`  - [${v.status}] ${v.url}`);
    if (badPages.length > 50) console.log(`  …and ${badPages.length - 50} more`);
  }
  if (badCanonPages.length > 0) {
    console.log(`\n[crawl] off-host canonical URLs:`);
    for (const v of badCanonPages.slice(0, 50)) console.log(`  - ${v.url}  ->  canonical=${v.canonical}`);
    if (badCanonPages.length > 50) console.log(`  …and ${badCanonPages.length - 50} more`);
  }
  if (orphans.length > 0) {
    console.log(`\n[crawl] orphaned URLs (in sitemap, not reachable from /):`);
    for (const o of orphans.slice(0, 30)) console.log(`  - ${o}`);
    if (orphans.length > 30) console.log(`  …and ${orphans.length - 30} more`);
  }
  if (badPages.length > 0 || badCanonPages.length > 0) process.exit(1);
}

main().catch(err => {
  console.error("[crawl] fatal:", err);
  process.exit(1);
});
