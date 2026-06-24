import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { SEO } from "@/components/SEO";
import { CLIENT_LOCALES, splitLocaleFromPath, useLocalizedHref, withLocalePrefix } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, ExternalLink, Car as CarIcon, Weight, Package2, ShoppingCart,
  Copy, Check, ChevronRight, DollarSign, Tag, Loader2, Lock, CheckCircle
} from "lucide-react";
import { useState } from "react";
import { AiFaqSection } from "@/components/AiFaqSection";
import { useAuth } from "@/lib/auth";
import { trackedHref } from "@/lib/tracked-link";
import { MpQuoteModal } from "@/components/MpQuoteModal";

interface MPerformanceData {
  inStock: boolean;
  productUrl: string | null;
  productTitle: string | null;
  price: number | null;
  searchUrl: string;
}

interface PricingData {
  found: boolean;
  source?: "bmwpartsdeal" | "lllparts" | "etk_europe";
  partNumber?: string;
  dealPrice?: number;
  msrp?: number;
  savings?: number;
  gbpPrice?: number;
  audApprox?: number;
  productUrl?: string;
  currency?: string;
  error?: string;
  // BMW Europe ETK dealer pricing (shown alongside US/UK pricing)
  eurListPrice?: number;
  eurNetPrice?: number;
  eurVatPercent?: number;
  eurAudApprox?: number;
  eurSourceFile?: string;
}

function PricingGate() {
  return (
    <div className="border rounded-lg overflow-hidden" data-testid="pricing-gate">
      <div className="bg-muted/50 px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm text-muted-foreground">Pricing</span>
        </div>
      </div>
      <div className="px-4 py-6 text-center space-y-3">
        <div className="space-y-1">
          <div className="flex justify-center gap-4 text-lg font-bold text-muted-foreground/40">
            <span>$•••.••</span>
            <span>$•••.••</span>
            <span>$•••.••</span>
          </div>
          <p className="text-sm text-muted-foreground">Sign in or register to view pricing details</p>
        </div>
        <Link href="/login" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors" data-testid="button-register-pricing">
          <Lock className="w-4 h-4" />
          Register to See Pricing
        </Link>
      </div>
    </div>
  );
}

function PricingSection({ partNumberClean }: { partNumberClean: string }) {
  const { isAuthenticated } = useAuth();

  const { data: pricing, isLoading } = useQuery<PricingData>({
    queryKey: ["/api/parts/pricing", partNumberClean],
    queryFn: async () => {
      const res = await fetch(`/api/parts/pricing/${encodeURIComponent(partNumberClean)}`);
      if (!res.ok) throw new Error("Failed to fetch pricing");
      return res.json();
    },
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return <PricingGate />;
  }

  if (isLoading) {
    return (
      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Fetching pricing...</span>
        </div>
      </div>
    );
  }

  if (!pricing?.found) {
    return (
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Tag className="w-4 h-4" />
          <span>Pricing not available for this part</span>
        </div>
      </div>
    );
  }

  const isBpd = pricing.source === "bmwpartsdeal";
  const isLll = pricing.source === "lllparts";
  const isEtkOnly = pricing.source === "etk_europe";
  const hasEur = pricing.eurNetPrice != null;

  return (
    <div className="border rounded-lg overflow-hidden" data-testid="pricing-section">
      <div className="bg-primary/10 px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Pricing</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {isBpd ? "USD MSRP" : isLll ? "GBP retail" : isEtkOnly ? "EUR retail" : "—"}
          </span>
        </div>
      </div>
      <div className="divide-y">
        {pricing.audApprox != null && (
          <div className="px-4 py-3 flex items-center justify-between bg-amber-50 dark:bg-amber-950/30">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">AUD Approx</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {isBpd ? "USD MSRP Converted to AUD" : isLll ? "GBP Converted to AUD" : "Converted to AUD"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-amber-700 dark:text-amber-400" data-testid="text-price-aud">
                ${pricing.audApprox.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-muted-foreground">AUD</div>
            </div>
          </div>
        )}

        {hasEur && (
          <div className="px-4 py-3 flex items-center justify-between bg-blue-50 dark:bg-blue-950/30">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">BMW Europe Dealer Pricing</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Net €{pricing.eurNetPrice!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {pricing.eurListPrice != null && ` · List €${pricing.eurListPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                {pricing.eurVatPercent != null && pricing.eurVatPercent > 0 && ` · VAT ${pricing.eurVatPercent}%`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-blue-700 dark:text-blue-400" data-testid="text-price-eur-aud">
                ${pricing.eurAudApprox?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">AUD ≈</div>
            </div>
          </div>
        )}

        {isBpd && (
          <>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">MSRP</div>
                <div className="text-xs text-muted-foreground mt-0.5">Manufacturer suggested retail</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold" data-testid="text-price-msrp">
                  ${pricing.msrp?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-muted-foreground">USD</div>
              </div>
            </div>

            <div className="px-4 py-3 flex items-center justify-between bg-green-50 dark:bg-green-950/30">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">BMWPartsDeal Price</div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5 font-medium">
                  Save ${pricing.savings?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-green-700 dark:text-green-400" data-testid="text-price-deal">
                  ${pricing.dealPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-muted-foreground">USD</div>
              </div>
            </div>
          </>
        )}

        {isLll && (
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">LLLParts Price</div>
              <div className="text-xs text-muted-foreground mt-0.5">UK retail price</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold" data-testid="text-price-gbp">
                £{pricing.gbpPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-muted-foreground">GBP</div>
            </div>
          </div>
        )}
      </div>
      {pricing.productUrl && (
        <div className="border-t px-4 py-2.5 bg-muted/30">
          <a
            href={trackedHref(pricing.productUrl, { label: isBpd ? "BMWPartsDeal" : isLll ? "LLLParts" : "Pricing", partNumber: partNumberClean, source: "part-detail" })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
            data-testid="link-pricing-source"
          >
            View on {isBpd ? "BMWPartsDeal" : isLll ? "LLLParts.co.uk" : "Source"}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

interface ExternalCatalogPart {
  id: number;
  brand: string;
  modelSeries: string | null;
  model: string | null;
  partGroup: string | null;
  subgroup: string | null;
  partNumber: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  supersessionPartNumber: string | null;
  supersessionInfo: string | null;
  quantity: number | null;
  diagramImagePath: string | null;
  diagramRefNumber: string | null;
  compatibility: Record<string, unknown> | null;
  hierarchyPath: string | null;
}

interface CrossReferenceData {
  partNumber: string;
  partNumberClean: string;
  description: string;
  additionalInfo: string | null;
  weight: number | null;
  externalChassis?: string[];
  vehicles: {
    carId: number;
    carName: string;
    chassis: string;
    engine: string;
    bodyType: string;
    yearStart: number;
    yearEnd: number | null;
    carSlug: string | null;
    categoryId: number;
    categoryName: string;
    subcategoryId: number;
    subcategoryName: string;
    quantity: string | null;
    itemNo: string | null;
  }[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 hover:bg-accent rounded-md transition-colors"
      data-testid="button-copy-part-number"
    >
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

export default function PartDetail() {
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const { partNumberClean } = useParams<{ partNumberClean: string }>();
  // Derive active locale from the URL prefix (`/de/part/...`, `/zh/part/...`,
  // etc). Defaults to English on the un-prefixed path. The active locale is
  // forwarded to the SEO API via ?locale= so the server returns translated
  // copy and increments the language-request analytics counter.
  const [currentPath] = useLocation();
  const { locale: activeLocale } = splitLocaleFromPath(currentPath);
  const localize = useLocalizedHref();
  // Build hreflang alternates pointing at the same part across every locale.
  const seoAlternates = partNumberClean
    ? CLIENT_LOCALES.map(l => ({
        bcp47: l.bcp47,
        path: withLocalePrefix(l.prefix, `/part/${partNumberClean}`),
      }))
    : undefined;
  const isCJK = activeLocale.code === "zh-CN" || activeLocale.code === "ko-KR";

  const { data, isLoading } = useQuery<CrossReferenceData | null>({
    queryKey: ["/api/parts/cross-reference", partNumberClean],
    queryFn: async () => {
      const res = await fetch(`/api/parts/cross-reference/${encodeURIComponent(partNumberClean || "")}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load part");
      return res.json();
    },
    enabled: !!partNumberClean,
  });

  // Server-rendered SEO content (intro, FAQ, fitment-by-chassis, related parts).
  // Soft-fail: page still works without this query if the endpoint errors.
  const { data: seoData } = useQuery<{
    locale?: string;
    content: {
      intro: string;
      fitmentSummary: string;
      fitmentByChassis: { chassis: string; yearStart: number | null; yearEnd: number | null; models: { displayName: string; engine: string; bodyType: string; yearStart: number; yearEnd: number | null }[] }[];
      specs: { label: string; value: string }[];
      faq: { question: string; answer: string }[];
      categoryGuide: string | null;
      editorNote: string | null;
      related: { partNumber: string; partNumberClean: string; description: string }[];
      metaTitle: string;
      metaDescription: string;
      // Locale metadata returned by /api/parts/seo (Task #32). Used to set
      // schema.org `inLanguage` and to render a regional pricing hint for
      // Phase 2 locales whose catalogs differ from the EU baseline.
      locale: string;
      inLanguage: string;
      regionHint: string | null;
      currency: string;
    };
  }>({
    // Locale is part of the cache key so switching languages refetches
    // (instead of returning stale English copy from the previous render).
    queryKey: ["/api/parts/seo", partNumberClean, activeLocale.code],
    queryFn: async () => {
      const res = await fetch(
        `/api/parts/seo/${encodeURIComponent(partNumberClean || "")}?locale=${encodeURIComponent(activeLocale.code)}`,
      );
      if (!res.ok) throw new Error("seo unavailable");
      return res.json();
    },
    enabled: !!partNumberClean,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const { data: externalData, isLoading: externalLoading } = useQuery<{ found: boolean; part: ExternalCatalogPart | null }>({
    queryKey: ["/api/parts/external", partNumberClean],
    queryFn: async () => {
      const res = await fetch(`/api/parts/external/${encodeURIComponent(partNumberClean || "")}`);
      if (!res.ok) return { found: false, part: null };
      return res.json();
    },
    enabled: !!partNumberClean,
    staleTime: 1000 * 60 * 10,
  });
  const externalPart = externalData?.part || null;

  const { data: mpData, isLoading: mpLoading } = useQuery<MPerformanceData>({
    queryKey: ["/api/parts/mperformance", partNumberClean],
    queryFn: async () => {
      const res = await fetch(`/api/parts/mperformance/${encodeURIComponent(partNumberClean || "")}`);
      if (!res.ok) throw new Error("Failed to check stock");
      return res.json();
    },
    staleTime: 1000 * 60 * 15,
    retry: 1,
    enabled: !!partNumberClean,
  });

  const ecsAffiliateQuery = useQuery<{ enabled: boolean; id: string; mid: string; u1: string }>({
    queryKey: ["/api/settings/affiliate/ecs"],
  });
  const turnerAffiliateQuery = useQuery<{ enabled: boolean; id: string; mid: string; u1: string }>({
    queryKey: ["/api/settings/affiliate/turner"],
  });
  const ebayAffiliateQuery = useQuery<{ enabled: boolean; campid: string; customid: string; mkrid: string }>({
    queryKey: ["/api/settings/affiliate/ebay"],
  });
  const amazonAffiliateQuery = useQuery<{ enabled: boolean; tag: string }>({
    queryKey: ["/api/settings/affiliate/amazon"],
  });

  const ebayUrl = (() => {
    const s = ebayAffiliateQuery.data;
    const base = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(partNumberClean || "")}`;
    if (!s || !s.enabled) return base;
    return `${base}&mkcid=1&mkrid=${encodeURIComponent(s.mkrid)}&siteid=0&campid=${encodeURIComponent(s.campid)}&customid=${encodeURIComponent(s.customid)}&toolid=10001&mkevt=1`;
  })();

  const amazonUrl = (() => {
    const s = amazonAffiliateQuery.data;
    const base = `https://www.amazon.com/s?k=${encodeURIComponent(partNumberClean || "")}`;
    if (!s || !s.enabled) return base;
    return `${base}&tag=${encodeURIComponent(s.tag)}`;
  })();

  const ecsDirectUrl = `https://www.ecstuning.com/Search/SiteSearch/${encodeURIComponent(partNumberClean || "")}/`;
  const ecsUrl = (() => {
    const s = ecsAffiliateQuery.data;
    if (!s) return ecsDirectUrl;
    const murl = encodeURIComponent(`https://www.ecstuning.com/Search/SiteSearch/${encodeURIComponent(partNumberClean || "")}/`);
    return `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(s.id)}&mid=${encodeURIComponent(s.mid)}&murl=${murl}&u1=${encodeURIComponent(s.u1)}`;
  })();
  const turnerUrl = (() => {
    const s = turnerAffiliateQuery.data;
    if (!s) return null;
    const murl = encodeURIComponent(`https://www.turnermotorsport.com/Search?No=0&Nrpp=50&Ntt=${encodeURIComponent(partNumberClean || "")}`);
    return `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(s.id)}&mid=${encodeURIComponent(s.mid)}&murl=${murl}&u1=${encodeURIComponent(s.u1)}`;
  })();

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // Local DB has no record. If the OEM catalog has it, fall through and
  // render below using external-only data. Otherwise show "not found".
  if (!data && externalLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (!data && !externalPart) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Package2 className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground" data-testid="text-part-not-found">Part not found</p>
        <Button asChild variant="outline" className="mt-4" data-testid="link-back-home">
          <Link href={localize("/")}>Go back</Link>
        </Button>
      </div>
    );
  }

  // If we only have external data, synthesize a minimal CrossReferenceData
  // so the rest of the page (which assumes `data`) renders cleanly.
  const effectiveData: CrossReferenceData = data || {
    partNumber: externalPart!.partNumber,
    partNumberClean: externalPart!.partNumber.replace(/\s/g, ""),
    description: externalPart!.description || "BMW Part",
    additionalInfo: externalPart!.supersessionInfo || null,
    weight: null,
    vehicles: [],
    externalChassis: externalPart!.model ? [externalPart!.model] : [],
  };
  const externalOnly = !data;

  const uniqueCars = new Map<number, CrossReferenceData["vehicles"][0]>();
  for (const v of effectiveData.vehicles) {
    if (!uniqueCars.has(v.carId)) {
      uniqueCars.set(v.carId, v);
    }
  }

  const firstVehicle = effectiveData.vehicles[0];

  const partDesc = effectiveData.description || "BMW Part";
  const seoContent = seoData?.content;
  const seoPartTitle = seoContent?.metaTitle || `BMW ${partNumberClean} — ${partDesc}`;
  const seoPartDesc = seoContent?.metaDescription || `Details for BMW part ${partNumberClean}: ${partDesc}. Fits ${uniqueCars.size} model${uniqueCars.size !== 1 ? "s" : ""}. View cross-references, pricing, and compatibility.`;

  // Build a richer Product schema; include FAQPage as a sibling node.
  type JsonLd = Record<string, unknown>;
  const additionalProperty: JsonLd[] = (seoContent?.specs || []).map(s => ({
    "@type": "PropertyValue", name: s.label, value: s.value,
  }));
  // The schema.org `inLanguage` annotation tells crawlers which language
  // this Product/FAQPage node is written in. Defaults to the active locale
  // when the API hasn't returned an inLanguage hint (e.g. soft-failed query).
  const seoInLanguage = seoContent?.inLanguage || activeLocale.bcp47;
  const regionHint = seoContent?.regionHint ?? null;
  const seoCurrency = seoContent?.currency ?? "USD";
  const productSchema: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: partDesc,
    sku: partNumberClean,
    mpn: partNumberClean,
    brand: { "@type": "Brand", name: "BMW" },
    description: seoPartDesc,
    inLanguage: seoInLanguage,
    // Currency hint surfaced to crawlers via offers; the actual numeric
    // pricing comes from the dedicated /pricing widget below for signed-in
    // users so we don't fabricate a price here.
    ...(seoCurrency ? { offers: { "@type": "AggregateOffer", priceCurrency: seoCurrency, availability: "https://schema.org/InStock" } } : {}),
    ...(firstVehicle?.categoryName ? { category: [firstVehicle.categoryName, firstVehicle.subcategoryName].filter(Boolean).join(" > ") } : {}),
    ...(effectiveData.weight != null ? { weight: { "@type": "QuantitativeValue", value: effectiveData.weight, unitCode: "KGM" } } : {}),
    ...(additionalProperty.length ? { additionalProperty } : {}),
    ...(seoContent?.related?.length ? {
      isRelatedTo: seoContent.related.map(r => ({
        "@type": "Product",
        name: r.description,
        sku: r.partNumberClean,
        url: `/part/${r.partNumberClean}`,
      })),
    } : {}),
  };
  const faqSchema: JsonLd | null = seoContent?.faq?.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: seoInLanguage,
    mainEntity: seoContent.faq.map(f => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  } : null;
  const structuredDataNodes: JsonLd | JsonLd[] = faqSchema ? [productSchema, faqSchema] : productSchema;

  return (
    // CJK locales benefit from disabled hyphenation and `word-break: keep-all`
    // so we don't break Chinese/Korean glyph runs in the middle of compound
    // words. Other locales keep the default body class behavior.
    <div
      className={`max-w-2xl mx-auto p-4 md:p-6${isCJK ? " [word-break:keep-all] [hyphens:none]" : ""}`}
      lang={activeLocale.bcp47}
    >
      <SEO
        title={seoPartTitle}
        description={seoPartDesc}
        path={withLocalePrefix(activeLocale.prefix, `/part/${partNumberClean}`)}
        locale={activeLocale.bcp47}
        alternates={seoAlternates}
        structuredData={structuredDataNodes}
        breadcrumbs={[
          { name: "Home", url: "/" },
          ...(firstVehicle ? [
            { name: firstVehicle.carName, url: `/car/${firstVehicle.carSlug || firstVehicle.carId}` },
            { name: (firstVehicle.categoryName === 'RealOEM Backfill' || firstVehicle.categoryName === 'realoem-backfill') ? 'Additional Parts' : firstVehicle.categoryName, url: `/car/${firstVehicle.carSlug || firstVehicle.carId}?cat=${firstVehicle.categoryId}` },
          ] : []),
          { name: effectiveData.partNumber || partNumberClean || "", url: `/part/${partNumberClean}` },
        ]}
      />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4 flex-wrap">
        <button
          onClick={() => window.history.back()}
          className="p-1 -ml-1 hover:bg-accent rounded-md mr-1"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Link href={localize("/")} className="hover:underline cursor-pointer" data-testid="breadcrumb-home">
          Home
        </Link>
        {firstVehicle && (
          <>
            <ChevronRight className="w-3 h-3" />
            <Link href={localize(`/car/${firstVehicle.carSlug || firstVehicle.carId}`)} className="hover:underline cursor-pointer" data-testid="breadcrumb-car">
              {firstVehicle.carName}
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link href={localize(`/car/${firstVehicle.carSlug || firstVehicle.carId}?cat=${firstVehicle.categoryId}`)} className="hover:underline cursor-pointer" data-testid="breadcrumb-category">
              {(firstVehicle.categoryName === 'RealOEM Backfill' || firstVehicle.categoryName === 'realoem-backfill') ? 'Additional Parts' : firstVehicle.categoryName}
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link href={localize(`/car/${firstVehicle.carSlug || firstVehicle.carId}?cat=${firstVehicle.categoryId}&sub=${firstVehicle.subcategoryId}`)} className="hover:underline cursor-pointer" data-testid="breadcrumb-subcategory">
              {firstVehicle.subcategoryName}
            </Link>
          </>
        )}
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium font-mono">{effectiveData.partNumber}</span>
      </div>

      <div className="space-y-6">
        <div>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold font-mono" data-testid="text-part-number">
                  {effectiveData.partNumber}
                </h1>
                <CopyButton text={effectiveData.partNumberClean} />
              </div>
              {effectiveData.partNumberClean !== effectiveData.partNumber && (
                <p className="text-sm text-muted-foreground font-mono mt-0.5" data-testid="text-part-number-clean">
                  {effectiveData.partNumberClean}
                </p>
              )}
            </div>
          </div>

          <h2 className="text-lg font-medium mt-2" data-testid="text-part-description">
            {effectiveData.description}
          </h2>

          {effectiveData.additionalInfo && (
            <p className="text-sm text-muted-foreground mt-1">{effectiveData.additionalInfo}</p>
          )}

          {effectiveData.weight != null && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2">
              <Weight className="w-4 h-4" />
              <span>{effectiveData.weight.toFixed(3)} kg</span>
            </div>
          )}

          {seoContent?.intro && (
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed" data-testid="text-seo-intro">
              {seoContent.intro}
            </p>
          )}

          {seoContent?.editorNote && (
            <div className="mt-3 border-l-2 border-amber-500 pl-3 py-1 text-sm" data-testid="text-editor-note">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Editor note</span>
              <p className="text-muted-foreground">{seoContent.editorNote}</p>
            </div>
          )}

          {/* Phase 2 region/currency hint (Task #32). Shown for non-English
              locales whose catalog availability or pricing differs from the
              EU baseline (e.g. en-ZA Plant Rosslyn note, es-MX SKU coverage).
              Currency badge tells visitors which unit any pricing is shown in. */}
          {regionHint && (
            <div
              className="mt-3 border rounded-md px-3 py-2 text-xs bg-muted/40 flex items-start gap-2"
              data-testid="text-region-hint"
            >
              <Badge variant="outline" className="text-[10px] shrink-0" data-testid="badge-currency">{seoCurrency}</Badge>
              <span className="text-muted-foreground leading-relaxed">{regionHint}</span>
            </div>
          )}
        </div>

        {externalOnly && (
          <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-sm" data-testid="banner-external-only">
            <div className="flex items-start gap-2">
              <Package2 className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Found in OEM catalog</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs mt-0.5">
                  We don't have this part scraped to our local catalog yet, but it's confirmed in the OEM parts data.
                </p>
              </div>
            </div>
          </div>
        )}

        {externalPart && (
          <div className="border rounded-lg p-4" data-testid="section-external-catalog">
            <h3 className="text-sm font-semibold mb-3">OEM catalog details</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {externalPart.model && (
                <>
                  <dt className="text-muted-foreground">Model</dt>
                  <dd className="font-mono" data-testid="text-external-model">{externalPart.model}</dd>
                </>
              )}
              {externalPart.modelSeries && (
                <>
                  <dt className="text-muted-foreground">Series</dt>
                  <dd data-testid="text-external-series">{externalPart.modelSeries}</dd>
                </>
              )}
              {externalPart.partGroup && (
                <>
                  <dt className="text-muted-foreground">Part group</dt>
                  <dd data-testid="text-external-group">{externalPart.partGroup}{externalPart.subgroup ? ` / ${externalPart.subgroup}` : ""}</dd>
                </>
              )}
              {externalPart.quantity != null && (
                <>
                  <dt className="text-muted-foreground">Quantity per car</dt>
                  <dd>{externalPart.quantity}</dd>
                </>
              )}
              {externalPart.price && (
                <>
                  <dt className="text-muted-foreground">List price</dt>
                  <dd>{externalPart.price}{externalPart.currency ? ` ${externalPart.currency}` : ""}</dd>
                </>
              )}
              {externalPart.diagramRefNumber && (
                <>
                  <dt className="text-muted-foreground">Diagram ref</dt>
                  <dd className="font-mono">#{externalPart.diagramRefNumber}</dd>
                </>
              )}
            </dl>
            {externalPart.supersessionPartNumber && (() => {
              const supersessionClean = externalPart.supersessionPartNumber.replace(/\s/g, "");
              const isSelfReference = supersessionClean === effectiveData.partNumberClean;
              return (
                <div className="mt-3 pt-3 border-t text-sm">
                  <span className="text-muted-foreground">Superseded by: </span>
                  {isSelfReference ? (
                    <span className="font-mono font-medium" data-testid="text-supersession">
                      {externalPart.supersessionPartNumber}
                    </span>
                  ) : (
                    <Link
                      href={localize(`/part/${supersessionClean}`)}
                      className="font-mono font-medium hover:underline text-blue-600 dark:text-blue-400"
                      data-testid="link-supersession"
                    >
                      {externalPart.supersessionPartNumber}
                    </Link>
                  )}
                  {externalPart.supersessionInfo && (
                    <p className="text-xs text-muted-foreground mt-1">{externalPart.supersessionInfo}</p>
                  )}
                </div>
              );
            })()}
            {externalPart.hierarchyPath && (
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t" data-testid="text-external-hierarchy">
                Catalog path: <span className="font-mono">{externalPart.hierarchyPath}</span>
              </p>
            )}
          </div>
        )}

        {partNumberClean && <PricingSection partNumberClean={partNumberClean} />}

        {mpLoading && (
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking availability at MPerformance.parts...</span>
            </div>
          </div>
        )}

        {mpData?.inStock && (
          <div className="border rounded-lg overflow-hidden bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800" data-testid="banner-mperformance">
            <div className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">Available at MPerformance.parts</span>
                  <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1">
                    <CheckCircle className="w-3 h-3" />
                    In Stock
                  </Badge>
                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">10% Off</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {mpData.price != null && (
                    <span className="font-medium text-foreground">A${mpData.price.toFixed(2)} </span>
                  )}
                  Use code <code className="font-mono font-bold text-blue-700 dark:text-blue-400 bg-white dark:bg-gray-900 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 select-all" data-testid="text-coupon-code">PARTFINDER10</code> at checkout for 10% off
                </p>
              </div>
              <a
                href={trackedHref(mpData.productUrl || mpData.searchUrl, { label: "MPerformance.parts", partNumber: partNumberClean, source: "part-detail" })}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-mperformance"
              >
                <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shrink-0">
                  <ShoppingCart className="w-4 h-4" />
                  Shop Now
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </Button>
              </a>
            </div>
            <div className="border-t px-4 py-2.5 bg-white/50 dark:bg-black/10">
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 gap-1.5 h-auto py-1 px-2 text-xs font-medium"
                onClick={() => setQuoteModalOpen(true)}
                data-testid="button-request-quote-secondary"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Request a Quote — MPerformance.parts
              </Button>
            </div>
          </div>
        )}

        {!mpLoading && !mpData?.inStock && (
          <div className="border rounded-lg overflow-hidden border-blue-200 dark:border-blue-800/60" data-testid="banner-mp-quote-primary">
            <div className="p-4 flex items-start gap-3 bg-blue-50/60 dark:bg-blue-950/20">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">Not listed at MPerformance.parts?</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                  Submit a quote request and the team will check availability and pricing for you.
                </p>
              </div>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shrink-0 text-sm"
                onClick={() => setQuoteModalOpen(true)}
                data-testid="button-request-quote-primary"
              >
                Request a Quote
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </Button>
            </div>
          </div>
        )}

        <MpQuoteModal
          open={quoteModalOpen}
          onOpenChange={setQuoteModalOpen}
          partNumber={effectiveData.partNumberClean}
          partDescription={partDesc}
          vehicleModel={firstVehicle?.carName ?? externalPart?.model ?? undefined}
          vehicleSeries={firstVehicle?.chassis ?? externalPart?.modelSeries ?? undefined}
          vehicleYear={firstVehicle?.yearStart}
        />

        <div className="flex flex-wrap gap-2">
          {ecsAffiliateQuery.data?.enabled !== false && (
            <a
              href={trackedHref(ecsUrl, { label: "ECS Tuning", partNumber: partNumberClean, source: "part-detail" })}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#dc0000] hover:bg-[#b80000] text-white text-sm font-medium transition-colors"
              data-testid="link-ecs-tuning"
            >
              <ShoppingCart className="w-4 h-4" />
              Shop at ECS Tuning
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
          {turnerAffiliateQuery.data?.enabled !== false && turnerUrl && (
            <a
              href={trackedHref(turnerUrl, { label: "Turner Motorsport", partNumber: partNumberClean, source: "part-detail" })}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1a3a5c] hover:bg-[#15304d] text-white text-sm font-medium transition-colors"
              data-testid="link-turner-motorsport"
            >
              <ShoppingCart className="w-4 h-4" />
              Shop at Turner Motorsport
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
          <a
            href={trackedHref(ebayUrl, { label: "eBay", partNumber: partNumberClean, source: "part-detail" })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#e53238] hover:bg-[#d12b31] text-white text-sm font-medium transition-colors"
            data-testid="link-ebay"
          >
            <ShoppingCart className="w-4 h-4" />
            Search on eBay
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
          <a
            href={trackedHref(amazonUrl, { label: "Amazon", partNumber: partNumberClean, source: "part-detail" })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#ff9900] hover:bg-[#e68a00] text-black text-sm font-medium transition-colors"
            data-testid="link-amazon"
          >
            <ShoppingCart className="w-4 h-4" />
            Search on Amazon
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
        </div>

        <Separator />

        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
            Found on {uniqueCars.size} vehicle{uniqueCars.size !== 1 ? "s" : ""}
          </h3>

          <div className="space-y-2">
            {Array.from(uniqueCars.values()).map((vehicle) => (
              <Link
                key={vehicle.carId}
                href={localize(`/car/${vehicle.carSlug || vehicle.carId}`)}
                className="block"
              >
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                  data-testid={`link-vehicle-${vehicle.carId}`}
                >
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <CarIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{vehicle.carName}</div>
                    <div className="text-xs text-muted-foreground">
                      {vehicle.chassis} · {vehicle.engine} · {vehicle.bodyType} · {vehicle.yearStart}{vehicle.yearEnd ? `–${vehicle.yearEnd}` : "+"}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {vehicle.chassis}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {effectiveData.externalChassis && effectiveData.externalChassis.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
                Also fits
              </h3>
              <div className="flex flex-wrap gap-1.5" data-testid="external-chassis-list">
                {effectiveData.externalChassis.map((code) => (
                  <Link key={code} href={localize(`/chassis/${code.toLowerCase()}`)}>
                    <Badge variant="outline" className="text-xs font-mono hover:bg-accent cursor-pointer" data-testid={`badge-chassis-${code}`}>
                      {code}
                    </Badge>
                  </Link>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Additional BMW series where this part number appears
              </p>
            </div>
          </>
        )}

        <Separator />

        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
            All appearances ({effectiveData.vehicles.length})
          </h3>

          <div className="border rounded-lg overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_4rem] text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-2 border-b">
              <span>Vehicle</span>
              <span>Category</span>
              <span>Parts Group</span>
              <span className="text-right">Qty</span>
            </div>
            {effectiveData.vehicles.map((v, i) => (
              <Link
                key={`${v.carId}-${v.categoryName}-${v.subcategoryName}-${i}`}
                href={localize(`/car/${v.carSlug || v.carId}`)}
                className="block"
              >
                <div
                  className={`md:grid md:grid-cols-[1fr_1fr_1fr_4rem] px-3 py-2.5 text-sm border-b last:border-0 hover:bg-accent/30 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                  data-testid={`row-appearance-${i}`}
                >
                  <div className="font-medium text-sm">{v.carName}</div>
                  <div className="text-xs md:text-sm text-muted-foreground md:text-foreground mt-0.5 md:mt-0 self-center">{v.categoryName}</div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-0 self-center">{v.subcategoryName}</div>
                  <div className="text-xs text-muted-foreground md:text-right self-center mt-0.5 md:mt-0">
                    <span className="md:hidden">Qty: </span>{v.quantity || "—"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {seoContent?.specs && seoContent.specs.length > 0 && (
          <>
            <Separator />
            <div data-testid="section-specifications">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
                Specifications
              </h3>
              <dl className="border rounded-lg divide-y">
                {seoContent.specs.map((s, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[10rem_1fr] md:grid-cols-[14rem_1fr] gap-3 px-3 py-2 text-sm"
                    data-testid={`spec-row-${i}`}
                  >
                    <dt className="text-muted-foreground">{s.label}</dt>
                    <dd className="font-medium break-words">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}

        {seoContent?.fitmentByChassis && seoContent.fitmentByChassis.length > 0 && (
          <>
            <Separator />
            <div data-testid="section-fitment-by-chassis">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
                Fitment by chassis
              </h3>
              <div className="space-y-2">
                {seoContent.fitmentByChassis.map(g => (
                  <div key={g.chassis} className="border rounded-lg p-3" data-testid={`chassis-group-${g.chassis}`}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <Link href={localize(`/chassis/${g.chassis.toLowerCase()}`)} className="font-mono font-semibold text-sm hover:underline">
                        {g.chassis}
                      </Link>
                      {(g.yearStart || g.yearEnd) && (
                        <span className="text-xs text-muted-foreground">
                          {g.yearStart || "?"}{g.yearEnd && g.yearEnd !== g.yearStart ? `–${g.yearEnd}` : g.yearStart ? "+" : ""}
                        </span>
                      )}
                    </div>
                    {g.models.length > 0 ? (
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {g.models.map((m, mi) => (
                          <li key={mi}>
                            {m.displayName}
                            {m.engine ? ` · ${m.engine}` : ""}
                            {m.bodyType ? ` · ${m.bodyType}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Cross-referenced via OEM catalog.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {seoContent?.related && seoContent.related.length > 0 && (
          <>
            <Separator />
            <div data-testid="section-related-parts">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
                Related parts in this diagram
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {seoContent.related.map(r => (
                  <Link
                    key={r.partNumberClean}
                    href={localize(`/part/${r.partNumberClean}`)}
                    className="block border rounded-lg p-2.5 hover:bg-accent/40 transition-colors"
                    data-testid={`link-related-${r.partNumberClean}`}
                  >
                    <div className="font-mono text-xs font-semibold">{r.partNumber}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.description}</div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}

        {seoContent?.categoryGuide && (
          <>
            <Separator />
            <div data-testid="section-category-guide">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                {firstVehicle?.categoryName || "Category"} buying guide
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{seoContent.categoryGuide}</p>
            </div>
          </>
        )}

        {seoContent?.faq && seoContent.faq.length > 0 && (
          <>
            <Separator />
            <div data-testid="section-faq">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
                Frequently asked questions
              </h3>
              <div className="space-y-3">
                {seoContent.faq.map((f, i) => (
                  <details
                    key={i}
                    className="border rounded-lg p-3 group"
                    data-testid={`faq-item-${i}`}
                    open={i === 0}
                  >
                    <summary className="font-medium text-sm cursor-pointer list-none flex items-start justify-between gap-2">
                      <span>{f.question}</span>
                      <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </>
        )}

        {partNumberClean && (
          <AiFaqSection
            pageType="part"
            pageKey={partNumberClean}
            locale={activeLocale.code}
          />
        )}
      </div>
    </div>
  );
}
