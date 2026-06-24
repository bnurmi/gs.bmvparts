# bmv.parts — Prometheus Monitoring Guide

Observability setup for bmv.parts. The Node.js app exposes application
metrics on `GET /metrics` (Prometheus text format) and a readiness probe
on `GET /health`. Host-level metrics are served by `prometheus-node-exporter`
on port 9100.

---

## Architecture

```
monitor.hiddenservers.net:9090 (Prometheus)
        │
        ├── scrapes  bmv.parts VM :5000/metrics   ← app metrics (prom-client)
        └── scrapes  bmv.parts VM :9100/metrics   ← host metrics (node-exporter)
```

---

## 1. App metrics — `/metrics`

The endpoint is served by the Express app at `http://127.0.0.1:5000/metrics`.

### Metrics exposed

| Metric | Type | Description |
|---|---|---|
| `bmv_parts_http_requests_total` | Counter | All HTTP requests, labelled by `method`, `route`, `status_class` |
| `bmv_parts_http_request_duration_seconds` | Histogram | Request latency with p50/p95/p99 buckets |
| `bmv_parts_http_errors_total` | Counter | 4xx + 5xx responses |
| `bmv_parts_process_uptime_seconds` | Gauge | Node.js process uptime |
| `bmv_parts_build_info` | Gauge | Always 1; `version`, `environment`, `service` labels carry build info |
| `bmv_parts_database_up` | Gauge | 1 = PostgreSQL reachable, 0 = down (updated on every `/health` poll) |
| `bmv_parts_cache_up` | Gauge | 1 = Redis reachable, 0 = down (updated on every `/health` poll) |
| `bmv_parts_process_*` | various | Default Node.js process metrics (CPU, memory, GC, event-loop lag, FDs) |

Labels used (all low-cardinality):

- `method` — HTTP verb (`GET`, `POST`, …)
- `route` — matched Express route pattern (`/api/cars/:id`) or path prefix for 404s
- `status_class` — `2xx`, `3xx`, `4xx`, `5xx`
- `service` — always `bmv.parts`
- `environment` — `production` or `development`

### Access control

Two independent layers protect `/metrics`:

**Layer 1 — IP allow-list (default, no config needed)**
When `METRICS_TOKEN` is not set, the endpoint only responds to requests
from loopback (`127.0.0.1`, `::1`) and RFC-1918 private ranges
(`10.x`, `172.16–31.x`, `192.168.x`).

This is sufficient when Prometheus runs on the same VM or on a private LAN.

**Layer 2 — Bearer token (for remote scraping)**
Set `METRICS_TOKEN=<secret>` in the app's environment:

```bash
echo "METRICS_TOKEN=$(openssl rand -hex 32)" >> /opt/bmv.parts/.env
sudo systemctl restart bmv-parts
```

Then configure Prometheus to send the token:

```yaml
authorization:
  type: Bearer
  credentials: "<your-token-here>"
```

When `METRICS_TOKEN` is set, the IP restriction is lifted and every request
must carry the token regardless of source IP.

---

## 2. Health endpoint — `/health`

```
GET http://127.0.0.1:5000/health
```

Returns:

```json
{
  "status": "ok",
  "service": "bmv.parts",
  "db": "ok",
  "redis": "ok"
}
```

HTTP 200 when healthy, 503 when degraded. The `/health` probe also updates
the `bmv_parts_database_up` and `bmv_parts_cache_up` Prometheus gauges, so
polling `/health` is sufficient to keep dependency metrics current.

---

## 3. Node exporter — host metrics on port 9100

Install and enable once on the bmv.parts VM:

```bash
sudo apt-get update
sudo apt-get install -y prometheus-node-exporter
sudo systemctl enable prometheus-node-exporter
sudo systemctl restart prometheus-node-exporter
```

Verify:

```bash
systemctl is-active prometheus-node-exporter
curl -sS http://127.0.0.1:9100/metrics | head -20
```

---

## 4. Prometheus scrape targets

Add the contents of `deploy/monitoring/prometheus-targets.yml` to the
Prometheus configuration on `monitor.hiddenservers.net`.

Replace `BMV_PARTS_VM_IP` with the VM's private/LAN IP.

**Do not expose port 5000 publicly.** Either:
- Restrict inbound TCP 5000 via firewall to `monitor.hiddenservers.net`'s IP, OR
- Set `METRICS_TOKEN` and let Prometheus authenticate over the public internet

---

## 5. Alert rules

Import `deploy/monitoring/alert-rules.yml` into Prometheus/Alertmanager.

Covered alert categories:

| Rule | Severity |
|---|---|
| Site unreachable (scrape fails) | critical |
| DB or Redis down | warning |
| Process restart loop | warning |
| 5xx error rate > 5% | critical |
| 4xx error rate > 20% | warning |
| p95 latency > 3s | warning |
| p99 latency > 10s | critical |
| VM memory > 90% | warning |
| VM CPU > 85% for 10m | warning |
| VM disk > 85% | warning |
| Node exporter down | warning |
| TLS cert expiring < 14d | warning |
| TLS cert expiring < 3d | critical |
| No successful scrape in 5m | warning |

---

## 6. Verification commands

Run these on the bmv.parts VM after deployment:

```bash
# Health endpoint (HTTP 200 = ok, 503 = degraded)
curl -sS http://127.0.0.1:5000/health | python3 -m json.tool

# Metrics endpoint (requires private IP or METRICS_TOKEN)
curl -sS http://127.0.0.1:5000/metrics | head -30

# Spot-check key metrics
curl -sS http://127.0.0.1:5000/metrics | grep -E "bmv_parts_(http_requests|build_info|database_up|cache_up|process_uptime)"

# Node exporter
systemctl is-active prometheus-node-exporter
curl -sS http://127.0.0.1:9100/metrics | head -10

# Public site check
curl -I https://bmv.parts

# Prometheus target status (if accessible from this host)
curl -sS "http://monitor.hiddenservers.net:9090/api/v1/targets" | python3 -m json.tool | grep -A5 "bmv"
```

---

## 7. Manual follow-up on monitor.hiddenservers.net

The following steps must be completed on the Prometheus host manually:

1. **Add scrape targets** — copy the jobs from `prometheus-targets.yml` into
   the Prometheus `scrape_configs` section and reload:
   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```

2. **Add alert rules** — copy `alert-rules.yml` to the Prometheus rules
   directory (e.g. `/etc/prometheus/rules/bmv-parts.yml`) and reload.

3. **Configure Alertmanager** — wire the `severity: critical` and
   `severity: warning` labels to your notification channels (PagerDuty,
   Slack, email).

4. **Verify targets appear healthy** — visit
   `http://monitor.hiddenservers.net:9090/targets` and confirm both
   `bmv-parts` and `bmv-parts-node` show `UP`.
