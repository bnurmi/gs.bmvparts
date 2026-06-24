// SSR head + body fragment builders for the four bmv.parts catalog page types:
// /chassis/:code, /series/:slug, /car/:slug, /part/:partNumber
// Follows the same conventions as server/seo/bmv-vin-pages.ts.

import { LOCALE_LIST, getPack, type LocaleCode } from "../../shared/i18n";
import { BMV_PARTS_BASE } from "../../shared/bmv-vin/links";
import type { Car } from "@shared/schema";

const SITE_NAME = "BMV.parts";
const DEFAULT_OG_IMAGE = `${BMV_PARTS_BASE}/favicon.png`;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/<\/(script)/gi, "<\\/$1");
}

function canonicalUrl(path: string): string {
  return `${BMV_PARTS_BASE}${path}`;
}

export interface CatalogSeoBundle {
  status: number;
  headFragment: string;
  rootBody: string;
}

function buildHeadFragment(opts: {
  title: string;
  description: string;
  canonicalPath: string;
  locale: LocaleCode;
  ogType?: string;
  jsonLdNodes: unknown[];
  hreflangPaths: { bcp47: string; path: string }[];
}): string {
  const { title, description, canonicalPath, locale, ogType, jsonLdNodes, hreflangPaths } = opts;
  const canonical = canonicalUrl(canonicalPath);
  const ogLocale = LOCALE_LIST.find(l => l.code === locale)?.bcp47.replace("-", "_") ?? "en_US";
  // x-default always points at the no-prefix (English) canonical URL.
  const enEntry = LOCALE_LIST.find(l => l.code === "en");
  const xDefaultHref = enEntry
    ? canonicalUrl(hreflangPaths.find(p => p.bcp47 === enEntry.bcp47)?.path ?? canonicalPath)
    : canonical;

  const parts: string[] = [];
  parts.push(`<title data-bmv-ssr>${escHtml(title)}</title>`);
  parts.push(`<meta data-bmv-ssr name="description" content="${escHtml(description)}" />`);
  parts.push(`<link data-bmv-ssr rel="canonical" href="${escHtml(canonical)}" />`);

  for (const alt of hreflangPaths) {
    parts.push(`<link data-bmv-ssr rel="alternate" hreflang="${escHtml(alt.bcp47)}" href="${escHtml(canonicalUrl(alt.path))}" />`);
  }
  parts.push(`<link data-bmv-ssr rel="alternate" hreflang="x-default" href="${escHtml(xDefaultHref)}" />`);

  parts.push(`<meta data-bmv-ssr property="og:title" content="${escHtml(title)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:description" content="${escHtml(description)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:type" content="${escHtml(ogType ?? "website")}" />`);
  parts.push(`<meta data-bmv-ssr property="og:url" content="${escHtml(canonical)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:image" content="${escHtml(DEFAULT_OG_IMAGE)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:site_name" content="${escHtml(SITE_NAME)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:locale" content="${escHtml(ogLocale)}" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:card" content="summary_large_image" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:site" content="@bmvparts" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:title" content="${escHtml(title)}" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:description" content="${escHtml(description)}" />`);

  const websiteOrgNode = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        url: `${BMV_PARTS_BASE}/`,
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${BMV_PARTS_BASE}/search?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        name: SITE_NAME,
        url: `${BMV_PARTS_BASE}/`,
        logo: { "@type": "ImageObject", url: `${BMV_PARTS_BASE}/favicon.png` },
        sameAs: [
          "https://twitter.com/bmvparts",
          "https://bmv.vin/",
        ],
      },
    ],
  };
  parts.push(`<script data-bmv-ssr type="application/ld+json">${safeJson(websiteOrgNode)}</script>`);

  for (const node of jsonLdNodes) {
    parts.push(`<script data-bmv-ssr type="application/ld+json">${safeJson(node)}</script>`);
  }

  return parts.join("\n    ");
}

function breadcrumbJsonLd(items: { name: string; url: string }[]): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function yearRange(start: number | null, end: number | null): string {
  if (!start) return "";
  if (!end || end === start) return `${start}+`;
  return `${start}–${end}`;
}

// ============================================================
// Chassis page  /chassis/:code  (and  /:locale/chassis/:code)
// ============================================================

export interface ChassisSsrInput {
  chassisCode: string;
  locale: LocaleCode;
  cars: Car[];
  editorial: string | null;
}

export function buildChassisPageSeo(input: ChassisSsrInput): CatalogSeoBundle {
  const { chassisCode, locale, cars, editorial } = input;
  const chassisUpper = chassisCode.toUpperCase();
  const totalParts = cars.reduce((s, c) => s + (c.totalParts ?? 0), 0);
  const startYears = cars.map(c => c.yearStart).filter((y): y is number => Boolean(y));
  const endYears = cars.map(c => c.yearEnd).filter((y): y is number => Boolean(y));
  const yearStart = startYears.length ? Math.min(...startYears) : null;
  const yearEnd = endYears.length ? Math.max(...endYears) : (startYears.length ? Math.max(...startYears) : null);
  const series = cars[0]?.series ?? null;
  const yr = yearRange(yearStart, yearEnd);

  const pack = getPack(locale);
  const buildIn = {
    label: chassisUpper,
    carCount: cars.length,
    series,
    years: yr,
    totalParts,
    totalPartsFmt: totalParts.toLocaleString(),
    topCategoryNames: [],
    topCategoriesWithCounts: [],
    relatedChassisCodes: [],
  };

  const title = pack.buildHubChassisMetaTitle(buildIn);
  const description = pack.buildHubChassisMetaDescription(buildIn);
  const intro = pack.buildHubChassisIntro(buildIn);

  const localeEntry = LOCALE_LIST.find(l => l.code === locale);
  const localePfx = localeEntry?.prefix ?? "";
  const canonicalPath = localePfx
    ? `/${localePfx}/chassis/${chassisCode.toLowerCase()}`
    : `/chassis/${chassisCode.toLowerCase()}`;

  const hreflangPaths = LOCALE_LIST.map(l => ({
    bcp47: l.bcp47,
    path: l.prefix
      ? `/${l.prefix}/chassis/${chassisCode.toLowerCase()}`
      : `/chassis/${chassisCode.toLowerCase()}`,
  }));

  const seriesSlug = series ? series.toLowerCase().replace(/\s+/g, "-") : null;

  const jsonLdNodes: unknown[] = [
    breadcrumbJsonLd([
      { name: "Home", url: `${BMV_PARTS_BASE}/` },
      { name: "Models", url: `${BMV_PARTS_BASE}/models` },
      ...(series && seriesSlug
        ? [{ name: `BMW ${series}`, url: `${BMV_PARTS_BASE}/series/${seriesSlug}` }]
        : []),
      { name: `BMW ${chassisUpper}`, url: canonicalUrl(canonicalPath) },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `BMW ${chassisUpper} Parts`,
      url: canonicalUrl(canonicalPath),
      description: intro,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${BMV_PARTS_BASE}/` },
      about: { "@type": "Thing", name: `BMW ${chassisUpper} chassis` },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: cars.length,
        itemListElement: cars
          .filter(c => c.slug)
          .slice(0, 50)
          .map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.displayName,
            url: `${BMV_PARTS_BASE}/car/${c.slug}`,
          })),
      },
    },
  ];

  const headFragment = buildHeadFragment({
    title,
    description,
    canonicalPath,
    locale,
    jsonLdNodes,
    hreflangPaths,
  });

  const sortedCars = [...cars].sort((a, b) => {
    const ya = a.yearStart ?? 0;
    const yb = b.yearStart ?? 0;
    if (ya !== yb) return ya - yb;
    return (a.displayName ?? "").localeCompare(b.displayName ?? "");
  });

  const carListItems = sortedCars
    .filter(c => c.slug)
    .slice(0, 100)
    .map(c => {
      const yr2 = yearRange(c.yearStart ?? null, c.yearEnd ?? null);
      return `<li><a href="/car/${escHtml(c.slug!)}">${escHtml(c.displayName)}${yr2 ? ` (${escHtml(yr2)})` : ""}</a></li>`;
    })
    .join("");

  const rootBody = `<main data-bmv-page="chassis" style="max-width:960px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
  <nav aria-label="Breadcrumb" style="font-size:13px;color:#666;margin-bottom:1rem">
    <a href="/">Home</a> ›
    <a href="/models">Models</a>${series && seriesSlug ? ` › <a href="/series/${escHtml(seriesSlug)}">BMW ${escHtml(series)}</a>` : ""} ›
    <span>BMW ${escHtml(chassisUpper)}</span>
  </nav>
  <h1 style="font-size:1.75rem;font-weight:700;margin:0 0 0.5rem">BMW ${escHtml(chassisUpper)} Parts Catalog</h1>
  ${yr ? `<p style="color:#555;margin:0 0 0.75rem;font-size:.9rem">${escHtml(yr)} · ${cars.length} model variant${cars.length === 1 ? "" : "s"} · ${totalParts.toLocaleString()} OEM parts</p>` : ""}
  <p style="margin:0 0 1.5rem;line-height:1.6">${escHtml(editorial ?? intro)}</p>
  ${carListItems ? `<h2 style="font-size:1.1rem;font-weight:600;margin:0 0 .75rem">Models</h2>
  <ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.4rem;list-style:none;padding:0;margin:0">${carListItems}</ul>` : ""}
</main>`;

  return { status: 200, headFragment, rootBody };
}

// ============================================================
// Series page  /series/:slug  (and  /:locale/series/:slug)
// ============================================================

export interface SeriesSsrInput {
  seriesSlug: string;
  seriesName: string;
  locale: LocaleCode;
  cars: Car[];
  editorial: string | null;
}

export function buildSeriesPageSeo(input: SeriesSsrInput): CatalogSeoBundle {
  const { seriesSlug, seriesName, locale, cars, editorial } = input;
  const totalParts = cars.reduce((s, c) => s + (c.totalParts ?? 0), 0);
  const startYears = cars.map(c => c.yearStart).filter((y): y is number => Boolean(y));
  const endYears = cars.map(c => c.yearEnd).filter((y): y is number => Boolean(y));
  const yearStart = startYears.length ? Math.min(...startYears) : null;
  const yearEnd = endYears.length ? Math.max(...endYears) : (startYears.length ? Math.max(...startYears) : null);
  const chassisCodes = Array.from(new Set(cars.map(c => c.chassis).filter((ch): ch is string => Boolean(ch)))).sort();
  const yr = yearRange(yearStart, yearEnd);

  const pack = getPack(locale);
  const buildIn = {
    label: seriesName,
    carCount: cars.length,
    chassisCodes,
    years: yr,
    totalParts,
    totalPartsFmt: totalParts.toLocaleString(),
    topCategoryNames: [],
    topCategoriesWithCounts: [],
  };

  const title = pack.buildHubSeriesMetaTitle(buildIn);
  const description = pack.buildHubSeriesMetaDescription(buildIn);
  const intro = pack.buildHubSeriesIntro(buildIn);

  const localeEntry = LOCALE_LIST.find(l => l.code === locale);
  const localePfx = localeEntry?.prefix ?? "";
  const canonicalPath = localePfx
    ? `/${localePfx}/series/${seriesSlug}`
    : `/series/${seriesSlug}`;

  const hreflangPaths = LOCALE_LIST.map(l => ({
    bcp47: l.bcp47,
    path: l.prefix ? `/${l.prefix}/series/${seriesSlug}` : `/series/${seriesSlug}`,
  }));

  const jsonLdNodes: unknown[] = [
    breadcrumbJsonLd([
      { name: "Home", url: `${BMV_PARTS_BASE}/` },
      { name: "Models", url: `${BMV_PARTS_BASE}/models` },
      { name: `BMW ${seriesName}`, url: canonicalUrl(canonicalPath) },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `BMW ${seriesName} Parts Catalog`,
      url: canonicalUrl(canonicalPath),
      description: intro,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${BMV_PARTS_BASE}/` },
      about: { "@type": "Thing", name: `BMW ${seriesName}` },
      mainEntity: { "@type": "ItemList", numberOfItems: cars.length },
    },
  ];

  if (chassisCodes.length > 0) {
    jsonLdNodes.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `BMW ${seriesName} Chassis Generations`,
      numberOfItems: chassisCodes.length,
      itemListElement: chassisCodes.map((ch, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `BMW ${ch}`,
        url: `${BMV_PARTS_BASE}/chassis/${ch.toLowerCase()}`,
      })),
    });
  }

  const headFragment = buildHeadFragment({
    title,
    description,
    canonicalPath,
    locale,
    jsonLdNodes,
    hreflangPaths,
  });

  // Group cars by chassis for the body
  const byChass = new Map<string, Car[]>();
  for (const car of cars) {
    const ch = car.chassis || "Other";
    if (!byChass.has(ch)) byChass.set(ch, []);
    byChass.get(ch)!.push(car);
  }
  const sections = Array.from(byChass.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ch, chCars]) => {
      const items = chCars
        .filter(c => c.slug)
        .slice(0, 40)
        .map(c => `<li><a href="/car/${escHtml(c.slug!)}">${escHtml(c.displayName)}</a></li>`)
        .join("");
      return `<section style="margin-bottom:1.5rem">
    <h2 style="font-size:1.1rem;font-weight:700;margin:0 0 .5rem">
      <a href="/chassis/${escHtml(ch.toLowerCase())}" style="color:inherit;text-decoration:none">${escHtml(ch.toUpperCase())}</a>
    </h2>
    <ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.4rem;list-style:none;padding:0;margin:0">${items}</ul>
  </section>`;
    })
    .join("");

  const rootBody = `<main data-bmv-page="series" style="max-width:960px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
  <nav aria-label="Breadcrumb" style="font-size:13px;color:#666;margin-bottom:1rem">
    <a href="/">Home</a> › <a href="/models">Models</a> › <span>BMW ${escHtml(seriesName)}</span>
  </nav>
  <h1 style="font-size:1.75rem;font-weight:700;margin:0 0 .5rem">BMW ${escHtml(seriesName)} Parts Catalog</h1>
  <p style="color:#555;margin:0 0 .75rem;font-size:.9rem">${cars.length} models · ${chassisCodes.length} chassis generation${chassisCodes.length === 1 ? "" : "s"} · ${totalParts.toLocaleString()} OEM parts</p>
  <p style="margin:0 0 1.5rem;line-height:1.6">${escHtml(editorial ?? intro)}</p>
  ${sections}
</main>`;

  return { status: 200, headFragment, rootBody };
}

// ============================================================
// Car detail page  /car/:slug  (and  /:locale/car/:slug)
// ============================================================

export interface CarDetailSsrInput {
  car: Car;
  locale: LocaleCode;
}

export function buildCarDetailSeo(input: CarDetailSsrInput): CatalogSeoBundle {
  const { car, locale } = input;
  const pack = getPack(locale);
  const totalParts = car.totalParts ?? 0;
  // Deterministic fallback when displayName is empty (stub rows, import edge cases).
  // Priority: displayName → chassis + modelName → chassis → "BMW Vehicle {id}"
  const safeDisplayName = car.displayName?.trim() ||
    [car.chassis?.toUpperCase(), car.modelName?.trim()].filter(Boolean).join(" ") ||
    (car.chassis ? `BMW ${car.chassis.toUpperCase()}` : `BMW Vehicle ${car.id}`);
  const buildIn = {
    displayName: safeDisplayName,
    chassis: car.chassis || "",
    modelName: car.modelName || safeDisplayName,
    engine: car.engine || "",
    totalParts,
    totalPartsFmt: totalParts.toLocaleString(),
  };

  const title = pack.buildCarMetaTitle(buildIn);
  const description = pack.buildCarMetaDescription(buildIn);
  const yr = yearRange(car.yearStart ?? null, car.yearEnd ?? null);
  const slug = car.slug || String(car.id);
  const seriesSlug = car.series ? car.series.toLowerCase().replace(/\s+/g, "-") : null;

  const localeEntry = LOCALE_LIST.find(l => l.code === locale);
  const localePfx = localeEntry?.prefix ?? "";
  const canonicalPath = localePfx ? `/${localePfx}/car/${slug}` : `/car/${slug}`;

  const hreflangPaths = LOCALE_LIST.map(l => ({
    bcp47: l.bcp47,
    path: l.prefix ? `/${l.prefix}/car/${slug}` : `/car/${slug}`,
  }));

  const breadcrumbItems: { name: string; url: string }[] = [
    { name: "Home", url: `${BMV_PARTS_BASE}/` },
    { name: "Models", url: `${BMV_PARTS_BASE}/models` },
  ];
  if (car.series && seriesSlug) {
    breadcrumbItems.push({ name: `BMW ${car.series}`, url: `${BMV_PARTS_BASE}/series/${seriesSlug}` });
  }
  if (car.chassis) {
    breadcrumbItems.push({ name: car.chassis.toUpperCase(), url: `${BMV_PARTS_BASE}/chassis/${car.chassis.toLowerCase()}` });
  }
  breadcrumbItems.push({ name: safeDisplayName, url: canonicalUrl(canonicalPath) });

  const jsonLdNodes: unknown[] = [
    breadcrumbJsonLd(breadcrumbItems),
    {
      "@context": "https://schema.org",
      "@type": "ItemPage",
      name: safeDisplayName,
      description,
      url: canonicalUrl(canonicalPath),
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${BMV_PARTS_BASE}/` },
      about: {
        "@type": "Car",
        name: safeDisplayName,
        brand: { "@type": "Brand", name: "BMW" },
        ...(car.chassis ? { vehicleConfiguration: car.chassis.toUpperCase() } : {}),
        ...(car.engine ? { engineType: car.engine } : {}),
        ...(car.bodyType ? { bodyType: car.bodyType } : {}),
        ...(car.yearStart ? { modelDate: String(car.yearStart) } : {}),
      },
    },
  ];

  const headFragment = buildHeadFragment({
    title,
    description,
    canonicalPath,
    locale,
    ogType: "product",
    jsonLdNodes,
    hreflangPaths,
  });

  const metaLine = [
    car.chassis ? escHtml(car.chassis.toUpperCase()) : null,
    car.engine ? escHtml(car.engine) : null,
    car.bodyType ? escHtml(car.bodyType) : null,
    yr ? escHtml(yr) : null,
    totalParts ? `${totalParts.toLocaleString()} parts` : null,
  ].filter(Boolean).join(" · ");

  const rootBody = `<main data-bmv-page="car-detail" style="max-width:960px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
  <nav aria-label="Breadcrumb" style="font-size:13px;color:#666;margin-bottom:1rem">
    <a href="/">Home</a>${car.series && seriesSlug ? ` › <a href="/series/${escHtml(seriesSlug)}">BMW ${escHtml(car.series)}</a>` : ""}${car.chassis ? ` › <a href="/chassis/${escHtml(car.chassis.toLowerCase())}">${escHtml(car.chassis.toUpperCase())}</a>` : ""} › <span>${escHtml(safeDisplayName)}</span>
  </nav>
  <h1 style="font-size:1.75rem;font-weight:700;margin:0 0 .5rem">${escHtml(safeDisplayName)}</h1>
  ${metaLine ? `<p style="color:#555;margin:0 0 1rem;font-size:.9rem">${metaLine}</p>` : ""}
  <p style="margin:0 0 1.5rem;line-height:1.6">${escHtml(description)}</p>
  <p style="color:#777;font-size:.9rem">Select a parts category below to browse exploded diagrams, OEM part numbers, weights, and cross-references.</p>
</main>`;

  return { status: 200, headFragment, rootBody };
}

// ============================================================
// Part detail page  /part/:partNumber  (and  /:locale/part/:partNumber)
// ============================================================

export interface PartDetailSsrInput {
  partNumberClean: string;
  description: string;
  additionalInfo: string | null;
  weight: number | null;
  locale: LocaleCode;
  vehicles: {
    carId: number;
    carName: string;
    carSlug: string | null;
    chassis: string;
    engine: string;
    bodyType: string;
    yearStart: number;
    yearEnd: number | null;
    categoryName: string;
    subcategoryName: string;
    quantity: string | null;
  }[];
  seoContent: {
    metaTitle: string;
    metaDescription: string;
    intro: string;
  } | null;
}

export function buildPartDetailSeo(input: PartDetailSsrInput): CatalogSeoBundle {
  const { partNumberClean, description, weight, locale, vehicles, seoContent } = input;

  // Deterministic fallback when description is empty (uncatalogued parts, import stubs).
  const safeDescription = description?.trim() || `BMW OEM Part ${partNumberClean}`;

  const title = seoContent?.metaTitle ?? `BMW Part ${partNumberClean} — ${safeDescription}`;
  const pageDesc = seoContent?.metaDescription ?? `OEM BMW part ${partNumberClean}: ${safeDescription}. Genuine part number, fitment vehicles, and cross-references on BMV.parts.`;
  const intro = seoContent?.intro ?? `Part ${partNumberClean}: ${safeDescription}. Find compatible BMW models, diagrams, and pricing.`;

  const localeEntry = LOCALE_LIST.find(l => l.code === locale);
  const localePfx = localeEntry?.prefix ?? "";
  const canonicalPath = localePfx ? `/${localePfx}/part/${partNumberClean}` : `/part/${partNumberClean}`;

  const hreflangPaths = LOCALE_LIST.map(l => ({
    bcp47: l.bcp47,
    path: l.prefix ? `/${l.prefix}/part/${partNumberClean}` : `/part/${partNumberClean}`,
  }));

  const productNode: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: description,
    description: pageDesc,
    url: canonicalUrl(canonicalPath),
    sku: partNumberClean,
    mpn: partNumberClean,
    brand: { "@type": "Brand", name: "BMW" },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: SITE_NAME, url: `${BMV_PARTS_BASE}/` },
    },
  };
  if (weight) {
    productNode.weight = { "@type": "QuantitativeValue", value: weight, unitCode: "KGM" };
  }

  const jsonLdNodes: unknown[] = [
    breadcrumbJsonLd([
      { name: "Home", url: `${BMV_PARTS_BASE}/` },
      { name: "Parts", url: `${BMV_PARTS_BASE}/search` },
      { name: `Part ${partNumberClean}`, url: canonicalUrl(canonicalPath) },
    ]),
    productNode,
  ];

  const headFragment = buildHeadFragment({
    title,
    description: pageDesc,
    canonicalPath,
    locale,
    ogType: "product",
    jsonLdNodes,
    hreflangPaths,
  });

  // Group fitment by chassis for crawler-readable body
  const chassisMap = new Map<string, { carNames: Set<string>; yearStart: number | null; yearEnd: number | null }>();
  for (const v of vehicles) {
    const ch = (v.chassis || "").toUpperCase() || "Other";
    if (!chassisMap.has(ch)) chassisMap.set(ch, { carNames: new Set(), yearStart: null, yearEnd: null });
    const g = chassisMap.get(ch)!;
    if (v.carName) g.carNames.add(v.carName);
    if (v.yearStart && (g.yearStart === null || v.yearStart < g.yearStart)) g.yearStart = v.yearStart;
    if (v.yearEnd && (g.yearEnd === null || v.yearEnd > g.yearEnd)) g.yearEnd = v.yearEnd;
  }

  const chassisRows = Array.from(chassisMap.entries())
    .slice(0, 30)
    .map(([ch, g]) => {
      const yr2 = yearRange(g.yearStart, g.yearEnd);
      const names = Array.from(g.carNames).slice(0, 6);
      const nameItems = names.map(n => `<li>${escHtml(n)}</li>`).join("");
      return `<li style="border:1px solid #e5e7eb;border-radius:6px;padding:.75rem">
      <strong><a href="/chassis/${escHtml(ch.toLowerCase())}">${escHtml(ch)}</a></strong>${yr2 ? ` <small style="color:#666">(${escHtml(yr2)})</small>` : ""}
      ${nameItems ? `<ul style="margin:.4rem 0 0;padding-left:1.2em;font-size:.85rem;color:#444">${nameItems}</ul>` : ""}
    </li>`;
    })
    .join("");

  const rootBody = `<main data-bmv-page="part-detail" style="max-width:960px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
  <nav aria-label="Breadcrumb" style="font-size:13px;color:#666;margin-bottom:1rem">
    <a href="/">Home</a> › <a href="/search">Parts</a> › <span>${escHtml(partNumberClean)}</span>
  </nav>
  <h1 style="font-size:1.5rem;font-weight:700;margin:0 0 .25rem">${escHtml(safeDescription)}</h1>
  <p style="font-family:monospace;font-size:1rem;color:#333;margin:0 0 1rem">OEM Part No. ${escHtml(partNumberClean)}</p>
  ${weight ? `<p style="font-size:.9rem;color:#555;margin:0 0 .5rem">Weight: ${weight} kg</p>` : ""}
  <p style="margin:0 0 1.5rem;line-height:1.6">${escHtml(intro)}</p>
  ${chassisRows ? `<h2 style="font-size:1.1rem;font-weight:600;margin:0 0 .75rem">Fits BMW Chassis</h2>
  <ul style="list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem">${chassisRows}</ul>` : ""}
</main>`;

  return { status: 200, headFragment, rootBody };
}
