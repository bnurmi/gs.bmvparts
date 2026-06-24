#!/usr/bin/env node
// Drives /api/batch-scrape in chunks while keeping ~CONCURRENCY active jobs.
// Logs progress and exits when the idle queue is fully drained.
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:5000";
const USERNAME = process.env.ADMIN_USERNAME || "admin";
const PASSWORD = process.env.ADMIN_PASSWORD;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "12", 10);
const POLL_MS = parseInt(process.env.POLL_MS || "20000", 10);
const STATE_FILE = process.env.STATE_FILE || "/tmp/batch_scrape_state.json";

if (!PASSWORD) { console.error("ADMIN_PASSWORD env required"); process.exit(1); }

let cookie = "";
async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${r.status}: ${await r.text()}`);
  cookie = r.headers.get("set-cookie")?.split(";")[0] || "";
  if (!cookie) throw new Error("no session cookie");
}

async function adminGet(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie } });
  if (r.status === 401 || r.status === 403) { await login(); return adminGet(path); }
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function adminPost(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body || {}),
  });
  if (r.status === 401 || r.status === 403) { await login(); return adminPost(path, body); }
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

function ts() { return new Date().toISOString().replace("T", " ").slice(0, 19); }
function writeState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch {}
}

async function main() {
  await login();
  console.log(`[${ts()}] driver started (concurrency=${CONCURRENCY}, poll=${POLL_MS}ms)`);

  let totalStarted = 0;
  let cycles = 0;
  let consecutiveZero = 0;

  while (true) {
    cycles++;
    let stats;
    try { stats = await adminGet("/api/scrape-status"); }
    catch (e) {
      console.log(`[${ts()}] status error: ${e.message}`);
      await new Promise(r => setTimeout(r, POLL_MS));
      continue;
    }

    const running = stats.running ?? 0;
    const idle = stats.idle ?? 0;
    const errored = stats.errorNoParts ?? 0;
    const complete = stats.complete ?? 0;
    const slots = Math.max(0, CONCURRENCY - running);

    let started = 0;
    if (slots > 0 && (idle > 0 || errored > 0)) {
      try {
        const r = await adminPost("/api/batch-scrape", { limit: slots });
        started = r.started || 0;
        totalStarted += started;
      } catch (e) {
        console.log(`[${ts()}] batch-scrape error: ${e.message}`);
      }
    }

    console.log(`[${ts()}] cycle=${cycles} running=${running} idle=${idle} err=${errored} complete=${complete} +started=${started} total_launched=${totalStarted}`);
    writeState({ ts: ts(), cycles, running, idle, errored, complete, totalStarted });

    if (idle === 0 && running === 0 && errored === 0) {
      consecutiveZero++;
      if (consecutiveZero >= 3) {
        console.log(`[${ts()}] queue fully drained — exiting`);
        break;
      }
    } else {
      consecutiveZero = 0;
    }

    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
