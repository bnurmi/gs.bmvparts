/**
 * Multi-chassis chain watcher: walks a comma-separated CHASSIS_LIST,
 * launching each chassis-scoped backfill once the prod JobManager goes
 * idle. After exhausting the initial list it queries the catalog-coverage
 * API to rebuild the remaining zero-parts queue and begins another pass —
 * repeating until every scrapeable chassis has parts or the pending count
 * reaches zero. Only then does it exit cleanly.
 *
 * Respects the daily proxy budget — if remaining budget falls below
 * LAUNCH_RESERVE before launching the next chassis, sleeps until the
 * budget rolls over (UTC midnight) instead of hammering exhausted.
 *
 * Designed to run as a long-lived Replit workflow that survives the
 * agent disconnecting and chains chassis through the day.
 *
 * Resume-safe: after each chassis completes the script writes its position
 * to the `background_jobs` table (job_type='chain_chassis_backfill'). On
 * restart it loads that record, skips already-finished chassis, and also
 * filters out any chassis already covered in prod (via catalog-coverage
 * API) so a restart never re-scrapes work that's already done.
 *
 * Env:
 *   CHASSIS_LIST                    comma-separated initial queue (may be empty
 *                                   to let the script build the queue from DB)
 *   BMV_ACCOUNT_PROVISION_KEY       bearer token for admin routes
 *   PROD_BASE_URL                   default https://bmv.parts
 *   POLL_SECONDS                    default 60
 *   PER_CHASSIS_CAP_MINUTES         default 720 (12h per chassis)
 *   LAUNCH_RESERVE                  default 8000 (don't start a chassis
 *                                   if remaining budget is below this)
 *   CHAIN_RESET                     "1" to ignore saved position and restart
 */

import { Client } from "pg";

const BASE = process.env.PROD_BASE_URL || "https://bmv.parts";
const KEY = process.env.BMV_ACCOUNT_PROVISION_KEY;
const INITIAL_CHASSIS_LIST = (process.env.CHASSIS_LIST || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const POLL_SECONDS = Math.max(15, parseInt(process.env.POLL_SECONDS || "60", 10));
const PER_CHASSIS_CAP_MINUTES = Math.max(30, parseInt(process.env.PER_CHASSIS_CAP_MINUTES || "720", 10));
const LAUNCH_RESERVE = Math.max(0, parseInt(process.env.LAUNCH_RESERVE || "8000", 10));
const CHAIN_RESET = process.env.CHAIN_RESET === "1";

const DB_JOB_TYPE = "chain_chassis_backfill";

// ── DB state ──────────────────────────────────────────────────────────────

interface ChainState {
  startedAt: string;
  pass0Completed: string[]; // chassis already finished in pass-0
}

let pg: Client | null = null;
let dbJobId: number | null = null;

async function initDb(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
  } catch (e: any) {
    console.warn(`[${ts()}] [db-state] connect failed (non-fatal): ${e.message}`);
    pg = null;
  }
}

async function loadChainState(): Promise<ChainState | null> {
  if (!pg || CHAIN_RESET) return null;
  try {
    const { rows } = await pg.query<{ id: number; progress: ChainState }>(
      `SELECT id, progress FROM background_jobs
       WHERE job_type = $1 AND status != 'reset'
       ORDER BY started_at DESC LIMIT 1`,
      [DB_JOB_TYPE],
    );
    if (rows.length && rows[0].progress?.pass0Completed) {
      dbJobId = rows[0].id;
      return rows[0].progress as ChainState;
    }
  } catch (e: any) {
    console.warn(`[${ts()}] [db-state] load failed (non-fatal): ${e.message}`);
  }
  return null;
}

async function saveChainState(state: ChainState, status = "running"): Promise<void> {
  if (!pg) return;
  try {
    if (dbJobId == null) {
      const { rows } = await pg.query<{ id: number }>(
        `INSERT INTO background_jobs (job_type, status, progress, started_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
        [DB_JOB_TYPE, status, JSON.stringify(state)],
      );
      dbJobId = rows[0].id;
    } else {
      await pg.query(
        `UPDATE background_jobs SET progress = $1, status = $2, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(state), status, dbJobId],
      );
    }
  } catch (e: any) {
    console.warn(`[${ts()}] [db-state] save failed (non-fatal): ${e.message}`);
  }
}

// ── Prod API helpers ──────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

async function getStatus(): Promise<any> {
  const r = await fetch(`${BASE}/api/admin/realoem-backfill/status`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`status HTTP ${r.status}`);
  return r.json();
}

async function getCoverage(): Promise<any> {
  const r = await fetch(`${BASE}/api/admin/catalog-coverage`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`catalog-coverage HTTP ${r.status}`);
  return r.json();
}

async function markSkip(chassis: string): Promise<void> {
  try {
    const r = await fetch(`${BASE}/api/admin/realoem-backfill/mark-skip`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chassis }),
    });
    const body = await r.json().catch(() => ({}));
    console.log(`[${ts()}] [${chassis}] mark-skip: ${JSON.stringify(body)}`);
  } catch (e: any) {
    console.warn(`[${ts()}] [${chassis}] mark-skip failed: ${e?.message || e}`);
  }
}

async function postRun(chassis: string): Promise<any> {
  const r = await fetch(`${BASE}/api/admin/realoem-backfill/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scope: "chassis", chassis }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`run HTTP ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 30,
  ));
  return next.getTime() - now.getTime();
}

async function waitForIdle(label: string): Promise<any> {
  const deadline = Date.now() + PER_CHASSIS_CAP_MINUTES * 60_000;
  let lastSummary = "";
  while (Date.now() < deadline) {
    let s: any;
    try {
      s = await getStatus();
    } catch (e: any) {
      console.warn(`[${ts()}] [${label}] status fetch failed: ${e?.message || e}`);
      await new Promise(r => setTimeout(r, POLL_SECONDS * 1000));
      continue;
    }
    const b = s.budget || {};
    const summary = `running=${s.running} phase=${s.phase} cars=${s.carsProcessed ?? 0}/${s.totalCars ?? 0} diag=${(s.diagramsFetched ?? 0) + (s.diagramsCached ?? 0)}/${s.diagramsTotal ?? 0} parts=${s.partsInserted ?? 0} proxy=${s.proxyRequestsUsed ?? 0} cloned=${s.diagramsClonedFromCanonical ?? 0} saved=${s.proxyRequestsSaved ?? 0} err=${s.errors ?? 0} budget=${b.used ?? 0}/${b.limit ?? 0}`;
    if (summary !== lastSummary) {
      console.log(`[${ts()}] [${label}] ${summary}`);
      lastSummary = summary;
    }
    if (s.running === false) return s;
    await new Promise(r => setTimeout(r, POLL_SECONDS * 1000));
  }
  throw new Error(`[${label}] cap ${PER_CHASSIS_CAP_MINUTES}m exceeded; aborting chain`);
}

async function ensureBudgetForLaunch(chassis: string): Promise<void> {
  while (true) {
    const s = await getStatus();
    const remaining = s.budget?.remaining ?? 0;
    if (remaining >= LAUNCH_RESERVE) return;
    const sleepMs = Math.min(msUntilNextUtcMidnight(), 60 * 60_000);
    const sleepMin = Math.round(sleepMs / 60_000);
    console.log(`[${ts()}] [${chassis}] budget remaining ${remaining} < reserve ${LAUNCH_RESERVE}; sleeping ${sleepMin}m for daily rollover`);
    await new Promise(r => setTimeout(r, sleepMs));
  }
}

/**
 * Fetches the catalog-coverage API and returns the list of chassis that
 * still have zero parts (excluding fully-skipped chassis), sorted by
 * car count descending so busier chassis run first.
 */
async function buildRemainingQueue(): Promise<string[]> {
  const coverage = await getCoverage();
  const pending = (coverage.breakdown as { chassis: string; status: string; parts: number; carCount: number }[])
    .filter(b => b.status === "pending")
    .sort((a, b) => b.carCount - a.carCount)
    .map(b => b.chassis);
  return pending;
}

/**
 * Run through a queue of chassis one at a time, waiting for each to go idle
 * before launching the next. Calls onComplete(chassis) after each one so the
 * caller can persist progress for restart-resilience.
 */
async function runPass(
  queue: string[],
  passLabel: string,
  onComplete?: (chassis: string) => Promise<void>,
): Promise<void> {
  console.log(`[${ts()}] ${passLabel}: queue=${queue.length} chassis=[${queue.slice(0, 10).join(", ")}${queue.length > 10 ? `, …+${queue.length - 10}` : ""}]`);

  for (let i = 0; i < queue.length; i++) {
    const chassis = queue[i];
    const label = `${passLabel} ${i + 1}/${queue.length} ${chassis}`;

    await ensureBudgetForLaunch(chassis);

    console.log(`[${ts()}] [${label}] launching chassis backfill`);
    let launched: any;
    try {
      launched = await postRun(chassis);
    } catch (e: any) {
      console.error(`[${ts()}] [${label}] launch failed: ${e?.message || e}; skipping to next chassis`);
      if (onComplete) await onComplete(chassis);
      continue;
    }
    console.log(`[${ts()}] [${label}] launched: ${JSON.stringify(launched)}`);

    const final = await waitForIdle(label);
    console.log(`[${ts()}] [${label}] FINISHED phase=${final.phase} abortCode=${final.abortCode ?? "none"} cars=${final.carsProcessed ?? 0}/${final.totalCars ?? 0} parts=${final.partsInserted ?? 0} proxy=${final.proxyRequestsUsed ?? 0} cloned=${final.diagramsClonedFromCanonical ?? 0} saved=${final.proxyRequestsSaved ?? 0} err=${final.errors ?? 0}`);

    // Only mark realoem_skip when the backfill server confirms the chassis
    // has no usable RealOEM data (empty_landing_threshold abort). The
    // proxy_cap abort just means we ran out of budget — the chassis still
    // has parts to fetch and should NOT be skipped.
    if (final.abortCode === "empty_landing_threshold") {
      console.log(`[${ts()}] [${label}] empty-landing abort detected — marking chassis as realoem_skip`);
      await markSkip(chassis);
    }

    // Persist completion so restarts skip this chassis.
    if (onComplete) await onComplete(chassis);
  }
}

async function main() {
  if (!KEY) throw new Error("BMV_ACCOUNT_PROVISION_KEY missing");

  console.log(`[${ts()}] multi-chassis chain starting; base=${BASE} poll=${POLL_SECONDS}s perChassisCap=${PER_CHASSIS_CAP_MINUTES}m launchReserve=${LAUNCH_RESERVE}`);

  await initDb();

  await waitForIdle("init");

  let passIndex = 0;

  if (INITIAL_CHASSIS_LIST.length > 0) {
    // Load saved state so restarts resume from where the last run left off.
    const savedState = await loadChainState();
    const pass0Completed = new Set<string>(savedState?.pass0Completed ?? []);

    if (pass0Completed.size > 0) {
      console.log(`[${ts()}] resuming pass-0: ${pass0Completed.size} chassis already done — ${[...pass0Completed].join(", ")}`);
    }

    // Build effective queue: skip anything already done in a previous run,
    // and also skip anything already covered in prod (has parts) so a fresh
    // restart after a long gap doesn't re-scrape covered chassis.
    let pass0Queue = INITIAL_CHASSIS_LIST.filter(c => !pass0Completed.has(c));
    try {
      const coverage = await getCoverage();
      const coveredSet = new Set<string>(
        (coverage.breakdown as { chassis: string; status: string }[])
          .filter(b => b.status === "covered")
          .map(b => b.chassis),
      );
      const before = pass0Queue.length;
      pass0Queue = pass0Queue.filter(c => !coveredSet.has(c));
      const filtered = before - pass0Queue.length;
      if (filtered > 0) {
        console.log(`[${ts()}] skipping ${filtered} already-covered chassis from pass-0 queue`);
      }
    } catch (e: any) {
      console.warn(`[${ts()}] coverage check failed, proceeding without coverage filter: ${e?.message}`);
    }

    if (pass0Queue.length === 0) {
      console.log(`[${ts()}] pass-0 queue empty after filtering — all initial chassis already covered`);
    } else {
      // Initialise / update the DB state row before starting the pass.
      const state: ChainState = {
        startedAt: savedState?.startedAt ?? new Date().toISOString(),
        pass0Completed: [...pass0Completed],
      };
      await saveChainState(state, "running");

      await runPass(pass0Queue, `pass-${passIndex}`, async (chassis) => {
        pass0Completed.add(chassis);
        await saveChainState(
          { startedAt: state.startedAt, pass0Completed: [...pass0Completed] },
          "running",
        );
      });

      await saveChainState(
        { startedAt: state.startedAt, pass0Completed: [...pass0Completed] },
        "completed",
      );
    }

    passIndex++;
  }

  // Self-sustaining loop: after exhausting any initial queue (or if none
  // was provided), rebuild from the DB and keep going until the catalog
  // is fully covered. DB-driven passes filter by status=pending so they
  // are naturally restart-safe — no position persistence needed.
  while (true) {
    const remaining = await buildRemainingQueue();

    if (remaining.length === 0) {
      const coverage = await getCoverage();
      console.log(`[${ts()}] all chassis covered — chain complete. total=${coverage.total} covered=${coverage.covered} skipped=${coverage.skipped} parts=${coverage.totalParts}`);
      if (pg) await pg.end();
      process.exit(0);
    }

    console.log(`[${ts()}] pass-${passIndex}: ${remaining.length} chassis still pending`);
    await runPass(remaining, `pass-${passIndex}`);
    passIndex++;

    // Brief pause between passes to let DB writes settle before re-querying.
    await new Promise(r => setTimeout(r, 5_000));
  }
}

main().catch(err => {
  console.error(`[${ts()}] FATAL:`, err);
  process.exit(1);
});
