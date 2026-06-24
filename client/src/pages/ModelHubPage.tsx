/**
 * Template B — Model Hub pages.
 * URL pattern: /hub/:chassis  (e.g. /hub/E46, /hub/F30)
 *
 * Aggregates all data for a BMW chassis: models, categories, part counts.
 * Schema: CollectionPage + Vehicle + BreadcrumbList
 */
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, Car, Search, ArrowRight, Package, Layers } from "lucide-react";
import { Link } from "wouter";

interface ModelVariant {
  id: number;
  modelName: string;
  displayName: string;
  yearStart?: number | null;
  yearEnd?: number | null;
  engine?: string | null;
  totalParts: number;
  slug: string;
}

interface CategorySummary {
  categoryName: string;
  categorySlug: string;
  partCount: number;
}

interface ModelHubData {
  chassis: string;
  generation: string;
  series: string;
  totalParts: number;
  totalModels: number;
  models: ModelVariant[];
  topCategories: CategorySummary[];
}

function buildSchemas(data: ModelHubData) {
  const chassis = data.chassis;
  const url = `https://bmv.parts/hub/${chassis.toLowerCase()}`;
  const title = `BMW ${chassis} Parts Hub`;

  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": title,
    "description": `Complete OEM parts catalog for all BMW ${chassis} variants. ${data.totalParts.toLocaleString()} parts across ${data.totalModels} models.`,
    "url": url,
    "publisher": { "@type": "Organization", "name": "BMV.parts", "url": "https://bmv.parts" },
    "numberOfItems": data.totalParts,
    "hasPart": data.topCategories.slice(0, 10).map(c => ({
      "@type": "CollectionPage",
      "name": `BMW ${chassis} ${c.categoryName} Parts`,
      "url": `https://bmv.parts/parts/${chassis.toLowerCase()}/${c.categorySlug}`,
    })),
  };

  const vehicle = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    "name": `BMW ${chassis}`,
    "brand": { "@type": "Brand", "name": "BMW" },
    "model": chassis,
    "vehicleModelDate": data.models[0]?.yearStart?.toString() || undefined,
    "url": url,
    "description": `BMW ${chassis} ${data.series} series (${data.generation} generation). ${data.totalModels} variants, ${data.totalParts.toLocaleString()} OEM parts available.`,
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://bmv.parts/" },
      { "@type": "ListItem", "position": 2, "name": "Models", "item": "https://bmv.parts/models" },
      { "@type": "ListItem", "position": 3, "name": `BMW ${chassis}`, "item": url },
    ],
  };

  return { collectionPage, vehicle, breadcrumb };
}

export default function ModelHubPage() {
  const { chassis } = useParams<{ chassis: string }>();

  const { data, isLoading, error } = useQuery<ModelHubData>({
    queryKey: ["/api/content/hub", chassis],
    queryFn: async () => {
      const res = await fetch(`/api/content/hub/${chassis}`);
      if (!res.ok) throw new Error("Hub not found");
      return res.json();
    },
    enabled: !!chassis,
  });

  const chassisUpper = (chassis || "").toUpperCase();
  const title = `BMW ${chassisUpper} Parts Hub`;
  const metaDesc = data
    ? `Browse all ${data.totalParts.toLocaleString()} OEM BMW ${chassisUpper} parts across ${data.totalModels} variants. Find brake pads, oil filters, suspension, and more with fitment data and real pricing.`
    : `Complete BMW ${chassisUpper} OEM parts catalog — all models, categories, and part numbers.`;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
          {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Chassis not found</h1>
        <p className="text-muted-foreground mb-4">No catalog data for BMW {chassisUpper}.</p>
        <Link href="/models">
          <Button variant="outline" data-testid="button-goto-models">
            <Car className="w-4 h-4 mr-2" /> Browse All Models
          </Button>
        </Link>
      </div>
    );
  }

  const { collectionPage, vehicle, breadcrumb } = buildSchemas(data);

  return (
    <>
      <Helmet>
        <title>{title} — OEM Parts Catalog | BMV.parts</title>
        <meta name="description" content={metaDesc} />
        <link rel="canonical" href={`https://bmv.parts/hub/${chassis?.toLowerCase()}`} />
        <meta property="og:title" content={`${title} — BMV.parts`} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://bmv.parts/hub/${chassis?.toLowerCase()}`} />
        <script type="application/ld+json">{JSON.stringify(collectionPage)}</script>
        <script type="application/ld+json">{JSON.stringify(vehicle)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6" aria-label="Breadcrumb" data-testid="breadcrumb-model-hub">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/models" className="hover:text-foreground">Models</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">BMW {chassisUpper}</span>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="secondary" data-testid="badge-template-b">
              <Car className="w-3 h-3 mr-1" /> {data.series} Series
            </Badge>
            <Badge variant="outline" data-testid="badge-generation">
              {data.generation} Generation
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2" data-testid="heading-hub-title">
            {title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {data.totalParts.toLocaleString()} OEM parts · {data.totalModels} variants
          </p>
        </div>

        <Separator className="mb-8" />

        {/* Top Categories */}
        {data.topCategories.length > 0 && (
          <section className="mb-10" data-testid="section-categories">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4" /> Part Categories
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.topCategories.map((cat) => (
                <Link
                  key={cat.categorySlug}
                  href={`/parts/${chassis?.toLowerCase()}/${cat.categorySlug}`}
                  data-testid={`card-category-${cat.categorySlug}`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="pt-4 pb-4">
                      <p className="font-medium text-sm text-foreground leading-tight">{cat.categoryName}</p>
                      <p className="text-xs text-muted-foreground mt-1">{cat.partCount.toLocaleString()} parts</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Model Variants */}
        {data.models.length > 0 && (
          <section className="mb-10" data-testid="section-models">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Car className="w-4 h-4" /> {chassisUpper} Variants
            </h2>
            <div className="space-y-2">
              {data.models.map((model) => (
                <Link
                  key={model.id}
                  href={`/search?q=${encodeURIComponent(model.displayName || model.modelName)}`}
                  data-testid={`row-model-${model.id}`}
                >
                  <div className="flex items-center justify-between border rounded-md px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{model.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {model.yearStart && model.yearEnd
                          ? `${model.yearStart}–${model.yearEnd}`
                          : model.yearStart
                            ? `${model.yearStart}+`
                            : "Year N/A"}
                        {model.engine ? ` · ${model.engine}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {model.totalParts.toLocaleString()}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Separator className="my-8" />

        {/* CTA */}
        <Card className="bg-muted/40 border-0" data-testid="card-cta">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Find Your BMW {chassisUpper} Parts</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Decode your VIN for exact-fit parts, or search by part number across all {chassisUpper} variants.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href={`/search?q=${encodeURIComponent(`BMW ${chassisUpper}`)}`}>
                <Button size="sm" data-testid="button-cta-search-hub">
                  <Search className="w-4 h-4 mr-1.5" /> Search Parts
                </Button>
              </Link>
              <Link href="/vin">
                <Button size="sm" variant="outline" data-testid="button-cta-vin">
                  Decode VIN <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
