import Redis from "ioredis";

const DEBUG = process.env.CACHE_DEBUG === "1";

function dbg(kind: "hit" | "miss", key: string) {
  if (DEBUG) console.debug(`[cache ${kind}] ${key}`);
}

// ---------------------------------------------------------------------------
// Redis client — connects to REDIS_URL (default: local sidecar on 127.0.0.1).
// On connection error the client emits an "error" event; we catch it so the
// process doesn't crash. Each get* helper returns undefined on Redis errors
// so the app degrades gracefully to Postgres.
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisReady = false;

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
});

redis.on("ready", async () => {
  redisReady = true;
  try {
    const lastSaveUnix: number = await redis.lastsave();
    if (lastSaveUnix === 0) {
      console.warn("[Cache] Redis ready — RDB snapshot: never saved (cold start)");
    } else {
      const ts = new Date(lastSaveUnix * 1000).toISOString();
      console.log(`[Cache] Redis ready — last RDB snapshot: ${ts}`);
    }
  } catch (err: unknown) {
    console.log("[Cache] Redis ready — could not read last RDB snapshot time");
  }
});

redis.on("error", (err: Error) => {
  redisReady = false;
  console.warn(`[cache] Redis error: ${err.message}`);
});

redis.on("close", () => {
  redisReady = false;
});

redis.connect().catch((err: Error) => {
  console.warn(`[cache] Redis unavailable on startup: ${err.message} — cache misses will fall through to Postgres`);
});

// ---------------------------------------------------------------------------
// TTLs (seconds)
// ---------------------------------------------------------------------------

const TTL_SEARCH = 300;    // 5 min
const TTL_XREF = 900;      // 15 min
const TTL_RELATED = 900;   // 15 min
const TTL_SEO = 900;       // 15 min
const TTL_HOMEPAGE = 60;   // 60 s — homepage car grid + chassis rollup

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

async function redisGet<T>(key: string): Promise<T | undefined> {
  if (!redisReady) return undefined;
  try {
    const raw = await redis.get(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    console.warn(`[cache] get error for ${key}: ${(err as Error).message}`);
    return undefined;
  }
}

async function redisSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redisReady) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err: unknown) {
    console.warn(`[cache] set error for ${key}: ${(err as Error).message}`);
  }
}

async function redisDel(...keys: string[]): Promise<void> {
  if (!redisReady) return;
  try {
    await redis.del(...keys);
  } catch (err: unknown) {
    console.warn(`[cache] del error: ${(err as Error).message}`);
  }
}

async function redisScanDel(pattern: string): Promise<void> {
  if (!redisReady) return;
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (err: unknown) {
    console.warn(`[cache] scan-del error for ${pattern}: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Typed helpers — function signatures identical to the prior LRU implementation
// so no call-site changes are needed.
// ---------------------------------------------------------------------------

export async function getSearch<T>(key: string): Promise<T | undefined> {
  const hit = await redisGet<T>(key);
  dbg(hit !== undefined ? "hit" : "miss", key);
  return hit;
}

export async function setSearch<T>(key: string, value: T): Promise<void> {
  await redisSet(key, value, TTL_SEARCH);
}

export async function getXref<T>(key: string): Promise<T | undefined> {
  const hit = await redisGet<T>(key);
  dbg(hit !== undefined ? "hit" : "miss", key);
  return hit;
}

export async function setXref<T>(key: string, value: T): Promise<void> {
  await redisSet(key, value, TTL_XREF);
}

export async function getRelated<T>(key: string): Promise<T | undefined> {
  const hit = await redisGet<T>(key);
  dbg(hit !== undefined ? "hit" : "miss", key);
  return hit;
}

export async function setRelated<T>(key: string, value: T): Promise<void> {
  await redisSet(key, value, TTL_RELATED);
}

export async function getSeo<T>(key: string): Promise<T | undefined> {
  const hit = await redisGet<T>(key);
  dbg(hit !== undefined ? "hit" : "miss", key);
  return hit;
}

export async function setSeo<T>(key: string, value: T): Promise<void> {
  await redisSet(key, value, TTL_SEO);
}

/**
 * Invalidate all cache entries for a given part number clean. Call this
 * after any write that modifies parts data so stale results don't linger.
 */
export async function invalidatePart(partNumberClean: string): Promise<void> {
  await redisDel(`xref:${partNumberClean}`, `related:${partNumberClean}`);
  await redisScanDel(`seo:${partNumberClean}:*`);
  // Search keys embed the query string not the part number — clear the whole
  // search cache (small + short-lived, so this is low-cost).
  await redisScanDel("search:*");
}

// ---------------------------------------------------------------------------
// Homepage / chassis rollup cache — dual-key stale-while-error design
//
// Two keys per endpoint:
//   live  — TTL=60 s, deleted on scrape-status change (fast refresh)
//   stale — TTL=600 s, only ever overwritten (never explicitly deleted)
//
// Read path: check live key → DB query if miss → set both keys
// Error path: live key expired + DB fails → serve stale key (up to 10 min old)
//             so Popular Chassis never shows "Couldn't load — try again"
// Invalidation: only deletes live key; stale key is refreshed on next DB hit
// ---------------------------------------------------------------------------

const HOMEPAGE_CARS_LIVE  = "homepage:cars";
const HOMEPAGE_CARS_STALE = "homepage:cars:stale";
const HOMEPAGE_CHASSIS_LIVE  = "homepage:chassis";
const HOMEPAGE_CHASSIS_STALE = "homepage:chassis:stale";

const TTL_HOMEPAGE_STALE = 600; // 10 min stale-fallback window

export async function getHomepageCars<T>(): Promise<T | undefined> {
  const hit = await redisGet<T>(HOMEPAGE_CARS_LIVE);
  console.log(`[cache] ${hit !== undefined ? "hit" : "miss"}: /api/cars/homepage`);
  return hit;
}

export async function getHomepageCarsStale<T>(): Promise<T | undefined> {
  return redisGet<T>(HOMEPAGE_CARS_STALE);
}

export async function setHomepageCars<T>(value: T): Promise<void> {
  await Promise.all([
    redisSet(HOMEPAGE_CARS_LIVE, value, TTL_HOMEPAGE),
    redisSet(HOMEPAGE_CARS_STALE, value, TTL_HOMEPAGE_STALE),
  ]);
}

export async function getHomepageChassis<T>(): Promise<T | undefined> {
  const hit = await redisGet<T>(HOMEPAGE_CHASSIS_LIVE);
  console.log(`[cache] ${hit !== undefined ? "hit" : "miss"}: /api/chassis`);
  return hit;
}

export async function getHomepageChassisStale<T>(): Promise<T | undefined> {
  return redisGet<T>(HOMEPAGE_CHASSIS_STALE);
}

export async function setHomepageChassis<T>(value: T): Promise<void> {
  await Promise.all([
    redisSet(HOMEPAGE_CHASSIS_LIVE, value, TTL_HOMEPAGE),
    redisSet(HOMEPAGE_CHASSIS_STALE, value, TTL_HOMEPAGE_STALE),
  ]);
}

/**
 * Bust only the live homepage keys. The stale keys are intentionally kept so
 * they can serve as fallback when the DB is briefly unavailable right after
 * invalidation. The stale keys are naturally refreshed on the next successful
 * DB query.
 */
export async function invalidateHomepageChassis(): Promise<void> {
  await redisDel(HOMEPAGE_CARS_LIVE, HOMEPAGE_CHASSIS_LIVE);
}
