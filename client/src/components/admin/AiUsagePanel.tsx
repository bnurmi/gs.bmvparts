import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, DollarSign, TrendingUp, Zap, Clock } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

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

function usd(n: number) {
  return `$${n.toFixed(4)}`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
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

export default function AiUsagePanel() {
  const [logsOffset, setLogsOffset] = useState(0);
  const LOGS_PAGE = 50;

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<AiUsageSummary>({
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
          <h2 className="text-lg font-semibold">AI Usage & Cost Tracking</h2>
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
          <SummaryCard label="All Time" value={usd(summary?.allTime ?? 0)} icon={<DollarSign className="w-5 h-5" />} />
          <SummaryCard label="Last 30 Days" value={usd(summary?.last30Days ?? 0)} icon={<TrendingUp className="w-5 h-5" />} />
          <SummaryCard label="Last 7 Days" value={usd(summary?.last7Days ?? 0)} icon={<Zap className="w-5 h-5" />} />
          <SummaryCard label="Today" value={usd(summary?.today ?? 0)} icon={<Clock className="w-5 h-5" />} />
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
                      <TableCell>
                        <span className="font-mono text-xs">{m.model}</span>
                      </TableCell>
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
          {summaryLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <DailyChart data={summary?.dailySpend ?? []} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Recent Calls
            {logsData && (
              <span className="text-muted-foreground font-normal ml-2 text-xs">({logsData.total.toLocaleString()} total)</span>
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
