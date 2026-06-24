// Drift guard for bmv.vin SEO surfaces (Task #96).
// Checks: (a) registry consumers, (b) projection fields, (c) vin_cache
// annotations, (d) hand-written host URLs. Exits 1 on any finding.

import fs from "fs";
import path from "path";
import {
  ALL_REGISTRY_ENTRIES, VIN_LANDING_MODULES, BRAND_DECODER_MODULES, DECODER_HOME_MODULES,
  VIN_CACHE_FIELD_ANNOTATIONS,
} from "../shared/bmv-vin/feature-registry";

interface Finding { kind: "registry" | "projection" | "cache" | "host-url"; message: string }
const findings: Finding[] = [];

function loadFile(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
}

// (a) Registry: render entries need an SSR reference; skip entries need a reason.
function checkRegistry() {
  const ssrSrc =
    loadFile("server/seo/bmv-vin-pages.ts") +
    loadFile("server/seo/vin-landing.ts") +
    loadFile("server/seo/bmv-vin-rails.ts");
  for (const entry of ALL_REGISTRY_ENTRIES) {
    if (entry.vanityHost === "skip") {
      if (!entry.skipReason || entry.skipReason.trim() === "") {
        findings.push({ kind: "registry", message: `skip-without-reason: ${entry.id}` });
      }
      continue;
    }
    const tokens = [entry.id, ...(entry.projectionFields ?? []), ...(entry.cacheFields ?? [])];
    const matched = tokens.some(t => ssrSrc.includes(t));
    if (!matched) {
      findings.push({ kind: "registry", message: `unreferenced-render-entry: ${entry.id} (no SSR reference for id or any field)` });
    }
  }
  // Light sanity: one registry table per surface should be non-empty.
  if (VIN_LANDING_MODULES.length === 0)   findings.push({ kind: "registry", message: "VIN_LANDING_MODULES is empty" });
  if (BRAND_DECODER_MODULES.length === 0) findings.push({ kind: "registry", message: "BRAND_DECODER_MODULES is empty" });
  if (DECODER_HOME_MODULES.length === 0)  findings.push({ kind: "registry", message: "DECODER_HOME_MODULES is empty" });
}

// (b) Projection: each projectionFields name must appear in projection.ts.
function checkProjectionFields() {
  const srcs = [
    loadFile("shared/bmv-vin/projection.ts"),
    loadFile("server/seo/vin-landing.ts"),
  ].join("\n");
  for (const entry of ALL_REGISTRY_ENTRIES) {
    for (const field of entry.projectionFields ?? []) {
      // Dotted paths (e.g. "vehicle.colorCode"): check the head only.
      const head = field.split(".")[0];
      if (!srcs.includes(head)) {
        findings.push({ kind: "projection", message: `unknown-projection-field: ${entry.id} → ${field}` });
      }
    }
  }
}

// (c) vin_cache annotations: bidirectional sanity.
function checkCacheAnnotations() {
  const annotated = new Set(VIN_CACHE_FIELD_ANNOTATIONS.map(a => a.path));
  for (const entry of ALL_REGISTRY_ENTRIES) {
    for (const field of entry.cacheFields ?? []) {
      if (!annotated.has(field)) {
        findings.push({ kind: "cache", message: `module-reads-unannotated-field: ${entry.id} → ${field} (add to VIN_CACHE_FIELD_ANNOTATIONS)` });
      }
    }
  }
  for (const ann of VIN_CACHE_FIELD_ANNOTATIONS) {
    if (ann.vanityHost === "skip") {
      if (!ann.skipReason) findings.push({ kind: "cache", message: `cache-skip-without-reason: ${ann.path}` });
      continue;
    }
    if (!ann.consumedBy || ann.consumedBy.length === 0) {
      findings.push({ kind: "cache", message: `cache-render-without-consumer: ${ann.path}` });
      continue;
    }
    // Every consumer ID must exist in the registry.
    const knownIds = new Set(ALL_REGISTRY_ENTRIES.map(e => e.id));
    for (const c of ann.consumedBy) {
      if (!knownIds.has(c)) findings.push({ kind: "cache", message: `cache-consumer-not-in-registry: ${ann.path} → ${c}` });
    }
  }
}

// (d) Hand-written host URL drift — only allowlisted infra files may
// contain literal `bmv.vin` / `bmv.parts` host strings; all URL builders
// must go through shared/bmv-vin/links.ts.
const HOST_URL_ALLOWLIST: RegExp[] = [
  /^shared\/bmv-vin\/links\.ts$/,
  /^server\/index\.ts$/,                   // host rewrite middleware
  /^server\/seo\/bmv-vin-sitemaps\.ts$/,   // sitemap base URLs
  /^scripts\/drift-guard-bmv-vin\.ts$/,
  /^client\/src\/App\.tsx$/,               // window.location.hostname checks
  /^client\/src\/pages\/VinDecoder\.tsx$/, // window.location.hostname check (same pattern as App.tsx)
  /^client\/src\/components\/SEO\.tsx$/,
  /^client\/src\/components\/admin\/SearchConsolePanel\.tsx$/, // GSC property IDs (sc-domain:bmv.parts / bmv.vin) are data values, not URL builders
  /^tests\//,                              // test fixtures legitimately reference domain names as host values
  /\.md$/i,
  /\.json$/i,
  /\.html$/i,
];
function checkHostUrlDrift() {
  const root = process.cwd();
  const offending: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", "build", ".next", "attached_assets",
             "coverage", ".local", ".vite", ".cache"].includes(entry.name)) continue;
        walk(path.join(dir, entry.name));
        continue;
      }
      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, "/");
      if (HOST_URL_ALLOWLIST.some(rx => rx.test(rel))) continue;
      const text = fs.readFileSync(full, "utf-8");
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\/\/.*bmv\.(vin|parts)/.test(line) || /\*.*bmv\.(vin|parts)/.test(line)) continue;
        if (/(https?:)?\/\/bmv\.(vin|parts)\b/.test(line) ||
            /["'`]bmv\.(vin|parts)["'`]/.test(line)) {
          offending.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }
  walk(root);
  for (const o of offending) {
    findings.push({ kind: "host-url", message: `hardcoded-host-url: ${o} (use shared/bmv-vin/links.ts helper)` });
  }
}

function main() {
  checkRegistry();
  checkProjectionFields();
  checkCacheAnnotations();
  checkHostUrlDrift();
  if (findings.length === 0) {
    console.log(`[drift-guard-bmv-vin] OK — ${ALL_REGISTRY_ENTRIES.length} registry entries, ${VIN_CACHE_FIELD_ANNOTATIONS.length} cache annotations.`);
    return;
  }
  console.error(`[drift-guard-bmv-vin] ${findings.length} finding(s):`);
  for (const f of findings) console.error(`  [${f.kind}] ${f.message}`);
  process.exit(1);
}

main();
