// Server-side SEO + crawlable HTML for /vin/:VIN. Reads vin_cache only —
// user_cars is never exposed here.

import type { VinCache, EnrichmentSourceMap, EnrichmentTabSource } from "@shared/schema";
import { LOCALE_LIST, getPack, type LocaleCode, type VinLandingStrings } from "../../shared/i18n";
import type { VinForLanding } from "../../shared/bmv-vin/projection";
import { bmvVinLinks, partsCatalogLinks, BMV_VIN_BASE, BMV_PARTS_BASE } from "../../shared/bmv-vin/links";
import { getVinHostStrings } from "../../shared/i18n/vin-host";

const SITE_NAME = "BMV.parts";
// Host bases come from the centralised link helper so the drift-guard
// allowlist only needs to cover `shared/bmv-vin/links.ts` itself.
const BASE_URL = BMV_PARTS_BASE;
const VIN_HOST_BASE_URL = BMV_VIN_BASE;
const DEFAULT_OG_IMAGE = `${BASE_URL}/favicon.png`;

// `vinHostMode` flips the SEO output so canonical/alternate/breadcrumb
// URLs point at the bmv.vin vanity domain instead of bmv.parts/vin. The
// SSR middleware enables this when the inbound request came in on the
// bmv.vin host, so search engines see bmv.vin as the canonical home of
// the VIN tool.
export interface VinSeoOptions {
  vinHostMode?: boolean;
}

export interface BwVehicle {
  vin: string;
  codeType: string | null;
  chassis: string | null;
  market: string | null;
  engine: string | null;
  drivetrain: string | null;
  transmission: string | null;
  color: string | null;
  colorCode: string | null;
  upholstery: string | null;
  upholsteryCode: string | null;
  startOfProduction: string | null;
  manufacturer: string | null;
  modelName: string | null;
}

interface BwOption {
  code: string;
  nameEn: string;
  nameDe?: string;
  imageUrl?: string | null;
}

export interface BwImages {
  exteriorUrl: string | null;
  interiorUrl: string | null;
  exterior360Urls: string[];
}

export interface BwManual {
  number: string;
  language: string;
  date: string;
  downloadUrl: string;
}

export interface VinLandingData {
  vin: string;
  vehicle: BwVehicle | null;
  options: BwOption[];
  images: BwImages | null;
  manuals: BwManual[];
  enrichmentSource: EnrichmentSourceMap | null;
  decodedChassis: string | null;
  decodedSeries: string | null;
  decodedModelYear: number | null;
  decodedModelName: string | null;
  decodedEngine: string | null;
  decodedPlantCity: string | null;
  decodedPlantCountry: string | null;
  isBmw: boolean;
}

// Human-readable labels for source provenance badges. Mirrors the
// SOURCE_LABELS map in client/src/pages/VinDecoder.tsx so SSR + SPA
// stay visually consistent. The actual translation lives in each
// locale pack — this fallback is only used when the pack omits the
// source.
function sourceLabel(
  source: EnrichmentTabSource | undefined | null,
  vinLanding: VinLandingStrings,
): string | null {
  if (!source || source === "none") return null;
  return vinLanding.sourceLabel(source);
}

export function projectVinCacheRow(row: VinCache): VinLandingData {
  const enriched = (row.enrichedData ?? null) as null | {
    vehicle?: BwVehicle | null;
    options?: BwOption[] | null;
    images?: Partial<BwImages> | null;
    manuals?: BwManual[] | null;
  };
  const decoded = (row.decodedData ?? null) as null | {
    chassis?: string | null;
    series?: string | null;
    modelYear?: number | null;
    modelName?: string | null;
    engine?: string | null;
    isBmw?: boolean;
    plant?: { city?: string | null; country?: string | null } | null;
  };
  const vehicle = enriched?.vehicle ?? null;
  const options = (enriched?.options ?? []).filter(o => o && typeof o.code === "string");
  const rawImages = enriched?.images ?? null;
  const images: BwImages | null = rawImages
    ? {
        exteriorUrl: rawImages.exteriorUrl ?? null,
        interiorUrl: rawImages.interiorUrl ?? null,
        exterior360Urls: Array.isArray(rawImages.exterior360Urls) ? rawImages.exterior360Urls : [],
      }
    : null;
  const manuals = (enriched?.manuals ?? []).filter(
    m => m && typeof m.downloadUrl === "string" && m.downloadUrl.length > 0,
  );
  const enrichmentSource = (row.enrichmentSource ?? null) as EnrichmentSourceMap | null;
  return {
    vin: row.vin.toUpperCase(),
    vehicle,
    options,
    images,
    manuals,
    enrichmentSource,
    decodedChassis: vehicle?.chassis ?? decoded?.chassis ?? null,
    decodedSeries: decoded?.series ?? null,
    decodedModelYear: decoded?.modelYear ?? null,
    decodedModelName: vehicle?.modelName ?? decoded?.modelName ?? null,
    decodedEngine: vehicle?.engine ?? decoded?.engine ?? null,
    decodedPlantCity: decoded?.plant?.city ?? null,
    decodedPlantCountry: decoded?.plant?.country ?? null,
    isBmw: decoded?.isBmw ?? true,
  };
}

// Build a same-origin URL for any image returned by the enrichment
// pipeline. Already-local cache paths (`/images/vin/...`) pass
// through as-is; remote configurator/bimmer.work URLs get wrapped in
// the existing `/api/vin/proxy-image` route so SSR + SPA share the
// same CORS-safe, host-allowlisted fetch path. Used by both the
// exterior/interior <img> tags and the SPA's 360° viewer.
export function vinImageHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/images/")) return url;
  return `/api/vin/proxy-image?url=${encodeURIComponent(url)}`;
}

export function vinUrlPaths(vin: string): { canonicalPath: string; localePaths: { code: LocaleCode; prefix: string; bcp47: string; path: string }[] } {
  const cleanVin = vin.toUpperCase();
  const canonicalPath = `/vin/${cleanVin}`;
  const localePaths = LOCALE_LIST.map(l => ({
    code: l.code,
    prefix: l.prefix,
    bcp47: l.bcp47,
    path: l.prefix ? `/${l.prefix}/vin/${cleanVin}` : canonicalPath,
  }));
  return { canonicalPath, localePaths };
}

function toOgLocale(locale: string): string {
  if (!locale.includes("-")) {
    const MAP: Record<string, string> = {
      en: "en_US", de: "de_DE", fr: "fr_FR", es: "es_ES",
      it: "it_IT", zh: "zh_CN", ko: "ko_KR", pt: "pt_BR", ru: "ru_RU",
    };
    return MAP[locale] ?? `${locale}_${locale.toUpperCase()}`;
  }
  return locale.replace("-", "_");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/<\/(script)/gi, "<\\/$1");
}

export interface VinSeoBundle {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  h1: string;
  canonicalPath: string;
  alternates: { bcp47: string; href: string }[];
  headFragment: string;
  rootBody: string;
}

function composeModelLabel(d: VinLandingData): string {
  const parts: string[] = [];
  if (d.decodedModelYear) parts.push(String(d.decodedModelYear));
  const name = d.decodedModelName?.trim();
  if (name) {
    parts.push(name.startsWith("BMW") ? name : `BMW ${name}`);
  } else if (d.decodedChassis) {
    parts.push(`BMW ${d.decodedChassis}`);
  } else {
    parts.push("BMW Vehicle");
  }
  if (d.decodedChassis && name && !name.includes(d.decodedChassis)) {
    parts.push(`(${d.decodedChassis})`);
  }
  return parts.join(" ");
}

function composeDescription(d: VinLandingData): string {
  const headline = composeModelLabel(d);
  const fragments: string[] = [`Decoded BMW VIN ${d.vin}`];
  fragments.push(`— ${headline}`);
  const v = d.vehicle;
  const detail: string[] = [];
  if (d.decodedEngine) detail.push(`engine ${d.decodedEngine}`);
  if (v?.color) detail.push(`paint ${v.color}`);
  if (v?.upholstery) detail.push(`upholstery ${v.upholstery}`);
  if (v?.startOfProduction) detail.push(`built ${v.startOfProduction}`);
  if (d.options.length > 0) detail.push(`${d.options.length} factory options`);
  if (detail.length > 0) {
    fragments.push(`(${detail.join(", ")})`);
  }
  fragments.push("— browse OEM parts on BMV.parts.");
  return fragments.join(" ");
}

function buildVehicleJsonLd(d: VinLandingData, canonicalUrl: string) {
  const v = d.vehicle;
  const name = composeModelLabel(d);
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name,
    vehicleIdentificationNumber: d.vin,
    brand: { "@type": "Brand", name: "BMW" },
    manufacturer: { "@type": "Organization", name: v?.manufacturer || "BMW" },
    url: canonicalUrl,
  };
  if (d.decodedModelName) node.model = d.decodedModelName;
  if (d.decodedModelYear) node.vehicleModelDate = String(d.decodedModelYear);
  if (d.decodedChassis) node.vehicleConfiguration = d.decodedChassis;
  if (v?.color) node.color = v.color;
  if (v?.engine) {
    node.vehicleEngine = { "@type": "EngineSpecification", engineType: v.engine };
  }
  if (v?.transmission) node.vehicleTransmission = v.transmission;
  if (v?.startOfProduction) node.productionDate = v.startOfProduction;
  if (d.decodedPlantCity || d.decodedPlantCountry) {
    node.manufacturer = {
      "@type": "Organization",
      name: v?.manufacturer || "BMW",
      address: {
        "@type": "PostalAddress",
        ...(d.decodedPlantCity ? { addressLocality: d.decodedPlantCity } : {}),
        ...(d.decodedPlantCountry ? { addressCountry: d.decodedPlantCountry } : {}),
      },
    };
  }
  if (d.options.length > 0) {
    node.vehicleSpecialUsage = d.options.slice(0, 80).map(o => ({
      "@type": "PropertyValue",
      propertyID: o.code,
      name: o.nameEn || o.code,
    }));
  }
  return node;
}

function buildBreadcrumbJsonLd(
  canonicalUrl: string,
  vin: string,
  vinLanding: VinLandingStrings,
  vinHostMode: boolean,
) {
  // On bmv.vin, the "VIN Decoder" breadcrumb points at the bmv.vin home,
  // and we drop the bmv.parts "Home" crumb (bmv.vin is a single-purpose
  // site — there's no other "home" within it).
  if (vinHostMode) {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: vinLanding.breadcrumbVinDecoder, item: VIN_HOST_BASE_URL + "/" },
        { "@type": "ListItem", position: 2, name: vin, item: canonicalUrl },
      ],
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: vinLanding.breadcrumbHome, item: BASE_URL + "/" },
      { "@type": "ListItem", position: 2, name: vinLanding.breadcrumbVinDecoder, item: BASE_URL + "/vin" },
      { "@type": "ListItem", position: 3, name: vin, item: canonicalUrl },
    ],
  };
}

export function buildVinLandingSeo(
  d: VinLandingData | VinForLanding,
  locale: LocaleCode = "en",
  opts: VinSeoOptions = {},
): VinSeoBundle {
  const vinHostMode = opts.vinHostMode === true;
  // VinForLanding adds rails (sameChassisOtherYears, samePlantSameYear,
  // similarBuilds, topPaint, topOptions, provenanceLine). When the
  // caller passed a base VinLandingData these fields are simply absent
  // and the rail sections render as empty strings.
  const enriched = d as Partial<VinForLanding>;
  const pack = getPack(locale);
  const vinLanding = pack.vinLanding;
  const { canonicalPath: stdCanonicalPath, localePaths: stdLocalePaths } = vinUrlPaths(d.vin);
  // On bmv.vin, the public path is just /<VIN> (no /vin prefix). Locale
  // prefixes are not exposed on the vanity host; one canonical per VIN.
  const baseUrl = vinHostMode ? VIN_HOST_BASE_URL : BASE_URL;
  const canonicalPath = vinHostMode ? `/${d.vin.toUpperCase()}` : stdCanonicalPath;
  const localePaths = vinHostMode
    ? stdLocalePaths.map(p => ({ ...p, path: canonicalPath }))
    : stdLocalePaths;
  const canonicalUrl = `${baseUrl}${canonicalPath}`;
  const headline = composeModelLabel(d);
  const title = `${headline} — VIN ${d.vin} | ${SITE_NAME}`;
  const description = composeDescription(d);
  const keywords = [
    `BMW VIN ${d.vin}`,
    "decoded BMW VIN",
    headline,
    d.decodedChassis ? `BMW ${d.decodedChassis} parts` : null,
    d.decodedModelName ? `${d.decodedModelName} parts` : null,
    "BMW OEM parts",
    "bimmer.work alternative",
  ].filter(Boolean).join(", ");
  const h1 = `${headline} — VIN ${d.vin}`;
  const xDefault = localePaths.find(p => p.bcp47.toLowerCase().startsWith("en"));
  const alternates = localePaths.map(p => ({
    bcp47: p.bcp47,
    href: `${baseUrl}${p.path}`,
  }));

  const vehicleNode = buildVehicleJsonLd(d, canonicalUrl);
  const breadcrumbNode = buildBreadcrumbJsonLd(canonicalUrl, d.vin, vinLanding, vinHostMode);

  const headParts: string[] = [];
  headParts.push(`<title data-bmv-ssr>${escapeHtml(title)}</title>`);
  headParts.push(`<meta data-bmv-ssr name="description" content="${escapeAttr(description)}" />`);
  headParts.push(`<meta data-bmv-ssr name="keywords" content="${escapeAttr(keywords)}" />`);
  headParts.push(`<link data-bmv-ssr rel="canonical" href="${escapeAttr(canonicalUrl)}" />`);
  for (const a of alternates) {
    headParts.push(`<link data-bmv-ssr rel="alternate" hreflang="${escapeAttr(a.bcp47)}" href="${escapeAttr(a.href)}" />`);
  }
  if (xDefault) {
    headParts.push(`<link data-bmv-ssr rel="alternate" hreflang="x-default" href="${escapeAttr(`${baseUrl}${xDefault.path}`)}" />`);
  }
  headParts.push(`<meta data-bmv-ssr property="og:title" content="${escapeAttr(title)}" />`);
  headParts.push(`<meta data-bmv-ssr property="og:description" content="${escapeAttr(description)}" />`);
  headParts.push(`<meta data-bmv-ssr property="og:type" content="website" />`);
  headParts.push(`<meta data-bmv-ssr property="og:url" content="${escapeAttr(canonicalUrl)}" />`);
  headParts.push(`<meta data-bmv-ssr property="og:image" content="${escapeAttr(DEFAULT_OG_IMAGE)}" />`);
  headParts.push(`<meta data-bmv-ssr property="og:site_name" content="${escapeAttr(SITE_NAME)}" />`);
  headParts.push(`<meta data-bmv-ssr property="og:locale" content="${escapeAttr(toOgLocale(locale))}" />`);
  headParts.push(`<meta data-bmv-ssr name="twitter:card" content="summary_large_image" />`);
  headParts.push(`<meta data-bmv-ssr name="twitter:site" content="@bmvparts" />`);
  headParts.push(`<meta data-bmv-ssr name="twitter:title" content="${escapeAttr(title)}" />`);
  headParts.push(`<meta data-bmv-ssr name="twitter:description" content="${escapeAttr(description)}" />`);
  headParts.push(`<script data-bmv-ssr type="application/ld+json">${safeJson(vehicleNode)}</script>`);
  headParts.push(`<script data-bmv-ssr type="application/ld+json">${safeJson(breadcrumbNode)}</script>`);

  const v = d.vehicle;
  const factCells: { label: string; value: string }[] = [];
  factCells.push({ label: vinLanding.factVin, value: d.vin });
  if (d.decodedChassis) factCells.push({ label: vinLanding.factChassis, value: d.decodedChassis });
  if (d.decodedModelYear) factCells.push({ label: vinLanding.factModelYear, value: String(d.decodedModelYear) });
  if (d.decodedEngine) factCells.push({ label: vinLanding.factEngine, value: d.decodedEngine });
  if (v?.drivetrain) factCells.push({ label: vinLanding.factDrivetrain, value: v.drivetrain });
  if (v?.transmission) factCells.push({ label: vinLanding.factTransmission, value: v.transmission });
  if (v?.market) factCells.push({ label: vinLanding.factMarket, value: v.market });
  if (v?.color) factCells.push({ label: vinLanding.factPaint, value: v.color });
  if (v?.upholstery) factCells.push({ label: vinLanding.factUpholstery, value: v.upholstery });
  if (v?.startOfProduction) factCells.push({ label: vinLanding.factBuildDate, value: v.startOfProduction });
  if (d.decodedPlantCity) {
    factCells.push({
      label: vinLanding.factPlant,
      value: [d.decodedPlantCity, d.decodedPlantCountry].filter(Boolean).join(", "),
    });
  }

  const factTableRows = factCells.map(c =>
    `<tr><th scope="row">${escapeHtml(c.label)}</th><td>${escapeHtml(c.value)}</td></tr>`,
  ).join("");

  const optionItems = d.options.slice(0, 200).map(o =>
    `<li><strong>${escapeHtml(o.code)}</strong>${o.nameEn ? ` — ${escapeHtml(o.nameEn)}` : ""}</li>`,
  ).join("");

  // Provenance badge — small inline label with the human-readable
  // source name. Empty string when source is unknown.
  const renderBadge = (tab: keyof EnrichmentSourceMap): string => {
    const info = d.enrichmentSource?.[tab];
    const label = sourceLabel(info?.source ?? null, vinLanding);
    if (!label) return "";
    return `<span data-bmv-ssr-source="${escapeAttr(tab)}" style="display:inline-block;font-size:11px;line-height:1;padding:2px 6px;margin-left:0.5rem;border:1px solid #ccc;border-radius:9999px;color:#555;background:#f7f7f7;vertical-align:middle">${escapeHtml(label)}</span>`;
  };

  // Images section: exterior + interior <img> for crawlers + initial
  // paint, plus a 360° viewer placeholder hydrated by VinDecoder.tsx.
  // The 360° frames themselves aren't rendered in SSR (they'd bloat
  // the HTML) — instead we expose the frame URLs as a JSON island so
  // the Viewer360 component can pick them up immediately on hydration
  // without re-fetching.
  const exteriorHref = d.images ? vinImageHref(d.images.exteriorUrl) : null;
  const interiorHref = d.images ? vinImageHref(d.images.interiorUrl) : null;
  const exterior360Hrefs = (d.images?.exterior360Urls ?? [])
    .map(u => vinImageHref(u))
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  const headlineAlt = headline;
  const imageBits: string[] = [];
  if (exteriorHref || interiorHref || exterior360Hrefs.length > 0) {
    imageBits.push(
      `<h2 style="font-size:1.1rem;font-weight:600;margin:1.5rem 0 0.5rem">${escapeHtml(vinLanding.vehiclePhotos)}${renderBadge("images")}</h2>`,
    );
    const imgGrid: string[] = [];
    if (exteriorHref) {
      imgGrid.push(
        `<figure style="margin:0;flex:1 1 240px;min-width:240px"><img data-bmv-ssr-img="exterior" loading="lazy" src="${escapeAttr(exteriorHref)}" alt="${escapeAttr(vinLanding.exteriorAlt({ headline: headlineAlt, vin: d.vin }))}" style="display:block;width:100%;height:auto;border-radius:6px;border:1px solid #eee" /><figcaption style="font-size:12px;color:#555;margin-top:0.25rem">${escapeHtml(vinLanding.exteriorCaption)}</figcaption></figure>`,
      );
    }
    if (interiorHref) {
      imgGrid.push(
        `<figure style="margin:0;flex:1 1 240px;min-width:240px"><img data-bmv-ssr-img="interior" loading="lazy" src="${escapeAttr(interiorHref)}" alt="${escapeAttr(vinLanding.interiorAlt({ headline: headlineAlt, vin: d.vin }))}" style="display:block;width:100%;height:auto;border-radius:6px;border:1px solid #eee" /><figcaption style="font-size:12px;color:#555;margin-top:0.25rem">${escapeHtml(vinLanding.interiorCaption)}</figcaption></figure>`,
      );
    }
    if (imgGrid.length > 0) {
      imageBits.push(
        `<div style="display:flex;flex-wrap:wrap;gap:0.75rem">${imgGrid.join("")}</div>`,
      );
    }
    if (exterior360Hrefs.length > 0) {
      // <noscript> block makes the first 360 frame visible to crawlers
      // + no-JS users without requiring the SPA to mount. The
      // hydration script island below seeds React Query so Viewer360
      // can render immediately on hydration without a network call.
      const firstFrame = exterior360Hrefs[0];
      imageBits.push(
        `<noscript><figure style="margin:1rem 0 0"><img data-bmv-ssr-img="exterior360" src="${escapeAttr(firstFrame)}" alt="${escapeAttr(vinLanding.viewer360Alt({ headline: headlineAlt, vin: d.vin }))}" style="display:block;width:100%;height:auto;border-radius:6px;border:1px solid #eee" /><figcaption style="font-size:12px;color:#555;margin-top:0.25rem">${escapeHtml(vinLanding.viewer360NoscriptCaption(exterior360Hrefs.length))}</figcaption></figure></noscript>`,
      );
      imageBits.push(
        `<div data-bmv-ssr-viewer360 data-frame-count="${exterior360Hrefs.length}" style="margin-top:0.75rem;font-size:12px;color:#666"><span>${escapeHtml(vinLanding.viewer360HydrationHint(exterior360Hrefs.length))}</span></div>`,
      );
    }
  }
  const imagesHtml = imageBits.join("");

  // Hydration prefetch island: VinDecoder.tsx reads this on mount and
  // seeds React Query's cache for ["/api/vin/bimmerwork", VIN] so the
  // SPA renders the same images / 360 frames / manuals immediately
  // without re-fetching from /api/vin/bimmerwork. We use a JSON
  // <script> block (not inline JS) so the payload can never execute
  // even if escaping ever regressed.
  const prefetchPayload = {
    vin: d.vin,
    found: !!d.vehicle,
    data: d.vehicle
      ? {
          vehicle: d.vehicle,
          options: d.options,
          images: d.images ?? { exteriorUrl: null, interiorUrl: null, exterior360Urls: [] },
          manuals: d.manuals,
        }
      : null,
    enrichmentSource: d.enrichmentSource,
  };
  const prefetchIsland = `<script type="application/json" id="bmv-vin-prefetch" data-vin="${escapeAttr(d.vin)}">${safeJson(prefetchPayload)}</script>`;

  // Manuals section: list each PDF as a real, crawlable <a> with a
  // provenance badge. Limit to 50 entries to keep the HTML payload
  // sane on owner's-manual-heavy chassis.
  let manualsHtml = "";
  if (d.manuals.length > 0) {
    const manualRows = d.manuals.slice(0, 50).map(m => {
      const lang = m.language ? escapeHtml(m.language) : "—";
      const date = m.date ? escapeHtml(m.date) : "—";
      const num = escapeHtml(m.number || "");
      const href = escapeAttr(m.downloadUrl);
      const labelText = m.number ? `${m.number} (${m.language || "—"})` : (m.language || vinLanding.manualHeaderManual);
      return `<tr><td><a href="${href}" rel="nofollow noopener" target="_blank">${escapeHtml(labelText)}</a></td><td>${num}</td><td>${lang}</td><td>${date}</td></tr>`;
    }).join("");
    manualsHtml = [
      `<h2 style="font-size:1.1rem;font-weight:600;margin:1.5rem 0 0.5rem">${escapeHtml(vinLanding.ownersManuals(d.manuals.length))}${renderBadge("manuals")}</h2>`,
      `<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr><th scope="col" style="text-align:left;border-bottom:1px solid #ddd;padding:4px 6px">${escapeHtml(vinLanding.manualHeaderManual)}</th><th scope="col" style="text-align:left;border-bottom:1px solid #ddd;padding:4px 6px">${escapeHtml(vinLanding.manualHeaderNumber)}</th><th scope="col" style="text-align:left;border-bottom:1px solid #ddd;padding:4px 6px">${escapeHtml(vinLanding.manualHeaderLanguage)}</th><th scope="col" style="text-align:left;border-bottom:1px solid #ddd;padding:4px 6px">${escapeHtml(vinLanding.manualHeaderDate)}</th></tr></thead><tbody>${manualRows}</tbody></table>`,
    ].join("");
  }

  // On bmv.vin the parts catalog routes don't exist (the vanity host is
  // VIN-only), so chassis/series deep links must be absolute back into
  // bmv.parts. On bmv.parts they remain same-origin relative URLs. URL
  // construction is delegated to `partsCatalogLinks` so the host split
  // stays in one place (drift-guard enforces no manual /chassis/ or
  // /series/ string concatenation in this file).
  const partsLinkMode: "absolute" | "relative" = vinHostMode ? "absolute" : "relative";
  const chassisHref = d.decodedChassis
    ? partsCatalogLinks.chassisHub(d.decodedChassis, { mode: partsLinkMode })
    : null;
  const seriesHref = d.decodedSeries
    ? partsCatalogLinks.seriesHub(d.decodedSeries.replace(/\s+/g, "-"), { mode: partsLinkMode })
    : null;

  const linkRow: string[] = [];
  if (chassisHref) {
    linkRow.push(`<a href="${escapeAttr(chassisHref)}">${escapeHtml(vinLanding.chassisLink(d.decodedChassis!))}</a>`);
  }
  if (seriesHref) {
    linkRow.push(`<a href="${escapeAttr(seriesHref)}">${escapeHtml(vinLanding.seriesLink(d.decodedSeries!))}</a>`);
  }
  // On the bmv.vin vanity host the decoder home is "/" (not "/vin"), and
  // there is no separate "Home" crumb (bmv.vin IS the decoder).
  const decoderHomeHref = vinHostMode ? "/" : "/vin";
  linkRow.push(`<a href="${escapeAttr(decoderHomeHref)}">${escapeHtml(vinLanding.decodeAnotherLink)}</a>`);

  const breadcrumbHtml = vinHostMode
    ? `<a href="${escapeAttr(decoderHomeHref)}">${escapeHtml(vinLanding.breadcrumbVinDecoder)}</a> &raquo; <span>${escapeHtml(d.vin)}</span>`
    : `<a href="/">${escapeHtml(vinLanding.breadcrumbHome)}</a> &raquo; <a href="${escapeAttr(decoderHomeHref)}">${escapeHtml(vinLanding.breadcrumbVinDecoder)}</a> &raquo; <span>${escapeHtml(d.vin)}</span>`;

  // -------------------------------------------------------------------------
  // BMV.VIN-only rails (Task #96, T006). When `enriched.*` is populated the
  // SSR template renders related-rail sections, top paint/option callouts
  // and the provenance disclosure line. Each block is a no-op when the
  // matching projection field is empty/null so they cost nothing on
  // bmv.parts where the caller passes a plain VinLandingData.
  // -------------------------------------------------------------------------
  const renderRail = (
    heading: string, items: import("../../shared/bmv-vin/projection").VinRelatedItem[],
    railId: string,
  ): string => {
    if (!items || items.length === 0) return "";
    const lis = items.map(it => {
      const href = vinHostMode
        ? bmvVinLinks.vinLanding(it.vin, { mode: "relative" })
        : `/vin/${encodeURIComponent(it.vin.toUpperCase())}`;
      return `<li><a data-testid="link-rail-${escapeAttr(railId)}-${escapeAttr(it.vin)}" href="${escapeAttr(href)}"><code>${escapeHtml(it.vin)}</code></a> — ${escapeHtml(it.label)}</li>`;
    }).join("");
    return `<section data-bmv-rail="${escapeAttr(railId)}"><h2 style="font-size:1.05rem;font-weight:600;margin:1.5rem 0 0.5rem">${escapeHtml(heading)}</h2><ul style="list-style:none;padding:0;margin:0;display:grid;gap:0.25rem">${lis}</ul></section>`;
  };

  const railsHtml = [
    renderRail(vinLanding.railSameChassisHeading ?? "Same chassis, other years",
               enriched.sameChassisOtherYears ?? [], "same-chassis"),
    renderRail(vinLanding.railSamePlantHeading ?? "Same plant + year",
               enriched.samePlantSameYear ?? [], "same-plant"),
    renderRail(vinLanding.railSimilarBuildsHeading ?? "Similar builds",
               enriched.similarBuilds ?? [], "similar-builds"),
  ].filter(Boolean).join("");

  // Top paint callout — links to the bmv.vin paint hub when in vinHostMode,
  // otherwise to bmv.vin absolute URL so bmv.parts viewers can still click.
  let topPaintHtml = "";
  if (enriched.topPaint && enriched.topPaint.cohortSize > 1) {
    const href = vinHostMode
      ? bmvVinLinks.facetHub("paint", enriched.topPaint.code, { mode: "relative" })
      : bmvVinLinks.facetHub("paint", enriched.topPaint.code);
    topPaintHtml = `<p data-bmv-callout="paint" style="margin:1rem 0 0;color:#444"><a data-testid="link-callout-paint" href="${escapeAttr(href)}">${escapeHtml(enriched.topPaint.label)} (${escapeHtml(enriched.topPaint.code)})</a> — ${enriched.topPaint.cohortSize.toLocaleString()} VINs share this paint.</p>`;
  }

  // Top option callouts (max 4) — chip row linking each into the option
  // facet hub. Hides any option whose cohort is 1 (this VIN only).
  let topOptionsHtml = "";
  const topOptions = (enriched.topOptions ?? []).filter(o => o.cohortSize > 1);
  if (topOptions.length > 0) {
    const chips = topOptions.map(o => {
      const href = vinHostMode
        ? bmvVinLinks.facetHub("option", o.code, { mode: "relative" })
        : bmvVinLinks.facetHub("option", o.code);
      return `<a data-testid="link-callout-option-${escapeAttr(o.code)}" href="${escapeAttr(href)}" style="display:inline-block;padding:2px 8px;border:1px solid #ccc;border-radius:9999px;font-size:12px;color:#333;text-decoration:none;margin:2px">${escapeHtml(o.label)} <small style="color:#888">×${o.cohortSize}</small></a>`;
    }).join(" ");
    topOptionsHtml = `<div data-bmv-callout="options" style="margin:0.75rem 0">${chips}</div>`;
  }

  // Provenance line — appended below the catalog intro so it doesn't fight
  // for visual real estate with the existing per-tab badges.
  const provenanceHtml = enriched.provenanceLine
    ? `<p data-bmv-provenance style="margin:0.75rem 0 0;font-size:11px;color:#777">${escapeHtml(enriched.provenanceLine)}</p>`
    : "";

  // -- "What this VIN means" tokenization (registry id: what-this-vin-means)
  // Splits the 17-char VIN into WMI(1-3)/VDS(4-8)/check digit(9)/MY letter(10)/
  // plant(11)/serial(12-17). Each label links to the matching glossary term so
  // crawlers get rich internal links into the glossary corpus on every VIN
  // landing. We only render this section on the bmv.vin vanity host: the
  // bmv.parts catalog version of this page already links into bmv.vin via the
  // catalog CTA, and we don't want to duplicate the block on both hosts.
  let vinTokenHtml = "";
  if (vinHostMode) {
    const v = (d.vin || "").toUpperCase();
    if (v.length === 17) {
      const vinHost = getVinHostStrings(locale);
      const wmi    = v.slice(0, 3);
      const vds    = v.slice(3, 8);
      const check  = v.slice(8, 9);
      const myChar = v.slice(9, 10);
      const plant  = v.slice(10, 11);
      const serial = v.slice(11, 17);
      const plantCity = d.decodedPlantCity ?? null;
      const modelYear = d.decodedModelYear ?? null;

      const tokenLink = (term: string, label: string, hint: string, chars: string, color: string) => {
        const href = bmvVinLinks.glossary(term, { mode: "relative" });
        return `<a data-testid="link-vin-token-${escapeAttr(term)}" href="${escapeAttr(href)}" title="${escapeAttr(hint)}" style="display:inline-flex;flex-direction:column;align-items:center;padding:6px 8px;border:1px solid ${color};border-radius:6px;text-decoration:none;color:#111;background:#fff;min-width:2.25rem"><span style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:1rem;font-weight:600;letter-spacing:0.06em">${escapeHtml(chars)}</span><span style="font-size:10px;color:#555;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(label)}</span></a>`;
      };
      // NOTE: glossary slugs MUST match what server/seo/bmv-vin-seed.ts seeds
      // (see vin-anatomy term-set). Wrong slug = dead link → cuts the per-VIN
      // page out of the glossary internal-link graph and trips the bmv-vin
      // crawl regression. Authoritative slugs: wmi, vds, check-digit,
      // model-year-letter, plant-code, sequence-number.
      const tokens = [
        tokenLink("wmi",              vinHost.vinTokenWmiLabel,      vinHost.vinTokenWmiHint,                   wmi,    "#dde6f6"),
        tokenLink("vds",              vinHost.vinTokenVdsLabel,      vinHost.vinTokenVdsHint,                   vds,    "#dde6f6"),
        tokenLink("check-digit",      vinHost.vinTokenCheckLabel,    vinHost.vinTokenCheckHint,                 check,  "#f5e6c8"),
        tokenLink("model-year-letter",vinHost.vinTokenMyLetterLabel, vinHost.vinTokenMyLetterHint(modelYear),   myChar, "#dceadd"),
        tokenLink("plant-code",       vinHost.vinTokenPlantLabel,    vinHost.vinTokenPlantHint(plantCity),      plant,  "#dceadd"),
        tokenLink("sequence-number",  vinHost.vinTokenSerialLabel,   vinHost.vinTokenSerialHint,                serial, "#eee"),
      ].join("");
      const definedTermJsonLd = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: vinHost.vinTokenHeading,
        itemListElement: [
          { "@type": "ListItem", position: 1, item: { "@type": "DefinedTerm", name: vinHost.vinTokenWmiLabel,      description: vinHost.vinTokenWmiHint,                 url: `${VIN_HOST_BASE_URL}/glossary/wmi` } },
          { "@type": "ListItem", position: 2, item: { "@type": "DefinedTerm", name: vinHost.vinTokenVdsLabel,      description: vinHost.vinTokenVdsHint,                 url: `${VIN_HOST_BASE_URL}/glossary/vds` } },
          { "@type": "ListItem", position: 3, item: { "@type": "DefinedTerm", name: vinHost.vinTokenCheckLabel,    description: vinHost.vinTokenCheckHint,               url: `${VIN_HOST_BASE_URL}/glossary/check-digit` } },
          { "@type": "ListItem", position: 4, item: { "@type": "DefinedTerm", name: vinHost.vinTokenMyLetterLabel, description: vinHost.vinTokenMyLetterHint(modelYear), url: `${VIN_HOST_BASE_URL}/glossary/model-year-letter` } },
          { "@type": "ListItem", position: 5, item: { "@type": "DefinedTerm", name: vinHost.vinTokenPlantLabel,    description: vinHost.vinTokenPlantHint(plantCity),    url: `${VIN_HOST_BASE_URL}/glossary/plant-code` } },
          { "@type": "ListItem", position: 6, item: { "@type": "DefinedTerm", name: vinHost.vinTokenSerialLabel,   description: vinHost.vinTokenSerialHint,              url: `${VIN_HOST_BASE_URL}/glossary/sequence-number` } },
        ],
      };
      headParts.push(`<script type="application/ld+json">${JSON.stringify(definedTermJsonLd)}</script>`);
      vinTokenHtml = [
        `<section data-bmv-vin-tokens aria-label="${escapeAttr(vinHost.vinTokenHeading)}" style="margin:1.5rem 0 0;padding:1rem;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa">`,
        `<h2 style="font-size:1.05rem;font-weight:600;margin:0 0 0.25rem">${escapeHtml(vinHost.vinTokenHeading)}</h2>`,
        `<p style="margin:0 0 0.75rem;color:#555;font-size:12px">${escapeHtml(vinHost.vinTokenIntro)}</p>`,
        `<div style="display:flex;flex-wrap:wrap;gap:6px">${tokens}</div>`,
        `</section>`,
      ].join("");
    }
  }

  const rootBody = [
    `<div data-bmv-ssr id="bmv-ssr-vin" style="font:14px system-ui,sans-serif;max-width:48rem;margin:0 auto;padding:1.5rem;color:#111">`,
    `<nav aria-label="Breadcrumb" style="font-size:12px;color:#555;margin-bottom:1rem">`,
    breadcrumbHtml,
    `</nav>`,
    `<h1 style="font-size:1.5rem;font-weight:700;margin:0 0 0.5rem">${escapeHtml(h1)}</h1>`,
    `<p style="margin:0 0 1.5rem;color:#444">${escapeHtml(description)}</p>`,
    `<h2 style="font-size:1.1rem;font-weight:600;margin:1.5rem 0 0.5rem">${escapeHtml(vinLanding.vehicleSummary)}${renderBadge("vehicle")}</h2>`,
    `<table style="border-collapse:collapse;width:100%"><tbody>${factTableRows}</tbody></table>`,
    imagesHtml,
    optionItems
      ? `<h2 style="font-size:1.1rem;font-weight:600;margin:1.5rem 0 0.5rem">${escapeHtml(vinLanding.factoryOptions(d.options.length))}${renderBadge("options")}</h2><ul style="margin:0;padding-left:1.25rem">${optionItems}</ul>`
      : "",
    manualsHtml,
    topPaintHtml,
    topOptionsHtml,
    railsHtml,
    `<h2 style="font-size:1.1rem;font-weight:600;margin:1.5rem 0 0.5rem">${escapeHtml(vinLanding.bmwOemPartsCatalog)}</h2>`,
    `<p style="margin:0 0 0.5rem">${escapeHtml(vinLanding.catalogIntro)}</p>`,
    `<p>${linkRow.join(" &middot; ")}</p>`,
    provenanceHtml,
    vinTokenHtml,
    prefetchIsland,
    `</div>`,
  ].filter(Boolean).join("");

  return {
    title,
    description,
    keywords,
    canonicalUrl,
    canonicalPath,
    h1,
    alternates,
    headFragment: headParts.join("\n    "),
    rootBody,
  };
}

export interface NoindexBundle {
  title: string;
  description: string;
  headFragment: string;
  rootBody: string;
}

export type NotFoundReason = "invalid" | "not_bmw" | "uncached";

export function buildVinNotFoundSeo(
  vin: string,
  reason: NotFoundReason = "invalid",
  locale: LocaleCode = "en",
  opts: VinSeoOptions = {},
): NoindexBundle {
  const vinHostMode = opts.vinHostMode === true;
  const baseUrl = vinHostMode ? VIN_HOST_BASE_URL : BASE_URL;
  const decoderHomeHref = vinHostMode ? "/" : "/vin";
  const decoderHomeAbs = vinHostMode ? `${VIN_HOST_BASE_URL}/` : `${BASE_URL}/vin`;
  const cleanVin = vin.toUpperCase();
  const pack = getPack(locale);
  const vinLanding = pack.vinLanding;
  const title = vinLanding.notFoundTitle(cleanVin);
  let description: string;
  switch (reason) {
    case "not_bmw":
      description = vinLanding.notFoundReasonNotBmw.replace(/\{vin\}/g, cleanVin);
      break;
    case "uncached":
      description = vinLanding.notFoundReasonUncached.replace(/\{vin\}/g, cleanVin);
      break;
    default:
      description = vinLanding.notFoundReasonInvalid.replace(/\{vin\}/g, cleanVin);
  }
  const headFragment = [
    `<title data-bmv-ssr>${escapeHtml(title)}</title>`,
    `<meta data-bmv-ssr name="description" content="${escapeAttr(description)}" />`,
    `<meta data-bmv-ssr name="robots" content="noindex,nofollow" />`,
    `<link data-bmv-ssr rel="canonical" href="${escapeAttr(decoderHomeAbs)}" />`,
  ].join("\n    ");
  const decodeHref = reason === "uncached"
    ? (vinHostMode ? `/?vin=${encodeURIComponent(cleanVin)}` : `/vin?vin=${encodeURIComponent(cleanVin)}`)
    : decoderHomeHref;
  const decodeLabel = reason === "uncached"
    ? vinLanding.preparingFooterLinkText(cleanVin)
    : vinLanding.decodeAnotherLink;
  const breadcrumbHtml = vinHostMode
    ? `<a href="${escapeAttr(decoderHomeHref)}">${escapeHtml(vinLanding.breadcrumbVinDecoder)}</a> &raquo; <span>${escapeHtml(cleanVin)}</span>`
    : `<a href="/">${escapeHtml(vinLanding.breadcrumbHome)}</a> &raquo; <a href="${escapeAttr(decoderHomeHref)}">${escapeHtml(vinLanding.breadcrumbVinDecoder)}</a> &raquo; <span>${escapeHtml(cleanVin)}</span>`;
  const rootBody = [
    `<div data-bmv-ssr id="bmv-ssr-vin-404" style="font:14px system-ui,sans-serif;max-width:48rem;margin:0 auto;padding:1.5rem;color:#111">`,
    `<nav aria-label="Breadcrumb" style="font-size:12px;color:#555;margin-bottom:1rem">`,
    breadcrumbHtml,
    `</nav>`,
    `<h1 style="font-size:1.5rem;font-weight:700;margin:0 0 0.5rem">${escapeHtml(title.replace(` | ${SITE_NAME}`, ""))}</h1>`,
    `<p style="margin:0 0 1rem;color:#444">${escapeHtml(description)}</p>`,
    `<p><a href="${escapeAttr(decodeHref)}">${escapeHtml(decodeLabel)}</a></p>`,
    `</div>`,
  ].join("");
  void baseUrl;
  return { title, description, headFragment, rootBody };
}

// Background enrichment is in flight for this VIN (or just queued).
// Returns a noindex SSR shell so crawlers don't index the empty
// landing, and clients see a friendly placeholder while the SPA
// hydrates and polls for the real data via the existing
// `/api/vin/bimmerwork/:vin` + `/api/vin/queue-status/:vin` flow.
export function buildVinPreparingSeo(
  vin: string,
  locale: LocaleCode = "en",
  opts: VinSeoOptions = {},
): NoindexBundle {
  const vinHostMode = opts.vinHostMode === true;
  const baseUrl = vinHostMode ? VIN_HOST_BASE_URL : BASE_URL;
  const decoderHomeHref = vinHostMode ? "/" : "/vin";
  const cleanVin = vin.toUpperCase();
  const canonicalAbs = vinHostMode
    ? `${VIN_HOST_BASE_URL}/${cleanVin}`
    : `${BASE_URL}/vin/${cleanVin}`;
  const decodeQueryHref = vinHostMode
    ? `/?vin=${encodeURIComponent(cleanVin)}`
    : `/vin?vin=${encodeURIComponent(cleanVin)}`;
  const pack = getPack(locale);
  const vinLanding = pack.vinLanding;
  const title = vinLanding.preparingTitle(cleanVin);
  const description = vinLanding.preparingMetaDescription(cleanVin);
  const heading = vinLanding.preparingHeading(cleanVin);
  const body = vinLanding.preparingBody;
  const footerLinkText = vinLanding.preparingFooterLinkText(cleanVin);
  const headFragment = [
    `<title data-bmv-ssr>${escapeHtml(title)}</title>`,
    `<meta data-bmv-ssr name="description" content="${escapeAttr(description)}" />`,
    `<meta data-bmv-ssr name="robots" content="noindex,nofollow" />`,
    // Refresh after 10s as a JS-free fallback so crawlers/no-JS
    // visitors see fresh content once enrichment lands. The SPA's
    // queue-status poller takes over instantly when JS is enabled.
    `<meta data-bmv-ssr http-equiv="refresh" content="10" />`,
    `<link data-bmv-ssr rel="canonical" href="${escapeAttr(canonicalAbs)}" />`,
  ].join("\n    ");
  const breadcrumbHtml = vinHostMode
    ? `<a href="${escapeAttr(decoderHomeHref)}">${escapeHtml(vinLanding.breadcrumbVinDecoder)}</a> &raquo; <span>${escapeHtml(cleanVin)}</span>`
    : `<a href="/">${escapeHtml(vinLanding.breadcrumbHome)}</a> &raquo; <a href="${escapeAttr(decoderHomeHref)}">${escapeHtml(vinLanding.breadcrumbVinDecoder)}</a> &raquo; <span>${escapeHtml(cleanVin)}</span>`;
  const rootBody = [
    `<div data-bmv-ssr id="bmv-ssr-vin-preparing" style="font:14px system-ui,sans-serif;max-width:48rem;margin:0 auto;padding:1.5rem;color:#111">`,
    `<nav aria-label="Breadcrumb" style="font-size:12px;color:#555;margin-bottom:1rem">`,
    breadcrumbHtml,
    `</nav>`,
    `<h1 style="font-size:1.5rem;font-weight:700;margin:0 0 0.5rem">${escapeHtml(heading)}</h1>`,
    `<p style="margin:0 0 1rem;color:#444">${escapeHtml(description)}</p>`,
    `<p style="margin:0 0 1rem;color:#444">${escapeHtml(body)}</p>`,
    `<p><a href="${escapeAttr(decodeQueryHref)}">${escapeHtml(footerLinkText)}</a></p>`,
    `</div>`,
  ].join("");
  void baseUrl;
  return { title, description, headFragment, rootBody };
}

// Structural-only VIN check (length + VIN alphabet, no I/O/Q).
export function isStructurallyValidVin(input: string): boolean {
  const v = input.toUpperCase();
  if (v.length !== 17) return false;
  return /^[A-HJ-NPR-Z0-9]+$/.test(v);
}

// ISO 3779 / FMVSS 565 check digit at position 9. Random 17-char strings
// pass this at ~9%; real-world VINs pass at >99.9%. Used to keep
// transcription-error VINs out of SSR landing pages and the sitemap.
// Implementation lives in shared/vin-check-digit.ts (single source of
// truth shared with the runtime decoder in server/vin-decoder.ts).
import { isValidVin as _sharedIsValidVin } from "../../shared/vin-check-digit";
export function hasValidVinCheckDigit(input: string): boolean {
  return _sharedIsValidVin(input);
}

// BMW group WMI allowlist: BMW (WBA/WBS/WBY/WBX), MINI (WMW), BMW Motorrad
// (WBW/WUF), Spartanburg-built BMW SAVs (5UX/5UM/5YM/4US), Rolls-Royce (SBM).
const BMW_WMIS = new Set([
  "WBA", "WBS", "WBY", "WBX", "WMW", "WBW", "WUF",
  "5UX", "5UM", "5YM", "4US", "4USB",
  "SBM",
]);

export function isBmwWmi(input: string): boolean {
  const v = input.toUpperCase();
  if (v.length < 3) return false;
  const wmi3 = v.slice(0, 3);
  const wmi4 = v.slice(0, 4);
  return BMW_WMIS.has(wmi3) || BMW_WMIS.has(wmi4);
}

export function looksLikeBmwVin(input: string): boolean {
  return isStructurallyValidVin(input) && isBmwWmi(input);
}
