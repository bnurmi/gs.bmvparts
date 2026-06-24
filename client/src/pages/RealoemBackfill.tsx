import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Square, Download, ArrowLeft, RefreshCw, AlertTriangle, ChevronRight, ChevronDown } from "lucide-react";

type BackfillScope = "car" | "chassis" | "all";
const BACKFILL_SCOPES: readonly BackfillScope[] = ["car", "chassis", "all"];
function isBackfillScope(v: string): v is BackfillScope {
  return (BACKFILL_SCOPES as readonly string[]).includes(v);
}

interface BudgetStatus {
  day: string;
  used: number;
  limit: number;
  remaining: number;
}
interface BackfillStatus {
  running: boolean;
  cancelled: boolean;
  jobId: number | null;
  runId: number | null;
  scope: BackfillScope | null;
  scopeLabel: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  totalCars: number;
  carsProcessed: number;
  diagramsTotal: number;
  diagramsFetched: number;
  diagramsCached: number;
  diagramsSkippedFresh: number;
  partsInserted: number;
  newSubcategories: number;
  proxyRequestsAtStart: number;
  proxyRequestsUsed: number;
  errors: number;
  lastError: string | null;
  currentCar: string | null;
  currentDiagram: string | null;
  freshnessHours: number;
  budget: BudgetStatus;
  // Pre-step (variant-discovery) live counters. Populated only while
  // phase === "discovery"; the counters remain visible after the
  // sweep finishes so the operator can see what the pre-step found.
  phase?: "idle" | "discovery" | "main" | "post";
  discoveryChassisTotal?: number;
  discoveryChassisChecked?: number;
  discoveryCurrentChassis?: string | null;
  discoveryVariantsFound?: number;
  discoveryNewCarsInserted?: number;
  discoveryCatalogIdsBackfilled?: number;
}
interface BackfillRun {
  runId: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  scope: string | null;
  scopeLabel: string | null;
  totalCars: number;
  carsProcessed: number;
  diagramsFetched: number;
  diagramsCached: number;
  diagramsSkippedFresh: number;
  partsInserted: number;
  newSubcategories: number;
  errors: number;
  lastError: string | null;
  ledgerPartsInserted: number;
  ledgerDiagramsTouched: number;
  byChassis: Array<{ chassis: string; partsInserted: number; diagramsTouched: number }>;
}
interface EstimateResponse {
  ok: boolean;
  cars: number;
  chassisLandings: number;
  estimatedProxyRequests: number;
  budgetRemaining: number;
}

function StatusChip({ s }: { s: BackfillStatus }) {
  if (s.running) {
    return (
      <Badge variant="default" data-testid="badge-backfill-running">
        Running · car {s.carsProcessed}/{s.totalCars}
      </Badge>
    );
  }
  if (s.lastError) return <Badge variant="destructive" data-testid="badge-backfill-error">Error</Badge>;
  if (s.runId) return <Badge variant="secondary" data-testid="badge-backfill-done">Done · run #{s.runId}</Badge>;
  return <Badge variant="secondary" data-testid="badge-backfill-idle">Idle</Badge>;
}

function BudgetChip({ b }: { b: BudgetStatus }) {
  const pct = b.limit > 0 ? Math.round((b.used / b.limit) * 100) : 0;
  return (
    <Badge
      variant={b.remaining < 25 ? "destructive" : "outline"}
      data-testid="badge-budget"
      title={
        "Global Oxylabs daily budget — shared across the whole app " +
        "(backfill, RealOEM VIN fallback, crossref jobs, scrapers)."
      }
    >
      Oxylabs {b.used}/{b.limit} ({pct}%) · {b.remaining} left today
    </Badge>
  );
}

// The shared Oxylabs budget resets at the start of the next UTC day —
// see `todayKey()` in server/realoem-fallback.ts. We render a live
// "resets in Xh Ym" countdown so admins always know how long until the
// cap clears, without having to do the math themselves.
function useResetCountdown(day: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    // `day` is the server's current UTC date (YYYY-MM-DD). Reset is at
    // the next UTC midnight after that day.
    const parts = day.split("-").map((n) => parseInt(n, 10));
    let resetMs: number;
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      resetMs = Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0);
    } else {
      const d = new Date();
      resetMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    }
    const ms = Math.max(0, resetMs - now);
    const totalMin = Math.floor(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0 && m <= 0) return "any moment";
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
  }, [day, now]);
}

function BudgetBanner({ b }: { b: BudgetStatus }) {
  const pct = b.limit > 0 ? Math.min(100, Math.round((b.used / b.limit) * 100)) : 0;
  const exhausted = b.remaining <= 0;
  const low = !exhausted && b.remaining < 25;
  const tone = exhausted
    ? "border-destructive/60 bg-destructive/10"
    : low
      ? "border-amber-500/60 bg-amber-500/10"
      : "border-border bg-muted/30";
  const barTone = exhausted
    ? "bg-destructive"
    : low
      ? "bg-amber-500"
      : "bg-primary";
  const resetIn = useResetCountdown(b.day);
  return (
    <div
      className={`rounded-md border p-3 ${tone}`}
      data-testid="banner-budget"
      role={exhausted || low ? "alert" : undefined}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Daily proxy budget (shared)
          </div>
          <div className="text-sm mt-0.5">
            <strong data-testid="text-budget-used">{fmt(b.used)}</strong>
            {" / "}
            <strong data-testid="text-budget-limit">{fmt(b.limit)}</strong>
            {" used · "}
            <strong data-testid="text-budget-remaining">{fmt(b.remaining)}</strong>
            {" left · resets in "}
            <strong data-testid="text-budget-reset">{resetIn}</strong>
          </div>
        </div>
        <div className="text-xs text-muted-foreground" title="Shared across backfill, VIN fallback, crossref jobs, scrapers.">
          {pct}% used
        </div>
      </div>
      <div className="mt-2 w-full bg-background/60 rounded h-2 overflow-hidden">
        <div
          className={`h-full transition-all ${barTone}`}
          style={{ width: `${pct}%` }}
          data-testid="bar-budget"
        />
      </div>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString();
}
function fmtTs(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

export default function RealoemBackfill() {
  const { isAdmin, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-2">
        <h1 className="text-2xl font-bold">Admin only</h1>
        <p className="text-sm text-muted-foreground">You need an admin session to access RealOEM Backfill.</p>
        <Link href="/admin" className="text-sm underline">Back to admin</Link>
      </div>
    );
  }

  return <RealoemBackfillInner />;
}

function RealoemBackfillInner() {
  const { toast } = useToast();
  const [scope, setScope] = useState<BackfillScope>("car");
  const [carId, setCarId] = useState("");
  const [chassis, setChassis] = useState("");
  const [forceRefetch, setForceRefetch] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  const status = useQuery<BackfillStatus>({
    queryKey: ["/api/admin/realoem-backfill/status"],
    refetchInterval: (q) => (q.state.data?.running ? 2000 : 8000),
  });

  const runs = useQuery<{ runs: BackfillRun[] }>({
    queryKey: ["/api/admin/realoem-backfill/runs"],
    refetchInterval: (q) => (status.data?.running ? 5000 : 30000),
  });

  // Build the request body the API expects: scope is required, the
  // scope-specific id is only included when applicable, and forceRefetch
  // is only sent on `run` (not `estimate`).
  function buildBody(includeForceRefetch: boolean): {
    scope: BackfillScope;
    carId?: number;
    chassis?: string;
    forceRefetch?: boolean;
  } {
    const body: { scope: BackfillScope; carId?: number; chassis?: string; forceRefetch?: boolean } = { scope };
    if (scope === "car") body.carId = parseInt(carId, 10);
    if (scope === "chassis") body.chassis = chassis.trim().toUpperCase();
    if (includeForceRefetch) body.forceRefetch = forceRefetch;
    return body;
  }

  const runMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/realoem-backfill/run", buildBody(true)),
    onSuccess: () => {
      toast({ title: "Backfill started" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/realoem-backfill/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/realoem-backfill/runs"] });
    },
    onError: (err: unknown) => {
      toast({ title: "Could not start", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/realoem-backfill/cancel"),
    onSuccess: () => {
      toast({ title: "Cancellation requested" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/realoem-backfill/status"] });
    },
  });

  const estimateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/realoem-backfill/estimate", buildBody(false));
      return (await res.json()) as EstimateResponse;
    },
    onSuccess: (data: EstimateResponse) => setEstimate(data),
    onError: (err: unknown) => {
      toast({ title: "Estimate failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  // Reset estimate whenever the scope inputs change so the displayed
  // number can never be stale relative to the scope the admin will run.
  useEffect(() => {
    setEstimate(null);
  }, [scope, carId, chassis]);

  const s = status.data;

  // The estimate may show that this run alone would push us past the
  // shared daily budget. We don't *block* it (the runner halts on
  // exhaustion anyway), but we require an explicit acknowledgement so
  // a single click can't burn the rest of the day's budget by accident.
  const [ackOverBudget, setAckOverBudget] = useState(false);
  const overBudget =
    !!estimate && estimate.estimatedProxyRequests > estimate.budgetRemaining;
  // Reset the acknowledgement whenever the estimate changes (or clears),
  // so a stale ack from a previous, smaller estimate can't auto-approve
  // a larger one.
  useEffect(() => {
    setAckOverBudget(false);
  }, [estimate]);

  const startDisabled =
    !s ||
    s.running ||
    runMutation.isPending ||
    (scope === "car" && !carId) ||
    (scope === "chassis" && !chassis.trim()) ||
    (overBudget && !ackOverBudget);

  const progressPct = useMemo(() => {
    if (!s || s.totalCars === 0) return 0;
    return Math.min(100, Math.round((s.carsProcessed / s.totalCars) * 100));
  }, [s]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1" data-testid="link-back-admin">
            <ArrowLeft className="w-3 h-3" /> Back to admin
          </Link>
          <h1 className="text-2xl font-bold mt-2" data-testid="text-page-title">RealOEM Backfill</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Walk every BMW car in scope, fetch every RealOEM diagram, and insert any parts we don't already have.
            Inserted rows are tagged with <code className="text-[11px] bg-muted px-1 rounded">realoem-backfill:&lt;runId&gt;</code> so they can be reverted from the CLI.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {s ? <StatusChip s={s} /> : null}
          {s ? <BudgetChip b={s.budget} /> : null}
        </div>
      </div>

      {/* Always-visible budget banner — same `s.budget` payload that
          drives the chip, refreshed every 2s while a run is active so
          `used` ticks up live alongside `proxyRequestsUsed`. */}
      {s ? <BudgetBanner b={s.budget} /> : null}

      <Card data-testid="card-run">
        <CardHeader>
          <CardTitle>Run a backfill</CardTitle>
          <CardDescription>
            Pick a scope, get an estimate, then run. Diagrams seen within the freshness window
            ({s?.freshnessHours ?? 168}h) are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label htmlFor="scope">Scope</Label>
              <Select value={scope} onValueChange={(v) => { if (isBackfillScope(v)) setScope(v); }}>
                <SelectTrigger id="scope" data-testid="select-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="car" data-testid="select-scope-car">Single car</SelectItem>
                  <SelectItem value="chassis" data-testid="select-scope-chassis">Chassis</SelectItem>
                  <SelectItem value="all" data-testid="select-scope-all">All cars</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "car" && (
              <div className="space-y-1">
                <Label htmlFor="carId">Car ID</Label>
                <Input id="carId" inputMode="numeric" placeholder="e.g. 666" value={carId}
                  onChange={(e) => setCarId(e.target.value.replace(/\D/g, ""))}
                  data-testid="input-car-id" />
              </div>
            )}
            {scope === "chassis" && (
              <div className="space-y-1">
                <Label htmlFor="chassis">Chassis</Label>
                <Input id="chassis" placeholder="e.g. G07" value={chassis}
                  onChange={(e) => setChassis(e.target.value.toUpperCase())}
                  data-testid="input-chassis" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="block">Options</Label>
              <label className="flex items-center gap-2 text-sm h-9">
                <input type="checkbox" checked={forceRefetch} onChange={(e) => setForceRefetch(e.target.checked)}
                  data-testid="checkbox-force-refetch" />
                Force refetch (ignore freshness)
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => estimateMutation.mutate()}
              disabled={estimateMutation.isPending || (scope === "car" && !carId) || (scope === "chassis" && !chassis.trim())}
              data-testid="button-estimate"
            >
              {estimateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Estimate
            </Button>
            {!s?.running ? (
              <Button onClick={() => runMutation.mutate()} disabled={startDisabled} data-testid="button-run">
                {runMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Run backfill
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} data-testid="button-cancel">
                {cancelMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2" />}
                Cancel
              </Button>
            )}
            {estimate ? (
              <div className="text-xs text-muted-foreground" data-testid="text-estimate">
                <strong>{fmt(estimate.cars)}</strong> car(s) · <strong>{fmt(estimate.chassisLandings)}</strong> chassis landing(s) ·
                ~<strong>{fmt(estimate.estimatedProxyRequests)}</strong> proxy req · budget left today: <strong>{fmt(estimate.budgetRemaining)}</strong>
              </div>
            ) : null}
          </div>
          {overBudget && estimate ? (
            <div
              className="flex items-start gap-2 p-3 rounded border border-destructive/50 bg-destructive/10 text-sm"
              data-testid="warning-budget"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
              <div className="space-y-2">
                <div>
                  Estimated proxy use (<strong>{fmt(estimate.estimatedProxyRequests)}</strong>) exceeds today's remaining
                  budget (<strong>{fmt(estimate.budgetRemaining)}</strong>). The runner will stop early when the budget is hit,
                  and no other Oxylabs-backed feature (VIN fallback, crossref, scrapers) will work for the rest of the day.
                </div>
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={ackOverBudget}
                    onChange={(e) => setAckOverBudget(e.target.checked)}
                    data-testid="checkbox-ack-over-budget"
                    className="mt-0.5"
                  />
                  <span>I understand this will exceed the daily cap.</span>
                </label>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card data-testid="card-progress">
        <CardHeader>
          <CardTitle>Live progress</CardTitle>
          <CardDescription>{s?.scopeLabel ? `Scope: ${s.scopeLabel}` : "No active run"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!s ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <div className="w-full bg-muted rounded h-2 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} data-testid="bar-progress" />
              </div>

              {/*
                Pre-step (variant-discovery) panel. Appears whenever the
                operator triggered a scope=all run and the pre-step has
                anything to report — either it's actively running
                (phase === "discovery") or it already finished and we
                still want to show what it produced. Without this panel
                the operator stares at all-zero "main loop" counters
                for ~12-15 minutes while the Evomi sweep crawls
                bmwpartsdeal, with no signal anything is happening.
              */}
              {((s.phase === "discovery") || ((s.discoveryChassisChecked ?? 0) > 0) || ((s.discoveryVariantsFound ?? 0) > 0)) && (
                <div
                  className={`rounded-md border p-3 text-sm ${s.phase === "discovery" ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                  data-testid="panel-discovery-progress"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">
                      Pre-step: variant discovery
                      {s.phase === "discovery" ? (
                        <span className="ml-2 inline-flex items-center text-xs text-primary" data-testid="text-discovery-active">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> sweeping bmwpartsdeal via Evomi (does not spend Oxylabs budget)
                        </span>
                      ) : (
                        <span className="ml-2 text-xs text-muted-foreground" data-testid="text-discovery-done">complete</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid="text-discovery-current-chassis">
                      Current chassis: <strong>{s.discoveryCurrentChassis || "—"}</strong>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded h-1.5 overflow-hidden mb-2">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${(s.discoveryChassisTotal && s.discoveryChassisTotal > 0)
                          ? Math.min(100, ((s.discoveryChassisChecked ?? 0) / s.discoveryChassisTotal) * 100)
                          : 0}%`,
                      }}
                      data-testid="bar-discovery-progress"
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat
                      label="Chassis checked"
                      value={`${fmt(s.discoveryChassisChecked ?? 0)} / ${fmt(s.discoveryChassisTotal ?? 0)}`}
                      testId="stat-discovery-chassis"
                    />
                    <Stat label="Variants found" value={fmt(s.discoveryVariantsFound ?? 0)} testId="stat-discovery-variants" />
                    <Stat label="New cars inserted" value={fmt(s.discoveryNewCarsInserted ?? 0)} testId="stat-discovery-new-cars" />
                    <Stat label="Catalog IDs fixed" value={fmt(s.discoveryCatalogIdsBackfilled ?? 0)} testId="stat-discovery-catalog-ids" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Stat label="Cars" value={`${fmt(s.carsProcessed)} / ${fmt(s.totalCars)}`} testId="stat-cars" />
                <Stat label="Diagrams fetched" value={fmt(s.diagramsFetched)} testId="stat-diagrams-fetched" />
                <Stat label="Diagrams cached" value={fmt(s.diagramsCached)} testId="stat-diagrams-cached" />
                <Stat label="Skipped (fresh)" value={fmt(s.diagramsSkippedFresh)} testId="stat-diagrams-skipped" />
                <Stat label="Parts inserted" value={fmt(s.partsInserted)} testId="stat-parts-inserted" />
                <Stat label="New subcategories" value={fmt(s.newSubcategories)} testId="stat-new-subcategories" />
                <Stat label="Proxy req used" value={fmt(s.proxyRequestsUsed)} testId="stat-proxy-used" />
                <Stat label="Errors" value={fmt(s.errors)} testId="stat-errors" />
              </div>
              <div className="text-xs text-muted-foreground">
                <div data-testid="text-current-car">Current car: <strong>{s.currentCar || "—"}</strong></div>
                <div data-testid="text-current-diagram">Current diagram: <strong>{s.currentDiagram || "—"}</strong></div>
                <div>Started: <strong>{fmtTs(s.startedAt)}</strong> · Finished: <strong>{fmtTs(s.finishedAt)}</strong></div>
              </div>
              {s.lastError ? (
                <div className="p-3 rounded bg-destructive/10 border border-destructive/30 text-sm text-destructive" data-testid="text-last-error">
                  Last error: {s.lastError}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-runs">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Last 10 runs. Tap "CSV" for the per-finding insert log of a run.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.isLoading ? (
            <div className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin" /> loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Cars</TableHead>
                  <TableHead className="text-right">Diagrams</TableHead>
                  <TableHead className="text-right">Inserted</TableHead>
                  <TableHead className="text-right">New subs</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs.data?.runs || []).map((r) => {
                  const expanded = expandedRunId === r.runId;
                  const hasBreakdown = (r.byChassis?.length || 0) > 0;
                  return (
                    <Fragment key={r.runId}>
                      <TableRow data-testid={`row-run-${r.runId}`}>
                        <TableCell className="font-mono">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-default"
                            onClick={() => setExpandedRunId(expanded ? null : r.runId)}
                            disabled={!hasBreakdown}
                            title={hasBreakdown ? "Toggle per-chassis breakdown" : "No per-chassis data"}
                            data-testid={`button-expand-run-${r.runId}`}
                          >
                            {hasBreakdown
                              ? (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)
                              : <span className="w-3 h-3 inline-block" />}
                            #{r.runId}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === "complete" ? "secondary" : r.status === "failed" ? "destructive" : "outline"}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.scopeLabel || r.scope || "—"}</TableCell>
                        <TableCell className="text-right">{fmt(r.carsProcessed)}/{fmt(r.totalCars)}</TableCell>
                        <TableCell className="text-right">{fmt(r.ledgerDiagramsTouched)}</TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-run-inserted-${r.runId}`}>
                          {fmt(Math.max(r.partsInserted, r.ledgerPartsInserted))}
                        </TableCell>
                        <TableCell className="text-right">{fmt(r.newSubcategories)}</TableCell>
                        <TableCell className="text-right">{fmt(r.errors)}</TableCell>
                        <TableCell className="text-xs">{fmtTs(r.startedAt)}</TableCell>
                        <TableCell>
                          <a
                            href={`/api/admin/realoem-backfill/runs/${r.runId}/inserts.csv`}
                            className="inline-flex items-center text-xs text-primary hover:underline"
                            data-testid={`link-csv-${r.runId}`}
                          >
                            <Download className="w-3 h-3 mr-1" /> CSV
                          </a>
                        </TableCell>
                      </TableRow>
                      {expanded && hasBreakdown && (
                        <TableRow data-testid={`row-run-breakdown-${r.runId}`}>
                          <TableCell colSpan={10} className="bg-muted/30 p-0">
                            <div className="p-3">
                              <div className="text-xs font-medium text-muted-foreground mb-2">
                                Per-chassis breakdown · run #{r.runId}
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="h-7 text-xs">Chassis</TableHead>
                                    <TableHead className="h-7 text-xs text-right">Diagrams touched</TableHead>
                                    <TableHead className="h-7 text-xs text-right">Parts inserted</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {r.byChassis.map((bc) => (
                                    <TableRow
                                      key={`${r.runId}-${bc.chassis}`}
                                      data-testid={`row-run-chassis-${r.runId}-${bc.chassis}`}
                                    >
                                      <TableCell className="py-1.5 font-mono text-xs">{bc.chassis}</TableCell>
                                      <TableCell className="py-1.5 text-right text-xs" data-testid={`text-chassis-diagrams-${r.runId}-${bc.chassis}`}>
                                        {fmt(bc.diagramsTouched)}
                                      </TableCell>
                                      <TableCell className="py-1.5 text-right text-xs font-medium" data-testid={`text-chassis-parts-${r.runId}-${bc.chassis}`}>
                                        {fmt(bc.partsInserted)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {!runs.data?.runs?.length && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground text-sm">No runs yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold" data-testid={testId}>{value}</div>
    </div>
  );
}
