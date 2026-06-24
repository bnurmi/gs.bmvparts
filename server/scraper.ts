import { storage, createPartsWorker } from "./storage";
import type { Car, InsertCategory, InsertSubcategory, InsertPart } from "@shared/schema";
import { proxyFetch } from "./proxy-router";

const BASE_URL = "https://www.bmw-etk.info";
const ENGLISH_PATH_PREFIX = "/parts-catalog/";

const activeJobs: Map<number, boolean> = new Map();

// Legacy stubs retained for routes.ts compatibility. The proxy is now always
// active via proxyFetch() with automatic fallback. These no longer have effect.
export function setUseProxy(_val: boolean) {}
export function getUseProxy(): boolean { return true; }

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isEnglishUrl(url: string): boolean {
  const path = url.replace(BASE_URL, "");
  return path.startsWith(ENGLISH_PATH_PREFIX) || path.startsWith("/parts-catalog/");
}

async function fetchPageDirect(fullUrl: string, retries = 2): Promise<string> {
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (fullUrl.includes("bmw-etk.info")) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  try {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(fullUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        if (response.ok) return response.text();
        if (response.status >= 500 && attempt < retries) {
          console.warn(`[Scraper] HTTP ${response.status} for ${fullUrl}, retrying (${attempt + 1}/${retries})...`);
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${response.status} for ${fullUrl}`);
      } catch (fetchErr: any) {
        lastError = fetchErr;
        if (attempt < retries) {
          console.warn(`[Scraper] Fetch error for ${fullUrl}: ${fetchErr.message}, retrying (${attempt + 1}/${retries})...`);
          await sleep(2000 * (attempt + 1));
          continue;
        }
      }
    }
    throw lastError || new Error(`HTTP fetch failed after ${retries} retries for ${fullUrl}`);
  } finally {
    if (prevTls !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }
}

async function fetchPage(url: string): Promise<string> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
  return proxyFetch("etk", fullUrl);
}

interface ParsedLink {
  name: string;
  url: string;
  imageUrl?: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCategoryLinks(html: string, catalogUrl: string): ParsedLink[] {
  const results: ParsedLink[] = [];
  const urlPath = catalogUrl.replace(BASE_URL, '').replace(/\/$/, '');

  const catLinkRegex = new RegExp(
    `<a[^>]+href=['"](?:${escapeRegex(BASE_URL)})?(?:${escapeRegex(urlPath)}/(\\d{2})/?)['"][^>]*>([\\s\\S]*?)</a>`,
    'gi'
  );

  const imgPattern = /<img[^>]+src=['"]([^'"]+)['"][^>]*>/i;
  let match;
  while ((match = catLinkRegex.exec(html)) !== null) {
    const catId = match[1];
    const innerHtml = match[2];
    const url = `${BASE_URL}${urlPath}/${catId}/`;

    const imgMatch = imgPattern.exec(innerHtml);
    const imageUrl = imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : `${BASE_URL}${imgMatch[1]}`) : undefined;

    const nameMatch = innerHtml.match(/class="fbox-desc"[^>]*>\s*([^<]+)/i) || innerHtml.match(/>([A-Za-z][^<]{2,80})</);
    const name = nameMatch ? nameMatch[1].trim() : catId;

    if (!results.some(r => r.url === url)) {
      results.push({ url, name, imageUrl });
    }
  }

  return results;
}

function extractSubcategoryLinks(html: string): ParsedLink[] {
  const results: ParsedLink[] = [];

  const prdLinkRegex = /<a[^>]+href=['"](\/parts-catalog\/prd\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = prdLinkRegex.exec(html)) !== null) {
    const url = `${BASE_URL}${match[1]}`;
    const innerHtml = match[2];

    if (!isEnglishUrl(url)) continue;
    if (results.some(r => r.url === url)) continue;

    const imgMatch = /<img[^>]+src=['"]([^'"]+)['"][^>]*>/i.exec(innerHtml);
    const imageUrl = imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : `${BASE_URL}${imgMatch[1]}`) : undefined;

    const nameMatch = innerHtml.match(/class="fbox-desc"[^>]*>\s*([^<]+)/i) || innerHtml.match(/\n\s*([A-Za-z\/][^<\n]{2,80})/);
    const name = nameMatch ? nameMatch[1].trim() : url.split('/').filter(Boolean).pop() || "Unknown";

    if (name && name.length > 1) {
      results.push({ url, name, imageUrl });
    }
  }

  return results;
}

interface ParsedPart {
  itemNo: string;
  partNumber: string;
  partNumberClean: string;
  description: string;
  additionalInfo: string;
  partDate: string;
  quantity: string;
  weight: number | null;
  notes: string;
}

function parsePartsTable(html: string): ParsedPart[] {
  const parts: ParsedPart[] = [];

  const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tableMatch) return parts;

  const tableHtml = tableMatch[1];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  let isFirst = true;

  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];

    if (rowHtml.includes('<th') || isFirst) {
      isFirst = false;
      continue;
    }

    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const text = cellMatch[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .trim();
      cells.push(text);
    }

    if (cells.length < 3) continue;

    const itemNo = cells[0] || '';
    const partRaw = cells[1] || '';
    const descRaw = cells[2] || '';
    const additionalInfo = cells[3] || '';
    const partDate = cells[4] || '';
    const quantity = cells[5] || '';
    const weightStr = cells[6] || '';

    const partLines = partRaw.split('\n').map(l => l.trim()).filter(l => l);
    const partNumber = partLines[0] || '';
    const partNumberClean = partLines[1] || partNumber.replace(/\s/g, '');

    const descLines = descRaw.split('\n').map(l => l.trim()).filter(l => l);
    const description = descLines[0] || '';
    const notes = descLines.slice(1).join('; ');

    const weight = weightStr ? parseFloat(weightStr) || null : null;

    if (!description) continue;

    parts.push({
      itemNo,
      partNumber,
      partNumberClean,
      description,
      additionalInfo,
      partDate,
      quantity,
      weight,
      notes,
    });
  }

  return parts;
}

function parseDiagramImage(html: string): string | undefined {
  const bigImgMatch = /<img[^>]+src=['"]([^'"]*\/img\/big\/[^'"]+)['"][^>]*>/i.exec(html);
  return bigImgMatch ? (bigImgMatch[1].startsWith('http') ? bigImgMatch[1] : `${BASE_URL}${bigImgMatch[1]}`) : undefined;
}

function deriveDiagramUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  return imageUrl.replace('/img/small/', '/img/big/');
}

export async function startScrapeJob(carId: number): Promise<void> {
  if (activeJobs.get(carId)) {
    throw new Error("Scrape job already running for this car");
  }

  const car = await storage.getCar(carId);
  if (!car) throw new Error("Car not found");

  activeJobs.set(carId, true);

  scrapeCarCatalog(car).catch(async (err) => {
    console.error(`Scrape error for car ${carId}:`, err);
    await storage.updateCar(carId, {
      scrapeStatus: "error",
      scrapeError: err.message,
    });
    activeJobs.delete(carId);
  });
}

/**
 * Synchronously scrape a single car and return when done.
 * Used by the ETK uncovered backfill to run cars sequentially.
 * Sets the activeJobs entry so the cancellation guards inside
 * scrapeCarCatalog work correctly.
 */
export async function scrapeCarDirect(car: Car): Promise<void> {
  if (activeJobs.get(car.id)) {
    throw new Error(`Scrape job already running for car ${car.id}`);
  }
  activeJobs.set(car.id, true);
  await scrapeCarCatalog(car);
}

export function isJobRunning(carId: number): boolean {
  return activeJobs.get(carId) ?? false;
}

async function scrapeCarCatalog(car: Car): Promise<void> {
  const carId = car.id;

  try {
    await storage.updateCar(carId, {
      scrapeStatus: "running",
      scrapeProgress: 0,
      scrapeError: null,
    });

    await storage.deleteCategories(carId);

    console.log(`[Scraper] Fetching English catalog for ${car.displayName}: ${car.catalogUrl}`);
    const catalogHtml = await fetchPage(car.catalogUrl);
    await sleep(500);

    const categoryLinks = extractCategoryLinks(catalogHtml, car.catalogUrl);

    console.log(`[Scraper] Found ${categoryLinks.length} English categories for ${car.displayName}`);

    await storage.updateCar(carId, {
      totalCategories: categoryLinks.length,
      totalSubcategories: 0,
      totalParts: 0,
    });

    let totalPartsScraped = 0;
    let totalSubcatsScraped = 0;
    const allErrors: string[] = [];

    for (let ci = 0; ci < categoryLinks.length; ci++) {
      if (!activeJobs.get(carId)) return;

      const catLink = categoryLinks[ci];
      const catId = catLink.url.split('/').filter(Boolean).pop() || String(ci);
      const category = await storage.createCategory({
        carId,
        categoryId: catId,
        name: catLink.name,
        imageUrl: catLink.imageUrl,
        url: catLink.url,
      });

      const categoryHtml = await fetchPage(catLink.url);
      await sleep(400);

      const subcategoryLinks = extractSubcategoryLinks(categoryHtml);
      console.log(`[Scraper] Category "${catLink.name}" (${catId}): ${subcategoryLinks.length} English subcategories`);

      for (const subLink of subcategoryLinks) {
        if (!activeJobs.get(carId)) return;

        const subId = subLink.url.split('/').filter(Boolean).pop() || subLink.name;
        const subcategory = await storage.createSubcategory({
          categoryId: category.id,
          carId,
          subcategoryId: subId,
          name: subLink.name,
          imageUrl: subLink.imageUrl,
          url: subLink.url,
          diagramImageUrl: undefined,
        });

        const diagramImageUrl = deriveDiagramUrl(subLink.imageUrl || null);
        if (diagramImageUrl) {
          await storage.updateSubcategory(subcategory.id, { diagramImageUrl });
        }

        try {
          const partsHtml = await fetchPage(subLink.url);
          await sleep(300);

          const parsedParts = parsePartsTable(partsHtml);

          if (parsedParts.length > 0) {
            const partsToInsert: InsertPart[] = parsedParts.map(p => ({
              subcategoryId: subcategory.id,
              carId,
              itemNo: p.itemNo,
              partNumber: p.partNumber,
              partNumberClean: p.partNumberClean,
              description: p.description,
              additionalInfo: p.additionalInfo || null,
              partDate: p.partDate || null,
              quantity: p.quantity || null,
              weight: p.weight,
              notes: p.notes || null,
            }));

            await createPartsWorker(partsToInsert);
            totalPartsScraped += parsedParts.length;
          }
        } catch (subErr: any) {
          allErrors.push(`${subLink.name}: ${subErr.message}`);
          console.warn(`[Scraper] Error scraping subcategory "${subLink.name}" for ${car.displayName}: ${subErr.message}`);
        }

        totalSubcatsScraped++;

        const progress = Math.round(((ci + 1) / categoryLinks.length) * 100);
        await storage.updateCar(carId, {
          scrapeProgress: progress,
          totalSubcategories: totalSubcatsScraped,
          totalParts: totalPartsScraped,
        });
      }
    }

    if (totalPartsScraped === 0 && allErrors.length > 0) {
      const errorSummary = `${allErrors.length} subcategory errors, 0 parts scraped. First: ${allErrors[0]}`;
      await storage.updateCar(carId, {
        scrapeStatus: "error",
        scrapeProgress: 100,
        scrapeError: errorSummary.slice(0, 500),
        totalParts: 0,
        totalSubcategories: totalSubcatsScraped,
        lastScrapedAt: new Date(),
      });
      console.warn(`[Scraper] ${car.displayName}: completed with errors — ${allErrors.length} failures, 0 parts`);
    } else {
      await storage.updateCar(carId, {
        scrapeStatus: "complete",
        scrapeProgress: 100,
        totalParts: totalPartsScraped,
        totalSubcategories: totalSubcatsScraped,
        lastScrapedAt: new Date(),
        scrapeError: allErrors.length > 0 ? `${allErrors.length} subcategory errors (parts still scraped)` : null,
      });
      console.log(`[Scraper] Completed ${car.displayName}: ${totalPartsScraped} parts${allErrors.length > 0 ? ` (${allErrors.length} subcategory errors)` : ''} (English only)`);
    }
  } catch (err: any) {
    await storage.updateCar(carId, {
      scrapeStatus: "error",
      scrapeError: err.message,
    });
    throw err;
  } finally {
    activeJobs.delete(carId);
  }
}

export async function rescrapePartsOnly(carIds: number[]): Promise<{ carId: number; parts: number; errors: string[] }[]> {
  const results: { carId: number; parts: number; errors: string[] }[] = [];

  for (const carId of carIds) {
    const car = await storage.getCar(carId);
    if (!car) { results.push({ carId, parts: 0, errors: ["Car not found"] }); continue; }

    const errors: string[] = [];
    let totalParts = 0;

    const allSubs = await storage.getSubcategoriesByCarId(carId);
    const subsWithUrl = allSubs.filter((s: any) => s.url);
    const isBpd = subsWithUrl.length > 0 && subsWithUrl[0].url?.includes("bmwpartsdeal.com");
    console.log(`[Rescrape] ${car.displayName} (id=${carId}): ${subsWithUrl.length} subcategories with URLs (${isBpd ? 'BPD' : 'ETK'})`);

    await storage.updateCar(carId, { scrapeStatus: "running", scrapeProgress: 0, scrapeError: null });

    for (let i = 0; i < subsWithUrl.length; i++) {
      const sub = subsWithUrl[i];
      try {
        const html = await fetchPage(sub.url!);
        await sleep(isBpd ? 1500 : 200);

        let partsToInsert: InsertPart[] = [];

        if (isBpd) {
          const store = extractBpdStore(html);
          if (store?.partList?.partList) {
            const partsList = store.partList.partList;
            for (const group of partsList) {
              const items = Array.isArray(group) ? group : [group];
              for (const p of items) {
                if (!p.partNumberAbbr && !p.partNumber) continue;
                const partNum = p.partNumber || "";
                const partNumClean = p.partNumberAbbr || partNum.replace(/[-\s]/g, "");
                const desc = p.mainDesc || p.pncDesc || "Part";
                const notes: string[] = [];
                if (p.hotSpotExtraList) {
                  for (const e of p.hotSpotExtraList) {
                    if (e.desc) notes.push(`${e.name || ""}: ${e.desc}`.trim());
                  }
                }
                partsToInsert.push({
                  subcategoryId: sub.id, carId,
                  itemNo: p.pncCode || p.code || null,
                  partNumber: partNum, partNumberClean: partNumClean,
                  description: desc, additionalInfo: p.auxiliaryDesc || null,
                  partDate: null, quantity: null, weight: null,
                  notes: notes.join("; ") || null,
                });
              }
            }
          }
        } else {
          const parsedParts = parsePartsTable(html);
          partsToInsert = parsedParts.map(p => ({
            subcategoryId: sub.id,
            carId,
            itemNo: p.itemNo,
            partNumber: p.partNumber,
            partNumberClean: p.partNumberClean,
            description: p.description,
            additionalInfo: p.additionalInfo || null,
            partDate: p.partDate || null,
            quantity: p.quantity || null,
            weight: p.weight,
            notes: p.notes || null,
          }));
        }

        if (partsToInsert.length > 0) {
          await createPartsWorker(partsToInsert);
          totalParts += partsToInsert.length;
        }

        if (i % 50 === 0 || i === subsWithUrl.length - 1) {
          const progress = Math.round(((i + 1) / subsWithUrl.length) * 100);
          await storage.updateCar(carId, { scrapeProgress: progress, totalParts });
          console.log(`[Rescrape] ${car.displayName}: ${i + 1}/${subsWithUrl.length} subcats, ${totalParts} parts`);
        }
      } catch (err: any) {
        errors.push(`Sub ${sub.id} (${sub.name}): ${err.message}`);
      }
    }

    await storage.updateCar(carId, {
      scrapeStatus: "complete",
      scrapeProgress: 100,
      totalParts,
      lastScrapedAt: new Date(),
      scrapeError: errors.length > 0 ? `${errors.length} errors` : null,
    });
    console.log(`[Rescrape] ${car.displayName}: done - ${totalParts} parts, ${errors.length} errors`);
    results.push({ carId, parts: totalParts, errors });
  }

  return results;
}

// ============ BMWPartsDeal Scraper (for G87 M2) ============

const BPD_BASE = "https://www.bmwpartsdeal.com";
const BPD_DELAY = 2000;

function extractBpdStore(html: string): any {
  const storeStart = html.indexOf("__INITIAL_STORE__ = ") + "__INITIAL_STORE__ = ".length;
  if (storeStart < 20) return null;
  let depth = 0, end = storeStart;
  for (let i = storeStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  try {
    return (0, eval)("(" + html.substring(storeStart, end) + ")");
  } catch { return null; }
}

export async function scrapeFromBmwPartsDeal(carId: number, catalogUrl: string): Promise<void> {
  const car = await storage.getCar(carId);
  if (!car) throw new Error(`Car ${carId} not found`);

  activeJobs.set(carId, true);

  try {
    await storage.updateCar(carId, { scrapeStatus: "running", scrapeProgress: 0, scrapeError: null });
    await storage.deleteCategories(carId);

    console.log(`[BPD] Fetching category listing: ${catalogUrl}`);
    const mainHtml = await fetchPage(catalogUrl);
    await sleep(BPD_DELAY);

    const linkRe = /href="(\/parts-list\/[^"]*?\/([^"]*?)\.html)"[^>]*>([^<]+)/g;
    const subcatPages: { url: string; slug: string; name: string }[] = [];
    let m;
    while ((m = linkRe.exec(mainHtml)) !== null) {
      const full = BPD_BASE + m[1];
      if (!subcatPages.find(s => s.url === full)) {
        subcatPages.push({ url: full, slug: m[2], name: m[3].trim().replace(/&amp;/g, "&") });
      }
    }

    console.log(`[BPD] Found ${subcatPages.length} subcategory pages`);
    if (subcatPages.length === 0) throw new Error("No subcategory links found on main page");

    let totalParts = 0;
    let totalSubs = 0;
    const categoryMap = new Map<string, { id: number; name: string }>();

    await storage.updateCar(carId, { totalCategories: 0, totalSubcategories: subcatPages.length, totalParts: 0 });

    for (let i = 0; i < subcatPages.length; i++) {
      if (!activeJobs.get(carId)) return;

      const sub = subcatPages[i];
      console.log(`[BPD] (${i + 1}/${subcatPages.length}) ${sub.name}`);

      const html = await fetchPage(sub.url);
      await sleep(BPD_DELAY);

      const store = extractBpdStore(html);
      if (!store?.partList) { console.log(`[BPD]   No store data`); continue; }

      const catName = store.partList.category || "General";
      const subName = store.partList.subCategory || sub.name;

      if (!categoryMap.has(catName)) {
        const cat = await storage.createCategory({
          carId, categoryId: String(categoryMap.size + 1), name: catName,
          imageUrl: null, url: catalogUrl,
        });
        categoryMap.set(catName, { id: cat.id, name: catName });
      }
      const category = categoryMap.get(catName)!;

      const subcategory = await storage.createSubcategory({
        categoryId: category.id, carId, subcategoryId: sub.slug,
        name: subName, imageUrl: null, url: sub.url, diagramImageUrl: null,
      });

      const partsList = store.partList.partList;
      if (!partsList || partsList.length === 0) { totalSubs++; continue; }

      const partsToInsert: InsertPart[] = [];
      for (const group of partsList) {
        const items = Array.isArray(group) ? group : [group];
        for (const p of items) {
          if (!p.partNumberAbbr && !p.partNumber) continue;
          const partNum = p.partNumber || "";
          const partNumClean = p.partNumberAbbr || partNum.replace(/[-\s]/g, "");
          const desc = p.mainDesc || p.pncDesc || "Part";
          const notes: string[] = [];
          if (p.hotSpotExtraList) {
            for (const e of p.hotSpotExtraList) {
              if (e.desc) notes.push(`${e.name || ""}: ${e.desc}`.trim());
            }
          }
          partsToInsert.push({
            subcategoryId: subcategory.id, carId,
            itemNo: p.pncCode || p.code || null,
            partNumber: partNum, partNumberClean: partNumClean,
            description: desc, additionalInfo: p.auxiliaryDesc || null,
            partDate: null, quantity: null, weight: null,
            notes: notes.join("; ") || null,
          });
        }
      }

      if (partsToInsert.length > 0) {
        await createPartsWorker(partsToInsert);
        totalParts += partsToInsert.length;
      }

      totalSubs++;
      await storage.updateCar(carId, {
        scrapeProgress: Math.round(((i + 1) / subcatPages.length) * 100),
        totalCategories: categoryMap.size,
        totalSubcategories: totalSubs,
        totalParts: totalParts,
      });
    }

    await storage.updateCar(carId, {
      scrapeStatus: "complete", scrapeProgress: 100,
      totalCategories: categoryMap.size, totalSubcategories: totalSubs,
      totalParts: totalParts, lastScrapedAt: new Date(),
    });
    console.log(`[BPD] Done: ${totalParts} parts in ${totalSubs} subcategories, ${categoryMap.size} categories`);
  } catch (err: any) {
    console.error(`[BPD] Error:`, err.message);
    await storage.updateCar(carId, { scrapeStatus: "error", scrapeError: err.message });
    throw err;
  } finally {
    activeJobs.delete(carId);
  }
}

export async function seedInitialCars(): Promise<void> {
  const existing = await storage.getCars();
  if (existing.length > 0) return;

  const carsToSeed = [
    // === M Series ===
    {
      chassis: "G80", generation: "G", series: "M", bodyType: "Saloon",
      modelName: "M3 Comp. M xDrive", displayName: "G80 M3", engine: "S58", yearStart: 2020,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G80/Lim/M3%20Comp.%20M%20xDrive/ECE/R/N/2020/09/62188/",
      catalogId: "62188", imageUrl: "https://www.bmw-etk.info/img/small/513505.jpg",
    },
    {
      chassis: "G81", generation: "G", series: "M", bodyType: "Touring",
      modelName: "M3 Comp. M xDrive", displayName: "G81 M3 Touring", engine: "S58", yearStart: 2021,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G81/Tou/M3%20Comp.%20M%20xDrive/ECE/R/N/2021/09/63030/",
      catalogId: "63030", imageUrl: "https://www.bmw-etk.info/img/small/513505.jpg",
    },
    {
      chassis: "G82", generation: "G", series: "M", bodyType: "Coupé",
      modelName: "M4 Comp. M xDrive", displayName: "G82 M4", engine: "S58", yearStart: 2020,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G82/Cou/M4%20Comp.%20M%20xDrive/ECE/L/N/2020/07/62190/",
      catalogId: "62190", imageUrl: "https://www.bmw-etk.info/img/small/513505.jpg",
    },
    {
      chassis: "G83", generation: "G", series: "M", bodyType: "Convertible",
      modelName: "M4 Competition", displayName: "G83 M4", engine: "S58", yearStart: 2020,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/M-Models/cat/VT/G83/Cab/M4%20Competition/ECE/L/N/2020/07/62192/",
      catalogId: "62192", imageUrl: "https://www.bmw-etk.info/img/small/513505.jpg",
    },
    {
      chassis: "G87", generation: "G", series: "M", bodyType: "Coupé",
      modelName: "M2", displayName: "G87 M2", engine: "S58", yearStart: 2022,
      catalogUrl: "https://www.bmwpartsdeal.com/2023-bmw-m2-parts.html", catalogId: null, imageUrl: null,
    },
    {
      chassis: "F80", generation: "F", series: "M", bodyType: "Saloon",
      modelName: "M3", displayName: "F80 M3", engine: "S55", yearStart: 2012, yearEnd: 2018,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/M-Models/cat/VT/F80/Lim/M3/ECE/L/N/2012/04/56447/",
      catalogId: "56447", imageUrl: "https://www.bmw-etk.info/img/small/378926.jpg",
    },
    {
      chassis: "F82", generation: "F", series: "M", bodyType: "Coupé",
      modelName: "M4", displayName: "F82 M4", engine: "S55", yearStart: 2013, yearEnd: 2020,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/M-Models/cat/VT/F82/Cou/M4/ECE/L/N/2013/02/56449/",
      catalogId: "56449", imageUrl: "https://www.bmw-etk.info/img/small/378945.jpg",
    },
    {
      chassis: "F83", generation: "F", series: "M", bodyType: "Convertible",
      modelName: "M4", displayName: "F83 M4", engine: "S55", yearStart: 2013, yearEnd: 2020,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/M-Models/cat/VT/F83/Cab/M4/ECE/L/N/2013/06/56677/",
      catalogId: "56677", imageUrl: "https://www.bmw-etk.info/img/small/378945.jpg",
    },
    {
      chassis: "F87", generation: "F", series: "M", bodyType: "Coupé",
      modelName: "M2", displayName: "F87 M2", engine: "N55", yearStart: 2014, yearEnd: 2021,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/M-Models/cat/VT/F87/Cou/M2/ECE/L/N/2014/11/58003/",
      catalogId: "58003", imageUrl: null,
    },
    // === 1 Series ===
    {
      chassis: "E82", generation: "E", series: "1", bodyType: "Coupé",
      modelName: "135i N54", displayName: "E82 135i N54", engine: "N54", yearStart: 2007, yearEnd: 2010,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/E82/Cou/135i%20N54/ECE/L/N/2010/01/50607/",
      catalogId: "50607", imageUrl: null,
    },
    {
      chassis: "E82", generation: "E", series: "1", bodyType: "Coupé",
      modelName: "135i N55", displayName: "E82 135i N55", engine: "N55", yearStart: 2010, yearEnd: 2013,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/E82/Cou/135i%20N55/ECE/L/N/2011/01/52061/",
      catalogId: "52061", imageUrl: null,
    },
    {
      chassis: "E88", generation: "E", series: "1", bodyType: "Convertible",
      modelName: "135i N54", displayName: "E88 135i N54", engine: "N54", yearStart: 2008, yearEnd: 2010,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/E88/Cab/135i%20N54/ECE/L/N/2006/10/50609/",
      catalogId: "50609", imageUrl: null,
    },
    {
      chassis: "E88", generation: "E", series: "1", bodyType: "Convertible",
      modelName: "135i N55", displayName: "E88 135i N55", engine: "N55", yearStart: 2010, yearEnd: 2013,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/E88/Cab/135i%20N55/ECE/L/N/2010/02/52065/",
      catalogId: "52065", imageUrl: null,
    },
    {
      chassis: "F20", generation: "F", series: "1", bodyType: "Hatchback",
      modelName: "M135i", displayName: "F20 M135i", engine: "N55", yearStart: 2011, yearEnd: 2019,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/F20/SH/M135i/ECE/L/N/2011/11/55070/",
      catalogId: "55070", imageUrl: null,
    },
    {
      chassis: "F40", generation: "F", series: "1", bodyType: "Hatchback",
      modelName: "M135iX", displayName: "F40 M135iX", engine: "B48", yearStart: 2018,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/F40/SH/M135iX/ECE/L/N/2018/06/60928/",
      catalogId: "60928", imageUrl: null,
    },
    // === 2 Series ===
    {
      chassis: "F22", generation: "F", series: "2", bodyType: "Coupé",
      modelName: "M235i", displayName: "F22 M235i", engine: "N55", yearStart: 2012, yearEnd: 2021,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/F22/Cou/M235i/ECE/L/N/2012/11/56190/",
      catalogId: "56190", imageUrl: null,
    },
    {
      chassis: "G42", generation: "G", series: "2", bodyType: "Coupé",
      modelName: "M240iX", displayName: "G42 M240iX", engine: "B58", yearStart: 2020,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G42/Cou/M240iX/ECE/L/N/2020/06/62416/",
      catalogId: "62416", imageUrl: null,
    },
    // === 3 Series ===
    {
      chassis: "E90", generation: "E", series: "3", bodyType: "Saloon",
      modelName: "335i", displayName: "E90 335i", engine: "N54", yearStart: 2006, yearEnd: 2011,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/E90/Lim/335i/ECE/L/N/2007/10/49544/",
      catalogId: "49544", imageUrl: null,
    },
    {
      chassis: "E91", generation: "E", series: "3", bodyType: "Touring",
      modelName: "335i", displayName: "E91 335i", engine: "N54", yearStart: 2006, yearEnd: 2012,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/E91/Tou/335i/ECE/L/N/2007/07/49553/",
      catalogId: "49553", imageUrl: null,
    },
    {
      chassis: "E92", generation: "E", series: "3", bodyType: "Coupé",
      modelName: "335i", displayName: "E92 335i", engine: "N54", yearStart: 2006, yearEnd: 2013,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/E92/Cou/335i/ECE/L/N/2007/08/49564/",
      catalogId: "49564", imageUrl: null,
    },
    {
      chassis: "E93", generation: "E", series: "3", bodyType: "Convertible",
      modelName: "335i", displayName: "E93 335i", engine: "N54", yearStart: 2006, yearEnd: 2013,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/E93/Cab/335i/ECE/L/N/2008/10/50173/",
      catalogId: "50173", imageUrl: null,
    },
    {
      chassis: "F30", generation: "F", series: "3", bodyType: "Saloon",
      modelName: "335i", displayName: "F30 335i", engine: "N55", yearStart: 2011, yearEnd: 2019,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/F30/Lim/335i/ECE/L/N/2011/04/54111/",
      catalogId: "54111", imageUrl: null,
    },
    {
      chassis: "G20", generation: "G", series: "3", bodyType: "Saloon",
      modelName: "M340i", displayName: "G20 M340i", engine: "B58", yearStart: 2018,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G20/Lim/M340i/ECE/L/N/2018/09/60846/",
      catalogId: "60846", imageUrl: null,
    },
    // === 4 Series ===
    {
      chassis: "F32", generation: "F", series: "4", bodyType: "Coupé",
      modelName: "435i", displayName: "F32 435i", engine: "N55", yearStart: 2012, yearEnd: 2020,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/F32/Cou/435i/ECE/L/N/2012/11/55970/",
      catalogId: "55970", imageUrl: null,
    },
    {
      chassis: "G22", generation: "G", series: "4", bodyType: "Coupé",
      modelName: "M440i", displayName: "G22 M440i", engine: "B58", yearStart: 2020,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G22/Cou/M440i/ECE/L/N/2020/02/61942/",
      catalogId: "61942", imageUrl: null,
    },
    // === 5 Series ===
    {
      chassis: "F10", generation: "F", series: "5", bodyType: "Saloon",
      modelName: "535i", displayName: "F10 535i", engine: "N55", yearStart: 2009, yearEnd: 2016,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/F10/Lim/535d%20N57S/ECE/L/N/2009/01/52548/",
      catalogId: "52548", imageUrl: null,
    },
    {
      chassis: "G30", generation: "G", series: "5", bodyType: "Saloon",
      modelName: "540i B58", displayName: "G30 540i", engine: "B58", yearStart: 2015,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G30/Lim/540i%20B58/ECE/L/N/2015/11/58531/",
      catalogId: "58531", imageUrl: null,
    },
    // === 6 Series ===
    {
      chassis: "F13", generation: "F", series: "6", bodyType: "Coupé",
      modelName: "650i N63N", displayName: "F13 650i", engine: "N63", yearStart: 2010, yearEnd: 2018,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/F13/Cou/650i%20N63N/ECE/L/N/2011/10/55064/",
      catalogId: "55064", imageUrl: null,
    },
    {
      chassis: "G32", generation: "G", series: "6", bodyType: "Gran Turismo",
      modelName: "640i B58", displayName: "G32 640i GT", engine: "B58", yearStart: 2016,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G32/GT/640i%20B58/ECE/L/A/2016/09/59394/",
      catalogId: "59394", imageUrl: null,
    },
    // === 7 Series ===
    {
      chassis: "F01", generation: "F", series: "7", bodyType: "Saloon",
      modelName: "750i", displayName: "F01 750i", engine: "N63", yearStart: 2007, yearEnd: 2015,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/F01/Lim/750i/ECE/L/A/2007/06/51263/",
      catalogId: "51263", imageUrl: null,
    },
    {
      chassis: "G70", generation: "G", series: "7", bodyType: "Saloon",
      modelName: "760iX", displayName: "G70 760i", engine: "N63", yearStart: 2021,
      catalogUrl: "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G70/Lim/760iX/ECE/L/A/2021/07/63003/",
      catalogId: "63003", imageUrl: null,
    },
  ] as const;

  function generateSlug(catalogUrl: string): string | null {
    const parts = catalogUrl.split('/').filter(Boolean);
    const vtIdx = parts.indexOf('VT');
    if (vtIdx < 0) return null;
    const chassis = parts[vtIdx + 1] || '';
    const model = decodeURIComponent(parts[vtIdx + 3] || '');
    const year = parts[vtIdx + 7] || '';
    const month = parts[vtIdx + 8] || '';
    const modelSlug = model.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return (chassis + '-' + modelSlug + '-' + year + '-' + month).toLowerCase();
  }

  for (const car of carsToSeed) {
    await storage.createCar({
      ...car,
      series: (car as any).series ?? "M",
      yearEnd: (car as any).yearEnd ?? null,
      catalogId: (car as any).catalogId ?? null,
      imageUrl: (car as any).imageUrl ?? null,
      scrapeStatus: (car as any).scrapeStatus ?? "idle",
      scrapeProgress: 0,
      totalCategories: 0,
      totalSubcategories: 0,
      totalParts: 0,
      lastScrapedAt: null,
      scrapeError: null,
      slug: generateSlug(car.catalogUrl),
    });
  }

  console.log(`[Seed] Created ${carsToSeed.length} BMW M cars`);
}

import { createJob, completeJob, failJob, startPeriodicCheckpoint, stopPeriodicCheckpoint, getActiveJob, cancelJobByType } from "./job-manager";

let enrichmentRunning = false;
let enrichmentJobId: number | null = null;
let enrichmentState = {
  running: false,
  totalEmpty: 0,
  processed: 0,
  enriched: 0,
  failed: 0,
  skipped: 0,
  currentSubcategory: "",
  currentCar: "",
  startedAt: 0,
  errors: [] as string[],
};

export function getEnrichmentStatus() {
  return { ...enrichmentState };
}

export function cancelEnrichment() {
  enrichmentRunning = false;
  if (enrichmentJobId) {
    cancelJobByType("enrichment").catch(() => {});
  }
}

export async function startEnrichment(isResume = false): Promise<void> {
  if (enrichmentRunning) throw new Error("Enrichment already running");

  enrichmentRunning = true;
  enrichmentState = {
    running: true,
    totalEmpty: 0,
    processed: 0,
    enriched: 0,
    failed: 0,
    skipped: 0,
    currentSubcategory: "",
    currentCar: "",
    startedAt: Date.now(),
    errors: [],
  };

  if (!isResume) {
    const job = await createJob("enrichment", { status: "starting" });
    enrichmentJobId = job.id;
  } else {
    const active = await getActiveJob("enrichment");
    enrichmentJobId = active?.id ?? null;
  }

  if (enrichmentJobId) {
    startPeriodicCheckpoint(enrichmentJobId, () => ({ ...enrichmentState }));
  }

  enrichEmptySubcategories().catch(err => {
    console.error("[Enrich] Fatal error:", err);
    enrichmentState.running = false;
    enrichmentRunning = false;
    if (enrichmentJobId) {
      failJob(enrichmentJobId, err.message, { ...enrichmentState }).catch(() => {});
      enrichmentJobId = null;
    }
  });
}

async function enrichEmptySubcategories() {
  const { db } = await import("./storage");
  const { sql } = await import("drizzle-orm");

  try {
    const emptyResult = await db.execute(sql.raw(`
      SELECT s.id, s.name, s.url, s.car_id, c.slug as car_slug, c.display_name as car_name
      FROM subcategories s
      JOIN cars c ON c.id = s.car_id
      LEFT JOIN parts p ON p.subcategory_id = s.id
      WHERE p.id IS NULL AND s.url IS NOT NULL AND s.url != ''
      ORDER BY s.car_id, s.id
    `));
    const emptySubs = (emptyResult as any).rows || [];
    enrichmentState.totalEmpty = emptySubs.length;

    console.log(`[Enrich] Found ${emptySubs.length} empty subcategories to enrich`);

    for (const sub of emptySubs) {
      if (!enrichmentRunning) {
        console.log("[Enrich] Cancelled by user");
        break;
      }

      enrichmentState.currentSubcategory = sub.name;
      enrichmentState.currentCar = sub.car_name || sub.car_slug;
      enrichmentState.processed++;

      if (!sub.url) {
        enrichmentState.skipped++;
        continue;
      }

      try {
        const html = await fetchPage(sub.url);
        await sleep(400);

        const parsedParts = parsePartsTable(html);

        if (parsedParts.length > 0) {
          const partsToInsert = parsedParts.map(p => ({
            subcategoryId: sub.id,
            carId: sub.car_id,
            itemNo: p.itemNo,
            partNumber: p.partNumber,
            partNumberClean: p.partNumberClean,
            description: p.description,
            additionalInfo: p.additionalInfo || null,
            partDate: p.partDate || null,
            quantity: p.quantity || null,
            weight: p.weight,
            notes: p.notes || null,
          }));

          await createPartsWorker(partsToInsert as any);
          enrichmentState.enriched++;
          console.log(`[Enrich] ${sub.car_slug} / "${sub.name}": ${parsedParts.length} parts found`);

          const partCountResult = await db.execute(sql.raw(
            `SELECT COUNT(*) as cnt FROM parts WHERE car_id = ${sub.car_id}`
          ));
          const totalParts = parseInt(((partCountResult as any).rows)[0]?.cnt || "0", 10);
          await db.execute(sql.raw(`UPDATE cars SET total_parts = ${totalParts} WHERE id = ${sub.car_id}`));
        } else {
          enrichmentState.skipped++;
        }

        if (enrichmentState.processed % 100 === 0) {
          console.log(`[Enrich] Progress: ${enrichmentState.processed}/${enrichmentState.totalEmpty} (${enrichmentState.enriched} enriched, ${enrichmentState.skipped} skipped, ${enrichmentState.failed} failed)`);
        }
      } catch (err: any) {
        enrichmentState.failed++;
        if (enrichmentState.errors.length < 20) {
          enrichmentState.errors.push(`${sub.car_slug}/${sub.name}: ${err.message}`);
        }
        console.error(`[Enrich] Error for ${sub.car_slug} / "${sub.name}":`, err.message);
        await sleep(1000);
      }
    }

    const wasCancelled = !enrichmentRunning;
    console.log(`[Enrich] ${wasCancelled ? 'Cancelled' : 'Complete'}: ${enrichmentState.enriched} enriched, ${enrichmentState.skipped} empty/skipped, ${enrichmentState.failed} failed out of ${enrichmentState.totalEmpty}`);

    if (enrichmentJobId) {
      if (wasCancelled) {
        await cancelJobByType("enrichment");
      } else {
        await completeJob(enrichmentJobId, { ...enrichmentState });
      }
      enrichmentJobId = null;
    }
  } finally {
    enrichmentState.running = false;
    enrichmentRunning = false;
    if (enrichmentJobId) {
      stopPeriodicCheckpoint(enrichmentJobId);
    }
  }
}
