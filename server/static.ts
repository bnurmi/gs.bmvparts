import express, { type Express, type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// R2 / S3-compatible image proxy. Replaces the Replit object-storage client
// which required a sidecar at 127.0.0.1:1106 that only exists on Replit.
// All credentials come from env vars set in the VPS secrets file.
let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT || process.env.Endpoint,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.Secret_Access_Key || "",
      },
    });
  }
  return r2Client;
}

function getR2Bucket(): string {
  return process.env.CLOUDFLARE_R2_BUCKET || process.env.R2_BUCKET || "bmv-parts-bucket";
}

// In production, /images/* is no longer shipped inside dist (would have
// pushed the deploy bundle past Replit's size limit). Stream from Object
// Storage on demand. Keys mirror the local path: images/<sub>/<file>.
const IMAGE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ALLOWED_IMAGE_PREFIXES = ["small/", "big/", "models/", "cars/", "vin/"];

async function serveImageFromObjectStorage(req: Request, res: Response) {
  // strip leading /images/
  const rel = req.path.replace(/^\/images\//, "");
  if (!rel || rel.includes("..")) {
    return res.status(400).end();
  }
  if (!ALLOWED_IMAGE_PREFIXES.some((p) => rel.startsWith(p))) {
    return res.status(404).end();
  }
  const key = `images/${rel}`;
  try {
    const cmd = new GetObjectCommand({ Bucket: getR2Bucket(), Key: key });
    const r2res = await getR2Client().send(cmd);
    if (!r2res.Body) return res.status(404).end();
    const chunks: Buffer[] = [];
    for await (const chunk of r2res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    const ext = path.extname(rel).toLowerCase();
    const ct =
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".png" ? "image/png" :
      ext === ".webp" ? "image/webp" :
      ext === ".gif" ? "image/gif" :
      "application/octet-stream";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", `public, max-age=${IMAGE_CACHE_TTL_SECONDS}, immutable`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
  } catch (err: any) {
    // NoSuchKey or similar — return 404 without logging noise
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return res.status(404).end();
    }
    throw err;
  }
}

export function mountImageProxy(app: Express) {
  app.get("/images/{*path}", (req, res, next) => {
    serveImageFromObjectStorage(req, res).catch(next);
  });
}

export function serveStatic(app: Express) {
  // OS-backed image proxy first so /images/* never falls through to the SPA.
  mountImageProxy(app);

  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist. Never swallow API
  // requests; missing API routes should stay API 404s instead of receiving SPA HTML.
  app.use("/{*path}", (req: Request, res: Response, next: NextFunction) => {
    const originalPath = req.originalUrl.split("?")[0] || "";
    if (originalPath === "/api" || originalPath.startsWith("/api/")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
