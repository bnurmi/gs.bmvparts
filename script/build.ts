import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { readFile, mkdir } from "fs/promises";
import { existsSync, rmSync } from "fs";
import { spawnSync } from "child_process";

// NOTE: Production no longer ships export-chunks or public/images inside the
// deploy artifact (they pushed the bundle past Replit's deploy size limit).
// At runtime:
//   - export-chunks/manifest are streamed from Object Storage by the
//     /api/sync-from-dev handler in server/routes.ts (see getExportFromOS).
//   - /images/* is proxied from Object Storage by the middleware in
//     server/static.ts.
// In dev, the local copies under data/ and public/images/ are still used.

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

function runPreDeployBackup() {
  const isDeploy =
    process.env.REPLIT_DEPLOYMENT === "1" ||
    process.env.PRE_DEPLOY_BACKUP === "1";
  if (!isDeploy) {
    console.log(
      "[Pre-Deploy] Skipping backup (set REPLIT_DEPLOYMENT=1 or PRE_DEPLOY_BACKUP=1 to run).",
    );
    return;
  }
  console.log("[Pre-Deploy] Running pre-deploy database backup...");
  const start = Date.now();
  const result = spawnSync("tsx", ["scripts/pre-deploy-backup.ts"], {
    stdio: "inherit",
    env: process.env,
  });
  const elapsed = Date.now() - start;
  if (result.status !== 0 || result.error) {
    // Per spec: a failed backup never blocks a deploy.
    console.error(
      `[Pre-Deploy] Backup wrapper exited non-zero after ${elapsed}ms (status=${result.status}, error=${result.error?.message ?? "none"}). Continuing with deploy.`,
    );
  } else {
    console.log(`[Pre-Deploy] Backup step finished in ${elapsed}ms.`);
  }
}

function runPreDeployHubSeo() {
  const isDeploy =
    process.env.REPLIT_DEPLOYMENT === "1" ||
    process.env.PRE_DEPLOY_HUB_SEO === "1";
  if (!isDeploy) {
    console.log(
      "[Pre-Deploy] Skipping hub SEO check (set REPLIT_DEPLOYMENT=1 or PRE_DEPLOY_HUB_SEO=1 to run).",
    );
    return;
  }
  if (process.env.SKIP_PRE_DEPLOY_HUB_SEO === "1") {
    console.warn("[Pre-Deploy] SKIP_PRE_DEPLOY_HUB_SEO=1 — skipping hub SEO gate.");
    return;
  }
  console.log("[Pre-Deploy] Running hub SEO smoke check...");
  const start = Date.now();
  const result = spawnSync("tsx", ["scripts/pre-deploy-hub-seo.ts"], {
    stdio: "inherit",
    env: process.env,
  });
  const elapsed = Date.now() - start;
  if (result.error) {
    console.error(
      `[Pre-Deploy] Hub SEO wrapper failed to launch after ${elapsed}ms (${result.error.message}). Blocking deploy.`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[Pre-Deploy] Hub SEO check FAILED after ${elapsed}ms (status=${result.status}). Blocking deploy. See log lines above for which checks failed.`,
    );
    process.exit(result.status ?? 1);
  }
  console.log(`[Pre-Deploy] Hub SEO check passed in ${elapsed}ms.`);
}

async function buildAll() {
  runPreDeployBackup();
  runPreDeployHubSeo();

  if (existsSync("dist")) {
    rmSync("dist", { recursive: true, force: true, maxRetries: 3 });
  }
  await mkdir("dist", { recursive: true });

  // No export-chunks or images are copied into dist — they live in Object
  // Storage and are streamed at runtime. See server/routes.ts (sync handler)
  // and server/static.ts (image proxy).

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
