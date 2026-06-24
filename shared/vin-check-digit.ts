// Canonical ISO 3779 / FMVSS 565 VIN check-digit implementation.
// Single source of truth for both server SSR/sitemap gates and the runtime
// VIN decoder. The /scripts/lib/vin-check-digit.mjs file mirrors this for
// pure-Node ingest scripts (kept in sync via the runtime self-test there).

const TRANSLIT: Record<string, number> = {
  A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,
  J:1,K:2,L:3,M:4,N:5,P:7,R:9,
  S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9,
};
const WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
const VIN_ALPHABET = /^[A-HJ-NPR-Z0-9]{17}$/;

export function vinCheckDigit(vin: string): string | null {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const n = /\d/.test(c) ? Number(c) : TRANSLIT[c];
    if (n === undefined) return null;
    sum += n * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? "X" : String(r);
}

export function isValidVin(vin: string): boolean {
  if (typeof vin !== "string") return false;
  const v = vin.toUpperCase();
  if (!VIN_ALPHABET.test(v)) return false;
  const cd = vinCheckDigit(v);
  return cd !== null && cd === v[8];
}
