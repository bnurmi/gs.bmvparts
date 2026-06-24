import { Client } from '@replit/object-storage';
const c = new Client();
const r = await c.list();
if (!r.ok) { console.error('list err', JSON.stringify(r.error)); process.exit(1); }
for (const o of r.value) {
  console.log(`${o.size||'?'}\t${o.name}`);
}
