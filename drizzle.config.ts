import { defineConfig } from "drizzle-kit";

// Replit's publish diff-checker runs outside the dev container and cannot
// reach the container-local "helium" postgres that DATABASE_URL points to.
// PROD_DATABASE_URL is the real external connection string and is reachable
// from everywhere, so prefer it here when present.
const dbUrl = process.env.PROD_DATABASE_URL ?? process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("No database URL found. Set DATABASE_URL or PROD_DATABASE_URL.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
