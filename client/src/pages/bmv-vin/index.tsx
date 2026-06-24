// =============================================================================
// Thin React pages for the bmv.vin vanity host (Task #96, T008).
// =============================================================================
//
// SSR (server/seo/bmv-vin-pages.ts) already produces crawlable HTML for every
// bmv.vin route — these client components only hydrate over that markup so
// links work for the SPA and so users get an interactive VIN input form.
// They intentionally render very little of their own content so the SSR
// markup remains the canonical view; the client just wraps the existing
// SSR output with navigation chrome and an interactive search box.
// =============================================================================

import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { AiFaqSection } from "@/components/AiFaqSection";
import {
  BMV_VIN_BRANDS, BMV_VIN_FACET_KINDS, BRAND_LABEL, FACET_KIND_LABEL,
  type BmvVinBrand, type BmvVinFacetKind,
} from "../../../../shared/bmv-vin/feature-registry";
import { bmvVinLinks } from "../../../../shared/bmv-vin/links";

// Shared input form — used by DecoderHome and BrandDecoderHub.
function VinInputForm({ placeholder = "Paste any 17-character VIN" }: { placeholder?: string }) {
  const [vin, setVin] = useState("");
  const [, navigate] = useLocation();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (cleaned.length === 17) navigate(`/${cleaned}`);
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-center">
      <Input
        data-testid="input-vin"
        value={vin}
        onChange={e => setVin(e.target.value)}
        placeholder={placeholder}
        maxLength={17}
        className="font-mono uppercase max-w-md"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      <Button data-testid="button-decode" type="submit" disabled={vin.trim().length !== 17}>
        Decode
      </Button>
    </form>
  );
}

function Crumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="text-xs text-muted-foreground mb-3" data-testid="crumb-bmv-vin">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1">›</span>}
          {it.href
            ? <Link href={it.href} className="hover:underline">{it.label}</Link>
            : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// ------------------------------------ Decoder home --------------------------
export function DecoderHome() {
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid="page-decoder-home">
      <Helmet><title>VIN Decoder for BMW Group — bmv.vin</title></Helmet>
      <h1 className="text-3xl font-bold mb-2">Decode your BMW Group VIN</h1>
      <p className="text-muted-foreground mb-4">BMW · MINI · ALPINA · Rolls-Royce · Motorrad. Free, no signup.</p>
      <Card className="mb-6"><CardContent className="p-4"><VinInputForm /></CardContent></Card>
      <h2 className="text-xl font-semibold mt-6 mb-2">By brand</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
        {BMV_VIN_BRANDS.map(b => (
          <Link key={b} href={`/decoder/${b}`} data-testid={`link-brand-${b}`}>
            <Card className="hover-elevate"><CardContent className="p-3 text-center font-medium">{BRAND_LABEL[b]}</CardContent></Card>
          </Link>
        ))}
      </div>
      <h2 className="text-xl font-semibold mt-6 mb-2">By facet</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
        {BMV_VIN_FACET_KINDS.map(k => (
          <Link key={k} href={`/${k}`} data-testid={`link-facet-${k}`}>
            <Card className="hover-elevate"><CardContent className="p-3 text-center font-medium">{FACET_KIND_LABEL[k]}</CardContent></Card>
          </Link>
        ))}
      </div>
      <div className="flex gap-4 mt-6">
        <Link href="/guide" data-testid="link-guide-index" className="text-primary hover:underline">Guide library</Link>
        <Link href="/glossary" data-testid="link-glossary-index" className="text-primary hover:underline">Glossary</Link>
      </div>
    </div>
  );
}

// ------------------------------------ Brand decoder --------------------------
export function BrandDecoderHub() {
  const [, params] = useRoute("/decoder/:brand");
  const brand = (params?.brand ?? "bmw") as BmvVinBrand;
  const label = BRAND_LABEL[brand] || brand;
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid={`page-brand-decoder-${brand}`}>
      <Helmet><title>{label} VIN Decoder — bmv.vin</title></Helmet>
      <Crumb items={[{ label: "Decoder", href: "/" }, { label }]} />
      <h1 className="text-3xl font-bold mb-2">{label} VIN decoder</h1>
      <Card className="mb-6"><CardContent className="p-4"><VinInputForm placeholder={`Paste a ${label} VIN`} /></CardContent></Card>
    </div>
  );
}

// ------------------------------------ Facet index/hub ------------------------
export function FacetIndex() {
  const [, params] = useRoute("/:kind");
  const kind = (params?.kind ?? "chassis") as BmvVinFacetKind;
  const label = FACET_KIND_LABEL[kind] || kind;
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid={`page-facet-index-${kind}`}>
      <Helmet><title>{label} hubs — bmv.vin</title></Helmet>
      <Crumb items={[{ label: "Decoder", href: "/" }, { label }]} />
      <h1 className="text-3xl font-bold mb-2">Browse by {label.toLowerCase()}</h1>
      <p className="text-muted-foreground">See the SSR-rendered list above for the cohort directory.</p>
    </div>
  );
}

export function FacetHub() {
  const [, params] = useRoute("/:kind/:value");
  const [currentPath] = useLocation();
  const kind = (params?.kind ?? "chassis") as BmvVinFacetKind;
  const value = params?.value ?? "";
  const label = FACET_KIND_LABEL[kind] || kind;

  // Derive locale from URL path (e.g. /de/chassis/E46 → de-DE).
  // bmv.vin uses the same locale prefix convention as bmv.parts.
  const localeMatch = currentPath.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\//);
  const locale = localeMatch ? localeMatch[1] : "en";

  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid={`page-facet-hub-${kind}-${value}`}>
      <Helmet><title>{label} {value} — bmv.vin</title></Helmet>
      <Crumb items={[
        { label: "Decoder", href: "/" },
        { label, href: `/${kind}` },
        { label: value },
      ]} />
      <h1 className="text-3xl font-bold mb-2">{label}: {value}</h1>
      {kind && value && (
        <AiFaqSection
          pageType="facet"
          pageKey={`${kind}:${value.toLowerCase()}`}
          locale={locale}
        />
      )}
    </div>
  );
}

// ------------------------------------ Guides ---------------------------------
type Guide = { id: number; slug: string; title: any; summary: any; updatedAt: string | null };

function pickEn(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.en || Object.values(v)[0] || "";
}

export function GuideIndex() {
  const { data, isLoading } = useQuery<{ guides: Guide[] }>({ queryKey: ["/api/bmv-vin/guides"] });
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid="page-guide-index">
      <Helmet><title>Guide library — bmv.vin</title></Helmet>
      <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Guides" }]} />
      <h1 className="text-3xl font-bold mb-4">Guide library</h1>
      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      <div className="grid gap-3">
        {(data?.guides ?? []).map(g => (
          <Link key={g.id} href={`/guide/${g.slug}`} data-testid={`link-guide-${g.slug}`}>
            <Card className="hover-elevate">
              <CardHeader className="pb-1"><CardTitle className="text-base">{pickEn(g.title)}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground pt-0">{pickEn(g.summary)}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GuideDetail() {
  const [, params] = useRoute("/guide/:slug");
  const slug = params?.slug ?? "";
  const { data } = useQuery<{ guide: Guide | null }>({
    queryKey: ["/api/bmv-vin/guides", slug],
    enabled: !!slug,
  });
  return (
    <div className="container mx-auto p-6 max-w-3xl" data-testid={`page-guide-${slug}`}>
      <Helmet><title>{pickEn(data?.guide?.title) || "Guide"} — bmv.vin</title></Helmet>
      <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Guides", href: "/guide" }, { label: pickEn(data?.guide?.title) || slug }]} />
      <h1 className="text-3xl font-bold mb-2">{pickEn(data?.guide?.title) || slug}</h1>
      <p className="text-muted-foreground">See the SSR-rendered article above.</p>
    </div>
  );
}

// ------------------------------------ Glossary -------------------------------
type Term = { id: number; term: string; termSet: string | null; display: any; definition: any };

export function GlossaryIndex() {
  const { data, isLoading } = useQuery<{ terms: Term[] }>({ queryKey: ["/api/bmv-vin/glossary"] });
  const grouped = (data?.terms ?? []).reduce<Record<string, Term[]>>((acc, t) => {
    const k = t.termSet || "other";
    (acc[k] ||= []).push(t);
    return acc;
  }, {});
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid="page-glossary-index">
      <Helmet><title>Glossary — bmv.vin</title></Helmet>
      <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Glossary" }]} />
      <h1 className="text-3xl font-bold mb-4">Glossary</h1>
      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {Object.entries(grouped).map(([set, terms]) => (
        <section key={set} className="mb-6">
          <h2 className="text-lg font-semibold mb-2">{set}</h2>
          <div className="flex flex-wrap gap-2">
            {terms.map(t => (
              <Link key={t.id} href={`/glossary/${t.term}`} data-testid={`link-term-${t.term}`}>
                <Badge variant="outline" className="hover-elevate">{pickEn(t.display) || t.term}</Badge>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function GlossaryTerm() {
  const [, params] = useRoute("/glossary/:term");
  const term = params?.term ?? "";
  const { data } = useQuery<{ term: Term | null }>({
    queryKey: ["/api/bmv-vin/glossary", term],
    enabled: !!term,
  });
  return (
    <div className="container mx-auto p-6 max-w-3xl" data-testid={`page-term-${term}`}>
      <Helmet><title>{pickEn(data?.term?.display) || term} — bmv.vin glossary</title></Helmet>
      <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Glossary", href: "/glossary" }, { label: pickEn(data?.term?.display) || term }]} />
      <h1 className="text-3xl font-bold mb-2">{pickEn(data?.term?.display) || term}</h1>
      <p className="text-muted-foreground">See the SSR-rendered definition above.</p>
    </div>
  );
}

// =============================================================================
// SEO Growth Engine thin-hydration components (Task #259, Templates A/B/E/F)
// =============================================================================
// These components hydrate over the server-rendered HTML produced by
// server/seo/vin-tool-seo.ts. They render minimal client markup so the SSR
// content stays the authoritative crawlable view; the client adds the
// interactive VIN input form and navigation chrome.

// Template A: VIN tool landing pages (/bmw-vin-decoder, /bmw-build-sheet-lookup, …)
export function VinToolPage() {
  const [currentPath] = useLocation();
  const slug = currentPath.replace(/^\//, "");
  const title = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid={`page-vin-tool-${slug}`}>
      <Helmet>
        <title>{title} — bmv.vin</title>
        <link rel="canonical" href={`https://bmv.vin/${slug}`} />
      </Helmet>
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-muted-foreground mb-4">
        Free BMW lookup tool — enter any 17-character VIN to get instant results.
      </p>
      <Card className="mb-6">
        <CardContent className="p-4"><VinInputForm /></CardContent>
      </Card>
    </div>
  );
}

// Template B: model-specific VIN decoder pages (/bmw-{chassis}-vin-decoder)
// Template C: model landing pages (/bmw-{model}, e.g. /bmw-m3, /bmw-3-series)
export function ModelVinPage() {
  const [currentPath] = useLocation();
  const vinDecoderMatch = currentPath.match(/^\/bmw-([a-z0-9]+)-vin-decoder$/);
  const modelLandingMatch = !vinDecoderMatch ? currentPath.match(/^\/bmw-([a-z0-9-]+)$/) : null;
  const chassis = vinDecoderMatch ? vinDecoderMatch[1].toUpperCase() : "";
  const modelSlug = modelLandingMatch ? modelLandingMatch[1] : "";
  const modelName = modelSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  if (vinDecoderMatch) {
    return (
      <div className="container mx-auto p-6 max-w-4xl" data-testid={`page-model-vin-${chassis.toLowerCase()}`}>
        <Helmet>
          <title>BMW {chassis} VIN Decoder — bmv.vin</title>
          <link rel="canonical" href={`https://bmv.vin/bmw-${chassis.toLowerCase()}-vin-decoder`} />
        </Helmet>
        <h1 className="text-2xl font-bold mb-2">BMW {chassis} VIN Decoder</h1>
        <p className="text-muted-foreground mb-4">
          Decode any BMW {chassis} VIN — get build sheet, options, paint code, and production date.
        </p>
        <Card className="mb-6">
          <CardContent className="p-4">
            <VinInputForm placeholder={`Paste a BMW ${chassis} VIN (17 characters)`} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid={`page-model-landing-${modelSlug || "unknown"}`}>
      <Helmet>
        <title>{modelName ? `BMW ${modelName} VIN Lookup` : "BMW VIN Lookup"} — bmv.vin</title>
        {modelSlug && <link rel="canonical" href={`https://bmv.vin/bmw-${modelSlug}`} />}
      </Helmet>
      {modelName && <h1 className="text-2xl font-bold mb-2">BMW {modelName} VIN Lookup</h1>}
      <p className="text-muted-foreground mb-4">
        {modelName
          ? `Decode any BMW ${modelName} VIN instantly — get build sheet, options, paint code, production date, and more.`
          : "Free BMW lookup tool — enter any 17-character VIN to get instant results."}
      </p>
      <Card className="mb-6">
        <CardContent className="p-4">
          <VinInputForm
            placeholder={modelName ? `Paste a BMW ${modelName} VIN (17 characters)` : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Template E: comparison pages (/compare/:slug)
export function ComparePage() {
  const [, params] = useRoute("/compare/:slug");
  const slug = params?.slug ?? "";
  const title = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid={`page-compare-${slug}`}>
      <Helmet>
        <title>{title} — bmv.vin</title>
        <link rel="canonical" href={`https://bmv.vin/compare/${slug}`} />
      </Helmet>
      <Card className="mb-6">
        <CardContent className="p-4"><VinInputForm /></CardContent>
      </Card>
    </div>
  );
}

// Template F: statistics/data pages (/data/:slug)
export function DataPage() {
  const [, params] = useRoute("/data/:slug");
  const slug = params?.slug ?? "";
  const title = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid={`page-data-${slug}`}>
      <Helmet>
        <title>{title} — BMW VIN Data | bmv.vin</title>
        <link rel="canonical" href={`https://bmv.vin/data/${slug}`} />
      </Helmet>
      <Card className="mb-6">
        <CardContent className="p-4"><VinInputForm /></CardContent>
      </Card>
    </div>
  );
}
