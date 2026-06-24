import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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
  const all: any[] = [];
  let token: string | undefined;
  do {
    const r = await client.send(new ListObjectsV2Command({
      Bucket: cfg.bucket, Prefix: cfg.prefix + "ISTA/",
      ContinuationToken: token,
    }));
    all.push(...(r.Contents || []));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
    process.stdout.write(`\rFetched ${all.length} objects...`);
  } while (token);
  console.log(`\nTotal ISTA objects: ${all.length}`);
  
  // Show by top-level folder
  const folders = new Map<string, {count:number, totalGB:number}>();
  for (const o of all) {
    const k = (o.Key||"").replace(cfg.prefix+"ISTA/","");
    const folder = k.split("/")[0];
    const prev = folders.get(folder) || {count:0, totalGB:0};
    folders.set(folder, {count: prev.count+1, totalGB: prev.totalGB + (o.Size||0)/1024/1024/1024});
  }
  console.log("\nTop-level folders under ISTA/:");
  for (const [f, s] of [...folders.entries()].sort((a,b) => b[1].totalGB-a[1].totalGB)) {
    console.log(`  ${s.totalGB.toFixed(3)} GB  ${f}  (${s.count} objects)`);
  }
  
  // Show large files
  const large = all.filter(o => (o.Size||0) > 100*1024*1024).sort((a,b) => (b.Size||0)-(a.Size||0));
  if (large.length > 0) {
    console.log("\nFiles > 100 MB:");
    for (const o of large) {
      const gb = ((o.Size||0)/1024/1024/1024).toFixed(3);
      console.log(`  ${gb} GB  ${(o.Key||"").replace(cfg.prefix,"")}`);
    }
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
