// SSR builders for the bmv.vin content surface (Task #96).
// Pure functions: (route, params, db rows, locale) → { title, description,
// headFragment, rootBody, status } injected into the SPA template so crawlers
// see hand-rolled HTML before hydration. Single canonical per URL,
// Accept-Language-driven body translation, JSON-LD per feature-registry entry,
// noindex on thin pages.
//
// Drift-guard manifest — registry "render" entries serviced here (the guard
// scans this comment so it doesn't need a runtime import lookup):
//   decoder-home-intro, decoder-home-input, decoder-home-brand-grid,
//   decoder-home-facet-grid, decoder-home-guides, decoder-home-glossary,
//   decoder-home-faq, decoder-home-recently-decoded, decoder-home-howto,
//   brand-decoder-intro, brand-decoder-input, brand-decoder-wmi-table,
//   brand-decoder-faq, brand-decoder-related,
//   brand-decoder-recently-decoded, brand-decoder-top-chassis.

import type { LocaleCode } from "../../shared/i18n";
import { LOCALE_LIST } from "../../shared/i18n";
import { getVinHostStrings } from "../../shared/i18n/vin-host";
import {
  BMV_VIN_BRANDS, BMV_VIN_FACET_KINDS, BRAND_LABEL, BRAND_WMIS,
  type BmvVinBrand, type BmvVinFacetKind, FACET_KIND_LABEL,
} from "../../shared/bmv-vin/feature-registry";
import { bmvVinLinks, partsCatalogLinks, BMV_VIN_BASE } from "../../shared/bmv-vin/links";
import type {
  BmvVinHomeCopy, BmvVinBrandDecoderCopy, BmvVinFacetBlurb,
  BmvVinGuide, BmvVinGlossary,
} from "@shared/schema";

const SITE_NAME = "BMV.VIN";

export interface VinHostSeoBundle {
  /** HTTP status the middleware should send. */
  status: number;
  title: string;
  description: string;
  canonicalUrl: string;
  /** Full <head> fragment to inject before </head>. */
  headFragment: string;
  /** Body HTML to inject inside <div id="root"> for crawler-visible content. */
  rootBody: string;
  /** Whether the page should be marked noindex (thin content, 404, etc.). */
  noindex: boolean;
}

// --- HTML escaping helpers (mirrored from vin-landing.ts) ---
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const escapeAttr = escapeHtml;
function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/<\/(script)/gi, "<\\/$1");
}

// Pick a localized JSONB field with English fallback. Tables store one
// JSONB per content key like { en: "...", "de-DE": "..." }; we read
// the requested locale, then English, then return empty string.
export function pickLocaleField(value: unknown, locale: LocaleCode): string {
  if (!value || typeof value !== "object") return "";
  const map = value as Record<string, unknown>;
  const v = map[locale] ?? map["en"];
  return typeof v === "string" ? v : "";
}

function pickLocaleArray(value: unknown, locale: LocaleCode): { q: string; a: string }[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<{ q?: unknown; a?: unknown }>).map(item => ({
    q: pickLocaleField(item?.q, locale),
    a: pickLocaleField(item?.a, locale),
  })).filter(x => x.q && x.a);
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

// Compose the shared <head> fragment (canonical + hreflang + OG + meta).
function buildHeadFragment(opts: {
  title: string;
  description: string;
  canonicalUrl: string;
  noindex: boolean;
  jsonLdNodes: unknown[];
  ogImage?: string;
  locale?: string;
}): string {
  const { title, description, canonicalUrl, noindex, jsonLdNodes, ogImage, locale } = opts;
  const parts: string[] = [];
  parts.push(`<title data-bmv-ssr>${escapeHtml(title)}</title>`);
  parts.push(`<meta data-bmv-ssr name="description" content="${escapeAttr(description)}" />`);
  if (noindex) {
    parts.push(`<meta data-bmv-ssr name="robots" content="noindex,follow" />`);
  }
  parts.push(`<link data-bmv-ssr rel="canonical" href="${escapeAttr(canonicalUrl)}" />`);
  // hreflang: same URL for every locale on the vanity host.
  for (const l of LOCALE_LIST) {
    parts.push(`<link data-bmv-ssr rel="alternate" hreflang="${escapeAttr(l.bcp47)}" href="${escapeAttr(canonicalUrl)}" />`);
  }
  parts.push(`<link data-bmv-ssr rel="alternate" hreflang="x-default" href="${escapeAttr(canonicalUrl)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:title" content="${escapeAttr(title)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:description" content="${escapeAttr(description)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:type" content="website" />`);
  parts.push(`<meta data-bmv-ssr property="og:url" content="${escapeAttr(canonicalUrl)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:site_name" content="${escapeAttr(SITE_NAME)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:locale" content="${escapeAttr(toOgLocale(locale ?? "en"))}" />`);
  const resolvedOgImage = ogImage ?? `${BMV_VIN_BASE}/favicon.png`;
  parts.push(`<meta data-bmv-ssr property="og:image" content="${escapeAttr(resolvedOgImage)}" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:card" content="summary_large_image" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:site" content="@bmvparts" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:title" content="${escapeAttr(title)}" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:description" content="${escapeAttr(description)}" />`);

  const websiteOrgNode = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        url: BMV_VIN_BASE + "/",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${BMV_VIN_BASE}/{vin}` },
          "query-input": "required name=vin",
        },
      },
      {
        "@type": "Organization",
        name: SITE_NAME,
        url: BMV_VIN_BASE + "/",
        logo: { "@type": "ImageObject", url: `${BMV_VIN_BASE}/favicon.png` },
        sameAs: [
          "https://twitter.com/bmvparts",
          "https://bmv.parts/",
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

function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((i, idx) => ({
      "@type": "ListItem", position: idx + 1, name: i.name, item: i.url,
    })),
  };
}

function buildFaqJsonLd(faqs: { q: string; a: string }[]) {
  if (faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(f => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function renderFaqHtml(heading: string, faqs: { q: string; a: string }[]): string {
  if (faqs.length === 0) return "";
  const items = faqs.map(f =>
    `<details data-bmv-faq-item><summary><strong>${escapeHtml(f.q)}</strong></summary><p>${escapeHtml(f.a)}</p></details>`
  ).join("");
  return `<section data-bmv-section="faq"><h2>${escapeHtml(heading)}</h2>${items}</section>`;
}

function vinInputForm(strings: ReturnType<typeof getVinHostStrings>): string {
  return `<form data-bmv-vin-form action="/decode" method="get" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end;margin:1rem 0">
    <label style="flex:1 1 240px;min-width:200px"><span style="display:block;font-size:13px;color:#555">${escapeHtml(strings.vinInputLabel)}</span><input data-testid="input-vin" name="vin" maxlength="17" placeholder="${escapeAttr(strings.vinInputPlaceholder)}" pattern="[A-HJ-NPR-Z0-9]{17}" required style="display:block;width:100%;padding:0.5rem;font-family:monospace;font-size:1rem;border:1px solid #ccc;border-radius:6px" /></label>
    <button data-testid="button-decode" type="submit" style="padding:0.6rem 1.2rem;background:#111;color:#fff;border:0;border-radius:6px;font-weight:600">${escapeHtml(strings.vinInputSubmit)}</button>
  </form>`;
}

// =============================================================================
// Decoder home (`/`)
// =============================================================================
/** Recently-decoded strip row: a VIN we successfully decoded plus a short
 *  human label ("BMW · 2019 · G05 · Munich"). Sourced from `vin_cache` —
 *  user_cars is never queried because the vanity host is public-only. */
export interface RecentlyDecodedVin { vin: string; label: string }

export function buildDecoderHomeSeo(
  copy: BmvVinHomeCopy | null,
  locale: LocaleCode,
  brandHubs: { brand: BmvVinBrand; carCount?: number }[] = [],
  guidesTeaser: BmvVinGuide[] = [],
  glossaryTeaser: BmvVinGlossary[] = [],
  recentlyDecoded: RecentlyDecodedVin[] = [],
): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const canonicalUrl = bmvVinLinks.home();
  const title = pickLocaleField(copy?.metaTitle, locale) || strings.homeMetaTitle;
  const description = pickLocaleField(copy?.metaDescription, locale) || strings.homeMetaDescription;
  const heroText = pickLocaleField(copy?.hero, locale);
  const introText = pickLocaleField(copy?.intro, locale) || strings.homeIntro;
  const faqs = pickLocaleArray(copy?.faq, locale);

  // JSON-LD: WebApplication (decoder), WebSite + SearchAction, BreadcrumbList,
  // FAQPage, HowTo (decoder-home-howto), ItemList for the recently-decoded
  // strip (decoder-home-recently-decoded).
  const webAppNode = {
    "@context": "https://schema.org", "@type": "WebApplication",
    name: SITE_NAME, url: canonicalUrl,
    applicationCategory: "AutomotiveApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description,
  };
  const breadcrumbNode = buildBreadcrumbJsonLd([{ name: SITE_NAME, url: canonicalUrl }]);
  const faqNode = buildFaqJsonLd(faqs);
  // HowTo node: rendered from translated defaults in the locale pack so every
  // locale ships something useful. Authored decoder-home HowTo steps live on
  // the `bmv_vin_guide` table (slug=`how-to-decode-bmw-vin`) — not on the
  // `bmv_vin_home_copy` row — so we deliberately do NOT read `copy.howTo`.
  const howToTitle = strings.homeHowToTitle;
  const howToDesc  = strings.homeHowToDescription;
  const howToSteps = strings.homeHowToSteps;
  const howToNode = howToSteps.length > 0 ? {
    "@context": "https://schema.org", "@type": "HowTo",
    name: howToTitle, description: howToDesc, inLanguage: locale, url: canonicalUrl,
    step: howToSteps.map((s, idx) => ({
      "@type": "HowToStep", position: idx + 1, name: s.name, text: s.text,
      url: `${canonicalUrl}#howto-step-${idx + 1}`,
    })),
  } : null;
  const recentItemListNode = recentlyDecoded.length > 0 ? {
    "@context": "https://schema.org", "@type": "ItemList",
    name: strings.homeRecentlyDecodedHeading,
    itemListElement: recentlyDecoded.slice(0, 12).map((r, idx) => ({
      "@type": "ListItem", position: idx + 1,
      url: bmvVinLinks.vinLanding(r.vin),
      name: r.label || r.vin,
    })),
  } : null;
  const jsonLdNodes = [
    webAppNode, breadcrumbNode,
    ...(howToNode ? [howToNode] : []),
    ...(recentItemListNode ? [recentItemListNode] : []),
    ...(faqNode ? [faqNode] : []),
  ];

  const headFragment = buildHeadFragment({ title, description, canonicalUrl, noindex: false, jsonLdNodes, locale });

  // Body: hero + form + brand grid + facet grid + recently decoded + howto + guides + glossary + faq.
  const brandCards = BMV_VIN_BRANDS.map(b =>
    `<li><a data-testid="link-brand-${b}" href="${escapeAttr(bmvVinLinks.brandDecoder(b, { mode: "relative" }))}">${escapeHtml(BRAND_LABEL[b])}</a></li>`,
  ).join("");
  const facetCards = BMV_VIN_FACET_KINDS.map(k =>
    `<li><a data-testid="link-facet-${k}" href="${escapeAttr(bmvVinLinks.facetIndex(k, { mode: "relative" }))}">${escapeHtml(FACET_KIND_LABEL[k])}</a></li>`,
  ).join("");
  const guideCards = guidesTeaser.slice(0, 6).map(g => {
    const t = pickLocaleField(g.title, locale) || g.slug;
    return `<li><a data-testid="link-guide-${escapeAttr(g.slug)}" href="${escapeAttr(bmvVinLinks.guide(g.slug, { mode: "relative" }))}">${escapeHtml(t)}</a></li>`;
  }).join("");
  const glossaryCards = glossaryTeaser.slice(0, 12).map(t => {
    const d = pickLocaleField(t.display, locale) || t.term;
    return `<li><a data-testid="link-glossary-${escapeAttr(t.term)}" href="${escapeAttr(bmvVinLinks.glossary(t.term, { mode: "relative" }))}">${escapeHtml(d)}</a></li>`;
  }).join("");
  const recentItems = recentlyDecoded.slice(0, 12).map(r =>
    `<li><a data-testid="link-recent-vin-${escapeAttr(r.vin)}" href="${escapeAttr(bmvVinLinks.vinLanding(r.vin, { mode: "relative" }))}"><code>${escapeHtml(r.vin)}</code></a> — ${escapeHtml(r.label)}</li>`,
  ).join("");
  const recentSection = recentItems
    ? `<section data-bmv-section="recently-decoded"><h2>${escapeHtml(strings.homeRecentlyDecodedHeading)}</h2><ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.5rem;list-style:none;padding:0">${recentItems}</ul></section>`
    : "";
  const howToSection = howToSteps.length > 0
    ? `<section data-bmv-section="howto"><h2>${escapeHtml(howToTitle)}</h2><p>${escapeHtml(howToDesc)}</p><ol>${howToSteps.map((s, idx) => `<li id="howto-step-${idx + 1}"><strong>${escapeHtml(s.name)}</strong><p>${escapeHtml(s.text)}</p></li>`).join("")}</ol></section>`
    : "";

  const rootBody = `<main data-bmv-page="home" style="max-width:960px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <header><h1 data-testid="text-h1">${escapeHtml(strings.homeH1)}</h1>${heroText ? `<p data-bmv-hero>${escapeHtml(heroText)}</p>` : ""}</header>
    ${vinInputForm(strings)}
    <section data-bmv-section="intro"><p>${escapeHtml(introText)}</p></section>
    <section data-bmv-section="brands"><h2>${escapeHtml(strings.homeBrandsHeading)}</h2><ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.5rem;list-style:none;padding:0">${brandCards}</ul></section>
    <section data-bmv-section="facets"><h2>${escapeHtml(strings.homeFacetsHeading)}</h2><ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.5rem;list-style:none;padding:0">${facetCards}</ul></section>
    ${recentSection}
    ${howToSection}
    ${guideCards ? `<section data-bmv-section="guides"><h2>${escapeHtml(strings.homeGuidesHeading)}</h2><ul>${guideCards}</ul></section>` : ""}
    ${glossaryCards ? `<section data-bmv-section="glossary"><h2>${escapeHtml(strings.homeGlossaryHeading)}</h2><ul>${glossaryCards}</ul></section>` : ""}
    ${renderFaqHtml(strings.faqHeading, faqs)}
  </main>`;

  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex: false };
}

// =============================================================================
// Brand decoder hub (`/decoder/:brand`)
// =============================================================================
export function buildBrandDecoderSeo(
  brand: BmvVinBrand,
  copy: BmvVinBrandDecoderCopy | null,
  locale: LocaleCode,
  recentlyDecoded: RecentlyDecodedVin[] = [],
  topChassis: { value: string; count: number }[] = [],
): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const brandLabel = BRAND_LABEL[brand];
  const canonicalUrl = bmvVinLinks.brandDecoder(brand);
  const title = pickLocaleField(copy?.metaTitle, locale) || strings.brandHubMetaTitle(brandLabel);
  const description = pickLocaleField(copy?.metaDescription, locale) || strings.brandHubMetaDescription(brandLabel);
  const heroText = pickLocaleField(copy?.hero, locale);
  const introText = pickLocaleField(copy?.intro, locale) || strings.brandHubIntro(brandLabel);
  const bodyMd = pickLocaleField(copy?.body, locale);
  const faqs = pickLocaleArray(copy?.faq, locale);
  const wmis = (copy?.wmis ?? []).length > 0 ? (copy!.wmis as string[]) : BRAND_WMIS[brand];

  // WebPage with a SearchAction-style PotentialAction so search engines
  // understand the per-brand decode flow at /decode?vin=... Audience is
  // explicit so brand-tailored treatment is unambiguous.
  const webPageNode = {
    "@context": "https://schema.org", "@type": "WebPage",
    name: strings.brandHubH1(brandLabel),
    headline: strings.brandHubH1(brandLabel),
    description, inLanguage: locale, url: canonicalUrl,
    about: { "@type": "Brand", name: brandLabel },
    audience: { "@type": "Audience", name: `${brandLabel} owners and enthusiasts` },
    publisher: { "@type": "Organization", name: SITE_NAME, url: BMV_VIN_BASE + "/" },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${BMV_VIN_BASE}/decode?vin={vin}` },
      "query-input": "required name=vin",
    },
  };
  // Service node makes the brand decoder intent explicit for crawlers.
  const serviceNode = {
    "@context": "https://schema.org", "@type": "Service",
    name: `${brandLabel} VIN decoder`,
    serviceType: "VIN decoding",
    provider: { "@type": "Organization", name: SITE_NAME, url: BMV_VIN_BASE + "/" },
    areaServed: "Worldwide",
    audience: { "@type": "Audience", name: `${brandLabel} owners and enthusiasts` },
    brand: { "@type": "Brand", name: brandLabel },
    url: canonicalUrl,
  };
  const breadcrumbNode = buildBreadcrumbJsonLd([
    { name: strings.breadcrumbHome, url: BMV_VIN_BASE + "/" },
    { name: brandLabel, url: canonicalUrl },
  ]);
  const faqNode = buildFaqJsonLd(faqs);
  const recentItemListNode = recentlyDecoded.length > 0 ? {
    "@context": "https://schema.org", "@type": "ItemList",
    name: strings.brandRecentlyDecodedHeading(brandLabel),
    itemListElement: recentlyDecoded.slice(0, 12).map((r, idx) => ({
      "@type": "ListItem", position: idx + 1,
      url: bmvVinLinks.vinLanding(r.vin),
      name: r.label || r.vin,
    })),
  } : null;
  const jsonLdNodes = [
    webPageNode, serviceNode, breadcrumbNode,
    ...(recentItemListNode ? [recentItemListNode] : []),
    ...(faqNode ? [faqNode] : []),
  ];
  const headFragment = buildHeadFragment({ title, description, canonicalUrl, noindex: false, jsonLdNodes, locale });

  const wmiRows = wmis.map(w => `<tr><td><code>${escapeHtml(w)}</code></td></tr>`).join("");
  const otherBrands = BMV_VIN_BRANDS.filter(b => b !== brand).map(b =>
    `<li><a data-testid="link-brand-${b}" href="${escapeAttr(bmvVinLinks.brandDecoder(b, { mode: "relative" }))}">${escapeHtml(BRAND_LABEL[b])}</a></li>`,
  ).join("");
  const recentItems = recentlyDecoded.slice(0, 12).map(r =>
    `<li><a data-testid="link-recent-vin-${escapeAttr(r.vin)}" href="${escapeAttr(bmvVinLinks.vinLanding(r.vin, { mode: "relative" }))}"><code>${escapeHtml(r.vin)}</code></a> — ${escapeHtml(r.label)}</li>`,
  ).join("");
  const recentSection = recentItems
    ? `<section data-bmv-section="recently-decoded"><h2>${escapeHtml(strings.brandRecentlyDecodedHeading(brandLabel))}</h2><ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.5rem;list-style:none;padding:0">${recentItems}</ul></section>`
    : "";
  const chassisItems = topChassis.slice(0, 24).map(c =>
    `<li><a data-testid="link-top-chassis-${escapeAttr(c.value)}" href="${escapeAttr(bmvVinLinks.facetHub("chassis", c.value, { mode: "relative" }))}"><code>${escapeHtml(c.value.toUpperCase())}</code></a> <small style="color:#777">(${c.count})</small></li>`,
  ).join("");
  const chassisSection = chassisItems
    ? `<section data-bmv-section="top-chassis"><h2>${escapeHtml(strings.brandTopChassisHeading(brandLabel))}</h2><ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.5rem;list-style:none;padding:0">${chassisItems}</ul></section>`
    : "";

  const rootBody = `<main data-bmv-page="brand-decoder" data-bmv-brand="${escapeAttr(brand)}" style="max-width:880px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <nav data-bmv-breadcrumbs aria-label="Breadcrumb"><a href="/">${escapeHtml(strings.breadcrumbHome)}</a> › <span>${escapeHtml(brandLabel)}</span></nav>
    <header><h1 data-testid="text-h1">${escapeHtml(strings.brandHubH1(brandLabel))}</h1>${heroText ? `<p data-bmv-hero>${escapeHtml(heroText)}</p>` : ""}</header>
    ${vinInputForm(strings)}
    <section data-bmv-section="intro"><p>${escapeHtml(introText)}</p></section>
    ${bodyMd ? `<section data-bmv-section="body">${escapeHtml(bodyMd).replace(/\n\n+/g, "</p><p>").replace(/^/, "<p>").replace(/$/, "</p>")}</section>` : ""}
    <section data-bmv-section="wmi"><h2>${escapeHtml(strings.brandHubWmiHeading)}</h2><table style="border-collapse:collapse"><tbody>${wmiRows}</tbody></table></section>
    ${chassisSection}
    ${recentSection}
    <section data-bmv-section="related"><h2>${escapeHtml(strings.brandHubRelatedHeading)}</h2><ul>${otherBrands}</ul></section>
    ${renderFaqHtml(strings.faqHeading, faqs)}
  </main>`;
  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex: false };
}

// =============================================================================
// Facet hub index (`/chassis`, `/year`, `/plant`, ...)
// =============================================================================
export function buildFacetIndexSeo(
  kind: BmvVinFacetKind,
  values: { value: string; count: number }[],
  locale: LocaleCode,
): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const kindLabel = strings.facetKind[kind === "year" ? "year" : kind];
  const canonicalUrl = bmvVinLinks.facetIndex(kind);
  const title = strings.facetIndexMetaTitle(kindLabel);
  const description = strings.facetIndexMetaDescription(kindLabel);
  const breadcrumbNode = buildBreadcrumbJsonLd([
    { name: strings.breadcrumbHome, url: BMV_VIN_BASE + "/" },
    { name: FACET_KIND_LABEL[kind], url: canonicalUrl },
  ]);
  const itemListNode = {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: values.slice(0, 100).map((v, idx) => ({
      "@type": "ListItem", position: idx + 1,
      url: bmvVinLinks.facetHub(kind, v.value),
      name: `${FACET_KIND_LABEL[kind]}: ${v.value}`,
    })),
  };
  const noindex = values.length === 0;
  const headFragment = buildHeadFragment({ title, description, canonicalUrl, noindex, jsonLdNodes: [breadcrumbNode, itemListNode], locale });

  const valueLinks = values.slice(0, 200).map(v => {
    const href = bmvVinLinks.facetHub(kind, v.value, { mode: "relative" });
    return `<li><a data-testid="link-facet-value-${escapeAttr(v.value)}" href="${escapeAttr(href)}">${escapeHtml(v.value)}</a> <small style="color:#777">(${v.count})</small></li>`;
  }).join("");
  const rootBody = `<main data-bmv-page="facet-index" data-bmv-facet-kind="${escapeAttr(kind)}" style="max-width:880px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <nav data-bmv-breadcrumbs><a href="/">${escapeHtml(strings.breadcrumbHome)}</a> › <span>${escapeHtml(FACET_KIND_LABEL[kind])}</span></nav>
    <header><h1 data-testid="text-h1">${escapeHtml(strings.facetIndexH1(kindLabel))}</h1></header>
    ${values.length === 0 ? `<p>${escapeHtml(strings.facetHubEmpty)}</p>` : `<ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.5rem;list-style:none;padding:0">${valueLinks}</ul>`}
  </main>`;
  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex };
}

// =============================================================================
// Specific facet hub (`/chassis/:code`, `/paint/:code`, ...)
// =============================================================================
/** Min cohort size below which the facet hub is hidden from search engines.
 *  Three is the lowest count that produces a meaningful "examples" rail and
 *  prevents Search Console from flagging us for thin/duplicate content; the
 *  page still renders for users (with a small note explaining the cohort). */
export const FACET_HUB_NOINDEX_COHORT_THRESHOLD = 3;

/** Page size for the per-VIN list shown on a facet hub. Anything above this
 *  triggers `?page=N` pagination + `<link rel="prev"/"next">` so Googlebot
 *  understands the chain instead of treating each page as a duplicate. */
export const FACET_HUB_PAGE_SIZE = 24;

/** Last paginated facet-hub page that stays indexable. Pages 1..N keep their
 *  default `index,follow`; pages > N flip to `noindex,follow` (the canonical
 *  still points at page 1). The cap prevents tail-page duplicate-content
 *  penalties without sacrificing crawlability of the first few real pages. */
export const FACET_HUB_INDEXABLE_PAGE_LIMIT = 5;

/** Hard cap on facet-hub pagination — robots.txt disallows `?page=N` above
 *  this number for facet URLs so Googlebot doesn't waste crawl budget on the
 *  long tail. Below the cap, all `?page=N` URLs remain crawlable. */
export const FACET_HUB_CRAWLABLE_PAGE_LIMIT = 50;

/** Cross-facet related rail: shown next to the per-VIN list so Googlebot
 *  has a path from `/chassis/g05` → "top years for G05", and from
 *  `/year/2019` → "top chassis from 2019", etc. Server-computed. */
export interface FacetCrossRail {
  /** The facet kind being linked to (the *other* axis). */
  kind: BmvVinFacetKind;
  /** Up to ~12 entries — `value` is the URL slug, `label` is what to print. */
  items: { value: string; label: string; count: number }[];
}

// Templated fallback intro when no facet blurb / hub_editorial exists.
// Pure string composition (no AI), so output is stable across requests.
export function deterministicFacetIntro(kind: BmvVinFacetKind, value: string, cohortSize: number): string {
  const cohort = `${cohortSize.toLocaleString("en-US")} decoded BMW Group VIN${cohortSize === 1 ? "" : "s"}`;
  switch (kind) {
    case "chassis":
      return `${cohort} share the BMW chassis code ${value.toUpperCase()}. Browse example VINs from this chassis cohort and shop OEM parts that fit every build.`;
    case "year":
      return `${cohort} from BMW model year ${value}. Each VIN below decodes to its full factory build sheet — chassis, engine, paint, plant and SA option codes.`;
    case "plant":
      return `${cohort} were assembled at the BMW Group ${value} plant. Use the example VINs below to see which chassis families and model years rolled off this line.`;
    case "market":
      return `${cohort} were built for the ${value.toUpperCase()} market. Market codes encode the destination region BMW prepared the car for at the factory.`;
    case "paint":
      return `${cohort} share BMW paint code ${value.toUpperCase()}. Paint codes are stamped on the door-jamb sticker — use the examples below to see which chassis and model years use this finish.`;
    case "option":
      return `${cohort} were built with BMW factory option ${value.toUpperCase()} (Sonderausstattung). SA codes are immutable factory options bound to the build sheet.`;
    default:
      return `${cohort} match this cohort. Browse the example VINs below and shop OEM parts on bmv.parts.`;
  }
}

export function buildFacetHubSeo(
  kind: BmvVinFacetKind,
  value: string,
  blurbRow: BmvVinFacetBlurb | null,
  exampleVins: { vin: string; label: string }[],
  cohortSize: number,
  locale: LocaleCode,
  opts: {
    /** 1-indexed current page (defaults to 1). */
    page?: number;
    /** Total cohort size used for pagination math (defaults to cohortSize). */
    totalForPagination?: number;
    /** Cross-facet rail (e.g. for /chassis/G05 → top years for G05). */
    crossRail?: FacetCrossRail | null;
    /** Locale prefix to use when building cross-host links into bmv.parts. */
    partsLocalePrefix?: string;
    /** Overrides blurbRow.blurb (used for chassis → hub_editorial). */
    editorialIntro?: string | null;
  } = {},
): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const totalCohort = Math.max(cohortSize, opts.totalForPagination ?? cohortSize);
  const totalPages = Math.max(1, Math.ceil(totalCohort / FACET_HUB_PAGE_SIZE));
  // Canonical points at the unpaginated URL on every page (page 2..N
  // canonicalize to page 1) so Google merges signal into the entry page.
  const canonicalUrl = bmvVinLinks.facetHub(kind, value);
  const selfUrl = bmvVinLinks.facetHubPage(kind, value, page);
  // Intro priority: editorialIntro (chassis hub_editorial) > facet blurb > template.
  const blurb =
    (opts.editorialIntro && opts.editorialIntro.trim()) ||
    pickLocaleField(blurbRow?.blurb, locale) ||
    deterministicFacetIntro(kind, value, cohortSize);
  const titleBase = pickLocaleField(blurbRow?.metaTitle, locale) || strings.facetHubMetaTitle({ kind: FACET_KIND_LABEL[kind], value });
  const title = page > 1 ? `${titleBase} — ${strings.facetPaginationLabel({ page, total: totalPages })}` : titleBase;
  const description = pickLocaleField(blurbRow?.metaDescription, locale) || strings.facetHubMetaDescription({ kind: FACET_KIND_LABEL[kind], value, cohort: cohortSize });
  const faqs = pickLocaleArray(blurbRow?.faq, locale);
  const thinCohort = cohortSize < FACET_HUB_NOINDEX_COHORT_THRESHOLD;
  // Noindex if (a) cohort is below the threshold, OR (b) we're past the
  // first 5 pagination pages. Pages 2-5 stay indexable so that genuinely
  // long cohorts can surface deep VINs in search; only deep tail pages
  // (>5) are dropped to avoid duplicate-content penalties.
  const noindex = thinCohort || page > FACET_HUB_INDEXABLE_PAGE_LIMIT;

  const breadcrumbNode = buildBreadcrumbJsonLd([
    { name: strings.breadcrumbHome, url: BMV_VIN_BASE + "/" },
    { name: FACET_KIND_LABEL[kind], url: bmvVinLinks.facetIndex(kind) },
    { name: value, url: canonicalUrl },
  ]);
  const collectionNode = {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: strings.facetHubH1({ kind: FACET_KIND_LABEL[kind], value }),
    url: canonicalUrl, description,
  };
  // Chassis hubs additionally emit a Vehicle model-range node.
  const vehicleNode = kind === "chassis" ? {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: `BMW ${value.toUpperCase()}`,
    brand: { "@type": "Brand", name: "BMW" },
    manufacturer: { "@type": "Organization", name: "BMW Group" },
    url: canonicalUrl,
    description,
  } : null;
  const faqNode = buildFaqJsonLd(faqs);
  const jsonLdNodes = [
    collectionNode,
    ...(vehicleNode ? [vehicleNode] : []),
    breadcrumbNode,
    ...(faqNode ? [faqNode] : []),
  ];

  // Pagination link tags (only emitted when we have more than one page).
  const paginationLinks: string[] = [];
  if (totalPages > 1) {
    if (page > 1) {
      paginationLinks.push(`<link data-bmv-ssr rel="prev" href="${escapeAttr(bmvVinLinks.facetHubPage(kind, value, page - 1))}" />`);
    }
    if (page < totalPages) {
      paginationLinks.push(`<link data-bmv-ssr rel="next" href="${escapeAttr(bmvVinLinks.facetHubPage(kind, value, page + 1))}" />`);
    }
  }
  const baseHead = buildHeadFragment({ title, description, canonicalUrl, noindex, jsonLdNodes, locale });
  const headFragment = paginationLinks.length > 0 ? `${baseHead}\n    ${paginationLinks.join("\n    ")}` : baseHead;

  const exampleHtml = exampleVins.length > 0
    ? `<ul>${exampleVins.slice(0, FACET_HUB_PAGE_SIZE).map(e =>
        `<li><a data-testid="link-vin-${escapeAttr(e.vin)}" href="${escapeAttr(bmvVinLinks.vinLanding(e.vin, { mode: "relative" }))}"><code>${escapeHtml(e.vin)}</code></a> — ${escapeHtml(e.label)}</li>`
      ).join("")}</ul>`
    : `<p>${escapeHtml(strings.facetHubEmpty)}</p>`;

  // Pagination footer: human-readable label + prev/next links. Page 1's
  // "previous" anchor is omitted; same for page N's "next".
  let paginationHtml = "";
  if (totalPages > 1) {
    const prev = page > 1
      ? `<a data-testid="link-facet-prev" rel="prev" href="${escapeAttr(bmvVinLinks.facetHubPage(kind, value, page - 1, { mode: "relative" }))}">${escapeHtml(strings.facetPaginationPrev)}</a>`
      : `<span aria-disabled="true" style="color:#aaa">${escapeHtml(strings.facetPaginationPrev)}</span>`;
    const next = page < totalPages
      ? `<a data-testid="link-facet-next" rel="next" href="${escapeAttr(bmvVinLinks.facetHubPage(kind, value, page + 1, { mode: "relative" }))}">${escapeHtml(strings.facetPaginationNext)}</a>`
      : `<span aria-disabled="true" style="color:#aaa">${escapeHtml(strings.facetPaginationNext)}</span>`;
    paginationHtml = `<nav data-bmv-section="pagination" aria-label="Pagination" style="display:flex;justify-content:space-between;align-items:center;margin:1rem 0">
      ${prev}
      <span data-testid="text-pagination-label">${escapeHtml(strings.facetPaginationLabel({ page, total: totalPages }))}</span>
      ${next}
    </nav>`;
  }

  // Cross-facet rail (e.g. /chassis/G05 → "Browse other years in this group").
  let crossRailHtml = "";
  if (opts.crossRail && opts.crossRail.items.length > 0) {
    const railKind = opts.crossRail.kind;
    const items = opts.crossRail.items.slice(0, 12).map(it =>
      `<li><a data-testid="link-cross-rail-${escapeAttr(railKind)}-${escapeAttr(it.value)}" href="${escapeAttr(bmvVinLinks.facetHub(railKind, it.value, { mode: "relative" }))}">${escapeHtml(it.label)}</a> <small style="color:#777">(${it.count})</small></li>`,
    ).join("");
    crossRailHtml = `<section data-bmv-section="cross-rail" data-bmv-cross-rail-kind="${escapeAttr(railKind)}"><h2>${escapeHtml(strings.facetCrossRailHeading(FACET_KIND_LABEL[railKind]))}</h2><ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.5rem;list-style:none;padding:0">${items}</ul></section>`;
  }

  // Catalog cross-link for chassis: link to bmv.parts/<locale>/chassis/<code>.
  let catalogCta = "";
  if (kind === "chassis") {
    const partsHref = partsCatalogLinks.chassisHub(value, { localePrefix: opts.partsLocalePrefix });
    catalogCta = `<p><a data-testid="link-shop-parts" href="${escapeAttr(partsHref)}">${escapeHtml(strings.shopOemPartsCta)}</a></p>`;
  }

  const thinCohortNote = thinCohort
    ? `<p data-bmv-thin-cohort style="font-size:13px;color:#777;font-style:italic">${escapeHtml(strings.facetThinCohortNote(cohortSize))}</p>`
    : "";

  const rootBody = `<main data-bmv-page="facet-hub" data-bmv-facet-kind="${escapeAttr(kind)}" data-bmv-facet-value="${escapeAttr(value)}" data-bmv-page-num="${page}" style="max-width:880px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <nav data-bmv-breadcrumbs><a href="/">${escapeHtml(strings.breadcrumbHome)}</a> › <a href="${escapeAttr(bmvVinLinks.facetIndex(kind, { mode: "relative" }))}">${escapeHtml(FACET_KIND_LABEL[kind])}</a> › <span>${escapeHtml(value)}</span></nav>
    <header><h1 data-testid="text-h1">${escapeHtml(strings.facetHubH1({ kind: FACET_KIND_LABEL[kind], value }))}</h1></header>
    ${thinCohortNote}
    ${blurb ? `<section data-bmv-section="blurb"><p>${escapeHtml(blurb)}</p></section>` : ""}
    <section data-bmv-section="examples"><h2>${escapeHtml(strings.facetHubExamplesHeading(exampleVins.length))}</h2>${exampleHtml}</section>
    ${paginationHtml}
    ${crossRailHtml}
    ${catalogCta}
    ${renderFaqHtml(strings.faqHeading, faqs)}
  </main>`;
  // Suppress unused-var lint for selfUrl (we kept it readable for future use).
  void selfUrl;
  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex };
}

// =============================================================================
// Guide library
// =============================================================================
export function buildGuideIndexSeo(guides: BmvVinGuide[], locale: LocaleCode): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const canonicalUrl = bmvVinLinks.guideIndex();
  const title = strings.guideIndexMetaTitle;
  const description = strings.guideIndexMetaDescription;
  const breadcrumbNode = buildBreadcrumbJsonLd([
    { name: strings.breadcrumbHome, url: BMV_VIN_BASE + "/" },
    { name: "Guides", url: canonicalUrl },
  ]);
  const itemListNode = {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: guides.slice(0, 100).map((g, idx) => ({
      "@type": "ListItem", position: idx + 1,
      url: bmvVinLinks.guide(g.slug),
      name: pickLocaleField(g.title, locale) || g.slug,
    })),
  };
  const headFragment = buildHeadFragment({ title, description, canonicalUrl, noindex: guides.length === 0, jsonLdNodes: [breadcrumbNode, itemListNode], locale });
  const items = guides.map(g => {
    const t = pickLocaleField(g.title, locale) || g.slug;
    const s = pickLocaleField(g.summary, locale);
    return `<li><a data-testid="link-guide-${escapeAttr(g.slug)}" href="${escapeAttr(bmvVinLinks.guide(g.slug, { mode: "relative" }))}"><strong>${escapeHtml(t)}</strong></a>${s ? `<br/><small>${escapeHtml(s)}</small>` : ""}</li>`;
  }).join("");
  const rootBody = `<main data-bmv-page="guide-index" style="max-width:760px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <nav data-bmv-breadcrumbs><a href="/">${escapeHtml(strings.breadcrumbHome)}</a> › <span>Guides</span></nav>
    <header><h1 data-testid="text-h1">${escapeHtml(strings.guideIndexH1)}</h1></header>
    <ul>${items}</ul>
  </main>`;
  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex: guides.length === 0 };
}

export function buildGuideDetailSeo(guide: BmvVinGuide, related: BmvVinGuide[], locale: LocaleCode): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const canonicalUrl = bmvVinLinks.guide(guide.slug);
  const t = pickLocaleField(guide.title, locale) || guide.slug;
  const summary = pickLocaleField(guide.summary, locale);
  const body = pickLocaleField(guide.body, locale);
  const faqs = pickLocaleArray(guide.faq, locale);
  const title = pickLocaleField(guide.metaTitle, locale) || strings.guideMetaTitle(t);
  const description = pickLocaleField(guide.metaDescription, locale) || summary || strings.guideMetaTitle(t);

  const breadcrumbNode = buildBreadcrumbJsonLd([
    { name: strings.breadcrumbHome, url: BMV_VIN_BASE + "/" },
    { name: "Guides", url: bmvVinLinks.guideIndex() },
    { name: t, url: canonicalUrl },
  ]);
  // `guide.steps` is a jsonb column — drizzle-zod gives us `unknown`, so we
  // narrow to the documented per-step shape ({ name, text } where each leaf
  // is the standard `{ en: ..., "de-DE": ..., ... }` LocaleField object).
  interface GuideStep { name?: unknown; text?: unknown }
  const guideSteps: GuideStep[] = Array.isArray(guide.steps) ? (guide.steps as GuideStep[]) : [];
  const isHowTo = guide.schemaType === "HowTo" && guideSteps.length > 0;
  const articleNode: Record<string, unknown> = isHowTo
    ? {
        "@context": "https://schema.org", "@type": "HowTo", name: t,
        description: summary || description, inLanguage: locale, url: canonicalUrl,
        step: guideSteps.map((s, idx) => ({
          "@type": "HowToStep", position: idx + 1,
          name: pickLocaleField(s?.name, locale),
          text: pickLocaleField(s?.text, locale),
        })),
      }
    : {
        "@context": "https://schema.org", "@type": "Article", headline: t,
        description: summary || description, inLanguage: locale, url: canonicalUrl,
        datePublished: guide.publishedAt instanceof Date ? guide.publishedAt.toISOString() : guide.publishedAt,
        dateModified: guide.updatedAt instanceof Date ? guide.updatedAt.toISOString() : guide.updatedAt,
        publisher: { "@type": "Organization", name: SITE_NAME, url: BMV_VIN_BASE + "/" },
      };
  const faqNode = buildFaqJsonLd(faqs);
  const headFragment = buildHeadFragment({ title, description, canonicalUrl, noindex: false, jsonLdNodes: [articleNode, breadcrumbNode, ...(faqNode ? [faqNode] : [])], locale });

  const stepsHtml = isHowTo
    ? `<ol>${guideSteps.map(s => `<li><strong>${escapeHtml(pickLocaleField(s?.name, locale))}</strong><p>${escapeHtml(pickLocaleField(s?.text, locale))}</p></li>`).join("")}</ol>`
    : "";
  const bodyHtml = body
    ? `<section data-bmv-section="body">${escapeHtml(body).replace(/\n\n+/g, "</p><p>").replace(/^/, "<p>").replace(/$/, "</p>")}</section>`
    : "";
  const relatedHtml = related.length > 0
    ? `<section data-bmv-section="related"><h2>${escapeHtml(strings.guideRelatedHeading)}</h2><ul>${related.slice(0, 6).map(r => `<li><a href="${escapeAttr(bmvVinLinks.guide(r.slug, { mode: "relative" }))}">${escapeHtml(pickLocaleField(r.title, locale) || r.slug)}</a></li>`).join("")}</ul></section>`
    : "";

  const rootBody = `<main data-bmv-page="guide" data-bmv-guide="${escapeAttr(guide.slug)}" style="max-width:760px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <nav data-bmv-breadcrumbs><a href="/">${escapeHtml(strings.breadcrumbHome)}</a> › <a href="${escapeAttr(bmvVinLinks.guideIndex({ mode: "relative" }))}">Guides</a> › <span>${escapeHtml(t)}</span></nav>
    <article><h1 data-testid="text-h1">${escapeHtml(t)}</h1>${summary ? `<p data-bmv-summary><em>${escapeHtml(summary)}</em></p>` : ""}${bodyHtml}${stepsHtml}</article>
    ${relatedHtml}
    ${renderFaqHtml(strings.faqHeading, faqs)}
  </main>`;
  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex: false };
}

// =============================================================================
// Glossary
// =============================================================================
export function buildGlossaryIndexSeo(terms: BmvVinGlossary[], locale: LocaleCode): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const canonicalUrl = bmvVinLinks.glossaryIndex();
  const title = strings.glossaryIndexMetaTitle;
  const description = strings.glossaryIndexMetaDescription;
  const breadcrumbNode = buildBreadcrumbJsonLd([
    { name: strings.breadcrumbHome, url: BMV_VIN_BASE + "/" },
    { name: "Glossary", url: canonicalUrl },
  ]);
  const definedTermSetNode = {
    "@context": "https://schema.org", "@type": "DefinedTermSet",
    name: "BMW VIN glossary", url: canonicalUrl,
    hasDefinedTerm: terms.slice(0, 200).map(t => ({
      "@type": "DefinedTerm",
      name: pickLocaleField(t.display, locale) || t.term,
      url: bmvVinLinks.glossary(t.term),
      description: pickLocaleField(t.definition, locale),
    })),
  };
  const headFragment = buildHeadFragment({ title, description, canonicalUrl, noindex: terms.length === 0, jsonLdNodes: [breadcrumbNode, definedTermSetNode], locale });
  const grouped = new Map<string, BmvVinGlossary[]>();
  for (const t of terms) {
    const key = t.termSet || "general";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }
  const sections = Array.from(grouped.entries()).map(([set, list]) =>
    `<section><h2>${escapeHtml(set)}</h2><ul>${list.map(t => {
      const d = pickLocaleField(t.display, locale) || t.term;
      const def = pickLocaleField(t.definition, locale);
      return `<li><a data-testid="link-glossary-${escapeAttr(t.term)}" href="${escapeAttr(bmvVinLinks.glossary(t.term, { mode: "relative" }))}"><strong>${escapeHtml(d)}</strong></a>${def ? ` — ${escapeHtml(def)}` : ""}</li>`;
    }).join("")}</ul></section>`,
  ).join("");
  const rootBody = `<main data-bmv-page="glossary-index" style="max-width:760px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <nav data-bmv-breadcrumbs><a href="/">${escapeHtml(strings.breadcrumbHome)}</a> › <span>Glossary</span></nav>
    <header><h1 data-testid="text-h1">${escapeHtml(strings.glossaryIndexH1)}</h1></header>
    ${sections}
  </main>`;
  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex: terms.length === 0 };
}

export function buildGlossaryTermSeo(term: BmvVinGlossary, related: BmvVinGlossary[], locale: LocaleCode): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const canonicalUrl = bmvVinLinks.glossary(term.term);
  const display = pickLocaleField(term.display, locale) || term.term;
  const definition = pickLocaleField(term.definition, locale);
  const longForm = pickLocaleField(term.longForm, locale);
  const title = pickLocaleField(term.metaTitle, locale) || strings.glossaryMetaTitle(display);
  const description = pickLocaleField(term.metaDescription, locale) || definition || strings.glossaryMetaTitle(display);
  const breadcrumbNode = buildBreadcrumbJsonLd([
    { name: strings.breadcrumbHome, url: BMV_VIN_BASE + "/" },
    { name: "Glossary", url: bmvVinLinks.glossaryIndex() },
    { name: display, url: canonicalUrl },
  ]);
  const definedTermNode = {
    "@context": "https://schema.org", "@type": "DefinedTerm",
    name: display, description: definition, url: canonicalUrl,
    inDefinedTermSet: bmvVinLinks.glossaryIndex(),
  };
  const headFragment = buildHeadFragment({ title, description, canonicalUrl, noindex: !definition, jsonLdNodes: [definedTermNode, breadcrumbNode], locale });
  const relatedHtml = related.length > 0
    ? `<section data-bmv-section="related"><h2>${escapeHtml(strings.glossaryRelatedHeading)}</h2><ul>${related.slice(0, 8).map(r => `<li><a href="${escapeAttr(bmvVinLinks.glossary(r.term, { mode: "relative" }))}">${escapeHtml(pickLocaleField(r.display, locale) || r.term)}</a></li>`).join("")}</ul></section>`
    : "";
  const rootBody = `<main data-bmv-page="glossary-term" data-bmv-term="${escapeAttr(term.term)}" style="max-width:680px;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <nav data-bmv-breadcrumbs><a href="/">${escapeHtml(strings.breadcrumbHome)}</a> › <a href="${escapeAttr(bmvVinLinks.glossaryIndex({ mode: "relative" }))}">Glossary</a> › <span>${escapeHtml(display)}</span></nav>
    <article><h1 data-testid="text-h1">${escapeHtml(display)}</h1>${definition ? `<p><strong>${escapeHtml(definition)}</strong></p>` : ""}${longForm ? `<p>${escapeHtml(longForm)}</p>` : ""}</article>
    ${relatedHtml}
  </main>`;
  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex: !definition };
}

// =============================================================================
// Lookup landing pages — seven high-intent SEO entry points for BMW owners.
// Slugs: bmw-build-sheet-lookup, bmw-paint-code-lookup,
//        bmw-production-date-lookup, bmw-engine-code-lookup,
//        bmw-options-lookup, bmw-plant-code-lookup, bmw-model-year-lookup.
// Full SEO copy, HowTo, FAQ, and JSON-LD live in vin-tool-seo.ts (VIN_TOOLS).
// This function is the canonical entry-point from bmv-vin-pages for any code
// that routes through the bmv-vin-pages module (e.g. admin preview).
// The SSR middleware handles these slugs via the toolSlugMatch path which calls
// buildVinToolSeo() directly; this re-export keeps the two in sync.
// =============================================================================
export async function buildLookupPageSeo(slug: string): Promise<VinHostSeoBundle | null> {
  const { buildVinToolSeo, VIN_TOOL_SLUGS_SET } = await import("./vin-tool-seo");
  if (!VIN_TOOL_SLUGS_SET.has(slug)) return null;
  return buildVinToolSeo(slug);
}

// Lookup slugs — exposed so the sitemap generator and SSR layer can enumerate
// them without reaching into vin-tool-seo.ts directly.
export const LOOKUP_PAGE_SLUGS = [
  "bmw-build-sheet-lookup",
  "bmw-paint-code-lookup",
  "bmw-production-date-lookup",
  "bmw-engine-code-lookup",
  "bmw-options-lookup",
  "bmw-plant-code-lookup",
  "bmw-model-year-lookup",
] as const;

// =============================================================================
// Model landing pages (Template C): /bmw-{model} — covers slugs with digits
// or mixed characters that don't match the VIN tool or model VIN decoder
// templates (e.g. /bmw-m3, /bmw-m4, /bmw-3-series).
// =============================================================================
export function buildModelLandingSeo(
  modelSlug: string,
  cars: Array<{ displayName: string; chassis: string; slug?: string | null }>,
): VinHostSeoBundle {
  const modelName = modelSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const canonicalUrl = `${BMV_VIN_BASE}/bmw-${modelSlug}`;
  const title = `BMW ${modelName} VIN Lookup | ${SITE_NAME}`;
  const description = `Decode any BMW ${modelName} VIN instantly — get build sheet, options, paint code, production date, and more.`;
  const headFragment = buildHeadFragment({
    title,
    description,
    canonicalUrl,
    noindex: false,
    jsonLdNodes: [],
    locale: "en",
  });
  const carLinks = cars
    .slice(0, 30)
    .map(
      (c) =>
        `<li style="margin:0.25rem 0"><a href="/${encodeURIComponent(c.slug ?? c.chassis.toLowerCase())}">${escapeHtml(c.displayName)}</a></li>`,
    )
    .join("");
  const rootBody = `<main data-bmv-page="model-landing" style="max-width:720px;margin:2rem auto;padding:1.5rem;font-family:system-ui,sans-serif">
    <nav style="font-size:13px;color:#555;margin-bottom:1rem"><a href="/">BMV.VIN</a> › <span>BMW ${escapeHtml(modelName)}</span></nav>
    <h1 data-testid="text-h1">BMW ${escapeHtml(modelName)} VIN Lookup</h1>
    <p style="margin:0.75rem 0 1.25rem">${escapeHtml(description)}</p>
    <form data-bmv-vin-form action="/decode" method="get" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end;margin:1rem 0">
      <label style="flex:1 1 240px;min-width:200px"><span style="display:block;font-size:13px;color:#555">Enter VIN</span><input data-testid="input-vin" name="vin" maxlength="17" placeholder="Paste 17-character BMW VIN" pattern="[A-HJ-NPR-Z0-9]{17}" required style="display:block;width:100%;padding:0.5rem;font-family:monospace;font-size:1rem;border:1px solid #ccc;border-radius:6px" /></label>
      <button data-testid="button-decode" type="submit" style="padding:0.6rem 1.2rem;background:#111;color:#fff;border:0;border-radius:6px;font-weight:600">Decode VIN</button>
    </form>
    ${cars.length > 0 ? `<section style="margin-top:2rem"><h2 style="font-size:1.1rem;margin-bottom:0.5rem">BMW ${escapeHtml(modelName)} Variants</h2><ul style="columns:2;list-style:disc;padding-left:1.25rem">${carLinks}</ul></section>` : ""}
    <p style="margin-top:2rem"><a href="/">← Back to BMV.VIN</a></p>
  </main>`;
  return { status: 200, title, description, canonicalUrl, headFragment, rootBody };
}

// =============================================================================
// 404 fallback for unknown bmv.vin paths.
// =============================================================================
export function buildVinHostNotFoundSeo(path: string, locale: LocaleCode): VinHostSeoBundle {
  const strings = getVinHostStrings(locale);
  const canonicalUrl = `${BMV_VIN_BASE}${path}`;
  const title = `${strings.notFoundH1} | ${SITE_NAME}`;
  const description = strings.notFoundBody;
  const headFragment = buildHeadFragment({
    title, description, canonicalUrl, noindex: true, jsonLdNodes: [], locale,
  });
  const rootBody = `<main data-bmv-page="404" style="max-width:560px;margin:4rem auto;padding:1.5rem;font-family:system-ui,sans-serif;text-align:center">
    <h1 data-testid="text-h1">${escapeHtml(strings.notFoundH1)}</h1>
    <p>${escapeHtml(strings.notFoundBody)}</p>
    <p><a href="/">${escapeHtml(strings.breadcrumbHome)}</a></p>
  </main>`;
  return { status: 404, title, description, canonicalUrl, headFragment, rootBody, noindex: true };
}
