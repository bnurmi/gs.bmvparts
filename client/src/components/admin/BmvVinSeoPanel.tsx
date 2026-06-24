// =============================================================================
// Admin panel for the BMV.vin SEO Growth Engine (Task #259)
// =============================================================================
// Shows: keyword inventory, content pages, refresh queue, top keywords,
// content generation controls (trigger keyword discovery, generate guides,
// run refresh cycle).
// =============================================================================

import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Zap, BookOpen, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SeoGrowthStats {
  totalKeywords: number;
  keywordsByIntent: Record<string, number>;
  totalPages: number;
  pagesByType: Record<string, number>;
  pendingRefreshes: number;
  overdueRefreshes: number;
  publishedGuides: number;
  recentlyGeneratedGuides: number;
}

interface TopKeyword {
  keyword: string;
  intent: string;
  volume: number | null;
  priority: number;
  pageTargeting: string | null;
}

interface RefreshQueueItem {
  url: string;
  pageType: string;
  dueAt: string;
  status: string;
  attempts: number;
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------
function StatTile({ label, value, sub, icon: Icon, color }: {
  label: string; value: number | string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value.toLocaleString()}</div>
          <div className="text-sm font-medium">{label}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Intent colour map
// ---------------------------------------------------------------------------
const INTENT_COLOR: Record<string, string> = {
  tool: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  informational: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "pre-purchase": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  comparison: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "model-specific": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export function BmvVinSeoPanel() {
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<SeoGrowthStats>({
    queryKey: ["/api/admin/seo-engine/stats"],
  });

  const { data: kwData, isLoading: kwLoading } = useQuery<{ keywords: TopKeyword[] }>({
    queryKey: ["/api/admin/seo-engine/keywords"],
  });

  const { data: queueData, isLoading: queueLoading } = useQuery<{ queue: RefreshQueueItem[] }>({
    queryKey: ["/api/admin/seo-engine/refresh-queue"],
  });

  const discoverMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seo-engine/discover-keywords"),
    onSuccess: async (r: any) => {
      const d = await r.json().catch(() => ({}));
      toast({ title: "Keyword discovery complete", description: `${d.upserted ?? 0} seeded, ${d.chassisExpanded ?? 0} chassis expanded` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo-engine/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo-engine/keywords"] });
    },
    onError: () => toast({ title: "Discovery failed", variant: "destructive" }),
  });

  const generateMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seo-engine/generate-content"),
    onSuccess: async (r: any) => {
      const d = await r.json().catch(() => ({}));
      const generated = Array.isArray(d.generated) ? d.generated : [];
      const failed = Array.isArray(d.failed) ? d.failed : [];
      toast({
        title: "Content generation complete",
        description: `${generated.length} generated${failed.length > 0 ? `, ${failed.length} failed` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo-engine/stats"] });
    },
    onError: () => toast({ title: "Content generation failed", variant: "destructive" }),
  });

  const refreshMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seo-engine/run-refresh"),
    onSuccess: async (r: any) => {
      const d = await r.json().catch(() => ({}));
      toast({ title: "Refresh cycle run", description: `${d.refreshed ?? 0} refreshed, ${d.failed ?? 0} failed` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo-engine/refresh-queue"] });
    },
    onError: () => toast({ title: "Refresh failed", variant: "destructive" }),
  });

  const linkingMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seo-engine/run-linking"),
    onSuccess: () => toast({ title: "Internal linking updated" }),
    onError: () => toast({ title: "Linking failed", variant: "destructive" }),
  });

  const registerMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seo-engine/register-pages"),
    onSuccess: async (r: any) => {
      const d = await r.json().catch(() => ({}));
      toast({ title: "Pages registered", description: d.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo-engine/stats"] });
    },
    onError: () => toast({ title: "Registration failed", variant: "destructive" }),
  });

  const anyPending = discoverMut.isPending || generateMut.isPending || refreshMut.isPending || linkingMut.isPending || registerMut.isPending;

  return (
    <div className="space-y-6" data-testid="panel-seo-engine">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">SEO Growth Engine — bmv.vin</h2>
          <p className="text-sm text-muted-foreground">Keyword discovery, AI content generation, 90-day refresh cycle, internal linking</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm" variant="outline"
            onClick={() => { refetchStats(); }}
            data-testid="button-refresh-stats"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => registerMut.mutate()}
            disabled={anyPending}
            data-testid="button-register-pages"
          >
            {registerMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
            Register Pages
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => discoverMut.mutate()}
            disabled={anyPending}
            data-testid="button-discover-keywords"
          >
            {discoverMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5 mr-1.5" />}
            Discover Keywords
          </Button>
          <Button
            size="sm"
            onClick={() => generateMut.mutate()}
            disabled={anyPending}
            data-testid="button-generate-content"
          >
            {generateMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
            Generate Content (3)
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => refreshMut.mutate()}
            disabled={anyPending}
            data-testid="button-run-refresh"
          >
            {refreshMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Clock className="w-3.5 h-3.5 mr-1.5" />}
            Run Refresh
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => linkingMut.mutate()}
            disabled={anyPending}
            data-testid="button-run-linking"
          >
            {linkingMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5 mr-1.5" />}
            Update Links
          </Button>
        </div>
      </div>

      {/* Stats tiles */}
      {statsLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading stats…</div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Keywords" value={stats.totalKeywords} sub="in seo_keywords" icon={TrendingUp} color="bg-blue-500" />
          <StatTile label="Content Pages" value={stats.totalPages} sub="across all templates" icon={BookOpen} color="bg-green-500" />
          <StatTile label="Published Guides" value={stats.publishedGuides} sub={`${stats.recentlyGeneratedGuides} this week`} icon={Zap} color="bg-purple-500" />
          <StatTile label="Pending Refreshes" value={stats.pendingRefreshes} sub={`${stats.overdueRefreshes} overdue`} icon={Clock} color="bg-orange-500" />
        </div>
      ) : null}

      {/* Intent breakdown */}
      {stats && Object.keys(stats.keywordsByIntent).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Keywords by Intent</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.keywordsByIntent).sort((a, b) => b[1] - a[1]).map(([intent, count]) => (
                <Badge key={intent} variant="secondary" className={INTENT_COLOR[intent] ?? ""} data-testid={`badge-intent-${intent}`}>
                  {intent}: {count.toLocaleString()}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pages by type */}
      {stats && Object.keys(stats.pagesByType).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pages by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.pagesByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <Badge key={type} variant="outline" data-testid={`badge-type-${type}`}>
                  {type}: {count.toLocaleString()}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column grid: top keywords + refresh queue */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Top keywords */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Keywords by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            {kwLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="space-y-1 text-sm">
                {(kwData?.keywords ?? []).slice(0, 15).map((kw, i) => (
                  <div key={kw.keyword} className="flex items-start justify-between gap-2 py-0.5 border-b border-border/50 last:border-0" data-testid={`row-keyword-${i}`}>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{kw.keyword}</span>
                      {kw.pageTargeting && (
                        <a href={`https://bmv.vin${kw.pageTargeting}`} target="_blank" rel="noopener" className="text-xs text-primary truncate block">
                          {kw.pageTargeting}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className={`text-xs ${INTENT_COLOR[kw.intent] ?? ""}`}>{kw.intent}</Badge>
                      {kw.volume != null && (
                        <span className="text-xs text-muted-foreground">{kw.volume.toLocaleString()}/mo</span>
                      )}
                    </div>
                  </div>
                ))}
                {!kwData?.keywords?.length && <p className="text-muted-foreground text-xs">No keywords yet — click Discover Keywords</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Refresh queue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Refresh Queue (Pending)</CardTitle>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="space-y-1 text-sm">
                {(queueData?.queue ?? []).slice(0, 12).map((item, i) => (
                  <div key={item.url} className="flex items-center justify-between gap-2 py-0.5 border-b border-border/50 last:border-0" data-testid={`row-queue-${i}`}>
                    <div className="flex-1 min-w-0">
                      <span className="truncate block font-mono text-xs">{item.url}</span>
                      <span className="text-xs text-muted-foreground">Due: {new Date(item.dueAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-xs">{item.pageType}</Badge>
                      <Badge variant={item.status === "failed" ? "destructive" : "secondary"} className="text-xs">{item.status}</Badge>
                    </div>
                  </div>
                ))}
                {!queueData?.queue?.length && (
                  <p className="text-muted-foreground text-xs">Queue is empty — generate content to populate</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* GEO / AI Overview audit reminder */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-1">GEO / AI Overview Checklist</h3>
          <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
            <li>Every page has a 2-3 sentence Quick Answer box (Featured Snippet target)</li>
            <li>All tool pages carry FAQPage + HowTo schema</li>
            <li>Model VIN pages carry Vehicle + FAQPage schema</li>
            <li>Stats pages carry Dataset + Article schema</li>
            <li>VIN result pages canonical to /bmw-vin-decoder</li>
            <li>Carvertical affiliate embedded on all buyer-intent guides</li>
            <li>BMV.parts cross-link on all model VIN pages</li>
            <li>Sitemaps: /sitemap-tools.xml, /sitemap-models.xml, /sitemap-guides.xml</li>
          </ul>
        </CardContent>
      </Card>

      {/* Template links */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Template Pages (Preview)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[
              { label: "VIN Decoder Hub", href: "/bmw-vin-decoder" },
              { label: "Build Sheet", href: "/bmw-build-sheet-lookup" },
              { label: "Paint Code", href: "/bmw-paint-code-lookup" },
              { label: "Production Date", href: "/bmw-production-date-lookup" },
              { label: "Engine Code", href: "/bmw-engine-code-lookup" },
              { label: "Options Lookup", href: "/bmw-options-lookup" },
              { label: "Plant Code", href: "/bmw-plant-code-lookup" },
              { label: "Model Year", href: "/bmw-model-year-lookup" },
              { label: "Compare Decoders", href: "/compare/best-bmw-vin-decoders" },
              { label: "Top Options", href: "/data/most-popular-bmw-options" },
              { label: "Top Colours", href: "/data/most-common-bmw-paint-colours" },
              { label: "Plant Stats", href: "/data/bmw-production-plant-stats" },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={`https://bmv.vin${href}`}
                target="_blank"
                rel="noopener"
                className="p-2 border border-border rounded text-center hover:bg-muted transition-colors"
                data-testid={`link-template-${href.slice(1)}`}
              >
                {label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
