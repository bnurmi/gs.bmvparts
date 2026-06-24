#!/usr/bin/env tsx
import { createPreDeployBackup } from "../server/backup/db-backup";

async function main() {
  const start = Date.now();
  try {
    const result = await createPreDeployBackup();
    if (result.ok) {
      console.log(`[Pre-Deploy] Backup #${result.log.id} verified in ${Date.now() - start}ms (key=${result.log.storageKey})`);
    } else {
      console.error(`[Pre-Deploy] Backup #${result.log.id} FAILED: ${result.error}`);
    }
  } catch (err: any) {
    console.error(`[Pre-Deploy] Backup pipeline error:`, err.message);
  }
  // Always exit 0 so deploys are never blocked
  process.exit(0);
}

main();
