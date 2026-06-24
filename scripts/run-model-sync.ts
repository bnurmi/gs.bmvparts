import { startModelScrape, getModelScrapeProgress } from "../server/model-scraper";

async function main() {
  console.log("Starting BMW model sync from bimmer.work...");
  const startPromise = startModelScrape();

  const interval = setInterval(() => {
    const p = getModelScrapeProgress();
    console.log(
      `[progress] status=${p.status} phase=${p.phase} chassis=${p.chassisCompleted}/${p.chassisDiscovered} models=${p.scraped}/${p.total} errors=${p.errors}${p.currentChassis ? ` cur=${p.currentChassis}` : ""}`,
    );
  }, 5000);

  await startPromise;
  clearInterval(interval);
  const final = getModelScrapeProgress();
  console.log("Final progress:", final);
  process.exit(final.status === "error" ? 1 : 0);
}

main().catch((e) => {
  console.error("Sync failed:", e);
  process.exit(1);
});
