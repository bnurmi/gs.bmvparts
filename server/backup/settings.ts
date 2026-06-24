import { storage } from "../storage";
import {
  backupRetentionDefaults,
  backupScheduleDefaults,
  backupRetentionSchema,
  backupScheduleSchema,
  type BackupRetentionSettings,
  type BackupScheduleSettings,
} from "@shared/schema";

const RETENTION_KEY = "backup.retention";
const SCHEDULE_KEY = "backup.schedule";

function parseStored<T>(raw: unknown, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, fallback: T): T {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const merged = { ...fallback, ...(raw as Record<string, unknown>) };
  const result = schema.safeParse(merged);
  return result.success && result.data ? result.data : { ...fallback };
}

export async function getBackupRetentionSettings(): Promise<BackupRetentionSettings> {
  const v = await storage.getGlobalSetting(RETENTION_KEY);
  return parseStored<BackupRetentionSettings>(v, backupRetentionSchema, backupRetentionDefaults);
}

export async function setBackupRetentionSettings(
  partial: Partial<BackupRetentionSettings>,
): Promise<BackupRetentionSettings> {
  const current = await getBackupRetentionSettings();
  const next = backupRetentionSchema.parse({ ...current, ...partial });
  await storage.setGlobalSetting(RETENTION_KEY, next);
  return next;
}

export async function getBackupScheduleSettings(): Promise<BackupScheduleSettings> {
  const v = await storage.getGlobalSetting(SCHEDULE_KEY);
  return parseStored<BackupScheduleSettings>(v, backupScheduleSchema, backupScheduleDefaults);
}

export async function setBackupScheduleSettings(
  partial: Partial<BackupScheduleSettings>,
): Promise<BackupScheduleSettings> {
  const current = await getBackupScheduleSettings();
  const next = backupScheduleSchema.parse({ ...current, ...partial });
  await storage.setGlobalSetting(SCHEDULE_KEY, next);
  return next;
}
