// Background-fire-and-persist enrichment used by the per-VIN SSR
// middleware. When a crawler (or user) hits `/vin/:VIN` for a VIN
// we've never decoded, we don't want to 404 — we want to kick off the
// same first-party-first orchestrator that powers
// `/api/vin/bimmerwork/:VIN`, persist the result into `vin_cache`, and
// let the next request render the populated landing page.
//
// This module owns the per-VIN deduplication so simultaneous landing
// hits (e.g. crawler bursts, social previews, share-pings) never
// stack duplicate enrichment jobs.

import { storage } from "../storage";
import { enrichVin } from "../vin-enrichment-service";
import { downloadVinImages } from "../vin-images";
import type {
  BimmerWorkData,
  BimmerWorkOption,
} from "../bimmer-work-scraper";
import type { InsertVinCache } from "@shared/schema";

// Fire-and-forget queue: VIN → in-flight promise. Entries are removed
// when the promise settles so the next miss can retry.
const inFlight = new Map<string, Promise<void>>();

export function isEnrichmentInFlight(vin: string): boolean {
  return inFlight.has(vin.toUpperCase());
}

// Trigger background enrichment for `vin`. Returns the in-flight
// promise so callers can `await` if they want, but the SSR middleware
// fires-and-forgets — it returns the "preparing" page immediately and
// lets the SPA's queue-status poller surface progress.
export function ensureBackgroundEnrichment(vin: string): Promise<void> {
  const cleanVin = vin.toUpperCase();
  const existing = inFlight.get(cleanVin);
  if (existing) return existing;

  const promise = runEnrichment(cleanVin)
    .catch(err => {
      // Errors are intentionally swallowed: the SSR caller has already
      // returned the "preparing" page, and the SPA will retry through
      // the normal /api/vin/bimmerwork path. Log so operators can spot
      // patterns of background failures.
      console.error(`[vin-ssr-bg] enrichment failed for ${cleanVin}: ${err?.message || err}`);
    })
    .finally(() => {
      inFlight.delete(cleanVin);
    });

  inFlight.set(cleanVin, promise);
  return promise;
}

async function runEnrichment(vin: string): Promise<void> {
  // Don't re-enrich VINs that landed in the cache between the SSR
  // miss check and the background task picking up the work — happens
  // when two requests race past `getVinCache()` simultaneously.
  const existing = await storage.getVinCache(vin);
  if (existing && existing.enrichedData) {
    console.log(`[vin-ssr-bg] ${vin} already cached, skipping`);
    return;
  }

  const enriched = await enrichVin(vin);
  if (!enriched) {
    console.log(`[vin-ssr-bg] no source returned data for ${vin}`);
    return;
  }

  // Mirror the image-download pipeline used by /api/vin/bimmerwork/:vin
  // so SSR + on-demand requests share the same `/images/vin/...`
  // storage paths and we never re-download the same asset.
  const data: BimmerWorkData = { ...enriched.data };
  try {
    const optionsForDownload = data.options
      ? data.options.map((o: BimmerWorkOption) => ({ code: o.code, imageUrl: o.imageUrl }))
      : undefined;
    const { images: dlImages, optionImageMap } = await downloadVinImages(
      vin,
      data.images,
      optionsForDownload,
    );
    if (dlImages) data.images = dlImages;
    if (data.options && Object.keys(optionImageMap).length > 0) {
      data.options = data.options.map((o: BimmerWorkOption): BimmerWorkOption => ({
        ...o,
        imageUrl: optionImageMap[o.code] || o.imageUrl,
      }));
    }
  } catch (imgErr: unknown) {
    const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
    console.error(`[vin-ssr-bg] image download failed for ${vin}: ${msg}`);
  }

  // Pick the dominant tab source for the legacy `source` column —
  // matches the convention used by /api/vin/bimmerwork/:vin so cache
  // rows look identical regardless of how they were populated.
  const dominant = enriched.enrichmentSource.vehicle?.source
    || enriched.enrichmentSource.options?.source
    || "bimmerwork";

  // catalogMatches is intentionally null here. The /api/vin/decode
  // endpoint recomputes matches on every call, and the SSR landing
  // page surfaces them only via SPA hydration which calls /decode
  // anyway — so we save one DB-heavy match-pipeline run per VIN.
  // (jsonb columns accept any structurally-compatible object — the
  // `enrichedData` / `enrichmentSource` types are documented in
  // shared/schema.ts and consumed downstream by projectVinCacheRow.)
  const insert: InsertVinCache = {
    vin,
    source: dominant,
    enrichedData: data,
    catalogMatches: null,
    decodedData: null,
    enrichmentSource: enriched.enrichmentSource,
  };
  await storage.upsertVinCache(insert);
  console.log(`[vin-ssr-bg] cached enrichment for ${vin} (sources: ${JSON.stringify(enriched.enrichmentSource)})`);
}
