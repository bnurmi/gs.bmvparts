import { storage } from "./storage";
import type { InsertBmwModel } from "@shared/schema";
import { downloadModelImage } from "./vin-images";
import { createJob, completeJob, failJob, startPeriodicCheckpoint, stopPeriodicCheckpoint, getActiveJob, cancelJobByType } from "./job-manager";
import { importLegacyBmwModels } from "./legacy-bmw-models";

interface ScrapeProgress {
  status: "idle" | "scraping" | "complete" | "error";
  phase: "idle" | "discovering" | "fetching";
  total: number;
  scraped: number;
  errors: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  currentChassis: string | null;
  chassisDiscovered: number;
  chassisCompleted: number;
}

let progress: ScrapeProgress = {
  status: "idle",
  phase: "idle",
  total: 0,
  scraped: 0,
  errors: 0,
  startedAt: null,
  completedAt: null,
  error: null,
  currentChassis: null,
  chassisDiscovered: 0,
  chassisCompleted: 0,
};

const SEED_CHASSIS = [
  "E30", "E36", "E38", "E39", "E46", "E53", "E60", "E61", "E63", "E64",
  "E65", "E66", "E70", "E71", "E81", "E82", "E83", "E84", "E85", "E86",
  "E87", "E88", "E89", "E90", "E91", "E92", "E93",
  "F01", "F02", "F06", "F07", "F10", "F11", "F12", "F13", "F15", "F16",
  "F20", "F21", "F22", "F23", "F25", "F26", "F30", "F31", "F32", "F33",
  "F34", "F36", "F39", "F40", "F44", "F45", "F46", "F48", "F49",
  "F70", "F74", "F80", "F82", "F83", "F85", "F86", "F87", "F90",
  "F95", "F96", "F97", "F98",
  "G01", "G02", "G05", "G06", "G07", "G08", "G09", "G11", "G12",
  "G14", "G15", "G16", "G18", "G20", "G21", "G22", "G23", "G26",
  "G28", "G29", "G30", "G31", "G32", "G38", "G42", "G45", "G48",
  "G60", "G61", "G68", "G70", "G73", "G80", "G81", "G82", "G83",
  "G87", "G90", "G99",
  "I01", "I12", "I15", "I20",
  "U06", "U10", "U11", "U12", "U25",
];

let abortController: AbortController | null = null;
let modelScrapeJobId: number | null = null;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#8239;/g, " ").replace(/&amp;/g, "&").trim();
}

async function fetchPage(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      clearTimeout(timeout);
      if (res.status === 302 || res.status === 301) return null;
      if (res.status === 404) return null;
      if (!res.ok) {
        if (attempt < retries) { await delay(500 * (attempt + 1)); continue; }
        return null;
      }
      return await res.text();
    } catch {
      if (attempt < retries) { await delay(500 * (attempt + 1)); continue; }
      return null;
    }
  }
  return null;
}

function extractModelLinks(html: string): string[] {
  const urls = new Set<string>();
  const pattern = /href="(\/model\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    urls.add(match[1]);
  }
  return [...urls];
}

function extractChassisLinks(html: string): string[] {
  const urls = new Set<string>();
  const pattern = /href="\/model\/([A-Za-z0-9_-]+)\/"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    urls.add(match[1].toUpperCase());
  }
  return [...urls];
}

async function discoverModelUrls(): Promise<{ urls: string[]; chassisCount: number }> {
  const indexHtml = await fetchPage("https://bimmer.work/model/");
  if (!indexHtml) throw new Error("Failed to fetch model index page");

  const urlSet = new Set<string>(extractModelLinks(indexHtml));
  const chassisFromIndex = extractChassisLinks(indexHtml);
  const allChassis = new Set<string>([...chassisFromIndex.map(c => c.toUpperCase()), ...SEED_CHASSIS]);

  progress.chassisDiscovered = allChassis.size;

  const chassisList = [...allChassis].sort();
  const CHASSIS_BATCH = 4;
  for (let i = 0; i < chassisList.length; i += CHASSIS_BATCH) {
    if (abortController?.signal.aborted) break;
    const batch = chassisList.slice(i, i + CHASSIS_BATCH);
    await Promise.all(batch.map(async (chassis) => {
      progress.currentChassis = chassis;
      const html = await fetchPage(`https://bimmer.work/model/${chassis}/`);
      progress.chassisCompleted++;
      if (!html) return;
      for (const link of extractModelLinks(html)) urlSet.add(link);
    }));
    await delay(250);
  }

  return { urls: [...urlSet], chassisCount: allChassis.size };
}

function parseModelPage(html: string, path: string): InsertBmwModel | null {
  const nameMatch = html.match(/<h2[^>]*>(?:<a[^>]*>)?[&nbsp;\s]*(.*?)<\/a>?<\/h2>/s);
  const modelName = nameMatch ? stripHtml(nameMatch[1]).trim() : null;
  if (!modelName) return null;

  const rows: Record<string, string> = {};
  const trBlocks = html.split(/<tr>/g);
  for (const block of trBlocks) {
    const thMatch = block.match(/<th[^>]*>([\s\S]*?)<\/th>/);
    const tdMatch = block.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    if (thMatch && tdMatch) {
      const key = stripHtml(thMatch[1]);
      const val = stripHtml(tdMatch[1]);
      if (key && val) rows[key] = val;
    }
  }

  const pathParts = path.match(/\/model\/([^/]+)\/([^/]+)\//);
  if (!pathParts) return null;

  const chassisFromUrl = pathParts[1].toUpperCase();
  const typeCodeFromUrl = pathParts[2].toUpperCase();

  const devCode = rows["Development Code"] || null;

  let engineDisplacement: string | null = null;
  let enginePowerKw: number | null = null;
  let engineCode: string | null = null;
  const engineRaw = rows["Engine"] || "";
  if (engineRaw) {
    const dispMatch = engineRaw.match(/([\d.]+)\s*l/);
    if (dispMatch) engineDisplacement = `${dispMatch[1]}l`;
    const kwMatch = engineRaw.match(/(\d+)\s*kW/);
    if (kwMatch) enginePowerKw = parseInt(kwMatch[1]);
    const codeMatch = engineRaw.match(/\(([A-Za-z0-9]+)\)/);
    if (codeMatch) engineCode = codeMatch[1].toUpperCase();
  }

  const imgMatch = html.match(/<img\s+src="(\/model\/img\/[^"]+)"/);
  const imageUrl = imgMatch ? `https://bimmer.work${imgMatch[1]}` : null;

  return {
    chassis: chassisFromUrl,
    typeCode: typeCodeFromUrl,
    modelName,
    developmentCode: devCode,
    market: rows["Market"] || null,
    bodyType: rows["Chassis"] || null,
    engineDisplacement,
    enginePowerKw,
    engineCode,
    imageUrl,
    sourceUrl: `https://bimmer.work${path}`,
  };
}

export function getModelScrapeProgress(): ScrapeProgress {
  return { ...progress };
}

export async function startModelScrape(isResume = false): Promise<void> {
  if (progress.status === "scraping") {
    throw new Error("Model scrape already in progress");
  }

  progress = {
    status: "scraping",
    phase: "discovering",
    total: 0,
    scraped: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    currentChassis: null,
    chassisDiscovered: 0,
    chassisCompleted: 0,
  };

  abortController = new AbortController();

  if (!isResume) {
    const job = await createJob("model_scrape", { status: "starting" });
    modelScrapeJobId = job.id;
  } else {
    const active = await getActiveJob("model_scrape");
    modelScrapeJobId = active?.id ?? null;
  }

  if (modelScrapeJobId) {
    startPeriodicCheckpoint(modelScrapeJobId, () => ({ ...progress }));
  }

  try {
    console.log(`${isResume ? 'Resuming' : 'Discovering'} bimmer.work models (index + chassis pages)...`);
    const { urls, chassisCount } = await discoverModelUrls();
    progress.total = urls.length;
    progress.phase = "fetching";
    progress.currentChassis = null;
    console.log(`Discovered ${urls.length} model pages across ${chassisCount} chassis to scrape`);

    const BATCH_SIZE = 5;

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      if (abortController.signal.aborted) {
        progress.status = "idle";
        progress.error = "Cancelled by user";
        if (modelScrapeJobId) {
          await cancelJobByType("model_scrape");
          modelScrapeJobId = null;
        }
        return;
      }

      const batch = urls.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (path) => {
        try {
          const html = await fetchPage(`https://bimmer.work${path}`);
          if (!html) {
            progress.errors++;
            return;
          }

          const model = parseModelPage(html, path);
          if (model) {
            if (model.imageUrl) {
              const localPath = await downloadModelImage(model.imageUrl);
              if (localPath) model.imageUrl = localPath;
            }
            await storage.upsertBmwModel(model);
            progress.scraped++;
          } else {
            progress.errors++;
          }
        } catch (e) {
          progress.errors++;
          console.error(`Error scraping ${path}:`, e);
        }
      }));

      if (i % 50 === 0) {
        console.log(`Model scrape progress: ${progress.scraped}/${progress.total} (${progress.errors} errors)`);
      }

      await delay(500);
    }

    try {
      console.log("Importing legacy BMW models from curated second source...");
      const legacy = await importLegacyBmwModels();
      progress.scraped += legacy.inserted;
      console.log(`Legacy BMW models import: ${legacy.inserted} inserted, ${legacy.skipped} already present (of ${legacy.total} curated)`);
    } catch (e: any) {
      console.error("Legacy BMW models import failed:", e?.message || e);
      progress.errors++;
    }

    progress.status = "complete";
    progress.phase = "idle";
    progress.currentChassis = null;
    progress.completedAt = new Date().toISOString();
    console.log(`Model scrape complete: ${progress.scraped} models scraped, ${progress.errors} errors`);

    if (modelScrapeJobId) {
      await completeJob(modelScrapeJobId, { ...progress });
      modelScrapeJobId = null;
    }
  } catch (e: any) {
    progress.status = "error";
    progress.error = e.message || "Unknown error";
    console.error("Model scrape failed:", e);
    if (modelScrapeJobId) {
      await failJob(modelScrapeJobId, e.message || "Unknown error", { ...progress }).catch(() => {});
      modelScrapeJobId = null;
    }
  } finally {
    if (modelScrapeJobId) {
      stopPeriodicCheckpoint(modelScrapeJobId);
    }
  }
}

export function cancelModelScrape(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (modelScrapeJobId) {
    cancelJobByType("model_scrape").catch(() => {});
  }
}
