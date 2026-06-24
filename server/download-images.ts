import https from "https";
import fs from "fs";
import path from "path";
import { db } from "./storage";
import { subcategories as subcategoriesTable, cars as carsTable } from "@shared/schema";

const PUBLIC_DIR = path.join(process.cwd(), "public", "images");
const SMALL_DIR = path.join(PUBLIC_DIR, "small");
const BIG_DIR = path.join(PUBLIC_DIR, "big");

function extractImageId(url: string): string | null {
  const match = url.match(/\/img\/(?:small|big)\/(?:Ersatzteile)?(\d+\.jpg)/);
  return match ? match[1] : null;
}

function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (fs.existsSync(destPath)) {
      resolve(true);
      return;
    }
    const makeRequest = (requestUrl: string, redirectCount: number) => {
      if (redirectCount > 3) { resolve(false); return; }
      const parsedUrl = new URL(requestUrl);
      https.get({
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://www.bmw-etk.info/",
        },
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (!location) { resolve(false); return; }
          const redirectUrl = location.startsWith("http") ? location : `https://www.bmw-etk.info${location}`;
          res.resume();
          makeRequest(redirectUrl, redirectCount + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          resolve(false);
          return;
        }
        const contentType = res.headers["content-type"] || "";
        if (!contentType.includes("image")) {
          res.resume();
          resolve(false);
          return;
        }
        const tmpPath = destPath + ".tmp";
        const file = fs.createWriteStream(tmpPath);
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.renameSync(tmpPath, destPath);
            resolve(true);
          });
        });
        file.on("error", () => {
          try { fs.unlinkSync(tmpPath); } catch {}
          resolve(false);
        });
      }).on("error", () => resolve(false));
    };
    makeRequest(url, 0);
  });
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadBatch(urls: { url: string; dest: string }[], concurrency: number = 10): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const i = index++;
      const { url, dest } = urls[i];
      const ok = await downloadFile(url, dest);
      if (ok) success++;
      else failed++;
      if ((success + failed) % 100 === 0) {
        console.log(`  Progress: ${success + failed}/${urls.length} (${success} ok, ${failed} failed)`);
      }
      await sleep(50);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return { success, failed };
}

export async function downloadAllImages() {
  fs.mkdirSync(SMALL_DIR, { recursive: true });
  fs.mkdirSync(BIG_DIR, { recursive: true });

  const allSubs = await db.select({
    imageUrl: subcategoriesTable.imageUrl,
    diagramImageUrl: subcategoriesTable.diagramImageUrl,
  }).from(subcategoriesTable);

  const allCars = await db.select({
    imageUrl: carsTable.imageUrl,
  }).from(carsTable);

  const imageIds = new Set<string>();

  for (const sub of allSubs) {
    if (sub.imageUrl) {
      const id = extractImageId(sub.imageUrl);
      if (id) imageIds.add(id);
    }
    if (sub.diagramImageUrl) {
      const id = extractImageId(sub.diagramImageUrl);
      if (id) imageIds.add(id);
    }
  }

  for (const car of allCars) {
    if (car.imageUrl) {
      const id = extractImageId(car.imageUrl);
      if (id) imageIds.add(id);
    }
  }

  console.log(`Found ${imageIds.size} unique image IDs`);

  const existingSmall = new Set(fs.existsSync(SMALL_DIR) ? fs.readdirSync(SMALL_DIR) : []);
  const existingBig = new Set(fs.existsSync(BIG_DIR) ? fs.readdirSync(BIG_DIR) : []);

  const smallDownloads = [...imageIds]
    .filter(id => !existingSmall.has(id))
    .map(id => ({ url: `https://www.bmw-etk.info/img/small/${id}`, dest: path.join(SMALL_DIR, id) }));

  const bigDownloads = [...imageIds]
    .filter(id => !existingBig.has(id))
    .map(id => {
      const numId = id.replace('.jpg', '');
      return { url: `https://www.bmw-etk.info/img/big/Ersatzteile${numId}.jpg`, dest: path.join(BIG_DIR, id) };
    });

  console.log(`Need to download: ${smallDownloads.length} small, ${bigDownloads.length} big (skipping already downloaded)`);

  if (smallDownloads.length > 0) {
    console.log("Downloading small (thumbnail) images...");
    const r1 = await downloadBatch(smallDownloads, 10);
    console.log(`Small images done: ${r1.success} success, ${r1.failed} failed`);
  }

  if (bigDownloads.length > 0) {
    console.log("Downloading big (diagram) images...");
    const r2 = await downloadBatch(bigDownloads, 10);
    console.log(`Big images done: ${r2.success} success, ${r2.failed} failed`);
  }

  console.log("All image downloads complete!");
  return {
    totalIds: imageIds.size,
    smallDownloaded: smallDownloads.length,
    bigDownloaded: bigDownloads.length,
    smallExisting: existingSmall.size,
    bigExisting: existingBig.size,
  };
}
