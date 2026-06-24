import { db, storage } from "../storage";
import { backupLogs } from "@shared/schema";
import { desc, eq, gt, and } from "drizzle-orm";
import { sendEmail } from "../email";
import { sendTelegramAlert } from "./telegram";
import { getBackupScheduleSettings } from "./settings";

/**
 * Resolve the backup-alert email recipient.
 *
 * Prefer the BACKUP_ALERT_EMAIL env var (explicit operator override).
 * If unset, fall back to the first admin user's registered email.
 */
export async function getAlertEmailRecipient(): Promise<string | null> {
  const v = process.env.BACKUP_ALERT_EMAIL;
  if (v && v.trim().length > 0) return v.trim();
  try {
    return await storage.getFirstAdminEmail();
  } catch (err) {
    console.error("[Backup/Alerts] Failed to resolve admin email:", err);
    return null;
  }
}

export interface AlertContext {
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  hoursSinceLastSuccess: number | null;
  recentOffsiteFailures: number;
  triggers: string[];
}

export async function evaluateAndDispatchAlerts(): Promise<AlertContext> {
  const sched = await getBackupScheduleSettings();
  const recent = await db
    .select()
    .from(backupLogs)
    .where(eq(backupLogs.backupType, "database"))
    .orderBy(desc(backupLogs.createdAt))
    .limit(20);

  let consecutiveFailures = 0;
  for (const row of recent) {
    if (row.status === "failed") consecutiveFailures++;
    else if (row.status === "verified" || row.status === "completed") break;
  }

  const lastSuccess = recent.find((r) => r.status === "verified" || r.status === "completed");
  const lastSuccessAt = lastSuccess?.completedAt || lastSuccess?.createdAt || null;
  const hoursSinceLastSuccess = lastSuccessAt ? (Date.now() - new Date(lastSuccessAt).getTime()) / 3600000 : null;

  const cutoff = new Date(Date.now() - 24 * 3600000);
  const offsiteFailures = await db
    .select()
    .from(backupLogs)
    .where(and(eq(backupLogs.offsiteStatus, "failed"), gt(backupLogs.createdAt, cutoff)));

  const triggers: string[] = [];
  if (consecutiveFailures >= 2) triggers.push(`${consecutiveFailures} consecutive DB backup failures`);
  if (offsiteFailures.length >= 2) triggers.push(`${offsiteFailures.length} offsite failures in last 24h`);
  if (hoursSinceLastSuccess !== null && hoursSinceLastSuccess > sched.staleAlertHours) {
    triggers.push(`No successful DB backup in ${hoursSinceLastSuccess.toFixed(1)}h (limit ${sched.staleAlertHours}h)`);
  }

  const ctx: AlertContext = {
    consecutiveFailures,
    lastSuccessAt,
    hoursSinceLastSuccess,
    recentOffsiteFailures: offsiteFailures.length,
    triggers,
  };

  if (triggers.length === 0) return ctx;

  const recipient = await getAlertEmailRecipient();
  if (recipient) {
    try {
      const html = renderAlertHtml(ctx);
      await sendEmail({ to: recipient, subject: "[BMV Backup] Alert: " + triggers[0], html });
    } catch (err) {
      console.error("[Backup/Alerts] Email send failed:", err);
    }
  } else {
    console.warn("[Backup/Alerts] No recipient available (set BACKUP_ALERT_EMAIL or register an admin email) — skipping email dispatch");
  }

  try {
    const text =
      `<b>BMV Backup Alert</b>\n\n` +
      triggers.map((t) => `• ${t}`).join("\n") +
      (lastSuccessAt ? `\n\nLast success: ${new Date(lastSuccessAt).toISOString()}` : "");
    await sendTelegramAlert(text);
  } catch (err) {
    console.error("[Backup/Alerts] Telegram dispatch error:", err);
  }

  return ctx;
}

function renderAlertHtml(ctx: AlertContext): string {
  return `<div style="font-family:sans-serif;max-width:600px">
  <h2 style="color:#b91c1c;margin:0 0 12px">BMV Backup Alert</h2>
  <p>The backup monitor detected the following condition${ctx.triggers.length > 1 ? "s" : ""}:</p>
  <ul>${ctx.triggers.map((t) => `<li>${t}</li>`).join("")}</ul>
  <table style="font-size:13px;color:#374151">
    <tr><td>Consecutive failures:</td><td><b>${ctx.consecutiveFailures}</b></td></tr>
    <tr><td>Recent offsite failures:</td><td><b>${ctx.recentOffsiteFailures}</b></td></tr>
    <tr><td>Last success:</td><td><b>${ctx.lastSuccessAt ? new Date(ctx.lastSuccessAt).toISOString() : "never"}</b></td></tr>
    <tr><td>Hours since last success:</td><td><b>${ctx.hoursSinceLastSuccess?.toFixed(1) ?? "n/a"}</b></td></tr>
  </table>
  <p style="color:#6b7280;font-size:12px;margin-top:18px">Sent automatically by BMV.parts backup monitor.</p>
</div>`;
}
