import type { Request, Response, NextFunction } from "express";
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
// A dedicated registry (not the global default) so we control exactly what
// gets emitted and can safely add the bmv_parts_ prefix without collisions.
// ---------------------------------------------------------------------------

export const register = new Registry();
register.setDefaultLabels({ service: "bmv.parts" });

// Collect default Node.js process metrics (CPU, memory, event-loop lag,
// garbage collection, file descriptors) with the bmv_parts_ prefix.
collectDefaultMetrics({ register, prefix: "bmv_parts_" });

// ---------------------------------------------------------------------------
// Required metrics
// ---------------------------------------------------------------------------

export const httpRequestsTotal = new Counter({
  name: "bmv_parts_http_requests_total",
  help: "Total number of HTTP requests received",
  labelNames: ["method", "route", "status_class"] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "bmv_parts_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status_class"] as const,
  // Buckets tuned for a typical web API: fast (<50ms) through slow (>5s)
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpErrorsTotal = new Counter({
  name: "bmv_parts_http_errors_total",
  help: "Total number of HTTP 4xx and 5xx responses",
  labelNames: ["method", "route", "status_class"] as const,
  registers: [register],
});

export const processUptimeSeconds = new Gauge({
  name: "bmv_parts_process_uptime_seconds",
  help: "Node.js process uptime in seconds",
  registers: [register],
  collect() {
    this.set(process.uptime());
  },
});

// build_info stays at 1.0; the real value is in the labels.
export const buildInfo = new Gauge({
  name: "bmv_parts_build_info",
  help: "Static build / version information (value is always 1)",
  labelNames: ["version", "environment", "service"] as const,
  registers: [register],
});
buildInfo
  .labels({
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    service: "bmv.parts",
  })
  .set(1);

// ---------------------------------------------------------------------------
// Optional dependency-health gauges (1 = up, 0 = down)
// ---------------------------------------------------------------------------

export const databaseUp = new Gauge({
  name: "bmv_parts_database_up",
  help: "1 if the PostgreSQL database is reachable, 0 otherwise",
  registers: [register],
});

export const cacheUp = new Gauge({
  name: "bmv_parts_cache_up",
  help: "1 if the Redis cache is reachable, 0 otherwise",
  registers: [register],
});

// Start optimistically; /health updates these on every probe.
databaseUp.set(0);
cacheUp.set(0);

// ---------------------------------------------------------------------------
// Route normalisation helper
// ---------------------------------------------------------------------------
// Uses Express's matched route pattern (e.g. /api/parts/:id) when available
// so the label stays low-cardinality. Falls back to the first two path
// segments for unmatched routes (404s) to avoid high-cardinality raw URLs.
// ---------------------------------------------------------------------------

function normalizeRoute(req: Request): string {
  if (req.route?.path) {
    const base = (req as any).baseUrl || "";
    const pattern = req.route.path;
    return `${base}${pattern}`;
  }
  // First two segments only for unmatched paths (keeps cardinality bounded)
  const segs = req.path.split("/").filter(Boolean).slice(0, 2);
  return segs.length ? `/${segs.join("/")}` : "/";
}

// ---------------------------------------------------------------------------
// HTTP instrumentation middleware
// ---------------------------------------------------------------------------
// Register early in the Express stack (before routes) so every request is
// measured. Reads req.route.path from the 'finish' event, by which point
// Express has already matched and populated it.
// ---------------------------------------------------------------------------

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip /metrics and /health from self-observation to avoid feedback loops
  if (req.path === "/metrics" || req.path === "/health") {
    return next();
  }

  const startMs = Date.now();

  res.on("finish", () => {
    const durationSec = (Date.now() - startMs) / 1000;
    const route = normalizeRoute(req);
    const method = req.method.toUpperCase();
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;

    const labels = { method, route, status_class: statusClass };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);

    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });

  next();
}

// ---------------------------------------------------------------------------
// IP allow-list check for /metrics
// ---------------------------------------------------------------------------
// Private ranges: loopback (127/8), RFC-1918 (10/8, 172.16/12, 192.168/16),
// and IPv6 loopback (::1). On a VM behind Nginx the real client is always
// 127.0.0.1, so this is safe without an extra token by default.
// Set METRICS_TOKEN to also require Bearer auth (recommended when Prometheus
// scrapes from a remote host over the public internet).
// ---------------------------------------------------------------------------

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fd[0-9a-f]{2}:/i, // IPv6 ULA
];

export function isPrivateIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, ""); // strip IPv4-mapped IPv6
  return PRIVATE_RANGES.some((re) => re.test(clean));
}
