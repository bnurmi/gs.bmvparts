import { Helmet } from "react-helmet-async";

const SITE_NAME = "BMV.parts";
const BASE_URL = "https://bmv.parts";
const VIN_HOST_BASE_URL = "https://bmv.vin";
const DEFAULT_DESCRIPTION = "Browse the complete BMW OEM parts catalog with part numbers, exploded diagrams, pricing, and cross-references. Search by model, chassis code, VIN, or part number.";
const DEFAULT_OG_IMAGE = `${BASE_URL}/favicon.png`;

// True when the page is running on the bmv.vin vanity host. On that host
// the SEO canonical/alternate/breadcrumb URLs should point at bmv.vin
// (with the /vin prefix stripped) so the SSR canonicals and the SPA's
// post-hydration Helmet canonicals agree.
function isOnVinHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "bmv.vin" || h === "www.bmv.vin";
}

// On bmv.vin: "/vin/<VIN>" → "/<VIN>", "/vin" → "/", everything else
// passes through unchanged. On bmv.parts: identity.
function vinHostRelativePath(p: string): string {
  if (!isOnVinHost()) return p;
  if (p === "/vin") return "/";
  if (p.startsWith("/vin/")) return p.slice(4);
  return p;
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

// Per-locale alternate URL emitted as <link rel="alternate" hreflang="…"/>.
// The `path` is locale-relative (no domain) so callers can compute the URL
// for each language without restating the host. `bcp47` is what hreflang
// expects (e.g. "de-DE", "zh-CN").
interface AlternateLink {
  bcp47: string;       // hreflang value, also used for x-default sentinel
  path: string;        // path-only URL fragment, e.g. "/de/part/11427826799"
}

interface SEOProps {
  title?: string;
  description?: string;
  // Optional comma-separated keyword string. Most search engines ignore this
  // tag today, but Yandex and a handful of vertical search bots still read
  // it, so we expose it for pages where the topical keyword cluster is well
  // defined (e.g. /vin — "BMW VIN decoder, free BMW VIN check, …").
  keywords?: string;
  path?: string;
  ogType?: string;
  ogImage?: string;
  noIndex?: boolean;
  structuredData?: Record<string, any> | Record<string, any>[];
  breadcrumbs?: BreadcrumbItem[];
  // Active locale (BCP-47). Sets <html lang> and is used as the canonical
  // page language for og/twitter and JSON-LD `inLanguage` annotations.
  locale?: string;
  // List of localized URL variants; one entry per supported locale. The
  // English (default) variant is also used as the x-default per Google's
  // recommendation. Omit when the page isn't localized.
  alternates?: AlternateLink[];
}

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  path = "/",
  ogType = "website",
  ogImage = DEFAULT_OG_IMAGE,
  noIndex = false,
  structuredData,
  breadcrumbs,
  locale,
  alternates,
}: SEOProps) {
  const onVinHost = isOnVinHost();
  const baseUrl = onVinHost ? VIN_HOST_BASE_URL : BASE_URL;
  // On bmv.vin the /vin prefix is stripped from public URLs. We rewrite
  // the canonical, alternates, and breadcrumb item URLs accordingly so
  // they match what the user actually sees in the address bar (and what
  // the SSR layer in `server/seo/vin-landing.ts` already emits).
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — BMW OEM Parts Catalog`;
  const canonicalUrl = `${baseUrl}${vinHostRelativePath(path)}`;
  // The English alternate (prefix-less) is treated as x-default. We assume
  // it's the first entry whose bcp47 starts with "en" — keeps this safe even
  // if the alternates array is reordered upstream.
  const xDefault = alternates?.find(a => a.bcp47.toLowerCase().startsWith("en"));

  const breadcrumbSchema = breadcrumbs && breadcrumbs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url.startsWith("http")
        ? item.url
        : `${baseUrl}${vinHostRelativePath(item.url)}`,
    })),
  } : null;

  return (
    <Helmet>
      {locale && <html lang={locale} />}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={canonicalUrl} />
      {alternates && alternates.map(a => (
        <link key={a.bcp47} rel="alternate" hrefLang={a.bcp47} href={`${baseUrl}${vinHostRelativePath(a.path)}`} />
      ))}
      {xDefault && (
        <link rel="alternate" hrefLang="x-default" href={`${baseUrl}${vinHostRelativePath(xDefault.path)}`} />
      )}

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content={SITE_NAME} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@bmvparts" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {noIndex && <meta name="robots" content="noindex,nofollow" />}

      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(
            Array.isArray(structuredData) ? structuredData : structuredData
          )}
        </script>
      )}

      {breadcrumbSchema && (
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      )}
    </Helmet>
  );
}

export function WebsiteStructuredData() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "BMV.parts",
      url: "https://bmv.parts",
      description: DEFAULT_DESCRIPTION,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://bmv.parts/search?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "BMV.parts",
      url: "https://bmv.parts",
      logo: DEFAULT_OG_IMAGE,
      description: "Comprehensive BMW OEM parts catalog and reference database.",
    },
  ];

  return (
    <Helmet>
      {data.map((item, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(item)}
        </script>
      ))}
    </Helmet>
  );
}
