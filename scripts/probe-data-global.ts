import { Client } from "@replit/object-storage";
const os = new Client();

async function tryKey(key: string) {
  const result = await os.list({ prefix: key });
  if (result.ok && result.value.length > 0) {
    result.value.forEach(o => {
      const gb = ((o.size||0)/1024/1024/1024).toFixed(3);
      console.log(`FOUND: ${gb} GB  ${o.name}`);
    });
  }
}

async function main() {
  // Try various prefix patterns based on the screenshot path
  const prefixes = [
    "ISTA/",
    "BMW_ISPI_ISTA-DATA_GLOBAL",
    "ISTA/BMW_ISPI_ISTA-DATA_GLOBAL",
    "bmv.parts/ISTA/",
    "replit-backup/bmv.parts/ISTA/",
    "ConWoyDb",
    "DiagDocDb",
    "SQLiteDBs/",
  ];
  
  for (const p of prefixes) {
    const r = await os.list({ prefix: p });
    if (r.ok && r.value.length > 0) {
      console.log(`\n=== prefix: "${p}" ===`);
      r.value.forEach(o => {
        const gb = ((o.size||0)/1024/1024/1024).toFixed(3);
        console.log(`  ${gb} GB  ${o.name}`);
      });
    } else {
      console.log(`prefix "${p}" → 0 results`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
