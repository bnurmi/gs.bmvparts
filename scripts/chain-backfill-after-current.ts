/**
 * One-shot watcher: waits for the prod backfill JobManager to go idle,
 * then POSTs a chassis-scoped backfill for the chassis given in
 * NEXT_CHASSIS, then exits. Designed to be run as a Replit workflow so
 * it survives the agent disconnecting.
 *
 * Env:
 *   NEXT_CHASSIS                   chassis code, e.g. "F34"
 *   BMV_ACCOUNT_PROVISION_KEY      bearer token for admin routes
 *   PROD_BASE_URL                  default https://bmv.parts
 *   POLL_SECONDS                   default 60
 *   MAX_WAIT_MINUTES               default 240 (4h cap, then bail loud)
 */

const BASE = process.env.PROD_BASE_URL || "https://bmv.parts";
const KEY = process.env.BMV_ACCOUNT_PROVISION_KEY;
const NEXT_CHASSIS = process.env.NEXT_CHASSIS;
const POLL_SECONDS = Math.max(15, parseInt(process.env.POLL_SECONDS || "60", 10));
const MAX_WAIT_MINUTES = Math.max(5, parseInt(process.env.MAX_WAIT_MINUTES || "240", 10));

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

async function main() {
  if (!KEY) throw new Error("BMV_ACCOUNT_PROVISION_KEY missing");
  if (!NEXT_CHASSIS) throw new Error("NEXT_CHASSIS missing");

  console.log(`[${ts()}] chain-backfill watcher starting; next=${NEXT_CHASSIS} base=${BASE} poll=${POLL_SECONDS}s cap=${MAX_WAIT_MINUTES}m`);

  const deadline = Date.now() + MAX_WAIT_MINUTES * 60_000;
  let lastSummary = "";

  while (Date.now() < deadline) {
    let s: any;
    try {
      s = await getStatus();
    } catch (e: any) {
      console.warn(`[${ts()}] status fetch failed: ${e?.message || e}`);
      await new Promise(r => setTimeout(r, POLL_SECONDS * 1000));
      continue;
    }
    const summary = `running=${s.running} phase=${s.phase} cars=${s.carsProcessed ?? 0}/${s.totalCars ?? 0} diag=${(s.diagramsFetched ?? 0) + (s.diagramsCached ?? 0)}/${s.diagramsTotal ?? 0} parts=${s.partsInserted ?? 0} proxy=${s.proxyRequestsUsed ?? 0} err=${s.errors ?? 0}`;
    if (summary !== lastSummary) {
      console.log(`[${ts()}] ${summary}`);
      lastSummary = summary;
    }
    if (s.running === false) {
      console.log(`[${ts()}] previous job idle (last phase=${s.phase}); launching chassis=${NEXT_CHASSIS}`);
      const launched = await postRun(NEXT_CHASSIS);
      console.log(`[${ts()}] launched: ${JSON.stringify(launched)}`);
      console.log(`[${ts()}] watcher exiting (chained job will run server-side until completion).`);
      return;
    }
    await new Promise(r => setTimeout(r, POLL_SECONDS * 1000));
  }

  throw new Error(`watcher gave up after ${MAX_WAIT_MINUTES}m; previous job still running`);
}

main().catch(err => {
  console.error(`[${ts()}] FATAL:`, err);
  process.exit(1);
});
