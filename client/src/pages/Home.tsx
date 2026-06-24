import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CLIENT_LOCALES, withLocalePrefix, useLocalizedHref } from "@/lib/locale";
import { SEO, WebsiteStructuredData } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckCircle2, Clock, AlertCircle, Loader2, Ban, ChevronRight,
  Car as CarIcon, Package, RefreshCw, Download, TrendingUp
} from "lucide-react";

// Finite request timeout used by the homepage's two stat queries
// (/api/stats and /api/chassis). We'd rather fail fast and show the
// "Couldn't load — Retry" affordance than leave the user staring at
// stuck skeletons. Pairs with the homepage's error/retry UI below.
const HOME_FETCH_TIMEOUT_MS = 8000;
async function fetchJsonWithTimeout(url: string, timeoutMs = HOME_FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { credentials: "include", signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Car } from "@shared/schema";
import { UniversalSearch } from "@/components/UniversalSearch";

// Slim per-card payload returned by /api/cars/homepage (Task #162).
// Only the columns the BMV CarCard + grouping logic actually render —
// keep in sync with `HomepageCar` in server/storage.ts.
type HomepageCar = {
  id: number;
  slug: string | null;
  displayName: string;
  modelName: string;
  series: string;
  chassis: string;
  bodyType: string;
  engine: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  scrapeStatus: string;
  scrapeProgress: number | null;
  totalCategories: number | null;
  totalSubcategories: number | null;
  totalParts: number | null;
  lastScrapedAt: string | Date | null;
  // Filled in client-side for legacy fields the card never reads but
  // the shared `Car` type requires; lets us reuse `getCarGroup` etc.
  scrapeError?: string | null;
};

function useStatusLabels() {
  const t = useT();
  return {
    idle: { label: t.status.notSynced, color: "text-muted-foreground", icon: Clock },
    queued: { label: "Queued", color: "text-amber-600 dark:text-amber-400", icon: Clock },
    running: { label: t.status.syncing, color: "text-primary", icon: Loader2 },
    complete: { label: t.status.complete, color: "text-green-600 dark:text-green-400", icon: CheckCircle2 },
    error: { label: t.status.error, color: "text-destructive", icon: AlertCircle },
    unavailable: { label: t.status.unavailable, color: "text-muted-foreground", icon: Ban },
    cancelled: { label: t.status.cancelled, color: "text-muted-foreground", icon: AlertCircle },
  } as Record<string, { label: string; color: string; icon: any }>;
}

import { groupCars, getGroupDef, getCarGroup, GROUP_ORDER, type CarGroupKey } from "@/lib/car-groups";

function CarCard({ car }: { car: HomepageCar }) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const localize = useLocalizedHref();
  const t = useT();
  const STATUS_LABELS = useStatusLabels();
  const status = STATUS_LABELS[car.scrapeStatus] || STATUS_LABELS.idle;
  const StatusIcon = status.icon;
  const isRunning = car.scrapeStatus === "running";
  const isUnavailable = car.scrapeStatus === "unavailable";
  const groupDef = getGroupDef(getCarGroup(car));
  const headerColor = groupDef.color;

  const scrapeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/cars/${car.id}/scrape`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars/homepage"] });
      toast({ title: t.home.startedSyncingToast(car.displayName) });
    },
    onError: (err: any) => {
      toast({ title: t.home.errorToast, description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/cars/${car.id}/scrape`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars/homepage"] });
    },
  });

  // BMV paper container — no colored header strip, no rounded corners.
  // Hierarchy comes from a single 1px outline + a tiny accent dot for
  // the model group (M / X / Sedan etc.) and a monospace chassis tag.
  return (
    <div
      className="group bmv-paper bmv-paper-quiet flex flex-col transition-colors hover:border-ink-primary"
      data-testid={`card-car-${car.id}`}
    >
      <Link href={localize(`/car/${car.slug || car.id}`)} className="block cursor-pointer">
        <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="bmv-eyebrow mb-1.5 flex items-center gap-1.5">
              <span aria-hidden className={`inline-block w-1.5 h-1.5 ${groupDef.dotClass ?? "bg-ink-quiet"}`} />
              {groupDef.title}
            </div>
            <div className="text-ink-primary font-semibold text-[17px] leading-tight">{car.displayName}</div>
            <div className="text-ink-tertiary text-xs mt-0.5">{car.engine} · {car.bodyType}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-xs text-ink-tertiary tabular-nums">
              {car.yearStart}{car.yearEnd ? `–${car.yearEnd}` : "+"}
            </div>
            <div className="font-mono text-sm text-ink-primary mt-0.5">{car.chassis}</div>
          </div>
        </div>

        <div className="px-4 pb-3 border-t border-border-default/60 pt-3">
          {isRunning && (
            <div className="mb-3">
              <div className="flex justify-between bmv-eyebrow mb-1.5">
                <span>{t.home.syncingCatalog}</span>
                <span className="text-ink-primary tabular-nums">{car.scrapeProgress}%</span>
              </div>
              <Progress value={car.scrapeProgress || 0} className="h-[2px]" />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-base font-semibold tabular-nums text-ink-primary">{car.totalCategories || 0}</div>
              <div className="bmv-eyebrow mt-1">{t.home.categories}</div>
            </div>
            <div>
              <div className="text-base font-semibold tabular-nums text-ink-primary">{car.totalSubcategories || 0}</div>
              <div className="bmv-eyebrow mt-1">{t.home.groups}</div>
            </div>
            <div>
              <div className="text-base font-semibold tabular-nums text-ink-primary">
                {(car.totalParts ?? 0) > 0 ? (car.totalParts ?? 0).toLocaleString() : "—"}
              </div>
              <div className="bmv-eyebrow mt-1">{t.common.parts}</div>
            </div>
          </div>
        </div>
      </Link>

      <div className="px-4 pb-3 pt-2 border-t border-border-default/60">
        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-mono ${status.color}`}>
            <StatusIcon className={`w-3 h-3 ${isRunning ? "animate-spin" : ""}`} />
            {status.label}
            {car.lastScrapedAt && car.scrapeStatus === "complete" && (
              <span className="text-ink-quiet font-normal normal-case tracking-normal">
                · {new Date(car.lastScrapedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="flex gap-1.5">
            {(car.totalParts ?? 0) > 0 && (
              <Button size="sm" variant="outline" asChild data-testid={`button-browse-${car.id}`}>
                <Link href={localize(`/car/${car.slug || car.id}`)}>
                  {t.common.browse} <ChevronRight className="w-3 h-3 ml-0.5" />
                </Link>
              </Button>
            )}
            {isAdmin && !isUnavailable && (
              <>
                {isRunning ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.preventDefault(); cancelMutation.mutate(); }}
                    data-testid={`button-cancel-${car.id}`}
                  >
                    {t.common.cancel}
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={car.scrapeStatus === "complete" ? "outline" : "default"}
                        onClick={(e) => { e.preventDefault(); scrapeMutation.mutate(); }}
                        disabled={scrapeMutation.isPending}
                        data-testid={`button-scrape-${car.id}`}
                      >
                        {car.scrapeStatus === "complete" ? (
                          <><RefreshCw className="w-3 h-3 mr-1.5" />{t.home.refresh}</>
                        ) : (
                          <><Download className="w-3 h-3 mr-1.5" />{t.home.sync}</>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {car.scrapeStatus === "complete"
                        ? t.home.refreshTooltip
                        : t.home.syncTooltip}
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
            {isUnavailable && (
              <Badge variant="secondary" className="text-xs">{t.home.notInCatalog}</Badge>
            )}
          </div>
        </div>

        {car.scrapeError && (
          <div className="mt-2 text-xs text-destructive bg-destructive/10 px-2 py-1">
            {car.scrapeError}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupSection({ groupKey, cars, isLoading }: { groupKey: CarGroupKey; cars: HomepageCar[]; isLoading: boolean }) {
  const def = getGroupDef(groupKey);
  const t = useT();

  return (
    <div className="mb-6" data-testid={`section-${groupKey}`}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-bold">{def.title}</h2>
        <Badge variant="secondary" className="text-xs">{def.badge}</Badge>
        <span className="text-xs text-muted-foreground ml-1">{t.home.modelsCount(cars.length)}</span>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cars.map((car, idx) => <CarCard key={`${groupKey}-${car.id}`} car={car} />)}
        </div>
      )}
    </div>
  );
}


// Slim payload returned by the new SQL-backed /api/chassis. The
// homepage only needs counts + a year range to render the Popular
// Chassis cards; the previous response shape inlined the full per-
// car list per chassis, which was the bulk of the 5+ MB payload.
type ChassisAggregate = {
  chassis: string;
  carCount: number;
  totalParts: number;
  yearStart: number | null;
  yearEnd: number | null;
};

function PopularChassisSection() {
  const localize = useLocalizedHref();
  const t = useT();
  const { data: chassisList = [], isLoading, isError, refetch, isFetching } = useQuery<ChassisAggregate[]>({
    queryKey: ["/api/chassis"],
    queryFn: () => fetchJsonWithTimeout("/api/chassis"),
  });

  const top = [...chassisList]
    .filter(c => (c.totalParts || 0) > 0)
    .sort((a, b) => b.totalParts - a.totalParts)
    .slice(0, 12);

  if (isError) {
    return (
      <div className="mb-8" data-testid="section-popular-chassis-error">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-base font-bold">{t.home.popularChassis}</h2>
        </div>
        <div className="bmv-paper px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-ink-tertiary flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            {t.home.couldNotLoad ?? "Couldn't load."}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-retry-popular-chassis"
          >
            {isFetching ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
            {t.common.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoading && top.length === 0) return null;

  return (
    <div className="mb-8" data-testid="section-popular-chassis">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h2 className="text-base font-bold">{t.home.popularChassis}</h2>
        <span className="text-xs text-muted-foreground ml-1">{t.home.popularChassisSub}</span>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {top.map(c => {
            const minYear = c.yearStart ?? null;
            const maxYear = c.yearEnd ?? c.yearStart ?? null;
            const yearStr = minYear ? (maxYear && maxYear !== minYear ? `${minYear}–${maxYear}` : `${minYear}+`) : "";
            return (
              <Link
                key={c.chassis}
                href={localize(`/chassis/${c.chassis.toLowerCase()}`)}
                data-testid={`link-popular-chassis-${c.chassis.toLowerCase()}`}
              >
                <Card className="hover-elevate cursor-pointer h-full">
                  <CardContent className="p-3">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <div className="font-mono font-bold text-base" data-testid={`text-popular-chassis-code-${c.chassis.toLowerCase()}`}>{c.chassis}</div>
                      {yearStr && <div className="text-[10px] text-muted-foreground">{yearStr}</div>}
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <div className="text-lg font-bold tabular-nums leading-tight" data-testid={`text-popular-chassis-parts-${c.chassis.toLowerCase()}`}>
                          {c.totalParts.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{t.common.parts}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums" data-testid={`text-popular-chassis-models-${c.chassis.toLowerCase()}`}>
                          {c.carCount}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{t.common.models}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  // Slim per-card payload (Task #162). The previous query asked
  // /api/cars for *every* column on all ~2,374 rows on every page view
  // and re-fetched it every 2s, which was the bulk of the homepage's
  // perceived load time. Switch to /api/cars/homepage and only poll
  // while a scrape is actually running.
  const { data: cars = [], isLoading } = useQuery<HomepageCar[]>({
    queryKey: ["/api/cars/homepage"],
    // Tight 2s polling while *something* is actively scraping; otherwise
    // a slow 30s heartbeat so a homepage that's been left open will
    // still notice within ~30s when an admin starts a scrape from
    // /admin in another tab and re-enter live polling. Idle visitors
    // pay almost nothing for this — the response is gzipped + cached
    // for 30s server-side.
    refetchInterval: (q) => {
      const list = (q.state.data as HomepageCar[] | undefined) ?? [];
      return list.some((c) => c.scrapeStatus === "running") ? 2000 : 30_000;
    },
    staleTime: 30_000,
  });

  const {
    data: stats,
    isError: statsError,
    isLoading: statsLoading,
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery<{ totalCars: number; scrapedCars: number; totalParts: number }>({
    queryKey: ["/api/stats"],
    queryFn: () => fetchJsonWithTimeout("/api/stats"),
    refetchInterval: 30000,
  });

  const { isAdmin } = useAuth();
  const localize = useLocalizedHref();
  const t = useT();
  const carsByGroup = groupCars(cars);
  const hasRunning = cars.some(c => c.scrapeStatus === "running");

  const homeAlternates = CLIENT_LOCALES.map(l => ({
    bcp47: l.bcp47,
    path: withLocalePrefix(l.prefix, "/"),
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SEO
        title="BMW OEM Parts Catalog — Part Numbers, Diagrams & Pricing"
        description="Browse the complete BMW OEM parts catalog with exploded diagrams, part numbers, cross-references, and pricing for every BMW model from E30 to G87."
        path="/"
        alternates={homeAlternates}
      />
      <WebsiteStructuredData />
      {/*
        Hero block — eyebrow + display-size headline + universal CTA.
        BMV brand spec puts this front and center on the homepage so
        the first interaction is always "type in your VIN / part /
        chassis", not "scroll a sidebar". The same routing heuristic
        used by the topbar lives in UniversalSearch so behavior stays
        consistent regardless of which entry point is used.
      */}
      <section className="mb-10 pt-4" data-testid="section-hero">
        <div
          className="text-base sm:text-lg font-bold tracking-display text-ink-primary mb-1"
          data-testid="text-hero-tagline"
        >
          {t.hero.eyebrow}
        </div>
        <div
          className="bmv-eyebrow bmv-eyebrow-accent mb-4"
          data-testid="text-hero-stats"
        >
          {(() => {
            const partsRaw = stats?.totalParts ?? 0;
            const partsFmt =
              partsRaw >= 1_000_000
                ? `${(partsRaw / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
                : partsRaw >= 1_000
                ? `${(partsRaw / 1_000).toFixed(1).replace(/\.0$/, "")}K`
                : `${partsRaw}`;
            const chassisFmt = (stats?.scrapedCars ?? 0).toLocaleString();
            return `${partsFmt} PARTS · ${chassisFmt} CHASSIS · ZERO GUESSWORK`;
          })()}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-display leading-[0.95] mb-2 text-ink-primary">
          {t.home.heading}
        </h1>
        <p className="text-ink-tertiary max-w-2xl mt-3 mb-6">{t.home.intro}</p>
        <UniversalSearch variant="hero" autoFocus={false} />
        <div className="text-[11px] font-mono text-ink-quiet mt-3 max-w-2xl">{t.hero.helper}</div>
      </section>

      {statsError ? (
        <div className="mb-6 bmv-paper px-4 py-3 flex items-center justify-between gap-3" data-testid="stats-error">
          <div className="text-sm text-ink-tertiary flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            {t.home.couldNotLoad ?? "Couldn't load stats."}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetchStats()}
            disabled={statsFetching}
            data-testid="button-retry-stats"
          >
            {statsFetching ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
            {t.common.retry}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { id: "cars-tracked", icon: CarIcon, label: t.home.statCarsTracked, value: stats?.totalCars ?? cars.length },
            { id: "fully-synced", icon: CheckCircle2, label: t.home.statFullySynced, value: stats?.scrapedCars ?? cars.filter(c => c.scrapeStatus === "complete").length },
            { id: "total-parts", icon: Package, label: t.home.statTotalParts, value: stats?.totalParts ? stats.totalParts.toLocaleString() : (statsLoading ? "—" : "0") },
          ].map(({ id, icon: Icon, label, value }) => (
            <Card key={id} data-testid={`stat-${id}`}>
              <CardContent className="flex flex-col items-center gap-1.5 p-3 sm:flex-row sm:gap-3 sm:p-4">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-primary" />
                </div>
                <div className="text-center sm:text-left min-w-0">
                  <div className="text-lg sm:text-xl font-bold tabular-nums truncate">{value}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasRunning && (
        <div className="mb-4 flex items-center gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          {t.home.syncingBanner}
        </div>
      )}

      <PopularChassisSection />

      {GROUP_ORDER.map(g =>
        (carsByGroup[g]?.length ?? 0) > 0 ? (
          <GroupSection key={g} groupKey={g} cars={carsByGroup[g]} isLoading={isLoading} />
        ) : null
      )}

      <div className="mt-6 p-4 rounded-md bg-muted/50 border border-border text-sm text-muted-foreground">
        <strong className="text-foreground">{t.home.aboutLabel}</strong> {t.home.aboutBody}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold mb-2">{t.home.browseBySeries}</h2>
            <div className="flex flex-wrap gap-1.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "Z4", "M"].map(s => (
                <Link key={s} href={localize(`/series/${s.toLowerCase()}`)} data-testid={`link-series-${s.toLowerCase()}`}>
                  <Badge variant="outline" className="cursor-pointer hover:bg-accent transition-colors">{t.home.seriesLabel(s)}</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold mb-2">{t.home.browseByChassis}</h2>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set(cars.map(c => c.chassis))).sort().slice(0, 20).map(ch => (
                <Link key={ch} href={localize(`/chassis/${ch.toLowerCase()}`)} data-testid={`link-chassis-${ch.toLowerCase()}`}>
                  <Badge variant="outline" className="cursor-pointer hover:bg-accent transition-colors font-mono text-xs">{ch}</Badge>
                </Link>
              ))}
              {Array.from(new Set(cars.map(c => c.chassis))).length > 20 && (
                <Link href={localize("/models")} data-testid="link-chassis-more">
                  <Badge variant="secondary" className="cursor-pointer">{t.home.more}</Badge>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
