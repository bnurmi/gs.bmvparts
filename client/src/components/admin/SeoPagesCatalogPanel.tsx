import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ExternalLink, RefreshCw, Search, FileText, Loader2,
  TrendingUp, Globe, CheckCircle, XCircle, ToggleLeft, ToggleRight,
  DollarSign, Zap, Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function usd(n: number) {
  return `$${n.toFixed(4)}`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Types — Pages tab
// ---------------------------------------------------------------------------

interface SchedulerStatus {
  enabled: boolean;
  source: "db" | "env";
}

interface SeoPageRow {
  id: string;
  source: "seo_content_pages" | "bmv_vin_guide";
  url: string;
  pageType: string;
  project: string;
  primaryKeyword: string | null;
  wordCount: number | null;
  generatedAt: string;
  published: boolean;
}

interface SeoPageStats {
  total: number;
  byProject: Record<string, number>;
  byType: Record<string, number>;
}

interface SeoPageResponse {
  rows: SeoPageRow[];
  total: number;
  page: number;
  limit: number;
  stats: SeoPageStats;
}

// ---------------------------------------------------------------------------
// Types — AI Cost tab
// ---------------------------------------------------------------------------

interface AiUsageSummary {
  allTime: number;
  last30Days: number;
  last7Days: number;
  today: number;
  byFeature: { feature: string; callCount: number; totalTokens: number; costUsd: number }[];
  byModel: { model: string; callCount: number; totalTokens: number; costUsd: number }[];
  dailySpend: { date: string; costUsd: number }[];
}

interface AiUsageLogsResponse {
  logs: {
    id: number;
    feature: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    createdAt: string;
  }[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Small shared sub-components
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const PROJECT_HOST: Record<string, string> = {
  "bmv.parts": "https://bmv.parts",
  "bmv.vin":   "https://bmv.vin",
};

function projectBadgeClass(project: string): string {
  if (project === "bmv.parts") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  if (project === "bmv.vin")   return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
  return "";
}

function buildUrl(row: SeoPageRow): string {
  const host = PROJECT_HOST[row.project] ?? "";
  return `${host}${row.url}`;
}

function CostCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-semibold mt-1" data-testid={`text-ai-cost-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
          </div>
          <div className="text-muted-foreground opacity-60">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyChart({ data }: { data: { date: string; costUsd: number }[] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const max = Math.max(...data.map(d => d.costUsd), 0.001);
  return (
    <div className="space-y-1" data-testid="chart-daily-spend">
      {data.map(d => (
        <div key={d.date} className="flex items-center gap-2 text-xs">
          <span className="w-24 text-muted-foreground shrink-0">{d.date.slice(5)}</span>
          <div className="flex-1 bg-muted rounded-sm overflow-hidden h-4 relative">
            <div
              className="h-full bg-primary/70 rounded-sm"
              style={{ width: `${Math.max((d.costUsd / max) * 100, d.costUsd > 0 ? 1 : 0)}%` }}
            />
          </div>
          <span className="w-16 text-right font-mono shrink-0">{usd(d.costUsd)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scheduler toggle card — shared between tabs so it stays visible everywhere
// ---------------------------------------------------------------------------

function SchedulerCard() {
  const { toast } = useToast();

  const schedulerQuery = useQuery<SchedulerStatus>({
    queryKey: ["/api/admin/seo-scheduler/status"],
  });

  const toggleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seo-scheduler/toggle"),
    onSuccess: async (r: any) => {
      const d = await r.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo-scheduler/status"] });
      toast({
        title: d.enabled ? "Scheduler enabled" : "Scheduler paused",
        description: d.enabled
          ? "Keyword discovery and content generation will resume on next tick."
          : "Scheduler is paused. Existing pages are unaffected.",
      });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const isEnvLocked = schedulerQuery.data?.source === "env";
  const isEnabled   = schedulerQuery.data?.enabled ?? true;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isEnabled
            ? <ToggleRight className="w-4 h-4 text-green-500" />
            : <ToggleLeft  className="w-4 h-4 text-muted-foreground" />}
          SEO Growth Scheduler
        </CardTitle>
        <CardDescription className="text-xs">
          Controls automatic keyword discovery and AI content generation. Toggling this does not delete any
          existing pages — it only pauses future generation runs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          {schedulerQuery.isLoading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <>
              <Switch
                id="scheduler-toggle"
                checked={isEnabled}
                disabled={isEnvLocked || toggleMutation.isPending}
                onCheckedChange={() => toggleMutation.mutate()}
                data-testid="switch-scheduler-toggle"
              />
              <Label htmlFor="scheduler-toggle" className="text-sm cursor-pointer select-none">
                {isEnabled ? "Enabled" : "Paused"}
              </Label>
              {isEnvLocked && (
                <Badge variant="secondary" className="text-xs">
                  Hard-disabled via env var — cannot toggle from UI
                </Badge>
              )}
              {!isEnvLocked && (
                <span className="text-xs text-muted-foreground">
                  (persisted in DB — survives server restarts)
                </span>
              )}
              {toggleMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pages sub-tab
// ---------------------------------------------------------------------------

function PagesTab() {
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState("");
  const [project,      setProject]      = useState("all");
  const [type,         setType]         = useState("all");
  const [searchInput,  setSearchInput]  = useState("");

  const pagesQueryKey = ["/api/admin/seo-pages", page, project, type, search] as const;
  const pagesQuery = useQuery<SeoPageResponse>({
    queryKey: pagesQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page:    String(page),
        limit:   String(PAGE_SIZE),
        project,
        type,
        search,
      });
      const res = await fetch(`/api/admin/seo-pages?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  const handleProjectChange = (v: string) => { setProject(v); setPage(1); };
  const handleTypeChange    = (v: string) => { setType(v);    setPage(1); };

  const stats      = pagesQuery.data?.stats;
  const rows       = pagesQuery.data?.rows ?? [];
  const total      = pagesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allTypes   = stats ? Object.keys(stats.byType).sort() : [];

  return (
    <div className="space-y-6">
      {/* Stats summary */}
      {stats || pagesQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Pages</p>
              {pagesQuery.isLoading
                ? <Skeleton className="h-7 w-16 mt-1" />
                : <p className="text-2xl font-bold mt-1" data-testid="stat-total-pages">{(stats?.total ?? 0).toLocaleString()}</p>
              }
            </CardContent>
          </Card>
          {pagesQuery.isLoading ? (
            <>
              <Card><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
              <Card><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
              <Card><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
            </>
          ) : stats && Object.entries(stats.byProject).map(([proj, count]) => (
            <Card key={proj}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{proj}</p>
                <p className="text-2xl font-bold mt-1" data-testid={`stat-project-${proj}`}>{count.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Page type badges */}
      {stats && Object.keys(stats.byType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
            <Badge
              key={t}
              variant={type === t ? "default" : "secondary"}
              className="cursor-pointer text-xs"
              onClick={() => handleTypeChange(type === t ? "all" : t)}
              data-testid={`badge-type-${t}`}
            >
              {t}: {c.toLocaleString()}
            </Badge>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search by keyword…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            data-testid="input-seo-search"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={handleSearch}
          data-testid="button-seo-search"
        >
          Search
        </Button>
        <Select value={project} onValueChange={handleProjectChange}>
          <SelectTrigger className="h-8 text-xs w-36" data-testid="select-project-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            <SelectItem value="bmv.parts">bmv.parts</SelectItem>
            <SelectItem value="bmv.vin">bmv.vin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-8 text-xs w-40" data-testid="select-type-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {allTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => pagesQuery.refetch()}
          disabled={pagesQuery.isFetching}
          data-testid="button-refresh-pages"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${pagesQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {total.toLocaleString()} pages
        </span>
      </div>

      {/* Pages table */}
      <div className="rounded-md border overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_5rem] text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-2 border-b">
          <span>URL / Keyword</span>
          <span>Type</span>
          <span>Project</span>
          <span>Words</span>
          <span>Generated</span>
          <span className="text-right">Published</span>
        </div>

        {pagesQuery.isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b px-3 py-2.5">
              <Skeleton className="h-4 w-full" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground" data-testid="empty-seo-pages">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No pages found{search ? ` matching "${search}"` : ""}</p>
          </div>
        ) : (
          rows.map(row => (
            <div
              key={`${row.source}-${row.id}`}
              className="border-b last:border-0 md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_5rem] px-3 py-2.5 text-sm items-center gap-2 hover:bg-muted/20 transition-colors"
              data-testid={`row-seo-page-${row.source}-${row.id}`}
            >
              <div className="min-w-0">
                <a
                  href={buildUrl(row)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline flex items-center gap-1 truncate"
                  data-testid={`link-seo-page-${row.source}-${row.id}`}
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="truncate">{row.url}</span>
                </a>
                {row.primaryKeyword && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{row.primaryKeyword}</p>
                )}
              </div>
              <div className="mt-1 md:mt-0">
                <Badge variant="outline" className="text-xs font-normal">{row.pageType}</Badge>
              </div>
              <div className="mt-1 md:mt-0">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${projectBadgeClass(row.project)}`}>
                  {row.project}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 md:mt-0">
                {row.wordCount != null ? `${row.wordCount.toLocaleString()}w` : "—"}
              </div>
              <div className="text-xs text-muted-foreground mt-1 md:mt-0">
                {row.generatedAt
                  ? new Date(row.generatedAt).toLocaleDateString("en-AU", { year: "2-digit", month: "short", day: "numeric" })
                  : "—"}
              </div>
              <div className="flex justify-start md:justify-end mt-1 md:mt-0">
                {row.published
                  ? <CheckCircle className="w-4 h-4 text-green-500" title="Published" />
                  : <XCircle    className="w-4 h-4 text-muted-foreground" title="Not published" />
                }
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || pagesQuery.isFetching}
            onClick={() => setPage(p => p - 1)}
            data-testid="button-prev-page"
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages || pagesQuery.isFetching}
            onClick={() => setPage(p => p + 1)}
            data-testid="button-next-page"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Cost sub-tab (previously the standalone AiUsagePanel)
// ---------------------------------------------------------------------------

function AiCostTab() {
  const [logsOffset, setLogsOffset] = useState(0);
  const LOGS_PAGE = 50;

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } =
    useQuery<AiUsageSummary>({
      queryKey: ["/api/admin/ai-usage/summary"],
      refetchInterval: 60_000,
    });

  const { data: logsData, isLoading: logsLoading } = useQuery<AiUsageLogsResponse>({
    queryKey: ["/api/admin/ai-usage/logs", logsOffset],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ai-usage/logs?limit=${LOGS_PAGE}&offset=${logsOffset}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/logs"] });
    refetchSummary();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">AI Usage &amp; Cost Tracking</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Estimated spend across all OpenAI call sites. Prices based on published per-token rates.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} data-testid="button-refresh-ai-usage">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CostCard label="All Time"     value={usd(summary?.allTime     ?? 0)} icon={<DollarSign className="w-5 h-5" />} />
          <CostCard label="Last 30 Days" value={usd(summary?.last30Days  ?? 0)} icon={<TrendingUp  className="w-5 h-5" />} />
          <CostCard label="Last 7 Days"  value={usd(summary?.last7Days   ?? 0)} icon={<Zap         className="w-5 h-5" />} />
          <CostCard label="Today"        value={usd(summary?.today       ?? 0)} icon={<Clock       className="w-5 h-5" />} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">By Feature</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-32" />
            ) : !summary?.byFeature.length ? (
              <p className="text-sm text-muted-foreground">No calls logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byFeature.map(f => (
                    <TableRow key={f.feature} data-testid={`row-feature-${f.feature}`}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">{f.feature}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{f.callCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{formatTokens(f.totalTokens)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{usd(f.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">By Model</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-32" />
            ) : !summary?.byModel.length ? (
              <p className="text-sm text-muted-foreground">No calls logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byModel.map(m => (
                    <TableRow key={m.model} data-testid={`row-model-${m.model}`}>
                      <TableCell><span className="font-mono text-xs">{m.model}</span></TableCell>
                      <TableCell className="text-right text-sm">{m.callCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{formatTokens(m.totalTokens)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{usd(m.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Daily Spend — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading ? <Skeleton className="h-48" /> : <DailyChart data={summary?.dailySpend ?? []} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Recent Calls
            {logsData && (
              <span className="text-muted-foreground font-normal ml-2 text-xs">
                ({logsData.total.toLocaleString()} total)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-48" />
          ) : !logsData?.logs.length ? (
            <p className="text-sm text-muted-foreground">No calls logged yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Prompt</TableHead>
                    <TableHead className="text-right">Completion</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData.logs.map(log => (
                    <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{log.feature}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.model}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatTokens(log.promptTokens)}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatTokens(log.completionTokens)}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{usd(log.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>
                  Showing {logsOffset + 1}–{Math.min(logsOffset + LOGS_PAGE, logsData.total)} of {logsData.total.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={logsOffset === 0}
                    onClick={() => setLogsOffset(Math.max(0, logsOffset - LOGS_PAGE))}
                    data-testid="button-logs-prev"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={logsOffset + LOGS_PAGE >= logsData.total}
                    onClick={() => setLogsOffset(logsOffset + LOGS_PAGE)}
                    data-testid="button-logs-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------

export default function SeoPagesCatalogPanel() {
  return (
    <div className="space-y-6" data-testid="panel-seo-pages">
      <SchedulerCard />
      <Tabs defaultValue="pages">
        <TabsList className="mb-4">
          <TabsTrigger value="pages" data-testid="tab-seo-pages-list">
            <Globe className="w-3.5 h-3.5 mr-1.5" /> Pages
          </TabsTrigger>
          <TabsTrigger value="cost" data-testid="tab-seo-ai-cost">
            <DollarSign className="w-3.5 h-3.5 mr-1.5" /> AI Cost
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pages">
          <PagesTab />
        </TabsContent>
        <TabsContent value="cost">
          <AiCostTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
