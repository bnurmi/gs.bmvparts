// Failure alerting for the ISTA quarterly auto-ingest worker (Task #109).
// Mirrors the backup-alerts pattern in server/backup/alerts.ts: prefer
// an explicit ISTA_ALERT_EMAIL override, fall back to the first admin
// user's registered email, and skip with a console warning if no
// recipient can be resolved (no silent failures, but no crashes either).

import { storage } from "../storage";
import { sendEmail } from "../email";
import type { IstaIngestRun } from "@shared/schema";

export async function getAlertRecipient(): Promise<string | null> {
  const v = process.env.ISTA_ALERT_EMAIL || process.env.BACKUP_ALERT_EMAIL;
  if (v && v.trim().length > 0) return v.trim();
  try {
    return await storage.getFirstAdminEmail();
  } catch (err) {
    console.error("[ISTA/Alerts] Failed to resolve admin email:", err);
    return null;
  }
}

export async function sendIngestFailureAlert(run: IstaIngestRun): Promise<void> {
  const recipient = await getAlertRecipient();
  if (!recipient) {
    console.warn(
      "[ISTA/Alerts] No recipient available (set ISTA_ALERT_EMAIL or register an admin email) — " +
      `skipping email for failed ingest of ${run.version}`,
    );
    return;
  }
  try {
    await sendEmail({
      to: recipient,
      subject: `[BMV ISTA] Ingest failed: ${run.version} (${run.failedStep || "unknown"})`,
      html: renderHtml(run),
    });
  } catch (err) {
    console.error("[ISTA/Alerts] Email send failed:", err);
  }
}

function renderHtml(run: IstaIngestRun): string {
  const esc = (s: string | null | undefined) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return `<div style="font-family:sans-serif;max-width:600px">
  <h2 style="color:#b91c1c;margin:0 0 12px">BMV ISTA Ingest Failed</h2>
  <p>The quarterly ISTA auto-ingest worker failed while processing a new <code>.istapackage</code> from <code>BMV-Bucket</code>.</p>
  <table style="font-size:13px;color:#374151;border-collapse:collapse">
    <tr><td style="padding:4px 8px">Version:</td><td><b>${esc(run.version)}</b></td></tr>
    <tr><td style="padding:4px 8px">Bucket key:</td><td><code>${esc(run.bucketKey)}</code></td></tr>
    <tr><td style="padding:4px 8px">Failed step:</td><td><b>${esc(run.failedStep) || "unknown"}</b></td></tr>
    <tr><td style="padding:4px 8px">Trigger:</td><td>${esc(run.trigger)}</td></tr>
    <tr><td style="padding:4px 8px">Started at:</td><td>${esc(new Date(run.startedAt).toISOString())}</td></tr>
    <tr><td style="padding:4px 8px">Run ID:</td><td>#${run.id}</td></tr>
  </table>
  <h3 style="margin:18px 0 6px">Error</h3>
  <pre style="background:#f3f4f6;padding:10px;border-radius:6px;font-size:12px;white-space:pre-wrap">${esc(run.errorMessage || "(no error message captured)")}</pre>
  <p style="color:#6b7280;font-size:12px;margin-top:18px">Sent automatically by BMV.parts ISTA ingest worker. Triage via the Admin → ISTA tab.</p>
</div>`;
}
