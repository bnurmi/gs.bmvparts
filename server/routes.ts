import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { startScrapeJob, isJobRunning, seedInitialCars } from "./scraper";
import { db } from "./storage";
import { cars as carsTable, categories as categoriesTable, subcategories as subcategoriesTable, parts as partsTable } from "@shared/schema";
import { eq, gt } from "drizzle-orm";
import { readFile } from "fs/promises";
import path from "path";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed initial cars on startup
  await seedInitialCars();

  // GET /api/cars - list all cars
  app.get("/api/cars", async (req, res) => {
    try {
      const cars = await storage.getCars();
      res.json(cars);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cars/:id - get single car
  app.get("/api/cars/:id", async (req, res) => {
    try {
      const car = await storage.getCar(parseInt(req.params.id));
      if (!car) return res.status(404).json({ error: "Car not found" });
      res.json(car);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/cars/:id/scrape - start scraping a car
  app.post("/api/cars/:id/scrape", async (req, res) => {
    try {
      const carId = parseInt(req.params.id);
      const car = await storage.getCar(carId);
      if (!car) return res.status(404).json({ error: "Car not found" });
      if (!car.catalogUrl) return res.status(400).json({ error: "No catalog URL for this car" });
      if (isJobRunning(carId)) return res.status(409).json({ error: "Scrape already running" });

      await startScrapeJob(carId);
      res.json({ status: "started" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/cars/:id/scrape - cancel scrape
  app.delete("/api/cars/:id/scrape", async (req, res) => {
    try {
      const carId = parseInt(req.params.id);
      // The activeJobs map is checked, we can clear by updating status
      await storage.updateCar(carId, { scrapeStatus: "cancelled" });
      res.json({ status: "cancelled" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cars/:id/categories - get categories for a car
  app.get("/api/cars/:id/categories", async (req, res) => {
    try {
      const cats = await storage.getCategoriesByCarId(parseInt(req.params.id));
      res.json(cats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/categories/:id/subcategories - get subcategories
  app.get("/api/categories/:id/subcategories", async (req, res) => {
    try {
      const subs = await storage.getSubcategoriesByCategoryId(parseInt(req.params.id));
      res.json(subs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/subcategories/:id/parts - get parts for subcategory
  app.get("/api/subcategories/:id/parts", async (req, res) => {
    try {
      const parts = await storage.getPartsBySubcategoryId(parseInt(req.params.id));
      res.json(parts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cars/:id/parts - get all parts for a car with optional search
  app.get("/api/cars/:id/parts", async (req, res) => {
    try {
      const carId = parseInt(req.params.id);
      const search = req.query.q as string | undefined;
      const limit = parseInt(req.query.limit as string || "50");
      const offset = parseInt(req.query.offset as string || "0");

      const [parts, total] = await Promise.all([
        storage.getPartsByCarId(carId, search, limit, offset),
        storage.countPartsByCarId(carId, search),
      ]);

      res.json({ parts, total, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/search - global parts search
  app.get("/api/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      const carIds = req.query.cars ? String(req.query.cars).split(",").map(Number) : undefined;

      if (!q || q.length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }

      const results = await storage.searchParts(q, carIds);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/export - export all scraped data as JSON (bulk queries for speed)
  app.get("/api/export", async (req, res) => {
    try {
      const allCars = await db.select().from(carsTable);
      const scrapedCars = allCars.filter(c => (c.totalParts ?? 0) > 0);
      const scrapedCarIds = scrapedCars.map(c => c.id);

      if (scrapedCarIds.length === 0) {
        return res.json({ version: 1, exportedAt: new Date().toISOString(), cars: [] });
      }

      const allCats = await db.select().from(categoriesTable);
      const allSubs = await db.select().from(subcategoriesTable);
      const allParts = await db.select().from(partsTable);

      const catsByCar = new Map<number, typeof allCats>();
      for (const cat of allCats) {
        const arr = catsByCar.get(cat.carId) || [];
        arr.push(cat);
        catsByCar.set(cat.carId, arr);
      }

      const subsByCat = new Map<number, typeof allSubs>();
      for (const sub of allSubs) {
        const arr = subsByCat.get(sub.categoryId) || [];
        arr.push(sub);
        subsByCat.set(sub.categoryId, arr);
      }

      const partsBySub = new Map<number, typeof allParts>();
      for (const part of allParts) {
        const arr = partsBySub.get(part.subcategoryId) || [];
        arr.push(part);
        partsBySub.set(part.subcategoryId, arr);
      }

      const exportData = scrapedCars.map(car => ({
        chassis: car.chassis, generation: car.generation, series: car.series,
        bodyType: car.bodyType, modelName: car.modelName, displayName: car.displayName,
        engine: car.engine, yearStart: car.yearStart, yearEnd: car.yearEnd,
        catalogUrl: car.catalogUrl, catalogId: car.catalogId, imageUrl: car.imageUrl,
        scrapeStatus: car.scrapeStatus, scrapeProgress: car.scrapeProgress,
        totalCategories: car.totalCategories, totalSubcategories: car.totalSubcategories,
        totalParts: car.totalParts, lastScrapedAt: car.lastScrapedAt,
        categories: (catsByCar.get(car.id) || []).map(cat => ({
          categoryId: cat.categoryId, name: cat.name, imageUrl: cat.imageUrl, url: cat.url,
          subcategories: (subsByCat.get(cat.id) || []).map(sub => ({
            subcategoryId: sub.subcategoryId, name: sub.name,
            imageUrl: sub.imageUrl, url: sub.url, diagramImageUrl: sub.diagramImageUrl,
            parts: (partsBySub.get(sub.id) || []).map(p => ({
              itemNo: p.itemNo, partNumber: p.partNumber, partNumberClean: p.partNumberClean,
              description: p.description, additionalInfo: p.additionalInfo,
              partDate: p.partDate, quantity: p.quantity, weight: p.weight, notes: p.notes,
            })),
          })),
        })),
      }));

      res.json({ version: 1, exportedAt: new Date().toISOString(), cars: exportData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/import - import data from JSON export
  app.post("/api/import", async (req, res) => {
    try {
      const { cars: importCars } = req.body;
      if (!importCars || !Array.isArray(importCars)) {
        return res.status(400).json({ error: "Invalid import data" });
      }

      let totalImported = 0;

      for (const carData of importCars) {
        const existingCars = await storage.getCars();
        const existingCar = existingCars.find(c => c.catalogId === carData.catalogId);
        if (!existingCar) continue;

        await storage.deleteCategories(existingCar.id);

        for (const catData of carData.categories || []) {
          const category = await storage.createCategory({
            carId: existingCar.id,
            categoryId: catData.categoryId,
            name: catData.name,
            imageUrl: catData.imageUrl,
            url: catData.url,
          });

          for (const subData of catData.subcategories || []) {
            const subcategory = await storage.createSubcategory({
              categoryId: category.id,
              carId: existingCar.id,
              subcategoryId: subData.subcategoryId,
              name: subData.name,
              imageUrl: subData.imageUrl,
              url: subData.url,
              diagramImageUrl: subData.diagramImageUrl,
            });

            if (subData.parts?.length > 0) {
              await storage.createParts(
                subData.parts.map((p: any) => ({
                  subcategoryId: subcategory.id,
                  carId: existingCar.id,
                  itemNo: p.itemNo,
                  partNumber: p.partNumber,
                  partNumberClean: p.partNumberClean,
                  description: p.description,
                  additionalInfo: p.additionalInfo || null,
                  partDate: p.partDate || null,
                  quantity: p.quantity || null,
                  weight: p.weight,
                  notes: p.notes || null,
                }))
              );
              totalImported += subData.parts.length;
            }
          }
        }

        await storage.updateCar(existingCar.id, {
          scrapeStatus: carData.scrapeStatus || "complete",
          scrapeProgress: carData.scrapeProgress || 100,
          totalCategories: carData.totalCategories || 0,
          totalSubcategories: carData.totalSubcategories || 0,
          totalParts: carData.totalParts || 0,
          lastScrapedAt: carData.lastScrapedAt ? new Date(carData.lastScrapedAt) : new Date(),
        });
      }

      res.json({ status: "ok", carsImported: importCars.length, totalParts: totalImported });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sync-from-dev - import bundled export data or fetch from dev
  app.post("/api/sync-from-dev", async (req, res) => {
    try {
      let exportData: any;

      const bundledPath = path.resolve(process.cwd(), "dist", "export-data.json");
      try {
        const fileContent = await readFile(bundledPath, "utf-8");
        exportData = JSON.parse(fileContent);
        console.log(`Loaded bundled export data from ${bundledPath}`);
      } catch {
        const devDomain = process.env.REPLIT_DEV_DOMAIN;
        if (!devDomain) {
          return res.status(400).json({ error: "No bundled data found and dev domain not available. Re-deploy from dev." });
        }
        const devUrl = `https://${devDomain}/api/export`;
        const fetchRes = await fetch(devUrl, { headers: { "Accept": "application/json" } });
        if (!fetchRes.ok) {
          return res.status(502).json({ error: `No bundled data and dev server returned ${fetchRes.status}. Make sure the dev environment is running.` });
        }
        exportData = await fetchRes.json();
      }

      const importCars = exportData.cars;
      if (!importCars || !Array.isArray(importCars) || importCars.length === 0) {
        return res.json({ status: "ok", carsImported: 0, totalParts: 0, message: "No data to sync" });
      }

      let totalImported = 0;
      let carsImported = 0;

      for (const carData of importCars) {
        const existingCars = await storage.getCars();
        const existingCar = existingCars.find(c => c.catalogId === carData.catalogId);
        if (!existingCar) continue;

        await storage.deleteCategories(existingCar.id);
        carsImported++;

        for (const catData of carData.categories || []) {
          const category = await storage.createCategory({
            carId: existingCar.id,
            categoryId: catData.categoryId,
            name: catData.name,
            imageUrl: catData.imageUrl,
            url: catData.url,
          });

          for (const subData of catData.subcategories || []) {
            const subcategory = await storage.createSubcategory({
              categoryId: category.id,
              carId: existingCar.id,
              subcategoryId: subData.subcategoryId,
              name: subData.name,
              imageUrl: subData.imageUrl,
              url: subData.url,
              diagramImageUrl: subData.diagramImageUrl,
            });

            if (subData.parts?.length > 0) {
              await storage.createParts(
                subData.parts.map((p: any) => ({
                  subcategoryId: subcategory.id,
                  carId: existingCar.id,
                  itemNo: p.itemNo,
                  partNumber: p.partNumber,
                  partNumberClean: p.partNumberClean,
                  description: p.description,
                  additionalInfo: p.additionalInfo || null,
                  partDate: p.partDate || null,
                  quantity: p.quantity || null,
                  weight: p.weight,
                  notes: p.notes || null,
                }))
              );
              totalImported += subData.parts.length;
            }
          }
        }

        await storage.updateCar(existingCar.id, {
          scrapeStatus: carData.scrapeStatus || "complete",
          scrapeProgress: carData.scrapeProgress || 100,
          totalCategories: carData.totalCategories || 0,
          totalSubcategories: carData.totalSubcategories || 0,
          totalParts: carData.totalParts || 0,
          lastScrapedAt: carData.lastScrapedAt ? new Date(carData.lastScrapedAt) : new Date(),
          imageUrl: carData.imageUrl || existingCar.imageUrl,
        });
      }

      res.json({ status: "ok", carsImported, totalParts: totalImported });
    } catch (err: any) {
      res.status(502).json({ error: `Failed to sync: ${err.message}` });
    }
  });

  // GET /api/parts/cross-reference/:partNumberClean - cross-reference a part across cars
  app.get("/api/parts/cross-reference/:partNumberClean", async (req, res) => {
    try {
      const result = await storage.crossReferencePart(req.params.partNumberClean);
      if (!result) return res.status(404).json({ error: "Part not found" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stats - overall stats
  app.get("/api/stats", async (req, res) => {
    try {
      const [cars, totalParts] = await Promise.all([
        storage.getCars(),
        storage.countParts(),
      ]);

      const scraped = cars.filter(c => c.scrapeStatus === "complete").length;

      res.json({
        totalCars: cars.length,
        scrapedCars: scraped,
        totalParts,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
