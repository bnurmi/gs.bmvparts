import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { useLocalizedHref } from "@/lib/locale";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search as SearchIcon, Package2, ChevronRight, Hash, ChevronDown, Check, X, Filter } from "lucide-react";
import type { Car } from "@shared/schema";
import { useT } from "@/lib/i18n";

interface SearchResult {
  id: number;
  partNumber: string | null;
  partNumberClean: string | null;
  description: string;
  additionalInfo: string | null;
  quantity: string | null;
  weight: number | null;
  subcategoryName: string;
  categoryName: string;
  carName: string;
  carId: number;
  subcategoryId: number;
}

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function CarFilterDropdown({ cars, selectedCars, onToggle, onClear }: {
  cars: Car[];
  selectedCars: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<string, Car[]> = {};
    for (const car of cars) {
      const chassis = car.chassis || "Other";
      const prefix = chassis.match(/^([A-Z])\d/)?.[1] || "";
      const groupKey = prefix ? `${prefix}xx` : "Other";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(car);
    }
    const order = Object.keys(groups).sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    return order.map(key => ({
      label: key,
      cars: groups[key].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")),
    }));
  }, [cars]);

  const toggleGroup = (groupCars: Car[]) => {
    const ids = groupCars.map(c => c.id);
    const allSelected = ids.every(id => selectedCars.includes(id));
    if (allSelected) {
      ids.forEach(id => { if (selectedCars.includes(id)) onToggle(id); });
    } else {
      ids.forEach(id => { if (!selectedCars.includes(id)) onToggle(id); });
    }
  };

  return (
    <div className="relative mb-5" ref={ref}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors"
          data-testid="button-car-filter-dropdown"
        >
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{t.search.filterByCar}</span>
          {selectedCars.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
              {selectedCars.length}
            </Badge>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {selectedCars.length > 0 && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-clear-car-filter"
          >
            <X className="w-3 h-3" />
            {t.common.clear}
          </button>
        )}
      </div>

      {selectedCars.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {cars.filter(c => selectedCars.includes(c.id)).map(car => (
            <button
              key={car.id}
              onClick={() => onToggle(car.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary text-primary-foreground"
              data-testid={`badge-selected-car-${car.id}`}
            >
              {car.displayName}
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-80 max-h-96 overflow-y-auto rounded-md border border-border bg-popover shadow-lg" data-testid="dropdown-car-filter">
          {grouped.map(group => (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.cars)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 hover:bg-muted sticky top-0"
                data-testid={`button-group-${group.label}`}
              >
                <span>{group.label} ({group.cars.length})</span>
                {group.cars.every(c => selectedCars.includes(c.id)) && (
                  <Check className="w-3 h-3 text-primary" />
                )}
              </button>
              {group.cars.map(car => {
                const isSelected = selectedCars.includes(car.id);
                return (
                  <button
                    key={car.id}
                    onClick={() => onToggle(car.id)}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent transition-colors ${isSelected ? "bg-accent/50" : ""}`}
                    data-testid={`button-filter-car-${car.id}`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-primary border-primary" : "border-input"}`}>
                      {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{car.displayName}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Search() {
  const localize = useLocalizedHref();
  const t = useT();
  const searchString = useSearch();
  const [pathname, navigate] = useLocation();

  const query = new URLSearchParams(searchString).get("q") ?? "";
  const [selectedCars, setSelectedCars] = useState<number[]>([]);
  const debouncedQuery = useDebounce(query, 300);

  const handleQueryChange = (value: string) => {
    const params = new URLSearchParams();
    if (value) params.set("q", value);
    const newSearch = params.toString() ? `?${params.toString()}` : "";
    navigate(`${pathname}${newSearch}`, { replace: true });
  };

  const { data: cars = [] } = useQuery<Car[]>({
    queryKey: ["/api/cars"],
  });

  const scrapedCars = cars.filter(c => c.scrapeStatus === "complete");

  const shouldSearch = debouncedQuery.length >= 2;
  const searchUrl = shouldSearch
    ? `/api/search?q=${encodeURIComponent(debouncedQuery)}${selectedCars.length ? `&cars=${selectedCars.join(",")}` : ""}`
    : null;

  const { data: results, isLoading, isFetching } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", debouncedQuery, selectedCars.join(",")],
    queryFn: async () => {
      if (!searchUrl) return [];
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: shouldSearch,
    staleTime: 30000,
  });

  const toggleCar = (carId: number) => {
    setSelectedCars(prev =>
      prev.includes(carId) ? prev.filter(id => id !== carId) : [...prev, carId]
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <SEO
        title="Search BMW OEM Parts — Part Number & Description Lookup"
        description="Search millions of BMW OEM parts by part number or description. Filter by model, view cross-references, and find exact part matches across all BMW generations."
        path="/search"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Search Parts", url: "/search" },
        ]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-1">{t.search.heading}</h1>
        <p className="text-muted-foreground text-sm">
          {t.search.intro}
        </p>
      </div>

      {/* Search input */}
      <div className="relative mb-4">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground" />
        <Input
          placeholder={t.search.placeholder}
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          className="pl-10 h-11 text-sm"
          data-testid="input-search"
          autoFocus
        />
        {(isLoading || isFetching) && shouldSearch && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {shouldSearch && !isLoading && results && results.length === 0 && (
        <div className="text-center py-6 mb-4">
          <Package2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">{t.search.noResults(query)}</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            {t.search.noResultsHint}
          </p>
        </div>
      )}

      {shouldSearch && !isLoading && results && results.length > 0 && (
        <div className="text-sm text-muted-foreground mb-3">
          {t.search.resultsFor(results.length, query)}
          {results.length === 100 && ` ${t.search.showingFirst100}`}
        </div>
      )}

      {/* Car filter dropdown */}
      {scrapedCars.length > 0 && (
        <CarFilterDropdown
          cars={scrapedCars}
          selectedCars={selectedCars}
          onToggle={toggleCar}
          onClear={() => setSelectedCars([])}
        />
      )}

      {/* Results */}
      {!shouldSearch && (
        <div className="text-center py-16">
          <SearchIcon className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-muted-foreground">{t.search.enterAtLeast2}</p>
          {scrapedCars.length === 0 && (
            <p className="text-sm text-muted-foreground/60 mt-2">
              {t.search.syncTip}{" "}
              <Link href={localize("/")} className="text-primary hover:underline">{t.search.dashboardLink}</Link>
            </p>
          )}
        </div>
      )}

      {shouldSearch && isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-64 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {shouldSearch && !isLoading && results && results.length > 0 && (
        <div className="space-y-2">
          {results.map(result => (
            <Card key={result.id} className="hover-elevate" data-testid={`card-result-${result.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-sm">{result.description}</span>
                      {result.additionalInfo && !result.additionalInfo.startsWith('realoem-backfill:') && !result.additionalInfo.startsWith('realoem_backfill') && (
                        <span className="text-xs text-muted-foreground">{result.additionalInfo}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {result.partNumber && result.partNumberClean && (
                        <Link
                          href={localize(`/part/${encodeURIComponent(result.partNumberClean)}`)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                          data-testid={`link-part-${result.id}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <Hash className="w-3 h-3" />
                          <span className="font-mono">{result.partNumber}</span>
                        </Link>
                      )}
                      {result.quantity && (
                        <div className="text-xs text-muted-foreground">
                          {t.search.qty}: {result.quantity}
                        </div>
                      )}
                      {result.weight != null && result.weight > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {result.weight.toFixed(3)} kg
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {result.carName}
                      </Badge>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{(result.categoryName === 'RealOEM Backfill' || result.categoryName === 'realoem-backfill') ? 'Additional Parts' : result.categoryName}</span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                      <span>{result.subcategoryName}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
