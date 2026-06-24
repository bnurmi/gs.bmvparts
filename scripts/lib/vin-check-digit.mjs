// Pure-Node (.mjs) mirror of shared/vin-check-digit.ts. Kept as a separate
// file because ingest scripts may run with plain `node` (which can't import
// .ts files), not just `tsx`. The self-test at the bottom of this module
// asserts agreement with known-good and known-bad VINs at every import,
// so any silent drift from the canonical TS implementation fails loudly
// before processing a single row.

const TRANSLIT = {
  A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,
  J:1,K:2,L:3,M:4,N:5,P:7,R:9,
  S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9,
  '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
};
const WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
const VIN_ALPHABET = /^[A-HJ-NPR-Z0-9]{17}$/;

export function vinCheckDigit(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const v = TRANSLIT[vin[i]];
    if (v === undefined) return null;
    sum += v * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? "X" : String(r);
}

export function isValidVin(vin) {
  if (typeof vin !== "string" || !VIN_ALPHABET.test(vin)) return false;
  const cd = vinCheckDigit(vin);
  return cd !== null && cd === vin[8];
}

// Drift guard: known-real BMW VINs (NHTSA-confirmed) and known-bad VINs
// from cleanup-bad-checkdigit-vins.mjs output. If the constants above
// drift away from the ISO 3779 spec / shared/vin-check-digit.ts, the
// process will exit 1 immediately at module load instead of silently
// generating bad seed data.
const _GOOD = ["WBANE73597CM53613","WBA8E9C52GK646586","WBAVC93517KX59454"];
const _BAD = ["WBAGK22040DH61313","WBANU920700U35654","WBAXW129400R68101"];
for (const v of _GOOD) if (!isValidVin(v)) { console.error(`[vin-check-digit] drift: ${v} should pass`); process.exit(1); }
for (const v of _BAD)  if (isValidVin(v))  { console.error(`[vin-check-digit] drift: ${v} should fail`); process.exit(1); }
