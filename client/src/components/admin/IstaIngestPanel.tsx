import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Package, RefreshCw, PlayCircle, CheckCircle2, XCircle, Clock,
  AlertTriangle, Loader2, Lock, FileArchive,
} from "lucide-react";

type DiffSection = {
  added: number;
  changed: number;
  removed: number;
  perChassis: Record<string, { added: number; changed: number; removed: number }>;
};

type RunDiff = { ssp: DiffSection; fub: DiffSection };

type IstaRun = {
  id: number;
  version: string;
  bucketKey: string;
  fileSizeBytes: number | null;
  status: "pending" | "running" | "succeeded" | "failed" | "noop";
  trigger: "scheduled" | "manual" | "smoke";
  triggeredBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  sspRows: number;
  fubRows: number;
  diff: RunDiff | null;
  failedStep: string | null;
  errorMessage: string | null;
  warnings: string[];
  createdAt: string;
};

type BucketPackage = { bucketKey: string; version: string; ingested: boolean };

type RunsResponse = {
  runs: IstaRun[];
  latest: IstaRun | null;
  bucketPackages: BucketPackage[];
  bucketError: string | null;
  scheduler: { active: boolean; intervalMs: number; lastRunAt: string | null; nextRunAt: string | null };
};

function formatBytes(n: number | null | undefined): string {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function StatusBadge({ status }: { status: IstaRun["status"] }) {
  const map: Record<IstaRun["status"], { label: string; className: string; Icon: any }> = {
    pending: { label: "pending", className: "bg-muted text-muted-foreground", Icon: Clock },
    running: { label: "running", className: "bg-blue-500/15 text-blue-600 border-blue-300", Icon: Loader2 },
    succeeded: { label: "succeeded", className: "bg-green-500/15 text-green-700 border-green-300", Icon: CheckCircle2 },
    noop: { label: "no-op", className: "bg-amber-500/15 text-amber-700 border-amber-300", Icon: CheckCircle2 },
    failed: { label: "failed", className: "bg-red-500/15 text-red-700 border-red-300", Icon: XCircle },
  };
  const m = map[status];
  return (
    <Badge variant="outline" className={`gap-1 ${m.className}`} data-testid={`status-ista-${status}`}>
      <m.Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} /> {m.label}
    </Badge>
  );
}

function DiffSummary({ diff }: { diff: RunDiff | null }) {
  if (!diff) return <span className="text-xs text-muted-foreground">—</span>;
  const fmt = (s: DiffSection) => `+${s.added} / Δ${s.changed} / -${s.removed}`;
  return (
    <div className="text-xs space-y-0.5">
      <div data-testid="text-diff-ssp">SSP: <span className="font-mono">{fmt(diff.ssp)}</span></div>
      <div data-testid="text-diff-fub">FUB: <span className="font-mono">{fmt(diff.fub)}</span></div>
    </div>
  );
}

export default function IstaIngestPanel() {
  const { toast } = useToast();
  const [selectedBucketKey, setSelectedBucketKey] = useState<string>("");
  const [force, setForce] = useState(false);

  const query = useQuery<RunsResponse>({
    queryKey: ["/api/admin/ista/runs"],
    refetchInterval: 10_000,
  });

  const ingestMutation = useMutation({
    mutationFn: async (vars: { bucketKey: string; force: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/ista/runs", vars);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Ingest queued", description: data?.message || "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ista/runs"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to queue ingest", description: err?.message || String(err), variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/ista/scan");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Scan queued" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ista/runs"] });
    },
    onError: (err: any) => {
      toast({ title: "Scan failed", description: err?.message || String(err), variant: "destructive" });
    },
  });

  const data = query.data;
  const latest = data?.latest;
  const sched = data?.scheduler;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" /> ISTA Quarterly Ingest Worker
          </CardTitle>
          <CardDescription>
            Watches <code>BMV-Bucket</code> for new <code>.istapackage</code> files, runs the SSP/FUB extractor,
            and diffs against the previous version. Re-runs of an already-ingested version are no-ops unless
            forced.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Scheduler</div>
              <div className="flex items-center gap-2 mt-1" data-testid="text-scheduler-status">
                {sched?.active ? (
                  <Badge variant="outline" className="bg-green-500/15 text-green-700 border-green-300">active</Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted">disabled</Badge>
                )}
                {sched?.intervalMs && (
                  <span className="text-muted-foreground">every {Math.round(sched.intervalMs / 60000)}m</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last poll</div>
              <div data-testid="text-last-poll">{sched?.lastRunAt ? new Date(sched.lastRunAt).toLocaleString() : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Next poll</div>
              <div data-testid="text-next-poll">{sched?.nextRunAt ? new Date(sched.nextRunAt).toLocaleString() : "—"}</div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-medium flex items-center gap-2">
              <FileArchive className="w-4 h-4" /> Bucket contents
              <Button
                size="sm" variant="ghost"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
                data-testid="button-refresh-bucket"
              >
                <RefreshCw className={`w-3 h-3 ${query.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {data?.bucketError ? (
              <div className="text-sm text-red-600 flex gap-2 items-center">
                <AlertTriangle className="w-4 h-4" /> {data.bucketError}
              </div>
            ) : data?.bucketPackages?.length ? (
              <ul className="text-xs space-y-1 font-mono">
                {data.bucketPackages.map((p) => (
                  <li key={p.bucketKey} className="flex items-center gap-2" data-testid={`item-bucket-${p.version}`}>
                    {p.ingested ? (
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                    ) : (
                      <Clock className="w-3 h-3 text-amber-600" />
                    )}
                    <span>{p.bucketKey}</span>
                    <Badge variant="outline" className="text-[10px]">{p.version}</Badge>
                    {!p.ingested && <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700">new</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-muted-foreground">No <code>.istapackage</code> files found in bucket.</div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-medium">Manual trigger</div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[260px]">
                <Label className="text-xs">Package</Label>
                <Select value={selectedBucketKey} onValueChange={setSelectedBucketKey}>
                  <SelectTrigger data-testid="select-bucket-key">
                    <SelectValue placeholder="Select a .istapackage" />
                  </SelectTrigger>
                  <SelectContent>
                    {data?.bucketPackages?.map((p) => (
                      <SelectItem key={p.bucketKey} value={p.bucketKey}>{p.bucketKey}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={force} onCheckedChange={setForce} data-testid="switch-force" id="force" />
                <Label htmlFor="force" className="text-xs">Force re-run</Label>
              </div>
              <Button
                onClick={() => ingestMutation.mutate({ bucketKey: selectedBucketKey, force })}
                disabled={!selectedBucketKey || ingestMutation.isPending}
                data-testid="button-run-ingest"
              >
                {ingestMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1" />}
                Run ingest
              </Button>
              <Button
                variant="outline"
                onClick={() => scanMutation.mutate()}
                disabled={scanMutation.isPending}
                data-testid="button-scan-bucket"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${scanMutation.isPending ? "animate-spin" : ""}`} /> Scan now
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest run</CardTitle>
        </CardHeader>
        <CardContent>
          {latest ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm" data-testid="card-latest-run">
              <div>
                <div className="text-xs text-muted-foreground">Version</div>
                <div className="font-mono" data-testid="text-latest-version">{latest.version}</div>
                <div className="mt-2"><StatusBadge status={latest.status} /></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Rows</div>
                <div>SSP: <span className="font-mono">{latest.sspRows}</span></div>
                <div>FUB: <span className="font-mono">{latest.fubRows}</span></div>
                <div className="text-xs text-muted-foreground mt-1">
                  Size: {formatBytes(latest.fileSizeBytes)} · Duration: {formatDuration(latest.durationMs)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Diff vs previous</div>
                <DiffSummary diff={latest.diff} />
              </div>
              {latest.warnings?.length > 0 && (
                <div className="md:col-span-3 text-xs bg-amber-500/10 border border-amber-300 rounded p-2 space-y-1">
                  {latest.warnings.map((w, i) => (
                    <div key={i} className="flex gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}</div>
                  ))}
                </div>
              )}
              {latest.errorMessage && (
                <div className="md:col-span-3 text-xs bg-red-500/10 border border-red-300 rounded p-2">
                  <div className="font-medium mb-1">Error at step: {latest.failedStep || "unknown"}</div>
                  <pre className="whitespace-pre-wrap font-mono">{latest.errorMessage}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No runs recorded yet.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>Most recent 50 ingest attempts.</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.runs?.length ? (
            <div className="text-sm text-muted-foreground">No runs yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Version</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Trigger</th>
                    <th className="py-2 pr-3">Rows (SSP / FUB)</th>
                    <th className="py-2 pr-3">Diff</th>
                    <th className="py-2 pr-3">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0" data-testid={`row-run-${r.id}`}>
                      <td className="py-2 pr-3 whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.version}</td>
                      <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                      <td className="py-2 pr-3 text-xs">{r.trigger}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.sspRows} / {r.fubRows}</td>
                      <td className="py-2 pr-3"><DiffSummary diff={r.diff} /></td>
                      <td className="py-2 pr-3 text-xs">{formatDuration(r.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
