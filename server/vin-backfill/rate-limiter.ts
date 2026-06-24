import { db } from "../storage";
import { vinBackfillDailyCounts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const DEFAULT_DAILY_LIMIT = 1000;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyLimit(): number {
  const env = process.env.VIN_BACKFILL_DAILY_LIMIT;
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_DAILY_LIMIT;
}

export async function getTodayCount(): Promise<number> {
  const today = todayUtc();
  try {
    const [row] = await db.select().from(vinBackfillDailyCounts).where(eq(vinBackfillDailyCounts.utcDate, today));
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function canProcessMore(): Promise<boolean> {
  const count = await getTodayCount();
  return count < getDailyLimit();
}

export async function recordProcessed(): Promise<void> {
  const today = todayUtc();
  try {
    await db.execute(sql`
      INSERT INTO vin_backfill_daily_counts (utc_date, count, updated_at)
      VALUES (${today}, 1, NOW())
      ON CONFLICT (utc_date)
      DO UPDATE SET count = vin_backfill_daily_counts.count + 1, updated_at = NOW()
    `);
  } catch (err: any) {
    console.error("[VinBackfill] Failed to record processed count:", err.message);
  }
}

export async function ensureRateLimitTables(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vin_backfill_daily_counts (
        utc_date TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (err: any) {
    console.error("[VinBackfill] Failed to ensure rate-limit table:", err.message);
  }
}
