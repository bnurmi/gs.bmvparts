import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Activity, DollarSign, AlertTriangle, CheckCircle, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ────────────────────────────────────────────────────────────────────

type Provider =
  | "evomi_core"
  | "evomi_premium"
  | "oxylabs_residential"
  | "oxylabs_webscraper"
  | "direct";

type Scraper = "etk" | "realoem" | "bimmerwork" | "vin_decoders" | "hash_discovery" | "bmw_firstparty" | "vindecoderz";

interface ProviderStats {
  requests: number;
  bytes: number;
  estimatedAud: number;
}

interface WindowStats {
  requests: number;
  bytes: number;
  successRate: number;
  estimatedAud: number;
  byProvider: Record<string, ProviderStats>;
}

interface ScraperUsage {
  scraper: Scraper;
  primaryProvider: Provider;
  backupProvider: Provider;
  windows: Record<"1h" | "12h" | "24h" | "7d" | "30d", WindowStats>;
}

interface ProxyStatus {
  scraper: string;
  primaryProvider: Provider;
  backupProvider: Provider;
  activeRole: "primary" | "fallback" | "down";
  activeProvider: Provider;
  since: number;
}

interface ProxyStatusResponse {
  statuses: ProxyStatus[];
  vindecoderzEnabled: boolean;
}

interface RealoemBudget {
  day: string;
  used: number;
  limit: number;
  remaining: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<Provider, string> = {
  evomi_core: "Evomi Core ($0.49/GB)",
  evomi_premium: "Evomi Premium ($5/GB)",
  oxylabs_residential: "Oxylabs Residential ($7/GB)",
  oxylabs_webscraper: "Oxylabs Scraper API (~$68/GB)",
  direct: "Direct (no proxy)",
};

const SCRAPER_LABELS: Record<Scraper, string> = {
  etk: "ETK (bmw-etk.info)",
  realoem: "RealOEM",
  bimmerwork: "Bimmer.work pages",
  vin_decoders: "VIN decoders (bvzine / mdecoder)",
  hash_discovery: "Hash discovery (search engines)",
  bmw_firstparty: "BMW first-party",
  vindecoderz: "vindecoderz.com",
};

const ALL_PROVIDERS: Provider[] = [
  "evomi_core",
  "evomi_premium",
  "oxylabs_residential",
  "oxylabs_webscraper",
  "direct",
];

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtAud(aud: number): string {
  if (aud < 0.001) return "< $0.001";
  return `$${aud.toFixed(4)}`;
}

function roleColor(role: string): "default" | "destructive" | "secondary" {
  if (role === "primary") return "default";
  if (role === "fallback") return "secondary";
  return "destructive";
}

// ── Status cards row ─────────────────────────────────────────────────────────

function StatusRow({ statuses, vindecoderzEnabled }: { statuses: ProxyStatus[]; vindecoderzEnabled: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="proxy-status-grid">
      {statuses.map((s) => (
        <Card key={s.scraper} className="border" data-testid={`proxy-status-card-${s.scraper}`}>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm font-medium truncate">
              {SCRAPER_LABELS[s.scraper as Scraper] ?? s.scraper}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={roleColor(s.activeRole)} className="text-xs">
                {s.activeRole === "down" ? "DOWN" : s.activeRole === "fallback" ? "FALLBACK" : "OK"}
              </Badge>
              <span className="text-xs text-muted-foreground truncate">
                {PROVIDER_LABELS[s.activeProvider] ?? s.activeProvider}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Primary: <span className="font-mono">{s.primaryProvider}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Backup: <span className="font-mono">{s.backupProvider}</span>
            </p>
            {s.scraper === "vindecoderz" && !vindecoderzEnabled && (
              <div
                className="flex items-center gap-1.5 mt-1 pt-1 border-t"
                data-testid="badge-vindecoderz-disabled"
              >
                <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                  vindecoderz: disabled (no premium proxy)
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Usage table ──────────────────────────────────────────────────────────────

const WINDOWS: Array<{ key: "1h" | "12h" | "24h" | "7d" | "30d"; label: string }> = [
  { key: "1h", label: "1 h" },
  { key: "12h", label: "12 h" },
  { key: "24h", label: "24 h" },
  { key: "7d", label: "7 d" },
  { key: "30d", label: "30 d" },
];

function UsageTable({ usage, window: w }: { usage: ScraperUsage[]; window: "1h" | "12h" | "24h" | "7d" | "30d" }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(s: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }
  return (
    <div className="overflow-x-auto rounded-md border" data-testid="proxy-usage-table">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Scraper</th>
            <th className="text-right px-3 py-2 font-medium">Requests</th>
            <th className="text-right px-3 py-2 font-medium">Data</th>
            <th className="text-right px-3 py-2 font-medium">Success %</th>
            <th className="text-right px-3 py-2 font-medium">Est. cost (AUD)</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((row) => {
            const wData = row.windows[w];
            const providerEntries = Object.entries(wData.byProvider ?? {});
            const isExpanded = expanded.has(row.scraper);
            return (
              <Fragment key={row.scraper}>
                <tr
                  className={`border-t cursor-pointer hover:bg-muted/30 ${isExpanded ? "bg-muted/20" : ""}`}
                  onClick={() => providerEntries.length > 0 && toggle(row.scraper)}
                  data-testid={`proxy-usage-row-${row.scraper}`}
                >
                  <td className="px-3 py-2 font-medium text-xs flex items-center gap-1">
                    {providerEntries.length > 0 && (
                      <span className="text-muted-foreground">{isExpanded ? "▼" : "▶"}</span>
                    )}
                    {SCRAPER_LABELS[row.scraper as Scraper] ?? row.scraper}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{wData.requests.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtBytes(wData.bytes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={wData.successRate < 0.8 ? "text-destructive font-medium" : ""}>
                      {(wData.successRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtAud(wData.estimatedAud)}</td>
                </tr>
                {isExpanded && providerEntries.map(([prov, ps]) => (
                  <tr key={`${row.scraper}-${prov}`} className="bg-muted/10 text-xs text-muted-foreground">
                    <td className="px-3 py-1.5 pl-8 italic">{PROVIDER_LABELS[prov as Provider] ?? prov}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{ps.requests.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtBytes(ps.bytes)}</td>
                    <td className="px-3 py-1.5 text-right" />
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtAud(ps.estimatedAud)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Config override row ──────────────────────────────────────────────────────

function ConfigRow({ usage }: { usage: ScraperUsage[] }) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, { primary: Provider; backup: Provider }>>(() =>
    Object.fromEntries(usage.map((u) => [u.scraper, { primary: u.primaryProvider, backup: u.backupProvider }]))
  );

  const mutation = useMutation({
    mutationFn: ({ scraper, primary, backup }: { scraper: string; primary: string; backup: string }) =>
      apiRequest("PATCH", `/api/admin/proxy/config/${scraper}`, { primary, backup }),
    onSuccess: (_data, vars) => {
      toast({ title: "Saved", description: `Routing updated for ${vars.scraper}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy/usage"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to save", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3" data-testid="proxy-config-section">
      {usage.map((row) => {
        const draft = drafts[row.scraper] ?? { primary: row.primaryProvider, backup: row.backupProvider };
        const changed = draft.primary !== row.primaryProvider || draft.backup !== row.backupProvider;
        return (
          <div
            key={row.scraper}
            className="flex flex-wrap items-center gap-3 p-3 rounded-md border bg-muted/30"
            data-testid={`proxy-config-row-${row.scraper}`}
          >
            <span className="text-sm font-medium w-44 shrink-0">
              {SCRAPER_LABELS[row.scraper as Scraper] ?? row.scraper}
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">Primary</span>
              <Select
                value={draft.primary}
                onValueChange={(v) => setDrafts((d) => ({ ...d, [row.scraper]: { ...d[row.scraper], primary: v as Provider } }))}
              >
                <SelectTrigger className="h-8 w-52" data-testid={`select-primary-${row.scraper}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">Backup</span>
              <Select
                value={draft.backup}
                onValueChange={(v) => setDrafts((d) => ({ ...d, [row.scraper]: { ...d[row.scraper], backup: v as Provider } }))}
              >
                <SelectTrigger className="h-8 w-52" data-testid={`select-backup-${row.scraper}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!changed || mutation.isPending}
              onClick={() => mutation.mutate({ scraper: row.scraper, primary: draft.primary, backup: draft.backup })}
              data-testid={`button-save-proxy-${row.scraper}`}
            >
              Save
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ── RealOEM budget widget ─────────────────────────────────────────────────────

function RealoemBudgetCard({ budget }: { budget: RealoemBudget }) {
  const pct = budget.limit > 0 ? Math.min(100, (budget.used / budget.limit) * 100) : 0;
  const warn = pct > 80;
  return (
    <Card data-testid="realoem-budget-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {warn ? <AlertTriangle className="w-4 h-4 text-yellow-500" /> : <CheckCircle className="w-4 h-4 text-green-500" />}
          RealOEM Daily Budget
        </CardTitle>
        <CardDescription className="text-xs">Resets at UTC midnight · {budget.day}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>{budget.used.toLocaleString()} used</span>
          <span>{budget.remaining.toLocaleString()} remaining / {budget.limit.toLocaleString()} limit</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${warn ? "bg-yellow-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
            data-testid="realoem-budget-bar"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function ProxyDashboardPanel() {
  const [activeWindow, setActiveWindow] = useState<"1h" | "12h" | "24h" | "7d" | "30d">("24h");

  const statusQuery = useQuery<ProxyStatusResponse>({
    queryKey: ["/api/admin/proxy/status"],
    refetchInterval: 30_000,
  });

  const usageQuery = useQuery<{ usage: ScraperUsage[]; realoem: RealoemBudget }>({
    queryKey: ["/api/admin/proxy/usage"],
    refetchInterval: 60_000,
  });

  const isLoading = statusQuery.isLoading || usageQuery.isLoading;

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy/usage"] });
  }

  return (
    <div className="space-y-6" data-testid="panel-proxy-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5" /> Proxy Router Dashboard
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Per-scraper proxy routing, live status, cost tracking, and provider overrides.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-proxy">
          <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Live status */}
      <section>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <Activity className="w-4 h-4" /> Live Scraper Status
        </h3>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <StatusRow statuses={statusQuery.data?.statuses ?? []} vindecoderzEnabled={statusQuery.data?.vindecoderzEnabled ?? true} />
        )}
      </section>

      {/* RealOEM budget */}
      {usageQuery.data?.realoem && (
        <RealoemBudgetCard budget={usageQuery.data.realoem} />
      )}

      {/* Usage stats */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <DollarSign className="w-4 h-4" /> Usage &amp; Cost
          </h3>
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w.key}
                variant={activeWindow === w.key ? "default" : "outline"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setActiveWindow(w.key)}
                data-testid={`button-window-${w.key}`}
              >
                {w.label}
              </Button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <UsageTable usage={usageQuery.data?.usage ?? []} window={activeWindow} />
        )}
      </section>

      {/* Provider config */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Provider Routing Overrides</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Changes are persisted to the database and take effect within 5 minutes (config cache TTL).
          Defaults are restored on next deploy only if the DB row is deleted.
        </p>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <ConfigRow usage={usageQuery.data?.usage ?? []} />
        )}
      </section>
    </div>
  );
}
