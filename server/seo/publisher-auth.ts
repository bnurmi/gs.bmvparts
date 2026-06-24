/**
 * Bearer-token authentication middleware for the SEO Publisher API.
 *
 * Reads `Authorization: Bearer <token>` from the request header, validates
 * it against `SEO_PUBLISHER_API_TOKEN`, enforces per-token in-memory sliding
 * window rate limits, and verifies the target domain is in the allowlist.
 */

import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Rate limit buckets: sliding window (timestamps in ms)
// ---------------------------------------------------------------------------
interface SlidingWindow {
  reads: number[];
  writes: number[];
  publishes: number[];
}

const rateLimitWindows = new Map<string, SlidingWindow>();

function getWindow(token: string): SlidingWindow {
  if (!rateLimitWindows.has(token)) {
    rateLimitWindows.set(token, { reads: [], writes: [], publishes: [] });
  }
  return rateLimitWindows.get(token)!;
}

function countRecent(timestamps: number[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((t) => t > cutoff).length;
}

function pruneOld(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

const WINDOW_MS = 60_000; // 1 minute
const LIMITS = { reads: 60, writes: 10, publishes: 3 } as const;

type RateLimitBucket = keyof typeof LIMITS;

function checkAndRecord(token: string, bucket: RateLimitBucket): boolean {
  const win = getWindow(token);
  win[bucket] = pruneOld(win[bucket], WINDOW_MS);
  if (countRecent(win[bucket], WINDOW_MS) >= LIMITS[bucket]) {
    return false;
  }
  win[bucket].push(Date.now());
  return true;
}

// ---------------------------------------------------------------------------
// Classify request method as read / write / publish
// /validate is an idempotent preflight check — counts as a read (60/min).
// ---------------------------------------------------------------------------
function classifyBucket(req: Request): RateLimitBucket {
  if (req.path.includes("/publish/")) return "publishes";
  if (req.method === "GET") return "reads";
  if (req.path.endsWith("/validate")) return "reads";
  return "writes";
}

// ---------------------------------------------------------------------------
// Allowed domains helper
// ---------------------------------------------------------------------------
function getAllowedDomains(): string[] {
  const raw = process.env.SEO_PUBLISHER_ALLOWED_DOMAINS ?? "bmv.parts,bmw.vin";
  return raw.split(",").map((d) => d.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export function publisherAuth(req: Request, res: Response, next: NextFunction): void {
  const apiToken = process.env.SEO_PUBLISHER_API_TOKEN;

  if (!apiToken) {
    res.status(503).json({ error: "SEO Publisher API not configured (SEO_PUBLISHER_API_TOKEN missing)" });
    return;
  }

  // Extract bearer token
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = authHeader.slice(7).trim();

  if (token !== apiToken) {
    res.status(401).json({ error: "Invalid bearer token" });
    return;
  }

  // Domain check — only for routes that target a specific domain
  const requestDomain = (req.body?.domain as string | undefined) || (req.query.domain as string | undefined);
  if (requestDomain) {
    const allowed = getAllowedDomains();
    if (!allowed.includes(requestDomain)) {
      res.status(403).json({ error: `Domain '${requestDomain}' is not in SEO_PUBLISHER_ALLOWED_DOMAINS` });
      return;
    }
  }

  // Rate limiting
  const bucket = classifyBucket(req);
  const allowed = checkAndRecord(token, bucket);
  if (!allowed) {
    res.status(429).json({
      error: `Rate limit exceeded for ${bucket} operations (${LIMITS[bucket]}/${WINDOW_MS / 1000}s)`,
    });
    return;
  }

  // Attach token label to req for audit logging
  (req as any).__publisherActor = "roman-hermes";
  (req as any).__publisherTokenLabel = "SEO_PUBLISHER_API_TOKEN";

  next();
}
