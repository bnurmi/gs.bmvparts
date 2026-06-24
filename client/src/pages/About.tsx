import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CLIENT_LOCALES, withLocalePrefix, useLocalizedHref } from "@/lib/locale";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  Search,
  Camera,
  Hash,
  Car,
  Package,
  BookOpen,
  ArrowRight,
  HelpCircle,
  Wrench,
  BarChart3,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useT } from "@/lib/i18n";

interface Stats {
  totalCars: number;
  scrapedCars: number;
  totalParts: number;
}

export default function About() {
  const localize = useLocalizedHref();
  const t = useT();
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const FAQ_ITEMS = t.about.faq;

  const aboutAlternates = CLIENT_LOCALES.map(l => ({
    bcp47: l.bcp47,
    path: withLocalePrefix(l.prefix, "/about"),
  }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10" data-testid="page-about">
      <SEO
        title="About BMV.parts — BMW OEM Parts Reference"
        description="Learn about BMV.parts, the comprehensive BMW OEM parts catalog featuring exploded diagrams, part numbers, VIN decoding, and AI part identification. Free to use for all BMW enthusiasts and mechanics."
        path="/about"
        alternates={aboutAlternates}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "About", url: "/about" },
        ]}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map(item => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }}
      />

      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-about-heading">
          {t.about.heading}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed" data-testid="text-about-intro">
          {t.about.intro}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
          {t.about.statsHeading}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card data-testid="stat-total-cars">
            <CardContent className="p-5 flex flex-col items-center gap-2 text-center">
              <Car className="w-8 h-8 text-muted-foreground" />
              <span className="text-3xl font-bold">
                {statsLoading ? <Skeleton className="h-9 w-16 inline-block" /> : (stats?.totalCars?.toLocaleString() ?? "—")}
              </span>
              <span className="text-sm text-muted-foreground">{t.about.statBmwModels}</span>
            </CardContent>
          </Card>
          <Card data-testid="stat-scraped-cars">
            <CardContent className="p-5 flex flex-col items-center gap-2 text-center">
              <Database className="w-8 h-8 text-muted-foreground" />
              <span className="text-3xl font-bold">
                {statsLoading ? <Skeleton className="h-9 w-16 inline-block" /> : (stats?.scrapedCars?.toLocaleString() ?? "—")}
              </span>
              <span className="text-sm text-muted-foreground">{t.about.statFullyCataloged}</span>
            </CardContent>
          </Card>
          <Card data-testid="stat-total-parts">
            <CardContent className="p-5 flex flex-col items-center gap-2 text-center">
              <Package className="w-8 h-8 text-muted-foreground" />
              <span className="text-3xl font-bold">
                {statsLoading ? <Skeleton className="h-9 w-16 inline-block" /> : (stats?.totalParts?.toLocaleString() ?? "—")}
              </span>
              <span className="text-sm text-muted-foreground">{t.about.statOemParts}</span>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Wrench className="w-5 h-5 text-muted-foreground" />
          {t.about.toolsHeading}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="hover-elevate" data-testid="feature-catalog">
            <CardHeader className="flex flex-row items-start gap-3 pb-2">
              <BookOpen className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <CardTitle className="text-base">{t.about.catalogTitle}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pl-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t.about.catalogBody}
              </p>
              <Link href={localize("/")}>
                <Button variant="outline" size="sm" data-testid="link-browse-catalog">
                  {t.about.catalogCta} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="feature-search">
            <CardHeader className="flex flex-row items-start gap-3 pb-2">
              <Search className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <CardTitle className="text-base">{t.about.searchTitle}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pl-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t.about.searchBody}
              </p>
              <Link href={localize("/search")}>
                <Button variant="outline" size="sm" data-testid="link-search">
                  {t.about.searchCta} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="feature-vin">
            <CardHeader className="flex flex-row items-start gap-3 pb-2">
              <Hash className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <CardTitle className="text-base">{t.about.vinTitle}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pl-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t.about.vinBody}
              </p>
              <Link href={localize("/vin")}>
                <Button variant="outline" size="sm" data-testid="link-vin-decoder">
                  {t.about.vinCta} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="feature-ai">
            <CardHeader className="flex flex-row items-start gap-3 pb-2">
              <Camera className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <CardTitle className="text-base">{t.about.aiTitle}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pl-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t.about.aiBody}
              </p>
              <Link href={localize("/part-finder")}>
                <Button variant="outline" size="sm" data-testid="link-part-finder">
                  {t.about.aiCta} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-muted-foreground" />
          {t.about.faqHeading}
        </h2>
        <Accordion type="single" collapsible className="w-full" data-testid="faq-section">
          {FAQ_ITEMS.map((item, index) => (
            <AccordionItem key={index} value={`faq-${index}`} data-testid={`faq-item-${index}`}>
              <AccordionTrigger className="text-left">
                <h3 className="font-medium text-sm">{item.question}</h3>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="space-y-3 pb-8">
        <h2 className="text-2xl font-semibold tracking-tight">{t.about.getStartedHeading}</h2>
        <p className="text-muted-foreground">
          {t.about.getStartedBody}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={localize("/")}>
            <Button data-testid="button-start-browsing">
              {t.about.browseCatalog} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <Link href={localize("/models")}>
            <Button variant="outline" data-testid="button-view-models">
              {t.about.allModels}
            </Button>
          </Link>
          <Link href={localize("/search")}>
            <Button variant="outline" data-testid="button-search-parts">
              {t.about.searchPartsBtn}
            </Button>
          </Link>
          <Link href={localize("/recommended-sites")}>
            <Button variant="outline" data-testid="button-view-friends">
              {t.about.recommendedSitesBtn}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
