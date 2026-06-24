import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { Client as ObjectStorageClient } from "@replit/object-storage";

const osClient = new ObjectStorageClient();

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
  const dl = await osClient.downloadAsBytes(key);
  if (!dl.ok) {
    return res.status(404).end();
  }
  const buf = Buffer.isBuffer(dl.value[0]) ? dl.value[0] : Buffer.from(dl.value[0]);
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

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
