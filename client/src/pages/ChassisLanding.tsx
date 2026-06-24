import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { SEO } from "@/components/SEO";
import { CLIENT_LOCALES, splitLocaleFromPath, useLocalizedHref, withLocalePrefix } from "@/lib/locale";
import { getPack } from "@shared/i18n";
import type { HubLabels } from "@shared/i18n/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AiFaqSection } from "@/components/AiFaqSection";
import {
  ChevronRight, Package, Car as CarIcon, Layers, ArrowLeft
} from "lucide-react";

interface HubSeoPayload {
  chassis?: string;
  slug?: string;
  name?: string;
  series?: string | null;
  chassisCodes?: string[];
  content: {
    intro: string;
    metaTitle: string;
    metaDescription: string;
    topCategories: { name: string; partCount: number }[];
    relatedChassis: { chassis: string; series: string | null; carCount: number; totalParts: number; yearStart: number | null; yearEnd: number | null }[];
    faq: { question: string; answer: string }[];
    editorialBlurb: string | null;
    jsonLd: Record<string, any>;
  };
}

interface ChassisCarInfo {
  id: number;
  displayName: string;
  slug: string | null;
  engine: string | null;
  bodyType: string;
  yearStart: number | null;
  yearEnd: number | null;
  totalParts: number | null;
  series: string;
  imageUrl: string | null;
  totalCategories: number | null;
  totalSubcategories: number | null;
}

interface ChassisData {
  chassis: string;
  carCount: number;
  totalParts: number;
  yearStart: number | null;
  yearEnd: number | null;
  cars: ChassisCarInfo[];
}

const CHASSIS_DESCRIPTIONS: Record<string, string> = {
  E12: "The E12 was BMW's first 5 Series, produced from 1972 to 1981. It established the executive sedan segment for BMW.",
  E21: "The E21 was the first generation of the BMW 3 Series, produced from 1975 to 1983. It replaced the BMW 2002 and became one of BMW's most iconic lineups.",
  E23: "The E23 was the first generation BMW 7 Series, produced from 1977 to 1987. It was BMW's flagship luxury sedan.",
  E24: "The E24 was the first generation BMW 6 Series, a grand tourer produced from 1976 to 1989.",
  E26: "The E26 was the chassis designation for the legendary BMW M1, produced from 1978 to 1981.",
  E28: "The E28 was the second generation BMW 5 Series, produced from 1981 to 1988. It included the first M5.",
  E30: "The E30 was the second generation BMW 3 Series, produced from 1982 to 1994. It's one of the most beloved BMWs ever made and includes the iconic E30 M3.",
  E31: "The E31 was the second generation BMW 8 Series grand tourer, produced from 1990 to 1999.",
  E32: "The E32 was the second generation BMW 7 Series, produced from 1986 to 1994.",
  E34: "The E34 was the third generation BMW 5 Series, produced from 1988 to 1996. Known for its excellent build quality and driving dynamics.",
  E36: "The E36 was the third generation BMW 3 Series, produced from 1990 to 2000. It brought significant modernization and the M3 variant became legendary.",
  E38: "The E38 was the third generation BMW 7 Series, produced from 1994 to 2001. Often considered the most elegant 7 Series ever made.",
  E39: "The E39 was the fourth generation BMW 5 Series, produced from 1995 to 2003. Widely regarded as one of the best sports sedans ever made, especially the M5.",
  E46: "The E46 was the fourth generation BMW 3 Series, produced from 1998 to 2006. It refined the 3 Series formula and the M3 became an automotive icon.",
  E52: "The E52 was the chassis code for the BMW Z8 roadster, produced from 2000 to 2003.",
  E53: "The E53 was the first generation BMW X5, produced from 1999 to 2006. It pioneered BMW's Sports Activity Vehicle concept.",
  E60: "The E60 was the fifth generation BMW 5 Series, produced from 2003 to 2010. Known for its controversial styling and advanced technology.",
  E63: "The E63/E64 was the second generation BMW 6 Series, produced from 2003 to 2010.",
  E65: "The E65/E66 was the fourth generation BMW 7 Series, produced from 2001 to 2008.",
  E70: "The E70 was the second generation BMW X5, produced from 2006 to 2013.",
  E71: "The E71 was the first generation BMW X6, produced from 2008 to 2014.",
  E82: "The E82 was the first generation BMW 1 Series Coupe, produced from 2007 to 2013.",
  E83: "The E83 was the first generation BMW X3, produced from 2003 to 2010.",
  E84: "The E84 was the first generation BMW X1, produced from 2009 to 2015.",
  E85: "The E85/E86 was the second generation BMW Z4 roadster/coupe, produced from 2002 to 2008.",
  E87: "The E87 was the first generation BMW 1 Series hatchback, produced from 2004 to 2011.",
  E89: "The E89 was the second generation BMW Z4 (roadster only), produced from 2009 to 2016.",
  E90: "The E90/E91/E92/E93 was the fifth generation BMW 3 Series, produced from 2004 to 2013.",
  F01: "The F01/F02 was the fifth generation BMW 7 Series, produced from 2008 to 2015.",
  F06: "The F06 was the BMW 6 Series Gran Coupe, produced from 2012 to 2018.",
  F10: "The F10/F11 was the sixth generation BMW 5 Series, produced from 2010 to 2017.",
  F15: "The F15 was the third generation BMW X5, produced from 2013 to 2018.",
  F16: "The F16 was the second generation BMW X6, produced from 2014 to 2019.",
  F20: "The F20/F21 was the second generation BMW 1 Series, produced from 2011 to 2019.",
  F22: "The F22/F23 was the first generation BMW 2 Series Coupe/Convertible, produced from 2014 to 2021.",
  F25: "The F25 was the second generation BMW X3, produced from 2010 to 2017.",
  F26: "The F26 was the first generation BMW X4, produced from 2014 to 2018.",
  F30: "The F30/F31 was the sixth generation BMW 3 Series, produced from 2012 to 2019.",
  F32: "The F32/F33/F36 was the first generation BMW 4 Series, produced from 2013 to 2020.",
  F39: "The F39 was the first generation BMW X2, produced from 2017 to 2023.",
  F40: "The F40 was the third generation BMW 1 Series, produced from 2019 onwards.",
  F44: "The F44 was the BMW 2 Series Gran Coupe, produced from 2019 onwards.",
  F48: "The F48 was the second generation BMW X1, produced from 2015 to 2022.",
  F80: "The F80/F82/F83 was the fourth generation BMW M3/M4, produced from 2014 to 2020. Known for its twin-turbo inline-six S55 engine.",
  F87: "The F87 was the first generation BMW M2, produced from 2015 to 2021.",
  F90: "The F90 was the fifth generation BMW M5, produced from 2017 to 2023.",
  F91: "The F91/F92/F93 was the second generation BMW M8, produced from 2019 onwards.",
  F95: "The F95 was the BMW X5 M (F95), produced from 2019 onwards.",
  F96: "The F96 was the BMW X6 M, produced from 2019 onwards.",
  F97: "The F97 was the BMW X3 M, produced from 2019 to 2023.",
  F98: "The F98 was the BMW X4 M, produced from 2019 to 2023.",
  G01: "The G01 was the third generation BMW X3, produced from 2017 to 2024.",
  G02: "The G02 was the second generation BMW X4, produced from 2018 to 2023.",
  G05: "The G05 was the fourth generation BMW X5, produced from 2018 onwards.",
  G06: "The G06 was the third generation BMW X6, produced from 2019 onwards.",
  G07: "The G07 was the first generation BMW X7, produced from 2018 onwards.",
  G11: "The G11/G12 was the sixth generation BMW 7 Series, produced from 2015 to 2022.",
  G14: "The G14/G15/G16 was the second generation BMW 8 Series, produced from 2018 onwards.",
  G20: "The G20/G21 was the seventh generation BMW 3 Series, produced from 2018 onwards.",
  G22: "The G22/G23/G26 was the second generation BMW 4 Series, produced from 2020 onwards.",
  G29: "The G29 was the third generation BMW Z4, produced from 2018 onwards.",
  G30: "The G30/G31 was the seventh generation BMW 5 Series, produced from 2017 to 2023.",
  G42: "The G42 was the second generation BMW 2 Series Coupe, produced from 2021 onwards.",
  G70: "The G70 was the eighth generation BMW 7 Series, produced from 2022 onwards.",
  G80: "The G80/G82/G83 was the fifth generation BMW M3/M4, produced from 2020 onwards. Features the S58 twin-turbo inline-six engine.",
  G87: "The G87 is the second generation BMW M2, produced from 2022 onwards.",
};

function getChassisDescription(chassis: string): string {
  const code = chassis.toUpperCase();
  if (CHASSIS_DESCRIPTIONS[code]) return CHASSIS_DESCRIPTIONS[code];
  const prefix = code[0];
  if (prefix === "E") return `The ${chassis} is a BMW chassis code from the E-generation era, known for classic BMW engineering and driving dynamics.`;
  if (prefix === "F") return `The ${chassis} is a BMW chassis code from the F-generation, featuring modern technology and refined driving characteristics.`;
  if (prefix === "G") return `The ${chassis} is a BMW chassis code from the latest G-generation, incorporating cutting-edge technology and design.`;
  return `The ${chassis} is a BMW chassis designation covering various models in the BMW lineup.`;
}

function getChassisGeneration(chassis: string): string {
  const prefix = chassis.toUpperCase()[0];
  if (prefix === "E") return "E-Generation (Classic/Heritage)";
  if (prefix === "F") return "F-Generation (Modern)";
  if (prefix === "G") return "G-Generation (Current)";
  return "Other";
}

function CarRow({ car, labels }: { car: ChassisCarInfo; labels: HubLabels }) {
  const localize = useLocalizedHref();
  const hasParts = (car.totalParts || 0) > 0;

  return (
    <Card className="hover-elevate" data-testid={`card-chassis-car-${car.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <Link href={localize(`/car/${car.slug || car.id}`)} className="block">
              <h3 className="font-semibold text-base" data-testid={`text-car-name-${car.id}`}>{car.displayName}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {car.engine && (
                  <span className="text-sm text-muted-foreground" data-testid={`text-car-engine-${car.id}`}>{car.engine}</span>
                )}
                <span className="text-sm text-muted-foreground">{car.bodyType}</span>
                {car.yearStart && (
                  <span className="text-sm text-muted-foreground">
                    {car.yearStart}{car.yearEnd ? `–${car.yearEnd}` : "+"}
                  </span>
                )}
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums" data-testid={`text-car-parts-${car.id}`}>
                {hasParts ? (car.totalParts || 0).toLocaleString() : "—"}
              </div>
              <div className="text-xs text-muted-foreground">{labels.sections.partsLowercase}</div>
            </div>
            {hasParts && (
              <Button size="sm" variant="outline" asChild data-testid={`button-browse-car-${car.id}`}>
                <Link href={localize(`/car/${car.slug || car.id}`)}>
                  {labels.sections.browse} <ChevronRight className="w-3 h-3 ml-0.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ChassisLanding() {
  const params = useParams<{ chassisCode: string }>();
  const chassisCode = params.chassisCode || "";
  const [currentPath] = useLocation();
  const { locale: activeLocale } = splitLocaleFromPath(currentPath);
  const localize = useLocalizedHref();
  const labels = getPack(activeLocale.code).hubLabels;
  const seoAlternates = chassisCode
    ? CLIENT_LOCALES.map(l => ({
        bcp47: l.bcp47,
        path: withLocalePrefix(l.prefix, `/chassis/${chassisCode}`),
      }))
    : undefined;

  const { data, isLoading, error } = useQuery<ChassisData>({
    queryKey: ["/api/chassis", chassisCode],
    enabled: !!chassisCode,
    retry: 1,
  });

  const { data: seo } = useQuery<HubSeoPayload>({
    queryKey: ["/api/chassis/seo", chassisCode, activeLocale.code],
    queryFn: async () => {
      const res = await fetch(
        `/api/chassis/seo/${encodeURIComponent(chassisCode)}?locale=${encodeURIComponent(activeLocale.code)}`,
      );
      if (!res.ok) throw new Error("seo unavailable");
      return res.json();
    },
    enabled: !!chassisCode && !!data,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const chassisUpper = data?.chassis || chassisCode.toUpperCase();
  const description = getChassisDescription(chassisUpper);
  const generation = getChassisGeneration(chassisUpper);

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-96 mb-6" />
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <SEO
          title={labels.notFound.chassisMetaTitle(chassisUpper)}
          description={labels.notFound.chassisMetaDescription(chassisUpper)}
          path={`/chassis/${chassisCode}`}
          noIndex
        />
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="sm" asChild data-testid="button-back-home">
            <Link href={localize("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> {labels.notFound.back}
            </Link>
          </Button>
        </div>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2" data-testid="text-chassis-not-found">{labels.notFound.chassisHeading}</h1>
          <p className="text-muted-foreground">{labels.notFound.chassisMessage(chassisUpper)}</p>
        </div>
      </div>
    );
  }

  const sortedCars = [...data.cars].sort((a, b) => {
    const ya = a.yearStart || 0;
    const yb = b.yearStart || 0;
    if (ya !== yb) return ya - yb;
    return a.displayName.localeCompare(b.displayName);
  });

  const bodyTypes = Array.from(new Set(data.cars.map(c => c.bodyType)));
  const engines = Array.from(new Set(data.cars.map(c => c.engine).filter(Boolean))) as string[];
  const carsWithParts = data.cars.filter(c => (c.totalParts || 0) > 0).length;

  // Localized SEO fallback computed synchronously from the shared i18n pack
  // so the first paint already carries the active-locale <title> and meta
  // description. Without this, the page briefly rendered the English copy
  // until the async /api/chassis/seo query resolved — a window social-share
  // crawlers could snapshot. The async query still runs and overrides this
  // fallback once it returns (e.g. for editorial intro / FAQ blocks).
  const hubPack = getPack(activeLocale.code);
  const hubBuildIn = {
    label: chassisUpper,
    carCount: data.carCount,
    series: data.cars[0]?.series ?? null,
    // Mirror server/seo/content.ts `hubYearRange` (locale-independent year
     // string) so the client fallback metaTitle/Description match the server
     // SEO API exactly. Using the locale pack's formatYearRange would diverge
     // for CJK locales (e.g. zh-CN appends "年").
    years: ((s, e) => {
      if (!s && !e) return "";
      if (!s) return "";
      if (!e) return `${s}+`;
      if (s === e) return `${s}`;
      return `${s}–${e}`;
    })(data.yearStart ?? null, data.yearEnd ?? null),
    totalParts: data.totalParts,
    totalPartsFmt: data.totalParts.toLocaleString(),
    topCategoryNames: [],
    topCategoriesWithCounts: [],
    relatedChassisCodes: [],
  };
  const hubFallbackTitle = hubPack.buildHubChassisMetaTitle(hubBuildIn);
  const hubFallbackDescription = hubPack.buildHubChassisMetaDescription(hubBuildIn);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <SEO
        title={seo?.content.metaTitle || hubFallbackTitle}
        description={seo?.content.metaDescription || hubFallbackDescription}
        path={withLocalePrefix(activeLocale.prefix, `/chassis/${chassisCode}`)}
        locale={activeLocale.bcp47}
        alternates={seoAlternates}
        structuredData={seo ? [
          seo.content.jsonLd,
          ...(seo.content.faq.length > 0 ? [{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: seo.content.faq.map(f => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          }] : []),
        ] : undefined}
        breadcrumbs={(() => {
          const seriesValues = Array.from(new Set(data.cars.map(c => c.series).filter(Boolean)));
          const primarySeries = seriesValues.length === 1 ? seriesValues[0] : null;
          return [
            { name: labels.breadcrumbs.home, url: "/" },
            { name: labels.breadcrumbs.models, url: "/models" },
            ...(primarySeries ? [{ name: `BMW ${primarySeries}`, url: `/series/${primarySeries.toLowerCase().replace(/\s+/g, "-")}` }] : []),
            { name: chassisUpper, url: `/chassis/${chassisCode}` },
          ];
        })()}
      />

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4 flex-wrap">
        <Link href={localize("/")} className="hover:text-foreground transition-colors" data-testid="breadcrumb-home">{labels.breadcrumbs.home}</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-xs">{labels.breadcrumbs.chassis}</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-xs font-medium text-foreground">{chassisUpper}</span>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-chassis-title">BMW {chassisUpper}</h1>
          <Badge variant="secondary" data-testid="badge-generation">{generation}</Badge>
        </div>
        {data.yearStart && (
          <p className="text-sm text-muted-foreground mb-2" data-testid="text-chassis-years">
            {labels.sections.productionYears(`${data.yearStart}${data.yearEnd ? `–${data.yearEnd}` : "+"}`)}
          </p>
        )}
        <p className="text-muted-foreground leading-relaxed" data-testid="text-chassis-description">
          {description}
        </p>
        {seo?.content.intro && (
          <p className="text-sm leading-relaxed mt-3" data-testid="text-hub-intro">
            {seo.content.intro}
          </p>
        )}
        {seo?.content.editorialBlurb && (
          <div
            className="mt-3 border-l-2 border-primary pl-3 text-sm leading-relaxed"
            data-testid="text-hub-editorial"
          >
            {seo.content.editorialBlurb}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <CarIcon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums" data-testid="text-stat-models">{data.carCount}</div>
              <div className="text-xs text-muted-foreground">{labels.stats.models}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums" data-testid="text-stat-parts">{data.totalParts.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{labels.stats.totalParts}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Layers className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums" data-testid="text-stat-body-types">{bodyTypes.length}</div>
              <div className="text-xs text-muted-foreground">{labels.stats.bodyTypes}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <CarIcon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums" data-testid="text-stat-with-parts">{carsWithParts}</div>
              <div className="text-xs text-muted-foreground">{labels.stats.withPartsData}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {bodyTypes.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm text-muted-foreground">{labels.sections.bodyTypesLabel}</span>
          {bodyTypes.map(bt => (
            <Badge key={bt} variant="secondary" data-testid={`badge-bodytype-${bt}`}>{bt}</Badge>
          ))}
        </div>
      )}

      {engines.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-sm text-muted-foreground">{labels.sections.enginesLabel}</span>
          {engines.slice(0, 10).map(eng => (
            <Badge key={eng} variant="outline" data-testid={`badge-engine-${eng}`}>{eng}</Badge>
          ))}
          {engines.length > 10 && (
            <span className="text-xs text-muted-foreground">{labels.sections.moreEngines(engines.length - 10)}</span>
          )}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3" data-testid="text-models-heading">
        {labels.sections.allModelsHeading({ label: chassisUpper, count: data.carCount })}
      </h2>
      <div className="space-y-3">
        {sortedCars.map(car => (
          <CarRow key={car.id} car={car} labels={labels} />
        ))}
      </div>

      {seo && seo.content.topCategories.length > 0 && (
        <section className="mt-8" data-testid="section-top-categories">
          <h2 className="text-lg font-semibold mb-3">{labels.sections.mostStockedCategories(chassisUpper)}</h2>
          <div className="flex flex-wrap gap-2">
            {seo.content.topCategories.map(c => (
              <Badge
                key={c.name}
                variant="outline"
                className="text-xs"
                data-testid={`badge-top-category-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                {c.name} <span className="ml-1 text-muted-foreground tabular-nums">{c.partCount.toLocaleString()}</span>
              </Badge>
            ))}
          </div>
        </section>
      )}

      {seo && seo.content.relatedChassis.length > 0 && (
        <section className="mt-8" data-testid="section-related-chassis">
          <h2 className="text-lg font-semibold mb-3">{labels.sections.relatedChassis}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {seo.content.relatedChassis.map(rc => (
              <Link
                key={rc.chassis}
                href={localize(`/chassis/${rc.chassis.toLowerCase()}`)}
                className="border rounded-md p-2 text-sm hover-elevate"
                data-testid={`link-related-chassis-${rc.chassis.toLowerCase()}`}
              >
                <div className="font-mono font-semibold">{rc.chassis}</div>
                <div className="text-xs text-muted-foreground">
                  {labels.sections.relatedChassisCaption({ carCount: rc.carCount, totalParts: rc.totalParts.toLocaleString() })}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {seo && seo.content.faq.length > 0 && (
        <section className="mt-8" data-testid="section-hub-faq">
          <h2 className="text-lg font-semibold mb-3">{labels.sections.frequentlyAskedQuestions}</h2>
          <div className="space-y-3">
            {seo.content.faq.map((f, i) => (
              <div
                key={i}
                className="border rounded-md p-3"
                data-testid={`faq-item-${i}`}
              >
                <div className="font-medium text-sm" data-testid={`faq-question-${i}`}>{f.question}</div>
                <div className="text-sm text-muted-foreground mt-1" data-testid={`faq-answer-${i}`}>{f.answer}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {chassisCode && (
        <AiFaqSection
          pageType="chassis"
          pageKey={chassisCode.toUpperCase()}
          locale={activeLocale.code}
        />
      )}
    </div>
  );
}
