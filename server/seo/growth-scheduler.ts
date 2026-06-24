/**
 * SEO Growth Engine automated schedulers.
 *
 * Two recurring jobs:
 *   1. Keyword discovery (every 24h): seeds new keywords from the catalog.
 *   2. 90-day refresh (every 6h):    processes the refresh queue.
 *
 * Both are guarded by env flags and run fire-and-forget so they never block
 * the request loop. Configurable via:
 *   BMV_DISABLE_SEO_SCHEDULER=1   — disable both schedulers (hard override)
 *   SEO_SEED_INTERVAL_HOURS       — override keyword seed interval (default 24)
 *   SEO_REFRESH_INTERVAL_HOURS    — override refresh interval (default 6)
 *
 * The `seo_scheduler_enabled` key in global_settings acts as a soft toggle
 * that admins can flip without a server restart. On each tick the scheduler
 * reads the DB flag (defaults to true when absent) and skips the job if
 * disabled. The env flag BMV_DISABLE_SEO_SCHEDULER=1 takes priority and
 * prevents the scheduler from starting entirely.
 */

const DISABLED = process.env.BMV_DISABLE_SEO_SCHEDULER === "1";

const SEED_INTERVAL_MS =
  (parseInt(process.env.SEO_SEED_INTERVAL_HOURS || "24", 10) || 24) * 3_600_000;
const REFRESH_INTERVAL_MS =
  (parseInt(process.env.SEO_REFRESH_INTERVAL_HOURS || "6", 10) || 6) * 3_600_000;

/** Warm-up delay so routes/DB settle before first run. */
const WARMUP_MS = 90_000; // 90s

let seedRunning = false;
let refreshRunning = false;

/**
 * Check global_settings for the soft toggle. Fails open (returns true) if
 * the DB is unavailable so a transient error never permanently disables the
 * scheduler.
 */
async function isDbEnabled(): Promise<boolean> {
  try {
    const { storage } = await import("../storage");
    const value = await storage.getGlobalSetting("seo_scheduler_enabled");
    if (value === false || value === "false") return false;
    return true;
  } catch {
    return true;
  }
}

async function runSeedOnce(): Promise<void> {
  if (!(await isDbEnabled())) {
    console.log("[seo-scheduler] seed skipped — disabled via global_settings");
    return;
  }
  if (seedRunning) {
    console.log("[seo-scheduler] seed already running — skipping tick");
    return;
  }
  seedRunning = true;
  try {
    const { seedKeywordsFromCatalog } = await import("./growth-engine");
    const result = await seedKeywordsFromCatalog();
    console.log(`[seo-scheduler] seed complete — seeded=${result.seeded} skipped=${result.skipped}`);
  } catch (err) {
    console.error("[seo-scheduler] seed failed:", err);
  } finally {
    seedRunning = false;
  }
}

async function runRefreshOnce(): Promise<void> {
  if (!(await isDbEnabled())) {
    console.log("[seo-scheduler] refresh skipped — disabled via global_settings");
    return;
  }
  if (refreshRunning) {
    console.log("[seo-scheduler] refresh already running — skipping tick");
    return;
  }
  refreshRunning = true;
  try {
    const { processRefreshQueue } = await import("./growth-engine");
    const result = await processRefreshQueue(5);
    console.log(`[seo-scheduler] refresh complete — refreshed=${result.refreshed} errors=${result.errors}`);
  } catch (err) {
    console.error("[seo-scheduler] refresh failed:", err);
  } finally {
    refreshRunning = false;
  }
}

/**
 * Wire in both schedulers. Should be called once at server startup.
 * Returns immediately; all work runs in the background.
 */
export function startSeoGrowthScheduler(): void {
  if (DISABLED) {
    console.log("[seo-scheduler] disabled via BMV_DISABLE_SEO_SCHEDULER=1");
    return;
  }

  // Keyword seed — first run after warm-up, then every 24h
  setTimeout(() => {
    void runSeedOnce();
    setInterval(() => void runSeedOnce(), SEED_INTERVAL_MS);
  }, WARMUP_MS);

  // 90-day refresh processor — first run after warm-up + stagger, then every 6h
  setTimeout(() => {
    void runRefreshOnce();
    setInterval(() => void runRefreshOnce(), REFRESH_INTERVAL_MS);
  }, WARMUP_MS + 30_000); // 30s stagger after seed

  console.log(
    `[seo-scheduler] started — seed every ${SEED_INTERVAL_MS / 3_600_000}h, ` +
    `refresh every ${REFRESH_INTERVAL_MS / 3_600_000}h (first run after ${WARMUP_MS / 1000}s warm-up)`
  );
}
