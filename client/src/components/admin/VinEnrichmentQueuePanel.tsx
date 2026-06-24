import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, Clock, Loader2, Database, TrendingUp, Calendar,
} from "lucide-react";

interface QueueStats {
  total: number;
  pending: number;
  done: number;
  failed: number;
  inProgress: number;
  todayCount: number;
  dailyCap: number;
  etaDays: number | null;
  jobId: number | null;
}

interface RecentRow {
  vin: string;
  status: string;
  attempts: number;
  lastAttemptedAt: string | null;
  error: string | null;
  createdAt: string;
  chassis: string | null;
  saCount: number | null;
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; Icon: any }> = {
    pending: { label: "pending", className: "bg-amber-500/15 text-amber-700 border-amber-300", Icon: Clock },
    in_progress: { label: "in progress", className: "bg-blue-500/15 text-blue-600 border-blue-300", Icon: Loader2 },
    done: { label: "done", className: "bg-green-500/15 text-green-700 border-green-300", Icon: CheckCircle2 },
    failed: { label: "failed", className: "bg-red-500/15 text-red-700 border-red-300", Icon: XCircle },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground", Icon: Clock };
  const Icon = cfg.Icon;
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${cfg.className}`}>
      <Icon className={`w-3 h-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
      {cfg.label}
    </Badge>
  );
}

function StatCard({
  label, value, sub, icon: Icon, className = "",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: any;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${className}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function VinEnrichmentQueuePanel() {
  const { data: stats, isLoading: statsLoading } = useQuery<QueueStats>({
    queryKey: ["/api/admin/vin-enrichment/stats"],
    refetchInterval: 15_000,
  });

  const { data: recent, isLoading: recentLoading } = useQuery<RecentRow[]>({
    queryKey: ["/api/admin/vin-enrichment/recent"],
    refetchInterval: 15_000,
  });

  const totalDone = stats?.done ?? 0;
  const total = stats?.total ?? 0;
  const pct = total > 0 ? Math.round((totalDone / total) * 100) : 0;
  const todayPct = stats ? Math.min(100, Math.round((stats.todayCount / stats.dailyCap) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">VIN Enrichment Queue</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Bulk bimmer.work enrichment backfill — processes ~1,000 VINs/day via the slow-burn worker.
          Seed new VINs via <code className="text-xs">scripts/seed-vin-enrichment-queue.ts</code>.
        </p>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total VINs" value={stats.total.toLocaleString()} icon={Database} />
            <StatCard label="Pending" value={stats.pending.toLocaleString()} icon={Clock} className="border-amber-200" />
            <StatCard label="Done" value={stats.done.toLocaleString()} icon={CheckCircle2} className="border-green-200" />
            <StatCard label="Failed" value={stats.failed.toLocaleString()} icon={XCircle} className="border-red-200" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Today's Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{stats.todayCount.toLocaleString()} processed</span>
                  <span>cap: {stats.dailyCap.toLocaleString()}/day</span>
                </div>
                <Progress value={todayPct} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {stats.dailyCap - stats.todayCount > 0
                    ? `${(stats.dailyCap - stats.todayCount).toLocaleString()} remaining today`
                    : "Daily cap reached — resumes at midnight UTC"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Overall Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{totalDone.toLocaleString()} done</span>
                  <span>{total.toLocaleString()} total ({pct}%)</span>
                </div>
                <Progress value={pct} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {stats.etaDays !== null
                    ? `Estimated completion: ~${stats.etaDays} day${stats.etaDays === 1 ? "" : "s"} at current rate`
                    : stats.pending === 0 ? "Queue is empty — all VINs processed" : "No pending VINs"}
                </p>
              </CardContent>
            </Card>
          </div>

          {stats.jobId && (
            <p className="text-xs text-muted-foreground">
              Background job #{stats.jobId} active
            </p>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Queue not yet seeded. Run{" "}
            <code>npx tsx scripts/seed-vin-enrichment-queue.ts --source vin_cache</code>{" "}
            to populate it.
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-medium mb-3">Recent Results (last 50)</h3>
        {recentLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : !recent || recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results yet.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 font-medium">VIN</th>
                  <th className="text-left px-3 py-2 font-medium">Chassis</th>
                  <th className="text-left px-3 py-2 font-medium">SA Codes</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Attempts</th>
                  <th className="text-left px-3 py-2 font-medium">Last Attempt</th>
                  <th className="text-left px-3 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(row => (
                  <tr key={row.vin} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs">{row.vin}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                      {row.chassis ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.saCount != null ? row.saCount : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.attempts}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatRelative(row.lastAttemptedAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">
                      {row.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
