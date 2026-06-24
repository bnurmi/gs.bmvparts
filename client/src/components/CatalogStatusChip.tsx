import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";

interface CatalogStatus {
  lastFullSyncAt: string | null;
  hoursSinceLastSync: number | null;
  healthy: boolean;
  completeCount: number;
  totalScrapable: number;
}

/**
 * Topbar status chip showing catalog freshness. Reads from the
 * public `GET /api/catalog/status` endpoint added in Task #69.
 * The colored dot is `--state-success` when fresh (<24h),
 * `--state-signal` when stale, `--fg-quiet` when unknown.
 */
export function CatalogStatusChip({ className = "" }: { className?: string }) {
  const t = useT();
  const { data } = useQuery<CatalogStatus>({
    queryKey: ["/api/catalog/status"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const hours = data?.hoursSinceLastSync;
  const isFresh = data?.healthy && typeof hours === "number" && hours < 24;
  const modifier = hours == null ? "bmv-chip--quiet" : isFresh ? "" : "bmv-chip--signal";
  const text =
    hours == null
      ? t.topbar.statusUnknown
      : isFresh
        ? t.topbar.statusFresh(hours)
        : t.topbar.statusStale(hours);

  return (
    <span
      className={`bmv-chip ${modifier} ${className}`}
      title={data?.lastFullSyncAt ?? undefined}
      data-testid="status-catalog"
    >
      {text}
    </span>
  );
}
