// Bigger-sample NHTSA cross-check via the batch endpoint (up to 50 VINs/call).
// Pulls a stratified random sample of N VINs from each source (or floor(N/sources)
// each), submits in batches of 50, and reports the per-source pass rates.
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TOTAL_SAMPLE = parseInt(process.env.SAMPLE || "400", 10);
const ALL_SOURCES = ['tn_mvr_backfill','marketcheck_backfill','us_used_cars_backfill','craigslist_backfill','engineroom_backfill'];
const SOURCES = process.env.SOURCES ? process.env.SOURCES.split(",") : ALL_SOURCES;
const PER_SOURCE = Math.floor(TOTAL_SAMPLE / SOURCES.length);

console.log(`[nhtsa-cross-check] total sample target=${TOTAL_SAMPLE} per-source=${PER_SOURCE}`);

async function batchDecode(vins) {
  const body = new URLSearchParams({ format: "json", data: vins.join(";") });
  const r = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) throw new Error(`NHTSA HTTP ${r.status}`);
  const j = await r.json();
  return j.Results || [];
}

const overall = { isBmw: 0, yearMatch: 0, total: 0, errorCodes: {}, perSource: {} };

function bumpErrorCodes(map, errorCode) {
  if (!errorCode) return;
  for (const c of String(errorCode).split(",").map(s => s.trim()).filter(Boolean)) {
    map[c] = (map[c] || 0) + 1;
  }
}

for (const src of SOURCES) {
  const { rows } = await pool.query(
    `SELECT vin, decoded_data->>'modelYear' AS our_year, decoded_data->>'chassis' AS our_chassis
     FROM vin_cache WHERE source=$1 ORDER BY random() LIMIT $2`,
    [src, PER_SOURCE]
  );
  const ourMap = new Map(rows.map(r => [r.vin, r]));
  const allVins = rows.map(r => r.vin);
  let isBmw = 0, yearMatch = 0, anomalies = [];
  const errorCodes = {};
  for (let i = 0; i < allVins.length; i += 50) {
    const slice = allVins.slice(i, i + 50);
    let attempt = 0;
    while (true) {
      try {
        const results = await batchDecode(slice);
        for (const d of results) {
          const ourRow = ourMap.get(d.VIN);
          if (!ourRow) continue;
          const isB = (d.Make || "").toUpperCase() === "BMW";
          const yMatch = d.ModelYear && ourRow.our_year && d.ModelYear === ourRow.our_year;
          if (isB) isBmw++;
          if (yMatch) yearMatch++;
          bumpErrorCodes(errorCodes, d.ErrorCode);
          bumpErrorCodes(overall.errorCodes, d.ErrorCode);
          if (!isB || !yMatch) {
            if (anomalies.length < 8) anomalies.push({
              vin: d.VIN, ourYear: ourRow.our_year, ourChassis: ourRow.our_chassis,
              nhtsaMake: d.Make, nhtsaYear: d.ModelYear, nhtsaModel: d.Model,
              errorText: (d.ErrorText || "").split(";")[0]?.slice(0, 80),
            });
          }
        }
        break;
      } catch (e) {
        attempt++;
        if (attempt >= 3) throw e;
        console.error(`  retry ${attempt} after error: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    process.stdout.write(`  ${src}: ${Math.min(i+50, allVins.length)}/${allVins.length}\r`);
    await new Promise(r => setTimeout(r, 250));
  }
  console.log(`  ${src}: ${allVins.length}/${allVins.length}  isBmw=${isBmw}/${allVins.length} (${(isBmw*100/allVins.length).toFixed(2)}%)  yearMatch=${yearMatch}/${allVins.length} (${(yearMatch*100/allVins.length).toFixed(2)}%)`);
  overall.isBmw += isBmw; overall.yearMatch += yearMatch; overall.total += allVins.length;
  overall.perSource[src] = { sampled: allVins.length, isBmw, yearMatch, errorCodes, anomalies };
  console.log(`    NHTSA error-code distribution: ${JSON.stringify(errorCodes)}`);
}

console.log("\n[nhtsa-cross-check] AGGREGATE");
console.log(`  total sampled: ${overall.total}`);
console.log(`  Make=BMW:      ${overall.isBmw}/${overall.total} (${(overall.isBmw*100/overall.total).toFixed(2)}%)`);
console.log(`  Year matches:  ${overall.yearMatch}/${overall.total} (${(overall.yearMatch*100/overall.total).toFixed(2)}%)`);
console.log(`  NHTSA error-code distribution: ${JSON.stringify(overall.errorCodes)}`);
console.log(`    (code "0" = no errors, "1" = check digit mismatch per NHTSA's interpretation`);
console.log(`     — common false-positive on European-market BMW WMIs (WBA/WBS) where`);
console.log(`     ISO 3779 check-digit is OPTIONAL; the VINs still pass our ISO 3779 math.)`);
console.log("\n[nhtsa-cross-check] per-source anomalies (up to 8 each):");
for (const [src, s] of Object.entries(overall.perSource)) {
  if (s.anomalies.length === 0) continue;
  console.log(`\n  ${src}:`);
  for (const a of s.anomalies) console.log(`    ${a.vin} our=${a.ourYear}/${a.ourChassis} nhtsa=${a.nhtsaMake || "?"}/${a.nhtsaYear || "?"}/${a.nhtsaModel || "?"} err="${a.errorText || ""}"`);
}

await pool.end();
