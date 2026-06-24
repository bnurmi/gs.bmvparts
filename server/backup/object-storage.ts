import { Client } from "@replit/object-storage";

let _client: Client | null = null;

function client(): Client {
  if (!_client) _client = new Client();
  return _client;
}

export async function uploadBytes(key: string, bytes: Buffer): Promise<void> {
  const r = await client().uploadFromBytes(key, bytes, { compress: false });
  if (!r.ok) throw new Error(`Object storage upload failed for ${key}: ${r.error.message}`);
}

export async function uploadFromFile(key: string, srcPath: string): Promise<void> {
  const r = await client().uploadFromFilename(key, srcPath, { compress: false });
  if (!r.ok) throw new Error(`Object storage upload failed for ${key}: ${r.error.message}`);
}

export async function downloadBytes(key: string): Promise<Buffer> {
  const r = await client().downloadAsBytes(key, { decompress: false });
  if (!r.ok) throw new Error(`Object storage download failed for ${key}: ${r.error.message}`);
  return r.value[0];
}

export async function downloadToFile(key: string, destPath: string): Promise<void> {
  const r = await client().downloadToFilename(key, destPath, { decompress: false });
  if (!r.ok) throw new Error(`Object storage download failed for ${key}: ${r.error.message}`);
}

export async function listKeys(prefix: string): Promise<string[]> {
  const r = await client().list({ prefix });
  if (!r.ok) throw new Error(`Object storage list failed for ${prefix}: ${r.error.message}`);
  return r.value.map((o) => o.name);
}

export async function deleteKey(key: string): Promise<void> {
  const r = await client().delete(key, { ignoreNotFound: true });
  if (!r.ok) throw new Error(`Object storage delete failed for ${key}: ${r.error.message}`);
}

export async function exists(key: string): Promise<boolean> {
  const r = await client().exists(key);
  if (!r.ok) return false;
  return r.value;
}

export async function totalSize(prefix: string): Promise<{ count: number; bytes: number }> {
  const keys = await listKeys(prefix);
  let bytes = 0;
  for (const k of keys) {
    try {
      const buf = await downloadBytes(k);
      bytes += buf.length;
    } catch {
      // ignore individual failures so health endpoint stays usable
    }
  }
  return { count: keys.length, bytes };
}
