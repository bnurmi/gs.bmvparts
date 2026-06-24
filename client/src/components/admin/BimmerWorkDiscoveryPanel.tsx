import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Search, PlayCircle, CheckCircle2, XCircle, Clock,
  Loader2, AlertTriangle, Database,
} from "lucide-react";

interface BulkDiscoverJob {
  id: number;
  jobType: string;
  status: "running" | "complete" | "failed" | "cancelled" | "interrupted";
  progress: {
    discovered?: number;
    processed?: number;
    skipped?: number;
    failed?: number;
    phase?: string;
    maxPagesPerEngine?: number;
  } | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

function formatRelative(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function JobStatusBadge({ status }: { status: BulkDiscoverJob["status"] }) {
  const map: Record<string, { label: string; className: string; Icon: any }> = {
    running: { label: "running", className: "bg-blue-500/15 text-blue-600 border-blue-300", Icon: Loader2 },
    complete: { label: "complete", className: "bg-green-500/15 text-green-700 border-green-300", Icon: CheckCircle2 },
    failed: { label: "failed", className: "bg-red-500/15 text-red-700 border-red-300", Icon: XCircle },
    cancelled: { label: "cancelled", className: "bg-muted text-muted-foreground", Icon: XCircle },
    interrupted: { label: "interrupted", className: "bg-amber-500/15 text-amber-700 border-amber-300", Icon: AlertTriangle },
  };
  const cfg = map[status] ?? map.cancelled;
  const Icon = cfg.Icon;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
      <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
      {cfg.label}
    </Badge>
  );
}

export default function BimmerWorkDiscoveryPanel() {
  const { toast } = useToast();
  const [maxPages, setMaxPages] = useState("50");

  const { data, isLoading } = useQuery<{ job: BulkDiscoverJob | null }>({
    queryKey: ["/api/admin/bimmerwork/bulk-discover/status"],
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job?.status === "running" ? 3000 : false;
    },
  });

  const job = data?.job ?? null;
  const isRunning = job?.status === "running";

  const startMutation = useMutation({
    mutationFn: async () => {
      const pages = Math.max(1, Math.min(200, parseInt(maxPages, 10) || 50));
      return apiRequest("POST", "/api/admin/bimmerwork/bulk-discover", { maxPagesPerEngine: pages });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bimmerwork/bulk-discover/status"] });
      toast({ title: "Discovery job started", description: "Scanning search engines for bimmer.work VIN pages…" });
    },
    onError: (err: any) => {
      let msg = err.message || "Failed to start job";
      try { msg = JSON.parse(msg).error || msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const progress = job?.progress ?? {};
  const discovered = progress.discovered ?? 0;
  const processed = progress.processed ?? 0;
  const skipped = progress.skipped ?? 0;
  const failed = progress.failed ?? 0;
  const phase = progress.phase ?? "idle";

  const total = processed + skipped + failed;
  const pct = discovered > 0 ? Math.round((total / discovered) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            bimmer.work Discovery
          </CardTitle>
          <CardDescription>
            Search Google, Bing, and DuckDuckGo for <code className="text-xs">site:bimmer.work/vin</code> to
            harvest VIN→hash mappings in bulk. Each discovered VIN is enriched and stored so future
            per-VIN lookups skip the discovery phase entirely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="max-pages">Max pages per engine</Label>
              <Input
                id="max-pages"
                data-testid="input-max-pages"
                type="number"
                min={1}
                max={200}
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                className="w-28"
                disabled={isRunning || startMutation.isPending}
              />
            </div>
            <Button
              data-testid="button-run-discovery"
              onClick={() => startMutation.mutate()}
              disabled={isRunning || startMutation.isPending || isLoading}
            >
              {(isRunning || startMutation.isPending) ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="w-4 h-4 mr-2" />
              )}
              {isRunning ? "Running…" : "Run Discovery"}
            </Button>
          </div>

          {isRunning && (
            <div className="space-y-2 rounded-md border p-3 bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium capitalize">{phase === "discovering" ? "Scanning engines…" : "Enriching VINs…"}</span>
                <span className="text-muted-foreground">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span data-testid="text-discovered">Discovered: <strong className="text-foreground">{discovered}</strong></span>
                <span data-testid="text-processed">Processed: <strong className="text-foreground">{processed}</strong></span>
                <span data-testid="text-skipped">Skipped: <strong className="text-foreground">{skipped}</strong></span>
                <span data-testid="text-failed">Failed: <strong className="text-foreground">{failed}</strong></span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" />
              Last Run
              <JobStatusBadge status={job.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Discovered</dt>
                <dd className="font-semibold text-lg" data-testid="text-last-discovered">{progress.discovered ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Processed</dt>
                <dd className="font-semibold text-lg" data-testid="text-last-processed">{progress.processed ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Skipped</dt>
                <dd className="font-semibold text-lg" data-testid="text-last-skipped">{progress.skipped ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Failed</dt>
                <dd className="font-semibold text-lg" data-testid="text-last-failed">{progress.failed ?? 0}</dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>Started: {formatRelative(job.startedAt)}</span>
              {job.completedAt && <span>Completed: {formatRelative(job.completedAt)}</span>}
              {progress.maxPagesPerEngine != null && (
                <span>Max pages/engine: {progress.maxPagesPerEngine}</span>
              )}
            </div>

            {job.error && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 p-2 text-xs text-red-700 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="break-all">{job.error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!job && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No discovery job has run yet. Click "Run Discovery" to start.
        </p>
      )}
    </div>
  );
}
