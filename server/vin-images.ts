import { writeFile, mkdir, access } from "fs/promises";
import path from "path";
import crypto from "crypto";

const VIN_IMAGES_DIR = path.join(process.cwd(), "public", "images", "vin");
const MODEL_IMAGES_DIR = path.join(process.cwd(), "public", "images", "models");
const ALLOWED_DIRS = new Set([path.resolve(VIN_IMAGES_DIR), path.resolve(MODEL_IMAGES_DIR)]);

// Hosts the local-cache downloader is allowed to fetch from. Bimmer.work
// + bmw-etk.info are the legacy fallback sources; the rest are first-party
// BMW endpoints used by the new VinEnrichmentService (Task #59).
const ALLOWED_HOSTS = new Set([
  "bimmer.work", "www.bimmer.work",
  "bmw-etk.info", "www.bmw-etk.info",
  // BMW configurator CDN (images) — `cdn.bmwgroup.com` is the
  // first-party default for VinEnrichmentService and MUST be
  // allow-listed so configurator URLs make it into the local cache.
  "cdn.bmwgroup.com", "cdn.bimmer-tech.net", "www.bmwgroup.com",
  "configure.bmw.com", "media.bmwgroup.com",
  // BMW manuals portal (PDFs)
  "owners-manuals.bmw.com", "owner.i.bmw.com",
]);

// Operators can override the configurator host via env (e.g. to a
// regional bucket). Whatever they pick is added to the allow-list at
// boot so downloads succeed without a code change.
const cfgHost = process.env.BMW_CONFIGURATOR_HOST;
if (cfgHost && cfgHost.trim()) {
  ALLOWED_HOSTS.add(cfgHost.trim());
}

async function ensureDir(dir: string) {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

function urlToFilename(url: string, vin: string, prefix: string, index?: number): string {
  let ext = ".jpg";
  try {
    const parsed = new URL(url);
    const pathExt = path.extname(parsed.pathname).split("?")[0];
    if (pathExt && /^\.[a-z]{2,5}$/i.test(pathExt)) ext = pathExt;
  } catch {}
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
  const suffix = index !== undefined ? `-${index}` : "";
  const safeVin = sanitize(vin);
  const safePrefix = sanitize(prefix);
  return `${safeVin}-${safePrefix}${suffix}-${hash}${ext}`;
}

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    if (!isAllowedUrl(url)) {
      console.error(`[Images] Blocked non-allowed URL: ${url}`);
      return false;
    }
    const resolved = path.resolve(destPath);
    const inAllowedDir = [...ALLOWED_DIRS].some(dir => resolved.startsWith(dir + path.sep) || resolved === dir);
    if (!inAllowedDir) {
      console.error(`[Images] Path traversal blocked: ${destPath}`);
      return false;
    }
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    return await saveImageResponse(res, url, resolved);
  } catch (err: any) {
    console.error(`[Images] Download error for ${url}: ${err.message}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveImageResponse(res: Response, url: string, resolved: string): Promise<boolean> {
  if (!res.ok) {
    console.error(`[Images] Failed to download ${url}: HTTP ${res.status}`);
    return false;
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    console.error(`[Images] Non-image content type for ${url}: ${contentType}`);
    return false;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 15 * 1024 * 1024) {
    console.error(`[Images] Image too large: ${url}`);
    return false;
  }
  await writeFile(resolved, buffer);
  return true;
}

function isAlreadyLocal(url: string): boolean {
  return url.startsWith("/images/vin/") || url.startsWith("/images/models/");
}

export interface DownloadedImages {
  exteriorUrl: string | null;
  interiorUrl: string | null;
  exterior360Urls: string[];
}

export interface DownloadedOptionImages {
  [optionCode: string]: string;
}

export async function downloadVinImages(
  vin: string,
  images: { exteriorUrl?: string | null; interiorUrl?: string | null; exterior360Urls?: string[] } | null,
  options?: { code: string; imageUrl: string | null }[]
): Promise<{ images: DownloadedImages | null; optionImageMap: DownloadedOptionImages }> {
  await ensureDir(VIN_IMAGES_DIR);
  const vinUpper = vin.toUpperCase();
  const result: DownloadedImages = {
    exteriorUrl: null,
    interiorUrl: null,
    exterior360Urls: [],
  };
  const optionImageMap: DownloadedOptionImages = {};

  if (images) {
    if (images.exteriorUrl && !isAlreadyLocal(images.exteriorUrl)) {
      try {
        const filename = urlToFilename(images.exteriorUrl, vinUpper, "ext");
        const destPath = path.join(VIN_IMAGES_DIR, filename);
        const ok = await downloadImage(images.exteriorUrl, destPath);
        result.exteriorUrl = ok ? `/images/vin/${filename}` : images.exteriorUrl;
      } catch {
        result.exteriorUrl = images.exteriorUrl;
      }
    } else {
      result.exteriorUrl = images.exteriorUrl || null;
    }

    if (images.interiorUrl && !isAlreadyLocal(images.interiorUrl)) {
      try {
        const filename = urlToFilename(images.interiorUrl, vinUpper, "int");
        const destPath = path.join(VIN_IMAGES_DIR, filename);
        const ok = await downloadImage(images.interiorUrl, destPath);
        result.interiorUrl = ok ? `/images/vin/${filename}` : images.interiorUrl;
      } catch {
        result.interiorUrl = images.interiorUrl;
      }
    } else {
      result.interiorUrl = images.interiorUrl || null;
    }

    if (images.exterior360Urls && images.exterior360Urls.length > 0) {
      for (let i = 0; i < images.exterior360Urls.length; i++) {
        const url = images.exterior360Urls[i];
        if (isAlreadyLocal(url)) {
          result.exterior360Urls.push(url);
          continue;
        }
        try {
          const filename = urlToFilename(url, vinUpper, "360", i);
          const destPath = path.join(VIN_IMAGES_DIR, filename);
          const ok = await downloadImage(url, destPath);
          result.exterior360Urls.push(ok ? `/images/vin/${filename}` : url);
        } catch {
          result.exterior360Urls.push(url);
        }
      }
    }
  }

  if (options) {
    for (const opt of options) {
      if (opt.imageUrl && !isAlreadyLocal(opt.imageUrl)) {
        try {
          const filename = urlToFilename(opt.imageUrl, vinUpper, `opt-${opt.code}`);
          const destPath = path.join(VIN_IMAGES_DIR, filename);
          const ok = await downloadImage(opt.imageUrl, destPath);
          optionImageMap[opt.code] = ok ? `/images/vin/${filename}` : opt.imageUrl;
        } catch {
          // keep original URL on failure
        }
      }
    }
  }

  return { images: images ? result : null, optionImageMap };
}

export async function rewriteBimmerWorkData(vin: string, bwData: any): Promise<any> {
  if (!bwData) return bwData;

  const optionsForDownload = bwData.options?.map((o: any) => ({ code: o.code, imageUrl: o.imageUrl })) || [];
  const { images: downloadedImages, optionImageMap } = await downloadVinImages(
    vin,
    bwData.images,
    optionsForDownload
  );

  const rewritten = { ...bwData };

  if (downloadedImages) {
    rewritten.images = downloadedImages;
  }

  if (rewritten.options && Object.keys(optionImageMap).length > 0) {
    rewritten.options = rewritten.options.map((o: any) => ({
      ...o,
      imageUrl: optionImageMap[o.code] || o.imageUrl,
    }));
  }

  return rewritten;
}

export async function migrateExistingVinImages(
  allUserCars: { id: number; vin: string; vinData: any }[],
  updateFn: (id: number, vinData: any) => Promise<void>,
  progressCb?: (done: number, total: number, current: string) => void
): Promise<{ total: number; migrated: number; skipped: number; errors: number }> {
  let migrated = 0, skipped = 0, errors = 0;
  const total = allUserCars.length;

  for (let i = 0; i < allUserCars.length; i++) {
    const car = allUserCars[i];
    progressCb?.(i + 1, total, car.vin);

    if (!car.vinData) {
      skipped++;
      continue;
    }

    const vd = car.vinData as any;
    const enriched = vd.enriched;
    if (!enriched || !enriched.available) {
      skipped++;
      continue;
    }

    const hasRemoteImages =
      (enriched.images?.exterior?.some((u: string) => u.startsWith("http")) ||
       enriched.images?.interior?.some((u: string) => u.startsWith("http")) ||
       enriched.images?.["360"]?.some((u: string) => u.startsWith("http")) ||
       enriched.options?.some((o: any) => o.imageUrl?.startsWith("http")));

    if (!hasRemoteImages) {
      skipped++;
      continue;
    }

    try {
      const imgData = {
        exteriorUrl: enriched.images?.exterior?.[0] || null,
        interiorUrl: enriched.images?.interior?.[0] || null,
        exterior360Urls: enriched.images?.["360"] || [],
      };
      const optionsForDl = enriched.options?.map((o: any) => ({ code: o.code, imageUrl: o.imageUrl })) || [];
      const { images: dlImages, optionImageMap } = await downloadVinImages(car.vin, imgData, optionsForDl);

      const newEnriched = { ...enriched };
      if (dlImages) {
        newEnriched.images = {
          exterior: dlImages.exteriorUrl ? [dlImages.exteriorUrl] : [],
          interior: dlImages.interiorUrl ? [dlImages.interiorUrl] : [],
          "360": dlImages.exterior360Urls || [],
        };
      }
      if (newEnriched.options && Object.keys(optionImageMap).length > 0) {
        newEnriched.options = newEnriched.options.map((o: any) => ({
          ...o,
          imageUrl: optionImageMap[o.code] || o.imageUrl,
        }));
      }

      const newVinData = { ...vd, enriched: newEnriched };
      await updateFn(car.id, newVinData);
      migrated++;
    } catch (err: any) {
      console.error(`[VIN Images] Migration error for car ${car.id} (${car.vin}): ${err.message}`);
      errors++;
    }
  }

  return { total, migrated, skipped, errors };
}

export async function ensureLocalImagesExist(vin: string, enrichedData: any): Promise<any> {
  if (!enrichedData) return enrichedData;
  let changed = false;
  const updated = { ...enrichedData };

  if (updated.images) {
    const imgs = { ...updated.images };
    if (imgs.exteriorUrl && typeof imgs.exteriorUrl === "string" && imgs.exteriorUrl.startsWith("/images/vin/")) {
      const filePath = path.join(process.cwd(), "public", imgs.exteriorUrl);
      try { await access(filePath); } catch {
        imgs.exteriorUrl = null;
        changed = true;
      }
    }
    if (imgs.interiorUrl && typeof imgs.interiorUrl === "string" && imgs.interiorUrl.startsWith("/images/vin/")) {
      const filePath = path.join(process.cwd(), "public", imgs.interiorUrl);
      try { await access(filePath); } catch {
        imgs.interiorUrl = null;
        changed = true;
      }
    }
    if (imgs.exterior360Urls && Array.isArray(imgs.exterior360Urls)) {
      const validated: string[] = [];
      for (const u of imgs.exterior360Urls) {
        if (typeof u === "string" && u.startsWith("/images/vin/")) {
          const filePath = path.join(process.cwd(), "public", u);
          try { await access(filePath); validated.push(u); } catch { changed = true; }
        } else {
          validated.push(u);
        }
      }
      imgs.exterior360Urls = validated;
    }
    updated.images = imgs;
  }

  if (updated.options && Array.isArray(updated.options)) {
    const validatedOpts = [];
    for (const o of updated.options) {
      if (o.imageUrl && typeof o.imageUrl === "string" && o.imageUrl.startsWith("/images/vin/")) {
        const filePath = path.join(process.cwd(), "public", o.imageUrl);
        try {
          await access(filePath);
          validatedOpts.push(o);
        } catch {
          changed = true;
          validatedOpts.push({ ...o, imageUrl: null });
        }
      } else {
        validatedOpts.push(o);
      }
    }
    updated.options = validatedOpts;
  }

  if (changed) {
    console.log(`[VIN Images] Some cached images missing locally for ${vin}, cleared broken paths`);
  }

  return updated;
}

export async function downloadModelImage(remoteUrl: string): Promise<string | null> {
  if (!remoteUrl || isAlreadyLocal(remoteUrl)) return remoteUrl;
  if (!isAllowedUrl(remoteUrl)) return null;

  await ensureDir(MODEL_IMAGES_DIR);

  let ext = ".png";
  try {
    const parsed = new URL(remoteUrl);
    const pathExt = path.extname(parsed.pathname).split("?")[0];
    if (pathExt && /^\.[a-z]{2,5}$/i.test(pathExt)) ext = pathExt;
  } catch {}

  const hash = crypto.createHash("sha256").update(remoteUrl).digest("hex").slice(0, 16);
  const filename = `model-${hash}${ext}`;
  const destPath = path.join(MODEL_IMAGES_DIR, filename);

  const resolved = path.resolve(destPath);
  if (!resolved.startsWith(path.resolve(MODEL_IMAGES_DIR))) {
    console.error(`[Model Images] Path traversal blocked: ${destPath}`);
    return null;
  }

  try {
    await access(resolved);
    return `/images/models/${filename}`;
  } catch {}

  const ok = await downloadImage(remoteUrl, destPath);
  return ok ? `/images/models/${filename}` : null;
}

export async function migrateModelImages(
  models: { id: number; imageUrl: string | null }[],
  updateFn: (id: number, localUrl: string) => Promise<void>,
  clearBrokenFn?: (id: number) => Promise<void>,
  progressCb?: (done: number, total: number) => void
): Promise<{ total: number; migrated: number; skipped: number; errors: number; cleared: number }> {
  let migrated = 0, skipped = 0, errors = 0, cleared = 0;
  const total = models.filter(m => m.imageUrl && !isAlreadyLocal(m.imageUrl)).length;

  let done = 0;
  for (const model of models) {
    if (!model.imageUrl || isAlreadyLocal(model.imageUrl)) {
      skipped++;
      continue;
    }

    try {
      const localPath = await downloadModelImage(model.imageUrl);
      if (localPath) {
        await updateFn(model.id, localPath);
        migrated++;
      } else {
        if (clearBrokenFn) {
          await clearBrokenFn(model.id);
          cleared++;
          console.log(`[Model Images] Cleared broken image URL for model ${model.id}: ${model.imageUrl}`);
        }
        errors++;
      }
    } catch (err: any) {
      console.error(`[Model Images] Error downloading image for model ${model.id}: ${err.message}`);
      errors++;
    }

    done++;
    progressCb?.(done, total);

    if (done % 20 === 0) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return { total, migrated, skipped, errors, cleared };
}
