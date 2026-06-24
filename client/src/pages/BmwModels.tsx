import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SEO } from "@/components/SEO";
import { CLIENT_LOCALES, splitLocaleFromPath, withLocalePrefix } from "@/lib/locale";
import { getPack } from "@shared/i18n";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Car as CarIcon, Cpu, Globe, Gauge, Tag,
  Loader2, Database, ChevronDown, ChevronUp, Image, AlertTriangle,
  Play, Square, RefreshCw,
} from "lucide-react";

interface BmwModel {
  id: number;
  chassis: string;
  typeCode: string;
  modelName: string;
  developmentCode: string | null;
  market: string | null;
  bodyType: string | null;
  engineDisplacement: string | null;
  enginePowerKw: number | null;
  engineCode: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
}

interface ScrapeProgress {
  status: "idle" | "scraping" | "complete" | "error";
  phase?: "idle" | "discovering" | "fetching";
  total: number;
  scraped: number;
  errors: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  currentChassis?: string | null;
  chassisDiscovered?: number;
  chassisCompleted?: number;
}

interface ChassisCount {
  chassis: string;
  count: number;
}

interface StatsResponse {
  totalModels: number;
  scrapeProgress: ScrapeProgress;
  chassisCodes: ChassisCount[];
}

function ModelCard({ model }: { model: BmwModel }) {
  const [showImage, setShowImage] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden hover:border-primary/30 transition-colors" data-testid={`model-card-${model.id}`}>
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <CarIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" data-testid={`text-model-name-${model.id}`}>{model.modelName}</span>
              <Badge variant="outline" className="text-xs font-mono">{model.chassis}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Tag className="w-3 h-3" /> {model.typeCode}
              </span>
              {model.market && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {model.market}
                </span>
              )}
              {model.bodyType && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CarIcon className="w-3 h-3" /> {model.bodyType}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {model.engineCode && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  <span className="font-mono">{model.engineCode}</span>
                </span>
              )}
              {model.engineDisplacement && (
                <span className="text-xs text-muted-foreground">{model.engineDisplacement}</span>
              )}
              {model.enginePowerKw && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Gauge className="w-3 h-3" /> {model.enginePowerKw} kW ({Math.round(model.enginePowerKw * 1.341)} hp)
                </span>
              )}
            </div>
          </div>
          {model.imageUrl && (
            <button
              onClick={() => setShowImage(!showImage)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              data-testid={`button-toggle-image-${model.id}`}
            >
              <Image className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {showImage && model.imageUrl && (
        <div className="border-t bg-muted/10">
          <img
            src={model.imageUrl}
            alt={`${model.modelName} ${model.chassis}`}
            className="w-full"
            loading="lazy"
            data-testid={`img-model-${model.id}`}
          />
        </div>
      )}
    </div>
  );
}

interface ModelsSeoPayload {
  locale: string;
  totalModels: number;
  content: { metaTitle: string; metaDescription: string; intro: string };
}

export default function BmwModels() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [chassisFilter, setChassisFilter] = useState("");
  const [showAllChassis, setShowAllChassis] = useState(false);
  const prevScraping = useRef(false);
  const [currentPath] = useLocation();
  const { locale: activeLocale } = splitLocaleFromPath(currentPath);
  const pack = getPack(activeLocale.code);
  const ui = pack.modelsHubUi;
  const seoAlternates = CLIENT_LOCALES.map(l => ({
    bcp47: l.bcp47,
    path: withLocalePrefix(l.prefix, "/models"),
  }));

  const seoQuery = useQuery<ModelsSeoPayload>({
    queryKey: ["/api/models/seo", activeLocale.code],
    queryFn: async () => {
      const res = await fetch(`/api/models/seo?locale=${encodeURIComponent(activeLocale.code)}`);
      if (!res.ok) throw new Error("seo unavailable");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const queryUrl = search
    ? `/api/bmw-models?q=${encodeURIComponent(search)}`
    : chassisFilter
      ? `/api/bmw-models?chassis=${encodeURIComponent(chassisFilter)}`
      : "/api/bmw-models";

  const modelsQuery = useQuery<BmwModel[]>({
    queryKey: ["/api/bmw-models", search || null, chassisFilter || null],
    queryFn: async () => {
      const res = await fetch(queryUrl);
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json();
    },
    staleTime: 60000,
  });

  const statsQuery = useQuery<StatsResponse>({
    queryKey: ["/api/bmw-models/stats"],
    refetchInterval: (query) => {
      const data = query.state.data as StatsResponse | undefined;
      return data?.scrapeProgress.status === "scraping" ? 3000 : false;
    },
  });

  const stats = statsQuery.data;
  const progress = stats?.scrapeProgress;
  const isScraping = progress?.status === "scraping";

  useEffect(() => {
    if (prevScraping.current && !isScraping) {
      queryClient.invalidateQueries({ queryKey: ["/api/bmw-models"] });
    }
    prevScraping.current = !!isScraping;
  }, [isScraping]);

  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bmw-models/scrape");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bmw-models/stats"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/bmw-models/scrape");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bmw-models/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bmw-models"] });
    },
  });

  const importLegacyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bmw-models/import-legacy");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bmw-models/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bmw-models"] });
    },
  });

  const models = modelsQuery.data || [];

  const allChassisCodes = stats?.chassisCodes || [];
  const visibleChassis = showAllChassis ? allChassisCodes : allChassisCodes.slice(0, 20);

  const grouped: Record<string, BmwModel[]> = {};
  for (const m of models) {
    if (!grouped[m.chassis]) grouped[m.chassis] = [];
    grouped[m.chassis].push(m);
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <SEO
        title={seoQuery.data?.content.metaTitle || "BMW Model Database — All Chassis Codes & Generations"}
        description={seoQuery.data?.content.metaDescription || "Complete BMW model reference database with every chassis code, engine variant, and generation. Browse technical specifications for all BMW models from classic to current."}
        path={withLocalePrefix(activeLocale.prefix, "/models")}
        locale={activeLocale.bcp47}
        alternates={seoAlternates}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "BMW Models", url: "/models" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">{ui.pageTitle}</h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-models-intro">
          {seoQuery.data?.content.intro
            || pack.buildModelsIntro({
              totalModels: stats?.totalModels ?? 0,
              totalModelsFmt: stats?.totalModels?.toLocaleString() || "...",
            })}
        </p>
      </div>

      {progress && isAdmin && (
        <div className="border rounded-lg p-4" data-testid="scrape-status">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{ui.databaseLabel}</span>
                <Badge variant={isScraping ? "default" : progress.status === "complete" ? "secondary" : "outline"} className="text-xs">
                  {isScraping && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  {progress.status === "idle" ? ui.status.ready : progress.status === "scraping" ? ui.status.syncing : progress.status === "complete" ? ui.status.complete : ui.status.error}
                </Badge>
              </div>
              {isScraping && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    {progress.phase === "discovering" ? (
                      <span data-testid="text-discovery-progress">
                        {ui.discoveryProgress({
                          completed: progress.chassisCompleted ?? 0,
                          discovered: progress.chassisDiscovered ?? 0,
                          current: progress.currentChassis ?? null,
                        })}
                      </span>
                    ) : (
                      <span>{ui.modelsProgress({ scraped: progress.scraped, total: progress.total })}</span>
                    )}
                    <span>{progress.errors > 0 && ui.errorsCount(progress.errors)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: progress.phase === "discovering"
                          ? `${(progress.chassisDiscovered ?? 0) > 0 ? ((progress.chassisCompleted ?? 0) / (progress.chassisDiscovered ?? 1)) * 100 : 0}%`
                          : `${progress.total > 0 ? (progress.scraped / progress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {progress.status === "error" && progress.error && (
                <div className="flex items-center gap-1 text-xs text-destructive mt-1">
                  <AlertTriangle className="w-3 h-3" /> {progress.error}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {isScraping ? (
                <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate()} data-testid="button-cancel-scrape">
                  <Square className="w-3 h-3 mr-1" /> {ui.buttons.cancel}
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => scrapeMutation.mutate()} disabled={scrapeMutation.isPending} data-testid="button-start-scrape">
                    {stats?.totalModels && stats.totalModels > 0 ? (
                      <><RefreshCw className="w-3 h-3 mr-1" /> {ui.buttons.refresh}</>
                    ) : (
                      <><Play className="w-3 h-3 mr-1" /> {ui.buttons.syncModels}</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => importLegacyMutation.mutate()}
                    disabled={importLegacyMutation.isPending}
                    data-testid="button-import-legacy"
                    title={ui.importLegacyTooltip}
                  >
                    {importLegacyMutation.isPending ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> {ui.buttons.importing}</>
                    ) : (
                      <><Database className="w-3 h-3 mr-1" /> {ui.buttons.importLegacy}</>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={ui.searchPlaceholder}
            value={search}
            onChange={e => { setSearch(e.target.value); setChassisFilter(""); }}
            className="pl-9"
            data-testid="input-search-models"
          />
        </div>
        <Badge variant="secondary" className="self-center shrink-0">
          {ui.resultsBadge(models.length.toLocaleString())}
        </Badge>
      </div>

      {!search && allChassisCodes.length > 1 && (
        <div className="space-y-2" data-testid="chassis-filters">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setChassisFilter("")}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                !chassisFilter ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
              }`}
              data-testid="button-filter-all"
            >
              {ui.filterAll}
            </button>
            {visibleChassis.map(cc => (
              <button
                key={cc.chassis}
                onClick={() => setChassisFilter(chassisFilter === cc.chassis ? "" : cc.chassis)}
                className={`text-xs px-2.5 py-1.5 rounded-md border font-mono transition-colors ${
                  chassisFilter === cc.chassis ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                }`}
                data-testid={`button-filter-${cc.chassis}`}
              >
                {cc.chassis} <span className="text-[10px] opacity-70">({cc.count})</span>
              </button>
            ))}
            {allChassisCodes.length > 20 && (
              <button
                onClick={() => setShowAllChassis(!showAllChassis)}
                className="text-xs px-2.5 py-1.5 rounded-md border bg-background hover:bg-muted transition-colors flex items-center gap-1"
                data-testid="button-show-all-chassis"
              >
                {showAllChassis ? <><ChevronUp className="w-3 h-3" /> {ui.showLess}</> : <><ChevronDown className="w-3 h-3" /> {ui.showMore(allChassisCodes.length - 20)}</>}
              </button>
            )}
          </div>
        </div>
      )}

      {modelsQuery.isLoading && (
        <div className="space-y-3" data-testid="loading-skeleton">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      )}

      {modelsQuery.isError && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 flex items-center gap-3" data-testid="load-error">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <span className="text-sm">{ui.failedToLoad}</span>
        </div>
      )}

      {!modelsQuery.isLoading && models.length === 0 && (
        <div className="border rounded-lg p-8 text-center" data-testid="empty-state">
          <Database className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <div className="font-medium text-sm">{ui.emptyTitle}</div>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            {search ? ui.emptyHintWithSearch : ui.emptyHintNoSearch}
          </p>
        </div>
      )}

      {!modelsQuery.isLoading && models.length > 0 && (
        <div className="space-y-6">
          {(chassisFilter || search) ? (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
              {models.map(m => <ModelCard key={m.id} model={m} />)}
            </div>
          ) : (
            Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([chassis, groupModels]) => (
              <div key={chassis}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="font-mono font-bold">{chassis}</Badge>
                  <span className="text-xs text-muted-foreground">{ui.variantsCount(groupModels.length)}</span>
                </div>
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                  {groupModels.map(m => <ModelCard key={m.id} model={m} />)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
