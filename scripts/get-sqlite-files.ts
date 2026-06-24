import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { execSync } from "child_process";

const cfg = { endpoint: process.env.OFFSITE_BACKUP_ENDPOINT!, bucket: process.env.OFFSITE_BACKUP_BUCKET!, prefix: process.env.OFFSITE_BACKUP_PREFIX!, accessKeyId: process.env.OFFSITE_BACKUP_ACCESS_KEY!, secretAccessKey: process.env.OFFSITE_BACKUP_SECRET_KEY! };
const client = new S3Client({ endpoint: cfg.endpoint, region: "us-east-1", credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }, forcePathStyle: true });

async function downloadRange(key: string, start: number, end: number, dest: string) {
  const absKey = cfg.prefix + key;
  console.log(`Downloading bytes ${start}-${end} of ${key.split("/").pop()} → ${dest}`);
  const r = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: absKey, Range: `bytes=${start}-${end}` }));
  const ws = createWriteStream(dest);
  await pipeline(r.Body as Readable, ws);
  const { statSync } = await import("fs");
  console.log(`  Downloaded: ${(statSync(dest).size/1024/1024).toFixed(1)} MB`);
}

const base = "ISTA/BMW_ISPI_ISTA-DATA_GLOBAL_4.59.12/ISTA/SQLiteDBs";

async function getSchema(dest: string, label: string) {
  console.log(`\n=== ${label} ===`);
  try {
    // Try .schema first
    const schema = execSync(`sqlite3 "${dest}" ".schema"`, {timeout: 30000}).toString().trim();
    if (schema) { console.log(schema); return; }
  } catch {}
  try {
    // Try raw sqlite_master query - sqlite might recover page 1 even from partial file
    const rows = execSync(`sqlite3 "${dest}" "SELECT type, name, sql FROM sqlite_master LIMIT 200" 2>&1`, {timeout:30000}).toString();
    console.log(rows || "(empty)");
  } catch(e:any) { console.log("sqlite3 error:", e.message.slice(0,300)); }
}

async function main() {
  // Full download of xmlvalueprimitive (554 MB) - fits easily
  console.log("=== Downloading full xmlvalueprimitive_OTHER.sqlite (554 MB) ===");
  await downloadRange(`${base}/xmlvalueprimitive_OTHER.sqlite`, 0, 597*1024*1024, "/tmp/xmlval_full.sqlite");
  await getSchema("/tmp/xmlval_full.sqlite", "xmlvalueprimitive_OTHER.sqlite");

  // 50MB head of streamdataprimitive (page_size=32768 so 50MB = 1562 pages)  
  console.log("\n=== Downloading 50MB head of streamdataprimitive_OTHER.sqlite ===");
  await downloadRange(`${base}/streamdataprimitive_OTHER.sqlite`, 0, 50*1024*1024, "/tmp/stream_head50.sqlite");
  await getSchema("/tmp/stream_head50.sqlite", "streamdataprimitive_OTHER.sqlite (50MB head)");
}
main().catch(e => { console.error(e.message); process.exit(1); });
