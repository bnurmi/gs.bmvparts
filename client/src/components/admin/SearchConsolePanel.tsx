import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Search, TrendingUp, AlertTriangle, CheckCircle, XCircle,
  ChevronUp, ChevronDown, Loader2, Sparkles, ExternalLink,
  Info, RefreshCw, KeyRound
} from "lucide-react";

interface GscStatus {
  configured: boolean;
  valid?: boolean;
  email?: string;
  properties?: string[];
  source?: "env" | "db";
  error?: string;
}

interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface CoverageIssue {
  reason: string;
  urls: string[];
}

interface CoverageResponse {
  issues: CoverageIssue[];
  sampleSize: number;
  totalSampled: number;
  dataSource: string;
  note?: string;
}

interface AiRecommendation {
  priority: "high" | "medium" | "low";
  type: string;
  suggestion: string;
  editorialLink?: string;
}

const DATE_RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "28", label: "Last 28 days" },
  { value: "90", label: "Last 90 days" },
];

const PROPERTIES = [
  { value: "sc-domain:bmv.parts", label: "bmv.parts" },
  { value: "sc-domain:bmv.vin", label: "bmv.vin" },
];

const DIMENSIONS = [
  { value: "query", label: "Queries" },
  { value: "page", label: "Pages" },
];

type SortKey = "clicks" | "impressions" | "ctr" | "position";

function SetupInstructions({ onSaved }: { onSaved: (status: GscStatus) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/gsc/save-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ json: jsonText }),
      });
      const data = await res.json() as GscStatus & { error?: string };
      if (!res.ok || !data.valid) {
        setError(data.error ?? "Failed to save credentials");
      } else {
        toast({ title: "Connected", description: `Authenticated as ${data.email}` });
        setJsonText("");
        setExpanded(false);
        onSaved(data);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-testid="card-gsc-setup">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="w-4 h-4 text-blue-500" />
          Connect Google Search Console
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Follow these steps to link your Google service account with the GSC dashboard.
        </p>
        <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
          <li>
            <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 inline-flex items-center gap-1">
              Google Cloud Console <ExternalLink className="w-3 h-3" />
            </a>{" "}→ create a service account and download a JSON key.
          </li>
          <li>Enable the <strong>Google Search Console API</strong> for the project.</li>
          <li>In Google Search Console, add the service account email as a <strong>Restricted</strong> user on each property.</li>
          <li>Paste the downloaded JSON key below and click <strong>Save &amp; connect</strong>.</li>
        </ol>

        <div>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus:outline-none"
            data-testid="button-toggle-gsc-json"
            aria-expanded={expanded}
          >
            <KeyRound className="w-3.5 h-3.5" />
            {expanded ? "Hide JSON key field" : "Paste service account JSON key"}
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3">
              <textarea
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                rows={7}
                placeholder='{"type":"service_account","project_id":"...","client_email":"...@....iam.gserviceaccount.com","private_key":"-----BEGIN RSA PRIVATE KEY-----\n..."}'
                className="w-full border rounded-md p-2 text-xs font-mono bg-background resize-none"
                data-testid="textarea-gsc-json"
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive" data-testid="text-gsc-error">{error}</p>
              )}
              <Button
                onClick={handleSave}
                disabled={!jsonText.trim() || saving}
                data-testid="button-save-gsc-credentials"
                className="gap-1.5"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Validating & connecting…" : "Save & connect"}
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Alternatively, set the <code className="bg-muted px-1 py-0.5 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> environment variable (takes precedence over the key saved above).
        </p>
      </CardContent>
    </Card>
  );
}

function SortIcon({ field, sortKey, sortDir }: { field: SortKey; sortKey: SortKey; sortDir: "asc" | "desc" }) {
  if (sortKey !== field) return null;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
}

function AiFixesPanel({ url, type, metrics, onClose }: {
  url: string;
  type: "page" | "query";
  metrics: { clicks: number; impressions: number; ctr: number; position: number };
  onClose: () => void;
}) {
  const { toast } = useToast();

  const recommendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/gsc/recommend", { url, type, metrics });
      return res.json() as Promise<{ recommendations: AiRecommendation[] }>;
    },
    onError: (e: unknown) => toast({ title: "AI recommendations failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  const priorityColor = (p: AiRecommendation["priority"]) => {
    if (p === "high") return "destructive";
    if (p === "medium") return "default";
    return "secondary";
  };

  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-3" data-testid="panel-ai-fixes">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="w-4 h-4 text-purple-500" />
          AI Recommendations for{" "}
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[240px]">{url}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">Dismiss</Button>
      </div>

      {!recommendMutation.data && !recommendMutation.isPending && (
        <Button
          size="sm"
          onClick={() => recommendMutation.mutate()}
          data-testid="button-get-ai-fixes"
          className="gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" /> Get AI fixes
        </Button>
      )}

      {recommendMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Analysing with AI…
        </div>
      )}

      {recommendMutation.data && (
        <div className="space-y-2">
          {recommendMutation.data.recommendations.map((r, i) => (
            <div key={i} className="border rounded-md p-2.5 bg-background" data-testid={`ai-rec-${i}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={priorityColor(r.priority)} className="text-[10px]">{r.priority}</Badge>
                  <span className="text-xs font-medium text-muted-foreground">{r.type}</span>
                </div>
              </div>
              <p className="text-sm">{r.suggestion}</p>
              {r.editorialLink && (
                <a
                  href={r.editorialLink}
                  className="text-xs text-primary underline underline-offset-2 mt-1 inline-flex items-center gap-1"
                  data-testid={`link-editorial-${i}`}
                >
                  Go to editorial <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchConsolePanel() {
  const [property, setProperty] = useState(PROPERTIES[0].value);
  const [dateRange, setDateRange] = useState("28");
  const [dimension, setDimension] = useState("query");
  const [sortKey, setSortKey] = useState<SortKey>("impressions");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const status = useQuery<GscStatus>({
    queryKey: ["/api/admin/gsc/status"],
  });

  const removeCredentials = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/gsc/credentials", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to remove credentials");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gsc/status"] });
      toast({ title: "Credentials removed" });
    },
    onError: (e: unknown) => toast({ title: "Remove failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  const analyticsQuery = useQuery<{ rows: SearchAnalyticsRow[] }>({
    queryKey: ["/api/admin/gsc/search-analytics", property, dateRange, dimension],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/gsc/search-analytics?siteUrl=${encodeURIComponent(property)}&dateRange=${dateRange}&dimension=${dimension}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!status.data?.valid,
    staleTime: 5 * 60 * 1000,
  });

  const coverageQuery = useQuery<CoverageResponse>({
    queryKey: ["/api/admin/gsc/coverage", property],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/gsc/coverage?siteUrl=${encodeURIComponent(property)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!status.data?.valid,
    staleTime: 10 * 60 * 1000,
  });

  const [isBusting, setIsBusting] = useState(false);

  async function handleRefresh() {
    setIsBusting(true);
    try {
      const [analyticsRes, coverageRes] = await Promise.all([
        fetch(
          `/api/admin/gsc/search-analytics?siteUrl=${encodeURIComponent(property)}&dateRange=${dateRange}&dimension=${dimension}&bust=1`,
          { credentials: "include" }
        ),
        fetch(
          `/api/admin/gsc/coverage?siteUrl=${encodeURIComponent(property)}&bust=1`,
          { credentials: "include" }
        ),
      ]);
      if (analyticsRes.ok) {
        queryClient.setQueryData(
          ["/api/admin/gsc/search-analytics", property, dateRange, dimension],
          await analyticsRes.json()
        );
      } else {
        analyticsQuery.refetch();
      }
      if (coverageRes.ok) {
        queryClient.setQueryData(
          ["/api/admin/gsc/coverage", property],
          await coverageRes.json()
        );
      } else {
        coverageQuery.refetch();
      }
    } catch {
      analyticsQuery.refetch();
      coverageQuery.refetch();
    } finally {
      setIsBusting(false);
    }
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedRows = [...(analyticsQuery.data?.rows ?? [])].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const fmtCtr = (ctr: number) => `${(ctr * 100).toFixed(1)}%`;
  const fmtPos = (pos: number) => pos.toFixed(1);

  if (status.isLoading) {
    return (
      <div className="space-y-3" data-testid="section-gsc-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!status.data?.configured) {
    return (
      <SetupInstructions
        onSaved={(newStatus) => queryClient.setQueryData<GscStatus>(["/api/admin/gsc/status"], newStatus)}
      />
    );
  }

  if (!status.data?.valid) {
    return (
      <div className="space-y-4" data-testid="card-gsc-invalid">
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Credential error</span>
            </div>
            <p className="text-xs text-muted-foreground">{status.data?.error || "Could not authenticate with Google Search Console."}</p>
          </CardContent>
        </Card>
        <SetupInstructions
          onSaved={(newStatus) => queryClient.setQueryData<GscStatus>(["/api/admin/gsc/status"], newStatus)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="section-search-console">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Search className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold">Search Console</h2>
          <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" />
            <span data-testid="text-gsc-email">{status.data.email}</span>
            {status.data.source === "db" && (
              <span className="ml-1 text-muted-foreground">(saved in panel)</span>
            )}
          </div>
          {status.data.source === "db" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => removeCredentials.mutate()}
              disabled={removeCredentials.isPending}
              data-testid="button-remove-gsc-credentials"
            >
              {removeCredentials.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Remove"}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={property} onValueChange={setProperty}>
            <SelectTrigger className="h-8 text-xs w-36" data-testid="select-gsc-property">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTIES.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-8 text-xs w-36" data-testid="select-gsc-daterange">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map(d => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dimension} onValueChange={setDimension}>
            <SelectTrigger className="h-8 text-xs w-28" data-testid="select-gsc-dimension">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIMENSIONS.map(d => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleRefresh}
            disabled={isBusting}
            data-testid="button-gsc-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusting || analyticsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <section data-testid="section-gsc-analytics">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">
            Top {dimension === "query" ? "Queries" : "Pages"}
          </h3>
          {analyticsQuery.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>

        {analyticsQuery.isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : analyticsQuery.isError ? (
          <div className="text-sm text-destructive flex items-center gap-1.5 border rounded-lg p-3">
            <XCircle className="w-4 h-4" />
            Failed to load analytics data. The property may not be configured in Search Console.
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
            No data available for this property and date range.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_5rem_6rem_5rem_5rem_6rem] text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-2 border-b">
              <span>{dimension === "query" ? "Query" : "Page"}</span>
              <button className="text-right hover:text-foreground transition-colors" onClick={() => handleSort("clicks")} data-testid="sort-clicks">
                Clicks <SortIcon field="clicks" sortKey={sortKey} sortDir={sortDir} />
              </button>
              <button className="text-right hover:text-foreground transition-colors" onClick={() => handleSort("impressions")} data-testid="sort-impressions">
                Impressions <SortIcon field="impressions" sortKey={sortKey} sortDir={sortDir} />
              </button>
              <button className="text-right hover:text-foreground transition-colors" onClick={() => handleSort("ctr")} data-testid="sort-ctr">
                CTR <SortIcon field="ctr" sortKey={sortKey} sortDir={sortDir} />
              </button>
              <button className="text-right hover:text-foreground transition-colors" onClick={() => handleSort("position")} data-testid="sort-position">
                Pos. <SortIcon field="position" sortKey={sortKey} sortDir={sortDir} />
              </button>
              <span className="text-right">AI Fixes</span>
            </div>
            {sortedRows.map((row, idx) => {
              const key = row.keys[0] ?? "";
              const isExpanded = expandedRow === key;
              return (
                <div key={idx} className="border-b last:border-0" data-testid={`gsc-row-${idx}`}>
                  <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_5rem_6rem_5rem_5rem_6rem] px-3 py-2 text-sm items-center gap-2">
                    <div className="truncate font-mono text-xs" title={key}>{key}</div>
                    <div className="hidden md:block text-right tabular-nums">{row.clicks.toLocaleString()}</div>
                    <div className="hidden md:block text-right tabular-nums">{row.impressions.toLocaleString()}</div>
                    <div className="hidden md:block text-right tabular-nums">{fmtCtr(row.ctr)}</div>
                    <div className="hidden md:block text-right tabular-nums">
                      <span className={row.position <= 10 ? "text-emerald-600 dark:text-emerald-400" : row.position <= 20 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}>
                        {fmtPos(row.position)}
                      </span>
                    </div>
                    <div className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => setExpandedRow(isExpanded ? null : key)}
                        data-testid={`button-ai-fixes-${idx}`}
                      >
                        <Sparkles className="w-3 h-3 text-purple-500" />
                        <span className="hidden md:inline">AI fixes</span>
                      </Button>
                    </div>
                    <div className="md:hidden col-span-2 text-xs text-muted-foreground grid grid-cols-4 gap-1 mt-1">
                      <span>{row.clicks.toLocaleString()} clicks</span>
                      <span>{row.impressions.toLocaleString()} imp.</span>
                      <span>{fmtCtr(row.ctr)} CTR</span>
                      <span>#{fmtPos(row.position)}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <AiFixesPanel
                        url={key}
                        type={dimension === "query" ? "query" : "page"}
                        metrics={{ clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }}
                        onClose={() => setExpandedRow(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section data-testid="section-gsc-coverage">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="font-medium text-sm">Coverage Issues</h3>
          {coverageQuery.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Pages sampled from your sitemap and inspected via the URL Inspection API, grouped by coverage state.
          {coverageQuery.data && (
            <span className="ml-1">
              Inspected {coverageQuery.data.sampleSize} of {coverageQuery.data.totalSampled} sampled URLs.
            </span>
          )}
        </p>
        {coverageQuery.data?.note && (
          <div className="text-xs text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-3 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            {coverageQuery.data.note}
          </div>
        )}

        {coverageQuery.isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : coverageQuery.isError ? (
          <div className="text-sm text-muted-foreground border rounded-lg p-3 flex items-center gap-1.5">
            <Info className="w-4 h-4" />
            Coverage data unavailable for this property.
          </div>
        ) : !coverageQuery.data?.issues?.length ? (
          <div className="text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            No coverage issues found in the sampled pages — all inspected URLs are indexed.
          </div>
        ) : (
          <div className="space-y-3">
            {coverageQuery.data.issues.map((issue, i) => (
              <div key={i} className="border rounded-lg p-3" data-testid={`coverage-issue-${i}`}>
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-medium">{issue.reason}</span>
                  <Badge variant="outline" className="text-[10px]">{issue.urls.length} page{issue.urls.length !== 1 ? "s" : ""}</Badge>
                </div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {issue.urls.map((url, j) => (
                    <a
                      key={j}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-muted-foreground hover:text-foreground bg-muted/30 px-2 py-1 rounded truncate flex items-center gap-1 transition-colors"
                      data-testid={`coverage-url-${i}-${j}`}
                    >
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                      {url}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
