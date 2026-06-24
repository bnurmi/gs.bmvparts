const WINDOW_MS = 60_000;

function parseLimit(envVar: string | undefined, defaultValue: number): number {
  const parsed = parseInt(envVar ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

const TIER_LIMITS: Record<string, number> = {
  admin: Infinity,
  paid: parseLimit(process.env.API_RATE_LIMIT_PAID, 240),
  basic: parseLimit(process.env.API_RATE_LIMIT_BASIC, 30),
};

const windowStore = new Map<number, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  retryAfter?: number;
}

export function checkRateLimit(apiKeyId: number, tier: string): RateLimitResult {
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.basic;

  if (limit === Infinity) {
    return { allowed: true, limit };
  }

  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let timestamps = windowStore.get(apiKeyId) ?? [];
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    windowStore.set(apiKeyId, timestamps);
    return { allowed: false, limit, retryAfter: Math.max(1, retryAfter) };
  }

  timestamps.push(now);
  windowStore.set(apiKeyId, timestamps);
  return { allowed: true, limit };
}
