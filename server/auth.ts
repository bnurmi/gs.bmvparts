import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import ConnectPgSimple from "connect-pg-simple";
import pg from "pg";
import { checkRateLimit } from "./api-rate-limiter";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      role: string;
    }
  }
}

export function setupAuth(app: Express) {
  const PgStore = ConnectPgSimple(session);
  const sessionPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

  const isProd = process.env.NODE_ENV === "production";

  app.use(
    session({
      store: new PgStore({
        pool: sessionPool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "bmw-parts-catalog-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
      },
      proxy: isProd,
    })
  );

  if (isProd) {
    app.set("trust proxy", 1);
  }

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (usernameOrEmail, password, done) => {
      try {
        // Try legacy username match first, then fall back to email lookup
        // so both old accounts (username) and new accounts (email-only) can sign in.
        let user = await storage.getUserByUsername(usernameOrEmail);
        if (!user) {
          user = await storage.getUserByEmail(usernameOrEmail.toLowerCase());
        }
        if (!user) return done(null, false, { message: "Invalid credentials" });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return done(null, false, { message: "Invalid credentials" });
        return done(null, { id: user.id, username: user.username, role: user.role });
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) return done(null, false);
      done(null, { id: user.id, username: user.username, role: user.role });
    } catch (err) {
      done(err);
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Authentication required" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user?.role === "admin") return next();
  res.status(403).json({ error: "Admin access required" });
}

/**
 * Headless-friendly admin gate. Accepts either an authenticated admin
 * session (browser cookie) OR a Bearer token matching
 * BMV_ACCOUNT_PROVISION_KEY. The Bearer path is what operator tooling
 * (CLI scripts, CI jobs, the agent) uses to call admin endpoints
 * without a browser login. Keep the secret in the deployment env.
 */
export function requireAdminOrProvisionKey(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user?.role === "admin") return next();
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const expectedKey = process.env.BMV_ACCOUNT_PROVISION_KEY;
    if (expectedKey && token === expectedKey) return next();
  }
  return res.status(401).json({ error: "Admin session or valid Bearer provision key required" });
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-api-key"] as string || req.query.api_key as string;
  if (!key) {
    return res.status(401).json({ error: "API key required. Pass via X-API-Key header or api_key query parameter." });
  }

  const apiKey = await storage.getApiKeyByKey(key);
  if (!apiKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  if (!apiKey.active) {
    return res.status(403).json({ error: "API key has been deactivated" });
  }

  await storage.incrementApiKeyUsage(apiKey.id);

  const rateLimit = checkRateLimit(apiKey.id, apiKey.tier);
  if (!rateLimit.allowed) {
    res.set("Retry-After", String(rateLimit.retryAfter));
    return res.status(429).json({
      error: "Rate limit exceeded",
      limit: rateLimit.limit,
      tier: apiKey.tier,
      retryAfter: rateLimit.retryAfter,
    });
  }

  (req as any).apiKey = apiKey;
  next();
}

export function requireApiTier(...allowedTiers: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = (req as any).apiKey;
    if (!apiKey) return res.status(401).json({ error: "API key required" });
    if (!allowedTiers.includes(apiKey.tier)) {
      return res.status(403).json({
        error: `This endpoint requires ${allowedTiers.join(" or ")} tier. Your current tier: ${apiKey.tier}`,
        currentTier: apiKey.tier,
        requiredTiers: allowedTiers,
      });
    }
    next();
  };
}

/**
 * Paid-access gate. Passes if the user is an admin OR has an api_keys row
 * with tier in ('paid', 'admin'). Used by the /quote tool endpoints.
 */
export async function requirePaidAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user?.role === "admin") return next();
  // Check api_keys tier for the authenticated user
  const { db } = await import("./storage");
  const { apiKeys } = await import("@shared/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const keys = await db.select().from(apiKeys).where(eq(apiKeys.userId, req.user!.id));
  const hasPaid = keys.some(k => k.active && ["paid", "admin"].includes(k.tier));
  if (hasPaid) return next();
  return res.status(403).json({ error: "Paid subscription required" });
}

export async function ensureDefaultAdmin() {
  const users = await storage.getUsers();
  const hasAdmin = users.some(u => u.role === "admin");
  if (!hasAdmin) {
    const password = process.env.ADMIN_PASSWORD || "admin123";
    await storage.createUser({ username: "admin", password, role: "admin" });
    console.log("Default admin created (username: admin). Change password after first login.");
  }
}
