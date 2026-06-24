import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

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

async function main() {
  // List DATA_GLOBAL SQLite files specifically
  const r = await client.send(new ListObjectsV2Command({
    Bucket: cfg.bucket, Prefix: cfg.prefix + "ISTA/BMW_ISPI_ISTA-DATA_GLOBAL",
  }));
  const items = (r.Contents || []).sort((a,b) => (b.Size||0)-(a.Size||0));
  console.log("DATA_GLOBAL objects:");
  for (const o of items) {
    const gb = ((o.Size||0)/1024/1024/1024).toFixed(3);
    const logical = (o.Key||"").replace(cfg.prefix,"");
    console.log(`  ${gb} GB  ${logical}`);
  }
  console.log(`\nTotal: ${items.length}`);
  
  if (items.length === 0) {
    // Try broader search
    console.log("\nTrying broader SQLite search...");
    const r2 = await client.send(new ListObjectsV2Command({
      Bucket: cfg.bucket, Prefix: cfg.prefix + "ISTA/",
    }));
    const sqliteFiles = (r2.Contents || []).filter(o => o.Key?.includes(".sqlite"));
    sqliteFiles.sort((a,b) => (b.Size||0)-(a.Size||0));
    for (const o of sqliteFiles) {
      const gb = ((o.Size||0)/1024/1024/1024).toFixed(3);
      console.log(`  ${gb} GB  ${(o.Key||"").replace(cfg.prefix,"")}`);
    }
    console.log(`SQLite files found: ${sqliteFiles.length}`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
