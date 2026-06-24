/**
 * Template A — Chassis × Part Category programmatic pages.
 * URL pattern: /parts/:chassis/:category
 * e.g. /parts/E46/brake-pads — "BMW E46 Brake Pads"
 *
 * Renders real catalog parts with Product schema for each part,
 * CollectionPage + BreadcrumbList at the top level.
 */
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, Package, Search, ArrowRight, ShoppingCart } from "lucide-react";
import { Link } from "wouter";

interface CatalogPart {
  id: number;
  partNumber: string;
  description: string;
  categoryName?: string;
  price?: number | null;
  currency?: string;
}

interface ChassisPartData {
  chassis: string;
  category: string;
  categoryDisplay: string;
  parts: CatalogPart[];
  totalParts: number;
  models: string[];
}

function toTitleCase(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function buildSchemas(data: ChassisPartData, chassis: string, category: string) {
  const pageTitle = `BMW ${chassis.toUpperCase()} ${toTitleCase(category)} Parts`;
  const url = `https://bmv.parts/parts/${chassis}/${category}`;

  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": pageTitle,
    "description": `Complete list of OEM BMW ${chassis} ${toTitleCase(category)} parts with part numbers, fitment, and pricing.`,
    "url": url,
    "publisher": { "@type": "Organization", "name": "BMV.parts", "url": "https://bmv.parts" },
    "numberOfItems": data.totalParts,
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://bmv.parts/" },
      { "@type": "ListItem", "position": 2, "name": "Models", "item": "https://bmv.parts/models" },
      { "@type": "ListItem", "position": 3, "name": `BMW ${chassis.toUpperCase()}`, "item": `https://bmv.parts/hub/${chassis.toLowerCase()}` },
      { "@type": "ListItem", "position": 4, "name": toTitleCase(category), "item": url },
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": pageTitle,
    "url": url,
    "numberOfItems": data.parts.length,
    "itemListElement": data.parts.slice(0, 20).map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Product",
        "name": p.description || p.partNumber,
        "sku": p.partNumber,
        "mpn": p.partNumber,
        "brand": { "@type": "Brand", "name": "BMW" },
        "url": `https://bmv.parts/parts/${p.partNumber}`,
        ...(p.price != null ? {
          "offers": {
            "@type": "Offer",
            "price": p.price.toFixed(2),
            "priceCurrency": p.currency || "USD",
            "availability": "https://schema.org/InStock",
            "seller": { "@type": "Organization", "name": "BMV.parts" },
          }
        } : {}),
      },
    })),
  };

  return { collectionPage, breadcrumb, itemList };
}

export default function ChassisPartPage() {
  const { chassis, category } = useParams<{ chassis: string; category: string }>();

  const { data, isLoading, error } = useQuery<ChassisPartData>({
    queryKey: ["/api/content/chassis", chassis, category],
    queryFn: async () => {
      const res = await fetch(`/api/content/chassis/${chassis}/${category}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!chassis && !!category,
  });

  const pageTitle = `BMW ${(chassis || "").toUpperCase()} ${toTitleCase(category || "")} Parts`;
  const metaDesc = `Browse ${data?.totalParts ?? "OEM"} BMW ${(chassis || "").toUpperCase()} ${toTitleCase(category || "")} parts with part numbers, fitment info, and real pricing. In-stock parts for all ${(chassis || "").toUpperCase()} variants.`;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-1 gap-3 mt-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Parts not found</h1>
        <p className="text-muted-foreground mb-4">No catalog data available for this chassis and category.</p>
        <Link href="/search">
          <Button variant="outline" data-testid="button-goto-search">
            <Search className="w-4 h-4 mr-2" /> Search All Parts
          </Button>
        </Link>
      </div>
    );
  }

  const { collectionPage, breadcrumb, itemList } = buildSchemas(data, chassis!, category!);

  return (
    <>
      <Helmet>
        <title>{pageTitle} — OEM BMW Parts | BMV.parts</title>
        <meta name="description" content={metaDesc} />
        <link rel="canonical" href={`https://bmv.parts/parts/${chassis}/${category}`} />
        <meta property="og:title" content={`${pageTitle} — BMV.parts`} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://bmv.parts/parts/${chassis}/${category}`} />
        <script type="application/ld+json">{JSON.stringify(collectionPage)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
        <script type="application/ld+json">{JSON.stringify(itemList)}</script>
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6" aria-label="Breadcrumb" data-testid="breadcrumb-chassis-part">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/models" className="hover:text-foreground">Models</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href={`/hub/${chassis?.toLowerCase()}`} className="hover:text-foreground">
            BMW {(chassis || "").toUpperCase()}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{toTitleCase(category || "")}</span>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <Badge variant="secondary" className="mb-3" data-testid="badge-template-a">
            <Package className="w-3 h-3 mr-1" /> OEM Parts Catalog
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2" data-testid="heading-chassis-part-title">
            {pageTitle}
          </h1>
          <p className="text-muted-foreground text-sm">
            {data.totalParts.toLocaleString()} OEM parts · Fits {data.models.slice(0, 5).join(", ")}{data.models.length > 5 ? ` +${data.models.length - 5} more` : ""}
          </p>
        </div>

        <Separator className="mb-6" />

        {/* Parts list */}
        <div className="space-y-3" data-testid="parts-list-chassis">
          {data.parts.map((part) => (
            <Card key={part.id} className="hover:shadow-sm transition-shadow" data-testid={`card-part-${part.id}`}>
              <CardContent className="pt-4 pb-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-foreground" data-testid={`text-part-number-${part.id}`}>
                    {part.partNumber}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{part.description}</p>
                  {part.categoryName && (
                    <p className="text-xs text-muted-foreground mt-1 opacity-70">{part.categoryName}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {part.price != null && (
                    <span className="text-sm font-medium" data-testid={`text-price-${part.id}`}>
                      {part.currency || "USD"} {part.price.toFixed(2)}
                    </span>
                  )}
                  <Link href={`/search?q=${encodeURIComponent(part.partNumber)}`}>
                    <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-view-part-${part.id}`}>
                      <ShoppingCart className="w-3 h-3 mr-1" /> View
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {data.parts.length === 0 && (
          <div className="text-center py-10 text-muted-foreground" data-testid="empty-chassis-parts">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No parts found for this chassis and category.</p>
          </div>
        )}

        <Separator className="my-8" />

        {/* CTA */}
        <Card className="bg-muted/40 border-0" data-testid="card-cta">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Search All BMW {(chassis || "").toUpperCase()} Parts</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Browse 5M+ OEM parts, decode your VIN to find exact-fit parts, or compare prices across suppliers.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href={`/search?q=${encodeURIComponent(`BMW ${chassis}`)}`}>
                <Button size="sm" data-testid="button-cta-search-chassis">
                  <Search className="w-4 h-4 mr-1.5" /> Search {(chassis || "").toUpperCase()} Parts
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
