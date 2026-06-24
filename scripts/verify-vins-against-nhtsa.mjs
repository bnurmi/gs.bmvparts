// Cross-check a random sample of our VINs against NHTSA vPIC (the US gov't
// authoritative VIN decoder). If the VIN is genuinely fake, NHTSA will say
// "Manufacturer: ..." blank or non-BMW. If real, NHTSA returns Make=BMW with
// matching ModelYear and Series.
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SAMPLE_SIZE_PER_SOURCE = 10;
const sources = ['tn_mvr_backfill','marketcheck_backfill','us_used_cars_backfill','craigslist_backfill'];

async function nhtsaDecode(vin) {
  const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.Results?.[0] ?? null;
}

const summary = {};
for (const src of sources) {
  const { rows } = await pool.query(
    "SELECT vin, decoded_data->>'modelYear' AS our_year, decoded_data->>'chassis' AS our_chassis FROM vin_cache WHERE source=$1 ORDER BY random() LIMIT $2",
    [src, SAMPLE_SIZE_PER_SOURCE]
  );
  const checks = [];
  for (const r of rows) {
    const d = await nhtsaDecode(r.vin);
    const isBmw = d?.Make?.toUpperCase() === 'BMW';
    const yearMatch = d?.ModelYear === r.our_year;
    checks.push({
      vin: r.vin,
      ourYear: r.our_year, ourChassis: r.our_chassis,
      nhtsaMake: d?.Make, nhtsaYear: d?.ModelYear, nhtsaModel: d?.Model, nhtsaSeries: d?.Series,
      errorText: d?.ErrorText?.split(';')[0]?.slice(0,60),
      isBmw, yearMatch,
    });
    await new Promise(r => setTimeout(r, 80)); // rate-limit politeness
  }
  const isBmwCount = checks.filter(c => c.isBmw).length;
  const yearMatchCount = checks.filter(c => c.yearMatch).length;
  summary[src] = {
    sample: checks.length,
    confirmedBMW: `${isBmwCount}/${checks.length}`,
    yearMatches: `${yearMatchCount}/${checks.length}`,
    samples: checks,
  };
}
console.log(JSON.stringify(summary, null, 2));
await pool.end();
