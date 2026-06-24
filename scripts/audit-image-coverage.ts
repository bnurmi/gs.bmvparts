import { Pool } from "pg";
import { Client as ObjectStorageClient } from "@replit/object-storage";

const os = new ObjectStorageClient();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function listKeys(prefix: string) {
  const r = await os.list({ prefix });
  if (!r.ok) throw new Error(r.error?.message);
  return new Set(r.value.map(o => o.name.replace(prefix, "")));
}

async function main() {
  const [small, big] = await Promise.all([
    listKeys("images/small/"),
    listKeys("images/big/"),
  ]);

  const r = await pool.query(`
    SELECT DISTINCT regexp_replace(image_url, '.*/(small|big)/(?:Ersatzteile)?(\\d+\\.jpg).*', '\\2') AS fname
    FROM subcategories
    WHERE image_url ~ '/img/(small|big)/(?:Ersatzteile)?\\d+\\.jpg'
  `);
  const refs: string[] = r.rows.map((x: any) => x.fname).filter((f: string) => /^\d+\.jpg$/.test(f));

  const missingSmall = refs.filter(f => !small.has(f));
  const missingBig = refs.filter(f => !big.has(f));

  console.log(`OS keys: small=${small.size}, big=${big.size}`);
  console.log(`DB referenced files: ${refs.length}`);
  console.log(`Missing small: ${missingSmall.length}`);
  console.log(`Missing big:   ${missingBig.length}`);
  if (missingSmall.length) console.log("  sample missing small:", missingSmall.slice(0, 5));
  if (missingBig.length) console.log("  sample missing big:  ", missingBig.slice(0, 5));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
