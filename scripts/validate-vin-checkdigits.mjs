// VIN check-digit validation per ISO 3779 / FMVSS 565.
// Position 9 is the check digit; computed from a weighted sum of the other 16.
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TRANSLIT = {
  A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,
  J:1,K:2,L:3,M:4,N:5,P:7,R:9,
  S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9,
  '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
};
const WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];

function checkDigit(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const v = TRANSLIT[vin[i]];
    if (v === undefined) return null;
    sum += v * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? "X" : String(r);
}

function validateVin(vin) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
  const cd = checkDigit(vin);
  return cd === vin[8];
}

const sources = ['tn_mvr_backfill','marketcheck_backfill','us_used_cars_backfill','craigslist_backfill','engineroom_backfill'];
const results = {};
for (const src of sources) {
  const { rows } = await pool.query(
    "SELECT vin FROM vin_cache WHERE source=$1", [src]
  );
  let valid = 0, invalid = 0;
  const badSamples = [];
  for (const { vin } of rows) {
    if (validateVin(vin)) valid++;
    else { invalid++; if (badSamples.length < 5) badSamples.push(vin); }
  }
  results[src] = { total: rows.length, valid, invalid, pctValid: ((valid/rows.length)*100).toFixed(2)+'%', badSamples };
}
console.log(JSON.stringify(results, null, 2));
await pool.end();
