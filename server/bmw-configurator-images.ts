// First-party Images tab source for the VIN decoder (Task #59).
// Generates image URLs from BMW's public configurator CDN, fetched
// keyed on the model + paint + upholstery + wheel codes resolved by
// the rest of the enrichment pipeline. The actual image bytes are
// downloaded + cached locally by `server/vin-images.ts` (same as the
// existing bimmer.work flow), so this module only resolves URLs and
// (light) URL availability checks.
//
// BMW's configurator exposes a number of host families (the v3 shop
// CDN, the legacy "fastimg" CDN, etc). We deliberately use the
// `cdn.bimmer-tech` style host for stills + 360° frames because that's
// the same endpoint family bimmer.work currently embeds — meaning if
// bimmer.work renders an image for a VIN, BMW's CDN does too.

import { proxyFetch } from "./proxy-router";

export interface BmwConfiguratorImages {
  exteriorUrl: string | null;
  interiorUrl: string | null;
  exterior360Urls: string[];
}

export interface BmwConfiguratorParams {
  modelTypeCode: string | null;   // e.g. "AH5V" — BMW model code
  paintCode: string | null;        // e.g. "475"
  upholsteryCode?: string | null;  // currently informational
  wheelCode?: string | null;
}

// BMW's exterior still endpoint — `{model}/{paint}/exterior.png` is
// the family BMW's own configurator publishes. We default to the
// public BMW Group CDN host (`cdn.bmwgroup.com`) so the orchestrator
// stays first-party out of the box; the `BMW_CONFIGURATOR_HOST` env
// var lets ops swap to a regional bucket without a code change. The
// legacy `cdn.bimmer-tech.net` host is still listed in
// CONFIGURATOR_HOSTS below so existing cached URLs keep working.
const HOST = process.env.BMW_CONFIGURATOR_HOST || "cdn.bmwgroup.com";
const FRAME_COUNT = 18;

export function buildExteriorUrl(p: BmwConfiguratorParams): string | null {
  if (!p.modelTypeCode || !p.paintCode) return null;
  const m = encodeURIComponent(p.modelTypeCode.toUpperCase());
  const c = encodeURIComponent(p.paintCode.toUpperCase());
  return `https://${HOST}/${m}/${c}/exterior.png`;
}

export function buildInteriorUrl(p: BmwConfiguratorParams): string | null {
  if (!p.modelTypeCode || !p.upholsteryCode) return null;
  const m = encodeURIComponent(p.modelTypeCode.toUpperCase());
  const u = encodeURIComponent(p.upholsteryCode.toUpperCase());
  return `https://${HOST}/${m}/${u}/interior.png`;
}

export function buildExterior360Urls(p: BmwConfiguratorParams, frames = FRAME_COUNT): string[] {
  if (!p.modelTypeCode || !p.paintCode) return [];
  const m = encodeURIComponent(p.modelTypeCode.toUpperCase());
  const c = encodeURIComponent(p.paintCode.toUpperCase());
  const urls: string[] = [];
  for (let i = 1; i <= frames; i++) {
    const frame = String(i).padStart(2, "0");
    urls.push(`https://${HOST}/${m}/${c}/360/${frame}.png`);
  }
  return urls;
}

// Lightweight HEAD probe so we can avoid persisting URLs that always 404.
// Routed through bmw_firstparty (primary: direct, backup: evomi_core) so
// first-party BMW CDN traffic is observable and counted in the proxy dashboard.
// Resolves true on any 2xx; resolves false on network error or 4xx/5xx.
async function urlExists(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    await proxyFetch("bmw_firstparty", url, { method: "HEAD", timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// Build the full Images tab payload — performs a small HEAD probe of
// the exterior to decide whether the configurator actually has data
// for these codes. If the probe fails, returns null so the orchestrator
// falls back to bimmer.work.
export async function fetchConfiguratorImages(p: BmwConfiguratorParams): Promise<BmwConfiguratorImages | null> {
  const exterior = buildExteriorUrl(p);
  if (!exterior) return null;
  const ok = await urlExists(exterior);
  if (!ok) {
    console.log(`[Configurator] No image at ${exterior}`);
    return null;
  }
  const interior = buildInteriorUrl(p);
  const interiorOk = interior ? await urlExists(interior) : false;
  return {
    exteriorUrl: exterior,
    interiorUrl: interiorOk ? interior : null,
    exterior360Urls: buildExterior360Urls(p),
  };
}

// Hosts this module produces — exposed for `server/vin-images.ts`
// ALLOWED_HOSTS so the local-cache downloader will accept them.
export const CONFIGURATOR_HOSTS = new Set<string>([
  HOST,
  "cdn.bimmer-tech.net",
  "www.bmwgroup.com",
  "configure.bmw.com",
]);
