import fs from 'node:fs';
import pg from 'pg';
const { Client } = pg;

const lines = fs.readFileSync('/home/runner/workspace/data/etk/exports/fztyp.psv', 'utf8')
  .trim().split('\n');

const bodyMap = { Lim:'Sedan', Cab:'Convertible', Cou:'Coupe', Tou:'Touring', SAV:'SAV', SAC:'SAC', VT:'Truck', ST:'Sedan' };

const rows = lines.map(l => {
  const [typeCode, chassis, vbez, motor, kar, lenkung, getriebe, erwvbez] = l.split('|');
  return {
    typeCode: (typeCode||'').trim(),
    chassis: (chassis||'').trim(),
    modelName: (vbez||erwvbez||typeCode||'').trim(),
    engineCode: (motor||'').trim() || null,
    bodyType: bodyMap[(kar||'').trim()] || (kar||'').trim() || null
  };
}).filter(r => r.typeCode && r.chassis);

const seen = new Map();
for (const r of rows) {
  const key = `${r.chassis}|${r.typeCode}`;
  if (!seen.has(key)) seen.set(key, r);
}
const dedup = [...seen.values()];
console.log(`Deduped: ${rows.length} -> ${dedup.length} unique (chassis,type_code) pairs`);
rows.length = 0; rows.push(...dedup);

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`Importing ${rows.length} rows...`);
await client.query('DELETE FROM bmw_models');

const BATCH = 200;
let n = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const params = [];
  const placeholders = batch.map((r, j) => {
    const o = j * 5;
    params.push(r.chassis, r.typeCode, r.modelName, r.engineCode, r.bodyType);
    return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5})`;
  }).join(',');
  await client.query(
    `INSERT INTO bmw_models (chassis, type_code, model_name, engine_code, body_type) VALUES ${placeholders}`,
    params
  );
  n += batch.length;
}
console.log(`Inserted ${n} rows.`);

const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int AS count FROM bmw_models');
console.log(`Total in DB: ${count}`);
const top = await client.query("SELECT chassis, COUNT(*)::int AS n FROM bmw_models GROUP BY chassis ORDER BY n DESC LIMIT 8");
console.log('Top chassis by count:');
top.rows.forEach(r => console.log(`  ${r.chassis}: ${r.n}`));
const samples = await client.query("SELECT chassis, type_code, model_name, engine_code, body_type FROM bmw_models WHERE chassis IN ('E90','F30','G06') ORDER BY chassis, type_code LIMIT 9");
console.log('Samples:');
samples.rows.forEach(r => console.log(`  ${r.chassis} ${r.type_code} ${r.model_name} ${r.engine_code||''} ${r.body_type||''}`));

await client.end();
