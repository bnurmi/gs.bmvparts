import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { execSync } from "child_process";

const cfg = {
  endpoint: process.env.OFFSITE_BACKUP_ENDPOINT!,
  bucket: process.env.OFFSITE_BACKUP_BUCKET!,
  prefix: process.env.OFFSITE_BACKUP_PREFIX!,
  accessKeyId: process.env.OFFSITE_BACKUP_ACCESS_KEY!,
  secretAccessKey: process.env.OFFSITE_BACKUP_SECRET_KEY!,
};
const client = new S3Client({
  endpoint: cfg.endpoint, region: "us-east-1",
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  forcePathStyle: true,
});

async function downloadHead(key: string, bytes: number, dest: string) {
  const absKey = cfg.prefix + key;
  console.log(`\nDownloading first ${bytes/1024/1024}MB of ${key.split("/").pop()}...`);
  const r = await client.send(new GetObjectCommand({
    Bucket: cfg.bucket, Key: absKey, Range: `bytes=0-${bytes-1}`,
  }));
  const ws = createWriteStream(dest);
  await pipeline(r.Body as Readable, ws);
  console.log(`  → Saved to ${dest}`);
}

async function getSchema(dest: string, label: string) {
  console.log(`\n=== Schema for ${label} ===`);
  try {
    const schema = execSync(`sqlite3 "${dest}" ".schema"`, {timeout: 30000}).toString();
    console.log(schema || "(no schema output)");
  } catch (e: any) {
    console.log("Schema read failed:", e.message.slice(0, 200));
    // Try just listing tables
    try {
      const tables = execSync(`sqlite3 "${dest}" ".tables"`, {timeout: 10000}).toString();
      console.log("Tables:", tables);
    } catch (e2: any) {
      console.log("Tables read also failed:", e2.message.slice(0, 200));
    }
  }
}

const base = "ISTA/BMW_ISPI_ISTA-DATA_GLOBAL_4.59.12/ISTA/SQLiteDBs";
const MB10 = 10 * 1024 * 1024;

async function main() {
  // Download & probe all 4 files in sequence (disk constraint: need ~40MB total for slices)
  const files = [
    ["xmlvalueprimitive_OTHER.sqlite", MB10, "/tmp/xmlval_head.sqlite"],
    ["ConWoyDb.sqlite", MB10, "/tmp/conwoy_head.sqlite"],
    ["DiagDocDb.sqlite", MB10, "/tmp/diagdoc_head.sqlite"],
    ["streamdataprimitive_OTHER.sqlite", MB10, "/tmp/stream_head.sqlite"],
  ] as const;
  
  for (const [file, bytes, dest] of files) {
    try {
      await downloadHead(`${base}/${file}`, bytes, dest);
      await getSchema(dest, file);
    } catch (e: any) {
      console.error(`Error with ${file}:`, e.message);
    }
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
