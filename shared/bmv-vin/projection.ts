// =============================================================================
// projectVinForLanding — single per-VIN data projection for the SSR layer
// (Task #96, item 14).
// =============================================================================
//
// Extends the existing `VinLandingData` (server/seo/vin-landing.ts) with the
// extra "rails" the per-VIN landing renders on bmv.vin: same-chassis-other-
// years, same-plant-same-year, similar builds (paint+option overlap), top
// paint callout, top option callouts.
//
// All fields are deterministic — the projection layer queries `vin_cache`
// only (never `user_cars`) and derives everything else with cheap SQL/JS.
// Optional fields are populated by the server-side enricher; SSR templates
// MUST tolerate empty arrays (rails simply hide).
// =============================================================================

import type { VinLandingData } from "../../server/seo/vin-landing";

export interface VinRelatedItem {
  /** 17-char VIN. */
  vin: string;
  /** "2020 BMW M2 Competition" — pre-composed for SSR. */
  label: string;
  /** Optional small thumbnail URL (already proxied / cache-safe). */
  thumbUrl?: string | null;
}

export interface VinTopPaint {
  /** Three-digit BMW paint code, e.g. "475". */
  code: string;
  /** Human label, e.g. "Black Sapphire metallic". */
  label: string;
  /** Total VINs in cache sharing this paint. */
  cohortSize: number;
}

export interface VinTopOption {
  /** SA / option code, e.g. "S2VB". */
  code: string;
  /** Human option label, e.g. "M Sport package". */
  label: string;
  /** Total VINs in cache where this option is set. */
  cohortSize: number;
}

export interface VinForLanding extends VinLandingData {
  /** Same chassis, ±N model years; capped to ~6 for layout. */
  sameChassisOtherYears: VinRelatedItem[];
  /** Same plant + same model year; capped to ~6. */
  samePlantSameYear: VinRelatedItem[];
  /** Similar builds — paint + 2+ shared options; capped to ~6. */
  similarBuilds: VinRelatedItem[];
  /** Headline paint callout (links to /paint/<code>). */
  topPaint: VinTopPaint | null;
  /** Headline option callouts (max 4). */
  topOptions: VinTopOption[];
  /**
   * Provenance human-readable line, pre-composed by the projection layer.
   * Example: "Vehicle facts: bimmer.work · Options: ETK · Images: configurator".
   * SSR renders this verbatim; null when no enrichment provenance is recorded.
   */
  provenanceLine: string | null;
}

/**
 * Empty rails — caller can use as the default starting point and let the
 * enricher fill what it can.
 */
export function emptyRails(): Pick<VinForLanding,
  | "sameChassisOtherYears"
  | "samePlantSameYear"
  | "similarBuilds"
  | "topPaint"
  | "topOptions"
  | "provenanceLine"
> {
  return {
    sameChassisOtherYears: [],
    samePlantSameYear: [],
    similarBuilds: [],
    topPaint: null,
    topOptions: [],
    provenanceLine: null,
  };
}
