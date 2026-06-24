import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";

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
  // List ISTA/ files
  const r = await client.send(new ListObjectsV2Command({
    Bucket: cfg.bucket, Prefix: cfg.prefix + "ISTA/",
  }));
  const items = (r.Contents || []).sort((a,b) => (b.Size||0)-(a.Size||0));
  for (const o of items) {
    const gb = ((o.Size||0)/1024/1024/1024).toFixed(3);
    console.log(`${gb} GB  ${(o.Key||"").replace(cfg.prefix,"")}`);
  }
  console.log(`\n${items.length} ISTA objects`);
}
main().catch(e => { console.error(e.message); process.exit(1); });
