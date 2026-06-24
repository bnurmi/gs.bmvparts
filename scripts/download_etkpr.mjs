import { Client } from '@replit/object-storage';
import fs from 'node:fs';
const c = new Client();
const dest = 'data/etk/pricing/etkpr2604.zip';
const r = await c.downloadToFilename('etkpr2604.zip', dest);
if (!r.ok) { console.error('download err', JSON.stringify(r.error)); process.exit(1); }
const stat = fs.statSync(dest);
console.log(`Downloaded: ${dest} (${(stat.size/1024/1024).toFixed(1)} MB)`);
