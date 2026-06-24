#!/usr/bin/env tsx
// Pre-deploy gate: spin up a temporary server and run the hub SEO smoke
// check (scripts/verify-hub-seo.ts). Exits non-zero if the check fails so
// the deploy is blocked. On failure, also tries to email the same admin
// who receives backup alerts.

import { spawn } from "child_process";

const PORT = process.env.HUB_SEO_PORT || "5099";
const BASE = `http://localhost:${PORT}`;
const SERVER_BOOT_TIMEOUT_MS = 90_000;

async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/chassis`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 1_000));
  }
  throw new Error(`temp server at ${BASE} did not become ready within ${timeoutMs}ms (last error: ${lastErr})`);
}

function runChild(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", env });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`[Pre-Deploy/HubSEO] child error:`, err.message);
      resolve(1);
    });
  });
}

async function notifyFailure(detail: string) {
  try {
    const { getAlertEmailRecipient } = await import("../server/backup/alerts");
    const { sendEmail } = await import("../server/email");
    const to = await getAlertEmailRecipient();
    if (!to) {
      console.warn("[Pre-Deploy/HubSEO] No alert recipient configured — skipping email");
      return;
    }
    const html = `<div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#b91c1c;margin:0 0 12px">Pre-deploy hub SEO check failed</h2>
      <p>The deploy was blocked because <code>scripts/verify-hub-seo.ts</code> reported regressions.</p>
      <pre style="background:#f3f4f6;padding:8px;border-radius:6px;font-size:12px;white-space:pre-wrap">${
        detail.replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))
      }</pre>
      <p style="color:#6b7280;font-size:12px">Sent automatically by the BMV.parts pre-deploy pipeline.</p>
    </div>`;
    await sendEmail({ to, subject: "[BMV Deploy] Hub SEO check failed — deploy blocked", html });
    console.log(`[Pre-Deploy/HubSEO] Failure notification sent to ${to}`);
  } catch (err: any) {
    console.error("[Pre-Deploy/HubSEO] Failed to send failure notification:", err?.message ?? err);
  }
}

async function main() {
  console.log(`[Pre-Deploy/HubSEO] Starting temporary server on ${BASE}...`);
  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT,
    NODE_ENV: process.env.HUB_SEO_SERVER_NODE_ENV || "development",
    HUB_SEO_PREDEPLOY: "1",
  };
  const server = spawn("tsx", ["server/index.ts"], { stdio: "inherit", env: serverEnv });

  let serverExited = false;
  let serverExitCode: number | null = null;
  server.on("exit", (code) => {
    serverExited = true;
    serverExitCode = code;
  });

  const cleanup = () => {
    if (!serverExited) {
      try { server.kill("SIGTERM"); } catch {}
      setTimeout(() => { if (!serverExited) try { server.kill("SIGKILL"); } catch {} }, 5_000).unref();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  process.on("SIGTERM", () => { cleanup(); process.exit(143); });

  try {
    await waitForServer(SERVER_BOOT_TIMEOUT_MS);
  } catch (err: any) {
    console.error(`[Pre-Deploy/HubSEO] ${err?.message ?? err}`);
    if (serverExited) console.error(`[Pre-Deploy/HubSEO] (temp server exited early with code ${serverExitCode})`);
    cleanup();
    await notifyFailure(`Temp server failed to start: ${err?.message ?? err}`);
    process.exit(1);
  }

  console.log(`[Pre-Deploy/HubSEO] Temp server ready. Running scripts/drift-guard-bmv-vin.ts...`);
  const driftCode = await runChild("tsx", ["scripts/drift-guard-bmv-vin.ts"], process.env);
  if (driftCode !== 0) {
    console.error(`[Pre-Deploy/HubSEO] drift-guard-bmv-vin exited ${driftCode} — blocking deploy`);
    cleanup();
    await notifyFailure(`scripts/drift-guard-bmv-vin.ts exited with status ${driftCode}. The bmv.vin feature registry is out of sync with its consumers; see deploy logs.`);
    process.exit(driftCode || 1);
  }

  console.log(`[Pre-Deploy/HubSEO] Running scripts/verify-hub-seo.ts...`);
  const checkEnv: NodeJS.ProcessEnv = { ...process.env, HUB_SEO_BASE_URL: BASE };
  const code = await runChild("tsx", ["scripts/verify-hub-seo.ts"], checkEnv);

  if (code !== 0) {
    console.error(`[Pre-Deploy/HubSEO] verify-hub-seo exited ${code} — blocking deploy`);
    cleanup();
    await notifyFailure(`scripts/verify-hub-seo.ts exited with status ${code}. See deploy logs for the per-check breakdown.`);
    process.exit(code || 1);
  }

  console.log(`[Pre-Deploy/HubSEO] Running scripts/bmv-vin-crawl.ts...`);
  const crawlEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BMV_VIN_CRAWL_BASE: BASE,
    BMV_VIN_CRAWL_MAX: process.env.BMV_VIN_CRAWL_MAX || "200",
  };
  const crawlCode = await runChild("tsx", ["scripts/bmv-vin-crawl.ts"], crawlEnv);

  cleanup();

  if (crawlCode !== 0) {
    console.error(`[Pre-Deploy/HubSEO] bmv-vin-crawl exited ${crawlCode} — blocking deploy`);
    await notifyFailure(`scripts/bmv-vin-crawl.ts exited with status ${crawlCode}. The bmv.vin link crawler found a non-2xx page or a non-canonical <link rel="canonical">; see deploy logs for the failing URL.`);
    process.exit(crawlCode || 1);
  }

  console.log(`[Pre-Deploy/HubSEO] All checks passed.`);
  process.exit(0);
}

main().catch(async (err) => {
  console.error(`[Pre-Deploy/HubSEO] Unexpected error:`, err?.message ?? err);
  await notifyFailure(`Unexpected error: ${err?.message ?? err}`);
  process.exit(1);
});
