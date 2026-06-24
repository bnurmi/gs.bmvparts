import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { CLIENT_LOCALES, splitLocaleFromPath, useLocalizedHref, withLocalePrefix } from "@/lib/locale";
import { useState, useEffect, useRef } from "react";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronRight, ChevronLeft, Search, Package2, Layers, FolderOpen,
  AlertCircle, ArrowLeft, ZoomIn, X
} from "lucide-react";
import type { Car, Category, Subcategory, Part } from "@shared/schema";
import { getPack } from "@shared/i18n";

type SubcategoryWithCount = Subcategory & { partCount: number };
import { localImageUrl } from "@/lib/imageUrl";

function DiagramViewer({ src, alt }: { src: string; alt: string }) {
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) return null;

  return (
    <>
      <div
        className="mb-4 relative group cursor-pointer inline-block"
        onClick={() => setZoomed(true)}
        data-testid="diagram-container"
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full h-auto rounded-md border bg-white p-2"
          style={{ imageRendering: "auto" }}
          onError={() => setFailed(true)}
          data-testid="img-diagram"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors rounded-md">
          <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
        </div>
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
          data-testid="diagram-lightbox"
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-50"
            onClick={() => setZoomed(false)}
            data-testid="button-close-lightbox"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-w-[95vw] max-h-[90vh] object-contain bg-white rounded-lg p-4"
            style={{ imageRendering: "auto" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function PartsTable({ subcategoryId, carId }: { subcategoryId: number; carId: number }) {
  const localize = useLocalizedHref();
  const [search, setSearch] = useState("");

  const { data: parts = [], isLoading } = useQuery<Part[]>({
    queryKey: [`/api/subcategories/${subcategoryId}/parts`],
  });

  const filtered = search
    ? parts.filter(p =>
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        (p.partNumber && p.partNumber.toLowerCase().includes(search.toLowerCase())) ||
        (p.partNumberClean && p.partNumberClean.includes(search.replace(/\s/g, '')))
      )
    : parts;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Package2 className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground text-sm">No parts data available</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Try syncing this car first</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter parts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-parts-filter"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {filtered.length} of {parts.length} parts
        </p>
      </div>

      <div className="border rounded-md overflow-hidden">
        <ScrollArea className="max-h-[500px]">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">No matches found</div>
          ) : (
            filtered.map((part, i) => (
              <div
                key={part.id}
                className={`px-3 py-2.5 border-b last:border-0 hover:bg-accent/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                data-testid={`row-part-${part.id}`}
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-muted-foreground tabular-nums font-mono text-[11px] shrink-0">
                    {part.itemNo || "—"}
                  </span>
                  {part.partNumber && part.partNumberClean ? (
                    <Link
                      href={localize(`/part/${encodeURIComponent(part.partNumberClean)}`)}
                      className="font-mono text-xs text-primary hover:underline cursor-pointer break-all"
                      data-testid={`link-part-${part.id}`}
                    >
                      {part.partNumber}
                    </Link>
                  ) : part.partNumber ? (
                    <span className="font-mono text-xs text-foreground break-all">{part.partNumber}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                  {part.quantity != null && part.quantity !== "" && (
                    <span className="ml-auto tabular-nums text-[11px] text-muted-foreground shrink-0">
                      Qty {part.quantity}
                    </span>
                  )}
                  {part.weight != null && (
                    <span className="tabular-nums text-[11px] text-muted-foreground shrink-0">
                      {part.weight.toFixed(3)}kg
                    </span>
                  )}
                </div>
                {part.description && (
                  <div className="text-sm leading-snug mt-0.5 break-words">{part.description}</div>
                )}
                {part.additionalInfo && (
                  <div className="text-xs text-muted-foreground mt-0.5 break-words">{part.additionalInfo}</div>
                )}
              </div>
            ))
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

type MobileView = "categories" | "subcategories" | "parts";

export default function CarDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [currentPath] = useLocation();
  const { locale: activeLocale } = splitLocaleFromPath(currentPath);
  const localize = useLocalizedHref();
  const seoAlternates = slug
    ? CLIENT_LOCALES.map(l => ({
        bcp47: l.bcp47,
        path: withLocalePrefix(l.prefix, `/car/${slug}`),
      }))
    : undefined;
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<SubcategoryWithCount | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("categories");

  const deepLinked = useRef(false);
  const searchParams = new URLSearchParams(window.location.search);
  const deepCatId = searchParams.get("cat") ? parseInt(searchParams.get("cat")!) : null;
  const deepSubId = searchParams.get("sub") ? parseInt(searchParams.get("sub")!) : null;

  const { data: car, isLoading: carLoading } = useQuery<Car>({
    queryKey: [`/api/cars/${slug}`],
    queryFn: async () => {
      const res = await fetch(`/api/cars/${encodeURIComponent(slug || "")}`);
      if (!res.ok) throw new Error("Car not found");
      return res.json();
    },
    enabled: !!slug,
    refetchInterval: selectedCategory ? 0 : 5000,
  });

  const carId = car?.id || 0;

  // Localized SEO meta (Task #36). Soft-fail: page falls back to English
  // strings synthesized below when the API request errors.
  const { data: seoData } = useQuery<{
    locale: string;
    content: { metaTitle: string; metaDescription: string; inLanguage: string };
  }>({
    queryKey: ["/api/cars/seo", slug, activeLocale.code],
    queryFn: async () => {
      const res = await fetch(
        `/api/cars/seo/${encodeURIComponent(slug || "")}?locale=${encodeURIComponent(activeLocale.code)}`,
      );
      if (!res.ok) throw new Error("seo unavailable");
      return res.json();
    },
    enabled: !!slug && !!car,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const { data: categories = [], isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: [`/api/cars/${carId}/categories`],
    enabled: !!carId,
  });

  const { data: subcategories = [], isLoading: subsLoading } = useQuery<SubcategoryWithCount[]>({
    queryKey: [`/api/categories/${selectedCategory?.id}/subcategories`],
    enabled: !!selectedCategory,
  });

  useEffect(() => {
    if (deepLinked.current || !deepCatId || categories.length === 0) return;
    const cat = categories.find(c => c.id === deepCatId);
    if (cat) {
      setSelectedCategory(cat);
      setMobileView("subcategories");
      deepLinked.current = true;
    }
  }, [categories, deepCatId]);

  useEffect(() => {
    if (!deepSubId || subcategories.length === 0 || !deepLinked.current) return;
    if (selectedSubcategory?.id === deepSubId) return;
    const sub = subcategories.find(s => s.id === deepSubId);
    if (sub) {
      setSelectedSubcategory(sub);
      setMobileView("parts");
    }
  }, [subcategories, deepSubId]);

  const handleSelectCategory = (cat: Category) => {
    setSelectedCategory(cat);
    setSelectedSubcategory(null);
    setMobileView("subcategories");
  };

  const handleSelectSubcategory = (sub: SubcategoryWithCount) => {
    setSelectedSubcategory(sub);
    setMobileView("parts");
  };

  const handleMobileBack = () => {
    if (mobileView === "parts") {
      setMobileView("subcategories");
      setSelectedSubcategory(null);
    } else if (mobileView === "subcategories") {
      setMobileView("categories");
      setSelectedCategory(null);
    }
  };

  if (carLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!car) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Car not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={localize("/")}>Go back</Link>
        </Button>
      </div>
    );
  }

  const notScraped = car.scrapeStatus === "idle" || car.scrapeStatus === "unavailable";

  // Compute the localized fallback synchronously from the shared i18n pack
  // so the very first paint already carries the active-locale <title> and
  // meta description. Without this, the page briefly rendered the English
  // copy until the async /api/cars/seo query resolved — a window social-share
  // crawlers could snapshot. The async query still runs and overrides this
  // fallback once it returns (e.g. for editorial copy variations).
  const carPack = getPack(activeLocale.code);
  const carTotalParts = car.totalParts ?? 0;
  const carBuildIn = {
    displayName: car.displayName,
    chassis: car.chassis || "",
    modelName: car.modelName || car.displayName,
    engine: car.engine || "",
    totalParts: carTotalParts,
    totalPartsFmt: carTotalParts.toLocaleString(),
  };
  const seoTitle = seoData?.content.metaTitle || carPack.buildCarMetaTitle(carBuildIn);
  const seoDesc = seoData?.content.metaDescription || carPack.buildCarMetaDescription(carBuildIn);

  const categoryPanel = (
    // Three-panel layout — paper-toned sidebar so the brand stays
    // light. The previous `bg-sidebar/40` style pulled in the dark
    // sidebar token even in light mode (the BMV sidebar palette is
    // intentionally always-dark).
    <div className="w-full md:w-60 md:border-r border-border bg-secondary/40 flex flex-col shrink-0 h-full">
      <div className="px-3 py-3 border-b border-border">
        <div className="bmv-eyebrow mb-1">{car.chassis}</div>
        <div className="font-semibold text-base text-ink-primary leading-tight">{car.displayName}</div>
        <div className="text-xs text-ink-tertiary mt-0.5">{car.modelName} · {car.engine}</div>
        <div className="font-mono text-[11px] text-ink-quiet mt-1 tabular-nums">
          {car.yearStart}{car.yearEnd ? `–${car.yearEnd}` : "+"}
        </div>
      </div>

      {catsLoading ? (
        <div className="p-3 space-y-1.5">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <Layers className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No categories yet</p>
          {notScraped && (
            <Button size="sm" variant="outline" className="mt-3" asChild>
              <Link href={localize("/")}>Sync from Dashboard</Link>
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                  selectedCategory?.id === cat.id
                    ? "bmv-active-fog font-medium"
                    : "hover:bg-secondary text-foreground"
                }`}
                data-testid={`button-category-${cat.id}`}
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{cat.name}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50 md:hidden" />
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="px-3 py-2 border-t text-xs text-muted-foreground">
        {(car.totalParts ?? 0).toLocaleString()} parts · {categories.length} categories
      </div>
    </div>
  );

  const subcategoryPanel = selectedCategory ? (
    <div className="w-full md:w-56 md:border-r flex flex-col shrink-0 h-full">
      <div className="px-3 py-2.5 border-b bg-muted/30 flex items-center gap-2">
        <button
          onClick={handleMobileBack}
          className="md:hidden p-1 -ml-1 hover:bg-accent rounded-md"
          data-testid="button-back-categories"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-0.5">Category</div>
          <div className="font-medium text-sm truncate">{selectedCategory.name}</div>
        </div>
      </div>

      {subsLoading ? (
        <div className="p-2 space-y-1">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {subcategories.map(sub => (
              <button
                key={sub.id}
                onClick={() => handleSelectSubcategory(sub)}
                className={`w-full text-left px-2.5 py-2 text-sm transition-colors flex items-center gap-2 ${
                  selectedSubcategory?.id === sub.id
                    ? "bmv-active-fog font-medium"
                    : "hover:bg-secondary"
                }`}
                data-testid={`button-subcategory-${sub.id}`}
              >
                {sub.imageUrl && localImageUrl(sub.imageUrl) && (
                  <img
                    src={localImageUrl(sub.imageUrl)!}
                    alt=""
                    className="w-7 h-7 object-contain shrink-0 rounded-sm opacity-80"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <span className="flex-1 text-xs leading-tight">{sub.name}</span>
                <Badge
                  variant={sub.partCount === 0 ? "outline" : "secondary"}
                  className="shrink-0 text-[10px] px-1.5 py-0"
                  data-testid={`badge-partcount-${sub.id}`}
                >
                  {sub.partCount}
                </Badge>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50 md:hidden" />
              </button>
            ))}
            {subcategories.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">No parts groups</div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  ) : null;

  const partsPanel = (
    <div className="flex-1 overflow-auto p-4 min-w-0 h-full">
      {!selectedCategory ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h3 className="font-medium mb-1">Select a category</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {categories.length > 0
              ? "Choose a parts category from the left sidebar to browse parts groups"
              : notScraped
                ? "Sync this car's catalog first to see parts"
                : "No data available yet"
            }
          </p>
        </div>
      ) : !selectedSubcategory ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <Package2 className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            Select a parts group to view individual parts
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {subcategories.length} groups available
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4 flex-wrap">
            <button
              onClick={handleMobileBack}
              className="md:hidden p-1 -ml-1 hover:bg-accent rounded-md mr-1"
              data-testid="button-back-subcategories"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); setMobileView("categories"); }}
              className="font-medium text-foreground hover:underline cursor-pointer"
              data-testid="breadcrumb-car"
            >
              {car.displayName}
            </button>
            <ChevronRight className="w-3 h-3" />
            <button
              onClick={() => { setSelectedSubcategory(null); setMobileView("subcategories"); }}
              className="hover:underline cursor-pointer"
              data-testid="breadcrumb-category"
            >
              {selectedCategory.name}
            </button>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground font-medium">{selectedSubcategory.name}</span>
          </div>

          {(localImageUrl(selectedSubcategory.diagramImageUrl, "big") || localImageUrl(selectedSubcategory.imageUrl, "big")) && (
            <DiagramViewer
              src={(localImageUrl(selectedSubcategory.diagramImageUrl, "big") || localImageUrl(selectedSubcategory.imageUrl, "big"))!}
              alt={selectedSubcategory.name}
            />
          )}

          <PartsTable
            subcategoryId={selectedSubcategory.id}
            carId={carId}
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      <SEO
        title={seoTitle}
        description={seoDesc}
        path={withLocalePrefix(activeLocale.prefix, `/car/${slug}`)}
        locale={activeLocale.bcp47}
        alternates={seoAlternates}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Vehicle",
          name: `BMW ${car.displayName}`,
          manufacturer: { "@type": "Organization", name: "BMW" },
          model: car.modelName,
          vehicleConfiguration: car.engine || undefined,
          bodyType: car.bodyType,
          inLanguage: seoData?.content.inLanguage || activeLocale.bcp47,
        }}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Models", url: "/models" },
          ...(car.series ? [{ name: car.series, url: `/series/${car.series.toLowerCase().replace(/\s+/g, "-")}` }] : []),
          ...(car.chassis ? [{ name: car.chassis.toUpperCase(), url: `/chassis/${car.chassis.toLowerCase()}` }] : []),
          { name: car.displayName, url: `/car/${slug}` },
        ]}
      />
      {/* Desktop: side-by-side panels */}
      <div className="hidden md:flex h-full overflow-hidden">
        {categoryPanel}
        <div className="flex-1 flex overflow-hidden min-w-0">
          {selectedCategory && subcategoryPanel}
          {partsPanel}
        </div>
      </div>

      {/* Mobile: stacked views with back navigation */}
      <div className="md:hidden flex h-full overflow-hidden">
        {mobileView === "categories" && categoryPanel}
        {mobileView === "subcategories" && subcategoryPanel}
        {mobileView === "parts" && partsPanel}
      </div>
    </>
  );
}
