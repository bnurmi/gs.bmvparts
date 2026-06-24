import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
const cfg = { endpoint: process.env.OFFSITE_BACKUP_ENDPOINT!, bucket: process.env.OFFSITE_BACKUP_BUCKET!, prefix: process.env.OFFSITE_BACKUP_PREFIX!, accessKeyId: process.env.OFFSITE_BACKUP_ACCESS_KEY!, secretAccessKey: process.env.OFFSITE_BACKUP_SECRET_KEY! };
const client = new S3Client({ endpoint: cfg.endpoint, region: "us-east-1", credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }, forcePathStyle: true });
async function getText(key: string): Promise<string> {
  const r = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: cfg.prefix + key }));
  const chunks: Buffer[] = [];
  for await (const c of r.Body as any) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf-8");
}
async function main() {
  for (const k of ["ISTA/README.txt", "ISTA/pl-PL (other also) SQLiteDBs.txt"]) {
    try { console.log(`\n=== ${k} ===\n${await getText(k)}`); } catch(e:any) { console.log(`${k}: ${e.message}`); }
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
