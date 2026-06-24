import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
const cfg = { endpoint: process.env.OFFSITE_BACKUP_ENDPOINT!, bucket: process.env.OFFSITE_BACKUP_BUCKET!, prefix: process.env.OFFSITE_BACKUP_PREFIX!, accessKeyId: process.env.OFFSITE_BACKUP_ACCESS_KEY!, secretAccessKey: process.env.OFFSITE_BACKUP_SECRET_KEY! };
const client = new S3Client({ endpoint: cfg.endpoint, region: "us-east-1", credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }, forcePathStyle: true });
async function main() {
  const r = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.prefix + "ISTA/BMW_ISPI_ISTA-BLP_4.59.10/psdzdata/extLibs/" }));
  const items = (r.Contents || []).sort((a,b) => (b.Size||0)-(a.Size||0));
  console.log("extLibs contents:");
  for (const o of items) {
    const mb = ((o.Size||0)/1024/1024).toFixed(1);
    console.log(`  ${mb} MB  ${(o.Key||"").replace(cfg.prefix,"")}`);
  }
  // Also check for cseq.xml files to understand chassis list
  const r2 = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.prefix + "ISTA/BMW_ISPI_ISTA-BLP_4.59.10/psdzdata/kiswb/", Delimiter: "/" }));
  console.log("\nKIS chassis groups (from kiswb/):");
  for (const p of (r2.CommonPrefixes || [])) {
    const chassis = (p.Prefix||"").replace(cfg.prefix+"ISTA/BMW_ISPI_ISTA-BLP_4.59.10/psdzdata/kiswb/","").replace("/","");
    console.log(`  ${chassis}`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
