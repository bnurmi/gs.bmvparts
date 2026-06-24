// Whole-DB NHTSA cross-check. Pulls SAMPLE rows at random from vin_cache
// (or the entire table if SAMPLE=ALL), submits in 50-VIN batches to vPIC's
// DecodeVINValuesBatch endpoint with throttling + retries, and writes:
//   - /tmp/nhtsa_fullscan_progress.log : human-readable progress
//   - /tmp/nhtsa_fullscan_results.json : final per-source tallies +
//                                         every NHTSA-flagged VIN
import pg from "pg";
import fs from "fs";
const { Pool } = pg;

const SAMPLE = process.env.SAMPLE || "21800";
const PROGRESS_LOG = process.env.PROGRESS_LOG || "/tmp/nhtsa_fullscan_progress.log";
const RESULTS_JSON = process.env.RESULTS_JSON || "/tmp/nhtsa_fullscan_results.json";
const BATCH_SIZE = 50;
const INTER_BATCH_MS = parseInt(process.env.INTER_BATCH_MS || "300", 10);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(PROGRESS_LOG, line);
}

fs.writeFileSync(PROGRESS_LOG, "");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

log(`SAMPLE=${SAMPLE} batch=${BATCH_SIZE} throttle=${INTER_BATCH_MS}ms`);

const rowQuery = SAMPLE === "ALL"
  ? `SELECT vin, source, decoded_data->>'modelYear' AS our_year, decoded_data->>'chassis' AS our_chassis FROM vin_cache`
  : `SELECT vin, source, decoded_data->>'modelYear' AS our_year, decoded_data->>'chassis' AS our_chassis FROM vin_cache ORDER BY random() LIMIT ${parseInt(SAMPLE, 10)}`;

log(`querying DB...`);
const { rows } = await pool.query(rowQuery);
log(`pulled ${rows.length} rows`);

const ourMap = new Map(rows.map(r => [r.vin, r]));
const allVins = rows.map(r => r.vin);

const tallies = {}; // per-source: { sampled, isBmw, yearMatch, errorCodes:{}, flaggedVins:[] }
function bumpErrorCodes(map, errorCode) {
  if (!errorCode) return;
  for (const c of String(errorCode).split(",").map(s => s.trim()).filter(Boolean)) {
    map[c] = (map[c] || 0) + 1;
  }
}
function ensure(src) {
  if (!tallies[src]) tallies[src] = { sampled: 0, isBmw: 0, yearMatch: 0, errorCodes: {}, flaggedVins: [] };
  return tallies[src];
}

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

const startedAt = Date.now();
let processed = 0;
const totalBatches = Math.ceil(allVins.length / BATCH_SIZE);

for (let b = 0; b < totalBatches; b++) {
  const slice = allVins.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
  let attempt = 0;
  let results;
  while (true) {
    try {
      results = await batchDecode(slice);
      break;
    } catch (e) {
      attempt++;
      if (attempt >= 5) {
        log(`  batch ${b+1}/${totalBatches} FAILED after 5 retries: ${e.message} — skipping`);
        results = [];
        break;
      }
      log(`  batch ${b+1}/${totalBatches} retry ${attempt} after error: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  for (const d of results) {
    const ourRow = ourMap.get(d.VIN);
    if (!ourRow) continue;
    const t = ensure(ourRow.source);
    t.sampled++;
    const isB = (d.Make || "").toUpperCase() === "BMW";
    const yMatch = d.ModelYear && ourRow.our_year && d.ModelYear === ourRow.our_year;
    if (isB) t.isBmw++;
    if (yMatch) t.yearMatch++;
    bumpErrorCodes(t.errorCodes, d.ErrorCode);
    // A VIN is "flagged" if NHTSA returns error code 1 (check digit fail),
    // 11 (incorrect vehicle type), or it isn't recognized as BMW.
    const codes = String(d.ErrorCode || "").split(",").map(s => s.trim());
    const isFlagged = !isB || codes.includes("1") || codes.includes("11") || codes.includes("400");
    if (isFlagged) {
      if (t.flaggedVins.length < 5000) {
        t.flaggedVins.push({
          vin: d.VIN, ourYear: ourRow.our_year, ourChassis: ourRow.our_chassis,
          nhtsaMake: d.Make, nhtsaYear: d.ModelYear, nhtsaModel: d.Model,
          errorCode: d.ErrorCode, errorText: (d.ErrorText || "").slice(0, 200),
        });
      }
    }
  }
  processed += slice.length;
  if (b % 20 === 0 || b === totalBatches - 1) {
    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = processed / elapsed;
    const remaining = (allVins.length - processed) / rate;
    log(`  ${processed}/${allVins.length} (${(processed * 100 / allVins.length).toFixed(1)}%) — ${rate.toFixed(1)} VIN/s — ETA ${(remaining / 60).toFixed(1)}min`);
    fs.writeFileSync(RESULTS_JSON, JSON.stringify({ status: "running", processed, total: allVins.length, tallies }, null, 2));
  }
  await new Promise(r => setTimeout(r, INTER_BATCH_MS));
}

const totalMin = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
log(`\n=== DONE in ${totalMin}min ===`);
let agg = { sampled: 0, isBmw: 0, yearMatch: 0, errorCode0: 0, flaggedTotal: 0 };
for (const [src, t] of Object.entries(tallies)) {
  const e0 = t.errorCodes["0"] || 0;
  log(`${src}: sampled=${t.sampled} isBmw=${t.isBmw}/${t.sampled} (${(t.isBmw*100/t.sampled).toFixed(2)}%) yearMatch=${t.yearMatch}/${t.sampled} (${(t.yearMatch*100/t.sampled).toFixed(2)}%) error0=${e0}/${t.sampled} (${(e0*100/t.sampled).toFixed(2)}%) flagged=${t.flaggedVins.length}`);
  agg.sampled += t.sampled; agg.isBmw += t.isBmw; agg.yearMatch += t.yearMatch; agg.errorCode0 += e0; agg.flaggedTotal += t.flaggedVins.length;
}
log(`AGGREGATE: sampled=${agg.sampled} isBmw=${agg.isBmw}/${agg.sampled} (${(agg.isBmw*100/agg.sampled).toFixed(2)}%) yearMatch=${agg.yearMatch}/${agg.sampled} (${(agg.yearMatch*100/agg.sampled).toFixed(2)}%) error0=${agg.errorCode0}/${agg.sampled} (${(agg.errorCode0*100/agg.sampled).toFixed(2)}%) flagged=${agg.flaggedTotal}`);

fs.writeFileSync(RESULTS_JSON, JSON.stringify({ status: "done", durationMin: totalMin, aggregate: agg, tallies }, null, 2));
log(`results -> ${RESULTS_JSON}`);
await pool.end();
