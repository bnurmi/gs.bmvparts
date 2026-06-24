import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile, mkdir } from "fs/promises";
async function exportDataForDeploy() {
  if (!process.env.DATABASE_URL) {
    console.log("No DATABASE_URL, skipping data export");
    return;
  }
  console.log("exporting scraped data for deployment...");
  const pgModule = await import("pg");
  const Pool = pgModule.default?.Pool || pgModule.Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: allCarsRows } = await pool.query("SELECT * FROM cars");
    const scrapedCars = allCarsRows.filter((c: any) => (c.total_parts ?? 0) > 0);
    if (scrapedCars.length === 0) {
      console.log("No scraped data to export");
      await pool.end();
      return;
    }
    const { rows: cats } = await pool.query("SELECT * FROM categories");
    const { rows: subs } = await pool.query("SELECT * FROM subcategories");
    const { rows: parts } = await pool.query("SELECT * FROM parts");
    const catsByCar = new Map<number, any[]>();
    for (const cat of cats) { const a = catsByCar.get(cat.car_id) || []; a.push(cat); catsByCar.set(cat.car_id, a); }
    const subsByCat = new Map<number, any[]>();
    for (const sub of subs) { const a = subsByCat.get(sub.category_id) || []; a.push(sub); subsByCat.set(sub.category_id, a); }
    const partsBySub = new Map<number, any[]>();
    for (const part of parts) { const a = partsBySub.get(part.subcategory_id) || []; a.push(part); partsBySub.set(part.subcategory_id, a); }
    const exportData = scrapedCars.map((car: any) => ({
      chassis: car.chassis, generation: car.generation, series: car.series,
      bodyType: car.body_type, modelName: car.model_name, displayName: car.display_name,
      engine: car.engine, yearStart: car.year_start, yearEnd: car.year_end,
      catalogUrl: car.catalog_url, catalogId: car.catalog_id, imageUrl: car.image_url,
      scrapeStatus: car.scrape_status, scrapeProgress: car.scrape_progress,
      totalCategories: car.total_categories, totalSubcategories: car.total_subcategories,
      totalParts: car.total_parts, lastScrapedAt: car.last_scraped_at,
      categories: (catsByCar.get(car.id) || []).map((cat: any) => ({
        categoryId: cat.category_id, name: cat.name, imageUrl: cat.image_url, url: cat.url,
        subcategories: (subsByCat.get(cat.id) || []).map((sub: any) => ({
          subcategoryId: sub.subcategory_id, name: sub.name,
          imageUrl: sub.image_url, url: sub.url, diagramImageUrl: sub.diagram_image_url,
          parts: (partsBySub.get(sub.id) || []).map((p: any) => ({
            itemNo: p.item_no, partNumber: p.part_number, partNumberClean: p.part_number_clean,
            description: p.description, additionalInfo: p.additional_info,
            partDate: p.part_date, quantity: p.quantity, weight: p.weight ? parseFloat(p.weight) : null, notes: p.notes,
          })),
        })),
      })),
    }));
    await mkdir("dist", { recursive: true });
    await writeFile("dist/export-data.json", JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), cars: exportData }));
    let totalParts = 0;
    exportData.forEach((c: any) => c.categories.forEach((cat: any) => cat.subcategories.forEach((s: any) => totalParts += s.parts.length)));
    console.log(`Exported ${scrapedCars.length} cars, ${totalParts} parts to dist/export-data.json`);
    await pool.end();
  } catch (err) {
    console.error("Data export failed (non-fatal):", err);
    await pool.end();
  }
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await exportDataForDeploy();

  const exportDataExists = await readFile("dist/export-data.json", "utf-8").then(d => d).catch(() => null);

  await rm("dist", { recursive: true, force: true });

  if (exportDataExists) {
    await mkdir("dist", { recursive: true });
    await writeFile("dist/export-data.json", exportDataExists);
  }

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
