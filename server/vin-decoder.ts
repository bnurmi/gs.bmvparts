const BMW_WMI: Record<string, { manufacturer: string; division: string }> = {
  WBA: { manufacturer: "BMW AG", division: "Standard" },
  WBS: { manufacturer: "BMW M GmbH", division: "M Division" },
  WBY: { manufacturer: "BMW", division: "BMW i / Electrified" },
  WBX: { manufacturer: "BMW AG", division: "Standard" },
  "5UX": { manufacturer: "BMW Manufacturing (USA)", division: "SAV/SAC (X Models)" },
  "5UJ": { manufacturer: "BMW Manufacturing (USA)", division: "SAV/SAC (X Models)" },
  "5UM": { manufacturer: "BMW M GmbH (USA)", division: "M Division (USA)" },
  "4US": { manufacturer: "BMW Manufacturing (USA)", division: "SAV/SAC" },
  "7LA": { manufacturer: "BMW Brilliance (China)", division: "Joint Venture" },
  "7FC": { manufacturer: "BMW Brilliance (China)", division: "Joint Venture" },
  WBAM: { manufacturer: "BMW Motorrad", division: "Motorcycles" },
  WB1: { manufacturer: "BMW Motorrad", division: "Motorcycles" },
  WB3: { manufacturer: "BMW Motorrad", division: "Motorcycles" },
};

const MODEL_YEAR_CODES: Record<string, number> = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016,
  H: 2017, J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023,
  R: 2024, S: 2025, T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  "1": 2001, "2": 2002, "3": 2003, "4": 2004, "5": 2005,
  "6": 2006, "7": 2007, "8": 2008, "9": 2009, "0": 2000,
};

// Approximate production year ranges per chassis used to disambiguate the
// 30-year VIN year-code cycle. Ranges are intentionally generous (a year on
// either side) so model-year/calendar-year skew does not push valid VINs out.
const CHASSIS_YEAR_RANGES: Record<string, [number, number]> = {
  E53: [1999, 2006],
  E60: [2003, 2010], E61: [2003, 2010],
  E70: [2006, 2013], E71: [2008, 2014],
  E82: [2007, 2013], E87: [2004, 2011], E88: [2007, 2013],
  E83: [2003, 2010], E84: [2009, 2015],
  E90: [2005, 2011], E91: [2005, 2012], E92: [2006, 2013], E93: [2006, 2013],
  F01: [2008, 2015],
  F10: [2010, 2017], F11: [2010, 2017],
  F12: [2011, 2018], F13: [2011, 2018],
  F15: [2013, 2018], F16: [2014, 2019],
  F20: [2011, 2019], F21: [2011, 2019],
  F22: [2013, 2021], F23: [2014, 2021],
  F25: [2010, 2017], F26: [2014, 2018],
  F30: [2011, 2020], F31: [2012, 2020], F32: [2013, 2020], F33: [2013, 2020], F34: [2013, 2020], F36: [2014, 2020],
  F39: [2017, 2026],
  F40: [2019, 2026],
  F44: [2020, 2026],
  F48: [2015, 2022],
  F80: [2014, 2018], F82: [2014, 2020], F83: [2014, 2020], F85: [2014, 2018], F86: [2014, 2019], F87: [2015, 2021], F87N: [2018, 2021],
  F90: [2017, 2024],
  F06: [2012, 2018],
  F95: [2019, 2026], F96: [2019, 2026], F97: [2019, 2026], F98: [2019, 2026],
  G01: [2017, 2026], G02: [2018, 2026],
  G05: [2018, 2026], G06: [2019, 2026], G07: [2018, 2026],
  G11: [2015, 2022], G12: [2015, 2022],
  G14: [2018, 2026], G15: [2018, 2026], G16: [2018, 2026],
  G20: [2018, 2026], G21: [2019, 2026], G22: [2020, 2026], G23: [2020, 2026],
  G29: [2018, 2026],
  G30: [2017, 2023], G31: [2017, 2023], G32: [2017, 2024],
  G42: [2021, 2026],
  G70: [2022, 2026],
  G80: [2020, 2026], G81: [2022, 2026], G82: [2020, 2026], G83: [2021, 2026], G87: [2022, 2026],
  // 2026-04-22 — added with engineroom salvage feed VDS patterns
  G20N: [2022, 2026], G21N: [2022, 2026], G22N: [2023, 2026], G23N: [2023, 2026],
  G42N: [2025, 2026],
  G01N: [2021, 2026], G02N: [2022, 2026],
  G05N: [2024, 2026], G06N: [2024, 2026], G07N: [2023, 2026],
  G30N: [2017, 2024],
  G60: [2024, 2026], G61: [2024, 2026], G68: [2024, 2026],
  G09: [2022, 2026],
  G90: [2025, 2026],
  G26: [2022, 2026], G08: [2025, 2027],
  U10: [2024, 2026], U11: [2022, 2026],
  F70: [2024, 2026],
  I20: [2021, 2026],
};

function disambiguateModelYear(yearCode: string, chassis: string | null): number | null {
  const base = MODEL_YEAR_CODES[yearCode];
  if (base === undefined) return null;
  if (!chassis) {
    // Without a chassis we cannot disambiguate the SAE 30-year cycle. The
    // base mapping returns the 1980-2009 reading; for any code whose base
    // year falls before 2010 the alternative (base + 30 = 2010-2039) is
    // typically the correct one for any BMW VIN we can plausibly receive,
    // but we have no way to choose. Return null instead of guessing —
    // showing "Unknown" is more honest than picking 2000 vs 2030.
    if (base < 2010) return null;
    return base;
  }
  // If the chassis has no entry but ends in 'N' (LCI suffix), fall back to the
  // base chassis range. This covers all LCI variants that share their
  // production window with the base chassis (e.g. F87N → F87 [2015,2021]).
  let range = CHASSIS_YEAR_RANGES[chassis];
  if (!range && chassis.endsWith("N")) {
    range = CHASSIS_YEAR_RANGES[chassis.slice(0, -1)];
  }
  if (!range) return base;
  const [start, end] = range;
  // Standard SAE 30-year cycle. For year code '0', the SAE standard does not
  // assign a year (NHTSA flags '0' as invalid). BMW AG uses '0' as a
  // non-standard extension for model year 2020 on some European-market VINs
  // (e.g. WBA VINs like WBACW02020LB41790 — G07 X7 M50dX). Adding 2020 as
  // an additional candidate allows the chassis range to disambiguate correctly
  // without affecting other year codes or chassis.
  const candidates = yearCode === "0"
    ? [base - 30, base, 2020, base + 30]
    : [base - 30, base, base + 30];
  const inRange = candidates.find((y) => y >= start && y <= end);
  if (inRange !== undefined) {
    // Year code '0' is BMW's non-standard 2020 extension. For chassis whose
    // production window extends well past 2020 (end > 2021), returning 2020
    // with false confidence would suppress NHTSA/SOP enrichment for 2021+
    // builds (e.g. G80 M3, G82 M4). Return null so needNhtsa fires and the
    // bimmer.work startOfProduction value corrects the year on first decode.
    // Short-run chassis entirely at 2020 (end ≤ 2021) are safe to return 2020.
    if (yearCode === "0" && inRange === 2020 && end > 2021) return null;
    return inRange;
  }
  // No 30-year cycle of this code lands in the chassis's production window.
  // This is common for European-market BMWs whose position-10 character
  // does not follow the SAE year encoding. Returning null is more honest
  // than guessing — the UI can show "Unknown" and bimmer.work enrichment
  // can supply the real Start-of-Production date.
  return null;
}

const BMW_PLANTS: Record<string, { city: string; country: string }> = {
  A: { city: "Munich (Milbertshofen)", country: "Germany" },
  B: { city: "Dingolfing", country: "Germany" },
  C: { city: "Rosslyn", country: "South Africa" },
  D: { city: "Munich", country: "Germany" },
  E: { city: "Regensburg", country: "Germany" },
  F: { city: "Graz (Magna Steyr)", country: "Austria" },
  G: { city: "Graz (Magna Steyr)", country: "Austria" },
  H: { city: "Spartanburg", country: "USA" },
  J: { city: "Spartanburg", country: "USA" },
  K: { city: "Leipzig", country: "Germany" },
  L: { city: "Spartanburg", country: "USA" },
  M: { city: "Munich", country: "Germany" },
  N: { city: "Nedcar (Born)", country: "Netherlands" },
  P: { city: "Spartanburg", country: "USA" },
  R: { city: "Goodwood", country: "United Kingdom" },
  S: { city: "Shenyang", country: "China" },
  T: { city: "Tiexi (Shenyang)", country: "China" },
  U: { city: "Dadong (Shenyang)", country: "China" },
  V: { city: "Leipzig", country: "Germany" },
  W: { city: "Graz (Magna Steyr)", country: "Austria" },
};

interface BmwModelPattern {
  chassis: string;
  series: string;
  generation: string;
  bodyType: string;
  modelName: string;
  engine?: string;
  driveType?: string;
}

export const BMW_VDS_PATTERNS: Record<string, BmwModelPattern> = {
  "73AK": { chassis: "G80", series: "3 Series", generation: "G80", bodyType: "Sedan", modelName: "M3" },
  "73AL": { chassis: "G80", series: "3 Series", generation: "G80", bodyType: "Sedan", modelName: "M3 Competition" },
  "73AM": { chassis: "G80", series: "3 Series", generation: "G80", bodyType: "Sedan", modelName: "M3 Competition xDrive", driveType: "AWD" },
  "12GB": { chassis: "G81", series: "3 Series", generation: "G81", bodyType: "Touring (5 Doors)", modelName: "M3 Competition M xDrive", driveType: "AWD" },
  "12GA": { chassis: "G81", series: "3 Series", generation: "G81", bodyType: "Touring (5 Doors)", modelName: "M3 Competition Touring", driveType: "AWD" },
  "83CM": { chassis: "G82", series: "4 Series", generation: "G82", bodyType: "Coupe", modelName: "M4" },
  "83CN": { chassis: "G82", series: "4 Series", generation: "G82", bodyType: "Coupe", modelName: "M4 Competition" },
  "83CP": { chassis: "G82", series: "4 Series", generation: "G82", bodyType: "Coupe", modelName: "M4 Competition xDrive", driveType: "AWD" },
  "83DM": { chassis: "G83", series: "4 Series", generation: "G83", bodyType: "Convertible", modelName: "M4 Competition Convertible" },
  "83DN": { chassis: "G83", series: "4 Series", generation: "G83", bodyType: "Convertible", modelName: "M4 Competition xDrive Convertible", driveType: "AWD" },
  "53CM": { chassis: "F97", series: "X3", generation: "F97", bodyType: "SAV", modelName: "X3 M" },
  "53CN": { chassis: "F97", series: "X3", generation: "F97", bodyType: "SAV", modelName: "X3 M Competition" },
  "53DM": { chassis: "F98", series: "X4", generation: "F98", bodyType: "SAC", modelName: "X4 M" },
  "53DN": { chassis: "F98", series: "X4", generation: "F98", bodyType: "SAC", modelName: "X4 M Competition" },
  "DN9C": { chassis: "F87", series: "2 Series", generation: "F87", bodyType: "Coupe", modelName: "M2" },
  "DN9E": { chassis: "F87", series: "2 Series", generation: "F87", bodyType: "Coupe", modelName: "M2 Competition" },
  "2U72": { chassis: "F87", series: "2 Series", generation: "F87", bodyType: "Coupe", modelName: "M2 Competition" },
  "AH5V": { chassis: "G87", series: "2 Series", generation: "G87", bodyType: "Coupe", modelName: "M2" },
  "12DM": { chassis: "G87", series: "2 Series", generation: "G87", bodyType: "Coupe", modelName: "M2" },
  "22DM": { chassis: "G87", series: "2 Series", generation: "G87", bodyType: "Coupe", modelName: "M2" },
  "42AY": { chassis: "G80", series: "3 Series", generation: "G80", bodyType: "Sedan", modelName: "M3 Competition xDrive", driveType: "AWD" },
  "52AY": { chassis: "G80", series: "3 Series", generation: "G80", bodyType: "Sedan", modelName: "M3 Competition xDrive", driveType: "AWD" },
  "32HJ": { chassis: "G80", series: "3 Series", generation: "G80", bodyType: "Sedan", modelName: "M3" },
  "62AY": { chassis: "G81", series: "3 Series", generation: "G81", bodyType: "Touring (5 Doors)", modelName: "M3 Competition Touring", driveType: "AWD" },
  "22GB": { chassis: "G81", series: "3 Series", generation: "G81", bodyType: "Touring (5 Doors)", modelName: "M3 Competition Touring", driveType: "AWD" },
  "42AZ": { chassis: "G82", series: "4 Series", generation: "G82", bodyType: "Coupe", modelName: "M4 Competition xDrive", driveType: "AWD" },
  "32HK": { chassis: "G82", series: "4 Series", generation: "G82", bodyType: "Coupe", modelName: "M4" },
  "82CH": { chassis: "F90", series: "5 Series", generation: "F90", bodyType: "Sedan", modelName: "M5 Competition" },
  "82GV": { chassis: "G90", series: "5 Series", generation: "G90", bodyType: "Sedan", modelName: "M5" },
  "JU02": { chassis: "F95", series: "X5", generation: "F95", bodyType: "SAV", modelName: "X5 M Competition" },
  "CY02": { chassis: "F96", series: "X6", generation: "F96", bodyType: "SAC", modelName: "X6 M Competition" },
  // Engineroom partsonline import 2026-04-22 — gaps in bmw_models DB
  "12AV": { chassis: "G22", series: "4 Series", generation: "G22", bodyType: "Coupe", modelName: "420i" },
  "NZ32": { chassis: "E60N", series: "5 Series", generation: "E60N", bodyType: "Sedan", modelName: "523i" },
  "62EF": { chassis: "U11", series: "X1", generation: "U11", bodyType: "SAV", modelName: "iX1 xDrive30" },
  // Engineroom salvage feed import 2026-04-22 — model labels confirm chassis
  "52DC": { chassis: "G60", series: "5 Series", generation: "G60", bodyType: "Sedan", modelName: "5 Series" },
  "50FF": { chassis: "G20N", series: "3 Series", generation: "G20N", bodyType: "Sedan", modelName: "320i" },
  "60FF": { chassis: "G20N", series: "3 Series", generation: "G20N", bodyType: "Sedan", modelName: "330i" },
  "42FF": { chassis: "G20N", series: "3 Series", generation: "G20N", bodyType: "Sedan", modelName: "3 Series" },
  "12GE": { chassis: "F70", series: "1 Series", generation: "F70", bodyType: "Hatchback", modelName: "118" },
  "22GE": { chassis: "F70", series: "1 Series", generation: "F70", bodyType: "Hatchback", modelName: "M135 xDrive", driveType: "AWD" },
  "42AW": { chassis: "G26", series: "i4", generation: "G26", bodyType: "Gran Coupe", modelName: "i4 eDrive35" },
  "56DP": { chassis: "G01N", series: "X3", generation: "G01N", bodyType: "SAV", modelName: "X3" },
  "86DP": { chassis: "G01N", series: "X3", generation: "G01N", bodyType: "SAV", modelName: "X3" },
  "32DT": { chassis: "G02N", series: "X4", generation: "G02N", bodyType: "SAC", modelName: "X4 xDrive30i" },
  "12DT": { chassis: "G02N", series: "X4", generation: "G02N", bodyType: "SAC", modelName: "X4" },
  "42DU": { chassis: "G08", series: "iX3", generation: "G08", bodyType: "SAV", modelName: "iX3" },
  "52EE": { chassis: "U11", series: "X1", generation: "U11", bodyType: "SAV", modelName: "X1 xDrive20i", driveType: "AWD" },
  "22EE": { chassis: "U11", series: "X1", generation: "U11", bodyType: "SAV", modelName: "X1" },
  "22EU": { chassis: "G05N", series: "X5", generation: "G05N", bodyType: "SAV", modelName: "X5" },
  "12EV": { chassis: "G05N", series: "X5", generation: "G05N", bodyType: "SAV", modelName: "X5" },
  "22EN": { chassis: "G07N", series: "X7", generation: "G07N", bodyType: "SAV", modelName: "X7 xDrive40d" },
  "12AW": { chassis: "G22N", series: "4 Series", generation: "G22N", bodyType: "Coupe", modelName: "4 Series" },
  "7L32": { chassis: "F40", series: "1 Series", generation: "F40", bodyType: "Hatchback", modelName: "128ti" },
  "72GM": { chassis: "U10", series: "iX2", generation: "U10", bodyType: "SAC", modelName: "iX2 xDrive30", driveType: "AWD" },
  "52GM": { chassis: "U10", series: "iX2", generation: "U10", bodyType: "SAC", modelName: "iX2" },
  "42GM": { chassis: "U10", series: "X2", generation: "U10", bodyType: "SAC", modelName: "X2" },
  "22CM": { chassis: "G42N", series: "2 Series", generation: "G42N", bodyType: "Coupe", modelName: "2 Series" },
  "12CM": { chassis: "G42", series: "2 Series", generation: "G42", bodyType: "Coupe", modelName: "2 Series" },
  "62GG": { chassis: "G42N", series: "2 Series", generation: "G42N", bodyType: "Coupe", modelName: "2 Series" },
  "22CS": { chassis: "G09", series: "XM", generation: "G09", bodyType: "SAV", modelName: "XM Label" },
  "42HK": { chassis: "G82", series: "4 Series", generation: "G82", bodyType: "Coupe", modelName: "M4 CS" },
  "12BK": { chassis: "G30N", series: "5 Series", generation: "G30N", bodyType: "Sedan", modelName: "5 Series" },
  "12CF": { chassis: "I20", series: "iX", generation: "I20", bodyType: "SAV", modelName: "iX xDrive40" },
  "33AK": { chassis: "G20", series: "3 Series", generation: "G20", bodyType: "Sedan", modelName: "330i" },
  "33BK": { chassis: "G20", series: "3 Series", generation: "G20", bodyType: "Sedan", modelName: "330i xDrive", driveType: "AWD" },
  "33AH": { chassis: "G20", series: "3 Series", generation: "G20", bodyType: "Sedan", modelName: "330e" },
  "33AG": { chassis: "G20", series: "3 Series", generation: "G20", bodyType: "Sedan", modelName: "320i" },
  "33BG": { chassis: "G20", series: "3 Series", generation: "G20", bodyType: "Sedan", modelName: "320i xDrive", driveType: "AWD" },
  "33AJ": { chassis: "G20", series: "3 Series", generation: "G20", bodyType: "Sedan", modelName: "M340i" },
  "33BJ": { chassis: "G20", series: "3 Series", generation: "G20", bodyType: "Sedan", modelName: "M340i xDrive", driveType: "AWD" },
  "53BH": { chassis: "G01", series: "X3", generation: "G01", bodyType: "SAV", modelName: "X3 xDrive30i", driveType: "AWD" },
  "53AH": { chassis: "G01", series: "X3", generation: "G01", bodyType: "SAV", modelName: "X3 sDrive30i", driveType: "RWD" },
  "63BN": { chassis: "G05", series: "X5", generation: "G05", bodyType: "SAV", modelName: "X5 xDrive40i", driveType: "AWD" },
  "63BG": { chassis: "G05", series: "X5", generation: "G05", bodyType: "SAV", modelName: "X5 xDrive45e", driveType: "AWD" },
  "83BH": { chassis: "G06", series: "X6", generation: "G06", bodyType: "SAC", modelName: "X6 xDrive40i", driveType: "AWD" },
  "13AK": { chassis: "F40", series: "1 Series", generation: "F40", bodyType: "Hatchback", modelName: "128ti" },
  "13BK": { chassis: "F40", series: "1 Series", generation: "F40", bodyType: "Hatchback", modelName: "M135i xDrive", driveType: "AWD" },
  "23AH": { chassis: "G42", series: "2 Series", generation: "G42", bodyType: "Coupe", modelName: "230i" },
  "23BJ": { chassis: "G42", series: "2 Series", generation: "G42", bodyType: "Coupe", modelName: "M240i xDrive", driveType: "AWD" },
  "43AN": { chassis: "G22", series: "4 Series", generation: "G22", bodyType: "Coupe", modelName: "430i" },
  "43BN": { chassis: "G22", series: "4 Series", generation: "G22", bodyType: "Coupe", modelName: "430i xDrive", driveType: "AWD" },
  "43AJ": { chassis: "G22", series: "4 Series", generation: "G22", bodyType: "Coupe", modelName: "M440i" },
  "43BJ": { chassis: "G22", series: "4 Series", generation: "G22", bodyType: "Coupe", modelName: "M440i xDrive", driveType: "AWD" },
  "53CK": { chassis: "F95", series: "X5", generation: "F95", bodyType: "SAV", modelName: "X5 M" },
  "53CL": { chassis: "F95", series: "X5", generation: "F95", bodyType: "SAV", modelName: "X5 M Competition" },
  "53DK": { chassis: "F96", series: "X6", generation: "F96", bodyType: "SAC", modelName: "X6 M" },
  "53DL": { chassis: "F96", series: "X6", generation: "F96", bodyType: "SAC", modelName: "X6 M Competition" },
  "DN5E": { chassis: "F80", series: "3 Series", generation: "F80", bodyType: "Sedan", modelName: "M3" },
  "EH5V": { chassis: "F82", series: "4 Series", generation: "F82", bodyType: "Coupe", modelName: "M4" },
  "EH5W": { chassis: "F82", series: "4 Series", generation: "F82", bodyType: "Coupe", modelName: "M4 GTS" },
  "EH9V": { chassis: "F83", series: "4 Series", generation: "F83", bodyType: "Convertible", modelName: "M4 Convertible" },
  "FE5V": { chassis: "F90", series: "5 Series", generation: "F90", bodyType: "Sedan", modelName: "M5" },
  "FE5W": { chassis: "F90", series: "5 Series", generation: "F90", bodyType: "Sedan", modelName: "M5 Competition" },
  "CY5V": { chassis: "F06", series: "6 Series", generation: "F06", bodyType: "Gran Coupe", modelName: "M6 Gran Coupe" },

  "FR72": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "535i", driveType: "RWD" },
  "FR92": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "535i xDrive", driveType: "AWD" },
  "FP02": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "528i" },
  "FP12": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "528i xDrive", driveType: "AWD" },
  "FN52": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "550i" },
  "FN62": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "550i xDrive", driveType: "AWD" },
  "FW31": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "525d" },
  "FW51": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "530d" },
  "FW71": { chassis: "F10", series: "5 Series", generation: "F10", bodyType: "Sedan", modelName: "535d" },
  "MS92": { chassis: "F11", series: "5 Series", generation: "F11", bodyType: "Touring (5 Doors)", modelName: "535i xDrive Touring", driveType: "AWD" },
  "MR72": { chassis: "F11", series: "5 Series", generation: "F11", bodyType: "Touring (5 Doors)", modelName: "535i Touring" },

  "1J12": { chassis: "F22", series: "2 Series", generation: "F22", bodyType: "Coupe (2 Doors)", modelName: "220i" },
  "1A11": { chassis: "F20", series: "1 Series", generation: "F20", bodyType: "Hatchback (5 Doors)", modelName: "116i" },
  "1A21": { chassis: "F20", series: "1 Series", generation: "F20", bodyType: "Hatchback (5 Doors)", modelName: "118i" },
  "1A41": { chassis: "F20", series: "1 Series", generation: "F20", bodyType: "Hatchback (5 Doors)", modelName: "125i" },
  "1B11": { chassis: "F21", series: "1 Series", generation: "F21", bodyType: "Hatchback (3 Doors)", modelName: "116i" },
  "1B21": { chassis: "F21", series: "1 Series", generation: "F21", bodyType: "Hatchback (3 Doors)", modelName: "118i" },
  "1C51": { chassis: "F20", series: "1 Series", generation: "F20", bodyType: "Hatchback (5 Doors)", modelName: "M135i" },

  "3A16": { chassis: "F30", series: "3 Series", generation: "F30", bodyType: "Sedan", modelName: "320i" },
  "3B16": { chassis: "F30", series: "3 Series", generation: "F30", bodyType: "Sedan", modelName: "320i xDrive", driveType: "AWD" },
  "3A56": { chassis: "F30", series: "3 Series", generation: "F30", bodyType: "Sedan", modelName: "328i" },
  "3B56": { chassis: "F30", series: "3 Series", generation: "F30", bodyType: "Sedan", modelName: "328i xDrive", driveType: "AWD" },
  "3D56": { chassis: "F30", series: "3 Series", generation: "F30", bodyType: "Sedan", modelName: "335i" },
  "3C56": { chassis: "F30", series: "3 Series", generation: "F30", bodyType: "Sedan", modelName: "335i xDrive", driveType: "AWD" },
  "8E16": { chassis: "F31", series: "3 Series", generation: "F31", bodyType: "Touring (5 Doors)", modelName: "320i Touring" },
  "8F16": { chassis: "F31", series: "3 Series", generation: "F31", bodyType: "Touring (5 Doors)", modelName: "320i xDrive Touring", driveType: "AWD" },
  "8N56": { chassis: "F31", series: "3 Series", generation: "F31", bodyType: "Touring (5 Doors)", modelName: "328i Touring" },
  "8P56": { chassis: "F31", series: "3 Series", generation: "F31", bodyType: "Touring (5 Doors)", modelName: "328i xDrive Touring", driveType: "AWD" },

  "3C32": { chassis: "F32", series: "4 Series", generation: "F32", bodyType: "Coupe", modelName: "428i" },
  "3D52": { chassis: "F32", series: "4 Series", generation: "F32", bodyType: "Coupe", modelName: "435i" },
  "4A92": { chassis: "F33", series: "4 Series", generation: "F33", bodyType: "Convertible", modelName: "428i Convertible" },
  "4B12": { chassis: "F33", series: "4 Series", generation: "F33", bodyType: "Convertible", modelName: "435i Convertible" },

  "VR91": { chassis: "E90", series: "3 Series", generation: "E90", bodyType: "Sedan", modelName: "328i" },
  "VB91": { chassis: "E90", series: "3 Series", generation: "E90", bodyType: "Sedan", modelName: "328i xDrive", driveType: "AWD" },
  // PM91/PN91 are LCI-only (335i with N55 from MY2010+); realoem maps them to E90N.
  "PM91": { chassis: "E90N", series: "3 Series", generation: "E90N", bodyType: "Sedan", modelName: "335i" },
  "PN91": { chassis: "E90N", series: "3 Series", generation: "E90N", bodyType: "Sedan", modelName: "335i xDrive", driveType: "AWD" },
  "VS91": { chassis: "E91", series: "3 Series", generation: "E91", bodyType: "Touring (5 Doors)", modelName: "328i Touring" },
  "WB91": { chassis: "E92", series: "3 Series", generation: "E92", bodyType: "Coupe", modelName: "328i Coupe" },
  // KG91 is the LCI E92 M3 (S65). Pre-LCI E92 M3 used WD92 / KE91. Realoem treats KG91 as E92N.
  "KG91": { chassis: "E92N", series: "3 Series", generation: "E92N", bodyType: "Coupe", modelName: "M3 Coupe" },
  "WL91": { chassis: "E93", series: "3 Series", generation: "E93", bodyType: "Convertible", modelName: "328i Convertible" },
  "WM91": { chassis: "E93", series: "3 Series", generation: "E93", bodyType: "Convertible", modelName: "335i Convertible" },

  // NV93 (535xi) is LCI-only — appeared with N54 in MY2008+. Realoem identifier: E60N.
  "NV93": { chassis: "E60N", series: "5 Series", generation: "E60N", bodyType: "Sedan", modelName: "535xi", driveType: "AWD" },
  "NW93": { chassis: "E60", series: "5 Series", generation: "E60", bodyType: "Sedan", modelName: "535i" },
  "NB33": { chassis: "E60", series: "5 Series", generation: "E60", bodyType: "Sedan", modelName: "550i" },

  "ZW31": { chassis: "E83", series: "X3", generation: "E83", bodyType: "SAV", modelName: "X3 xDrive28i", driveType: "AWD" },
  "ZW51": { chassis: "E83", series: "X3", generation: "E83", bodyType: "SAV", modelName: "X3 xDrive30i", driveType: "AWD" },
  "PJ91": { chassis: "F25", series: "X3", generation: "F25", bodyType: "SAV", modelName: "X3 xDrive28i", driveType: "AWD" },
  "PK91": { chassis: "F25", series: "X3", generation: "F25", bodyType: "SAV", modelName: "X3 xDrive35i", driveType: "AWD" },

  "FE41": { chassis: "E70", series: "X5", generation: "E70", bodyType: "SAV", modelName: "X5 xDrive35i", driveType: "AWD" },
  "FE81": { chassis: "E70", series: "X5", generation: "E70", bodyType: "SAV", modelName: "X5 xDrive50i", driveType: "AWD" },
  "GZ41": { chassis: "F15", series: "X5", generation: "F15", bodyType: "SAV", modelName: "X5 xDrive35i", driveType: "AWD" },
  "KR41": { chassis: "F15", series: "X5", generation: "F15", bodyType: "SAV", modelName: "X5 xDrive50i", driveType: "AWD" },

  "FG41": { chassis: "E71", series: "X6", generation: "E71", bodyType: "SAC", modelName: "X6 xDrive35i", driveType: "AWD" },
  "FG81": { chassis: "E71", series: "X6", generation: "E71", bodyType: "SAC", modelName: "X6 xDrive50i", driveType: "AWD" },

  // UE71/UF71 are LCI E87 (118i/120i with N46N from MY2007+). Realoem identifier: E87N.
  "UE71": { chassis: "E87N", series: "1 Series", generation: "E87N", bodyType: "Hatchback (5 Doors)", modelName: "118i" },
  "UF71": { chassis: "E87N", series: "1 Series", generation: "E87N", bodyType: "Hatchback (5 Doors)", modelName: "120i" },
  "UC71": { chassis: "E82", series: "1 Series", generation: "E82", bodyType: "Coupe", modelName: "128i Coupe" },
  "UC91": { chassis: "E82", series: "1 Series", generation: "E82", bodyType: "Coupe", modelName: "135i Coupe" },
};

const BMW_ENGINE_FAMILIES: Record<string, string> = {
  S58: "S58 3.0L Twin-Turbo I6",
  S55: "S55 3.0L Twin-Turbo I6",
  S63: "S63 4.4L Twin-Turbo V8",
  N55: "N55 3.0L TwinScroll Turbo I6",
  B58: "B58 3.0L TwinScroll Turbo I6",
  B48: "B48 2.0L Turbo I4",
  B46: "B46 2.0L Turbo I4",
  N63: "N63 4.4L Twin-Turbo V8",
  N20: "N20 2.0L Turbo I4",
  S54: "S54 3.2L NA I6",
  S65: "S65 4.0L NA V8",
  N54: "N54 3.0L Twin-Turbo I6",
};

// LCI (Life Cycle Impulse / mid-cycle facelift) thresholds. For a chassis whose
// catalog identifier splits into a base row and a "...N" LCI row, the LCI row
// applies from this model year onward. Used by the matcher to prefer the
// year-correct row when both exist in the catalog.
//
// Sources: realoem catalog identifier transitions cross-checked against
// scripts/fixtures/realoem-vin-truth.json.
export const LCI_YEAR_THRESHOLDS: Record<string, number> = {
  E60: 2008, E61: 2008,
  E70: 2010,
  E71: 2012,
  E81: 2007, E82: 2008, E87: 2007, E88: 2008,
  E83: 2006,
  E90: 2009, E91: 2009, E92: 2010, E93: 2010,
  F01: 2013, F02: 2013, F04: 2013,
  F06: 2015, F12: 2015, F13: 2015,
  F07: 2014, F18: 2014,
  F10: 2014, F11: 2014,
  F20: 2015, F21: 2015,
  F22: 2018, F23: 2018,
  F25: 2014, F26: 2014,
  F30: 2016, F31: 2016, F34: 2017, F35: 2016,
  F32: 2017, F33: 2017, F36: 2017,
  F45: 2018, F46: 2018,
  F48: 2019, F49: 2019,
  F52: 2019,
  F80: 2017, F82: 2018, F83: 2018, F87: 2018,
  G11: 2020, G12: 2020,
  G30: 2021, G31: 2021, G38: 2021,
  G05: 2024, G06: 2024, G07: 2023,
  I01: 2018,
  R55: 2010, R56: 2010, R57: 2010,
};

// Returns the year-appropriate base/LCI variant pair for a chassis, in
// preference order. Always returns the input chassis as one of the entries
// (so it stays a valid lookup target).
export function lciVariants(chassis: string, modelYear: number | null): string[] {
  if (!chassis) return [];
  const upper = chassis.toUpperCase();
  const base = upper.endsWith("N") ? upper.slice(0, -1) : upper;
  const lci = base + "N";
  // Chassis without a known LCI threshold: just return as-is.
  const threshold = LCI_YEAR_THRESHOLDS[base];
  if (!threshold) {
    return upper === base ? [base, lci] : [lci, base];
  }
  if (modelYear == null) {
    // Without a year, keep the input variant first but fall back to the other.
    return upper === base ? [base, lci] : [lci, base];
  }
  return modelYear >= threshold ? [lci, base] : [base, lci];
}

// Set of chassis whose VDS code is shared between an M-division car and a
// non-M car (e.g. 73AK = G80 M3 in WBS, but F44 228iX in WBA). When the WMI
// is not WBS we must NOT use the curated M-car pattern; bmw_models is the
// authoritative source for the non-M variant.
const M_DIVISION_CHASSIS = new Set([
  "G80", "G81", "G82", "G83", "G87",
  "F80", "F82", "F83", "F87", "F87N",
  "F90", "F95", "F96", "F97", "F98",
  "G90",
  "E92N", "E93N", // LCI E92/E93 M3
]);

// Chassis that ship exclusively in one drive configuration in all markets.
// Used as a last-resort fallback when neither the VDS pattern nor the
// model name contains an explicit xDrive / sDrive qualifier.
// Only list chassis with NO dual-drive variant in any market — e.g.
// X6 has never been offered as sDrive; X3 G01 is excluded because it
// had a sDrive30i variant.
const CHASSIS_DRIVE_TYPE_MAP: Record<string, "AWD" | "RWD"> = {
  // X6 family — always xDrive
  E71: "AWD", F16: "AWD", G06: "AWD", G06N: "AWD",
  // X4 family — always xDrive in US (sDrive20i is EU-only)
  F26: "AWD", G02: "AWD", G02N: "AWD",
  // X7 — always xDrive
  G07: "AWD", G07N: "AWD",
  // XM — always AWD
  G09: "AWD",
  // iX — always AWD (dual-motor)
  I20: "AWD",
  // X5 M / X6 M / X3 M / X4 M — always AWD
  F95: "AWD", F96: "AWD", F97: "AWD", F98: "AWD",
  // M5 G90 — always AWD
  G90: "AWD",
};

// Derive driveType from the model name string, e.g. "X3 xDrive30i" → "AWD",
// "X3 sDrive30i" → "RWD". Returns null when the name gives no useful signal.
function deriveDriveTypeFromModelName(name: string | null): "AWD" | "RWD" | null {
  if (!name) return null;
  if (/xDrive/i.test(name)) return "AWD";
  if (/sDrive/i.test(name)) return "RWD";
  return null;
}

const CHASSIS_ENGINE_MAP: Record<string, string> = {
  G80: "S58", G81: "S58", G82: "S58", G83: "S58", G87: "S58",
  F80: "S55", F82: "S55", F83: "S55", F87: "S55", F87N: "S55",
  F90: "S63", F95: "S63", F96: "S63",
  G20: "B48", G22: "B48", G42: "B48",
  G01: "B48", G05: "B58", G06: "B58",
  F40: "B48", F97: "S58", F98: "S58",
  E82: "N54", E88: "N54", E90: "N54", E91: "N54", E92: "N54", E93: "N54",
  F10: "N55", F11: "N55", F30: "N55", F31: "N55", F32: "N55", F33: "N55",
  F20: "N55", F21: "N55", F22: "N20", F23: "N20", F25: "N55", F15: "N55", F16: "N55",
  E70: "N55", E71: "N55", E83: "N52", E60: "N54", E87: "N52",
};

export interface VinDecodeResult {
  vin: string;
  last7: string;
  isValid: boolean;
  validationErrors: string[];
  manufacturer: string | null;
  division: string | null;
  modelYear: number | null;
  plant: { code: string; city: string; country: string } | null;
  chassis: string | null;
  series: string | null;
  generation: string | null;
  bodyType: string | null;
  modelName: string | null;
  engine: string | null;
  engineFamily: string | null;
  driveType: string | null;
  productionSequence: string | null;
  isBmw: boolean;
  wmi: string;
  vds: string;
  vis: string;
  typeCode: string | null;
  typeCodeSource: "vds_pattern" | "bmw_models" | "bmw_models_prefix" | null;
  // "fresh" = curated VDS pattern OR pre-2020 ETK row (trustworthy);
  // "stale" = post-2020 model year with only ETK data (ETK snapshot is
  //   2020-01, so a UI hint should suggest confirming via bimmer.work);
  // "unknown" = couldn't resolve a model year at all.
  dataFreshness: "fresh" | "stale" | "unknown";
  nhtsaData: NhtsaData | null;
}

// ETK snapshot cutoff. Anything newer than this is likely missing or
// outdated in our local bmw_models table and should fall back to live
// sources (bimmer.work / mdecoder / vindecoderz).
export const ETK_DATA_CUTOFF_YEAR = 2020;

export interface NhtsaData {
  make: string | null;
  model: string | null;
  modelYear: string | null;
  bodyClass: string | null;
  vehicleType: string | null;
  plantCity: string | null;
  plantCountry: string | null;
  series: string | null;
  trim: string | null;
  driveType: string | null;
  engineBrakeHp: string | null;
  doors: string | null;
  grossVehicleWeight: string | null;
  abs: string | null;
  esc: string | null;
  tractionControl: string | null;
  tpms: string | null;
  allFields: Record<string, string>;
}

// Single source of truth: shared/vin-check-digit.ts
import { isValidVin as _sharedIsValidVin } from "../shared/vin-check-digit";
function validateVinChecksum(vin: string): boolean {
  return _sharedIsValidVin(vin);
}

function validateVin(vin: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (vin.length !== 17) {
    errors.push(`VIN must be 17 characters (got ${vin.length})`);
  }

  if (/[IOQ]/i.test(vin)) {
    errors.push("VIN cannot contain letters I, O, or Q");
  }

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    errors.push("VIN contains invalid characters");
  }

  if (errors.length === 0 && !validateVinChecksum(vin)) {
    errors.push("Check digit (position 9) is invalid");
  }

  return { isValid: errors.length === 0, errors };
}

function lookupWmi(wmi: string): { manufacturer: string; division: string } | null {
  if (wmi.length < 3) return null;
  if (BMW_WMI[wmi]) return BMW_WMI[wmi];
  const wmi3 = wmi.substring(0, 3);
  if (BMW_WMI[wmi3]) return BMW_WMI[wmi3];
  return null;
}

function isBmwWmi(wmi: string): boolean {
  return lookupWmi(wmi) !== null;
}

export async function fetchNhtsaData(vin: string): Promise<NhtsaData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const results: { Variable: string; Value: string | null }[] = data.Results || [];

    const allFields: Record<string, string> = {};
    for (const r of results) {
      if (r.Value && r.Value.trim() && r.Value !== "Not Applicable") {
        allFields[r.Variable] = r.Value.trim();
      }
    }

    return {
      make: allFields["Make"] || null,
      model: allFields["Model"] || null,
      modelYear: allFields["Model Year"] || null,
      bodyClass: allFields["Body Class"] || null,
      vehicleType: allFields["Vehicle Type"] || null,
      plantCity: allFields["Plant City"] || null,
      plantCountry: allFields["Plant Country"] || null,
      series: allFields["Series"] || null,
      trim: allFields["Trim"] || null,
      driveType: allFields["Drive Type"] || null,
      engineBrakeHp: allFields["Engine Brake (hp) From"] || null,
      doors: allFields["Doors"] || null,
      grossVehicleWeight: allFields["Gross Vehicle Weight Rating From"] || null,
      abs: allFields["Anti-lock Braking System (ABS)"] || null,
      esc: allFields["Electronic Stability Control (ESC)"] || null,
      tractionControl: allFields["Traction Control"] || null,
      tpms: allFields["Tire Pressure Monitoring System (TPMS) Type"] || null,
      allFields,
    };
  } catch {
    return null;
  }
}

export async function decodeVin(input: string): Promise<VinDecodeResult> {
  const cleaned = input.toUpperCase().replace(/[\s\-]/g, "");

  if (cleaned.length === 7) {
    return decodeLast7(cleaned);
  }

  const { isValid, errors } = validateVin(cleaned);

  const wmi = cleaned.substring(0, 3);
  const vds = cleaned.substring(3, 9);
  const vis = cleaned.substring(9, 17);

  const wmiInfo = lookupWmi(wmi);
  const bmw = isBmwWmi(wmi);

  const yearCode = cleaned[9];

  const plantCode = cleaned[10];
  const plant = BMW_PLANTS[plantCode]
    ? { code: plantCode, ...BMW_PLANTS[plantCode] }
    : null;

  // An unknown plant character is informational, not a sign of a malformed VIN.
  // Real corruption is already caught by the length / character-set / checksum
  // checks in validateVin(). Surfacing this as an "errors" entry produced
  // false-positive yellow validation banners on legitimate decodes (e.g. BMW
  // M GmbH VINs whose pos-11 character we don't have in BMW_PLANTS yet).

  const last7 = cleaned.substring(10, 17);
  const productionSequence = cleaned.substring(11, 17);

  // NHTSA is no longer used in the hot decode path for any WMI.
  // driveType gaps are now closed locally via model-name parsing
  // (xDrive → AWD, sDrive → RWD) and CHASSIS_DRIVE_TYPE_MAP.
  // fetchNhtsaData remains available for on-demand admin/debug use
  // via the /api/vin/nhtsa/:vin endpoint.
  const nhtsaPromise: Promise<NhtsaData | null> = Promise.resolve(null);

  let chassis: string | null = null;
  let series: string | null = null;
  let generation: string | null = null;
  let bodyType: string | null = null;
  let modelName: string | null = null;
  let driveType: string | null = null;
  let engine: string | null = null;
  let engineFamily: string | null = null;
  let typeCode: string | null = null;
  let typeCodeSource: "vds_pattern" | "bmw_models" | "bmw_models_prefix" | null = null;

  if (bmw) {
    const vdsCode = cleaned.substring(3, 7);
    const wmi3 = wmi.substring(0, 3);
    // M-division WMIs: WBS (German M GmbH) and 5UM (Spartanburg M).
    const isMDivisionWmi = wmi3 === "WBS" || wmi3 === "5UM";

    // bmw_models is broad (6,560 entries from BMW ETK) but contains some
    // wrong rows for shared VDS codes. BMW_VDS_PATTERNS is hand-curated and
    // takes priority where present, with one exception: VDS codes that map
    // to an M-division chassis must only resolve to that chassis when the
    // WMI is also M-division. Otherwise the same VDS belongs to a non-M car
    // (e.g. 73AK is G80 M3 in WBS but F44 228iX in WBA).
    const fromBmwModels = await lookupBmwModelsTypeCode(vdsCode);
    const pattern = BMW_VDS_PATTERNS[vdsCode];
    const patternIsMCar = !!pattern && M_DIVISION_CHASSIS.has(pattern.chassis);
    const useCuratedPattern = !!pattern && (!patternIsMCar || isMDivisionWmi);

    if (useCuratedPattern && pattern) {
      typeCode = vdsCode;
      typeCodeSource = "vds_pattern";
      chassis = pattern.chassis;
      generation = pattern.generation;
      bodyType = pattern.bodyType;
      modelName = pattern.modelName;
      series = pattern.series;
      if (pattern.driveType) driveType = pattern.driveType;
      const engineCode = CHASSIS_ENGINE_MAP[chassis];
      if (engineCode) {
        engine = engineCode;
        engineFamily = BMW_ENGINE_FAMILIES[engineCode] || engineCode;
      }
      // Prefer the more specific engine code from bmw_models when it agrees
      // on chassis (e.g. "B58C" instead of generic "B58").
      if (
        fromBmwModels?.engineCode &&
        (fromBmwModels.chassis === chassis ||
          fromBmwModels.chassis === chassis.replace(/N$/, "") ||
          fromBmwModels.chassis === chassis + "N")
      ) {
        engine = fromBmwModels.engineCode;
        const family = Object.keys(BMW_ENGINE_FAMILIES).find((k) =>
          fromBmwModels.engineCode!.startsWith(k),
        );
        engineFamily = family
          ? BMW_ENGINE_FAMILIES[family]
          : fromBmwModels.engineCode;
      }
    } else if (fromBmwModels) {
      typeCode = fromBmwModels.matchedTypeCode;
      typeCodeSource = fromBmwModels.exact ? "bmw_models" : "bmw_models_prefix";
      chassis = fromBmwModels.chassis;
      generation = fromBmwModels.chassis;
      bodyType = fromBmwModels.bodyType || null;
      modelName = fromBmwModels.modelName;
      series = chassisToSeries(chassis, modelName);

      if (fromBmwModels.engineCode) {
        engine = fromBmwModels.engineCode;
        const family = Object.keys(BMW_ENGINE_FAMILIES).find((k) =>
          fromBmwModels.engineCode!.startsWith(k),
        );
        engineFamily = family
          ? BMW_ENGINE_FAMILIES[family]
          : fromBmwModels.engineCode;
      } else {
        const engineCode = CHASSIS_ENGINE_MAP[chassis];
        if (engineCode) {
          engine = engineCode;
          engineFamily = BMW_ENGINE_FAMILIES[engineCode] || engineCode;
        }
      }

      // Pattern still useful for series/driveType enrichment when it agrees
      // on chassis but bmw_models took priority for naming.
      if (pattern && !patternIsMCar) {
        if (!series) series = pattern.series;
        if (!driveType && pattern.driveType) driveType = pattern.driveType;
      }
    }

    // Local driveType fallback — avoids any external API call.
    // Priority: VDS pattern (already applied) > model name parse > chassis map.
    if (!driveType) {
      driveType = deriveDriveTypeFromModelName(modelName);
    }
    if (!driveType && chassis) {
      const chassisKey = chassis.toUpperCase();
      driveType = CHASSIS_DRIVE_TYPE_MAP[chassisKey] || null;
    }
  }

  const modelYear = disambiguateModelYear(yearCode, chassis);

  let nhtsaData: NhtsaData | null = null;
  let resolvedModelYear = modelYear;

  // Only block on NHTSA if we still need fields it can provide. When
  // bmw_models gave us an exact match AND we already have a model year, we
  // can return immediately and let NHTSA settle in the background.
  const needNhtsa = !chassis || !modelName || !resolvedModelYear || !driveType;
  if (needNhtsa) {
    nhtsaData = await nhtsaPromise;
    if (nhtsaData) {
      if (nhtsaData.modelYear) {
        const nhtsaYear = parseInt(nhtsaData.modelYear, 10);
        if (!isNaN(nhtsaYear) && nhtsaYear >= 1980) {
          resolvedModelYear = nhtsaYear;
        }
      }
      if (!chassis) {
        if (nhtsaData.series) series = nhtsaData.series;
        if (nhtsaData.model) modelName = nhtsaData.model;
        if (nhtsaData.bodyClass) bodyType = nhtsaData.bodyClass;
        if (nhtsaData.driveType) driveType = nhtsaData.driveType;
      } else if (!driveType && nhtsaData.driveType) {
        driveType = nhtsaData.driveType;
      }
    }
  } else {
    // Drain the in-flight NHTSA fetch to avoid unhandled rejections, but
    // don't block the response.
    nhtsaPromise.catch(() => {});
  }

  return {
    vin: cleaned,
    last7,
    isValid,
    validationErrors: errors,
    manufacturer: wmiInfo?.manufacturer || null,
    division: wmiInfo?.division || null,
    modelYear: resolvedModelYear,
    plant,
    chassis,
    series,
    generation,
    bodyType,
    modelName,
    engine,
    engineFamily,
    driveType,
    productionSequence,
    isBmw: bmw,
    wmi,
    vds,
    vis,
    typeCode,
    typeCodeSource,
    dataFreshness: computeDataFreshness(resolvedModelYear, typeCodeSource),
    nhtsaData,
  };
}

function computeDataFreshness(
  modelYear: number | null,
  typeCodeSource: "vds_pattern" | "bmw_models" | "bmw_models_prefix" | null,
): "fresh" | "stale" | "unknown" {
  if (modelYear == null) return "unknown";
  // Curated VDS patterns are hand-maintained for newer M cars and are
  // always considered fresh, even past the ETK cutoff.
  if (typeCodeSource === "vds_pattern") return "fresh";
  if (modelYear >= ETK_DATA_CUTOFF_YEAR) return "stale";
  return "fresh";
}

interface BmwModelsIndexEntry {
  chassis: string;
  modelName: string;
  bodyType: string | null;
  engineCode: string | null;
}

let bmwModelsIndex: Map<string, BmwModelsIndexEntry> | null = null;
let bmwModelsIndexBuiltAt = 0;
const BMW_MODELS_INDEX_TTL = 5 * 60 * 1000;

async function getBmwModelsIndex(): Promise<Map<string, BmwModelsIndexEntry>> {
  const now = Date.now();
  if (bmwModelsIndex && (now - bmwModelsIndexBuiltAt) < BMW_MODELS_INDEX_TTL) {
    return bmwModelsIndex;
  }
  try {
    const { storage } = await import("./storage");
    const all = await storage.getBmwModels();
    const idx = new Map<string, BmwModelsIndexEntry>();
    for (const m of all) {
      if (!m.typeCode) continue;
      const key = m.typeCode.toUpperCase();
      if (!idx.has(key)) {
        idx.set(key, {
          chassis: m.chassis,
          modelName: m.modelName,
          bodyType: m.bodyType || null,
          engineCode: m.engineCode || null,
        });
      }
    }
    bmwModelsIndex = idx;
    bmwModelsIndexBuiltAt = now;
    console.log(`[VIN Decoder] bmw_models index built: ${idx.size} unique type codes`);
    return idx;
  } catch (err) {
    console.error("[VIN Decoder] Failed to build bmw_models index:", err);
    return bmwModelsIndex || new Map();
  }
}

// Derive BMW series label from chassis prefix (E46 → "3 Series", G05 → "X5", etc.)
function chassisToSeries(chassis: string, modelName: string): string | null {
  const m = modelName.match(/^(X\d|Z\d|i\d|M\d)/i);
  if (m) return m[1].toUpperCase().replace(/^I/, "i");
  const c = chassis.toUpperCase().replace(/N$/, "");
  const map: Record<string, string> = {
    E81: "1 Series", E82: "1 Series", E87: "1 Series", E88: "1 Series",
    F20: "1 Series", F21: "1 Series", F40: "1 Series", F52: "1 Series",
    E36: "3 Series", E46: "3 Series", E90: "3 Series", E91: "3 Series", E92: "3 Series", E93: "3 Series",
    F30: "3 Series", F31: "3 Series", F34: "3 Series", F35: "3 Series", F80: "3 Series",
    G20: "3 Series", G21: "3 Series", G28: "3 Series", G80: "3 Series", G81: "3 Series",
    F22: "2 Series", F23: "2 Series", F44: "2 Series", F45: "2 Series", F46: "2 Series", F87: "2 Series",
    G42: "2 Series", G87: "2 Series",
    F32: "4 Series", F33: "4 Series", F36: "4 Series", F82: "4 Series", F83: "4 Series",
    G22: "4 Series", G23: "4 Series", G26: "4 Series", G82: "4 Series", G83: "4 Series",
    E39: "5 Series", E60: "5 Series", E61: "5 Series",
    F07: "5 Series", F10: "5 Series", F11: "5 Series", F18: "5 Series", F90: "5 Series",
    G30: "5 Series", G31: "5 Series", G38: "5 Series", G60: "5 Series", G61: "5 Series",
    E63: "6 Series", E64: "6 Series", F06: "6 Series", F12: "6 Series", F13: "6 Series", G32: "6 Series",
    E38: "7 Series", E65: "7 Series", E66: "7 Series", F01: "7 Series", F02: "7 Series",
    G11: "7 Series", G12: "7 Series", G70: "7 Series",
    E31: "8 Series", G14: "8 Series", G15: "8 Series", G16: "8 Series",
  };
  return map[c] || null;
}

export function invalidateBmwModelsIndex() {
  bmwModelsIndex = null;
  bmwModelsIndexBuiltAt = 0;
}

interface BmwModelsLookupResult {
  chassis: string;
  modelName: string;
  bodyType: string | null;
  engineCode: string | null;
  matchedTypeCode: string;
  exact: boolean;
}

export async function lookupBmwModelsTypeCode(vdsCode: string): Promise<BmwModelsLookupResult | null> {
  const idx = await getBmwModelsIndex();
  const upper = vdsCode.toUpperCase();
  const exact = idx.get(upper);
  if (exact) {
    return { ...exact, matchedTypeCode: upper, exact: true };
  }
  if (upper.length >= 3) {
    const prefix3 = upper.substring(0, 3);
    const candidates: { key: string; val: BmwModelsIndexEntry }[] = [];
    for (const [key, val] of idx) {
      if (key.startsWith(prefix3)) candidates.push({ key, val });
    }
    if (candidates.length === 0) return null;
    const chassis = candidates[0].val.chassis;
    if (!candidates.every(c => c.val.chassis === chassis)) return null;
    if (candidates.length === 1) {
      return { ...candidates[0].val, matchedTypeCode: candidates[0].key, exact: false };
    }
    // Multiple candidates same chassis: only return chassis-level info, no specific model name
    return {
      chassis,
      modelName: `${chassis} (${prefix3}xx variants)`,
      bodyType: null,
      engineCode: null,
      matchedTypeCode: prefix3,
      exact: false,
    };
  }
  return null;
}

export async function decodeLast7(last7: string): Promise<VinDecodeResult> {
  const cleaned = last7.toUpperCase().replace(/[\s\-]/g, "");

  const errors: string[] = [];
  if (cleaned.length !== 7) {
    errors.push("Last 7 must be exactly 7 characters");
  }
  if (!/^[A-HJ-NPR-Z0-9]{7}$/.test(cleaned)) {
    errors.push("Last 7 contains invalid characters");
  }

  const plantCode = cleaned[0];
  const plant = BMW_PLANTS[plantCode]
    ? { code: plantCode, ...BMW_PLANTS[plantCode] }
    : null;

  const productionSequence = cleaned.substring(1, 7);
  const validFormat = errors.length === 0;

  return {
    vin: "",
    last7: cleaned,
    isValid: validFormat,
    validationErrors: errors,
    manufacturer: validFormat ? "BMW" : null,
    division: null,
    modelYear: null,
    plant,
    chassis: null,
    series: null,
    generation: null,
    bodyType: null,
    modelName: null,
    engine: null,
    engineFamily: null,
    driveType: null,
    productionSequence,
    isBmw: validFormat,
    wmi: "",
    vds: "",
    vis: "",
    typeCode: null,
    typeCodeSource: null,
    dataFreshness: "unknown" as const,
    nhtsaData: null,
  };
}
