import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AiFaqSection } from "@/components/AiFaqSection";
import { SEO } from "@/components/SEO";
import { CLIENT_LOCALES, splitLocaleFromPath, useLocalizedHref, withLocalePrefix } from "@/lib/locale";
import { getPack } from "@shared/i18n";
import type { HubLabels } from "@shared/i18n/types";
import {
  Car as CarIcon, Package, ChevronRight, Layers, ArrowLeft
} from "lucide-react";
import type { Car } from "@shared/schema";

interface SeriesData {
  slug: string;
  name: string;
  totalCars: number;
  totalParts: number;
  chassisCodes: string[];
  yearStart: number | null;
  yearEnd: number | null;
  cars: Car[];
}

interface HubSeoPayload {
  slug: string;
  name: string;
  chassisCodes: string[];
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

function generateSeriesDescription(data: SeriesData): string {
  const parts = [`Browse the complete BMW ${data.name} parts catalog`];
  if (data.chassisCodes.length > 0) {
    parts.push(`spanning ${data.chassisCodes.length} chassis generation${data.chassisCodes.length > 1 ? "s" : ""} (${data.chassisCodes.join(", ")})`);
  }
  if (data.yearStart && data.yearEnd) {
    parts.push(`from ${data.yearStart} to ${data.yearEnd}`);
  }
  parts.push(`with ${data.totalParts.toLocaleString()} OEM parts across ${data.totalCars} model variants.`);
  return parts.join(" ");
}

function CarRow({ car, labels }: { car: Car; labels: HubLabels }) {
  const localize = useLocalizedHref();
  return (
    <Link href={localize(`/car/${car.slug || car.id}`)} className="block">
      <Card className="hover-elevate" data-testid={`card-series-car-${car.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <img
                src={`/images/cars/${car.chassis.toLowerCase()}.jpg`}
                alt={car.displayName}
                className="h-8 w-auto object-contain"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>';
                }}
                data-testid={`img-series-car-${car.id}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate" data-testid={`text-car-name-${car.id}`}>{car.displayName}</div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                <span className="font-mono">{car.chassis}</span>
                {car.engine && <span>{car.engine}</span>}
                <span>{car.bodyType}</span>
                {car.yearStart && (
                  <span>{car.yearStart}{car.yearEnd ? `–${car.yearEnd}` : "+"}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="text-sm font-bold tabular-nums" data-testid={`text-parts-count-${car.id}`}>
                  {(car.totalParts ?? 0) > 0 ? (car.totalParts ?? 0).toLocaleString() : "—"}
                </div>
                <div className="text-xs text-muted-foreground">{labels.stats.parts}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ChassisSection({ chassisCode, cars, labels }: { chassisCode: string; cars: Car[]; labels: HubLabels }) {
  const totalParts = cars.reduce((sum: number, c) => sum + (c.totalParts ?? 0), 0);
  const yearStart = Math.min(...cars.map(c => c.yearStart ?? 9999).filter(y => y !== 9999));
  const yearEnd = Math.max(...cars.map(c => c.yearEnd ?? 0).filter(y => y !== 0));

  return (
    <div className="mb-6" data-testid={`section-chassis-${chassisCode.toLowerCase()}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="text-lg font-bold">{chassisCode}</h2>
        <Badge variant="secondary">{labels.sections.modelsCount(cars.length)}</Badge>
        {totalParts > 0 && (
          <span className="text-xs text-muted-foreground">{totalParts.toLocaleString()} {labels.sections.partsLowercase}</span>
        )}
        {yearStart !== 9999 && yearEnd !== 0 && (
          <span className="text-xs text-muted-foreground">{yearStart}–{yearEnd}</span>
        )}
      </div>
      <div className="grid gap-2">
        {cars.map(car => (
          <CarRow key={car.id} car={car} labels={labels} />
        ))}
      </div>
    </div>
  );
}

export default function SeriesLanding() {
  const params = useParams<{ seriesSlug: string }>();
  const seriesSlug = params.seriesSlug;
  const [currentPath] = useLocation();
  const { locale: activeLocale } = splitLocaleFromPath(currentPath);
  const localize = useLocalizedHref();
  const labels = getPack(activeLocale.code).hubLabels;
  const seoAlternates = seriesSlug
    ? CLIENT_LOCALES.map(l => ({
        bcp47: l.bcp47,
        path: withLocalePrefix(l.prefix, `/series/${seriesSlug}`),
      }))
    : undefined;

  const { data, isLoading, error } = useQuery<SeriesData>({
    queryKey: ["/api/series", seriesSlug],
    enabled: !!seriesSlug,
    retry: 1,
  });

  const { data: seo } = useQuery<HubSeoPayload>({
    queryKey: ["/api/series/seo", seriesSlug, activeLocale.code],
    queryFn: async () => {
      const res = await fetch(
        `/api/series/seo/${encodeURIComponent(seriesSlug!)}?locale=${encodeURIComponent(activeLocale.code)}`,
      );
      if (!res.ok) throw new Error("seo unavailable");
      return res.json();
    },
    enabled: !!seriesSlug && !!data,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-6" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <SEO
          title={labels.notFound.seriesMetaTitle}
          path={`/series/${seriesSlug}`}
          noIndex
        />
        <h1 className="text-2xl font-bold mb-2">{labels.notFound.seriesHeading}</h1>
        <p className="text-muted-foreground mb-4">
          {labels.notFound.seriesMessage(seriesSlug ?? "")}
        </p>
        <Button variant="outline" asChild>
          <Link href={localize("/")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {labels.notFound.backToHome}
          </Link>
        </Button>
      </div>
    );
  }

  const description = generateSeriesDescription(data);

  const carsByChassis = new Map<string, Car[]>();
  for (const car of data.cars) {
    const ch = car.chassis || "Other";
    if (!carsByChassis.has(ch)) carsByChassis.set(ch, []);
    carsByChassis.get(ch)!.push(car);
  }
  const chassisEntries = Array.from(carsByChassis.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <SEO
        title={seo?.content.metaTitle || `BMW ${data.name} Parts Catalog — All Generations & OEM Parts`}
        description={seo?.content.metaDescription || description}
        path={withLocalePrefix(activeLocale.prefix, `/series/${seriesSlug}`)}
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
        breadcrumbs={[
          { name: labels.breadcrumbs.home, url: "/" },
          { name: labels.breadcrumbs.models, url: "/models" },
          { name: `BMW ${data.name}`, url: `/series/${seriesSlug}` },
        ]}
      />

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Link href={localize("/")} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-breadcrumb-home">
            {labels.breadcrumbs.home}
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{labels.breadcrumbs.series}</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium">{data.name}</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-series-title">
          BMW {data.name} Parts Catalog
        </h1>
        <p className="text-muted-foreground mt-1 text-sm" data-testid="text-series-description">
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

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <CarIcon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums" data-testid="text-stat-cars">{data.totalCars}</div>
              <div className="text-xs text-muted-foreground">{labels.stats.models}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Layers className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums" data-testid="text-stat-chassis">{data.chassisCodes.length}</div>
              <div className="text-xs text-muted-foreground">{labels.stats.generations}</div>
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
      </div>

      {data.chassisCodes.length > 1 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {data.chassisCodes.map(code => (
            <Badge key={code} variant="outline" className="font-mono" data-testid={`badge-chassis-${code.toLowerCase()}`}>
              {code}
            </Badge>
          ))}
        </div>
      )}

      {chassisEntries.map(([chassisCode, cars]) => (
        <ChassisSection key={chassisCode} chassisCode={chassisCode} cars={cars} labels={labels} />
      ))}

      {seo && seo.content.topCategories.length > 0 && (
        <section className="mt-8" data-testid="section-top-categories">
          <h2 className="text-lg font-semibold mb-3">{labels.sections.mostStockedCategories(data.name)}</h2>
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
          <h2 className="text-lg font-semibold mb-3">{labels.sections.chassisInThisSeries}</h2>
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

      {seriesSlug && (
        <AiFaqSection
          pageType="series"
          pageKey={seriesSlug}
          locale={activeLocale.code}
        />
      )}
    </div>
  );
}
