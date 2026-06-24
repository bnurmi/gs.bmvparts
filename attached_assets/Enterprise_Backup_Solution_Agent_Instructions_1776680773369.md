# Enterprise-Grade Backup System — Replit Agent Instructions

Build a production-ready, enterprise-grade backup system for a Flask + PostgreSQL application hosted on Replit with Object Storage. The system must handle automated database backups, file/asset backups, offsite redundancy, failure alerting, restore capability, and a full admin dashboard.

---

## Architecture Overview

The backup system consists of five modules plus a database model, admin UI, and health endpoint:

1. **BackupLog Model** — Database table recording every backup attempt
2. **Database Backup Module** (`db_backup.py`) — Core pg_dump pipeline with verification
3. **File/Asset Backup Module** (`file_backup.py`) — Object storage asset manifest snapshots
4. **Offsite Transfer Module** (`backup_offsite.py`) — S3-compatible remote redundancy
5. **Alert Module** (`backup_alerts.py`) — Failure notifications via email and/or Telegram
6. **Pre-Deploy Backup Script** (`pre_deploy_backup.py`) — Triggered before deployments
7. **Admin Dashboard** — Full backup history, settings, restore UI
8. **Health Endpoint** — JSON status for external monitoring

---

## 1. BackupLog Model

Add a `BackupLog` database model to record every backup attempt.

### Fields

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer, PK | Auto-increment |
| `backup_type` | String(20) | `db`, `files`, or `restore` |
| `trigger` | String(20) | `scheduled`, `manual`, `pre-deploy` |
| `status` | String(20) | `pending`, `success`, `failed`, `verified` |
| `offsite_status` | String(20) | `pending`, `transferred`, `failed`, `skipped` |
| `file_size` | BigInteger | Compressed size in bytes |
| `checksum` | String(64) | SHA-256 of compressed backup |
| `duration_seconds` | Float | How long the backup took |
| `object_key` | String(500) | Path in primary object storage |
| `offsite_key` | String(500) | Path in offsite S3 bucket |
| `error_message` | Text | Error details on failure |
| `created_at` | DateTime | Indexed, defaults to UTC now |

### Helper Properties

- `short_checksum` — Returns first 12 chars of checksum for display
- `size_display` — Human-readable file size (B/KB/MB/GB)

---

## 2. Database Backup Module (`db_backup.py`)

### Core Backup Flow

1. Create a `BackupLog` record with status `pending`
2. Run `pg_dump --no-owner --no-privileges $DATABASE_URL` via subprocess (300s timeout)
3. Gzip compress the SQL output (compresslevel=6)
4. Compute SHA-256 checksum of the compressed bytes
5. Verify the backup: decompress in memory, check for SQL markers (`CREATE TABLE`, `COPY`, `INSERT INTO`), verify line count > 10
6. Upload to object storage under the appropriate prefix
7. Update the `BackupLog` record with size, checksum, duration, status (`verified` or `failed`)
8. Trigger offsite transfer
9. Run post-backup alert checks
10. Run retention cleanup

### Storage Prefixes

```
backups/db/          — Daily backups
backups/db/hourly/   — Hourly backups
backups/db/weekly/   — Weekly backups
backups/db/monthly/  — Monthly backups
backups/files/       — File manifest backups
```

### Configurable Retention Tiers

Store retention config in a `GlobalSetting` model (JSON):

```python
DEFAULT_RETENTION = {
    'hourly': 48,
    'daily': 30,
    'weekly': 12,
    'monthly': 0,   # 0 = keep indefinitely
}
```

Cleanup runs after each successful backup: list objects per prefix, sort by key (timestamp-based), delete oldest beyond the configured count. Apply cleanup independently to both onsite and offsite storage.

### Configurable Schedule

Store schedule config in a `GlobalSetting` model (JSON):

```python
DEFAULT_SCHEDULE = {
    'hourly_enabled': True,
    'hourly_interval_minutes': 60,
    'daily_enabled': True,
    'daily_hour_utc': 2,
    'weekly_enabled': True,
    'weekly_day': 0,          # 0=Monday
    'monthly_enabled': True,
    'file_backup_enabled': True,
}
```

### Scheduler

Use APScheduler `BackgroundScheduler` with:
- **Hourly** — `IntervalTrigger(minutes=N)` (minimum 5 minutes)
- **Daily** — `CronTrigger(hour=H, minute=0)`
- **Weekly** — `CronTrigger(day_of_week=D, hour=H, minute=30)`
- **Monthly** — `CronTrigger(day=1, hour=H, minute=15)`

Prevent duplicate schedulers across workers using a file lock (`/tmp/.backup_scheduler.lock` with `fcntl.flock`). Jobs use `max_instances=1` and `coalesce=True`.

Provide a `reschedule_jobs()` function so schedule changes from the admin UI take effect immediately without restarting the app.

Daily backup job should also trigger a file backup if enabled.

### Pre-Deploy Backup

Expose a `create_pre_deploy_backup()` function that calls the main backup with `label='pre_deploy'` and `trigger='pre-deploy'`.

---

## 3. File/Asset Backup Module (`file_backup.py`)

### Flow

1. Create a `BackupLog` record (type=`files`, status=`pending`)
2. Scan all object storage assets under configurable prefixes (e.g., `images/`, `uploads/`, `assets/`, `documents/`)
3. For each asset: download, compute SHA-256 checksum, record key/size/checksum
4. Build a JSON manifest with metadata (timestamp, total count, total size, missing checksums count, asset list)
5. Gzip compress the manifest
6. Upload to `backups/files/file_manifest_{timestamp}.json.gz`
7. Update `BackupLog` with status, size, checksum
8. Trigger offsite transfer
9. Run post-backup alerts

---

## 4. Offsite Transfer Module (`backup_offsite.py`)

### Configuration (Environment Variables)

| Variable | Purpose |
|----------|---------|
| `OFFSITE_BACKUP_ENDPOINT` | S3-compatible endpoint URL |
| `OFFSITE_BACKUP_BUCKET` | Bucket name |
| `OFFSITE_BACKUP_ACCESS_KEY` | Access key |
| `OFFSITE_BACKUP_SECRET_KEY` | Secret key |

### Behavior

- **If not configured**: Mark `offsite_status` as `skipped`, log a warning, continue
- **Transfer**: Upload compressed backup bytes to offsite bucket using `boto3` with the same object key as onsite
- **Retry logic**: 3 attempts with exponential backoff (`2^attempt` seconds)
- **On success**: Update `BackupLog.offsite_status = 'transferred'`, store `offsite_key`
- **On failure**: Update `BackupLog.offsite_status = 'failed'`, append error to `error_message`
- **Test connection**: `head_bucket()` call to verify the destination is reachable
- **Cleanup**: Independent retention per prefix, matching onsite retention tiers
- **Download**: Support downloading from offsite for restore fallback

The onsite copy is always retained. Offsite is an additional redundant copy, not a move.

---

## 5. Alert Module (`backup_alerts.py`)

### Trigger Conditions (checked after every backup attempt)

1. Any backup failures in the last 25 hours
2. Any offsite transfer failures in the last 25 hours
3. No successful DB backup in 25+ hours

### Alert Content

- List of triggered conditions
- Consecutive failure count (count most recent consecutive `failed` DB backups)
- Last successful backup timestamp

### Delivery Channels

- **Email**: Send HTML email to the first admin user via an email helper
- **Telegram**: Send formatted message to configured alerts chat ID via a Telegram bot module

Both channels are best-effort — failures to send alerts are logged but don't block the backup pipeline.

---

## 6. Pre-Deploy Backup Script (`pre_deploy_backup.py`)

A standalone script that:
1. Imports the Flask app context
2. Calls `create_pre_deploy_backup()` from the main backup module
3. Logs success/failure
4. Always exits with code 0 (non-blocking — deployment should not fail if backup fails)

Can be wired into the deployment pipeline or called via an admin endpoint with token auth.

---

## 7. Admin Dashboard

### Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/admin/backups` | GET | Admin | Main backup dashboard |
| `/admin/backup/file-backup` | POST | Admin | Trigger manual file backup |
| `/admin/backup/retention` | POST | Admin | Update retention settings |
| `/admin/backup/schedule` | POST | Admin | Update schedule settings |
| `/admin/backup/pre-deploy` | POST | Token | Trigger pre-deploy backup |
| `/admin/backup/test-offsite` | POST | Admin | Test offsite connection |
| `/admin/backup/restore/<id>` | GET | Admin | Restore confirmation page |
| `/admin/backup/restore/<id>` | POST | Admin | Execute restore |
| `/admin/backup/health` | GET | Token | Health status JSON |

### Dashboard UI Elements

- **Health summary card**: Last successful backup time, offsite sync status, next scheduled run, total storage used
- **History table**: Type, trigger, status badge (color-coded), offsite status badge, file size, checksum (truncated), duration, timestamp
- **Retention settings panel**: Edit hourly/daily/weekly/monthly counts
- **Schedule settings panel**: Enable/disable tiers, set intervals and times
- **Offsite configuration panel**: Show configured endpoint/bucket, test connection button
- **Manual backup button**: Trigger an immediate DB backup
- **Manual file backup button**: Trigger an immediate file manifest backup
- **Restore button**: Per verified DB backup, links to restore confirmation page

### Restore Workflow

1. Admin clicks "Restore" on a verified DB backup
2. Confirmation page shows backup metadata (type, timestamp, size, checksum, status)
3. Admin chooses restore source: onsite (default, faster) or offsite
4. If onsite copy unavailable, automatically fall back to offsite
5. Download and decompress the backup
6. Execute SQL against the database using `psql`
7. Log the restore attempt to `BackupLog` with type `restore`
8. Restrict to superadmin only

---

## 8. Health Endpoint (`/admin/backup/health`)

Returns JSON with:
- Last DB backup time and status
- Last file backup time and status
- Offsite sync status
- Next scheduled run time
- Count of backups by type in the last 30 days

Auth: Internal token via `BACKUP_HEALTH_TOKEN` environment variable or admin session.

---

## Dependencies

- `apscheduler` — Background job scheduling
- `boto3` — S3-compatible offsite storage client
- `psycopg2` or equivalent — PostgreSQL adapter (for restore)
- `pg_dump` — System binary for database dumps
- Replit Object Storage — Primary backup storage
- Flask-SQLAlchemy — ORM for BackupLog and settings

---

## Environment Variables Required

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OFFSITE_BACKUP_ENDPOINT` | No | S3-compatible endpoint for offsite copies |
| `OFFSITE_BACKUP_BUCKET` | No | Offsite bucket name |
| `OFFSITE_BACKUP_ACCESS_KEY` | No | Offsite access key |
| `OFFSITE_BACKUP_SECRET_KEY` | No | Offsite secret key |
| `BACKUP_HEALTH_TOKEN` | No | Token for health endpoint and pre-deploy trigger |

---

## Key Design Principles

1. **Dual-copy redundancy**: Every backup is stored both onsite (object storage) and offsite (S3-compatible). Either copy alone is sufficient for full restore.
2. **Verify before trusting**: Every DB backup is decompressed and checked for SQL markers before being marked as verified.
3. **Non-blocking failures**: Alert failures, offsite failures, and pre-deploy backup failures never block the primary operation.
4. **Audit trail**: Every backup attempt is logged with full metadata regardless of outcome.
5. **Single-worker scheduling**: File lock prevents duplicate scheduler instances across workers.
6. **Configurable everything**: Retention tiers, schedule intervals, and offsite destination are all configurable from the admin UI without code changes.
7. **Graceful degradation**: If offsite is not configured, backups still work onsite-only with status marked as `skipped`.
