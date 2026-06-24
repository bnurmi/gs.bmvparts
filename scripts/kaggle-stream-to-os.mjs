#!/usr/bin/env node
import { Client as ObjectStorageClient } from "@replit/object-storage";

const TOKEN = process.env.KAGGLE_KEY;
if (!TOKEN) { console.error("KAGGLE_KEY env var required"); process.exit(2); }
const REF = process.env.KAGGLE_REF || "austinreese/craigslist-carstrucks-data";
const OS_KEY = process.env.OS_KEY || "seed/craigslist-vehicles.zip";

const url = `https://www.kaggle.com/api/v1/datasets/download/${REF}`;
console.log(`[kaggle] GET ${url}`);
console.log(`[kaggle] -> os://${OS_KEY}`);

const t0 = Date.now();
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "BMV.parts/1.0" },
  redirect: "follow",
});
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${res.statusText}`);
  console.error((await res.text()).slice(0, 400));
  process.exit(3);
}
const total = Number(res.headers.get("content-length") || 0);
console.log(`[kaggle] HTTP ${res.status} content-length=${total} (${(total / 1e6).toFixed(1)} MB)`);

const os = new ObjectStorageClient();
const reader = res.body.getReader();
let received = 0;
let lastLog = 0;

const { Readable } = await import("stream");
const nodeStream = new Readable({
  async read() {
    try {
      const { done, value } = await reader.read();
      if (done) { this.push(null); return; }
      received += value.length;
      const now = Date.now();
      if (now - lastLog > 2000) {
        const pct = total ? ((received / total) * 100).toFixed(1) : "?";
        const mbps = (received / 1e6 / ((now - t0) / 1000)).toFixed(1);
        console.log(`  ${(received / 1e6).toFixed(1)}/${(total / 1e6).toFixed(1)} MB  ${pct}%  ${mbps} MB/s`);
        lastLog = now;
      }
      this.push(Buffer.from(value));
    } catch (err) { this.destroy(err); }
  },
});

const upload = await os.uploadFromStream(OS_KEY, nodeStream);
if (upload && upload.ok === false) {
  console.error(`OS upload failed: ${upload.error?.message}`);
  process.exit(4);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[kaggle] DONE. ${received} bytes (${(received / 1e6).toFixed(1)} MB) in ${elapsed}s -> os://${OS_KEY}`);

const head = await os.exists(OS_KEY);
console.log(`[kaggle] OS verify: exists=${head.value ?? head}`);
